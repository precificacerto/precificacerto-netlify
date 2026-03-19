import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button, Drawer, Form, Input, Select, Space, Table, Tag, Tabs, message, InputNumber, Empty, Checkbox, Radio, Tooltip, DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { getCurrentUserId } from '@/utils/get-tenant-id'
import type { StockRecord } from '@/supabase/types'
import { useStock, useItems, useProducts, useEmployees } from '@/hooks/use-data.hooks'
import { useAuth } from '@/hooks/use-auth.hook'
import {
    DatabaseOutlined,
    WarningOutlined,
    DollarOutlined,
    SwapOutlined,
    SearchOutlined,
    InboxOutlined,
    ShoppingOutlined,
    CustomerServiceOutlined,
    BarChartOutlined,
    FilterOutlined,
    ReloadOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import dayjs from 'dayjs'

interface StockRow {
    id: string
    name: string
    type: 'ITEM' | 'PRODUCT'
    currentQty: number
    minQty: number
    unit: string
    costPrice: number
    status: string
    raw: StockRecord
}

interface ServiceRow {
    id: string
    name: string
    description?: string
    duration: number
    cost: number
    price: number
    status: string
    quantity: number
    minQuantity: number
    stockStatus: string
}

interface ABCReportRow {
    position: number
    productId: string
    productName: string
    qtdSold: number
    totalRevenue: number
    totalCost: number
    profitMargin: number
    marginPercent: number
    curve: 'A' | 'B' | 'C'
    employeeName: string
}

const { RangePicker } = DatePicker

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function deriveStatus(qty: number, minLimit: number): string {
    if (qty <= 0) return 'Crítico'
    if (minLimit > 0 && qty < minLimit) return 'Baixo'
    return 'Normal'
}

/** Quantidade de serviços que podem ser feitos com o estoque atual dos itens (espelha a lógica da aba Serviços). */
function calcServicesPossibleFromItems(svc: { service_items?: Array<{ item?: { quantity?: number | null }; quantity?: number }> }): number | null {
    const items = svc.service_items || []
    if (items.length === 0) return null
    let minServices: number | null = null
    for (const si of items) {
        const itemQty = Number(si.item?.quantity) ?? 0
        const neededPerService = Number(si.quantity) || 0
        if (neededPerService <= 0) continue
        const servicesFromThisItem = Math.floor(itemQty / neededPerService)
        if (minServices === null || servicesFromThisItem < minServices) minServices = servicesFromThisItem
    }
    return minServices
}

const statusColors: Record<string, string> = {
    Normal: 'success',
    Baixo: 'warning',
    Crítico: 'error',
}

function Stock() {
    const { data: rawStock, isLoading, mutate: reloadStock } = useStock()
    const { data: rawProducts } = useProducts()
    const { mutate: reloadItems } = useItems()
    const { tenantId, currentUser } = useAuth()
    const effectiveTenantId = tenantId ?? currentUser?.tenant_id
    const [movementDrawerOpen, setMovementDrawerOpen] = useState(false)
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [deleteQtyDrawerOpen, setDeleteQtyDrawerOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<StockRow | null>(null)
    const [deleteQtyForm] = Form.useForm()
    const [searchText, setSearchText] = useState('')
    const [stockFilter, setStockFilter] = useState<'all' | 'below'>('all')
    const [activeTab, setActiveTab] = useState<'ITEM' | 'PRODUCT' | 'SERVICE' | 'ABC_REPORT'>('ITEM')
    const [servicesList, setServicesList] = useState<ServiceRow[]>([])
    const [loadingServices, setLoadingServices] = useState(false)
    const [totalMovements, setTotalMovements] = useState(0)
    const [movementForm] = Form.useForm()
    const [editForm] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()

    // ABC Report state
    const { data: employees = [] } = useEmployees()
    const [abcData, setAbcData] = useState<ABCReportRow[]>([])
    const [abcLoading, setAbcLoading] = useState(false)
    const [abcDateRange, setAbcDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ])
    const [abcEmployeeFilter, setAbcEmployeeFilter] = useState<string | undefined>(undefined)
    const [abcProductFilter, setAbcProductFilter] = useState<string | undefined>(undefined)

    useEffect(() => {
        async function fetchMovements() {
            const now = new Date()
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
            const { count } = await supabase
                .from('stock_movements')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfMonth)
            setTotalMovements(count ?? 0)
        }
        fetchMovements()
    }, [])

    // Garantir que todo produto cadastrado tenha registro em Produtos acabados (stock PRODUCT)
    useEffect(() => {
        if (!effectiveTenantId || !rawStock || !rawProducts) return
        const productIdsWithStock = new Set(
            (rawStock as any[]).filter((s: any) => s.product_id).map((s: any) => s.product_id)
        )
        const productsWithoutStock = (rawProducts as any[]).filter((p: any) => !productIdsWithStock.has(p.id))
        if (productsWithoutStock.length === 0) return
        let created = false
        ;(async () => {
            for (const product of productsWithoutStock) {
                let qty = Number(product.yield_quantity) || 0
                if (product.base_item_id) {
                    const { data: item } = await supabase
                        .from('items')
                        .select('quantity')
                        .eq('id', product.base_item_id)
                        .maybeSingle()
                    if (item) qty = Number(item.quantity) || 0
                }
                const { error } = await supabase.from('stock').insert({
                    tenant_id: effectiveTenantId,
                    product_id: product.id,
                    stock_type: 'PRODUCT',
                    quantity_current: qty,
                    min_limit: 0,
                    unit: product.unit || product.yield_unit || 'UN',
                })
                if (!error) created = true
            }
            if (created) reloadStock()
        })()
    }, [effectiveTenantId, rawStock, rawProducts, reloadStock])

    useEffect(() => {
        if (activeTab !== 'SERVICE') return
        setLoadingServices(true)
        supabase
            .from('services')
            .select('id, name, description, estimated_duration_minutes, cost_total, base_price, status, min_quantity, service_items(*, item:items(id, quantity))')
            .order('name')
            .then((svcRes) => {
                if (svcRes.error) return
                setServicesList((svcRes.data || []).map((s: any) => {
                    const possible = calcServicesPossibleFromItems(s)
                    const qty = possible != null ? possible : 0
                    const minQty = Number(s.min_quantity) || 0
                    const stockStatus = deriveStatus(qty, minQty)
                    return {
                        id: s.id,
                        name: s.name,
                        description: s.description,
                        duration: Number(s.estimated_duration_minutes) || 0,
                        cost: Number(s.cost_total) || 0,
                        price: Number(s.base_price) || 0,
                        status: s.status === 'ACTIVE' ? 'Ativo' : 'Inativo',
                        quantity: qty,
                        minQuantity: minQty,
                        stockStatus,
                    }
                }))
            })
            .finally(() => setLoadingServices(false))
    }, [activeTab])

    // ABC Report — fetch sales data and compute ABC curve
    const fetchAbcReport = useCallback(async () => {
        setAbcLoading(true)
        try {
            if (!effectiveTenantId) { setAbcLoading(false); return }
            const startDate = abcDateRange[0].startOf('day').toISOString()
            const endDate = abcDateRange[1].endOf('day').toISOString()

            // Strategy: Query paid budgets in date range, then get their budget_items
            // budgets.status = 'PAID' means a completed sale
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let budgetsQuery: any = (supabase
                .from('budgets') as any)
                .select('id, employee_id, created_at')
                .eq('tenant_id', effectiveTenantId)
                .eq('status', 'PAID')
                .eq('is_active', true)
                .gte('created_at', startDate)
                .lte('created_at', endDate)

            if (abcEmployeeFilter) {
                budgetsQuery = budgetsQuery.eq('employee_id', abcEmployeeFilter)
            }

            const { data: budgets, error: budgetsErr } = await budgetsQuery as { data: any[] | null; error: any }
            if (budgetsErr) throw budgetsErr
            if (!budgets || budgets.length === 0) {
                setAbcData([])
                setAbcLoading(false)
                return
            }

            const budgetIds = budgets.map((b: any) => b.id)
            const employeeMap = new Map<string, string>()
            budgets.forEach((b: any) => {
                if (b.employee_id) {
                    const emp = (employees as any[]).find((e: any) => e.id === b.employee_id)
                    employeeMap.set(b.id, emp?.name || 'Desconhecido')
                } else {
                    employeeMap.set(b.id, 'Sem vendedor')
                }
            })

            // Fetch budget_items for these budgets with product info
            let itemsQuery = supabase
                .from('budget_items')
                .select('budget_id, product_id, quantity, unit_price, discount, product:products(id, name, cost_total)')
                .in('budget_id', budgetIds)

            if (abcProductFilter) {
                itemsQuery = itemsQuery.eq('product_id', abcProductFilter)
            }

            const { data: items, error: itemsErr } = await itemsQuery
            if (itemsErr) throw itemsErr

            // Aggregate by product
            const productAgg = new Map<string, {
                productId: string
                productName: string
                qtdSold: number
                totalRevenue: number
                totalCost: number
                employees: Set<string>
            }>()

            for (const item of (items || [])) {
                const product = (item as any).product
                if (!product) continue
                const productId = product.id
                const productName = product.name || 'Sem nome'
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unit_price) || 0
                const discount = Number(item.discount) || 0
                const revenue = (unitPrice * qty) - discount
                const costPerUnit = Number(product.cost_total) || 0
                const totalCost = costPerUnit * qty

                const existing = productAgg.get(productId)
                const empName = employeeMap.get(item.budget_id) || 'Sem vendedor'

                if (existing) {
                    existing.qtdSold += qty
                    existing.totalRevenue += revenue
                    existing.totalCost += totalCost
                    existing.employees.add(empName)
                } else {
                    productAgg.set(productId, {
                        productId,
                        productName,
                        qtdSold: qty,
                        totalRevenue: revenue,
                        totalCost: totalCost,
                        employees: new Set([empName]),
                    })
                }
            }

            // Sort by revenue descending for ABC classification
            const sorted = Array.from(productAgg.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
            const grandTotal = sorted.reduce((sum, p) => sum + p.totalRevenue, 0)

            let cumulative = 0
            const rows: ABCReportRow[] = sorted.map((p, idx) => {
                cumulative += p.totalRevenue
                const cumulativePercent = grandTotal > 0 ? (cumulative / grandTotal) * 100 : 0
                let curve: 'A' | 'B' | 'C' = 'C'
                if (cumulativePercent <= 80) curve = 'A'
                else if (cumulativePercent <= 95) curve = 'B'

                const profitMargin = p.totalRevenue - p.totalCost
                const marginPercent = p.totalRevenue > 0 ? (profitMargin / p.totalRevenue) * 100 : 0

                return {
                    position: idx + 1,
                    productId: p.productId,
                    productName: p.productName,
                    qtdSold: p.qtdSold,
                    totalRevenue: p.totalRevenue,
                    totalCost: p.totalCost,
                    profitMargin,
                    marginPercent,
                    curve,
                    employeeName: Array.from(p.employees).join(', '),
                }
            })

            setAbcData(rows)
        } catch (error: any) {
            messageApi.error('Erro ao carregar relatório ABC: ' + (error.message || 'Erro desconhecido'))
        } finally {
            setAbcLoading(false)
        }
    }, [abcDateRange, abcEmployeeFilter, abcProductFilter, employees, messageApi])

    useEffect(() => {
        if (activeTab === 'ABC_REPORT') {
            fetchAbcReport()
        }
    }, [activeTab, fetchAbcReport])

    // ABC KPIs
    const abcTotalRevenue = useMemo(() => abcData.reduce((sum, r) => sum + r.totalRevenue, 0), [abcData])
    const abcTotalProducts = abcData.length
    const abcAvgMargin = useMemo(() => {
        if (abcData.length === 0) return 0
        return abcData.reduce((sum, r) => sum + r.marginPercent, 0) / abcData.length
    }, [abcData])

    // ABC columns
    const abcColumns: ColumnsType<ABCReportRow> = [
        {
            title: 'Pos.',
            dataIndex: 'position',
            key: 'position',
            width: 60,
            align: 'center',
            render: (v: number) => <strong>{v}</strong>,
        },
        {
            title: 'Produto',
            dataIndex: 'productName',
            key: 'productName',
            sorter: (a, b) => a.productName.localeCompare(b.productName),
            render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
        },
        {
            title: 'Qtd Vendida',
            dataIndex: 'qtdSold',
            key: 'qtdSold',
            width: 110,
            align: 'right',
            sorter: (a, b) => a.qtdSold - b.qtdSold,
            render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
        },
        {
            title: 'Receita Total',
            dataIndex: 'totalRevenue',
            key: 'totalRevenue',
            width: 140,
            align: 'right',
            sorter: (a, b) => a.totalRevenue - b.totalRevenue,
            render: (v: number) => <span style={{ color: '#4ade80', fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
        {
            title: 'Custo Total',
            dataIndex: 'totalCost',
            key: 'totalCost',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.totalCost - b.totalCost,
            render: (v: number) => formatCurrency(v),
        },
        {
            title: 'Margem (R$)',
            dataIndex: 'profitMargin',
            key: 'profitMargin',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.profitMargin - b.profitMargin,
            render: (v: number) => (
                <span style={{ color: v >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {formatCurrency(v)}
                </span>
            ),
        },
        {
            title: 'Margem %',
            dataIndex: 'marginPercent',
            key: 'marginPercent',
            width: 100,
            align: 'right',
            sorter: (a, b) => a.marginPercent - b.marginPercent,
            render: (v: number) => (
                <span style={{ color: v >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {v.toFixed(1)}%
                </span>
            ),
        },
        {
            title: 'Curva',
            dataIndex: 'curve',
            key: 'curve',
            width: 80,
            align: 'center',
            filters: [
                { text: 'A', value: 'A' },
                { text: 'B', value: 'B' },
                { text: 'C', value: 'C' },
            ],
            onFilter: (value, record) => record.curve === value,
            render: (curve: 'A' | 'B' | 'C') => {
                const colors = { A: 'green', B: 'orange', C: 'red' }
                return <Tag color={colors[curve]} style={{ fontWeight: 700, fontSize: 14 }}>{curve}</Tag>
            },
        },
        {
            title: 'Vendedor',
            dataIndex: 'employeeName',
            key: 'employeeName',
            width: 160,
            ellipsis: true,
        },
    ]

    // Products list for the ABC filter dropdown
    const allProducts = useMemo(() => {
        return (rawProducts || []).map((p: any) => ({ value: p.id, label: p.name }))
    }, [rawProducts])

    const stockRows = useMemo<StockRow[]>(() => {
        return (rawStock || []).map((s: StockRecord) => {
            const item = s.items
            const product = s.products
            const name = item?.name || product?.name || 'Sem nome'
            const itemQty = Number(item?.quantity) || 1
            const itemTotalCost = Number(item?.cost_price) || 0
            const costPrice = item
              ? (item.cost_per_base_unit != null && item.cost_per_base_unit !== ''
                ? Number(item.cost_per_base_unit)
                : itemQty > 0 ? itemTotalCost / itemQty : itemTotalCost)
              : (product?.cost_total ?? 0)
            const unit = (s.unit || item?.unit || product?.unit || 'UN') as string
            const type = s.stock_type === 'PRODUCT' ? 'PRODUCT' : 'ITEM'

            return {
                id: s.id,
                name,
                type,
                currentQty: s.quantity_current ?? 0,
                minQty: s.min_limit ?? 0,
                unit,
                costPrice,
                status: deriveStatus(s.quantity_current ?? 0, s.min_limit ?? 0),
                raw: s,
            }
        })
    }, [rawStock])

    const { canView, canEdit } = usePermissions()
    if (!canView(MODULES.STOCK)) {
        return <Layout title={PAGE_TITLES.STOCK}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    // Filtrar por aba, busca e status (todos / abaixo do estoque)
    const filteredByTabAndSearch = useMemo(() => {
        const byTab = activeTab === 'SERVICE'
            ? ([] as (StockRow | ServiceRow)[])
            : stockRows.filter(i => i.type === activeTab)
        if (activeTab === 'SERVICE') return byTab
        const s = searchText.toLowerCase()
        return byTab.filter((i: StockRow) => i.name.toLowerCase().includes(s))
    }, [activeTab, searchText, stockRows])

    const filteredData = useMemo(() => {
        if (activeTab === 'SERVICE') return []
        const list = filteredByTabAndSearch as StockRow[]
        if (stockFilter === 'below') return list.filter(i => i.status === 'Baixo' || i.status === 'Crítico')
        return list
    }, [activeTab, stockFilter, filteredByTabAndSearch])

    const filteredServiceData = useMemo(() => {
        if (activeTab !== 'SERVICE') return []
        let list = servicesList.filter(svc => svc.name.toLowerCase().includes(searchText.toLowerCase()))
        if (stockFilter === 'below') list = list.filter(svc => svc.stockStatus === 'Baixo' || svc.stockStatus === 'Crítico')
        return list
    }, [activeTab, searchText, stockFilter, servicesList])

    // KPIs (total e baixo estoque da aba atual)
    const tabData = activeTab === 'SERVICE' ? filteredServiceData : filteredData
    const totalItems = activeTab === 'SERVICE'
        ? servicesList.length
        : stockRows.filter(i => i.type === activeTab).length
    const lowStockItems = activeTab === 'SERVICE'
        ? servicesList.filter((s: ServiceRow) => s.stockStatus === 'Baixo' || s.stockStatus === 'Crítico').length
        : stockRows.filter(i => i.type === activeTab).filter(i => i.status === 'Baixo' || i.status === 'Crítico').length
    const totalValue = activeTab === 'SERVICE'
        ? 0
        : stockRows.filter(i => i.type === activeTab).reduce((sum: number, i: StockRow) => sum + (i.currentQty * i.costPrice), 0)
    const itemCount = stockRows.filter(i => i.type === 'ITEM').length
    const productCount = stockRows.filter(i => i.type === 'PRODUCT').length
    const serviceCount = servicesList.length

    const columns: ColumnsType<StockRow> = [
        {
            title: '',
            key: 'alert',
            width: 48,
            render: (_: unknown, r: StockRow) =>
                (r.status === 'Baixo' || r.status === 'Crítico') ? (
                    <Tooltip title="Estoque abaixo do mínimo permitido">
                        <WarningOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                    </Tooltip>
                ) : null,
        },
        {
            title: 'Nome',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
        },
        {
            title: 'Qtd Atual',
            dataIndex: 'currentQty',
            key: 'currentQty',
            sorter: (a, b) => a.currentQty - b.currentQty,
            render: (qty, record) => (
                <span style={{ fontWeight: 600, color: record.status === 'Crítico' ? 'var(--color-error)' : 'inherit' }}>
                    {qty} {record.unit}
                </span>
            ),
        },
        { title: 'Qtd Mín', dataIndex: 'minQty', key: 'minQty' },
        {
            title: 'Custo Unit.',
            dataIndex: 'costPrice',
            key: 'costPrice',
            render: (v) => formatCurrency(v),
        },
        {
            title: 'Valor Total',
            key: 'totalValue',
            render: (_, record) => formatCurrency(record.currentQty * record.costPrice),
            sorter: (a, b) => (a.currentQty * a.costPrice) - (b.currentQty * b.costPrice),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            filters: [
                { text: 'Normal', value: 'Normal' },
                { text: 'Baixo', value: 'Baixo' },
                { text: 'Crítico', value: 'Crítico' },
            ],
            onFilter: (value, record) => record.status === value,
            render: (status) => <Tag color={statusColors[status]}>{status}</Tag>,
        },
        ...(canEdit(MODULES.STOCK)
            ? [{
                title: 'Ações',
                key: 'action',
                width: 200,
                render: (_: unknown, record: StockRow) => (
                    <Space>
                        <Button type="link" size="small" onClick={() => handleMovement(record)}>Movimentar</Button>
                        <Button type="link" size="small" onClick={() => handleEdit(record)}>Editar</Button>
                        <Button type="link" size="small" danger onClick={() => handleOpenDeleteQty(record)}>Excluir quantidade</Button>
                    </Space>
                ),
            }]
            : []),
    ]

    function handleMovement(record: StockRow) {
        setSelectedItem(record)
        movementForm.resetFields()
        setMovementDrawerOpen(true)
    }

    function handleEdit(record: StockRow) {
        setSelectedItem(record)
        editForm.setFieldsValue({ minQty: record.minQty })
        setEditDrawerOpen(true)
    }

    function handleOpenDeleteQty(record: StockRow) {
        setSelectedItem(record)
        deleteQtyForm.resetFields()
        deleteQtyForm.setFieldsValue({
            scope: 'total',
            quantity: record.currentQty,
        })
        setDeleteQtyDrawerOpen(true)
    }

    async function handleConfirmDeleteQty() {
        if (!selectedItem) return
        try {
            const createdBy = await getCurrentUserId()
            if (!createdBy) {
                messageApi.error('Sessão inválida. Faça login novamente.')
                return
            }
            const values = await deleteQtyForm.validateFields()
            const qtyToRemove = values.scope === 'total'
                ? selectedItem.currentQty
                : Math.min(Number(values.quantity) || 0, selectedItem.currentQty)
            if (qtyToRemove <= 0) {
                messageApi.error('Informe uma quantidade válida para excluir.')
                return
            }
            if (qtyToRemove > selectedItem.currentQty) {
                messageApi.error(`Máximo permitido: ${selectedItem.currentQty} ${selectedItem.unit}.`)
                return
            }
            const newQty = Math.max(0, selectedItem.currentQty - qtyToRemove)
            await supabase
                .from('stock')
                .update({ quantity_current: newQty, updated_at: new Date().toISOString() })
                .eq('id', selectedItem.id)
            await supabase.from('stock_movements').insert({
                stock_id: selectedItem.id,
                delta_quantity: -qtyToRemove,
                reason: values.reason || 'Baixa de quantidade (exclusão parcial/total)',
                created_by: createdBy,
            })
            if (selectedItem.type === 'ITEM' && selectedItem.raw.item_id) {
                const { data: itemRow } = await supabase
                    .from('items')
                    .select('quantity')
                    .eq('id', selectedItem.raw.item_id)
                    .single()
                if (itemRow) {
                    const currentItemQty = Number(itemRow.quantity) || 0
                    const newItemQty = Math.max(0, currentItemQty - qtyToRemove)
                    const unitCost = selectedItem.costPrice || 0
                    const newCostTotal = newItemQty * unitCost
                    await supabase
                        .from('items')
                        .update({
                            quantity: newItemQty,
                            cost_price: newCostTotal,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', selectedItem.raw.item_id)
                }
            }
            messageApi.success(`Quantidade de ${qtyToRemove} ${selectedItem.unit} excluída.`)
            await Promise.all([reloadStock(), reloadItems()])
            setDeleteQtyDrawerOpen(false)
        } catch (error: any) {
            if (error?.errorFields) return
            messageApi.error('Erro ao excluir quantidade: ' + (error?.message || 'Preencha os campos.'))
        }
    }

    async function handleSaveEdit() {
        try {
            const values = await editForm.validateFields()
            if (!selectedItem) return
            const { error } = await supabase
                .from('stock')
                .update({ min_limit: values.minQty ?? 0, updated_at: new Date().toISOString() })
                .eq('id', selectedItem.id)
            if (error) throw error
            messageApi.success('Estoque atualizado!')
            await reloadStock()
            setEditDrawerOpen(false)
        } catch (error: any) {
            messageApi.error('Erro ao salvar: ' + (error.message || 'Preencha os campos.'))
        }
    }

    async function handleSaveMovement() {
        try {
            const values = await movementForm.validateFields()
            if (!selectedItem) return
            const createdBy = await getCurrentUserId()
            if (!createdBy) {
                messageApi.error('Sessão inválida. Faça login novamente.')
                return
            }

            if (values.type === 'entrada') {
                const qtyNew = Number(values.quantity) || 0
                const totalPaid = parseFloat(String(values.total_paid || '0').replace(/\./g, '').replace(',', '.')) || 0
                const discount = values.has_discount
                    ? parseFloat(String(values.discounted_value || '0').replace(/\./g, '').replace(',', '.')) || 0
                    : 0
                const effectiveValue = discount > 0 ? discount : totalPaid
                const unitCostNew = qtyNew > 0 ? effectiveValue / qtyNew : 0

                const qtyOld = selectedItem.currentQty
                const costOld = selectedItem.costPrice
                const newAvgCost = (qtyOld + qtyNew) > 0
                    ? (qtyOld * costOld + qtyNew * unitCostNew) / (qtyOld + qtyNew)
                    : unitCostNew
                const finalQty = qtyOld + qtyNew

                await supabase.from('stock')
                    .update({ quantity_current: finalQty, updated_at: new Date().toISOString() })
                    .eq('id', selectedItem.id)

                if (selectedItem.raw.item_id) {
                    await supabase.from('items')
                        .update({
                            quantity: finalQty,
                            cost_per_base_unit: newAvgCost,
                            cost_price: finalQty * newAvgCost,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', selectedItem.raw.item_id)
                }

                await supabase.from('stock_movements').insert({
                    stock_id: selectedItem.id,
                    delta_quantity: qtyNew,
                    reason: values.description || `Reabastecimento — ${formatCurrency(effectiveValue)} (custo médio: ${formatCurrency(newAvgCost)})`,
                    created_by: createdBy,
                })

                messageApi.success(`Entrada registrada! Novo custo médio: ${formatCurrency(newAvgCost)}`)
            } else {
                const delta = -Number(values.quantity)
                const newQty = Math.max(0, selectedItem.currentQty + delta)

                await supabase.from('stock_movements').insert({
                    stock_id: selectedItem.id,
                    delta_quantity: delta,
                    reason: values.description || null,
                    created_by: createdBy,
                })
                await supabase.from('stock')
                    .update({ quantity_current: newQty, updated_at: new Date().toISOString() })
                    .eq('id', selectedItem.id)

                if (selectedItem.type === 'ITEM' && selectedItem.raw.item_id) {
                    const unitCost = selectedItem.costPrice || 0
                    const newCostTotal = newQty * unitCost
                    await supabase
                        .from('items')
                        .update({
                            quantity: newQty,
                            cost_price: newCostTotal,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', selectedItem.raw.item_id)
                }

                messageApi.success('Saída registrada!')
            }

            await Promise.all([reloadStock(), reloadItems()])
            setMovementDrawerOpen(false)
        } catch (error: any) {
            messageApi.error('Erro na movimentação: ' + (error.message || 'Preencha os campos.'))
        }
    }

    return (
        <Layout title={PAGE_TITLES.STOCK} subtitle="Controle de estoque de itens e produtos acabados">
            {contextHolder}

            <div className="kpi-grid">
                <CardKPI title="Total no Estoque" value={totalItems} icon={<DatabaseOutlined />} variant="blue" />
                <CardKPI title="Itens Baixo Estoque" value={lowStockItems} icon={<WarningOutlined />} variant="red" />
                <CardKPI title="Valor em Estoque" value={formatCurrency(totalValue)} icon={<DollarOutlined />} variant="green" />
                <CardKPI title="Movimentações (mês)" value={totalMovements} icon={<SwapOutlined />} variant="orange" />
            </div>

            <div className="pc-card--table">
                <Tabs
                    activeKey={activeTab}
                    onChange={(k) => setActiveTab(k as 'ITEM' | 'PRODUCT' | 'SERVICE' | 'ABC_REPORT')}
                    items={[
                        {
                            key: 'ITEM',
                            label: (
                                <span><InboxOutlined style={{ marginRight: 6 }} />Itens / Insumos ({itemCount})</span>
                            ),
                        },
                        {
                            key: 'PRODUCT',
                            label: (
                                <span><ShoppingOutlined style={{ marginRight: 6 }} />Produtos Acabados ({productCount})</span>
                            ),
                        },
                        {
                            key: 'SERVICE',
                            label: (
                                <span><CustomerServiceOutlined style={{ marginRight: 6 }} />Produtos para Serviços ({serviceCount})</span>
                            ),
                        },
                        {
                            key: 'ABC_REPORT',
                            label: (
                                <span><BarChartOutlined style={{ marginRight: 6 }} />{'Relatório ABC'}</span>
                            ),
                        },
                    ]}
                />

                {activeTab !== 'ABC_REPORT' && (
                    <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                        <Input
                            placeholder="Buscar por nome..."
                            prefix={<SearchOutlined />}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            style={{ maxWidth: 360 }}
                            allowClear
                        />
                        <Select
                            value={stockFilter}
                            onChange={setStockFilter}
                            style={{ minWidth: 180 }}
                            options={[
                                { value: 'all', label: 'Todos' },
                                { value: 'below', label: 'Apenas abaixo do estoque' },
                            ]}
                        />
                    </div>
                )}

                {activeTab === 'ABC_REPORT' ? (
                    <div>
                        {/* ABC Report KPIs */}
                        <div className="kpi-grid" style={{ marginBottom: 20 }}>
                            <CardKPI title="Receita Total" value={formatCurrency(abcTotalRevenue)} icon={<DollarOutlined />} variant="green" />
                            <CardKPI title="Total Produtos" value={abcTotalProducts} icon={<ShoppingOutlined />} variant="blue" />
                            <CardKPI title={'Margem Média'} value={`${abcAvgMargin.toFixed(1)}%`} icon={<BarChartOutlined />} variant="orange" />
                        </div>

                        {/* ABC Report Filters */}
                        <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#94a3b8' }} />
                                <span style={{ color: '#94a3b8', fontSize: 13 }}>Filtros:</span>
                            </div>
                            <RangePicker
                                value={abcDateRange}
                                onChange={(dates) => {
                                    if (dates && dates[0] && dates[1]) {
                                        setAbcDateRange([dates[0], dates[1]])
                                    }
                                }}
                                format="DD/MM/YYYY"
                                allowClear={false}
                                style={{ minWidth: 260 }}
                            />
                            <Select
                                placeholder="Vendedor"
                                value={abcEmployeeFilter}
                                onChange={setAbcEmployeeFilter}
                                allowClear
                                style={{ minWidth: 200 }}
                                options={[
                                    ...(employees as any[]).map((e: any) => ({ value: e.id, label: e.name })),
                                ]}
                            />
                            <Select
                                placeholder="Produto"
                                value={abcProductFilter}
                                onChange={setAbcProductFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allProducts}
                            />
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchAbcReport}
                                loading={abcLoading}
                            >
                                Atualizar
                            </Button>
                        </div>

                        {/* ABC Report Table */}
                        <Table<ABCReportRow>
                            columns={abcColumns}
                            dataSource={abcData}
                            rowKey="productId"
                            pagination={{ pageSize: 20, showTotal: (t) => `${t} produtos` }}
                            size="middle"
                            loading={abcLoading}
                            scroll={{ x: 1000 }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Nenhuma venda encontrada no período selecionado. Ajuste os filtros ou registre vendas via orçamentos."
                                    />
                                ),
                            }}
                            summary={() => {
                                if (abcData.length === 0) return null
                                const totalRev = abcData.reduce((s, r) => s + r.totalRevenue, 0)
                                const totalCst = abcData.reduce((s, r) => s + r.totalCost, 0)
                                const totalProfit = totalRev - totalCst
                                const totalMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0
                                return (
                                    <Table.Summary fixed>
                                        <Table.Summary.Row style={{ fontWeight: 700 }}>
                                            <Table.Summary.Cell index={0} colSpan={2}>TOTAL</Table.Summary.Cell>
                                            <Table.Summary.Cell index={2} align="right">
                                                {abcData.reduce((s, r) => s + r.qtdSold, 0)}
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={3} align="right">
                                                <span style={{ color: '#4ade80' }}>{formatCurrency(totalRev)}</span>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={4} align="right">
                                                {formatCurrency(totalCst)}
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={5} align="right">
                                                <span style={{ color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}>
                                                    {formatCurrency(totalProfit)}
                                                </span>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={6} align="right">
                                                <span style={{ color: totalMargin >= 0 ? '#4ade80' : '#f87171' }}>
                                                    {totalMargin.toFixed(1)}%
                                                </span>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={7} colSpan={2} />
                                        </Table.Summary.Row>
                                    </Table.Summary>
                                )
                            }}
                        />
                    </div>
                ) : activeTab === 'SERVICE' ? (
                    <Table<ServiceRow>
                        columns={[
                            {
                                title: 'Nome',
                                dataIndex: 'name',
                                key: 'name',
                                sorter: (a, b) => a.name.localeCompare(b.name),
                                render: (name, r) => (
                                    <div>
                                        <span style={{ fontWeight: 500 }}>{name}</span>
                                        {r.description && <div style={{ fontSize: 12, color: '#94a3b8' }}>{r.description}</div>}
                                    </div>
                                ),
                            },
                            {
                                title: 'Duração',
                                dataIndex: 'duration',
                                key: 'duration',
                                width: 100,
                                render: (v: number) => v ? (v < 60 ? `${v} min` : `${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}min` : ''}`) : '—',
                            },
                            {
                                title: 'Qtd. estoque',
                                dataIndex: 'quantity',
                                key: 'quantity',
                                width: 120,
                                align: 'center',
                                render: (v: number, r: ServiceRow) => (
                                    <span style={{ fontWeight: 600, color: (r.stockStatus === 'Crítico' || r.stockStatus === 'Baixo') ? '#f59e0b' : '#e2e8f0' }}>
                                        {v != null ? `${v} ${v === 1 ? 'serviço' : 'serviços'}` : '—'}
                                    </span>
                                ),
                            },
                            {
                                title: 'Qtd. mínima',
                                dataIndex: 'minQuantity',
                                key: 'minQuantity',
                                width: 100,
                                align: 'center',
                                render: (v: number) => (v != null && v > 0 ? v : '—'),
                            },
                            {
                                title: 'Estoque',
                                key: 'stockStatus',
                                width: 120,
                                render: (_: any, r: ServiceRow) => {
                                    if (r.minQuantity <= 0) return '—'
                                    return <Tag color={statusColors[r.stockStatus] || 'default'}>{r.stockStatus}</Tag>
                                },
                            },
                            {
                                title: '',
                                key: 'alert',
                                width: 48,
                                render: (_: any, r: ServiceRow) =>
                                    (r.stockStatus === 'Baixo' || r.stockStatus === 'Crítico') ? (
                                        <Tooltip title="Estoque abaixo do mínimo permitido">
                                            <WarningOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                                        </Tooltip>
                                    ) : null,
                            },
                            {
                                title: 'Custo',
                                dataIndex: 'cost',
                                key: 'cost',
                                width: 120,
                                render: (v: number) => formatCurrency(v),
                            },
                            {
                                title: 'Preço Venda',
                                dataIndex: 'price',
                                key: 'price',
                                width: 130,
                                render: (v: number) => <span style={{ fontWeight: 600, color: '#4ade80' }}>{formatCurrency(v)}</span>,
                            },
                            {
                                title: 'Status',
                                dataIndex: 'status',
                                key: 'status',
                                width: 100,
                                render: (s: string) => <Tag color={s === 'Ativo' ? 'success' : 'default'}>{s}</Tag>,
                            },
                        ]}
                        dataSource={filteredServiceData}
                        rowKey="id"
                        rowClassName={(r: ServiceRow) => (r.stockStatus === 'Baixo' || r.stockStatus === 'Crítico') ? 'pc-row-low-stock' : ''}
                        pagination={{ pageSize: 10, showTotal: (t) => `${t} serviços` }}
                        size="middle"
                        loading={loadingServices}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Nenhum serviço cadastrado. Cadastre serviços na aba Serviços para que apareçam aqui."
                                />
                            ),
                        }}
                    />
                ) : (
                    <Table
                        columns={columns}
                        dataSource={filteredData}
                        rowKey="id"
                        rowClassName={(r) => (r.status === 'Baixo' || r.status === 'Crítico') ? 'pc-row-low-stock' : ''}
                        pagination={{ pageSize: 10, showTotal: (t) => `${t} itens` }}
                        size="middle"
                        loading={isLoading}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={
                                        activeTab === 'ITEM'
                                            ? 'Nenhum item no estoque. Cadastre itens na aba "Itens" para popular automaticamente.'
                                            : 'Nenhum produto acabado no estoque. Registre uma produção para criar estoque de produtos.'
                                    }
                                />
                            ),
                        }}
                    />
                )}
            </div>

            {/* Drawer — Editar estoque mínimo */}
            <Drawer
                title={`Editar: ${selectedItem?.name || ''}`}
                width={380}
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                extra={<Space><Button onClick={() => setEditDrawerOpen(false)}>Cancelar</Button><Button onClick={handleSaveEdit} type="primary">Salvar</Button></Space>}
            >
                <Form form={editForm} layout="vertical">
                    <div style={{ padding: 12, background: 'var(--color-neutral-50)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                        <div>Estoque atual: <strong>{selectedItem?.currentQty} {selectedItem?.unit}</strong></div>
                        <div>Custo unitário: <strong>{formatCurrency(selectedItem?.costPrice || 0)}</strong></div>
                    </div>
                    <Form.Item name="minQty" label="Quantidade Mínima (alerta)" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                </Form>
            </Drawer>

            {/* Drawer — Movimentação */}
            <Drawer
                title={`Movimentar: ${selectedItem?.name || ''}`}
                width={420}
                open={movementDrawerOpen}
                onClose={() => setMovementDrawerOpen(false)}
                extra={<Space><Button onClick={() => setMovementDrawerOpen(false)}>Cancelar</Button><Button onClick={handleSaveMovement} type="primary">Registrar</Button></Space>}
            >
                {selectedItem && (
                    <div style={{ padding: 12, background: 'var(--color-neutral-50)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                        <div>Estoque atual: <strong>{selectedItem.currentQty} {selectedItem.unit}</strong></div>
                        <div>Custo unitário atual: <strong>{formatCurrency(selectedItem.costPrice)}</strong></div>
                        <div>Mínimo: {selectedItem.minQty}</div>
                    </div>
                )}
                <Form form={movementForm} layout="vertical">
                    <Form.Item name="type" label="Tipo" rules={[{ required: true }]} initialValue="entrada">
                        <Select>
                            <Select.Option value="entrada">📥 Entrada (reabastecimento)</Select.Option>
                            <Select.Option value="saida">📤 Saída</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="quantity" label="Quantidade comprada" rules={[{ required: true }]}>
                        <InputNumber min={0.001} step="any" style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type !== curr.type}>
                        {({ getFieldValue }) => getFieldValue('type') === 'entrada' ? (
                            <>
                                <Form.Item name="total_paid" label="Valor total pago (R$)" rules={[{ required: true, message: 'Informe o valor total' }]}>
                                    <Input prefix="R$" placeholder="0,00" autoComplete="off"
                                        onChange={(e) => {
                                            const digits = e.target.value.replace(/\D/g, '')
                                            if (!digits) { movementForm.setFieldsValue({ total_paid: '' }); return }
                                            const num = parseInt(digits, 10) / 100
                                            movementForm.setFieldsValue({ total_paid: num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
                                        }}
                                    />
                                </Form.Item>
                                <Form.Item name="has_discount" valuePropName="checked">
                                    <Checkbox>Com desconto?</Checkbox>
                                </Form.Item>
                                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.has_discount !== curr.has_discount}>
                                    {({ getFieldValue: gfv }) => gfv('has_discount') ? (
                                        <Form.Item name="discounted_value" label="Valor com desconto (R$)">
                                            <Input prefix="R$" placeholder="0,00" autoComplete="off"
                                                onChange={(e) => {
                                                    const digits = e.target.value.replace(/\D/g, '')
                                                    if (!digits) { movementForm.setFieldsValue({ discounted_value: '' }); return }
                                                    const num = parseInt(digits, 10) / 100
                                                    movementForm.setFieldsValue({ discounted_value: num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
                                                }}
                                            />
                                        </Form.Item>
                                    ) : null}
                                </Form.Item>
                            </>
                        ) : null}
                    </Form.Item>

                    <Form.Item name="description" label="Observação">
                        <Input.TextArea rows={2} placeholder="Motivo da movimentação..." />
                    </Form.Item>
                </Form>
            </Drawer>

            {/* Drawer — Excluir quantidade (total ou parcial) */}
            <Drawer
                title={`Excluir quantidade: ${selectedItem?.name || ''}`}
                width={400}
                open={deleteQtyDrawerOpen}
                onClose={() => setDeleteQtyDrawerOpen(false)}
                extra={
                    <Space>
                        <Button onClick={() => setDeleteQtyDrawerOpen(false)}>Cancelar</Button>
                        <Button type="primary" danger onClick={handleConfirmDeleteQty}>Excluir quantidade</Button>
                    </Space>
                }
            >
                {selectedItem && (
                    <div style={{ padding: 12, background: 'var(--color-neutral-50)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                        Estoque atual: <strong>{selectedItem.currentQty} {selectedItem.unit}</strong>
                        {selectedItem.type === 'ITEM' && (
                            <div style={{ marginTop: 4 }}>Insumos: pode excluir no máximo a quantidade em estoque.</div>
                        )}
                        {selectedItem.type === 'PRODUCT' && (
                            <div style={{ marginTop: 4 }}>Produto acabado: pode excluir o total em estoque.</div>
                        )}
                    </div>
                )}
                <Form form={deleteQtyForm} layout="vertical">
                    <Form.Item name="scope" label="Excluir">
                        <Radio.Group>
                            <Radio value="total">Total ({selectedItem?.currentQty ?? 0} {selectedItem?.unit})</Radio>
                            <Radio value="parcial">Quantidade parcial</Radio>
                        </Radio.Group>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.scope !== curr.scope}>
                        {({ getFieldValue }) =>
                            getFieldValue('scope') === 'parcial' ? (
                                <Form.Item
                                    name="quantity"
                                    label="Quantidade a excluir"
                                    rules={[
                                        { required: true, message: 'Informe a quantidade' },
                                        {
                                            validator: (_, v) => {
                                                const n = Number(v)
                                                const max = selectedItem?.currentQty ?? 0
                                                if (isNaN(n) || n <= 0) return Promise.reject(new Error('Quantidade inválida'))
                                                if (n > max) return Promise.reject(new Error(`Máximo: ${max}`))
                                                return Promise.resolve()
                                            },
                                        },
                                    ]}
                                >
                                    <InputNumber
                                        min={0.001}
                                        max={selectedItem?.currentQty ?? 0}
                                        step={1}
                                        style={{ width: '100%' }}
                                        addonAfter={selectedItem?.unit}
                                    />
                                </Form.Item>
                            ) : null
                        }
                    </Form.Item>
                    <Form.Item name="reason" label="Motivo (opcional)">
                        <Input placeholder="Ex: perda, vencimento..." />
                    </Form.Item>
                </Form>
            </Drawer>
        </Layout>
    )
}

export default Stock
