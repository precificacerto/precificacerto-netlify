/**
 * Tests Legacy Adapter V17 — EPIC-MRM-V17 (2026-05-28)
 *
 * Valida que o adapter:
 *   1. Mantém shape compatível com V16 (motorResultsByItem)
 *   2. Distribui valores consolidados proporcional ao RB de cada item
 *   3. Retorna null para items inválidos (preserva contract V16)
 *   4. Soma dos rateios = valor consolidado original
 *   5. Marker _v17_adapter está presente
 */

import {
  calculateMotorV17ForPage,
  calculateMotorV17ForPageFull,
  type PageBuildArgs,
} from '../mrm-engine-v17/legacy-adapter'
import type { TaxRatePeriod } from '@/types/mrm'

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

describe('Legacy Adapter V17 — Compatibilidade V16', () => {
  const baseArgs: PageBuildArgs = {
    items: [
      { unit_price: 1000, quantity: 1, cost_total: 400, productive_labor_unit: 50, commission_percent: 5, profit_percent: 15 },
      { unit_price: 2000, quantity: 1, cost_total: 800, productive_labor_unit: 100, commission_percent: 5, profit_percent: 15 },
    ],
    tenantCtx: {
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      csll_pct: 0.008,
      irpj_pct: 0.016,
      dop_pct: 0.10,
      absorption_policy: 'RRO_PROPORTIONAL',
    },
    globalDiscountPercent: 10,
  }

  it('Retorna array com mesmo length de items', () => {
    const result = calculateMotorV17ForPage(baseArgs)
    expect(result).toHaveLength(2)
  })

  it('Marker _v17_adapter presente em todos os items válidos', () => {
    const result = calculateMotorV17ForPage(baseArgs)
    expect(result[0]?._v17_adapter).toBe(true)
    expect(result[1]?._v17_adapter).toBe(true)
  })

  it('engine_version = 3.0.0', () => {
    const result = calculateMotorV17ForPage(baseArgs)
    expect(result[0]?.engine_version).toBe('3.0.0')
  })

  it('Rateio proporcional ao RB: item de 2000 recebe 2x mais que item de 1000', () => {
    const result = calculateMotorV17ForPage(baseArgs)
    const item1 = result[0]
    const item2 = result[1]
    if (item1 && item2 && item1.new_profit !== 0) {
      const ratio = item2.new_profit / item1.new_profit
      expect(ratio).toBeCloseTo(2, 1) // 2000/1000 = 2
    }
  })

  it('Items com unit_price=0 retornam null', () => {
    const args: PageBuildArgs = {
      ...baseArgs,
      items: [
        { unit_price: 0, quantity: 1, commission_percent: 5, profit_percent: 15 },
        { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 15 },
      ],
    }
    const result = calculateMotorV17ForPage(args)
    expect(result[0]).toBeNull()
    expect(result[1]).not.toBeNull()
  })

  it('Items vazios retorna array vazio', () => {
    const result = calculateMotorV17ForPage({ ...baseArgs, items: [] })
    expect(result).toEqual([])
  })

  it('Cascade_trace consolidado é mesmo para todos os items (V17 princípio)', () => {
    const result = calculateMotorV17ForPage(baseArgs)
    expect(result[0]?.cascade_trace).toEqual(result[1]?.cascade_trace)
  })

  it('cascade_trace tem 17 etapas', () => {
    const result = calculateMotorV17ForPage(baseArgs)
    expect(result[0]?.cascade_trace).toHaveLength(17)
  })

  it('Soma dos rateios = valor consolidado (invariante de conservação)', () => {
    const { per_item, consolidated } = calculateMotorV17ForPageFull(baseArgs)
    const validResults = per_item.filter((r): r is NonNullable<typeof r> => r !== null)
    const soma_commission = validResults.reduce((s, r) => s + r.new_commission, 0)
    const soma_profit = validResults.reduce((s, r) => s + r.new_profit, 0)
    expect(soma_commission).toBeCloseTo(consolidated.distribution.new_commission, 2)
    expect(soma_profit).toBeCloseTo(consolidated.distribution.new_profit, 2)
  })

  it('Status RRO_NEGATIVE propaga via adapter quando desconto grande', () => {
    const args: PageBuildArgs = {
      ...baseArgs,
      globalDiscountPercent: 95,
    }
    const result = calculateMotorV17ForPage(args)
    expect(['RRO_NEGATIVE', 'RRO_ZERO']).toContain(result[0]?.status)
  })

  it('Adapter aceita absorption_policy COMMISSION_PROTECTED', () => {
    const args: PageBuildArgs = {
      ...baseArgs,
      tenantCtx: { ...baseArgs.tenantCtx, absorption_policy: 'COMMISSION_PROTECTED' },
    }
    const result = calculateMotorV17ForPage(args)
    expect(result[0]?._v17_adapter).toBe(true)
  })
})

describe('Legacy Adapter V17 — calculateMotorV17ForPageFull', () => {
  const args: PageBuildArgs = {
    items: [
      { unit_price: 5000, quantity: 1, cost_total: 2000, commission_percent: 5, profit_percent: 15 },
    ],
    tenantCtx: {
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17)],
      csll_pct: 0.008,
      irpj_pct: 0.016,
      dop_pct: 0.10,
    },
    globalDiscountPercent: 10,
  }

  it('Retorna per_item + consolidated', () => {
    const result = calculateMotorV17ForPageFull(args)
    expect(result.per_item).toHaveLength(1)
    expect(result.consolidated).toBeDefined()
    expect(result.consolidated.engine_version).toBe('3.0.0')
  })

  it('Consolidated tem 17 etapas no cascade', () => {
    const result = calculateMotorV17ForPageFull(args)
    expect(result.consolidated.motor.cascade_trace).toHaveLength(17)
  })

  it('Items vazios retorna estrutura zerada sem throw', () => {
    const result = calculateMotorV17ForPageFull({ ...args, items: [] })
    expect(result.consolidated.consolidated.items_count).toBe(0)
    expect(result.consolidated.status).toBe('PENDING')
  })
})
