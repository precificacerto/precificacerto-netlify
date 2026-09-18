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
import { buildCascadeView } from '@/utils/cascade-display-view'
import { enrichItemsForMotor } from '@/utils/motor-item-enrichment'
import { calculatePricing } from '@/utils/pricing-engine'
import { resolveItemFicha } from '@/utils/budget-accessories'
import { CSLL_RATE_ON_PROFIT, IRPJ_RATE_ON_PROFIT } from '@/utils/rate-scale'
import {
  resolveDespesasOperacionaisPct,
  resolveSegmentoDaConstrucao,
  resolveSegmentoDaDespesa,
  type BaldesDeDespesa,
  type SegmentoDaConstrucao,
} from '@/utils/despesas-do-segmento'

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
    items, discountPct, despesas: { fixa: DESPESAS_PCT, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0 },
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

/**
 * >>> DOIS PRODUTOS — e é aqui que o teste passa a discriminar <<<
 *
 * Com UM produto, "coluna Total = soma das colunas" é trivialmente verdadeiro: a soma de uma
 * parcela é a parcela. O caso passava sem afirmar nada sobre agrupamento — variante 2 de
 * `teste-que-nao-exercita.md`, e foi por isso que passou.
 *
 * Os dois produtos têm custos, despesas efetivas, alíquotas e margens DIFERENTES, e o segundo
 * não tem tributo por fora nenhum: sem essa divergência, trocar a coluna de um pela do outro
 * não mudaria número nenhum.
 */
const P2_NO_BANCO = {
  name: 'Segundo',
  sale_price: 6000,
  icms_pct: 12,
  pis_cofins_pct: 8.14,
  ibs_pct: 0,
  cbs_pct: 0,
  is_pct: 0,
  ipi_pct: 0,
}

const P2_MO = 200
const P2_QTD = 2

const item2Base = (costUnit: number): BudgetDecompositionItem => ({
  key: 'b', label: 'Segundo', quantity: P2_QTD,
  unitPrice: P2_NO_BANCO.sale_price,
  costUnit,
  productiveLaborUnit: P2_MO,
  commissionPct: 3, profitPct: 15, rtPct: 0,
  rates: buildItemTaxRatesFromProduct(P2_NO_BANCO) as never,
  acrescimos: 0,
})

/**
 * O MATERIAL do segundo produto, apurado por SUBTRAÇÃO — como o do ATeste1509.
 *
 * Inventar o custo faria a conta dele não fechar, e o invariante do RRO acusaria com razão:
 * um preço que não foi formado com aqueles percentuais não tem por que decompor neles.
 *
 * A subtração é sobre o MATERIAL apenas: `item2Base(0)` já leva a MO produtiva, então o que
 * sobra no RRO é exatamente o material que falta. Somar a MO de novo aqui a contaria duas
 * vezes — foi o que a primeira versão fez, e o RRO saiu 3,33 pontos alto, justamente os
 * R$ 400 da MO.
 */
const P2_MATERIAL = (() => {
  const soComCustoZero = montar([item2Base(0)])
  return soComCustoZero.rro!.divergencia / P2_QTD
})()

const item2 = (): BudgetDecompositionItem => item2Base(P2_MATERIAL)

describe('6. AGRUPAMENTO POR PRODUTO — coluna por produto, Total = soma', () => {
  const r = montar([item(), item2()])
  const col = (k: string) => linha(r, k).perItem

  it('a linha de CUSTOS tem uma coluna por produto, com o CMV de cada um', () => {
    expect(col('custos')).toHaveLength(2)
    // O numerador de cada produto na construção: material + MO, vezes a quantidade.
    expect(Math.abs(col('custos')[0])).toBeCloseTo(MATERIAL + MO_PRODUTIVA, 1)
    expect(Math.abs(col('custos')[1])).toBeCloseTo((P2_MATERIAL + P2_MO) * P2_QTD, 1)
    // E o CMV do segundo é o que o preço dele embute: material + MO, os dois.
    expect(Math.abs(col('custos')[1])).toBeCloseTo((P2_MATERIAL + P2_MO) * P2_QTD, 1)
    expect(P2_MATERIAL).toBeGreaterThan(0)
    // O DISCRIMINANTE: os dois custos DIVERGEM. Com custos iguais, trocar as colunas não
    // mudaria nada e o caso não distinguiria agrupamento de rateio.
    expect(Math.abs(col('custos')[0])).not.toBeCloseTo(Math.abs(col('custos')[1]), 0)
  })

  it('e a coluna Total é a SOMA das colunas — não um cálculo próprio', () => {
    for (const k of ['custos', 'despesas', 'icms', 'pis_cofins', 'rro', 'comissao', 'lucro', 'receita_produtos']) {
      expect(linha(r, k).total).toBeCloseTo(col(k).reduce((a, b) => a + b, 0), 2)
    }
  })

  it('TODAS as linhas com coluna fecham — o teste 10 do checklist, linha a linha', () => {
    const comColunas = r.rows.filter((row) => row.perItem.length > 0)
    expect(comColunas.length).toBeGreaterThan(12)
    comColunas.forEach((row) => {
      expect(row.total).toBeCloseTo(row.perItem.reduce((a, b) => a + b, 0), 2)
    })
  })

  it('o RRO total é a soma dos RRO por produto', () => {
    expect(linha(r, 'rro').total).toBeCloseTo(col('rro')[0] + col('rro')[1], 2)
    // E cada um bate com o reservado DAQUELE produto: 17,4% contra 21,6% de soma_RRO.
    const rp = col('receita_produtos')
    expect(col('rro')[0] / rp[0]).toBeCloseTo(0.174, 3)
    expect(col('rro')[1] / rp[1]).toBeCloseTo(0.216, 3)
  })

  it('o invariante do RRO fecha com margens divergentes', () => {
    expect(r.rro!.foraDeZero).toBe(false)
  })

  it('e o produto SEM tributo por fora tem coluna ZERO nas quatro linhas', () => {
    // Zero aqui é APURADO: as alíquotas do segundo produto são 0%. É diferente do travessão
    // das etapas da construção, que é ausência de abertura.
    for (const k of ['por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi']) {
      expect(col(k)[1]).toBeCloseTo(0, 6)
    }
    expect(Math.abs(col('por_fora_ibs')[0])).toBeGreaterThan(0)
  })
})

describe('7. A VIEW leva as colunas até a tela — por EFEITO, não por leitura de arquivo', () => {
  const r = montar([item(), item2()])
  const view = buildCascadeView([], r)
  const linhaView = (label: string) => view.find((x) => x.label === label)!

  it('a linha de custos chega à view com as DUAS colunas', () => {
    // A mutação L5 apagou `perItem` da view e os 28 casos seguiram verdes: todos afirmavam o
    // módulo ou o texto do componente, e nenhum afirmava a travessia entre os dois.
    expect(linhaView('(−) Custos — congelado').perItem).toHaveLength(2)
    expect(Math.abs(linhaView('(−) Custos — congelado').perItem[0])).toBeCloseTo(MATERIAL + MO_PRODUTIVA, 1)
    expect(Math.abs(linhaView('(−) Custos — congelado').perItem[1])).toBeCloseTo((P2_MATERIAL + P2_MO) * P2_QTD, 1)
  })

  it('e a soma das colunas continua sendo o valor da linha', () => {
    for (const label of ['(−) Custos — congelado', '(−) Despesas operacionais — congelado', '(−) ICMS', '► RRO — RESULTADO RESIDUAL OPERACIONAL']) {
      const l = linhaView(label)
      expect(l.valor).toBeCloseTo(l.perItem.reduce((a, b) => a + b, 0), 2)
    }
  })

  it('as linhas que só existem no total chegam SEM coluna', () => {
    // MUDANÇA DE REQUISITO, registrada: o DESCONTO saiu desta lista. Na NF-e ele é `vDesc`
    // POR ITEM, e o número já existia embutido na receita de produtos — passou a ter linha.
    expect(linhaView('► RECEITA APÓS DESCONTO').perItem).toHaveLength(0)
    expect(linhaView('(−) Repasse + frete neles (sem tributo)').perItem).toHaveLength(0)
  })
})

describe('8. A TELA exibe as colunas — e a etapa da construção fica com travessão', () => {
  const bloco = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'shared', 'consolidated-dre-block.component.tsx'),
    'utf-8',
  )

  it('a grid tem uma coluna por produto, e o cabeçalho traz o rótulo', () => {
    expect(bloco).toContain("gridTemplateColumns: `auto 1fr auto auto ${'auto '.repeat(colunas)}auto`")
    expect(bloco).toContain('{itemLabels[k] ?? `Produto ${k + 1}`}')
    expect(bloco).toContain('Total (R$)')
  })

  it('a etapa SEM abertura por item exibe travessão, nunca R$ 0,00', () => {
    // Zero afirmaria que aquele produto não tem custo naquela etapa.
    expect(bloco).toContain("{row.perItem[k] != null ? formatBRL(row.perItem[k]) : '—'}")
  })

  it('e não há coluna quando a decomposição não governa', () => {
    // O `cascade_trace` sozinho é consolidado: inventar colunas para ele seria exibir rateio
    // como se fosse apuração.
    expect(bloco).toContain('const colunas = decomposition && decomposition.rows.length > 0 ? itemLabels.length : 0')
  })

  it('o orçamento passa os rótulos', () => {
    const orc = readFileSync(join(__dirname, '..', '..', 'pages', 'orcamentos', 'index.tsx'), 'utf-8')
    expect(orc).toContain('itemLabels={decomposition?.labels ?? []}')
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 9. O CAMINHO REAL — O QUE OS OITO BLOCOS ACIMA NÃO EXERCITAVAM
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * "Se o teste passa e a tela erra em R$ 2.576,58, o teste não exercita o caminho que a tela
 *  usa. Descubra o que ele exercita e faça-o exercitar o caminho real. Um caso que monta o
 *  custo à mão passaria com o defeito de volta."
 *
 * O QUE ELES EXERCITAVAM: `item()` monta `costUnit: MATERIAL` e `productiveLaborUnit:
 * MO_PRODUTIVA` À MÃO, com os dois números já separados e já corretos. Isso cobre
 * `budget-decomposition-input.ts` (que os SOMA) e `decomposition-dre.ts` — e nada antes
 * disso. A pergunta "de onde vêm esses dois números na tela" ficava fora do caso, e é
 * exatamente ali que o defeito estava.
 *
 * O CAMINHO REAL, e é ele que este bloco percorre:
 *
 *   produto do cadastro  →  enrichItemsForMotor (resolve custo + MO do cadastro VIVO
 *                           com o contexto de MO do TENANT)
 *                        →  o mapeamento da tela
 *                        →  buildBudgetDecompositionInput  →  buildDecomposition
 *
 * >>> POR QUE O CONTEXTO DO TENANT É O DISCRIMINANTE, E NÃO UM DETALHE DE SETUP <<<
 *
 * Medido no banco em 16/09/2026, no ATeste1509 (`ce51cfae`):
 *
 *   products.cost_total ............. 0
 *   products.productive_labor_total.. 0
 *   labor_costs .................... 0 linhas
 *   pricing_calculations.cmv ......... 0
 *   pricing_calculations.product_workload_price / total_labor_* / val_indirect_labor ... 0
 *   pricing_calculations.product_workload ......... 10.000 minutos
 *   tenant_expense_config.productive_value_per_minute ... 0
 *   tenant_expense_config.production_labor_cost_hub ..... 40.813,03
 *   tenant_settings ..................... 528 HOURS × 5 produtivos = 158.400 min/mês
 *
 * Os NÍVEIS 0 a 4 de `resolveProductLaborTotal` saem todos ZERO. A MO deste produto só existe
 * pelo fallback RUNTIME: `10.000 × (40.813,03 ÷ 158.400) = 2.576,58`. Sem o contexto do
 * tenant a função devolve MO = 0 **e `costTotal` = 7.985,99 IGUAL** — o número não muda, só
 * a MO some. Foi por isso que o defeito atravessou: a metade visível estava certa.
 */
describe('9. DO CADASTRO À DECOMPOSIÇÃO — sem montar o custo à mão', () => {
  /** O produto como o BANCO o tem. Nenhum campo arrumado: `cost_total` é 0 mesmo. */
  const PRODUTO_DO_CADASTRO = {
    id: 'ce51cfae', name: 'ATeste1509',
    cost_total: 0, yield_quantity: 1, productive_labor_total: 0,
    sale_price: PRODUTO_NO_BANCO.sale_price,
    commission_percent: 5, profit_percent: 10, rt_reserve_percent: 0,
    product_items: [{ item_id: 'i', item_cost_net: 7985.988202500001, quantity_needed: 1 }],
    labor_costs: [] as { net_value: number }[],
    pricing_calculations: [{
      cmv: 0, product_workload: 10000, product_workload_price: 0,
      total_labor_net: 0, total_labor_gross: 0, val_indirect_labor: 0, total_material_cost_net: 0,
    }],
    freight_value: 0, insurance_value: 0, accessory_expenses_value: 0,
    icms_pct: 17, pis_cofins_pct: 7.6775, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0,
  }

  /** O contexto de MO do tenant, como `useTenantTaxContext` o entrega. */
  const CTX_DO_TENANT = {
    production_labor_cost: 40813.03,
    monthly_workload_minutes: 158400,
    productive_value_per_minute: 0,
  }

  /** A LINHA do documento, como ela existe antes de qualquer resolução de custo. */
  const LINHA_DO_DOCUMENTO = {
    key: 'a', product_id: 'ce51cfae', product_name: 'ATeste1509',
    quantity: 1, unit_price: PRODUTO_NO_BANCO.sale_price,
    commission_percent: 5, profit_percent: 10,
    item_tax_rates: buildItemTaxRatesFromProduct(PRODUTO_NO_BANCO),
  }

  /** O MESMO mapeamento da tela, sobre o array que a tela passa. */
  const decomporDe = (linhas: readonly unknown[]) => buildDecomposition(buildBudgetDecompositionInput({
    items: (linhas as any[]).map((item) => ({
      key: item.key, label: item.product_name, isManual: item.isManual, isService: item.isService,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unit_price) || 0,
      costUnit: Number(item.cost_total) || 0,
      productiveLaborUnit: Number(item.productive_labor_unit) || 0,
      commissionPct: Number(item.commission_percent) || 0,
      profitPct: Number(item.profit_percent) || 0,
      rtPct: Number(item.rt_reserve_percent) || 0,
      rates: item.item_tax_rates ?? null,
      acrescimos: 0,
    })),
    discountPct: 0, despesas: { fixa: DESPESAS_PCT, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0 },
  }).input)

  const enriquecidos = enrichItemsForMotor(
    [LINHA_DO_DOCUMENTO] as never,
    { products: [PRODUTO_DO_CADASTRO] as never, services: [] as never },
    CTX_DO_TENANT as never,
  )

  it('o enriquecimento separa material de MO, e a soma é o CUSTO PRODUTO da construção', () => {
    const e = enriquecidos[0] as unknown as { cost_total: number; productive_labor_unit: number }
    expect(e.cost_total).toBeCloseTo(MATERIAL, 1)
    expect(e.productive_labor_unit).toBeCloseTo(MO_PRODUTIVA, 1)
    expect(e.cost_total + e.productive_labor_unit).toBeCloseTo(CONSTRUCAO.custo, 1)
  })

  it('a linha de CUSTOS sai R$ 10.562,57 — e NÃO os R$ 7.985,99 da tela', () => {
    const r = decomporDe(enriquecidos)
    expect(val(r, 'custos')).toBeCloseTo(CONSTRUCAO.custo, 1)
    // O número que o dono do produto mediu na linha 27. Ele é `product_items.item_cost_net`
    // sozinho — a metade visível do CMV.
    expect(val(r, 'custos')).not.toBeCloseTo(MATERIAL, 1)
  })

  it('e o RRO fecha em R$ 6.395,83, não nos R$ 8.972,42 da tela', () => {
    const r = decomporDe(enriquecidos)
    expect(val(r, 'rro')).toBeCloseTo(CONSTRUCAO.rro, 1)
    // A diferença era EXATAMENTE a MO: custo a menos vira RRO a mais.
    expect(val(r, 'rro')).not.toBeCloseTo(CONSTRUCAO.rro + MO_PRODUTIVA, 1)
    expect(r.rro!.foraDeZero).toBe(false)
  })

  it('a comissão volta a 5,00% e o lucro a 10,00% do total geral', () => {
    const r = decomporDe(enriquecidos)
    expect(linha(r, 'comissao').pctSobreTotalGeral! * 100).toBeCloseTo(5, 2)
    expect(linha(r, 'lucro').pctSobreTotalGeral! * 100).toBeCloseTo(10, 2)
    // Os 7,0143% que a tela exibia com o custo incompleto.
    expect(linha(r, 'comissao').pctSobreTotalGeral! * 100).not.toBeCloseTo(7.0143, 2)
  })

  it('>>> A LINHA CRUA, SEM ENRIQUECER, REPRODUZ O DEFEITO — é o contraste que faltava <<<', () => {
    // `budget_items` NÃO TEM coluna de custo: o custo de um item nunca é gravado, é sempre
    // resolvido. A linha do documento chega assim, sem custo nenhum, e a decomposição lida
    // sobre ela devolve custo ZERO. Foi a leitura crua que produziu tanto o R$ 0,00 da
    // medição anterior quanto o R$ 7.985,99 desta.
    const r = decomporDe([LINHA_DO_DOCUMENTO])
    expect(val(r, 'custos')).toBeCloseTo(0, 2)
    expect(val(r, 'custos')).not.toBeCloseTo(CONSTRUCAO.custo, 1)
  })

  it('>>> E SEM O CONTEXTO DE MO DO TENANT, sai EXATAMENTE o R$ 7.985,99 da tela <<<', () => {
    // Este é o caso que nomeia a causa. Os níveis 0 a 4 de `resolveProductLaborTotal` são
    // todos zero neste produto; a MO só existe pelo fallback runtime, que precisa do
    // contexto. Sem ele, `costTotal` sai IGUAL e só a MO some — a metade visível fica certa,
    // e é por isso que o defeito atravessou três correções.
    const semCtx = enrichItemsForMotor(
      [LINHA_DO_DOCUMENTO] as never,
      { products: [PRODUTO_DO_CADASTRO] as never, services: [] as never },
      { production_labor_cost: 0, monthly_workload_minutes: 0, productive_value_per_minute: 0 } as never,
    )
    expect((semCtx[0] as unknown as { cost_total: number }).cost_total).toBeCloseTo(MATERIAL, 1)
    expect(val(decomporDe(semCtx), 'custos')).toBeCloseTo(MATERIAL, 1)
  })
})

describe('10. A JUNTA — a tela decompõe o array ENRIQUECIDO, não a linha crua', () => {
  const orc = readFileSync(join(__dirname, '..', '..', 'pages', 'orcamentos', 'index.tsx'), 'utf-8')

  it('o `buildBudgetDecompositionInput` da tela mapeia `enrichedItems`', () => {
    // É a quarta vez nesta cadeia que o custo chega errado, e as quatro foram na JUNTA:
    // módulo certo, tela no caminho antigo. O motor sempre consumiu `enrichedItems`; a
    // decomposição consumia `budgetItems`, e eram DUAS FONTES para o mesmo custo.
    const memo = orc.slice(orc.indexOf('const decomposition = useMemo'))
    const corpo = memo.slice(0, memo.indexOf('}, ['))
    expect(corpo).toContain('items: enrichedItems.map((item) => ({')
    expect(corpo).not.toContain('items: budgetItems.map((item) => ({')
  })

  it('e `enrichedItems` recebe o contexto de MO do tenant', () => {
    // Sem os três campos o fallback runtime não roda, e a MO deste produto é SÓ ele.
    const bloco = orc.slice(orc.indexOf('enrichItemsForMotor(budgetItems'))
    const chamada = bloco.slice(0, bloco.indexOf('})'))
    expect(chamada).toContain('production_labor_cost: mrmConfig.production_labor_cost')
    expect(chamada).toContain('monthly_workload_minutes: mrmConfig.monthly_workload_minutes')
    expect(chamada).toContain('productive_value_per_minute: mrmConfig.productive_value_per_minute')
  })

  it('o memo da decomposição depende de `enrichedItems` — não de uma cópia congelada', () => {
    // Com `budgetItems` na lista de dependências, o custo resolvido depois da carga do
    // contexto do tenant não chegaria à tabela.
    expect(orc).toContain('}, [enrichedItems, allocatedByKey, products, globalDiscountPercent')
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 11. COM DESCONTO — R18: OS QUATRO CONGELADOS NÃO SE MOVEM
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * "decomposicao-igual-a-construcao.test.ts roda SEM desconto. Com desconto zero, congelar e
 *  recalcular dão o mesmo número — o caso não discrimina."
 *
 * Está certo, e a razão é aritmética: com `discountPct = 0`, `receitaProdutosPorItem[k]` É
 * `items[k].totalProduto`, então `r × pct` e `totalProduto × pct` são o MESMO número. Os dez
 * blocos acima rodam todos em desconto zero — nenhum deles podia distinguir os dois estados.
 * É a variante 2 de `.claude/rules/teste-que-nao-exercita.md`, e ela passou despercebida
 * porque o caso parecia completo: ele confere sete linhas ao centavo.
 *
 * O DEFEITO QUE ELE DEIXAVA PASSAR, medido no ORC-5487 com 5% de desconto:
 *
 *     despesas recalculadas  34.919,79 × 22,92% = R$ 8.003,62
 *     despesas congeladas    36.757,67 × 22,92% = R$ 8.424,86    diferença R$ 421,24
 *     RRO                    5.547,92  contra   5.126,68
 *
 * >>> E A ASSIMETRIA É O PONTO, NÃO UM DETALHE <<<
 * IBS, CBS, IS, IPI, ICMS, ISS, PIS/COFINS e a Comissão RT RECALCULAM — tributo acompanha a
 * receita. Custo, despesa, acréscimos e itens manuais NÃO — eles já aconteceram. Um caso que
 * só afirmasse "nada encolhe" passaria num módulo que congelasse o imposto junto, e aí a
 * decomposição estaria errada do outro lado.
 */
describe('11. R18 COM DESCONTO — o que congela, o que recalcula, e a medida exata', () => {
  /** Documento COMPLETO: produto com acréscimo, segundo produto, e um item manual. */
  const COMPLETO: BudgetDecompositionItem[] = [
    item({ acrescimos: 1200 }),
    item({
      key: 'b', label: 'Metade', unitPrice: PRODUTO_NO_BANCO.sale_price / 2,
      costUnit: MATERIAL / 2, productiveLaborUnit: MO_PRODUTIVA / 2, acrescimos: 400,
    }),
    { key: 'm', label: 'Manual', isManual: true, quantity: 1, unitPrice: 2500 },
  ]

  const sem = montar(COMPLETO, 0)
  const com = montar(COMPLETO, 0.05)

  const CONGELADAS = ['custos', 'despesas', 'acrescimos', 'repasse_manuais'] as const
  const RECALCULAM = ['por_fora_ibs', 'por_fora_cbs', 'icms', 'pis_cofins', 'rt'] as const

  /**
   * O MESMO documento com RT de 1%.
   *
   * Ele vive à parte de propósito: o preço do ATeste1509 foi formado SEM RT, então acrescentar
   * 1% aqui faz o RRO deixar de fechar com o reservado — o RT come uma fatia que a construção
   * não guardou. O caso do RT não precisa que o RRO feche; os outros precisam. Misturar os
   * dois faria o caso do percentual cadastrado exibir 4,7127% e parecer defeito.
   */
  const comRt = (d: number) => montar(COMPLETO.map((i) => (i.isManual ? i : { ...i, rtPct: 1 })), d)

  it('as QUATRO linhas congeladas saem IDÊNTICAS com 0%, 5% e 30% de desconto', () => {
    const trinta = montar(COMPLETO, 0.3)
    for (const k of CONGELADAS) {
      expect(linha(com, k).total).toBeCloseTo(linha(sem, k).total, 8)
      expect(linha(trinta, k).total).toBeCloseTo(linha(sem, k).total, 8)
    }
    // A despesa é a que estava quebrada, e este é o discriminante: recalculada sobre a
    // receita pós-desconto ela sairia exatamente 5% menor, e NÃO sai.
    expect(linha(com, 'despesas').total).not.toBeCloseTo(linha(sem, 'despesas').total * 0.95, 2)
  })

  it('e POR PRODUTO também — a coluna de cada um fica parada', () => {
    for (const k of CONGELADAS) {
      linha(sem, k).perItem.forEach((v, i) => expect(linha(com, k).perItem[i]).toBeCloseTo(v, 8))
    }
    // Com acréscimo nos dois produtos, a coluna de acréscimos tem valor DIFERENTE de zero em
    // cada uma — sem isso o caso não distinguiria "congelou" de "está vazia".
    expect(Math.abs(linha(com, 'acrescimos').perItem[0])).toBeCloseTo(1200, 6)
    expect(Math.abs(linha(com, 'acrescimos').perItem[1])).toBeCloseTo(400, 6)
  })

  it('as linhas de TRIBUTO e a Comissão RT recalculam — e é o que deve acontecer', () => {
    // O contraste que impede o caso acima de passar num módulo em que NADA encolhe.
    for (const k of RECALCULAM) {
      if (k === 'rt') continue
      expect(Math.abs(linha(com, k).total)).toBeLessThan(Math.abs(linha(sem, k).total))
    }
    // A Comissão RT, no documento com RT — ver `comRt`.
    expect(Math.abs(linha(comRt(0.05), 'rt').total))
      .toBeLessThan(Math.abs(linha(comRt(0), 'rt').total))
    // E ela encolhe MAIS que os 5% nominais, como as de tributo — R14: itens manuais e
    // acréscimos saem inteiros, então o desconto recai todo sobre os produtos, e a base
    // destas linhas é a receita de PRODUTOS.
    expect(Math.abs(linha(comRt(0.05), 'rt').total))
      .toBeLessThan(Math.abs(linha(comRt(0), 'rt').total) * 0.95)
  })

  it('o RRO encolhe EXATAMENTE na medida das linhas que recalculam', () => {
    // RRO = receita líquida + custos + despesas + RT. Com custos e despesas parados, a queda
    // do RRO é a queda da receita líquida mais a da RT, ao centésimo de centavo. Se a despesa
    // encolhesse junto, esta igualdade quebraria pela diferença dela.
    const queda = linha(sem, 'rro').total - linha(com, 'rro').total
    const quedaDasQueRecalculam =
      (linha(sem, 'receita_liquida').total - linha(com, 'receita_liquida').total) +
      (linha(sem, 'rt').total - linha(com, 'rt').total)
    expect(queda).toBeCloseTo(quedaDasQueRecalculam, 8)
    expect(queda).toBeGreaterThan(0)
  })

  it('com desconto ZERO, comissão volta a 5,00% e lucro a 10,00% do total', () => {
    expect(linha(sem, 'comissao').pctSobreTotalGeral! * 100).toBeCloseTo(5, 4)
    expect(linha(sem, 'lucro').pctSobreTotalGeral! * 100).toBeCloseTo(10, 4)
    expect(sem.rro!.foraDeZero).toBe(false)
    // E COM desconto os dois caem — é a corrosão, e ela DEVE aparecer.
    expect(linha(com, 'comissao').pctSobreTotalGeral! * 100).toBeLessThan(5)
    expect(linha(com, 'lucro').pctSobreTotalGeral! * 100).toBeLessThan(10)
  })

  it('APRESENTAÇÃO: linha congelada não tem base nem percentual', () => {
    // Base e percentual numa linha congelada afirmam um cálculo que não existe — e o número
    // que ele produziria é justamente o errado. `.claude/rules/ausente-vs-falso.md`.
    for (const k of CONGELADAS) {
      expect(linha(com, k).base).toBeNull()
      expect(linha(com, k).pct).toBeNull()
    }
    // E o contraste: quem recalcula CONTINUA exibindo a base e a alíquota, que é o que se
    // confere contra o cadastro do produto.
    for (const k of RECALCULAM) {
      expect(linha(com, k).base).not.toBeNull()
      expect(linha(com, k).pct).not.toBeNull()
    }
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 12. O DESCONTO POR ITEM — o `vDesc` que já existia e não tinha linha
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * "Na NF-e o desconto é vDesc por item, não um abatimento global. A linha de desconto na
 *  decomposição hoje só existe no total."
 *
 * MEDIDO ANTES: `perItem` da linha era VAZIO, mas o número existia embutido — derivando
 * `receita_bruta − acréscimos − receita_produtos` num documento de três produtos com 5% de
 * desconto saía [632,05 / 404,00 / 176,97], somando exatamente os R$ 1.213,02 do total. O
 * rateio já estava certo; faltava expor.
 */
describe('12. DESCONTO POR ITEM — R14 na coluna', () => {
  const COM_ACRESCIMO: BudgetDecompositionItem[] = [
    item({ acrescimos: 1200 }),
    item({
      key: 'b', label: 'Metade', unitPrice: PRODUTO_NO_BANCO.sale_price / 2,
      costUnit: MATERIAL / 2, productiveLaborUnit: MO_PRODUTIVA / 2, acrescimos: 400,
    }),
    { key: 'm', label: 'Manual', isManual: true, quantity: 1, unitPrice: 2500 },
  ]
  const r = montar(COM_ACRESCIMO, 0.05)

  it('a linha tem uma coluna por produto, e elas somam o desconto do documento', () => {
    const d = linha(r, 'desconto')
    expect(d.perItem).toHaveLength(2)
    expect(d.perItem.reduce((a, b) => a + b, 0)).toBeCloseTo(d.total, 6)
  })

  it('o rateio é pelo TOTAL DO PRODUTO — o mesmo peso da receita de produtos', () => {
    const d = linha(r, 'desconto')
    // 2/3 e 1/3: o segundo produto é metade do primeiro.
    expect(d.perItem[0] / d.perItem[1]).toBeCloseTo(2, 6)
    // O discriminante: pela RECEITA BRUTA (que inclui o acréscimo) a razão seria outra,
    // porque os acréscimos são 1.200 e 400 sobre bases diferentes.
    const rb = linha(r, 'receita_bruta').perItem
    expect(d.perItem[0] / d.perItem[1]).not.toBeCloseTo(rb[0] / rb[1], 4)
  })

  it('o item MANUAL não recebe coluna de desconto — ele sai inteiro (R14)', () => {
    // Item manual não é coluna na decomposição, e o desconto que incidiria sobre ele já
    // está no total, recaindo sobre os produtos. Uma terceira coluna aqui afirmaria que o
    // manual foi descontado.
    expect(linha(r, 'desconto').perItem).toHaveLength(2)
    expect(linha(r, 'repasse_manuais').perItem).toHaveLength(0)
  })

  it('sem desconto a coluna existe e vale ZERO — e zero aqui é verdade, não ausência', () => {
    const sem = montar(COM_ACRESCIMO, 0)
    expect(linha(sem, 'desconto').perItem).toHaveLength(2)
    for (const v of linha(sem, 'desconto').perItem) expect(v).toBeCloseTo(0, 10)
  })

  it('e o DRE continua fechando: residual zero e RRO no reservado', () => {
    // O desconto ganhou coluna sem entrar em conta nenhuma — ele já estava embutido.
    expect(r.residual.total).toBeCloseTo(0, 6)
    expect(montar(COM_ACRESCIMO, 0).rro!.foraDeZero).toBe(false)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 13 a 15. OS OUTROS DOIS SEGMENTOS — a matriz tem TRÊS, e o caso só cobria UM
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Os doze blocos acima rodam INDUSTRIALIZAÇÃO, do primeiro ao último. E
 * `budget-decomposition-input.ts:149` dizia, até 17/09/2026:
 *
 *     segment: item.isService ? 'SERVICO' : 'INDUSTRIALIZACAO',
 *
 * Dois valores onde a Parte 0 de `cascata-lucro-real.md` tem três. Nenhum caso podia
 * distinguir os dois estados, porque nenhum deles saía da industrialização — variante 2 de
 * `.claude/rules/teste-que-nao-exercita.md`: o caso escolhido não discrimina.
 *
 * >>> OS DOIS LADOS RODAM AQUI, E É ISSO QUE MUDA <<<
 *
 * Cada caso abaixo constrói o preço com `calculatePricing` — a CONSTRUÇÃO — e decompõe o
 * preço construído. Os números absolutos estão afirmados junto, para que um erro que
 * mova os DOIS lados na mesma direção ainda quebre o caso.
 *
 * >>> O QUE FOI MEDIDO, em 17/09/2026 <<<
 *
 * Com o tenant de SERVIÇO real (fixa 50,06% · variável 17,09% · financeira 3,37% · MOI 0):
 *
 *   | linha    | construção | decomposição ANTES |        delta |
 *   |----------|-----------:|-------------------:|-------------:|
 *   | despesas |     492,90 |           1.698,88 |  +1.205,98   |
 *   | RRO      |    +422,54 |            −793,11 |  −1.205,98   |
 *
 * O delta é `2.409,07 × 50,06%` — a despesa fixa INTEIRA, contada duas vezes: uma no custo
 * em R$ por minuto, outra no percentual sobre a receita. O RRO ficava NEGATIVO. A REVENDA,
 * medida no mesmo dia, NÃO divergia em nenhuma das treze linhas — e é por isso que ela
 * entra: sem o caso verde ao lado, o caso de serviço não prova discriminar segmento
 * nenhum, só prova que um número mudou.
 */

/** A CONSTRUÇÃO, pela mesma função que a tela de produto chama. */
const construir = (opts: {
  segmento: SegmentoDaConstrucao
  baldes: BaldesDeDespesa
  custo: number
  icms?: number
  iss?: number
  /** NOMINAL — a efetiva é derivada pela exceção 2 da R5. */
  pisCofins: number
  ibs: number
  cbs: number
  comissao: number
  lucro: number
  /**
   * O segmento da DESPESA, quando ele DIVERGE do da matriz — o único caso é produto de
   * revenda em tenant de serviço. Ausente, os dois coincidem. Ver o bloco 16.
   */
  despesaDe?: SegmentoDaConstrucao
}) => {
  // A MESMA função que a decomposição usa. Escrever a regra de novo aqui faria o caso
  // conferir uma implementação contra ela mesma — `copia-divergente.md` dentro do teste.
  const structurePct = resolveDespesasOperacionaisPct(opts.despesaDe ?? opts.segmento, opts.baldes)
  const r = calculatePricing({
    calcType: opts.segmento,
    totalItemsCost: opts.custo, yieldQuantity: 1,
    laborCostMonthly: 0, numProductiveEmployees: 0,
    monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
    structurePct,
    taxPct: (opts.icms ?? 0) + (opts.iss ?? 0) + opts.pisCofins,
    profitTaxPct: opts.lucro * (IRPJ_RATE_ON_PROFIT + CSLL_RATE_ON_PROFIT),
    commissionPct: opts.comissao, profitPct: opts.lucro,
    taxBreakdown: {
      icmsPct: opts.icms, issPct: opts.iss, pisCofinsPct: opts.pisCofins,
      ibs: { rate: opts.ibs, reductionFactor: 0, baseCode: 4 },
      cbs: { rate: opts.cbs, reductionFactor: 0, baseCode: 4 },
    },
  })
  const tb = r.taxBreakdownResolved!
  return {
    result: r,
    structurePct,
    totalGeral: tb.totalGeral,
    P: r.priceUnit,
    icms: tb.icmsValue,
    iss: tb.issValue,
    pisCofins: tb.pisCofinsValue,
    ibs: tb.externalTaxes.ibs?.value ?? 0,
    cbs: tb.externalTaxes.cbs?.value ?? 0,
    custo: r.cmvUnit,
    despesas: tb.totalGeral * structurePct,
    rro: tb.totalGeral * (opts.comissao + opts.lucro
      + opts.lucro * (IRPJ_RATE_ON_PROFIT + CSLL_RATE_ON_PROFIT)),
    /**
     * O que o CADASTRO guarda: o PIS/COFINS já com a exclusão do ICMS/ISS NOMINAIS.
     * Medido no ATeste1509: 9,25% × (1 − 17%) = 7,6775%, que é o `pis_cofins_pct` da
     * linha do banco. NÃO é `pisCofinsPctEffective`, que usa o ICMS efetivado — passar
     * aquele aqui produz uma divergência de R$ 4,67 que é do caso, não do código.
     */
    pisCofinsDoCadastro: opts.pisCofins * (1 - (opts.icms ?? 0) - (opts.iss ?? 0)),
  }
}

/** O item do documento, com o preço que a construção acabou de formar. */
const itemDoSegmento = (
  c: ReturnType<typeof construir>,
  opts: {
    icms?: number; iss?: number; ibs: number; cbs: number; ipi?: number
    comissao: number; lucro: number
    isService?: boolean; productType?: string
  },
): BudgetDecompositionItem => ({
  key: 's', label: 'Item', quantity: 1,
  unitPrice: c.totalGeral,
  costUnit: c.custo, productiveLaborUnit: 0,
  commissionPct: opts.comissao * 100, profitPct: opts.lucro * 100, rtPct: 0,
  isService: opts.isService, productType: opts.productType,
  rates: {
    icms_pct: opts.icms != null ? opts.icms * 100 : null,
    iss_pct: opts.iss != null ? opts.iss * 100 : null,
    pis_pct: c.pisCofinsDoCadastro, cofins_pct: 0,
    ibs_pct: opts.ibs * 100, cbs_pct: opts.cbs * 100,
    ipi_pct: (opts.ipi ?? 0) * 100, is_pct: 0,
  },
  acrescimos: 0,
})

const decomporDoSegmento = (
  it: BudgetDecompositionItem, baldes: BaldesDeDespesa, tenantCalcType: string,
) => buildDecomposition(buildBudgetDecompositionInput({
  items: [it], discountPct: 0, despesas: baldes, tenantCalcType,
}).input)

// ── REVENDA ────────────────────────────────────────────────────────────────────────────
const REVENDA_BALDES: BaldesDeDespesa = {
  fixa: 0.1489, variavel: 0.0556, financeira: 0.0056, indireta: 0.0756, moProdutiva: 0 }
const REVENDA_FICHA = { icms: 0.17, pisCofins: 0.0925, ibs: 0.01, cbs: 0.09, comissao: 0.05, lucro: 0.10 }

describe('13. REVENDA — os dois lados batem, e é o CONTRASTE do caso de serviço', () => {
  const c = construir({ segmento: 'REVENDA', baldes: REVENDA_BALDES, custo: 1000, ...REVENDA_FICHA })
  const r = decomporDoSegmento(
    itemDoSegmento(c, { ...REVENDA_FICHA, productType: 'REVENDA' }), REVENDA_BALDES, 'REVENDA',
  )

  it('a construção apura os números medidos — 4.331,69 de total geral', () => {
    expect(c.result.validationErrors).toEqual([])
    expect(c.totalGeral).toBeCloseTo(4331.69, 2)
    expect(c.P).toBeCloseTo(4032.56, 2)
    // REVENDA leva os QUATRO baldes: 14,89 + 5,56 + 0,56 + 7,56 = 28,57%.
    expect(c.structurePct).toBeCloseTo(0.2857, 6)
  })

  it('e a decomposição devolve as MESMAS oito linhas, ao centavo', () => {
    expect(val(r, 'operacao_por_dentro')).toBeCloseTo(c.P, 2)
    expect(val(r, 'icms')).toBeCloseTo(c.icms, 2)
    expect(val(r, 'pis_cofins')).toBeCloseTo(c.pisCofins, 2)
    expect(val(r, 'por_fora_ibs')).toBeCloseTo(c.ibs, 2)
    expect(val(r, 'por_fora_cbs')).toBeCloseTo(c.cbs, 2)
    expect(val(r, 'custos')).toBeCloseTo(c.custo, 2)
    expect(val(r, 'despesas')).toBeCloseTo(c.despesas, 2)
    expect(val(r, 'rro')).toBeCloseTo(c.rro, 2)
  })

  it('os ABSOLUTOS medidos, para um erro que mova os dois lados junto não passar', () => {
    expect(val(r, 'icms')).toBeCloseTo(736.39, 1)
    expect(val(r, 'pis_cofins')).toBeCloseTo(304.90, 1)
    expect(val(r, 'por_fora_ibs')).toBeCloseTo(29.91, 1)
    expect(val(r, 'por_fora_cbs')).toBeCloseTo(269.22, 1)
    expect(val(r, 'despesas')).toBeCloseTo(1237.56, 1)
    expect(val(r, 'rro')).toBeCloseTo(753.71, 1)
    expect(r.rro!.foraDeZero).toBe(false)
  })

  it('>>> E A REVENDA NÃO DIVERGIA ANTES — é o que faz o caso de serviço valer <<<', () => {
    // A despesa da REVENDA é a mesma pelos dois critérios: o agregado do tenant é a soma
    // dos quatro baldes, e a REVENDA leva os quatro. Um caso que só medisse "a despesa
    // mudou" passaria aqui sem exercitar nada — e é exatamente por isso que ele fica.
    const agregado = REVENDA_BALDES.fixa + REVENDA_BALDES.variavel
      + REVENDA_BALDES.financeira + REVENDA_BALDES.indireta
    expect(resolveDespesasOperacionaisPct('REVENDA', REVENDA_BALDES)).toBeCloseTo(agregado, 10)
    // No SERVIÇO os dois divergem — e o próximo bloco mede em quanto.
    expect(resolveDespesasOperacionaisPct('SERVICO', REVENDA_BALDES)).not.toBeCloseTo(agregado, 4)
  })

  it('o segmento é lido do PRODUTO e também do TENANT — os dois caminhos da construção', () => {
    // Produto de revenda é REVENDA em qualquer tenant; e sem `product_type` o tenant decide.
    expect(resolveSegmentoDaConstrucao({ productType: 'REVENDA', tenantCalcType: 'INDUSTRIALIZACAO' }))
      .toBe('REVENDA')
    expect(resolveSegmentoDaConstrucao({ tenantCalcType: 'REVENDA' })).toBe('REVENDA')
    // E o serviço vence os dois — serviço é serviço em qualquer tenant.
    expect(resolveSegmentoDaConstrucao({ isService: true, tenantCalcType: 'REVENDA' })).toBe('SERVICO')
  })
})

// ── SERVIÇO ────────────────────────────────────────────────────────────────────────────
const SERVICO_BALDES: BaldesDeDespesa = {
  fixa: 0.5006, variavel: 0.1709, financeira: 0.0337, indireta: 0, moProdutiva: 0 }
const SERVICO_FICHA = { iss: 0.05, pisCofins: 0.0925, ibs: 0.01, cbs: 0.09, comissao: 0.05, lucro: 0.10 }

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 17/09/2026 — OS NÚMEROS DESTE BLOCO MUDARAM, E A REGRA QUE ELE TRAVA NÃO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ele afirma a mesma coisa de antes: a construção do SERVIÇO usa só variável + financeira, a
 * decomposição devolve as MESMAS linhas, e o RRO é POSITIVO. Nada disso mudou.
 *
 * O que mudou foi o CENÁRIO: o ISS passou a sofrer gross-up, como o ICMS, e com ele o total
 * geral subiu. Os valores antigos, e de onde vêm os novos:
 *
 *   total geral    2.409,07  →  2.428,39        ISS  111,82  →  121,42
 *   P              2.217,86  →  2.236,45        despesas  492,90  →  496,85
 *   RRO              419,18  →    422,54   (e o do agregado, −786,80 → −793,11)        comissão  120,45  →  121,42
 *
 * **A comissão continua sendo 5,00% do total geral** — 2.428,39 × 0,05 = 121,42. Foi o
 * primeiro número que conferi ao ver o caso vermelho, porque uma comissão que deixasse de ser
 * 5% seria defeito, não mudança de cenário.
 *
 * E ESTE BLOCO ACHOU UM DEFEITO QUE A CORREÇÃO DO MOTOR TERIA DEIXADO PASSAR: o caso
 * 'a decomposição devolve as MESMAS oito linhas' ficou vermelho com o motor devolvendo ISS de
 * R$ 121,42 e a decomposição R$ 111,82. A decomposição calculava `-pPorItem[k] * issPct` — a
 * MESMA assimetria do motor, replicada em `decomposition-dre.ts:458`. Corrigir só o motor
 * teria feito os dois lados divergirem, que é exatamente o que
 * `regime-e-segmento-determinam-a-construcao.md` proíbe.
 */
describe('14. SERVIÇO — a despesa fixa contada DUAS VEZES, e o RRO negativo', () => {
  const c = construir({ segmento: 'SERVICO', baldes: SERVICO_BALDES, custo: 1000, ...SERVICO_FICHA })
  const r = decomporDoSegmento(
    itemDoSegmento(c, { ...SERVICO_FICHA, isService: true }), SERVICO_BALDES, 'SERVICO',
  )

  it('a construção usa SÓ variável + financeira — 20,46%, não 70,52%', () => {
    expect(c.result.validationErrors).toEqual([])
    expect(c.structurePct).toBeCloseTo(0.2046, 6)
    // O agregado que a decomposição usava. A diferença é a fixa inteira.
    const agregado = SERVICO_BALDES.fixa + SERVICO_BALDES.variavel
      + SERVICO_BALDES.financeira + SERVICO_BALDES.indireta
    expect(agregado).toBeCloseTo(0.7052, 6)
    expect(agregado - c.structurePct).toBeCloseTo(SERVICO_BALDES.fixa, 10)
    expect(c.totalGeral).toBeCloseTo(2428.39, 2)
    expect(c.P).toBeCloseTo(2236.45, 2)
  })

  it('e a decomposição devolve as MESMAS oito linhas, ao centavo', () => {
    expect(val(r, 'operacao_por_dentro')).toBeCloseTo(c.P, 2)
    expect(val(r, 'iss')).toBeCloseTo(c.iss, 2)
    expect(val(r, 'pis_cofins')).toBeCloseTo(c.pisCofins, 2)
    expect(val(r, 'por_fora_ibs')).toBeCloseTo(c.ibs, 2)
    expect(val(r, 'por_fora_cbs')).toBeCloseTo(c.cbs, 2)
    expect(val(r, 'custos')).toBeCloseTo(c.custo, 2)
    expect(val(r, 'despesas')).toBeCloseTo(c.despesas, 2)
    expect(val(r, 'rro')).toBeCloseTo(c.rro, 2)
    // No serviço o ICMS é INEXISTENTE — não é zero, é ausência de linha.
    expect(val(r, 'icms')).toBeCloseTo(0, 6)
  })

  it('>>> O DISCRIMINANTE: despesas 496,85 e NÃO 1.712,50 <<<', () => {
    expect(val(r, 'despesas')).toBeCloseTo(496.85, 1)
    // O número que o agregado produzia: 2.409,07 × 70,52%.
    expect(val(r, 'despesas')).not.toBeCloseTo(1712.50, 0)
    // A diferença é a despesa FIXA inteira, sobre o total geral.
    expect(1712.50 - val(r, 'despesas')).toBeCloseTo(c.totalGeral * SERVICO_BALDES.fixa, 0)
  })

  it('>>> E O RRO VOLTA A SER POSITIVO: +422,54, não −793,11 <<<', () => {
    // `val` aplica `Math.abs`, e foi ele que escondeu o sinal na primeira medição: o
    // módulo de −786,80 parecia um RRO plausível. Aqui o caso olha o número COM sinal.
    const rro = linha(r, 'rro').total
    expect(rro).toBeGreaterThan(0)
    expect(rro).toBeCloseTo(422.54, 1)
    expect(rro).not.toBeCloseTo(-786.80, 0)
    expect(r.rro!.foraDeZero).toBe(false)
  })

  it('a comissão volta a 5,00% e o lucro a 10,00% do total geral', () => {
    expect(linha(r, 'comissao').pctSobreTotalGeral! * 100).toBeCloseTo(5, 2)
    expect(linha(r, 'lucro').pctSobreTotalGeral! * 100).toBeCloseTo(10, 2)
    expect(linha(r, 'comissao').total).toBeCloseTo(121.42, 1)
  })

  it('>>> COM O AGREGADO, o RRO negativo devolvia COMISSÃO NEGATIVA <<<', () => {
    // O estado anterior, forçado pelo campo que a venda gravada usa — não por um módulo
    // mutilado. Repartir um resíduo NEGATIVO devolve as quatro categorias negativas: a
    // tela exibia comissão e lucro com sinal invertido, e o residual fechava em zero,
    // porque ele fecha por construção (distribui o RRO, seja ele qual for).
    const agregado = SERVICO_BALDES.fixa + SERVICO_BALDES.variavel
      + SERVICO_BALDES.financeira + SERVICO_BALDES.indireta
    const comAgregado = decomporDoSegmento(
      { ...itemDoSegmento(c, { ...SERVICO_FICHA, isService: true }), despesasOperacionaisPctCongelado: agregado },
      SERVICO_BALDES, 'SERVICO',
    )
    expect(val(comAgregado, 'despesas')).toBeCloseTo(1712.50, 1)
    expect(linha(comAgregado, 'rro').total).toBeCloseTo(-793.11, 1)
    expect(linha(comAgregado, 'comissao').total).toBeLessThan(0)
    // E o residual NÃO acusava — é o que `teste-que-nao-exercita.md` diz do invariante que
    // fecha por construção: ele não distingue o estado certo do errado.
    expect(comAgregado.residual.total).toBeCloseTo(0, 6)
  })
})

// ── REVENDA COM IPI ────────────────────────────────────────────────────────────────────
/**
 * >>> O CASO QUE PEGA A LINHA 149 SEM ESPERAR ALGUÉM CADASTRAR O PRIMEIRO <<<
 *
 * Medido em 17/09/2026: `0` produtos de REVENDA com IPI em produção. O caso de serviço
 * acima pega a linha pela DESPESA; este a pega pela MATRIZ, que é o outro lado do mesmo
 * defeito — e a matriz não depende de o tenant ter despesa nenhuma configurada.
 *
 * A Parte 0 de `cascata-lucro-real.md`: IPI é **POR FORA** em industrialização e
 * **INEXISTENTE** em revenda. Com `segment: 'INDUSTRIALIZACAO'` forçado, um IPI cadastrado
 * por engano num produto de revenda ganhava linha de R$ 192,79 — um valor que a construção
 * não produziu e não podia produzir, porque ela RECUSA o item.
 *
 * >>> A RESSALVA, e ela é do estado atual, não deste caso <<<
 *
 * Quando a ficha é recusada, `budget-decomposition-input.ts` cai em `externalOpsCoefficient
 * ?? 0` e o item perde TODA a abertura por fora — o IBS e o CBS legítimos somem junto com o
 * IPI ilegítimo. O residual então fica FORA DE ZERO e a tela alerta (`decomposicao-na-tela.md`).
 * É falha ruidosa, que é o comportamento certo para dado incoerente, mas o alerta não diz
 * QUAL tributo está fora da matriz. Fica registrado como limite conhecido.
 */
describe('15. REVENDA COM IPI — INEXISTENTE não é zero, e não é POR FORA', () => {
  const c = construir({ segmento: 'REVENDA', baldes: REVENDA_BALDES, custo: 1000, ...REVENDA_FICHA })
  const comIpi = { ...REVENDA_FICHA, ipi: 0.05 }

  const revenda = decomporDoSegmento(
    itemDoSegmento(c, { ...comIpi, productType: 'REVENDA' }), REVENDA_BALDES, 'REVENDA',
  )
  /** O que a linha 149 fazia: todo item não-serviço entrava como INDUSTRIALIZACAO. */
  const comoAntes = decomporDoSegmento(
    itemDoSegmento(c, comIpi), REVENDA_BALDES, 'INDUSTRIALIZACAO',
  )

  it('a CONSTRUÇÃO recusa o item, e diz por quê', () => {
    const ficha = resolveItemFicha({
      segment: 'REVENDA',
      rates: { icmsPct: 0.17, issPct: null, pisCofinsPct: 0.0925, ipiPct: 0.05, isPct: null, ibsPct: 0.01, cbsPct: 0.09 },
    })
    expect(ficha.ficha).toBeNull()
    expect(ficha.errors.join(' ')).toContain('IPI')
    expect(ficha.errors.join(' ')).toContain('INEXISTENTE não é zero')
    // E em INDUSTRIALIZAÇÃO o MESMO item passa — é a matriz decidindo, não a alíquota.
    expect(resolveItemFicha({
      segment: 'INDUSTRIALIZACAO',
      rates: { icmsPct: 0.17, issPct: null, pisCofinsPct: 0.0925, ipiPct: 0.05, isPct: null, ibsPct: 0.01, cbsPct: 0.09 },
    }).ficha).not.toBeNull()
  })

  it('>>> a decomposição NÃO cria linha de IPI em revenda <<<', () => {
    expect(revenda.rows.find((x) => x.key === 'por_fora_ipi')).toBeUndefined()
  })

  it('>>> e a linha 149 criava: R$ 192,79 que a construção nunca apurou <<<', () => {
    // O DISCRIMINANTE. Sem este contraste o caso acima passaria num módulo que
    // simplesmente não soubesse abrir o por fora — afirmaria ausência, não recusa.
    const ipi = comoAntes.rows.find((x) => x.key === 'por_fora_ipi')
    expect(ipi).toBeDefined()
    expect(Math.abs(ipi!.total)).toBeCloseTo(192.79, 1)
    // E ele CASCATEAVA: com o IPI na base, o `c` muda e as outras três linhas do por fora
    // mudam junto. Não era uma linha a mais — era a decomposição inteira em outro formato.
    expect(Math.abs(comoAntes.rows.find((x) => x.key === 'por_fora_ibs')!.total)).toBeCloseTo(28.31, 1)
    expect(Math.abs(revenda.rows.find((x) => x.key === 'por_fora_ibs')?.total ?? 0)).not.toBeCloseTo(28.31, 1)
  })

  it('o RESIDUAL acusa nos dois — e é o que a tela mostra em vez de um número inventado', () => {
    // Falha ruidosa: o item é incoerente com a matriz, e nenhum dos dois formatos fecha.
    expect(revenda.rro!.foraDeZero).toBe(true)
    expect(comoAntes.rro!.foraDeZero).toBe(true)
    // Mas as divergências têm SINAIS OPOSTOS: com o IPI inventado o RRO sai CURTO em
    // R$ 160,40; sem abertura por fora ele sai SOBRANDO R$ 271,46. Um caso que só
    // afirmasse `foraDeZero === true` não distinguiria os dois estados.
    expect(comoAntes.rro!.divergencia).toBeLessThan(0)
    expect(revenda.rro!.divergencia).toBeGreaterThan(0)
  })

  it('A SEGUNDA CÓPIA sumiu — o rateio do frete lê o MESMO segmento', () => {
    /**
     * `orcamentos/index.tsx:946` tinha a MESMA linha de dois valores, e alimentava
     * `resolveItemFicha` para o rateio dos acréscimos (R12). Duas leituras da mesma
     * matriz, as duas inferindo — `copia-divergente.md`, e o remédio dela é apagar uma.
     *
     * Este caso afirma CAMINHO, e é o caso-limite que `teste-que-nao-exercita.md`
     * permite: o `useMemo` do rateio vive dentro do componente de página e não é
     * exportável, então não há efeito mensurável a afirmar daqui. O que ele afirma é
     * o que importa para a classe — que não existe uma segunda cópia.
     */
    const orc = readFileSync(join(__dirname, '..', '..', 'pages', 'orcamentos', 'index.tsx'), 'utf-8')
    expect(orc).not.toContain("segment: item.isService ? 'SERVICO' : 'INDUSTRIALIZACAO'")
    expect(orc).toContain('segment: resolveSegmentoDaConstrucao({')
    // E ela recebe o `product_type`: sem ele a função cai na segmentação do tenant, e o
    // produto de revenda num tenant industrial volta a ser INDUSTRIALIZACAO.
    const memo = orc.slice(orc.indexOf('const accessoriesAllocation = useMemo'))
    expect(memo.slice(0, memo.indexOf('}, ['))).toContain('product_type ?? null')
  })

  it('e SEM o IPI o mesmo produto de revenda fecha — o IPI é a única variável', () => {
    const semIpi = decomporDoSegmento(
      itemDoSegmento(c, { ...REVENDA_FICHA, productType: 'REVENDA' }), REVENDA_BALDES, 'REVENDA',
    )
    expect(semIpi.rro!.foraDeZero).toBe(false)
    expect(Math.abs(semIpi.rows.find((x) => x.key === 'por_fora_ibs')!.total)).toBeCloseTo(29.91, 1)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 16. SÃO DOIS SEGMENTOS — e confundi-los é o defeito espelhado
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * A primeira versão de `despesas-do-segmento.ts` tinha UMA função para os dois usos. Ela
 * fechava os casos 13 a 15 e errava num terceiro, encontrado ao conferir o módulo contra
 * `structurePctForEngine` antes de empurrar — não por caso vermelho.
 *
 * A construção decide as duas coisas por critérios DIFERENTES:
 *
 *   MATRIZ  — `product-price.component.tsx:206`: o PRODUTO primeiro. Revenda é revenda em
 *             qualquer tenant, e é isso que torna o IPI INEXISTENTE nele.
 *   DESPESA — `products/content.component.tsx:832`: `isCalcService` olha
 *             `currentUser.calcType`, e o tipo do produto NÃO participa.
 *
 * Com uma função só, um produto de REVENDA num tenant de SERVIÇO recebia a despesa
 * COMPLETA — a mesma dupla contagem do bloco 14, num caso mais estreito.
 */
describe('16. PRODUTO DE REVENDA EM TENANT DE SERVIÇO — matriz REVENDA, despesa SERVIÇO', () => {
  it('os dois segmentos DIVERGEM neste caso, e é só nele que a distinção aparece', () => {
    const args = { isService: false, productType: 'REVENDA', tenantCalcType: 'SERVICO' }
    expect(resolveSegmentoDaConstrucao(args)).toBe('REVENDA')
    expect(resolveSegmentoDaDespesa(args)).toBe('SERVICO')
    // E nos casos dos blocos 13 e 14 os dois COINCIDEM — por isso eles não discriminavam.
    expect(resolveSegmentoDaConstrucao({ productType: 'REVENDA', tenantCalcType: 'REVENDA' }))
      .toBe(resolveSegmentoDaDespesa({ tenantCalcType: 'REVENDA' }))
    expect(resolveSegmentoDaConstrucao({ isService: true, tenantCalcType: 'SERVICO' }))
      .toBe(resolveSegmentoDaDespesa({ isService: true, tenantCalcType: 'SERVICO' }))
  })

  it('>>> a despesa é a do SERVIÇO: 20,46%, e não os 70,52% do agregado <<<', () => {
    const pct = resolveDespesasOperacionaisPct(
      resolveSegmentoDaDespesa({ isService: false, tenantCalcType: 'SERVICO' }), SERVICO_BALDES,
    )
    expect(pct).toBeCloseTo(0.2046, 6)
    // O DISCRIMINANTE: a versão anterior lia o segmento da MATRIZ, que aqui é REVENDA,
    // e REVENDA leva os quatro baldes.
    expect(resolveDespesasOperacionaisPct('REVENDA', SERVICO_BALDES)).toBeCloseTo(0.7052, 6)
  })

  it('e os dois lados fecham, com os números medidos', () => {
    const c = construir({
      segmento: 'REVENDA', baldes: SERVICO_BALDES, custo: 1000,
      icms: 0.17, pisCofins: 0.0925, ibs: 0.01, cbs: 0.09, comissao: 0.05, lucro: 0.10,
      despesaDe: 'SERVICO',
    })
    expect(c.totalGeral).toBeCloseTo(3205.57, 2)
    expect(c.despesas).toBeCloseTo(655.86, 1)
    const r = decomporDoSegmento(
      itemDoSegmento(c, { icms: 0.17, ibs: 0.01, cbs: 0.09, comissao: 0.05, lucro: 0.10, productType: 'REVENDA' }),
      SERVICO_BALDES, 'SERVICO',
    )
    expect(val(r, 'despesas')).toBeCloseTo(655.86, 1)
    expect(val(r, 'rro')).toBeCloseTo(c.rro, 2)
    expect(r.rro!.foraDeZero).toBe(false)
    // A MATRIZ continua sendo a de REVENDA: ICMS existe, e o item não virou serviço.
    expect(val(r, 'icms')).toBeCloseTo(c.icms, 2)
    expect(val(r, 'iss')).toBeCloseTo(0, 6)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 17. A MO PRODUTIVA EM SEGMENTAÇÃO REVENDA — lida, não reescrita
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * `structurePctForEngine` soma `resolveIndirectLaborPct`, que em REVENDA agrupa a MO
 * produtiva com a indireta: lá não há minuto sobre o qual ratear a folha, então ela só pode
 * entrar como percentual. `dop_pct` do tenant NÃO a inclui — ele é
 * `fixa + variável + financeira + MOI`, e só.
 *
 * EXPOSIÇÃO EM PRODUÇÃO: **zero**. Medido em 17/09/2026, 0 dos 4 tenants de segmentação
 * REVENDA tem `production_labor_percent > 0`. O caso existe para que a próxima pessoa que
 * cadastrar o primeiro não descubra pela margem errada.
 */
describe('17. MO PRODUTIVA EM REVENDA — o agrupamento vem da fonte única', () => {
  const COM_MO: BaldesDeDespesa = { ...REVENDA_BALDES, moProdutiva: 0.15 }

  it('>>> em REVENDA ela ENTRA: 43,57%, contra os 28,57% do `dop_pct` <<<', () => {
    expect(resolveDespesasOperacionaisPct('REVENDA', COM_MO)).toBeCloseTo(0.4357, 6)
    // `dop_pct` do tenant é a soma dos quatro baldes — a MO produtiva não está nele.
    const dopPct = COM_MO.fixa + COM_MO.variavel + COM_MO.financeira + COM_MO.indireta
    expect(dopPct).toBeCloseTo(0.2857, 6)
    expect(resolveDespesasOperacionaisPct('REVENDA', COM_MO) - dopPct).toBeCloseTo(0.15, 10)
  })

  it('e nos outros dois segmentos NÃO entra — seria dupla contagem', () => {
    // Em industrialização ela já é custo por tempo; em serviço, custo por minuto.
    expect(resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', COM_MO))
      .toBeCloseTo(resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', REVENDA_BALDES), 10)
    expect(resolveDespesasOperacionaisPct('SERVICO', COM_MO))
      .toBeCloseTo(resolveDespesasOperacionaisPct('SERVICO', REVENDA_BALDES), 10)
  })

  it('e os dois lados fecham com ela dentro', () => {
    const c = construir({ segmento: 'REVENDA', baldes: COM_MO, custo: 1000, ...REVENDA_FICHA })
    expect(c.structurePct).toBeCloseTo(0.4357, 6)
    expect(c.totalGeral).toBeCloseTo(12367.52, 2)
    const r = decomporDoSegmento(
      itemDoSegmento(c, { ...REVENDA_FICHA, productType: 'REVENDA' }), COM_MO, 'REVENDA',
    )
    expect(val(r, 'despesas')).toBeCloseTo(5388.53, 1)
    expect(val(r, 'rro')).toBeCloseTo(c.rro, 2)
    expect(r.rro!.foraDeZero).toBe(false)
  })
})

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 18. ICMS HETEROGÊNEO — a base e o % médio somam SÓ as colunas em que o tributo incide
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ESTE BLOCO EXISTE PORQUE UMA MUTAÇÃO SOBREVIVEU. Ao mutar a base do ICMS de volta para
 * `rp` — o total de TODAS as colunas, que é o defeito corrigido em 17/09/2026 — a suíte
 * inteira ficou VERDE: 171 de 171 casos.
 *
 * A razão é `teste-que-nao-exercita.md`, variante 2: **o caso escolhido não discrimina.**
 * Toda fixture da decomposição tinha UM item, ou itens com a MESMA alíquota — e com alíquota
 * uniforme as duas regras dão o mesmo número. O defeito que está materializado em 34
 * documentos da base não tinha caso que o pegasse.
 *
 * Daí a fixture abaixo: DOIS produtos, um com ICMS 17% e outro com ICMS 0%, que é o cenário
 * do ORC-5487 de onde o defeito foi relatado.
 *
 * MEDIDO lá, antes da correção:
 *
 *   base impressa      R$ 37.177,85   ← a soma das duas colunas
 *   base real          R$ 34.919,79   ← só a coluna que tem ICMS
 *   alíquota derivada       15,9675%  ← `valor ÷ base`, para um ICMS de 17,0000%
 *
 * **O débito em R$ está certo nos dois casos.** O que muda é a base impressa — e é ela que
 * vai para a nota.
 */
describe('18. ICMS HETEROGÊNEO — a base soma só onde o tributo incide', () => {
  const cComIcms = construir({ segmento: 'REVENDA', baldes: REVENDA_BALDES, custo: 1000, ...REVENDA_FICHA })
  const cSemIcms = construir({
    segmento: 'REVENDA', baldes: REVENDA_BALDES, custo: 1000, ...REVENDA_FICHA, icms: 0,
  })
  const r = buildDecomposition(buildBudgetDecompositionInput({
    items: [
      { ...itemDoSegmento(cComIcms, { ...REVENDA_FICHA, productType: 'REVENDA' }), key: 'com', label: 'Com ICMS' },
      { ...itemDoSegmento(cSemIcms, { ...REVENDA_FICHA, icms: 0, productType: 'REVENDA' }), key: 'sem', label: 'Sem ICMS' },
    ],
    discountPct: 0, despesas: REVENDA_BALDES, tenantCalcType: 'REVENDA',
  }).input)
  const l = (k: string) => r.rows.find((x) => x.key === k)!
  const rpTotal = Math.abs(l('receita_produtos').total)
  const colunas = l('receita_produtos').perItem.map((v) => Math.abs(v))

  it('a fixture DISCRIMINA — as duas colunas têm alíquotas diferentes e valores diferentes', () => {
    // Sem isto o bloco inteiro seria decorativo: com colunas iguais as duas regras coincidem.
    expect(colunas).toHaveLength(2)
    expect(colunas[0]).toBeGreaterThan(0)
    expect(colunas[1]).toBeGreaterThan(0)
    expect(colunas[0]).not.toBeCloseTo(colunas[1], 0)
  })

  it('>>> a BASE do ICMS é SÓ a coluna que tem ICMS, não o total <<<', () => {
    expect(l('icms').base).toBeCloseTo(colunas[0], 2)
    // O DISCRIMINANTE contra a regra de ontem — é ESTE `expect` que a mutação mata.
    expect(l('icms').base).not.toBeCloseTo(rpTotal, 0)
    expect(rpTotal - l('icms').base).toBeCloseTo(colunas[1], 2)
  })

  it('>>> e o % MÉDIO volta a ser a alíquota cadastrada — 17,00%, não a média diluída <<<', () => {
    // Com a base do total daria `valor ÷ total`, estritamente MENOR que a alíquota real.
    expect(Math.abs(l('icms').pct!)).toBeCloseTo(0.17, 6)
    const diluida = Math.abs(l('icms').total) / rpTotal
    expect(diluida).toBeLessThan(0.17)
  })

  it('o VALOR em R$ não muda — o defeito era da base impressa, não do débito', () => {
    // A correção não podia mexer no imposto devido, e este caso é o que prova.
    expect(Math.abs(l('icms').total)).toBeCloseTo(colunas[0] * 0.17, 2)
  })

  it('e o RESIDUAL continua fechando em zero com as duas colunas', () => {
    expect(Math.abs(l('residual').total)).toBeLessThan(0.02)
  })
})
