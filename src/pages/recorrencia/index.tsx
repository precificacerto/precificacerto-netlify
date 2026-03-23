import React, { useState, useEffect, useMemo, useRef } from 'react'
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
    customMessage: string | null
}

export default function RecurrencePage() {
    const { currentUser } = useAuth()
    const { canView, canEdit } = usePermissions()
    const [messageApi, contextHolder] = message.useMessage()
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'PRODUCT' | 'SERVICE' | 'PRODUCT_SENT' | 'SERVICE_SENT'>('SERVICE_SENT')
    const [records, setRecords] = useState<RecurrenceRow[]>([])
    const [searchText, setSearchText] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')

    // Message templates
    const [messageProducts, setMessageProducts] = useState('')
    const [messageServices, setMessageServices] = useState('')
    const [savingMessage, setSavingMessage] = useState(false)

    // TextArea ref for inserting placeholders at cursor position
    const textAreaRef = useRef<any>(null)

    // Edit drawer
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [editingRecord, setEditingRecord] = useState<RecurrenceRow | null>(null)
    const [editForm] = Form.useForm()
    const editMessageRef = useRef<any>(null)

    function insertEditTag(tag: string) {
        const current = editForm.getFieldValue('custom_message') || ''
        const textarea = editMessageRef.current?.resizableTextArea?.textArea
        if (textarea) {
            const start = textarea.selectionStart ?? current.length
            const end = textarea.selectionEnd ?? current.length
            const newText = current.substring(0, start) + tag + current.substring(end)
            editForm.setFieldsValue({ custom_message: newText })
            setTimeout(() => {
                textarea.focus()
                const newPos = start + tag.length
                textarea.setSelectionRange(newPos, newPos)
            }, 0)
        } else {
            editForm.setFieldsValue({ custom_message: current + tag })
        }
    }

    if (!canView(MODULES.RECURRENCE)) {
        return <Layout title="Recorrência"><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            const tenantId = await getTenantId()
            if (!tenantId) return

            const sb = supabase as any
            const { data: recs } = await sb
                .from('recurrence_records')
                .select(`
                    *,
                    products(name),
                    services(name),
                    customers(name),
                    employees(name)
                `)
                .eq('tenant_id', tenantId)
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
                customMessage: r.custom_message || null,
            })))

            // Load message templates
            const userId = await getCurrentUserId()
            if (userId) {
                const { data: msg } = await (supabase as any)
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

            await (supabase as any).from('recurrence_messages').upsert({
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
        const sbr = supabase as any
        await sbr.from('recurrence_records').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
        await sbr.from('recurrence_dispatch_queue').update({ status: 'CANCELLED' }).eq('recurrence_record_id', id).eq('status', 'PENDING')
        messageApi.success('Recorrência excluída.')
        fetchData()
    }

    const handleEdit = (record: RecurrenceRow) => {
        setEditingRecord(record)
        editForm.setFieldsValue({
            dispatch_date: dayjs(record.dispatchDate),
            recurrence_days: record.recurrenceDays,
            custom_message: record.customMessage || '',
        })
        setEditDrawerOpen(true)
    }

    const handleSaveEdit = async () => {
        try {
            const values = await editForm.validateFields()
            if (!editingRecord) return

            const newDispatchDate = values.dispatch_date.format('YYYY-MM-DD')

            const sbe = supabase as any
            await sbe.from('recurrence_records').update({
                dispatch_date: newDispatchDate,
                recurrence_days: values.recurrence_days,
                custom_message: values.custom_message || null,
                updated_at: new Date().toISOString(),
            }).eq('id', editingRecord.id)

            // Update dispatch queue
            await sbe.from('recurrence_dispatch_queue')
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
        const baseType = activeTab === 'PRODUCT_SENT' ? 'PRODUCT' : activeTab === 'SERVICE_SENT' ? 'SERVICE' : activeTab
        const forcedStatus = activeTab === 'PRODUCT_SENT' || activeTab === 'SERVICE_SENT' ? 'SENT' : null
        return records
            .filter(r => r.type === baseType)
            .filter(r => forcedStatus ? r.status === forcedStatus : (statusFilter === 'all' || r.status === statusFilter))
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
            title: (activeTab === 'PRODUCT' || activeTab === 'PRODUCT_SENT') ? 'Produto' : 'Serviço',
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
    const sentProducts = records.filter(r => r.type === 'PRODUCT' && r.status === 'SENT').length
    const sentServices = records.filter(r => r.type === 'SERVICE' && r.status === 'SENT').length

    const messageTemplate = activeTab === 'PRODUCT' ? messageProducts : messageServices
    const setMessageTemplate = activeTab === 'PRODUCT' ? setMessageProducts : setMessageServices

    const insertPlaceholder = (placeholder: string) => {
        const textarea = textAreaRef.current?.resizableTextArea?.textArea as HTMLTextAreaElement | undefined
        if (textarea) {
            const start = textarea.selectionStart ?? messageTemplate.length
            const end = textarea.selectionEnd ?? messageTemplate.length
            const text = messageTemplate
            const newText = text.substring(0, start) + placeholder + text.substring(end)
            setMessageTemplate(newText)
            setTimeout(() => {
                textarea.focus()
                const newPos = start + placeholder.length
                textarea.setSelectionRange(newPos, newPos)
            }, 0)
        } else {
            setMessageTemplate(prev => prev + placeholder)
        }
    }

    return (
        <Layout title="Recorrência" subtitle="Disparo automático de mensagens WhatsApp para clientes com recorrência">
            {contextHolder}

            <div className="pc-card--table">
                <Tabs
                    activeKey={activeTab}
                    onChange={(k) => setActiveTab(k as 'PRODUCT' | 'SERVICE' | 'PRODUCT_SENT' | 'SERVICE_SENT')}
                    items={[
                        {
                            key: 'SERVICE_SENT',
                            label: (
                                <span>
                                    <ToolOutlined style={{ marginRight: 6 }} />
                                    Serviços (Enviados) ({sentServices})
                                </span>
                            ),
                        },
                        {
                            key: 'PRODUCT_SENT',
                            label: (
                                <span>
                                    <ShoppingOutlined style={{ marginRight: 6 }} />
                                    Produtos (Enviados) ({sentProducts})
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
                        {
                            key: 'PRODUCT',
                            label: (
                                <span>
                                    <ShoppingOutlined style={{ marginRight: 6 }} />
                                    Produtos ({pendingProducts} pendentes)
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
                        <div style={{ marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
                            Clique nas tags para inserir na mensagem:{' '}
                            <Tag color="blue" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => insertEditTag('{{nome_cliente}}')}>
                                {'{{nome_cliente}}'}
                            </Tag>{' '}
                            <Tag color="blue" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => insertEditTag('{{nome_produto}}')}>
                                {'{{nome_produto}}'}
                            </Tag>
                        </div>
                        <Form.Item
                            name="custom_message"
                            label={
                                <span>
                                    Mensagem personalizada&nbsp;
                                    <Tooltip title="Sobrescreve a mensagem padrão apenas para esta recorrência específica. Deixe vazio para usar a mensagem padrão do produto/serviço.">
                                        <InfoCircleOutlined style={{ color: '#64748b' }} />
                                    </Tooltip>
                                </span>
                            }
                        >
                            <Input.TextArea ref={editMessageRef} rows={3} placeholder="Opcional — usa mensagem padrão se vazio" />
                        </Form.Item>
                    </Form>
                )}
            </Drawer>
        </Layout>
    )
}
