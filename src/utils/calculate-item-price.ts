export function calculateItemPrice(
  quantity: number,
  referencePrice: number,
  referenceQuantity: number
): number {
  return (quantity * referencePrice) / referenceQuantity
}
