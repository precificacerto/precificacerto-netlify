/**
 * Tests V11 (Epic MRM-V11, ADR-012) — Despesas via snapshot do produto.
 *
 * Cobre invariantes:
 *   V11-I1: motorInput.dop === SUM(expense_breakdown_unit.* × qty) quando snapshot presente
 *   V11-I2: DOP imutável vs desconto (Opção A — Founder approved)
 *   V11-I3: snapshot ausente → fallback V10 (RV × tenant.dop_pct)
 */

import { calculateMarginReapuration } from '../margin-reapuration'
import { buildMotorInput } from '../mrm-orchestrator'
import { resolveProductExpenses } from '../item-tax-rates'
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

const baseRates = [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)]

// Snapshot do produto Hyago (pricing_calculations.val_*) — Opção A
const hyagoBreakdownUnit = {
  mo_admin_unit: 14830.30,
  fixa_unit: 15013.74,
  variavel_unit: 8635.72,
  financeira_unit: 606.76,
}

const hyagoItem = {
  unit_price: 141106.60,
  quantity: 1,
  cost_total: 39929.94,
  productive_labor_unit: 2716.00,
  commission_percent: 5,
  profit_percent: 10,
  expense_breakdown_unit: hyagoBreakdownUnit,
}

const tenantCtxComBugFinanceira43 = {
  regime: 'LUCRO_REAL' as const,
  rates: baseRates,
  // Cenário onde tenant tem dop_pct mal-configurado (43% financeira)
  mod_pct: 0.5117,
  dop_pct: 0.7027, // 10.51 + 10.64 + 6.12 + 43 = 70.27%
  csll_pct: 0.008,
  irpj_pct: 0.016,
  useSnapshotRates: false,
  expense_breakdown: {
    administrative_pct: 0.1051,
    fixed_pct: 0.1064,
    variable_pct: 0.0612,
    financial_pct: 0.43, // BUG do tenant
  },
}

describe('V11 — Despesas via snapshot do produto (ADR-012)', () => {
  describe('V11-I1 — dop motor === SUM(breakdown × qty)', () => {
    it('Cenário Hyago: DOP = R$ 39.086,52 mesmo com tenant.dop_pct = 70%', () => {
      const input = buildMotorInput({
        item: hyagoItem,
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      // V11: ignora tenant.dop_pct, soma snapshot do produto
      expect(input.dop).toBeCloseTo(39086.52, 2)
    })

    it('Multiplica corretamente por quantity > 1', () => {
      const input = buildMotorInput({
        item: { ...hyagoItem, quantity: 3 },
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      expect(input.dop).toBeCloseTo(39086.52 * 3, 1)
    })
  })

  describe('V11-I2 — DOP imutável vs desconto (Opção A)', () => {
    it('DOP igual em 0% desconto e 10% desconto', () => {
      const inputSemDesc = buildMotorInput({
        item: hyagoItem,
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      const inputComDesc = buildMotorInput({
        item: hyagoItem,
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      expect(inputSemDesc.dop).toBeCloseTo(inputComDesc.dop, 2)
      expect(inputSemDesc.dop).toBeCloseTo(39086.52, 2)
    })

    it('Cascade trace step 10 children mostram valores absolutos', () => {
      const input = buildMotorInput({
        item: hyagoItem,
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      const result = calculateMarginReapuration(input)
      const step10Children = result.cascade_trace![9].children!
      expect(step10Children[0].label).toBe('MO Administrativa')
      expect(step10Children[0].amount).toBeCloseTo(-14830.30, 2)
      expect(step10Children[1].amount).toBeCloseTo(-15013.74, 2)
      expect(step10Children[2].amount).toBeCloseTo(-8635.72, 2)
      expect(step10Children[3].amount).toBeCloseTo(-606.76, 2)
      // Importante: rate é null (não há % do tenant — é valor absoluto V11)
      expect(step10Children[0].rate).toBeNull()
    })
  })

  describe('V11-I3 — Fallback V10 quando snapshot ausente', () => {
    it('Sem expense_breakdown_unit → usa tenant.dop_pct × RV', () => {
      const { expense_breakdown_unit: _eb, ...itemSemSnapshot } = hyagoItem
      const input = buildMotorInput({
        item: itemSemSnapshot,
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      // Cai em RV × 0.7027 = 126995.94 × 0.7027 ≈ 89240.05 (sintoma do bug)
      expect(input.dop).toBeCloseTo(126995.94 * 0.7027, 1)
    })

    it('expense_breakdown_unit = null → mesmo fallback', () => {
      const input = buildMotorInput({
        item: { ...hyagoItem, expense_breakdown_unit: null },
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      expect(input.dop).toBeCloseTo(126995.94 * 0.7027, 1)
    })
  })

  describe('GT-V11-001 — Cenário Hyago end-to-end via V11', () => {
    it('Motor produz RRO = R$ 13.924,06 com snapshot do produto', () => {
      const input = buildMotorInput({
        item: hyagoItem,
        tenantCtx: tenantCtxComBugFinanceira43,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      const result = calculateMarginReapuration(input)
      expect(result.rro).toBeCloseTo(13924.06, 1)
      expect(result.status).toBe('VALID')
      expect(result.engine_version).toBe('2.6.0')
    })
  })
})

describe('V11 — resolveProductExpenses helper', () => {
  it('Produto com pricing_calculations populado → retorna breakdown', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [
        {
          val_indirect_labor: 14830.30,
          val_fixed_expense: 15013.74,
          val_variable_expense: 8635.72,
          val_financial_expense: 606.76,
        },
      ],
    }
    const result = resolveProductExpenses(prod)
    expect(result).not.toBeNull()
    expect(result!.mo_admin_unit).toBeCloseTo(14830.30, 2)
    expect(result!.fixa_unit).toBeCloseTo(15013.74, 2)
    expect(result!.variavel_unit).toBeCloseTo(8635.72, 2)
    expect(result!.financeira_unit).toBeCloseTo(606.76, 2)
  })

  it('Divide pelo yield_quantity quando > 1', () => {
    const prod = {
      yield_quantity: 2,
      pricing_calculations: [{ val_indirect_labor: 200, val_fixed_expense: 100 }],
    }
    const result = resolveProductExpenses(prod)
    expect(result!.mo_admin_unit).toBe(100)
    expect(result!.fixa_unit).toBe(50)
  })

  it('pricing_calculations ausente → retorna null', () => {
    expect(resolveProductExpenses({ yield_quantity: 1 })).toBeNull()
    expect(resolveProductExpenses({})).toBeNull()
  })

  it('Todos buckets zerados → retorna null', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [
        { val_indirect_labor: 0, val_fixed_expense: 0, val_variable_expense: 0, val_financial_expense: 0 },
      ],
    }
    expect(resolveProductExpenses(prod)).toBeNull()
  })

  it('Itera múltiplas linhas pricing_calculations e pega primeiro > 0 por bucket', () => {
    const prod = {
      yield_quantity: 1,
      pricing_calculations: [
        { val_indirect_labor: 0, val_fixed_expense: 50 },
        { val_indirect_labor: 100, val_fixed_expense: 0 },
      ],
    }
    const result = resolveProductExpenses(prod)
    expect(result!.mo_admin_unit).toBe(100)
    expect(result!.fixa_unit).toBe(50)
  })
})
