/**
 * Tests V13 (2026-05-25) — Despesa Financeira via snapshot do produto.
 *
 * Apenas o bucket Financeira usa `pricing_calculations.val_financial_expense` do produto.
 * MO Admin/Fixa/Variável continuam vindo de `tenant.expense_breakdown` (% × RV).
 *
 * Motivação: tenant pode ter `financial_expense_percent` mal-configurado (ex: 43%).
 * Snapshot do produto evita contaminação por má config do tenant nesse bucket.
 */

import { buildMotorInput } from '../mrm-orchestrator'
import { resolveProductFinancialExpense } from '../item-tax-rates'
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

const tenantCtxBugFinanceira = {
  regime: 'LUCRO_REAL' as const,
  rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.0602775)],
  dop_pct: 0.7027,  // 10.51 + 10.64 + 6.12 + 43 (bug 43% financeira)
  csll_pct: 0.008,
  irpj_pct: 0.016,
  useSnapshotRates: false,
  expense_breakdown: {
    administrative_pct: 0.1051,
    fixed_pct: 0.1064,
    variable_pct: 0.0612,
    financial_pct: 0.43,  // BUG do tenant
  },
}

describe('V13 — Despesa Financeira snapshot do produto', () => {
  describe('Quando produto tem snapshot — overrides bucket Financeira', () => {
    it('Financeira usa snapshot × qty; outros 3 buckets continuam % do tenant', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 141106.60,
          quantity: 1,
          cost_total: 39929.94,
          productive_labor_unit: 2716.00,
          financial_expense_unit: 606.76,  // snapshot do produto
          commission_percent: 5,
          profit_percent: 10,
        },
        tenantCtx: tenantCtxBugFinanceira,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })

      // RV = 141106.60 × 0.9 = 126995.94
      // MO Admin (tenant 10,51%): 126995.94 × 0.1051 = 13347.27
      // Fixa (tenant 10,64%): 126995.94 × 0.1064 = 13512.37
      // Variável (tenant 6,12%): 126995.94 × 0.0612 = 7772.15
      // Financeira (snapshot): 606.76 × 1 = 606.76 (NÃO 43% × RV = 54.608)
      // Total DOP = 13347.27 + 13512.37 + 7772.15 + 606.76 ≈ 35.238,55
      expect(input.dop).toBeCloseTo(13347.27 + 13512.37 + 7772.15 + 606.76, 1)
    })

    it('expense_breakdown.financeira.rate = 0 quando snapshot ativo', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 2,
          financial_expense_unit: 50,  // snapshot
        },
        tenantCtx: tenantCtxBugFinanceira,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      expect(input.expense_breakdown?.financeira.rate).toBe(0)
      expect(input.expense_breakdown?.financeira.amount).toBe(50 * 2)
    })

    it('Outros 3 buckets mantêm rate do tenant', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 1,
          financial_expense_unit: 50,
        },
        tenantCtx: tenantCtxBugFinanceira,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      expect(input.expense_breakdown?.mo_admin.rate).toBeCloseTo(0.1051, 4)
      expect(input.expense_breakdown?.fixa.rate).toBeCloseTo(0.1064, 4)
      expect(input.expense_breakdown?.variavel.rate).toBeCloseTo(0.0612, 4)
    })
  })

  describe('Fallback — quando produto SEM snapshot', () => {
    it('Sem financial_expense_unit → bucket Financeira usa tenant.financial_pct × RV', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 1,
          // financial_expense_unit omitido
        },
        tenantCtx: tenantCtxBugFinanceira,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      // Financeira fallback: 100 × 0.43 = 43
      expect(input.expense_breakdown?.financeira.amount).toBeCloseTo(43, 1)
      expect(input.expense_breakdown?.financeira.rate).toBeCloseTo(0.43, 4)
    })

    it('financial_expense_unit = 0 → também usa fallback (snapshot inválido)', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 100,
          quantity: 1,
          financial_expense_unit: 0,
        },
        tenantCtx: tenantCtxBugFinanceira,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      expect(input.expense_breakdown?.financeira.amount).toBeCloseTo(43, 1)
    })
  })

  describe('resolveProductFinancialExpense helper', () => {
    it('Produto com pricing_calculations.val_financial_expense > 0 → retorna valor / yield', () => {
      const prod = {
        yield_quantity: 1,
        pricing_calculations: [{ val_financial_expense: 606.76 }],
      }
      expect(resolveProductFinancialExpense(prod)).toBeCloseTo(606.76, 2)
    })

    it('Divide por yield_quantity > 1', () => {
      const prod = {
        yield_quantity: 4,
        pricing_calculations: [{ val_financial_expense: 1000 }],
      }
      expect(resolveProductFinancialExpense(prod)).toBe(250)
    })

    it('Sem pricing_calculations → null', () => {
      expect(resolveProductFinancialExpense({ yield_quantity: 1 })).toBeNull()
    })

    it('val_financial_expense=0 → null (caller usa fallback)', () => {
      const prod = {
        yield_quantity: 1,
        pricing_calculations: [{ val_financial_expense: 0 }],
      }
      expect(resolveProductFinancialExpense(prod)).toBeNull()
    })

    it('Itera múltiplas linhas pricing_calculations e pega primeiro > 0', () => {
      const prod = {
        yield_quantity: 1,
        pricing_calculations: [
          { val_financial_expense: 0 },
          { val_financial_expense: 100 },
          { val_financial_expense: 999 },
        ],
      }
      expect(resolveProductFinancialExpense(prod)).toBe(100)
    })
  })
})
