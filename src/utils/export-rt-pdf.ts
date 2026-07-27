import jsPDF from 'jspdf'
import 'jspdf-autotable'
import dayjs from 'dayjs'
import { formatBRL } from '@/utils/formatters'
import type { RtExportRow, RtExportDetailRow } from './export-rt-excel'

/**
 * PC-FEAT-RT-EXPORTACAO-002 (Relatório 15/07/2026, Seção 4).
 * Exportação DEDICADA da tela RT Comissões (PDF), independente da exportação de
 * Comissão de Vendedor: linhas detalhadas com Status (Aberto/Liquidado), 3
 * totalizadores (Geral/Liquidado/Aberto) e resumo por vendedor.
 */

const formatCurrency = formatBRL

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

export function exportRtToPdf(
  rows: RtExportRow[],
  month: number,
  year: number,
  filterEmployee?: string,
) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const monthName = MONTH_NAMES_PT[month]
  const pageWidth = doc.internal.pageSize.getWidth()

  // ── Header ──
  doc.setFontSize(18)
  doc.setTextColor(14, 116, 144) // ciano
  doc.text('Precifica Certo', 14, 20)

  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text('Relatório de RT — Comissão Reserva Técnica', 14, 32)

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Período: ${monthName} / ${year}`, 14, 40)
  if (filterEmployee) doc.text(`Vendedor: ${filterEmployee}`, 14, 46)

  // ── Achata as linhas de detalhe ──
  const flat = rows.flatMap(r => r.detail_rows.map(d => ({ ...d, employee_name: r.name })))

  // ── Totalizadores ──
  const totalBase = rows.reduce((s, r) => s + r.base_revenue + r.pending_revenue, 0)
  const totalRtLiquidado = rows.reduce((s, r) => s + r.commission_value, 0)
  const totalRtAberto = rows.reduce((s, r) => s + r.pending_commission, 0)
  const totalRtGeral = totalRtLiquidado + totalRtAberto
  const totalValorLiquidado = flat.filter(d => !isOpen(d)).reduce((s, d) => s + d.value, 0)
  const totalValorAberto = flat.filter(isOpen).reduce((s, d) => s + d.value, 0)
  const totalValorGeral = totalValorLiquidado + totalValorAberto

  // ── KPI cards ──
  const kpiStartY = filterEmployee ? 52 : 48
  const kpiCount = 5
  const margin = 14
  const gap = 4
  const cardWidth = (pageWidth - margin * 2 - gap * (kpiCount - 1)) / kpiCount
  const cardHeight = 26 // PC-UI-RTCOMISSOES-PDF-LABEL-001: comporta rótulos de 2 linhas

  const kpis: Array<{ label: string; value: string; fill: [number, number, number]; labelColor: [number, number, number]; valueColor: [number, number, number] }> = [
    { label: 'Vendedores', value: String(rows.length), fill: [8, 51, 68], labelColor: [103, 232, 249], valueColor: [207, 250, 254] },
    { label: 'Receita Base', value: formatCurrency(totalBase), fill: [8, 51, 68], labelColor: [103, 232, 249], valueColor: [207, 250, 254] },
    { label: 'RT Total', value: formatCurrency(totalRtGeral), fill: [8, 51, 68], labelColor: [103, 232, 249], valueColor: [34, 211, 238] },
    { label: 'RT Liquidada — Disponível p/ Pagamento', value: formatCurrency(totalRtLiquidado), fill: [8, 51, 68], labelColor: [103, 232, 249], valueColor: [45, 212, 191] },
    { label: 'RT em Aberto', value: formatCurrency(totalRtAberto), fill: [69, 26, 3], labelColor: [252, 211, 77], valueColor: [251, 191, 36] },
  ]

  kpis.forEach((kpi, i) => {
    const x = margin + i * (cardWidth + gap)
    doc.setFillColor(...kpi.fill)
    doc.roundedRect(x, kpiStartY, cardWidth, cardHeight, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setTextColor(...kpi.labelColor)
    // PC-UI-RTCOMISSOES-PDF-LABEL-001: rótulo pode ocupar 2 linhas (ex.: "RT Liquidada
    // — Disponível p/ Pagamento") sem estourar a largura do card.
    const labelLines = doc.splitTextToSize(kpi.label, cardWidth - 6)
    doc.text(labelLines, x + 4, kpiStartY + 6)
    doc.setFontSize(11)
    doc.setTextColor(...kpi.valueColor)
    doc.text(kpi.value, x + 4, kpiStartY + cardHeight - 5)
  })

  const tableStartY = kpiStartY + cardHeight + 6

  // ── Tabela detalhada ──
  const tableData: string[][] = flat.map(d => [
    d.employee_name,
    d.client_name || '—',
    d.installment_label || (d.is_installment ? 'Parcela' : '—'),
    d.sale_code || '—',
    formatDateBR(d.date),
    formatCurrency(d.value),
    `${(Number(d.commission_percent) || 0).toFixed(2)}%`,
    formatCurrency(d.commission_amount),
    isOpen(d) ? 'Aberto' : 'Liquidado',
  ])

  // 3 totalizadores no rodapé do corpo
  tableData.push(['TOTAL GERAL', '', '', '', '', formatCurrency(totalValorGeral), '', formatCurrency(totalRtGeral), ''])
  tableData.push(['TOTAL LIQUIDADO — Disponível para o pagamento', '', '', '', '', formatCurrency(totalValorLiquidado), '', formatCurrency(totalRtLiquidado), ''])
  tableData.push(['TOTAL EM ABERTO — Ainda não disponível', '', '', '', '', formatCurrency(totalValorAberto), '', formatCurrency(totalRtAberto), ''])
  const totalRowsStart = tableData.length - 3

  ;(doc as any).autoTable({
    startY: tableStartY,
    head: [['Vendedor', 'Cliente', 'Parcela', 'Nº da Venda', 'Data', 'Valor Base', 'RT %', 'RT R$', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [14, 116, 144] },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'left' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'center' },
      7: { halign: 'right' },
      8: { halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.section !== 'body') return
      const idx = data.row.index
      // Linhas de totalizador
      if (idx >= totalRowsStart) {
        const which = idx - totalRowsStart
        const fills: [number, number, number][] = [[21, 94, 117], [15, 118, 110], [146, 64, 14]]
        data.cell.styles.fillColor = fills[which]
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
        return
      }
      // Coluna Status: cor por estado
      if (data.column.index === 8) {
        const val = String(data.cell.raw || '')
        if (val === 'Aberto') { data.cell.styles.textColor = [180, 83, 9]; data.cell.styles.fontStyle = 'bold' }
        else if (val === 'Liquidado') { data.cell.styles.textColor = [15, 118, 110]; data.cell.styles.fontStyle = 'bold' }
      }
    },
  })

  // ── Resumo por vendedor (sem filtro de vendedor) ──
  const sorted = [...rows].sort((a, b) => (b.commission_value + b.pending_commission) - (a.commission_value + a.pending_commission))
  if (!filterEmployee && rows.length > 0) {
    const startY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.setTextColor(14, 116, 144)
    doc.text('Resumo por Vendedor', 14, startY)

    // BUG-UI-RELATORIORT-COLUNAORDEM-001: ordem RT Total → RT em Aberto → RT Liquidada
    // (total geral → pendente → efetivamente liquidado / resultado final a receber).
    const summaryData = sorted.map(r => [
      r.name,
      formatCurrency(r.commission_value + r.pending_commission),
      formatCurrency(r.pending_commission),
      formatCurrency(r.commission_value),
    ])
    summaryData.push([
      'TOTAL',
      formatCurrency(totalRtGeral),
      formatCurrency(totalRtAberto),
      formatCurrency(totalRtLiquidado),
    ])

    ;(doc as any).autoTable({
      startY: startY + 4,
      head: [['Vendedor', 'RT Total', 'RT em Aberto', 'RT Liquidada']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [14, 116, 144] },
      styles: { fontSize: 9 },
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index === summaryData.length - 1) {
          data.cell.styles.fillColor = [21, 94, 117]
          data.cell.styles.textColor = [255, 255, 255]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
  }

  // FEAT-RELATORIORT-ASSINATURA-001: área de confirmação de recebimento do RT liquidado.
  // Uma linha de assinatura por vendedor, com data preenchida automaticamente.
  const today = new Date().toLocaleDateString('pt-BR')
  const signers = filterEmployee ? rows : sorted
  if (signers.length > 0) {
    let sy = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 16 : 60
    doc.setFontSize(11)
    doc.setTextColor(14, 116, 144)
    doc.text('Confirmação de recebimento', 14, sy)
    sy += 12
    for (const r of signers) {
      if (sy > 185) { doc.addPage(); sy = 20 }
      doc.setDrawColor(120)
      doc.line(14, sy, 110, sy)
      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.text(`${r.name}`, 14, sy + 5)
      doc.setTextColor(90, 90, 90)
      doc.text(`RT Liquidada — Disponível para Pagamento: ${formatCurrency(r.commission_value)}    Data: ${today}`, 14, sy + 11)
      sy += 26
    }
  }

  doc.save(`RT_Comissoes_${monthName}_${year}.pdf`)
}
