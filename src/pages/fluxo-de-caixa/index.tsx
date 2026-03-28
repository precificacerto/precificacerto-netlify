import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Select, DatePicker, Space, message,
    Form, Input, InputNumber, Drawer, Modal, Table, Tag, Radio,
} from 'antd'
import dayjs from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import {
    PlusOutlined, SyncOutlined,
    CalendarOutlined, FileExcelOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'

import {
    exportCashFlowToExcel, exportCashFlowMultiMonth,
    INCOME_LABELS, EXPENSE_SECTIONS, matchesDescription, getIncomeLabel,
} from '@/utils/export-cash-flow-excel'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'

function formatCurrency(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

const EXPENSE_PAYMENT_METHODS = [
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: '🗓️ Cheque Pré-datado' },
]

const PAYMENT_CONDITIONS = [
    { value: '30', label: '30 dias' },
    { value: '30_60', label: '30/60 dias' },
    { value: '30_60_90', label: '30/60/90 dias' },
]

const CATEGORY_GROUP_MAP: { category: string; group: string }[] = [
    // Mão de Obra Produtiva
    { category: 'Salários Produção', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Décimo Terceiro (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Férias Colaboradores (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Plano de Saúde (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Vale Alimentação (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    { category: 'Vale Transporte (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
    // Mão de Obra Administrativa
    { category: 'Pró Labore', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Salários Administrativos', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Salários Comerciais', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Décimo Terceiro (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Férias Colaboradores (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'FGTS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'INSS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Plano de Saúde (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Vale Alimentação (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Vale Transporte (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
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
    { category: 'Horas extras — Salários', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'INSS (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'INSS patronal (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'Plano de saúde (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
    { category: 'RAT / FAP', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
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
    { category: 'Impostos IPTU / IPVA', group: 'DESPESA_FIXA' },
    { category: 'Internet', group: 'DESPESA_FIXA' },
    { category: 'Segurança / Monitoramento', group: 'DESPESA_FIXA' },
    { category: 'Seguros imóveis e veículos', group: 'DESPESA_FIXA' },
    { category: 'Sistema de gestão / Softwares', group: 'DESPESA_FIXA' },
    { category: 'Taxas de licenciamento', group: 'DESPESA_FIXA' },
    { category: 'Telefone', group: 'DESPESA_FIXA' },
    { category: 'Saúde trabalhista / Ocupacional', group: 'DESPESA_FIXA' },
    { category: 'MEI (Microempreendedor Individual)', group: 'DESPESA_FIXA' },
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
    { category: 'Vale alimentação', group: 'DESPESA_VARIAVEL' },
    { category: 'Viagens (hotéis / passagens / alimentação / etc)', group: 'DESPESA_VARIAVEL' },
    // Despesa Financeira
    { category: 'Juros', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas cartão', group: 'DESPESA_FINANCEIRA' },
    { category: 'Taxas bancárias', group: 'DESPESA_FINANCEIRA' },
    { category: 'Troca cheque', group: 'DESPESA_FINANCEIRA' },
    { category: 'IOF', group: 'DESPESA_FINANCEIRA' },
    // Atividades Terceirizadas
    { category: 'Fretes / Logísticas de entrega terceirizados', group: 'ATIVIDADES_TERCEIRIZADAS' },
    { category: 'Seguro de transporte entrega', group: 'ATIVIDADES_TERCEIRIZADAS' },
    { category: 'Despesas acessórias', group: 'ATIVIDADES_TERCEIRIZADAS' },
    { category: 'Gastos com logísticas externas', group: 'ATIVIDADES_TERCEIRIZADAS' },
    // Regime Tributário
    { category: 'Simples Nacional', group: 'REGIME_TRIBUTARIO' },
    // Comissões
    { category: 'Comissões de venda', group: 'COMISSOES' },
    // Lucro
    { category: 'Investimentos (máquinas, equipamentos, expansão e melhorias)', group: 'LUCRO' },
    { category: 'Distribuição de lucros', group: 'LUCRO' },
]

const SN_EXPENSE_CATEGORY_OPTIONS = [
    { label: '── Custo dos Produtos ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'CUSTO_PRODUTOS').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Mão de Obra Produção ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Mão de Obra Administrativa ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Fixas ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Variáveis ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Financeiras ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Atividades Terceirizadas Operacionais de Entrega ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'ATIVIDADES_TERCEIRIZADAS').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Regime Tributário ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'REGIME_TRIBUTARIO').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Comissões ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'COMISSOES').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Lucro ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'LUCRO').map(c => ({ label: c.category, value: c.category })) },
]

function getSNGroupForCategory(cat: string): string | undefined {
    return SN_CATEGORY_GROUP_MAP.find(c => c.category === cat)?.group
}

const INSTALLMENT_PRESETS = [
    { value: 'customizado', label: 'Customizado' },
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

export default function CashFlow() {
    const [data, setData] = useState<any[]>([])
    const { canView, canEdit } = usePermissions()
    const [employees, setEmployees] = useState<any[]>([])
    const [taxRegime, setTaxRegime] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [month, setMonth] = useState(dayjs())

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [expenseAmount, setExpenseAmount] = useState('')
    const [selectedDay, setSelectedDay] = useState<number | null>(null)
    const [loadingPrevBalance, setLoadingPrevBalance] = useState(false)
    const [prevBalanceModalOpen, setPrevBalanceModalOpen] = useState(false)
    const [prevBalanceInput, setPrevBalanceInput] = useState<number>(0)
    const [expPaymentMethod, setExpPaymentMethod] = useState<string>('')
    const [expInstallments, setExpInstallments] = useState<{ date: any; amount: number }[]>([{ date: null, amount: 0 }])
    const [expInstallmentPreset, setExpInstallmentPreset] = useState<'customizado' | '30' | '30_60' | '30_60_90' | '30_60_90_120' | '30_60_90_120_150'>('customizado')

    const [form] = Form.useForm()

    const [messageApi, contextHolder] = message.useMessage()

    // Export modal
    const [exportModalOpen, setExportModalOpen] = useState(false)
    const [exportRange, setExportRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([month.startOf('month'), month.endOf('month')])
    const [exporting, setExporting] = useState(false)

    // Export format modals (PDF vs Excel)
    const [exportFormatModalOpen, setExportFormatModalOpen] = useState(false)

    const startOfMonth = month.startOf('month').format('YYYY-MM-DD')
    const endOfMonth = month.endOf('month').format('YYYY-MM-DD')

    const fetchData = async () => {
        setLoading(true)
        try {
            const sbf = supabase as any
            const tenantId = await getTenantId()
            const [{ data: entries }, { data: emps }, { data: tenantSettings }] = await Promise.all([
                sbf.from('cash_entries')
                    .select('*')
                    .gte('due_date', startOfMonth)
                    .lte('due_date', endOfMonth)
                    .eq('is_active', true)
                    .order('due_date', { ascending: true }),
                sbf.from('employees').select('id, name, salary').eq('status', 'ACTIVE').eq('is_active', true),
                tenantId
                    ? sbf.from('tenant_settings').select('tax_regime').eq('tenant_id', tenantId).maybeSingle()
                    : Promise.resolve({ data: null }),
            ])
            setData(entries || [])
            setEmployees(emps || [])
            if (tenantSettings?.tax_regime) setTaxRegime(tenantSettings.tax_regime)
        } catch {
            messageApi.error('Erro ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [month])

    const isSimples = taxRegime === 'SIMPLES_NACIONAL' || taxRegime === 'MEI'
    const activeCategoryOptions = isSimples ? SN_EXPENSE_CATEGORY_OPTIONS : EXPENSE_CATEGORY_OPTIONS
    const activeGroupForCategory = (cat: string) => isSimples ? getSNGroupForCategory(cat) : getGroupForCategory(cat)

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
                const { data: entries } = await (supabase as any)
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
                r.due_date ? r.due_date.substring(8, 10) + '/' + r.due_date.substring(5, 7) + '/' + r.due_date.substring(0, 4) : '',
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

    if (!canView(MODULES.CASH_FLOW)) {
        return <Layout title={PAGE_TITLES.CASH_FLOW}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    // ── Regular entries (exclude PREV_MONTH_BALANCE from all calculations) ──
    const regularData = useMemo(() => data.filter((e: any) => e.origin_type !== 'PREV_MONTH_BALANCE'), [data])

    // ── Filtered data for DFC (respects day selection from calendar) ──
    const dfcData = useMemo(() => {
        if (selectedDay === null) return regularData
        const dayStr = String(selectedDay).padStart(2, '0')
        return regularData.filter((e: any) => e.due_date && e.due_date.substring(8, 10) === dayStr)
    }, [regularData, selectedDay])

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

        for (const entry of dfcData) {
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
    }, [dfcData])

    // ── Daily totals for the calendar row (Item 9) ──
    const dailyTotals = useMemo(() => {
        const daysInMonth = month.daysInMonth()
        const totals: Record<number, number> = {}
        for (let d = 1; d <= daysInMonth; d++) totals[d] = 0
        for (const entry of regularData) {
            if (!entry.due_date) continue
            const day = parseInt(entry.due_date.substring(8, 10), 10)
            if (day < 1 || day > daysInMonth) continue
            if (entry.type === 'INCOME') {
                if (entry.payment_method === 'BOLETO' && !entry.paid_date) continue
                totals[day] += getEffectiveIncomeAmount(entry)
            } else {
                totals[day] -= Number(entry.amount) || 0
            }
        }
        return { totals, daysInMonth }
    }, [regularData, month])

    // ── Pivot: per-day per-category amounts for Excel-like grid ──
    const pivotByDay = useMemo(() => {
        const daysInMonth = month.daysInMonth()
        const result: Record<string, Record<number, number>> = {}
        const allKeys = [...INCOME_LABELS, ...EXPENSE_SECTIONS.map(s => s.header), 'Outras Despesas']
        // Also track item-level keys
        for (const section of EXPENSE_SECTIONS) {
            for (const item of section.items) {
                allKeys.push(`${section.header}||${item.label}`)
            }
        }
        for (const cat of allKeys) {
            result[cat] = {}
            for (let d = 1; d <= daysInMonth; d++) result[cat][d] = 0
        }
        for (const entry of regularData) {
            if (!entry.due_date) continue
            const day = parseInt(entry.due_date.substring(8, 10), 10)
            if (day < 1 || day > daysInMonth) continue
            if (entry.type === 'INCOME') {
                if (entry.payment_method === 'BOLETO' && !entry.paid_date) continue
                const label = getIncomeLabel(entry)
                if (label && result[label]) result[label][day] = (result[label][day] || 0) + getEffectiveIncomeAmount(entry)
            } else {
                let matched = false
                for (const section of EXPENSE_SECTIONS) {
                    if (matched) break
                    for (const item of section.items) {
                        if (matchesDescription(entry.description, item.descMatch)) {
                            result[section.header][day] = (result[section.header][day] || 0) + (Number(entry.amount) || 0)
                            result[`${section.header}||${item.label}`][day] = (result[`${section.header}||${item.label}`][day] || 0) + (Number(entry.amount) || 0)
                            matched = true
                            break
                        }
                    }
                }
                if (!matched) result['Outras Despesas'][day] = (result['Outras Despesas'][day] || 0) + (Number(entry.amount) || 0)
            }
        }
        return { data: result, daysInMonth }
    }, [regularData, month])

    // ── Saldo do Mês Anterior (valor fixo inserido pelo usuário) ──
    const prevMonthBalanceValue = useMemo(() => {
        const entry = (data as any[]).find((e) => e.origin_type === 'PREV_MONTH_BALANCE')
        if (!entry) return 0
        return entry.type === 'INCOME' ? Number(entry.amount) : -Number(entry.amount)
    }, [data])

    // ── Saldo acumulado por dia (saldo do dia anterior) ──
    const saldoDiaAnterior = useMemo(() => {
        const result: Record<number, number> = {}
        let running = prevMonthBalanceValue
        for (let d = 1; d <= pivotByDay.daysInMonth; d++) {
            result[d] = running
            const incomeDay = INCOME_LABELS.reduce((s, l) => s + ((pivotByDay.data[l] || {})[d] || 0), 0)
            const expenseDay = [...EXPENSE_SECTIONS.map(sec => sec.header), 'Outras Despesas'].reduce((s, k) => s + ((pivotByDay.data[k] || {})[d] || 0), 0)
            running += incomeDay - expenseDay
        }
        return result
    }, [pivotByDay, prevMonthBalanceValue])

    // ── Saldo do Mês Anterior (Item 11) — usuário insere valor manualmente ──
    const handlePrevMonthBalance = () => {
        setPrevBalanceInput(0)
        setPrevBalanceModalOpen(true)
    }

    const handleSavePrevBalance = async () => {
        setLoadingPrevBalance(true)
        try {
            const tenant_id = await getTenantId()
            if (!tenant_id) { messageApi.warning('Sessão inválida.'); return }

            const value = prevBalanceInput
            const absValue = Math.abs(value)
            const currentMonthStr = month.format('YYYY-MM')
            const due_date = `${currentMonthStr}-01`

            // Remover lançamento anterior do mesmo mês (se houver)
            await (supabase as any).from('cash_entries')
                .delete()
                .eq('tenant_id', tenant_id)
                .eq('origin_type', 'PREV_MONTH_BALANCE')
                .gte('due_date', startOfMonth)
                .lte('due_date', endOfMonth)

            if (absValue > 0) {
                const { error } = await (supabase as any).from('cash_entries').insert({
                    tenant_id,
                    type: value >= 0 ? 'INCOME' : 'EXPENSE',
                    origin_type: 'PREV_MONTH_BALANCE',
                    description: 'Saldo do mês anterior',
                    amount: absValue,
                    due_date,
                })
                if (error) throw error
            }

            messageApi.success(`Saldo do mês anterior salvo: ${formatCurrency(value)}`)
            setPrevBalanceModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao salvar saldo do mês anterior: ' + (err?.message || ''))
        } finally {
            setLoadingPrevBalance(false)
        }
    }

    // ── Salvar Novo ──
    const handleSaveEntry = async () => {
        try {
            const values = await form.validateFields()
            const tenant_id = await getTenantId()
            if (!tenant_id) return

            {
                const amountNum = parseCurrencyFn(expenseAmount)
                if (amountNum <= 0) { messageApi.warning('Informe o valor da despesa.'); return }
                if (!values.expense_category) { messageApi.warning('Selecione a categoria.'); return }

                const desc = values.expense_description
                    ? `${values.expense_category} — ${values.expense_description}`
                    : values.expense_category

                const parcelas: number = values.parcelas && values.parcelas >= 1 ? Math.floor(values.parcelas) : 1
                const startDate: dayjs.Dayjs = values.expense_start_date || month.startOf('month')
                const expenseGroup = activeGroupForCategory(values.expense_category) || 'DESPESA_FIXA'
                const paymentMethod: string = values.payment_method || ''
                const isBoletoOrCheque = paymentMethod === 'BOLETO' || paymentMethod === 'CHEQUE_PRE_DATADO'
                const payCondition: string = values.payment_condition || '30'

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const entries: any[] = []

                if (isBoletoOrCheque) {
                    const validInst = expInstallments.filter(r => r.date && r.amount > 0)
                    if (validInst.length === 0) {
                        messageApi.error('Informe ao menos uma data e valor de vencimento.')
                        return
                    }
                    validInst.forEach((inst, idx) => {
                        entries.push({
                            tenant_id,
                            type: 'EXPENSE' as const,
                            origin_type: 'MANUAL',
                            recurrence_type: 'ONCE',
                            description: validInst.length > 1 ? `${desc} (${idx + 1}/${validInst.length})` : desc,
                            amount: inst.amount,
                            due_date: inst.date.format('YYYY-MM-DD'),
                            expense_group: expenseGroup,
                            expense_category: values.expense_category,
                            payment_method: paymentMethod,
                        })
                    })
                } else {
                    const parcelValue = parcelas === 1 ? amountNum : Math.round((amountNum / parcelas) * 100) / 100
                    for (let i = 0; i < parcelas; i++) {
                        const due = startDate.add(i, 'month')
                        entries.push({
                            tenant_id,
                            type: 'EXPENSE' as const,
                            origin_type: 'MANUAL',
                            recurrence_type: 'ONCE',
                            description: parcelas > 1 ? `${desc} (${i + 1}/${parcelas})` : desc,
                            amount: parcelValue,
                            due_date: due.format('YYYY-MM-DD'),
                            expense_group: expenseGroup,
                            expense_category: values.expense_category,
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
            await fetchData()
        } catch (err: any) {
            if (err && err.name === 'ValidateError') {
                messageApi.error('Preencha os campos obrigatórios.')
            } else if (err && err.message) {
                messageApi.error('Erro ao salvar lançamento: ' + err.message)
            } else {
                messageApi.error('Preencha os campos obrigatórios.')
            }
        }
    }

    return (
        <Layout title={PAGE_TITLES.CASH_FLOW} subtitle="Relatório de Fluxo de Caixa">
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
                            <Button loading={loadingPrevBalance} onClick={handlePrevMonthBalance}>
                                Saldo do Mês Anterior
                            </Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setExpenseAmount(''); setExpPaymentMethod(''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado'); setDrawerOpen(true) }}>
                                + Novo Lançamento
                            </Button>
                        </>
                    )}
                    <Button
                        icon={<FileExcelOutlined />}
                        onClick={() => setExportFormatModalOpen(true)}
                        style={{ background: '#217346', borderColor: '#217346', color: '#fff' }}
                    >
                        Exportar
                    </Button>
                </Space>
            </div>

            {/* ── Pivot Table: Excel-like Grid ── */}
            <div style={{ background: '#0d1b2a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', marginTop: 0 }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a2744', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                        Fluxo de Caixa — {month.format('MMMM [de] YYYY')}
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Visão por dia (todos os dias do mês)</span>
                </div>

                {/* Pivot Table */}
                <div style={{ overflowX: 'auto', width: '100%' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#1a2744' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, minWidth: 180, position: 'sticky', left: 0, background: '#1a2744', zIndex: 2, borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                                    Categoria
                                </th>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => (
                                    <th key={day} style={{ padding: '6px 4px', textAlign: 'center', color: '#94a3b8', fontWeight: 600, minWidth: 72, borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                                        {String(day).padStart(2, '0')}
                                    </th>
                                ))}
                                <th style={{ padding: '8px 12px', textAlign: 'right', color: '#e2e8f0', fontWeight: 700, minWidth: 110, background: '#1a2744', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                    TOTAL
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* ── Saldo Mês Anterior ── */}
                            {prevMonthBalanceValue !== 0 && (
                                <tr style={{ background: '#1a2f4a', borderLeft: '3px solid #f59e0b' }}>
                                    <td style={{ padding: '6px 12px', color: '#fbbf24', fontWeight: 700, position: 'sticky', left: 0, background: '#12233a', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', fontSize: 12 }}>
                                        Saldo Mês Anterior
                                    </td>
                                    {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: '#fbbf24', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                            {day === 1 ? formatCurrency(prevMonthBalanceValue) : ''}
                                        </td>
                                    ))}
                                    <td style={{ padding: '5px 12px', textAlign: 'right', color: prevMonthBalanceValue >= 0 ? '#4ade80' : '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                        {formatCurrency(prevMonthBalanceValue)}
                                    </td>
                                </tr>
                            )}

                            {/* ── Saldo Dia Anterior ── */}
                            <tr style={{ background: '#1e3a5f', borderLeft: '3px solid #3b82f6' }}>
                                <td style={{ padding: '6px 12px', color: '#93c5fd', fontWeight: 700, position: 'sticky', left: 0, background: '#162f4d', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', fontSize: 12 }}>
                                    Saldo do Dia Anterior
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const val = saldoDiaAnterior[day] || 0
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#4ade80' : val < 0 ? '#f87171' : '#334155', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                            {val !== 0 ? formatCurrency(val) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '5px 12px', textAlign: 'right', color: '#93c5fd', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>—</td>
                            </tr>

                            {/* ── ENTRADAS header ── */}
                            <tr style={{ background: '#00B050' }}>
                                <td colSpan={pivotByDay.daysInMonth + 2} style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 13, letterSpacing: 1, position: 'sticky', left: 0 }}>
                                    ENTRADAS
                                </td>
                            </tr>
                            {INCOME_LABELS.map((label, idx) => {
                                const rowTotal = Object.values(pivotByDay.data[label] || {}).reduce((a, b) => a + b, 0)
                                if (rowTotal === 0) return null
                                return (
                                    <tr key={label} style={{ background: idx % 2 === 0 ? 'rgba(0,176,80,0.06)' : 'rgba(0,176,80,0.03)', borderLeft: '3px solid #00B050' }}>
                                        <td style={{ padding: '6px 12px', color: '#cbd5e1', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#0d2a1a' : '#0a2016', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis' }}>
                                            {label}
                                        </td>
                                        {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                            const val = (pivotByDay.data[label] || {})[day] || 0
                                            return (
                                                <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#4ade80' : '#334155', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                    {val > 0 ? formatCurrency(val) : ''}
                                                </td>
                                            )
                                        })}
                                        <td style={{ padding: '5px 12px', textAlign: 'right', color: rowTotal > 0 ? '#4ade80' : '#64748b', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                            {rowTotal > 0 ? formatCurrency(rowTotal) : '—'}
                                        </td>
                                    </tr>
                                )
                            })}
                            {/* Total Entradas */}
                            <tr style={{ background: '#00B050' }}>
                                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 12, position: 'sticky', left: 0, background: '#00B050', zIndex: 1 }}>
                                    TOTAL ENTRADAS
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const dayTotal = INCOME_LABELS.reduce((sum, label) => sum + ((pivotByDay.data[label] || {})[day] || 0), 0)
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: dayTotal > 0 ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                            {dayTotal > 0 ? formatCurrency(dayTotal) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                                    {formatCurrency(extratoData.totalEntradas)}
                                </td>
                            </tr>

                            {/* Spacer */}
                            <tr><td colSpan={pivotByDay.daysInMonth + 2} style={{ height: 8, background: '#0d1b2a' }} /></tr>

                            {/* ── SAIDAS header ── */}
                            <tr style={{ background: '#DC2626' }}>
                                <td colSpan={pivotByDay.daysInMonth + 2} style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 13, letterSpacing: 1, position: 'sticky', left: 0 }}>
                                    SAÍDAS
                                </td>
                            </tr>
                            {EXPENSE_SECTIONS.map((section) => {
                                const sectionTotal = extratoData.sectionTotals[section.header] || 0
                                if (sectionTotal === 0) return null
                                const sectionColors: Record<string, string> = {
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
                                const color = sectionColors[section.header] || '#64748b'
                                return (
                                    <React.Fragment key={section.header}>
                                        {/* Section header row */}
                                        <tr style={{ background: `${color}33`, borderLeft: `4px solid ${color}` }}>
                                            <td style={{ padding: '6px 12px', color: '#e2e8f0', fontWeight: 700, position: 'sticky', left: 0, background: `${color}44`, borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 12 }}>
                                                {section.header}
                                            </td>
                                            {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                                const val = (pivotByDay.data[section.header] || {})[day] || 0
                                                return (
                                                    <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#f87171' : '#334155', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                        {val > 0 ? formatCurrency(val) : ''}
                                                    </td>
                                                )
                                            })}
                                            <td style={{ padding: '5px 12px', textAlign: 'right', color: '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                                {formatCurrency(sectionTotal)}
                                            </td>
                                        </tr>
                                        {/* Item sub-rows */}
                                        {section.items.map(item => {
                                            const itemKey = `${section.header}||${item.label}`
                                            const itemTotal = Object.values(pivotByDay.data[itemKey] || {}).reduce((a: number, b: number) => a + b, 0)
                                            if (itemTotal === 0) return null
                                            return (
                                                <tr key={itemKey} style={{ background: `${color}11`, borderLeft: `4px solid ${color}` }}>
                                                    <td style={{ padding: '4px 12px 4px 28px', color: '#94a3b8', position: 'sticky', left: 0, background: `${color}18`, borderRight: '1px solid rgba(255,255,255,0.04)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 11 }}>
                                                        ↳ {item.label}
                                                    </td>
                                                    {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                                        const val = (pivotByDay.data[itemKey] || {})[day] || 0
                                                        return (
                                                            <td key={day} style={{ padding: '4px 4px', textAlign: 'right', color: val > 0 ? '#fca5a5' : '#334155', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.02)', fontSize: 10 }}>
                                                                {val > 0 ? formatCurrency(val) : ''}
                                                            </td>
                                                        )
                                                    })}
                                                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#fca5a5', fontWeight: 500, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.06)', fontSize: 11 }}>
                                                        {formatCurrency(itemTotal)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </React.Fragment>
                                )
                            })}
                            {extratoData.unmatchedTotal > 0 && (
                                <tr style={{ background: 'rgba(100,116,139,0.1)', borderLeft: '3px solid #64748b' }}>
                                    <td style={{ padding: '6px 12px', color: '#94a3b8', position: 'sticky', left: 0, background: '#0d1b2a', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1 }}>
                                        Outras Despesas
                                    </td>
                                    {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                        const val = (pivotByDay.data['Outras Despesas'] || {})[day] || 0
                                        return (
                                            <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#f87171' : '#334155', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                {val > 0 ? formatCurrency(val) : ''}
                                            </td>
                                        )
                                    })}
                                    <td style={{ padding: '5px 12px', textAlign: 'right', color: '#f87171', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                        {formatCurrency(extratoData.unmatchedTotal)}
                                    </td>
                                </tr>
                            )}
                            {/* Total Saidas */}
                            <tr style={{ background: '#DC2626' }}>
                                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 12, position: 'sticky', left: 0, background: '#DC2626', zIndex: 1 }}>
                                    TOTAL SAÍDAS
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const dayTotal = [...EXPENSE_SECTIONS.map(s => s.header), 'Outras Despesas'].reduce((sum, key) => sum + ((pivotByDay.data[key] || {})[day] || 0), 0)
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: dayTotal > 0 ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                            {dayTotal > 0 ? formatCurrency(dayTotal) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                                    {formatCurrency(extratoData.totalSaidas)}
                                </td>
                            </tr>

                            {/* Spacer */}
                            <tr><td colSpan={pivotByDay.daysInMonth + 2} style={{ height: 8, background: '#0d1b2a' }} /></tr>

                            {/* ── RESULTADO ── */}
                            <tr style={{ background: extratoData.resultado >= 0 ? '#065f4630' : '#7f1d1d30', borderLeft: `5px solid ${extratoData.resultado >= 0 ? '#22c55e' : '#ef4444'}` }}>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#e2e8f0', fontSize: 14, position: 'sticky', left: 0, background: extratoData.resultado >= 0 ? '#0a2e1a' : '#2a0a0a', borderRight: '1px solid rgba(255,255,255,0.1)', zIndex: 1 }}>
                                    RESULTADO DO MÊS
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const incomeDay = INCOME_LABELS.reduce((s, l) => s + ((pivotByDay.data[l] || {})[day] || 0), 0)
                                    const expenseDay = [...EXPENSE_SECTIONS.map(s => s.header), 'Outras Despesas'].reduce((s, k) => s + ((pivotByDay.data[k] || {})[day] || 0), 0)
                                    const res = incomeDay - expenseDay
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: res > 0 ? '#4ade80' : res < 0 ? '#f87171' : '#475569', fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                            {res !== 0 ? formatCurrency(res) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: extratoData.resultado >= 0 ? '#4ade80' : '#f87171', borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
                                    {formatCurrency(extratoData.resultado)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>


            {/* ── Tabela Diária ── */}
            <div style={{ marginTop: 24, background: '#0d1b2a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a2744', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                        Lançamentos por Dia — {month.format('MMMM/YYYY')}
                    </span>
                    {selectedDay !== null && (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            Filtrando dia <strong style={{ color: '#60a5fa' }}>{selectedDay}</strong>
                        </span>
                    )}
                </div>
                <div style={{ padding: '0 0 8px' }}>
                    <Table
                        dataSource={[...dfcData].sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''))}
                        rowKey="id"
                        size="small"
                        pagination={{ pageSize: 20, showTotal: (t) => `${t} lançamentos` }}
                        columns={[
                            {
                                title: 'Data',
                                dataIndex: 'due_date',
                                key: 'due_date',
                                width: 100,
                                render: (v: string) => v ? v.substring(8, 10) + '/' + v.substring(5, 7) + '/' + v.substring(0, 4) : '—',
                            },
                            {
                                title: 'Descrição',
                                dataIndex: 'description',
                                key: 'description',
                                render: (t: string) => <span style={{ fontSize: 13 }}>{t?.split(' — ')[0] || t || '—'}</span>,
                            },
                            {
                                title: 'Tipo',
                                dataIndex: 'type',
                                key: 'type',
                                width: 90,
                                render: (v: string) => (
                                    <Tag color={v === 'INCOME' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                                        {v === 'INCOME' ? 'Receita' : 'Despesa'}
                                    </Tag>
                                ),
                            },
                            {
                                title: 'Valor',
                                key: 'valor',
                                width: 130,
                                align: 'right' as const,
                                render: (_: any, r: any) => {
                                    const val = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
                                    return (
                                        <strong style={{ color: r.type === 'INCOME' ? '#4ade80' : '#f87171', fontVariantNumeric: 'tabular-nums' }}>
                                            {r.type === 'INCOME' ? '+' : '-'} {formatCurrency(val)}
                                        </strong>
                                    )
                                },
                            },
                        ]}
                        locale={{ emptyText: 'Nenhum lançamento neste período.' }}
                        style={{ background: 'transparent' }}
                    />
                </div>
            </div>

            {/* Drawer: Novo Lançamento (Despesa) */}
            <Drawer title="Novo Lançamento de Despesa" width={680} open={drawerOpen} onClose={() => { setDrawerOpen(false); setExpPaymentMethod(''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado') }}
                extra={<Button type="primary" onClick={handleSaveEntry}>Salvar</Button>}>
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
                        <Input
                            prefix="R$"
                            placeholder="0,00"
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(currencyMaskFn(e.target.value))}
                        />
                    </Form.Item>
                    <Form.Item name="payment_method" label="Método de Pagamento">
                        <Select
                            placeholder="Selecione o método (opcional)"
                            allowClear
                            options={EXPENSE_PAYMENT_METHODS}
                            onChange={(v) => { setExpPaymentMethod(v || ''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado') }}
                        />
                    </Form.Item>
                    {(expPaymentMethod === 'BOLETO' || expPaymentMethod === 'CHEQUE_PRE_DATADO') ? (
                        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 8 }}>
                                Datas e valores de vencimento
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <Radio.Group
                                    value={expInstallmentPreset}
                                    onChange={(e) => {
                                        const p = e.target.value
                                        setExpInstallmentPreset(p)
                                        setExpInstallments(buildInstallmentsByPreset(p))
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
                        <>
                            <div style={{ marginBottom: 8, color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>Condição de Pagamento</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Form.Item name="parcelas" label="Número de parcelas" initialValue={1}>
                                    <InputNumber min={1} max={120} style={{ width: '100%' }} placeholder="1 = à vista" />
                                </Form.Item>
                                <Form.Item name="expense_start_date" label="Data de início" rules={[{ required: true, message: 'Informe a data de início' }]}>
                                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="DD/MM/AAAA" />
                                </Form.Item>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: -8 }}>
                                1 parcela = à vista. 2+ parcelas = parcelado mensalmente a partir da data de início.
                            </div>
                        </>
                    )}
                </Form>
            </Drawer>

            {/* Modal: Saldo do Mês Anterior */}
            <Modal
                title="Saldo do Mês Anterior"
                open={prevBalanceModalOpen}
                onCancel={() => setPrevBalanceModalOpen(false)}
                onOk={handleSavePrevBalance}
                confirmLoading={loadingPrevBalance}
                okText="Salvar"
                cancelText="Cancelar"
            >
                <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>
                    Informe o saldo do mês anterior. Use valores negativos para saldo negativo.
                    <br />Mês atual: <strong>{month.format('MMMM/YYYY')}</strong>
                </div>
                <InputNumber
                    style={{ width: '100%' }}
                    size="large"
                    step={0.01}
                    precision={2}
                    value={prevBalanceInput}
                    onChange={(v) => setPrevBalanceInput(Number(v) || 0)}
                    formatter={(v) => `R$ ${v}`.replace('.', ',')}
                    parser={(v) => Number((v || '0').replace('R$ ', '').replace(',', '.')) as any}
                    placeholder="Ex: 5000 ou -1500"
                />
                {prevBalanceInput !== 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, color: prevBalanceInput >= 0 ? '#4ade80' : '#f87171' }}>
                        {prevBalanceInput >= 0 ? '✅ Saldo positivo' : '⚠️ Saldo negativo'}: {formatCurrency(Math.abs(prevBalanceInput))}
                    </div>
                )}
            </Modal>

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
