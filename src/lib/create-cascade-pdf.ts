import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CascadeStep } from '@/types/mrm'

/**
 * PC-FEAT-CASCADE-PDF-001 — PDF auditável da Memória Cascata (Motor RRO).
 * Reúsa jsPDF + jspdf-autotable (já no projeto). Display puro: lê o `cascade_trace` já
 * calculado, NÃO invoca o motor — paridade total tela ↔ PDF. Hierarquia pai/filho preservada
 * por indentação (└─).
 */
export interface CascadePdfMeta {
  budgetId?: string | null
  budgetCode?: string | null
  /**
   * Código do PEDIDO (PED-XXXXXX), quando o PDF é de um pedido.
   *
   * O pedido tem identidade PRÓPRIA e é ela que titula o documento; o `budgetId` de origem
   * continua aparecendo, no cabeçalho, como linhagem. São coisas diferentes e ambas cabem —
   * cada uma no seu lugar.
   */
  orderCode?: string | null
  customerName?: string | null
  documentDate?: string | null
  totalValue?: number | null
  totalACobrar?: number | null
  discountMode?: string | null
  discountPercent?: number | null
}

const fmtMoney = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(Number(v))
    ? '—'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtPct = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(Number(v))
    ? '—'
    : `${(Number(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`

/**
 * Adendo Seção 31-A (item 4): rótulo amigável do modo de absorção de desconto,
 * consistente com o seletor de Modo do orçamento/venda.
 */
const DISCOUNT_MODE_LABELS: Record<string, string> = {
  PROPORTIONAL: 'Proporcional (Comissão + Lucro)',
  SELLER_REDUCTION: 'Congela Lucro (Vendedor absorve)',
  PROFIT_REDUCTION: 'Congela Comissão (Empresa absorve)',
}

function discountModeLabel(mode: string | null | undefined): string {
  if (!mode) return ''
  return DISCOUNT_MODE_LABELS[mode] ?? mode
}

/**
 * Resolve o código que TITULA o documento. O pedido tem precedência sobre o orçamento: quando
 * o PDF é de um pedido, é o `PED-` que o identifica, e o orçamento de origem vira linhagem.
 */
export function resolveCascadeCode(meta: CascadePdfMeta): string {
  if (meta.orderCode) return meta.orderCode
  if (meta.budgetCode) return meta.budgetCode
  if (meta.budgetId) return `ORC-${meta.budgetId.substring(0, 4).toUpperCase()}`
  return 'ORC'
}

/** Linhagem: o orçamento de ORIGEM de um pedido, para o cabeçalho. Vazio quando não há. */
export function resolveCascadeOrigem(meta: CascadePdfMeta): string {
  if (!meta.orderCode || !meta.budgetId) return ''
  return meta.budgetCode || `ORC-${meta.budgetId.substring(0, 4).toUpperCase()}`
}

/** Monta o documento jsPDF da cascata (sem disparar download). */
export function buildCascadeDoc(trace: CascadeStep[], meta: CascadePdfMeta): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const code = resolveCascadeCode(meta)
  const dataEmissao =
    meta.documentDate || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // ─── Cabeçalho ───
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Memória Cascata — Motor RRO', margin, 18)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const origem = resolveCascadeOrigem(meta)
  doc.text(`${meta.orderCode ? 'Pedido' : 'Orçamento'}: ${code}`, margin, 26)
  doc.text(
    origem ? `Cliente: ${meta.customerName || '—'}   ·   Origem: ${origem}` : `Cliente: ${meta.customerName || '—'}`,
    margin,
    32,
  )
  doc.text(`Emissão: ${dataEmissao}`, pageWidth - margin, 26, { align: 'right' })

  // ─── Totais em destaque ───
  let y = 40
  doc.setDrawColor(99, 102, 241)
  doc.setFillColor(238, 242, 255)
  doc.rect(margin, y, pageWidth - margin * 2, 16, 'F')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Valor Total: ${fmtMoney(meta.totalValue)}`, margin + 4, y + 6)
  doc.text(`Total a Cobrar (pós-desconto): ${fmtMoney(meta.totalACobrar ?? meta.totalValue)}`, margin + 4, y + 12)
  if (meta.discountPercent != null && meta.discountPercent > 0) {
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Desconto: ${meta.discountPercent}%${meta.discountMode ? ` (${discountModeLabel(meta.discountMode)})` : ''}`,
      pageWidth - margin - 4,
      y + 9,
      { align: 'right' },
    )
  }
  y += 22

  // ─── Tabela das etapas (hierarquia pai/filho) ───
  const body: Array<[string, string, string, string, string]> = []
  for (const step of trace) {
    body.push([
      String(step.step),
      step.label ?? '',
      fmtMoney(step.base),
      fmtPct(step.rate),
      fmtMoney(step.amount),
    ])
    for (const child of step.children ?? []) {
      // PC-UI-IBSCBS-ALIQEFETIVA-005: anexa a alíquota efetiva (pós-fator IVA Dual) ao rótulo
      // dos tributos por fora da Etapa 17, refletindo a mesma transparência da tela.
      const effSuffix =
        child.effective_rate_pct != null
          ? ` (efetiva ${(child.effective_rate_pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%)`
          : ''
      body.push([
        '',
        `   └─ ${child.label ?? ''}${effSuffix}`,
        fmtMoney(child.base),
        step.step === 10 ? '' : fmtPct(child.rate),
        fmtMoney(child.amount),
      ])
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['#', 'Etapa', 'Base (R$)', 'Alíquota', 'Valor (R$)']],
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    // Linhas-filho (começam com indentação) em cinza claro.
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index === 1 && typeof hook.cell.raw === 'string' && hook.cell.raw.startsWith('   └─')) {
        hook.row.cells[0].styles.textColor = [120, 120, 120]
        hook.row.cells[1].styles.textColor = [120, 120, 120]
      }
    },
  })

  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  const finalY = (doc as any).lastAutoTable?.finalY ?? y
  doc.text(
    'Documento gerado pela Memória Cascata do Motor RRO — Precifica Certo.',
    margin,
    Math.min(finalY + 8, doc.internal.pageSize.getHeight() - 8),
  )

  return doc
}

/** Gera e dispara o download do PDF da cascata. Nome: Cascata_[code]_[data].pdf */
export function downloadCascadePdf(trace: CascadeStep[], meta: CascadePdfMeta): void {
  const doc = buildCascadeDoc(trace, meta)
  const code = resolveCascadeCode(meta)
  const dateStamp = (meta.documentDate || new Date().toLocaleDateString('pt-BR')).replace(/\//g, '-')
  doc.save(`Cascata_${code}_${dateStamp}.pdf`)
}
