/**
 * Correção Card Percentual (Ago/2026) — `% original` do card "Distribuição do Resultado".
 *
 * Bug: o `% original` (X%) vinha da ALÍQUOTA DE CADASTRO, enquanto o `% efetivo` (Y%) vem do
 * motor. Fontes diferentes para grandezas comparadas → ao dar desconto, o card mostrava a
 * margem de lucro "subindo" quando ela na verdade caiu.
 *
 * Correção: o `% original` passa a ser um PAR FECHADO da rodada BASELINE do motor (desconto=0):
 *   pctOriginal = baseline.rubrica(linha 16) / baseline.âncora
 *   pctEfetivo  = atual.rubrica(linha 16)    / atual.âncora
 *
 * Estes testes exercitam a camada de agregação (`computeResidualDistribution`) com valores de
 * motor mockados — não o motor em si. Fixture inspirada nos CT-01/CT-02 do relatório.
 */

import {
  buildBaselineFromSnapshots,
  computeResidualDistribution,
  type ResidualBaselineInput,
  type ResidualItemInput,
} from '../residual-distribution'

const RATES = { irpj: 0, csll: 0 }

// ── Fixture do relatório (CT-01 baseline / CT-02 modo Congela Comissão) ──────────────────
// Baseline (desconto=0): Comissão 3.237,80 · Lucro 13.945,82 · âncora 154.588,11
//   → 2,0945% e 9,0213%
// Atual (desconto 588,11): Comissão 3.080,00 · Lucro 13.603,54 · âncora ~154.000,00
//   → 2,0000% e 8,8335%
const ANCORA_BASE = 154588.11
const ANCORA_ATUAL = 154000.0

// commission_percent/profit_percent propositalmente ABSURDOS (999) para provar que o
// `% original` NÃO lê a alíquota de cadastro — vem exclusivamente do motor baseline.
const baselineItems: ResidualItemInput[] = [
  {
    unit_price: ANCORA_BASE,
    quantity: 1,
    commission_percent: 999,
    profit_percent: 999,
    tax_breakdown: null,
    motor_new_commission: 3237.8,
    motor_new_profit: 13945.82,
  },
]

const atualItems: ResidualItemInput[] = [
  {
    unit_price: ANCORA_BASE,
    quantity: 1,
    commission_percent: 999,
    profit_percent: 999,
    tax_breakdown: null,
    motor_new_commission: 3080.0,
    motor_new_profit: 13603.54,
  },
]

const baseline: ResidualBaselineInput = {
  items: baselineItems,
  ancoraGerencial: ANCORA_BASE,
  totalGross: ANCORA_BASE,
}

describe('Card Percentual — `% original` via baseline (motor desconto=0)', () => {
  it('regressão do bug: `% original` vem do motor baseline, NÃO da alíquota de cadastro (999%)', () => {
    const dist = computeResidualDistribution(
      atualItems, ANCORA_BASE, ANCORA_ATUAL, 'LUCRO_PRESUMIDO', RATES,
      /* discountPct */ 0.3805, 'PROPORTIONAL', ANCORA_ATUAL, baseline,
    )
    // Se lesse o cadastro (999%), estes valores seriam absurdos. Vêm do baseline:
    expect(dist.commission.originalPct).toBeCloseTo(2.0945, 3)
    expect(dist.profit.originalPct).toBeCloseTo(9.0213, 3)
  })

  it('CT-02: efetivo vem da rodada atual (par fechado pós/pós)', () => {
    const dist = computeResidualDistribution(
      atualItems, ANCORA_BASE, ANCORA_ATUAL, 'LUCRO_PRESUMIDO', RATES,
      0.3805, 'PROPORTIONAL', ANCORA_ATUAL, baseline,
    )
    expect(dist.commission.effectivePct).toBeCloseTo(2.0, 3)
    expect(dist.profit.effectivePct).toBeCloseTo(8.8335, 3)
  })

  it('I1: com desconto=0 (atual === baseline), pctOriginal === pctEfetivo', () => {
    const dist = computeResidualDistribution(
      baselineItems, ANCORA_BASE, ANCORA_BASE, 'LUCRO_PRESUMIDO', RATES,
      0, 'PROPORTIONAL', ANCORA_BASE, baseline,
    )
    expect(dist.commission.originalPct).toBeCloseTo(dist.commission.effectivePct, 6)
    expect(dist.profit.originalPct).toBeCloseTo(dist.profit.effectivePct, 6)
  })

  it('I3: variar o desconto/atual NÃO altera pctOriginal (baseline imóvel)', () => {
    const atualMaisDesconto: ResidualItemInput[] = [
      { ...atualItems[0], motor_new_commission: 2800, motor_new_profit: 12000 },
    ]
    const distA = computeResidualDistribution(
      atualItems, ANCORA_BASE, ANCORA_ATUAL, 'LUCRO_PRESUMIDO', RATES, 0.38, 'PROPORTIONAL', ANCORA_ATUAL, baseline,
    )
    const distB = computeResidualDistribution(
      atualMaisDesconto, ANCORA_BASE, 152000, 'LUCRO_PRESUMIDO', RATES, 1.67, 'PROPORTIONAL', 152000, baseline,
    )
    expect(distA.profit.originalPct).toBeCloseTo(distB.profit.originalPct, 9)
    expect(distA.commission.originalPct).toBeCloseTo(distB.commission.originalPct, 9)
  })

  it('I5: para desconto>0, pctEfetivo <= pctOriginal no Lucro (nunca maior)', () => {
    const dist = computeResidualDistribution(
      atualItems, ANCORA_BASE, ANCORA_ATUAL, 'LUCRO_PRESUMIDO', RATES, 0.3805, 'PROPORTIONAL', ANCORA_ATUAL, baseline,
    )
    expect(dist.profit.effectivePct).toBeLessThanOrEqual(dist.profit.originalPct)
  })

  it('I6: valores em R$ vêm do motor atual — baseline não altera nenhum amount', () => {
    const dist = computeResidualDistribution(
      atualItems, ANCORA_BASE, ANCORA_ATUAL, 'LUCRO_PRESUMIDO', RATES, 0.3805, 'PROPORTIONAL', ANCORA_ATUAL, baseline,
    )
    expect(dist.commission.amount).toBe(3080.0)
    expect(dist.profit.amount).toBe(13603.54)
  })

  it('retrocompat: SEM baseline, `% original` mantém o legado ponderado sobre o cadastro', () => {
    // Item com cadastro 2%/9% → weightedOriginalPct = 2% e 9% (sobre totalGross).
    const legacyItems: ResidualItemInput[] = [
      {
        unit_price: 1000, quantity: 1, commission_percent: 2, profit_percent: 9,
        tax_breakdown: null, motor_new_commission: 18, motor_new_profit: 80,
      },
    ]
    const dist = computeResidualDistribution(
      legacyItems, 1000, 950, 'LUCRO_PRESUMIDO', RATES, 5, 'PROPORTIONAL', 950,
      /* baseline ausente */
    )
    expect(dist.commission.originalPct).toBeCloseTo(2, 6)
    expect(dist.profit.originalPct).toBeCloseTo(9, 6)
  })
})

// ── buildBaselineFromSnapshots — leitura do baseline persistido (QA CONCERN-2) ────────────
const tb = (over: Partial<NonNullable<ResidualItemInput['tax_breakdown']>>) =>
  ({ new_commission: 0, new_profit: 0, new_csll: 0, new_irpj: 0, ...over } as NonNullable<ResidualItemInput['tax_breakdown']>)

describe('buildBaselineFromSnapshots — snapshot persistido (retrocompat + edge cases)', () => {
  it('retorna undefined quando NENHUM item tem baseline persistido (docs antigos)', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 1000, quantity: 1, tax_breakdown: tb({ new_commission: 20, new_profit: 80 }) },
    ]
    expect(buildBaselineFromSnapshots(items, 1000)).toBeUndefined()
  })

  it('monta baseline a partir de baseline_* e soma a âncora baseline (multi-item)', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 600, quantity: 1, tax_breakdown: tb({ baseline_new_commission: 12, baseline_new_profit: 54, baseline_ancora_interna: 600 }) },
      { unit_price: 400, quantity: 1, tax_breakdown: tb({ baseline_new_commission: 8, baseline_new_profit: 36, baseline_ancora_interna: 400 }) },
    ]
    const b = buildBaselineFromSnapshots(items, 1000)
    expect(b).toBeDefined()
    expect(b!.ancoraGerencial).toBe(1000)
    // usado no compute: originalPct lucro = (54+36)/1000 = 9%
    const dist = computeResidualDistribution(
      items, 1000, 950, 'LUCRO_PRESUMIDO', RATES, 5, 'PROPORTIONAL', 950, b,
    )
    expect(dist.profit.originalPct).toBeCloseTo(9, 6)
    expect(dist.commission.originalPct).toBeCloseTo(2, 6)
  })

  it('baseline PARCIAL: item sem baseline_* não contamina numerador nem âncora', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 600, quantity: 1, tax_breakdown: tb({ baseline_new_commission: 12, baseline_new_profit: 54, baseline_ancora_interna: 600 }) },
      { unit_price: 400, quantity: 1, tax_breakdown: tb({ new_commission: 8, new_profit: 36 }) }, // sem baseline_*
    ]
    const b = buildBaselineFromSnapshots(items, 1000)
    expect(b).toBeDefined()
    // âncora só do item com baseline (600); numerador idem → 54/600 = 9%
    expect(b!.ancoraGerencial).toBe(600)
    const dist = computeResidualDistribution(
      items, 1000, 950, 'LUCRO_PRESUMIDO', RATES, 5, 'PROPORTIONAL', 950, b,
    )
    expect(dist.profit.originalPct).toBeCloseTo(9, 6)
    expect(Number.isFinite(dist.profit.originalPct)).toBe(true)
  })

  it('âncora baseline = 0 → compute cai no denominador totalGross (sem NaN/Infinity)', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 1000, quantity: 1, tax_breakdown: tb({ baseline_new_commission: 20, baseline_new_profit: 90, baseline_ancora_interna: 0 }) },
    ]
    const b = buildBaselineFromSnapshots(items, 1000)
    expect(b!.ancoraGerencial).toBe(0)
    const dist = computeResidualDistribution(
      items, 1000, 950, 'LUCRO_PRESUMIDO', RATES, 5, 'PROPORTIONAL', 950, b,
    )
    // denominador cai em totalGross (1000): 90/1000 = 9%
    expect(dist.profit.originalPct).toBeCloseTo(9, 6)
    expect(Number.isFinite(dist.profit.originalPct)).toBe(true)
  })
})
