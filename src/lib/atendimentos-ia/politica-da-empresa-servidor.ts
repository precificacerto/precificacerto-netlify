/**
 * A LEITURA DA POLÍTICA DA EMPRESA. Duas fontes, nesta ordem:
 *
 *   1. A NATUREZA DA VARIÁVEL (`orcamentista_natureza_da_variavel`, migração `20261121000001`, dono do produto, 21/11/2026): por empresa e
 *      família, cada variável com a natureza dela (POLITICA com a opção em texto, ITEM, CALCULO). Existindo a tabela, é ELA que vale — também
 *      vazia para a empresa (nada definido), nunca completada pelos campos de antes. Na primeira fase as variáveis do motor valem para a família
 *      inteira (linha e formato só no VIDRO, pela CHECK da migração), e por isso a leitura é a da família.
 *   2. Sem a tabela (a migração não aplicada: 42P01/PGRST205), o caminho de 20/11/2026: a linha da empresa (`orcamentista_esquadrias_base`) sobre
 *      a do NICHO (`orcamentista_esquadrias_padrao`, pelo `orcamentista_config.nicho_id`), pelo mapa de `politica-da-empresa.ts`.
 *
 * A FAMÍLIA: o cálculo a informa (a da esquadria). Quem não a sabe (a folha e o orçamento descrevendo o arremate) recebe a da empresa quando ela
 * tem UMA família na natureza; com mais de uma, nenhuma política — a descrição não escolhe uma família pela outra.
 *
 * Lida pela etapa 1 (a folha do levantamento diz o que vai valer) e pela 2 (o cálculo aplica): uma leitura só, as duas leem o mesmo.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { politicaEfetiva, type PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'
import { naturezasPara, TABELA_DA_NATUREZA, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas da base são lidas como linha solta
const db = () => supabaseAdmin as any
const semTabela = (codigo: string | undefined) => codigo === '42P01' || codigo === 'PGRST205'

export async function lerPoliticaDaEmpresa(tenantId: string, familia: string | null = null): Promise<PoliticaDaEmpresa> {
    // as três na MESMA onda (as idas ao banco do cálculo não crescem): a natureza e, para o caso de ela não existir, a base e o nicho
    const [r, empresa, config] = await Promise.all([
        db().from(TABELA_DA_NATUREZA).select('familia, linha, formato, variavel, natureza, opcao_padrao').eq('tenant_id', tenantId),
        db().from('orcamentista_esquadrias_base').select('*').eq('tenant_id', tenantId).maybeSingle(),
        db().from('orcamentista_config').select('nicho_id').eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (r.error && !semTabela(r.error.code)) throw new Error(`${TABELA_DA_NATUREZA}: ${r.error.code ?? r.error.message}`)
    if (!r.error) {
        const linhas = ((r.data ?? []) as LinhaDaNatureza[]).filter((l) => l.variavel !== 'VIDRO')
        const familias = [...new Set(linhas.map((l) => l.familia))]
        const daFamilia = familia ?? (familias.length === 1 ? familias[0] : null)
        return { porVariavel: daFamilia === null ? {} : naturezasPara(linhas, { familia: daFamilia, linha: null, formato: null }) }
    }
    return lerPoliticaDaBase(empresa, config)
}

type Lida = { data: Record<string, unknown> | null; error: { message: string } | null }
async function lerPoliticaDaBase(empresa: Lida, config: Lida): Promise<PoliticaDaEmpresa> {
    if (empresa.error) throw new Error(`orcamentista_esquadrias_base: ${empresa.error.message}`)
    if (config.error) throw new Error(`orcamentista_config: ${config.error.message}`)
    let nicho: Record<string, unknown> | null = null
    if (config.data?.nicho_id) {
        const n = await db().from('orcamentista_esquadrias_padrao').select('*').eq('nicho_id', config.data.nicho_id).maybeSingle()
        if (n.error) throw new Error(`orcamentista_esquadrias_padrao: ${n.error.message}`)
        nicho = n.data ?? null
    }
    return politicaEfetiva(empresa.data ?? null, nicho)
}
