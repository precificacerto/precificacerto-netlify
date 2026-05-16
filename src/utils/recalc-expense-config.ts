import { supabase } from '@/supabase/client'
import { calculateHubData, calculateHubDataPrevMonth, extractStructurePercents } from '@/utils/hub-engine'

export interface ExpenseConfigResult {
  production_labor_cost: number
  /** Custo médio mensal de mão de obra produtiva do Hub (R$/mês). */
  production_labor_cost_hub: number
  /** Custo médio mensal de mão de obra administrativa (R$/mês), apenas para exibição. */
  admin_labor_monthly: number
  /** Custo médio mensal de despesas fixas do Hub (R$/mês). */
  fixed_expense_monthly: number
  indirect_labor_percent: number
  fixed_expense_percent: number
  financial_expense_percent: number
  variable_expense_percent: number
  /** % de MO Produtiva sobre o faturamento — Sprint 4 (PE). */
  production_labor_percent: number
  /** % de Custo dos Produtos sobre o faturamento — Sprint 4 (PE). */
  product_cost_percent: number
  /** Faturamento médio mensal apurado pelo HUB (R$/mês) — Sprint 4 (PE). */
  hub_average_revenue: number
  /** IPD — Impostos POR DENTRO (IMPOSTO_FATURAMENTO_DENTRO + REGIME_TRIBUTARIO). Entra na MC. */
  tax_on_revenue_percent: number
  /** Grupo COMISSOES do HUB. Entra na MC. */
  commission_percent_hub: number
  /** IPF — Impostos POR FORA (grupo IMPOSTO). Deduz da RB para formar ROB. */
  external_taxes_percent: number
  /** AT — Atividades Operacionais de Entrega (ATIVIDADES_TERCEIRIZADAS). Entra na MC. */
  outsourced_activities_percent: number
  /** DEDUCAO_RECEITA — devoluções, estornos, abatimentos. Deduz da RB para formar ROB. */
  deducao_receita_percent: number
}

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Recalcula percentuais de despesa baseando-se na MÉDIA HISTÓRICA de todos os meses
 * fechados do Hub (cash_entries) — não apenas no mês anterior.
 *
 * Fórmula padrão:       % = (soma_grupo / soma_INCOME) × 100   (sobre todo o histórico)
 * Fórmula LR/Híbrido:   % = (soma_grupo / receitaBrutaBase) × 100
 *   onde receitaBrutaBase = totalIncome_histórico - IMPOSTO (por fora) - ATIVIDADES_TERCEIRIZADAS
 *
 * Sprint Mai/2026: alterado de hubDataPrevMonth para hubDataAll (média histórica).
 * Antes os % oscilavam mês a mês conforme lançamentos pontuais; agora refletem
 * a média estável da operação.
 */
export async function recalcExpenseConfigFromCashflow(
  tenantId: string,
): Promise<ExpenseConfigResult | null> {
  const [hubDataPrev, hubDataAll, tsResult] = await Promise.all([
    calculateHubDataPrevMonth(tenantId),
    calculateHubData(tenantId),
    supabase.from('tenant_settings').select('tax_regime').eq('tenant_id', tenantId).maybeSingle(),
  ])

  // Usa o histórico completo como fonte primária dos percentuais.
  // Mantém hubDataPrev disponível para fallback se o histórico estiver vazio
  // mas o mês anterior já tem dados (cenário de tenant novo no 2º mês).
  const hubData = hubDataAll.months.length > 0 ? hubDataAll : hubDataPrev

  if (hubData.months.length === 0 || hubData.totalIncome === 0) return null

  const taxRegime = (tsResult.data as any)?.tax_regime ?? null
  const isLrOrHibrido = taxRegime === 'LUCRO_REAL' || taxRegime === 'SIMPLES_HIBRIDO'

  // Para LR/Híbrido usa receitaBrutaBase como denominador (= FT - impostos por fora - terceirizados)
  // Isso alinha os % de estrutura com a base 100% do DRE, onde impostos por fora reduzem a receita.
  let customBase: number | undefined
  if (isLrOrHibrido) {
    const impostoSum = hubData.rows.find((r) => r.group === 'IMPOSTO')?.totalSum ?? 0
    const terceirizadosSum = hubData.rows.find((r) => r.group === 'ATIVIDADES_TERCEIRIZADAS')?.totalSum ?? 0
    const base = hubData.totalIncome - impostoSum - terceirizadosSum
    customBase = base > 0 ? base : hubData.totalIncome // fallback: se base <= 0, usa totalIncome
  }

  const percents = extractStructurePercents(hubData, customBase)

  // MO Produtiva: buscamos o custo absoluto médio mensal (R$/mês) da tabela,
  // pois é usado pelo motor como custo monetário (não percentual)
  const { data: expConfig } = await supabase
    .from('tenant_expense_config')
    .select('production_labor_cost')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Calcula MO Administrativa média em R$/mês para exibição (média histórica)
  const moAdminRow = hubData.rows.find(
    (r) => r.group === 'MAO_DE_OBRA_ADMINISTRATIVA' || r.group === 'MAO_DE_OBRA',
  )
  const adminLaborMonthly = moAdminRow ? round2(moAdminRow.averageRS) : 0

  // Calcula MO Produtiva média em R$/mês a partir do Hub (média histórica)
  const moProdRow = hubData.rows.find((r) => r.group === 'MAO_DE_OBRA_PRODUTIVA')
  const productionLaborCostHub = moProdRow ? round2(moProdRow.averageRS) : 0

  // Calcula Despesas Fixas média em R$/mês a partir do Hub (média histórica)
  const despesaFixaRow = hubData.rows.find((r) => r.group === 'DESPESA_FIXA')
  const fixedExpenseMonthly = despesaFixaRow ? round2(despesaFixaRow.averageRS) : 0

  // % de Custo dos Produtos sobre faturamento (média histórica)
  const custoProdutosRow = hubData.rows.find((r) => r.group === 'CUSTO_PRODUTOS')
  const productCostPctDecimal = custoProdutosRow
    ? (customBase != null && customBase > 0
        ? custoProdutosRow.totalSum / customBase
        : custoProdutosRow.averagePct / 100)
    : 0

  // Faturamento médio do HUB (média mensal de todos os meses fechados).
  const hubAverageRevenue = hubDataAll.totalIncomeMonthsCount > 0
    ? round2(hubDataAll.totalIncome / hubDataAll.totalIncomeMonthsCount)
    : 0

  return {
    production_labor_cost: Number(expConfig?.production_labor_cost) || 0,
    production_labor_cost_hub: productionLaborCostHub,
    admin_labor_monthly: adminLaborMonthly,
    fixed_expense_monthly: fixedExpenseMonthly,
    indirect_labor_percent: round2(percents.indirect_labor_percent * 100), // salva em %
    fixed_expense_percent: round2(percents.fixed_expense_percent * 100),
    financial_expense_percent: round2(percents.financial_expense_percent * 100),
    variable_expense_percent: round2(percents.variable_expense_percent * 100),
    production_labor_percent: round2(percents.production_labor_cost_percent * 100),
    product_cost_percent: round2(productCostPctDecimal * 100),
    hub_average_revenue: hubAverageRevenue,
    tax_on_revenue_percent: round2(percents.tax_on_revenue_percent * 100),
    commission_percent_hub: round2(percents.commission_percent_hub * 100),
    external_taxes_percent: round2(percents.external_taxes_percent * 100),
    outsourced_activities_percent: round2(percents.outsourced_activities_percent * 100),
    deducao_receita_percent: round2(percents.deducao_receita_percent * 100),
  }
}

/**
 * Recalcula e salva os percentuais do Hub em tenant_expense_config.
 * Preserva campos manuais (commission, profit, production_labor_cost).
 */
export async function mergeExpenseConfig(tenantId: string): Promise<ExpenseConfigResult | null> {
  const result = await recalcExpenseConfigFromCashflow(tenantId)
  if (!result) return null

  const { data: existing } = await supabase
    .from('tenant_expense_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .single()

  const configData = {
    admin_salary_total: result.admin_labor_monthly,
    admin_fgts_total: 0,
    admin_other_costs: 0,
    admin_labor_percent: result.indirect_labor_percent,
    indirect_labor_percent: result.indirect_labor_percent,
    fixed_expense_percent: result.fixed_expense_percent,
    financial_expense_percent: result.financial_expense_percent,
    variable_expense_percent: result.variable_expense_percent,
    production_labor_cost_hub: result.production_labor_cost_hub,
    fixed_expense_monthly: result.fixed_expense_monthly,
    production_labor_percent: result.production_labor_percent,
    product_cost_percent: result.product_cost_percent,
    hub_average_revenue: result.hub_average_revenue,
    tax_on_revenue_percent: result.tax_on_revenue_percent,
    commission_percent_hub: result.commission_percent_hub,
    external_taxes_percent: result.external_taxes_percent,
    outsourced_activities_percent: result.outsourced_activities_percent,
    deducao_receita_percent: result.deducao_receita_percent,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    await supabase.from('tenant_expense_config').update(configData).eq('id', existing.id)
  } else {
    await supabase.from('tenant_expense_config').insert({ tenant_id: tenantId, ...configData })
  }

  return result
}

/** @deprecated Use mergeExpenseConfig instead */
export const ensureExpenseConfig = mergeExpenseConfig
