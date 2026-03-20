import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Alert, Button, Select, Spin, Tooltip } from 'antd'
import { FileExcelOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { exportDfcToExcel } from '@/utils/export-dfc-excel'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'
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

function aggregatePeriodPct(pctOfRL: (MonthlyValues & { total: number }) | undefined, row: DreRow, receitaLiquidaRow: DreRow | undefined, monthKeys: (keyof MonthlyValues)[]): number {
  if (!receitaLiquidaRow) return pctOfRL?.total ?? 0
  const numValue = aggregatePeriodValue(row.values, monthKeys)
  const denValue = aggregatePeriodValue(receitaLiquidaRow.values, monthKeys)
  return denValue !== 0 ? (numValue / denValue) * 100 : 0
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
  return `${value.toFixed(1)}%`
}

// ── Data fetching ──

type CashEntry = {
  amount: number
  type: 'INCOME' | 'EXPENSE'
  expense_group: string | null
  description: string | null
  due_date: string
  is_active: boolean
}

async function fetchYearEntries(tenantId: string, year: number): Promise<CashEntry[]> {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  // @ts-ignore — supabase generic chain too deep for TS
  const { data } = await supabase
    .from('cash_entries')
    .select('amount, type, expense_group, description, due_date, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .gte('due_date', startDate)
    .lte('due_date', endDate)
  return (data || []).map((e: any) => ({
    ...e,
    amount: Number(e.amount) || 0,
  }))
}

type TenantSettingsResult = {
  tax_regime: string | null
  calc_type: string | null
  simples_revenue_12m: number
  simples_anexo: string | null
  ret_rate: number | null
}

async function fetchTenantSettings(tenantId: string): Promise<TenantSettingsResult> {
  const { data } = await supabase
    .from('tenant_settings')
    .select('tax_regime, calc_type, simples_revenue_12m, simples_anexo, ret_rate')
    .eq('tenant_id', tenantId)
    .single()
  const d = data as any
  return {
    tax_regime: d?.tax_regime ?? null,
    calc_type: d?.calc_type ?? null,
    simples_revenue_12m: Number(d?.simples_revenue_12m) || 0,
    simples_anexo: d?.simples_anexo ?? null,
    ret_rate: d?.ret_rate != null ? Number(d.ret_rate) : null,
  }
}

async function fetchSimplesEffectiveRate(anexo: string, revenue12m: number): Promise<number> {
  const a = (anexo || '').replace(/^ANEXO_/i, '') || 'I'
  const { data: brackets } = await supabase
    .from('simples_nacional_brackets')
    .select('nominal_rate, deduction, revenue_min, revenue_max')
    .eq('anexo', a)
    .order('bracket_order', { ascending: true })
  if (brackets && brackets.length > 0) {
    let bracket = brackets[0]
    for (const b of brackets) {
      if (revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) { bracket = b; break }
    }
    const nom = Number(bracket.nominal_rate)
    const ded = Number(bracket.deduction)
    return revenue12m > 0 ? (revenue12m * nom - ded) / revenue12m : nom
  }
  return 0.08 // fallback
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
  }

  // Categories considered as product cost (CMV)
  const PRODUCT_COST_DESCRIPTIONS = new Set([
    'Fornecedores', 'Matéria Prima / Produtos Revenda', 'Embalagens', 'Embalagens Diversas',
    'Frete Compras', 'Terceirizações',
  ])

  // Comissoes descriptions
  const COMISSAO_DESCRIPTIONS = new Set(['Comissões de Venda'])

  for (const entry of entries) {
    const d = new Date(entry.due_date)
    const monthKey = MONTH_INDEX_TO_KEY[d.getMonth()]
    if (!monthKey) continue

    if (entry.type === 'INCOME') {
      data.receitaBruta[monthKey] += entry.amount
      continue
    }

    // EXPENSE
    const group = entry.expense_group || ''
    const desc = entry.description || ''

    // Comissoes check
    if (COMISSAO_DESCRIPTIONS.has(desc) || desc.toLowerCase().includes('comiss')) {
      data.comissoes[monthKey] += entry.amount
      continue
    }

    // Product cost check (CMV) - items from DESPESA_VARIAVEL that are material costs
    if (PRODUCT_COST_DESCRIPTIONS.has(desc) || group === 'DESPESA_VARIAVEL') {
      // Separate actual product cost from other variable expenses
      if (PRODUCT_COST_DESCRIPTIONS.has(desc)) {
        data.custoProduto[monthKey] += entry.amount
        continue
      }
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
        data.imposto[monthKey] += entry.amount
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
  receitaLiquida: MonthlyValues,
  opts?: Partial<DreRow>,
): DreRow {
  const total = totalOfMonths(values)
  return {
    key,
    label,
    values,
    total,
    pctOfRL: pctMonths(values, receitaLiquida),
    ...opts,
  }
}

function buildDreLucroRealPresumido(
  agg: AggregatedData,
  calcType: CalcType,
  taxRegime: TaxRegime,
): DreRow[] {
  const rows: DreRow[] = []
  const isIndustrializacao = calcType === 'INDUSTRIALIZATION'

  // Receita Bruta
  const receitaBruta = agg.receitaBruta
  // Use receita bruta as denominator for percentage until we calculate receita liquida
  const tempRL = receitaBruta

  rows.push(buildRow('receita_bruta', 'Receita Bruta', receitaBruta, tempRL, { isHeader: true, sign: '+' }))

  // Deduções Tributárias Sobre Receita (impostos sobre faturamento from IMPOSTO group)
  const deducoesTribReceita = agg.imposto
  rows.push(buildRow('deducoes_trib_receita', '(-) Deduções Tributárias Sobre Receita', deducoesTribReceita, tempRL, { sign: '-', indent: 1 }))

  // Deduções Tributárias Sobre Compras (créditos de impostos sobre compras)
  // Lucro Real: PIS 1.65% + COFINS 7.6% = 9.25% (não-cumulativo, gera créditos)
  // Lucro Presumido: PIS 0.65% + COFINS 3% = cumulativo, SEM créditos de compras
  const isLucroReal = taxRegime === 'LUCRO_REAL'
  const creditRate = isLucroReal ? 0.0925 : 0 // Presumido não tem crédito de compras
  const deducoesTribCompras: MonthlyValues = { ...EMPTY_MONTHS }
  for (const k of MONTH_KEYS) {
    deducoesTribCompras[k] = agg.custoProduto[k] * creditRate
  }
  if (isLucroReal) {
    rows.push(buildRow('deducoes_trib_compras', '(-) Deduções Tributárias Sobre Compras (Crédito)', deducoesTribCompras, tempRL, { sign: '-', indent: 1 }))
  }

  // Receita Líquida
  const receitaLiquida = subtractMonths(subtractMonths(receitaBruta, deducoesTribReceita), deducoesTribCompras)
  rows.push(buildRow('receita_liquida', '(=) Receita Líquida de Venda Interna', receitaLiquida, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // CMV
  const custoProdutos = agg.custoProduto
  rows.push(buildRow('cmv_header', '(-) Custos Líquido dos Produtos (CMV)', custoProdutos, receitaLiquida, { sign: '-' }))
  rows.push(buildRow('cmv_custo_prod', 'Custo Líquido dos Produtos', custoProdutos, receitaLiquida, { indent: 2 }))

  let cmvTotal = custoProdutos
  if (isIndustrializacao) {
    rows.push(buildRow('cmv_mo_direta', 'Custo Mão de Obra Direta', agg.maoDeObraProdutiva, receitaLiquida, { indent: 2 }))
    cmvTotal = sumMonths(custoProdutos, agg.maoDeObraProdutiva)
  }

  // Lucro Bruto
  const lucroBruto = subtractMonths(receitaLiquida, cmvTotal)
  rows.push(buildRow('lucro_bruto', '(=) Lucro Bruto', lucroBruto, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // Despesas Operacionais
  const moIndireta = isIndustrializacao
    ? sumMonths(agg.maoDeObraAdministrativa, agg.maoDeObra)
    : sumMonths(sumMonths(agg.maoDeObraProdutiva, agg.maoDeObraAdministrativa), agg.maoDeObra)

  const despesasOp = sumMonths(sumMonths(sumMonths(moIndireta, agg.despesaFixa), agg.despesaVariavel), agg.comissoes)
  rows.push(buildRow('desp_op_header', '(-) Despesas Operacionais', despesasOp, receitaLiquida, { sign: '-' }))

  const moLabel = isIndustrializacao ? 'Despesa MO Indireta' : 'MO Direta + Indireta'
  rows.push(buildRow('desp_mo_indireta', moLabel, moIndireta, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_fixa', 'Despesa Fixa', agg.despesaFixa, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_variavel', 'Despesa Variável', agg.despesaVariavel, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_comissoes', 'Comissões', agg.comissoes, receitaLiquida, { indent: 2 }))

  // Lucro Operacional (EBITDA/EBIT)
  const lucroOperacional = subtractMonths(lucroBruto, despesasOp)
  rows.push(buildRow('lucro_operacional', '(=) Lucro Operacional (EBITDA/EBIT)', lucroOperacional, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // Despesas Financeiras
  rows.push(buildRow('desp_financeira', '(-) Despesas Financeiras', agg.despesaFinanceira, receitaLiquida, { sign: '-' }))

  // Resultado Financeiro
  const resultadoFinanceiro = subtractMonths(lucroOperacional, agg.despesaFinanceira)
  rows.push(buildRow('resultado_financeiro', '(=) Resultado Financeiro', resultadoFinanceiro, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // Impostos sobre o Lucro (IRPJ + CSLL)
  // Estimate: IRPJ 15% + CSLL 9% = 24% on positive profit. Simplified approach.
  const impostosSobreLucro: MonthlyValues = { ...EMPTY_MONTHS }
  for (const k of MONTH_KEYS) {
    if (resultadoFinanceiro[k] > 0) {
      impostosSobreLucro[k] = resultadoFinanceiro[k] * 0.24
    }
  }
  rows.push(buildRow('impostos_lucro', '(-) Impostos sobre o Lucro (IRPJ + CSLL)', impostosSobreLucro, receitaLiquida, { sign: '-' }))

  // Lucro Líquido
  const lucroLiquido = subtractMonths(resultadoFinanceiro, impostosSobreLucro)
  rows.push(buildRow('lucro_liquido', '(=) Lucro Líquido', lucroLiquido, receitaLiquida, { isTotal: true, sign: '=' }))

  return rows
}

function buildDrePresumidoRET(agg: AggregatedData, retRate: number = 0.04): DreRow[] {
  const rows: DreRow[] = []

  const receitaBruta = agg.receitaBruta
  rows.push(buildRow('receita_bruta', 'Receita Bruta', receitaBruta, receitaBruta, { isHeader: true, sign: '+' }))

  // Deduções Tributárias Sobre Receita = 0 for RET
  const deducoesZero: MonthlyValues = { ...EMPTY_MONTHS }
  rows.push(buildRow('deducoes_trib_receita', '(-) Deduções Tributárias Sobre Receita', deducoesZero, receitaBruta, { sign: '-', indent: 1 }))

  const receitaLiquida = receitaBruta
  rows.push(buildRow('receita_liquida', '(=) Receita Líquida', receitaLiquida, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // RET (taxa configurada) + Custo Produtos + Folha
  const ret4: MonthlyValues = { ...EMPTY_MONTHS }
  for (const k of MONTH_KEYS) ret4[k] = receitaBruta[k] * retRate
  const folha = sumMonths(sumMonths(agg.maoDeObraProdutiva, agg.maoDeObraAdministrativa), agg.maoDeObra)
  const deducoesFaturamento = sumMonths(sumMonths(ret4, agg.custoProduto), folha)
  rows.push(buildRow('deducoes_faturamento', '(-) Deduções Tributárias Faturamento', deducoesFaturamento, receitaLiquida, { sign: '-' }))
  rows.push(buildRow('ret_4', `RET ${(retRate * 100).toFixed(0)}%`, ret4, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('custo_produtos_ret', 'Custo Produtos', agg.custoProduto, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('folha_ret', 'Folha', folha, receitaLiquida, { indent: 2 }))

  const lucroBruto = subtractMonths(receitaLiquida, deducoesFaturamento)
  rows.push(buildRow('lucro_bruto', '(=) Lucro Bruto', lucroBruto, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // Despesas Operacionais (MO já está na Folha acima, então NÃO incluir MO novamente aqui)
  const despesasOp = sumMonths(sumMonths(agg.despesaFixa, agg.despesaVariavel), agg.comissoes)
  rows.push(buildRow('desp_op', '(-) Despesas Operacionais', despesasOp, receitaLiquida, { sign: '-' }))
  rows.push(buildRow('desp_fixa', 'Despesa Fixa', agg.despesaFixa, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_variavel', 'Despesa Variável', agg.despesaVariavel, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_comissoes', 'Comissões', agg.comissoes, receitaLiquida, { indent: 2 }))

  const lucroOperacional = subtractMonths(lucroBruto, despesasOp)
  rows.push(buildRow('lucro_operacional', '(=) Lucro Operacional', lucroOperacional, receitaLiquida, { isSubtotal: true, sign: '=' }))

  rows.push(buildRow('desp_financeira', '(-) Despesas Financeiras', agg.despesaFinanceira, receitaLiquida, { sign: '-' }))

  const lucroLiquido = subtractMonths(lucroOperacional, agg.despesaFinanceira)
  rows.push(buildRow('lucro_liquido', '(=) Lucro Líquido', lucroLiquido, receitaLiquida, { isTotal: true, sign: '=' }))

  return rows
}

function buildDreSimplesNacional(agg: AggregatedData, calcType: CalcType, dasRate: number = 0.08, isMei: boolean = false): DreRow[] {
  const rows: DreRow[] = []
  const isIndustrializacao = calcType === 'INDUSTRIALIZATION'

  const receitaBruta = agg.receitaBruta
  rows.push(buildRow('receita_bruta', 'Receita Bruta', receitaBruta, receitaBruta, { isHeader: true, sign: '+' }))

  // Deduções tributárias = 0 (impostos "por dentro")
  const deducoesZero: MonthlyValues = { ...EMPTY_MONTHS }
  rows.push(buildRow('deducoes_trib', '(-) Deduções Tributárias', deducoesZero, receitaBruta, { sign: '-', indent: 1 }))

  const receitaLiquida = receitaBruta
  rows.push(buildRow('receita_liquida', '(=) Receita Líquida', receitaLiquida, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // DAS (taxa real do tenant ou fallback)
  const das: MonthlyValues = { ...EMPTY_MONTHS }
  if (!isMei) {
    for (const k of MONTH_KEYS) das[k] = receitaBruta[k] * dasRate
  }
  const dasLabel = isMei ? '(-) DAS (MEI — fixo mensal)' : `(-) DAS (Simples Nacional — ${(dasRate * 100).toFixed(2)}%)`
  rows.push(buildRow('das', dasLabel, das, receitaLiquida, { sign: '-' }))

  // CMV
  let cmv = agg.custoProduto
  if (isIndustrializacao) {
    cmv = sumMonths(agg.custoProduto, agg.maoDeObraProdutiva)
  }
  rows.push(buildRow('cmv', '(-) CMV (Custo Produtos' + (isIndustrializacao ? ' + MO Direta' : '') + ')', cmv, receitaLiquida, { sign: '-' }))
  rows.push(buildRow('cmv_custo_prod', 'Custo Produtos', agg.custoProduto, receitaLiquida, { indent: 2 }))
  if (isIndustrializacao) {
    rows.push(buildRow('cmv_mo_direta', 'MO Direta', agg.maoDeObraProdutiva, receitaLiquida, { indent: 2 }))
  }

  const lucroBruto = subtractMonths(subtractMonths(receitaLiquida, das), cmv)
  rows.push(buildRow('lucro_bruto', '(=) Lucro Bruto', lucroBruto, receitaLiquida, { isSubtotal: true, sign: '=' }))

  // Despesas Operacionais
  const moIndireta = isIndustrializacao
    ? sumMonths(agg.maoDeObraAdministrativa, agg.maoDeObra)
    : sumMonths(sumMonths(agg.maoDeObraProdutiva, agg.maoDeObraAdministrativa), agg.maoDeObra)

  const despesasOp = sumMonths(sumMonths(sumMonths(moIndireta, agg.despesaFixa), agg.despesaVariavel), agg.comissoes)
  rows.push(buildRow('desp_op', '(-) Despesas Operacionais', despesasOp, receitaLiquida, { sign: '-' }))
  rows.push(buildRow('desp_mo_indireta', 'MO Indireta', moIndireta, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_fixa', 'Despesa Fixa', agg.despesaFixa, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_variavel', 'Despesa Variável', agg.despesaVariavel, receitaLiquida, { indent: 2 }))
  rows.push(buildRow('desp_comissoes', 'Comissões', agg.comissoes, receitaLiquida, { indent: 2 }))

  const lucroOperacional = subtractMonths(lucroBruto, despesasOp)
  rows.push(buildRow('lucro_operacional', '(=) Lucro Operacional', lucroOperacional, receitaLiquida, { isSubtotal: true, sign: '=' }))

  rows.push(buildRow('desp_financeira', '(-) Despesas Financeiras', agg.despesaFinanceira, receitaLiquida, { sign: '-' }))

  const lucroLiquido = subtractMonths(lucroOperacional, agg.despesaFinanceira)
  rows.push(buildRow('lucro_liquido', '(=) Lucro Líquido', lucroLiquido, receitaLiquida, { isTotal: true, sign: '=' }))

  return rows
}

// ── Determine DRE variant ──

function buildDre(
  agg: AggregatedData,
  taxRegime: TaxRegime,
  calcType: CalcType,
  opts?: { dasRate?: number; retRate?: number },
): DreRow[] {
  if (taxRegime === 'PRESUMIDO_RET' || taxRegime === 'LUCRO_PRESUMIDO_RET') {
    return buildDrePresumidoRET(agg, opts?.retRate ?? 0.04)
  }
  if (taxRegime === 'SIMPLES_NACIONAL' || taxRegime === 'SIMPLES_HIBRIDO') {
    return buildDreSimplesNacional(agg, calcType, opts?.dasRate ?? 0.08)
  }
  if (taxRegime === 'MEI') {
    return buildDreSimplesNacional(agg, calcType, 0, true)
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
  const { currentUser } = useAuth()
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

  // Find receita liquida row for proper percentage calculation
  const receitaLiquidaRow = useMemo(() => dreRows.find(r => r.key === 'receita_liquida'), [dreRows])

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
      const pctStr = row.pctOfRL ? `${(row.pctOfRL.total).toFixed(1)}%` : '—'
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
      const tenantId = currentUser?.tenant_id || await getTenantId()
      if (!tenantId) { setError('Não foi possível identificar o tenant.'); return }

      const [entries, settings] = await Promise.all([
        fetchYearEntries(tenantId, year),
        fetchTenantSettings(tenantId),
      ])

      const regime = (settings?.tax_regime || 'SIMPLES_NACIONAL') as TaxRegime
      const ct = (settings?.calc_type || 'INDUSTRIALIZATION') as CalcType
      setTaxRegime(regime)
      setCalcType(ct)

      // Fetch real tax rates based on regime
      let dasRate = 0.08
      if ((regime === 'SIMPLES_NACIONAL' || regime === 'SIMPLES_HIBRIDO') && settings.simples_anexo && settings.simples_revenue_12m > 0) {
        dasRate = await fetchSimplesEffectiveRate(settings.simples_anexo, settings.simples_revenue_12m)
      }
      const retRate = settings.ret_rate != null ? settings.ret_rate : 0.04

      const agg = aggregateEntries(entries)
      const rows = buildDre(agg, regime, ct, { dasRate, retRate })
      setDreRows(rows)
    } catch (err: any) {
      console.error('Erro ao carregar DFC:', err)
      setError('Erro ao carregar dados: ' + (err?.message || 'Erro desconhecido'))
    } finally {
      setLoading(false)
    }
  }, [year, currentUser?.tenant_id])

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
              {periodColumns.map((col, i) => (
                <th key={i} style={{ ...thStyle, textAlign: 'right', minWidth: 140 }}>{col.label}</th>
              ))}
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
                    const val = aggregatePeriodValue(row.values, col.monthKeys)
                    return (
                      <td key={ci} style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontWeight: row.isTotal || row.isSubtotal ? 600 : 400,
                        color: getValueColor(val, row),
                      }}>
                        {formatBRL(val)}
                      </td>
                    )
                  })}
                  {showTotal && (
                    <td style={{
                      ...tdStyle,
                      textAlign: 'right',
                      fontWeight: 700,
                      color: getValueColor(row.total, row),
                    }}>
                      {formatBRL(row.total)}
                    </td>
                  )}
                  <td style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontWeight: row.isTotal || row.isSubtotal ? 600 : 400,
                    color: 'var(--color-neutral-400, #9CA3AF)',
                    fontSize: 12,
                  }}>
                    {row.pctOfRL ? formatPct(row.pctOfRL.total) : '—'}
                  </td>
                </tr>
                {/* Per-period percentage row */}
                {row.pctOfRL && periodColumns.length > 1 && (
                  <tr style={{ opacity: 0.6 }}>
                    <td style={{ ...tdStyle, paddingLeft: (row.indent || 0) * 20 + 8, fontSize: 11, color: 'var(--color-neutral-400, #9CA3AF)' }}>
                      % Receita Líquida
                    </td>
                    {periodColumns.map((col, ci) => {
                      const pctVal = aggregatePeriodPct(row.pctOfRL, row, receitaLiquidaRow, col.monthKeys)
                      return (
                        <td key={ci} style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: 'var(--color-neutral-400, #9CA3AF)' }}>
                          {formatPct(pctVal)}
                        </td>
                      )
                    })}
                    {showTotal && (
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: 'var(--color-neutral-400, #9CA3AF)', fontWeight: 600 }}>
                        {formatPct(row.pctOfRL!.total)}
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
