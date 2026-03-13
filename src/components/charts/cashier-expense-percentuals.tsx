import { IMonthInfo, IMonthChartInfo, ICashierEntry } from '@/types/cashier.types'
import { CATEGORIES_BASE_CALCULO } from '@/shared/constants/categories-calc-base'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

type monthExpensesByCategoryGroup = {
  DESPESAS_FIXAS?: number
  DESPESAS_VARIAVEIS?: number
  IMPOSTOS?: number
  LUCRO?: number
  CUSTO_PRODUTO?: number
  CUSTO_MAO_OBRA_PRODUCAO?: number
  DESPESA_MAO_DE_OBRA_INDIRETA?: number
  DESPESAS_FINANCEIRAS?: number
}

type Props = {
  calcBase: {
    productionLaborCostPricePlusPercentIndirectLaborExpensePrice: number
    productionLaborCostAveragePrice: number
    indirectLaborExpensePercent: number
    fixedExpensePercent: number
    variableExpensePercent: number
    financialExpensePercent: number
    taxesPercent: number
    productionLaborCostAveragePercent: number
    profitBasePercent: number
    productCostPercent: number
    yearIncomeAverage: number
    sumIncomeYearAverageByCategory: number
  }
  monthInfo: IMonthInfo
  monthIncomeAndExpenses?: IMonthChartInfo
  monthExpensesByCategoryGroup?: monthExpensesByCategoryGroup
}

// Shared chart options
const sharedChartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 16,
        font: {
          family: "'Inter', sans-serif",
          size: 11,
          weight: '500' as const,
        },
        color: '#94a3b8',
      },
    },
    title: {
      display: false,
    },
    tooltip: {
      backgroundColor: '#1D2939',
      titleColor: '#FFFFFF',
      bodyColor: '#E4E7EC',
      borderColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 10,
      titleFont: {
        family: "'Inter', sans-serif",
        size: 12,
        weight: '600' as const,
      },
      bodyFont: {
        family: "'Inter', sans-serif",
        size: 11,
      },
      callbacks: {
        label: function (context: { label: string; parsed: number }) {
          const value = context.parsed || 0
          return ` ${context.label}: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        },
      },
    },
  },
}

// Modern color palette for doughnut charts
const chartColors = {
  blue: { bg: 'rgba(46, 144, 250, 0.15)', border: '#2E90FA' },
  red: { bg: 'rgba(240, 68, 56, 0.15)', border: '#F04438' },
  amber: { bg: 'rgba(247, 144, 9, 0.15)', border: '#F79009' },
  green: { bg: 'rgba(18, 183, 106, 0.15)', border: '#12B76A' },
}

function CashierExpensePercentuals({ calcBase, monthInfo, monthIncomeAndExpenses }: Props) {
  const currMonthExpensesByCategoryGroup = sumExpensesByCategoryGroup(
    monthIncomeAndExpenses?.expenses || []
  )
  if (monthInfo === null) return null
  return (
    <div className="doughnut-grid">
      <FixedExpenseChart
        calcBase={calcBase}
        monthInfo={monthInfo}
        monthExpensesByCategoryGroup={currMonthExpensesByCategoryGroup}
      />
      <VariableExpenseChart
        calcBase={calcBase}
        monthInfo={monthInfo}
        monthExpensesByCategoryGroup={currMonthExpensesByCategoryGroup}
      />
      <FinancialExpenseChart
        calcBase={calcBase}
        monthInfo={monthInfo}
        monthExpensesByCategoryGroup={currMonthExpensesByCategoryGroup}
      />
      <SumIncomeAverageByCategoryChart
        calcBase={calcBase}
        monthInfo={monthInfo}
        monthIncomeAndExpenses={monthIncomeAndExpenses}
      />
    </div>
  )
}

function DoughnutCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px',
    }}>
      <h4 style={{
        fontSize: '13px',
        fontWeight: 600,
        color: '#e2e8f0',
        marginBottom: '12px',
        textAlign: 'center',
        lineHeight: 1.3,
      }}>
        {title}
      </h4>
      <div style={{ width: '100%', maxWidth: '220px' }}>
        {children}
      </div>
    </div>
  )
}

function FixedExpenseChart({ calcBase, monthInfo, monthExpensesByCategoryGroup }: Props) {
  const { fixedExpensePercent } = calcBase
  const { goal } = monthInfo
  const { DESPESAS_FIXAS } = monthExpensesByCategoryGroup || {}

  const chartData = {
    labels: ['Meta Faturamento', 'Média Desp. Fixas', 'Desp. Fixas Mês'],
    datasets: [{
      data: [goal, calcPercentualValue(goal, fixedExpensePercent), DESPESAS_FIXAS || 0],
      backgroundColor: [chartColors.blue.bg, chartColors.red.bg, chartColors.amber.bg],
      borderColor: [chartColors.blue.border, chartColors.red.border, chartColors.amber.border],
      borderWidth: 2,
    }],
  }

  if (goal === 0) return null
  return (
    <DoughnutCard title="Despesas Fixas">
      <Doughnut options={sharedChartOptions} data={chartData} />
    </DoughnutCard>
  )
}

function VariableExpenseChart({ calcBase, monthInfo, monthExpensesByCategoryGroup }: Props) {
  const { variableExpensePercent } = calcBase
  const { goal } = monthInfo
  const { DESPESAS_VARIAVEIS } = monthExpensesByCategoryGroup || {}

  const chartData = {
    labels: ['Meta Faturamento', 'Média Desp. Variáveis', 'Desp. Variáveis Mês'],
    datasets: [{
      data: [goal, calcPercentualValue(goal, variableExpensePercent), DESPESAS_VARIAVEIS || 0],
      backgroundColor: [chartColors.blue.bg, chartColors.red.bg, chartColors.amber.bg],
      borderColor: [chartColors.blue.border, chartColors.red.border, chartColors.amber.border],
      borderWidth: 2,
    }],
  }

  if (goal === 0) return null
  return (
    <DoughnutCard title="Despesas Variáveis">
      <Doughnut options={sharedChartOptions} data={chartData} />
    </DoughnutCard>
  )
}

function FinancialExpenseChart({ calcBase, monthInfo, monthExpensesByCategoryGroup }: Props) {
  const { financialExpensePercent } = calcBase
  const { goal } = monthInfo
  const { DESPESAS_FINANCEIRAS } = monthExpensesByCategoryGroup || {}

  const chartData = {
    labels: ['Meta Faturamento', 'Média Desp. Financeiras', 'Desp. Financeiras Mês'],
    datasets: [{
      data: [goal, calcPercentualValue(goal, financialExpensePercent), DESPESAS_FINANCEIRAS || 0],
      backgroundColor: [chartColors.blue.bg, chartColors.red.bg, chartColors.amber.bg],
      borderColor: [chartColors.blue.border, chartColors.red.border, chartColors.amber.border],
      borderWidth: 2,
    }],
  }

  if (goal === 0) return null
  return (
    <DoughnutCard title="Despesas Financeiras">
      <Doughnut options={sharedChartOptions} data={chartData} />
    </DoughnutCard>
  )
}

function SumIncomeAverageByCategoryChart({ monthInfo }: Props) {
  const { goal, sumIncome } = monthInfo

  const chartData = {
    labels: ['Meta Faturamento', 'Faturamento do Mês'],
    datasets: [{
      data: [goal, sumIncome],
      backgroundColor: [chartColors.blue.bg, chartColors.green.bg],
      borderColor: [chartColors.blue.border, chartColors.green.border],
      borderWidth: 2,
    }],
  }

  if (goal === 0) return null
  return (
    <DoughnutCard title="Meta x Faturamento">
      <Doughnut options={sharedChartOptions} data={chartData} />
    </DoughnutCard>
  )
}

const calcPercentualValue = (monthGoal: number, expensePercentual: number) => {
  return Number((monthGoal * (expensePercentual / 100)).toFixed(2))
}

const sumByCategoryGroup: Record<string, number> = {}
for (const categoryGroup in CATEGORIES_BASE_CALCULO) {
  sumByCategoryGroup[categoryGroup] = 0
}

const categoryGroupsToConsider = {
  ...CATEGORIES_BASE_CALCULO.DESPESAS_VARIAVEIS,
  ...CATEGORIES_BASE_CALCULO.DESPESAS_FIXAS,
  ...CATEGORIES_BASE_CALCULO.DESPESAS_FINANCEIRAS,
}

function isCategoryIncluded(category: string) {
  return Object.values(categoryGroupsToConsider).includes(category)
}

function sumExpensesByCategoryGroup(expenses: ICashierEntry[]) {
  // Reset counts
  for (const categoryGroup in sumByCategoryGroup) {
    sumByCategoryGroup[categoryGroup] = 0
  }
  for (const expense of expenses) {
    if (isCategoryIncluded(expense.category)) {
      for (const categoryGroup in CATEGORIES_BASE_CALCULO) {
        if ((CATEGORIES_BASE_CALCULO as any)[categoryGroup][expense.category]) {
          sumByCategoryGroup[categoryGroup] += expense.price
          break
        }
      }
    }
  }
  return sumByCategoryGroup
}

export default CashierExpensePercentuals
