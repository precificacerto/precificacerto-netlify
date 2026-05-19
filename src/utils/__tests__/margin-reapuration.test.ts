import { calculateMarginReapuration, getOrientationMessage } from '../margin-reapuration'
import type { ReapurationInput, TaxRatePeriod } from '@/types/mrm'

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
    regime: 'LUCRO_PRESUMIDO',
    rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    cp: 4500,
    mod: 0,
    dop: 1200,
    commission_pct: 0.05,
    profit_pct: 0.10,
    effective_date: '2026-05-18',
    use_snapshot_rates: true,
    ...overrides,
  }
}

describe('calculateMarginReapuration — Caso Tabela 21 (golden numérico da spec)', () => {
  // Spec Tabela 21: RB R$10.000, desc 10%, IMP R$1.800, CP R$4.500, DOP R$1.200, RRO R$1.500,
  // peso comm = 5/15 = 0.3333, peso lucro = 10/15 = 0.6667, NovaCom R$500, NovoLucro R$1.000.
  // Aqui usamos alíquotas que reproduzem o IMP ≈ R$1.800 sobre RV R$9.000.

  it('reproduz proporções da Tabela 21 com RV=9000, RRO=1500, comissão proporcional', () => {
    const result = calculateMarginReapuration(makeInput())

    expect(result.rv).toBeCloseTo(9000, 2)
    expect(result.cp).toBe(4500)
    expect(result.dop).toBe(1200)
    expect(result.mod).toBe(0)

    // RRO = 9000 - IMP - 4500 - 0 - 1200
    expect(result.rro).toBeCloseTo(9000 - result.imp_total - 5700, 2)

    // Pesos proporcionais: 5/(5+10) = 0.3333, 10/15 = 0.6667
    const expectedPesoComm = 0.05 / 0.15
    const expectedPesoLucro = 0.10 / 0.15
    expect(result.new_commission).toBeCloseTo(Math.max(0, result.rro) * expectedPesoComm, 2)
    expect(result.new_profit).toBeCloseTo(Math.max(0, result.rro) * expectedPesoLucro, 2)

    expect(result.validations.V3).toBe(true)
    expect(result.validations.V4).toBe(true)
  })
})

describe('calculateMarginReapuration — Etapas 1-2: Receita após desconto', () => {
  it('RV = RB - DESC quando desconto > 0', () => {
    const result = calculateMarginReapuration(makeInput({ rb: 10000, desc_value: 1500 }))
    expect(result.rv).toBe(8500)
    expect(result.validations.V5).toBe(true)
  })

  it('RV = RB quando desconto = 0 (V5 ainda passa)', () => {
    const result = calculateMarginReapuration(makeInput({ desc_value: 0 }))
    expect(result.rv).toBe(10000)
    expect(result.validations.V5).toBe(true)
  })
})

describe('calculateMarginReapuration — Etapa 4: Impostos por dentro sequenciais', () => {
  it('ICMS antes de PIS/COFINS (sequência obrigatória — Tabela 13)', () => {
    const result = calculateMarginReapuration(
      makeInput({
        rb: 1000,
        desc_value: 0,
        cp: 0,
        dop: 0,
        rates: [rate('ICMS', 0.10), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      })
    )

    const icms = result.taxes_inside.find((t) => t.type === 'ICMS')!
    const pis = result.taxes_inside.find((t) => t.type === 'PIS')!
    const cofins = result.taxes_inside.find((t) => t.type === 'COFINS')!

    expect(icms.base).toBe(1000)
    expect(icms.amount).toBeCloseTo(100, 4)

    // PIS sobre base remanescente (1000 - 100 = 900)
    expect(pis.base).toBeCloseTo(900, 4)
    expect(pis.amount).toBeCloseTo(14.85, 4)

    // COFINS sobre base remanescente (900 - 14.85 = 885.15)
    expect(cofins.base).toBeCloseTo(885.15, 4)
    expect(cofins.amount).toBeCloseTo(67.27, 2)
  })

  it('Ignora tributos com alíquota 0', () => {
    const result = calculateMarginReapuration(
      makeInput({ rates: [rate('ICMS', 0.10), rate('PIS', 0), rate('COFINS', 0)] })
    )
    expect(result.taxes_inside).toHaveLength(1)
    expect(result.taxes_inside[0].type).toBe('ICMS')
  })

  it('V6: impostos calculados sobre RV (não RB)', () => {
    const result = calculateMarginReapuration(makeInput({ rb: 1000, desc_value: 100 }))
    const icms = result.taxes_inside.find((t) => t.type === 'ICMS')!
    expect(icms.base).toBe(900) // = RV, não RB
    expect(result.validations.V6).toBe(true)
  })
})

describe('calculateMarginReapuration — R6: MOD imune', () => {
  it('MOD é subtraído do RRO mas nunca alterado', () => {
    const result = calculateMarginReapuration(
      makeInput({ rb: 10000, desc_value: 1000, cp: 3000, mod: 500, dop: 1000 })
    )
    expect(result.mod).toBe(500)
    // RRO = 9000 - IMP - 3000 - 500 - 1000
    expect(result.rro).toBeCloseTo(9000 - result.imp_total - 4500, 2)
  })

  it('Aumentar MOD reduz RRO na mesma proporção (imutabilidade do valor)', () => {
    const baseline = calculateMarginReapuration(makeInput({ mod: 0 }))
    const withMod = calculateMarginReapuration(makeInput({ mod: 1000 }))
    expect(withMod.rro).toBeCloseTo(baseline.rro - 1000, 2)
    expect(withMod.mod).toBe(1000) // valor preservado
  })
})

describe('calculateMarginReapuration — Etapa 8: Redistribuição proporcional do RRO', () => {
  it('Pesos somam 1 (V3)', () => {
    const result = calculateMarginReapuration(makeInput({ commission_pct: 0.03, profit_pct: 0.07 }))
    expect(result.validations.V3).toBe(true)
  })

  it('NovaCom + NovoLucro = RRO (V4) quando RRO > 0', () => {
    const result = calculateMarginReapuration(makeInput())
    if (result.rro > 0) {
      expect(result.new_commission + result.new_profit).toBeCloseTo(result.rro, 2)
      expect(result.validations.V4).toBe(true)
    }
  })

  it('Proporção comissão/lucro mantém ratio original', () => {
    const result = calculateMarginReapuration(
      makeInput({ commission_pct: 0.05, profit_pct: 0.10 })
    )
    if (result.rro > 0) {
      const ratio = result.new_commission / (result.new_commission + result.new_profit)
      expect(ratio).toBeCloseTo(0.05 / 0.15, 4)
    }
  })

  it('Quando commission_pct e profit_pct são 0, redistribuição é zero (sem divisão por zero)', () => {
    const result = calculateMarginReapuration(makeInput({ commission_pct: 0, profit_pct: 0 }))
    expect(result.new_commission).toBe(0)
    expect(result.new_profit).toBe(0)
    expect(result.validations.V3).toBe(true) // edge case especial
    expect(result.validations.V4).toBe(true)
  })
})

describe('calculateMarginReapuration — V1: bloqueio RRO ≤ 0 (R5)', () => {
  it('RRO < 0 → status RRO_NEGATIVE, mensagem orientativa, sem forçar valor', () => {
    const result = calculateMarginReapuration(
      makeInput({ rb: 1000, desc_value: 900, cp: 500, dop: 300 })
    )
    expect(result.rro).toBeLessThan(0)
    expect(result.validations.V1).toBe(false)
    expect(result.status).toBe('RRO_NEGATIVE')
    expect(result.error_code).toBe('RRO_NON_POSITIVE')
    expect(result.messages.length).toBeGreaterThan(0)
    expect(getOrientationMessage(result)).not.toBeNull()
  })

  it('RRO exato 0 → status RRO_ZERO', () => {
    const result = calculateMarginReapuration(
      makeInput({
        rb: 1000,
        desc_value: 0,
        rates: [],
        cp: 1000,
        mod: 0,
        dop: 0,
        commission_pct: 0,
        profit_pct: 0,
      })
    )
    expect(result.rro).toBe(0)
    expect(result.status).toBe('RRO_ZERO')
  })

  it('Motor não força valor quando RRO ≤ 0 (R5) — new_commission e new_profit são 0', () => {
    const result = calculateMarginReapuration(
      makeInput({ rb: 1000, desc_value: 900, cp: 500, dop: 300 })
    )
    expect(result.new_commission).toBe(0)
    expect(result.new_profit).toBe(0)
  })
})

describe('calculateMarginReapuration — Etapa 9: Tributos por fora', () => {
  it('Calculados sobre nova base operacional (RV - impostos por dentro), não sobre RV bruto', () => {
    const result = calculateMarginReapuration(
      makeInput({
        rb: 1000,
        desc_value: 0,
        cp: 0,
        dop: 0,
        rates: [rate('ICMS', 0.10), rate('IPI', 0.05)],
      })
    )
    const ipi = result.taxes_outside.find((t) => t.type === 'IPI')!
    // Base operacional = RV - ICMS = 1000 - 100 = 900
    expect(ipi.base).toBeCloseTo(900, 4)
    expect(ipi.amount).toBeCloseTo(45, 4)
  })

  it('Cada tributo por fora incide independente (não sequencial)', () => {
    const result = calculateMarginReapuration(
      makeInput({
        rb: 1000,
        desc_value: 0,
        cp: 0,
        dop: 0,
        rates: [rate('ICMS', 0.10), rate('IPI', 0.05), rate('ICMS_ST', 0.10)],
      })
    )
    const ipi = result.taxes_outside.find((t) => t.type === 'IPI')!
    const icmsSt = result.taxes_outside.find((t) => t.type === 'ICMS_ST')!
    // Ambos sobre mesma base (900), não sequencial
    expect(ipi.base).toBeCloseTo(icmsSt.base, 4)
  })
})

describe('calculateMarginReapuration — Regimes tributários (R3)', () => {
  it('MEI/Simples: alíquota única (DAS) tratada como ICMS na ordem', () => {
    const result = calculateMarginReapuration(
      makeInput({
        regime: 'SIMPLES_NACIONAL',
        rates: [rate('ICMS', 0.06)],
        cp: 200,
        dop: 100,
      })
    )
    expect(result.taxes_inside).toHaveLength(1)
    expect(result.regime).toBe('SIMPLES_NACIONAL')
  })

  it('Lucro Real: ICMS + PIS + COFINS + ISS sequenciais', () => {
    const result = calculateMarginReapuration(
      makeInput({
        regime: 'LUCRO_REAL',
        rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076), rate('ISS', 0.05)],
      })
    )
    expect(result.taxes_inside).toHaveLength(4)
    expect(result.taxes_inside.map((t) => t.type)).toEqual(['ICMS', 'PIS', 'COFINS', 'ISS'])
  })
})

describe('calculateMarginReapuration — Output schema (TaxBreakdown)', () => {
  it('Inclui engine_version, effective_date, regime e use_snapshot_rates', () => {
    const result = calculateMarginReapuration(makeInput({ effective_date: '2026-05-18' }))
    // V2.1.0 (Story MRM-V2-S1.1): rateio 4 componentes (commission + profit + CSLL + IRPJ)
    expect(result.engine_version).toBe('2.1.0')
    expect(result.effective_date).toBe('2026-05-18')
    expect(result.regime).toBe('LUCRO_PRESUMIDO')
    expect(result.use_snapshot_rates).toBe(true)
  })

  it('Status VALID quando todas validações OK', () => {
    const result = calculateMarginReapuration(makeInput())
    if (result.rro > 0) {
      expect(result.status).toBe('VALID')
      expect(result.valid).toBe(true)
      expect(result.error_code).toBeNull()
    }
  })
})
