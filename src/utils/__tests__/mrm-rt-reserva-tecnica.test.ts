/**
 * EPIC-RT v8 (2026-07-13) — Motor RRO: RT (Comissão Reserva Técnica).
 *
 * Trava a matemática do RT no motor:
 *  - Alíquota efetiva CONGELADA = Σ(rb_i × rt_pct_i) / Σ rb_i (multi-produto).
 *  - RT em R$ = Âncora (Op. Interna pós-desconto) × alíquota efetiva.
 *  - RRO fica LÍQUIDO de RT (abatido antes da redistribuição — item 16).
 *  - RT é INVARIANTE ao modo de absorção (sempre congelado).
 *  - Sem RT (rt_pct ausente/0) ⇒ RRO bit-exact com o comportamento anterior.
 */

import { calculateMotorV17 } from '../mrm-engine-v17'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 'test', tax_type, origin_state: null, dest_state: null,
    rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

const baseItem: EngineItemV17 = {
  item_id: 'p1', rb: 100000, cp: 40000, mod_pct: 0, dop_pct: 0.10,
  commission_pct: 0.05, profit_pct: 0.10, csll_pct: 0.009, irpj_pct: 0.015,
  peso_op_interna: 1, // 100% interna → âncora = rv_total (cenário limpo)
}

function makeInput(items: EngineItemV17[], discountPct = 0): MotorV17Input {
  return {
    items,
    discount: { pct: discountPct },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.17), rate('ISS', 0), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    effective_date: '2026-07-13',
    use_snapshot_rates: false,
  }
}

describe('EPIC-RT v8 — RT no motor RRO', () => {
  it('Sem RT: rt_value = 0 e RRO inalterado (regressão zero)', () => {
    const r = calculateMotorV17(makeInput([baseItem]))
    expect(r.motor.rt_value ?? 0).toBeCloseTo(0, 6)
    // RRO base = âncora − impostos − cp − mod − dop
    const expectedRro = r.motor.ancora - r.motor.imp_dentro_total - r.motor.cp_efetivo - r.motor.mod - r.motor.dop
    expect(r.motor.rro).toBeCloseTo(expectedRro, 4)
  })

  it('Produto único com RT 2%: efetiva = 2% e rt_value = âncora × 2%', () => {
    const r = calculateMotorV17(makeInput([{ ...baseItem, rt_pct: 0.02 }]))
    expect(r.motor.rt_efetiva).toBeCloseTo(0.02, 6)
    expect(r.motor.rt_value).toBeCloseTo(r.motor.ancora * 0.02, 4)
  })

  it('RRO fica líquido de RT (= RRO base − rt_value)', () => {
    const base = calculateMotorV17(makeInput([baseItem]))
    const withRt = calculateMotorV17(makeInput([{ ...baseItem, rt_pct: 0.02 }]))
    // âncora é a mesma (RT não altera a formação); RRO cai exatamente rt_value
    expect(withRt.motor.ancora).toBeCloseTo(base.motor.ancora, 4)
    expect(withRt.motor.rro).toBeCloseTo(base.motor.rro - withRt.motor.rt_value!, 4)
  })

  it('Multi-produto (exemplo do doc): A 25.000×3,5% + B/C 75.000×0% → efetiva 0,875%', () => {
    const A: EngineItemV17 = { ...baseItem, item_id: 'A', rb: 25000, rt_pct: 0.035 }
    const BC: EngineItemV17 = { ...baseItem, item_id: 'BC', rb: 75000 } // sem RT
    const r = calculateMotorV17(makeInput([A, BC]))
    expect(r.motor.rt_efetiva).toBeCloseTo(0.00875, 6)
  })

  it('RT é CONGELADO: invariante ao modo de absorção', () => {
    const proportional = calculateMotorV17({ ...makeInput([{ ...baseItem, rt_pct: 0.02 }]), policy: 'RRO_PROPORTIONAL' })
    const commissionProtected = calculateMotorV17({ ...makeInput([{ ...baseItem, rt_pct: 0.02 }]), policy: 'COMMISSION_PROTECTED' })
    expect(proportional.motor.rt_value).toBeCloseTo(commissionProtected.motor.rt_value!, 4)
  })

  it('RT frozen sob desconto: alíquota efetiva não muda com desconto (só o valor escala com a âncora)', () => {
    const semDesc = calculateMotorV17(makeInput([{ ...baseItem, rt_pct: 0.02 }], 0))
    const comDesc = calculateMotorV17(makeInput([{ ...baseItem, rt_pct: 0.02 }], 0.10))
    expect(semDesc.motor.rt_efetiva).toBeCloseTo(comDesc.motor.rt_efetiva!, 6)
    // valor escala com a âncora pós-desconto
    expect(comDesc.motor.rt_value).toBeCloseTo(comDesc.motor.ancora * 0.02, 4)
  })

  it('Item 15 da cascata exibe RT quando presente', () => {
    const r = calculateMotorV17(makeInput([{ ...baseItem, rt_pct: 0.02 }]))
    const step15 = r.motor.cascade_trace.find((s) => s.step === 15)
    expect(step15?.label).toContain('RT')
    expect(step15?.amount).toBeCloseTo(-r.motor.rt_value!, 4)
  })
})
