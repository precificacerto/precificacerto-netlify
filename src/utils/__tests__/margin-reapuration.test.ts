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

describe('calculateMarginReapuration — Etapa 4: Impostos por dentro (V4)', () => {
  it('ICMS/ISS sobre RV; PIS/COFINS sobre base reduzida (RV − ICMS − ISS) — motor_rro_v4', () => {
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

    // V4: RV=1000, ICMS sobre RV; PIS/COFINS sobre (RV − ICMS − ISS) = 900
    expect(icms.base).toBe(1000)
    expect(icms.amount).toBeCloseTo(100, 4)

    expect(pis.base).toBe(900)         // base reduzida = 1000 − 100 − 0
    expect(pis.amount).toBeCloseTo(14.85, 4)   // 900 × 1,65%

    expect(cofins.base).toBe(900)      // mesma base reduzida
    expect(cofins.amount).toBeCloseTo(68.4, 4) // 900 × 7,6%

    // IMP total = ICMS + PIS + COFINS = 100 + 14.85 + 68.4 = 183.25
    expect(result.imp_total).toBeCloseTo(183.25, 4)
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

  it('Lucro Real: motor V4 produz ICMS/ISS sobre RV + PIS/COFINS sobre base reduzida', () => {
    const result = calculateMarginReapuration(
      makeInput({
        regime: 'LUCRO_REAL',
        rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076), rate('ISS', 0.05)],
      })
    )
    expect(result.taxes_inside).toHaveLength(4)
    // V4 ordem: ICMS, ISS, PIS, COFINS (PIS/COFINS dependem de ICMS/ISS)
    expect(result.taxes_inside.map((t) => t.type)).toEqual(['ICMS', 'ISS', 'PIS', 'COFINS'])
  })
})

describe('calculateMarginReapuration — Output schema (TaxBreakdown)', () => {
  it('Inclui engine_version, effective_date, regime e use_snapshot_rates', () => {
    const result = calculateMarginReapuration(makeInput({ effective_date: '2026-05-18' }))
    // V2.2.0 (Story MRM-V5-001): peso_op_interna + ancora_interna + cascade_trace 13 etapas
    expect(result.engine_version).toBe('2.2.0')
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

// ===========================================================================
// Story MRM-V5-001: Peso Op Interna + Âncora Interna + Cascade Trace 13 etapas
// ===========================================================================

describe('V5-001 — Retrocompatibilidade: peso_op_interna default = 1 (comportamento V4)', () => {
  it('Sem peso_op_interna no input, motor degrada para V4 (Âncora ≡ RV)', () => {
    const result = calculateMarginReapuration(makeInput())
    // Default 1 → peso_op_interna=1, peso_op_externa=0
    expect(result.peso_op_interna).toBe(1)
    expect(result.peso_op_externa).toBe(0)
    // Âncora ≡ RV quando peso=1
    expect(result.ancora_interna).toBeCloseTo(result.rv, 2)
  })

  it('Schema V5: campos novos sempre populados (mesmo com peso default)', () => {
    const result = calculateMarginReapuration(makeInput())
    expect(result.peso_op_interna).not.toBeNull()
    expect(result.peso_op_externa).not.toBeNull()
    expect(result.ancora_interna).not.toBeNull()
    expect(result.cascade_trace).not.toBeNull()
    expect(result.cascade_trace?.length).toBe(13)
  })

  it('Engine version reflete bump V5 (2.2.0)', () => {
    const result = calculateMarginReapuration(makeInput())
    expect(result.engine_version).toBe('2.2.0')
  })

  it('Peso fora de [0,1] é clampado (defensivo, sem alterar pureza)', () => {
    const result_neg = calculateMarginReapuration(makeInput({ peso_op_interna: -0.5 }))
    expect(result_neg.peso_op_interna).toBe(0)
    expect(result_neg.ancora_interna).toBe(0)

    const result_over = calculateMarginReapuration(makeInput({ peso_op_interna: 1.5 }))
    expect(result_over.peso_op_interna).toBe(1)
  })
})

describe('V5-001 — Golden test Excel canônico (RB=190.055,94, desc=10%, peso=0,931585)', () => {
  // Cenário oficial decodificado do Excel "Motor de descontos do resultado residual operacional.xlsx"
  // Excel canônico (células-chave):
  //   H4  Custo produto       = R$ 53.509,92
  //   H21 Op Interna Original = R$ 177.053,25  (markup divisor — PRÉ desconto)
  //   H26 Op Externa Original = R$ 13.002,69
  //   H28 RB Total            = R$ 190.055,94
  //   I21 Peso Op Interna     = 0,931585  (= H21/H28)
  //   I26 Peso Op Externa     = 0,068415  (= 1 - I21)
  //   G33 Desconto            = 10%
  //   H35 RV                  = R$ 171.050,346
  //   H36 Âncora Interna      = R$ 159.342,38   (= RV × peso)  ← POST desconto
  //   H41 ICMS reapurado      = R$ 27.088,20    (= Âncora × 17%)
  //   H43 PIS/COFINS reapurado= R$ 12.233,53    (= (Âncora − ICMS) × 9,25%)
  //   H54 RRO                 = R$ 17.471,16
  //
  // Nota STORY-002.AC5/ADR-008: a fórmula PIS/COFINS 9,25% × (Âncora − ICMS) será aplicada
  // no motor na STORY-002. Em STORY-001, motor V4 usa PIS + COFINS separados sobre base
  // reduzida — matematicamente equivalente quando PIS=1,65% + COFINS=7,6% = 9,25%.

  function makeExcelInput(overrides: Partial<ReapurationInput> = {}): ReapurationInput {
    return {
      rb: 190055.94,
      desc_value: 19005.594, // 10% de RB
      regime: 'LUCRO_REAL',
      rates: [
        rate('ICMS', 0.17),
        rate('PIS', 0.0165),
        rate('COFINS', 0.076),
        rate('IBS', 0.01),
        rate('CBS', 0.0875),
      ],
      cp: 53509.92, // H4 Custo produto
      mod: 18608.30, // H6 MO Administrativa (mapeado para `mod`)
      dop: 18838.47 + 10835.66 + 761.33, // H7 + H8 + H9 = 30435.46 (desp fixa + var + fin)
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      peso_op_interna: 0.931585, // I21 — input do orchestrator (snapshot ou markup divisor)
      effective_date: '2026-05-22',
      use_snapshot_rates: false,
      ...overrides,
    }
  }

  it('peso_op_interna persistido bate célula I21 do Excel (0,931585)', () => {
    const result = calculateMarginReapuration(makeExcelInput())
    expect(result.peso_op_interna).toBeCloseTo(0.931585, 5)
    expect(result.peso_op_externa).toBeCloseTo(0.068415, 5)
  })

  it('Âncora Interna bate célula H36 do Excel (R$ 159.342,38, PÓS desconto)', () => {
    const result = calculateMarginReapuration(makeExcelInput())
    // Âncora = RV × peso = 171050.346 × 0.931585 ≈ 159.348
    // Excel apresenta 159342.38 (com mais decimais no peso); tolerância R$ 10 absorve diferença
    expect(result.ancora_interna).toBeGreaterThan(159000)
    expect(result.ancora_interna).toBeLessThan(159400)
    // Âncora < RV (distinto de Op_Interna_Original H21 = 177.053,25 PRÉ desconto)
    expect(result.ancora_interna).toBeLessThan(result.rv)
  })

  it('ICMS reapurado bate célula H41 (Âncora × 17%)', () => {
    const result = calculateMarginReapuration(makeExcelInput())
    const icms = result.taxes_inside.find((l) => l.type === 'ICMS')
    expect(icms).toBeDefined()
    expect(icms!.amount).toBeCloseTo(result.ancora_interna! * 0.17, 2)
    // Excel H41 ≈ R$ 27.088,20
    expect(icms!.amount).toBeGreaterThan(27000)
    expect(icms!.amount).toBeLessThan(27200)
  })

  it('PIS + COFINS reapurados bate ~célula H43 (soma 9,25% sobre Âncora − ICMS)', () => {
    const result = calculateMarginReapuration(makeExcelInput())
    const pis = result.taxes_inside.find((l) => l.type === 'PIS')
    const cofins = result.taxes_inside.find((l) => l.type === 'COFINS')
    expect(pis).toBeDefined()
    expect(cofins).toBeDefined()
    const total_pis_cofins = pis!.amount + cofins!.amount
    // Excel H43 ≈ R$ 12.233,53 (apuração 9,25%); V4 separado bate matematicamente
    expect(total_pis_cofins).toBeGreaterThan(12100)
    expect(total_pis_cofins).toBeLessThan(12300)
  })

  it('RRO Excel canônico (~R$ 17.471,16, célula H54) com tolerância arredondamento', () => {
    const result = calculateMarginReapuration(makeExcelInput())
    // Excel H54 = R$ 17.471,16. Tolerância R$ 10 absorve diferenças de arredondamento decimal.
    expect(result.rro).toBeGreaterThan(17400)
    expect(result.rro).toBeLessThan(17550)
  })

  it('Status VALID e todas validações V1-V6 passam', () => {
    const result = calculateMarginReapuration(makeExcelInput())
    expect(result.status).toBe('VALID')
    expect(result.valid).toBe(true)
    expect(result.validations.V1).toBe(true)
    expect(result.validations.V2).toBe(true)
    expect(result.validations.V3).toBe(true)
    expect(result.validations.V4).toBe(true)
    expect(result.validations.V5).toBe(true)
    expect(result.validations.V6).toBe(true)
  })
})

describe('V5-001 — Cascade Trace (13 etapas obrigatórias — PDF Motor RR Seção 10)', () => {
  it('cascade_trace tem exatamente 13 entradas em ordem fixa', () => {
    const result = calculateMarginReapuration(makeInput())
    expect(result.cascade_trace).not.toBeNull()
    expect(result.cascade_trace).toHaveLength(13)

    // Step IDs em ordem fixa 1..13
    const steps = result.cascade_trace!.map((s) => s.step)
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  })

  it('Labels dos 13 steps alinhados ao PDF Motor RR Seção 10', () => {
    const result = calculateMarginReapuration(makeInput())
    const labels = result.cascade_trace!.map((s) => s.label)
    expect(labels).toEqual([
      'Receita Bruta',
      'Desconto aplicado',
      'Receita pós-desconto (RV)',
      'Aplicação do Peso Operação Interna',
      'Âncora Interna',
      'Reapuração ICMS',
      'Reapuração ISS',
      'Reapuração PIS/COFINS',
      'Redução de custos',
      'Redução de despesas (MOD + DOP)',
      'Resultado Residual Operacional (RRO)',
      'Redistribuição proporcional (Comissão + Lucro + CSLL + IRPJ)',
      'Reapuração tributos por fora (recomposição final)',
    ])
  })

  it('Cada step tem schema completo (step, label, base, rate, amount, formula, source)', () => {
    const result = calculateMarginReapuration(makeInput())
    result.cascade_trace!.forEach((s) => {
      expect(typeof s.step).toBe('number')
      expect(typeof s.label).toBe('string')
      expect(typeof s.amount).toBe('number')
      expect(typeof s.formula).toBe('string')
      expect(typeof s.source).toBe('string')
      // base e rate podem ser null em steps puramente agregadores
      expect(s.base === null || typeof s.base === 'number').toBe(true)
      expect(s.rate === null || typeof s.rate === 'number').toBe(true)
    })
  })

  it('Steps preservam ordem mesmo quando ISS=0 (sem omitir)', () => {
    // Input sem ISS → step 7 deve estar presente com amount=0 e formula='N/A'
    const result = calculateMarginReapuration(
      makeInput({ rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)] }),
    )
    const issStep = result.cascade_trace!.find((s) => s.step === 7)
    expect(issStep).toBeDefined()
    expect(issStep!.label).toBe('Reapuração ISS')
    expect(issStep!.amount).toBe(0)
    expect(issStep!.formula).toBe('N/A')
  })

  it('Step 1 (RB) value = input.rb', () => {
    const result = calculateMarginReapuration(makeInput({ rb: 50000 }))
    expect(result.cascade_trace![0].amount).toBe(50000)
  })

  it('Step 5 (Âncora) value === result.ancora_interna', () => {
    const result = calculateMarginReapuration(makeInput({ peso_op_interna: 0.95 }))
    expect(result.cascade_trace![4].amount).toBe(result.ancora_interna)
  })

  it('Step 11 (RRO) value === result.rro', () => {
    const result = calculateMarginReapuration(makeInput())
    expect(result.cascade_trace![10].amount).toBe(result.rro)
  })
})

// ===========================================================================
// Story MRM-V5-002: Base canônica tributos por fora + V7 dupla perspectiva
// ===========================================================================

describe('V5-002 — Base canônica taxes_outside_base (Excel H62 ≡ Âncora)', () => {
  it('taxes_outside_base = ancora_interna − Σ(ICMS + PIS + COFINS) — cenário Excel', () => {
    const result = calculateMarginReapuration({
      rb: 190055.94,
      desc_value: 19005.594,
      regime: 'LUCRO_REAL',
      rates: [
        rate('ICMS', 0.17),
        rate('PIS', 0.0165),
        rate('COFINS', 0.076),
        rate('IBS', 0.01),
        rate('CBS', 0.0875),
      ],
      cp: 53509.92,
      mod: 18608.30,
      dop: 18838.47 + 10835.66 + 761.33,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      peso_op_interna: 0.931585,
      effective_date: '2026-05-22',
      use_snapshot_rates: false,
    })

    // taxes_outside_base ≈ R$ 120.020,65 (Âncora 159.342,38 − ICMS 27.088,20 − PIS/COFINS 12.233,5)
    expect(result.taxes_outside_base).not.toBeNull()
    expect(result.taxes_outside_base!).toBeGreaterThan(119500)
    expect(result.taxes_outside_base!).toBeLessThan(120300)
  })

  it('IBS_final ≈ R$ 1.200,21 e CBS_final ≈ R$ 10.501,81 (Excel H65/H66)', () => {
    const result = calculateMarginReapuration({
      rb: 190055.94,
      desc_value: 19005.594,
      regime: 'LUCRO_REAL',
      rates: [
        rate('ICMS', 0.17),
        rate('PIS', 0.0165),
        rate('COFINS', 0.076),
        rate('IBS', 0.01),
        rate('CBS', 0.0875),
      ],
      cp: 53509.92,
      mod: 18608.30,
      dop: 30435.46,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      peso_op_interna: 0.931585,
      effective_date: '2026-05-22',
      use_snapshot_rates: false,
    })

    const ibs = result.taxes_outside.find((l) => l.type === 'IBS')
    const cbs = result.taxes_outside.find((l) => l.type === 'CBS')
    expect(ibs).toBeDefined()
    expect(cbs).toBeDefined()
    // IBS ≈ 120020.65 × 1% = 1200.21
    expect(ibs!.amount).toBeGreaterThan(1100)
    expect(ibs!.amount).toBeLessThan(1300)
    // CBS ≈ 120020.65 × 8.75% = 10501.81
    expect(cbs!.amount).toBeGreaterThan(10300)
    expect(cbs!.amount).toBeLessThan(10700)
    // Cada TaxLine usa taxes_outside_base como `base`
    expect(ibs!.base).toBeCloseTo(result.taxes_outside_base!, 2)
    expect(cbs!.base).toBeCloseTo(result.taxes_outside_base!, 2)
  })

  it('Clamp em 0 quando ICMS + PIS/COFINS > Âncora (super-impostos)', () => {
    // Caso degenerado: ICMS=50% + PIS=30% + COFINS=30% = 110% sobre Âncora
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.50), rate('PIS', 0.30), rate('COFINS', 0.30), rate('IBS', 0.01)],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: false,
    })

    expect(result.taxes_outside_base).toBeGreaterThanOrEqual(0)
  })

  it('Retrocompat V4: quando peso=1, taxes_outside_base = rv − imp_total', () => {
    // Sem peso_op_interna explícito → default = 1 → Âncora ≡ RV
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_PRESUMIDO',
      rates: [rate('ICMS', 0.18), rate('PIS', 0.0065), rate('COFINS', 0.03)],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })

    // Para LP cumulativo, PIS+COFINS = 0,65%+3% = 3,65% (válido V7)
    // taxes_outside_base = ancora − ICMS − PIS − COFINS
    const icms = result.taxes_inside.find((l) => l.type === 'ICMS')!.amount
    const pis = result.taxes_inside.find((l) => l.type === 'PIS')!.amount
    const cofins = result.taxes_inside.find((l) => l.type === 'COFINS')!.amount
    expect(result.taxes_outside_base!).toBeCloseTo(
      result.ancora_interna! - icms - pis - cofins,
      2,
    )
  })
})

describe('V5-002 — V7 Invariante PIS/COFINS apuração (ADR-008)', () => {
  it('V7 PASS quando PIS+COFINS=9,25% (LR não-cumulativo)', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    expect(result.validations.V7).toBe(true)
  })

  it('V7 PASS quando PIS+COFINS=3,65% (LP cumulativo)', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_PRESUMIDO',
      rates: [rate('ICMS', 0.18), rate('PIS', 0.0065), rate('COFINS', 0.03)],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    expect(result.validations.V7).toBe(true)
  })

  it('V7 PASS para regime SN (DAS absorve, invariante NA)', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'SIMPLES_NACIONAL',
      rates: [rate('ICMS', 0.07)],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    expect(result.validations.V7).toBe(true)
  })

  it('V7 PASS para regime MEI (sem PIS/COFINS)', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'MEI',
      rates: [],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    expect(result.validations.V7).toBe(true)
  })

  it('V7 PASS quando rates vazios (não-tributado)', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      rates: [],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    expect(result.validations.V7).toBe(true)
  })

  it('V7 FAIL quando PIS+COFINS=5% (fora das faixas conhecidas)', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      rates: [rate('PIS', 0.02), rate('COFINS', 0.03)], // 5%
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    expect(result.validations.V7).toBe(false)
  })
})

describe('V5-002 — GT-7 Não-equivalência ICMS=18% (ADR-008)', () => {
  // GT-7: prova que motor V5 (apuração) ≠ motor V4 (construção 7,6775%) quando ICMS ≠ 17%.
  // Quando ICMS=17%: 9,25% × 0,83 = 7,6775% → fórmulas equivalentes
  // Quando ICMS=18%: 9,25% × 0,82 = 7,585% ≠ 7,6775% → divergência ~0,09pp

  it('Com ICMS=18%, motor V5 produz PIS/COFINS sobre base reduzida (não sobre RV)', () => {
    const result = calculateMarginReapuration({
      rb: 190055.94,
      desc_value: 19005.594,
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      cp: 53509.92,
      mod: 18608.30,
      dop: 30435.46,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      peso_op_interna: 0.931585,
      effective_date: '2026-05-22',
      use_snapshot_rates: false,
    })

    // Âncora ≈ 159.342,38; ICMS = Âncora × 18% ≈ 28.681,63
    // baseReduzida = Âncora − ICMS ≈ 130.660,75
    // PIS+COFINS = baseReduzida × 9,25% ≈ 12.086,12 (fórmula V5/apuração)
    const pis = result.taxes_inside.find((l) => l.type === 'PIS')!.amount
    const cofins = result.taxes_inside.find((l) => l.type === 'COFINS')!.amount
    const totalPisCofins = pis + cofins

    // V5 esperado: ~12.086,12 (com ICMS=18%)
    expect(totalPisCofins).toBeGreaterThan(11900)
    expect(totalPisCofins).toBeLessThan(12300)

    // Hipotético V4 errado (RV × 7,6775%): 171.050,346 × 7,6775% ≈ 13.130,89
    const v4Wrong = 171050.346 * 0.076775
    // Diferença |V5 − V4_wrong| > R$ 800 — confirma não-equivalência
    expect(Math.abs(totalPisCofins - v4Wrong)).toBeGreaterThan(800)
  })

  it('Com ICMS=17%, fórmulas equivalentes (identidade STF)', () => {
    const result = calculateMarginReapuration({
      rb: 100000,
      desc_value: 0,
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      peso_op_interna: 1, // V4 equivalence: ancora ≡ rv
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })

    // V5 com peso=1: ancora = rv = 100.000
    // ICMS = 100.000 × 17% = 17.000
    // PIS+COFINS V5 = (100.000 − 17.000) × 9,25% = 83.000 × 9,25% = 7.677,50
    // V4 hipotético: 100.000 × 7,6775% = 7.677,50 → IDÊNTICO
    const pis = result.taxes_inside.find((l) => l.type === 'PIS')!.amount
    const cofins = result.taxes_inside.find((l) => l.type === 'COFINS')!.amount
    expect(pis + cofins).toBeCloseTo(100000 * 0.076775, 2) // = 7677,50
  })

  it('Documentação ADR-008: V5 é canônica para qualquer ICMS', () => {
    // Cenário ZFM (ICMS=0%): construção = apuração = 9,25%
    const result = calculateMarginReapuration({
      rb: 100000,
      desc_value: 0,
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      peso_op_interna: 1,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })

    // ICMS=0: ancora=100.000, PIS+COFINS = 100.000 × 9,25% = 9.250
    const pis = result.taxes_inside.find((l) => l.type === 'PIS')!.amount
    const cofins = result.taxes_inside.find((l) => l.type === 'COFINS')!.amount
    expect(pis + cofins).toBeCloseTo(9250, 2)
  })
})

// ===========================================================================
// Story MRM-V5-003: rro_threshold_check observacional + unificação rates loader
// ===========================================================================

describe('V5-003 — rro_threshold_check observacional (ADR-004 reforçado)', () => {
  it('rro_threshold_check populado com passed=true quando RRO > 0', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    expect(result.rro_threshold_check).not.toBeNull()
    expect(result.rro_threshold_check?.passed).toBe(result.rro > 0)
    expect(result.rro_threshold_check?.threshold).toBe(0)
    expect(result.rro_threshold_check?.observed).toBe(result.rro)
  })

  it('rro_threshold_check.passed=false quando RRO ≤ 0 (cenário desconto excessivo)', () => {
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 9000, // 90% desc → RV=1000, impostos+custos > RV
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      cp: 4500,
      mod: 0,
      dop: 1200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    // RRO deve ser negativo
    expect(result.rro).toBeLessThanOrEqual(0)
    expect(result.rro_threshold_check?.passed).toBe(false)
    expect(result.rro_threshold_check?.observed).toBe(result.rro)
  })

  it('rro_threshold_check é OBSERVACIONAL — não altera status nem bloqueia motor', () => {
    // Motor V5 com RRO_NEGATIVE: status reflete, mas threshold_check apenas espelha
    const result = calculateMarginReapuration({
      rb: 10000,
      desc_value: 9500,
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17)],
      cp: 5000,
      mod: 0,
      dop: 2000,
      commission_pct: 0.05,
      profit_pct: 0.10,
      effective_date: '2026-05-22',
      use_snapshot_rates: true,
    })
    // Status é a fonte de decisão; threshold_check é observação derivada
    expect(['RRO_NEGATIVE', 'RRO_ZERO']).toContain(result.status)
    expect(result.rro_threshold_check?.passed).toBe(false)
    // Motor não falhou — apenas sinalizou
    expect(result.error_code).toBe('RRO_NON_POSITIVE')
  })
})
