/**
 * Tests V15.3 (Founder 2026-05-25) — Agregação multi-produto na cascade.
 *
 * Quando orçamento/venda tem N produtos, cada um gera 1 cascade_trace de 13 steps.
 * O agregador `aggregateCascadeTraces` (em mrm-display-extractor.ts) precisa SOMAR:
 *   - amount de cada step
 *   - base de cada step (quando não-null)
 *   - amount + base de cada child (sub-itens dos steps 10/12/13)
 *
 * Antes V15.3: base não era somada (vinha apenas do primeiro produto).
 * Depois V15.3: base + amount são somados conforme regra do Founder.
 */

import { extractEpicV5DisplayData } from '../mrm-display-extractor'
import type { TaxBreakdown, CascadeStep } from '@/types/mrm'

function makeStep(
  step: number,
  label: string,
  base: number | null,
  amount: number,
  children?: CascadeStep[],
): CascadeStep {
  return {
    step,
    label,
    base,
    rate: null,
    amount,
    formula: 'test',
    source: 'TEST',
    ...(children ? { children } : {}),
  }
}

function makeBreakdown(
  rb: number,
  ancora: number,
  cpAmount: number,
  dopAmount: number,
  buckets: { moAdmin: number; fixa: number; variavel: number; financeira: number },
): TaxBreakdown {
  return {
    engine_version: '2.6.0',
    effective_date: '2026-05-25',
    regime: 'LUCRO_REAL',
    use_snapshot_rates: false,
    taxes_inside: [],
    taxes_outside: [],
    rb,
    desc_value: 0,
    rv: rb,
    cp: cpAmount,
    mod: 0,
    dop: dopAmount,
    imp_total: 0,
    rro: 0,
    limite_minimo: null,
    peso_op_interna: 1,
    peso_op_externa: 0,
    ancora_interna: ancora,
    cascade_trace: [
      makeStep(1, 'RB', null, rb),
      makeStep(2, 'Desconto', rb, 0),
      makeStep(3, 'RV', null, rb),
      makeStep(4, 'Peso', rb, ancora),
      makeStep(5, 'Âncora', null, ancora),
      makeStep(6, 'ICMS', ancora, 0),
      makeStep(7, 'ISS', ancora, 0),
      makeStep(8, 'PIS/COFINS', ancora, 0),
      makeStep(9, 'Custos', ancora, -cpAmount),
      makeStep(10, 'DOP', ancora - cpAmount, -dopAmount, [
        makeStep(10, 'MO Admin', null, -buckets.moAdmin),
        makeStep(10, 'Fixa', null, -buckets.fixa),
        makeStep(10, 'Variável', null, -buckets.variavel),
        makeStep(10, 'Financeira', null, -buckets.financeira),
      ]),
      makeStep(11, 'RRO', ancora - cpAmount - dopAmount, ancora - cpAmount - dopAmount),
      makeStep(12, 'Redist', ancora - cpAmount - dopAmount, 0),
      makeStep(13, 'Outside', null, 0),
    ],
    new_commission: 0,
    new_profit: 0,
    new_csll: 0,
    new_irpj: 0,
    validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true, V7: true },
    valid: true,
    status: 'VALID',
    error_code: null,
    messages: [],
  }
}

describe('V15.3 — Agregação multi-produto na cascade', () => {
  const tenantContext = { regime: 'LUCRO_REAL' as const, csll_pct: 0.008, irpj_pct: 0.016 }

  it('Soma RB entre 2 produtos no step 1', () => {
    const prodA = makeBreakdown(100000, 100000, 30000, 20000, {
      moAdmin: 8000, fixa: 8000, variavel: 3000, financeira: 1000,
    })
    const prodB = makeBreakdown(32000, 32000, 10000, 6000, {
      moAdmin: 2400, fixa: 2400, variavel: 900, financeira: 300,
    })
    const result = extractEpicV5DisplayData(
      [{ tax_breakdown: prodA }, { tax_breakdown: prodB }],
      tenantContext,
    )
    expect(result.cascadeTrace![0].amount).toBe(132000)  // 100000 + 32000
  })

  it('Soma base + amount de cada step entre N produtos', () => {
    const prodA = makeBreakdown(100000, 100000, 30000, 20000, {
      moAdmin: 8000, fixa: 8000, variavel: 3000, financeira: 1000,
    })
    const prodB = makeBreakdown(32000, 32000, 10000, 6000, {
      moAdmin: 2400, fixa: 2400, variavel: 900, financeira: 300,
    })
    const result = extractEpicV5DisplayData(
      [{ tax_breakdown: prodA }, { tax_breakdown: prodB }],
      tenantContext,
    )
    // Step 9 (Custos): amount = -30000 + -10000 = -40000; base = 100000+32000 = 132000
    const step9 = result.cascadeTrace![8]
    expect(step9.amount).toBe(-40000)
    expect(step9.base).toBe(132000)

    // Step 10 (DOP): amount = -20000 + -6000 = -26000; base = 70000+22000 = 92000
    const step10 = result.cascadeTrace![9]
    expect(step10.amount).toBe(-26000)
    expect(step10.base).toBe(92000)
  })

  it('Children do step 10 (4 buckets) também somam entre produtos', () => {
    const prodA = makeBreakdown(100000, 100000, 30000, 20000, {
      moAdmin: 8000, fixa: 8000, variavel: 3000, financeira: 1000,
    })
    const prodB = makeBreakdown(32000, 32000, 10000, 6000, {
      moAdmin: 2400, fixa: 2400, variavel: 900, financeira: 300,
    })
    const result = extractEpicV5DisplayData(
      [{ tax_breakdown: prodA }, { tax_breakdown: prodB }],
      tenantContext,
    )
    const step10Children = result.cascadeTrace![9].children!
    expect(step10Children[0].amount).toBe(-(8000 + 2400))   // MO Admin
    expect(step10Children[1].amount).toBe(-(8000 + 2400))   // Fixa
    expect(step10Children[2].amount).toBe(-(3000 + 900))    // Variável
    expect(step10Children[3].amount).toBe(-(1000 + 300))    // Financeira
  })

  it('Steps com base = null em ambos produtos mantém base = null', () => {
    const prodA = makeBreakdown(100000, 100000, 30000, 20000, {
      moAdmin: 8000, fixa: 8000, variavel: 3000, financeira: 1000,
    })
    const prodB = makeBreakdown(32000, 32000, 10000, 6000, {
      moAdmin: 2400, fixa: 2400, variavel: 900, financeira: 300,
    })
    const result = extractEpicV5DisplayData(
      [{ tax_breakdown: prodA }, { tax_breakdown: prodB }],
      tenantContext,
    )
    // Step 1 (RB): base = null nos dois → null no agregado
    expect(result.cascadeTrace![0].base).toBeNull()
    // Step 3 (RV): base = null → null no agregado
    expect(result.cascadeTrace![2].base).toBeNull()
  })

  it('3 produtos no orçamento → soma cumulativa', () => {
    const prodA = makeBreakdown(50000, 50000, 15000, 10000, {
      moAdmin: 4000, fixa: 4000, variavel: 1500, financeira: 500,
    })
    const prodB = makeBreakdown(30000, 30000, 9000, 6000, {
      moAdmin: 2400, fixa: 2400, variavel: 900, financeira: 300,
    })
    const prodC = makeBreakdown(20000, 20000, 6000, 4000, {
      moAdmin: 1600, fixa: 1600, variavel: 600, financeira: 200,
    })
    const result = extractEpicV5DisplayData(
      [{ tax_breakdown: prodA }, { tax_breakdown: prodB }, { tax_breakdown: prodC }],
      tenantContext,
    )
    expect(result.cascadeTrace![0].amount).toBe(100000)  // RB = 50+30+20
    expect(result.cascadeTrace![8].amount).toBe(-(15000 + 9000 + 6000))  // Custos
    expect(result.cascadeTrace![9].amount).toBe(-(10000 + 6000 + 4000))  // DOP
  })

  it('Cenário Founder 2026-05-25: 4 produtos do print real', () => {
    // RB: 132.119,92 + 104.113,02 + 123,17 + 141.106,60 = 377.462,71
    const prod1 = makeBreakdown(132119.92, 132119.92, 11000, 28000, {
      moAdmin: 10500, fixa: 11000, variavel: 6300, financeira: 200,
    })
    const prod2 = makeBreakdown(104113.02, 104113.02, 9000, 22000, {
      moAdmin: 8500, fixa: 8500, variavel: 4800, financeira: 200,
    })
    const prod3 = makeBreakdown(123.17, 123.17, 10, 25, {
      moAdmin: 10, fixa: 10, variavel: 4, financeira: 1,
    })
    const prod4 = makeBreakdown(141106.60, 141106.60, 19922.34, 54532.17, {
      moAdmin: 20661.33, fixa: 20652.03, variavel: 11996.72, financeira: 1222.09,
    })
    const result = extractEpicV5DisplayData(
      [
        { tax_breakdown: prod1 },
        { tax_breakdown: prod2 },
        { tax_breakdown: prod3 },
        { tax_breakdown: prod4 },
      ],
      tenantContext,
    )
    // Step 1 (RB): soma = 377.462,71
    expect(result.cascadeTrace![0].amount).toBeCloseTo(377462.71, 1)
    // Step 2 (Desconto) base = soma RB = 377.462,71 (NÃO 132.119,92!)
    expect(result.cascadeTrace![1].base).toBeCloseTo(377462.71, 1)
    // Step 4 (Peso) base = soma RV = 377.462,71
    expect(result.cascadeTrace![3].base).toBeCloseTo(377462.71, 1)
    // Step 4 amount (Âncora) = soma das âncoras = 377.462,71
    expect(result.cascadeTrace![3].amount).toBeCloseTo(377462.71, 1)
    // Step 6 (ICMS) base = soma Âncoras = 377.462,71
    expect(result.cascadeTrace![5].base).toBeCloseTo(377462.71, 1)
    // Step 9 (Custos) base = soma das bases pós-impostos
    expect(result.cascadeTrace![8].base).toBeCloseTo(132119.92 + 104113.02 + 123.17 + 141106.60, 1)
    // Step 11 (RRO) base = soma das bases pós-despesas
    const expectedRROBase = (132119.92 - 11000 - 28000) + (104113.02 - 9000 - 22000) + (123.17 - 10 - 25) + (141106.60 - 19922.34 - 54532.17)
    expect(result.cascadeTrace![10].base).toBeCloseTo(expectedRROBase, 0)
  })

  it('1 produto único → preserva trace direto (não duplica)', () => {
    const prodA = makeBreakdown(100000, 100000, 30000, 20000, {
      moAdmin: 8000, fixa: 8000, variavel: 3000, financeira: 1000,
    })
    const result = extractEpicV5DisplayData([{ tax_breakdown: prodA }], tenantContext)
    expect(result.cascadeTrace![0].amount).toBe(100000)
    expect(result.cascadeTrace![8].amount).toBe(-30000)
  })
})
