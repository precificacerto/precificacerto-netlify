import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button, Select, Table, Tag, Tabs, message, Empty, DatePicker, Modal, Form } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { useProducts, useEmployees, useCustomers } from '@/hooks/use-data.hooks'
import { useAuth } from '@/hooks/use-auth.hook'
import {
    DollarOutlined,
    ShoppingOutlined,
    BarChartOutlined,
    FilterOutlined,
    ReloadOutlined,
    CustomerServiceOutlined,
    DownloadOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    TeamOutlined,
} from '@ant-design/icons'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import dayjs from 'dayjs'
import { formatBRL } from '@/utils/formatters'

const REGISTER_PAYMENT_METHODS = [
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: '🗓️ Cheque Pré-datado' },
]

interface PendingReceivableRow {
    id: string
    customerName: string
    employeeName: string
    amount: number
    amountRemaining: number
    amountPaid: number
    launchDate: string
    description: string
    originType: string
    customerId: string
    employeeId: string | null
    sectionName: string
}

interface CommissionReportRow {
    saleId: string
    saleCode: string
    saleDate: string
    customerName: string
    employeeName: string
    employeeId: string | null
    productIds: string[]
    productNames: string[]
    valorPreciso: number
    valorVendido: number
    comissaoPaga: number
    percentVendedor: number
    lucroEmpresa: number
}

interface ABCReportRow {
    position: number
    productId: string
    productCode: string | null
    productName: string
    sectionName: string
    qtdSold: number
    totalRevenue: number
    totalCost: number
    profitMargin: number
    marginPercent: number
    commissionPercent: number
    commissionValue: number
    curve: 'A' | 'B' | 'C'
    employeeName: string
}

interface ABCServiceRow {
    position: number
    serviceId: string
    serviceCode: string | null
    serviceName: string
    qtdSold: number
    totalRevenue: number
    totalCost: number
    profitMargin: number
    marginPercent: number
    commissionPercent: number
    commissionValue: number
    curve: 'A' | 'B' | 'C'
    employeeName: string
}

const { RangePicker } = DatePicker

const formatCurrency = formatBRL

function SalesReport() {
    const { tenantId, currentUser } = useAuth()
    const effectiveTenantId = tenantId ?? currentUser?.tenant_id
    const isRevenda = currentUser?.calcType === 'RESALE'
    const { data: employees = [] } = useEmployees()
    const { data: rawProducts } = useProducts()
    const { data: customers = [] } = useCustomers()
    const [messageApi, contextHolder] = message.useMessage()
    const { canView, canEdit, isAdmin } = usePermissions()
    const canRegisterPayment = isAdmin || canEdit(MODULES.SALES_REPORT)

    const [activeTab, setActiveTab] = useState<'RECEIVABLES' | 'COMMISSIONS' | 'PRODUCTS' | 'SERVICES'>('RECEIVABLES')

    // Commissions report state
    const [commData, setCommData] = useState<CommissionReportRow[]>([])
    const [commLoading, setCommLoading] = useState(false)
    const [commDateRange, setCommDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ])
    const [commEmployeeFilter, setCommEmployeeFilter] = useState<string | undefined>(undefined)
    const [commSaleFilter, setCommSaleFilter] = useState<string | undefined>(undefined)
    const [commProductFilter, setCommProductFilter] = useState<string | undefined>(undefined)
    const [commExportModalOpen, setCommExportModalOpen] = useState(false)

    // Product ABC state
    const [abcData, setAbcData] = useState<ABCReportRow[]>([])
    const [abcLoading, setAbcLoading] = useState(false)
    const [abcDateRange, setAbcDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ])
    const [abcEmployeeFilter, setAbcEmployeeFilter] = useState<string | undefined>(undefined)
    const [abcProductFilter, setAbcProductFilter] = useState<string | undefined>(undefined)
    const [abcClientFilter, setAbcClientFilter] = useState<string | undefined>(undefined)

    // Service ABC state
    const [svcData, setSvcData] = useState<ABCServiceRow[]>([])
    const [svcLoading, setSvcLoading] = useState(false)
    const [svcDateRange, setSvcDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ])
    const [svcEmployeeFilter, setSvcEmployeeFilter] = useState<string | undefined>(undefined)
    const [svcClientFilter, setSvcClientFilter] = useState<string | undefined>(undefined)

    // Pending receivables state
    const [recData, setRecData] = useState<PendingReceivableRow[]>([])
    const [recLoading, setRecLoading] = useState(false)
    const [recDateRange, setRecDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
    const [recEmployeeFilter, setRecEmployeeFilter] = useState<string | undefined>(undefined)
    const [recClientFilter, setRecClientFilter] = useState<string | undefined>(undefined)
    const [payModalOpen, setPayModalOpen] = useState(false)
    const [payingRecord, setPayingRecord] = useState<PendingReceivableRow | null>(null)
    const [payingSaving, setPayingSaving] = useState(false)
    const [payForm] = Form.useForm()

    // Export state
    const [productExportModalOpen, setProductExportModalOpen] = useState(false)
    const [serviceExportModalOpen, setServiceExportModalOpen] = useState(false)

    const handleExportProductsExcel = () => {
        if (!abcData.length) return
        import('exceljs').then(({ Workbook }) => {
            const wb = new Workbook()
            const ws = wb.addWorksheet('Curva ABC Produtos')
            ws.addRow(['#', 'Código', 'Produto', 'Qtd. Vendida', 'Receita', 'Comissão %', 'Valor da Comissão', 'Curva', 'Vendedor'])
            abcData.forEach(r => ws.addRow([r.position, r.productCode || '—', r.productName, r.qtdSold, r.totalRevenue, `${r.commissionPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`, r.commissionValue, r.curve, r.employeeName]))
            ws.getRow(1).font = { bold: true }
            wb.xlsx.writeBuffer().then(buf => {
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'curva-abc-produtos.xlsx'; a.click()
                URL.revokeObjectURL(url)
            })
        })
    }

    const handleExportProductsPdf = () => {
        if (!abcData.length) return
        exportTableToPdf({
            title: 'Curva ABC - Produtos',
            subtitle: `Período: ${abcDateRange[0].format('DD/MM/YYYY')} a ${abcDateRange[1].format('DD/MM/YYYY')}`,
            headers: ['#', 'Código', 'Produto', 'Qtd.', 'Receita', 'Comissão %', 'Valor Comissão', 'Curva', 'Vendedor'],
            rows: abcData.map(r => [r.position, r.productCode || '—', r.productName, r.qtdSold, formatCurrency(r.totalRevenue), `${r.commissionPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`, formatCurrency(r.commissionValue), r.curve, r.employeeName]),
            filename: 'curva-abc-produtos.pdf',
        })
    }

    const handleExportServicesPdf = () => {
        if (!svcData.length) return
        exportTableToPdf({
            title: 'Curva ABC - Serviços',
            subtitle: `Período: ${svcDateRange[0].format('DD/MM/YYYY')} a ${svcDateRange[1].format('DD/MM/YYYY')}`,
            headers: ['#', 'Código', 'Serviço', 'Qtd.', 'Receita', 'Comissão %', 'Valor Comissão', 'Curva', 'Profissional'],
            rows: svcData.map(r => [r.position, r.serviceCode || '—', r.serviceName, r.qtdSold, formatCurrency(r.totalRevenue), `${r.commissionPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`, formatCurrency(r.commissionValue), r.curve, r.employeeName]),
            filename: 'curva-abc-servicos.pdf',
        })
    }

    const handleExportServicesExcel = () => {
        if (!svcData.length) return
        import('exceljs').then(({ Workbook }) => {
            const wb = new Workbook()
            const ws = wb.addWorksheet('Curva ABC Serviços')
            ws.addRow(['#', 'Código', 'Serviço', 'Qtd. Vendida', 'Receita', 'Comissão %', 'Valor da Comissão', 'Curva', 'Profissional'])
            svcData.forEach(r => ws.addRow([r.position, r.serviceCode || '—', r.serviceName, r.qtdSold, r.totalRevenue, `${r.commissionPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`, r.commissionValue, r.curve, r.employeeName]))
            ws.getRow(1).font = { bold: true }
            wb.xlsx.writeBuffer().then(buf => {
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'curva-abc-servicos.xlsx'; a.click()
                URL.revokeObjectURL(url)
            })
        })
    }

    // ─── Pending Receivables fetch ───
    const fetchReceivables = useCallback(async () => {
        setRecLoading(true)
        try {
            if (!effectiveTenantId) { setRecLoading(false); return }
            let query = (supabase as any)
                .from('pending_receivables')
                .select('id, customer_id, employee_id, amount, amount_paid, amount_remaining, launch_date, description, origin_type, customers(name), employees(name)')
                .eq('tenant_id', effectiveTenantId)
                .eq('status', 'PENDING')
                .eq('is_active', true)
                .order('launch_date', { ascending: false })

            if (recDateRange) {
                query = query
                    .gte('launch_date', recDateRange[0].format('YYYY-MM-DD'))
                    .lte('launch_date', recDateRange[1].format('YYYY-MM-DD'))
            }
            if (recEmployeeFilter) query = query.eq('employee_id', recEmployeeFilter)
            if (recClientFilter) query = query.eq('customer_id', recClientFilter)

            const { data, error } = await query
            if (error) throw error
            setRecData((data || []).map((r: any) => {
                const originalAmount = Number(r.amount) || 0
                const amountPaid = Number(r.amount_paid) || 0
                const amountRemaining = r.amount_remaining != null
                    ? Number(r.amount_remaining)
                    : originalAmount - amountPaid
                return {
                    id: r.id,
                    customerName: r.customers?.name || 'Sem cliente',
                    employeeName: r.employees?.name || 'Sem vendedor',
                    amount: originalAmount,
                    amountRemaining,
                    amountPaid,
                    launchDate: r.launch_date,
                    description: r.description || '',
                    originType: r.origin_type,
                    customerId: r.customer_id,
                    employeeId: r.employee_id,
                    sectionName: '—',
                }
            }))
        } catch (err: any) {
            messageApi.error('Erro ao carregar lançamentos a receber.')
            console.error(err)
        } finally {
            setRecLoading(false)
        }
    }, [effectiveTenantId, recDateRange, recEmployeeFilter, recClientFilter, messageApi])

    // ─── Commissions Report fetch ───
    const fetchCommissionsReport = useCallback(async () => {
        setCommLoading(true)
        try {
            if (!effectiveTenantId) { setCommLoading(false); return }
            const start = commDateRange[0].format('YYYY-MM-DD')
            const end = commDateRange[1].format('YYYY-MM-DD')

            let salesQuery: any = (supabase as any)
                .from('sales')
                .select('id, sale_code, sale_date, employee_id, customer_id, final_value, commission_amount, discount_value, description, budget_id')
                .eq('tenant_id', effectiveTenantId)
                .eq('is_active', true)
                .gte('sale_date', start)
                .lte('sale_date', end)
                .order('sale_date', { ascending: false })

            if (commEmployeeFilter) salesQuery = salesQuery.eq('employee_id', commEmployeeFilter)
            if (commSaleFilter) salesQuery = salesQuery.eq('id', commSaleFilter)

            let salesData: any[] | null = null
            const { data: salesFull, error: salesErr } = await salesQuery
            if (salesErr) {
                // Fallback: remove potentially missing columns
                const { data: salesSimple, error: salesErr2 } = await (supabase as any)
                    .from('sales')
                    .select('id, sale_code, sale_date, employee_id, customer_id, final_value, commission_amount, description, budget_id')
                    .eq('tenant_id', effectiveTenantId)
                    .eq('is_active', true)
                    .gte('sale_date', start)
                    .lte('sale_date', end)
                    .order('sale_date', { ascending: false })
                if (salesErr2) throw salesErr2
                salesData = salesSimple
            } else {
                salesData = salesFull
            }
            const sales = salesData
            if (!sales || sales.length === 0) {
                setCommData([])
                setCommLoading(false)
                return
            }

            const saleIds = sales.map((s: any) => s.id)

            const { data: items } = await (supabase as any)
                .from('sale_items')
                .select('sale_id, product_id, quantity, unit_price, discount, total, cost, commission_percent, profit_percent, product:products(id, name, cost_total)')
                .in('sale_id', saleIds)

            const itemsBySale = new Map<string, any[]>()
            for (const it of items || []) {
                const list = itemsBySale.get(it.sale_id) || []
                list.push(it)
                itemsBySale.set(it.sale_id, list)
            }

            const customerIds: string[] = [...new Set(sales.map((s: any) => s.customer_id).filter(Boolean) as string[])]
            const customerMap = new Map<string, string>()
            if (customerIds.length > 0) {
                const { data: cRows } = await (supabase as any).from('customers').select('id, name').in('id', customerIds)
                for (const c of cRows || []) customerMap.set(c.id, c.name)
            }

            const employeeIds: string[] = [...new Set(sales.map((s: any) => s.employee_id).filter(Boolean) as string[])]
            const employeeMap = new Map<string, string>()
            for (const e of (employees as any[])) employeeMap.set(e.id, e.name)
            if (employeeIds.length > 0) {
                const missing = employeeIds.filter((id: string) => !employeeMap.has(id))
                if (missing.length > 0) {
                    const { data: eRows } = await (supabase as any).from('employees').select('id, name').in('id', missing)
                    for (const e of eRows || []) employeeMap.set(e.id, e.name)
                }
            }

            const rows: CommissionReportRow[] = []
            for (const sale of sales) {
                const saleItems = itemsBySale.get(sale.id) || []

                if (commProductFilter && !saleItems.some((it: any) => it.product_id === commProductFilter)) continue

                let valorPreciso = 0
                let totalCost = 0
                const productIds: string[] = []
                const productNames: string[] = []
                for (const it of saleItems) {
                    const qty = Number(it.quantity) || 0
                    const unitPrice = Number(it.unit_price) || 0
                    valorPreciso += qty * unitPrice
                    const itemCost = it.cost != null ? Number(it.cost) : Number(it.product?.cost_total) || 0
                    totalCost += qty * itemCost
                    if (it.product_id && !productIds.includes(it.product_id)) {
                        productIds.push(it.product_id)
                        productNames.push(it.product?.name || 'Produto')
                    }
                }

                const valorVendido = Number(sale.final_value) || 0
                if (valorPreciso <= 0) valorPreciso = valorVendido + (Number(sale.discount_value) || 0)
                const comissaoPaga = Number(sale.commission_amount) || 0
                const percentVendedor = valorVendido > 0 ? (comissaoPaga / valorVendido) * 100 : 0
                const lucroEmpresa = valorVendido - totalCost - comissaoPaga

                rows.push({
                    saleId: sale.id,
                    saleCode: sale.sale_code || sale.description || sale.id.slice(0, 8),
                    saleDate: sale.sale_date,
                    customerName: customerMap.get(sale.customer_id) || 'Sem cliente',
                    employeeName: sale.employee_id ? (employeeMap.get(sale.employee_id) || 'Sem vendedor') : 'Sem vendedor',
                    employeeId: sale.employee_id,
                    productIds,
                    productNames,
                    valorPreciso,
                    valorVendido,
                    comissaoPaga,
                    percentVendedor,
                    lucroEmpresa,
                })
            }
            setCommData(rows)
        } catch (err: any) {
            messageApi.error('Erro ao carregar relatório de comissões.')
            console.error(err)
        } finally {
            setCommLoading(false)
        }
    }, [effectiveTenantId, commDateRange, commEmployeeFilter, commSaleFilter, commProductFilter, employees, messageApi])

    const handleOpenRegisterPayment = (record: PendingReceivableRow) => {
        setPayingRecord(record)
        payForm.resetFields()
        setPayModalOpen(true)
    }

    const handleRegisterPayment = async () => {
        try {
            const values = await payForm.validateFields()
            if (!payingRecord) return
            setPayingSaving(true)

            const tenantId = await getTenantId()
            const createdBy = await getCurrentUserId()
            if (!tenantId || !createdBy) {
                messageApi.error('Sessão expirada.')
                setPayingSaving(false)
                return
            }

            const isPartial = values.payment_type === 'PARTIAL'
            const effectiveRemaining = payingRecord.amountRemaining > 0 ? payingRecord.amountRemaining : payingRecord.amount
            const amountToPay = isPartial
                ? Math.min(Number(values.partial_amount) || 0, effectiveRemaining)
                : effectiveRemaining

            if (amountToPay <= 0) {
                messageApi.warning('Informe um valor válido para o pagamento parcial.')
                setPayingSaving(false)
                return
            }

            const newAmountPaid = payingRecord.amountPaid + amountToPay
            const newAmountRemaining = Math.max(0, effectiveRemaining - amountToPay)
            const isFullyPaid = newAmountRemaining <= 0

            // Update pending_receivables
            const { error: updErr } = await (supabase as any)
                .from('pending_receivables')
                .update({
                    status: isFullyPaid ? 'PAID' : 'PENDING',
                    amount_paid: newAmountPaid,
                    amount_remaining: newAmountRemaining,
                    payment_method: values.payment_method,
                    ...(isFullyPaid ? { paid_date: dayjs().format('YYYY-MM-DD'), paid_by: createdBy } : {}),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', payingRecord.id)

            if (updErr) throw updErr

            // Register in cash_entries
            const payLabel = REGISTER_PAYMENT_METHODS.find(p => p.value === values.payment_method)?.label || values.payment_method
            const partialSuffix = isPartial ? ' (parcial)' : ''
            if (values.payment_method === 'CARTAO_CREDITO' && !isPartial) {
                const numInstallments = values.installments || 1
                const now = new Date()
                const curYear = now.getFullYear()
                const curMonth = now.getMonth()
                const amountPerInstallment = amountToPay / numInstallments
                const installmentEntries = []
                for (let i = 1; i <= numInstallments; i++) {
                    const dueDate = new Date(curYear, curMonth + i, 1)
                    installmentEntries.push({
                        tenant_id: tenantId,
                        type: 'INCOME',
                        amount: amountPerInstallment,
                        due_date: dayjs(dueDate).format('YYYY-MM-DD'),
                        description: numInstallments > 1
                            ? `${payingRecord.description} — ${payLabel} (${i}/${numInstallments})`
                            : `${payingRecord.description} — ${payLabel}`,
                        payment_method: values.payment_method,
                        origin_type: 'SALE',
                        ...(numInstallments > 1 ? { installment_number: i, installment_total: numInstallments } : {}),
                        contact_id: payingRecord.customerId || null,
                        created_by: createdBy,
                    })
                }
                await (supabase as any).from('cash_entries').insert(installmentEntries)
            } else {
                await supabase.from('cash_entries').insert({
                    tenant_id: tenantId,
                    type: 'INCOME',
                    amount: amountToPay,
                    due_date: dayjs().format('YYYY-MM-DD'),
                    paid_date: dayjs().format('YYYY-MM-DD'),
                    description: `${payingRecord.description} — ${payLabel}${partialSuffix}`,
                    payment_method: values.payment_method,
                    origin_type: 'SALE',
                    contact_id: payingRecord.customerId || null,
                    created_by: createdBy,
                })
            }

            const successMsg = isPartial
                ? `Pagamento parcial de ${formatCurrency(amountToPay)} registrado! Restante: ${formatCurrency(newAmountRemaining)}`
                : 'Pagamento total registrado com sucesso!'
            messageApi.success(successMsg)
            setPayModalOpen(false)
            setPayingRecord(null)
            await fetchReceivables()
        } catch (err: any) {
            if (err?.errorFields) return
            messageApi.error('Erro ao registrar pagamento.')
            console.error(err)
        } finally {
            setPayingSaving(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'RECEIVABLES') fetchReceivables()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, recDateRange, recEmployeeFilter, recClientFilter])

    // ─── Product ABC fetch ───
    const fetchAbcReport = useCallback(async () => {
        setAbcLoading(true)
        try {
            if (!effectiveTenantId) { setAbcLoading(false); return }
            const startDate = abcDateRange[0].startOf('day').toISOString()
            const endDate = abcDateRange[1].endOf('day').toISOString()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let budgetsQuery: any = (supabase
                .from('budgets') as any)
                .select('id, employee_id, customer_id, created_at, commission_amount, total_value, global_discount_percent')
                .eq('tenant_id', effectiveTenantId)
                .eq('status', 'PAID')
                .eq('is_active', true)
                .gte('created_at', startDate)
                .lte('created_at', endDate)

            if (abcEmployeeFilter) {
                budgetsQuery = budgetsQuery.eq('employee_id', abcEmployeeFilter)
            }
            if (abcClientFilter) {
                budgetsQuery = budgetsQuery.eq('customer_id', abcClientFilter)
            }

            // Also fetch direct (balcão) sales in parallel
            let salesQuery: any = (supabase as any)
                .from('sales')
                .select('id, employee_id, customer_id, sale_date, commission_amount, final_value')
                .eq('tenant_id', effectiveTenantId)
                .eq('sale_type', 'MANUAL')
                .eq('is_active', true)
                .gte('sale_date', startDate)
                .lte('sale_date', endDate)
            if (abcEmployeeFilter) salesQuery = salesQuery.eq('employee_id', abcEmployeeFilter)
            if (abcClientFilter) salesQuery = salesQuery.eq('customer_id', abcClientFilter)

            const [{ data: budgets, error: budgetsErr }, { data: directSales }] = await Promise.all([
                budgetsQuery as Promise<{ data: any[] | null; error: any }>,
                salesQuery as Promise<{ data: any[] | null; error: any }>,
            ])
            if (budgetsErr) throw budgetsErr

            const budgetIds = (budgets || []).map((b: any) => b.id)

            // Build employee map with commission_percent and pre-calculated commission_amount
            const employeeMap = new Map<string, { name: string; commissionPercent: number; commissionAmount: number; totalValue: number }>()
            budgets.forEach((b: any) => {
                if (b.employee_id) {
                    const emp = (employees as any[]).find((e: any) => e.id === b.employee_id)
                    employeeMap.set(b.id, {
                        name: emp?.name || 'Desconhecido',
                        commissionPercent: Number(emp?.commission_percent) || 0,
                        commissionAmount: Number(b.commission_amount) || 0,
                        totalValue: Number(b.total_value) || 0,
                    })
                } else {
                    employeeMap.set(b.id, { name: 'Sem vendedor', commissionPercent: 0, commissionAmount: 0, totalValue: 0 })
                }
            })

            // Build budget -> employee_id map for per-seller splitting
            const budgetToEmployeeId = new Map<string, string | null>()
            budgets.forEach((b: any) => {
                budgetToEmployeeId.set(b.id, b.employee_id || null)
            })

            // Build budget -> global_discount_percent map (to apply proportionally per item)
            const budgetDiscountMap = new Map<string, number>()
            budgets.forEach((b: any) => {
                budgetDiscountMap.set(b.id, Number(b.global_discount_percent) || 0)
            })

            const queries: Promise<any>[] = []

            if (budgetIds.length > 0) {
                let itemsQuery: any = supabase
                    .from('budget_items')
                    .select('budget_id, product_id, quantity, unit_price, discount, product:products(id, name, code, cost_total, commission_percent, profit_percent, product_sections(id, name))')
                    .in('budget_id', budgetIds)
                if (abcProductFilter) itemsQuery = itemsQuery.eq('product_id', abcProductFilter)
                queries.push(itemsQuery)
            } else {
                queries.push(Promise.resolve({ data: [], error: null }))
            }

            const directSaleIds = (directSales || []).map((s: any) => s.id)
            if (directSaleIds.length > 0) {
                let saleItemsQuery: any = (supabase as any)
                    .from('sale_items')
                    .select('sale_id, product_id, quantity, unit_price, discount, product:products(id, name, code, cost_total, commission_percent, profit_percent, product_sections(id, name))')
                    .in('sale_id', directSaleIds)
                    .not('product_id', 'is', null)
                if (abcProductFilter) saleItemsQuery = saleItemsQuery.eq('product_id', abcProductFilter)
                queries.push(saleItemsQuery)
            } else {
                queries.push(Promise.resolve({ data: [], error: null }))
            }

            const [{ data: items, error: itemsErr }, { data: saleItems }] = await Promise.all(queries)
            if (itemsErr) throw itemsErr

            if ((!items || items.length === 0) && (!saleItems || saleItems.length === 0) && (!directSales || directSales.length === 0)) {
                setAbcData([])
                setAbcLoading(false)
                return
            }

            // Determine if we need per-seller rows (when client is selected but no specific seller)
            const hasSellerFilter = !!abcEmployeeFilter
            const hasClientFilter = !!abcClientFilter

            // Aggregate by product + employee when client filter is set (to show per-seller rows)
            const shouldSplitBySeller = hasClientFilter && !hasSellerFilter

            const productAgg = new Map<string, {
                productId: string
                productCode: string | null
                productName: string
                sectionName: string
                qtdSold: number
                totalRevenue: number
                totalCost: number
                employees: Set<string>
                commissionPercent: number
                commissionValue: number
                commissionWeightedSum: number
            }>()

            for (const item of (items || [])) {
                const product = (item as any).product
                if (!product) continue
                const productId = product.id
                const productCode = product.code || null
                const productName = product.name || 'Sem nome'
                const sectionName = (product as any).product_sections?.name || '—'
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unit_price) || 0
                const discount = Number(item.discount) || 0
                const globalDiscountPct = budgetDiscountMap.get(item.budget_id) || 0
                const revenue = ((unitPrice * qty) - discount) * (1 - globalDiscountPct / 100)
                const costPerUnit = Number(product.cost_total) || 0
                const totalCost = costPerUnit * qty

                const empInfo = employeeMap.get(item.budget_id) || { name: 'Sem vendedor', commissionPercent: 0, commissionAmount: 0, totalValue: 0 }
                const empName = empInfo.name
                const prodCommPct = Number(product.commission_percent) || 0

                // Discount proportionally reduces commission: factor = applied% / (commission% + profit%)
                const prodProfitPct = Number(product.profit_percent) || 0
                const maxDiscPct = prodCommPct + prodProfitPct
                const discountFactor = maxDiscPct > 0 ? globalDiscountPct / maxDiscPct : 0
                const effectiveCommPct = prodCommPct * (1 - discountFactor)
                const commissionPct = effectiveCommPct
                const commissionVal = revenue * (effectiveCommPct / 100)

                const aggKey = shouldSplitBySeller
                    ? `${productId}::${budgetToEmployeeId.get(item.budget_id) || 'none'}`
                    : productId

                const existing = productAgg.get(aggKey)
                if (existing) {
                    existing.qtdSold += qty
                    existing.totalRevenue += revenue
                    existing.totalCost += totalCost
                    existing.employees.add(empName)
                    existing.commissionValue += commissionVal
                    existing.commissionWeightedSum += commissionPct * revenue
                } else {
                    productAgg.set(aggKey, {
                        productId,
                        productCode,
                        productName,
                        sectionName,
                        qtdSold: qty,
                        totalRevenue: revenue,
                        totalCost: totalCost,
                        employees: new Set([empName]),
                        commissionPercent: commissionPct,
                        commissionValue: commissionVal,
                        commissionWeightedSum: commissionPct * revenue,
                    })
                }
            }

            // Build sale_id → sale info map for direct sales
            const saleInfoMap = new Map<string, any>()
            ;(directSales || []).forEach((s: any) => { saleInfoMap.set(s.id, s) })

            // Pre-calculate gross revenue per sale (before global discount) for sale_items
            const saleGrossMap = new Map<string, number>()
            for (const item of (saleItems || [])) {
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unit_price) || 0
                const discount = Number(item.discount) || 0
                saleGrossMap.set(item.sale_id, (saleGrossMap.get(item.sale_id) || 0) + (unitPrice * qty - discount))
            }

            // Process sale_items into productAgg
            for (const item of (saleItems || [])) {
                const product = (item as any).product
                if (!product) continue
                const productId = product.id
                const productCode = product.code || null
                const productName = product.name || 'Sem nome'
                const sectionName = (product as any).product_sections?.name || '—'
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unit_price) || 0
                const discount = Number(item.discount) || 0
                const costPerUnit = Number(product.cost_total) || 0
                const totalCost = costPerUnit * qty

                const sale = saleInfoMap.get(item.sale_id)
                // Apply global discount from sale: final_value reflects total after discount
                const saleGross = saleGrossMap.get(item.sale_id) || 0
                const saleFinalVal = Number(sale?.final_value) || saleGross
                const discountMultiplier = saleGross > 0 && saleFinalVal <= saleGross ? saleFinalVal / saleGross : 1
                const revenue = ((unitPrice * qty) - discount) * discountMultiplier

                const emp = sale?.employee_id
                    ? (employees as any[]).find((e: any) => e.id === sale.employee_id)
                    : null
                const empName = emp?.name || 'Sem vendedor'
                const prodItemCommPct = Number(product.commission_percent) || 0
                const saleEmployeeId = sale?.employee_id || null

                // Discount proportionally reduces commission: factor = applied% / (commission% + profit%)
                const prodProfitPct = Number(product.profit_percent) || 0
                const maxDiscPct = prodItemCommPct + prodProfitPct
                const appliedDiscPct = (1 - discountMultiplier) * 100
                const discountFactor = maxDiscPct > 0 ? appliedDiscPct / maxDiscPct : 0
                const effectiveCommPct = prodItemCommPct * (1 - discountFactor)
                const commissionPct = effectiveCommPct
                const commissionVal = revenue * (effectiveCommPct / 100)

                const aggKey = shouldSplitBySeller
                    ? `${productId}::${saleEmployeeId || 'none'}`
                    : productId

                const existing = productAgg.get(aggKey)
                if (existing) {
                    existing.qtdSold += qty
                    existing.totalRevenue += revenue
                    existing.totalCost += totalCost
                    existing.employees.add(empName)
                    existing.commissionValue += commissionVal
                    existing.commissionWeightedSum += commissionPct * revenue
                } else {
                    productAgg.set(aggKey, {
                        productId, productCode, productName, sectionName, qtdSold: qty,
                        totalRevenue: revenue, totalCost, employees: new Set([empName]),
                        commissionPercent: commissionPct, commissionValue: commissionVal,
                        commissionWeightedSum: commissionPct * revenue,
                    })
                }
            }

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
                // Média ponderada de comissão % por receita
                const avgCommissionPct = p.totalRevenue > 0 ? p.commissionWeightedSum / p.totalRevenue : p.commissionPercent

                return {
                    position: idx + 1,
                    productId: p.productId,
                    productCode: p.productCode,
                    productName: p.productName,
                    sectionName: p.sectionName,
                    qtdSold: p.qtdSold,
                    totalRevenue: p.totalRevenue,
                    totalCost: p.totalCost,
                    profitMargin,
                    marginPercent,
                    commissionPercent: avgCommissionPct,
                    commissionValue: p.commissionValue,
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
    }, [abcDateRange, abcEmployeeFilter, abcProductFilter, abcClientFilter, employees, effectiveTenantId, messageApi])

    // ─── Service ABC fetch ───
    const fetchSvcReport = useCallback(async () => {
        setSvcLoading(true)
        try {
            if (!effectiveTenantId) { setSvcLoading(false); return }
            const startDate = svcDateRange[0].startOf('day').format('YYYY-MM-DD')
            const endDate = svcDateRange[1].endOf('day').format('YYYY-MM-DD')

            // ── Fonte 1: completed_services (serviços via Agenda) ──
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let csQuery: any = (supabase as any)
                .from('completed_services')
                .select('id, service_id, service_name, employee_id, customer_id, base_price, final_price, total_revenue, discount_percent, service_date, service:services(code, commission_percent, profit_percent)')
                .eq('tenant_id', effectiveTenantId)
                .gte('service_date', startDate)
                .lte('service_date', endDate)
            if (svcEmployeeFilter) csQuery = csQuery.eq('employee_id', svcEmployeeFilter)
            if (svcClientFilter) csQuery = csQuery.eq('customer_id', svcClientFilter)

            // ── Fonte 2: sale_items com service_id (serviços via Vendas) ──
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let salesQuery: any = (supabase as any)
                .from('sales')
                .select('id, employee_id, customer_id, sale_date, final_value')
                .eq('tenant_id', effectiveTenantId)
                .eq('is_active', true)
                .gte('sale_date', startDate)
                .lte('sale_date', endDate)
            if (svcEmployeeFilter) salesQuery = salesQuery.eq('employee_id', svcEmployeeFilter)
            if (svcClientFilter) salesQuery = salesQuery.eq('customer_id', svcClientFilter)

            const [{ data: completedServices, error: csErr }, { data: directSales }] = await Promise.all([
                csQuery as Promise<{ data: any[] | null; error: any }>,
                salesQuery as Promise<{ data: any[] | null; error: any }>,
            ])
            if (csErr) throw csErr

            // Buscar sale_items de serviços para as vendas encontradas
            let saleServiceItems: any[] = []
            const directSaleIds = (directSales || []).map((s: any) => s.id)
            if (directSaleIds.length > 0) {
                const { data: siData } = await (supabase as any)
                    .from('sale_items')
                    .select('sale_id, service_id, quantity, unit_price, discount, description, service:services(id, name, code, cost_total, commission_percent, profit_percent)')
                    .in('sale_id', directSaleIds)
                    .not('service_id', 'is', null)
                saleServiceItems = siData || []
            }

            if ((!completedServices || completedServices.length === 0) && saleServiceItems.length === 0) {
                setSvcData([])
                setSvcLoading(false)
                return
            }

            const hasSellerFilter = !!svcEmployeeFilter
            const hasClientFilter = !!svcClientFilter
            const shouldSplitBySeller = hasClientFilter && !hasSellerFilter

            // Aggregate by service_id (or service_name for unlinked services)
            const serviceAgg = new Map<string, {
                serviceId: string
                serviceCode: string | null
                serviceName: string
                qtdSold: number
                totalRevenue: number
                totalCost: number
                employees: Set<string>
                commissionPercent: number
                commissionValue: number
                commissionWeightedSum: number
            }>()

            // ── Processar completed_services (Agenda) ──
            for (const svc of (completedServices || [])) {
                // Use serviceId as key to unify with sale_items from the same service
                const serviceKey = svc.service_id || `name:${svc.service_name}`
                const serviceName = svc.service_name || 'Sem nome'
                const serviceCode = (svc as any).service?.code || null
                const revenue = Number(svc.total_revenue) || Number(svc.final_price) || 0
                const cost = Number(svc.base_price) || 0

                const emp = svc.employee_id
                    ? (employees as any[]).find((e: any) => e.id === svc.employee_id)
                    : null
                const empName = emp?.name || (svc.employee_id ? 'Desconhecido' : 'Sem vendedor')
                const svcCommPct = Number((svc as any).service?.commission_percent) || 0
                const discPct = Number(svc.discount_percent) || 0

                // Discount proportionally reduces commission: factor = applied% / (commission% + profit%)
                const svcProfitPct = Number((svc as any).service?.profit_percent) || 0
                const maxDiscPct = svcCommPct + svcProfitPct
                const discountFactor = maxDiscPct > 0 ? discPct / maxDiscPct : 0
                const effectiveSvcCommPct = svcCommPct * (1 - discountFactor)
                const commissionPct = effectiveSvcCommPct
                const commissionVal = revenue * (effectiveSvcCommPct / 100)

                const aggKey = shouldSplitBySeller
                    ? `${serviceKey}::${svc.employee_id || 'none'}`
                    : serviceKey

                const existing = serviceAgg.get(aggKey)
                if (existing) {
                    existing.qtdSold += 1
                    existing.totalRevenue += revenue
                    existing.totalCost += cost
                    existing.employees.add(empName)
                    existing.commissionValue += commissionVal
                    existing.commissionWeightedSum += commissionPct * revenue
                } else {
                    serviceAgg.set(aggKey, {
                        serviceId: svc.service_id || svc.id,
                        serviceCode,
                        serviceName,
                        qtdSold: 1,
                        totalRevenue: revenue,
                        totalCost: cost,
                        employees: new Set([empName]),
                        commissionPercent: commissionPct,
                        commissionValue: commissionVal,
                        commissionWeightedSum: commissionPct * revenue,
                    })
                }
            }

            // ── Processar sale_items de serviços (Vendas) ──
            const saleInfoMap = new Map<string, any>()
            ;(directSales || []).forEach((s: any) => { saleInfoMap.set(s.id, s) })

            // Pre-calculate gross revenue per sale for service items
            const svcSaleGrossMap = new Map<string, number>()
            for (const item of saleServiceItems) {
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unit_price) || 0
                const discount = Number(item.discount) || 0
                svcSaleGrossMap.set(item.sale_id, (svcSaleGrossMap.get(item.sale_id) || 0) + (unitPrice * qty - discount))
            }

            for (const item of saleServiceItems) {
                const service = (item as any).service
                const serviceId = item.service_id
                const serviceCode = service?.code || null
                const serviceName = service?.name || item.description || 'Sem nome'
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unit_price) || 0
                const discount = Number(item.discount) || 0
                const costTotal = Number(service?.cost_total) || 0
                const totalCost = costTotal * qty

                const sale = saleInfoMap.get(item.sale_id)
                // Apply global discount from sale: final_value reflects total after discount
                const saleGross = svcSaleGrossMap.get(item.sale_id) || 0
                const saleFinalVal = Number(sale?.final_value) || saleGross
                const discountMultiplier = saleGross > 0 && saleFinalVal <= saleGross ? saleFinalVal / saleGross : 1
                const revenue = ((unitPrice * qty) - discount) * discountMultiplier

                const emp = sale?.employee_id
                    ? (employees as any[]).find((e: any) => e.id === sale.employee_id)
                    : null
                const empName = emp?.name || 'Sem vendedor'
                const svcItemCommPct = Number((item as any).service?.commission_percent) || 0
                const saleEmployeeId = sale?.employee_id || null

                // Discount proportionally reduces commission: factor = applied% / (commission% + profit%)
                const svcProfitPct = Number((item as any).service?.profit_percent) || 0
                const maxDiscPct = svcItemCommPct + svcProfitPct
                const appliedDiscPct = (1 - discountMultiplier) * 100
                const discountFactor = maxDiscPct > 0 ? appliedDiscPct / maxDiscPct : 0
                const effectiveSvcItemCommPct = svcItemCommPct * (1 - discountFactor)
                const commissionPct = effectiveSvcItemCommPct
                const commissionVal = revenue * (effectiveSvcItemCommPct / 100)

                // Use same key format as completed_services to merge both sources
                const aggKey = shouldSplitBySeller
                    ? `${serviceId}::${saleEmployeeId || 'none'}`
                    : serviceId

                const existing = serviceAgg.get(aggKey)
                if (existing) {
                    existing.qtdSold += qty
                    existing.totalRevenue += revenue
                    existing.totalCost += totalCost
                    existing.employees.add(empName)
                    existing.commissionValue += commissionVal
                    existing.commissionWeightedSum += commissionPct * revenue
                    if (!existing.serviceCode && serviceCode) existing.serviceCode = serviceCode
                } else {
                    serviceAgg.set(aggKey, {
                        serviceId,
                        serviceCode,
                        serviceName,
                        qtdSold: qty,
                        totalRevenue: revenue,
                        totalCost,
                        employees: new Set([empName]),
                        commissionPercent: commissionPct,
                        commissionValue: commissionVal,
                        commissionWeightedSum: commissionPct * revenue,
                    })
                }
            }

            const sorted = Array.from(serviceAgg.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
            const grandTotal = sorted.reduce((sum, s) => sum + s.totalRevenue, 0)

            let cumulative = 0
            const rows: ABCServiceRow[] = sorted.map((s, idx) => {
                cumulative += s.totalRevenue
                const cumulativePercent = grandTotal > 0 ? (cumulative / grandTotal) * 100 : 0
                let curve: 'A' | 'B' | 'C' = 'C'
                if (cumulativePercent <= 80) curve = 'A'
                else if (cumulativePercent <= 95) curve = 'B'

                const profitMargin = s.totalRevenue - s.totalCost
                const marginPercent = s.totalRevenue > 0 ? (profitMargin / s.totalRevenue) * 100 : 0
                // Média ponderada de comissão % por receita
                const avgCommissionPct = s.totalRevenue > 0 ? s.commissionWeightedSum / s.totalRevenue : s.commissionPercent

                return {
                    position: idx + 1,
                    serviceId: s.serviceId,
                    serviceCode: s.serviceCode,
                    serviceName: s.serviceName,
                    qtdSold: s.qtdSold,
                    totalRevenue: s.totalRevenue,
                    totalCost: s.totalCost,
                    profitMargin,
                    marginPercent,
                    commissionPercent: avgCommissionPct,
                    commissionValue: s.commissionValue,
                    curve,
                    employeeName: Array.from(s.employees).join(', '),
                }
            })

            setSvcData(rows)
        } catch (error: any) {
            messageApi.error('Erro ao carregar relatório ABC de serviços: ' + (error.message || 'Erro desconhecido'))
        } finally {
            setSvcLoading(false)
        }
    }, [svcDateRange, svcEmployeeFilter, svcClientFilter, employees, effectiveTenantId, messageApi])

    // Auto-fetch on tab switch and filter change
    useEffect(() => {
        if (activeTab === 'PRODUCTS') fetchAbcReport()
    }, [activeTab, fetchAbcReport])

    useEffect(() => {
        if (activeTab === 'SERVICES') fetchSvcReport()
    }, [activeTab, fetchSvcReport])

    useEffect(() => {
        if (activeTab === 'COMMISSIONS') fetchCommissionsReport()
    }, [activeTab, fetchCommissionsReport])

    // ─── KPIs ───
    const abcTotalRevenue = useMemo(() => abcData.reduce((sum, r) => sum + r.totalRevenue, 0), [abcData])
    const abcTotalProducts = abcData.length
    const abcAvgMargin = useMemo(() => {
        if (abcData.length === 0) return 0
        return abcData.reduce((sum, r) => sum + r.marginPercent, 0) / abcData.length
    }, [abcData])

    const svcTotalRevenue = useMemo(() => svcData.reduce((sum, r) => sum + r.totalRevenue, 0), [svcData])
    const svcTotalServices = svcData.length
    const svcAvgMargin = useMemo(() => {
        if (svcData.length === 0) return 0
        return svcData.reduce((sum, r) => sum + r.marginPercent, 0) / svcData.length
    }, [svcData])

    // ─── Product columns ───
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
            render: (text: string, r: ABCReportRow) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{text}</span>
                    {r.productCode && (
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#7A5AF8', fontWeight: 600 }}>
                            {r.productCode}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Seção',
            dataIndex: 'sectionName',
            key: 'sectionName',
            width: 140,
            ellipsis: true,
            render: (v: string) => v && v !== '—' ? <Tag>{v}</Tag> : <span style={{ color: '#D0D5DD' }}>—</span>,
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
            title: 'Comissão %',
            dataIndex: 'commissionPercent',
            key: 'commissionPercent',
            width: 110,
            align: 'right',
            sorter: (a, b) => a.commissionPercent - b.commissionPercent,
            render: (v: number) => (
                <span style={{ fontWeight: 600 }}>
                    {v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
                </span>
            ),
        },
        {
            title: 'Valor da Comissão',
            dataIndex: 'commissionValue',
            key: 'commissionValue',
            width: 150,
            align: 'right',
            sorter: (a, b) => a.commissionValue - b.commissionValue,
            render: (v: number) => (
                <span style={{ color: v > 0 ? '#4ade80' : 'inherit', fontWeight: 600 }}>
                    {formatCurrency(v)}
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

    // ─── Service columns ───
    const svcColumns: ColumnsType<ABCServiceRow> = [
        {
            title: 'Pos.',
            dataIndex: 'position',
            key: 'position',
            width: 60,
            align: 'center',
            render: (v: number) => <strong>{v}</strong>,
        },
        {
            title: 'Serviço',
            dataIndex: 'serviceName',
            key: 'serviceName',
            sorter: (a, b) => a.serviceName.localeCompare(b.serviceName),
            render: (text: string, r: ABCServiceRow) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{text}</span>
                    {r.serviceCode && (
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#7A5AF8', fontWeight: 600 }}>
                            {r.serviceCode}
                        </div>
                    )}
                </div>
            ),
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
            title: 'Comissão %',
            dataIndex: 'commissionPercent',
            key: 'commissionPercent',
            width: 110,
            align: 'right',
            sorter: (a, b) => a.commissionPercent - b.commissionPercent,
            render: (v: number) => (
                <span style={{ fontWeight: 600 }}>
                    {v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
                </span>
            ),
        },
        {
            title: 'Valor da Comissão',
            dataIndex: 'commissionValue',
            key: 'commissionValue',
            width: 150,
            align: 'right',
            sorter: (a, b) => a.commissionValue - b.commissionValue,
            render: (v: number) => (
                <span style={{ color: v > 0 ? '#4ade80' : 'inherit', fontWeight: 600 }}>
                    {formatCurrency(v)}
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

    // Products list for ABC filter dropdown
    const allProducts = useMemo(() => {
        return (rawProducts || []).map((p: any) => ({ value: p.id, label: p.name }))
    }, [rawProducts])

    // Customers list for filter dropdown
    const allCustomers = useMemo(() => {
        return (customers || []).map((c: any) => ({ value: c.id, label: c.name }))
    }, [customers])

    // ─── Commission columns ───
    const commColumns: ColumnsType<CommissionReportRow> = [
        {
            title: 'Data',
            dataIndex: 'saleDate',
            key: 'saleDate',
            width: 110,
            render: (v: string) => dayjs(v + 'T00:00:00').format('DD/MM/YYYY'),
            sorter: (a, b) => a.saleDate.localeCompare(b.saleDate),
        },
        {
            title: 'Pedido',
            dataIndex: 'saleCode',
            key: 'saleCode',
            width: 140,
            ellipsis: true,
            render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#7A5AF8' }}>{v}</span>,
        },
        {
            title: 'Cliente',
            dataIndex: 'customerName',
            key: 'customerName',
            ellipsis: true,
            sorter: (a, b) => a.customerName.localeCompare(b.customerName),
        },
        {
            title: 'Vendedor',
            dataIndex: 'employeeName',
            key: 'employeeName',
            width: 160,
            ellipsis: true,
            sorter: (a, b) => a.employeeName.localeCompare(b.employeeName),
        },
        {
            title: 'Produtos',
            dataIndex: 'productNames',
            key: 'productNames',
            ellipsis: true,
            render: (names: string[]) => names.length ? <span style={{ fontSize: 12, color: '#94a3b8' }}>{names.join(', ')}</span> : <span style={{ color: '#D0D5DD' }}>—</span>,
        },
        {
            title: 'Valor Preciso',
            dataIndex: 'valorPreciso',
            key: 'valorPreciso',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.valorPreciso - b.valorPreciso,
            render: (v: number) => <span style={{ fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
        {
            title: 'Valor Vendido',
            dataIndex: 'valorVendido',
            key: 'valorVendido',
            width: 140,
            align: 'right',
            sorter: (a, b) => a.valorVendido - b.valorVendido,
            render: (v: number) => <span style={{ color: '#4ade80', fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
        {
            title: 'Comissão Paga',
            dataIndex: 'comissaoPaga',
            key: 'comissaoPaga',
            width: 140,
            align: 'right',
            sorter: (a, b) => a.comissaoPaga - b.comissaoPaga,
            render: (v: number) => <span style={{ color: v > 0 ? '#f59e0b' : 'inherit', fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
        {
            title: '% Vendedor',
            dataIndex: 'percentVendedor',
            key: 'percentVendedor',
            width: 110,
            align: 'right',
            sorter: (a, b) => a.percentVendedor - b.percentVendedor,
            render: (v: number) => <span style={{ fontWeight: 600 }}>{v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>,
        },
        {
            title: 'Lucro Empresa',
            dataIndex: 'lucroEmpresa',
            key: 'lucroEmpresa',
            width: 140,
            align: 'right',
            sorter: (a, b) => a.lucroEmpresa - b.lucroEmpresa,
            render: (v: number) => <span style={{ color: v >= 0 ? '#4ade80' : '#ef4444', fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
    ]

    const commTotalVendido = useMemo(() => commData.reduce((s, r) => s + r.valorVendido, 0), [commData])
    const commTotalComissao = useMemo(() => commData.reduce((s, r) => s + r.comissaoPaga, 0), [commData])
    const commTotalLucro = useMemo(() => commData.reduce((s, r) => s + r.lucroEmpresa, 0), [commData])

    const handleExportCommissionsExcel = () => {
        if (!commData.length) return
        import('exceljs').then(({ Workbook }) => {
            const wb = new Workbook()
            const ws = wb.addWorksheet('Comissões')
            ws.addRow(['Data', 'Pedido', 'Cliente', 'Vendedor', 'Produtos', 'Valor Preciso', 'Valor Vendido', 'Comissão Paga', '% Vendedor', 'Lucro Empresa'])
            commData.forEach(r => ws.addRow([
                dayjs(r.saleDate + 'T00:00:00').format('DD/MM/YYYY'),
                r.saleCode,
                r.customerName,
                r.employeeName,
                r.productNames.join(', '),
                r.valorPreciso,
                r.valorVendido,
                r.comissaoPaga,
                `${r.percentVendedor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
                r.lucroEmpresa,
            ]))
            ws.getRow(1).font = { bold: true }
            wb.xlsx.writeBuffer().then(buf => {
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'relatorio-comissoes.xlsx'; a.click()
                URL.revokeObjectURL(url)
            })
        })
    }

    const handleExportCommissionsPdf = () => {
        if (!commData.length) return
        exportTableToPdf({
            title: 'Relatório de Comissões',
            subtitle: `Período: ${commDateRange[0].format('DD/MM/YYYY')} a ${commDateRange[1].format('DD/MM/YYYY')}`,
            headers: ['Data', 'Pedido', 'Cliente', 'Vendedor', 'V. Preciso', 'V. Vendido', 'Comissão', '% Vend.', 'Lucro'],
            rows: commData.map(r => [
                dayjs(r.saleDate + 'T00:00:00').format('DD/MM/YYYY'),
                r.saleCode,
                r.customerName,
                r.employeeName,
                formatCurrency(r.valorPreciso),
                formatCurrency(r.valorVendido),
                formatCurrency(r.comissaoPaga),
                `${r.percentVendedor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
                formatCurrency(r.lucroEmpresa),
            ]),
            filename: 'relatorio-comissoes.pdf',
        })
    }

    const renderCommissionSummary = () => {
        if (commData.length === 0) return null
        return (
            <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={6}>TOTAL</Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                        <span style={{ color: '#4ade80' }}>{formatCurrency(commTotalVendido)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                        <span style={{ color: '#f59e0b' }}>{formatCurrency(commTotalComissao)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">—</Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">
                        <span style={{ color: commTotalLucro >= 0 ? '#4ade80' : '#ef4444' }}>{formatCurrency(commTotalLucro)}</span>
                    </Table.Summary.Cell>
                </Table.Summary.Row>
            </Table.Summary>
        )
    }

    // Summary row renderer for products
    const renderProductSummary = () => {
        if (abcData.length === 0) return null
        const totalRev = abcData.reduce((s, r) => s + r.totalRevenue, 0)
        const totalCommission = abcData.reduce((s, r) => s + r.commissionValue, 0)
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
                        —
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                        <span style={{ color: totalCommission > 0 ? '#4ade80' : 'inherit' }}>
                            {formatCurrency(totalCommission)}
                        </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} colSpan={2} />
                </Table.Summary.Row>
            </Table.Summary>
        )
    }

    // Summary row renderer for services
    const renderServiceSummary = () => {
        if (svcData.length === 0) return null
        const totalRev = svcData.reduce((s, r) => s + r.totalRevenue, 0)
        const totalCommission = svcData.reduce((s, r) => s + r.commissionValue, 0)
        return (
            <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={2}>TOTAL</Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                        {svcData.reduce((s, r) => s + r.qtdSold, 0)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                        <span style={{ color: '#4ade80' }}>{formatCurrency(totalRev)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                        —
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                        <span style={{ color: totalCommission > 0 ? '#4ade80' : 'inherit' }}>
                            {formatCurrency(totalCommission)}
                        </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} colSpan={2} />
                </Table.Summary.Row>
            </Table.Summary>
        )
    }

    if (!canView(MODULES.SALES_REPORT)) {
        return (
            <Layout title={PAGE_TITLES.SALES_REPORT}>
                <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
            </Layout>
        )
    }

    const recTotalAmount = recData.reduce((s, r) => s + r.amount, 0)

    const recColumns: ColumnsType<PendingReceivableRow> = [
        {
            title: 'Data',
            dataIndex: 'launchDate',
            render: (v: string) => dayjs(v + 'T00:00:00').format('DD/MM/YYYY'),
            sorter: (a, b) => a.launchDate.localeCompare(b.launchDate),
        },
        { title: 'Cliente', dataIndex: 'customerName', sorter: (a, b) => a.customerName.localeCompare(b.customerName) },
        { title: 'Vendedor', dataIndex: 'employeeName', sorter: (a, b) => a.employeeName.localeCompare(b.employeeName) },
        {
            title: 'Seção',
            dataIndex: 'sectionName',
            key: 'sectionName',
            width: 140,
            ellipsis: true,
            render: (v: string) => v && v !== '—' ? <Tag>{v}</Tag> : <span style={{ color: '#D0D5DD' }}>—</span>,
        },
        {
            title: 'Valor original',
            dataIndex: 'amount',
            align: 'right',
            render: (v: number) => <span style={{ fontWeight: 600, color: '#f59e0b' }}>{formatCurrency(v)}</span>,
            sorter: (a, b) => a.amount - b.amount,
        },
        {
            title: 'Saldo em Haver',
            dataIndex: 'amountRemaining',
            align: 'right',
            render: (v: number) => <span style={{ fontWeight: 600, color: v > 0 ? '#EF4444' : '#12B76A' }}>{formatCurrency(v)}</span>,
            sorter: (a, b) => a.amountRemaining - b.amountRemaining,
        },
        {
            title: 'Ação',
            align: 'center',
            render: (_, record) => canRegisterPayment ? (
                <Button
                    size="small"
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleOpenRegisterPayment(record)}
                >
                    Registrar Pagamento
                </Button>
            ) : (
                <Tag color="warning">Aguardando Admin</Tag>
            ),
        },
    ]

    return (
        <Layout title={PAGE_TITLES.SALES_REPORT} subtitle="Curva ABC de produtos e serviços vendidos">
            {contextHolder}

            {/* Modal para registrar pagamento de lançamento a receber */}
            <Modal
                title="Registrar Pagamento"
                open={payModalOpen}
                onCancel={() => { setPayModalOpen(false); setPayingRecord(null) }}
                onOk={handleRegisterPayment}
                okText="Confirmar Pagamento"
                confirmLoading={payingSaving}
                okButtonProps={{ disabled: !canRegisterPayment }}
            >
                {payingRecord && (
                    <div style={{ marginBottom: 16, padding: '12px 16px', background: '#1e293b', borderRadius: 8 }}>
                        <p style={{ margin: '4px 0' }}><strong>Cliente:</strong> {payingRecord.customerName}</p>
                        <p style={{ margin: '4px 0' }}><strong>Valor original:</strong> {formatCurrency(payingRecord.amount)}</p>
                        {payingRecord.amountPaid > 0 && (
                            <p style={{ margin: '4px 0', color: '#12B76A' }}><strong>Já pago:</strong> {formatCurrency(payingRecord.amountPaid)}</p>
                        )}
                        <p style={{ margin: '4px 0', color: '#F79009', fontWeight: 700 }}>
                            <strong>Saldo pendente:</strong> {formatCurrency(payingRecord.amountRemaining > 0 ? payingRecord.amountRemaining : payingRecord.amount)}
                        </p>
                        <p style={{ margin: '4px 0', fontSize: 12, color: '#94a3b8' }}><strong>Descrição:</strong> {payingRecord.description}</p>
                    </div>
                )}
                <Form form={payForm} layout="vertical" initialValues={{ payment_type: 'FULL' }}>
                    <Form.Item name="payment_type" label="Tipo de Pagamento">
                        <Select>
                            <Select.Option value="FULL">Pagamento Total</Select.Option>
                            <Select.Option value="PARTIAL">Pagamento Parcial</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.payment_type !== cur.payment_type}>
                        {({ getFieldValue }) => getFieldValue('payment_type') === 'PARTIAL' ? (
                            <Form.Item name="partial_amount" label="Valor a pagar agora (R$)" rules={[{ required: true, message: 'Informe o valor parcial' }]}>
                                <input
                                    type="number"
                                    min={0.01}
                                    step={0.01}
                                    style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#f1f5f9' }}
                                    placeholder="Ex: 50.00"
                                    onChange={(e) => payForm.setFieldsValue({ partial_amount: parseFloat(e.target.value) })}
                                />
                            </Form.Item>
                        ) : null}
                    </Form.Item>
                    <Form.Item name="payment_method" label="Forma de Pagamento" rules={[{ required: true, message: 'Selecione a forma de pagamento' }]}>
                        <Select options={REGISTER_PAYMENT_METHODS} placeholder="Selecione..." />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.payment_method !== cur.payment_method || prev.payment_type !== cur.payment_type}>
                        {({ getFieldValue }) => getFieldValue('payment_method') === 'CARTAO_CREDITO' && getFieldValue('payment_type') !== 'PARTIAL' ? (
                            <Form.Item name="installments" label="Parcelas" initialValue={1}>
                                <Select options={[1,2,3,4,5,6,7,8,9,10,11,12].map(n => ({ value: n, label: `${n}x` }))} />
                            </Form.Item>
                        ) : null}
                    </Form.Item>
                </Form>
            </Modal>

            <div className="pc-card--table">
                <Tabs
                    activeKey={activeTab}
                    onChange={(k) => setActiveTab(k as 'RECEIVABLES' | 'COMMISSIONS' | 'PRODUCTS' | 'SERVICES')}
                    items={[
                        {
                            key: 'RECEIVABLES',
                            label: (
                                <span><ClockCircleOutlined style={{ marginRight: 6 }} />Recebimento / Lançamentos Futuros</span>
                            ),
                        },
                        {
                            key: 'COMMISSIONS',
                            label: (
                                <span><TeamOutlined style={{ marginRight: 6 }} />Relatório de Comissões</span>
                            ),
                        },
                        {
                            key: 'PRODUCTS',
                            label: (
                                <span><ShoppingOutlined style={{ marginRight: 6 }} />Curva ABC - Produtos</span>
                            ),
                        },
                        ...(!isRevenda ? [{
                            key: 'SERVICES',
                            label: (
                                <span><CustomerServiceOutlined style={{ marginRight: 6 }} />Curva ABC - Serviços</span>
                            ),
                        }] : []),
                    ]}
                />

                {activeTab === 'RECEIVABLES' ? (
                    <div>
                        <div className="kpi-grid" style={{ marginBottom: 20 }}>
                            <CardKPI title="Total a Receber" value={formatCurrency(recTotalAmount)} icon={<ClockCircleOutlined />} variant="orange" />
                            <CardKPI title="Lançamentos Pendentes" value={recData.length} icon={<DollarOutlined />} variant="blue" />
                        </div>

                        <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#94a3b8' }} />
                                <span style={{ color: '#94a3b8', fontSize: 13 }}>Filtros:</span>
                            </div>
                            <DatePicker.RangePicker
                                value={recDateRange}
                                onChange={(dates) => {
                                    if (dates && dates[0] && dates[1]) setRecDateRange([dates[0], dates[1]])
                                    else setRecDateRange(null)
                                }}
                                format="DD/MM/YYYY"
                                placeholder={['Data inicial', 'Data final']}
                                style={{ minWidth: 260 }}
                            />
                            <Select
                                placeholder="Vendedor"
                                value={recEmployeeFilter}
                                onChange={setRecEmployeeFilter}
                                allowClear
                                style={{ minWidth: 200 }}
                                options={(employees as any[]).map((e: any) => ({ value: e.id, label: e.name }))}
                            />
                            <Select
                                placeholder="Cliente"
                                value={recClientFilter}
                                onChange={setRecClientFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allCustomers}
                            />
                            <Button icon={<ReloadOutlined />} onClick={fetchReceivables} loading={recLoading}>
                                Atualizar
                            </Button>
                        </div>

                        <Table<PendingReceivableRow>
                            columns={recColumns}
                            dataSource={recData}
                            rowKey="id"
                            pagination={{ pageSize: 20, showTotal: (t) => `${t} lançamentos` }}
                            size="middle"
                            loading={recLoading}
                            scroll={{ x: 900 }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Nenhum lançamento a receber pendente."
                                    />
                                ),
                            }}
                            summary={() => recData.length > 0 ? (
                                <Table.Summary fixed>
                                    <Table.Summary.Row style={{ fontWeight: 700 }}>
                                        <Table.Summary.Cell index={0} colSpan={3}>TOTAL</Table.Summary.Cell>
                                        <Table.Summary.Cell index={3} align="right">
                                            <span style={{ color: '#f59e0b' }}>{formatCurrency(recTotalAmount)}</span>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={4} colSpan={2} />
                                    </Table.Summary.Row>
                                </Table.Summary>
                            ) : undefined}
                        />
                    </div>
                ) : activeTab === 'COMMISSIONS' ? (
                    <div>
                        {/* Commissions KPIs */}
                        <div className="kpi-grid" style={{ marginBottom: 20 }}>
                            <CardKPI title="Total Vendido" value={formatCurrency(commTotalVendido)} icon={<DollarOutlined />} variant="green" />
                            <CardKPI title="Total Comissão" value={formatCurrency(commTotalComissao)} icon={<TeamOutlined />} variant="orange" />
                            <CardKPI title="Lucro Empresa" value={formatCurrency(commTotalLucro)} icon={<BarChartOutlined />} variant="blue" />
                        </div>

                        {/* Commissions Filters */}
                        <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#94a3b8' }} />
                                <span style={{ color: '#94a3b8', fontSize: 13 }}>Filtros:</span>
                            </div>
                            <RangePicker
                                value={commDateRange}
                                onChange={(dates) => {
                                    if (dates && dates[0] && dates[1]) setCommDateRange([dates[0], dates[1]])
                                }}
                                format="DD/MM/YYYY"
                                allowClear={false}
                                style={{ minWidth: 260 }}
                            />
                            <Select
                                placeholder="Vendedor"
                                value={commEmployeeFilter}
                                onChange={setCommEmployeeFilter}
                                allowClear
                                style={{ minWidth: 180 }}
                                options={(employees as any[]).map((e: any) => ({ value: e.id, label: e.name }))}
                            />
                            <Select
                                placeholder="Pedido"
                                value={commSaleFilter}
                                onChange={setCommSaleFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 180 }}
                                options={commData.map(r => ({ value: r.saleId, label: r.saleCode }))}
                            />
                            <Select
                                placeholder="Produto"
                                value={commProductFilter}
                                onChange={setCommProductFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allProducts}
                            />
                            <Button icon={<ReloadOutlined />} onClick={fetchCommissionsReport} loading={commLoading}>
                                Atualizar
                            </Button>
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => setCommExportModalOpen(true)}
                                disabled={!commData.length}
                                style={{ marginLeft: 'auto' }}
                            >
                                Exportar
                            </Button>
                        </div>

                        <ExportFormatModal
                            open={commExportModalOpen}
                            onClose={() => setCommExportModalOpen(false)}
                            onExportExcel={handleExportCommissionsExcel}
                            onExportPdf={handleExportCommissionsPdf}
                            title="Exportar Relatório de Comissões"
                            skipDateRange
                        />

                        <Table<CommissionReportRow>
                            columns={commColumns}
                            dataSource={commData}
                            rowKey="saleId"
                            pagination={{ pageSize: 20, showTotal: (t) => `${t} pedidos` }}
                            size="middle"
                            loading={commLoading}
                            scroll={{ x: 1300 }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Nenhuma venda encontrada no período selecionado."
                                    />
                                ),
                            }}
                            summary={renderCommissionSummary}
                        />
                    </div>
                ) : activeTab === 'PRODUCTS' ? (
                    <div>
                        {/* Product KPIs */}
                        <div className="kpi-grid" style={{ marginBottom: 20 }}>
                            <CardKPI title="Receita Total" value={formatCurrency(abcTotalRevenue)} icon={<DollarOutlined />} variant="green" />
                            <CardKPI title="Total Produtos" value={abcTotalProducts} icon={<ShoppingOutlined />} variant="blue" />
                            <CardKPI title="Margem Média" value={`${abcAvgMargin.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`} icon={<BarChartOutlined />} variant="orange" />
                        </div>

                        {/* Product Filters */}
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
                            <Select
                                placeholder="Cliente"
                                value={abcClientFilter}
                                onChange={setAbcClientFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allCustomers}
                            />
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchAbcReport}
                                loading={abcLoading}
                            >
                                Atualizar
                            </Button>
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => setProductExportModalOpen(true)}
                                disabled={!abcData.length}
                                style={{ marginLeft: 'auto' }}
                            >
                                Exportar
                            </Button>
                        </div>

                        <ExportFormatModal
                            open={productExportModalOpen}
                            onClose={() => setProductExportModalOpen(false)}
                            onExportExcel={handleExportProductsExcel}
                            onExportPdf={handleExportProductsPdf}
                            title="Exportar Curva ABC - Produtos"
                            skipDateRange
                        />

                        {/* Product Table */}
                        <Table<ABCReportRow>
                            columns={abcColumns}
                            dataSource={abcData}
                            rowKey={(r) => `${r.productId}-${r.employeeName}`}
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
                            summary={renderProductSummary}
                        />
                    </div>
                ) : (
                    <div>
                        {/* Service KPIs */}
                        <div className="kpi-grid" style={{ marginBottom: 20 }}>
                            <CardKPI title="Receita Total" value={formatCurrency(svcTotalRevenue)} icon={<DollarOutlined />} variant="green" />
                            <CardKPI title="Total Serviços" value={svcTotalServices} icon={<CustomerServiceOutlined />} variant="blue" />
                            <CardKPI title="Margem Média" value={`${svcAvgMargin.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`} icon={<BarChartOutlined />} variant="orange" />
                        </div>

                        {/* Service Filters */}
                        <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#94a3b8' }} />
                                <span style={{ color: '#94a3b8', fontSize: 13 }}>Filtros:</span>
                            </div>
                            <RangePicker
                                value={svcDateRange}
                                onChange={(dates) => {
                                    if (dates && dates[0] && dates[1]) {
                                        setSvcDateRange([dates[0], dates[1]])
                                    }
                                }}
                                format="DD/MM/YYYY"
                                allowClear={false}
                                style={{ minWidth: 260 }}
                            />
                            <Select
                                placeholder="Vendedor"
                                value={svcEmployeeFilter}
                                onChange={setSvcEmployeeFilter}
                                allowClear
                                style={{ minWidth: 200 }}
                                options={[
                                    ...(employees as any[]).map((e: any) => ({ value: e.id, label: e.name })),
                                ]}
                            />
                            <Select
                                placeholder="Cliente"
                                value={svcClientFilter}
                                onChange={setSvcClientFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allCustomers}
                            />
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchSvcReport}
                                loading={svcLoading}
                            >
                                Atualizar
                            </Button>
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => setServiceExportModalOpen(true)}
                                disabled={!svcData.length}
                                style={{ marginLeft: 'auto' }}
                            >
                                Exportar
                            </Button>
                        </div>

                        <ExportFormatModal
                            open={serviceExportModalOpen}
                            onClose={() => setServiceExportModalOpen(false)}
                            onExportExcel={handleExportServicesExcel}
                            onExportPdf={handleExportServicesPdf}
                            title="Exportar Curva ABC - Serviços"
                            skipDateRange
                        />

                        {/* Service Table */}
                        <Table<ABCServiceRow>
                            columns={svcColumns}
                            dataSource={svcData}
                            rowKey={(r) => `${r.serviceId}-${r.employeeName}`}
                            pagination={{ pageSize: 20, showTotal: (t) => `${t} serviços` }}
                            size="middle"
                            loading={svcLoading}
                            scroll={{ x: 1000 }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Nenhum serviço concluído encontrado no período selecionado. Serviços concluídos na Agenda aparecem aqui."
                                    />
                                ),
                            }}
                            summary={renderServiceSummary}
                        />
                    </div>
                )}
            </div>
        </Layout>
    )
}

export default SalesReport
