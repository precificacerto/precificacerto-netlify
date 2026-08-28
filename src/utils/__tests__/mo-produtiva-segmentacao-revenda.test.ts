/**
 * MO PRODUTIVA × SEGMENTAÇÃO — `extractStructurePercents` (hub-engine).
 *
 * DEFEITO CORRIGIDO: em REVENDA não existe mão de obra PRODUTIVA — quem revende não
 * produz. A tela de precificação já reconhecia isso e ZERAVA a MO produtiva
 * (content.component.tsx:715 → `laborCostMonthly` e `productWorkloadMinutes` = 0 quando o
 * calcType efetivo é REVENDA), mas zerava SEM REALOCAR. Como a cascata do Motor RRO só
 * tem QUATRO baldes de despesa (MO indireta, fixa, variável, financeira), o custo lançado
 * no Hub como MO produtiva simplesmente SUMIA: não aparecia na precificação nem na
 * cascata. O dinheiro existia no fluxo de caixa e evaporava no motor.
 *
 * REGRA: `extractStructurePercents` passa a receber a segmentação do tenant
 * (`tenant_settings.calc_type`) e, SÓ em REVENDA:
 *   - soma a MO PRODUTIVA na mão de obra INDIRETA (o balde que sobrevive em revenda);
 *   - devolve `production_labor_cost_percent = 0` (já contabilizada acima; devolvê-la
 *     de novo seria dupla contagem).
 *
 * ESCOPO BLINDADO: INDUSTRIALIZACAO, SERVICO e a ausência de segmento (undefined/null)
 * são BIT-EXACT ao comportamento anterior — a expressão da indireta é literalmente a
 * mesma e a produtiva volta pelo seu próprio campo. Lucro Real só muda quando o tenant
 * é REVENDA, que é exatamente o gatilho autorizado.
 */

import { extractStructurePercents } from '../hub-engine'
import type { HubData, HubRow } from '../hub-engine'

type Segment = 'INDUSTRIALIZACAO' | 'REVENDA' | 'SERVICO' | null

const TOTAL_INCOME = 100000

/**
 * Linha do Hub. `averagePct` (0-100) alimenta o caminho PADRÃO (denominador = totalIncome);
 * `totalSum` alimenta o caminho de BASE CUSTOMIZADA (LR/Híbrido). Os dois são mantidos
 * coerentes (totalSum = averagePct% de TOTAL_INCOME) para que os caminhos sejam comparáveis.
 */
function row(group: string, averagePct: number): HubRow {
  const totalSum = (averagePct / 100) * TOTAL_INCOME
  return {
    group,
    label: group,
    values: { '2026-01': totalSum },
    totalSum,
    closedMonthsWithData: 1,
    averageRS: totalSum,
    averagePct,
    subRows: [],
  }
}

function hub(rows: HubRow[]): HubData {
  return {
    months: ['2026-01'],
    rows,
    incomeByMonth: { '2026-01': TOTAL_INCOME },
    totalIncome: TOTAL_INCOME,
    totalIncomeMonthsCount: 1,
  }
}

/** MO produtiva 6% + MO administrativa 4% + os demais baldes, todos distintos entre si. */
const HUB_PADRAO = hub([
  row('MAO_DE_OBRA_PRODUTIVA', 6),
  row('MAO_DE_OBRA_ADMINISTRATIVA', 4),
  row('DESPESA_FIXA', 10),
  row('DESPESA_VARIAVEL', 5),
  row('DESPESA_FINANCEIRA', 2),
  row('IMPOSTO_FATURAMENTO_DENTRO', 3),
  row('REGIME_TRIBUTARIO', 7),
  row('IMPOSTO', 1),
  row('ATIVIDADES_TERCEIRIZADAS', 2),
  row('DEDUCAO_RECEITA', 1),
  row('COMISSOES', 3),
])

const run = (segment?: Segment, data: HubData = HUB_PADRAO, customBase?: number) =>
  extractStructurePercents(data, customBase, segment)

describe('REVENDA — a MO produtiva é AGRUPADA na mão de obra indireta', () => {
  const revenda = () => run('REVENDA')

  it('a indireta absorve a produtiva (4% + 6% = 10%)', () => {
    expect(revenda().indirect_labor_percent).toBeCloseTo(0.1, 10)
  })

  it('a MO produtiva volta ZERADA — não há mão de obra produtiva em revenda', () => {
    expect(revenda().production_labor_cost_percent).toBe(0)
  })

  it('nada se perde: indireta(REVENDA) = indireta + produtiva do segmento produtivo', () => {
    const industria = run('INDUSTRIALIZACAO')
    expect(revenda().indirect_labor_percent).toBeCloseTo(
      industria.indirect_labor_percent + industria.production_labor_cost_percent,
      10,
    )
  })

  it('a soma total de mão de obra é a MESMA nos dois segmentos (só muda o balde)', () => {
    const somaMo = (p: ReturnType<typeof run>) =>
      p.indirect_labor_percent + p.production_labor_cost_percent
    expect(somaMo(revenda())).toBeCloseTo(somaMo(run('INDUSTRIALIZACAO')), 10)
  })

  it('sem linha de MO produtiva no Hub, a indireta fica intacta', () => {
    const semProdutiva = hub([row('MAO_DE_OBRA_ADMINISTRATIVA', 4), row('DESPESA_FIXA', 10)])
    const r = run('REVENDA', semProdutiva)
    expect(r.indirect_labor_percent).toBeCloseTo(0.04, 10)
    expect(r.production_labor_cost_percent).toBe(0)
  })

  it('MO produtiva sozinha (sem administrativa) migra inteira para a indireta', () => {
    const soProdutiva = hub([row('MAO_DE_OBRA_PRODUTIVA', 6)])
    const r = run('REVENDA', soProdutiva)
    expect(r.indirect_labor_percent).toBeCloseTo(0.06, 10)
    expect(r.production_labor_cost_percent).toBe(0)
  })

  it('Hub sem nenhuma mão de obra: os dois campos ficam zerados', () => {
    const r = run('REVENDA', hub([row('DESPESA_FIXA', 10)]))
    expect(r.indirect_labor_percent).toBe(0)
    expect(r.production_labor_cost_percent).toBe(0)
  })

  it('o agrupamento NÃO toca nenhum outro balde de despesa', () => {
    const r = revenda()
    const base = run('INDUSTRIALIZACAO')
    expect(r.fixed_expense_percent).toBe(base.fixed_expense_percent)
    expect(r.variable_expense_percent).toBe(base.variable_expense_percent)
    expect(r.financial_expense_percent).toBe(base.financial_expense_percent)
  })

  it('o agrupamento NÃO toca impostos, terceirizadas, deduções nem comissões', () => {
    const r = revenda()
    const base = run('INDUSTRIALIZACAO')
    expect(r.tax_on_revenue_percent).toBe(base.tax_on_revenue_percent)
    expect(r.external_taxes_percent).toBe(base.external_taxes_percent)
    expect(r.outsourced_activities_percent).toBe(base.outsourced_activities_percent)
    expect(r.deducao_receita_percent).toBe(base.deducao_receita_percent)
    expect(r.commission_percent_hub).toBe(base.commission_percent_hub)
  })
})

describe('INDUSTRIALIZACAO e SERVICO — intactos (a produtiva continua produtiva)', () => {
  const PRODUTIVOS: Segment[] = ['INDUSTRIALIZACAO', 'SERVICO']

  it.each(PRODUTIVOS)('%s: a indireta NÃO absorve a produtiva (fica em 4%%)', (segment) => {
    expect(run(segment).indirect_labor_percent).toBeCloseTo(0.04, 10)
  })

  it.each(PRODUTIVOS)('%s: a MO produtiva volta pelo seu próprio campo (6%%)', (segment) => {
    expect(run(segment).production_labor_cost_percent).toBeCloseTo(0.06, 10)
  })

  it.each(PRODUTIVOS)('%s: resultado idêntico ao de não informar segmento', (segment) => {
    expect(run(segment)).toEqual(run(undefined))
  })

  it('INDUSTRIALIZACAO e SERVICO são idênticos entre si', () => {
    expect(run('INDUSTRIALIZACAO')).toEqual(run('SERVICO'))
  })
})

describe('Sem segmento — BIT-EXACT ao comportamento anterior', () => {
  // O parâmetro é opcional: chamadas legadas (`extractStructurePercents(hub)` e
  // `extractStructurePercents(hub, base)`) não podem mudar de resultado.
  const AUSENTES: Segment[] = [null]

  it('chamada com dois argumentos (assinatura legada) devolve o resultado de sempre', () => {
    const legado = extractStructurePercents(HUB_PADRAO)
    expect(legado.indirect_labor_percent).toBeCloseTo(0.04, 10)
    expect(legado.production_labor_cost_percent).toBeCloseTo(0.06, 10)
  })

  it.each(AUSENTES)('segmento %p equivale a não informar segmento', (segment) => {
    expect(run(segment)).toEqual(extractStructurePercents(HUB_PADRAO))
  })

  it('`undefined` explícito equivale a não informar segmento', () => {
    expect(run(undefined)).toEqual(extractStructurePercents(HUB_PADRAO))
  })

  it('bit-exact campo a campo (Object.is) contra a chamada legada', () => {
    const legado = extractStructurePercents(HUB_PADRAO)
    const comSegmentoNulo = run(null)
    for (const key of Object.keys(legado) as (keyof typeof legado)[]) {
      expect(Object.is(comSegmentoNulo[key], legado[key])).toBe(true)
    }
  })

  it('um segmento desconhecido cai no ramo neutro (nunca agrupa por engano)', () => {
    const desconhecido = extractStructurePercents(HUB_PADRAO, undefined, 'OUTRO' as unknown as Segment)
    expect(desconhecido).toEqual(extractStructurePercents(HUB_PADRAO))
  })
})

describe('Grupo legado MAO_DE_OBRA — retrocompatibilidade', () => {
  // `MAO_DE_OBRA` é o grupo antigo, anterior ao split produtiva/administrativa. Ele sempre
  // contou como INDIRETA e continua contando — o agrupamento de REVENDA só acrescenta a
  // MO produtiva por cima.
  const HUB_LEGADO = hub([
    row('MAO_DE_OBRA', 5),
    row('MAO_DE_OBRA_ADMINISTRATIVA', 4),
    row('MAO_DE_OBRA_PRODUTIVA', 6),
    row('DESPESA_FIXA', 10),
  ])

  it('fora de REVENDA: legado + administrativa na indireta, produtiva separada', () => {
    const r = run('INDUSTRIALIZACAO', HUB_LEGADO)
    expect(r.indirect_labor_percent).toBeCloseTo(0.09, 10)
    expect(r.production_labor_cost_percent).toBeCloseTo(0.06, 10)
  })

  it('em REVENDA: legado + administrativa + produtiva, tudo na indireta', () => {
    const r = run('REVENDA', HUB_LEGADO)
    expect(r.indirect_labor_percent).toBeCloseTo(0.15, 10)
    expect(r.production_labor_cost_percent).toBe(0)
  })

  it('Hub SÓ com o grupo legado: REVENDA não altera nada (não há produtiva)', () => {
    const soLegado = hub([row('MAO_DE_OBRA', 5)])
    expect(run('REVENDA', soLegado)).toEqual(run('INDUSTRIALIZACAO', soLegado))
  })

  it('o grupo legado convivendo com o novo não é contado duas vezes', () => {
    const r = run('REVENDA', HUB_LEGADO)
    const somaEsperada = 0.05 + 0.04 + 0.06
    expect(r.indirect_labor_percent).toBeCloseTo(somaEsperada, 10)
  })
})

describe('Base customizada (LR / Simples Híbrido) — denominador alternativo', () => {
  // Para LR/Híbrido o `recalcExpenseConfigFromCashflow` passa receitaBrutaBase como
  // denominador. A segmentação atua sobre o MESMO conjunto de percentuais, depois da
  // troca de base — as duas regras são ortogonais.
  const BASE_LR = 80000 // = totalIncome − impostos por fora − terceirizadas

  it('fora de REVENDA a base customizada muda o denominador e nada mais', () => {
    const r = run('INDUSTRIALIZACAO', HUB_PADRAO, BASE_LR)
    // 6% de 100.000 = 6.000; 6.000 / 80.000 = 7,5%
    expect(r.production_labor_cost_percent).toBeCloseTo(0.075, 10)
    expect(r.indirect_labor_percent).toBeCloseTo(0.05, 10)
  })

  it('em REVENDA o agrupamento acontece JÁ sobre a base customizada', () => {
    const r = run('REVENDA', HUB_PADRAO, BASE_LR)
    expect(r.indirect_labor_percent).toBeCloseTo(0.125, 10)
    expect(r.production_labor_cost_percent).toBe(0)
  })

  it('a soma de mão de obra se conserva também na base customizada', () => {
    const somaMo = (p: ReturnType<typeof run>) =>
      p.indirect_labor_percent + p.production_labor_cost_percent
    expect(somaMo(run('REVENDA', HUB_PADRAO, BASE_LR))).toBeCloseTo(
      somaMo(run('INDUSTRIALIZACAO', HUB_PADRAO, BASE_LR)),
      10,
    )
  })

  it('base customizada + sem segmento é BIT-EXACT à assinatura legada de 2 argumentos', () => {
    const legado = extractStructurePercents(HUB_PADRAO, BASE_LR)
    expect(run(undefined, HUB_PADRAO, BASE_LR)).toEqual(legado)
    expect(run(null, HUB_PADRAO, BASE_LR)).toEqual(legado)
  })

  it('base customizada inválida (<= 0) cai no denominador padrão, em qualquer segmento', () => {
    expect(run('INDUSTRIALIZACAO', HUB_PADRAO, 0)).toEqual(run('INDUSTRIALIZACAO'))
    expect(run('REVENDA', HUB_PADRAO, 0)).toEqual(run('REVENDA'))
  })
})

describe('Contrato do retorno — a assinatura nova não muda a forma do objeto', () => {
  it('as mesmas dez chaves, em qualquer segmento', () => {
    const chaves = Object.keys(extractStructurePercents(HUB_PADRAO)).sort()
    for (const segment of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO', null] as Segment[]) {
      expect(Object.keys(run(segment)).sort()).toEqual(chaves)
    }
  })

  it('todos os percentuais voltam em DECIMAL 0-1 e arredondados a 4 casas', () => {
    const r = run('REVENDA')
    for (const v of Object.values(r)) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      expect(Math.round(v * 10000) / 10000).toBe(v)
    }
  })
})
