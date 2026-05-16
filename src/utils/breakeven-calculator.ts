// Ponto de Equilíbrio v2 — fórmula oficial baseada em ROB (Receita Operacional Base).
//
// Conceitos:
//   RB  = Receita Bruta (faturamento médio mensal do HUB)
//   IPF = Impostos Por Fora (CBS, IBS, ICMS-ST, DIFAL, IPI destacado, ISS retido, PIS/COFINS Monofásico)
//   DED = Deduções da Receita (devoluções, cancelamentos, estornos, abatimentos)
//   ROB = RB − IPF − DED
//
//   Variáveis (entram na MC):
//     CP    = Custo dos Produtos
//     DV    = Despesas Variáveis
//     AT    = Atividades Operacionais de Entrega (terceirizadas)
//     COM   = Comissões (apuradas pelo HUB)
//     DFIN  = Despesas Financeiras
//     IPD   = Impostos POR DENTRO (ICMS próprio, PIS, COFINS, ISS operacional)
//
//   Fixos:
//     CMP   = Custo MO Produtiva
//     MOI   = MO Indireta (Administrativa)
//     DF    = Despesas Fixas
//
// Fórmulas:
//   MC$  = ROB − (CP + DV + AT + COM + DFIN + IPD)  em R$/mês
//   IMC  = MC$ / ROB
//   CF$  = (CMP + MOI + DF) × RB     [fixos% incidem sobre RB conforme apurados pelo HUB]
//   PE   = CF$ / IMC
//
// Regimes:
//   Lucro Real / Presumido: IPF deduz da RB; IPD entra como variável.
//   Simples Nacional:       IPF = 0 (DAS é unificado e entra inteiro em IPD via REGIME_TRIBUTARIO).
//
// Guards:
//   ROB ≤ 0 → "Receita operacional inválida para cálculo do PE."
//   IMC ≤ 0 → "Operação sem margem de contribuição positiva."

export interface BreakevenInput {
  // Percentuais variáveis (% sobre faturamento — RB)
  productCostPct: number
  variableExpensePct: number
  commissionPct: number
  taxesInsidePct: number             // IPD
  financialExpensePct: number
  outsourcedActivitiesPct: number    // AT (novo)
  // Percentuais que deduzem a receita (% sobre faturamento — RB)
  externalTaxesPct: number           // IPF (novo)
  deducaoReceitaPct: number          // DEDUCAO_RECEITA (novo)
  // Percentuais fixos (% sobre faturamento — RB)
  productionLaborPct: number
  adminLaborPct: number
  fixedExpensePct: number
  // Faturamento médio mensal — RB (R$)
  averageRevenue: number
  // Regime tributário (para tratar Simples Nacional)
  taxRegime?: string | null
}

export interface BreakevenResult {
  breakeven: number | null
  isValid: boolean
  reason?: string
  totalVariablePct: number
  marginOfContribution: number
  fixedCostMonthly: number
  /** Receita Operacional Base mensal (R$) = RB − IPF − DEDUCAO. */
  rob: number
}

export function calculateBreakeven(input: BreakevenInput): BreakevenResult {
  const averageRevenue = Number(input.averageRevenue) || 0
  const taxRegime = input.taxRegime || ''
  const isSimplesNacional = taxRegime === 'SIMPLES_NACIONAL'

  // No Simples Nacional o DAS é unificado: IPF = 0 (o DAS inteiro entra em IPD via REGIME_TRIBUTARIO).
  const effectiveIpfPct = isSimplesNacional ? 0 : (Number(input.externalTaxesPct) || 0)
  const deducaoPct = Number(input.deducaoReceitaPct) || 0

  // ROB = RB × (1 − IPF% − DEDUCAO%)
  const robFactor = Math.max(0, 1 - effectiveIpfPct / 100 - deducaoPct / 100)
  const rob = averageRevenue * robFactor

  // Variáveis em R$/mês (sobre RB, conforme apurados pelo HUB)
  const variableExpensePct =
    (Number(input.productCostPct) || 0) +
    (Number(input.variableExpensePct) || 0) +
    (Number(input.commissionPct) || 0) +
    (Number(input.taxesInsidePct) || 0) +
    (Number(input.financialExpensePct) || 0) +
    (Number(input.outsourcedActivitiesPct) || 0)
  const variableCostMonthly = (variableExpensePct / 100) * averageRevenue

  // MC$ = ROB − Variáveis$
  const marginContributionMonthly = rob - variableCostMonthly
  const marginOfContribution = rob > 0 ? marginContributionMonthly / rob : 0

  // Fixos em R$/mês (sobre RB, conforme apurados pelo HUB)
  const totalFixedPct =
    (Number(input.productionLaborPct) || 0) +
    (Number(input.adminLaborPct) || 0) +
    (Number(input.fixedExpensePct) || 0)
  const fixedCostMonthly = (totalFixedPct / 100) * averageRevenue

  if (averageRevenue <= 0) {
    return {
      breakeven: null,
      isValid: false,
      reason: 'Faturamento médio do HUB indisponível — registre receitas para calcular.',
      totalVariablePct: variableExpensePct,
      marginOfContribution,
      fixedCostMonthly,
      rob,
    }
  }

  if (rob <= 0) {
    return {
      breakeven: null,
      isValid: false,
      reason: 'Receita operacional inválida para cálculo do PE.',
      totalVariablePct: variableExpensePct,
      marginOfContribution,
      fixedCostMonthly,
      rob,
    }
  }

  if (marginOfContribution <= 0) {
    return {
      breakeven: null,
      isValid: false,
      reason: 'Operação sem margem de contribuição positiva.',
      totalVariablePct: variableExpensePct,
      marginOfContribution,
      fixedCostMonthly,
      rob,
    }
  }

  if (totalFixedPct <= 0) {
    return {
      breakeven: null,
      isValid: false,
      reason: 'Custos fixos zerados — não há ponto de equilíbrio operacional.',
      totalVariablePct: variableExpensePct,
      marginOfContribution,
      fixedCostMonthly,
      rob,
    }
  }

  return {
    breakeven: Math.round((fixedCostMonthly / marginOfContribution) * 100) / 100,
    isValid: true,
    totalVariablePct: variableExpensePct,
    marginOfContribution,
    fixedCostMonthly,
    rob,
  }
}

export function buildBreakevenInputFromConfig(cfg: any, taxRegime?: string | null): BreakevenInput {
  // Todos os percentuais saem do HUB (persistidos em tenant_expense_config).
  // Sprint Mai/2026 v2: separação IPD/IPF/AT/DEDUCAO + tratamento por regime.
  const c = cfg || {}
  return {
    productCostPct: Number(c.product_cost_percent) || 0,
    variableExpensePct: Number(c.variable_expense_percent) || 0,
    commissionPct: Number(c.commission_percent_hub) || 0,
    taxesInsidePct: Number(c.tax_on_revenue_percent) || 0,
    financialExpensePct: Number(c.financial_expense_percent) || 0,
    outsourcedActivitiesPct: Number(c.outsourced_activities_percent) || 0,
    externalTaxesPct: Number(c.external_taxes_percent) || 0,
    deducaoReceitaPct: Number(c.deducao_receita_percent) || 0,
    productionLaborPct: Number(c.production_labor_percent) || 0,
    adminLaborPct: Number(c.indirect_labor_percent) || 0,
    fixedExpensePct: Number(c.fixed_expense_percent) || 0,
    averageRevenue: Number(c.hub_average_revenue) || 0,
    taxRegime: taxRegime || null,
  }
}
