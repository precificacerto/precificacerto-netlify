import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
    App as AntdApp,
    Button, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag,
    message, DatePicker, Steps, Popconfirm, Divider, Empty, Modal, Upload, Radio, Segmented,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import type { BudgetStatus } from '@/supabase/types'
import { getCurrentUserId } from '@/utils/get-tenant-id'
import { useAuth } from '@/hooks/use-auth.hook'
import { useBudgets, useCustomers, useProducts, useEmployees, useServices } from '@/hooks/use-data.hooks'
import {
    FileTextOutlined, ClockCircleOutlined, CheckCircleOutlined,
    DollarOutlined, SearchOutlined, PlusOutlined, DeleteOutlined,
    CreditCardOutlined, WhatsAppOutlined, SendOutlined, EditOutlined,
    PaperClipOutlined, UploadOutlined, ShoppingCartOutlined, ToolOutlined,
    UnorderedListOutlined, FilePdfOutlined,
} from '@ant-design/icons'
// Onda 3 / CRÍT-perf: exportTableToPdf (jsPDF ~100KB) via dynamic import no callback.
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { CurrencyInput } from '@/components/currency-input.component'
import type { DiscountMode } from '@/utils/calculate-discount'
import {
    PaymentWithInstallments,
    buildInstallmentsByPreset,
    INSTALLMENT_PRESETS,
    type InstallmentPresetValue,
    type InstallmentRow,
} from '@/components/payment-with-installments.component'
import dayjs, { type Dayjs } from 'dayjs'
import { formatBRL } from '@/utils/formatters'
import { syncCustomerRecurrenceOnSale } from '@/lib/customer-recurrence'
import { distributeDiscountToItems } from '@/utils/distribute-discount'
import { useTenantTaxContext } from '@/hooks/use-tenant-tax-context'
import { MRM_ERROR_RRO_NON_POSITIVE, MRM_ENGINE_VERSION } from '@/types/mrm'
import { hydrateItemSnapshot, type TenantSnapshotContext } from '@/lib/items-snapshot'
import { calculateMarginReapuration } from '@/utils/margin-reapuration'
import { buildMotorInput } from '@/utils/mrm-orchestrator'
import { calculateMotorV17ForPage } from '@/utils/mrm-engine-v17/legacy-adapter'
import { useResidualDistribution } from '@/hooks/use-residual-distribution'
import { detectConfigWarning, type ResidualItemInput } from '@/utils/residual-distribution'
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
import { coerceLegacyDiscountMode } from '@/config/feature-flags'
import { decideMrmAction } from '@/utils/mrm-policies'
import { aggregateMotorResults } from '@/utils/mrm-aggregate'
import { RROWarningModal } from '@/components/mrm/RROWarningModal'
import { RequiresReviewBadge } from '@/components/mrm/RequiresReviewBadge'

const formatCurrency = formatBRL

/** Célula de cabeçalho que mantém título + ícone de ordenação + ícone de filtro agrupados à esquerda */
function TableHeaderCell(props: React.HTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) {
    const { children, ...rest } = props
    return (
        <th {...rest}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4, flexWrap: 'nowrap' }}>
                {children}
            </div>
        </th>
    )
}

const statusConfig: Record<string, { color: string; label: string; stage: number }> = {
    DRAFT: { color: 'default', label: 'Rascunho', stage: 0 },
    AWAITING_PAYMENT: { color: 'processing', label: 'Aguardando pagamento', stage: 1 },
    SENT: { color: 'processing', label: 'Enviado', stage: 1 },
    APPROVED: { color: 'success', label: 'Aprovado', stage: 1 },
    PAID: { color: 'green', label: '✅ Pago', stage: 2 },
    EXPIRED: { color: 'warning', label: 'Expirado', stage: -1 },
    REJECTED: { color: 'error', label: 'Recusado', stage: -1 },
    SENT_TO_ORDER: { color: 'cyan', label: '📦 Enviado para Pedido', stage: 2 },
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

interface BudgetItemRow {
    key: string
    product_id: string | null
    service_id?: string | null
    product_name: string
    quantity: number
    unit_price: number
    total: number
    commission_table_id?: string | null
    commission_percent?: number
    profit_percent?: number
    /** Custo unitário do produto/serviço — alimenta CP do motor RR (Sprint S8). */
    cost_total?: number
    /** V8.1 (2026-05-24): Parcela de MO produtiva inclusa em cost_total (R$ unitário).
     *  Permite separar "Custo do produto" (material) de "MOD" (mão de obra) na DRE. */
    productive_labor_unit?: number
    /** V13 (2026-05-25): Despesa Financeira POR UNIDADE do produto (R$).
     *  Origem: pricing_calculations.val_financial_expense / yield_quantity.
     *  Quando presente, motor usa snapshot (× qty) em vez de tenant.financial_pct × RV. */
    financial_expense_unit?: number | null
    /** V14 (2026-05-25): snapshot COMPLETO dos 4 buckets de despesa do produto.
     *  Origem: pricing_calculations.val_* + pct_*. Quando presente, motor usa
     *  TODOS os 4 buckets do snapshot × qty (ignora tenant.expense_breakdown). */
    expense_breakdown_unit?: import('@/utils/item-tax-rates').ProductExpenseBreakdown | null
    /** Alíquotas tributárias específicas do item (Sprint S11). NULL = fallback tenant. */
    item_tax_rates?: ItemTaxRates | null
    isManual?: boolean
    isService?: boolean
}

function Budgets() {
    const { modal: modalApi } = AntdApp.useApp()
    const { data: budgets = [], isLoading, mutate: reloadBudgets } = useBudgets()
    const { data: customers = [] } = useCustomers()
    const { data: products = [] } = useProducts()
    const { data: employees = [] } = useEmployees()
    const { data: services = [] } = useServices()
    const { currentUser, tenantId } = useAuth()
    const mrmConfig = useTenantTaxContext()
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [selectedBudget, setSelectedBudget] = useState<any>(null)
    const [budgetItems, setBudgetItems] = useState<BudgetItemRow[]>([])
    const [detailItems, setDetailItems] = useState<any[]>([])
    const [searchText, setSearchText] = useState('')
    const [saving, setSaving] = useState(false)
    const [waConnected, setWaConnected] = useState(false)
    const [waWebhookUrl, setWaWebhookUrl] = useState<string | null>(null)
    const [sendingWaId, setSendingWaId] = useState<string | null>(null)
    const [waThrottleSecondsLeft, setWaThrottleSecondsLeft] = useState(0)
    const [budgetMessageTemplate, setBudgetMessageTemplate] = useState<string | null>(null)
    const [form] = Form.useForm()
    const [paymentForm] = Form.useForm()
    const [customInstallments, setCustomInstallments] = useState<InstallmentRow[]>([{ date: null, amount: 0 }])
    const [installmentPreset, setInstallmentPreset] = useState<InstallmentPresetValue>('customizado')
    // Informative installments in the budget create/edit form (not saved to DB)
    const [budgetFormInstallmentPreset, setBudgetFormInstallmentPreset] = useState<InstallmentPresetValue>('customizado')
    const [budgetFormCustomInstallments, setBudgetFormCustomInstallments] = useState<InstallmentRow[]>([{ date: null, amount: 0 }])
    const [budgetFormWithEntry, setBudgetFormWithEntry] = useState(false)
    const [budgetFormBaseDate, setBudgetFormBaseDate] = useState<Dayjs | undefined>(undefined)
    const [attachFile, setAttachFile] = useState<File | null>(null)
    const [attachDesc, setAttachDesc] = useState('')
    const [customerMode, setCustomerMode] = useState<'existing' | 'manual'>('existing')
    const [messageApi, contextHolder] = message.useMessage()
    const [empProductTables, setEmpProductTables] = useState<{id: string; name: string; type: string; commission_percent?: number}[]>([])
    const [empServiceTables, setEmpServiceTables] = useState<{id: string; name: string; type: string; commission_percent?: number}[]>([])
    const [tableSections, setTableSections] = useState<{key: string; tableId: string | null}[]>([{key: 'ts-0', tableId: null}])
    const [globalDiscountPercent, setGlobalDiscountPercent] = useState(0)
    const [discountInputMode, setDiscountInputMode] = useState<'PERCENT' | 'AMOUNT'>('PERCENT')
    const [discountMode, setDiscountMode] = useState<DiscountMode>('PROPORTIONAL')
    const skipTableAutoSelectRef = useRef(false)

    // ── Products-in-budgets drawer state ──
    const [prodBudgetDrawerOpen, setProdBudgetDrawerOpen] = useState(false)
    const [prodBudgetLoading, setProdBudgetLoading] = useState(false)
    const [commissionTables, setCommissionTables] = useState<{id: string; name: string}[]>([])
    const [prodBudgetRows, setProdBudgetRows] = useState<{
        budgetId: string
        budgetNum: string
        customerName: string
        employeeName: string
        customerId: string | null
        employeeId: string | null
        items: {productId: string | null; productName: string; commissionTableId: string | null; quantity: number; unitPrice: number}[]
        matchItems?: {productId: string | null; productName: string; quantity: number; unitPrice: number}[]
    }[]>([])
    const [pbFilterTable, setPbFilterTable] = useState<string | undefined>()
    const [pbFilterProduct, setPbFilterProduct] = useState<string | undefined>()
    const [pbFilterCustomer, setPbFilterCustomer] = useState<string | undefined>()
    const [pbFilterEmployee, setPbFilterEmployee] = useState<string | undefined>()
    const [pbTableProducts, setPbTableProducts] = useState<{id: string; name: string}[]>([])

    // MRM S2.3: estado do modal de aviso RRO ≤ 0 para budgets.
    // `pendingMrmSave` armazena a continuação (resolve/reject) do save bloqueado
    // aguardando confirmação do usuário no modal.
    const [mrmWarnOpen, setMrmWarnOpen] = useState(false)
    const [mrmWarnMessage, setMrmWarnMessage] = useState('')
    const pendingMrmConfirmRef = useRef<((confirmed: boolean) => void) | null>(null)
    const askMrmConfirmation = (message: string): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            setMrmWarnMessage(message)
            setMrmWarnOpen(true)
            pendingMrmConfirmRef.current = (confirmed: boolean) => {
                setMrmWarnOpen(false)
                pendingMrmConfirmRef.current = null
                resolve(confirmed)
            }
        })
    }

    useEffect(() => {
        async function fetchSettings() {
            const { data: settings } = await supabase
                .from('tenant_settings')
                .select('whatsapp_connected, n8n_webhook_url, whatsapp_budget_message')
                .limit(1)
                .single()
            const fromTenant = settings?.whatsapp_connected ?? false
            setWaWebhookUrl(settings?.n8n_webhook_url ?? null)
            setBudgetMessageTemplate(settings?.whatsapp_budget_message ?? null)
            try {
                const statusRes = await fetch('/api/whatsapp/status')
                const status = await statusRes.json().catch(() => ({}))
                setWaConnected(fromTenant || (status?.canSend === true))
            } catch {
                setWaConnected(fromTenant)
            }
        }
        fetchSettings()
    }, [])

    useEffect(() => {
        if (waThrottleSecondsLeft <= 0) return
        const t = setInterval(() => setWaThrottleSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000)
        return () => clearInterval(t)
    }, [waThrottleSecondsLeft])

    const filteredData = useMemo(() => {
        // T12: ocultar pagos — lista mostra apenas Rascunho e Aguardando pagamento (+ SENT/APPROVED em transição)
        const visible = budgets.filter(b => b.status !== 'PAID')
        if (!searchText) return visible
        return visible.filter(b =>
            (b.customer?.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
            b.id.toLowerCase().includes(searchText.toLowerCase())
        )
    }, [budgets, searchText])

    // ── Fetch data for "Ver produtos em orçamentos" drawer ──
    const openProdBudgetDrawer = async () => {
        setProdBudgetDrawerOpen(true)
        setProdBudgetLoading(true)
        try {
            const [tablesRes, budgetsRes] = await Promise.all([
                (supabase as any).from('commission_tables').select('id, name').order('name'),
                (supabase as any)
                    .from('budgets')
                    .select('id, customer:customers(id, name), employee:employees(id, name), budget_items(product_id, quantity, unit_price, products(id, name, commission_table_id))')
                    .in('status', ['DRAFT', 'SENT', 'APPROVED', 'AWAITING_PAYMENT', 'SENT_TO_ORDER'])
                    .eq('is_active', true)
                    .order('created_at', { ascending: false }),
            ])
            setCommissionTables((tablesRes.data || []) as {id: string; name: string}[])
            const rows = (budgetsRes.data || []).map((b: any) => ({
                budgetId: b.id,
                budgetNum: `ORC-${b.id.substring(0, 4).toUpperCase()}`,
                customerName: b.customer?.name || '—',
                employeeName: b.employee?.name || '—',
                customerId: b.customer?.id || null,
                employeeId: b.employee?.id || null,
                items: (b.budget_items || []).map((i: any) => ({
                    productId: i.product_id || null,
                    productName: i.products?.name || 'Item manual',
                    commissionTableId: i.products?.commission_table_id || null,
                    quantity: Number(i.quantity) || 0,
                    unitPrice: Number(i.unit_price) || 0,
                })),
            }))
            setProdBudgetRows(rows)
        } finally {
            setProdBudgetLoading(false)
        }
    }

    // Update product list when table filter changes
    const handlePbTableChange = (tableId: string | undefined) => {
        setPbFilterTable(tableId)
        setPbFilterProduct(undefined)
        if (!tableId) {
            setPbTableProducts([])
            return
        }
        // Collect unique products from that table across all budget rows
        const seen = new Set<string>()
        const prods: {id: string; name: string}[] = []
        for (const row of prodBudgetRows) {
            for (const item of row.items) {
                if (item.commissionTableId === tableId && item.productId && !seen.has(item.productId)) {
                    seen.add(item.productId)
                    prods.push({ id: item.productId, name: item.productName })
                }
            }
        }
        prods.sort((a, b) => a.name.localeCompare(b.name))
        setPbTableProducts(prods)
    }

    // Compute filtered rows for the drawer
    const pbFilteredRows = useMemo(() => {
        return prodBudgetRows.filter(row => {
            if (pbFilterCustomer && row.customerId !== pbFilterCustomer) return false
            if (pbFilterEmployee && row.employeeId !== pbFilterEmployee) return false
            const matchItems = row.items.filter(item => {
                if (pbFilterTable && item.commissionTableId !== pbFilterTable) return false
                if (pbFilterProduct && item.productId !== pbFilterProduct) return false
                return true
            })
            return matchItems.length > 0
        }).map(row => ({
            ...row,
            matchItems: row.items.filter(item => {
                if (pbFilterTable && item.commissionTableId !== pbFilterTable) return false
                if (pbFilterProduct && item.productId !== pbFilterProduct) return false
                return true
            }),
        }))
    }, [prodBudgetRows, pbFilterTable, pbFilterProduct, pbFilterCustomer, pbFilterEmployee])

    const pbTotalQty = useMemo(() =>
        pbFilteredRows.reduce((s, r) => s + r.matchItems.reduce((ss, i) => ss + i.quantity, 0), 0),
    [pbFilteredRows])

    const { canView, canEdit } = usePermissions()
    if (!canView(MODULES.BUDGETS)) {
        return <Layout title={PAGE_TITLES.BUDGETS}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    // KPIs
    const totalBudgets = budgets.length
    const pendingBudgets = budgets.filter(b => ['SENT', 'APPROVED', 'AWAITING_PAYMENT'].includes(b.status)).length
    const paidBudgets = budgets.filter(b => ['PAID', 'SENT_TO_ORDER'].includes(b.status)).length
    const awaitingPaymentCount = budgets.filter(b => b.status === 'AWAITING_PAYMENT').length
    const totalValue = budgets.filter(b => !['REJECTED', 'EXPIRED'].includes(b.status)).reduce((s, b) => s + Number(b.total_value || 0), 0)

    // ── Adicionar item ao orçamento ──
    const handleAddProduct = (tableId: string) => {
        setBudgetItems(prev => [...prev, {
            key: Date.now().toString(),
            product_id: '',
            product_name: '',
            quantity: 1,
            unit_price: 0,
            total: 0,
            isManual: false,
            commission_table_id: tableId,
        }])
    }

    const handleAddManualItem = () => {
        setBudgetItems(prev => [...prev, {
            key: Date.now().toString(),
            product_id: null,
            product_name: '',
            quantity: 1,
            unit_price: 0,
            total: 0,
            isManual: true,
        }])
    }

    const handleAddService = (tableId: string) => {
        setBudgetItems(prev => [...prev, {
            key: Date.now().toString(),
            product_id: null,
            service_id: '',
            product_name: '',
            quantity: 1,
            unit_price: 0,
            total: 0,
            isService: true,
            commission_table_id: tableId,
        }])
    }

    const handleServiceSelect = (key: string, serviceId: string) => {
        const svc = services.find((s: any) => s.id === serviceId)
        const allTables = [...empProductTables, ...empServiceTables]
        setBudgetItems(prev => prev.map(item => {
            if (item.key !== key) return item
            const commTable = allTables.find(t => t.id === item.commission_table_id)
            const commissionPercent = (svc?.commission_percent != null && Number(svc.commission_percent) > 0)
                ? Number(svc.commission_percent)
                : Number(commTable?.commission_percent || 0)
            const basePrice = Number(svc?.base_price || 0)
            // V7+ (2026-05-24): fallback robusto para serviços com cost_total=0
            // V8.6: passa tenant context para cálculo runtime de MO produtiva
            const laborTenantCtxSvc = {
                production_labor_cost: mrmConfig.production_labor_cost,
                monthly_workload_minutes: mrmConfig.monthly_workload_minutes,
                productive_value_per_minute: mrmConfig.productive_value_per_minute,
            }
            // V16.2 (Founder 2026-05-27): semântica V9-I5 — cost_total = só material,
            // productive_labor_unit = MO separada. Motor soma. Evita dupla contagem.
            const { costTotal, productiveLaborUnit } = resolveProductCostAndLabor(svc, laborTenantCtxSvc)
            // V13 (2026-05-25): snapshot Despesa Financeira do produto
            const financialExpenseUnit = resolveProductFinancialExpense(svc)
            // V14 (2026-05-25): snapshot completo dos 4 buckets de despesa
            const expenseBreakdownUnit = resolveProductExpenseBreakdown(svc)
            const profitPercent = (svc?.profit_percent != null && Number(svc.profit_percent) > 0)
                ? Number(svc.profit_percent)
                : (basePrice > 0 && costTotal > 0 ? Math.max(0, ((basePrice - costTotal) / basePrice) * 100) : 0)
            // V7+ (2026-05-24): usa helper centralizado que também lê pis_cofins_pct agregado
            const svcTaxRates: ItemTaxRates = buildItemTaxRatesFromProduct(svc)
            return {
                ...item,
                service_id: serviceId,
                product_name: svc?.name || '',
                unit_price: basePrice,
                commission_percent: commissionPercent,
                profit_percent: profitPercent,
                cost_total: costTotal,
                productive_labor_unit: productiveLaborUnit,
                financial_expense_unit: financialExpenseUnit,
                expense_breakdown_unit: expenseBreakdownUnit,
                item_tax_rates: svcTaxRates,
                total: basePrice * item.quantity,
                isService: true,
            }
        }))
    }

    const handleProductSelect = (key: string, productId: string) => {
        const prod = products.find((p: any) => p.id === productId)
        const allTables = [...empProductTables, ...empServiceTables]
        setBudgetItems(prev => prev.map(item => {
            if (item.key !== key) return item
            const commTable = allTables.find(t => t.id === item.commission_table_id)
            const commissionPercent = (prod?.commission_percent != null && Number(prod.commission_percent) > 0)
                ? Number(prod.commission_percent)
                : Number(commTable?.commission_percent || 0)
            const salePrice = Number(prod?.sale_price || 0)
            // V7+ (2026-05-24): fallback robusto para produtos com cost_total=0
            // V8.6: passa tenant context para cálculo runtime de MO produtiva
            const laborTenantCtx = {
                production_labor_cost: mrmConfig.production_labor_cost,
                monthly_workload_minutes: mrmConfig.monthly_workload_minutes,
                productive_value_per_minute: mrmConfig.productive_value_per_minute,
            }
            // V16.2 (Founder 2026-05-27): semântica V9-I5 — cost_total = só material,
            // productive_labor_unit = MO separada. Motor soma. Evita dupla contagem.
            const { costTotal, productiveLaborUnit } = resolveProductCostAndLabor(prod, laborTenantCtx)
            // V13 (2026-05-25): snapshot Despesa Financeira do produto
            const financialExpenseUnit = resolveProductFinancialExpense(prod)
            // V14 (2026-05-25): snapshot completo dos 4 buckets de despesa
            const expenseBreakdownUnit = resolveProductExpenseBreakdown(prod)
            const profitPercent = (prod?.profit_percent != null && Number(prod.profit_percent) > 0)
                ? Number(prod.profit_percent)
                : (salePrice > 0 && costTotal > 0 ? Math.max(0, ((salePrice - costTotal) / salePrice) * 100) : 0)
            // V7+ (2026-05-24): usa helper centralizado que também lê pis_cofins_pct agregado
            const prodTaxRates: ItemTaxRates = buildItemTaxRatesFromProduct(prod)
            return {
                ...item,
                product_id: productId,
                product_name: prod?.name || '',
                unit_price: salePrice,
                commission_percent: commissionPercent,
                profit_percent: profitPercent,
                cost_total: costTotal,
                productive_labor_unit: productiveLaborUnit,
                financial_expense_unit: financialExpenseUnit,
                expense_breakdown_unit: expenseBreakdownUnit,
                item_tax_rates: prodTaxRates,
                total: salePrice * item.quantity,
                isManual: false,
            }
        }))
    }

    const handleManualDescriptionChange = (key: string, description: string) => {
        setBudgetItems(prev => prev.map(item =>
            item.key === key ? { ...item, product_name: description } : item
        ))
    }

    const handleItemChange = (key: string, field: string, value: number) => {
        setBudgetItems(prev => prev.map(item => {
            if (item.key !== key) return item
            const updated = { ...item, [field]: value }
            updated.total = updated.unit_price * updated.quantity
            return updated
        }))
    }

    const handleRemoveItem = (key: string) => {
        setBudgetItems(prev => prev.filter(i => i.key !== key))
    }

    const selectedEmployeeId = Form.useWatch('employee_id', form)
    const latestEmployeeIdRef = useRef<string | undefined>(undefined)
    const selectedEmployee = employees.find((e: any) => e.id === selectedEmployeeId) as any
    const sellerCommissionPct = (selectedEmployee?.commission_percent != null && Number(selectedEmployee.commission_percent) > 0)
        ? Number(selectedEmployee.commission_percent) / 100
        : 0

    useEffect(() => {
        if (!selectedEmployeeId) {
            setEmpProductTables([])
            setEmpServiceTables([])
            setTableSections([{key: 'ts-0', tableId: null}])
            setBudgetItems([])
            return
        }
        latestEmployeeIdRef.current = selectedEmployeeId
        if (skipTableAutoSelectRef.current) {
            skipTableAutoSelectRef.current = false
            return
        }
        const empIdAtFetch = selectedEmployeeId
        ;(async () => {
            const { data } = await (supabase as any)
                .from('employee_commission_tables')
                .select('commission_tables(id, name, type, commission_percent)')
                .eq('employee_id', empIdAtFetch)
            if (empIdAtFetch !== latestEmployeeIdRef.current) return
            const tables = (data || []).map((r: any) => r.commission_tables).filter(Boolean)
            const productTables = tables.filter((t: any) => t.type === 'PRODUCT')
            const serviceTables = tables.filter((t: any) => t.type === 'SERVICE')
            setEmpProductTables(productTables)
            setEmpServiceTables(serviceTables)
            const firstTable = productTables[0] || serviceTables[0]
            setTableSections([{key: 'ts-0', tableId: firstTable?.id || null}])
            setBudgetItems([])
        })()
    }, [selectedEmployeeId])

    const allEmpTables = useMemo(() => [...empProductTables, ...empServiceTables], [empProductTables, empServiceTables])
    const usedTableIds = tableSections.map(s => s.tableId).filter(Boolean) as string[]
    const employeeHasNoTables = !!selectedEmployeeId && empProductTables.length === 0 && empServiceTables.length === 0
    const getItemTotalWithCommission = (item: BudgetItemRow) => item.unit_price * item.quantity
    const budgetTotal = budgetItems.reduce((s, i) => s + getItemTotalWithCommission(i), 0)

    // Teto do desconto: pool varia conforme discount_mode (Epic MRM-V6 / ADR-009).
    //   - PROPORTIONAL: pool = comissão + lucro (somam-se ambas)
    //   - SELLER_REDUCTION: pool = apenas comissão (vendedor absorve)
    //   - PROFIT_REDUCTION: pool = apenas lucro (empresa absorve)
    const maxDiscountPercent = (() => {
        if (budgetTotal <= 0) return 100
        const pool = budgetItems.reduce((s, i) => {
            const comm = i.commission_percent || 0
            const prof = i.profit_percent || 0
            const contributing =
                discountMode === 'SELLER_REDUCTION'
                    ? comm
                    : discountMode === 'PROFIT_REDUCTION'
                        ? prof
                        : comm + prof
            return s + i.unit_price * i.quantity * contributing / 100
        }, 0)
        return Math.min(100, (pool / budgetTotal) * 100)
    })()

    const budgetTotalWithDiscount = budgetTotal * (1 - globalDiscountPercent / 100)

    // ── Comissão e Lucro via Motor de Reapuração (RR) v2.1.0 ──
    // Desconto reduz a receita operacional (RB→RV); NUNCA reduz alíquotas.
    // RRO = RV - IMP - CP - MOD - DOP; rateio proporcional de comissão + lucro
    // + CSLL + IRPJ sobre RRO.
    //
    // Sprint S8 (EPIC-RR-DISPLAY, 20/05/2026): CP/MOD/DOP populados de verdade.
    //   CP_item  = item.cost_total × quantity  (custo do produto/serviço)
    //   MOD_item = itemBase × mod_pct          (production_labor_percent)
    //   DOP_item = itemBase × dop_pct          (fixed + variable + financial + indirect_labor)
    // A "Opção A" anterior (CP=MOD=DOP=0) tornava RRO ≈ RV, violando Etapa 7.
    const totalCommissionPct = budgetTotal > 0
        ? budgetItems.reduce((s, i) => s + i.unit_price * i.quantity * (i.commission_percent || 0) / 100, 0) / budgetTotal * 100
        : 0
    const totalProfitPct = budgetTotal > 0
        ? budgetItems.reduce((s, i) => s + i.unit_price * i.quantity * (i.profit_percent || 0) / 100, 0) / budgetTotal * 100
        : 0
    // P0 — Loading guard (Aria §7 + Quinn §4): bloqueia operações quando o
    // contexto fiscal ainda não carregou. Com rates=[] o motor calcula IMP=0
    // e infla a comissão a ~100% da receita — risco de persistir valor absurdo.
    const motorReady = !mrmConfig.enabled || (!mrmConfig.loading && mrmConfig.rates.length > 0)
    const reapurationEffectiveDate = new Date().toISOString().slice(0, 10)

    // V17 Cutover (2026-05-28): motor agora roda UMA VEZ sobre todos os items
    // (consolida cross-produto antes de aplicar desconto, conforme PDF Etapas 1-9).
    // Adapter mantém shape V16 (motorResultsByItem) para componentes downstream.
    // V17 fix (2026-05-28 noite revisão 2): enriquece items com 4 campos do produto
    // para que adapter calcule Op Interna real via fórmula confiável:
    //   Op_Interna = sale_price_base - (freight + insurance + accessory_expenses)
    // O campo valor_precificado_icms_piscofins do banco está stale/errado (validado via SQL).
    const enrichedItems = budgetItems.map(i => {
        const prod = i.product_id ? (products as any[]).find(p => p.id === i.product_id) : null
        const numOrNull = (v: unknown) =>
            v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null
        const terceirizadas = prod
            ? (Number(prod.freight_value) || 0) +
              (Number(prod.insurance_value) || 0) +
              (Number(prod.accessory_expenses_value) || 0)
            : 0
        return {
            ...i,
            valor_op_interna_unit: numOrNull(prod?.valor_precificado_icms_piscofins),
            sale_price_base_unit: numOrNull(prod?.sale_price_base),
            terceirizadas_unit: terceirizadas > 0 ? terceirizadas : null,
        }
    })
    const v17Results = calculateMotorV17ForPage({
        items: enrichedItems,
        tenantCtx: {
            regime: mrmConfig.regime,
            rates: mrmConfig.rates,
            mod_pct: mrmConfig.mod_pct,
            dop_pct: mrmConfig.dop_pct,
            csll_pct: mrmConfig.csll_pct,
            irpj_pct: mrmConfig.irpj_pct,
            useSnapshotRates: mrmConfig.useSnapshotRates,
            expense_breakdown: mrmConfig.expense_breakdown,
            absorption_policy: 'RRO_PROPORTIONAL', // TODO: ler de tenant.absorption_policy
        },
        globalDiscountPercent,
        effectiveDate: reapurationEffectiveDate,
    })
    // Preserva guard V16 — items sem componente distribuível retornam null
    const motorResultsByItem = budgetItems.map((i, idx) => {
        const itemBase = i.unit_price * i.quantity
        if (itemBase <= 0) return null
        const commPctDecimal = (i.commission_percent ?? 0) / 100
        const profPctDecimal = (i.profit_percent ?? 0) / 100
        const itemCsll = resolveItemCsllPct(i.item_tax_rates ?? null, mrmConfig.csll_pct)
        const itemIrpj = resolveItemIrpjPct(i.item_tax_rates ?? null, mrmConfig.irpj_pct)
        const totalPctDistribuivel = commPctDecimal + profPctDecimal + (Number(itemCsll) || 0) + (Number(itemIrpj) || 0)
        if (totalPctDistribuivel === 0) return null
        return v17Results[idx]
    })
    // Mantido por compatibilidade (não usado após cutover V17 — remover em commit futuro):
    void calculateMarginReapuration; void buildMotorInput; void discountMode;
    const profitAmount = motorResultsByItem.reduce((s, r) => s + (r?.new_profit ?? 0), 0)
    const commissionAmount = motorResultsByItem.reduce((s, r) => s + (r?.new_commission ?? 0), 0)

    // ── EPIC-RR-DISPLAY: distribuição semântica (PDF GPT + DOCX Claude, 20/05/2026) ──
    // Aria S2 review: memoizar array de items antes de passar ao hook (evita
    // recálculo a cada render). budgetItems é stable enquanto não há edição.
    const residualItems: ResidualItemInput[] = useMemo(
        () => budgetItems.map((item, idx) => {
            const motor = motorResultsByItem[idx]
            return {
                unit_price: item.unit_price,
                quantity: item.quantity,
                commission_percent: item.commission_percent,
                profit_percent: item.profit_percent,
                tax_breakdown: null as null,  // edição em memória — só motor runtime
                motor_new_commission: motor?.new_commission,
                motor_new_profit: motor?.new_profit,
                motor_new_csll: motor?.new_csll,
                motor_new_irpj: motor?.new_irpj,
            }
        }),
        [budgetItems, motorResultsByItem],
    )
    const tenantTaxRates = useMemo(
        () => ({ irpj: mrmConfig.irpj_pct || 0, csll: mrmConfig.csll_pct || 0 }),
        [mrmConfig.irpj_pct, mrmConfig.csll_pct],
    )
    // Epic MRM-V7 / ADR-010: passa discountPct + discountMode para usar caminho display-first
    const residualDistribution = useResidualDistribution(
        residualItems,
        budgetTotal,
        budgetTotalWithDiscount,
        mrmConfig.regime ?? null,
        tenantTaxRates,
        globalDiscountPercent,
        discountMode,
    )
    // S9 — Aviso de configuração incompleta (RRO degradado)
    const budgetTotalCostBase = useMemo(
        () => budgetItems.reduce(
            (s, i) => s + (Number(i.cost_total) || 0) * (Number(i.quantity) || 0),
            0,
        ),
        [budgetItems],
    )
    const residualConfigWarning = detectConfigWarning({
        totalCostBase: budgetTotalCostBase,
        dopPct: mrmConfig.dop_pct,
        modPct: mrmConfig.mod_pct,
        totalGross: budgetTotal,
    })

    // S14 — DRE Consolidada (princípio: consolida RRs individuais, não recalcula)
    const consolidatedDRE = useMemo(() => {
        const dreItems: DREItemInput[] = budgetItems.map((item, idx) => {
            const motor = motorResultsByItem[idx]
            return {
                unit_price: item.unit_price,
                quantity: item.quantity,
                cost_total: item.cost_total,
                productive_labor_unit: item.productive_labor_unit, // V8.1
                commission_percent: item.commission_percent,
                profit_percent: item.profit_percent,
                tax_breakdown: null as null,
                motor_new_commission: motor?.new_commission,
                motor_new_profit: motor?.new_profit,
                motor_new_csll: motor?.new_csll,
                motor_new_irpj: motor?.new_irpj,
            }
        })
        // Para DRE: os snapshots de taxes_inside/outside precisam vir do motor
        // calculado em runtime — anexamos como tax_breakdown sintético com apenas
        // os campos relevantes (taxes_inside + taxes_outside). Aria S14 review:
        // motor já é compatível com TaxBreakdown (mesma shape), spread direto OK.
        dreItems.forEach((di, idx) => {
            const motor = motorResultsByItem[idx]
            if (motor) {
                di.tax_breakdown = motor
            }
        })
        return computeConsolidatedDRE({
            items: dreItems,
            totalGross: budgetTotal,
            totalNet: budgetTotalWithDiscount,
            regime: mrmConfig.regime ?? null,
            expenseStructure: {
                fixed_pct: Number(mrmConfig.expense_breakdown.fixed_pct) || 0,
                variable_pct: Number(mrmConfig.expense_breakdown.variable_pct) || 0,
                financial_pct: Number(mrmConfig.expense_breakdown.financial_pct) || 0,
                administrative_pct: Number(mrmConfig.expense_breakdown.administrative_pct) || 0,
                mod_pct: Number(mrmConfig.mod_pct) || 0,
            },
            tenantTaxRates,
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budgetItems, motorResultsByItem, budgetTotal, budgetTotalWithDiscount, mrmConfig.regime, mrmConfig.mod_pct, mrmConfig.expense_breakdown, tenantTaxRates])

    // EPIC-MRM-V5 (Story 005): extrai cascade_trace, peso/âncora, regime guard dos
    // motor results para alimentar ConsolidatedDREBlock + ResidualDistributionBlock.
    // motorResultsByItem é ARRAY paralelo a budgetItems (mesmo index).
    const epicV5DisplayData = useMemo(() => {
        const itemsForDisplay = budgetItems.map((_, idx) => ({
            tax_breakdown: motorResultsByItem[idx] ?? null,
        }))
        return extractEpicV5DisplayData(itemsForDisplay, {
            regime: mrmConfig.regime,
            csll_pct: mrmConfig.csll_pct,
            irpj_pct: mrmConfig.irpj_pct,
        })
    }, [budgetItems, motorResultsByItem, mrmConfig.regime, mrmConfig.csll_pct, mrmConfig.irpj_pct])

    // ── Salvar orçamento ──
    const handleSave = async () => {
        try {
            await form.validateFields()
            const validItems = budgetItems.filter(i => i.product_id || i.service_id || (i.isManual && i.product_name?.trim()))
            if (validItems.length === 0) {
                messageApi.warning('Adicione pelo menos um produto, serviço ou item manual com descrição.')
                return
            }
            // P0 — Loading guard: rates ainda carregando ou ausentes inflam comissão.
            if (mrmConfig.enabled && !motorReady) {
                messageApi.error('Carregando contexto fiscal. Aguarde alguns segundos e tente novamente.')
                return
            }

            // S19 (EPIC-RR-V4): bloquear save quando algum item tem RRO ≤ 0
            // (motor RR não consegue redistribuir comissão/lucro com residual negativo).
            if (mrmConfig.enabled) {
                const itemsWithBadRRO = motorResultsByItem
                    .map((motor, idx) => motor && motor.rro <= 0 ? { idx, motor } : null)
                    .filter((x): x is { idx: number; motor: NonNullable<typeof motorResultsByItem[number]> } => x != null)
                if (itemsWithBadRRO.length > 0) {
                    const first = itemsWithBadRRO[0]
                    const itemName = budgetItems[first.idx]?.product_name || `Item ${first.idx + 1}`
                    messageApi.error(`Não é possível salvar: o item "${itemName}" está com Resultado Residual Operacional ≤ R$ 0. Reduza o desconto ou revise os custos.`)
                    return
                }
            }

            setSaving(true)

            const values = form.getFieldsValue()
            const tenant_id = tenantId ?? currentUser?.tenant_id
            if (!tenant_id) { messageApi.error('Sessão expirada.'); return }

            const createdBy = currentUser?.uid ?? (await getCurrentUserId())
            if (!createdBy) { messageApi.error('Sessão inválida. Faça login novamente.'); setSaving(false); return }

            let customerId: string | null = values.customer_id || null
            if (!customerId && customerMode === 'manual') {
                const manualName = (values.manual_customer_name || '').trim()
                const manualPhone = (values.manual_customer_phone || '').trim()
                if (!manualName || !manualPhone) {
                    messageApi.error('Informe nome e telefone do cliente ou selecione um cliente cadastrado.')
                    setSaving(false)
                    return
                }
                const { data: newCustomer, error: custErr } = await supabase.from('customers').insert({
                    tenant_id,
                    name: manualName,
                    phone: manualPhone,
                    customer_type: 'PF',
                    status: 'ACTIVE',
                }).select('id').single()
                if (custErr) throw custErr
                customerId = newCustomer.id
            }

            // Epic MRM-V6 (ADR-009): reverte R2 — 3 modos disponíveis em todos os contextos.
            // Persistimos o modo escolhido pelo usuário sem coerção.
            const persistedDiscountModeInsert = discountMode

            // MRM-V3 S1+S2+S3: snapshot context completo via useTenantTaxContext.
            // - regime: tenants.tax_regime real
            // - rates: tax_rates_periods vigentes (effective_date = hoje)
            // - csll_pct/irpj_pct: sincronizados com Formação de Preço via tax-sync.ts (Seção 7 PDF)
            const snapshotCtx: TenantSnapshotContext = {
                regime: mrmConfig.regime,
                rates: mrmConfig.rates,
                csll_pct: mrmConfig.csll_pct,
                irpj_pct: mrmConfig.irpj_pct,
                use_snapshot_rates: mrmConfig.useSnapshotRates,
            }
            const validItemsForInsert = budgetItems
                .filter(i => i.product_id || i.service_id || (i.isManual && i.product_name?.trim()))
            // Story MRM-V2-S3.1: shadow context tagueia divergências por tenant/documento.
            const shadowCtxInsert = { tenant_id, document_type: 'budget' as const }
            // P0 — captura imutável do desconto no momento do save (elimina
            // race entre UI render e submit). hydrateItemSnapshot recebe
            // discount_value real para que o tax_breakdown persistido reflita
            // o desconto aplicado (alinha snapshot com UI).
            const discountPctSnapshot = globalDiscountPercent
            const hydratedItems = validItemsForInsert.map(i => ({
                src: i,
                snap: hydrateItemSnapshot(
                    {
                        unit_price: i.unit_price,
                        quantity: i.quantity,
                        discount_value: i.unit_price * i.quantity * (discountPctSnapshot / 100),
                        commission_pct: (i.commission_percent ?? 0) / 100,
                        profit_pct: (i.profit_percent ?? 0) / 100,
                    },
                    snapshotCtx,
                    shadowCtxInsert,
                ),
            }))

            // MRM S2.3 / V3-S5 — Camada de policy aplica regras de bloqueio/aviso (ADR-004).
            // Só consulta quando o motor V2 está ativo (mrmConfig.enabled) — fora disso,
            // mantém comportamento legado (não temos sinal MRM confiável).
            let requiresReview = false
            if (mrmConfig.enabled) {
                const aggregate = aggregateMotorResults(hydratedItems.map(h => h.snap.tax_breakdown))
                const decision = decideMrmAction({
                    motorResult: aggregate,
                    documentType: 'budget',
                    tenantSettings: mrmConfig.rro_policy ? { rro_policy: mrmConfig.rro_policy } : undefined,
                })
                if (decision.action === 'block_save') {
                    messageApi.error(decision.message)
                    setSaving(false)
                    return
                }
                if (decision.action === 'warn') {
                    const confirmed = await askMrmConfirmation(decision.message)
                    if (!confirmed) {
                        setSaving(false)
                        return
                    }
                    requiresReview = true
                }
            }

            const { data: budget, error } = await (supabase as any).from('budgets').insert({
                tenant_id,
                created_by: createdBy,
                customer_id: customerId,
                employee_id: values.employee_id || null,
                status: 'DRAFT',
                total_value: budgetTotalWithDiscount,
                global_discount_percent: globalDiscountPercent,
                discount_mode: persistedDiscountModeInsert,
                commission_amount: commissionAmount,
                profit_amount: profitAmount,
                engine_version: mrmConfig.enabled ? MRM_ENGINE_VERSION : 'legacy',
                expiration_date: values.expiration_date?.format('YYYY-MM-DD') || null,
                notes: values.notes || null,
                payment_method: values.payment_method || null,
                installment_preset: (values.payment_method === 'BOLETO' || values.payment_method === 'CHEQUE_PRE_DATADO')
                    ? budgetFormInstallmentPreset
                    : null,
                // MRM S2.3: flag persiste para listing badge "Requer revisão"
                requires_review: requiresReview,
            }).select().single()

            if (error) throw error

            const items = hydratedItems.map(({ src: i, snap }) => ({
                budget_id: budget.id,
                product_id: i.product_id || null,
                service_id: i.service_id || null,
                manual_description: (i.isManual || i.isService) ? (i.product_name?.trim() || null) : null,
                quantity: i.quantity,
                unit_price: i.unit_price,
                discount_percent: 0,
                discount: 0,
                commission_pct: snap.commission_pct,
                profit_pct: snap.profit_pct,
                tax_breakdown: snap.tax_breakdown,
            }))

            if (items.length > 0) {
                const { error: itemsErr } = await supabase.from('budget_items').insert(items)
                if (itemsErr) throw itemsErr
            }

            // Salvar parcelas (BOLETO/CHEQUE_PRE_DATADO)
            if (values.payment_method === 'BOLETO' || values.payment_method === 'CHEQUE_PRE_DATADO') {
                const validInstRows = budgetFormCustomInstallments.filter(r => r.date && r.amount > 0)
                if (validInstRows.length > 0) {
                    await (supabase as any).from('budget_installment_rows').insert(
                        validInstRows.map((r, i) => ({
                            budget_id: budget.id,
                            due_date: dayjs(r.date).format('YYYY-MM-DD'),
                            amount: r.amount,
                            sort_order: i,
                        }))
                    )
                }
            }

            messageApi.success('Orçamento criado!')
            await reloadBudgets()
            setDrawerOpen(false)
            form.resetFields()
            setBudgetItems([])
            setGlobalDiscountPercent(0)
            setEditingBudgetId(null)
        } catch (error: any) {
            messageApi.error('Erro: ' + (error.message || 'Preencha os campos.'))
        } finally {
            setSaving(false)
        }
    }

    // ── Atualizar orçamento (edição) ──
    const handleUpdate = async () => {
        if (!editingBudgetId) return
        try {
            await form.validateFields()
            const validItems = budgetItems.filter(i => i.product_id || i.service_id || (i.isManual && i.product_name?.trim()))
            if (validItems.length === 0) {
                messageApi.warning('Adicione pelo menos um produto, serviço ou item manual com descrição.')
                return
            }
            // P0 — Loading guard: idem ao handleSave.
            if (mrmConfig.enabled && !motorReady) {
                messageApi.error('Carregando contexto fiscal. Aguarde alguns segundos e tente novamente.')
                return
            }
            // S19 (EPIC-RR-V4): bloquear update quando algum item tem RRO ≤ 0
            if (mrmConfig.enabled) {
                const itemsWithBadRRO = motorResultsByItem
                    .map((motor, idx) => motor && motor.rro <= 0 ? { idx, motor } : null)
                    .filter((x): x is { idx: number; motor: NonNullable<typeof motorResultsByItem[number]> } => x != null)
                if (itemsWithBadRRO.length > 0) {
                    const first = itemsWithBadRRO[0]
                    const itemName = budgetItems[first.idx]?.product_name || `Item ${first.idx + 1}`
                    messageApi.error(`Não é possível salvar: o item "${itemName}" está com Resultado Residual Operacional ≤ R$ 0. Reduza o desconto ou revise os custos.`)
                    return
                }
            }
            setSaving(true)
            const values = form.getFieldsValue()
            let customerId: string | null = values.customer_id || null
            if (!customerId && customerMode === 'manual' && values.manual_customer_name && values.manual_customer_phone) {
                const manualName = (values.manual_customer_name || '').trim()
                const manualPhone = (values.manual_customer_phone || '').trim()
                if (manualName && manualPhone && tenantId) {
                    const { data: newCustomer, error: custErr } = await supabase.from('customers').insert({
                        tenant_id: tenantId,
                        name: manualName,
                        phone: manualPhone,
                        customer_type: 'PF',
                        status: 'ACTIVE',
                    }).select('id').single()
                    if (custErr) throw custErr
                    customerId = newCustomer.id
                }
            }

            // Epic MRM-V6 (ADR-009): persistimos o modo escolhido pelo usuário sem coerção.
            const persistedDiscountModeUpdate = discountMode

            // MRM-V3 S1+S2+S3: snapshot context na edição com regime/rates/csll/irpj reais.
            const snapshotCtxEdit: TenantSnapshotContext = {
                regime: mrmConfig.regime,
                rates: mrmConfig.rates,
                csll_pct: mrmConfig.csll_pct,
                irpj_pct: mrmConfig.irpj_pct,
                use_snapshot_rates: mrmConfig.useSnapshotRates,
            }
            // Story MRM-V2-S3.1: shadow context na edição inclui document_id.
            const shadowCtxEdit = { tenant_id: tenantId, document_id: editingBudgetId, document_type: 'budget' as const }
            // P0 — captura imutável do desconto (mesmo padrão do insert).
            const discountPctSnapshotEdit = globalDiscountPercent
            const hydratedItemsEdit = validItems.map(i => ({
                src: i,
                snap: hydrateItemSnapshot(
                    {
                        unit_price: i.unit_price,
                        quantity: i.quantity,
                        discount_value: i.unit_price * i.quantity * (discountPctSnapshotEdit / 100),
                        commission_pct: (i.commission_percent ?? 0) / 100,
                        profit_pct: (i.profit_percent ?? 0) / 100,
                    },
                    snapshotCtxEdit,
                    shadowCtxEdit,
                ),
            }))

            // MRM S2.3 — policy gate (ADR-004).
            let requiresReviewUpd = false
            if (mrmConfig.enabled) {
                const aggregateUpd = aggregateMotorResults(hydratedItemsEdit.map(h => h.snap.tax_breakdown))
                const decisionUpd = decideMrmAction({
                    motorResult: aggregateUpd,
                    documentType: 'budget',
                    tenantSettings: mrmConfig.rro_policy ? { rro_policy: mrmConfig.rro_policy } : undefined,
                })
                if (decisionUpd.action === 'block_save') {
                    messageApi.error(decisionUpd.message)
                    setSaving(false)
                    return
                }
                if (decisionUpd.action === 'warn') {
                    const confirmed = await askMrmConfirmation(decisionUpd.message)
                    if (!confirmed) {
                        setSaving(false)
                        return
                    }
                    requiresReviewUpd = true
                }
            }

            const { error } = await (supabase as any).from('budgets').update({
                customer_id: customerId,
                employee_id: values.employee_id || null,
                total_value: budgetTotalWithDiscount,
                global_discount_percent: globalDiscountPercent,
                discount_mode: persistedDiscountModeUpdate,
                commission_amount: commissionAmount,
                profit_amount: profitAmount,
                engine_version: mrmConfig.enabled ? MRM_ENGINE_VERSION : 'legacy',
                expiration_date: values.expiration_date?.format('YYYY-MM-DD') || null,
                notes: values.notes || null,
                payment_method: values.payment_method || null,
                installment_preset: (values.payment_method === 'BOLETO' || values.payment_method === 'CHEQUE_PRE_DATADO')
                    ? budgetFormInstallmentPreset
                    : null,
                updated_at: new Date().toISOString(),
                // MRM S2.3: atualiza flag a cada edição (pode ter saído ou entrado em RRO<=0).
                requires_review: requiresReviewUpd,
            }).eq('id', editingBudgetId)
            if (error) throw error
            await supabase.from('budget_items').delete().eq('budget_id', editingBudgetId)
            const items = hydratedItemsEdit.map(({ src: i, snap }) => ({
                budget_id: editingBudgetId,
                product_id: i.product_id || null,
                service_id: i.service_id || null,
                manual_description: (i.isManual || i.isService) ? (i.product_name?.trim() || null) : null,
                quantity: i.quantity,
                unit_price: i.unit_price,
                discount_percent: 0,
                discount: 0,
                commission_pct: snap.commission_pct,
                profit_pct: snap.profit_pct,
                tax_breakdown: snap.tax_breakdown,
            }))
            if (items.length > 0) {
                const { error: itemsErr } = await supabase.from('budget_items').insert(items)
                if (itemsErr) throw itemsErr
            }

            // Atualizar parcelas (BOLETO/CHEQUE_PRE_DATADO)
            await (supabase as any).from('budget_installment_rows').delete().eq('budget_id', editingBudgetId)
            if (values.payment_method === 'BOLETO' || values.payment_method === 'CHEQUE_PRE_DATADO') {
                const validInstRows = budgetFormCustomInstallments.filter(r => r.date && r.amount > 0)
                if (validInstRows.length > 0) {
                    await (supabase as any).from('budget_installment_rows').insert(
                        validInstRows.map((r, i) => ({
                            budget_id: editingBudgetId,
                            due_date: dayjs(r.date).format('YYYY-MM-DD'),
                            amount: r.amount,
                            sort_order: i,
                        }))
                    )
                }
            }

            messageApi.success('Orçamento atualizado!')
            await reloadBudgets()
            setDrawerOpen(false)
            form.resetFields()
            setBudgetItems([])
            setGlobalDiscountPercent(0)
            setEditingBudgetId(null)
        } catch (error: any) {
            messageApi.error('Erro: ' + (error.message || 'Preencha os campos.'))
        } finally {
            setSaving(false)
        }
    }

    // ── Abrir para edição ──
    const handleEdit = async (record: any) => {
        setEditingBudgetId(record.id)
        setCustomerMode(record.customer_id ? 'existing' : 'manual')

        const [itemsResult, tablesResult] = await Promise.all([
            supabase.from('budget_items').select('*, products(id, name, code, max_discount_percent, commission_table_id, commission_percent, profit_percent, sale_price, cost_total, icms_pct, pis_pct, cofins_pct, iss_pct, ipi_pct, icms_st_pct, difal_pct, fcp_pct, ibs_pct, cbs_pct, iss_retido_pct, irpj_pct, csll_pct), services(id, name, commission_table_id, commission_percent, profit_percent, base_price, cost_total, icms_pct, pis_pct, cofins_pct, iss_pct, ipi_pct, icms_st_pct, difal_pct, fcp_pct, ibs_pct, cbs_pct, iss_retido_pct, irpj_pct, csll_pct), manual_description').eq('budget_id', record.id),
            record.employee_id
                ? (supabase as any).from('employee_commission_tables').select('commission_tables(id, name, type, commission_percent)').eq('employee_id', record.employee_id)
                : Promise.resolve({ data: [] }),
        ])

        const tables = (tablesResult.data || []).map((r: any) => r.commission_tables).filter(Boolean)
        const productTables = tables.filter((t: any) => t.type === 'PRODUCT')
        const serviceTables = tables.filter((t: any) => t.type === 'SERVICE')
        setEmpProductTables(productTables)
        setEmpServiceTables(serviceTables)

        const usedProductTableIds = new Set<string>()
        const usedServiceTableIds = new Set<string>()
        for (const it of (itemsResult.data || [])) {
            if (it.product_id && it.products?.commission_table_id) {
                usedProductTableIds.add(it.products.commission_table_id)
            }
            if (it.service_id && it.services?.commission_table_id) {
                usedServiceTableIds.add(it.services.commission_table_id)
            }
        }
        // Build table sections from tables actually used by items
        const allUsedTableIds = new Set([...usedProductTableIds, ...usedServiceTableIds])
        const usedTables = tables.filter((t: any) => allUsedTableIds.has(t.id))
        const sectionsFromEdit = usedTables.length > 0
            ? usedTables.map((t: any, i: number) => ({key: `ts-edit-${i}`, tableId: t.id}))
            : [{key: 'ts-0', tableId: tables[0]?.id || null}]
        setTableSections(sectionsFromEdit)

        skipTableAutoSelectRef.current = true
        setGlobalDiscountPercent(Number(record.global_discount_percent || 0))
        // MRM D1: ao abrir registro legado com motor ativo, força PROPORTIONAL
        // Epic MRM-V6 (ADR-009): 3 modos disponíveis. Snapshots V5 legacy com
        // discount_mode='MRM' são lidos como PROPORTIONAL (sem recálculo do snapshot).
        const persistedMode = ((record as any).discount_mode as DiscountMode) || 'PROPORTIONAL'
        const normalizedMode: DiscountMode = persistedMode === 'MRM' ? 'PROPORTIONAL' : persistedMode
        setDiscountMode(normalizedMode)

        const allLoadedTables = [...(tablesResult.data || []).map((r: any) => r.commission_tables).filter(Boolean)]
        const rows: BudgetItemRow[] = (itemsResult.data || []).map((it: any, idx: number) => {
            const unitPrice = Number(it.unit_price ?? 0)
            const qty = it.quantity ?? 1
            const isService = !!it.service_id
            const commissionTableId = it.products?.commission_table_id ?? it.services?.commission_table_id ?? null
            const commTable = allLoadedTables.find((t: any) => t.id === commissionTableId)
            const storedCommission = isService ? it.services?.commission_percent : it.products?.commission_percent
            const commissionPercent = (storedCommission != null && Number(storedCommission) > 0)
                ? Number(storedCommission)
                : Number(commTable?.commission_percent || 0)
            // Lê profit_percent do produto/serviço vinculado; fallback para cálculo por custo
            let profitPercent = 0
            if (isService) {
                const stored = it.services?.profit_percent
                if (stored != null && Number(stored) > 0) {
                    profitPercent = Number(stored)
                } else {
                    const basePrice = Number(it.services?.base_price || unitPrice)
                    const costTotal = Number(it.services?.cost_total || 0)
                    profitPercent = basePrice > 0 && costTotal > 0 ? Math.max(0, ((basePrice - costTotal) / basePrice) * 100) : 0
                }
            } else if (it.product_id) {
                const stored = it.products?.profit_percent
                if (stored != null && Number(stored) > 0) {
                    profitPercent = Number(stored)
                } else {
                    const salePrice = Number(it.products?.sale_price || unitPrice)
                    const costTotal = Number(it.products?.cost_total || 0)
                    profitPercent = salePrice > 0 && costTotal > 0 ? Math.max(0, ((salePrice - costTotal) / salePrice) * 100) : 0
                }
            }
            // S8: cost_total alimenta CP do motor RR (RRO = RV − IMP − CP − MOD − DOP)
            const itemCostTotal = isService
                ? Number(it.services?.cost_total || 0)
                : Number(it.products?.cost_total || 0)
            // S11: alíquotas tributárias específicas do item (NULL → fallback tenant)
            const source = isService ? it.services : it.products
            const itemTaxRates: ItemTaxRates | null = source ? {
                icms_pct: source.icms_pct ?? null,
                pis_pct: source.pis_pct ?? null,
                cofins_pct: source.cofins_pct ?? null,
                iss_pct: source.iss_pct ?? null,
                ipi_pct: source.ipi_pct ?? null,
                icms_st_pct: source.icms_st_pct ?? null,
                difal_pct: source.difal_pct ?? null,
                fcp_pct: source.fcp_pct ?? null,
                ibs_pct: source.ibs_pct ?? null,
                cbs_pct: source.cbs_pct ?? null,
                iss_retido_pct: source.iss_retido_pct ?? null,
                irpj_pct: source.irpj_pct ?? null,
                csll_pct: source.csll_pct ?? null,
            } : null
            return {
                key: `edit-${record.id}-${idx}`,
                product_id: it.product_id ?? null,
                service_id: it.service_id ?? null,
                product_name: it.products?.name ?? it.services?.name ?? it.manual_description ?? '',
                quantity: qty,
                unit_price: unitPrice,
                total: unitPrice * qty,
                isManual: !!(it.manual_description && !it.service_id),
                isService,
                commission_table_id: commissionTableId,
                commission_percent: commissionPercent,
                profit_percent: profitPercent,
                cost_total: itemCostTotal,
                item_tax_rates: itemTaxRates,
            }
        })
        setBudgetItems(rows)
        form.setFieldsValue({
            customer_id: record.customer_id || undefined,
            employee_id: record.employee_id || undefined,
            expiration_date: record.expiration_date ? dayjs(record.expiration_date) : undefined,
            notes: record.notes || undefined,
            payment_method: (record as any).payment_method || undefined,
        })
        setBudgetFormInstallmentPreset((record as any).installment_preset || 'customizado')
        setBudgetFormWithEntry(false)
        setBudgetFormBaseDate(record.created_at ? dayjs(record.created_at) : undefined)

        // Carregar parcelas salvas
        const { data: savedInstRows } = await (supabase as any)
            .from('budget_installment_rows')
            .select('due_date, amount, sort_order')
            .eq('budget_id', record.id)
            .order('sort_order')
        if (savedInstRows && savedInstRows.length > 0) {
            setBudgetFormCustomInstallments(savedInstRows.map((r: any) => ({ date: dayjs(r.due_date), amount: r.amount })))
        } else {
            setBudgetFormCustomInstallments([{ date: null, amount: 0 }])
        }

        setDrawerOpen(true)
    }

    // ── Ver detalhes ──
    const handleViewDetail = async (record: any) => {
        setSelectedBudget(record)
        const { data: items } = await supabase
            .from('budget_items')
            .select('*, products(name, code), manual_description')
            .eq('budget_id', record.id)
        setDetailItems(items || [])
        setDetailDrawerOpen(true)
    }

    // ── Avançar status ──
    const handleAdvanceStatus = async (budget: any) => {
        const nextStatus: Record<string, string> = {
            DRAFT: 'SENT',
            SENT: 'APPROVED',
        }
        const next = nextStatus[budget.status]
        if (!next) return

        const { error } = await supabase.from('budgets')
            .update({ status: next, updated_at: new Date().toISOString() })
            .eq('id', budget.id)

        if (error) { messageApi.error('Erro ao atualizar.'); return }

        if (next === 'SENT' && budget.customer_id) {
            const tid = tenantId ?? currentUser?.tenant_id
            const createdBy = currentUser?.uid ?? await getCurrentUserId()
            if (tid && createdBy) {
                await supabase.from('customer_service_history').insert({
                    tenant_id: tid,
                    customer_id: budget.customer_id,
                    budget_id: budget.id,
                    history_type: 'BUDGET_SENT',
                    service_observation: `Orçamento ORC-${budget.id.substring(0, 4).toUpperCase()} enviado — ${formatCurrency(Number(budget.total_value))}`,
                    created_by: createdBy,
                })
            }
        }

        messageApi.success(`Status atualizado para: ${statusConfig[next]?.label}`)
        await reloadBudgets()
        setDetailDrawerOpen(false)
    }

    // ── Enviar para vendas (rascunho → aguardando pagamento, sem enviar ao cliente) ──
    const handleSendToSales = async (budget: any) => {
        const { error } = await supabase.from('budgets')
            .update({ status: 'AWAITING_PAYMENT', updated_at: new Date().toISOString() })
            .eq('id', budget.id)
        if (error) {
            messageApi.error('Erro ao enviar para vendas.')
            return
        }
        messageApi.success('Orçamento enviado para vendas. Status: Aguardando pagamento.')
        await reloadBudgets()
        setDetailDrawerOpen(false)
    }

    // ── Enviar para Pedido (cria order com todo histórico) ──
    const handleSendToOrder = async (budget: any) => {
        if (!tenantId) return
        try {
            // Busca fresca do orçamento para garantir dados atualizados (evita cache SWR desatualizado)
            const { data: freshBudget, error: freshErr } = await (supabase as any)
                .from('budgets')
                .select('*')
                .eq('id', budget.id)
                .single()
            if (freshErr) throw freshErr
            const b = freshBudget || budget

            // Pré-buscar parcelas para obter contagem correta de installments
            const { data: budgetInstRows } = await (supabase as any)
                .from('budget_installment_rows')
                .select('due_date, amount, sort_order')
                .eq('budget_id', b.id)
                .order('sort_order')

            const installmentsCount = (budgetInstRows && budgetInstRows.length > 0)
                ? budgetInstRows.length
                : (b.installments || 1)

            // criar pedido (order_code gerado após insert)
            const { data: order, error: orderErr } = await (supabase as any).from('orders').insert({
                tenant_id: tenantId,
                order_code: `PED-TEMP-${Date.now()}`, // será atualizado logo abaixo
                customer_id: b.customer_id,
                employee_id: b.employee_id || null,
                budget_id: b.id,
                original_budget_id: b.id,
                status: 'DRAFT',
                total_value: b.total_value || 0,
                // MRM-V2-S2.1: coage modos legacy do budget pai → PROPORTIONAL ao copiar para o pedido.
                discount_mode: coerceLegacyDiscountMode(b.discount_mode || null, { tenant_id: tenantId, document_id: b.id, surface: 'order' }),
                discount_value: b.discount_value || null,
                discount_percent: b.discount_percent || b.global_discount_percent || null,
                payment_method: b.payment_method || null,
                installments: installmentsCount,
                notes: b.notes || null,
                created_by: currentUser?.uid || null,
            }).select('id').single()

            if (orderErr) throw orderErr

            if (order?.id) {
                const orderCode = `PED-${order.id.slice(0, 6).toUpperCase()}`
                await (supabase as any).from('orders').update({ order_code: orderCode }).eq('id', order.id)

                // copiar budget_items → order_items
                const { data: budgetItems } = await (supabase as any)
                    .from('budget_items')
                    .select('product_id, service_id, quantity, unit_price, manual_description')
                    .eq('budget_id', b.id)

                if (budgetItems && budgetItems.length > 0) {
                    // Items mantêm unit_price ORIGINAL — o desconto é preservado em
                    // orders.discount_percent e aplicado no cálculo de total_value.
                    // Isto permite que o usuário veja/edite o desconto no pedido sem
                    // perder a granularidade dos preços originais dos itens.
                    const toInsert = budgetItems.map((bi: any) => ({
                        order_id: order.id,
                        product_id: bi.product_id || null,
                        service_id: bi.service_id || null,
                        quantity: bi.quantity || 0,
                        unit_price: bi.unit_price || 0,
                        total_price: (bi.quantity || 0) * (bi.unit_price || 0),
                        manual_description: bi.manual_description || null,
                    }))
                    await (supabase as any).from('order_items').insert(toInsert)
                }

                // Copiar parcelas do orçamento para o pedido (reutiliza busca acima)
                if (budgetInstRows && budgetInstRows.length > 0) {
                    await (supabase as any).from('order_installment_rows').insert(
                        budgetInstRows.map((r: any) => ({
                            order_id: order.id,
                            due_date: r.due_date,
                            amount: r.amount,
                            sort_order: r.sort_order,
                        }))
                    )
                }

                await supabase.from('budgets')
                    .update({ status: 'SENT_TO_ORDER', updated_at: new Date().toISOString() })
                    .eq('id', b.id)
            }

            messageApi.success('Orçamento enviado para Pedido com sucesso!')
            await reloadBudgets()
            setDetailDrawerOpen(false)
        } catch (err: any) {
            console.error(err)
            messageApi.error('Erro ao enviar para pedido: ' + (err?.message || 'desconhecido'))
        }
    }

    // ── Abrir modal de pagamento (só se orçamento ainda não foi pago por outra pessoa) ──
    const handleOpenPayment = async (budget: any) => {
        const { data: fresh } = await supabase
            .from('budgets')
            .select('id, status, total_value, customer_id, employee_id, commission_amount, profit_amount, payment_method, installments, installment_preset, global_discount_percent, customer:customers(name)')
            .eq('id', budget.id)
            .single()
        if (fresh?.status === 'PAID') {
            messageApi.info('Este orçamento já foi finalizado e o pagamento lançado.')
            await reloadBudgets()
            return
        }
        const budgetData = fresh || budget
        setSelectedBudget(budgetData)
        paymentForm.resetFields()
        paymentForm.setFieldsValue({
            installments: (budgetData as any).installments || 1,
            payment_method: (budgetData as any).payment_method || undefined,
        })
        setAttachFile(null)
        setAttachDesc('')

        // Pré-popular parcelas salvas no orçamento
        const { data: instRows } = await (supabase as any)
            .from('budget_installment_rows')
            .select('due_date, amount, sort_order')
            .eq('budget_id', budgetData.id)
            .order('sort_order')
        if (instRows && instRows.length > 0) {
            setCustomInstallments(instRows.map((r: any) => ({ date: dayjs(r.due_date), amount: r.amount })))
            setInstallmentPreset((budgetData as any).installment_preset || 'customizado')
        } else {
            setCustomInstallments([{ date: null, amount: 0 }])
            setInstallmentPreset('customizado')
        }

        setPaymentModalOpen(true)
    }

    // ── Finalizar pagamento (Orçamento → Venda) — apenas uma vez; quem finalizar primeiro vence ──
    const handleFinalizeBudget = async () => {
        try {
            const values = await paymentForm.validateFields()
            const tenant_id = tenantId ?? currentUser?.tenant_id
            if (!tenant_id || !selectedBudget) return
            const createdBy = currentUser?.uid ?? await getCurrentUserId()
            if (!createdBy) {
                messageApi.error('Sessão inválida. Faça login novamente.')
                return
            }

            if (values.payment_method === 'LANCAMENTOS_A_RECEBER' && !selectedBudget.customer_id) {
                messageApi.error('O método "Lançamentos a Receber" exige um cliente vinculado ao orçamento.')
                return
            }

            const { data: budgetCheck } = await supabase.from('budgets').select('id, status').eq('id', selectedBudget.id).single()
            if (budgetCheck?.status === 'PAID') {
                messageApi.warning('Este orçamento já foi finalizado por outra pessoa. Atualize a lista.')
                setPaymentModalOpen(false)
                await reloadBudgets()
                return
            }

            // 1) Criar venda
            const { data: sale, error: saleErr } = await (supabase as any).from('sales').insert({
                tenant_id,
                created_by: createdBy,
                product_id: null,
                budget_id: selectedBudget.id,
                customer_id: selectedBudget.customer_id || null,
                employee_id: selectedBudget.employee_id || null,
                quantity: 1,
                unit_price: Number(selectedBudget.total_value),
                final_value: Number(selectedBudget.total_value),
                payment_method: values.payment_method,
                installments: values.installments || 1,
                description: `Venda via orçamento ORC-${selectedBudget.id.substring(0, 4).toUpperCase()}`,
                sale_date: new Date().toISOString(),
                sale_type: 'FROM_BUDGET',
                status: 'COMPLETED',
                commission_amount: Number(selectedBudget.commission_amount || 0),
                profit_amount: Number(selectedBudget.profit_amount || 0),
            }).select().single()

            if (saleErr) throw saleErr

            // Vincular pedido (se houver) à venda recém-criada — necessário para a RPC
            // cancel_sale_cascade conseguir reabrir o pedido em caso de cancelamento.
            await (supabase as any)
                .from('orders')
                .update({ status: 'PAID', sale_id: sale.id, updated_at: new Date().toISOString() })
                .eq('budget_id', selectedBudget.id)
                .eq('tenant_id', tenant_id)
                .neq('status', 'PAID')

            // 2) Copiar itens do orçamento para sale_items
            const { data: bItems } = await supabase
                .from('budget_items')
                .select('*')
                .eq('budget_id', selectedBudget.id)

            if (bItems && bItems.length > 0) {
                const rawSaleItems = bItems.map((bi: any) => ({
                    sale_id: sale.id,
                    product_id: bi.product_id,
                    quantity: bi.quantity,
                    unit_price: bi.unit_price,
                    discount: bi.discount || 0,
                }))
                // Distribui o desconto global do orçamento proporcionalmente entre os itens
                const saleItems = distributeDiscountToItems(rawSaleItems, Number(selectedBudget.total_value))
                await supabase.from('sale_items').insert(saleItems)

                // 3) Descontar estoque dos produtos vendidos
                for (const bi of bItems) {
                    const { data: ps } = await supabase
                        .from('stock')
                        .select('id, quantity_current')
                        .eq('product_id', bi.product_id)
                        .eq('stock_type', 'PRODUCT')
                        .single()

                    if (ps) {
                        const newQty = Math.max(0, (ps.quantity_current || 0) - bi.quantity)
                        await supabase.from('stock')
                            .update({ quantity_current: newQty, updated_at: new Date().toISOString() })
                            .eq('id', ps.id)
                        await supabase.from('stock_movements').insert({
                            stock_id: ps.id,
                            delta_quantity: -bi.quantity,
                            reason: `Venda via orçamento ORC-${selectedBudget.id.substring(0, 4).toUpperCase()}`,
                            created_by: createdBy,
                        })
                    }
                }
            }

            // 4) Lançar no fluxo de caixa — cartão: receita nunca no mês atual (parcelas ou 1x no próximo mês)
            const numInstallments = values.installments || 1
            const now = new Date()
            const curYear = now.getFullYear()
            const curMonth = now.getMonth()
            if (values.payment_method === 'LANCAMENTOS_A_RECEBER') {
                // Lançamentos a Receber: não vai para o caixa — registra em pending_receivables
                await (supabase as any).from('pending_receivables').insert({
                    tenant_id,
                    customer_id: selectedBudget.customer_id,
                    employee_id: selectedBudget.employee_id || null,
                    sale_id: sale.id,
                    budget_id: selectedBudget.id,
                    amount: Number(selectedBudget.total_value),
                    description: `Venda via orçamento ORC-${selectedBudget.id.substring(0, 4).toUpperCase()}`,
                    launch_date: dayjs().format('YYYY-MM-DD'),
                    origin_type: 'BUDGET',
                    status: 'PENDING',
                    created_by: createdBy,
                })
            } else if (values.payment_method === 'CHEQUE_PRE_DATADO' || values.payment_method === 'BOLETO') {
                const validInstallments = customInstallments.filter(r => r.date && r.amount > 0)
                if (validInstallments.length === 0) {
                    messageApi.error('Informe ao menos uma data e valor de recebimento.')
                    setSaving(false)
                    return
                }
                const payLabelOrc = PAYMENT_METHODS.find(p => p.value === values.payment_method)?.label || values.payment_method
                const boletoEntries = validInstallments.map((inst, idx) => ({
                    tenant_id,
                    type: 'INCOME',
                    amount: inst.amount,
                    due_date: inst.date.format('YYYY-MM-DD'),
                    description: validInstallments.length > 1
                        ? `Venda: ORC-${selectedBudget.id.substring(0, 4).toUpperCase()} — ${payLabelOrc} (${idx + 1}/${validInstallments.length})`
                        : `Venda: ORC-${selectedBudget.id.substring(0, 4).toUpperCase()} — ${payLabelOrc}`,
                    payment_method: values.payment_method,
                    origin_type: 'SALE',
                    origin_id: sale.id,
                    created_by: createdBy,
                }))
                await (supabase as any).from('cash_entries').insert(boletoEntries)
            } else if (values.payment_method === 'CARTAO_CREDITO') {
                const totalValue = Number(selectedBudget.total_value)
                const amountPerInstallment = totalValue / numInstallments
                const installmentEntries = []
                for (let i = 1; i <= numInstallments; i++) {
                    const dueDate = new Date(curYear, curMonth + i, 1)
                    installmentEntries.push({
                        tenant_id,
                        type: 'INCOME',
                        amount: amountPerInstallment,
                        due_date: dayjs(dueDate).format('YYYY-MM-DD'),
                        description: numInstallments > 1
                            ? `Venda: ORC-${selectedBudget.id.substring(0, 4).toUpperCase()} — ${values.payment_method} (${i}/${numInstallments})`
                            : `Venda: ORC-${selectedBudget.id.substring(0, 4).toUpperCase()} — ${values.payment_method}`,
                        payment_method: values.payment_method,
                        origin_type: 'SALE',
                        origin_id: sale.id,
                        ...(numInstallments > 1 ? { installment_number: i, installment_total: numInstallments } : {}),
                        created_by: createdBy,
                    })
                }
                await supabase.from('cash_entries').insert(installmentEntries)
            } else {
                await supabase.from('cash_entries').insert({
                    tenant_id,
                    type: 'INCOME',
                    amount: Number(selectedBudget.total_value),
                    due_date: dayjs().format('YYYY-MM-DD'),
                    paid_date: dayjs().format('YYYY-MM-DD'),
                    description: `Venda: ORC-${selectedBudget.id.substring(0, 4).toUpperCase()} — ${values.payment_method}${numInstallments > 1 ? ` (${numInstallments}x)` : ''}`,
                    payment_method: values.payment_method,
                    created_by: createdBy,
                })
            }

            // 5) Atualizar orçamento como PAID (só se ainda não foi pago — evita duplo lançamento)
            const { data: updatedBudget } = await supabase.from('budgets').update({
                status: 'PAID',
                payment_method: values.payment_method,
                installments: values.installments || 1,
                paid_date: dayjs().format('YYYY-MM-DD'),
                sale_id: sale.id,
                updated_at: new Date().toISOString(),
            }).eq('id', selectedBudget.id).neq('status', 'PAID').select('id').single()
            if (!updatedBudget) {
                await supabase.from('cash_entries').update({ is_active: false }).eq('origin_type', 'SALE').eq('origin_id', sale.id)
                if (bItems?.length) {
                    for (const bi of bItems) {
                        const { data: ps } = await supabase.from('stock').select('id, quantity_current').eq('product_id', bi.product_id).eq('stock_type', 'PRODUCT').single()
                        if (ps) {
                            await supabase.from('stock').update({ quantity_current: (ps.quantity_current || 0) + bi.quantity, updated_at: new Date().toISOString() }).eq('id', ps.id)
                            await supabase.from('stock_movements').insert({ stock_id: ps.id, delta_quantity: bi.quantity, reason: 'Rollback: orçamento já finalizado por outra pessoa', created_by: createdBy })
                        }
                    }
                }
                await supabase.from('sale_items').delete().eq('sale_id', sale.id)
                await supabase.from('sales').update({ is_active: false }).eq('id', sale.id)
                messageApi.warning('Este orçamento já foi finalizado por outra pessoa. Nenhuma alteração foi mantida.')
                setPaymentModalOpen(false)
                await reloadBudgets()
                return
            }

            if (attachFile && selectedBudget.customer_id) {
                const ext = attachFile.name.split('.').pop() || 'bin'
                const filePath = `${tenant_id}/customers/${selectedBudget.customer_id}/${crypto.randomUUID()}.${ext}`
                const { error: uploadErr } = await supabase.storage.from('comprovantes').upload(filePath, attachFile)
                if (!uploadErr) {
                    await supabase.from('customer_attachments').insert({
                        tenant_id,
                        customer_id: selectedBudget.customer_id,
                        origin_type: 'BUDGET',
                        origin_id: selectedBudget.id,
                        file_path: filePath,
                        file_name: attachFile.name,
                        file_size: attachFile.size,
                        mime_type: attachFile.type,
                        description: attachDesc || null,
                        created_by: createdBy,
                    })
                }
            }

            if (selectedBudget.customer_id) {
                await supabase.from('customer_service_history').insert({
                    tenant_id,
                    customer_id: selectedBudget.customer_id,
                    budget_id: selectedBudget.id,
                    history_type: 'BUDGET_SENT',
                    service_observation: `Orçamento ORC-${selectedBudget.id.substring(0, 4).toUpperCase()} finalizado — ${formatCurrency(Number(selectedBudget.total_value))}`,
                    created_by: createdBy,
                })
            }

            // Customer-level recurrence — any sale resets/creates a dispatch based on customer.recurrence_days
            if (selectedBudget.customer_id) {
                await syncCustomerRecurrenceOnSale({
                    supabase,
                    tenantId: tenant_id,
                    customerId: selectedBudget.customer_id,
                    saleId: sale.id,
                    saleDate: dayjs().format('YYYY-MM-DD'),
                    userId: createdBy,
                })
            }

            messageApi.success('🎉 Orçamento finalizado! Venda registrada, estoque atualizado e lançamento no caixa criado.')
            setPaymentModalOpen(false)
            setDetailDrawerOpen(false)
            await reloadBudgets()
        } catch (error: any) {
            messageApi.error('Erro ao finalizar: ' + (error.message || 'Preencha os campos.'))
        }
    }

    // ── Enviar orçamento via WhatsApp (PDF em anexo) ──
    const handleSendWhatsApp = async (budget: any) => {
        try {
            setSendingWaId(budget.id)

            const customerPhone = budget.customer?.whatsapp_phone || budget.customer?.phone
            if (!customerPhone) {
                setSendingWaId(null)
                messageApi.warning('Cliente sem número de telefone cadastrado.')
                return
            }

            const res = await fetch(`/api/orcamentos/${budget.id}/send-whatsapp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })

            if (res.ok) {
                messageApi.success('📲 Orçamento enviado (PDF + mensagem)!')
                await reloadBudgets()
                setSendingWaId(null)
                return
            }

            const err = await res.json().catch(() => ({}))
            if (res.status === 429) {
                const sec = typeof (err as any).retry_after_seconds === 'number' ? (err as any).retry_after_seconds : 60
                setWaThrottleSecondsLeft(sec)
                messageApi.warning((err as any).error || `Aguarde ${sec}s entre envios.`)
                setSendingWaId(null)
                return
            }
            if (res.status === 409 || res.status === 400) {
                const phone = customerPhone.replace(/\D/g, '')
                const waNum = (phone.length <= 11 ? '55' + phone : phone).replace(/\D/g, '')
                const waUrl = `https://api.whatsapp.com/send?phone=${waNum}&text=${encodeURIComponent('Segue em anexo seu orçamento. (Envie pelo app para enviar o PDF.)')}`
                window.open(waUrl, '_blank')
                messageApi.info('WhatsApp não conectado. Abrindo WhatsApp Web para você enviar manualmente.')
                setSendingWaId(null)
                return
            }

            const budgetCode = budget?.id ? `ORC-${String(budget.id).substring(0, 4).toUpperCase()}` : ''
            messageApi.error(budgetCode ? `[${budgetCode}] ${(err as any).error || 'Falha ao enviar orçamento.'}` : (err as any).error || 'Falha ao enviar orçamento.')
        } catch (error: any) {
            const budgetCode = budget?.id ? `ORC-${String(budget.id).substring(0, 4).toUpperCase()}` : ''
            messageApi.error(budgetCode ? `[${budgetCode}] Erro ao enviar: ${error.message || 'Tente novamente.'}` : 'Erro ao enviar: ' + (error.message || 'Tente novamente.'))
        } finally {
            setSendingWaId(null)
        }
    }

    // ── Delete ──
    const handleDelete = async (id: string) => {
        try {
            const res = await fetch('/api/delete/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            const result = await res.json()
            if (res.status === 409) {
                modalApi.warning({
                    title: 'Não é possível excluir',
                    content: result.error || 'Esta venda já recebeu pagamento.',
                })
                return
            }
            if (!res.ok) throw new Error(result.error || 'Erro ao excluir')
            const aff = result.affected || {}
            const orders = aff.orders_cascaded || 0
            const directSale = aff.direct_sale_cancelled
            const parts = ['Orçamento excluído.']
            if (orders > 0) parts.push(`${orders} pedido(s) cancelado(s).`)
            if (directSale) parts.push('Venda vinculada cancelada.')
            messageApi.success(parts.join(' '))
            await reloadBudgets()
        } catch (error: any) {
            messageApi.error(error.message || 'Erro ao excluir orçamento')
        }
    }

    // Pré-busca vínculos e abre modal contextual antes de excluir
    const confirmDeleteBudget = async (record: any) => {
        console.log('[Excluir orçamento] click', record?.id)
        try {
            const [ordersRes, directSaleRes] = await Promise.all([
                (supabase as any)
                    .from('orders')
                    .select('id, order_code, status, sale_id')
                    .eq('original_budget_id', record.id)
                    .eq('is_active', true),
                (supabase as any)
                    .from('sales')
                    .select('id, sale_code, final_value, status')
                    .eq('budget_id', record.id)
                    .eq('is_active', true),
            ])
            const linkedOrders = (ordersRes.data || []) as Array<any>
            const linkedSales = (directSaleRes.data || []) as Array<any>
            const orderHasSale = linkedOrders.some((o) => !!o.sale_id)
            const cascadeMsg: string[] = []
            if (linkedOrders.length > 0) {
                cascadeMsg.push(`${linkedOrders.length} pedido(s) vinculado(s) será(ão) cancelado(s).`)
            }
            if (orderHasSale) {
                cascadeMsg.push('A venda do pedido também será cancelada (estoque/caixa serão estornados).')
            }
            const directSalesNotInOrders = linkedSales.filter(
                (s: any) => !linkedOrders.some((o) => o.sale_id === s.id),
            )
            if (directSalesNotInOrders.length > 0) {
                cascadeMsg.push(`${directSalesNotInOrders.length} venda(s) direta(s) será(ão) cancelada(s).`)
            }
            const isCascade = cascadeMsg.length > 0
            modalApi.confirm({
                title: isCascade ? 'Excluir orçamento (cascata)' : 'Excluir orçamento?',
                content: isCascade ? (
                    <div>
                        <p style={{ marginBottom: 8 }}>Esta ação afeta outros registros:</p>
                        <ul style={{ paddingLeft: 20 }}>
                            {cascadeMsg.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                        <p style={{ marginTop: 12, color: '#dc2626', fontWeight: 500 }}>
                            Esta ação não pode ser desfeita.
                        </p>
                    </div>
                ) : 'Esta ação não pode ser desfeita.',
                okText: 'Sim, excluir',
                cancelText: 'Cancelar',
                okButtonProps: { danger: true },
                width: isCascade ? 480 : undefined,
                onOk: () => handleDelete(record.id),
            })
        } catch (e: any) {
            messageApi.error('Erro ao verificar vínculos: ' + (e?.message || ''))
        }
    }

    // ── Search ──
    const handleSearch = (value: string) => {
        setSearchText(value)
    }

    const uniqueClients = useMemo(() => {
        const names = new Map<string, string>()
        budgets.forEach(b => {
            const n = b.customer?.name || 'Sem cliente'
            if (n) names.set(n, n)
        })
        return Array.from(names.entries()).map(([value, text]) => ({ text, value }))
    }, [budgets])

    const dateFilterOptions = useMemo(() => {
        const set = new Set<string>()
        budgets.forEach(b => {
            const d = new Date(b.created_at).toLocaleDateString('pt-BR')
            set.add(d)
        })
        return Array.from(set).sort().map(d => ({ text: d, value: d }))
    }, [budgets])

    const columns: ColumnsType<any> = [
        {
            title: 'Número orçamento',
            key: 'number',
            width: 130,
            filters: budgets.slice(0, 30).map(r => ({ text: `ORC-${r.id.substring(0, 4).toUpperCase()}`, value: r.id })),
            onFilter: (value, record) => record.id === value,
            render: (_, r) => <span style={{ fontWeight: 600, color: 'var(--color-primary-700)' }}>ORC-{r.id.substring(0, 4).toUpperCase()}</span>,
        },
        {
            title: 'Cliente',
            key: 'client',
            sorter: (a, b) => (a.customer?.name || '').localeCompare(b.customer?.name || ''),
            filters: uniqueClients,
            onFilter: (value, record) => (record.customer?.name || 'Sem cliente') === value,
            render: (_, r) => r.customer?.name || 'Sem cliente',
        },
        {
            title: 'Data',
            key: 'date',
            render: (_, r) => new Date(r.created_at).toLocaleDateString('pt-BR'),
            sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            defaultSortOrder: 'descend',
            filters: dateFilterOptions,
            onFilter: (value, record) => new Date(record.created_at).toLocaleDateString('pt-BR') === value,
        },
        {
            title: 'Valor Total',
            key: 'total',
            render: (_, r) => <span style={{ fontWeight: 600 }}>{formatCurrency(Number(r.total_value || 0))}</span>,
            sorter: (a, b) => Number(a.total_value) - Number(b.total_value),
            filters: [
                { text: 'Até R$ 100', value: '0-100' },
                { text: 'R$ 100 - R$ 500', value: '100-500' },
                { text: 'R$ 500 - R$ 1.000', value: '500-1000' },
                { text: 'Acima de R$ 1.000', value: '1000+' },
            ],
            onFilter: (value, record) => {
                const v = Number(record.total_value || 0)
                if (value === '0-100') return v <= 100
                if (value === '100-500') return v > 100 && v <= 500
                if (value === '500-1000') return v > 500 && v <= 1000
                if (value === '1000+') return v > 1000
                return false
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            filters: Object.entries(statusConfig).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value, record) => record.status === value,
            render: (status: string, record: any) => {
                const cfg = statusConfig[status] || { color: 'default', label: status }
                return (
                    <span>
                        <Tag color={cfg.color}>{cfg.label}</Tag>
                        {/* MRM S2.3 — badge "Requer revisão" quando policy marcou RRO ≤ 0 */}
                        {record?.requires_review === true && <RequiresReviewBadge />}
                    </span>
                )
            },
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 320,
            filters: [
                { text: 'Com Editar', value: 'edit' },
                { text: 'Com Enviar WhatsApp', value: 'send' },
                { text: 'Com Excluir', value: 'delete' },
            ],
            onFilter: (value, record) => {
                if (value === 'edit') return true
                if (value === 'send') return !!(record.customer?.whatsapp_phone || record.customer?.phone)
                if (value === 'delete') return record.status !== 'CANCELLED'
                return false
            },
            render: (_, record) => (
                <Space wrap>
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>Editar</Button>
                    <Button type="link" size="small" onClick={() => handleViewDetail(record)}>Ver</Button>
                    <Button
                        type="link"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={() => handleSendWhatsApp(record)}
                        loading={sendingWaId === record.id}
                        disabled={waThrottleSecondsLeft > 0}
                        title={waThrottleSecondsLeft > 0 ? `Aguarde ${waThrottleSecondsLeft}s entre envios` : undefined}
                    >
                        {waThrottleSecondsLeft > 0 ? `Enviar via WhatsApp (${waThrottleSecondsLeft}s)` : 'Enviar via WhatsApp'}
                    </Button>
                    {record.status === 'DRAFT' && (
                        <Popconfirm
                            title="Enviar para vendas?"
                            description="O orçamento irá para o status 'Aguardando pagamento' sem notificar o cliente."
                            okText="Enviar"
                            cancelText="Cancelar"
                            onConfirm={() => handleSendToSales(record)}
                        >
                            <Button
                                type="link"
                                size="small"
                                icon={<ShoppingCartOutlined />}
                                style={{ color: '#12B76A' }}
                                title="Enviar para vendas (aguardando pagamento), sem enviar ao cliente"
                            >
                                Enviar para vendas
                            </Button>
                        </Popconfirm>
                    )}
                    {record.status === 'DRAFT' && (
                        <Popconfirm
                            title="Enviar para pedido?"
                            description="Um pedido será criado a partir deste orçamento, com todos os itens e dados."
                            okText="Sim, enviar"
                            cancelText="Não"
                            onConfirm={() => handleSendToOrder(record)}
                        >
                            <Button
                                type="link"
                                size="small"
                                icon={<ShoppingCartOutlined />}
                                style={{ color: '#2563eb' }}
                                title="Enviar para pedido"
                            >
                                Enviar para Pedido
                            </Button>
                        </Popconfirm>
                    )}
                    {(record.status === 'APPROVED' || record.status === 'AWAITING_PAYMENT') && (
                        <Button type="link" size="small" style={{ color: '#12B76A' }} onClick={() => handleOpenPayment(record)}>
                            Finalizar
                        </Button>
                    )}
                    {record.status !== 'CANCELLED' && (
                        <Button
                            type="link"
                            size="small"
                            danger
                            onClick={() => confirmDeleteBudget(record)}
                        >
                            Excluir
                        </Button>
                    )}
                </Space>
            ),
        },
    ]

    // ── Colunas dos itens no orçamento ──
    const itemColumns: ColumnsType<BudgetItemRow> = [
        {
            title: 'Produto / Serviço / Descrição',
            key: 'product',
            render: (_, record) => {
                const rowProds = record.commission_table_id
                    ? (products as any[]).filter((p: any) => p.commission_table_id === record.commission_table_id)
                    : (products as any[])
                const rowSvcs = record.commission_table_id
                    ? (services as any[]).filter((s: any) => s.commission_table_id === record.commission_table_id)
                    : (services as any[])
                return record.isManual ? (
                    <Input
                        placeholder="Descreva o item manualmente"
                        value={record.product_name}
                        onChange={(e) => handleManualDescriptionChange(record.key, e.target.value)}
                        style={{ width: '100%' }}
                    />
                ) : record.isService ? (
                    <Select
                        placeholder="Selecione o serviço"
                        showSearch
                        optionFilterProp="children"
                        style={{ width: '100%' }}
                        value={record.service_id || undefined}
                        onChange={(v) => handleServiceSelect(record.key, v)}
                    >
                        {rowSvcs.map((s: any) => (
                            <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
                        ))}
                    </Select>
                ) : (
                    <Select
                        placeholder="Selecione o produto"
                        showSearch
                        optionFilterProp="children"
                        style={{ width: '100%' }}
                        value={record.product_id || undefined}
                        onChange={(v) => handleProductSelect(record.key, v)}
                    >
                        {rowProds.map((p: any) => (
                            <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                        ))}
                    </Select>
                )
            },
        },
        {
            title: 'Qtd',
            key: 'qty',
            width: 72,
            render: (_, record) => (
                <InputNumber min={1} value={record.quantity} onChange={(v) => handleItemChange(record.key, 'quantity', v || 1)} style={{ width: '100%' }} />
            ),
        },
        {
            title: 'Preço un.',
            key: 'price',
            width: 170,
            render: (_, record) => (
                <CurrencyInput
                    min={0}
                    value={record.unit_price}
                    onChange={(v) => handleItemChange(record.key, 'unit_price', v)}
                    style={{ width: '100%' }}
                />
            ),
        },
        {
            title: 'Total',
            key: 'total',
            width: 140,
            render: (_, record) => <strong>{formatCurrency(getItemTotalWithCommission(record))}</strong>,
        },
        {
            title: '',
            key: 'delete',
            width: 40,
            render: (_, record) => (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(record.key)} size="small" />
            ),
        },
    ]

    return (
        <Layout title={PAGE_TITLES.BUDGETS} subtitle="Pipeline comercial — do orçamento à venda">
            {contextHolder}
            {/* MRM S2.3 — modal de aviso RRO ≤ 0 (warn flow). */}
            <RROWarningModal
                open={mrmWarnOpen}
                message={mrmWarnMessage}
                loading={saving}
                onContinue={() => pendingMrmConfirmRef.current?.(true)}
                onCancel={() => pendingMrmConfirmRef.current?.(false)}
            />

            <div className="kpi-grid">
                <CardKPI title="Total Orçamentos" value={totalBudgets} icon={<FileTextOutlined />} variant="blue" />
                <CardKPI title="Pendentes" value={pendingBudgets} icon={<ClockCircleOutlined />} variant="orange" />
                <CardKPI title="Finalizados" value={paidBudgets} icon={<CheckCircleOutlined />} variant="green" />
                <CardKPI title="Valor Pipeline" value={formatCurrency(totalValue)} icon={<DollarOutlined />} variant="green" />
            </div>

            {/* Indicadores de status */}
            <div className="pc-card" style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'var(--color-neutral-50)', borderRadius: 8, minWidth: 140 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Rascunho</span>
                    <strong style={{ fontSize: 20, color: 'var(--color-neutral-800)' }}>{budgets.filter(b => b.status === 'DRAFT').length}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'var(--color-neutral-50)', borderRadius: 8, minWidth: 140 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Enviado</span>
                    <strong style={{ fontSize: 20, color: '#1890ff' }}>{budgets.filter(b => b.status === 'SENT' || b.status === 'APPROVED').length}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'var(--color-neutral-50)', borderRadius: 8, minWidth: 140 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Aguardando pagamento</span>
                    <strong style={{ fontSize: 20, color: '#fa8c16' }}>{awaitingPaymentCount}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'var(--color-neutral-50)', borderRadius: 8, minWidth: 140 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Pago</span>
                    <strong style={{ fontSize: 20, color: '#52c41a' }}>{budgets.filter(b => b.status === 'PAID').length}</strong>
                </div>
            </div>

            {/* Tabela */}
            <div className="pc-card--table">
                <div className="filter-bar">
                    <Input
                        placeholder="Buscar por cliente..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{ maxWidth: 360 }}
                        allowClear
                    />
                    <div style={{ flex: 1 }} />
                    <Button icon={<UnorderedListOutlined />} onClick={openProdBudgetDrawer}>
                        Ver produtos em orçamentos
                    </Button>
                    {canEdit(MODULES.BUDGETS) && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setBudgetItems([]); setGlobalDiscountPercent(0); setDiscountMode('PROPORTIONAL'); setEditingBudgetId(null); setBudgetFormInstallmentPreset('customizado'); setBudgetFormCustomInstallments([{ date: null, amount: 0 }]); setBudgetFormWithEntry(false); setBudgetFormBaseDate(undefined); setDrawerOpen(true) }}>
                            Novo Orçamento
                        </Button>
                    )}
                </div>
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    pagination={{ pageSize: 10, showTotal: (t) => `${t} orçamentos` }}
                    size="middle"
                    loading={isLoading}
                    components={{ header: { cell: TableHeaderCell } }}
                />
            </div>

            {/* ── Drawer: Criar / Editar Orçamento ── */}
            <Drawer
                title={editingBudgetId ? 'Editar Orçamento' : 'Novo Orçamento'}
                width={680}
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); setEditingBudgetId(null); form.resetFields(); setBudgetItems([]); setGlobalDiscountPercent(0); setDiscountMode('PROPORTIONAL'); setTableSections([{key: 'ts-0', tableId: null}]); setEmpProductTables([]); setEmpServiceTables([]); setBudgetFormInstallmentPreset('customizado'); setBudgetFormCustomInstallments([{ date: null, amount: 0 }]); setBudgetFormWithEntry(false); setBudgetFormBaseDate(undefined) }}
                extra={
                    <Space>
                        <Button onClick={() => { setDrawerOpen(false); setEditingBudgetId(null); form.resetFields(); setBudgetItems([]); setGlobalDiscountPercent(0); setDiscountMode('PROPORTIONAL'); setTableSections([{key: 'ts-0', tableId: null}]); setEmpProductTables([]); setEmpServiceTables([]); setBudgetFormInstallmentPreset('customizado'); setBudgetFormCustomInstallments([{ date: null, amount: 0 }]); setBudgetFormWithEntry(false); setBudgetFormBaseDate(undefined) }}>Cancelar</Button>
                        <Button
                            onClick={editingBudgetId ? handleUpdate : handleSave}
                            type="primary"
                            loading={saving || (mrmConfig.enabled && !motorReady)}
                            disabled={mrmConfig.enabled && !motorReady}
                            title={mrmConfig.enabled && !motorReady ? 'Carregando contexto fiscal...' : ''}
                        >
                            {editingBudgetId ? 'Salvar alterações' : 'Criar Orçamento'}
                        </Button>
                    </Space>
                }
            >
                <Form form={form} layout="vertical">
                    <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>Vendedor</Divider>

                    <Form.Item name="employee_id" label="Funcionário responsável" rules={[{ required: true, message: 'Selecione o funcionário responsável' }]}>
                        <Select placeholder="Selecione o funcionário" showSearch optionFilterProp="children">
                            {employees.map((emp: any) => (<Select.Option key={emp.id} value={emp.id}>{emp.name}</Select.Option>))}
                        </Select>
                    </Form.Item>

                    {selectedEmployeeId && employeeHasNoTables && (
                        <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#fdba74' }}>
                            Este funcionário não possui tabelas de comissão vinculadas. Apenas lançamento manual está disponível.
                        </div>
                    )}
                    <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>Cliente</Divider>

                    <Form.Item label="Origem do cliente" style={{ marginBottom: 8 }}>
                        <Select
                            value={customerMode}
                            onChange={(v: 'existing' | 'manual') => {
                                setCustomerMode(v)
                                if (v === 'existing') {
                                    form.setFieldsValue({ manual_customer_name: undefined, manual_customer_phone: undefined })
                                } else {
                                    form.setFieldsValue({ customer_id: undefined })
                                }
                            }}
                            style={{ maxWidth: 260 }}
                        >
                            <Select.Option value="existing">Cliente cadastrado</Select.Option>
                            <Select.Option value="manual">Preencher manualmente</Select.Option>
                        </Select>
                    </Form.Item>

                    {customerMode === 'existing' && (
                        <Form.Item
                            name="customer_id"
                            label="Cliente (cadastrado)"
                            rules={[{ required: true, message: 'Selecione o cliente' }]}
                        >
                            <Select placeholder="Selecione o cliente" showSearch optionFilterProp="children" allowClear>
                                {customers.map(c => (<Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>))}
                            </Select>
                        </Form.Item>
                    )}

                    {customerMode === 'manual' && (
                        <>
                            <Form.Item
                                name="manual_customer_name"
                                label="Nome do cliente (manual)"
                                rules={[{ required: true, message: 'Informe o nome do cliente' }]}
                            >
                                <Input placeholder="Digite o nome do cliente, caso não esteja cadastrado" />
                            </Form.Item>

                            <Form.Item
                                name="manual_customer_phone"
                                label="Telefone do cliente (manual)"
                                rules={[{ required: true, message: 'Informe o telefone do cliente' }]}
                            >
                                <Input placeholder="(00) 00000-0000" />
                            </Form.Item>
                        </>
                    )}

                    <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>Produtos e Serviços</Divider>

                    {selectedEmployeeId && allEmpTables.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            {tableSections.map((section, idx) => {
                                const table = allEmpTables.find(t => t.id === section.tableId)
                                const isProduct = (table as any)?.type === 'PRODUCT'
                                const isService = (table as any)?.type === 'SERVICE'
                                const availableForSection = allEmpTables.filter(t =>
                                    t.id === section.tableId || !usedTableIds.includes(t.id)
                                )
                                const sectionItems = budgetItems.filter(i => i.commission_table_id === section.tableId)
                                return (
                                    <div key={section.key} style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: section.tableId ? 8 : 0 }}>
                                            <Select
                                                style={{ flex: 1 }}
                                                placeholder="Selecionar tabela..."
                                                value={section.tableId || undefined}
                                                onChange={(val) => {
                                                    setBudgetItems(prev => prev.filter(i => i.commission_table_id !== section.tableId))
                                                    setTableSections(prev => prev.map(s => s.key === section.key ? { ...s, tableId: val } : s))
                                                }}
                                                options={availableForSection.map((t: any) => ({
                                                    value: t.id,
                                                    label: `${t.name} — ${t.type === 'PRODUCT' ? 'Produto' : 'Serviço'}`,
                                                }))}
                                            />
                                            {idx > 0 && (
                                                <Button size="small" danger icon={<DeleteOutlined />}
                                                    onClick={() => {
                                                        setBudgetItems(prev => prev.filter(i => i.commission_table_id !== section.tableId))
                                                        setTableSections(prev => prev.filter(s => s.key !== section.key))
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
                            {usedTableIds.filter(Boolean).length < allEmpTables.length && (
                                <Button type="dashed" icon={<PlusOutlined />} style={{ width: '100%', marginBottom: 8 }}
                                    onClick={() => setTableSections(prev => [...prev, {key: `ts-${Date.now()}`, tableId: null}])}>
                                    + Adicionar outra tabela
                                </Button>
                            )}
                        </div>
                    )}

                    {budgetItems.filter(i => i.isManual).length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            <Table columns={itemColumns} dataSource={budgetItems.filter(i => i.isManual)} rowKey="key" pagination={false} size="small"
                                locale={{ emptyText: null }}
                            />
                        </div>
                    )}

                    <Space.Compact block style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                        <Button type="dashed" onClick={handleAddManualItem} icon={<PlusOutlined />} style={{ flex: 1 }}
                            disabled={!selectedEmployeeId}>
                            Adicionar item manual
                        </Button>
                    </Space.Compact>

                    <div style={{
                        marginTop: 16, padding: '12px 16px', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 8,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16, color: '#f1f5f9',
                    }}>
                        <strong>Total do Orçamento:</strong>
                        <strong style={{ color: '#12B76A', fontSize: 20 }}>{formatCurrency(budgetTotal)}</strong>
                    </div>

                    {/* Desconto Global */}
                    <div style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14, color: '#94a3b8', whiteSpace: 'nowrap' }}>Modo</span>
                                <Select
                                    value={discountMode}
                                    onChange={(v) => setDiscountMode(v as DiscountMode)}
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
                                    value={discountInputMode}
                                    onChange={(v) => setDiscountInputMode(v as 'PERCENT' | 'AMOUNT')}
                                    options={[
                                        { label: '%', value: 'PERCENT' },
                                        { label: 'R$', value: 'AMOUNT' },
                                    ]}
                                />
                                {discountInputMode === 'PERCENT' ? (
                                    <InputNumber
                                        min={0}
                                        max={maxDiscountPercent > 0 ? maxDiscountPercent : 100}
                                        step={0.5}
                                        precision={4}
                                        value={globalDiscountPercent}
                                        onChange={(v) => setGlobalDiscountPercent(Math.min(v ?? 0, maxDiscountPercent > 0 ? maxDiscountPercent : 100))}
                                        formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                        parser={(v) => Number((v || '0').replace(',', '.'))}
                                        addonAfter="%"
                                        style={{ width: 140 }}
                                    />
                                ) : (
                                    <CurrencyInput
                                        min={0}
                                        max={budgetTotal > 0 ? budgetTotal * ((maxDiscountPercent > 0 ? maxDiscountPercent : 100) / 100) : 0}
                                        value={budgetTotal * (globalDiscountPercent / 100)}
                                        onChange={(v) => {
                                            const amount = v || 0
                                            if (budgetTotal <= 0) { setGlobalDiscountPercent(0); return }
                                            const pct = (amount / budgetTotal) * 100
                                            const capped = Math.min(pct, maxDiscountPercent > 0 ? maxDiscountPercent : 100)
                                            setGlobalDiscountPercent(capped)
                                        }}
                                        style={{ width: 180 }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {globalDiscountPercent > 0 && (
                        <div style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ color: '#f1f5f9', fontSize: 14 }}>Total Orçamento c/ Desconto:</strong>
                            <strong style={{ color: '#f87171', fontSize: 20 }}>{formatCurrency(budgetTotalWithDiscount)}</strong>
                        </div>
                    )}

                    {/* MRM R5: aviso orientativo quando margem residual zera/negativa */}
                    {mrmConfig.enabled && globalDiscountPercent > 0 && (commissionAmount + profitAmount) <= 0 && (
                        <div style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(234, 179, 8, 0.10)', border: '1px solid rgba(234, 179, 8, 0.35)', borderRadius: 8 }}>
                            <div style={{ color: '#facc15', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>⚠ Margem residual não-positiva</div>
                            <div style={{ color: '#fde68a', fontSize: 12 }}>{MRM_ERROR_RRO_NON_POSITIVE}</div>
                        </div>
                    )}

                    {/* Distribuição do resultado — semântica oficial RR (PDF GPT + DOCX Claude, 20/05/2026)
                        Bloco aparece também SEM desconto (Q7): exibe apenas % original.
                        Em MEI/SN, hidesProfitTaxes oculta IRPJ/CSLL automaticamente.
                        S9: configWarning alerta quando CP+DOP+MOD = 0 (RRO degradado). */}
                    {budgetTotal > 0 && (
                        <ResidualDistributionBlock
                            distribution={residualDistribution}
                            configWarning={residualConfigWarning}
                            regimeGuardActive={epicV5DisplayData.regimeGuardActive}
                            discountMode={discountMode}
                        />
                    )}

                    {/* S14 — DRE Consolidada (R3=B: adicional, R7=B: universal) */}
                    {budgetTotal > 0 && (
                        <ConsolidatedDREBlock
                            dre={consolidatedDRE}
                            cascadeTrace={epicV5DisplayData.cascadeTrace}
                            pesoOpInterna={epicV5DisplayData.pesoOpInterna}
                            ancoraInterna={epicV5DisplayData.ancoraInterna}
                        />
                    )}

                    <Form.Item name="payment_method" label="Método de Pagamento" style={{ marginTop: 16 }}>
                        <Select
                            allowClear
                            placeholder="Selecione (opcional)"
                            options={PAYMENT_METHODS}
                            onChange={() => {
                                setBudgetFormInstallmentPreset('customizado')
                                setBudgetFormCustomInstallments([{ date: null, amount: 0 }])
                                setBudgetFormWithEntry(false)
                            }}
                        />
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
                        {({ getFieldValue }) => {
                            const pm = getFieldValue('payment_method')
                            if (pm !== 'CHEQUE_PRE_DATADO' && pm !== 'BOLETO') return null
                            return (
                                <PaymentWithInstallments
                                    preset={budgetFormInstallmentPreset}
                                    onPresetChange={setBudgetFormInstallmentPreset}
                                    rows={budgetFormCustomInstallments}
                                    onRowsChange={setBudgetFormCustomInstallments}
                                    total={budgetTotalWithDiscount}
                                    title="📅 Previsão de parcelas (informativo)"
                                    withEntry={budgetFormWithEntry}
                                    onWithEntryChange={setBudgetFormWithEntry}
                                    baseDate={budgetFormBaseDate}
                                    paymentMethod={pm}
                                />
                            )
                        }}
                    </Form.Item>

                    <Form.Item name="expiration_date" label="Orçamento válido até">
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>

                    <Form.Item name="notes" label="Observação">
                        <Input.TextArea rows={3} placeholder="Condições, prazos de entrega..." />
                    </Form.Item>
                </Form>
            </Drawer>

            {/* ── Drawer: Detalhes do Orçamento ── */}
            <Drawer
                title={`Orçamento ORC-${selectedBudget?.id?.substring(0, 4).toUpperCase() || ''}`}
                width={500}
                open={detailDrawerOpen}
                onClose={() => setDetailDrawerOpen(false)}
            >
                {selectedBudget && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Dados do orçamento</div>
                            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Cliente:</span> <strong>{selectedBudget.customer?.name || 'Sem cliente'}</strong></div>
                                {selectedBudget.employee && <div><span style={{ color: 'var(--color-neutral-500)' }}>Funcionário:</span> {selectedBudget.employee.name}</div>}
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Data:</span> {new Date(selectedBudget.created_at).toLocaleDateString('pt-BR')}</div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Validade:</span> {selectedBudget.expiration_date ? new Date(selectedBudget.expiration_date).toLocaleDateString('pt-BR') : '-'}</div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Valor:</span> <strong style={{ fontSize: 18, color: '#12B76A' }}>{formatCurrency(Number(selectedBudget.total_value || 0))}</strong></div>
                                {selectedBudget.payment_method && (
                                    <div><span style={{ color: 'var(--color-neutral-500)' }}>Pagamento:</span> <Tag color="green">{PAYMENT_METHODS.find(p => p.value === selectedBudget.payment_method)?.label || selectedBudget.payment_method}</Tag>
                                        {selectedBudget.installments > 1 && <Tag>{selectedBudget.installments}x</Tag>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Itens do orçamento */}
                        <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Produtos</div>
                            {detailItems.length > 0 ? detailItems.map((item: any, idx: number) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
                                    <span>{item.products?.name || item.manual_description || 'Item'} × {item.quantity}</span>
                                    <strong>{formatCurrency(item.unit_price * item.quantity - (item.discount || 0))}</strong>
                                </div>
                            )) : <span style={{ fontSize: 13, color: '#64748b' }}>Nenhum item no orçamento</span>}
                        </div>

                        {/* Indicador do status */}
                        <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Status</div>
                            <Steps
                                direction="vertical"
                                size="small"
                                current={Math.max(0, statusConfig[selectedBudget.status]?.stage ?? 0)}
                                items={[
                                    { title: 'Rascunho', description: 'Orçamento criado' },
                                    { title: 'Enviado', description: 'Enviado ao cliente' },
                                    { title: 'Pago', description: 'Pagamento recebido' },
                                ]}
                            />
                        </div>

                        {/* Botão WhatsApp */}
                        {waConnected && selectedBudget.customer && (selectedBudget.customer.whatsapp_phone || selectedBudget.customer.phone) && (
                            <Button
                                type="primary"
                                icon={<WhatsAppOutlined />}
                                loading={sendingWaId === selectedBudget?.id}
                                disabled={waThrottleSecondsLeft > 0}
                                onClick={() => handleSendWhatsApp(selectedBudget)}
                                style={{ background: '#25D366', borderColor: '#25D366', width: '100%', marginBottom: 8, height: 40, fontWeight: 600 }}
                            >
                                {waThrottleSecondsLeft > 0 ? `⏱ Aguarde ${waThrottleSecondsLeft}s para enviar` : '📲 Enviar Orçamento via WhatsApp'}
                            </Button>
                        )}

                        {!waConnected && selectedBudget.customer && (
                            <div style={{ padding: '8px 12px', background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8, fontSize: 12, color: '#AD6800', marginBottom: 8 }}>
                                ⚠️ WhatsApp não conectado. Vá em <strong>Conectividade</strong> para conectar via QR Code.
                            </div>
                        )}

                        {waConnected && selectedBudget.customer && !selectedBudget.customer.whatsapp_phone && !selectedBudget.customer.phone && (
                            <div style={{ padding: '8px 12px', background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8, fontSize: 12, color: '#AD6800', marginBottom: 8 }}>
                                ⚠️ Cliente sem número de telefone cadastrado. Edite o cliente para adicionar.
                            </div>
                        )}

                        <Space wrap>
                            {selectedBudget.status === 'DRAFT' && (
                                <Popconfirm
                                    title="Enviar para vendas?"
                                    description="O orçamento irá para 'Aguardando pagamento' sem notificar o cliente."
                                    okText="Enviar"
                                    cancelText="Cancelar"
                                    onConfirm={() => handleSendToSales(selectedBudget)}
                                >
                                    <Button type="default" icon={<ShoppingCartOutlined />}>
                                        Enviar para vendas
                                    </Button>
                                </Popconfirm>
                            )}
                            {(selectedBudget.status === 'DRAFT' || selectedBudget.status === 'SENT') && (
                                <Button type="primary" onClick={() => handleAdvanceStatus(selectedBudget)}>Avançar Etapa</Button>
                            )}
                            {(selectedBudget.status === 'APPROVED' || selectedBudget.status === 'AWAITING_PAYMENT') && (
                                <Button type="primary" style={{ background: '#12B76A' }} icon={<CreditCardOutlined />}
                                    onClick={() => { setDetailDrawerOpen(false); handleOpenPayment(selectedBudget) }}>
                                    💰 Finalizar Pagamento
                                </Button>
                            )}
                            <Popconfirm title="Recusar orçamento?" onConfirm={async () => {
                                await supabase.from('budgets').update({ status: 'REJECTED' }).eq('id', selectedBudget.id)
                                messageApi.info('Orçamento recusado.')
                                await reloadBudgets(); setDetailDrawerOpen(false)
                            }}>
                                <Button danger>Recusar</Button>
                            </Popconfirm>
                        </Space>
                    </div>
                )}
            </Drawer>

            {/* ── Modal: Finalizar Pagamento ── */}
            <Modal
                title="💳 Finalizar Pagamento"
                open={paymentModalOpen}
                onCancel={() => { setPaymentModalOpen(false); setAttachFile(null); setAttachDesc(''); setCustomInstallments([{ date: null, amount: 0 }]); setInstallmentPreset('customizado') }}
                onOk={handleFinalizeBudget}
                okText="Confirmar Pagamento"
                width={420}
            >
                <Form form={paymentForm} layout="vertical">
                    <div style={{ padding: '12px 16px', background: '#0a1628', borderRadius: 8, marginBottom: 16, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>Valor total</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#12B76A' }}>{formatCurrency(Number(selectedBudget?.total_value || 0))}</div>
                    </div>

                    <Form.Item name="payment_method" label="Forma de pagamento" rules={[{ required: true, message: 'Selecione' }]}>
                        <Select placeholder="Como foi pago?">
                            {PAYMENT_METHODS.map(p => (<Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}
                    >
                        {({ getFieldValue }) =>
                            getFieldValue('payment_method') === 'CARTAO_CREDITO' ? (
                                <Form.Item name="installments" label="Parcelas" initialValue={1}>
                                    <Select>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                            <Select.Option key={n} value={n}>
                                                {n}x de {formatCurrency(Number(selectedBudget?.total_value || 0) / n)}
                                            </Select.Option>
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
                                    total={Number(selectedBudget?.total_value) || 0}
                                    paymentMethod={pm}
                                />
                            )
                        }}
                    </Form.Item>

                    <div style={{ padding: 12, background: '#0a1628', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                            <PaperClipOutlined style={{ marginRight: 4 }} /> Anexar comprovante (opcional)
                        </div>
                        <Upload
                            beforeUpload={(file: File) => {
                                if (file.size > 10 * 1024 * 1024) {
                                    message.error('Arquivo excede 10 MB')
                                    return Upload.LIST_IGNORE
                                }
                                setAttachFile(file)
                                return false
                            }}
                            onRemove={() => { setAttachFile(null); setAttachDesc('') }}
                            accept=".pdf,.jpg,.jpeg,.png"
                            maxCount={1}
                            fileList={attachFile ? [{ uid: '-1', name: attachFile.name, status: 'done' as const }] : []}
                        >
                            <Button icon={<UploadOutlined />} size="small">Selecionar arquivo</Button>
                        </Upload>
                        {attachFile && (
                            <Input
                                placeholder="Descrição do anexo (obrigatório)"
                                value={attachDesc}
                                onChange={(e) => setAttachDesc(e.target.value)}
                                style={{ marginTop: 8 }}
                            />
                        )}
                    </div>

                    <div style={{
                        background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #86efac', borderRadius: 8,
                        padding: '10px 14px', fontSize: 12, color: '#e2e8f0',
                    }}>
                        <CheckCircleOutlined style={{ color: '#22C55E', marginRight: 6 }} />
                        <strong>Ao confirmar:</strong>
                        <ul style={{ margin: '6px 0 0 16px', paddingLeft: 0 }}>
                            <li>✅ Orçamento marcado como PAGO</li>
                            <li>📋 Venda criada automaticamente</li>
                            <li>📤 Produtos descontados do estoque</li>
                            <li>💰 Receita lançada no fluxo de caixa</li>
                        </ul>
                    </div>
                </Form>
            </Modal>
            {/* ── Drawer: Ver produtos em orçamentos ── */}
            <Drawer
                title="Produtos em Orçamentos"
                width={800}
                open={prodBudgetDrawerOpen}
                onClose={() => { setProdBudgetDrawerOpen(false); setPbFilterTable(undefined); setPbFilterProduct(undefined); setPbFilterCustomer(undefined); setPbFilterEmployee(undefined); setPbTableProducts([]) }}
                extra={
                    <Button
                        icon={<FilePdfOutlined />}
                        onClick={async () => {
                            try {
                                const headers = ['Orçamento', 'Cliente', 'Funcionário', 'Produtos', 'Qtd. Total']
                                const totalQty = pbFilteredRows.reduce((s, r) => s + r.matchItems.reduce((q, i) => q + i.quantity, 0), 0)
                                const rows: (string | number)[][] = pbFilteredRows.map(r => [
                                    r.budgetNum,
                                    r.customerName,
                                    r.employeeName,
                                    r.matchItems.map(i => `${i.productName} (${i.quantity}x)`).join('; '),
                                    r.matchItems.reduce((s, i) => s + i.quantity, 0),
                                ])
                                rows.push(['', '', '', 'TOTAL', totalQty])
                                const { exportTableToPdf } = await import('@/utils/export-generic-pdf')
                                exportTableToPdf({
                                    title: 'Produtos em Orçamentos',
                                    subtitle: `Total de itens: ${pbTotalQty}`,
                                    headers,
                                    rows,
                                    filename: 'produtos-em-orcamentos.pdf',
                                    orientation: 'landscape',
                                    kpis: [
                                        { label: 'Orçamentos', value: String(pbFilteredRows.length) },
                                        { label: 'Quantidade Total', value: String(totalQty) },
                                    ],
                                    highlightLastRow: true,
                                })
                            } catch (err: any) {
                                console.error('Erro ao exportar PDF Orçamentos', err)
                                messageApi.error('Erro ao exportar PDF: ' + (err?.message || 'Erro desconhecido'))
                            }
                        }}
                    >
                        Exportar PDF
                    </Button>
                }
            >
                {/* Filters */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    <Select
                        allowClear
                        placeholder="Tabela"
                        style={{ minWidth: 180 }}
                        value={pbFilterTable}
                        onChange={handlePbTableChange}
                        options={commissionTables.map(t => ({ value: t.id, label: t.name }))}
                    />
                    <Select
                        allowClear
                        placeholder="Produto"
                        style={{ minWidth: 200 }}
                        value={pbFilterProduct}
                        onChange={v => setPbFilterProduct(v)}
                        disabled={!pbFilterTable}
                        options={pbTableProducts.map(p => ({ value: p.id, label: p.name }))}
                        showSearch
                        filterOption={(input, opt) => (opt?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                    />
                    <Select
                        allowClear
                        placeholder="Cliente"
                        style={{ minWidth: 180 }}
                        value={pbFilterCustomer}
                        onChange={v => setPbFilterCustomer(v)}
                        options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                        showSearch
                        filterOption={(input, opt) => (opt?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                    />
                    <Select
                        allowClear
                        placeholder="Funcionário"
                        style={{ minWidth: 180 }}
                        value={pbFilterEmployee}
                        onChange={v => setPbFilterEmployee(v)}
                        options={employees.map((e: any) => ({ value: e.id, label: e.name }))}
                        showSearch
                        filterOption={(input, opt) => (opt?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                    />
                </div>

                {/* Counter */}
                {pbFilterProduct && (
                    <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShoppingCartOutlined style={{ color: '#7c3aed' }} />
                        <span style={{ fontWeight: 600 }}>
                            Total do produto selecionado: {pbTotalQty} unidade{pbTotalQty !== 1 ? 's' : ''}
                        </span>
                    </div>
                )}

                {/* Table */}
                <Table
                    loading={prodBudgetLoading}
                    dataSource={pbFilteredRows}
                    rowKey="budgetId"
                    size="small"
                    pagination={{ pageSize: 20, showTotal: (t) => `${t} orçamentos` }}
                    columns={[
                        {
                            title: 'Orçamento',
                            dataIndex: 'budgetNum',
                            width: 110,
                            render: (v: string) => <Tag>{v}</Tag>,
                        },
                        {
                            title: 'Cliente',
                            dataIndex: 'customerName',
                            width: 160,
                        },
                        {
                            title: 'Funcionário',
                            dataIndex: 'employeeName',
                            width: 160,
                        },
                        {
                            title: 'Produtos / Quantidades',
                            render: (_: any, row: any) => (
                                <div>
                                    {row.matchItems.map((item: any, idx: number) => (
                                        <div key={idx} style={{ fontSize: 12, lineHeight: '20px' }}>
                                            <span style={{ color: '#94a3b8', marginRight: 4 }}>{item.quantity}×</span>
                                            {item.productName}
                                        </div>
                                    ))}
                                </div>
                            ),
                        },
                        {
                            title: 'Qtd.',
                            width: 70,
                            align: 'right' as const,
                            render: (_: any, row: any) => row.matchItems.reduce((s: number, i: any) => s + i.quantity, 0),
                        },
                    ]}
                    summary={() => (
                        <Table.Summary.Row>
                            <Table.Summary.Cell index={0} colSpan={4} align="right">
                                <strong>Total geral</strong>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right">
                                <strong>{pbTotalQty}</strong>
                            </Table.Summary.Cell>
                        </Table.Summary.Row>
                    )}
                />
            </Drawer>
        </Layout>
    )
}

export default Budgets
