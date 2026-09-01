/**
 * Auditoria da tela de Produtos — imposto em MEI entrava no preço.
 *
 * O invariante de exibição da tela JÁ ESTAVA CORRETO: `taxPctDisplay` e
 * `effectiveTaxPct` saíam da mesma expressão, então a soma das linhas exibidas fechava
 * com o preço. Produtos NÃO repetia o defeito do #17.
 *
 * O que estava errado era a outra metade da regra: a linha de imposto era editável em
 * MEI, o valor digitado entrava no denominador e era persistido em
 * `products.custom_tax_percent`. Em produção, 4 produtos MEI (Salão Eliane) tinham
 * entre 5% e 10% de imposto compondo o preço.
 *
 * No MEI o DAS é fixo mensal e não incide por item — vale para produto igual vale para
 * serviço.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    resolveProductTaxPercent,
    resolveProductTaxPercentToPersist,
} from '@/utils/product-tax-percent'
import { calculatePricing } from '@/utils/pricing-engine'

// Salão Eliane (MEI, calc_type SERVICO): variável 1,25% + financeira 0,36%.
const ELIANE = { variavel: 1.25, financeira: 0.36 }

/** Espelha `doProductCalc`: o coeficiente é 1 − Σ(estrutura, imposto, RT, comissão, lucro). */
function precoProduto(p: {
    isMei: boolean
    customTaxPercent?: number | null
    autoTaxPercent?: number | null
    custo: number
    comissao: number
    lucro: number
    rt?: number
}) {
    const taxPct = resolveProductTaxPercent({
        isMei: p.isMei,
        customTaxPercent: p.customTaxPercent,
        autoTaxPercent: p.autoTaxPercent,
    })
    const r = calculatePricing({
        calcType: 'REVENDA',
        totalItemsCost: p.custo,
        yieldQuantity: 1,
        laborCostMonthly: 0,
        numProductiveEmployees: 1,
        monthlyWorkloadMinutes: 0,
        productWorkloadMinutes: 0,
        structurePct: (ELIANE.variavel + ELIANE.financeira) / 100,
        taxPct: taxPct / 100,
        commissionPct: p.comissao / 100,
        profitPct: p.lucro / 100,
        rtReservePct: (p.rt ?? 0) / 100,
    })
    // Linhas exibidas na tela para MEI/Simples, tenant SERVIÇO.
    const linhas = [ELIANE.variavel, ELIANE.financeira, taxPct, p.rt ?? 0, p.comissao, p.lucro]
    return { taxPct, preco: r.priceUnit, somaLinhas: linhas.reduce((a, b) => a + b, 0), coeficiente: r.coefficient }
}

describe('Produtos · MEI ignora o imposto, gravado ou não', () => {
    it('custom_tax_percent gravado não entra no cálculo nem na tela', () => {
        expect(resolveProductTaxPercent({ isMei: true, customTaxPercent: 10, autoTaxPercent: 0 })).toBe(0)
        expect(resolveProductTaxPercent({ isMei: true, customTaxPercent: 5, autoTaxPercent: 7.095 })).toBe(0)
        expect(resolveProductTaxPercent({ isMei: true, customTaxPercent: null, autoTaxPercent: 0 })).toBe(0)
    })

    it('gravação em MEI normaliza para 0 — cura o legado sem UPDATE no banco', () => {
        expect(resolveProductTaxPercentToPersist({ isMei: true, isSimples: false, customTaxPercent: 10 })).toBe(0)
        expect(resolveProductTaxPercentToPersist({ isMei: true, isSimples: false, customTaxPercent: null })).toBe(0)
    })
})

describe('Produtos · TEM QUE MUDAR — os 4 produtos MEI de produção', () => {
    // Baseline capturado ANTES da correção, direto do banco. A regravação é etapa
    // separada e posterior: enquanto não acontecer, estes valores são a referência.
    //
    // NOTA sobre os valores: `custo` é o `cost_total` gravado, usado aqui para exercitar o
    // mecanismo com os percentuais reais de produção. O preço absoluto NÃO coincide com o
    // `sale_price` gravado (4,00 / 91,70 / 10,00 / 45,00) porque o CMV que o motor consome
    // vem de `product_items`, não de `cost_total`. O que estes testes fixam é o efeito da
    // correção sobre o denominador — que é o que muda —, não o preço final de catálogo.
    const PRODUTOS_MEI = [
        { nome: 'Água mineral', custo: 0.01, tax: 5, comissao: 0, lucro: 72.07, rt: 0, antes: 0.05, depois: 0.04 },
        { nome: 'Blusa horizonte', custo: 2, tax: 10, comissao: 0, lucro: 30, rt: 0, antes: 3.43, depois: 2.92 },
        { nome: 'Cerveja', custo: 0.05, tax: 5, comissao: 10, lucro: 37.32, rt: 1, antes: 0.11, depois: 0.10 },
        { nome: 'Pomada Gel', custo: 0.15, tax: 5, comissao: 10, lucro: 49.989, rt: 0, antes: 0.45, depois: 0.39 },
    ]

    it.each(PRODUTOS_MEI)('$nome: o imposto sai do denominador e o preço cai', (p) => {
        const antes = precoProduto({ isMei: false, customTaxPercent: p.tax, ...p })
        const depois = precoProduto({ isMei: true, customTaxPercent: p.tax, ...p })

        expect(antes.taxPct).toBe(p.tax)
        expect(depois.taxPct).toBe(0)

        // O coeficiente cresce exatamente pelo imposto retirado.
        expect(depois.coeficiente - antes.coeficiente).toBeCloseTo(p.tax / 100, 10)
        expect(depois.preco).toBeLessThan(antes.preco)
    })

    it.each(PRODUTOS_MEI)('$nome: preço vai de $antes para $depois', (p) => {
        // Preço exato, à vírgula, nos dois lados. Não uso razão de coeficientes: com CMV
        // na casa dos centavos o arredondamento a 2 casas domina (0,05 → 0,04 dá razão
        // 0,80, não os 0,81 do coeficiente), e a razão viraria uma asserção frouxa.
        expect(precoProduto({ isMei: false, customTaxPercent: p.tax, ...p }).preco).toBe(p.antes)
        expect(precoProduto({ isMei: true, customTaxPercent: p.tax, ...p }).preco).toBe(p.depois)
    })
})

describe('Produtos · NÃO PODE MUDAR — Simples Nacional', () => {
    const SIMPLES = { autoTaxPercent: 7.095, custo: 50, comissao: 5, lucro: 20, rt: 1 }

    it('a alíquota do onboarding continua entrando no cálculo', () => {
        expect(resolveProductTaxPercent({ isMei: false, customTaxPercent: null, autoTaxPercent: 7.095 })).toBe(7.095)
        const r = precoProduto({ isMei: false, customTaxPercent: null, ...SIMPLES })
        expect(r.taxPct).toBe(7.095)
    })

    it('o override manual continua valendo, e 0 digitado continua sendo 0', () => {
        expect(resolveProductTaxPercent({ isMei: false, customTaxPercent: 12, autoTaxPercent: 7.095 })).toBe(12)
        // Regressão do padrão `||`: zero digitado não pode virar a alíquota do tenant.
        expect(resolveProductTaxPercent({ isMei: false, customTaxPercent: 0, autoTaxPercent: 7.095 })).toBe(0)
    })

    it('a gravação preserva o override e, sem ele, a automática do Anexo', () => {
        expect(resolveProductTaxPercentToPersist({ isMei: false, isSimples: true, customTaxPercent: 12, autoTaxPercent: 7.095 })).toBe(12)
        expect(resolveProductTaxPercentToPersist({ isMei: false, isSimples: true, customTaxPercent: null, autoTaxPercent: 7.095 })).toBe(7.095)
        expect(resolveProductTaxPercentToPersist({ isMei: false, isSimples: true, customTaxPercent: 0, autoTaxPercent: 7.095 })).toBe(0)
    })

    it('demais regimes seguem sem override persistido', () => {
        expect(resolveProductTaxPercentToPersist({ isMei: false, isSimples: false, customTaxPercent: null })).toBeNull()
    })

    it('a regra do MEI não alcança o Simples nem com a mesma alíquota', () => {
        expect(resolveProductTaxPercent({ isMei: true, customTaxPercent: 7.095 })).toBe(0)
        expect(resolveProductTaxPercent({ isMei: false, customTaxPercent: 7.095 })).toBe(7.095)
    })
})

describe('Produtos · a soma das linhas exibidas fecha com o preço', () => {
    const cenarios = [
        { regime: 'MEI sem imposto', input: { isMei: true, customTaxPercent: null, custo: 10, comissao: 5, lucro: 20, rt: 1 } },
        { regime: 'MEI com 10% gravado (ignorado)', input: { isMei: true, customTaxPercent: 10, custo: 10, comissao: 5, lucro: 20, rt: 1 } },
        { regime: 'Simples do onboarding', input: { isMei: false, customTaxPercent: null, autoTaxPercent: 7.095, custo: 10, comissao: 5, lucro: 20, rt: 1 } },
        { regime: 'Simples com override', input: { isMei: false, customTaxPercent: 12, autoTaxPercent: 7.095, custo: 10, comissao: 5, lucro: 20, rt: 0 } },
    ]

    it.each(cenarios)('$regime: preço = custo ÷ (1 − Σ linhas)', ({ input }) => {
        const r = precoProduto(input)
        expect(r.coeficiente).toBeCloseTo(1 - r.somaLinhas / 100, 10)
        const precoPelaSoma = Math.round((input.custo / (1 - r.somaLinhas / 100)) * 100) / 100
        expect(r.preco).toBe(precoPelaSoma)
    })
})
