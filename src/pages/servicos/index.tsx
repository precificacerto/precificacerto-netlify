import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag,
    message, Popconfirm, Empty, Tooltip, Modal,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/supabase/client'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import type { Service } from '@/supabase/types'
import {
    PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, MinusCircleOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useAuth } from '@/hooks/use-auth.hook'
import { calculateItemPrice } from '@/utils/calculate-item-price'
import { computeServiceSellingPrice } from '@/utils/compute-service-price'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { useRouter } from 'next/router'

function fmt(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

function ServicesPage() {
    const { canView, canEdit } = usePermissions()
    const { currentUser } = useAuth()
    const router = useRouter()

    if (!canView(MODULES.SERVICES)) return (
        <Layout title={PAGE_TITLES.SERVICES}>
            <div style={{ padding: 40, textAlign: 'center' }}>Sem acesso.</div>
        </Layout>
    )

    const [services, setServices] = useState<Service[]>([])
    const [loading, setLoading] = useState(false)
    const [searchText, setSearchText] = useState('')
    const [msgApi, ctx] = message.useMessage()
    const [renewDrawerOpen, setRenewDrawerOpen] = useState(false)
    const [renewForm] = Form.useForm()
    const [savingRenew, setSavingRenew] = useState(false)
    const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)

    const [serviceStockMap, setServiceStockMap] = useState<Record<string, number>>({})
    const [deleteQtyDrawerOpen, setDeleteQtyDrawerOpen] = useState(false)
    const [selectedServiceForDelete, setSelectedServiceForDelete] = useState<Service | null>(null)
    const [confirmDeleteSvcId, setConfirmDeleteSvcId] = useState<string | null>(null)
    const [deletingSvc, setDeletingSvc] = useState(false)
    const [deleteQtyForm] = Form.useForm()
    const [savingDeleteQty, setSavingDeleteQty] = useState(false)
    const [updatingServiceId, setUpdatingServiceId] = useState<string | null>(null)
    const [updatingAllServices, setUpdatingAllServices] = useState(false)

    // Commission tables
    const [commissionTablesLoaded, setCommissionTablesLoaded] = useState(false)
    const [commissionTables, setCommissionTables] = useState<{ id: string; name: string; commission_percent: number }[]>([])
    const [tableFilter, setTableFilter] = useState<string | null>(null)
    const [tableModalOpen, setTableModalOpen] = useState(false)
    const [newTableName, setNewTableName] = useState('')
    const [newTableNotes, setNewTableNotes] = useState<string>('')
    const [savingTable, setSavingTable] = useState(false)
    // Edit table name state
    const [editTableModalOpen, setEditTableModalOpen] = useState(false)
    const [editingTableId, setEditingTableId] = useState<string | null>(null)
    const [editTableName, setEditTableName] = useState('')
    const [savingEditTable, setSavingEditTable] = useState(false)

    const loadCommissionTables = async () => {
        const tenantId = await getTenantId()
        if (!tenantId) return
        const { data } = await (supabase as any)
            .from('commission_tables')
            .select('id, name, commission_percent')
            .eq('type', 'SERVICE')
            .order('name')
        if (data) {
            setCommissionTables(data.map((t: any) => ({ ...t, commission_percent: Number(t.commission_percent) })))
            if (data.length > 0) setTableFilter(data[0].id)
        }
        setCommissionTablesLoaded(true)
    }

    const handleCreateTable = async () => {
        const name = newTableName.trim()
        if (!name) { msgApi.warning('Informe o nome da tabela.'); return }
        const tenantId = await getTenantId()
        if (!tenantId) { msgApi.error('Sessão inválida.'); return }
        setSavingTable(true)
        try {
            const { data, error } = await (supabase as any)
                .from('commission_tables')
                .insert({ tenant_id: tenantId, type: 'SERVICE', name, commission_percent: 0, notes: newTableNotes.trim() || null })
                .select()
                .single()
            if (error) { msgApi.error('Erro ao criar tabela: ' + error.message); return }
            setCommissionTables(prev => [...prev, { id: data.id, name: data.name, commission_percent: Number(data.commission_percent) }].sort((a, b) => a.name.localeCompare(b.name)))
            setNewTableName('')
            setNewTableNotes('')
            setTableModalOpen(false)
            msgApi.success('Tabela criada!')
        } finally {
            setSavingTable(false)
        }
    }

    const handleOpenEditTable = (id: string, currentName: string) => {
        setEditingTableId(id)
        setEditTableName(currentName)
        setEditTableModalOpen(true)
    }

    const handleSaveEditTable = async () => {
        const name = editTableName.trim()
        if (!name || !editingTableId) { msgApi.warning('Informe o nome da tabela.'); return }
        setSavingEditTable(true)
        try {
            const { error } = await (supabase as any)
                .from('commission_tables')
                .update({ name })
                .eq('id', editingTableId)
            if (error) { msgApi.error('Erro ao atualizar tabela: ' + error.message); return }
            setCommissionTables(prev => prev.map(t => t.id === editingTableId ? { ...t, name } : t))
            setEditTableModalOpen(false)
            msgApi.success('Nome da tabela atualizado!')
        } finally {
            setSavingEditTable(false)
        }
    }

    useEffect(() => { loadCommissionTables() }, [])

    async function fetchAll() {
        setLoading(true)
        try {
            const tenantId = await getTenantId()
            const sb = supabase as any
            const [svcRes, stockRes] = await Promise.all([
                sb.from('services')
                    .select('*, service_items(*, item:items(id, name, unit, cost_price, quantity, measure_quantity))')
                    .order('name'),
                tenantId ? sb.from('stock').select('service_id, quantity_current').eq('stock_type', 'SERVICE') : Promise.resolve({ data: [] }),
            ])
            setServices(svcRes.data || [])
            const map: Record<string, number> = {}
            ;(stockRes.data || []).forEach((s: any) => {
                if (s.service_id) map[s.service_id] = Number(s.quantity_current) || 0
            })
            setServiceStockMap(map)
        } catch (e: any) { msgApi.error('Erro: ' + (e.message || '')) }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchAll() }, [])

    const filtered = useMemo(() => {
        if (!tableFilter) return []
        let result = services.filter((sv: any) => sv.commission_table_id === tableFilter)
        if (!searchText) return result
        const s = searchText.toLowerCase()
        return result.filter(sv => sv.name.toLowerCase().includes(s))
    }, [services, searchText, tableFilter])

    function calcServiceMaterialCost(svc: any) {
        return (svc.service_items || []).reduce((sum: number, si: any) => {
            const measureQty = Number((si.item as any)?.measure_quantity) || 1
            const refQty = (Number(si.item?.quantity) || 1) * measureQty
            const refPrice = Number(si.item?.cost_price) || 0
            const neededQty = Number(si.quantity) || 0
            return sum + calculateItemPrice(neededQty, refPrice, refQty)
        }, 0)
    }

    async function handleUpdateService(serviceId: string) {
        setUpdatingServiceId(serviceId)
        try {
            const tenantId = await getTenantId()
            if (!tenantId) { return }

            const sb = supabase as any
            const { data: svc } = await sb
                .from('services')
                .select('*, service_items(*, item:items(id, name, unit, cost_price, quantity, measure_quantity))')
                .eq('id', serviceId)
                .single()
            if (!svc) return

            const costTotal = calcServiceMaterialCost(svc)

            const [cfgRes, taxPreview] = await Promise.all([
                supabase.from('tenant_expense_config').select('*').eq('tenant_id', tenantId).single(),
                fetchTaxPreview(tenantId),
            ])
            const expenseConfig = cfgRes.data || null

            const { sellingPrice, laborCost } = computeServiceSellingPrice({
                materialCost: costTotal,
                commissionPercent: Number(svc.commission_percent) || 0,
                profitPercent: Number(svc.profit_percent) || 0,
                taxableRegimePercent: Number(svc.taxable_regime_percent) || 0,
                expenseConfig,
                taxPreview: taxPreview || null,
                currentUser: null,
            })

            await supabase
                .from('services')
                .update({
                    cost_total: costTotal,
                    base_price: sellingPrice,
                    labor_cost: laborCost,
                    needs_cost_update: false,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', serviceId)

            await fetchAll()
        } catch (e: any) {
            msgApi.error(e?.message || 'Erro ao atualizar serviço.')
        } finally {
            setUpdatingServiceId(null)
        }
    }

    async function handleUpdateAllServices() {
        setUpdatingAllServices(true)
        try {
            const toUpdate = services.filter((s: any) => s.needs_cost_update)
            for (const svc of toUpdate) {
                await handleUpdateService(svc.id)
            }
            msgApi.success('Todos os serviços foram atualizados!')
        } catch (e: any) {
            msgApi.error(e?.message || 'Erro ao atualizar serviços.')
        } finally {
            setUpdatingAllServices(false)
        }
    }

    /** Quantidade de serviços que podem ser feitos com o estoque atual dos itens (considera quantidade fracionada, ex: 0.5 por serviço = 1 item dá 2 serviços). */
    function calcServicesPossibleFromItems(svc: any): number | null {
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

    const watchedServiceId = Form.useWatch('service_id', renewForm)
    useEffect(() => setSelectedServiceId(watchedServiceId || null), [watchedServiceId])

    const selectedService = useMemo(() => {
        if (!selectedServiceId) return null
        return services.find((s) => s.id === selectedServiceId) || null
    }, [selectedServiceId, services])

    async function handleSaveRenew() {
        try {
            const values = await renewForm.validateFields()
            const serviceId = values.service_id
            const quantityAdded = Number(values.quantity) || 0
            const svc = services.find((s) => s.id === serviceId)
            const profitPercent = Number((svc as any)?.profit_percent) ?? 0
            const commissionPercent = Number((svc as any)?.commission_percent) ?? 0
            if (quantityAdded < 0) {
                msgApi.error('Informe uma quantidade válida.')
                return
            }
            const tenantId = await getTenantId()
            if (!tenantId) {
                msgApi.error('Não foi possível identificar o tenant.')
                return
            }
            const createdBy = await getCurrentUserId()
            if (!createdBy) {
                msgApi.error('Sessão inválida. Faça login novamente.')
                return
            }
            setSavingRenew(true)

            const sbr = supabase as any
            const { data: existingStock } = await sbr
                .from('stock')
                .select('id, quantity_current')
                .eq('service_id', serviceId)
                .eq('stock_type', 'SERVICE')
                .maybeSingle()

            const currentQty = existingStock ? Number(existingStock.quantity_current) || 0 : 0
            const newQty = currentQty + quantityAdded

            if (existingStock) {
                await sbr
                    .from('stock')
                    .update({ quantity_current: newQty, updated_at: new Date().toISOString() })
                    .eq('id', existingStock.id)
            } else {
                await sbr.from('stock').insert({
                    tenant_id: tenantId,
                    service_id: serviceId,
                    stock_type: 'SERVICE',
                    quantity_current: newQty,
                    min_limit: 0,
                    unit: 'UN',
                })
            }

            const { data: stockRow } = await sbr
                .from('stock')
                .select('id')
                .eq('service_id', serviceId)
                .eq('stock_type', 'SERVICE')
                .maybeSingle()
            if (stockRow) {
                await sbr.from('stock_movements').insert({
                    stock_id: stockRow.id,
                    delta_quantity: quantityAdded,
                    reason: 'Renovar quantidade — serviço',
                    created_by: createdBy,
                })
            }

            const costTotal = svc ? Number((svc as any).cost_total) || 0 : 0
            const markup = 1 + (profitPercent + commissionPercent) / 100
            const newBasePrice = costTotal * markup
            await sbr
                .from('services')
                .update({
                    base_price: newBasePrice,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', serviceId)

            msgApi.success(`Quantidade adicionada: ${quantityAdded}. Preço atualizado.`)
            setRenewDrawerOpen(false)
            renewForm.resetFields()
            setSelectedServiceId(null)
            await fetchAll()
        } catch (e: any) {
            msgApi.error(e?.message || 'Erro ao renovar quantidade.')
        } finally {
            setSavingRenew(false)
        }
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch('/api/delete/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Erro ao excluir')
            msgApi.success('Excluído!')
            await fetchAll()
        } catch (e: any) { msgApi.error(e.message || 'Erro ao excluir serviço') }
    }

    function handleOpenDeleteQty(svc: Service) {
        setSelectedServiceForDelete(svc)
        const currentQty = serviceStockMap[svc.id] ?? 0
        deleteQtyForm.resetFields()
        deleteQtyForm.setFieldsValue({ quantity: Math.min(1, currentQty) })
        setDeleteQtyDrawerOpen(true)
    }

    async function handleConfirmDeleteQty() {
        if (!selectedServiceForDelete) return
        try {
            const values = await deleteQtyForm.validateFields()
            const currentQty = serviceStockMap[selectedServiceForDelete.id] ?? 0
            if (currentQty <= 0) {
                msgApi.error('Este serviço não possui estoque para baixa.')
                return
            }
            const qtyToRemove = Math.min(Number(values.quantity) || 0, currentQty)
            if (qtyToRemove <= 0) {
                msgApi.error('Informe uma quantidade válida para excluir.')
                return
            }
            setSavingDeleteQty(true)
            const tenantId = await getTenantId()
            const createdBy = await getCurrentUserId()
            if (!tenantId || !createdBy) {
                msgApi.error('Sessão inválida. Faça login novamente.')
                setSavingDeleteQty(false)
                return
            }
            const { data: stockRow } = await (supabase as any)
                .from('stock')
                .select('id, quantity_current')
                .eq('service_id', selectedServiceForDelete.id)
                .eq('stock_type', 'SERVICE')
                .maybeSingle()
            if (!stockRow) {
                msgApi.error('Registro de estoque não encontrado para este serviço.')
                setSavingDeleteQty(false)
                return
            }
            const newQty = Math.max(0, (Number(stockRow.quantity_current) || 0) - qtyToRemove)
            await supabase
                .from('stock')
                .update({ quantity_current: newQty, updated_at: new Date().toISOString() })
                .eq('id', stockRow.id)
            await supabase.from('stock_movements').insert({
                stock_id: stockRow.id,
                delta_quantity: -qtyToRemove,
                reason: values.reason || 'Baixa de quantidade — serviço',
                created_by: createdBy,
            })
            msgApi.success(`Quantidade de ${qtyToRemove} excluída do serviço.`)
            setDeleteQtyDrawerOpen(false)
            setSelectedServiceForDelete(null)
            await fetchAll()
        } catch (e: any) {
            if (e?.errorFields) return
            msgApi.error(e?.message || 'Erro ao excluir quantidade.')
        } finally {
            setSavingDeleteQty(false)
        }
    }

    const columns: ColumnsType<Service> = [
        {
            title: 'Código',
            key: 'code',
            width: 110,
            render: (_, r: any) => r.code ? (
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#7A5AF8', fontWeight: 600 }}>
                    {r.code}
                </span>
            ) : <span style={{ color: '#475569', fontSize: 12 }}>—</span>,
        },
        {
            title: 'Serviço', dataIndex: 'name', key: 'name',
            render: (n: string, r: Service) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{n}</div>
                    {r.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.description}</div>}
                </div>
            ),
        },
        {
            title: 'Duração', dataIndex: 'estimated_duration_minutes', key: 'dur', width: 90, align: 'center',
            render: (v: number) => {
                if (!v) return '—'
                if (v < 60) return `${v}min`
                const h = Math.floor(v / 60); const m = v % 60
                return m > 0 ? `${h}h${m}` : `${h}h`
            },
        },
        {
            title: 'Margem de Lucro', key: 'profit_margin', width: 130, align: 'right',
            render: (_: any, r: any) => {
                const margin = Number(r.profit_percent)
                if (r.profit_percent == null) return <span style={{ fontSize: 13, color: '#94a3b8' }}>—</span>
                const color = margin >= 0 ? '#4ade80' : '#f87171'
                return <span style={{ fontSize: 13, fontWeight: 600, color }}>{margin.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</span>
            },
        },
        {
            title: 'Preço Venda', dataIndex: 'base_price', key: 'price', width: 130, align: 'right',
            render: (v: number) => {
                return <span style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>{fmt(v)}</span>
            },
        },
        {
            title: 'Status', dataIndex: 'status', key: 'status', width: 80, align: 'center',
            render: (s: string) => <Tag color={s === 'ACTIVE' ? 'success' : 'default'}>{s === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Tag>,
        },
        ...(canEdit(MODULES.SERVICES)
            ? [{
                title: '', key: 'act', width: 160, align: 'center' as const,
                render: (_: any, r: Service) => (
                    <Space size={4} wrap>
                        {(r as any).needs_cost_update && (
                            <Button
                                type="link"
                                size="small"
                                icon={<ReloadOutlined />}
                                loading={updatingServiceId === r.id}
                                onClick={() => handleUpdateService(r.id)}
                                style={{ color: '#16a34a' }}
                            >
                                Atualizar serviço
                            </Button>
                        )}
                        <Tooltip title="Editar">
                            <Button type="text" size="small" icon={<EditOutlined />}
                                onClick={() => router.push(`/servicos/${r.id}`)} />
                        </Tooltip>
                        <Tooltip title="Excluir quantidade do estoque">
                            <Button type="text" size="small" icon={<MinusCircleOutlined style={{ color: '#faad14' }} />}
                                onClick={() => handleOpenDeleteQty(r)} />
                        </Tooltip>
                        <Tooltip title="Excluir serviço">
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setConfirmDeleteSvcId(r.id)} />
                        </Tooltip>
                    </Space>
                ),
            }]
            : []),
    ]

    return (
        <Layout title={PAGE_TITLES.SERVICES} subtitle="Cadastro e precificação de serviços">
            {ctx}

            {commissionTablesLoaded && commissionTables.length === 0 && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <span style={{ color: '#92400e', fontSize: 13 }}>
                        Para criar um serviço, primeiro crie uma <strong>Tabela de Comissão</strong> clicando no botão ao lado.
                    </span>
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Input placeholder="Buscar serviço..." prefix={<SearchOutlined style={{ color: '#D0D5DD' }} />}
                        value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 280 }} allowClear />
                    <Select
                        allowClear
                        placeholder="Filtrar por tabela..."
                        style={{ width: 200 }}
                        value={tableFilter}
                        onChange={v => setTableFilter(v || null)}
                        options={commissionTables.map(t => ({ value: t.id, label: t.name }))}
                    />
                    {tableFilter && commissionTables.find(t => t.id === tableFilter) && (
                        <Tooltip title="Editar nome da tabela">
                            <Button
                                icon={<EditOutlined />}
                                size="small"
                                onClick={() => {
                                    const t = commissionTables.find(x => x.id === tableFilter)
                                    if (t) handleOpenEditTable(t.id, t.name)
                                }}
                            />
                        </Tooltip>
                    )}
                </div>
                <Space>
                    {canEdit(MODULES.SERVICES) && (
                        <>
                            {services.some((s: any) => s.needs_cost_update) && (
                                <Button
                                    icon={<ReloadOutlined />}
                                    loading={updatingAllServices}
                                    onClick={handleUpdateAllServices}
                                    style={{ background: '#16a34a', borderColor: '#15803d', color: 'white' }}
                                >
                                    Atualizar todos os serviços
                                </Button>
                            )}
                            <Button
                                onClick={() => setTableModalOpen(true)}
                                style={commissionTablesLoaded && commissionTables.length === 0 ? {
                                    background: '#16a34a', borderColor: '#16a34a', color: 'white',
                                    animation: 'pulse-green 1.5s infinite',
                                } : {}}
                            >
                                Criar Tabela
                            </Button>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => {
                                    if (commissionTablesLoaded && commissionTables.length === 0) {
                                        msgApi.warning('Crie uma Tabela de Comissão antes de adicionar serviços.')
                                        return
                                    }
                                    router.push(ROUTES.NEW_SERVICE)
                                }}
                            >
                                Novo Serviço
                            </Button>
                        </>
                    )}
                </Space>
            </div>

            {/* Commission Table Modal */}
            <Modal
                title="Criar Tabela de Comissão"
                open={tableModalOpen}
                onCancel={() => { setTableModalOpen(false); setNewTableName(''); setNewTableNotes('') }}
                onOk={handleCreateTable}
                okText="Criar"
                okButtonProps={{ loading: savingTable }}
                width={460}
            >
                <div style={{ padding: '8px 0' }}>
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#f59e0b' }}>
                        ⚠️ <strong>Importante:</strong> Nomeie as tabelas de forma bem específica (ex: &quot;Massagens – Premium&quot;, &quot;Pacote Casal&quot;) para não confundir na hora de vincular funcionários e serviços.
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Nome da Tabela <span style={{ color: '#f04438' }}>*</span></label>
                        <Input
                            placeholder="Nome específico da tabela"
                            value={newTableName}
                            onChange={e => setNewTableName(e.target.value)}
                            onPressEnter={handleCreateTable}
                            maxLength={100}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Observações</label>
                        <Input.TextArea
                            rows={3}
                            placeholder="Observações sobre esta tabela (opcional)"
                            value={newTableNotes}
                            onChange={e => setNewTableNotes(e.target.value)}
                            maxLength={500}
                            showCount
                        />
                    </div>
                </div>
            </Modal>

            {/* Edit Commission Table Name Modal */}
            <Modal
                title="Editar Nome da Tabela de Comissão"
                open={editTableModalOpen}
                onCancel={() => setEditTableModalOpen(false)}
                onOk={handleSaveEditTable}
                okText="Salvar"
                okButtonProps={{ loading: savingEditTable }}
                width={400}
            >
                <div style={{ padding: '8px 0' }}>
                    <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Nome da Tabela <span style={{ color: '#f04438' }}>*</span></label>
                    <Input
                        placeholder="Nome da tabela"
                        value={editTableName}
                        onChange={e => setEditTableName(e.target.value)}
                        onPressEnter={handleSaveEditTable}
                        maxLength={100}
                    />
                </div>
            </Modal>

            <Drawer
                title="Renovar quantidade"
                open={renewDrawerOpen}
                onClose={() => { setRenewDrawerOpen(false); renewForm.resetFields(); setSelectedServiceId(null) }}
                width={520}
                footer={
                    <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => setRenewDrawerOpen(false)} style={{ marginRight: 8 }}>Cancelar</Button>
                        <Button type="primary" loading={savingRenew} onClick={handleSaveRenew}>Salvar</Button>
                    </div>
                }
            >
                <Form form={renewForm} layout="vertical">
                    <Form.Item name="service_id" label="Serviço" rules={[{ required: true, message: 'Selecione o serviço' }]}>
                        <Select
                            placeholder="Selecione o serviço"
                            showSearch
                            optionFilterProp="label"
                            options={services.map((s) => ({ value: s.id, label: s.name }))}
                        />
                    </Form.Item>
                    {selectedService && (selectedService as any).service_items?.length > 0 && (
                        <>
                            <div style={{ marginBottom: 12, fontSize: 12, color: '#94a3b8' }}>Materiais (somente leitura)</div>
                            <Table
                                size="small"
                                pagination={false}
                                dataSource={(selectedService as any).service_items.map((si: any, i: number) => {
                                    const item = si.item
                                    const refQty = item ? Number(item.quantity) || 1 : 1
                                    const refPrice = item ? Number(item.cost_price) || 0 : 0
                                    const neededQty = Number(si.quantity) || 0
                                    const cost = calculateItemPrice(neededQty, refPrice, refQty)
                                    const unitCost = refQty > 0 ? refPrice / refQty : 0
                                    return {
                                        key: si.item_id + i,
                                        name: item?.name || '—',
                                        qty: neededQty,
                                        unit: item?.unit || 'UN',
                                        unit_value: unitCost,
                                        cost,
                                    }
                                })}
                                columns={[
                                    { title: 'Material', dataIndex: 'name', key: 'name', width: 140 },
                                    { title: 'Qtd.', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' },
                                    { title: 'Un.', dataIndex: 'unit', key: 'unit', width: 50 },
                                    { title: 'Valor un.', key: 'unit_value', width: 90, align: 'right', render: (_: any, r: any) => fmt(r.unit_value) },
                                    { title: 'Custo', key: 'cost', width: 90, align: 'right', render: (_: any, r: any) => fmt(r.cost) },
                                ]}
                            />
                            <div style={{ marginTop: 8, padding: '8px 12px', background: '#0a1628', borderRadius: 6, fontSize: 12, color: '#94a3b8' }}>
                                Impostos e preço: conforme percentuais de lucro e comissão já cadastrados no serviço.
                            </div>
                        </>
                    )}
                    {selectedService && (!(selectedService as any).service_items?.length) && (
                        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#0a1628', borderRadius: 6, fontSize: 12, color: '#94a3b8' }}>
                            Nenhum material cadastrado para este serviço. Impostos conforme precificação do serviço.
                        </div>
                    )}
                    <Form.Item name="quantity" label="Quantidade adicionada" rules={[{ required: true, message: 'Obrigatório' }]} initialValue={0} style={{ marginTop: 16 }}>
                        <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="Ex: 10" />
                    </Form.Item>
                </Form>
            </Drawer>

            <div className="pc-card" style={{ padding: 0 }}>
                <Table columns={columns} dataSource={filtered} rowKey="id" loading={loading}
                    pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description={tableFilter ? "Nenhum serviço cadastrado nesta tabela" : "Selecione uma tabela para ver os serviços"} /> }}
                    size="middle" />
            </div>

            <Drawer
                title="Excluir quantidade do estoque"
                open={deleteQtyDrawerOpen}
                onClose={() => { setDeleteQtyDrawerOpen(false); setSelectedServiceForDelete(null) }}
                width={400}
                footer={
                    <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => setDeleteQtyDrawerOpen(false)} style={{ marginRight: 8 }}>Cancelar</Button>
                        <Button type="primary" danger loading={savingDeleteQty} onClick={handleConfirmDeleteQty}>Excluir</Button>
                    </div>
                }
            >
                {selectedServiceForDelete && (
                    <Form form={deleteQtyForm} layout="vertical">
                        <div style={{ marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>
                            Serviço: <strong style={{ color: '#e2e8f0' }}>{selectedServiceForDelete.name}</strong>
                            <br />
                            Estoque atual: <strong style={{ color: '#e2e8f0' }}>{serviceStockMap[selectedServiceForDelete.id] ?? 0}</strong>
                        </div>
                        <Form.Item name="quantity" label="Quantidade a excluir" rules={[{ required: true, message: 'Obrigatório' }]}>
                            <InputNumber min={1} max={serviceStockMap[selectedServiceForDelete.id] ?? 0} step={1} style={{ width: '100%' }} placeholder="Ex: 5" />
                        </Form.Item>
                        <Form.Item name="reason" label="Motivo (opcional)">
                            <Input placeholder="Ex: Devolução, erro de contagem..." />
                        </Form.Item>
                    </Form>
                )}
            </Drawer>

            <Modal
                open={!!confirmDeleteSvcId}
                onCancel={() => setConfirmDeleteSvcId(null)}
                title="Excluir serviço"
                okText="Sim, excluir"
                cancelText="Cancelar"
                okButtonProps={{ danger: true, loading: deletingSvc }}
                onOk={async () => {
                    if (!confirmDeleteSvcId) return
                    setDeletingSvc(true)
                    await handleDelete(confirmDeleteSvcId)
                    setDeletingSvc(false)
                    setConfirmDeleteSvcId(null)
                }}
            >
                <p>Tem certeza que deseja excluir este serviço? Esta ação não pode ser desfeita.</p>
            </Modal>
        </Layout>
    )
}

export default ServicesPage
