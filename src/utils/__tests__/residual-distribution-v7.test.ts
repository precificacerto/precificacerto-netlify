/**
 * Tests do Epic MRM-V7 (ADR-010 — Display vs Snapshot Fiscal).
 *
 * Cobertura conforme `docs/qa/QA-VALIDATION-EPIC-MRM-V7.md`:
 *   - C1: sem desconto + cadastro 5%/10% → valores nominais do produto
 *   - C2: desc 10% PROPORTIONAL → cenário canônico do user (R$ 2.351,78 / R$ 4.703,55)
 *   - C3: desc 10% SELLER → clamp (Comissão R$ 0 / Lucro intacto)
 *   - C4: desc 10% PROFIT → clamp (Comissão intacta / Lucro ≈ R$ 0)
 *   - C5: desc 5% PROPORTIONAL → meia margem reduzida
 *   - C7: multi-produto agregado
 *   - C8: MEI/SN oculta IRPJ/CSLL
 */

import { computeResidualDistribution, type ResidualItemInput } from '../residual-distribution'

// Cenário canônico do user (Hyago, 2026-05-24)
const CANONICAL_ITEM: ResidualItemInput = {
  unit_price: 141106.60,
  quantity: 1,
  commission_percent: 5,
  profit_percent: 10,
  tax_breakdown: null,
}

const TENANT_RATES = { irpj: 0.018, csll: 0.0108 }

describe('Epic MRM-V7 — Display-First Distribution (ADR-010)', () => {
  describe('C1 — Sem desconto: valores nominais do cadastro do produto', () => {
    it('Comissão = sale_price × commission_pct (R$ 7.055,33)', () => {
      const r = computeResidualDistribution(
        [CANONICAL_ITEM],
        141106.60, 141106.60,
        'LUCRO_PRESUMIDO',
        TENANT_RATES,
        0, // desc = 0
        'PROPORTIONAL',
      )
      expect(r.commission.amount).toBeCloseTo(7055.33, 1)
      expect(r.profit.amount).toBeCloseTo(14110.66, 1)
      expect(r.hasDiscount).toBe(false)
    })

    it('IRPJ = totalNet × tenant_irpj (R$ 2.539,92)', () => {
      const r = computeResidualDistribution(
        [CANONICAL_ITEM],
        141106.60, 141106.60,
        'LUCRO_PRESUMIDO',
        TENANT_RATES,
        0, 'PROPORTIONAL',
      )
      expect(r.irpj.amount).toBeCloseTo(141106.60 * 0.018, 1)
      expect(r.csll.amount).toBeCloseTo(141106.60 * 0.0108, 1)
    })
  })

  describe('C2 — Desc 10% PROPORTIONAL (cenário canônico do user)', () => {
    const r = computeResidualDistribution(
      [CANONICAL_ITEM],
      141106.60, 126995.94,
      'LUCRO_PRESUMIDO',
      TENANT_RATES,
      10, 'PROPORTIONAL',
    )

    it('Comissão = R$ 2.351,78 (BLOCKING — QG-001)', () => {
      expect(r.commission.amount).toBeCloseTo(2351.78, 1)
    })
    it('Lucro = R$ 4.703,55 (BLOCKING — QG-001)', () => {
      expect(r.profit.amount).toBeCloseTo(4703.55, 1)
    })
    it('IRPJ = R$ 2.285,93 (= 126.995,94 × 1,8%)', () => {
      expect(r.irpj.amount).toBeCloseTo(2285.93, 1)
    })
    it('CSLL = R$ 1.371,56 (= 126.995,94 × 1,08%)', () => {
      expect(r.csll.amount).toBeCloseTo(1371.56, 1)
    })
    it('hasDiscount = true', () => {
      expect(r.hasDiscount).toBe(true)
    })
  })

  describe('C3 — Desc 10% SELLER_REDUCTION (vendedor absorve, clamp em 0)', () => {
    const r = computeResidualDistribution(
      [CANONICAL_ITEM],
      141106.60, 126995.94,
      'LUCRO_PRESUMIDO',
      TENANT_RATES,
      10, 'SELLER_REDUCTION',
    )

    it('Comissão clamped em R$ 0 (desconto 14.110 > comissão 7.055)', () => {
      expect(r.commission.amount).toBe(0)
    })
    it('Lucro intacto em R$ 14.110,66', () => {
      expect(r.profit.amount).toBeCloseTo(14110.66, 1)
    })
  })

  describe('C4 — Desc 10% PROFIT_REDUCTION (empresa absorve)', () => {
    const r = computeResidualDistribution(
      [CANONICAL_ITEM],
      141106.60, 126995.94,
      'LUCRO_PRESUMIDO',
      TENANT_RATES,
      10, 'PROFIT_REDUCTION',
    )

    it('Comissão intacta em R$ 7.055,33', () => {
      expect(r.commission.amount).toBeCloseTo(7055.33, 1)
    })
    it('Lucro ≈ R$ 0 (desconto 14.110 ≈ lucro 14.110)', () => {
      expect(r.profit.amount).toBeCloseTo(0, 1)
    })
  })

  describe('C5 — Desc 5% PROPORTIONAL (meia margem reduzida)', () => {
    const r = computeResidualDistribution(
      [CANONICAL_ITEM],
      141106.60, 134051.27,
      'LUCRO_PRESUMIDO',
      TENANT_RATES,
      5, 'PROPORTIONAL',
    )
    // desconto absoluto = 141106.60 × 5% = R$ 7.055,33
    // reducao_comm = 7055.33 × (5/15) = R$ 2.351,78
    // reducao_lucro = 7055.33 × (10/15) = R$ 4.703,55
    // Comissão final = 7055.33 − 2351.78 = R$ 4.703,55
    // Lucro final = 14110.66 − 4703.55 = R$ 9.407,11
    it('Comissão = R$ 4.703,55', () => {
      expect(r.commission.amount).toBeCloseTo(4703.55, 1)
    })
    it('Lucro = R$ 9.407,11', () => {
      expect(r.profit.amount).toBeCloseTo(9407.11, 1)
    })
  })

  describe('C7 — Multi-produto agregado', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 100, quantity: 1, commission_percent: 10, profit_percent: 20, tax_breakdown: null },
      { unit_price: 200, quantity: 1, commission_percent: 5, profit_percent: 15, tax_breakdown: null },
    ]
    // Sem desconto: Comissão = 10 + 10 = R$ 20; Lucro = 20 + 30 = R$ 50
    // Com desc 10% (R$ 30 abs): cada item absorve proporcional
    //   Item 1: desc 10, margem 30 → reducao_comm = 10×(10/30) = 3.33; comm final = 6.67
    //   Item 2: desc 20, margem 40 → reducao_comm = 20×(5/20) = 5; comm final = 5
    //   Total Comissão = 11.67
    const r = computeResidualDistribution(
      items, 300, 270,
      'LUCRO_PRESUMIDO',
      TENANT_RATES,
      10, 'PROPORTIONAL',
    )
    it('Comissão agregada de 2 produtos', () => {
      expect(r.commission.amount).toBeCloseTo(11.67, 1)
    })
    it('Lucro agregado de 2 produtos', () => {
      // Item 1: reducao_lucro = 10×(20/30) = 6.67; lucro final = 13.33
      // Item 2: reducao_lucro = 20×(15/20) = 15; lucro final = 15
      // Total = 28.33
      expect(r.profit.amount).toBeCloseTo(28.33, 1)
    })
    it('IRPJ sobre totalNet', () => {
      expect(r.irpj.amount).toBeCloseTo(270 * 0.018, 2)
    })
  })

  describe('C8 — Regime MEI/SN oculta IRPJ/CSLL', () => {
    const r = computeResidualDistribution(
      [CANONICAL_ITEM],
      141106.60, 126995.94,
      'SIMPLES_NACIONAL',
      TENANT_RATES,
      10, 'PROPORTIONAL',
    )
    it('hidesProfitTaxes = true', () => {
      expect(r.hidesProfitTaxes).toBe(true)
    })
    it('IRPJ e CSLL = R$ 0 (suprimidos por regime)', () => {
      expect(r.irpj.amount).toBe(0)
      expect(r.csll.amount).toBe(0)
    })
    it('Comissão e Lucro continuam funcionando', () => {
      expect(r.commission.amount).toBeCloseTo(2351.78, 1)
      expect(r.profit.amount).toBeCloseTo(4703.55, 1)
    })
  })

  describe('Retrocompat — sem discountPct usa caminho legacy', () => {
    it('Sem discountPct + sem snapshot → valores zerados (legacy fallback)', () => {
      const r = computeResidualDistribution(
        [{ unit_price: 100, quantity: 1, commission_percent: 5, profit_percent: 10, tax_breakdown: null }],
        100, 90,
        'LUCRO_PRESUMIDO',
        TENANT_RATES,
        // SEM discountPct nem mode → caminho legacy
      )
      // Sem discountPct, cai em extractItemValues sem snapshot → valores = 0
      expect(r.commission.amount).toBe(0)
      expect(r.profit.amount).toBe(0)
    })
  })

  describe('hasDiscount flag (controla esconder bloco no componente)', () => {
    it('totalGross === totalNet → hasDiscount = false', () => {
      const r = computeResidualDistribution(
        [CANONICAL_ITEM], 100, 100, 'LUCRO_PRESUMIDO', TENANT_RATES, 0, 'PROPORTIONAL',
      )
      expect(r.hasDiscount).toBe(false)
    })
    it('totalNet < totalGross → hasDiscount = true', () => {
      const r = computeResidualDistribution(
        [CANONICAL_ITEM], 100, 90, 'LUCRO_PRESUMIDO', TENANT_RATES, 10, 'PROPORTIONAL',
      )
      expect(r.hasDiscount).toBe(true)
    })
  })
})
