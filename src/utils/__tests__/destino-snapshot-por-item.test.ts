/**
 * D-A · o destino é propriedade da CONSTRUÇÃO DO PREÇO, não do estado atual do tenant.
 *
 * REGRA CANÔNICA (Seção 4). Cada item precificado grava seu snapshot de destino junto com o
 * preço.
 *
 *   CORRETO   destino = snapshot_do_item.destino[categoria]
 *   PROIBIDO  destino = matriz[tenant.calc_type_atual][item.tipo][categoria]
 *
 * O DEFEITO: a cascata resolvia a matriz pelo `calc_type` que o tenant tem HOJE. Se o tenant
 * mudasse de segmentação, todo orçamento antigo passava a ser decomposto por uma matriz que
 * não o formou — o preço gravado continuava lá, e a decomposição dele mudava sozinha.
 *
 * É a classe `fato-vs-referencia`, e o teste dela tem sempre a mesma forma, que é a deste
 * arquivo: GRAVA COM UM PARÂMETRO, MUDA O PARÂMETRO, LÊ, E AFIRMA QUE NÃO MUDOU. Gravar e ler
 * na mesma sessão passa sempre; só falha quem gravou em agosto e leu em setembro.
 *
 * ENQUADRAMENTO: isto é o caso geral DO DESTINO, não da classe inteira. O inventário campo a
 * campo é rodada própria e não está aqui.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    buildDestinationSnapshot,
    buildItemDestinationSnapshot,
    readDestinationSnapshot,
    resolveItemCostUnit,
    resolveItemDestinations,
    resolveItemDopComponents,
    resolveItemLaborGrouping,
    DESTINATION_SNAPSHOT_VERSION,
} from '@/utils/destination-snapshot'
import { resolveCategoryDestinations } from '@/utils/expense-destination'
import {
    calculateMotorV17ForPage,
    type PageBuildArgs,
    type PageItem,
    type PageTenantCtx,
} from '@/utils/mrm-engine-v17/legacy-adapter'
import type { CascadeStep } from '@/types/mrm'

// ─────────────────────────────── harness ───────────────────────────────

function cascade(items: PageItem[], tenantCtx: PageTenantCtx): CascadeStep[] {
    const args: PageBuildArgs = { items, tenantCtx, globalDiscountPercent: 0 }
    const res = calculateMotorV17ForPage(args)
    const first = res.find((r) => r != null)
    if (!first) throw new Error('motor não retornou resultado')
    return first.cascade_trace
}
const custo = (t: CascadeStep[]) => t.find((s) => s.step === 4)?.amount ?? 0
const despesasMc = (t: CascadeStep[]) => t.find((s) => s.step === 5)?.amount ?? 0

function tenant(calcType: string | null): PageTenantCtx {
    return {
        regime: 'SIMPLES_NACIONAL',
        rates: [],
        mod_pct: 0,
        dop_pct: 0.08 + 0.06 + 0.0125 + 0.0036,
        csll_pct: 0,
        irpj_pct: 0,
        useSnapshotRates: true,
        calc_type: calcType,
        mo_produtiva_pct: 0.15,
        expense_breakdown: {
            administrative_pct: 0.08, fixed_pct: 0.06, variable_pct: 0.0125, financial_pct: 0.0036,
        },
        absorption_policy: 'RRO_PROPORTIONAL',
    }
}

const PRODUTO: PageItem = {
    unit_price: 200, quantity: 1, cost_total: 80, productive_labor_unit: 20,
    product_type: 'REVENDA', yield_quantity: 1,
    commission_percent: 10, profit_percent: 15, item_tax_rates: { das_pct: 6 },
}
const SERVICO: PageItem = {
    unit_price: 300, quantity: 1, cost_total: 50, productive_labor_unit: 85,
    service_id: 'svc-1',
    commission_percent: 20, profit_percent: 10, item_tax_rates: { das_pct: 6 },
}

const GRAVADO_EM = '2026-08-01T10:00:00.000Z'

// ─────────────────── 1. O snapshot congela o RESULTADO, não a entrada ───────────────────

describe('buildDestinationSnapshot · grava o destino resolvido', () => {
    it('guarda o mapa completo, mais construção e segmentação para auditoria', () => {
        const s = buildDestinationSnapshot({
            construction: 'REVENDA', tenantCalcType: 'SERVICO', gravadoEm: GRAVADO_EM,
        })
        expect(s).toEqual({
            v: DESTINATION_SNAPSHOT_VERSION,
            destino: {
                mo_produtiva: 'FORA', mo_indireta: 'FORA', despesa_fixa: 'FORA',
                despesa_variavel: 'MARGEM', despesa_financeira: 'MARGEM',
            },
            construcao: 'REVENDA',
            segmentacao: 'SERVICO',
            gravado_em: GRAVADO_EM,
        })
    })

    it('grava o RESULTADO e não a entrada — mudar a matriz não reescreve preço antigo', () => {
        // Se guardássemos só a segmentação, uma alteração futura na tabela de destinos
        // mudaria a decomposição de todo preço já formado. O que fica gravado é o destino.
        const s = buildDestinationSnapshot({ construction: 'SERVICO', tenantCalcType: 'SERVICO' })
        expect(s.destino.mo_indireta).toBe('CUSTO')
        expect(Object.keys(s.destino).sort()).toEqual([
            'despesa_financeira', 'despesa_fixa', 'despesa_variavel', 'mo_indireta', 'mo_produtiva',
        ])
    })

    it('o atalho por item resolve a construção — PRODUTO e SERVIÇO', () => {
        expect(buildItemDestinationSnapshot({ item: PRODUTO, tenantCalcType: 'REVENDA' }).construcao).toBe('REVENDA')
        expect(buildItemDestinationSnapshot({ item: SERVICO, tenantCalcType: 'REVENDA' }).construcao).toBe('SERVICO')
        expect(buildItemDestinationSnapshot({ item: { product_type: 'PRODUZIDO' }, tenantCalcType: 'REVENDA' }).construcao)
            .toBe('INDUSTRIALIZACAO')
    })

    it('reproduz a matriz em todas as nove células, no momento da gravação', () => {
        for (const c of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO'] as const) {
            for (const seg of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO']) {
                expect(buildDestinationSnapshot({ construction: c, tenantCalcType: seg }).destino)
                    .toEqual(resolveCategoryDestinations(c, seg))
            }
        }
    })
})

// ─────────── 2. O TESTE DA CLASSE: muda o parâmetro entre gravar e ler ───────────

describe('fato-vs-referencia · o tenant muda de segmentação e o item antigo NÃO muda', () => {
    it('PRODUTO de revenda: gravado em tenant SERVIÇO, lido depois em tenant REVENDA', () => {
        const congelado = buildItemDestinationSnapshot({ item: PRODUTO, tenantCalcType: 'SERVICO' })
        const antes = resolveItemDestinations({ item: PRODUTO, snapshot: congelado, tenantCalcType: 'SERVICO' })
        // … o tenant muda de segmentação …
        const depois = resolveItemDestinations({ item: PRODUTO, snapshot: congelado, tenantCalcType: 'REVENDA' })
        expect(depois.destinations).toEqual(antes.destinations)
        expect(depois.destinations.mo_produtiva).toBe('FORA')
        expect(depois.source).toBe('SNAPSHOT')
    })

    it('SERVIÇO: idem — o congelamento não é privilégio de produto', () => {
        const congelado = buildItemDestinationSnapshot({ item: SERVICO, tenantCalcType: 'SERVICO' })
        const depois = resolveItemDestinations({ item: SERVICO, snapshot: congelado, tenantCalcType: 'INDUSTRIALIZACAO' })
        expect(depois.destinations.mo_indireta).toBe('CUSTO')
        expect(depois.destinations.despesa_fixa).toBe('CUSTO')
    })

    it('SEM snapshot o defeito aparece: o mesmo item muda de destino com o tenant', () => {
        // É a forma proibida, reproduzida para que a diferença fique visível. O item é o
        // mesmo, o preço é o mesmo, e a classificação muda porque alguém editou uma tela.
        const emServico = resolveItemDestinations({ item: PRODUTO, tenantCalcType: 'SERVICO' })
        const emRevenda = resolveItemDestinations({ item: PRODUTO, tenantCalcType: 'REVENDA' })
        expect(emServico.destinations.mo_produtiva).toBe('FORA')
        expect(emRevenda.destinations.mo_produtiva).toBe('MARGEM')
        expect(emServico.source).toBe('MATRIZ')
    })

    it('na CASCATA · PRODUTO: custo e MC não se movem quando o tenant muda', () => {
        const comSnapshot: PageItem = {
            ...PRODUTO,
            destination_snapshot: buildItemDestinationSnapshot({ item: PRODUTO, tenantCalcType: 'SERVICO' }),
        }
        const a = cascade([comSnapshot], tenant('SERVICO'))
        const b = cascade([comSnapshot], tenant('REVENDA'))
        const c = cascade([comSnapshot], tenant('INDUSTRIALIZACAO'))
        expect(custo(b)).toBe(custo(a))
        expect(custo(c)).toBe(custo(a))
        expect(despesasMc(b)).toBe(despesasMc(a))
        expect(despesasMc(c)).toBe(despesasMc(a))
        // E o valor é o que a segmentação da GRAVAÇÃO manda: MO Produtiva FORA ⇒ só a
        // mercadoria entra no CMV.
        expect(custo(a)).toBeCloseTo(80, 6)
    })

    it('na CASCATA · SERVIÇO: idem', () => {
        const comSnapshot: PageItem = {
            ...SERVICO,
            destination_snapshot: buildItemDestinationSnapshot({ item: SERVICO, tenantCalcType: 'SERVICO' }),
        }
        const a = cascade([comSnapshot], tenant('SERVICO'))
        const b = cascade([comSnapshot], tenant('REVENDA'))
        expect(custo(b)).toBe(custo(a))
        expect(despesasMc(b)).toBe(despesasMc(a))
        expect(custo(a)).toBeCloseTo(135, 6)
    })

    it('na CASCATA · sem snapshot, o mesmo item muda de custo com o tenant — o defeito', () => {
        expect(custo(cascade([PRODUTO], tenant('SERVICO')))).toBeCloseTo(80, 6)
        expect(custo(cascade([PRODUTO], tenant('REVENDA')))).toBeCloseTo(100, 6)
    })

    it('o AGRUPAMENTO de revenda também congela', () => {
        // Gravado em tenant de revenda, com MO Produtiva somada à Indireta. O tenant vira
        // industrialização; o item antigo continua tendo sido formado com as duas somadas.
        const item: PageItem = { ...PRODUTO }
        const snap = buildItemDestinationSnapshot({ item, tenantCalcType: 'REVENDA' })
        expect(resolveItemLaborGrouping({ item, snapshot: snap, tenantCalcType: 'INDUSTRIALIZACAO' })).toBe('REVENDA')
        expect(resolveItemLaborGrouping({ item, snapshot: snap, tenantCalcType: null })).toBe('REVENDA')
        // Sem snapshot, segue a segmentação atual — comportamento de hoje para item legado.
        expect(resolveItemLaborGrouping({ item, tenantCalcType: 'INDUSTRIALIZACAO' })).toBeNull()
        expect(resolveItemLaborGrouping({ item, tenantCalcType: 'REVENDA' })).toBe('REVENDA')
    })

    it('serviço nunca entra no agrupamento, com ou sem snapshot', () => {
        const snap = buildItemDestinationSnapshot({ item: SERVICO, tenantCalcType: 'REVENDA' })
        expect(resolveItemLaborGrouping({ item: SERVICO, snapshot: snap, tenantCalcType: 'REVENDA' })).toBeNull()
        expect(resolveItemLaborGrouping({ item: SERVICO, tenantCalcType: 'REVENDA' })).toBeNull()
    })
})

// ═══════════ 3. NULL É SEM SNAPSHOT — NUNCA É O DESTINO FORA ═══════════

describe('AUSÊNCIA DE SNAPSHOT · null nunca vira FORA', () => {
    /**
     * Confundir os dois transformaria TODO ITEM LEGADO EM ITEM SEM CUSTO: FORA tira a
     * conversão do CMV, e um item legado lido como FORA perderia a mão de obra
     * silenciosamente — sem erro, sem log, com o preço simplesmente mais barato. É a mesma
     * armadilha do `NOT NULL DEFAULT 0` do D8.
     */
    const CORROMPIDOS: [string, unknown][] = [
        ['ausente', undefined],
        ['null', null],
        ['array', []],
        ['string', 'FORA'],
        ['número', 0],
        ['objeto vazio', {}],
        ['sem versão', { destino: { mo_produtiva: 'CUSTO' } }],
        ['versão desconhecida', { v: 99, destino: {}, construcao: 'SERVICO' }],
        ['sem destino', { v: 1, construcao: 'SERVICO', segmentacao: 'SERVICO' }],
        ['destino nulo', { v: 1, destino: null, construcao: 'SERVICO' }],
        ['destino incompleto', { v: 1, destino: { mo_produtiva: 'CUSTO' }, construcao: 'SERVICO' }],
        ['destino com valor inválido', {
            v: 1, construcao: 'SERVICO', destino: {
                mo_produtiva: 'TALVEZ', mo_indireta: 'CUSTO', despesa_fixa: 'CUSTO',
                despesa_variavel: 'MARGEM', despesa_financeira: 'MARGEM',
            },
        }],
        ['construção inválida', {
            v: 1, construcao: 'OUTRA', destino: {
                mo_produtiva: 'CUSTO', mo_indireta: 'CUSTO', despesa_fixa: 'CUSTO',
                despesa_variavel: 'MARGEM', despesa_financeira: 'MARGEM',
            },
        }],
    ]

    it.each(CORROMPIDOS)('%s ⇒ readDestinationSnapshot devolve null', (_nome, raw) => {
        expect(readDestinationSnapshot(raw)).toBeNull()
    })

    it.each(CORROMPIDOS)('%s ⇒ cai na MATRIZ, e o destino NÃO é FORA', (_nome, raw) => {
        // Tenant de revenda: a matriz manda MARGEM. Se `null` virasse FORA, este item
        // perderia a conversão do custo — e é exatamente isso que não pode acontecer.
        const r = resolveItemDestinations({ item: PRODUTO, snapshot: raw, tenantCalcType: 'REVENDA' })
        expect(r.source).toBe('MATRIZ')
        expect(r.destinations.mo_produtiva).toBe('MARGEM')
        expect(r.destinations).toEqual(resolveCategoryDestinations('REVENDA', 'REVENDA'))
    })

    it.each(CORROMPIDOS)('%s ⇒ o item legado MANTÉM o custo — não vira item sem custo', (_nome, raw) => {
        // PRODUTO tem 20 de conversão. Com FORA ele iria a 80; pela matriz de revenda fica
        // em 100. A diferença entre "sem snapshot" e "FORA" é este número.
        expect(resolveItemCostUnit({
            item: PRODUTO, snapshot: raw, tenantCalcType: 'REVENDA', itemCost: 80, conversionCost: 20,
        }).costUnit).toBe(100)
    })

    it('e o SERVIÇO legado também mantém as três categorias no custo', () => {
        const r = resolveItemDestinations({ item: SERVICO, snapshot: null, tenantCalcType: 'SERVICO' })
        expect([r.destinations.mo_produtiva, r.destinations.mo_indireta, r.destinations.despesa_fixa])
            .toEqual(['CUSTO', 'CUSTO', 'CUSTO'])
        expect(resolveItemCostUnit({
            item: SERVICO, snapshot: null, tenantCalcType: 'SERVICO', itemCost: 50, conversionCost: 85,
        }).costUnit).toBe(135)
    })

    it('um snapshot ÍNTEGRO com FORA é outra coisa — e aí o custo cai mesmo', () => {
        // A distinção em número: mesmo item, mesma conversão. Sem snapshot, 100. Com um
        // snapshot que de fato diz FORA, 80. São duas afirmações diferentes.
        const foraDeVerdade = buildItemDestinationSnapshot({ item: PRODUTO, tenantCalcType: 'SERVICO' })
        expect(resolveItemCostUnit({
            item: PRODUTO, snapshot: foraDeVerdade, tenantCalcType: 'REVENDA', itemCost: 80, conversionCost: 20,
        }).costUnit).toBe(80)
        expect(resolveItemCostUnit({
            item: PRODUTO, snapshot: null, tenantCalcType: 'REVENDA', itemCost: 80, conversionCost: 20,
        }).costUnit).toBe(100)
    })
})

// ─────────────────── 4. Item legado na cascata: bit-exact ───────────────────

describe('Sem colateral · item legado se comporta exatamente como antes', () => {
    it('PRODUTO e SERVIÇO sem snapshot: custo e MC iguais em todas as segmentações', () => {
        for (const seg of ['SERVICO', 'INDUSTRIALIZACAO', 'REVENDA', null]) {
            const semCampo = cascade([PRODUTO, SERVICO], tenant(seg))
            const comNull = cascade(
                [{ ...PRODUTO, destination_snapshot: null }, { ...SERVICO, destination_snapshot: null }],
                tenant(seg),
            )
            expect(custo(comNull)).toBe(custo(semCampo))
            expect(despesasMc(comNull)).toBe(despesasMc(semCampo))
        }
    })

    it('orçamento MISTO: um item com snapshot, outro legado, cada um pelo seu caminho', () => {
        const congelado: PageItem = {
            ...PRODUTO,
            destination_snapshot: buildItemDestinationSnapshot({ item: PRODUTO, tenantCalcType: 'SERVICO' }),
        }
        const t = cascade([congelado, SERVICO], tenant('SERVICO'))
        // Produto congelado: 80 (conversão FORA). Serviço legado pela matriz: 50 + 85 = 135.
        expect(custo(t)).toBeCloseTo(215, 6)
    })

    it('o snapshot de um item não contamina o outro', () => {
        const congelado: PageItem = {
            ...PRODUTO,
            destination_snapshot: buildItemDestinationSnapshot({ item: PRODUTO, tenantCalcType: 'REVENDA' }),
        }
        // Produto congelado em revenda ⇒ conversão fica no custo (100). Serviço pela matriz
        // do tenant de serviço ⇒ 135. Total 235, e não 215.
        expect(custo(cascade([congelado, SERVICO], tenant('SERVICO')))).toBeCloseTo(235, 6)
    })
})

// ─────────────────── 5. Rastreabilidade da origem ───────────────────

describe('De onde veio o destino · SNAPSHOT ou MATRIZ, sempre dito', () => {
    it('os dois atalhos da cascata reportam a origem', () => {
        const snap = buildItemDestinationSnapshot({ item: SERVICO, tenantCalcType: 'SERVICO' })
        const componentes = { mo_admin: 0.08, fixa: 0.06, variavel: 0.0125, financeira: 0.0036 }
        expect(resolveItemDopComponents({ item: SERVICO, snapshot: snap, components: componentes }).source).toBe('SNAPSHOT')
        expect(resolveItemDopComponents({ item: SERVICO, components: componentes, tenantCalcType: 'SERVICO' }).source).toBe('MATRIZ')
        expect(resolveItemCostUnit({ item: SERVICO, snapshot: snap, itemCost: 50, conversionCost: 85 }).source).toBe('SNAPSHOT')
    })

    it('com snapshot, o calc_type atual NÃO É CONSULTADO — nem quando é absurdo', () => {
        const snap = buildItemDestinationSnapshot({ item: SERVICO, tenantCalcType: 'SERVICO' })
        const componentes = { mo_admin: 0.08, fixa: 0.06, variavel: 0.0125, financeira: 0.0036 }
        const esperado = resolveItemDopComponents({ item: SERVICO, snapshot: snap, tenantCalcType: 'SERVICO', components: componentes }).components
        for (const lixo of ['REVENDA', 'INDUSTRIALIZACAO', null, undefined, 'QUALQUER COISA']) {
            expect(resolveItemDopComponents({
                item: SERVICO, snapshot: snap, tenantCalcType: lixo, components: componentes,
            }).components).toEqual(esperado)
        }
    })
})

// ─────────── 6. Os dois vocabulários da segmentação ───────────

describe('VOCABULÁRIO · o banco diz SERVICO, a UI diz SERVICE', () => {
    /**
     * DEFEITO SILENCIOSO DE GRAVAÇÃO PERMANENTE, encontrado antes de nascer.
     *
     * `tenant_settings.calc_type` guarda INDUSTRIALIZACAO / SERVICO / REVENDA. A UI carrega o
     * MESMO dado como INDUSTRIALIZATION / SERVICE / RESALE (`CALC_TYPE_ENUM`), e as telas de
     * cadastro — que são exatamente onde o snapshot é GRAVADO — só têm o vocabulário da UI.
     *
     * Passar `'SERVICE'` para a matriz cairia no ramo "sem segmentação": nenhuma exceção
     * aplicada, nenhum erro, nenhum aviso, e o destino ERRADO gravado PARA SEMPRE — num campo
     * que existe justamente para ser imutável. Não haveria como descobrir depois: o snapshot
     * é a fonte de verdade, e uma vez gravado errado ninguém tem contra o que conferir.
     */
    const PARES: [string, string][] = [
        ['SERVICE', 'SERVICO'],
        ['RESALE', 'REVENDA'],
        ['INDUSTRIALIZATION', 'INDUSTRIALIZACAO'],
    ]

    it.each(PARES)('%s produz o MESMO destino que %s', (ui, banco) => {
        for (const c of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO'] as const) {
            expect(resolveCategoryDestinations(c, ui)).toEqual(resolveCategoryDestinations(c, banco))
        }
    })

    it('a exceção da revenda dispara com o vocabulário da UI — era o que sumiria', () => {
        // Sem o alias, `'SERVICE'` não casaria com `'SERVICO'`, a exceção não se aplicaria, e
        // o produto de revenda de um salão nasceria com MO Produtiva em MARGEM em vez de FORA.
        expect(resolveCategoryDestinations('REVENDA', 'SERVICE').mo_produtiva).toBe('FORA')
        expect(resolveCategoryDestinations('REVENDA', 'INDUSTRIALIZATION').mo_produtiva).toBe('FORA')
        expect(resolveCategoryDestinations('REVENDA', 'RESALE').mo_produtiva).toBe('MARGEM')
    })

    it('o snapshot grava sempre no vocabulário do BANCO, venha do que vier', () => {
        for (const [ui, banco] of PARES) {
            expect(buildDestinationSnapshot({ construction: 'SERVICO', tenantCalcType: ui }).segmentacao).toBe(banco)
        }
    })

    it('o agrupamento de revenda também aceita os dois', () => {
        const item = { product_type: 'REVENDA' }
        expect(resolveItemLaborGrouping({ item, tenantCalcType: 'RESALE' })).toBe('REVENDA')
        expect(resolveItemLaborGrouping({ item, tenantCalcType: 'REVENDA' })).toBe('REVENDA')
        expect(resolveItemLaborGrouping({ item, tenantCalcType: 'SERVICE' })).toBeNull()
    })

    it('valor desconhecido continua caindo em "sem segmentação" — o alias não inventa', () => {
        expect(resolveCategoryDestinations('REVENDA', 'QUALQUER').mo_produtiva).toBe('MARGEM')
        expect(buildDestinationSnapshot({ construction: 'REVENDA', tenantCalcType: 'QUALQUER' }).segmentacao)
            .toBe('QUALQUER')
    })
})
