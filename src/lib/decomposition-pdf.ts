/**
 * decomposition-pdf.ts — a DECOMPOSIÇÃO no PDF, com as mesmas colunas da tela.
 *
 * Regra da apresentação: `.claude/rules/decomposicao-na-tela.md`. A tabela é a MESMA da tela
 * — produtos em colunas, categorias nas linhas, Total à direita, na ordem da planilha (aba
 * "Orçamento", linhas 64 a 86). Ela precisa aparecer nos DOIS lugares, e por isso os dados
 * saem do MESMO `buildDecomposition`: uma segunda montagem para o PDF seria
 * `copia-divergente.md` entre o que o usuário vê e o que ele arquiva.
 *
 * >>> NO PDF NÃO HÁ SCROLL — E A REGRA PROÍBE TRUNCAR <<<
 *
 * Na tela, a coluna Demonstrativo fica congelada à esquerda PARA QUE as colunas de produto
 * possam rolar em vez de encolher. No papel não há rolagem, e "um número truncado não parece
 * truncado": `R$ 1.23` passa por valor legítimo. As três saídas possíveis eram encolher a
 * célula (proibido), reduzir a fonte até caber (trunca por outro caminho, e some com a
 * legibilidade) ou PAGINAR AS COLUNAS. A escolhida é a terceira:
 *
 *   1. A decomposição sai em PÁGINA PRÓPRIA e em PAISAGEM — 297mm contra 210mm, que é o que
 *      permite 7 colunas de produto em vez de 4.
 *   2. Até `MAX_PRODUTOS_POR_PAGINA` produtos, uma página só.
 *   3. Acima disso, BLOCOS de colunas em páginas sucessivas, cada um repetindo a coluna
 *      Demonstrativo e a coluna Total. É o equivalente em papel do scroll horizontal: nenhum
 *      valor é cortado, e o eixo de leitura acompanha cada bloco.
 *
 * O cabeçalho de cada bloco diz quais produtos ele traz ("Produtos 8 a 14 de 20"), para que
 * ninguém leia um bloco achando que é o documento inteiro.
 */

import type { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DecompositionResult, DecompositionRow } from '@/utils/decomposition-dre'

/**
 * Quantos produtos cabem numa página paisagem sem espremer célula nenhuma.
 *
 * A4 paisagem tem 297mm; com 14mm de margem de cada lado sobram 269mm. A coluna
 * Demonstrativo leva 62mm (o rótulo mais longo é "► RRO — RESULTADO RESIDUAL OPERACIONAL"),
 * a Total leva 30mm, e cada coluna de produto leva 25mm — o suficiente para
 * `R$ 1.234.567,89` na fonte 7 sem quebra. (269 − 62 − 30) ÷ 25 = 7,08.
 */
export const MAX_PRODUTOS_POR_PAGINA = 7

/**
 * Reparte os índices dos produtos em blocos de colunas, um por página.
 *
 * Devolve SEMPRE ao menos um bloco, inclusive vazio — um documento sem produto ainda tem as
 * linhas de repasse e o total, e some-lo por completo esconderia o desconto e os itens
 * manuais de quem for conferir.
 */
export function planDecompositionColumnBlocks(
  totalProdutos: number,
  maxPorPagina: number = MAX_PRODUTOS_POR_PAGINA,
): number[][] {
  const max = Math.max(1, Math.floor(maxPorPagina))
  if (totalProdutos <= 0) return [[]]
  const blocos: number[][] = []
  for (let i = 0; i < totalProdutos; i += max) {
    blocos.push(Array.from({ length: Math.min(max, totalProdutos - i) }, (_, k) => i + k))
  }
  return blocos
}

/** Rótulo do bloco, quando há mais de um. Vazio quando tudo cabe numa página. */
export function rotuloDoBloco(bloco: number[], totalProdutos: number, totalBlocos: number): string {
  if (totalBlocos <= 1 || bloco.length === 0) return ''
  const primeiro = bloco[0] + 1
  const ultimo = bloco[bloco.length - 1] + 1
  return primeiro === ultimo
    ? `Produto ${primeiro} de ${totalProdutos}`
    : `Produtos ${primeiro} a ${ultimo} de ${totalProdutos}`
}

/** Formato brasileiro obrigatório (6.4): `R$ 1.234,56`. Nunca abreviado. */
export function brlPdf(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

/** `12,34%`. `null` vira travessão, jamais `0,00%` — `.claude/rules/ausente-vs-falso.md`. */
export function pctPdf(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${(Number(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`
}

/**
 * O texto da célula de percentual, com o rótulo "% médio" quando o número é MÉDIA PONDERADA
 * derivada dos produtos e não uma alíquota cadastrada (seção 6.4).
 *
 * O rótulo vai JUNTO DO NÚMERO, na mesma célula: quem confere alíquota olha a coluna, não a
 * prosa ao lado. E com alíquotas iguais NÃO se rotula — chamar de derivado o que é cadastrado
 * ensina o leitor a ignorar o rótulo.
 */
export function celulaPercentual(pct: number | null, isDerivedAverage: boolean): string {
  if (pct == null) return '—'
  return isDerivedAverage ? `${pctPdf(pct)} (% médio)` : pctPdf(pct)
}

/** Tolerância do residual, em R$. Acima disso a linha é ALERTA, não um número discreto. */
export const RESIDUAL_TOLERANCE_PDF = 0.01

/** As quatro linhas da distribuição do RRO (R20). */
const LINHAS_DO_RRO = new Set(['comissao', 'lucro', 'irpj', 'csll'])

/**
 * O percentual que a COLUNA do PDF exibe.
 *
 * Nas quatro linhas do RRO, o `pct` é o PESO da R20 — base RRO —, e o peso responde "quanto
 * desta sobra é comissão": 28,7% e 57,5% no cenário medido. Quem lê o PDF quer a outra
 * pergunta, "quanto do preço é comissão", e a resposta são os 5% e os 10% CADASTRADOS.
 *
 * É também o teste que fecha o invariante do RRO: se a base da decomposição estiver errada,
 * estes dois números deixam de ser os cadastrados — e isso aparece no papel, não num log.
 */
/**
 * A CÉLULA DA COLUNA DE UM PRODUTO — três linhas, e é o que a NF-e precisa.
 *
 * >>> POR QUE NÃO BASTA O VALOR <<<
 * Até aqui a coluna trazia só o valor em R$, e a base e o percentual eram UMA célula à
 * esquerda, do DOCUMENTO. Com produtos heterogêneos esse percentual é média ponderada
 * derivada — 13,88% de ICMS num documento de 17%, 12% e 7% —, um número que a construção
 * nunca usou e que nenhum item tem. Na NF-e cada item tem o seu `vBC` e o seu `pICMS`:
 * **média não existe lá**, e a base do documento dividida não é a base do item.
 *
 * As três linhas saem SEMPRE nesta ordem — valor, base, alíquota —, e a base e a alíquota
 * só aparecem quando a linha as tem por item. Onde não se aplica, a célula fica só com o
 * valor: um `R$ 0,00` de base afirmaria que o item não tem base de cálculo.
 *
 * A alíquota é impressa COMO VEM. Houve aqui um `Math.abs` que não fazia nada — nenhum
 * `pctPerItem` é negativo, e a mutação que o removia deixava os 15 casos verdes. Tirado em
 * vez de coberto por um caso inventado: o que garante o sinal é a origem do número, e é
 * isso que o teste afirma (`.claude/rules/teste-que-nao-exercita.md`).
 */
export function celulaDoProduto(row: DecompositionRow, k: number): string {
  if (row.perItem[k] === undefined) return '—'
  const linhas = [brlPdf(row.perItem[k])]
  const base = row.basePerItem[k]
  const pct = row.pctPerItem[k]
  if (base !== undefined) linhas.push(`base ${brlPdf(base)}`)
  if (pct !== undefined) linhas.push(pctPdf(pct))
  // R13 — o componente do ACRÉSCIMO, quando existe. Ele NÃO está no valor acima: o de cima
  // é o do DRE, este é o que vai na nota. Ver `DecompositionItem.acrescimosFiscais`.
  const acr = row.acrescimoPerItem[k]
  const baseAcr = row.baseAcrescimoPerItem[k]
  if (acr !== undefined && baseAcr !== undefined) {
    linhas.push(`+ frete ${brlPdf(acr)}`)
    linhas.push(`= fiscal ${brlPdf(Math.abs(row.perItem[k]) + acr)}`)
    linhas.push(`base fiscal ${brlPdf((base ?? 0) + baseAcr)}`)
  }
  return linhas.join('\n')
}

export function percentualDaLinha(row: { key: string; pct: number | null; pctSobreTotalGeral: number | null }): number | null {
  return LINHAS_DO_RRO.has(row.key) ? row.pctSobreTotalGeral : row.pct
}

export interface DecompositionPdfInput {
  decomposition: DecompositionResult
  itemLabels: string[]
}

/**
 * Acrescenta a decomposição ao documento, em páginas próprias e em paisagem.
 *
 * Não devolve nada: opera sobre o `doc` que já existe, porque o PDF é UM só — a decomposição
 * é a última seção dele, como o pedido diz ("AO FINAL da decomposição").
 */
export function appendDecompositionPages(doc: jsPDF, input: DecompositionPdfInput): void {
  const { decomposition, itemLabels } = input
  if (decomposition.rows.length === 0) return

  const blocos = planDecompositionColumnBlocks(itemLabels.length)
  const margin = 14

  blocos.forEach((bloco) => {
    doc.addPage('a4', 'landscape')
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text('Decomposição por produto', margin, 16)

    const rotulo = rotuloDoBloco(bloco, itemLabels.length, blocos.length)
    if (rotulo) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(110, 110, 110)
      doc.text(rotulo, pageWidth - margin, 16, { align: 'right' })
    }

    const head = [[
      'Demonstrativo',
      'Base de cálculo',
      'Percentual',
      ...bloco.map((k) => itemLabels[k] ?? `Produto ${k + 1}`),
      'Total',
    ]]

    const body = decomposition.rows.map((row) => [
      row.label,
      row.base == null ? '—' : brlPdf(row.base),
      celulaPercentual(percentualDaLinha(row), row.isDerivedAverage),
      ...bloco.map((k) => celulaDoProduto(row, k)),
      brlPdf(row.total),
    ])

    const residualForaDeZero = Math.abs(decomposition.residual.total) > RESIDUAL_TOLERANCE_PDF

    autoTable(doc, {
      startY: 22,
      head,
      body,
      margin: { left: margin, right: margin },
      // Fonte 7 com `cellWidth: 'wrap'` na primeira coluna: o rótulo QUEBRA em duas linhas
      // em vez de ser cortado. Nenhuma célula de VALOR tem largura fixa menor que o número.
      styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 62, fontStyle: 'bold' },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 26, halign: 'right' },
        // NOTA: `columnStyles` vale para corpo E cabeçalho. O `didParseCell` acima roda
        // DEPOIS e recentra o cabeçalho — é ele que decide, e por isso o alinhamento do
        // título não é declarado aqui.
      },
      didParseCell: (hook) => {
        // CABEÇALHO: o rótulo de cada coluna de valor fica CENTRADO sobre os números dela.
        // Alinhar o título à esquerda e os valores à direita faz o olho perder a coluna no
        // meio da tabela — e com N produtos lado a lado é onde a leitura se perde. A coluna
        // Demonstrativo continua à esquerda: ela é o eixo de leitura, não um valor.
        if (hook.section === 'head') {
          hook.cell.styles.halign = hook.column.index === 0 ? 'left' : 'center'
          return
        }
        if (hook.section !== 'body') return
        const row = decomposition.rows[hook.row.index]
        if (!row) return
        // Colunas de valor à direita, sempre.
        if (hook.column.index >= 3) hook.cell.styles.halign = 'right'
        if (row.isSubtotal) {
          hook.cell.styles.fontStyle = 'bold'
          hook.cell.styles.fillColor = [238, 242, 255]
        }
        // O RESIDUAL fora de zero é ALERTA. Um número em cinza ao lado dos outros seria
        // `portao-que-nao-alcanca.md` em forma de papel: o sinal existe e não interrompe.
        if (row.key === 'residual' && residualForaDeZero) {
          hook.cell.styles.fillColor = [254, 226, 226]
          hook.cell.styles.textColor = [153, 27, 27]
          hook.cell.styles.fontStyle = 'bold'
        }
      },
    })

    let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 22) + 6

    // O invariante do RRO: o apurado por subtração contra o que a construção reservou. O
    // RESIDUAL não cobre isto — ele fecha por construção, distribuindo o RRO inteiro seja
    // ele qual for, e foi assim que um CMV zerado inflou a conta em silêncio.
    if (decomposition.rro?.foraDeZero) {
      doc.setFontSize(8)
      doc.setTextColor(153, 27, 27)
      doc.text(
        `ATENÇÃO: o RRO apurado (${brlPdf(decomposition.rro.apurado)}) não bate com o reservado pela `
        + `construção (${brlPdf(decomposition.rro.esperado)}). Diferença de `
        + `${brlPdf(decomposition.rro.divergencia)} — há valor sem dedução correspondente.`,
        margin,
        y,
      )
      y += 6
    }

    if (residualForaDeZero) {
      doc.setFontSize(8)
      doc.setTextColor(153, 27, 27)
      doc.text(
        `ATENÇÃO: o residual não fechou em zero (${brlPdf(decomposition.residual.total)}). `
        + 'A distribuição do RRO não fechou e os números desta decomposição não podem ser usados.',
        margin,
        y,
      )
      y += 6
    }

    // LUCRO DA VENDA — destaque SEPARADO, abaixo da tabela. Não é linha do DRE: a última
    // linha é o RESIDUAL, e isso é requisito da seção 6.4.
    const lv = decomposition.lucroDaVenda
    if (lv) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(`LUCRO DA VENDA: ${brlPdf(lv.valor)}`, margin, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(110, 110, 110)
      doc.text(
        `${pctPdf(lv.pctApurado)} da receita após desconto  ·  ${pctPdf(lv.pctSobreProdutos)} sobre produtos, `
        + `contra ${pctPdf(lv.pctCadastrado)} cadastrados`,
        margin,
        y + 5,
      )
    }
  })
}
