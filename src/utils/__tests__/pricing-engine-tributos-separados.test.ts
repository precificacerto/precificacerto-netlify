/**
 * O motor recebendo os tributos SEPARADOS (R5 de `.claude/rules/cascata-lucro-real.md`).
 *
 * O que cada bloco prova:
 *   1. REGRESSÃO — sem `taxBreakdown`, o preço é o de hoje, conferido contra a
 *      fórmula antiga recalculada FORA do motor.
 *   2. EQUIVALÊNCIA E SEU LIMITE — com `taxBreakdown` os dois caminhos coincidem
 *      só quando a exceção do PIS/COFINS não muda nada. Onde ela muda, os
 *      caminhos DIVERGEM de propósito, e o bloco mede a diferença.
 *   3. O `c` LIGADO — oráculo semântico: cada valor em R$ sobre o TOTAL GERAL
 *      devolve o % Original cadastrado. Não é a fórmula reescrita, é a
 *      propriedade que a decomposição tem de ter.
 *   4. EXCEÇÃO PIS/COFINS · 5. EXCEÇÃO ISS · 6. DIVERGÊNCIA · 7. INEXISTENTE vs ZERO
 *
 * Verificado por mutação: PIS/COFINS pela conversão padrão, ISS com gross-up,
 * `taxBreakdown` ignorado e divergência em silêncio deixam casos vermelhos.
 */
import { calculatePricing, type PricingInput } from '../pricing-engine'

const TOL = 1e-9
const round2 = (v: number): number => Math.round(v * 100) / 100

/** Preço pela fórmula do caminho antigo, recalculado fora do motor. */
function precoLegado(i: PricingInput, c = 0): number {
  const rt = i.rtReservePct ?? 0
  const custoPorMinuto =
    i.monthlyWorkloadMinutes > 0 ? i.laborCostMonthly / i.monthlyWorkloadMinutes : 0
  const moProdutiva = round2(i.productWorkloadMinutes * custoPorMinuto)
  const custoItensUnit = round2(i.totalItemsCost / i.yieldQuantity)
  const cmvUnit =
    i.calcType === 'REVENDA' ? custoItensUnit : round2(custoItensUnit + moProdutiva)
  const k = 1 - c
  const soma =
    i.structurePct / k + i.taxPct / k + rt / k + i.commissionPct / k + i.profitPct / k
  return round2(cmvUnit / (1 - soma))
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
  taxPct: 0.17,
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
  taxPct: 0.05,
  commissionPct: 0.08,
  profitPct: 0.25,
  rtReservePct: 0.02,
}

const CASOS = [
  ['industrialização', INDUSTRIA],
  ['revenda', REVENDA],
  ['serviço', SERVICO],
] as const

describe('motor com tributos separados', () => {
  describe('1. regressão: sem taxBreakdown o preço é o de hoje', () => {
    it.each(CASOS)('%s', (_n, entrada) => {
      const r = calculatePricing(entrada)
      expect(r.isValid).toBe(true)
      expect(r.priceUnit).toBe(precoLegado(entrada))
      expect(r.taxBreakdownResolved).toBeUndefined()
    })
  })

  describe('2. equivalência com o caminho antigo, e onde ela deixa de valer', () => {
    it('sem PIS/COFINS, os dois caminhos dão o MESMO preço', () => {
      const antigo = calculatePricing({ ...INDUSTRIA, taxPct: 0.17 })
      const novo = calculatePricing({
        ...INDUSTRIA,
        taxPct: 0.17,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0 },
      })
      expect(novo.isValid).toBe(true)
      expect(novo.priceUnit).toBe(antigo.priceUnit)
      expect(novo.taxBreakdownResolved?.externalOpsCoefficient).toBe(0)
    })

    it('sem ICMS nem ISS, os dois caminhos dão o MESMO preço', () => {
      const antigo = calculatePricing({ ...INDUSTRIA, taxPct: 0.0925 })
      const novo = calculatePricing({
        ...INDUSTRIA,
        taxPct: 0.0925,
        taxBreakdown: { icmsPct: 0, pisCofinsPct: 0.0925 },
      })
      expect(novo.priceUnit).toBe(antigo.priceUnit)
    })

    it('com ICMS E PIS/COFINS os caminhos DIVERGEM — e a diferença é a exceção da R5', () => {
      const agregado = 0.17 + 0.0925
      const antigo = calculatePricing({ ...INDUSTRIA, taxPct: agregado })
      const novo = calculatePricing({
        ...INDUSTRIA,
        taxPct: agregado,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0.0925 },
      })
      expect(novo.isValid).toBe(true)
      // A exceção derruba a efetiva do PIS/COFINS de 9,25% para 9,25% × 0,83.
      expect(novo.taxBreakdownResolved?.pisCofinsPctEffective).toBeCloseTo(0.0925 * 0.83, 12)
      // Carga tributária menor ⇒ divisor maior ⇒ preço MENOR que o do caminho antigo.
      expect(novo.priceUnit).toBeLessThan(antigo.priceUnit)
    })
  })

  describe('3. o c ligado: a decomposição devolve os % Originais', () => {
    const C_ESPERADO = 0.07408014571948997
    const entrada: PricingInput = {
      ...INDUSTRIA,
      taxPct: 0.17,
      taxBreakdown: {
        icmsPct: 0.17,
        pisCofinsPct: 0,
        ibs: { rate: 0.01, baseCode: 4 },
        cbs: { rate: 0.088, baseCode: 4 },
      },
    }

    it('resolve o c pela R3', () => {
      const r = calculatePricing(entrada)
      expect(r.isValid).toBe(true)
      expect(Math.abs(r.taxBreakdownResolved!.externalOpsCoefficient - C_ESPERADO)).toBeLessThan(TOL)
    })

    it('cada categoria sobre o TOTAL GERAL devolve o % Original cadastrado', () => {
      const r = calculatePricing(entrada)
      const T = r.taxBreakdownResolved!.totalGeral
      expect(Math.abs(r.structureValue / T - entrada.structurePct)).toBeLessThan(1e-4)
      expect(Math.abs(r.commissionValue / T - entrada.commissionPct)).toBeLessThan(1e-4)
      expect(Math.abs(r.profitValue / T - entrada.profitPct)).toBeLessThan(1e-4)
      expect(Math.abs(r.rtReserveValue / T - (entrada.rtReservePct ?? 0))).toBeLessThan(1e-4)
      expect(Math.abs(r.taxBreakdownResolved!.icmsValue / T - 0.17)).toBeLessThan(1e-4)
    })

    it('o total geral é P ÷ (1 − c), e os tributos por fora somam c × total', () => {
      const r = calculatePricing(entrada)
      const res = r.taxBreakdownResolved!
      expect(Math.abs(res.totalGeral - r.priceUnit / (1 - res.externalOpsCoefficient))).toBeLessThan(0.01)
      expect(Math.abs(res.externalValue - res.totalGeral * res.externalOpsCoefficient)).toBeLessThan(0.01)
    })

    it('com c > 0 o preço sobe em relação ao mesmo caso sem tributo por fora', () => {
      const semFora = calculatePricing({
        ...INDUSTRIA, taxPct: 0.17, taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0 },
      })
      const comFora = calculatePricing(entrada)
      expect(comFora.priceUnit).toBeGreaterThan(semFora.priceUnit)
    })
  })

  describe('4. exceção do PIS/COFINS', () => {
    const entrada: PricingInput = {
      ...INDUSTRIA,
      taxPct: 0.17 + 0.0925,
      taxBreakdown: {
        icmsPct: 0.17,
        pisCofinsPct: 0.0925,
        ibs: { rate: 0.01, baseCode: 4 },
        cbs: { rate: 0.088, baseCode: 4 },
      },
    }

    it('efetiva = nominal × (1 − ICMS efetivada − ISS efetivada), NÃO nominal ÷ (1 − c)', () => {
      const res = calculatePricing(entrada).taxBreakdownResolved!
      const esperado = 0.0925 * (1 - res.icmsPctEffective - res.issPctEffective)
      expect(Math.abs(res.pisCofinsPctEffective - esperado)).toBeLessThan(TOL)

      const conversaoPadrao = 0.0925 / (1 - res.externalOpsCoefficient)
      expect(Math.abs(res.pisCofinsPctEffective - conversaoPadrao)).toBeGreaterThan(1e-4)
    })

    it('em R$: PIS/COFINS = nominal × (P − ICMS − ISS)', () => {
      const r = calculatePricing(entrada)
      const res = r.taxBreakdownResolved!
      const base = r.priceUnit - res.icmsValue - res.issValue
      expect(Math.abs(res.pisCofinsValue - 0.0925 * base)).toBeLessThan(0.02)
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * 17/09/2026 — ESTE BLOCO AFIRMAVA O DEFEITO, E FOI REESCRITO
   * ═══════════════════════════════════════════════════════════════════════════════════════
   *
   * Ele se chamava `5. exceção do ISS no serviço` e travava duas condutas:
   *
   *   'a efetiva do ISS é igual à original — sem gross-up'
   *       expect(res.issPctEffective).toBe(0.05)
   *       expect(res.issPctEffective).toBeLessThan(0.05 / (1 - c))   ← proibia o gross-up
   *
   *   'em R$: ISS = alíquota × P, não × total geral'
   *       expect(|issValue − 0.05 × priceUnit|).toBeLessThan(0.01)
   *       expect(|issValue − 0.05 × totalGeral|).toBeGreaterThan(0.5)
   *
   * POR QUE MUDOU — decisão do dono do produto, registrada como está:
   *
   *   "ICMS e ISS têm TRATAMENTO IDÊNTICO. Os dois são por dentro, incidem sobre o valor da
   *    operação, e saem primeiro."
   *
   * A "exceção" não era exceção: era o defeito com status de regra, e a R5 de
   * `.claude/rules/cascata-lucro-real.md` o repetia. Medido com 5% e o mesmo custo, o ICMS
   * dava R$ 126,52 com base no total geral e o ISS R$ 115,99 com base em P.
   *
   * Os dois casos abaixo são a INVERSÃO dos de cima, e é isso que os torna o teste da
   * correção: eles ficam vermelhos no código de ontem, palavra por palavra.
   */
  describe('5. ISS e ICMS têm a MESMA conversão — a "exceção" saiu', () => {
    const entrada: PricingInput = {
      ...SERVICO,
      taxPct: 0.05,
      taxBreakdown: {
        issPct: 0.05,
        pisCofinsPct: 0,
        ibs: { rate: 0.01, baseCode: 4 },
        cbs: { rate: 0.088, baseCode: 4 },
      },
    }

    it('>>> a efetiva do ISS SOFRE o gross-up — `original ÷ (1 − c)` <<<', () => {
      const res = calculatePricing(entrada).taxBreakdownResolved!
      expect(res.externalOpsCoefficient).toBeGreaterThan(0)
      expect(res.issPctEffective).toBeCloseTo(0.05 / (1 - res.externalOpsCoefficient), 10)
      // O DISCRIMINANTE contra o código de ontem, que devolvia exatamente 0,05:
      expect(res.issPctEffective).toBeGreaterThan(0.05)
    })

    it('>>> em R$: ISS = alíquota × TOTAL GERAL, não × P <<<', () => {
      const r = calculatePricing(entrada)
      const res = r.taxBreakdownResolved!
      expect(Math.abs(res.issValue - 0.05 * res.totalGeral)).toBeLessThan(0.01)
      // E o par invertido: agora é o × P que tem de DIVERGIR.
      expect(Math.abs(res.issValue - 0.05 * r.priceUnit)).toBeGreaterThan(0.5)
    })

    it('>>> e é a MESMA conta do ICMS — mesma alíquota, mesmo custo, mesmo valor <<<', () => {
      // O caso que nenhum dos dois de ontem tinha, e que é o ponto da decisão: com a mesma
      // alíquota, trocar ICMS por ISS não pode mudar número nenhum.
      //
      // A MO PRODUTIVA É ZERADA NOS DOIS LADOS DE PROPÓSITO. Sem isso o caso compara duas
      // coisas ao mesmo tempo: `cmvUnit` soma a MO em SERVIÇO e NÃO soma em REVENDA, então
      // os preços divergiriam por R$ 62,42 sem tributo nenhum ter mudado. Foi o que a
      // primeira versão deste caso mediu, e ela teria acusado o motor pelo motivo errado.
      const semMO = { ...entrada, productWorkloadMinutes: 0, laborCostMonthly: 0, totalItemsCost: 2000 }
      const comIss = calculatePricing(semMO)
      const comIcms = calculatePricing({
        ...semMO,
        calcType: 'REVENDA',
        taxBreakdown: { ...entrada.taxBreakdown!, issPct: undefined, icmsPct: 0.05 },
      })
      const a = comIss.taxBreakdownResolved!
      const b = comIcms.taxBreakdownResolved!
      expect(a.issPctEffective).toBeCloseTo(b.icmsPctEffective, 10)
      expect(a.issValue).toBeCloseTo(b.icmsValue, 2)
      expect(a.totalGeral).toBeCloseTo(b.totalGeral, 2)
    })
  })

  describe('6. divergência entre taxPct e taxBreakdown', () => {
    it('invalida em vez de escolher em silêncio', () => {
      const r = calculatePricing({
        ...INDUSTRIA,
        taxPct: 0.30,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0.0925 },
      })
      expect(r.isValid).toBe(false)
      expect(r.priceUnit).toBe(0)
      expect(r.validationErrors.join(' ')).toContain('diverge da soma dos tributos por dentro')
    })

    it('coerente não invalida', () => {
      const r = calculatePricing({
        ...INDUSTRIA,
        taxPct: 0.17 + 0.0925,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0.0925 },
      })
      expect(r.isValid).toBe(true)
    })

    it('taxBreakdown junto com externalOpsCoefficient é ambiguidade, não redundância', () => {
      const r = calculatePricing({
        ...INDUSTRIA,
        taxPct: 0.17,
        externalOpsCoefficient: 0.05,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0 },
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('Passe um ou outro')
    })
  })

  describe('7. INEXISTENTE não é zero', () => {
    it('ICMS undefined no SERVIÇO é o correto — não invalida', () => {
      const r = calculatePricing({
        ...SERVICO, taxPct: 0.05, taxBreakdown: { issPct: 0.05, pisCofinsPct: 0 },
      })
      expect(r.isValid).toBe(true)
    })

    it('ICMS 0 no SERVIÇO invalida, e a mensagem diz que veio alíquota declarada', () => {
      const r = calculatePricing({
        ...SERVICO, taxPct: 0.05, taxBreakdown: { icmsPct: 0, issPct: 0.05, pisCofinsPct: 0 },
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('icmsPct veio como 0 (alíquota declarada) em SERVICO')
    })

    it('ICMS undefined na INDÚSTRIA invalida, e a mensagem diz INEXISTENTE — texto distinto', () => {
      const r = calculatePricing({
        ...INDUSTRIA, taxPct: 0, taxBreakdown: { pisCofinsPct: 0 },
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('icmsPct veio INEXISTENTE (undefined) em INDUSTRIALIZACAO')
    })

    it('as duas mensagens do ICMS são diferentes entre si', () => {
      const zero = calculatePricing({
        ...SERVICO, taxPct: 0.05, taxBreakdown: { icmsPct: 0, issPct: 0.05, pisCofinsPct: 0 },
      }).validationErrors.join(' ')
      const inexistente = calculatePricing({
        ...INDUSTRIA, taxPct: 0, taxBreakdown: { pisCofinsPct: 0 },
      }).validationErrors.join(' ')
      expect(zero).not.toEqual(inexistente)
      expect(zero).toContain('alíquota declarada')
      expect(inexistente).toContain('INEXISTENTE (undefined)')
    })

    it('ISS declarado na INDÚSTRIA invalida', () => {
      const r = calculatePricing({
        ...INDUSTRIA, taxPct: 0.17, taxBreakdown: { icmsPct: 0.17, issPct: 0, pisCofinsPct: 0 },
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('issPct veio como 0')
    })

    it('IPI fora da industrialização invalida', () => {
      const r = calculatePricing({
        ...REVENDA, taxPct: 0.0925,
        taxBreakdown: { icmsPct: 0, pisCofinsPct: 0.0925, ipi: { rate: 0.05, baseCode: 1 } },
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('ipi declarado em REVENDA')
    })
  })
})
