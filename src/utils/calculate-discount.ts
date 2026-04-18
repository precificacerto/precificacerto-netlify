export type DiscountMode = 'PROPORTIONAL' | 'PROFIT_REDUCTION' | 'SELLER_REDUCTION'

/**
 * Calculates the discounted price ensuring discount only affects commission + profit.
 *
 * discountPercent é % DA MARGEM (commission+profit), não % absoluto sobre o preço.
 * O `mode` controla como a redução é distribuída entre comissão e lucro:
 *   - PROPORTIONAL     → 50/50 (comportamento original)
 *   - PROFIT_REDUCTION → toda a redução sai do lucro
 *   - SELLER_REDUCTION → toda a redução sai da comissão do vendedor
 *
 * @param salePrice - Full sale price (e.g., R$ 200)
 * @param costWithTaxes - Cost + taxes portion that cannot be discounted (e.g., R$ 100)
 * @param discountPercent - Discount percentage (0-100) of the margin
 * @param mode - How the discount is split between commission and profit (default: PROPORTIONAL)
 */
export function calculateDiscountedPrice(
  salePrice: number,
  costWithTaxes: number,
  discountPercent: number,
  mode: DiscountMode = 'PROPORTIONAL',
): { finalPrice: number; discountValue: number; commissionReduction: number; profitReduction: number } {
  if (discountPercent <= 0) {
    return { finalPrice: salePrice, discountValue: 0, commissionReduction: 0, profitReduction: 0 }
  }

  const margin = Math.max(0, salePrice - costWithTaxes)
  const clampedPercent = Math.min(discountPercent, 100)
  const discountValue = margin * clampedPercent / 100
  const finalPrice = salePrice - discountValue

  let commissionReduction: number
  let profitReduction: number
  switch (mode) {
    case 'PROFIT_REDUCTION':
      commissionReduction = 0
      profitReduction = discountValue
      break
    case 'SELLER_REDUCTION':
      commissionReduction = discountValue
      profitReduction = 0
      break
    case 'PROPORTIONAL':
    default:
      commissionReduction = discountValue / 2
      profitReduction = discountValue / 2
  }

  return { finalPrice, discountValue, commissionReduction, profitReduction }
}
