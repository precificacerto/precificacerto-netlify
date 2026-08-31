/**
 * document-consolidated-amounts.ts — consolidados de comissão, lucro e RT de um
 * documento (orçamento / pedido / venda), em R$.
 *
 * NÃO é a cascata / motor RRO. Este módulo apenas CONSOLIDA o que a distribuição
 * residual já produziu, e congela a alíquota efetiva de RT na travessia
 * orçamento → pedido → orçamento-espelho → venda.
 *
 * Regra do dono do produto (D5): o pedido é espelho do orçamento na ESTRUTURA DE
 * CÁLCULO — mesmo motor, mesma composição de percentuais, mesma forma de aplicar
 * desconto — NÃO nos valores. O pedido aceita itens novos e desconto próprio, então
 * um total diferente do orçamento de origem é funcionamento normal, nunca divergência.
 * Por isso o consolidado é RECALCULADO a cada gravação: recalcular é o que mantém o
 * espelho estrutural. Não existe, e não deve existir, aviso de "valor alterado".
 *
 * Princípio herdado do D17: o que é gravado é o que a tela exibe. `commissionAmount`
 * e `profitAmount` saem da MESMA `ResidualDistribution` que alimenta o bloco de
 * Distribuição Residual na tela — nunca de um segundo caminho de cálculo que possa
 * divergir do número exibido.
 */

/** Linha da distribuição residual — só o campo que interessa aqui. */
export interface ResidualAmountLine {
    amount: number
}

export interface ConsolidatedAmountsInput {
    /**
     * Distribuição residual do documento, já pós-desconto — a mesma instância que a
     * tela renderiza (`useResidualDistribution`).
     */
    distribution: {
        commission: ResidualAmountLine
        profit: ResidualAmountLine
    } | null | undefined
    /** RT consolidado congelado no documento de ORIGEM (R$). */
    sourceRtAmount: number
    /** Total pós-desconto sobre o qual `sourceRtAmount` foi congelado (R$). */
    sourceTotal: number
    /** Total pós-desconto do documento ATUAL (R$). */
    currentTotal: number
}

export interface ConsolidatedAmounts {
    commissionAmount: number
    profitAmount: number
    rtAmount: number
}

/** Arredonda para 2 casas — as colunas são NUMERIC(12,2). */
function round2(v: number): number {
    if (!Number.isFinite(v)) return 0
    return Math.round(v * 100) / 100
}

/**
 * Alíquota efetiva CONGELADA de RT = rt_amount ÷ total pós-desconto (EPIC-RT v8).
 *
 * É escala-invariante: reaplicá-la sobre um novo total e recongelar devolve a mesma
 * alíquota, então salvar o mesmo pedido N vezes não acumula desvio.
 */
export function resolveFrozenRtRate(rtAmount: number, total: number): number {
    const rt = Number(rtAmount) || 0
    const t = Number(total) || 0
    if (t <= 0 || rt <= 0) return 0
    return rt / t
}

/**
 * Consolida comissão, lucro e RT do documento atual.
 *
 * Comissão e lucro vêm da distribuição residual (já afetada pelo desconto e pelos
 * itens correntes). RT é a alíquota efetiva congelada da origem, reaplicada sobre o
 * total atual — preserva o congelamento e acompanha desconto e remoção de itens.
 *
 * LIMITE CONHECIDO (resolvido pelo D8): itens ADICIONADOS depois, no próprio pedido,
 * não têm `rt_pct` persistido em `order_items`, então o RT deles não entra na
 * alíquota congelada. Enquanto `order_items.rt_pct` não for gravado, o RT do pedido
 * reflete a composição do documento de origem, reescalada.
 */
export function computeConsolidatedAmounts(
    input: ConsolidatedAmountsInput,
): ConsolidatedAmounts {
    const commissionAmount = round2(Number(input.distribution?.commission?.amount) || 0)
    const profitAmount = round2(Number(input.distribution?.profit?.amount) || 0)

    const frozenRtRate = resolveFrozenRtRate(input.sourceRtAmount, input.sourceTotal)
    const currentTotal = Number(input.currentTotal) || 0
    const rtAmount = round2(frozenRtRate * currentTotal)

    return { commissionAmount, profitAmount, rtAmount }
}
