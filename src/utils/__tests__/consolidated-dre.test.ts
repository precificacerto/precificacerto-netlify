/**
 * Tests — computeConsolidatedDRE (S12 do EPIC-RR-V2)
 *
 * Cobertura:
 *   - Golden canônico: V₀=141.656,68 + d=5% + RRO=18.580,04
 *   - 4 buckets de despesa proporcionais
 *   - Impostos POR DENTRO / POR FORA separados e agregados por tipo
 *   - MEI/SN ocultam IRPJ/CSLL
 *   - Items vazios / totalNet=0 não quebra
 *   - Fallback motor_* quando tax_breakdown null
 *   - Distribuição R$ + % original + % efetivo (R4=c)
 */

import { computeConsolidatedDRE, type DREItemInput } from '../consolidated-dre'
import type { TaxBreakdown, TaxLine } from '@/types/mrm'

function makeTaxLine(type: TaxLine['type'], amount: number, base = 1000): TaxLine {
  return { type, rate_pct: amount / base, base, amount }
}

function makeBreakdown(overrides: Partial<TaxBreakdown> = {}): TaxBreakdown {
  return {
    engine_version: '2.1.0',
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
    new_commission: 0,
    new_profit: 0,
    new_csll: 0,
    new_irpj: 0,
    validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true },
    valid: true,
    status: 'VALID',
    error_code: null,
    messages: [],
    ...overrides,
  }
}

describe('computeConsolidatedDRE — Golden canônico', () => {
  it('reproduz valores canônicos (V₀=141.656,68, RV=134.573,85, RRO=18.580,04)', () => {
    const items: DREItemInput[] = [
      {
        unit_price: 141656.68,
        quantity: 1,
        cost_total: 57477.20,
        commission_percent: 11.5,
        profit_percent: 23,
        tax_breakdown: makeBreakdown({
          taxes_inside: [
            makeTaxLine('ICMS', 13457.39, 134573.85),
            makeTaxLine('PIS', 874.73, 134573.85),
            makeTaxLine('COFINS', 4945.60, 134573.85),
          ],
          new_commission: 5339.09,
          new_profit: 10678.18,
          new_irpj: 1601.58,
          new_csll: 961.19,
        }),
      },
    ]

    const dre = computeConsolidatedDRE({
      items,
      totalGross: 141656.68,
      totalNet: 134573.85,
      regime: 'LUCRO_REAL',
      expenseStructure: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0.0345, csll: 0.0207 },
    })

    // Receitas
    expect(dre.receitas.bruta).toBe(134573.85)
    expect(dre.receitas.impostosForaTotal).toBe(0)
    expect(dre.receitas.liquida).toBe(134573.85)

    // Custos
    expect(dre.custos.total).toBe(57477.20)

    // Impostos por dentro agregados (3 tipos)
    expect(dre.impostos.porDentro).toHaveLength(3)
    expect(dre.impostos.porDentroTotal).toBeCloseTo(19277.72, 1)

    // RRO consolidado = comissão + lucro + IRPJ + CSLL
    expect(dre.rro.valor).toBeCloseTo(18580.04, 1)
    expect(dre.rro.effectivePct).toBeCloseTo(13.81, 2)

    // Distribuição (4 componentes — R4=c)
    expect(dre.distribuicao.commission.amount).toBe(5339.09)
    expect(dre.distribuicao.commission.originalPct).toBeCloseTo(11.5, 2)
    expect(dre.distribuicao.commission.effectivePct).toBeCloseTo(3.967, 2)

    expect(dre.distribuicao.profit.amount).toBe(10678.18)
    expect(dre.distribuicao.profit.effectivePct).toBeCloseTo(7.934, 2)

    expect(dre.distribuicao.irpj.amount).toBe(1601.58)
    expect(dre.distribuicao.irpj.originalPct).toBeCloseTo(3.45, 2)

    expect(dre.distribuicao.csll.amount).toBe(961.19)

    expect(dre.hidesProfitTaxes).toBe(false)
    expect(dre.requiresReview).toBe(false)
  })
})

describe('computeConsolidatedDRE — 4 buckets de despesa', () => {
  it('Distribui despesas proporcionalmente à receita líquida (R6=b)', () => {
    const items: DREItemInput[] = [
      {
        unit_price: 10000, quantity: 1, cost_total: 3000,
        commission_percent: 5, profit_percent: 10,
        tax_breakdown: makeBreakdown({ new_commission: 500, new_profit: 1000 }),
      },
    ]
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 10000,
      totalNet: 10000,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: {
        fixed_pct: 0.10,
        variable_pct: 0.05,
        financial_pct: 0.02,
        administrative_pct: 0.03,
        mod_pct: 0.04,
      },
      tenantTaxRates: { irpj: 0.012, csll: 0.0108 },
    })

    expect(dre.despesas.fixas).toBe(1000)         // 10% × 10.000
    expect(dre.despesas.variaveis).toBe(500)       // 5% × 10.000
    expect(dre.despesas.financeiras).toBe(200)     // 2% × 10.000
    expect(dre.despesas.administrativas).toBe(300) // 3% × 10.000
    // V7+ (2026-05-24): MOD migrada de despesas para custos (decisão do Founder)
    expect(dre.despesas.mod).toBe(0)               // sempre 0 (migrado)
    expect(dre.custos.mod).toBe(400)               // 4% × 10.000 — agora em Custos
    expect(dre.despesas.total).toBe(2000)          // sem MOD: 1000+500+200+300
  })
})

describe('computeConsolidatedDRE — Impostos por dentro vs por fora separados (R5)', () => {
  it('Agrupa taxes_inside e taxes_outside corretamente', () => {
    const items: DREItemInput[] = [
      {
        unit_price: 10000, quantity: 1,
        commission_percent: 5, profit_percent: 10,
        tax_breakdown: makeBreakdown({
          taxes_inside: [
            makeTaxLine('ICMS', 1800, 10000),
            makeTaxLine('PIS', 165, 10000),
            makeTaxLine('COFINS', 760, 10000),
          ],
          taxes_outside: [
            makeTaxLine('IPI', 500, 8275),
            makeTaxLine('ICMS_ST', 300, 8275),
          ],
          new_commission: 500, new_profit: 1000,
        }),
      },
    ]
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 10000,
      totalNet: 10000,
      regime: 'LUCRO_REAL',
      expenseStructure: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0, csll: 0 },
    })

    expect(dre.impostos.porDentro).toHaveLength(3)
    expect(dre.impostos.porDentroTotal).toBe(1800 + 165 + 760)
    expect(dre.impostos.porForaArr).toHaveLength(2)
    expect(dre.impostos.porForaTotal).toBe(800)
    expect(dre.impostos.total).toBe(3525)

    // Receita líquida = bruta − impostos POR FORA
    expect(dre.receitas.liquida).toBe(10000 - 800)
  })

  it('Agrega múltiplos items com mesmos tax_types', () => {
    const items: DREItemInput[] = [
      {
        unit_price: 1000, quantity: 1,
        tax_breakdown: makeBreakdown({
          taxes_inside: [makeTaxLine('ICMS', 100, 1000)],
        }),
      },
      {
        unit_price: 2000, quantity: 1,
        tax_breakdown: makeBreakdown({
          taxes_inside: [makeTaxLine('ICMS', 240, 2000)],
        }),
      },
    ]
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 3000, totalNet: 3000,
      regime: 'LUCRO_REAL',
      expenseStructure: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0, csll: 0 },
    })

    expect(dre.impostos.porDentro).toHaveLength(1) // só ICMS
    expect(dre.impostos.porDentro[0].amount).toBe(340) // 100 + 240
  })
})

describe('computeConsolidatedDRE — MEI/SN', () => {
  it.each([
    ['MEI' as const],
    ['SIMPLES_NACIONAL' as const],
  ])('regime %s: IRPJ/CSLL = 0 e hidesProfitTaxes=true', (regime) => {
    const items: DREItemInput[] = [
      {
        unit_price: 1000, quantity: 1,
        commission_percent: 5, profit_percent: 10,
        tax_breakdown: makeBreakdown({
          new_commission: 50, new_profit: 100,
          new_irpj: 30, new_csll: 20,  // mesmo se motor preencher, regime zera
        }),
      },
    ]
    const dre = computeConsolidatedDRE({
      items,
      totalGross: 1000, totalNet: 1000,
      regime,
      expenseStructure: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0.0345, csll: 0.0207 },
    })

    expect(dre.hidesProfitTaxes).toBe(true)
    expect(dre.distribuicao.irpj.amount).toBe(0)
    expect(dre.distribuicao.csll.amount).toBe(0)
    // RRO em MEI/SN só agrega commission + profit
    expect(dre.rro.valor).toBe(150)
  })
})

describe('computeConsolidatedDRE — Edges', () => {
  it('items vazios → tudo zero', () => {
    const dre = computeConsolidatedDRE({
      items: [], totalGross: 0, totalNet: 0,
      regime: 'LUCRO_REAL',
      expenseStructure: { fixed_pct: 0.10, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0, csll: 0 },
    })
    expect(dre.rro.valor).toBe(0)
    expect(dre.custos.total).toBe(0)
    expect(dre.despesas.fixas).toBe(0)
  })

  it('totalNet=0 → effectivePcts = 0 (sem divisão por zero)', () => {
    const items: DREItemInput[] = [{
      unit_price: 100, quantity: 1,
      tax_breakdown: makeBreakdown({ new_commission: 5, new_profit: 10 }),
    }]
    const dre = computeConsolidatedDRE({
      items, totalGross: 100, totalNet: 0,
      regime: 'LUCRO_REAL',
      expenseStructure: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0, csll: 0 },
    })
    expect(dre.rro.effectivePct).toBe(0)
    expect(dre.distribuicao.commission.effectivePct).toBe(0)
  })

  it('Fallback motor_* quando tax_breakdown ausente', () => {
    const items: DREItemInput[] = [{
      unit_price: 1000, quantity: 1,
      commission_percent: 5, profit_percent: 10,
      tax_breakdown: null,
      motor_new_commission: 50,
      motor_new_profit: 100,
      motor_new_irpj: 15,
      motor_new_csll: 9,
    }]
    const dre = computeConsolidatedDRE({
      items, totalGross: 1000, totalNet: 900,
      regime: 'LUCRO_PRESUMIDO',
      expenseStructure: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0.015, csll: 0.009 },
    })
    expect(dre.distribuicao.commission.amount).toBe(50)
    expect(dre.distribuicao.profit.amount).toBe(100)
    expect(dre.distribuicao.irpj.amount).toBe(15)
    expect(dre.distribuicao.csll.amount).toBe(9)
    expect(dre.rro.valor).toBe(174)
    expect(dre.requiresReview).toBe(false)
  })

  it('requiresReview=true quando TODOS items sem motor nem snapshot', () => {
    const items: DREItemInput[] = [
      { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10 },
    ]
    const dre = computeConsolidatedDRE({
      items, totalGross: 1000, totalNet: 900,
      regime: 'LUCRO_REAL',
      expenseStructure: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0, mod_pct: 0 },
      tenantTaxRates: { irpj: 0, csll: 0 },
    })
    expect(dre.requiresReview).toBe(true)
    expect(dre.rro.valor).toBe(0)
  })
})
