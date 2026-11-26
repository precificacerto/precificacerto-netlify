/**
 * A LEITURA do relatório de corte (SÓ SERVIDOR). A montagem é pura e mora em `relatorio-de-corte.ts`; a categoria e a ordem, em
 * `categoria-do-relatorio-servidor.ts` (a mesma do relatório de materiais).
 *
 * As peças são as do CÁLCULO VIGENTE de cada item (`orcamentista_orcamento_item_peca`, 20261117000001). Sem a tabela (a migração pendente),
 * o relatório diz isso em vez de quebrar; o item calculado ANTES dela não tem peça gravada, e o relatório diz quais itens precisam ser
 * recalculados — nada é recalculado aqui.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { tabelaAusente } from './orcamentos-ia'
import { classificacaoDoRelatorio, itensDoRelatorio } from './categoria-do-relatorio-servidor'
import { linhasDoCalculoVigente } from './relatorio-de-materiais'
import { montarRelatorioDeCorte, type PecaDoCorte, type RelatorioDeCorte } from './relatorio-de-corte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any

export const TABELA_DAS_PECAS = 'orcamentista_orcamento_item_peca'
export const FRASE_SEM_MIGRACAO_DO_CORTE = 'O relatório de corte ainda não está disponível: a estrutura do banco (migração 20261117000001) não foi aplicada.'

export type RelatorioDeCorteDoOrcamento =
    | (RelatorioDeCorte & {
        /** Os itens sem cálculo. */
        itensSemCalculo: number[]
        /** Os itens calculados sem peça gravada (calculados antes do relatório de corte existir): recalcule para ter o corte. */
        itensSemPecas: number[]
    })
    | { semMigracao: string }

const numero = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

export async function lerRelatorioDeCorte(tenantId: string, orcamentoId: string): Promise<RelatorioDeCorteDoOrcamento> {
    const itens = await itensDoRelatorio(tenantId, orcamentoId)
    const calculados = itens.filter((i) => i.calculo_id)
    const itensSemCalculo = itens.filter((i) => !i.calculo_id).map((i) => i.ordem)
    type Linha = PecaDoCorte & { orcamento_item_id: string; calculo_id: string }
    const corDo = new Map(itens.map((i) => [i.id, i.cor_perfil ?? null]))
    let linhas: Linha[] = []
    if (calculados.length) {
        const p = await db().from(TABELA_DAS_PECAS)
            .select('orcamento_item_id, calculo_id, ordem, perfil, codigo, descricao, comprimento_mm, quantidade_por_esquadria, quantidade, corte, posicao, comprimento_barra_mm, serra_mm')
            .eq('tenant_id', tenantId).in('orcamento_item_id', calculados.map((i) => i.id)).order('ordem')
        if (p.error && tabelaAusente(p.error)) return { semMigracao: FRASE_SEM_MIGRACAO_DO_CORTE }
        if (p.error) throw new Error(`${TABELA_DAS_PECAS}: ${p.error.message}`)
        linhas = linhasDoCalculoVigente(calculados, (p.data ?? []) as Array<Record<string, unknown> & { orcamento_item_id: string; calculo_id: string }>)
            .map((x) => ({
                orcamento_item_id: x.orcamento_item_id, calculo_id: x.calculo_id,
                perfil: String(x.perfil), codigo: String(x.codigo), descricao: (x.descricao as string | null) ?? null,
                comprimento_mm: Number(x.comprimento_mm), quantidade_por_esquadria: Number(x.quantidade_por_esquadria), quantidade: Number(x.quantidade),
                corte: (x.corte as string | null) ?? null, posicao: (x.posicao as string | null) ?? null,
                comprimento_barra_mm: numero(x.comprimento_barra_mm), serra_mm: Number(x.serra_mm),
                // a cor do item decide o refilo (pedido 0034): a mesma das barras do pedido
                cor: corDo.get(x.orcamento_item_id) ?? null,
            }))
    }
    const comPecas = new Set(linhas.map((l) => l.orcamento_item_id))
    const itensSemPecas = calculados.filter((i) => !comPecas.has(i.id)).map((i) => i.ordem)
    // a peça de corte é PERFIL: a categoria é a da tabela de onde o preço do perfil saiu (a mesma regra do relatório de materiais)
    const familiaDo = new Map(itens.map((i) => [i.id, i.familia]))
    const c = await classificacaoDoRelatorio(tenantId, linhas.map((l) => ({ codigo: l.codigo, caminho: 'perfil', familia: familiaDo.get(l.orcamento_item_id) ?? null })),
        itens.map((i) => i.familia).filter((f): f is string => !!f))
    return { ...montarRelatorioDeCorte(linhas, c.categoriasDoCodigo, c.ordem, c.rotulos), itensSemCalculo, itensSemPecas }
}
