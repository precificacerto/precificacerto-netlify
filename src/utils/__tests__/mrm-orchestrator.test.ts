import {
  aggregateItemTaxCredits,
  calculatePesoOpInternaFromMarkup,
  orchestrateReapurationSync,
  resolvePesoOpInterna,
  type ItemTaxCreditSnapshot,
  type ProductPricingConfig,
} from '../mrm-orchestrator'
import type { TaxBreakdown, TaxRatePeriod } from '@/types/mrm'

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

describe('orchestrateReapurationSync — Snapshot D2: alíquota mid-período', () => {
  it('Quando use_snapshot_rates=true E prev_breakdown válido: reusa alíquotas do snapshot', () => {
    // Cenário: orçamento criado em 2026-05 com ICMS 7%, edição em 2026-12 quando alíquota subiu para 9%.
    // Resultado esperado: snapshot preserva ICMS 7% original.

    const previousBreakdown: TaxBreakdown = {
      engine_version: '2.0.0',
      effective_date: '2026-05-18',
      regime: 'LUCRO_PRESUMIDO',
      use_snapshot_rates: true,
      taxes_inside: [
        { type: 'ICMS', rate_pct: 0.07, base: 1000, amount: 70 },
      ],
      taxes_outside: [],
      rb: 1000,
      desc_value: 0,
      rv: 1000,
      cp: 0,
      mod: 0,
      dop: 0,
      imp_total: 70,
      rro: 930,
      new_commission: 0,
      new_profit: 0,
      new_csll: 0,
      new_irpj: 0,
      validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true },
      valid: true,
      status: 'VALID',
      error_code: null,
      messages: [],
    }

    const ratesAtuaisServidor = [rate('ICMS', 0.09)] // ICMS subiu para 9% no servidor

    const result = orchestrateReapurationSync({
      rb: 1000,
      desc_value: 0,
      regime: 'LUCRO_PRESUMIDO',
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: ratesAtuaisServidor,
      options: {
        use_snapshot_rates: true,
        prev_breakdown: previousBreakdown,
        effective_date: '2026-12-15',
      },
    })

    // Deve usar ICMS 7% do snapshot, não 9% do servidor
    const icms = result.taxes_inside.find((t) => t.type === 'ICMS')!
    expect(icms.rate_pct).toBe(0.07)
    expect(icms.amount).toBeCloseTo(70, 2)
    expect(result.use_snapshot_rates).toBe(true)
  })

  it('Quando use_snapshot_rates=false: usa alíquotas atuais do servidor', () => {
    const previousBreakdown: TaxBreakdown = {
      engine_version: '2.0.0',
      effective_date: '2026-05-18',
      regime: 'LUCRO_PRESUMIDO',
      use_snapshot_rates: false,
      taxes_inside: [{ type: 'ICMS', rate_pct: 0.07, base: 1000, amount: 70 }],
      taxes_outside: [],
      rb: 1000,
      desc_value: 0,
      rv: 1000,
      cp: 0,
      mod: 0,
      dop: 0,
      imp_total: 70,
      rro: 930,
      new_commission: 0,
      new_profit: 0,
      new_csll: 0,
      new_irpj: 0,
      validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true },
      valid: true,
      status: 'VALID',
      error_code: null,
      messages: [],
    }

    const ratesAtuaisServidor = [rate('ICMS', 0.09)]

    const result = orchestrateReapurationSync({
      rb: 1000,
      desc_value: 0,
      regime: 'LUCRO_PRESUMIDO',
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: ratesAtuaisServidor,
      options: {
        use_snapshot_rates: false,
        prev_breakdown: previousBreakdown,
        effective_date: '2026-12-15',
      },
    })

    const icms = result.taxes_inside.find((t) => t.type === 'ICMS')!
    expect(icms.rate_pct).toBe(0.09)
    expect(result.use_snapshot_rates).toBe(false)
  })

  it('Quando prev_breakdown é null (criação nova): usa alíquotas atuais mesmo com use_snapshot_rates=true', () => {
    const ratesAtuaisServidor = [rate('ICMS', 0.07)]

    const result = orchestrateReapurationSync({
      rb: 1000,
      desc_value: 0,
      regime: 'LUCRO_PRESUMIDO',
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: ratesAtuaisServidor,
      options: {
        use_snapshot_rates: true,
        prev_breakdown: null,
        effective_date: '2026-05-18',
      },
    })

    const icms = result.taxes_inside.find((t) => t.type === 'ICMS')!
    expect(icms.rate_pct).toBe(0.07)
    // O resultado JÁ É um snapshot (será persistido com use_snapshot_rates=true)
    expect(result.use_snapshot_rates).toBe(true)
  })

  it('Quando prev_breakdown é inválido (RRO_NEGATIVE): não reusa snapshot, busca atuais', () => {
    const previousInvalid: TaxBreakdown = {
      engine_version: '2.0.0',
      effective_date: '2026-05-18',
      regime: 'LUCRO_PRESUMIDO',
      use_snapshot_rates: true,
      taxes_inside: [{ type: 'ICMS', rate_pct: 0.07, base: 1000, amount: 70 }],
      taxes_outside: [],
      rb: 1000,
      desc_value: 950,
      rv: 50,
      cp: 0,
      mod: 0,
      dop: 0,
      imp_total: 70,
      rro: -20,
      new_commission: 0,
      new_profit: 0,
      new_csll: 0,
      new_irpj: 0,
      validations: { V1: false, V2: true, V3: true, V4: true, V5: true, V6: true },
      valid: false,
      status: 'RRO_NEGATIVE',
      error_code: 'RRO_NON_POSITIVE',
      messages: ['x'],
    }

    const ratesAtuaisServidor = [rate('ICMS', 0.09)]

    const result = orchestrateReapurationSync({
      rb: 1000,
      desc_value: 0,
      regime: 'LUCRO_PRESUMIDO',
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: ratesAtuaisServidor,
      options: {
        use_snapshot_rates: true,
        prev_breakdown: previousInvalid,
        effective_date: '2026-12-15',
      },
    })

    // prev inválido não é reutilizado — usa alíquotas atuais (9%)
    const icms = result.taxes_inside.find((t) => t.type === 'ICMS')!
    expect(icms.rate_pct).toBe(0.09)
  })
})

describe('orchestrateReapurationSync — Snapshot reconstrói tributos por fora também', () => {
  it('Snapshot inclui taxes_inside E taxes_outside', () => {
    const previousBreakdown: TaxBreakdown = {
      engine_version: '2.0.0',
      effective_date: '2026-05-18',
      regime: 'LUCRO_REAL',
      use_snapshot_rates: true,
      taxes_inside: [
        { type: 'ICMS', rate_pct: 0.18, base: 1000, amount: 180 },
        { type: 'PIS', rate_pct: 0.0165, base: 820, amount: 13.53 },
      ],
      taxes_outside: [
        { type: 'IPI', rate_pct: 0.05, base: 820, amount: 41 },
      ],
      rb: 1000,
      desc_value: 0,
      rv: 1000,
      cp: 0,
      mod: 0,
      dop: 0,
      imp_total: 193.53,
      rro: 806.47,
      new_commission: 0,
      new_profit: 0,
      new_csll: 0,
      new_irpj: 0,
      validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true },
      valid: true,
      status: 'VALID',
      error_code: null,
      messages: [],
    }

    const result = orchestrateReapurationSync({
      rb: 1000,
      desc_value: 0,
      regime: 'LUCRO_REAL',
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: [], // servidor não retornaria nada — testa que snapshot tem precedência
      options: {
        use_snapshot_rates: true,
        prev_breakdown: previousBreakdown,
        effective_date: '2026-12-15',
      },
    })

    expect(result.taxes_inside.find((t) => t.type === 'ICMS')?.rate_pct).toBe(0.18)
    expect(result.taxes_inside.find((t) => t.type === 'PIS')?.rate_pct).toBe(0.0165)
    expect(result.taxes_outside.find((t) => t.type === 'IPI')?.rate_pct).toBe(0.05)
  })
})

describe('orchestrateReapurationSync — Effective date propagation', () => {
  it('effective_date do options propaga para o breakdown final', () => {
    const result = orchestrateReapurationSync({
      rb: 1000,
      desc_value: 0,
      regime: 'LUCRO_PRESUMIDO',
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: [rate('ICMS', 0.07)],
      options: {
        use_snapshot_rates: false,
        effective_date: '2026-08-22',
      },
    })

    expect(result.effective_date).toBe('2026-08-22')
  })

  it('Sem effective_date no options: usa data atual', () => {
    const today = new Date().toISOString().slice(0, 10)
    const result = orchestrateReapurationSync({
      rb: 1000,
      desc_value: 0,
      regime: 'LUCRO_PRESUMIDO',
      cp: 0,
      mod: 0,
      dop: 0,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: [rate('ICMS', 0.07)],
      options: { use_snapshot_rates: false },
    })

    expect(result.effective_date).toBe(today)
  })
})

// ===========================================================================
// Story MRM-V5-001 AC9 — Resolução de peso_op_interna (3 fontes de prioridade)
// ===========================================================================

describe('V5-001 — calculatePesoOpInternaFromMarkup (markup divisor da precificação original)', () => {
  // Excel cenário canônico — derivado das células I21 e configurações do produto
  function excelConfig(overrides: Partial<ProductPricingConfig> = {}): ProductPricingConfig {
    return {
      cost: 53509.92, // H4
      // Σ percentuais internos: MO + Desp + Comm + Lucro + IRPJ + CSLL + ICMS + PIS/COFINS
      // = 0.1051 + 0.1064 + 0.0612 + 0.0043 + 0.05 + 0.10 + 0.015 + 0.009 + 0.17 + 0.076775
      // ≈ 0.697775 (Excel C19)
      internal_percentuals_sum: 0.697775,
      internal_tax_rates_sum: 0.17 + 0.076775, // ICMS + PIS/COFINS (V4)
      external_tax_rates_sum: 0.01 + 0.0875, // IBS + CBS
      ...overrides,
    }
  }

  it('Calcula peso aproximadamente igual ao valor canônico do Excel (0,931585)', () => {
    const peso = calculatePesoOpInternaFromMarkup(excelConfig())
    // Tolerância 1% (arredondamento dos percentuais)
    expect(peso).toBeGreaterThan(0.92)
    expect(peso).toBeLessThan(0.94)
  })

  it('Retorna 1 (default) quando Σ percentuais ≥ 1 (configuração inválida)', () => {
    const peso = calculatePesoOpInternaFromMarkup(excelConfig({ internal_percentuals_sum: 1.05 }))
    expect(peso).toBe(1)
  })

  it('Retorna 1 (default) quando cost ≤ 0', () => {
    const peso = calculatePesoOpInternaFromMarkup(excelConfig({ cost: 0 }))
    expect(peso).toBe(1)
  })

  it('Retorna 1 (default) quando external_tax_rates = 0 (sem op externa)', () => {
    const peso = calculatePesoOpInternaFromMarkup(excelConfig({ external_tax_rates_sum: 0 }))
    expect(peso).toBe(1) // Op_Externa = 0 → peso = Op_Interna / Op_Interna = 1
  })

  it('Peso clampado em [0, 1]', () => {
    const peso = calculatePesoOpInternaFromMarkup(excelConfig())
    expect(peso).toBeGreaterThanOrEqual(0)
    expect(peso).toBeLessThanOrEqual(1)
  })
})

describe('V5-001 — resolvePesoOpInterna (3 fontes de prioridade)', () => {
  it('Fonte 1 (input explícito): retorna peso_op_interna_input quando válido', () => {
    const peso = resolvePesoOpInterna({ peso_op_interna_input: 0.85 })
    expect(peso).toBe(0.85)
  })

  it('Fonte 1 sobrescreve fonte 2 (snapshot)', () => {
    const snapshot: TaxBreakdown = {
      engine_version: '2.3.0',
      effective_date: '2026-05-22',
      regime: 'LUCRO_REAL',
      use_snapshot_rates: true,
      taxes_inside: [],
      taxes_outside: [],
      rb: 0,
      desc_value: 0,
      rv: 0,
      cp: 0,
      mod: 0,
      dop: 0,
      imp_total: 0,
      rro: 0,
      limite_minimo: null,
      peso_op_interna: 0.5, // snapshot
      peso_op_externa: 0.5,
      ancora_interna: 0,
      cascade_trace: null,
      new_commission: 0,
      new_profit: 0,
      new_csll: 0,
      new_irpj: 0,
      validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true },
      valid: true,
      status: 'VALID',
      error_code: null,
      messages: [],
    }
    const peso = resolvePesoOpInterna({ peso_op_interna_input: 0.9, prev_breakdown: snapshot })
    expect(peso).toBe(0.9) // input > snapshot
  })

  it('Fonte 2 (snapshot histórico): usa quando input ausente — ADR-003 imutabilidade', () => {
    const snapshot: Partial<TaxBreakdown> = {
      peso_op_interna: 0.85,
    }
    const peso = resolvePesoOpInterna({ prev_breakdown: snapshot as TaxBreakdown })
    expect(peso).toBe(0.85)
  })

  it('Fonte 3 (markup divisor): usa product_config quando input e snapshot ausentes', () => {
    const peso = resolvePesoOpInterna({
      product_config: {
        cost: 100,
        internal_percentuals_sum: 0.5,
        internal_tax_rates_sum: 0.1,
        external_tax_rates_sum: 0.1,
      },
    })
    // Op_Interna = 100 / 0.5 = 200
    // base_externa = 200 × 0.9 = 180
    // Op_Externa = 180 × 0.1 = 18
    // peso = 200 / 218 ≈ 0.9174
    expect(peso).toBeGreaterThan(0.9)
    expect(peso).toBeLessThan(0.92)
  })

  it('Fonte 4 (default conservador): peso = 1 quando todas as fontes ausentes', () => {
    const peso = resolvePesoOpInterna({})
    expect(peso).toBe(1)
  })

  it('Input fora de [0, 1] é clampado (defesa)', () => {
    expect(resolvePesoOpInterna({ peso_op_interna_input: -0.5 })).toBe(0)
    expect(resolvePesoOpInterna({ peso_op_interna_input: 1.5 })).toBe(1)
  })

  it('Snapshot com peso_op_interna=null retorna default 1', () => {
    const snapshot: Partial<TaxBreakdown> = { peso_op_interna: null }
    const peso = resolvePesoOpInterna({ prev_breakdown: snapshot as TaxBreakdown })
    expect(peso).toBe(1)
  })

  it('Snapshot com peso_op_interna=undefined cai para product_config', () => {
    const snapshot: Partial<TaxBreakdown> = {} // sem peso_op_interna
    const peso = resolvePesoOpInterna({
      prev_breakdown: snapshot as TaxBreakdown,
      product_config: {
        cost: 100,
        internal_percentuals_sum: 0.5,
        internal_tax_rates_sum: 0,
        external_tax_rates_sum: 0.2,
      },
    })
    // Op_Interna = 200, Op_Externa = 200 × 1 × 0.2 = 40, peso = 200/240 ≈ 0.833
    expect(peso).toBeGreaterThan(0.83)
    expect(peso).toBeLessThan(0.84)
  })
})

describe('V5-001 — orchestrateReapurationSync injeta peso resolvido no motor', () => {
  it('Sem product_config nem snapshot: motor recebe peso=1 (degrade V4)', () => {
    const result = orchestrateReapurationSync({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      cp: 5000,
      mod: 500,
      dop: 1000,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: [rate('ICMS', 0.17)],
      options: { use_snapshot_rates: false },
    })
    expect(result.peso_op_interna).toBe(1)
    expect(result.ancora_interna).toBeCloseTo(result.rv, 2)
  })

  it('Com product_config: orchestrator calcula peso via markup divisor', () => {
    const result = orchestrateReapurationSync({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      cp: 5000,
      mod: 500,
      dop: 1000,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: [rate('ICMS', 0.17)],
      options: {
        use_snapshot_rates: false,
        product_config: {
          cost: 5000,
          internal_percentuals_sum: 0.5,
          internal_tax_rates_sum: 0.17,
          external_tax_rates_sum: 0.0975, // IBS + CBS
        },
      },
    })
    expect(result.peso_op_interna).not.toBe(1) // calculou via markup
    expect(result.peso_op_interna!).toBeGreaterThan(0.9)
    expect(result.peso_op_interna!).toBeLessThan(1)
  })

  it('Com snapshot prev_breakdown.peso_op_interna: usa valor histórico (ADR-003)', () => {
    const previousBreakdown: Partial<TaxBreakdown> = {
      engine_version: '2.3.0',
      peso_op_interna: 0.85,
      taxes_inside: [],
      taxes_outside: [],
      valid: true,
    }
    const result = orchestrateReapurationSync({
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_REAL',
      cp: 5000,
      mod: 500,
      dop: 1000,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: [rate('ICMS', 0.17)],
      options: {
        use_snapshot_rates: false,
        prev_breakdown: previousBreakdown as TaxBreakdown,
      },
    })
    expect(result.peso_op_interna).toBe(0.85)
  })
})

// ===========================================================================
// Story MRM-V5-004 — aggregateItemTaxCredits (créditos por regime)
// ===========================================================================

describe('V5-004 — aggregateItemTaxCredits', () => {
  it('LR: PIS/COFINS/ICMS são recoverable; IPI é non_recoverable', () => {
    const credits: ItemTaxCreditSnapshot[] = [
      { tax_type: 'PIS', is_active: true, credit_value: 100 },
      { tax_type: 'COFINS', is_active: true, credit_value: 200 },
      { tax_type: 'ICMS', is_active: true, credit_value: 300 },
      { tax_type: 'IPI', is_active: true, credit_value: 50 },
    ]
    const result = aggregateItemTaxCredits(credits, 'LUCRO_REAL')
    expect(result.recoverable).toBe(600) // PIS + COFINS + ICMS
    expect(result.non_recoverable).toBe(50) // IPI
  })

  it('SN: todos forçados a 0 (regime cumulativo absorve via DAS)', () => {
    const credits: ItemTaxCreditSnapshot[] = [
      { tax_type: 'PIS', is_active: true, credit_value: 100 },
      { tax_type: 'ICMS', is_active: true, credit_value: 300 },
    ]
    const result = aggregateItemTaxCredits(credits, 'SIMPLES_NACIONAL')
    expect(result.recoverable).toBe(0)
    expect(result.non_recoverable).toBe(0)
  })

  it('MEI: todos forçados a 0', () => {
    const credits: ItemTaxCreditSnapshot[] = [
      { tax_type: 'PIS', is_active: true, credit_value: 999 },
    ]
    const result = aggregateItemTaxCredits(credits, 'MEI')
    expect(result.recoverable).toBe(0)
    expect(result.non_recoverable).toBe(0)
  })

  it('LP (cumulativo): PIS/COFINS/ICMS non_recoverable', () => {
    const credits: ItemTaxCreditSnapshot[] = [
      { tax_type: 'PIS', is_active: true, credit_value: 100 },
      { tax_type: 'COFINS', is_active: true, credit_value: 200 },
    ]
    const result = aggregateItemTaxCredits(credits, 'LUCRO_PRESUMIDO')
    expect(result.recoverable).toBe(0) // LP cumulativo
    expect(result.non_recoverable).toBe(300)
  })

  it('Créditos inativos são ignorados', () => {
    const credits: ItemTaxCreditSnapshot[] = [
      { tax_type: 'PIS', is_active: false, credit_value: 1000 }, // ignorado
      { tax_type: 'COFINS', is_active: true, credit_value: 200 },
    ]
    const result = aggregateItemTaxCredits(credits, 'LUCRO_REAL')
    expect(result.recoverable).toBe(200) // só COFINS
  })

  it('Créditos com value <= 0 são ignorados', () => {
    const credits: ItemTaxCreditSnapshot[] = [
      { tax_type: 'PIS', is_active: true, credit_value: 0 }, // ignorado
      { tax_type: 'COFINS', is_active: true, credit_value: -100 }, // ignorado
      { tax_type: 'ICMS', is_active: true, credit_value: 50 },
    ]
    const result = aggregateItemTaxCredits(credits, 'LUCRO_REAL')
    expect(result.recoverable).toBe(50)
  })

  it('Lista vazia retorna { 0, 0 }', () => {
    const result = aggregateItemTaxCredits([], 'LUCRO_REAL')
    expect(result.recoverable).toBe(0)
    expect(result.non_recoverable).toBe(0)
  })
})

describe('V5-004 — orchestrateReapurationSync injeta créditos agregados', () => {
  it('Sem item_tax_credits: usa rest.tax_credits direto se fornecido', () => {
    const result = orchestrateReapurationSync({
      rb: 100000,
      desc_value: 0,
      regime: 'LUCRO_REAL',
      cp: 30000,
      mod: 5000,
      dop: 10000,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      tax_credits: { recoverable: 2000, non_recoverable: 0 },
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      options: { use_snapshot_rates: false },
    })
    expect(result.tax_credits_applied?.recoverable).toBe(2000)
  })

  it('Com item_tax_credits: agrega e injeta no motor', () => {
    const result = orchestrateReapurationSync({
      rb: 100000,
      desc_value: 0,
      regime: 'LUCRO_REAL',
      cp: 30000,
      mod: 5000,
      dop: 10000,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.009,
      irpj_pct: 0.015,
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      options: {
        use_snapshot_rates: false,
        item_tax_credits: [
          { tax_type: 'PIS', is_active: true, credit_value: 500 },
          { tax_type: 'COFINS', is_active: true, credit_value: 1500 },
        ],
      },
    })
    expect(result.tax_credits_applied?.recoverable).toBe(2000) // 500 + 1500
  })

  it('Com item_tax_credits + regime SN: agrega para 0 (DAS absorve)', () => {
    const result = orchestrateReapurationSync({
      rb: 100000,
      desc_value: 0,
      regime: 'SIMPLES_NACIONAL',
      cp: 30000,
      mod: 5000,
      dop: 10000,
      commission_pct: 0.05,
      profit_pct: 0.10,
      rates: [rate('ICMS', 0.07)],
      options: {
        use_snapshot_rates: false,
        item_tax_credits: [
          { tax_type: 'PIS', is_active: true, credit_value: 5000 },
          { tax_type: 'ICMS', is_active: true, credit_value: 3000 },
        ],
      },
    })
    expect(result.tax_credits_applied?.recoverable).toBe(0)
    expect(result.tax_credits_applied?.non_recoverable).toBe(0)
  })
})
