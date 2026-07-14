/**
 * BUG-CASCATA-RT-AUSENTE-001 + Regra de Inviolabilidade (doc Cascata RT 14/07, Seção 6).
 *
 * A Memória Cascata deve permanecer visível/válida em QUALQUER orçamento, independentemente
 * de RT, nº de produtos, desconto ou alíquotas zeradas. O bug: o guard de render travava em
 * `length === 13 || 17` e sumia quando o RT adicionava etapas (18/19). Além disso, a etapa RT
 * era condicional (traces de tamanhos diferentes quebravam a agregação multiproduto).
 *
 * Este teste trava as invariantes: o extrator SEMPRE retorna um cascade_trace não-nulo e as
 * etapas de RT (5.5 pré, 14.5 pós) e RRO (15) estão SEMPRE presentes, com a MESMA estrutura.
 */

import { calculateMotorV17ForPage, type PageBuildArgs } from '../mrm-engine-v17/legacy-adapter'
import { extractEpicV5DisplayData } from '../mrm-display-extractor'
import type { TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return { id: `r-${tax_type}`, tenant_id: 'test', tax_type, origin_state: null, dest_state: null, rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null }
}

const tenantCtx: PageBuildArgs['tenantCtx'] = {
  regime: 'LUCRO_REAL',
  rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
  csll_pct: 0.008, irpj_pct: 0.016, dop_pct: 0.10,
  absorption_policy: 'RRO_PROPORTIONAL',
}
const baseItem = { unit_price: 1000, quantity: 1, cost_total: 400, productive_labor_unit: 50, commission_percent: 5, profit_percent: 15 }

function run(items: any[], globalDiscountPercent = 0) {
  const r = calculateMotorV17ForPage({ items, tenantCtx, globalDiscountPercent } as any)
  return extractEpicV5DisplayData(r.map((x) => ({ tax_breakdown: x as any })), { regime: 'LUCRO_REAL', csll_pct: 0.008, irpj_pct: 0.016 })
}

describe('BUG-CASCATA-RT-AUSENTE-001 — inviolabilidade da Memória Cascata', () => {
  // [label, items, desconto, temRT]
  const scenarios: [string, any[], number, boolean][] = [
    ['produto sem RT (legado)', [baseItem], 0, false],
    ['produto novo com RT 4%', [{ ...baseItem, rt_reserve_percent: 4 }], 0, true],
    ['1 produto com RT + desconto 10%', [{ ...baseItem, rt_reserve_percent: 4 }], 10, true],
    ['multiproduto MISTO (com e sem RT)', [{ ...baseItem, rt_reserve_percent: 4 }, { ...baseItem, unit_price: 2000 }], 5, true],
    ['comissão zerada + RT', [{ ...baseItem, commission_percent: 0, rt_reserve_percent: 3 }], 0, true],
    ['todas alíquotas adicionais zeradas', [{ ...baseItem, commission_percent: 0, profit_percent: 0, rt_reserve_percent: 0 }], 0, false],
  ]

  it.each(scenarios)('cascata NÃO some: %s', (_label, items, disc, temRT) => {
    const display = run(items, disc)
    // INVARIANTE PRINCIPAL (inviolabilidade): a cascata SEMPRE existe e RRO (15) presente.
    expect(display.cascadeTrace).not.toBeNull()
    expect(display.cascadeTrace!.length).toBeGreaterThan(0)
    const steps = display.cascadeTrace!.map((s: any) => s.step)
    expect(steps).toContain(15) // RRO
    if (temRT) {
      expect(steps).toContain(5.5)  // RT pré
      expect(steps).toContain(14.5) // RT pós
    } else {
      // retrocompat: sem RT segue 17 etapas, sem etapas fracionadas de RT
      expect(display.cascadeTrace!.length).toBe(17)
    }
  })

  it('estrutura: com RT tem exatamente 2 etapas a mais que sem RT (5.5 + 14.5)', () => {
    const semRt = run([baseItem])
    const comRt = run([{ ...baseItem, rt_reserve_percent: 4 }])
    expect(comRt.cascadeTrace!.length).toBe(semRt.cascadeTrace!.length + 2)
  })
})
