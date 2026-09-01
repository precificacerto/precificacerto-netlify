/**
 * Serviço não tinha snapshot das próprias alíquotas de despesa — e o preço gravado
 * deixava de ser reproduzível.
 *
 * DEFEITO (estrutural): produto congela as alíquotas que formaram o seu preço em
 * `pricing_calculations` (`pct_indirect_labor`, `pct_fixed_expense`, `pct_variable_expense`,
 * `pct_financial_expense`), e a cascata as lê por `expense_breakdown_unit`. Serviço não
 * congelava nada: quem precisasse decompor o preço de um serviço lia o
 * `tenant_expense_config` ATUAL. Bastava o tenant editar a configuração de despesas para
 * que a decomposição passasse a usar números que não construíram aquele preço.
 *
 * Não é o resíduo de R$ 0,03 do ORC-2356 — esse é o sintoma. O defeito é que TODO serviço
 * já precificado fica sujeito à deriva do cadastro do tenant.
 *
 * EVIDÊNCIA: a Hidratação (Salão Eliane) foi precificada com variável 1,29% e financeira
 * 0,37%; o `tenant_expense_config` foi para 1,25% / 0,36% em 01/09/2026 15:47. A cascata
 * decompunha com as novas. `73,68 × 0,05% = R$ 0,0368`.
 *
 * CONSEQUÊNCIA PARA O TESTE (registrada no adendo do PR #25): enquanto o snapshot não
 * existir, o invariante 2 — espelho Etapa 6 ⇄ Etapa 16 com desconto zero, à vírgula — só é
 * testável contra FIXTURES. Contra dado de produção ele fica sujeito à deriva, e uma
 * divergência ali é indistinguível, pelo número sozinho, de um defeito de agregação. Com o
 * snapshot, o dado de produção volta a ser oráculo — é o que o último bloco deste arquivo
 * demonstra.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    SERVICE_EXPENSE_SNAPSHOT_VERSION,
    buildServiceExpenseSnapshot,
    readServiceExpenseSnapshot,
    resolveServiceExpenseBreakdownUnit,
    serviceSnapshotToExpenseBreakdownUnit,
} from '@/utils/service-expense-snapshot'
import { computeServiceSellingPrice } from '@/utils/compute-service-price'
import {
    calculateMotorV17ForPage,
    type PageItem,
    type PageTenantCtx,
} from '@/utils/mrm-engine-v17/legacy-adapter'
import type { CascadeStep } from '@/types/mrm'

// ─────────────────────────────── o snapshot em si ───────────────────────────────

describe('Snapshot de despesas do serviço · gravação e leitura', () => {
    const SNAP = buildServiceExpenseSnapshot({
        variavelPct: 1.29,
        financeiraPct: 0.37,
        custoPorMinuto: 0.534722,
        cargaHorariaMinutos: 18000,
        gravadoEm: '2026-08-29T18:41:57.727Z',
    })

    it('guarda as alíquotas do coeficiente e o custo por minuto do CMV', () => {
        expect(SNAP).toEqual({
            v: SERVICE_EXPENSE_SNAPSHOT_VERSION,
            variavel_pct: 1.29,
            financeira_pct: 0.37,
            custo_por_minuto: 0.534722,
            carga_horaria_minutos: 18000,
            gravado_em: '2026-08-29T18:41:57.727Z',
        })
    })

    it('não guarda Despesa Fixa nem MO Administrativa como percentual', () => {
        // As duas entram em R$/mês DENTRO do custo por minuto. Registrá-las aqui como %
        // sugeriria uma segunda incidência — que foi exatamente a dupla contagem removida
        // na correção da Etapa 5.
        expect(Object.keys(SNAP)).not.toContain('fixa_pct')
        expect(Object.keys(SNAP)).not.toContain('mo_indireta_pct')
    })

    it('lê de volta o que gravou', () => {
        expect(readServiceExpenseSnapshot(JSON.parse(JSON.stringify(SNAP)))).toEqual(SNAP)
    })

    it('AUSÊNCIA é informação: serviço legado devolve null, não zeros', () => {
        // `null` = "nunca gravado" ⇒ o leitor cai no tenant, como sempre fez. Um objeto de
        // zeros diria "as alíquotas eram zero", que é outra afirmação — foi essa confusão
        // que o D8 pagou com `NOT NULL DEFAULT 0`.
        expect(readServiceExpenseSnapshot(null)).toBeNull()
        expect(readServiceExpenseSnapshot(undefined)).toBeNull()
        expect(readServiceExpenseSnapshot({})).toBeNull()
        expect(readServiceExpenseSnapshot([])).toBeNull()
        expect(readServiceExpenseSnapshot('{"v":1}')).toBeNull()
        expect(readServiceExpenseSnapshot({ v: 99, variavel_pct: 1, financeira_pct: 1 })).toBeNull()
        // Incompleto é inválido: sem as duas alíquotas não há o que congelar.
        expect(readServiceExpenseSnapshot({ v: 1, variavel_pct: 1.29 })).toBeNull()
    })

    it('zero gravado é zero — distinto de ausente', () => {
        const zerado = readServiceExpenseSnapshot({ v: 1, variavel_pct: 0, financeira_pct: 0 })
        expect(zerado).not.toBeNull()
        expect(zerado?.variavel_pct).toBe(0)
        expect(zerado?.financeira_pct).toBe(0)
    })

    it('converte para o `expense_breakdown_unit` que a cascata já sabe ler', () => {
        const eb = serviceSnapshotToExpenseBreakdownUnit(SNAP, 73.68)
        // Alíquotas em DECIMAL, como no caminho do produto.
        expect(eb.variavel.rate).toBeCloseTo(0.0129, 10)
        expect(eb.financeira.rate).toBeCloseTo(0.0037, 10)
        expect(eb.variavel.amount_unit).toBeCloseTo(73.68 * 0.0129, 10)
        // MO Administrativa e Despesa Fixa saem ZERADAS por construção: no serviço as duas
        // são CUSTO (tabela de destinos), já dentro do custo por minuto.
        expect(eb.mo_admin).toEqual({ rate: 0, amount_unit: 0 })
        expect(eb.fixa).toEqual({ rate: 0, amount_unit: 0 })
    })

    it('serviço sem snapshot não produz breakdown — o leitor cai no tenant', () => {
        expect(resolveServiceExpenseBreakdownUnit({ expense_snapshot: null }, 100)).toBeNull()
        expect(resolveServiceExpenseBreakdownUnit(null, 100)).toBeNull()
        expect(resolveServiceExpenseBreakdownUnit({ expense_snapshot: SNAP }, 100)).not.toBeNull()
    })
})

// ───────────────────── quem forma preço também grava o snapshot ─────────────────────

describe('Os três gravadores de preço devolvem o snapshot', () => {
    /** Salão Eliane: produtiva 0, Hub 0, admin 7.000, fixas 2.625/mês; 18.000 min/mês. */
    const CONFIG = {
        production_labor_cost: 0,
        production_labor_cost_hub: 0,
        admin_salary_total: 7000,
        admin_fgts_total: 0,
        admin_other_costs: 0,
        fixed_expense_monthly: 2625,
        fixed_expense_percent: 6.23,
        variable_expense_percent: 1.29,
        financial_expense_percent: 0.37,
    }
    const USER = { monthlyWorkloadInMinutes: 6000, unitMeasure: 'MINUTES', numProductiveSectorEmployee: 3 }

    function precificar(over: Partial<Parameters<typeof computeServiceSellingPrice>[0]> = {}) {
        return computeServiceSellingPrice({
            materialCost: 12.21,
            commissionPercent: 50,
            profitPercent: 10,
            taxableRegimePercent: 0,
            expenseConfig: CONFIG,
            taxPreview: null,
            currentUser: USER,
            serviceWorkloadMinutes: 30,
            ...over,
        })
    }

    it('`computeServiceSellingPrice` devolve as alíquotas que ACABOU de usar', () => {
        const r = precificar()
        expect(r.expenseSnapshot.variavel_pct).toBe(1.29)
        expect(r.expenseSnapshot.financeira_pct).toBe(0.37)
        // (7.000 + 2.625) ÷ 18.000 min
        expect(r.expenseSnapshot.custo_por_minuto).toBeCloseTo(9625 / 18000, 9)
        expect(r.expenseSnapshot.carga_horaria_minutos).toBe(18000)
    })

    it('o snapshot acompanha a mudança de configuração — preço novo, snapshot novo', () => {
        const antes = precificar()
        const depois = precificar({
            expenseConfig: { ...CONFIG, variable_expense_percent: 1.25, financial_expense_percent: 0.36 },
        })
        expect(antes.expenseSnapshot.variavel_pct).toBe(1.29)
        expect(depois.expenseSnapshot.variavel_pct).toBe(1.25)
        // O preço muda junto: é por isso que os dois têm que ser gravados na mesma operação.
        expect(depois.sellingPrice).not.toBe(antes.sellingPrice)
    })

    it('sem carga horária o custo por minuto é 0, e o snapshot diz isso', () => {
        const r = precificar({ currentUser: { monthlyWorkloadInMinutes: 0, unitMeasure: 'MINUTES', numProductiveSectorEmployee: 3 } })
        expect(r.expenseSnapshot.custo_por_minuto).toBe(0)
        expect(r.expenseSnapshot.carga_horaria_minutos).toBe(0)
    })
})

// ───────────────────────── a cascata lê o snapshot do serviço ─────────────────────────

const ELIANE: PageTenantCtx = {
    regime: 'MEI',
    rates: [],
    mod_pct: 0,
    dop_pct: 0.0831 + 0.0623 + 0.0125 + 0.0036,
    csll_pct: 0,
    irpj_pct: 0,
    useSnapshotRates: true,
    calc_type: 'SERVICO',
    // Config ATUAL do tenant — 1,25% / 0,36%, editada depois de a Hidratação ser precificada.
    expense_breakdown: {
        administrative_pct: 0.0831,
        fixed_pct: 0.0623,
        variable_pct: 0.0125,
        financial_pct: 0.0036,
    },
    absorption_policy: 'RRO_PROPORTIONAL',
}

/** Alíquotas CONGELADAS no dia em que a Hidratação foi precificada. */
const SNAPSHOT_HIDRATACAO = buildServiceExpenseSnapshot({
    variavelPct: 1.29,
    financeiraPct: 0.37,
    custoPorMinuto: 9625 / 18000,
    cargaHorariaMinutos: 18000,
    gravadoEm: '2026-08-29T18:41:57.727Z',
})

const HIDRATACAO_SEM_SNAPSHOT: PageItem = {
    unit_price: 73.68,
    quantity: 1,
    cost_total: 28.25,
    service_id: 'svc-hidratacao',
    commission_percent: 50,
    profit_percent: 10,
    rt_reserve_percent: 0,
    item_tax_rates: { das_pct: 0 },
}
const HIDRATACAO_COM_SNAPSHOT: PageItem = {
    ...HIDRATACAO_SEM_SNAPSHOT,
    expense_breakdown_unit: serviceSnapshotToExpenseBreakdownUnit(SNAPSHOT_HIDRATACAO, 73.68),
}
/** Pomada Gel — o PRODUTO do mesmo orçamento, que já tinha snapshot próprio. */
const POMADA_GEL: PageItem = {
    unit_price: 45,
    quantity: 1,
    cost_total: 0.15,
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

function cascade(items: PageItem[], ctx: PageTenantCtx = ELIANE, discount = 0): CascadeStep[] {
    const res = calculateMotorV17ForPage({ items, tenantCtx: ctx, globalDiscountPercent: discount })
    const first = res.find((r) => r != null)
    if (!first) throw new Error('motor não retornou resultado')
    return first.cascade_trace
}
const step = (t: CascadeStep[], n: number) => t.find((s) => s.step === n)
const child = (t: CascadeStep[], n: number, label: string) =>
    (step(t, n)?.children ?? []).find((c) => c.label === label)?.amount ?? 0
const amount = (t: CascadeStep[], n: number) => step(t, n)?.amount ?? 0

describe('Cascata · SERVIÇO decomposto com as alíquotas que o construíram', () => {
    it('com snapshot, valem 1,29% e 0,37% — não os 1,25% e 0,36% de hoje', () => {
        const c = cascade([HIDRATACAO_COM_SNAPSHOT])
        expect(child(c, 5, 'Despesa Variável')).toBeCloseTo(73.68 * 0.0129, 8)
        expect(child(c, 5, 'Despesa Financeira')).toBeCloseTo(73.68 * 0.0037, 8)
    })

    it('sem snapshot, o comportamento anterior é preservado — cai no tenant', () => {
        const c = cascade([HIDRATACAO_SEM_SNAPSHOT])
        expect(child(c, 5, 'Despesa Variável')).toBeCloseTo(73.68 * 0.0125, 8)
        expect(child(c, 5, 'Despesa Financeira')).toBeCloseTo(73.68 * 0.0036, 8)
    })

    it('MO Administrativa e Despesa Fixa seguem em ZERO — o snapshot não as ressuscita', () => {
        // Elas são CUSTO no serviço (tabela de destinos, PR #25) e o snapshot registra isso
        // no dado. As duas coisas têm que concordar, e concordam.
        for (const item of [HIDRATACAO_COM_SNAPSHOT, HIDRATACAO_SEM_SNAPSHOT]) {
            const c = cascade([item])
            expect(child(c, 5, 'MO Administrativa')).toBe(0)
            expect(child(c, 5, 'Despesa Fixa')).toBe(0)
        }
    })

    it('o snapshot vale em QUALQUER regime, não só em Simples/MEI', () => {
        // A regra do produto é travada em SN/MEI por decisão de escopo. A do serviço não
        // pode ser: o snapshot É a construção daquele preço, independentemente do regime.
        const lucroReal: PageTenantCtx = { ...ELIANE, regime: 'LUCRO_REAL', calc_type: 'INDUSTRIALIZACAO' }
        const c = cascade([HIDRATACAO_COM_SNAPSHOT], lucroReal)
        expect(child(c, 5, 'Despesa Variável')).toBeCloseTo(73.68 * 0.0129, 8)
    })

    it('PRODUTO não é afetado: continua lendo o próprio snapshot, como já lia', () => {
        // O produto sozinho, com o mesmo tenant: nada nele depende do serviço ao lado.
        const soProduto = cascade([POMADA_GEL])
        expect(child(soProduto, 5, 'Despesa Variável')).toBeCloseTo(45 * 0.0131, 8)
        expect(child(soProduto, 5, 'Despesa Financeira')).toBeCloseTo(45 * 0.0037, 8)
        expect(child(soProduto, 5, 'Despesa Fixa')).toBe(0)   // exceção do tenant SERVIÇO

        // E no orçamento misto a contribuição do produto é a mesma nos dois cenários: o
        // que muda entre eles é só a parcela do serviço.
        const com = cascade([POMADA_GEL, HIDRATACAO_COM_SNAPSHOT])
        const sem = cascade([POMADA_GEL, HIDRATACAO_SEM_SNAPSHOT])
        expect(child(com, 5, 'Despesa Variável') - 73.68 * 0.0129).toBeCloseTo(45 * 0.0131, 8)
        expect(child(sem, 5, 'Despesa Variável') - 73.68 * 0.0125).toBeCloseTo(45 * 0.0131, 8)
    })
})

describe('ORC-2356 · com o snapshot, o dado de produção volta a ser oráculo', () => {
    const E6_TOTAL = 71.20305   // 45×10% + 73,68×50% + 45×49,989% + 73,68×10%

    const e16 = (c: CascadeStep[]) => child(c, 16, 'Comissão') + child(c, 16, 'Lucro')

    it('o espelho Etapa 6 ⇄ Etapa 16 cai de R$ 0,0347 para menos de um centavo', () => {
        const sem = cascade([POMADA_GEL, HIDRATACAO_SEM_SNAPSHOT])
        const com = cascade([POMADA_GEL, HIDRATACAO_COM_SNAPSHOT])

        // Antes: a deriva do tenant_expense_config — 73,68 × (1,66% − 1,61%) = R$ 0,0368.
        expect(Math.abs(e16(sem) - E6_TOTAL)).toBeCloseTo(0.0347, 3)
        // Depois: sobra só o arredondamento a centavos do preço gravado.
        expect(Math.abs(e16(com) - E6_TOTAL)).toBeLessThan(0.01)
        expect(Math.abs(e16(com) - E6_TOTAL)).toBeLessThan(Math.abs(e16(sem) - E6_TOTAL))
    })

    it('a soma vertical continua fechando com o Total a cobrar', () => {
        const c = cascade([POMADA_GEL, HIDRATACAO_COM_SNAPSHOT])
        expect(amount(c, 4) + amount(c, 5) + -amount(c, 13) + amount(c, 15)).toBeCloseTo(118.68, 6)
    })

    it('editar as despesas do tenant deixa de mover o preço já gravado', () => {
        // O mesmo item, decomposto sob duas configurações de tenant bem diferentes.
        const outroTenant: PageTenantCtx = {
            ...ELIANE,
            expense_breakdown: { administrative_pct: 0.20, fixed_pct: 0.15, variable_pct: 0.09, financial_pct: 0.05 },
        }
        const a = cascade([HIDRATACAO_COM_SNAPSHOT], ELIANE)
        const b = cascade([HIDRATACAO_COM_SNAPSHOT], outroTenant)
        expect(amount(b, 5)).toBeCloseTo(amount(a, 5), 10)
        expect(amount(b, 15)).toBeCloseTo(amount(a, 15), 10)

        // Sem snapshot, a mesma edição movia a decomposição do preço gravado — o defeito.
        const semA = cascade([HIDRATACAO_SEM_SNAPSHOT], ELIANE)
        const semB = cascade([HIDRATACAO_SEM_SNAPSHOT], outroTenant)
        expect(amount(semB, 5)).not.toBeCloseTo(amount(semA, 5), 4)
    })
})
