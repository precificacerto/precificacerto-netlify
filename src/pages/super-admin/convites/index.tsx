import React from 'react'
import { useRouter } from 'next/router'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'

type InvitationRow = {
  id: string
  tenant_id: string
  email: string
  role: string
  invited_by: string | null
  accepted_at: string | null
  expires_at: string
  created_at: string
  tenants?: { name: string } | null
}

function SuperAdminConvites() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin

  const { data, isLoading: loading } = useCachedFetch<InvitationRow[]>(
    isSA ? '/api/super-admin/invitations' : null
  )
  const rows = Array.isArray(data) ? data : []

  if (currentUser && !isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }
  if (!isSA) return null

  const getInviteStatus = (record: InvitationRow) => {
    if (record.accepted_at) return { label: 'Aceito', color: 'green' }
    if (new Date(record.expires_at) < new Date()) return { label: 'Expirado', color: 'default' }
    return { label: 'Pendente', color: 'orange' }
  }

  const columns: ColumnsType<InvitationRow> = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Tenant',
      key: 'tenant',
      render: (_, record) => record.tenants?.name ?? record.tenant_id ?? '—',
    },
    { title: 'Papel', dataIndex: 'role', key: 'role', render: (r) => <Tag>{r}</Tag> },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => {
        const s = getInviteStatus(record)
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: 'Expira em',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (v: string) => new Date(v).toLocaleString('pt-BR'),
    },
    {
      title: 'Criado em',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => new Date(v).toLocaleString('pt-BR'),
    },
  ]

  return (
    <Layout
      title={PAGE_TITLES.SUPER_ADMIN_INVITES}
      subtitle={<Tag color="blue">Super Admin</Tag>}
    >
      <p className="page-header-subtitle" style={{ marginBottom: 16 }}>
        Convites têm aprovação automática. Esta lista é apenas para visibilidade.
      </p>
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

export default SuperAdminConvites
