/**
 * Tests — Adendo Oficial Seção 26-A (Julho 2026)
 * Correção da Etapa 6 (Consolidação das Margens): AGREGAÇÃO, não RECÁLCULO.
 *
 * A Etapa 6 pertence à FASE DE CONSTRUÇÃO (pré-desconto, Etapas 1-10). Sua função é
 * SOMAR as margens (Comissão + Lucro + IRPJ + CSLL) que cada produto já apurou na sua
 * precificação individual (Etapa 2), sobre a OPERAÇÃO INTERNA — NUNCA recalcular
 * aplicando alíquota × Venda Consolidada (que inclui a Op. Externa / IBS+CBS por fora).
 *
 * Caso auditado (1 produto, desconto 0%):
 *   Op. Interna = 28.104,33 | Op. Externa (IBS/CBS por fora) = 1.201,80
 *   Venda Consolidada (rb)  = 29.306,13
 *   Correto (Etapa 2, sobre Op. Interna):
 *     Comissão 5% = 1.405,22 | Lucro 10% = 2.810,43 | IRPJ 1,5% = 421,56 | CSLL 0,9% = 252,94
 *     → Bloco de Margens = 4.890,15
 *   Bug anterior (recálculo sobre rb): 29.306,13 × 17,4% = 5.099,27 (+209,12)
 *
 * Os 5 gates de validação obrigatórios do Adendo (Seção 5) estão cobertos abaixo.
 */

import { calculateMotorV17, consolidateItems } from '../mrm-engine-v17'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod } from '@/types/mrm'

// ─────────────────────────────────────────────────────────────────────────────
// Fixture do caso auditado (Adendo 26-A)
// ─────────────────────────────────────────────────────────────────────────────
const OP_INTERNA = 28104.33
const OP_EXTERNA = 1201.80
const RB = OP_INTERNA + OP_EXTERNA // 29.306,13 — Venda Consolidada

const AUDITED_ITEM: EngineItemV17 = {
  item_id: 'adendo-26a',
  rb: RB,
  cp: 10977.55,
  mod_pct: 0,
  // Despesas operacionais (7.458,90) sobre Op. Interna → dop_pct efetivo sobre rb.
  dop_pct: 7458.9 / RB,
  commission_pct: 0.05,
  profit_pct: 0.1,
  irpj_pct: 0.015,
  csll_pct: 0.009,
  peso_op_interna: OP_INTERNA / RB,
  // ICMS por dentro (17% sobre Op. Interna) — para o gate de reconciliação.
  taxes_inside_amounts: { icms: OP_INTERNA * 0.17, iss: 0, pis_cofins: 0 },
}

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

const RATES: TaxRatePeriod[] = [
  rate('ICMS', 0.17),
  rate('ISS', 0),
  rate('PIS', 0),
  rate('COFINS', 0),
]

const baseInput: MotorV17Input = {
  items: [AUDITED_ITEM],
  discount: { pct: 0 },
  policy: 'RRO_PROPORTIONAL',
  regime: 'LUCRO_PRESUMIDO',
  rates: RATES,
  effective_date: '2026-07-03',
  use_snapshot_rates: false,
}

function step6(input: MotorV17Input) {
  const trace = calculateMotorV17(input).motor.cascade_trace
  const s6 = trace.find((s) => s.step === 6 && s.label === 'Consolidação das margens')
  if (!s6) throw new Error('Etapa 6 não encontrada no cascade_trace')
  return s6
}

// ═════════════════════════════════════════════════════════════════════════════
// Oráculo canônico — bloco de margens = 4.890,15 (Op. Interna), NÃO 5.099,27 (rb)
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 26-A — Oráculo canônico do bloco de margens', () => {
  it('Etapa 6 consolida margens sobre Op. Interna = R$ 4.890,15 (≠ 5.099,27)', () => {
    const view = consolidateItems(baseInput.items, baseInput.discount)
    const bloco =
      view.commission_amount_internal +
      view.profit_amount_internal +
      view.csll_amount_internal +
      view.irpj_amount_internal
    expect(bloco).toBeCloseTo(4890.15, 2)
    // Regressão explícita: jamais pode voltar ao valor inflado por recálculo sobre rb.
    expect(Math.abs(bloco - 5099.27)).toBeGreaterThan(200)
  })

  it('Cada categoria da Etapa 6 casa com a precificação (Etapa 2)', () => {
    const view = consolidateItems(baseInput.items, baseInput.discount)
    expect(view.commission_amount_internal).toBeCloseTo(1405.22, 2)
    expect(view.profit_amount_internal).toBeCloseTo(2810.43, 2)
    expect(view.irpj_amount_internal).toBeCloseTo(421.56, 2)
    expect(view.csll_amount_internal).toBeCloseTo(252.94, 2)
  })

  it('O display do step 6 (cascade_trace) expõe o bloco correto e seus 4 filhos', () => {
    const s6 = step6(baseInput)
    expect(s6.amount).toBeCloseTo(4890.15, 2)
    const byLabel = (l: string) => s6.children?.find((c) => c.label === l)?.amount ?? NaN
    expect(byLabel('Comissão')).toBeCloseTo(1405.22, 2)
    expect(byLabel('Lucro')).toBeCloseTo(2810.43, 2)
    expect(byLabel('IRPJ')).toBeCloseTo(421.56, 2)
    expect(byLabel('CSLL')).toBeCloseTo(252.94, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// NÍVEL 1 — A Etapa 6 é SOMA por produto, não alíquota × base agregada
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 26-A — Nível 1: agregação por produto (não recálculo)', () => {
  it('multi-produto heterogêneo: margem = Σ(op_interna_i × pct_i), não (Σrb × pct_blended)', () => {
    // Dois produtos com peso_op_interna DIFERENTES — se a Etapa 6 recalculasse sobre a
    // base agregada, o resultado divergiria da soma item-a-item.
    const itemA: EngineItemV17 = {
      item_id: 'A', rb: 10000, cp: 3000, mod_pct: 0, dop_pct: 0.2,
      commission_pct: 0.05, profit_pct: 0.1, irpj_pct: 0.015, csll_pct: 0.009,
      peso_op_interna: 0.9,
    }
    const itemB: EngineItemV17 = {
      item_id: 'B', rb: 20000, cp: 6000, mod_pct: 0, dop_pct: 0.2,
      commission_pct: 0.04, profit_pct: 0.12, irpj_pct: 0.015, csll_pct: 0.009,
      peso_op_interna: 0.7,
    }
    const view = consolidateItems([itemA, itemB], { pct: 0 })

    const expectComm = 10000 * 0.9 * 0.05 + 20000 * 0.7 * 0.04 // Σ op_interna_i × pct_i
    const expectProfit = 10000 * 0.9 * 0.1 + 20000 * 0.7 * 0.12
    expect(view.commission_amount_internal).toBeCloseTo(expectComm, 4)
    expect(view.profit_amount_internal).toBeCloseTo(expectProfit, 4)

    // Prova de que NÃO é (Σrb × pct médio) — o valor recalculado seria maior.
    const blended = ((0.05 + 0.04) / 2)
    const wrongAgg = (10000 + 20000) * blended
    expect(Math.abs(view.commission_amount_internal - wrongAgg)).toBeGreaterThan(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// NÍVEL 2 — Etapa 6 == Etapa 16 quando desconto = 0%
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 26-A — Nível 2: Etapa 6 == Etapa 16 (desconto 0%)', () => {
  it('bloco de margens (E6) == soma da redistribuição RRO (E16)', () => {
    const r = calculateMotorV17(baseInput)
    const d = r.distribution
    const e16 = d.new_commission + d.new_profit + d.new_csll + d.new_irpj
    const view = consolidateItems(baseInput.items, baseInput.discount)
    const e6 =
      view.commission_amount_internal +
      view.profit_amount_internal +
      view.csll_amount_internal +
      view.irpj_amount_internal
    // Sem desconto, construção (E6) e apuração (E16) representam o mesmo bloco.
    expect(e6).toBeCloseTo(e16, 1)
    expect(e6).toBeCloseTo(4890.15, 1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// NÍVEL 3 — Produto único: Etapa 6 == precificação do produto (Etapa 2)
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 26-A — Nível 3: espelhamento produto único', () => {
  it('cada categoria E6 == op_interna × pct do próprio produto', () => {
    const view = consolidateItems(baseInput.items, baseInput.discount)
    expect(view.commission_amount_internal).toBeCloseTo(OP_INTERNA * 0.05, 2)
    expect(view.profit_amount_internal).toBeCloseTo(OP_INTERNA * 0.1, 2)
    expect(view.irpj_amount_internal).toBeCloseTo(OP_INTERNA * 0.015, 2)
    expect(view.csll_amount_internal).toBeCloseTo(OP_INTERNA * 0.009, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// NÍVEL 4 — Reconciliação: Custos + Despesas + Margens + Trib. internos == Op. Interna
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 26-A — Nível 4: fechamento da Operação Interna', () => {
  it('Custos + Despesas + Margens(E6) + ICMS == Op. Interna (tol. R$ 0,05)', () => {
    const view = consolidateItems(baseInput.items, baseInput.discount)
    const custos = 10977.55
    const despesas = 7458.9
    const margens =
      view.commission_amount_internal +
      view.profit_amount_internal +
      view.csll_amount_internal +
      view.irpj_amount_internal
    const icms = OP_INTERNA * 0.17
    const soma = custos + despesas + margens + icms
    expect(Math.abs(soma - OP_INTERNA)).toBeLessThanOrEqual(0.05)
  })

  it('a base rb (com Op. Externa) NÃO fecharia a Op. Interna — prova do bug antigo', () => {
    const view = consolidateItems(baseInput.items, baseInput.discount)
    const margensBug =
      view.commission_amount_original +
      view.profit_amount_original +
      view.csll_amount_original +
      view.irpj_amount_original
    const soma = 10977.55 + 7458.9 + margensBug + OP_INTERNA * 0.17
    // Excede a Op. Interna em ~209,12 (a Op. Externa vazando pelas alíquotas de margem).
    expect(soma - OP_INTERNA).toBeGreaterThan(200)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// NÍVEL 5 — Isolamento da Operação Externa (IBS/CBS/IS/IPI/ICMS-ST/DIFAL)
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 26-A — Nível 5: Op. Externa ausente da fórmula da Etapa 6', () => {
  it('margens E6 são invariantes à presença de tributos por fora', () => {
    const semExterna = consolidateItems(
      [{ ...AUDITED_ITEM, peso_op_interna: 1, rb: OP_INTERNA }],
      { pct: 0 },
    )
    const comExterna = consolidateItems([AUDITED_ITEM], { pct: 0 })
    // Com peso_op_interna=1 (rb=Op.Interna) OU com Op. Externa presente (peso<1),
    // a margem interna resultante é a mesma: op_interna × pct. A Op. Externa não entra.
    expect(comExterna.commission_amount_internal).toBeCloseTo(
      semExterna.commission_amount_internal,
      2,
    )
    expect(comExterna.profit_amount_internal).toBeCloseTo(
      semExterna.profit_amount_internal,
      2,
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GUARD anti-regressão — preserva `*_amount_original` (base rb) para o Adendo 24-A
// ═════════════════════════════════════════════════════════════════════════════
describe('Adendo 26-A — Guard: amount_original (base rb) preservado p/ absorção', () => {
  it('commission_amount_original continua = Σ rb × pct (base cheia)', () => {
    const view = consolidateItems(baseInput.items, baseInput.discount)
    expect(view.commission_amount_original).toBeCloseTo(RB * 0.05, 2) // 1.465,31
    expect(view.profit_amount_original).toBeCloseTo(RB * 0.1, 2) // 2.930,61
    expect(view.irpj_amount_original).toBeCloseTo(RB * 0.015, 2) // 439,59
    expect(view.csll_amount_original).toBeCloseTo(RB * 0.009, 2) // 263,76
  })

  it('pesos de redistribuição (Seção 23) permanecem razões base rb e somam 1', () => {
    const view = consolidateItems(baseInput.items, baseInput.discount)
    const soma =
      view.peso_comissao_original +
      view.peso_lucro_original +
      view.peso_csll_original +
      view.peso_irpj_original
    expect(soma).toBeCloseTo(1, 4)
    expect(view.peso_comissao_original).toBeCloseTo(0.05 / 0.174, 3) // ≈ 0,287
    expect(view.peso_lucro_original).toBeCloseTo(0.1 / 0.174, 3) // ≈ 0,575
  })
})
