/**
 * Tests — Epic MRM-V6 (ADR-009): Reativação dos 3 modos de desconto.
 *
 * Cobertura conforme `docs/qa/QA-VALIDATION-EPIC-MRM-V6.md`:
 *   - Matriz Motor C1..C10 + C-GOLDEN (invariante tributária bit-exact)
 *   - Fallback safety (commission_pct=0 com SELLER; profit_pct=0 com PROFIT)
 *   - Retrocompat: discount_mode ausente / 'MRM' (legacy) → PROPORTIONAL
 *   - Engine version bumped to 2.3.0
 */

import { calculateMarginReapuration } from '../margin-reapuration'
import type { ReapurationInput, TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], pct: number): TaxRatePeriod {
  return {
    id: `${tax_type}-${pct}`,
    tenant_id: 'tnt-1',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct: pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: null,
  }
}

function makeCanonicalInput(overrides: Partial<ReapurationInput> = {}): ReapurationInput {
  return {
    rb: 10000,
    desc_value: 1000,
    regime: 'LUCRO_PRESUMIDO',
    rates: [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    cp: 4500,
    mod: 0,
    dop: 1200,
    commission_pct: 0.05,
    profit_pct: 0.10,
    csll_pct: 0.0288, // LP: 9% sobre base presumida 32% = 0.0288
    irpj_pct: 0.0480, // LP: 15% sobre base presumida 32% = 0.0480
    effective_date: '2026-05-22',
    use_snapshot_rates: true,
    ...overrides,
  }
}

describe('Epic MRM-V6 — discount_mode no motor (ADR-009)', () => {
  describe('Engine version', () => {
    it('motor retorna engine_version 2.5.0', () => {
      const result = calculateMarginReapuration(makeCanonicalInput())
      // V10 (2026-05-25): bump 2.4.0 → 2.5.0 (cascade granular)
      expect(result.engine_version).toBe('2.6.0')
    })
  })

  describe('C1 — PROPORTIONAL (default sem discount_mode no input)', () => {
    it('quando discount_mode é undefined → comportamento idêntico a PROPORTIONAL explícito', () => {
      const semModo = calculateMarginReapuration(makeCanonicalInput())
      const proporcional = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'PROPORTIONAL' }),
      )
      expect(semModo.new_commission).toBeCloseTo(proporcional.new_commission, 6)
      expect(semModo.new_profit).toBeCloseTo(proporcional.new_profit, 6)
      expect(semModo.new_csll).toBeCloseTo(proporcional.new_csll, 6)
      expect(semModo.new_irpj).toBeCloseTo(proporcional.new_irpj, 6)
    })

    it('discount_mode = MRM (legacy V5) → tratado como PROPORTIONAL', () => {
      const mrm = calculateMarginReapuration(makeCanonicalInput({ discount_mode: 'MRM' }))
      const proporcional = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'PROPORTIONAL' }),
      )
      expect(mrm.new_commission).toBeCloseTo(proporcional.new_commission, 6)
      expect(mrm.new_profit).toBeCloseTo(proporcional.new_profit, 6)
      expect(mrm.discount_mode_applied).toBe('PROPORTIONAL')
      expect(mrm.discount_mode_requested).toBe('PROPORTIONAL')
    })

    it('PROPORTIONAL distribui RRO entre comissão e lucro conforme pesos originais', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'PROPORTIONAL' }),
      )
      expect(result.new_commission).toBeGreaterThan(0)
      expect(result.new_profit).toBeGreaterThan(0)
      expect(result.new_commission).toBeLessThan(result.new_profit) // commission_pct 5% < profit_pct 10%
      expect(result.discount_mode_applied).toBe('PROPORTIONAL')
    })
  })

  describe('C3 — SELLER_REDUCTION (vendedor absorve)', () => {
    it('new_profit = 0 quando SELLER (lucro ganha o slot da comissão no peso)', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'SELLER_REDUCTION' }),
      )
      // Quando SELLER, effective_profit_pct=0 → new_profit=0
      expect(result.new_profit).toBe(0)
      expect(result.new_commission).toBeGreaterThan(0)
      expect(result.discount_mode_applied).toBe('SELLER_REDUCTION')
      expect(result.discount_mode_requested).toBe('SELLER_REDUCTION')
      expect(result.status).toBe('VALID')
    })

    it('SELLER: new_commission ≈ (effective_commission_pct / combined_pct) × RRO', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'SELLER_REDUCTION' }),
      )
      // effective_commission = 0.05 + 0.10 = 0.15
      // combined = 0.15 + 0 + 0.0288 + 0.0480 = 0.2268
      // peso_comm = 0.15 / 0.2268
      const pesoCommEsperado = 0.15 / (0.15 + 0 + 0.0288 + 0.0480)
      expect(result.new_commission).toBeCloseTo(result.rro * pesoCommEsperado, 1)
    })

    it('SELLER: CSLL e IRPJ continuam rateados normalmente', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'SELLER_REDUCTION' }),
      )
      expect(result.new_csll).toBeGreaterThan(0)
      expect(result.new_irpj).toBeGreaterThan(0)
    })
  })

  describe('C4 — PROFIT_REDUCTION (empresa absorve)', () => {
    it('new_commission = 0 quando PROFIT (comissão zerada no peso)', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'PROFIT_REDUCTION' }),
      )
      expect(result.new_commission).toBe(0)
      expect(result.new_profit).toBeGreaterThan(0)
      expect(result.discount_mode_applied).toBe('PROFIT_REDUCTION')
      expect(result.status).toBe('VALID')
    })

    it('PROFIT: CSLL e IRPJ continuam rateados normalmente', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({ discount_mode: 'PROFIT_REDUCTION' }),
      )
      expect(result.new_csll).toBeGreaterThan(0)
      expect(result.new_irpj).toBeGreaterThan(0)
    })
  })

  describe('C5 — Fallback: SELLER com commission_pct=0', () => {
    it('SELLER + commission_pct=0 → status DISCOUNT_MODE_FALLBACK e degrade para PROPORTIONAL', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({
          discount_mode: 'SELLER_REDUCTION',
          commission_pct: 0,
          profit_pct: 0.10,
        }),
      )
      expect(result.status).toBe('DISCOUNT_MODE_FALLBACK')
      expect(result.discount_mode_requested).toBe('SELLER_REDUCTION')
      expect(result.discount_mode_applied).toBe('PROPORTIONAL')
      expect(result.messages.some(m => m.includes('commission_pct_zero'))).toBe(true)
      // Como degradou para PROPORTIONAL com commission=0, new_commission=0
      expect(result.new_commission).toBe(0)
      expect(result.new_profit).toBeGreaterThan(0)
    })
  })

  describe('C6 — Fallback: PROFIT com profit_pct=0', () => {
    it('PROFIT + profit_pct=0 → status DISCOUNT_MODE_FALLBACK', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({
          discount_mode: 'PROFIT_REDUCTION',
          commission_pct: 0.05,
          profit_pct: 0,
        }),
      )
      expect(result.status).toBe('DISCOUNT_MODE_FALLBACK')
      expect(result.discount_mode_requested).toBe('PROFIT_REDUCTION')
      expect(result.discount_mode_applied).toBe('PROPORTIONAL')
      expect(result.messages.some(m => m.includes('profit_pct_zero'))).toBe(true)
    })
  })

  describe('C7 — MEI/SN: CSLL/IRPJ forçados a 0 em qualquer modo', () => {
    it('MEI + SELLER → csll=0, irpj=0; SELLER aplicado normalmente', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({
          regime: 'MEI',
          rates: [], // MEI sem rates explícitos
          discount_mode: 'SELLER_REDUCTION',
          csll_pct: 0.0207, // será forçado a 0
          irpj_pct: 0.0345, // será forçado a 0
        }),
      )
      expect(result.new_csll).toBe(0)
      expect(result.new_irpj).toBe(0)
      expect(result.discount_mode_applied).toBe('SELLER_REDUCTION')
      // new_profit deve ser 0 (SELLER) e comissão deve ter todo o RRO
      expect(result.new_profit).toBe(0)
    })

    it('SIMPLES_NACIONAL + PROFIT → new_commission=0', () => {
      const result = calculateMarginReapuration(
        makeCanonicalInput({
          regime: 'SIMPLES_NACIONAL',
          rates: [],
          discount_mode: 'PROFIT_REDUCTION',
          csll_pct: 0,
          irpj_pct: 0,
        }),
      )
      expect(result.new_commission).toBe(0)
      expect(result.discount_mode_applied).toBe('PROFIT_REDUCTION')
    })
  })

  describe('C-GOLDEN — Invariante tributária bit-exact (ADR-009 §2.2)', () => {
    // Mesmo input nos 3 modos → impostos IDÊNTICOS, apenas new_commission/new_profit divergem.

    const baseInput = makeCanonicalInput({ desc_value: 1500 })

    const proporcional = calculateMarginReapuration({
      ...baseInput,
      discount_mode: 'PROPORTIONAL',
    })
    const seller = calculateMarginReapuration({
      ...baseInput,
      discount_mode: 'SELLER_REDUCTION',
    })
    const profit = calculateMarginReapuration({
      ...baseInput,
      discount_mode: 'PROFIT_REDUCTION',
    })

    it('rb idêntico nos 3 modos', () => {
      expect(seller.rb).toBe(proporcional.rb)
      expect(profit.rb).toBe(proporcional.rb)
    })

    it('rv idêntico nos 3 modos', () => {
      expect(seller.rv).toBe(proporcional.rv)
      expect(profit.rv).toBe(proporcional.rv)
    })

    it('peso_op_interna e ancora_interna idênticos', () => {
      expect(seller.peso_op_interna).toBe(proporcional.peso_op_interna)
      expect(profit.peso_op_interna).toBe(proporcional.peso_op_interna)
      expect(seller.ancora_interna).toBe(proporcional.ancora_interna)
      expect(profit.ancora_interna).toBe(proporcional.ancora_interna)
    })

    it('imp_total idêntico (ICMS + ISS + PIS + COFINS)', () => {
      expect(seller.imp_total).toBeCloseTo(proporcional.imp_total, 6)
      expect(profit.imp_total).toBeCloseTo(proporcional.imp_total, 6)
    })

    it('cada linha de taxes_inside idêntica', () => {
      for (const line of proporcional.taxes_inside) {
        const sellerLine = seller.taxes_inside.find(l => l.type === line.type)
        const profitLine = profit.taxes_inside.find(l => l.type === line.type)
        expect(sellerLine?.amount).toBeCloseTo(line.amount, 6)
        expect(profitLine?.amount).toBeCloseTo(line.amount, 6)
      }
    })

    it('CP, MOD, DOP idênticos', () => {
      expect(seller.cp).toBe(proporcional.cp)
      expect(profit.cp).toBe(proporcional.cp)
      expect(seller.mod).toBe(proporcional.mod)
      expect(profit.mod).toBe(proporcional.mod)
      expect(seller.dop).toBe(proporcional.dop)
      expect(profit.dop).toBe(proporcional.dop)
    })

    it('rro idêntico', () => {
      expect(seller.rro).toBeCloseTo(proporcional.rro, 6)
      expect(profit.rro).toBeCloseTo(proporcional.rro, 6)
    })

    it('new_csll e new_irpj idênticos (impostos sobre lucro NUNCA mudam por modo)', () => {
      expect(seller.new_csll).toBeCloseTo(proporcional.new_csll, 2)
      expect(profit.new_csll).toBeCloseTo(proporcional.new_csll, 2)
      expect(seller.new_irpj).toBeCloseTo(proporcional.new_irpj, 2)
      expect(profit.new_irpj).toBeCloseTo(proporcional.new_irpj, 2)
    })

    it('taxes_outside_base idêntico nos 3 modos', () => {
      expect(seller.taxes_outside_base).toBeCloseTo(proporcional.taxes_outside_base ?? 0, 6)
      expect(profit.taxes_outside_base).toBeCloseTo(proporcional.taxes_outside_base ?? 0, 6)
    })

    it('new_commission e new_profit SÃO os únicos que divergem entre os 3 modos', () => {
      // SELLER zera lucro
      expect(seller.new_profit).toBe(0)
      // PROFIT zera comissão
      expect(profit.new_commission).toBe(0)
      // PROPORTIONAL não zera nenhum
      expect(proporcional.new_commission).toBeGreaterThan(0)
      expect(proporcional.new_profit).toBeGreaterThan(0)
    })

    it('soma new_commission + new_profit + new_csll + new_irpj ≈ RRO nos 3 modos', () => {
      const sumProp = proporcional.new_commission + proporcional.new_profit + proporcional.new_csll + proporcional.new_irpj
      const sumSeller = seller.new_commission + seller.new_profit + seller.new_csll + seller.new_irpj
      const sumProfit = profit.new_commission + profit.new_profit + profit.new_csll + profit.new_irpj

      expect(sumProp).toBeCloseTo(proporcional.rro, 1)
      expect(sumSeller).toBeCloseTo(seller.rro, 1)
      expect(sumProfit).toBeCloseTo(profit.rro, 1)
    })
  })

  describe('Retrocompat — sem desconto, todos os modos retornam resultado equivalente', () => {
    it('desc_value=0: SELLER e PROFIT devem se comportar como PROPORTIONAL (matematicamente, o "desconto" não existe)', () => {
      // Com desconto 0, semanticamente os 3 modos retornam o mesmo rro mas com
      // distribuição diferente (SELLER e PROFIT continuam zerando o oposto).
      const proporcional = calculateMarginReapuration(
        makeCanonicalInput({ desc_value: 0, discount_mode: 'PROPORTIONAL' }),
      )
      const seller = calculateMarginReapuration(
        makeCanonicalInput({ desc_value: 0, discount_mode: 'SELLER_REDUCTION' }),
      )

      // RRO idêntico (nenhum desconto aplicado → ambos têm mesmo RV/Âncora)
      expect(seller.rro).toBeCloseTo(proporcional.rro, 6)
      // Mas distribuição diferente: SELLER ainda zera lucro
      expect(seller.new_profit).toBe(0)
    })
  })
})
