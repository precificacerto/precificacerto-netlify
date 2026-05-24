/**
 * Tests de integração do "Motor de Desconto" — Epic MRM-V6 + bug fixes 2026-05-23/24.
 *
 * Cobre 3 fixes consecutivos reportados pelo Hyago:
 *   1. CSLL/IRPJ do produto com 0 explícito → fallback tenant (item-tax-rates.ts)
 *   2. Percentuais 0..100 → decimal 0..1 ao ler do banco (use-tenant-tax-context,
 *      mrm-rates-loader, item-tax-rates)
 *   3. MOD/DOP proporcionais à RECEITA pós-desconto (orcamentos/vendas)
 *
 * Cenário canônico reproduzindo a tela do user:
 *   - Produto R$ 104.113,02 sem custo cadastrado
 *   - commission_percent=5, profit_percent=10
 *   - tenant CSLL=1.08%, IRPJ=1.80%
 *   - dop_pct ≈ 70.27%, mod_pct ≈ 11.68%
 *   - ICMS 17%
 *   - Sem desconto: RRO ≈ R$ 1.093 ✓
 *   - Com 5% desconto: RRO ≈ R$ 1.019 (era R$ 0 antes do fix MOD/DOP)
 */

import { calculateMarginReapuration } from '../margin-reapuration'
import { resolveItemCsllPct, resolveItemIrpjPct, mergeItemAndTenantRates } from '../item-tax-rates'
import type { TaxRatePeriod } from '@/types/mrm'

function rate(t: TaxRatePeriod['tax_type'], pct: number): TaxRatePeriod {
  return {
    id: t, tenant_id: 't', tax_type: t, origin_state: null, dest_state: null,
    rate_pct: pct, valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

describe('FIX #1 (32c38f1): CSLL/IRPJ produto=0 → fallback tenant', () => {
  it('csll_pct=0 no item → usa tenant_csll', () => {
    expect(resolveItemCsllPct({ csll_pct: 0 }, 0.0108)).toBe(0.0108)
  })
  it('irpj_pct=0 no item → usa tenant_irpj', () => {
    expect(resolveItemIrpjPct({ irpj_pct: 0 }, 0.018)).toBe(0.018)
  })
  it('csll_pct > 0 explícito ainda funciona como override', () => {
    expect(resolveItemCsllPct({ csll_pct: 0.025 }, 0.0108)).toBe(0.025)
  })
  it('null/undefined cai em fallback', () => {
    expect(resolveItemCsllPct(null, 0.0108)).toBe(0.0108)
    expect(resolveItemIrpjPct(undefined, 0.018)).toBe(0.018)
  })
})

describe('FIX #2 (4791b94): normalização ICMS 17 → 0.17 em mergeItemAndTenantRates', () => {
  it('item override em formato porcentual (17) → normaliza para decimal (0.17)', () => {
    const result = mergeItemAndTenantRates({ icms_pct: 17 } as any, [])
    const icms = result.find(r => r.tax_type === 'ICMS')
    expect(icms?.rate_pct).toBe(0.17)
  })
  it('item override já em decimal (0.18) → preserva', () => {
    const result = mergeItemAndTenantRates({ icms_pct: 0.18 } as any, [])
    const icms = result.find(r => r.tax_type === 'ICMS')
    expect(icms?.rate_pct).toBe(0.18)
  })
})

describe('FIX #3 (38f99e5): Motor com cenário REAL do user — MOD/DOP escalando com desconto', () => {
  // Reproduz o caller (orcamentos/vendas) após fix:
  //   rvItem = itemBase × (1 − desconto)
  //   modItem = rvItem × mod_pct
  //   dopItem = rvItem × dop_pct
  function callerCalculation(opts: {
    rb: number
    discountPct: number
    commission_pct: number
    profit_pct: number
    csll_pct: number
    irpj_pct: number
    mod_pct: number
    dop_pct: number
    icms: number
  }) {
    const rvItem = opts.rb - opts.rb * (opts.discountPct / 100)
    const modItem = rvItem * opts.mod_pct
    const dopItem = rvItem * opts.dop_pct
    return calculateMarginReapuration({
      rb: opts.rb,
      desc_value: opts.rb * (opts.discountPct / 100),
      regime: 'LUCRO_PRESUMIDO',
      rates: [rate('ICMS', opts.icms)],
      cp: 0,
      mod: modItem,
      dop: dopItem,
      commission_pct: opts.commission_pct,
      profit_pct: opts.profit_pct,
      csll_pct: opts.csll_pct,
      irpj_pct: opts.irpj_pct,
      discount_mode: 'PROPORTIONAL',
      effective_date: '2026-05-24',
      use_snapshot_rates: false,
    })
  }

  const baseInputs = {
    rb: 104113.02,
    commission_pct: 0.05,
    profit_pct: 0.10,
    csll_pct: 0.0108,
    irpj_pct: 0.018,
    mod_pct: 0.1168,  // 11,68% real do user
    dop_pct: 0.7027,  // 70,27% real do user
    icms: 0.17,
  }

  it('SEM desconto: RRO ≈ R$ 1.093 (positivo) e distribuição rateada', () => {
    const r = callerCalculation({ ...baseInputs, discountPct: 0 })
    expect(r.status).toBe('VALID')
    expect(r.rro).toBeGreaterThan(1000)
    expect(r.rro).toBeLessThan(2500) // próximo dos R$ 1.093 reportados pelo user
    expect(r.new_commission).toBeGreaterThan(0)
    expect(r.new_profit).toBeGreaterThan(0)
    expect(r.new_csll).toBeGreaterThan(0)
    expect(r.new_irpj).toBeGreaterThan(0)
  })

  it('COM 5% desconto: RRO continua POSITIVO (não zera com o fix)', () => {
    const r = callerCalculation({ ...baseInputs, discountPct: 5 })
    expect(r.status).toBe('VALID')
    expect(r.rro).toBeGreaterThan(0)
    expect(r.new_commission).toBeGreaterThan(0)
    expect(r.new_profit).toBeGreaterThan(0)
    expect(r.new_csll).toBeGreaterThan(0)
    expect(r.new_irpj).toBeGreaterThan(0)
  })

  it('REGRESSÃO: cálculo SEM o fix (modItem usando RB) → RRO negativo (estado bugado)', () => {
    // Simula o cálculo antigo: MOD/DOP sobre RB (sem desconto)
    const opts = { ...baseInputs, discountPct: 5 }
    const modItem = opts.rb * opts.mod_pct  // ← BUG: usa RB
    const dopItem = opts.rb * opts.dop_pct  // ← BUG: usa RB
    const r = calculateMarginReapuration({
      rb: opts.rb,
      desc_value: opts.rb * (opts.discountPct / 100),
      regime: 'LUCRO_PRESUMIDO',
      rates: [rate('ICMS', opts.icms)],
      cp: 0,
      mod: modItem,
      dop: dopItem,
      commission_pct: opts.commission_pct,
      profit_pct: opts.profit_pct,
      csll_pct: opts.csll_pct,
      irpj_pct: opts.irpj_pct,
      discount_mode: 'PROPORTIONAL',
      effective_date: '2026-05-24',
      use_snapshot_rates: false,
    })
    // Com bug: RRO vira negativo (motor zera distribuição) — comportamento que o user viu
    expect(r.rro).toBeLessThan(0)
    expect(r.status).toBe('RRO_NEGATIVE')
    expect(r.new_commission).toBe(0)
    expect(r.new_profit).toBe(0)
  })

  it('SEM e COM 5% desconto: distribuição proporcional preserva pesos relativos', () => {
    const semDesc = callerCalculation({ ...baseInputs, discountPct: 0 })
    const comDesc = callerCalculation({ ...baseInputs, discountPct: 5 })

    // Razão commission/lucro deve manter ≈ 5/10 = 0.5 nos 2 cenários (PROPORTIONAL)
    const ratioSem = semDesc.new_commission / semDesc.new_profit
    const ratioCom = comDesc.new_commission / comDesc.new_profit
    expect(ratioSem).toBeCloseTo(0.5, 1)
    expect(ratioCom).toBeCloseTo(0.5, 1)
  })

  it('3 modos de desconto continuam funcionando após fix MOD/DOP', () => {
    const proporcional = callerCalculation({ ...baseInputs, discountPct: 5 })
    const proporcionalMode = calculateMarginReapuration({
      rb: baseInputs.rb,
      desc_value: baseInputs.rb * 0.05,
      regime: 'LUCRO_PRESUMIDO',
      rates: [rate('ICMS', baseInputs.icms)],
      cp: 0,
      mod: (baseInputs.rb * 0.95) * baseInputs.mod_pct,
      dop: (baseInputs.rb * 0.95) * baseInputs.dop_pct,
      commission_pct: baseInputs.commission_pct,
      profit_pct: baseInputs.profit_pct,
      csll_pct: baseInputs.csll_pct,
      irpj_pct: baseInputs.irpj_pct,
      discount_mode: 'SELLER_REDUCTION',
      effective_date: '2026-05-24',
      use_snapshot_rates: false,
    })
    // SELLER zera lucro; PROPORTIONAL não
    expect(proporcional.new_profit).toBeGreaterThan(0)
    expect(proporcionalMode.new_profit).toBe(0)
    expect(proporcionalMode.new_commission).toBeGreaterThan(0)
    // Invariante tributária: impostos idênticos entre modos
    expect(proporcionalMode.imp_total).toBeCloseTo(proporcional.imp_total, 2)
    expect(proporcionalMode.rro).toBeCloseTo(proporcional.rro, 2)
  })
})
