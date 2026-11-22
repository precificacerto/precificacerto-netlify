/**
 * A LEITURA do relatório de materiais (SÓ SERVIDOR). A montagem é pura e mora em `relatorio-de-materiais.ts`; a categoria e a ordem, em
 * `categoria-do-relatorio-servidor.ts` (a mesma do relatório de corte).
 *
 * - os itens do orçamento que valem (sem `removido_em`), do tenant;
 * - de cada item, os materiais do CÁLCULO VIGENTE (`calculo_id` do item): uma linha de material de um cálculo anterior não entra;
 * - a categoria de cada linha: a da tabela de onde o preço saiu, pelo código, o caminho e a família do item (`classificacaoDoRelatorio`).
 */
import { supabaseAdmin } from '@/supabase/admin'
import { classificacaoDoRelatorio, itensDoRelatorio, type LinhaAClassificar } from './categoria-do-relatorio-servidor'
import { linhasDoCalculoVigente, montarRelatorioDeMateriais, type MaterialGravado, type RelatorioDeMateriais } from './relatorio-de-materiais'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
/** O custo gravado: numeric vem como texto do PostgREST; vazio é null, nunca 0. */
const numeroOuNulo = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export type RelatorioDeMateriaisDoOrcamento = RelatorioDeMateriais & {
    /** Os itens sem cálculo vigente: os materiais deles não entram, e o relatório diz quais. */
    itensSemCalculo: number[]
}

export async function lerRelatorioDeMateriais(tenantId: string, orcamentoId: string): Promise<RelatorioDeMateriaisDoOrcamento> {
    const itens = await itensDoRelatorio(tenantId, orcamentoId)
    const calculados = itens.filter((i) => i.calculo_id)
    const itensSemCalculo = itens.filter((i) => !i.calculo_id).map((i) => i.ordem)

    const materiais: MaterialGravado[] = []
    const linhas: LinhaAClassificar[] = []
    const familiaDo = new Map(calculados.map((i) => [i.id, i.familia]))
    if (calculados.length) {
        const m = await db().from('orcamentista_orcamento_item_material')
            .select('orcamento_item_id, calculo_id, codigo_na_tabela, descricao, unidade_compra, consumo_item, caminho, custo_bruto_material, custo_liquido_material')
            .eq('tenant_id', tenantId).in('orcamento_item_id', calculados.map((i) => i.id))
        if (m.error) throw new Error(`orcamentista_orcamento_item_material: ${m.error.message}`)
        type Lida = Omit<MaterialGravado, 'consumo_item' | 'custo_bruto_material' | 'custo_liquido_material'> & {
            orcamento_item_id: string; calculo_id: string; consumo_item: number | string; custo_bruto_material: unknown; custo_liquido_material: unknown
        }
        for (const x of linhasDoCalculoVigente(calculados, (m.data ?? []) as Lida[])) {
            materiais.push({ codigo_na_tabela: x.codigo_na_tabela, descricao: x.descricao, unidade_compra: x.unidade_compra, consumo_item: Number(x.consumo_item), caminho: x.caminho,
                custo_bruto_material: numeroOuNulo(x.custo_bruto_material), custo_liquido_material: numeroOuNulo(x.custo_liquido_material) })
            linhas.push({ codigo: x.codigo_na_tabela, caminho: x.caminho, familia: familiaDo.get(x.orcamento_item_id) ?? null })
        }
    }
    const c = await classificacaoDoRelatorio(tenantId, linhas, itens.map((i) => i.familia).filter((f): f is string => !!f))
    return { ...montarRelatorioDeMateriais(materiais, c.categoriasDoCodigo, c.motivos, c.ordem, c.rotulos), itensSemCalculo }
}
