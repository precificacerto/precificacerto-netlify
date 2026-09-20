import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Spin, Tabs, TabsProps, Table } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import {
  ALL_CASHIER_CATEGORIES,
  YEARLY_AVERAGE_CATEGORIES,
  CASHIER_CATEGORY,
  CASHIER_CATEGORY_EXPENSE_OBJECT,
  CASHIER_CATEGORY_INCOME_OBJECT,
  getExpenseGroupLabel,
  getExpenseGroupColor,
} from '@/constants/cashier-category'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { ResultData, TableDataType } from '@/shared/enums/dre-year-base'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { ordemDaLinhaDeApresentacao, type RegimeDoBloco } from '@/utils/custo-produtos-no-dre'
import { ordemNoBloco } from '@/utils/compromissos-financeiros'
import {
  processYearEntries,
  somaMensalDasLinhas,
  averageWithoutCurrentMonth,
  CHAVES_QUE_NAO_SAO_MES,
} from '@/utils/dre-ano-entradas'

type TotalYearBaseType = {
  jan: number; feb: number; mar: number; apr: number; may: number; jun: number
  jul: number; ago: number; sep: number; oct: number; nov: number; dec: number
}

const TOTAL_YEAR_BASE: TotalYearBaseType = {
  jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
  jul: 0, ago: 0, sep: 0, oct: 0, nov: 0, dec: 0,
}


function Dre() {
  const router = useRouter()
  const { year: yearParam } = router.query
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const previousYear = currentYear - 1
  const nextYear = currentYear + 1
  const year = Number(yearParam) || currentYear

  const [loading, setLoading] = useState(true)
  const [dreData, setDreData] = useState<ResultData>({ incomeData: [], expenseData: [] })
  const [totalResult, setTotalResult] = useState<ResultData>({ incomeData: [], expenseData: [] })

  useEffect(() => {
    if (!yearParam) return
    fetchDreData()
  }, [yearParam])

  async function fetchDreData() {
    setLoading(true)
    try {
      const tenantId = await getTenantId()
      if (!tenantId) return

      // O REGIME decide QUAIS tributos da compra creditam — sem ele o Híbrido deduziria ICMS,
      // PIS/COFINS e IPI, que ali estão dentro do DAS e COMPÕEM o custo.
      const { data: cfgRegime } = await (supabase as any)
        .from('tenant_settings')
        .select('tax_regime')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      const regimeDoTenant: RegimeDoBloco = cfgRegime?.tax_regime ?? null

      const yearList = [previousYear, currentYear, nextYear]

      const allEntries: any[] = []
      for (const y of yearList) {
        const startDate = `${y}-01-01`
        const endDate = `${y}-12-31`
        const { data: entries } = await (supabase as any)
          .from('cash_entries')
          .select('amount, type, expense_group, expense_category, description, due_date, is_active, payment_method, paid_date, anticipated_amount, valor_icms, valor_pis, valor_cofins, valor_ipi, valor_cbs, valor_ibs')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .gte('due_date', startDate)
          .lte('due_date', endDate)
        if (entries) allEntries.push(...entries.map((e: any) => ({ ...e, _year: y })))
      }

      const yearDataPairs = yearList.map((y) => {
        const yearEntries = allEntries.filter((e) => e._year === y)
        return {
          year: y,
          data: processYearEntries(yearEntries, y, regimeDoTenant),
        }
      })

      const currentYearData = yearDataPairs.find((p) => p.year === year)
      const totalRes = sumValuesFromYearDataPairs(yearDataPairs)

      const merged = currentYearData?.data
        ? mergeTotalAverages(currentYearData.data, totalRes)
        : { incomeData: [], expenseData: [] }

      setDreData(merged)
      setTotalResult(totalRes)
    } catch (err) {
      console.error('Erro ao carregar DRE:', err)
    } finally {
      setLoading(false)
    }
  }

  const items: TabsProps['items'] = useMemo(
    () => [
      {
        key: 'resumo-caixa',
        label: 'Extrato caixa',
        children: <CashierSummaryContent data={dreData} totalResult={totalResult} year={year} />,
      },
      {
        key: 'dre',
        label: 'Análise Horizontal',
        children: <DreContent data={dreData} totalResult={totalResult} year={year} />,
      },
    ],
    [dreData, totalResult, year]
  )

  const [activeKey, setActiveKey] = useState<string>('resumo-caixa')

  useEffect(() => {
    const { tab } = router.query
    if (tab === 'dre') setActiveKey('dre')
  }, [router.query])

  function handleChangeYearSelect(selectedYear: number) {
    router.push(`${ROUTES.DRE}/${selectedYear}`)
  }

  if (loading) {
    return (
      <Layout tabTitle={PAGE_TITLES.HUB}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout tabTitle={PAGE_TITLES.HUB}>
      <header>
        <div className="flex justify-between w-full items-center">
          <h1 className="text-3xl">
            HUB de<span className="font-bold">{` ${year}`}</span>
          </h1>
          <Select defaultValue={year} onChange={handleChangeYearSelect}>
            <Select.Option value={previousYear}>{previousYear}</Select.Option>
            <Select.Option value={currentYear}>{currentYear}</Select.Option>
            <Select.Option value={nextYear}>{nextYear}</Select.Option>
          </Select>
        </div>
      </header>
      <Tabs
        className="w-full"
        defaultActiveKey="resumo-caixa"
        activeKey={activeKey}
        items={items}
        onChange={setActiveKey}
      />
    </Layout>
  )
}

const monthFields = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dec'] as const

function sumValuesFromYearDataPairs(yearPairs: { year: number; data: ResultData | null }[]): ResultData {
  const allRecords: TableDataType[] = yearPairs.reduce(
    (acc, { data }) => {
      if (data) acc.push(...data.incomeData, ...data.expenseData)
      return acc
    },
    [] as TableDataType[]
  )

  let firstYear = Infinity
  let firstMonth = Infinity
  for (const { year, data } of yearPairs.sort((a, b) => a.year - b.year)) {
    if (!data) continue
    for (const item of [...data.incomeData, ...data.expenseData]) {
      // Linha de apresentação não inaugura o histórico: ela só existe onde já há custo.
      if (item.apenasApresentacao) continue
      for (let i = 0; i < monthFields.length; i++) {
        if (((item as any)[monthFields[i]] || 0) > 0) {
          const month = i + 1
          if (year < firstYear || (year === firstYear && month < firstMonth)) {
            firstYear = year
            firstMonth = month
          }
        }
      }
    }
    if (firstYear !== Infinity) break
  }

  let monthsCount = 0
  if (firstYear !== Infinity) {
    const today = new Date()
    const currYear = today.getFullYear()
    const currMonth = today.getMonth() + 1
    let lastYear = currYear
    let lastMonth = currMonth - 1
    if (lastMonth === 0) { lastMonth = 12; lastYear-- }
    const firstIdx = firstYear * 12 + (firstMonth - 1)
    const lastIdx = lastYear * 12 + lastMonth
    monthsCount = lastIdx - firstIdx
  }

  const incomeMap = new Map<string, { valueSum: number; item: TableDataType }>()
  const expenseMap = new Map<string, { valueSum: number; item: TableDataType }>()

  for (const { data } of yearPairs) {
    if (!data) continue
    for (const item of data.incomeData) {
      const e = incomeMap.get(item.category)
      if (e) e.valueSum += item.totalSum
      else incomeMap.set(item.category, { valueSum: item.totalSum, item: { ...item } })
    }
    for (const item of data.expenseData) {
      const e = expenseMap.get(item.category)
      if (e) e.valueSum += item.totalSum
      else expenseMap.set(item.category, { valueSum: item.totalSum, item: { ...item } })
    }
  }

  const incomeData = Array.from(incomeMap.values()).map(({ valueSum, item }) => ({
    ...item,
    overallSum: valueSum,
    totalAverage: monthsCount > 0 ? valueSum / monthsCount : 0,
  }))
  const expenseData = Array.from(expenseMap.values()).map(({ valueSum, item }) => ({
    ...item,
    overallSum: valueSum,
    totalAverage: monthsCount > 0 ? valueSum / monthsCount : 0,
  }))

  return { incomeData, expenseData }
}

function mergeTotalAverages(result: ResultData, totalResult: ResultData): ResultData {
  const totalIncomeMap = new Map(
    totalResult.incomeData.map((item) => [item.category, { totalAverage: item.totalAverage, overallSum: item.overallSum }])
  )
  const totalExpenseMap = new Map(
    totalResult.expenseData.map((item) => [item.category, { totalAverage: item.totalAverage, overallSum: item.overallSum }])
  )

  const incomeData = result.incomeData.map((item) => {
    const total = totalIncomeMap.get(item.category)
    return { ...item, totalAverage: total?.totalAverage ?? 0, overallSum: total?.overallSum ?? 0 }
  })

  const expenseData = result.expenseData.map((item) => {
    const total = totalExpenseMap.get(item.category)
    return { ...item, totalAverage: total?.totalAverage ?? 0, overallSum: total?.overallSum ?? 0 }
  })

  return { incomeData, expenseData }
}

function getColumns(type: string, _dataSource: TableDataType[]): ColumnsType<TableDataType> {
  const isDRE = type === 'dre'

  const columns: ColumnsType<TableDataType> = [
    {
      title: 'Categoria',
      dataIndex: 'category',
      key: 'category',
      fixed: 'left',
      width: 220,
      render: (value: string) => value,
      sortOrder: 'ascend',
      sorter: {
        compare: (a, b) => {
          const catA = ALL_CASHIER_CATEGORIES[a.category as CASHIER_CATEGORY_EXPENSE_OBJECT | CASHIER_CATEGORY_INCOME_OBJECT]
          const catB = ALL_CASHIER_CATEGORIES[b.category as CASHIER_CATEGORY_EXPENSE_OBJECT | CASHIER_CATEGORY_INCOME_OBJECT]
          // DOIS blocos só se leem de cima para baixo, e uma categoria pertence no máximo a
          // um deles: as três linhas do Custo dos Produtos e as seis dos Compromissos
          // Financeiros. Sem ordem explícita o `localeCompare` do rótulo ("(−) …", "= …")
          // as espalharia pela tabela.
          const orderA = a.ordem ?? ordemDaLinhaDeApresentacao(a.category) ?? ordemNoBloco(a.category) ?? catA?.order ?? 0
          const orderB = b.ordem ?? ordemDaLinhaDeApresentacao(b.category) ?? ordemNoBloco(b.category) ?? catB?.order ?? 0
          if (orderA !== orderB) return orderA - orderB
          return (a.category || '').localeCompare(b.category || '')
        },
      },
    },
    {
      title: 'Tipo',
      dataIndex: 'expenseGroup',
      key: 'expenseGroup',
      width: 220,
      render: (_value, record) => {
        const group = record.expenseGroup
        if (!group) return <span style={{ color: 'var(--color-neutral-500, #6B7280)' }}>—</span>
        const label = getExpenseGroupLabel(group)
        const color = getExpenseGroupColor(group)
        return (
          <span style={{ backgroundColor: `${color}33`, border: `1px solid ${color}66`, color, padding: '4px 8px', borderRadius: '8px', display: 'inline-block', fontSize: 12 }}>
            {label}
          </span>
        )
      },
    },
    {
      title: 'Média total', dataIndex: 'totalAverage', key: 'totalAverage',
      render: (value: number) => value === 0 ? '-' : isDRE ? `${getMonetaryValue(value)}%` : `R$ ${getMonetaryValue(value)}`,
    },
    {
      title: 'Somatório total', dataIndex: 'overallSum', key: 'overallSum',
      render: (value: number) => value === 0 ? '-' : `R$ ${getMonetaryValue(value)}`,
    },
    {
      title: 'Média anual', dataIndex: 'average', key: 'average',
      render: (value: number) => value === 0 ? '-' : isDRE ? `${getMonetaryValue(value)}%` : `R$ ${getMonetaryValue(value)}`,
    },
    {
      title: 'Somatório anual', dataIndex: 'totalSum', key: 'totalSum',
      render: (value: number) => value === 0 ? '-' : `R$ ${getMonetaryValue(value)}`,
    },
    ...['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dec'].map((m, i) => ({
      title: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][i],
      dataIndex: m, key: m,
      render: (value: number) => value === 0 ? '-' : isDRE ? `${getMonetaryValue(value)}%` : `R$ ${getMonetaryValue(value)}`,
    })),
  ]

  return isDRE ? columns.filter((column) => column.key !== 'totalSum' && column.key !== 'overallSum') : columns
}

function calculateDreContent(data: ResultData, year: number, totalResult: ResultData) {
  function getSumByEachMonth(array: TableDataType[]): TotalYearBaseType {
    return array.reduce((acc, curr) => ({
      jan: curr.jan + acc.jan, feb: curr.feb + acc.feb, mar: curr.mar + acc.mar,
      apr: curr.apr + acc.apr, may: curr.may + acc.may, jun: curr.jun + acc.jun,
      jul: curr.jul + acc.jul, ago: curr.ago + acc.ago, sep: curr.sep + acc.sep,
      oct: curr.oct + acc.oct, nov: curr.nov + acc.nov, dec: curr.dec + acc.dec,
    }), { ...TOTAL_YEAR_BASE })
  }

  function getActiveCategories(data: ResultData): Set<string> {
    return new Set(
      data.expenseData
        .filter(item => (item.apenasApresentacao ? item.totalSum !== 0 : item.totalSum > 0))
        .map(item => item.category)
    )
  }

  function mergeWithMissingCategories(current: TableDataType[], totalResult: ResultData): TableDataType[] {
    const activeCategories = getActiveCategories(totalResult)
    const existingCategories = new Set(current.map(item => item.category))
    const missingCategories = Array.from(activeCategories).filter(cat => !existingCategories.has(cat))

    const groupMap = new Map<string, TableDataType>()
    for (const item of totalResult.expenseData) groupMap.set(item.category, item)
    const filledMissing = missingCategories.map(category => ({
      key: category, category,
      expenseGroup: groupMap.get(category)?.expenseGroup,
      apenasApresentacao: groupMap.get(category)?.apenasApresentacao,
      ordem: groupMap.get(category)?.ordem,
      jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
      jul: 0, ago: 0, sep: 0, oct: 0, nov: 0, dec: 0,
      average: 0, totalSum: 0, overallSum: 0, totalAverage: 0,
    }))

    return [...current, ...filledMissing]
  }

  const totalIncomeSumByEachMonth = getSumByEachMonth(averageWithoutCurrentMonth(data.incomeData, year))
  const currentMonth = new Date().toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
  const expenseDataWithoutConsiderCurrentMonth = mergeWithMissingCategories(
    averageWithoutCurrentMonth(data.expenseData, year), totalResult
  )

  const totalIncome = calculateIncomeAverageSums(totalResult.incomeData)
  const yearlyArrayIncome = averageWithoutCurrentMonth(data.incomeData, year)
  const yearlyIncome = yearlyArrayIncome.reduce((sum, item) => sum + item.average, 0)
  const totalExpenseByCategory = calculateTotalSumByCategory(totalResult)

  return expenseDataWithoutConsiderCurrentMonth.map((item) => ({
    ...item,
    totalAverage: item.category in totalExpenseByCategory && totalIncome > 0
      ? +Number((totalExpenseByCategory[item.category] / totalIncome) * 100).toFixed(3) : 0,
    average: item.average > 0 ? +Number((item.average / yearlyIncome) * 100).toFixed(3) : 0,
    ...Object.fromEntries(
      monthFields.map((m) => [
        m,
        (item as any)[m] > 0 && currentMonth !== m
          ? +Number(((item as any)[m] / (totalIncomeSumByEachMonth as any)[m]) * 100).toFixed(3)
          : (item as any)[m],
      ])
    ),
  }))
}

function DreContent({ data, year, totalResult }: { data: ResultData; year: number; totalResult: ResultData }) {
  const dreDataExpense = calculateDreContent(data, year, totalResult)
  return (
    <section className="w-full">
      <Table columns={getColumns('dre', dreDataExpense)} dataSource={dreDataExpense} scroll={{ x: 'max-content' }} pagination={false} />
    </section>
  )
}

function calculateIncomeAverageSums(data: TableDataType[]): number {
  return data.reduce((acc, item) => acc + item.totalAverage, 0)
}

function calculateTotalSumByCategory(data: ResultData): Record<string, number> {
  return data.expenseData.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.totalAverage
    return acc
  }, {})
}

function CashierSummaryContent({ data, totalResult, year }: { data: ResultData; totalResult: ResultData; year: number }) {

  function injectOnlyTotals(currentData: TableDataType[], totalData: TableDataType[]): TableDataType[] {
    const existingCategories = new Set(currentData.map(item => String(item.category).trim().toLowerCase()))
    const extras = totalData
      .filter(item => !existingCategories.has(String(item.category).trim().toLowerCase()))
      .map(item => ({
        key: item.category, category: item.category ?? '',
        expenseGroup: item.expenseGroup,
        apenasApresentacao: item.apenasApresentacao,
        ordem: item.ordem,
        jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
        jul: 0, ago: 0, sep: 0, oct: 0, nov: 0, dec: 0,
        totalSum: 0, average: 0, overallSum: item.overallSum ?? 0, totalAverage: item.totalAverage ?? 0,
      }))
    return [...currentData, ...extras]
  }

  const processedData = {
    incomeData: injectOnlyTotals(data.incomeData, totalResult.incomeData),
    expenseData: injectOnlyTotals(data.expenseData, totalResult.expenseData),
  }

  const incomeMonthlyTotal = somaMensalDasLinhas(processedData.incomeData)
  const expenseMonthlyTotal = somaMensalDasLinhas(processedData.expenseData)

  const monthlyResult: { [key: string]: string }[] = [
    Object.keys(incomeMonthlyTotal).reduce<{ [key: string]: string }>((acc, month) => {
      acc[month] = `R$ ${getMonetaryValue((incomeMonthlyTotal[month] || 0) - (expenseMonthlyTotal[month] || 0))}`
      return acc
    }, {}),
  ]

  const resultColumns = monthFields.map((m, i) => ({
    title: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][i],
    dataIndex: m, key: m,
  }))

  return (
    <section className="w-full">
      <h3>Entradas</h3>
      <Table columns={getColumns('cash', processedData.incomeData)} dataSource={averageWithoutCurrentMonth(processedData.incomeData, year)} scroll={{ x: 'max-content' }} pagination={false} />
      <h3 className="mt-10">Saídas</h3>
      <Table columns={getColumns('cash', processedData.expenseData)} dataSource={averageWithoutCurrentMonth(processedData.expenseData, year)} scroll={{ x: 'max-content' }} pagination={false} />
      <h3 className="mt-10">Resultado</h3>
      <Table columns={resultColumns} dataSource={monthlyResult} scroll={{ x: 'max-content' }} pagination={false} />
    </section>
  )
}

export default Dre
