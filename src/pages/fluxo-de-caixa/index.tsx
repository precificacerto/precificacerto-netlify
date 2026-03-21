import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Select, Table, Tag, DatePicker, Space, message, Tabs,
    Popconfirm, Form, Input, InputNumber, Drawer, Alert, Modal, Statistic, Radio, Tooltip
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import {
    DollarOutlined, ArrowUpOutlined, ArrowDownOutlined, FundOutlined,
    PlusOutlined, DeleteOutlined, SyncOutlined, EditOutlined,
    CalendarOutlined, PieChartOutlined, BankOutlined, TagOutlined,
    TeamOutlined, CreditCardOutlined, FileExcelOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import {
    EXPENSE_GROUPS,
    EXPENSE_GROUP_OPTIONS,
    getExpenseGroupLabel,
    getExpenseGroupColor,
    type ExpenseGroupKey,
} from '@/constants/cashier-category'

import {
    exportCashFlowToExcel, exportCashFlowMultiMonth,
    INCOME_LABELS, INCOME_ROWS, EXPENSE_SECTIONS, matchesDescription, getIncomeLabel,
} from '@/utils/export-cash-flow-excel'
import { exportCommissionToExcel } from '@/utils/export-commission-excel'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'

import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, Title, Tooltip as ChartTooltip, Legend, Filler, ArcElement
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, ChartTooltip, Legend, Filler)

function formatCurrency(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

const CATEGORY_GROUP_MAP: { category: string; group: ExpenseGroupKey | string }[] = [
    // Mão de Obra Produtiva
    { category: 'Salários Produção', group: 'MAO_DE_OBRA' },
    { category: 'Décimo Terceiro (Setor Produtivo)', group: 'MAO_DE_OBRA' },
    { category: 'Férias Colaboradores (Setor Produtivo)', group: 'MAO_DE_OBRA' },
    { category: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA' },
    { category: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA' },
    { category: 'Plano de Saúde (Setor Produtivo)', group: 'MAO_DE_OBRA' },
    { category: 'Vale Alimentação (Setor Produtivo)', group: 'MAO_DE_OBRA' },
    { category: 'Vale Transporte (Setor Produtivo)', group: 'MAO_DE_OBRA' },
    // Mão de Obra Administrativa
    { category: 'Pró Labore', group: 'MAO_DE_OBRA' },
    { category: 'Salários Administrativos', group: 'MAO_DE_OBRA' },
    { category: 'Salários Comerciais', group: 'MAO_DE_OBRA' },
    { category: 'Décimo Terceiro (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA' },
    { category: 'Férias Colaboradores (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA' },
    { category: 'FGTS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA' },
    { category: 'INSS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA' },
    { category: 'Plano de Saúde (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA' },
    { category: 'Vale Alimentação (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA' },
    { category: 'Vale Transporte (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA' },
    // Despesas Fixas
    { category: 'Água', group: 'DESPESA_FIXA' },
    { category: 'Aluguel', group: 'DESPESA_FIXA' },
    { category: 'Aplicações / Consórcios', group: 'DESPESA_FIXA' },
    { category: 'Consultoria', group: 'DESPESA_FIXA' },
    { category: 'Contabilidade', group: 'DESPESA_FIXA' },
    { category: 'Depreciação', group: 'DESPESA_FIXA' },
    { category: 'Empréstimos', group: 'DESPESA_FIXA' },
    { category: 'Energia Elétrica', group: 'DESPESA_FIXA' },
    { category: 'Impostos IPTU / IPVA', group: 'IMPOSTO' },
    { category: 'Internet', group: 'DESPESA_FIXA' },
    { category: 'Segurança / Monitoramento', group: 'DESPESA_FIXA' },
    { category: 'Seguros', group: 'DESPESA_FIXA' },
    { category: 'Sistema de Gestão / Softwares', group: 'DESPESA_FIXA' },
    { category: 'Telefone', group: 'DESPESA_FIXA' },
    { category: 'Recisões / Indenizações', group: 'DESPESA_FIXA' },
    { category: 'Saúde Trabalhista / Ocupacional', group: 'DESPESA_FIXA' },
    { category: 'MEI (Microempreendedor Individual)', group: 'IMPOSTO' },
    // Despesas Variáveis
    { category: 'Comissões de Venda', group: 'DESPESA_VARIAVEL' },
    { category: 'Combustíveis', group: 'DESPESA_VARIAVEL' },
    { category: 'Correios', group: 'DESPESA_VARIAVEL' },
    { category: 'Departamento Jurídico', group: 'DESPESA_VARIAVEL' },
    { category: 'Embalagens Diversas', group: 'DESPESA_VARIAVEL' },
    { category: 'Fretes (Valores relacionados a entrega dos produtos)', group: 'DESPESA_VARIAVEL' },
    { category: 'Horas Extras - Salários', group: 'DESPESA_VARIAVEL' },
    { category: 'Manutenções', group: 'DESPESA_VARIAVEL' },
    { category: 'Marketing (publicidades e relacionados)', group: 'DESPESA_VARIAVEL' },
    { category: 'Pedágios', group: 'DESPESA_VARIAVEL' },
    { category: 'Terceirizações', group: 'DESPESA_VARIAVEL' },
    { category: 'Uso e Consumo', group: 'DESPESA_VARIAVEL' },
    { category: 'Vale Alimentação', group: 'DESPESA_VARIAVEL' },
    { category: 'Viagens (hotéis / passagens / alimentação / ETC)', group: 'DESPESA_VARIAVEL' },
    // Despesas Financeiras
    { category: 'Juros', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas Cartão', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas Bancárias', group: 'DESPESA_FINANCEIRA' },
    { category: 'Troca Cheque', group: 'DESPESA_FINANCEIRA' },
]

const ALL_EXPENSE_CATEGORIES = CATEGORY_GROUP_MAP.map(c => c.category)

const EXPENSE_CATEGORY_OPTIONS = [
    { label: '── Mão de Obra ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Fixas ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Variáveis ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Financeiras ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Impostos ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'IMPOSTO').map(c => ({ label: c.category, value: c.category })) },
]

function getGroupForCategory(cat: string): ExpenseGroupKey | undefined {
    return CATEGORY_GROUP_MAP.find(c => c.category === cat)?.group
}

const currencyMaskFn = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (!digits) return ''
    const num = parseInt(digits, 10) / 100
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const parseCurrencyFn = (val: string) =>
    parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0

const PAYMENT_METHODS = [
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão Crédito' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão Débito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
]

const CHART_COLORS = [
    '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
    '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#06B6D4',
    '#84CC16', '#E11D48',
]

function getOriginLabel(origin: string) {
    if (origin === 'SALE') return 'Venda'
    if (origin === 'SALARY') return 'Salário'
    if (origin === 'FIXED_EXPENSE') return 'Despesa Recorrente'
    return 'Manual'
}

function getOriginColor(origin: string) {
    if (origin === 'SALE') return 'green'
    if (origin === 'SALARY') return 'purple'
    if (origin === 'FIXED_EXPENSE') return 'blue'
    return 'default'
}

function getCategoryFromDescription(desc: string): string {
    if (!desc) return 'Outros'
    const base = desc.split(' — ')[0].trim()
    if (ALL_EXPENSE_CATEGORIES.includes(base)) return base
    if (desc.startsWith('Venda')) return 'Vendas'
    if (desc.startsWith('Salário')) return 'Salários'
    return base || 'Outros'
}

export default function CashFlow() {
    const [data, setData] = useState<any[]>([])
    const { currentUser } = useAuth()
    const { canView, canEdit } = usePermissions()
    const [employees, setEmployees] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [month, setMonth] = useState(dayjs())

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerType, setDrawerType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
    const [expenseAmount, setExpenseAmount] = useState('')
    const [fixedDrawerOpen, setFixedDrawerOpen] = useState(false)
    const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false)
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [editingEntry, setEditingEntry] = useState<any>(null)
    const [editAmount, setEditAmount] = useState('')

    const [form] = Form.useForm()
    const [editForm] = Form.useForm()

    const [messageApi, contextHolder] = message.useMessage()
    const [commissionSummary, setCommissionSummary] = useState<{ employee_id: string; name: string; commission_percent: number; base_revenue: number; commission_value: number }[]>([])

    const [anticipationAvailable, setAnticipationAvailable] = useState<{ month: string; count: number; total: number; monthsUntil: number }[]>([])
    const [anticipationHistory, setAnticipationHistory] = useState<any[]>([])
    const [anticGrossAmount, setAnticGrossAmount] = useState(0)
    const [anticFeeMode, setAnticFeeMode] = useState<'percent' | 'fixed'>('percent')
    const [anticFeePercent, setAnticFeePercent] = useState(0)
    const [anticFeeValue, setAnticFeeValue] = useState(0)
    const [anticLoading, setAnticLoading] = useState(false)

    // Restituição (Lucro Real)
    const [restitutionLoading, setRestitutionLoading] = useState(false)
    const [restitutionTotalPurchases, setRestitutionTotalPurchases] = useState<number>(0)
    const [restitutionPis, setRestitutionPis] = useState<number>(0)
    const [restitutionCofins, setRestitutionCofins] = useState<number>(0)
    const [restitutionIcms, setRestitutionIcms] = useState<number>(0)
    const [restitutionTotal, setRestitutionTotal] = useState<number>(0)
    const [restitutionEntries, setRestitutionEntries] = useState<any[]>([])

    // Export modal
    const [exportModalOpen, setExportModalOpen] = useState(false)
    const [exportRange, setExportRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([month.startOf('month'), month.endOf('month')])
    const [exporting, setExporting] = useState(false)

    // Export format modals (PDF vs Excel)
    const [exportFormatModalOpen, setExportFormatModalOpen] = useState(false)
    const [commissionExportModalOpen, setCommissionExportModalOpen] = useState(false)

    const startOfMonth = month.startOf('month').format('YYYY-MM-DD')
    const endOfMonth = month.endOf('month').format('YYYY-MM-DD')

    const fetchData = async () => {
        setLoading(true)
        try {
            const [{ data: entries }, { data: emps }] = await Promise.all([
                supabase.from('cash_entries')
                    .select('*')
                    .gte('due_date', startOfMonth)
                    .lte('due_date', endOfMonth)
                    .eq('is_active', true)
                    .order('due_date', { ascending: true }),
                supabase.from('employees').select('id, name, salary').eq('status', 'ACTIVE').eq('is_active', true),
            ])
            setData(entries || [])
            setEmployees(emps || [])
        } catch {
            messageApi.error('Erro ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [month])

    const handleExportMultiMonth = async () => {
        setExporting(true)
        try {
            const [start, end] = exportRange
            const startMonth = start.startOf('month')
            const endMonth = end.startOf('month')

            const months: { data: any[]; month: dayjs.Dayjs }[] = []
            let current = startMonth

            while (current.isBefore(endMonth) || current.isSame(endMonth, 'month')) {
                const s = current.startOf('month').format('YYYY-MM-DD')
                const e = current.endOf('month').format('YYYY-MM-DD')
                const { data: entries } = await supabase
                    .from('cash_entries')
                    .select('*')
                    .gte('due_date', s)
                    .lte('due_date', e)
                    .eq('is_active', true)
                    .order('due_date', { ascending: true })
                months.push({ data: entries || [], month: current })
                current = current.add(1, 'month')
            }

            if (months.length === 1) {
                await exportCashFlowToExcel(months[0].data, months[0].month)
            } else {
                await exportCashFlowMultiMonth(months)
            }
            setExportModalOpen(false)
            messageApi.success('Excel exportado com sucesso!')
        } catch (err: any) {
            messageApi.error('Erro ao exportar: ' + (err?.message || 'Erro desconhecido'))
        } finally {
            setExporting(false)
        }
    }

    const handleExportCashFlowPdf = () => {
        if (data.length === 0) { messageApi.warning('Nenhum dado para exportar.'); return }
        const monthLabel = month.format('MMMM/YYYY')
        const headers = ['Data', 'Descrição', 'Tipo', 'Valor']
        const rows = data.map((r: any) => {
            const displayAmount = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
            return [
                dayjs(r.due_date).format('DD/MM/YYYY'),
                r.description || '',
                r.type === 'INCOME' ? 'Receita' : 'Despesa',
                `${r.type === 'INCOME' ? '+' : '-'} ${formatCurrency(displayAmount)}`,
            ]
        })
        exportTableToPdf({
            title: `Fluxo de Caixa — ${monthLabel}`,
            subtitle: `${data.length} lançamentos`,
            headers,
            rows,
            filename: `Fluxo_de_Caixa_${month.format('YYYY-MM')}.pdf`,
            orientation: 'landscape',
            columnStyles: { 3: { halign: 'right' } },
        })
        messageApi.success('PDF exportado com sucesso!')
    }

    const handleExportCommissionPdf = () => {
        if (commissionSummary.length === 0) { messageApi.warning('Nenhum dado de comissão para exportar.'); return }
        const monthLabel = month.format('MMMM/YYYY')
        const headers = ['Vendedor', '% Comissão', 'Base (Receita)', 'Comissão Calculada']
        const rows = commissionSummary.map((r: any) => [
            r.name,
            `${r.commission_percent}%`,
            formatCurrency(r.base_revenue),
            formatCurrency(r.commission_value),
        ])
        exportTableToPdf({
            title: `Comissão de Vendedores — ${monthLabel}`,
            headers,
            rows,
            filename: `Comissao_Vendedores_${month.format('YYYY-MM')}.pdf`,
            orientation: 'portrait',
            columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        })
        messageApi.success('PDF exportado com sucesso!')
    }

    if (!canView(MODULES.CASH_FLOW)) {
        return <Layout title={PAGE_TITLES.CASH_FLOW}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    const canApproveBoleto = (entry: any) => {
        const isBoletoIncome = entry.type === 'INCOME' && entry.payment_method === 'BOLETO' && !entry.paid_date
        if (!isBoletoIncome) return false
        const isAdmin = currentUser?.role === 'admin' || currentUser?.permissions?.includes('ADMIN')
        const isOwner = currentUser?.uid && entry.created_by === currentUser.uid
        return !!(isAdmin || isOwner)
    }

    const handleApproveBoleto = async (entry: any) => {
        if (!canApproveBoleto(entry)) return
        try {
            const { error } = await supabase.from('cash_entries')
                .update({ paid_date: dayjs().format('YYYY-MM-DD') })
                .eq('id', entry.id)
            if (error) throw error
            messageApi.success('Pagamento do boleto aprovado!')
            await fetchData()
        } catch {
            messageApi.error('Erro ao aprovar boleto.')
        }
    }

    // ── Restituição (Lucro Real) ──
    const isLucroReal = currentUser?.taxableRegime === 'LUCRO_REAL'

    const loadRestitution = async () => {
        if (!isLucroReal) return
        setRestitutionLoading(true)
        try {
            const tenantId = await getTenantId()
            if (!tenantId) return
            const monthStart = month.startOf('month').format('YYYY-MM-01')
            const { data: rows } = await supabase
                .from('tax_restitution_entries')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('reference_month', monthStart)
                .order('reference_month', { ascending: false })

            const row = rows && rows.length > 0 ? rows[0] : null
            if (row) {
                setRestitutionTotalPurchases(Number(row.total_purchases) || 0)
                setRestitutionPis(Number(row.pis_credit) || 0)
                setRestitutionCofins(Number(row.cofins_credit) || 0)
                setRestitutionIcms(Number(row.icms_credit) || 0)
                setRestitutionTotal(Number(row.total_restitution) || 0)
            } else {
                setRestitutionTotalPurchases(0)
                setRestitutionPis(0)
                setRestitutionCofins(0)
                setRestitutionIcms(0)
                setRestitutionTotal(0)
            }

            const { data: history } = await supabase
                .from('tax_restitution_entries')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('reference_month', { ascending: false })
            setRestitutionEntries(history || [])
        } catch {
            messageApi.error('Erro ao carregar dados de restituição.')
        } finally {
            setRestitutionLoading(false)
        }
    }

    useEffect(() => {
        if (isLucroReal) loadRestitution()
    }, [isLucroReal, month])

    const fetchAnticipationData = async () => {
        setAnticLoading(true)
        try {
            const tid = await getTenantId()
            if (!tid) return
            const today = dayjs().format('YYYY-MM-DD')

            const { data: allEntries } = await supabase
                .from('cash_entries')
                .select('id, due_date, amount, anticipation_id, anticipated_amount')
                .eq('payment_method', 'CARTAO_CREDITO')
                .eq('type', 'INCOME')
                .gt('due_date', today)
                .eq('is_active', true)
                .order('due_date', { ascending: true })

            const available: { id: string; due_date: string; amount: number; availableAmount: number; anticipated_amount: number | null }[] = []
            for (const entry of (allEntries || [])) {
                const amt = Number(entry.amount || 0)
                const already = Number(entry.anticipated_amount || 0)
                const availableAmount = entry.anticipation_id ? amt - already : amt
                if (availableAmount <= 0) continue
                available.push({
                    id: entry.id,
                    due_date: entry.due_date,
                    amount: amt,
                    availableAmount,
                })
            }

            const grouped: Record<string, { month: string; count: number; total: number; monthsUntil: number }> = {}
            for (const entry of available) {
                const monthKey = dayjs(entry.due_date).format('YYYY-MM')
                if (!grouped[monthKey]) grouped[monthKey] = { month: monthKey, count: 0, total: 0, monthsUntil: dayjs(monthKey + '-01').diff(dayjs(), 'month') + 1 }
                grouped[monthKey].count++
                grouped[monthKey].total += entry.availableAmount
            }
            setAnticipationAvailable(Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month)))

            const { data: history } = await supabase
                .from('card_anticipations')
                .select('*')
                .eq('tenant_id', tid)
                .order('created_at', { ascending: false })
            setAnticipationHistory(history || [])
        } catch {
            messageApi.error('Erro ao carregar dados de antecipação.')
        } finally {
            setAnticLoading(false)
        }
    }

    useEffect(() => { fetchAnticipationData() }, [])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const tenantId = await getTenantId()
            if (!tenantId) return
            const start = month.startOf('month').format('YYYY-MM-DD')
            const end = month.endOf('month').format('YYYY-MM-DD')
            const { data: emps } = await supabase.from('employees').select('id, name, commission_percent').eq('status', 'ACTIVE').eq('is_active', true).not('commission_percent', 'is', null)
            const employeesWithCommission = (emps || []).filter((e: any) => Number(e.commission_percent) > 0)
            if (employeesWithCommission.length === 0) {
                if (!cancelled) setCommissionSummary([])
                return
            }
            const empMap = new Map(employeesWithCommission.map((e: any) => [e.id, { name: e.name, commission_percent: Number(e.commission_percent) || 0, base_revenue: 0, commission_value: 0 }]))
            const { data: services } = await supabase.from('completed_services').select('employee_id, total_revenue').eq('is_active', true).gte('service_date', start).lte('service_date', end)
            for (const s of services || []) {
                if (!s.employee_id) continue
                const emp = empMap.get(s.employee_id)
                if (!emp) continue
                const rev = Number(s.total_revenue) || 0
                emp.base_revenue += rev
                emp.commission_value += rev * (emp.commission_percent / 100)
            }
            const { data: sales } = await supabase.from('sales').select('id, final_value, budget_id').eq('is_active', true).gte('sale_date', start).lte('sale_date', end).not('budget_id', 'is', null)
            if (sales?.length) {
                const budgetIds = [...new Set((sales as any[]).map(s => s.budget_id).filter(Boolean))]
                const { data: budgets } = await supabase.from('budgets').select('id, employee_id').in('id', budgetIds)
                const budgetEmp = new Map((budgets || []).map((b: any) => [b.id, b.employee_id]))
                const { data: empRows } = await supabase.from('employees').select('id, commission_percent').in('id', [...new Set((budgets || []).map((b: any) => b.employee_id).filter(Boolean))])
                const pctByEmp = new Map((empRows || []).map((e: any) => [e.id, Number(e.commission_percent) || 0]))
                for (const sale of sales as any[]) {
                    const empId = budgetEmp.get(sale.budget_id)
                    if (!empId) continue
                    const pct = pctByEmp.get(empId) || 0
                    if (pct <= 0) continue
                    const emp = empMap.get(empId)
                    if (!emp) continue
                    const val = Number(sale.final_value) || 0
                    emp.base_revenue += val
                    emp.commission_value += val * (pct / 100) / (1 + pct / 100)
                }
            }
            if (!cancelled) {
                setCommissionSummary(employeesWithCommission.map((e: any) => ({
                    employee_id: e.id,
                    name: e.name,
                    commission_percent: empMap.get(e.id)?.commission_percent ?? 0,
                    base_revenue: empMap.get(e.id)?.base_revenue ?? 0,
                    commission_value: empMap.get(e.id)?.commission_value ?? 0,
                })))
            }
        })()
        return () => { cancelled = true }
    }, [month])

    const effectiveIncomes = useMemo(
        () => data.filter(d => d.type === 'INCOME' && !(d.payment_method === 'BOLETO' && !d.paid_date)),
        [data],
    )
    const totalIncome = useMemo(
        () => effectiveIncomes.reduce((acc, cur) => acc + getEffectiveIncomeAmount(cur), 0),
        [effectiveIncomes],
    )
    const totalExpense = useMemo(() => data.filter(d => d.type === 'EXPENSE').reduce((acc, cur) => acc + Number(cur.amount || 0), 0), [data])
    const balance = totalIncome - totalExpense
    const fixedExpenseEntries = useMemo(() => data.filter(d => d.type === 'EXPENSE' && d.origin_type === 'FIXED_EXPENSE'), [data])
    const totalFixed = fixedExpenseEntries.reduce((s, e) => s + Number(e.amount || 0), 0)

    // ── Categorias agrupadas ──
    const categoryGroups = useMemo(() => {
        const groups: Record<string, { category: string; type: string; total: number; count: number }> = {}
        for (const entry of data) {
            const cat = getCategoryFromDescription(entry.description)
            const key = `${entry.type}-${cat}`
            if (!groups[key]) groups[key] = { category: cat, type: entry.type, total: 0, count: 0 }
            groups[key].total += entry.type === 'INCOME' ? getEffectiveIncomeAmount(entry) : Number(entry.amount || 0)
            groups[key].count++
        }
        return Object.values(groups).sort((a, b) => b.total - a.total)
    }, [data])

    const incomeCategories = categoryGroups.filter(c => c.type === 'INCOME')
    const expenseCategories = categoryGroups.filter(c => c.type === 'EXPENSE')

    // ── Despesas fixas agrupadas por descrição ──
    const fixedGrouped = useMemo(() => {
        const groups: Record<string, { description: string; amount: number; count: number; isFixed: boolean }> = {}
        for (const entry of fixedExpenseEntries) {
            const key = getCategoryFromDescription(entry.description)
            const catGroup = getGroupForCategory(key)
            if (!groups[key]) groups[key] = { description: key, amount: 0, count: 0, isFixed: catGroup === 'DESPESA_FIXA' || catGroup === 'MAO_DE_OBRA' }
            groups[key].amount += Number(entry.amount || 0)
            groups[key].count++
        }
        return Object.values(groups).sort((a, b) => b.amount - a.amount)
    }, [fixedExpenseEntries])

    // ── Daily view ──
    const dailyData = useMemo(() => {
        const daysInMonth = month.daysInMonth()
        const days: { day: number; date: string; income: number; expense: number; balance: number; runningBalance: number; entries: any[] }[] = []
        let running = 0
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = month.date(d).format('YYYY-MM-DD')
            const dayEntries = data.filter(e => e.due_date === dateStr)
            const dayIncome = dayEntries
                .filter(e => e.type === 'INCOME' && !(e.payment_method === 'BOLETO' && !e.paid_date))
                .reduce((s, e) => s + getEffectiveIncomeAmount(e), 0)
            const dayExpense = dayEntries.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + Number(e.amount || 0), 0)
            const dayBalance = dayIncome - dayExpense
            running += dayBalance
            days.push({ day: d, date: dateStr, income: dayIncome, expense: dayExpense, balance: dayBalance, runningBalance: running, entries: dayEntries })
        }
        return days
    }, [data, month])

    // ── Extrato structured data (mirrors Excel export format) ──
    const extratoData = useMemo(() => {
        // Income by label
        const incomeByLabel: Record<string, number> = {}
        for (const label of INCOME_LABELS) incomeByLabel[label] = 0

        // Expense by section/item
        const expenseBySectionItem: Record<string, Record<string, number>> = {}
        const sectionTotals: Record<string, number> = {}
        for (const section of EXPENSE_SECTIONS) {
            expenseBySectionItem[section.header] = {}
            sectionTotals[section.header] = 0
            for (const item of section.items) {
                expenseBySectionItem[section.header][item.label] = 0
            }
        }

        let unmatchedTotal = 0

        for (const entry of data) {
            if (entry.type === 'INCOME') {
                if (entry.payment_method === 'BOLETO' && !entry.paid_date) continue
                const label = getIncomeLabel(entry)
                if (label && incomeByLabel[label] !== undefined) {
                    incomeByLabel[label] += getEffectiveIncomeAmount(entry)
                }
            } else {
                let matched = false
                for (const section of EXPENSE_SECTIONS) {
                    for (const item of section.items) {
                        if (matchesDescription(entry.description, item.descMatch)) {
                            expenseBySectionItem[section.header][item.label] += Number(entry.amount) || 0
                            sectionTotals[section.header] += Number(entry.amount) || 0
                            matched = true
                            break
                        }
                    }
                    if (matched) break
                }
                if (!matched) {
                    unmatchedTotal += Number(entry.amount) || 0
                }
            }
        }

        const totalEntradas = Object.values(incomeByLabel).reduce((a, b) => a + b, 0)
        const totalSaidas = Object.values(sectionTotals).reduce((a, b) => a + b, 0) + unmatchedTotal
        const resultado = totalEntradas - totalSaidas

        return { incomeByLabel, expenseBySectionItem, sectionTotals, unmatchedTotal, totalEntradas, totalSaidas, resultado }
    }, [data])

    // ── Charts ──
    const weeklyData = useMemo(() => {
        const weeks = [
            { label: 'Semana 1', income: 0, expense: 0 },
            { label: 'Semana 2', income: 0, expense: 0 },
            { label: 'Semana 3', income: 0, expense: 0 },
            { label: 'Semana 4', income: 0, expense: 0 },
            { label: 'Semana 5', income: 0, expense: 0 },
        ]
        for (const entry of data) {
            const d = new Date(entry.due_date + 'T00:00:00')
            const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 4)
            if (entry.type === 'INCOME') {
                if (!(entry.payment_method === 'BOLETO' && !entry.paid_date)) {
                    weeks[weekIdx].income += getEffectiveIncomeAmount(entry)
                }
            } else {
                weeks[weekIdx].expense += Number(entry.amount || 0)
            }
        }
        return weeks.filter(w => w.income > 0 || w.expense > 0)
    }, [data])

    const expenseByCatChart = useMemo(() => {
        const cats: Record<string, number> = {}
        for (const entry of data.filter(d => d.type === 'EXPENSE')) {
            const cat = getCategoryFromDescription(entry.description)
            cats[cat] = (cats[cat] || 0) + Number(entry.amount || 0)
        }
        return cats
    }, [data])

    const incomeByCatChart = useMemo(() => {
        const cats: Record<string, number> = {}
        for (const entry of effectiveIncomes) {
            const cat = getCategoryFromDescription(entry.description)
            cats[cat] = (cats[cat] || 0) + getEffectiveIncomeAmount(entry)
        }
        return cats
    }, [effectiveIncomes])

    // ── Editar entrada ──
    const handleOpenEdit = (record: any) => {
        setEditingEntry(record)
        setEditAmount(Number(record.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
        editForm.setFieldsValue({
            description: record.description,
            due_date: dayjs(record.due_date),
            payment_method: record.payment_method || undefined,
            type: record.type,
            expense_group: record.expense_group || undefined,
        })
        setEditDrawerOpen(true)
    }

    const handleSaveEdit = async () => {
        try {
            const values = editForm.getFieldsValue()
            const amount = parseCurrencyFn(editAmount)
            if (amount <= 0) { messageApi.warning('Informe um valor válido.'); return }

            const updateData: any = {
                description: values.description,
                amount,
                due_date: values.due_date.format('YYYY-MM-DD'),
                payment_method: values.payment_method || null,
                type: values.type,
            }
            if (values.type === 'EXPENSE') {
                updateData.expense_group = values.expense_group || null
            }

            const { error } = await supabase.from('cash_entries')
                .update(updateData)
                .eq('id', editingEntry.id)

            if (error) throw error
            messageApi.success('Lançamento atualizado!')
            setEditDrawerOpen(false)
            await fetchData()
        } catch {
            messageApi.error('Erro ao atualizar.')
        }
    }

    // ── Salvar Novo ──
    const handleSaveEntry = async () => {
        try {
            const values = await form.validateFields()
            const tenant_id = await getTenantId()
            if (!tenant_id) return

            if (drawerType === 'INCOME') {
                const isBoleto = values.payment_method === 'BOLETO'
                await supabase.from('cash_entries').insert({
                    tenant_id,
                    description: values.description,
                    amount: values.amount,
                    type: 'INCOME',
                    due_date: values.due_date.format('YYYY-MM-DD'),
                    paid_date: isBoleto
                        ? null
                        : (values.paid_date ? values.paid_date.format('YYYY-MM-DD') : values.due_date.format('YYYY-MM-DD')),
                    category_id: values.category_id,
                    payment_method: values.payment_method,
                    origin_type: 'MANUAL'
                })
                messageApi.success('Lançamento salvo!')
            } else {
                const amountNum = parseCurrencyFn(expenseAmount)
                if (amountNum <= 0) { messageApi.warning('Informe o valor da despesa.'); return }
                if (!values.expense_category) { messageApi.warning('Selecione a categoria.'); return }
                if (!values.expense_group) { messageApi.warning('Selecione o tipo de despesa.'); return }

                const desc = values.expense_description
                    ? `${values.expense_category} — ${values.expense_description}`
                    : values.expense_category

                const recurrence: string = values.recurrence || 'MONTHLY'
                const now = new Date()
                const curYear = now.getFullYear()
                const curMonth = now.getMonth()

                let startY = curYear, startM = curMonth
                if (values.start_month) { startY = values.start_month.year(); startM = values.start_month.month() }

                let endY = curYear, endM = 11
                if (values.end_month) { endY = values.end_month.year(); endM = values.end_month.month() }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const entries: any[] = []

                if (recurrence === 'ONCE') {
                    entries.push({
                        tenant_id,
                        type: 'EXPENSE' as const,
                        origin_type: 'MANUAL',
                        recurrence_type: 'ONCE',
                        description: desc,
                        amount: amountNum,
                        due_date: `${startY}-${String(startM + 1).padStart(2, '0')}-01`,
                        expense_group: values.expense_group,
                    })
                } else if (recurrence === 'WEEKLY' || recurrence === 'BIWEEKLY') {
                    const daysStep = recurrence === 'WEEKLY' ? 7 : 14
                    const cursor = new Date(startY, startM, 1)
                    const endDate = new Date(endY, endM + 1, 0)
                    while (cursor <= endDate) {
                        entries.push({
                            tenant_id,
                            type: 'EXPENSE' as const,
                            origin_type: 'FIXED_EXPENSE',
                            recurrence_type: recurrence,
                            description: desc,
                            amount: amountNum,
                            due_date: cursor.toISOString().substring(0, 10),
                            expense_group: values.expense_group,
                        })
                        cursor.setDate(cursor.getDate() + daysStep)
                    }
                } else {
                    const monthStep = recurrence === 'QUARTERLY' ? 3 : 1
                    let y = startY, m = startM
                    while (y < endY || (y === endY && m <= endM)) {
                        entries.push({
                            tenant_id,
                            type: 'EXPENSE' as const,
                            origin_type: 'FIXED_EXPENSE',
                            recurrence_type: recurrence,
                            description: desc,
                            amount: amountNum,
                            due_date: `${y}-${String(m + 1).padStart(2, '0')}-01`,
                            expense_group: values.expense_group,
                        })
                        m += monthStep
                        while (m > 11) { m -= 12; y++ }
                    }
                }

                if (entries.length > 0) {
                    const { error } = await supabase.from('cash_entries').insert(entries)
                    if (error) throw error
                }
                messageApi.success(`${entries.length} lançamento(s) de despesa criado(s)!`)
                mergeExpenseConfig(tenant_id).catch(() => {})
            }

            setDrawerOpen(false)
            form.resetFields()
            setExpenseAmount('')
            await fetchData()
        } catch {
            messageApi.error('Preencha os campos obrigatórios.')
        }
    }

    const handleDeleteEntry = async (id: string) => {
        try {
            const res = await fetch('/api/delete/cash-entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Erro ao desativar')
            messageApi.success('Desativado.')
            fetchData()
        } catch (error: any) {
            messageApi.error(error.message || 'Erro ao desativar lançamento')
        }
    }

    const handleGenerateRecurring = async () => {
        try {
            const tenant_id = await getTenantId()
            if (!tenant_id) {
                messageApi.warning('Sessão inválida.')
                return
            }
            const y = month.year()
            const m = month.month()
            const lastDay = month.endOf('month').date()
            const existingKeys = new Set(
                data.map((e: any) => `${e.description ?? ''}|${e.origin_type ?? ''}|${Number(e.amount)}`)
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toInsert: any[] = []

            const { data: fixedList } = await supabase
                .from('fixed_expenses')
                .select('id, description, amount, due_day')
                .eq('tenant_id', tenant_id)
                .eq('is_active', true)
            if (fixedList?.length) {
                for (const fe of fixedList) {
                    const day = Math.min(Math.max(1, fe.due_day), lastDay)
                    const due_date = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const key = `${fe.description}|FIXED_EXPENSE|${Number(fe.amount)}`
                    if (existingKeys.has(key)) continue
                    existingKeys.add(key)
                    toInsert.push({
                        tenant_id,
                        type: 'EXPENSE',
                        origin_type: 'FIXED_EXPENSE',
                        recurrence_type: 'MONTHLY',
                        description: fe.description,
                        amount: Number(fe.amount),
                        due_date,
                        expense_group: 'DESPESA_FIXA',
                    })
                }
            }
            for (const emp of employees) {
                const salary = Number(emp.salary || 0)
                if (salary <= 0) continue
                const desc = `Salários — ${emp.name || 'Funcionário'}`
                const key = `${desc}|SALARY|${salary}`
                if (existingKeys.has(key)) continue
                existingKeys.add(key)
                toInsert.push({
                    tenant_id,
                    type: 'EXPENSE',
                    origin_type: 'SALARY',
                    recurrence_type: 'MONTHLY',
                    description: desc,
                    amount: salary,
                    due_date: `${y}-${String(m + 1).padStart(2, '0')}-01`,
                    expense_group: 'MAO_DE_OBRA_PRODUTIVA',
                })
            }
            if (toInsert.length === 0) {
                messageApi.info('Nenhum lançamento novo a gerar para este mês.')
                return
            }
            const { error } = await supabase.from('cash_entries').insert(toInsert)
            if (error) throw error
            messageApi.success(`${toInsert.length} lançamento(s) gerado(s) para o mês.`)
            await fetchData()
        } catch {
            messageApi.error('Erro ao gerar contas do mês.')
        }
    }

    const totalAnticipationAvailable = useMemo(
        () => anticipationAvailable.reduce((s, r) => s + r.total, 0),
        [anticipationAvailable],
    )

    const handleConfirmAnticipation = async () => {
        if (anticGrossAmount <= 0) return
        if (totalAnticipationAvailable <= 0) {
            messageApi.error('Não há valores disponíveis para antecipação.')
            return
        }
        if (anticGrossAmount > totalAnticipationAvailable) {
            messageApi.error('O valor a antecipar é maior do que o total disponível.')
            return
        }
        setAnticLoading(true)
        try {
            const tid = await getTenantId()
            if (!tid) return
            const createdBy = await getCurrentUserId()
            if (!createdBy) { messageApi.error('Sessão inválida.'); return }

            const feeAmount = anticFeeMode === 'percent'
                ? anticGrossAmount * (anticFeePercent / 100)
                : anticFeeValue
            const feePercent = anticFeeMode === 'percent'
                ? anticFeePercent
                : (anticGrossAmount > 0 ? (anticFeeValue / anticGrossAmount) * 100 : 0)
            const netAmount = anticGrossAmount - feeAmount

            const { data: antic, error: anticErr } = await supabase.from('card_anticipations').insert({
                tenant_id: tid,
                total_gross: anticGrossAmount,
                fee_amount: feeAmount,
                fee_percent: feePercent,
                net_amount: netAmount,
                months: 0,
                status: 'COMPLETED',
                created_by: createdBy,
            }).select().single()

            if (anticErr) throw anticErr

            const today = dayjs().format('YYYY-MM-DD')
            const { data: entries } = await supabase
                .from('cash_entries')
                .select('id, amount, anticipation_id, anticipated_amount')
                .eq('payment_method', 'CARTAO_CREDITO')
                .eq('type', 'INCOME')
                .gt('due_date', today)
                .eq('is_active', true)
                .order('due_date', { ascending: true })

            // Segurança adicional no backend: garantir que não se antecipe mais do que o disponível,
            // mesmo que os dados do front estejam defasados.
            let availableTotal = 0
            for (const entry of (entries || [])) {
                const amt = Number(entry.amount || 0)
                const already = Number(entry.anticipated_amount || 0)
                const availableAmount = entry.anticipation_id ? amt - already : amt
                if (availableAmount > 0) {
                    availableTotal += availableAmount
                }
            }
            if (anticGrossAmount > availableTotal) {
                throw new Error('O valor a antecipar é maior do que o total disponível.')
            }

            let remaining = anticGrossAmount
            for (const entry of (entries || [])) {
                if (remaining <= 0) break
                const amt = Number(entry.amount || 0)
                const already = Number(entry.anticipated_amount || 0)
                const availableAmount = entry.anticipation_id ? amt - already : amt
                if (availableAmount <= 0) continue
                const take = Math.min(remaining, availableAmount)
                const newAnticipated = (entry.anticipation_id ? already : 0) + take
                const isFullyAnticipated = newAnticipated >= amt
                await supabase
                    .from('cash_entries')
                    .update({
                        anticipation_id: antic.id,
                        anticipated_amount: newAnticipated,
                        ...(isFullyAnticipated ? { paid_date: today } : {}),
                    })
                    .eq('id', entry.id)
                remaining -= take
            }

            await supabase.from('cash_entries').insert({
                tenant_id: tid,
                type: 'INCOME',
                amount: netAmount,
                description: 'Antecipação de cartão',
                due_date: today,
                paid_date: today,
                payment_method: 'CARTAO_CREDITO',
                origin_type: 'MANUAL',
            })

            if (feeAmount > 0) {
                await supabase.from('cash_entries').insert({
                    tenant_id: tid,
                    type: 'EXPENSE',
                    amount: feeAmount,
                    description: 'Taxa de antecipação de cartão',
                    due_date: today,
                    paid_date: today,
                    expense_group: 'DESPESA_FINANCEIRA',
                    origin_type: 'MANUAL',
                })
            }

            messageApi.success('Antecipação realizada com sucesso!')
            setAnticGrossAmount(0)
            setAnticFeePercent(0)
            setAnticFeeValue(0)
            await fetchAnticipationData()
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro: ' + (err.message || 'Falha ao processar antecipação'))
        } finally {
            setAnticLoading(false)
        }
    }

    const handleAutoCalculateRestitution = async () => {
        try {
            const tenantId = await getTenantId()
            if (!tenantId) return
            const start = month.startOf('month').format('YYYY-MM-DD')
            const end = month.endOf('month').format('YYYY-MM-DD')

            const { data: entries } = await supabase
                .from('cash_entries')
                .select('amount, type, expense_group, due_date')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .gte('due_date', start)
                .lte('due_date', end)

            const list = entries || []
            const purchases = list
                .filter((e: any) =>
                    e.type === 'EXPENSE' &&
                    (e.expense_group === 'DESPESA_VARIAVEL' || e.expense_group === 'MAO_DE_OBRA_PRODUTIVA'),
                )
                .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)

            const pis = purchases * 0.0165
            const cofins = purchases * 0.076

            // ICMS: usa alíquota do estado do tenant_settings
            const { data: ts } = await supabase
                .from('tenant_settings')
                .select('state_code, icms_contribuinte')
                .eq('tenant_id', tenantId)
                .single()

            let icmsCredit = 0
            if (ts?.icms_contribuinte) {
                const { data: stateRow } = await supabase
                    .from('brazilian_states')
                    .select('icms_internal_rate')
                    .eq('code', ts.state_code || 'SP')
                    .single()
                const icmsRateRaw = Number(stateRow?.icms_internal_rate) || 0
                const icmsRate = icmsRateRaw > 0 && icmsRateRaw < 1 ? icmsRateRaw : icmsRateRaw / 100
                icmsCredit = purchases * icmsRate
            }

            setRestitutionTotalPurchases(purchases)
            setRestitutionPis(pis)
            setRestitutionCofins(cofins)
            setRestitutionIcms(icmsCredit)
            setRestitutionTotal(pis + cofins + icmsCredit)
        } catch {
            messageApi.error('Erro ao calcular automaticamente a restituição.')
        }
    }

    const handleSaveRestitution = async () => {
        try {
            const tenantId = await getTenantId()
            if (!tenantId) return
            const referenceMonth = month.startOf('month').format('YYYY-MM-01')

            const payload = {
                tenant_id: tenantId,
                reference_month: referenceMonth,
                total_purchases: restitutionTotalPurchases,
                pis_credit: restitutionPis,
                cofins_credit: restitutionCofins,
                icms_credit: restitutionIcms,
                total_restitution: restitutionTotal,
                updated_at: new Date().toISOString(),
            }

            const { data: existing } = await supabase
                .from('tax_restitution_entries')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('reference_month', referenceMonth)
                .maybeSingle()

            if (existing?.id) {
                const { error } = await supabase
                    .from('tax_restitution_entries')
                    .update(payload)
                    .eq('id', existing.id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('tax_restitution_entries')
                    .insert(payload)
                if (error) throw error
            }

            messageApi.success('Estimativa de restituição salva com sucesso!')
            await loadRestitution()
        } catch {
            messageApi.error('Erro ao salvar estimativa de restituição.')
        }
    }

    // ── Colunas do extrato ──
    const columns: ColumnsType<any> = [
        {
            title: 'Data',
            dataIndex: 'due_date',
            width: 100,
            render: (d) => dayjs(d).format('DD/MM/YYYY'),
            sorter: (a, b) => dayjs(a.due_date).unix() - dayjs(b.due_date).unix(),
            defaultSortOrder: 'ascend',
        },
        {
            title: 'Descrição',
            dataIndex: 'description',
            render: (t, r) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{t}</span>
                    <div style={{ marginTop: 2 }}>
                        <Tag color={getOriginColor(r.origin_type)} style={{ fontSize: 11 }}>{getOriginLabel(r.origin_type)}</Tag>
                    </div>
                </div>
            ),
        },
        {
            title: 'Tipo',
            dataIndex: 'type',
            width: 100,
            filters: [
                { text: 'Receita', value: 'INCOME' },
                { text: 'Despesa', value: 'EXPENSE' },
            ],
            onFilter: (value, record) => record.type === value,
            render: (t) => t === 'INCOME'
                ? <Tag color="success">Receita</Tag>
                : <Tag color="error">Despesa</Tag>,
        },
        {
            title: 'Tipo Desp.',
            dataIndex: 'expense_group',
            width: 180,
            render: (v, r) => {
                if (r.type !== 'EXPENSE' || !v) return null
                if (v === 'MAO_DE_OBRA_PRODUTIVA') {
                    return <Tag color="#7C3AED" style={{ fontSize: 11 }}>Mão de Obra Produtiva</Tag>
                }
                if (v === 'MAO_DE_OBRA_ADMINISTRATIVA') {
                    return <Tag color="#A855F7" style={{ fontSize: 11 }}>Mão de Obra Administrativa</Tag>
                }
                if (v === 'MAO_DE_OBRA') {
                    return <Tag color={getExpenseGroupColor('MAO_DE_OBRA')} style={{ fontSize: 11 }}>Mão de Obra</Tag>
                }
                return <Tag color={getExpenseGroupColor(v)} style={{ fontSize: 11 }}>{getExpenseGroupLabel(v)}</Tag>
            },
            filters: [
                { text: 'Mão de Obra Produtiva', value: 'MAO_DE_OBRA_PRODUTIVA' },
                { text: 'Mão de Obra Administrativa', value: 'MAO_DE_OBRA_ADMINISTRATIVA' },
                ...Object.values(EXPENSE_GROUPS).map(g => ({ text: g.label, value: g.key })),
            ],
            onFilter: (value, record) => record.expense_group === value,
        },
        {
            title: 'Valor',
            dataIndex: 'amount',
            align: 'right',
            width: 160,
            sorter: (a, b) => (a.type === 'INCOME' ? getEffectiveIncomeAmount(a) : Number(a.amount || 0)) - (b.type === 'INCOME' ? getEffectiveIncomeAmount(b) : Number(b.amount || 0)),
            render: (v, r) => {
                const displayAmount = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
                const isAnticipated = r.type === 'INCOME' && r.payment_method === 'CARTAO_CREDITO' && r.anticipated_amount != null && Number(r.anticipated_amount) > 0
                const tooltip = isAnticipated
                    ? `Original: ${formatCurrency(Number(r.amount || 0))} | Antecipado: ${formatCurrency(Number(r.anticipated_amount || 0))} | Restante: ${formatCurrency(displayAmount)}`
                    : undefined
                return (
                    <span style={{ color: r.type === 'INCOME' ? '#12B76A' : '#F04438', fontWeight: 700, fontSize: 14 }}>
                        {tooltip ? (
                            <Tooltip title={tooltip}>
                                <span>{r.type === 'INCOME' ? '+' : '-'} {formatCurrency(displayAmount)}{isAnticipated ? ' *' : ''}</span>
                            </Tooltip>
                        ) : (
                            <>{r.type === 'INCOME' ? '+' : '-'} {formatCurrency(displayAmount)}</>
                        )}
                    </span>
                )
            },
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 220,
            render: (_, r) => (
                <Space wrap>
                    <Button icon={<EditOutlined />} size="small" type="text" onClick={() => handleOpenEdit(r)} />
                    {r.type === 'INCOME' && r.payment_method === 'BOLETO' && !r.paid_date && (
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => handleApproveBoleto(r)}
                        >
                            Aprovar pagamento
                        </Button>
                    )}
                    <Popconfirm title="Desativar este lançamento?" onConfirm={() => handleDeleteEntry(r.id)}>
                        <Button icon={<DeleteOutlined />} size="small" danger type="text" />
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    // ── Colunas categorias ──
    const categoryColumns: ColumnsType<any> = [
        {
            title: 'Categoria',
            dataIndex: 'category',
            render: (t, r) => (
                <span style={{ fontWeight: 600 }}>
                    {r.type === 'INCOME' ? '📈' : '📉'} {t}
                </span>
            ),
        },
        { title: 'Lançamentos', dataIndex: 'count', width: 120, align: 'center' },
        {
            title: 'Total',
            dataIndex: 'total',
            width: 180,
            align: 'right',
            sorter: (a, b) => a.total - b.total,
            defaultSortOrder: 'descend',
            render: (v, r) => (
                <span style={{ color: r.type === 'INCOME' ? '#12B76A' : '#F04438', fontWeight: 700 }}>
                    {formatCurrency(v)}
                </span>
            ),
        },
        {
            title: '% do Total',
            width: 120,
            align: 'center',
            render: (_, r) => {
                const total = r.type === 'INCOME' ? totalIncome : totalExpense
                const pct = total > 0 ? ((r.total / total) * 100).toFixed(1) : '0'
                return <Tag color={r.type === 'INCOME' ? 'green' : 'red'}>{pct}%</Tag>
            },
        },
    ]

    const barChartData = {
        labels: weeklyData.map(w => w.label),
        datasets: [
            {
                label: 'Receitas',
                data: weeklyData.map(w => w.income),
                backgroundColor: 'rgba(18, 183, 106, 0.8)',
                borderRadius: 6,
                borderSkipped: false,
            },
            {
                label: 'Despesas',
                data: weeklyData.map(w => w.expense),
                backgroundColor: 'rgba(240, 68, 56, 0.8)',
                borderRadius: 6,
                borderSkipped: false,
            },
        ],
    }

    const barChartOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: { usePointStyle: true, padding: 16, font: { size: 12, family: "'Inter', sans-serif" } },
            },
            tooltip: {
                backgroundColor: '#1D2939',
                titleColor: '#FFF',
                bodyColor: '#e2e8f0',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 12,
                callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 12 }, color: '#64748b' } },
            y: {
                grid: { color: 'rgba(228, 231, 236, 0.5)' },
                ticks: {
                    font: { size: 11 }, color: '#98A2B3',
                    callback: (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`,
                },
            },
        },
    }

    const expenseDoughnutLabels = Object.keys(expenseByCatChart)
    const expenseDoughnutData = {
        labels: expenseDoughnutLabels,
        datasets: [{
            data: Object.values(expenseByCatChart),
            backgroundColor: CHART_COLORS.slice(0, expenseDoughnutLabels.length),
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 8,
        }],
    }

    const doughnutOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
            legend: {
                position: 'right',
                labels: { usePointStyle: true, padding: 12, font: { size: 11, family: "'Inter', sans-serif" } },
            },
            tooltip: {
                backgroundColor: '#1D2939',
                titleColor: '#FFF',
                bodyColor: '#e2e8f0',
                cornerRadius: 8,
                padding: 12,
                callbacks: {
                    label: (ctx: any) => {
                        const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0)
                        const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0'
                        return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`
                    },
                },
            },
        },
    }

    const incomeLabels = Object.keys(incomeByCatChart)
    const incomeBarData = {
        labels: incomeLabels,
        datasets: [{
            data: Object.values(incomeByCatChart),
            backgroundColor: incomeLabels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
            borderRadius: 6,
            borderSkipped: false,
        }],
    }

    const horizontalBarOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1D2939',
                cornerRadius: 8,
                padding: 12,
                callbacks: { label: (ctx: any) => ` ${formatCurrency(ctx.raw)}` },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(228, 231, 236, 0.5)' },
                ticks: { callback: (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}` },
            },
            y: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
    }

    return (
        <Layout title={PAGE_TITLES.CASH_FLOW} subtitle="Gestão financeira completa">
            {contextHolder}

            <div className="pc-card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <CalendarOutlined style={{ fontSize: 18, color: '#94a3b8' }} />
                    <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} allowClear={false} format="MMMM YYYY" />
                    <Button icon={<SyncOutlined />} onClick={() => fetchData()}>Atualizar</Button>
                </Space>
                <Space>
                    {canEdit(MODULES.CASH_FLOW) && (
                        <>
                            <Button icon={<SyncOutlined />} onClick={handleGenerateRecurring}>Gerar Contas do Mês (Fixas/Salários)</Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setExpenseAmount(''); setDrawerType('EXPENSE'); setDrawerOpen(true) }}>
                                Novo Lançamento
                            </Button>
                        </>
                    )}
                </Space>
            </div>

            <div className="kpi-grid">
                <CardKPI title="Receitas" value={formatCurrency(totalIncome)} icon={<ArrowUpOutlined />} variant="green" />
                <CardKPI title="Despesas" value={formatCurrency(totalExpense)} icon={<ArrowDownOutlined />} variant="red" />
                <CardKPI title="Saldo do Mês" value={formatCurrency(balance)} icon={<DollarOutlined />} variant={balance >= 0 ? 'green' : 'red'} />
                <CardKPI title="Despesas Fixas" value={formatCurrency(totalFixed)} icon={<BankOutlined />} variant="orange" />
            </div>

            <Tabs
                type="card"
                items={[
                    {
                        label: <span><DollarOutlined style={{ marginRight: 4 }} />Extrato</span>,
                        key: '1',
                        children: (
                            <div className="pc-card--table">
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                    <Button
                                        icon={<FileExcelOutlined />}
                                        onClick={() => setExportFormatModalOpen(true)}
                                        style={{ background: '#217346', borderColor: '#217346', color: '#fff' }}
                                    >
                                        Exportar
                                    </Button>
                                </div>

                                {/* ── Extrato structured view (matches Excel export) ── */}
                                <div style={{ background: '#0d1b2a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    {/* Header */}
                                    <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a2744' }}>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                                            Fluxo de Caixa - Extrato
                                        </span>
                                        <span style={{ marginLeft: 12, fontSize: 13, color: '#94a3b8' }}>
                                            {month.format('MMMM [de] YYYY')}
                                        </span>
                                    </div>

                                    {/* ── ENTRADAS ── */}
                                    <div style={{ padding: '12px 20px', background: '#00B050', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Entradas</span>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>Valor</span>
                                    </div>
                                    {INCOME_LABELS.map((label, idx) => {
                                        const val = extratoData.incomeByLabel[label] || 0
                                        return (
                                            <div key={label} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '8px 20px', background: idx % 2 === 0 ? '#e2efda22' : '#e2efda11',
                                                borderLeft: '4px solid #00B050',
                                            }}>
                                                <span style={{ color: '#cbd5e1', fontSize: 13 }}>{label}</span>
                                                <span style={{ color: val > 0 ? '#4ade80' : '#64748b', fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                                                    {val > 0 ? formatCurrency(val) : '—'}
                                                </span>
                                            </div>
                                        )
                                    })}
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 20px', background: '#00B050',
                                    }}>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>TOTAL ENTRADAS</span>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                                            {formatCurrency(extratoData.totalEntradas)}
                                        </span>
                                    </div>

                                    {/* Spacer */}
                                    <div style={{ height: 16, background: '#0d1b2a' }} />

                                    {/* ── SAIDAS ── */}
                                    <div style={{ padding: '12px 20px', background: '#DC2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Saidas</span>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>Valor</span>
                                    </div>

                                    {EXPENSE_SECTIONS.map((section) => {
                                        const sectionColor: Record<string, string> = {
                                            'Custo produto': '#EF4444',
                                            'Custo Mao de obra Producao': '#7C3AED',
                                            'Despesa Mao de obra Indireta': '#A855F7',
                                            'Despesas fixas': '#2563EB',
                                            'Despesas variaveis': '#059669',
                                            'Despesas Financeiras': '#D97706',
                                            'Impostos': '#DC2626',
                                            'Regime Tributario': '#B91C1C',
                                            'Lucro': '#0891B2',
                                        }
                                        const color = sectionColor[section.header] || '#64748b'
                                        const sectionTotal = extratoData.sectionTotals[section.header] || 0
                                        const items = extratoData.expenseBySectionItem[section.header] || {}

                                        return (
                                            <div key={section.header}>
                                                {/* Section header */}
                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 20px', background: `${color}cc`,
                                                }}>
                                                    <span style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{section.header}</span>
                                                    <span style={{ fontWeight: 700, color: '#fff', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                                                        {sectionTotal > 0 ? formatCurrency(sectionTotal) : '—'}
                                                    </span>
                                                </div>
                                                {/* Section items */}
                                                {section.items.map((item, idx) => {
                                                    const val = items[item.label] || 0
                                                    return (
                                                        <div key={item.label} style={{
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            padding: '7px 20px 7px 36px',
                                                            background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                                                            borderLeft: `4px solid ${color}`,
                                                        }}>
                                                            <span style={{ color: '#94a3b8', fontSize: 12 }}>{item.label}</span>
                                                            <span style={{ color: val > 0 ? '#f87171' : '#475569', fontWeight: 500, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                                                                {val > 0 ? formatCurrency(val) : '—'}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })}

                                    {/* Unmatched expenses */}
                                    {extratoData.unmatchedTotal > 0 && (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '7px 20px 7px 36px', background: 'rgba(255,255,255,0.02)',
                                            borderLeft: '4px solid #64748b',
                                        }}>
                                            <span style={{ color: '#94a3b8', fontSize: 12 }}>OUTRAS DESPESAS</span>
                                            <span style={{ color: '#f87171', fontWeight: 500, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                                                {formatCurrency(extratoData.unmatchedTotal)}
                                            </span>
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 20px', background: '#DC2626',
                                    }}>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>TOTAL SAIDAS</span>
                                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                                            {formatCurrency(extratoData.totalSaidas)}
                                        </span>
                                    </div>

                                    {/* Spacer */}
                                    <div style={{ height: 16, background: '#0d1b2a' }} />

                                    {/* ── RESULTADO ── */}
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '16px 20px',
                                        background: extratoData.resultado >= 0 ? '#065f4620' : '#7f1d1d20',
                                        borderLeft: `5px solid ${extratoData.resultado >= 0 ? '#22c55e' : '#ef4444'}`,
                                        borderTop: '2px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>RESULTADO DO MES</span>
                                        <span style={{
                                            fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums',
                                            color: extratoData.resultado >= 0 ? '#4ade80' : '#f87171',
                                        }}>
                                            {formatCurrency(extratoData.resultado)}
                                        </span>
                                    </div>
                                </div>

                                {/* ── Detailed entry table below ── */}
                                <div style={{ marginTop: 24 }}>
                                    <div style={{ marginBottom: 8, color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
                                        Lancamentos detalhados
                                    </div>
                                    <Table
                                        columns={columns}
                                        dataSource={data}
                                        rowKey="id"
                                        loading={loading}
                                        pagination={{ pageSize: 15, showTotal: (t) => `${t} lançamentos` }}
                                        size="middle"
                                    />
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: <span><FundOutlined style={{ marginRight: 4 }} />Visão Diária</span>,
                        key: 'daily',
                        children: (
                            <div className="pc-card--table">
                                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>
                                        Fluxo dia a dia — identifique antecipadamente quando o saldo ficará negativo
                                    </span>
                                </div>
                                <Table
                                    columns={[
                                        {
                                            title: 'Dia', dataIndex: 'day', width: 70, align: 'center',
                                            render: (d: number, r: any) => {
                                                const dayName = dayjs(r.date).format('ddd')
                                                const isWeekend = dayjs(r.date).day() === 0 || dayjs(r.date).day() === 6
                                                return (
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: 15 }}>{String(d).padStart(2, '0')}</div>
                                                        <div style={{ fontSize: 10, color: isWeekend ? '#F79009' : '#64748b', textTransform: 'capitalize' }}>{dayName}</div>
                                                    </div>
                                                )
                                            },
                                        },
                                        {
                                            title: 'Receitas', dataIndex: 'income', width: 140, align: 'right',
                                            render: (v: number) => v > 0 ? <span style={{ color: '#12B76A', fontWeight: 500 }}>+ {formatCurrency(v)}</span> : <span style={{ color: '#475467' }}>—</span>,
                                        },
                                        {
                                            title: 'Despesas', dataIndex: 'expense', width: 140, align: 'right',
                                            render: (v: number) => v > 0 ? <span style={{ color: '#F04438', fontWeight: 500 }}>- {formatCurrency(v)}</span> : <span style={{ color: '#475467' }}>—</span>,
                                        },
                                        {
                                            title: 'Saldo do Dia', dataIndex: 'balance', width: 140, align: 'right',
                                            render: (v: number) => {
                                                if (v === 0) return <span style={{ color: '#475467' }}>—</span>
                                                return <span style={{ color: v >= 0 ? '#12B76A' : '#F04438', fontWeight: 600 }}>{formatCurrency(v)}</span>
                                            },
                                        },
                                        {
                                            title: 'Saldo Acumulado', dataIndex: 'runningBalance', width: 160, align: 'right',
                                            render: (v: number) => (
                                                <span style={{
                                                    color: v >= 0 ? '#12B76A' : '#F04438',
                                                    fontWeight: 700,
                                                    fontSize: 14,
                                                    padding: '2px 8px',
                                                    borderRadius: 4,
                                                    background: v < 0 ? 'rgba(240,68,56,0.1)' : undefined,
                                                }}>
                                                    {formatCurrency(v)}
                                                </span>
                                            ),
                                        },
                                        {
                                            title: 'Movimentações', dataIndex: 'entries', ellipsis: true,
                                            render: (entries: any[]) => {
                                                if (entries.length === 0) return <span style={{ color: '#475467', fontSize: 12 }}>Sem movimentação</span>
                                                return (
                                                    <Space size={4} wrap>
                                                        {entries.slice(0, 3).map((e: any, i: number) => (
                                                            <Tag key={i} color={e.type === 'INCOME' ? 'green' : 'red'} style={{ fontSize: 11, margin: 0 }}>
                                                                {(e.description || '').substring(0, 25)}{(e.description || '').length > 25 ? '...' : ''}
                                                            </Tag>
                                                        ))}
                                                        {entries.length > 3 && <Tag style={{ fontSize: 11 }}>+{entries.length - 3}</Tag>}
                                                    </Space>
                                                )
                                            },
                                        },
                                    ]}
                                    dataSource={dailyData.filter(d => d.income > 0 || d.expense > 0 || d.runningBalance !== 0)}
                                    rowKey="date"
                                    loading={loading}
                                    pagination={false}
                                    size="small"
                                    rowClassName={(r) => r.runningBalance < 0 ? 'daily-negative-row' : ''}
                                    summary={() => (
                                        <Table.Summary fixed>
                                            <Table.Summary.Row style={{ background: '#0a1628' }}>
                                                <Table.Summary.Cell index={0}><strong>Total</strong></Table.Summary.Cell>
                                                <Table.Summary.Cell index={1} align="right"><strong style={{ color: '#12B76A' }}>{formatCurrency(totalIncome)}</strong></Table.Summary.Cell>
                                                <Table.Summary.Cell index={2} align="right"><strong style={{ color: '#F04438' }}>{formatCurrency(totalExpense)}</strong></Table.Summary.Cell>
                                                <Table.Summary.Cell index={3} align="right"><strong style={{ color: balance >= 0 ? '#12B76A' : '#F04438' }}>{formatCurrency(balance)}</strong></Table.Summary.Cell>
                                                <Table.Summary.Cell index={4} />
                                                <Table.Summary.Cell index={5} />
                                            </Table.Summary.Row>
                                        </Table.Summary>
                                    )}
                                />
                                {dailyData.some(d => d.runningBalance < 0) && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        style={{ marginTop: 12 }}
                                        message="Atenção: Saldo negativo detectado"
                                        description={
                                            <span>
                                                O saldo acumulado fica negativo a partir do dia{' '}
                                                <strong>{dailyData.find(d => d.runningBalance < 0)?.day}</strong>.
                                                Considere antecipar uma entrada ou reduzir despesas nesse período.
                                            </span>
                                        }
                                    />
                                )}
                            </div>
                        ),
                    },
                    {
                        label: <span><PieChartOutlined style={{ marginRight: 4 }} />Análise Gráfica</span>,
                        key: '2',
                        children: (
                            <div style={{ display: 'grid', gap: 24 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24 }}>
                                    <div className="pc-card" style={{ padding: 24 }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Receitas x Despesas por Semana</h4>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>Comparativo semanal — {month.format('MMMM YYYY')}</p>
                                        <div style={{ height: 280 }}>
                                            {weeklyData.length > 0 ? <Bar data={barChartData} options={barChartOptions} /> : <p style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Sem dados no período</p>}
                                        </div>
                                    </div>
                                    <div className="pc-card" style={{ padding: 24 }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Resumo do Mês</h4>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>Visão consolidada</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                                            <div style={{ padding: 16, background: 'rgba(34, 197, 94, 0.12)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                                                <div style={{ fontSize: 12, color: '#94a3b8' }}>Total de Receitas</div>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: '#12B76A' }}>{formatCurrency(totalIncome)}</div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>{data.filter(d => d.type === 'INCOME').length} lançamento(s)</div>
                                            </div>
                                            <div style={{ padding: 16, background: 'rgba(240, 68, 56, 0.12)', borderRadius: 8, border: '1px solid rgba(240, 68, 56, 0.3)' }}>
                                                <div style={{ fontSize: 12, color: '#94a3b8' }}>Total de Despesas</div>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: '#F04438' }}>{formatCurrency(totalExpense)}</div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>{data.filter(d => d.type === 'EXPENSE').length} lançamento(s)</div>
                                            </div>
                                            <div style={{ padding: 16, background: balance >= 0 ? 'rgba(46, 144, 250, 0.12)' : 'rgba(247, 144, 9, 0.12)', borderRadius: 8, border: `1px solid ${balance >= 0 ? 'rgba(46, 144, 250, 0.3)' : 'rgba(247, 144, 9, 0.3)'}` }}>
                                                <div style={{ fontSize: 12, color: '#94a3b8' }}>Saldo</div>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: balance >= 0 ? '#1890FF' : '#FA8C16' }}>{formatCurrency(balance)}</div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                                    {balance >= 0 ? 'Mês positivo' : 'Mês negativo — despesas superam receitas'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                    <div className="pc-card" style={{ padding: 24 }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Despesas por Categoria</h4>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>Distribuição das despesas</p>
                                        <div style={{ height: 280 }}>
                                            {expenseDoughnutLabels.length > 0
                                                ? <Doughnut data={expenseDoughnutData} options={doughnutOptions} />
                                                : <p style={{ textAlign: 'center', padding: 80, color: '#98A2B3' }}>Sem despesas</p>
                                            }
                                        </div>
                                    </div>
                                    <div className="pc-card" style={{ padding: 24 }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Receitas por Origem</h4>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>De onde vem o faturamento</p>
                                        <div style={{ height: 280 }}>
                                            {incomeLabels.length > 0
                                                ? <Bar data={incomeBarData} options={horizontalBarOptions} />
                                                : <p style={{ textAlign: 'center', padding: 80, color: '#98A2B3' }}>Sem receitas</p>
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: <span><BankOutlined style={{ marginRight: 4 }} />Despesas Recorrentes</span>,
                        key: '3',
                        children: (
                            <div className="pc-card--table">
                                <div className="filter-bar" style={{ marginBottom: 12 }}>
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>Despesas cadastradas que se repetem mensalmente</span>
                                </div>
                                {fixedGrouped.length > 0 ? (
                                    <Table
                                        columns={[
                                            {
                                                title: 'Descrição',
                                                dataIndex: 'description',
                                                render: (t, r) => (
                                                    <span style={{ fontWeight: 500 }}>
                                                        {t}
                                                        <Tag color={r.isFixed ? 'blue' : 'orange'} style={{ marginLeft: 8, fontSize: 10 }}>
                                                            {r.isFixed ? 'Fixa' : 'Variável'}
                                                        </Tag>
                                                    </span>
                                                ),
                                            },
                                            {
                                                title: 'Valor Mensal',
                                                dataIndex: 'amount',
                                                align: 'right',
                                                render: (v) => <strong style={{ color: '#F04438' }}>{formatCurrency(v)}</strong>,
                                                sorter: (a, b) => a.amount - b.amount,
                                                defaultSortOrder: 'descend',
                                            },
                                            {
                                                title: '% das Despesas',
                                                width: 130,
                                                align: 'center',
                                                render: (_, r) => {
                                                    const pct = totalExpense > 0 ? ((r.amount / totalExpense) * 100).toFixed(1) : '0'
                                                    return <Tag>{pct}%</Tag>
                                                },
                                            },
                                        ]}
                                        dataSource={fixedGrouped}
                                        rowKey="description"
                                        pagination={false}
                                        summary={() => (
                                            <Table.Summary>
                                                <Table.Summary.Row style={{ background: 'rgba(240, 68, 56, 0.12)' }}>
                                                    <Table.Summary.Cell index={0}><strong>Total Despesas Recorrentes</strong></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={1} align="right"><strong style={{ color: '#F04438', fontSize: 16 }}>{formatCurrency(totalFixed)}</strong></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={2} align="center"><Tag color="red">{totalExpense > 0 ? ((totalFixed / totalExpense) * 100).toFixed(1) : '0'}%</Tag></Table.Summary.Cell>
                                                </Table.Summary.Row>
                                            </Table.Summary>
                                        )}
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: 40, color: '#98A2B3' }}>
                                        <BankOutlined style={{ fontSize: 40, marginBottom: 12 }} />
                                        <p>Nenhuma despesa recorrente cadastrada neste mês.</p>
                                        <p style={{ fontSize: 12 }}>Use "Novo Lançamento" → Despesa para cadastrar.</p>
                                    </div>
                                )}
                            </div>
                        ),
                    },
                    {
                        label: <span><TagOutlined style={{ marginRight: 4 }} />Categorias</span>,
                        key: '4',
                        children: (
                            <div style={{ display: 'grid', gap: 24 }}>
                                <div className="pc-card--table">
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <h4 style={{ margin: 0, color: '#12B76A' }}>📈 Receitas por Categoria</h4>
                                    </div>
                                    {incomeCategories.length > 0 ? (
                                        <Table columns={categoryColumns} dataSource={incomeCategories} rowKey="category" pagination={false}
                                            summary={() => (
                                                <Table.Summary>
                                                    <Table.Summary.Row style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                                                        <Table.Summary.Cell index={0}><strong>Total Receitas</strong></Table.Summary.Cell>
                                                        <Table.Summary.Cell index={1} align="center"><strong>{incomeCategories.reduce((s, c) => s + c.count, 0)}</strong></Table.Summary.Cell>
                                                        <Table.Summary.Cell index={2} align="right"><strong style={{ color: '#12B76A' }}>{formatCurrency(totalIncome)}</strong></Table.Summary.Cell>
                                                        <Table.Summary.Cell index={3} align="center"><Tag color="green">100%</Tag></Table.Summary.Cell>
                                                    </Table.Summary.Row>
                                                </Table.Summary>
                                            )}
                                        />
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 24, color: '#98A2B3' }}>Sem receitas neste mês</div>
                                    )}
                                </div>
                                <div className="pc-card--table">
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <h4 style={{ margin: 0, color: '#F04438' }}>📉 Despesas por Categoria</h4>
                                    </div>
                                    {expenseCategories.length > 0 ? (
                                        <Table columns={categoryColumns} dataSource={expenseCategories} rowKey="category" pagination={false}
                                            summary={() => (
                                                <Table.Summary>
                                                    <Table.Summary.Row style={{ background: 'rgba(240, 68, 56, 0.12)' }}>
                                                        <Table.Summary.Cell index={0}><strong>Total Despesas</strong></Table.Summary.Cell>
                                                        <Table.Summary.Cell index={1} align="center"><strong>{expenseCategories.reduce((s, c) => s + c.count, 0)}</strong></Table.Summary.Cell>
                                                        <Table.Summary.Cell index={2} align="right"><strong style={{ color: '#F04438' }}>{formatCurrency(totalExpense)}</strong></Table.Summary.Cell>
                                                        <Table.Summary.Cell index={3} align="center"><Tag color="red">100%</Tag></Table.Summary.Cell>
                                                    </Table.Summary.Row>
                                                </Table.Summary>
                                            )}
                                        />
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 24, color: '#98A2B3' }}>Sem despesas neste mês</div>
                                    )}
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: 'Salários',
                        key: '5',
                        children: (
                            <div className="pc-card--table">
                                <div className="filter-bar">
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>Baseado no cadastro de funcionários ativos</span>
                                </div>
                                <Table
                                    columns={[
                                        { title: 'Funcionário', dataIndex: 'name', render: (t) => <span style={{ fontWeight: 500 }}>{t}</span> },
                                        { title: 'Salário Base', dataIndex: 'salary', align: 'right', render: (v) => <strong>{formatCurrency(v)}</strong> },
                                        { title: 'Status', render: () => <Tag color="green">Ativo</Tag> },
                                    ]}
                                    dataSource={employees}
                                    rowKey="id"
                                    pagination={false}
                                    summary={() => employees.length > 0 ? (
                                        <Table.Summary>
                                            <Table.Summary.Row style={{ background: '#0a1628' }}>
                                                <Table.Summary.Cell index={0}><strong>Total Folha</strong></Table.Summary.Cell>
                                                <Table.Summary.Cell index={1} align="right"><strong>{formatCurrency(employees.reduce((s, e) => s + Number(e.salary || 0), 0))}</strong></Table.Summary.Cell>
                                                <Table.Summary.Cell index={2} />
                                            </Table.Summary.Row>
                                        </Table.Summary>
                                    ) : null}
                                />
                            </div>
                        ),
                    },
                    {
                        label: <span><CreditCardOutlined style={{ marginRight: 4 }} />Antecipação de cartão</span>,
                        key: '7',
                        children: (
                            <div style={{ display: 'grid', gap: 24 }}>
                                {/* Section A: Valores disponíveis */}
                                <div className="pc-card" style={{ padding: 24 }}>
                                    <h4 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Valores disponíveis para antecipação</h4>
                                    <Table
                                        columns={[
                                            { title: 'Mês', dataIndex: 'month', render: (v: string) => dayjs(v + '-01').format('MMMM/YYYY') },
                                            { title: 'Meses até vencimento', dataIndex: 'monthsUntil', align: 'center' as const, render: (v: number) => <Tag color="blue">{v} {v === 1 ? 'mês' : 'meses'}</Tag> },
                                            { title: 'Parcelas', dataIndex: 'count', align: 'center' as const },
                                            { title: 'Valor disponível', dataIndex: 'total', align: 'right' as const, render: (v: number) => <strong style={{ color: '#12B76A' }}>{formatCurrency(v)}</strong> },
                                        ]}
                                        dataSource={anticipationAvailable}
                                        rowKey="month"
                                        pagination={false}
                                        size="small"
                                        locale={{ emptyText: 'Nenhuma parcela de cartão disponível para antecipação' }}
                                        loading={anticLoading}
                                        summary={() => anticipationAvailable.length > 0 ? (
                                            <Table.Summary>
                                                <Table.Summary.Row style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                                                    <Table.Summary.Cell index={0}><strong>Total disponível</strong></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={1} />
                                                    <Table.Summary.Cell index={2} align="center"><strong>{anticipationAvailable.reduce((s, r) => s + r.count, 0)}</strong></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={3} align="right"><strong style={{ color: '#12B76A' }}>{formatCurrency(anticipationAvailable.reduce((s, r) => s + r.total, 0))}</strong></Table.Summary.Cell>
                                                </Table.Summary.Row>
                                            </Table.Summary>
                                        ) : null}
                                    />
                                </div>

                                {/* Section B: Antecipar valores */}
                                <div className="pc-card" style={{ padding: 24 }}>
                                    <h4 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Antecipar valores</h4>
                                    <div style={{ maxWidth: 400 }}>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Valor total a antecipar</label>
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={0}
                                            max={totalAnticipationAvailable || undefined}
                                            step={0.01}
                                            precision={2}
                                            prefix="R$"
                                            value={anticGrossAmount}
                                            onChange={(v) => setAnticGrossAmount(v || 0)}
                                            formatter={(v) => `${v}`.replace('.', ',')}
                                            parser={(v) => Number((v || '0').replace(',', '.'))}
                                        />
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>O valor será antecipado dos primeiros meses disponíveis (abril, maio, …) até completar o total.</div>
                                    </div>
                                    <div style={{ marginTop: 16 }}>
                                        <Radio.Group value={anticFeeMode} onChange={(e) => setAnticFeeMode(e.target.value)} style={{ marginBottom: 12 }}>
                                            <Radio value="percent">Taxa de juros (%)</Radio>
                                            <Radio value="fixed">Valor da taxa (R$)</Radio>
                                        </Radio.Group>
                                        <div style={{ maxWidth: 300 }}>
                                            {anticFeeMode === 'percent' ? (
                                                <InputNumber
                                                    style={{ width: '100%' }}
                                                    min={0}
                                                    max={100}
                                                    step={0.1}
                                                    precision={2}
                                                    value={anticFeePercent}
                                                    onChange={(v) => setAnticFeePercent(v ?? 0)}
                                                    formatter={(v) => (v != null && v !== '') ? `${String(v).replace('.', ',')}%` : ''}
                                                    parser={(v) => {
                                                        const s = String(v || '').replace(/%/g, '').replace(',', '.').trim()
                                                        const n = Number(s)
                                                        return isNaN(n) ? 0 : n
                                                    }}
                                                />
                                            ) : (
                                                <InputNumber
                                                    style={{ width: '100%' }}
                                                    min={0}
                                                    step={0.01}
                                                    precision={2}
                                                    prefix="R$"
                                                    value={anticFeeValue}
                                                    onChange={(v) => setAnticFeeValue(v || 0)}
                                                    formatter={(v) => `${v}`.replace('.', ',')}
                                                    parser={(v) => Number((v || '0').replace(',', '.'))}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    {anticGrossAmount > 0 && (
                                        <div style={{ marginTop: 16, padding: 16, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, border: '1px solid #86efac', maxWidth: 400 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <span>Valor bruto:</span>
                                                <strong>{formatCurrency(anticGrossAmount)}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#F04438' }}>
                                                <span>Taxa:</span>
                                                <strong>- {formatCurrency(anticFeeMode === 'percent' ? anticGrossAmount * anticFeePercent / 100 : anticFeeValue)}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #86efac', paddingTop: 8 }}>
                                                <span style={{ fontWeight: 700 }}>Valor líquido:</span>
                                                <strong style={{ color: '#12B76A', fontSize: 18 }}>{formatCurrency(anticGrossAmount - (anticFeeMode === 'percent' ? anticGrossAmount * anticFeePercent / 100 : anticFeeValue))}</strong>
                                            </div>
                                        </div>
                                    )}
                                    <Button
                                        type="primary"
                                        style={{ marginTop: 16 }}
                                        onClick={handleConfirmAnticipation}
                                        disabled={anticGrossAmount <= 0 || totalAnticipationAvailable <= 0}
                                        loading={anticLoading}
                                    >
                                        Confirmar antecipação
                                    </Button>
                                </div>

                                {/* Section C: Histórico */}
                                <div className="pc-card" style={{ padding: 24 }}>
                                    <h4 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Histórico de antecipações</h4>
                                    <Table
                                        columns={[
                                            { title: 'Data', dataIndex: 'created_at', render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm') },
                                            { title: 'Valor bruto', dataIndex: 'total_gross', align: 'right' as const, render: (v: number) => formatCurrency(Number(v)) },
                                            { title: 'Taxa', dataIndex: 'fee_amount', align: 'right' as const, render: (v: number, r: any) => <span style={{ color: '#F04438' }}>{formatCurrency(Number(v))} {Number(r.fee_percent) > 0 ? `(${Number(r.fee_percent).toFixed(2)}%)` : ''}</span> },
                                            { title: 'Valor líquido', dataIndex: 'net_amount', align: 'right' as const, render: (v: number) => <strong style={{ color: '#12B76A' }}>{formatCurrency(Number(v))}</strong> },
                                            { title: 'Meses', dataIndex: 'months', align: 'center' as const },
                                            { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={v === 'COMPLETED' ? 'green' : v === 'PENDING' ? 'orange' : 'default'}>{v === 'COMPLETED' ? 'Concluída' : v === 'PENDING' ? 'Pendente' : v}</Tag> },
                                        ]}
                                        dataSource={anticipationHistory}
                                        rowKey="id"
                                        pagination={{ pageSize: 10 }}
                                        size="small"
                                        locale={{ emptyText: 'Nenhuma antecipação realizada' }}
                                    />
                                </div>
                            </div>
                        ),
                    },
                    ...(isLucroReal ? [{
                        label: <span><PieChartOutlined style={{ marginRight: 4 }} />Restituição (Lucro Real)</span>,
                        key: '8',
                        children: (
                            <div className="pc-card" style={{ padding: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Créditos fiscais estimados — {month.format('MMMM [de] YYYY')}</h4>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                                            Estimativa de créditos de PIS, COFINS e ICMS sobre compras para regime de Lucro Real.
                                        </p>
                                    </div>
                                    <Space>
                                        <Button onClick={handleAutoCalculateRestitution}>
                                            Calcular automaticamente
                                        </Button>
                                        <Button type="primary" onClick={handleSaveRestitution} loading={restitutionLoading}>
                                            Salvar estimativa
                                        </Button>
                                    </Space>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 24, marginBottom: 24 }}>
                                    <div>
                                        <Statistic
                                            title="Total de compras do mês (proxy: CMV + MO produtiva)"
                                            value={restitutionTotalPurchases}
                                            formatter={(v) => formatCurrency(Number(v))}
                                        />
                                        <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
                                            Use o botão &quot;Calcular automaticamente&quot; para preencher a partir do fluxo de caixa
                                            ou ajuste manualmente o valor de compras mensais.
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <Statistic
                                            title="Crédito PIS (1,65%)"
                                            value={restitutionPis}
                                            formatter={(v) => formatCurrency(Number(v))}
                                        />
                                        <Statistic
                                            title="Crédito COFINS (7,60%)"
                                            value={restitutionCofins}
                                            formatter={(v) => formatCurrency(Number(v))}
                                        />
                                        <Statistic
                                            title="Crédito ICMS (compras)"
                                            value={restitutionIcms}
                                            formatter={(v) => formatCurrency(Number(v))}
                                        />
                                        <Statistic
                                            title="Total a restituir (estimado)"
                                            value={restitutionTotal}
                                            formatter={(v) => formatCurrency(Number(v))}
                                        />
                                    </div>
                                </div>

                                <Alert
                                    type="info"
                                    showIcon
                                    style={{ marginBottom: 24 }}
                                    message="Aviso importante"
                                    description="Estes valores são estimativas simplificadas para apoiar a precificação em regime de Lucro Real. Eles não substituem a apuração oficial de PIS, COFINS e ICMS feita pelo seu contador."
                                />

                                <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Histórico de restituições estimadas</h4>
                                <Table
                                    columns={[
                                        {
                                            title: 'Mês',
                                            dataIndex: 'reference_month',
                                            render: (v: string) => dayjs(v).format('MM/YYYY'),
                                        },
                                        {
                                            title: 'Compras',
                                            dataIndex: 'total_purchases',
                                            align: 'right' as const,
                                            render: (v: number) => formatCurrency(Number(v)),
                                        },
                                        {
                                            title: 'PIS',
                                            dataIndex: 'pis_credit',
                                            align: 'right' as const,
                                            render: (v: number) => formatCurrency(Number(v)),
                                        },
                                        {
                                            title: 'COFINS',
                                            dataIndex: 'cofins_credit',
                                            align: 'right' as const,
                                            render: (v: number) => formatCurrency(Number(v)),
                                        },
                                        {
                                            title: 'ICMS',
                                            dataIndex: 'icms_credit',
                                            align: 'right' as const,
                                            render: (v: number) => formatCurrency(Number(v)),
                                        },
                                        {
                                            title: 'Total',
                                            dataIndex: 'total_restitution',
                                            align: 'right' as const,
                                            render: (v: number) => <strong>{formatCurrency(Number(v))}</strong>,
                                        },
                                    ]}
                                    dataSource={restitutionEntries}
                                    rowKey="id"
                                    loading={restitutionLoading}
                                    pagination={{ pageSize: 12 }}
                                />
                            </div>
                        ),
                    }] : [])
                ]}
            />

            {/* Drawer: Novo Lançamento */}
            <Drawer title="Novo Lançamento" width={460} open={drawerOpen} onClose={() => setDrawerOpen(false)}
                extra={<Button type="primary" onClick={handleSaveEntry}>Salvar</Button>}>
                <div style={{ marginBottom: 16 }}>
                    <span style={{ fontWeight: 500, marginRight: 8 }}>Tipo:</span>
                    <Select
                        value={drawerType}
                        onChange={(v) => { setDrawerType(v); form.resetFields(); setExpenseAmount('') }}
                        style={{ width: 220 }}
                    >
                        <Select.Option value="EXPENSE">Despesa (Saída)</Select.Option>
                        <Select.Option value="INCOME">Receita (Entrada)</Select.Option>
                    </Select>
                </div>
                {drawerType === 'INCOME' ? (
                    <Form form={form} layout="vertical">
                        <Form.Item name="description" label="Descrição" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="amount" label="Valor" rules={[{ required: true }]}>
                            <InputNumber style={{ width: '100%' }} prefix="R$" step={0.01} />
                        </Form.Item>
                        <Form.Item name="due_date" label="Data Vencimento" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                        <Form.Item name="payment_method" label="Pagamento">
                            <Select allowClear>
                                {PAYMENT_METHODS.map(p => <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>)}
                            </Select>
                        </Form.Item>
                        <Form.Item name="paid_date" label="Data Pagamento (opcional)">
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Se já foi pago" />
                        </Form.Item>
                    </Form>
                ) : (
                    <Form form={form} layout="vertical">
                        <Alert type="info" showIcon message="Despesas recorrentes" description="A despesa será criada para cada mês no período informado. Se não informar datas, será criada do mês atual até dezembro." style={{ marginBottom: 16 }} />
                        <Form.Item name="expense_category" label="Categoria da Despesa" rules={[{ required: true, message: 'Selecione a categoria' }]}>
                            <Select
                                placeholder="Selecione a categoria"
                                options={EXPENSE_CATEGORY_OPTIONS}
                                showSearch
                                filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                                onChange={(val) => {
                                    const g = getGroupForCategory(val)
                                    if (g) form.setFieldsValue({ expense_group: g })
                                }}
                            />
                        </Form.Item>
                        <Form.Item name="expense_group" label="Tipo de Despesa" rules={[{ required: true, message: 'Selecione o tipo' }]}>
                            <Select placeholder="Selecione o tipo">
                                <Select.OptGroup label="Mão de Obra">
                                    <Select.Option
                                        value="MAO_DE_OBRA_PRODUTIVA"
                                        title="Salários, INSS e encargos do setor que produz (entra no custo direto do produto/serviço)"
                                    >
                                        Mão de Obra Produtiva
                                    </Select.Option>
                                    <Select.Option
                                        value="MAO_DE_OBRA_ADMINISTRATIVA"
                                        title="Pró-labore, salários comerciais e administrativos (entra como % de despesa na precificação)"
                                    >
                                        Mão de Obra Administrativa
                                    </Select.Option>
                                </Select.OptGroup>
                                <Select.OptGroup label="Outros tipos">
                                    {EXPENSE_GROUP_OPTIONS.filter(o => o.value !== 'MAO_DE_OBRA').map(o => (
                                        <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                                    ))}
                                </Select.OptGroup>
                            </Select>
                        </Form.Item>
                        <Form.Item name="expense_description" label="Descrição (opcional)">
                            <Input placeholder="Ex: Conta de luz da loja" />
                        </Form.Item>
                        <Form.Item label="Valor mensal" required>
                            <Input
                                prefix="R$"
                                placeholder="0,00"
                                value={expenseAmount}
                                onChange={(e) => setExpenseAmount(currencyMaskFn(e.target.value))}
                            />
                        </Form.Item>
                        <Form.Item name="recurrence" label="Recorrência" initialValue="MONTHLY">
                            <Select
                                options={[
                                    { label: '1 única vez', value: 'ONCE' },
                                    { label: 'Semanal', value: 'WEEKLY' },
                                    { label: 'Quinzenal', value: 'BIWEEKLY' },
                                    { label: 'Mensal', value: 'MONTHLY' },
                                    { label: 'Trimestral', value: 'QUARTERLY' },
                                ]}
                            />
                        </Form.Item>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Form.Item name="start_month" label="Mês início">
                                <DatePicker picker="month" placeholder="Mês atual" format="MM/YYYY" style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="end_month" label="Mês fim">
                                <DatePicker picker="month" placeholder="Dezembro" format="MM/YYYY" style={{ width: '100%' }} />
                            </Form.Item>
                        </div>
                    </Form>
                )}
            </Drawer>

            {/* Drawer: Editar Lançamento */}
            <Drawer
                title="Editar Lançamento"
                width={420}
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                extra={<Space><Button onClick={() => setEditDrawerOpen(false)}>Cancelar</Button><Button type="primary" onClick={handleSaveEdit}>Salvar</Button></Space>}
            >
                {editingEntry && (
                    <Form form={editForm} layout="vertical">
                        <Form.Item name="type" label="Tipo">
                            <Select>
                                <Select.Option value="INCOME">Receita</Select.Option>
                                <Select.Option value="EXPENSE">Despesa</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="description" label="Descrição" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
                            {({ getFieldValue }) => getFieldValue('type') === 'EXPENSE' ? (
                                <Form.Item name="expense_group" label="Tipo de Despesa">
                                    <Select placeholder="Selecione o tipo" allowClear>
                                        <Select.OptGroup label="Mão de Obra">
                                            <Select.Option
                                                value="MAO_DE_OBRA_PRODUTIVA"
                                                title="Salários, INSS e encargos do setor que produz (entra no custo direto do produto/serviço)"
                                            >
                                                Mão de Obra Produtiva
                                            </Select.Option>
                                            <Select.Option
                                                value="MAO_DE_OBRA_ADMINISTRATIVA"
                                                title="Pró-labore, salários comerciais e administrativos (entra como % de despesa na precificação)"
                                            >
                                                Mão de Obra Administrativa
                                            </Select.Option>
                                            <Select.Option value="MAO_DE_OBRA">Mão de Obra (legado)</Select.Option>
                                        </Select.OptGroup>
                                        <Select.OptGroup label="Outros tipos">
                                            {EXPENSE_GROUP_OPTIONS.filter(o => o.value !== 'MAO_DE_OBRA').map(o => (
                                                <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                                            ))}
                                        </Select.OptGroup>
                                    </Select>
                                </Form.Item>
                            ) : null}
                        </Form.Item>
                        <Form.Item label="Valor" required>
                            <Input prefix="R$" value={editAmount} onChange={(e) => setEditAmount(currencyMaskFn(e.target.value))} />
                        </Form.Item>
                        <Form.Item name="due_date" label="Data" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                        <Form.Item name="payment_method" label="Pagamento">
                            <Select allowClear placeholder="Forma de pagamento">
                                {PAYMENT_METHODS.map(p => <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>)}
                            </Select>
                        </Form.Item>
                    </Form>
                )}
            </Drawer>

            {/* Export range modal */}
            <Modal
                title="Exportar Fluxo de Caixa"
                open={exportModalOpen}
                onCancel={() => setExportModalOpen(false)}
                onOk={handleExportMultiMonth}
                confirmLoading={exporting}
                okText="Exportar"
                cancelText="Cancelar"
                okButtonProps={{ style: { background: '#217346', borderColor: '#217346' } }}
            >
                <div style={{ marginBottom: 16 }}>
                    <p style={{ marginBottom: 12, color: '#94a3b8' }}>
                        Selecione o período que deseja exportar. Cada mês será uma aba no Excel.
                    </p>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, marginBottom: 4, color: '#94a3b8' }}>Mês inicial</div>
                            <DatePicker
                                picker="month"
                                value={exportRange[0]}
                                onChange={(v) => {
                                    if (v) {
                                        setExportRange(prev => [v, prev[1].isBefore(v) ? v : prev[1]])
                                    }
                                }}
                                style={{ width: '100%' }}
                                format="MMMM/YYYY"
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, marginBottom: 4, color: '#94a3b8' }}>Mês final</div>
                            <DatePicker
                                picker="month"
                                value={exportRange[1]}
                                onChange={(v) => {
                                    if (v) {
                                        setExportRange(prev => [prev[0], v.isBefore(prev[0]) ? prev[0] : v])
                                    }
                                }}
                                style={{ width: '100%' }}
                                format="MMMM/YYYY"
                            />
                        </div>
                    </div>
                    {exportRange[0] && exportRange[1] && (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(33, 115, 70, 0.1)', borderRadius: 6, fontSize: 13 }}>
                            {(() => {
                                const diff = exportRange[1].diff(exportRange[0], 'month') + 1
                                return `${diff} ${diff === 1 ? 'mês selecionado (1 aba)' : `meses selecionados (${diff} abas)`}`
                            })()}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Export format modal — Cash Flow */}
            <ExportFormatModal
                open={exportFormatModalOpen}
                onClose={() => setExportFormatModalOpen(false)}
                title="Exportar Controle Financeiro"
                skipDateRange
                onExportExcel={() => {
                    setExportRange([month.startOf('month'), month.startOf('month')])
                    setExportModalOpen(true)
                }}
                onExportPdf={handleExportCashFlowPdf}
            />

        </Layout>
    )
}
