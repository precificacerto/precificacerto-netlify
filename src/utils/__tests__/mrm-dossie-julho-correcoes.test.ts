/**
 * Tests — Dossiê de Ajuste e Correção do Sistema (Motor RRO), Julho 2026.
 * 5 correções da Memória Cascata + Cards de Distribuição.
 *
 * Princípio inviolável: o RRO e as margens (Comissão/Lucro/IRPJ/CSLL) pertencem
 * EXCLUSIVAMENTE à Operação Interna. A Operação Externa (IBS/CBS/IS/IPI/ICMS-ST/DIFAL)
 * é repasse ao fisco — não entra na base do RRO, das margens, nem no DENOMINADOR das
 * alíquotas efetivas. Base de referência = Âncora Gerencial (Op. Interna pós-desconto).
 *
 * Gates (Seção 7 do dossiê):
 *   N1 Fechamento RRO: Comissão+Lucro+IRPJ+CSLL = RRO (tol R$0,02) em qualquer modo
 *   N2 Isolamento Op.Externa: tributos por fora ausentes do denominador das alíquotas efetivas
 *   N3 Base protegida (Modos 2/3): alíquota protegida = componente ÷ Âncora Gerencial
 *   N4 Coerência valor×exibição: comissão protegida exibe 4,842% (não 4,783%)
 *   N5 Completude cascata: Etapa 1 quantitativa; Alíquota preenchida nas Etapas 5/6/16;
 *      etapa de Tributos Internos presente; contrato de 17 etapas preservado
 */

import { calculateMotorV17, consolidateItems } from '../mrm-engine-v17'
import { computeResidualDistribution, type ResidualItemInput } from '../residual-distribution'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 'test', tax_type,
    origin_state: null, dest_state: null, rate_pct,
    valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

// Fixture: 1 produto com Op. Externa (peso_op_interna < 1) e tributos por dentro explícitos.
const OP_INTERNA = 28104.33
const RB = 29306.13 // Venda Consolidada (inclui Op. Externa)
const ITEM: EngineItemV17 = {
  item_id: 'dossie', rb: RB, cp: 10977.55, mod_pct: 0,
  dop_pct: 7458.9 / RB,
  commission_pct: 0.05, profit_pct: 0.1, irpj_pct: 0.015, csll_pct: 0.009,
  peso_op_interna: OP_INTERNA / RB,
  taxes_inside_amounts: { icms: OP_INTERNA * 0.17, iss: 0, pis_cofins: 0 },
}
const RATES: TaxRatePeriod[] = [rate('ICMS', 0.17), rate('ISS', 0), rate('PIS', 0), rate('COFINS', 0)]
const input: MotorV17Input = {
  items: [ITEM], discount: { pct: 0 }, policy: 'RRO_PROPORTIONAL',
  regime: 'LUCRO_PRESUMIDO', rates: RATES, effective_date: '2026-07-06', use_snapshot_rates: false,
}

function trace(i: MotorV17Input) {
  return calculateMotorV17(i).motor.cascade_trace
}
function stepOf(i: MotorV17Input, n: number, label?: string) {
  const t = trace(i)
  return t.find((s) => s.step === n && (label ? s.label === label : true))!
}

// ═════════════════════════════════════════════════════════════════════════════
// Correção 1 — Etapa 1 exibida como quantidade (display_kind: 'count')
// ═════════════════════════════════════════════════════════════════════════════
describe('Dossiê Correção 1 — Etapa 1 é quantitativo, não moeda', () => {
  it('Etapa 1 carrega display_kind=count e amount = nº de produtos', () => {
    const s1 = stepOf(input, 1)
    expect(s1.display_kind).toBe('count')
    expect(s1.amount).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Correção 2 — Coluna Alíquota preenchida na Etapa 6 (e Etapa 5) sobre Op. Interna
// ═════════════════════════════════════════════════════════════════════════════
describe('Dossiê Correção 2 — alíquota efetiva na Etapa 6 (margens)', () => {
  it('cada componente da Etapa 6 expõe effective_rate_pct = valor ÷ Op. Interna pré-desc', () => {
    const s6 = stepOf(input, 6, 'Consolidação das margens')
    const comissao = s6.children?.find((c) => c.label === 'Comissão')
    const lucro = s6.children?.find((c) => c.label === 'Lucro')
    // Op. Interna pré-desconto = rb × peso_op_interna = 28.104,33; comissão efetiva = 5%.
    expect(comissao?.effective_rate_pct).toBeCloseTo(0.05, 4)
    expect(lucro?.effective_rate_pct).toBeCloseTo(0.1, 4)
    // Alíquota do bloco = soma das margens ÷ Op. Interna = 17,4%.
    expect(s6.effective_rate_pct).toBeCloseTo(0.174, 4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Correção 3 — Etapa de Tributos Internos (children da Formação Op. Interna, Etapa 7)
// ═════════════════════════════════════════════════════════════════════════════
describe('Dossiê Correção 3 — Tributos Internos na Formação da Op. Interna', () => {
  it('Etapa 7 expõe children ICMS/ISS/PIS-COFINS com alíquota efetiva sobre Op. Interna', () => {
    const s7 = stepOf(input, 7, 'Formação Op Interna')
    const icms = s7.children?.find((c) => c.label.includes('ICMS'))
    expect(icms).toBeDefined()
    expect(icms?.amount).toBeCloseTo(OP_INTERNA * 0.17, 2)
    expect(icms?.effective_rate_pct).toBeCloseTo(0.17, 4)
    // ISS e PIS/COFINS presentes (mesmo zerados) para completude estrutural.
    expect(s7.children?.some((c) => c.label.includes('ISS'))).toBe(true)
    expect(s7.children?.some((c) => c.label.includes('PIS/COFINS'))).toBe(true)
  })

  it('contrato de 17 etapas preservado (não renumera)', () => {
    expect(trace(input)).toHaveLength(17)
    expect(stepOf(input, 16).label).toContain('Redistribuição RRO')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Correção 4 — Alíquota efetiva na Etapa 16 sobre a Âncora Gerencial
// ═════════════════════════════════════════════════════════════════════════════
describe('Dossiê Correção 4 — alíquota efetiva na Redistribuição do RRO (Etapa 16)', () => {
  it('cada componente da Etapa 16 expõe effective_rate_pct = valor ÷ motor.ancora', () => {
    const r = calculateMotorV17(input)
    const ancora = r.motor.ancora
    const s16 = r.motor.cascade_trace.find((s) => s.step === 16)!
    const comissao = s16.children?.find((c) => c.label === 'Comissão')!
    expect(comissao.base).toBeCloseTo(ancora, 2)
    expect(comissao.effective_rate_pct).toBeCloseTo(comissao.amount / ancora, 6)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Correção 5 (CRÍTICA) — denominador da alíquota efetiva dos cards = Âncora Gerencial
// ═════════════════════════════════════════════════════════════════════════════
describe('Dossiê Correção 5 — base da alíquota efetiva = Op. Interna (Âncora Gerencial)', () => {
  // Caso auditado do dossiê: comissão 9.346,00; Âncora 193.054,21; Total a cobrar 195.395,57.
  const items: ResidualItemInput[] = [
    {
      unit_price: 195395.57, quantity: 1, commission_percent: 5, profit_percent: 10,
      tax_breakdown: null, motor_new_commission: 9346, motor_new_profit: 13692.15,
      motor_new_csll: 1232.29, motor_new_irpj: 2053.82,
    },
  ]
  const TOTAL_A_COBRAR = 195395.57
  const ANCORA = 193054.21

  it('N4 — comissão protegida exibe 4,842% (sobre Âncora), não 4,783% (sobre Total)', () => {
    const dist = computeResidualDistribution(
      items, 205679.55, TOTAL_A_COBRAR, 'LUCRO_PRESUMIDO',
      { irpj: 0.018, csll: 0.0108 }, 5, 'PROFIT_REDUCTION', ANCORA,
    )
    expect(dist.commission.effectivePct).toBeCloseTo(4.842, 2)
    // Explicitamente ≠ do denominador contaminado.
    expect(Math.abs(dist.commission.effectivePct - 4.783)).toBeGreaterThan(0.04)
  })

  it('N2 — Isolamento: o % efetivo independe da Op. Externa (denominador = Âncora)', () => {
    // Mesmos valores/âncora, mas Total a cobrar maior (mais Op. Externa) → % NÃO muda.
    const distA = computeResidualDistribution(
      items, 205679.55, TOTAL_A_COBRAR, 'LUCRO_PRESUMIDO',
      { irpj: 0.018, csll: 0.0108 }, 5, 'PROFIT_REDUCTION', ANCORA,
    )
    const distB = computeResidualDistribution(
      items, 205679.55, TOTAL_A_COBRAR + 50000, 'LUCRO_PRESUMIDO',
      { irpj: 0.018, csll: 0.0108 }, 5, 'PROFIT_REDUCTION', ANCORA,
    )
    expect(distA.commission.effectivePct).toBeCloseTo(distB.commission.effectivePct, 6)
  })

  it('retrocompat — sem âncora, cai no denominador totalNet (comportamento antigo)', () => {
    const dist = computeResidualDistribution(
      items, 205679.55, TOTAL_A_COBRAR, 'LUCRO_PRESUMIDO',
      { irpj: 0.018, csll: 0.0108 }, 5, 'PROFIT_REDUCTION',
    )
    expect(dist.commission.effectivePct).toBeCloseTo((9346 / TOTAL_A_COBRAR) * 100, 4)
  })

  it('amounts (R$) são idênticos com ou sem âncora — só o % muda', () => {
    const comAncora = computeResidualDistribution(
      items, 205679.55, TOTAL_A_COBRAR, 'LUCRO_PRESUMIDO',
      { irpj: 0.018, csll: 0.0108 }, 5, 'PROFIT_REDUCTION', ANCORA,
    )
    const semAncora = computeResidualDistribution(
      items, 205679.55, TOTAL_A_COBRAR, 'LUCRO_PRESUMIDO',
      { irpj: 0.018, csll: 0.0108 }, 5, 'PROFIT_REDUCTION',
    )
    expect(comAncora.commission.amount).toBe(semAncora.commission.amount)
    expect(comAncora.profit.amount).toBe(semAncora.profit.amount)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// N1 — Fechamento do RRO em qualquer modo (Comissão+Lucro+IRPJ+CSLL = RRO)
// ═════════════════════════════════════════════════════════════════════════════
describe('Dossiê N1 — fechamento do RRO', () => {
  it.each(['RRO_PROPORTIONAL', 'COMMISSION_PROTECTED', 'PROFIT_PROTECTED'] as const)(
    'modo %s: Σ(componentes) = RRO (tol R$0,02)',
    (policy) => {
      const r = calculateMotorV17({ ...input, discount: { pct: 0.05 }, policy })
      const d = r.distribution
      const soma = d.new_commission + d.new_profit + d.new_csll + d.new_irpj
      expect(Math.abs(soma - r.motor.rro)).toBeLessThanOrEqual(0.02)
    },
  )
})
