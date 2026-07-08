import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
    App as AntdApp,
    Button, Drawer, Dropdown, Form, Input, InputNumber, Select, Space, Table, Tag, Tooltip,
    message, Popconfirm, DatePicker, Empty, Divider, Modal, Upload, Checkbox, Radio, Segmented,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import {
    ShoppingCartOutlined, DollarOutlined, RiseOutlined, PlusOutlined,
    SearchOutlined, CheckCircleOutlined, DeleteOutlined, CreditCardOutlined,
    ShopOutlined, FileTextOutlined, UploadOutlined, PaperClipOutlined,
    DownloadOutlined, ToolOutlined, MoreOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useDevice } from '@/contexts/device.context'
import { CurrencyInput } from '@/components/currency-input.component'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
// Onda 3 / CRÍT-perf: exportTableToPdf (jsPDF ~100KB) via dynamic import no handler abaixo.
import { calculateDiscountedPrice, discountModeToAbsorptionPolicy, DiscountMode } from '@/utils/calculate-discount'
import { formatBRL } from '@/utils/formatters'
import {
    PaymentWithInstallments,
    buildInstallmentsByPreset,
    INSTALLMENT_PRESETS,
    type InstallmentPresetValue,
    type InstallmentRow,
} from '@/components/payment-with-installments.component'
import { syncCustomerRecurrenceOnSale } from '@/lib/customer-recurrence'
import { distributeDiscountToItems } from '@/utils/distribute-discount'
import { useTenantTaxContext } from '@/hooks/use-tenant-tax-context'
import { MRM_ERROR_RRO_NON_POSITIVE, MRM_ENGINE_VERSION, type TaxBreakdown } from '@/types/mrm'
import { useResidualDistribution } from '@/hooks/use-residual-distribution'
import { detectConfigWarning, type ResidualItemInput } from '@/utils/residual-distribution'
import { PAGE_SIZE } from '@/constants/pagination'
import { ResidualDistributionBlock } from '@/page-parts/shared/residual-distribution-block.component'
import {
  buildItemTaxRatesFromProduct,
  mergeItemAndTenantRates,
  resolveItemCsllPct,
  resolveItemIrpjPct,
  resolveProductCostAndLabor,
  resolveProductFinancialExpense,
  resolveProductExpenseBreakdown,
  type ItemTaxRates,
} from '@/utils/item-tax-rates'
import { computeConsolidatedDRE, type DREItemInput } from '@/utils/consolidated-dre'
import { ConsolidatedDREBlock } from '@/page-parts/shared/consolidated-dre-block.component'
import { extractEpicV5DisplayData } from '@/utils/mrm-display-extractor'
import { hydrateItemSnapshot, type TenantSnapshotContext } from '@/lib/items-snapshot'
import { calculateMarginReapuration } from '@/utils/margin-reapuration'
import { buildMotorInput } from '@/utils/mrm-orchestrator'
import { calculateMotorV17ForPage } from '@/utils/mrm-engine-v17/legacy-adapter'
import { consolidateStDifalFromItems } from '@/utils/icms-st-difal'
// V17 cutover: V16 imports mantidos por compatibilidade (não usados após substituição)
void calculateMarginReapuration; void buildMotorInput;
import { coerceLegacyDiscountMode, normalizeDiscountModeForDisplay } from '@/config/feature-flags'
import { decideMrmAction } from '@/utils/mrm-policies'
import { aggregateMotorResults } from '@/utils/mrm-aggregate'
import { RequiresReviewBadge } from '@/components/mrm/RequiresReviewBadge'

const PAYMENT_METHODS = [
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: 'Cheque pré-datado' },
    { value: 'LANCAMENTOS_A_RECEBER', label: '📋 Lançamentos a Receber' },
]

const CHEQUE_PRE_DATADO_CONDITIONS = [
    { value: '30', label: '30 dias' },
    { value: '30_60', label: '30/60 dias' },
    { value: '30_60_90', label: '30/60/90 dias' },
    { value: '30_60_90_120', label: '30/60/90/120 dias' },
    { value: '30_60_90_120_150', label: '30/60/90/120/150 dias' },
]

interface SaleRow {
    id: string
    sale_code: string | null
    budget_id: string | null
    productName: string
    quantity: number
    unitPrice: number
    finalValue: number
    commissionAmount: number
    customerName: string
    sellerName: string
    description: string
    saleDate: string
    status: string
    paymentMethod: string
    installments: number
    saleType: string
    receiptUrl: string | null
    // MRM S2.3: TRUE quando a venda foi salva com RRO ≤ 0 (caso edge —
    // venda legada migrada ou tenant override permissive).
    requiresReview: boolean
}

interface SaleItemRow {
    key: string
    product_id: string
    service_id?: string
    product_name: string
    quantity: number
    unit_price: number
    discount: number
    total: number
    commission_table_id?: string | null
    commission_percent?: number
    profit_percent?: number
    /** Custo unitário do produto/serviço — alimenta CP do motor RR (Sprint S8). */
    cost_total?: number
    /** V8.1 (2026-05-24): MO produtiva inclusa em cost_total (R$ unitário). */
    productive_labor_unit?: number
    /** V13 (2026-05-25): Despesa Financeira POR UNIDADE do produto (R$).
     *  Origem: pricing_calculations.val_financial_expense / yield_quantity. */
    financial_expense_unit?: number | null
    /** V14 (2026-05-25): snapshot COMPLETO dos 4 buckets de despesa do produto. */
    expense_breakdown_unit?: import('@/utils/item-tax-rates').ProductExpenseBreakdown | null
    /** Alíquotas tributárias específicas do item (Sprint S11). NULL = fallback tenant. */
    item_tax_rates?: ItemTaxRates | null
    /** true = item manual (nome/valor digitados), false = produto do catálogo */
    is_manual?: boolean
    /** true = item de servico do catalogo */
    is_service?: boolean
}

const formatCurrency = formatBRL

interface PendingBudget {
    id: string
    customer_name: string
    customer_id?: string
    employee_id?: string | null
    total_value: number
    created_at: string
    status: string
    payment_method?: string
    installments?: number
    commission_amount?: number
    profit_amount?: number
    icms_compl_value?: number
    icms_st_value?: number
    difal_value?: number
    fcp_value?: number
    installment_preset?: string | null
    discount_mode?: string | null
    global_discount_percent?: number
}

function Sales() {
    const { modal: modalApi } = AntdApp.useApp()
    const [sales, setSales] = useState<SaleRow[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
    const [selectedSale, setSelectedSale] = useState<any>(null)
    const [saleItems, setSaleItems] = useState<SaleItemRow[]>([])
    const [detailItems, setDetailItems] = useState<any[]>([])
    const [saving, setSaving] = useState(false)
    const [searchText, setSearchText] = useState('')
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null])
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()
    const [pendingBudgets, setPendingBudgets] = useState<PendingBudget[]>([])
    const [registerModalOpen, setRegisterModalOpen] = useState(false)
    const [selectedBudget, setSelectedBudget] = useState<PendingBudget | null>(null)
    const [registerForm] = Form.useForm()
    const [registerSaving, setRegisterSaving] = useState(false)
    const [orderPaymentModalOpen, setOrderPaymentModalOpen] = useState(false)
    const [selectedOrderSale, setSelectedOrderSale] = useState<SaleRow | null>(null)
    const [orderPaymentForm] = Form.useForm()
    const [orderPaymentSaving, setOrderPaymentSaving] = useState(false)
    const [exportModalOpen, setExportModalOpen] = useState(false)
    const [isSplitPay, setIsSplitPay] = useState(false)

    const [receiptFile, setReceiptFile] = useState<UploadFile[]>([])
    const [registerReceiptFile, setRegisterReceiptFile] = useState<UploadFile[]>([])
    const [attachDesc, setAttachDesc] = useState('')
    const [registerAttachDesc, setRegisterAttachDesc] = useState('')

    // Parcelas customizadas para Cheque pré-datado / Boleto (Venda no Balcão)
    const [customInstallments, setCustomInstallments] = useState<InstallmentRow[]>([{ date: null, amount: 0 }])
    const [installmentPreset, setInstallmentPreset] = useState<InstallmentPresetValue>('customizado')
    const [registerInstallmentPreset, setRegisterInstallmentPreset] = useState<InstallmentPresetValue>('customizado')
    const [empProductTablesV, setEmpProductTablesV] = useState<{id: string; name: string; type: string; commission_percent?: number}[]>([])
    const [empServiceTablesV, setEmpServiceTablesV] = useState<{id: string; name: string; type: string; commission_percent?: number}[]>([])
    const [tableSectionsV, setTableSectionsV] = useState<{key: string; tableId: string | null}[]>([{key: 'ts-0', tableId: null}])
    const [globalDiscountPercentV, setGlobalDiscountPercentV] = useState(0)
    const [discountModeV, setDiscountModeV] = useState<DiscountMode>('PROPORTIONAL')
    const mrmConfig = useTenantTaxContext()
    // P0 — Loading guard (Aria §7 + Quinn §4): rates ausentes inflam comissão.
    const motorReady = !mrmConfig.enabled || (!mrmConfig.loading && mrmConfig.rates.length > 0)

    // EPIC-RR-DISPLAY S5: distribuição semântica do RR para venda no drawer de detalhe.
    // Vendas consomem snapshot persistido em `sale_items.tax_breakdown` (fallback para
    // `budget_items.tax_breakdown` em vendas antigas FROM_BUDGET).
    // Schema: commission_pct/profit_pct em DECIMAL (0.05) — convertemos para base 100.
    const saleResidualItems: ResidualItemInput[] = useMemo(
        () => (detailItems || []).map((it: any) => ({
            unit_price: Number(it.unit_price) || 0,
            quantity: Number(it.quantity) || 0,
            commission_percent: it.commission_pct != null ? Number(it.commission_pct) * 100 : null,
            profit_percent: it.profit_pct != null ? Number(it.profit_pct) * 100 : null,
            tax_breakdown: (it.tax_breakdown ?? null) as TaxBreakdown | null,
        })),
        [detailItems],
    )
    const saleSubtotal = useMemo(
        () => (detailItems || []).reduce(
            (s: number, it: any) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0),
            0,
        ),
        [detailItems],
    )
    const saleFinalValue = Number(selectedSale?.finalValue) || saleSubtotal
    const saleTenantTaxRates = useMemo(
        () => ({ irpj: mrmConfig.irpj_pct || 0, csll: mrmConfig.csll_pct || 0 }),
        [mrmConfig.irpj_pct, mrmConfig.csll_pct],
    )
    // Epic MRM-V7 / ADR-010: derivar discountPct a partir do snapshot persistido
    // (saleSubtotal − saleFinalValue) / saleSubtotal × 100
    const saleDiscountPct = useMemo(() => {
        if (saleSubtotal <= 0 || saleFinalValue >= saleSubtotal) return 0
        return ((saleSubtotal - saleFinalValue) / saleSubtotal) * 100
    }, [saleSubtotal, saleFinalValue])
    // Dossiê Julho 2026 (Correção 5): Âncora Gerencial = Σ âncoras (snapshot persistido) —
    // denominador correto das alíquotas efetivas (isola a Op. Externa). Fallback a totalNet.
    const saleAncoraGerencial = saleResidualItems.reduce(
        (s, it) => s + (Number(it.tax_breakdown?.ancora_interna) || 0),
        0,
    )
    const saleResidualDistribution = useResidualDistribution(
        saleResidualItems,
        saleSubtotal,
        saleFinalValue,
        mrmConfig.regime ?? null,
        saleTenantTaxRates,
        saleDiscountPct,
        (selectedSale?.discount_mode === 'SELLER_REDUCTION' || selectedSale?.discount_mode === 'PROFIT_REDUCTION')
            ? selectedSale.discount_mode
            : 'PROPORTIONAL',
        saleAncoraGerencial,
    )
    // S14 — DRE Consolidada para vendas (lê snapshot persistido em sale_items.tax_breakdown)
    const saleConsolidatedDRE = useMemo(() => {
        const dreItems: DREItemInput[] = (detailItems || []).map((it: any) => ({
            unit_price: Number(it.unit_price) || 0,
            quantity: Number(it.quantity) || 0,
            cost_total: it.cost_total != null ? Number(it.cost_total) : null,
            commission_percent: it.commission_pct != null ? Number(it.commission_pct) * 100 : null,
            profit_percent: it.profit_pct != null ? Number(it.profit_pct) * 100 : null,
            tax_breakdown: it.tax_breakdown ?? null,
        }))
        return computeConsolidatedDRE({
            items: dreItems,
            totalGross: saleSubtotal,
            totalNet: saleFinalValue,
            regime: mrmConfig.regime ?? null,
            expenseStructure: {
                fixed_pct: Number(mrmConfig.expense_breakdown.fixed_pct) || 0,
                variable_pct: Number(mrmConfig.expense_breakdown.variable_pct) || 0,
                financial_pct: Number(mrmConfig.expense_breakdown.financial_pct) || 0,
                administrative_pct: Number(mrmConfig.expense_breakdown.administrative_pct) || 0,
                mod_pct: Number(mrmConfig.mod_pct) || 0,
            },
            tenantTaxRates: saleTenantTaxRates,
        })
    }, [detailItems, saleSubtotal, saleFinalValue, mrmConfig.regime, mrmConfig.mod_pct, mrmConfig.expense_breakdown, saleTenantTaxRates])

    // EPIC-MRM-V5 (Story 005): extrai cascade_trace, peso/âncora, regime guard dos
    // snapshots persistidos em sale_items.tax_breakdown.
    const saleEpicV5DisplayData = useMemo(
        () => extractEpicV5DisplayData(detailItems || [], {
            regime: mrmConfig.regime,
            csll_pct: mrmConfig.csll_pct,
            irpj_pct: mrmConfig.irpj_pct,
        }),
        [detailItems, mrmConfig.regime, mrmConfig.csll_pct, mrmConfig.irpj_pct],
    )
    const [discountInputModeV, setDiscountInputModeV] = useState<'PERCENT' | 'AMOUNT'>('PERCENT')
    const selectedEmployeeIdV = Form.useWatch('employee_id', form)
    // ICMS Complementar (LC 87/1996, art. 13, §1º, II): só consumidor final NÃO contribuinte.
    // Ausência de cliente (venda de balcão sem destinatário) → assume contribuinte (não aplica).
    const resolveIcmsComplApplies = (customerId?: string | null) =>
        customers.find((c) => c.id === customerId)?.is_icms_contributor === false
    const selectedCustomerIdV = Form.useWatch('customer_id', form)
    const icmsComplAppliesV = resolveIcmsComplApplies(selectedCustomerIdV)
    // ICMS Complementar — hierarquia de ativação (documento oficial 2026-06-10): destinatário
    // (contribuinte?) + frete (CIF/FOB) + bloqueio ST/DIFAL + override. O motor decide na Etapa 17.
    // Padrão nativo FOB (item 5.1a): sem valor explícito, frete fica fora da base.
    const freightModeV: 'CIF' | 'FOB' = (Form.useWatch('freight_mode', form) as 'CIF' | 'FOB') ?? 'FOB'
    const icmsComplOverrideV: 'FORCE_OFF' | null =
        Form.useWatch('icms_compl_override', form) === 'FORCE_OFF' ? 'FORCE_OFF' : null
    // Consolida os parâmetros de OPERAÇÃO da hierarquia para um destinatário. ST/DIFAL é por-produto
    // (bloqueio quando "algum item ativo"); frete+seguro separados das demais despesas acessórias.
    const buildIcmsComplParams = (customerId?: string | null) => {
        const cust = customers.find((c) => c.id === customerId)
        const is_contributor: boolean | null =
            cust == null ? null : cust.is_icms_contributor === true ? true : cust.is_icms_contributor === false ? false : null
        const findProd = (id?: string | null) => (products as any[]).find((x) => x.id === id)
        return {
            is_contributor,
            freight_mode: freightModeV,
            st_active: saleItems.some((i) => !!findProd(i.product_id)?.icms_st_active),
            difal_active: saleItems.some((i) => !!findProd(i.product_id)?.difal_active),
            freight: saleItems.reduce((s, i) => {
                const p = findProd(i.product_id)
                return s + ((Number(p?.freight_value) || 0) + (Number(p?.insurance_value) || 0)) * (Number(i.quantity) || 0)
            }, 0),
            accessory: saleItems.reduce((s, i) => {
                const p = findProd(i.product_id)
                return s + (Number(p?.accessory_expenses_value) || 0) * (Number(i.quantity) || 0)
            }, 0),
            override: icmsComplOverrideV,
        }
    }
    const latestEmployeeIdVRef = useRef<string | undefined>(undefined)

    useEffect(() => {
        latestEmployeeIdVRef.current = selectedEmployeeIdV
        if (!selectedEmployeeIdV) {
            setEmpProductTablesV([])
            setEmpServiceTablesV([])
            setTableSectionsV([{key: 'ts-0', tableId: null}])
            setSaleItems([])
            return
        }
        const empIdAtFetch = selectedEmployeeIdV
        ;(async () => {
            const { data } = await (supabase as any)
                .from('employee_commission_tables')
                .select('commission_tables(id, name, type, commission_percent)')
                .eq('employee_id', empIdAtFetch)
            if (empIdAtFetch !== latestEmployeeIdVRef.current) return
            const tables = (data || []).map((r: any) => r.commission_tables).filter(Boolean)
            const productTables = tables.filter((t: any) => t.type === 'PRODUCT')
            const serviceTables = tables.filter((t: any) => t.type === 'SERVICE')
            setEmpProductTablesV(productTables)
            setEmpServiceTablesV(serviceTables)
            const firstTable = productTables[0] || serviceTables[0]
            setTableSectionsV([{key: 'ts-0', tableId: firstTable?.id || null}])
            setSaleItems([])
        })()
    }, [selectedEmployeeIdV])

    const allEmpTablesV = useMemo(() => [...empProductTablesV, ...empServiceTablesV], [empProductTablesV, empServiceTablesV])
    const usedTableIdsV = tableSectionsV.map(s => s.tableId).filter(Boolean) as string[]
    const employeeHasNoTablesV = !!selectedEmployeeIdV && empProductTablesV.length === 0 && empServiceTablesV.length === 0

    // Parcelas customizadas para Cheque pré-datado / Boleto (Registrar venda de orçamento)
    const [registerCustomInstallments, setRegisterCustomInstallments] = useState<InstallmentRow[]>([{ date: null, amount: 0 }])

    const { canView, canEdit } = usePermissions()
    const { isMobile } = useDevice()
    if (!canView(MODULES.SALES)) {
        return <Layout title={PAGE_TITLES.SALES}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    const uploadReceipt = async (file: File, saleId: string, tenantId: string): Promise<string | null> => {
        const ext = file.name.split('.').pop()
        const path = `${tenantId}/${saleId}.${ext}`
        const { error } = await supabase.storage.from('comprovantes').upload(path, file, { upsert: true })
        if (error) { console.error('Upload error:', error); return null }
        return path
    }

    const getReceiptUrl = async (path: string): Promise<string | null> => {
        const { data, error } = await supabase.storage.from('comprovantes').createSignedUrl(path, 3600)
        if (error) return null
        return data?.signedUrl || null
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            // Try full query with employees join first; fall back to simpler query if columns don't exist
            let salesData: any[] | null = null
            const sbv = supabase as any
            const { data: salesFull, error: salesErr } = await sbv
                .from('sales')
                .select('*, products(name), customers(name), employees(name)')
                .eq('is_active', true)
                .order('sale_date', { ascending: false })
            if (!salesErr) {
                salesData = salesFull
            } else {
                console.warn('Sales query with employees join failed, falling back:', salesErr.message)
                const { data: salesSimple } = await sbv
                    .from('sales')
                    .select('*, products(name), customers(name)')
                    .eq('is_active', true)
                    .order('sale_date', { ascending: false })
                salesData = salesSimple
            }

            // Products: try with recurrence_days, fall back without
            let prods: any[] | null = null
            // V17 (2026-05-28): inclui campos para motor V17 (terceirizadas, sale_price_base, valor_precificado)
            const v17Cols = 'freight_value, insurance_value, accessory_expenses_value, sale_price_base, valor_precificado_icms_piscofins, ipi_value, icms_st_active, difal_active, st_difal_interestadual, difal_base_dupla, mva_original_pct, icms_alq_interna_destino_pct, icms_alq_interestadual_origem_pct, icms_interna_origem_pct, fcp_alq_pct'
            // ADR-022: alíquotas tributárias por item — necessárias para o motor derivar IBS/CBS
            // efetivo (referência × (1 − fator)) na venda balcão. Sem isto, IBS/CBS caíam no tenant.
            const taxCols = 'icms_pct, pis_cofins_pct, pis_pct, cofins_pct, iss_pct, is_pct, ipi_pct, ibs_pct, cbs_pct, ibs_reference_pct, cbs_reference_pct, iva_dual_reduction_factor, icms_st_pct, difal_pct, fcp_pct, iss_retido_pct, irpj_pct, csll_pct'
            const { data: prodsFull, error: prodsErr } = await supabase.from('products').select(`id, name, sale_price, cost_total, profit_percent, commission_table_id, recurrence_days, ${v17Cols}, ${taxCols}`).order('name')
            if (!prodsErr) {
                prods = prodsFull
            } else {
                console.warn('Products query failed, falling back:', prodsErr.message)
                const { data: prodsSimple } = await supabase.from('products').select('id, name, sale_price, cost_total, profit_percent, commission_table_id').order('name')
                prods = prodsSimple
            }

            // Services: try with recurrence_days, fall back without
            let svcs: any[] | null = null
            const svb = supabase as any
            const svcTaxCols = 'icms_pct, pis_cofins_pct, pis_pct, cofins_pct, iss_pct, is_pct, ipi_pct, ibs_pct, cbs_pct, ibs_reference_pct, cbs_reference_pct, iva_dual_reduction_factor, iss_retido_pct, irpj_pct, csll_pct, sale_price_base, freight_value, insurance_value, accessory_expenses_value'
            const { data: svcsFull, error: svcsErr } = await svb.from('services').select(`id, name, base_price, commission_percent, profit_percent, commission_table_id, recurrence_days, ${svcTaxCols}`).eq('status', 'ACTIVE').order('name')
            if (!svcsErr) {
                svcs = svcsFull
            } else {
                console.warn('Services query failed, falling back:', svcsErr.message)
                const { data: svcsSimple } = await svb.from('services').select('id, name, base_price, commission_percent, profit_percent, commission_table_id').eq('status', 'ACTIVE').order('name')
                svcs = svcsSimple
            }

            // Customers and employees (employees may not have the table yet)
            const { data: custs } = await (supabase as any).from('customers').select('id, name, is_icms_contributor').eq('is_active', true).order('name')
            let emps: any[] | null = null
            try {
                const { data: empsData, error: empsErr } = await (supabase as any).from('employees').select('id, name, commission_percent').eq('is_active', true).order('name')
                if (!empsErr) emps = empsData
            } catch (e) {
                console.warn('Could not load employees:', e)
            }

            const rows: SaleRow[] = (salesData || []).map((s: any) => ({
                id: s.id,
                sale_code: s.sale_code || null,
                budget_id: s.budget_id || null,
                productName: s.products?.name || s.description || '-',
                quantity: s.quantity || 1,
                unitPrice: s.unit_price || s.final_value || 0,
                finalValue: s.final_value || 0,
                commissionAmount: Number(s.commission_amount) || 0,
                customerName: s.customers?.name || '-',
                sellerName: s.employees?.name || '-',
                description: s.description || '',
                saleDate: s.sale_date,
                status: s.status || 'COMPLETED',
                paymentMethod: s.payment_method || '-',
                installments: s.installments || 1,
                saleType: s.sale_type || 'MANUAL',
                receiptUrl: s.receipt_url || null,
                // MRM S2.3: defensive default (coluna pode não existir até migration rodar)
                requiresReview: s.requires_review === true,
            }))
            setSales(rows)
            setProducts(prods || [])
            setCustomers(custs || [])
            setEmployees(emps || [])
            setServices(svcs || [])
        } catch (error: any) {
            messageApi.error('Erro ao carregar vendas: ' + (error.message || 'Erro'))
        } finally {
            setLoading(false)
        }
    }

    const fetchPendingBudgets = async () => {
        const { data } = await supabase
            .from('budgets')
            .select('id, total_value, created_at, status, sale_id, payment_method, installments, commission_amount, profit_amount, icms_compl_value, icms_st_value, difal_value, fcp_value, installment_preset, discount_mode, global_discount_percent, customer_id, employee_id, customer:customers(name)')
            .in('status', ['APPROVED', 'SENT', 'AWAITING_PAYMENT'])
            .is('sale_id', null)
            .order('created_at', { ascending: false })
        setPendingBudgets((data || []).map((b: any) => ({
            id: b.id,
            customer_name: b.customer?.name || 'Sem cliente',
            customer_id: b.customer_id || undefined,
            employee_id: b.employee_id || null,
            total_value: Number(b.total_value) || 0,
            created_at: b.created_at,
            status: b.status,
            payment_method: b.payment_method || undefined,
            installments: Number(b.installments) || 1,
            commission_amount: Number(b.commission_amount) || 0,
            profit_amount: Number(b.profit_amount) || 0,
            icms_compl_value: Number(b.icms_compl_value) || 0,
            icms_st_value: Number(b.icms_st_value) || 0,
            difal_value: Number(b.difal_value) || 0,
            fcp_value: Number(b.fcp_value) || 0,
            installment_preset: b.installment_preset || null,
            discount_mode: b.discount_mode || null,
            global_discount_percent: Number(b.global_discount_percent) || 0,
        })))
    }

    const handleOpenRegisterSale = async (budget: PendingBudget) => {
        const { data: fresh } = await (supabase as any)
            .from('budgets')
            .select('id, status, total_value, created_at, payment_method, installments, commission_amount, profit_amount, icms_compl_value, icms_st_value, difal_value, fcp_value, installment_preset, discount_mode, global_discount_percent, customer_id, employee_id, customer:customers(name)')
            .eq('id', budget.id)
            .single()
        if (fresh?.status === 'PAID') {
            messageApi.info('Este orçamento já foi finalizado e o pagamento lançado.')
            await fetchPendingBudgets()
            return
        }
        const freshBudget: PendingBudget = fresh ? {
            id: fresh.id,
            customer_name: (fresh as any).customer?.name || 'Sem cliente',
            customer_id: (fresh as any).customer_id || undefined,
            employee_id: (fresh as any).employee_id || null,
            total_value: Number(fresh.total_value) || 0,
            created_at: fresh.created_at,
            status: fresh.status,
            payment_method: (fresh as any).payment_method || undefined,
            installments: Number((fresh as any).installments) || 1,
            commission_amount: Number((fresh as any).commission_amount) || 0,
            profit_amount: Number((fresh as any).profit_amount) || 0,
            icms_compl_value: Number((fresh as any).icms_compl_value) || 0,
            icms_st_value: Number((fresh as any).icms_st_value) || 0,
            difal_value: Number((fresh as any).difal_value) || 0,
            fcp_value: Number((fresh as any).fcp_value) || 0,
            installment_preset: (fresh as any).installment_preset || null,
            discount_mode: (fresh as any).discount_mode || null,
            global_discount_percent: Number((fresh as any).global_discount_percent) || 0,
        } : budget
        setSelectedBudget(freshBudget)
        registerForm.resetFields()
        const prefill: any = { sale_date: dayjs() }
        if (freshBudget.payment_method) prefill.payment_method = freshBudget.payment_method
        if (freshBudget.installments && freshBudget.installments > 1) prefill.installments = freshBudget.installments
        registerForm.setFieldsValue(prefill)

        // Carrega parcelas customizadas REAIS salvas no orçamento (BOLETO/CHEQUE_PRE_DATADO).
        // Se não houver linhas salvas, cai no preset; caso contrário, ignora preset e usa as datas/valores reais.
        const { data: instRows } = await (supabase as any)
            .from('budget_installment_rows')
            .select('due_date, amount, sort_order')
            .eq('budget_id', freshBudget.id)
            .order('sort_order')

        if (instRows && instRows.length > 0) {
            setRegisterInstallmentPreset('customizado')
            setRegisterCustomInstallments(
                instRows.map((r: any) => ({ date: dayjs(r.due_date), amount: Number(r.amount) || 0 }))
            )
        } else {
            const preset = (freshBudget.installment_preset || 'customizado') as any
            setRegisterInstallmentPreset(preset)
            if (preset !== 'customizado') {
                const baseDate = freshBudget.created_at ? dayjs(freshBudget.created_at) : dayjs()
                const insts = buildInstallmentsByPreset(preset, baseDate)
                const total = Number(freshBudget.total_value) || 0
                const n = insts.length
                const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                setRegisterCustomInstallments(insts.map(inst => ({ ...inst, amount: amt })))
            } else {
                setRegisterCustomInstallments([{ date: null, amount: 0 }])
            }
        }
        setRegisterModalOpen(true)
    }

    const handleRegisterSaleFromBudget = async () => {
        if (!selectedBudget) return
        try {
            await registerForm.validateFields()
            if (registerReceiptFile.length > 0 && !registerAttachDesc.trim()) {
                messageApi.error('Informe a descrição do anexo')
                return
            }
            // P0 — Loading guard: bloqueia herdar snapshot quando rates não carregaram.
            if (mrmConfig.enabled && !motorReady) {
                messageApi.error('Carregando contexto fiscal. Aguarde alguns segundos e tente novamente.')
                return
            }
            setRegisterSaving(true)
            const values = registerForm.getFieldsValue()
            const tenantId = await getTenantId()
            if (!tenantId) { messageApi.error('Sessão expirada.'); return }
            const createdBy = await getCurrentUserId()
            if (!createdBy) { messageApi.error('Sessão inválida. Faça login novamente.'); setRegisterSaving(false); return }

            const { data: budgetCheck } = await supabase.from('budgets').select('id, status').eq('id', selectedBudget.id).single()
            if (budgetCheck?.status === 'PAID') {
                messageApi.warning('Este orçamento já foi finalizado por outra pessoa. Atualize a lista.')
                setRegisterModalOpen(false)
                await fetchPendingBudgets()
                setRegisterSaving(false)
                return
            }

            // Try to get employee_id from budget (column may not exist)
            let budgetEmployeeId: string | null = null
            const { data: budgetEmp, error: budgetEmpErr } = await (supabase as any).from('budgets').select('employee_id').eq('id', selectedBudget.id).single()
            if (!budgetEmpErr) {
                budgetEmployeeId = budgetEmp?.employee_id || null
            } else {
                console.warn('employee_id column may not exist on budgets:', budgetEmpErr.message)
            }

            const { data: sale, error: saleErr } = await supabase.from('sales').insert({
                tenant_id: tenantId,
                created_by: createdBy,
                budget_id: selectedBudget.id,
                customer_id: selectedBudget.customer_id || null,
                quantity: 1,
                unit_price: selectedBudget.total_value,
                final_value: selectedBudget.total_value,
                payment_method: values.payment_method,
                installments: values.installments || 1,
                description: `Venda via orçamento — ${selectedBudget.customer_name}`,
                sale_date: values.sale_date ? values.sale_date.toISOString() : new Date().toISOString(),
                sale_type: 'FROM_BUDGET',
                status: 'COMPLETED',
                commission_amount: selectedBudget.commission_amount || 0,
                profit_amount: selectedBudget.profit_amount || 0,
                icms_compl_value: selectedBudget.icms_compl_value || 0,
                icms_st_value: (selectedBudget as any).icms_st_value || 0,
                difal_value: (selectedBudget as any).difal_value || 0,
                fcp_value: (selectedBudget as any).fcp_value || 0,
                // ICMS Complementar — parâmetros de operação da hierarquia (linhagem orçamento→venda).
                freight_mode: (selectedBudget as any).freight_mode || 'CIF',
                icms_compl_override: (selectedBudget as any).icms_compl_override ?? null,
            }).select().single()
            if (saleErr) throw saleErr

            // Gerar e salvar código da venda (VD-XXXXXX)
            if (sale?.id) {
                const saleCode = `VD-${sale.id.slice(0, 6).toUpperCase()}`
                await (supabase as any).from('sales').update({ sale_code: saleCode }).eq('id', sale.id)
            }

            // Try to set employee_id separately (column may not exist yet)
            if (budgetEmployeeId && sale?.id) {
                const { error: empErr } = await (supabase as any).from('sales').update({ employee_id: budgetEmployeeId }).eq('id', sale.id)
                if (empErr) console.warn('employee_id column may not exist yet on sales:', empErr.message)
            }

            const { data: updatedBudget } = await supabase.from('budgets').update({ status: 'PAID', sale_id: sale.id }).eq('id', selectedBudget.id).neq('status', 'PAID').select('id').single()
            if (!updatedBudget) {
                await (supabase as any).from('sales').update({ is_active: false }).eq('id', sale.id)
                messageApi.warning('Este orçamento já foi finalizado por outra pessoa. Nenhuma alteração foi mantida.')
                setRegisterModalOpen(false)
                await fetchPendingBudgets()
                setRegisterSaving(false)
                return
            }

            // Se houver pedido vinculado a este orçamento, marcar como PAID (some de /pedidos)
            if (selectedBudget.id) {
                await (supabase as any)
                    .from('orders')
                    .update({ status: 'PAID', sale_id: sale.id, updated_at: new Date().toISOString() })
                    .eq('budget_id', selectedBudget.id)
                    .neq('status', 'PAID')
            }

            // Copiar budget_items → sale_items e descontar estoque
            // S1.2 MRM: AC7 — herdar snapshot do orçamento pai (commission_pct,
            // profit_pct, tax_breakdown) garantindo imutabilidade do snapshot.
            const { data: budgetItems } = await (supabase as any)
                .from('budget_items')
                .select('product_id, service_id, quantity, unit_price, discount, manual_description, commission_pct, profit_pct, tax_breakdown')
                .eq('budget_id', selectedBudget.id)

            if (budgetItems && budgetItems.length > 0) {
                // Criar sale_items a partir dos budget_items, distribuindo o desconto
                // global proporcionalmente para que a soma dos itens bata com total_value.
                const saleSnapshotCtx: TenantSnapshotContext = {
                    regime: mrmConfig.regime,
                    rates: mrmConfig.rates,
                    csll_pct: mrmConfig.csll_pct,
                    irpj_pct: mrmConfig.irpj_pct,
                    use_snapshot_rates: mrmConfig.useSnapshotRates,
                }
                // Story MRM-V2-S3.1: shadow context (sale).
                const saleShadowCtx = { tenant_id: tenantId, document_id: sale.id, document_type: 'sale' as const }
                const rawSaleItems = budgetItems.map((bi: any) => {
                    // hydrateItemSnapshot é idempotente: se bi.tax_breakdown já existe e
                    // use_snapshot_rates=true, ele é PRESERVADO (AC3 — imutabilidade).
                    const snap = hydrateItemSnapshot(
                        {
                            unit_price: bi.unit_price,
                            quantity: bi.quantity,
                            commission_pct: Number(bi.commission_pct ?? 0),
                            profit_pct: Number(bi.profit_pct ?? 0),
                            prev_breakdown: bi.tax_breakdown ?? null,
                        },
                        saleSnapshotCtx,
                        saleShadowCtx,
                    )
                    return {
                        sale_id: sale.id,
                        product_id: bi.product_id || null,
                        service_id: bi.service_id || null,
                        quantity: bi.quantity,
                        unit_price: bi.unit_price,
                        discount: bi.discount || 0,
                        description: bi.manual_description || null,
                        commission_pct: snap.commission_pct,
                        profit_pct: snap.profit_pct,
                        tax_breakdown: snap.tax_breakdown,
                    }
                })
                const saleItemsToInsert = distributeDiscountToItems(rawSaleItems, Number(selectedBudget.total_value))
                await (supabase as any).from('sale_items').insert(saleItemsToInsert)

                for (const bi of budgetItems) {
                    if (!bi.product_id) continue
                    const { data: ps } = await supabase
                        .from('stock')
                        .select('id, quantity_current')
                        .eq('product_id', bi.product_id)
                        .eq('stock_type', 'PRODUCT')
                        .single()

                    if (ps) {
                        const qty = Number(bi.quantity) || 1
                        const newQty = Math.max(0, (ps.quantity_current || 0) - qty)
                        await supabase.from('stock').update({ quantity_current: newQty, updated_at: new Date().toISOString() }).eq('id', ps.id)
                        await supabase.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', bi.product_id)
                        await supabase.from('stock_movements').insert({
                            stock_id: ps.id,
                            delta_quantity: -qty,
                            reason: `Venda via orçamento — ${selectedBudget.customer_name}`,
                            created_by: createdBy,
                        })
                    }
                }
            }

            if (registerReceiptFile.length > 0 && registerReceiptFile[0].originFileObj) {
                const file = registerReceiptFile[0].originFileObj
                const uploadPath = await uploadReceipt(file, sale.id, tenantId)
                if (uploadPath) {
                    await (supabase as any).from('sales').update({ receipt_url: uploadPath }).eq('id', sale.id)
                    const { data: budgetRow } = await supabase.from('budgets').select('customer_id').eq('id', selectedBudget.id).single()
                    if (budgetRow?.customer_id) {
                        await (supabase as any).from('customer_attachments').insert({
                            tenant_id: tenantId,
                            customer_id: budgetRow.customer_id,
                            origin_type: 'SALE',
                            origin_id: sale.id,
                            file_path: uploadPath,
                            file_name: file.name,
                            file_size: file.size,
                            mime_type: file.type,
                            description: registerAttachDesc || 'Comprovante de pagamento',
                            created_by: createdBy,
                        })
                    }
                }
            }

            const payLabel = PAYMENT_METHODS.find(p => p.value === values.payment_method)?.label || values.payment_method
            const numInstallments = values.installments || 1
            const now = new Date()
            const curYear = now.getFullYear()
            const curMonth = now.getMonth()
            // Lançamentos a Receber: não vai para o caixa — registra em pending_receivables
            if (values.payment_method === 'LANCAMENTOS_A_RECEBER') {
                if (!selectedBudget.customer_id) {
                    messageApi.error('O método "Lançamentos a Receber" exige um cliente vinculado ao orçamento.')
                    setRegisterSaving(false)
                    return
                }
                await (supabase as any).from('pending_receivables').insert({
                    tenant_id: tenantId,
                    customer_id: selectedBudget.customer_id,
                    employee_id: selectedBudget.employee_id || null,
                    sale_id: sale.id,
                    budget_id: selectedBudget.id,
                    amount: Number(selectedBudget.total_value),
                    description: `Venda orçamento: ${selectedBudget.customer_name} — ${payLabel}`,
                    launch_date: dayjs().format('YYYY-MM-DD'),
                    origin_type: 'BUDGET',
                    status: 'PENDING',
                    created_by: createdBy,
                })
            } else if (values.payment_method === 'CARTAO_CREDITO') {
                const totalValue = Number(selectedBudget.total_value)
                const amountPerInstallment = totalValue / numInstallments
                const installmentEntries = []
                for (let i = 1; i <= numInstallments; i++) {
                    const dueDate = new Date(curYear, curMonth + i, 1)
                    installmentEntries.push({
                        tenant_id: tenantId,
                        type: 'INCOME',
                        origin_type: 'SALE',
                        origin_id: sale.id,
                        amount: amountPerInstallment,
                        due_date: dayjs(dueDate).format('YYYY-MM-DD'),
                        description: numInstallments > 1
                            ? `Venda orçamento: ${selectedBudget.customer_name} — ${payLabel} (${i}/${numInstallments})`
                            : `Venda orçamento: ${selectedBudget.customer_name} — ${payLabel}`,
                        payment_method: values.payment_method,
                        ...(numInstallments > 1 ? { installment_number: i, installment_total: numInstallments } : {}),
                        created_by: createdBy,
                    })
                }
                await (supabase as any).from('cash_entries').insert(installmentEntries)
            } else {
                const isBoletoOrCheque = values.payment_method === 'BOLETO' || values.payment_method === 'CHEQUE_PRE_DATADO'
                if (isBoletoOrCheque) {
                    const validInstallments = registerCustomInstallments.filter(r => r.date && r.amount > 0)
                    if (validInstallments.length === 0) {
                        messageApi.error('Informe ao menos uma data e valor de recebimento.')
                        setRegisterSaving(false)
                        return
                    }
                    const customEntries = validInstallments.map((r, idx) => ({
                        tenant_id: tenantId,
                        type: 'INCOME',
                        origin_type: 'SALE',
                        origin_id: sale.id,
                        amount: r.amount,
                        due_date: r.date.format('YYYY-MM-DD'),
                        paid_date: null,
                        description: validInstallments.length > 1
                            ? `Venda orçamento: ${selectedBudget.customer_name} — ${payLabel} (${idx + 1}/${validInstallments.length})`
                            : `Venda orçamento: ${selectedBudget.customer_name} — ${payLabel}`,
                        payment_method: values.payment_method,
                        created_by: createdBy,
                    }))
                    await (supabase as any).from('cash_entries').insert(customEntries)
                } else {
                const due = values.sale_date ? values.sale_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
                await supabase.from('cash_entries').insert({
                    tenant_id: tenantId,
                    type: 'INCOME',
                    origin_type: 'SALE',
                    origin_id: sale.id,
                    amount: selectedBudget.total_value,
                    due_date: due,
                    paid_date: due,
                    payment_method: values.payment_method,
                    description: `Venda orçamento: ${selectedBudget.customer_name} — ${payLabel}`,
                    created_by: createdBy,
                })
                }
            }

            // Customer-level recurrence — any sale resets/creates a dispatch based on customer.recurrence_days
            if (selectedBudget.customer_id) {
                await syncCustomerRecurrenceOnSale({
                    supabase,
                    tenantId,
                    customerId: selectedBudget.customer_id,
                    saleId: sale.id,
                    saleDate: values.sale_date ? dayjs(values.sale_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                    userId: createdBy,
                })
            }

            messageApi.success('Venda registrada com sucesso!')
            setRegisterModalOpen(false)
            setRegisterReceiptFile([])
            setRegisterAttachDesc('')
            await Promise.all([fetchData(), fetchPendingBudgets()])
        } catch (error: any) {
            messageApi.error('Erro: ' + (error.message || 'Preencha os campos.'))
        } finally {
            setRegisterSaving(false)
        }
    }

    const handleOpenOrderPaymentModal = (record: SaleRow) => {
        setSelectedOrderSale(record)
        orderPaymentForm.resetFields()
        orderPaymentForm.setFieldsValue({
            sale_date: dayjs(),
            payment_method: record.paymentMethod !== '-' ? record.paymentMethod : undefined,
        })
        setOrderPaymentModalOpen(true)
    }

    const handleConfirmOrderSalePayment = async () => {
        if (!selectedOrderSale) return
        try {
            await orderPaymentForm.validateFields()
            setOrderPaymentSaving(true)
            const values = orderPaymentForm.getFieldsValue()
            const tenantId = await getTenantId()
            if (!tenantId) { messageApi.error('Sessão expirada.'); return }
            const createdBy = await getCurrentUserId()
            if (!createdBy) { messageApi.error('Sessão inválida. Faça login novamente.'); setOrderPaymentSaving(false); return }

            const { error: updateErr } = await supabase
                .from('sales')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() } as any)
                .eq('id', selectedOrderSale.id)
            if (updateErr) throw updateErr

            const due = values.sale_date ? values.sale_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
            const payLabel = PAYMENT_METHODS.find(p => p.value === values.payment_method)?.label || values.payment_method
            await supabase.from('cash_entries').insert({
                tenant_id: tenantId,
                type: 'INCOME',
                origin_type: 'SALE',
                origin_id: selectedOrderSale.id,
                amount: selectedOrderSale.finalValue,
                due_date: due,
                paid_date: due,
                payment_method: values.payment_method,
                description: `Venda pedido: ${selectedOrderSale.customerName} — ${payLabel}`,
                created_by: createdBy,
            } as any)

            await (supabase as any)
                .from('orders')
                .update({ status: 'PAID', updated_at: new Date().toISOString() })
                .eq('sale_id', selectedOrderSale.id)

            messageApi.success('Pagamento registrado com sucesso!')
            setOrderPaymentModalOpen(false)
            await fetchData()
        } catch (error: any) {
            messageApi.error('Erro: ' + (error.message || 'Preencha os campos.'))
        } finally {
            setOrderPaymentSaving(false)
        }
    }

    useEffect(() => { fetchData(); fetchPendingBudgets() }, [])

    // KPIs
    const now = new Date()
    const monthSales = sales.filter(s => {
        const d = new Date(s.saleDate)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const totalRevenue = monthSales.reduce((sum, s) => sum + s.finalValue, 0)
    const avgTicket = monthSales.length > 0 ? totalRevenue / monthSales.length : 0
    const fromBudget = monthSales.filter(s => s.saleType === 'FROM_BUDGET').length

    const filteredSales = sales.filter(s => {
        if (s.status === 'AWAITING_PAYMENT' && s.saleType !== 'FROM_ORDER') return false
        const matchesText =
            s.productName.toLowerCase().includes(searchText.toLowerCase()) ||
            s.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
            s.sellerName.toLowerCase().includes(searchText.toLowerCase()) ||
            s.description.toLowerCase().includes(searchText.toLowerCase())
        if (!matchesText) return false
        const [start, end] = dateRange
        if (start && end && s.saleDate) {
            const saleDay = dayjs(s.saleDate)
            if (saleDay.isBefore(start, 'day') || saleDay.isAfter(end, 'day')) return false
        }
        return true
    })

    // ── Items no drawer de nova venda ──
    const handleAddProduct = (tableId: string) => {
        setSaleItems(prev => [...prev, {
            key: Date.now().toString(),
            product_id: '',
            product_name: '',
            quantity: 1,
            unit_price: 0,
            discount: 0,
            total: 0,
            is_manual: false,
            commission_table_id: tableId,
        }])
    }

    const handleAddManualProduct = () => {
        setSaleItems(prev => [...prev, {
            key: Date.now().toString(),
            product_id: '',
            product_name: '',
            quantity: 1,
            unit_price: 0,
            discount: 0,
            total: 0,
            is_manual: true,
        }])
    }

    const handleAddService = (tableId: string) => {
        setSaleItems(prev => [...prev, {
            key: Date.now().toString(),
            product_id: '',
            service_id: '',
            product_name: '',
            quantity: 1,
            unit_price: 0,
            discount: 0,
            total: 0,
            is_service: true,
            commission_table_id: tableId,
        }])
    }

    const handleServiceSelect = (key: string, serviceId: string) => {
        const svc = services.find((s: any) => s.id === serviceId)
        setSaleItems(prev => prev.map(item => {
            if (item.key !== key) return item
            const price = Number(svc?.base_price || 0)
            // V8.6: passa tenant context para cálculo runtime de MO produtiva
            const laborTenantCtxV = {
                production_labor_cost: mrmConfig.production_labor_cost,
                monthly_workload_minutes: mrmConfig.monthly_workload_minutes,
                productive_value_per_minute: mrmConfig.productive_value_per_minute,
            }
            // V16.2 (Founder 2026-05-27): semântica V9-I5 — cost_total = só material,
            // productive_labor_unit = MO separada. Motor soma. Evita dupla contagem.
            const { costTotal, productiveLaborUnit } = resolveProductCostAndLabor(svc, laborTenantCtxV)
            const financialExpenseUnit = resolveProductFinancialExpense(svc)
            const expenseBreakdownUnit = resolveProductExpenseBreakdown(svc)
            const allTables = [...empProductTablesV, ...empServiceTablesV]
            const commTable = allTables.find(t => t.id === item.commission_table_id)
            const commPct = Number(commTable?.commission_percent || svc?.commission_percent || 0)
            const profitPct = Number(svc?.profit_percent || 0)
            // V7+ (2026-05-24): helper centralizado, também lê pis_cofins_pct agregado
            const svcTaxRates: ItemTaxRates = buildItemTaxRatesFromProduct(svc)
            return { ...item, service_id: serviceId, product_name: svc?.name || '', unit_price: price, discount: 0, commission_percent: commPct, profit_percent: profitPct, cost_total: costTotal, productive_labor_unit: productiveLaborUnit, financial_expense_unit: financialExpenseUnit, expense_breakdown_unit: expenseBreakdownUnit, item_tax_rates: svcTaxRates, total: price * item.quantity }
        }))
    }

    const handleManualItemNameChange = (key: string, productName: string) => {
        setSaleItems(prev => prev.map(item =>
            item.key === key ? { ...item, product_name: productName } : item
        ))
    }

    const handleProductSelect = (key: string, productId: string) => {
        const prod = products.find(p => p.id === productId)
        setSaleItems(prev => prev.map(item => {
            if (item.key !== key) return item
            const price = Number(prod?.sale_price || 0)
            // V8.6: passa tenant context para cálculo runtime de MO produtiva
            const laborTenantCtxP = {
                production_labor_cost: mrmConfig.production_labor_cost,
                monthly_workload_minutes: mrmConfig.monthly_workload_minutes,
                productive_value_per_minute: mrmConfig.productive_value_per_minute,
            }
            // V16.2 (Founder 2026-05-27): semântica V9-I5 — cost_total = só material,
            // productive_labor_unit = MO separada. Motor soma. Evita dupla contagem.
            const { costTotal, productiveLaborUnit } = resolveProductCostAndLabor(prod, laborTenantCtxP)
            const financialExpenseUnit = resolveProductFinancialExpense(prod)
            const expenseBreakdownUnit = resolveProductExpenseBreakdown(prod)
            const allTables = [...empProductTablesV, ...empServiceTablesV]
            const commTable = allTables.find(t => t.id === item.commission_table_id)
            const commPct = Number(commTable?.commission_percent || 0)
            const profitPct = Number(prod?.profit_percent || 0)
            // V7+ (2026-05-24): helper centralizado, também lê pis_cofins_pct agregado
            const prodTaxRates: ItemTaxRates = buildItemTaxRatesFromProduct(prod)
            return { ...item, product_id: productId, product_name: prod?.name || '', unit_price: price, discount: 0, commission_percent: commPct, profit_percent: profitPct, cost_total: costTotal, productive_labor_unit: productiveLaborUnit, financial_expense_unit: financialExpenseUnit, expense_breakdown_unit: expenseBreakdownUnit, item_tax_rates: prodTaxRates, total: price * item.quantity }
        }))
    }

    const handleItemChange = (key: string, field: string, value: number) => {
        setSaleItems(prev => prev.map(item => {
            if (item.key !== key) return item
            const updated = { ...item, [field]: value }
            updated.total = updated.unit_price * updated.quantity
            return updated
        }))
    }

    const saleTotal = saleItems.reduce((s, i) => s + i.total, 0)

    // Teto do desconto: pool varia conforme discount_mode (Epic MRM-V6 / ADR-009).
    //   - PROPORTIONAL: pool = comissão + lucro
    //   - SELLER_REDUCTION: pool = apenas comissão
    //   - PROFIT_REDUCTION: pool = apenas lucro
    const maxDiscountPercentV = (() => {
        if (saleTotal <= 0) return 0
        const sumWeighted = saleItems.reduce((s, i) => {
            const comm = i.commission_percent || 0
            const prof = i.profit_percent || 0
            const contributing =
                discountModeV === 'SELLER_REDUCTION'
                    ? comm
                    : discountModeV === 'PROFIT_REDUCTION'
                        ? prof
                        : comm + prof
            return s + i.total * contributing / 100
        }, 0)
        return Math.min(100, sumWeighted / saleTotal * 100)
    })()
    const saleTotalWithDiscount = saleTotal * (1 - globalDiscountPercentV / 100)

    // ── Motor RR runtime para o drawer "Venda no Balcão" (espelha orçamentos) ──
    // V17 Cutover (2026-05-28): motor agora roda UMA VEZ sobre todos os items,
    // consolidando cross-produto antes de aplicar desconto (PDF Etapas 1-9).
    // Adapter mantém shape V16 para componentes downstream (DRE, residual).
    const balcaoReapurationDate = new Date().toISOString().slice(0, 10)
    // V17 fix peso_op_interna real (2026-05-28 noite): enriquece items com
    // valor_op_interna_unit do produto (campo products.valor_precificado_icms_piscofins).
    const balcaoEnrichedItems = saleItems.map(i => {
        const prod = i.product_id ? (products as any[]).find(p => p.id === i.product_id) : null
        const numOrNull = (v: unknown) =>
            v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null
        const terc = prod
            ? (Number(prod.freight_value) || 0) + (Number(prod.insurance_value) || 0) + (Number(prod.accessory_expenses_value) || 0)
            : 0
        return {
            ...i,
            valor_op_interna_unit: numOrNull(prod?.valor_precificado_icms_piscofins),
            sale_price_base_unit: numOrNull(prod?.sale_price_base),
            terceirizadas_unit: terc > 0 ? terc : null,
        }
    })
    const balcaoV17Results = calculateMotorV17ForPage({
        items: balcaoEnrichedItems,
        tenantCtx: {
            regime: mrmConfig.regime,
            rates: mrmConfig.rates,
            mod_pct: mrmConfig.mod_pct,
            dop_pct: mrmConfig.dop_pct,
            csll_pct: mrmConfig.csll_pct,
            irpj_pct: mrmConfig.irpj_pct,
            useSnapshotRates: mrmConfig.useSnapshotRates,
            expense_breakdown: mrmConfig.expense_breakdown,
            absorption_policy: discountModeToAbsorptionPolicy(discountModeV), // Item 2: modo do dropdown
        },
        globalDiscountPercent: globalDiscountPercentV,
        effectiveDate: balcaoReapurationDate,
        icmsComplApplies: icmsComplAppliesV,
        icmsCompl: buildIcmsComplParams(selectedCustomerIdV),
    })
    const balcaoMotorResultsByItem = saleItems.map((i, idx) => {
        const itemBase = (Number(i.unit_price) || 0) * (Number(i.quantity) || 0)
        if (itemBase <= 0) return null
        const commPctDecimal = (i.commission_percent ?? 0) / 100
        const profPctDecimal = (i.profit_percent ?? 0) / 100
        const itemCsll = resolveItemCsllPct(i.item_tax_rates ?? null, mrmConfig.csll_pct)
        const itemIrpj = resolveItemIrpjPct(i.item_tax_rates ?? null, mrmConfig.irpj_pct)
        const totalPctDistribuivel = commPctDecimal + profPctDecimal + (Number(itemCsll) || 0) + (Number(itemIrpj) || 0)
        if (totalPctDistribuivel === 0) return null
        return balcaoV17Results[idx]
    })

    // Tributos por fora consolidados (render) — paridade com orçamentos (EPIC-POR-FORA-V2 R1).
    // Derivados; não contaminam total_value/RRO. Só diferem do total quando há ST/DIFAL/FCP/Compl > 0.
    // ICMS Complementar CHEIO (o motor não aplica desconto sobre ele).
    const balcaoIcmsComplFull = balcaoMotorResultsByItem.reduce(
        (s, r) => s + (r?.taxes_outside?.find((t) => t.type === 'ICMS_COMPL')?.amount ?? 0),
        0,
    )
    // Desconto incide sobre o TOTAL A COBRAR (decisão 16/06/2026): tributos por fora também reduzem
    // por (1−d). ST/DIFAL/FCP já escalam (base pós-desconto); ICMS Compl recebe o fator aqui.
    const discountFactorV = 1 - (globalDiscountPercentV || 0) / 100
    const balcaoIcmsComplAmount = balcaoIcmsComplFull * discountFactorV
    // CHEIO (pré-desconto, d=0) → exibição ACIMA do campo de desconto.
    const balcaoStDifalFull = consolidateStDifalFromItems(saleItems, products as any[], 0)
    const balcaoTotalPorForaExtraFull =
        balcaoStDifalFull.st + balcaoStDifalFull.difal + balcaoStDifalFull.fcp + balcaoIcmsComplFull
    const balcaoTotalACobrarFull = saleTotal + balcaoTotalPorForaExtraFull
    // COM desconto (base pós-desconto) → exibição ABAIXO do desconto e persistência.
    const balcaoStDifalConsolidated = consolidateStDifalFromItems(saleItems, products as any[], globalDiscountPercentV)
    const balcaoTotalPorForaExtra =
        balcaoStDifalConsolidated.st + balcaoStDifalConsolidated.difal + balcaoStDifalConsolidated.fcp + balcaoIcmsComplAmount
    // Total a cobrar com desconto = total a cobrar cheio × (1−d).
    const balcaoTotalACobrar = saleTotalWithDiscount + balcaoTotalPorForaExtra

    const balcaoResidualItems: ResidualItemInput[] = useMemo(
        () => saleItems.map((item, idx) => {
            const motor = balcaoMotorResultsByItem[idx]
            return {
                unit_price: item.unit_price,
                quantity: item.quantity,
                commission_percent: item.commission_percent,
                profit_percent: item.profit_percent,
                tax_breakdown: null as null,
                motor_new_commission: motor?.new_commission,
                motor_new_profit: motor?.new_profit,
                motor_new_csll: motor?.new_csll,
                motor_new_irpj: motor?.new_irpj,
            }
        }),
        [saleItems, balcaoMotorResultsByItem],
    )
    const balcaoTenantTaxRates = useMemo(
        () => ({ irpj: mrmConfig.irpj_pct || 0, csll: mrmConfig.csll_pct || 0 }),
        [mrmConfig.irpj_pct, mrmConfig.csll_pct],
    )
    // Dossiê Julho 2026 (Correção 5): Âncora Gerencial = Σ âncoras do motor runtime (balcão).
    const balcaoAncoraGerencial = balcaoMotorResultsByItem.reduce(
        (s, r) => s + (Number((r as { ancora_interna?: number } | null)?.ancora_interna) || 0),
        0,
    )
    // Epic MRM-V7 / ADR-010: caminho display-first com discountPct + discountMode
    const balcaoResidualDistribution = useResidualDistribution(
        balcaoResidualItems,
        saleTotal,
        saleTotalWithDiscount,
        mrmConfig.regime ?? null,
        balcaoTenantTaxRates,
        globalDiscountPercentV,
        discountModeV,
        balcaoAncoraGerencial,
    )
    const balcaoTotalCostBase = useMemo(
        () => saleItems.reduce(
            (s, i) => s + (Number(i.cost_total) || 0) * (Number(i.quantity) || 0),
            0,
        ),
        [saleItems],
    )
    const balcaoConfigWarning = detectConfigWarning({
        totalCostBase: balcaoTotalCostBase,
        dopPct: mrmConfig.dop_pct,
        modPct: mrmConfig.mod_pct,
        totalGross: saleTotal,
    })
    const balcaoConsolidatedDRE = useMemo(() => {
        const dreItems: DREItemInput[] = saleItems.map((item, idx) => {
            const motor = balcaoMotorResultsByItem[idx]
            // V17: inclui motor_cp_total + motor_expense_breakdown (cf. orcamentos)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const motorV17 = motor as any
            // V17: terceirizadas (frete + seguros + acessórias) do cadastro do produto
            const prod = item.product_id ? (products as any[]).find(p => p.id === item.product_id) : null
            return {
                unit_price: item.unit_price,
                quantity: item.quantity,
                cost_total: item.cost_total,
                productive_labor_unit: item.productive_labor_unit, // V8.1
                commission_percent: item.commission_percent,
                profit_percent: item.profit_percent,
                tax_breakdown: motor ?? (null as null),
                motor_new_commission: motor?.new_commission,
                motor_new_profit: motor?.new_profit,
                motor_new_csll: motor?.new_csll,
                motor_new_irpj: motor?.new_irpj,
                motor_cp_total: motor?.cp,
                motor_expense_breakdown: motorV17?.expense_breakdown_v17 ?? null,
                freight_unit: prod ? Number(prod.freight_value) || 0 : 0,
                insurance_unit: prod ? Number(prod.insurance_value) || 0 : 0,
                accessory_unit: prod ? Number(prod.accessory_expenses_value) || 0 : 0,
            }
        })
        return computeConsolidatedDRE({
            items: dreItems,
            totalGross: saleTotal,
            totalNet: saleTotalWithDiscount,
            regime: mrmConfig.regime ?? null,
            expenseStructure: {
                fixed_pct: Number(mrmConfig.expense_breakdown.fixed_pct) || 0,
                variable_pct: Number(mrmConfig.expense_breakdown.variable_pct) || 0,
                financial_pct: Number(mrmConfig.expense_breakdown.financial_pct) || 0,
                administrative_pct: Number(mrmConfig.expense_breakdown.administrative_pct) || 0,
                mod_pct: Number(mrmConfig.mod_pct) || 0,
            },
            tenantTaxRates: balcaoTenantTaxRates,
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saleItems, balcaoMotorResultsByItem, saleTotal, saleTotalWithDiscount, mrmConfig.regime, mrmConfig.mod_pct, mrmConfig.expense_breakdown, balcaoTenantTaxRates])
    const balcaoEpicV5DisplayData = useMemo(() => {
        const itemsForDisplay = saleItems.map((_, idx) => ({
            tax_breakdown: balcaoMotorResultsByItem[idx] ?? null,
        }))
        return extractEpicV5DisplayData(itemsForDisplay, {
            regime: mrmConfig.regime,
            csll_pct: mrmConfig.csll_pct,
            irpj_pct: mrmConfig.irpj_pct,
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saleItems, balcaoMotorResultsByItem, mrmConfig.regime, mrmConfig.csll_pct, mrmConfig.irpj_pct])

    // ── Salvar venda manual (balcão) ──
    const handleSaveSale = async () => {
        try {
            await form.validateFields()
            if (saleItems.length === 0) {
                messageApi.warning('Adicione pelo menos um produto ou item manual!')
                return
            }
            const invalidItems = saleItems.filter(i => !i.product_id && !i.service_id && !(i.is_manual && (i.product_name || '').trim()))
            const formValues = form.getFieldsValue()
            if (formValues.payment_method === 'LANCAMENTOS_A_RECEBER' && !formValues.customer_id) {
                messageApi.error('O método "Lançamentos a Receber" exige um cliente vinculado à venda.')
                return
            }
            if (invalidItems.length > 0) {
                messageApi.warning('Preencha o produto ou o nome do item manual em todos os itens.')
                return
            }
            if (receiptFile.length > 0 && !attachDesc.trim()) {
                messageApi.error('Informe a descrição do anexo')
                return
            }
            // P0 — Loading guard: rates ausentes inflam comissão calculada no save.
            if (mrmConfig.enabled && !motorReady) {
                messageApi.error('Carregando contexto fiscal. Aguarde alguns segundos e tente novamente.')
                return
            }

            // V17 Cutover (2026-05-28): validação RRO consolidado.
            // S19 (EPIC-RR-V4) reformulado: ao invés de validar item-a-item (V16),
            // V17 valida RRO CONSOLIDADO da venda inteira (princípio PDF Etapas 1-9).
            if (mrmConfig.enabled) {
                const reapDate = new Date().toISOString().slice(0, 10)
                const validationEnrichedItems = saleItems.map(i => {
                    const prod = i.product_id ? (products as any[]).find(p => p.id === i.product_id) : null
                    const numOrNull = (v: unknown) =>
                        v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null
                    const terc = prod
                        ? (Number(prod.freight_value) || 0) + (Number(prod.insurance_value) || 0) + (Number(prod.accessory_expenses_value) || 0)
                        : 0
                    return {
                        ...i,
                        valor_op_interna_unit: numOrNull(prod?.valor_precificado_icms_piscofins),
                        sale_price_base_unit: numOrNull(prod?.sale_price_base),
                        terceirizadas_unit: terc > 0 ? terc : null,
                    }
                })
                const previewResults = calculateMotorV17ForPage({
                    items: validationEnrichedItems,
                    tenantCtx: {
                        regime: mrmConfig.regime,
                        rates: mrmConfig.rates,
                        mod_pct: mrmConfig.mod_pct,
                        dop_pct: mrmConfig.dop_pct,
                        csll_pct: mrmConfig.csll_pct,
                        irpj_pct: mrmConfig.irpj_pct,
                        useSnapshotRates: mrmConfig.useSnapshotRates,
                        expense_breakdown: mrmConfig.expense_breakdown,
                        absorption_policy: discountModeToAbsorptionPolicy(discountModeV), // Item 2: modo do dropdown
                    },
                    globalDiscountPercent: globalDiscountPercentV,
                    effectiveDate: reapDate,
                    icmsComplApplies: resolveIcmsComplApplies(formValues.customer_id),
                    icmsCompl: buildIcmsComplParams(formValues.customer_id),
                })
                // RRO consolidado é o mesmo para todos os items rateados (V17)
                const consolidatedRro = previewResults.find(r => r != null)?.rro ?? 0
                if (consolidatedRro <= 0 && saleItems.some(it => it.total > 0)) {
                    messageApi.error(`Não é possível salvar: o Resultado Residual Operacional consolidado da venda é ≤ R$ 0. Reduza o desconto ou revise os custos.`)
                    return
                }
            }

            setSaving(true)

            const values = form.getFieldsValue()
            const tenantId = await getTenantId()
            if (!tenantId) { messageApi.error('Sessão expirada.'); return }
            const createdBy = await getCurrentUserId()
            if (!createdBy) { messageApi.error('Sessão inválida. Faça login novamente.'); setSaving(false); return }

            // Comissão via Motor de Reapuração (RR) v2.1.0 — desconto reduz a
            // receita operacional, NUNCA reduz alíquotas. Rateio proporcional de
            // comissão + lucro + CSLL + IRPJ sobre RRO = RV - IMP - CP - MOD - DOP.
            //
            // Sprint S8 (EPIC-RR-DISPLAY, 20/05/2026): CP/MOD/DOP populados de verdade.
            //   CP_item  = item.cost_total × quantity
            //   MOD_item = itemBase × mod_pct  (production_labor_percent)
            //   DOP_item = itemBase × dop_pct  (fixed + variable + financial + indirect_labor)
            // A "Opção A" (CP=MOD=DOP=0) violava Etapa 7 — RRO ≈ RV.
            // V17 Cutover (2026-05-28): commission consolidado via motor único.
            // Princípio PDF Seção 23: redistribuição RRO pelos pesos originais.
            const reapurationEffectiveDateSale = new Date().toISOString().slice(0, 10)
            const saveEnrichedItems = saleItems.map(i => {
                const prod = i.product_id ? (products as any[]).find(p => p.id === i.product_id) : null
                const numOrNull = (v: unknown) =>
                    v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null
                const terc = prod
                    ? (Number(prod.freight_value) || 0) + (Number(prod.insurance_value) || 0) + (Number(prod.accessory_expenses_value) || 0)
                    : 0
                return {
                    ...i,
                    valor_op_interna_unit: numOrNull(prod?.valor_precificado_icms_piscofins),
                    sale_price_base_unit: numOrNull(prod?.sale_price_base),
                    terceirizadas_unit: terc > 0 ? terc : null,
                }
            })
            const saveV17Results = calculateMotorV17ForPage({
                items: saveEnrichedItems,
                tenantCtx: {
                    regime: mrmConfig.regime,
                    rates: mrmConfig.rates,
                    mod_pct: mrmConfig.mod_pct,
                    dop_pct: mrmConfig.dop_pct,
                    csll_pct: mrmConfig.csll_pct,
                    irpj_pct: mrmConfig.irpj_pct,
                    useSnapshotRates: mrmConfig.useSnapshotRates,
                    expense_breakdown: mrmConfig.expense_breakdown,
                    absorption_policy: discountModeToAbsorptionPolicy(discountModeV), // Item 2: modo do dropdown
                },
                globalDiscountPercent: globalDiscountPercentV,
                effectiveDate: reapurationEffectiveDateSale,
                icmsComplApplies: resolveIcmsComplApplies(formValues.customer_id),
                icmsCompl: buildIcmsComplParams(formValues.customer_id),
            })
            const commissionAmount = saveV17Results.reduce(
                (sum, result) => sum + (result?.new_commission ?? 0),
                0,
            )
            // ICMS Complementar consolidado (Etapa 17) — só > 0 p/ destinatário não contribuinte.
            // Desconto incide sobre o total a cobrar (decisão 16/06/2026): o ICMS Compl também reduz
            // por (1−d), igual ao ST/DIFAL (que já escalam na consolidação). Persiste o valor com desconto.
            const icmsComplFull = saveV17Results.reduce(
                (sum, r) => sum + (r?.taxes_outside?.find((t) => t.type === 'ICMS_COMPL')?.amount ?? 0),
                0,
            )
            const icmsComplAmount = icmsComplFull * (1 - (globalDiscountPercentV || 0) / 100)
            // EPIC-POR-FORA-V2 (S4a): ICMS-ST / DIFAL / FCP laterais — venda direta (balcão).
            // Fonte única compartilhada com orçamento (icms-st-difal.ts).
            const stDifalSale = consolidateStDifalFromItems(saleItems, products as any[], globalDiscountPercentV)

            // MRM S2.3 — Policy gate (ADR-004): venda BLOQUEIA quando RRO ≤ 0.
            // Pré-computa snapshots para alimentar a agregação. Os mesmos snapshots
            // são reutilizados no insert dos sale_items abaixo (evita recálculo).
            const directSaleSnapshotCtx: TenantSnapshotContext = {
                regime: mrmConfig.regime,
                rates: mrmConfig.rates,
                csll_pct: mrmConfig.csll_pct,
                irpj_pct: mrmConfig.irpj_pct,
                use_snapshot_rates: mrmConfig.useSnapshotRates,
            }
            // Story MRM-V2-S3.1: shadow context — venda direta (sem sale.id pré-criado).
            const directSaleShadowCtx = { tenant_id: tenantId, document_type: 'sale' as const }
            // P0 — captura imutável do desconto no save (alinha snapshot com UI).
            const discountPctSnapshotSale = globalDiscountPercentV
            const hydrateRow = (i: typeof saleItems[number]) => hydrateItemSnapshot(
                {
                    unit_price: i.unit_price,
                    quantity: i.quantity,
                    discount_value: i.total * (discountPctSnapshotSale / 100),
                    commission_pct: (i.commission_percent ?? 0) / 100,
                    profit_pct: (i.profit_percent ?? 0) / 100,
                },
                directSaleSnapshotCtx,
                directSaleShadowCtx,
            )
            const allSnaps = saleItems.map(hydrateRow)
            if (mrmConfig.enabled) {
                const aggregate = aggregateMotorResults(allSnaps.map(s => s.tax_breakdown))
                const decision = decideMrmAction({
                    motorResult: aggregate,
                    documentType: 'sale',
                    tenantSettings: mrmConfig.rro_policy ? { rro_policy: mrmConfig.rro_policy } : undefined,
                })
                if (decision.action === 'block_save') {
                    messageApi.error(decision.message)
                    setSaving(false)
                    // tenta foco no campo de desconto para auxiliar revisão.
                    try {
                        const el = document.querySelector('[data-mrm-discount-field]') as HTMLElement | null
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        el?.focus()
                    } catch { /* DOM pode não estar pronto */ }
                    return
                }
                // sale + warn (tenant permissive) → permite com aviso amigável.
                if (decision.action === 'warn') {
                    messageApi.warning(decision.message)
                }
            }

            // 1) Criar venda (employee_id saved separately to handle missing column)
            const { data: sale, error: saleErr } = await supabase.from('sales').insert({
                tenant_id: tenantId,
                created_by: createdBy,
                customer_id: values.customer_id || null,
                quantity: saleItems.reduce((s, i) => s + i.quantity, 0),
                unit_price: saleTotalWithDiscount,
                final_value: saleTotalWithDiscount,
                payment_method: values.payment_method,
                installments: values.installments || 1,
                description: values.description || 'Venda no balcão',
                sale_date: values.sale_date ? values.sale_date.toISOString() : new Date().toISOString(),
                sale_type: 'MANUAL',
                status: 'COMPLETED',
                commission_amount: commissionAmount,
                icms_compl_value: icmsComplAmount,
                icms_st_value: stDifalSale.st,
                difal_value: stDifalSale.difal,
                fcp_value: stDifalSale.fcp,
                // ICMS Complementar — parâmetros de operação da hierarquia (Etapa 17).
                freight_mode: freightModeV,
                icms_compl_override: icmsComplOverrideV,
                // Epic MRM-V6 (ADR-009): persistimos o modo escolhido pelo usuário sem coerção.
                discount_mode: discountModeV,
                engine_version: mrmConfig.enabled ? MRM_ENGINE_VERSION : 'legacy',
            }).select().single()

            if (saleErr) throw saleErr

            // Gerar e salvar código da venda (VD-XXXXXX)
            if (sale?.id) {
                const saleCode = `VD-${sale.id.slice(0, 6).toUpperCase()}`
                await (supabase as any).from('sales').update({ sale_code: saleCode }).eq('id', sale.id)
            }

            // Try to set employee_id separately (column may not exist yet)
            if (values.employee_id && sale?.id) {
                const { error: empErr } = await (supabase as any).from('sales').update({ employee_id: values.employee_id }).eq('id', sale.id)
                if (empErr) console.warn('employee_id column may not exist yet on sales:', empErr.message)
            }

            // 2) Salvar itens da venda (catálogo + manuais + serviços)
            // S1.2 MRM: hidrata snapshot fiscal por item (venda direta no balcão).
            // Pesos vêm de SaleItemRow.commission_percent/profit_percent (já em %).
            // NOTA S2.3: `directSaleSnapshotCtx` e `hydrateRow` foram movidos para o início
            // do handler (antes do gate de policy) e são reaproveitados aqui.
            const catalogItems = saleItems.filter(i => i.product_id && !i.is_service).map(i => {
                const snap = hydrateRow(i)
                return {
                    sale_id: sale.id,
                    product_id: i.product_id,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                    discount: i.discount ?? 0,
                    commission_pct: snap.commission_pct,
                    profit_pct: snap.profit_pct,
                    tax_breakdown: snap.tax_breakdown,
                }
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const serviceItems: any[] = saleItems.filter(i => i.is_service && i.service_id).map((i): any => {
                const snap = hydrateRow(i)
                return {
                    sale_id: sale.id,
                    product_id: null as string | null,
                    service_id: i.service_id,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                    discount: i.discount ?? 0,
                    description: (i.product_name || '').trim(),
                    commission_pct: snap.commission_pct,
                    profit_pct: snap.profit_pct,
                    tax_breakdown: snap.tax_breakdown,
                }
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const manualItems: any[] = saleItems.filter(i => i.is_manual && (i.product_name || '').trim()).map((i): any => {
                const snap = hydrateRow(i)
                return {
                    sale_id: sale.id,
                    product_id: null as string | null,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                    discount: i.discount ?? 0,
                    description: (i.product_name || '').trim(),
                    commission_pct: snap.commission_pct,
                    profit_pct: snap.profit_pct,
                    tax_breakdown: snap.tax_breakdown,
                }
            })
            const allItems = [...catalogItems, ...serviceItems, ...manualItems]
            if (allItems.length > 0) {
                await supabase.from('sale_items').insert(allItems)
            }

            // 3) Descontar estoque (apenas itens do catálogo)
            for (const item of saleItems.filter(i => i.product_id)) {
                const { data: ps } = await supabase
                    .from('stock')
                    .select('id, quantity_current')
                    .eq('product_id', item.product_id)
                    .eq('stock_type', 'PRODUCT')
                    .single()

                if (ps) {
                    const newQty = Math.max(0, (ps.quantity_current || 0) - item.quantity)
                    await supabase.from('stock').update({ quantity_current: newQty, updated_at: new Date().toISOString() }).eq('id', ps.id)
                    await supabase.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', item.product_id)
                    await supabase.from('stock_movements').insert({
                        stock_id: ps.id,
                        delta_quantity: -item.quantity,
                        reason: `Venda no balcão — ${item.product_name}`,
                        created_by: createdBy,
                    })
                }
            }

            // 4) Upload comprovante
            if (receiptFile.length > 0 && receiptFile[0].originFileObj) {
                const file = receiptFile[0].originFileObj
                const uploadPath = await uploadReceipt(file, sale.id, tenantId)
                if (uploadPath) {
                    await (supabase as any).from('sales').update({ receipt_url: uploadPath }).eq('id', sale.id)
                    if (values.customer_id) {
                        await (supabase as any).from('customer_attachments').insert({
                            tenant_id: tenantId,
                            customer_id: values.customer_id,
                            origin_type: 'SALE',
                            origin_id: sale.id,
                            file_path: uploadPath,
                            file_name: file.name,
                            file_size: file.size,
                            mime_type: file.type,
                            description: attachDesc || 'Comprovante de pagamento',
                            created_by: createdBy,
                        })
                    }
                }
            }

            // 5) Lançar no fluxo de caixa — cartão: receita nunca no mês atual (parcelas ou 1x no próximo mês)
            const payLabel = PAYMENT_METHODS.find(p => p.value === values.payment_method)?.label || values.payment_method
            const numInstallments = values.installments || 1
            const now = new Date()
            const curYear = now.getFullYear()
            const curMonth = now.getMonth()
            const saleDesc = `Venda balcão: ${saleItems.map(i => i.product_name).filter(Boolean).join(', ')}`
            const saleDate = values.sale_date ? values.sale_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')

            if (values.payment_method === 'LANCAMENTOS_A_RECEBER') {
                // Lançamentos a Receber: não vai para o caixa — registra em pending_receivables
                const empId = values.employee_id || null
                await (supabase as any).from('pending_receivables').insert({
                    tenant_id: tenantId,
                    customer_id: values.customer_id,
                    employee_id: empId,
                    sale_id: sale.id,
                    amount: saleTotalWithDiscount,
                    description: saleDesc,
                    launch_date: saleDate,
                    origin_type: 'SALE',
                    status: 'PENDING',
                    created_by: createdBy,
                })
            } else if (values.payment_method === 'CHEQUE_PRE_DATADO' || values.payment_method === 'BOLETO') {
                // Cheque pré-datado / Boleto: parcelas com datas e valores customizados pelo usuário
                const validInstallments = customInstallments.filter(r => r.date && r.amount > 0)
                if (validInstallments.length === 0) {
                    messageApi.error('Informe ao menos uma data e valor de recebimento.')
                    setSaving(false)
                    return
                }
                const customEntries = validInstallments.map((r, idx) => ({
                    tenant_id: tenantId,
                    type: 'INCOME',
                    amount: r.amount,
                    due_date: r.date.format('YYYY-MM-DD'),
                    paid_date: null,
                    description: validInstallments.length > 1
                        ? `${saleDesc} — ${payLabel} (${idx + 1}/${validInstallments.length})`
                        : `${saleDesc} — ${payLabel}`,
                    payment_method: values.payment_method,
                    origin_type: 'SALE',
                    origin_id: sale.id,
                    created_by: createdBy,
                }))
                await (supabase as any).from('cash_entries').insert(customEntries)
            } else if (values.payment_method === 'CARTAO_CREDITO') {
                const amountPerInstallment = saleTotalWithDiscount / numInstallments
                const installmentEntries = []
                for (let i = 1; i <= numInstallments; i++) {
                    const dueDate = new Date(curYear, curMonth + i, 1)
                    installmentEntries.push({
                        tenant_id: tenantId,
                        type: 'INCOME',
                        amount: amountPerInstallment,
                        due_date: dayjs(dueDate).format('YYYY-MM-DD'),
                        description: numInstallments > 1
                            ? `${saleDesc} — ${payLabel} (${i}/${numInstallments})`
                            : `${saleDesc} — ${payLabel}`,
                        payment_method: values.payment_method,
                        origin_type: 'SALE',
                        origin_id: sale.id,
                        ...(numInstallments > 1 ? { installment_number: i, installment_total: numInstallments } : {}),
                        created_by: createdBy,
                    })
                }
                await (supabase as any).from('cash_entries').insert(installmentEntries)
            } else if (isSplitPay) {
                // Pagamento parcelado/dividido: parte agora + pending_receivable para o restante
                const amountPaid = Number(values.amount_paid) || saleTotalWithDiscount
                const remaining = Math.max(0, saleTotalWithDiscount - amountPaid)
                const remainingDate = remaining > 0 ? values.remaining_due_date?.format('YYYY-MM-DD') || null : null
                if (amountPaid > 0) {
                    await supabase.from('cash_entries').insert({
                        tenant_id: tenantId,
                        type: 'INCOME',
                        amount: amountPaid,
                        due_date: saleDate,
                        paid_date: saleDate,
                        description: `${saleDesc} — ${payLabel} (pagamento parcial)`,
                        payment_method: values.payment_method,
                        origin_type: 'SALE',
                        origin_id: sale.id,
                        created_by: createdBy,
                    })
                }
                if (remaining > 0) {
                    await (supabase as any).from('pending_receivables').insert({
                        tenant_id: tenantId,
                        customer_id: values.customer_id || null,
                        employee_id: values.employee_id || null,
                        sale_id: sale.id,
                        amount: saleTotalWithDiscount,
                        amount_paid: amountPaid,
                        amount_remaining: remaining,
                        due_date: remainingDate,
                        description: `${saleDesc} — ${payLabel} | Pago: R$ ${amountPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Restante: R$ ${remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        launch_date: saleDate,
                        origin_type: 'SALE',
                        status: 'PENDING',
                        created_by: createdBy,
                    })
                }
            } else {
                await supabase.from('cash_entries').insert({
                    tenant_id: tenantId,
                    type: 'INCOME',
                    amount: saleTotalWithDiscount,
                    due_date: saleDate,
                    paid_date: saleDate,
                    description: `${saleDesc} — ${payLabel}${numInstallments > 1 ? ` (${numInstallments}x)` : ''}`,
                    payment_method: values.payment_method,
                    origin_type: 'SALE',
                    origin_id: sale.id,
                    created_by: createdBy,
                })
            }

            // 6) Criar registros de recorrência para produtos/serviços com recurrence_days
            for (const item of saleItems) {
                let recDays = 0
                let recType: 'PRODUCT' | 'SERVICE' = 'PRODUCT'

                if (item.product_id && !item.is_manual && !item.is_service) {
                    const prod = products.find((p: any) => p.id === item.product_id)
                    recDays = prod?.recurrence_days || 0
                    recType = 'PRODUCT'
                } else if (item.is_service && item.service_id) {
                    const svc = services.find((s: any) => s.id === item.service_id)
                    recDays = svc?.recurrence_days || 0
                    recType = 'SERVICE'
                }

                if (recDays > 0 && values.customer_id) {
                    const saleDate = values.sale_date ? values.sale_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
                    const dispatchDate = dayjs(saleDate).add(recDays, 'day').format('YYYY-MM-DD')

                    const recInsertData: Record<string, any> = {
                        tenant_id: tenantId,
                        product_id: recType === 'PRODUCT' ? item.product_id : null,
                        service_id: recType === 'SERVICE' ? item.service_id : null,
                        customer_id: values.customer_id,
                        sale_id: sale.id,
                        sale_date: saleDate,
                        dispatch_date: dispatchDate,
                        recurrence_days: recDays,
                        amount: item.unit_price * item.quantity,
                        type: recType,
                        created_by: createdBy,
                    }
                    const sbrec = supabase as any
                    const { data: recRecord } = await sbrec.from('recurrence_records').insert(recInsertData).select('id').single()

                    if (recRecord) {
                        // Try to set employee_id on recurrence_records (column may not exist)
                        if (values.employee_id) {
                            const { error: recEmpErr } = await sbrec.from('recurrence_records').update({ employee_id: values.employee_id }).eq('id', recRecord.id)
                            if (recEmpErr) console.warn('employee_id column may not exist on recurrence_records:', recEmpErr.message)
                        }
                        await sbrec.from('recurrence_dispatch_queue').insert({
                            tenant_id: tenantId,
                            recurrence_record_id: recRecord.id,
                            scheduled_at: `${dispatchDate}T12:00:00-03:00`,
                            user_id: createdBy,
                        })
                    }
                }
            }

            // 7) Customer-level recurrence — any sale resets/creates a dispatch based on customer.recurrence_days
            if (values.customer_id) {
                await syncCustomerRecurrenceOnSale({
                    supabase,
                    tenantId,
                    customerId: values.customer_id,
                    saleId: sale.id,
                    saleDate: values.sale_date ? values.sale_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                    userId: createdBy,
                })
            }

            messageApi.success('Venda registrada! Estoque atualizado e receita lançada no caixa.')
            await fetchData()
            setDrawerOpen(false)
            form.resetFields()
            setSaleItems([])
            setGlobalDiscountPercentV(0)
            setReceiptFile([])
            setAttachDesc('')
            setIsSplitPay(false)
        } catch (error: any) {
            messageApi.error('Erro: ' + (error.message || 'Preencha os campos.'))
        } finally {
            setSaving(false)
        }
    }

    const [receiptSignedUrl, setReceiptSignedUrl] = useState<string | null>(null)

    const handleViewDetail = async (record: SaleRow) => {
        setSelectedSale(record)
        setReceiptSignedUrl(null)
        const { data: items } = await supabase
            .from('sale_items')
            .select('*, products(name, code), services(name)')
            .eq('sale_id', record.id)
        if (items && items.length > 0) {
            setDetailItems(items)
        } else if (record.saleType === 'FROM_BUDGET' && record.budget_id) {
            // Fallback: buscar budget_items para vendas antigas que não têm sale_items
            const { data: bItems } = await (supabase as any)
                .from('budget_items')
                .select('*, products(name, code), services(name)')
                .eq('budget_id', record.budget_id)
            setDetailItems((bItems || []).map((bi: any) => ({
                ...bi,
                unit_price: bi.unit_price,
                quantity: bi.quantity,
                discount: bi.discount || 0,
            })))
        } else {
            setDetailItems([])
        }
        if (record.receiptUrl) {
            const url = await getReceiptUrl(record.receiptUrl)
            setReceiptSignedUrl(url)
        }
        setDetailDrawerOpen(true)
    }

    // ── Delete ──
    const handleDelete = async (id: string) => {
        try {
            const res = await fetch('/api/delete/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            const result = await res.json()
            if (res.status === 409) {
                modalApi.warning({
                    title: 'Não é possível cancelar',
                    content: result.error || 'Esta venda já recebeu pagamento.',
                })
                return
            }
            if (!res.ok) throw new Error(result.error || 'Erro ao cancelar')
            const aff = result.affected || {}
            const parts = ['Venda cancelada.']
            if (aff.cash_entries > 0) parts.push(`${aff.cash_entries} lançamento(s) de caixa estornado(s).`)
            if (aff.stock_reversed > 0) parts.push(`Estoque reposto em ${aff.stock_reversed} produto(s).`)
            if (aff.pending_receivables > 0) parts.push(`${aff.pending_receivables} parcela(s) pendente(s) cancelada(s).`)
            if (aff.order_reopened) parts.push('Pedido vinculado reaberto.')
            messageApi.success(parts.join(' '))
            await fetchData()
        } catch (error: any) {
            messageApi.error(error.message || 'Erro ao cancelar venda')
        }
    }

    // Pré-busca impactos e abre modal contextual antes de cancelar
    const confirmCancelSale = async (record: SaleRow) => {
        console.log('[Cancelar venda] click', record?.id)
        try {
            const [prRes, ceRes] = await Promise.all([
                (supabase as any)
                    .from('pending_receivables')
                    .select('id, status, amount')
                    .eq('sale_id', record.id)
                    .eq('is_active', true),
                (supabase as any)
                    .from('cash_entries')
                    .select('id, amount')
                    .eq('origin_type', 'SALE')
                    .eq('origin_id', record.id)
                    .eq('is_active', true),
            ])
            const prList = (prRes.data || []) as any[]
            const ceList = (ceRes.data || []) as any[]
            const hasPaid = prList.some((p) => p.status === 'PAID')
            if (hasPaid) {
                modalApi.warning({
                    title: 'Não é possível cancelar',
                    content: 'Esta venda possui parcelas já recebidas. Cancele os recebimentos manualmente em Lançamentos a Receber antes de cancelar a venda.',
                })
                return
            }
            const cascadeMsg: string[] = []
            if (ceList.length > 0) cascadeMsg.push(`${ceList.length} lançamento(s) de caixa será(ão) estornado(s).`)
            if (prList.length > 0) cascadeMsg.push(`${prList.length} parcela(s) pendente(s) será(ão) cancelada(s).`)
            cascadeMsg.push('Estoque dos produtos da venda será reposto.')
            if (record.saleType === 'FROM_ORDER') cascadeMsg.push('Pedido vinculado será reaberto para edição.')
            else if (record.saleType === 'FROM_BUDGET') cascadeMsg.push('Orçamento vinculado voltará a estar disponível para finalização.')
            modalApi.confirm({
                title: 'Cancelar venda?',
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
                okText: 'Sim, cancelar venda',
                cancelText: 'Voltar',
                okButtonProps: { danger: true },
                width: 480,
                onOk: () => handleDelete(record.id),
            })
        } catch (e: any) {
            messageApi.error('Erro ao verificar impactos: ' + (e?.message || ''))
        }
    }

    // ── Export functions ──
    const handleExportExcel = async (startDate?: string, endDate?: string) => {
        try {
        const filtered = startDate && endDate
            ? sales.filter(s => {
                const d = new Date(s.saleDate)
                return d >= new Date(startDate) && d <= new Date(endDate)
            })
            : sales
        if (!filtered.length) { messageApi.warning('Nenhuma venda no período selecionado.'); return }

        // Compute KPIs (mirror panel cards)
        const totalValue = filtered.reduce((s, r) => s + r.finalValue, 0)
        const avgTicketValue = filtered.length > 0 ? totalValue / filtered.length : 0
        const fromBudgetCount = filtered.filter(s => s.saleType === 'FROM_BUDGET').length

        const { Workbook } = await import('exceljs')
        const wb = new Workbook()
        const ws = wb.addWorksheet('Vendas', { views: [{ state: 'frozen', xSplit: 0, ySplit: 7 }] })
        const colCount = 7

        ws.columns = [
            { width: 16 }, { width: 30 }, { width: 24 }, { width: 18 },
            { width: 22 }, { width: 22 }, { width: 14 },
        ]

        // Title row
        const titleRow = ws.addRow(['Relatório de Vendas'])
        titleRow.height = 30
        ws.mergeCells(1, 1, 1, colCount)
        const titleCell = titleRow.getCell(1)
        titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

        // Subtitle
        const subtitleText = startDate && endDate
            ? `Período: ${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`
            : 'Todas as vendas'
        const subtitleRow = ws.addRow([subtitleText])
        subtitleRow.height = 22
        ws.mergeCells(2, 1, 2, colCount)
        const subCell = subtitleRow.getCell(1)
        subCell.font = { name: 'Calibri', size: 11, italic: true }
        subCell.alignment = { horizontal: 'center', vertical: 'middle' }
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }

        // KPI block (rows 3-4)
        const kpis: Array<{ label: string; value: number | string; isCurrency: boolean }> = [
            { label: '🛒 Vendas no Período', value: filtered.length, isCurrency: false },
            { label: '💰 Receita Total', value: totalValue, isCurrency: true },
            { label: '📈 Ticket Médio', value: avgTicketValue, isCurrency: true },
            { label: '📄 Via Orçamento', value: fromBudgetCount, isCurrency: false },
        ]
        const kpiLabelRow = ws.addRow([])
        const kpiValueRow = ws.addRow([])
        kpiLabelRow.height = 18
        kpiValueRow.height = 24
        const cardSpan = Math.floor(colCount / kpis.length)
        const remainder = colCount - cardSpan * kpis.length
        let colStart = 1
        kpis.forEach((kpi, idx) => {
            const span = cardSpan + (idx < remainder ? 1 : 0)
            const colEnd = colStart + span - 1
            ws.mergeCells(3, colStart, 3, colEnd)
            ws.mergeCells(4, colStart, 4, colEnd)
            const lc = kpiLabelRow.getCell(colStart)
            lc.value = kpi.label
            lc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFA5B4FC' } }
            lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } }
            lc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
            const vc = kpiValueRow.getCell(colStart)
            vc.value = kpi.value
            if (kpi.isCurrency) vc.numFmt = '"R$" #,##0.00'
            vc.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFE0E7FF' } }
            vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } }
            vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
            for (let c = colStart; c <= colEnd; c++) {
                kpiLabelRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } }
                kpiValueRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } }
            }
            colStart = colEnd + 1
        })

        // Blank
        ws.addRow([])

        // Header
        const headerRow = ws.addRow(['Código', 'Cliente', 'Vendedor', 'Valor', 'Pagamento', 'Status', 'Data'])
        headerRow.height = 24
        for (let c = 1; c <= colCount; c++) {
            const cell = headerRow.getCell(c)
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
            cell.alignment = {
                horizontal: c === 4 ? 'right' : c === 1 ? 'center' : 'left',
                vertical: 'middle',
            }
        }

        // Data rows
        filtered.forEach((r, idx) => {
            const pm = PAYMENT_METHODS.find(p => p.value === r.paymentMethod)
            const statusLabel = r.status === 'AWAITING_PAYMENT' && r.saleType === 'FROM_ORDER'
                ? '⏳ Aguardando pagamento'
                : '✅ Concluído'
            const paymentLabel = `${pm?.label || r.paymentMethod}${r.installments > 1 ? ` (${r.installments}x)` : ''}`
            const sellerLabel = (r.sellerName && r.sellerName !== '-') ? r.sellerName : 'Sem vendedor'
            const customerLabel = (r.customerName && r.customerName !== '-') ? r.customerName : 'Sem cliente'
            const row = ws.addRow([
                r.sale_code || '—',
                customerLabel,
                sellerLabel,
                r.finalValue,
                paymentLabel,
                statusLabel,
                r.saleDate ? new Date(r.saleDate).toLocaleDateString('pt-BR') : '—',
            ])
            row.height = 20
            const isEven = idx % 2 === 0
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.font = { name: 'Calibri', size: 11 }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF3F0FF' : 'FFFFFFFF' } }
                if (c === 4) {
                    cell.numFmt = '#,##0.00'
                    cell.alignment = { horizontal: 'right', vertical: 'middle' }
                } else if (c === 1) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' }
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' }
                }
            }
        })

        // Total row
        const totalRow = ws.addRow(['TOTAL', '', '', totalValue, '', '', ''])
        totalRow.height = 24
        for (let c = 1; c <= colCount; c++) {
            const cell = totalRow.getCell(c)
            cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B21B6' } }
            if (c === 4) {
                cell.numFmt = '#,##0.00'
                cell.alignment = { horizontal: 'right', vertical: 'middle' }
            } else if (c === 1) {
                cell.alignment = { horizontal: 'left', vertical: 'middle' }
            }
        }

        const buf = await wb.xlsx.writeBuffer()
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'vendas.xlsx'; a.click()
        URL.revokeObjectURL(url)
        } catch (err: any) {
            console.error('Erro ao exportar Excel Vendas', err)
            messageApi.error('Erro ao exportar Excel: ' + (err?.message || 'Erro desconhecido'))
        }
    }

    const handleExportPdf = async (startDate?: string, endDate?: string) => {
        try {
        const filtered = startDate && endDate
            ? sales.filter(s => {
                const d = new Date(s.saleDate)
                return d >= new Date(startDate) && d <= new Date(endDate)
            })
            : sales
        if (!filtered.length) { messageApi.warning('Nenhuma venda no período selecionado.'); return }

        // KPIs
        const totalValue = filtered.reduce((s, r) => s + r.finalValue, 0)
        const avgTicketValue = filtered.length > 0 ? totalValue / filtered.length : 0
        const fromBudgetCount = filtered.filter(s => s.saleType === 'FROM_BUDGET').length

        const rows = filtered.map(r => {
            const pm = PAYMENT_METHODS.find(p => p.value === r.paymentMethod)
            const statusLabel = r.status === 'AWAITING_PAYMENT' && r.saleType === 'FROM_ORDER'
                ? 'Aguardando pagamento'
                : 'Concluído'
            const sellerLabel = (r.sellerName && r.sellerName !== '-') ? r.sellerName : 'Sem vendedor'
            const customerLabel = (r.customerName && r.customerName !== '-') ? r.customerName : 'Sem cliente'
            return [
                r.sale_code || '—',
                customerLabel,
                sellerLabel,
                formatCurrency(r.finalValue),
                `${pm?.label || r.paymentMethod}${r.installments > 1 ? ` (${r.installments}x)` : ''}`,
                statusLabel,
                r.saleDate ? new Date(r.saleDate).toLocaleDateString('pt-BR') : '—',
            ]
        })
        // Append TOTAL row
        rows.push(['TOTAL', '', '', formatCurrency(totalValue), '', '', ''])

        const { exportTableToPdf } = await import('@/utils/export-generic-pdf')
        exportTableToPdf({
            title: 'Relatório de Vendas',
            subtitle: startDate && endDate
                ? `Período: ${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`
                : 'Todas as vendas',
            headers: ['Código', 'Cliente', 'Vendedor', 'Valor', 'Pagamento', 'Status', 'Data'],
            rows,
            filename: 'vendas.pdf',
            kpis: [
                { label: 'Vendas no Período', value: String(filtered.length) },
                { label: 'Receita Total', value: formatCurrency(totalValue) },
                { label: 'Ticket Médio', value: formatCurrency(avgTicketValue) },
                { label: 'Via Orçamento', value: String(fromBudgetCount) },
            ],
            highlightLastRow: true,
        })
        } catch (err: any) {
            console.error('Erro ao exportar PDF Vendas', err)
            messageApi.error('Erro ao exportar PDF: ' + (err?.message || 'Erro desconhecido'))
        }
    }

    const columns: ColumnsType<SaleRow> = [
        {
            title: 'Código',
            key: 'sale_code',
            width: 120,
            render: (_, record) => (
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#7A5AF8', fontWeight: 600 }}>
                    {record.sale_code || '—'}
                </span>
            ),
        },
        {
            title: 'Cliente',
            dataIndex: 'customerName',
            key: 'customerName',
        },
        {
            title: 'Vendedor',
            dataIndex: 'sellerName',
            key: 'sellerName',
            render: (text: string) => text && text !== '-' ? text : <span style={{ color: '#94a3b8' }}>Sem vendedor</span>,
        },
        {
            title: 'Valor',
            dataIndex: 'finalValue',
            key: 'finalValue',
            align: 'right',
            sorter: (a, b) => a.finalValue - b.finalValue,
            render: (v) => <strong style={{ color: '#12B76A' }}>{formatCurrency(v)}</strong>,
        },
        {
            title: 'Pagamento',
            key: 'payment',
            render: (_, r) => {
                const pm = PAYMENT_METHODS.find(p => p.value === r.paymentMethod)
                return (
                    <div>
                        <Tag>{pm?.label || r.paymentMethod}</Tag>
                        {r.installments > 1 && <Tag color="blue">{r.installments}x</Tag>}
                    </div>
                )
            },
        },
        {
            title: 'Status',
            key: 'status',
            width: 200,
            render: (_, r) => {
                const statusTag = (r.status === 'AWAITING_PAYMENT' && r.saleType === 'FROM_ORDER')
                    ? <Tag color="orange">⏳ Aguardando pagamento</Tag>
                    : <Tag color="green">✅ Concluído</Tag>
                return (
                    <span>
                        {statusTag}
                        {/* MRM S2.3 — badge "Requer revisão" (caso edge: tenant permissive ou venda legada) */}
                        {r.requiresReview && <RequiresReviewBadge />}
                    </span>
                )
            },
        },
        {
            title: 'Data',
            dataIndex: 'saleDate',
            key: 'saleDate',
            width: 100,
            sorter: (a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime(),
            defaultSortOrder: 'descend',
            render: (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-',
        },
        {
            title: 'Ações',
            key: 'action',
            width: 160,
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Button type="link" size="small" onClick={() => handleViewDetail(record)}>Ver</Button>
                    {record.status === 'AWAITING_PAYMENT' && record.saleType === 'FROM_ORDER' && (
                        <Button
                            type="link"
                            size="small"
                            style={{ color: '#12B76A' }}
                            onClick={() => handleOpenOrderPaymentModal(record)}
                        >
                            Lançar pagamento
                        </Button>
                    )}
                    <Button type="link" size="small" danger onClick={() => confirmCancelSale(record)}>
                        Cancelar
                    </Button>
                </Space>
            ),
        },
    ]

    const itemColumns: ColumnsType<SaleItemRow> = [
        {
            title: 'Produto / Serviço',
            key: 'product',
            render: (_, r) => {
                const rowProds = r.commission_table_id
                    ? products.filter((p: any) => p.commission_table_id === r.commission_table_id)
                    : products
                const rowSvcs = r.commission_table_id
                    ? services.filter((s: any) => s.commission_table_id === r.commission_table_id)
                    : services
                return r.is_manual ? (
                    <Input
                        placeholder="Nome do item (ex: Serviço, Produto avulso)"
                        value={r.product_name}
                        onChange={(e) => handleManualItemNameChange(r.key, e.target.value)}
                        style={{ width: '100%' }}
                    />
                ) : r.is_service ? (
                    <Select placeholder="Selecione o serviço" showSearch optionFilterProp="children" style={{ width: '100%' }}
                        value={r.service_id || undefined} onChange={(v) => handleServiceSelect(r.key, v)}>
                        {rowSvcs.map((s: any) => (
                            <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
                        ))}
                    </Select>
                ) : (
                    <Select placeholder="Selecione o produto" showSearch optionFilterProp="children" style={{ width: '100%' }}
                        value={r.product_id || undefined} onChange={(v) => handleProductSelect(r.key, v)}>
                        {rowProds.map((p: any) => (
                            <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                        ))}
                    </Select>
                )
            },
        },
        {
            title: 'Qtd', key: 'qty', width: 80,
            render: (_, r) => <InputNumber min={1} value={r.quantity} onChange={(v) => handleItemChange(r.key, 'quantity', v || 1)} style={{ width: '100%' }} />,
        },
        {
            title: 'Preço', key: 'price', width: 170,
            render: (_, r) => (
                <CurrencyInput
                    min={0}
                    value={r.unit_price}
                    onChange={(v) => handleItemChange(r.key, 'unit_price', v)}
                    style={{ width: '100%' }}
                />
            ),
        },
        {
            title: 'Total', key: 'total', width: 140,
            render: (_, r) => <strong>{formatCurrency(r.total)}</strong>,
        },
        {
            title: '', key: 'del', width: 40,
            render: (_, r) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setSaleItems(prev => prev.filter(i => i.key !== r.key))} size="small" />,
        },
    ]

    return (
        <Layout title={PAGE_TITLES.SALES} subtitle="Histórico de vendas — balcão e orçamentos finalizados">
            {contextHolder}

            <div className="kpi-grid">
                <CardKPI title="Vendas no Mês" value={monthSales.length} icon={<ShoppingCartOutlined />} variant="blue" />
                <CardKPI title="Receita no Mês" value={formatCurrency(totalRevenue)} icon={<DollarOutlined />} variant="green" />
                <CardKPI title="Ticket Médio" value={formatCurrency(avgTicket)} icon={<RiseOutlined />} variant="orange" />
                <CardKPI title="Via Orçamento" value={fromBudget} icon={<FileTextOutlined />} variant="blue" />
            </div>

            {pendingBudgets.length > 0 && (
                <div className="pc-card" style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                        <FileTextOutlined style={{ marginRight: 8 }} />
                        Orçamentos para lançar ({pendingBudgets.length})
                    </div>
                    {isMobile ? (
                        <div className="pc-row-compact-list">
                            {pendingBudgets.map((r: PendingBudget) => {
                                const statusLabel = r.status === 'APPROVED' ? 'Aprovado'
                                    : r.status === 'AWAITING_PAYMENT' ? 'Aguardando pagamento'
                                    : 'Enviado'
                                const codigo = `ORC-${r.id.substring(0, 4).toUpperCase()}`
                                const dataFmt = new Date(r.created_at).toLocaleDateString('pt-BR')
                                const cancelToDraft = async () => {
                                    const { error } = await supabase.from('budgets').update({ status: 'DRAFT', updated_at: new Date().toISOString() }).eq('id', r.id)
                                    if (error) messageApi.error('Erro ao cancelar.')
                                    else { messageApi.success('Orçamento voltou para rascunho.'); await fetchPendingBudgets() }
                                }
                                return (
                                    <React.Fragment key={r.id}>
                                        <div className="pc-row-compact pc-row-compact--has-actions" onClick={() => handleOpenRegisterSale(r)}>
                                            <div className="pc-row-compact__main">
                                                <span className="pc-row-compact__title">{r.customer_name || 'Sem cliente'}</span>
                                                <span className="pc-row-compact__sub">{codigo} · {dataFmt} · {statusLabel}</span>
                                            </div>
                                            <span className="pc-row-compact__value">{formatCurrency(r.total_value)}</span>
                                        </div>
                                        <div className="pc-row-compact__actions" onClick={(e) => e.stopPropagation()}>
                                            <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); handleOpenRegisterSale(r) }}>Lançar recebimento</Button>
                                            <Popconfirm
                                                title="Voltar orçamento para rascunho? Ele sairá da lista de pendentes e poderá ser editado em Orçamentos."
                                                onConfirm={cancelToDraft}
                                            >
                                                <Button size="small" danger onClick={(e) => e.stopPropagation()}>Cancelar</Button>
                                            </Popconfirm>
                                        </div>
                                    </React.Fragment>
                                )
                            })}
                        </div>
                    ) : (
                    <Table
                        dataSource={pendingBudgets}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        columns={[
                            { title: 'Cliente', dataIndex: 'customer_name', key: 'customer' },
                            { title: 'Valor', key: 'value', render: (_, r) => <strong style={{ color: '#12B76A' }}>{formatCurrency(r.total_value)}</strong> },
                            {
                                title: 'Status',
                                dataIndex: 'status',
                                key: 'status',
                                render: (s: string) => {
                                    if (s === 'APPROVED') return <Tag color="green">Aprovado</Tag>
                                    if (s === 'AWAITING_PAYMENT') return <Tag color="orange">Aguardando pagamento</Tag>
                                    return <Tag color="blue">Enviado</Tag>
                                },
                            },
                            { title: 'Data', key: 'date', render: (_, r) => new Date(r.created_at).toLocaleDateString('pt-BR') },
                            {
                                title: 'Ações',
                                key: 'action',
                                render: (_, r) => (
                                    <Space size="small">
                                        <Button type="primary" size="small" onClick={() => handleOpenRegisterSale(r)}>Lançar recebimento</Button>
                                        <Popconfirm
                                            title="Voltar orçamento para rascunho? Ele sairá da lista de pendentes e poderá ser editado em Orçamentos."
                                            onConfirm={async () => {
                                                const { error } = await supabase.from('budgets').update({ status: 'DRAFT', updated_at: new Date().toISOString() }).eq('id', r.id)
                                                if (error) messageApi.error('Erro ao cancelar.')
                                                else { messageApi.success('Orçamento voltou para rascunho.'); await fetchPendingBudgets() }
                                            }}
                                        >
                                            <Button type="link" size="small" danger>Cancelar</Button>
                                        </Popconfirm>
                                    </Space>
                                ),
                            },
                        ]}
                    />
                    )}
                </div>
            )}

            <div className="pc-card--table">
                <div className="filter-bar">
                    <Input
                        placeholder="Buscar por produto, cliente, vendedor..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ maxWidth: 320 }}
                        allowClear
                    />
                    <DatePicker.RangePicker
                        format="DD/MM/YYYY"
                        placeholder={['Data início', 'Data fim']}
                        value={dateRange}
                        onChange={(vals) => setDateRange(vals ? [vals[0], vals[1]] : [null, null])}
                        allowClear
                        style={{ minWidth: 240 }}
                    />
                    <div style={{ flex: 1 }} />
                    <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)}>
                        Exportar
                    </Button>
                    <Button type="primary" icon={<ShopOutlined />} onClick={() => { form.resetFields(); setSaleItems([]); setDrawerOpen(true) }}>
                        Venda no Balcão
                    </Button>
                </div>

                {isMobile ? (
                    <div className="pc-row-compact-list">
                        {loading && (
                            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Carregando vendas…</div>
                        )}
                        {!loading && filteredSales.length === 0 && (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma venda registrada." style={{ padding: '24px 0' }} />
                        )}
                        {!loading && filteredSales.map((r: SaleRow) => {
                            const dateLabel = r.saleDate ? new Date(r.saleDate).toLocaleDateString('pt-BR') : '—'
                            const isAwaitingOrder = r.status === 'AWAITING_PAYMENT' && r.saleType === 'FROM_ORDER'
                            const statusLabel = isAwaitingOrder ? 'Aguardando pagamento' : 'Concluído'
                            const codigo = r.sale_code || '—'
                            // Kebab: Ver (ações de transição vão na faixa inferior — DM1)
                            const kebabItems: any[] = [
                                { key: 'view', label: 'Ver', onClick: () => handleViewDetail(r) },
                            ]
                            return (
                                <React.Fragment key={r.id}>
                                    <div className="pc-row-compact pc-row-compact--has-actions" onClick={() => handleViewDetail(r)}>
                                        <div className="pc-row-compact__main">
                                            <span className="pc-row-compact__title">{r.customerName || 'Sem cliente'}</span>
                                            <span className="pc-row-compact__sub">{codigo} · {dateLabel} · {statusLabel}</span>
                                        </div>
                                        <span className="pc-row-compact__value pc-row-compact__value--in">{formatCurrency(r.finalValue)}</span>
                                        <Dropdown menu={{ items: kebabItems }} trigger={['click']} placement="bottomRight">
                                            <span className="pc-row-compact__kebab" onClick={(e) => e.stopPropagation()}><MoreOutlined /></span>
                                        </Dropdown>
                                    </div>
                                    <div className="pc-row-compact__actions" onClick={(e) => e.stopPropagation()}>
                                        {isAwaitingOrder && (
                                            <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); handleOpenOrderPaymentModal(r) }}>Lançar pagamento</Button>
                                        )}
                                        <Button size="small" danger onClick={(e) => { e.stopPropagation(); confirmCancelSale(r) }}>Cancelar</Button>
                                    </div>
                                </React.Fragment>
                            )
                        })}
                    </div>
                ) : (
                <Table columns={columns} dataSource={filteredSales} rowKey="id"
                    pagination={{ pageSize: PAGE_SIZE, showTotal: (t) => `${t} vendas` }}
                    size="middle" loading={loading}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma venda registrada. Vendas de orçamentos finalizados e vendas no balcão aparecem aqui." /> }}
                />
                )}
            </div>

            {/* ── Drawer: Venda no Balcão ── */}
            <Drawer
                title="🏪 Venda no Balcão"
                width={680}
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); form.resetFields(); setSaleItems([]); setEmpProductTablesV([]); setEmpServiceTablesV([]); setTableSectionsV([{key: 'ts-0', tableId: null}]); setReceiptFile([]); setAttachDesc(''); setIsSplitPay(false); setCustomInstallments([{ date: null, amount: 0 }]); setInstallmentPreset('customizado') }}
                extra={<Space><Button onClick={() => { setDrawerOpen(false); form.resetFields(); setSaleItems([]); setEmpProductTablesV([]); setEmpServiceTablesV([]); setTableSectionsV([{key: 'ts-0', tableId: null}]); setReceiptFile([]); setAttachDesc(''); setIsSplitPay(false); setCustomInstallments([{ date: null, amount: 0 }]); setInstallmentPreset('customizado') }}>Cancelar</Button><Button onClick={handleSaveSale} type="primary" loading={saving || (mrmConfig.enabled && !motorReady)} disabled={mrmConfig.enabled && !motorReady} title={mrmConfig.enabled && !motorReady ? 'Carregando contexto fiscal...' : ''}>Registrar Venda</Button></Space>}
            >
                <Form form={form} layout="vertical">
                    <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>Vendedor</Divider>

                    <Form.Item name="employee_id" label="Vendedor" rules={[{ required: true, message: 'Selecione o vendedor' }]}>
                        <Select placeholder="Selecione o vendedor" showSearch optionFilterProp="children">
                            {employees.map((e: any) => (<Select.Option key={e.id} value={e.id}>{e.name}</Select.Option>))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="customer_id" label="Cliente (opcional)">
                        <Select placeholder="Selecione o cliente" showSearch optionFilterProp="children" allowClear>
                            {customers.map(c => (<Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>))}
                        </Select>
                    </Form.Item>

                    {/* ICMS Complementar — hierarquia de ativação (documento oficial 2026-06-10).
                        Parâmetros de OPERAÇÃO: o motor decide sozinho na Etapa 17 (destinatário
                        contribuinte? · frete CIF/FOB · ST/DIFAL ativos). Avançado/raro → recolhido. */}
                    <details style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(148, 163, 184, 0.06)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 8 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#cbd5e1', fontSize: 13 }}>
                            🧾 Alíquotas tributárias adicionais (avançado)
                        </summary>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, marginBottom: 12 }}>
                            <strong>Padrão nativo:</strong> frete <strong>FOB</strong> (fora da base — não entra no cálculo)
                            e ICMS Complementar <strong>isento</strong> (não cobrado). Para incluir o frete na base
                            (CIF) ou deixar o sistema avaliar automaticamente a hierarquia do ICMS Complementar
                            (LC 87/96, art. 13, §1º, II — destinatário contribuinte? · frete CIF/FOB · ST/DIFAL
                            ativos), ative manualmente as opções abaixo.
                        </div>
                        <Form.Item name="freight_mode" label="Modalidade de frete" initialValue="FOB" style={{ marginBottom: 12 }}>
                            <Segmented
                                options={[
                                    { label: 'CIF (frete na base)', value: 'CIF' },
                                    { label: 'FOB (frete fora)', value: 'FOB' },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item name="icms_compl_override" label="ICMS Complementar" initialValue="FORCE_OFF" style={{ marginBottom: 0 }}>
                            <Segmented
                                options={[
                                    { label: 'Automático (hierarquia decide)', value: 'AUTO' },
                                    { label: 'Forçar isenção (não cobrar)', value: 'FORCE_OFF' },
                                ]}
                            />
                        </Form.Item>
                    </details>

                    {selectedEmployeeIdV && employeeHasNoTablesV && (
                        <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#fdba74' }}>
                            Este funcionário não possui tabelas de comissão vinculadas. Apenas lançamento manual está disponível.
                        </div>
                    )}
                    {selectedEmployeeIdV && allEmpTablesV.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            {tableSectionsV.map((section, idx) => {
                                const table = allEmpTablesV.find(t => t.id === section.tableId)
                                const isProduct = (table as any)?.type === 'PRODUCT'
                                const isService = (table as any)?.type === 'SERVICE'
                                const availableForSection = allEmpTablesV.filter(t =>
                                    t.id === section.tableId || !usedTableIdsV.includes(t.id)
                                )
                                const sectionItems = saleItems.filter(i => i.commission_table_id === section.tableId)
                                return (
                                    <div key={section.key} style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: section.tableId ? 8 : 0 }}>
                                            <Select
                                                style={{ flex: 1 }}
                                                placeholder="Selecionar tabela..."
                                                value={section.tableId || undefined}
                                                onChange={(val) => {
                                                    setSaleItems(prev => prev.filter(i => i.commission_table_id !== section.tableId))
                                                    setTableSectionsV(prev => prev.map(s => s.key === section.key ? { ...s, tableId: val } : s))
                                                }}
                                                options={availableForSection.map((t: any) => ({
                                                    value: t.id,
                                                    label: `${t.name} — ${t.type === 'PRODUCT' ? 'Produto' : 'Serviço'}`,
                                                }))}
                                            />
                                            {idx > 0 && (
                                                <Button size="small" danger icon={<DeleteOutlined />}
                                                    onClick={() => {
                                                        setSaleItems(prev => prev.filter(i => i.commission_table_id !== section.tableId))
                                                        setTableSectionsV(prev => prev.filter(s => s.key !== section.key))
                                                    }}
                                                />
                                            )}
                                        </div>
                                        {section.tableId && (
                                            <>
                                                <Table columns={itemColumns} dataSource={sectionItems} rowKey="key" pagination={false} size="small"
                                                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhum item adicionado desta tabela" /> }}
                                                    style={{ marginBottom: 8 }}
                                                />
                                                <Space style={{ marginTop: 4 }}>
                                                    {isProduct && (
                                                        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => handleAddProduct(section.tableId!)}>
                                                            Adicionar Produto
                                                        </Button>
                                                    )}
                                                    {isService && (
                                                        <Button size="small" type="dashed" icon={<ToolOutlined />} onClick={() => handleAddService(section.tableId!)}>
                                                            Adicionar Serviço
                                                        </Button>
                                                    )}
                                                </Space>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                            {usedTableIdsV.filter(Boolean).length < allEmpTablesV.length && (
                                <Button type="dashed" icon={<PlusOutlined />} style={{ width: '100%', marginBottom: 8 }}
                                    onClick={() => setTableSectionsV(prev => [...prev, {key: `ts-${Date.now()}`, tableId: null}])}>
                                    + Adicionar outra tabela
                                </Button>
                            )}
                        </div>
                    )}

                    {saleItems.filter(i => i.is_manual).length > 0 || !selectedEmployeeIdV || allEmpTablesV.length === 0 ? (
                        <div style={{ marginBottom: 8 }}>
                            <Table columns={itemColumns} dataSource={saleItems.filter(i => i.is_manual)} rowKey="key" pagination={false} size="small"
                                locale={{ emptyText: null }}
                                style={{ display: saleItems.filter(i => i.is_manual).length > 0 ? undefined : 'none' }}
                            />
                        </div>
                    ) : null}

                    <Space.Compact block style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                        <Button type="dashed" onClick={handleAddManualProduct} icon={<PlusOutlined />} style={{ flex: 1 }}
                            disabled={!selectedEmployeeIdV}>
                            Adicionar item manual
                        </Button>
                    </Space.Compact>

                    {/* Resumo da venda (ACIMA do campo de desconto): base, tributos por fora e total a cobrar.
                        Paridade com orçamentos. Sem desconto: total a cobrar = base + tributos. */}
                    <div style={{
                        marginTop: 16, padding: '12px 16px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #86efac', borderRadius: 8,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16 }}>
                            <strong>Total:</strong>
                            <strong style={{ color: '#12B76A', fontSize: 20 }}>{formatCurrency(saleTotal)}</strong>
                        </div>
                        {balcaoTotalPorForaExtraFull > 0 && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                                    <span>+ Tributos por fora (ICMS-ST / DIFAL / FCP / ICMS Compl.)</span>
                                    <span>{formatCurrency(balcaoTotalPorForaExtraFull)}</span>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(34, 197, 94, 0.25)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong style={{ fontSize: 14 }}>Total a cobrar:</strong>
                                    <strong style={{ color: '#4ade80', fontSize: 20 }}>{formatCurrency(balcaoTotalACobrarFull)}</strong>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Desconto Global */}
                    <div style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14, color: '#94a3b8', whiteSpace: 'nowrap' }}>Modo</span>
                                <Select
                                    value={discountModeV}
                                    onChange={(v) => setDiscountModeV(v as DiscountMode)}
                                    style={{ width: 230 }}
                                    options={[
                                        { value: 'PROPORTIONAL', label: 'Proporcional (Comissão + Lucro)' },
                                        { value: 'SELLER_REDUCTION', label: 'Vendedor absorve (Comissão)' },
                                        { value: 'PROFIT_REDUCTION', label: 'Empresa absorve (Lucro)' },
                                    ]}
                                />
                                <span style={{ fontSize: 14, color: '#94a3b8', whiteSpace: 'nowrap' }}>Desconto</span>
                                <Segmented
                                    size="small"
                                    value={discountInputModeV}
                                    onChange={(v) => setDiscountInputModeV(v as 'PERCENT' | 'AMOUNT')}
                                    options={[
                                        { label: '%', value: 'PERCENT' },
                                        { label: 'R$', value: 'AMOUNT' },
                                    ]}
                                />
                                <Tooltip title={maxDiscountPercentV <= 0 ? 'Sem margem disponível para desconto' : ''}>
                                    {discountInputModeV === 'PERCENT' ? (
                                        <InputNumber
                                            // MRM S2.3: âncora pro scroll automático quando policy bloqueia save
                                            data-mrm-discount-field="true"
                                            disabled={maxDiscountPercentV <= 0}
                                            min={0}
                                            max={maxDiscountPercentV > 0 ? maxDiscountPercentV : 100}
                                            step={0.5}
                                            precision={4}
                                            value={globalDiscountPercentV}
                                            onChange={(v) => {
                                                const newDiscount = Math.min(v ?? 0, maxDiscountPercentV > 0 ? maxDiscountPercentV : 100)
                                                setGlobalDiscountPercentV(newDiscount)
                                                if (installmentPreset !== 'customizado') {
                                                    const discountedTotal = saleTotal * (1 - newDiscount / 100)
                                                    const n = customInstallments.length
                                                    const amt = n > 0 && discountedTotal > 0 ? Math.round((discountedTotal / n) * 100) / 100 : 0
                                                    setCustomInstallments(prev => prev.map(inst => ({ ...inst, amount: amt })))
                                                }
                                            }}
                                            formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                            parser={(v) => Number((v || '0').replace(',', '.'))}
                                            addonAfter="%"
                                            style={{ width: 140 }}
                                        />
                                    ) : (
                                        <CurrencyInput
                                            disabled={maxDiscountPercentV <= 0 || balcaoTotalACobrarFull <= 0}
                                            min={0}
                                            max={balcaoTotalACobrarFull > 0 ? balcaoTotalACobrarFull * ((maxDiscountPercentV > 0 ? maxDiscountPercentV : 100) / 100) : 0}
                                            value={Number((balcaoTotalACobrarFull * (globalDiscountPercentV / 100)).toFixed(2))}
                                            onChange={(v) => {
                                                const amount = v || 0
                                                if (balcaoTotalACobrarFull <= 0) { setGlobalDiscountPercentV(0); return }
                                                const pct = (amount / balcaoTotalACobrarFull) * 100
                                                const capped = Math.min(pct, maxDiscountPercentV > 0 ? maxDiscountPercentV : 100)
                                                const finalPct = Number(capped.toFixed(4))
                                                setGlobalDiscountPercentV(finalPct)
                                                if (installmentPreset !== 'customizado') {
                                                    const discountedTotal = saleTotal * (1 - finalPct / 100)
                                                    const n = customInstallments.length
                                                    const amt = n > 0 && discountedTotal > 0 ? Math.round((discountedTotal / n) * 100) / 100 : 0
                                                    setCustomInstallments(prev => prev.map(inst => ({ ...inst, amount: amt })))
                                                }
                                            }}
                                            style={{ width: 180 }}
                                        />
                                    )}
                                </Tooltip>
                            </div>
                            {maxDiscountPercentV > 0 && (<span style={{ fontSize: 12, color: '#64748b' }}>Máx: {maxDiscountPercentV.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% (comissão + lucro)</span>)}
                        </div>
                        {/* MRM R5: orientação quando desconto excede margem (RRO ≤ 0) */}
                        {mrmConfig.enabled && globalDiscountPercentV > 0 && globalDiscountPercentV >= maxDiscountPercentV && maxDiscountPercentV > 0 && (
                            <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(234, 179, 8, 0.10)', border: '1px solid rgba(234, 179, 8, 0.35)', borderRadius: 6 }}>
                                <div style={{ color: '#facc15', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>⚠ Margem residual no limite</div>
                                <div style={{ color: '#fde68a', fontSize: 11 }}>{MRM_ERROR_RRO_NON_POSITIVE}</div>
                            </div>
                        )}
                    </div>
                    {/* ABAIXO do campo de desconto: resultado com desconto. Se houver tributos por fora,
                        mostra o total a cobrar já com o desconto aplicado. Paridade com orçamentos. */}
                    {globalDiscountPercentV > 0 && (
                        <div style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: 14 }}>Total a cobrar:</strong>
                                <strong style={{ color: '#4ade80', fontSize: 20 }}>{formatCurrency(balcaoTotalACobrar)}</strong>
                            </div>
                        </div>
                    )}

                    {/* Distribuição Residual + DRE Consolidada — paridade com orçamentos */}
                    {saleTotal > 0 && (
                        <ResidualDistributionBlock
                            distribution={balcaoResidualDistribution}
                            configWarning={balcaoConfigWarning}
                            regimeGuardActive={balcaoEpicV5DisplayData.regimeGuardActive}
                            discountMode={discountModeV}
                        />
                    )}
                    {saleTotal > 0 && (
                        <ConsolidatedDREBlock
                            dre={balcaoConsolidatedDRE}
                            cascadeTrace={balcaoEpicV5DisplayData.cascadeTrace}
                            pesoOpInterna={balcaoEpicV5DisplayData.pesoOpInterna}
                            ancoraInterna={balcaoEpicV5DisplayData.ancoraInterna}
                            totalACobrarComDesconto={globalDiscountPercentV > 0 ? balcaoTotalACobrar : null}
                        />
                    )}

                    <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>Pagamento</Divider>

                    <Form.Item name="payment_method" label="Forma de recebimento" rules={[{ required: true, message: 'Selecione' }]}>
                        <Select placeholder="Como foi pago?">
                            {PAYMENT_METHODS.map(p => (<Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>))}
                        </Select>
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
                        {({ getFieldValue }) =>
                            getFieldValue('payment_method') === 'CARTAO_CREDITO' ? (
                                <Form.Item name="installments" label="Parcelas" initialValue={1}>
                                    <Select>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                            <Select.Option key={n} value={n}>{n}x de {formatCurrency(saleTotalWithDiscount / n)}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            ) : null
                        }
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
                        {({ getFieldValue }) => {
                            const pm = getFieldValue('payment_method')
                            if (pm !== 'CHEQUE_PRE_DATADO' && pm !== 'BOLETO') return null
                            return (
                                <PaymentWithInstallments
                                    preset={installmentPreset}
                                    onPresetChange={setInstallmentPreset}
                                    rows={customInstallments}
                                    onRowsChange={setCustomInstallments}
                                    total={saleTotalWithDiscount}
                                />
                            )
                        }}
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
                        {({ getFieldValue }) => {
                            const pm = getFieldValue('payment_method')
                            if (pm === 'LANCAMENTOS_A_RECEBER' || pm === 'CARTAO_CREDITO' || pm === 'CHEQUE_PRE_DATADO') return null
                            return (
                                <div style={{ marginBottom: 16 }}>
                                    <Checkbox checked={isSplitPay} onChange={(e) => setIsSplitPay(e.target.checked)}>
                                        <span style={{ fontWeight: 600 }}>Pagamento Parcelado</span>
                                    </Checkbox>
                                    {isSplitPay && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 8, padding: 12, background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
                                            <Form.Item name="amount_paid" label={<span style={{ color: '#000' }}>Valor pago agora (R$)</span>} style={{ margin: 0 }}>
                                                <InputNumber style={{ width: '100%' }} min={0 as number} step={0.5} precision={2}
                                                    formatter={(v) => `${v}`.replace('.', ',')} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                            </Form.Item>
                                            <Form.Item name="remaining_due_date" label={<span style={{ color: '#000' }}>Data para receber o restante</span>} style={{ margin: 0 }}>
                                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Data do recebimento" />
                                            </Form.Item>
                                        </div>
                                    )}
                                </div>
                            )
                        }}
                    </Form.Item>

                    <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>Detalhes</Divider>

                    <Form.Item name="sale_date" label="Data da venda" initialValue={dayjs()}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>

                    <Form.Item name="description" label="Observação">
                        <Input.TextArea rows={2} placeholder="Detalhes da venda..." />
                    </Form.Item>

                    <Form.Item label="Comprovante de pagamento">
                        <Upload
                            fileList={receiptFile}
                            beforeUpload={(file) => {
                                if (file.size > 10 * 1024 * 1024) {
                                    message.error('Arquivo excede 10 MB')
                                    return Upload.LIST_IGNORE
                                }
                                setReceiptFile([file as any])
                                return false
                            }}
                            onRemove={() => { setReceiptFile([]); setAttachDesc('') }}
                            maxCount={1}
                            accept=".pdf,.jpg,.jpeg,.png"
                        >
                            <Button icon={<UploadOutlined />}>Anexar comprovante</Button>
                        </Upload>
                    </Form.Item>
                    {receiptFile.length > 0 && (
                        <Form.Item label="Descrição do anexo" required>
                            <Input
                                placeholder="Descreva o anexo (comprovante, imagem do serviço, etc.)"
                                value={attachDesc}
                                onChange={(e) => setAttachDesc(e.target.value)}
                            />
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                Obrigatório quando um arquivo é anexado.
                            </div>
                        </Form.Item>
                    )}

                    <div style={{
                        background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #86efac', borderRadius: 8,
                        padding: '10px 14px', fontSize: 12, color: '#e2e8f0',
                    }}>
                        <CheckCircleOutlined style={{ color: '#22C55E', marginRight: 6 }} />
                        <strong>Ao registrar:</strong>
                        <ul style={{ margin: '6px 0 0 16px', paddingLeft: 0 }}>
                            <li>Produtos descontados do estoque</li>
                            <li>Receita lançada no fluxo de caixa</li>
                        </ul>
                    </div>
                </Form>
            </Drawer>

            {/* ── Drawer: Detalhes da venda ── */}
            <Drawer
                title={
                    <div>
                        <div>Detalhes da Venda</div>
                        {selectedSale?.sale_code && (
                            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#7A5AF8', fontWeight: 700, marginTop: 2 }}>
                                {selectedSale.sale_code}
                            </div>
                        )}
                    </div>
                }
                width={520}
                open={detailDrawerOpen}
                onClose={() => setDetailDrawerOpen(false)}
            >
                {selectedSale && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Tipo:</span> {selectedSale.saleType === 'FROM_BUDGET' ? '📋 Via orçamento' : selectedSale.saleType === 'AGENDA' ? '📅 Via agenda' : '🏪 Balcão'}</div>
                                {selectedSale.saleType === 'FROM_BUDGET' && selectedSale.budget_id && (
                                    <div>
                                        <span style={{ color: 'var(--color-neutral-500)' }}>Orçamento:</span>{' '}
                                        <Tag color="purple" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                            ORC-{selectedSale.budget_id.slice(0, 4).toUpperCase()}
                                        </Tag>
                                    </div>
                                )}
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Cliente:</span> <strong>{selectedSale.customerName}</strong></div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Vendedor:</span> <strong>{selectedSale.sellerName && selectedSale.sellerName !== '-' ? selectedSale.sellerName : 'Sem vendedor'}</strong></div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Data:</span> {new Date(selectedSale.saleDate).toLocaleDateString('pt-BR')}</div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Valor total:</span> <strong style={{ fontSize: 18, color: '#12B76A' }}>{formatCurrency(selectedSale.finalValue)}</strong></div>
                                <div>
                                    <span style={{ color: 'var(--color-neutral-500)' }}>Pagamento:</span>{' '}
                                    <Tag color="green">{PAYMENT_METHODS.find(p => p.value === selectedSale.paymentMethod)?.label || selectedSale.paymentMethod}</Tag>
                                    {selectedSale.installments > 1 && <Tag color="blue">{selectedSale.installments}x</Tag>}
                                </div>
                            </div>
                        </div>

                        {/* EPIC-RR-DISPLAY S5: Distribuição do resultado da venda.
                            Substitui a antiga linha solta "Comissão paga" — agora os 4 componentes
                            (Comissão, Lucro, IRPJ, CSLL) aparecem com %s sobre o total c/ desconto.
                            Em MEI/SN, IRPJ/CSLL ocultam automaticamente. */}
                        {saleSubtotal > 0 && (
                            <ResidualDistributionBlock
                                distribution={saleResidualDistribution}
                                regimeGuardActive={saleEpicV5DisplayData.regimeGuardActive}
                                discountMode={normalizeDiscountModeForDisplay(selectedSale?.discount_mode)}
                            />
                        )}

                        {/* S14 — DRE Consolidada (R3=B + R7=B). Snapshot histórico imutável. */}
                        {saleSubtotal > 0 && (
                            <ConsolidatedDREBlock
                                dre={saleConsolidatedDRE}
                                cascadeTrace={saleEpicV5DisplayData.cascadeTrace}
                                pesoOpInterna={saleEpicV5DisplayData.pesoOpInterna}
                                ancoraInterna={saleEpicV5DisplayData.ancoraInterna}
                            />
                        )}

                        {detailItems.length > 0 && (
                            <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Produtos e Serviços</div>
                                <div className="pc-items-grid pc-items-grid-header" style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginBottom: 8, fontWeight: 600 }}>
                                    <span className="pc-item-name">Item</span>
                                    <span className="pc-item-qty" style={{ textAlign: 'right' }}>Qtd</span>
                                    <span className="pc-item-unit" style={{ textAlign: 'right' }}>Preço unit.</span>
                                    <span className="pc-item-total" style={{ textAlign: 'right' }}>Total</span>
                                </div>
                                {detailItems.map((item: any, idx: number) => {
                                    const itemName = item.products?.name || item.services?.name || item.description || 'Item'
                                    const productCode = item.products?.code ? ` (Cód: ${item.products.code})` : ''
                                    const unitPrice = Number(item.unit_price || 0)
                                    const qty = Number(item.quantity || 1)
                                    const discount = Number(item.discount || 0)
                                    // discount pode ser % (agenda) ou valor fixo
                                    const totalBeforeDiscount = unitPrice * qty
                                    // Se discount > 1 provavelmente é percentual, senão é valor
                                    const discountAmt = discount > 1 && discount <= 100 && discount === Math.round(discount) ? totalBeforeDiscount * discount / 100 : discount
                                    const total = Math.max(0, totalBeforeDiscount - discountAmt)
                                    return (
                                        <div key={idx} className="pc-items-grid" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
                                            <span className="pc-item-name" style={{ fontWeight: 500 }}>
                                                {itemName}
                                                {productCode && <span style={{ fontSize: 11, color: '#94a3b8' }}>{productCode}</span>}
                                                {discount > 0 && (
                                                    <span style={{ fontSize: 11, color: '#F04438', marginLeft: 6 }}>
                                                        {discount > 1 && discount <= 100 ? `(-${discount}%)` : `(-${formatCurrency(discount)})`}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="pc-item-qty" style={{ textAlign: 'right', color: '#94a3b8' }}>{qty}x</span>
                                            <span className="pc-item-unit" style={{ textAlign: 'right', color: '#94a3b8' }}>{formatCurrency(unitPrice)}</span>
                                            <strong className="pc-item-total" style={{ textAlign: 'right', color: '#12B76A' }}>{formatCurrency(total)}</strong>
                                        </div>
                                    )
                                })}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 14, fontWeight: 700, color: '#12B76A' }}>
                                    Total: {formatCurrency(selectedSale.finalValue)}
                                </div>
                            </div>
                        )}

                        {selectedSale.receiptUrl && receiptSignedUrl && (
                            <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                                    <PaperClipOutlined style={{ marginRight: 6 }} />Comprovante
                                </div>
                                {selectedSale.receiptUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                    <img
                                        src={receiptSignedUrl}
                                        alt="Comprovante"
                                        style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}
                                    />
                                ) : (
                                    <Button
                                        type="link"
                                        icon={<PaperClipOutlined />}
                                        href={receiptSignedUrl}
                                        target="_blank"
                                    >
                                        Visualizar comprovante
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </Drawer>

            {/* ── Modal: Registrar venda de orçamento ── */}
            <Modal
                title="Registrar Venda"
                open={registerModalOpen}
                onCancel={() => { setRegisterModalOpen(false); setRegisterReceiptFile([]); setRegisterAttachDesc(''); setRegisterCustomInstallments([{ date: null, amount: 0 }]); setRegisterInstallmentPreset('customizado') }}
                onOk={handleRegisterSaleFromBudget}
                confirmLoading={registerSaving || (mrmConfig.enabled && !motorReady)}
                okButtonProps={{ disabled: mrmConfig.enabled && !motorReady, title: mrmConfig.enabled && !motorReady ? 'Carregando contexto fiscal...' : '' }}
                okText="Confirmar Venda"
                afterOpenChange={(open) => {
                    if (open && selectedBudget) {
                        const reapply: any = {}
                        if (selectedBudget.payment_method) reapply.payment_method = selectedBudget.payment_method
                        if (selectedBudget.installments && selectedBudget.installments > 1) reapply.installments = selectedBudget.installments
                        if (Object.keys(reapply).length > 0) registerForm.setFieldsValue(reapply)
                    }
                }}
            >
                {selectedBudget && (
                    <div style={{ padding: 12, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ fontSize: 13 }}>
                            <div>Cliente: <strong>{selectedBudget.customer_name}</strong></div>
                            <div>Valor: <strong style={{ fontSize: 16, color: '#12B76A' }}>{formatCurrency(selectedBudget.total_value)}</strong></div>
                        </div>
                    </div>
                )}
                <Form form={registerForm} layout="vertical">
                    <Form.Item name="payment_method" label="Forma de recebimento" rules={[{ required: true, message: 'Selecione' }]}>
                        <Select placeholder="Como foi pago?">
                            {PAYMENT_METHODS.map(p => (<Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>))}
                        </Select>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
                        {({ getFieldValue }) =>
                            getFieldValue('payment_method') === 'CARTAO_CREDITO' ? (
                                <Form.Item name="installments" label="Parcelas" initialValue={1}>
                                    <Select>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                            <Select.Option key={n} value={n}>{n}x{selectedBudget ? ` de ${formatCurrency(selectedBudget.total_value / n)}` : ''}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            ) : null
                        }
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
                        {({ getFieldValue }) => {
                            const pm = getFieldValue('payment_method')
                            if (pm !== 'CHEQUE_PRE_DATADO' && pm !== 'BOLETO') return null
                            return (
                                <PaymentWithInstallments
                                    preset={registerInstallmentPreset}
                                    onPresetChange={setRegisterInstallmentPreset}
                                    rows={registerCustomInstallments}
                                    onRowsChange={setRegisterCustomInstallments}
                                    total={Number(selectedBudget?.total_value) || 0}
                                />
                            )
                        }}
                    </Form.Item>
                    <Form.Item name="sale_date" label="Data do recebimento" initialValue={dayjs()}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                    <Form.Item name="description" label="Observação">
                        <Input.TextArea rows={2} placeholder="Observação..." />
                    </Form.Item>
                    <Form.Item label="Comprovante de pagamento">
                        <Upload
                            fileList={registerReceiptFile}
                            beforeUpload={(file) => {
                                if (file.size > 10 * 1024 * 1024) {
                                    message.error('Arquivo excede 10 MB')
                                    return Upload.LIST_IGNORE
                                }
                                setRegisterReceiptFile([file as any])
                                return false
                            }}
                            onRemove={() => { setRegisterReceiptFile([]); setRegisterAttachDesc('') }}
                            maxCount={1}
                            accept=".pdf,.jpg,.jpeg,.png"
                        >
                            <Button icon={<UploadOutlined />}>Anexar comprovante</Button>
                        </Upload>
                    </Form.Item>
                    {registerReceiptFile.length > 0 && (
                        <Form.Item label="Descrição do anexo" required>
                            <Input
                                placeholder="Descreva o anexo (comprovante, imagem do serviço, etc.)"
                                value={registerAttachDesc}
                                onChange={(e) => setRegisterAttachDesc(e.target.value)}
                            />
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                Obrigatório quando um arquivo é anexado.
                            </div>
                        </Form.Item>
                    )}
                </Form>
            </Modal>

            {/* ── Modal: Registrar pagamento de pedido ── */}
            <Modal
                title="Registrar Pagamento do Pedido"
                open={orderPaymentModalOpen}
                onCancel={() => setOrderPaymentModalOpen(false)}
                onOk={handleConfirmOrderSalePayment}
                confirmLoading={orderPaymentSaving}
                okText="Confirmar Pagamento"
            >
                {selectedOrderSale && (
                    <div style={{ padding: 12, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ fontSize: 13 }}>
                            <div>Cliente: <strong>{selectedOrderSale.customerName}</strong></div>
                            <div>Valor: <strong style={{ fontSize: 16, color: '#12B76A' }}>{formatCurrency(selectedOrderSale.finalValue)}</strong></div>
                        </div>
                    </div>
                )}
                <Form form={orderPaymentForm} layout="vertical">
                    <Form.Item name="payment_method" label="Forma de recebimento" rules={[{ required: true, message: 'Selecione' }]}>
                        <Select placeholder="Como foi pago?">
                            {PAYMENT_METHODS.map(p => (<Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="sale_date" label="Data do recebimento" initialValue={dayjs()}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                </Form>
            </Modal>

            <ExportFormatModal
                open={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
                title="Exportar Vendas"
            />
        </Layout>
    )
}

export default Sales
