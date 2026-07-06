/**
 * Tests — Adendo Oficial Seção 28-A (Julho 2026)
 * Coerência obrigatória entre o Card de Distribuição e o RRO (Etapa 16).
 *
 * Regra inviolável: a alíquota efetiva de Comissão/Lucro no card deve ter como
 * denominador a ÂNCORA GERENCIAL pós-desconto (Op. Interna, Etapa 12/16), NUNCA o
 * Total a Cobrar (contaminado por Op. Externa + Despesas Acessórias). Card e RRO
 * devem exibir a MESMA alíquota e o MESMO valor (R$), nos 3 modos.
 *
 * Bug corrigido: o resultado por item do adapter (`LegacyMotorResult`) não populava
 * `ancora_interna`, então `Σ ancora_interna = 0` nos call sites → `computeResidual
 * Distribution` caía no fallback `totalNet` (Total a Cobrar). Fix: o adapter passa a
 * popular `ancora_interna = motor.ancora × ratio` (Σ = motor.ancora).
 */

import {
  calculateMotorV17ForPage,
  calculateMotorV17ForPageFull,
  type PageBuildArgs,
} from '../mrm-engine-v17/legacy-adapter'
import { computeResidualDistribution, type ResidualItemInput } from '../residual-distribution'
import type { AbsorptionPolicy, TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 'test', tax_type,
    origin_state: null, dest_state: null, rate_pct,
    valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

function makeArgs(policy: AbsorptionPolicy, discount: number): PageBuildArgs {
  return {
    // Multi-produto heterogêneo COM terceirizadas (frete/seguro/desp. acessórias) para
    // exercitar a exclusão de Desp. Acessórias da Âncora Gerencial (Tabela 4 do 28-A).
    // Custos moderados → RRO com folga para a proteção de margem ser VIÁVEL (N4).
    items: [
      { unit_price: 60000, quantity: 1, cost_total: 15000, productive_labor_unit: 1500, commission_percent: 5, profit_percent: 15, terceirizadas_unit: 600 },
      { unit_price: 140000, quantity: 1, cost_total: 35000, productive_labor_unit: 3500, commission_percent: 5, profit_percent: 15, terceirizadas_unit: 600 },
    ],
    tenantCtx: {
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
      csll_pct: 0.009, irpj_pct: 0.015, dop_pct: 0.1,
      absorption_policy: policy,
    },
    globalDiscountPercent: discount,
  }
}

/** Constrói ResidualItemInput a partir do resultado por item do adapter (caminho real). */
function toResidualItems(perItem: ReturnType<typeof calculateMotorV17ForPage>): ResidualItemInput[] {
  return perItem
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => ({
      unit_price: r.rb, quantity: 1,
      commission_percent: 5, profit_percent: 15,
      tax_breakdown: null,
      motor_new_commission: r.new_commission,
      motor_new_profit: r.new_profit,
      motor_new_csll: r.new_csll,
      motor_new_irpj: r.new_irpj,
    }))
}

/** Âncora Gerencial derivada do resultado REAL do adapter (como fazem os call sites). */
function ancoraFromAdapter(perItem: ReturnType<typeof calculateMotorV17ForPage>): number {
  return perItem.reduce(
    (s, r) => s + (Number((r as { ancora_interna?: number } | null)?.ancora_interna) || 0),
    0,
  )
}

function etapa16Child(consolidated: ReturnType<typeof calculateMotorV17ForPageFull>['consolidated'], label: string) {
  const s16 = consolidated.motor.cascade_trace.find((s) => s.step === 16)!
  return s16.children?.find((c) => c.label === label)!
}

// ═════════════════════════════════════════════════════════════════════════════
// INT-1 — o teste que faltava: Σ ancora_interna (adapter REAL) == motor.ancora
// (Falhava antes do fix: Σ = 0 → fallback totalNet.)
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 28-A INT-1 — adapter popula ancora_interna = motor.ancora × ratio', () => {
  it('Σ ancora_interna dos itens == motor.ancora consolidado (denominador coerente)', () => {
    const { per_item, consolidated } = calculateMotorV17ForPageFull(makeArgs('RRO_PROPORTIONAL', 5))
    const soma = ancoraFromAdapter(per_item)
    expect(soma).toBeGreaterThan(0) // regressão do no-op: jamais pode ser 0
    expect(soma).toBeCloseTo(consolidated.motor.ancora, 2)
  })

  it('a Âncora Gerencial exclui Desp. Acessórias (< Total a Cobrar)', () => {
    const { per_item } = calculateMotorV17ForPageFull(makeArgs('RRO_PROPORTIONAL', 5))
    const ancora = ancoraFromAdapter(per_item)
    const totalACobrar = (60000 + 140000) * (1 - 0.05) // ~ Total a Cobrar pós-desc (aprox.)
    expect(ancora).toBeLessThan(totalACobrar)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// INT-2 / N1 / N2 — card (via computeResidualDistribution) == Etapa 16 do RRO
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 28-A N1/N2 — card espelha a Etapa 16 (alíquota E valor)', () => {
  const MODES: AbsorptionPolicy[] = ['RRO_PROPORTIONAL', 'COMMISSION_PROTECTED', 'PROFIT_PROTECTED']

  it.each(MODES)('modo %s: alíquota e valor do card == Etapa 16', (policy) => {
    const args = makeArgs(policy, 5)
    const { per_item, consolidated } = calculateMotorV17ForPageFull(args)
    const ancora = ancoraFromAdapter(per_item)
    const items = toResidualItems(per_item)
    const totalGross = 200000
    const totalNet = 190000 // Vₗ (Total a Cobrar) — deliberadamente ≠ âncora
    const card = computeResidualDistribution(
      items, totalGross, totalNet, 'LUCRO_REAL',
      { irpj: 0.015, csll: 0.009 }, 5, 'PROPORTIONAL', ancora,
    )

    const comE16 = etapa16Child(consolidated, 'Comissão')
    const lucE16 = etapa16Child(consolidated, 'Lucro')

    // N2 — valor R$ centavo a centavo
    expect(card.commission.amount).toBeCloseTo(comE16.amount, 2)
    expect(card.profit.amount).toBeCloseTo(lucE16.amount, 2)

    // N1 — alíquota efetiva idêntica (card usa a mesma âncora que a Etapa 16)
    expect(card.commission.effectivePct).toBeCloseTo((comE16.effective_rate_pct ?? 0) * 100, 4)
    expect(card.profit.effectivePct).toBeCloseTo((lucE16.effective_rate_pct ?? 0) * 100, 4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// N3 — denominador == Âncora Gerencial, NUNCA Total a Cobrar
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 28-A N3 — denominador limpo (não Total a Cobrar)', () => {
  it('o % do card difere do que seria sobre o Total a Cobrar (base contaminada)', () => {
    const args = makeArgs('RRO_PROPORTIONAL', 5)
    const { per_item } = calculateMotorV17ForPageFull(args)
    const ancora = ancoraFromAdapter(per_item)
    const items = toResidualItems(per_item)
    const totalNet = 190000
    const card = computeResidualDistribution(
      items, 200000, totalNet, 'LUCRO_REAL', { irpj: 0.015, csll: 0.009 }, 5, 'PROPORTIONAL', ancora,
    )
    // Sobre Âncora (correto) vs sobre Total a Cobrar (contaminado) — devem divergir.
    const pctSobreTotal = (card.commission.amount / totalNet) * 100
    expect(card.commission.effectivePct).toBeGreaterThan(pctSobreTotal)
    expect(ancora).toBeLessThan(totalNet)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// N4 — Modos protegidos: margem protegida no card == % original protegido
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 28-A N4 — margem protegida exibe o % original (não rebaixado)', () => {
  it('COMMISSION_PROTECTED: comissão do card ≈ 5% (alíquota nominal protegida)', () => {
    const args = makeArgs('COMMISSION_PROTECTED', 5)
    const { per_item } = calculateMotorV17ForPageFull(args)
    const ancora = ancoraFromAdapter(per_item)
    const items = toResidualItems(per_item)
    const card = computeResidualDistribution(
      items, 200000, 190000, 'LUCRO_REAL', { irpj: 0.015, csll: 0.009 }, 5, 'PROPORTIONAL', ancora,
    )
    // Comissão protegida = com_pct × Âncora → efetiva sobre Âncora == com_pct nominal (5%).
    expect(card.commission.effectivePct).toBeCloseTo(5, 1)
  })

  it('PROFIT_PROTECTED: lucro do card ≈ 15% (alíquota nominal protegida)', () => {
    const args = makeArgs('PROFIT_PROTECTED', 5)
    const { per_item } = calculateMotorV17ForPageFull(args)
    const ancora = ancoraFromAdapter(per_item)
    const items = toResidualItems(per_item)
    const card = computeResidualDistribution(
      items, 200000, 190000, 'LUCRO_REAL', { irpj: 0.015, csll: 0.009 }, 5, 'PROPORTIONAL', ancora,
    )
    expect(card.profit.effectivePct).toBeCloseTo(15, 1)
  })
})
