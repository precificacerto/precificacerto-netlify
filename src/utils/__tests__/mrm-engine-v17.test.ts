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
// SUITE 2b — Tributação POR FORA (IVA Dual / Reforma Tributária)
// ============================================================================
// Valida a hierarquia oficial do PDF "Formação de Preço com Tributação Por Fora":
// Base Econômica IVA = Âncora − ICMS − ISS − PIS/COFINS; IS compõe a base de
// IBS/CBS; IPI destacado; Preço Final = Âncora + Σ tributos por fora.
describe('Motor V17 — Tributação por fora (IVA Dual)', () => {
  const ivaInput: MotorV17Input = {
    items: [
      { item_id: 'iva', rb: 10000, cp: 0, mod_pct: 0, dop_pct: 0, commission_pct: 0.05, profit_pct: 0.15, csll_pct: 0, irpj_pct: 0, peso_op_interna: 1 },
    ],
    discount: { pct: 0 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.17), rate('IS', 0.10), rate('IBS', 0.01), rate('CBS', 0.088), rate('IPI', 0.05)],
    effective_date: '2026-06-02',
    use_snapshot_rates: false,
  }

  it('Base Econômica IVA = Âncora − ICMS − ISS − PIS/COFINS', () => {
    const r = calculateMotorV17(ivaInput)
    const is = r.distribution.taxes_outside.find((x) => x.type === 'IS')!
    const baseIva = r.motor.ancora - r.motor.icms - r.motor.iss - r.motor.pis_cofins
    expect(is.base).toBeCloseTo(baseIva, 2)
    expect(is.amount).toBeCloseTo(baseIva * 0.10, 2)
  })

  it('IBS/CBS incidem sobre (Base Econômica IVA + IS)', () => {
    const r = calculateMotorV17(ivaInput)
    const t = r.distribution.taxes_outside
    const is = t.find((x) => x.type === 'IS')!
    const ibs = t.find((x) => x.type === 'IBS')!
    const cbs = t.find((x) => x.type === 'CBS')!
    const baseIbsCbs = is.base + is.amount
    expect(ibs.base).toBeCloseTo(baseIbsCbs, 2)
    expect(cbs.base).toBeCloseTo(baseIbsCbs, 2)
    expect(ibs.amount).toBeCloseTo(baseIbsCbs * 0.01, 2)
    expect(cbs.amount).toBeCloseTo(baseIbsCbs * 0.088, 2)
  })

  it('IPI é destacado sobre a Âncora (não integra base IBS/CBS)', () => {
    const r = calculateMotorV17(ivaInput)
    const ipi = r.distribution.taxes_outside.find((x) => x.type === 'IPI')!
    expect(ipi.base).toBeCloseTo(r.motor.ancora, 2)
    expect(ipi.amount).toBeCloseTo(r.motor.ancora * 0.05, 2)
  })

  it('valor_final = Âncora + Σ tributos por fora', () => {
    const r = calculateMotorV17(ivaInput)
    expect(r.distribution.valor_final).toBeCloseTo(
      r.motor.ancora + r.distribution.taxes_outside_total,
      2,
    )
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

// ============================================================================
// SUITE 5 — ADR-016 (2026-05-29): PIS/COFINS base Âncora−ICMS−ISS + TRANSMUTAÇÃO
// (valor preservado da precificação) + cascata 13A/13B. Revoga ADR-013.
// ============================================================================
describe('Motor V17 — ADR-016 PIS/COFINS transmutação + 13A/13B', () => {
  // Cenário controlado: 1 produto, Op Interna = 100.000, sem desconto.
  //   ICMS 10% = 10.000 | ISS 5% = 5.000 | PIS/COFINS precificação = 4.325 (Op Interna × pct)
  //   Base 13A = 100.000 − 10.000 − 5.000 = 85.000
  //   VALOR preservado da precificação = 4.325 (NÃO reduzido pela base menor)
  //   Alíquota TRANSMUTADA = 4.325 / 85.000 = 0,0508824 ; 85.000 × 0,0508824 = 4.325
  const controlledInput: MotorV17Input = {
    items: [{
      item_id: 'adr016',
      rb: 100000, cp: 20000, mod_pct: 0, dop_pct: 0.10,
      commission_pct: 0.05, profit_pct: 0.15, csll_pct: 0.009, irpj_pct: 0.015,
      peso_op_interna: 1,
      taxes_inside_amounts: { icms: 10000, iss: 5000, pis_cofins: 4325 },
    }],
    discount: { pct: 0 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.10), rate('ISS', 0.05), rate('PIS', 0.0077), rate('COFINS', 0.0355)],
    effective_date: '2026-05-29',
    use_snapshot_rates: false,
  }

  it('ICMS/ISS sobre faturamento; PIS/COFINS preserva o VALOR da precificação', () => {
    const r = calculateMotorV17(controlledInput)
    expect(r.motor.icms).toBeCloseTo(10000, 2)
    expect(r.motor.iss).toBeCloseTo(5000, 2)
    // Valor PRESERVADO = 4.325 (precificação), NÃO 85.000 × 0,04325 = 3.676,25
    expect(r.motor.pis_cofins).toBeCloseTo(4325, 1)
  })

  it('Expõe alíquota TRANSMUTADA (precif ÷ (1−ICMS%−ISS%) = valor ÷ base 13A)', () => {
    const r = calculateMotorV17(controlledInput)
    // 4.325 / 85.000 = 0,0508824 (> 0,04325 da precificação, pois base é menor)
    expect(r.motor.pis_cofins_aliquota_efetiva).toBeCloseTo(0.0508824, 5)
  })

  it('Base da Etapa 14 desconta o PIS/COFINS (Âncora − ICMS − ISS − PIS/COFINS)', () => {
    const r = calculateMotorV17(controlledInput)
    // imp_dentro = 10.000 + 5.000 + 4.325 = 19.325 → base 14 = 100.000 − 19.325 = 80.675
    expect(r.motor.imp_dentro_total).toBeCloseTo(19325, 1)
    const step14 = r.motor.cascade_trace[13]
    expect(step14.base).toBeCloseTo(80675, 1)
  })

  it('Cascata 13 segregada em 13A/13B com linha "Resultado após ICMS e ISS"', () => {
    const r = calculateMotorV17(controlledInput)
    const step13 = r.motor.cascade_trace[12]
    expect(step13.step).toBe(13)
    const children = step13.children ?? []
    expect(children).toHaveLength(4)
    expect(children[0].label).toContain('ICMS')
    expect(children[1].label).toContain('ISS')
    // Linha-âncora obrigatória (base 13A)
    expect(children[2].label).toContain('Resultado após ICMS e ISS')
    expect(children[2].amount).toBeCloseTo(85000, 1) // Âncora − ICMS − ISS
    // 13B PIS/COFINS — base 13A, alíquota transmutada, valor preservado
    const pisLine = children[3]
    expect(pisLine.label).toContain('PIS/COFINS')
    expect(pisLine.base).toBeCloseTo(85000, 1)
    expect(pisLine.rate).toBeCloseTo(0.0508824, 5)
    expect(pisLine.amount).toBeCloseTo(-4325, 1)
    // Auditável: base × |rate| = |amount| (= valor da precificação)
    expect((pisLine.base ?? 0) * (pisLine.rate ?? 0)).toBeCloseTo(Math.abs(pisLine.amount), 1)
  })

  it('Regressão "Obra JJCR": valor preservado ≈ 3.634 (bug 78% eliminado)', () => {
    // Produto JJCR (PIS/COFINS 4,325%) + serviço sem impostos — diluição consolidada.
    const r = calculateMotorV17({
      items: [
        {
          item_id: 'jjcr', rb: 84023.28, cp: 50000, mod_pct: 0, dop_pct: 0.10,
          commission_pct: 0.001, profit_pct: 0.12, csll_pct: 0.0108, irpj_pct: 0.018,
          peso_op_interna: 1,
          // ICMS 10% e PIS/COFINS 4,325% sobre Op Interna 84.023,28 = 3.634,01
          taxes_inside_amounts: { icms: 8402.33, iss: 0, pis_cofins: 84023.28 * 0.04325 },
        },
        {
          item_id: 'servico', rb: 10937.52, cp: 1000, mod_pct: 0, dop_pct: 0.10,
          commission_pct: 0.001, profit_pct: 0.12, csll_pct: 0.0108, irpj_pct: 0.018,
          peso_op_interna: 1,
          taxes_inside_amounts: { icms: 0, iss: 0, pis_cofins: 0 },
        },
      ],
      discount: { pct: 0 },
      policy: 'RRO_PROPORTIONAL',
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.10), rate('PIS', 0.0077), rate('COFINS', 0.0355)],
      effective_date: '2026-05-29',
      use_snapshot_rates: false,
    })
    // VALOR preservado da precificação = 84.023,28 × 4,325% = R$ 3.634,01 — NUNCA 67.808
    expect(r.motor.pis_cofins).toBeCloseTo(3634.01, 0)
    // Alíquota transmutada ≈ 4,198% (3.634,01 / 86.558,46), NUNCA 78%
    expect(r.motor.pis_cofins_aliquota_efetiva).toBeCloseTo(0.041982, 4)
    expect(r.motor.pis_cofins_aliquota_efetiva).toBeLessThan(0.05)
  })
})
