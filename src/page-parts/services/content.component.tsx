import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
    Button, Form, Input, InputNumber, Select, Space, Table, Tag,
    message, Tooltip, Divider, Alert, Switch, Modal,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import {
    PlusOutlined, DeleteOutlined, CalculatorOutlined, InfoCircleOutlined, SaveOutlined, SyncOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/hooks/use-auth.hook'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { calculateItemPrice } from '@/utils/calculate-item-price'
import { UNIT_MEASURE_ENUM } from '@/shared/enums/unit-measure-type'
import type { TaxPreviewResult } from '@/utils/calc-tax-preview'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import { calculatePricing } from '@/utils/pricing-engine'

const UNIT_LABELS: Record<string, string> = {
    G: 'g', KG: 'kg', ML: 'ml', L: 'l', MM: 'mm', CM: 'cm',
    M: 'm', KM: 'km', M2: 'm²', M3: 'm³', W: 'w', UN: 'un',
}

function fmt(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface RawItem {
    id: string; name: string; unit: string; cost_price: number; quantity: number; item_type?: string; measure_quantity?: number; cost_net?: number
}

interface TempItem {
    key: string
    item_id: string
    item_name: string
    unit: string
    needed_qty: number
    ref_qty: number
    ref_price: number
    proportional_cost: number
}

export interface ServiceContentProps {
    isEditing: boolean
    serviceData?: any
    items: RawItem[]
    expenseConfig: any
    taxPreview: TaxPreviewResult | null
}

export function ServiceContent({ isEditing, serviceData, items, expenseConfig, taxPreview }: ServiceContentProps) {
    const { currentUser } = useAuth()
    const router = useRouter()
    const [form] = Form.useForm()
    const [msgApi, ctx] = message.useMessage()
    const [saving, setSaving] = useState(false)

    const [tempItems, setTempItems] = useState<TempItem[]>([])
    const [addItemId, setAddItemId] = useState<string | null>(null)
    const [addItemQty, setAddItemQty] = useState<number>(1)

    const [taxableRegimePercent, setTaxableRegimePercent] = useState(0)
    const [commissionPercent, setCommissionPercent] = useState(0)
    const [profitPercent, setProfitPercent] = useState(0)
    const [additionalIrpjPercent, setAdditionalIrpjPercent] = useState<number>(
        serviceData?.additional_irpj_percent != null ? Number(serviceData.additional_irpj_percent) : 0
    )
    const [pisCofinsLRPct, setPisCofinsLRPct] = useState<number>(
        serviceData?.pis_cofins_pct != null ? Number(serviceData.pis_cofins_pct) : 0
    )
    const [ibsPct, setIbsPct] = useState<number>(
        serviceData?.ibs_pct != null ? Number(serviceData.ibs_pct) : 0
    )
    const [cbsPct, setCbsPct] = useState<number>(
        serviceData?.cbs_pct != null ? Number(serviceData.cbs_pct) : 0
    )
    const [isPct, setIsPct] = useState<number>(
        serviceData?.is_pct != null ? Number(serviceData.is_pct) : 0
    )
    const [ipiPct, setIpiPct] = useState<number>(
        serviceData?.ipi_pct != null ? Number(serviceData.ipi_pct) : 0
    )
    const isLucroRealSvcComp = currentUser?.taxableRegime === 'LUCRO_REAL'

    // IVA DUAL — fator de redução por serviço
    const [ivaDualReductionFactor, setIvaDualReductionFactor] = useState<number | null>(
        serviceData?.iva_dual_reduction_factor != null ? Number(serviceData.iva_dual_reduction_factor) : null
    )

    // Alíquotas de referência IBS/CBS do tenant (Lucro Real)
    const [ibsReferencePct, setIbsReferencePct] = useState<number>(0)
    const [cbsReferencePct, setCbsReferencePct] = useState<number>(0)

    useEffect(() => {
        if (!isLucroRealSvcComp) return
        async function fetchIvaRefRates() {
            const tenantId = currentUser?.tenant_id
            if (!tenantId) return
            const { data } = await (supabase as any)
                .from('tenant_settings')
                .select('ibs_reference_pct, cbs_reference_pct')
                .eq('tenant_id', tenantId)
                .single()
            if (data) {
                if (data.ibs_reference_pct != null) setIbsReferencePct(Number(data.ibs_reference_pct))
                if (data.cbs_reference_pct != null) setCbsReferencePct(Number(data.cbs_reference_pct))
            }
        }
        fetchIvaRefRates()
    }, [isLucroRealSvcComp, currentUser?.tenant_id])

    // Handler: fator IVA DUAL muda → auto-recalcula IBS e CBS
    function handleIvaDualFactorChange(factor: number | null) {
        setIvaDualReductionFactor(factor)
        if (factor != null && ibsReferencePct > 0) {
            setIbsPct(parseFloat((ibsReferencePct * (1 - factor / 100)).toFixed(4)))
        }
        if (factor != null && cbsReferencePct > 0) {
            setCbsPct(parseFloat((cbsReferencePct * (1 - factor / 100)).toFixed(4)))
        }
    }

    // Commission tables
    const [commissionTables, setCommissionTables] = useState<{ id: string; name: string; commission_percent: number }[]>([])
    const [commissionTableId, setCommissionTableId] = useState<string | null>(serviceData?.commission_table_id || null)
    const [commissionTableError, setCommissionTableError] = useState(false)

    useEffect(() => {
        async function loadTables() {
            const { data } = await (supabase as any)
                .from('commission_tables')
                .select('id, name, commission_percent')
                .eq('type', 'SERVICE')
                .order('name')
            if (data) setCommissionTables(data.map((t: any) => ({ ...t, commission_percent: Number(t.commission_percent) })))
        }
        loadTables()
    }, [])

    const [recurrenceActive, setRecurrenceActive] = useState<boolean>(serviceData?.recurrence_active ?? false)
    const [recurrenceModalOpen, setRecurrenceModalOpen] = useState(false)
    const [recurrenceDays, setRecurrenceDays] = useState<number | null>(serviceData?.recurrence_days ?? null)
    const [recurrenceMessage, setRecurrenceMessage] = useState<string>(serviceData?.recurrence_message ?? '')
    const recurrenceTextareaRef = useRef<HTMLTextAreaElement>(null)

    function insertRecurrenceTag(tag: string) {
        const textarea = recurrenceTextareaRef.current
        if (textarea) {
            const start = textarea.selectionStart ?? recurrenceMessage.length
            const end = textarea.selectionEnd ?? recurrenceMessage.length
            const newText = recurrenceMessage.substring(0, start) + tag + recurrenceMessage.substring(end)
            setRecurrenceMessage(newText)
            setTimeout(() => {
                textarea.focus()
                const newPos = start + tag.length
                textarea.setSelectionRange(newPos, newPos)
            }, 0)
        } else {
            setRecurrenceMessage(prev => prev + tag)
        }
    }

    useEffect(() => {
        if (isEditing && serviceData) {
            form.setFieldsValue({
                name: serviceData.name,
                description: serviceData.description || '',
                estimated_duration_minutes: serviceData.estimated_duration_minutes,
            })
            setRecurrenceActive(serviceData.recurrence_active ?? false)
            setRecurrenceDays(serviceData.recurrence_days ?? null)
            setRecurrenceMessage(serviceData.recurrence_message ?? '')

            const existingItems: TempItem[] = (serviceData.service_items || []).map((si: any, i: number) => {
                const item = si.item
                const measureQty = Number((item as any)?.measure_quantity) || 1
                const refQty = (Number(item?.quantity) || 1) * measureQty
                const refPrice = Number(item?.cost_price) || 0
                const neededQty = Number(si.quantity) || 0
                return {
                    key: `ex-${i}`,
                    item_id: si.item_id,
                    item_name: item?.name || '—',
                    unit: item?.unit || 'UN',
                    needed_qty: neededQty,
                    ref_qty: refQty,
                    ref_price: refPrice,
                    proportional_cost: calculateItemPrice(neededQty, refPrice, refQty),
                }
            })
            setTempItems(existingItems)

            setTaxableRegimePercent(serviceData.taxable_regime_percent || taxPreview?.taxableRegimePercent || currentUser?.taxableRegimeValue || 0)
            setCommissionPercent(serviceData.commission_percent || 0)
            setProfitPercent(serviceData.profit_percent || 0)
            if (serviceData.additional_irpj_percent != null) {
                setAdditionalIrpjPercent(Number(serviceData.additional_irpj_percent))
            }
            if (serviceData.pis_cofins_pct != null) {
                setPisCofinsLRPct(Number(serviceData.pis_cofins_pct))
            }
            if (serviceData.ibs_pct != null) setIbsPct(Number(serviceData.ibs_pct))
            if (serviceData.cbs_pct != null) setCbsPct(Number(serviceData.cbs_pct))
            if (serviceData.is_pct != null) setIsPct(Number(serviceData.is_pct))
            if (serviceData.ipi_pct != null) setIpiPct(Number(serviceData.ipi_pct))
            if (serviceData.iva_dual_reduction_factor != null) setIvaDualReductionFactor(Number(serviceData.iva_dual_reduction_factor))
        } else {
            setTaxableRegimePercent(taxPreview?.taxableRegimePercent ?? currentUser?.taxableRegimeValue ?? 0)
        }
    }, [isEditing, serviceData])

    const materialCost = useMemo(() =>
        tempItems.reduce((sum, t) => sum + t.proportional_cost, 0),
        [tempItems]
    )

    const pricing = useMemo(() => {
        const cfg = expenseConfig || {}
        // Usa custo Hub (média de meses encerrados); fallback para valor manual se Hub ainda não tem dados
        const laborCostMonthly = Number(cfg.production_labor_cost_hub) || Number(cfg.production_labor_cost) || 0
        const totalEmployees =
            (currentUser?.numProductiveSectorEmployee ?? 0) || 1
        const hoursPerMonth =
            currentUser?.unitMeasure === UNIT_MEASURE_ENUM.HOURS
                ? (currentUser?.monthlyWorkloadInMinutes || 0)
                : currentUser?.unitMeasure === UNIT_MEASURE_ENUM.DAYS
                    ? (currentUser?.monthlyWorkloadInMinutes || 0) * 8
                    : (currentUser?.monthlyWorkloadInMinutes || 0) / 60
        const hoursPerMonthSafe = hoursPerMonth > 0 ? hoursPerMonth : 176
        const monthlyWorkloadMinutes = totalEmployees * hoursPerMonthSafe * 60

        const fixedPct = Number(cfg.fixed_expense_percent) || 0
        const variablePct = Number(cfg.variable_expense_percent) || 0
        const financialPct = Number(cfg.financial_expense_percent) || 0
        const indirectLaborPct = Number(cfg.indirect_labor_percent) || 0
        // Para serviços: fixedPct e indirectLaborPct são incorporados no custo por minuto
        // Não entram no coeficiente de markup para evitar dupla contagem
        const structurePct = (variablePct + financialPct) / 100

        const taxesPct = taxPreview?.taxesPercent ?? 0
        const isLucroRealSvc = currentUser?.taxableRegime === 'LUCRO_REAL'
        let taxPct: number
        if (isLucroRealSvc) {
            const irpjPct = profitPercent * 0.15
            const csllPct = profitPercent * 0.09
            taxPct = (taxesPct + irpjPct + csllPct + additionalIrpjPercent) / 100
        } else {
            taxPct = (taxesPct + taxableRegimePercent) / 100
        }

        // Minutos de duração do serviço (productWorkloadMinutes para o motor)
        const productWorkloadMinutes = Number(form.getFieldValue('estimated_duration_minutes')) || 0

        // Para serviços: o custo mensal de MO inclui produtiva + administrativa + despesas fixas
        // Isso faz com que o custo por minuto (laborCostMonthly / monthlyWorkloadMinutes)
        // já contemple os 3 componentes quando multiplicado pelos minutos do serviço
        // MO Administrativa: média Hub (admin_salary_total) + FGTS + outros (já salvos pelo mergeExpenseConfig)
        const adminMonthlyTotal = Number(cfg.admin_salary_total || 0) +
            Number(cfg.admin_fgts_total || 0) +
            Number(cfg.admin_other_costs || 0)
        // Despesas Fixas: média Hub em R$/mês (novo campo)
        const fixedMonthlyTotal = Number(cfg.fixed_expense_monthly || 0)
        // Fórmula: (MO Produtiva + MO Adm + Desp. Fixas) / horas_equipe_produtiva / 60 = R$/min
        const combinedLaborCostMonthly = laborCostMonthly + adminMonthlyTotal + fixedMonthlyTotal

        const result = calculatePricing({
            calcType: 'SERVICO',
            totalItemsCost: materialCost,
            yieldQuantity: 1,
            laborCostMonthly: combinedLaborCostMonthly,
            numProductiveEmployees: totalEmployees,
            monthlyWorkloadMinutes,
            productWorkloadMinutes,
            structurePct,
            taxPct,
            commissionPct: commissionPercent / 100,
            profitPct: profitPercent / 100,
        })

        const priceUnit = result.isValid ? result.priceUnit : 0
        const laborCost = result.productiveLaborCost
        const totalCost = result.cmvUnit  // CMV inclui MO produtiva
        const sellingPrice = priceUnit
        // Custo por minuto: base do cálculo de MO produtiva
        const costPerMinute = monthlyWorkloadMinutes > 0
            ? combinedLaborCostMonthly / monthlyWorkloadMinutes
            : 0

        // Valores absolutos para exibição (calculados sobre priceUnit)
        const variableVal = Number((priceUnit * variablePct / 100).toFixed(2))
        const financialVal = Number((priceUnit * financialPct / 100).toFixed(2))
        const taxesVal = Number((priceUnit * taxesPct / 100).toFixed(2))
        const taxRegimeVal = Number((priceUnit * taxableRegimePercent / 100).toFixed(2))
        const commissionVal = result.commissionValue
        const profitVal = result.profitValue

        // LUCRO_REAL: IRPJ/CSLL/adicional derivados do lucro
        const irpjPctLR = isLucroRealSvc ? profitPercent * 0.15 : 0
        const csllPctLR = isLucroRealSvc ? profitPercent * 0.09 : 0
        const irpjValLR = isLucroRealSvc ? profitVal * 0.15 : 0
        const csllValLR = isLucroRealSvc ? profitVal * 0.09 : 0
        const adicionalIrpjValLR = isLucroRealSvc ? Number((priceUnit * additionalIrpjPercent / 100).toFixed(2)) : 0

        // MO administrativa e Despesas fixas incorporadas no custo por minuto
        const totalPct = isLucroRealSvc
            ? variablePct + financialPct + irpjPctLR + csllPctLR + additionalIrpjPercent + commissionPercent + profitPercent
            : variablePct + financialPct + taxesPct + taxableRegimePercent + commissionPercent + profitPercent
        const isValid = result.isValid

        return {
            laborCost, totalCost, sellingPrice, costPerMinute, totalEmployees,
            variablePct, financialPct, taxesPct,
            variableVal,
            financialVal,
            taxesVal,
            taxRegimeVal,
            irpjPctLR, csllPctLR, irpjValLR, csllValLR, adicionalIrpjValLR,
            commissionVal,
            profitVal,
            totalPct, isValid,
        }
    }, [materialCost, expenseConfig, currentUser, taxableRegimePercent, commissionPercent, profitPercent, taxPreview, form, additionalIrpjPercent])

    function handleAddItem() {
        if (!addItemId) return
        const it = items.find(i => i.id === addItemId)
        if (!it) return
        if (tempItems.some(t => t.item_id === addItemId)) { msgApi.warning('Item já adicionado.'); return }

        const measureQty = Number((it as any).measure_quantity) || 1
        const refQty = (Number(it.quantity) || 1) * measureQty
        const isLucroReal = currentUser?.taxableRegime === 'LUCRO_REAL'
        const itemCostNet = Number((it as any).cost_net) || 0
        // Para Lucro Real com cost_net calculado, usar custo líquido; caso contrário, custo bruto
        const effectiveCost = (isLucroReal && itemCostNet > 0) ? itemCostNet : it.cost_price
        const proportionalCost = calculateItemPrice(addItemQty, effectiveCost, refQty)
        setTempItems(prev => [...prev, {
            key: `n-${Date.now()}`,
            item_id: it.id,
            item_name: it.name,
            unit: it.unit,
            needed_qty: addItemQty,
            ref_qty: refQty,
            ref_price: effectiveCost,
            proportional_cost: proportionalCost,
        }])
        setAddItemId(null)
        setAddItemQty(1)
    }

    function handleQtyChange(key: string, val: number) {
        setTempItems(prev => prev.map(t => {
            if (t.key === key) {
                const newCost = calculateItemPrice(val, t.ref_price, t.ref_qty)
                return { ...t, needed_qty: val, proportional_cost: newCost }
            }
            return t
        }))
    }

    async function handleSave() {
        try {
            setSaving(true)
            const v = await form.validateFields()
            const tid = await getTenantId()
            if (!tid) { msgApi.error('Sessão expirada.'); return }

            if (!pricing.isValid) {
                msgApi.error('A soma das porcentagens de markup não pode ser ≥ 100%.')
                return
            }

            if (!commissionTableId) {
                setCommissionTableError(true)
                msgApi.error('Selecione a tabela de comissão antes de salvar.')
                return
            }
            setCommissionTableError(false)

            // Calcular impostos IBS/CBS/IS/IPI para LUCRO_REAL
            let svcFinalPrice = pricing.sellingPrice
            let svcIsVal = 0, svcIbsVal = 0, svcCbsVal = 0, svcIpiVal = 0
            if (isLucroRealSvcComp) {
                const _pisCof = pisCofinsLRPct || 0
                const _grossDen = _pisCof > 0 ? (100 - _pisCof) / 100 : 1
                const _grossed = _grossDen > 0 ? pricing.sellingPrice / _grossDen : pricing.sellingPrice
                const _pisCofVal = _grossed * _pisCof / 100
                const _ibsCbsBase = Math.max(0, pricing.sellingPrice - _pisCofVal)
                svcIsVal = _ibsCbsBase * (isPct || 0) / 100
                const _ibsCbsWithIs = _ibsCbsBase + svcIsVal
                svcIbsVal = _ibsCbsWithIs * (ibsPct || 0) / 100
                svcCbsVal = _ibsCbsWithIs * (cbsPct || 0) / 100
                svcIpiVal = pricing.sellingPrice * (ipiPct || 0) / 100
                const totalTax = svcIsVal + svcIbsVal + svcCbsVal + svcIpiVal
                if (totalTax > 0) svcFinalPrice = pricing.sellingPrice + totalTax
            }

            const data: Record<string, any> = {
                name: v.name,
                description: v.description || null,
                estimated_duration_minutes: v.estimated_duration_minutes || 60,
                base_price: svcFinalPrice,
                cost_total: pricing.totalCost,
                labor_minutes: v.estimated_duration_minutes || 60,
                labor_cost: pricing.laborCost,
                commission_percent: commissionPercent,
                profit_percent: profitPercent,
                taxable_regime_percent: taxableRegimePercent,
                additional_irpj_percent: additionalIrpjPercent || 0,
                pis_cofins_pct: isLucroRealSvcComp ? (pisCofinsLRPct || 0) : 0,
                commission_table_id: commissionTableId || null,
                min_quantity: 0,
                taxes_launched: true,
                is_pct: isLucroRealSvcComp ? (isPct || 0) : 0,
                is_value: isLucroRealSvcComp ? svcIsVal : 0,
                ibs_pct: isLucroRealSvcComp ? (ibsPct || 0) : 0,
                ibs_value: isLucroRealSvcComp ? svcIbsVal : 0,
                cbs_pct: isLucroRealSvcComp ? (cbsPct || 0) : 0,
                cbs_value: isLucroRealSvcComp ? svcCbsVal : 0,
                ipi_pct: isLucroRealSvcComp ? (ipiPct || 0) : 0,
                ipi_value: isLucroRealSvcComp ? svcIpiVal : 0,
                sale_price_base: isLucroRealSvcComp ? pricing.sellingPrice : null,
                sale_price_after_taxes: isLucroRealSvcComp ? svcFinalPrice : null,
                valor_precificado_icms_piscofins: isLucroRealSvcComp ? pricing.sellingPrice : null,
                iva_dual_reduction_factor: isLucroRealSvcComp ? (ivaDualReductionFactor ?? null) : null,
                recurrence_active: recurrenceActive,
                recurrence_days: recurrenceActive && recurrenceDays ? recurrenceDays : null,
                recurrence_message: recurrenceActive && recurrenceMessage ? recurrenceMessage : null,
                updated_at: new Date().toISOString(),
            }

            let svcId: string

            const sb = supabase as any
            if (isEditing && serviceData?.id) {
                const { error } = await sb.from('services').update(data).eq('id', serviceData.id)
                if (error) throw error
                svcId = serviceData.id
                await sb.from('service_items').delete().eq('service_id', svcId)
            } else {
                const { data: d, error } = await sb.from('services')
                    .insert({ ...data, tenant_id: tid })
                    .select('id').single()
                if (error) throw error
                svcId = d.id

                // Auto-generate service code — numeric, unique across products + services
                const [{ data: productCodes }, { data: serviceCodes }] = await Promise.all([
                    sb.from('products').select('code').eq('tenant_id', tid),
                    sb.from('services').select('code').eq('tenant_id', tid).neq('id', svcId),
                ])
                let maxNum = 1000
                for (const p of (productCodes || [])) {
                    const n = parseInt(p.code, 10)
                    if (!isNaN(n) && n > maxNum) maxNum = n
                }
                for (const s of (serviceCodes || [])) {
                    const n = parseInt(s.code, 10)
                    if (!isNaN(n) && n > maxNum) maxNum = n
                }
                await sb.from('services').update({ code: String(maxNum + 1) }).eq('id', svcId)
            }

            if (tempItems.length > 0) {
                const costPerUnit = (refQty: number, refPrice: number) => (refQty > 0 ? refPrice / refQty : 0)
                const { error } = await sb.from('service_items').insert(
                    tempItems.map((t: any) => ({
                        service_id: svcId,
                        item_id: t.item_id,
                        quantity: t.needed_qty,
                        cost_per_base_unit: costPerUnit(t.ref_qty, t.ref_price),
                        item_quantity_snapshot: t.ref_qty,
                    }))
                )
                if (error) throw error
            }

            msgApi.success(isEditing ? 'Serviço atualizado!' : 'Serviço cadastrado!')
            router.push(ROUTES.SERVICES)
        } catch (e: any) {
            msgApi.error(e.message || 'Preencha os campos.')
        } finally { setSaving(false) }
    }

    const isSN = !!taxPreview?.regimeLabel?.includes('Simples Nacional')
    const isLucroRealDisplay = currentUser?.taxableRegime === 'LUCRO_REAL'

    const tempItemCols: ColumnsType<TempItem> = [
        {
            title: 'Item / Insumo', dataIndex: 'item_name', key: 'n',
            render: (n: string, r: TempItem) => (
                <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{n}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                        Embalagem: {r.ref_qty} {UNIT_LABELS[r.unit] || r.unit} — {fmt(r.ref_price)}
                    </div>
                </div>
            ),
        },
        {
            title: 'Qtd Usada', key: 'qty', width: 140, align: 'center',
            render: (_: any, r: TempItem) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <InputNumber
                        size="small"
                        min={0.01}
                        step={0.1}
                        value={r.needed_qty}
                        onChange={(val) => handleQtyChange(r.key, val ?? 0.01)}
                        parser={(v) => {
                            const raw = String(v ?? '').replace(',', '.').trim()
                            const n = parseFloat(raw)
                            return isNaN(n) || n < 0.01 ? 0.01 : n
                        }}
                        style={{ width: 80 }}
                    />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{UNIT_LABELS[r.unit] || r.unit}</span>
                </div>
            ),
        },
        {
            title: 'Custo Prop.', key: 'cost', width: 130, align: 'right',
            render: (_: any, r: TempItem) => (
                <Tooltip title={`(${r.needed_qty} × ${fmt(r.ref_price)}) ÷ ${r.ref_qty} = ${fmt(r.proportional_cost)}`}>
                    <span style={{ fontWeight: 600, color: '#B42318' }}>{fmt(r.proportional_cost)}</span>
                </Tooltip>
            ),
        },
        {
            title: '', key: 'rm', width: 40,
            render: (_: any, r: TempItem) => (
                <Button type="text" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => setTempItems(p => p.filter(t => t.key !== r.key))} />
            ),
        },
    ]

    function pricingRow(label: string, pct: number, val: number, editable?: 'commission' | 'profit' | 'tax' | 'additionalIrpj' | 'pisCofins', tooltipText?: string) {
        return (
            <tr key={label}>
                <td style={{ width: 140, padding: '6px 0' }}>
                    {editable ? (
                        <InputNumber
                            size="small" min={0} max={100} step={0.001} precision={3}
                            value={pct}
                            onChange={(v) => {
                                if (editable === 'commission') setCommissionPercent(v ?? 0)
                                if (editable === 'profit') setProfitPercent(v ?? 0)
                                if (editable === 'tax') setTaxableRegimePercent(v ?? 0)
                                if (editable === 'additionalIrpj') setAdditionalIrpjPercent(v ?? 0)
                                if (editable === 'pisCofins') setPisCofinsLRPct(v ?? 0)
                            }}
                            style={{ width: 110 }}
                            formatter={(v) => `${v}%`}
                            parser={(v) => {
                                const raw = (v || '0').toString().replace('%', '').replace(',', '.').trim()
                                const n = Number(raw)
                                return isNaN(n) ? 0 : n
                            }}
                        />
                    ) : (
                        <span style={{
                            display: 'inline-block', padding: '4px 12px', background: 'rgba(255,255,255,0.06)',
                            borderRadius: 4, fontSize: 13, minWidth: 80, textAlign: 'right',
                        }}>
                            {pct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
                        </span>
                    )}
                </td>
                <td style={{ padding: '6px 12px', fontSize: 13 }}>
                    {tooltipText ? <Tooltip title={tooltipText}><span style={{ cursor: 'help' }}>{label}</span></Tooltip> : label}
                </td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>
                    R$ {getMonetaryValue(val)}
                </td>
            </tr>
        )
    }

    const displayTaxPct = isSN ? taxableRegimePercent : pricing.taxesPct
    const displayTaxVal = isSN ? pricing.taxRegimeVal : pricing.taxesVal
    const taxLabel = isSN
        ? `Impostos (DAS — ${taxPreview?.regimeLabel})`
        : taxPreview?.isMei ? 'Impostos (MEI — DAS fixo)' : 'Impostos'

    return (
        <>
            {ctx}
            <header className="flex justify-between mb-4">
                <h1 className="text-3xl">{isEditing ? 'Editar Serviço' : 'Novo Serviço'}</h1>
            </header>

            {/* Basic Info */}
            <div className="pc-card" style={{ marginBottom: 16 }}>
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="Nome do Serviço" rules={[{ required: true, message: 'Informe o nome' }]}>
                        <Input placeholder="Ex: Tintura, Corte masculino, Manicure..." size="large"
                            onChange={(e) => {
                                const v = e.target.value
                                if (v.length > 0 && v[0] !== v[0].toUpperCase()) {
                                    form.setFieldsValue({ name: v.charAt(0).toUpperCase() + v.slice(1) })
                                }
                            }} />
                    </Form.Item>
                    <Form.Item name="description" label="Descrição">
                        <Input.TextArea rows={2} placeholder="Descrição do serviço (opcional)" />
                    </Form.Item>
                    <Form.Item
                        label={
                            <span>
                                Ativar Recorrência de vendas&nbsp;
                                <Tooltip title="Ativa o contato automático com o cliente após a venda. Configure o prazo em dias e uma mensagem personalizada por serviço.">
                                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                                </Tooltip>
                            </span>
                        }
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Switch
                                checked={recurrenceActive}
                                onChange={(checked) => {
                                    setRecurrenceActive(checked)
                                    if (checked) setRecurrenceModalOpen(true)
                                }}
                                checkedChildren={<SyncOutlined />}
                            />
                            {recurrenceActive && (
                                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                                    {recurrenceDays ? `${recurrenceDays} dias` : 'Sem prazo definido'}
                                    {recurrenceMessage ? ' · Mensagem personalizada' : ''}
                                </span>
                            )}
                            {recurrenceActive && (
                                <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setRecurrenceModalOpen(true)}>
                                    Configurar
                                </Button>
                            )}
                        </div>
                    </Form.Item>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                            Tabela de Comissão <span style={{ color: '#f04438' }}>*</span>
                        </label>
                        <Select
                            placeholder="Selecione a tabela de comissão"
                            style={{ width: '100%' }}
                            value={commissionTableId}
                            status={commissionTableError ? 'error' : undefined}
                            options={commissionTables.map(t => ({ value: t.id, label: `${t.name} — ${t.commission_percent}%` }))}
                            showSearch
                            filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                            onChange={(tableId: string) => {
                                setCommissionTableId(tableId)
                                setCommissionTableError(false)
                                const table = commissionTables.find(t => t.id === tableId)
                                if (table) setCommissionPercent(Number(table.commission_percent) || 0)
                            }}
                        />
                        {commissionTableError && (
                            <div style={{ color: '#f04438', fontSize: 12, marginTop: 4 }}>Selecione a tabela de comissão!</div>
                        )}
                    </div>

                    <Modal
                        title="Configurar Recorrência"
                        open={recurrenceModalOpen}
                        onOk={() => setRecurrenceModalOpen(false)}
                        onCancel={() => setRecurrenceModalOpen(false)}
                        okText="Confirmar"
                        cancelText="Fechar"
                        width={560}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                                    Dias para disparo&nbsp;
                                    <Tooltip title="Quantos dias após a venda o cliente será contatado.">
                                        <InfoCircleOutlined style={{ color: '#64748b' }} />
                                    </Tooltip>
                                </div>
                                <InputNumber
                                    min={1}
                                    step={1}
                                    style={{ width: '100%' }}
                                    placeholder="Ex: 30"
                                    value={recurrenceDays}
                                    onChange={(v) => setRecurrenceDays(v)}
                                    addonAfter="dias"
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                                    Mensagem personalizada (opcional)&nbsp;
                                    <Tooltip title="Mensagem específica para este serviço. Se vazio, será usada a mensagem padrão da aba Recorrência.">
                                        <InfoCircleOutlined style={{ color: '#64748b' }} />
                                    </Tooltip>
                                </div>
                                <div style={{ marginBottom: 8, fontSize: 12, color: '#94a3b8' }}>
                                    Clique nas tags para inserir na mensagem:{' '}
                                    <Tag color="blue" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => insertRecurrenceTag('{{nome_cliente}}')}>
                                        {'{{nome_cliente}}'}
                                    </Tag>{' '}
                                    <Tag color="blue" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => insertRecurrenceTag('{{nome_produto}}')}>
                                        {'{{nome_produto}}'}
                                    </Tag>
                                </div>
                                <Input.TextArea
                                    ref={recurrenceTextareaRef as any}
                                    rows={4}
                                    placeholder="Olá {{nome_cliente}}, lembrete sobre {{nome_produto}}..."
                                    value={recurrenceMessage}
                                    onChange={(e) => setRecurrenceMessage(e.target.value)}
                                />
                            </div>
                        </div>
                    </Modal>
                </Form>
            </div>

            {/* Materials */}
            <div className="pc-card" style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Matéria-Prima / Insumos</h3>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        Adicione os itens consumidos na execução do serviço. O custo é proporcional à embalagem original.
                    </span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <Select placeholder="Selecione um insumo" value={addItemId} onChange={setAddItemId}
                        showSearch optionFilterProp="children" style={{ flex: 1 }} allowClear>
                        {items.map(it => (
                            <Select.Option key={it.id} value={it.id}>
                                {it.name} ({it.quantity} {UNIT_LABELS[it.unit] || it.unit}) — {fmt(it.cost_price)}
                            </Select.Option>
                        ))}
                    </Select>
                    <InputNumber
                        min={0.01}
                        step={0.1}
                        value={addItemQty}
                        onChange={(v) => setAddItemQty(v ?? 0.01)}
                        parser={(v) => {
                            const raw = String(v ?? '').replace(',', '.').trim()
                            const n = parseFloat(raw)
                            return isNaN(n) || n < 0.01 ? 0.01 : n
                        }}
                        style={{ width: 80 }}
                        placeholder="Qtd"
                    />
                    <Button icon={<PlusOutlined />} onClick={handleAddItem} disabled={!addItemId}>Adicionar</Button>
                </div>

                {tempItems.length > 0 ? (
                    <>
                        <Table columns={tempItemCols} dataSource={tempItems} rowKey="key" pagination={false} size="small" />
                        <div style={{
                            display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                            padding: '10px 14px', borderRadius: 6, marginTop: 8,
                        }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#B42318' }}>
                                Total: {fmt(materialCost)}
                            </span>
                        </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 13 }}>
                        Nenhum material adicionado. Selecione insumos para calcular o custo.
                    </div>
                )}
            </div>

            {/* Mão de obra produtiva — input de minutos */}
            <div className="pc-card" style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Mão de obra produtiva</h3>
                {pricing.costPerMinute > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                        background: 'rgba(247,144,9,0.08)', border: '1px solid rgba(247,144,9,0.25)',
                        borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#94a3b8' }}>Custo/minuto por funcionário:</span>
                            <span style={{ fontWeight: 700, color: '#F79009', fontSize: 14 }}>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(pricing.costPerMinute)}
                            </span>
                        </div>
                        <div style={{ color: '#64748b' }}>·</div>
                        <div style={{ color: '#94a3b8' }}>
                            {pricing.totalEmployees} funcionário{pricing.totalEmployees !== 1 ? 's' : ''} produtivo{pricing.totalEmployees !== 1 ? 's' : ''}
                        </div>
                        <Tooltip title={`Fórmula: (MO Produtiva + MO Administrativa + Despesas Fixas) ÷ horas/funcionário ÷ 60 ÷ nº funcionários\nExemplo: total mensal ÷ ${pricing.totalEmployees} func. ÷ horas ÷ 60 = R$/min por funcionário`}>
                            <InfoCircleOutlined style={{ color: '#64748b', cursor: 'help' }} />
                        </Tooltip>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '36%', padding: '8px 16px', fontSize: 14 }}>Mão de obra produtiva</div>
                    <div style={{ width: '20%', padding: '4px 8px' }}>
                        <Form form={form}>
                            <Form.Item name="estimated_duration_minutes" noStyle initialValue={60}>
                                <InputNumber
                                    min={1}
                                    step={1}
                                    style={{ width: '100%' }}
                                    placeholder="Ex: 60"
                                    addonAfter="min"
                                    size="large"
                                />
                            </Form.Item>
                        </Form>
                    </div>
                    <div style={{ width: '15%', padding: '4px 8px', fontWeight: 700, fontSize: 15, color: '#B42318' }}>
                        {fmt(pricing.laborCost)}
                    </div>
                    <div style={{ width: '29%', padding: '4px 8px', fontSize: 11, color: '#94a3b8' }}>
                        {pricing.costPerMinute > 0
                            ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(pricing.costPerMinute)}/min × ${form.getFieldValue('estimated_duration_minutes') || 60} min (${pricing.totalEmployees} func.)`
                            : 'MO direta + administrativa + desp. fixas'}
                    </div>
                </div>
            </div>

            {/* Pricing */}
            <div className="pc-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                        <CalculatorOutlined style={{ marginRight: 6, color: '#F79009' }} />
                        Precificação do Serviço
                    </h3>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Custo serviço</div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#B42318' }}>{fmt(pricing.totalCost)}</div>
                    </div>
                </div>

                {taxPreview?.isMei && (
                    <div style={{
                        background: '#FFFBE6', border: '1px solid #FFE58F', borderRadius: 8,
                        padding: '8px 14px', fontSize: 12, color: '#614700', marginBottom: 12,
                    }}>
                        <strong>MEI:</strong> Impostos não são calculados por serviço. O DAS mensal é fixo e independente do faturamento.
                    </div>
                )}

                {!pricing.isValid && (
                    <Alert type="error" showIcon style={{ marginBottom: 12 }}
                        message="A soma das porcentagens de markup não pode ser ≥ 100%. Ajuste os valores." />
                )}

                <div style={{ background: '#0a1628', borderRadius: 8, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 2px' }}>
                        <thead>
                            <tr style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' as const }}>
                                <th style={{ textAlign: 'left', padding: '0 0 8px', width: 140 }}>%</th>
                                <th style={{ textAlign: 'left', padding: '0 12px 8px' }}>Despesa</th>
                                <th style={{ textAlign: 'right', padding: '0 0 8px' }}>Valor (R$)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pricingRow('Despesas variáveis', pricing.variablePct, pricing.variableVal)}
                            {pricingRow('Despesas financeiras', pricing.financialPct, pricing.financialVal)}
                            {isSN
                                ? pricingRow(taxLabel, displayTaxPct, displayTaxVal, 'tax')
                                : pricingRow(taxLabel, displayTaxPct, displayTaxVal)
                            }
                            {!isSN && !taxPreview?.isMei && !isLucroRealDisplay && pricingRow(
                                `Impostos${taxPreview?.regimeLabel ? ` (${taxPreview.regimeLabel})` : ''}`,
                                taxableRegimePercent, pricing.taxRegimeVal, 'tax'
                            )}
                            {pricingRow('Comissão', commissionPercent, pricing.commissionVal, 'commission')}
                            {pricingRow('Lucro', profitPercent, pricing.profitVal, 'profit')}
                            {isLucroRealDisplay && pricingRow('IRPJ (15% sobre lucro)', pricing.irpjPctLR, pricing.irpjValLR, undefined, 'Imposto de Renda Pessoa Jurídica — calculado automaticamente como 15% sobre o valor do lucro.')}
                            {isLucroRealDisplay && pricingRow('CSLL (9% sobre lucro)', pricing.csllPctLR, pricing.csllValLR, undefined, 'Contribuição Social sobre o Lucro Líquido — calculada automaticamente como 9% sobre o valor do lucro.')}
                            {isLucroRealDisplay && pricingRow('Alíq. adicional IRPJ', additionalIrpjPercent, pricing.adicionalIrpjValLR, 'additionalIrpj', 'Alíquota da parcela adicional do IRPJ. Informe manualmente conforme enquadramento.')}
                            {isLucroRealDisplay && pricingRow('PIS/Cofins (%)', pisCofinsLRPct, pricing.sellingPrice * pisCofinsLRPct / 100, 'pisCofins', 'PIS + COFINS — informe manualmente para serviços (regime não cumulativo).')}
                        </tbody>
                    </table>

                    <Divider style={{ margin: '12px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8' }}>Margem de contribuição total aplicada</span>
                        <span style={{ fontWeight: 600 }}>{(100 - pricing.totalPct).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</span>
                    </div>

                    {isLucroRealDisplay && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, marginTop: 4 }}>
                            <span style={{ color: '#64748b' }}>Valor do produto precificado com ICMS, PIS/COFINS</span>
                            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(pricing.sellingPrice)}</span>
                        </div>
                    )}

                    {/* Fator de redução IVA DUAL — apenas LUCRO_REAL */}
                    {isLucroRealDisplay && (
                        <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                                Fator de Redução da Alíquota do IVA DUAL
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Select
                                    placeholder="Selecione o fator (%)"
                                    value={ivaDualReductionFactor}
                                    onChange={(val) => handleIvaDualFactorChange(val)}
                                    style={{ width: 220 }}
                                    allowClear
                                >
                                    {[30, 40, 50, 60, 70].map(v => (
                                        <Select.Option key={v} value={v}>{v}%</Select.Option>
                                    ))}
                                </Select>
                                {ivaDualReductionFactor != null && (ibsReferencePct > 0 || cbsReferencePct > 0) && (
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        IBS: {parseFloat((ibsReferencePct * (1 - ivaDualReductionFactor / 100)).toFixed(4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
                                        &nbsp;·&nbsp;
                                        CBS: {parseFloat((cbsReferencePct * (1 - ivaDualReductionFactor / 100)).toFixed(4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* IBS / CBS — apenas LUCRO_REAL */}
                    {isLucroRealDisplay && (() => {
                        const _pisCof = pisCofinsLRPct || 0
                        const _grossDen = _pisCof > 0 ? (100 - _pisCof) / 100 : 1
                        const _grossed = _grossDen > 0 ? pricing.sellingPrice / _grossDen : pricing.sellingPrice
                        const _pisCofVal = _grossed * _pisCof / 100
                        const _ibsCbsBase = Math.max(0, pricing.sellingPrice - _pisCofVal)
                        const _isVal = _ibsCbsBase * (isPct || 0) / 100
                        const _ibsCbsWithIs = _ibsCbsBase + _isVal
                        const _ibsVal = _ibsCbsWithIs * (ibsPct || 0) / 100
                        const _cbsVal = _ibsCbsWithIs * (cbsPct || 0) / 100
                        const _ipiVal = pricing.sellingPrice * (ipiPct || 0) / 100
                        const _total = _isVal + _ibsVal + _cbsVal + _ipiVal
                        const _finalPrice = _total > 0 ? pricing.sellingPrice + _total : pricing.sellingPrice
                        const ibsCbsRows = [
                            { label: 'IBS — Imposto sobre Bens e Serv. (%)', value: ibsPct, setter: setIbsPct, taxValue: _ibsVal },
                            { label: 'CBS — Contrib. sobre Bens e Serv. (%)', value: cbsPct, setter: setCbsPct, taxValue: _cbsVal },
                        ] as { label: string; value: number; setter: (v: number) => void; taxValue: number }[]
                        const isIpiRows = [
                            { label: 'IS — Imposto Seletivo (%)', value: isPct, setter: setIsPct, taxValue: _isVal },
                            { label: 'IPI (%)', value: ipiPct, setter: setIpiPct, taxValue: _ipiVal },
                        ] as { label: string; value: number; setter: (v: number) => void; taxValue: number }[]
                        const renderRow = ({ label, value, setter, taxValue }: { label: string; value: number; setter: (v: number) => void; taxValue: number }) => (
                            <tr key={label}>
                                <td style={{ fontSize: 13, color: '#cbd5e1', paddingRight: 12, paddingTop: 4, paddingBottom: 4 }}>{label}</td>
                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' as const }}>
                                    <InputNumber
                                        size="small" min={0} max={100} step={0.01} precision={2}
                                        value={value}
                                        onChange={(v) => setter(v ?? 0)}
                                        style={{ width: 110 }}
                                        formatter={(v) => {
                                            if (v == null || v === '') return '%'
                                            const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
                                            if (isNaN(n)) return '%'
                                            return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
                                        }}
                                        parser={(v) => {
                                            const raw = (v || '0').toString().replace('%', '').replace(/\./g, '').replace(',', '.').trim()
                                            const n = Number(raw)
                                            return isNaN(n) ? 0 : n
                                        }}
                                    />
                                    <span style={{ marginLeft: 10, fontSize: 12, color: taxValue > 0 ? '#4ade80' : '#64748b', minWidth: 80, display: 'inline-block', textAlign: 'right' }}>
                                        {fmt(taxValue)}
                                    </span>
                                </td>
                            </tr>
                        )
                        return (
                            <>
                                <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 10 }}>
                                        Impostos (IBS / CBS)
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                                        <tbody>{ibsCbsRows.map(renderRow)}</tbody>
                                    </table>
                                </div>

                                <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 10 }}>
                                        Impostos (IS / IPI)
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                                        <tbody>{isIpiRows.map(renderRow)}</tbody>
                                    </table>
                                </div>

                                {_total > 0 && (
                                    <div style={{ background: '#1a1a2e', padding: 12, borderRadius: 8, fontSize: 12, marginTop: 10 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ color: '#94a3b8' }}>Preço base</span>
                                            <span>{fmt(pricing.sellingPrice)}</span>
                                        </div>
                                        {_isVal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#94a3b8' }}>+ IS</span><span>{fmt(_isVal)}</span></div>}
                                        {_ibsVal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#94a3b8' }}>+ IBS</span><span>{fmt(_ibsVal)}</span></div>}
                                        {_cbsVal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#94a3b8' }}>+ CBS</span><span>{fmt(_cbsVal)}</span></div>}
                                        {_ipiVal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#94a3b8' }}>+ IPI</span><span>{fmt(_ipiVal)}</span></div>}
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                            <span style={{ color: '#4ade80' }}>Preço Final com Impostos</span>
                                            <span style={{ color: '#4ade80' }}>{fmt(_finalPrice)}</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )
                    })()}

                    <div style={{
                        padding: '16px 20px', borderRadius: 8, marginTop: 12,
                        background: pricing.isValid && pricing.sellingPrice > 0 ? '#ECFDF5' : '#FEF2F2',
                        border: `1px solid ${pricing.isValid && pricing.sellingPrice > 0 ? '#6CE9A6' : '#FDA29B'}`,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                                    Preço de Venda Sugerido
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: pricing.isValid ? '#027A48' : '#B42318' }}>
                                    {fmt(pricing.sellingPrice)}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Lucro líquido</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: pricing.profitVal >= 0 ? '#027A48' : '#B42318' }}>
                                    {fmt(pricing.profitVal)}
                                </div>
                                {pricing.sellingPrice > 0 && (
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                        Margem: {profitPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {pricing.sellingPrice > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Composição do preço</div>
                            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                                <Tooltip title={`Custo: ${fmt(pricing.totalCost)}`}>
                                    <div style={{ width: `${(pricing.totalCost / pricing.sellingPrice) * 100}%`, background: '#F04438' }} />
                                </Tooltip>
                                <Tooltip title={`Despesas: ${fmt(pricing.variableVal + pricing.financialVal)}`}>
                                    <div style={{ width: `${((pricing.variableVal + pricing.financialVal) / pricing.sellingPrice) * 100}%`, background: '#F79009' }} />
                                </Tooltip>
                                <Tooltip title={`Impostos: ${fmt(isLucroRealDisplay ? pricing.irpjValLR + pricing.csllValLR + pricing.adicionalIrpjValLR : displayTaxVal + (isSN ? 0 : pricing.taxRegimeVal))}`}>
                                    <div style={{ width: `${((isLucroRealDisplay ? pricing.irpjValLR + pricing.csllValLR + pricing.adicionalIrpjValLR : displayTaxVal + (isSN ? 0 : pricing.taxRegimeVal)) / pricing.sellingPrice) * 100}%`, background: '#667085' }} />
                                </Tooltip>
                                <Tooltip title={`Comissão: ${fmt(pricing.commissionVal)}`}>
                                    <div style={{ width: `${(pricing.commissionVal / pricing.sellingPrice) * 100}%`, background: '#7A5AF8' }} />
                                </Tooltip>
                                <Tooltip title={`Lucro: ${fmt(pricing.profitVal)}`}>
                                    <div style={{ width: `${(pricing.profitVal / pricing.sellingPrice) * 100}%`, background: '#12B76A' }} />
                                </Tooltip>
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#94a3b8', flexWrap: 'wrap' }}>
                                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#F04438', marginRight: 3 }} />Custo</span>
                                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#F79009', marginRight: 3 }} />Despesas</span>
                                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#667085', marginRight: 3 }} />Impostos</span>
                                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#7A5AF8', marginRight: 3 }} />Comissão</span>
                                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#12B76A', marginRight: 3 }} />Lucro</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <footer className="flex flex-row-reverse mt-5 mr-4" style={{ gap: 8 }}>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                    Salvar
                </Button>
                <Button onClick={() => router.push(ROUTES.SERVICES)}>Cancelar</Button>
            </footer>
        </>
    )
}
