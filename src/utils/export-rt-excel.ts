import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

/**
 * PC-FEAT-RT-EXPORTACAO-002 (Relatório 15/07/2026, Seção 4).
 * Exportação DEDICADA da tela RT Comissões (Excel), independente da exportação de
 * Comissão de Vendedor. Traz:
 *  - Linhas detalhadas com coluna de Status (Aberto/Liquidado) por parcela;
 *  - Rodapé com 3 totalizadores: Total Geral, Total Liquidado, Total em Aberto;
 *  - Bloco de resumo por vendedor (quando não há filtro de vendedor):
 *    RT Liquidada, RT em Aberto, RT Total.
 *
 * Status por linha: uma parcela é "Aberto" quando está pendente de liquidação
 * (boleto/cheque ainda não recebido no Fluxo de Caixa — flag `pending`); caso
 * contrário é "Liquidado" (recebido / venda à vista).
 */

export interface RtExportDetailRow {
  type: 'VENDA' | 'SERVIÇO'
  description: string
  client_name: string
  date: string
  value: number
  commission_percent: number
  commission_amount: number
  is_installment?: boolean
  pending?: boolean
  installment_label?: string
  sale_code?: string
}

export interface RtExportRow {
  employee_id: string
  name: string
  base_revenue: number
  commission_value: number
  pending_revenue: number
  pending_commission: number
  detail_rows: RtExportDetailRow[]
}

// ── Style constants (tema ciano, coerente com a tela RT Comissões) ──
const FONT_DEFAULT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 }
const FONT_HEADER: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_TITLE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_KPI_LABEL: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF67E8F9' } }
const FONT_KPI_VALUE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFCFFAFE' } }
const FONT_KPI_VALUE_HIGHLIGHT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF22D3EE' } }
const FONT_KPI_LABEL_PENDING: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFCD34D' } }
const FONT_KPI_VALUE_PENDING: Partial<ExcelJS.Font> = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFBBF24' } }

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF999999' } },
  bottom: { style: 'thin', color: { argb: 'FF999999' } },
  left: { style: 'thin', color: { argb: 'FF999999' } },
  right: { style: 'thin', color: { argb: 'FF999999' } },
}

const FILL_CYAN: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
const FILL_LIGHT_CYAN: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFEFF' } }
const FILL_WHITE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
const FILL_PENDING_ROW: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
const FILL_TOTAL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } }
const FILL_TOTAL_LIQ: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
const FILL_TOTAL_ABERTO: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92400E' } }
const FILL_SUBTITLE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
const FILL_KPI: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF083344' } }
const FILL_KPI_PENDING: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF451A03' } }

const NUMBER_FORMAT = '#,##0.00'
const CURRENCY_FORMAT = '"R$" #,##0.00'
const PERCENT_FORMAT = '0.00"%"'

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function isOpen(d: RtExportDetailRow): boolean {
  return d.pending === true
}

function formatDateBR(iso: string): string {
  if (!iso) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('DD/MM/YYYY') : iso
}

export async function exportRtToExcel(
  data: RtExportRow[],
  monthObj: dayjs.Dayjs,
  filterEmployee?: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Precifica Certo'
  workbook.created = new Date()

  const monthName = MONTH_NAMES_PT[monthObj.month()]
  const year = monthObj.year()
  const colCount = 9 // Vendedor, Cliente, Parcela, Nº da Venda, Data, Valor Base, RT %, RT R$, Status

  const ws = workbook.addWorksheet('RT Comissões', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 8 }],
  })

  ws.columns = [
    { key: 'vendedor', width: 26 },
    { key: 'cliente', width: 26 },
    { key: 'parcela', width: 12 },
    { key: 'sale_code', width: 16 },
    { key: 'data', width: 14 },
    { key: 'valor_base', width: 18 },
    { key: 'rt_pct', width: 12 },
    { key: 'rt_valor', width: 18 },
    { key: 'status', width: 14 },
  ]

  // ── Título ──
  const titleRow = ws.addRow(['Relatório de RT — Comissão Reserva Técnica'])
  titleRow.height = 32
  ws.mergeCells(1, 1, 1, colCount)
  const titleCell = titleRow.getCell(1)
  titleCell.font = { ...FONT_TITLE }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { ...FILL_CYAN }
  for (let c = 1; c <= colCount; c++) titleRow.getCell(c).border = { ...THIN_BORDER }

  // ── Subtítulo ──
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
  for (let c = 1; c <= colCount; c++) subtitleRow.getCell(c).border = { ...THIN_BORDER }

  // ── Achata todas as linhas de detalhe (todos os vendedores) ──
  const flat = data.flatMap(r => r.detail_rows.map(d => ({ ...d, employee_name: r.name })))

  // ── Totalizadores ──
  const totalBase = data.reduce((s, r) => s + r.base_revenue + r.pending_revenue, 0)
  const totalRtLiquidado = data.reduce((s, r) => s + r.commission_value, 0)
  const totalRtAberto = data.reduce((s, r) => s + r.pending_commission, 0)
  const totalRtGeral = totalRtLiquidado + totalRtAberto
  const totalValorLiquidado = flat.filter(d => !isOpen(d)).reduce((s, d) => s + d.value, 0)
  const totalValorAberto = flat.filter(isOpen).reduce((s, d) => s + d.value, 0)
  const totalValorGeral = totalValorLiquidado + totalValorAberto

  // ── KPIs ──
  const kpiLabelRow = ws.addRow([])
  const kpiValueRow = ws.addRow([])
  kpiLabelRow.height = 18
  kpiValueRow.height = 26

  type Kpi = { label: string; value: number | string; isCurrency: boolean; pending: boolean; highlight: boolean }
  const kpis: Kpi[] = [
    { label: '👥 Vendedores', value: data.length, isCurrency: false, pending: false, highlight: false },
    { label: '💰 Receita Base', value: totalBase, isCurrency: true, pending: false, highlight: false },
    { label: '📊 RT Total', value: totalRtGeral, isCurrency: true, pending: false, highlight: true },
    { label: '✅ RT Liquidada', value: totalRtLiquidado, isCurrency: true, pending: false, highlight: true },
    { label: '⏳ RT em Aberto', value: totalRtAberto, isCurrency: true, pending: true, highlight: false },
  ]

  const cardSpan = Math.floor(colCount / kpis.length)
  const remainder = colCount - cardSpan * kpis.length
  let colStart = 1
  kpis.forEach((kpi, idx) => {
    const span = cardSpan + (idx < remainder ? 1 : 0)
    const colEnd = colStart + span - 1
    ws.mergeCells(3, colStart, 3, colEnd)
    const lc = kpiLabelRow.getCell(colStart)
    lc.value = kpi.label
    lc.font = kpi.pending ? { ...FONT_KPI_LABEL_PENDING } : { ...FONT_KPI_LABEL }
    lc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (let c = colStart; c <= colEnd; c++) {
      kpiLabelRow.getCell(c).fill = kpi.pending ? { ...FILL_KPI_PENDING } : { ...FILL_KPI }
      kpiLabelRow.getCell(c).border = { ...THIN_BORDER }
    }
    ws.mergeCells(4, colStart, 4, colEnd)
    const vc = kpiValueRow.getCell(colStart)
    vc.value = kpi.value
    if (kpi.isCurrency) vc.numFmt = CURRENCY_FORMAT
    vc.font = kpi.pending ? { ...FONT_KPI_VALUE_PENDING } : kpi.highlight ? { ...FONT_KPI_VALUE_HIGHLIGHT } : { ...FONT_KPI_VALUE }
    vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (let c = colStart; c <= colEnd; c++) {
      kpiValueRow.getCell(c).fill = kpi.pending ? { ...FILL_KPI_PENDING } : { ...FILL_KPI }
      kpiValueRow.getCell(c).border = { ...THIN_BORDER }
    }
    colStart = colEnd + 1
  })

  ws.addRow([]) // separador

  // ── Cabeçalho da tabela detalhada ──
  const headerRow = ws.addRow(['Vendedor', 'Cliente', 'Parcela', 'Nº da Venda', 'Data', 'Valor Base', 'RT %', 'RT R$', 'Status'])
  headerRow.height = 26
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c)
    cell.font = { ...FONT_HEADER }
    cell.fill = { ...FILL_CYAN }
    cell.border = { ...THIN_BORDER }
    cell.alignment = { horizontal: c <= 2 ? 'left' : c === 3 || c === 5 || c === 7 || c === 9 ? 'center' : 'right', vertical: 'middle' }
  }

  // ── Linhas detalhadas ──
  flat.forEach((d, idx) => {
    const open = isOpen(d)
    const excelRow = ws.addRow([
      d.employee_name,
      d.client_name || '—',
      d.installment_label || (d.is_installment ? 'Parcela' : '—'),
      d.sale_code || '—',
      formatDateBR(d.date),
      d.value,
      d.commission_percent,
      d.commission_amount,
      open ? 'Aberto' : 'Liquidado',
    ])
    excelRow.height = 20
    const isEven = idx % 2 === 0
    for (let c = 1; c <= colCount; c++) {
      const cell = excelRow.getCell(c)
      cell.font = { ...FONT_DEFAULT }
      cell.border = { ...THIN_BORDER }
      cell.fill = open ? { ...FILL_PENDING_ROW } : isEven ? { ...FILL_LIGHT_CYAN } : { ...FILL_WHITE }
      if (c === 1) { cell.alignment = { horizontal: 'left', vertical: 'middle' }; cell.font = { ...FONT_DEFAULT, bold: true } }
      else if (c === 2) cell.alignment = { horizontal: 'left', vertical: 'middle' }
      else if (c === 3 || c === 5) cell.alignment = { horizontal: 'center', vertical: 'middle' }
      else if (c === 4) { cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.font = { name: 'Consolas', size: 10 } }
      else if (c === 6 || c === 8) { cell.numFmt = NUMBER_FORMAT; cell.alignment = { horizontal: 'right', vertical: 'middle' } }
      else if (c === 7) { cell.numFmt = PERCENT_FORMAT; cell.alignment = { horizontal: 'center', vertical: 'middle' } }
      else if (c === 9) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: open ? 'FFB45309' : 'FF0F766E' } }
      }
    }
  })

  // ── Rodapé: 3 totalizadores ──
  const totalRows: Array<{ label: string; base: number; rt: number; fill: ExcelJS.FillPattern }> = [
    { label: 'TOTAL GERAL', base: totalValorGeral, rt: totalRtGeral, fill: FILL_TOTAL },
    { label: 'TOTAL LIQUIDADO — Disponível para o pagamento', base: totalValorLiquidado, rt: totalRtLiquidado, fill: FILL_TOTAL_LIQ },
    { label: 'TOTAL EM ABERTO — Ainda não disponível', base: totalValorAberto, rt: totalRtAberto, fill: FILL_TOTAL_ABERTO },
  ]
  totalRows.forEach(tr => {
    const row = ws.addRow([tr.label, '', '', '', '', tr.base, '', tr.rt, ''])
    row.height = 24
    ws.mergeCells(row.number, 1, row.number, 5)
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c)
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { ...tr.fill }
      cell.border = { ...THIN_BORDER }
      if (c === 1) cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      else if (c === 6 || c === 8) { cell.numFmt = NUMBER_FORMAT; cell.alignment = { horizontal: 'right', vertical: 'middle' } }
      else cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  })

  // ── Resumo por vendedor (apenas quando não há filtro de vendedor) ──
  if (!filterEmployee && data.length > 0) {
    ws.addRow([])
    ws.addRow([])
    const sectionRow = ws.addRow(['Resumo por Vendedor'])
    sectionRow.height = 26
    ws.mergeCells(sectionRow.number, 1, sectionRow.number, colCount)
    const sc = sectionRow.getCell(1)
    sc.font = { ...FONT_TITLE }
    sc.fill = { ...FILL_CYAN }
    sc.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let c = 1; c <= colCount; c++) sectionRow.getCell(c).border = { ...THIN_BORDER }

    // BUG-UI-RELATORIORT-COLUNAORDEM-001: ordem RT Total → RT em Aberto → RT Liquidada.
    const sHeader = ws.addRow(['Vendedor', 'RT Total', 'RT em Aberto', 'RT Liquidada'])
    sHeader.height = 24
    ws.mergeCells(sHeader.number, 4, sHeader.number, colCount) // última coluna (RT Liquidada) ocupa até o fim
    for (let c = 1; c <= colCount; c++) {
      const cell = sHeader.getCell(c)
      cell.font = { ...FONT_HEADER }
      cell.fill = { ...FILL_CYAN }
      cell.border = { ...THIN_BORDER }
      cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' }
    }

    const sorted = [...data].sort((a, b) => (b.commission_value + b.pending_commission) - (a.commission_value + a.pending_commission))
    sorted.forEach((r, idx) => {
      const rowVals = [r.name, r.commission_value + r.pending_commission, r.pending_commission, r.commission_value]
      const row = ws.addRow(rowVals)
      row.height = 20
      ws.mergeCells(row.number, 4, row.number, colCount)
      const isEven = idx % 2 === 0
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c)
        cell.font = { ...FONT_DEFAULT }
        cell.border = { ...THIN_BORDER }
        cell.fill = isEven ? { ...FILL_LIGHT_CYAN } : { ...FILL_WHITE }
        if (c === 1) { cell.alignment = { horizontal: 'left', vertical: 'middle' }; cell.font = { ...FONT_DEFAULT, bold: true } }
        else { cell.numFmt = NUMBER_FORMAT; cell.alignment = { horizontal: 'right', vertical: 'middle' } }
      }
    })
  }

  const fileName = `RT_Comissoes_${monthName}_${year}.xlsx`
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
