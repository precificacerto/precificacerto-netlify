import { supabase } from '@/supabase/client'

export interface ExpenseConfigResult {
  production_labor_cost: number
  /** Custo médio mensal de mão de obra administrativa (R$/mês), apenas para exibição. */
  admin_labor_monthly: number
  indirect_labor_percent: number
  fixed_expense_percent: number
  financial_expense_percent: number
  variable_expense_percent: number
}

const round2 = (v: number) => Math.round(v * 100) / 100
const cap = (v: number, max = 100) => Math.min(v, max)

/**
 * Recalculates expense percentages from cashflow data.
 *
 * Fórmula base: % = (Total da despesa ÷ número de meses) ÷ média mensal da receita × 100
 *               = (média mensal da despesa) ÷ (média mensal da receita) × 100
 *
 * Janela: últimos 12 meses do fluxo; monthCount = meses distintos com despesa.
 *
 * Receita mensal de referência:
 *  1) Média mensal das RECEITAS reais do fluxo (INCOME), considerando apenas
 *     meses em que houve receita.
 *  2) Fallback: simples_revenue_12m ÷ 12 (valor configurado no onboarding).
 *  3) Usa-se o MAIOR entre (1) e (2), para evitar que poucos lançamentos de
 *     receita distorçam o percentual de despesas.
 */
export async function recalcExpenseConfigFromCashflow(
  tenantId: string,
): Promise<ExpenseConfigResult | null> {
  // Lógica alinhada com o que você descreveu:
  // - Considerar APENAS o mês atual do fluxo de caixa.
  // - Somar todas as despesas lançadas como Mão de Obra Produtiva.
  // - Somar todas as despesas lançadas como Mão de Obra Administrativa.
  // - Usar essas somas como base em R$/mês para Configurações.

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const monthStartStr = monthStart.toISOString().substring(0, 10)
  const monthEndStr = monthEnd.toISOString().substring(0, 10)

  const [expensesRes, settingsRes, incomesRes] = await Promise.all([
    supabase
      .from('cash_entries')
      .select('amount, expense_group, due_date')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('type', 'EXPENSE')
      .not('expense_group', 'is', null)
      .gte('due_date', monthStartStr)
      .lte('due_date', monthEndStr),
    supabase
      .from('tenant_settings')
      .select('simples_revenue_12m')
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('cash_entries')
      .select('amount, due_date')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('type', 'INCOME')
      .gte('due_date', monthStartStr)
      .lte('due_date', monthEndStr),
  ])

  const tenantSettings = settingsRes.data as { simples_revenue_12m?: string | number } | null
  const expenses = (expensesRes.data || []) as { amount: number; expense_group: string; due_date: string }[]

  if (expenses.length === 0) return null

  let totalProdutiva = 0
  let totalAdministrativa = 0
  let totalFixed = 0
  let totalFinancial = 0
  let totalVariable = 0

  for (const e of expenses) {
    const amt = Number(e.amount) || 0
    switch (e.expense_group) {
      case 'MAO_DE_OBRA_PRODUTIVA':
        totalProdutiva += amt
        break
      case 'MAO_DE_OBRA_ADMINISTRATIVA':
      case 'MAO_DE_OBRA': // legado
        totalAdministrativa += amt
        break
      case 'DESPESA_FIXA': totalFixed += amt; break
      case 'DESPESA_FINANCEIRA': totalFinancial += amt; break
      case 'DESPESA_VARIAVEL': totalVariable += amt; break
    }
  }

  // Para a lógica que você pediu, usamos o valor TOTAL do mês corrente.
  // (não fazemos mais média em vários meses)

  // Receita mensal de referência — mês atual ou fallback para simples_revenue_12m/12
  const incomes = (incomesRes.data || []) as { amount: number; due_date: string }[]
  const revenueFromCashflow = incomes.reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0)

  const revenueFromSettings = tenantSettings?.simples_revenue_12m
    ? parseFloat(String(tenantSettings.simples_revenue_12m)) / 12
    : 0
  const monthlyRevenue = Math.max(revenueFromCashflow, revenueFromSettings)

  if (monthlyRevenue === 0) return null

  // Para sua regra, usamos diretamente os totais do mês corrente (dividindo por 1).
  const productiveMonthCount = 1
  const monthCount = 1

  const avgProdutiva = totalProdutiva / productiveMonthCount
  const avgAdministrativa = totalAdministrativa / monthCount
  const avgFixed = totalFixed / monthCount
  const avgFinancial = totalFinancial / monthCount
  const avgVariable = totalVariable / monthCount

  return {
    production_labor_cost: round2(avgProdutiva),
    admin_labor_monthly: round2(avgAdministrativa),
    indirect_labor_percent: round2(cap((avgAdministrativa / monthlyRevenue) * 100)),
    fixed_expense_percent: round2(cap((avgFixed / monthlyRevenue) * 100)),
    financial_expense_percent: round2(cap((avgFinancial / monthlyRevenue) * 100)),
    variable_expense_percent: round2(cap((avgVariable / monthlyRevenue) * 100)),
  }
}

/**
 * Always recalculates expense percentages from cashflow and merges into
 * tenant_expense_config, preserving manual fields (commission, profit).
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
    production_labor_cost: result.production_labor_cost,
    admin_salary_total: result.admin_labor_monthly,
    admin_fgts_total: 0,
    admin_other_costs: 0,
    admin_labor_percent: result.indirect_labor_percent,
    indirect_labor_percent: result.indirect_labor_percent,
    fixed_expense_percent: result.fixed_expense_percent,
    financial_expense_percent: result.financial_expense_percent,
    variable_expense_percent: result.variable_expense_percent,
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
