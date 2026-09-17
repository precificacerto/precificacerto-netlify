/**
 * A RECEITA BRUTA COM ITENS MANUAIS **E** ACRÉSCIMOS — o cenário que nenhum caso tinha.
 *
 * >>> POR QUE ELE FALTAVA, e é a variante 2 de `teste-que-nao-exercita.md` <<<
 *
 * Havia casos com acréscimos e casos com item manual. Nenhum com os DOIS. E sem item manual
 * `itensManuaisComAcrescimos` é ZERO, então:
 *
 *     receitaBruta = soma(colunas) + 0 === soma(colunas)
 *
 * — e o total informado coincide com a soma das colunas. **O caso não discriminava**: quem
 * imprimisse `total` e quem imprimisse `soma(perItem)` davam o mesmo número.
 *
 * ── OS DOIS DEFEITOS, medidos no ORC-5487 ────────────────────────────────────
 *
 * **1. A RECEITA BRUTA impressa perdia a linha de itens manuais.**
 *
 * | | |
 * |---|---:|
 * | RECEITA BRUTA exibida | R$ 40.287,30 |
 * | (−) Desconto | R$ 2.271,73 |
 * | = | R$ 38.015,57 |
 * | RECEITA APÓS DESCONTO impressa | **R$ 43.162,85** |
 * | diferença | **R$ 5.147,28** — a linha de manuais |
 *
 * O `total` do módulo SEMPRE esteve certo, e o desconto usou o número certo: R$ 2.271,73
 * são 5% de R$ 45.434,58, não de R$ 40.287,30. **Não eram duas fontes** — era `totalExibido`
 * imprimindo a soma das colunas, e os itens manuais não têm coluna (R13).
 *
 * `totalExibido` existe por uma razão boa: a NF-e valida que a soma dos itens é igual ao
 * total, e o arredondamento por coluna divergia em centavos. Ela pressupunha que o total É a
 * soma das colunas — verdade em 23 das 24 linhas. A RECEITA BRUTA é a única que tem colunas
 * E uma parcela fora delas.
 *
 * **2. O cabeçalho do PDF divergia da tabela.**
 *
 * | | |
 * |---|---:|
 * | cabeçalho "Valor Total" | R$ 44.134,58 |
 * | base real da tabela | R$ 45.434,58 |
 * | diferença | **R$ 1.300,00** — os acréscimos |
 *
 * `budgetTotal` é `Σ unit_price × quantity`, que soma produtos e manuais e **ignora os
 * acréscimos**, porque eles vivem no documento e são rateados. Este SIM era duas contas para
 * o mesmo número — `copia-divergente.md` —, e o remédio é apagar uma.
 */

import { buildDecomposition, totalExibido, type DecompositionResult } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { buildCascadeView, totalExibidoDaView } from '@/utils/cascade-display-view'
import { readFileSync } from 'fs'
import { join } from 'path'

const BALDES = { fixa: 0.1489, variavel: 0.0556, financeira: 0.0056, indireta: 0.0756, moProdutiva: 0 }
const DESCONTO = 0.05

const prod = (key: string, unitPrice: number, custo: number, acrescimos: number): BudgetDecompositionItem => ({
  key, label: `Produto ${key}`, quantity: 1, unitPrice,
  costUnit: custo, productiveLaborUnit: 0,
  commissionPct: 5, profitPct: 10, rtPct: 0,
  rates: { icms_pct: 17, pis_pct: 0.076775, cofins_pct: 0, ibs_pct: 1, cbs_pct: 9, ipi_pct: 0, is_pct: 0 },
  acrescimos,
})

/** O documento COMPLETO: dois produtos, frete e seguro rateados, e um item manual. */
const MANUAL = 5147.28
const ACRESC_A = 1152.72
const ACRESC_B = 147.28
const COMPLETO: BudgetDecompositionItem[] = [
  prod('a', 24000, 7000, ACRESC_A),
  prod('b', 15134.58, 4500, ACRESC_B),
  { key: 'm', label: 'Item manual', isManual: true, quantity: 1, unitPrice: MANUAL, acrescimos: 0 },
]

/** O MESMO documento sem o item manual — o contraste que prova que o caso discrimina. */
const SEM_MANUAL = COMPLETO.filter((i) => !i.isManual)

const montar = (items: BudgetDecompositionItem[], discountPct = DESCONTO) =>
  buildDecomposition(buildBudgetDecompositionInput({
    items, discountPct, despesas: BALDES, tenantCalcType: 'INDUSTRIALIZACAO',
  }).input)

const r = montar(COMPLETO)
const linha = (d: DecompositionResult, k: string) => d.rows.find((x) => x.key === k)!
const impresso = (d: DecompositionResult, k: string) => totalExibido(linha(d, k))

describe('1. A RECEITA BRUTA inclui os itens manuais — no cálculo E no impresso', () => {
  it('>>> o total IMPRESSO não perde mais a linha de manuais <<<', () => {
    const bruta = linha(r, 'receita_bruta')
    const colunas = bruta.perItem.reduce((a, b) => a + b, 0)
    // As colunas são só os produtos com acréscimos — os manuais não têm coluna (R13).
    expect(bruta.perItem).toHaveLength(2)
    expect(colunas).toBeCloseTo(40434.58, 2)
    // E o impresso é colunas + a parcela fora delas.
    expect(impresso(r, 'receita_bruta')).toBeCloseTo(colunas + MANUAL, 2)
    // O DISCRIMINANTE: antes o impresso era a soma das colunas, e perdia R$ 5.147,28.
    expect(impresso(r, 'receita_bruta')).not.toBeCloseTo(colunas, 2)
  })

  it('a parcela fora das colunas é DECLARADA, não inferida da diferença', () => {
    // Inferi-la por `total − soma(perItem)` confundiria a exceção com um centavo de
    // arredondamento. Aqui ela é afirmada na origem.
    expect(linha(r, 'receita_bruta').foraDasColunas).toBeCloseTo(MANUAL, 2)
    // E é ZERO em toda linha cujo total É a soma das colunas.
    for (const k of ['icms', 'custos', 'despesas', 'rro', 'receita_produtos']) {
      expect(linha(r, k).foraDasColunas).toBe(0)
    }
  })

  it('>>> RECEITA BRUTA − desconto = RECEITA APÓS DESCONTO, EXATO <<<', () => {
    // O invariante que foi medido quebrado na tela, em R$ 5.147,28. No número interno ele
    // sempre valeu — e continua valendo ao centésimo de centavo.
    expect(linha(r, 'receita_bruta').total + linha(r, 'desconto').total)
      .toBeCloseTo(linha(r, 'receita_apos_desconto').total, 6)
  })

  it('e no IMPRESSO ele fecha a MENOS DE UM CENTAVO — o limite é conhecido e é de desenho', () => {
    /**
     * MEDIDO AO ESCREVER ESTE CASO, e ele derrubou a primeira versão da asserção, que
     * exigia igualdade a duas casas.
     *
     * `totalExibido` imprime por critérios DIFERENTES conforme a linha tenha coluna:
     *
     *   RECEITA BRUTA        tem coluna  → Σ colunas arredondadas + a parcela fora delas
     *   Desconto             tem coluna  → Σ colunas arredondadas       = −2.279,10
     *   RECEITA APÓS DESC.   SEM coluna  → o próprio total arredondado  =  43.302,77
     *
     * `45.581,86 − 2.279,10 = 43.302,76`, contra 43.302,77. **Um centavo**, e ele é
     * INERENTE: a linha sem coluna não tem colunas a somar, e inventar um array de zeros
     * mudaria o número — está escrito na própria `totalExibido`.
     *
     * Isto NÃO é o defeito que esta rodada corrigiu (R$ 5.147,28, uma linha inteira). Fica
     * afirmado com a tolerância certa para que ninguém confunda os dois nem "conserte" o
     * arredondamento desfazendo o conserto dos centavos da NF-e.
     */
    const delta = impresso(r, 'receita_bruta') + impresso(r, 'desconto') - impresso(r, 'receita_apos_desconto')
    expect(Math.abs(delta)).toBeLessThan(0.02)
    // E o DISCRIMINANTE: antes da correção o delta era a linha de manuais inteira.
    expect(Math.abs(delta)).toBeLessThan(MANUAL / 100)
  })

  it('e o DESCONTO sempre incidiu sobre a base certa — não eram duas fontes', () => {
    // 5% sobre produtos + acréscimos + manuais. Se o desconto usasse a soma das colunas,
    // ele sairia menor — e é a prova de que o cálculo estava certo e a impressão não.
    const base = 40434.58 + MANUAL
    expect(Math.abs(linha(r, 'desconto').total)).toBeCloseTo(base * DESCONTO, 2)
    expect(Math.abs(linha(r, 'desconto').total)).not.toBeCloseTo(40434.58 * DESCONTO, 2)
  })
})

describe('2. O CONTRASTE — sem item manual o caso NÃO discrimina, e é por isso que faltava', () => {
  const s = montar(SEM_MANUAL)

  it('>>> sem manuais, total e soma das colunas COINCIDEM <<<', () => {
    const bruta = linha(s, 'receita_bruta')
    const colunas = bruta.perItem.reduce((a, b) => a + b, 0)
    expect(bruta.total).toBeCloseTo(colunas, 2)
    expect(bruta.foraDasColunas).toBe(0)
    // Aqui imprimir `total` ou `soma(perItem)` dá o MESMO número — o defeito era invisível.
    expect(totalExibido(bruta)).toBeCloseTo(colunas, 2)
  })

  it('e COM acréscimos mas SEM manual o invariante já fechava — os acréscimos TÊM coluna', () => {
    // O acréscimo entra na coluna do produto que o recebeu (R12), então ele nunca foi o
    // problema. Sem esta distinção alguém "consertaria" os acréscimos também.
    expect(linha(s, 'receita_bruta').perItem[0]).toBeCloseTo(24000 + ACRESC_A, 2)
    expect(totalExibido(linha(s, 'receita_bruta')) + totalExibido(linha(s, 'desconto')))
      .toBeCloseTo(totalExibido(linha(s, 'receita_apos_desconto')), 2)
  })
})

describe('3. O CENTAVO continua consertado — totalExibido não perdeu a razão de existir', () => {
  it('as linhas COM coluna seguem imprimindo a soma das colunas arredondadas', () => {
    // O defeito original: `total` exato contra Σ colunas formatadas divergia em R$ 0,01, e
    // a NF-e rejeita a nota por isso. Medido aqui: três linhas ainda divergem do `total`
    // interno em um centavo — e é o comportamento DESEJADO.
    const divergem = r.rows.filter((row) => Math.abs(totalExibido(row) - row.total) > 0.005)
    // A `receita_bruta` NÃO está mais entre elas.
    expect(divergem.map((x) => x.key)).not.toContain('receita_bruta')
    // E as que sobram divergem por CENTAVOS, não por uma linha inteira.
    for (const row of divergem) {
      expect(Math.abs(totalExibido(row) - row.total)).toBeLessThan(0.02)
    }
  })

  it('linha SEM coluna devolve o próprio total — não há colunas a somar', () => {
    expect(totalExibido({ perItem: [], total: 1234.567 })).toBe(1234.57)
    expect(totalExibido({ perItem: [], total: 1234.567, foraDasColunas: 0 })).toBe(1234.57)
  })
})

describe('4. O CABEÇALHO lê a decomposição — uma fonte só', () => {
  it('>>> `totalGeral` é produtos + acréscimos + manuais (R10) <<<', () => {
    expect(r.totalGeral).toBeCloseTo(40434.58 + MANUAL, 2)
    // O DISCRIMINANTE: `Σ unit_price × quantity` ignora os acréscimos e dá R$ 1.300 a menos.
    const somaUnitPrice = 24000 + 15134.58 + MANUAL
    expect(r.totalGeral).not.toBeCloseTo(somaUnitPrice, 2)
    expect(r.totalGeral - somaUnitPrice).toBeCloseTo(ACRESC_A + ACRESC_B, 2)
  })

  it('e ele É a RECEITA BRUTA da tabela — o mesmo número, não dois parecidos', () => {
    expect(r.totalGeral).toBeCloseTo(linha(r, 'receita_bruta').total, 6)
  })

  it('as duas telas LEEM dali, e só caem no próprio quando não há decomposição', () => {
    const orc = readFileSync(join(__dirname, '..', '..', 'pages', 'orcamentos', 'index.tsx'), 'utf-8')
    const ped = readFileSync(join(__dirname, '..', '..', 'pages', 'pedidos', 'index.tsx'), 'utf-8')
    expect(orc).toContain('totalValue: decomposition ? decomposition.result.totalGeral : budgetTotal')
    expect(ped).toContain('totalValue: orderDecomposition ? orderDecomposition.result.totalGeral : orderSubtotal')
    // Sem decomposição não há tabela com que divergir — ali o número próprio é o único.
    expect(orc).not.toContain('totalValue: budgetTotal,')
  })
})

describe('5. A VIEW e a TELA — a travessia é UMA', () => {
  it('a view carrega a parcela fora das colunas', () => {
    const view = buildCascadeView([], r)
    const bruta = view.find((v) => v.label.includes('RECEITA BRUTA'))!
    expect(bruta.foraDasColunas).toBeCloseTo(MANUAL, 2)
    // E o helper da view devolve o mesmo que o do módulo.
    expect(totalExibidoDaView(bruta)).toBeCloseTo(impresso(r, 'receita_bruta'), 2)
  })

  it('>>> a tela NÃO monta o argumento à mão — era construtor-empobrecido <<<', () => {
    const bloco = readFileSync(
      join(__dirname, '..', '..', 'page-parts', 'shared', 'consolidated-dre-block.component.tsx'), 'utf-8')
    // Os dois literais eram dois produtores do mesmo argumento. Quando o campo nasceu, os
    // dois ficaram sem ele e NADA falhou — o default é zero.
    expect(bloco).not.toContain('totalExibido({ perItem: row.perItem, total: row.valor })')
    expect((bloco.match(/totalExibidoDaView\(row\)/g) || []).length).toBe(2)
  })

  it('e o PDF já passava a linha INTEIRA — por isso ele nunca teve este defeito', () => {
    const pdf = readFileSync(join(__dirname, '..', '..', 'lib', 'decomposition-pdf.ts'), 'utf-8')
    expect(pdf).toContain('brlPdf(totalExibido(row)),')
  })
})
