import { IMonthChartInfo } from '@/types/cashier.types'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

type Props = {
  cashierMonthIncomeExpenseList?: IMonthChartInfo | null
  year: string
  month?: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function CashierMonthIncomeExpenseChart({ year, cashierMonthIncomeExpenseList, month }: Props) {
  if (!cashierMonthIncomeExpenseList) return null

  const monthIdx = month != null ? month : new Date().getMonth()
  const daysInMonth = new Date(Number(year), monthIdx + 1, 0).getDate()
  const dailyData = Array.from({ length: daysInMonth }, () => ({ sumIncome: 0, sumExpense: 0 }))

  cashierMonthIncomeExpenseList.incomes.forEach((income) => {
    const day = new Date(income.date + 'T00:00:00').getDate()
    if (day >= 1 && day <= daysInMonth) {
      dailyData[day - 1].sumIncome += income.price
    }
  })

  cashierMonthIncomeExpenseList.expenses.forEach((expense) => {
    const day = new Date(expense.date + 'T00:00:00').getDate()
    if (day >= 1 && day <= daysInMonth) {
      dailyData[day - 1].sumExpense += expense.price
    }
  })

  const labels = Array.from({ length: daysInMonth }, (_, index) => {
    return `${(index + 1).toString().padStart(2, '0')}`
  })

  const incomes = dailyData.map((dayData) => dayData.sumIncome)
  const expenses = dailyData.map((dayData) => dayData.sumExpense)

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          font: {
            family: "'Inter', sans-serif",
            size: 12,
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
        padding: 12,
        titleFont: {
          family: "'Inter', sans-serif",
          size: 13,
          weight: '600' as const,
        },
        bodyFont: {
          family: "'Inter', sans-serif",
          size: 12,
        },
        callbacks: {
          title: function (context: any[]) {
            return `Dia ${context[0]?.label || ''}`
          },
          label: function (context: any) {
            const label = context.dataset?.label || ''
            const value = context.parsed?.y || 0
            return ` ${label}: ${formatCurrency(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            family: "'Inter', sans-serif",
            size: 10,
          },
          color: '#64748b',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 15,
        },
        border: {
          display: false,
        },
      },
      y: {
        grid: {
          color: 'rgba(255,255,255,0.08)',
        },
        ticks: {
          font: {
            family: "'Inter', sans-serif",
            size: 11,
          },
          color: '#64748b',
          callback: function (value: number | string) {
            if (typeof value === 'number') {
              if (value >= 1000) {
                return `R$ ${(value / 1000).toFixed(1).replace('.', ',')}k`
              }
              return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
            }
            return value
          },
        },
        border: {
          display: false,
        },
      },
    },
  }

  const data = {
    labels,
    datasets: [
      {
        label: 'Entradas',
        data: incomes,
        borderColor: '#12B76A',
        backgroundColor: 'rgba(18, 183, 106, 0.06)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 2,
        pointBackgroundColor: '#12B76A',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointHoverRadius: 5,
      },
      {
        label: 'Saídas',
        data: expenses,
        borderColor: '#F04438',
        backgroundColor: 'rgba(240, 68, 56, 0.04)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 2,
        pointBackgroundColor: '#F04438',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointHoverRadius: 5,
      },
    ],
  }

  return <Line options={options} data={data} />
}

export default CashierMonthIncomeExpenseChart
