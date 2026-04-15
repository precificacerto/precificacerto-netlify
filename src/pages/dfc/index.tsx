import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Alert, Button, Select, Spin, Tooltip } from 'antd'
import { FileExcelOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { exportDfcToExcel } from '@/utils/export-dfc-excel'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { getTenantId } from '@/utils/get-tenant-id'

// ── Types ──

type TaxRegime = 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES_NACIONAL' | 'SIMPLES_HIBRIDO' | 'PRESUMIDO_RET' | 'MEI' | string

type CalcType = 'INDUSTRIALIZATION' | 'RESALE' | 'SERVICE' | string

type MonthlyValues = {
  jan: number; feb: number; mar: number; apr: number; may: number; jun: number
  jul: number; aug: number; sep: number; oct: number; nov: number; dec: number
}

type DreRow = {
  key: string
  label: string
  values: MonthlyValues
  total: number
  isHeader?: boolean
  isTotal?: boolean
  isSubtotal?: boolean
  indent?: number
  sign?: '+' | '-' | '='
  pctOfRL?: MonthlyValues & { total: number }
}

const EMPTY_MONTHS: MonthlyValues = {
  jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
  jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
}

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Row keys that represent revenue deductions (above/at receita_liquida).
// These rows should be shown as % of Receita Bruta, not Receita Líquida.
const RECEITA_BRUTA_DENOMINATOR_KEYS = new Set([
  'receita_bruta',
  'deducoes_trib', 'das',                            // Simples Nacional / MEI
  'deducoes_trib_receita', 'deducoes_trib_compras',  // Lucro Real / Presumido
  'receita_liquida',                                  // All variants
])

// ── Period aggregation ──

type PeriodType = 'mensal' | 'trimestral' | 'semestral' | 'anual'

type PeriodColumn = {
  label: string
  monthKeys: (keyof MonthlyValues)[]
}

function getPeriodColumns(period: PeriodType, selectedMonth?: number): PeriodColumn[] {
  switch (period) {
    case 'mensal':
      // selectedMonth is 0-indexed
      const mIdx = selectedMonth ?? 0
      return [{ label: MONTH_LABELS[mIdx], monthKeys: [MONTH_KEYS[mIdx]] }]
    case 'trimestral':
      return [
        { label: '1° Tri (Jan-Mar)', monthKeys: ['jan', 'feb', 'mar'] },
        { label: '2° Tri (Abr-Jun)', monthKeys: ['apr', 'may', 'jun'] },
        { label: '3° Tri (Jul-Set)', monthKeys: ['jul', 'aug', 'sep'] },
        { label: '4° Tri (Out-Dez)', monthKeys: ['oct', 'nov', 'dec'] },
      ]
    case 'semestral':
      return [
        { label: '1° Sem (Jan-Jun)', monthKeys: ['jan', 'feb', 'mar', 'apr', 'may', 'jun'] },
        { label: '2° Sem (Jul-Dez)', monthKeys: ['jul', 'aug', 'sep', 'oct', 'nov', 'dec'] },
      ]
    case 'anual':
      return [{ label: 'Ano', monthKeys: [...MONTH_KEYS] }]
  }
}

function aggregatePeriodValue(values: MonthlyValues, monthKeys: (keyof MonthlyValues)[]): number {
  return monthKeys.reduce((sum, k) => sum + values[k], 0)
}


// Map due_date month index (0-based) to our MonthlyValues key
const MONTH_INDEX_TO_KEY: Record<number, keyof MonthlyValues> = {
  0: 'jan', 1: 'feb', 2: 'mar', 3: 'apr', 4: 'may', 5: 'jun',
  6: 'jul', 7: 'aug', 8: 'sep', 9: 'oct', 10: 'nov', 11: 'dec',
}

// ── Utilities ──

function sumMonths(a: MonthlyValues, b: MonthlyValues): MonthlyValues {
  const r = { ...EMPTY_MONTHS }
  for (const k of MONTH_KEYS) r[k] = a[k] + b[k]
  return r
}

function subtractMonths(a: MonthlyValues, b: MonthlyValues): MonthlyValues {
  const r = { ...EMPTY_MONTHS }
  for (const k of MONTH_KEYS) r[k] = a[k] - b[k]
  return r
}

function totalOfMonths(v: MonthlyValues): number {
  return MONTH_KEYS.reduce((s, k) => s + v[k], 0)
}

function pctMonths(numerator: MonthlyValues, denominator: MonthlyValues): MonthlyValues & { total: number } {
  const r = { ...EMPTY_MONTHS, total: 0 }
  let numTotal = 0
  let denTotal = 0
  for (const k of MONTH_KEYS) {
    r[k] = denominator[k] !== 0 ? (numerator[k] / denominator[k]) * 100 : 0
    numTotal += numerator[k]
    denTotal += denominator[k]
  }
  r.total = denTotal !== 0 ? (numTotal / denTotal) * 100 : 0
  return r
}

/**
 * Compute the period-specific % for a DRE row.
 * ALL rows use receitaBrutaRow as denominator: %RL = (row_value / receita_bruta) × 100
 * Returns null when no closed keys or receita bruta is unavailable.
 */
function computePeriodPct(
  row: DreRow,
  closedKeys: (keyof MonthlyValues)[],
  receitaBrutaRow: DreRow | undefined,
  _receitaLiquidaRow: DreRow | undefined,
): number | null {
  if (closedKeys.length === 0) return null
  if (!receitaBrutaRow) return null
  const numVal = closedKeys.reduce((s, k) => s + row.values[k], 0)
  const denVal = closedKeys.reduce((s, k) => s + receitaBrutaRow.values[k], 0)
  return denVal !== 0 ? (numVal / denVal) * 100 : 0
}

function formatBRL(value: number): string {
  if (value === 0) return '-'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatPct(value: number): string {
  if (value === 0) return '-'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`
}

/** Returns true if the given period column is fully closed (current date has passed the last day of the period in the selected year) */
function isPeriodClosed(col: PeriodColumn, viewYear: number): boolean {
  const today = new Date()
  const lastMonthKey = col.monthKeys[col.monthKeys.length - 1]
  const monthIndex = MONTH_KEYS.indexOf(lastMonthKey) // 0-based
  // Last day of the period's last month in the viewed year
  const lastDayOfPeriod = new Date(viewYear, monthIndex + 1, 0) // day 0 = last day of month
  return today > lastDayOfPeriod
}

/** Returns true if at least one month in the period is closed (shows partial data while period is still in progress) */
function isPeriodPartial(col: PeriodColumn, viewYear: number): boolean {
  if (isPeriodClosed(col, viewYear)) return false
  const today = new Date()
  const firstMonthKey = col.monthKeys[0]
  const firstMonthIndex = MONTH_KEYS.indexOf(firstMonthKey)
  const lastDayOfFirstMonth = new Date(viewYear, firstMonthIndex + 1, 0)
  return today > lastDayOfFirstMonth
}

/** How many months of this period are closed */
function closedMonthsCount(col: PeriodColumn, viewYear: number): number {
  const today = new Date()
  return col.monthKeys.filter((k) => {
    const mi = MONTH_KEYS.indexOf(k)
    return today > new Date(viewYear, mi + 1, 0)
  }).length
}

// ── Data fetching ──

type CashEntry = {
  amount: number
  type: 'INCOME' | 'EXPENSE'
  expense_group: string | null
  category?: string | null
  expense_category: string | null
  description: string | null
  due_date: string
  is_active: boolean
  payment_method: string | null
  paid_date: string | null
  anticipated_amount: number | null
}

/** Effective income amount — mirrors getEffectiveIncomeAmount from cash-entry-amount.ts */
function effectiveIncomeAmount(entry: CashEntry): number {
  if (entry.payment_method === 'CARTAO_CREDITO' && entry.anticipated_amount != null && entry.anticipated_amount > 0) {
    return Math.max(0, entry.amount - entry.anticipated_amount)
  }
  return entry.amount
}

async function fetchYearEntries(tenantId: string, year: number): Promise<CashEntry[]> {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  // Espelha o HUB: somente meses encerrados (due_date < início do mês atual)
  const now = new Date()
  const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const { data, error } = await (supabase as any)
    .from('cash_entries')
    .select('amount, type, expense_group, expense_category, description, due_date, is_active, payment_method, paid_date')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .gte('due_date', startDate)
    .lte('due_date', endDate)
    .lt('due_date', cutoff)
  if (error) throw new Error(`Erro ao buscar lançamentos: ${error.message}`)
  return (data || []).map((e: any) => ({
    ...e,
    amount: Number(e.amount) || 0,
    anticipated_amount: null,
  }))
}

type TenantSettingsResult = {
  tax_regime: string | null
  calc_type: string | null
}

async function fetchTenantSettings(tenantId: string): Promise<TenantSettingsResult> {
  const { data } = await supabase
    .from('tenant_settings')
    .select('tax_regime, calc_type')
    .eq('tenant_id', tenantId)
    .single()
  const d = data as any
  return {
    tax_regime: d?.tax_regime ?? null,
    calc_type: d?.calc_type ?? null,
  }
}

// ── Aggregate entries into MonthlyValues by groups ──

type AggregatedData = {
  receitaBruta: MonthlyValues
  // expense groups
  maoDeObraProdutiva: MonthlyValues
  maoDeObraAdministrativa: MonthlyValues
  maoDeObra: MonthlyValues // generic MO
  despesaFixa: MonthlyValues
  despesaVariavel: MonthlyValues
  despesaFinanceira: MonthlyValues
  imposto: MonthlyValues
  comissoes: MonthlyValues
  custoProduto: MonthlyValues // DESPESA_VARIAVEL entries that are product cost (Fornecedores, Embalagens, etc.)
  deducaoReceita: MonthlyValues // INSS retido na fonte, ISS retido pelo tomador (LP RET)
}

function aggregateEntries(entries: CashEntry[]): AggregatedData {
  const data: AggregatedData = {
    receitaBruta: { ...EMPTY_MONTHS },
    maoDeObraProdutiva: { ...EMPTY_MONTHS },
    maoDeObraAdministrativa: { ...EMPTY_MONTHS },
    maoDeObra: { ...EMPTY_MONTHS },
    despesaFixa: { ...EMPTY_MONTHS },
    despesaVariavel: { ...EMPTY_MONTHS },
    despesaFinanceira: { ...EMPTY_MONTHS },
    imposto: { ...EMPTY_MONTHS },
    comissoes: { ...EMPTY_MONTHS },
    custoProduto: { ...EMPTY_MONTHS },
    deducaoReceita: { ...EMPTY_MONTHS },
  }

  // Category keys considered as product cost (CMV) — matches CASHIER_CATEGORY.EXPENSE keys
  const PRODUCT_COST_KEYS = new Set([
    'FORNECEDORES', 'MATERIA_PRIMA_BASE_DOS_PROD_ROUPA_ALIMENTO_MADEIRA',
    'EMBALAGENS', 'EMBALAGENS_DIVERSAS', 'FRETES_FOB',
  ])

  // Comissoes category key
  const COMISSAO_KEYS = new Set(['COMISSOES_DE_VENDA'])

  for (const entry of entries) {
    // Parse month directly from YYYY-MM-DD to avoid UTC→local timezone shifts
    const monthIndex = parseInt((entry.due_date || '').slice(5, 7), 10) - 1
    const monthKey = MONTH_INDEX_TO_KEY[monthIndex]
    if (!monthKey) continue

    if (entry.type === 'INCOME') {
      // Mesma regra do HUB: exclui BOLETO/CHEQUE pendentes (sem paid_date = não confirmados)
      if ((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') && !entry.paid_date) continue
      data.receitaBruta[monthKey] += effectiveIncomeAmount(entry)
      continue
    }

    // EXPENSE — mesma regra do HUB: só despesas confirmadas (paid_date preenchido)
    if (!entry.paid_date) continue
    const group = entry.expense_group || ''
    // Use expense_category first (newer field), fall back to category (legacy)
    const cat = entry.expense_category || entry.category || ''
    const desc = entry.description || ''

    // Comissoes check — match by category key first, fallback to description text
    if (COMISSAO_KEYS.has(cat) || desc.toLowerCase().includes('comiss')) {
      data.comissoes[monthKey] += entry.amount
      continue
    }

    // Product cost check (CMV) — match by category key first, then by expense_group
    if (PRODUCT_COST_KEYS.has(cat) || group === 'CUSTO_PRODUTOS') {
      data.custoProduto[monthKey] += entry.amount
      continue
    }

    switch (group) {
      case 'MAO_DE_OBRA_PRODUTIVA':
        data.maoDeObraProdutiva[monthKey] += entry.amount
        break
      case 'MAO_DE_OBRA_ADMINISTRATIVA':
        data.maoDeObraAdministrativa[monthKey] += entry.amount
        break
      case 'MAO_DE_OBRA':
        data.maoDeObra[monthKey] += entry.amount
        break
      case 'DESPESA_FIXA':
        data.despesaFixa[monthKey] += entry.amount
        break
      case 'DESPESA_VARIAVEL':
        data.despesaVariavel[monthKey] += entry.amount
        break
      case 'DESPESA_FINANCEIRA':
        data.despesaFinanceira[monthKey] += entry.amount
        break
      case 'IMPOSTO':
      case 'REGIME_TRIBUTARIO': // DAS/impostos pelo regime caem em imposto
        data.imposto[monthKey] += entry.amount
        break
      case 'COMISSOES':
        data.comissoes[monthKey] += entry.amount
        break
      case 'ATIVIDADES_TERCEIRIZADAS':
        data.despesaVariavel[monthKey] += entry.amount
        break
      case 'DEDUCAO_RECEITA':
        // LP RET: INSS retido na fonte e ISS retido pelo tomador são deduções da receita bruta
        data.deducaoReceita[monthKey] += entry.amount
        break
      default:
        // Fallback: treat unknown as variable expense
        data.despesaVariavel[monthKey] += entry.amount
        break
    }
  }

  return data
}

// ── DRE Builders ──

function buildRow(
  key: string,
  label: string,
  values: MonthlyValues,
  receitaBruta: MonthlyValues,
  opts?: Partial<DreRow>,
): DreRow {
  const total = totalOfMonths(values)
  return {
    key,
    label,
    values,
    total,
    pctOfRL: pctMonths(values, receitaBruta),
    ...opts,
  }
}

function buildDreLucroRealPresumido(
  agg: AggregatedData,
  _calcType: CalcType,
  taxRegime: TaxRegime,
): DreRow[] {
  const rows: DreRow[] = []

  // Receita Bruta
  const receitaBruta = agg.receitaBruta

  rows.push(buildRow('receita_bruta', 'Receita Bruta', receitaBruta, receitaBruta, { isHeader: true, sign: '+' }))

  // Deduções Tributárias Sobre Receita — usa valores reais do HUB (cash_entries pagos)
  const deducoesTribReceita = agg.imposto
  rows.push(buildRow('deducoes_trib_receita', '(-) Deduções Tributárias Sobre Receita', deducoesTribReceita, receitaBruta, { sign: '-', indent: 1 }))

  // Receita Líquida
  const receitaLiquida = subtractMonths(receitaBruta, deducoesTribReceita)
  rows.push(buildRow('receita_liquida', '(=) Receita Líquida de Venda Interna', receitaLiquida, receitaBruta, { isSubtotal: true, sign: '=' }))

  // CMV — MO Produtiva sempre aparece como linha separada (independente do calcType)
  const custoProdutos = agg.custoProduto
  const cmvTotal = sumMonths(custoProdutos, agg.maoDeObraProdutiva)
  rows.push(buildRow('cmv_header', '(-) Custos Líquido dos Produtos (CMV)', cmvTotal, receitaBruta, { sign: '-' }))
  rows.push(buildRow('cmv_custo_prod', 'Custo Líquido dos Produtos', custoProdutos, receitaBruta, { indent: 2 }))
  rows.push(buildRow('cmv_mo_direta', 'Custo Mão de Obra Direta (Produtiva)', agg.maoDeObraProdutiva, receitaBruta, { indent: 2 }))

  // Lucro Bruto
  const lucroBruto = subtractMonths(receitaLiquida, cmvTotal)
  rows.push(buildRow('lucro_bruto', '(=) Lucro Bruto', lucroBruto, receitaBruta, { isSubtotal: true, sign: '=' }))

  // Despesas Operacionais — MO Indireta/Administrativa (exclui MO Produtiva que já está no CMV)
  const moIndireta = sumMonths(agg.maoDeObraAdministrativa, agg.maoDeObra)

  const despesasOp = sumMonths(sumMonths(sumMonths(moIndireta, agg.despesaFixa), agg.despesaVariavel), agg.comissoes)
  rows.push(buildRow('desp_op_header', '(-) Despesas Operacionais', despesasOp, receitaBruta, { sign: '-' }))

  rows.push(buildRow('desp_mo_indireta', 'Despesa MO Indireta', moIndireta, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_fixa', 'Despesa Fixa', agg.despesaFixa, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_variavel', 'Despesa Variável', agg.despesaVariavel, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_comissoes', 'Comissões', agg.comissoes, receitaBruta, { indent: 2 }))

  // Lucro Operacional (EBITDA/EBIT)
  const lucroOperacional = subtractMonths(lucroBruto, despesasOp)
  rows.push(buildRow('lucro_operacional', '(=) Lucro Operacional (EBITDA/EBIT)', lucroOperacional, receitaBruta, { isSubtotal: true, sign: '=' }))

  // Despesas Financeiras
  rows.push(buildRow('desp_financeira', '(-) Despesas Financeiras', agg.despesaFinanceira, receitaBruta, { sign: '-' }))

  // Resultado Financeiro
  const resultadoFinanceiro = subtractMonths(lucroOperacional, agg.despesaFinanceira)
  rows.push(buildRow('resultado_financeiro', '(=) Resultado Financeiro', resultadoFinanceiro, receitaBruta, { isSubtotal: true, sign: '=' }))

  // Lucro Líquido (sem estimativa de IRPJ/CSLL — usa apenas valores reais do HUB)
  rows.push(buildRow('lucro_liquido', '(=) Lucro Líquido', resultadoFinanceiro, receitaBruta, { isTotal: true, sign: '=' }))

  return rows
}

function buildDrePresumidoRET(agg: AggregatedData): DreRow[] {
  // LP-RET-009: DRE completa LP RET seguindo NBC TG 26
  // LP-RET-013: Inclui deduções de receita (INSS retido + ISS retido pelo tomador)
  const rows: DreRow[] = []

  const receitaBruta = agg.receitaBruta
  rows.push(buildRow('receita_bruta', 'Receita Bruta de Serviços/Obras', receitaBruta, receitaBruta, { isHeader: true, sign: '+' }))

  // Deduções da Receita Bruta (INSS retido na fonte + ISS retido pelo tomador)
  const deducoesReceita = agg.deducaoReceita
  rows.push(buildRow('deducoes_receita', '(-) Deduções da Receita Bruta', deducoesReceita, receitaBruta, { sign: '-', indent: 1 }))
  rows.push(buildRow('inss_retido', '(-) INSS Retido na Fonte (11%)', { ...EMPTY_MONTHS }, receitaBruta, { sign: '-', indent: 2 }))
  rows.push(buildRow('iss_retido', '(-) ISS Retido pelo Tomador', { ...EMPTY_MONTHS }, receitaBruta, { sign: '-', indent: 2 }))

  const receitaLiquida = subtractMonths(receitaBruta, deducoesReceita)
  rows.push(buildRow('receita_liquida', '(=) Receita Líquida de Serviços/Obras', receitaLiquida, receitaBruta, { isSubtotal: true, sign: '=' }))

  // Custos Diretos (CPV — Custo dos Serviços Prestados)
  const retPago = agg.imposto
  const folha = sumMonths(sumMonths(agg.maoDeObraProdutiva, agg.maoDeObraAdministrativa), agg.maoDeObra)
  const custosDiretos = sumMonths(sumMonths(retPago, agg.custoProduto), folha)
  rows.push(buildRow('custos_diretos', '(-) Custos Diretos (CPV)', custosDiretos, receitaBruta, { sign: '-' }))
  rows.push(buildRow('ret_pago', 'RET — IRPJ+CSLL+PIS+COFINS (DARF 1068)', retPago, receitaBruta, { indent: 2 }))
  rows.push(buildRow('materiais_obra', 'Materiais e Insumos de Obra', agg.custoProduto, receitaBruta, { indent: 2 }))
  rows.push(buildRow('folha_ret', 'Mão de Obra Direta + Folha', folha, receitaBruta, { indent: 2 }))

  const resultadoBruto = subtractMonths(receitaLiquida, custosDiretos)
  rows.push(buildRow('resultado_bruto', '(=) Resultado Bruto (Margem Bruta)', resultadoBruto, receitaBruta, { isSubtotal: true, sign: '=' }))

  // Despesas Operacionais
  const despesasOp = sumMonths(sumMonths(agg.despesaFixa, agg.despesaVariavel), agg.comissoes)
  rows.push(buildRow('desp_op', '(-) Despesas Operacionais', despesasOp, receitaBruta, { sign: '-' }))
  rows.push(buildRow('desp_fixa', 'Despesas Administrativas e Fixas', agg.despesaFixa, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_variavel', 'Despesas Variáveis e Subempreitada', agg.despesaVariavel, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_comissoes', 'Comissões', agg.comissoes, receitaBruta, { indent: 2 }))

  const resultadoAntesImposto = subtractMonths(resultadoBruto, despesasOp)
  rows.push(buildRow('resultado_antes_imposto', '(=) Resultado Antes dos Impostos sobre o Lucro', resultadoAntesImposto, receitaBruta, { isSubtotal: true, sign: '=' }))

  rows.push(buildRow('desp_financeira', '(-) Despesas Financeiras', agg.despesaFinanceira, receitaBruta, { sign: '-' }))

  const lucroLiquido = subtractMonths(resultadoAntesImposto, agg.despesaFinanceira)
  rows.push(buildRow('lucro_liquido', '(=) Lucro/Prejuízo Líquido do Período', lucroLiquido, receitaBruta, { isTotal: true, sign: '=' }))

  return rows
}

function buildDreSimplesNacional(agg: AggregatedData, _calcType: CalcType): DreRow[] {
  const rows: DreRow[] = []

  const receitaBruta = agg.receitaBruta
  rows.push(buildRow('receita_bruta', 'Receita Bruta', receitaBruta, receitaBruta, { isHeader: true, sign: '+' }))

  // DAS — usa valores reais pagos do HUB (expense_group IMPOSTO / REGIME_TRIBUTARIO)
  const das = { ...agg.imposto }

  // Deduções tributárias = DAS (incluído dentro da Receita Bruta)
  rows.push(buildRow('deducoes_trib', '(-) Deduções Tributárias', das, receitaBruta, { sign: '-', indent: 1 }))
  rows.push(buildRow('das', '(-) DAS / Impostos do Regime (pago)', das, receitaBruta, { sign: '-', indent: 2 }))

  const receitaLiquida = subtractMonths(receitaBruta, das)
  rows.push(buildRow('receita_liquida', '(=) Receita Líquida', receitaLiquida, receitaBruta, { isSubtotal: true, sign: '=' }))

  // CMV — MO Produtiva sempre aparece como linha separada (independente do calcType)
  const cmv = sumMonths(agg.custoProduto, agg.maoDeObraProdutiva)
  rows.push(buildRow('cmv', '(-) CMV (Custo Produtos + MO Direta)', cmv, receitaBruta, { sign: '-' }))
  rows.push(buildRow('cmv_custo_prod', 'Custo Produtos', agg.custoProduto, receitaBruta, { indent: 2 }))
  rows.push(buildRow('cmv_mo_direta', 'MO Direta (Produtiva)', agg.maoDeObraProdutiva, receitaBruta, { indent: 2 }))

  const lucroBruto = subtractMonths(receitaLiquida, cmv)
  rows.push(buildRow('lucro_bruto', '(=) Lucro Bruto', lucroBruto, receitaBruta, { isSubtotal: true, sign: '=' }))

  // Despesas Operacionais — MO Indireta/Administrativa (exclui MO Produtiva que já está no CMV)
  const moIndireta = sumMonths(agg.maoDeObraAdministrativa, agg.maoDeObra)

  const despesasOp = sumMonths(sumMonths(sumMonths(moIndireta, agg.despesaFixa), agg.despesaVariavel), agg.comissoes)
  rows.push(buildRow('desp_op', '(-) Despesas Operacionais', despesasOp, receitaBruta, { sign: '-' }))
  rows.push(buildRow('desp_mo_indireta', 'MO Indireta', moIndireta, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_fixa', 'Despesa Fixa', agg.despesaFixa, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_variavel', 'Despesa Variável', agg.despesaVariavel, receitaBruta, { indent: 2 }))
  rows.push(buildRow('desp_comissoes', 'Comissões', agg.comissoes, receitaBruta, { indent: 2 }))

  const lucroOperacional = subtractMonths(lucroBruto, despesasOp)
  rows.push(buildRow('lucro_operacional', '(=) Lucro Operacional', lucroOperacional, receitaBruta, { isSubtotal: true, sign: '=' }))

  rows.push(buildRow('desp_financeira', '(-) Despesas Financeiras', agg.despesaFinanceira, receitaBruta, { sign: '-' }))

  const lucroLiquido = subtractMonths(lucroOperacional, agg.despesaFinanceira)
  rows.push(buildRow('lucro_liquido', '(=) Lucro Líquido', lucroLiquido, receitaBruta, { isTotal: true, sign: '=' }))

  return rows
}

// ── Determine DRE variant ──

function buildDre(
  agg: AggregatedData,
  taxRegime: TaxRegime,
  calcType: CalcType,
): DreRow[] {
  if (taxRegime === 'PRESUMIDO_RET' || taxRegime === 'LUCRO_PRESUMIDO_RET') {
    return buildDrePresumidoRET(agg)
  }
  if (taxRegime === 'SIMPLES_NACIONAL' || taxRegime === 'SIMPLES_HIBRIDO' || taxRegime === 'MEI') {
    return buildDreSimplesNacional(agg, calcType)
  }
  // Default: Lucro Real / Lucro Presumido
  return buildDreLucroRealPresumido(agg, calcType, taxRegime)
}

function getVariantLabel(taxRegime: TaxRegime): string {
  switch (taxRegime) {
    case 'LUCRO_REAL': return 'Lucro Real'
    case 'LUCRO_PRESUMIDO': return 'Lucro Presumido'
    case 'PRESUMIDO_RET': return 'Presumido RET'
    case 'SIMPLES_NACIONAL': return 'Simples Nacional'
    case 'SIMPLES_HIBRIDO': return 'Simples Híbrido'
    case 'MEI': return 'MEI'
    default: return taxRegime || 'Não definido'
  }
}

// ── Component ──

export default function DfcPage() {
  const { canView } = usePermissions()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(true)
  const [dreRows, setDreRows] = useState<DreRow[]>([])
  const [taxRegime, setTaxRegime] = useState<TaxRegime>('')
  const [calcType, setCalcType] = useState<CalcType>('')
  const [error, setError] = useState<string | null>(null)
  const [dfcExportModalOpen, setDfcExportModalOpen] = useState(false)
  const [periodType, setPeriodType] = useState<PeriodType>('trimestral')
  const [selectedMonth, setSelectedMonth] = useState(0)

  const periodColumns = useMemo(() => getPeriodColumns(periodType, selectedMonth), [periodType, selectedMonth])
  const showTotal = periodType !== 'mensal' && periodType !== 'anual'

  // Find reference rows for period-specific % calculation
  const receitaLiquidaRow = useMemo(() => dreRows.find(r => r.key === 'receita_liquida'), [dreRows])
  const receitaBrutaRow = useMemo(() => dreRows.find(r => r.key === 'receita_bruta'), [dreRows])

  const handleExportDfcPdf = () => {
    if (dreRows.length === 0) return
    const pCols = getPeriodColumns(periodType, selectedMonth)
    const periodHeaders = pCols.map(c => c.label)
    const headers = ['Descrição', ...periodHeaders, ...(showTotal ? ['Total'] : []), '% RL']
    const rows = dreRows.map((row) => {
      const periodValues = pCols.map((col) => {
        const v = aggregatePeriodValue(row.values, col.monthKeys)
        return v !== 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
      })
      const totalStr = showTotal
        ? (row.total !== 0 ? row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
        : null
      const pdfKeys: (keyof MonthlyValues)[] = pCols.flatMap(c => {
        if (isPeriodClosed(c, year)) return [...c.monthKeys] as (keyof MonthlyValues)[]
        if (isPeriodPartial(c, year)) return c.monthKeys.filter(k => {
          const mi = MONTH_KEYS.indexOf(k)
          return new Date() > new Date(year, mi + 1, 0)
        }) as (keyof MonthlyValues)[]
        return [] as (keyof MonthlyValues)[]
      })
      const pdfPct = computePeriodPct(row, pdfKeys, receitaBrutaRow, receitaLiquidaRow)
      const pctStr = pdfPct !== null ? `${pdfPct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%` : '—'
      return [row.label, ...periodValues, ...(totalStr !== null ? [totalStr] : []), pctStr]
    })
    const regimeLabel = getVariantLabel(taxRegime)
    const calcLabel = calcType === 'INDUSTRIALIZATION' ? 'Industrialização' : calcType === 'RESALE' ? 'Revenda' : calcType === 'SERVICE' ? 'Serviço' : ''
    const periodLabel = periodType === 'trimestral' ? 'Trimestral' : periodType === 'semestral' ? 'Semestral' : periodType === 'anual' ? 'Anual' : `Mensal (${MONTH_LABELS[selectedMonth]})`
    exportTableToPdf({
      title: `DRE — Análise Financeira — ${year} — ${periodLabel}`,
      subtitle: `Regime: ${regimeLabel} | Tipo: ${calcLabel}`,
      headers,
      rows,
      filename: `DRE_${year}_${periodLabel.replace(/\s+/g, '_')}_${regimeLabel.replace(/\s+/g, '_')}.pdf`,
      orientation: periodType === 'trimestral' ? 'landscape' : 'portrait',
      columnStyles: { 0: { halign: 'left', cellWidth: 60 } },
    })
  }

  const yearOptions = useMemo(() => {
    const years = []
    for (let y = currentYear - 2; y <= currentYear + 1; y++) years.push(y)
    return years
  }, [currentYear])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const tenantId = await getTenantId()
      if (!tenantId) { setError('Não foi possível identificar o tenant.'); return }

      const [entries, settings] = await Promise.all([
        fetchYearEntries(tenantId, year),
        fetchTenantSettings(tenantId),
      ])

      const regime = (settings?.tax_regime || 'SIMPLES_NACIONAL') as TaxRegime
      const ct = (settings?.calc_type || 'INDUSTRIALIZATION') as CalcType
      setTaxRegime(regime)
      setCalcType(ct)

      const agg = aggregateEntries(entries)
      const rows = buildDre(agg, regime, ct)
      setDreRows(rows)
    } catch (err: any) {
      console.error('Erro ao carregar DFC:', err)
      setError('Erro ao carregar dados: ' + (err?.message || 'Erro desconhecido'))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (!canView(MODULES.DFC)) {
    return (
      <Layout tabTitle={PAGE_TITLES.DFC}>
        <Alert type="warning" showIcon message="Acesso negado" description="Você não tem permissão para acessar esta página." style={{ margin: 40 }} />
      </Layout>
    )
  }

  if (loading) {
    return (
      <Layout tabTitle={PAGE_TITLES.DFC}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout tabTitle={PAGE_TITLES.DFC}>
      {error && <Alert type="error" showIcon message={error} closable style={{ marginBottom: 16 }} />}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
              Análise Financeira — DRE
            </h1>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-400, #9CA3AF)' }}>
              Regime: <strong>{getVariantLabel(taxRegime)}</strong>
              {calcType && <> | Tipo: <strong>{calcType === 'INDUSTRIALIZATION' ? 'Industrialização' : calcType === 'RESALE' ? 'Revenda' : 'Serviço'}</strong></>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Select value={periodType} onChange={(v: PeriodType) => setPeriodType(v)} style={{ width: 140 }}>
              <Select.Option value="mensal">Mensal</Select.Option>
              <Select.Option value="trimestral">Trimestral</Select.Option>
              <Select.Option value="semestral">Semestral</Select.Option>
              <Select.Option value="anual">Anual</Select.Option>
            </Select>
            {periodType === 'mensal' && (
              <Select value={selectedMonth} onChange={(v: number) => setSelectedMonth(v)} style={{ width: 120 }}>
                {MONTH_LABELS.map((m, i) => (
                  <Select.Option key={i} value={i}>{m}</Select.Option>
                ))}
              </Select>
            )}
            <Select value={year} onChange={setYear} style={{ width: 120 }}>
              {yearOptions.map(y => (
                <Select.Option key={y} value={y}>{y}</Select.Option>
              ))}
            </Select>
            <Button
              icon={<FileExcelOutlined />}
              onClick={() => setDfcExportModalOpen(true)}
              disabled={dreRows.length === 0}
              style={{ background: '#217346', borderColor: '#217346', color: '#fff' }}
            >
              Exportar
            </Button>
          </div>
        </div>
      </header>

      <div className="pc-card" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: periodType === 'mensal' ? 500 : periodType === 'anual' ? 500 : 800 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-neutral-700, #374151)' }}>
              <th style={{ ...thStyle, width: 320, textAlign: 'left' }}>Descrição</th>
              {periodColumns.map((col, i) => {
                const closed = isPeriodClosed(col, year)
                const partial = isPeriodPartial(col, year)
                const n = closedMonthsCount(col, year)
                return (
                  <th key={i} style={{ ...thStyle, textAlign: 'right', minWidth: 140 }}>
                    {col.label}
                    {partial && (
                      <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-neutral-400, #9CA3AF)', fontStyle: 'italic' }}>
                        {n}/{col.monthKeys.length} meses
                      </div>
                    )}
                    {!closed && !partial && col.monthKeys.length > 0 && (() => {
                      const firstMi = MONTH_KEYS.indexOf(col.monthKeys[0])
                      return new Date() <= new Date(year, firstMi + 1, 0) ? (
                        <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-neutral-400, #9CA3AF)', fontStyle: 'italic' }}>
                          Em andamento
                        </div>
                      ) : null
                    })()}
                  </th>
                )
              })}
              {showTotal && (
                <th style={{ ...thStyle, textAlign: 'right', minWidth: 140, fontWeight: 700 }}>Total</th>
              )}
              <th style={{ ...thStyle, textAlign: 'right', minWidth: 80 }}>% RL</th>
            </tr>
          </thead>
          <tbody>
            {dreRows.map((row) => (
              <React.Fragment key={row.key}>
                {/* Value row */}
                <tr style={getRowStyle(row)}>
                  <td style={{
                    ...tdStyle,
                    paddingLeft: (row.indent || 0) * 20 + 8,
                    fontWeight: row.isTotal || row.isSubtotal || row.isHeader ? 600 : 400,
                    fontSize: row.isTotal ? 14 : 13,
                  }}>
                    {row.label}
                    {row.isHeader && (
                      <Tooltip title="Valores extraídos dos lançamentos de fluxo de caixa">
                        <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--color-neutral-400, #9CA3AF)' }} />
                      </Tooltip>
                    )}
                  </td>
                  {periodColumns.map((col, ci) => {
                    const closed = isPeriodClosed(col, year)
                    const partial = isPeriodPartial(col, year)
                    const hasData = closed || partial
                    // For partial: only sum the closed months within the period
                    const closedKeys = partial
                      ? col.monthKeys.filter((k) => {
                          const mi = MONTH_KEYS.indexOf(k)
                          return new Date() > new Date(year, mi + 1, 0)
                        })
                      : col.monthKeys
                    const val = hasData ? aggregatePeriodValue(row.values, closedKeys) : null
                    return (
                      <td key={ci} style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontWeight: row.isTotal || row.isSubtotal ? 600 : 400,
                        color: hasData ? getValueColor(val!, row) : 'var(--color-neutral-500, #6B7280)',
                        opacity: partial ? 0.75 : 1,
                      }}>
                        {hasData ? (
                          <>
                            {formatBRL(val!)}
                            {partial && <span style={{ fontSize: 10, fontStyle: 'italic', marginLeft: 4, color: 'var(--color-neutral-400, #9CA3AF)' }}>parcial</span>}
                          </>
                        ) : (
                          <span style={{ fontSize: 11, fontStyle: 'italic' }}>Em andamento</span>
                        )}
                      </td>
                    )
                  })}
                  {showTotal && (() => {
                    // For total: sum closed + partial periods
                    const closedTotal = periodColumns.reduce((s, c) => {
                      if (isPeriodClosed(c, year)) return s + aggregatePeriodValue(row.values, c.monthKeys)
                      if (isPeriodPartial(c, year)) {
                        const closedKeys = c.monthKeys.filter((k) => {
                          const mi = MONTH_KEYS.indexOf(k)
                          return new Date() > new Date(year, mi + 1, 0)
                        })
                        return s + aggregatePeriodValue(row.values, closedKeys)
                      }
                      return s
                    }, 0)
                    const allClosed = periodColumns.every(c => isPeriodClosed(c, year))
                    const anyData = periodColumns.some(c => isPeriodClosed(c, year) || isPeriodPartial(c, year))
                    return (
                      <td style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontWeight: 700,
                        color: anyData ? getValueColor(closedTotal, row) : 'var(--color-neutral-500, #6B7280)',
                      }}>
                        {anyData ? (
                          <>
                            {formatBRL(closedTotal)}
                            {!allClosed && <span style={{ fontSize: 10, fontStyle: 'italic', marginLeft: 4, color: 'var(--color-neutral-400, #9CA3AF)' }}>parcial</span>}
                          </>
                        ) : (
                          <span style={{ fontSize: 11, fontStyle: 'italic' }}>Em andamento</span>
                        )}
                      </td>
                    )
                  })()}
                  <td style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontWeight: row.isTotal || row.isSubtotal ? 600 : 400,
                    color: 'var(--color-neutral-400, #9CA3AF)',
                    fontSize: 12,
                  }}>
                    {(() => {
                      if (!row.pctOfRL) return '—'
                      const allClosedKeys: (keyof MonthlyValues)[] = periodColumns.flatMap(c => {
                        if (isPeriodClosed(c, year)) return [...c.monthKeys] as (keyof MonthlyValues)[]
                        if (isPeriodPartial(c, year)) return c.monthKeys.filter(k => {
                          const mi = MONTH_KEYS.indexOf(k)
                          return new Date() > new Date(year, mi + 1, 0)
                        }) as (keyof MonthlyValues)[]
                        return [] as (keyof MonthlyValues)[]
                      })
                      const pct = computePeriodPct(row, allClosedKeys, receitaBrutaRow, receitaLiquidaRow)
                      return pct !== null ? formatPct(pct) : '—'
                    })()}
                  </td>
                </tr>
                {/* Per-period percentage row */}
                {row.pctOfRL && periodColumns.length > 1 && (
                  <tr style={{ opacity: 0.6 }}>
                    <td style={{ ...tdStyle, paddingLeft: (row.indent || 0) * 20 + 8, fontSize: 11, color: 'var(--color-neutral-400, #9CA3AF)' }}>
                      {'% RB'}
                    </td>
                    {periodColumns.map((col, ci) => {
                      const closed = isPeriodClosed(col, year)
                      const partial = isPeriodPartial(col, year)
                      const hasData = closed || partial
                      const closedKeys = partial
                        ? col.monthKeys.filter((k) => {
                            const mi = MONTH_KEYS.indexOf(k)
                            return new Date() > new Date(year, mi + 1, 0)
                          })
                        : col.monthKeys
                      const pctVal = hasData ? computePeriodPct(row, closedKeys as (keyof MonthlyValues)[], receitaBrutaRow, receitaLiquidaRow) : null
                      return (
                        <td key={ci} style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: 'var(--color-neutral-400, #9CA3AF)' }}>
                          {hasData && pctVal !== null ? formatPct(pctVal) : '—'}
                        </td>
                      )
                    })}
                    {showTotal && (
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: 'var(--color-neutral-400, #9CA3AF)', fontWeight: 600 }}>
                        {(() => {
                          const allDisplayKeys: (keyof MonthlyValues)[] = periodColumns.flatMap(c => {
                            if (isPeriodClosed(c, year)) return [...c.monthKeys] as (keyof MonthlyValues)[]
                            if (isPeriodPartial(c, year)) return c.monthKeys.filter(k => {
                              const mi = MONTH_KEYS.indexOf(k)
                              return new Date() > new Date(year, mi + 1, 0)
                            }) as (keyof MonthlyValues)[]
                            return [] as (keyof MonthlyValues)[]
                          })
                          const pct = computePeriodPct(row, allDisplayKeys, receitaBrutaRow, receitaLiquidaRow)
                          return pct !== null ? formatPct(pct) : '—'
                        })()}
                      </td>
                    )}
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: 'var(--color-neutral-400, #9CA3AF)' }}>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export format modal — DFC */}
      <ExportFormatModal
        open={dfcExportModalOpen}
        onClose={() => setDfcExportModalOpen(false)}
        title="Exportar DRE"
        skipDateRange
        onExportExcel={() => exportDfcToExcel(dreRows, year, taxRegime, calcType, periodType, selectedMonth)}
        onExportPdf={handleExportDfcPdf}
      />
    </Layout>
  )
}

// ── Styles ──

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--color-neutral-300, #D1D5DB)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--color-neutral-800, rgba(255,255,255,0.06))',
  whiteSpace: 'nowrap',
}

function getRowStyle(row: DreRow): React.CSSProperties {
  if (row.isTotal) {
    return {
      background: 'rgba(16, 185, 129, 0.08)',
      borderTop: '2px solid var(--color-neutral-600, #4B5563)',
    }
  }
  if (row.isSubtotal) {
    return {
      background: 'rgba(255, 255, 255, 0.02)',
    }
  }
  return {}
}

function getValueColor(value: number, row: DreRow): string | undefined {
  if (value === 0) return 'var(--color-neutral-500, #6B7280)'
  if (row.isTotal || row.isSubtotal) {
    return value > 0 ? 'var(--color-success, #10B981)' : 'var(--color-error, #F04438)'
  }
  if (row.sign === '-') return 'var(--color-error, #F04438)'
  if (row.sign === '+' || row.isHeader) return 'var(--color-success, #10B981)'
  return undefined
}
