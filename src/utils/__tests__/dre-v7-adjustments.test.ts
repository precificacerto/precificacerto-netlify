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

  it('V8.2: custos.mod = 0 quando items não têm productive_labor_unit (sem fallback tenant)', () => {
    const dre = computeConsolidatedDRE({
      items, // sem productive_labor_unit
      totalGross: 2000,
      totalNet: 2000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02,
        administrative_pct: 0.03, mod_pct: 0.117,
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })
    expect(dre.custos.mod).toBe(0)
  })

  it('V8.2: custos.total = produto apenas (sem MOD do tenant)', () => {
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
    expect(dre.custos.total).toBe(600) // só cost_total (sem MOD)
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
  // FIX 2026-05-29 (Hyago — produto "Obra JJCR" 4,325%): o split agora normaliza
  // o agregado para DECIMAL antes de proporcionar, evitando que a parcela PIS de
  // alíquotas reduzidas (< ~5,6%) caia abaixo de 1 e seja lida como 77% pelo
  // normalizePct downstream. Saída do split é DECIMAL (0.0165 = 1,65%).
  it('produto com pis_cofins_pct=9.25 → split LR padrão (PIS 1,65% / COFINS 7,60% em decimal)', () => {
    const prod = { pis_cofins_pct: 9.25 }
    const rates = buildItemTaxRatesFromProduct(prod)
    // 0.0925 × (1.65/9.25) = 0.0165 ; 0.0925 × (7.60/9.25) = 0.076
    expect(rates.pis_pct).toBeCloseTo(0.0165, 4)
    expect(rates.cofins_pct).toBeCloseTo(0.076, 4)
  })

  it('produto com pis_cofins_pct=3.65 (LP) → split proporcional em decimal', () => {
    const prod = { pis_cofins_pct: 3.65 }
    const rates = buildItemTaxRatesFromProduct(prod)
    // 0.0365 × (1.65/9.25) ≈ 0.006511
    expect(rates.pis_pct).toBeCloseTo(0.006511, 5)
    // 0.0365 × (7.60/9.25) ≈ 0.029989
    expect(rates.cofins_pct).toBeCloseTo(0.029989, 5)
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
    // Split em decimal: 0.05 × 1.65/9.25 ≈ 0.008919, 0.05 × 7.60/9.25 ≈ 0.041081
    expect(rates.pis_pct).toBeCloseTo(0.008919, 5)
    expect(rates.cofins_pct).toBeCloseTo(0.041081, 5)
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
    it('C2 produto moderno: V8.8 cmv prevalece sobre cost_total', () => {
      // V8.8 inverteu prioridade: cmv (canônico do cadastro) prevalece sobre cost_total
      const prod = { cost_total: 100, pricing_calculations: [{ cmv: 999 }] }
      expect(resolveProductCostTotal(prod)).toBe(999)
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

  it('V8.8 cenário canônico: Custo do produto = CMV TOTAL (R$ 42.645,94) sem MOD separada', () => {
    const dreItems: DREItemInput[] = [{
      unit_price: 141106.60,
      quantity: 1,
      cost_total: 42645.94, // CMV TOTAL (material + MO produtiva — vem de pricing_calculations.cmv)
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
        administrative_pct: 0.03, mod_pct: 0.117, // tenant pct NÃO deve ser usado
      },
      tenantTaxRates: { irpj: 0.018, csll: 0.0108 },
    })

    expect(dre.custos.produto).toBeCloseTo(42645.94, 2)  // CMV total
    expect(dre.custos.mod).toBe(0)                       // V8.8: linha removida
    expect(dre.custos.total).toBeCloseTo(42645.94, 2)    // = produto (sem somar MOD)
  })

  it('PC-BUG-CMV-ETAPA4-004: CMV vivo (product_items + MO) prevalece sobre snapshot cmv stale', () => {
    // REVERTE a precedência V8.8 (PO Cristiano 2026-06-30): o snapshot pricing_calculations.cmv
    // fica STALE após save/reopen do produto/orçamento; a Etapa 4 deve somar o CMV recalculado
    // do cadastro VIVO, nunca o snapshot serializado.
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ cmv: 42645.94 }], // snapshot STALE — deve ser ignorado
      product_items: [{ item_cost_net: 999 }],   // material vivo
      labor_costs: [{ net_value: 999 }],         // MO produtiva viva
    }
    // Nível 1 vivo: SUM(item_cost_net) 999 + MO produtiva 999 = 1998
    expect(resolveProductCostTotal(prod)).toBeCloseTo(1998, 2)
  })

  it('PC-BUG-CMV-ETAPA4-004: Etapa 4 = Σ CMV vivo dos 3 produtos = R$ 141.172,85 (tolerância ZERO)', () => {
    // Caso de regressão oficial do relatório (30/06/2026). Cada produto tem seu snapshot cmv
    // stale/divergente, mas o CMV vivo (product_items + MO) é a fonte de verdade.
    // Produto 1: 55.901,92 | Produto 2: 39.929,94 | Produto 3: 45.340,99 → Σ = 141.172,85
    const p1 = { yield_quantity: 1, product_items: [{ item_cost_net: 55901.92 }], pricing_calculations: [{ cmv: 60000 }] }
    const p2 = { yield_quantity: 1, product_items: [{ item_cost_net: 39929.94 }], pricing_calculations: [{ cmv: 41000 }] }
    const p3 = { yield_quantity: 1, product_items: [{ item_cost_net: 45340.99 }], pricing_calculations: [{ cmv: 46638.46 }] }
    const etapa4 =
      resolveProductCostTotal(p1) + resolveProductCostTotal(p2) + resolveProductCostTotal(p3)
    expect(etapa4).toBeCloseTo(141172.85, 2)
    // Tolerância ZERO: diferença para a soma direta deve ser exatamente R$ 0,00
    expect(Math.abs(etapa4 - (55901.92 + 39929.94 + 45340.99))).toBeLessThan(0.005)
  })

  it('V8.2: quando productive_labor_unit=0, MOD = 0 (SEM fallback tenant)', () => {
    const dreItems: DREItemInput[] = [{
      unit_price: 1000,
      quantity: 1,
      cost_total: 500,
      // SEM productive_labor_unit (produto sem MO produtiva cadastrada)
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
        administrative_pct: 0, mod_pct: 0.10, // tenant mod_pct NÃO deve ser usado
      },
      tenantTaxRates: { irpj: 0, csll: 0 },
    })

    expect(dre.custos.produto).toBe(500) // cost_total inteiro
    expect(dre.custos.mod).toBe(0)       // SEM MO produtiva no produto = 0
    expect(dre.custos.total).toBe(500)   // só custo do produto
  })

  it('V8.3: resolveProductLaborTotal usa labor_costs primeiro (cenário user)', () => {
    const prod = {
      yield_quantity: 1,
      labor_costs: [{ net_value: 2716.00, labor_type: 'PROPRIA' }],
      pricing_calculations: [], // pricing vazio
    }
    expect(resolveProductLaborTotal(prod)).toBeCloseTo(2716, 2)
  })

  it('V8.3: labor_costs com múltiplas entradas → soma', () => {
    const prod = {
      yield_quantity: 1,
      labor_costs: [
        { net_value: 1000, labor_type: 'PROPRIA' },
        { net_value: 500, labor_type: 'TERCEIRIZADA' },
      ],
      pricing_calculations: [],
    }
    expect(resolveProductLaborTotal(prod)).toBe(1500)
  })

  it('V8.7: usa productive_value_per_minute DIRETO (preferencial)', () => {
    // Cenário canônico: 5000min × R$ 0,5432/min = R$ 2.716,00
    const prod = {
      yield_quantity: 1,
      labor_costs: [],
      pricing_calculations: [
        { product_workload: 5000, product_workload_price: 0 },
      ],
    }
    const tenantCtx = {
      production_labor_cost: 0, // fallback nem usado
      monthly_workload_minutes: 0,
      productive_value_per_minute: 0.5432, // valor direto do banco
    }
    expect(resolveProductLaborTotal(prod, tenantCtx)).toBeCloseTo(2716, 2)
  })

  it('V8.6: cálculo RUNTIME usando tenant context quando pricing vazia', () => {
    // Cenário canônico user: 5000min × (cost_per_min) = R$ 2.716,00
    const prod = {
      yield_quantity: 1,
      labor_costs: [],
      pricing_calculations: [
        { product_workload: 5000, product_workload_price: 0, total_labor_net: 0 },
      ],
    }
    const tenantCtx = {
      production_labor_cost: 8691.2, // R$/mês (8691.2 / 16000 = 0.5432)
      monthly_workload_minutes: 16000, // min/mês
    }
    // 5000 × 0.5432 = R$ 2.716,00 (cenário canônico user)
    expect(resolveProductLaborTotal(prod, tenantCtx)).toBeCloseTo(2716, 2)
  })

  it('V8.6: runtime NÃO calcula se tenant.monthly_workload_minutes=0', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{ product_workload: 5000 }],
    }
    expect(resolveProductLaborTotal(prod, { production_labor_cost: 1000, monthly_workload_minutes: 0 })).toBe(0)
  })

  it('V8.4: pricing_calculations com múltiplas linhas → itera buscando a com labor', () => {
    // Cenário real: produto tem 3 pricing_calculations (regimes diferentes).
    // Primeiro [0] pode ser regime sem labor; iterar até achar uma com valor.
    const prod = {
      yield_quantity: 1,
      labor_costs: [],
      pricing_calculations: [
        { product_workload_price: 0, tax_regime: 'MEI' },      // sem labor
        { product_workload_price: 2716.00, tax_regime: 'LUCRO_REAL' }, // com labor
        { product_workload_price: 0, tax_regime: 'SIMPLES' },  // sem labor
      ],
    }
    expect(resolveProductLaborTotal(prod)).toBeCloseTo(2716, 2)
  })

  it('V8.3: labor_costs vazio → fallback para product_workload_price', () => {
    const prod = {
      yield_quantity: 1,
      labor_costs: [],
      pricing_calculations: [{ product_workload_price: 800 }],
    }
    expect(resolveProductLaborTotal(prod)).toBe(800)
  })

  it('V8.2: resolveProductLaborTotal usa product_workload_price primeiro', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{
        product_workload_price: 2716.00,
        total_labor_net: 9999, // não deve ser usado pois product_workload_price tem prioridade
      }],
    }
    expect(resolveProductLaborTotal(prod)).toBeCloseTo(2716, 2)
  })

  it('V8.2: resolveProductLaborTotal cai em total_labor_net se product_workload_price=0', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [{
        product_workload_price: 0,
        total_labor_net: 1500,
      }],
    }
    expect(resolveProductLaborTotal(prod)).toBe(1500)
  })
})
