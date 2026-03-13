import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Card, Drawer, Form, Input, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'
import { KeyOutlined, UserAddOutlined } from '@ant-design/icons'

type UserRow = {
  id: string
  email: string
  name: string | null
  role: string
  is_active: boolean
  is_super_admin: boolean
}

type TenantDetail = {
  id: string
  name: string
  email: string | null
  plan_status: string
  is_free: boolean
  trial_ends_at: string | null
  plan_ends_at: string | null
  approved_by_super_admin: boolean
}

function SuperAdminTenantDetailPage() {
  const router = useRouter()
  const { id } = router.query as { id: string }
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sendingPassword, setSendingPassword] = useState<string | null>(null)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

  const { data: tenantsList } = useCachedFetch<TenantDetail[]>(
    isSA ? '/api/super-admin/tenants' : null
  )
  const { data: usersList, isLoading: usersLoading, mutate: mutateUsers } = useCachedFetch<UserRow[]>(
    isSA && id ? `/api/super-admin/tenants/${id}/users` : null
  )

  const tenant = Array.isArray(tenantsList) ? tenantsList.find((x) => x.id === id) : null
  const users = Array.isArray(usersList) ? usersList : []
  const loading = !tenantsList && !tenant

  const handleSendTempPassword = async (userId: string) => {
    setSendingPassword(userId)
    try {
      const res = await fetch('/api/super-admin/send-temp-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')
      messageApi.success(
        data.tempPassword
          ? `Senha temporária: ${data.tempPassword} — envie ao usuário por canal seguro.`
          : 'Senha enviada.'
      )
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao enviar senha')
    } finally {
      setSendingPassword(null)
    }
  }

  const handleCreateAdmin = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      const res = await fetch('/api/super-admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          name: values.name,
          tenantId: id,
          isNewTenant: false,
          isFree: tenant?.is_free ?? false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')
      messageApi.success(
        data.tempPassword
          ? `Admin criado. Senha temporária: ${data.tempPassword} — envie ao usuário.`
          : 'Admin criado.'
      )
      form.resetFields()
      setDrawerOpen(false)
      mutateUsers()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao criar admin')
    }
  }

  const userColumns: ColumnsType<UserRow> = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Nome', dataIndex: 'name', key: 'name', render: (v) => v || '—' },
    {
      title: 'Papel',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, record: UserRow) => (
        <Space>
          <Tag>{role}</Tag>
          {record.is_super_admin ? <Tag color="blue">Super Admin</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Ações',
      key: 'actions',
      render: (_, record) => (
        <Button
          size="small"
          icon={<KeyOutlined />}
          loading={sendingPassword === record.id}
          onClick={() => handleSendTempPassword(record.id)}
        >
          Senha temp.
        </Button>
      ),
    },
  ]

  if (currentUser && !isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }
  if (!isSA) return null

  if (loading || !tenant) {
    return (
      <Layout title={PAGE_TITLES.SUPER_ADMIN_TENANTS}>
        <p>{loading ? 'Carregando...' : 'Tenant não encontrada.'}</p>
      </Layout>
    )
  }

  return (
    <Layout
      title={tenant.name}
      subtitle={
        <Space>
          <Tag color="blue">Super Admin</Tag>
          {tenant.email}
        </Space>
      }
    >
      {contextHolder}
      <Card title="Dados da tenant" className="pc-card" style={{ marginBottom: 16 }}>
        <p><strong>Status:</strong> {tenant.plan_status}</p>
        <p><strong>Free:</strong> {tenant.is_free ? <Tag color="green">Sim</Tag> : <Tag color="default">Não</Tag>}</p>
        <p><strong>Trial até:</strong> {tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString('pt-BR') : '—'}</p>
        <p><strong>Plano até:</strong> {tenant.plan_ends_at ? new Date(tenant.plan_ends_at).toLocaleDateString('pt-BR') : '—'}</p>
        <p><strong>Aprovado:</strong> {tenant.approved_by_super_admin ? 'Sim' : 'Não'}</p>
      </Card>

      <Card
        title="Usuários"
        extra={
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setDrawerOpen(true)}>
            Criar admin
          </Button>
        }
        className="pc-card"
      >
        <Table columns={userColumns} dataSource={users} rowKey="id" loading={usersLoading && users.length === 0} pagination={false} />
      </Card>

      <Drawer
        title="Criar admin na tenant"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={400}
        footer={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancelar</Button>
            <Button type="primary" onClick={handleCreateAdmin}>Criar</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="email" label="Email" rules={[{ required: true }, { type: 'email' }]}>
            <Input placeholder="admin@empresa.com" />
          </Form.Item>
          <Form.Item name="name" label="Nome">
            <Input placeholder="Nome do admin" />
          </Form.Item>
        </Form>
      </Drawer>
    </Layout>
  )
}

export default SuperAdminTenantDetailPage
