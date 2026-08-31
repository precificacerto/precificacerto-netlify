/**
 * Cálculo de preço de venda do serviço (base_price e labor_cost).
 * Usa calculatePricing (coeficiente por dentro) — mesma fórmula do ServiceContent.
 */

import { calculatePricing } from '@/utils/pricing-engine'
import type { TaxPreviewResult } from '@/utils/calc-tax-preview'
import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'

export interface ServicePriceInput {
  /** Custo total (materiais/insumos) do serviço em R$. */
  materialCost: number
  /** Comissão % (0–100). */
  commissionPercent: number
  /** Lucro % (0–100). */
  profitPercent: number
  /** Regime tributário % (0–100) — somado ao taxesPercent do taxPreview. */
  taxableRegimePercent: number
  /** Config de despesas do tenant. */
  expenseConfig: {
    production_labor_cost?: number
    fixed_expense_percent?: number
    variable_expense_percent?: number
    financial_expense_percent?: number
  } | null
  /** Preview de impostos do tenant. */
  taxPreview: TaxPreviewResult | null
  /** Usuário/tenant para mão de obra (funcionários e carga horária). */
  currentUser: {
    numProductiveSectorEmployee?: number
    numComercialSectorEmployee?: number
    numAdministrativeSectorEmployee?: number
    unitMeasure?: string
    monthlyWorkloadInMinutes?: number
  } | null
  /**
   * Minutos de duração deste serviço (estimated_duration_minutes).
   * Opcional: se omitido, labor não entra no CMV (productiveLaborCost = 0).
   */
  serviceWorkloadMinutes?: number
}

export interface ServicePriceResult {
  sellingPrice: number
  laborCost: number
}

/**
 * Calcula preço de venda e custo de mão de obra do serviço.
 * Fórmula: priceUnit = cmvUnit / coefficient (por dentro).
 * MO produtiva entra no CMV para calcType SERVICO.
 */
export function computeServiceSellingPrice(input: ServicePriceInput): ServicePriceResult {
  const cfg = input.expenseConfig || {}
  const laborCostMonthly = Number(cfg.production_labor_cost) || 0

  // Carga horária resolvida pela fonte única (`resolve-monthly-workload`). Quando o
  // tenant não configurou, `monthlyWorkloadMinutes` é 0 — sem o antigo default de
  // 176h/mês, que precificava sobre um número inventado. O motor já trata divisor 0
  // (custo por minuto vira 0), e o bloqueio da UI acontece na origem do preço
  // (cadastro de Produto e de Serviço).
  const workload = resolveMonthlyWorkload(
    input.currentUser?.monthlyWorkloadInMinutes,
    input.currentUser?.unitMeasure,
    input.currentUser?.numProductiveSectorEmployee,
  )
  const totalEmployees = workload.totalEmployees
  const monthlyWorkloadMinutes = workload.monthlyWorkloadMinutes

  const fixedPct = Number(cfg.fixed_expense_percent) || 0
  const variablePct = Number(cfg.variable_expense_percent) || 0
  const financialPct = Number(cfg.financial_expense_percent) || 0
  const structurePct = (fixedPct + variablePct + financialPct) / 100

  const taxesPct = input.taxPreview?.taxesPercent ?? 0
  const taxPct = (taxesPct + input.taxableRegimePercent) / 100

  const result = calculatePricing({
    calcType: 'SERVICO',
    totalItemsCost: input.materialCost,
    yieldQuantity: 1,
    laborCostMonthly,
    numProductiveEmployees: totalEmployees,
    monthlyWorkloadMinutes,
    productWorkloadMinutes: input.serviceWorkloadMinutes ?? 0,
    structurePct,
    taxPct,
    commissionPct: input.commissionPercent / 100,
    profitPct: input.profitPercent / 100,
  })

  return {
    sellingPrice: result.isValid ? result.priceUnit : 0,
    laborCost: result.productiveLaborCost,
  }
}
