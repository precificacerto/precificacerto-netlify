import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, Select, DatePicker, Space, message, Alert,
    Form, Input, InputNumber, Drawer, Modal, Table, Tag, Radio, Popconfirm,
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
    INCOME_LABELS, getIncomeLabel,
} from '@/utils/export-cash-flow-excel'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'
import { getExpenseGroupLabel, getExpenseGroupColor } from '@/constants/cashier-category'

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

// Grupos exclusivos Lucro Real — acrescentados ao final da lista
const LR_CUSTO_PRODUTOS = [
    { category: 'Fornecedores - Produtos para Revenda', group: 'CUSTO_PRODUTOS' },
    { category: 'Matéria Prima - Base dos produtos', group: 'CUSTO_PRODUTOS' },
    { category: 'Embalagens Individuais', group: 'CUSTO_PRODUTOS' },
    { category: 'Fretes FOB (Valores relacionados a compra de suprimentos)', group: 'CUSTO_PRODUTOS' },
]

const LR_IMPOSTOS_COMPRAS = [
    { category: 'IPI custo', group: 'IMPOSTO' },
    { category: 'ICMS DIFAL', group: 'IMPOSTO' },
    { category: 'ICMS-ST (Substituição Tributária)', group: 'IMPOSTO' },
    { category: 'IS (Imposto Seletivo)', group: 'IMPOSTO' },
    { category: 'FCP (Fundo de Combate à Pobreza)', group: 'IMPOSTO' },
]

const LR_IMPOSTOS_RECUPERAVEIS = [
    { category: 'ICMS (recuperável)', group: 'IMPOSTO' },
    { category: 'PIS/COFINS (recuperável)', group: 'IMPOSTO' },
    { category: 'IPI (recuperável)', group: 'IMPOSTO' },
    { category: 'CBS (Contribuição sobre Bens e Serviços)', group: 'IMPOSTO' },
    { category: 'IBS (Imposto sobre Bens e Serviços)', group: 'IMPOSTO' },
]

const EXPENSE_CATEGORY_OPTIONS = [
    { label: '── Mão de Obra Produtiva ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Mão de Obra Administrativa ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Fixas ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Variáveis ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Despesas Financeiras ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
    { label: '── Impostos ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'IMPOSTO').map(c => ({ label: c.category, value: c.category })) },
]

const LR_EXPENSE_CATEGORY_OPTIONS = [
    ...EXPENSE_CATEGORY_OPTIONS,
    { label: '── Custo dos Produtos ──', options: LR_CUSTO_PRODUTOS.map(c => ({ label: c.category, value: c.category })) },
    { label: '── Impostos sobre compras ──', options: LR_IMPOSTOS_COMPRAS.map(c => ({ label: c.category, value: c.category })) },
    { label: '── Impostos Recuperáveis sobre compras ──', options: LR_IMPOSTOS_RECUPERAVEIS.map(c => ({ label: c.category, value: c.category })) },
]

function getGroupForCategory(cat: string): string | undefined {
    return CATEGORY_GROUP_MAP.find(c => c.category === cat)?.group
}

// ── Ordered list of expense groups for display ──
const GROUP_ORDER = [
    'CUSTO_PRODUTOS',
    'MAO_DE_OBRA_PRODUTIVA',
    'MAO_DE_OBRA_ADMINISTRATIVA',
    'MAO_DE_OBRA',
    'DESPESA_FIXA',
    'DESPESA_VARIAVEL',
    'DESPESA_FINANCEIRA',
    'IMPOSTO',
    'REGIME_TRIBUTARIO',
    'ATIVIDADES_TERCEIRIZADAS',
    'COMISSOES',
    'LUCRO',
    'OUTROS',
]

const GROUP_COLORS: Record<string, string> = {
    CUSTO_PRODUTOS:             '#EF4444',
    MAO_DE_OBRA_PRODUTIVA:      '#7C3AED',
    MAO_DE_OBRA_ADMINISTRATIVA: '#A855F7',
    MAO_DE_OBRA:                '#8B5CF6',
    DESPESA_FIXA:               '#2563EB',
    DESPESA_VARIAVEL:           '#059669',
    DESPESA_FINANCEIRA:         '#D97706',
    IMPOSTO:                    '#DC2626',
    REGIME_TRIBUTARIO:          '#B91C1C',
    ATIVIDADES_TERCEIRIZADAS:   '#0891B2',
    COMISSOES:                  '#14B8A6',
    LUCRO:                      '#16A34A',
    OUTROS:                     '#64748b',
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
    { category: 'DAS (Documento de Arrecadação do Simples Nacional)', group: 'REGIME_TRIBUTARIO' },
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

export default function CashFlow() {
    const [data, setData] = useState<any[]>([])
    const { canView, canEdit } = usePermissions()
    const [employees, setEmployees] = useState<any[]>([])
    const [customerMap, setCustomerMap] = useState<Record<string, string>>({})
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

    // Payment modal state
    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [paymentEntry, setPaymentEntry] = useState<any>(null)
    const [paymentDate, setPaymentDate] = useState<dayjs.Dayjs | null>(null)
    const [paymentDueDate, setPaymentDueDate] = useState<dayjs.Dayjs | null>(null)
    const [paymentMethodModal, setPaymentMethodModal] = useState<string>('')
    const [paymentAmount, setPaymentAmount] = useState<number>(0)
    const [savingPayment, setSavingPayment] = useState(false)

    // Selection modal for multiple pending income entries on same day
    const [pendingSelectOpen, setPendingSelectOpen] = useState(false)
    const [pendingSelectEntries, setPendingSelectEntries] = useState<any[]>([])

    // Selection modal for multiple expense entries on same day
    const [expenseSelectOpen, setExpenseSelectOpen] = useState(false)
    const [expenseSelectEntries, setExpenseSelectEntries] = useState<any[]>([])

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
            const [{ data: entries }, { data: emps }, { data: tenantSettings }, { data: custs }] = await Promise.all([
                tenantId
                    ? sbf.from('cash_entries')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .gte('due_date', startOfMonth)
                        .lte('due_date', endOfMonth)
                        .eq('is_active', true)
                        .order('due_date', { ascending: true })
                    : Promise.resolve({ data: [] }),
                tenantId
                    ? sbf.from('employees').select('id, name, salary').eq('tenant_id', tenantId).eq('status', 'ACTIVE').eq('is_active', true)
                    : Promise.resolve({ data: [] }),
                tenantId
                    ? sbf.from('tenant_settings').select('tax_regime').eq('tenant_id', tenantId).maybeSingle()
                    : Promise.resolve({ data: null }),
                tenantId
                    ? sbf.from('customers').select('id, name').eq('tenant_id', tenantId).eq('is_active', true)
                    : Promise.resolve({ data: [] }),
            ])
            setData(entries || [])
            setEmployees(emps || [])
            const cMap: Record<string, string> = {}
            ;(custs || []).forEach((c: any) => { cMap[c.id] = c.name })
            setCustomerMap(cMap)
            if (tenantSettings?.tax_regime) setTaxRegime(tenantSettings.tax_regime)
        } catch {
            messageApi.error('Erro ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [month])

    const isSimples = taxRegime === 'SIMPLES_NACIONAL' || taxRegime === 'MEI'
    const isLucroReal = taxRegime === 'LUCRO_REAL'
    const activeCategoryOptions = isSimples
        ? SN_EXPENSE_CATEGORY_OPTIONS
        : isLucroReal
            ? LR_EXPENSE_CATEGORY_OPTIONS
            : EXPENSE_CATEGORY_OPTIONS
    const activeGroupForCategory = (cat: string) => {
        if (isSimples) return getSNGroupForCategory(cat)
        const lrEntry = [...LR_CUSTO_PRODUTOS, ...LR_IMPOSTOS_COMPRAS, ...LR_IMPOSTOS_RECUPERAVEIS].find(c => c.category === cat)
        if (lrEntry) return lrEntry.group
        return getGroupForCategory(cat)
    }

    const handleOpenPaymentModal = (entry: any) => {
        setPaymentEntry(entry)
        setPaymentDate(entry.paid_date ? dayjs(entry.paid_date + 'T00:00:00') : dayjs())
        setPaymentDueDate(entry.due_date ? dayjs(entry.due_date + 'T00:00:00') : null)
        setPaymentMethodModal(entry.payment_method || '')
        setPaymentAmount(Number(entry.amount) || 0)
        setPaymentModalOpen(true)
    }

    const handleCancelPayment = async () => {
        if (!paymentEntry) return
        setSavingPayment(true)
        try {
            const tenant_id = await getTenantId()
            // For BOLETO/CHEQUE income: preserve payment_method so the entry stays visible as pending (yellow)
            const isBoletoOrChequeIncome = paymentEntry.type === 'INCOME' &&
                (paymentEntry.payment_method === 'BOLETO' || paymentEntry.payment_method === 'CHEQUE_PRE_DATADO')
            const updatePayload: any = { paid_date: null }
            if (!isBoletoOrChequeIncome) updatePayload.payment_method = null
            const { error } = await (supabase as any).from('cash_entries').update(updatePayload)
                .eq('id', paymentEntry.id).eq('tenant_id', tenant_id)
            if (error) throw error
            messageApi.success(paymentEntry.type === 'INCOME' ? 'Recebimento desfeito — voltou para pendente.' : 'Pagamento cancelado — despesa voltou para não paga.')
            setPaymentModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao cancelar pagamento: ' + (err?.message || 'Erro desconhecido'))
        } finally {
            setSavingPayment(false)
        }
    }

    const handleRegisterPayment = async () => {
        if (!paymentEntry) return
        setSavingPayment(true)
        try {
            const tenant_id = await getTenantId()
            const originalDueDate = paymentEntry.due_date
            const newDueDate = paymentDueDate ? paymentDueDate.format('YYYY-MM-DD') : originalDueDate
            const dueDateChanged = newDueDate !== originalDueDate
            const updatePayload: any = {
                paid_date: paymentDate ? paymentDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                payment_method: paymentMethodModal || null,
                amount: paymentAmount > 0 ? paymentAmount : paymentEntry.amount,
            }
            if (dueDateChanged) updatePayload.due_date = newDueDate
            const { error } = await (supabase as any).from('cash_entries').update(updatePayload)
                .eq('id', paymentEntry.id).eq('tenant_id', tenant_id)
            if (error) throw error
            messageApi.success('Pagamento registrado!')
            setPaymentModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao registrar pagamento: ' + (err?.message || 'Erro desconhecido'))
        } finally {
            setSavingPayment(false)
        }
    }

    const handleDeleteFromPaymentModal = async () => {
        if (!paymentEntry) return
        try {
            const res = await fetch('/api/delete/cash-entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: paymentEntry.id }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Erro ao excluir')
            messageApi.success('Lançamento excluído do fluxo!')
            setPaymentModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error(err.message || 'Erro ao excluir lançamento')
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
            const toInsert: any[] = []

            const { data: fixedList } = await supabase
                .from('fixed_expenses')
                .select('id, description, amount, due_day, expense_category, expense_group')
                .eq('tenant_id', tenant_id)
                .eq('is_active', true)
            if (fixedList?.length) {
                for (const fe of fixedList) {
                    const day = Math.min(Math.max(1, fe.due_day), lastDay)
                    const due_date = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const key = `${fe.description}|FIXED_EXPENSE|${Number(fe.amount)}`
                    if (existingKeys.has(key)) continue
                    existingKeys.add(key)
                    toInsert.push({ tenant_id, type: 'EXPENSE', origin_type: 'FIXED_EXPENSE', recurrence_type: 'MONTHLY', description: fe.description, amount: Number(fe.amount), due_date, expense_group: fe.expense_group || 'DESPESA_FIXA', expense_category: fe.expense_category || null })
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
                const exportTenantId = await getTenantId()
                const { data: entries } = await (supabase as any)
                    .from('cash_entries')
                    .select('*')
                    .eq('tenant_id', exportTenantId)
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

    // ── Aviso de ações pendentes para HOJE ──
    const todayStr = dayjs().format('YYYY-MM-DD')
    const todayPendingEntries = useMemo(() => {
        return regularData.filter((e: any) => {
            if (e.due_date !== todayStr) return false
            if (e.type === 'EXPENSE') return !e.paid_date
            if (e.type === 'INCOME') return ((e.payment_method === 'BOLETO' || e.payment_method === 'CHEQUE_PRE_DATADO') || (e as any).is_split_remaining) && !e.paid_date
            return false
        })
    }, [regularData, todayStr])

    // ── Filtered data for DFC (respects day selection from calendar) ──
    const dfcData = useMemo(() => {
        if (selectedDay === null) return regularData
        const dayStr = String(selectedDay).padStart(2, '0')
        return regularData.filter((e: any) => e.due_date && e.due_date.substring(8, 10) === dayStr)
    }, [regularData, selectedDay])

    // ── Extrato structured data (grouped by expense_group) ──
    const extratoData = useMemo(() => {
        // Income by label
        const incomeByLabel: Record<string, number> = {}
        for (const label of INCOME_LABELS) incomeByLabel[label] = 0

        // Expense grouped by expense_group
        const groupTotals: Record<string, number> = {}

        for (const entry of dfcData) {
            if (entry.type === 'INCOME') {
                if (((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') || (entry as any).is_split_remaining) && !entry.paid_date) continue
                const label = getIncomeLabel(entry)
                incomeByLabel[label] = (incomeByLabel[label] || 0) + getEffectiveIncomeAmount(entry)
            } else {
                const group = (entry as any).expense_group || getGroupForCategory(entry.description) || 'OUTROS'
                groupTotals[group] = (groupTotals[group] || 0) + (Number(entry.amount) || 0)
            }
        }

        const totalEntradas = Object.values(incomeByLabel).reduce((a, b) => a + b, 0)
        const totalSaidas = Object.values(groupTotals).reduce((a, b) => a + b, 0)
        const resultado = totalEntradas - totalSaidas

        return { incomeByLabel, groupTotals, totalEntradas, totalSaidas, resultado }
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
                if (((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') || (entry as any).is_split_remaining) && !entry.paid_date) continue
                totals[day] += getEffectiveIncomeAmount(entry)
            } else {
                totals[day] -= Number(entry.amount) || 0
            }
        }
        return { totals, daysInMonth }
    }, [regularData, month])

    // ── Pivot: per-day per-group/description amounts for grid ──
    const pivotByDay = useMemo(() => {
        const daysInMonth = month.daysInMonth()
        const result: Record<string, Record<number, number>> = {}
        const unpaidAmounts: Record<string, Record<number, number>> = {}
        const entriesMap: Record<string, Record<number, any[]>> = {}
        const paidEntriesMap: Record<string, Record<number, any[]>> = {}

        // Initialize income labels
        for (const label of INCOME_LABELS) {
            result[label] = {}; unpaidAmounts[label] = {}; entriesMap[label] = {}; paidEntriesMap[label] = {}
            for (let d = 1; d <= daysInMonth; d++) {
                result[label][d] = 0; unpaidAmounts[label][d] = 0; entriesMap[label][d] = []; paidEntriesMap[label][d] = []
            }
        }

        const ensureKey = (key: string) => {
            if (result[key]) return
            result[key] = {}; unpaidAmounts[key] = {}; entriesMap[key] = {}; paidEntriesMap[key] = {}
            for (let d = 1; d <= daysInMonth; d++) {
                result[key][d] = 0; unpaidAmounts[key][d] = 0; entriesMap[key][d] = []; paidEntriesMap[key][d] = []
            }
        }

        const descsByGroup: Record<string, string[]> = {}

        for (const entry of regularData) {
            if (!entry.due_date) continue
            const day = parseInt(entry.due_date.substring(8, 10), 10)
            if (day < 1 || day > daysInMonth) continue
            if (entry.type === 'INCOME') {
                if (((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') && !entry.paid_date) || ((entry as any).is_split_remaining && !entry.paid_date)) {
                    // Track as pending income (a receber) instead of confirmed income
                    const pendingKey = '__PENDING_INCOME__'
                    if (!result[pendingKey]) {
                        result[pendingKey] = {}; unpaidAmounts[pendingKey] = {}; entriesMap[pendingKey] = {}; paidEntriesMap[pendingKey] = {}
                        for (let d = 1; d <= daysInMonth; d++) {
                            result[pendingKey][d] = 0; unpaidAmounts[pendingKey][d] = 0; entriesMap[pendingKey][d] = []; paidEntriesMap[pendingKey][d] = []
                        }
                    }
                    result[pendingKey][day] = (result[pendingKey][day] || 0) + getEffectiveIncomeAmount(entry)
                    unpaidAmounts[pendingKey][day] = (unpaidAmounts[pendingKey][day] || 0) + getEffectiveIncomeAmount(entry)
                    entriesMap[pendingKey][day] = [...(entriesMap[pendingKey][day] || []), entry]
                    continue
                }
                const label = getIncomeLabel(entry)
                if (!result[label]) {
                    result[label] = {}; unpaidAmounts[label] = {}; entriesMap[label] = {}; paidEntriesMap[label] = {}
                    for (let d = 1; d <= daysInMonth; d++) {
                        result[label][d] = 0; unpaidAmounts[label][d] = 0; entriesMap[label][d] = []; paidEntriesMap[label][d] = []
                    }
                }
                result[label][day] = (result[label][day] || 0) + getEffectiveIncomeAmount(entry)
            } else {
                const amt = Number(entry.amount) || 0
                const group = (entry as any).expense_group || getGroupForCategory(entry.description) || 'OUTROS'
                const rawDesc = entry.description || '—'
                const desc = rawDesc.startsWith('Fornecedores') ? 'Fornecedores' : rawDesc
                const descKey = `${group}||${desc}`

                ensureKey(group)
                ensureKey(descKey)

                if (!descsByGroup[group]) descsByGroup[group] = []
                if (!descsByGroup[group].includes(desc)) descsByGroup[group].push(desc)

                result[group][day] = (result[group][day] || 0) + amt
                result[descKey][day] = (result[descKey][day] || 0) + amt

                if (!entry.paid_date) {
                    unpaidAmounts[group][day] = (unpaidAmounts[group][day] || 0) + amt
                    unpaidAmounts[descKey][day] = (unpaidAmounts[descKey][day] || 0) + amt
                    entriesMap[group][day] = [...(entriesMap[group][day] || []), entry]
                    entriesMap[descKey][day] = [...(entriesMap[descKey][day] || []), entry]
                } else {
                    paidEntriesMap[group][day] = [...(paidEntriesMap[group][day] || []), entry]
                    paidEntriesMap[descKey][day] = [...(paidEntriesMap[descKey][day] || []), entry]
                }
            }
        }

        // Group totals for ordering/filtering
        const groupTotals: Record<string, number> = {}
        for (const group of Object.keys(descsByGroup)) {
            groupTotals[group] = Object.values(result[group] || {}).reduce((a: number, b: number) => a + b, 0)
        }

        return { data: result, daysInMonth, unpaidAmounts, entriesMap, paidEntriesMap, groupTotals, descsByGroup }
    }, [regularData, month])

    // ── Saldo do Mês Anterior (valor fixo inserido pelo usuário) ──
    const prevMonthBalanceValue = useMemo(() => {
        const entry = (data as any[]).find((e) => e.origin_type === 'PREV_MONTH_BALANCE')
        if (!entry) return 0
        return entry.type === 'INCOME' ? Number(entry.amount) : -Number(entry.amount)
    }, [data])

    // ── Saldo acumulado por dia (saldo do dia anterior) ──
    // Receitas: apenas confirmadas (BOLETO/CHEQUE_PRE_DATADO exigem paid_date)
    // Despesas: TODAS contam (lançadas = comprometidas)
    const saldoDiaAnterior = useMemo(() => {
        const result: Record<number, number> = {}
        let running = prevMonthBalanceValue
        for (let d = 1; d <= pivotByDay.daysInMonth; d++) {
            result[d] = running
            const incomeDay = INCOME_LABELS.reduce((s, l) => s + ((pivotByDay.data[l] || {})[d] || 0), 0)
            const expenseDay = GROUP_ORDER.reduce((s, k) => s + ((pivotByDay.data[k] || {})[d] || 0), 0)
            running += incomeDay - expenseDay
        }
        return result
    }, [pivotByDay, prevMonthBalanceValue])

    // ── Saldo Acumulado por dia (saldo ao FINAL de cada dia) ──
    const dailyAccumulatedBalance = useMemo(() => {
        const result: Record<number, number> = {}
        for (let d = 1; d <= pivotByDay.daysInMonth; d++) {
            const incomeDay = INCOME_LABELS.reduce((s, l) => s + ((pivotByDay.data[l] || {})[d] || 0), 0)
            const expenseDay = GROUP_ORDER.reduce((s, k) => s + ((pivotByDay.data[k] || {})[d] || 0), 0)
            result[d] = (saldoDiaAnterior[d] || 0) + incomeDay - expenseDay
        }
        return result
    }, [pivotByDay, saldoDiaAnterior])

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

            {/* ── Aviso de ações pendentes hoje ── */}
            {todayPendingEntries.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={`Você tem ${todayPendingEntries.length} lançamento${todayPendingEntries.length > 1 ? 's' : ''} pendente${todayPendingEntries.length > 1 ? 's' : ''} para hoje (${dayjs().format('DD/MM/YYYY')})`}
                    description={(() => {
                        const expenses = todayPendingEntries.filter((e: any) => e.type === 'EXPENSE')
                        const incomes = todayPendingEntries.filter((e: any) => e.type === 'INCOME')
                        const parts: string[] = []
                        if (expenses.length > 0) parts.push(`${expenses.length} despesa${expenses.length > 1 ? 's' : ''} a pagar`)
                        if (incomes.length > 0) parts.push(`${incomes.length} recebimento${incomes.length > 1 ? 's' : ''} a confirmar`)
                        return `Ações a tomar: ${parts.join(' e ')}. Clique nos valores na tabela para registrar.`
                    })()}
                />
            )}

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
                            {/* Pending income row (Boleto/Cheque a receber) */}
                            {(() => {
                                const pendingKey = '__PENDING_INCOME__'
                                const pendingRowTotal = Object.values(pivotByDay.data[pendingKey] || {}).reduce((a: number, b: number) => a + b, 0)
                                if (pendingRowTotal === 0) return null
                                return (
                                    <tr style={{ background: 'rgba(251,191,36,0.08)', borderLeft: '3px solid #f59e0b' }}>
                                        <td style={{ padding: '6px 12px', color: '#fbbf24', position: 'sticky', left: 0, background: '#1a1500', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 12 }}>
                                            ⏳ A Receber (Boleto/Cheque)
                                        </td>
                                        {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                            const val = (pivotByDay.data[pendingKey] || {})[day] || 0
                                            const cellEntries = (pivotByDay.entriesMap[pendingKey] || {})[day] || []
                                            return (
                                                <td key={day} style={{ padding: '5px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                    {val > 0 && cellEntries.length > 0 ? (
                                                        <span
                                                            onClick={() => {
                                                                if (cellEntries.length === 1) {
                                                                    handleOpenPaymentModal(cellEntries[0])
                                                                } else {
                                                                    setPendingSelectEntries(cellEntries)
                                                                    setPendingSelectOpen(true)
                                                                }
                                                            }}
                                                            style={{ cursor: 'pointer', color: '#fbbf24', borderBottom: '1px dashed rgba(251,191,36,0.6)' }}
                                                            title={cellEntries.length > 1 ? `${cellEntries.length} lançamentos — clique para selecionar` : 'Clique para confirmar recebimento'}
                                                        >
                                                            {formatCurrency(val)}
                                                            {cellEntries.length > 1 && <span style={{ fontSize: 10, marginLeft: 3, background: '#f59e0b', color: '#000', borderRadius: 8, padding: '0 4px' }}>{cellEntries.length}</span>}
                                                        </span>
                                                    ) : val > 0 ? <span style={{ color: '#fbbf24' }}>{formatCurrency(val)}</span> : ''}
                                                </td>
                                            )
                                        })}
                                        <td style={{ padding: '5px 12px', textAlign: 'right', color: '#fbbf24', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                            {formatCurrency(pendingRowTotal)}
                                        </td>
                                    </tr>
                                )
                            })()}
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
                            {GROUP_ORDER.map(group => {
                                const groupTotal = extratoData.groupTotals[group] || 0
                                if (groupTotal === 0) return null
                                const color = GROUP_COLORS[group] || '#64748b'
                                const label = getExpenseGroupLabel(group)
                                const descs = pivotByDay.descsByGroup[group] || []
                                return (
                                    <React.Fragment key={group}>
                                        {/* Group header row */}
                                        <tr style={{ background: `${color}33`, borderLeft: `4px solid ${color}` }}>
                                            <td style={{ padding: '6px 12px', color: '#e2e8f0', fontWeight: 700, position: 'sticky', left: 0, background: `${color}44`, borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 12 }}>
                                                {label}
                                            </td>
                                            {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                                const val = (pivotByDay.data[group] || {})[day] || 0
                                                const hasUnpaid = ((pivotByDay.unpaidAmounts[group] || {})[day] || 0) > 0
                                                const cellEntries = (pivotByDay.entriesMap[group] || {})[day] || []
                                                const paidCellEntries = (pivotByDay.paidEntriesMap[group] || {})[day] || []
                                                const textColor = val > 0 ? (hasUnpaid ? '#f87171' : 'rgba(255,255,255,0.3)') : '#334155'
                                                const activeEntries = hasUnpaid ? cellEntries : paidCellEntries
                                                return (
                                                    <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: textColor, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                        {val > 0 && activeEntries.length > 0 ? (
                                                            <span
                                                                onClick={() => {
                                                                    if (activeEntries.length === 1) {
                                                                        handleOpenPaymentModal(activeEntries[0])
                                                                    } else {
                                                                        setExpenseSelectEntries(activeEntries)
                                                                        setExpenseSelectOpen(true)
                                                                    }
                                                                }}
                                                                style={{ cursor: 'pointer', borderBottom: hasUnpaid ? '1px dashed rgba(248,113,113,0.6)' : '1px dashed rgba(255,255,255,0.2)' }}
                                                                title={activeEntries.length > 1 ? `${activeEntries.length} lançamentos — clique para selecionar` : (hasUnpaid ? 'Clique para registrar pagamento' : 'Pago — clique para editar ou cancelar')}
                                                            >
                                                                {formatCurrency(val)}
                                                                {activeEntries.length > 1 && <span style={{ fontSize: 10, marginLeft: 3, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '0 4px' }}>{activeEntries.length}</span>}
                                                            </span>
                                                        ) : val > 0 ? formatCurrency(val) : ''}
                                                    </td>
                                                )
                                            })}
                                            <td style={{ padding: '5px 12px', textAlign: 'right', color: '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                                {formatCurrency(groupTotal)}
                                            </td>
                                        </tr>
                                        {/* Description sub-rows */}
                                        {descs.map(desc => {
                                            const descKey = `${group}||${desc}`
                                            const descTotal = Object.values(pivotByDay.data[descKey] || {}).reduce((a: number, b: number) => a + b, 0)
                                            if (descTotal === 0) return null
                                            return (
                                                <tr key={descKey} style={{ background: `${color}11`, borderLeft: `4px solid ${color}` }}>
                                                    <td style={{ padding: '4px 12px 4px 28px', color: '#94a3b8', position: 'sticky', left: 0, background: `${color}18`, borderRight: '1px solid rgba(255,255,255,0.04)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 11 }}>
                                                        ↳ {desc}
                                                    </td>
                                                    {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                                        const val = (pivotByDay.data[descKey] || {})[day] || 0
                                                        const hasUnpaid = ((pivotByDay.unpaidAmounts[descKey] || {})[day] || 0) > 0
                                                        const cellEntries = (pivotByDay.entriesMap[descKey] || {})[day] || []
                                                        const paidCellEntries = (pivotByDay.paidEntriesMap[descKey] || {})[day] || []
                                                        const textColor = val > 0 ? (hasUnpaid ? '#fca5a5' : 'rgba(255,255,255,0.3)') : '#334155'
                                                        const activeDescEntries = hasUnpaid ? cellEntries : paidCellEntries
                                                        return (
                                                            <td key={day} style={{ padding: '4px 4px', textAlign: 'right', color: textColor, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.02)', fontSize: 10 }}>
                                                                {val > 0 && activeDescEntries.length > 0 ? (
                                                                    <span
                                                                        onClick={() => {
                                                                            if (activeDescEntries.length === 1) {
                                                                                handleOpenPaymentModal(activeDescEntries[0])
                                                                            } else {
                                                                                setExpenseSelectEntries(activeDescEntries)
                                                                                setExpenseSelectOpen(true)
                                                                            }
                                                                        }}
                                                                        style={{ cursor: 'pointer', borderBottom: hasUnpaid ? '1px dashed rgba(252,165,165,0.6)' : '1px dashed rgba(255,255,255,0.2)' }}
                                                                        title={activeDescEntries.length > 1 ? `${activeDescEntries.length} lançamentos — clique para selecionar` : (hasUnpaid ? 'Clique para registrar pagamento' : 'Pago — clique para editar ou cancelar')}
                                                                    >
                                                                        {formatCurrency(val)}
                                                                        {activeDescEntries.length > 1 && <span style={{ fontSize: 9, marginLeft: 3, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '0 3px' }}>{activeDescEntries.length}</span>}
                                                                    </span>
                                                                ) : val > 0 ? formatCurrency(val) : ''}
                                                            </td>
                                                        )
                                                    })}
                                                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#fca5a5', fontWeight: 500, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.06)', fontSize: 11 }}>
                                                        {formatCurrency(descTotal)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </React.Fragment>
                                )
                            })}
                            {/* Total Saidas */}
                            <tr style={{ background: '#DC2626' }}>
                                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 12, position: 'sticky', left: 0, background: '#DC2626', zIndex: 1 }}>
                                    TOTAL SAÍDAS
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const dayTotal = GROUP_ORDER.reduce((sum, g) => sum + ((pivotByDay.data[g] || {})[day] || 0), 0)
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

                            {/* ── SALDO ACUMULADO ── */}
                            <tr style={{ background: '#1e1b4b', borderLeft: '5px solid #818cf8' }}>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#c7d2fe', fontSize: 13, position: 'sticky', left: 0, background: '#1e1b4b', borderRight: '1px solid rgba(255,255,255,0.1)', zIndex: 1, whiteSpace: 'nowrap' }}>
                                    SALDO ACUMULADO
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const val = dailyAccumulatedBalance[day] ?? 0
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#4ade80' : val < 0 ? '#f87171' : '#475569', fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                            {val !== 0 ? formatCurrency(val) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: (dailyAccumulatedBalance[pivotByDay.daysInMonth] ?? 0) >= 0 ? '#4ade80' : '#f87171', borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
                                    {formatCurrency(dailyAccumulatedBalance[pivotByDay.daysInMonth] ?? 0)}
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
                                title: 'Categoria',
                                dataIndex: 'expense_group',
                                key: 'expense_group',
                                width: 140,
                                render: (v: string, r: any) => {
                                    if (r.type !== 'EXPENSE' || !v) return <span style={{ color: '#475569', fontSize: 11 }}>—</span>
                                    const color = getExpenseGroupColor(v)
                                    return (
                                        <Tag style={{ fontSize: 10, background: color + '22', color, border: `1px solid ${color}55` }}>
                                            {getExpenseGroupLabel(v)}
                                        </Tag>
                                    )
                                },
                            },
                            {
                                title: 'Valor',
                                key: 'valor',
                                width: 130,
                                align: 'right' as const,
                                render: (_: any, r: any) => {
                                    const val = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
                                    if (r.type === 'EXPENSE') {
                                        if (r.paid_date) {
                                            return (
                                                <strong
                                                    onClick={() => handleOpenPaymentModal(r)}
                                                    style={{ color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.15)' }}
                                                    title="Pago — clique para editar ou cancelar pagamento"
                                                >
                                                    - {formatCurrency(val)}
                                                </strong>
                                            )
                                        }
                                        return (
                                            <strong
                                                onClick={() => handleOpenPaymentModal(r)}
                                                style={{ color: '#f87171', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(248,113,113,0.6)' }}
                                                title="Clique para registrar pagamento ou excluir"
                                            >
                                                - {formatCurrency(val)}
                                            </strong>
                                        )
                                    }
                                    const needsConfirmation = r.payment_method === 'BOLETO' || r.payment_method === 'CHEQUE_PRE_DATADO'
                                    if (needsConfirmation) {
                                        if (r.paid_date) {
                                            return (
                                                <strong
                                                    onClick={() => handleOpenPaymentModal(r)}
                                                    style={{ color: 'rgba(74,222,128,0.4)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(74,222,128,0.3)' }}
                                                    title="Recebido — clique para editar ou desfazer confirmação"
                                                >
                                                    + {formatCurrency(val)}
                                                </strong>
                                            )
                                        }
                                        return (
                                            <strong
                                                onClick={() => handleOpenPaymentModal(r)}
                                                style={{ color: '#fbbf24', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(251,191,36,0.6)' }}
                                                title="Aguardando recebimento — clique para confirmar"
                                            >
                                                + {formatCurrency(val)}
                                            </strong>
                                        )
                                    }
                                    return (
                                        <strong style={{ color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>
                                            + {formatCurrency(val)}
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
                            onChange={(e) => {
                                const newVal = currencyMaskFn(e.target.value)
                                setExpenseAmount(newVal)
                                if (expInstallmentPreset !== 'customizado') {
                                    const total = parseCurrencyFn(newVal)
                                    const n = expInstallments.length
                                    const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                                    setExpInstallments(prev => prev.map(inst => ({ ...inst, amount: amt })))
                                }
                            }}
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

            {/* Modal: Registrar / Confirmar Pagamento ou Recebimento */}
            <Modal
                title={
                    paymentEntry?.type === 'INCOME'
                        ? (paymentEntry?.paid_date ? 'Editar Recebimento Confirmado' : 'Confirmar Recebimento')
                        : (paymentEntry?.paid_date ? 'Editar Pagamento Registrado' : 'Registrar Pagamento de Despesa')
                }
                open={paymentModalOpen}
                onCancel={() => setPaymentModalOpen(false)}
                footer={null}
                width={620}
            >
                {paymentEntry && (
                    <div>
                        <div style={{ marginBottom: 16, padding: 14, background: paymentEntry.paid_date ? 'rgba(255,255,255,0.05)' : (paymentEntry.type === 'INCOME' ? 'rgba(251,191,36,0.08)' : 'rgba(240,68,56,0.08)'), border: `1px solid ${paymentEntry.paid_date ? 'rgba(255,255,255,0.15)' : (paymentEntry.type === 'INCOME' ? 'rgba(251,191,36,0.3)' : 'rgba(240,68,56,0.2)')}`, borderRadius: 8 }}>
                            {/* Client and employee info */}
                            {(() => {
                                const clientName = (paymentEntry.customer_id && customerMap[paymentEntry.customer_id]) || (paymentEntry.contact_id && customerMap[paymentEntry.contact_id]) || null
                                const empName = paymentEntry.employee_id ? employees.find((e: any) => e.id === paymentEntry.employee_id)?.name : null
                                if (!clientName && !empName) return null
                                return (
                                    <div style={{ marginBottom: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                        {clientName && <span style={{ fontSize: 12, color: '#94a3b8' }}>👤 Cliente: <strong style={{ color: '#e2e8f0' }}>{clientName}</strong></span>}
                                        {empName && <span style={{ fontSize: 12, color: '#94a3b8' }}>🧑‍💼 Vendedor: <strong style={{ color: '#e2e8f0' }}>{empName}</strong></span>}
                                    </div>
                                )
                            })()}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{paymentEntry.description?.split(' — ')[0]?.split('|')[0]?.replace(/^Serviço:\s*/i, '').replace(/^Venda balcão:\s*/i, '').trim() || paymentEntry.description}</div>
                                {paymentEntry.expense_group && (
                                    <Tag style={{ flexShrink: 0, background: getExpenseGroupColor(paymentEntry.expense_group) + '33', color: getExpenseGroupColor(paymentEntry.expense_group), border: `1px solid ${getExpenseGroupColor(paymentEntry.expense_group)}66`, fontSize: 11 }}>
                                        {getExpenseGroupLabel(paymentEntry.expense_group)}
                                    </Tag>
                                )}
                            </div>
                            {(() => {
                                const desc = paymentEntry.description || ''
                                const segments = desc.split('|').map((s: string) => s.trim()).filter(Boolean)
                                const infoSegments = segments.slice(1) // skip first (service/product name)
                                const afterDash = desc.includes(' — ') ? desc.split(' — ').slice(1).join(' — ') : ''
                                const parsed: { label: string; value: string }[] = []
                                for (const seg of infoSegments) {
                                    const colonIdx = seg.indexOf(':')
                                    if (colonIdx > -1) {
                                        parsed.push({ label: seg.slice(0, colonIdx).trim(), value: seg.slice(colonIdx + 1).trim() })
                                    } else if (seg) {
                                        parsed.push({ label: '', value: seg })
                                    }
                                }
                                if (afterDash && !infoSegments.length) {
                                    parsed.push({ label: '', value: afterDash })
                                }
                                if (!parsed.length) return null
                                return (
                                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {parsed.map((p, i) => (
                                            <div key={i} style={{ fontSize: 12, color: '#94a3b8' }}>
                                                {p.label ? <><span style={{ color: '#64748b' }}>{p.label}:</span> {p.value}</> : p.value}
                                            </div>
                                        ))}
                                    </div>
                                )
                            })()}
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Valor</div>
                                <InputNumber
                                    value={paymentAmount}
                                    onChange={(v) => setPaymentAmount(Number(v) || 0)}
                                    min={0}
                                    precision={2}
                                    decimalSeparator=","
                                    prefix={paymentEntry.type === 'INCOME' ? '+R$' : '-R$'}
                                    style={{ width: '100%', fontWeight: 700, fontSize: 16 }}
                                />
                            </div>
                            {/* Due date: editable for all entry types */}
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Data de vencimento (altere para salvar nova data)</div>
                                <DatePicker
                                    value={paymentDueDate}
                                    onChange={(d) => setPaymentDueDate(d)}
                                    format="DD/MM/YYYY"
                                    style={{ width: '100%' }}
                                    placeholder="Data de vencimento"
                                />
                            </div>
                            {paymentEntry.paid_date && (
                                <div style={{ color: '#4ade80', fontSize: 12, marginTop: 2, fontWeight: 500 }}>
                                    ✓ {paymentEntry.type === 'INCOME' ? 'Recebido em' : 'Pago em'}: {dayjs(paymentEntry.paid_date + 'T00:00:00').format('DD/MM/YYYY')}
                                    {paymentEntry.payment_method ? ` — ${paymentEntry.payment_method}` : ''}
                                </div>
                            )}
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 500, marginBottom: 6 }}>{paymentEntry.type === 'INCOME' ? 'Data de Recebimento' : 'Data de Pagamento'}</div>
                            <DatePicker
                                value={paymentDate}
                                onChange={(d) => setPaymentDate(d)}
                                format="DD/MM/YYYY"
                                style={{ width: '100%' }}
                                placeholder={paymentEntry.type === 'INCOME' ? 'Selecione a data de recebimento' : 'Selecione a data de pagamento'}
                            />
                        </div>
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontWeight: 500, marginBottom: 6 }}>Método de Pagamento</div>
                            <Select
                                value={paymentMethodModal || undefined}
                                onChange={(v) => setPaymentMethodModal(v || '')}
                                allowClear
                                placeholder="Selecione o método (opcional)"
                                options={EXPENSE_PAYMENT_METHODS}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <Popconfirm
                                title="Excluir este lançamento?"
                                description="O valor será removido do fluxo de caixa."
                                onConfirm={handleDeleteFromPaymentModal}
                                okText="Excluir"
                                cancelText="Cancelar"
                                okButtonProps={{ danger: true }}
                            >
                                <Button danger>Excluir</Button>
                            </Popconfirm>
                            {paymentEntry.paid_date && (
                                <Popconfirm
                                    title={paymentEntry.type === 'INCOME' ? 'Desfazer confirmação?' : 'Cancelar pagamento?'}
                                    description={paymentEntry.type === 'INCOME' ? 'O valor voltará para pendente de recebimento (amarelo).' : 'A despesa voltará a aparecer como não paga (vermelha).'}
                                    onConfirm={handleCancelPayment}
                                    okText={paymentEntry.type === 'INCOME' ? 'Desfazer' : 'Cancelar pagamento'}
                                    cancelText="Não"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button loading={savingPayment}>{paymentEntry.type === 'INCOME' ? 'Desfazer Confirmação' : 'Cancelar Pagamento'}</Button>
                                </Popconfirm>
                            )}
                            {/* Save due date button — appears whenever date is changed, for any entry type */}
                            {paymentDueDate && paymentDueDate.format('YYYY-MM-DD') !== paymentEntry.due_date && (
                                <Button
                                    loading={savingPayment}
                                    onClick={async () => {
                                        if (!paymentEntry || !paymentDueDate) return
                                        setSavingPayment(true)
                                        try {
                                            const tenant_id = await getTenantId()
                                            const { error } = await (supabase as any).from('cash_entries').update({
                                                due_date: paymentDueDate.format('YYYY-MM-DD'),
                                            }).eq('id', paymentEntry.id).eq('tenant_id', tenant_id)
                                            if (error) throw error
                                            messageApi.success('Data de vencimento salva!')
                                            setPaymentModalOpen(false)
                                            await fetchData()
                                        } catch (err: any) {
                                            messageApi.error('Erro ao salvar data: ' + (err?.message || ''))
                                        } finally {
                                            setSavingPayment(false)
                                        }
                                    }}
                                >
                                    Salvar Data
                                </Button>
                            )}
                            <Button onClick={() => setPaymentModalOpen(false)}>Fechar</Button>
                            <Button type="primary" loading={savingPayment} onClick={handleRegisterPayment}>
                                {paymentEntry.paid_date ? 'Salvar Edição' : (paymentEntry.type === 'INCOME' ? 'Confirmar Recebimento' : 'Registrar Pagamento')}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal: Selecionar lançamento pendente (múltiplos no mesmo dia) */}
            <Modal
                title="Selecionar lançamento para confirmar"
                open={pendingSelectOpen}
                onCancel={() => setPendingSelectOpen(false)}
                footer={<Button onClick={() => setPendingSelectOpen(false)}>Fechar</Button>}
                width={600}
            >
                <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>
                    Há {pendingSelectEntries.length} lançamentos pendentes neste dia. Selecione qual deseja confirmar:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pendingSelectEntries.map((entry: any, idx: number) => {
                        const clientName = (entry.customer_id && customerMap[entry.customer_id]) || (entry.contact_id && customerMap[entry.contact_id]) || null
                        const empName = entry.employee_id ? employees.find((e: any) => e.id === entry.employee_id)?.name : null
                        const cleanDesc = entry.description?.split('|')[0]?.replace(/^Serviço:\s*/i,'').replace(/^Venda balcão:\s*/i,'').replace(/^Venda orçamento:\s*/i,'').split('—')[0]?.trim() || entry.description || '—'
                        return (
                            <div
                                key={entry.id || idx}
                                onClick={() => { setPendingSelectOpen(false); handleOpenPaymentModal(entry) }}
                                style={{ padding: '10px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, cursor: 'pointer' }}
                            >
                                <div style={{ fontWeight: 600, color: '#fbbf24', fontSize: 14, marginBottom: 4 }}>
                                    {formatCurrency(Number(entry.amount) || 0)}
                                </div>
                                <div style={{ fontSize: 12, color: '#e2e8f0' }}>{cleanDesc}</div>
                                {clientName && <div style={{ fontSize: 11, color: '#94a3b8' }}>Cliente: {clientName}</div>}
                                {empName && <div style={{ fontSize: 11, color: '#94a3b8' }}>Vendedor: {empName}</div>}
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                    Venc: {entry.due_date ? entry.due_date.substring(8,10)+'/'+entry.due_date.substring(5,7)+'/'+entry.due_date.substring(0,4) : '—'}
                                    {entry.payment_method ? ` • ${entry.payment_method}` : ''}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Modal>

            {/* Modal: Selecionar lançamento de despesa (múltiplos no mesmo dia) */}
            <Modal
                title="Selecionar despesa para confirmar"
                open={expenseSelectOpen}
                onCancel={() => setExpenseSelectOpen(false)}
                footer={<Button onClick={() => setExpenseSelectOpen(false)}>Fechar</Button>}
                width={600}
            >
                <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>
                    Há {expenseSelectEntries.length} lançamentos neste dia. Selecione qual deseja confirmar:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {expenseSelectEntries.map((entry: any, idx: number) => {
                        const cleanDesc = entry.description?.split('|')[0]?.trim() || entry.description || '—'
                        const isPaid = entry.paid === true || entry.status === 'paid'
                        return (
                            <div
                                key={entry.id || idx}
                                onClick={() => { setExpenseSelectOpen(false); handleOpenPaymentModal(entry) }}
                                style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: `1px solid ${isPaid ? 'rgba(100,116,139,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, cursor: 'pointer' }}
                            >
                                <div style={{ fontWeight: 600, color: isPaid ? '#94a3b8' : '#f87171', fontSize: 14, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    {formatCurrency(Number(entry.amount) || 0)}
                                    {isPaid && <span style={{ fontSize: 11, background: '#1e293b', color: '#64748b', borderRadius: 4, padding: '1px 6px' }}>Pago</span>}
                                </div>
                                <div style={{ fontSize: 12, color: '#e2e8f0' }}>{cleanDesc}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                    Venc: {entry.due_date ? entry.due_date.substring(8,10)+'/'+entry.due_date.substring(5,7)+'/'+entry.due_date.substring(0,4) : '—'}
                                    {entry.payment_method ? ` • ${entry.payment_method}` : ''}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Modal>

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
