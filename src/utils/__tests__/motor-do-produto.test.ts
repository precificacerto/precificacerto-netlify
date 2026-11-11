/**
 * PORTÃO DO MÓDULO `calcularNoMotorDoProduto` (`src/utils/motor-do-produto.ts`) — a conta do `doProductCalc`, chamada direto, sem tela.
 *
 * As travas de Produtos (`a-trava-de-produtos-no-content.test.tsx`, `a-trava-de-produtos-no-product-price.test.tsx`) protegem a TELA, e NÃO
 * contam como cobertura deste módulo (dono do produto, 11/11/2026). Aqui cada caso afirma uma REGRA pela sua forma — a mão de obra é minutos ×
 * custo do minuto, o produto de revenda não tem mão de obra produtiva, o MEI não tem imposto por item, o Lucro Real soma IRPJ e CSLL ao imposto
 * efetivo —, não um número medido e copiado.
 */
import { calcularNoMotorDoProduto, type EntradaDoMotorDoProduto } from '@/utils/motor-do-produto'
import { MODO_PRODUTO } from '@/lib/atendimentos-ia/precificacao-do-orcamento'

const CUSTO_MENSAL = 40813.03
const MINUTOS = 4 * 220 * 60 // 4 pessoas × 220 h
function entrada(over: Partial<EntradaDoMotorDoProduto> = {}, base: Record<string, unknown> = {}, regime = 'LUCRO_REAL'): EntradaDoMotorDoProduto {
    return {
        currentUser: { calcType: 'INDUSTRIALIZATION', taxableRegime: regime, monthlyWorkloadInMinutes: 220, unitMeasure: 'HOURS', numProductiveSectorEmployee: 4 } as EntradaDoMotorDoProduto['currentUser'],
        calcBase: { laborCostMonthly: CUSTO_MENSAL, adminLaborCostMonthly: 9000, fixedExpenseMonthly: 15000, laborPercent: 0, indirectLaborPct: 4,
            fixedExpensePct: 10.39, financialCommitmentsPct: 0, variableExpensePct: 6.41, financialExpensePct: 0.42, taxPct: 0, taxesPercent: 24.6775,
            isMei: false, ...base } as unknown as EntradaDoMotorDoProduto['calcBase'],
        productType: 'PRODUZIDO',
        productPriceInfo: { productProfitPercent: 10, salesCommissionPercent: 5, rtReservePercent: 3, productWorkloadInMinutes: 150,
            salesCommissionPercentByProduct: 0, productProfitPercentByProduct: 0 } as EntradaDoMotorDoProduto['productPriceInfo'],
        additionalIrpjPercent: 0, customTaxPercent: null, isLRorLP: regime === 'LUCRO_REAL' || regime === 'LUCRO_PRESUMIDO',
        modo: MODO_PRODUTO, itemsPriceSum: 930.775,
        ...over,
    }
}
// o motor arredonda cada parcela ao CENTAVO, em etapas (a mão de obra, depois o custo): a regra é afirmada com esse arredondamento
const centavo = (v: number) => Math.round(v * 100) / 100
const conta = (e: EntradaDoMotorDoProduto) => { const c = calcularNoMotorDoProduto(e); if (!c) throw new Error('o motor não formou'); return c }

describe('a MÃO DE OBRA produtiva: os minutos do produto × o custo do minuto da empresa', () => {
    it('150 min × (custo mensal ÷ minutos da empresa)', () => {
        expect(conta(entrada()).campos.productWorkloadInMinutesPrice).toBe(centavo(150 * CUSTO_MENSAL / MINUTOS))
    })
    it('o custo do produto é o dos itens MAIS a mão de obra', () => {
        const c = conta(entrada()).campos
        // os itens também chegam arredondados (930,775 → 930,78) antes da soma
        expect(c.productCost).toBe(centavo(centavo(930.775) + centavo(150 * CUSTO_MENSAL / MINUTOS)))
    })
    it('o produto de REVENDA não tem mão de obra produtiva: o custo é só o dos itens', () => {
        const c = conta(entrada({ productType: 'REVENDA' })).campos
        expect(c.productWorkloadInMinutesPrice).toBe(0)
        expect(c.productCost).toBe(centavo(930.775))
    })
})

describe('o IMPOSTO efetivo pelo regime', () => {
    it('Lucro Real: o imposto da empresa MAIS 15% e 9% do lucro (IRPJ e CSLL)', () => {
        const c = conta(entrada()).campos
        expect(c.taxesPrice).toBe(centavo(c.totalProductPrice * (24.6775 + 10 * 0.15 + 10 * 0.09) / 100))
    })
    it('Lucro Real: o adicional de IRPJ entra também', () => {
        const sem = conta(entrada()).campos, com = conta(entrada({ additionalIrpjPercent: 2 })).campos
        expect(com.taxesPrice).toBe(centavo(com.totalProductPrice * (24.6775 + 1.5 + 0.9 + 2) / 100))
        expect(com.totalProductPrice).toBeGreaterThan(sem.totalProductPrice)
    })
    it('Simples: o percentual do DAS, sem IRPJ e CSLL', () => {
        const c = conta(entrada({}, { taxPct: 6 }, 'SIMPLES_NACIONAL')).campos
        expect(c.taxesPrice).toBe(centavo(c.totalProductPrice * 0.06))
    })
    it('MEI: imposto ZERO por item, mesmo com um percentual legado gravado no produto', () => {
        const c = conta(entrada({ customTaxPercent: 8 }, { isMei: true, taxPct: 5 }, 'MEI')).campos
        expect(c.taxesPrice).toBe(0)
    })
})

describe('a ESTRUTURA e os valores derivados do preço', () => {
    it('a despesa fixa, a variável e a financeira são o percentual de cada uma sobre o preço', () => {
        const c = conta(entrada()).campos
        expect(c.fixedExpensePrice).toBeCloseTo(c.totalProductPrice * 0.1039, 9)
        expect(c.variableExpensePrice).toBeCloseTo(c.totalProductPrice * 0.0641, 9)
        expect(c.financialExpensePrice).toBeCloseTo(c.totalProductPrice * 0.0042, 9)
    })
    it('o preço cobre o custo: com mais estrutura, o preço sobe', () => {
        const pouca = conta(entrada()).campos.totalProductPrice
        const mais = conta(entrada({}, { fixedExpensePct: 20 })).campos.totalProductPrice
        expect(mais).toBeGreaterThan(pouca)
        expect(pouca).toBeGreaterThan(conta(entrada()).campos.productCost)
    })
    it('a margem que passa de 100% não forma: devolve null, e a tela fica como estava', () => {
        expect(calcularNoMotorDoProduto(entrada({ productPriceInfo: { ...entrada().productPriceInfo, productProfitPercent: 95 } }))).toBeNull()
    })
})

describe('o SERVIÇO com produto: o "por produto" sai do estado anterior da tela', () => {
    it('o produto do serviço tem preço próprio, e os seus lucro e comissão são o percentual que a tela tinha', () => {
        const e = entrada({ currentUser: { ...entrada().currentUser, calcType: 'SERVICE' } as EntradaDoMotorDoProduto['currentUser'] })
        const c = conta(e)
        expect(c.campos.totalServicePrice).toBe(c.campos.totalProductPrice)
        expect(c.campos.totalServiceProductPrice).toBeGreaterThan(0)
        const porProduto = c.porProdutoDoServico({ productProfitPercentByProduct: 10, salesCommissionPercentByProduct: 5 })
        expect(porProduto.productProfitPriceByProduct).toBeCloseTo(c.campos.totalServiceProductPrice * 0.10, 9)
        expect(porProduto.salesCommissionPriceByProduct).toBeCloseTo(c.campos.totalServiceProductPrice * 0.05, 9)
    })
    it('fora do serviço não há produto à parte', () => {
        const c = conta(entrada())
        expect(c.campos.totalServicePrice).toBe(0)
        expect(c.campos.totalServiceProductPrice).toBe(0)
    })
})

describe('o MODO orçamento: a entrada é o líquido dos materiais e os minutos da fabricação dos itens', () => {
    it('com o mesmo líquido e os mesmos minutos, o orçamento e o produto dão o MESMO preço', () => {
        const itens = [{ custo_liquido_materiais: 700, tempo_fabricacao_min: 90 }, { custo_liquido_materiais: 230.775, tempo_fabricacao_min: 60 }]
        const doOrcamento = conta(entrada({ modo: { tipo: 'orcamento', itens } as unknown as EntradaDoMotorDoProduto['modo'], itemsPriceSum: 0,
            productPriceInfo: { ...entrada().productPriceInfo, productWorkloadInMinutes: 0 } })).campos
        expect(doOrcamento.totalProductPrice).toBeCloseTo(conta(entrada()).campos.totalProductPrice, 9)
    })
})

describe('o TIPO DE CÁLCULO efetivo — a fonte única do motor e do bloqueio de carga horária da tela', () => {
    it('o produto de revenda é REVENDA em qualquer tenant; o produzido segue o tenant', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { tipoDeCalculoEfetivo } = require('@/utils/motor-do-produto') as typeof import('@/utils/motor-do-produto')
        for (const t of ['INDUSTRIALIZATION', 'RESALE', 'SERVICE', null]) expect(tipoDeCalculoEfetivo('REVENDA', t)).toBe('REVENDA')
        expect(tipoDeCalculoEfetivo('PRODUZIDO', 'INDUSTRIALIZATION')).toBe('INDUSTRIALIZACAO')
        expect(tipoDeCalculoEfetivo('PRODUZIDO', 'RESALE')).toBe('REVENDA')
        expect(tipoDeCalculoEfetivo('PRODUZIDO', 'SERVICE')).toBe('SERVICO')
        expect(tipoDeCalculoEfetivo('PRODUZIDO', undefined)).toBe('SERVICO')
    })
})
