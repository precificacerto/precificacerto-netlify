/**
 * A DECOMPOSIÇÃO NO PDF — a mesma tabela da tela, nos DOIS lugares.
 *
 * Regra da apresentação: `.claude/rules/decomposicao-na-tela.md`. O que este arquivo protege é
 * o que muda entre tela e papel: na tela a coluna Demonstrativo fica congelada PARA QUE as de
 * produto rolem; no papel não há rolagem, e a regra proíbe truncar — "um número truncado não
 * parece truncado".
 *
 * A saída escolhida é PAGINAR AS COLUNAS: até 7 produtos numa página paisagem, e acima disso
 * blocos sucessivos repetindo Demonstrativo e Total. Nenhum valor é cortado, e o eixo de
 * leitura acompanha cada bloco.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  MAX_PRODUTOS_POR_PAGINA,
  brlPdf,
  celulaPercentual,
  pctPdf,
  percentualDaLinha,
  planDecompositionColumnBlocks,
  rotuloDoBloco,
} from '@/lib/decomposition-pdf'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

describe('1. A PAGINAÇÃO DE COLUNAS — a resposta a "não há scroll e não se trunca"', () => {
  it('até 7 produtos cabem numa página só', () => {
    for (const n of [1, 2, 5, 7]) {
      const blocos = planDecompositionColumnBlocks(n)
      expect(blocos).toHaveLength(1)
      expect(blocos[0]).toHaveLength(n)
    }
  })

  it('acima de 7, quebra em blocos — e NENHUM produto some no caminho', () => {
    for (const n of [8, 14, 15, 20, 43]) {
      const blocos = planDecompositionColumnBlocks(n)
      expect(blocos.length).toBe(Math.ceil(n / MAX_PRODUTOS_POR_PAGINA))
      // O discriminante que importa: a união dos blocos é EXATAMENTE a lista de produtos,
      // na ordem, sem repetição e sem falta. Uma paginação que perdesse o último produto
      // truncaria o documento — que é o que a regra proíbe, em outro material.
      expect(blocos.flat()).toEqual(Array.from({ length: n }, (_, k) => k))
    }
  })

  it('cada bloco tem no máximo o limite, e só o último é menor', () => {
    const blocos = planDecompositionColumnBlocks(20)
    blocos.slice(0, -1).forEach((b) => expect(b).toHaveLength(MAX_PRODUTOS_POR_PAGINA))
    expect(blocos[blocos.length - 1]).toHaveLength(20 % MAX_PRODUTOS_POR_PAGINA)
  })

  it('documento SEM produto ainda rende uma página', () => {
    // Ele tem desconto, repasse de itens manuais e total. Sumir com a página inteira
    // esconderia exatamente o que alguém foi conferir.
    expect(planDecompositionColumnBlocks(0)).toEqual([[]])
  })

  it('o rótulo diz QUAIS produtos o bloco traz — e some quando há um bloco só', () => {
    const blocos = planDecompositionColumnBlocks(20)
    expect(rotuloDoBloco(blocos[0], 20, blocos.length)).toBe('Produtos 1 a 7 de 20')
    expect(rotuloDoBloco(blocos[1], 20, blocos.length)).toBe('Produtos 8 a 14 de 20')
    expect(rotuloDoBloco(blocos[2], 20, blocos.length)).toBe('Produtos 15 a 20 de 20')
    // Sem o rótulo, quem receber a segunda página lê um bloco achando que é o documento.
    expect(rotuloDoBloco([0], 5, 1)).toBe('')
  })

  it('bloco de UM produto tem rótulo no singular', () => {
    const blocos = planDecompositionColumnBlocks(8)
    expect(rotuloDoBloco(blocos[1], 8, blocos.length)).toBe('Produto 8 de 8')
  })
})

describe('2. FORMATO BRASILEIRO, e o travessão que não é zero', () => {
  /**
   * O `Intl` separa `R$` do número com ESPAÇO NÃO SEPARÁVEL (U+00A0), e é isso que o PDF tem
   * de carregar: com espaço comum, `R$` e o valor podem cair em linhas diferentes. A
   * normalização é do TESTE, para a asserção comparar o que se lê — nunca do formatador.
   */
  const semNbsp = (v: string) => v.replace(/\u00a0/g, ' ')

  it('valores em `R$ 1.234,56`, sem abreviação', () => {
    expect(semNbsp(brlPdf(1234.56))).toBe('R$ 1.234,56')
    expect(semNbsp(brlPdf(1234567.89))).toBe('R$ 1.234.567,89')
    expect(semNbsp(brlPdf(-2500))).toBe('-R$ 2.500,00')
    // E o NBSP está lá: é ele que impede a quebra entre o símbolo e o número.
    expect(brlPdf(1234.56)).toContain('\u00a0')
  })

  it('percentuais em `12,34%`', () => {
    expect(pctPdf(0.1234)).toBe('12,34%')
    expect(pctPdf(0.157324)).toBe('15,7324%')
  })

  it('ausente vira TRAVESSÃO, jamais `R$ 0,00` nem `0,00%`', () => {
    // Zero é uma afirmação sobre o mundo; "não apurado" não é zero.
    expect(brlPdf(null)).toBe('—')
    expect(brlPdf(undefined)).toBe('—')
    expect(pctPdf(null)).toBe('—')
    // E o contraste: zero DE VERDADE continua sendo exibido como zero.
    expect(semNbsp(brlPdf(0))).toBe('R$ 0,00')
    expect(pctPdf(0)).toBe('0,00%')
  })
})

describe('3. "% MÉDIO" — o rótulo vai JUNTO DO NÚMERO', () => {
  it('média ponderada derivada sai rotulada', () => {
    expect(celulaPercentual(0.157324, true)).toBe('15,7324% (% médio)')
  })

  it('alíquota cadastrada NÃO sai rotulada — o erro espelhado', () => {
    // Rotular tudo como média chama de derivado o que é cadastrado, e ensina o leitor a
    // ignorar o rótulo.
    expect(celulaPercentual(0.17, false)).toBe('17,00%')
  })

  it('e o rótulo está na CÉLULA do percentual, não na descrição da linha', () => {
    // Quem confere alíquota olha a coluna, não a prosa ao lado — por isso a função que
    // formata o percentual é a que carrega o rótulo.
    expect(celulaPercentual(0.157324, true)).toContain('%')
    expect(celulaPercentual(null, true)).toBe('—')
  })
})

describe('4. O PDF É UM SÓ, e a fonte da tabela é a MESMA da tela', () => {
  const pdf = ler('lib/create-cascade-pdf.ts')
  const orc = ler('pages/orcamentos/index.tsx')
  const mod = ler('lib/decomposition-pdf.ts')

  it('a decomposição é anexada ao documento, nos DOIS construtores de PDF', () => {
    // `buildDecompositionDoc` — o PDF do botão, só com a decomposição — e `buildCascadeDoc`,
    // o caminho legado que ainda imprime as etapas (pedido e venda, até serem ligados).
    expect((pdf.match(/appendDecompositionPages\(doc/g) || []).length).toBe(2)
    expect(pdf).toContain('appendDecompositionPages(doc, meta.decomposition)')
  })

  it('no PDF legado ela vem ao FINAL, depois das etapas e do rodapé', () => {
    const legado = pdf.slice(pdf.indexOf('export function buildCascadeDoc'))
    expect(legado.indexOf('appendDecompositionPages(doc')).toBeGreaterThan(legado.indexOf('DECOMPOSITION_PDF_FOOTER,'))
  })

  it('a tela passa a MESMA decomposição que exibe — não uma segunda montagem', () => {
    // Duas montagens seria `copia-divergente.md` entre o que o usuário vê e o que arquiva.
    expect(orc).toContain('decomposition: decomposition')
    expect(orc).toContain('{ decomposition: decomposition.result, itemLabels: decomposition.labels }')
    // E o PDF NÃO chama o motor: ele recebe o resultado pronto.
    expect(mod).not.toContain('buildDecomposition(')
  })

  it('sem decomposição, nada é anexado — `null` é ausência, não tabela vazia', () => {
    expect(pdf).toContain('if (meta.decomposition)')
  })

  it('a página da decomposição é PAISAGEM, e é própria', () => {
    expect(mod).toContain("doc.addPage('a4', 'landscape')")
  })

  it('nenhuma célula de VALOR tem largura fixa — só as três primeiras colunas', () => {
    // `columnStyles` fixa Demonstrativo, Base e Percentual. As colunas de produto e a Total
    // ficam livres, e o `overflow: linebreak` quebra em vez de cortar.
    expect(mod).toContain("overflow: 'linebreak'")
    const styles = mod.slice(mod.indexOf('columnStyles:'), mod.indexOf('didParseCell:'))
    expect(styles).toContain('0: { cellWidth: 62')
    expect(styles).toContain('1: { cellWidth: 30')
    expect(styles).toContain('2: { cellWidth: 26')
    expect(styles).not.toMatch(/\b[3-9]:\s*\{\s*cellWidth/)
  })

  it('o RESIDUAL fora de zero vira ALERTA, não um número em cinza', () => {
    expect(mod).toContain('residualForaDeZero')
    expect(mod).toContain('ATENÇÃO: o residual não fechou em zero')
  })

  it('LUCRO DA VENDA é destaque separado, depois da tabela', () => {
    expect(mod).toContain('LUCRO DA VENDA:')
    expect(mod.indexOf('LUCRO DA VENDA:')).toBeGreaterThan(mod.indexOf('autoTable(doc, {'))
    // Os DOIS percentuais, com as duas bases nomeadas: o par é o ponto da decomposição.
    expect(mod).toContain('da receita após desconto')
    expect(mod).toContain('sobre produtos')
  })
})

describe('5. COMISSÃO E LUCRO em % do TOTAL GERAL — o teste que fecha o invariante', () => {
  const row = (key: string, pct: number | null, pctTotal: number | null) =>
    ({ key, pct, pctSobreTotalGeral: pctTotal })

  it('as quatro linhas do RRO exibem o % sobre o total, não o peso', () => {
    // O peso responde "quanto desta sobra é comissão" (28,7%); quem lê o PDF quer "quanto do
    // preço é comissão" (5%), que é o CADASTRADO.
    expect(percentualDaLinha(row('comissao', 0.2874, 0.05))).toBeCloseTo(0.05, 6)
    expect(percentualDaLinha(row('lucro', 0.5747, 0.10))).toBeCloseTo(0.10, 6)
    expect(percentualDaLinha(row('irpj', 0.0862, 0.015))).toBeCloseTo(0.015, 6)
    expect(percentualDaLinha(row('csll', 0.0517, 0.009))).toBeCloseTo(0.009, 6)
  })

  it('e as demais linhas continuam com o SEU percentual', () => {
    // O discriminante: se todas passassem a usar o % do total, o ICMS deixaria de exibir a
    // alíquota cadastrada — e é ela que se confere contra o cadastro do produto.
    expect(percentualDaLinha(row('icms', 0.17, 0.17))).toBeCloseTo(0.17, 6)
    expect(percentualDaLinha(row('desconto', 0.05, 0.05))).toBeCloseTo(0.05, 6)
    expect(percentualDaLinha(row('custos', null, 0.28))).toBeNull()
  })
})
