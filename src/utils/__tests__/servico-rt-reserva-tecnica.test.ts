/**
 * EPIC-RT — RT (Comissão Reserva Técnica) no cadastro de SERVIÇOS.
 *
 * Paridade com Produtos: o RT é uma dedução gerencial paralela a comissão e lucro,
 * aplicável em QUALQUER regime (sem condicional de segmentação na tela).
 *
 * Este teste trava as três garantias da ligação Serviços → motor de precificação:
 *  1. RT = 0% é NEUTRO — o preço é bit-exact ao comportamento anterior à feature.
 *  2. O RT entra no DENOMINADOR (coeficiente por dentro), não é acréscimo por fora.
 *  3. A regra vale em QUALQUER alíquota de regime (MEI, SN, RET, Híbrido, LP, LR).
 *
 * Fonte da verdade: `calculatePricing` (src/utils/pricing-engine.ts), chamada pelo
 * useMemo de `src/page-parts/services/content.component.tsx` com
 * `rtReservePct: rtReservePercent / 100`.
 */

import { calculatePricing } from '../pricing-engine'

/** Entrada equivalente à do cadastro de Serviços (calcType SERVICO). */
function priceService(opts: {
  taxPct: number
  /** Omitido = comportamento anterior à feature (campo inexistente na tela). */
  rtReservePercent?: number
}) {
  return calculatePricing({
    calcType: 'SERVICO',
    totalItemsCost: 100,
    yieldQuantity: 1,
    laborCostMonthly: 17600,
    numProductiveEmployees: 1,
    monthlyWorkloadMinutes: 10560, // 176h × 60
    productWorkloadMinutes: 60,
    structurePct: 0.05, // despesas variáveis (3%) + financeiras (2%)
    taxPct: opts.taxPct,
    commissionPct: 0.05,
    profitPct: 0.1,
    ...(opts.rtReservePercent === undefined
      ? {}
      : { rtReservePct: opts.rtReservePercent / 100 }),
  })
}

/**
 * Réplica da composição de `totalPct` da tela de Serviços (ramo genérico:
 * MEI / SN / RET / Simples Híbrido), com o RT somado — como no componente.
 */
function totalPctServico(regimePct: number, rtReservePercent: number) {
  const variablePct = 3
  const financialPct = 2
  const commissionPercent = 5
  const profitPercent = 10
  return variablePct + financialPct + regimePct + rtReservePercent + commissionPercent + profitPercent
}

// Alíquotas de regime representativas (em %), do MEI ao Lucro Real.
const REGIME_RATES = [0, 6, 11.2, 15.5, 19.5, 27.5]

describe('EPIC-RT — RT (Comissão Reserva Técnica) em Serviços', () => {
  it('1) RT = 0% é neutro: preço idêntico ao comportamento anterior, em todo regime', () => {
    REGIME_RATES.forEach((regimePct) => {
      const antes = priceService({ taxPct: regimePct / 100 }) // sem o campo
      const agora = priceService({ taxPct: regimePct / 100, rtReservePercent: 0 })

      expect(agora.priceUnit).toBe(antes.priceUnit)
      expect(agora.coefficient).toBe(antes.coefficient)
      expect(agora.commissionValue).toBe(antes.commissionValue)
      expect(agora.profitValue).toBe(antes.profitValue)
      expect(agora.rtReserveValue).toBe(0)

      // O totalPct exibido na tela também não se move.
      expect(totalPctServico(regimePct, 0)).toBeCloseTo(20 + regimePct, 10)
    })
  })

  it('2) RT entra no denominador: preço = CMV / (1 − Σ%) com o RT dentro do somatório', () => {
    const semRt = priceService({ taxPct: 0.06 })
    const comRt = priceService({ taxPct: 0.06, rtReservePercent: 4 })

    // O coeficiente cai exatamente o valor do RT.
    expect(comRt.coefficient).toBeCloseTo(semRt.coefficient - 0.04, 10)

    const somaPcts = 0.05 /* estrutura */ + 0.06 /* imposto */ + 0.04 /* RT */ + 0.05 /* comissão */ + 0.1 /* lucro */
    const esperado = Math.round((comRt.cmvUnit / (1 - somaPcts)) * 100) / 100
    expect(comRt.priceUnit).toBeCloseTo(esperado, 2)

    // RT compõe totalPct somando ao lado de comissão e lucro.
    expect(totalPctServico(6, 4)).toBeCloseTo(totalPctServico(6, 0) + 4, 10)
  })

  it('3) RT não é acréscimo por fora e rende rtReserveValue = preço × RT%', () => {
    const semRt = priceService({ taxPct: 0.06 })
    const comRt = priceService({ taxPct: 0.06, rtReservePercent: 4 })

    // Hipótese ERRADA (markup por fora): o preço por dentro é estritamente maior.
    expect(comRt.priceUnit).toBeGreaterThan(semRt.priceUnit * 1.04)

    expect(comRt.rtReservePct).toBeCloseTo(0.04, 10)
    expect(comRt.rtReserveValue).toBeCloseTo(comRt.priceUnit * 0.04, 2)
  })

  it('4) Vale em qualquer alíquota de regime: efeito do RT é o mesmo em todos', () => {
    REGIME_RATES.forEach((regimePct) => {
      const semRt = priceService({ taxPct: regimePct / 100 })
      const comRt = priceService({ taxPct: regimePct / 100, rtReservePercent: 4 })

      expect(semRt.isValid).toBe(true)
      expect(comRt.isValid).toBe(true)
      expect(comRt.coefficient).toBeCloseTo(semRt.coefficient - 0.04, 10)
      expect(comRt.priceUnit).toBeGreaterThan(semRt.priceUnit)
      expect(comRt.rtReserveValue).toBeCloseTo(comRt.priceUnit * 0.04, 2)

      // O RT entra no totalPct sem depender do regime.
      expect(totalPctServico(regimePct, 4) - totalPctServico(regimePct, 0)).toBeCloseTo(4, 10)
    })
  })

  it('5) Monotonicidade no RT e rejeição quando a soma de percentuais passa de 100%', () => {
    REGIME_RATES.forEach((regimePct) => {
      const precos = [0, 2, 4, 6].map(
        (rt) => priceService({ taxPct: regimePct / 100, rtReservePercent: rt }).priceUnit,
      )
      for (let i = 1; i < precos.length; i++) {
        expect(precos[i]).toBeGreaterThan(precos[i - 1])
      }
    })

    const estourado = priceService({ taxPct: 0.6, rtReservePercent: 25 })
    expect(estourado.isValid).toBe(false)
    expect(estourado.validationErrors.join(' ')).toContain('Coeficiente')
  })
})
