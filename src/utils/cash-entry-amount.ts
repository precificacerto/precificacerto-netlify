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
