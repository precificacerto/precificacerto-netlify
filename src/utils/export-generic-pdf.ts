import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

interface PdfKpi {
  label: string
  value: string
  pending?: boolean
}

interface PdfExportConfig {
  title: string
  subtitle?: string
  headers: string[]
  rows: (string | number)[][]
  filename: string
  orientation?: 'portrait' | 'landscape'
  columnStyles?: Record<number, { halign?: 'left' | 'center' | 'right'; cellWidth?: number }>
  kpis?: PdfKpi[]
  highlightLastRow?: boolean
}

export function exportTableToPdf(config: PdfExportConfig) {
  const doc = new jsPDF({ orientation: config.orientation || 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
  doc.setFontSize(16)
  doc.setTextColor(124, 58, 237)
  doc.text('Precifica Certo', 14, 18)

  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text(config.title, 14, 28)

  let cursorY = 34
  if (config.subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(config.subtitle, 14, 36)
    cursorY = 42
  }

  // ── KPI cards (mirror panel cards) ──
  if (config.kpis && config.kpis.length > 0) {
    const margin = 14
    const gap = 4
    const cardWidth = (pageWidth - margin * 2 - gap * (config.kpis.length - 1)) / config.kpis.length
    const cardHeight = 22

    config.kpis.forEach((kpi, i) => {
      const x = margin + i * (cardWidth + gap)
      if (kpi.pending) {
        doc.setFillColor(69, 26, 3)
      } else {
        doc.setFillColor(30, 27, 75)
      }
      doc.roundedRect(x, cursorY, cardWidth, cardHeight, 2, 2, 'F')

      doc.setFontSize(8)
      if (kpi.pending) {
        doc.setTextColor(252, 211, 77)
      } else {
        doc.setTextColor(165, 180, 252)
      }
      doc.text(kpi.label, x + 4, cursorY + 7)

      if (kpi.pending) {
        doc.setTextColor(251, 191, 36)
      } else {
        doc.setTextColor(224, 231, 255)
      }
      // Doc 29/07 (item 1.4.1): valor inteiro sempre visível (ex.: R$ 323.999,99).
      // Reduz a fonte proporcionalmente quando o valor não cabe na largura do card.
      const valueMaxW = cardWidth - 8
      doc.setFontSize(12)
      const valueW = doc.getTextWidth(kpi.value)
      if (valueW > valueMaxW) {
        doc.setFontSize(Math.max(7, Math.floor(12 * (valueMaxW / valueW))))
      }
      doc.text(kpi.value, x + 4, cursorY + 17)
      doc.setFontSize(12)
    })

    cursorY += cardHeight + 6
  }

  autoTable(doc, {
    startY: cursorY,
    head: [config.headers],
    body: config.rows,
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: config.columnStyles || {},
    didParseCell: (data: any) => {
      if (config.highlightLastRow && data.section === 'body' && data.row.index === config.rows.length - 1) {
        data.cell.styles.fillColor = [91, 33, 182]
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  doc.save(config.filename)
}
