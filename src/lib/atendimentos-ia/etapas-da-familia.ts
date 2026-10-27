/**
 * As ETAPAS de uma família — a leitura. SÓ SERVIDOR (`supabaseAdmin`). A gravação é a função
 * `superadmin_gravar_etapas_da_familia` (migração 20261027000003), chamada pela rota; aqui só se lê.
 *
 * Etapa é do CATÁLOGO da plataforma (por família), não de uma empresa: número, rótulo livre, ação da lista
 * fechada, instrução e as abas da planilha que ela carrega (`src/utils/atendimentos-ia-etapas.ts`). Nada
 * disto muda o cálculo: quem lê as etapas na conversa é o PR D.
 *
 * Família que não existe é `null` — a rota responde 404. Família sem etapa é a lista vazia: ainda não foi cadastrada.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { ABAS_DA_ETAPA, ehAcaoDaEtapa, type AbaDaEtapa, type EtapaDaFamilia } from '@/utils/atendimentos-ia-etapas'

// O cliente admin não tem os tipos destas tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

async function ler(onde: string, p: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<unknown> {
    const { data, error } = await p
    if (error) throw new Error(`${onde}: ${error.message ?? 'erro do banco'}`)
    return data
}

export async function lerEtapasDaFamilia(familia: string): Promise<EtapaDaFamilia[] | null> {
    const existe = (await ler('orcamentista_familia_catalogo', db().from('orcamentista_familia_catalogo').select('chave').eq('chave', familia).maybeSingle())) as Linha | null
    if (!existe) return null
    const linhas = ((await ler('orcamentista_familia_etapa',
        db().from('orcamentista_familia_etapa').select('id, numero, rotulo, acao, instrucao, abas').eq('familia', familia).order('numero', { ascending: true }))) ?? []) as Linha[]
    return linhas.map((l) => {
        // a CHECK do banco garante a ação e as abas; se uma linha fugir disso, é erro — nunca uma etapa sem ação
        if (!ehAcaoDaEtapa(l.acao)) throw new Error(`orcamentista_familia_etapa: a etapa ${l.numero} tem a ação "${String(l.acao)}", que não é da lista`)
        const abas = ((l.abas ?? []) as unknown[]).filter((a): a is AbaDaEtapa => typeof a === 'string' && (ABAS_DA_ETAPA as readonly string[]).includes(a))
        return { id: String(l.id), numero: Number(l.numero), rotulo: String(l.rotulo), acao: l.acao, instrucao: String(l.instrucao ?? ''), abas }
    })
}
