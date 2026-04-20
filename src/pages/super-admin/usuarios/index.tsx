import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Input, Table, Tag, Modal, Form, Select, Space, message, Switch, Checkbox } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'
import { SearchOutlined, PlusOutlined, CheckCircleOutlined, StopOutlined, MailOutlined } from '@ant-design/icons'

type TenantOption = { id: string; name: string }

type UserRow = {
  id: string
  email: string
  name: string | null
  phone?: string | null
  role: string
  is_active: boolean
  is_super_admin: boolean
  is_free: boolean
  tenant_id: string
  tenants?: { id: string; name: string; phone?: string | null; is_free?: boolean } | null
}

function SuperAdminUsuarios() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin
  const [search, setSearch] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()
  const [inviteLoading, setInviteLoading] = useState<string | null>(null)

  const { data: rawData, isLoading: loading, mutate } = useCachedFetch<UserRow[]>(
    isSA ? '/api/super-admin/users' : null
  )
  const data = Array.isArray(rawData) ? rawData : []

  const { data: rawTenants } = useCachedFetch<TenantOption[]>(
    isSA ? '/api/super-admin/tenants' : null
  )
  const tenants = Array.isArray(rawTenants) ? rawTenants.filter((t) => t.id && t.name) : []

  const handleCreateUser = async (values: { tenantId: string; email: string; name?: string; isFree?: boolean }) => {
    setCreateLoading(true)
    try {
      const res = await fetch('/api/super-admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: values.tenantId,
          email: values.email.trim().toLowerCase(),
          name: values.name?.trim() || undefined,
          isFree: values.isFree ?? false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao criar')
      messageApi.success(json.message || 'Convite enviado. O admin receberá um email do Supabase para definir a senha.')
      setCreateModalOpen(false)
      form.resetFields()
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao criar usuário')
    } finally {
      setCreateLoading(false)
    }
  }

  const handlePatchUser = async (userId: string, is_active: boolean) => {
    try {
      const res = await fetch(`/api/super-admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      messageApi.success(is_active ? 'Usuário ativado' : 'Usuário desativado')
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro')
    }
  }

  const handleSendInvite = async (record: UserRow) => {
    setInviteLoading(record.id)
    try {
      const res = await fetch('/api/super-admin/send-invite-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: record.id,
          email: record.email,
          name: record.name,
          tenantName: record.tenants?.name,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao enviar convite')

      if (json.action_link) {
        Modal.info({
          title: 'Link de redefinição de senha',
          width: 'min(600px, calc(100vw - 32px))',
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>{json.message}</p>
              <Input.TextArea
                value={json.action_link}
                readOnly
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
              <p style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
                Clique no campo acima para selecionar e copiar o link.
              </p>
            </div>
          ),
          okText: 'Fechar',
        })
      } else {
        messageApi.success(json.message || 'Link de redefinição de senha enviado por email.')
      }
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao enviar convite')
    } finally {
      setInviteLoading(null)
    }
  }

  const handleToggleFree = async (record: UserRow, checked: boolean) => {
    try {
      const res = await fetch(`/api/super-admin/users/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_free: checked }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      messageApi.success(checked ? 'Acesso gratuito ativado' : 'Acesso gratuito desativado')
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao alterar acesso gratuito')
    }
  }

  const filtered = data.filter(
    (u) =>
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.tenants?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const columns: ColumnsType<UserRow> = [
    { title: 'Email', dataIndex: 'email', key: 'email', sorter: (a, b) => a.email.localeCompare(b.email) },
    { title: 'Nome', dataIndex: 'name', key: 'name', render: (v) => v || '—' },
    {
      title: 'Telefone',
      key: 'phone',
      render: (_, record) => record.tenants?.phone || record.phone || '—',
    },
    {
      title: 'Tenant',
      key: 'tenant',
      render: (_, record) => record.tenants?.name ?? record.tenant_id ?? '—',
    },
    {
      title: 'Papel',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, record) => (
        <>
          <Tag>{role}</Tag>
          {record.is_super_admin ? <Tag color="blue">Super Admin</Tag> : null}
        </>
      ),
    },
    {
      title: 'Ativo',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (_: boolean, record) =>
        record.is_super_admin ? (
          <span style={{ color: '#999' }}>—</span>
        ) : (
          <Switch
            size="small"
            checked={record.is_active}
            onChange={(checked) => handlePatchUser(record.id, checked)}
          />
        ),
    },
    {
      title: 'Free',
      key: 'is_free',
      width: 80,
      render: (_, record) =>
        record.is_super_admin ? (
          <span style={{ color: '#999' }}>—</span>
        ) : (
          <Switch
            size="small"
            checked={record.is_free ?? false}
            onChange={(checked) => handleToggleFree(record, checked)}
          />
        ),
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        record.is_super_admin ? (
          <span style={{ color: '#999' }}>—</span>
        ) : (
          <Space wrap>
            <Button
              type="link"
              size="small"
              icon={<MailOutlined />}
              loading={inviteLoading === record.id}
              onClick={() => handleSendInvite(record)}
            >
              Convidar
            </Button>
          </Space>
        )
      ),
    },
  ]

  if (currentUser && !isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }
  if (!isSA) return null

  return (
    <Layout
      title={PAGE_TITLES.SUPER_ADMIN_USERS}
      subtitle={<Tag color="blue">Super Admin</Tag>}
    >
      {contextHolder}
      <div className="pc-card--table" style={{ marginBottom: 16 }}>
        <div className="filter-bar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Input.Search
            placeholder="Buscar por email, nome ou tenant"
            allowClear
            onSearch={setSearch}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            Criar usuário (admin na tenant)
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading && data.length === 0}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </div>

      <Modal
        title="Criar usuário e convidar como admin"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); form.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateUser}
        >
          <Form.Item
            name="tenantId"
            label="Tenant"
            rules={[{ required: true, message: 'Selecione a tenant' }]}
          >
            <Select
              placeholder="Selecione a tenant"
              showSearch
              optionFilterProp="label"
              options={tenants.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, message: 'Obrigatório' }, { type: 'email', message: 'Email inválido' }]}
          >
            <Input placeholder="usuario@empresa.com" />
          </Form.Item>
          <Form.Item name="name" label="Nome">
            <Input placeholder="Nome do usuário" />
          </Form.Item>
          <Form.Item name="isFree" valuePropName="checked" initialValue={false}>
            <Checkbox>Acesso gratuito (Free)</Checkbox>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={createLoading}>
                Criar e convidar
              </Button>
              <Button onClick={() => { setCreateModalOpen(false); form.resetFields() }}>
                Cancelar
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}

export default SuperAdminUsuarios
