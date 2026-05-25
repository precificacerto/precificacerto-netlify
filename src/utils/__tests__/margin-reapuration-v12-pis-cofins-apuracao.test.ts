/**
 * Tests V12 (Epic MRM-V12, ADR-013) — PIS/COFINS apuração: base = Âncora − ICMS.
 *
 * Tenant configura alíquotas em APURAÇÃO direta (LR=9,25%, LP=3,65%).
 * Motor aplica sobre `(Âncora − ICMS)` — ISS não subtrai.
 *
 * Identidade matemática (motivação): apuração = construção / (1 − ICMS)
 * Cenário Hyago: 105.406,63 × 9,25% = R$ 9.750,11.
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

const hyagoInput: ReapurationInput = {
  rb: 141106.60,
  desc_value: 14110.66,
  regime: 'LUCRO_REAL',
  rates: [
    rate('ICMS', 0.17),
    rate('PIS', 0.0165),
    rate('COFINS', 0.076),  // total LR apuração: 9,25%
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
  describe('GT-V12-001 — Cenário Hyago: R$ 9.750,11', () => {
    const result = calculateMarginReapuration(hyagoInput)
    const pisLine = result.taxes_inside.find(t => t.type === 'PIS')!
    const cofinsLine = result.taxes_inside.find(t => t.type === 'COFINS')!

    it('Base PIS/COFINS = Âncora − ICMS = R$ 105.406,63 (ISS não subtrai)', () => {
      expect(pisLine.base).toBeCloseTo(105406.63, 1)
      expect(cofinsLine.base).toBeCloseTo(105406.63, 1)
    })

    it('Alíquota aplicada = 9,25% (direta do tenant — apuração)', () => {
      expect(pisLine.rate_pct + cofinsLine.rate_pct).toBeCloseTo(0.0925, 5)
    })

    it('Amount PIS+COFINS = R$ 9.750,11', () => {
      const total = pisLine.amount + cofinsLine.amount
      expect(total).toBeCloseTo(9750.11, 1)
    })

    it('RRO final = R$ 13.924,06', () => {
      expect(result.rro).toBeCloseTo(13924.06, 1)
      expect(result.status).toBe('VALID')
    })
  })

  describe('V12 — Base muda de V10', () => {
    it('ISS=5% NÃO entra na base PIS/COFINS (diferente de V10)', () => {
      const input: ReapurationInput = {
        ...hyagoInput,
        rates: [
          rate('ICMS', 0.17),
          rate('ISS', 0.05),
          rate('PIS', 0.0165),
          rate('COFINS', 0.076),
        ],
      }
      const result = calculateMarginReapuration(input)
      const pisLine = result.taxes_inside.find(t => t.type === 'PIS')!
      // V12: base = Âncora − ICMS apenas (não − ICMS − ISS como V10)
      expect(pisLine.base).toBeCloseTo(126995.94 - 21589.31, 1)
    })

    it('ICMS=0 → base = Âncora completa', () => {
      const input: ReapurationInput = {
        ...hyagoInput,
        rates: [rate('PIS', 0.0165), rate('COFINS', 0.076)],
      }
      const result = calculateMarginReapuration(input)
      const pisLine = result.taxes_inside.find(t => t.type === 'PIS')!
      expect(pisLine.base).toBeCloseTo(126995.94, 1)
    })
  })

  describe('V12 — Identidade matemática (validação STF)', () => {
    it('amount V12 (apuração × base_pós_ICMS) ≡ amount equivalente (construção × Âncora)', () => {
      // V12 com apuração 9,25%: 105.406,63 × 9,25% = 9.750,11
      const result = calculateMarginReapuration(hyagoInput)
      const v12Amount = result.taxes_inside
        .filter(t => t.type === 'PIS' || t.type === 'COFINS')
        .reduce((s, l) => s + l.amount, 0)

      // Equivalência: construção × Âncora = 7,6775% × 126.995,94 = 9.750,12
      const construcao = 0.0925 * (1 - 0.17)
      const equivAmount = 126995.94 * construcao
      expect(v12Amount).toBeCloseTo(equivAmount, 1)
    })
  })

  describe('V12 — Engine version', () => {
    it('motor retorna engine_version 2.6.0', () => {
      const result = calculateMarginReapuration(hyagoInput)
      expect(result.engine_version).toBe('2.6.0')
    })
  })
})
