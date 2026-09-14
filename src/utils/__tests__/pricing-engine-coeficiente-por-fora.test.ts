/**
 * Regressão do divisor da margem de contribuição ao introduzir o coeficiente
 * da operação por fora (`externalOpsCoefficient`, o `c` da R3/R5 em
 * `.claude/rules/cascata-lucro-real.md`).
 *
 * O que este arquivo prova, e por que cada bloco existe:
 *
 *  1. ORÁCULO INDEPENDENTE — o preço do motor tem de bater com a fórmula ANTIGA,
 *     recalculada aqui sem usar o motor. É o bloco que falsifica de verdade: se
 *     alguém quebrar a conversão `% Original ÷ (1 − c)`, o motor diverge desta
 *     conta e o teste fica vermelho. Sem ele, os blocos 2 e 3 comparariam o
 *     motor com ele mesmo — `teste-que-nao-exercita.md`.
 *
 *  2. DEFAULT NEUTRO — passar `c = 0` explicitamente é idêntico a omitir o campo.
 *
 *  3. O CAMPO NÃO É INERTE, E CONVERTE AS CINCO — com `c > 0` o preço tem de
 *     bater com o valor exato do oráculo. Verificado por mutação: trocar
 *     `structurePct / k` por `structurePct` passa despercebido com `c = 0` e é
 *     pego aqui (`construtor-empobrecido.md`).
 *
 *  4. VALORES EM R$ — saem das efetivadas (R8) e o DRE fecha em P (teste 2 da
 *     regra). Pega a mutação "valor volta a usar a % original".
 *
 *  5. GUARDA DE INTERVALO — `c` fora de [0, 1) invalida em vez de devolver
 *     número (`ausente-vs-falso.md`).
 *
 * Estado de produção em 15/09/2026: `c = 0` em 100% da base — `cbs_active` e
 * `ibs_active` são false em 109 de 109 cálculos.
 */
import { calculatePricing, PricingInput } from '../pricing-engine'

const round2 = (v: number): number => Math.round(v * 100) / 100

/**
 * Preço esperado, recalculado FORA do motor. Com `c = 0` reproduz exatamente a
 * fórmula antiga; com `c > 0` aplica a conversão da R5 em TODAS as cinco
 * categorias. É o oráculo dos blocos 1 e 3.
 */
function precoEsperado(i: PricingInput, c = 0): number {
  const rt = i.rtReservePct ?? 0
  const custoPorMinuto =
    i.monthlyWorkloadMinutes > 0 ? i.laborCostMonthly / i.monthlyWorkloadMinutes : 0
  const moProdutiva = round2(i.productWorkloadMinutes * custoPorMinuto)
  const custoItensUnit = round2(i.totalItemsCost / i.yieldQuantity)
  const cmvUnit =
    i.calcType === 'REVENDA' ? custoItensUnit : round2(custoItensUnit + moProdutiva)
  const k = 1 - c
  // % Efetivada = % Original ÷ (1 − c), nas CINCO categorias. Esquecer uma é
  // invisível com c = 0 — por isso o bloco 3 roda com c > 0.
  const somaEfetivada =
    i.structurePct / k + i.taxPct / k + rt / k + i.commissionPct / k + i.profitPct / k
  return round2(cmvUnit / (1 - somaEfetivada))
}

const INDUSTRIA: PricingInput = {
  calcType: 'INDUSTRIALIZACAO',
  totalItemsCost: 7596.09,
  yieldQuantity: 1,
  laborCostMonthly: 18000,
  numProductiveEmployees: 3,
  monthlyWorkloadMinutes: 26400,
  productWorkloadMinutes: 420,
  structurePct: 0.2215,
  taxPct: 0.1738,
  commissionPct: 0.05,
  profitPct: 0.20,
  rtReservePct: 0.0147,
}

const REVENDA: PricingInput = {
  calcType: 'REVENDA',
  totalItemsCost: 1234.56,
  yieldQuantity: 4,
  laborCostMonthly: 9000,
  numProductiveEmployees: 2,
  monthlyWorkloadMinutes: 17600,
  productWorkloadMinutes: 90,
  structurePct: 0.3102,
  taxPct: 0.0925,
  commissionPct: 0.03,
  profitPct: 0.12,
}

const SERVICO: PricingInput = {
  calcType: 'SERVICO',
  totalItemsCost: 0,
  yieldQuantity: 1,
  laborCostMonthly: 24000,
  numProductiveEmployees: 4,
  monthlyWorkloadMinutes: 35200,
  productWorkloadMinutes: 600,
  structurePct: 0.1875,
  taxPct: 0.0500,
  commissionPct: 0.08,
  profitPct: 0.25,
  rtReservePct: 0.02,
}

const CASOS: ReadonlyArray<readonly [string, PricingInput]> = [
  ['industrialização com MO produtiva e RT', INDUSTRIA],
  ['revenda com rendimento 4', REVENDA],
  ['serviço sem itens, só mão de obra', SERVICO],
]

describe('externalOpsCoefficient — o divisor da MC aceita o coeficiente da operação por fora', () => {
  describe('1. com c = 0 o motor bate com a fórmula antiga, recalculada fora dele', () => {
    it.each(CASOS)('%s', (_nome, entrada) => {
      const r = calculatePricing({ ...entrada, externalOpsCoefficient: 0 })
      expect(r.isValid).toBe(true)
      expect(r.priceUnit).toBe(precoEsperado(entrada, 0))
    })
  })

  describe('2. c = 0 explícito é idêntico a omitir o campo', () => {
    it.each(CASOS)('%s', (_nome, entrada) => {
      const semCampo = calculatePricing(entrada)
      const comZero = calculatePricing({ ...entrada, externalOpsCoefficient: 0 })
      expect(comZero).toEqual(semCampo)
    })
  })

  describe('3. com c > 0 a conversão vale para as CINCO categorias', () => {
    const C = 0.0671
    it.each(CASOS)('%s', (_nome, entrada) => {
      const base = calculatePricing({ ...entrada, externalOpsCoefficient: 0 })
      const comC = calculatePricing({ ...entrada, externalOpsCoefficient: C })
      expect(comC.isValid).toBe(true)
      // Valor exato, não só "mudou": esquecer UMA das cinco conversões cai aqui.
      expect(comC.priceUnit).toBe(precoEsperado(entrada, C))
      // % Efetivada = % Original ÷ (1 − c): a soma cresce, o divisor encolhe.
      expect(comC.priceUnit).toBeGreaterThan(base.priceUnit)
      expect(comC.coefficient).toBeLessThan(base.coefficient)
    })
  })

  describe('4. os valores em R$ saem das EFETIVADAS, e o DRE fecha em P', () => {
    const C = 0.0671
    it.each(CASOS)('%s', (_nome, entrada) => {
      const r = calculatePricing({ ...entrada, externalOpsCoefficient: C })
      const k = 1 - C
      const rt = entrada.rtReservePct ?? 0
      // R8: valor = P × alíquota EFETIVADA. Usar a original aqui passa
      // despercebido com c = 0 e é pego neste bloco.
      expect(r.profitValue).toBe(round2(r.priceUnit * (entrada.profitPct / k)))
      expect(r.commissionValue).toBe(round2(r.priceUnit * (entrada.commissionPct / k)))
      expect(r.structureValue).toBe(round2(r.priceUnit * (entrada.structurePct / k)))
      expect(r.taxValue).toBe(round2(r.priceUnit * (entrada.taxPct / k)))
      expect(r.rtReserveValue).toBe(round2(r.priceUnit * (rt / k)))
      // Teste 2 da regra: Σ linhas da operação interna + custo = P.
      const soma =
        r.cmvUnit +
        r.structureValue +
        r.taxValue +
        r.rtReserveValue +
        r.commissionValue +
        r.profitValue
      expect(Math.abs(soma - r.priceUnit)).toBeLessThan(0.05)
    })
  })

  it('5. c fora de [0, 1) invalida em vez de devolver número', () => {
    for (const c of [-0.01, 1, 1.5]) {
      const r = calculatePricing({ ...INDUSTRIA, externalOpsCoefficient: c })
      expect(r.isValid).toBe(false)
      expect(r.priceUnit).toBe(0)
    }
  })
})
