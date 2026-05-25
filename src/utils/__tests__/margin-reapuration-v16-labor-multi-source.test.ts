/**
 * Tests V16 (Founder 2026-05-25) — Labor resolver com 5 fontes.
 *
 * Garante que MO produtiva é somada ao CMV mesmo quando o pipeline de cadastro
 * salva em campo diferente do esperado (variações comuns no app).
 *
 * Cenário Founder: Ferragens R$ 79.859,88 + MO 25000min (R$ 13.579,98) salvos
 * em `pricing_calculations.product_workload_price` → cmv_unit deve dar R$ 93.439,86.
 */

import { resolveProductExpenseBreakdown } from '../item-tax-rates'

describe('V16 — Labor resolver: 5 fontes em precedência', () => {
  // 1. total_labor_net (preferencial spec V8.8)
  it('Fonte 1: total_labor_net → soma com material_net', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ total_material_cost_net: 100, total_labor_net: 50 }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBe(150)
  })

  // 2. product_workload_price (cadastro com minutos — CENÁRIO FOUNDER 2026-05-25)
  it('Fonte 2: product_workload_price → CENÁRIO FERRAGENS R$ 93.439,86', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{
        total_material_cost_net: 79859.88,
        product_workload_price: 13579.98,
        // total_labor_net NÃO populado
      }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBeCloseTo(93439.86, 2)
  })

  // 3. total_labor_gross (fallback gross)
  it('Fonte 3: total_labor_gross → soma quando net ausente', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ total_material_cost_net: 100, total_labor_gross: 60 }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBe(160)
  })

  // 4. labor_costs[] (tabela dedicada V8.3)
  it('Fonte 4: labor_costs[].net_value → soma com material', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ total_material_cost_net: 167.71 }],
      labor_costs: [{ net_value: 200 }, { net_value: 343.20 }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBeCloseTo(167.71 + 543.20, 2)
  })

  it('Fonte 4 (variante): labor_costs[].gross_value quando net=0', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ total_material_cost_net: 100 }],
      labor_costs: [{ net_value: 0, gross_value: 50 }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBe(150)
  })

  // 5. products.productive_labor_total (V15.1)
  it('Fonte 5: products.productive_labor_total → último fallback', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ total_material_cost_net: 167.71 }],
      productive_labor_total: 543.20,
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBeCloseTo(710.91, 2)
  })

  // Precedência
  it('Precedência: total_labor_net vence product_workload_price', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{
        total_material_cost_net: 100,
        total_labor_net: 50,
        product_workload_price: 999,  // ← ignorado pois total_labor_net presente
      }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBe(150)
  })

  it('Precedência: product_workload_price vence total_labor_gross', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{
        total_material_cost_net: 100,
        product_workload_price: 50,
        total_labor_gross: 999,
      }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBe(150)
  })

  it('Precedência: labor_costs vence productive_labor_total', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ total_material_cost_net: 100 }],
      labor_costs: [{ net_value: 50 }],
      productive_labor_total: 999,  // ← ignorado pois labor_costs presente
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBe(150)
  })

  // Material via cost_total fallback
  it('Material fallback: usa products.cost_total quando pricing.total_material_cost_net ausente', () => {
    const prod = {
      yield_quantity: 1,
      cost_total: 167.71,
      pricing_calculations: [{ total_labor_net: 543.20, val_indirect_labor: 100 }],
    }
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBeCloseTo(710.91, 2)
  })

  // Yield > 1
  it('Divide labor por yield_quantity quando > 1', () => {
    const prod = {
      yield_quantity: 2,
      pricing_calculations: [{ total_material_cost_net: 200, product_workload_price: 100 }],
    }
    // material/yield + labor/yield = 100 + 50 = 150
    expect(resolveProductExpenseBreakdown(prod)?.cmv_unit).toBe(150)
  })
})
