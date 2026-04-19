// Epic MELHORIAS-22-ABR2026 T22
// Calcula Ponto de Equilíbrio operacional da empresa a partir do HUB (tenant_expense_config) + regime tributário.
//
// Fórmula:
//   PE = (Salários produtivos + MO administrativa + Despesa Fixa)
//        / (1 - (% custo produtos + % despesa variável + % despesa financeira + % comissões + % lucro + % impostos por dentro))
//
// Ignora "despesa de acessórios" (categoria não existente).

export interface BreakevenInput {
  productionLaborMonthly: number
  adminLaborMonthly: number
  fixedExpenseMonthly: number
  variableExpensePct: number
  financialExpensePct: number
  productCostPct: number
  commissionPct: number
  profitPct: number
  taxesInsidePct: number
}

export interface BreakevenResult {
  breakeven: number
  isValid: boolean
  reason?: string
  numerator: number
  denominator: number
  denominatorPctTotal: number
}

export function calculateBreakeven(input: BreakevenInput): BreakevenResult {
  const numerator =
    (Number(input.productionLaborMonthly) || 0) +
    (Number(input.adminLaborMonthly) || 0) +
    (Number(input.fixedExpenseMonthly) || 0)

  const pctTotal =
    (Number(input.variableExpensePct) || 0) +
    (Number(input.financialExpensePct) || 0) +
    (Number(input.productCostPct) || 0) +
    (Number(input.commissionPct) || 0) +
    (Number(input.profitPct) || 0) +
    (Number(input.taxesInsidePct) || 0)

  const denominator = 1 - pctTotal / 100

  if (denominator <= 0) {
    return {
      breakeven: 0,
      isValid: false,
      reason: 'Percentual total é maior ou igual a 100% — ajuste as despesas.',
      numerator,
      denominator,
      denominatorPctTotal: pctTotal,
    }
  }

  if (numerator <= 0) {
    return {
      breakeven: 0,
      isValid: false,
      reason: 'Custos mensais (MO produtiva + administrativa + despesa fixa) estão zerados.',
      numerator,
      denominator,
      denominatorPctTotal: pctTotal,
    }
  }

  return {
    breakeven: Math.round((numerator / denominator) * 100) / 100,
    isValid: true,
    numerator,
    denominator,
    denominatorPctTotal: pctTotal,
  }
}

export function buildBreakevenInputFromConfig(
  cfg: any,
  taxableRegimePercent: number | null | undefined,
  profitPct: number | null | undefined,
  commissionPct: number | null | undefined,
): BreakevenInput {
  const c = cfg || {}
  return {
    productionLaborMonthly:
      Number(c.production_labor_cost_hub) || Number(c.production_labor_cost) || 0,
    adminLaborMonthly:
      (Number(c.admin_salary_total) || 0) +
      (Number(c.admin_fgts_total) || 0) +
      (Number(c.admin_other_costs) || 0),
    fixedExpenseMonthly: Number(c.fixed_expense_monthly) || 0,
    variableExpensePct: Number(c.variable_expense_percent) || 0,
    financialExpensePct: Number(c.financial_expense_percent) || 0,
    productCostPct: 0,
    commissionPct: Number(commissionPct) || 0,
    profitPct: Number(profitPct) || 0,
    taxesInsidePct: Number(taxableRegimePercent) || 0,
  }
}
