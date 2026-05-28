/**
 * Tests V10 (Epic MRM-V10, ADR-011) — Cascade granular com sub-itens (children).
 *
 * Cobre invariantes V10-I1 a V10-I6 (definidas em
 * `docs/architecture/ARCH-EPIC-MRM-V10.md` §4):
 *   I1: Σ step10.children.amount ≈ step10.amount
 *   I2: Σ step12.children.amount ≈ step12.amount
 *   I3: Σ step12.children.peso ≈ 1
 *   I4: Σ step13.children.amount ≈ step13.amount
 *   I5: buildMotorInput().dop === rv × dop_pct (sem mod_pct)
 *   I6: snapshot V9 (sem children) renderiza sem erro (UI graceful)
 */

import { calculateMarginReapuration } from '../margin-reapuration'
import { buildMotorInput } from '../mrm-orchestrator'
import type { ReapurationInput, TaxRatePeriod } from '@/types/mrm'

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

// Cenário Hyago canônico V10 (planilha oficial)
const hyagoV10: ReapurationInput = {
  rb: 141106.60,
  desc_value: 14110.66,
  regime: 'LUCRO_REAL',
  rates: baseRates,
  cp: 42645.94,
  mod: 0,
  dop: 39086.52,
  commission_pct: 0.05,
  profit_pct: 0.10,
  csll_pct: 0.008,
  irpj_pct: 0.016,
  peso_op_interna: 1,
  discount_mode: 'PROPORTIONAL',
  effective_date: '2026-05-25',
  use_snapshot_rates: false,
  expense_breakdown: {
    mo_admin: { rate: 0.1168, amount: 14830.30 },
    fixa: { rate: 0.1182, amount: 15013.74 },
    variavel: { rate: 0.0680, amount: 8635.72 },
    financeira: { rate: 0.0048, amount: 606.76 },
  },
}

describe('V10 — Cascade Granular (ADR-011)', () => {
  describe('V10-I1 — step 10 children somam ao parent', () => {
    it('Step 10 (Despesas DOP) tem 4 children quando expense_breakdown presente', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const step10 = result.cascade_trace![9]
      expect(step10.children).toBeDefined()
      expect(step10.children).toHaveLength(4)
    })

    it('Σ children.amount ≈ parent.amount (±R$ 0,02)', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const step10 = result.cascade_trace![9]
      const sumChildren = step10.children!.reduce((s, c) => s + c.amount, 0)
      expect(sumChildren).toBeCloseTo(step10.amount, 1)
    })

    it('Labels dos 4 children matchem planilha oficial', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const labels = result.cascade_trace![9].children!.map((c) => c.label)
      expect(labels).toEqual(['MO Administrativa', 'Despesa Fixa', 'Despesa Variável', 'Despesa Financeira'])
    })

    it('Step 10 sem expense_breakdown → children undefined (retrocompat V9)', () => {
      const { expense_breakdown: _eb, ...inputNoBreakdown } = hyagoV10
      const result = calculateMarginReapuration(inputNoBreakdown)
      const step10 = result.cascade_trace![9]
      expect(step10.children).toBeUndefined()
    })
  })

  describe('V10-I2 — step 12 children somam ao parent', () => {
    it('Step 12 (Redistribuição) tem 4 children quando rateio > 0', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const step12 = result.cascade_trace![11]
      expect(step12.children).toBeDefined()
      expect(step12.children).toHaveLength(4)
    })

    it('Σ children.amount ≈ parent.amount (±R$ 0,02)', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const step12 = result.cascade_trace![11]
      const sumChildren = step12.children!.reduce((s, c) => s + c.amount, 0)
      expect(sumChildren).toBeCloseTo(step12.amount, 1)
    })

    it('Labels dos 4 componentes da redistribuição', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const labels = result.cascade_trace![11].children!.map((c) => c.label)
      expect(labels).toEqual(['Comissão', 'Lucro', 'IRPJ', 'CSLL'])
    })
  })

  describe('V10-I3 — Σ pesos dos children do step 12 ≈ 1', () => {
    it('Pesos somam 1 (quando rateio > 0)', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const pesos = result.cascade_trace![11].children!.map((c) => c.peso ?? 0)
      const sumPesos = pesos.reduce((s, p) => s + p, 0)
      expect(sumPesos).toBeCloseTo(1, 3)
    })

    it('Peso de Comissão = 5 / 17,4 = 0,287 (cenário Hyago)', () => {
      const result = calculateMarginReapuration(hyagoV10)
      const comissao = result.cascade_trace![11].children!.find((c) => c.label === 'Comissão')
      expect(comissao?.peso).toBeCloseTo(5 / 17.4, 3)
    })
  })

  describe('V10-I4 — step 13 children por tributo configurado', () => {
    it('Step 13 sem tributos por fora → children undefined ou vazio', () => {
      // Cenário Hyago não tem IBS/CBS/etc configurados
      const result = calculateMarginReapuration(hyagoV10)
      const step13 = result.cascade_trace![12]
      expect(step13.children === undefined || step13.children.length === 0).toBe(true)
    })

    it('Step 13 com IBS+CBS configurados → 2 children', () => {
      const withOutsideTaxes: ReapurationInput = {
        ...hyagoV10,
        rates: [...baseRates, rate('IBS', 0.01), rate('CBS', 0.0875)],
      }
      const result = calculateMarginReapuration(withOutsideTaxes)
      const step13 = result.cascade_trace![12]
      expect(step13.children).toBeDefined()
      expect(step13.children).toHaveLength(2)
      expect(step13.children!.map((c) => c.label).sort()).toEqual(['CBS', 'IBS'])
    })

    it('Σ children.amount ≈ parent.amount quando há tributos por fora', () => {
      const withOutsideTaxes: ReapurationInput = {
        ...hyagoV10,
        rates: [...baseRates, rate('IBS', 0.01), rate('CBS', 0.0875)],
      }
      const result = calculateMarginReapuration(withOutsideTaxes)
      const step13 = result.cascade_trace![12]
      const sumChildren = step13.children!.reduce((s, c) => s + c.amount, 0)
      expect(sumChildren).toBeCloseTo(step13.amount, 2)
    })
  })

  describe('V10-I5 — buildMotorInput.dop = itemBase × dop_pct (V16.3 imutável a desconto)', () => {
    it('mod_pct NÃO entra em dop; dop não encolhe com desconto (V16.3)', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 141106.60,
          quantity: 1,
          cost_total: 39929.94,
          productive_labor_unit: 2716.00,
          commission_percent: 5,
          profit_percent: 10,
        },
        tenantCtx: {
          regime: 'LUCRO_REAL',
          rates: baseRates,
          mod_pct: 0.5117,
          dop_pct: 0.3078,
          csll_pct: 0.008,
          irpj_pct: 0.016,
          useSnapshotRates: false,
        },
        globalDiscountPercent: 10,
        discountMode: 'PROPORTIONAL',
      })
      // V16.3 (2026-05-28): dop = itemBase × dop_pct = 141106.60 × 0.3078 = 43432.61
      // (despesas operacionais imutáveis a desconto — semântica pré-desconto)
      expect(input.dop).toBeCloseTo(141106.60 * 0.3078, 1)
      expect(input.mod).toBe(0)
      // CP V9 D2 preservado: cost + productive_labor
      expect(input.cp).toBeCloseTo(42645.94, 2)
    })
  })

  describe('V10-I6 — Retrocompat snapshot V9 sem children', () => {
    it('Quando expense_breakdown ausente, motor produz trace válido sem children', () => {
      const { expense_breakdown: _eb, ...input } = hyagoV10
      const result = calculateMarginReapuration(input)
      expect(result.cascade_trace).toHaveLength(13)
      // Steps complexos sem children: deve ser undefined
      expect(result.cascade_trace![9].children).toBeUndefined()
      // Step 12 ainda pode ter children quando rateio>0 (depende apenas de motor internals)
    })
  })

  describe('GT-V10-001 — Cenário Hyago granular (planilha oficial)', () => {
    it('RRO = R$ 13.924,06 + 4 sub-itens despesa + 4 sub-itens redistribuição', () => {
      const result = calculateMarginReapuration(hyagoV10)

      expect(result.rro).toBeCloseTo(13924.06, 1)
      expect(result.cascade_trace![9].children).toHaveLength(4)  // despesas
      expect(result.cascade_trace![11].children).toHaveLength(4) // redistribuição
      expect(result.status).toBe('VALID')

      // MO Admin: -R$ 14.830,30
      const moAdmin = result.cascade_trace![9].children![0]
      expect(moAdmin.label).toBe('MO Administrativa')
      expect(moAdmin.amount).toBeCloseTo(-14830.30, 1)

      // Comissão: R$ 4.001,17 (peso 0,287)
      const comissao = result.cascade_trace![11].children!.find((c) => c.label === 'Comissão')!
      expect(comissao.amount).toBeCloseTo(4001.17, 1)
      expect(comissao.peso).toBeCloseTo(0.287, 2)
    })
  })
})
