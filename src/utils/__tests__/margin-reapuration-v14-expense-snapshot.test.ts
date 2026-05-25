/**
 * Tests V14 (Founder 2026-05-25) — Snapshot COMPLETO dos 4 buckets de despesa.
 *
 * Quando `item.expense_breakdown_unit` presente, motor usa val × qty para CADA
 * bucket (MO Admin / Fixa / Variável / Financeira) — ignora tenant.expense_breakdown.
 *
 * Precedência: V14 > V13 (só financeira) > V10 (tenant pct × RV)
 *
 * Origem: pricing_calculations.val_* + pct_* via `resolveProductExpenseBreakdown`.
 */

import { buildMotorInput } from '../mrm-orchestrator'
import { resolveProductExpenseBreakdown } from '../item-tax-rates'
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

const tenantCtxComBug = {
  regime: 'LUCRO_REAL' as const,
  rates: [rate('ICMS', 0.17)],
  dop_pct: 0.70,
  csll_pct: 0.008,
  irpj_pct: 0.016,
  useSnapshotRates: false,
  expense_breakdown: {
    administrative_pct: 0.20,  // Tenant tem 20% (bug)
    fixed_pct: 0.20,
    variable_pct: 0.20,
    financial_pct: 0.20,  // Tenant tem 20% (bug)
  },
}

describe('V14 — Snapshot completo dos 4 buckets', () => {
  describe('Quando produto tem expense_breakdown_unit — overrides TODOS os buckets', () => {
    it('Motor usa val × qty do snapshot, ignora tenant.expense_breakdown', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 11340.49,
          quantity: 1,
          cost_total: 11340.49,
          expense_breakdown_unit: {
            mo_admin: { rate: 0.1051, amount_unit: 3943.70 },
            fixa: { rate: 0.1064, amount_unit: 3992.48 },
            variavel: { rate: 0.0612, amount_unit: 2296.43 },
            financeira: { rate: 0.0043, amount_unit: 161.35 },
          },
        },
        tenantCtx: tenantCtxComBug,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })

      // DOP total = 3943.70 + 3992.48 + 2296.43 + 161.35 = 10393.96
      expect(input.dop).toBeCloseTo(10393.96, 1)

      // Cada bucket reflete o snapshot
      expect(input.expense_breakdown?.mo_admin.amount).toBeCloseTo(3943.70, 1)
      expect(input.expense_breakdown?.mo_admin.rate).toBeCloseTo(0.1051, 4)
      expect(input.expense_breakdown?.fixa.amount).toBeCloseTo(3992.48, 1)
      expect(input.expense_breakdown?.fixa.rate).toBeCloseTo(0.1064, 4)
      expect(input.expense_breakdown?.variavel.amount).toBeCloseTo(2296.43, 1)
      expect(input.expense_breakdown?.variavel.rate).toBeCloseTo(0.0612, 4)
      expect(input.expense_breakdown?.financeira.amount).toBeCloseTo(161.35, 1)
      expect(input.expense_breakdown?.financeira.rate).toBeCloseTo(0.0043, 4)
    })

    it('Multiplica corretamente por quantity > 1', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 3,
          expense_breakdown_unit: {
            mo_admin: { rate: 0.1, amount_unit: 10 },
            fixa: { rate: 0.1, amount_unit: 10 },
            variavel: { rate: 0.05, amount_unit: 5 },
            financeira: { rate: 0.01, amount_unit: 1 },
          },
        },
        tenantCtx: tenantCtxComBug,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      // Cada bucket × 3
      expect(input.expense_breakdown?.mo_admin.amount).toBe(30)
      expect(input.expense_breakdown?.fixa.amount).toBe(30)
      expect(input.expense_breakdown?.variavel.amount).toBe(15)
      expect(input.expense_breakdown?.financeira.amount).toBe(3)
      // Total dop = 78
      expect(input.dop).toBe(78)
    })

    it('Precedência V14 sobre V13: ignora financial_expense_unit quando há breakdown_unit', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 1,
          financial_expense_unit: 999,  // V13 — deve ser ignorado
          expense_breakdown_unit: {
            mo_admin: { rate: 0.05, amount_unit: 5 },
            fixa: { rate: 0.05, amount_unit: 5 },
            variavel: { rate: 0.05, amount_unit: 5 },
            financeira: { rate: 0.05, amount_unit: 5 },  // V14 vence
          },
        },
        tenantCtx: tenantCtxComBug,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      // V14 vence — financeira = 5 (não 999)
      expect(input.expense_breakdown?.financeira.amount).toBe(5)
    })
  })

  describe('Fallback V13 — quando V14 ausente mas V13 presente', () => {
    it('Sem expense_breakdown_unit + com financial_expense_unit → V13', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 1,
          financial_expense_unit: 50,
          // expense_breakdown_unit omitido
        },
        tenantCtx: tenantCtxComBug,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      // Financeira vem do snapshot V13
      expect(input.expense_breakdown?.financeira.amount).toBe(50)
      // Outros 3 buckets vêm de tenant pct × RV (100)
      expect(input.expense_breakdown?.mo_admin.amount).toBe(20)  // 100 × 0.20
      expect(input.expense_breakdown?.fixa.amount).toBe(20)
      expect(input.expense_breakdown?.variavel.amount).toBe(20)
    })
  })

  describe('Fallback V10 — quando V13 e V14 ausentes', () => {
    it('Sem snapshots → usa tenant.expense_breakdown', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 1,
        },
        tenantCtx: tenantCtxComBug,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      // Todos buckets via tenant pct × RV (100)
      expect(input.expense_breakdown?.mo_admin.amount).toBe(20)
      expect(input.expense_breakdown?.fixa.amount).toBe(20)
      expect(input.expense_breakdown?.variavel.amount).toBe(20)
      expect(input.expense_breakdown?.financeira.amount).toBe(20)
    })
  })

  describe('resolveProductExpenseBreakdown helper', () => {
    it('Produto com pricing_calculations populado → retorna snapshot completo', () => {
      const prod = {
        yield_quantity: 1,
        pricing_calculations: [
          {
            val_indirect_labor: 3943.70,
            pct_indirect_labor: 10.51,  // formato percentual
            val_fixed_expense: 3992.48,
            pct_fixed_expense: 10.64,
            val_variable_expense: 2296.43,
            pct_variable_expense: 6.12,
            val_financial_expense: 161.35,
            pct_financial_expense: 0.43,
          },
        ],
      }
      const result = resolveProductExpenseBreakdown(prod)
      expect(result).not.toBeNull()
      expect(result!.mo_admin.amount_unit).toBeCloseTo(3943.70, 2)
      expect(result!.mo_admin.rate).toBeCloseTo(0.1051, 4)
      expect(result!.fixa.amount_unit).toBeCloseTo(3992.48, 2)
      expect(result!.fixa.rate).toBeCloseTo(0.1064, 4)
      expect(result!.variavel.amount_unit).toBeCloseTo(2296.43, 2)
      expect(result!.variavel.rate).toBeCloseTo(0.0612, 4)
      expect(result!.financeira.amount_unit).toBeCloseTo(161.35, 2)
      expect(result!.financeira.rate).toBeCloseTo(0.0043, 4)
    })

    it('Divide val por yield_quantity', () => {
      const prod = {
        yield_quantity: 2,
        pricing_calculations: [{ val_indirect_labor: 200, pct_indirect_labor: 5 }],
      }
      const result = resolveProductExpenseBreakdown(prod)
      expect(result!.mo_admin.amount_unit).toBe(100)
      expect(result!.mo_admin.rate).toBeCloseTo(0.05, 4)
    })

    it('Sem pricing_calculations → null', () => {
      expect(resolveProductExpenseBreakdown({ yield_quantity: 1 })).toBeNull()
    })

    it('Todos val_* zerados → null (caller usa fallback)', () => {
      const prod = {
        yield_quantity: 1,
        pricing_calculations: [{ val_indirect_labor: 0 }],
      }
      expect(resolveProductExpenseBreakdown(prod)).toBeNull()
    })

    it('Aceita pct já em decimal (< 1) — preserva', () => {
      const prod = {
        yield_quantity: 1,
        pricing_calculations: [{ val_indirect_labor: 100, pct_indirect_labor: 0.05 }],
      }
      const result = resolveProductExpenseBreakdown(prod)
      expect(result!.mo_admin.rate).toBeCloseTo(0.05, 4)
    })
  })

  describe('GT-V14-001 — Cenário Founder com 4 buckets do produto', () => {
    it('RV (sem desconto) × precificação do produto → cascade reflete EXATAMENTE valores do produto', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 11340.49,
          quantity: 1,
          cost_total: 11340.49,
          expense_breakdown_unit: {
            mo_admin: { rate: 0.1051, amount_unit: 3943.70 },
            fixa: { rate: 0.1064, amount_unit: 3992.48 },
            variavel: { rate: 0.0612, amount_unit: 2296.43 },
            financeira: { rate: 0.0043, amount_unit: 161.35 },
          },
        },
        tenantCtx: tenantCtxComBug,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })

      // Cada bucket = exatamente o que aparece na precificação do produto
      expect(input.expense_breakdown?.mo_admin.amount).toBeCloseTo(3943.70, 2)
      expect(input.expense_breakdown?.fixa.amount).toBeCloseTo(3992.48, 2)
      expect(input.expense_breakdown?.variavel.amount).toBeCloseTo(2296.43, 2)
      expect(input.expense_breakdown?.financeira.amount).toBeCloseTo(161.35, 2)
      // % exibida = exatamente a do produto
      expect(input.expense_breakdown?.mo_admin.rate).toBeCloseTo(0.1051, 4)
      expect(input.expense_breakdown?.financeira.rate).toBeCloseTo(0.0043, 4)
    })
  })
})
