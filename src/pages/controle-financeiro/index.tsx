import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Select, Table, Tag, DatePicker, Space, message, Tabs,
    Popconfirm, Form, Input, InputNumber, Drawer, Alert, Radio,
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
    CreditCardOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import {
    EXPENSE_GROUP_OPTIONS,
    getExpenseGroupLabel,
    getExpenseGroupColor,
    type ExpenseGroupKey,
} from '@/constants/cashier-category'

import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement,
    Title, Tooltip as ChartTooltip, Legend, ArcElement
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, ChartTooltip, Legend)

function formatCurrency(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

const CATEGORY_GROUP_MAP: { category: string; group: string }[] = [
    { category: 'Salários Produção', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Plano de Saúde (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Vale Alimentação (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Vale Transporte (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Pró Labore', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Salários Administrativos', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Salários Comerciais', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'FGTS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'INSS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Água', group: 'DESPESA_FIXA' },
    { category: 'Aluguel', group: 'DESPESA_FIXA' },
    { category: 'Consultoria', group: 'DESPESA_FIXA' },
    { category: 'Contabilidade', group: 'DESPESA_FIXA' },
    { category: 'Energia Elétrica', group: 'DESPESA_FIXA' },
    { category: 'Internet', group: 'DESPESA_FIXA' },
    { category: 'Sistema de Gestão / Softwares', group: 'DESPESA_FIXA' },
    { category: 'Telefone', group: 'DESPESA_FIXA' },
    { category: 'Seguros', group: 'DESPESA_FIXA' },
    { category: 'Empréstimos', group: 'DESPESA_FIXA' },
    { category: 'Comissões de Venda', group: 'DESPESA_VARIAVEL' },
    { category: 'Combustíveis', group: 'DESPESA_VARIAVEL' },
    { category: 'Marketing (publicidades e relacionados)', group: 'DESPESA_VARIAVEL' },
    { category: 'Manutenções', group: 'DESPESA_VARIAVEL' },
    { category: 'Terceirizações', group: 'DESPESA_VARIAVEL' },
    { category: 'Uso e Consumo', group: 'DESPESA_VARIAVEL' },
    { category: 'Fretes (Valores relacionados a entrega dos produtos)', group: 'DESPESA_VARIAVEL' },
    { category: 'Juros', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas Cartão', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas Bancárias', group: 'DESPESA_FINANCEIRA' },
    { category: 'Impostos IPTU / IPVA', group: 'IMPOSTO' },
    { category: 'MEI (Microempreendedor Individual)', group: 'IMPOSTO' },
]

const EXPENSE_CATEGORY_OPTIONS = [
    { label: '── Mão de Obra Produtiva ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Mão de Obra Administrativa ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Fixas ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Variáveis ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Financeiras ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Impostos ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'IMPOSTO').map(c => ({ label: c.category, value: c.category })) },
]

function getGroupForCategory(cat: string): string | undefined {
    return CATEGORY_GROUP_MAP.find(c => c.category === cat)?.group
}

// ── Categorias Simples Nacional ──
const SN_CATEGORY_GROUP_MAP: { category: string; group: string }[] = [
    // Custo Produtos
    { category: 'Fornecedores — Produtos para Revenda', group: 'CUSTO_PRODUTOS' },
    { category: 'Matéria-prima — Base dos produtos', group: 'CUSTO_PRODUTOS' },
    { category: 'Embalagens individuais', group: 'CUSTO_PRODUTOS' },
    // Mão de Obra Produção
    { category: 'Salários produção', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Décimo terceiro (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Férias colaboradores (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Horas extras — Salários', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'INSS patronal (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Plano de saúde (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'RAT / FAP', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Vale alimentação (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Vale transporte (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Mão de obra produtiva terceirizada — passível de crédito', group: 'MAO_DE_OBRA_PRODUTIVA' },
    // Mão de Obra Administrativa
    { category: 'Pró-labore', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Salários administrativos', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Salários comerciais', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Décimo terceiro (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Férias colaboradores (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'FGTS (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Horas extras — Salários (Admin)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'INSS (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'INSS patronal (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Plano de saúde (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'RAT / FAP (Admin)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Vale alimentação (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Vale transporte (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    // Despesa Fixa
    { category: 'Água', group: 'DESPESA_FIXA' },
    { category: 'Aluguel', group: 'DESPESA_FIXA' },
    { category: 'Aplicações / Consórcios', group: 'DESPESA_FIXA' },
    { category: 'Consultoria', group: 'DESPESA_FIXA' },
    { category: 'Contabilidade', group: 'DESPESA_FIXA' },
    { category: 'Depreciação', group: 'DESPESA_FIXA' },
    { category: 'Empréstimos / Financiamentos', group: 'DESPESA_FIXA' },
    { category: 'Energia elétrica', group: 'DESPESA_FIXA' },
    { category: 'Impostos IPTU / IPVA', group: 'IMPOSTO' },
    { category: 'Internet', group: 'DESPESA_FIXA' },
    { category: 'Segurança / Monitoramento', group: 'DESPESA_FIXA' },
    { category: 'Seguros imóveis e veículos', group: 'DESPESA_FIXA' },
    { category: 'Sistema de gestão / Softwares', group: 'DESPESA_FIXA' },
    { category: 'Taxas de licenciamento', group: 'DESPESA_FIXA' },
    { category: 'Telefone', group: 'DESPESA_FIXA' },
    { category: 'Saúde trabalhista / Ocupacional', group: 'DESPESA_FIXA' },
    { category: 'MEI (Microempreendedor Individual)', group: 'IMPOSTO' },
    // Despesa Variável
    { category: 'Combustíveis', group: 'DESPESA_VARIAVEL' },
    { category: 'Correios', group: 'DESPESA_VARIAVEL' },
    { category: 'Departamento jurídico', group: 'DESPESA_VARIAVEL' },
    { category: 'Embalagens diversas', group: 'DESPESA_VARIAVEL' },
    { category: 'Manutenções', group: 'DESPESA_VARIAVEL' },
    { category: 'Marketing (publicidades e relacionados)', group: 'DESPESA_VARIAVEL' },
    { category: 'Pedágios', group: 'DESPESA_VARIAVEL' },
    { category: 'Rescisões / Indenizações', group: 'DESPESA_VARIAVEL' },
    { category: 'Terceirizações (prestadores de serviços)', group: 'DESPESA_VARIAVEL' },
    { category: 'Uso e consumo', group: 'DESPESA_VARIAVEL' },
    { category: 'Vale alimentação (variável)', group: 'DESPESA_VARIAVEL' },
    { category: 'Viagens (hotéis / passagens / alimentação / etc)', group: 'DESPESA_VARIAVEL' },
    // Despesa Financeira
    { category: 'Juros', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas cartão', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas bancárias', group: 'DESPESA_FINANCEIRA' },
    { category: 'Troca cheque', group: 'DESPESA_FINANCEIRA' },
    { category: 'IOF', group: 'DESPESA_FINANCEIRA' },
    // Atividades Terceirizadas
    { category: 'Fretes / Logísticas de entrega terceirizados', group: 'DESPESA_VARIAVEL' },
    { category: 'Seguro de transporte entrega', group: 'DESPESA_VARIAVEL' },
    { category: 'Despesas acessórias', group: 'DESPESA_VARIAVEL' },
    { category: 'Gastos com logísticas externas', group: 'DESPESA_VARIAVEL' },
    // Regime Tributário
    { category: 'Simples Nacional', group: 'IMPOSTO' },
    // Comissões
    { category: 'Comissões de venda', group: 'DESPESA_VARIAVEL' },
    // Lucro
    { category: 'Investimentos (máquinas, equipamentos, expansão e melhorias)', group: 'DESPESA_FIXA' },
    { category: 'Distribuição de lucros', group: 'DESPESA_FIXA' },
]

const SN_EXPENSE_CATEGORY_OPTIONS = [
    { label: '── Custo de Produtos ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'CUSTO_PRODUTOS').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Mão de Obra Produção ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Mão de Obra Administrativa ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Fixas ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Variáveis ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Financeiras ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Impostos ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'IMPOSTO').map(c => ({ label: c.category, value: c.category })) },
]

function getSNGroupForCategory(cat: string): string | undefined {
    return SN_CATEGORY_GROUP_MAP.find(c => c.category === cat)?.group
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
    const [loading, setLoading] = useState(false)
    const [month, setMonth] = useState(dayjs())
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL')

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerType, setDrawerType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
    const [expenseAmount, setExpenseAmount] = useState('')
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [editingEntry, setEditingEntry] = useState<any>(null)
    const [editAmount, setEditAmount] = useState('')

    const [form] = Form.useForm()
    const [editForm] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()

    const startOfMonth = month.startOf('month').format('YYYY-MM-DD')
    const endOfMonth = month.endOf('month').format('YYYY-MM-DD')

    const fetchData = async () => {
        setLoading(true)
        try {
            const sbf = supabase as any
            const tenantId = await getTenantId()
            const [{ data: entries }, { data: emps }, { data: fixedList }, { data: tenantSettings }] = await Promise.all([
                sbf.from('cash_entries')
                    .select('*')
                    .gte('due_date', startOfMonth)
                    .lte('due_date', endOfMonth)
                    .eq('is_active', true)
                    .order('due_date', { ascending: false }),
                sbf.from('employees').select('id, name, salary').eq('status', 'ACTIVE').eq('is_active', true),
                tenantId
                    ? sbf.from('fixed_expenses').select('id, description, amount, due_day').eq('tenant_id', tenantId).eq('is_active', true)
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

    useEffect(() => { fetchData() }, [month])

    const filteredData = useMemo(() => {
        if (typeFilter === 'ALL') return data
        return data.filter(d => d.type === typeFilter)
    }, [data, typeFilter])

    const totalIncome = useMemo(() => data.filter(d => d.type === 'INCOME').reduce((s, d) => s + getEffectiveIncomeAmount(d), 0), [data])
    const totalExpense = useMemo(() => data.filter(d => d.type === 'EXPENSE').reduce((s, d) => s + Number(d.amount || 0), 0), [data])
    const balance = totalIncome - totalExpense
    const totalFixed = useMemo(() => data.filter(d => d.origin_type === 'FIXED_EXPENSE' || d.origin_type === 'SALARY').reduce((s, d) => s + Number(d.amount || 0), 0), [data])

    // ── Regime: categorias do Simples Nacional ou padrão ──
    const isSimples = taxRegime === 'SIMPLES_NACIONAL' || currentUser?.taxableRegime === 'SIMPLES_NACIONAL'
    const activeCategoryOptions = isSimples ? SN_EXPENSE_CATEGORY_OPTIONS : EXPENSE_CATEGORY_OPTIONS
    const activeGroupForCategory = (cat: string) => isSimples ? getSNGroupForCategory(cat) : getGroupForCategory(cat)

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

    // ── Salvar Novo Lançamento ──
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
                    origin_type: 'MANUAL',
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

                const entries: any[] = []

                if (recurrence === 'ONCE') {
                    entries.push({
                        tenant_id, type: 'EXPENSE', origin_type: 'MANUAL', recurrence_type: 'ONCE',
                        description: desc, amount: amountNum,
                        due_date: `${startY}-${String(startM + 1).padStart(2, '0')}-01`,
                        expense_group: values.expense_group,
                    })
                } else if (recurrence === 'WEEKLY' || recurrence === 'BIWEEKLY') {
                    const daysStep = recurrence === 'WEEKLY' ? 7 : 14
                    const cursor = new Date(startY, startM, 1)
                    const endDate = new Date(endY, endM + 1, 0)
                    while (cursor <= endDate) {
                        entries.push({
                            tenant_id, type: 'EXPENSE', origin_type: 'FIXED_EXPENSE', recurrence_type: recurrence,
                            description: desc, amount: amountNum,
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
                            tenant_id, type: 'EXPENSE', origin_type: 'FIXED_EXPENSE', recurrence_type: recurrence,
                            description: desc, amount: amountNum,
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
            due_date: dayjs(record.due_date),
            paid_date: record.paid_date ? dayjs(record.paid_date) : undefined,
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

            const { data: fixedList } = await supabase.from('fixed_expenses').select('id, description, amount, due_day').eq('tenant_id', tenant_id).eq('is_active', true)
            if (fixedList?.length) {
                for (const fe of fixedList) {
                    const day = Math.min(Math.max(1, fe.due_day), lastDay)
                    const due_date = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const key = `${fe.description}|FIXED_EXPENSE|${Number(fe.amount)}`
                    if (existingKeys.has(key)) continue
                    existingKeys.add(key)
                    toInsert.push({ tenant_id, type: 'EXPENSE', origin_type: 'FIXED_EXPENSE', recurrence_type: 'MONTHLY', description: fe.description, amount: Number(fe.amount), due_date, expense_group: 'DESPESA_FIXA' })
                }
            }
            for (const emp of employees) {
                const salary = Number(emp.salary || 0)
                if (salary <= 0) continue
                const desc = `Salários — ${emp.name || 'Funcionário'}`
                const key = `${desc}|SALARY|${salary}`
                if (existingKeys.has(key)) continue
                existingKeys.add(key)
                toInsert.push({ tenant_id, type: 'EXPENSE', origin_type: 'SALARY', recurrence_type: 'MONTHLY', description: desc, amount: salary, due_date: `${y}-${String(m + 1).padStart(2, '0')}-01`, expense_group: 'MAO_DE_OBRA_PRODUTIVA' })
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
            render: (v) => dayjs(v).format('DD/MM/YYYY'),
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
                        <>
                            <Button icon={<SyncOutlined />} onClick={handleGenerateRecurring}>Gerar Contas do Mês (Fixas/Salários)</Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setExpenseAmount(''); setDrawerType('EXPENSE'); setDrawerOpen(true) }}>
                                + Novo Lançamento
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
                                                                        const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0'
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
                        children: (
                            <div className="pc-card--table">
                                <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
                                    Despesas cadastradas como recorrentes (fixed_expenses)
                                </div>
                                {fixedExpenses.length > 0 ? (
                                    <Table
                                        columns={[
                                            { title: 'Descrição', dataIndex: 'description', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
                                            { title: 'Valor', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <strong style={{ color: '#F04438' }}>{formatCurrency(Number(v))}</strong> },
                                            { title: 'Dia Vencimento', dataIndex: 'due_day', align: 'center' as const, render: (v: number) => <Tag>{v}</Tag> },
                                        ]}
                                        dataSource={fixedExpenses}
                                        rowKey="id"
                                        pagination={false}
                                        size="small"
                                        summary={() => (
                                            <Table.Summary>
                                                <Table.Summary.Row style={{ background: 'rgba(240, 68, 56, 0.08)' }}>
                                                    <Table.Summary.Cell index={0}><strong>Total Mensal</strong></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={1} align="right">
                                                        <strong style={{ color: '#F04438' }}>
                                                            {formatCurrency(fixedExpenses.reduce((s, fe) => s + Number(fe.amount || 0), 0))}
                                                        </strong>
                                                    </Table.Summary.Cell>
                                                    <Table.Summary.Cell index={2} />
                                                </Table.Summary.Row>
                                            </Table.Summary>
                                        )}
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: 40, color: '#98A2B3' }}>
                                        <BankOutlined style={{ fontSize: 36, marginBottom: 8 }} />
                                        <p>Nenhuma despesa recorrente cadastrada.</p>
                                    </div>
                                )}
                            </div>
                        ),
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
                                            render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
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
                ]}
            />

            {/* Drawer: Novo Lançamento */}
            <Drawer title="Novo Lançamento" width={460} open={drawerOpen} onClose={() => setDrawerOpen(false)}
                extra={<Button type="primary" onClick={handleSaveEntry}>Salvar</Button>}>
                <div style={{ marginBottom: 16 }}>
                    <span style={{ fontWeight: 500, marginRight: 8 }}>Tipo:</span>
                    <Select value={drawerType} onChange={(v) => { setDrawerType(v); form.resetFields(); setExpenseAmount('') }} style={{ width: 220 }}>
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
                                options={activeCategoryOptions}
                                showSearch
                                listHeight={320}
                                filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                                onChange={(val) => {
                                    const g = activeGroupForCategory(val)
                                    if (g) form.setFieldsValue({ expense_group: g })
                                }}
                            />
                        </Form.Item>
                        <Form.Item name="expense_group" label="Tipo de Despesa" rules={[{ required: true, message: 'Selecione o tipo' }]}>
                            <Select placeholder="Selecione o tipo" disabled={!!form.getFieldValue('expense_category')}>
                                <Select.OptGroup label="Mão de Obra">
                                    <Select.Option value="MAO_DE_OBRA_PRODUTIVA">Mão de Obra Produtiva</Select.Option>
                                    <Select.Option value="MAO_DE_OBRA_ADMINISTRATIVA">Mão de Obra Administrativa</Select.Option>
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
                            <Input prefix="R$" placeholder="0,00" value={expenseAmount} onChange={(e) => setExpenseAmount(currencyMaskFn(e.target.value))} />
                        </Form.Item>
                        <Form.Item name="recurrence" label="Recorrência" initialValue="MONTHLY">
                            <Select options={[
                                { label: '1 única vez', value: 'ONCE' },
                                { label: 'Semanal', value: 'WEEKLY' },
                                { label: 'Quinzenal', value: 'BIWEEKLY' },
                                { label: 'Mensal', value: 'MONTHLY' },
                                { label: 'Trimestral', value: 'QUARTERLY' },
                            ]} />
                        </Form.Item>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Form.Item name="start_month" label="Mês início">
                                <DatePicker picker="month" style={{ width: '100%' }} format="MM/YYYY" placeholder={dayjs().format('MM/YYYY')} />
                            </Form.Item>
                            <Form.Item name="end_month" label="Mês fim">
                                <DatePicker picker="month" style={{ width: '100%' }} format="MM/YYYY" placeholder={`12/${dayjs().year()}`} />
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
