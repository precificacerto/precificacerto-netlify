/**
 * SIMPLES NACIONAL / MEI — a decomposição obedece à construção, com a planilha do PO como
 * gabarito ("Cascata SIMPLES e MEI", 19/09/2026).
 *
 * O DEFEITO, medido antes desta correção com os números da planilha (bloco Industrialização,
 * P1 + P6 + P4, desconto 0%): a decomposição NÃO TINHA linha de DAS. Ela lia ICMS, ISS,
 * PIS/COFINS e IBS/CBS — todos zero no Simples — e o DAS (R$ 79,06) caía inteiro no RRO:
 *
 *   | linha      | planilha | sistema antes |
 *   |------------|---------:|--------------:|
 *   | DAS        |    79,06 |   (sem linha) |
 *   | RRO        |   107,81 |        186,88 |
 *   | Comissão   |    35,94 |         53,70 |
 *   | Lucro      |    71,88 |        107,40 |
 *   | IRPJ/CSLL  |   0 / 0  | 16,11 / 9,67  |
 *
 * O RESIDUAL fechava em zero mesmo assim — ele distribui o RRO seja qual for. Quem acusava
 * era o invariante do RRO (sobra de R$ 61,81). Os cards de comissão/lucro e o PDF leem esta
 * decomposição, então exibiam os números inflados.
 *
 * A REGRA (Motor 2, 28/08/2026, e a planilha): o DAS SUBSTITUI ICMS + ISS + PIS/COFINS e
 * incide sobre o TOTAL DA OPERAÇÃO de cada item (linha 82: `H82 = H80`), recalculando com o
 * desconto. IBS, CBS, IS e IPI "não existem no Simples e MEI" — sem linha. IRPJ e CSLL: peso
 * zero, e as linhas OCULTAS (PO, 19/09/2026). MEI: DAS zero por item (fixo mensal), linha presente.
 */
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { calculatePricing } from '@/utils/pricing-engine'
import { applyDecompositionToResidual } from '@/utils/residual-from-decomposition'
import { resolveDespesasOperacionaisPct, resolveSegmentoDaDespesa, type BaldesDeDespesa } from '@/utils/despesas-do-segmento'

// A planilha: MO produtiva 15% · MO indireta 8% · fixa 10% · variável 5% · financeira 2%
// DAS 11% · RT 1% · comissão 5% · lucro 10%.
const BALDES: BaldesDeDespesa = { fixa: 0.10, variavel: 0.05, financeira: 0.02, indireta: 0.08, moProdutiva: 0.15 }
const DAS = 0.11
const [RT, COM, LUC] = [0.01, 0.05, 0.10]

/** A CONSTRUÇÃO, pela mesma função que as telas chamam, com a despesa do segmento. */
const preco = (cmv: number, tenant: string, isService = false, calcType = 'INDUSTRIALIZACAO') => calculatePricing({
  calcType: calcType as never, totalItemsCost: cmv, yieldQuantity: 1,
  laborCostMonthly: 0, numProductiveEmployees: 0, monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
  structurePct: resolveDespesasOperacionaisPct(resolveSegmentoDaDespesa({ isService, tenantCalcType: tenant }), BALDES),
  taxPct: DAS, commissionPct: COM, profitPct: LUC, rtReservePct: RT,
}).priceUnit

const item = (key: string, price: number, mat: number, mo: number, over: Partial<BudgetDecompositionItem> = {}): BudgetDecompositionItem => ({
  key, label: key, quantity: 1, unitPrice: price, costUnit: mat, productiveLaborUnit: mo,
  commissionPct: COM * 100, profitPct: LUC * 100, rtPct: RT * 100, acrescimos: 0,
  rates: { icms_pct: 0, iss_pct: 0, pis_pct: 0, cofins_pct: 0, ibs_pct: 0, cbs_pct: 0, ipi_pct: 0, is_pct: 0, das_pct: DAS * 100 } as never,
  ...over,
})

const decompor = (items: BudgetDecompositionItem[], tenant: string, regime: string | null, d = 0) =>
  buildDecomposition(buildBudgetDecompositionInput({ items, discountPct: d, despesas: BALDES, tenantCalcType: tenant, regime }).input)
const row = (r: ReturnType<typeof buildDecomposition>, k: string) => r.rows.find((x) => x.key === k)
const v = (r: ReturnType<typeof buildDecomposition>, k: string) => row(r, k)!.total

// ── Os preços da planilha ────────────────────────────────────────────────────────────────
const P1 = preco(120, 'INDUSTRIALIZACAO')                  // 100 + MO 20
const P6 = preco(140, 'INDUSTRIALIZACAO')                  // 110 + MO 30
const P4 = preco(85, 'INDUSTRIALIZACAO', false, 'REVENDA') // revenda SECUNDÁRIA
const INDUSTRIA = () => [item('P1', P1, 100, 20), item('P6', P6, 110, 30), item('P4', P4, 85, 0, { productType: 'REVENDA' })]

describe('1. CONSTRUÇÃO — os preços da planilha, nos três segmentos', () => {
  it('Industrialização: P1 250,00 · P6 291,67 · P4 (revenda secundária) 177,08 — MC 48%', () => {
    expect(P1).toBeCloseTo(250, 2); expect(P6).toBeCloseTo(291.666667, 2); expect(P4).toBeCloseTo(177.083333, 2)
  })
  it('Revenda principal: P2 303,03 · P5 151,52 — MO produtiva + indireta agrupadas, MC 33%', () => {
    expect(preco(100, 'REVENDA', false, 'REVENDA')).toBeCloseTo(303.030303, 2)
    expect(preco(50, 'REVENDA', false, 'REVENDA')).toBeCloseTo(151.515152, 2)
  })
  it('Serviço: revenda secundária 151,52 / 75,76 (MC 66%) e o serviço, CSV 165, a 250,00', () => {
    expect(preco(100, 'SERVICO', false, 'REVENDA')).toBeCloseTo(151.515152, 2)
    expect(preco(50, 'SERVICO', false, 'REVENDA')).toBeCloseTo(75.757576, 2)
    expect(preco(165, 'SERVICO', true, 'SERVICO')).toBeCloseTo(250, 2)
  })
})

describe('2. DECOMPOSIÇÃO — Industrialização, desconto 0%, célula a célula com a planilha', () => {
  const r = decompor(INDUSTRIA(), 'INDUSTRIALIZACAO', 'SIMPLES_NACIONAL')
  it('total agrupado 718,75', () => { expect(r.totalGeral).toBeCloseTo(718.75, 2) })
  it('>>> DAS 79,06 — a linha que faltava <<<', () => { expect(-v(r, 'das')).toBeCloseTo(79.0625, 3) })
  it('custos 345,00 · despesas 179,69 · RT 7,19', () => {
    expect(-v(r, 'custos')).toBeCloseTo(345, 3)
    expect(-v(r, 'despesas')).toBeCloseTo(179.6875, 3)
    expect(-v(r, 'rt')).toBeCloseTo(7.1875, 3)
  })
  it('>>> RRO 107,81 → comissão 35,94 (1/3) e lucro 71,88 (2/3) <<<', () => {
    expect(v(r, 'rro')).toBeCloseTo(107.8125, 3)
    expect(v(r, 'comissao')).toBeCloseTo(35.9375, 3)
    expect(v(r, 'lucro')).toBeCloseTo(71.875, 3)
    expect(row(r, 'comissao')!.pctSobreTotalGeral! * 100).toBeCloseTo(5, 4)
    expect(row(r, 'lucro')!.pctSobreTotalGeral! * 100).toBeCloseTo(10, 4)
  })
  it('IRPJ e CSLL: linhas OCULTAS no Simples/MEI (PO, 19/09/2026) — o RRO é só comissão + lucro', () => {
    expect(row(r, 'irpj')).toBeUndefined(); expect(row(r, 'csll')).toBeUndefined()
    expect(v(r, 'comissao') + v(r, 'lucro')).toBeCloseTo(v(r, 'rro'), 8)
    expect(r.guiaUnica).toBe(true)
  })
  it('residual zero e o invariante do RRO NÃO acusa', () => {
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
    expect(r.rro!.foraDeZero).toBe(false)
  })
  it('R4 — ICMS, ISS, PIS/COFINS e os por fora NÃO APARECEM, nem zerados', () => {
    for (const k of ['icms', 'iss', 'pis_cofins', 'por_fora', 'por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi']) {
      expect(row(r, k)).toBeUndefined()
    }
  })
})

describe('3. COM DESCONTO — o DAS recalcula sobre o pós-desconto; custo e despesa congelam', () => {
  it.each([0.05, 0.10, 0.30])('desconto %p: fecha 100%', (d) => {
    const sem = decompor(INDUSTRIA(), 'INDUSTRIALIZACAO', 'SIMPLES_NACIONAL')
    const r = decompor(INDUSTRIA(), 'INDUSTRIALIZACAO', 'SIMPLES_NACIONAL', d)
    const receita = 718.75 * (1 - d)
    expect(-v(r, 'das')).toBeCloseTo(receita * DAS, 4)
    expect(-v(r, 'rt')).toBeCloseTo(receita * RT, 4)
    expect(v(r, 'custos')).toBeCloseTo(v(sem, 'custos'), 8)
    expect(v(r, 'despesas')).toBeCloseTo(v(sem, 'despesas'), 8)
    const fecho = -v(r, 'das') - v(r, 'custos') - v(r, 'despesas') - v(r, 'rt') + v(r, 'rro')
    expect(fecho).toBeCloseTo(r.receitaAposDesconto, 4)
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
    r.residual.perItem.forEach((x) => expect(Math.abs(x)).toBeLessThan(0.005))
    expect(v(r, 'comissao') + v(r, 'lucro')).toBeCloseTo(v(r, 'rro'), 6)
  })
})

describe('4. ALÍQUOTAS DIFERENTES NO AGRUPAMENTO — cada item com o seu DAS', () => {
  const itens = [item('A', 250, 100, 20), item('B', 200, 80, 0, {
    rates: { icms_pct: 0, iss_pct: 0, pis_pct: 0, cofins_pct: 0, ibs_pct: 0, cbs_pct: 0, ipi_pct: 0, is_pct: 0, das_pct: 6 } as never,
  })]
  it.each([0, 0.15])('desconto %p: coluna A a 11%, coluna B a 6%, total rotulado % médio', (d) => {
    const r = decompor(itens, 'INDUSTRIALIZACAO', 'SIMPLES_NACIONAL', d)
    const das = row(r, 'das')!
    const op = row(r, 'operacao_por_dentro')!.perItem
    expect(-das.perItem[0] / op[0]).toBeCloseTo(0.11, 8)
    expect(-das.perItem[1] / op[1]).toBeCloseTo(0.06, 8)
    expect(das.isDerivedAverage).toBe(true)
    expect(das.perItem[0] + das.perItem[1]).toBeCloseTo(das.total, 8)
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
  })
})

describe('5. REVENDA e SERVIÇO no Simples — a despesa do segmento chega à decomposição', () => {
  it('tenant REVENDA: despesas 40% (MO agrupada) e RRO 15% do total', () => {
    const P2 = preco(100, 'REVENDA', false, 'REVENDA')
    const r = decompor([item('P2', P2, 100, 0, { productType: 'REVENDA' })], 'REVENDA', 'SIMPLES_NACIONAL')
    expect(-v(r, 'despesas')).toBeCloseTo(P2 * 0.40, 4)
    expect(v(r, 'rro')).toBeCloseTo(P2 * 0.15, 2)
    expect(r.rro!.foraDeZero).toBe(false)
  })
  it('tenant SERVIÇO: serviço 250 (CSV 165) — DAS 27,50, despesas 17,50, RRO 37,50', () => {
    const r = decompor([item('P3', 250, 165, 0, { isService: true })], 'SERVICO', 'SIMPLES_NACIONAL')
    expect(-v(r, 'das')).toBeCloseTo(27.5, 4)
    expect(-v(r, 'despesas')).toBeCloseTo(17.5, 4)
    expect(v(r, 'rro')).toBeCloseTo(37.5, 4)
    expect(r.rro!.foraDeZero).toBe(false)
  })
  it('tenant SERVIÇO: revenda secundária 151,52 — despesas só variável + financeira (7%)', () => {
    const P = preco(100, 'SERVICO', false, 'REVENDA')
    const r = decompor([item('P2', P, 100, 0, { productType: 'REVENDA' })], 'SERVICO', 'SIMPLES_NACIONAL')
    expect(-v(r, 'despesas')).toBeCloseTo(P * 0.07, 4)
    expect(r.rro!.foraDeZero).toBe(false)
  })
})

describe('6. MEI — DAS zero por item, linha presente; IRPJ/CSLL ocultos', () => {
  it('mesmo com das_pct gravado, o MEI não paga DAS por venda', () => {
    const r = decompor(INDUSTRIA(), 'INDUSTRIALIZACAO', 'MEI')
    expect(row(r, 'das')).toBeDefined()
    expect(v(r, 'das')).toBe(0)
    expect(row(r, 'irpj')).toBeUndefined()
    expect(row(r, 'icms')).toBeUndefined()
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
  })
})

describe('7. FORA DA GUIA ÚNICA nada muda — Lucro Real e regime ausente', () => {
  it.each(['LUCRO_REAL', 'LUCRO_PRESUMIDO', null])('regime %p: sem linha de DAS, com ICMS/PIS e IRPJ/CSLL', (reg) => {
    const itens = INDUSTRIA().map((i) => ({ ...i, rates: { ...(i.rates as object), icms_pct: 17, pis_pct: 7.6775 } as never }))
    const r = decompor(itens, 'INDUSTRIALIZACAO', reg)
    expect(row(r, 'das')).toBeUndefined()
    expect(row(r, 'icms')).toBeDefined()
    expect(v(r, 'irpj')).toBeGreaterThan(0)
  })
})

describe('8. OS CARDS continuam lendo a decomposição sem as linhas de IRPJ/CSLL', () => {
  it('Simples: comissão 35,94 e lucro 71,88 nos cards; IRPJ/CSLL R$ 0,00; total = RRO', () => {
    const r = decompor(INDUSTRIA(), 'INDUSTRIALIZACAO', 'SIMPLES_NACIONAL')
    const antes = { marcador: 'etapa16' } as never
    const d = applyDecompositionToResidual(antes, r) as any
    expect(d.marcador).toBe('etapa16')          // espalhou a distribuição original
    expect(d.commission.amount).toBeCloseTo(35.9375, 3)
    expect(d.profit.amount).toBeCloseTo(71.875, 3)
    expect(d.irpj.amount).toBe(0); expect(d.csll.amount).toBe(0)
    expect(d.total.amount).toBeCloseTo(107.8125, 3)
  })
  it('Lucro Real: sem a linha de IRPJ, os cards NÃO aceitam a decomposição (tudo ou nada segue valendo)', () => {
    const r = decompor(INDUSTRIA().map((i) => ({ ...i, rates: { ...(i.rates as object), icms_pct: 17 } as never })), 'INDUSTRIALIZACAO', 'LUCRO_REAL')
    const semIrpj = { ...r, rows: r.rows.filter((x) => x.key !== 'irpj') }
    const antes = { marcador: 'etapa16' } as never
    expect(applyDecompositionToResidual(antes, semIrpj)).toBe(antes)
  })
})
