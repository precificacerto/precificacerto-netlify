import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getMonetaryValue } from '@/utils/get-monetary-value'

export interface BudgetPdfItem {
  quantity: number
  unit_price: number
  discount: number
  products?: { name: string; code?: string | null } | null
}

export interface BudgetPdfData {
  id: string
  expiration_date?: string | null
  total_value: number
  notes?: string | null
  customer?: { name?: string | null } | null
  employee?: { name?: string | null } | null
  company_name?: string | null
  company_cnpj?: string | null
  items?: BudgetPdfItem[]
}

/**
 * Gera o PDF do orçamento. Retorna o buffer do PDF (Uint8Array).
 * Nome sugerido do arquivo: orcamento-ORC-XXXX.pdf
 */
export function createBudgetPdf(data: BudgetPdfData): Uint8Array {
  const doc = new jsPDF()
  const code = `ORC-${data.id.substring(0, 4).toUpperCase()}`
  const clientName = data.customer?.name ?? 'Cliente'
  const dataAtual = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const validity = data.expiration_date
    ? new Date(data.expiration_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'Não informada'

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  let cursorY = 20

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Orçamento', pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 10

  if (data.company_name?.trim()) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(data.company_name.trim(), margin, cursorY)
    cursorY += 6
  }
  if (data.company_cnpj?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`CNPJ: ${data.company_cnpj.trim()}`, margin, cursorY)
    cursorY += 8
  }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Código: ${code}`, margin, cursorY)
  cursorY += 6
  doc.text(`Cliente: ${clientName}`, margin, cursorY)
  cursorY += 6
  doc.text(`Data: ${dataAtual}`, margin, cursorY)
  cursorY += 6
  doc.text(`Validade: ${validity}`, margin, cursorY)
  cursorY += 6
  if (data.employee?.name?.trim()) {
    doc.text(`Vendedor: ${data.employee.name.trim()}`, margin, cursorY)
    cursorY += 6
  }
  cursorY += 8

  const headers = [['Código', 'Produto', 'Qtd', 'Preço unit.', 'Desconto', 'Total']]
  const rows =
    data.items?.map((item) => {
      const total = item.quantity * item.unit_price - (item.discount || 0)
      return [
        item.products?.code?.trim() ?? '-',
        item.products?.name ?? '-',
        String(item.quantity),
        `R$ ${getMonetaryValue(item.unit_price)}`,
        `R$ ${getMonetaryValue(item.discount || 0)}`,
        `R$ ${getMonetaryValue(total)}`,
      ]
    }) ?? []

  autoTable(doc, {
    head: headers,
    body: rows.length ? rows : [['-', 'Nenhum item', '-', '-', '-', '-']],
    startY: cursorY,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10 },
    headStyles: { fillColor: '#22c55e' },
    alternateRowStyles: { fillColor: '#f3f4f6' },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 50 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    didDrawPage: (d) => {
      cursorY = d.cursor?.y ?? cursorY
    },
  })

  cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY
  cursorY += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`Total: R$ ${getMonetaryValue(data.total_value)}`, margin, cursorY)
  cursorY += 10

  if (data.notes?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(`Observações: ${data.notes}`, pageWidth - 2 * margin)
    doc.text(lines, margin, cursorY)
  }

  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer
  return new Uint8Array(arrayBuffer)
}
