import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
    Button, Form, Input, InputNumber, Space, Table, Tag,
    message, Tooltip, Divider, Alert, Switch, Modal,
} from 'antd'
import { Select } from '@/components/ui/app-select.component'
import type { ColumnsType } from 'antd/es/table'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import {
    PlusOutlined, DeleteOutlined, CalculatorOutlined, InfoCircleOutlined, SaveOutlined, SyncOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/hooks/use-auth.hook'
import { useDevice } from '@/contexts/device.context'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { PercentInput } from '@/components/percent-input.component'
import { calculateItemPrice } from '@/utils/calculate-item-price'
import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'
import type { TaxPreviewResult } from '@/utils/calc-tax-preview'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import { calculatePricing } from '@/utils/pricing-engine'
import { computeIvaDualOutside } from '@/utils/iva-dual-outside'
import { resolveIvaDualEffectiveRate } from '@/utils/item-tax-rates'
import {
    composeServiceMarkup,
    firstConfiguredPercent,
    readRegisteredPercent,
    resolveServiceTaxableRegimePercent,
} from '@/utils/service-tax-composition'

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
    ref_price: number          // LÍQUIDO (cost_net) p/ regimes com impostos no item; senão BRUTO
    ref_price_gross?: number   // BRUTO (cost_gross) — preenchido p/ regimes com impostos no item
    unit_gross?: number        // "Valor unitário" cheio (cost_gross) — exibição
    unit_net?: number          // "Valor custo líquido" cheio (cost_net) — exibição
    proportional_cost: number
    proportional_cost_gross?: number
    has_item_taxes?: boolean
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
    // Card de resultado: mesma regra de responsividade do card de Produto —
    // no mobile a coluna de lucro é ocultada e o preço fica centralizado.
    const { isMobile } = useDevice()
    const router = useRouter()
    const [form] = Form.useForm()
    const [msgApi, ctx] = message.useMessage()
    const [saving, setSaving] = useState(false)
    // T9 — reatividade dos minutos de duração (Form.useWatch recalcula o useMemo ao digitar)
    const watchedDurationMinutes = Form.useWatch('estimated_duration_minutes', form)

    const [tempItems, setTempItems] = useState<TempItem[]>([])
    const [addItemId, setAddItemId] = useState<string | null>(null)
    const [addItemQty, setAddItemQty] = useState<number>(1)

    const [taxableRegimePercent, setTaxableRegimePercent] = useState(0)
    const [commissionPercent, setCommissionPercent] = useState(0)
    const [profitPercent, setProfitPercent] = useState(0)
    // EPIC-RT v8: RT (Comissão Reserva Técnica) — paridade com Produtos. Dedução gerencial
    // paralela a comissão/lucro, aplicável em qualquer regime (sem condicional de segmentação).
    const [rtReservePercent, setRtReservePercent] = useState(0)
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

    // ───── S15 (EPIC-RR-V2): 7 alíquotas tributárias adicionais (base 100 na UI, decimal no DB) ─────
    const [issPctSvc, setIssPctSvc] = useState<number>(
        (serviceData as any)?.iss_pct != null ? Number((serviceData as any).iss_pct) * 100 : 0
    )
    const [issRetidoPctSvc, setIssRetidoPctSvc] = useState<number>(
        (serviceData as any)?.iss_retido_pct != null ? Number((serviceData as any).iss_retido_pct) * 100 : 0
    )
    // EPIC-POR-FORA-V3 / S1: estados icmsStPctSvc/difalPctSvc/fcpPctSvc removidos (não se aplicam a serviço).
    const [irpjItemPctSvc, setIrpjItemPctSvc] = useState<number>(
        (serviceData as any)?.irpj_pct != null ? Number((serviceData as any).irpj_pct) * 100 : 0
    )
    const [csllItemPctSvc, setCsllItemPctSvc] = useState<number>(
        (serviceData as any)?.csll_pct != null ? Number((serviceData as any).csll_pct) * 100 : 0
    )
    // MEI: o DAS é fixo e independe do faturamento — imposto NUNCA entra na formação do
    // preço. `taxPreview.isMei` é a fonte canônica; `currentUser.taxableRegime` cobre o
    // intervalo em que o preview ainda não chegou.
    const isMeiSvcComp = taxPreview?.isMei === true || currentUser?.taxableRegime === 'MEI'
    const isLucroRealSvcComp = currentUser?.taxableRegime === 'LUCRO_REAL'
    const isLucroPresumidoSvcComp = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
    const isLpRetSvcComp = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO_RET'
    const isSHSvcComp = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'
    const isLRorLPSvcComp = isLucroRealSvcComp || isLucroPresumidoSvcComp || isLpRetSvcComp
    const isLRorLPorSHSvcComp = isLRorLPSvcComp || isSHSvcComp

    // IVA DUAL — fator de redução por serviço
    const [ivaDualReductionFactor, setIvaDualReductionFactor] = useState<number | null>(
        serviceData?.iva_dual_reduction_factor != null ? Number(serviceData.iva_dual_reduction_factor) : null
    )

    // Alíquotas de referência IBS/CBS (ADR-022: prefere o snapshot do serviço; tenant é fallback)
    const [ibsReferencePct, setIbsReferencePct] = useState<number>(
        serviceData?.ibs_reference_pct != null ? Number(serviceData.ibs_reference_pct) : 0
    )
    const [cbsReferencePct, setCbsReferencePct] = useState<number>(
        serviceData?.cbs_reference_pct != null ? Number(serviceData.cbs_reference_pct) : 0
    )

    useEffect(() => {
        if (!isLRorLPorSHSvcComp) return
        async function fetchIvaRefRates() {
            const tenantId = currentUser?.tenant_id
            if (!tenantId) return
            const { data } = await (supabase as any)
                .from('tenant_settings')
                .select('ibs_reference_pct, cbs_reference_pct')
                .eq('tenant_id', tenantId)
                .single()
            if (data) {
                // Não sobrescreve o snapshot do serviço (ADR-022).
                if (data.ibs_reference_pct != null && serviceData?.ibs_reference_pct == null) setIbsReferencePct(Number(data.ibs_reference_pct))
                if (data.cbs_reference_pct != null && serviceData?.cbs_reference_pct == null) setCbsReferencePct(Number(data.cbs_reference_pct))
            }
        }
        fetchIvaRefRates()
    }, [isLRorLPorSHSvcComp, currentUser?.tenant_id])

    // Handler: fator IVA DUAL muda (PC-BUG-FATOR-REDUCAO-002, regra do PO).
    // O campo IBS/CBS guarda a alíquota BRUTA digitada; a EFETIVA é derivada on-read pelo motor.
    function handleIvaDualFactorChange(factor: number | null) {
        setIvaDualReductionFactor(factor)
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

            const regimeLoad = currentUser?.taxableRegime
            const hasItemTaxesLoad = regimeLoad === 'LUCRO_REAL' || regimeLoad === 'LUCRO_PRESUMIDO' || regimeLoad === 'SIMPLES_HIBRIDO'
            const existingItems: TempItem[] = (serviceData.service_items || []).map((si: any, i: number) => {
                const item = si.item
                const measureQty = Number((item as any)?.measure_quantity) || 1
                const refQty = (Number(item?.quantity) || 1) * measureQty
                const itemCostNet = Number((item as any)?.cost_net) || 0
                const itemCostGross = Number((item as any)?.cost_gross) || 0
                const itemCostPrice = Number(item?.cost_price) || 0
                const refPrice = (hasItemTaxesLoad && itemCostNet > 0) ? itemCostNet : itemCostPrice
                const refPriceGross = hasItemTaxesLoad
                    ? (itemCostGross > 0 ? itemCostGross : itemCostPrice)
                    : itemCostPrice
                const neededQty = Number(si.quantity) || 0
                return {
                    key: `ex-${i}`,
                    item_id: si.item_id,
                    item_name: item?.name || '—',
                    unit: item?.unit || 'UN',
                    needed_qty: neededQty,
                    ref_qty: refQty,
                    ref_price: refPrice,
                    ref_price_gross: refPriceGross,
                    unit_gross: hasItemTaxesLoad ? (itemCostGross > 0 ? itemCostGross : itemCostPrice) : itemCostPrice,
                    unit_net: hasItemTaxesLoad && itemCostNet > 0 ? itemCostNet : undefined,
                    proportional_cost: calculateItemPrice(neededQty, refPrice, refQty),
                    proportional_cost_gross: calculateItemPrice(neededQty, refPriceGross, refQty),
                    has_item_taxes: hasItemTaxesLoad,
                }
            })
            setTempItems(existingItems)

            // `??`/verificação de nulo, NUNCA `||`: com `||` um zero digitado conta como
            // campo vazio e o usuário perde o valor ao reabrir a tela (no Simples, 0% de
            // imposto voltava a ser a alíquota do tenant). Zero gravado é zero.
            setTaxableRegimePercent(resolveServiceTaxableRegimePercent(
                firstConfiguredPercent(
                    serviceData.taxable_regime_percent,
                    taxPreview?.taxableRegimePercent,
                    currentUser?.taxableRegimeValue,
                ),
                { isMei: isMeiSvcComp },
            ))
            // Lucro, comissão e RT são ENTRADA do cadastro: lidos como gravados, sem
            // derivação de preço, de custo ou de qualquer outro percentual.
            setCommissionPercent(readRegisteredPercent(serviceData.commission_percent))
            setProfitPercent(readRegisteredPercent(serviceData.profit_percent))
            setRtReservePercent(readRegisteredPercent(serviceData.rt_reserve_percent))
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
            setTaxableRegimePercent(resolveServiceTaxableRegimePercent(
                taxPreview?.taxableRegimePercent ?? currentUser?.taxableRegimeValue ?? 0,
                { isMei: isMeiSvcComp },
            ))
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
        // Carga horária resolvida pela fonte única (`resolve-monthly-workload`).
        // Quando o tenant não configurou, `isWorkloadUnset` é true e
        // `monthlyWorkloadMinutes` é 0 — sem o antigo default silencioso de 176h.
        // O serviço é precificado POR MINUTO: sem carga horária não existe custo por
        // minuto, então o save é bloqueado e a UI exibe o alerta em vez do resultado.
        const workload = resolveMonthlyWorkload(
            currentUser?.monthlyWorkloadInMinutes,
            currentUser?.unitMeasure,
            currentUser?.numProductiveSectorEmployee,
        )
        const totalEmployees = workload.totalEmployees
        const monthlyWorkloadMinutes = workload.monthlyWorkloadMinutes
        const isWorkloadUnset = workload.isUnset

        const fixedPct = Number(cfg.fixed_expense_percent) || 0
        const variablePct = Number(cfg.variable_expense_percent) || 0
        const financialPct = Number(cfg.financial_expense_percent) || 0
        const indirectLaborPct = Number(cfg.indirect_labor_percent) || 0
        // Para serviços: fixedPct e indirectLaborPct são incorporados no custo por minuto
        // Não entram no coeficiente de markup para evitar dupla contagem
        const structurePct = (variablePct + financialPct) / 100

        const taxesPct = taxPreview?.taxesPercent ?? 0
        const isLucroRealSvc = currentUser?.taxableRegime === 'LUCRO_REAL'
        const isLucroPresumidoSvc = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
        const isSHSvc = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'
        const isLRorLPSvc = isLucroRealSvc || isLucroPresumidoSvc
        // Composição do markup dos regimes sem tratamento tributário próprio na tela
        // (MEI, Simples Nacional e demais). Fonte única de `taxPct` e `totalPct` nesse
        // ramo: garante que a soma das linhas EXIBIDAS feche com o preço. Em MEI o
        // imposto do regime é zerado aqui — dado legado gravado no serviço não entra.
        const markup = composeServiceMarkup({
            isMei: isMeiSvcComp,
            taxesPct,
            taxableRegimePercent,
            variablePct,
            financialPct,
            rtReservePercent,
            commissionPercent,
            profitPercent,
        })
        const effectiveTaxableRegimePercent = markup.taxableRegimePct

        let taxPct: number
        if (isLucroRealSvc) {
            const irpjPct = profitPercent * 0.15
            const csllPct = profitPercent * 0.09
            taxPct = (taxesPct + irpjPct + csllPct + additionalIrpjPercent) / 100
        } else if (isLucroPresumidoSvc) {
            // LP: taxableRegimePercent já encapsula IRPJ+CSLL via presunção; adicional IRPJ separado
            taxPct = (taxesPct + taxableRegimePercent + additionalIrpjPercent) / 100
        } else {
            taxPct = markup.taxPct
        }

        // Minutos de duração do serviço (productWorkloadMinutes para o motor)
        // T9 — usa valor observado (reativo) ao invés de form.getFieldValue
        const productWorkloadMinutes = Number(watchedDurationMinutes ?? form.getFieldValue('estimated_duration_minutes')) || 0

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
            rtReservePct: rtReservePercent / 100,
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
        const taxRegimeVal = Number((priceUnit * effectiveTaxableRegimePercent / 100).toFixed(2))
        const commissionVal = result.commissionValue
        const profitVal = result.profitValue
        // EPIC-RT v8: RT em R$ sobre o preço unitário formado (mesma base de comissão/lucro).
        const rtReserveVal = Number((priceUnit * rtReservePercent / 100).toFixed(2))

        // LUCRO_REAL: IRPJ/CSLL derivados do lucro
        const irpjPctLR = isLucroRealSvc ? profitPercent * 0.15 : 0
        const csllPctLR = isLucroRealSvc ? profitPercent * 0.09 : 0
        const irpjValLR = isLucroRealSvc ? profitVal * 0.15 : 0
        const csllValLR = isLucroRealSvc ? profitVal * 0.09 : 0
        // LUCRO_PRESUMIDO: IRPJ/CSLL derivados da presunção (taxableRegimePercent = IRPJ+CSLL combinado, proporção 15:9)
        const irpjPctLP = isLucroPresumidoSvc ? taxableRegimePercent * 15 / 24 : 0
        const csllPctLP = isLucroPresumidoSvc ? taxableRegimePercent * 9 / 24 : 0
        const irpjValLP = isLucroPresumidoSvc ? priceUnit * irpjPctLP / 100 : 0
        const csllValLP = isLucroPresumidoSvc ? priceUnit * csllPctLP / 100 : 0
        const adicionalIrpjValLR = isLRorLPSvc ? Number((priceUnit * additionalIrpjPercent / 100).toFixed(2)) : 0

        // MO administrativa e Despesas fixas incorporadas no custo por minuto
        const totalPct = isLucroRealSvc
            ? variablePct + financialPct + irpjPctLR + csllPctLR + additionalIrpjPercent + rtReservePercent + commissionPercent + profitPercent
            : isLucroPresumidoSvc
              ? variablePct + financialPct + taxesPct + irpjPctLP + csllPctLP + additionalIrpjPercent + rtReservePercent + commissionPercent + profitPercent
              : markup.totalPct
        const isValid = result.isValid

        // Valor precificado final com ICMS/PIS/COFINS embutidos = Custo / MC%
        // Base para cálculo de ICMS (R$) e PIS/COFINS (R$) em LR/LP
        const mcPct = 100 - totalPct
        const valorPrecificado = mcPct > 0 ? totalCost / (mcPct / 100) : 0

        return {
            laborCost, totalCost, sellingPrice, costPerMinute, totalEmployees,
            isWorkloadUnset,
            variablePct, financialPct, taxesPct,
            variableVal,
            financialVal,
            taxesVal,
            taxRegimeVal,
            irpjPctLR, csllPctLR, irpjValLR, csllValLR, adicionalIrpjValLR,
            irpjPctLP, csllPctLP, irpjValLP, csllValLP,
            commissionVal,
            profitVal,
            rtReserveVal,
            totalPct, isValid,
            valorPrecificado,
        }
    }, [materialCost, expenseConfig, currentUser, isMeiSvcComp, taxableRegimePercent, commissionPercent, profitPercent, rtReservePercent, taxPreview, form, additionalIrpjPercent, watchedDurationMinutes])

    function handleAddItem() {
        if (!addItemId) return
        const it = items.find(i => i.id === addItemId)
        if (!it) return
        if (tempItems.some(t => t.item_id === addItemId)) { msgApi.warning('Item já adicionado.'); return }

        const measureQty = Number((it as any).measure_quantity) || 1
        const refQty = (Number(it.quantity) || 1) * measureQty
        const regimeAdd = currentUser?.taxableRegime
        const hasItemTaxesAdd = regimeAdd === 'LUCRO_REAL' || regimeAdd === 'LUCRO_PRESUMIDO' || regimeAdd === 'SIMPLES_HIBRIDO'
        const itemCostNet = Number((it as any).cost_net) || 0
        const itemCostGross = Number((it as any).cost_gross) || 0
        // Para regimes com impostos no item: usar custo LÍQUIDO; caso contrário, custo bruto
        const effectiveCost = (hasItemTaxesAdd && itemCostNet > 0) ? itemCostNet : it.cost_price
        // BRUTO de referência: cost_gross persistido OU it.cost_price como fallback
        const effectiveGross = hasItemTaxesAdd
            ? (itemCostGross > 0 ? itemCostGross : it.cost_price)
            : it.cost_price
        const proportionalCost = calculateItemPrice(addItemQty, effectiveCost, refQty)
        const proportionalCostGross = calculateItemPrice(addItemQty, effectiveGross, refQty)
        setTempItems(prev => [...prev, {
            key: `n-${Date.now()}`,
            item_id: it.id,
            item_name: it.name,
            unit: it.unit,
            needed_qty: addItemQty,
            ref_qty: refQty,
            ref_price: effectiveCost,
            ref_price_gross: effectiveGross,
            unit_gross: hasItemTaxesAdd ? (itemCostGross > 0 ? itemCostGross : it.cost_price) : it.cost_price,
            unit_net: hasItemTaxesAdd && itemCostNet > 0 ? itemCostNet : undefined,
            proportional_cost: proportionalCost,
            proportional_cost_gross: proportionalCostGross,
            has_item_taxes: hasItemTaxesAdd,
        }])
        setAddItemId(null)
        setAddItemQty(1)
    }

    function handleQtyChange(key: string, val: number) {
        setTempItems(prev => prev.map(t => {
            if (t.key === key) {
                const newCost = calculateItemPrice(val, t.ref_price, t.ref_qty)
                const newGross = t.ref_price_gross != null
                    ? calculateItemPrice(val, t.ref_price_gross, t.ref_qty)
                    : undefined
                return { ...t, needed_qty: val, proportional_cost: newCost, proportional_cost_gross: newGross }
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

            // O preço do serviço nasce do custo POR MINUTO. Sem carga horária da equipe
            // não existe divisor, e salvar aqui gravaria um preço formado sobre custo de
            // MO zero. Bloqueia na origem — orçamento/pedido/venda só consomem preço já
            // gravado, então este é o ponto certo para barrar.
            if (pricing.isWorkloadUnset) {
                msgApi.error('Configure a carga horária da equipe produtiva em Configurações → Equipe antes de salvar o serviço.')
                return
            }

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

            // Calcular impostos IBS/CBS/IS/IPI para LUCRO_REAL, LUCRO_PRESUMIDO e SIMPLES_HIBRIDO
            let svcFinalPrice = pricing.sellingPrice
            let svcIsVal = 0, svcIbsVal = 0, svcCbsVal = 0, svcIpiVal = 0
            if (isLRorLPorSHSvcComp) {
                // Hierarquia oficial PDF (IVA Dual): BaseIVA = Operação Interna − ISS −
                // PIS/COFINS (serviço não tem ICMS), sem gross-up; IS compõe base IBS/CBS.
                // PC-BUG-FATOR-REDUCAO-002 Ponto 1: fator de redução SOBRE a alíquota bruta IBS/CBS.
                const _iva = computeIvaDualOutside({
                    opInterna: pricing.sellingPrice,
                    icmsPct: 0,
                    issPct: issPctSvc || 0,
                    pisCofinsPct: pisCofinsLRPct || 0,
                    isPct: isPct || 0,
                    ibsPct: resolveIvaDualEffectiveRate(ibsPct, ivaDualReductionFactor) || 0,
                    cbsPct: resolveIvaDualEffectiveRate(cbsPct, ivaDualReductionFactor) || 0,
                    ipiPct: ipiPct || 0,
                })
                svcIsVal = _iva.isValue
                svcIbsVal = _iva.ibsValue
                svcCbsVal = _iva.cbsValue
                svcIpiVal = _iva.ipiValue
                if (_iva.totalOutside > 0) svcFinalPrice = _iva.finalPrice
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
                rt_reserve_percent: Number(rtReservePercent) || 0,
                // MEI grava sempre 0: a alíquota do regime não existe nesse regime, então
                // uma gravação legítima normaliza o resíduo herdado sem exigir correção
                // manual pela interface.
                taxable_regime_percent: resolveServiceTaxableRegimePercent(taxableRegimePercent, { isMei: isMeiSvcComp }),
                additional_irpj_percent: additionalIrpjPercent || 0,
                pis_cofins_pct: (isLucroRealSvcComp || isLucroPresumidoSvcComp || isSHSvcComp) ? (pisCofinsLRPct || 0) : 0,
                commission_table_id: commissionTableId || null,
                min_quantity: 0,
                taxes_launched: true,
                is_pct: isLRorLPorSHSvcComp ? (isPct || 0) : 0,
                is_value: isLRorLPorSHSvcComp ? svcIsVal : 0,
                ibs_pct: isLRorLPorSHSvcComp ? (ibsPct || 0) : 0,
                ibs_value: isLRorLPorSHSvcComp ? svcIbsVal : 0,
                cbs_pct: isLRorLPorSHSvcComp ? (cbsPct || 0) : 0,
                cbs_value: isLRorLPorSHSvcComp ? svcCbsVal : 0,
                ipi_pct: isLRorLPorSHSvcComp ? (ipiPct || 0) : 0,
                ipi_value: isLRorLPorSHSvcComp ? svcIpiVal : 0,
                sale_price_base: isLRorLPorSHSvcComp ? pricing.sellingPrice : null,
                sale_price_after_taxes: isLRorLPorSHSvcComp ? svcFinalPrice : null,
                valor_precificado_icms_piscofins: isLRorLPorSHSvcComp ? pricing.sellingPrice : null,
                iva_dual_reduction_factor: isLRorLPorSHSvcComp ? (ivaDualReductionFactor ?? null) : null,
                // ADR-022: snapshot da referência bruta IBS/CBS (fonte da verdade + fator).
                ibs_reference_pct: isLRorLPorSHSvcComp && ibsReferencePct > 0 ? ibsReferencePct : null,
                cbs_reference_pct: isLRorLPorSHSvcComp && cbsReferencePct > 0 ? cbsReferencePct : null,
                recurrence_active: recurrenceActive,
                recurrence_days: recurrenceActive && recurrenceDays ? recurrenceDays : null,
                recurrence_message: recurrenceActive && recurrenceMessage ? recurrenceMessage : null,
                // S15 EPIC-RR-V2 — alíquotas tributárias adicionais (base 100 → decimal).
                // NULL quando 0 (não cadastrado → fallback tenant no motor RR).
                iss_pct: issPctSvc > 0 ? issPctSvc / 100 : null,
                iss_retido_pct: issRetidoPctSvc > 0 ? issRetidoPctSvc / 100 : null,
                // EPIC-POR-FORA-V3 / S1: icms_st_pct/difal_pct/fcp_pct não são mais persistidos em serviços.
                irpj_pct: irpjItemPctSvc > 0 ? irpjItemPctSvc / 100 : null,
                csll_pct: csllItemPctSvc > 0 ? csllItemPctSvc / 100 : null,
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
    const isLucroPresumidoDisplay = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
    const isLpRetDisplay = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO_RET'
    const isSHDisplay = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'
    const isLRorLPDisplay = isLucroRealDisplay || isLucroPresumidoDisplay || isSHDisplay

    const tempItemCols: ColumnsType<TempItem> = [
        {
            title: 'Item / Insumo', dataIndex: 'item_name', key: 'n',
            render: (n: string, r: TempItem) => (
                <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{n}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                        Embalagem: {r.ref_qty} {UNIT_LABELS[r.unit] || r.unit}
                    </div>
                    {r.has_item_taxes && r.unit_gross != null ? (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            Valor unitário (Bruto): <strong>{fmt(r.unit_gross)}</strong>
                            {r.unit_net != null && (
                                <> · Custo líquido: <strong style={{ color: '#B42318' }}>{fmt(r.unit_net)}</strong></>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            Valor unitário: <strong>{fmt(r.unit_gross ?? r.ref_price)}</strong>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Qtd Usada', key: 'qty', width: 140, align: 'center',
            render: (_: any, r: TempItem) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <InputNumber
                        size="small"
                        min={1}
                        step={1}
                        precision={0}
                        value={r.needed_qty}
                        onChange={(val) => handleQtyChange(r.key, Math.max(1, Math.floor(Number(val ?? 1))))}
                        parser={(v) => {
                            const raw = String(v ?? '').replace(',', '.').trim()
                            const n = parseInt(raw, 10)
                            return isNaN(n) || n < 1 ? 1 : n
                        }}
                        style={{ width: 80 }}
                    />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{UNIT_LABELS[r.unit] || r.unit}</span>
                </div>
            ),
        },
        {
            title: 'Bruto', key: 'cost_gross', width: 110, align: 'right',
            render: (_: any, r: TempItem) => {
                if (!r.has_item_taxes) return <span style={{ color: '#94a3b8' }}>—</span>
                const gross = r.proportional_cost_gross ?? r.proportional_cost
                return (
                    <Tooltip title={`Bruto: (${r.needed_qty} × ${fmt(r.ref_price_gross ?? r.ref_price)}) ÷ ${r.ref_qty} = ${fmt(gross)}`}>
                        <span style={{ fontWeight: 600, color: '#94a3b8' }}>{fmt(gross)}</span>
                    </Tooltip>
                )
            },
        },
        {
            title: 'Líquido', key: 'cost', width: 130, align: 'right',
            render: (_: any, r: TempItem) => (
                <Tooltip title={`Líquido: (${r.needed_qty} × ${fmt(r.ref_price)}) ÷ ${r.ref_qty} = ${fmt(r.proportional_cost)}`}>
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

    function pricingRow(label: string, pct: number, val: number, editable?: 'commission' | 'profit' | 'tax' | 'additionalIrpj' | 'pisCofins' | 'rtReserve', tooltipText?: string) {
        // Relatório mobile #7: estrutura alinhada à de Produtos (referência):
        // ordem de colunas % | Despesa | Valor, com o MESMO tamanho/fonte de campo em
        // TODAS as linhas (editável = PercentInput; read-only = span de mesma largura).
        return (
            <tr key={label}>
                <td style={{ width: 140, padding: '6px 0', textAlign: 'left' }}>
                    {editable ? (
                        <PercentInput
                            size="small" min={0} max={100}
                            showPercent={false}
                            value={pct}
                            onChange={(v) => {
                                if (editable === 'commission') setCommissionPercent(v ?? 0)
                                if (editable === 'profit') setProfitPercent(v ?? 0)
                                if (editable === 'tax') setTaxableRegimePercent(v ?? 0)
                                if (editable === 'additionalIrpj') setAdditionalIrpjPercent(v ?? 0)
                                if (editable === 'pisCofins') setPisCofinsLRPct(v ?? 0)
                                if (editable === 'rtReserve') setRtReservePercent(v ?? 0)
                            }}
                            style={{ width: 110, fontSize: 13 }}
                        />
                    ) : (
                        <span style={{
                            display: 'inline-block', boxSizing: 'border-box', padding: '4px 12px',
                            background: 'rgba(255,255,255,0.06)', borderRadius: 4, fontSize: 13,
                            width: 110, textAlign: 'right',
                        }}>
                            {pct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
                        </span>
                    )}
                </td>
                <td style={{ padding: '6px 12px', fontSize: 13 }}>
                    {tooltipText ? <Tooltip title={tooltipText}><span style={{ cursor: 'help' }}>{label}</span></Tooltip> : label}
                </td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
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
                            options={commissionTables.map(t => ({ value: t.id, label: t.name }))}
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
                                {it.name}
                            </Select.Option>
                        ))}
                    </Select>
                    <InputNumber
                        min={1}
                        step={1}
                        precision={0}
                        value={addItemQty}
                        onChange={(v) => setAddItemQty(Math.max(1, Math.floor(Number(v ?? 1))))}
                        parser={(v) => {
                            const raw = String(v ?? '').replace(',', '.').trim()
                            const n = parseInt(raw, 10)
                            return isNaN(n) || n < 1 ? 1 : n
                        }}
                        style={{ width: 80 }}
                        placeholder="Qtd"
                    />
                    <Button icon={<PlusOutlined />} onClick={handleAddItem} disabled={!addItemId}>Adicionar</Button>
                </div>

                {tempItems.length > 0 ? (
                    <>
                        <Table columns={tempItemCols} dataSource={tempItems} rowKey="key" pagination={false} size="small" scroll={{ x: 'max-content' }} />
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
                {/* Relatório 30/07 (mobile #2): no celular a linha empilha —
                    rótulo, depois minutos à ESQUERDA e valor R$ à DIREITA na MESMA linha
                    (grupo `.ps-labor-fields`), e por fim o texto de ajuda. Desktop inalterado. */}
                <div className="ps-row-flex ps-labor-row" style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="ps-labor-label" style={{ width: '36%', padding: '8px 16px', fontSize: 14 }}>Mão de obra produtiva</div>
                    <div className="ps-labor-fields" style={{ width: '20%', padding: '4px 8px' }}>
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
                    <div className="ps-labor-value" style={{ width: '15%', padding: '4px 8px', fontWeight: 700, fontSize: 15, color: '#B42318' }}>
                        {fmt(pricing.laborCost)}
                    </div>
                    <div className="ps-labor-help" style={{ width: '29%', padding: '4px 8px', fontSize: 11, color: '#94a3b8' }}>
                        {pricing.costPerMinute > 0
                            ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(pricing.costPerMinute)}/min × ${watchedDurationMinutes ?? form.getFieldValue('estimated_duration_minutes') ?? 60} min (${pricing.totalEmployees} func.)`
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
                            {/* Relatório mobile #7: cabeçalho na ordem de Produtos — Alíquotas | Despesa | Valor */}
                            <tr style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' as const }}>
                                <th style={{ textAlign: 'left', padding: '0 0 8px', width: 140 }}>Alíquotas</th>
                                <th style={{ textAlign: 'left', padding: '0 12px 8px' }}>Despesa</th>
                                <th style={{ textAlign: 'right', padding: '0 0 8px', whiteSpace: 'nowrap' }}>Valor (R$)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pricingRow('Despesas variáveis', pricing.variablePct, pricing.variableVal)}
                            {pricingRow('Despesas financeiras', pricing.financialPct, pricing.financialVal)}
                            {isSN
                                ? pricingRow(taxLabel, displayTaxPct, displayTaxVal, 'tax')
                                : !isLpRetDisplay && !isSHDisplay && pricingRow(taxLabel, displayTaxPct, displayTaxVal)
                            }
                            {!isSN && !taxPreview?.isMei && !isLucroRealDisplay && !isLucroPresumidoDisplay && !isLpRetDisplay && !isSHDisplay && pricingRow(
                                `Impostos${taxPreview?.regimeLabel ? ` (${taxPreview.regimeLabel})` : ''}`,
                                taxableRegimePercent, pricing.taxRegimeVal, 'tax'
                            )}
                            {pricingRow('RT — Comissão Reserva Técnica', rtReservePercent, pricing.rtReserveVal, 'rtReserve', 'Reserva Técnica: dedução gerencial paralela à comissão e ao lucro, inserida manualmente por serviço. A alíquota efetiva fica congelada na cascata (não varia com o desconto do orçamento) e não entra na base de IRPJ/CSLL. Deixe 0% se não aplicável.')}
                            {pricingRow('Comissão', commissionPercent, pricing.commissionVal, 'commission')}
                            {pricingRow('Lucro', profitPercent, pricing.profitVal, 'profit')}
                            {isLpRetDisplay && pricingRow('RET – Tributação unificada', taxableRegimePercent, pricing.taxRegimeVal, 'tax', 'Alíquota RET consolidada (IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41%). Puxada das configurações, editável por serviço.')}
                            {isSHDisplay && pricingRow('Simples Híbrido (%)', taxableRegimePercent, pricing.taxRegimeVal, 'tax', 'Alíquota total consolidada do Simples Híbrido (ICMS + PIS + COFINS + ISS + IRPJ + CSLL). Puxada das configurações, editável por serviço.')}
                            {(isLucroRealDisplay || isLucroPresumidoDisplay) && pricingRow(
                                'IRPJ (15% sobre lucro)',
                                isLucroRealDisplay ? pricing.irpjPctLR : pricing.irpjPctLP,
                                isLucroRealDisplay ? pricing.irpjValLR : pricing.irpjValLP,
                                undefined,
                                'Imposto de Renda Pessoa Jurídica — calculado automaticamente sobre o lucro (LR) ou via percentual de presunção (LP).'
                            )}
                            {(isLucroRealDisplay || isLucroPresumidoDisplay) && pricingRow(
                                'CSLL (9% sobre lucro)',
                                isLucroRealDisplay ? pricing.csllPctLR : pricing.csllPctLP,
                                isLucroRealDisplay ? pricing.csllValLR : pricing.csllValLP,
                                undefined,
                                'Contribuição Social sobre o Lucro Líquido — calculada automaticamente sobre o lucro (LR) ou via percentual de presunção (LP).'
                            )}
                            {(isLucroRealDisplay || isLucroPresumidoDisplay) && pricingRow('Alíq. adicional IRPJ', additionalIrpjPercent, pricing.adicionalIrpjValLR, 'additionalIrpj', 'Alíquota da parcela adicional do IRPJ. Calculada automaticamente com base no faturamento anual estimado.')}
                            {(isLucroRealDisplay || isLucroPresumidoDisplay) && pricingRow(
                                'PIS/Cofins (%)',
                                pisCofinsLRPct,
                                pricing.valorPrecificado * pisCofinsLRPct / 100,
                                'pisCofins',
                                isLucroPresumidoDisplay
                                    ? 'PIS + COFINS cumulativo (3,65%) — regime Lucro Presumido. Editável.'
                                    : 'PIS + COFINS — informe manualmente para serviços (regime não cumulativo).'
                            )}
                        </tbody>
                    </table>

                    <Divider style={{ margin: '12px 0' }} />

                    {/* Relatório mobile #5/#7: estrutura alinhada à de Produtos (referência).
                        Rótulo + % na MESMA linha; linha seguinte "Valor do produto precificado"
                        com valor à direita; abaixo, a nota "(operação por dentro...)". */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8' }}>Margem de contribuição aplicada</span>
                        <span style={{ fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{(100 - pricing.totalPct).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</span>
                    </div>

                    {(isLucroRealDisplay || isLucroPresumidoDisplay) && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13, marginTop: 4 }}>
                                <span style={{ color: '#94a3b8' }}>Valor do produto precificado</span>
                                <span style={{ fontWeight: 600, color: '#e2e8f0', textAlign: 'right', whiteSpace: 'nowrap' }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(pricing.valorPrecificado)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', padding: '0 0 4px' }}>
                                (operação por dentro, com ICMS, PIS e Cofins)
                            </div>
                        </>
                    )}

                    {/* Fator de redução IVA DUAL */}
                    {(isLucroRealDisplay || isLucroPresumidoDisplay || isSHDisplay) && (
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
                                    {[30, 40, 50, 60, 70, 80, 100].map(v => (
                                        <Select.Option key={v} value={v}>{v}%</Select.Option>
                                    ))}
                                </Select>
                                {ivaDualReductionFactor != null && (ibsPct > 0 || cbsPct > 0) && (
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        IBS: {ibsPct.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (bruta) → {parseFloat((ibsPct * (1 - ivaDualReductionFactor / 100)).toFixed(4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (efetiva)
                                        &nbsp;·&nbsp;
                                        CBS: {cbsPct.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (bruta) → {parseFloat((cbsPct * (1 - ivaDualReductionFactor / 100)).toFixed(4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (efetiva)
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* IBS / CBS */}
                    {isLRorLPDisplay && (() => {
                        // Hierarquia oficial PDF (IVA Dual) — fonte única computeIvaDualOutside.
                        // PC-BUG-FATOR-REDUCAO-002 Ponto 1: efetiva = bruta × (1 − fator) em IBS/CBS.
                        const _ivaDisp = computeIvaDualOutside({
                            opInterna: pricing.sellingPrice,
                            icmsPct: 0,
                            issPct: issPctSvc || 0,
                            pisCofinsPct: pisCofinsLRPct || 0,
                            isPct: isPct || 0,
                            ibsPct: resolveIvaDualEffectiveRate(ibsPct, ivaDualReductionFactor) || 0,
                            cbsPct: resolveIvaDualEffectiveRate(cbsPct, ivaDualReductionFactor) || 0,
                            ipiPct: ipiPct || 0,
                        })
                        const _isVal = _ivaDisp.isValue
                        const _ibsVal = _ivaDisp.ibsValue
                        const _cbsVal = _ivaDisp.cbsValue
                        const _ipiVal = _ivaDisp.ipiValue
                        const _total = _ivaDisp.totalOutside
                        const _finalPrice = _ivaDisp.finalPrice
                        const ibsCbsRows = [
                            { label: 'IBS — Imposto sobre Bens e Serv. (%)', value: ibsPct, setter: setIbsPct, taxValue: _ibsVal },
                            { label: 'CBS — Contrib. sobre Bens e Serv. (%)', value: cbsPct, setter: setCbsPct, taxValue: _cbsVal },
                        ] as { label: string; value: number; setter: (v: number) => void; taxValue: number }[]
                        const isIpiRows = [
                            { label: 'IS — Imposto Seletivo (%)', value: isPct, setter: setIsPct, taxValue: _isVal },
                            { label: 'IPI (%)', value: ipiPct, setter: setIpiPct, taxValue: _ipiVal },
                        ] as { label: string; value: number; setter: (v: number) => void; taxValue: number }[]
                        // Relatório mobile #6/#7: layout de 2 LINHAS por imposto, igual a Produtos.
                        // L1 = campo de % (esq., largura fixa 110) [+ fator (centro) + efetiva (dir.)
                        //      apenas em IBS/CBS]; L2 = valor R$ resultante (borda direita).
                        const fmtPct = (n: number) =>
                            n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + '%'
                        const hasReductionFactor =
                            ivaDualReductionFactor != null && Number(ivaDualReductionFactor) > 0
                        const renderRow = (
                            { label, value, setter, taxValue }: { label: string; value: number; setter: (v: number) => void; taxValue: number },
                            withFactor: boolean,
                        ) => {
                            const effective = withFactor && hasReductionFactor && value > 0
                                ? (resolveIvaDualEffectiveRate(value, ivaDualReductionFactor) || 0)
                                : null
                            return (
                                <div key={label} style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>{label}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                        <PercentInput
                                            size="small" min={0} max={100}
                                            showPercent={false}
                                            value={value}
                                            onChange={(v) => setter(v ?? 0)}
                                            style={{ width: 110, fontSize: 13, flex: '0 0 auto' }}
                                        />
                                        {effective != null && (
                                            <>
                                                <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' as const, flex: '1 1 auto' }}>
                                                    fator {Number(ivaDualReductionFactor)}%
                                                </span>
                                                <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600, textAlign: 'right' as const, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                                                    efetiva {fmtPct(effective)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' as const, fontSize: 12, fontWeight: 600, color: taxValue > 0 ? '#4ade80' : '#64748b', marginTop: 4 }}>
                                        {fmt(taxValue)}
                                    </div>
                                </div>
                            )
                        }
                        return (
                            <>
                                <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 10 }}>
                                        Impostos (IBS / CBS)
                                    </div>
                                    {ibsCbsRows.map((r) => renderRow(r, true))}
                                </div>

                                {!isSHDisplay && (
                                <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 10 }}>
                                        Impostos (IS / IPI)
                                    </div>
                                    {isIpiRows.map((r) => renderRow(r, false))}
                                </div>
                                )}

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

                    {/* EPIC-POR-FORA-V3: "Alíquotas tributárias adicionais (avançado)" ACIMA do card de Preço de Venda / Lucro Líquido */}
                    <details style={{ marginBottom: 16, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                            🧾 Alíquotas tributárias adicionais (avançado)
                        </summary>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8, marginBottom: 12 }}>
                            Use se este serviço tem alíquota diferente do padrão do tenant. Deixe em 0 para usar o padrão.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 12, color: '#475569' }}>ISS (%)</label>
                                <PercentInput value={issPctSvc} onChange={(v) => setIssPctSvc(Number(v) || 0)} min={0} max={100} style={{ width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: '#475569' }}>ISS Retido (%)</label>
                                <PercentInput value={issRetidoPctSvc} onChange={(v) => setIssRetidoPctSvc(Number(v) || 0)} min={0} max={100} style={{ width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: '#475569' }} title="Use apenas se a atividade deste serviço exigir IRPJ presumido diferente do regime padrão.">
                                    IRPJ (%) ℹ
                                </label>
                                <PercentInput value={irpjItemPctSvc} onChange={(v) => setIrpjItemPctSvc(Number(v) || 0)} min={0} max={100} style={{ width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: '#475569' }} title="Use apenas se a atividade deste serviço exigir CSLL presumido diferente do regime padrão.">
                                    CSLL (%) ℹ
                                </label>
                                <PercentInput value={csllItemPctSvc} onChange={(v) => setCsllItemPctSvc(Number(v) || 0)} min={0} max={100} style={{ width: '100%' }} />
                            </div>
                        </div>
                    </details>

                    {/* Sem carga horária da equipe não há custo por minuto — e sem custo por
                        minuto o preço do serviço não pode ser formado. Em vez de exibir um
                        resultado calculado sobre um default inventado, informa o que falta.

                        O alerta INFORMA e para por aí: nada aqui navega. Esta tela não tem
                        persistência de rascunho, então qualquer navegação disparada daqui
                        desmontaria o formulário e descartaria o que o usuário já digitou
                        (num cadastro novo: nome, insumos, minutos, percentuais). O usuário
                        vai a Configurações quando quiser; ao voltar, o componente monta de
                        novo, `currentUser` já vem atualizado pelo refreshUser do
                        handleSaveTeam, e o bloqueio cai sozinho. */}
                    {pricing.isWorkloadUnset ? (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginTop: 12 }}
                            message="Carga horária da equipe não configurada"
                            description={
                                <p style={{ margin: 0 }}>
                                    O preço do serviço é formado a partir do <strong>custo por minuto</strong> da
                                    equipe produtiva (mão de obra produtiva + administrativa + despesas fixas
                                    divididas pelas horas trabalhadas no mês). Sem a carga horária cadastrada não
                                    existe esse divisor, então o preço não pode ser calculado — e o serviço não
                                    pode ser salvo. Configure a carga horária da equipe produtiva
                                    em <strong>Configurações &gt; Equipe</strong> e volte a esta tela.
                                </p>
                            }
                        />
                    ) : (
                    <div style={{
                        padding: '16px 20px', borderRadius: 8, marginTop: 12,
                        background: pricing.isValid && pricing.sellingPrice > 0 ? '#ECFDF5' : '#FEF2F2',
                        border: `1px solid ${pricing.isValid && pricing.sellingPrice > 0 ? '#6CE9A6' : '#FDA29B'}`,
                    }}>
                        {/* Card de resultado: mesmo molde do card de Produto
                            (product-price.component.tsx) — lucro líquido como coluna
                            secundária à esquerda e preço como número principal à direita,
                            na mesma linha. Os rótulos e os campos exibidos continuam sendo
                            os do Serviço: "Preço de Venda Sugerido", sem unidade de medida,
                            sem total de receita e sem tributos por fora. */}
                        <div style={{ display: 'flex', justifyContent: isMobile ? 'center' : 'space-between', alignItems: 'center' }}>
                            {!isMobile && (
                                <div>
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
                            )}
                            <div style={{ textAlign: isMobile ? 'center' : 'right' }}>
                                <Tooltip title="Custo do serviço + despesas variáveis e financeiras + impostos + comissão + lucro. É o valor sugerido de venda para atingir a margem definida.">
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: 0.5, cursor: 'help' }}>
                                        Preço de Venda Sugerido
                                    </div>
                                </Tooltip>
                                <div style={{ fontSize: 28, fontWeight: 800, color: pricing.isValid ? '#027A48' : '#B42318' }}>
                                    {fmt(pricing.sellingPrice)}
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {!pricing.isWorkloadUnset && pricing.sellingPrice > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Composição do preço</div>
                            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                                <Tooltip title={`Custo: ${fmt(pricing.totalCost)}`}>
                                    <div style={{ width: `${(pricing.totalCost / pricing.sellingPrice) * 100}%`, background: '#F04438' }} />
                                </Tooltip>
                                <Tooltip title={`Despesas: ${fmt(pricing.variableVal + pricing.financialVal)}`}>
                                    <div style={{ width: `${((pricing.variableVal + pricing.financialVal) / pricing.sellingPrice) * 100}%`, background: '#F79009' }} />
                                </Tooltip>
                                <Tooltip title={`Impostos: ${fmt(isLucroRealDisplay ? pricing.irpjValLR + pricing.csllValLR + pricing.adicionalIrpjValLR : isLucroPresumidoDisplay ? displayTaxVal + (isSN ? 0 : pricing.taxRegimeVal) + pricing.adicionalIrpjValLR : displayTaxVal + (isSN ? 0 : pricing.taxRegimeVal))}`}>
                                    <div style={{ width: `${((isLucroRealDisplay ? pricing.irpjValLR + pricing.csllValLR + pricing.adicionalIrpjValLR : isLucroPresumidoDisplay ? displayTaxVal + (isSN ? 0 : pricing.taxRegimeVal) + pricing.adicionalIrpjValLR : displayTaxVal + (isSN ? 0 : pricing.taxRegimeVal)) / pricing.sellingPrice) * 100}%`, background: '#667085' }} />
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

            {/* EPIC-POR-FORA-V3: "Alíquotas tributárias adicionais (avançado)" movida para ACIMA do
                card de Preço de Venda / Lucro Líquido (ver inserção antes do card de resultado). */}

            <footer className="flex flex-row-reverse mt-5 mr-4" style={{ gap: 8 }}>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                    Salvar
                </Button>
                <Button onClick={() => router.push(ROUTES.SERVICES)}>Cancelar</Button>
            </footer>
        </>
    )
}
