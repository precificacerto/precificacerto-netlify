import React, { useState, useEffect, useMemo } from 'react'
import { Button, Drawer, Form, Input, Select, Space, Table, Tag, message, Popconfirm, Spin, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import type { Customer, CustomerType, CustomerStatus } from '@/supabase/types'
import { useCustomers } from '@/hooks/use-data.hooks'
import {
    TeamOutlined,
    UserAddOutlined,
    CheckCircleOutlined,
    ShopOutlined,
    SearchOutlined,
    PlusOutlined,
    WhatsAppOutlined,
    HistoryOutlined,
    PaperClipOutlined,
    FileTextOutlined,
    DownloadOutlined,
    ClockCircleOutlined,
    BookOutlined,
} from '@ant-design/icons'
import { cpf, cnpj } from 'cpf-cnpj-validator'
import VMasker from 'vanilla-masker'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useAuth } from '@/hooks/use-auth.hook'

const segments = ['Alimentício', 'Varejo', 'Tecnologia', 'Serviços', 'Indústria', 'Beleza', 'Saúde', 'Outros']

const capitalizeFirst = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1)

const phoneMask = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 2) return `(${digits}`
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

const typeLabels: Record<CustomerType, { label: string; color: string }> = {
    PF: { label: 'Pessoa Física', color: 'green' },
    PJ: { label: 'Pessoa Jurídica', color: 'blue' },
}

const statusLabels: Record<CustomerStatus, { label: string; color: string }> = {
    ACTIVE: { label: 'Ativo', color: 'success' },
    INACTIVE: { label: 'Inativo', color: 'default' },
}

interface TimelineEntry {
    id: string
    date: string
    type: string
    title: string
    description: string
    badgeLabel: string
    badgeColor: string
    downloadUrl?: string
    fileName?: string
    amount?: number
    serviceObservation?: string
    budgetItems?: string
    budgetStatus?: string
    attachmentDescription?: string
    attachmentMimeType?: string
    fileSize?: number
    employeeName?: string
    attachments?: { url: string; name: string; size?: number }[]
}

function Clients() {
    const { data: customers = [], isLoading, mutate: reloadCustomers } = useCustomers()
    const [saving, setSaving] = useState(false)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [searchText, setSearchText] = useState('')
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
    const [timeline, setTimeline] = useState<TimelineEntry[]>([])
    const [timelineLoading, setTimelineLoading] = useState(false)
    const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
    const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null)
    const [historyCustomerName, setHistoryCustomerName] = useState('')
    const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)

    const { canView, canEdit } = usePermissions()
    const { currentUser, tenantId } = useAuth()
    const isSuperAdmin = currentUser?.is_super_admin === true
    const isAdminRole = isSuperAdmin || (currentUser?.role && String(currentUser.role).toLowerCase() === 'admin')

    const canEditCustomer = (record: Customer): boolean => {
        if (isAdminRole) return true
        if (!record.owner_id) return true
        return record.owner_id === currentUser?.employee_id
    }

    if (!canView(MODULES.CUSTOMERS)) {
        return <Layout title={PAGE_TITLES.CLIENTS}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    const fetchEmployees = async () => {
        const { data } = await supabase
            .from('employees')
            .select('id, name, status')
            .eq('status', 'ACTIVE')
            .eq('is_active', true)
            .order('name')
        setEmployees((data || []).map((e: any) => ({ id: e.id, name: e.name })))
    }

    useEffect(() => {
        fetchEmployees()
    }, [])

    const fetchTimeline = async (customerId: string, signal?: { cancelled: boolean }) => {
        setTimelineLoading(true)
        const [histRes, attachRes, budgetRes, salesRes] = await Promise.all([
            supabase
                .from('customer_service_history')
                .select('id, service_observation, created_at, calendar_event_id, history_type, employee_id')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: false }),
            supabase
                .from('customer_attachments')
                .select('id, file_path, file_name, file_size, mime_type, description, created_at, origin_type, origin_id')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: false }),
            supabase
                .from('budgets')
                .select('id, total_value, status, payment_method, paid_date, created_at, budget_items(product_id, quantity, unit_price, products(name), manual_description)')
                .eq('customer_id', customerId)
                .in('status', ['SENT', 'APPROVED', 'PAID'])
                .order('created_at', { ascending: false }),
            (supabase as any)
                .from('sales')
                .select('id, final_value, payment_method, installments, sale_date, created_at, employee_id, description, status, sale_type')
                .eq('customer_id', customerId)
                .eq('is_active', true)
                .order('created_at', { ascending: false }),
        ])
        if (signal?.cancelled) return

        // Fetch cash_entries for BOLETO/CHEQUE budgets and sales to check if all parcelas were paid
        const boletoBudgetIds = (budgetRes.data || [])
            .filter((b: any) => (b as any).payment_method === 'BOLETO' || (b as any).payment_method === 'CHEQUE_PRE_DATADO')
            .map((b: any) => b.id)
        const boletoSaleIds = (salesRes.data || [])
            .filter((s: any) => s.payment_method === 'BOLETO' || s.payment_method === 'CHEQUE_PRE_DATADO')
            .map((s: any) => s.id)
        const allBoletoOriginIds = [...boletoBudgetIds, ...boletoSaleIds]
        const cashEntriesByOrigin: Record<string, { paid_date: string | null }[]> = {}
        if (allBoletoOriginIds.length > 0) {
            const { data: ceData } = await supabase
                .from('cash_entries')
                .select('origin_id, paid_date')
                .in('origin_id', allBoletoOriginIds)
                .eq('is_active', true)
            for (const ce of ceData || []) {
                if (!cashEntriesByOrigin[ce.origin_id]) cashEntriesByOrigin[ce.origin_id] = []
                cashEntriesByOrigin[ce.origin_id].push({ paid_date: ce.paid_date })
            }
        }
        if (signal?.cancelled) return

        // Generate signed URLs and build attachment map grouped by origin
        const attachMap: Record<string, { url: string; name: string; size?: number }[]> = {}
        const orphanAttachments: any[] = []
        for (const aRaw of attachRes.data || []) {
            const a = aRaw as any
            const { data: urlData } = await supabase.storage.from('comprovantes').createSignedUrl(a.file_path, 3600)
            const item = { url: urlData?.signedUrl || '', name: a.file_name, size: a.file_size ?? undefined }
            if (a.origin_type && a.origin_id) {
                const key = `${a.origin_type}:${a.origin_id}`
                if (!attachMap[key]) attachMap[key] = []
                attachMap[key].push(item)
            } else {
                orphanAttachments.push({ ...a, signedUrl: urlData?.signedUrl })
            }
        }

        const entries: TimelineEntry[] = []

        for (const hRaw of histRes.data || []) {
            const h = hRaw as any
            const agendaAtts = h.calendar_event_id ? attachMap[`AGENDA:${h.calendar_event_id}`] : undefined
            entries.push({
                id: `svc-${h.id}`,
                date: h.created_at,
                type: h.history_type === 'BUDGET_SENT' ? 'BUDGET_HIST' : 'SERVICE',
                title: h.history_type === 'BUDGET_SENT' ? 'Orçamento enviado' : 'Observação de serviço',
                description: h.service_observation || '—',
                badgeLabel: h.history_type === 'BUDGET_SENT' ? 'Orçamento' : 'Serviço',
                badgeColor: h.history_type === 'BUDGET_SENT' ? 'blue' : 'green',
                serviceObservation: h.service_observation || undefined,
                employeeName: h.employee_id ? (employeeMap.get(h.employee_id) || undefined) : undefined,
                attachments: agendaAtts,
            })
        }

        // Orphan attachments (no origin_type) as standalone entries
        for (const a of orphanAttachments) {
            entries.push({
                id: `att-${a.id}`,
                date: a.created_at,
                type: 'ATTACHMENT',
                title: a.file_name,
                description: a.description || '',
                badgeLabel: 'Anexo',
                badgeColor: 'purple',
                downloadUrl: a.signedUrl,
                fileName: a.file_name,
                attachmentDescription: a.description || undefined,
                fileSize: a.file_size ?? undefined,
                attachmentMimeType: a.mime_type || undefined,
            })
        }

        for (const b of budgetRes.data || []) {
            const items = (b as any).budget_items || []
            const summary = items.slice(0, 3).map((i: any) => i.products?.name || i.manual_description || 'Item').join(', ')
            const suffix = items.length > 3 ? ` +${items.length - 3}` : ''

            let isPendingPayment = false
            if ((b as any).payment_method === 'BOLETO' || (b as any).payment_method === 'CHEQUE_PRE_DATADO') {
                if (b.status === 'PAID') {
                    isPendingPayment = false
                } else {
                    const ces = cashEntriesByOrigin[(b as any).id] || []
                    isPendingPayment = ces.length === 0 || ces.some(ce => !ce.paid_date)
                }
            }

            const statusLabel = isPendingPayment
                ? 'Pendente'
                : b.status === 'PAID' ? 'Pago' : b.status === 'APPROVED' ? 'Aprovado' : 'Enviado'
            const badgeColor = isPendingPayment ? 'orange' : b.status === 'PAID' ? 'green' : 'blue'

            const budgetAtts = attachMap[`BUDGET:${b.id}`]
            entries.push({
                id: `bgt-${b.id}`,
                date: b.created_at,
                type: 'BUDGET',
                title: `ORC-${b.id.substring(0, 4).toUpperCase()}`,
                description: summary + suffix,
                badgeLabel: statusLabel,
                badgeColor,
                amount: Number(b.total_value || 0),
                budgetItems: summary + suffix,
                budgetStatus: statusLabel,
                attachments: budgetAtts,
            })
        }

        // Sales from Vendas Balcão
        for (const s of salesRes.data || []) {
            const isBoletoOrCheque = s.payment_method === 'BOLETO' || s.payment_method === 'CHEQUE_PRE_DATADO'
            let saleStatus = 'Pago'
            let saleBadgeColor = 'green'
            if (isBoletoOrCheque) {
                const ces = cashEntriesByOrigin[s.id] || []
                const allPaid = ces.length > 0 && ces.every((ce: any) => ce.paid_date)
                if (!allPaid) { saleStatus = 'Pendente'; saleBadgeColor = 'orange' }
            }
            const saleAtts = attachMap[`SALE:${s.id}`]
            const empName = s.employee_id ? (employeeMap.get(s.employee_id) || undefined) : undefined
            const cleanDesc = s.description?.replace(/^Venda balcão:\s*/i, '').replace(/^Venda via orçamento\s*—\s*/i, '').split('—')[0].trim() || 'Venda'
            entries.push({
                id: `sale-${s.id}`,
                date: s.sale_date || s.created_at,
                type: 'SALE',
                title: `Venda — ${cleanDesc}`,
                description: s.description || '',
                badgeLabel: saleStatus,
                badgeColor: saleBadgeColor,
                amount: Number(s.final_value || 0),
                employeeName: empName,
                attachments: saleAtts,
            })
        }

        entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setTimeline(entries)
        setTimelineLoading(false)
    }

    useEffect(() => {
        if (!drawerOpen || !editingId) {
            setTimeline([])
            return
        }
        const signal = { cancelled: false }
        fetchTimeline(editingId, signal)
        return () => { signal.cancelled = true }
    }, [drawerOpen, editingId])

    useEffect(() => {
        if (!historyCustomerId) {
            setTimeline([])
            return
        }
        const signal = { cancelled: false }
        fetchTimeline(historyCustomerId, signal)
        return () => { signal.cancelled = true }
    }, [historyCustomerId])

    const employeeMap = useMemo(() => {
        const map = new Map<string, string>()
        employees.forEach(e => map.set(e.id, e.name))
        return map
    }, [employees])

    const filteredData = useMemo(() => {
        if (!searchText) return customers
        const lower = searchText.toLowerCase()
        return customers.filter(c =>
            c.name.toLowerCase().includes(lower) ||
            (c.document || '').includes(searchText) ||
            (c.email || '').toLowerCase().includes(lower) ||
            (c.phone || '').includes(searchText)
        )
    }, [customers, searchText])

    // ── KPIs ──
    const totalClients = customers.length
    const activeClients = customers.filter(c => c.status === 'ACTIVE').length
    const pjClients = customers.filter(c => c.customer_type === 'PJ').length
    const withWhatsapp = customers.filter(c => c.whatsapp_phone).length

    const columns: ColumnsType<Customer> = [
        {
            title: 'Cliente',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            defaultSortOrder: 'ascend',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{record.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                        {record.city}{record.state_code ? ` - ${record.state_code}` : ''}
                    </div>
                </div>
            ),
        },
        {
            title: 'Documento',
            key: 'document',
            render: (_, record) => (
                <span>
                    <Tag color={typeLabels[record.customer_type]?.color || 'default'} style={{ marginRight: 6 }}>
                        {record.customer_type}
                    </Tag>
                    {record.document || '-'}
                </span>
            ),
        },
        {
            title: 'Telefone',
            key: 'phone',
            render: (_, record) => (
                <div>
                    <div>{record.phone || '-'}</div>
                    {record.whatsapp_phone && (
                        <div style={{ fontSize: 11, color: '#25D366' }}>
                            <WhatsAppOutlined /> WhatsApp
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Segmento',
            dataIndex: 'segment',
            key: 'segment',
            filters: segments.map(s => ({ text: s, value: s })),
            onFilter: (value, record) => record.segment === value,
        },
        {
            title: 'Responsável',
            key: 'owner',
            render: (_, record) => {
                if (!record.owner_id) return '—'
                const fromMap = employeeMap.get(record.owner_id)
                return fromMap || '—'
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            filters: Object.entries(statusLabels).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value, record) => record.status === value,
            render: (status: CustomerStatus) => {
                const cfg = statusLabels[status]
                return <Tag color={cfg?.color || 'default'}>{cfg?.label || status}</Tag>
            },
        },
        {
            title: '',
            key: 'history',
            width: 48,
            render: (_, record) => (
                <Tooltip title="Histórico do cliente">
                    <Button
                        type="text"
                        size="small"
                        icon={<BookOutlined style={{ color: '#7A5AF8', fontSize: 16 }} />}
                        onClick={() => {
                            setHistoryCustomerId(record.id)
                            setHistoryCustomerName(record.name)
                            setHistoryDrawerOpen(true)
                        }}
                    />
                </Tooltip>
            ),
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 160,
            render: (_, record) => {
                const allowed = canEdit(MODULES.CUSTOMERS) && canEditCustomer(record)
                return (
                    <Space>
                        {allowed ? (
                            <Button type="link" size="small" onClick={() => handleEdit(record)}>Editar</Button>
                        ) : (
                            <Tooltip title="Somente o responsável pode editar este cliente">
                                <Button type="link" size="small" disabled>Editar</Button>
                            </Tooltip>
                        )}
                        {allowed ? (
                            <Popconfirm title="Desativar cliente?" onConfirm={() => handleDelete(record.id)}>
                                <Button type="link" size="small" danger>Desativar</Button>
                            </Popconfirm>
                        ) : (
                            <Tooltip title="Somente o responsável pode excluir este cliente">
                                <Button type="link" size="small" danger disabled>Excluir</Button>
                            </Tooltip>
                        )}
                    </Space>
                )
            },
        },
    ]

    function handleSearch(value: string) {
        setSearchText(value)
    }

    function handleEdit(record: Customer) {
        setEditingId(record.id)
        form.setFieldsValue(record)
        setDrawerOpen(true)
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch('/api/delete/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Erro ao desativar')
            await reloadCustomers()
            messageApi.success('Cliente desativado!')
        } catch (error: any) {
            console.error('Erro ao desativar:', error)
            messageApi.error('Erro ao desativar: ' + error.message)
        }
    }

    function handleAdd() {
        setEditingId(null)
        form.resetFields()
        form.setFieldsValue({ customer_type: 'PF', status: 'ACTIVE' })
        setDrawerOpen(true)
    }

    async function handleSave() {
        try {
            const values = await form.validateFields()
            setSaving(true)

            const tenant_id = tenantId ?? currentUser?.tenant_id
            if (!tenant_id) {
                messageApi.error('Sessão expirada. Faça logout e login novamente.')
                return
            }

            if (values.phone) values.phone = values.phone.replace(/\D/g, '')
            if (values.whatsapp_phone) values.whatsapp_phone = values.whatsapp_phone.replace(/\D/g, '')

            const owner_id = isAdminRole ? (values.owner_id || null) : (currentUser?.employee_id ?? values.owner_id ?? null)

            const { owner_id: _omit, ...restValues } = values

            if (editingId) {
                const { error } = await supabase
                    .from('customers')
                    .update({ ...restValues, owner_id, updated_at: new Date().toISOString() })
                    .eq('id', editingId)

                if (error) throw error

                messageApi.success('Cliente atualizado!')
            } else {
                const { data: newCustomer, error } = await supabase
                    .from('customers')
                    .insert([{
                    ...restValues,
                    tenant_id,
                    owner_id,
                    status: restValues.status || 'ACTIVE',
                    customer_type: restValues.customer_type || 'PF',
                }])
                    .select()
                    .single()

                if (error) throw error
            }

            await reloadCustomers()
            setDrawerOpen(false)
            form.resetFields()
        } catch (error: any) {
            console.error('Erro ao salvar:', error)
            messageApi.error('Erro ao salvar: ' + (error.message || 'Verifique os campos'))
        } finally {
            setSaving(false)
        }
    }

    const renderGroupedTimeline = (entries: TimelineEntry[], maxHeight?: number) => {
        const typeGroups: { key: string; label: string; icon: React.ReactNode }[] = [
            { key: 'SERVICE', label: 'Serviços Realizados', icon: <ClockCircleOutlined style={{ color: '#12B76A' }} /> },
            { key: 'SALE', label: 'Vendas', icon: <ShopOutlined style={{ color: '#F79009' }} /> },
            { key: 'BUDGET', label: 'Orçamentos', icon: <FileTextOutlined style={{ color: '#2E90FA' }} /> },
            { key: 'ATTACHMENT', label: 'Anexos e Documentos', icon: <PaperClipOutlined style={{ color: '#7A5AF8' }} /> },
        ]

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...(maxHeight ? { maxHeight, overflow: 'auto' } : {}) }}>
                {typeGroups.map(({ key: typeKey, label: typeLabel, icon: typeIcon }) => {
                    const typeEntries = entries.filter(e =>
                        typeKey === 'BUDGET' ? (e.type === 'BUDGET' || e.type === 'BUDGET_HIST') : e.type === typeKey
                    )
                    if (typeEntries.length === 0) return null
                    return (
                        <div key={typeKey}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
                                {typeIcon} {typeLabel}
                                <Tag style={{ margin: 0 }}>{typeEntries.length}</Tag>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {typeEntries.map(entry => {
                                    const isExpanded = expandedEntryId === entry.id
                                    return (
                                        <div
                                            key={entry.id}
                                            style={{
                                                padding: '10px 14px',
                                                background: isExpanded ? 'rgba(46, 144, 250, 0.12)' : '#0a1628',
                                                borderRadius: 8,
                                                border: `1px solid ${isExpanded ? 'rgba(46, 144, 250, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                            onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Tag color={entry.badgeColor} style={{ margin: 0, fontSize: 10 }}>{entry.badgeLabel}</Tag>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{entry.title}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {entry.amount != null && (
                                                        <span style={{ color: '#12B76A', fontWeight: 700, fontSize: 13 }}>
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entry.amount)}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                                        {new Date(entry.date).toLocaleDateString('pt-BR')}
                                                    </span>
                                                    <span style={{ fontSize: 11, color: '#64748b', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9660;</span>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.6 }}>
                                                        {entry.description && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Detalhes:</strong> {entry.description}
                                                            </div>
                                                        )}
                                                        {entry.serviceObservation && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Observação do serviço:</strong> {entry.serviceObservation}
                                                            </div>
                                                        )}
                                                        {entry.employeeName && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Funcionário:</strong> {entry.employeeName}
                                                            </div>
                                                        )}
                                                        {entry.budgetItems && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Itens:</strong> {entry.budgetItems}
                                                            </div>
                                                        )}
                                                        {entry.budgetStatus && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Status:</strong> <Tag>{entry.budgetStatus}</Tag>
                                                            </div>
                                                        )}
                                                        <div style={{ marginBottom: 6 }}>
                                                            <strong>Data:</strong> {new Date(entry.date).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
                                                        </div>
                                                        {entry.attachmentDescription && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Descrição do anexo:</strong> {entry.attachmentDescription}
                                                            </div>
                                                        )}
                                                        {entry.downloadUrl && (
                                                            <div style={{ marginTop: 8 }}>
                                                                <a
                                                                    href={entry.downloadUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                        padding: '6px 12px', background: '#111c2e', border: '1px solid rgba(255,255,255,0.1)',
                                                                        borderRadius: 6, fontSize: 12, color: '#e2e8f0',
                                                                        textDecoration: 'none',
                                                                    }}
                                                                >
                                                                    <DownloadOutlined /> Baixar {entry.fileName}
                                                                    {entry.fileSize != null && (
                                                                        <span style={{ color: '#64748b' }}>({(entry.fileSize / 1024).toFixed(0)} KB)</span>
                                                                    )}
                                                                </a>
                                                            </div>
                                                        )}
                                                        {entry.attachments && entry.attachments.length > 0 && (
                                                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                                                                    <PaperClipOutlined style={{ marginRight: 4 }} />Anexos ({entry.attachments.length})
                                                                </div>
                                                                {entry.attachments.map((att, idx) => (
                                                                    <a
                                                                        key={idx}
                                                                        href={att.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                            padding: '6px 12px', background: '#111c2e', border: '1px solid rgba(122,90,248,0.3)',
                                                                            borderRadius: 6, fontSize: 12, color: '#e2e8f0',
                                                                            textDecoration: 'none',
                                                                        }}
                                                                    >
                                                                        <DownloadOutlined style={{ color: '#7A5AF8' }} /> {att.name}
                                                                        {att.size != null && (
                                                                            <span style={{ color: '#64748b' }}>({(att.size / 1024).toFixed(0)} KB)</span>
                                                                        )}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <Layout title={PAGE_TITLES.CLIENTS} subtitle="Gerenciamento de clientes e contatos">
            {contextHolder}

            {/* KPIs */}
            <div className="kpi-grid">
                <CardKPI title="Total de Clientes" value={totalClients} icon={<TeamOutlined />} variant="blue" />
                <CardKPI title="Clientes Ativos" value={activeClients} icon={<CheckCircleOutlined />} variant="green" />
                <CardKPI title="Pessoa Jurídica" value={pjClients} icon={<ShopOutlined />} variant="orange" />
                <CardKPI title="Com WhatsApp" value={withWhatsapp} icon={<WhatsAppOutlined />} variant="green" />
            </div>

            <div className="pc-card--table">
                <div className="filter-bar">
                    <Input
                        placeholder="Buscar por nome, documento, email ou telefone..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{ maxWidth: 400 }}
                        allowClear
                    />
                    <div style={{ flex: 1 }} />
                    {canEdit(MODULES.CUSTOMERS) && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                            Novo Cliente
                        </Button>
                    )}
                </div>
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} clientes` }}
                    size="middle"
                    loading={isLoading}
                />
            </div>

            {/* Drawer */}
            <Drawer
                title={editingId ? 'Editar Cliente' : 'Novo Cliente'}
                width={680}
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); form.resetFields(); setExpandedEntryId(null) }}
                extra={
                    <Space>
                        <Button onClick={() => setDrawerOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} type="primary" loading={saving}>Salvar</Button>
                    </Space>
                }
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="Nome / Razão Social" rules={[{ required: true, message: 'Informe o nome' }]}>
                        <Input placeholder="Nome completo ou razão social" onChange={(e) => form.setFieldsValue({ name: capitalizeFirst(e.target.value) })} />
                    </Form.Item>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="customer_type" label="Tipo" rules={[{ required: true }]}>
                            <Select onChange={() => form.setFieldsValue({ document: '' })}>
                                <Select.Option value="PF">Pessoa Física</Select.Option>
                                <Select.Option value="PJ">Pessoa Jurídica</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item
                            shouldUpdate={(prev, curr) => prev.customer_type !== curr.customer_type}
                        >
                            {({ getFieldValue }) => {
                                const type = getFieldValue('customer_type') || 'PF'
                                const isPf = type === 'PF'
                                return (
                                    <Form.Item
                                        name="document"
                                        label={isPf ? "CPF" : "CNPJ"}
                                        rules={[
                                            { required: true, message: 'Informe o documento' },
                                            {
                                                validator: (_, value) => {
                                                    if (!value) return Promise.resolve()
                                                    const clean = value.replace(/\D/g, '')
                                                    if (isPf) {
                                                        if (!cpf.isValid(clean)) return Promise.reject('CPF inválido')
                                                    } else {
                                                        if (!cnpj.isValid(clean)) return Promise.reject('CNPJ inválido')
                                                    }
                                                    return Promise.resolve()
                                                }
                                            }
                                        ]}
                                    >
                                        <Input
                                            placeholder={isPf ? "000.000.000-00" : "00.000.000/0000-00"}
                                            maxLength={isPf ? 14 : 18}
                                            onChange={(e) => {
                                                const value = e.target.value
                                                const masked = isPf
                                                    ? VMasker.toPattern(value, '999.999.999-99')
                                                    : VMasker.toPattern(value, '99.999.999/9999-99')
                                                form.setFieldsValue({ document: masked })
                                            }}
                                        />
                                    </Form.Item>
                                )
                            }}
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="email" label="Email">
                            <Input placeholder="email@exemplo.com" />
                        </Form.Item>
                        <Form.Item name="phone" label="Telefone">
                            <Input placeholder="(00) 00000-0000" maxLength={15} onChange={(e) => form.setFieldsValue({ phone: phoneMask(e.target.value) })} />
                        </Form.Item>
                    </div>

                    {/* WhatsApp Section */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(37,211,102,0.06), rgba(37,211,102,0.02))', border: '1px solid rgba(37,211,102,0.15)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <WhatsAppOutlined style={{ color: '#25D366' }} /> WhatsApp para Disparos
                        </div>
                        <Form.Item name="whatsapp_phone" label="Número WhatsApp" style={{ marginBottom: 0 }}>
                            <Input placeholder="(00) 00000-0000" maxLength={15} onChange={(e) => form.setFieldsValue({ whatsapp_phone: phoneMask(e.target.value) })} />
                        </Form.Item>
                        <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                            Formato: DDI + DDD + Número (ex: 5551999990000). Usado para lembretes e envio de orçamentos.
                        </div>
                    </div>

                    <Form.Item name="address" label="Endereço">
                        <Input placeholder="Rua, número, complemento" />
                    </Form.Item>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="city" label="Cidade">
                            <Input placeholder="Cidade" />
                        </Form.Item>
                        <Form.Item name="state_code" label="Estado">
                            <Input placeholder="UF" maxLength={2} />
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="segment" label="Segmento">
                            <Select placeholder="Selecione" allowClear>
                                {segments.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                            </Select>
                        </Form.Item>
                        <Form.Item name="status" label="Status">
                            <Select>
                                <Select.Option value="ACTIVE">Ativo</Select.Option>
                                <Select.Option value="INACTIVE">Inativo</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item name="owner_id" label="Responsável (funcionário)">
                        <Select placeholder="Opcional — vincular a um funcionário ativo" allowClear>
                            {employees.map(e => (
                                <Select.Option key={e.id} value={e.id}>{e.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="notes" label="Observações">
                        <Input.TextArea rows={3} placeholder="Notas sobre o cliente..." />
                    </Form.Item>

                    {editingId && (
                        <>
                            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <HistoryOutlined /> Histórico do Cliente
                                </div>
                                {timelineLoading ? (
                                    <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
                                ) : timeline.length === 0 ? (
                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum registro encontrado.</div>
                                ) : renderGroupedTimeline(timeline, 340)}
                            </div>
                        </>
                    )}
                </Form>
            </Drawer>

            {/* History Drawer */}
            <Drawer
                title={<span><BookOutlined style={{ marginRight: 8, color: '#7A5AF8' }} />Histórico — {historyCustomerName}</span>}
                width={480}
                open={historyDrawerOpen}
                onClose={() => { setHistoryDrawerOpen(false); setHistoryCustomerId(null); setExpandedEntryId(null) }}
            >
                {timelineLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : timeline.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                        <BookOutlined style={{ fontSize: 40, color: '#D0D5DD', display: 'block', marginBottom: 12 }} />
                        Nenhum registro encontrado para este cliente.
                    </div>
                ) : renderGroupedTimeline(timeline)}
            </Drawer>
        </Layout>
    )
}

export default Clients
