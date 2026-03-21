/**
 * Calculates the discounted price ensuring discount only affects commission + profit.
 * The discount is split 50/50 between commission and profit.
 *
 * Business rule: when a user applies a discount percentage to a sale, the discount
 * is taken ONLY from the commission + profit margin, NOT from cost + taxes.
 *
 * Example:
 * - Cost + Taxes = R$ 100 (untouchable)
 * - Commission + Profit = R$ 100 (this is what gets discounted)
 * - Sale price = R$ 200
 * - 100% discount → price = R$ 100 (all commission+profit removed)
 * - 50% discount → price = R$ 150 (50% of commission+profit removed = R$50,
 *   split equally: R$25 from commission, R$25 from profit)
 *
 * @param salePrice - Full sale price (e.g., R$ 200)
 * @param costWithTaxes - Cost + taxes portion that cannot be discounted (e.g., R$ 100)
 * @param discountPercent - Discount percentage (0-100)
 * @returns The final price after discount, plus breakdown of reductions
 */
export function calculateDiscountedPrice(
  salePrice: number,
  costWithTaxes: number,
  discountPercent: number,
): { finalPrice: number; discountValue: number; commissionReduction: number; profitReduction: number } {
  if (discountPercent <= 0) {
    return { finalPrice: salePrice, discountValue: 0, commissionReduction: 0, profitReduction: 0 }
  }

  // Margin = commission + profit (the only portion that can be discounted)
  const margin = Math.max(0, salePrice - costWithTaxes)
  const clampedPercent = Math.min(discountPercent, 100)
  const discountValue = margin * clampedPercent / 100

  // Split the discount equally between commission and profit (50/50)
  const commissionReduction = discountValue / 2
  const profitReduction = discountValue / 2

  // Final price never goes below cost+taxes
  const finalPrice = salePrice - discountValue

  return { finalPrice, discountValue, commissionReduction, profitReduction }
}
