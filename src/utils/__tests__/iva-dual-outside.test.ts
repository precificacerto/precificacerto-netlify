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

describe('computeIvaDualOutside — Conferência Fiscal (Desp. Acessórias + ICMS Complementar)', () => {
  // Cenário canônico do documento "Bases de Cálculo dos Tributos Por Fora" (2026-06-05):
  // OpDentro 98.403,56 · ICMS 17% · Desp. Acessórias 1.200,00 · IBS 1% · CBS 8,8% · IPI 5%.
  const base = {
    opInterna: 98403.56,
    icmsPct: 17,
    pisCofinsPct: 0,
    issPct: 0,
    isPct: 0,
    ibsPct: 1,
    cbsPct: 8.8,
    ipiPct: 5,
    despAcessorias: 1200,
  }

  it('base do IS = OpDentro − ICMS (sem Desp. Acessórias) — doc seção 3', () => {
    const r = computeIvaDualOutside(base)
    // 98.403,56 − 16.728,61 = 81.674,95
    expect(round(r.icmsValue)).toBe(16728.61)
    expect(round(r.baseIVA)).toBe(81674.95)
  })

  it('base de IBS/CBS soma Desp. Acessórias — doc seções 1 e 2', () => {
    const r = computeIvaDualOutside(base)
    // 81.674,95 + IS(0) + 1.200 = 82.874,95
    expect(round(r.baseIbsCbs)).toBe(82874.95)
    expect(round(r.ibsValue)).toBe(828.75)
    expect(round(r.cbsValue)).toBe(7293.0)
  })

  it('base do IPI = OpDentro + Desp. Acessórias (não deduz ICMS) — doc seção 4', () => {
    const r = computeIvaDualOutside(base)
    // 98.403,56 + 1.200 = 99.603,56 × 5% = 4.980,18
    expect(round(r.ipiBase)).toBe(99603.56)
    expect(round(r.ipiValue)).toBe(4980.18)
  })

  it('ICMS Complementar = (IPI + Desp. Acessórias) × ICMS quando aplicável — doc seção 5', () => {
    const r = computeIvaDualOutside({ ...base, icmsComplApplies: true })
    // (4.980,18 + 1.200) × 17% = 6.180,18 × 17% = 1.050,63
    expect(round(r.icmsComplBase)).toBe(6180.18)
    expect(round(r.icmsComplValue)).toBe(1050.63)
  })

  it('ICMS Complementar é zero para destinatário contribuinte (não aplicável)', () => {
    const r = computeIvaDualOutside({ ...base, icmsComplApplies: false })
    expect(r.icmsComplValue).toBe(0)
  })

  it('Desp. Acessórias NÃO sofrem dedução de ICMS/PIS nem entram na base do IS', () => {
    const semDesp = computeIvaDualOutside({ ...base, despAcessorias: 0 })
    const comDesp = computeIvaDualOutside(base)
    // A base do IS (baseIVA) é idêntica com ou sem despesas acessórias.
    expect(round(comDesp.baseIVA)).toBe(round(semDesp.baseIVA))
    // A diferença na base de IBS/CBS é exatamente a Desp. Acessórias (1.200), sem dedução.
    expect(round(comDesp.baseIbsCbs - semDesp.baseIbsCbs)).toBe(1200)
  })

  it('Preço Final = OpDentro + Desp. Acessórias + Operação Externa', () => {
    const r = computeIvaDualOutside({ ...base, icmsComplApplies: true })
    const expected = base.opInterna + 1200 + r.isValue + r.ibsValue + r.cbsValue + r.ipiValue + r.icmsComplValue
    expect(round(r.finalPrice)).toBe(round(expected))
  })
})
