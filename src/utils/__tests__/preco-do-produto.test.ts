/**
 * PORTÃO DO MÓDULO `formarPrecoDoProduto` (`src/utils/preco-do-produto.ts`) — as REGRAS que ele carrega, chamadas direto, sem tela.
 *
 * A trava `a-trava-de-produtos-no-product-price.test.tsx` protege PRODUTOS (a tela, ao centavo); ela NÃO conta como cobertura deste módulo
 * (dono do produto, 11/11/2026). Aqui cada caso afirma uma regra pela sua forma — o IRPJ é 15% do lucro sobre o preço, o acréscimo só existe
 * onde o regime o tem, a matriz recusa o acréscimo legado, o final nunca fica abaixo da interna, a CBS nula não entra — e não um número
 * medido e copiado (que concordaria consigo mesmo).
 */
import { formarPrecoDoProduto, type EntradaDoPrecoDoProduto } from '@/utils/preco-do-produto'

const PRECO = 2_500
function entrada(regime: string, over: Partial<EntradaDoPrecoDoProduto> = {}): EntradaDoPrecoDoProduto {
    return {
        currentUser: { taxableRegime: regime, calcType: 'INDUSTRIALIZATION' } as EntradaDoPrecoDoProduto['currentUser'],
        calcBase: { adminLaborPct: 7, fixedExpensePct: 10, variableExpensePct: 3, financialExpensePct: 2, financialCommitmentsPct: 0, taxPct: 0,
            taxLabel: 'Impostos', isMei: regime === 'MEI' } as unknown as EntradaDoPrecoDoProduto['calcBase'],
        productPriceInfo: { productCost: 1_000, totalProductPrice: PRECO, productProfitPercent: 5, productProfitPrice: PRECO * 0.05,
            salesCommissionPercent: 5, salesCommissionPrice: PRECO * 0.05, rtReservePercent: 0, taxesPrice: 0 } as EntradaDoPrecoDoProduto['productPriceInfo'],
        customTaxPercent: null, additionalIrpjPercent: undefined, icmsPct: 0.18, pisCofinsLRPct: 0.0925,
        freightValue: 0, insuranceValue: 0, accessoryExpensesValue: 0, ibsPct: 0, cbsPct: 0, isPct: 0, ipiPct: 0,
        ibsBaseCode: null, cbsBaseCode: null, isBaseCode: null, ipiBaseCode: null, ivaReductionIbsPct: null, ivaReductionCbsPct: null, isResaleProduct: false,
        ...over,
    }
}
const chaves = (p: ReturnType<typeof formarPrecoDoProduto>) => p.linhas.rows.map((r) => r.key)

describe('IRPJ e CSLL: 15% e 9% do LUCRO, sobre o preço — só no Lucro Real e no Presumido', () => {
    it.each(['LUCRO_REAL', 'LUCRO_PRESUMIDO'])('%s: as linhas irpj e csll, com 15% e 9% do lucro (125) sobre 2.500', (regime) => {
        const p = formarPrecoDoProduto(entrada(regime))
        expect(p.showIrpjCsll).toBe(true)
        expect(p.linhaPor('irpj')?.originalPct).toBeCloseTo(125 * 0.15 / PRECO * 100, 12)
        expect(p.linhaPor('csll')?.originalPct).toBeCloseTo(125 * 0.09 / PRECO * 100, 12)
    })
    it.each(['SIMPLES_NACIONAL', 'MEI', 'SIMPLES_HIBRIDO'])('%s: sem irpj nem csll', (regime) => {
        const p = formarPrecoDoProduto(entrada(regime))
        expect(p.showIrpjCsll).toBe(false)
        expect(chaves(p)).not.toEqual(expect.arrayContaining(['irpj']))
        expect(chaves(p)).not.toEqual(expect.arrayContaining(['csll']))
    })
})

describe('o ACRÉSCIMO legado (frete, seguro, despesas acessórias): só onde o regime o tem', () => {
    it('Lucro Real, Presumido e Híbrido somam os três; Simples e MEI não', () => {
        const over = { freightValue: 10, insuranceValue: 20, accessoryExpensesValue: 30 }
        for (const r of ['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_HIBRIDO']) expect(formarPrecoDoProduto(entrada(r, over)).terceirizadasTotal).toBe(60)
        for (const r of ['SIMPLES_NACIONAL', 'MEI']) expect(formarPrecoDoProduto(entrada(r, over)).terceirizadasTotal).toBe(0)
    })
    it('no Lucro Real o acréscimo legado faz a MATRIZ recusar: o preço sai pelo caminho de antes (o IVA por fora sobre o preço do motor)', () => {
        const com = formarPrecoDoProduto(entrada('LUCRO_REAL', { freightValue: 50, ibsPct: 0.1, cbsPct: 0.9 }))
        const sem = formarPrecoDoProduto(entrada('LUCRO_REAL', { ibsPct: 0.1, cbsPct: 0.9 }))
        expect(sem._matriz.applied).toBe(true)
        expect(com._matriz.applied).toBe(false)
        expect(com.baseForSalePrice).toBe(PRECO)
        expect(com.finalSalePrice).toBe(PRECO + 50)
        expect(com.finalPriceWithTaxes).toBeGreaterThan(com.finalSalePrice)
    })
})

describe('a MATRIZ governa o Lucro Real: a interna é a da matriz, e ela coincide com o valor precificado', () => {
    it('com IBS e CBS: interna = valor precificado; o final é a interna mais os tributos por fora, e c > 0', () => {
        const p = formarPrecoDoProduto(entrada('LUCRO_REAL', { ibsPct: 0.1, cbsPct: 0.9 }))
        expect(p._matriz.applied).toBe(true)
        expect(p.baseForSalePrice).toBeCloseTo(p.valorPrecificado, 9)
        expect(p.totalInlineTax).toBeGreaterThan(0)
        expect(p.finalPriceWithTaxes).toBeCloseTo(p.baseForSalePrice + p.totalInlineTax, 9)
        expect(p.taxIbsValue + p.taxCbsValue).toBeCloseTo(p.totalInlineTax, 9)
    })
    it('sem tributo por fora (c = 0): o final É a interna', () => {
        const p = formarPrecoDoProduto(entrada('LUCRO_REAL'))
        expect(p._matriz.applied).toBe(true)
        expect(p.totalInlineTax).toBe(0)
        expect(p.finalPriceWithTaxes).toBeCloseTo(p.baseForSalePrice, 9)
    })
    it('o ICMS e o PIS/COFINS viram linhas só no Lucro Real e no Presumido', () => {
        expect(chaves(formarPrecoDoProduto(entrada('LUCRO_REAL')))).toEqual(expect.arrayContaining(['icms', 'pisCofins']))
        for (const r of ['SIMPLES_NACIONAL', 'MEI', 'SIMPLES_HIBRIDO']) expect(chaves(formarPrecoDoProduto(entrada(r)))).not.toEqual(expect.arrayContaining(['icms']))
    })
})

describe('o FINAL nunca fica abaixo da interna (R8), em todo regime', () => {
    it.each(['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_NACIONAL', 'MEI', 'SIMPLES_HIBRIDO'])('%s', (regime) => {
        for (const over of [{}, { ibsPct: 0.1, cbsPct: 0.9 }, { freightValue: 50, ibsPct: 0.1, cbsPct: 0.9 }]) {
            const p = formarPrecoDoProduto(entrada(regime, over))
            expect(p.finalPriceWithTaxes + 0.01).toBeGreaterThanOrEqual(p.baseForSalePrice)
        }
    })
})

describe('a alíquota NULA não entra, nem como zero (11/11/2026)', () => {
    it('CBS nula forma o MESMO preço que CBS zero — ela não soma nada —, e o IBS com valor continua entrando', () => {
        const nula = formarPrecoDoProduto(entrada('LUCRO_REAL', { ibsPct: 0.1, cbsPct: null }))
        const zero = formarPrecoDoProduto(entrada('LUCRO_REAL', { ibsPct: 0.1, cbsPct: 0 }))
        expect(nula.finalPriceWithTaxes).toBe(zero.finalPriceWithTaxes)
        expect(nula.taxCbsValue).toBe(0)
        expect(nula.taxIbsValue).toBeGreaterThan(0)
    })
})

describe('FORMADO: preço positivo e, no Lucro Real e no Presumido, a operação por dentro com valor', () => {
    it('o caso normal está formado em todo regime', () => {
        for (const r of ['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_NACIONAL', 'MEI', 'SIMPLES_HIBRIDO']) expect(formarPrecoDoProduto(entrada(r)).formado).toBe(true)
    })
    it('no Lucro Real, a margem que acaba (lucro 95%) não forma — mesmo com o preço do motor positivo', () => {
        const p = formarPrecoDoProduto(entrada('LUCRO_REAL', { productPriceInfo: { ...entrada('LUCRO_REAL').productPriceInfo, productProfitPercent: 95 } }))
        expect(p.formado).toBe(false)
    })
    it('sem preço do motor (zero): no Simples e no MEI não forma; no Lucro Real a MATRIZ forma o preço a partir do CUSTO, e forma', () => {
        const semPreco = (r: string) => formarPrecoDoProduto(entrada(r, { productPriceInfo: { ...entrada(r).productPriceInfo, totalProductPrice: 0, productProfitPrice: 0 } }))
        for (const r of ['SIMPLES_NACIONAL', 'MEI']) expect(semPreco(r).formado).toBe(false)
        const lr = semPreco('LUCRO_REAL')
        expect(lr._matriz.applied).toBe(true)
        expect(lr.formado).toBe(true)
        expect(lr.finalPriceWithTaxes).toBeGreaterThan(1_000)
    })
})
