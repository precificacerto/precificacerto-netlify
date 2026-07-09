/**
 * Tests — Adendo Oficial de Correção, Seção 31-A (Julho 2026).
 *
 * Cobre os itens 1 e 2 (MO Administrativa) e o invariante estrutural da Etapa 5:
 *   Item 1 (produto individual): a linha discriminada "MO Administrativa" na Etapa 5
 *     reflete o valor REAL do produto (via decomposição do DOP), mesmo quando o snapshot
 *     V14 do produto tem mo_admin = 0 (val_indirect_labor ausente no banco).
 *   Item 2 (multi-produto): a MO Administrativa SOMA a contribuição de TODOS os produtos
 *     (não trava no 1º), na mesma lógica de Fixa/Variável/Financeira.
 *   Invariante (Nível 1): Σ(linhas discriminadas da Etapa 5) == total agregado da etapa.
 *
 * Fonte da correção: dop_breakdown_total (decomposição de dop_total nos 4 buckets),
 * DISPLAY-only — não afeta o RRO (que usa dop_pct).
 */

import { calculateMotorV17, consolidateItems } from '../mrm-engine-v17'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod } from '@/types/mrm'

const RATES: TaxRatePeriod[] = [
  { id: 'r-ICMS', tenant_id: 'test', tax_type: 'ICMS', origin_state: null, dest_state: null, rate_pct: 0, valid_from: '2026-01-01', valid_until: null, notes: null },
]

/** Item com decomposição de DOP (4 buckets efetivos) e snapshot V14 STALE (mo_admin=0). */
function makeItem(id: string, rb: number): EngineItemV17 {
  return {
    item_id: id,
    rb,
    cp: 0,
    mod_pct: 0,
    dop_pct: 0.1, // 4% MO Adm + 3% Fixa + 2% Variável + 1% Financeira
    commission_pct: 0.05,
    profit_pct: 0.1,
    csll_pct: 0,
    irpj_pct: 0,
    peso_op_interna: 1,
    // Snapshot V14 do produto com MO Administrativa ZERADA (reproduz val_indirect_labor=0).
    expense_breakdown: {
      mo_admin: { rate: 0, amount: 0 },
      fixa: { rate: 0.03, amount: rb * 0.03 },
      variavel: { rate: 0.02, amount: rb * 0.02 },
      financeira: { rate: 0.01, amount: rb * 0.01 },
    },
    // Decomposição efetiva do DOP (peso_op_interna=1 ⇒ efetivo == nominal). Σ == dop_pct.
    dop_components: { mo_admin: 0.04, fixa: 0.03, variavel: 0.02, financeira: 0.01 },
  }
}

function input(items: EngineItemV17[]): MotorV17Input {
  return {
    items,
    discount: { pct: 0 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_PRESUMIDO',
    rates: RATES,
    effective_date: '2026-07-09',
    use_snapshot_rates: false,
  }
}

describe('Adendo 31-A — decomposição do DOP (consolidate)', () => {
  it('Item 2: MO Administrativa soma TODOS os produtos (não trava no 1º)', () => {
    const view = consolidateItems([makeItem('a', 10000), makeItem('b', 20000)], { pct: 0 })
    // 10000×0,04 + 20000×0,04 = 1200 — soma dos dois produtos.
    expect(view.dop_breakdown_total?.mo_admin).toBeCloseTo(1200, 6)
    // Prova que NÃO travou no 1º produto (que sozinho daria 400).
    expect(view.dop_breakdown_total?.mo_admin).not.toBeCloseTo(400, 2)
  })

  it('Nível 1: Σ(4 buckets do dop_breakdown) == dop_total', () => {
    const view = consolidateItems([makeItem('a', 10000), makeItem('b', 20000)], { pct: 0 })
    const b = view.dop_breakdown_total!
    const soma = b.mo_admin + b.fixa + b.variavel + b.financeira
    expect(soma).toBeCloseTo(view.dop_total, 6)
  })

  it('Item 1: MO Administrativa reflete o valor real mesmo com snapshot V14 zerado', () => {
    const view = consolidateItems([makeItem('solo', 10000)], { pct: 0 })
    // Snapshot V14 mo_admin=0, mas o dop_breakdown usa a decomposição do DOP (tenant) → 400.
    expect(view.dop_breakdown_total?.mo_admin).toBeCloseTo(400, 6)
  })
})

describe('Adendo 31-A — Etapa 5 da Cascata (display)', () => {
  it('Nível 1: Σ(linhas discriminadas da Etapa 5) == total da etapa', () => {
    const trace = calculateMotorV17(input([makeItem('a', 10000), makeItem('b', 20000)])).motor.cascade_trace
    const step5 = trace.find((s) => s.step === 5)!
    const children = step5.children ?? []
    const soma = children.reduce((s, c) => s + c.amount, 0)
    expect(soma).toBeCloseTo(step5.amount, 4)
  })

  it('Item 1/2: a linha MO Administrativa é não-zero e soma os produtos', () => {
    const trace = calculateMotorV17(input([makeItem('a', 10000), makeItem('b', 20000)])).motor.cascade_trace
    const step5 = trace.find((s) => s.step === 5)!
    const moAdmin = step5.children?.find((c) => c.label === 'MO Administrativa')
    expect(moAdmin?.amount).toBeCloseTo(1200, 4)
    expect(moAdmin?.amount).toBeGreaterThan(0)
  })
})
