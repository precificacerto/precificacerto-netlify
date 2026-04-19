import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Select, Table, Tag, DatePicker, Space, message, Tabs,
    Popconfirm, Form, Input, InputNumber, Drawer, Alert, Radio, Modal,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import {
    DollarOutlined, ArrowUpOutlined, ArrowDownOutlined,
    PlusOutlined, DeleteOutlined, SyncOutlined, EditOutlined,
    CalendarOutlined, BankOutlined, PieChartOutlined, TeamOutlined,
    CreditCardOutlined, BarChartOutlined,
} from '@ant-design/icons'
import { HubTab } from '@/components/hub/hub-tab.component'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import {
    getExpenseGroupLabel,
    getExpenseGroupColor,
    EXPENSE_GROUP_OPTIONS,
    type ExpenseGroupKey,
} from '@/constants/cashier-category'

import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement,
    Title, Tooltip as ChartTooltip, Legend, ArcElement
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { formatBRL } from '@/utils/formatters'
import {
    getExpenseCategoryOptionsForRegime,
    getGroupForCategoryByRegime,
} from '@/constants/expense-categories-by-regime'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, ChartTooltip, Legend)

const formatCurrency = formatBRL

const INSTALLMENT_PRESETS = [
    { value: 'customizado', label: 'Cheque pré-datado' },
    { value: '30', label: '30' },
    { value: '30_60', label: '30/60' },
    { value: '30_60_90', label: '30/60/90' },
    { value: '30_60_90_120', label: '30/60/90/120' },
    { value: '30_60_90_120_150', label: '30/60/90/120/150' },
]

function buildInstallmentsByPreset(preset: string): { date: any; amount: number }[] {
    const today = dayjs()
    if (preset === '30') return [{ date: today.add(30, 'day'), amount: 0 }]
    if (preset === '30_60') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }]
    if (preset === '30_60_90') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }]
    if (preset === '30_60_90_120') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }, { date: today.add(120, 'day'), amount: 0 }]
    if (preset === '30_60_90_120_150') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }, { date: today.add(120, 'day'), amount: 0 }, { date: today.add(150, 'day'), amount: 0 }]
    return [{ date: null, amount: 0 }]
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
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: '🗓️ Cheque Pré-datado' },
]

function getOriginLabel(origin: string) {
    if (origin === 'SALE') return 'Venda'
    if (origin === 'SALARY') return 'Salário'
    if (origin === 'FIXED_EXPENSE') return 'Despesa Recorrente'
    return 'Manual'
}

const CHART_COLORS = [
    '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
    '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#06B6D4',
    '#84CC16', '#E11D48',
]

export default function ControleFinanceiro() {
    const [data, setData] = useState<any[]>([])
    const { currentUser } = useAuth()
    const { canView, canEdit } = usePermissions()
    const [employees, setEmployees] = useState<any[]>([])
    const [fixedExpenses, setFixedExpenses] = useState<any[]>([])
    const [taxRegime, setTaxRegime] = useState<string | null>(null)
    const [tenantId, setTenantId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [month, setMonth] = useState(dayjs())
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL')

    // Item 12: overdue alerts state
    const [overdueExpenses, setOverdueExpenses] = useState<{ count: number; total: number } | null>(null)
    const [overdueIncome, setOverdueIncome] = useState<{ count: number; total: number } | null>(null)

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerType, setDrawerType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
    const [expenseAmount, setExpenseAmount] = useState('')
    const [expPaymentMethod, setExpPaymentMethod] = useState<string>('')
    const [expInstallments, setExpInstallments] = useState<{ date: any; amount: number }[]>([{ date: null, amount: 0 }])
    const [expInstallmentPreset, setExpInstallmentPreset] = useState<'customizado' | '30' | '30_60' | '30_60_90' | '30_60_90_120' | '30_60_90_120_150'>('customizado')
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [editingEntry, setEditingEntry] = useState<any>(null)
    const [editAmount, setEditAmount] = useState('')

    // Despesas Recorrentes: nova despesa recorrente modal state
    const [newRecurringOpen, setNewRecurringOpen] = useState(false)
    const [newRecurringForm] = Form.useForm()
    const [newRecurringCategory, setNewRecurringCategory] = useState<string>('')
    const [newRecurringGroup, setNewRecurringGroup] = useState<string>('')
    const [savingNewRecurring, setSavingNewRecurring] = useState(false)

    // Despesas Recorrentes: edit/delete modal state
    const [editRecurringOpen, setEditRecurringOpen] = useState(false)
    const [editRecurringEntry, setEditRecurringEntry] = useState<any>(null)
    const [editRecurringScope, setEditRecurringScope] = useState<'CURRENT' | 'FUTURE' | 'SPECIFIC'>('CURRENT')
    const [editRecurringMonth, setEditRecurringMonth] = useState<dayjs.Dayjs | null>(null)
    const [editRecurringAmount, setEditRecurringAmount] = useState('')
    const [editRecurringDate, setEditRecurringDate] = useState<dayjs.Dayjs | null>(null)
    const [savingRecurring, setSavingRecurring] = useState(false)
    const [deleteRecurringOpen, setDeleteRecurringOpen] = useState(false)
    const [deleteRecurringEntry, setDeleteRecurringEntry] = useState<any>(null)
    const [deleteRecurringMonth, setDeleteRecurringMonth] = useState<dayjs.Dayjs | null>(null)
    const [deleteRecurringScope, setDeleteRecurringScope] = useState<'MONTH' | 'ALL'>('MONTH')

    const [form] = Form.useForm()
    const [editForm] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()

    const startOfMonth = month.startOf('month').format('YYYY-MM-DD')
    const endOfMonth = month.endOf('month').format('YYYY-MM-DD')

    // Item 14: Brazil timezone date helper
    const getTodayBR = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

    const fetchData = async () => {
        setLoading(true)
        try {
            const sbf = supabase as any
            const tenantId = await getTenantId()
            const [{ data: entries }, { data: emps }, { data: fixedList }, { data: tenantSettings }] = await Promise.all([
                tenantId
                    ? sbf.from('cash_entries')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .gte('due_date', startOfMonth)
                        .lte('due_date', endOfMonth)
                        .eq('is_active', true)
                        .order('due_date', { ascending: false })
                    : Promise.resolve({ data: [] }),
                tenantId
                    ? sbf.from('employees').select('id, name, salary').eq('tenant_id', tenantId).eq('status', 'ACTIVE').eq('is_active', true)
                    : Promise.resolve({ data: [] }),
                tenantId
                    ? sbf.from('fixed_expenses').select('id, description, amount, due_day, expense_category, expense_group').eq('tenant_id', tenantId).eq('is_active', true)
                    : Promise.resolve({ data: [] }),
                tenantId
                    ? sbf.from('tenant_settings').select('tax_regime').eq('tenant_id', tenantId).maybeSingle()
                    : Promise.resolve({ data: null }),
            ])
            setData(entries || [])
            setEmployees(emps || [])
            setFixedExpenses(fixedList || [])
            if (tenantSettings?.tax_regime) setTaxRegime(tenantSettings.tax_regime)
        } catch {
            messageApi.error('Erro ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }

    // Item 12: fetch overdue alerts on mount
    useEffect(() => {
        const fetchOverdue = async () => {
            try {
                const sbf = supabase as any
                const tenantId = await getTenantId()
                if (!tenantId) return
                const todayBR = getTodayBR()
                const todayStr = `${todayBR.getFullYear()}-${String(todayBR.getMonth() + 1).padStart(2, '0')}-${String(todayBR.getDate()).padStart(2, '0')}`

                const [{ data: expRows }, { data: incRows }] = await Promise.all([
                    sbf.from('cash_entries')
                        .select('amount')
                        .eq('type', 'EXPENSE')
                        .is('paid_date', null)
                        .lt('due_date', todayStr)
                        .eq('tenant_id', tenantId)
                        .eq('is_active', true),
                    sbf.from('cash_entries')
                        .select('amount')
                        .eq('type', 'INCOME')
                        .is('paid_date', null)
                        .lt('due_date', todayStr)
                        .eq('tenant_id', tenantId)
                        .eq('is_active', true),
                ])

                if (expRows && expRows.length > 0) {
                    setOverdueExpenses({ count: expRows.length, total: expRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0) })
                } else {
                    setOverdueExpenses(null)
                }
                if (incRows && incRows.length > 0) {
                    setOverdueIncome({ count: incRows.length, total: incRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0) })
                } else {
                    setOverdueIncome(null)
                }
            } catch {
                // silently ignore overdue fetch errors
            }
        }
        fetchOverdue()
    }, [])

    useEffect(() => { fetchData() }, [month])

    // Resolve tenantId once on mount for sub-components (e.g. HubTab)
    useEffect(() => {
        getTenantId().then((id) => { if (id) setTenantId(id) })
    }, [])

    const filteredData = useMemo(() => {
        if (typeFilter === 'ALL') return data
        return data.filter(d => d.type === typeFilter)
    }, [data, typeFilter])

    const totalIncome = useMemo(() => data.filter(d => d.type === 'INCOME').reduce((s, d) => s + getEffectiveIncomeAmount(d), 0), [data])
    const totalExpense = useMemo(() => data.filter(d => d.type === 'EXPENSE').reduce((s, d) => s + Number(d.amount || 0), 0), [data])
    const balance = totalIncome - totalExpense
    const totalFixed = useMemo(() => data.filter(d => d.origin_type === 'FIXED_EXPENSE' || d.origin_type === 'SALARY').reduce((s, d) => s + Number(d.amount || 0), 0), [data])

    // ── Regime: categorias regime-aware (todos os regimes suportados) ──
    const effectiveRegime = taxRegime ?? currentUser?.taxableRegime ?? null
    const activeCategoryOptions = getExpenseCategoryOptionsForRegime(effectiveRegime)
    const activeGroupForCategory = (cat: string) => getGroupForCategoryByRegime(effectiveRegime, cat)

    // ── Chart data ──
    const monthlyChartData = useMemo(() => {
        const income = data.filter(d => d.type === 'INCOME').reduce((s, d) => s + getEffectiveIncomeAmount(d), 0)
        const expense = data.filter(d => d.type === 'EXPENSE').reduce((s, d) => s + Number(d.amount || 0), 0)
        return { income, expense }
    }, [data])

    const expenseByCatChart = useMemo(() => {
        const cats: Record<string, number> = {}
        for (const entry of data.filter(d => d.type === 'EXPENSE')) {
            const desc = entry.description || 'Outros'
            const base = desc.split(' — ')[0].trim()
            cats[base] = (cats[base] || 0) + Number(entry.amount || 0)
        }
        return cats
    }, [data])

    // ── Antecipação de Cartão: entradas CARTAO_CREDITO sem paid_date ──
    const cartaoPendente = useMemo(
        () => data.filter(d => d.type === 'INCOME' && d.payment_method === 'CARTAO_CREDITO' && !d.paid_date),
        [data],
    )

    if (!canView(MODULES.CASH_FLOW)) {
        return <Layout title={PAGE_TITLES.FINANCIAL_CONTROL}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    // ── Despesas Recorrentes: Edit/Delete handlers ──
    const handleOpenEditRecurring = (entry: any) => {
        setEditRecurringEntry(entry)
        setEditRecurringScope('CURRENT')
        setEditRecurringMonth(null)
        setEditRecurringAmount(Number(entry.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
        setEditRecurringDate(null)
        setEditRecurringOpen(true)
    }

    const handleSaveRecurringEdit = async () => {
        if (!editRecurringEntry) return
        setSavingRecurring(true)
        try {
            const tenant_id = await getTenantId()
            if (!tenant_id) return
            const sbf = supabase as any

            // Build payload — only include fields that actually exist in cash_entries
            const updatePayload: any = {}
            if (editRecurringAmount) {
                const amt = parseCurrencyFn(editRecurringAmount)
                if (amt > 0) updatePayload.amount = amt
            }

            if (editRecurringScope === 'CURRENT') {
                if (editRecurringDate) updatePayload.due_date = editRecurringDate.format('YYYY-MM-DD')
                if (Object.keys(updatePayload).length === 0) { messageApi.warning('Nenhuma alteração informada.'); return }
                const { error } = await sbf.from('cash_entries').update(updatePayload).eq('id', editRecurringEntry.id).eq('tenant_id', tenant_id)
                if (error) throw error
            } else if (editRecurringScope === 'FUTURE') {
                const entryMonthEnd = dayjs(editRecurringEntry.due_date + 'T00:00:00').endOf('month').format('YYYY-MM-DD')
                const { data: futureEntries, error: fetchErr } = await sbf.from('cash_entries')
                    .select('id, due_date')
                    .eq('description', editRecurringEntry.description)
                    .eq('origin_type', editRecurringEntry.origin_type)
                    .eq('tenant_id', tenant_id)
                    .eq('is_active', true)
                    .gt('due_date', entryMonthEnd)
                if (fetchErr) throw fetchErr
                if (!futureEntries?.length) { messageApi.info('Nenhum lançamento futuro encontrado.'); return }
                for (const fe of futureEntries) {
                    const entryUpdate: any = { ...updatePayload }
                    if (editRecurringDate) {
                        const newDay = editRecurringDate.date()
                        const d = dayjs(fe.due_date + 'T00:00:00')
                        const lastDay = d.endOf('month').date()
                        entryUpdate.due_date = d.date(Math.min(newDay, lastDay)).format('YYYY-MM-DD')
                    }
                    if (Object.keys(entryUpdate).length === 0) continue
                    const { error } = await sbf.from('cash_entries').update(entryUpdate).eq('id', fe.id).eq('tenant_id', tenant_id)
                    if (error) throw error
                }
            } else if (editRecurringScope === 'SPECIFIC' && editRecurringMonth) {
                const monthStart = editRecurringMonth.startOf('month').format('YYYY-MM-DD')
                const monthEnd = editRecurringMonth.endOf('month').format('YYYY-MM-DD')
                const { data: specificEntries, error: fetchErr } = await sbf.from('cash_entries')
                    .select('id, due_date')
                    .eq('description', editRecurringEntry.description)
                    .eq('origin_type', editRecurringEntry.origin_type)
                    .eq('tenant_id', tenant_id)
                    .eq('is_active', true)
                    .gte('due_date', monthStart)
                    .lte('due_date', monthEnd)
                if (fetchErr) throw fetchErr
                if (!specificEntries?.length) { messageApi.info('Nenhum lançamento encontrado no mês selecionado.'); return }
                for (const se of specificEntries) {
                    const entryUpdate: any = { ...updatePayload }
                    if (editRecurringDate) entryUpdate.due_date = editRecurringDate.format('YYYY-MM-DD')
                    if (Object.keys(entryUpdate).length === 0) continue
                    const { error } = await sbf.from('cash_entries').update(entryUpdate).eq('id', se.id).eq('tenant_id', tenant_id)
                    if (error) throw error
                }
            }

            messageApi.success('Despesa recorrente atualizada!')
            setEditRecurringOpen(false)
            mergeExpenseConfig(tenant_id).catch(() => {})
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao salvar alterações: ' + (err?.message || 'Erro desconhecido'))
        } finally {
            setSavingRecurring(false)
        }
    }

    const handleDeleteRecurring = async () => {
        if (!deleteRecurringEntry) return
        if (deleteRecurringScope === 'MONTH' && !deleteRecurringMonth) {
            messageApi.warning('Selecione o mês para excluir.')
            return
        }
        try {
            const tenant_id = await getTenantId()
            if (!tenant_id) return
            const sbf = supabase as any

            let query = sbf.from('cash_entries')
                .select('id')
                .eq('description', deleteRecurringEntry.description)
                .eq('origin_type', deleteRecurringEntry.origin_type)
                .eq('tenant_id', tenant_id)
                .eq('is_active', true)

            if (deleteRecurringScope === 'MONTH' && deleteRecurringMonth) {
                const monthStart = deleteRecurringMonth.startOf('month').format('YYYY-MM-DD')
                const monthEnd = deleteRecurringMonth.endOf('month').format('YYYY-MM-DD')
                query = query.gte('due_date', monthStart).lte('due_date', monthEnd)
            }

            const { data: toDelete } = await query
            for (const entry of (toDelete || [])) {
                await fetch('/api/delete/cash-entries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: entry.id }),
                })
            }

            if (deleteRecurringScope === 'ALL' && deleteRecurringEntry.origin_type === 'RECURRING_EXPENSE') {
                const category = deleteRecurringEntry.expense_category
                    || (deleteRecurringEntry.description || '').split(' — ')[0]
                if (category) {
                    await sbf.from('recurring_expense_rules')
                        .update({ is_active: false })
                        .eq('tenant_id', tenant_id)
                        .eq('category', category)
                        .eq('amount', deleteRecurringEntry.amount)
                }
            }

            messageApi.success(
                deleteRecurringScope === 'ALL'
                    ? 'Todos os lançamentos recorrentes desta despesa foram excluídos!'
                    : 'Lançamento excluído do mês selecionado!'
            )
            setDeleteRecurringOpen(false)
            setDeleteRecurringMonth(null)
            setDeleteRecurringScope('MONTH')
            await fetchData()
        } catch {
            messageApi.error('Erro ao excluir lançamento.')
        }
    }

    // ── Salvar Nova Despesa Recorrente ──
    const handleSaveNewRecurring = async () => {
        try {
            const values = await newRecurringForm.validateFields()
            setSavingNewRecurring(true)
            const tenant_id = await getTenantId()
            if (!tenant_id) return
            const sbf = supabase as any

            const group = activeGroupForCategory(values.category) || 'DESPESA_FIXA'
            const due_day = values.due_day

            // Insert into recurring_expense_rules
            const { error: ruleErr } = await sbf.from('recurring_expense_rules').insert({
                tenant_id,
                category: values.category,
                expense_group: group,
                amount: values.amount,
                due_day,
                description: values.description || null,
                is_active: true,
            })
            if (ruleErr) throw ruleErr

            // Generate cash_entries for the next 12 months (starting from current month)
            const today = dayjs()
            const entries: any[] = []
            for (let i = 0; i < 12; i++) {
                const targetMonth = today.add(i, 'month')
                const year = targetMonth.year()
                const month = targetMonth.month() + 1
                const lastDayOfMonth = targetMonth.endOf('month').date()
                const day = Math.min(due_day, lastDayOfMonth)
                const due_date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const desc = values.description
                    ? `${values.category} — ${values.description}`
                    : values.category
                entries.push({
                    tenant_id,
                    type: 'EXPENSE',
                    origin_type: 'RECURRING_EXPENSE',
                    recurrence_type: 'MONTHLY',
                    expense_group: group,
                    expense_category: values.category,
                    description: desc,
                    amount: values.amount,
                    due_date,
                    paid_date: null,
                    is_active: true,
                })
            }

            const { error: entriesErr } = await sbf.from('cash_entries').insert(entries)
            if (entriesErr) throw entriesErr

            messageApi.success(`Despesa recorrente criada! ${entries.length} lançamentos gerados para os próximos 12 meses.`)
            setNewRecurringOpen(false)
            newRecurringForm.resetFields()
            setNewRecurringCategory('')
            setNewRecurringGroup('')
            mergeExpenseConfig(tenant_id).catch(() => {})
            await fetchData()
        } catch (err: any) {
            if (err?.errorFields) {
                messageApi.warning('Preencha todos os campos obrigatórios.')
            } else {
                messageApi.error('Erro ao criar despesa recorrente: ' + (err?.message || 'Erro desconhecido'))
            }
        } finally {
            setSavingNewRecurring(false)
        }
    }

    // ── Salvar Novo Lançamento ──
    const handleSaveEntry = async () => {
        try {
            const values = await form.validateFields()
            const tenant_id = await getTenantId()
            if (!tenant_id) return

            if (drawerType === 'INCOME') {
                const isBoleto = values.payment_method === 'BOLETO'
                const { error: incomeError } = await supabase.from('cash_entries').insert({
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
                    origin_type: 'MANUAL',
                    is_active: true,
                } as any)
                if (incomeError) throw incomeError
                messageApi.success('Lançamento salvo!')
            } else {
                // Item 13: reworked expense logic with parcelas
                const amountNum = parseCurrencyFn(expenseAmount)
                if (amountNum <= 0) { messageApi.warning('Informe o valor da despesa.'); return }
                if (!values.expense_category) { messageApi.warning('Selecione a categoria.'); return }

                const desc = values.expense_description
                    ? `${values.expense_category} — ${values.expense_description}`
                    : values.expense_category

                const autoGroup = activeGroupForCategory(values.expense_category) || 'DESPESA_FIXA'
                const paymentMethod: string = expPaymentMethod || ''
                const isBoletoOrCheque = paymentMethod === 'BOLETO' || paymentMethod === 'CHEQUE_PRE_DATADO'
                const entries: any[] = []

                if (isBoletoOrCheque) {
                    const validInst = expInstallments.filter(r => r.date && r.amount > 0)
                    if (validInst.length === 0) { messageApi.error('Informe ao menos uma data e valor de vencimento.'); return }
                    validInst.forEach((inst, idx) => {
                        entries.push({
                            tenant_id,
                            type: 'EXPENSE',
                            origin_type: 'MANUAL',
                            recurrence_type: 'ONCE',
                            description: validInst.length > 1 ? `${desc} (${idx + 1}/${validInst.length})` : desc,
                            amount: inst.amount,
                            due_date: inst.date.format('YYYY-MM-DD'),
                            expense_group: autoGroup,
                            expense_category: values.expense_category,
                            payment_method: paymentMethod,
                            is_active: true,
                        })
                    })
                } else {
                const parcelas: number = Math.max(1, values.parcelas || 1)
                const valorParcela = parcelas === 1 ? amountNum : amountNum / parcelas

                // Item 14: use Brazil timezone for "today" default
                const todayBR = getTodayBR()
                let startDate: Date
                if (values.data_inicio) {
                    startDate = values.data_inicio.toDate()
                } else {
                    startDate = new Date(todayBR.getFullYear(), todayBR.getMonth(), 1)
                }

                for (let i = 0; i < parcelas; i++) {
                    const dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate())
                    const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`
                    entries.push({
                        tenant_id,
                        type: 'EXPENSE',
                        origin_type: 'MANUAL',
                        recurrence_type: parcelas === 1 ? 'ONCE' : 'MONTHLY',
                        description: parcelas > 1 ? `${desc} (${i + 1}/${parcelas})` : desc,
                        amount: valorParcela,
                        due_date: dueDateStr,
                        expense_group: autoGroup,
                        expense_category: values.expense_category,
                        is_active: true,
                        ...(paymentMethod ? { payment_method: paymentMethod } : {}),
                    })
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
            setExpPaymentMethod('')
            setExpInstallments([{ date: null, amount: 0 }])
            setExpInstallmentPreset('customizado')
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
            messageApi.success('Lançamento desativado!')
            await fetchData()
        } catch (error: any) {
            messageApi.error(error.message || 'Erro ao desativar lançamento')
        }
    }

    const handleOpenEdit = (record: any) => {
        setEditingEntry(record)
        setEditAmount(Number(record.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
        editForm.setFieldsValue({
            description: record.description,
            due_date: dayjs(record.due_date + 'T00:00:00'),
            paid_date: record.paid_date ? dayjs(record.paid_date + 'T00:00:00') : undefined,
        })
        setEditDrawerOpen(true)
    }

    const handleSaveEdit = async () => {
        try {
            const values = editForm.getFieldsValue()
            const amount = parseCurrencyFn(editAmount)
            if (amount <= 0) { messageApi.warning('Informe um valor válido.'); return }
            const { error } = await supabase.from('cash_entries').update({
                description: values.description,
                amount,
                due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : editingEntry?.due_date,
                paid_date: values.paid_date ? values.paid_date.format('YYYY-MM-DD') : null,
                updated_at: new Date().toISOString(),
            }).eq('id', editingEntry.id)
            if (error) throw error
            messageApi.success('Lançamento atualizado!')
            setEditDrawerOpen(false)
            await fetchData()
        } catch {
            messageApi.error('Erro ao salvar edição.')
        }
    }

    const handleGenerateRecurring = async () => {
        try {
            const tenant_id = await getTenantId()
            if (!tenant_id) { messageApi.warning('Sessão inválida.'); return }
            const y = month.year()
            const m = month.month()
            const lastDay = month.endOf('month').date()
            const existingKeys = new Set(data.map((e: any) => `${e.description ?? ''}|${e.origin_type ?? ''}|${Number(e.amount)}`))
            const toInsert: any[] = []

            const { data: fixedList } = await supabase.from('fixed_expenses').select('id, description, amount, due_day, expense_category, expense_group').eq('tenant_id', tenant_id).eq('is_active', true)
            if (fixedList?.length) {
                for (const fe of fixedList) {
                    const day = Math.min(Math.max(1, fe.due_day), lastDay)
                    const due_date = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const key = `${fe.description}|FIXED_EXPENSE|${Number(fe.amount)}`
                    if (existingKeys.has(key)) continue
                    existingKeys.add(key)
                    toInsert.push({ tenant_id, type: 'EXPENSE', origin_type: 'FIXED_EXPENSE', recurrence_type: 'MONTHLY', description: fe.description, amount: Number(fe.amount), due_date, expense_group: fe.expense_group || 'DESPESA_FIXA', expense_category: fe.expense_category || null, is_active: true })
                }
            }
            for (const emp of employees) {
                const salary = Number(emp.salary || 0)
                if (salary <= 0) continue
                const desc = `Salários — ${emp.name || 'Funcionário'}`
                const key = `${desc}|SALARY|${salary}`
                if (existingKeys.has(key)) continue
                existingKeys.add(key)
                toInsert.push({ tenant_id, type: 'EXPENSE', origin_type: 'SALARY', recurrence_type: 'MONTHLY', description: desc, amount: salary, due_date: `${y}-${String(m + 1).padStart(2, '0')}-01`, expense_group: 'MAO_DE_OBRA_PRODUTIVA', is_active: true })
            }
            if (toInsert.length === 0) { messageApi.info('Nenhum lançamento novo a gerar para este mês.'); return }
            const { error } = await supabase.from('cash_entries').insert(toInsert)
            if (error) throw error
            messageApi.success(`${toInsert.length} lançamento(s) gerado(s) para o mês.`)
            await fetchData()
        } catch {
            messageApi.error('Erro ao gerar contas do mês.')
        }
    }

    const columns: ColumnsType<any> = [
        {
            title: 'Data',
            dataIndex: 'due_date',
            key: 'due_date',
            width: 110,
            sorter: (a, b) => a.due_date.localeCompare(b.due_date),
            render: (v) => dayjs(v + 'T00:00:00').format('DD/MM/YYYY'),
        },
        {
            title: 'Descrição',
            dataIndex: 'description',
            key: 'description',
            render: (v, r) => (
                <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{v}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{getOriginLabel(r.origin_type)}</div>
                </div>
            ),
        },
        {
            title: 'Categoria',
            key: 'category',
            width: 180,
            render: (_, r) => {
                if (r.type === 'EXPENSE' && r.expense_group) {
                    return <Tag color={getExpenseGroupColor(r.expense_group as ExpenseGroupKey)} style={{ fontSize: 11 }}>{getExpenseGroupLabel(r.expense_group)}</Tag>
                }
                return <Tag color="green" style={{ fontSize: 11 }}>Receita</Tag>
            },
        },
        {
            title: 'Tipo',
            dataIndex: 'type',
            key: 'type',
            width: 90,
            filters: [
                { text: 'Receita', value: 'INCOME' },
                { text: 'Despesa', value: 'EXPENSE' },
            ],
            onFilter: (value, record) => record.type === value,
            render: (v) => <Tag color={v === 'INCOME' ? 'green' : 'red'}>{v === 'INCOME' ? 'Receita' : 'Despesa'}</Tag>,
        },
        {
            title: 'Valor',
            key: 'amount',
            align: 'right',
            width: 140,
            sorter: (a, b) => (a.type === 'INCOME' ? getEffectiveIncomeAmount(a) : Number(a.amount || 0)) - (b.type === 'INCOME' ? getEffectiveIncomeAmount(b) : Number(b.amount || 0)),
            render: (_, r) => {
                const v = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
                return (
                    <span style={{ color: r.type === 'INCOME' ? '#12B76A' : '#F04438', fontWeight: 700, fontSize: 14 }}>
                        {r.type === 'INCOME' ? '+' : '-'} {formatCurrency(v)}
                    </span>
                )
            },
        },
        ...(canEdit(MODULES.CASH_FLOW) ? [{
            title: 'Ações',
            key: 'actions',
            width: 100,
            render: (_: any, r: any) => (
                <Space>
                    <Button icon={<EditOutlined />} size="small" type="text" onClick={() => handleOpenEdit(r)} />
                    <Popconfirm title="Desativar este lançamento?" onConfirm={() => handleDeleteEntry(r.id)}>
                        <Button icon={<DeleteOutlined />} size="small" danger type="text" />
                    </Popconfirm>
                </Space>
            ),
        }] : []),
    ]

    return (
        <Layout title={PAGE_TITLES.FINANCIAL_CONTROL} subtitle="Gestão de lançamentos financeiros">
            {contextHolder}

            <div className="pc-card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <CalendarOutlined style={{ fontSize: 18, color: '#94a3b8' }} />
                    <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} allowClear={false} format="MMMM YYYY" />
                    <Button icon={<SyncOutlined />} onClick={() => fetchData()}>Atualizar</Button>
                    <Radio.Group value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} optionType="button" buttonStyle="solid" size="small">
                        <Radio.Button value="ALL">Todos</Radio.Button>
                        <Radio.Button value="INCOME">Receitas</Radio.Button>
                        <Radio.Button value="EXPENSE">Despesas</Radio.Button>
                    </Radio.Group>
                </Space>
                <Space>
                    {canEdit(MODULES.CASH_FLOW) && (
                        <Button icon={<SyncOutlined />} onClick={handleGenerateRecurring}>Gerar Contas do Mês (Fixas/Salários)</Button>
                    )}
                </Space>
            </div>

            <div className="kpi-grid">
                <CardKPI title="Receitas" value={formatCurrency(totalIncome)} icon={<ArrowUpOutlined />} variant="green" />
                <CardKPI title="Despesas" value={formatCurrency(totalExpense)} icon={<ArrowDownOutlined />} variant="red" />
                <CardKPI title="Saldo do Mês" value={formatCurrency(balance)} icon={<DollarOutlined />} variant={balance >= 0 ? 'green' : 'red'} />
                <CardKPI title="Despesas Fixas" value={formatCurrency(totalFixed)} icon={<BankOutlined />} variant="orange" />
            </div>

            {/* Item 12: Overdue alert banners */}
            {overdueExpenses && overdueExpenses.count > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message={`${overdueExpenses.count} despesa(s) vencida(s) sem pagamento`}
                    description={`Total em atraso: ${formatCurrency(overdueExpenses.total)}. Estas despesas têm data de vencimento passada e ainda não foram pagas.`}
                />
            )}
            {overdueIncome && overdueIncome.count > 0 && (
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message={`${overdueIncome.count} receita(s) vencida(s) não recebida(s)`}
                    description={`Total a receber em atraso: ${formatCurrency(overdueIncome.total)}. Estas receitas têm data de vencimento passada e ainda não foram recebidas.`}
                />
            )}

            <Tabs
                type="card"
                items={[
                    {
                        label: <span>Extrato</span>,
                        key: 'extrato',
                        children: (
                            <div className="pc-card--table">
                                <Table
                                    columns={columns}
                                    dataSource={filteredData}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={{ pageSize: 20, showTotal: (t) => `${t} lançamentos` }}
                                    size="middle"
                                />
                            </div>
                        ),
                    },
                    {
                        label: <span><PieChartOutlined style={{ marginRight: 4 }} />Análise Gráfica</span>,
                        key: 'graficos',
                        children: (
                            <div style={{ display: 'grid', gap: 24 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24 }}>
                                    <div className="pc-card" style={{ padding: 24 }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Receitas x Despesas</h4>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>{month.format('MMMM YYYY')}</p>
                                        <div style={{ height: 280 }}>
                                            {(monthlyChartData.income > 0 || monthlyChartData.expense > 0) ? (
                                                <Bar
                                                    data={{
                                                        labels: ['Receitas', 'Despesas'],
                                                        datasets: [{
                                                            label: month.format('MMMM YYYY'),
                                                            data: [monthlyChartData.income, monthlyChartData.expense],
                                                            backgroundColor: ['rgba(18, 183, 106, 0.8)', 'rgba(240, 68, 56, 0.8)'],
                                                            borderRadius: 6,
                                                        }],
                                                    }}
                                                    options={{
                                                        responsive: true,
                                                        maintainAspectRatio: false,
                                                        plugins: {
                                                            legend: { display: false },
                                                            tooltip: {
                                                                callbacks: {
                                                                    label: (ctx: any) => ` ${formatCurrency(ctx.raw)}`,
                                                                },
                                                            },
                                                        },
                                                        scales: {
                                                            x: { grid: { display: false } },
                                                            y: {
                                                                ticks: {
                                                                    callback: (v: any) => v >= 1000 ? `R$ ${(Number(v) / 1000).toFixed(0)}k` : `R$ ${v}`,
                                                                },
                                                            },
                                                        },
                                                    } as any}
                                                />
                                            ) : (
                                                <p style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Sem dados no período</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="pc-card" style={{ padding: 24 }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Despesas por Categoria</h4>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>Distribuição das despesas</p>
                                        <div style={{ height: 280 }}>
                                            {Object.keys(expenseByCatChart).length > 0 ? (
                                                <Doughnut
                                                    data={{
                                                        labels: Object.keys(expenseByCatChart),
                                                        datasets: [{
                                                            data: Object.values(expenseByCatChart),
                                                            backgroundColor: CHART_COLORS.slice(0, Object.keys(expenseByCatChart).length),
                                                            borderWidth: 2,
                                                            borderColor: '#fff',
                                                            hoverOffset: 8,
                                                        }],
                                                    }}
                                                    options={{
                                                        responsive: true,
                                                        maintainAspectRatio: false,
                                                        cutout: '55%',
                                                        plugins: {
                                                            legend: { position: 'right', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
                                                            tooltip: {
                                                                callbacks: {
                                                                    label: (ctx: any) => {
                                                                        const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0)
                                                                        const pct = total > 0 ? ((ctx.raw / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0,000'
                                                                        return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`
                                                                    },
                                                                },
                                                            },
                                                        },
                                                    } as any}
                                                />
                                            ) : (
                                                <p style={{ textAlign: 'center', padding: 80, color: '#98A2B3' }}>Sem despesas</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: <span><BankOutlined style={{ marginRight: 4 }} />Despesas Recorrentes</span>,
                        key: 'recorrentes',
                        children: (() => {
                            const recurringExpenses = data.filter((e: any) =>
                                e.type === 'EXPENSE' && (
                                    e.origin_type === 'FIXED_EXPENSE' ||
                                    e.origin_type === 'RECURRING_EXPENSE' ||
                                    e.origin_type === 'SALARY' ||
                                    e.recurrence_type === 'MONTHLY'
                                )
                            )
                            const sorted = [...recurringExpenses].sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''))
                            const today = dayjs()
                            return (
                                <div className="pc-card--table">
                                    {canEdit(MODULES.CASH_FLOW) && (
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                            <Button
                                                type="primary"
                                                icon={<PlusOutlined />}
                                                onClick={() => {
                                                    newRecurringForm.resetFields()
                                                    setNewRecurringCategory('')
                                                    setNewRecurringGroup('')
                                                    setNewRecurringOpen(true)
                                                }}
                                            >
                                                + Nova Despesa Recorrente
                                            </Button>
                                        </div>
                                    )}
                                    {sorted.length > 0 ? (
                                        <>
                                            <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
                                                Despesas recorrentes lançadas em{' '}
                                                <strong style={{ color: '#e2e8f0' }}>{month.format('MMMM/YYYY')}</strong>
                                                {' '}— fixas, recorrentes e salários.
                                            </div>
                                            <Table
                                                columns={[
                                                    {
                                                        title: 'Data de Vencimento',
                                                        dataIndex: 'due_date',
                                                        width: 150,
                                                        sorter: (a: any, b: any) => a.due_date.localeCompare(b.due_date),
                                                        defaultSortOrder: 'ascend' as const,
                                                        render: (v: string) => dayjs(v + 'T00:00:00').format('DD/MM/YYYY'),
                                                    },
                                                    {
                                                        title: 'Descrição',
                                                        dataIndex: 'description',
                                                        render: (t: string) => <span style={{ fontWeight: 500 }}>{t?.split(' — ')[0] || t}</span>,
                                                    },
                                                    {
                                                        title: 'Origem',
                                                        dataIndex: 'origin_type',
                                                        width: 130,
                                                        render: (v: string) => {
                                                            if (v === 'FIXED_EXPENSE') return <Tag color="orange">Recorrente</Tag>
                                                            if (v === 'RECURRING_EXPENSE') return <Tag color="purple">Recorrente</Tag>
                                                            if (v === 'SALARY') return <Tag color="blue">Salário</Tag>
                                                            return <Tag>Manual</Tag>
                                                        },
                                                    },
                                                    {
                                                        title: 'Valor',
                                                        dataIndex: 'amount',
                                                        align: 'right' as const,
                                                        width: 130,
                                                        render: (v: number) => <strong style={{ color: '#F04438' }}>{formatCurrency(Number(v))}</strong>,
                                                    },
                                                    ...(canEdit(MODULES.CASH_FLOW) ? [{
                                                        title: 'Ações',
                                                        key: 'acoes',
                                                        width: 110,
                                                        render: (_: any, r: any) => {
                                                            const isPast = dayjs(r.due_date + 'T00:00:00').isBefore(today.startOf('month'))
                                                            return (
                                                                <Space size={4}>
                                                                    <Button
                                                                        icon={<EditOutlined />}
                                                                        size="small"
                                                                        type="text"
                                                                        disabled={isPast}
                                                                        title={isPast ? 'Não é possível editar meses passados' : 'Editar lançamento'}
                                                                        onClick={() => handleOpenEditRecurring(r)}
                                                                    />
                                                                    <Button
                                                                        icon={<DeleteOutlined />}
                                                                        size="small"
                                                                        danger
                                                                        type="text"
                                                                        title="Excluir lançamento de um mês"
                                                                        onClick={() => { setDeleteRecurringEntry(r); setDeleteRecurringMonth(month); setDeleteRecurringScope('MONTH'); setDeleteRecurringOpen(true) }}
                                                                    />
                                                                </Space>
                                                            )
                                                        },
                                                    }] : []),
                                                ]}
                                                dataSource={sorted}
                                                rowKey="id"
                                                pagination={false}
                                                size="small"
                                                summary={() => (
                                                    <Table.Summary>
                                                        <Table.Summary.Row style={{ background: 'rgba(240, 68, 56, 0.08)' }}>
                                                            <Table.Summary.Cell index={0} colSpan={canEdit(MODULES.CASH_FLOW) ? 4 : 3}><strong>Total Recorrentes</strong></Table.Summary.Cell>
                                                            <Table.Summary.Cell index={canEdit(MODULES.CASH_FLOW) ? 4 : 3} align="right">
                                                                <strong style={{ color: '#F04438' }}>
                                                                    {formatCurrency(sorted.reduce((s: number, e: any) => s + Number(e.amount || 0), 0))}
                                                                </strong>
                                                            </Table.Summary.Cell>
                                                        </Table.Summary.Row>
                                                    </Table.Summary>
                                                )}
                                            />
                                        </>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 40, color: '#98A2B3' }}>
                                            <BankOutlined style={{ fontSize: 36, marginBottom: 8 }} />
                                            <p>Nenhuma despesa recorrente encontrada para {month.format('MMMM/YYYY')}.</p>
                                            <p style={{ fontSize: 12, color: '#64748b' }}>Use "Gerar Contas do Mês" para lançar despesas fixas e salários, ou clique em "+ Nova Despesa Recorrente" para criar uma nova.</p>
                                        </div>
                                    )}
                                </div>
                            )
                        })(),
                    },
                    {
                        label: <span><TeamOutlined style={{ marginRight: 4 }} />Salários</span>,
                        key: 'salarios',
                        children: (
                            <div className="pc-card--table">
                                <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
                                    Funcionários ativos com salário cadastrado
                                </div>
                                <Table
                                    columns={[
                                        { title: 'Nome', dataIndex: 'name', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
                                        { title: 'Salário Mensal', dataIndex: 'salary', align: 'right' as const, render: (v: number) => <strong>{formatCurrency(Number(v || 0))}</strong> },
                                        { title: 'Status', render: () => <Tag color="green">Ativo</Tag> },
                                    ]}
                                    dataSource={employees.filter(e => Number(e.salary || 0) > 0)}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    summary={() => {
                                        const empsWithSalary = employees.filter(e => Number(e.salary || 0) > 0)
                                        return empsWithSalary.length > 0 ? (
                                            <Table.Summary>
                                                <Table.Summary.Row style={{ background: '#0a1628' }}>
                                                    <Table.Summary.Cell index={0}><strong>Total Folha</strong></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={1} align="right">
                                                        <strong>{formatCurrency(empsWithSalary.reduce((s, e) => s + Number(e.salary || 0), 0))}</strong>
                                                    </Table.Summary.Cell>
                                                    <Table.Summary.Cell index={2} />
                                                </Table.Summary.Row>
                                            </Table.Summary>
                                        ) : null
                                    }}
                                    locale={{ emptyText: 'Nenhum funcionário com salário cadastrado.' }}
                                />
                            </div>
                        ),
                    },
                    {
                        label: <span><CreditCardOutlined style={{ marginRight: 4 }} />Antecipação de Cartão</span>,
                        key: 'antecipacao',
                        children: (
                            <div className="pc-card--table">
                                <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
                                    Entradas via Cartão de Crédito ainda não recebidas (paid_date vazio)
                                </div>
                                <Table
                                    columns={[
                                        {
                                            title: 'Data Vencimento',
                                            dataIndex: 'due_date',
                                            width: 140,
                                            render: (v: string) => dayjs(v + 'T00:00:00').format('DD/MM/YYYY'),
                                            sorter: (a: any, b: any) => a.due_date.localeCompare(b.due_date),
                                            defaultSortOrder: 'ascend' as const,
                                        },
                                        {
                                            title: 'Descrição',
                                            dataIndex: 'description',
                                            render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span>,
                                        },
                                        {
                                            title: 'Valor',
                                            dataIndex: 'amount',
                                            align: 'right' as const,
                                            render: (v: number) => <strong style={{ color: '#12B76A' }}>+ {formatCurrency(Number(v || 0))}</strong>,
                                            sorter: (a: any, b: any) => Number(a.amount) - Number(b.amount),
                                        },
                                    ]}
                                    dataSource={cartaoPendente}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={false}
                                    size="small"
                                    summary={() => cartaoPendente.length > 0 ? (
                                        <Table.Summary>
                                            <Table.Summary.Row style={{ background: 'rgba(34, 197, 94, 0.08)' }}>
                                                <Table.Summary.Cell index={0}><strong>Total a Receber</strong></Table.Summary.Cell>
                                                <Table.Summary.Cell index={1} />
                                                <Table.Summary.Cell index={2} align="right">
                                                    <strong style={{ color: '#12B76A' }}>
                                                        {formatCurrency(cartaoPendente.reduce((s, d) => s + Number(d.amount || 0), 0))}
                                                    </strong>
                                                </Table.Summary.Cell>
                                            </Table.Summary.Row>
                                        </Table.Summary>
                                    ) : null}
                                    locale={{ emptyText: 'Nenhuma parcela de cartão pendente de recebimento.' }}
                                />
                            </div>
                        ),
                    },
                    {
                        label: <span><BarChartOutlined style={{ marginRight: 4 }} />Hub</span>,
                        key: 'hub',
                        children: (
                            <div style={{ padding: '16px 0' }}>
                                {tenantId ? (
                                    <HubTab tenantId={tenantId} />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                                        Carregando...
                                    </div>
                                )}
                            </div>
                        ),
                    },
                ]}
            />

            {/* Modal: Nova Despesa Recorrente */}
            <Modal
                title="Nova Despesa Recorrente"
                open={newRecurringOpen}
                onCancel={() => { setNewRecurringOpen(false); newRecurringForm.resetFields(); setNewRecurringCategory(''); setNewRecurringGroup('') }}
                footer={null}
                width={520}
            >
                <Form form={newRecurringForm} layout="vertical">
                    <Form.Item
                        name="category"
                        label="Tipo de Despesa"
                        rules={[{ required: true, message: 'Selecione o tipo de despesa' }]}
                    >
                        <Select
                            placeholder="Selecione a categoria"
                            options={activeCategoryOptions}
                            showSearch
                            listHeight={320}
                            filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                            onChange={(val: string) => {
                                setNewRecurringCategory(val)
                                const grp = activeGroupForCategory(val) || ''
                                setNewRecurringGroup(grp)
                            }}
                        />
                    </Form.Item>
                    <Form.Item label="Grupo">
                        <Input
                            value={newRecurringGroup ? (
                                EXPENSE_GROUP_OPTIONS.find(g => g.value === newRecurringGroup)?.label || newRecurringGroup
                            ) : ''}
                            readOnly
                            placeholder="Preenchido automaticamente"
                            style={{ background: 'rgba(255,255,255,0.04)', cursor: 'not-allowed', color: '#94a3b8' }}
                        />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Descrição (opcional)"
                    >
                        <Input placeholder="Ex: Conta de luz da loja" />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item
                            name="amount"
                            label="Valor (R$)"
                            rules={[{ required: true, message: 'Informe o valor' }, { type: 'number', min: 0.01, message: 'Valor deve ser maior que zero' }]}
                        >
                            <InputNumber
                                style={{ width: '100%' }}
                                prefix="R$"
                                step={0.01}
                                min={0.01}
                                precision={2}
                                placeholder="0,00"
                                decimalSeparator=","
                                thousandSeparator="."
                            />
                        </Form.Item>
                        <Form.Item
                            name="due_day"
                            label="Dia do vencimento"
                            rules={[{ required: true, message: 'Informe o dia' }, { type: 'number', min: 1, max: 31, message: 'Entre 1 e 31' }]}
                        >
                            <InputNumber
                                style={{ width: '100%' }}
                                min={1}
                                max={31}
                                precision={0}
                                placeholder="Ex: 5"
                            />
                        </Form.Item>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16, marginTop: -8 }}>
                        Serão gerados lançamentos para os próximos 12 meses com <strong>paid_date = null</strong> (pendente de pagamento). Os lançamentos entram no caixa somente quando marcados como pagos.
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <Button onClick={() => { setNewRecurringOpen(false); newRecurringForm.resetFields(); setNewRecurringCategory(''); setNewRecurringGroup('') }}>
                            Cancelar
                        </Button>
                        <Button type="primary" loading={savingNewRecurring} onClick={handleSaveNewRecurring}>
                            Salvar
                        </Button>
                    </div>
                </Form>
            </Modal>

            {/* Modal: Editar Despesa Recorrente */}
            <Modal
                title="Editar Despesa Recorrente"
                open={editRecurringOpen}
                onCancel={() => setEditRecurringOpen(false)}
                footer={null}
                width={700}
            >
                {editRecurringEntry && (
                    <div>
                        <div style={{ marginBottom: 16, padding: 10, background: 'rgba(240,68,56,0.06)', border: '1px solid rgba(240,68,56,0.15)', borderRadius: 8 }}>
                            <div style={{ fontWeight: 600 }}>{editRecurringEntry.description?.split(' — ')[0] || editRecurringEntry.description}</div>
                            <div style={{ color: '#F04438', fontWeight: 700, marginTop: 2 }}>{formatCurrency(Number(editRecurringEntry.amount))}</div>
                            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>Vencimento atual: {dayjs(editRecurringEntry.due_date + 'T00:00:00').format('DD/MM/YYYY')}</div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 500, marginBottom: 8 }}>Aplicar a</div>
                            <Radio.Group
                                value={editRecurringScope}
                                onChange={(e) => { setEditRecurringScope(e.target.value); setEditRecurringMonth(null) }}
                                optionType="button"
                                buttonStyle="solid"
                                size="small"
                            >
                                <Radio.Button value="CURRENT">Mês atual</Radio.Button>
                                <Radio.Button value="FUTURE">Próximos meses</Radio.Button>
                                <Radio.Button value="SPECIFIC">Mês específico</Radio.Button>
                            </Radio.Group>
                            {editRecurringScope === 'FUTURE' && (
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                                    Altera todos os lançamentos futuros desta despesa recorrente.
                                </div>
                            )}
                            {editRecurringScope === 'SPECIFIC' && (
                                <div style={{ marginTop: 8 }}>
                                    <DatePicker
                                        picker="month"
                                        value={editRecurringMonth}
                                        onChange={setEditRecurringMonth}
                                        format="MMMM/YYYY"
                                        style={{ width: '100%' }}
                                        placeholder="Selecione o mês"
                                        disabledDate={(d) => d.isBefore(dayjs().startOf('month'))}
                                    />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                            <div>
                                <div style={{ fontWeight: 500, marginBottom: 6 }}>Novo Valor (opcional)</div>
                                <Input
                                    prefix="R$"
                                    placeholder="0,00"
                                    value={editRecurringAmount}
                                    onChange={(e) => setEditRecurringAmount(currencyMaskFn(e.target.value))}
                                />
                            </div>
                            <div>
                                <div style={{ fontWeight: 500, marginBottom: 6 }}>Nova Data de Vencimento (opcional)</div>
                                <DatePicker
                                    value={editRecurringDate}
                                    onChange={setEditRecurringDate}
                                    format="DD/MM/YYYY"
                                    style={{ width: '100%' }}
                                    placeholder="DD/MM/AAAA"
                                    disabledDate={editRecurringScope !== 'SPECIFIC'
                                        ? (d) => d.isBefore(dayjs().startOf('month'))
                                        : undefined
                                    }
                                />
                                {editRecurringScope === 'FUTURE' && (
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                        O dia do mês será aplicado a todos os meses futuros.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <Button onClick={() => setEditRecurringOpen(false)}>Cancelar</Button>
                            <Button type="primary" loading={savingRecurring} onClick={handleSaveRecurringEdit}>
                                Salvar Alterações
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal: Excluir Despesa Recorrente */}
            <Modal
                title="Excluir Lançamento de Despesa Recorrente"
                open={deleteRecurringOpen}
                onCancel={() => { setDeleteRecurringOpen(false); setDeleteRecurringMonth(null); setDeleteRecurringScope('MONTH') }}
                footer={null}
                width={460}
            >
                {deleteRecurringEntry && (
                    <div>
                        <div style={{ marginBottom: 16, padding: 10, background: 'rgba(240,68,56,0.06)', border: '1px solid rgba(240,68,56,0.15)', borderRadius: 8 }}>
                            <div style={{ fontWeight: 600 }}>{deleteRecurringEntry.description?.split(' — ')[0] || deleteRecurringEntry.description}</div>
                            <div style={{ color: '#F04438', fontWeight: 700, marginTop: 2 }}>{formatCurrency(Number(deleteRecurringEntry.amount))}</div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 500, marginBottom: 8 }}>O que deseja excluir?</div>
                            <Radio.Group
                                value={deleteRecurringScope}
                                onChange={(e) => setDeleteRecurringScope(e.target.value)}
                                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                            >
                                <Radio value="MONTH">Apenas o lançamento de um mês específico</Radio>
                                <Radio value="ALL">Todos os lançamentos recorrentes desta despesa</Radio>
                            </Radio.Group>
                        </div>
                        {deleteRecurringScope === 'MONTH' ? (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontWeight: 500, marginBottom: 6 }}>Mês a excluir</div>
                                <DatePicker
                                    picker="month"
                                    value={deleteRecurringMonth}
                                    onChange={setDeleteRecurringMonth}
                                    format="MMMM/YYYY"
                                    style={{ width: '100%' }}
                                    placeholder="Selecione o mês"
                                />
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                                    Apenas o lançamento do mês selecionado será excluído. Os demais meses não serão afetados.
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginBottom: 20, padding: 10, background: 'rgba(240,68,56,0.06)', border: '1px solid rgba(240,68,56,0.15)', borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: '#F04438', fontWeight: 600, marginBottom: 4 }}>
                                    ⚠️ Ação irreversível
                                </div>
                                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                    Todos os lançamentos recorrentes desta despesa (meses passados e futuros) serão excluídos e a regra recorrente será desativada.
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <Button onClick={() => { setDeleteRecurringOpen(false); setDeleteRecurringMonth(null); setDeleteRecurringScope('MONTH') }}>Cancelar</Button>
                            <Popconfirm
                                title={deleteRecurringScope === 'ALL'
                                    ? 'Excluir TODOS os lançamentos recorrentes desta despesa?'
                                    : `Excluir lançamento de ${deleteRecurringMonth ? deleteRecurringMonth.format('MMMM/YYYY') : 'mês selecionado'}?`}
                                description="Esta ação não pode ser desfeita."
                                onConfirm={handleDeleteRecurring}
                                okText="Excluir"
                                cancelText="Cancelar"
                                okButtonProps={{ danger: true }}
                                disabled={deleteRecurringScope === 'MONTH' && !deleteRecurringMonth}
                            >
                                <Button danger disabled={deleteRecurringScope === 'MONTH' && !deleteRecurringMonth}>
                                    {deleteRecurringScope === 'ALL' ? 'Excluir Todos' : 'Excluir do Mês'}
                                </Button>
                            </Popconfirm>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Drawer: Novo Lançamento */}
            {/* Item 13: Type selector removed from drawer UI; toggle via button in extra */}
            <Drawer
                title={drawerType === 'INCOME' ? 'Nova Receita' : 'Nova Despesa'}
                width={680}
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); setExpPaymentMethod(''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado') }}
                extra={
                    <Space>
                        <Button
                            size="small"
                            onClick={() => { setDrawerType(drawerType === 'INCOME' ? 'EXPENSE' : 'INCOME'); form.resetFields(); setExpenseAmount('') }}
                        >
                            {drawerType === 'INCOME' ? '→ Despesa' : '→ Receita'}
                        </Button>
                        <Button type="primary" onClick={handleSaveEntry}>Salvar</Button>
                    </Space>
                }
            >
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
                    /* Item 13: Reworked expense drawer — no type selector, no expense_group, parcelas logic */
                    <Form form={form} layout="vertical">
                        <Form.Item name="expense_category" label="Categoria da Despesa" rules={[{ required: true, message: 'Selecione a categoria' }]}>
                            <Select
                                placeholder="Selecione a categoria"
                                options={activeCategoryOptions}
                                showSearch
                                listHeight={320}
                                filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                            />
                        </Form.Item>
                        <Form.Item name="expense_description" label="Descrição (opcional)">
                            <Input placeholder="Ex: Conta de luz da loja" />
                        </Form.Item>
                        <Form.Item label="Valor Total" required>
                            <Input prefix="R$" placeholder="0,00" value={expenseAmount} onChange={(e) => {
                                const newVal = currencyMaskFn(e.target.value)
                                setExpenseAmount(newVal)
                                if (expInstallmentPreset !== 'customizado') {
                                    const total = parseCurrencyFn(newVal)
                                    const n = expInstallments.length
                                    const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                                    setExpInstallments(prev => prev.map(inst => ({ ...inst, amount: amt })))
                                }
                            }} />
                        </Form.Item>
                        <Form.Item label="Método de Pagamento (opcional)">
                            <Select
                                value={expPaymentMethod || undefined}
                                placeholder="Selecione (opcional)"
                                allowClear
                                options={PAYMENT_METHODS.map(p => ({ value: p.value, label: p.label }))}
                                onChange={(v) => { setExpPaymentMethod(v || ''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado') }}
                            />
                        </Form.Item>
                        {(expPaymentMethod === 'BOLETO' || expPaymentMethod === 'CHEQUE_PRE_DATADO') ? (
                            <div style={{ marginBottom: 16, padding: 12, background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                                    Datas e valores de vencimento
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <Radio.Group
                                        value={expInstallmentPreset}
                                        onChange={(e) => {
                                            const p = e.target.value
                                            setExpInstallmentPreset(p)
                                            const insts = buildInstallmentsByPreset(p)
                                            const total = parseCurrencyFn(expenseAmount)
                                            const n = insts.length
                                            const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                                            setExpInstallments(insts.map(inst => ({ ...inst, amount: amt })))
                                        }}
                                        size="small"
                                    >
                                        {INSTALLMENT_PRESETS.map(p => <Radio.Button key={p.value} value={p.value}>{p.label}</Radio.Button>)}
                                    </Radio.Group>
                                </div>
                                {expInstallments.map((item, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                        <DatePicker
                                            placeholder="Data de vencimento"
                                            format="DD/MM/YYYY"
                                            value={item.date}
                                            onChange={(d) => setExpInstallments(prev => prev.map((r, i) => i === idx ? { ...r, date: d } : r))}
                                            style={{ width: '100%' }}
                                        />
                                        <InputNumber
                                            min={0} step={0.01} precision={2} style={{ width: '100%' }}
                                            placeholder="Valor (R$)" value={item.amount || undefined} addonBefore="R$"
                                            onChange={(v) => setExpInstallments(prev => prev.map((r, i) => i === idx ? { ...r, amount: Number(v) || 0 } : r))}
                                        />
                                        <Button danger size="small" type="text"
                                            disabled={expInstallmentPreset !== 'customizado' || expInstallments.length === 1}
                                            onClick={() => setExpInstallments(prev => prev.filter((_, i) => i !== idx))}>✕</Button>
                                    </div>
                                ))}
                                {expInstallmentPreset === 'customizado' && (
                                    <Button type="dashed" size="small" style={{ width: '100%' }}
                                        onClick={() => setExpInstallments(prev => [...prev, { date: null, amount: 0 }])}>
                                        + Adicionar data/valor
                                    </Button>
                                )}
                            </div>
                        ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Form.Item name="parcelas" label="Número de parcelas" initialValue={1}>
                                <InputNumber min={1} max={120} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="data_inicio" label="Data de início">
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={dayjs().format('DD/MM/YYYY')} />
                            </Form.Item>
                        </div>
                        )}
                        {(expPaymentMethod !== 'BOLETO' && expPaymentMethod !== 'CHEQUE_PRE_DATADO') && (
                        <Alert
                            type="info"
                            showIcon
                            message="Condição de Pagamento"
                            description="Se parcelas = 1, será criado 1 lançamento. Se parcelas > 1, o valor total será dividido igualmente entre as parcelas com vencimento mensal a partir da data de início."
                            style={{ marginTop: 8 }}
                        />
                        )}
                    </Form>
                )}
            </Drawer>

            {/* Drawer: Editar Lançamento */}
            <Drawer
                title="Editar Lançamento"
                width={680}
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                extra={<Space><Button onClick={() => setEditDrawerOpen(false)}>Cancelar</Button><Button type="primary" onClick={handleSaveEdit}>Salvar</Button></Space>}
            >
                <Form form={editForm} layout="vertical">
                    <Form.Item name="description" label="Descrição">
                        <Input />
                    </Form.Item>
                    <Form.Item label="Valor" required>
                        <Input prefix="R$" value={editAmount} onChange={(e) => setEditAmount(currencyMaskFn(e.target.value))} />
                    </Form.Item>
                    <Form.Item name="due_date" label="Data Vencimento">
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                    <Form.Item name="paid_date" label="Data Pagamento (opcional)">
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Deixe vazio se não pago" />
                    </Form.Item>
                </Form>
            </Drawer>
        </Layout>
    )
}
