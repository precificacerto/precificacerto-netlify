import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

interface PdfExportConfig {
  title: string
  subtitle?: string
  headers: string[]
  rows: (string | number)[][]
  filename: string
  orientation?: 'portrait' | 'landscape'
  columnStyles?: Record<number, { halign?: 'left' | 'center' | 'right'; cellWidth?: number }>
}

export function exportTableToPdf(config: PdfExportConfig) {
  const doc = new jsPDF({ orientation: config.orientation || 'landscape' })

  // Header
  doc.setFontSize(16)
  doc.setTextColor(124, 58, 237)
  doc.text('Precifica Certo', 14, 18)

  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text(config.title, 14, 28)

  if (config.subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(config.subtitle, 14, 36)
  }

  autoTable(doc, {
    startY: config.subtitle ? 42 : 34,
    head: [config.headers],
    body: config.rows,
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: config.columnStyles || {},
  })

  doc.save(config.filename)
}
