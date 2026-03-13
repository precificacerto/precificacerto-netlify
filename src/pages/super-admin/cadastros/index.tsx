import React from 'react'
import { useRouter } from 'next/router'
import { Button, Space, Table, Tag, message, Popconfirm } from 'antd'
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
  created_at: string
  approved_by_super_admin: boolean
}

function SuperAdminCadastros() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin
  const [messageApi, contextHolder] = message.useMessage()

  const { data, isLoading: loading, mutate } = useCachedFetch<TenantRow[]>(
    isSA ? '/api/super-admin/cadastros-pendentes' : null
  )
  const rows = Array.isArray(data) ? data : []

  const handleApprove = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/super-admin/cadastros-pendentes/${tenantId}/approve`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      messageApi.success('Cadastro aprovado')
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao aprovar')
    }
  }

  const handleReject = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/super-admin/cadastros-pendentes/${tenantId}/reject`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      messageApi.success('Cadastro rejeitado')
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao rejeitar')
    }
  }

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
      title: 'Cadastro em',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => new Date(v).toLocaleString('pt-BR'),
    },
    {
      title: 'Ações',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="primary" size="small" onClick={() => handleApprove(record.id)}>
            Aprovar
          </Button>
          <Popconfirm
            title="Rejeitar cadastro? A tenant será suspensa."
            onConfirm={() => handleReject(record.id)}
          >
            <Button size="small" danger>Rejeitar</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout
      title={PAGE_TITLES.SUPER_ADMIN_CADASTROS}
      subtitle={<Tag color="blue">Super Admin</Tag>}
    >
      {contextHolder}
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

export default SuperAdminCadastros
