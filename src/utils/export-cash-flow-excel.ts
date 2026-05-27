import ExcelJS from 'exceljs'
import dayjs from 'dayjs'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'
import {
    INCOME_ROWS,
    INCOME_LABELS,
    EXPENSE_SECTIONS,
    matchesDescription,
    getIncomeLabel,
} from '@/utils/cash-flow-types'
import type { ExpenseSection } from '@/utils/cash-flow-types'

// Re-export types/helpers leves para retrocompatibilidade com callers antigos
// (Commit 0 / Onda 3): callers serão migrados gradualmente pra importar direto
// de `@/utils/cash-flow-types`. Re-exports aqui não causam bundle bloat porque
// o bundler faz tree-shaking de re-exports puros.
export { INCOME_ROWS, INCOME_LABELS, EXPENSE_SECTIONS, matchesDescription, getIncomeLabel }
export type { ExpenseSection }

const MONTH_NAMES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

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
