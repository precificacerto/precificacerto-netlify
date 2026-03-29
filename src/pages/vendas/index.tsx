import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
    Button, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag,
    message, Popconfirm, DatePicker, Empty, Divider, Modal, Upload, Checkbox, Radio,
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
    DownloadOutlined, ToolOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { formatCurrencyInput, parseCurrencyInput } from '@/utils/get-monetary-value'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'
import { calculateDiscountedPrice } from '@/utils/calculate-discount'

const PAYMENT_METHODS = [
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: '📦 Customizado' },
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
    productName: string
    quantity: number
    unitPrice: number
    finalValue: number
    customerName: string
    sellerName: string
    description: string
    saleDate: string
    status: string
    paymentMethod: string
    installments: number
    saleType: string
    receiptUrl: string | null
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
    /** true = item manual (nome/valor digitados), false = produto do catálogo */
    is_manual?: boolean
    /** true = item de servico do catalogo */
    is_service?: boolean
}

function formatCurrency(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function buildInstallmentsByPreset(preset: string): { date: any; amount: number }[] {
    const today = dayjs()
    if (preset === '30') return [{ date: today.add(30, 'day'), amount: 0 }]
    if (preset === '30_60') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }]
    if (preset === '30_60_90') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }]
    if (preset === '30_60_90_120') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }, { date: today.add(120, 'day'), amount: 0 }]
    if (preset === '30_60_90_120_150') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }, { date: today.add(120, 'day'), amount: 0 }, { date: today.add(150, 'day'), amount: 0 }]
    return [{ date: null, amount: 0 }]
}

const INSTALLMENT_PRESETS = [
    { value: 'customizado', label: 'Customizado' },
    { value: '30', label: '30' },
    { value: '30_60', label: '30/60' },
    { value: '30_60_90', label: '30/60/90' },
    { value: '30_60_90_120', label: '30/60/90/120' },
    { value: '30_60_90_120_150', label: '30/60/90/120/150' },
]

interface PendingBudget {
    id: string
    customer_name: string
    total_value: number
    created_at: string
    status: string
}

function Sales() {
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
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()
    const [pendingBudgets, setPendingBudgets] = useState<PendingBudget[]>([])
    const [registerModalOpen, setRegisterModalOpen] = useState(false)
    const [selectedBudget, setSelectedBudget] = useState<PendingBudget | null>(null)
    const [registerForm] = Form.useForm()
    const [registerSaving, setRegisterSaving] = useState(false)
    const [exportModalOpen, setExportModalOpen] = useState(false)
    const [isSplitPay, setIsSplitPay] = useState(false)

    const [receiptFile, setReceiptFile] = useState<UploadFile[]>([])
    const [registerReceiptFile, setRegisterReceiptFile] = useState<UploadFile[]>([])
    const [attachDesc, setAttachDesc] = useState('')
    const [registerAttachDesc, setRegisterAttachDesc] = useState('')

    // Parcelas customizadas para Cheque pré-datado / Boleto (Venda no Balcão)
    const [customInstallments, setCustomInstallments] = useState<{ date: any; amount: number }[]>([{ date: null, amount: 0 }])
    const [installmentPreset, setInstallmentPreset] = useState<'customizado' | '30' | '30_60' | '30_60_90' | '30_60_90_120' | '30_60_90_120_150'>('customizado')
    const [registerInstallmentPreset, setRegisterInstallmentPreset] = useState<'customizado' | '30' | '30_60' | '30_60_90' | '30_60_90_120' | '30_60_90_120_150'>('customizado')
    const [empProductTablesV, setEmpProductTablesV] = useState<{id: string; name: string; type: string}[]>([])
    const [empServiceTablesV, setEmpServiceTablesV] = useState<{id: string; name: string; type: string}[]>([])
    const [tableSectionsV, setTableSectionsV] = useState<{key: string; tableId: string | null}[]>([{key: 'ts-0', tableId: null}])
    const selectedEmployeeIdV = Form.useWatch('employee_id', form)
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
                .select('commission_tables(id, name, type)')
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
    const [registerCustomInstallments, setRegisterCustomInstallments] = useState<{ date: null; amount: number }[]>([{ date: null, amount: 0 }])

    const { canView, canEdit } = usePermissions()
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
                .select('*, products(name), services(name), customers(name), employees(name)')
                .eq('is_active', true)
                .order('sale_date', { ascending: false })
            if (!salesErr) {
                salesData = salesFull
            } else {
                console.warn('Sales query with employees join failed, falling back:', salesErr.message)
                const { data: salesSimple } = await sbv
                    .from('sales')
                    .select('*, products(name), services(name), customers(name)')
                    .eq('is_active', true)
                    .order('sale_date', { ascending: false })
                salesData = salesSimple
            }

            // Products: try with recurrence_days, fall back without
            let prods: any[] | null = null
            const { data: prodsFull, error: prodsErr } = await supabase.from('products').select('id, name, sale_price, cost_total, commission_table_id, recurrence_days').order('name')
            if (!prodsErr) {
                prods = prodsFull
            } else {
                console.warn('Products query failed, falling back:', prodsErr.message)
                const { data: prodsSimple } = await supabase.from('products').select('id, name, sale_price, cost_total, commission_table_id').order('name')
                prods = prodsSimple
            }

            // Services: try with recurrence_days, fall back without
            let svcs: any[] | null = null
            const svb = supabase as any
            const { data: svcsFull, error: svcsErr } = await svb.from('services').select('id, name, base_price, commission_percent, commission_table_id, recurrence_days').eq('status', 'ACTIVE').order('name')
            if (!svcsErr) {
                svcs = svcsFull
            } else {
                console.warn('Services query failed, falling back:', svcsErr.message)
                const { data: svcsSimple } = await svb.from('services').select('id, name, base_price, commission_percent, commission_table_id').eq('status', 'ACTIVE').order('name')
                svcs = svcsSimple
            }

            // Customers and employees (employees may not have the table yet)
            const { data: custs } = await (supabase as any).from('customers').select('id, name').eq('is_active', true).order('name')
            let emps: any[] | null = null
            try {
                const { data: empsData, error: empsErr } = await (supabase as any).from('employees').select('id, name, commission_percent').eq('is_active', true).order('name')
                if (!empsErr) emps = empsData
            } catch (e) {
                console.warn('Could not load employees:', e)
            }

            const rows: SaleRow[] = (salesData || []).map((s: any) => ({
                id: s.id,
                productName: s.products?.name || s.services?.name || s.description || '-',
                quantity: s.quantity || 1,
                unitPrice: s.unit_price || s.final_value || 0,
                finalValue: s.final_value || 0,
                customerName: s.customers?.name || '-',
                sellerName: s.employees?.name || '-',
                description: s.description || '',
                saleDate: s.sale_date,
                status: s.status || 'COMPLETED',
                paymentMethod: s.payment_method || '-',
                installments: s.installments || 1,
                saleType: s.sale_type || 'MANUAL',
                receiptUrl: s.receipt_url || null,
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
            .select('id, total_value, created_at, status, sale_id, customer:customers(name)')
            .in('status', ['APPROVED', 'SENT', 'AWAITING_PAYMENT'])
            .is('sale_id', null)
            .order('created_at', { ascending: false })
        setPendingBudgets((data || []).map((b: any) => ({
            id: b.id,
            customer_name: b.customer?.name || 'Sem cliente',
            total_value: Number(b.total_value) || 0,
            created_at: b.created_at,
            status: b.status,
        })))
    }

    const handleOpenRegisterSale = async (budget: PendingBudget) => {
        const { data: fresh } = await supabase.from('budgets').select('id, status, total_value, created_at, customer:customers(name)').eq('id', budget.id).single()
        if (fresh?.status === 'PAID') {
            messageApi.info('Este orçamento já foi finalizado e o pagamento lançado.')
            await fetchPendingBudgets()
            return
        }
        setSelectedBudget(fresh ? { id: fresh.id, customer_name: (fresh as any).customer?.name || 'Sem cliente', total_value: Number(fresh.total_value) || 0, created_at: fresh.created_at, status: fresh.status } : budget)
        registerForm.resetFields()
        registerForm.setFieldsValue({ sale_date: dayjs() })
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
                quantity: 1,
                unit_price: selectedBudget.total_value,
                final_value: selectedBudget.total_value,
                payment_method: values.payment_method,
                installments: values.installments || 1,
                description: `Venda via orçamento — ${selectedBudget.customer_name}`,
                sale_date: values.sale_date ? values.sale_date.toISOString() : new Date().toISOString(),
                sale_type: 'FROM_BUDGET',
                status: 'COMPLETED',
            }).select().single()
            if (saleErr) throw saleErr

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

            // Descontar estoque dos produtos do orçamento
            const { data: budgetItems } = await supabase
                .from('budget_items')
                .select('product_id, quantity')
                .eq('budget_id', selectedBudget.id)

            if (budgetItems && budgetItems.length > 0) {
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
            // Cartão de crédito: receita nunca no mês atual — parcelas a partir do próximo mês (ou 1x no próximo mês)
            if (values.payment_method === 'CARTAO_CREDITO') {
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

    const filteredSales = sales.filter(s =>
        s.productName.toLowerCase().includes(searchText.toLowerCase()) ||
        s.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
        s.sellerName.toLowerCase().includes(searchText.toLowerCase()) ||
        s.description.toLowerCase().includes(searchText.toLowerCase())
    )

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
        setSaleItems(prev => prev.map(item =>
            item.key === key ? {
                ...item,
                service_id: serviceId,
                product_name: svc?.name || '',
                unit_price: svc?.base_price || 0,
                total: (svc?.base_price || 0) * item.quantity - item.discount,
            } : item
        ))
    }

    const handleManualItemNameChange = (key: string, productName: string) => {
        setSaleItems(prev => prev.map(item =>
            item.key === key ? { ...item, product_name: productName } : item
        ))
    }

    const handleProductSelect = (key: string, productId: string) => {
        const prod = products.find(p => p.id === productId)
        setSaleItems(prev => prev.map(item =>
            item.key === key ? {
                ...item,
                product_id: productId,
                product_name: prod?.name || '',
                unit_price: prod?.sale_price || 0,
                total: (prod?.sale_price || 0) * item.quantity - item.discount,
            } : item
        ))
    }

    const handleItemChange = (key: string, field: string, value: number) => {
        setSaleItems(prev => prev.map(item => {
            if (item.key !== key) return item
            const updated = { ...item, [field]: value }
            const grossTotal = updated.unit_price * updated.quantity
            // Desconto sai apenas da margem (comissão + lucro)
            if (updated.discount > 0) {
                const prod = !updated.is_service ? products.find((p: any) => p.id === updated.product_id) : null
                const svc = updated.is_service ? services.find((s: any) => s.id === updated.service_id) : null
                const costWithTaxes = Number(prod?.cost_total || svc?.cost_total || 0) * updated.quantity
                const margin = Math.max(0, grossTotal - costWithTaxes)
                const clampedDiscount = Math.min(updated.discount, margin)
                updated.total = grossTotal - clampedDiscount
            } else {
                updated.total = grossTotal
            }
            return updated
        }))
    }

    const saleTotal = saleItems.reduce((s, i) => s + i.total, 0)

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
            setSaving(true)

            const values = form.getFieldsValue()
            const tenantId = await getTenantId()
            if (!tenantId) { messageApi.error('Sessão expirada.'); return }
            const createdBy = await getCurrentUserId()
            if (!createdBy) { messageApi.error('Sessão inválida. Faça login novamente.'); setSaving(false); return }

            // 1) Criar venda (employee_id saved separately to handle missing column)
            const { data: sale, error: saleErr } = await supabase.from('sales').insert({
                tenant_id: tenantId,
                created_by: createdBy,
                customer_id: values.customer_id || null,
                quantity: saleItems.reduce((s, i) => s + i.quantity, 0),
                unit_price: saleTotal,
                final_value: saleTotal,
                payment_method: values.payment_method,
                installments: values.installments || 1,
                description: values.description || 'Venda no balcão',
                sale_date: values.sale_date ? values.sale_date.toISOString() : new Date().toISOString(),
                sale_type: 'MANUAL',
                status: 'COMPLETED',
            }).select().single()

            if (saleErr) throw saleErr

            // Try to set employee_id separately (column may not exist yet)
            if (values.employee_id && sale?.id) {
                const { error: empErr } = await (supabase as any).from('sales').update({ employee_id: values.employee_id }).eq('id', sale.id)
                if (empErr) console.warn('employee_id column may not exist yet on sales:', empErr.message)
            }

            // 2) Salvar itens da venda (catálogo + manuais + serviços)
            const catalogItems = saleItems.filter(i => i.product_id && !i.is_service).map(i => ({
                sale_id: sale.id,
                product_id: i.product_id,
                quantity: i.quantity,
                unit_price: i.unit_price,
                discount: i.discount ?? 0,
            }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const serviceItems: any[] = saleItems.filter(i => i.is_service && i.service_id).map((i): any => ({
                sale_id: sale.id,
                product_id: null as string | null,
                service_id: i.service_id,
                quantity: i.quantity,
                unit_price: i.unit_price,
                discount: i.discount ?? 0,
                description: (i.product_name || '').trim(),
            }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const manualItems: any[] = saleItems.filter(i => i.is_manual && (i.product_name || '').trim()).map((i): any => ({
                sale_id: sale.id,
                product_id: null as string | null,
                quantity: i.quantity,
                unit_price: i.unit_price,
                discount: i.discount ?? 0,
                description: (i.product_name || '').trim(),
            }))
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
                    amount: saleTotal,
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
                const amountPerInstallment = saleTotal / numInstallments
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
                const amountPaid = Number(values.amount_paid) || saleTotal
                const remaining = Math.max(0, saleTotal - amountPaid)
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
                        amount: saleTotal,
                        amount_paid: amountPaid,
                        amount_remaining: remaining,
                        due_date: remainingDate,
                        description: `${saleDesc} — ${payLabel} | Pago: R$ ${amountPaid.toFixed(2)} | Restante: R$ ${remaining.toFixed(2)}`,
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
                    amount: saleTotal,
                    due_date: saleDate,
                    description: `${saleDesc} — ${payLabel}${numInstallments > 1 ? ` (${numInstallments}x)` : ''}`,
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

            messageApi.success('Venda registrada! Estoque atualizado e receita lançada no caixa.')
            await fetchData()
            setDrawerOpen(false)
            form.resetFields()
            setSaleItems([])
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
            .select('*, products(name), services(name)')
            .eq('sale_id', record.id)
        setDetailItems(items || [])
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
            if (!res.ok) throw new Error(result.error || 'Erro ao desativar')
            messageApi.success('Venda desativada!')
            await fetchData()
        } catch (error: any) {
            messageApi.error(error.message || 'Erro ao desativar venda')
        }
    }

    // ── Export functions ──
    const handleExportExcel = async (startDate?: string, endDate?: string) => {
        const filtered = startDate && endDate
            ? sales.filter(s => {
                const d = new Date(s.saleDate)
                return d >= new Date(startDate) && d <= new Date(endDate)
            })
            : sales
        if (!filtered.length) { messageApi.warning('Nenhuma venda no período selecionado.'); return }
        const { Workbook } = await import('exceljs')
        const wb = new Workbook()
        const ws = wb.addWorksheet('Vendas')
        ws.addRow(['Produto(s)', 'Cliente', 'Vendedor', 'Valor', 'Pagamento', 'Parcelas', 'Data', 'Tipo'])
        filtered.forEach(r => {
            const pm = PAYMENT_METHODS.find(p => p.value === r.paymentMethod)
            ws.addRow([
                r.productName,
                r.customerName,
                r.sellerName,
                r.finalValue,
                pm?.label || r.paymentMethod,
                r.installments > 1 ? `${r.installments}x` : '1x',
                r.saleDate ? new Date(r.saleDate).toLocaleDateString('pt-BR') : '-',
                r.saleType === 'FROM_BUDGET' ? 'Via orçamento' : 'Balcão',
            ])
        })
        ws.getRow(1).font = { bold: true }
        ws.getColumn(4).numFmt = '#,##0.00'
        const buf = await wb.xlsx.writeBuffer()
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'vendas.xlsx'; a.click()
        URL.revokeObjectURL(url)
    }

    const handleExportPdf = (startDate?: string, endDate?: string) => {
        const filtered = startDate && endDate
            ? sales.filter(s => {
                const d = new Date(s.saleDate)
                return d >= new Date(startDate) && d <= new Date(endDate)
            })
            : sales
        if (!filtered.length) { messageApi.warning('Nenhuma venda no período selecionado.'); return }
        const rows = filtered.map(r => {
            const pm = PAYMENT_METHODS.find(p => p.value === r.paymentMethod)
            return [
                r.productName,
                r.customerName,
                r.sellerName,
                formatCurrency(r.finalValue),
                pm?.label || r.paymentMethod,
                r.installments > 1 ? `${r.installments}x` : '1x',
                r.saleDate ? new Date(r.saleDate).toLocaleDateString('pt-BR') : '-',
                r.saleType === 'FROM_BUDGET' ? 'Via orçamento' : 'Balcão',
            ]
        })
        exportTableToPdf({
            title: 'Relatório de Vendas',
            subtitle: startDate && endDate
                ? `Período: ${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`
                : 'Todas as vendas',
            headers: ['Produto(s)', 'Cliente', 'Vendedor', 'Valor', 'Pagamento', 'Parcelas', 'Data', 'Tipo'],
            rows,
            filename: 'vendas.pdf',
        })
    }

    const columns: ColumnsType<SaleRow> = [
        {
            title: 'Produto(s)',
            dataIndex: 'productName',
            key: 'productName',
            sorter: (a, b) => a.productName.localeCompare(b.productName),
            render: (text, record) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{text}</span>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                        {record.saleType === 'FROM_BUDGET' ? '📋 Via orçamento' : '🏪 Balcão'}
                    </div>
                </div>
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
            width: 130,
            render: (_, record) => (
                <Space>
                    <Button type="link" size="small" onClick={() => handleViewDetail(record)}>Ver</Button>
                    <Popconfirm title="Desativar venda?" onConfirm={() => handleDelete(record.id)}>
                        <Button type="link" size="small" danger>Desativar</Button>
                    </Popconfirm>
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
            title: 'Preço', key: 'price', width: 110,
            render: (_, r) => (
                <InputNumber
                    min={0}
                    step={0.01}
                    value={r.unit_price}
                    onChange={(v) => handleItemChange(r.key, 'unit_price', v ?? 0)}
                    style={{ width: '100%' }}
                    formatter={(v) => (v != null ? `R$ ${formatCurrencyInput(Number(v))}` : '')}
                    parser={(s) => parseCurrencyInput(s)}
                />
            ),
        },
        {
            title: 'Desc.%', key: 'discount', width: 80,
            render: (_, r) => (
                <InputNumber
                    min={0}
                    max={100}
                    step={1}
                    value={(() => {
                        const grossTotal = r.unit_price * r.quantity
                        const prod = !r.is_service ? products.find((p: any) => p.id === r.product_id) : null
                        const svc = r.is_service ? services.find((s: any) => s.id === r.service_id) : null
                        const cost = Number(prod?.cost_total || svc?.cost_total || 0) * r.quantity
                        const margin = Math.max(0, grossTotal - cost)
                        return margin > 0 ? Math.round((r.discount / margin) * 100) : 0
                    })()}
                    onChange={(v) => {
                        const pct = Number(v) || 0
                        const grossTotal = r.unit_price * r.quantity
                        const prod = !r.is_service ? products.find((p: any) => p.id === r.product_id) : null
                        const svc = r.is_service ? services.find((s: any) => s.id === r.service_id) : null
                        const cost = Number(prod?.cost_total || svc?.cost_total || 0) * r.quantity
                        const margin = Math.max(0, grossTotal - cost)
                        const discountValue = margin * (pct / 100)
                        handleItemChange(r.key, 'discount', discountValue)
                    }}
                    style={{ width: '100%' }}
                    formatter={(v) => `${v}%`}
                    parser={(s) => Number(String(s).replace('%', '')) || 0}
                />
            ),
        },
        {
            title: 'Total', key: 'total', width: 100,
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
                </div>
            )}

            <div className="pc-card--table">
                <div className="filter-bar">
                    <Input
                        placeholder="Buscar por produto, cliente, vendedor..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ maxWidth: 360 }}
                        allowClear
                    />
                    <div style={{ flex: 1 }} />
                    <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)}>
                        Exportar
                    </Button>
                    <Button type="primary" icon={<ShopOutlined />} onClick={() => { form.resetFields(); setSaleItems([]); setDrawerOpen(true) }}>
                        Venda no Balcão
                    </Button>
                </div>

                <Table columns={columns} dataSource={filteredSales} rowKey="id"
                    pagination={{ pageSize: 10, showTotal: (t) => `${t} vendas` }}
                    size="middle" loading={loading}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma venda registrada. Vendas de orçamentos finalizados e vendas no balcão aparecem aqui." /> }}
                />
            </div>

            {/* ── Drawer: Venda no Balcão ── */}
            <Drawer
                title="🏪 Venda no Balcão"
                width={680}
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); form.resetFields(); setSaleItems([]); setEmpProductTablesV([]); setEmpServiceTablesV([]); setTableSectionsV([{key: 'ts-0', tableId: null}]); setReceiptFile([]); setAttachDesc(''); setIsSplitPay(false); setCustomInstallments([{ date: null, amount: 0 }]); setInstallmentPreset('customizado') }}
                extra={<Space><Button onClick={() => { setDrawerOpen(false); form.resetFields(); setSaleItems([]); setEmpProductTablesV([]); setEmpServiceTablesV([]); setTableSectionsV([{key: 'ts-0', tableId: null}]); setReceiptFile([]); setAttachDesc(''); setIsSplitPay(false); setCustomInstallments([{ date: null, amount: 0 }]); setInstallmentPreset('customizado') }}>Cancelar</Button><Button onClick={handleSaveSale} type="primary" loading={saving}>Registrar Venda</Button></Space>}
            >
                <Form form={form} layout="vertical">
                    <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>Vendedor</Divider>

                    <Form.Item name="employee_id" label="Vendedor" rules={[{ required: true, message: 'Selecione o vendedor' }]}>
                        <Select placeholder="Selecione o vendedor" showSearch optionFilterProp="children">
                            {employees.map((e: any) => (<Select.Option key={e.id} value={e.id}>{e.name}</Select.Option>))}
                        </Select>
                    </Form.Item>

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

                    <div style={{
                        marginTop: 16, padding: '12px 16px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #86efac', borderRadius: 8,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16,
                    }}>
                        <strong>Total:</strong>
                        <strong style={{ color: '#12B76A', fontSize: 20 }}>{formatCurrency(saleTotal)}</strong>
                    </div>

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
                                            <Select.Option key={n} value={n}>{n}x de {formatCurrency(saleTotal / n)}</Select.Option>
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
                                <div style={{ marginBottom: 16, padding: 12, background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 8 }}>
                                        Datas e valores de recebimento
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <Radio.Group
                                            value={installmentPreset}
                                            onChange={(e) => {
                                                const p = e.target.value
                                                setInstallmentPreset(p)
                                                const insts = buildInstallmentsByPreset(p)
                                                const total = saleTotal
                                                const n = insts.length
                                                const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                                                setCustomInstallments(insts.map(inst => ({ ...inst, amount: amt })))
                                            }}
                                            size="small"
                                        >
                                            {INSTALLMENT_PRESETS.map(p => <Radio.Button key={p.value} value={p.value}>{p.label}</Radio.Button>)}
                                        </Radio.Group>
                                    </div>
                                    {customInstallments.map((item, idx) => (
                                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                            <DatePicker
                                                placeholder="Data de recebimento"
                                                format="DD/MM/YYYY"
                                                value={item.date}
                                                onChange={(d) => {
                                                    setCustomInstallments(prev => prev.map((r, i) => i === idx ? { ...r, date: d } : r))
                                                }}
                                                style={{ width: '100%' }}
                                            />
                                            <InputNumber
                                                min={0}
                                                step={0.01}
                                                precision={2}
                                                style={{ width: '100%' }}
                                                placeholder="Valor (R$)"
                                                value={item.amount || undefined}
                                                addonBefore="R$"
                                                onChange={(v) => {
                                                    setCustomInstallments(prev => prev.map((r, i) => i === idx ? { ...r, amount: Number(v) || 0 } : r))
                                                }}
                                            />
                                            <Button
                                                danger size="small" type="text"
                                                disabled={installmentPreset !== 'customizado' || customInstallments.length === 1}
                                                onClick={() => setCustomInstallments(prev => prev.filter((_, i) => i !== idx))}
                                            >✕</Button>
                                        </div>
                                    ))}
                                    {installmentPreset === 'customizado' && (
                                        <Button
                                            type="dashed" size="small" style={{ width: '100%' }}
                                            onClick={() => setCustomInstallments(prev => [...prev, { date: null, amount: 0 }])}
                                        >+ Adicionar data/valor</Button>
                                    )}
                                    {customInstallments.length > 1 && (
                                        <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                                            Total parcelas: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(customInstallments.reduce((s, r) => s + (r.amount || 0), 0))}</strong>
                                        </div>
                                    )}
                                </div>
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
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8, padding: 12, background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
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

                    <Form.Item name="customer_id" label="Cliente (opcional)">
                        <Select placeholder="Selecione o cliente" showSearch optionFilterProp="children" allowClear>
                            {customers.map(c => (<Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>))}
                        </Select>
                    </Form.Item>

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
                title="Detalhes da Venda"
                width={450}
                open={detailDrawerOpen}
                onClose={() => setDetailDrawerOpen(false)}
            >
                {selectedSale && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Tipo:</span> {selectedSale.saleType === 'FROM_BUDGET' ? '📋 Via orçamento' : '🏪 Balcão'}</div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Cliente:</span> <strong>{selectedSale.customerName}</strong></div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Vendedor:</span> <strong>{selectedSale.sellerName && selectedSale.sellerName !== '-' ? selectedSale.sellerName : 'Sem vendedor'}</strong></div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Data:</span> {new Date(selectedSale.saleDate).toLocaleDateString('pt-BR')}</div>
                                <div><span style={{ color: 'var(--color-neutral-500)' }}>Valor:</span> <strong style={{ fontSize: 18, color: '#12B76A' }}>{formatCurrency(selectedSale.finalValue)}</strong></div>
                                <div>
                                    <span style={{ color: 'var(--color-neutral-500)' }}>Pagamento:</span>{' '}
                                    <Tag color="green">{PAYMENT_METHODS.find(p => p.value === selectedSale.paymentMethod)?.label || selectedSale.paymentMethod}</Tag>
                                    {selectedSale.installments > 1 && <Tag color="blue">{selectedSale.installments}x</Tag>}
                                </div>
                            </div>
                        </div>

                        {detailItems.length > 0 && (
                            <div style={{ padding: 16, background: 'var(--color-neutral-50)', borderRadius: 8 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Produtos e Serviços</div>
                                {detailItems.map((item: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                                        <span>{item.products?.name || item.services?.name || item.description || 'Item'} × {item.quantity}</span>
                                        <strong>{formatCurrency(item.unit_price * item.quantity - (item.discount || 0))}</strong>
                                    </div>
                                ))}
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
                confirmLoading={registerSaving}
                okText="Confirmar Venda"
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
                                <div style={{ marginBottom: 16, padding: 12, background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 8 }}>
                                        Datas e valores de recebimento
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <Radio.Group
                                            value={registerInstallmentPreset}
                                            onChange={(e) => {
                                                const p = e.target.value
                                                setRegisterInstallmentPreset(p)
                                                const insts = buildInstallmentsByPreset(p)
                                                const total = Number(selectedBudget?.total_value) || 0
                                                const n = insts.length
                                                const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                                                setRegisterCustomInstallments(insts.map(inst => ({ ...inst, amount: amt })))
                                            }}
                                            size="small"
                                        >
                                            {INSTALLMENT_PRESETS.map(p => <Radio.Button key={p.value} value={p.value}>{p.label}</Radio.Button>)}
                                        </Radio.Group>
                                    </div>
                                    {registerCustomInstallments.map((item, idx) => (
                                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                            <DatePicker
                                                placeholder="Data de recebimento"
                                                format="DD/MM/YYYY"
                                                value={item.date}
                                                onChange={(d) => setRegisterCustomInstallments(prev => prev.map((r, i) => i === idx ? { ...r, date: d } : r))}
                                                style={{ width: '100%' }}
                                            />
                                            <InputNumber
                                                min={0} step={0.01} precision={2} style={{ width: '100%' }}
                                                placeholder="Valor (R$)" value={item.amount || undefined} addonBefore="R$"
                                                onChange={(v) => setRegisterCustomInstallments(prev => prev.map((r, i) => i === idx ? { ...r, amount: Number(v) || 0 } : r))}
                                            />
                                            <Button danger size="small" type="text"
                                                disabled={registerInstallmentPreset !== 'customizado' || registerCustomInstallments.length === 1}
                                                onClick={() => setRegisterCustomInstallments(prev => prev.filter((_, i) => i !== idx))}>✕</Button>
                                        </div>
                                    ))}
                                    {registerInstallmentPreset === 'customizado' && (
                                        <Button type="dashed" size="small" style={{ width: '100%' }}
                                            onClick={() => setRegisterCustomInstallments(prev => [...prev, { date: null, amount: 0 }])}>
                                            + Adicionar data/valor
                                        </Button>
                                    )}
                                </div>
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
