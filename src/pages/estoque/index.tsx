import React, { useState, useEffect, useMemo } from 'react'
import { Button, Drawer, Form, Input, Select, Space, Table, Tag, Tabs, message, InputNumber, Empty, Checkbox, Radio, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { getCurrentUserId } from '@/utils/get-tenant-id'
import type { StockRecord } from '@/supabase/types'
import { useStock, useItems, useProducts } from '@/hooks/use-data.hooks'
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
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'

interface StockRow {
    id: string
    name: string
    code: string
    section_id: string | null
    type: 'ITEM' | 'PRODUCT'
    currentQty: number
    minQty: number
    unit: string
    costPrice: number
    profitPercent: number
    salePrice: number
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
    profitPercent: number
}


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
    const [editUnifiedDrawerOpen, setEditUnifiedDrawerOpen] = useState(false)
    const [deleteQtyDrawerOpen, setDeleteQtyDrawerOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<StockRow | null>(null)
    const [deleteQtyForm] = Form.useForm()
    const [searchText, setSearchText] = useState('')
    const [stockFilter, setStockFilter] = useState<'all' | 'below'>('all')
    const [activeTab, setActiveTab] = useState<'ITEM' | 'PRODUCT' | 'SERVICE'>('PRODUCT')
    const [servicesList, setServicesList] = useState<ServiceRow[]>([])
    const [loadingServices, setLoadingServices] = useState(false)
    const [totalMovements, setTotalMovements] = useState(0)
    const [movementForm] = Form.useForm()
    const [editForm] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()
    const [selectedSection, setSelectedSection] = useState<string | null>(null)
    const [sections, setSections] = useState<{ id: string; name: string }[]>([])


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

    useEffect(() => {
        if (!effectiveTenantId) return
        supabase
            .from('product_sections')
            .select('id, name')
            .eq('tenant_id', effectiveTenantId)
            .order('name')
            .then(({ data }) => setSections(data || []))
    }, [effectiveTenantId])

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
        ;(supabase as any)
            .from('services')
            .select('id, name, description, estimated_duration_minutes, cost_total, base_price, status, min_quantity, profit_percent, service_items(*, item:items(id, quantity))')
            .order('name')
            .then((svcRes: any) => {
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
                        profitPercent: Number(s.profit_percent) || 0,
                    }
                }))
            })
            .finally(() => setLoadingServices(false))
    }, [activeTab])


    const stockRows = useMemo<StockRow[]>(() => {
        return (rawStock || []).map((s: any) => {
            const item = s.items
            const product = s.products
            const name = item?.name || product?.name || 'Sem nome'
            const itemQty = Number(item?.quantity) || 1
            const itemTotalCost = Number(item?.cost_price) || 0
            const costPrice = item
              ? (item.cost_per_base_unit != null
                ? Number(item.cost_per_base_unit)
                : itemQty > 0 ? itemTotalCost / itemQty : itemTotalCost)
              : (product?.cost_total ?? 0)
            const unit = (s.unit || item?.unit || product?.unit || 'UN') as string
            const type = s.stock_type === 'PRODUCT' ? 'PRODUCT' : 'ITEM'
            const profitPercent = Number((product as any)?.profit_percent) || 0
            const salePrice = Number((product as any)?.sale_price) || 0

            return {
                id: s.id,
                name,
                code: type === 'PRODUCT' ? (product?.code || '') : '',
                section_id: type === 'PRODUCT' ? (product?.section_id || null) : null,
                type,
                currentQty: s.quantity_current ?? 0,
                minQty: s.min_limit ?? 0,
                unit,
                costPrice,
                profitPercent,
                salePrice,
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
        let list = filteredByTabAndSearch as StockRow[]
        if (stockFilter === 'below') list = list.filter(i => i.status === 'Baixo' || i.status === 'Crítico')
        if (activeTab === 'PRODUCT' && selectedSection) list = list.filter(row => row.section_id === selectedSection)
        return list
    }, [activeTab, stockFilter, selectedSection, filteredByTabAndSearch])

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

    // Columns for ITEM tab (keeps original Custo Unit. column)
    const itemColumns: ColumnsType<StockRow> = [
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
                        <Button type="link" size="small" onClick={() => handleEditUnified(record)}>Editar</Button>
                        <Button type="link" size="small" danger onClick={() => handleOpenDeleteQty(record)}>Excluir quantidade</Button>
                    </Space>
                ),
            }]
            : []),
    ]

    // Columns for PRODUCT tab (layout similar to Serviços Realizados)
    const productColumns: ColumnsType<StockRow> = [
        {
            title: 'Código',
            dataIndex: 'code',
            key: 'code',
            width: 90,
            render: (v: string) => v ? <Tag>{v}</Tag> : <span style={{ color: '#D0D5DD' }}>—</span>,
        },
        {
            title: 'Nome',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (text, r) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{text}</span>
                    {(r.status === 'Baixo' || r.status === 'Crítico') && (
                        <div style={{ fontSize: 11, color: '#f59e0b' }}>⚠ Estoque abaixo do mínimo</div>
                    )}
                </div>
            ),
        },
        {
            title: 'Margem de Lucro',
            dataIndex: 'profitPercent',
            key: 'profitPercent',
            width: 140,
            render: (v: number) => <span style={{ fontWeight: 600 }}>{v.toFixed(3)}%</span>,
        },
        {
            title: 'Preço de Venda',
            dataIndex: 'salePrice',
            key: 'salePrice',
            width: 130,
            render: (v: number) => <span style={{ fontWeight: 600, color: '#4ade80' }}>{formatCurrency(v)}</span>,
        },
        {
            title: 'Qtd em Estoque',
            dataIndex: 'currentQty',
            key: 'currentQty',
            width: 140,
            sorter: (a, b) => a.currentQty - b.currentQty,
            render: (qty, record) => (
                <span style={{ fontWeight: 600, color: record.status === 'Crítico' ? 'var(--color-error)' : 'inherit' }}>
                    {qty} {record.unit}
                </span>
            ),
        },
        ...(canEdit(MODULES.STOCK)
            ? [{
                title: 'Ações',
                key: 'action',
                width: 200,
                render: (_: unknown, record: StockRow) => (
                    <Space>
                        <Button type="link" size="small" onClick={() => handleEditUnified(record)}>Editar</Button>
                        <Button type="link" size="small" danger onClick={() => handleOpenDeleteQty(record)}>Excluir quantidade</Button>
                    </Space>
                ),
            }]
            : []),
    ]

    // Use appropriate columns based on active tab
    const columns = activeTab === 'PRODUCT' ? productColumns : itemColumns

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

    function handleEditUnified(record: StockRow) {
        setSelectedItem(record)
        editForm.setFieldsValue({ minQty: record.minQty })
        movementForm.resetFields()
        setEditUnifiedDrawerOpen(true)
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
                    onChange={(k) => setActiveTab(k as 'ITEM' | 'PRODUCT' | 'SERVICE')}
                    items={[
                        {
                            key: 'PRODUCT',
                            label: (
                                <span><ShoppingOutlined style={{ marginRight: 6 }} />Produtos Acabados ({productCount})</span>
                            ),
                        },
                        {
                            key: 'SERVICE',
                            label: (
                                <span><CustomerServiceOutlined style={{ marginRight: 6 }} />Serviços Realizados ({serviceCount})</span>
                            ),
                        },
                        {
                            key: 'ITEM',
                            label: (
                                <span><InboxOutlined style={{ marginRight: 6 }} />Itens / Insumos ({itemCount})</span>
                            ),
                        },
                    ]}
                />

                {(
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
                        {activeTab === 'PRODUCT' && sections.length > 0 && (
                            <Select
                                value={selectedSection}
                                onChange={setSelectedSection}
                                style={{ minWidth: 180 }}
                                placeholder="Filtrar por seção"
                                allowClear
                                onClear={() => setSelectedSection(null)}
                                options={sections.map(s => ({ value: s.id, label: s.name }))}
                            />
                        )}
                    </div>
                )}

                {activeTab === 'SERVICE' ? (
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
                                title: 'Margem de Lucro',
                                dataIndex: 'profitPercent',
                                key: 'profitPercent',
                                width: 140,
                                render: (v: number) => <span style={{ fontWeight: 600 }}>{v.toFixed(3)}%</span>,
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

            {/* Drawer — Editar unificado (dados + movimentação) */}
            <Drawer
                title={`Editar: ${selectedItem?.name || ''}`}
                width={460}
                open={editUnifiedDrawerOpen}
                onClose={() => setEditUnifiedDrawerOpen(false)}
            >
                {selectedItem && (
                    <div style={{ padding: 12, background: 'var(--color-neutral-50)', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
                        <div>Estoque atual: <strong>{selectedItem.currentQty} {selectedItem.unit}</strong></div>
                        <div>Custo unitário: <strong>{formatCurrency(selectedItem.costPrice)}</strong></div>
                        <div>Mínimo: {selectedItem.minQty}</div>
                    </div>
                )}

                <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Estoque Mínimo</h4>
                    <Form form={editForm} layout="vertical">
                        <Form.Item name="minQty" label="Quantidade Mínima (alerta)" rules={[{ required: true }]}>
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Button type="primary" onClick={async () => { await handleSaveEdit(); setEditUnifiedDrawerOpen(false) }}>
                            Salvar estoque mínimo
                        </Button>
                    </Form>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Registrar Movimentação</h4>
                    <Form form={movementForm} layout="vertical">
                        <Form.Item name="type" label="Tipo" rules={[{ required: true }]} initialValue="entrada">
                            <Select>
                                <Select.Option value="entrada">📥 Entrada (reabastecimento)</Select.Option>
                                <Select.Option value="saida">📤 Saída</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="quantity" label="Quantidade" rules={[{ required: true }]}>
                            <InputNumber min={0.001} step="any" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type !== curr.type}>
                            {({ getFieldValue }) => getFieldValue('type') === 'entrada' && selectedItem?.type === 'ITEM' ? (
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
                                </>
                            ) : null}
                        </Form.Item>
                        <Form.Item name="description" label="Observação">
                            <Input.TextArea rows={2} placeholder="Motivo da movimentação..." />
                        </Form.Item>
                        <Button type="primary" onClick={async () => { await handleSaveMovement(); setEditUnifiedDrawerOpen(false) }}>
                            Registrar movimentação
                        </Button>
                    </Form>
                </div>
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
