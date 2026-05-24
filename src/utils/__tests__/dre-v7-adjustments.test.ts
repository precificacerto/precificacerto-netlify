/**
 * Tests dos 3 ajustes da DRE Consolidada solicitados pelo Hyago (2026-05-24):
 *   1. Custos = produto + MOD (MOD migrada de Despesas para Custos)
 *   2. Despesas operacionais sem MOD
 *   3. PIS/COFINS NCM agregado (pis_cofins_pct) lido via buildItemTaxRatesFromProduct
 */

import { computeConsolidatedDRE, type DREItemInput } from '../consolidated-dre'
import { buildItemTaxRatesFromProduct, resolveProductCostTotal, resolveProductLaborTotal } from '../item-tax-rates'

describe('Ajuste #1+#2 — Custos = produto + MOD (movido de despesas)', () => {
  const items: DREItemInput[] = [
    {
      unit_price: 1000,
      quantity: 2,
      cost_total: 300, // R$ 300 por item × 2 = R$ 600 de custo de produto
      commission_percent: 5,
      profit_percent: 10,
      tax_breakdown: null,
    },
  ]

  it('custos.produto = Σ(cost_total × qty) — só produto', () => {
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 2000,
      totalNet: 2000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02,
        administrative_pct: 0.03, mod_pct: 0.117,
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })
    expect(dre.custos.produto).toBe(600) // 300 × 2
  })

  it('custos.mod = receitaLiquida × mod_pct (R$ 234)', () => {
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 2000,
      totalNet: 2000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02,
        administrative_pct: 0.03, mod_pct: 0.117, // 11,7%
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })
    // MOD = 2000 × 0.117 = R$ 234
    expect(dre.custos.mod).toBeCloseTo(234, 2)
  })

  it('custos.total = produto + mod (R$ 600 + R$ 234 = R$ 834)', () => {
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 2000,
      totalNet: 2000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02,
        administrative_pct: 0.03, mod_pct: 0.117,
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })
    expect(dre.custos.total).toBeCloseTo(834, 2)
  })

  it('despesas.mod === 0 (migrado para Custos, retrocompat preservada)', () => {
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 2000,
      totalNet: 2000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02,
        administrative_pct: 0.03, mod_pct: 0.117,
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })
    expect(dre.despesas.mod).toBe(0)
  })

  it('despesas.total NÃO inclui MOD (apenas 4 buckets)', () => {
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 2000,
      totalNet: 2000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02,
        administrative_pct: 0.03, mod_pct: 0.117,
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })
    // 2000 × (0.10 + 0.05 + 0.02 + 0.03) = 2000 × 0.20 = R$ 400
    expect(dre.despesas.total).toBeCloseTo(400, 2)
  })
})

describe('Ajuste #3 — PIS/COFINS NCM agregado (pis_cofins_pct)', () => {
  it('produto com pis_cofins_pct=9.25 → split LR padrão (PIS 1.65 / COFINS 7.60)', () => {
    const prod = { pis_cofins_pct: 9.25 }
    const rates = buildItemTaxRatesFromProduct(prod)
    expect(rates.pis_pct).toBeCloseTo(1.65, 2)
    expect(rates.cofins_pct).toBeCloseTo(7.60, 2)
  })

  it('produto com pis_cofins_pct=3.65 (LP) → split proporcional', () => {
    const prod = { pis_cofins_pct: 3.65 }
    const rates = buildItemTaxRatesFromProduct(prod)
    // 3.65 × (1.65/9.25) ≈ 0.651
    expect(rates.pis_pct).toBeCloseTo(0.651, 2)
    // 3.65 × (7.60/9.25) ≈ 2.999
    expect(rates.cofins_pct).toBeCloseTo(2.999, 2)
  })

  it('produto com pis_pct/cofins_pct separados > 0 → preserva (não usa agregado)', () => {
    const prod = { pis_pct: 1.65, cofins_pct: 7.60, pis_cofins_pct: 999 }
    const rates = buildItemTaxRatesFromProduct(prod)
    expect(rates.pis_pct).toBe(1.65)
    expect(rates.cofins_pct).toBe(7.60)
  })

  it('produto sem PIS/COFINS → null em ambos', () => {
    const prod = {}
    const rates = buildItemTaxRatesFromProduct(prod)
    expect(rates.pis_pct).toBeNull()
    expect(rates.cofins_pct).toBeNull()
  })

  it('produto com pis_pct=0 e pis_cofins_pct=5 → usa agregado (zero não é override)', () => {
    const prod = { pis_pct: 0, cofins_pct: 0, pis_cofins_pct: 5 }
    const rates = buildItemTaxRatesFromProduct(prod)
    // Split: 5 × 1.65/9.25 ≈ 0.892, 5 × 7.60/9.25 ≈ 4.108
    expect(rates.pis_pct).toBeCloseTo(0.892, 2)
    expect(rates.cofins_pct).toBeCloseTo(4.108, 2)
  })

  it('outros campos do produto continuam mapeados (placeholder)', () => {
    const prod = {
      icms_pct: 17,
      iss_pct: 5,
      ipi_pct: 10,
      irpj_pct: 1.8,
      csll_pct: 1.08,
    }
    const rates = buildItemTaxRatesFromProduct(prod)
    expect(rates.icms_pct).toBe(17)
    expect(rates.iss_pct).toBe(5)
    expect(rates.ipi_pct).toBe(10)
    expect(rates.irpj_pct).toBe(1.8)
    expect(rates.csll_pct).toBe(1.08)
  })
})

describe('V8 (ADR-011, 2026-05-24) — resolveProductCostTotal nova cadeia', () => {
  describe('Nível 1 (PRIMÁRIO) — product_items.item_cost_net + total_labor_net', () => {
    it('C1 canônico user: cost_total=0 + product_items + labor_net → R$ 42.645,94', () => {
      const prod = {
        cost_total: 0,
        yield_quantity: 1,
        product_items: [
          { item_cost_net: 39929.94, quantity_needed: 50000 },
        ],
        pricing_calculations: [{ total_labor_net: 2716.00 }],
      }
      // SUM(item_cost_net) = 39929.94 + labor 2716 = 42645.94 / yield 1 = 42645.94
      expect(resolveProductCostTotal(prod)).toBeCloseTo(42645.94, 2)
    })

    it('C3 multi-item: 3 product_items somados', () => {
      const prod = {
        cost_total: 0,
        yield_quantity: 1,
        product_items: [
          { item_cost_net: 100, quantity_needed: 10 },
          { item_cost_net: 200, quantity_needed: 5 },
          { item_cost_net: 50, quantity_needed: 2 },
        ],
        pricing_calculations: [{ total_labor_net: 0 }],
      }
      expect(resolveProductCostTotal(prod)).toBeCloseTo(350, 2)
    })

    it('C4 yield_quantity=50: custo dividido', () => {
      const prod = {
        cost_total: 0,
        yield_quantity: 50,
        product_items: [{ item_cost_net: 39929.94 }],
        pricing_calculations: [{ total_labor_net: 2716.00 }],
      }
      // (39929.94 + 2716) / 50 = 852.92 por unidade
      expect(resolveProductCostTotal(prod)).toBeCloseTo(852.92, 2)
    })

    it('Nível 1 prevalece mesmo com cost_total > 0 (product_items é fonte de verdade)', () => {
      const prod = {
        cost_total: 999,
        yield_quantity: 1,
        product_items: [{ item_cost_net: 100 }],
        pricing_calculations: [{ total_labor_net: 50 }],
      }
      // ADR-011: product_items é Nível 1, prevalece sobre cost_total
      expect(resolveProductCostTotal(prod)).toBe(150)
    })
  })

  describe('Nível 2 — cost_total quando product_items vazio', () => {
    it('C2 produto moderno: cost_total > 0 e sem product_items', () => {
      const prod = { cost_total: 100, pricing_calculations: [{ cmv: 999 }] }
      expect(resolveProductCostTotal(prod)).toBe(100)
    })

    it('product_items existe mas item_cost_net=null → usa cost_total', () => {
      const prod = {
        cost_total: 100,
        product_items: [{ item_cost_net: null, quantity_needed: 10 }],
      }
      expect(resolveProductCostTotal(prod)).toBe(100)
    })

    it('product_items array vazio → usa cost_total', () => {
      const prod = { cost_total: 100, product_items: [] }
      expect(resolveProductCostTotal(prod)).toBe(100)
    })
  })

  describe('Nível 3 — pricing.cmv como fallback', () => {
    it('cost_total=0 + product_items=0 + cmv=50 → R$ 50', () => {
      const prod = {
        cost_total: 0,
        product_items: [],
        pricing_calculations: [{ cmv: 50 }],
      }
      expect(resolveProductCostTotal(prod)).toBe(50)
    })
  })

  describe('Nível 4 — material+labor agregado', () => {
    it('cost_total=0 + cmv=0 + product_items vazio → soma material+labor / yield', () => {
      const prod = {
        cost_total: 0,
        product_items: [],
        yield_quantity: 50000,
        pricing_calculations: [{
          cmv: null,
          total_material_cost_net: 39929.94,
          total_labor_net: 2716.00,
        }],
      }
      expect(resolveProductCostTotal(prod)).toBeCloseTo(0.85292, 3)
    })
  })

  describe('Nível 5 / edge cases', () => {
    it('C5 sem nenhum dado → R$ 0', () => {
      expect(resolveProductCostTotal({})).toBe(0)
      expect(resolveProductCostTotal({ cost_total: null })).toBe(0)
    })

    it('pricing_calculations como objeto (não array)', () => {
      const prod = { cost_total: 0, product_items: [], pricing_calculations: { cmv: 42 } }
      expect(resolveProductCostTotal(prod)).toBe(42)
    })

    it('yield_quantity=0 → clamp em 1 (defesa contra divisão por zero)', () => {
      const prod = {
        cost_total: 0,
        yield_quantity: 0, // tentativa de bug
        product_items: [{ item_cost_net: 100 }],
        pricing_calculations: [{ total_labor_net: 50 }],
      }
      // Math.max(1, 0) = 1 → 150 / 1 = 150
      expect(resolveProductCostTotal(prod)).toBe(150)
    })

    it('yield_quantity=null → clamp em 1', () => {
      const prod = {
        cost_total: 0,
        yield_quantity: null,
        product_items: [{ item_cost_net: 100 }],
        pricing_calculations: [{ total_labor_net: 50 }],
      }
      expect(resolveProductCostTotal(prod)).toBe(150)
    })

    it('yield_quantity negativo → clamp em 1', () => {
      const prod = {
        cost_total: 0,
        yield_quantity: -5,
        product_items: [{ item_cost_net: 100 }],
        pricing_calculations: [{ total_labor_net: 50 }],
      }
      expect(resolveProductCostTotal(prod)).toBe(150)
    })
  })
})

describe('V8.1 (2026-05-24) — resolveProductLaborTotal e MOD do produto na DRE', () => {
  it('resolveProductLaborTotal retorna labor_net / yield_quantity', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ total_labor_net: 2716.00 }],
    }
    expect(resolveProductLaborTotal(prod)).toBeCloseTo(2716, 2)
  })

  it('resolveProductLaborTotal retorna 0 quando pricing_calculations vazia', () => {
    expect(resolveProductLaborTotal({})).toBe(0)
    expect(resolveProductLaborTotal({ pricing_calculations: [] })).toBe(0)
  })

  it('resolveProductLaborTotal divide por yield_quantity > 1', () => {
    const prod = {
      yield_quantity: 50,
      pricing_calculations: [{ total_labor_net: 1000 }],
    }
    expect(resolveProductLaborTotal(prod)).toBe(20)
  })

  it('cenário canônico user: DRE separa Custo (R$ 39.929,94) e MOD (R$ 2.716,00)', () => {
    const dreItems: DREItemInput[] = [{
      unit_price: 141106.60,
      quantity: 1,
      cost_total: 42645.94,            // material + labor (vem do resolveProductCostTotal)
      productive_labor_unit: 2716.00,  // labor isolado (vem do resolveProductLaborTotal)
      commission_percent: 5,
      profit_percent: 10,
      tax_breakdown: null,
    }]
    const dre = computeConsolidatedDRE({
      items: dreItems,
      totalGross: 141106.60,
      totalNet: 141106.60,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02,
        administrative_pct: 0.03, mod_pct: 0.117, // tenant pct — NÃO deve ser usado
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })

    expect(dre.custos.produto).toBeCloseTo(39929.94, 2)  // material puro
    expect(dre.custos.mod).toBeCloseTo(2716.00, 2)       // MO produtiva do produto
    expect(dre.custos.total).toBeCloseTo(42645.94, 2)    // total
  })

  it('fallback legacy: quando productive_labor_unit ausente, MOD usa tenant pct', () => {
    const dreItems: DREItemInput[] = [{
      unit_price: 1000,
      quantity: 1,
      cost_total: 500,
      // SEM productive_labor_unit (produto antigo)
      commission_percent: 5,
      profit_percent: 10,
      tax_breakdown: null,
    }]
    const dre = computeConsolidatedDRE({
      items: dreItems,
      totalGross: 1000,
      totalNet: 1000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0, variable_pct: 0, financial_pct: 0,
        administrative_pct: 0, mod_pct: 0.10, // 10% tenant
      },
      tenantTaxRates: { irpj: 0, csll: 0 },
    })

    expect(dre.custos.produto).toBe(500) // cost_total inteiro (nada para subtrair)
    expect(dre.custos.mod).toBe(100)     // 1000 × 10% (fallback tenant)
    expect(dre.custos.total).toBe(600)
  })
})
