/**
 * Cálculo de preço de venda do serviço (base_price e labor_cost).
 * Usa calculatePricing (coeficiente por dentro) — mesma fórmula do ServiceContent.
 */

import { calculatePricing } from '@/utils/pricing-engine'
import type { TaxPreviewResult } from '@/utils/calc-tax-preview'
import { UNIT_MEASURE_ENUM } from '@/shared/enums/unit-measure-type'

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

  const totalEmployees =
    (input.currentUser?.numProductiveSectorEmployee ?? 0) || 1

  const rawWorkload = input.currentUser?.monthlyWorkloadInMinutes || 0
  const unitMeasure = input.currentUser?.unitMeasure || ''
  const hoursPerMonth =
    unitMeasure === UNIT_MEASURE_ENUM.HOURS
      ? rawWorkload
      : unitMeasure === UNIT_MEASURE_ENUM.DAYS
        ? rawWorkload * 8
        : rawWorkload / 60
  const hoursPerMonthSafe = hoursPerMonth > 0 ? hoursPerMonth : 176
  const monthlyWorkloadMinutes = totalEmployees * hoursPerMonthSafe * 60

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
