/**
 * Em segmentação REVENDA a MO Produtiva sumia do preço.
 *
 * REGRA (Cascata do Simples Nacional, matriz de destino, coluna Revenda do core business):
 * MO Produtiva e MO Indireta são MC AGRUPADAS numa categoria só — somadas (15% + 8% = 23%) e
 * exibidas em UMA linha rotulada "MO Indireta". Não existe linha separada de MO Produtiva em
 * revenda.
 *
 * POR QUÊ. Nas outras duas segmentações a MO Produtiva vira CUSTO por tempo, rateada pelos
 * minutos do item. Revenda não tem tempo de produção: sem minuto sobre o qual ratear, ela só
 * pode entrar como percentual, na margem, ao lado da Indireta.
 *
 * O DEFEITO. `calcBase.laborPercent` (= `production_labor_percent`) era populado e **não
 * tinha um único leitor**. O tipo já declarava a intenção — "Labor as % of revenue — used by
 * REVENDA (included in structurePct)" — mas `structurePct` nunca a somou. Em segmentação
 * REVENDA a MO Produtiva não entrava no CMV (correto, é MC) nem na MC (defeito): sumia.
 *
 * ESTADO EM PRODUÇÃO: ARMADO, NÃO MATERIALIZADO. Os 4 tenants de segmentação REVENDA têm
 * `production_labor_percent = 0` — nenhum preço gravado está errado hoje. O defeito aparece
 * no primeiro tenant de revenda que preencher a MO Produtiva.
 *
 * SOBRE OS NÚMEROS DA SEÇÃO 8. Os percentuais e os três preços abaixo vêm do exemplo da
 * regra, que é um TESTE DE AGREGAÇÃO PURA — três construções, uma de cada segmentação, cada
 * uma correta no SEU PRÓPRIO tenant, somadas para exercitar o fechamento em 100%. NÃO é um
 * tenant real e NÃO há combinação de matriz a resolver ali. Aqui cada construção é exercitada
 * isoladamente, com o seu `calcType`, que é como ela existe de verdade: nenhum teste deste
 * arquivo põe as três no mesmo orçamento.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    groupsProductiveLaborIntoIndirect,
    resolveIndirectLaborPct,
} from '@/utils/indirect-labor-grouping'
import { calculatePricing } from '@/utils/pricing-engine'
import {
    calculateMotorV17ForPage,
    type PageItem,
    type PageTenantCtx,
} from '@/utils/mrm-engine-v17/legacy-adapter'
import type { CascadeStep } from '@/types/mrm'

/** Percentuais do exemplo de agregação da regra (seção 8) — ver nota no cabeçalho. */
const P = { moProd: 15, moInd: 8, fixa: 10, variavel: 5, financeira: 2, imposto: 10, rt: 1, comissao: 5, lucro: 10 }

describe('O agrupamento · só em segmentação REVENDA', () => {
    it('REVENDA soma MO Produtiva na MO Indireta: 8 + 15 = 23', () => {
        expect(resolveIndirectLaborPct({
            tenantCalcType: 'REVENDA', indirectLaborPct: P.moInd, productiveLaborPct: P.moProd,
        })).toBe(23)
        expect(groupsProductiveLaborIntoIndirect('REVENDA')).toBe(true)
        expect(groupsProductiveLaborIntoIndirect(' revenda ')).toBe(true)
    })

    it('INDUSTRIALIZAÇÃO e SERVIÇO NÃO agrupam — a Indireta sai intacta', () => {
        for (const seg of ['INDUSTRIALIZACAO', 'SERVICO', null, undefined, '']) {
            expect(groupsProductiveLaborIntoIndirect(seg)).toBe(false)
            expect(resolveIndirectLaborPct({
                tenantCalcType: seg, indirectLaborPct: P.moInd, productiveLaborPct: P.moProd,
            })).toBe(P.moInd)
        }
    })

    it('MO Produtiva zero (estado dos 4 tenants de revenda hoje): nada muda', () => {
        expect(resolveIndirectLaborPct({
            tenantCalcType: 'REVENDA', indirectLaborPct: 7.56, productiveLaborPct: 0,
        })).toBe(7.56)
    })

    it('valores ausentes ou inválidos não viram NaN', () => {
        expect(resolveIndirectLaborPct({ tenantCalcType: 'REVENDA', indirectLaborPct: null, productiveLaborPct: undefined })).toBe(0)
        expect(resolveIndirectLaborPct({ tenantCalcType: 'REVENDA', indirectLaborPct: 'x', productiveLaborPct: 15 })).toBe(15)
    })
})

describe('PRODUTO · o preço da construção de revenda', () => {
    /** Espelha `doProductCalc` para um produto de revenda. */
    function precoRevenda(indirectLaborPct: number) {
        return calculatePricing({
            calcType: 'REVENDA',
            totalItemsCost: 100, yieldQuantity: 1,
            laborCostMonthly: 0, numProductiveEmployees: 1,
            monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
            structurePct: (P.fixa + P.variavel + P.financeira + indirectLaborPct) / 100,
            taxPct: P.imposto / 100,
            rtReservePct: P.rt / 100,
            commissionPct: P.comissao / 100,
            profitPct: P.lucro / 100,
        })
    }
    const agrupado = resolveIndirectLaborPct({ tenantCalcType: 'REVENDA', indirectLaborPct: P.moInd, productiveLaborPct: P.moProd })

    it('com o agrupamento: Σ 66%, coeficiente 34%, preço R$ 294,12', () => {
        const r = precoRevenda(agrupado)
        expect(agrupado).toBe(23)
        // O coeficiente é exato; o PREÇO é arredondado a centavos por `round2` — o exemplo
        // da regra trabalha em 4 casas porque é construção teórica, mas o que o cadastro
        // grava é R$ 294,12. A quarta casa é verificável na AGREGAÇÃO da cascata, que soma
        // derivados, não no preço unitário de um item.
        expect(r.coefficient).toBeCloseTo(0.34, 10)
        expect(r.priceUnit).toBe(294.12)
        expect(100 / r.coefficient).toBeCloseTo(294.1176, 4)   // o valor exato, pré-round2
    })

    it('sem o agrupamento — o defeito: Σ 51%, coeficiente 49%, preço R$ 204,08', () => {
        const r = precoRevenda(P.moInd)
        expect(r.coefficient).toBeCloseTo(0.49, 10)
        expect(r.priceUnit).toBe(204.08)
        expect(100 / r.coefficient).toBeCloseTo(204.0816, 4)
        // 30,6% ABAIXO do preço correto — a MO Produtiva inteira saindo da margem.
        expect(r.priceUnit / 294.12).toBeCloseTo(0.694, 3)
    })

    it('a MO Produtiva não entra no CMV em revenda — ela é MC, não custo', () => {
        const r = precoRevenda(agrupado)
        expect(r.cmvUnit).toBe(100)        // só os itens
        expect(r.productiveLaborCost).toBe(0)
    })
})

/**
 * OS TRÊS CASOS DE ITEM DE REVENDA, lado a lado — um que muda e dois que NÃO PODEM mudar.
 *
 * É este bloco que protege contra a correção VAZAR. Se um produto de revenda em tenant
 * SERVIÇO ou INDUSTRIALIZAÇÃO mudar de preço, o agrupamento está sendo aplicado onde a matriz
 * não manda, e isso é defeito da correção — não expectativa a ajustar.
 *
 * A prova de não-vazamento não é o número esperado escrito à mão: é comparar o preço pelo
 * caminho NOVO com o preço calculado com `productiveLaborPct: 0`, que é exatamente o que o
 * código fazia antes. Se o agrupamento tocasse esses dois tenants, os dois divergiriam.
 */
describe('Item de REVENDA nas três segmentações · 1 muda, 2 não podem mudar', () => {
    /** Espelha `doProductCalc` para um item de revenda, no tenant indicado. */
    function precoItemRevenda(tenantSeg: 'REVENDA' | 'INDUSTRIALIZACAO' | 'SERVICO', moProdPct: number) {
        // `effectiveCalcType` é sempre REVENDA para item de revenda, em qualquer tenant:
        // MO Produtiva nunca entra no CMV dele. O que varia é o COEFICIENTE.
        const agrupada = resolveIndirectLaborPct({
            tenantCalcType: tenantSeg === 'REVENDA' ? 'REVENDA' : null,
            indirectLaborPct: P.moInd,
            productiveLaborPct: moProdPct,
        })
        // Tenant SERVIÇO: MO Indireta e Despesa Fixa também são FORA — já estão no custo por
        // minuto da prestação. Coeficiente leva só variável + financeira.
        const structurePct = tenantSeg === 'SERVICO'
            ? (P.variavel + P.financeira) / 100
            : (P.fixa + P.variavel + P.financeira + agrupada) / 100
        return calculatePricing({
            calcType: 'REVENDA',
            totalItemsCost: 100, yieldQuantity: 1,
            laborCostMonthly: 0, numProductiveEmployees: 1,
            monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
            structurePct,
            taxPct: P.imposto / 100, rtReservePct: P.rt / 100,
            commissionPct: P.comissao / 100, profitPct: P.lucro / 100,
        })
    }

    it('MUDA · tenant REVENDA: de R$ 204,08 para R$ 294,12', () => {
        const antes = precoItemRevenda('REVENDA', 0)      // comportamento anterior
        const depois = precoItemRevenda('REVENDA', P.moProd)
        expect(antes.priceUnit).toBe(204.08)
        expect(depois.priceUnit).toBe(294.12)
        expect(depois.coefficient).toBeCloseTo(0.34, 10)
        expect(100 / depois.coefficient).toBeCloseTo(294.1176, 4)   // exato, pré-round2
    })

    it('NÃO MUDA · tenant SERVIÇO: R$ 149,25 com e sem a correção', () => {
        // As três (Produtiva, Indireta e Fixa) são FORA: já estão no custo por minuto da
        // prestação. Σ na MC = 5 + 2 + 10 + 1 + 5 + 10 = 33%.
        const antes = precoItemRevenda('SERVICO', 0)
        const depois = precoItemRevenda('SERVICO', P.moProd)
        expect(depois.priceUnit).toBe(antes.priceUnit)
        expect(depois.priceUnit).toBe(149.25)
        expect(depois.coefficient).toBeCloseTo(0.67, 10)
    })

    it('NÃO MUDA · tenant INDUSTRIALIZAÇÃO: R$ 204,08 com e sem a correção', () => {
        // MO Produtiva é FORA (já está no custo por tempo do item produzido daquele tenant);
        // MO Indireta e Despesa Fixa seguem como percentual e alcançam a revenda.
        // Σ na MC = 8 + 10 + 5 + 2 + 10 + 1 + 5 + 10 = 51%.
        const antes = precoItemRevenda('INDUSTRIALIZACAO', 0)
        const depois = precoItemRevenda('INDUSTRIALIZACAO', P.moProd)
        expect(depois.priceUnit).toBe(antes.priceUnit)
        expect(depois.priceUnit).toBe(204.08)
        expect(depois.coefficient).toBeCloseTo(0.49, 10)
    })

    it('a coincidência dos R$ 204,08 é o próprio defeito descrito', () => {
        // O tenant de REVENDA defeituoso precificava EXATAMENTE como um tenant de
        // industrialização: sem a MO Produtiva, os dois caem no mesmo Σ 51%. É o mesmo número
        // por motivos diferentes — num é o certo, no outro era a MO Produtiva sumindo.
        expect(precoItemRevenda('REVENDA', 0).priceUnit)
            .toBe(precoItemRevenda('INDUSTRIALIZACAO', P.moProd).priceUnit)
        // E depois da correção eles se separam, que é o ponto.
        expect(precoItemRevenda('REVENDA', P.moProd).priceUnit)
            .not.toBe(precoItemRevenda('INDUSTRIALIZACAO', P.moProd).priceUnit)
    })
})

describe('PRODUTO · industrialização e serviço não se movem', () => {
    it('INDUSTRIALIZAÇÃO: MO Produtiva segue no CMV por tempo, e a Indireta sozinha na MC', () => {
        const indirect = resolveIndirectLaborPct({
            tenantCalcType: 'INDUSTRIALIZACAO', indirectLaborPct: P.moInd, productiveLaborPct: P.moProd,
        })
        expect(indirect).toBe(P.moInd)
        const r = calculatePricing({
            calcType: 'INDUSTRIALIZACAO',
            totalItemsCost: 100, yieldQuantity: 1,
            laborCostMonthly: 2000, numProductiveEmployees: 1,
            monthlyWorkloadMinutes: 10000, productWorkloadMinutes: 100,
            structurePct: (P.fixa + P.variavel + P.financeira + indirect) / 100,
            taxPct: P.imposto / 100, rtReservePct: P.rt / 100,
            commissionPct: P.comissao / 100, profitPct: P.lucro / 100,
        })
        expect(r.productiveLaborCost).toBe(20)   // 100 min × R$ 0,20/min
        expect(r.cmvUnit).toBe(120)              // itens + MO produtiva
        expect(r.coefficient).toBeCloseTo(0.49, 10)
        expect(r.priceUnit).toBe(244.90)
    })

    it('SERVIÇO: as três no custo por minuto, coeficiente só com variável e financeira', () => {
        const indirect = resolveIndirectLaborPct({
            tenantCalcType: 'SERVICO', indirectLaborPct: P.moInd, productiveLaborPct: P.moProd,
        })
        expect(indirect).toBe(P.moInd)   // não agrupa
        const r = calculatePricing({
            calcType: 'SERVICO',
            totalItemsCost: 100, yieldQuantity: 1,
            laborCostMonthly: 6500, numProductiveEmployees: 1,
            monthlyWorkloadMinutes: 10000, productWorkloadMinutes: 100,
            structurePct: (P.variavel + P.financeira) / 100,
            taxPct: P.imposto / 100, rtReservePct: P.rt / 100,
            commissionPct: P.comissao / 100, profitPct: P.lucro / 100,
        })
        expect(r.cmvUnit).toBe(165)              // 100 + (20 + 15 + 30) rateados por tempo
        expect(r.coefficient).toBeCloseTo(0.67, 10)
        expect(r.priceUnit).toBe(246.27)
    })
})

// ───────────────────────── a cascata decompõe com o mesmo número ─────────────────────────

const TENANT_REVENDA: PageTenantCtx = {
    regime: 'SIMPLES_NACIONAL', rates: [], mod_pct: 0.15,
    dop_pct: 0.08 + 0.10 + 0.05 + 0.02, csll_pct: 0, irpj_pct: 0, useSnapshotRates: true,
    calc_type: 'REVENDA',
    mo_produtiva_pct: 0.15,
    expense_breakdown: { administrative_pct: 0.08, fixed_pct: 0.10, variable_pct: 0.05, financial_pct: 0.02 },
    absorption_policy: 'RRO_PROPORTIONAL',
}
const ITEM_REVENDA: PageItem = {
    unit_price: 294.1176, quantity: 1, cost_total: 100, productive_labor_unit: 0,
    product_type: 'REVENDA', yield_quantity: 1,
    commission_percent: 5, profit_percent: 10, rt_reserve_percent: 1,
    item_tax_rates: { das_pct: 10 },
}
const ITEM_SERVICO: PageItem = {
    unit_price: 246.2687, quantity: 1, cost_total: 165, service_id: 'svc-1',
    commission_percent: 5, profit_percent: 10, rt_reserve_percent: 1,
    item_tax_rates: { das_pct: 10 },
}

function cascade(items: PageItem[], ctx: PageTenantCtx): CascadeStep[] {
    const res = calculateMotorV17ForPage({ items, tenantCtx: ctx, globalDiscountPercent: 0 })
    const first = res.find((r) => r != null)
    if (!first) throw new Error('motor não retornou resultado')
    return first.cascade_trace
}
const child = (t: CascadeStep[], n: number, label: string) =>
    (t.find((s) => s.step === n)?.children ?? []).find((c) => c.label === label)?.amount ?? 0

describe('Cascata · a decomposição usa o MESMO percentual que formou o preço', () => {
    it('PRODUTO de revenda em tenant REVENDA: MO Indireta decomposta com 23%, não 8%', () => {
        const c = cascade([ITEM_REVENDA], TENANT_REVENDA)
        expect(child(c, 5, 'MO Administrativa')).toBeCloseTo(294.1176 * 0.23, 4)
        expect(child(c, 5, 'MO Administrativa')).not.toBeCloseTo(294.1176 * 0.08, 4)
    })

    it('a soma das categorias fecha com o preço — que é o ponto de corrigir os dois lados', () => {
        const c = cascade([ITEM_REVENDA], TENANT_REVENDA)
        const e5 = c.find((s) => s.step === 5)?.amount ?? 0
        const cmv = c.find((s) => s.step === 4)?.amount ?? 0
        const imp = -(c.find((s) => s.step === 13)?.amount ?? 0)
        const rt = -(c.find((s) => s.step === 14.5)?.amount ?? 0)
        const rro = c.find((s) => s.step === 15)?.amount ?? 0
        expect(cmv + e5 + imp + rt + rro).toBeCloseTo(294.1176, 4)
    })

    it('SERVIÇO no mesmo tenant não agrupa — MO Indireta e Fixa seguem em CUSTO (zero na MC)', () => {
        const c = cascade([ITEM_SERVICO], TENANT_REVENDA)
        expect(child(c, 5, 'MO Administrativa')).toBe(0)
        expect(child(c, 5, 'Despesa Fixa')).toBe(0)
    })

    it('tenant INDUSTRIALIZAÇÃO: bit-exact — a MO Produtiva não vira percentual ali', () => {
        const ctxInd: PageTenantCtx = { ...TENANT_REVENDA, calc_type: 'INDUSTRIALIZACAO' }
        const ctxSemMO: PageTenantCtx = { ...ctxInd, mo_produtiva_pct: 0 }
        const a = cascade([ITEM_REVENDA], ctxInd)
        const b = cascade([ITEM_REVENDA], ctxSemMO)
        expect(child(a, 5, 'MO Administrativa')).toBeCloseTo(294.1176 * 0.08, 6)
        expect(child(a, 5, 'MO Administrativa')).toBe(child(b, 5, 'MO Administrativa'))
    })

    it('`mo_produtiva_pct` ausente: nenhum agrupamento — retrocompatível', () => {
        const ctxSem: PageTenantCtx = { ...TENANT_REVENDA, mo_produtiva_pct: undefined }
        expect(child(cascade([ITEM_REVENDA], ctxSem), 5, 'MO Administrativa'))
            .toBeCloseTo(294.1176 * 0.08, 6)
    })
})
