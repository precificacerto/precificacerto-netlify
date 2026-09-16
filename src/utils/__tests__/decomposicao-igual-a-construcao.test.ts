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
    for (const label of ['(−) Custos — congelado', '(−) Despesas operacionais', '(−) ICMS', '► RRO — RESULTADO RESIDUAL OPERACIONAL']) {
      const l = linhaView(label)
      expect(l.valor).toBeCloseTo(l.perItem.reduce((a, b) => a + b, 0), 2)
    }
  })

  it('as linhas que só existem no total chegam SEM coluna', () => {
    expect(linhaView('► RECEITA APÓS DESCONTO').perItem).toHaveLength(0)
    expect(linhaView('(−) Desconto concedido').perItem).toHaveLength(0)
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
    discountPct: 0, despesasOperacionaisPct: DESPESAS_PCT,
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
