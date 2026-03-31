import { supabase } from '@/supabase/client'
import { calculateHubDataPrevMonth, extractStructurePercents } from '@/utils/hub-engine'

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
}

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Recalcula percentuais de despesa baseando-se APENAS no mês anterior ao mês atual,
 * usando os dados do Hub (cash_entries).
 *
 * Fórmula: % = (soma_grupo_mês_anterior / soma_INCOME_mês_anterior) × 100
 *
 * Apenas o mês anterior (due_date >= início mês anterior e < início mês atual) é considerado.
 * O mês em andamento é excluído para evitar distorção.
 */
export async function recalcExpenseConfigFromCashflow(
  tenantId: string,
): Promise<ExpenseConfigResult | null> {
  const hubData = await calculateHubDataPrevMonth(tenantId)

  if (hubData.months.length === 0 || hubData.totalIncome === 0) return null

  const percents = extractStructurePercents(hubData)

  // MO Produtiva: buscamos o custo absoluto médio mensal (R$/mês) da tabela,
  // pois é usado pelo motor como custo monetário (não percentual)
  const { data: expConfig } = await supabase
    .from('tenant_expense_config')
    .select('production_labor_cost')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Calcula MO Administrativa média em R$/mês para exibição
  const moAdminRow = hubData.rows.find(
    (r) => r.group === 'MAO_DE_OBRA_ADMINISTRATIVA' || r.group === 'MAO_DE_OBRA',
  )
  const adminLaborMonthly = moAdminRow ? round2(moAdminRow.averageRS) : 0

  // Calcula MO Produtiva média em R$/mês a partir do Hub
  const moProdRow = hubData.rows.find((r) => r.group === 'MAO_DE_OBRA_PRODUTIVA')
  const productionLaborCostHub = moProdRow ? round2(moProdRow.averageRS) : 0

  // Calcula Despesas Fixas média em R$/mês a partir do Hub
  const despesaFixaRow = hubData.rows.find((r) => r.group === 'DESPESA_FIXA')
  const fixedExpenseMonthly = despesaFixaRow ? round2(despesaFixaRow.averageRS) : 0

  return {
    production_labor_cost: Number(expConfig?.production_labor_cost) || 0,
    production_labor_cost_hub: productionLaborCostHub,
    admin_labor_monthly: adminLaborMonthly,
    fixed_expense_monthly: fixedExpenseMonthly,
    indirect_labor_percent: round2(percents.indirect_labor_percent * 100), // salva em %
    fixed_expense_percent: round2(percents.fixed_expense_percent * 100),
    financial_expense_percent: round2(percents.financial_expense_percent * 100),
    variable_expense_percent: round2(percents.variable_expense_percent * 100),
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
