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
 * CORREÇÃO 2 — Item 17 (Consolidação final): SUPERSEDED pelo Relatório de Correção v2.0
 *   (28/06/2026) / ADR-021. O Step 17 deixa de somar os tributos REAIS por fora
 *   (taxes_outside, que re-somam a Desp. Acessória nas bases e não fechavam com o Step 12) e
 *   passa a redistribuir a Op. Externa pós-desconto do Step 12 (autoridade gerencial) pelos
 *   pesos da construção ORIGINAL do Step 8 (pré-desconto). Pai = Σ Filhos = Step 12.
 *   Mudança DISPLAY-only: taxes_outside / valor_final / RRO permanecem intactos.
 *
 * Ver ADR-020 (Correção 1, vigente) e ADR-021 (Correção 2, revoga a versão v1.0 do Item 17).
 */

import { calculateMotorV17 } from '../mrm-engine-v17'
import { computeIvaDualFromBase } from '../iva-dual-outside'
import {
  calculateMotorV17ForPage,
  calculateMotorV17ForPageFull,
  type PageBuildArgs,
  type PageItem,
} from '../mrm-engine-v17/legacy-adapter'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod } from '@/types/mrm'

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
// CORREÇÃO 2 (v2.0 / ADR-021) — Item 17 redistribui a Op. Externa pós-desconto
// (Step 12) pelos pesos do Step 8. Pai = Σ Filhos = Step 12.
// ============================================================================
describe('Relatório de Correção v2.0 — Item 17: redistribuição da Op. Externa (ADR-021)', () => {
  // Cenário com peso_op_interna < 1 → existe Op. Externa (de repasse) para redistribuir.
  // op.interna 143.669,80 + op.externa 8.447,95 = rb 152.117,75 (peso 94,4464%).
  const ITEM: EngineItemV17 = {
    item_id: 'rro-fix-2',
    rb: 152117.75,
    cp: 55901.92,
    mod_pct: 0,
    dop_pct: 0.3,
    commission_pct: 0.05,
    profit_pct: 0.1,
    irpj_pct: 0.015,
    csll_pct: 0.009,
    peso_op_interna: 143669.8021074274 / 152117.75,
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
      effective_date: '2026-06-28',
      use_snapshot_rates: false,
      ...overrides,
    }
  }

  const step17 = (r: ReturnType<typeof calculateMotorV17>) =>
    r.motor.cascade_trace.find((s) => s.step === 17)!
  // Op. Externa pós-desconto exibida no Step 12 (autoridade gerencial).
  const opExternaPos = (r: ReturnType<typeof calculateMotorV17>) => {
    const s12 = r.motor.cascade_trace.find((s) => s.step === 12)!
    return (s12.children ?? []).find((c) => (c.label ?? '').includes('Externa'))?.amount ?? 0
  }

  it('Pai = Σ Filhos: step17.amount === soma dos children (tolerância 0,01)', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    const s17 = step17(r)
    const childrenSum = (s17.children ?? []).reduce((acc, c) => acc + c.amount, 0)
    expect(childrenSum).toBeCloseTo(s17.amount, 2)
    expect((s17.children ?? []).length).toBeGreaterThan(0)
  })

  it('ADR-021: step17.amount === Op. Externa pós-desconto do Step 12 (cascata FECHA)', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    const s17 = step17(r)
    expect(s17.amount).toBeCloseTo(opExternaPos(r), 2)
    // E fecha mesmo com desconto aplicado.
    const rd = calculateMotorV17(baseInput({ desp_acessorias: 1200, discount: { pct: 5 } }))
    expect(step17(rd).amount).toBeCloseTo(opExternaPos(rd), 2)
  })

  it('NÃO injeta a âncora: step17.amount < âncora (é só a Op. Externa, não a operação)', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    expect(step17(r).amount).toBeLessThan(r.motor.ancora)
  })

  it('formula do step 17 reflete a redistribuição por pesos do Step 8 (não Σ bases brutas)', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: 1200 }))
    const f = step17(r).formula ?? ''
    expect(f).toMatch(/Op\. Externa.*Step 8/i)
    expect(f).not.toBe('Σ (IBS + CBS + IS + IPI)')
  })

  it('IS > 0 entra no split do step 17 (Pai = Σ Filhos continua)', () => {
    const ratesIS: TaxRatePeriod[] = [
      rate('ICMS', 0.17), rate('IS', 0.1), rate('IBS', 0.01), rate('CBS', 0.088), rate('IPI', 0.05),
    ]
    const r = calculateMotorV17(baseInput({ rates: ratesIS, desp_acessorias: 1200 }))
    const s17 = step17(r)
    const isChild = (s17.children ?? []).find((c) => c.label === 'IS')
    expect(isChild?.amount).toBeGreaterThan(0)
    const childrenSum = (s17.children ?? []).reduce((acc, c) => acc + c.amount, 0)
    expect(childrenSum).toBeCloseTo(s17.amount, 2)
  })

  it('Display-only: taxes_outside e valor_final permanecem INTACTOS (não vazam para o cobrado)', () => {
    const desp = 1200
    const r = calculateMotorV17(baseInput({ desp_acessorias: desp }))
    // O Total a cobrar continua derivando dos tributos REAIS por fora, não do Step 17.
    expect(r.distribution.valor_final).toBeCloseTo(
      r.motor.ancora + desp + r.distribution.taxes_outside_total,
      2,
    )
    // taxes_outside (valores fiscais reais) seguem com a Desp. Acessória nas bases (inalterado).
    const ipi = r.distribution.taxes_outside.find((t) => t.type === 'IPI')
    expect(ipi?.base).toBeCloseTo(r.motor.ancora + desp, 2)
  })

  it('Alvos do relatório v2.0: redistribuir 8.024,18 pelos pesos do Step 8 → 114,42 / 1.029,66 / 6.880,10', () => {
    // Validação MATEMÁTICA isolada (núcleo único). Bases pré-desconto do cenário do relatório:
    //   baseIVA = 119.250,00 ; ipiBase = OpDentro 143.669,80 + Desp 1.200 = 144.869,80.
    const step8 = computeIvaDualFromBase({
      baseIVA: 119250, ipiBase: 144869.8, despAcessorias: 1200,
      isPct: 0, ibsPct: 0.1, cbsPct: 0.9, ipiPct: 5, icmsPct: 0, icmsComplApplies: false,
    })
    const total = step8.isValue + step8.ibsValue + step8.cbsValue + step8.ipiValue
    const opExt = 8024.18
    expect(opExt * (step8.ibsValue / total)).toBeCloseTo(114.42, 1)
    expect(opExt * (step8.cbsValue / total)).toBeCloseTo(1029.66, 1)
    expect(opExt * (step8.ipiValue / total)).toBeCloseTo(6880.1, 1)
    const soma =
      opExt * (step8.ibsValue / total) +
      opExt * (step8.cbsValue / total) +
      opExt * (step8.ipiValue / total)
    expect(soma).toBeCloseTo(8024.18, 1)
  })

  it('Multi-produto (Adendo 25-A): Step 17 fecha com Step 12 mesmo com produtos heterogêneos', () => {
    // 3 produtos com IPI heterogêneo (5% / 0% / 3%) e pesos da âncora 0,5 / 0,3 / 0,2 (Σ=1).
    // O ramo `args.multi` do helper computeStep8Outside soma os tributos por produto e o total
    // redistribuído continua = op_externa_pos (Σ pesos = 1).
    const r = calculateMotorV17(
      baseInput({
        desp_acessorias: 1200,
        outside_items: [
          { peso_ancora: 0.5, desp_acessorias: 600, rates: { is: 0, ibs: 0.001, cbs: 0.009, ipi: 0.05, icms: 0.17 } },
          { peso_ancora: 0.3, desp_acessorias: 400, rates: { is: 0, ibs: 0.001, cbs: 0.009, ipi: 0, icms: 0.17 } },
          { peso_ancora: 0.2, desp_acessorias: 200, rates: { is: 0, ibs: 0.001, cbs: 0.009, ipi: 0.03, icms: 0.17 } },
        ],
      }),
    )
    const s17 = step17(r)
    const childrenSum = (s17.children ?? []).reduce((acc, c) => acc + c.amount, 0)
    expect(childrenSum).toBeCloseTo(s17.amount, 2)
    expect(s17.amount).toBeCloseTo(opExternaPos(r), 2)
    expect((s17.children ?? []).length).toBeGreaterThan(0)
  })
})
