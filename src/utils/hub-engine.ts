import { supabase } from '@/supabase/client'

export interface HubMonthData {
  [monthKey: string]: number // ex: '2025-01': 1500.00
}

export interface HubRow {
  group: string
  label: string
  values: HubMonthData       // R$ por mês
  totalSum: number           // soma total nos meses encerrados
  closedMonthsWithData: number // quantos meses tiveram valor > 0 neste grupo
  averageRS: number          // totalSum / closedMonthsWithData
  averagePct: number         // (totalSum / totalIncomeInSameMonths) × 100
}

export interface HubData {
  months: string[]           // ex: ['2025-01', '2025-02', ...]
  rows: HubRow[]
  incomeByMonth: HubMonthData
  totalIncome: number
  totalIncomeMonthsCount: number
}

// Ordem e labels dos grupos exibidos no Hub
const HUB_GROUPS: { group: string; label: string }[] = [
  { group: 'MAO_DE_OBRA_PRODUTIVA',     label: 'MO Produtiva' },
  { group: 'MAO_DE_OBRA_ADMINISTRATIVA', label: 'MO Administrativa (Indireta)' },
  { group: 'MAO_DE_OBRA',               label: 'MO (Legado)' }, // retrocompat
  { group: 'DESPESA_FIXA',              label: 'Despesas Fixas' },
  { group: 'DESPESA_VARIAVEL',          label: 'Despesas Variáveis' },
  { group: 'DESPESA_FINANCEIRA',        label: 'Despesas Financeiras' },
  { group: 'IMPOSTO',                   label: 'Impostos' },
  { group: 'REGIME_TRIBUTARIO',         label: 'Tributos do Regime' },
]

/**
 * Calcula os dados do Hub baseando-se exclusivamente em meses encerrados.
 * "Mês encerrado" = due_date < início do mês atual.
 *
 * Fórmula do percentual:
 *   averagePct = (soma_grupo_meses_encerrados / soma_INCOME_meses_encerrados) × 100
 */
export async function calculateHubData(tenantId: string): Promise<HubData> {
  const now = new Date()
  // Cutoff: primeiro dia do mês atual — meses encerrados são antes disso
  const cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
  const cutoffStr = cutoff.toISOString().substring(0, 10) // 'YYYY-MM-DD'

  // Busca todos os lançamentos de meses encerrados
  const { data: entries, error } = await supabase
    .from('cash_entries')
    .select('type, amount, due_date, expense_group, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .lt('due_date', cutoffStr)
    .order('due_date', { ascending: true })

  if (error || !entries || entries.length === 0) {
    return { months: [], rows: [], incomeByMonth: {}, totalIncome: 0, totalIncomeMonthsCount: 0 }
  }

  // Agrupa dados por mês (YYYY-MM)
  const incomeByMonth: HubMonthData = {}
  const expenseByGroupByMonth: Record<string, HubMonthData> = {}

  for (const entry of entries) {
    const d = new Date(entry.due_date)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const amount = Number(entry.amount) || 0

    if (entry.type === 'INCOME') {
      incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + amount
    } else if (entry.type === 'EXPENSE' && entry.expense_group) {
      if (!expenseByGroupByMonth[entry.expense_group]) {
        expenseByGroupByMonth[entry.expense_group] = {}
      }
      expenseByGroupByMonth[entry.expense_group][monthKey] =
        (expenseByGroupByMonth[entry.expense_group][monthKey] || 0) + amount
    }
  }

  // Lista de meses ordenados que tiveram algum lançamento
  const allMonthsSet = new Set<string>([
    ...Object.keys(incomeByMonth),
    ...Object.values(expenseByGroupByMonth).flatMap((m) => Object.keys(m)),
  ])
  const months = Array.from(allMonthsSet).sort()

  // Soma total de INCOME nos meses encerrados
  const totalIncome = Object.values(incomeByMonth).reduce((s, v) => s + v, 0)
  const totalIncomeMonthsCount = Object.keys(incomeByMonth).length

  // Monta rows para cada grupo configurado
  const rows: HubRow[] = HUB_GROUPS
    .filter((g) => expenseByGroupByMonth[g.group]) // só grupos com dados
    .map((g) => {
      const values = expenseByGroupByMonth[g.group] || {}
      const totalSum = Object.values(values).reduce((s, v) => s + v, 0)
      const closedMonthsWithData = Object.values(values).filter((v) => v > 0).length
      const averageRS = closedMonthsWithData > 0 ? totalSum / closedMonthsWithData : 0

      // Percentual: soma do grupo / soma do INCOME nos meses que tiveram ambos
      // Para simplificar, usamos o totalIncome global (denominador único)
      const averagePct = totalIncome > 0 ? (totalSum / totalIncome) * 100 : 0

      return {
        group: g.group,
        label: g.label,
        values,
        totalSum,
        closedMonthsWithData,
        averageRS: Math.round(averageRS * 100) / 100,
        averagePct: Math.round(averagePct * 100) / 100,
      }
    })

  return { months, rows, incomeByMonth, totalIncome, totalIncomeMonthsCount }
}

/**
 * Extrai os percentuais de estrutura do Hub para alimentar tenant_expense_config.
 * Retorna os percentuais em DECIMAL 0-1 (ex: 0.1049 = 10,49%).
 */
export function extractStructurePercents(hubData: HubData): {
  indirect_labor_percent: number
  fixed_expense_percent: number
  variable_expense_percent: number
  financial_expense_percent: number
  production_labor_cost_percent: number
} {
  const findPct = (group: string) => {
    const row = hubData.rows.find((r) => r.group === group)
    return row ? row.averagePct / 100 : 0 // converte % para decimal
  }

  // MO Administrativa/Indireta (grupos que vão para o coeficiente)
  const moAdmin = findPct('MAO_DE_OBRA_ADMINISTRATIVA') + findPct('MAO_DE_OBRA')

  return {
    indirect_labor_percent: Math.round(moAdmin * 10000) / 10000,
    fixed_expense_percent:  Math.round(findPct('DESPESA_FIXA') * 10000) / 10000,
    variable_expense_percent: Math.round(findPct('DESPESA_VARIAVEL') * 10000) / 10000,
    financial_expense_percent: Math.round(findPct('DESPESA_FINANCEIRA') * 10000) / 10000,
    production_labor_cost_percent: Math.round(findPct('MAO_DE_OBRA_PRODUTIVA') * 10000) / 10000,
  }
}
