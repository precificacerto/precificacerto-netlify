/**
 * ORÁCULO "Aluminio" (Lucro Real) — planilha oficial do cliente (31/07/2026)
 *
 * Teste de PRECISÃO / DOCUMENTAÇÃO DE DIVERGÊNCIA. NÃO altera o motor.
 *
 * Cenário-oráculo (produto Aluminio):
 *   - CMV = 8.457 un × R$ 0,80 = R$ 6.753,75 (MOD produtiva = 0)
 *   - Alíquotas de margem sobre CMV (Op. Interna): MO adm 9,470% + Desp. fixas 10,390%
 *     + Desp. variáveis 6,410% + Desp. financeiras 0,420% + RT 3,000% + Comissão 5,000%
 *     + Lucro 10,000% + IRPJ 1,500% + CSLL 0,900% + ICMS 17,000% + PIS/COFINS 0% =
 *     Σ = 64,09% → coeficiente margem = 35,91%.
 *   - Total Operação Interna = 6.753,75 / 0,3591 = R$ 18.807,44
 *   - Atividades terceirizadas (Desp. acessórias): Frete 1.000 + Seguro 200 = R$ 1.200,00
 *   - Tributos por fora (sobre Op.Interna+Desp.Acess = 20.007,44):
 *       IBS 0,1% = 16,81 · CBS 8% = 1.344,81 · IS 0% · IPI 5% = 1.000,37 → R$ 2.362,00
 *   - Preço Final do produto = R$ 22.369,43
 *
 * Cenário do orçamento (cenário completo):
 *   1 produto Aluminio + 1 PRODUTO MANUAL R$ 10.000,00 · DESCONTO 5%
 *     Valor orçamento         = 22.369,43 + 10.000       = 32.369,43
 *     Valor pós-desconto (5%)                            = 30.750,96
 *     (−) Produto manual (cheio)                         = 10.000,00
 *     (−) Desp. acessórias (cheio)                       =  1.200,00
 *     Base distribuível (RRO)                            = 19.550,96
 *     Âncora "por dentro"                                = 17.369,55
 *     Op. por fora                                       =  2.181,41
 *     RRO                                                =  2.122,18
 */

import {
  calculateMotorV17ForPage,
  type PageBuildArgs,
  type PageItem,
  type PageTenantCtx,
} from '../mrm-engine-v17/legacy-adapter'
import type { TaxRatePeriod } from '@/types/mrm'

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

// ─────────────────────── Números do oráculo ───────────────────────
const CMV = 6753.75
const OP_INTERNA_ORACLE = 18807.44
const TERCEIRIZADAS = 1200 // frete 1000 + seguro 200
const PRECO_FINAL_PRODUTO = 22369.43
const MANUAL = 10000

// Alíquotas do produto (decimais)
const ICMS = 0.17
const COMISSAO = 0.05
const LUCRO = 0.1
const RT = 0.03
const IRPJ = 0.015 // 15% × lucro 10%
const CSLL = 0.009 //  9% × lucro 10%
// Tributos por fora
const IBS = 0.001
const CBS = 0.08
const IS = 0
const IPI = 0.05

// DOP (despesas operacionais) por bucket — % sobre Op. Interna
const DOP_ADMIN = 0.0947
const DOP_FIXA = 0.1039
const DOP_VAR = 0.0641
const DOP_FIN = 0.0042

// ─────────────────────── Montagem do produto Aluminio ───────────────────────
// sale_price_base = Op. Interna + Desp. Acessórias (PRÉ tributos por fora)
const SALE_PRICE_BASE = OP_INTERNA_ORACLE + TERCEIRIZADAS // 20.007,44
// unit_price = preço final (embute Op. Interna + Desp. Acess. + tributos por fora)
const UNIT_PRICE = PRECO_FINAL_PRODUTO // 22.369,43

const aluminioProduct: PageItem = {
  unit_price: UNIT_PRICE,
  quantity: 1,
  cost_total: CMV,
  productive_labor_unit: 0,
  commission_percent: COMISSAO * 100,
  profit_percent: LUCRO * 100,
  rt_reserve_percent: RT * 100,
  sale_price_base_unit: SALE_PRICE_BASE,
  terceirizadas_unit: TERCEIRIZADAS,
  item_tax_rates: {
    icms_pct: ICMS,
    pis_pct: 0,
    cofins_pct: 0,
    iss_pct: 0,
    ibs_pct: IBS,
    cbs_pct: CBS,
    is_pct: IS,
    ipi_pct: IPI,
    irpj_pct: IRPJ,
    csll_pct: CSLL,
  },
}

const tenantCtx: PageTenantCtx = {
  regime: 'LUCRO_REAL',
  rates: [
    rate('ICMS', ICMS),
    rate('IBS', IBS),
    rate('CBS', CBS),
    rate('IS', IS),
    rate('IPI', IPI),
  ],
  csll_pct: CSLL,
  irpj_pct: IRPJ,
  // DOP calculado sobre Op. Interna via expense_breakdown por bucket
  expense_breakdown: {
    administrative_pct: DOP_ADMIN,
    fixed_pct: DOP_FIXA,
    variable_pct: DOP_VAR,
    financial_pct: DOP_FIN,
  },
  absorption_policy: 'RRO_PROPORTIONAL',
}

type MotorResult = NonNullable<ReturnType<typeof calculateMotorV17ForPage>[number]>
const stepOf = (r: MotorResult, n: number) =>
  r.cascade_trace.find((s) => Number(s.step) === n)

describe('ORÁCULO Aluminio — passo 1: Op. Interna do produto (sem manual, sem desconto)', () => {
  const argsSoAluminio: PageBuildArgs = {
    items: [aluminioProduct],
    tenantCtx,
    globalDiscountPercent: 0,
  }

  it('Etapa 7 "Formação Op Interna" = R$ 18.807,44 (tol 0,10)', () => {
    const [m] = calculateMotorV17ForPage(argsSoAluminio)
    expect(m).not.toBeNull()
    const step7 = stepOf(m!, 7)!
    expect(step7).toBeDefined()
    // eslint-disable-next-line no-console
    console.log('[ORÁCULO Aluminio] Etapa 7 Op Interna =', step7.amount, '(oráculo 18807.44)')
    // Reproduz BIT-EXACT (diferença < 0,10). Inputs que reproduzem (ver topo do arquivo):
    //   unit_price = 22.369,43 · sale_price_base_unit = 20.007,44 · terceirizadas_unit = 1.200
    //   cost_total = 6.753,75 · commission 5% · profit 10% · rt 3% · icms 17%
    //   expense_breakdown (DOP): admin 9,47% + fixa 10,39% + var 6,41% + fin 0,42%
    // Motor: peso_op_interna = (sale_price_base − terc)/(unit_price − terc) = 18.807,44/21.169,43
    //        Etapa 7 = rb × peso = 21.169,43 × (18.807,44/21.169,43) = 18.807,44 ✓
    expect(Math.abs(Number(step7.amount) - OP_INTERNA_ORACLE)).toBeLessThan(0.1)
  })

  it('DEBUG: dump de todas as etapas + campos-chave', () => {
    const [m] = calculateMotorV17ForPage(argsSoAluminio)
    // eslint-disable-next-line no-console
    console.log('=== CENÁRIO SÓ ALUMINIO (sem desconto) ===')
    // eslint-disable-next-line no-console
    console.log('rb=', m!.rb, 'rv=', m!.rv, 'ancora_interna=', m!.ancora_interna, 'rro=', m!.rro, 'cp=', m!.cp)
    for (const s of m!.cascade_trace) {
      // eslint-disable-next-line no-console
      console.log(`step ${s.step} | ${s.label} | base=${s.base} | amount=${s.amount}`)
    }
    expect(m).not.toBeNull()
  })
})

// ─────────────────────── CENÁRIO COMPLETO: produto + manual + 5% desconto ───────────────────────
//
// Oráculo (planilha do cliente):
//   Base distribuível (RRO) = 19.550,96
//   Âncora "por dentro"     = 17.369,55
//   RRO                     =  2.122,18
//
// O motor V17 exclui o produto manual da cascata de produtos (repasse puro). Doc 31/07/2026:
// o desconto de 5% absorve TAMBÉM o valor do manual (10.000) e das Desp. Acessórias (1.200)
// via `discount.discount_immune_base` — i.e., a base distribuível é
// `total_pós_desc − manual_cheio − desp_cheio` = 19.550,96.
//
// >>> FIX APLICADO (absorção do desconto do manual + desp). Estes it() batem no oráculo. <<<
describe('ORÁCULO Aluminio — cenário completo (manual 10.000 + desconto 5%)', () => {
  const DESCONTO_PCT = 5
  const argsCompleto: PageBuildArgs = {
    items: [
      aluminioProduct,
      { unit_price: MANUAL, quantity: 1, is_manual_cost: true },
    ],
    tenantCtx,
    globalDiscountPercent: DESCONTO_PCT,
  }

  // Oráculo
  const BASE_DISTRIBUIVEL_ORACLE = 19550.96
  const ANCORA_ORACLE = 17369.55
  const RRO_ORACLE = 2122.18

  it('DEBUG: dump completo (produto) + valores reais vs oráculo', () => {
    const results = calculateMotorV17ForPage(argsCompleto)
    const produto = results[0]!
    const manual = results[1]!
    // eslint-disable-next-line no-console
    console.log('=== CENÁRIO COMPLETO (aluminio + manual 10.000 + desc 5%) ===')
    // eslint-disable-next-line no-console
    console.log(
      'PRODUTO: rb=', produto.rb, 'desc_value=', produto.desc_value, 'rv=', produto.rv,
      'ancora_interna=', produto.ancora_interna, 'rro=', produto.rro,
    )
    // eslint-disable-next-line no-console
    console.log('MANUAL: cp=', manual.cp, 'rro=', manual.rro)
    for (const s of produto.cascade_trace) {
      // eslint-disable-next-line no-console
      console.log(`step ${s.step} | ${s.label} | base=${s.base} | rate=${s.rate} | amount=${s.amount}`)
    }
    // eslint-disable-next-line no-console
    console.log(
      'ORÁCULO → base_distribuível 19550.96 | âncora 17369.55 | RRO 2122.18',
    )
    // eslint-disable-next-line no-console
    console.log(
      'MOTOR   → âncora(step12/ancora_interna)=', produto.ancora_interna,
      '| RRO(step15)=', produto.rro,
    )
    expect(results.length).toBe(2)
  })

  // Base distribuível: o oráculo define como (total pós-desc − manual − desp acess) = 19.550,96.
  // No motor, a "base" mais próxima é a Op. Interna pós-desconto (Etapa 12) + Op. por fora,
  // OU a Venda consolidada pós-desconto. Documentamos a base da Etapa 11 e a RV do produto.
  // it.failing: o teste PASSA enquanto a asserção FALHA (marca a divergência conhecida sem
  // vermelhar o CI). Quando o fix de absorção do desconto do manual entrar, estes passarão a
  // FALHAR (o it.failing detecta que a asserção agora passa) — sinalizando para removê-los.

  // FIX (Doc 31/07/2026): absorção do desconto do manual + desp. acessória.
  // valor_imune = manual (10.000) + desp. acessória (1.200) = 11.200. O desconto passa a incidir
  // sobre o VALOR TOTAL do orçamento e é integralmente subtraído da base distribuível:
  //   desc_value = 0,05 × (21.169,43 + 11.200) = 1.618,47 → rv = 21.169,43 − 1.618,47 = 19.550,96.
  // Equivale a (32.369,43 × 0,95) − 10.000 − 1.200 = 30.750,96 − 11.200 = 19.550,96.
  it('base distribuível do RRO = 19.550,96 (oráculo)', () => {
    const results = calculateMotorV17ForPage(argsCompleto)
    const produto = results[0]!
    // Candidata a "base distribuível": Venda consolidada pós-desconto do produto = rv.
    const baseMotor = produto.rv
    // eslint-disable-next-line no-console
    console.log('[base] motor rv(produto)=', baseMotor, ' oráculo=', BASE_DISTRIBUIVEL_ORACLE, ' Δ=', baseMotor - BASE_DISTRIBUIVEL_ORACLE)
    expect(baseMotor).toBeCloseTo(BASE_DISTRIBUIVEL_ORACLE, 2)
  })

  // FIX (Doc 31/07/2026): âncora = rv × peso = 19.550,96 × 0,888424 = 17.369,55. O termo base
  // da Desp. Acessória do `desp_pool_adjustment` (Gargalo 3) foi omitido para não dupla-contar
  // — a desp já entra no valor_imune. Sem ICMS Complementar, desp_pool_adjustment = 0.
  it('âncora "por dentro" = 17.369,55 (oráculo)', () => {
    const results = calculateMotorV17ForPage(argsCompleto)
    const produto = results[0]!
    const ancoraMotor = produto.ancora_interna
    // eslint-disable-next-line no-console
    console.log('[âncora] motor=', ancoraMotor, ' oráculo=', ANCORA_ORACLE, ' Δ=', ancoraMotor - ANCORA_ORACLE)
    expect(ancoraMotor).toBeCloseTo(ANCORA_ORACLE, 2)
  })

  // FIX (Doc 31/07/2026): RRO = âncora − impostos − CMV − MOD − DOP − RT = 2.122,18.
  it('RRO = 2.122,18 (oráculo)', () => {
    const results = calculateMotorV17ForPage(argsCompleto)
    const produto = results[0]!
    const rroMotor = produto.rro
    // eslint-disable-next-line no-console
    console.log('[RRO] motor=', rroMotor, ' oráculo=', RRO_ORACLE, ' Δ=', rroMotor - RRO_ORACLE)
    expect(rroMotor).toBeCloseTo(RRO_ORACLE, 2)
  })
})
