/**
 * A APURAÇÃO DA DECOMPOSIÇÃO É IDÊNTICA À DA CONSTRUÇÃO. Sempre. Linha a linha, ao centavo.
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   "Se divergir, a decomposição está errada — a construção é a fonte."
 *
 * >>> ESTE É O CASO QUE TERIA PEGO OS TRÊS DEFEITOS DE UMA VEZ <<<
 *
 * Nenhum teste rodava o MESMO produto pelos DOIS caminhos. Havia casos do motor e casos da
 * decomposição, cada um consistente CONSIGO MESMO — que é exatamente o sintoma que
 * `regime-e-segmento-determinam-a-construcao.md` cataloga: os dois lados fecham entre si e
 * devolvem um número que a construção nunca usou.
 *
 * E o RESIDUAL não pega nenhum dos três, porque ele fecha por construção: distribui o RRO
 * inteiro, seja ele qual for.
 *
 * OS TRÊS DEFEITOS, medidos no ATeste1509:
 *
 *  1. PIS/COFINS com erro de FATOR 100 — `buildItemTaxRatesFromProduct` devolve `icms_pct`
 *     em percentual (17) e `pis_pct`/`cofins_pct` em fração (0,0137), e o adaptador aplicava
 *     `÷ 100` nos dois. 9,25% virou 0,0925%: R$ 25,66 no lugar de R$ 2.565,73. E CASCATEOU —
 *     com o PIS quase zerado, a base do IBS/CBS inchou e o por fora veio R$ 232,87 maior.
 *  2. CUSTO pela METADE — `resolveProductCostAndLabor` separa material (`costTotal`) de MO
 *     produtiva (`productiveLaborUnit`), e só o primeiro era somado. Faltavam R$ 2.576,58.
 *  3. IRPJ e CSLL com o LUCRO APLICADO DUAS VEZES — `mrmConfig.irpj_pct` já é
 *     `% Lucro do TENANT × 15%` (`tax-sync.ts`), e ele era multiplicado pelo lucro do ITEM.
 *     15,00% virava 1,80%, com a razão 15/9 preservada e a magnitude não.
 *
 * ORÁCULO: ATeste1509, do banco — `sale_price` 36.757,67, `sale_price_base` 34.219,34,
 * `external_ops_coefficient` 0,06905570, ICMS 17%, `pis_cofins_pct` 7,6775, IBS 1% + CBS 9%,
 * comissão 5%, lucro 10%, material 7.985,99 + MO 2.576,58.
 */

import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'

/** O produto como o BANCO o guarda — inclusive a escala mista que originou o defeito 1. */
const PRODUTO_NO_BANCO = {
  name: 'ATeste1509',
  sale_price: 36757.67,
  icms_pct: 17,            // PERCENTUAL
  pis_cofins_pct: 7.6775,  // agregado → vira fração no `buildItemTaxRatesFromProduct`
  ibs_pct: 1,
  cbs_pct: 9,
  is_pct: 0,
  ipi_pct: 0,
  commission_percent: 5,
  profit_percent: 10,
}

/** O que a CONSTRUÇÃO apurou, do relatório do dono do produto. */
const CONSTRUCAO = {
  P: 34219.34,
  totalGeral: 36757.67,
  icms: 6248.80,
  pisCofins: 2587.27,
  porFora: 2538.33,
  custo: 10562.57,
  despesas: 8424.85,
  rro: 6395.83,
}

const MATERIAL = 7985.99
const MO_PRODUTIVA = 2576.58

const DESPESAS_PCT = CONSTRUCAO.despesas / CONSTRUCAO.totalGeral

const item = (over: Partial<BudgetDecompositionItem> = {}): BudgetDecompositionItem => ({
  key: 'a', label: 'ATeste1509', quantity: 1,
  unitPrice: PRODUTO_NO_BANCO.sale_price,
  costUnit: MATERIAL,
  productiveLaborUnit: MO_PRODUTIVA,
  commissionPct: PRODUTO_NO_BANCO.commission_percent,
  profitPct: PRODUTO_NO_BANCO.profit_percent,
  rtPct: 0,
  // A ESCALA MISTA, vinda da função de produção — não um objeto arrumado à mão.
  rates: buildItemTaxRatesFromProduct(PRODUTO_NO_BANCO) as never,
  acrescimos: 0,
  ...over,
})

const montar = (items: BudgetDecompositionItem[], discountPct = 0) =>
  buildDecomposition(buildBudgetDecompositionInput({
    items, discountPct, despesasOperacionaisPct: DESPESAS_PCT,
  }).input)

const linha = (r: ReturnType<typeof buildDecomposition>, k: string) => r.rows.find((x) => x.key === k)!
const val = (r: ReturnType<typeof buildDecomposition>, k: string) => Math.abs(linha(r, k).total)

describe('1. AS SETE LINHAS, ao centavo — sem desconto', () => {
  const r = montar([item()])

  it('ICMS', () => { expect(val(r, 'icms')).toBeCloseTo(CONSTRUCAO.icms, 1) })

  it('PIS/COFINS — 2.587,27, e NÃO os 25,66 do erro de escala', () => {
    expect(val(r, 'pis_cofins')).toBeCloseTo(CONSTRUCAO.pisCofins, 1)
    // O discriminante do defeito 1: com `÷ 100` a mais, sai cem vezes menor.
    expect(val(r, 'pis_cofins')).toBeGreaterThan(2000)
  })

  it('IBS + CBS — 2.538,33, a base sem o inchaço do PIS zerado', () => {
    const porFora = val(r, 'por_fora_ibs') + val(r, 'por_fora_cbs') + val(r, 'por_fora_is') + val(r, 'por_fora_ipi')
    expect(porFora).toBeCloseTo(CONSTRUCAO.porFora, 1)
    // O que a tela mostrava com o PIS quase zerado.
    expect(porFora).not.toBeCloseTo(2771.20, 1)
  })

  it('OPERAÇÃO POR DENTRO (P) — 34.219,34, não 33.986,47', () => {
    expect(val(r, 'operacao_por_dentro')).toBeCloseTo(CONSTRUCAO.P, 1)
    expect(val(r, 'operacao_por_dentro')).not.toBeCloseTo(33986.47, 1)
  })

  it('CUSTOS — 10.562,57: material MAIS a MO produtiva', () => {
    expect(val(r, 'custos')).toBeCloseTo(CONSTRUCAO.custo, 1)
    // O discriminante do defeito 2: só o material daria 7.985,99.
    expect(val(r, 'custos')).not.toBeCloseTo(MATERIAL, 1)
  })

  it('DESPESAS OPERACIONAIS', () => { expect(val(r, 'despesas')).toBeCloseTo(CONSTRUCAO.despesas, 1) })

  it('RRO = comissão + lucro + IRPJ + CSLL da construção — 6.395,83', () => {
    expect(val(r, 'rro')).toBeCloseTo(CONSTRUCAO.rro, 1)
    expect(r.rro!.foraDeZero).toBe(false)
    // R$ 0,0101 de acúmulo de arredondamento — as alíquotas do oráculo têm quatro casas.
    // A tolerância é proporcional por isso; ver `toleranciaRro`.
    expect(Math.abs(r.rro!.divergencia)).toBeLessThan(0.02)
  })

  it('e a soma fecha: total geral = por fora + ICMS + PIS/C + custo + despesas + RRO', () => {
    const soma = val(r, 'por_fora_ibs') + val(r, 'por_fora_cbs') + val(r, 'por_fora_is') + val(r, 'por_fora_ipi')
      + val(r, 'icms') + val(r, 'pis_cofins') + val(r, 'custos') + val(r, 'despesas') + val(r, 'rro')
    expect(soma).toBeCloseTo(CONSTRUCAO.totalGeral, 0)
  })
})

describe('2. IRPJ e CSLL — a ALÍQUOTA LEGAL, não o `irpj_pct` do tenant', () => {
  const r = montar([item()])

  it('IRPJ 15% e CSLL 9% sobre o lucro — não 1,80% e 1,08%', () => {
    expect(linha(r, 'irpj').pct).toBeCloseTo(0.15, 4)
    expect(linha(r, 'csll').pct).toBeCloseTo(0.09, 4)
    // O discriminante do defeito 3: a razão 15/9 sobrevivia ao erro; a magnitude não.
    expect(linha(r, 'irpj').pct! / linha(r, 'csll').pct!).toBeCloseTo(15 / 9, 4)
    expect(linha(r, 'irpj').pct).not.toBeCloseTo(0.018, 3)
  })

  it('e os PESOS voltam a 28,74% e 57,47%', () => {
    // Com soma_RRO = 5 + 10 + 1,5 + 0,9 = 17,4%. Os 32,71% e 65,41% da tela implicavam
    // soma_RRO ≈ 15,29%, que é o que sai com IRPJ e CSLL na escala errada.
    expect(linha(r, 'comissao').pct).toBeCloseTo(0.05 / 0.174, 4)
    expect(linha(r, 'lucro').pct).toBeCloseTo(0.10 / 0.174, 4)
    expect(linha(r, 'comissao').pct).not.toBeCloseTo(0.327054, 4)
  })

  it('e o % sobre o TOTAL volta a ser o CADASTRADO', () => {
    expect(linha(r, 'comissao').pctSobreTotalGeral).toBeCloseTo(0.05, 4)
    expect(linha(r, 'lucro').pctSobreTotalGeral).toBeCloseTo(0.10, 4)
  })
})

describe('3. COM DESCONTO, só os CONGELADOS permanecem — R18', () => {
  const semDesconto = montar([item()])
  const com = montar([item()], 0.10)

  it('custo e despesas NÃO encolhem', () => {
    expect(val(com, 'custos')).toBeCloseTo(val(semDesconto, 'custos'), 2)
    // As despesas são % sobre a receita — elas encolhem. O congelado é o CUSTO, e a
    // distinção é da R18: valores em R$ herdados não encolhem; percentuais seguem a base.
    expect(val(com, 'custos')).toBeCloseTo(CONSTRUCAO.custo, 1)
  })

  it('e o RRO CAI — é a corrosão, e o alerta assimétrico não a chama de erro', () => {
    expect(val(com, 'rro')).toBeLessThan(val(semDesconto, 'rro'))
    expect(com.rro!.divergencia).toBeLessThan(0)
    expect(com.rro!.foraDeZero).toBe(false)
  })

  it('o LUCRO DA VENDA publica a queda', () => {
    expect(com.lucroDaVenda!.pctSobreProdutos!).toBeLessThan(0.10)
    expect(semDesconto.lucroDaVenda!.pctSobreProdutos!).toBeCloseTo(0.10, 3)
  })
})

describe('4. A ESCALA MISTA vem da FONTE — e é por isso que o caso a usa', () => {
  it('`buildItemTaxRatesFromProduct` devolve ICMS em percentual e PIS/COFINS em fração', () => {
    const rates = buildItemTaxRatesFromProduct(PRODUTO_NO_BANCO) as Record<string, number>
    // É esta assimetria que fazia um `÷ 100` cego acertar um e errar o outro por 100×.
    expect(rates.icms_pct).toBe(17)
    expect(Number(rates.pis_pct) + Number(rates.cofins_pct)).toBeCloseTo(0.076775, 6)
    expect(Number(rates.pis_pct) + Number(rates.cofins_pct)).toBeLessThan(1)
  })

  it('e o adaptador resolve as duas escalas para a MESMA fração', () => {
    const r = montar([item()])
    // ICMS 17% e PIS/COFINS nominal 9,25% — as duas na escala certa, da mesma fonte.
    expect(linha(r, 'icms').pct).toBeCloseTo(0.17, 4)
    expect(val(r, 'pis_cofins') / (val(r, 'operacao_por_dentro') - val(r, 'icms'))).toBeCloseTo(0.0925, 4)
  })
})

describe('5. A TELA entrega as DUAS metades do CMV, e a escala resolvida', () => {
  /**
   * O módulo certo e a tela não ligada é a falha da correção 7 acontecendo de novo — e foi o
   * que a mutação K5 mostrou: apagar `productiveLaborUnit` do orçamento deixava os 31 casos
   * verdes, porque todos exercitam o módulo.
   */
  const orc = readFileSync(
    join(__dirname, '..', '..', 'pages', 'orcamentos', 'index.tsx'),
    'utf-8',
  )

  it('o orçamento passa material E MO produtiva', () => {
    expect(orc).toContain('costUnit: Number(item.cost_total) || 0')
    expect(orc).toContain('productiveLaborUnit: Number(item.productive_labor_unit) || 0')
  })

  it('e o rateio de acréscimos usa a MESMA travessia de escala', () => {
    // As duas leituras da mesma fonte usavam escalas diferentes: aqui as alíquotas eram
    // passadas CRUAS, e `icms_pct = 17` chegava como 1700%.
    expect(orc).toContain('pctToFraction(rates?.icms_pct)')
    expect(orc).toContain('pisCofinsFractionFromItem(rates?.pis_pct, rates?.cofins_pct)')
    expect(orc).not.toContain('(rates?.pis_pct ?? 0) + (rates?.cofins_pct ?? 0)')
  })
})
