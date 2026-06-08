/**
 * Tests — icms-st-difal (ICMS-ST, DIFAL e ICMS Complementar).
 *
 * Valores canônicos do Excel "Motor RRO 29.05.xlsx" (Produto 1, interestadual:
 * OpD 143.669,80 · frete 1.000 · MVA 40% · ALQ destino 17% · ALQ origem 12%).
 */

import { computeIcmsSt, computeDifal, computeIcmsComplementar, mvaAjustada, consolidateStDifalFromItems, computeTotalACobrar } from '../icms-st-difal'

const round = (v: number) => Math.round(v * 100) / 100
const round4 = (v: number) => Math.round(v * 10000) / 10000

const P1 = {
  opInterna: 143669.8021,
  despAcessorias: 1000,
  ipiValue: 0,
  mvaOriginalPct: 40,
  alqInternaDestinoPct: 17,
  alqInterestadualOrigemPct: 12,
  interestadual: true,
}

describe('mvaAjustada', () => {
  it('Produto 1: [(1,40)×(0,88)/(0,83)] − 1 = 0,4843', () => {
    expect(round4(mvaAjustada(40, 12, 17))).toBe(0.4843)
  })
  it('ALQ interestadual = ALQ interna → MVA ajustada = MVA original', () => {
    expect(round4(mvaAjustada(40, 12, 12))).toBe(0.4)
  })
})

describe('computeIcmsSt — Excel Produto 1 (formação, sem desconto)', () => {
  const r = computeIcmsSt(P1)
  it('BC própria = 144.669,80 (E42)', () => expect(round(r.bcPropria)).toBe(144669.8))
  it('base presumida (BC-ST) = 214.738,79 (E47)', () => expect(round(r.basePresumida)).toBe(214738.79))
  it('ICMS presumido = 36.505,59 (E48)', () => expect(round(r.icmsPresumido)).toBe(36505.59))
  it('ICMS próprio = 17.360,38 (E49)', () => expect(round(r.icmsProprio)).toBe(17360.38))
  it('ICMS-ST = 19.145,22 (E50)', () => expect(round(r.icmsSt)).toBe(19145.22))
})

describe('computeIcmsSt — pós desconto 10% (frete fixo — D3)', () => {
  const r = computeIcmsSt({ ...P1, discount: 0.1 })
  it('BC própria pós = OpD×0,90 + frete = 130.302,82 (frete NÃO descontado)', () => {
    expect(round(r.bcPropria)).toBe(130302.82)
  })
  it('ICMS-ST pós < ICMS-ST formação (reduz com o desconto)', () => {
    expect(r.icmsSt).toBeGreaterThan(0)
    expect(r.icmsSt).toBeLessThan(19145.22)
  })
})

describe('computeIcmsSt — intraestadual usa MVA original e ICMS próprio pela ALQ interna', () => {
  const r = computeIcmsSt({ ...P1, interestadual: false, alqInterestadualOrigemPct: 17 })
  it('MVA aplicada = original (0,40)', () => expect(round4(r.mvaAplicada)).toBe(0.4))
  it('ICMS próprio = BC própria × 17%', () => {
    expect(round(r.icmsProprio)).toBe(round(144669.8 * 0.17))
  })
})

describe('computeDifal — Excel Produto 1', () => {
  const base = {
    opInterna: 143669.8021,
    despAcessorias: 1000,
    ipiValue: 0,
    alqInternaDestinoPct: 17,
    alqInterestadualOrigemPct: 12,
  }
  it('formação: BC 144.669,80 → DIFAL 7.233,49 (H56)', () => {
    const r = computeDifal(base)
    expect(round(r.bc)).toBe(144669.8)
    expect(round(r.difal)).toBe(7233.49)
  })
  it('pós desconto 10% (frete fixo): BC 130.302,82 → DIFAL 6.515,14 (H86)', () => {
    const r = computeDifal({ ...base, discount: 0.1 })
    expect(round(r.bc)).toBe(130302.82)
    expect(round(r.difal)).toBe(6515.14)
  })
  it('FCP 2% é calculado à parte (não soma ao DIFAL)', () => {
    const r = computeDifal({ ...base, fcpPct: 2 })
    expect(round(r.fcp)).toBe(round(144669.8 * 0.02))
    expect(round(r.difal)).toBe(7233.49)
  })
  it('base dupla = base simples quando ICMS embutido = ALQ destino (doc Tab. 89: "convergem")', () => {
    const simples = computeDifal(base)
    const dupla = computeDifal({ ...base, baseDupla: true, icmsInternaOrigemPct: 17 })
    expect(round(dupla.difal)).toBe(round(simples.difal))
  })
  it('base dupla diverge quando ICMS embutido na origem ≠ ALQ destino (LC 190/2022)', () => {
    const simples = computeDifal(base)
    const dupla = computeDifal({ ...base, baseDupla: true, icmsInternaOrigemPct: 18 })
    expect(dupla.difal).not.toBe(simples.difal)
    expect(dupla.difal).toBeGreaterThan(0)
  })
})

describe('computeIcmsComplementar — Excel Produto 1', () => {
  it('(IPI 0 + frete 1.000) × 17% = 170,00 (I58)', () => {
    expect(round(computeIcmsComplementar(0, 1000, 17))).toBe(170)
  })
  it('com IPI: (7.243,49 + 1.200) × 17% = 1.435,39 (doc Tabela 33)', () => {
    expect(round(computeIcmsComplementar(7243.49, 1200, 17))).toBe(1435.39)
  })
})

describe('consolidateStDifalFromItems — consolidação lateral (S4a)', () => {
  const prodSt = {
    id: 'p1', icms_st_active: true, difal_active: false, st_difal_interestadual: true,
    sale_price_base: 144669.8021, freight_value: 1000, insurance_value: 0, accessory_expenses_value: 0,
    ipi_value: 0, mva_original_pct: 40, icms_alq_interna_destino_pct: 17, icms_alq_interestadual_origem_pct: 12,
  }
  const prodDifal = {
    id: 'p2', icms_st_active: false, difal_active: true,
    sale_price_base: 144669.8021, freight_value: 1000, insurance_value: 0, accessory_expenses_value: 0,
    ipi_value: 0, icms_alq_interna_destino_pct: 17, icms_alq_interestadual_origem_pct: 12, fcp_alq_pct: 2,
  }
  const prodNone = { id: 'p3', icms_st_active: false, difal_active: false, sale_price_base: 50000 }

  it('sem desconto: ST do produto 1 = 19.145,22 (qty 1)', () => {
    const r = consolidateStDifalFromItems([{ product_id: 'p1', quantity: 1 }], [prodSt], 0)
    expect(round(r.st)).toBe(19145.22)
    expect(r.difal).toBe(0)
  })
  it('DIFAL + FCP do produto 2 (qty 1, sem desconto)', () => {
    const r = consolidateStDifalFromItems([{ product_id: 'p2', quantity: 1 }], [prodDifal], 0)
    expect(round(r.difal)).toBe(7233.49)
    expect(round(r.fcp)).toBe(round(144669.8021 * 0.02))
  })
  it('produtos sem flags ou itens vazios → tudo zero', () => {
    expect(consolidateStDifalFromItems([{ product_id: 'p3', quantity: 5 }], [prodNone], 0)).toEqual({ st: 0, difal: 0, fcp: 0 })
    expect(consolidateStDifalFromItems([], [], 10)).toEqual({ st: 0, difal: 0, fcp: 0 })
  })
  it('com desconto 10% reduz o ST (frete fixo)', () => {
    const semDesc = consolidateStDifalFromItems([{ product_id: 'p1', quantity: 1 }], [prodSt], 0)
    const comDesc = consolidateStDifalFromItems([{ product_id: 'p1', quantity: 1 }], [prodSt], 10)
    expect(comDesc.st).toBeLessThan(semDesc.st)
    expect(comDesc.st).toBeGreaterThan(0)
  })
})

describe('computeTotalACobrar — R1 (doc v4 Tab. 30/36)', () => {
  it('soma tributos por fora ao total da operação', () => {
    expect(computeTotalACobrar({ total_value: 100000, icms_st_value: 19145.22, difal_value: 0, fcp_value: 0, icms_compl_value: 170 }))
      .toBeCloseTo(119315.22, 2)
  })
  it('campos ausentes contam como zero; registro nulo → 0', () => {
    expect(computeTotalACobrar({ total_value: 50000 })).toBe(50000)
    expect(computeTotalACobrar(null)).toBe(0)
  })
})
