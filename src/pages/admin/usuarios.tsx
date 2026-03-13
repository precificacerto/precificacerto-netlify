import React, { useEffect, useState, useCallback } from 'react'
import { Button, Space, Table, Input, Drawer, message, Switch, Spin, Tag, Radio } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { useAuth } from '@/hooks/use-auth.hook'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import { MODULES, type ModuleKey } from '@/hooks/use-permissions.hook'
import { SettingOutlined, UserAddOutlined } from '@ant-design/icons'

const MODULE_LABELS: Record<string, string> = {
  home: 'Home',
  customers: 'Clientes',
  items: 'Itens',
  products: 'Produtos',
  budgets: 'Orçamentos',
  sales: 'Vendas',
  stock: 'Estoque',
  cashier: 'Caixa',
  cash_flow: 'Fluxo de Caixa',
  employees: 'Funcionários',
  reports: 'Relatórios',
  agenda: 'Agenda',
  services: 'Serviços',
  connectivity: 'Conectividade',
}

const GRANTABLE_MODULES = (Object.values(MODULES) as string[]).filter(m => m !== MODULES.USERS_MANAGEMENT)

type UserRow = {
  id: string
  email: string
  name?: string
  role: string
  is_active: boolean
  is_super_admin: boolean
  is_tenant_owner?: boolean
}

type PermissionRow = {
  module: string
  label: string
  can_view: boolean
  can_edit: boolean
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  user: 'Usuário',
  super_admin: 'Super Admin',
}

function Users() {
  const [data, setData] = useState<UserRow[]>([])
  const [filteredData, setFilteredData] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [permsDrawerOpen, setPermsDrawerOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [permsLoading, setPermsLoading] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)
  const [togglingActive, setTogglingActive] = useState<string | null>(null)
  const { currentUser } = useAuth()
  const [messageApi, contextHolder] = message.useMessage()
  const router = useRouter()

  const isTenantAdmin = currentUser && !currentUser.is_super_admin && (currentUser.role ?? '').toLowerCase() === 'admin'

  useEffect(() => {
    if (currentUser && !isTenantAdmin) {
      router.replace(ROUTES.DASHBOARD)
      return
    }
    if (isTenantAdmin) fetchUsers()
  }, [currentUser, isTenantAdmin, router])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error('Erro ao carregar usuários')
      const users = await res.json()
      const rows: UserRow[] = (users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role || 'user',
        is_active: u.is_active ?? true,
        is_super_admin: u.is_super_admin ?? false,
        is_tenant_owner: u.is_tenant_owner ?? false,
      }))
      setData(rows)
      setFilteredData(rows)
    } catch (err: any) {
      messageApi.error(err.message || 'Erro ao buscar usuários')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    if (!data.length) return
    setFilteredData(data)
  }, [data])

  const handleSearch = (value: string) => {
    if (!value.trim()) {
      setFilteredData(data)
      return
    }
    const s = value.toLowerCase()
    setFilteredData(data.filter(u => (u.email || '').toLowerCase().includes(s) || (u.name || '').toLowerCase().includes(s)))
  }

  const handleAddUser = () => {
    router.push(ROUTES.EMPLOYEES)
  }

  const handleToggleActive = async (record: UserRow) => {
    if (record.is_super_admin) return
    setTogglingActive(record.id)
    try {
      const res = await fetch(`/api/admin/users/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !record.is_active }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao atualizar')
      }
      setData(prev => prev.map(u => u.id === record.id ? { ...u, is_active: !u.is_active } : u))
      setFilteredData(prev => prev.map(u => u.id === record.id ? { ...u, is_active: !u.is_active } : u))
      messageApi.success(record.is_active ? 'Usuário desativado.' : 'Usuário ativado.')
    } catch (err: any) {
      messageApi.error(err.message || 'Erro ao atualizar')
    } finally {
      setTogglingActive(null)
    }
  }

  const openPermsDrawer = async (record: UserRow) => {
    setSelectedUser(record)
    setPermissions(GRANTABLE_MODULES.map(m => ({ module: m, label: MODULE_LABELS[m] || m, can_view: false, can_edit: false })))
    setPermsDrawerOpen(true)
    setPermsLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${record.id}/permissions`)
      if (!res.ok) throw new Error('Erro ao carregar permissões')
      const list = await res.json()
      const permsMap: Record<string, { can_view: boolean; can_edit: boolean }> = {}
      ;(list || []).forEach((p: any) => { permsMap[p.module] = { can_view: p.can_view ?? false, can_edit: p.can_edit ?? false } })
      setPermissions(GRANTABLE_MODULES.map(m => ({
        module: m,
        label: MODULE_LABELS[m] || m,
        can_view: permsMap[m]?.can_view ?? false,
        can_edit: permsMap[m]?.can_edit ?? false,
      })))
    } catch (err: any) {
      messageApi.error(err.message || 'Erro ao carregar permissões')
    } finally {
      setPermsLoading(false)
    }
  }

  type PermLevel = 'none' | 'view' | 'edit'
  const permLevel = (r: PermissionRow): PermLevel => {
    if (!r.can_view) return 'none'
    return r.can_edit ? 'edit' : 'view'
  }
  const setPermLevel = (module: string, level: PermLevel) => {
    setPermissions(prev => prev.map(p =>
      p.module === module
        ? { ...p, can_view: level !== 'none', can_edit: level === 'edit' }
        : p
    ))
  }

  const handleSavePermissions = async () => {
    if (!selectedUser) return
    setSavingPerms(true)
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: permissions.map(p => ({ module: p.module, can_view: p.can_view, can_edit: p.can_edit })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao salvar')
      }
      messageApi.success('Permissões salvas.')
      setPermsDrawerOpen(false)
      setSelectedUser(null)
    } catch (err: any) {
      messageApi.error(err.message || 'Erro ao salvar permissões')
    } finally {
      setSavingPerms(false)
    }
  }

  const columns: ColumnsType<UserRow> = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a, b) => collator.compare(a.email, b.email),
      defaultSortOrder: 'ascend',
      render: (email, r) => (
        <span style={{ fontWeight: 500 }}>
          {email}
          {r.name && <div style={{ fontSize: 12, color: '#94a3b8' }}>{r.name}</div>}
        </span>
      ),
    },
    {
      title: 'Papel',
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (role: string) => roleLabels[(role || '').toLowerCase()] || role,
    },
    {
      title: 'Ativo',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      align: 'center',
      render: (isActive: boolean, record) => (
        record.is_super_admin
          ? <Tag color="blue">Super Admin</Tag>
          : record.is_tenant_owner
            ? <Tag>Dono</Tag>
            : (
              <Switch
                checked={isActive}
                loading={togglingActive === record.id}
                onChange={() => handleToggleActive(record)}
                size="small"
              />
            )
      ),
    },
    {
      title: 'Super Admin',
      dataIndex: 'is_super_admin',
      key: 'is_super_admin',
      width: 100,
      align: 'center',
      render: (v: boolean) => (v ? <Tag color="purple">Sim</Tag> : '—'),
    },
    {
      title: 'Ações',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space>
          {!record.is_super_admin && (
            <>
              <Button type="link" size="small" icon={<SettingOutlined />} onClick={() => openPermsDrawer(record)}>
                Permissões
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (!currentUser) return null
  if (!isTenantAdmin) return <Layout title={PAGE_TITLES.USERS}><div style={{ padding: 40, textAlign: 'center' }}>Redirecionando...</div></Layout>

  return (
    <Layout title={PAGE_TITLES.USERS}>
      {contextHolder}
      <p style={{ color: '#94a3b8', maxWidth: 640, marginTop: 8 }}>
        Você está em uma tela administrativa. Gerencie usuários vinculados ao seu tenant: ative/desative, edite permissões ou exclua. Para adicionar usuários, use a aba Funcionários em Cadastros.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 24, marginBottom: 16 }}>
        <Button type="primary" icon={<UserAddOutlined />} onClick={handleAddUser}>
          Adicionar usuário
        </Button>
        <Input.Search
          placeholder="Buscar usuário pelo email ou nome"
          onSearch={handleSearch}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ maxWidth: 320 }}
          allowClear
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          pagination={{ pageSize: 10, showTotal: (t) => `${t} usuário(s)` }}
        />
      )}

      <Drawer
        title={`Permissões: ${selectedUser?.email ?? ''}`}
        width={480}
        open={permsDrawerOpen}
        onClose={() => { setPermsDrawerOpen(false); setSelectedUser(null); setPermsLoading(false) }}
        extra={
          <Space>
            <Button onClick={() => setPermsDrawerOpen(false)}>Cancelar</Button>
            <Button type="primary" onClick={handleSavePermissions} loading={savingPerms} disabled={permsLoading}>Salvar</Button>
          </Space>
        }
      >
        {permsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <Spin tip="Carregando permissões..." />
          </div>
        ) : (
        <Table
          dataSource={permissions}
          rowKey="module"
          pagination={false}
          size="small"
          columns={[
            { title: 'Módulo', dataIndex: 'label', key: 'label', width: 180 },
            {
              title: 'Permissão',
              key: 'permission',
              render: (_, r) => (
                <Radio.Group
                  size="small"
                  value={permLevel(r)}
                  onChange={(e) => setPermLevel(r.module, e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="none">Não ver</Radio.Button>
                  <Radio.Button value="view">Visualizar</Radio.Button>
                  <Radio.Button value="edit">Editar</Radio.Button>
                </Radio.Group>
              ),
            },
          ]}
        />
        )}
      </Drawer>
    </Layout>
  )
}

export default Users
