/**
 * Returns the effective commission percentage based on priority rules:
 * 1. If employee has commission_percent > 0 → use employee's commission
 * 2. If employee has 0/null AND product/service has commission_percent > 0 → use product/service commission
 * 3. If both are 0/null → return 0
 */
export function getEffectiveCommissionPercent(
  employeeCommission: number | null | undefined,
  productServiceCommission: number | null | undefined,
): number {
  const empComm = Number(employeeCommission) || 0
  const prodComm = Number(productServiceCommission) || 0
  if (empComm > 0) return empComm
  if (prodComm > 0) return prodComm
  return 0
}
