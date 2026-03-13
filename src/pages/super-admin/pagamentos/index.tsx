import React from 'react'
import { useRouter } from 'next/router'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'

type BillingRow = {
  id: string
  tenant_id: string
  status: string
  amount: number | null
  due_date: string | null
  paid_at: string | null
  external_id: string | null
  created_at: string
  tenants?: { id: string; name: string; email: string | null } | null
}

const statusLabels: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'orange' },
  PAID: { label: 'Pago', color: 'green' },
  OVERDUE: { label: 'Vencido', color: 'red' },
  CANCELLED: { label: 'Cancelado', color: 'default' },
}

function SuperAdminPagamentos() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin

  const { data, isLoading: loading } = useCachedFetch<BillingRow[]>(
    isSA ? '/api/super-admin/billing' : null
  )
  const rows = Array.isArray(data) ? data : []

  if (currentUser && !isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }
  if (!isSA) return null

  const columns: ColumnsType<BillingRow> = [
    {
      title: 'Tenant',
      key: 'tenant',
      render: (_, record) => record.tenants?.name ?? record.tenant_id ?? '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const cfg = statusLabels[status] || { label: status, color: 'default' }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number | null) =>
        v != null
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
          : '—',
    },
    {
      title: 'Vencimento',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—'),
    },
    {
      title: 'Pago em',
      dataIndex: 'paid_at',
      key: 'paid_at',
      render: (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—'),
    },
    { title: 'External ID', dataIndex: 'external_id', key: 'external_id', ellipsis: true },
  ]

  return (
    <Layout
      title={PAGE_TITLES.SUPER_ADMIN_BILLING}
      subtitle={<Tag color="blue">Super Admin</Tag>}
    >
      <div className="pc-card--table" style={{ marginBottom: 16 }}>
        <Table
          columns={columns}
          dataSource={rows}
          rowKey="id"
          loading={loading && rows.length === 0}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </div>
    </Layout>
  )
}

export default SuperAdminPagamentos
