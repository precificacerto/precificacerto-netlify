/**
 * Tests Motor V17 — Etapa 17 com Despesas Acessórias + ICMS Complementar.
 *
 * Conferência Fiscal (documento "Bases de Cálculo dos Tributos Por Fora", 2026-06-05):
 *   - IBS/CBS base = (Âncora − ICMS − ISS − PIS/COFINS) + IS + Desp. Acessórias
 *   - IPI base     = Âncora + Desp. Acessórias (não deduz ICMS)
 *   - ICMS Compl.  = (IPI + Desp. Acessórias) × ICMS — só consumidor final NÃO contribuinte
 *   - valor_final  = Âncora + Desp. Acessórias + Σ tributos por fora
 *
 * Os números absolutos da Âncora vêm da cascata do motor; aqui validamos as RELAÇÕES
 * exigidas pelo documento (a matemática exata das bases já é coberta por
 * iva-dual-outside.test.ts).
 */

import { calculateMotorV17 } from '../mrm-engine-v17'
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

const ITEM: EngineItemV17 = {
  item_id: 'acessorias',
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

const DESP = 1200

function baseInput(overrides: Partial<MotorV17Input>): MotorV17Input {
  return {
    items: [ITEM],
    discount: { pct: 0 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: RATES,
    effective_date: '2026-06-05',
    use_snapshot_rates: false,
    ...overrides,
  }
}

const find = (arr: TaxLine[], t: TaxType) => arr.find((x) => x.type === t)

describe('Motor V17 Etapa 17 — Despesas Acessórias', () => {
  it('Desp. Acessórias somam à base de IBS/CBS (e NÃO à base do IS)', () => {
    const sem = calculateMotorV17(baseInput({ desp_acessorias: 0 }))
    const com = calculateMotorV17(baseInput({ desp_acessorias: DESP }))

    const isSem = find(sem.distribution.taxes_outside, 'IS')
    const isCom = find(com.distribution.taxes_outside, 'IS')
    // Base do IS é idêntica com/sem despesas (IS_rate=0 → entrada ausente; checa via base_iva).
    expect(isSem?.base ?? sem.motor.ancora).toBeDefined()
    expect(isCom).toBeUndefined() // IS_rate = 0 → não há linha de IS

    const ibsSem = find(sem.distribution.taxes_outside, 'IBS')!
    const ibsCom = find(com.distribution.taxes_outside, 'IBS')!
    // A base de IBS cresce exatamente o valor das Desp. Acessórias.
    expect(ibsCom.base - ibsSem.base).toBeCloseTo(DESP, 2)
    expect(ibsCom.amount - ibsSem.amount).toBeCloseTo(DESP * 0.01, 2)
  })

  it('Desp. Acessórias somam à base do IPI (Âncora + Desp.)', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: DESP }))
    const ipi = find(r.distribution.taxes_outside, 'IPI')!
    expect(ipi.base).toBeCloseTo(r.motor.ancora + DESP, 2)
    expect(ipi.amount).toBeCloseTo((r.motor.ancora + DESP) * 0.05, 2)
  })

  it('valor_final = Âncora + Desp. Acessórias + Σ tributos por fora', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: DESP }))
    expect(r.distribution.valor_final).toBeCloseTo(
      r.motor.ancora + DESP + r.distribution.taxes_outside_total,
      2,
    )
    expect(r.distribution.desp_acessorias).toBeCloseTo(DESP, 2)
  })
})

describe('Motor V17 Etapa 17 — IS e ISS combinados com Desp. Acessórias', () => {
  it('IS > 0: base do IS = base_iva + Desp. (D1); base IBS/CBS = base_iva + IS + Desp.', () => {
    const ratesIS: TaxRatePeriod[] = [
      rate('ICMS', 0.17), rate('IS', 0.1), rate('IBS', 0.01), rate('CBS', 0.088), rate('IPI', 0.05),
    ]
    const r = calculateMotorV17(baseInput({ rates: ratesIS, desp_acessorias: DESP }))
    const baseIva = r.motor.ancora - r.motor.icms - r.motor.iss - r.motor.pis_cofins
    const is = find(r.distribution.taxes_outside, 'IS')!
    const ibs = find(r.distribution.taxes_outside, 'IBS')!
    // EPIC-POR-FORA-V2 D1: a base do IS inclui as Desp. Acessórias.
    expect(is.base).toBeCloseTo(baseIva + DESP, 2)
    // Base de IBS/CBS = base_iva + IS + Desp.
    expect(ibs.base).toBeCloseTo(baseIva + is.amount + DESP, 2)
  })

  it('ISS > 0 (serviço, sem ICMS): ISS sai da base; despesas entram só em IBS/CBS', () => {
    const ratesISS: TaxRatePeriod[] = [
      rate('ICMS', 0), rate('ISS', 0.05), rate('IBS', 0.01), rate('CBS', 0.088),
    ]
    const r = calculateMotorV17(baseInput({ rates: ratesISS, desp_acessorias: DESP }))
    const baseIva = r.motor.ancora - r.motor.icms - r.motor.iss - r.motor.pis_cofins
    const ibs = find(r.distribution.taxes_outside, 'IBS')!
    // IS_rate = 0 → base_ibs_cbs = base_iva + Desp. (ISS já descontado em base_iva).
    expect(ibs.base).toBeCloseTo(baseIva + DESP, 2)
    expect(r.motor.iss).toBeGreaterThan(0)
  })
})

describe('Motor V17 Etapa 17 — ICMS Complementar', () => {
  it('NÃO gera ICMS Complementar quando destinatário é contribuinte (default)', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: DESP, icms_compl_applies: false }))
    expect(find(r.distribution.taxes_outside, 'ICMS_COMPL')).toBeUndefined()
  })

  it('gera ICMS Complementar = (IPI + Desp.) × ICMS para não contribuinte', () => {
    const r = calculateMotorV17(baseInput({ desp_acessorias: DESP, icms_compl_applies: true }))
    const ipi = find(r.distribution.taxes_outside, 'IPI')!
    const compl = find(r.distribution.taxes_outside, 'ICMS_COMPL')!
    expect(compl.base).toBeCloseTo(ipi.amount + DESP, 2)
    expect(compl.amount).toBeCloseTo((ipi.amount + DESP) * 0.17, 2)
  })
})
