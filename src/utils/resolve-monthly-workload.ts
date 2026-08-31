export type MonthlyWorkload = {
  /** Horas produtivas por funcionário no mês, convertidas da unidade do tenant. */
  hoursPerMonth: number
  /** Minutos produtivos da empresa no mês. 0 quando não configurado. */
  monthlyWorkloadMinutes: number
  /** Nº de funcionários produtivos usado no cálculo (mínimo 1). */
  totalEmployees: number
  /** true quando o tenant nunca configurou a carga horária. */
  isUnset: boolean
}

/**
 * Converte `tenant_settings.monthly_workload` (gravado NA UNIDADE de
 * `workload_unit`) para horas e para minutos produtivos da empresa.
 *
 * Substitui o fallback silencioso de 176h que existia em quatro pontos: um
 * default que trocava dado real por número inventado sem avisar ninguém — a
 * mesma família de defeito do PC-BUG-EQUIPE-DIASMES-001. Aqui a ausência de
 * configuração vira um estado EXPLÍCITO (`isUnset`) que a UI é obrigada a tratar.
 */
export function resolveMonthlyWorkload(
  rawWorkload: number | null | undefined,
  unit: string | null | undefined,
  numProductiveEmployees: number | null | undefined,
): MonthlyWorkload {
  const u = String(unit || '').toUpperCase()
  const raw = Number(rawWorkload) || 0
  const hoursPerMonth = u === 'HOURS' ? raw : u === 'DAYS' ? raw * 8 : raw / 60
  const totalEmployees = Math.max(1, Number(numProductiveEmployees) || 1)
  const isUnset = !(hoursPerMonth > 0)
  return {
    hoursPerMonth,
    monthlyWorkloadMinutes: isUnset ? 0 : totalEmployees * hoursPerMonth * 60,
    totalEmployees,
    isUnset,
  }
}
