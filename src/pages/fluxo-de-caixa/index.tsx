import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Select, DatePicker, Space, message,
    Form, Input, InputNumber, Drawer, Alert, Modal,
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
    EXPENSE_GROUP_OPTIONS,
} from '@/constants/cashier-category'

import {
    exportCashFlowToExcel, exportCashFlowMultiMonth,
    INCOME_LABELS, EXPENSE_SECTIONS, matchesDescription, getIncomeLabel,
} from '@/utils/export-cash-flow-excel'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'

function formatCurrency(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

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

export default function CashFlow() {
    const [data, setData] = useState<any[]>([])
    const { canView, canEdit } = usePermissions()
    const [employees, setEmployees] = useState<any[]>([])
    const [taxRegime, setTaxRegime] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [month, setMonth] = useState(dayjs())

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerType, setDrawerType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
    const [expenseAmount, setExpenseAmount] = useState('')

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

    const isSimples = taxRegime === 'SIMPLES_NACIONAL'
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

    if (!canView(MODULES.CASH_FLOW)) {
        return <Layout title={PAGE_TITLES.CASH_FLOW}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

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
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setExpenseAmount(''); setDrawerType('EXPENSE'); setDrawerOpen(true) }}>
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

            {/* ── DFC Report ── */}
            <div style={{ background: '#0d1b2a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a2744' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                        Fluxo de Caixa — Extrato
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
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 20px', background: `${color}cc`,
                            }}>
                                <span style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{section.header}</span>
                                <span style={{ fontWeight: 700, color: '#fff', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                                    {sectionTotal > 0 ? formatCurrency(sectionTotal) : '—'}
                                </span>
                            </div>
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
