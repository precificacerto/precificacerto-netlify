/**
 * O COMPROMISSO NO DENOMINADOR DO SERVIÇO — e o preço do serviço MUDA.
 *
 * ADENDO 3 do PO, 02/10/2026:
 *
 *   > No serviço a despesa tem um cálculo diferente, ela vai no numerador. Compromisso
 *   > financeiro ele vai no denominador, na margem de contribuição.
 *   > Para serviço pode alterar o preço.
 *
 * >>> ISTO INVERTE A REGRA DA MANHÃ DO MESMO DIA, E A INVERSÃO É O ASSUNTO <<<
 *
 * A Correção 6 e o ADENDO 2 puseram o compromisso no NUMERADOR do serviço — dentro de
 * `fixed_expense_monthly`, que vira custo por minuto — porque era de lá que ele saíra e porque
 * no serviço a despesa fixa fica fora do coeficiente de propósito
 * (`cascata-lucro-real.md`, Parte 0). A decisão estava certa para a regra daquela hora; o que
 * mudou é a regra (`decisao-sob-regra-da-epoca.md`).
 *
 * >>> ELE FICA EM UM LUGAR SÓ, E É ISSO QUE OS CASOS TÊM DE DISTINGUIR <<<
 *
 * Há TRÊS estados, não dois, e um caso que só afirmasse "o compromisso está no denominador"
 * ficaria verde em dois deles:
 *
 *   | estado                               | numerador | denominador | preço      |
 *   |--------------------------------------|-----------|-------------|------------|
 *   | certo (ADENDO 3)                     | não       | sim         | sobe       |
 *   | S1 — dupla contagem                  | sim       | sim         | sobe MAIS  |
 *   | S2 — perdido                         | não       | não         | CAI        |
 *
 * Por isso cada caso daqui afirma o NÚMERO dos dois lados, nunca a presença de um só.
 * (`teste-que-nao-exercita.md`, variante 3: afirmar passagem não é afirmar efeito.)
 *
 * >>> O PREÇO ESPERADO É CALCULADO FORA DA IMPLEMENTAÇÃO, POR DOIS CAMINHOS <<<
 *
 * §4 exige isso, e a razão é que o motor FORMA o preço por `CMV ÷ (1 − Σ)`. Reescrever essa
 * divisão no caso seria afirmar a fórmula contra ela mesma. O segundo caminho é um PONTO FIXO
 * — `P ← CMV + P × Σ` — que converge para o mesmo número sem nunca dividir por `(1 − Σ)`.
 */

import { calculatePricing } from '@/utils/pricing-engine'
import { computeServiceSellingPrice } from '@/utils/compute-service-price'
import { mediaMensalDaDespesaFixa } from '@/utils/recalc-expense-config'
import { divisorDaEstruturaPct, resolveDespesasOperacionaisPct, type BaldesDeDespesa } from '@/utils/despesas-do-segmento'
import { BLOCO_COMPROMISSOS } from '@/utils/compromissos-financeiros'
import type { HubData, HubRow } from '@/utils/hub-engine'

// ═════════════════════════════════════════════════════════════════════════════════════════
// O CENÁRIO — o tenant de SERVIÇO real, medido no banco em 02/10/2026
// ═════════════════════════════════════════════════════════════════════════════════════════

/*
  Tenant faec9ea2 (clínica, Simples Nacional), leitura do HUB com corte em 2026-09-30:

    receita total ............. R$ 63.740,00
    compromisso ............... R$ 12.325,00 em 2 meses  →  19,34% · média R$ 6.162,50
    fixa pura ................. R$ 12.916,39 em 3 meses  →  20,26% · média R$ 4.305,46
    fixa+compromisso .......... R$ 25.241,39 em 3 meses  →  39,60% · média R$ 8.413,80
    variável .................. 18,18%   financeira ..... 2,20%

  Os números NÃO são redondos de propósito: 19,34% é grande o bastante para que o efeito no
  preço seja visível em reais, e não some num arredondamento.
*/
const RECEITA = 63_740
const FIXA_PURA_RS = 12_916.39
/** 12.325,00 ÷ 63.740,00 × 100, arredondado a 2 como o HUB o arredonda. */
const COMPROMISSO_PCT = Math.round(((12_325 / RECEITA) * 100) * 100) / 100 // 19,34
const VARIAVEL_PCT = 18.18
const FINANCEIRA_PCT = 2.20

const MO_PRODUTIVA_MENSAL = 100
const WORKLOAD_MIN = 4_800 // 1 funcionário × 80 h × 60

/** Média mensal do HUB: total ÷ meses com valor > 0. */
const MEDIA_FIXA_PURA = Math.round((FIXA_PURA_RS / 3) * 100) / 100          // 4.305,46
const MEDIA_FIXA_COM_COMPROMISSO = Math.round(((12_670 + 8_110.93 + 4_460.46) / 3) * 100) / 100 // 8.413,80

function row(group: string, values: Record<string, number>): HubRow {
  const totalSum = Object.values(values).reduce((a, v) => a + v, 0)
  const meses = Object.values(values).filter((v) => v > 0).length
  return {
    group, label: group, values, totalSum,
    closedMonthsWithData: meses,
    averageRS: meses > 0 ? Math.round((totalSum / meses) * 100) / 100 : 0,
    averagePct: Math.round(((totalSum / RECEITA) * 100) * 100) / 100,
    subRows: [],
  }
}

const HUB: HubData = {
  months: ['2026-04', '2026-06', '2026-07'],
  rows: [
    row('DESPESA_FIXA', { '2026-04': 1_320, '2026-06': 7_135.93, '2026-07': 4_460.46 }),
    row(BLOCO_COMPROMISSOS, { '2026-04': 11_350, '2026-06': 975 }),
  ],
  incomeByMonth: { '2026-04': 35_000, '2026-06': 5_625, '2026-07': 23_115 },
  totalIncome: RECEITA,
  totalIncomeMonthsCount: 3,
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// OS DOIS CAMINHOS INDEPENDENTES PARA O PREÇO ESPERADO
// ═════════════════════════════════════════════════════════════════════════════════════════

/** Caminho 1 — forma fechada, escrita aqui e não lida do motor. */
function precoFormaFechada(cmv: number, somaFrac: number): number {
  return Math.round((cmv / (1 - somaFrac)) * 100) / 100
}

/**
 * Caminho 2 — PONTO FIXO. `P = CMV + P × Σ` é a mesma igualdade sem a divisão: cada parcela do
 * denominador é um percentual SOBRE O PREÇO, então somá-las ao custo e repetir converge.
 *
 * Não divide por `(1 − Σ)` em passo nenhum, e é isso que o torna independente do caminho 1 e
 * do motor. 2.000 passos bastam para `Σ < 0,96` (razão geométrica).
 */
function precoPontoFixo(cmv: number, somaFrac: number): number {
  let p = cmv
  for (let i = 0; i < 2_000; i++) p = cmv + p * somaFrac
  return Math.round(p * 100) / 100
}

// ═════════════════════════════════════════════════════════════════════════════════════════

describe('1. §1 — O COMPROMISSO SAI DO NUMERADOR', () => {
  it('>>> `fixed_expense_monthly` perde a parcela do compromisso <<<', () => {
    expect(mediaMensalDaDespesaFixa(HUB)).toBe(MEDIA_FIXA_PURA)
    // O PAR: o que a função devolvia antes do ADENDO 3, reconstruído à mão a partir do mesmo
    // HUB. A diferença é R$ 4.108,34 por mês de custo por minuto.
    expect(MEDIA_FIXA_COM_COMPROMISSO - MEDIA_FIXA_PURA).toBeCloseTo(4_108.34, 2)
    expect(mediaMensalDaDespesaFixa(HUB)).not.toBe(MEDIA_FIXA_COM_COMPROMISSO)
  })

  it('a FIXA continua inteira — §1, "não mexa nela"', () => {
    // Se a fixa tivesse ido junto (mutação S3), este número seria ZERO.
    expect(mediaMensalDaDespesaFixa(HUB)).toBeCloseTo(4_305.46, 2)
    expect(mediaMensalDaDespesaFixa(HUB)).toBeGreaterThan(0)
  })
})

describe('2. §1 — E ENTRA NO DENOMINADOR, na fonte única do segmento', () => {
  const BALDES: BaldesDeDespesa = {
    fixa: 0.2026, compromisso: COMPROMISSO_PCT / 100,
    variavel: VARIAVEL_PCT / 100, financeira: FINANCEIRA_PCT / 100,
    indireta: 0, moProdutiva: 0,
  }

  it('>>> SERVICO soma variável + financeira + COMPROMISSO, e NÃO a fixa <<<', () => {
    const svc = resolveDespesasOperacionaisPct('SERVICO', BALDES)
    expect(svc).toBeCloseTo((VARIAVEL_PCT + FINANCEIRA_PCT + COMPROMISSO_PCT) / 100, 10)
    // Os dois estados errados, nomeados pelo número que cada um daria:
    expect(svc).not.toBeCloseTo((VARIAVEL_PCT + FINANCEIRA_PCT) / 100, 4)            // S2
    expect(svc).not.toBeCloseTo((VARIAVEL_PCT + FINANCEIRA_PCT + COMPROMISSO_PCT + 20.26) / 100, 4) // S3
  })

  it('>>> §4 — INDUSTRIALIZAÇÃO e REVENDA não se movem: a soma é a de antes <<<', () => {
    // `semSeparar` é o estado anterior à Correção 6: tudo dentro da `fixa`. Fora do serviço o
    // agregado tem de ser IDÊNTICO, e é a trava do §0 nos dois segmentos.
    const semSeparar: BaldesDeDespesa = { ...BALDES, fixa: 0.2026 + COMPROMISSO_PCT / 100, compromisso: 0 }
    for (const seg of ['INDUSTRIALIZACAO', 'REVENDA'] as const) {
      expect(resolveDespesasOperacionaisPct(seg, BALDES))
        .toBeCloseTo(resolveDespesasOperacionaisPct(seg, semSeparar), 12)
    }
    // E o PAR: no SERVIÇO a mesma troca MUDA o número — é lá, e só lá, que o ADENDO 3 age.
    expect(resolveDespesasOperacionaisPct('SERVICO', BALDES))
      .not.toBeCloseTo(resolveDespesasOperacionaisPct('SERVICO', semSeparar), 4)
  })
})

describe('3. §4 — O PREÇO DO SERVIÇO MUDA, e os dois caminhos concordam', () => {
  const MATERIAL = 3.00
  const MINUTOS = 20
  const LUCRO = 48.85
  const TAX = 7.095

  function cfg(fixedMonthly: number, compromissoPct: number) {
    return {
      production_labor_cost_hub: MO_PRODUTIVA_MENSAL,
      admin_salary_total: 0, admin_fgts_total: 0, admin_other_costs: 0,
      fixed_expense_monthly: fixedMonthly,
      variable_expense_percent: VARIAVEL_PCT,
      financial_expense_percent: FINANCEIRA_PCT,
      financial_commitments_percent: compromissoPct,
    }
  }

  function preco(fixedMonthly: number, compromissoPct: number) {
    return computeServiceSellingPrice({
      materialCost: MATERIAL,
      commissionPercent: 0,
      profitPercent: LUCRO,
      taxableRegimePercent: TAX,
      expenseConfig: cfg(fixedMonthly, compromissoPct),
      taxPreview: null,
      currentUser: { unitMeasure: 'HOURS', monthlyWorkloadInMinutes: 80, numProductiveSectorEmployee: 1 },
      serviceWorkloadMinutes: MINUTOS,
    })
  }

  /** O CMV que o motor forma, reconstruído aqui: material + minutos × custo por minuto. */
  function cmvDe(fixedMonthly: number) {
    const porMinuto = (MO_PRODUTIVA_MENSAL + fixedMonthly) / WORKLOAD_MIN
    return Math.round((MATERIAL + Math.round(MINUTOS * porMinuto * 100) / 100) * 100) / 100
  }

  const ANTES = preco(MEDIA_FIXA_COM_COMPROMISSO, 0)
  const DEPOIS = preco(MEDIA_FIXA_PURA, COMPROMISSO_PCT)

  it('>>> o preço SOBE, e o esperado sai dos DOIS caminhos independentes <<<', () => {
    const somaDepois = (VARIAVEL_PCT + FINANCEIRA_PCT + COMPROMISSO_PCT + TAX + LUCRO) / 100
    const cmvDepois = cmvDe(MEDIA_FIXA_PURA)

    const fechada = precoFormaFechada(cmvDepois, somaDepois)
    const pontoFixo = precoPontoFixo(cmvDepois, somaDepois)
    // Os dois caminhos concordam entre si ANTES de encostarem no motor. Sem este passo, um erro
    // meu na forma fechada passaria por confirmação do motor.
    expect(fechada).toBe(pontoFixo)
    expect(DEPOIS.sellingPrice).toBe(fechada)

    // E o ANTES, pelo mesmo par de caminhos, com a soma e o CMV daquele estado.
    const somaAntes = (VARIAVEL_PCT + FINANCEIRA_PCT + TAX + LUCRO) / 100
    const cmvAntes = cmvDe(MEDIA_FIXA_COM_COMPROMISSO)
    expect(precoFormaFechada(cmvAntes, somaAntes)).toBe(precoPontoFixo(cmvAntes, somaAntes))
    expect(ANTES.sellingPrice).toBe(precoFormaFechada(cmvAntes, somaAntes))

    // O EFEITO: o preço muda, e muda para CIMA. Os números medidos deste cenário.
    expect(ANTES.sellingPrice).toBeCloseTo(162.49, 2)
    expect(DEPOIS.sellingPrice).toBeCloseTo(492.73, 2)
    expect(DEPOIS.sellingPrice).toBeGreaterThan(ANTES.sellingPrice)
  })

  it('o CMV CAI (o compromisso saiu do custo por minuto) e o divisor APERTA', () => {
    // As duas metades, cada uma com o seu número. Se só uma acontecesse, um destes dois
    // ficaria vermelho — são as mutações S1 e S2.
    expect(DEPOIS.totalCost).toBeLessThan(ANTES.totalCost)
    /*
      >>> O ARREDONDAMENTO DUPLO, e ele custou um centavo <<<

      Escrevi `round2(minutos × Δ_mensal ÷ carga)` e saiu 17,12 contra os 17,11 do motor. O
      motor arredonda a MO de CADA estado a 2 casas e a diferença é entre os dois arredondados;
      arredondar a diferença é outra conta. Um centavo, e é exatamente o tipo de divergência que
      um `toBeCloseTo(…, 1)` esconderia em vez de explicar.

      A asserção passa a ser a MESMA conta do motor, estado por estado.
    */
    const moDe = (fixedMonthly: number) =>
      Math.round(MINUTOS * ((MO_PRODUTIVA_MENSAL + fixedMonthly) / WORKLOAD_MIN) * 100) / 100
    expect(ANTES.totalCost - DEPOIS.totalCost)
      .toBeCloseTo(moDe(MEDIA_FIXA_COM_COMPROMISSO) - moDe(MEDIA_FIXA_PURA), 2)
    expect(moDe(MEDIA_FIXA_COM_COMPROMISSO) - moDe(MEDIA_FIXA_PURA)).toBeCloseTo(17.11, 2)
    expect(DEPOIS.expenseSnapshot.compromissos_pct).toBe(COMPROMISSO_PCT)
    expect(ANTES.expenseSnapshot.compromissos_pct).toBe(0)
  })

  it('>>> §4 — com COMPROMISSO ZERO o preço NÃO muda, ao centavo <<<', () => {
    /*
      É o caso dos 3 serviços do tenant 14363adf, medido no banco: nenhum lançamento das sete
      categorias do bloco, em mês nenhum. Com zero, `mediaMensalDaDespesaFixa` devolve a fixa
      inteira (porque não havia nada a tirar) e o denominador não ganha termo.

      Sem este caso, uma implementação que mexesse no preço de TODO serviço passaria verde.
    */
    const semCompromisso = preco(MEDIA_FIXA_PURA, 0)
    const comoAntes = preco(MEDIA_FIXA_PURA, 0)
    expect(semCompromisso.sellingPrice).toBe(comoAntes.sellingPrice)
    // E o par: o MESMO custo por minuto com e sem o termo zero.
    expect(semCompromisso.totalCost).toBe(DEPOIS.totalCost)
    expect(semCompromisso.sellingPrice).toBeLessThan(DEPOIS.sellingPrice)
  })

  it('>>> MC ≤ 0 — a R7 aborta, e isto é o que a medição do §2 encontrou <<<', () => {
    /*
      MEDIDO, e é a parte do §2 que a implementação não podia prever: com 19,34% entrando no
      divisor, 4 dos 6 serviços deste tenant passam de 100% de soma e o motor RECUSA formar
      preço — R7 de `cascata-lucro-real.md`: "Se MC ≤ 0, abortar com erro de parametrização.
      Nunca produzir preço negativo nem cair em default silencioso."

      O caso está aqui porque o comportamento é CORRETO e tem de permanecer: um preço negativo
      ou um zero silencioso seriam muito piores. Quem mexer no motor precisa de um caso vermelho
      se trocar a recusa por um default.
    */
    const lucroAlto = calculatePricing({
      calcType: 'SERVICO',
      totalItemsCost: MATERIAL, yieldQuantity: 1,
      laborCostMonthly: MO_PRODUTIVA_MENSAL + MEDIA_FIXA_PURA,
      numProductiveEmployees: 1, monthlyWorkloadMinutes: WORKLOAD_MIN,
      productWorkloadMinutes: 30,
      structurePct: (VARIAVEL_PCT + FINANCEIRA_PCT + COMPROMISSO_PCT) / 100,
      taxPct: 0.021, commissionPct: 0, profitPct: 0.68841,
    })
    // 18,18 + 2,20 + 19,34 + 2,10 + 68,841 = 110,661% → coeficiente negativo.
    expect(lucroAlto.isValid).toBe(false)
    expect(lucroAlto.priceUnit).toBe(0)

    // E o PAR: sem o compromisso o MESMO serviço tinha preço. É a prova de que o abort é do
    // ADENDO 3 e não de parametrização pré-existente.
    const semCompromisso = calculatePricing({
      calcType: 'SERVICO',
      totalItemsCost: MATERIAL, yieldQuantity: 1,
      laborCostMonthly: MO_PRODUTIVA_MENSAL + MEDIA_FIXA_COM_COMPROMISSO,
      numProductiveEmployees: 1, monthlyWorkloadMinutes: WORKLOAD_MIN,
      productWorkloadMinutes: 30,
      structurePct: (VARIAVEL_PCT + FINANCEIRA_PCT) / 100,
      taxPct: 0.021, commissionPct: 0, profitPct: 0.68841,
    })
    expect(semCompromisso.isValid).toBe(true)
    expect(semCompromisso.priceUnit).toBeGreaterThan(0)
  })
})

describe('4. O DIVISOR do motor — a mutação que sobreviveu, e o caso que a mata', () => {
  /*
    >>> ESTE BLOCO EXISTE PORQUE UMA MUTAÇÃO SOBREVIVEU A 3.583 CASOS <<<

    A mutação (S4b) do §4 — somar o compromisso DUAS VEZES no divisor fora do serviço — ficou
    VERDE na suíte inteira. O critério do divisor era uma constante local em
    `products/content.component.tsx`, e nenhum caso afirmava o número que ela produz: o preço do
    motor é afirmado por outras vias, e nenhuma delas distinguia 24,52% de 29,03%.

    É `portao-que-nao-alcanca.md` no nível do caso — o instrumento não chegava no arquivo. O
    remédio foi o de `teste-que-nao-exercita.md`: exportar a função. Os casos abaixo afirmam o
    NÚMERO do divisor, e é isso que torna a S4b detectável.
  */
  const FIXA = 20.26
  const INDIRETA = 7.00

  const args = (seg: 'SERVICO' | 'INDUSTRIALIZACAO' | 'REVENDA') => ({
    segmentoDaDespesa: seg,
    fixaPct: FIXA,
    variavelPct: VARIAVEL_PCT,
    financeiraPct: FINANCEIRA_PCT,
    compromissoPct: COMPROMISSO_PCT,
    indiretaAgrupadaPct: INDIRETA,
  })

  it('>>> fora do serviço o compromisso entra UMA vez — e o par nomeia a dupla <<<', () => {
    const umaVez = divisorDaEstruturaPct(args('INDUSTRIALIZACAO'))
    expect(umaVez).toBeCloseTo(FIXA + VARIAVEL_PCT + FINANCEIRA_PCT + COMPROMISSO_PCT + INDIRETA, 10)
    // O número por extenso — 20,26 + 18,18 + 2,20 + 19,34 + 7,00. A primeira versão deste caso
    // escreveu 64,78 porque eu esqueci a financeira na soma à mão; o caso ficou vermelho e o
    // número é 66,98. Fica registrado porque é o par que nomeia a mutação: a S4b levaria este
    // divisor a 86,32%, e um divisor de 86% ainda PRODUZ preço — só produz o preço errado.
    expect(umaVez).toBeCloseTo(66.98, 2)
    expect(umaVez).not.toBeCloseTo(66.98 + COMPROMISSO_PCT, 2)
  })

  it('>>> e é BIT-EXACT ao `structurePct` do `calcBase` + a indireta — a trava do §0 <<<', () => {
    // `build-calc-base.ts` soma `fixed + variable + financial + compromissos`, nessa ordem.
    // A função repete a ordem de propósito: trocá-la mudaria o último bit do divisor.
    const comoOCalcBase = (FIXA + VARIAVEL_PCT + FINANCEIRA_PCT + COMPROMISSO_PCT) + INDIRETA
    expect(divisorDaEstruturaPct(args('INDUSTRIALIZACAO'))).toBe(comoOCalcBase)
    expect(divisorDaEstruturaPct(args('REVENDA'))).toBe(comoOCalcBase)
  })

  it('no SERVIÇO são só os TRÊS — a fixa e a MO ficam no numerador', () => {
    const svc = divisorDaEstruturaPct(args('SERVICO'))
    expect(svc).toBeCloseTo(VARIAVEL_PCT + FINANCEIRA_PCT + COMPROMISSO_PCT, 10)
    expect(svc).toBeCloseTo(39.72, 2)
    // Os dois estados errados, cada um com o seu número:
    expect(svc).not.toBeCloseTo(39.72 - COMPROMISSO_PCT, 2)   // S2 — o compromisso perdido
    expect(svc).not.toBeCloseTo(39.72 + FIXA, 2)              // S3 — a fixa indo junto
    expect(svc).not.toBeCloseTo(39.72 + INDIRETA, 2)          // a MO indo junto
  })

  it('a função IGNORA a indireta no serviço, e não é por ela ser zero no fixture', () => {
    // O fixture usa INDIRETA = 7,00 de propósito: com zero, "ignora" e "soma" dariam o mesmo
    // número e o caso não distinguiria nada (`teste-que-nao-exercita.md`, variante 2).
    expect(INDIRETA).toBeGreaterThan(0)
    expect(divisorDaEstruturaPct(args('SERVICO')))
      .toBe(divisorDaEstruturaPct({ ...args('SERVICO'), indiretaAgrupadaPct: 0 }))
    // E fora do serviço ela NÃO é ignorada — o par.
    expect(divisorDaEstruturaPct(args('INDUSTRIALIZACAO')))
      .not.toBe(divisorDaEstruturaPct({ ...args('INDUSTRIALIZACAO'), indiretaAgrupadaPct: 0 }))
  })

  it('a FIXA é ignorada no serviço, e não é por ela ser zero', () => {
    expect(FIXA).toBeGreaterThan(0)
    expect(divisorDaEstruturaPct(args('SERVICO')))
      .toBe(divisorDaEstruturaPct({ ...args('SERVICO'), fixaPct: 0 }))
    expect(divisorDaEstruturaPct(args('REVENDA')))
      .not.toBe(divisorDaEstruturaPct({ ...args('REVENDA'), fixaPct: 0 }))
  })

  it('o divisor e a decomposição concordam no SERVIÇO — construção e leitura, uma matriz', () => {
    /*
      `regime-e-segmento-determinam-a-construcao.md`: a decomposição LÊ o que a construção usou.
      Se `divisorDaEstruturaPct` e `resolveDespesasOperacionaisPct` divergissem no serviço, os
      dois lados fechariam entre si e a diferença não apareceria em lugar nenhum.
    */
    const baldes: BaldesDeDespesa = {
      fixa: FIXA / 100, variavel: VARIAVEL_PCT / 100, financeira: FINANCEIRA_PCT / 100,
      compromisso: COMPROMISSO_PCT / 100, indireta: INDIRETA / 100, moProdutiva: 0,
    }
    expect(divisorDaEstruturaPct(args('SERVICO')) / 100)
      .toBeCloseTo(resolveDespesasOperacionaisPct('SERVICO', baldes), 12)
    expect(divisorDaEstruturaPct(args('INDUSTRIALIZACAO')) / 100)
      .toBeCloseTo(resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', baldes), 12)
  })
})
