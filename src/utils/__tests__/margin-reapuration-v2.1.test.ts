/**
 * Suite V2.1 — Motor de Reapuração de Margem (Story MRM-V2-S1.3)
 *
 * Cobertura especifica de:
 *  - Rateio em 4 componentes (commission + profit + CSLL + IRPJ) — Story S1.1, ADR-002
 *  - Guard Q5: regime MEI/SIMPLES_NACIONAL força csll/irpj = 0 + console.warn
 *  - Epsilon dinâmico V4: max(0.01, rro * 1e-6)
 *  - Edges de regimes tributários
 *  - GOLDEN TEST oficial da spec V2 item 13 (tolerância R$0,02)
 *
 * IMPORTANTE: este arquivo COMPLEMENTA `margin-reapuration.test.ts` (V2.0 baseline).
 * Não duplica testes — foca no comportamento adicionado em V2.1.
 */

import { calculateMarginReapuration, getOrientationMessage } from '../margin-reapuration'
import { MRM_ENGINE_VERSION, type ReapurationInput, type TaxRatePeriod } from '@/types/mrm'

// ─────────────────────────── Helpers ───────────────────────────

function rate(tax_type: TaxRatePeriod['tax_type'], pct: number): TaxRatePeriod {
  return {
    id: `${tax_type}-${pct}`,
    tenant_id: 'tnt-1',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct: pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: null,
  }
}

function makeInput(overrides: Partial<ReapurationInput> = {}): ReapurationInput {
  return {
    rb: 10000,
    desc_value: 1000,
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    cp: 4000,
    mod: 0,
    dop: 1000,
    commission_pct: 0.05,
    profit_pct: 0.10,
    csll_pct: 0.0207,
    irpj_pct: 0.0345,
    effective_date: '2026-05-18',
    use_snapshot_rates: true,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
// GOLDEN TEST — Spec V2 item 13 (AC3, tolerância R$0,02)
// ═══════════════════════════════════════════════════════════════

describe('GOLDEN TEST — Spec V2 item 13 (oficial)', () => {
  // Input documental:
  //   RB=141656.68, desconto=5%, regime=LUCRO_REAL,
  //   profit=23%, commission=11.5%, csll=2.07%, irpj=3.45%
  // Output esperado:
  //   RRO ≈ 18580.30, new_profit ≈ 10678.33, new_commission ≈ 5339.17,
  //   new_csll ≈ 961.05, new_irpj ≈ 1601.75
  //
  // Como o documento não detalha CP/MOD/DOP/IMP, derivamos:
  //   RV = RB - desc = 141656.68 - 7082.834 = 134573.846
  //   Soma(IMP+CP+MOD+DOP) = RV - RRO = 134573.846 - 18580.30 = 115993.546
  // Usamos rates=[] (IMP=0) e CP+DOP = 115993.546.

  it('reproduz exemplo oficial spec V2 item 13 com tolerância R$0,02', () => {
    const RB = 141656.68
    const desc_value = RB * 0.05 // 7082.834
    const RV = RB - desc_value // 134573.846
    const expected_rro = 18580.30
    const total_deducoes = RV - expected_rro // 115993.546

    const result = calculateMarginReapuration({
      rb: RB,
      desc_value,
      regime: 'LUCRO_REAL',
      rates: [], // sem impostos por dentro neste teste — golden focado no rateio
      cp: total_deducoes,
      mod: 0,
      dop: 0,
      commission_pct: 0.115,
      profit_pct: 0.23,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
      effective_date: '2026-05-18',
      use_snapshot_rates: true,
    })

    // Tolerância R$0,02 (AC3)
    const TOL = 0.02

    expect(result.rro).toBeCloseTo(expected_rro, 2)
    expect(Math.abs(result.rro - expected_rro)).toBeLessThanOrEqual(TOL)

    expect(Math.abs(result.new_profit - 10678.33)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(result.new_commission - 5339.17)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(result.new_csll - 961.05)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(result.new_irpj - 1601.75)).toBeLessThanOrEqual(TOL)

    // Invariante: soma dos 4 componentes = RRO (V4)
    const sum = result.new_commission + result.new_profit + result.new_csll + result.new_irpj
    expect(Math.abs(sum - result.rro)).toBeLessThanOrEqual(TOL)

    expect(result.status).toBe('VALID')
    expect(result.valid).toBe(true)
    expect(result.validations.V1).toBe(true)
    expect(result.validations.V3).toBe(true)
    expect(result.validations.V4).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// LUCRO_REAL — rateio com CSLL/IRPJ
// ═══════════════════════════════════════════════════════════════

describe('LUCRO_REAL — rateio 4 componentes', () => {
  it('LR com csll>0 e irpj>0: rateia em 4 componentes proporcionais', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    if (result.rro > 0) {
      const combined = 0.05 + 0.10 + 0.0207 + 0.0345
      expect(result.new_commission).toBeCloseTo(result.rro * (0.05 / combined), 4)
      expect(result.new_profit).toBeCloseTo(result.rro * (0.10 / combined), 4)
      expect(result.new_csll).toBeCloseTo(result.rro * (0.0207 / combined), 4)
      expect(result.new_irpj).toBeCloseTo(result.rro * (0.0345 / combined), 4)
    }
  })

  it('LR com csll=0 e irpj>0: rateio considera apenas 3 componentes ativos', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      csll_pct: 0,
      irpj_pct: 0.0345,
    }))

    expect(result.new_csll).toBe(0)
    if (result.rro > 0) expect(result.new_irpj).toBeGreaterThan(0)
  })

  it('LR com csll>0 e irpj=0: rateio considera apenas 3 componentes ativos', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      csll_pct: 0.0207,
      irpj_pct: 0,
    }))

    expect(result.new_irpj).toBe(0)
    if (result.rro > 0) expect(result.new_csll).toBeGreaterThan(0)
  })

  it('LR com prejuízo (RRO<0): CSLL/IRPJ ratedos são 0 mesmo configurados', () => {
    // Input projetado para gerar RRO negativo (custos > receita)
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      rb: 1000,
      desc_value: 100,
      rates: [],
      cp: 1500, // CP > RV
      mod: 0,
      dop: 0,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    expect(result.rro).toBeLessThan(0)
    expect(result.status).toBe('RRO_NEGATIVE')
    // R5: motor não força valores
    expect(result.new_csll).toBe(0)
    expect(result.new_irpj).toBe(0)
    expect(result.new_commission).toBe(0)
    expect(result.new_profit).toBe(0)
  })

  it('LR com csll_pct=0 e irpj_pct=0 explícitos: degrada para V2.0 (2 componentes)', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      csll_pct: 0,
      irpj_pct: 0,
    }))

    expect(result.new_csll).toBe(0)
    expect(result.new_irpj).toBe(0)
    if (result.rro > 0) {
      // soma = RRO
      expect(result.new_commission + result.new_profit).toBeCloseTo(result.rro, 2)
    }
  })

  it('LR com csll_pct e irpj_pct undefined: mesmo comportamento de zero (default)', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      csll_pct: undefined,
      irpj_pct: undefined,
    }))

    expect(result.new_csll).toBe(0)
    expect(result.new_irpj).toBe(0)
  })

  it('LR com commission=0 e profit=0 mas csll/irpj>0: rateia 100% para CSLL+IRPJ', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      commission_pct: 0,
      profit_pct: 0,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    expect(result.new_commission).toBe(0)
    expect(result.new_profit).toBe(0)
    if (result.rro > 0) {
      const combined = 0.0207 + 0.0345
      expect(result.new_csll).toBeCloseTo(result.rro * (0.0207 / combined), 4)
      expect(result.new_irpj).toBeCloseTo(result.rro * (0.0345 / combined), 4)
      expect(result.new_csll + result.new_irpj).toBeCloseTo(result.rro, 2)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// LUCRO_PRESUMIDO — sem desconto e com desconto pesado
// ═══════════════════════════════════════════════════════════════

describe('LUCRO_PRESUMIDO — cenários de desconto', () => {
  it('LP sem desconto (desc_value=0): motor não bumpa V5, mantém valores', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_PRESUMIDO',
      desc_value: 0,
      csll_pct: 0.0288,
      irpj_pct: 0.048,
    }))

    expect(result.desc_value).toBe(0)
    expect(result.rv).toBe(result.rb)
    expect(result.validations.V5).toBe(true) // desc=0 → V5 passa por default
  })

  it('LP com desconto 50% (stress): motor calcula RRO corretamente', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_PRESUMIDO',
      rb: 10000,
      desc_value: 5000, // 50%
      cp: 1500,
      mod: 0,
      dop: 500,
      rates: [rate('ICMS', 0.07)],
      commission_pct: 0.03,
      profit_pct: 0.05,
      csll_pct: 0.0288,
      irpj_pct: 0.048,
    }))

    expect(result.rv).toBe(5000)
    expect(result.validations.V5).toBe(true) // RV < RB
    // RRO esperado: 5000 - (5000*0.07) - 1500 - 500 = 5000 - 350 - 2000 = 2650
    expect(result.rro).toBeCloseTo(2650, 2)
    if (result.rro > 0) {
      const sum = result.new_commission + result.new_profit + result.new_csll + result.new_irpj
      expect(sum).toBeCloseTo(result.rro, 2)
    }
  })

  it('LP com csll e irpj presumido: produz 4 componentes válidos', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_PRESUMIDO',
      csll_pct: 0.0288,
      irpj_pct: 0.048,
    }))

    if (result.rro > 0) {
      expect(result.new_csll).toBeGreaterThan(0)
      expect(result.new_irpj).toBeGreaterThan(0)
      expect(result.validations.V4).toBe(true)
    }
  })

  it('LP com prejuízo: status RRO_NEGATIVE e new_csll/new_irpj zerados', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_PRESUMIDO',
      rb: 1000,
      desc_value: 500,
      rates: [],
      cp: 800, // > RV (500)
      mod: 0,
      dop: 0,
      csll_pct: 0.0288,
      irpj_pct: 0.048,
    }))

    expect(result.rro).toBeLessThan(0)
    expect(result.status).toBe('RRO_NEGATIVE')
    expect(result.new_csll).toBe(0)
    expect(result.new_irpj).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// SIMPLES_NACIONAL — Guard Q5 (csll/irpj forçados a 0 + warn)
// ═══════════════════════════════════════════════════════════════

describe('SIMPLES_NACIONAL — Guard Q5', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('SN Anexo III com csll/irpj=0: NÃO emite warning, motor funciona', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'SIMPLES_NACIONAL',
      rates: [rate('ICMS', 0.06)],
      csll_pct: 0,
      irpj_pct: 0,
    }))

    expect(warnSpy).not.toHaveBeenCalled()
    expect(result.new_csll).toBe(0)
    expect(result.new_irpj).toBe(0)
  })

  it('SN com csll_pct=5 e irpj_pct=10 no input: força a zero + emite warning estruturado', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'SIMPLES_NACIONAL',
      rates: [rate('ICMS', 0.06)],
      csll_pct: 0.05,
      irpj_pct: 0.10,
    }))

    // Q5: forçado a zero
    expect(result.new_csll).toBe(0)
    expect(result.new_irpj).toBe(0)

    // Warning estruturado
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      '[MRM] CSLL/IRPJ forced to 0 for regime',
      expect.objectContaining({
        regime: 'SIMPLES_NACIONAL',
        attempted_csll: 0.05,
        attempted_irpj: 0.10,
      })
    )
  })

  it('SN com apenas csll_pct configurado (>0) e irpj=0: ainda emite warning', () => {
    calculateMarginReapuration(makeInput({
      regime: 'SIMPLES_NACIONAL',
      rates: [rate('ICMS', 0.06)],
      csll_pct: 0.02,
      irpj_pct: 0,
    }))

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][1]).toMatchObject({
      regime: 'SIMPLES_NACIONAL',
      attempted_csll: 0.02,
      attempted_irpj: 0,
    })
  })

  it('SN com prejuízo: motor reporta RRO_NEGATIVE normalmente', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'SIMPLES_NACIONAL',
      rb: 1000,
      desc_value: 500,
      rates: [rate('ICMS', 0.06)],
      cp: 800,
      mod: 0,
      dop: 0,
    }))

    expect(result.rro).toBeLessThan(0)
    expect(result.status).toBe('RRO_NEGATIVE')
  })

  it('SN com comissão alta: ratea apenas comm+profit (csll/irpj=0)', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'SIMPLES_NACIONAL',
      rates: [rate('ICMS', 0.06)],
      commission_pct: 0.20,
      profit_pct: 0.05,
      csll_pct: 0, // sem warn
      irpj_pct: 0,
    }))

    if (result.rro > 0) {
      const expectedComm = result.rro * (0.20 / 0.25)
      const expectedProfit = result.rro * (0.05 / 0.25)
      expect(result.new_commission).toBeCloseTo(expectedComm, 2)
      expect(result.new_profit).toBeCloseTo(expectedProfit, 2)
      expect(result.new_csll).toBe(0)
      expect(result.new_irpj).toBe(0)
    }
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('SN com profit alto: rateio mantém ratio comm/profit, CSLL/IRPJ zerados', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'SIMPLES_NACIONAL',
      rates: [rate('ICMS', 0.06)],
      commission_pct: 0.02,
      profit_pct: 0.30,
    }))

    if (result.rro > 0) {
      const ratio = result.new_commission / (result.new_commission + result.new_profit)
      expect(ratio).toBeCloseTo(0.02 / 0.32, 4)
      expect(result.new_csll).toBe(0)
      expect(result.new_irpj).toBe(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// MEI — Guard Q5 (csll/irpj forçados a 0 + warn)
// ═══════════════════════════════════════════════════════════════

describe('MEI — Guard Q5 e DAS fixo', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('MEI com csll=0/irpj=0: motor funciona, não emite warn', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'MEI',
      rates: [],
      csll_pct: 0,
      irpj_pct: 0,
    }))

    expect(warnSpy).not.toHaveBeenCalled()
    expect(result.new_csll).toBe(0)
    expect(result.new_irpj).toBe(0)
  })

  it('MEI com csll/irpj>0 no input: força zero + warning estruturado com regime=MEI', () => {
    calculateMarginReapuration(makeInput({
      regime: 'MEI',
      rates: [],
      csll_pct: 0.03,
      irpj_pct: 0.07,
    }))

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      '[MRM] CSLL/IRPJ forced to 0 for regime',
      expect.objectContaining({
        regime: 'MEI',
        attempted_csll: 0.03,
        attempted_irpj: 0.07,
      })
    )
  })

  it('MEI sem desconto: motor calcula RV=RB, status VALID', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'MEI',
      rates: [],
      desc_value: 0,
      cp: 200,
      dop: 100,
    }))

    expect(result.rv).toBe(result.rb)
    expect(result.desc_value).toBe(0)
  })

  it('MEI com desconto baixo: motor processa rateio em 2 componentes', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'MEI',
      rb: 5000,
      desc_value: 250,
      rates: [],
      cp: 1000,
      dop: 500,
      commission_pct: 0.05,
      profit_pct: 0.10,
    }))

    if (result.rro > 0) {
      expect(result.new_csll).toBe(0)
      expect(result.new_irpj).toBe(0)
      expect(result.new_commission + result.new_profit).toBeCloseTo(result.rro, 2)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// EDGES — precisão, epsilon dinâmico, status especiais
// ═══════════════════════════════════════════════════════════════

describe('EDGES — precisão float e epsilon dinâmico', () => {
  it('combined_pct com 4 decimais (0.4002): V3 passa com epsilon 1e-9', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      commission_pct: 0.115,
      profit_pct: 0.23,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    // combined_pct = 0.4002 (exato em decimal, mas float introduz drift mínimo)
    expect(result.validations.V3).toBe(true)
  })

  it('epsilon dinâmico: RRO grande (R$10M) — V4 tolera diferença de R$10', () => {
    // Input que gera RRO ~10M
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      rb: 20_000_000,
      desc_value: 0,
      rates: [],
      cp: 9_000_000,
      mod: 0,
      dop: 1_000_000,
      commission_pct: 0.115,
      profit_pct: 0.23,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    expect(result.rro).toBeCloseTo(10_000_000, 0)
    expect(result.validations.V4).toBe(true) // epsilon ~10.0
    const sum = result.new_commission + result.new_profit + result.new_csll + result.new_irpj
    expect(Math.abs(sum - result.rro)).toBeLessThanOrEqual(10.01)
  })

  it('epsilon dinâmico: RRO pequeno (R$0,50) — epsilon = 0.01 mínimo (não relaxa)', () => {
    // RV=10, cp=9.5, rates=[], rro = 0.5
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      rb: 10,
      desc_value: 0,
      rates: [],
      cp: 9.5,
      mod: 0,
      dop: 0,
      commission_pct: 0.115,
      profit_pct: 0.23,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    expect(result.rro).toBeCloseTo(0.5, 4)
    expect(result.validations.V4).toBe(true)
    const sum = result.new_commission + result.new_profit + result.new_csll + result.new_irpj
    // Para RRO=0.5, epsilon = max(0.01, 5e-7) = 0.01
    expect(Math.abs(sum - result.rro)).toBeLessThanOrEqual(0.01)
  })

  it('V4 com 4 componentes: soma exata = RRO dentro do epsilon dinâmico', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    if (result.rro > 0) {
      const sum = result.new_commission + result.new_profit + result.new_csll + result.new_irpj
      const epsilon = Math.max(0.01, result.rro * 1e-6)
      expect(Math.abs(sum - result.rro)).toBeLessThanOrEqual(epsilon)
      expect(result.validations.V4).toBe(true)
    }
  })
})

describe('EDGES — RRO em limiares', () => {
  it('RRO = 0 (limiar) → status RRO_ZERO (V1 falha)', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      rb: 1000,
      desc_value: 0,
      rates: [],
      cp: 1000,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
    }))

    expect(result.rro).toBe(0)
    expect(result.status).toBe('RRO_ZERO')
    expect(result.validations.V1).toBe(false)
    expect(result.error_code).toBe('RRO_NON_POSITIVE')
  })

  it('RRO negativo (-100) → status RRO_NEGATIVE', () => {
    const result = calculateMarginReapuration(makeInput({
      regime: 'LUCRO_REAL',
      rb: 1000,
      desc_value: 0,
      rates: [],
      cp: 1100, // > RB
      mod: 0,
      dop: 0,
    }))

    expect(result.rro).toBe(-100)
    expect(result.status).toBe('RRO_NEGATIVE')
    expect(result.validations.V1).toBe(false)
  })
})

describe('EDGES — Schema V2.1', () => {
  it('engine_version reflete V2.2.0 após bump da Story MRM-V5-001', () => {
    const result = calculateMarginReapuration(makeInput())
    expect(result.engine_version).toBe(MRM_ENGINE_VERSION)
    // V9 (2026-05-25): bump 2.3.0 → 2.4.0
    expect(result.engine_version).toBe('2.5.0')
  })

  it('TaxBreakdown contém new_csll e new_irpj sempre (mesmo regime sem rateio)', () => {
    const result = calculateMarginReapuration(makeInput({ regime: 'MEI', rates: [] }))
    expect(result).toHaveProperty('new_csll')
    expect(result).toHaveProperty('new_irpj')
    expect(typeof result.new_csll).toBe('number')
    expect(typeof result.new_irpj).toBe('number')
  })

  it('Invariante: soma 4 componentes = RRO para cada regime tributário viável', () => {
    // Suprime warnings esperados de MEI/SIMPLES_NACIONAL com csll/irpj > 0 (Guard Q5)
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    const regimes: Array<ReapurationInput['regime']> = [
      'LUCRO_REAL',
      'LUCRO_PRESUMIDO',
      'SIMPLES_NACIONAL',
      'MEI',
    ]

    for (const regime of regimes) {
      const result = calculateMarginReapuration(makeInput({
        regime,
        rb: 10000,
        desc_value: 500,
        rates: regime === 'MEI' || regime === 'SIMPLES_NACIONAL' ? [rate('ICMS', 0.06)] : [rate('ICMS', 0.18)],
        cp: 3000,
        mod: 0,
        dop: 500,
        commission_pct: 0.05,
        profit_pct: 0.10,
        csll_pct: 0.0207,
        irpj_pct: 0.0345,
      }))

      if (result.rro > 0) {
        const sum = result.new_commission + result.new_profit + result.new_csll + result.new_irpj
        const epsilon = Math.max(0.01, result.rro * 1e-6)
        expect(Math.abs(sum - result.rro)).toBeLessThanOrEqual(epsilon)
      }
    }

    warnSpy.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════
// Helper getOrientationMessage — cobertura branches restantes
// ═══════════════════════════════════════════════════════════════

describe('getOrientationMessage', () => {
  it('retorna null quando status = VALID', () => {
    const result = calculateMarginReapuration(makeInput())
    if (result.status === 'VALID') {
      expect(getOrientationMessage(result)).toBeNull()
    }
  })

  it('retorna mensagem orientativa quando status = RRO_ZERO', () => {
    const result = calculateMarginReapuration(makeInput({
      rb: 1000,
      desc_value: 0,
      rates: [],
      cp: 1000,
      mod: 0,
      dop: 0,
    }))
    expect(result.status).toBe('RRO_ZERO')
    expect(getOrientationMessage(result)).not.toBeNull()
    expect(getOrientationMessage(result)).toContain('margem residual')
  })

  it('retorna mensagem orientativa quando status = RRO_NEGATIVE', () => {
    const result = calculateMarginReapuration(makeInput({
      rb: 1000,
      desc_value: 0,
      rates: [],
      cp: 1100,
      mod: 0,
      dop: 0,
    }))
    expect(result.status).toBe('RRO_NEGATIVE')
    expect(getOrientationMessage(result)).not.toBeNull()
  })
})
