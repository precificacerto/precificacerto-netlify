/**
 * Returns the effective commission percentage.
 * Rule: always use the product/service commission_percent.
 * Employee commission is never used — commission is defined per product/service.
 */
export function getEffectiveCommissionPercent(
  _employeeCommission: number | null | undefined,
  productServiceCommission: number | null | undefined,
): number {
  return Number(productServiceCommission) || 0
}
