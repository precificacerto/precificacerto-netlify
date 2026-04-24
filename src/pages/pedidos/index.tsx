import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
    Button, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag,
    message, Modal, Popconfirm, Empty, Checkbox, Divider, Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    ShoppingCartOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
    SendOutlined, UnorderedListOutlined, SearchOutlined, DollarOutlined,
    FileTextOutlined, ClockCircleOutlined, CheckCircleOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCustomers, useProducts, useEmployees } from '@/hooks/use-data.hooks'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { formatBRL } from '@/utils/formatters'
import { exportTableToPdf } from '@/utils/export-generic-pdf'
import dayjs from 'dayjs'

const { Text } = Typography

const formatCurrency = formatBRL

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    DRAFT: { color: 'default', label: 'Rascunho' },
    AWAITING_PAYMENT: { color: 'processing', label: 'Aguardando pagamento' },
    SENT_TO_SALE: { color: 'warning', label: 'Enviado para venda' },
    PAID: { color: 'green', label: '✅ Pago' },
    CANCELLED: { color: 'red', label: 'Cancelado' },
}

const PAYMENT_METHODS = [
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'LANCAMENTOS_A_RECEBER', label: '📋 Lançamentos a Receber' },
]

interface OrderItemRow {
    id?: string
    key: string
    product_id: string | null
    service_id?: string | null
    product_name: string
    quantity: number
    unit_price: number
    total_price: number
    manual_description?: string | null
}

interface Order {
    id: string
    tenant_id: string
    order_code: string
    customer_id: string
    employee_id?: string | null
    budget_id?: string | null
    sale_id?: string | null
    status: string
    total_value: number
    discount_mode?: string | null
    discount_value?: number | null
    discount_percent?: number | null
    payment_method?: string | null
    installments?: number | null
    entry_value?: number | null
    notes?: string | null
    created_at: string
    updated_at: string
    customer_name?: string
    employee_name?: string
    budget_code?: string
    items_count?: number
}

function OrdersPage() {
    const { currentUser, tenantId } = useAuth()
    const { canView, canEdit } = usePermissions()
    const { data: customers = [] } = useCustomers()
    const { data: products = [] } = useProducts()
    const { data: employees = [] } = useEmployees()
    const [messageApi, contextHolder] = message.useMessage()

    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(false)

    // Edit drawer
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [editingOrder, setEditingOrder] = useState<Order | null>(null)
    const [orderItems, setOrderItems] = useState<OrderItemRow[]>([])
    const [savingEdit, setSavingEdit] = useState(false)
    const [editForm] = Form.useForm()

    // Send to sale modal
    const [sendToSaleOpen, setSendToSaleOpen] = useState(false)
    const [sendingOrder, setSendingOrder] = useState<Order | null>(null)
    const [sendingToSale, setSendingToSale] = useState(false)

    // Products compilation drawer
    const [compiledDrawerOpen, setCompiledDrawerOpen] = useState(false)
    const [purchaseTracking, setPurchaseTracking] = useState<Record<string, boolean>>({})

    // Filters
    const [filterCustomer, setFilterCustomer] = useState<string | null>(null)
    const [filterEmployee, setFilterEmployee] = useState<string | null>(null)
    const [filterProduct, setFilterProduct] = useState<string | null>(null)
    const [filterBudgetId, setFilterBudgetId] = useState<string>('')
    const [searchText, setSearchText] = useState('')

    const canViewOrders = canView(MODULES.ORDERS)
    const canEditOrders = canEdit(MODULES.ORDERS)

    const fetchOrders = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        try {
            const { data, error } = await (supabase as any)
                .from('orders')
                .select(`
                    id, tenant_id, order_code, customer_id, employee_id, budget_id, sale_id, status,
                    total_value, discount_mode, discount_value, discount_percent,
                    payment_method, installments, entry_value, notes,
                    created_at, updated_at,
                    customers ( name ),
                    budgets ( id ),
                    order_items ( id )
                `)
                .eq('tenant_id', tenantId)
                .in('status', ['DRAFT', 'AWAITING_PAYMENT', 'SENT_TO_SALE'])
                .order('created_at', { ascending: false })

            if (error) throw error

            // hydrate employee_name from employees
            const empMap = new Map((employees as any[]).map((e: any) => [e.user_id || e.id, e.name]))

            const hydrated: Order[] = (data || []).map((o: any) => ({
                ...o,
                customer_name: o.customers?.name || '-',
                employee_name: o.employee_id ? (empMap.get(o.employee_id) || '-') : '-',
                budget_code: o.budget_id ? `ORC-${String(o.budget_id).slice(0, 6).toUpperCase()}` : '',
                items_count: Array.isArray(o.order_items) ? o.order_items.length : 0,
            }))
            setOrders(hydrated)
        } catch (err: any) {
            console.error('Erro ao carregar pedidos:', err)
            messageApi.error('Erro ao carregar pedidos: ' + (err.message || 'desconhecido'))
        } finally {
            setLoading(false)
        }
    }, [tenantId, employees, messageApi])

    useEffect(() => {
        if (tenantId) {
            fetchOrders()
        }
    }, [tenantId, fetchOrders])

    const fetchOrderItems = async (orderId: string): Promise<OrderItemRow[]> => {
        const { data, error } = await (supabase as any)
            .from('order_items')
            .select(`
                id, product_id, service_id, quantity, unit_price, total_price, manual_description,
                products ( name ),
                services ( name )
            `)
            .eq('order_id', orderId)
            .order('created_at', { ascending: true })

        if (error) {
            messageApi.error('Erro ao carregar itens: ' + error.message)
            return []
        }
        return (data || []).map((it: any, idx: number): OrderItemRow => ({
            id: it.id,
            key: it.id || `row-${idx}`,
            product_id: it.product_id || null,
            service_id: it.service_id || null,
            product_name: it.products?.name || it.services?.name || it.manual_description || '—',
            quantity: Number(it.quantity || 0),
            unit_price: Number(it.unit_price || 0),
            total_price: Number(it.total_price || 0),
            manual_description: it.manual_description || null,
        }))
    }

    const handleEdit = async (order: Order) => {
        setEditingOrder(order)
        editForm.setFieldsValue({
            customer_id: order.customer_id,
            employee_id: order.employee_id,
            payment_method: order.payment_method,
            installments: order.installments || 1,
            notes: order.notes || '',
        })
        const items = await fetchOrderItems(order.id)
        setOrderItems(items)
        setEditDrawerOpen(true)
    }

    const handleAddProductToOrder = () => {
        setOrderItems((prev) => [
            ...prev,
            {
                key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                product_id: null,
                product_name: '',
                quantity: 1,
                unit_price: 0,
                total_price: 0,
            },
        ])
    }

    const handleItemProductChange = (key: string, productId: string) => {
        const product = (products as any[]).find((p: any) => p.id === productId)
        if (!product) return
        setOrderItems((prev) =>
            prev.map((it) =>
                it.key === key
                    ? {
                          ...it,
                          product_id: productId,
                          product_name: product.name,
                          unit_price: Number(product.sale_price || product.final_price || 0),
                          total_price: Number(product.sale_price || product.final_price || 0) * it.quantity,
                      }
                    : it,
            ),
        )
    }

    const handleItemQtyChange = (key: string, qty: number) => {
        setOrderItems((prev) =>
            prev.map((it) =>
                it.key === key
                    ? { ...it, quantity: qty, total_price: (it.unit_price || 0) * qty }
                    : it,
            ),
        )
    }

    const handleItemPriceChange = (key: string, price: number) => {
        setOrderItems((prev) =>
            prev.map((it) =>
                it.key === key
                    ? { ...it, unit_price: price, total_price: price * (it.quantity || 0) }
                    : it,
            ),
        )
    }

    const handleItemRemove = (key: string) => {
        setOrderItems((prev) => prev.filter((it) => it.key !== key))
    }

    const handleSaveEdit = async () => {
        if (!editingOrder) return
        try {
            const values = await editForm.validateFields()
            setSavingEdit(true)

            const totalValue = orderItems.reduce((s, it) => s + (it.total_price || 0), 0)

            const { error: upErr } = await (supabase as any)
                .from('orders')
                .update({
                    customer_id: values.customer_id,
                    employee_id: values.employee_id || null,
                    payment_method: values.payment_method || null,
                    installments: values.installments || 1,
                    notes: values.notes || null,
                    total_value: totalValue,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingOrder.id)

            if (upErr) throw upErr

            // diff items: delete existentes, inserir atuais
            await (supabase as any).from('order_items').delete().eq('order_id', editingOrder.id)

            if (orderItems.length > 0) {
                const toInsert = orderItems
                    .filter((it) => it.product_id || it.service_id || it.manual_description)
                    .map((it) => ({
                        order_id: editingOrder.id,
                        product_id: it.product_id || null,
                        service_id: it.service_id || null,
                        quantity: it.quantity || 0,
                        unit_price: it.unit_price || 0,
                        total_price: it.total_price || 0,
                        manual_description: it.manual_description || null,
                    }))
                if (toInsert.length > 0) {
                    const { error: insErr } = await (supabase as any).from('order_items').insert(toInsert)
                    if (insErr) throw insErr
                }
            }

            messageApi.success('Pedido atualizado com sucesso.')
            setEditDrawerOpen(false)
            setEditingOrder(null)
            setOrderItems([])
            editForm.resetFields()
            fetchOrders()
        } catch (err: any) {
            console.error(err)
            messageApi.error('Erro ao salvar pedido: ' + (err?.message || 'desconhecido'))
        } finally {
            setSavingEdit(false)
        }
    }

    const handleOpenSendToSale = (order: Order) => {
        setSendingOrder(order)
        setSendToSaleOpen(true)
    }

    const handleConfirmSendToSale = async () => {
        if (!sendingOrder || !tenantId) return
        setSendingToSale(true)
        try {
            const items = await fetchOrderItems(sendingOrder.id)

            const { data: sale, error: saleErr } = await (supabase as any)
                .from('sales')
                .insert({
                    tenant_id: tenantId,
                    created_by: currentUser?.uid || null,
                    customer_id: sendingOrder.customer_id,
                    employee_id: sendingOrder.employee_id || null,
                    budget_id: sendingOrder.budget_id || null,
                    quantity: 1,
                    unit_price: sendingOrder.total_value,
                    final_value: sendingOrder.total_value,
                    payment_method: sendingOrder.payment_method || null,
                    installments: sendingOrder.installments || 1,
                    description: `Venda via pedido ${sendingOrder.order_code}`,
                    sale_date: new Date().toISOString(),
                    sale_type: 'FROM_ORDER',
                    status: 'AWAITING_PAYMENT',
                })
                .select('id')
                .single()

            if (saleErr) throw saleErr

            if (sale?.id) {
                const saleCode = `VD-${sale.id.slice(0, 6).toUpperCase()}`
                await (supabase as any).from('sales').update({ sale_code: saleCode }).eq('id', sale.id)

                if (items.length > 0) {
                    const saleItems = items.map((it) => ({
                        sale_id: sale.id,
                        product_id: it.product_id || null,
                        service_id: it.service_id || null,
                        quantity: it.quantity,
                        unit_price: it.unit_price,
                        discount: 0,
                        manual_description: it.manual_description || null,
                    }))
                    await (supabase as any).from('sale_items').insert(saleItems)
                }

                await (supabase as any)
                    .from('orders')
                    .update({ status: 'SENT_TO_SALE', sale_id: sale.id, updated_at: new Date().toISOString() })
                    .eq('id', sendingOrder.id)
            }

            messageApi.success('Pedido enviado para Vendas com sucesso!')
            setSendToSaleOpen(false)
            setSendingOrder(null)
            fetchOrders()
        } catch (err: any) {
            console.error(err)
            messageApi.error('Erro ao enviar para vendas: ' + (err?.message || 'desconhecido'))
        } finally {
            setSendingToSale(false)
        }
    }

    const handleDelete = async (orderId: string) => {
        try {
            const { error } = await (supabase as any).from('orders').delete().eq('id', orderId)
            if (error) throw error
            messageApi.success('Pedido excluído.')
            fetchOrders()
        } catch (err: any) {
            messageApi.error('Erro ao excluir: ' + (err?.message || 'desconhecido'))
        }
    }

    // ── Compilação de produtos em pedidos abertos ──

    const [compiledData, setCompiledData] = useState<Array<{ product_id: string; product_name: string; total_qty: number; orders: string[] }>>([])
    const [compiledLoading, setCompiledLoading] = useState(false)

    const loadCompiledProducts = async () => {
        if (!tenantId) return
        setCompiledLoading(true)
        try {
            const openOrderIds = orders.filter((o) => o.status !== 'PAID').map((o) => o.id)
            if (openOrderIds.length === 0) {
                setCompiledData([])
                return
            }

            const { data, error } = await (supabase as any)
                .from('order_items')
                .select(`
                    product_id, quantity, order_id,
                    products ( name ),
                    orders!inner ( order_code, tenant_id, status )
                `)
                .in('order_id', openOrderIds)
                .not('product_id', 'is', null)

            if (error) throw error

            const productMap = new Map<string, { product_id: string; product_name: string; total_qty: number; orders: string[] }>()
            ;(data || []).forEach((it: any) => {
                const pid = it.product_id
                if (!pid) return
                if (!productMap.has(pid)) {
                    productMap.set(pid, {
                        product_id: pid,
                        product_name: it.products?.name || '—',
                        total_qty: 0,
                        orders: [],
                    })
                }
                const row = productMap.get(pid)!
                row.total_qty += Number(it.quantity || 0)
                if (it.orders?.order_code && !row.orders.includes(it.orders.order_code)) {
                    row.orders.push(it.orders.order_code)
                }
            })

            const result = Array.from(productMap.values()).sort((a, b) => b.total_qty - a.total_qty)
            setCompiledData(result)

            // load existing purchase tracking
            const productIds = result.map((r) => r.product_id)
            if (productIds.length > 0) {
                const { data: trackingData } = await (supabase as any)
                    .from('order_purchase_tracking')
                    .select('product_id, is_purchased')
                    .eq('tenant_id', tenantId)
                    .in('product_id', productIds)
                const trackingMap: Record<string, boolean> = {}
                ;(trackingData || []).forEach((t: any) => {
                    trackingMap[t.product_id] = !!t.is_purchased
                })
                setPurchaseTracking(trackingMap)
            }
        } catch (err: any) {
            console.error(err)
            messageApi.error('Erro ao compilar produtos: ' + (err?.message || 'desconhecido'))
        } finally {
            setCompiledLoading(false)
        }
    }

    const handleOpenCompiled = () => {
        setCompiledDrawerOpen(true)
        loadCompiledProducts()
    }

    const handleTogglePurchased = async (productId: string, checked: boolean) => {
        if (!tenantId) return
        setPurchaseTracking((prev) => ({ ...prev, [productId]: checked }))
        try {
            const { error } = await (supabase as any)
                .from('order_purchase_tracking')
                .upsert(
                    {
                        tenant_id: tenantId,
                        product_id: productId,
                        is_purchased: checked,
                        purchased_at: checked ? new Date().toISOString() : null,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'tenant_id,product_id' },
                )
            if (error) throw error
        } catch (err: any) {
            messageApi.error('Erro ao salvar: ' + (err?.message || 'desconhecido'))
            setPurchaseTracking((prev) => ({ ...prev, [productId]: !checked }))
        }
    }

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            if (filterCustomer && o.customer_id !== filterCustomer) return false
            if (filterEmployee && o.employee_id !== filterEmployee) return false
            if (filterBudgetId.trim() && !o.budget_code?.toLowerCase().includes(filterBudgetId.toLowerCase())) return false
            if (searchText.trim() && !o.order_code.toLowerCase().includes(searchText.toLowerCase())
                && !o.customer_name?.toLowerCase().includes(searchText.toLowerCase())) return false
            return true
        })
    }, [orders, filterCustomer, filterEmployee, filterBudgetId, searchText])

    const totalOpenValue = useMemo(
        () => filteredOrders.reduce((s, o) => s + (o.total_value || 0), 0),
        [filteredOrders],
    )
    const draftCount = useMemo(() => filteredOrders.filter((o) => o.status === 'DRAFT').length, [filteredOrders])
    const awaitingCount = useMemo(() => filteredOrders.filter((o) => o.status === 'AWAITING_PAYMENT').length, [filteredOrders])

    const columns: ColumnsType<Order> = [
        {
            title: 'Código',
            dataIndex: 'order_code',
            key: 'order_code',
            width: 130,
            render: (v: string) => <Tag color="blue">{v}</Tag>,
        },
        {
            title: 'Cliente',
            dataIndex: 'customer_name',
            key: 'customer_name',
        },
        {
            title: 'Vendedor',
            dataIndex: 'employee_name',
            key: 'employee_name',
            width: 160,
        },
        {
            title: 'Itens',
            dataIndex: 'items_count',
            key: 'items_count',
            width: 80,
            align: 'center',
        },
        {
            title: 'Valor total',
            dataIndex: 'total_value',
            key: 'total_value',
            width: 140,
            align: 'right',
            render: (v: number) => <strong>{formatCurrency(v)}</strong>,
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 280,
            fixed: 'right',
            render: (_, record) => (
                <Space wrap>
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        disabled={!canEditOrders || record.status === 'SENT_TO_SALE'}
                    >
                        Editar
                    </Button>
                    {(record.status === 'DRAFT' || record.status === 'AWAITING_PAYMENT') && (
                        <Button
                            type="link"
                            size="small"
                            icon={<ShoppingCartOutlined />}
                            style={{ color: '#12B76A' }}
                            onClick={() => handleOpenSendToSale(record)}
                            disabled={!canEditOrders}
                        >
                            Enviar para Vendas
                        </Button>
                    )}
                    {record.status === 'DRAFT' && (
                        <Popconfirm
                            title="Excluir pedido?"
                            description="Esta ação não pode ser desfeita."
                            onConfirm={() => handleDelete(record.id)}
                            okText="Sim"
                            cancelText="Não"
                        >
                            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!canEditOrders}>
                                Excluir
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ]

    if (!canViewOrders) {
        return (
            <Layout title={PAGE_TITLES.ORDERS || 'Pedidos'}>
                <Empty description="Você não tem permissão para visualizar pedidos." />
            </Layout>
        )
    }

    return (
        <Layout title={PAGE_TITLES.ORDERS || 'Pedidos'}>
            {contextHolder}

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
                <CardKPI icon={<FileTextOutlined />} title="Pedidos em aberto" value={String(filteredOrders.length)} />
                <CardKPI icon={<ClockCircleOutlined />} title="Rascunho" value={String(draftCount)} />
                <CardKPI icon={<CheckCircleOutlined />} title="Aguardando pagamento" value={String(awaitingCount)} />
                <CardKPI icon={<DollarOutlined />} title="Valor total" value={formatCurrency(totalOpenValue)} />
            </div>

            {/* Filtros */}
            <Space wrap style={{ marginBottom: 16 }}>
                <Input
                    placeholder="Buscar código ou cliente"
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ width: 240 }}
                    allowClear
                />
                <Select
                    placeholder="Filtrar por cliente"
                    style={{ width: 220 }}
                    value={filterCustomer || undefined}
                    onChange={(v) => setFilterCustomer(v || null)}
                    allowClear
                    showSearch
                    optionFilterProp="children"
                >
                    {(customers as any[]).map((c: any) => (
                        <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
                    ))}
                </Select>
                <Select
                    placeholder="Filtrar por vendedor"
                    style={{ width: 200 }}
                    value={filterEmployee || undefined}
                    onChange={(v) => setFilterEmployee(v || null)}
                    allowClear
                    showSearch
                    optionFilterProp="children"
                >
                    {(employees as any[]).map((e: any) => (
                        <Select.Option key={e.user_id || e.id} value={e.user_id || e.id}>{e.name}</Select.Option>
                    ))}
                </Select>
                <Input
                    placeholder="Filtrar por orçamento (ex: ORC-ABC...)"
                    value={filterBudgetId}
                    onChange={(e) => setFilterBudgetId(e.target.value)}
                    style={{ width: 220 }}
                    allowClear
                />
                <Select
                    placeholder="Produto (compilação)"
                    style={{ width: 200 }}
                    value={filterProduct || undefined}
                    onChange={(v) => setFilterProduct(v || null)}
                    allowClear
                    showSearch
                    optionFilterProp="children"
                >
                    {(products as any[]).map((p: any) => (
                        <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                    ))}
                </Select>
                <Button icon={<UnorderedListOutlined />} onClick={handleOpenCompiled}>
                    Ver quantidade de produtos
                </Button>
            </Space>

            <div className="orders-table-wrap">
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredOrders}
                    loading={loading}
                    size="small"
                    scroll={{ x: 1300 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    locale={{ emptyText: <Empty description="Nenhum pedido em aberto" /> }}
                />
            </div>

            {/* Edit drawer */}
            <Drawer
                title={editingOrder ? `Editar pedido ${editingOrder.order_code}` : 'Editar pedido'}
                open={editDrawerOpen}
                onClose={() => {
                    setEditDrawerOpen(false)
                    setEditingOrder(null)
                    setOrderItems([])
                    editForm.resetFields()
                }}
                width={720}
                extra={
                    <Space>
                        <Button onClick={() => setEditDrawerOpen(false)}>Cancelar</Button>
                        <Button type="primary" loading={savingEdit} onClick={handleSaveEdit}>Salvar</Button>
                    </Space>
                }
            >
                <Form form={editForm} layout="vertical">
                    <Form.Item name="customer_id" label="Cliente" rules={[{ required: true, message: 'Cliente obrigatório' }]}>
                        <Select showSearch optionFilterProp="children" placeholder="Selecione o cliente">
                            {(customers as any[]).map((c: any) => (
                                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="employee_id" label="Vendedor">
                        <Select showSearch optionFilterProp="children" placeholder="Selecione o vendedor" allowClear>
                            {(employees as any[]).map((e: any) => (
                                <Select.Option key={e.user_id || e.id} value={e.user_id || e.id}>{e.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="payment_method" label="Forma de pagamento">
                        <Select placeholder="Selecione" allowClear>
                            {PAYMENT_METHODS.map((p) => (
                                <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="installments" label="Parcelas" initialValue={1}>
                        <InputNumber min={1} max={36} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="notes" label="Observações">
                        <Input.TextArea rows={2} maxLength={500} />
                    </Form.Item>
                </Form>

                <Divider>Itens do pedido</Divider>

                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    Adicione apenas produtos vinculados ao vendedor deste pedido.
                </Text>

                <Table
                    rowKey="key"
                    size="small"
                    pagination={false}
                    dataSource={orderItems}
                    columns={[
                        {
                            title: 'Produto',
                            key: 'product',
                            render: (_, row) => (
                                <Select
                                    showSearch
                                    optionFilterProp="children"
                                    placeholder="Selecione o produto"
                                    value={row.product_id || undefined}
                                    onChange={(v) => handleItemProductChange(row.key, v)}
                                    style={{ width: 220 }}
                                >
                                    {(products as any[])
                                        .filter((p: any) => {
                                            const empId = editForm.getFieldValue('employee_id')
                                            if (!empId) return true
                                            // Se produto tem commission_table vinculada ao vendedor, permitir; senão também permitir se não há restrição
                                            return true
                                        })
                                        .map((p: any) => (
                                            <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                                        ))}
                                </Select>
                            ),
                        },
                        {
                            title: 'Qtd',
                            key: 'quantity',
                            width: 90,
                            render: (_, row) => (
                                <InputNumber
                                    min={0}
                                    value={row.quantity}
                                    onChange={(v) => handleItemQtyChange(row.key, Number(v || 0))}
                                    style={{ width: 80 }}
                                />
                            ),
                        },
                        {
                            title: 'Valor unit.',
                            key: 'unit_price',
                            width: 120,
                            render: (_, row) => (
                                <InputNumber
                                    min={0}
                                    step={0.01}
                                    precision={2}
                                    value={row.unit_price}
                                    onChange={(v) => handleItemPriceChange(row.key, Number(v || 0))}
                                    style={{ width: 110 }}
                                    addonBefore="R$"
                                />
                            ),
                        },
                        {
                            title: 'Total',
                            key: 'total',
                            width: 110,
                            align: 'right',
                            render: (_, row) => <strong>{formatCurrency(row.total_price)}</strong>,
                        },
                        {
                            title: '',
                            key: 'actions',
                            width: 50,
                            render: (_, row) => (
                                <Button type="text" danger size="small" onClick={() => handleItemRemove(row.key)}>✕</Button>
                            ),
                        },
                    ]}
                />

                <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={handleAddProductToOrder}
                    style={{ marginTop: 12, width: '100%' }}
                >
                    Adicionar produto
                </Button>

                <div style={{ marginTop: 16, textAlign: 'right', fontSize: 14 }}>
                    Total: <strong>{formatCurrency(orderItems.reduce((s, it) => s + (it.total_price || 0), 0))}</strong>
                </div>
            </Drawer>

            {/* Send to Sale Modal */}
            <Modal
                title="Enviar pedido para Vendas?"
                open={sendToSaleOpen}
                onCancel={() => {
                    setSendToSaleOpen(false)
                    setSendingOrder(null)
                }}
                onOk={handleConfirmSendToSale}
                okText="Sim, enviar"
                cancelText="Não"
                confirmLoading={sendingToSale}
            >
                {sendingOrder && (
                    <div>
                        <p>
                            Você quer enviar este pedido para vendas?
                        </p>
                        <ul style={{ lineHeight: 1.8 }}>
                            <li><strong>Código:</strong> {sendingOrder.order_code}</li>
                            <li><strong>Cliente:</strong> {sendingOrder.customer_name}</li>
                            <li><strong>Valor total:</strong> {formatCurrency(sendingOrder.total_value)}</li>
                        </ul>
                        <Text type="secondary">
                            Uma venda será criada em status "Aguardando pagamento" com todo o histórico do pedido.
                        </Text>
                    </div>
                )}
            </Modal>

            {/* Compiled Products Drawer */}
            <Drawer
                title="Quantidade de produtos em pedidos abertos"
                open={compiledDrawerOpen}
                onClose={() => setCompiledDrawerOpen(false)}
                width={560}
                placement="right"
                extra={
                    <Button
                        icon={<FilePdfOutlined />}
                        size="small"
                        onClick={() => {
                            if (!compiledData.length) return
                            exportTableToPdf({
                                title: 'Produtos em Pedidos Abertos',
                                headers: ['Produto', 'Qtd Total', 'Pedidos'],
                                rows: compiledData.map(r => [r.product_name, String(r.total_qty), r.orders.join(', ')]),
                                filename: 'produtos-pedidos-abertos.pdf',
                            })
                        }}
                        disabled={!compiledData.length}
                    >
                        Exportar PDF
                    </Button>
                }
            >
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    Lista compilada de produtos somando as quantidades em todos os pedidos abertos.
                    Marque "Comprado" para controlar o que já foi adquirido. Pedidos pagos somem automaticamente.
                </Text>

                <Table
                    rowKey="product_id"
                    size="small"
                    loading={compiledLoading}
                    dataSource={compiledData}
                    pagination={false}
                    columns={[
                        {
                            title: 'Comprado',
                            key: 'purchased',
                            width: 80,
                            render: (_, row) => (
                                <Checkbox
                                    checked={!!purchaseTracking[row.product_id]}
                                    onChange={(e) => handleTogglePurchased(row.product_id, e.target.checked)}
                                />
                            ),
                        },
                        {
                            title: 'Produto',
                            dataIndex: 'product_name',
                            key: 'product_name',
                        },
                        {
                            title: 'Qtd total',
                            dataIndex: 'total_qty',
                            key: 'total_qty',
                            width: 90,
                            align: 'right',
                            render: (v: number) => <strong>{v}</strong>,
                        },
                        {
                            title: 'Pedidos',
                            dataIndex: 'orders',
                            key: 'orders',
                            render: (arr: string[]) => (
                                <Space wrap size={4}>
                                    {arr.slice(0, 5).map((c) => <Tag key={c} color="blue">{c}</Tag>)}
                                    {arr.length > 5 && <Text type="secondary">+{arr.length - 5}</Text>}
                                </Space>
                            ),
                        },
                    ]}
                    locale={{ emptyText: 'Nenhum produto compilado' }}
                />
            </Drawer>
        </Layout>
    )
}

export default OrdersPage
