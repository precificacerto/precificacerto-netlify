import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

interface CommissionRow {
  employee_id: string
  name: string
  commission_percent: number
  avg_commission_percent: number
  base_revenue: number
  commission_value: number
  pending_revenue: number
  pending_commission: number
  payment_mode: 'FULL' | 'INSTALLMENT'
}

// ── Style constants ──
const FONT_DEFAULT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 }
const FONT_HEADER: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_TITLE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_KPI_LABEL: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFA5B4FC' } }
const FONT_KPI_VALUE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFE0E7FF' } }
const FONT_KPI_VALUE_HIGHLIGHT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFA78BFA' } }
const FONT_KPI_LABEL_PENDING: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFCD34D' } }
const FONT_KPI_VALUE_PENDING: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFBBF24' } }

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
const FILL_KPI: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } }
const FILL_KPI_PENDING: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF451A03' } }

const NUMBER_FORMAT = '#,##0.00'
const CURRENCY_FORMAT = '"R$" #,##0.00'
const PERCENT_FORMAT = '0.00"%"'

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export async function exportCommissionToExcel(
  data: CommissionRow[],
  monthObj: dayjs.Dayjs,
  filterEmployee?: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Precifica Certo'
  workbook.created = new Date()

  const monthName = MONTH_NAMES_PT[monthObj.month()]
  const year = monthObj.year()
  const colCount = 7

  const ws = workbook.addWorksheet('Comissões', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 8 }],
  })

  // ── Column definitions (mirror panel columns) ──
  ws.columns = [
    { key: 'vendedor', width: 32 },
    { key: 'avg_percent', width: 18 },
    { key: 'payment_mode', width: 18 },
    { key: 'pending_revenue', width: 22 },
    { key: 'pending_commission', width: 22 },
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

  // ── Row 2: Subtitle with month/year + filter info ──
  const subtitleText = filterEmployee
    ? `Período: ${monthName} / ${year}  •  Vendedor: ${filterEmployee}`
    : `Período: ${monthName} / ${year}`
  const subtitleRow = ws.addRow([subtitleText])
  subtitleRow.height = 24
  ws.mergeCells(2, 1, 2, colCount)
  const subCell = subtitleRow.getCell(1)
  subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF333333' } }
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  subCell.fill = { ...FILL_SUBTITLE }
  for (let c = 1; c <= colCount; c++) {
    subtitleRow.getCell(c).border = { ...THIN_BORDER }
  }

  // ── Compute KPIs (mirror panel cards) ──
  const totalBase = data.reduce((s, r) => s + r.base_revenue, 0)
  const totalComm = data.reduce((s, r) => s + r.commission_value, 0)
  const totalPendingRev = data.reduce((s, r) => s + r.pending_revenue, 0)
  const totalPendingComm = data.reduce((s, r) => s + r.pending_commission, 0)
  const showPending = totalPendingRev > 0 || totalPendingComm > 0

  // ── Rows 3-5: KPI cards block ──
  // Layout: 5 KPI cards each spanning ~1.4 columns when pending shown, otherwise 3 cards each spanning ~2.3 cols
  // Simpler: each KPI is two rows tall — label on first row, value on second row, spanning equal columns
  const kpiLabelRow = ws.addRow([])
  const kpiValueRow = ws.addRow([])
  kpiLabelRow.height = 18
  kpiValueRow.height = 26

  type Kpi = {
    label: string
    value: number | string
    isCurrency: boolean
    pending: boolean
    highlight: boolean
  }

  const kpis: Kpi[] = [
    { label: '👥 Vendedores', value: data.length, isCurrency: false, pending: false, highlight: false },
    { label: '💰 Receita Base', value: totalBase, isCurrency: true, pending: false, highlight: false },
    { label: '% Total Comissões', value: totalComm, isCurrency: true, pending: false, highlight: true },
  ]
  if (showPending) {
    kpis.push({ label: '⏳ Receita Aguardando', value: totalPendingRev, isCurrency: true, pending: true, highlight: false })
    kpis.push({ label: '⏳ Comissão Aguardando', value: totalPendingComm, isCurrency: true, pending: true, highlight: false })
  }

  // Distribute KPI cards across colCount columns
  const cardSpan = Math.floor(colCount / kpis.length)
  const remainder = colCount - cardSpan * kpis.length

  let colStart = 1
  kpis.forEach((kpi, idx) => {
    const span = cardSpan + (idx < remainder ? 1 : 0)
    const colEnd = colStart + span - 1

    // Label row
    ws.mergeCells(3, colStart, 3, colEnd)
    const lc = kpiLabelRow.getCell(colStart)
    lc.value = kpi.label
    lc.font = kpi.pending ? { ...FONT_KPI_LABEL_PENDING } : { ...FONT_KPI_LABEL }
    lc.fill = kpi.pending ? { ...FILL_KPI_PENDING } : { ...FILL_KPI }
    lc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (let c = colStart; c <= colEnd; c++) {
      kpiLabelRow.getCell(c).fill = kpi.pending ? { ...FILL_KPI_PENDING } : { ...FILL_KPI }
      kpiLabelRow.getCell(c).border = { ...THIN_BORDER }
    }

    // Value row
    ws.mergeCells(4, colStart, 4, colEnd)
    const vc = kpiValueRow.getCell(colStart)
    vc.value = kpi.value
    if (kpi.isCurrency) vc.numFmt = CURRENCY_FORMAT
    vc.font = kpi.pending
      ? { ...FONT_KPI_VALUE_PENDING }
      : kpi.highlight
        ? { ...FONT_KPI_VALUE_HIGHLIGHT }
        : { ...FONT_KPI_VALUE }
    vc.fill = kpi.pending ? { ...FILL_KPI_PENDING } : { ...FILL_KPI }
    vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (let c = colStart; c <= colEnd; c++) {
      kpiValueRow.getCell(c).fill = kpi.pending ? { ...FILL_KPI_PENDING } : { ...FILL_KPI }
      kpiValueRow.getCell(c).border = { ...THIN_BORDER }
    }

    colStart = colEnd + 1
  })

  // ── Row 5: Blank separator ──
  ws.addRow([])

  // ── Row 6: Header row (mirror panel table columns) ──
  const headerRow = ws.addRow([
    'Vendedor',
    '% Comissão Média',
    'Modo Pagamento',
    'Receita Aguardando',
    'Comissão Aguardando',
    'Base (Receita)',
    'Comissão Calculada',
  ])
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
      horizontal: c === 1 ? 'left' : c === 2 || c === 3 ? 'center' : 'right',
      vertical: 'middle',
    }
  }

  // ── Data rows ──
  data.forEach((row, idx) => {
    const excelRow = ws.addRow([
      row.name,
      row.avg_commission_percent,
      row.payment_mode === 'INSTALLMENT' ? 'Parcelado' : 'Mês da Venda',
      row.pending_revenue,
      row.pending_commission,
      row.base_revenue,
      row.commission_value,
    ])
    excelRow.height = 22

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
      } else if (c === 3) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else {
        cell.numFmt = NUMBER_FORMAT
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    }
  })

  // ── Total row ──
  const totalRow = ws.addRow([
    'TOTAL',
    '',
    '',
    totalPendingRev,
    totalPendingComm,
    totalBase,
    totalComm,
  ])
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
    } else if (c === 2 || c === 3) {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else {
      cell.numFmt = NUMBER_FORMAT
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
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
