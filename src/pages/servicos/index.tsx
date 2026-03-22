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
    PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, MinusCircleOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { calculateItemPrice } from '@/utils/calculate-item-price'
import { useRouter } from 'next/router'

function fmt(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

function ServicesPage() {
    const { canView, canEdit } = usePermissions()
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

    async function fetchAll() {
        setLoading(true)
        try {
            const tenantId = await getTenantId()
            const sb = supabase as any
            const [svcRes, stockRes] = await Promise.all([
                sb.from('services')
                    .select('*, service_items(*, item:items(id, name, unit, cost_price, quantity))')
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
        if (!searchText) return services
        const s = searchText.toLowerCase()
        return services.filter(sv => sv.name.toLowerCase().includes(s))
    }, [services, searchText])

    function calcServiceMaterialCost(svc: any) {
        return (svc.service_items || []).reduce((sum: number, si: any) => {
            const refQty = Number(si.item?.quantity) || 1
            const refPrice = Number(si.item?.cost_price) || 0
            const neededQty = Number(si.quantity) || 0
            return sum + calculateItemPrice(neededQty, refPrice, refQty)
        }, 0)
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
                return <span style={{ fontSize: 13, fontWeight: 600, color }}>{margin.toFixed(2)}%</span>
            },
        },
        {
            title: 'Preço Venda', dataIndex: 'base_price', key: 'price', width: 130, align: 'right',
            render: (v: number) => <span style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>{fmt(v)}</span>,
        },
        {
            title: 'Status', dataIndex: 'status', key: 'status', width: 80, align: 'center',
            render: (s: string) => <Tag color={s === 'ACTIVE' ? 'success' : 'default'}>{s === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Tag>,
        },
        ...(canEdit(MODULES.SERVICES)
            ? [{
                title: '', key: 'act', width: 120, align: 'center' as const,
                render: (_: any, r: Service) => (
                    <Space size={4}>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <Input placeholder="Buscar serviço..." prefix={<SearchOutlined style={{ color: '#D0D5DD' }} />}
                    value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 280 }} allowClear />
                <Space>
                    {canEdit(MODULES.SERVICES) && (
                        <>
                            <Button
                                style={{ background: '#FEF08A', borderColor: '#FDE047', color: '#854D0E' }}
                                onClick={() => { setRenewDrawerOpen(true); renewForm.resetFields(); setSelectedServiceId(null) }}
                            >
                                + Renovar quantidade
                            </Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push(ROUTES.NEW_SERVICE)}>
                                Novo Serviço
                            </Button>
                        </>
                    )}
                </Space>
            </div>

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
                    pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description="Nenhum serviço cadastrado" /> }}
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
