import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
    App as AntdApp,
    Button, DatePicker, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag,
    message, Modal, Popconfirm, Empty, Checkbox, Divider, Typography,
} from 'antd'
import { CurrencyInput } from '@/components/currency-input.component'
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
import { getCurrentUserId } from '@/utils/get-tenant-id'
import dayjs from 'dayjs'

const { Text } = Typography

const formatCurrency = formatBRL

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    DRAFT: { color: 'default', label: 'Rascunho' },
    AWAITING_PAYMENT: { color: 'processing', label: 'Aguardando pagamento' },
    SENT_TO_SALE: { color: 'warning', label: 'Aguardando aprovação' },
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
    { value: 'CHEQUE_PRE_DATADO', label: '🗓️ Cheque Pré-datado' },
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
    budget_status?: string | null
    items_count?: number
}

// Editor de parcelas customizadas (datas + valores) — usado quando o método de pagamento
// é BOLETO ou CHEQUE_PRE_DATADO. Permite adicionar, editar e remover parcelas.
function OrderInstallmentsEditor({
    form,
    rows,
    onChange,
}: {
    form: any
    rows: { due_date: string; amount: number; sort_order: number }[]
    onChange: (rows: { due_date: string; amount: number; sort_order: number }[]) => void
}) {
    const paymentMethod = Form.useWatch('payment_method', form)
    const showEditor = paymentMethod === 'BOLETO' || paymentMethod === 'CHEQUE_PRE_DATADO'
    if (!showEditor && rows.length === 0) return null

    const updateRow = (idx: number, patch: Partial<{ due_date: string; amount: number }>) => {
        const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
        onChange(next)
    }
    const removeRow = (idx: number) => {
        onChange(rows.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sort_order: i })))
    }
    const addRow = () => {
        onChange([...rows, { due_date: '', amount: 0, sort_order: rows.length }])
    }

    return (
        <Form.Item label="Parcelas (vencimento e valor)" tooltip="Datas herdadas do orçamento. Edite se necessário — usado para BOLETO/CHEQUE PRÉ-DATADO.">
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
                {rows.map((r, idx) => (
                    <Space key={idx} style={{ display: 'flex', width: '100%' }} size={6}>
                        <Tag style={{ minWidth: 28, textAlign: 'center' }}>{idx + 1}</Tag>
                        <DatePicker
                            value={r.due_date ? dayjs(r.due_date) : null}
                            format="DD/MM/YYYY"
                            onChange={(d) => updateRow(idx, { due_date: d ? d.format('YYYY-MM-DD') : '' })}
                            style={{ width: 150 }}
                        />
                        <CurrencyInput
                            value={r.amount}
                            onChange={(v) => updateRow(idx, { amount: Number(v) || 0 })}
                            style={{ width: 150 }}
                        />
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeRow(idx)} />
                    </Space>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={addRow} block>
                    Adicionar parcela
                </Button>
            </Space>
        </Form.Item>
    )
}

// Resumo de totais do drawer de edição — observa o `discount_percent` no form em tempo real
// e mostra Subtotal (bruto), Desconto e Total final (= subtotal × (1 - desc/100)).
function OrderTotalsSummary({ form, items }: { form: any; items: OrderItemRow[] }) {
    const discountPct = Form.useWatch('discount_percent', form) ?? 0
    const subtotal = items.reduce((s, it) => s + (it.total_price || 0), 0)
    const pct = Math.max(0, Math.min(100, Number(discountPct) || 0))
    const discountAmount = subtotal * (pct / 100)
    const finalTotal = subtotal - discountAmount
    return (
        <div style={{ marginTop: 16, padding: 12, background: '#FAFAFA', borderRadius: 6, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#667085' }}>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
            </div>
            {pct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#EF4444' }}>
                    <span>Desconto ({pct.toLocaleString('pt-BR')}%)</span>
                    <span>− {formatCurrency(discountAmount)}</span>
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #E4E7EC', fontWeight: 700, fontSize: 16 }}>
                <span>Total</span>
                <span style={{ color: '#12B76A' }}>{formatCurrency(finalTotal)}</span>
            </div>
        </div>
    )
}

function OrdersPage() {
    const { modal: modalApi } = AntdApp.useApp()
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
    const [orderInstallmentRows, setOrderInstallmentRows] = useState<{ due_date: string; amount: number; sort_order: number }[]>([])
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
                    budgets!budget_id ( id, status ),
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
                budget_status: o.budgets?.status || null,
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
        // Abre o drawer ANTES de setar os valores no form — assim os Form.Items já estão
        // montados quando setFieldsValue roda (sem isso, valores se perdem).
        setEditDrawerOpen(true)
        const [items, instRowsResult] = await Promise.all([
            fetchOrderItems(order.id),
            (supabase as any)
                .from('order_installment_rows')
                .select('due_date, amount, sort_order')
                .eq('order_id', order.id)
                .order('sort_order'),
        ])
        setOrderItems(items)
        setOrderInstallmentRows(instRowsResult.data || [])
        // Defer 1 tick para garantir que o form está renderizado
        setTimeout(() => {
            editForm.setFieldsValue({
                customer_id: order.customer_id,
                employee_id: order.employee_id,
                payment_method: order.payment_method,
                installments: order.installments || 1,
                discount_percent: Number(order.discount_percent) || 0,
                notes: order.notes || '',
            })
        }, 0)
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

            const validItems = orderItems.filter((it) => it.product_id || it.service_id || it.manual_description)
            if (validItems.length === 0) {
                messageApi.warning('Adicione pelo menos um produto, serviço ou item ao pedido.')
                return
            }

            setSavingEdit(true)

            // grossSum é a soma bruta dos items (unit_price original × quantity).
            // O desconto % é aplicado em cima para chegar no total_value persistido.
            const grossSum = orderItems.reduce((s, it) => s + (it.total_price || 0), 0)
            const discountPct = Math.max(0, Math.min(100, Number(values.discount_percent) || 0))
            const totalValue = grossSum * (1 - discountPct / 100)

            const { error: upErr } = await (supabase as any)
                .from('orders')
                .update({
                    customer_id: values.customer_id,
                    employee_id: values.employee_id || null,
                    payment_method: values.payment_method || null,
                    installments: values.installments || 1,
                    notes: values.notes || null,
                    discount_percent: discountPct,
                    discount_value: grossSum - totalValue,
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

            // Persistir parcelas customizadas (cheque/boleto) — delete + reinsert
            await (supabase as any).from('order_installment_rows').delete().eq('order_id', editingOrder.id)
            const pm = values.payment_method
            if ((pm === 'BOLETO' || pm === 'CHEQUE_PRE_DATADO') && orderInstallmentRows.length > 0) {
                const validRows = orderInstallmentRows
                    .filter((r) => r.due_date && Number(r.amount) > 0)
                    .map((r, i) => ({
                        order_id: editingOrder.id,
                        due_date: r.due_date,
                        amount: Number(r.amount),
                        sort_order: i,
                    }))
                if (validRows.length > 0) {
                    await (supabase as any).from('order_installment_rows').insert(validRows)
                }
            }

            messageApi.success('Pedido atualizado com sucesso.')
            setEditDrawerOpen(false)
            setEditingOrder(null)
            setOrderItems([])
            setOrderInstallmentRows([])
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

    // Envia pedido para a fila de aprovação em /orcamentos (cria um orçamento espelho).
    // A venda definitiva só é gerada quando o usuário aprovar/finalizar pagamento naquela tela —
    // a partir daí o fluxo é idêntico ao orçamento (cash_entries, estoque, recorrência etc).
    const handleConfirmSendToSale = async () => {
        if (!sendingOrder || !tenantId) return
        setSendingToSale(true)
        try {
            const createdBy = currentUser?.uid ?? await getCurrentUserId()
            if (!createdBy) {
                messageApi.error('Sessão inválida. Faça login novamente.')
                return
            }

            const totalValue = Number(sendingOrder.total_value || 0)

            // Reenvio: se o pedido já foi enviado mas o orçamento espelho foi rejeitado/expirado/cancelado,
            // permitimos criar um novo orçamento espelho.
            const budgetBlockedStatuses = ['REJECTED', 'EXPIRED', 'CANCELLED']
            const isResend = sendingOrder.status === 'SENT_TO_SALE' && sendingOrder.budget_status
                ? budgetBlockedStatuses.includes(sendingOrder.budget_status)
                : false

            // Guard de concorrência
            const { data: orderCheck } = await (supabase as any)
                .from('orders')
                .select('id, status, budget_id, budgets!budget_id ( status )')
                .eq('id', sendingOrder.id)
                .single()
            const currentBudgetStatus = orderCheck?.budgets?.status || null
            const stillBlocked = currentBudgetStatus && budgetBlockedStatuses.includes(currentBudgetStatus)
            if ((orderCheck?.status === 'SENT_TO_SALE' && !stillBlocked) || orderCheck?.status === 'PAID') {
                messageApi.warning('Este pedido já foi enviado para aprovação por outra pessoa.')
                setSendToSaleOpen(false)
                await fetchOrders()
                return
            }

            const items = await fetchOrderItems(sendingOrder.id)

            // 1) Criar orçamento ESPELHO (status APPROVED — pronto para finalizar pagamento)
            const globalDiscountPct = Number(sendingOrder.discount_percent) || 0
            const orderNotes = sendingOrder.notes ? ` — ${sendingOrder.notes}` : ''
            const { data: newBudget, error: budgetErr } = await (supabase as any)
                .from('budgets')
                .insert({
                    tenant_id: tenantId,
                    created_by: createdBy,
                    customer_id: sendingOrder.customer_id,
                    employee_id: sendingOrder.employee_id || null,
                    status: 'APPROVED',
                    total_value: totalValue,
                    payment_method: sendingOrder.payment_method || null,
                    installments: sendingOrder.installments || 1,
                    discount_mode: sendingOrder.discount_mode || null,
                    global_discount_percent: globalDiscountPct,
                    installment_preset: (sendingOrder.payment_method === 'BOLETO' || sendingOrder.payment_method === 'CHEQUE_PRE_DATADO') ? 'customizado' : null,
                    notes: `Originado do pedido ${sendingOrder.order_code}${orderNotes}`,
                })
                .select('id')
                .single()

            if (budgetErr) throw budgetErr

            // 2) Copiar items do pedido para budget_items — mantém unit_price original.
            // O desconto fica em budgets.global_discount_percent (lido acima) e o
            // total_value já reflete o valor com desconto aplicado.
            if (items.length > 0) {
                const budgetItems = items.map((it) => ({
                    budget_id: newBudget.id,
                    product_id: it.product_id || null,
                    service_id: it.service_id || null,
                    manual_description: it.manual_description || null,
                    quantity: it.quantity || 0,
                    unit_price: it.unit_price || 0,
                    discount_percent: 0,
                    discount: 0,
                }))
                await (supabase as any).from('budget_items').insert(budgetItems)
            }

            // 3) Copiar parcelas customizadas (cheque/boleto) — order_installment_rows → budget_installment_rows
            const { data: orderInstRows } = await (supabase as any)
                .from('order_installment_rows')
                .select('due_date, amount, sort_order')
                .eq('order_id', sendingOrder.id)
                .order('sort_order')

            if (orderInstRows && orderInstRows.length > 0) {
                await (supabase as any).from('budget_installment_rows').insert(
                    orderInstRows.map((r: any) => ({
                        budget_id: newBudget.id,
                        due_date: r.due_date,
                        amount: r.amount,
                        sort_order: r.sort_order,
                    }))
                )
            }

            // 4) Atualizar pedido (vincula ao novo orçamento via budget_id, status SENT_TO_SALE).
            // Em reenvio, o pedido já está em SENT_TO_SALE — então o guard .neq não se aplica;
            // a validação de concorrência já foi feita acima via stillBlocked.
            const updateQuery = (supabase as any)
                .from('orders')
                .update({
                    status: 'SENT_TO_SALE',
                    budget_id: newBudget.id,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', sendingOrder.id)
            if (!isResend) {
                updateQuery.neq('status', 'SENT_TO_SALE')
            }
            const { data: updatedOrder } = await updateQuery.select('id').single()

            if (!updatedOrder) {
                // Rollback: outra pessoa enviou o mesmo pedido antes
                await (supabase as any).from('budget_items').delete().eq('budget_id', newBudget.id)
                await (supabase as any).from('budget_installment_rows').delete().eq('budget_id', newBudget.id)
                await (supabase as any).from('budgets').delete().eq('id', newBudget.id)
                messageApi.warning('Este pedido já foi enviado por outra pessoa. Nenhuma alteração foi mantida.')
                setSendToSaleOpen(false)
                await fetchOrders()
                return
            }

            messageApi.success('Pedido enviado para aprovação! Acesse a aba Orçamentos para finalizar o pagamento.')
            setSendToSaleOpen(false)
            setSendingOrder(null)
            await fetchOrders()
        } catch (err: any) {
            console.error(err)
            messageApi.error('Erro ao enviar para aprovação: ' + (err?.message || 'desconhecido'))
        } finally {
            setSendingToSale(false)
        }
    }

    const handleDelete = async (orderId: string) => {
        try {
            const res = await fetch('/api/delete/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId }),
            })
            const result = await res.json()
            if (res.status === 409) {
                modalApi.warning({
                    title: 'Não é possível excluir',
                    content: result.error || 'A venda vinculada já recebeu pagamento.',
                })
                return
            }
            if (!res.ok) throw new Error(result.error || 'Erro ao excluir')
            const aff = result.affected || {}
            const parts = ['Pedido excluído.']
            if (aff.sale_cancelled) parts.push('Venda cancelada (estoque/caixa estornados).')
            if (aff.original_budget_reopened) parts.push('Orçamento original reaberto para edição.')
            messageApi.success(parts.join(' '))
            fetchOrders()
        } catch (err: any) {
            messageApi.error('Erro ao excluir: ' + (err?.message || 'desconhecido'))
        }
    }

    // Pré-busca venda vinculada e abre modal contextual antes de excluir
    const confirmDeleteOrder = async (record: any) => {
        console.log('[Excluir pedido] click', record?.id)
        try {
            let saleInfo: any = null
            if (record.sale_id) {
                const { data: sale } = await (supabase as any)
                    .from('sales')
                    .select('id, sale_code, final_value, is_active')
                    .eq('id', record.sale_id)
                    .maybeSingle()
                if (sale && sale.is_active) saleInfo = sale
            }
            const cascadeMsg: string[] = []
            if (saleInfo) {
                cascadeMsg.push(`Venda ${saleInfo.sale_code || ''} será cancelada e estoque/caixa serão estornados.`)
            } else if (record.status === 'SENT_TO_SALE') {
                cascadeMsg.push('Orçamento espelho (aguardando aprovação) será removido.')
            }
            cascadeMsg.push('Orçamento original voltará para edição (rascunho).')
            modalApi.confirm({
                title: saleInfo ? 'Excluir pedido (cancela venda)' : 'Excluir pedido?',
                content: (
                    <div>
                        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                            {cascadeMsg.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                        <p style={{ marginTop: 12, color: '#dc2626', fontWeight: 500 }}>
                            Esta ação não pode ser desfeita.
                        </p>
                    </div>
                ),
                okText: 'Sim, excluir',
                cancelText: 'Cancelar',
                okButtonProps: { danger: true },
                width: 480,
                onOk: () => handleDelete(record.id),
            })
        } catch (e: any) {
            messageApi.error('Erro ao verificar vínculos: ' + (e?.message || ''))
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
            width: 120,
            ellipsis: true,
            render: (v: string) => <Tag color="blue">{v}</Tag>,
        },
        {
            title: 'Cliente',
            dataIndex: 'customer_name',
            key: 'customer_name',
            ellipsis: true,
            sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
        },
        {
            title: 'Vendedor',
            dataIndex: 'employee_name',
            key: 'employee_name',
            ellipsis: true,
            responsive: ['md'],
            sorter: (a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 160,
            ellipsis: true,
            render: (s: string) => {
                const cfg = STATUS_CONFIG[s] || { color: 'default', label: s }
                return <Tag color={cfg.color}>{cfg.label}</Tag>
            },
        },
        {
            title: 'Valor total',
            dataIndex: 'total_value',
            key: 'total_value',
            width: 130,
            align: 'right',
            render: (v: number) => <strong>{formatCurrency(v)}</strong>,
            sorter: (a, b) => (a.total_value || 0) - (b.total_value || 0),
        },
        {
            title: 'Pagamento',
            dataIndex: 'payment_method',
            key: 'payment_method',
            width: 150,
            ellipsis: true,
            responsive: ['lg'],
            render: (v: string) => {
                const pm = PAYMENT_METHODS.find((p) => p.value === v)
                return pm ? <Tag>{pm.label}</Tag> : '—'
            },
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 170,
            align: 'center',
            render: (_, record) => {
                // Pedido é "editável/reenviável" quando ainda não foi para venda OU
                // quando o orçamento espelho foi rejeitado/expirado/cancelado.
                const budgetBlocked = record.budget_status && ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(record.budget_status)
                const canModify = record.status !== 'SENT_TO_SALE' || budgetBlocked
                return (
                <Space direction="vertical" size={2}>
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        disabled={!canEditOrders || !canModify}
                    >
                        Editar
                    </Button>
                    {(record.status === 'DRAFT' || record.status === 'AWAITING_PAYMENT' || (record.status === 'SENT_TO_SALE' && budgetBlocked)) && (
                        <Button
                            type="link"
                            size="small"
                            icon={<ShoppingCartOutlined />}
                            style={{ color: '#12B76A' }}
                            onClick={() => handleOpenSendToSale(record)}
                            disabled={!canEditOrders}
                        >
                            Enviar para Aprovação
                        </Button>
                    )}
                    {record.status !== 'CANCELLED' && (
                        <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={!canEditOrders}
                            onClick={() => confirmDeleteOrder(record)}
                        >
                            Excluir
                        </Button>
                    )}
                </Space>
                )
            },
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
                    tableLayout="fixed"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    locale={{ emptyText: <Empty description="Nenhum pedido em aberto" /> }}
                />
            </div>

            {/* Edit drawer */}
            <Drawer
                title={editingOrder ? `Editar pedido ${editingOrder.order_code}` : 'Editar pedido'}
                open={editDrawerOpen}
                forceRender
                destroyOnClose={false}
                onClose={() => {
                    setEditDrawerOpen(false)
                    setEditingOrder(null)
                    setOrderItems([])
                    setOrderInstallmentRows([])
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
                    <Form.Item
                        name="discount_percent"
                        label="Desconto (%)"
                        initialValue={0}
                        tooltip="Desconto herdado do orçamento. Edite aqui se quiser ajustar — o valor total será recalculado e propagado para a venda."
                    >
                        <InputNumber
                            min={0}
                            max={100}
                            precision={2}
                            step={0.5}
                            style={{ width: '100%' }}
                            formatter={(v) => `${v ?? 0}%`}
                            parser={(v) => Number(String(v).replace('%', '')) as 0}
                        />
                    </Form.Item>
                    <OrderInstallmentsEditor
                        form={editForm}
                        rows={orderInstallmentRows}
                        onChange={setOrderInstallmentRows}
                    />
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
                            width: 170,
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
                            width: 140,
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

                <OrderTotalsSummary form={editForm} items={orderItems} />
            </Drawer>

            {/* Send to Sale Modal */}
            <Modal
                title="Enviar pedido para Aprovação?"
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
                            Você quer enviar este pedido para aprovação?
                        </p>
                        <ul style={{ lineHeight: 1.8 }}>
                            <li><strong>Código:</strong> {sendingOrder.order_code}</li>
                            <li><strong>Cliente:</strong> {sendingOrder.customer_name}</li>
                            <li><strong>Valor total:</strong> {formatCurrency(sendingOrder.total_value)}</li>
                        </ul>
                        <Text type="secondary">
                            Um orçamento será criado em <strong>Orçamentos</strong> com todas as condições do pedido (método de pagamento, parcelas, desconto). A venda só é finalizada quando você clicar em "Finalizar Pagamento" lá — aí o valor cai no fluxo de caixa.
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
                            const totalQty = compiledData.reduce((s, r) => s + r.total_qty, 0)
                            const totalProducts = compiledData.length
                            const totalOrders = new Set(compiledData.flatMap(r => r.orders)).size
                            const rows: (string | number)[][] = compiledData.map(r => [r.product_name, String(r.total_qty), r.orders.join(', ')])
                            rows.push(['TOTAL', String(totalQty), ''])
                            exportTableToPdf({
                                title: 'Produtos em Pedidos Abertos',
                                headers: ['Produto', 'Qtd Total', 'Pedidos'],
                                rows,
                                filename: 'produtos-pedidos-abertos.pdf',
                                kpis: [
                                    { label: 'Produtos Únicos', value: String(totalProducts) },
                                    { label: 'Quantidade Total', value: String(totalQty) },
                                    { label: 'Pedidos Envolvidos', value: String(totalOrders) },
                                ],
                                highlightLastRow: true,
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
