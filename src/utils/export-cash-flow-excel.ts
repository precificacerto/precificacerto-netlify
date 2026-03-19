import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'

const MONTH_NAMES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ── Income row mapping (payment_method → Excel row label) ──
const INCOME_ROWS = [
    { key: 'CARTAO_CREDITO', label: 'CARTAO CREDITO' },
    { key: 'CARTAO_DEBITO', label: 'CARTAO DEBITO' },
    { key: 'CHEQUE', label: 'CHEQUES' },
    { key: 'CHEQUES_A_VISTA', label: 'CHEQUES' },
    { key: 'CHEQUES_PRE_DATADOS', label: 'CHEQUES' },
    { key: 'DINHEIRO', label: 'DINHEIRO' },
    { key: 'PIX', label: 'PIX' },
    { key: 'TRANSFERENCIA', label: 'TRANSFERENCIA' },
    { key: 'BOLETO', label: 'TRANSFERENCIA' },
]

// Unique income labels in display order
const INCOME_LABELS = [
    'CARTAO CREDITO', 'CARTAO DEBITO', 'CHEQUES', 'DINHEIRO', 'PIX', 'TRANSFERENCIA',
]

// ── Expense sections following the Excel template structure ──
interface ExpenseSection {
    header: string
    items: { descMatch: string[]; label: string }[]
}

const EXPENSE_SECTIONS: ExpenseSection[] = [
    {
        header: 'Custo produto',
        items: [
            { descMatch: ['Fornecedores'], label: 'FORNECEDORES' },
            { descMatch: ['Matéria Prima', 'Materia Prima'], label: 'MATERIA PRIMA' },
            { descMatch: ['Embalagens', 'EMBALAGENS'], label: 'EMBALAGENS INDIVIDUAIS' },
            { descMatch: ['Fretes FOB'], label: 'FRETES FOB' },
        ],
    },
    {
        header: 'Custo Mao de obra Producao',
        items: [
            { descMatch: ['Salários Produção', 'Salarios Producao'], label: 'SALARIOS PRODUCAO' },
            { descMatch: ['Décimo Terceiro (Setor Produtivo)'], label: 'DECIMO TERCEIRO' },
            { descMatch: ['Férias Colaboradores (Setor Produtivo)', 'Férias (Setor Produtivo)'], label: 'FERIAS' },
            { descMatch: ['FGTS (Setor Produtivo)'], label: 'FGTS' },
            { descMatch: ['INSS (Setor Produtivo)'], label: 'INSS' },
            { descMatch: ['Plano de Saúde (Setor Produtivo)'], label: 'PLANO DE SAUDE' },
            { descMatch: ['Vale Alimentação (Setor Produtivo)'], label: 'VALE ALIMENTACAO' },
            { descMatch: ['Vale Transporte (Setor Produtivo)'], label: 'VALE TRANSPORTE' },
        ],
    },
    {
        header: 'Despesa Mao de obra Indireta',
        items: [
            { descMatch: ['Pró Labore', 'Pro Labore'], label: 'PRO LABORE' },
            { descMatch: ['Salários Administrativos', 'Salarios Administrativos'], label: 'SALARIOS ADMIN' },
            { descMatch: ['Salários Comerciais', 'Salarios Comerciais'], label: 'SALARIOS COMERCIAIS' },
            { descMatch: ['Décimo Terceiro (Pró-Labo', 'Décimo Terceiro (Pro-Labo'], label: 'DECIMO TERCEIRO' },
            { descMatch: ['Férias Colaboradores (Pró-Labo', 'Férias (Pró-Labo'], label: 'FERIAS' },
            { descMatch: ['FGTS (Pró-Labo'], label: 'FGTS' },
            { descMatch: ['INSS (Pró-Labo'], label: 'INSS' },
            { descMatch: ['Plano de Saúde (Pró-Labo'], label: 'PLANO DE SAUDE' },
            { descMatch: ['Vale Alimentação (Pró-Labo'], label: 'VALE ALIMENTACAO' },
            { descMatch: ['Vale Transporte (Pró-Labo'], label: 'VALE TRANSPORTE' },
        ],
    },
    {
        header: 'Despesas fixas',
        items: [
            { descMatch: ['Água', 'Agua'], label: 'AGUA' },
            { descMatch: ['Aluguel'], label: 'ALUGUEL' },
            { descMatch: ['Aplicações / Consórcios', 'Aplicacoes'], label: 'APLICACOES/CONSORCIOS' },
            { descMatch: ['Consultoria'], label: 'CONSULTORIA' },
            { descMatch: ['Contabilidade'], label: 'CONTABILIDADE' },
            { descMatch: ['Depreciação', 'Depreciacao'], label: 'DEPRECIACAO' },
            { descMatch: ['Empréstimos', 'Emprestimos'], label: 'EMPRESTIMOS' },
            { descMatch: ['Energia Elétrica', 'Energia Eletrica'], label: 'ENERGIA ELETRICA' },
            { descMatch: ['Impostos IPTU', 'IPTU', 'IPVA'], label: 'IMPOSTOS IPTU/IPVA' },
            { descMatch: ['Internet'], label: 'INTERNET' },
            { descMatch: ['Segurança / Monitoramento', 'Seguranca'], label: 'SEGURANCA/MONITORAMENTO' },
            { descMatch: ['Seguros'], label: 'SEGUROS' },
            { descMatch: ['Sistema de Gestão', 'Sistema de Gestao', 'Softwares'], label: 'SISTEMA DE GESTAO/SOFTWARES' },
            { descMatch: ['Telefone'], label: 'TELEFONE' },
            { descMatch: ['Recisões', 'Rescisões', 'Indenizações', 'Indenizacoes'], label: 'RECISOES/INDENIZACOES' },
            { descMatch: ['Saúde Trabalhista', 'Saude Trabalhista', 'Ocupacional'], label: 'SAUDE TRABALHISTA/OCUPACIONAL' },
            { descMatch: ['MEI'], label: 'MEI' },
        ],
    },
    {
        header: 'Despesas variaveis',
        items: [
            { descMatch: ['Comissões de Venda', 'Comissoes'], label: 'COMISSOES DE VENDA' },
            { descMatch: ['Combustíveis', 'Combustiveis'], label: 'COMBUSTIVEIS' },
            { descMatch: ['Correios'], label: 'CORREIOS' },
            { descMatch: ['Departamento Jurídico', 'Departamento Juridico'], label: 'DEPARTAMENTO JURIDICO' },
            { descMatch: ['Embalagens Diversas'], label: 'EMBALAGENS DIVERSAS' },
            { descMatch: ['Fretes (Valores relacionados a entrega', 'Fretes (entrega)'], label: 'FRETES (entrega)' },
            { descMatch: ['Horas Extras'], label: 'HORAS EXTRAS' },
            { descMatch: ['Manutenções', 'Manutencoes'], label: 'MANUTENCOES' },
            { descMatch: ['Marketing'], label: 'MARKETING' },
            { descMatch: ['Pedágios', 'Pedagios'], label: 'PEDAGIOS' },
            { descMatch: ['Terceirizações', 'Tercerizacoes', 'Tercerizações'], label: 'TERCERIZACOES' },
            { descMatch: ['Uso e Consumo'], label: 'USO E CONSUMO' },
            { descMatch: ['Vale Alimentação Tercerizados', 'Vale Alimentação —'], label: 'VALE ALIMENTACAO' },
            { descMatch: ['Viagens'], label: 'VIAGENS' },
        ],
    },
    {
        header: 'Despesas Financeiras',
        items: [
            { descMatch: ['Juros'], label: 'JUROS' },
            { descMatch: ['Taxas Cartão', 'Taxas Cartao'], label: 'TAXAS CARTAO' },
            { descMatch: ['Taxas Bancárias', 'Taxas Bancarias'], label: 'TAXAS BANCARIAS' },
            { descMatch: ['Troca Cheque'], label: 'TROCA CHEQUE' },
        ],
    },
    {
        header: 'Impostos',
        items: [
            { descMatch: ['Imposto DARF', 'DARF'], label: 'DARF' },
            { descMatch: ['Imposto Guia Arrecadação', 'Imposto GA', ' GA'], label: 'GA' },
            { descMatch: ['Imposto GARE', 'GARE'], label: 'GARE' },
            { descMatch: ['Imposto GPS', 'GPS'], label: 'GPS' },
            { descMatch: ['Imposto IOF', 'IOF'], label: 'IOF' },
            { descMatch: ['Imposto ISS', 'Imposto Outros', 'Outros'], label: 'OUTROS' },
        ],
    },
    {
        header: 'Regime Tributario',
        items: [
            { descMatch: ['Imposto DAS', 'DAS', 'Simples Nacional'], label: 'SIMPLES NACIONAL - DAS' },
        ],
    },
    {
        header: 'Lucro',
        items: [
            { descMatch: ['Investimentos'], label: 'INVESTIMENTOS' },
            { descMatch: ['Distribuição de Lucros', 'Distribuicao de Lucros'], label: 'DISTRIBUICAO DE LUCROS' },
        ],
    },
]

function matchesDescription(desc: string, patterns: string[]): boolean {
    if (!desc) return false
    const base = desc.split(' — ')[0].trim()
    return patterns.some(p => base.startsWith(p) || base.includes(p))
}

function getIncomeLabel(entry: { payment_method?: string }): string | null {
    const pm = entry.payment_method
    if (!pm) return null
    const found = INCOME_ROWS.find(r => r.key === pm)
    return found?.label ?? null
}

interface CashEntry {
    id: string
    due_date: string
    description: string
    amount: number
    type: 'INCOME' | 'EXPENSE'
    payment_method?: string
    expense_group?: string
    paid_date?: string | null
    anticipated_amount?: number | null
}

export function exportCashFlowToExcel(data: CashEntry[], monthObj: dayjs.Dayjs): void {
    const wb = XLSX.utils.book_new()
    const daysInMonth = monthObj.daysInMonth()
    const monthName = MONTH_NAMES_PT[monthObj.month()]
    const yearShort = monthObj.format('YY')
    const sheetName = `${monthName} ${yearShort}`

    // Build a grid: rows x columns
    // Column 0 = label, columns 1..daysInMonth = day values, last column = Total
    const totalCols = daysInMonth + 2 // label + days + total

    // Helper to create an empty row
    const emptyRow = (): (string | number)[] => Array(totalCols).fill('')

    // Collect income data by label and day
    const incomeByLabelDay: Record<string, number[]> = {}
    for (const label of INCOME_LABELS) {
        incomeByLabelDay[label] = new Array(daysInMonth).fill(0)
    }

    // Collect expense data by section/item and day
    const expenseByKey: Record<string, number[]> = {}
    for (const section of EXPENSE_SECTIONS) {
        for (const item of section.items) {
            const key = `${section.header}|${item.label}`
            expenseByKey[key] = new Array(daysInMonth).fill(0)
        }
    }

    // Track unmatched expenses
    const unmatchedExpenses: number[] = new Array(daysInMonth).fill(0)

    // Process entries
    for (const entry of data) {
        const day = dayjs(entry.due_date).date()
        const dayIdx = day - 1
        if (dayIdx < 0 || dayIdx >= daysInMonth) continue

        if (entry.type === 'INCOME') {
            // Skip unpaid boletos
            if (entry.payment_method === 'BOLETO' && !entry.paid_date) continue
            const label = getIncomeLabel(entry)
            if (label && incomeByLabelDay[label]) {
                incomeByLabelDay[label][dayIdx] += getEffectiveIncomeAmount(entry)
            }
        } else {
            // EXPENSE - match to section/item
            let matched = false
            for (const section of EXPENSE_SECTIONS) {
                for (const item of section.items) {
                    if (matchesDescription(entry.description, item.descMatch)) {
                        const key = `${section.header}|${item.label}`
                        expenseByKey[key][dayIdx] += Number(entry.amount || 0)
                        matched = true
                        break
                    }
                }
                if (matched) break
            }
            if (!matched) {
                unmatchedExpenses[dayIdx] += Number(entry.amount || 0)
            }
        }
    }

    // ── Build rows ──
    const rows: (string | number)[][] = []

    // Helper: day headers row
    const dayHeaders = emptyRow()
    dayHeaders[0] = ''
    for (let d = 1; d <= daysInMonth; d++) {
        dayHeaders[d] = `Dia ${d}`
    }
    dayHeaders[daysInMonth + 1] = 'Total'

    // Row 1: Opening balance header
    const openingRow = emptyRow()
    openingRow[0] = 'Saldo Inicial (mês anterior)'
    rows.push(openingRow)
    rows.push(emptyRow()) // blank row

    // Row 3: blank
    rows.push(emptyRow())

    // Row 4: Day headers
    rows.push(dayHeaders)

    // Row 5: Recebimentos header
    const recHeader = emptyRow()
    recHeader[0] = 'Recebimentos'
    rows.push(recHeader)

    // Blank after header
    rows.push(emptyRow())

    // Income rows
    let totalIncomeByDay = new Array(daysInMonth).fill(0)
    for (const label of INCOME_LABELS) {
        const row = emptyRow()
        row[0] = label
        let rowTotal = 0
        for (let d = 0; d < daysInMonth; d++) {
            const val = incomeByLabelDay[label][d]
            row[d + 1] = val || ''
            rowTotal += val
            totalIncomeByDay[d] += val
        }
        row[daysInMonth + 1] = rowTotal || ''
        rows.push(row)
    }

    // Blank
    rows.push(emptyRow())

    // Saidas header
    const saidasHeader = emptyRow()
    saidasHeader[0] = 'Saidas'
    rows.push(saidasHeader)

    // Blank
    rows.push(emptyRow())

    // Expense sections
    let totalExpenseByDay = new Array(daysInMonth).fill(0)

    for (const section of EXPENSE_SECTIONS) {
        // Section header
        const secRow = emptyRow()
        secRow[0] = section.header
        rows.push(secRow)

        for (const item of section.items) {
            const key = `${section.header}|${item.label}`
            const dayValues = expenseByKey[key]
            const row = emptyRow()
            row[0] = item.label
            let rowTotal = 0
            for (let d = 0; d < daysInMonth; d++) {
                const val = dayValues[d]
                row[d + 1] = val || ''
                rowTotal += val
                totalExpenseByDay[d] += val
            }
            row[daysInMonth + 1] = rowTotal || ''
            rows.push(row)
        }

        // Blank row after section
        rows.push(emptyRow())
    }

    // Unmatched expenses row (if any)
    const hasUnmatched = unmatchedExpenses.some(v => v > 0)
    if (hasUnmatched) {
        const row = emptyRow()
        row[0] = 'OUTRAS DESPESAS'
        let rowTotal = 0
        for (let d = 0; d < daysInMonth; d++) {
            const val = unmatchedExpenses[d]
            row[d + 1] = val || ''
            rowTotal += val
            totalExpenseByDay[d] += val
        }
        row[daysInMonth + 1] = rowTotal || ''
        rows.push(row)
        rows.push(emptyRow())
    }

    // Daily balance row
    const balanceRow = emptyRow()
    balanceRow[0] = 'SALDO DIARIO'
    let monthlyBalance = 0
    for (let d = 0; d < daysInMonth; d++) {
        const dayBal = totalIncomeByDay[d] - totalExpenseByDay[d]
        balanceRow[d + 1] = dayBal || ''
        monthlyBalance += dayBal
    }
    balanceRow[daysInMonth + 1] = monthlyBalance || ''
    rows.push(balanceRow)

    // Monthly total row
    const totalRow = emptyRow()
    totalRow[0] = 'TOTAL MES'
    const totalIncome = totalIncomeByDay.reduce((a: number, b: number) => a + b, 0)
    const totalExpense = totalExpenseByDay.reduce((a: number, b: number) => a + b, 0)
    totalRow[daysInMonth + 1] = totalIncome - totalExpense
    rows.push(totalRow)

    // ── Create worksheet ──
    const ws = XLSX.utils.aoa_to_sheet(rows)

    // Set column widths
    const colWidths: XLSX.ColInfo[] = [{ wch: 38 }]
    for (let i = 1; i <= daysInMonth; i++) colWidths.push({ wch: 14 })
    colWidths.push({ wch: 16 })
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    // ── Download ──
    const fileName = `Fluxo_de_Caixa_${monthName}_${monthObj.year()}.xlsx`
    XLSX.writeFile(wb, fileName)
}
