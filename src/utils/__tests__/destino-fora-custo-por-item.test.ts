/**
 * O terceiro destino: FORA — e por que a fração de CUSTO precisa ser distinguida da de MC.
 *
 * ATÉ AQUI havia dois destinos: CUSTO e MARGEM. Faltava o terceiro, e a falta não aparecia
 * porque os dois lados numéricos coincidiam: uma categoria classificada como CUSTO já
 * contribuía com zero na linha da MC, que é o mesmo que FORA faz. A diferença está no OUTRO
 * lado — destino CUSTO soma a parcela ao CMV; destino FORA não a soma a lugar nenhum, porque
 * ela JÁ FOI ABSORVIDA POR OUTRO ITEM. Cobrá-la de novo é dupla incidência.
 *
 * **FORA NÃO É ZERO.** É ausência deliberada. Duas afirmações diferentes que davam o mesmo
 * número enquanto ninguém somava a parcela do lado do custo — e o lado do custo é justamente
 * onde o item de revenda dentro de um tenant de serviço vinha levando a MO Produtiva.
 *
 * ESCOPO DO LADO DO CUSTO (precisão do dono do produto, 02/09/2026): na cascata as categorias
 * PODEM CHEGAR AGRUPADAS DENTRO DO CUSTO.
 *
 *   > O objetivo da cascata é ENCONTRAR O RRO COM PRECISÃO; para isso basta o CUSTO TOTAL
 *   > correto e as DESPESAS DE MC corretas. A abertura por categoria dentro do custo é
 *   > AUDITORIA, não requisito de cálculo.
 *
 * Logo NÃO se decompõe o custo por minuto de volta em MO Produtiva + MO Indireta + Despesa
 * Fixa, e não há rastreio de fração por categoria: há uma pergunta de sim ou não sobre um
 * valor que o item já traz pronto. O que este PR garante é que CADA ITEM CONTRIBUA COM O
 * VALOR CERTO PARA O CUSTO E PARA A MC, conforme o seu destino — sem mudança de schema e sem
 * migração. Ver a última seção para o que essa redução muda, e não muda, no invariante 1.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    applyDopDestinations,
    conversionCostEntersCmv,
    resolveCategoryDestinations,
    resolveDopDestinations,
    type ItemConstruction,
} from '@/utils/expense-destination'
import { resolveItemCostUnit } from '@/utils/destination-snapshot'
import { resolveIndirectLaborPct } from '@/utils/indirect-labor-grouping'
import {
    calculateMotorV17ForPage,
    type PageBuildArgs,
    type PageItem,
    type PageTenantCtx,
} from '@/utils/mrm-engine-v17/legacy-adapter'
import type { CascadeStep } from '@/types/mrm'

// ─────────────────────────────── harness da cascata ───────────────────────────────

function cascade(items: PageItem[], tenantCtx: PageTenantCtx, discount = 0): CascadeStep[] {
    const args: PageBuildArgs = { items, tenantCtx, globalDiscountPercent: discount }
    const res = calculateMotorV17ForPage(args)
    const first = res.find((r) => r != null)
    if (!first) throw new Error('motor não retornou resultado')
    return first.cascade_trace
}

/** Etapa 4 — "Consolidação dos custos" = `cp_total`. É onde a parcela de conversão entra. */
const custoConsolidado = (t: CascadeStep[]) => t.find((s) => s.step === 4)?.amount ?? 0

function tenant(calcType: string): PageTenantCtx {
    return {
        regime: 'SIMPLES_NACIONAL',
        rates: [],
        mod_pct: 0,
        dop_pct: 0.08 + 0.06 + 0.0125 + 0.0036,
        csll_pct: 0,
        irpj_pct: 0,
        useSnapshotRates: true,
        calc_type: calcType,
        expense_breakdown: {
            administrative_pct: 0.08,
            fixed_pct: 0.06,
            variable_pct: 0.0125,
            financial_pct: 0.0036,
        },
        absorption_policy: 'RRO_PROPORTIONAL',
    }
}

/** Produto de REVENDA que TEM mão de obra produtiva cadastrada — R$ 20,00/un. */
const REVENDA: PageItem = {
    unit_price: 200,
    quantity: 1,
    cost_total: 80,
    productive_labor_unit: 20,
    product_type: 'REVENDA',
    yield_quantity: 1,
    commission_percent: 10,
    profit_percent: 15,
    rt_reserve_percent: 0,
    item_tax_rates: { das_pct: 6 },
}

/**
 * SERVIÇO cuja conversão chega AGREGADA: R$ 85,00 = 40,00 (MO Produtiva) + 15,00 (MO
 * Indireta) + 30,00 (Despesa Fixa), já somadas dentro do custo por minuto no momento em que
 * o preço foi formado. As três parcelas não são recuperáveis do dado gravado — e, por decisão
 * do dono do produto, não precisam ser.
 */
const SERVICO: PageItem = {
    unit_price: 300,
    quantity: 1,
    cost_total: 50,
    productive_labor_unit: 85,
    service_id: 'svc-1',
    commission_percent: 20,
    profit_percent: 10,
    rt_reserve_percent: 0,
    item_tax_rates: { das_pct: 6 },
}

/** Produto PRODUZIDO — industrialização. A conversão aqui é só MO Produtiva. */
const INDUSTRIALIZADO: PageItem = {
    unit_price: 400,
    quantity: 1,
    cost_total: 120,
    productive_labor_unit: 60,
    product_type: 'PRODUZIDO',
    yield_quantity: 1,
    commission_percent: 8,
    profit_percent: 12,
    rt_reserve_percent: 0,
    item_tax_rates: { das_pct: 6 },
}

// ────────────────────────────── 1. A matriz, célula a célula ──────────────────────────────

const CONSTRUCOES: ItemConstruction[] = ['REVENDA', 'INDUSTRIALIZACAO', 'SERVICO']
const SEGMENTOS = ['REVENDA', 'INDUSTRIALIZACAO', 'SERVICO']

describe('A matriz de destinos — as três construções × as três segmentações', () => {
    it('revenda em tenant de SERVIÇO: as três FORA (já estão no custo por minuto)', () => {
        expect(resolveCategoryDestinations('REVENDA', 'SERVICO')).toEqual({
            mo_produtiva: 'FORA',
            mo_indireta: 'FORA',
            despesa_fixa: 'FORA',
            despesa_variavel: 'MARGEM',
            despesa_financeira: 'MARGEM',
        })
    })

    it('revenda em tenant de INDUSTRIALIZAÇÃO: só a MO Produtiva é FORA', () => {
        // Ali só a MO Produtiva está no custo por tempo; MO Indireta e Despesa Fixa seguem
        // como percentual e alcançam a revenda normalmente.
        expect(resolveCategoryDestinations('REVENDA', 'INDUSTRIALIZACAO')).toEqual({
            mo_produtiva: 'FORA',
            mo_indireta: 'MARGEM',
            despesa_fixa: 'MARGEM',
            despesa_variavel: 'MARGEM',
            despesa_financeira: 'MARGEM',
        })
    })

    it('revenda em tenant de REVENDA (core): nada é FORA — a MO Produtiva vai para a MC', () => {
        const d = resolveCategoryDestinations('REVENDA', 'REVENDA')
        expect(d.mo_produtiva).toBe('MARGEM')
        expect(Object.values(d)).not.toContain('FORA')
    })

    it('serviço: as três são CUSTO, em qualquer tenant', () => {
        for (const seg of SEGMENTOS) {
            const d = resolveCategoryDestinations('SERVICO', seg)
            expect([d.mo_produtiva, d.mo_indireta, d.despesa_fixa]).toEqual(['CUSTO', 'CUSTO', 'CUSTO'])
        }
    })

    it('industrialização: MO Produtiva CUSTO, as outras duas MC, em qualquer tenant', () => {
        for (const seg of SEGMENTOS) {
            const d = resolveCategoryDestinations('INDUSTRIALIZACAO', seg)
            expect([d.mo_produtiva, d.mo_indireta, d.despesa_fixa]).toEqual(['CUSTO', 'MARGEM', 'MARGEM'])
        }
    })

    it('variável e financeira são MC nas nove células, sem exceção', () => {
        for (const c of CONSTRUCOES) {
            for (const seg of SEGMENTOS) {
                const d = resolveCategoryDestinations(c, seg)
                expect(d.despesa_variavel).toBe('MARGEM')
                expect(d.despesa_financeira).toBe('MARGEM')
            }
        }
    })
})

// ──────────────── 2. A premissa que autoriza o balde de conversão agregado ────────────────

describe('Por que UM destino basta para a conversão agregada', () => {
    /**
     * O balde de conversão carrega mais de uma categoria só quando o custo por minuto as
     * agregou — isto é, na construção SERVIÇO, e na revenda dentro de tenant de serviço, que
     * é a face acessória da mesma prestação. Nessas células as três compartilham o destino.
     * Nas demais, o balde carrega SÓ MO Produtiva, e o destino dela é o único que importa.
     *
     * Este teste é a guarda da premissa: se a matriz mudar de forma a separar os destinos
     * numa célula onde a conversão vem agregada, ele quebra — e aí a redução de escopo
     * deixaria de ser exata, o que precisa ser decidido, não descoberto em produção.
     */
    const conversaoVemAgregada = (c: ItemConstruction, seg: string) =>
        c === 'SERVICO' || (c === 'REVENDA' && seg === 'SERVICO')

    it('onde a conversão vem agregada, as três categorias têm o MESMO destino', () => {
        for (const c of CONSTRUCOES) {
            for (const seg of SEGMENTOS) {
                if (!conversaoVemAgregada(c, seg)) continue
                const d = resolveCategoryDestinations(c, seg)
                expect(new Set([d.mo_produtiva, d.mo_indireta, d.despesa_fixa]).size).toBe(1)
            }
        }
    })

    it('onde os destinos divergem, a conversão carrega só MO Produtiva', () => {
        for (const c of CONSTRUCOES) {
            for (const seg of SEGMENTOS) {
                const d = resolveCategoryDestinations(c, seg)
                const divergem = new Set([d.mo_produtiva, d.mo_indireta, d.despesa_fixa]).size > 1
                if (divergem) expect(conversaoVemAgregada(c, seg)).toBe(false)
            }
        }
    })
})

// ─────────────────── 3. FORA no lado do custo — onde ele deixa de ser zero ───────────────────

describe('conversionCostEntersCmv · FORA tira a conversão do CMV; CUSTO e MARGEM a mantêm', () => {
    const dest = (c: ItemConstruction, seg: string) => resolveCategoryDestinations(c, seg)

    it('serviço: a conversão inteira entra no CMV', () => {
        expect(conversionCostEntersCmv(dest('SERVICO', 'SERVICO'))).toBe(true)
        expect(resolveItemCostUnit({
            item: { service_id: 'svc-1' }, tenantCalcType: 'SERVICO', itemCost: 50, conversionCost: 85,
        }).costUnit).toBe(135)
    })

    it('revenda em tenant de serviço: NÃO entra — é FORA, não é zero por acaso', () => {
        expect(conversionCostEntersCmv(dest('REVENDA', 'SERVICO'))).toBe(false)
        expect(resolveItemCostUnit({
            item: { product_type: 'REVENDA' }, tenantCalcType: 'SERVICO', itemCost: 80, conversionCost: 20,
        }).costUnit).toBe(80)
    })

    it('revenda em tenant de industrialização: também FORA — a MO Produtiva já está no tempo', () => {
        expect(conversionCostEntersCmv(dest('REVENDA', 'INDUSTRIALIZACAO'))).toBe(false)
        expect(resolveItemCostUnit({
            item: { product_type: 'REVENDA' }, tenantCalcType: 'INDUSTRIALIZACAO', itemCost: 80, conversionCost: 20,
        }).costUnit).toBe(80)
    })

    it('o custo do item nunca é filtrado, em nenhuma das nove células', () => {
        for (const c of CONSTRUCOES) {
            for (const seg of SEGMENTOS) {
                const item = c === 'SERVICO'
                    ? { service_id: 'svc-1' }
                    : { product_type: c === 'INDUSTRIALIZACAO' ? 'PRODUZIDO' : 'REVENDA' }
                expect(resolveItemCostUnit({
                    item, tenantCalcType: seg, itemCost: 80, conversionCost: 0,
                }).costUnit).toBe(80)
            }
        }
    })

    it('LIMITE DESTE PR: destino MARGEM mantém a conversão — o agrupamento em revenda é o D-C', () => {
        // Em revenda core a MO Produtiva que vai para a MC é o PERCENTUAL DO TENANT, agrupado
        // com a MO Indireta — não o `productive_labor_unit` do produto. São fontes diferentes:
        // tirar esta daqui sem que ninguém a receba do outro lado mudaria preço sem defeito
        // que o justifique.
        const d = dest('REVENDA', 'REVENDA')
        expect(d.mo_produtiva).toBe('MARGEM')
        expect(conversionCostEntersCmv(d)).toBe(true)
        expect(resolveItemCostUnit({
            item: { product_type: 'REVENDA' }, tenantCalcType: 'REVENDA', itemCost: 80, conversionCost: 20,
        }).costUnit).toBe(100)
    })

    it('a função devolve também a construção e os destinos que usou', () => {
        // Quem chama recebe o número E a razão dele, para que o destino aplicado e o valor
        // resultante não possam divergir por descuido no ponto de chamada.
        const r = resolveItemCostUnit({
            item: { product_type: 'REVENDA' }, tenantCalcType: 'SERVICO', itemCost: 80, conversionCost: 20,
        })
        expect(r.construction).toBe('REVENDA')
        expect(r.destinations.mo_produtiva).toBe('FORA')
    })
})

describe('FORA no lado da MC · zero, igual a CUSTO — e é por isso que a falta não aparecia', () => {
    const comps = { mo_admin: 0.08, fixa: 0.06, variavel: 0.0125, financeira: 0.0036 }

    it('revenda em tenant de serviço: MO Admin e Fixa saem zeradas da MC (FORA)', () => {
        const r = applyDopDestinations(comps, resolveDopDestinations('REVENDA', 'SERVICO'))
        expect(r).toEqual({ mo_admin: 0, fixa: 0, variavel: 0.0125, financeira: 0.0036 })
    })

    it('serviço: as mesmas duas saem zeradas — mesmo número, destino OUTRO (CUSTO)', () => {
        const r = applyDopDestinations(comps, resolveDopDestinations('SERVICO', 'SERVICO'))
        expect(r).toEqual({ mo_admin: 0, fixa: 0, variavel: 0.0125, financeira: 0.0036 })
    })

    it('a distinção entre CUSTO e FORA só é observável do lado do custo', () => {
        // MC: idênticos.
        expect(applyDopDestinations(comps, resolveDopDestinations('SERVICO', 'SERVICO')))
            .toEqual(applyDopDestinations(comps, resolveDopDestinations('REVENDA', 'SERVICO')))
        // Custo: divergem, e é exatamente esta linha que o PR corrige.
        expect(conversionCostEntersCmv(resolveCategoryDestinations('SERVICO', 'SERVICO'))).toBe(true)
        expect(conversionCostEntersCmv(resolveCategoryDestinations('REVENDA', 'SERVICO'))).toBe(false)
    })
})

// ───────────────────────── 4. O efeito na cascata — produto e serviço ─────────────────────────

describe('Na cascata · Etapa 4 (Consolidação dos custos)', () => {
    it('SERVIÇO em tenant de serviço: custo = insumos + conversão agregada (50 + 85)', () => {
        expect(custoConsolidado(cascade([SERVICO], tenant('SERVICO')))).toBeCloseTo(135, 6)
    })

    it('REVENDA em tenant de serviço: custo = só a mercadoria (80) — a MO Produtiva é FORA', () => {
        expect(custoConsolidado(cascade([REVENDA], tenant('SERVICO')))).toBeCloseTo(80, 6)
    })

    it('REVENDA em tenant de industrialização: idem — 80, sem a conversão', () => {
        expect(custoConsolidado(cascade([REVENDA], tenant('INDUSTRIALIZACAO')))).toBeCloseTo(80, 6)
    })

    it('INDUSTRIALIZADO: a conversão é CUSTO e entra inteira (120 + 60)', () => {
        for (const seg of SEGMENTOS) {
            expect(custoConsolidado(cascade([INDUSTRIALIZADO], tenant(seg)))).toBeCloseTo(180, 6)
        }
    })

    it('o mesmo produto de revenda muda de custo conforme o TENANT, não conforme ele mesmo', () => {
        // O destino é propriedade da construção do item DENTRO daquela operação: o mesmo
        // cadastro leva a MO Produtiva ao CMV num tenant de revenda e não leva num de serviço.
        expect(custoConsolidado(cascade([REVENDA], tenant('REVENDA')))).toBeCloseTo(100, 6)
        expect(custoConsolidado(cascade([REVENDA], tenant('SERVICO')))).toBeCloseTo(80, 6)
    })

    it('orçamento MISTO: cada item com o seu destino, no mesmo consolidado', () => {
        // Serviço 135 (conversão dentro) + revenda 80 (conversão fora) = 215. Somar os dois
        // pela mesma regra daria 235 — vinte reais de dupla incidência.
        expect(custoConsolidado(cascade([SERVICO, REVENDA], tenant('SERVICO')))).toBeCloseTo(215, 6)
    })
})

describe('Sem colateral · o que não tem MO Produtiva não muda', () => {
    it('item sem conversão cadastrada: mesmo custo antes e depois, em todas as segmentações', () => {
        const semMod: PageItem = { ...REVENDA, productive_labor_unit: 0 }
        for (const seg of SEGMENTOS) {
            expect(custoConsolidado(cascade([semMod], tenant(seg)))).toBeCloseTo(80, 6)
        }
    })

    it('tenant sem `calc_type`: nenhuma exceção se aplica — a conversão entra no custo', () => {
        const semSegmento: PageTenantCtx = { ...tenant('SERVICO'), calc_type: null }
        expect(custoConsolidado(cascade([REVENDA], semSegmento))).toBeCloseTo(100, 6)
    })
})

// ──────── 5. Invariante 1 com o custo agrupado — oráculo canônico de 5 itens ────────

/**
 * ORÁCULO CANÔNICO — planilha "Cascata SIMPLES e MEI", 5 itens em 3 segmentações. Substitui
 * o da Seção 8 (3 itens), que era menor. É AGREGAÇÃO PURA: cada construção está no seu
 * próprio tenant e é correta ali; os itens são somados, não combinados numa matriz.
 *
 * DOIS CASOS DE DECOMPOSIÇÃO, sobre a MESMA construção — os 5 itens, os custos, as MCs, os
 * preços e o total 1.136,424719 são idênticos nos dois:
 *   · DESCONTO ZERO ... o invariante do espelho, que só é exato aqui.
 *   · DESCONTO 5% .... a absorção da Seção 6.3: imposto 10%, RT 1%, RRO 89%, custo e
 *                      despesas ZERO, porque são valores congelados e não encolhem.
 *
 * ESTRUTURA CERTIFICADA: Simples e MEI compartilham a MESMA cascata — mesmas categorias,
 * mesmo agrupamento por segmentação, mesma decomposição. O regime altera APENAS a alíquota
 * da linha de Impostos: no Simples vem do onboarding e é editável; no MEI é zero, sempre.
 * Não existe cascata de MEI e cascata de Simples; existe uma cascata, com uma linha que zera
 * — e a linha PERMANECE VISÍVEL exibindo 0,00%, porque zero exibido é diferente de linha
 * ausente, e foi a ausência de linha que produziu o D17.
 *
 * CONSEQUÊNCIA ACEITA do custo agrupado: o invariante continua dizendo QUANTO sobrou, mas
 * deixa de dizer QUAL categoria causou. No D17, saber que o excedente de 13,34 era exatamente
 * MO Administrativa 6,12 mais Despesa Fixa 7,25 foi o que identificou os culpados. Sem a
 * abertura temos o ALARME e não o ENDEREÇO: o diagnóstico exige um passo manual a mais.
 * Aceita, não objeção — a abertura por categoria dentro do custo é auditoria, não cálculo.
 */

/** Percentuais do tenant no oráculo, base 100. */
const O = {
    mo_produtiva: 15, mo_indireta: 8, despesa_fixa: 10,
    variavel: 5, financeira: 2, impostos: 10, rt: 1, comissao: 5, lucro: 10,
} as const

interface ItemOraculo {
    nome: string
    construcao: ItemConstruction
    /** Segmentação do tenant onde este item é correto — agregação pura. */
    segmento: string
    custo: number
    /** MO Produtiva por tempo, quando a construção a leva ao custo. */
    conversao: number
    /** MO Indireta e Despesa Fixa em R$ — só o serviço as tem no custo. */
    indiretaCusto: number
    fixaCusto: number
}

const ORACULO: ItemOraculo[] = [
    { nome: 'Produto 1', construcao: 'INDUSTRIALIZACAO', segmento: 'INDUSTRIALIZACAO', custo: 100, conversao: 20, indiretaCusto: 0, fixaCusto: 0 },
    { nome: 'Produto 4', construcao: 'INDUSTRIALIZACAO', segmento: 'INDUSTRIALIZACAO', custo: 85, conversao: 15, indiretaCusto: 0, fixaCusto: 0 },
    { nome: 'Produto 2', construcao: 'REVENDA', segmento: 'REVENDA', custo: 100, conversao: 0, indiretaCusto: 0, fixaCusto: 0 },
    { nome: 'Produto 5', construcao: 'REVENDA', segmento: 'REVENDA', custo: 50, conversao: 0, indiretaCusto: 0, fixaCusto: 0 },
    { nome: 'Produto 3', construcao: 'SERVICO', segmento: 'SERVICO', custo: 100, conversao: 20, indiretaCusto: 15, fixaCusto: 30 },
]

const itemDe = (o: ItemOraculo) => o.construcao === 'SERVICO'
    ? { service_id: 'svc' }
    : { product_type: o.construcao === 'INDUSTRIALIZACAO' ? 'PRODUZIDO' : 'REVENDA' }

/** CMV do item, com o destino resolvido PELO CÓDIGO — não por número escrito à mão. */
function cmvDoOraculo(o: ItemOraculo): number {
    const base = resolveItemCostUnit({
        item: itemDe(o), tenantCalcType: o.segmento, itemCost: o.custo, conversionCost: o.conversao,
    }).costUnit
    return base + o.indiretaCusto + o.fixaCusto
}

/**
 * Percentual da MC do item, construído a partir da MATRIZ DE DESTINOS — cada categoria só
 * entra se o destino dela, para este item, for MARGEM. É a ponte entre o oráculo e o código:
 * se a matriz mudar, o coeficiente muda e o preço deixa de bater.
 */
function mcPctDoOraculo(o: ItemOraculo): number {
    const d = resolveCategoryDestinations(o.construcao, o.segmento)
    const naMc = (destino: string, pct: number) => (destino === 'MARGEM' ? pct : 0)
    // Em revenda, MO Produtiva e MO Indireta são UMA categoria só (15 + 8 = 23).
    const moAgrupada = resolveIndirectLaborPct({
        tenantCalcType: o.segmento, indirectLaborPct: O.mo_indireta, productiveLaborPct: O.mo_produtiva,
    })
    return naMc(d.mo_indireta, moAgrupada)
        + naMc(d.despesa_fixa, O.despesa_fixa)
        + naMc(d.despesa_variavel, O.variavel)
        + naMc(d.despesa_financeira, O.financeira)
        + O.impostos + O.rt + O.comissao + O.lucro
}

const precoDoOraculo = (o: ItemOraculo) => cmvDoOraculo(o) / (1 - mcPctDoOraculo(o) / 100)

const PRECOS = ORACULO.map(precoDoOraculo)
const TOTAL = PRECOS.reduce((a, b) => a + b, 0)
const CMV_CONSOLIDADO = ORACULO.reduce((a, o) => a + cmvDoOraculo(o), 0)
const sobreTotal = (pct: number) => TOTAL * (pct / 100)

describe('Oráculo canônico · bloco CUSTO — 5 itens, CMV consolidado 535', () => {
    it('cada item leva ao CMV exatamente o que o destino manda', () => {
        expect(ORACULO.map(cmvDoOraculo)).toEqual([120, 100, 100, 50, 165])
    })

    it('MO Produtiva no custo: industrialização e serviço sim, revenda NÃO', () => {
        // "Não considerar no custo" para revenda, nas duas formas que a matriz tem de dizê-lo:
        // MARGEM quando é o core business do tenant, FORA quando é item acessório.
        expect(resolveCategoryDestinations('INDUSTRIALIZACAO', 'INDUSTRIALIZACAO').mo_produtiva).toBe('CUSTO')
        expect(resolveCategoryDestinations('SERVICO', 'SERVICO').mo_produtiva).toBe('CUSTO')
        expect(resolveCategoryDestinations('REVENDA', 'REVENDA').mo_produtiva).toBe('MARGEM')
        expect(resolveCategoryDestinations('REVENDA', 'SERVICO').mo_produtiva).toBe('FORA')
        expect(resolveCategoryDestinations('REVENDA', 'INDUSTRIALIZACAO').mo_produtiva).toBe('FORA')
    })

    it('MO Indireta e Despesa Fixa no custo: SÓ no serviço', () => {
        for (const c of ['INDUSTRIALIZACAO', 'REVENDA'] as ItemConstruction[]) {
            const d = resolveCategoryDestinations(c, c)
            expect([d.mo_indireta, d.despesa_fixa]).toEqual(['MARGEM', 'MARGEM'])
        }
        const s = resolveCategoryDestinations('SERVICO', 'SERVICO')
        expect([s.mo_indireta, s.despesa_fixa]).toEqual(['CUSTO', 'CUSTO'])
    })

    it('custo consolidado 535', () => {
        expect(CMV_CONSOLIDADO).toBe(535)
    })
})

describe('Oráculo canônico · bloco MC — coeficientes e preços', () => {
    it('MC por item 0,49 / 0,49 / 0,34 / 0,34 / 0,67, derivada da matriz', () => {
        const coefs = ORACULO.map((o) => 1 - mcPctDoOraculo(o) / 100)
        coefs.forEach((k, i) => expect(k).toBeCloseTo([0.49, 0.49, 0.34, 0.34, 0.67][i], 10))
    })

    it('MO Produtiva NÃO EXISTE na MC de industrialização nem de serviço', () => {
        // Confirma a Seção 3: no agrupamento consolidado ela não aparece como linha da MC —
        // ali ela é custo por tempo. Só existe na MC em revenda, e ainda assim agrupada.
        for (const c of ['INDUSTRIALIZACAO', 'SERVICO'] as ItemConstruction[]) {
            expect(resolveCategoryDestinations(c, c).mo_produtiva).not.toBe('MARGEM')
        }
        expect(resolveIndirectLaborPct({
            tenantCalcType: 'REVENDA', indirectLaborPct: O.mo_indireta, productiveLaborPct: O.mo_produtiva,
        })).toBe(23)
        expect(resolveIndirectLaborPct({
            tenantCalcType: 'INDUSTRIALIZACAO', indirectLaborPct: O.mo_indireta, productiveLaborPct: O.mo_produtiva,
        })).toBe(8)
    })

    it('preços 244,897959 / 204,081633 / 294,117647 / 147,058824 / 246,268657', () => {
        const esperado = [244.897959, 204.081633, 294.117647, 147.058824, 246.268657]
        PRECOS.forEach((p, i) => expect(p).toBeCloseTo(esperado[i], 6))
    })

    it('total 1.136,424719', () => {
        expect(TOTAL).toBeCloseTo(1136.424719, 6)
    })

    it('linhas da MC consolidadas', () => {
        const moIndMc = ORACULO.reduce((acc, o, i) => {
            const d = resolveCategoryDestinations(o.construcao, o.segmento)
            if (d.mo_indireta !== 'MARGEM') return acc
            return acc + PRECOS[i] * (resolveIndirectLaborPct({
                tenantCalcType: o.segmento, indirectLaborPct: O.mo_indireta, productiveLaborPct: O.mo_produtiva,
            }) / 100)
        }, 0)
        const fixaMc = ORACULO.reduce((acc, o, i) => (
            resolveCategoryDestinations(o.construcao, o.segmento).despesa_fixa === 'MARGEM'
                ? acc + PRECOS[i] * (O.despesa_fixa / 100)
                : acc
        ), 0)
        expect(moIndMc).toBeCloseTo(137.388956, 6)
        expect(fixaMc).toBeCloseTo(89.015606, 6)
        expect(sobreTotal(O.variavel)).toBeCloseTo(56.821236, 6)
        expect(sobreTotal(O.financeira)).toBeCloseTo(22.728494, 6)
        expect(sobreTotal(O.impostos)).toBeCloseTo(113.642472, 6)
        expect(sobreTotal(O.rt)).toBeCloseTo(11.364247, 6)
        expect(sobreTotal(O.comissao)).toBeCloseTo(56.821236, 6)
        expect(sobreTotal(O.lucro)).toBeCloseTo(113.642472, 6)
    })
})

describe('Oráculo canônico · decomposição com DESCONTO ZERO — os quatro invariantes', () => {
    const IMPOSTO = sobreTotal(O.impostos)
    const DESPESAS = 137.388956 + 89.015606 + 56.821236 + 22.728494
    const RT_VALOR = sobreTotal(O.rt)
    const RRO = sobreTotal(O.comissao) + sobreTotal(O.lucro)

    it('INVARIANTE 1 · soma vertical fecha em 1.136,424719 — 100,0000%', () => {
        // Imposto + Custo + Despesas + RT + RRO. O custo entra AGRUPADO, numa linha só, e o
        // fechamento não se move: a partição é mais grossa, o total é o mesmo.
        expect(DESPESAS).toBeCloseTo(305.954292, 6)
        expect(IMPOSTO + CMV_CONSOLIDADO + DESPESAS + RT_VALOR + RRO).toBeCloseTo(1136.424719, 5)
        const soma = IMPOSTO + CMV_CONSOLIDADO + DESPESAS + RT_VALOR + RRO
        expect((soma / TOTAL) * 100).toBeCloseTo(100, 6)
    })

    /**
     * INVARIANTE 2 — O QUE ELE AFIRMA, E O QUE NÃO AFIRMA.
     *
     * Formulação do dono do produto, registrada como está:
     *
     *   > Com desconto zero, Etapa 6 e Etapa 16 coincidem NO VALOR; o percentual efetivo pode
     *   > divergir na quarta casa por arredondamento em cadeia. O INVARIANTE 2 VALE PARA O
     *   > VALOR.
     *
     * LIMITAÇÃO CONHECIDA, NÃO DEFEITO ABERTO. Observado em produção (ORC-2356, 02/09,
     * desconto 0%): a Etapa 6 exibe comissão efetiva 50,00% e a Etapa 16 exibe 49,9998%,
     * enquanto o VALOR é R$ 175,00 nos dois lados. A Etapa 6 aplica o percentual direto sobre
     * a âncora; a Etapa 16 chega ao mesmo número por subtração e redistribuição, e o resíduo
     * fracionário da cadeia aparece na quarta casa do percentual — nunca no valor, que
     * arredonda para o mesmo centavo.
     *
     * A CAUSA, IDENTIFICADA E MEDIDA — não é vaga, tem origem exata: o `round2` DO PREÇO DE
     * VENDA. O preço é formado por `CMV ÷ coeficiente` e depois arredondado para centavos,
     * mas o CMV continua sendo o exato. No item de R$ 4,62 do ORC-2356, com custo R$ 0,85 e
     * coeficiente 18,39%:
     *
     *   preço exato    = 0,85 ÷ 0,1839 = R$ 4,622077…   ← o que a construção produziu
     *   preço exibido  = round2(4,622077) = R$ 4,62      ← o que a cascata recebe
     *   custo implícito em 4,62 = 4,62 × 0,1839 = R$ 0,849618
     *   RESÍDUO = 0,850000 − 0,849618 = R$ 0,000382
     *
     * Esses R$ 0,000382 de custo NÃO CABEM NO PREÇO ARREDONDADO. Como custo e despesas são
     * subtraídos e o RRO é o que sobra, o resíduo entra no RRO e desloca os percentuais
     * efetivos — na quarta casa, e independentemente de quanta precisão a redistribuição use.
     *
     * TRÊS CENÁRIOS MEDIDOS, que é o que separa as hipóteses:
     *
     *   1. hoje, com os arredondados ......... RRO 3,690000 → comissão 4,9919%, lucro 74,8782%
     *   2. RRO exato, a partir de R$ 4,62 .... RRO 3,695585 → comissão 4,9994%, lucro 74,9916%
     *   3. tudo exato, de R$ 4,622077 ........ RRO 3,697662 → comissão 5,0000%, lucro 75,0000%
     *
     * POR QUE NÃO É CORRIGIDO: redistribuir o RRO com precisão total leva ao CENÁRIO 2, não
     * ao 3 — melhora a quarta casa e NÃO CRAVA, porque o erro está A MONTANTE, no preço. E o
     * motor já redistribui em precisão plena: não há `Math.round` monetário em `absorption.ts`,
     * `motor-rro.ts`, `consolidate.ts` nem `cascade-trace.ts`. Cravar em 5,0000% exigiria a
     * cascata operar sobre o preço NÃO arredondado — e o preço de venda tem que ser em
     * centavos. Derivar o percentual da Etapa 16 do valor já arredondado, por sua vez, mexeria
     * no lucro da Etapa 6 e TROCARIA A DIVERGÊNCIA DE LADO em vez de eliminá-la.
     *
     * O fechamento em 100,0029% em vez de 100,0000% é ESTA MESMA LIMITAÇÃO VISTA DE OUTRO
     * LUGAR, e não item de correção próprio.
     *
     * TOLERÂNCIA DECLARADA. A asserção FORTE é o valor, à sexta casa. O percentual é asserido
     * com tolerância de 1e-3 ponto percentual, e a tolerância está escrita aqui com a sua
     * origem — arredondamento em cadeia na decomposição — para que ninguém a leia depois como
     * um epsilon solto de procedência esquecida.
     */
    it('INVARIANTE 2 · o VALOR é o que fecha: RRO 170,463708 dos dois lados', () => {
        // Construção: comissão + lucro apurados item a item. Decomposição: o que sobra depois
        // de imposto, custo, despesas e RT. Com desconto zero os dois lados coincidem.
        const construcao = sobreTotal(O.comissao) + sobreTotal(O.lucro)
        const decomposicao = TOTAL - IMPOSTO - CMV_CONSOLIDADO - DESPESAS - RT_VALOR
        expect(construcao).toBeCloseTo(170.463708, 6)
        expect(decomposicao).toBeCloseTo(170.463708, 5)
        expect(construcao).toBeCloseTo(decomposicao, 5)
    })

    it('INVARIANTE 2 · o PERCENTUAL vale com tolerância declarada de 1e-3 p.p.', () => {
        // Origem da tolerância: arredondamento em cadeia na decomposição. A Etapa 6 divide um
        // valor construído; a Etapa 16 divide um valor obtido por subtrações sucessivas. Os
        // dois descrevem o mesmo dinheiro e podem diferir na quarta casa do percentual.
        const TOLERANCIA_PP = 1e-3
        const pctConstrucao = ((sobreTotal(O.comissao) + sobreTotal(O.lucro)) / TOTAL) * 100
        const pctDecomposicao = ((TOTAL - IMPOSTO - CMV_CONSOLIDADO - DESPESAS - RT_VALOR) / TOTAL) * 100
        expect(Math.abs(pctConstrucao - pctDecomposicao)).toBeLessThanOrEqual(TOLERANCIA_PP)

        // E o valor, que é a asserção forte, continua fechando muito além dessa tolerância.
        expect(Math.abs(
            (sobreTotal(O.comissao) + sobreTotal(O.lucro))
            - (TOTAL - IMPOSTO - CMV_CONSOLIDADO - DESPESAS - RT_VALOR),
        )).toBeLessThan(0.00001)
    })

    it('INVARIANTE 3 · pesos 1/3 e 2/3 preservados na divisão do RRO', () => {
        expect(sobreTotal(O.comissao) / RRO).toBeCloseTo(1 / 3, 12)
        expect(sobreTotal(O.lucro) / RRO).toBeCloseTo(2 / 3, 12)
    })

    it('INVARIANTE 4 · CSLL e IRPJ zerados, apuração final zero', () => {
        // Simples/MEI: os dois são zero por regime, e o Total Final da Apuração fecha em zero.
        expect(RRO - sobreTotal(O.comissao) - sobreTotal(O.lucro)).toBeCloseTo(0, 10)
    })

    it('a RT incide sobre o TOTAL, não sobre o saldo', () => {
        // 1% de 1.136,424719, e não 1% do que restou depois de imposto e custo.
        expect(RT_VALOR).toBeCloseTo(11.364247, 6)
        expect(RT_VALOR).not.toBeCloseTo((TOTAL - IMPOSTO - CMV_CONSOLIDADO) * 0.01, 4)
    })

    it('CUSTO E DESPESAS NÃO TÊM BASE PERCENTUAL — são congelados', () => {
        // A versão anterior da planilha exibia os saldos do encadeamento (1.022,782247 na
        // linha do Custo, 487,782247 na de Despesas) na mesma coluna que as bases de cálculo,
        // e era fácil lê-los como base. A versão corrigida separa quatro colunas — Percentual
        // efetivo, Valor base, Valor efetivo base de cálculo e Resultado — e deixa o
        // PERCENTUAL EFETIVO VAZIO nas linhas de Custo e Despesas, tornando explícito o que
        // aqui é asserido: elas não derivam de percentual nenhum.
        expect(TOTAL - IMPOSTO).toBeCloseTo(1022.782247, 5)
        expect(TOTAL - IMPOSTO - CMV_CONSOLIDADO).toBeCloseTo(487.782247, 5)
        // A prova de que não é base: o custo é 535 fixo, e continuaria 535 se o total fosse
        // outro — é o que o teste de desconto abaixo demonstra, com o total mudando e ele não.
        expect(CMV_CONSOLIDADO).toBe(535)
        expect(CMV_CONSOLIDADO / (TOTAL - IMPOSTO)).not.toBeCloseTo(0.10, 2)
    })
})

// ──────────────────── Decomposição com DESCONTO DE 5% — a absorção ────────────────────

/**
 * Segundo caso do oráculo canônico, MESMA CONSTRUÇÃO: os 5 itens, os custos, as MCs, os
 * preços e o total 1.136,424719 são idênticos aos do caso de desconto zero, e o consolidado
 * também. O que muda é só a decomposição.
 *
 * É a Seção 6.3 da regra reproduzida com outro conjunto de dados: o desconto NÃO é rateado
 * por igual entre as linhas. Custo e despesas são valores CONGELADOS em R$ — não encolhem
 * com o desconto, absorvem ZERO dele. Quem absorve são as linhas percentuais, e o RRO,
 * sendo o resíduo, absorve quase tudo: 89%.
 */
describe('Oráculo canônico · decomposição com DESCONTO DE 5% — a absorção', () => {
    const DESCONTO = sobreTotal(5)
    const BASE_POS = TOTAL - DESCONTO
    const IMPOSTO_D = BASE_POS * (O.impostos / 100)
    const RT_D = BASE_POS * (O.rt / 100)
    const DESPESAS_CONGELADAS = 305.954292
    const RRO_D = BASE_POS - IMPOSTO_D - CMV_CONSOLIDADO - DESPESAS_CONGELADAS - RT_D

    it('desconto 56,821236 e base pós-desconto 1.079,603483', () => {
        expect(DESCONTO).toBeCloseTo(56.821236, 6)
        expect(BASE_POS).toBeCloseTo(1079.603483, 6)
    })

    it('as linhas percentuais recalculam sobre a base pós-desconto', () => {
        expect(IMPOSTO_D).toBeCloseTo(107.960348, 6)
        expect(RT_D).toBeCloseTo(10.796035, 6)
    })

    it('custo e despesas NÃO se movem com o desconto — são congelados', () => {
        // O total caiu 5% e estes dois continuam exatamente onde estavam. É a diferença entre
        // valor congelado e referência viva, escrita em número.
        expect(CMV_CONSOLIDADO).toBe(535)
        expect(DESPESAS_CONGELADAS).toBeCloseTo(305.954292, 6)
    })

    it('RRO 119,892808, dividido em 39,964269 e 79,928539 — pesos 1/3 e 2/3 preservados', () => {
        expect(RRO_D).toBeCloseTo(119.892808, 5)
        expect(RRO_D / 3).toBeCloseTo(39.964269, 5)
        expect((RRO_D * 2) / 3).toBeCloseTo(79.928539, 5)
    })

    it('soma vertical com desconto: desconto + imposto + custo + despesas + RT + RRO = total', () => {
        const soma = DESCONTO + IMPOSTO_D + CMV_CONSOLIDADO + DESPESAS_CONGELADAS + RT_D + RRO_D
        expect(soma).toBeCloseTo(1136.424719, 5)
    })

    it('ABSORÇÃO · imposto 10%, RT 1%, RRO 89%, custo ZERO, despesas ZERO', () => {
        // Seção 6.3. As três parcelas absorvidas somam o desconto inteiro, e as duas
        // congeladas não participam. 89% é a assinatura do RRO como resíduo.
        const pct = (antes: number, depois: number) => ((antes - depois) / DESCONTO) * 100
        expect(pct(sobreTotal(O.impostos), IMPOSTO_D)).toBeCloseTo(10, 4)
        expect(pct(sobreTotal(O.rt), RT_D)).toBeCloseTo(1, 4)
        expect(pct(170.463708, RRO_D)).toBeCloseTo(89, 4)
        expect(pct(CMV_CONSOLIDADO, CMV_CONSOLIDADO)).toBe(0)
        expect(pct(DESPESAS_CONGELADAS, DESPESAS_CONGELADAS)).toBe(0)

        // Em R$, e fechando no desconto inteiro: nada some, nada sobra.
        const absorvido = (sobreTotal(O.impostos) - IMPOSTO_D)
            + (sobreTotal(O.rt) - RT_D)
            + (170.463708 - RRO_D)
        expect(sobreTotal(O.impostos) - IMPOSTO_D).toBeCloseTo(5.682124, 5)
        expect(sobreTotal(O.rt) - RT_D).toBeCloseTo(0.568212, 5)
        expect(170.463708 - RRO_D).toBeCloseTo(50.570900, 5)
        expect(absorvido).toBeCloseTo(DESCONTO, 5)
    })

    it('DUAS MEDIDAS, NÃO DUAS VERSÕES · 5% e 10% planejados; 3,7018% e 7,4035% restantes', () => {
        // Os dois pares NÃO são versões concorrentes do mesmo dado, e a divergência não é
        // defeito. 5% e 10% são o DETERMINADO NA CONSTRUÇÃO. 3,7018% e 7,4035% são o
        // EFETIVAMENTE RESTANTE APÓS O DESCONTO NEGOCIADO, calculados sobre o valor
        // recalculado. A comparação entre as duas pontas É A INFORMAÇÃO ÚTIL: mostra quanto a
        // negociação custou em margem. Não normalizar, não escolher uma das duas.
        const efetivo = (v: number) => (v / BASE_POS) * 100
        expect(efetivo(RRO_D / 3)).toBeCloseTo(3.7018, 4)
        expect(efetivo((RRO_D * 2) / 3)).toBeCloseTo(7.4035, 4)
        expect(O.comissao).toBe(5)
        expect(O.lucro).toBe(10)

        // A PROPORCIONALIDADE atravessa: 1 para 2 na construção, 1 para 2 no que restou.
        expect(efetivo((RRO_D * 2) / 3) / efetivo(RRO_D / 3)).toBeCloseTo(2, 6)
        expect(O.lucro / O.comissao).toBe(2)
    })

    it('o que a negociação custou em margem é exatamente o que o RRO absorveu', () => {
        // Fecha o círculo entre as duas medidas e a absorção: a diferença entre o planejado e
        // o restante, em R$, é os 89% do desconto que o RRO absorveu — 16,856967 de comissão
        // mais 33,713933 de lucro dão os 50,570900.
        const custouComissao = sobreTotal(O.comissao) - RRO_D / 3
        const custouLucro = sobreTotal(O.lucro) - (RRO_D * 2) / 3
        expect(custouComissao).toBeCloseTo(16.856967, 5)
        expect(custouLucro).toBeCloseTo(33.713933, 5)
        expect(custouComissao + custouLucro).toBeCloseTo(50.570900, 5)
        expect(custouComissao + custouLucro).toBeCloseTo(DESCONTO * 0.89, 5)
    })

    it('a coluna Resultado é ENCADEAMENTO e termina em ZERO', () => {
        // 1.079,603483 → 971,643135 → 436,643135 → 130,688843 → 119,892808 → 0. Cada valor é
        // o anterior menos a linha; o zero final é o Total Final da Apuração, com CSLL e IRPJ
        // zerados. Encadeamento, não base de cálculo — as linhas de Custo e Despesas entram
        // aqui com Percentual efetivo VAZIO.
        const cadeia = [
            BASE_POS,
            BASE_POS - IMPOSTO_D,
            BASE_POS - IMPOSTO_D - CMV_CONSOLIDADO,
            BASE_POS - IMPOSTO_D - CMV_CONSOLIDADO - DESPESAS_CONGELADAS,
            BASE_POS - IMPOSTO_D - CMV_CONSOLIDADO - DESPESAS_CONGELADAS - RT_D,
            BASE_POS - IMPOSTO_D - CMV_CONSOLIDADO - DESPESAS_CONGELADAS - RT_D - RRO_D,
        ]
        const esperado = [1079.603483, 971.643135, 436.643135, 130.688843, 119.892808, 0]
        cadeia.forEach((v, i) => expect(v).toBeCloseTo(esperado[i], 5))
    })

    it('CSLL e IRPJ zerados: o resíduo é exatamente comissão + lucro', () => {
        expect(RRO_D - RRO_D / 3 - (RRO_D * 2) / 3).toBeCloseTo(0, 10)
    })
})

describe('A mesma categoria nos dois destinos — o que o agrupamento NÃO junta', () => {
    it('MO Indireta é CUSTO no serviço e MC nos outros, e as duas não se somam numa linha', () => {
        // No oráculo: 15,00 dentro do CMV do serviço, e 137,388956 na linha da MC vinda dos
        // outros quatro. Somá-las daria um número que não corresponde a destino nenhum. O
        // agrupamento é DENTRO do CMV; ele não junta o que está em destinos diferentes.
        const noCusto = 15
        const naMc = 137.388956
        expect(cmvDoOraculo(ORACULO[4])).toBe(100 + 20 + noCusto + 30)
        expect(naMc).toBeGreaterThan(0)
        expect(noCusto + naMc).not.toBeCloseTo(naMc, 6)
    })

    it('a dupla contagem continua detectável com o custo agrupado', () => {
        // Se uma categoria fosse contada nos dois lados, a soma vertical passaria de 100% —
        // independentemente de o CMV estar aberto em três linhas ou fechado em uma.
        const soma = sobreTotal(O.impostos) + CMV_CONSOLIDADO + 305.954292 + sobreTotal(O.rt)
            + sobreTotal(O.comissao) + sobreTotal(O.lucro)
        expect((soma / TOTAL) * 100).toBeCloseTo(100, 5)
        expect(((soma + 15) / TOTAL) * 100).toBeGreaterThan(100)
    })
})
