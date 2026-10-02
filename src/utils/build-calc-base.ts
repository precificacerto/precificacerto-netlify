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
  /*
    COMPROMISSOS FINANCEIROS — §0 e §1 do comando de 02/10/2026.

    >>> `NULL` CONTRIBUI ZERO, E ISSO NÃO É DEFENSIVIDADE <<<

    `NULL` significa "o tenant ainda não foi recalculado sob a separação", e nesse estado o
    compromisso AINDA ESTÁ dentro de `fixed_expense_percent`. Somar um valor aqui o contaria
    DUAS VEZES e o preço subiria. O `? :` abaixo é a mesma forma das outras quatro linhas, e
    aqui ele carrega essa decisão — ver o comentário da coluna na migração.
  */
  const compromissosFinanceiros = expense?.financial_commitments_percent
    ? Number(expense.financial_commitments_percent)
    : 0
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
    /**
     * Estrutura = fixas + variáveis + financeiras + COMPROMISSOS FINANCEIROS (mão de obra é R$ via
     * custo-hora × workload).
     *
     * >>> O COMPROMISSO ENTRA AQUI, E É POR ISSO QUE O PREÇO NÃO MUDA — §0 de 02/10/2026 <<<
     *
     * Ele saiu de `fixed_expense_percent` e voltou como termo próprio NO MESMO DIVISOR. A soma
     * `fixed + compromissosFinanceiros` é o `fixed` de antes, ao centavo, então esta expressão devolve
     * exatamente o mesmo número que devolvia. Esquecer de somá-lo aqui faria o preço CAIR — e
     * nada falharia, porque um preço menor não levanta erro.
     */
    structurePct: fixed + variable + financial + compromissosFinanceiros,
    indirectLaborPct: indirectLabor,
    fixedExpensePct: fixed,
    /** O termo próprio, para a tela exibir a linha dele sem recompor nada. */
    financialCommitmentsPct: compromissosFinanceiros,
    variableExpensePct: variable,
    financialExpensePct: financial,
    taxPct: taxPctDisplay,
    taxBreakdown: taxPreview?.breakdown,
    // Simples Híbrido: a dedução da base de IBS/CBS, do anexo/faixa do tenant. Ausente nos
    // demais regimes — ver `TaxPreviewResult.deducaoBaseIbsCbsPct`.
    deducaoBaseIbsCbsPct: taxPreview?.deducaoBaseIbsCbsPct,
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
