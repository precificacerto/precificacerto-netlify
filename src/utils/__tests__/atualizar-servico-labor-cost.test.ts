/**
 * "Atualizar serviço" zerava `labor_cost`.
 *
 * `computeServiceSellingPrice` é o caminho paralelo ao `handleSave` da tela de cadastro,
 * usado pelo botão "Atualizar serviço" (`servicos/index.tsx`) e pela atualização em massa
 * a partir de um item (`itens/index.tsx`). Ele divergiu da tela em três pontos, e QUALQUER
 * um deles sozinho já zerava a mão de obra:
 *
 *  1. `productWorkloadMinutes` vinha de `serviceWorkloadMinutes ?? 0`, e os DOIS
 *     chamadores omitiam o campo — minutos 0, MO 0.
 *  2. `laborCostMonthly` usava só `production_labor_cost`, ignorando a média do Hub, a MO
 *     administrativa e as despesas fixas mensais. Os dois tenants em produção têm
 *     `production_labor_cost = 0`, então o custo por minuto era 0.
 *  3. `servicos/index.tsx` passava `currentUser: null` — sem carga horária não há divisor.
 *
 * Um quarto ponto NÃO zerava, mas cobrava duas vezes: `structurePct` incluía as despesas
 * fixas em percentual E o custo por minuto já as embute em reais.
 *
 * O PR #15 trocou o fallback de 176h pelo `resolve-monthly-workload` — mexeu no DIVISOR,
 * não na fonte do custo nem nos minutos. O defeito sobreviveu a ele.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import { computeServiceSellingPrice } from '@/utils/compute-service-price'

// Salão Eliane (MEI, calc_type SERVICO) — baseline capturado do banco ANTES da correção.
// tenant_settings: workload MINUTES 6000, 3 funcionários produtivos ⇒ 18.000 min/mês.
// tenant_expense_config: produtiva 0, Hub 0, admin 7.000, fixas 2.625/mês
//                        ⇒ combinado 9.625/mês ⇒ R$ 0,534722/min.
const ELIANE_CONFIG = {
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
const ELIANE_USER = {
    monthlyWorkloadInMinutes: 6000,
    unitMeasure: 'MINUTES',
    numProductiveSectorEmployee: 3,
}

/** Corte e Barba (d1a3af4f): 60 min, insumos R$ 3,97, comissão 40%, MEI ⇒ imposto 0. */
const CORTE_E_BARBA = {
    materialCost: 3.97,
    commissionPercent: 40,
    profitPercent: 0.43,
    taxableRegimePercent: 0,
    minutos: 60,
    // Gravado hoje pela tela de cadastro — a referência que "Atualizar serviço" tem que reproduzir.
    laborCostGravado: 32.08,
    costTotalGravado: 36.05,
}

function atualizar(over: Partial<Parameters<typeof computeServiceSellingPrice>[0]> = {}) {
    return computeServiceSellingPrice({
        materialCost: CORTE_E_BARBA.materialCost,
        commissionPercent: CORTE_E_BARBA.commissionPercent,
        profitPercent: CORTE_E_BARBA.profitPercent,
        taxableRegimePercent: CORTE_E_BARBA.taxableRegimePercent,
        expenseConfig: ELIANE_CONFIG,
        taxPreview: null,
        currentUser: ELIANE_USER,
        serviceWorkloadMinutes: CORTE_E_BARBA.minutos,
        ...over,
    })
}

describe('Atualizar serviço · SERVIÇO — labor_cost deixa de zerar', () => {
    it('reproduz o labor_cost que a tela de cadastro gravou', () => {
        expect(atualizar().laborCost).toBeCloseTo(CORTE_E_BARBA.laborCostGravado, 2)
    })

    it('reproduz o cost_total (CMV = materiais + MO), não só os materiais', () => {
        const r = atualizar()
        expect(r.totalCost).toBeCloseTo(CORTE_E_BARBA.costTotalGravado, 2)
        // O comportamento antigo gravava apenas os materiais.
        expect(r.totalCost).not.toBeCloseTo(CORTE_E_BARBA.materialCost, 2)
    })

    it('cada uma das três causas, sozinha, zerava a mão de obra', () => {
        // 1. minutos omitidos (era o default dos dois chamadores)
        expect(atualizar({ serviceWorkloadMinutes: undefined }).laborCost).toBe(0)
        // 2. só `production_labor_cost` — os dois tenants em produção têm 0 nele
        expect(atualizar({
            expenseConfig: {
                production_labor_cost: 0,
                variable_expense_percent: 1.29,
                financial_expense_percent: 0.37,
            },
        }).laborCost).toBe(0)
        // 3. sem currentUser não há carga horária
        expect(atualizar({ currentUser: null }).laborCost).toBe(0)
    })

    it('a média do Hub tem precedência sobre o valor manual', () => {
        const r = atualizar({
            expenseConfig: { ...ELIANE_CONFIG, production_labor_cost: 500, production_labor_cost_hub: 1000 },
        })
        // combinado = 1000 (Hub) + 7000 + 2625 = 10.625 ⇒ 10625/18000*60
        expect(r.laborCost).toBeCloseTo((10625 / 18000) * 60, 2)
    })

    it('as despesas fixas não são cobradas duas vezes', () => {
        // Estão no custo por minuto (R$/mês); não podem voltar no coeficiente (%).
        const comFixaAlta = atualizar({
            expenseConfig: { ...ELIANE_CONFIG, fixed_expense_percent: 50 },
        })
        const comFixaZero = atualizar({
            expenseConfig: { ...ELIANE_CONFIG, fixed_expense_percent: 0 },
        })
        expect(comFixaAlta.sellingPrice).toBe(comFixaZero.sellingPrice)
    })
})

describe('Atualizar serviço · PRODUTO no mesmo tenant — nada muda', () => {
    // O botão "Atualizar serviço" não toca em produtos: a atualização de produto passa
    // por `recalcSalePrice`/edge function, caminho distinto. O que se afirma aqui é que a
    // correção é local ao cálculo de serviço e não depende de nada do produto.
    it('serviço sem insumos ainda tem preço, vindo só da mão de obra', () => {
        const r = atualizar({ materialCost: 0 })
        expect(r.laborCost).toBeCloseTo(32.08, 2)
        expect(r.totalCost).toBeCloseTo(32.08, 2)
        expect(r.sellingPrice).toBeGreaterThan(0)
    })

    it('serviço só de insumos, sem duração, não inventa mão de obra', () => {
        const r = atualizar({ serviceWorkloadMinutes: 0 })
        expect(r.laborCost).toBe(0)
        expect(r.totalCost).toBeCloseTo(CORTE_E_BARBA.materialCost, 2)
    })
})

describe('Atualizar serviço · o preço acompanha o custo corrigido', () => {
    it('com a MO no CMV, o preço sobe em relação ao cálculo antigo', () => {
        const corrigido = atualizar()
        const antigo = atualizar({ serviceWorkloadMinutes: undefined })
        expect(corrigido.sellingPrice).toBeGreaterThan(antigo.sellingPrice)
    })

    it('preço = CMV ÷ (1 − Σ percentuais), à vírgula', () => {
        const r = atualizar()
        const soma = 1.29 + 0.37 + 40 + 0.43 // variável + financeira + comissão + lucro
        expect(r.sellingPrice).toBe(Math.round((r.totalCost / (1 - soma / 100)) * 100) / 100)
    })

    it('carga horária não configurada ⇒ MO zero, sem número inventado (PR #15)', () => {
        const r = atualizar({ currentUser: { monthlyWorkloadInMinutes: 0, unitMeasure: 'MINUTES', numProductiveSectorEmployee: 3 } })
        expect(r.laborCost).toBe(0)
    })
})
