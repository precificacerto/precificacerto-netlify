import jsPDF from 'jspdf'
import 'jspdf-autotable'

interface CommissionPdfRow {
  name: string
  commission_percent: number
  base_revenue: number
  commission_value: number
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

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
  const doc = new jsPDF()
  const monthName = MONTH_NAMES_PT[month]

  // Header
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

  // Table data
  const tableData = rows.map(r => [
    r.name,
    `${r.commission_percent.toFixed(2)}%`,
    formatCurrency(r.base_revenue),
    formatCurrency(r.commission_value),
  ])

  const total = rows.reduce((sum, r) => sum + r.commission_value, 0)
  tableData.push(['', '', 'TOTAL', formatCurrency(total)])

  ;(doc as any).autoTable({
    startY: filterEmployee ? 52 : 48,
    head: [['Vendedor', '% Comissão', 'Base (Receita)', 'Comissão Calculada']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237] },
    styles: { fontSize: 10 },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  })

  // Signature area
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
      if (y > 260) {
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
