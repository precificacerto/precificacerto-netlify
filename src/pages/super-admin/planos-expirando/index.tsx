import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { Select, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'

type TenantRow = {
  id: string
  name: string
  email: string | null
  plan_status: string
  trial_ends_at: string | null
  plan_ends_at: string | null
}

function SuperAdminPlanosExpirando() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin
  const [days, setDays] = useState(30)

  const { data, isLoading: loading } = useCachedFetch<TenantRow[]>(
    isSA ? `/api/super-admin/plans-expiring?days=${days}` : null
  )
  const rows = Array.isArray(data) ? data : []

  if (currentUser && !isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }
  if (!isSA) return null

  const columns: ColumnsType<TenantRow> = [
    { title: 'Nome', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Status',
      dataIndex: 'plan_status',
      key: 'plan_status',
      render: (s: string) => <Tag>{s}</Tag>,
    },
    {
      title: 'Trial até',
      dataIndex: 'trial_ends_at',
      key: 'trial_ends_at',
      render: (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—'),
    },
    {
      title: 'Plano até',
      dataIndex: 'plan_ends_at',
      key: 'plan_ends_at',
      render: (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—'),
    },
  ]

  return (
    <Layout
      title={PAGE_TITLES.SUPER_ADMIN_PLANS_EXPIRING}
      subtitle={<Tag color="blue">Super Admin</Tag>}
    >
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <span>Próximos </span>
        <Select
          value={days}
          onChange={setDays}
          options={[
            { value: 7, label: '7 dias' },
            { value: 15, label: '15 dias' },
            { value: 30, label: '30 dias' },
          ]}
          style={{ width: 120 }}
        />
      </div>
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

export default SuperAdminPlanosExpirando
