// Distribui um desconto global proporcionalmente entre os itens.
//
// Caso de uso: quando um orçamento/pedido guarda o `total_value` já com desconto
// aplicado, mas seus itens (`budget_items` / `order_items`) mantêm o `unit_price`
// original (sem desconto). Ao copiar esses itens para outra entidade (pedido ou
// venda), precisamos aplicar o fator proporcional para que a soma dos itens
// coincida com o `total_value` da entidade pai.
//
// Funciona para qualquer item que tenha `quantity` e `unit_price` numéricos.
// Se o item tiver `total_price`, também é recalculado.

export interface ItemWithPrice {
  quantity?: number | null
  unit_price?: number | null
  total_price?: number | null
  // demais campos passam intactos
  [key: string]: unknown
}

export function distributeDiscountToItems<T extends ItemWithPrice>(
  items: T[],
  targetTotalValue: number | null | undefined,
): T[] {
  if (!items || items.length === 0) return items
  const grossSum = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  )
  const target = Number(targetTotalValue) || 0
  if (grossSum <= 0 || target <= 0) return items
  const factor = target / grossSum
  if (Math.abs(factor - 1) < 0.0001) return items // sem desconto efetivo
  return items.map((it) => {
    const qty = Number(it.quantity) || 0
    const adjustedUnit = Number(((Number(it.unit_price) || 0) * factor).toFixed(4))
    const adjustedTotal = Number((qty * adjustedUnit).toFixed(2))
    return {
      ...it,
      unit_price: adjustedUnit,
      ...(it.total_price !== undefined ? { total_price: adjustedTotal } : {}),
    }
  })
}
