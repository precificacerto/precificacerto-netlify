// Ponto de Equilíbrio — fórmula baseada no faturamento médio do HUB.
//
// Fórmula:
//   Total Variável % = custo produtos % + despesa variável % + comissões % + impostos sobre faturamento % + despesa financeira %
//   Margem de Contribuição (MC) = 1 - (Total Variável % / 100)
//   Custo Fixo R$ = ((MO Produtiva % + MO Administrativa % + Despesa Fixa %) / 100) × Faturamento Médio
//   Ponto de Equilíbrio = Custo Fixo R$ / MC
//
// Guard: se MC ≤ 0 (despesas variáveis ≥ 100%) ou faturamento médio ≤ 0,
// retorna { isValid: false, breakeven: null } e a UI deve mostrar "—".

export interface BreakevenInput {
  // Percentuais variáveis (% sobre faturamento)
  productCostPct: number
  variableExpensePct: number
  commissionPct: number
  taxesInsidePct: number
  financialExpensePct: number
  // Percentuais fixos (% sobre faturamento)
  productionLaborPct: number
  adminLaborPct: number
  fixedExpensePct: number
  // Faturamento médio mensal (R$) — média dos meses fechados do HUB
  averageRevenue: number
}

export interface BreakevenResult {
  breakeven: number | null
  isValid: boolean
  reason?: string
  totalVariablePct: number
  marginOfContribution: number
  fixedCostMonthly: number
}

export function calculateBreakeven(input: BreakevenInput): BreakevenResult {
  const totalVariablePct =
    (Number(input.productCostPct) || 0) +
    (Number(input.variableExpensePct) || 0) +
    (Number(input.commissionPct) || 0) +
    (Number(input.taxesInsidePct) || 0) +
    (Number(input.financialExpensePct) || 0)

  const marginOfContribution = 1 - totalVariablePct / 100
  const totalFixedPct =
    (Number(input.productionLaborPct) || 0) +
    (Number(input.adminLaborPct) || 0) +
    (Number(input.fixedExpensePct) || 0)
  const averageRevenue = Number(input.averageRevenue) || 0
  const fixedCostMonthly = (totalFixedPct / 100) * averageRevenue

  if (averageRevenue <= 0) {
    return {
      breakeven: null,
      isValid: false,
      reason: 'Faturamento médio do HUB indisponível — registre receitas para calcular.',
      totalVariablePct,
      marginOfContribution,
      fixedCostMonthly,
    }
  }

  if (marginOfContribution <= 0) {
    return {
      breakeven: null,
      isValid: false,
      reason: 'Despesas variáveis somam 100% ou mais do faturamento.',
      totalVariablePct,
      marginOfContribution,
      fixedCostMonthly,
    }
  }

  if (totalFixedPct <= 0) {
    return {
      breakeven: null,
      isValid: false,
      reason: 'Custos fixos zerados — não há ponto de equilíbrio operacional.',
      totalVariablePct,
      marginOfContribution,
      fixedCostMonthly,
    }
  }

  return {
    breakeven: Math.round((fixedCostMonthly / marginOfContribution) * 100) / 100,
    isValid: true,
    totalVariablePct,
    marginOfContribution,
    fixedCostMonthly,
  }
}

export function buildBreakevenInputFromConfig(cfg: any): BreakevenInput {
  // Todos os percentuais saem do HUB (persistidos em tenant_expense_config).
  // Sprint Mai/2026: comissão e impostos sobre faturamento passam a vir do HUB
  // (commission_percent_hub e tax_on_revenue_percent), não do cadastro do usuário.
  const c = cfg || {}
  return {
    productCostPct: Number(c.product_cost_percent) || 0,
    variableExpensePct: Number(c.variable_expense_percent) || 0,
    commissionPct: Number(c.commission_percent_hub) || 0,
    taxesInsidePct: Number(c.tax_on_revenue_percent) || 0,
    financialExpensePct: Number(c.financial_expense_percent) || 0,
    productionLaborPct: Number(c.production_labor_percent) || 0,
    adminLaborPct: Number(c.indirect_labor_percent) || 0,
    fixedExpensePct: Number(c.fixed_expense_percent) || 0,
    averageRevenue: Number(c.hub_average_revenue) || 0,
  }
}
