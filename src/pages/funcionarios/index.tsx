import React, { useState, useMemo } from 'react'
import { Button, Drawer, Form, Input, Select, Space, Table, Tag, message, Popconfirm, InputNumber, Tooltip, Radio, Checkbox, Divider, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import type { Employee, EmployeeRole, EmployeeStatus } from '@/supabase/types'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useEmployees, useItems } from '@/hooks/use-data.hooks'
import { PERMISSIONS } from '@/shared/enums/permissions'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
    TeamOutlined,
    LockOutlined,
    UserAddOutlined,
    DollarOutlined,
    ClockCircleOutlined,
    SearchOutlined,
    PlusOutlined,
    MailOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CrownOutlined,
} from '@ant-design/icons'

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const roleLabels: Record<EmployeeRole, { label: string; color: string }> = {
    PRODUCTIVE: { label: 'Produtivo', color: 'green' },
    COMMERCIAL: { label: 'Comercial', color: 'blue' },
    ADMINISTRATIVE: { label: 'Administrativo', color: 'purple' },
}

const statusLabels: Record<EmployeeStatus, { label: string; color: string }> = {
    ACTIVE: { label: 'Ativo', color: 'success' },
    INACTIVE: { label: 'Inativo', color: 'default' },
    ON_LEAVE: { label: 'Afastado', color: 'warning' },
}

const capitalizeFirst = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1)

const PERMISSION_SECTIONS: { title: string; modules: { key: string; label: string }[] }[] = [
    {
        title: 'Geral',
        modules: [
            { key: 'home', label: 'Home' },
            { key: 'cashier', label: 'Caixa' },
        ],
    },
    {
        title: 'Cadastros',
        modules: [
            { key: 'items', label: 'Itens' },
            { key: 'products', label: 'Produtos' },
            { key: 'services', label: 'Serviços' },
            { key: 'stock', label: 'Estoque' },
            { key: 'customers', label: 'Clientes' },
            { key: 'employees', label: 'Funcionários' },
        ],
    },
    {
        title: 'Comercial',
        modules: [
            { key: 'budgets', label: 'Orçamentos' },
            { key: 'sales', label: 'Vendas' },
        ],
    },
    {
        title: 'Financeiro',
        modules: [
            { key: 'cash_flow', label: 'Fluxo de Caixa' },
            { key: 'dfc', label: 'DFC' },
        ],
    },
    {
        title: 'Operacional',
        modules: [
            { key: 'agenda', label: 'Agenda' },
            { key: 'reports', label: 'Relatórios' },
            { key: 'connectivity', label: 'Conectividade' },
        ],
    },
]

const ALL_PERM_KEYS = PERMISSION_SECTIONS.flatMap(s => s.modules.map(m => m.key))

function buildEmptyPerms(): Record<string, { can_view: boolean; can_edit: boolean }> {
    const perms: Record<string, { can_view: boolean; can_edit: boolean }> = {}
    ALL_PERM_KEYS.forEach(m => { perms[m] = { can_view: false, can_edit: false } })
    return perms
}

function Employees() {
    const { data: employees = [], isLoading, mutate: reloadEmployees } = useEmployees()
    const [saving, setSaving] = useState(false)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [userType, setUserType] = useState<'user' | 'admin'>('user')
    const [searchText, setSearchText] = useState('')
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
    const [upgradeInfo, setUpgradeInfo] = useState<{ currentUsers: number; maxUsers: number } | null>(null)
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()
    const { currentUser, tenantId } = useAuth()
    const { canEdit } = usePermissions()
    const router = useRouter()
    const isAdmin = currentUser?.permissions?.find((p) => p === PERMISSIONS.ADMIN)
    const canManagePermissions = currentUser?.is_super_admin === true || !!isAdmin

    const { data: allItems = [] } = useItems()
    const [modulePerms, setModulePerms] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>(buildEmptyPerms)
    const [itemAccessMode, setItemAccessMode] = useState<'all' | 'specific'>('all')
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])

    const filteredData = useMemo(() => {
        if (!searchText) return employees
        return employees.filter(e =>
            e.name.toLowerCase().includes(searchText.toLowerCase()) ||
            (e.position || '').toLowerCase().includes(searchText.toLowerCase()) ||
            (e.email || '').toLowerCase().includes(searchText.toLowerCase())
        )
    }, [employees, searchText])

    const totalEmployees = employees.length
    const activeCount = employees.filter(e => e.status === 'ACTIVE').length
    const totalSalary = employees.filter(e => e.status === 'ACTIVE').reduce((s, e) => s + e.salary, 0)
    const totalMonthlyHours = employees
        .filter(e => e.status === 'ACTIVE')
        .reduce((s, e) => s + (e.work_hours_per_day * e.work_days_per_month), 0)

    async function handleSendInvite(record: Employee) {
        if (!record.email) {
            messageApi.warning('Funcionário não possui email cadastrado.')
            return
        }
        try {
            const res = await fetch('/api/employees/send-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: record.email, name: record.name }),
            })
            const result = await res.json()
            if (!res.ok) {
                if (result.upgradeRequired) {
                    setUpgradeInfo({ currentUsers: result.currentUsers, maxUsers: result.maxUsers })
                    setUpgradeModalOpen(true)
                    return
                }
                throw new Error(result.error)
            }
            messageApi.success(result.message || `Convite enviado para ${record.name}!`)
            reloadEmployees()
        } catch (error: any) {
            messageApi.error('Erro ao enviar convite: ' + (error.message || 'Erro desconhecido'))
        }
    }

    const columns: ColumnsType<Employee> = [
        {
            title: 'Funcionário',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            defaultSortOrder: 'ascend',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{record.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                        {record.position || 'Sem cargo'}
                    </div>
                </div>
            ),
        },
        { title: 'Email', dataIndex: 'email', key: 'email', responsive: ['lg'] as any },
        { title: 'Telefone', dataIndex: 'phone', key: 'phone', responsive: ['md'] as any },
        {
            title: 'Setor',
            dataIndex: 'role',
            key: 'role',
            filters: Object.entries(roleLabels).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value, record) => record.role === value,
            render: (role: EmployeeRole) => {
                const cfg = roleLabels[role]
                return <Tag color={cfg.color}>{cfg.label}</Tag>
            },
        },
        {
            title: 'Salário',
            dataIndex: 'salary',
            key: 'salary',
            sorter: (a, b) => a.salary - b.salary,
            render: (v) => <span style={{ fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
        {
            title: 'Carga Horária',
            key: 'hours',
            render: (_, record) => (
                <span style={{ fontSize: 13 }}>
                    {record.work_hours_per_day}h/dia • {record.work_days_per_month}d/mês
                </span>
            ),
        },
        {
            title: 'Acesso',
            key: 'access',
            width: 80,
            align: 'center' as const,
            render: (_, record) => (
                record.user_id
                    ? <Tooltip title="Vinculado à plataforma"><CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} /></Tooltip>
                    : <Tooltip title="Sem acesso à plataforma"><CloseCircleOutlined style={{ color: '#d9d9d9', fontSize: 16 }} /></Tooltip>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            filters: Object.entries(statusLabels).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value, record) => record.status === value,
            render: (status: EmployeeStatus) => {
                const cfg = statusLabels[status]
                return <Tag color={cfg.color}>{cfg.label}</Tag>
            },
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 220,
            render: (_, record) => (
                <Space>
                    <Button type="link" size="small" onClick={() => handleEdit(record)}>Editar</Button>
                    {canManagePermissions && record.user_id && (
                        <Link href={`/funcionarios/${record.id}/permissoes`}>
                            <Button type="link" size="small" icon={<LockOutlined />}>Permissões</Button>
                        </Link>
                    )}
                    {record.email && (
                        <Tooltip title="Enviar convite de acesso à plataforma">
                            <Button
                                type="link"
                                size="small"
                                icon={<MailOutlined />}
                                onClick={() => handleSendInvite(record)}
                            >
                                Convidar
                            </Button>
                        </Tooltip>
                    )}
                    <Popconfirm title="Desativar funcionário?" onConfirm={() => handleDelete(record.id)}>
                        <Button type="link" size="small" danger>Desativar</Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    function handleSearch(value: string) {
        setSearchText(value)
    }

    async function handleEdit(record: Employee) {
        setEditingId(record.id)
        form.setFieldsValue({
            ...record,
            hire_date: undefined,
            birth_date: undefined,
        })

        const perms = buildEmptyPerms()
        let accessMode: 'all' | 'specific' = 'all'
        let itemIds: string[] = []

        if (record.user_id && tenantId) {
            const { data: userRow } = await supabase
                .from('users')
                .select('role')
                .eq('id', record.user_id)
                .single()
            const role = (userRow?.role ?? 'user') as string
            setUserType(role === 'admin' ? 'admin' : 'user')

            const { data: modPerms } = await supabase
                .from('user_module_permissions')
                .select('module, can_view, can_edit')
                .eq('user_id', record.user_id)
                .eq('tenant_id', tenantId)
            if (modPerms) {
                modPerms.forEach(p => {
                    perms[p.module] = { can_view: p.can_view ?? false, can_edit: p.can_edit ?? false }
                })
            }
            const { data: itemAccess } = await supabase
                .from('user_item_access')
                .select('item_id, access_all_items')
                .eq('user_id', record.user_id)
                .eq('tenant_id', tenantId)
            if (itemAccess && itemAccess.length > 0) {
                if (itemAccess.some(a => a.access_all_items)) {
                    accessMode = 'all'
                } else {
                    accessMode = 'specific'
                    itemIds = itemAccess.filter(a => a.item_id).map(a => a.item_id!)
                }
            }
        } else if (record.pending_permissions) {
            const pending = record.pending_permissions
            if (pending.modules) {
                Object.entries(pending.modules).forEach(([mod, p]: [string, any]) => {
                    perms[mod] = { can_view: p.can_view ?? false, can_edit: p.can_edit ?? false }
                })
            }
            accessMode = pending.item_access_mode || 'all'
            itemIds = pending.item_ids || []
            if (pending.user_role === 'admin') {
                setUserType('admin')
            } else {
                setUserType('user')
            }
        } else {
            setUserType('user')
        }

        setModulePerms(perms)
        setItemAccessMode(accessMode)
        setSelectedItemIds(itemIds)
        setDrawerOpen(true)
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch('/api/employees/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ employee_id: id }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Falha ao desativar')
            await reloadEmployees()
            messageApi.success('Funcionário desativado com sucesso!')
        } catch (error: any) {
            console.error('Erro ao desativar:', error)
            messageApi.error('Erro ao desativar: ' + (error.message || 'Erro desconhecido'))
        }
    }

    function handleAdd() {
        setEditingId(null)
        form.resetFields()
        setModulePerms(buildEmptyPerms())
        setItemAccessMode('all')
        setSelectedItemIds([])
        setUserType('user')
        setDrawerOpen(true)
    }

    async function handleSave() {
        try {
            const values = await form.validateFields()
            setSaving(true)

            const tenant_id = tenantId ?? currentUser?.tenant_id

            if (!tenant_id) {
                messageApi.error('Sessão expirada. Faça logout e login novamente para sincronizar.')
                return
            }

            const bodyPayload: Record<string, unknown> = {
                employee: values,
                tenant_id,
                editing_id: editingId,
            }

            if (canManagePermissions) {
                bodyPayload.modulePermissions = modulePerms
                bodyPayload.itemAccessMode = itemAccessMode
                bodyPayload.selectedItemIds = selectedItemIds
                ;(bodyPayload.employee as any).user_role = userType
            }

            const res = await fetch('/api/employees/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
            })

            const result = await res.json()

            if (!res.ok) {
                throw new Error(result.error || 'Erro ao salvar funcionário')
            }

            messageApi.success(editingId ? 'Funcionário atualizado!' : 'Funcionário adicionado!')
            await reloadEmployees()
            setDrawerOpen(false)
            form.resetFields()
            setModulePerms(buildEmptyPerms())
            setItemAccessMode('all')
            setSelectedItemIds([])
        } catch (error: any) {
            console.error('Erro ao salvar:', error)
            messageApi.error('Erro ao salvar: ' + (error.message || 'Preencha todos os campos obrigatórios.'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Layout title="Funcionários" subtitle="Gestão de equipe e carga horária">
            {contextHolder}

            <div className="kpi-grid">
                <CardKPI title="Total Funcionários" value={totalEmployees} icon={<TeamOutlined />} variant="blue" />
                <CardKPI title="Ativos" value={activeCount} icon={<UserAddOutlined />} variant="green" />
                <CardKPI title="Folha Mensal" value={formatCurrency(totalSalary)} icon={<DollarOutlined />} variant="orange" />
                <CardKPI title="Horas/Mês (equipe)" value={`${totalMonthlyHours}h`} icon={<ClockCircleOutlined />} variant="blue" />
            </div>

            <div className="pc-card--table">
                <div className="filter-bar">
                    <Input
                        placeholder="Buscar por nome, cargo ou email..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{ maxWidth: 400 }}
                        allowClear
                    />
                    <div style={{ flex: 1 }} />
                    {canEdit(MODULES.EMPLOYEES) && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                            Novo Funcionário
                        </Button>
                    )}
                </div>
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    pagination={{ pageSize: 10, showTotal: (t) => `${t} funcionários` }}
                    size="middle"
                    loading={isLoading}
                />
            </div>

            <Modal
                open={upgradeModalOpen}
                onCancel={() => setUpgradeModalOpen(false)}
                footer={[
                    <Button key="cancel" onClick={() => setUpgradeModalOpen(false)}>Cancelar</Button>,
                    <Button key="upgrade" type="primary" icon={<CrownOutlined />} onClick={() => { setUpgradeModalOpen(false); router.push('/planos') }}>
                        Ver planos e fazer upgrade
                    </Button>,
                ]}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CrownOutlined style={{ color: '#f59e0b' }} />
                        <span>Limite de usuários atingido</span>
                    </div>
                }
            >
                <div style={{ padding: '12px 0' }}>
                    <p style={{ fontSize: 14, marginBottom: 16 }}>
                        Seu plano atual permite no máximo <strong>{upgradeInfo?.maxUsers}</strong> usuário(s) e você já possui <strong>{upgradeInfo?.currentUsers}</strong> ativo(s).
                    </p>
                    <p style={{ fontSize: 14, color: 'var(--color-neutral-400)' }}>
                        Para convidar mais funcionários, faça upgrade para um plano com mais usuários.
                    </p>
                </div>
            </Modal>

            <Drawer
            title={editingId ? 'Editar Funcionário' : 'Novo Funcionário'}
                width={480}
                open={drawerOpen}
                onClose={() => {
                    setDrawerOpen(false)
                    form.resetFields()
                    setModulePerms(buildEmptyPerms())
                    setItemAccessMode('all')
                    setSelectedItemIds([])
                    setUserType('user')
                }}
                extra={
                    <Space>
                        <Button onClick={() => setDrawerOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} type="primary" loading={saving}>Salvar</Button>
                    </Space>
                }
                >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ role: 'PRODUCTIVE', work_hours_per_day: 8, work_days_per_month: 22 }}
                >
                    <Form.Item name="name" label="Nome Completo" rules={[{ required: true, message: 'Informe o nome' }]}>
                        <Input placeholder="Nome do funcionário" onChange={(e) => form.setFieldsValue({ name: capitalizeFirst(e.target.value) })} />
                    </Form.Item>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="position" label="Cargo">
                            <Input placeholder="Ex: Cabeleireiro, Atendente..." onChange={(e) => form.setFieldsValue({ position: capitalizeFirst(e.target.value) })} />
                        </Form.Item>
                        <Form.Item name="role" label="Setor" rules={[{ required: true }]}>
                            <Select>
                                <Select.Option value="PRODUCTIVE">Produtivo</Select.Option>
                                <Select.Option value="COMMERCIAL">Comercial</Select.Option>
                                <Select.Option value="ADMINISTRATIVE">Administrativo</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Informe o email' }, { type: 'email', message: 'Email inválido' }]}>
                            <Input placeholder="email@exemplo.com" />
                        </Form.Item>
                        <Form.Item name="phone" label="Telefone">
                            <Input placeholder="(00) 00000-0000" />
                        </Form.Item>
                    </div>

                    <Form.Item name="document" label="CPF">
                        <Input placeholder="000.000.000-00" />
                    </Form.Item>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="salary" label="Salário (R$)">
                            <InputNumber
                                min={0}
                                step={0.01}
                                precision={2}
                                style={{ width: '100%' }}
                                placeholder="0,00"
                                prefix="R$"
                                decimalSeparator=","
                                formatter={(value) => {
                                    if (!value && value !== 0) return ''
                                    const parts = String(value).split('.')
                                    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                                    const decPart = parts[1] !== undefined ? parts[1].padEnd(2, '0').slice(0, 2) : '00'
                                    return `${intPart},${decPart}`
                                }}
                                parser={(value) => {
                                    const clean = value?.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.') || '0'
                                    return Number(clean) as any
                                }}
                            />
                        </Form.Item>
                        <Form.Item name="commission_percent" label="Comissão sobre vendas (%)">
                            <InputNumber min={0} max={100} step={0.5} precision={2} style={{ width: '100%' }} placeholder="0,00" suffix="%" />
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                        <Form.Item name="status" label="Status">
                            <Select>
                                <Select.Option value="ACTIVE">Ativo</Select.Option>
                                <Select.Option value="INACTIVE">Inativo</Select.Option>
                                <Select.Option value="ON_LEAVE">Afastado</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    {canManagePermissions && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tipo de usuário</div>
                            <Radio.Group
                                value={userType}
                                onChange={(e) => setUserType(e.target.value)}
                            >
                                <Radio.Button value="user">Usuário</Radio.Button>
                                <Radio.Button value="admin">Admin</Radio.Button>
                            </Radio.Group>
                            <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 4 }}>
                                Admin convidado tem acesso de administrador, limitado pelas permissões abaixo.
                            </div>
                        </div>
                    )}

                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Carga Horária</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <Form.Item name="work_hours_per_day" label="Horas/Dia" style={{ marginBottom: 0 }}>
                                <InputNumber min={1} max={24} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="work_days_per_month" label="Dias/Mês" style={{ marginBottom: 0 }}>
                                <InputNumber min={1} max={31} style={{ width: '100%' }} />
                            </Form.Item>
                        </div>
                    </div>

                    {canManagePermissions && (
                        <>
                            <Divider orientation="left" style={{ fontSize: 14, fontWeight: 600 }}>
                                Permissões de Acesso
                            </Divider>

                            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                                {PERMISSION_SECTIONS.map((section, sIdx) => {
                                    const permState = (mod: string): 'none' | 'view' | 'edit' => {
                                        const p = modulePerms[mod]
                                        if (p?.can_edit) return 'edit'
                                        if (p?.can_view) return 'view'
                                        return 'none'
                                    }
                                    const setPermState = (mod: string, state: 'none' | 'view' | 'edit') => {
                                        setModulePerms(prev => ({
                                            ...prev,
                                            [mod]: {
                                                can_view: state === 'view' || state === 'edit',
                                                can_edit: state === 'edit',
                                            },
                                        }))
                                    }
                                    return (
                                        <div key={section.title}>
                                            <div style={{
                                                background: 'var(--color-neutral-100, #f3f4f6)',
                                                padding: '8px 12px',
                                                fontWeight: 700,
                                                fontSize: 13,
                                                borderTop: sIdx > 0 ? '1px solid var(--color-neutral-200, #e5e7eb)' : 'none',
                                                color: 'var(--color-neutral-700, #374151)',
                                            }}>
                                                {section.title}
                                            </div>
                                            {section.modules.map(mod => (
                                                <div
                                                    key={mod.key}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '8px 12px 8px 24px',
                                                        borderTop: '1px solid var(--color-neutral-200, #e5e7eb)',
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    <span>{mod.label}</span>
                                                    <Radio.Group
                                                        size="small"
                                                        value={permState(mod.key)}
                                                        onChange={(e) => setPermState(mod.key, e.target.value)}
                                                        optionType="button"
                                                        buttonStyle="solid"
                                                    >
                                                        <Radio.Button value="none" style={{ fontSize: 11, padding: '0 8px' }}>
                                                            Não ver
                                                        </Radio.Button>
                                                        <Radio.Button value="view" style={{ fontSize: 11, padding: '0 8px' }}>
                                                            Visualizar
                                                        </Radio.Button>
                                                        <Radio.Button value="edit" style={{ fontSize: 11, padding: '0 8px' }}>
                                                            Editar
                                                        </Radio.Button>
                                                    </Radio.Group>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                })}
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Itens para Orçamento</div>
                                <Radio.Group
                                    value={itemAccessMode}
                                    onChange={(e) => setItemAccessMode(e.target.value)}
                                    style={{ marginBottom: 12 }}
                                >
                                    <Radio value="all">Todos os itens</Radio>
                                    <Radio value="specific">Itens específicos</Radio>
                                </Radio.Group>

                                {itemAccessMode === 'specific' && (
                                    <div style={{
                                        maxHeight: 200,
                                        overflowY: 'auto',
                                        border: '1px solid var(--color-neutral-200, #e5e7eb)',
                                        borderRadius: 8,
                                        padding: 12,
                                    }}>
                                        <Checkbox.Group
                                            value={selectedItemIds}
                                            onChange={(values) => setSelectedItemIds(values as string[])}
                                            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                                        >
                                            {allItems.map((item: any) => (
                                                <Checkbox key={item.id} value={item.id}>
                                                    {item.name}
                                                </Checkbox>
                                            ))}
                                        </Checkbox.Group>
                                        {allItems.length === 0 && (
                                            <div style={{ color: 'var(--color-neutral-400)', fontSize: 13 }}>
                                                Nenhum item cadastrado.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <Form.Item name="notes" label="Observações">
                        <Input.TextArea rows={3} placeholder="Notas sobre o funcionário..." />
                    </Form.Item>
                </Form>
            </Drawer>
        </Layout>
    )
}

export default Employees
