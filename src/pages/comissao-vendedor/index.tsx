import React, { useState, useEffect, useMemo } from 'react'
import { Select, Table, Tag, DatePicker, Space, message, Button, Statistic, Card, Empty, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { exportCommissionToExcel } from '@/utils/export-commission-excel'
import { exportCommissionToPdf } from '@/utils/export-commission-pdf'
import {
  FileExcelOutlined,
  FilePdfOutlined,
  TeamOutlined,
  DollarOutlined,
  PercentageOutlined,
  DownloadOutlined,
  SplitCellsOutlined,
} from '@ant-design/icons'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface CommissionRow {
  employee_id: string
  name: string
  commission_percent: number
  base_revenue: number
  commission_value: number
  payment_mode: 'FULL' | 'INSTALLMENT'
}

export default function CommissionPage() {
  const { canView } = usePermissions()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(dayjs())
  const [employees, setEmployees] = useState<{ id: string; name: string; commission_percent: number }[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>(undefined)
  const [commissionData, setCommissionData] = useState<CommissionRow[]>([])

  // Fetch employees list for the filter dropdown (all active)
  useEffect(() => {
    ;(async () => {
      const tenantId = await getTenantId()
      if (!tenantId) return
      const { data: emps } = await supabase
        .from('employees')
        .select('id, name, commission_percent')
        .eq('status', 'ACTIVE')
        .eq('is_active', true)
      setEmployees((emps || []).map((e: any) => ({ id: e.id, name: e.name, commission_percent: Number(e.commission_percent) || 0 })))
    })()
  }, [])

  // Fetch commission data whenever selected month changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const tenantId = await getTenantId()
        if (!tenantId) return

        const start = month.startOf('month').format('YYYY-MM-DD')
        const end = month.endOf('month').format('YYYY-MM-DD')

        // Fetch employees including commission_payment_mode
        const { data: emps } = await supabase
          .from('employees')
          .select('id, name, commission_percent, commission_payment_mode')
          .eq('status', 'ACTIVE')
          .eq('is_active', true)

        const allEmployees = (emps || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          commission_percent: Number(e.commission_percent) || 0,
          payment_mode: (e.commission_payment_mode as 'FULL' | 'INSTALLMENT') || 'FULL',
        }))

        if (allEmployees.length === 0) {
          if (!cancelled) setCommissionData([])
          return
        }

        const empMap = new Map(
          allEmployees.map((e) => [
            e.id,
            {
              name: e.name,
              commission_percent: e.commission_percent,
              payment_mode: e.payment_mode,
              base_revenue: 0,
              commission_value: 0,
            },
          ]),
        )

        // ── Completed services ──
        const { data: services } = await supabase
          .from('completed_services')
          .select('employee_id, total_revenue, service_id')
          .eq('is_active', true)
          .gte('service_date', start)
          .lte('service_date', end)

        const serviceIds = [...new Set((services || []).map((s: any) => s.service_id).filter(Boolean))]
        let svcCommMap = new Map<string, number>()
        if (serviceIds.length > 0) {
          const { data: svcs } = await supabase.from('services').select('id, commission_percent').in('id', serviceIds)
          svcCommMap = new Map((svcs || []).map((s: any) => [s.id, Number(s.commission_percent) || 0]))
        }

        for (const s of services || []) {
          if (!s.employee_id) continue
          const emp = empMap.get(s.employee_id)
          if (!emp) continue

          // For services, INSTALLMENT mode: look for cash_entries linked to completed_service
          // (services are typically paid in full or handled via cash flow — treat as FULL for services)
          const rev = Number(s.total_revenue) || 0
          const svcComm = s.service_id ? (svcCommMap.get(s.service_id) || 0) : 0
          if (svcComm <= 0) continue
          emp.base_revenue += rev
          emp.commission_value += rev * (svcComm / 100)
        }

        // ── Sales ──
        let salesData: any[] = []
        try {
          const { data } = await supabase
            .from('sales')
            .select('id, final_value, budget_id, employee_id, sale_date, sale_type, commission_amount')
            .eq('is_active', true)
          salesData = data || []
        } catch {
          const { data } = await supabase
            .from('sales')
            .select('id, final_value, budget_id, sale_date')
            .eq('is_active', true)
          salesData = (data || []).map((s: any) => ({ ...s, employee_id: null }))
        }

        // Get all sale_items for product commission lookup
        const allSaleIds = salesData.map((s: any) => s.id)
        let allSaleItemRows: any[] = []
        let allProdCommMap = new Map<string, number>()
        if (allSaleIds.length > 0) {
          const { data: saleItemRows } = await supabase.from('sale_items').select('sale_id, product_id').in('sale_id', allSaleIds)
          allSaleItemRows = saleItemRows || []
          const productIds = [...new Set(allSaleItemRows.map((si: any) => si.product_id).filter(Boolean))]
          if (productIds.length > 0) {
            const { data: prods } = await supabase.from('products').select('id, commission_percent').in('id', productIds)
            allProdCommMap = new Map((prods || []).map((p: any) => [p.id, Number(p.commission_percent) || 0]))
          }
        }

        // Map sale_id → max product commission
        const saleProdCommMap = new Map<string, number>()
        for (const si of allSaleItemRows) {
          const cur = saleProdCommMap.get(si.sale_id) || 0
          const pComm = si.product_id ? (allProdCommMap.get(si.product_id) || 0) : 0
          if (pComm > cur) saleProdCommMap.set(si.sale_id, pComm)
        }

        // Fetch cash_entries for all sales (to support INSTALLMENT distribution)
        // cash_entries with origin_type='SALE' and origin_id in sale ids
        let cashEntriesBySale = new Map<string, { due_date: string; amount: number }[]>()
        if (allSaleIds.length > 0) {
          try {
            const { data: ceRows } = await supabase
              .from('cash_entries')
              .select('origin_id, amount, due_date')
              .eq('origin_type', 'SALE')
              .eq('type', 'IN')
              .in('origin_id', allSaleIds)
            for (const ce of ceRows || []) {
              if (!ce.origin_id || !ce.due_date) continue
              const existing = cashEntriesBySale.get(ce.origin_id) || []
              existing.push({ due_date: ce.due_date, amount: Number(ce.amount) || 0 })
              cashEntriesBySale.set(ce.origin_id, existing)
            }
          } catch {
            // If cash_entries query fails, fall back to FULL mode for all
          }
        }

        /**
         * Apply commission for a single sale to the employee accumulator.
         * For FULL mode: entire commission credited in the selected month (if sale_date is in month).
         * For INSTALLMENT mode: commission distributed proportionally across installment due_dates.
         *   Only the portion whose due_date falls in the selected month is credited.
         */
        function applySaleCommission(
          emp: { base_revenue: number; commission_value: number; payment_mode: 'FULL' | 'INSTALLMENT' },
          saleId: string,
          saleDate: string,
          finalValue: number,
          effectivePct: number,
        ) {
          if (effectivePct <= 0 || finalValue <= 0) return
          // Normalize to YYYY-MM-DD to avoid ISO timestamp vs date comparison bug
          const saleDateNorm = saleDate.substring(0, 10)

          if (emp.payment_mode === 'FULL') {
            // Credit only if sale_date is in the selected month
            if (saleDateNorm >= start && saleDateNorm <= end) {
              emp.base_revenue += finalValue
              emp.commission_value += finalValue * (effectivePct / 100)
            }
          } else {
            // INSTALLMENT: distribute commission by cash_entry due_dates
            const entries = cashEntriesBySale.get(saleId)
            if (!entries || entries.length === 0) {
              // No installment data — fallback: credit in the sale month
              if (saleDateNorm >= start && saleDateNorm <= end) {
                emp.base_revenue += finalValue
                emp.commission_value += finalValue * (effectivePct / 100)
              }
              return
            }

            const totalInstallments = entries.reduce((s, e) => s + e.amount, 0)
            if (totalInstallments <= 0) return

            // Sum entries whose due_date falls in the selected month
            const monthlyEntries = entries.filter(e => e.due_date >= start && e.due_date <= end)
            const monthlyAmount = monthlyEntries.reduce((s, e) => s + e.amount, 0)
            if (monthlyAmount <= 0) return

            // Commission proportion = monthlyAmount / totalInstallments * total commission
            const proportion = monthlyAmount / totalInstallments
            emp.base_revenue += finalValue * proportion
            emp.commission_value += finalValue * proportion * (effectivePct / 100)
          }
        }

        // Budget sales
        const budgetSales = salesData.filter((s: any) => s.budget_id)
        const directSales = salesData.filter((s: any) => !s.budget_id && s.employee_id)

        if (budgetSales.length) {
          const budgetIds = [...new Set(budgetSales.map((s: any) => s.budget_id).filter(Boolean))]
          const { data: budgets } = await supabase.from('budgets').select('id, employee_id, commission_amount').in('id', budgetIds)
          const budgetEmp = new Map((budgets || []).map((b: any) => [b.id, b.employee_id]))
          const budgetCommMap = new Map((budgets || []).map((b: any) => [b.id, Number(b.commission_amount) || 0]))

          for (const sale of budgetSales as any[]) {
            const empId = budgetEmp.get(sale.budget_id) || sale.employee_id
            if (!empId) continue
            const emp = empMap.get(empId)
            if (!emp) continue

            // If commission was pre-calculated from commission_tables (budget flow), use it directly
            // Fallback: check the budget's commission_amount when the sale doesn't have it stored yet
            const storedCommission = Number(sale.commission_amount || 0) || budgetCommMap.get(sale.budget_id) || 0
            if (storedCommission > 0 && sale.sale_type === 'FROM_BUDGET') {
              const saleDate = (sale.sale_date || '').substring(0, 10)
              if (emp.payment_mode === 'FULL') {
                if (saleDate >= start && saleDate <= end) {
                  emp.base_revenue += Number(sale.final_value) || 0
                  emp.commission_value += storedCommission
                }
              } else {
                const entries = cashEntriesBySale.get(sale.id)
                if (!entries || entries.length === 0) {
                  if (saleDate >= start && saleDate <= end) {
                    emp.base_revenue += Number(sale.final_value) || 0
                    emp.commission_value += storedCommission
                  }
                } else {
                  const totalAmt = entries.reduce((s, e) => s + e.amount, 0)
                  const monthlyAmt = entries.filter(e => e.due_date >= start && e.due_date <= end).reduce((s, e) => s + e.amount, 0)
                  if (totalAmt > 0 && monthlyAmt > 0) {
                    const prop = monthlyAmt / totalAmt
                    emp.base_revenue += (Number(sale.final_value) || 0) * prop
                    emp.commission_value += storedCommission * prop
                  }
                }
              }
              continue
            }

            const prodComm = saleProdCommMap.get(sale.id) || 0
            applySaleCommission(emp, sale.id, (sale.sale_date || '').substring(0, 10), Number(sale.final_value) || 0, prodComm)
          }
        }

        if (directSales.length) {
          for (const sale of directSales as any[]) {
            const empId = sale.employee_id
            if (!empId) continue
            const emp = empMap.get(empId)
            if (!emp) continue

            // Use stored commission_amount if pre-calculated (direct sales from handleSaveSale)
            const storedCommission = Number(sale.commission_amount || 0)
            if (storedCommission > 0) {
              const saleDate = (sale.sale_date || '').substring(0, 10)
              if (emp.payment_mode === 'FULL') {
                if (saleDate >= start && saleDate <= end) {
                  emp.base_revenue += Number(sale.final_value) || 0
                  emp.commission_value += storedCommission
                }
              } else {
                const entries = cashEntriesBySale.get(sale.id)
                if (!entries || entries.length === 0) {
                  if (saleDate >= start && saleDate <= end) {
                    emp.base_revenue += Number(sale.final_value) || 0
                    emp.commission_value += storedCommission
                  }
                } else {
                  const totalAmt = entries.reduce((s, e) => s + e.amount, 0)
                  const monthlyAmt = entries.filter(e => e.due_date >= start && e.due_date <= end).reduce((s, e) => s + e.amount, 0)
                  if (totalAmt > 0 && monthlyAmt > 0) {
                    const prop = monthlyAmt / totalAmt
                    emp.base_revenue += (Number(sale.final_value) || 0) * prop
                    emp.commission_value += storedCommission * prop
                  }
                }
              }
              continue
            }

            const prodComm = saleProdCommMap.get(sale.id) || 0
            applySaleCommission(emp, sale.id, (sale.sale_date || '').substring(0, 10), Number(sale.final_value) || 0, prodComm)
          }
        }

        if (!cancelled) {
          const rows = allEmployees
            .filter((e) => {
              const emp = empMap.get(e.id)
              return emp && emp.base_revenue > 0
            })
            .map((e) => ({
              employee_id: e.id,
              name: e.name,
              commission_percent: empMap.get(e.id)?.commission_percent ?? 0,
              base_revenue: empMap.get(e.id)?.base_revenue ?? 0,
              commission_value: empMap.get(e.id)?.commission_value ?? 0,
              payment_mode: empMap.get(e.id)?.payment_mode ?? 'FULL',
            }))
          setCommissionData(rows)
        }
      } catch {
        messageApi.error('Erro ao carregar comissões.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [month])

  // Filter by selected employee
  const filteredData = useMemo(() => {
    if (!selectedEmployee) return commissionData
    return commissionData.filter(r => r.employee_id === selectedEmployee)
  }, [commissionData, selectedEmployee])

  // Totals
  const totalBase = useMemo(() => filteredData.reduce((s, r) => s + r.base_revenue, 0), [filteredData])
  const totalCommission = useMemo(() => filteredData.reduce((s, r) => s + r.commission_value, 0), [filteredData])

  const columns: ColumnsType<CommissionRow> = [
    {
      title: 'Vendedor',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <strong>{v}</strong>,
    },
    {
      title: '% Comissão',
      dataIndex: 'commission_percent',
      key: 'commission_percent',
      width: 120,
      align: 'center',
      render: (v: number) => <Tag color="purple">{v}%</Tag>,
    },
    {
      title: 'Modo Pagamento',
      dataIndex: 'payment_mode',
      key: 'payment_mode',
      width: 160,
      align: 'center',
      render: (v: 'FULL' | 'INSTALLMENT') =>
        v === 'INSTALLMENT' ? (
          <Tooltip title="Comissão distribuída conforme parcelamento do cliente">
            <Tag color="orange" icon={<SplitCellsOutlined />}>Parcelado</Tag>
          </Tooltip>
        ) : (
          <Tooltip title="Comissão paga integralmente no mês da venda">
            <Tag color="green">Mês da Venda</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Base (Receita)',
      dataIndex: 'base_revenue',
      key: 'base_revenue',
      align: 'right',
      render: (v: number) => formatCurrency(v),
    },
    {
      title: 'Comissão Calculada',
      dataIndex: 'commission_value',
      key: 'commission_value',
      align: 'right',
      render: (v: number) => <strong style={{ color: '#7C3AED' }}>{formatCurrency(v)}</strong>,
    },
  ]

  const [exportModalOpen, setExportModalOpen] = useState(false)

  const handleExportExcel = () => {
    if (!filteredData.length) {
      messageApi.warning('Nenhum dado para exportar.')
      return
    }
    exportCommissionToExcel(filteredData, month)
    messageApi.success('Excel exportado com sucesso!')
  }

  const handleExportPdf = () => {
    if (!filteredData.length) {
      messageApi.warning('Nenhum dado para exportar.')
      return
    }
    const selectedEmpName = selectedEmployee
      ? employees.find(e => e.id === selectedEmployee)?.name
      : undefined
    exportCommissionToPdf(filteredData, month.month(), month.year(), selectedEmpName)
    messageApi.success('PDF exportado com sucesso!')
  }

  if (!canView(MODULES.COMMISSION)) {
    return (
      <Layout title={PAGE_TITLES.COMMISSION}>
        <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
      </Layout>
    )
  }

  return (
    <Layout title={PAGE_TITLES.COMMISSION} subtitle="Gerencie e exporte comissões dos vendedores">
      {contextHolder}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Mês/Ano</label>
          <DatePicker
            picker="month"
            value={month}
            onChange={(v) => v && setMonth(v)}
            format="MM/YYYY"
            allowClear={false}
            style={{ width: 160 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Vendedor</label>
          <Select
            placeholder="Todos os vendedores"
            allowClear
            value={selectedEmployee}
            onChange={(v) => setSelectedEmployee(v)}
            style={{ width: 240 }}
            options={[
              ...employees.map(e => ({ label: e.name, value: e.id })),
            ]}
          />
        </div>
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)} disabled={!filteredData.length}
            style={{ background: '#7C3AED', borderColor: '#7C3AED', color: '#fff' }}>
            Exportar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card size="small" style={{ background: '#1e1b4b', border: '1px solid #312e81' }}>
          <Statistic
            title={<span style={{ color: '#a5b4fc' }}><TeamOutlined /> Vendedores</span>}
            value={filteredData.length}
            valueStyle={{ color: '#e0e7ff', fontSize: 24 }}
          />
        </Card>
        <Card size="small" style={{ background: '#1e1b4b', border: '1px solid #312e81' }}>
          <Statistic
            title={<span style={{ color: '#a5b4fc' }}><DollarOutlined /> Receita Base</span>}
            value={totalBase}
            precision={2}
            prefix="R$"
            valueStyle={{ color: '#e0e7ff', fontSize: 24 }}
          />
        </Card>
        <Card size="small" style={{ background: '#1e1b4b', border: '1px solid #312e81' }}>
          <Statistic
            title={<span style={{ color: '#c4b5fd' }}><PercentageOutlined /> Total Comissões</span>}
            value={totalCommission}
            precision={2}
            prefix="R$"
            valueStyle={{ color: '#a78bfa', fontSize: 24, fontWeight: 700 }}
          />
        </Card>
      </div>

      {/* Table */}
      {filteredData.length > 0 ? (
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="employee_id"
          loading={loading}
          pagination={false}
          size="middle"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#1e1b4b' }}>
                <Table.Summary.Cell index={0}><strong style={{ color: '#e2e8f0' }}>TOTAL</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} />
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} align="right">
                  <strong style={{ color: '#e2e8f0' }}>{formatCurrency(totalBase)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <strong style={{ color: '#a78bfa' }}>{formatCurrency(totalCommission)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : (
        <Empty
          description={loading ? 'Carregando...' : 'Nenhum vendedor com comissão configurada para este período.'}
          style={{ padding: 60 }}
        />
      )}

      <ExportFormatModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        skipDateRange
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        title="Exportar Comissão de Vendedor"
      />
    </Layout>
  )
}
