/**
 * customer-history-chain.ts — a CADEIA orçamento → pedido → venda no Histórico do Cliente.
 *
 * A REGRA
 * -------
 * O histórico mostra apenas a ÚLTIMA EVOLUÇÃO de cada cadeia. É proibido exibir a MESMA
 * operação em mais de uma seção. Para cada cadeia, aparece só o documento MAIS AVANÇADO:
 * virou venda, mostra a venda; parou no pedido, mostra o pedido; parou no orçamento, mostra o
 * orçamento.
 *
 * O caso que a originou: PED-CDFBBE e VD-A2DF4A são a MESMA operação (mesmo orçamento
 * e2e07aaa, mesmo R$ 156,64) e apareciam as duas.
 *
 * A DEDUÇÃO É POR CADEIA, NUNCA POR VALOR — e isso é medição, não precaução
 * -------------------------------------------------------------------------
 * O Felipe Klein tem TRÊS documentos de R$ 156,64 em DUAS cadeias independentes: a de
 * 852094a7 (que virou VD-A2DF4A) e a de 55d1a851 (que virou VD-6564FC, cancelada). Deduplicar
 * por valor fundiria duas operações distintas numa só.
 *
 * O ORÇAMENTO-ESPELHO FAZ PARTE DA CADEIA
 * ----------------------------------------
 * Ao enviar para venda o sistema cria um orçamento ESPELHO, então uma cadeia tem DOIS
 * orçamentos: o original e o espelho. Quem os liga é `orders.original_budget_id`. A cadeia do
 * R$ 156,64 tem QUATRO documentos — ORC-8520 (original, SENT_TO_ORDER), ORC-E2E0 (espelho,
 * PAID), PED-CDFBBE e VD-A2DF4A. Medido: agrupar por `budget_id` puro dá OITO cadeias no
 * Felipe Klein e deixa o ORC-8520 sozinho na tela; agrupar pela raiz dá SETE.
 *
 * QUAIS VÍNCULOS EXISTEM DE VERDADE — e é por isso que a raiz é um budget
 * -----------------------------------------------------------------------
 * Medido na base inteira em 08/09/2026:
 *
 *   `sales.order_id`             0 de 94   — a coluna existe e NENHUM caminho a escreve
 *   `orders.sale_id`             1 de 20   — só o PED-CDFBBE
 *   `orders.budget_id`          20 de 20
 *   `orders.original_budget_id` 20 de 20
 *
 * Os dois ponteiros DIRETOS estão praticamente vazios; nenhum serve como critério geral. O que
 * está sempre preenchido é o vínculo com o orçamento — por isso a raiz da cadeia é um budget, e
 * o caso do Felipe Klein é resolvido sem depender do `sale_id`:
 * `PED-CDFBBE.budget_id = e2e07aaa = VD-A2DF4A.budget_id`.
 *
 * IRMÃOS SÃO OPERAÇÕES DISTINTAS, E TODOS APARECEM
 * -------------------------------------------------
 * Quando a cadeia MORREU NO PEDIDO e há vários pedidos na mesma raiz — os três de R$ 301,88 do
 * 1e94a200 —, os três aparecem. **São três tentativas que morreram, não uma repetida.** A regra
 * proíbe exibir a MESMA operação duas vezes; esconder duas apagaria rastro que a auditoria
 * precisa. Quando a cadeia TERMINOU EM VENDA, some tudo o que veio antes, irmãos cancelados
 * inclusive: a cadeia terminou ali.
 *
 * Medido: 12 dos 20 pedidos da base estão em cadeias multi-pedido — 60%, não caso de borda. A
 * maior tem SETE pedidos (raiz b220f9f6). As sete linhas aparecem; a legibilidade se resolve
 * DIFERENCIANDO as linhas por código e data, nunca escondendo seis.
 * E o inverso nunca ocorre: ZERO cadeias com mais de uma venda.
 */

/** Os três estágios, na ordem em que uma cadeia avança. */
export type ChainStage = 'ORCAMENTO' | 'PEDIDO' | 'VENDA'

/** O quanto cada estágio avançou. Números maiores vencem — é o que "mais avançado" quer dizer. */
export const STAGE_RANK: Record<ChainStage, number> = {
    ORCAMENTO: 1,
    PEDIDO: 2,
    VENDA: 3,
}

export interface BudgetRow {
    id: string
    sale_id?: string | null
    created_at?: string | null
}

export interface OrderRow {
    id: string
    budget_id?: string | null
    original_budget_id?: string | null
    sale_id?: string | null
    created_at?: string | null
}

export interface SaleRow {
    id: string
    budget_id?: string | null
    created_at?: string | null
}

/** Quantos irmãos a linha tem, para a tela poder diferenciá-los em vez de escondê-los. */
export interface SiblingInfo {
    /** Posição desta linha entre os irmãos, 1-based, ordenada por `created_at`. */
    posicao: number
    /** Quantos irmãos ao todo. `1` quando a linha está sozinha no estágio. */
    total: number
}

export interface ChainIndex {
    /** Ids dos documentos que DEVEM aparecer. Quem não está aqui é etapa superada da cadeia. */
    visiveis: Set<string>
    /** Raiz da cadeia de cada documento. Ausente ⇒ documento avulso (venda de balcão/agenda). */
    raizPorDocumento: Map<string, string>
    /** Só para documentos visíveis que têm irmãos no mesmo estágio. */
    irmaosPorDocumento: Map<string, SiblingInfo>
}

/**
 * Resolve os apelidos de orçamento: original e espelho apontam para a MESMA raiz.
 *
 * A raiz canônica é o ORIGINAL — é ele que existiu primeiro e é o que o usuário reconhece.
 * Quando `original_budget_id` e `budget_id` coincidem (17 dos 20 pedidos), não há espelho e a
 * função é identidade.
 */
function montarRaizes(orders: readonly OrderRow[]): Map<string, string> {
    const raiz = new Map<string, string>()
    for (const o of orders) {
        const original = o.original_budget_id || o.budget_id
        if (!original) continue
        raiz.set(original, original)
        if (o.budget_id) raiz.set(o.budget_id, original)
    }
    return raiz
}

const resolverRaiz = (raizes: Map<string, string>, budgetId?: string | null): string | null =>
    budgetId ? raizes.get(budgetId) || budgetId : null

/** Ordena por `created_at`; entrada sem data vai para o fim sem quebrar a ordem das outras. */
const porData = (a: { created_at?: string | null }, b: { created_at?: string | null }): number =>
    (a.created_at || '9999').localeCompare(b.created_at || '9999')

/**
 * Monta o índice de exibição do histórico.
 *
 * O CRITÉRIO É UM SÓ, e dele saem os três comportamentos decididos: **aparece todo documento
 * cujo estágio é o MÁXIMO da sua cadeia.**
 *
 *   - cadeia que virou venda  → o estágio máximo é VENDA, então só a venda passa; pedidos e
 *                               orçamentos da cadeia somem, irmãos cancelados inclusive
 *   - cadeia morta no pedido  → o máximo é PEDIDO, e TODOS os pedidos daquela raiz passam
 *   - cadeia morta no orçamento → passa o orçamento
 *   - venda avulsa (sem `budget_id`) → não tem cadeia, sempre passa
 *
 * PRECISA RECEBER A CADEIA COMPLETA. Filtrar por status ANTES de chamar esta função quebra o
 * cálculo: um pedido cancelado removido da entrada faria a cadeia concluir que o topo é o
 * orçamento. O filtro de status é aplicado DEPOIS, sobre o resultado.
 */
export function buildChainIndex(input: {
    budgets: readonly BudgetRow[]
    orders: readonly OrderRow[]
    sales: readonly SaleRow[]
}): ChainIndex {
    const raizes = montarRaizes(input.orders)

    type Doc = { id: string; stage: ChainStage; raiz: string | null; created_at?: string | null }
    const docs: Doc[] = [
        ...input.budgets.map((b) => ({
            id: b.id,
            stage: 'ORCAMENTO' as ChainStage,
            raiz: resolverRaiz(raizes, b.id),
            created_at: b.created_at,
        })),
        ...input.orders.map((o) => ({
            id: o.id,
            stage: 'PEDIDO' as ChainStage,
            raiz: resolverRaiz(raizes, o.original_budget_id || o.budget_id),
            created_at: o.created_at,
        })),
        ...input.sales.map((s) => ({
            id: s.id,
            stage: 'VENDA' as ChainStage,
            raiz: resolverRaiz(raizes, s.budget_id),
            created_at: s.created_at,
        })),
    ]

    // Estágio mais avançado de cada cadeia.
    const topoDaCadeia = new Map<string, number>()
    for (const d of docs) {
        if (!d.raiz) continue
        const rank = STAGE_RANK[d.stage]
        if (rank > (topoDaCadeia.get(d.raiz) ?? 0)) topoDaCadeia.set(d.raiz, rank)
    }

    const visiveis = new Set<string>()
    const raizPorDocumento = new Map<string, string>()
    const irmaosPorDocumento = new Map<string, SiblingInfo>()
    const porCadeiaEEstagio = new Map<string, Doc[]>()

    for (const d of docs) {
        if (!d.raiz) {
            // Sem cadeia: venda de balcão ou agenda. Não há etapa anterior a superar.
            visiveis.add(d.id)
            continue
        }
        raizPorDocumento.set(d.id, d.raiz)
        if (STAGE_RANK[d.stage] !== topoDaCadeia.get(d.raiz)) continue
        visiveis.add(d.id)
        const chave = `${d.raiz}|${d.stage}`
        const lista = porCadeiaEEstagio.get(chave)
        if (lista) lista.push(d)
        else porCadeiaEEstagio.set(chave, [d])
    }

    for (const lista of porCadeiaEEstagio.values()) {
        if (lista.length < 2) continue
        const ordenados = [...lista].sort(porData)
        ordenados.forEach((d, i) => {
            irmaosPorDocumento.set(d.id, { posicao: i + 1, total: ordenados.length })
        })
    }

    return { visiveis, raizPorDocumento, irmaosPorDocumento }
}
