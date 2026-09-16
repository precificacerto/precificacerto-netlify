/**
 * O TOTAL IMPRESSO É A SOMA DAS COLUNAS ARREDONDADAS — a NF-e valida isso.
 *
 * "A NF-e valida que a soma dos itens é igual ao total. Se cada coluna arredonda a 2 casas e
 *  o total é calculado à parte, os dois divergem em centavos e a nota é rejeitada."
 *
 * >>> A MEDIÇÃO, com três produtos de valores quebrados e 5% de desconto <<<
 *
 *   linha                   Σ colunas      total        Δ
 *   ICMS                    −3.119,38    −3.119,37    −0,01
 *   PIS/COFINS              −1.788,75    −1.788,76    +0,01
 *   CBS                       −936,61      −936,60    −0,01
 *   OPERAÇÃO POR DENTRO     21.092,09    21.092,08    +0,01
 *   RECEITA LÍQUIDA         16.183,96    16.183,95    +0,01
 *   Comissão                   643,54       643,53    +0,01
 *   Lucro                    1.227,82     1.227,83    −0,01
 *
 * SETE linhas. O PDF imprimia `−R$ 1.991,32 | −R$ 898,47 | −R$ 229,59` e total
 * `−R$ 3.119,37`; quem somasse as colunas achava 3.119,38.
 *
 * >>> O NÚMERO INTERNO NÃO MUDA, E ISSO É O PONTO <<<
 * É o `total` exato que faz a decomposição bater com a construção ao centavo, e mexer nele
 * desfaria várias rodadas. O que muda é o que se IMPRIME — `totalExibido`, uma função pura
 * usada pelo PDF e pela tela, e por mais ninguém.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDecomposition, centavos, totalExibido } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'

/** Valores QUEBRADOS de propósito: com valores redondos o arredondamento não discrimina. */
const TRES = [
  { key: 'a', label: 'P1', quantity: 1, unitPrice: 12345.67, costUnit: 4000.11, productiveLaborUnit: 500.23,
    commissionPct: 5, profitPct: 10, rtPct: 0, acrescimos: 333.33,
    rates: { icms_pct: 17, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0 } },
  { key: 'b', label: 'P2', quantity: 3, unitPrice: 2630.41, costUnit: 900.77, productiveLaborUnit: 111.11,
    commissionPct: 8, profitPct: 6, rtPct: 0, acrescimos: 177.77,
    rates: { icms_pct: 12, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0.5, cbs_pct: 4, is_pct: 0, ipi_pct: 5 } },
  { key: 'c', label: 'P3', quantity: 7, unitPrice: 493.83, costUnit: 150.19, productiveLaborUnit: 0,
    commissionPct: 3, profitPct: 12, rtPct: 0, acrescimos: 55.55,
    rates: { icms_pct: 7, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0, cbs_pct: 0, is_pct: 0, ipi_pct: 0 } },
]
const r = buildDecomposition(buildBudgetDecompositionInput({
  items: TRES as never, discountPct: 0.05, despesasOperacionaisPct: 0.2292,
}).input)
const L = (k: string) => r.rows.find((x) => x.key === k)!

describe('1. O INVARIANTE DA NF-e: Σ colunas impressas = total impresso', () => {
  it('fecha em TODA linha com coluna, ao centavo', () => {
    const comColuna = r.rows.filter((x) => x.perItem.length > 0)
    expect(comColuna.length).toBeGreaterThan(10)
    for (const row of comColuna) {
      const somaImpressa = row.perItem.reduce((a, v) => a + centavos(v), 0)
      expect(centavos(somaImpressa)).toBe(totalExibido(row))
    }
  })

  it('e o cenário DE FATO produz divergência sem a correção — senão nada foi exercitado', () => {
    // O discriminante: com o total exato, pelo menos uma linha diverge da soma das colunas
    // arredondadas. Num documento de valores redondos isso não aconteceria, e o caso acima
    // passaria sem provar nada (`teste-que-nao-exercita.md`, variante 2).
    const divergentes = r.rows.filter((row) => {
      if (row.perItem.length === 0) return false
      const soma = centavos(row.perItem.reduce((a, v) => a + centavos(v), 0))
      return Math.abs(soma - centavos(row.total)) > 0.0000001
    })
    expect(divergentes.length).toBeGreaterThanOrEqual(5)
    expect(divergentes.map((x) => x.key)).toContain('icms')
  })

  it('o ICMS é o caso medido: colunas somam −3.119,38, e o total exato dava −3.119,37', () => {
    expect(L('icms').perItem.map(centavos)).toEqual([-1991.32, -898.47, -229.59])
    expect(totalExibido(L('icms'))).toBe(-3119.38)
    expect(centavos(L('icms').total)).toBe(-3119.37)
  })
})

describe('2. O NÚMERO INTERNO segue exato — é ele que bate com a construção', () => {
  it('`total` não foi tocado: continua a soma sem arredondar', () => {
    for (const row of r.rows) {
      if (row.perItem.length === 0) continue
      expect(row.total).toBeCloseTo(row.perItem.reduce((a, b) => a + b, 0), 10)
    }
    // E ele DIFERE do exibido em pelo menos uma linha — se fossem iguais, a função não
    // estaria fazendo nada.
    expect(totalExibido(L('icms'))).not.toBe(centavos(L('icms').total))
  })

  it('o residual e o RRO continuam sobre o número exato', () => {
    expect(r.residual.total).toBeCloseTo(0, 6)
  })
})

describe('3. Linha SEM coluna devolve o próprio total', () => {
  it('desconto e repasse dos manuais não têm colunas a somar', () => {
    for (const k of ['receita_apos_desconto', 'repasse_manuais']) {
      expect(L(k).perItem).toHaveLength(0)
      expect(totalExibido(L(k))).toBe(centavos(L(k).total))
    }
    // Inventar um array de zeros aqui mudaria o número para R$ 0,00.
    expect(totalExibido({ perItem: [], total: 1234.567 })).toBe(1234.57)
  })

  it('`centavos` arredonda, não trunca', () => {
    expect(centavos(1.006)).toBe(1.01)
    expect(centavos(1.004)).toBe(1)
    expect(centavos(-1.006)).toBe(-1.01)
    // Truncar daria 1,00 nos dois primeiros: é o contraste que separa as duas coisas.
    expect(centavos(1.006)).not.toBe(1)
  })

  it('o LIMITE do meio-centavo, medido e registrado em vez de escondido', () => {
    // `1.005 × 100` é 100.49999999999999 em IEEE-754, então `Math.round` devolve 100 e o
    // resultado é 1,00 e não 1,01. Não é defeito desta função — é a representação binária —,
    // e a diferença é de MEIO CENTAVO num valor. O invariante que importa para a NF-e é a
    // igualdade entre a soma das colunas e o total, e ele não depende disto: os dois lados
    // passam pela MESMA função.
    expect(centavos(1.005)).toBe(1)
    expect(1.005 * 100).toBeLessThan(100.5)
  })
})

describe('4. A JUNTA — o PDF e a tela imprimem o total exibido', () => {
  it('o PDF usa `totalExibido`, não `row.total`', () => {
    const pdf = readFileSync(join(__dirname, '..', '..', 'lib', 'decomposition-pdf.ts'), 'utf-8')
    expect(pdf).toContain('brlPdf(totalExibido(row)),')
    expect(pdf).not.toContain('brlPdf(row.total),')
  })

  it('a tela idem, no desktop E no mobile', () => {
    const bloco = readFileSync(
      join(__dirname, '..', '..', 'page-parts', 'shared', 'consolidated-dre-block.component.tsx'), 'utf-8')
    expect((bloco.match(/totalExibido\(\{ perItem: row\.perItem, total: row\.valor \}\)/g) || []).length).toBe(2)
    expect(bloco).not.toContain('{formatBRL(row.valor)}')
  })
})
