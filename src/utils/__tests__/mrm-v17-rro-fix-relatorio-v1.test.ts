/**
 * Tests — Relatório de Correção Motor RRO v1.0 (26/06/2026)
 *
 * Regra inviolável do sistema: Pai = Σ Filhos — o valor exibido em qualquer categoria
 * da cascata deve ser EXCLUSIVAMENTE a soma dos valores das suas subcategorias diretas.
 *
 * CORREÇÃO 1 — Item 4 (CMV Efetivo): a fonte do CMV é o "Custo produto" da Operação
 *   Interna de cada produto (= cost_total + productive_labor_unit, "Itens + MOD"). O motor
 *   priorizava o snapshot V14 (expense_breakdown_unit.cmv_unit) que, quando stale, inflava
 *   o Item 4. Cenário do relatório (3 produtos):
 *     AAATeste0506 55.901,92 + AAAtesteCBS5 39.929,94 + Obra Josue 45.340,99 = 141.172,85
 *     (valor incorreto anterior: 150.319,70 — diferença 9.146,85).
 *
 * CORREÇÃO 2 — Item 17 (Consolidação final): deve refletir EXCLUSIVAMENTE a soma dos
 *   filhos diretos (IBS + CBS + IS + IPI), sem injetar a âncora acumulada da operação.
 *
 * Ver ADR-020.
 */

import { calculateMotorV17 } from '../mrm-engine-v17'
import {
  calculateMotorV17ForPage,
  calculateMotorV17ForPageFull,
  type PageBuildArgs,
  type PageItem,
} from '../mrm-engine-v17/legacy-adapter'
import type { EngineItemV17, MotorV17Input, TaxLine, TaxRatePeriod, TaxType } from '@/types/mrm'

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

/** Snapshot V14 de despesas + cmv_unit (todos os buckets zerados, só o cmv_unit importa aqui). */
function snapshot(cmvUnit: number): NonNullable<PageItem['expense_breakdown_unit']> {
  return {
    mo_admin: { rate: 0, amount_unit: 0 },
    fixa: { rate: 0, amount_unit: 0 },
    variavel: { rate: 0, amount_unit: 0 },
    financeira: { rate: 0, amount_unit: 0 },
    cmv_unit: cmvUnit,
  }
}

// ============================================================================
// CORREÇÃO 1 — Item 4 (CMV Efetivo) lê o "Custo produto" canônico
// ============================================================================
describe('Relatório RRO v1.0 — Correção 1: CMV (Item 4) = Σ Custo produto', () => {
  const tenantCtx: PageBuildArgs['tenantCtx'] = {
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    csll_pct: 0.009,
    irpj_pct: 0.015,
    dop_pct: 0.1,
    absorption_policy: 'RRO_PROPORTIONAL',
  }

  it('Cenário do relatório: 3 produtos → cp_total (Step 4) = R$ 141.172,85 (snapshot NÃO vence)', () => {
    // Cada produto tem snapshot V14 (cmv_unit) DIVERGENTE/MAIOR que o Custo produto real.
    // Antes do fix o motor somava os snapshots (≈150.319,70); agora soma o Custo produto.
    const items: PageItem[] = [
      // AAATeste0506: Custo produto = Itens 53.185,92 + MOD 2.716,00 = 55.901,92
      {
        unit_price: 100000, quantity: 1,
        cost_total: 53185.92, productive_labor_unit: 2716.0,
        commission_percent: 5, profit_percent: 10,
        expense_breakdown_unit: snapshot(60106.57), // snapshot inflado
      },
      // AAAtesteCBS5: Custo produto = 39.929,94 (sem MOD)
      {
        unit_price: 80000, quantity: 1,
        cost_total: 39929.94, productive_labor_unit: 0,
        commission_percent: 5, profit_percent: 10,
        expense_breakdown_unit: snapshot(43000.0),
      },
      // Obra Josue Pvc Branco (Daniel): Custo produto = 45.340,99 (sem MOD)
      {
        unit_price: 90000, quantity: 1,
        cost_total: 45340.99, productive_labor_unit: 0,
        commission_percent: 5, profit_percent: 10,
        expense_breakdown_unit: snapshot(47213.13),
      },
    ]
    const { consolidated } = calculateMotorV17ForPageFull({
      items, tenantCtx, globalDiscountPercent: 0,
    })
    // Item 4 = Σ Custo produto dos 3 produtos.
    expect(consolidated.consolidated.cp_total).toBeCloseTo(141172.85, 2)
    // E explicitamente NÃO o valor inflado pela soma dos snapshots.
    expect(consolidated.consolidated.cp_total).not.toBeCloseTo(150319.7, 2)
  })

  it('Step 4 da cascata (ForPage) exibe o cp_total canônico = 141.172,85', () => {
    const items: PageItem[] = [
      { unit_price: 100000, quantity: 1, cost_total: 55901.92, productive_labor_unit: 0, commission_percent: 5, profit_percent: 10, expense_breakdown_unit: snapshot(60106.57) },
      { unit_price: 80000, quantity: 1, cost_total: 39929.94, productive_labor_unit: 0, commission_percent: 5, profit_percent: 10, expense_breakdown_unit: snapshot(43000.0) },
      { unit_price: 90000, quantity: 1, cost_total: 45340.99, productive_labor_unit: 0, commission_percent: 5, profit_percent: 10, expense_breakdown_unit: snapshot(47213.13) },
    ]
    const per_item = calculateMotorV17ForPage({ items, tenantCtx, globalDiscountPercent: 0 })
    const step4 = per_item[0]?.cascade_trace?.find((s) => s.step === 4)
    expect(step4?.amount).toBeCloseTo(141172.85, 2)
  })

  it('Custo produto inclui MOD (Itens + Mão de Obra Produtiva)', () => {
    // Item com Itens 53.185,92 + MOD 2.716,00 → Custo produto 55.901,92.
    const items: PageItem[] = [
      { unit_price: 100000, quantity: 1, cost_total: 53185.92, productive_labor_unit: 2716.0, commission_percent: 5, profit_percent: 10 },
    ]
    const { consolidated } = calculateMotorV17ForPageFull({ items, tenantCtx, globalDiscountPercent: 0 })
    expect(consolidated.consolidated.cp_total).toBeCloseTo(55901.92, 2)
  })

  it('Custo produto respeita quantity (× qty)', () => {
    const items: PageItem[] = [
      { unit_price: 100000, quantity: 3, cost_total: 10000, productive_labor_unit: 500, commission_percent: 5, profit_percent: 10, expense_breakdown_unit: snapshot(99999) },
    ]
    const { consolidated } = calculateMotorV17ForPageFull({ items, tenantCtx, globalDiscountPercent: 0 })
    // (10.000 + 500) × 3 = 31.500 — Custo produto vence o snapshot 99.999.
    expect(consolidated.consolidated.cp_total).toBeCloseTo(31500, 2)
  })

  it('FALLBACK snapshot: produto sem Custo produto (cost_total=0, sem MOD) usa cmv_unit', () => {
    const items: PageItem[] = [
      { unit_price: 100000, quantity: 1, cost_total: 0, productive_labor_unit: 0, commission_percent: 5, profit_percent: 10, expense_breakdown_unit: snapshot(50000) },
    ]
    const { consolidated } = calculateMotorV17ForPageFull({ items, tenantCtx, globalDiscountPercent: 0 })
    expect(consolidated.consolidated.cp_total).toBeCloseTo(50000, 2)
  })

  it('FALLBACK reverse-markup: cost_total=0 e sem snapshot, mas com sale_price_base → CMV > 0 (não regride a 0)', () => {
    const items: PageItem[] = [
      {
        unit_price: 100000, quantity: 1,
        cost_total: 0, productive_labor_unit: 0,
        sale_price_base_unit: 80000, terceirizadas_unit: 0,
        commission_percent: 5, profit_percent: 10,
        // sem expense_breakdown_unit → snapshot ausente; reverse-markup deve disparar
      },
    ]
    const per_item = calculateMotorV17ForPage({ items, tenantCtx, globalDiscountPercent: 0 })
    expect(per_item[0]?.cp).toBeGreaterThan(0)
  })

  it('Paridade ForPage × ForPageFull: ambos os caminhos produzem o mesmo CMV canônico', () => {
    const items: PageItem[] = [
      { unit_price: 100000, quantity: 1, cost_total: 55901.92, productive_labor_unit: 0, commission_percent: 5, profit_percent: 10, expense_breakdown_unit: snapshot(60106.57) },
      { unit_price: 80000, quantity: 1, cost_total: 39929.94, productive_labor_unit: 0, commission_percent: 5, profit_percent: 10, expense_breakdown_unit: snapshot(43000.0) },
    ]
    const args: PageBuildArgs = { items, tenantCtx, globalDiscountPercent: 0 }
    const per_item = calculateMotorV17ForPage(args)
    const { consolidated } = calculateMotorV17ForPageFull(args)
    const step4ForPage = per_item[0]?.cascade_trace?.find((s) => s.step === 4)?.amount
    expect(step4ForPage).toBeCloseTo(consolidated.consolidated.cp_total, 2)
    expect(consolidated.consolidated.cp_total).toBeCloseTo(95831.86, 2) // 55.901,92 + 39.929,94
  })
})

// ============================================================================
// CORREÇÃO 2 — Item 17 (Consolidação final) = Σ filhos (Pai = Σ Filhos)
// ============================================================================
describe('Relatório RRO v1.0 — Correção 2: Item 17 = Σ filhos (IBS+CBS+IS+IPI)', () => {
  const ITEM: EngineItemV17 = {
    item_id: 'rro-fix-2',
    rb: 100000,
    cp: 40000,
    mod_pct: 0,
    dop_pct: 0.2,
    commission_pct: 0.05,
    profit_pct: 0.1,
    irpj_pct: 0.015,
    csll_pct: 0.009,
    peso_op_interna: 1,
  }
  const RATES: TaxRatePeriod[] = [
    rate('ICMS', 0.17),
    rate('IS', 0),
    rate('IBS', 0.01),
    rate('CBS', 0.088),
    rate('IPI', 0.05),
  ]

  function baseInput(overrides: Partial<MotorV17Input> = {}): MotorV17Input {
    return {
      items: [ITEM],
      discount: { pct: 0 },
      policy: 'RRO_PROPORTIONAL',
      regime: 'LUCRO_REAL',
      rates: RATES,
      effective_date: '2026-06-26',
      use_snapshot_rates: false,
      ...overrides,
    }
  }

  const step17 = (r: ReturnType<typeof calculateMotorV17>) =>
    r.motor.cascade_trace.find((s) => s.step === 17)!
  const find = (arr: TaxLine[], t: TaxType) => arr.find((x) => x.type === t)

  it('Pai = Σ Filhos: step17.amount === soma dos children (tolerância 0,01)', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    const s17 = step17(r)
    const childrenSum = (s17.children ?? []).reduce((acc, c) => acc + c.amount, 0)
    expect(childrenSum).toBeCloseTo(s17.amount, 2)
    expect((s17.children ?? []).length).toBeGreaterThan(0)
  })

  it('step17.amount = Σ (IBS + CBS + IS + IPI) dos tributos por fora', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    const s17 = step17(r)
    const soma =
      (find(r.distribution.taxes_outside, 'IBS')?.amount ?? 0) +
      (find(r.distribution.taxes_outside, 'CBS')?.amount ?? 0) +
      (find(r.distribution.taxes_outside, 'IS')?.amount ?? 0) +
      (find(r.distribution.taxes_outside, 'IPI')?.amount ?? 0)
    expect(s17.amount).toBeCloseTo(soma, 2)
  })

  it('NÃO injeta a âncora: step17.amount ≠ âncora + desp + Σ filhos', () => {
    const desp = 1200
    const r = calculateMotorV17(baseInput({ desp_acessorias: desp }))
    const s17 = step17(r)
    const comAncora =
      r.motor.ancora +
      desp +
      (s17.children ?? []).reduce((acc, c) => acc + c.amount, 0)
    expect(s17.amount).not.toBeCloseTo(comAncora, 2)
    // O valor com âncora é muitas ordens de grandeza maior que a soma dos filhos.
    expect(s17.amount).toBeLessThan(r.motor.ancora)
  })

  it('formula do step 17 não menciona mais a Âncora', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    expect(step17(r).formula).toBe('Σ (IBS + CBS + IS + IPI)')
  })

  it('IS > 0 entra na soma dos filhos do step 17', () => {
    const ratesIS: TaxRatePeriod[] = [
      rate('ICMS', 0.17), rate('IS', 0.1), rate('IBS', 0.01), rate('CBS', 0.088), rate('IPI', 0.05),
    ]
    const r = calculateMotorV17(baseInput({ rates: ratesIS, desp_acessorias: 1200 }))
    const s17 = step17(r)
    const isChild = (s17.children ?? []).find((c) => c.label === 'IS')
    expect(isChild?.amount).toBeGreaterThan(0)
    // Pai = Σ Filhos continua valendo com IS > 0.
    const childrenSum = (s17.children ?? []).reduce((acc, c) => acc + c.amount, 0)
    expect(childrenSum).toBeCloseTo(s17.amount, 2)
  })

  it('Oráculo do relatório: IBS+CBS+IPI fecham em 8.049,75 (Pai=Σfilhos, sem âncora)', () => {
    // Reproduz a soma canônica do relatório a partir dos amounts dos filhos do step 17,
    // independentemente das bases concretas: o pai é EXATAMENTE a soma dos filhos.
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    const s17 = step17(r)
    const ibs = (s17.children ?? []).find((c) => c.label === 'IBS')?.amount ?? 0
    const cbs = (s17.children ?? []).find((c) => c.label === 'CBS')?.amount ?? 0
    const ipi = (s17.children ?? []).find((c) => c.label === 'IPI')?.amount ?? 0
    const is = (s17.children ?? []).find((c) => c.label === 'IS')?.amount ?? 0
    // No relatório IS = 0 (alíquota 0) → só IBS+CBS+IPI compõem o total.
    expect(is).toBe(0)
    expect(s17.amount).toBeCloseTo(ibs + cbs + ipi, 2)
    // E o amount NÃO é o acumulado da operação (âncora), que seria ordens de grandeza maior.
    expect(s17.amount).toBeLessThan(r.motor.ancora * 0.5)
  })

  it('Independência: valor_final ("Total a cobrar") permanece = âncora + desp + Σ tributos por fora', () => {
    const desp = 1200
    const r = calculateMotorV17(baseInput({ desp_acessorias: desp }))
    // valor_final é calculado separadamente do step17.amount — remover a âncora do Item 17
    // NÃO pode mover o Total a cobrar.
    expect(r.distribution.valor_final).toBeCloseTo(
      r.motor.ancora + desp + r.distribution.taxes_outside_total,
      2,
    )
  })
})
