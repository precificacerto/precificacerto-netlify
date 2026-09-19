/**
 * CENÁRIO ESQUADRIAS — Lucro Real, tenant INDUSTRIALIZAÇÃO, um orçamento com os DOIS papéis:
 *   A) produto PRODUZIDO (principal): MO produtiva no custo, despesa = fixa+var+fin+MOI
 *   B) produto REVENDA (secundária): sem MO produtiva, despesa = fixa+var+fin+MOI
 * Alíquotas DIFERENTES por produto, e desconto aplicado sobre a âncora pós-desconto.
 * Pergunta do PO (19/09/2026): o agrupamento e a decomposição pós-desconto fecham 100%?
 */
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { calculatePricing } from '@/utils/pricing-engine'
import { CSLL_RATE_ON_PROFIT, IRPJ_RATE_ON_PROFIT } from '@/utils/rate-scale'
import {
  resolveDespesasOperacionaisPct, resolveSegmentoDaDespesa, type BaldesDeDespesa,
} from '@/utils/despesas-do-segmento'

// Tenant de industrialização COM MO produtiva (é o que discrimina principal × secundária).
const BALDES: BaldesDeDespesa = { fixa: 0.10, variavel: 0.05, financeira: 0.02, indireta: 0.08, moProdutiva: 0.15 }
const TENANT = 'INDUSTRIALIZACAO'

type Ficha = { icms: number; pisCofins: number; ibs: number; cbs: number; comissao: number; lucro: number; rt: number }
const A_FICHA: Ficha = { icms: 0.17, pisCofins: 0.0925, ibs: 0.01, cbs: 0.09, comissao: 0.05, lucro: 0.10, rt: 0.01 }
const B_FICHA: Ficha = { icms: 0.12, pisCofins: 0.0925, ibs: 0.001, cbs: 0.009, comissao: 0.05, lucro: 0.10, rt: 0.01 }

const construir = (material: number, mo: number, f: Ficha, productType: string) => {
  const structurePct = resolveDespesasOperacionaisPct(
    resolveSegmentoDaDespesa({ tenantCalcType: TENANT }), BALDES)
  const r = calculatePricing({
    calcType: productType === 'REVENDA' ? 'REVENDA' : 'INDUSTRIALIZACAO',
    totalItemsCost: material + mo, yieldQuantity: 1,
    laborCostMonthly: 0, numProductiveEmployees: 0, monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
    structurePct, taxPct: f.icms + f.pisCofins,
    profitTaxPct: f.lucro * (IRPJ_RATE_ON_PROFIT + CSLL_RATE_ON_PROFIT),
    commissionPct: f.comissao, profitPct: f.lucro, rtReservePct: f.rt,
    taxBreakdown: {
      icmsPct: f.icms, pisCofinsPct: f.pisCofins,
      ibs: { rate: f.ibs, reductionFactor: 0, baseCode: 4 },
      cbs: { rate: f.cbs, reductionFactor: 0, baseCode: 4 },
    },
  })
  const tb = r.taxBreakdownResolved!
  return { structurePct, totalGeral: tb.totalGeral, custo: r.cmvUnit,
    rro: tb.totalGeral * (f.comissao + f.lucro + f.lucro * (IRPJ_RATE_ON_PROFIT + CSLL_RATE_ON_PROFIT)) }
}

const item = (key: string, c: ReturnType<typeof construir>, material: number, mo: number, f: Ficha,
  productType: string, qtd: number): BudgetDecompositionItem => ({
  key, label: key, quantity: qtd, unitPrice: c.totalGeral, costUnit: material, productiveLaborUnit: mo,
  commissionPct: f.comissao * 100, profitPct: f.lucro * 100, rtPct: f.rt * 100, productType,
  rates: { icms_pct: f.icms * 100, iss_pct: null, pis_pct: f.pisCofins * (1 - f.icms), cofins_pct: 0,
    ibs_pct: f.ibs * 100, cbs_pct: f.cbs * 100, ipi_pct: 0, is_pct: 0 },
  acrescimos: 0,
})

const cA = construir(1000, 250, A_FICHA, 'PRODUZIDO')
const cB = construir(600, 0, B_FICHA, 'REVENDA')
const ITENS = [item('A-produzido', cA, 1000, 250, A_FICHA, 'PRODUZIDO', 3), item('B-revenda', cB, 600, 0, B_FICHA, 'REVENDA', 5)]
const decompor = (d: number) => buildDecomposition(buildBudgetDecompositionInput({
  items: ITENS, discountPct: d, despesas: BALDES, tenantCalcType: TENANT }).input)
const row = (r: any, k: string) => r.rows.find((x: any) => x.key === k)

describe.each([0, 0.05, 0.15, 0.30])('Esquadrias LR — desconto %p', (d) => {
  const r = decompor(d)
  it('sem erros', () => { expect(r.errors).toEqual([]) })
  it('RESIDUAL zero no total e em cada produto', () => {
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
    r.residual.perItem.forEach((v: number) => expect(Math.abs(v)).toBeLessThan(0.005))
  })
  it('toda linha com coluna: soma das colunas = total', () => {
    for (const l of r.rows) if (l.perItem?.length) {
      expect(l.perItem.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(l.total, 2)
    }
  })
  it('RRO invariante não acusa sobra', () => { expect(r.rro!.foraDeZero).toBe(false) })
  it('FECHAMENTO em R$: receita pós-desconto = por fora + ICMS + PIS/COFINS + custos + despesas + RT + RRO', () => {
    const soma = ['por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi', 'icms', 'iss', 'pis_cofins',
      'custos', 'despesas', 'rt'].reduce((a, k) => a + Math.abs(row(r, k).total), 0) + row(r, 'rro').total
    expect(soma).toBeCloseTo(r.receitaAposDesconto, 1)
  })
  it('RRO = comissão + lucro + IRPJ + CSLL, e IRPJ/CSLL = 15%/9% do lucro', () => {
    const partes = ['comissao', 'lucro', 'irpj', 'csll'].reduce((a, k) => a + row(r, k).total, 0)
    expect(partes).toBeCloseTo(row(r, 'rro').total, 2)
    expect(row(r, 'irpj').total / row(r, 'lucro').total).toBeCloseTo(0.15, 6)
    expect(row(r, 'csll').total / row(r, 'lucro').total).toBeCloseTo(0.09, 6)
  })
  it('tributo com a alíquota DE CADA PRODUTO sobre a base DELE (A 17%, B 12%)', () => {
    const rp = row(r, 'receita_produtos').perItem
    expect(Math.abs(row(r, 'icms').perItem[0]) / rp[0]).toBeCloseTo(0.17, 6)
    expect(Math.abs(row(r, 'icms').perItem[1]) / rp[1]).toBeCloseTo(0.12, 6)
  })
})

describe('Esquadrias LR — construção × decomposição e congelamento', () => {
  const sem = decompor(0)
  it('desconto zero: RRO de cada produto = o reservado na construção', () => {
    expect(row(sem, 'rro').perItem[0]).toBeCloseTo(cA.rro * 3, 1)
    expect(row(sem, 'rro').perItem[1]).toBeCloseTo(cB.rro * 5, 1)
  })
  it('desconto zero: comissão 5,00% e lucro 10,00% do total geral', () => {
    expect(row(sem, 'comissao').pctSobreTotalGeral * 100).toBeCloseTo(5, 3)
    expect(row(sem, 'lucro').pctSobreTotalGeral * 100).toBeCloseTo(10, 3)
  })
  it('custo de A inclui a MO produtiva; B não', () => {
    expect(Math.abs(row(sem, 'custos').perItem[0])).toBeCloseTo(1250 * 3, 2)
    expect(Math.abs(row(sem, 'custos').perItem[1])).toBeCloseTo(600 * 5, 2)
  })
  it('despesa por produto = % do segmento × total do produto (sem MO produtiva na revenda)', () => {
    expect(Math.abs(row(sem, 'despesas').perItem[0])).toBeCloseTo(cA.totalGeral * 3 * 0.25, 1)
    expect(Math.abs(row(sem, 'despesas').perItem[1])).toBeCloseTo(cB.totalGeral * 5 * 0.25, 1)
  })
  it.each([0.05, 0.15, 0.30])('desconto %p: custo e despesa CONGELADOS; RRO cai exatamente o que os tributos e a RT caíram', (d) => {
    const com = decompor(d)
    for (const k of ['custos', 'despesas']) expect(row(com, k).total).toBeCloseTo(row(sem, k).total, 6)
    const queda = row(sem, 'rro').total - row(com, 'rro').total
    const esperada = (row(sem, 'receita_liquida').total - row(com, 'receita_liquida').total)
      + (row(sem, 'rt').total - row(com, 'rt').total)
    expect(queda).toBeCloseTo(esperada, 6)
  })
})
