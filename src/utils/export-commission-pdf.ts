import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { formatBRL } from '@/utils/formatters'

interface CommissionPdfRow {
  name: string
  commission_percent: number
  avg_commission_percent: number
  base_revenue: number
  commission_value: number
  pending_revenue: number
  pending_commission: number
  payment_mode: 'FULL' | 'INSTALLMENT'
}

const formatCurrency = formatBRL

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function exportCommissionToPdf(
  rows: CommissionPdfRow[],
  month: number,
  year: number,
  filterEmployee?: string,
) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const monthName = MONTH_NAMES_PT[month]
  const pageWidth = doc.internal.pageSize.getWidth()

  // ── Header ──
  doc.setFontSize(18)
  doc.setTextColor(124, 58, 237)
  doc.text('Precifica Certo', 14, 20)

  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text('Relatório de Comissão de Vendedores', 14, 32)

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Período: ${monthName} / ${year}`, 14, 40)
  if (filterEmployee) doc.text(`Vendedor: ${filterEmployee}`, 14, 46)

  // ── Compute totals (mirror panel KPIs) ──
  const totalBase = rows.reduce((sum, r) => sum + r.base_revenue, 0)
  const totalComm = rows.reduce((sum, r) => sum + r.commission_value, 0)
  const totalPendingRev = rows.reduce((sum, r) => sum + r.pending_revenue, 0)
  const totalPendingComm = rows.reduce((sum, r) => sum + r.pending_commission, 0)

  // ── KPI cards row (mirrors the panel cards) ──
  const kpiStartY = filterEmployee ? 52 : 48
  const showPending = totalPendingRev > 0 || totalPendingComm > 0
  const kpiCount = showPending ? 5 : 3
  const margin = 14
  const gap = 4
  const cardWidth = (pageWidth - margin * 2 - gap * (kpiCount - 1)) / kpiCount
  const cardHeight = 22

  const kpis: Array<{ label: string; value: string; fill: [number, number, number]; labelColor: [number, number, number]; valueColor: [number, number, number] }> = [
    { label: 'Vendedores', value: String(rows.length), fill: [30, 27, 75], labelColor: [165, 180, 252], valueColor: [224, 231, 255] },
    { label: 'Receita Base', value: formatCurrency(totalBase), fill: [30, 27, 75], labelColor: [165, 180, 252], valueColor: [224, 231, 255] },
    { label: 'Total Comissões', value: formatCurrency(totalComm), fill: [30, 27, 75], labelColor: [196, 181, 253], valueColor: [167, 139, 250] },
  ]
  if (showPending) {
    kpis.push({ label: 'Receita Aguardando', value: formatCurrency(totalPendingRev), fill: [69, 26, 3], labelColor: [252, 211, 77], valueColor: [251, 191, 36] })
    kpis.push({ label: 'Comissão Aguardando', value: formatCurrency(totalPendingComm), fill: [69, 26, 3], labelColor: [252, 211, 77], valueColor: [251, 191, 36] })
  }

  kpis.forEach((kpi, i) => {
    const x = margin + i * (cardWidth + gap)
    doc.setFillColor(...kpi.fill)
    doc.roundedRect(x, kpiStartY, cardWidth, cardHeight, 2, 2, 'F')

    doc.setFontSize(8)
    doc.setTextColor(...kpi.labelColor)
    doc.text(kpi.label, x + 4, kpiStartY + 7)

    doc.setFontSize(12)
    doc.setTextColor(...kpi.valueColor)
    doc.text(kpi.value, x + 4, kpiStartY + 17)
  })

  const tableStartY = kpiStartY + cardHeight + 6

  // ── Table data ──
  const tableData = rows.map(r => [
    r.name,
    `${r.avg_commission_percent.toFixed(2)}%`,
    r.payment_mode === 'INSTALLMENT' ? 'Parcelado' : 'Mês da Venda',
    r.pending_revenue > 0 ? formatCurrency(r.pending_revenue) : '—',
    r.pending_commission > 0 ? formatCurrency(r.pending_commission) : '—',
    formatCurrency(r.base_revenue),
    formatCurrency(r.commission_value),
  ])

  tableData.push([
    'TOTAL', '', '',
    totalPendingRev > 0 ? formatCurrency(totalPendingRev) : '—',
    totalPendingComm > 0 ? formatCurrency(totalPendingComm) : '—',
    formatCurrency(totalBase),
    formatCurrency(totalComm),
  ])

  ;(doc as any).autoTable({
    startY: tableStartY,
    head: [['Vendedor', '% Comissão Média', 'Modo Pagamento', 'Receita Aguardando', 'Comissão Aguardando', 'Base (Receita)', 'Comissão Calculada']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = [91, 33, 182]
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ── Signature area ──
  const finalY = (doc as any).lastAutoTable.finalY + 40

  if (filterEmployee) {
    doc.setDrawColor(0)
    doc.line(14, finalY, 100, finalY)
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text('Assinatura do Vendedor', 14, finalY + 6)
    doc.text(`Nome: ${filterEmployee}`, 14, finalY + 14)
    doc.text('Data: ___/___/______', 14, finalY + 22)
  } else {
    let y = finalY
    for (const row of rows) {
      if (y > 180) {
        doc.addPage()
        y = 20
      }
      doc.setDrawColor(0)
      doc.line(14, y, 100, y)
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text(`${row.name} - Comissão: ${formatCurrency(row.commission_value)}`, 14, y + 6)
      doc.text('Data: ___/___/______', 14, y + 14)
      y += 30
    }
  }

  doc.save(`comissao-vendedores-${monthName}-${year}.pdf`)
}
