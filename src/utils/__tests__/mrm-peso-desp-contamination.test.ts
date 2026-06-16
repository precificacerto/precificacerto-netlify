/**
 * REGRESSÃO — peso_op_interna NÃO pode ser contaminado pela Desp. Acessória.
 *
 * Regra formal (16/06/2026): o Peso Interno/Externo nasce SÓ de Operação Interna +
 * Operação Externa. Despesas Acessórias (frete + seguro + acessórias) e Impostos
 * Complementares são camadas SEPARADAS, somadas DEPOIS — não entram no denominador do peso.
 *
 * Contexto do bug: `unit_price` (= products.sale_price) embute a Desp. Acessória, pois
 * iva-dual-outside.ts:205 define finalPrice = op.interna + desp + por-fora. O caminho de
 * página (calculateMotorV17ForPage) calculava peso = op.interna ÷ unit_price, deixando a
 * desp no denominador (93,7072% no cenário canônico). O fix remove a desp do `rb` E do
 * denominador do peso de forma consistente → peso correto (94,4464%) com âncora invariante.
 *
 * Cenário canônico (planilha Motor RRO):
 *   op.interna ............ 143.669,8021
 *   terceirizadas (desp) .. 1.200,00
 *   op.externa (por fora) . 8.447,95
 *   sale_price_base ....... 144.869,8021  (= op.interna + terceirizadas)
 *   unit_price (sale_price) 153.317,75    (= op.interna + desp + por-fora)
 *   rb LIMPO (esperado) ... 152.117,75    (= unit_price − terceirizadas)
 *   peso CORRETO .......... 143.669,8021 / 152.117,75 = 0,9444644 (94,4464%)
 *   peso CONTAMINADO (bug)  143.669,8021 / 153.317,75 = 0,9370722 (93,7072%)
 */

import {
  calculateMotorV17ForPage,
  type PageBuildArgs,
} from '../mrm-engine-v17/legacy-adapter'
import type { TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 'test', tax_type, origin_state: null, dest_state: null,
    rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

const OP_INTERNA = 143669.8021074274
const TERCEIRIZADAS = 1200
const SALE_PRICE_BASE = OP_INTERNA + TERCEIRIZADAS // 144.869,8021
const UNIT_PRICE = 153317.75 // sale_price = op.interna + desp + por-fora (iva-dual:205)
const RB_LIMPO = UNIT_PRICE - TERCEIRIZADAS // 152.117,75
const PESO_CORRETO = OP_INTERNA / RB_LIMPO // 0,9444644
const PESO_CONTAMINADO = OP_INTERNA / UNIT_PRICE // 0,9370722

function makeArgs(overrides: Partial<PageBuildArgs['items'][number]> = {}, discount = 0): PageBuildArgs {
  return {
    items: [
      {
        unit_price: UNIT_PRICE,
        quantity: 1,
        cost_total: 55901.92,
        commission_percent: 5,
        profit_percent: 10,
        sale_price_base_unit: SALE_PRICE_BASE,
        terceirizadas_unit: TERCEIRIZADAS,
        ...overrides,
      } as PageBuildArgs['items'][number],
    ],
    tenantCtx: {
      regime: 'LUCRO_REAL',
      rates: [rate('ICMS', 0.17), rate('IPI', 0.05), rate('IBS', 0.001), rate('CBS', 0.009), rate('IS', 0)],
      csll_pct: 0.009,
      irpj_pct: 0.015,
      dop_pct: 0.30,
      absorption_policy: 'RRO_PROPORTIONAL',
    },
    globalDiscountPercent: discount,
  }
}

function ancoraStep(args: PageBuildArgs) {
  const per = calculateMotorV17ForPage(args)
  const r = per[0]
  if (!r) throw new Error('per_item[0] nulo')
  const step = (r.cascade_trace ?? []).find(s => (s.label || '').toLowerCase().includes('ncora'))
  if (!step) throw new Error('step de âncora não encontrado')
  return { rb: r.rb, rate: step.rate ?? 0, amount: step.amount ?? 0 }
}

describe('Regressão — peso interno sem contaminação por Desp. Acessória', () => {
  it('peso = op.interna ÷ (op.interna + op.externa), SEM a desp no denominador', () => {
    const { rate: peso } = ancoraStep(makeArgs())
    expect(peso).toBeCloseTo(PESO_CORRETO, 6)
    expect(peso).toBeCloseTo(0.9444644, 6)
    // NÃO pode ser o valor contaminado
    expect(Math.abs(peso - PESO_CONTAMINADO)).toBeGreaterThan(0.001)
  })

  it('rb do motor exclui a desp. acessória (= unit_price − terceirizadas)', () => {
    const { rb } = ancoraStep(makeArgs())
    expect(rb).toBeCloseTo(RB_LIMPO, 2)
    expect(rb).toBeCloseTo(152117.75, 2)
  })

  it('âncora INVARIANTE = op.interna (143.669,80) — fix não move o RRO a d=0', () => {
    const { amount } = ancoraStep(makeArgs())
    expect(amount).toBeCloseTo(OP_INTERNA, 1)
  })

  it('âncora correta com desconto 10% (Venda Consolidada − desc − desp fixa, × peso)', () => {
    // Etapa 12 agora exibe a âncora REAL (motor.ancora, com absorção da desp). Pela metodologia:
    // restante = (rb_limpo + desp) × (1−d) − desp ; âncora = restante × peso.
    const { rate: peso, amount } = ancoraStep(makeArgs({}, 10))
    const restante = (RB_LIMPO + TERCEIRIZADAS) * 0.9 - TERCEIRIZADAS
    expect(amount).toBeCloseTo(restante * peso, 1)
    // Estritamente menor que a âncora pré-absorção (OP_INTERNA × 0,9), pela desp absorvida.
    expect(amount).toBeLessThan(OP_INTERNA * 0.9)
  })

  it('CONTROLE: sem desp (terceirizadas=0) o peso e o rb não mudam', () => {
    // sale_price_base sem terceirizadas; unit_price = op.interna + por-fora (sem desp)
    const noDesp = ancoraStep(
      makeArgs({ terceirizadas_unit: 0, sale_price_base_unit: OP_INTERNA, unit_price: 152117.75 }),
    )
    expect(noDesp.rb).toBeCloseTo(152117.75, 2)
    expect(noDesp.rate).toBeCloseTo(OP_INTERNA / 152117.75, 6)
  })

  it('CONTROLE: item manual (sem sale_price_base) mantém unit_price cheio e peso=1', () => {
    const manual = ancoraStep(
      makeArgs({ sale_price_base_unit: null, terceirizadas_unit: null, unit_price: 10000 }),
    )
    expect(manual.rb).toBeCloseTo(10000, 2)
    expect(manual.rate).toBeCloseTo(1, 6)
  })
})
