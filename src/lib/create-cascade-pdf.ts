import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CascadeStep } from '@/types/mrm'
import { appendDecompositionPages, type DecompositionPdfInput } from '@/lib/decomposition-pdf'

/**
 * Os textos que o usuário lê no PDF, num lugar só.
 *
 * Exportados porque um rótulo espalhado em três literais é exatamente o que faz uma
 * renomeação pegar dois dos três — e o teste da seção 6.5 afirma ESTES valores, não a
 * aparência da string no meio do arquivo.
 */
export const DECOMPOSITION_PDF_TITLE = 'Decomposição — Motor RRO'
export const DECOMPOSITION_PDF_FOOTER = 'Documento gerado pela Decomposição do Motor RRO — Precifica Certo.'
export const DECOMPOSITION_PDF_FILE_PREFIX = 'Decomposicao'

/**
 * PC-FEAT-CASCADE-PDF-001 — PDF auditável da DECOMPOSIÇÃO (Motor RRO).
 *
 * RENOMEAÇÃO (relatório "Motor RRO — Lucro Real", seção 6.5): "Cascata", "Cascata RRO" e
 * "Memória Cascata" passam a se chamar DECOMPOSIÇÃO em tudo que o usuário lê. Os
 * identificadores internos (`cascade_trace`, `CascadeStep`, `buildCascadeDoc`) NÃO mudam:
 * renomear tipo e coluna de jsonb é refatoração de outra natureza, com risco próprio, e
 * misturá-la com a troca de rótulo faria o diff da renomeação deixar de ser legível.
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
  /**
   * A DECOMPOSIÇÃO por produto, a MESMA que a tela exibe. Vai ao FINAL do PDF, em páginas
   * próprias e em paisagem — ver `decomposition-pdf.ts` para a decisão de layout.
   *
   * Ausente = o documento não tem produto precificado (só itens manuais), ou a tela que
   * chamou ainda não a monta. `undefined` é ausência de dado, nunca "decomposição vazia".
   */
  decomposition?: DecompositionPdfInput | null
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

/**
 * Cabeçalho e totais em destaque — a IDENTIFICAÇÃO do documento.
 *
 * Extraído porque dois PDFs o usam: o da decomposição e o da cascata legada. Duas cópias do
 * cabeçalho seriam `copia-divergente.md` num lugar em que o campo esquecido é o número do
 * orçamento. Devolve o `y` em que o conteúdo seguinte pode começar.
 */
function drawHeader(doc: jsPDF, meta: CascadePdfMeta): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const code = resolveCascadeCode(meta)
  const dataEmissao =
    meta.documentDate || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(DECOMPOSITION_PDF_TITLE, margin, 18)
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
  return y + 22
}

/**
 * O PDF da DECOMPOSIÇÃO — identificação do documento e a tabela por produto, e mais nada.
 *
 * É o PDF do botão da decomposição. A Memória Cascata de 17 etapas NÃO entra: ela saiu da
 * tela, e mantê-la no papel devolveria as duas apresentações da mesma conta por outro
 * caminho — `.claude/rules/copia-divergente.md`.
 */
export function buildDecompositionDoc(meta: CascadePdfMeta): jsPDF {
  const doc = new jsPDF()
  const y = drawHeader(doc, meta)
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text(DECOMPOSITION_PDF_FOOTER, 14, y)
  if (meta.decomposition) appendDecompositionPages(doc, meta.decomposition)
  return doc
}

/** Gera e dispara o download do PDF da decomposição. Nome: Decomposicao_[code]_[data].pdf */
export function downloadDecompositionPdf(meta: CascadePdfMeta): void {
  const doc = buildDecompositionDoc(meta)
  const code = resolveCascadeCode(meta)
  const dateStamp = (meta.documentDate || new Date().toLocaleDateString('pt-BR')).replace(/\//g, '-')
  doc.save(`${DECOMPOSITION_PDF_FILE_PREFIX}_${code}_${dateStamp}.pdf`)
}

/**
 * Monta o documento jsPDF da cascata legada (sem disparar download).
 *
 * MANTIDO para o caminho que ainda imprime o `cascade_trace`. A tela da decomposição usa
 * `buildDecompositionDoc`.
 */
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
  doc.text(DECOMPOSITION_PDF_TITLE, margin, 18)
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
    DECOMPOSITION_PDF_FOOTER,
    margin,
    Math.min(finalY + 8, doc.internal.pageSize.getHeight() - 8),
  )

  // A decomposição por produto, AO FINAL — a mesma tabela da tela, nos dois lugares.
  if (meta.decomposition) appendDecompositionPages(doc, meta.decomposition)

  return doc
}

/** Gera e dispara o download do PDF da decomposição. Nome: Decomposicao_[code]_[data].pdf */
export function downloadCascadePdf(trace: CascadeStep[], meta: CascadePdfMeta): void {
  const doc = buildCascadeDoc(trace, meta)
  const code = resolveCascadeCode(meta)
  const dateStamp = (meta.documentDate || new Date().toLocaleDateString('pt-BR')).replace(/\//g, '-')
  doc.save(`${DECOMPOSITION_PDF_FILE_PREFIX}_${code}_${dateStamp}.pdf`)
}
