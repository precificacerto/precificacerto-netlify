import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Table, Tabs, Input, Select, Space, Tag, message, Popconfirm,
    DatePicker, Empty, Drawer, Form, Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import {
    CalendarOutlined, DeleteOutlined, EditOutlined, SearchOutlined,
    ShoppingOutlined, ToolOutlined, InfoCircleOutlined, SaveOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons'

function formatCurrency(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface RecurrenceRow {
    id: string
    type: 'PRODUCT' | 'SERVICE'
    itemName: string
    customerName: string
    employeeName: string
    amount: number
    saleDate: string
    dispatchDate: string
    status: string
    recurrenceDays: number
    customerId: string
    productId: string | null
    serviceId: string | null
}

export default function RecurrencePage() {
    const { currentUser } = useAuth()
    const { canView, canEdit } = usePermissions()
    const [messageApi, contextHolder] = message.useMessage()
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT')
    const [records, setRecords] = useState<RecurrenceRow[]>([])
    const [searchText, setSearchText] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')

    // Message templates
    const [messageProducts, setMessageProducts] = useState('')
    const [messageServices, setMessageServices] = useState('')
    const [savingMessage, setSavingMessage] = useState(false)

    // Edit drawer
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [editingRecord, setEditingRecord] = useState<RecurrenceRow | null>(null)
    const [editForm] = Form.useForm()

    if (!canView(MODULES.RECURRENCE)) {
        return <Layout title="Recorrência"><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            const tenantId = await getTenantId()
            if (!tenantId) return

            const { data: recs } = await supabase
                .from('recurrence_records')
                .select(`
                    *,
                    products(name),
                    services(name),
                    customers(name),
                    employees(name)
                `)
                .eq('is_active', true)
                .order('dispatch_date', { ascending: true })

            setRecords((recs || []).map((r: any) => ({
                id: r.id,
                type: r.type,
                itemName: r.type === 'PRODUCT' ? (r.products?.name || '-') : (r.services?.name || '-'),
                customerName: r.customers?.name || '-',
                employeeName: r.employees?.name || '',
                amount: Number(r.amount) || 0,
                saleDate: r.sale_date,
                dispatchDate: r.dispatch_date,
                status: r.status,
                recurrenceDays: r.recurrence_days,
                customerId: r.customer_id,
                productId: r.product_id,
                serviceId: r.service_id,
            })))

            // Load message templates
            const userId = await getCurrentUserId()
            if (userId) {
                const { data: msg } = await supabase
                    .from('recurrence_messages')
                    .select('message_products, message_services')
                    .eq('tenant_id', tenantId)
                    .eq('user_id', userId)
                    .maybeSingle()
                if (msg) {
                    setMessageProducts(msg.message_products || '')
                    setMessageServices(msg.message_services || '')
                }
            }
        } catch (err: any) {
            messageApi.error('Erro ao carregar recorrências: ' + (err.message || 'Erro'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    // Processar disparos de recorrência pendentes: ao abrir a página e a cada 30s
    useEffect(() => {
        const run = () => fetch('/api/whatsapp/send-recurrence', { method: 'POST' }).catch(() => {})
        run()
        const interval = setInterval(run, 30 * 1000)
        return () => clearInterval(interval)
    }, [])

    const handleSaveMessage = async () => {
        setSavingMessage(true)
        try {
            const tenantId = await getTenantId()
            const userId = await getCurrentUserId()
            if (!tenantId || !userId) {
                messageApi.error('Sessão inválida.')
                return
            }

            await supabase.from('recurrence_messages').upsert({
                tenant_id: tenantId,
                user_id: userId,
                message_products: messageProducts,
                message_services: messageServices,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,user_id' })

            messageApi.success('Mensagem salva!')
        } catch (err: any) {
            messageApi.error('Erro ao salvar: ' + (err.message || 'Erro'))
        } finally {
            setSavingMessage(false)
        }
    }

    const handleDelete = async (id: string) => {
        await supabase.from('recurrence_records').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
        await supabase.from('recurrence_dispatch_queue').update({ status: 'CANCELLED' }).eq('recurrence_record_id', id).eq('status', 'PENDING')
        messageApi.success('Recorrência excluída.')
        fetchData()
    }

    const handleEdit = (record: RecurrenceRow) => {
        setEditingRecord(record)
        editForm.setFieldsValue({
            dispatch_date: dayjs(record.dispatchDate),
            recurrence_days: record.recurrenceDays,
        })
        setEditDrawerOpen(true)
    }

    const handleSaveEdit = async () => {
        try {
            const values = await editForm.validateFields()
            if (!editingRecord) return

            const newDispatchDate = values.dispatch_date.format('YYYY-MM-DD')

            await supabase.from('recurrence_records').update({
                dispatch_date: newDispatchDate,
                recurrence_days: values.recurrence_days,
                updated_at: new Date().toISOString(),
            }).eq('id', editingRecord.id)

            // Update dispatch queue
            await supabase.from('recurrence_dispatch_queue')
                .update({ scheduled_at: `${newDispatchDate}T12:00:00-03:00` })
                .eq('recurrence_record_id', editingRecord.id)
                .eq('status', 'PENDING')

            messageApi.success('Recorrência atualizada.')
            setEditDrawerOpen(false)
            fetchData()
        } catch (err: any) {
            if (err?.errorFields) return
            messageApi.error('Erro ao atualizar: ' + (err.message || 'Erro'))
        }
    }

    const filteredRecords = useMemo(() => {
        return records
            .filter(r => r.type === activeTab)
            .filter(r => statusFilter === 'all' || r.status === statusFilter)
            .filter(r =>
                r.itemName.toLowerCase().includes(searchText.toLowerCase()) ||
                r.customerName.toLowerCase().includes(searchText.toLowerCase())
            )
    }, [records, activeTab, searchText, statusFilter])

    const statusColor: Record<string, string> = {
        PENDING: 'orange',
        SENT: 'green',
        CANCELLED: 'default',
    }

    const statusLabel: Record<string, string> = {
        PENDING: 'Pendente',
        SENT: 'Enviado',
        CANCELLED: 'Cancelado',
    }

    const columns: ColumnsType<RecurrenceRow> = [
        {
            title: activeTab === 'PRODUCT' ? 'Produto' : 'Serviço',
            dataIndex: 'itemName',
            key: 'itemName',
            sorter: (a, b) => a.itemName.localeCompare(b.itemName),
            render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
        },
        {
            title: 'Cliente',
            dataIndex: 'customerName',
            key: 'customerName',
            sorter: (a, b) => a.customerName.localeCompare(b.customerName),
        },
        {
            title: 'Vendedor',
            dataIndex: 'employeeName',
            key: 'employeeName',
            render: (v) => v || '-',
        },
        {
            title: 'Valor',
            dataIndex: 'amount',
            key: 'amount',
            render: (v) => <span style={{ fontWeight: 600 }}>{formatCurrency(v)}</span>,
            sorter: (a, b) => a.amount - b.amount,
        },
        {
            title: 'Data Venda',
            dataIndex: 'saleDate',
            key: 'saleDate',
            render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '-',
            sorter: (a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime(),
        },
        {
            title: 'Data Disparo',
            dataIndex: 'dispatchDate',
            key: 'dispatchDate',
            render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '-',
            sorter: (a, b) => new Date(a.dispatchDate).getTime() - new Date(b.dispatchDate).getTime(),
        },
        {
            title: 'Dias',
            dataIndex: 'recurrenceDays',
            key: 'recurrenceDays',
            width: 70,
            render: (v) => `${v}d`,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (s) => <Tag color={statusColor[s] || 'default'}>{statusLabel[s] || s}</Tag>,
        },
        ...(canEdit(MODULES.RECURRENCE) ? [{
            title: 'Ações',
            key: 'actions',
            width: 100,
            render: (_: unknown, record: RecurrenceRow) => (
                <Space>
                    <Tooltip title="Editar">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    </Tooltip>
                    <Popconfirm title="Excluir esta recorrência?" onConfirm={() => handleDelete(record.id)} okText="Sim" cancelText="Não">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        }] : []),
    ]

    const pendingProducts = records.filter(r => r.type === 'PRODUCT' && r.status === 'PENDING').length
    const pendingServices = records.filter(r => r.type === 'SERVICE' && r.status === 'PENDING').length

    const messageTemplate = activeTab === 'PRODUCT' ? messageProducts : messageServices
    const setMessageTemplate = activeTab === 'PRODUCT' ? setMessageProducts : setMessageServices

    return (
        <Layout title="Recorrência" subtitle="Disparo automático de mensagens WhatsApp para clientes com recorrência">
            {contextHolder}

            <div className="pc-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <WhatsAppOutlined style={{ fontSize: 18, color: '#25D366' }} />
                    <strong style={{ fontSize: 14 }}>
                        Mensagem de recorrência — {activeTab === 'PRODUCT' ? 'Produtos' : 'Serviços'}
                    </strong>
                </div>

                <div style={{ marginBottom: 8, fontSize: 12, color: '#94a3b8' }}>
                    <InfoCircleOutlined style={{ marginRight: 4 }} />
                    Use <Tag color="blue" style={{ fontSize: 11 }}>{'{{nome_cliente}}'}</Tag> para o nome do cliente e{' '}
                    <Tag color="blue" style={{ fontSize: 11 }}>
                        {activeTab === 'PRODUCT' ? '{{nome_produto}}' : '{{nome_servico}}'}
                    </Tag>{' '}
                    para o nome do {activeTab === 'PRODUCT' ? 'produto' : 'serviço'}.
                </div>

                <Input.TextArea
                    rows={3}
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    placeholder={
                        activeTab === 'PRODUCT'
                            ? 'Olá {{nome_cliente}}, já faz um tempo desde a sua última compra de {{nome_produto}}. Gostaria de fazer um novo pedido?'
                            : 'Olá {{nome_cliente}}, já se passaram alguns dias desde o seu último {{nome_servico}}. Que tal agendar novamente?'
                    }
                    style={{ marginBottom: 8 }}
                    disabled={!canEdit(MODULES.RECURRENCE)}
                />

                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSaveMessage}
                    loading={savingMessage}
                    disabled={!canEdit(MODULES.RECURRENCE)}
                    size="small"
                >
                    Salvar mensagem
                </Button>
            </div>

            <div className="pc-card--table">
                <Tabs
                    activeKey={activeTab}
                    onChange={(k) => setActiveTab(k as 'PRODUCT' | 'SERVICE')}
                    items={[
                        {
                            key: 'PRODUCT',
                            label: (
                                <span>
                                    <ShoppingOutlined style={{ marginRight: 6 }} />
                                    Produtos ({pendingProducts} pendentes)
                                </span>
                            ),
                        },
                        {
                            key: 'SERVICE',
                            label: (
                                <span>
                                    <ToolOutlined style={{ marginRight: 6 }} />
                                    Serviços ({pendingServices} pendentes)
                                </span>
                            ),
                        },
                    ]}
                />

                <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <Input
                        placeholder="Buscar por nome..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ maxWidth: 320 }}
                        allowClear
                    />
                    <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        style={{ minWidth: 160 }}
                        options={[
                            { value: 'all', label: 'Todos os status' },
                            { value: 'PENDING', label: 'Pendentes' },
                            { value: 'SENT', label: 'Enviados' },
                            { value: 'CANCELLED', label: 'Cancelados' },
                        ]}
                    />
                </div>

                <Table<RecurrenceRow>
                    columns={columns}
                    dataSource={filteredRecords}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 15, showTotal: (t) => `${t} recorrências` }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma recorrência registrada. Vendas com produtos/serviços que possuem tempo de recorrência aparecem aqui." /> }}
                />
            </div>

            {/* Edit Drawer */}
            <Drawer
                title="Editar Recorrência"
                width={380}
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                extra={
                    <Space>
                        <Button onClick={() => setEditDrawerOpen(false)}>Cancelar</Button>
                        <Button type="primary" onClick={handleSaveEdit}>Salvar</Button>
                    </Space>
                }
            >
                {editingRecord && (
                    <Form form={editForm} layout="vertical">
                        <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-neutral-50)', borderRadius: 8, fontSize: 13 }}>
                            <div><strong>{editingRecord.itemName}</strong></div>
                            <div>Cliente: {editingRecord.customerName}</div>
                            <div>Valor: {formatCurrency(editingRecord.amount)}</div>
                        </div>
                        <Form.Item name="dispatch_date" label="Data do disparo" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                        <Form.Item name="recurrence_days" label="Dias de recorrência" rules={[{ required: true }]}>
                            <Input type="number" min={1} />
                        </Form.Item>
                    </Form>
                )}
            </Drawer>
        </Layout>
    )
}
