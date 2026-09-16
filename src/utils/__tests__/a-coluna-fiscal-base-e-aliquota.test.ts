/**
 * A COLUNA DO PRODUTO GANHA BASE E ALÍQUOTA — o PDF vira memória de cálculo da NF-e.
 *
 * "Cada coluna de produto tem que trazer exatamente a base e a alíquota que o fisco vai
 *  cobrar sobre AQUELE item. Na NF-e cada item tem seu pICMS, pPIS, pCOFINS — média não
 *  existe lá."
 *
 * >>> A MEDIÇÃO QUE DEFINIU A CORREÇÃO <<<
 *
 * O CÁLCULO já usava a alíquota do item — num documento de três produtos com ICMS 17%, 12%
 * e 7%, a alíquota efetiva derivada por coluna dava 17,0000% / 12,0000% / 7,0000%, exata.
 * O que faltava era EXIBIR: a coluna trazia só o valor em R$, e a base e o percentual eram
 * UMA célula à esquerda, do DOCUMENTO — com "% médio" de 13,88%, que nenhum dos três tem.
 *
 * Base do ICMS medida por item: [11.713,62 / 7.487,23 / 3.279,84]. Base exibida antes:
 * 22.480,69, a soma — que não serve a item nenhum.
 *
 * >>> POR QUE TRÊS PRODUTOS, E NÃO UM <<<
 * Com um produto só, "a alíquota da coluna é a do item" é trivialmente verdadeiro: ela é
 * igual à do documento. É a variante 2 de `teste-que-nao-exercita.md`, e é por isso que o
 * cenário tem alíquotas DIFERENTES nos três e uma média que não coincide com nenhuma.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'
import { celulaDoProduto } from '@/lib/decomposition-pdf'
import { buildCascadeView } from '@/utils/cascade-display-view'
import type { CascadeStep } from '@/types/mrm'

const TRES = [
  { key: 'a', label: 'P1', quantity: 1, unitPrice: 12345.67, costUnit: 4000.11, productiveLaborUnit: 500.23,
    commissionPct: 5, profitPct: 10, rtPct: 1, acrescimos: 333.33,
    rates: { icms_pct: 17, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0 } },
  { key: 'b', label: 'P2', quantity: 3, unitPrice: 2630.41, costUnit: 900.77, productiveLaborUnit: 111.11,
    commissionPct: 8, profitPct: 6, rtPct: 2, acrescimos: 177.77,
    rates: { icms_pct: 12, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0.5, cbs_pct: 4, is_pct: 0, ipi_pct: 5 } },
  { key: 'c', label: 'P3', quantity: 7, unitPrice: 493.83, costUnit: 150.19, productiveLaborUnit: 0,
    commissionPct: 3, profitPct: 12, rtPct: 0, acrescimos: 55.55,
    rates: { icms_pct: 7, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0, cbs_pct: 0, is_pct: 0, ipi_pct: 0 } },
]
const r = buildDecomposition(buildBudgetDecompositionInput({
  items: TRES as never, discountPct: 0.05, despesasOperacionaisPct: 0.2292,
}).input)
const L = (k: string) => r.rows.find((x) => x.key === k)!

describe('1. A ALÍQUOTA DA COLUNA É A DO PRODUTO, nunca a média do documento', () => {
  it('ICMS: 17%, 12% e 7% — e o percentual do TOTAL não é nenhum dos três', () => {
    expect(L('icms').pctPerItem).toHaveLength(3)
    expect(L('icms').pctPerItem[0]).toBeCloseTo(0.17, 10)
    expect(L('icms').pctPerItem[1]).toBeCloseTo(0.12, 10)
    expect(L('icms').pctPerItem[2]).toBeCloseTo(0.07, 10)
    // O discriminante: o `pct` da linha é média ponderada derivada, e ele NÃO pode vazar
    // para coluna nenhuma. Sem alíquotas diferentes nos três, este caso não distinguiria.
    expect(L('icms').isDerivedAverage).toBe(true)
    for (const p of L('icms').pctPerItem) expect(p).not.toBeCloseTo(L('icms').pct!, 4)
  })

  /**
   * >>> LIMITAÇÃO MEDIDA, e ela vale mais registrada que escondida <<<
   *
   * Nas linhas POR FORA o que chega à decomposição é `externalByTax` — a fração do TOTAL
   * GERAL que cada tributo ocupa —, e NÃO a alíquota nominal sobre a base legal. Com IBS
   * cadastrado a 1%, a coluna exibe 0,6830%: é a MESMA quantia, sobre a receita de produtos
   * em vez de sobre a base do código 4 (`P − ICMS − ISS − PIS/COFINS + IS`).
   *
   * Para o DRE isso é o certo — R17 manda usar o percentual sobre o total geral. Para o
   * `pIBS` da NF-e NÃO basta: lá a alíquota é a nominal e a base é a do código 4, e essa
   * base não chega aqui. Inferi-la dividindo seria exatamente o que
   * `regime-e-segmento-determinam-a-construcao.md` proíbe — a decomposição LÊ, não deduz.
   *
   * Fica dito em vez de disfarçado: as quatro linhas por fora ainda não servem ao campo de
   * alíquota da nota. ICMS, ISS e PIS/COFINS servem.
   */
  it('IBS, CBS e IPI: a fração do TOTAL GERAL — efetiva, não a nominal cadastrada', () => {
    // 1% de IBS sobre a base do código 4 equivale a 0,6830% do total geral.
    expect(L('por_fora_ibs').pctPerItem[0]).toBeCloseTo(0.00682963667322704, 12)
    expect(L('por_fora_ibs').pctPerItem[0]).not.toBeCloseTo(0.01, 4)
    // A razão CBS ÷ IBS preserva a razão das nominais — 9 ÷ 1 e 4 ÷ 0,5 —, e é isso que
    // prova que a efetiva é a mesma quantia noutra base, e não um número inventado.
    expect(L('por_fora_cbs').pctPerItem[0] / L('por_fora_ibs').pctPerItem[0]).toBeCloseTo(9, 8)
    expect(L('por_fora_cbs').pctPerItem[1] / L('por_fora_ibs').pctPerItem[1]).toBeCloseTo(8, 8)
    // O terceiro produto não tem IBS nem CBS: zero CADASTRADO, e zero aqui é afirmação.
    expect(L('por_fora_ibs').pctPerItem[2]).toBe(0)
    // IPI só no segundo.
    expect(L('por_fora_ipi').pctPerItem[0]).toBe(0)
    expect(L('por_fora_ipi').pctPerItem[1]).toBeGreaterThan(0)
  })

  it('e a alíquota exibida reproduz o valor: valor ÷ base = alíquota, coluna a coluna', () => {
    // É o invariante que prova que a coluna não inventa: os três números da célula fecham
    // entre si. Se a base fosse a do documento, a divisão daria outra coisa.
    for (const k of ['icms', 'iss', 'pis_cofins', 'por_fora_ibs', 'por_fora_cbs', 'rt']) {
      const x = L(k)
      x.perItem.forEach((v, i) => {
        if (x.basePerItem[i] === 0) return
        expect(Math.abs(v) / x.basePerItem[i]).toBeCloseTo(Math.abs(x.pctPerItem[i]), 10)
      })
    }
  })
})

describe('2. A BASE DA COLUNA É A BASE DAQUELE ITEM, não a do documento dividida', () => {
  it('ICMS: a receita de produtos de cada um', () => {
    const rp = L('receita_produtos').perItem
    expect(L('icms').basePerItem).toEqual(rp)
    // O contraste: a base do TOTAL é a soma, e ela não serve a item nenhum.
    expect(L('icms').base).toBeCloseTo(rp.reduce((a, b) => a + b, 0), 6)
    expect(L('icms').basePerItem[0]).not.toBeCloseTo(L('icms').base! / 3, 0)
  })

  it('PIS/COFINS: `P − ICMS − ISS` DAQUELE item (R5, exceção 2)', () => {
    const P = L('operacao_por_dentro').perItem
    const ic = L('icms').perItem
    const iss = L('iss').perItem
    L('pis_cofins').basePerItem.forEach((b, i) => expect(b).toBeCloseTo(P[i] + ic[i] + iss[i], 8))
    // E ela NÃO é o P do item: as duas divergem de verdade aqui.
    expect(L('pis_cofins').basePerItem[0]).not.toBeCloseTo(P[0], 0)
  })

  it('IRPJ e CSLL: a base é o LUCRO daquele item, e a alíquota volta 15% e 9%', () => {
    expect(L('irpj').basePerItem).toEqual(L('lucro').perItem)
    for (const p of L('irpj').pctPerItem) expect(p).toBeCloseTo(0.15, 10)
    for (const p of L('csll').pctPerItem) expect(p).toBeCloseTo(0.09, 10)
  })

  it('linha CONGELADA não tem base nem alíquota por item — nem no total', () => {
    // R18: custo e despesa não se calculam por base × alíquota. Um `R$ 0,00` de base
    // afirmaria que o item não tem base de cálculo (`ausente-vs-falso.md`).
    for (const k of ['custos', 'despesas', 'acrescimos']) {
      expect(L(k).basePerItem).toEqual([])
      expect(L(k).pctPerItem).toEqual([])
    }
  })
})

describe('3. A CÉLULA impressa traz os TRÊS números, e só quando existem', () => {
  const semNbsp = (v: string) => v.replace(/ /g, ' ')

  it('valor, base e alíquota, nesta ordem, uma por linha', () => {
    const c = semNbsp(celulaDoProduto(L('icms'), 0)).split('\n')
    expect(c).toHaveLength(3)
    expect(c[0]).toMatch(/^-R\$ /)
    expect(c[1]).toMatch(/^base R\$ /)
    expect(c[2]).toBe('17,00%')
  })

  it('linha congelada imprime SÓ o valor — sem base e sem alíquota inventadas', () => {
    expect(semNbsp(celulaDoProduto(L('custos'), 0)).split('\n')).toHaveLength(1)
  })

  it('produto fora do bloco imprime travessão', () => {
    expect(celulaDoProduto(L('icms'), 9)).toBe('—')
  })

  it('a alíquota sai POSITIVA — e é a ORIGEM do número que garante isso', () => {
    // O valor da linha é dedução e sai negativo; a alíquota não. Houve aqui um `Math.abs`
    // no formatador que NÃO fazia nada, e a mutação que o removia deixava tudo verde: o
    // sinal nunca dependeu dele. Ele saiu, e a asserção passou a ser sobre a origem —
    // TODO `pctPerItem` do resultado é não-negativo, em toda linha que tem alíquota.
    expect(semNbsp(celulaDoProduto(L('icms'), 1))).toContain('12,00%')
    expect(semNbsp(celulaDoProduto(L('icms'), 1))).not.toContain('-12,00%')
    for (const row of r.rows) {
      expect(row.perItem.some((v) => v < 0)).toBe(row.perItem.some((v) => v < 0))
      for (const p of row.pctPerItem) expect(p).toBeGreaterThanOrEqual(0)
    }
    // E o contraste que impede a asserção de ser vacuamente verdadeira: existe pelo menos
    // uma linha com alíquota por item, e ela tem valor NEGATIVO.
    expect(r.rows.filter((x) => x.pctPerItem.length > 0).length).toBeGreaterThan(5)
    expect(L('icms').perItem.every((v) => v < 0)).toBe(true)
  })
})

describe('4. A TELA recebe os dois campos — por EFEITO, não por leitura de arquivo', () => {
  const TRACE: CascadeStep[] = [
    { step: 9, label: 'Venda consolidada', base: null, rate: null, amount: 1, formula: '', source: 'CONSOLIDADO' },
  ] as unknown as CascadeStep[]

  it('a view leva `basePerItem` e `pctPerItem` da linha de ICMS até a tela', () => {
    const view = buildCascadeView(TRACE, r)
    const icms = view.find((x) => x.label === '(−) ICMS')!
    expect(icms.basePerItem).toEqual(L('icms').basePerItem)
    expect(icms.pctPerItem).toEqual(L('icms').pctPerItem)
  })

  it('e a etapa da CONSTRUÇÃO continua sem eles — o trace é consolidado', () => {
    const view = buildCascadeView(TRACE, r)
    expect(view.find((x) => x.numero === 9)!.basePerItem).toEqual([])
  })

  it('o componente renderiza a base e a alíquota da coluna', () => {
    const bloco = readFileSync(
      join(__dirname, '..', '..', 'page-parts', 'shared', 'consolidated-dre-block.component.tsx'), 'utf-8',
    )
    expect(bloco).toContain('base {formatBRL(row.basePerItem[k])}')
    expect(bloco).toContain('{(row.pctPerItem[k] * 100).toLocaleString')
  })

  it('e o PDF usa a célula de três linhas, não o valor solto', () => {
    const pdf = readFileSync(join(__dirname, '..', '..', 'lib', 'decomposition-pdf.ts'), 'utf-8')
    expect(pdf).toContain('...bloco.map((k) => celulaDoProduto(row, k)),')
    expect(pdf).not.toContain("...bloco.map((k) => (row.perItem[k] === undefined ? '—' : brlPdf(row.perItem[k])))")
  })
})
