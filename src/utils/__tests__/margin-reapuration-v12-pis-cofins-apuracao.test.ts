/**
 * Tests V12 (Epic MRM-V12, ADR-013) — PIS/COFINS conversão CONSTRUÇÃO → APURAÇÃO.
 *
 * Tenant cadastra PIS+COFINS em construção (LR=7,6775%, LP=3,65%).
 * Motor RR converte runtime: apuração = construção / (1 − ICMS), aplica sobre
 * `(Âncora − ICMS)`. ISS NÃO subtrai da base.
 *
 * Cenário Hyago: PIS+COFINS_construção=7,6775% → apuração=9,25% (com ICMS=17%);
 * R$ 105.406,63 × 9,25% = R$ 9.750,11.
 */

import { calculateMarginReapuration } from '../margin-reapuration'
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

// Cenário Hyago — tenant cadastra alíquotas em CONSTRUÇÃO
// PIS=1,65% + COFINS=6,0275% = 7,6775% (LR construção)
const hyagoInput: ReapurationInput = {
  rb: 141106.60,
  desc_value: 14110.66,
  regime: 'LUCRO_REAL',
  rates: [
    rate('ICMS', 0.17),
    rate('PIS', 0.0165),
    rate('COFINS', 0.0602775),  // 7,6775 − 1,65 = 6,0275%
  ],
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
}

describe('V12 — PIS/COFINS apuração (ADR-013)', () => {
  describe('GT-V12-001 — Cenário Hyago: 7,6775% (construção) → 9,25% (apuração)', () => {
    const result = calculateMarginReapuration(hyagoInput)
    const pisLine = result.taxes_inside.find(t => t.type === 'PIS')!
    const cofinsLine = result.taxes_inside.find(t => t.type === 'COFINS')!

    it('Base PIS/COFINS = Âncora − ICMS = R$ 105.406,63 (ISS não subtrai)', () => {
      expect(pisLine.base).toBeCloseTo(105406.63, 1)
      expect(cofinsLine.base).toBeCloseTo(105406.63, 1)
    })

    it('Alíquota aplicada = 9,25% (apuração derivada de 7,6775% construção)', () => {
      const apuracao = pisLine.rate_pct + cofinsLine.rate_pct
      expect(apuracao).toBeCloseTo(0.0925, 4)
    })

    it('Amount PIS+COFINS = R$ 9.750,11', () => {
      const total = pisLine.amount + cofinsLine.amount
      expect(total).toBeCloseTo(9750.11, 0)  // ±R$ 0,50 (float precision)
    })

    it('RRO final = R$ 13.924,06', () => {
      expect(result.rro).toBeCloseTo(13924.06, 0)  // ±R$ 0,50 (float precision)
      expect(result.status).toBe('VALID')
    })
  })

  describe('V12 — Conversão runtime com ICMS variável', () => {
    it('ICMS=12%: construção 7,6775% → apuração 8,724%', () => {
      const input: ReapurationInput = {
        ...hyagoInput,
        rates: [rate('ICMS', 0.12), rate('PIS', 0.0165), rate('COFINS', 0.0602775)],
      }
      const result = calculateMarginReapuration(input)
      const apuracao = result.taxes_inside
        .filter(t => t.type === 'PIS' || t.type === 'COFINS')
        .reduce((s, l) => s + l.rate_pct, 0)
      expect(apuracao).toBeCloseTo(0.076775 / 0.88, 4)
    })

    it('ICMS=18%: construção 7,6775% → apuração 9,363%', () => {
      const input: ReapurationInput = {
        ...hyagoInput,
        rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.0602775)],
      }
      const result = calculateMarginReapuration(input)
      const apuracao = result.taxes_inside
        .filter(t => t.type === 'PIS' || t.type === 'COFINS')
        .reduce((s, l) => s + l.rate_pct, 0)
      expect(apuracao).toBeCloseTo(0.076775 / 0.82, 4)
    })

    it('ICMS=0%: apuração ≡ construção (sem fator)', () => {
      const input: ReapurationInput = {
        ...hyagoInput,
        rates: [rate('PIS', 0.0165), rate('COFINS', 0.0602775)],
      }
      const result = calculateMarginReapuration(input)
      const apuracao = result.taxes_inside
        .filter(t => t.type === 'PIS' || t.type === 'COFINS')
        .reduce((s, l) => s + l.rate_pct, 0)
      expect(apuracao).toBeCloseTo(0.076775, 5)
    })
  })

  describe('V12 — ISS não afeta base', () => {
    it('Com ISS=5%, base PIS/COFINS = Âncora − ICMS apenas (não subtrai ISS)', () => {
      const input: ReapurationInput = {
        ...hyagoInput,
        rates: [
          rate('ICMS', 0.17),
          rate('ISS', 0.05),
          rate('PIS', 0.0165),
          rate('COFINS', 0.0602775),
        ],
      }
      const result = calculateMarginReapuration(input)
      const pisLine = result.taxes_inside.find(t => t.type === 'PIS')!
      expect(pisLine.base).toBeCloseTo(126995.94 - 21589.31, 1)
    })
  })

  describe('V12 — Distribuição PIS vs COFINS', () => {
    it('Soma PIS.amount + COFINS.amount = total apuração', () => {
      const result = calculateMarginReapuration(hyagoInput)
      const pisLine = result.taxes_inside.find(t => t.type === 'PIS')!
      const cofinsLine = result.taxes_inside.find(t => t.type === 'COFINS')!
      const total = pisLine.amount + cofinsLine.amount
      expect(total).toBeCloseTo(9750.11, 0)  // ±R$ 0,50 (float precision)
    })

    it('Proporção PIS/COFINS mantém ratio construção (1,65/7,6775)', () => {
      const result = calculateMarginReapuration(hyagoInput)
      const pisLine = result.taxes_inside.find(t => t.type === 'PIS')!
      const cofinsLine = result.taxes_inside.find(t => t.type === 'COFINS')!
      const ratio = pisLine.amount / (pisLine.amount + cofinsLine.amount)
      expect(ratio).toBeCloseTo(0.0165 / 0.076775, 4)
    })
  })

  describe('V12 — Cascade trace step 8 reflete apuração', () => {
    it('cascade_trace[7] (step 8) mostra alíquota apuração 9,25%', () => {
      const result = calculateMarginReapuration(hyagoInput)
      const step8 = result.cascade_trace![7]
      expect(step8.label).toBe('Reapuração PIS/COFINS')
      expect(step8.rate).toBeCloseTo(0.0925, 4)
      expect(step8.amount).toBeCloseTo(-9750.11, 0)  // ±R$ 0,50 (float precision)
    })
  })

  describe('V12 — Engine version', () => {
    it('motor retorna engine_version 2.6.0', () => {
      const result = calculateMarginReapuration(hyagoInput)
      expect(result.engine_version).toBe('2.6.0')
    })
  })
})
