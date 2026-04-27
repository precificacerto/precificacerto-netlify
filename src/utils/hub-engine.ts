import { supabase } from '@/supabase/client'
import { CASHIER_CATEGORY } from '@/constants/cashier-category'

export interface HubMonthData {
  [monthKey: string]: number // ex: '2025-01': 1500.00
}

export interface HubSubRow {
  categoryKey: string  // ex: 'FORNECEDORES'
  label: string        // ex: 'Fornecedores - Produtos para Revenda'
  values: HubMonthData
  totalSum: number
  closedMonthsWithData: number
  averageRS: number
  averagePct: number
}

export interface HubRow {
  group: string
  label: string
  values: HubMonthData       // R$ por mês (total do grupo)
  totalSum: number           // soma total nos meses encerrados
  closedMonthsWithData: number // quantos meses tiveram valor > 0 neste grupo
  averageRS: number          // totalSum / closedMonthsWithData
  averagePct: number         // (totalSum / totalIncomeInSameMonths) × 100
  subRows: HubSubRow[]       // detalhamento por categoria dentro do grupo
}

export interface HubData {
  months: string[]           // ex: ['2025-01', '2025-02', ...]
  rows: HubRow[]
  incomeByMonth: HubMonthData
  totalIncome: number
  totalIncomeMonthsCount: number
}

// Mapa de categoryKey → label a partir das constantes do projeto
const CATEGORY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  Object.values(CASHIER_CATEGORY.EXPENSE).map((c: any) => [c.key, c.value])
)

// Labels das sub-categorias virtuais de impostos (Lucro Real / Simples Híbrido — Custo dos Produtos)
const LR_TAX_CATEGORY_LABELS: Record<string, string> = {
  'LR_ICMS_CUSTO':       'ICMS (custo produto)',
  'LR_PIS_COFINS_CUSTO': 'PIS/COFINS (custo produto)',
  'LR_IPI_CUSTO':        'IPI (custo produto)',
  'LR_CBS_CUSTO':        'CBS (custo produto)',
  'LR_IBS_CUSTO':        'IBS (custo produto)',
}

/** Mescla PIS e COFINS em uma linha única "PIS/COFINS" no mapa de categorias. */
function mergePisCofins(expenseByCategoryByMonth: Record<string, { group: string; values: Record<string, number> }>) {
  const pisData = expenseByCategoryByMonth['LR_PIS_CUSTO']
  const cofinsData = expenseByCategoryByMonth['LR_COFINS_CUSTO']
  if (!pisData && !cofinsData) return
  const group = pisData?.group || cofinsData?.group || 'CUSTO_PRODUTOS'
  const allMonths = new Set([
    ...Object.keys(pisData?.values ?? {}),
    ...Object.keys(cofinsData?.values ?? {}),
  ])
  const merged: Record<string, number> = {}
  for (const m of allMonths) {
    merged[m] = (pisData?.values[m] ?? 0) + (cofinsData?.values[m] ?? 0)
  }
  if (Object.values(merged).some(v => v > 0)) {
    expenseByCategoryByMonth['LR_PIS_COFINS_CUSTO'] = { group, values: merged }
  }
  delete expenseByCategoryByMonth['LR_PIS_CUSTO']
  delete expenseByCategoryByMonth['LR_COFINS_CUSTO']
}

// Mapa de categoryKey → order (para ordenação)
const CATEGORY_ORDER_MAP: Record<string, number> = Object.fromEntries(
  Object.values(CASHIER_CATEGORY.EXPENSE).map((c: any) => [c.key, c.order ?? 999])
)

// Ordem e labels dos grupos exibidos no Hub
const HUB_GROUPS: { group: string; label: string }[] = [
  { group: 'CUSTO_PRODUTOS',              label: 'Custo dos Produtos' },
  { group: 'MAO_DE_OBRA_PRODUTIVA',       label: 'MO Produtiva' },
  { group: 'MAO_DE_OBRA_ADMINISTRATIVA',  label: 'MO Administrativa (Indireta)' },
  { group: 'MAO_DE_OBRA',                 label: 'MO (Legado)' }, // retrocompat
  { group: 'DESPESA_FIXA',                label: 'Despesas Fixas' },
  { group: 'DESPESA_VARIAVEL',            label: 'Despesas Variáveis' },
  { group: 'ATIVIDADES_TERCEIRIZADAS',    label: 'Atividades Terceirizadas' },
  { group: 'DESPESA_FINANCEIRA',          label: 'Despesas Financeiras' },
  { group: 'COMISSOES',                   label: 'Comissões' },
  { group: 'LUCRO',                       label: 'Lucro / Investimentos' },
  { group: 'IMPOSTO_LUCRO',              label: 'Impostos sobre o Lucro' },
  { group: 'IMPOSTO_FATURAMENTO_DENTRO', label: 'Impostos sobre o Faturamento (Por dentro)' },
  { group: 'IMPOSTO',                     label: 'Impostos sobre o Faturamento (Por fora)' },
  { group: 'REGIME_TRIBUTARIO',           label: 'Tributos do Regime' },
]

/**
 * Calcula os dados do Hub incluindo o mês atual (até o fim do mês corrente).
 * Exigência: EXPENSE deve ter paid_date (confirmada) para ser contabilizada.
 * INCOME com BOLETO/CHEQUE_PRE_DATADO também exige paid_date.
 *
 * Fórmula do percentual:
 *   averagePct = (soma_grupo / soma_INCOME) × 100
 */
export async function calculateHubData(tenantId: string): Promise<HubData> {
  const now = new Date()
  // Limite: último dia do mês ANTERIOR (exclui mês corrente para não distorcer médias de precificação).
  const lastDayDate = new Date(now.getFullYear(), now.getMonth(), 0)
  const endCutoffStr = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth() + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`

  // Busca todos os lançamentos até o último dia do mês anterior (exclui mês corrente)
  const { data: entries, error } = await supabase
    .from('cash_entries')
    .select('type, amount, due_date, expense_group, expense_category, is_active, paid_date, payment_method, valor_nf, valor_icms, valor_pis, valor_cofins, valor_ipi, valor_cbs, valor_ibs')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .lte('due_date', endCutoffStr)
    .order('due_date', { ascending: true })

  if (error || !entries || entries.length === 0) {
    return { months: [], rows: [], incomeByMonth: {}, totalIncome: 0, totalIncomeMonthsCount: 0 }
  }

  // Agrupa dados por mês (YYYY-MM)
  const incomeByMonth: HubMonthData = {}
  const expenseByGroupByMonth: Record<string, HubMonthData> = {}
  // { categoryKey -> { group, values: { monthKey -> total } } }
  const expenseByCategoryByMonth: Record<string, { group: string; values: HubMonthData }> = {}

  for (const entry of entries) {
    // Extrai YYYY-MM direto da string para evitar problema de timezone:
    // new Date('2026-02-01') é interpretado como UTC, que no Brasil (UTC-3)
    // vira 2026-01-31 no horário local, causando o mês errado.
    const monthKey = (entry.due_date as string).substring(0, 7) // 'YYYY-MM'
    const amount = Number(entry.amount) || 0

    if (entry.type === 'INCOME') {
      // Excluir BOLETO/CHEQUE pendentes (sem paid_date = não confirmados)
      if ((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') && !entry.paid_date) continue
      incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + amount
    } else if (entry.type === 'EXPENSE' && entry.expense_group) {
      // Somente despesas confirmadas (paid_date preenchido)
      if (!entry.paid_date) continue

      // Breakdown LR/Simples Híbrido: detectado por qualquer coluna de imposto preenchida
      const hasLrBreakdown = entry.valor_icms != null || entry.valor_pis != null || entry.valor_cofins != null || entry.valor_ipi != null
        || entry.valor_cbs != null || entry.valor_ibs != null

      // Nível grupo: sempre usa o amount total
      if (!expenseByGroupByMonth[entry.expense_group]) {
        expenseByGroupByMonth[entry.expense_group] = {}
      }
      expenseByGroupByMonth[entry.expense_group][monthKey] =
        (expenseByGroupByMonth[entry.expense_group][monthKey] || 0) + amount

      // Nível categoria (detalhe dentro do grupo)
      if (entry.expense_category) {
        const catKey = entry.expense_category as string
        if (!expenseByCategoryByMonth[catKey]) {
          expenseByCategoryByMonth[catKey] = { group: entry.expense_group, values: {} }
        }

        // Para CUSTO_PRODUTOS com breakdown LR/Simples Híbrido: valor da categoria = amount − impostos recuperáveis
        // (os impostos aparecem como sub-rows somados separadamente)
        const isCustoProdutos = entry.expense_group === 'CUSTO_PRODUTOS'
        const taxDeduction = (hasLrBreakdown && isCustoProdutos)
          ? (Number(entry.valor_icms) || 0) + (Number(entry.valor_pis) || 0)
            + (Number(entry.valor_cofins) || 0) + (Number(entry.valor_ipi) || 0)
            + (Number(entry.valor_cbs) || 0) + (Number(entry.valor_ibs) || 0)
          : 0

        expenseByCategoryByMonth[catKey].values[monthKey] =
          (expenseByCategoryByMonth[catKey].values[monthKey] || 0) + amount - taxDeduction

        // Sub-rows de impostos (Lucro Real / Simples Híbrido — Custo dos Produtos): somados de todas as categorias
        if (hasLrBreakdown && isCustoProdutos) {
          const addTaxCat = (key: string, val: number) => {
            if (!val) return
            if (!expenseByCategoryByMonth[key]) {
              expenseByCategoryByMonth[key] = { group: entry.expense_group as string, values: {} }
            }
            expenseByCategoryByMonth[key].values[monthKey] =
              (expenseByCategoryByMonth[key].values[monthKey] || 0) + val
          }
          addTaxCat('LR_ICMS_CUSTO', Number(entry.valor_icms) || 0)
          addTaxCat('LR_PIS_CUSTO', Number(entry.valor_pis) || 0)
          addTaxCat('LR_COFINS_CUSTO', Number(entry.valor_cofins) || 0)
          addTaxCat('LR_IPI_CUSTO', Number(entry.valor_ipi) || 0)
          addTaxCat('LR_CBS_CUSTO', Number(entry.valor_cbs) || 0)
          addTaxCat('LR_IBS_CUSTO', Number(entry.valor_ibs) || 0)
        }
      }
    }
  }

  // Merge PIS + COFINS em linha única PIS/COFINS
  mergePisCofins(expenseByCategoryByMonth)

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
      const averagePct = totalIncome > 0 ? (totalSum / totalIncome) * 100 : 0

      // Sub-rows: categorias com dados dentro deste grupo, ordenadas por order
      const subRows: HubSubRow[] = Object.entries(expenseByCategoryByMonth)
        .filter(([, cd]) => cd.group === g.group)
        .sort(([a], [b]) => (CATEGORY_ORDER_MAP[a] ?? 999) - (CATEGORY_ORDER_MAP[b] ?? 999))
        .map(([catKey, cd]) => {
          const catValues = cd.values
          const catTotalSum = Object.values(catValues).reduce((s, v) => s + v, 0)
          const catClosedMonths = Object.values(catValues).filter((v) => v > 0).length
          const catAverageRS = catClosedMonths > 0 ? catTotalSum / catClosedMonths : 0
          const catAveragePct = totalIncome > 0 ? (catTotalSum / totalIncome) * 100 : 0
          return {
            categoryKey: catKey,
            label: CATEGORY_LABEL_MAP[catKey] || LR_TAX_CATEGORY_LABELS[catKey] || catKey,
            values: catValues,
            totalSum: catTotalSum,
            closedMonthsWithData: catClosedMonths,
            averageRS: Math.round(catAverageRS * 100) / 100,
            averagePct: Math.round(catAveragePct * 100) / 100,
          }
        })

      return {
        group: g.group,
        label: g.label,
        values,
        totalSum,
        closedMonthsWithData,
        averageRS: Math.round(averageRS * 100) / 100,
        averagePct: Math.round(averagePct * 100) / 100,
        subRows,
      }
    })

  return { months, rows, incomeByMonth, totalIncome, totalIncomeMonthsCount }
}

/**
 * Calcula os dados do Hub baseando-se APENAS no mês anterior ao mês atual.
 * "Mês anterior" = mês imediatamente antes do mês corrente.
 *
 * Exemplo: se estamos em março/2026, busca apenas fevereiro/2026.
 *
 * Use esta função para recalcular percentuais automáticos de estrutura,
 * mantendo a base sempre no mês mais recente e completo.
 */
export async function calculateHubDataPrevMonth(tenantId: string): Promise<HubData> {
  const now = new Date()
  // Cutoff: primeiro dia do mês atual (excluir mês em andamento)
  const cutoffStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  // Início do mês anterior: primeiro dia do mês anterior ao cutoff
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`

  // Busca lançamentos apenas do mês anterior (>= início mês anterior e < início mês atual)
  const { data: entries, error } = await supabase
    .from('cash_entries')
    .select('type, amount, due_date, expense_group, expense_category, is_active, valor_nf, valor_icms, valor_pis, valor_cofins, valor_ipi, valor_cbs, valor_ibs')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .gte('due_date', prevMonthStr)
    .lt('due_date', cutoffStr)
    .order('due_date', { ascending: true })

  if (error || !entries || entries.length === 0) {
    return { months: [], rows: [], incomeByMonth: {}, totalIncome: 0, totalIncomeMonthsCount: 0 }
  }

  // Agrupa dados por mês (YYYY-MM)
  const incomeByMonth: HubMonthData = {}
  const expenseByGroupByMonth: Record<string, HubMonthData> = {}
  const expenseByCategoryByMonth: Record<string, { group: string; values: HubMonthData }> = {}

  for (const entry of entries) {
    const monthKey = (entry.due_date as string).substring(0, 7) // 'YYYY-MM'
    const amount = Number(entry.amount) || 0

    if (entry.type === 'INCOME') {
      incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + amount
    } else if (entry.type === 'EXPENSE' && entry.expense_group) {
      const hasLrBreakdown = entry.valor_icms != null || entry.valor_pis != null || entry.valor_cofins != null || entry.valor_ipi != null
        || entry.valor_cbs != null || entry.valor_ibs != null

      if (!expenseByGroupByMonth[entry.expense_group]) {
        expenseByGroupByMonth[entry.expense_group] = {}
      }
      expenseByGroupByMonth[entry.expense_group][monthKey] =
        (expenseByGroupByMonth[entry.expense_group][monthKey] || 0) + amount

      if (entry.expense_category) {
        const catKey = entry.expense_category as string
        if (!expenseByCategoryByMonth[catKey]) {
          expenseByCategoryByMonth[catKey] = { group: entry.expense_group, values: {} }
        }

        const isCustoProdutos = entry.expense_group === 'CUSTO_PRODUTOS'
        const taxDeduction = (hasLrBreakdown && isCustoProdutos)
          ? (Number(entry.valor_icms) || 0) + (Number(entry.valor_pis) || 0)
            + (Number(entry.valor_cofins) || 0) + (Number(entry.valor_ipi) || 0)
            + (Number(entry.valor_cbs) || 0) + (Number(entry.valor_ibs) || 0)
          : 0

        expenseByCategoryByMonth[catKey].values[monthKey] =
          (expenseByCategoryByMonth[catKey].values[monthKey] || 0) + amount - taxDeduction

        if (hasLrBreakdown && isCustoProdutos) {
          const addTaxCat = (key: string, val: number) => {
            if (!val) return
            if (!expenseByCategoryByMonth[key]) {
              expenseByCategoryByMonth[key] = { group: entry.expense_group as string, values: {} }
            }
            expenseByCategoryByMonth[key].values[monthKey] =
              (expenseByCategoryByMonth[key].values[monthKey] || 0) + val
          }
          addTaxCat('LR_ICMS_CUSTO', Number(entry.valor_icms) || 0)
          addTaxCat('LR_PIS_CUSTO', Number(entry.valor_pis) || 0)
          addTaxCat('LR_COFINS_CUSTO', Number(entry.valor_cofins) || 0)
          addTaxCat('LR_IPI_CUSTO', Number(entry.valor_ipi) || 0)
          addTaxCat('LR_CBS_CUSTO', Number(entry.valor_cbs) || 0)
          addTaxCat('LR_IBS_CUSTO', Number(entry.valor_ibs) || 0)
        }
      }
    }
  }

  mergePisCofins(expenseByCategoryByMonth)

  const allMonthsSet = new Set<string>([
    ...Object.keys(incomeByMonth),
    ...Object.values(expenseByGroupByMonth).flatMap((m) => Object.keys(m)),
  ])
  const months = Array.from(allMonthsSet).sort()

  const totalIncome = Object.values(incomeByMonth).reduce((s, v) => s + v, 0)
  const totalIncomeMonthsCount = Object.keys(incomeByMonth).length

  const rows: HubRow[] = HUB_GROUPS
    .filter((g) => expenseByGroupByMonth[g.group])
    .map((g) => {
      const values = expenseByGroupByMonth[g.group] || {}
      const totalSum = Object.values(values).reduce((s, v) => s + v, 0)
      const closedMonthsWithData = Object.values(values).filter((v) => v > 0).length
      const averageRS = closedMonthsWithData > 0 ? totalSum / closedMonthsWithData : 0
      const averagePct = totalIncome > 0 ? (totalSum / totalIncome) * 100 : 0

      const subRows: HubSubRow[] = Object.entries(expenseByCategoryByMonth)
        .filter(([, cd]) => cd.group === g.group)
        .sort(([a], [b]) => (CATEGORY_ORDER_MAP[a] ?? 999) - (CATEGORY_ORDER_MAP[b] ?? 999))
        .map(([catKey, cd]) => {
          const catValues = cd.values
          const catTotalSum = Object.values(catValues).reduce((s, v) => s + v, 0)
          const catClosedMonths = Object.values(catValues).filter((v) => v > 0).length
          const catAverageRS = catClosedMonths > 0 ? catTotalSum / catClosedMonths : 0
          const catAveragePct = totalIncome > 0 ? (catTotalSum / totalIncome) * 100 : 0
          return {
            categoryKey: catKey,
            label: CATEGORY_LABEL_MAP[catKey] || LR_TAX_CATEGORY_LABELS[catKey] || catKey,
            values: catValues,
            totalSum: catTotalSum,
            closedMonthsWithData: catClosedMonths,
            averageRS: Math.round(catAverageRS * 100) / 100,
            averagePct: Math.round(catAveragePct * 100) / 100,
          }
        })

      return {
        group: g.group,
        label: g.label,
        values,
        totalSum,
        closedMonthsWithData,
        averageRS: Math.round(averageRS * 100) / 100,
        averagePct: Math.round(averagePct * 100) / 100,
        subRows,
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
