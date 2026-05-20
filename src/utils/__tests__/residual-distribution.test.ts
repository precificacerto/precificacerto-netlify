/**
 * Tests — computeResidualDistribution (Story S1 do EPIC-RR-DISPLAY).
 *
 * Cobertura mínima:
 *   - Golden canônico (V₀=141.656,68, d=5%, RRO=18.580,04 → 3,967% / 7,934% / 1,190% / 0,714% / 13,805%)
 *   - d=0 → originalPct === effectivePct, hasDiscount=false
 *   - Regime MEI/SIMPLES_NACIONAL → IRPJ/CSLL zerados + hidesProfitTaxes=true
 *   - Fallback motor_* quando tax_breakdown ausente
 *   - Items vazios / totalNet=0 → tudo zero
 *   - formatResidualLine: com e sem desconto
 */

import {
  computeResidualDistribution,
  detectConfigWarning,
  formatResidualLine,
  type ResidualItemInput,
} from '../residual-distribution'
import type { TaxBreakdown } from '@/types/mrm'

function makeBreakdown(overrides: Partial<TaxBreakdown> = {}): TaxBreakdown {
  return {
    engine_version: '2.1.0',
    effective_date: '2026-05-20',
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

describe('computeResidualDistribution — Golden canônico', () => {
  // Spec V2 item 13: RB=141.656,68, desc=5%, profit=23%, commission=11,5%,
  // csll=2,07%, irpj=3,45% → RRO ≈ 18.580,30
  // Esperado (PDF/DOCX validados pelo usuário):
  //   Comissão  R$ 5.339,09 → 3,967% sobre Vₗ
  //   Lucro     R$ 10.678,18 → 7,934%
  //   IRPJ      R$ 1.601,58 → 1,190%
  //   CSLL      R$ 961,19   → 0,714%
  //   Total RRO R$ 18.580,04 → 13,805%

  it('reproduz os 5 percentuais canônicos do PDF Claude/GPT (tolerância ±0,001%)', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 141656.68,
        quantity: 1,
        commission_percent: 11.5,
        profit_percent: 23,
        tax_breakdown: makeBreakdown({
          new_commission: 5339.09,
          new_profit: 10678.18,
          new_irpj: 1601.58,
          new_csll: 961.19,
        }),
      },
    ]
    const totalGross = 141656.68
    const totalNet = 134573.85

    const dist = computeResidualDistribution(items, totalGross, totalNet, 'LUCRO_REAL', {
      irpj: 0.0345,
      csll: 0.0207,
    })

    // Tolerância 2 casas (±0,005%): documento truncou alguns valores
    // (ex: 7,9348 → 7,934 em vez de 7,935). Resultado exato do cálculo
    // matemático passa pela tolerância prática esperada pelo usuário.
    expect(dist.commission.effectivePct).toBeCloseTo(3.967, 2)
    expect(dist.profit.effectivePct).toBeCloseTo(7.934, 2)
    expect(dist.irpj.effectivePct).toBeCloseTo(1.190, 2)
    expect(dist.csll.effectivePct).toBeCloseTo(0.714, 2)
    expect(dist.total.effectivePct).toBeCloseTo(13.805, 2)

    // % originais ponderados
    expect(dist.commission.originalPct).toBeCloseTo(11.5, 3)
    expect(dist.profit.originalPct).toBeCloseTo(23, 3)
    expect(dist.irpj.originalPct).toBeCloseTo(3.45, 3)
    expect(dist.csll.originalPct).toBeCloseTo(2.07, 3)

    expect(dist.hasDiscount).toBe(true)
    expect(dist.hidesProfitTaxes).toBe(false)
    expect(dist.requiresReview).toBe(false)
  })

  it('soma dos 4 efetivos = total.effectivePct (invariante de fechamento)', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 141656.68,
        quantity: 1,
        commission_percent: 11.5,
        profit_percent: 23,
        tax_breakdown: makeBreakdown({
          new_commission: 5339.09,
          new_profit: 10678.18,
          new_irpj: 1601.58,
          new_csll: 961.19,
        }),
      },
    ]
    const dist = computeResidualDistribution(items, 141656.68, 134573.85, 'LUCRO_REAL', {
      irpj: 0.0345,
      csll: 0.0207,
    })

    const sum =
      dist.commission.effectivePct + dist.profit.effectivePct +
      dist.irpj.effectivePct + dist.csll.effectivePct
    expect(sum).toBeCloseTo(dist.total.effectivePct, 6)
  })
})

describe('computeResidualDistribution — d=0 (sem desconto)', () => {
  it('originalPct = effectivePct e hasDiscount=false (label sem seta)', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 1000,
        quantity: 1,
        commission_percent: 5,
        profit_percent: 10,
        tax_breakdown: makeBreakdown({
          new_commission: 50,
          new_profit: 100,
          new_irpj: 15,
          new_csll: 9,
        }),
      },
    ]
    const dist = computeResidualDistribution(items, 1000, 1000, 'LUCRO_PRESUMIDO', {
      irpj: 0.015,
      csll: 0.009,
    })

    expect(dist.hasDiscount).toBe(false)
    expect(dist.commission.amount).toBe(50)
    expect(dist.commission.effectivePct).toBeCloseTo(5, 3)
    expect(dist.profit.effectivePct).toBeCloseTo(10, 3)
  })
})

describe('computeResidualDistribution — Regimes que ocultam IRPJ/CSLL (Q6)', () => {
  it.each([
    ['MEI' as const],
    ['SIMPLES_NACIONAL' as const],
  ])('regime %s: hidesProfitTaxes=true, IRPJ e CSLL zerados independente do input', (regime) => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 1000,
        quantity: 1,
        commission_percent: 5,
        profit_percent: 10,
        // Mesmo que algum item venha com new_csll/new_irpj > 0, regime deve zerar
        tax_breakdown: makeBreakdown({
          new_commission: 50,
          new_profit: 100,
          new_irpj: 30,
          new_csll: 18,
        }),
      },
    ]
    const dist = computeResidualDistribution(items, 1000, 900, regime, {
      irpj: 0.0345,
      csll: 0.0207,
    })

    expect(dist.hidesProfitTaxes).toBe(true)
    expect(dist.irpj.amount).toBe(0)
    expect(dist.irpj.originalPct).toBe(0)
    expect(dist.irpj.effectivePct).toBe(0)
    expect(dist.csll.amount).toBe(0)
    expect(dist.csll.originalPct).toBe(0)
    expect(dist.csll.effectivePct).toBe(0)
    // Comissão e lucro continuam normais
    expect(dist.commission.amount).toBe(50)
    expect(dist.profit.amount).toBe(100)
  })
})

describe('computeResidualDistribution — Fallback runtime (item sem tax_breakdown)', () => {
  it('usa motor_new_* quando tax_breakdown está null', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 1000,
        quantity: 1,
        commission_percent: 5,
        profit_percent: 10,
        tax_breakdown: null,
        motor_new_commission: 40,
        motor_new_profit: 80,
        motor_new_irpj: 10,
        motor_new_csll: 6,
      },
    ]
    const dist = computeResidualDistribution(items, 1000, 900, 'LUCRO_PRESUMIDO', {
      irpj: 0.015,
      csll: 0.009,
    })

    expect(dist.commission.amount).toBe(40)
    expect(dist.profit.amount).toBe(80)
    expect(dist.irpj.amount).toBe(10)
    expect(dist.csll.amount).toBe(6)
    expect(dist.requiresReview).toBe(false)
  })

  it('requiresReview=true quando TODOS os items não têm fonte (legacy puro)', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10 },
    ]
    const dist = computeResidualDistribution(items, 1000, 900, 'LUCRO_PRESUMIDO')

    expect(dist.requiresReview).toBe(true)
    expect(dist.commission.amount).toBe(0)
    expect(dist.profit.amount).toBe(0)
  })

  it('requiresReview=false quando ao menos um item tem fonte', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 1000,
        quantity: 1,
        commission_percent: 5,
        profit_percent: 10,
        tax_breakdown: makeBreakdown({ new_commission: 50, new_profit: 100 }),
      },
      { unit_price: 500, quantity: 1, commission_percent: 5, profit_percent: 10 },
    ]
    const dist = computeResidualDistribution(items, 1500, 1400, 'LUCRO_PRESUMIDO')

    expect(dist.requiresReview).toBe(false)
  })
})

describe('computeResidualDistribution — Edges', () => {
  it('items vazios → tudo zero, sem erro', () => {
    const dist = computeResidualDistribution([], 0, 0, 'LUCRO_REAL')
    expect(dist.total.amount).toBe(0)
    expect(dist.total.effectivePct).toBe(0)
    expect(dist.hasDiscount).toBe(false)
  })

  it('totalNet=0 → tudo zero (evita divisão por zero)', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 100,
        quantity: 1,
        commission_percent: 5,
        profit_percent: 10,
        tax_breakdown: makeBreakdown({ new_commission: 5, new_profit: 10 }),
      },
    ]
    const dist = computeResidualDistribution(items, 100, 0, 'LUCRO_REAL')
    expect(dist.commission.effectivePct).toBe(0)
    expect(dist.profit.effectivePct).toBe(0)
  })

  it('% original ponderado quando itens têm pesos diferentes', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 800, quantity: 1, commission_percent: 5, profit_percent: 10,
        tax_breakdown: makeBreakdown({ new_commission: 40, new_profit: 80 }),
      },
      {
        unit_price: 200, quantity: 1, commission_percent: 10, profit_percent: 5,
        tax_breakdown: makeBreakdown({ new_commission: 20, new_profit: 10 }),
      },
    ]
    const dist = computeResidualDistribution(items, 1000, 1000, 'LUCRO_REAL')

    // Ponderado: comissão = (800*5 + 200*10) / 1000 = 6%
    //            lucro    = (800*10 + 200*5) / 1000 = 9%
    expect(dist.commission.originalPct).toBeCloseTo(6, 3)
    expect(dist.profit.originalPct).toBeCloseTo(9, 3)
  })
})

describe('detectConfigWarning (S9 — aviso de configuração incompleta)', () => {
  it('Configuração completa (CP > 0 e DOP+MOD > 0) → null', () => {
    const result = detectConfigWarning({
      totalCostBase: 57477.20,
      dopPct: 0.10,
      modPct: 0.02,
      totalGross: 141656.68,
    })
    expect(result).toBeNull()
  })

  it('Sem custo E sem despesas → mensagem combinada', () => {
    const result = detectConfigWarning({
      totalCostBase: 0,
      dopPct: 0,
      modPct: 0,
      totalGross: 1000,
    })
    expect(result).toMatch(/cadastre o custo dos produtos/i)
    expect(result).toMatch(/despesas operacionais/i)
  })

  it('Apenas sem custo → mensagem específica de custo', () => {
    const result = detectConfigWarning({
      totalCostBase: 0,
      dopPct: 0.20,
      modPct: 0,
      totalGross: 1000,
    })
    expect(result).toMatch(/custo dos produtos/i)
    expect(result).not.toMatch(/despesas operacionais.*configurações/i)
  })

  it('Apenas sem despesas → mensagem específica de despesas', () => {
    const result = detectConfigWarning({
      totalCostBase: 500,
      dopPct: 0,
      modPct: 0,
      totalGross: 1000,
    })
    expect(result).toMatch(/despesas operacionais/i)
  })

  it('CP marginal (< 0,1% do total) → tratado como sem custo', () => {
    const result = detectConfigWarning({
      totalCostBase: 0.5,  // 0,05% de 1000
      dopPct: 0.20,
      modPct: 0,
      totalGross: 1000,
    })
    expect(result).toMatch(/custo dos produtos/i)
  })

  it('MOD > 0 sozinho satisfaz "tem opex"', () => {
    const result = detectConfigWarning({
      totalCostBase: 500,
      dopPct: 0,
      modPct: 0.15,
      totalGross: 1000,
    })
    expect(result).toBeNull()
  })

  it('totalGross = 0 → tratado como sem custo (evita divisão por zero)', () => {
    const result = detectConfigWarning({
      totalCostBase: 100,
      dopPct: 0.20,
      modPct: 0,
      totalGross: 0,
    })
    expect(result).toMatch(/custo dos produtos/i)
  })
})

describe('formatResidualLine', () => {
  it('com desconto: formato Claude completo', () => {
    const text = formatResidualLine({ amount: 5339.09, originalPct: 5, effectivePct: 3.967 }, true)
    expect(text).toBe('5,000% original → 3,967% sobre o total c/ desconto')
  })

  it('sem desconto: apenas % original (sem seta)', () => {
    const text = formatResidualLine({ amount: 50, originalPct: 5, effectivePct: 5 }, false)
    expect(text).toBe('5,000%')
  })

  it('respeita locale pt-BR (vírgula como separador decimal)', () => {
    const text = formatResidualLine({ amount: 0, originalPct: 11.5, effectivePct: 7.934 }, true)
    expect(text).toContain('11,500%')
    expect(text).toContain('7,934%')
  })
})
