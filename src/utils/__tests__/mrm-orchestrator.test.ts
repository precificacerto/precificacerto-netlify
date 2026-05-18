import { orchestrateReapurationSync } from '../mrm-orchestrator'
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
