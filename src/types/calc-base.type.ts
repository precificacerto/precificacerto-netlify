import { DreListItem } from '@/shared/enums/dre-year-base'
import type { TaxPreviewBreakdown } from '@/utils/calc-tax-preview'

/**
 * Simplified calc base for the pricing engine (V2).
 * All percentages are display values (0-100) to match tenant_expense_config storage.
 * The pricing-engine expects decimals 0-1; the UI layer converts before calling it.
 */
export interface CalcBaseType {
  /** Monthly labor cost in R$ (production_labor_cost). */
  laborCostMonthly: number
  /** Labor as % of revenue — used by REVENDA (included in structurePct). */
  laborPercent: number
  /** Sum of fixed + variable + financial expenses (display %, 0-100). IndirectLabor is separate. */
  structurePct: number
  /** Individual breakdowns kept for display in product-price table. */
  indirectLaborPct: number
  fixedExpensePct: number
  variableExpensePct: number
  financialExpensePct: number
  /** Single effective tax rate (display %, 0-100). */
  taxPct: number
  /**
   * Tributos POR DENTRO discriminados (Parte 0 + R5), em DECIMAL. Presente só nos regimes
   * cuja matriz está escrita — hoje, Lucro Real. Ausente = sem matriz, nunca alíquota zero.
   */
  taxBreakdown?: TaxPreviewBreakdown
  /**
   * SIMPLES HÍBRIDO — a dedução da base de IBS/CBS (LC 214 art. 12 §2º V), DECIMAL.
   *
   * `undefined` nos demais regimes. Ela viaja ao lado de `taxPct` (que ali é o DAS
   * reduzido) porque os dois saem da mesma faixa do mesmo anexo, e separá-los em duas
   * travessias é como as duas metades passam a divergir.
   */
  deducaoBaseIbsCbsPct?: number
  /** Human-readable tax regime label. */
  taxLabel: string
  isMei: boolean
  /** Productive labor value per minute (R$/min) from tenant_expense_config. */
  productiveValuePerMinute: number

  // -------------------------------------------------------------------------
  // New fields for pricing-engine V2 (Fase 1 interface)
  // -------------------------------------------------------------------------
  /**
   * Total productive minutes available per month (company-wide).
   * = totalEmployees × hoursPerMonth × 60
   * Populated by callers (content.component) from currentUser data.
   * buildCalcBase defaults to 0; override in component before calling calculatePricing.
   */
  monthlyWorkloadMinutes: number
  /**
   * Number of productive employees.
   * Populated by callers from currentUser data.
   * buildCalcBase defaults to 1.
   */
  numProductiveEmployees: number

  // -------------------------------------------------------------------------
  // Legacy fields — kept for backward compat during migration (PR 3).
  // These will be removed once all consumers are updated.
  // -------------------------------------------------------------------------
  /** @deprecated Use laborCostMonthly */
  productionLaborCostAveragePrice: number
  /** @deprecated Use indirectLaborPct */
  indirectLaborExpensePercent: number
  /** @deprecated Use fixedExpensePct */
  fixedExpensePercent: number
  /** @deprecated Use variableExpensePct */
  variableExpensePercent: number
  /** @deprecated Use financialExpensePct */
  financialExpensePercent: number
  /** @deprecated Use taxPct */
  taxesPercent: number
  /** @deprecated Use laborPercent */
  productionLaborCostAveragePercent: number
  /** @deprecated Use laborCostMonthly */
  productionLaborCostPricePlusPercentIndirectLaborExpensePrice: number
  /** @deprecated Not used in pricing-engine V2 */
  profitBasePercent: number
  /** @deprecated Not used in pricing-engine V2 */
  dre: DreListItem[]
  /** @deprecated Not used in pricing-engine V2 */
  yearIncomeAverage: number
  /** @deprecated Not used in pricing-engine V2 */
  productCostPercent: number
  /** @deprecated Not used in pricing-engine V2 */
  sumIncomeYearAverageByCategory: number
  /** @deprecated Use taxPct (unified) */
  taxableRegimeAutoPercent?: number
  /** @deprecated Use taxLabel */
  regimeLabel?: string
}
