import { CalcBaseType } from '@/types/calc-base.type'
import { TaxPreviewResult } from '@/utils/calc-tax-preview'

/**
 * Builds a CalcBaseType from tenant_expense_config + TaxPreviewResult.
 * Populates both new (V2) and legacy fields for backward compat during migration.
 */
export function buildCalcBase(expense: any, taxPreview?: TaxPreviewResult): CalcBaseType {
  const indirectLabor = expense?.admin_labor_percent
    ? Number(expense.admin_labor_percent)
    : (expense?.indirect_labor_percent ? Number(expense.indirect_labor_percent) : 0)
  const fixed = expense?.fixed_expense_percent ? Number(expense.fixed_expense_percent) : 0
  const variable = expense?.variable_expense_percent ? Number(expense.variable_expense_percent) : 0
  const financial = expense?.financial_expense_percent ? Number(expense.financial_expense_percent) : 0
  const laborCost = Number(expense?.production_labor_cost_hub) || Number(expense?.production_labor_cost) || 0
  const laborPct = expense?.production_labor_percent ? Number(expense.production_labor_percent) : 0
  const profitBase = expense?.profit_margin_percent ? Number(expense.profit_margin_percent) : 0

  const taxPctDisplay = taxPreview
    ? (taxPreview.effectiveTaxPct * 100)
    : (expense?.taxable_regime_percent ? Number(expense.taxable_regime_percent) : 0)

  const label = taxPreview?.taxLabel ?? ''
  const isMei = taxPreview?.isMei ?? false

  const productiveValuePerMinute = expense?.productive_value_per_minute ? Number(expense.productive_value_per_minute) : 0

  return {
    // --- V2 fields ---
    laborCostMonthly: laborCost,
    laborPercent: laborPct,
    /** Estrutura = só fixas + variáveis + financeiras (mão de obra é R$ via custo-hora × workload). */
    structurePct: fixed + variable + financial,
    indirectLaborPct: indirectLabor,
    fixedExpensePct: fixed,
    variableExpensePct: variable,
    financialExpensePct: financial,
    taxPct: taxPctDisplay,
    taxLabel: label,
    isMei,
    productiveValuePerMinute,

    // --- V2 fields for motor interface ---
    // These default to 0/1; callers (content.component) override with values
    // computed from currentUser (monthlyWorkloadInMinutes + unitMeasure).
    monthlyWorkloadMinutes: expense?.monthly_workload_minutes
      ? Number(expense.monthly_workload_minutes)
      : 0,
    numProductiveEmployees: expense?.num_productive_employees
      ? Number(expense.num_productive_employees)
      : 1,

    // --- Legacy fields (same data, old names) ---
    dre: [],
    yearIncomeAverage: 0,
    productionLaborCostAveragePrice: laborCost,
    indirectLaborExpensePercent: indirectLabor,
    fixedExpensePercent: fixed,
    variableExpensePercent: variable,
    financialExpensePercent: financial,
    taxesPercent: taxPreview?.taxesPercent ?? (expense?.taxable_regime_percent ? Number(expense.taxable_regime_percent) : 0),
    productionLaborCostAveragePercent: laborPct,
    productionLaborCostPricePlusPercentIndirectLaborExpensePrice: laborCost,
    profitBasePercent: profitBase,
    productCostPercent: 0,
    sumIncomeYearAverageByCategory: 0,
    taxableRegimeAutoPercent: taxPreview?.taxableRegimePercent ?? 0,
    regimeLabel: label,
  }
}
