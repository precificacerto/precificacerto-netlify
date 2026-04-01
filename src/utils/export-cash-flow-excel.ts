import ExcelJS from 'exceljs'
import dayjs from 'dayjs'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'

const MONTH_NAMES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ── Income row mapping (payment_method OR category → Excel row label) ──
export const INCOME_ROWS = [
    { key: 'CARTAO_CREDITO', label: 'CARTAO CREDITO' },
    { key: 'CARTAO_DEBITO', label: 'CARTAO DEBITO' },
    { key: 'CHEQUE', label: 'CHEQUES' },
    { key: 'CHEQUE_PRE_DATADO', label: 'CHEQUES' },
    { key: 'CHEQUES_A_VISTA', label: 'CHEQUES' },
    { key: 'CHEQUES_PRE_DATADOS', label: 'CHEQUES' },
    { key: 'DINHEIRO', label: 'DINHEIRO' },
    { key: 'PIX', label: 'PIX' },
    { key: 'TRANSFERENCIA', label: 'TRANSFERENCIA' },
    { key: 'TRANSFERENCIA_BANCARIA', label: 'TRANSFERENCIA' },
    { key: 'BOLETO', label: 'TRANSFERENCIA' },
    { key: 'PERMUTA', label: 'OUTRAS ENTRADAS' },
]

// Unique income labels in display order
// NOTE: 'OUTRAS ENTRADAS' is used (not 'OUTROS') to avoid key collision with expense group 'OUTROS' in pivotByDay
export const INCOME_LABELS = [
    'CARTAO CREDITO', 'CARTAO DEBITO', 'CHEQUES', 'DINHEIRO', 'PIX', 'TRANSFERENCIA', 'OUTRAS ENTRADAS',
]

// ── Expense sections following the Excel template structure ──
export interface ExpenseSection {
    header: string
    items: { descMatch: string[]; label: string }[]
}

export const EXPENSE_SECTIONS: ExpenseSection[] = [
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
            { descMatch: ['Imposto Guia Arrecadação', 'Imposto GA'], label: 'GA' },
            { descMatch: ['Imposto GARE', 'GARE'], label: 'GARE' },
            { descMatch: ['Imposto GPS'], label: 'GPS' },
            { descMatch: ['Imposto IOF'], label: 'IOF' },
            { descMatch: ['Imposto ISS', 'Imposto Outros'], label: 'OUTROS' },
        ],
    },
    {
        header: 'Regime Tributario',
        items: [
            { descMatch: ['Imposto DAS', 'Simples Nacional'], label: 'SIMPLES NACIONAL - DAS' },
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

export function matchesDescription(desc: string, patterns: string[]): boolean {
    if (!desc) return false
    const base = desc.split(' — ')[0].trim()
    return patterns.some(p => {
        const pt = p.trim()
        // For short patterns (<=4 chars), only match start to avoid false positives
        if (pt.length <= 4) return base.startsWith(pt)
        return base.startsWith(pt) || base.includes(pt)
    })
}

export function getIncomeLabel(entry: { payment_method?: string | null; category?: string | null }): string {
    // Try payment_method first, then category (entries from caixa store category, not payment_method)
    const key = entry.payment_method || entry.category || ''
    const found = INCOME_ROWS.find(r => r.key === key)
    return found?.label ?? 'OUTRAS ENTRADAS'
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

// ── Style constants ──
const FONT_DEFAULT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10 }
const FONT_BOLD: Partial<ExcelJS.Font> = { ...FONT_DEFAULT, bold: true }
const FONT_HEADER_WHITE: Partial<ExcelJS.Font> = { ...FONT_DEFAULT, bold: true, color: { argb: 'FFFFFFFF' } }

const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
}

const NUMBER_FORMAT = '#,##0.00'

const FILL_GREEN: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } }
const FILL_LIGHT_GREEN: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
const FILL_RED: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }
const FILL_ORANGE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF3300' } }
const FILL_LIGHT_ORANGE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4CC' } }
const FILL_BLUE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
const FILL_DARK_BLUE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
const FILL_GRAY: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } }

type RowStyle = 'recebimentos_header' | 'income_item' | 'saidas_header' | 'expense_section_header'
    | 'expense_item' | 'total_receber' | 'total_pagar' | 'saldo_diario' | 'total_mes'
    | 'day_header' | 'opening' | 'none'

function applyRowStyle(row: ExcelJS.Row, style: RowStyle, colCount: number): void {
    for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c)
        cell.font = { ...FONT_DEFAULT }
        cell.border = { ...THIN_BORDER }
        if (c > 1) {
            cell.numFmt = NUMBER_FORMAT
            cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else {
            cell.alignment = { vertical: 'middle' }
        }
    }

    switch (style) {
        case 'recebimentos_header':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_GREEN }
                cell.font = { ...FONT_HEADER_WHITE }
            }
            break
        case 'income_item':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_LIGHT_GREEN }
                cell.font = c === 1 ? { ...FONT_DEFAULT } : { ...FONT_DEFAULT }
            }
            break
        case 'saidas_header':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_RED }
                cell.font = { ...FONT_HEADER_WHITE }
            }
            break
        case 'expense_section_header':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_ORANGE }
                cell.font = { ...FONT_HEADER_WHITE }
            }
            break
        case 'expense_item':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_LIGHT_ORANGE }
                cell.font = { ...FONT_DEFAULT }
            }
            break
        case 'total_receber':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_GREEN }
                cell.font = { ...FONT_HEADER_WHITE }
            }
            break
        case 'total_pagar':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_RED }
                cell.font = { ...FONT_HEADER_WHITE }
            }
            break
        case 'saldo_diario':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_BLUE }
                cell.font = { ...FONT_HEADER_WHITE }
            }
            break
        case 'total_mes':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_DARK_BLUE }
                cell.font = { ...FONT_HEADER_WHITE }
            }
            break
        case 'day_header':
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c)
                cell.fill = { ...FILL_GRAY }
                cell.font = { ...FONT_BOLD }
                cell.alignment = { horizontal: 'center', vertical: 'middle' }
                cell.border = {
                    ...THIN_BORDER,
                    bottom: { style: 'medium' },
                }
            }
            break
        case 'opening':
            row.getCell(1).font = { ...FONT_BOLD }
            break
        case 'none':
        default:
            break
    }
}

function buildMonthSheet(workbook: ExcelJS.Workbook, data: CashEntry[], monthObj: dayjs.Dayjs): void {
    const daysInMonth = monthObj.daysInMonth()
    const monthName = MONTH_NAMES_PT[monthObj.month()]
    const yearShort = monthObj.format('YY')
    const sheetName = `${monthName} ${yearShort}`

    const ws = workbook.addWorksheet(sheetName)

    // Total columns: 1 (label) + daysInMonth (day cols) + 1 (total)
    const totalCols = daysInMonth + 2

    // ── Set column widths ──
    const columns: Partial<ExcelJS.Column>[] = [{ width: 40, key: 'label' }]
    for (let d = 1; d <= daysInMonth; d++) {
        columns.push({ width: 14, key: `day${d}` })
    }
    columns.push({ width: 18, key: 'total' })
    ws.columns = columns

    // ── Collect income data by label and day ──
    const incomeByLabelDay: Record<string, number[]> = {}
    for (const label of INCOME_LABELS) {
        incomeByLabelDay[label] = new Array(daysInMonth).fill(0)
    }

    // ── Collect expense data by section/item and day ──
    const expenseByKey: Record<string, number[]> = {}
    for (const section of EXPENSE_SECTIONS) {
        for (const item of section.items) {
            const key = `${section.header}|${item.label}`
            expenseByKey[key] = new Array(daysInMonth).fill(0)
        }
    }

    // Track unmatched expenses
    const unmatchedExpenses: number[] = new Array(daysInMonth).fill(0)

    // ── Process entries ──
    for (const entry of data) {
        const day = dayjs(entry.due_date + 'T00:00:00').date()
        const dayIdx = day - 1
        if (dayIdx < 0 || dayIdx >= daysInMonth) continue

        if (entry.type === 'INCOME') {
            // Skip unpaid boletos
            if (entry.payment_method === 'BOLETO' && !entry.paid_date) continue
            const label = getIncomeLabel(entry)
            if (!incomeByLabelDay[label]) incomeByLabelDay[label] = new Array(daysInMonth).fill(0)
            incomeByLabelDay[label][dayIdx] += getEffectiveIncomeAmount(entry)
        } else {
            // EXPENSE - match to section/item
            let matched = false
            for (const section of EXPENSE_SECTIONS) {
                for (const item of section.items) {
                    if (matchesDescription(entry.description, item.descMatch)) {
                        const key = `${section.header}|${item.label}`
                        expenseByKey[key][dayIdx] += Number(entry.amount) || 0
                        matched = true
                        break
                    }
                }
                if (matched) break
            }
            if (!matched) {
                unmatchedExpenses[dayIdx] += Number(entry.amount) || 0
            }
        }
    }

    // ── Helper: build row values array (label + day values + total) ──
    function buildDataRow(label: string, dayValues: number[]): (string | number | null)[] {
        const values: (string | number | null)[] = [label]
        let rowTotal = 0
        for (let d = 0; d < daysInMonth; d++) {
            const val = dayValues[d]
            values.push(val !== 0 ? val : null)
            rowTotal += val
        }
        values.push(rowTotal !== 0 ? rowTotal : null)
        return values
    }

    function addStyledRow(values: (string | number | null)[], style: RowStyle, height?: number): ExcelJS.Row {
        const row = ws.addRow(values)
        applyRowStyle(row, style, totalCols)
        if (height) row.height = height
        return row
    }

    // ── Row 1: Opening balance with "Saldo dia anterior" headers ──
    const openingValues: (string | number | null)[] = ['Total saldo inicial (mês anterior)']
    for (let d = 1; d <= daysInMonth; d++) openingValues.push('Saldo dia anterior' as any)
    openingValues.push(null)
    const openingRow = addStyledRow(openingValues, 'opening', 22)
    // Style opening row cells
    for (let c = 2; c <= daysInMonth + 1; c++) {
        const cell = openingRow.getCell(c)
        cell.font = { ...FONT_DEFAULT, size: 8, color: { argb: 'FF666666' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.numFmt = '@' // text format
    }

    // ── Blank row ──
    ws.addRow([])

    // ── Blank row ──
    ws.addRow([])

    // ── Day headers row ──
    const dayHeaderValues: (string | null)[] = ['']
    for (let d = 1; d <= daysInMonth; d++) {
        dayHeaderValues.push(`Dia ${d}`)
    }
    dayHeaderValues.push('Total')
    addStyledRow(dayHeaderValues, 'day_header', 22)

    // ── Recebimentos header ──
    const recValues: (string | null)[] = ['Recebimentos']
    for (let i = 0; i < daysInMonth + 1; i++) recValues.push(null)
    addStyledRow(recValues, 'recebimentos_header', 22)

    // ── Blank after header ──
    ws.addRow([])

    // ── Income rows ──
    const totalIncomeByDay = new Array(daysInMonth).fill(0)
    for (const label of INCOME_LABELS) {
        const dayValues = incomeByLabelDay[label]
        for (let d = 0; d < daysInMonth; d++) {
            totalIncomeByDay[d] += dayValues[d]
        }
        addStyledRow(buildDataRow(label, dayValues), 'income_item', 18)
    }

    // ── Total a receber dia ──
    addStyledRow(buildDataRow('Total a receber dia', totalIncomeByDay), 'total_receber', 22)

    // ── Total a receber mes ──
    const totalIncomeMonth = totalIncomeByDay.reduce((a: number, b: number) => a + b, 0)
    const totalReceberMesValues: (string | number | null)[] = ['Total a receber mes']
    for (let i = 0; i < daysInMonth; i++) totalReceberMesValues.push(null)
    totalReceberMesValues.push(totalIncomeMonth !== 0 ? totalIncomeMonth : null)
    addStyledRow(totalReceberMesValues, 'total_receber', 22)

    // ── Blank ──
    ws.addRow([])

    // ── Saidas header ──
    const saidasValues: (string | null)[] = ['Saidas']
    for (let i = 0; i < daysInMonth + 1; i++) saidasValues.push(null)
    addStyledRow(saidasValues, 'saidas_header', 22)

    // ── Blank ──
    ws.addRow([])

    // ── Expense sections ──
    const totalExpenseByDay = new Array(daysInMonth).fill(0)

    for (const section of EXPENSE_SECTIONS) {
        // Section header
        const secHeaderValues: (string | null)[] = [section.header]
        for (let i = 0; i < daysInMonth + 1; i++) secHeaderValues.push(null)
        addStyledRow(secHeaderValues, 'expense_section_header', 22)

        for (const item of section.items) {
            const key = `${section.header}|${item.label}`
            const dayValues = expenseByKey[key]
            for (let d = 0; d < daysInMonth; d++) {
                totalExpenseByDay[d] += dayValues[d]
            }
            addStyledRow(buildDataRow(item.label, dayValues), 'expense_item', 18)
        }

        // Blank row after section
        ws.addRow([])
    }

    // ── Unmatched expenses (if any) ──
    const hasUnmatched = unmatchedExpenses.some(v => v > 0)
    if (hasUnmatched) {
        for (let d = 0; d < daysInMonth; d++) {
            totalExpenseByDay[d] += unmatchedExpenses[d]
        }
        addStyledRow(buildDataRow('OUTRAS DESPESAS', unmatchedExpenses), 'expense_item', 18)
        ws.addRow([])
    }

    // ── Total a pagar dia ──
    addStyledRow(buildDataRow('Total a pagar dia', totalExpenseByDay), 'total_pagar', 22)

    // ── Total a pagar mes ──
    const totalExpenseMonth = totalExpenseByDay.reduce((a: number, b: number) => a + b, 0)
    const totalPagarMesValues: (string | number | null)[] = ['Total a pagar mes']
    for (let i = 0; i < daysInMonth; i++) totalPagarMesValues.push(null)
    totalPagarMesValues.push(totalExpenseMonth !== 0 ? totalExpenseMonth : null)
    addStyledRow(totalPagarMesValues, 'total_pagar', 22)

    // ── Blank ──
    ws.addRow([])

    // ── SALDO DIARIO row ──
    const balanceDayValues = new Array(daysInMonth).fill(0)
    for (let d = 0; d < daysInMonth; d++) {
        balanceDayValues[d] = totalIncomeByDay[d] - totalExpenseByDay[d]
    }
    addStyledRow(buildDataRow('SALDO DIARIO', balanceDayValues), 'saldo_diario', 22)

    // ── TOTAL MES row ──
    const monthlyBalance = totalIncomeMonth - totalExpenseMonth
    const totalMesValues: (string | number | null)[] = ['TOTAL MES']
    for (let i = 0; i < daysInMonth; i++) totalMesValues.push(null)
    totalMesValues.push(monthlyBalance)
    addStyledRow(totalMesValues, 'total_mes', 22)

}

// ── Single-month export (backwards compatible) ──
export async function exportCashFlowToExcel(data: CashEntry[], monthObj: dayjs.Dayjs): Promise<void> {
    const workbook = new ExcelJS.Workbook()
    buildMonthSheet(workbook, data, monthObj)

    const monthName = MONTH_NAMES_PT[monthObj.month()]
    const fileName = `Fluxo_de_Caixa_${monthName}_${monthObj.year()}.xlsx`
    await downloadWorkbook(workbook, fileName)
}

// ── Multi-month export (one tab per month) ──
export async function exportCashFlowMultiMonth(
    months: { data: CashEntry[]; month: dayjs.Dayjs }[],
): Promise<void> {
    const workbook = new ExcelJS.Workbook()

    for (const { data, month } of months) {
        buildMonthSheet(workbook, data, month)
    }

    const first = months[0].month
    const last = months[months.length - 1].month
    const fileName = `Fluxo_de_Caixa_${MONTH_NAMES_PT[first.month()]}_a_${MONTH_NAMES_PT[last.month()]}_${last.year()}.xlsx`
    await downloadWorkbook(workbook, fileName)
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
}
