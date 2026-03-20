import React, { useState, useEffect, useMemo } from 'react'
import { Select, Table, Tag, DatePicker, Space, message, Button, Statistic, Card, Empty } from 'antd'
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
} from '@ant-design/icons'

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface CommissionRow {
  employee_id: string
  name: string
  commission_percent: number
  base_revenue: number
  commission_value: number
}

export default function CommissionPage() {
  const { canView } = usePermissions()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(dayjs())
  const [employees, setEmployees] = useState<{ id: string; name: string; commission_percent: number }[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>(undefined)
  const [commissionData, setCommissionData] = useState<CommissionRow[]>([])

  // Fetch employees with commission
  useEffect(() => {
    ;(async () => {
      const tenantId = await getTenantId()
      if (!tenantId) return
      const { data: emps } = await supabase
        .from('employees')
        .select('id, name, commission_percent')
        .eq('status', 'ACTIVE')
        .eq('is_active', true)
        .not('commission_percent', 'is', null)
      setEmployees((emps || []).filter((e: any) => Number(e.commission_percent) > 0))
    })()
  }, [])

  // Fetch commission data
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const tenantId = await getTenantId()
        if (!tenantId) return

        const start = month.startOf('month').format('YYYY-MM-DD')
        const end = month.endOf('month').format('YYYY-MM-DD')

        const { data: emps } = await supabase
          .from('employees')
          .select('id, name, commission_percent')
          .eq('status', 'ACTIVE')
          .eq('is_active', true)
          .not('commission_percent', 'is', null)

        const employeesWithCommission = (emps || []).filter((e: any) => Number(e.commission_percent) > 0)

        if (employeesWithCommission.length === 0) {
          if (!cancelled) setCommissionData([])
          return
        }

        const empMap = new Map(
          employeesWithCommission.map((e: any) => [
            e.id,
            { name: e.name, commission_percent: Number(e.commission_percent) || 0, base_revenue: 0, commission_value: 0 },
          ]),
        )

        // Completed services
        const { data: services } = await supabase
          .from('completed_services')
          .select('employee_id, total_revenue')
          .eq('is_active', true)
          .gte('service_date', start)
          .lte('service_date', end)

        for (const s of services || []) {
          if (!s.employee_id) continue
          const emp = empMap.get(s.employee_id)
          if (!emp) continue
          const rev = Number(s.total_revenue) || 0
          emp.base_revenue += rev
          emp.commission_value += rev * (emp.commission_percent / 100)
        }

        // Sales via budgets
        const { data: sales } = await supabase
          .from('sales')
          .select('id, final_value, budget_id')
          .eq('is_active', true)
          .gte('sale_date', start)
          .lte('sale_date', end)
          .not('budget_id', 'is', null)

        if (sales?.length) {
          const budgetIds = [...new Set((sales as any[]).map(s => s.budget_id).filter(Boolean))]
          const { data: budgets } = await supabase.from('budgets').select('id, employee_id').in('id', budgetIds)
          const budgetEmp = new Map((budgets || []).map((b: any) => [b.id, b.employee_id]))
          const { data: empRows } = await supabase
            .from('employees')
            .select('id, commission_percent')
            .in('id', [...new Set((budgets || []).map((b: any) => b.employee_id).filter(Boolean))])
          const pctByEmp = new Map((empRows || []).map((e: any) => [e.id, Number(e.commission_percent) || 0]))

          for (const sale of sales as any[]) {
            const empId = budgetEmp.get(sale.budget_id)
            if (!empId) continue
            const pct = pctByEmp.get(empId) || 0
            if (pct <= 0) continue
            const emp = empMap.get(empId)
            if (!emp) continue
            const val = Number(sale.final_value) || 0
            emp.base_revenue += val
            emp.commission_value += val * (pct / 100) / (1 + pct / 100)
          }
        }

        if (!cancelled) {
          setCommissionData(
            employeesWithCommission.map((e: any) => ({
              employee_id: e.id,
              name: e.name,
              commission_percent: empMap.get(e.id)?.commission_percent ?? 0,
              base_revenue: empMap.get(e.id)?.base_revenue ?? 0,
              commission_value: empMap.get(e.id)?.commission_value ?? 0,
            })),
          )
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <Button icon={<FileExcelOutlined />} onClick={handleExportExcel} disabled={!filteredData.length}>
            Exportar Excel
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={handleExportPdf} type="primary" style={{ background: '#7C3AED', borderColor: '#7C3AED' }} disabled={!filteredData.length}>
            Exportar PDF
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
                <Table.Summary.Cell index={2} align="right">
                  <strong style={{ color: '#e2e8f0' }}>{formatCurrency(totalBase)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
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
    </Layout>
  )
}
