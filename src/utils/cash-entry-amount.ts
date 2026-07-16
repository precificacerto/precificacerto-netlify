/**
 * Valor efetivo de receita para lançamentos de fluxo de caixa.
 * Cartão de crédito antecipado: conta só o que ainda não foi antecipado (evita duplicidade no mês futuro).
 */
export function getEffectiveIncomeAmount(entry: {
  type?: string
  amount?: number | string | null
  payment_method?: string | null
  anticipated_amount?: number | string | null
}): number {
  if (entry.type !== 'INCOME') return Number(entry.amount || 0)
  if (
    entry.payment_method === 'CARTAO_CREDITO' &&
    entry.anticipated_amount != null &&
    Number(entry.anticipated_amount) > 0
  ) {
    return Math.max(0, Number(entry.amount || 0) - Number(entry.anticipated_amount))
  }
  return Number(entry.amount || 0)
}

/**
 * Indica se um lançamento do fluxo de caixa está LIQUIDADO — ou seja, se já
 * compõe o Caixa real (dinheiro que efetivamente entrou/saiu), em oposição a
 * valores meramente previstos/lançados.
 *
 * Regra (espelha exatamente a tela Caixa em /caixa/[year]/[month]):
 * - Despesa (EXPENSE): liquidada somente quando possui `paid_date` (foi paga).
 * - Receita (INCOME): considerada recebida quando NÃO é um boleto/cheque
 *   pré-datado ainda em aberto. Boleto e cheque pré-datado só contam com
 *   `paid_date`; demais formas (PIX, dinheiro, cartão) contam na competência.
 *
 * Observação: saldos carregados do mês anterior (origin_type
 * 'PREV_MONTH_BALANCE') NÃO são entradas reais e devem ser filtrados à parte
 * por quem consome (não são tratados aqui, pois este helper cuida apenas de
 * status de liquidação).
 */
export function isCashEntryLiquidated(entry: {
  type?: string
  paid_date?: string | null
  payment_method?: string | null
}): boolean {
  if (entry.type === 'EXPENSE') return entry.paid_date != null
  // INCOME
  return !((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') && !entry.paid_date)
}
