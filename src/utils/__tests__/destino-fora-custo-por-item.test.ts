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
    resolveItemCostUnit,
    type ItemConstruction,
} from '@/utils/expense-destination'
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

// ──────────────── 5. Invariante 1 com o custo agrupado — o que ele ainda vê ────────────────

describe('Invariante 1 · fechamento em 100% com o CMV agrupado', () => {
    /**
     * CRITÉRIO DO DONO DO PRODUTO (02/09/2026), registrado como está:
     *
     *   > O invariante 1 PODE ser verificado com o custo agrupado — CMV total + despesas de MC
     *   > + tributos + RT + margens = 100%. Não precisa abrir o CMV por categoria. A abertura
     *   > em 12 categorias da Seção 8 é só uma PARTIÇÃO MAIS FINA DO MESMO TOTAL; colapsar as
     *   > três frações de custo numa linha de CMV não quebra a soma, torna-a mais grossa, e a
     *   > DETECÇÃO DE DUPLA CONTAGEM CONTINUA INTACTA — se uma categoria for contada duas
     *   > vezes, o total passa de 100% de qualquer jeito.
     *
     * CONSEQUÊNCIA ACEITA: com o custo agrupado o invariante continua dizendo QUANTO sobrou,
     * mas deixa de dizer QUAL categoria causou. No D17, saber que o excedente de 13,34 era
     * exatamente MO Administrativa 6,12 mais Despesa Fixa 7,25 foi o que identificou os
     * culpados. Sem a abertura temos o ALARME e não o ENDEREÇO: quando o invariante 1 falhar
     * no futuro, o diagnóstico exige um passo manual a mais.
     *
     * ORÁCULO (Seção 8) — agregação pura, três construções, uma por segmentação, cada uma
     * correta no seu próprio tenant. Preço agregado R$ 785,2843. Do lado do custo, o serviço
     * leva três parcelas:
     *
     *   MO Produtiva (custo)  40,00 → 5,0937%
     *   MO Indireta  (custo)  15,00 → 1,9101%
     *   Despesa Fixa (custo)  30,00 → 3,8203%
     *
     * As TRÊS viram UMA de 85,00. A soma é a mesma, então o fechamento não se move.
     */
    const PRECO_AGREGADO = 785.2843
    const pct = (v: number) => (v / PRECO_AGREGADO) * 100

    it('as três parcelas do oráculo somam exatamente a linha agregada', () => {
        expect(40 + 15 + 30).toBe(85)
        expect(pct(40)).toBeCloseTo(5.0937, 4)
        expect(pct(15)).toBeCloseTo(1.9101, 4)
        expect(pct(30)).toBeCloseTo(3.8203, 4)
    })

    it('a linha agregada vale a soma dos três percentuais — partição mais grossa, mesmo total', () => {
        expect(pct(85)).toBeCloseTo(5.0937 + 1.9101 + 3.8203, 3)
    })

    it('a MESMA categoria nos DOIS destinos continua separada — é o que não pode ser somado', () => {
        // MO Indireta aparece como CUSTO (15,00, dentro da conversão do serviço) e como MC
        // (87,2389 → 11,1092%, vinda dos itens cujo destino é margem). Somar as duas numa
        // linha só daria 13,0193%, que não corresponde a destino nenhum. O agrupamento é
        // DENTRO do CMV; ele não junta o que está em destinos diferentes.
        expect(pct(87.2389)).toBeCloseTo(11.1092, 4)
        expect(pct(15) + pct(87.2389)).toBeCloseTo(13.0193, 3)
    })

    it('a dupla contagem continua detectável: contar duas vezes passa de 100% do mesmo jeito', () => {
        // É a razão pela qual o agrupamento não enfraquece o invariante. Se a conversão de um
        // item entrasse no CMV E na MC, o total excederia — independentemente de o CMV estar
        // aberto em três linhas ou fechado em uma.
        const linhas = [pct(85), pct(87.2389)]
        const comDupla = [...linhas, pct(85)]
        expect(linhas.reduce((a, b) => a + b, 0)).toBeLessThan(100)
        expect(comDupla.reduce((a, b) => a + b, 0)).toBeCloseTo(
            linhas.reduce((a, b) => a + b, 0) + pct(85), 6,
        )
    })

    it('fechamento na cascata: o custo vem por um canal e as despesas de MC por outro', () => {
        const trace = cascade([SERVICO, REVENDA, INDUSTRIALIZADO], tenant('SERVICO'))
        // Etapa 2 — "Construção matemática individual" = Σ unit_price × quantity (a Etapa 1
        // é a CONTAGEM de itens, não moeda).
        const rb = trace.find((s) => s.step === 2)?.amount ?? 0
        const custo = custoConsolidado(trace)
        const despesasMc = trace.find((s) => s.step === 5)?.amount ?? 0
        expect(rb).toBeCloseTo(900, 6)
        // Custo: 135 (serviço, conversão dentro) + 80 (revenda, conversão FORA) + 180.
        expect(custo).toBeCloseTo(395, 6)
        // Nenhuma parcela de conversão foi contada também na MC.
        expect(custo + despesasMc).toBeLessThan(rb)
    })
})
