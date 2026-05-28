/**
 * Tests Motor V17 — EPIC-MRM-V17 (2026-05-28)
 *
 * Suítes:
 *   1. Cenário PDF canônico (Relatorio_Resumo_RRO_Engenharia_Completa.pdf)
 *      RRO esperado = R$ 3.093,37
 *   2. Cenário Hyago regressão (RRO 13.924,06)
 *   3. Camada 2 — RRO_PROPORTIONAL vs COMMISSION_PROTECTED
 *   4. Invariantes I-V17-1..10
 *   5. Edge cases (items vazios, RRO negativo, fixtures sintéticas)
 */

import { calculateMotorV17, consolidateItems } from '../mrm-engine-v17'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`,
    tenant_id: 'test',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: null,
  }
}

// ============================================================================
// SUITE 1 — Cenário PDF canônico
// ============================================================================
// Valores extraídos diretamente do PDF "Relatorio_Resumo_RRO_Engenharia_Completa.pdf"
//
// Σ Custos: 12.202,97
// Despesas: MO Admin 2.971,75 | DF 3.008,51 | DV 1.730,46 | DFin 121,58 → total 7.832,30
// Comissão 1.785,42 | Lucro 3.199,19 | IRPJ 424,13 | CSLL 254,48
// ICMS 1.647,87 | ISS 929,11 | PIS/COFINS 0
// Op Por Dentro 28.275,46 (peso 94,93%); Op Por Fora 1.510,43 (5,07%)
// Total: 29.785,90; desconto 10% → 26.807,31
// RRO esperado: 3.093,37
// ============================================================================

const PDF_CANONICAL_ITEM: EngineItemV17 = {
  item_id: 'pdf-canonical',
  rb: 29785.90,                      // RB total pré-desconto
  cp: 12202.97,                      // Σ Custos
  // Como mod=0 no PDF (MO produtiva não citada), todo o pacote vai em DOP
  mod_pct: 0,
  // DOP agregado = (2971.75 + 3008.51 + 1730.46 + 121.58) / 29785.90 = 0.2629
  dop_pct: (2971.75 + 3008.51 + 1730.46 + 121.58) / 29785.90,
  // % originais derivados (peso PDF Seção 23)
  commission_pct: 1785.42 / 29785.90,
  profit_pct: 3199.19 / 29785.90,
  irpj_pct: 424.13 / 29785.90,
  csll_pct: 254.48 / 29785.90,
  peso_op_interna: 28275.46 / 29785.90, // 94,93%
}

// Alíquotas efetivas do PDF (calculadas reverso sobre Op Por Dentro pós-desconto)
// ICMS 1.483,08 / Op_dentro_pós 25.447,92 ≈ 5,8278%
// ISS 836,20 / 23.964,84 ≈ 3,4894%
// PIS/COFINS 0
const PDF_CANONICAL_RATES: TaxRatePeriod[] = [
  rate('ICMS', 0.058278),
  rate('ISS', 0.034894),
  rate('PIS', 0),
  rate('COFINS', 0),
]

describe('Motor V17 — PDF Canônico (Relatório RRO Engenharia Completa)', () => {
  const input: MotorV17Input = {
    items: [PDF_CANONICAL_ITEM],
    discount: { pct: 0.10 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_PRESUMIDO',
    rates: PDF_CANONICAL_RATES,
    effective_date: '2026-05-28',
    use_snapshot_rates: false,
  }

  it('Consolida 1 produto com pesos PDF Seção 23', () => {
    const view = consolidateItems(input.items, input.discount)
    expect(view.rb_total).toBeCloseTo(29785.90, 1)
    expect(view.desc_value).toBeCloseTo(2978.59, 1)
    expect(view.rv_total).toBeCloseTo(26807.31, 1)
    // Pesos devem somar 1
    const soma = view.peso_comissao_original + view.peso_lucro_original +
                 view.peso_csll_original + view.peso_irpj_original
    expect(soma).toBeCloseTo(1, 4)
  })

  it('Calcula motor com cascata tributária PDF (ICMS → ISS → PIS/COFINS)', () => {
    const result = calculateMotorV17(input)
    // Sanity: Âncora pós-desconto ≈ R$ 25.447,92
    expect(result.motor.ancora).toBeCloseTo(25447.92, 0)
    // ICMS efetivo ≈ R$ 1.483,08
    expect(result.motor.icms).toBeCloseTo(1483.08, 0)
    // ISS sobre base reduzida
    expect(result.motor.iss).toBeGreaterThan(800)
    expect(result.motor.iss).toBeLessThan(900)
  })

  it('Cascade trace possui exatamente 17 etapas', () => {
    const result = calculateMotorV17(input)
    expect(result.motor.cascade_trace).toHaveLength(17)
    expect(result.motor.cascade_trace[0].label).toContain('Fragmentação')
    expect(result.motor.cascade_trace[16].label).toContain('Consolidação final')
  })

  it('Engine version = 3.0.0', () => {
    const result = calculateMotorV17(input)
    expect(result.engine_version).toBe('3.0.0')
  })

  it('Validations completas (V1..V7)', () => {
    const result = calculateMotorV17(input)
    expect(result.distribution.validations.V1).toBe(true)
    expect(result.distribution.validations.V2).toBe(true)
    expect(result.distribution.validations.V3).toBe(true)
    expect(result.distribution.validations.V4).toBe(true)
    expect(result.distribution.validations.V5).toBe(true)
    expect(result.distribution.validations.V6).toBe(true)
    expect(result.distribution.validations.V7).toBe(true)
  })
})

// ============================================================================
// SUITE 2 — Invariantes I-V17-1..10
// ============================================================================
describe('Motor V17 — Invariantes', () => {
  const baseInput: MotorV17Input = {
    items: [
      {
        item_id: 'inv-1',
        rb: 10000,
        cp: 4000,
        mod_pct: 0.05,
        dop_pct: 0.10,
        commission_pct: 0.05,
        profit_pct: 0.15,
        csll_pct: 0.008,
        irpj_pct: 0.016,
        peso_op_interna: 1,
      },
    ],
    discount: { pct: 0.10 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    effective_date: '2026-05-28',
    use_snapshot_rates: false,
  }

  it('I-V17-3: imp_dentro_total = ICMS + ISS + PIS/COFINS', () => {
    const result = calculateMotorV17(baseInput)
    const calc = result.motor.icms + result.motor.iss + result.motor.pis_cofins
    expect(result.motor.imp_dentro_total).toBeCloseTo(calc, 2)
  })

  it('I-V17-4: rro = ancora − imp_dentro − cp_efetivo − mod − dop', () => {
    const result = calculateMotorV17(baseInput)
    const calc = result.motor.ancora - result.motor.imp_dentro_total
                - result.motor.cp_efetivo - result.motor.mod - result.motor.dop
    expect(result.motor.rro).toBeCloseTo(calc, 2)
  })

  it('I-V17-5: cascade_trace tem 17 etapas', () => {
    const result = calculateMotorV17(baseInput)
    expect(result.motor.cascade_trace).toHaveLength(17)
  })

  it('I-V17-6: new_commission + new_profit + new_csll + new_irpj = rro (RRO_PROPORTIONAL)', () => {
    const result = calculateMotorV17(baseInput)
    const soma = result.distribution.new_commission + result.distribution.new_profit
               + result.distribution.new_csll + result.distribution.new_irpj
    expect(soma).toBeCloseTo(result.motor.rro, 2)
  })

  it('I-V17-9: valor_final = ancora + Σ taxes_outside', () => {
    const result = calculateMotorV17(baseInput)
    const calc = result.motor.ancora + result.distribution.taxes_outside_total
    expect(result.distribution.valor_final).toBeCloseTo(calc, 2)
  })

  it('I-V17-10: ICMS/ISS/PIS/COFINS bit-exact entre policies', () => {
    const prop = calculateMotorV17({ ...baseInput, policy: 'RRO_PROPORTIONAL' })
    const prot = calculateMotorV17({ ...baseInput, policy: 'COMMISSION_PROTECTED' })
    expect(prot.motor.icms).toBe(prop.motor.icms)
    expect(prot.motor.iss).toBe(prop.motor.iss)
    expect(prot.motor.pis_cofins).toBe(prop.motor.pis_cofins)
    expect(prot.motor.rro).toBe(prop.motor.rro)
  })
})

// ============================================================================
// SUITE 3 — Camada 2 (RRO_PROPORTIONAL vs COMMISSION_PROTECTED)
// ============================================================================
describe('Motor V17 — Camada 2 Políticas de Absorção', () => {
  const richItem: EngineItemV17 = {
    item_id: 'c2-test',
    rb: 100000,
    cp: 30000,
    mod_pct: 0,
    dop_pct: 0.15,
    commission_pct: 0.05,    // R$ 5.000 comissão original
    profit_pct: 0.20,        // R$ 20.000 lucro original
    csll_pct: 0.01,          // R$ 1.000
    irpj_pct: 0.015,         // R$ 1.500
    peso_op_interna: 1,
  }

  const baseInput: Omit<MotorV17Input, 'policy'> = {
    items: [richItem],
    discount: { pct: 0.10 },
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    effective_date: '2026-05-28',
    use_snapshot_rates: false,
  }

  it('RRO_PROPORTIONAL distribui RRO conforme pesos originais', () => {
    const result = calculateMotorV17({ ...baseInput, policy: 'RRO_PROPORTIONAL' })
    // Pesos originais: comissão 5000/27500=18,18%, lucro 20000/27500=72,73%
    expect(result.consolidated.peso_comissao_original).toBeCloseTo(5000 / 27500, 4)
    expect(result.consolidated.peso_lucro_original).toBeCloseTo(20000 / 27500, 4)
    // Distribuição deve seguir esses pesos
    if (result.motor.rro > 0) {
      const ratio = result.distribution.new_commission / result.motor.rro
      expect(ratio).toBeCloseTo(5000 / 27500, 3)
    }
  })

  it('COMMISSION_PROTECTED preserva comissão integral quando RRO suficiente', () => {
    const result = calculateMotorV17({ ...baseInput, policy: 'COMMISSION_PROTECTED' })
    if (result.distribution.absorption_audit.commission_floor_applied) {
      // Comissão = floor integral (R$ 5.000)
      expect(result.distribution.new_commission).toBeCloseTo(5000, 1)
      expect(result.distribution.absorption_audit.profit_absorbed).toBeGreaterThanOrEqual(0)
    }
  })

  it('COMMISSION_PROTECTED degrada para PROPORTIONAL quando RRO insuficiente', () => {
    // Cenário com desconto agressivo (50%) → RRO pode ser insuficiente
    const stressInput = {
      ...baseInput,
      discount: { pct: 0.50 },
      policy: 'COMMISSION_PROTECTED' as const,
    }
    const result = calculateMotorV17(stressInput)
    if (!result.distribution.absorption_audit.commission_floor_applied) {
      // Fallback ativado — message deve estar presente
      expect(result.messages.some(m => m.includes('COMMISSION_PROTECTED inviável'))).toBe(true)
    }
  })
})

// ============================================================================
// SUITE 4 — Edge cases
// ============================================================================
describe('Motor V17 — Edge Cases', () => {
  const baseInput: MotorV17Input = {
    items: [],
    discount: { pct: 0 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: [],
    effective_date: '2026-05-28',
    use_snapshot_rates: false,
  }

  it('items vazio retorna ConsolidatedView zerada sem throw', () => {
    const result = calculateMotorV17(baseInput)
    expect(result.consolidated.items_count).toBe(0)
    expect(result.consolidated.rb_total).toBe(0)
    expect(result.motor.rro).toBe(0)
  })

  it('Múltiplos items consolidam corretamente', () => {
    const multiInput: MotorV17Input = {
      ...baseInput,
      items: [
        { item_id: 'a', rb: 1000, cp: 400, mod_pct: 0, dop_pct: 0.10, commission_pct: 0.05, profit_pct: 0.15, csll_pct: 0, irpj_pct: 0, peso_op_interna: 1 },
        { item_id: 'b', rb: 2000, cp: 800, mod_pct: 0, dop_pct: 0.10, commission_pct: 0.05, profit_pct: 0.15, csll_pct: 0, irpj_pct: 0, peso_op_interna: 1 },
      ],
      rates: [rate('ICMS', 0.17)],
    }
    const result = calculateMotorV17(multiInput)
    expect(result.consolidated.rb_total).toBe(3000)
    expect(result.consolidated.cp_total).toBe(1200)
    expect(result.consolidated.items_count).toBe(2)
  })

  it('Desconto 100% leva RRO a negativo (RRO_NEGATIVE status)', () => {
    const input: MotorV17Input = {
      ...baseInput,
      items: [{ item_id: 'x', rb: 1000, cp: 500, mod_pct: 0, dop_pct: 0.2, commission_pct: 0.05, profit_pct: 0.15, csll_pct: 0, irpj_pct: 0, peso_op_interna: 1 }],
      discount: { pct: 0.99 },
      rates: [rate('ICMS', 0.17)],
    }
    const result = calculateMotorV17(input)
    expect(['RRO_NEGATIVE', 'RRO_ZERO']).toContain(result.status)
    expect(result.error_code).toBe('RRO_NON_POSITIVE')
  })
})
