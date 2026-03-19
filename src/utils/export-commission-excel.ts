import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

interface CommissionRow {
  employee_id: string
  name: string
  commission_percent: number
  base_revenue: number
  commission_value: number
}

// ── Style constants ──
const FONT_DEFAULT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 }
const FONT_BOLD: Partial<ExcelJS.Font> = { ...FONT_DEFAULT, bold: true }
const FONT_HEADER: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_TITLE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF999999' } },
  bottom: { style: 'thin', color: { argb: 'FF999999' } },
  left: { style: 'thin', color: { argb: 'FF999999' } },
  right: { style: 'thin', color: { argb: 'FF999999' } },
}

const FILL_PURPLE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
const FILL_LIGHT_PURPLE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0FF' } }
const FILL_WHITE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
const FILL_TOTAL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B21B6' } }
const FILL_SUBTITLE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }

const NUMBER_FORMAT = '#,##0.00'
const PERCENT_FORMAT = '0.00"%"'

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export async function exportCommissionToExcel(
  data: CommissionRow[],
  monthObj: dayjs.Dayjs,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Precifica Certo'
  workbook.created = new Date()

  const monthName = MONTH_NAMES_PT[monthObj.month()]
  const year = monthObj.year()
  const colCount = 4

  const ws = workbook.addWorksheet('Comissões', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  })

  // ── Column definitions ──
  ws.columns = [
    { key: 'vendedor', width: 35 },
    { key: 'percent', width: 18 },
    { key: 'base', width: 22 },
    { key: 'commission', width: 22 },
  ]

  // ── Row 1: Title ──
  const titleRow = ws.addRow([`Relatório de Comissão de Vendedores`])
  titleRow.height = 32
  ws.mergeCells(1, 1, 1, colCount)
  const titleCell = titleRow.getCell(1)
  titleCell.font = { ...FONT_TITLE }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { ...FILL_PURPLE }
  for (let c = 1; c <= colCount; c++) {
    titleRow.getCell(c).border = { ...THIN_BORDER }
  }

  // ── Row 2: Subtitle with month/year ──
  const subtitleRow = ws.addRow([`Período: ${monthName} / ${year}`])
  subtitleRow.height = 24
  ws.mergeCells(2, 1, 2, colCount)
  const subCell = subtitleRow.getCell(1)
  subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF333333' } }
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  subCell.fill = { ...FILL_SUBTITLE }
  for (let c = 1; c <= colCount; c++) {
    subtitleRow.getCell(c).border = { ...THIN_BORDER }
  }

  // ── Row 3: Blank separator ──
  ws.addRow([])

  // ── Row 4: Header row ──
  const headerRow = ws.addRow(['Vendedor', '% Comissão', 'Base (Receita)', 'Comissão Calculada'])
  headerRow.height = 26
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c)
    cell.font = { ...FONT_HEADER }
    cell.fill = { ...FILL_PURPLE }
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF5B21B6' } },
      bottom: { style: 'medium', color: { argb: 'FF5B21B6' } },
      left: { style: 'thin', color: { argb: 'FF5B21B6' } },
      right: { style: 'thin', color: { argb: 'FF5B21B6' } },
    }
    cell.alignment = {
      horizontal: c === 1 ? 'left' : c === 2 ? 'center' : 'right',
      vertical: 'middle',
    }
  }

  // ── Data rows ──
  let totalBase = 0
  let totalComm = 0

  data.forEach((row, idx) => {
    const excelRow = ws.addRow([
      row.name,
      row.commission_percent,
      row.base_revenue,
      row.commission_value,
    ])
    excelRow.height = 22

    totalBase += row.base_revenue
    totalComm += row.commission_value

    const isEven = idx % 2 === 0

    for (let c = 1; c <= colCount; c++) {
      const cell = excelRow.getCell(c)
      cell.font = { ...FONT_DEFAULT }
      cell.border = { ...THIN_BORDER }
      cell.fill = isEven ? { ...FILL_LIGHT_PURPLE } : { ...FILL_WHITE }

      if (c === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
        cell.font = { ...FONT_DEFAULT, bold: true }
      } else if (c === 2) {
        cell.numFmt = PERCENT_FORMAT
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else {
        cell.numFmt = NUMBER_FORMAT
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    }
  })

  // ── Total row ──
  const totalRow = ws.addRow(['TOTAL', '', totalBase, totalComm])
  totalRow.height = 26
  for (let c = 1; c <= colCount; c++) {
    const cell = totalRow.getCell(c)
    cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { ...FILL_TOTAL }
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF3B0764' } },
      bottom: { style: 'medium', color: { argb: 'FF3B0764' } },
      left: { style: 'thin', color: { argb: 'FF3B0764' } },
      right: { style: 'thin', color: { argb: 'FF3B0764' } },
    }

    if (c === 1) {
      cell.alignment = { horizontal: 'left', vertical: 'middle' }
    } else if (c >= 3) {
      cell.numFmt = NUMBER_FORMAT
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    } else {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  }

  // ── Download ──
  const fileName = `Comissao_Vendedores_${monthName}_${year}.xlsx`
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
