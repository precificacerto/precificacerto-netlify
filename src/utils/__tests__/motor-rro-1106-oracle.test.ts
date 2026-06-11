/**
 * ORACLE — Planilha "Motor RRO 11.06 (1).xlsx" (fonte de verdade, 2026-06-11).
 *
 * Trava o cenário canônico desconto 10% + ICMS-ST ativo + ICMS Complementar, conforme decisão
 * do usuário (planilha 11.06 supera a regra "frete fixo D3" do doc v4 Tab. 77):
 *
 *   Formação:
 *     Op. venda por dentro (âncora pré) ... 143.669,80
 *     Custo produto ....................... 55.901,92
 *     MO+Desp (formação) .................. 38.345,46
 *     IPI (5% sobre OpDentro+Desp) ........ 7.243,49
 *     Desp. Acessórias (frete+seguro) ..... 1.200,00
 *     ICMS-ST (interestadual, MVA 40%) .... 20.130,27
 *     ICMS Complementar ................... 1.435,39
 *     Valor do orçamento .................. 174.883,41
 *
 *   Desconto 10% (Apuração reversa):
 *     BC ICMS-ST pós ...................... 136.901,96   (= (OpDentro+Desp+IPI) × 0,9)
 *     ICMS-ST pós ......................... 18.117,24
 *     ICMS Complementar pós ............... 1.312,25     (Desp. FIXA; IPI descontado)
 *     ÂNCORA pós-desconto ................. 129.170,22
 *     RRO ................................. 12.963,89
 *
 * Regras (decisão 2026-06-11):
 *  - ST/IPI/Desp. no ST/DIFAL → DESCONTADOS junto (preço efetivo da operação).
 *  - Desp. Acessória FIXA apenas na base do ICMS Complementar (frete/seguro contratuais).
 */

import { computeIcmsSt, computeIcmsComplementar } from '../icms-st-difal'
import { calculateMotorV17 } from '../mrm-engine-v17'
import type { MotorV17Input, TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 'test', tax_type, origin_state: null, dest_state: null,
    rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

// ───── Constantes da planilha 11.06 ─────
const OPDENTRO = 143669.8021074274
const IPI = 7243.490105371369
const DESP = 1200
const CP = 55901.92
const DOP_SUM = 13605.530259573374 + 14927.292438961706 + 9209.234315086096 + 603.413168851195
const UNIT = 152117.7515702904 // por dentro + por fora IVA (= products.sale_price)
const D = 0.10

describe('Oracle 11.06 — ICMS-ST recalculado sobre base pós-desconto (gargalo 1)', () => {
  const stInput = {
    opInterna: OPDENTRO,
    despAcessorias: DESP,
    ipiValue: IPI,
    mvaOriginalPct: 40,
    alqInternaDestinoPct: 17,
    alqInterestadualOrigemPct: 12,
    interestadual: true,
  }

  it('BC própria pós-desconto = (OpDentro+IPI+Desp) × (1−d) = R$ 136.901,96', () => {
    const st = computeIcmsSt({ ...stInput, discount: D })
    expect(st.bcPropria).toBeCloseTo(136901.96, 2)
  })

  it('ICMS-ST pós-desconto = R$ 18.117,24', () => {
    const st = computeIcmsSt({ ...stInput, discount: D })
    expect(st.icmsSt).toBeCloseTo(18117.24, 2)
  })

  it('INVARIANTE: ST é recalculado (não congelado) — escala com (1−d)', () => {
    const stPre = computeIcmsSt({ ...stInput, discount: 0 })
    const stPos = computeIcmsSt({ ...stInput, discount: D })
    expect(stPre.icmsSt).toBeCloseTo(20130.27, 2) // base pré da planilha
    expect(stPos.icmsSt).toBeLessThan(stPre.icmsSt) // recalculado, não o valor original
    expect(stPos.icmsSt).toBeCloseTo(stPre.icmsSt * (1 - D), 2) // linear na base
  })
})

describe('Oracle 11.06 — ICMS Complementar: Desp. Acessória FIXA (base legal distinta)', () => {
  it('ICMS Compl pós = (IPI_pós + Desp. FIXA 1.200) × ICMS = R$ 1.312,25', () => {
    const ipiPos = IPI * (1 - D)
    expect(computeIcmsComplementar(ipiPos, DESP, 17)).toBeCloseTo(1312.25, 2)
  })
})

describe('Oracle 11.06 — Motor: âncora e RRO pós-desconto (gargalo 3)', () => {
  const input: MotorV17Input = {
    items: [{
      item_id: 'p1', rb: UNIT, cp: CP, mod_pct: 0, dop_pct: DOP_SUM / UNIT,
      commission_pct: 0.05, profit_pct: 0.10, csll_pct: 0.009, irpj_pct: 0.015,
      peso_op_interna: OPDENTRO / UNIT,
    }],
    discount: { pct: D },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.17), rate('IPI', 0.05), rate('IBS', 0.001), rate('CBS', 0.009), rate('IS', 0)],
    effective_date: '2026-06-11',
    use_snapshot_rates: false,
    desp_acessorias: DESP,
    icms_compl_applies: true, // consumidor final não contribuinte → frete na base
  }

  it('ÂNCORA pós-desconto = R$ 129.170,22 (Desp. Acessória FIXA absorvida pela operação)', () => {
    const r = calculateMotorV17(input)
    expect(r.motor.ancora).toBeCloseTo(129170.22, 1)
  })

  it('ICMS sobre âncora corrigida = R$ 21.958,94', () => {
    const r = calculateMotorV17(input)
    expect(r.motor.icms).toBeCloseTo(21958.94, 1)
  })

  it('RRO = R$ 12.963,89 (bate a planilha 11.06)', () => {
    const r = calculateMotorV17(input)
    expect(r.motor.rro).toBeCloseTo(12963.89, 1)
  })

  it('Sem desconto: âncora = OpDentro cheia (correção só com d>0)', () => {
    const r = calculateMotorV17({ ...input, discount: { pct: 0 } })
    expect(r.motor.ancora).toBeCloseTo(OPDENTRO, 1)
  })

  it('Sem Desp. Acessória: âncora = OpDentro×(1−d) limpa (correção zero)', () => {
    const r = calculateMotorV17({ ...input, desp_acessorias: 0 })
    expect(r.motor.ancora).toBeCloseTo(OPDENTRO * (1 - D), 1)
  })
})
