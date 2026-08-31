/**
 * D17 — Formação do PREÇO DE VENDA de serviço (tela de cadastro).
 *
 * NÃO cobre a cascata / motor RRO. Cobre exclusivamente a composição de alíquotas que
 * forma a margem de contribuição no cadastro do serviço.
 *
 * Regras do dono do produto exercitadas aqui:
 *  - Lucro, comissão e RT são ENTRADA manual. Nunca derivados de preço.
 *  - MEI: imposto é ZERO, sempre.
 *  - Simples: imposto vem do onboarding e permanece editável por serviço; 0% digitado é 0%.
 *  - Todo percentual somado tem linha exibida — a soma das linhas fecha com o preço.
 *
 * Lucro Real e Lucro Presumido estão FORA de escopo (composição própria no componente,
 * com IRPJ/CSLL derivados do lucro ou da presunção) e não são exercitados aqui.
 */

import { calculatePricing } from '@/utils/pricing-engine'
import {
    composeServiceMarkup,
    firstConfiguredPercent,
    readRegisteredPercent,
    resolveServiceTaxableRegimePercent,
} from '@/utils/service-tax-composition'

/** Preço formado pela tela: mesma chamada que `ServiceContent` faz ao motor. */
function priceFromMarkup(params: {
    materialCost: number
    laborCostMonthly: number
    monthlyWorkloadMinutes: number
    serviceMinutes: number
    isMei: boolean
    taxesPct: number
    taxableRegimePercent: number
    variablePct: number
    financialPct: number
    rtReservePercent: number
    commissionPercent: number
    profitPercent: number
}) {
    const markup = composeServiceMarkup(params)
    const result = calculatePricing({
        calcType: 'SERVICO',
        totalItemsCost: params.materialCost,
        yieldQuantity: 1,
        laborCostMonthly: params.laborCostMonthly,
        numProductiveEmployees: 1,
        monthlyWorkloadMinutes: params.monthlyWorkloadMinutes,
        productWorkloadMinutes: params.serviceMinutes,
        structurePct: (params.variablePct + params.financialPct) / 100,
        taxPct: markup.taxPct,
        commissionPct: params.commissionPercent / 100,
        profitPct: params.profitPercent / 100,
        rtReservePct: params.rtReservePercent / 100,
    })
    return { markup, result, price: result.priceUnit, cost: result.cmvUnit }
}

// ── Salão Eliane (MEI) — tenant 14363adf-857e-48fe-9b18-1bceb7856ee9 ────────────
// tenant_expense_config: variável 1,29% · financeira 0,37%
// MO: (0 produtiva + 7000 admin + 2625 desp. fixas) / 18.000 min/mês
const ELIANE = {
    laborCostMonthly: 9625,
    monthlyWorkloadMinutes: 18000,
    variablePct: 1.29,
    financialPct: 0.37,
}
// Serviço "Corte e Barba" (d1a3af4f-5ab8-4adf-b831-68a22415a41c): 60 min, insumos R$ 3,97,
// custo total R$ 36,05, comissão 40%, RT 0%, `taxable_regime_percent` = 15,5 gravado.
const CORTE_E_BARBA = {
    ...ELIANE,
    materialCost: 3.97,
    serviceMinutes: 60,
    commissionPercent: 40,
    rtReservePercent: 0,
    taxesPct: 0, // MEI ⇒ taxPreview.taxesPercent = 0
    storedTaxableRegimePercent: 15.5,
}

describe('D17 · MEI — imposto fora da formação do preço', () => {
    it('ignora o taxable_regime_percent gravado e mostra 0% na tela', () => {
        expect(resolveServiceTaxableRegimePercent(15.5, { isMei: true })).toBe(0)

        const { markup } = priceFromMarkup({
            ...CORTE_E_BARBA,
            isMei: true,
            taxableRegimePercent: CORTE_E_BARBA.storedTaxableRegimePercent,
            profitPercent: 0.43,
        })

        // A linha do regime existe e vale 0 — nada somado fica sem linha.
        expect(markup.taxableRegimePct).toBe(0)
        expect(markup.lines.find(l => l.key === 'taxableRegime')?.pct).toBe(0)
        expect(markup.lines.find(l => l.key === 'taxes')?.pct).toBe(0)
        expect(markup.taxPct).toBe(0)
    })

    it('Corte e Barba: 15,5% sai do denominador e o preço cai de R$ 85,00', () => {
        const antes = priceFromMarkup({
            ...CORTE_E_BARBA,
            isMei: false, // comportamento defeituoso: MEI caía no ramo genérico
            taxableRegimePercent: CORTE_E_BARBA.storedTaxableRegimePercent,
            profitPercent: 0.43,
        })
        // Reproduz exatamente o preço gravado em produção hoje.
        expect(antes.cost).toBeCloseTo(36.05, 2)
        expect(antes.price).toBeCloseTo(85.0, 2)

        // Com a correção: imposto zero, lucro preservado como entrada do cadastro.
        const depois = priceFromMarkup({
            ...CORTE_E_BARBA,
            isMei: true,
            taxableRegimePercent: CORTE_E_BARBA.storedTaxableRegimePercent,
            profitPercent: 0.43,
        })
        expect(depois.markup.totalPct).toBeCloseTo(42.09, 6) // 1,29 + 0,37 + 40 + 0,43
        expect(depois.price).toBeCloseTo(62.25, 2)

        // E com lucro zerado pelo usuário, o mesmo denominador sem o lucro.
        const semLucro = priceFromMarkup({
            ...CORTE_E_BARBA,
            isMei: true,
            taxableRegimePercent: CORTE_E_BARBA.storedTaxableRegimePercent,
            profitPercent: 0,
        })
        expect(semLucro.markup.totalPct).toBeCloseTo(41.66, 6) // 1,29 + 0,37 + 40
        expect(semLucro.price).toBeCloseTo(61.79, 2)
    })

    it('gravação em MEI normaliza a alíquota do regime para 0', () => {
        // Espelha o payload de `handleSave`: nenhum resíduo herdado volta ao banco.
        expect(resolveServiceTaxableRegimePercent(15.5, { isMei: true })).toBe(0)
        expect(resolveServiceTaxableRegimePercent(15.5, { isMei: false })).toBe(15.5)
    })
})

// ── Michele Campos (Simples Nacional, Anexo IV) — tenant faec9ea2-…-4f2775839d67 ──
// Oráculo de não-regressão: os 7 serviços em produção. `variável + financeira` valia
// 1,14% quando foram gravados (a config do tenant mudou depois; os registros, não).
// Tolerância de R$ 0,02 porque `profit_percent` é persistido com 3 casas decimais.
const MICHELE_VAR_MAIS_FIN = 1.14
const MICHELE_SERVICOS = [
    { nome: 'Aparelho', minutos: 20, custo: 55.79, preco: 130.0, imposto: 7.095, lucro: 48.85 },
    { nome: 'Clareamento', minutos: 60, custo: 165.78, preco: 390.0, imposto: 7.095, lucro: 49.257 },
    { nome: 'Harmonização Facial', minutos: 30, custo: 279.19, preco: 1000.0, imposto: 2.1, lucro: 68.841 },
    { nome: 'Lentes em resina', minutos: 30, custo: 81.89, preco: 390.01, imposto: 2.1, lucro: 75.763 },
    { nome: 'Ortodontia', minutos: 20, custo: 54.39, preco: 130.0, imposto: 2.1, lucro: 54.92 },
    { nome: 'Restauração', minutos: 30, custo: 81.79, preco: 220.0, imposto: 2.1, lucro: 59.583 },
    { nome: 'Toxina Butolínica', minutos: 20, custo: 334.09, preco: 890.0, imposto: 2.1, lucro: 59.222 },
]

describe('D17 · Simples Nacional — comportamento intocado', () => {
    it.each(MICHELE_SERVICOS)(
        '$nome: preço permanece R$ $preco',
        ({ custo, preco, imposto, lucro }) => {
            const { markup, price } = priceFromMarkup({
                materialCost: custo, // custo já consolidado; MO fora para isolar o markup
                laborCostMonthly: 0,
                monthlyWorkloadMinutes: 0,
                serviceMinutes: 0,
                isMei: false,
                taxesPct: 0, // Simples Nacional ⇒ taxPreview.taxesPercent = 0
                taxableRegimePercent: imposto,
                variablePct: MICHELE_VAR_MAIS_FIN,
                financialPct: 0,
                rtReservePercent: 0,
                commissionPercent: 0,
                profitPercent: lucro,
            })

            // A alíquota do Simples entra inteira no denominador.
            expect(markup.taxableRegimePct).toBe(imposto)
            expect(markup.taxPct).toBeCloseTo(imposto / 100, 10)
            expect(price).toBeCloseTo(preco, 1)
            expect(Math.abs(price - preco)).toBeLessThanOrEqual(0.02)
        },
    )

    it('a alíquota do Simples é editável por serviço e move o preço', () => {
        const base = {
            materialCost: 55.79,
            laborCostMonthly: 0,
            monthlyWorkloadMinutes: 0,
            serviceMinutes: 0,
            isMei: false,
            taxesPct: 0,
            variablePct: MICHELE_VAR_MAIS_FIN,
            financialPct: 0,
            rtReservePercent: 0,
            commissionPercent: 0,
            profitPercent: 48.85,
        }
        const doOnboarding = priceFromMarkup({ ...base, taxableRegimePercent: 7.095 })
        const editadoManualmente = priceFromMarkup({ ...base, taxableRegimePercent: 12 })

        expect(editadoManualmente.markup.taxableRegimePct).toBe(12)
        expect(editadoManualmente.price).toBeGreaterThan(doOnboarding.price)
    })
})

describe('D17 · leitura do cadastro — zero digitado é zero', () => {
    it('0% de imposto no Simples sobrevive à reabertura da tela', () => {
        const gravadoNoServico = 0
        const doTenant = 7.095

        // Padrão antigo (`||`): o zero digitado virava "campo vazio" e voltava a alíquota do tenant.
        expect(gravadoNoServico || doTenant || 0).toBe(doTenant)

        // Padrão corrigido: só null/undefined caem para o fallback.
        expect(firstConfiguredPercent(gravadoNoServico, doTenant, 0)).toBe(0)
        expect(firstConfiguredPercent(null, doTenant, 0)).toBe(doTenant)
        expect(firstConfiguredPercent(undefined, null, doTenant)).toBe(doTenant)
        expect(firstConfiguredPercent(null, undefined, null)).toBe(0)
    })

    it('lucro, comissão e RT são lidos como gravados', () => {
        expect(readRegisteredPercent(0)).toBe(0)
        expect(readRegisteredPercent('0.43')).toBe(0.43)
        expect(readRegisteredPercent(48.85)).toBe(48.85)
        expect(readRegisteredPercent(null)).toBe(0)
        expect(readRegisteredPercent(undefined)).toBe(0)
        expect(readRegisteredPercent('abc')).toBe(0)
    })
})

describe('D17 · lucro é ENTRADA, nunca resíduo do preço', () => {
    const cenario = {
        ...CORTE_E_BARBA,
        isMei: true,
        taxableRegimePercent: 15.5,
    }

    it('o lucro do cadastro atravessa o cálculo sem ser reescrito', () => {
        for (const lucro of [0, 0.43, 10, 48.85]) {
            const { markup } = priceFromMarkup({ ...cenario, profitPercent: lucro })
            expect(markup.lines.find(l => l.key === 'profit')?.pct).toBe(lucro)
        }
    })

    it('o preço é função do lucro — o lucro não é função do preço', () => {
        // Mudar o custo move o preço e NÃO move o lucro (se o lucro fosse resíduo de um
        // preço-âncora, ele mudaria para manter o preço fixo).
        const barato = priceFromMarkup({ ...cenario, materialCost: 3.97, profitPercent: 10 })
        const caro = priceFromMarkup({ ...cenario, materialCost: 40, profitPercent: 10 })

        expect(caro.price).toBeGreaterThan(barato.price)
        expect(barato.markup.lines.find(l => l.key === 'profit')?.pct).toBe(10)
        expect(caro.markup.lines.find(l => l.key === 'profit')?.pct).toBe(10)

        // E o lucro é estritamente monotônico no preço: entrada → saída, nunca o inverso.
        const lucroMaior = priceFromMarkup({ ...cenario, materialCost: 3.97, profitPercent: 20 })
        expect(lucroMaior.price).toBeGreaterThan(barato.price)
    })
})

describe('D17 · soma das linhas exibidas fecha com o preço', () => {
    const cenarios = [
        {
            regime: 'MEI',
            input: { ...CORTE_E_BARBA, isMei: true, taxableRegimePercent: 15.5, profitPercent: 0.43 },
        },
        {
            regime: 'MEI (lucro zero)',
            input: { ...CORTE_E_BARBA, isMei: true, taxableRegimePercent: 15.5, profitPercent: 0 },
        },
        {
            regime: 'Simples Nacional',
            input: {
                ...ELIANE,
                materialCost: 55.79,
                serviceMinutes: 20,
                isMei: false,
                taxesPct: 0,
                taxableRegimePercent: 7.095,
                rtReservePercent: 1,
                commissionPercent: 5,
                profitPercent: 48.85,
            },
        },
        {
            regime: 'Regime não configurado',
            input: {
                ...ELIANE,
                materialCost: 20,
                serviceMinutes: 30,
                isMei: false,
                taxesPct: 0,
                taxableRegimePercent: 0,
                rtReservePercent: 0,
                commissionPercent: 15,
                profitPercent: 12,
            },
        },
    ]

    it.each(cenarios)('$regime: Σ linhas == totalPct e preço = custo ÷ (1 − Σ)', ({ input }) => {
        const { markup, result, price, cost } = priceFromMarkup(input)

        const somaDasLinhas = markup.lines.reduce((s, l) => s + l.pct, 0)
        expect(somaDasLinhas).toBeCloseTo(markup.totalPct, 10)

        // O coeficiente do motor é exatamente 1 − Σ das linhas exibidas.
        expect(result.coefficient).toBeCloseTo(1 - somaDasLinhas / 100, 10)

        // E o preço exibido fecha com essa soma, à vírgula.
        const precoPelaSoma = Math.round((cost / (1 - somaDasLinhas / 100)) * 100) / 100
        expect(price).toBe(precoPelaSoma)
    })
})
