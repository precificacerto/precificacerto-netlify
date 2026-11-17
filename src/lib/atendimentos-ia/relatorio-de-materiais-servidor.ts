/**
 * A LEITURA do relatório de materiais (SÓ SERVIDOR). A montagem é pura e mora em `relatorio-de-materiais.ts`; a categoria e a ordem, em
 * `categoria-do-relatorio-servidor.ts` (a mesma do relatório de corte).
 *
 * - os itens do orçamento que valem (sem `removido_em`), do tenant;
 * - de cada item, os materiais do CÁLCULO VIGENTE (`calculo_id` do item): uma linha de material de um cálculo anterior não entra.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { classificacaoDoRelatorio, itensDoRelatorio } from './categoria-do-relatorio-servidor'
import { linhasDoCalculoVigente, montarRelatorioDeMateriais, type MaterialGravado, type RelatorioDeMateriais } from './relatorio-de-materiais'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any

export type RelatorioDeMateriaisDoOrcamento = RelatorioDeMateriais & {
    /** Os itens sem cálculo vigente: os materiais deles não entram, e o relatório diz quais. */
    itensSemCalculo: number[]
}

export async function lerRelatorioDeMateriais(tenantId: string, orcamentoId: string): Promise<RelatorioDeMateriaisDoOrcamento> {
    const itens = await itensDoRelatorio(tenantId, orcamentoId)
    const calculados = itens.filter((i) => i.calculo_id)
    const itensSemCalculo = itens.filter((i) => !i.calculo_id).map((i) => i.ordem)

    let materiais: MaterialGravado[] = []
    if (calculados.length) {
        const m = await db().from('orcamentista_orcamento_item_material')
            .select('orcamento_item_id, calculo_id, codigo_na_tabela, descricao, unidade_compra, consumo_item, caminho')
            .eq('tenant_id', tenantId).in('orcamento_item_id', calculados.map((i) => i.id))
        if (m.error) throw new Error(`orcamentista_orcamento_item_material: ${m.error.message}`)
        materiais = linhasDoCalculoVigente(calculados, (m.data ?? []) as Array<MaterialGravado & { orcamento_item_id: string; calculo_id: string; consumo_item: number | string }>)
            .map((x) => ({ codigo_na_tabela: x.codigo_na_tabela, descricao: x.descricao, unidade_compra: x.unidade_compra, consumo_item: Number(x.consumo_item), caminho: x.caminho }))
    }
    const c = await classificacaoDoRelatorio(tenantId, materiais.map((x) => x.codigo_na_tabela), itens.map((i) => i.familia).filter((f): f is string => !!f))
    return { ...montarRelatorioDeMateriais(materiais, c.categoriasDoCodigo, c.ordem, c.rotulos), itensSemCalculo }
}
