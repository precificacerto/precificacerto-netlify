import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Spin, Tabs, TabsProps, Table, Select } from 'antd'
import { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import {
  ALL_CASHIER_CATEGORIES,
  YEARLY_AVERAGE_CATEGORIES,
  CASHIER_CATEGORY,
  CASHIER_CATEGORY_EXPENSE_OBJECT,
  CASHIER_CATEGORY_INCOME_OBJECT,
} from '@/constants/cashier-category'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { monthObjects } from '@/constants/month'
import { getCategoryName } from '@/utils/get-category-name.util'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { ResultData, TableDataType } from '@/shared/enums/dre-year-base'
import { CATEGORIES_SUBCATEGORIES } from '@/shared/constants/categories-subcategories'
import { CATEGORIES_TRANSLATION } from '@/shared/constants/category-translation'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'

const months = [
  { key: 'JAN', value: 'jan' },
  { key: 'FEV', value: 'feb' },
  { key: 'MAR', value: 'mar' },
  { key: 'ABR', value: 'apr' },
  { key: 'MAI', value: 'may' },
  { key: 'JUN', value: 'jun' },
  { key: 'JUL', value: 'jul' },
  { key: 'AGO', value: 'ago' },
  { key: 'SET', value: 'sep' },
  { key: 'OUT', value: 'oct' },
  { key: 'NOV', value: 'nov' },
  { key: 'DEZ', value: 'dec' },
]

type ExtendedTableDataType = TableDataType & {
  [key: string]: number
}

type TotalYearBaseType = {
  jan: number; feb: number; mar: number; apr: number; may: number; jun: number
  jul: number; ago: number; sep: number; oct: number; nov: number; dec: number
}

const TOTAL_YEAR_BASE: TotalYearBaseType = {
  jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
  jul: 0, ago: 0, sep: 0, oct: 0, nov: 0, dec: 0,
}

const keysToExclude = new Set(['key', 'category', 'totalSum', 'average', 'monthsBiggerThanZero', 'totalAverage', 'overallSum'])

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

      const yearList = [previousYear, currentYear, nextYear]

      const allEntries: any[] = []
      for (const y of yearList) {
        const startDate = `${y}-01-01`
        const endDate = `${y}-12-31`
        const { data: entries } = await supabase
          .from('cash_entries')
          .select('*')
          .eq('tenant_id', tenantId)
          .gte('due_date', startDate)
          .lte('due_date', endDate)
        if (entries) allEntries.push(...entries.map((e: any) => ({ ...e, _year: y })))
      }

      const yearDataPairs = yearList.map((y) => {
        const yearEntries = allEntries.filter((e) => e._year === y)
        return {
          year: y,
          data: processYearEntries(yearEntries, y),
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

function processYearEntries(entries: any[], year: number): ResultData {
  const now = new Date()
  const currentYearNum = now.getFullYear()
  const currentMonthAbbr = now.toLocaleString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()
  const currentCombo = `${currentYearNum}-${currentMonthAbbr}`

  const incomeItems: { category: string; price: number; month: string }[] = []
  const expenseItems: { category: string; price: number; month: string }[] = []

  entries.forEach((entry: any) => {
    const d = new Date(entry.due_date)
    const monthIdx = d.getMonth()
    const monthKey = months[monthIdx]?.key
    if (!monthKey) return

    if (`${year}-${monthKey}` === currentCombo) return

    const item = {
      category: entry.description || (entry.type === 'INCOME' ? 'RECEITA_VENDAS' : 'DESPESA_GERAL'),
      price: Number(entry.amount) || 0,
      month: months[monthIdx].value,
    }

    if (entry.type === 'INCOME') incomeItems.push(item)
    else expenseItems.push(item)
  })

  return {
    incomeData: aggregateByCategory(incomeItems),
    expenseData: aggregateByCategory(expenseItems),
  }
}

function aggregateByCategory(items: { category: string; price: number; month: string }[]): TableDataType[] {
  const filteredItems = items.filter((item) => item.category !== CASHIER_CATEGORY.INCOME?.DEFICIT_FINANCEIRO?.key)

  const monthCatAgg: Record<string, Record<string, number>> = {}
  filteredItems.forEach((item) => {
    if (!monthCatAgg[item.category]) monthCatAgg[item.category] = {}
    monthCatAgg[item.category][item.month] = (monthCatAgg[item.category][item.month] || 0) + item.price
  })

  let keyIdx = 0
  return Object.entries(monthCatAgg).map(([category, monthData]) => {
    const row: any = {
      key: keyIdx++,
      category,
      jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
      jul: 0, ago: 0, sep: 0, oct: 0, nov: 0, dec: 0,
      totalSum: 0, average: 0, totalAverage: 0, overallSum: 0,
    }

    let monthsBiggerThanZero = 0
    for (const [month, value] of Object.entries(monthData)) {
      row[month] = value
      row.totalSum += value
      if (value > 0) monthsBiggerThanZero++
    }
    row.average = monthsBiggerThanZero > 0 ? +(row.totalSum / monthsBiggerThanZero).toFixed(2) : 0

    return row
  })
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

function getParentCategoryKey(subcategory: string, categories: Record<string, Record<string, string>>): string | undefined {
  for (const [parentKey, subcategories] of Object.entries(categories)) {
    if (subcategory in subcategories) return parentKey
  }
  return 'OUTROS'
}

const getCategoryInfo = (key: keyof typeof CATEGORIES_TRANSLATION) => {
  const category = CATEGORIES_TRANSLATION[key]
  return {
    label: category?.label || 'Categoria Desconhecida',
    color: category?.color || '#000000',
  }
}

function getColumns(type: string, dataSource: TableDataType[]): ColumnsType<TableDataType> {
  const isDRE = type === 'dre'

  const columns: ColumnsType<TableDataType> = [
    {
      title: 'Categoria',
      dataIndex: 'category',
      key: 'category',
      fixed: true,
      width: 270,
      render: (value: string) => getCategoryName(value),
      sortOrder: 'ascend',
      sorter: {
        compare: (a, b) => {
          const catA = ALL_CASHIER_CATEGORIES[a.category as CASHIER_CATEGORY_EXPENSE_OBJECT | CASHIER_CATEGORY_INCOME_OBJECT]
          const catB = ALL_CASHIER_CATEGORIES[b.category as CASHIER_CATEGORY_EXPENSE_OBJECT | CASHIER_CATEGORY_INCOME_OBJECT]
          return (catA?.order || 0) - (catB?.order || 0)
        },
      },
    },
    {
      title: 'Tipo',
      dataIndex: 'context',
      key: 'context',
      width: 200,
      render: (_value, record) => {
        const subcategory = record.category
        const category = getParentCategoryKey(subcategory, CATEGORIES_SUBCATEGORIES) || 'OUTROS'
        const { label, color } = getCategoryInfo(category as keyof typeof CATEGORIES_TRANSLATION)
        return (
          <span style={{ backgroundColor: color, padding: '4px 8px', borderRadius: '8px', color: '#fff', display: 'inline-block' }}>
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
    return new Set(data.expenseData.filter(item => item.totalSum > 0).map(item => item.category))
  }

  function mergeWithMissingCategories(current: TableDataType[], totalResult: ResultData): TableDataType[] {
    const activeCategories = getActiveCategories(totalResult)
    const existingCategories = new Set(current.map(item => item.category))
    const missingCategories = Array.from(activeCategories).filter(cat => !existingCategories.has(cat))

    const filledMissing = missingCategories.map(category => ({
      key: category, category,
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
  const calcMonthlyTotal = (entries: TableDataType[]) => {
    return entries.reduce((acc, entry) => {
      for (const [key, value] of Object.entries(entry)) {
        if (!keysToExclude.has(key)) {
          acc[key] = (acc[key] || 0) + +value
        }
      }
      return acc
    }, {} as { [month: string]: number })
  }

  function injectOnlyTotals(currentData: TableDataType[], totalData: TableDataType[]): TableDataType[] {
    const existingCategories = new Set(currentData.map(item => String(item.category).trim().toLowerCase()))
    const extras = totalData
      .filter(item => !existingCategories.has(String(item.category).trim().toLowerCase()))
      .map(item => ({
        key: item.category, category: item.category ?? '',
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

  const incomeMonthlyTotal = calcMonthlyTotal(processedData.incomeData)
  const expenseMonthlyTotal = calcMonthlyTotal(processedData.expenseData)

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

function isCurrentMonthAndYear(monthKey: string, year: number): boolean {
  const now = new Date()
  const currentMonth = now.toLocaleString('en-US', { month: 'short' }).replace('.', '').toLowerCase()
  const currentYear = now.getFullYear()
  return monthKey === currentMonth && year === currentYear
}

function averageWithoutCurrentMonth(entries: TableDataType[], year: number) {
  return entries.map((obj: ExtendedTableDataType) => {
    let sum = 0
    let monthsCount = 0
    const isYearly = Object.values(YEARLY_AVERAGE_CATEGORIES).some(category => category.key === obj.category)

    for (const key in obj) {
      if (!keysToExclude.has(key)) {
        if (!isCurrentMonthAndYear(key, year) && obj[key] > 0) {
          sum += obj[key]
          monthsCount = isYearly ? 12 : monthsCount + 1
        }
      }
    }

    return {
      ...obj,
      totalSum: sum,
      average: monthsCount === 0 ? 0 : sum / monthsCount,
      monthsBiggerThanZero: monthsCount,
    }
  })
}

export default Dre
