/**
 * ADENDO OFICIAL DE CORREÇÃO — MOTOR RRO (2026-06-02, Seção 23.1)
 *
 * Valida que os pesos da redistribuição do Resultado Residual Operacional (RRO)
 * derivam dos percentuais ESTRUTURAIS ORIGINAIS da precificação:
 *   - Em LUCRO_REAL, IRPJ/CSLL incidem sobre o LUCRO do produto (profit_pct),
 *     NÃO sobre a margem global do tenant (que distorcia os pesos).
 *
 * Cenário real reportado (tenant Esquadrias De Paula, produtos AAAteste/AAAteste2):
 *   - AAAteste : preço 109.708,49 · comissão 5% · lucro 10%
 *   - AAAteste2: preço  16.421,77 · comissão 3% · lucro 10%
 *   - Regime LUCRO_REAL (IRPJ 15% / CSLL 9%)
 *
 * Pesos esperados (Excel "correto" do Founder):
 *   Comissão 27,653% · Lucro 58,344% · IRPJ 8,752% · CSLL 5,251%
 *
 * Antes da correção, o sistema usava a margem global do tenant (0 → default 12%),
 * produzindo IRPJ 1,8% / CSLL 1,08% → pesos 26,9 / 56,8 / 10,2 / 6,1 (errado).
 */

import {
  resolveStructuralProfitTaxes,
  IRPJ_NOMINAL_RATE_LR,
  CSLL_NOMINAL_RATE_LR,
} from '../item-tax-rates'
import {
  calculateMotorV17ForPageFull,
  type PageBuildArgs,
} from '../mrm-engine-v17/legacy-adapter'
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

describe('Adendo RRO — resolveStructuralProfitTaxes (helper)', () => {
  it('LUCRO_REAL: IRPJ/CSLL derivam do lucro do produto × alíquota nominal (ignora tenant inflado)', () => {
    // lucro 10%, tenant inflado (margem global 12% → 1,8%/1,08%)
    const r = resolveStructuralProfitTaxes('LUCRO_REAL', 0.10, null, 0.0108, 0.018)
    expect(r.irpj_pct).toBeCloseTo(0.10 * IRPJ_NOMINAL_RATE_LR, 6) // 1,5%
    expect(r.csll_pct).toBeCloseTo(0.10 * CSLL_NOMINAL_RATE_LR, 6) // 0,9%
  })

  it('LUCRO_REAL: override explícito do produto prevalece sobre derivação', () => {
    const r = resolveStructuralProfitTaxes('LUCRO_REAL', 0.10, { irpj_pct: 0.02, csll_pct: 0.012 }, 0, 0)
    expect(r.irpj_pct).toBeCloseTo(0.02, 6)
    expect(r.csll_pct).toBeCloseTo(0.012, 6)
  })

  it('LUCRO_REAL: lucro 0 → IRPJ/CSLL 0 (sem lucro estrutural, sem imposto sobre lucro)', () => {
    const r = resolveStructuralProfitTaxes('LUCRO_REAL', 0, null, 0.0108, 0.018)
    expect(r.irpj_pct).toBe(0)
    expect(r.csll_pct).toBe(0)
  })

  it('LUCRO_PRESUMIDO: mantém fallback tenant (presunção sobre receita, não lucro do produto)', () => {
    const r = resolveStructuralProfitTaxes('LUCRO_PRESUMIDO', 0.10, null, 0.0108, 0.018)
    expect(r.irpj_pct).toBeCloseTo(0.018, 6)
    expect(r.csll_pct).toBeCloseTo(0.0108, 6)
  })
})

describe('Adendo RRO — pesos de redistribuição (cenário AAAteste/AAAteste2)', () => {
  const args: PageBuildArgs = {
    items: [
      { unit_price: 109708.48942775217, quantity: 1, cost_total: 1000, commission_percent: 5, profit_percent: 10 },
      { unit_price: 16421.773984266092, quantity: 1, cost_total: 1000, commission_percent: 3, profit_percent: 10 },
    ],
    tenantCtx: {
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.0), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      // tenant inflado de propósito (margem global → 1,8%/1,08%): NÃO deve ser usado em LR
      csll_pct: 0.0108,
      irpj_pct: 0.018,
      dop_pct: 0.10,
      absorption_policy: 'RRO_PROPORTIONAL',
    },
    globalDiscountPercent: 0,
  }

  it('pesos batem com o Excel correto (27,653 / 58,344 / 8,752 / 5,251)', () => {
    const { consolidated } = calculateMotorV17ForPageFull(args)
    const v = consolidated.consolidated
    expect(v.peso_comissao_original).toBeCloseTo(0.27653, 4)
    expect(v.peso_lucro_original).toBeCloseTo(0.58344, 4)
    expect(v.peso_irpj_original).toBeCloseTo(0.08752, 4)
    expect(v.peso_csll_original).toBeCloseTo(0.05251, 4)
  })

  it('pesos somam 1', () => {
    const { consolidated } = calculateMotorV17ForPageFull(args)
    const v = consolidated.consolidated
    const soma =
      v.peso_comissao_original + v.peso_lucro_original + v.peso_irpj_original + v.peso_csll_original
    expect(soma).toBeCloseTo(1, 6)
  })
})
