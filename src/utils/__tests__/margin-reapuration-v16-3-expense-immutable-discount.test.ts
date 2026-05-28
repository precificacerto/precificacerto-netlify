/**
 * Tests V16.3 (Founder 2026-05-28) — Despesas operacionais imutáveis a desconto.
 *
 * Bug relatado: ao aplicar desconto em orçamento/venda balcão, os 4 buckets
 * de despesa (MO Admin, Fixa, Variável, Financeira) encolhiam proporcional
 * ao desconto. Princípio econômico: despesas estruturais da empresa NÃO
 * mudam com desconto comercial — só aumentam ao adicionar mais produtos.
 *
 * Fix: em `buildMotorInput`, trocar `rvItem` por `itemBase` (pré-desconto)
 * nos caminhos V10/V13 fallback. V14 (snapshot do produto) já era imutável.
 *
 * Invariante: `dop(discount=X) === dop(discount=0)` para qualquer X ∈ [0, 100).
 */

import { buildMotorInput } from '../mrm-orchestrator'
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

const baseRates = [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.0602775)]

const tenantCtxComBreakdown = {
  regime: 'LUCRO_REAL' as const,
  rates: baseRates,
  dop_pct: 0.277,
  csll_pct: 0.008,
  irpj_pct: 0.016,
  useSnapshotRates: false,
  expense_breakdown: {
    administrative_pct: 0.1051,
    fixed_pct: 0.1064,
    variable_pct: 0.0612,
    financial_pct: 0.0043,
  },
}

const tenantCtxFallback = {
  regime: 'LUCRO_REAL' as const,
  rates: baseRates,
  dop_pct: 0.277,
  csll_pct: 0.008,
  irpj_pct: 0.016,
  useSnapshotRates: false,
  // sem expense_breakdown — cai no caminho V10 fallback agregado
}

const baseItem = {
  unit_price: 135300.61,
  quantity: 1,
  cost_total: 7986.00,
}

describe('V16.3 — Despesas operacionais imutáveis a desconto', () => {
  describe('Caminho V10/V13 com tenant.expense_breakdown', () => {
    it('Os 4 buckets retornam valor IDÊNTICO com 0% e 10% de desconto', () => {
      const semDesc = buildMotorInput({
        item: baseItem,
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      const comDesc10 = buildMotorInput({
        item: baseItem,
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })

      expect(comDesc10.expense_breakdown?.mo_admin.amount).toBeCloseTo(
        semDesc.expense_breakdown!.mo_admin.amount, 2,
      )
      expect(comDesc10.expense_breakdown?.fixa.amount).toBeCloseTo(
        semDesc.expense_breakdown!.fixa.amount, 2,
      )
      expect(comDesc10.expense_breakdown?.variavel.amount).toBeCloseTo(
        semDesc.expense_breakdown!.variavel.amount, 2,
      )
      expect(comDesc10.expense_breakdown?.financeira.amount).toBeCloseTo(
        semDesc.expense_breakdown!.financeira.amount, 2,
      )
      expect(comDesc10.dop).toBeCloseTo(semDesc.dop, 2)
    })

    it('Os 4 buckets retornam IDÊNTICO com 50% e 0% de desconto (caso extremo)', () => {
      const semDesc = buildMotorInput({
        item: baseItem,
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      const comDesc50 = buildMotorInput({
        item: baseItem,
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 50,
        discountMode: 'PROPORTIONAL',
      })
      expect(comDesc50.dop).toBeCloseTo(semDesc.dop, 2)
    })

    it('Valores calculados sobre itemBase (PRÉ-desconto), não RV', () => {
      const input = buildMotorInput({
        item: { unit_price: 100000, quantity: 1, cost_total: 5000 },
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 25,
        discountMode: 'PROPORTIONAL',
      })
      // itemBase = 100000 (não rvItem = 75000)
      expect(input.expense_breakdown?.mo_admin.amount).toBeCloseTo(100000 * 0.1051, 2)
      expect(input.expense_breakdown?.fixa.amount).toBeCloseTo(100000 * 0.1064, 2)
      expect(input.expense_breakdown?.variavel.amount).toBeCloseTo(100000 * 0.0612, 2)
      expect(input.expense_breakdown?.financeira.amount).toBeCloseTo(100000 * 0.0043, 2)
    })

    it('Despesas só aumentam ao adicionar quantidade (não com desconto)', () => {
      const qty1 = buildMotorInput({
        item: { ...baseItem, quantity: 1 },
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 20,
        discountMode: 'PROPORTIONAL',
      })
      const qty3 = buildMotorInput({
        item: { ...baseItem, quantity: 3 },
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 20,
        discountMode: 'PROPORTIONAL',
      })
      // Quantidade triplica → dop triplica (mesmo com desconto)
      expect(qty3.dop).toBeCloseTo(qty1.dop * 3, 2)
    })
  })

  describe('Caminho V10 fallback (sem tenant.expense_breakdown)', () => {
    it('dop = itemBase × dop_pct (imutável a desconto)', () => {
      const semDesc = buildMotorInput({
        item: baseItem,
        tenantCtx: tenantCtxFallback,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      const comDesc15 = buildMotorInput({
        item: baseItem,
        tenantCtx: tenantCtxFallback,
        globalDiscountPercent: 15,
        discountMode: 'PROPORTIONAL',
      })
      expect(comDesc15.dop).toBeCloseTo(semDesc.dop, 2)
      // Valor absoluto = itemBase × dop_pct
      expect(comDesc15.dop).toBeCloseTo(135300.61 * 0.277, 2)
    })

    it('Fallback + V13 financial_expense_unit override — imutável também', () => {
      const semDesc = buildMotorInput({
        item: { ...baseItem, financial_expense_unit: 581.79 },
        tenantCtx: tenantCtxFallback,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      const comDesc20 = buildMotorInput({
        item: { ...baseItem, financial_expense_unit: 581.79 },
        tenantCtx: tenantCtxFallback,
        globalDiscountPercent: 20,
        discountMode: 'PROPORTIONAL',
      })
      expect(comDesc20.dop).toBeCloseTo(semDesc.dop, 2)
    })
  })

  describe('V14 snapshot completo — controle positivo (já era imutável)', () => {
    it('Snapshot do produto ignora desconto (comportamento V14 pré-existente)', () => {
      const itemComSnapshot = {
        unit_price: 135300.61,
        quantity: 1,
        cost_total: 7986.00,
        expense_breakdown_unit: {
          mo_admin: { rate: 0.1051, amount_unit: 14220.09 },
          fixa: { rate: 0.1064, amount_unit: 14395.98 },
          variavel: { rate: 0.0612, amount_unit: 8280.40 },
          financeira: { rate: 0.0043, amount_unit: 581.79 },
        },
      }
      const semDesc = buildMotorInput({
        item: itemComSnapshot,
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      const comDesc10 = buildMotorInput({
        item: itemComSnapshot,
        tenantCtx: tenantCtxComBreakdown,
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      // V14 já era imutável — V16.3 não regrediu esse comportamento
      expect(comDesc10.dop).toBeCloseTo(semDesc.dop, 2)
      expect(comDesc10.expense_breakdown?.mo_admin.amount).toBeCloseTo(14220.09, 2)
    })
  })

  describe('Cenário Founder real (screenshot 2026-05-28)', () => {
    it('Reproduz valores do screenshot: 4 buckets idênticos com 0% e 10% desc', () => {
      const tenantCenarioReal = {
        regime: 'LUCRO_REAL' as const,
        rates: baseRates,
        dop_pct: 0.277,
        csll_pct: 0.008,
        irpj_pct: 0.016,
        useSnapshotRates: false,
        expense_breakdown: {
          administrative_pct: 0.10510,
          fixed_pct: 0.10640,
          variable_pct: 0.06120,
          financial_pct: 0.00430,
        },
      }
      const item = { unit_price: 135300.61, quantity: 1, cost_total: 7986.00 }

      const semDesc = buildMotorInput({
        item, tenantCtx: tenantCenarioReal,
        globalDiscountPercent: 0, discountMode: 'PROPORTIONAL',
      })
      const comDesc10 = buildMotorInput({
        item, tenantCtx: tenantCenarioReal,
        globalDiscountPercent: 10, discountMode: 'PROPORTIONAL',
      })

      // Valores do screenshot (cenário SEM desconto):
      // MO Admin = 14.220,09, Fixa = 14.395,98, Variável = 8.280,40, Financeira = 581,79
      expect(semDesc.expense_breakdown?.mo_admin.amount).toBeCloseTo(14220.09, 1)
      expect(semDesc.expense_breakdown?.fixa.amount).toBeCloseTo(14395.98, 1)
      expect(semDesc.expense_breakdown?.variavel.amount).toBeCloseTo(8280.40, 1)
      expect(semDesc.expense_breakdown?.financeira.amount).toBeCloseTo(581.79, 1)

      // V16.3: com 10% desc, valores PERMANECEM idênticos (não 12.798,08 / 12.956,39 / etc)
      expect(comDesc10.expense_breakdown?.mo_admin.amount).toBeCloseTo(14220.09, 1)
      expect(comDesc10.expense_breakdown?.fixa.amount).toBeCloseTo(14395.98, 1)
      expect(comDesc10.expense_breakdown?.variavel.amount).toBeCloseTo(8280.40, 1)
      expect(comDesc10.expense_breakdown?.financeira.amount).toBeCloseTo(581.79, 1)
    })
  })
})
