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

  const adjusted = items.map((it) => {
    const qty = Number(it.quantity) || 0
    const adjustedUnit = Number(((Number(it.unit_price) || 0) * factor).toFixed(4))
    const adjustedTotal = Number((qty * adjustedUnit).toFixed(2))
    return {
      ...it,
      unit_price: adjustedUnit,
      ...(it.total_price !== undefined ? { total_price: adjustedTotal } : {}),
    } as T
  })

  // Corrige resíduo de arredondamento: a soma dos items deve bater exatamente com target.
  // Distribui o delta no ÚLTIMO item (ajusta total_price; recalcula unit_price se quantity > 0).
  const currentSum = adjusted.reduce(
    (s, it) => s + (Number((it as ItemWithPrice).total_price) || (Number((it as ItemWithPrice).quantity) || 0) * (Number((it as ItemWithPrice).unit_price) || 0)),
    0,
  )
  const targetRounded = Math.round(target * 100) / 100
  const currentRounded = Math.round(currentSum * 100) / 100
  const delta = Math.round((targetRounded - currentRounded) * 100) / 100
  if (delta !== 0 && adjusted.length > 0) {
    const lastIdx = adjusted.length - 1
    const last = adjusted[lastIdx] as ItemWithPrice
    const qty = Number(last.quantity) || 0
    const currentTotal = Number(last.total_price) || qty * (Number(last.unit_price) || 0)
    const newTotal = Number((currentTotal + delta).toFixed(2))
    const newUnit = qty > 0 ? Number((newTotal / qty).toFixed(4)) : Number(last.unit_price) || 0
    adjusted[lastIdx] = {
      ...(last as object),
      unit_price: newUnit,
      ...(last.total_price !== undefined ? { total_price: newTotal } : {}),
    } as unknown as T
  }

  return adjusted
}
