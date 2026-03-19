import ExcelJS from 'exceljs'

// ── Types (mirrored from dfc/index.tsx) ──

type MonthlyValues = {
  jan: number; feb: number; mar: number; apr: number; may: number; jun: number
  jul: number; aug: number; sep: number; oct: number; nov: number; dec: number
}

type DreRow = {
  key: string
  label: string
  values: MonthlyValues
  total: number
  isHeader?: boolean
  isTotal?: boolean
  isSubtotal?: boolean
  indent?: number
  sign?: '+' | '-' | '='
  pctOfRL?: MonthlyValues & { total: number }
}

const MONTH_KEYS: (keyof MonthlyValues)[] = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_HEADERS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ── Colors (matching regime tables style) ──
const COLOR_HEADER_BG = 'FF006666'       // Teal - header row
const COLOR_HEADER_FONT = 'FFFFFFFF'     // White text on headers
const COLOR_REVENUE_BG = 'FF00B050'      // Green for receita bruta
const COLOR_REVENUE_LIGHT = 'FFE2EFDA'   // Light green for receita liquida
const COLOR_EXPENSE_BG = 'FFFCE4EC'      // Light red for expense rows
const COLOR_CMV_BG = 'FF006666'          // Teal for CMV header
const COLOR_MO_DIRETA_BG = 'FF00FFFF'    // Cyan for MO direta
const COLOR_MO_INDIRETA_BG = 'FF7030A0'  // Purple for MO indireta
const COLOR_COMISSAO_BG = 'FFC00000'     // Dark red for comissões
const COLOR_SUBTOTAL_BG = 'FFFFC000'     // Gold for subtotals
const COLOR_PROFIT_BG = 'FF00B050'       // Dark green for Lucro Liquido
const COLOR_DESP_FIXA_BG = 'FFE8F0FE'   // Light blue for desp fixa
const COLOR_DESP_FINANCEIRA_BG = 'FFFFF3E0' // Light orange for desp financeira
const COLOR_DAS_BG = 'FFDCEDC8'          // Light green for DAS
const COLOR_WHITE = 'FFFFFFFF'
const COLOR_BLACK = 'FF000000'

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF999999' } },
  bottom: { style: 'thin', color: { argb: 'FF999999' } },
  left: { style: 'thin', color: { argb: 'FF999999' } },
  right: { style: 'thin', color: { argb: 'FF999999' } },
}

// ── Helpers ──

function applyBorders(cell: ExcelJS.Cell): void {
  cell.border = { ...THIN_BORDER }
}

function setFill(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function getRegimeLabel(taxRegime: string): string {
  switch (taxRegime) {
    case 'LUCRO_REAL': return 'Lucro Real'
    case 'LUCRO_PRESUMIDO': return 'Lucro Presumido'
    case 'PRESUMIDO_RET': return 'Presumido RET'
    case 'SIMPLES_NACIONAL': return 'Simples Nacional'
    case 'SIMPLES_HIBRIDO': return 'Simples Hibrido'
    case 'MEI': return 'MEI'
    default: return taxRegime || 'Nao definido'
  }
}

function getCalcTypeLabel(calcType: string): string {
  switch (calcType) {
    case 'INDUSTRIALIZATION': return 'Industrializacao'
    case 'RESALE': return 'Revenda'
    case 'SERVICE': return 'Servico'
    default: return calcType || ''
  }
}

function getRowColor(row: DreRow): { bg: string | null; fontColor: string; bold: boolean } {
  // Lucro Liquido (final)
  if (row.key === 'lucro_liquido' && row.isTotal) {
    return { bg: COLOR_PROFIT_BG, fontColor: COLOR_WHITE, bold: true }
  }
  // Subtotals (Receita Liquida, Lucro Bruto, Lucro Operacional, Resultado Financeiro)
  if (row.isSubtotal || (row.sign === '=' && !row.isTotal)) {
    return { bg: COLOR_SUBTOTAL_BG, fontColor: COLOR_BLACK, bold: true }
  }
  // Receita Bruta (header)
  if (row.key === 'receita_bruta') {
    return { bg: COLOR_REVENUE_BG, fontColor: COLOR_WHITE, bold: true }
  }
  // MO Direta
  if (row.key === 'cmv_mo_direta' || row.key === 'cmv_mo_direta') {
    return { bg: COLOR_MO_DIRETA_BG, fontColor: COLOR_BLACK, bold: false }
  }
  // MO Indireta
  if (row.key === 'desp_mo_indireta') {
    return { bg: COLOR_MO_INDIRETA_BG, fontColor: COLOR_WHITE, bold: false }
  }
  // Comissões
  if (row.key === 'desp_comissoes') {
    return { bg: COLOR_COMISSAO_BG, fontColor: COLOR_WHITE, bold: false }
  }
  // CMV header
  if (row.key === 'cmv_header' || row.key === 'cmv') {
    return { bg: COLOR_CMV_BG, fontColor: COLOR_WHITE, bold: true }
  }
  // Despesas Operacionais header
  if (row.key === 'desp_op_header' || row.key === 'desp_op') {
    return { bg: COLOR_CMV_BG, fontColor: COLOR_WHITE, bold: true }
  }
  // DAS
  if (row.key === 'das') {
    return { bg: COLOR_DAS_BG, fontColor: COLOR_BLACK, bold: true }
  }
  // Despesa Fixa
  if (row.key === 'desp_fixa') {
    return { bg: COLOR_DESP_FIXA_BG, fontColor: COLOR_BLACK, bold: false }
  }
  // Despesas Financeiras
  if (row.key === 'desp_financeira') {
    return { bg: COLOR_DESP_FINANCEIRA_BG, fontColor: COLOR_BLACK, bold: true }
  }
  // Impostos sobre lucro
  if (row.key === 'impostos_lucro') {
    return { bg: COLOR_EXPENSE_BG, fontColor: COLOR_BLACK, bold: true }
  }
  // Deduções tributárias
  if (row.sign === '-' && (row.key.includes('deducoes') || row.key.includes('ret_'))) {
    return { bg: COLOR_EXPENSE_BG, fontColor: COLOR_BLACK, bold: row.indent === undefined || row.indent === 0 }
  }
  // Other expense rows
  if (row.sign === '-') {
    return { bg: COLOR_EXPENSE_BG, fontColor: COLOR_BLACK, bold: true }
  }
  // Indented detail rows
  if (row.indent && row.indent >= 2) {
    return { bg: null, fontColor: COLOR_BLACK, bold: false }
  }
  return { bg: null, fontColor: COLOR_BLACK, bold: false }
}

// ── Main export function ──

export async function exportDfcToExcel(
  dreRows: DreRow[],
  year: number,
  taxRegime: string,
  calcType: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Precifica Certo'
  workbook.created = new Date()

  const ws = workbook.addWorksheet('DRE', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }],
  })

  // ── Column definitions ──
  const columns: Partial<ExcelJS.Column>[] = [
    { key: 'label', width: 50 },
    ...MONTH_HEADERS.map((m) => ({ key: m.toLowerCase(), width: 15 })),
    { key: 'total', width: 18 },
    { key: 'pct', width: 12 },
  ]
  ws.columns = columns

  // ── Row 1: Title ──
  const titleRow = ws.addRow([
    `DRE - Demonstrativo de Resultado do Exercicio - ${year}`,
  ])
  titleRow.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR_WHITE } }
  titleRow.height = 30
  ws.mergeCells(1, 1, 1, 15)
  const titleCell = titleRow.getCell(1)
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  setFill(titleCell, COLOR_HEADER_BG)
  for (let c = 1; c <= 15; c++) applyBorders(titleRow.getCell(c))

  // ── Row 2: Subtitle ──
  const subtitleRow = ws.addRow([
    `Regime: ${getRegimeLabel(taxRegime)} | Tipo: ${getCalcTypeLabel(calcType)}`,
  ])
  subtitleRow.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF333333' } }
  subtitleRow.height = 24
  ws.mergeCells(2, 1, 2, 15)
  const subCell = subtitleRow.getCell(1)
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  setFill(subCell, 'FFE8E8E8')
  for (let c = 1; c <= 15; c++) applyBorders(subtitleRow.getCell(c))

  // ── Row 3: Blank separator ──
  ws.addRow([])

  // ── Row 4: Header row ──
  const headerValues = ['Descrição', ...MONTH_HEADERS, 'Total', '% RL']
  const headerRow = ws.addRow(headerValues)
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_WHITE } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 24

  for (let c = 1; c <= 15; c++) {
    const cell = headerRow.getCell(c)
    setFill(cell, COLOR_HEADER_BG)
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF004444' } },
      bottom: { style: 'medium', color: { argb: 'FF004444' } },
      left: { style: 'thin', color: { argb: 'FF004444' } },
      right: { style: 'thin', color: { argb: 'FF004444' } },
    }
  }
  headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

  // ── Data rows ──
  for (const row of dreRows) {
    const monthValues = MONTH_KEYS.map((k) => row.values[k])
    const pctValue = row.pctOfRL ? row.pctOfRL.total / 100 : 0
    const rowValues = [row.label, ...monthValues, row.total, pctValue]

    const excelRow = ws.addRow(rowValues)
    const style = getRowColor(row)
    excelRow.height = row.isTotal ? 22 : 18

    // Apply styles to all cells
    for (let c = 1; c <= 15; c++) {
      const cell = excelRow.getCell(c)
      applyBorders(cell)

      // Font
      cell.font = {
        name: 'Calibri',
        size: row.isTotal ? 11 : 10,
        bold: style.bold,
        color: { argb: style.fontColor },
      }

      // Fill
      if (style.bg) {
        setFill(cell, style.bg)
      }

      // Label cell
      if (c === 1) {
        cell.alignment = {
          horizontal: 'left',
          vertical: 'middle',
          indent: row.indent || 0,
        }
      }

      // Number columns (B-N)
      if (c >= 2 && c <= 14) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }

      // Percentage column (O)
      if (c === 15) {
        cell.numFmt = '0.0%'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    }

    // Add bottom border emphasis for subtotals
    if (row.isSubtotal || row.isTotal) {
      for (let c = 1; c <= 15; c++) {
        const cell = excelRow.getCell(c)
        cell.border = {
          ...THIN_BORDER,
          top: { style: 'thin', color: { argb: 'FF666666' } },
          bottom: { style: 'medium', color: { argb: 'FF333333' } },
        }
      }
    }
  }

  // ── Generate & download ──
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `DRE_${year}_${getRegimeLabel(taxRegime).replace(/\s+/g, '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
