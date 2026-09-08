/**
 * document-origin-link.ts — o VÍNCULO DE ORIGEM de uma venda no Histórico do Cliente.
 *
 * ESTE É O ÚNICO ITEM DA RODADA QUE ACRESCENTA CAMPO; todo o resto é remoção de filtro. Por
 * isso vive em arquivo e commit próprios: um `revert` deste acréscimo não leva junto as
 * correções de critério. Mesmo desenho do #40 e do commit da regra em `.claude/rules/`.
 *
 * O QUE FALTAVA, E POR QUE ISSO IMPORTA
 * --------------------------------------
 * A razão da venda excluída permanecer visível no histórico é AUDITORIA: quem verificar meses
 * depois tem de conseguir saber O QUE ocorreu, POR QUE ocorreu e QUAL ERA A ORIGEM. O histórico
 * é o único lugar onde esse rastro sobrevive — a venda excluída sai do caixa, do fluxo de
 * caixa, do relatório de vendas, do de comissões e do RT.
 *
 * Uma linha cinza dizendo "Excluído" não serve para isso. Data, valor e itens já chegavam; o
 * VÍNCULO não — `budget_id` era usado só para juntar anexos e desduplicar, e nada em
 * `TimelineEntry` carregava a origem. Com o orçamento e a venda em SEÇÕES DIFERENTES do mesmo
 * painel, os dois apagados, quem audita via dois registros mortos sem nada os ligando.
 *
 * E no caso do Felipe Klein o vínculo é a ÚNICA saída: o orçamento `3b82c75e` tem `sale_id`
 * preenchido, e orçamento convertido em venda é PULADO antes de virar entrada da seção
 * Orçamentos. Acrescentar `EXCLUIDO` à lista branca não o traz de volta — só este campo traz.
 *
 * A LINHA DO PEDIDO É OMITIDA QUANDO NÃO HOUVER — SEM TRAÇO E SEM TRAVESSÃO
 * -------------------------------------------------------------------------
 * Campo vazio AFIRMARIA que não houve pedido. No Caso B (venda direta de orçamento, que é o do
 * VD-96AF84, com `order_id` NULL) a etapa NÃO EXISTIU — são coisas diferentes, e a distinção é
 * a de `.claude/rules/ausente-vs-falso.md`: a omissão não afirma nada, o traço afirma.
 */

/** Uma linha de origem, pronta para a tela. */
export interface OriginLine {
    /** `'Orçamento'` ou `'Pedido'`. */
    rotulo: string
    /** O código curto exibido, no mesmo formato das outras seções do painel. */
    valor: string
    /** O id, para quem quiser navegar depois. */
    id: string
}

/** Código curto de orçamento, no formato que a seção Orçamentos já usa. */
export function formatBudgetCode(budgetId: string): string {
    return `ORC-${budgetId.substring(0, 4).toUpperCase()}`
}

/** Código curto de pedido, no formato que a seção Pedidos já usa quando falta `order_code`. */
export function formatOrderCode(orderId: string, orderCode?: string | null): string {
    return orderCode || `Pedido ${orderId.slice(0, 8).toUpperCase()}`
}

/**
 * As linhas de origem de uma venda.
 *
 * Devolve lista VAZIA quando não há origem nenhuma — venda de balcão. Quem renderiza omite o
 * bloco inteiro nesse caso, pelo mesmo motivo de omitir a linha do pedido.
 */
export function buildOriginLines(args: {
    budgetId?: string | null
    orderId?: string | null
    orderCode?: string | null
}): OriginLine[] {
    const linhas: OriginLine[] = []
    if (args.budgetId) {
        linhas.push({ rotulo: 'Orçamento', valor: formatBudgetCode(args.budgetId), id: args.budgetId })
    }
    if (args.orderId) {
        linhas.push({ rotulo: 'Pedido', valor: formatOrderCode(args.orderId, args.orderCode), id: args.orderId })
    }
    return linhas
}
