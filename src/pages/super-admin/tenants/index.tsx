import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Input, Space, Table, Tag, Modal, Form, message, Checkbox, Switch } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'
import { SearchOutlined, PlusOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons'

type TenantRow = {
  id: string
  name: string
  email: string | null
  plan_status: string
  is_free: boolean
  trial_ends_at: string | null
  plan_ends_at: string | null
  approved_by_super_admin: boolean
  created_at: string
}

const planStatusLabels: Record<string, { label: string; color: string }> = {
  TRIAL: { label: 'Trial', color: 'blue' },
  ACTIVE: { label: 'Ativo', color: 'green' },
  SUSPENDED: { label: 'Suspenso', color: 'red' },
  CANCELLED: { label: 'Cancelado', color: 'default' },
}

function SuperAdminTenants() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin
  const [search, setSearch] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

  const { data: rawData, isLoading: loading, mutate } = useCachedFetch<TenantRow[]>(
    isSA ? '/api/super-admin/tenants' : null
  )
  const data = Array.isArray(rawData) ? rawData : []

  const handleCreateTenant = async (values: { tenantName: string; email: string; name?: string; isFree?: boolean }) => {
    setCreateLoading(true)
    try {
      const res = await fetch('/api/super-admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isNewTenant: true,
          tenantName: values.tenantName.trim(),
          email: values.email.trim().toLowerCase(),
          name: values.name?.trim() || undefined,
          isFree: values.isFree ?? false,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = json?.error || 'Erro ao criar'
        if (process.env.NODE_ENV === 'development' && json?.detail) {
          console.error('create-admin detail:', json.detail)
        }
        throw new Error(msg)
      }
      messageApi.success(json.message || 'Tenant e admin criados.')
      setCreateModalOpen(false)
      form.resetFields()
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao criar tenant')
    } finally {
      setCreateLoading(false)
    }
  }

  const handlePatchTenant = async (tenantId: string, plan_status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED') => {
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      messageApi.success(plan_status === 'ACTIVE' ? 'Tenant ativado' : plan_status === 'SUSPENDED' ? 'Tenant desativado' : 'Tenant excluído')
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro')
    }
  }

  const handleToggleFree = async (record: TenantRow, checked: boolean) => {
    try {
      const res = await fetch(`/api/super-admin/tenants/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_free: checked }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      messageApi.success(checked ? 'Tenant e usuários marcados como Free' : 'Acesso gratuito removido do tenant e usuários')
      mutate()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Erro ao alterar acesso gratuito')
    }
  }

  const filtered = data.filter(
    (t) =>
      !search ||
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      (t.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const columns: ColumnsType<TenantRow> = [
    {
      title: 'Tenant',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (_: string, record) => (
        <Button
          type="link"
          style={{ padding: 0, textAlign: 'left', maxWidth: 340 }}
          onClick={() => router.push(`/super-admin/tenants/${record.id}`)}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              maxWidth: '100%',
            }}
          >
            <span
              style={{
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {record.name || '—'}
            </span>
            {record.email && (
              <span
                style={{
                  fontSize: 12,
                  opacity: 0.8,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {record.email}
              </span>
            )}
          </div>
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'plan_status',
      key: 'plan_status',
      render: (status: string) => {
        const cfg = planStatusLabels[status] || { label: status, color: 'default' }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Ativo',
      key: 'active_toggle',
      width: 90,
      render: (_, record) => {
        const isActive = record.plan_status === 'ACTIVE' || record.plan_status === 'TRIAL'
        return (
          <Switch
            size="small"
            checked={isActive}
            onChange={(checked) =>
              handlePatchTenant(record.id, checked ? 'ACTIVE' : 'SUSPENDED')
            }
          />
        )
      },
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
    {
      title: 'Free',
      key: 'is_free',
      width: 80,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.is_free ?? false}
          onChange={(checked) => handleToggleFree(record, checked)}
        />
      ),
    },
    {
      title: 'Aprovado',
      dataIndex: 'approved_by_super_admin',
      key: 'approved',
      render: (v: boolean) => (v ? <Tag color="green">Sim</Tag> : <Tag color="orange">Pendente</Tag>),
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space wrap>
          <Button type="link" size="small" onClick={() => router.push(`/super-admin/tenants/${record.id}`)}>
            Ver
          </Button>
        </Space>
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
      title={PAGE_TITLES.SUPER_ADMIN_TENANTS}
      subtitle={<Tag color="blue">Super Admin</Tag>}
    >
      {contextHolder}
      <div className="pc-card--table" style={{ marginBottom: 16 }}>
        <div className="filter-bar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Input.Search
            placeholder="Buscar por nome ou email"
            allowClear
            onSearch={setSearch}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            Criar tenant
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
        title="Criar tenant e admin"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); form.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateTenant}
        >
          <Form.Item
            name="tenantName"
            label="Nome da tenant"
            rules={[{ required: true, message: 'Obrigatório' }]}
          >
            <Input placeholder="Nome da empresa" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email do admin"
            rules={[{ required: true, message: 'Obrigatório' }, { type: 'email', message: 'Email inválido' }]}
          >
            <Input placeholder="admin@empresa.com" />
          </Form.Item>
          <Form.Item name="name" label="Nome do admin">
            <Input placeholder="Nome do administrador" />
          </Form.Item>
          <Form.Item name="isFree" valuePropName="checked" initialValue={false}>
            <Checkbox>Acesso gratuito (Free)</Checkbox>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={createLoading}>
                Criar
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

export default SuperAdminTenants
