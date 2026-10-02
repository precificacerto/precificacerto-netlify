/**
 * COMPROMISSOS FINANCEIROS — CATEGORIA INDEPENDENTE, MESMO PERCENTUAL.
 * Oráculos do §9 do comando do PO de 02/10/2026.
 *
 * ═══ A TRAVA DA RODADA É O §0, E ELA É O PRIMEIRO BLOCO DESTE ARQUIVO ═══
 *
 *   > Esta rodada NÃO muda preço. Em tenant nenhum, em produto nenhum, em centavo nenhum.
 *   > (…) Qualquer produto que mudar de preço é DEFEITO, não efeito esperado.
 *
 * O compromisso já está dentro do preço hoje, dentro da despesa fixa. Ele sai de lá e vira
 * termo próprio COM O MESMO PERCENTUAL, NO MESMO DIVISOR — a soma do divisor não muda, então o
 * preço não muda.
 *
 * ═══ POR QUE OS CASOS DISCRIMINAM, E NÃO SÓ PASSAM ═══
 *
 * Um caso que afirmasse "o preço antes é igual ao preço depois" com compromisso ZERO passaria
 * verde COM O DEFEITO PRESENTE: sem compromisso, somar o termo ou esquecê-lo dá o mesmo número
 * (`teste-que-nao-exercita.md`, variante 2). Por isso:
 *
 *   - todo cenário de preço tem compromisso **MAIOR QUE ZERO**;
 *   - cada igualdade vem com o PAR que mostra quanto o preço se moveria se o termo fosse
 *     esquecido — a mutação (a) do §9 — ou contado duas vezes — a mutação (b);
 *   - o cenário SEM compromisso existe também, porque o §9 pede os dois, e ele afirma que a
 *     separação não inventa número onde não há nada a separar.
 *
 * ═══ O QUE ESTE ARQUIVO NÃO REPETE ═══
 *
 * `INVESTIMENTO` fora da base do preço e o rótulo LEGADO continuando a ser lido já estão
 * versionados em `compromissos-financeiros.test.ts` (describes "(b) INVESTIMENTO nunca entra" e
 * "§6"). Copiá-los aqui seria `copia-divergente.md` nascendo. As mutações (d) e (e) do §9 são
 * medidas contra ELES, e o relatório diz quantos casos de cada arquivo ficam vermelhos.
 */
import fs from 'fs'
import path from 'path'
import { extractStructurePercents } from '@/utils/hub-engine'
import type { HubData, HubRow } from '@/utils/hub-engine'
import { calculatePricing } from '@/utils/pricing-engine'
import { buildCalcBase } from '@/utils/build-calc-base'
import { buildBreakevenInputFromConfig, calculateBreakeven } from '@/utils/breakeven-calculator'
import {
  resolveDespesasOperacionaisPct,
  type BaldesDeDespesa,
} from '@/utils/despesas-do-segmento'
import {
  BLOCO_COMPROMISSOS,
  LABEL_DO_BLOCO,
  CATEGORIAS_DO_BLOCO,
  classificarLancamentoDeDespesa,
} from '@/utils/compromissos-financeiros'
import { getExpenseCategoryOptionsForRegime, getGroupForCategoryByRegime } from '@/constants/expense-categories-by-regime'
import { getDefaultGroupForCategory } from '@/constants/cashier-category'
import { EXPENSE_GROUP_KEYS, EXPENSE_GROUP_OPTIONS, HUB_GROUPS } from '@/constants/expense-groups'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import {
  aggregateEntries,
  buildDreLucroRealPresumido,
  buildDrePresumidoRET,
  buildDreSimplesNacional,
  type AggregatedData,
  type DreRow,
  type MonthlyValues,
} from '@/pages/dfc'
import { mediaMensalDaDespesaFixa } from '@/utils/recalc-expense-config'
import { resolveDopRates } from '@/utils/mrm-engine-v17/legacy-adapter'

// ═════════════════════════════════════════════════════════════════════════════════════════
// O CENÁRIO — um tenant com compromisso, e o mesmo tenant sem
// ═════════════════════════════════════════════════════════════════════════════════════════

const FATURAMENTO = 100_000

/** Fixas comuns 20.000,00 e compromissos 4.500,00 — 20,00% + 4,50% de 100.000,00. */
const FIXAS_COMUNS = 20_000
const COMPROMISSOS = 4_500

/**
 * Uma linha do HUB como `calculateHubData` A PRODUZ — e o arredondamento do `averagePct` É
 * parte disso.
 *
 * O real faz `Math.round(((totalSum / totalIncome) * 100) * 100) / 100`, e `findPct` lê
 * `averagePct / 100`. Um helper que devolvesse o percentual CRU faria a armadilha de 1e-4
 * desaparecer do fixture — e foi assim que a mutação (k) do §9 sobreviveu na primeira rodada.
 * `teste-que-nao-exercita.md`, variante 2: o fixture tem de distinguir.
 */
function row(group: string, totalSum: number): HubRow {
  return {
    group, label: group,
    values: { '2026-01': totalSum },
    totalSum,
    closedMonthsWithData: 1,
    averageRS: totalSum,
    averagePct: Math.round(((totalSum / FATURAMENTO) * 100) * 100) / 100,
    subRows: [],
  }
}

function hub(rows: HubRow[]): HubData {
  return {
    months: ['2026-01'], rows,
    incomeByMonth: { '2026-01': FATURAMENTO },
    totalIncome: FATURAMENTO,
    totalIncomeMonthsCount: 1,
  }
}

/** ANTES de 02/10/2026: o compromisso estava DENTRO de `DESPESA_FIXA`, sem linha própria. */
const HUB_ANTES = hub([
  row('DESPESA_FIXA', FIXAS_COMUNS + COMPROMISSOS),
  row('DESPESA_VARIAVEL', 5_000),
  row('DESPESA_FINANCEIRA', 1_000),
])

/** DEPOIS: a leitura o move para o grupo próprio. Os LANÇAMENTOS são os mesmos. */
const HUB_DEPOIS = hub([
  row('DESPESA_FIXA', FIXAS_COMUNS),
  row(BLOCO_COMPROMISSOS, COMPROMISSOS),
  row('DESPESA_VARIAVEL', 5_000),
  row('DESPESA_FINANCEIRA', 1_000),
])

/** O tenant SEM compromisso nenhum — o §9 pede os dois lados. */
const HUB_SEM = hub([
  row('DESPESA_FIXA', FIXAS_COMUNS),
  row('DESPESA_VARIAVEL', 5_000),
  row('DESPESA_FINANCEIRA', 1_000),
])

/** A config gravada como `recalc-expense-config` a grava: percentual 0..100. */
const config = (fixa: number, capital: number | null) => ({
  fixed_expense_percent: fixa,
  financial_commitments_percent: capital,
  variable_expense_percent: 5,
  financial_expense_percent: 1,
  admin_labor_percent: 7,
  production_labor_cost_hub: 0,
  production_labor_percent: 0,
})

/**
 * O preço de UM produto, pelo motor de verdade, com o `structurePct` que a tela monta.
 *
 * `calcType: 'REVENDA'` para que a MO entre por percentual e o cenário tenha os cinco baldes
 * no divisor — é o caso em que esquecer um termo dói mais.
 */
const preco = (cfg: ReturnType<typeof config>) => {
  const calcBase = buildCalcBase(cfg)
  const r = calculatePricing({
    calcType: 'REVENDA',
    totalItemsCost: 1_250,
    yieldQuantity: 1,
    laborCostMonthly: 0,
    numProductiveEmployees: 1,
    monthlyWorkloadMinutes: 0,
    productWorkloadMinutes: 0,
    structurePct: (calcBase.structurePct + calcBase.indirectLaborPct) / 100,
    taxPct: 0.0925,
    commissionPct: 0.05,
    profitPct: 0.10,
    rtReservePct: 0,
  })
  expect(r.isValid).toBe(true)
  return r
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// §0 — A TRAVA: NENHUM PREÇO MUDA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('§0 — NENHUM PREÇO MUDA, em centavo nenhum', () => {
  /** 24,50% num termo só, contra 20,00% + 4,50% em dois. */
  const ANTES = config(24.5, null)
  const DEPOIS = config(20, 4.5)

  it('>>> tenant COM compromisso: o preço é IDÊNTICO, ao centavo <<<', () => {
    const a = preco(ANTES)
    const d = preco(DEPOIS)
    expect(d.priceUnit).toBeCloseTo(a.priceUnit, 10)
    expect(d.coefficient).toBeCloseTo(a.coefficient, 10)
    /*
      E o número POR EXTENSO, para que a igualdade não seja "dois erros iguais".

      R$ 3.267,97 é MEDIDO, não previsto: a primeira versão deste caso esperava R$ 2.272,73,
      de uma conta minha feita à mão sem a MO indireta de 7,00% no divisor. O motor devolveu
      3.267,97 na primeira execução — `hipotese-derrubada-pela-propria-medicao.md`, e o número
      que ficou é o do motor.

      Custo 1.250,00 ÷ (1 − 0,245 − 0,07 − 0,05 − 0,01 − 0,0925 − 0,05 − 0,10) = 3.267,97.
    */
    expect(a.priceUnit).toBeCloseTo(3_267.97, 2)
    expect(d.priceUnit).toBeCloseTo(3_267.97, 2)
  })

  it('>>> o PAR, que é o que faz o caso acima discriminar: ESQUECER o termo move o preço <<<', () => {
    // Mutação (a) do §9: o percentual sai da despesa fixa e NÃO entra pela categoria nova.
    const esquecido = preco(config(20, null))
    expect(esquecido.priceUnit).not.toBeCloseTo(preco(ANTES).priceUnit, 2)
    // E move para BAIXO — um preço menor não levanta erro nenhum, e é por isso que precisa de
    // caso. A diferença é MEDIDA: 4,50 pontos a menos no divisor valem R$ 343,99 neste produto.
    expect(esquecido.priceUnit).toBeLessThan(preco(ANTES).priceUnit)
    expect(preco(ANTES).priceUnit - esquecido.priceUnit).toBeCloseTo(343.99, 2)
  })

  it('>>> e o OUTRO par: contar nos DOIS lugares sobe o preço — mutação (b) <<<', () => {
    const dobrado = preco(config(24.5, 4.5))
    expect(dobrado.priceUnit).toBeGreaterThan(preco(ANTES).priceUnit)
    expect(dobrado.priceUnit).not.toBeCloseTo(preco(ANTES).priceUnit, 2)
  })

  it('tenant SEM compromisso: idêntico também, e a separação não inventa número', () => {
    const semA = config(20, null)
    const semB = config(20, 0)
    expect(preco(semB).priceUnit).toBeCloseTo(preco(semA).priceUnit, 10)
  })

  it('>>> o IMPOSTO calculado não muda — ele incide sobre o preço, e o preço é o mesmo <<<', () => {
    expect(preco(DEPOIS).taxValue).toBeCloseTo(preco(ANTES).taxValue, 10)
    expect(preco(DEPOIS).commissionValue).toBeCloseTo(preco(ANTES).commissionValue, 10)
    expect(preco(DEPOIS).profitValue).toBeCloseTo(preco(ANTES).profitValue, 10)
  })

  it('>>> e o `structurePct` do `buildCalcBase` é a MESMA soma, não um número parecido <<<', () => {
    expect(buildCalcBase(DEPOIS).structurePct).toBeCloseTo(buildCalcBase(ANTES).structurePct, 10)
    expect(buildCalcBase(DEPOIS).structurePct).toBeCloseTo(24.5 + 5 + 1, 10)
    // `NULL` contribui ZERO: nesse estado o compromisso ainda está DENTRO da fixa.
    expect(buildCalcBase(ANTES).financialCommitmentsPct).toBe(0)
    expect(buildCalcBase(DEPOIS).financialCommitmentsPct).toBe(4.5)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A DESPESA FIXA EXIBIDA CAI, E A SOMA DAS DUAS É A DE ANTES
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('a despesa fixa exibida cai e o mesmo valor aparece na linha nova', () => {
  it('>>> 24,50% viram 20,00% + 4,50%, e a soma é BIT-EXACT ao número de antes <<<', () => {
    const antes = extractStructurePercents(HUB_ANTES)
    const depois = extractStructurePercents(HUB_DEPOIS)

    expect(antes.fixed_expense_percent * 100).toBeCloseTo(24.5, 10)
    expect(depois.fixed_expense_percent * 100).toBeCloseTo(20.0, 10)
    expect(depois.financial_commitments_percent * 100).toBeCloseTo(4.5, 10)

    // A IGUALDADE EXATA é a trava — não `toBeCloseTo`, e sim o mesmo número.
    expect(depois.fixed_expense_percent + depois.financial_commitments_percent)
      .toBe(antes.fixed_expense_percent)
  })

  it('>>> o arredondamento NÃO escapa: o total é arredondado UMA vez e o resto é subtraído <<<', () => {
    /*
      >>> OS VALORES SÃO ESCOLHIDOS PARA DISCRIMINAR, E A PRIMEIRA ESCOLHA NÃO DISCRIMINAVA <<<

      `findPct` devolve `row.averagePct / 100`, que já está arredondado a 1e-4 POR LINHA. Somar
      duas parcelas arredondadas pode diferir do total arredondado uma vez — e 1e-4 no divisor
      MOVE O PREÇO, que o §0 chama de defeito.

      A primeira versão deste caso usou R$ 3.333,33 + R$ 1.111,11. Foi SUPOSIÇÃO minha de que
      aqueles valores caíam no meio do passo: `(3333.33/100000)*10000 = 333.333`, que arredonda
      para baixo, e os dois lados davam o mesmo número. A MUTAÇÃO (k) do §9 — arredondar cada
      parcela em vez do total — SOBREVIVEU, e foi ela que desmentiu a escolha
      (`hipotese-derrubada-pela-propria-medicao.md`: a razão para acreditar que o caso media
      algo era uma suposição de quem o escreveu).

      Os valores abaixo foram MEDIDOS, não deduzidos. Com R$ 20.006,00 e R$ 4.508,00 sobre
      R$ 100.000,00:

        fixa     20.006 ÷ 100.000 × 10000 = 2000,6 → 2001 → 20,01%
        compr.    4.508 ÷ 100.000 × 10000 =  450,8 →  451 →  4,51%
        soma das parcelas arredondadas .................... 24,52%
        total arredondado UMA vez: 24.514 → 2451,4 → 2451 → 24,51%

      Um centésimo de ponto de diferença — e é exatamente o que o §0 proíbe.
    */
    const antes = extractStructurePercents(hub([row('DESPESA_FIXA', 20_006 + 4_508)]))
    const depois = extractStructurePercents(hub([
      row('DESPESA_FIXA', 20_006),
      row(BLOCO_COMPROMISSOS, 4_508),
    ]))
    expect(depois.fixed_expense_percent + depois.financial_commitments_percent)
      .toBe(antes.fixed_expense_percent)
    // E o número por extenso, para que a igualdade não seja "dois erros iguais".
    expect(antes.fixed_expense_percent * 100).toBeCloseTo(24.51, 10)
    expect(depois.financial_commitments_percent * 100).toBeCloseTo(4.51, 10)
    expect(depois.fixed_expense_percent * 100).toBeCloseTo(20.00, 10)
  })

  it('sem compromisso lançado, a fixa fica igual e o termo novo é zero', () => {
    const sem = extractStructurePercents(HUB_SEM)
    expect(sem.financial_commitments_percent).toBe(0)
    expect(sem.fixed_expense_percent * 100).toBeCloseTo(20.0, 10)
  })

  it('>>> as categorias do bloco NÃO entram mais em `fixed_expense_percent` <<<', () => {
    // O discriminante: se elas ainda entrassem, a fixa seria 24,50% e não 20,00%.
    expect(extractStructurePercents(HUB_DEPOIS).fixed_expense_percent * 100).not.toBeCloseTo(24.5, 2)
  })

  it('o rateio da leitura é o que move o valor: o classificador manda tudo para o grupo novo', () => {
    const porGrupo: Record<string, number> = {}
    for (const c of CATEGORIAS_DO_BLOCO) {
      for (const parte of classificarLancamentoDeDespesa({
        expense_group: c.group, expense_category: c.category, amount: 1_000,
      })) {
        porGrupo[parte.group] = (porGrupo[parte.group] || 0) + parte.amount
      }
    }
    expect(porGrupo[BLOCO_COMPROMISSOS]).toBe(CATEGORIAS_DO_BLOCO.length * 1_000)
    expect(porGrupo.DESPESA_FIXA).toBeUndefined()
    expect(porGrupo.AMORTIZACAO).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A DECOMPOSIÇÃO — valor R$ congelado, dentro do bloco de despesas
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('na decomposição ele entra no bloco de despesas, como valor congelado', () => {
  /*
    §1, formulação do dono do produto:

      > Na decomposição (…) ele entra com o valor de origem, que é o valor congelado, o valor
      > monetário, dentro das despesas, ASSIM COMO ACONTECE COM a despesa fixa, a despesa
      > variável, a despesa financeira.

    As três entram pelo `despesasOperacionaisPct` AGREGADO, que vira UMA linha congelada em R$
    ("(−) Despesas operacionais — congelado"). "Assim como acontece com" elas significa: no
    MESMO agregado. Separar os baldes em linhas próprias é escopo distinto, registrado como tal
    em `cascata-lucro-real.md` ("a separação NÃO está implementada, e não deve ser puxada no
    meio de outra correção"), e não foi puxado aqui.
  */
  const BALDES: BaldesDeDespesa = {
    fixa: 0.20, compromisso: 0.045, variavel: 0.05, financeira: 0.01,
    indireta: 0.07, moProdutiva: 0,
  }
  const SEM_SEPARAR: BaldesDeDespesa = { ...BALDES, fixa: 0.245, compromisso: 0 }

  it('>>> o agregado é o MESMO com e sem a separação — fora do serviço <<<', () => {
    for (const seg of ['INDUSTRIALIZACAO', 'REVENDA'] as const) {
      expect(resolveDespesasOperacionaisPct(seg, BALDES))
        .toBeCloseTo(resolveDespesasOperacionaisPct(seg, SEM_SEPARAR), 12)
    }
    expect(resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', BALDES)).toBeCloseTo(0.375, 10)
  })

  it('>>> o PAR: esquecer o balde novo tiraria 4,50 pontos da despesa da decomposição <<<', () => {
    const esquecido: BaldesDeDespesa = { ...BALDES, compromisso: 0 }
    expect(resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', esquecido)).toBeCloseTo(0.33, 10)
    expect(resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', BALDES)
      - resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', esquecido)).toBeCloseTo(0.045, 10)
  })

  it('>>> no SERVIÇO ele ENTRA, e a FIXA é que fica fora — ADENDO 3, 02/10/2026 <<<', () => {
    /*
      >>> ESTE CASO AFIRMAVA O CONTRÁRIO, E A INVERSÃO É A RODADA INTEIRA <<<

      Ele dizia "no SERVIÇO ele fica FORA, como a fixa de onde saiu", e estava certo para a
      regra daquela manhã: o compromisso vivia no custo por minuto, em R$, e somá-lo aqui seria
      a dupla contagem medida em R$ 1.205,98. O dono do produto decidiu outra coisa:

        > No serviço a despesa tem um cálculo diferente, ela vai no numerador. Compromisso
        > financeiro ele vai no denominador, na margem de contribuição.

      A outra metade da mudança é `mediaMensalDaDespesaFixa`, que o tirou do custo por minuto.
      SEM ela, este caso verde seria a dupla contagem — é por isso que os dois estão no mesmo
      arquivo e o bloco de baixo afirma a saída.
    */
    expect(resolveDespesasOperacionaisPct('SERVICO', BALDES)).toBeCloseTo(0.105, 10)
    // A FIXA continua fora: 0,105 e não 0,305. É o §1 — "não mexa nela".
    expect(resolveDespesasOperacionaisPct('SERVICO', BALDES)).not.toBeCloseTo(0.305, 2)
    // E o PAR que discrimina: sem o balde separado, o serviço perderia os 4,5 pontos — porque
    // `SEM_SEPARAR` os guarda dentro da `fixa`, que o serviço não lê.
    expect(resolveDespesasOperacionaisPct('SERVICO', SEM_SEPARAR)).toBeCloseTo(0.06, 10)
    expect(resolveDespesasOperacionaisPct('SERVICO', BALDES)
      - resolveDespesasOperacionaisPct('SERVICO', SEM_SEPARAR)).toBeCloseTo(0.045, 10)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O PONTO DE EQUILÍBRIO também lê a soma, e não a metade
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('o ponto de equilíbrio não muda', () => {
  const cfgAntes = { ...config(24.5, null), hub_average_revenue: FATURAMENTO, product_cost_percent: 30, commission_percent_hub: 5, tax_on_revenue_percent: 9.25, indirect_labor_percent: 7 }
  const cfgDepois = { ...cfgAntes, fixed_expense_percent: 20, financial_commitments_percent: 4.5 }

  it('>>> o faturamento de equilíbrio é o MESMO antes e depois da separação <<<', () => {
    const a = calculateBreakeven(buildBreakevenInputFromConfig(cfgAntes, 'LUCRO_REAL'))
    const d = calculateBreakeven(buildBreakevenInputFromConfig(cfgDepois, 'LUCRO_REAL'))
    expect(d.breakeven).toBeCloseTo(a.breakeven, 6)
  })

  it('>>> o PAR: esquecer o termo BAIXARIA o ponto de equilíbrio <<<', () => {
    const esquecido = calculateBreakeven(buildBreakevenInputFromConfig(
      { ...cfgAntes, fixed_expense_percent: 20, financial_commitments_percent: null }, 'LUCRO_REAL'))
    const a = calculateBreakeven(buildBreakevenInputFromConfig(cfgAntes, 'LUCRO_REAL'))
    expect(esquecido.breakeven).toBeLessThan(a.breakeven)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// §2.4 — UMA CATEGORIA, UM LUGAR SÓ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('§2.4 — o seletor oferece um rótulo só por natureza', () => {
  /*
    MEDIÇÃO de 02/10/2026, feita ANTES de mexer em qualquer coisa: o seletor JÁ oferecia só as
    cinco. 'Empréstimos / Financiamentos' e 'Aplicações / Consórcios' não aparecem em nenhum dos
    quatro regimes — a desambiguação veio no PR de 21/09/2026, com `CATEGORIAS_OFERECIDAS_DO_BLOCO`.

    O caso fica assim mesmo, como PORTÃO: ele barra a reintrodução do rótulo legado no seletor,
    que é o defeito que o §2.4 descreve. Sem ele, acrescentar o legado de volta passaria verde.
  */
  const LEGADOS = ['Empréstimos / Financiamentos', 'Aplicações / Consórcios']

  it.each(['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_NACIONAL', 'MEI'])(
    '>>> regime %s: o legado NÃO é oferecido, e as cinco são <<<', (regime) => {
      const oferecidas = getExpenseCategoryOptionsForRegime(regime)
        .flatMap((g) => g.options.map((o) => o.value))
      for (const legado of LEGADOS) expect(oferecidas).not.toContain(legado)
      for (const c of CATEGORIAS_DO_BLOCO.filter((x) => !x.legado)) {
        expect(oferecidas).toContain(c.category)
      }
    })

  it('>>> e o legado continua sendo LIDO — tirar do seletor não é apagar o passado <<<', () => {
    // 19 lançamentos e R$ 85.085,77 nos dois rótulos, medidos em 02/10/2026.
    for (const legado of LEGADOS) {
      const partes = classificarLancamentoDeDespesa({
        expense_group: 'DESPESA_FIXA', expense_category: legado, amount: 1_000,
      })
      expect(partes[0].group).toBe(BLOCO_COMPROMISSOS)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O GRUPO É DERIVADO — ele não é oferecido, e o HUB tem a linha
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('o grupo novo é derivado, não lançável', () => {
  it('>>> ele está na fonte única e NÃO no seletor de grupo <<<', () => {
    expect(EXPENSE_GROUP_KEYS).toContain('COMPROMISSOS_FINANCEIROS')
    expect(EXPENSE_GROUP_OPTIONS.map((o) => o.value)).not.toContain('COMPROMISSOS_FINANCEIROS')
  })

  it('>>> e o HUB tem a linha, com o rótulo da categoria <<<', () => {
    const linha = HUB_GROUPS.find((g) => g.group === 'COMPROMISSOS_FINANCEIROS')
    expect(linha).toBeDefined()
    expect(linha?.label).toBe(LABEL_DO_BLOCO)
    expect(LABEL_DO_BLOCO).toBe('Compromissos Financeiros')
  })

  it('a linha nova fica LOGO DEPOIS da Despesa Fixa — é de lá que o valor saiu', () => {
    const i = HUB_GROUPS.findIndex((g) => g.group === 'COMPROMISSOS_FINANCEIROS')
    const iFixa = HUB_GROUPS.findIndex((g) => g.group === 'DESPESA_FIXA')
    expect(i).toBe(iFixa + 1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A DECOMPOSIÇÃO COMPLETA — o residual continua fechando em R$ 0,00
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('o residual da decomposição continua ZERO, com compromisso lançado', () => {
  /*
    O cenário tem compromisso MAIOR QUE ZERO de propósito: com zero, congelar o balde novo ou
    esquecê-lo daria o mesmo residual, e o verde existiria com o defeito presente.
  */
  const BALDES_DEC: BaldesDeDespesa = {
    fixa: 0.10, compromisso: 0.045, variavel: 0.05, financeira: 0.02, indireta: 0.08, moProdutiva: 0,
  }
  const [RT, COM, LUC] = [0.01, 0.05, 0.10]
  const DAS = 0.11

  const precoDoItem = (cmv: number) => calculatePricing({
    calcType: 'INDUSTRIALIZACAO', totalItemsCost: cmv, yieldQuantity: 1,
    laborCostMonthly: 0, numProductiveEmployees: 0, monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
    structurePct: resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', BALDES_DEC),
    taxPct: DAS, commissionPct: COM, profitPct: LUC, rtReservePct: RT,
  }).priceUnit

  const item = (key: string, price: number, mat: number): BudgetDecompositionItem => ({
    key, label: key, quantity: 1, unitPrice: price, costUnit: mat, productiveLaborUnit: 0,
    commissionPct: COM * 100, profitPct: LUC * 100, rtPct: RT * 100, acrescimos: 0,
    rates: { icms_pct: 0, iss_pct: 0, pis_pct: 0, cofins_pct: 0, ibs_pct: 0, cbs_pct: 0, ipi_pct: 0, is_pct: 0, das_pct: DAS * 100 } as never,
  })

  const decompor = (baldes: BaldesDeDespesa, desconto = 0) => buildDecomposition(
    buildBudgetDecompositionInput({
      items: [item('p1', precoDoItem(120), 120)],
      discountPct: desconto, despesas: baldes,
      tenantCalcType: 'INDUSTRIALIZACAO', regime: 'SIMPLES_NACIONAL',
    }).input,
  )

  it('>>> residual R$ 0,00, sem desconto e com 5% de desconto <<<', () => {
    for (const d of [0, 0.05]) {
      const r = decompor(BALDES_DEC, d)
      expect(r.errors).toEqual([])
      expect(r.residual.total).toBeCloseTo(0, 6)
    }
  })

  it('>>> a linha de despesa CONGELADA carrega o compromisso — e o PAR mostra quanto <<<', () => {
    const comp = decompor(BALDES_DEC)
    const sem = decompor({ ...BALDES_DEC, compromisso: 0 })
    const linha = (r: ReturnType<typeof buildDecomposition>) =>
      Math.abs(r.rows.find((x) => x.key === 'despesas')!.total)

    expect(linha(comp)).toBeGreaterThan(linha(sem))
    // A diferença é o compromisso sobre o total do produto: 4,50% dele.
    const totalProduto = precoDoItem(120)
    expect(linha(comp) - linha(sem)).toBeCloseTo(totalProduto * 0.045, 6)
  })

  it('>>> e a despesa congelada é a MESMA que a do agregado sem separar — §0 <<<', () => {
    const separado = decompor(BALDES_DEC)
    const agregado = decompor({ ...BALDES_DEC, fixa: 0.145, compromisso: 0 })
    for (const k of ['despesas', 'rro', 'custos']) {
      expect(separado.rows.find((x) => x.key === k)!.total)
        .toBeCloseTo(agregado.rows.find((x) => x.key === k)!.total, 8)
    }
    expect(separado.lucroDaVenda?.valor).toBeCloseTo(agregado.lucroDaVenda?.valor as number, 8)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// §5 — A POSIÇÃO NO DRE DA ANÁLISE FINANCEIRA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('§B e §C — a linha do DRE é da CATEGORIA, e vem ANTES do Lucro Líquido', () => {
  /*
    ═══ O §5 DO COMANDO ESTAVA ERRADO, E O §C DO ADENDO O CORRIGE ═══

    O §5 mandava pôr a linha "depois do IRPJ/CSLL". Esta DRE NÃO TEM linha de IRPJ/CSLL — o
    comentário do próprio arquivo diz: *"Lucro Líquido (sem estimativa de IRPJ/CSLL — usa apenas
    valores reais do HUB)"*. A ordem correta é a que já estava no arquivo:

        (=) Lucro Operacional (EBITDA/EBIT)
        (−) Despesas Financeiras              ← JUROS
        (=) Resultado Financeiro
        (−) Compromissos Financeiros          ← PRINCIPAL, AQUI
        (=) Lucro Líquido
        (−) Investimentos (saem do lucro)
        (=) Sobra após Investimentos

    A primeira versão deste arquivo afirmava a ordem do §5 e passava verde — ela afirmava o que
    eu havia implementado, não o que a DRE precisa. Os casos abaixo afirmam a ordem do §C.
  */
  const ZERO: MonthlyValues = {
    jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
    jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
  }
  const mes = (v: number): MonthlyValues => ({ ...ZERO, jan: v })
  const DO_BLOCO = 4_500
  const DO_GRUPO_AMORTIZACAO = 500
  const INVESTIMENTO_DRE = 10_000

  /**
   * O fixture tira o compromisso da despesa fixa, porque é o que o pipeline real faz.
   *
   * `aggregateEntries` roteia as cinco categorias para `compromissosFinanceiros` e NÃO para
   * `despesaFixa`. Um fixture que somasse o balde novo sem tirar da fixa criaria uma dedução
   * inexistente, e o Lucro Líquido cairia — foi assim que três arquivos ficaram vermelhos na
   * primeira tentativa, e eles estavam certos.
   */
  const agg = (): AggregatedData => ({
    receitaBruta: mes(100_000),
    deducaoReceita: { ...ZERO }, repasse: { ...ZERO },
    investimento: mes(INVESTIMENTO_DRE),
    imposto: mes(5_000), impostoPorDentro: mes(3_000),
    maoDeObraProdutiva: mes(1_100), maoDeObraAdministrativa: mes(1_200), maoDeObra: { ...ZERO },
    despesaFixa: mes(20_000 - DO_BLOCO), despesaVariavel: mes(1_400), despesaFinanceira: mes(500),
    comissoes: mes(1_600), reservaTecnica: { ...ZERO },
    custoProduto: mes(20_000), impostosRecuperaveisCusto: { ...ZERO },
    atividadesTerceirizadas: { ...ZERO },
    compromissosFinanceiros: mes(DO_BLOCO + DO_GRUPO_AMORTIZACAO),
    compromissoPorCategoria: {
      'Empréstimos': mes(1_500), 'Consórcios': mes(800),
      'Amortização de Dívida (principal)': mes(2_200),
    },
  })

  const VARIANTES: { nome: string; build: (a: AggregatedData) => DreRow[] }[] = [
    { nome: 'Lucro Real', build: (a) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_REAL') },
    { nome: 'Presumido RET', build: (a) => buildDrePresumidoRET(a) },
    { nome: 'Simples Nacional', build: (a) => buildDreSimplesNacional(a, 'RESALE') },
  ]

  describe.each(VARIANTES)('$nome', ({ build }) => {
    const rows = build(agg())
    const i = (key: string) => rows.findIndex((l) => l.key === key)
    const pega = (key: string) => rows.find((l) => l.key === key)

    it('>>> §B — a linha se chama "Compromissos Financeiros", e NÃO "Amortização de Dívida" <<<', () => {
      expect(pega('compromissos_financeiros')?.label)
        .toBe(`(-) ${LABEL_DO_BLOCO} — já considerados na formação do preço`)
      // E o rótulo antigo não sobrou em NENHUMA linha desta variante.
      for (const l of rows) expect(l.label).not.toContain('(-) Amortização de Dívida (principal)')
    })

    it('>>> §E — o valor da linha é a soma das subcategorias, não só o da amortização <<<', () => {
      const subs = rows.filter((l) => l.key.startsWith('compromisso_') && l.key !== 'compromissos_financeiros')
      const somaDasSubs = subs.reduce((a, l) => a + l.values.jan, 0)
      expect(somaDasSubs).toBeCloseTo(DO_BLOCO, 2)
      // O DISCRIMINANTE: a linha NÃO é a amortização sozinha, e nem só as cinco — ela soma as
      // duas origens, e o grupo `AMORTIZACAO` não se perde.
      expect(pega('compromissos_financeiros')?.values.jan).toBeCloseTo(DO_BLOCO + DO_GRUPO_AMORTIZACAO, 2)
      expect(pega('compromissos_financeiros')?.values.jan).not.toBeCloseTo(2_200, 2)
      expect(pega('compromissos_financeiros')?.values.jan).not.toBeCloseTo(DO_BLOCO, 2)
    })

    it('>>> §E — "Amortização de Dívida (principal)" continua existindo como SUBCATEGORIA <<<', () => {
      const sub = pega('compromisso_Amortização de Dívida (principal)')
      expect(sub).toBeDefined()
      expect(sub?.label).toBe('Amortização de Dívida (principal)')
      expect(sub?.indent).toBe(2)
      expect(sub?.values.jan).toBeCloseTo(2_200, 2)
      // E ela está DENTRO da linha da categoria, não ao lado dela.
      expect(i('compromisso_Amortização de Dívida (principal)')).toBeGreaterThan(i('compromissos_financeiros'))
    })

    it('>>> as subcategorias saem na ordem do bloco, e só as lançadas <<<', () => {
      const subs = rows.filter((l) => l.key.startsWith('compromisso_') && l.key !== 'compromissos_financeiros')
      expect(subs.map((l) => l.label)).toEqual([
        'Amortização de Dívida (principal)', 'Empréstimos', 'Consórcios',
      ])
      // Sem lançamento não há linha: uma de R$ 0,00 afirmaria que a empresa não tem aquele
      // compromisso (`ausente-vs-falso.md`).
      expect(subs.map((l) => l.label)).not.toContain('Financiamentos')
      expect(subs.map((l) => l.label)).not.toContain('Aplicações')
    })

    it('>>> §C — a ordem é: Despesas Financeiras → Compromissos → Lucro Líquido <<<', () => {
      expect(i('desp_financeira')).toBeLessThan(i('compromissos_financeiros'))
      expect(i('compromissos_financeiros')).toBeLessThan(i('lucro_liquido'))
      // E NÃO depois do Lucro Líquido, que era a leitura do §5 do comando.
      expect(i('compromissos_financeiros')).not.toBeGreaterThan(i('lucro_liquido'))
      // "Lucro Livre" não existe: ele era consequência da ordem errada.
      expect(pega('lucro_livre')).toBeUndefined()
    })

    it('>>> §D — a linha diz que ali é o PRINCIPAL e que os juros estão na de cima <<<', () => {
      const ajuda = (pega('compromissos_financeiros') as { ajuda?: string }).ajuda ?? ''
      expect(ajuda).toContain('PRINCIPAL')
      expect(ajuda).toContain('JUROS')
      expect(ajuda).toContain('Despesas Financeiras')
      // Não basta o rótulo: ele diz "Compromissos Financeiros", que é vizinho de "Despesas
      // Financeiras" e não distingue juros de principal.
      expect(pega('compromissos_financeiros')?.label).not.toContain('PRINCIPAL')
    })

    it('>>> §2.1 — o INVESTIMENTO fica sob o LUCRO, e a sobra desconta dele <<<', () => {
      expect(i('investimento')).toBeGreaterThan(i('lucro_liquido'))
      expect(pega('sobra_apos_investimento')?.values.jan)
        .toBeCloseTo((pega('lucro_liquido')?.values.jan as number) - INVESTIMENTO_DRE, 2)
    })

    it('>>> O LUCRO LÍQUIDO é o MESMO de antes desta rodada — a linha mudou de lugar, não de valor <<<', () => {
      /*
        O CENÁRIO EQUIVALENTE de antes: as cinco categorias eram gravadas como `DESPESA_FIXA` e
        liam ali, então `despesaFixa` carregava os 4.500 e o balde do bloco não existia. Se a
        reordenação movesse valor em vez de posição, este caso ficaria vermelho.
      */
      const comoEraAntes = build({
        ...agg(),
        // As cinco eram gravadas como `DESPESA_FIXA` e liam ali; o grupo `AMORTIZACAO` tinha o
        // seu próprio balde e a sua própria linha, subtraída do mesmo total.
        despesaFixa: mes(20_000),
        compromissosFinanceiros: mes(DO_GRUPO_AMORTIZACAO),
        compromissoPorCategoria: {},
      })
      const antes = comoEraAntes.find((l) => l.key === 'lucro_liquido')?.values.jan
      expect(pega('lucro_liquido')?.values.jan).toBeCloseTo(antes as number, 6)
    })
  })

  it('>>> o agregador manda o compromisso para o balde próprio, pela CATEGORIA <<<', () => {
    // O `expense_group` gravado continua `DESPESA_FIXA`: é a CATEGORIA que decide.
    const r = aggregateEntries([{
      type: 'EXPENSE', due_date: '2026-01-10', paid_date: '2026-01-10', amount: 1_000,
      expense_group: 'DESPESA_FIXA', expense_category: 'Empréstimos', payment_method: 'PIX',
    } as never])
    expect(r.compromissosFinanceiros.jan).toBe(1_000)
    expect(r.despesaFixa.jan).toBe(0)
    expect(r.compromissoPorCategoria['Empréstimos'].jan).toBe(1_000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// §A — O NOME É UM SÓ, EM TODO O REPOSITÓRIO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('§A — "Compromissos Financeiros" é o único nome', () => {
  /*
    O nome descartado em 02/10/2026 não pode sobrar em rótulo, chave de grupo, comentário, nome
    de teste nem nome de arquivo. O portão varre o repositório inteiro, nas QUATRO grafias em
    que um identificador pode carregá-lo — espaços, PascalCase, SNAKE e kebab —, mais as duas
    traduções em inglês que ele produziu nas colunas e nos campos.

    >>> POR QUE VARRER O REPOSITÓRIO, E NÃO CONFERIR OS PONTOS QUE EU MEXI <<<

    Conferir uma lista de pontos é presumir os outros, e foi assim que `pushCompromisso…` ficou
    com o nome antigo depois de uma substituição que trocou a grafia minúscula e não a
    PascalCase. O portão lê o disco.
  */
  const RAIZ = process.cwd()
  const EXTENSOES = ['.ts', '.tsx', '.sql', '.md']
  const IGNORAR = ['node_modules', '.next', '.git', 'dist', 'coverage']
  /*
    >>> AS GRAFIAS SÃO MONTADAS, E O NOME MORTO NÃO ESTÁ ESCRITO AQUI <<<

    A primeira versão deste portão listava as doze grafias literalmente — e ficou VERMELHO
    apontando para si mesmo, porque o §A diz "nem em nome de teste". O portão estava certo: o
    nome tinha sobrado num arquivo, e o arquivo era ele.

    Montar as grafias a partir das PALAVRAS mantém o portão sem exceção. Excluir o próprio
    arquivo da varredura seria abrir a porta que `portao-que-nao-alcanca.md` descreve: uma
    exceção num portão é um ponto que ele deixa de alcançar, e o próximo esquecimento cabe nela.
  */
  const A = 'Compromiss'
  const B = 'apital'
  const GRAFIAS = [
    `${A}o de C${B}`, `${A}o de c${B}`, `${A.toLowerCase()}o de c${B}`,
    `${A.toUpperCase()}O DE C${B.toUpperCase()}`,
    `${A}oDeC${B}`, `${A.toLowerCase()}oDeC${B}`,
    `${A.toUpperCase()}O_DE_C${B.toUpperCase()}`, `${A.toLowerCase()}o_de_c${B}`,
    `${A.toLowerCase()}o-de-c${B}`,
    `c${B}_commitment`, `c${B}Commitment`, `C${B}Commitment`,
  ]

  const arquivos: string[] = []
  const varrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORAR.includes(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) varrer(full)
      else if (EXTENSOES.some((x) => e.name.endsWith(x))) arquivos.push(full)
    }
  }
  varrer(path.join(RAIZ, 'src'))
  varrer(path.join(RAIZ, 'supabase'))

  it('>>> o portão alcança o disco: há arquivos para varrer <<<', () => {
    // Sem esta linha, um `varrer` que não achasse nada deixaria o caso abaixo verde por vacuidade
    // — é `portao-que-nao-alcanca.md`: o portão tem de poder ficar vermelho.
    expect(arquivos.length).toBeGreaterThan(300)
  })

  it.each(GRAFIAS)('>>> nenhuma ocorrência de `%s` em nenhum arquivo <<<', (grafia) => {
    const comOcorrencia = arquivos.filter((f) => fs.readFileSync(f, 'utf-8').includes(grafia))
    expect(comOcorrencia.map((f) => path.relative(RAIZ, f))).toEqual([])
  })

  it('>>> e nenhum NOME DE ARQUIVO carrega o nome antigo <<<', () => {
    const comNome = arquivos.filter((f) => /compromisso[-_]de[-_]capital|capital[-_]commitment/i.test(path.basename(f)))
    expect(comNome.map((f) => path.relative(RAIZ, f))).toEqual([])
  })

  it('>>> o rótulo é UM literal só: tudo o que exibe o nome LÊ a fonte única <<<', () => {
    expect(LABEL_DO_BLOCO).toBe('Compromissos Financeiros')
    // Os pontos que exibem o nome não reescrevem o texto — eles leem `LABEL_DO_BLOCO`. Dois
    // literais iguais são a cópia divergente em forma de rótulo.
    const grupos = fs.readFileSync(path.join(RAIZ, 'src/constants/expense-groups.ts'), 'utf-8')
    expect(grupos).toContain('label: LABEL_DO_BLOCO')
    expect(grupos).toContain('labelHub: LABEL_DO_BLOCO')
    const dfc = fs.readFileSync(path.join(RAIZ, 'src/pages/dfc/index.tsx'), 'utf-8')
    expect(dfc).toContain('`(-) ${LABEL_DO_BLOCO} — já considerados na formação do preço`')
  })

  it('>>> a chave do grupo é a MESMA constante do subgrupo de apresentação <<<', () => {
    expect(BLOCO_COMPROMISSOS).toBe('COMPROMISSOS_FINANCEIROS')
    expect(EXPENSE_GROUP_KEYS).toContain('COMPROMISSOS_FINANCEIROS')
    expect(EXPENSE_GROUP_OPTIONS.map((o) => o.value)).not.toContain('COMPROMISSOS_FINANCEIROS')
  })
})

describe('a despesa fixa em R$/mês NÃO inclui mais o compromisso — ADENDO 3', () => {
  /*
    >>> ESTE BLOCO AFIRMAVA O CONTRÁRIO ATÉ 02/10/2026, E A INVERSÃO É O PONTO <<<

    A versão anterior se chamava "continua incluindo o compromisso" e exigia que
    `fixed_expense_monthly` somasse `DESPESA_FIXA + COMPROMISSOS_FINANCEIROS`. A razão era boa
    naquele desenho: no serviço a fixa fica FORA do coeficiente, então tirar o compromisso do
    custo por minuto o faria sair do preço sem voltar por lugar nenhum.

    O ADENDO 3 deu-lhe um lugar — o DENOMINADOR do serviço. Então ele tem de sair daqui, e os
    casos abaixo passam a afirmar a saída. Não é o caso que estava errado; é a regra que mudou
    (`decisao-sob-regra-da-epoca.md`).

    O que NÃO mudou é o perigo: ele tem de estar em UM lugar. Os dois primeiros casos abaixo são
    o par que distingue os três estados possíveis — só no numerador, só no denominador, nos dois.
  */
  it('>>> a média mensal PERDE o compromisso, e a diferença é exatamente ele <<<', () => {
    const antes = mediaMensalDaDespesaFixa(HUB_ANTES)
    const depois = mediaMensalDaDespesaFixa(HUB_DEPOIS)
    // ANTES o compromisso estava dentro do grupo DESPESA_FIXA do caixa, então a linha do HUB
    // já o trazia: a média era a soma dos dois.
    expect(antes).toBe(FIXAS_COMUNS + COMPROMISSOS)
    // DEPOIS ele tem grupo próprio e esta função lê SÓ a fixa.
    expect(depois).toBe(FIXAS_COMUNS)
    expect(antes - depois).toBe(COMPROMISSOS)
  })

  it('>>> o PAR que mata a dupla contagem: o que saiu do numerador ENTRA no denominador <<<', () => {
    /*
      Este é o caso da mutação (S1) e da (S2) ao mesmo tempo, e ele é o único aqui que as
      distingue:

        S1 — o compromisso nos DOIS lugares: a média mensal voltaria a somá-lo E o coeficiente
             também o traria. O preço do serviço subiria duas vezes.
        S2 — o compromisso em NENHUM: a média o perde (abaixo) e o coeficiente não o ganha. O
             preço CAI, e um preço menor não levanta erro.

      Afirmar só a saída do numerador deixaria a S2 viva, que é a mais perigosa das duas.
    */
    const baldes = {
      fixa: 0.20, variavel: 0.05, financeira: 0.01, indireta: 0,
      compromisso: COMPROMISSOS / FATURAMENTO, moProdutiva: 0,
    }
    const noDenominador = resolveDespesasOperacionaisPct('SERVICO', baldes)
    expect(noDenominador).toBeCloseTo(0.05 + 0.01 + baldes.compromisso, 12)
    // E a fixa continua FORA do denominador do serviço — ela é numerador, e é o §1 do ADENDO 3
    // dizendo "não mexa nela".
    expect(noDenominador).toBeLessThan(0.05 + 0.01 + baldes.compromisso + baldes.fixa)
    expect(mediaMensalDaDespesaFixa(HUB_DEPOIS)).toBe(FIXAS_COMUNS)
  })

  it('a FIXA continua no numerador, intocada — §1 do ADENDO 3', () => {
    // Se a fixa fosse junto para o denominador (mutação S3), esta função devolveria zero e o
    // custo por minuto do serviço desabaria.
    expect(mediaMensalDaDespesaFixa(HUB_DEPOIS)).toBe(FIXAS_COMUNS)
    expect(mediaMensalDaDespesaFixa(HUB_DEPOIS)).toBeGreaterThan(0)
  })

  it('>>> e meses DIFERENTES não viram média de média <<<', () => {
    /*
      `averageRS` divide por "meses com valor > 0". Com um grupo só a reconstrução mês a mês dá
      o mesmo número que `row.averageRS`, e o caso continua aqui porque é ele que afirma que a
      função não passou a somar um segundo grupo por descuido.
    */
    const doisMeses: HubData = {
      months: ['2026-01', '2026-02'],
      rows: [
        { ...row('DESPESA_FIXA', 2_000), values: { '2026-01': 1_000, '2026-02': 1_000 }, closedMonthsWithData: 2, averageRS: 1_000 },
        { ...row(BLOCO_COMPROMISSOS, 9_999), values: { '2026-02': 9_999 }, closedMonthsWithData: 1, averageRS: 9_999 },
      ],
      incomeByMonth: { '2026-01': FATURAMENTO, '2026-02': FATURAMENTO },
      totalIncome: FATURAMENTO * 2,
      totalIncomeMonthsCount: 2,
    }
    // 2.000 ÷ 2 = 1.000. O 9.999 do compromisso NÃO entra — e o valor é absurdo de propósito,
    // para que somá-lo por engano não possa passar por arredondamento.
    expect(mediaMensalDaDespesaFixa(doisMeses)).toBe(1_000)
    expect(mediaMensalDaDespesaFixa(doisMeses)).not.toBe(5_999.5)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O MOTOR V17 — o compromisso chega ao balde `fixa`, com o destino da fixa
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('o motor V17 recebe o compromisso dentro do balde da despesa fixa', () => {
  /*
    §6.1 — "mesma mecânica das demais, com origem e destino". O compromisso veio de DENTRO da
    despesa fixa, e por isso herda a origem e o destino dela: CUSTO em segmentação SERVIÇO,
    MARGEM nas outras duas. Quem aplica o destino é `applyDopDestinations`, sobre o balde
    `fixa` — então somar o compromisso nesse balde É dar-lhe o destino da fixa.

    NÃO foi criada uma sexta categoria em `CategoryDestinations`: `destination-snapshot.ts`
    recusa um snapshot que não traga TODAS as categorias ("um snapshot pela metade não é um
    snapshot"), e uma categoria obrigatória nova faria o parser devolver `null` para todo
    `destination_snapshot` JÁ GRAVADO — a decomposição de cada documento congelado cairia
    inteira. `fato-vs-referencia.md`: o snapshot é fato histórico.
  */
  const baldes = (eb: Record<string, number>) =>
    resolveDopRates({} as never, 'LUCRO_REAL', eb as never, 'INDUSTRIALIZACAO', 0)

  const SEPARADO = { fixed_pct: 0.20, financial_commitments_pct: 0.045, variable_pct: 0.05, financial_pct: 0.01, administrative_pct: 0.07 }
  const AGREGADO = { fixed_pct: 0.245, variable_pct: 0.05, financial_pct: 0.01, administrative_pct: 0.07 }

  it('>>> separado e agregado dão o MESMO balde `fixa` <<<', () => {
    expect(baldes(SEPARADO).fixed).toBeCloseTo(baldes(AGREGADO).fixed, 12)
    expect(baldes(SEPARADO).fixed).toBeCloseTo(0.245, 12)
    // E os outros três não se mexem.
    for (const k of ['admin', 'variable', 'financial'] as const) {
      expect(baldes(SEPARADO)[k]).toBeCloseTo(baldes(AGREGADO)[k], 12)
    }
  })

  it('>>> o PAR: sem o campo novo o motor veria 4,50 pontos MENOS de despesa <<<', () => {
    const esquecido = { fixed_pct: 0.20, variable_pct: 0.05, financial_pct: 0.01, administrative_pct: 0.07 }
    expect(baldes(esquecido).fixed).toBeCloseTo(0.20, 12)
    expect(baldes(SEPARADO).fixed - baldes(esquecido).fixed).toBeCloseTo(0.045, 12)
  })

  it('>>> e um `expense_breakdown` SEM o campo (documento antigo) contribui ZERO <<<', () => {
    // O `fixed_pct` recebido ali AINDA contém o compromisso. Somar algo o contaria duas vezes.
    expect(baldes(AGREGADO).fixed).toBeCloseTo(0.245, 12)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// UM GRUPO, COM AS CINCO DENTRO — e a linha do DRE com UM termo
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('as cinco ficaram num ÚNICO expense_group', () => {
  /*
    Formulação do dono do produto, registrada como está (02/10/2026):

      > Compromissos Financeiros é uma categoria só. As cinco são subcategorias dela. Nenhuma é
      > despesa fixa. Amortização não é despesa fixa.
      >
      > Se a implementação ainda precisa somar "as categorias do bloco" mais "o grupo
      > AMORTIZACAO", é porque as cinco não foram para um grupo só. Elas continuariam espalhadas
      > em dois grupos, com a soma remendando por cima.
      >
      > Depois da rodada tem que existir um grupo, com as cinco dentro. Nada de somar dois.

    A primeira entrega desta campanha mudou a LEITURA e deixou a declaração com dois grupos —
    rótulo novo sobre a divisão antiga. Estes casos são o portão disso: eles ficam vermelhos no
    dia em que uma das cinco voltar a declarar outro grupo, ou a linha voltar a somar dois.
  */
  it('>>> UMA chave de grupo, e as sete categorias a declaram <<<', () => {
    expect(BLOCO_COMPROMISSOS).toBe('COMPROMISSOS_FINANCEIROS')
    const grupos = new Set(CATEGORIAS_DO_BLOCO.map((c) => c.group as string))
    expect([...grupos]).toEqual(['COMPROMISSOS_FINANCEIROS'])
    expect(grupos.size).toBe(1)
  })

  it('>>> e NENHUMA declara `DESPESA_FIXA` ou `AMORTIZACAO` — era a divisão antiga <<<', () => {
    for (const c of CATEGORIAS_DO_BLOCO) {
      expect(c.group as string).not.toBe('DESPESA_FIXA')
      expect(c.group as string).not.toBe('AMORTIZACAO')
    }
  })

  it('>>> a LINHA DO DRE tem UM termo: ela não soma dois grupos <<<', () => {
    /*
      Caso de CAMINHO, declarado, e é o único jeito de afirmar a AUSÊNCIA de uma soma: o
      resultado de `a + 0` é igual ao de `a`, então nenhum número distingue "soma dois baldes,
      um deles vazio" de "lê um balde". O efeito da linha — valor, posição, rótulo e
      subcategorias — é afirmado nos casos de `§B e §C` acima, com o DRE renderizado.
    */
    const dfc = fs.readFileSync(path.join(process.cwd(), 'src/pages/dfc/index.tsx'), 'utf-8')
    expect(dfc).toContain('const total = agg.compromissosFinanceiros')
    expect(dfc).not.toContain('sumMonths(agg.compromissosFinanceiros, agg.amortizacao)')
    // E o balde separado deixou de existir: é ele que a soma existia para resgatar.
    expect(dfc).not.toContain('amortizacao: MonthlyValues')
  })

  it('>>> o grupo gravado de um lançamento NOVO é o único — nos dois caminhos de gravação <<<', () => {
    // `getGroupForCategoryByRegime` (por regime) e `getDefaultGroupForCategory` (por chave) são
    // os dois pontos que decidem o que vai para a coluna. A concordância entre as duas
    // declarações é afirmada em `bloco-compromissos-na-tela.test.ts`; aqui o que se afirma é o
    // RESULTADO de cada caminho.
    for (const c of CATEGORIAS_DO_BLOCO) {
      expect(getGroupForCategoryByRegime('LUCRO_REAL', c.category)).toBe('COMPROMISSOS_FINANCEIROS')
    }
    for (const chave of ['AMORTIZACAO', 'FINANCIAMENTOS', 'EMPRESTIMOS', 'CONSORCIOS', 'APLICACOES']) {
      expect(getDefaultGroupForCategory(chave)).toBe('COMPROMISSOS_FINANCEIROS')
    }
  })

  it('>>> e o preço continua IDÊNTICO com o grupo gravado novo ou com o legado <<<', () => {
    /*
      §0. Até a migração `20261002000002` ser aplicada, os 45 lançamentos existentes têm
      `DESPESA_FIXA` na coluna e os novos terão `COMPROMISSOS_FINANCEIROS`. A leitura por
      CATEGORIA cobre os dois — e o percentual tem de sair igual nos dois estados, ou o preço
      mudaria conforme a data do lançamento.
    */
    const comoOBancoEstaHoje = classificarLancamentoDeDespesa({
      expense_group: 'DESPESA_FIXA', expense_category: 'Empréstimos', amount: 1_000,
    })
    const comoFicaDepoisDaMigracao = classificarLancamentoDeDespesa({
      expense_group: 'COMPROMISSOS_FINANCEIROS', expense_category: 'Empréstimos', amount: 1_000,
    })
    expect(comoOBancoEstaHoje).toEqual(comoFicaDepoisDaMigracao)
    expect(comoOBancoEstaHoje[0].group).toBe('COMPROMISSOS_FINANCEIROS')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A MIGRAÇÃO DE DADO — entregue, não executada
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('a migração que alinha os lançamentos já gravados', () => {
  const dir = path.join(process.cwd(), 'supabase', 'migrations')
  const arquivo = fs.readdirSync(dir).find((f) => f.includes('compromissos_financeiros_grupo_unico'))

  /**
   * O SQL SEM COMENTÁRIO — e é esta linha que faz os casos abaixo exercitarem algo.
   *
   * >>> A PRIMEIRA VERSÃO LIA O ARQUIVO INTEIRO, E A MUTAÇÃO (M1) SOBREVIVEU <<<
   *
   * O cabeçalho desta migração traz as sete categorias DUAS vezes, nas consultas de ANTES e
   * DEPOIS. Com o arquivo inteiro, `toContain("'Aplicações / Consórcios'")` passava pelo
   * COMENTÁRIO: tirar o rótulo do `WHERE` deixava o caso verde, e o lançamento legado ficaria
   * com `DESPESA_FIXA` na coluna sem nada falhar.
   *
   * É `teste-que-nao-exercita.md` na forma mais limpa — o caso passava antes e depois —, e quem
   * apontou foi a mutação, não a leitura.
   */
  const corpoDoSql = () => fs.readFileSync(path.join(dir, arquivo as string), 'utf-8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')

  it('>>> ela existe, e é um UPDATE pela CATEGORIA, não pelo grupo <<<', () => {
    expect(arquivo).toBeDefined()
    const sql = corpoDoSql()
    expect(sql).toContain('update public.cash_entries')
    expect(sql).toContain("set expense_group = 'COMPROMISSOS_FINANCEIROS'")
    // O WHERE é pela categoria: é ela que o usuário escolheu, e o grupo é derivado dela.
    expect(sql).toContain('expense_category in (')
  })

  it('>>> as SETE categorias estão no WHERE, inclusive os dois rótulos legados <<<', () => {
    // Deixar um legado fora faria aqueles 19 lançamentos manterem `DESPESA_FIXA` na coluna, e
    // aí qualquer consulta que não passe pela leitura por categoria continuaria vendo
    // compromisso como despesa fixa — que é a razão de a migração existir.
    const sql = corpoDoSql()
    for (const c of CATEGORIAS_DO_BLOCO) expect(sql).toContain(`'${c.category}'`)
    expect(CATEGORIAS_DO_BLOCO).toHaveLength(7)
    // E o PAR: nenhuma categoria de FORA do bloco entrou na lista por engano.
    const naLista = (sql.match(/'[^']+'/g) ?? []).map((x) => x.slice(1, -1))
    const categorias = naLista.filter((x) => !['COMPROMISSOS_FINANCEIROS', 'DESPESA_FIXA', 'AMORTIZACAO'].includes(x))
    expect([...new Set(categorias)].sort()).toEqual(CATEGORIAS_DO_BLOCO.map((c) => c.category).sort())
  })

  it('>>> e ela NÃO toca em quem não é do bloco — o WHERE restringe o grupo de origem <<<', () => {
    expect(corpoDoSql()).toContain("expense_group in ('DESPESA_FIXA', 'AMORTIZACAO')")
  })
})
