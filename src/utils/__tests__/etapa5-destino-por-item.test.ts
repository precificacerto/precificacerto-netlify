/**
 * Etapa 5 — destino das categorias é propriedade da CONSTRUÇÃO DE CADA ITEM.
 *
 * REGRA CANÔNICA: toda categoria, PARA CADA PRODUTO, tem exatamente um destino — CUSTO ou
 * MARGEM DE CONTRIBUIÇÃO, nunca os dois. O destino não é propriedade da categoria nem da
 * segmentação do tenant: a mesma categoria pode ser custo num item e margem noutro, dentro
 * do mesmo orçamento. Item cuja categoria tem destino CUSTO contribui com ZERO naquela linha
 * da MC — não com o percentual médio, não com o percentual do tenant: zero.
 *
 * DEFEITO: a Etapa 5 tratava todos os itens como se tivessem a mesma classificação, porque
 * a alíquota de cada balde vinha do tenant para qualquer item. Em orçamento que mistura
 * construções — e orçamento com produto e serviço juntos SEMPRE mistura — isso cobra na
 * margem categorias que já estão no custo.
 *
 * ESCOPO: só a agregação das Etapas 5 e 6. Intocados a fórmula do RRO, a redistribuição por
 * pesos estruturais, o tratamento de Operação Externa e as regras de regime (MEI zera imposto
 * por item; Simples puxa do onboarding com edição manual). As Etapas 11-17 continuam usando
 * alíquota efetiva × base pós-desconto — correto naquela fase, porque a alíquota efetiva já
 * foi derivada da construção, que respeitou os destinos.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    calculateMotorV17ForPage,
    type PageBuildArgs,
    type PageItem,
    type PageTenantCtx,
} from '@/utils/mrm-engine-v17/legacy-adapter'
import {
    applyDopDestinations,
    resolveDopDestinations,
    resolveItemConstruction,
    type DopComponents,
    type DopDestinations,
} from '@/utils/expense-destination'
import type { CascadeStep } from '@/types/mrm'

// ──────────────────────────── helpers de leitura da cascata ────────────────────────────

function cascade(items: PageItem[], tenantCtx: PageTenantCtx, discount = 0): CascadeStep[] {
    const args: PageBuildArgs = { items, tenantCtx, globalDiscountPercent: discount }
    const res = calculateMotorV17ForPage(args)
    const first = res.find((r) => r != null)
    if (!first) throw new Error('motor não retornou resultado')
    return first.cascade_trace
}

const step = (t: CascadeStep[], n: number) => t.find((s) => s.step === n)
const child = (t: CascadeStep[], n: number, label: string) =>
    (step(t, n)?.children ?? []).find((c) => c.label === label)?.amount ?? 0
const stepAmount = (t: CascadeStep[], n: number) => step(t, n)?.amount ?? 0

// ────────────────────────── ORC-2356 — o orçamento da evidência ──────────────────────────

/**
 * Salão Eliane (MEI, `tenant_settings.calc_type = SERVICO`). Percentuais reais de
 * `tenant_expense_config`: MO administrativa 8,31%, fixa 6,23%, variável 1,25%,
 * financeira 0,36%.
 */
const ELIANE: PageTenantCtx = {
    regime: 'MEI',
    rates: [],
    mod_pct: 0,
    dop_pct: 0.0831 + 0.0623 + 0.0125 + 0.0036,
    csll_pct: 0,
    irpj_pct: 0,
    useSnapshotRates: true,
    calc_type: 'SERVICO',
    expense_breakdown: {
        administrative_pct: 0.0831,
        fixed_pct: 0.0623,
        variable_pct: 0.0125,
        financial_pct: 0.0036,
    },
    absorption_policy: 'RRO_PROPORTIONAL',
}

/**
 * Pomada Gel — produto de REVENDA, R$ 45,00. `cost_total` 0,15 com `yield_quantity` 100
 * (estoque, não rendimento) ⇒ CMV R$ 15,00. Comissão 10%, lucro 49,989%, DAS 5% gravado.
 * O snapshot do cadastro traz fixa 5,92% / variável 1,31% / financeira 0,37%.
 */
const POMADA_GEL: PageItem = {
    unit_price: 45,
    quantity: 1,
    cost_total: 0.15,
    productive_labor_unit: 0,
    product_type: 'REVENDA',
    yield_quantity: 100,
    commission_percent: 10,
    profit_percent: 49.989,
    rt_reserve_percent: 0,
    item_tax_rates: { das_pct: 5 },
    expense_breakdown_unit: {
        mo_admin: { rate: 0, amount_unit: 0 },
        fixa: { rate: 0.0592, amount_unit: 0.0001 },
        variavel: { rate: 0.0131, amount_unit: 0 },
        financeira: { rate: 0.0037, amount_unit: 0 },
        cmv_unit: 0.15,
    },
}

/**
 * Hidratação — SERVIÇO, R$ 73,68, 30 min. `cost_total` 28,25 já inclui a mão de obra
 * (R$ 16,04), e o custo por minuto que a produziu embute MO administrativa e despesas fixas
 * mensais — é exatamente por isso que as duas não podem voltar na margem.
 * Comissão 50%, lucro 10%, MEI ⇒ DAS 0.
 */
const HIDRATACAO: PageItem = {
    unit_price: 73.68,
    quantity: 1,
    cost_total: 28.25,
    productive_labor_unit: 0,
    service_id: 'svc-hidratacao',
    commission_percent: 50,
    profit_percent: 10,
    rt_reserve_percent: 0,
    item_tax_rates: { das_pct: 0 },
}

const TOTAL = 118.68
const CMV = 43.25          // 15,00 (produto) + 28,25 (serviço)
const DAS = 2.25           // 45 × 5% — o produto; o serviço é MEI com alíquota 0
const E6_TOTAL = 71.20305  // 45×10% + 73,68×50% + 45×49,989% + 73,68×10%

/**
 * Valores medidos ANTES da correção, no caminho de produção
 * (`calculateMotorV17ForPage`), escritos como a aritmética que os gera — e não como
 * decimais copiados de um relatório, que já custaram um erro nesta sequência de PRs.
 */
const ANTES = {
    /** 73,68 × 8,31% — só o serviço; o produto já vinha com 0 no snapshot do cadastro. */
    mo_admin: 73.68 * 0.0831,
    /** 45 × 5,92% (snapshot do produto) + 73,68 × 6,23% (tenant, para o serviço). */
    fixa: 45 * 0.0592 + 73.68 * 0.0623,
    get duplicado() { return this.mo_admin + this.fixa },
    get e5_total() { return this.duplicado + DEPOIS.e5_total },
    get rro() { return TOTAL - DAS - CMV - this.e5_total },
}
/** Valores DEPOIS. A Etapa 6 não se move: ela já estava correta. */
const DEPOIS = {
    /** Só variável + financeira — as duas são MC nas três construções. */
    e5_total: 45 * 0.0131 + 73.68 * 0.0125 + 45 * 0.0037 + 73.68 * 0.0036,
    get rro() { return TOTAL - DAS - CMV - this.e5_total },
}

describe('ORC-2356 · o excedente sai da margem de contribuição', () => {
    const t = () => cascade([POMADA_GEL, HIDRATACAO], ELIANE, 0)

    it('reproduz a Etapa 6 da evidência — ela já estava correta e não muda', () => {
        const c = t()
        expect(child(c, 6, 'Comissão')).toBeCloseTo(41.34, 4)
        expect(child(c, 6, 'Lucro')).toBeCloseTo(29.86305, 4)
        expect(stepAmount(c, 6)).toBeCloseTo(E6_TOTAL, 4)
    })

    it('MO Administrativa e Despesa Fixa saem da Etapa 5 — as duas, nos dois itens', () => {
        const c = t()
        expect(child(c, 5, 'MO Administrativa')).toBe(0)
        expect(child(c, 5, 'Despesa Fixa')).toBe(0)
        // Variável e financeira são MC nas três construções: permanecem, à vírgula.
        expect(child(c, 5, 'Despesa Variável')).toBeCloseTo(45 * 0.0131 + 73.68 * 0.0125, 6)
        expect(child(c, 5, 'Despesa Financeira')).toBeCloseTo(45 * 0.0037 + 73.68 * 0.0036, 6)
        expect(stepAmount(c, 5)).toBeCloseTo(DEPOIS.e5_total, 6)
        expect(DEPOIS.e5_total).toBeCloseTo(1.942248, 6)
    })

    it('o que saiu é exatamente o que estava sendo contado duas vezes', () => {
        const removido = ANTES.e5_total - DEPOIS.e5_total
        expect(removido).toBeCloseTo(ANTES.duplicado, 9)
        expect(removido).toBeCloseTo(13.377072, 6)
        expect(ANTES.e5_total).toBeCloseTo(15.31932, 6)
        // E o RRO cresce exatamente esse valor — nada se cria, nada se perde.
        expect(DEPOIS.rro - ANTES.rro).toBeCloseTo(removido, 9)
        expect(ANTES.rro).toBeCloseTo(57.86068, 6)
        expect(stepAmount(t(), 15)).toBeCloseTo(DEPOIS.rro, 6)
        expect(DEPOIS.rro).toBeCloseTo(71.237752, 6)
    })

    it('a Etapa 16 sobe de 57,86 para 71,24 — comissão e lucro do vendedor', () => {
        const c = t()
        // Os pesos estruturais não mudam; o que muda é o RRO que eles repartem.
        const pesoComissao = 41.34 / E6_TOTAL
        expect(child(c, 16, 'Comissão')).toBeCloseTo(DEPOIS.rro * pesoComissao, 6)
        expect(child(c, 16, 'Comissão')).toBeCloseTo(41.3601, 4)
        expect(child(c, 16, 'Lucro')).toBeCloseTo(29.8776, 4)
        // Baseline gravado em `budgets`: commission_amount 33,59 + profit_amount 24,27.
        expect(ANTES.rro * pesoComissao).toBeCloseTo(33.59, 2)
        expect(ANTES.rro * (29.86305 / E6_TOTAL)).toBeCloseTo(24.27, 2)
    })

    it('espelho Etapa 6 ⇄ Etapa 16 com desconto zero: de R$ 13,34 para R$ 0,03', () => {
        const c = t()
        const e16 = child(c, 16, 'Comissão') + child(c, 16, 'Lucro')
        expect(E6_TOTAL - ANTES.rro).toBeCloseTo(13.34237, 5)  // o defeito
        expect(Math.abs(e16 - E6_TOTAL)).toBeLessThan(0.04)    // corrigido
        // O resíduo de R$ 0,0347 NÃO é da agregação: o serviço foi precificado com
        // variável 1,29% / financeira 0,37% e o tenant hoje tem 1,25% / 0,36% —
        // 73,68 × 0,05% = R$ 0,0368. É defasagem de dado, e some quando as duas
        // pontas usam a mesma alíquota (ver o orçamento misto coerente abaixo).
        expect(Math.abs(e16 - E6_TOTAL)).toBeCloseTo(0.0347, 3)
    })

    it('soma vertical fecha com o Total a cobrar, sem sobra nem falta', () => {
        const c = t()
        const rro = stepAmount(c, 15)
        expect(CMV + DEPOIS.e5_total + DAS + rro).toBeCloseTo(TOTAL, 6)
    })
})

// ──────────────────── Orçamento MISTO coerente — os quatro invariantes ────────────────────

/**
 * Tenant de segmentação SERVIÇO com dados internamente consistentes: o preço de cada item é
 * construído com as MESMAS alíquotas que a cascata lê. É o cenário em que os invariantes
 * valem à vírgula — sem resíduo de defasagem de cadastro.
 */
const TENANT_SERVICO: PageTenantCtx = {
    regime: 'MEI',
    rates: [],
    mod_pct: 0,
    dop_pct: 0.08 + 0.06 + 0.01 + 0.005,
    csll_pct: 0,
    irpj_pct: 0,
    useSnapshotRates: true,
    calc_type: 'SERVICO',
    expense_breakdown: {
        administrative_pct: 0.08,
        fixed_pct: 0.06,
        variable_pct: 0.01,
        financial_pct: 0.005,
    },
    absorption_policy: 'RRO_PROPORTIONAL',
}

/** Serviço R$ 200: MO adm e fixa já no custo por minuto ⇒ CMV = 200 × (1 − 40% − 10% − 1% − 0,5%). */
const SERVICO_COERENTE: PageItem = {
    unit_price: 200,
    quantity: 1,
    cost_total: 97,
    service_id: 'svc-corte',
    commission_percent: 40,
    profit_percent: 10,
    item_tax_rates: { das_pct: 0 },
}
/** Revenda R$ 100 no mesmo tenant: pela exceção declarada, também sem MO adm nem fixa. */
const REVENDA_COERENTE: PageItem = {
    unit_price: 100,
    quantity: 1,
    cost_total: 69.5,
    product_type: 'REVENDA',
    yield_quantity: 1,
    commission_percent: 5,
    profit_percent: 20,
    item_tax_rates: { das_pct: 4 },
}
const MISTO = [SERVICO_COERENTE, REVENDA_COERENTE]

describe('Invariante 1 · fechamento em 100%', () => {
    it('CMV% + Despesas% + Tributos% + RT% + Comissão% + Lucro% = 100,0000%', () => {
        const c = cascade(MISTO, TENANT_SERVICO, 0)
        const total = 300
        const soma =
            stepAmount(c, 4) +          // CMV
            stepAmount(c, 5) +          // despesas operacionais
            -stepAmount(c, 13) +        // tributos (a etapa 13 é negativa na cascata)
            stepAmount(c, 6)            // margens da construção
        expect((soma / total) * 100).toBeCloseTo(100, 6)
    })

    it('antes da correção a mesma soma passava de 100% — e o excedente era a dupla contagem', () => {
        // Reconstrói o que a Etapa 5 somaria se MO adm e fixa fossem margem nos dois itens.
        const c = cascade(MISTO, TENANT_SERVICO, 0)
        const duplicado = 300 * (0.08 + 0.06)
        const somaAntes = stepAmount(c, 4) + (stepAmount(c, 5) + duplicado) + -stepAmount(c, 13) + stepAmount(c, 6)
        expect((somaAntes / 300) * 100).toBeCloseTo(114, 6)
        expect(somaAntes - 300).toBeCloseTo(duplicado, 6)
    })
})

describe('Invariante 2 · espelho com desconto zero', () => {
    it('Etapa 6 e Etapa 16 são idênticas à vírgula', () => {
        const c = cascade(MISTO, TENANT_SERVICO, 0)
        const e16 = child(c, 16, 'Comissão') + child(c, 16, 'Lucro') + child(c, 16, 'IRPJ') + child(c, 16, 'CSLL')
        expect(e16).toBeCloseTo(stepAmount(c, 6), 6)
        expect(e16).toBeCloseTo(125, 6)   // 200×50% + 100×25%
    })

    it('a Etapa 16 é a autoridade: parte do Total a cobrar real e chega ao residual que existe', () => {
        const c = cascade(MISTO, TENANT_SERVICO, 0)
        expect(stepAmount(c, 15)).toBeCloseTo(300 - 4 - 166.5 - 4.5, 6)
    })
})

describe('Invariante 3 · soma vertical', () => {
    it.each([0, 5, 12.5])('Desconto + Tributos + CMV + Despesas + RT + RRO = Total (desc %s%%)', (desc) => {
        const c = cascade(MISTO, TENANT_SERVICO, desc)
        const desconto = -stepAmount(c, 11)
        const tributos = -stepAmount(c, 13)
        const custosEDespesas = -stepAmount(c, 14)
        const rro = stepAmount(c, 15)
        expect(desconto + tributos + custosEDespesas + rro).toBeCloseTo(300, 6)
    })
})

describe('Invariante 4 · preservação de pesos', () => {
    it.each([0, 5, 12.5, 30])('Comissão ÷ (Comissão + Lucro) igual nas Etapas 6 e 16 (desc %s%%)', (desc) => {
        const c = cascade(MISTO, TENANT_SERVICO, desc)
        const razao6 = child(c, 6, 'Comissão') / (child(c, 6, 'Comissão') + child(c, 6, 'Lucro'))
        const razao16 = child(c, 16, 'Comissão') / (child(c, 16, 'Comissão') + child(c, 16, 'Lucro'))
        expect(razao16).toBeCloseTo(razao6, 9)
        expect(razao6).toBeCloseTo(85 / 125, 9)
    })

    it('o desconto muda o valor absoluto, nunca a proporção', () => {
        const semDesc = cascade(MISTO, TENANT_SERVICO, 0)
        const comDesc = cascade(MISTO, TENANT_SERVICO, 20)
        expect(child(comDesc, 16, 'Comissão')).toBeLessThan(child(semDesc, 16, 'Comissão'))
        expect(child(comDesc, 16, 'Lucro')).toBeLessThan(child(semDesc, 16, 'Lucro'))
        const r = (c: CascadeStep[]) => child(c, 16, 'Comissão') / child(c, 16, 'Lucro')
        expect(r(comDesc)).toBeCloseTo(r(semDesc), 9)
    })
})

// ─────────────── PRODUTO e SERVIÇO isolados — regra fixa da Venda no Balcão ───────────────

describe('Item único · PRODUTO e SERVIÇO, cada um sozinho', () => {
    it('SERVIÇO sozinho: MO adm e fixa no custo, e o residual fecha com a construção', () => {
        const c = cascade([SERVICO_COERENTE], TENANT_SERVICO, 0)
        expect(child(c, 5, 'MO Administrativa')).toBe(0)
        expect(child(c, 5, 'Despesa Fixa')).toBe(0)
        expect(stepAmount(c, 5)).toBeCloseTo(200 * 0.015, 6)
        expect(stepAmount(c, 15)).toBeCloseTo(100, 6)          // 200 − 97 − 3
        expect(stepAmount(c, 6)).toBeCloseTo(100, 6)           // 200 × 50%
    })

    it('PRODUTO de revenda sozinho em tenant SERVIÇO: mesma exceção, mesmo fechamento', () => {
        const c = cascade([REVENDA_COERENTE], TENANT_SERVICO, 0)
        expect(child(c, 5, 'MO Administrativa')).toBe(0)
        expect(child(c, 5, 'Despesa Fixa')).toBe(0)
        expect(stepAmount(c, 15)).toBeCloseTo(100 - 4 - 69.5 - 1.5, 6)
        expect(stepAmount(c, 6)).toBeCloseTo(25, 6)            // 100 × 25%
    })

    it('a soma dos dois isolados é a mesma do orçamento misto — a agregação é uma SOMA', () => {
        const s = cascade([SERVICO_COERENTE], TENANT_SERVICO, 0)
        const p = cascade([REVENDA_COERENTE], TENANT_SERVICO, 0)
        const m = cascade(MISTO, TENANT_SERVICO, 0)
        expect(stepAmount(s, 5) + stepAmount(p, 5)).toBeCloseTo(stepAmount(m, 5), 6)
        expect(stepAmount(s, 6) + stepAmount(p, 6)).toBeCloseTo(stepAmount(m, 6), 6)
        expect(stepAmount(s, 15) + stepAmount(p, 15)).toBeCloseTo(stepAmount(m, 15), 6)
    })
})

// ──────────────── Não pode mudar: tenants de industrialização e de revenda ────────────────

/**
 * Estes são os 89 dos 91 orçamentos com itens em produção (Esquadrias De Paula, 86; TAMARA
 * DRESCH, 3). Nas colunas Industrialização e Revenda da tabela de destinos, MO Indireta e
 * Despesa Fixa são MARGEM — e a exceção do produto de revenda só existe em tenant SERVIÇO.
 * Logo nada nestes tenants podia se mover na MC, com um item ou com vários. **A MC continua
 * intacta: Etapa 5 = 21.700 e Etapa 6 = 28.464, iguais aos medidos aqui desde o PR #25.**
 *
 * ATUALIZADO POR MUDANÇA DE REGRA — NÃO É TESTE AFROUXADO PARA PASSAR.
 *
 * Os valores antigos foram escritos sob a matriz de DOIS destinos do PR #25. A matriz canônica
 * de TRÊS destinos os torna OBSOLETOS: na tabela do item de REVENDA em tenant de OUTRA
 * segmentação, em tenant de INDUSTRIALIZAÇÃO o destino da MO Produtiva é **FORA**, porque ela
 * já está dentro do custo por tempo dos itens produzidos. Quando este bloco foi escrito essa
 * célula não existia. `REVENDIDO` tem `productive_labor_unit: 900` × qtd 2 = **R$ 1.800**, que
 * vinham entrando no CMV do item de revenda — dupla incidência.
 *
 * A PROVA de que a mudança é correta e não vazamento, e ela está asserida abaixo, não apenas
 * afirmada aqui:
 *
 *   1. A MC NÃO SE MOVEU — Etapa 5 em 21.700 e Etapa 6 em 28.464, intactas.
 *   2. O RRO SOBE EXATAMENTE O QUE O CUSTO DESCE — 1.800 em cada um dos três casos, com e
 *      sem desconto (custo é imune a desconto, então o delta não varia com ele).
 *   3. Comissão e lucro se movem por REDISTRIBUIÇÃO do RRO pelos pesos estruturais, não por
 *      regra própria: nenhum percentual de comissão ou de lucro foi tocado.
 *
 * É esse o comportamento que a regra manda. Valores antigos e novos lado a lado:
 *
 *   Etapa 4 (custo consolidado, multi) ... 36.300 → 34.500   (−1.800)
 *   RRO, revenda sozinha ................. 47.800 → 49.600   (+1.800)
 *   RRO, multi sem desconto .............. 82.000 → 83.800   (+1.800)
 *   RRO, multi com 10% ................... 68.000 → 69.800   (+1.800)
 *   Comissão (16), multi ................. 15.556,4924 → 15.897,9764
 *   Lucro (16), multi .................... 53.583,4739 → 54.759,6965
 *
 * Em produção nada disso se materializa: nenhum produto de revenda tem MO Produtiva
 * por qualquer fonte (`productive_labor_total`, `labor_costs`, `pricing_calculations`), em
 * nenhuma das três segmentações — 29 itens em tenants de industrialização, 18 em serviço, 28
 * em revenda, todos zero. É ARMADO, NÃO MATERIALIZADO.
 *
 * O que continua sendo "não pode mudar", e é o que este bloco guarda: a MC destes tenants, e
 * o tenant REVENDA inteiro, onde nada se moveu.
 */
const TENANT_INDUSTRIA: PageTenantCtx = {
    regime: 'LUCRO_REAL',
    rates: [],
    mod_pct: 0,
    dop_pct: 0.08 + 0.06 + 0.01 + 0.005,
    csll_pct: 0,
    irpj_pct: 0,
    useSnapshotRates: true,
    calc_type: 'INDUSTRIALIZACAO',
    expense_breakdown: {
        administrative_pct: 0.08,
        fixed_pct: 0.06,
        variable_pct: 0.01,
        financial_pct: 0.005,
    },
    absorption_policy: 'RRO_PROPORTIONAL',
}
const PRODUZIDO: PageItem = {
    unit_price: 60000, quantity: 1, cost_total: 15000, productive_labor_unit: 1500,
    commission_percent: 5, profit_percent: 15, product_type: 'PRODUZIDO',
}
const REVENDIDO: PageItem = {
    unit_price: 40000, quantity: 2, cost_total: 9000, productive_labor_unit: 900,
    commission_percent: 3, profit_percent: 12, product_type: 'REVENDA',
}

describe('Não pode mudar · tenant INDUSTRIALIZAÇÃO', () => {
    it('item único PRODUZIDO: MO Administrativa e Despesa Fixa continuam na margem', () => {
        const c = cascade([PRODUZIDO], TENANT_INDUSTRIA, 0)
        expect(child(c, 5, 'MO Administrativa')).toBeCloseTo(60000 * 0.08, 6)
        expect(child(c, 5, 'Despesa Fixa')).toBeCloseTo(60000 * 0.06, 6)
        expect(stepAmount(c, 5)).toBeCloseTo(9300, 6)
        expect(stepAmount(c, 15)).toBeCloseTo(34200, 6)
    })

    it('item único de REVENDA em tenant de indústria: idem — a exceção não alcança aqui', () => {
        const c = cascade([REVENDIDO], TENANT_INDUSTRIA, 0)
        expect(child(c, 5, 'MO Administrativa')).toBeCloseTo(80000 * 0.08, 6)
        expect(child(c, 5, 'Despesa Fixa')).toBeCloseTo(80000 * 0.06, 6)
        // 47.800 antes: os 1.800 de MO Produtiva saíram do CMV (destino FORA) e viraram RRO.
        expect(stepAmount(c, 15)).toBeCloseTo(49600, 6)
    })

    it('multi-item, com e sem desconto: valores idênticos aos medidos antes da correção', () => {
        const c = cascade([PRODUZIDO, REVENDIDO], TENANT_INDUSTRIA, 0)
        // PROVA 1 — a MC não se moveu: é o que este teste guarda desde o PR #25.
        expect(stepAmount(c, 5)).toBeCloseTo(21700, 6)
        expect(stepAmount(c, 6)).toBeCloseTo(28464, 6)
        // PROVA 2 — o RRO sobe EXATAMENTE o que o custo desce, asserido como identidade e não
        // como dois números soltos: 36.300 − 34.500 = 83.800 − 82.000 = 1.800.
        expect(stepAmount(c, 4)).toBeCloseTo(34500, 6)
        expect(36300 - stepAmount(c, 4)).toBeCloseTo(stepAmount(c, 15) - 82000, 6)
        // 82.000 antes; +1.800 de MO Produtiva do item de revenda que deixou o CMV.
        expect(stepAmount(c, 15)).toBeCloseTo(83800, 6)
        expect(child(c, 16, 'Comissão')).toBeCloseTo(15897.976391, 4)
        expect(child(c, 16, 'Lucro')).toBeCloseTo(54759.696459, 4)

        const d = cascade([PRODUZIDO, REVENDIDO], TENANT_INDUSTRIA, 10)
        expect(stepAmount(d, 5)).toBeCloseTo(21700, 6)
        // 68.000 antes; mesmos 1.800, o desconto não os toca (custo é imune a desconto).
        expect(stepAmount(d, 15)).toBeCloseTo(69800, 6)
        expect(child(d, 16, 'Comissão')).toBeCloseTo(13241.989882, 4)
    })
})

describe('Não pode mudar · tenant REVENDA e tenant sem calc_type', () => {
    it('tenant REVENDA: produto de revenda mantém MO Administrativa e Despesa Fixa', () => {
        const c = cascade([REVENDIDO], { ...TENANT_INDUSTRIA, calc_type: 'REVENDA' }, 0)
        expect(child(c, 5, 'MO Administrativa')).toBeCloseTo(6400, 6)
        expect(child(c, 5, 'Despesa Fixa')).toBeCloseTo(4800, 6)
        expect(stepAmount(c, 15)).toBeCloseTo(47800, 6)
    })

    it('calc_type ausente: nenhuma exceção é aplicada — nem na MC, nem no custo', () => {
        const semTipo = cascade([PRODUZIDO, REVENDIDO], { ...TENANT_INDUSTRIA, calc_type: undefined }, 0)
        const comTipo = cascade([PRODUZIDO, REVENDIDO], TENANT_INDUSTRIA, 0)
        // A MC é idêntica nos dois: sem segmentação não há exceção a aplicar.
        expect(stepAmount(semTipo, 5)).toBe(stepAmount(comTipo, 5))
        // O CUSTO diverge, e é a divergência que este PR introduz: sem `calc_type` a MO
        // Produtiva do item de revenda continua no CMV (nenhum destino FORA foi resolvido);
        // com `calc_type = INDUSTRIALIZACAO` ela sai. 82.000 contra 83.800.
        expect(stepAmount(semTipo, 4)).toBeCloseTo(36300, 6)
        expect(stepAmount(comTipo, 4)).toBeCloseTo(34500, 6)
        expect(stepAmount(semTipo, 15)).toBeCloseTo(82000, 6)
        expect(stepAmount(comTipo, 15)).toBeCloseTo(83800, 6)
    })

    it('serviço em tenant de indústria também tem MO adm e fixa no custo — é a construção que manda', () => {
        // O destino é propriedade do ITEM, não do tenant: um serviço vendido por uma
        // indústria continua carregando as duas categorias dentro do custo por minuto.
        const svc: PageItem = { unit_price: 1000, quantity: 1, cost_total: 500, service_id: 'svc-x', commission_percent: 10, profit_percent: 20 }
        const c = cascade([svc], TENANT_INDUSTRIA, 0)
        expect(child(c, 5, 'MO Administrativa')).toBe(0)
        expect(child(c, 5, 'Despesa Fixa')).toBe(0)
        expect(stepAmount(c, 5)).toBeCloseTo(1000 * 0.015, 6)
    })
})

// ──────────────────────────── A tabela de destinos, unitária ────────────────────────────

describe('Tabela de destinos', () => {
    it('classifica a construção pelo item, não pelo tenant', () => {
        expect(resolveItemConstruction({ service_id: 'x' })).toBe('SERVICO')
        expect(resolveItemConstruction({ service_id: 'x', product_type: 'PRODUZIDO' })).toBe('SERVICO')
        expect(resolveItemConstruction({ product_type: 'PRODUZIDO' })).toBe('INDUSTRIALIZACAO')
        expect(resolveItemConstruction({ product_type: 'REVENDA' })).toBe('REVENDA')
        // Sem tipo, o default é REVENDA: entre as duas colunas de produto os quatro baldes
        // têm destinos idênticos, e só a exceção do tenant SERVIÇO observa a diferença.
        expect(resolveItemConstruction({})).toBe('REVENDA')
        expect(resolveItemConstruction({ product_type: null })).toBe('REVENDA')
    })

    it('Prestação de Serviço: MO Indireta e Despesa Fixa no CUSTO, em qualquer tenant', () => {
        for (const seg of ['SERVICO', 'INDUSTRIALIZACAO', 'REVENDA', null, undefined]) {
            const d = resolveDopDestinations('SERVICO', seg)
            expect(d.mo_admin).toBe('CUSTO')
            expect(d.fixa).toBe('CUSTO')
            expect(d.variavel).toBe('MARGEM')
            expect(d.financeira).toBe('MARGEM')
        }
    })

    it('Industrialização: MO Indireta e Despesa Fixa na margem, sem exceção', () => {
        for (const seg of ['SERVICO', 'INDUSTRIALIZACAO', 'REVENDA']) {
            const d = resolveDopDestinations('INDUSTRIALIZACAO', seg)
            expect(d.mo_admin).toBe('MARGEM')
            expect(d.fixa).toBe('MARGEM')
        }
    })

    it('Revenda: margem — exceto em tenant SERVIÇO, onde as duas ficam FORA', () => {
        // ATUALIZAÇÃO POR MUDANÇA DE REGRA: o destino aqui era escrito 'CUSTO' quando a matriz
        // tinha DOIS destinos. Não é custo do item de revenda — as duas já estão dentro do
        // custo por minuto da prestação, e o nome disso é FORA. A troca é DE VOCABULÁRIO, e o
        // teste abaixo prova que é, em vez de afirmar que é.
        expect(resolveDopDestinations('REVENDA', 'INDUSTRIALIZACAO')).toMatchObject({ mo_admin: 'MARGEM', fixa: 'MARGEM' })
        expect(resolveDopDestinations('REVENDA', 'REVENDA')).toMatchObject({ mo_admin: 'MARGEM', fixa: 'MARGEM' })
        expect(resolveDopDestinations('REVENDA', null)).toMatchObject({ mo_admin: 'MARGEM', fixa: 'MARGEM' })
        expect(resolveDopDestinations('REVENDA', 'SERVICO')).toMatchObject({ mo_admin: 'FORA', fixa: 'FORA' })
        expect(resolveDopDestinations('REVENDA', ' servico ')).toMatchObject({ mo_admin: 'FORA', fixa: 'FORA' })
    })

    it('PROVA de que a troca CUSTO → FORA é só vocabulário: a MC dá NÚMEROS IDÊNTICOS', () => {
        // Não basta trocar o esperado de CUSTO para FORA. Se os números da MC divergissem, não
        // seria vocabulário — seria defeito. Aqui a igualdade é asserida, não presumida.
        const custo: DopDestinations = { mo_admin: 'CUSTO', fixa: 'CUSTO', variavel: 'MARGEM', financeira: 'MARGEM' }
        const fora: DopDestinations = { mo_admin: 'FORA', fixa: 'FORA', variavel: 'MARGEM', financeira: 'MARGEM' }
        const casos: DopComponents[] = [
            { mo_admin: 0.0831, fixa: 0.0623, variavel: 0.0125, financeira: 0.0036 },
            { mo_admin: 0.08, fixa: 0.06, variavel: 0.01, financeira: 0.005 },
            { mo_admin: 0, fixa: 0, variavel: 0, financeira: 0 },
            { mo_admin: 1, fixa: 1, variavel: 1, financeira: 1 },
        ]
        for (const c of casos) {
            expect(applyDopDestinations(c, fora)).toEqual(applyDopDestinations(c, custo))
        }
    })

    it('PROVA na cascata: a conversão do item de revenda não vaza para a MC, em nenhum valor', () => {
        // O que distingue FORA de CUSTO está no lado do CUSTO. Do lado da MC os dois zeram
        // igual — e é isto que se vê aqui: variando a MO Produtiva do item de revenda de 0 a
        // 900 num tenant de SERVIÇO, as Etapas 5 e 6 não se movem um centavo.
        const revenda = (mod: number): PageItem => ({
            unit_price: 200, quantity: 1, cost_total: 80, productive_labor_unit: mod,
            product_type: 'REVENDA', yield_quantity: 1,
            commission_percent: 10, profit_percent: 15, item_tax_rates: { das_pct: 6 },
        })
        const base = cascade([revenda(0)], TENANT_SERVICO, 0)
        for (const mod of [20, 900]) {
            const c = cascade([revenda(mod)], TENANT_SERVICO, 0)
            expect(stepAmount(c, 5)).toBe(stepAmount(base, 5))
            expect(stepAmount(c, 6)).toBe(stepAmount(base, 6))
            expect(child(c, 5, 'MO Administrativa')).toBe(0)
            expect(child(c, 5, 'Despesa Fixa')).toBe(0)
            expect(child(c, 5, 'Despesa Variável')).toBe(child(base, 5, 'Despesa Variável'))
            expect(child(c, 5, 'Despesa Financeira')).toBe(child(base, 5, 'Despesa Financeira'))
            // E o custo também não se move: FORA tira a conversão inteira, qualquer que seja.
            expect(stepAmount(c, 4)).toBe(stepAmount(base, 4))
        }
    })

    it('destino CUSTO zera o balde — não reduz, não faz média: zera', () => {
        const componentes = { mo_admin: 0.0831, fixa: 0.0623, variavel: 0.0125, financeira: 0.0036 }
        const aplicado = applyDopDestinations(componentes, resolveDopDestinations('SERVICO'))
        expect(aplicado).toEqual({ mo_admin: 0, fixa: 0, variavel: 0.0125, financeira: 0.0036 })
        // E destino MARGEM não toca em nada.
        expect(applyDopDestinations(componentes, resolveDopDestinations('INDUSTRIALIZACAO'))).toEqual(componentes)
    })
})
