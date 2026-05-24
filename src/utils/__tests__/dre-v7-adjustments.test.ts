/**
 * Tests dos 3 ajustes da DRE Consolidada solicitados pelo Hyago (2026-05-24):
 *   1. Custos = produto + MOD (MOD migrada de Despesas para Custos)
 *   2. Despesas operacionais sem MOD
 *   3. PIS/COFINS NCM agregado (pis_cofins_pct) lido via buildItemTaxRatesFromProduct
 */

import { computeConsolidatedDRE, type DREItemInput } from '../consolidated-dre'
import { buildItemTaxRatesFromProduct } from '../item-tax-rates'

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

  it('outros campos do produto continuam mapeados', () => {
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
