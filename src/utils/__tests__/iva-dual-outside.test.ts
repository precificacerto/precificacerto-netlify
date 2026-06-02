/**
 * Tests — iva-dual-outside (tributação POR FORA / IVA Dual).
 *
 * Valida a hierarquia oficial do "Relatório de Formação de Preço com Tributação
 * Por Fora" (PrecificaCerto, 2026-06-02): BaseIVA = OpInterna − ICMS − ISS −
 * PIS/COFINS (sem gross-up); IS sobre BaseIVA; IBS/CBS sobre (BaseIVA + IS);
 * IPI destacado; Preço Final = OpInterna + IS + IBS + CBS + IPI.
 */

import { computeIvaDualOutside } from '../iva-dual-outside'

const round = (v: number) => Math.round(v * 100) / 100

describe('computeIvaDualOutside — hierarquia PDF', () => {
  it('cenário real AAAtesteCBS3 (Lucro Real, ICMS 17%, IBS 1%, CBS 8,8%)', () => {
    const r = computeIvaDualOutside({
      opInterna: 24654.33022772122,
      icmsPct: 17,
      pisCofinsPct: 0,
      issPct: 0,
      isPct: 0,
      ibsPct: 1,
      cbsPct: 8.8,
      ipiPct: 0,
    })
    // Base Econômica IVA = 24.654,33 × (1 − 0,17) = 20.463,09
    expect(round(r.baseIVA)).toBe(20463.09)
    expect(round(r.ibsValue)).toBe(204.63)
    expect(round(r.cbsValue)).toBe(1800.75)
    expect(round(r.finalPrice)).toBe(26659.71)
  })

  it('remove ICMS, ISS e PIS/COFINS da base (Etapa 2-3) — sem gross-up', () => {
    const r = computeIvaDualOutside({
      opInterna: 1000,
      icmsPct: 18,
      issPct: 5,
      pisCofinsPct: 9.25,
    })
    // 1000 − 180 − 50 − 92,5 = 677,5
    expect(round(r.baseIVA)).toBe(677.5)
    expect(round(r.icmsValue)).toBe(180)
    expect(round(r.issValue)).toBe(50)
    expect(round(r.pisCofinsValue)).toBe(92.5)
  })

  it('Imposto Seletivo compõe a base de IBS/CBS (Etapa 4-5)', () => {
    const r = computeIvaDualOutside({
      opInterna: 1000,
      icmsPct: 0,
      isPct: 10,
      ibsPct: 10,
      cbsPct: 0,
    })
    // baseIVA = 1000; IS = 100; baseIbsCbs = 1100; IBS = 110
    expect(round(r.baseIVA)).toBe(1000)
    expect(round(r.isValue)).toBe(100)
    expect(round(r.baseIbsCbs)).toBe(1100)
    expect(round(r.ibsValue)).toBe(110)
  })

  it('IPI é destacado e NÃO integra a base de IBS/CBS (Etapa 8)', () => {
    const r = computeIvaDualOutside({
      opInterna: 1000,
      ibsPct: 10,
      ipiPct: 5,
    })
    // IPI = 1000 × 5% = 50 (sobre operação interna); IBS = 1000 × 10% = 100
    expect(round(r.ipiValue)).toBe(50)
    expect(round(r.ibsValue)).toBe(100)
    expect(round(r.finalPrice)).toBe(1150)
  })

  it('Preço Final = Operação Interna + Operação Externa (Etapa 9-10)', () => {
    const r = computeIvaDualOutside({
      opInterna: 1000,
      icmsPct: 17,
      isPct: 2,
      ibsPct: 1,
      cbsPct: 8.8,
      ipiPct: 3,
    })
    const expected = 1000 + r.isValue + r.ibsValue + r.cbsValue + r.ipiValue
    expect(round(r.finalPrice)).toBe(round(expected))
    expect(round(r.totalOutside)).toBe(round(r.isValue + r.ibsValue + r.cbsValue + r.ipiValue))
  })

  it('serviço com ISS (sem ICMS): subtrai ISS + PIS/COFINS', () => {
    const r = computeIvaDualOutside({
      opInterna: 2000,
      icmsPct: 0,
      issPct: 5,
      pisCofinsPct: 9.25,
      ibsPct: 1,
      cbsPct: 8.8,
    })
    // baseIVA = 2000 − 100 − 185 = 1715
    expect(round(r.baseIVA)).toBe(1715)
    expect(round(r.ibsValue)).toBe(17.15)
    expect(round(r.cbsValue)).toBe(150.92)
  })

  it('alíquotas zeradas → operação externa nula, preço final = operação interna', () => {
    const r = computeIvaDualOutside({ opInterna: 1234.56 })
    expect(r.totalOutside).toBe(0)
    expect(r.finalPrice).toBe(1234.56)
    expect(r.baseIVA).toBe(1234.56)
  })

  it('base do IPI customizada (ipiBase)', () => {
    const r = computeIvaDualOutside({ opInterna: 1000, ipiPct: 10, ipiBase: 800 })
    expect(round(r.ipiValue)).toBe(80)
  })
})
