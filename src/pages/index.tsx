import { useEffect, useState, useMemo, useCallback } from 'react'
import { Spin, Select, Button, Alert } from 'antd'
import { useRouter } from 'next/router'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CalcBaseType } from '@/types/calc-base.type'
import { buildCalcBase } from '@/utils/build-calc-base'
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
import { monthObjects } from '@/constants/month'
import MonthIncomeExpenseChart from '@/components/charts/cashier-month-income-expense-chart'
import CashierExpensePercentuals from '@/components/charts/cashier-expense-percentuals'
import { IMonthInfo, IMonthChartInfo, ICashierMonthModel } from '@/types/cashier.types'
import { CardKPI } from '@/components/ui/card-kpi.component'
import {
  WalletOutlined,
  ArrowDownOutlined,
  DollarOutlined,
  CalendarOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
} from '@ant-design/icons'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'
import { useAuth } from '@/hooks/use-auth.hook'
import { getDashboardCache, setDashboardCache } from '@/utils/dashboard-cache'
import { RestitutionSummaryCard } from '@/components/restitution-summary.component'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const MONTH_OPTIONS = [
  { value: 0, label: 'Janeiro' }, { value: 1, label: 'Fevereiro' }, { value: 2, label: 'Março' },
  { value: 3, label: 'Abril' }, { value: 4, label: 'Maio' }, { value: 5, label: 'Junho' },
  { value: 6, label: 'Julho' }, { value: 7, label: 'Agosto' }, { value: 8, label: 'Setembro' },
  { value: 9, label: 'Outubro' }, { value: 10, label: 'Novembro' }, { value: 11, label: 'Dezembro' },
]

function Home() {
  const { currentUser } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const currentYear = new Date().getFullYear()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [allYearEntries, setAllYearEntries] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cashierMonthsData, setCashierMonthsData] = useState<any[]>([])
  const [calcBase, setCalcBase] = useState<CalcBaseType>(buildCalcBase(null))
  const [showPricingBanner, setShowPricingBanner] = useState(false)
  const [tenantSettingsId, setTenantSettingsId] = useState<string | null>(null)
  const [restitutionSummary, setRestitutionSummary] = useState<{
    monthLabel: string
    pis: number
    cofins: number
    icms: number
    total: number
  } | null>(null)

  const dismissPricingBanner = useCallback(async () => {
    setShowPricingBanner(false)
    if (!tenantSettingsId) return
    await supabase
      .from('tenant_settings')
      .update({ pricing_engine_updated_notice_dismissed: true })
      .eq('id', tenantSettingsId)
  }, [tenantSettingsId])

  useEffect(() => {
    fetchDashboardData()
  }, [currentUser, currentYear])

  async function fetchDashboardData() {
    const tenantId = await getTenantId()
    if (!tenantId) return

    const cached = getDashboardCache(tenantId, currentYear)
    if (cached) {
      setAllYearEntries(cached.allYearEntries)
      setCashierMonthsData(cached.cashierMonthsData)
      setCalcBase(cached.calcBase as CalcBaseType)
      setLoading(false)
      // Revalida em background para manter dados atualizados
      revalidateDashboard(tenantId)
      return
    }

    setLoading(true)
    try {
      const startOfYear = `${currentYear}-01-01`
      const endOfYear = `${currentYear}-12-31`

      const [yearEntriesRes, cashierMonthsRes, expenseConfigRes, tenantSettingsRes, restitutionRes] = await Promise.all([
        supabase.from('cash_entries').select('*').eq('tenant_id', tenantId).eq('is_active', true).gte('due_date', startOfYear).lte('due_date', endOfYear),
        supabase.from('cashier_months').select('*').eq('tenant_id', tenantId).gte('month_year', startOfYear).lte('month_year', endOfYear),
        supabase.from('tenant_expense_config').select('*').eq('tenant_id', tenantId).single(),
        supabase.from('tenant_settings').select('id, pricing_engine_updated_notice_dismissed, tax_regime').eq('tenant_id', tenantId).single(),
        supabase
          .from('tax_restitution_entries')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('reference_month', { ascending: false })
          .limit(1),
      ])

      const entries = yearEntriesRes.data || []
      const months = cashierMonthsRes.data || []
      setAllYearEntries(entries)
      setCashierMonthsData(months)

      const expense = expenseConfigRes.data
      const base = expense ? buildCalcBase(expense) : buildCalcBase(null)
      setCalcBase(base)

      const ts = tenantSettingsRes.data
      if (ts) {
        setTenantSettingsId(ts.id)
        const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.is_super_admin
        if (isAdmin && !ts.pricing_engine_updated_notice_dismissed) {
          setShowPricingBanner(true)
        }

        if (ts.tax_regime === 'LUCRO_REAL' && restitutionRes.data && restitutionRes.data.length > 0) {
          const r = restitutionRes.data[0]
          setRestitutionSummary({
            monthLabel: new Date(r.reference_month + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
            pis: Number(r.pis_credit) || 0,
            cofins: Number(r.cofins_credit) || 0,
            icms: Number(r.icms_credit) || 0,
            total: Number(r.total_restitution) || 0,
          })
        } else {
          setRestitutionSummary(null)
        }
      }

      setDashboardCache(tenantId, currentYear, {
        allYearEntries: entries,
        cashierMonthsData: months,
        calcBase: base,
      })
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  async function revalidateDashboard(tenantId: string) {
    try {
      const startOfYear = `${currentYear}-01-01`
      const endOfYear = `${currentYear}-12-31`
      const [yearEntriesRes, cashierMonthsRes, expenseConfigRes] = await Promise.all([
        supabase.from('cash_entries').select('*').eq('tenant_id', tenantId).eq('is_active', true).gte('due_date', startOfYear).lte('due_date', endOfYear),
        supabase.from('cashier_months').select('*').eq('tenant_id', tenantId).gte('month_year', startOfYear).lte('month_year', endOfYear),
        supabase.from('tenant_expense_config').select('*').eq('tenant_id', tenantId).single(),
      ])
      const entries = yearEntriesRes.data || []
      const months = cashierMonthsRes.data || []
      const expense = expenseConfigRes.data
      const base = expense ? buildCalcBase(expense) : buildCalcBase(null)
      setAllYearEntries(entries)
      setCashierMonthsData(months)
      setCalcBase(base)
      setDashboardCache(tenantId, currentYear, {
        allYearEntries: entries,
        cashierMonthsData: months,
        calcBase: base,
      })
    } catch {
      // falha silenciosa na revalidação em background
    }
  }

  const monthlyAggregated = useMemo(() => {
    const agg: Record<string, { sumIncome: number; sumExpense: number; goal: number }> = {}
    for (let m = 0; m < 12; m++) {
      const key = `${currentYear}-${Object.values(monthObjects)[m].short.toUpperCase()}`
      agg[key] = { sumIncome: 0, sumExpense: 0, goal: 0 }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allYearEntries.forEach((entry: any) => {
      const d = new Date(entry.due_date + 'T00:00:00')
      const mIdx = d.getMonth()
      const key = `${currentYear}-${Object.values(monthObjects)[mIdx].short.toUpperCase()}`
      if (agg[key]) {
        if (entry.type === 'INCOME') agg[key].sumIncome += getEffectiveIncomeAmount(entry)
        else agg[key].sumExpense += Number(entry.amount) || 0
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cashierMonthsData.forEach((cm: any) => {
      const d = new Date(cm.month_year + 'T00:00:00')
      const mIdx = d.getMonth()
      const key = `${currentYear}-${Object.values(monthObjects)[mIdx].short.toUpperCase()}`
      if (agg[key]) agg[key].goal = Number(cm.balance) || 0
    })
    return agg
  }, [allYearEntries, cashierMonthsData, currentYear])

  const cashierMonthList = useMemo<ICashierMonthModel[]>(() => {
    return Object.entries(monthlyAggregated).map(([id, d]) => ({
      id, goal: d.goal, sumIncome: d.sumIncome, sumExpense: d.sumExpense,
    }))
  }, [monthlyAggregated])

  const selectedMonthEntries = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return allYearEntries.filter((e: any) => {
      const d = new Date(e.due_date + 'T00:00:00')
      return d.getMonth() === selectedMonth && d.getFullYear() === currentYear
    })
  }, [allYearEntries, selectedMonth, currentYear])

  const selectedMonthChartData = useMemo<IMonthChartInfo>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const incomes = selectedMonthEntries.filter((e: any) => e.type === 'INCOME').map((e: any) => ({
      id: e.id, date: e.due_date, price: getEffectiveIncomeAmount(e),
      category: e.description || 'RECEITA_VENDAS', description: e.description || '',
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expenses = selectedMonthEntries.filter((e: any) => e.type === 'EXPENSE').map((e: any) => ({
      id: e.id, date: e.due_date, price: Number(e.amount) || 0,
      category: e.description || 'DESPESA_GERAL', description: e.description || '',
    }))
    return { incomes, expenses }
  }, [selectedMonthEntries])

  const totalEntradas = selectedMonthChartData.incomes.reduce((sum, item) => sum + (item.price || 0), 0)
  const totalSaidas = selectedMonthChartData.expenses.reduce((sum, item) => sum + (item.price || 0), 0)
  const saldoAtual = totalEntradas - totalSaidas

  const monthInfo = useMemo<IMonthInfo>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = cashierMonthsData.find((c: any) => {
      const d = new Date(c.month_year + 'T00:00:00')
      return d.getMonth() === selectedMonth && d.getFullYear() === currentYear
    })
    return {
      goal: cm ? Number(cm.balance) || 0 : 0,
      sumIncome: totalEntradas,
      sumExpense: totalSaidas,
    }
  }, [cashierMonthsData, selectedMonth, currentYear, totalEntradas, totalSaidas])

  const metaMensal = monthInfo?.goal || 0

  const totalAnualEntradas = useMemo(() => {
    return allYearEntries.filter((e: any) => e.type === 'INCOME').reduce((s: number, e: any) => s + getEffectiveIncomeAmount(e), 0)
  }, [allYearEntries])
  const totalAnualSaidas = useMemo(() => {
    return allYearEntries.filter((e: any) => e.type === 'EXPENSE').reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0)
  }, [allYearEntries])

  function exportToCSV() {
    const monthNames = MONTH_OPTIONS.map(m => m.label)
    const header = 'Mês,Entradas,Saídas,Saldo,Meta\n'
    const rows = Object.entries(monthlyAggregated).map(([key, d], i) => {
      return [
        monthNames[i] || key,
        d.sumIncome.toFixed(2).replace('.', ','),
        d.sumExpense.toFixed(2).replace('.', ','),
        (d.sumIncome - d.sumExpense).toFixed(2).replace('.', ','),
        d.goal.toFixed(2).replace('.', ','),
      ].join(';')
    }).join('\n')

    const totalsRow = `\nTOTAL;${totalAnualEntradas.toFixed(2).replace('.', ',')};${totalAnualSaidas.toFixed(2).replace('.', ',')};${(totalAnualEntradas - totalAnualSaidas).toFixed(2).replace('.', ',')};`

    const csvContent = '\ufeff' + header + rows + totalsRow
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dashboard-${selectedYear}.csv`
    link.click()
    URL.revokeObjectURL(url)
    messageApi.success('Arquivo CSV exportado com sucesso!')
  }

  function exportToPDF() {
    const monthNames = MONTH_OPTIONS.map(m => m.label)
    const printWindow = window.open('', '_blank')
    if (!printWindow) { messageApi.error('Habilite popups para exportar PDF.'); return }

    const tableRows = Object.entries(monthlyAggregated).map(([key, d], i) => {
      const saldo = d.sumIncome - d.sumExpense
      return `<tr>
        <td>${monthNames[i] || key}</td>
        <td style="color:#12B76A">${formatCurrency(d.sumIncome)}</td>
        <td style="color:#F04438">${formatCurrency(d.sumExpense)}</td>
        <td style="color:${saldo >= 0 ? '#12B76A' : '#F04438'}">${formatCurrency(saldo)}</td>
        <td>${formatCurrency(d.goal)}</td>
      </tr>`
    }).join('')

    const saldoTotal = totalAnualEntradas - totalAnualSaidas
    const html = `<!DOCTYPE html><html><head><title>Dashboard ${selectedYear}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #333; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #667085; margin-top: 0; margin-bottom: 20px; }
        .kpis { display: flex; gap: 16px; margin-bottom: 24px; }
        .kpi { flex: 1; padding: 16px; border-radius: 8px; border: 1px solid #E4E7EC; text-align: center; }
        .kpi-label { font-size: 11px; color: #667085; text-transform: uppercase; }
        .kpi-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #F9FAFB; padding: 8px 12px; text-align: left; border-bottom: 2px solid #E4E7EC; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #667085; }
        td { padding: 8px 12px; border-bottom: 1px solid #F2F4F7; }
        tfoot td { font-weight: 700; border-top: 2px solid #E4E7EC; }
        @media print { body { padding: 0; } }
      </style>
    </head><body>
      <h1>Dashboard Financeiro — ${selectedYear}</h1>
      <h2>Mês selecionado: ${MONTH_OPTIONS[selectedMonth]?.label || ''}</h2>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Total Entradas (Mês)</div><div class="kpi-value" style="color:#12B76A">${formatCurrency(totalEntradas)}</div></div>
        <div class="kpi"><div class="kpi-label">Total Saídas (Mês)</div><div class="kpi-value" style="color:#F04438">${formatCurrency(totalSaidas)}</div></div>
        <div class="kpi"><div class="kpi-label">Saldo (Mês)</div><div class="kpi-value" style="color:${saldoAtual >= 0 ? '#12B76A' : '#F04438'}">${formatCurrency(saldoAtual)}</div></div>
        <div class="kpi"><div class="kpi-label">Meta Mensal</div><div class="kpi-value" style="color:#F79009">${formatCurrency(metaMensal)}</div></div>
      </div>
      <table>
        <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th><th>Meta</th></tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot><tr>
          <td>TOTAL ANUAL</td>
          <td style="color:#12B76A">${formatCurrency(totalAnualEntradas)}</td>
          <td style="color:#F04438">${formatCurrency(totalAnualSaidas)}</td>
          <td style="color:${saldoTotal >= 0 ? '#12B76A' : '#F04438'}">${formatCurrency(saldoTotal)}</td>
          <td>—</td>
        </tr></tfoot>
      </table>
    </body></html>`

    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 500)
  }

  function renderYearChart() {
    const preparedDataToChart = Object.values(monthObjects).map((month) => {
      const yearMonth = `${year}-${month.short.toUpperCase()}`
      const data = monthlyAggregated[yearMonth] || { sumIncome: 0, sumExpense: 0, goal: 0 }
      return { id: yearMonth, ...data }
    })

    const data = {
      labels: MONTH_LABELS,
      datasets: [
        {
          label: 'Entradas',
          data: preparedDataToChart.map((item) => item.sumIncome),
          borderColor: '#12B76A',
          backgroundColor: 'rgba(18, 183, 106, 0.08)',
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: '#12B76A',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
        },
        {
          label: 'Saídas',
          data: preparedDataToChart.map((item) => item.sumExpense),
          borderColor: '#F04438',
          backgroundColor: 'rgba(240, 68, 56, 0.06)',
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: '#F04438',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
        },
        {
          label: 'Metas',
          data: preparedDataToChart.map((item) => item.goal),
          borderColor: '#F79009',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 2,
          pointBackgroundColor: '#F79009',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 5,
        },
      ],
    }

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
            font: { family: "'Inter', sans-serif", size: 12, weight: '500' as const },
            color: '#667085',
          },
        },
        title: { display: false },
        tooltip: {
          backgroundColor: '#1D2939',
          titleColor: '#FFFFFF',
          bodyColor: '#E4E7EC',
          borderColor: '#344054',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: "'Inter', sans-serif", size: 13, weight: '600' as const },
          bodyFont: { family: "'Inter', sans-serif", size: 12 },
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          grid: { display: false },
          ticks: { font: { family: "'Inter', sans-serif", size: 12 }, color: '#98A2B3' },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(228, 231, 236, 0.5)' },
          ticks: {
            font: { family: "'Inter', sans-serif", size: 11 },
            color: '#98A2B3',
            callback: function (value: number | string) {
              if (typeof value === 'number') {
                if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`
                return `R$ ${value}`
              }
              return value
            },
          },
          border: { display: false },
        },
      },
    }

    return (
      <div className="chart-card charts-grid-full">
        <div className="chart-card-header">
          <div>
            <h3 className="chart-card-title">Entradas x Saídas x Metas</h3>
            <p className="chart-card-subtitle">Visão anual {year} — fluxo financeiro mensal</p>
          </div>
        </div>
        <Line options={options} data={data} />
      </div>
    )
  }

  if (loading) {
    return (
      <Layout title={PAGE_TITLES.DASHBOARD}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </Layout>
    )
  }

  const year = currentYear.toString()
  const monthOptions = MONTH_NAMES.map((name, idx) => ({
    label: `${name} ${year}`,
    value: idx,
  }))

  return (
    <Layout title={PAGE_TITLES.DASHBOARD} subtitle="Visão geral do seu negócio">
      {showPricingBanner && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={dismissPricingBanner}
          style={{ marginBottom: 20 }}
          message="Motor de precificação atualizado"
          description={
            <div>
              <p style={{ margin: '4px 0 12px' }}>
                Os preços dos seus produtos foram calculados com a fórmula correta (por dentro).
                Recomendamos revisar e recalcular cada produto para garantir que os preços estejam atualizados.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="primary" size="small" onClick={() => router.push('/produtos')}>
                  Revisar produtos
                </Button>
                <Button size="small" onClick={dismissPricingBanner}>
                  Entendi
                </Button>
              </div>
            </div>
          }
        />
      )}

      <div className="dashboard-greeting" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Olá! 👋</h2>
          <span className="dashboard-greeting-email">{currentUser?.email}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#667085' }}>Mês:</span>
          <Select
            value={selectedMonth}
            onChange={(v) => setSelectedMonth(v)}
            options={MONTH_OPTIONS}
            style={{ width: 160 }}
          />
          {selectedMonth !== new Date().getMonth() && (
            <Button size="small" onClick={() => setSelectedMonth(new Date().getMonth())}>
              Mês atual
            </Button>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <CardKPI
          title="Total de Entradas"
          value={formatCurrency(totalEntradas)}
          icon={<WalletOutlined />}
          variant="green"
          trend={metaMensal > 0 ? { value: Number(((totalEntradas / metaMensal) * 100).toFixed(0)), label: 'da meta' } : undefined}
        />
        <CardKPI
          title="Total de Saídas"
          value={formatCurrency(totalSaidas)}
          icon={<ArrowDownOutlined />}
          variant="red"
        />
        <CardKPI
          title="Saldo Atual"
          value={formatCurrency(saldoAtual)}
          icon={<DollarOutlined />}
          variant={saldoAtual >= 0 ? 'blue' : 'red'}
          trend={saldoAtual !== 0 ? { value: totalEntradas > 0 ? Number(((saldoAtual / totalEntradas) * 100).toFixed(0)) : 0, label: 'margem' } : undefined}
        />
        <CardKPI
          title="Meta Mensal"
          value={formatCurrency(metaMensal)}
          icon={<CalendarOutlined />}
          variant="orange"
        />
      </div>

      {restitutionSummary && currentUser?.taxableRegime === 'LUCRO_REAL' && (
        <RestitutionSummaryCard
          monthLabel={restitutionSummary.monthLabel}
          pisCredit={restitutionSummary.pis}
          cofinsCredit={restitutionSummary.cofins}
          icmsCredit={restitutionSummary.icms}
          totalRestitution={restitutionSummary.total}
        />
      )}

      <div className="charts-grid" style={{ marginBottom: 24 }}>
        {renderYearChart()}
      </div>

      <div className="charts-grid" style={{ marginBottom: 24 }}>
        <div className="chart-card charts-grid-full">
          <div className="chart-card-header">
            <div>
              <h3 className="chart-card-title">Controle Diário</h3>
              <p className="chart-card-subtitle">
                Receitas e despesas diárias — {MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || ''} de {year}
              </p>
            </div>
          </div>
          <MonthIncomeExpenseChart
            year={year}
            month={selectedMonth}
            cashierMonthIncomeExpenseList={selectedMonthChartData}
          />
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: 24 }}>
        <div className="chart-card-header">
          <div>
            <h3 className="chart-card-title">Percentual de Despesas</h3>
            <p className="chart-card-subtitle">Meta de faturamento vs despesas por categoria — {MONTH_NAMES[selectedMonth]}</p>
          </div>
        </div>
        <CashierExpensePercentuals
          calcBase={calcBase}
          monthInfo={monthInfo}
          monthIncomeAndExpenses={selectedMonthChartData}
        />
      </div>
    </Layout>
  )
}

export default Home
