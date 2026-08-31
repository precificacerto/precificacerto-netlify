/**
 * D15 — RT (Comissão Reserva Técnica) do SERVIÇO na Venda no Balcão.
 *
 * Defeito comprovado em produção (venda VD-51B0E2, sale_id 51b0e2b2-0420-427e-acc1-f3a9c3d9aacc,
 * balcão puro — budget_id e order_id nulos), dois itens, ambos com rt_reserve_percent = 1% no
 * cadastro:
 *
 *   Camiseta Polo M (produto) R$ 125,50 → RT esperado 1,26 → contabilizado 1,26  ✔
 *   Teste minuto     (serviço) R$  85,00 → RT esperado 0,85 → contabilizado 0,00  ✘
 *
 * Gravou `sales.rt_amount = 1,26` (1,26 ÷ 125,50 = 1,004%) — só o produto entrou. O PR #12
 * acrescentou `rt_reserve_percent` à consulta de `services`, mas nada lia o valor para dentro
 * do item, e os dois pontos de fallback resolviam o cadastro apenas por `product_id` — nulo em
 * item de serviço.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO **e** SERVIÇO. Foi exatamente esse
 * buraco que deixou o #12 passar pela metade.
 */

import { resolveItemRtPercent, computeSaleRtAmount, type RtCatalogEntry, type RtSaleItemLike } from '../balcao-rt'
import { calculateMotorV17ForPage, type PageBuildArgs, type PageItem, type LegacyMotorResult } from '../mrm-engine-v17/legacy-adapter'
import { extractEpicV5DisplayData } from '../mrm-display-extractor'
import type { CascadeStep, TaxBreakdown, TaxRatePeriod } from '@/types/mrm'

// ── Caso real VD-51B0E2 ──────────────────────────────────────────────────────
const PRODUTO = { id: 'p-camiseta', name: 'Camiseta Polo M', rt_reserve_percent: 1 }
const SERVICO = { id: 's-teste-minuto', name: 'Teste minuto', rt_reserve_percent: 1 }
const PRODUCTS: RtCatalogEntry[] = [PRODUTO]
const SERVICES: RtCatalogEntry[] = [SERVICO]

/** Item como `handleProductSelect` / `handleServiceSelect` passam a montá-lo (RT congelado). */
const itemProduto: RtSaleItemLike = { product_id: PRODUTO.id, service_id: '', unit_price: 125.5, quantity: 1, rt_reserve_percent: 1 }
const itemServico: RtSaleItemLike = { product_id: '', service_id: SERVICO.id, unit_price: 85, quantity: 1, rt_reserve_percent: 1 }

const TOTAL_BRUTO = 210.5 // 125,50 + 85,00
const RT_ESPERADO = 2.105 // 1,255 (produto) + 0,850 (serviço)

/**
 * Arredondamento de moeda meio-para-cima, como o `numeric(_,2)` do Postgres faz ao gravar
 * `sales.rt_amount`. `toFixed(2)` não serve aqui: opera sobre a aproximação binária
 * (1,255 é 1,25499999… em double) e arredondaria 1,255 para 1,25 — mas o banco gravou 1,26.
 */
const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100

/** Comportamento ANTERIOR ao fix, replicado para provar o antes/depois numericamente. */
function rtAmountLegado(items: RtSaleItemLike[], products: RtCatalogEntry[], saleTotalWithDiscount: number): number {
    const w = items.reduce((s, i) => {
        const prod = i.product_id ? products.find(p => p.id === i.product_id) : null
        // item nunca trazia rt_reserve_percent → sempre caía no fallback, só por product_id
        const rtPct = Number(prod?.rt_reserve_percent) || 0
        return s + Number(i.unit_price) * Number(i.quantity) * rtPct / 100
    }, 0)
    const t = items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0)
    return t > 0 ? (w / t) * saleTotalWithDiscount : 0
}

describe('D15 — resolveItemRtPercent: item é a fonte primária, produto E serviço', () => {
    it('PRODUTO: lê o RT congelado no item', () => {
        expect(resolveItemRtPercent(itemProduto, PRODUCTS, SERVICES)).toBe(1)
    })

    it('SERVIÇO: lê o RT congelado no item (era 0 antes do fix)', () => {
        expect(resolveItemRtPercent(itemServico, PRODUCTS, SERVICES)).toBe(1)
    })

    it('o item vence o cadastro vivo — RT congelado não é reescrito por alteração posterior', () => {
        const cadastroAlterado = [{ ...PRODUTO, rt_reserve_percent: 9 }]
        expect(resolveItemRtPercent(itemProduto, cadastroAlterado, SERVICES)).toBe(1)
        expect(resolveItemRtPercent({ ...itemServico }, PRODUCTS, [{ ...SERVICO, rt_reserve_percent: 9 }])).toBe(1)
    })

    it('item congelado com RT 0 não reabre o fallback (0 é decisão, não ausência)', () => {
        expect(resolveItemRtPercent({ ...itemProduto, rt_reserve_percent: 0 }, PRODUCTS, SERVICES)).toBe(0)
        expect(resolveItemRtPercent({ ...itemServico, rt_reserve_percent: 0 }, PRODUCTS, SERVICES)).toBe(0)
    })

    describe('fallback (defesa em profundidade — itens legados, sem o campo congelado)', () => {
        it('PRODUTO legado resolve por product_id em products', () => {
            expect(resolveItemRtPercent({ product_id: PRODUTO.id, unit_price: 125.5, quantity: 1 }, PRODUCTS, SERVICES)).toBe(1)
        })

        it('SERVIÇO legado resolve por service_id em services (product_id nulo)', () => {
            expect(resolveItemRtPercent({ service_id: SERVICO.id, unit_price: 85, quantity: 1 }, PRODUCTS, SERVICES)).toBe(1)
        })

        it('item manual (sem product_id e sem service_id) → 0, sem quebrar', () => {
            expect(resolveItemRtPercent({ unit_price: 50, quantity: 1 }, PRODUCTS, SERVICES)).toBe(0)
        })

        it('catálogos vazios ou RT nulo → 0', () => {
            expect(resolveItemRtPercent({ service_id: 's-x' }, [], [])).toBe(0)
            expect(resolveItemRtPercent({ service_id: 's-y' }, PRODUCTS, [{ id: 's-y', rt_reserve_percent: null }])).toBe(0)
        })
    })
})

describe('D15 — computeSaleRtAmount: total consolidado (sales.rt_amount)', () => {
    const itens = [itemProduto, itemServico]

    it('ANTES (comportamento em produção): apenas o produto entra → R$ 1,26', () => {
        const antes = rtAmountLegado(itens, PRODUCTS, TOTAL_BRUTO)
        expect(antes).toBeCloseTo(1.255, 6)
        expect(round2(antes)).toBe(1.26) // sales.rt_amount gravado na VD-51B0E2
        // alíquota efetiva contabilizada: 0,5962%
        expect((antes / TOTAL_BRUTO) * 100).toBeCloseTo(0.5962, 4)
    })

    it('DEPOIS: produto + serviço → R$ 2,11 (1,255 + 0,850)', () => {
        const depois = computeSaleRtAmount(itens, PRODUCTS, SERVICES, TOTAL_BRUTO)
        expect(depois).toBeCloseTo(RT_ESPERADO, 6)
        expect(round2(depois)).toBe(2.11)
    })

    it('alíquota efetiva passa de 0,5962% para 1,00% exato', () => {
        const depois = computeSaleRtAmount(itens, PRODUCTS, SERVICES, TOTAL_BRUTO)
        expect((depois / TOTAL_BRUTO) * 100).toBeCloseTo(1.0, 10)
    })

    it('cada caminho isolado: produto R$ 1,255 e serviço R$ 0,850', () => {
        expect(computeSaleRtAmount([itemProduto], PRODUCTS, SERVICES, 125.5)).toBeCloseTo(1.255, 6)
        expect(computeSaleRtAmount([itemServico], PRODUCTS, SERVICES, 85)).toBeCloseTo(0.85, 6)
    })

    it('itens legados (sem RT congelado) chegam ao mesmo total pelo fallback', () => {
        const legados = [
            { product_id: PRODUTO.id, unit_price: 125.5, quantity: 1 },
            { service_id: SERVICO.id, unit_price: 85, quantity: 1 },
        ]
        expect(computeSaleRtAmount(legados, PRODUCTS, SERVICES, TOTAL_BRUTO)).toBeCloseTo(RT_ESPERADO, 6)
    })

    it('desconto global: o RT acompanha o total descontado (10% → R$ 1,8945)', () => {
        const comDesconto = computeSaleRtAmount(itens, PRODUCTS, SERVICES, TOTAL_BRUTO * 0.9)
        expect(comDesconto).toBeCloseTo(RT_ESPERADO * 0.9, 6)
    })

    it('venda sem itens ou de valor zero → 0, sem NaN', () => {
        expect(computeSaleRtAmount([], PRODUCTS, SERVICES, 0)).toBe(0)
        expect(computeSaleRtAmount([{ unit_price: 0, quantity: 0 }], PRODUCTS, SERVICES, 0)).toBe(0)
    })

    it('quantidade > 1 pondera pelo valor bruto do item', () => {
        const dobrado = [{ ...itemProduto, quantity: 2 }, itemServico]
        // 125,50×2×1% + 85×1% = 2,510 + 0,850 = 3,360 sobre bruto 336,00
        expect(computeSaleRtAmount(dobrado, PRODUCTS, SERVICES, 336)).toBeCloseTo(3.36, 6)
    })
})

// ── Memória Cascata (etapas 5.5 e 14.5) ──────────────────────────────────────
function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
    return { id: `r-${tax_type}`, tenant_id: 'test', tax_type, origin_state: null, dest_state: null, rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null }
}

const tenantCtx: PageBuildArgs['tenantCtx'] = {
    regime: 'LUCRO_REAL',
    rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
    csll_pct: 0.008, irpj_pct: 0.016, dop_pct: 0.10,
    absorption_policy: 'RRO_PROPORTIONAL',
}

/** Espelha `balcaoEnrichedItems`: é o `rt_reserve_percent` do item que chega ao motor. */
function enrich(items: RtSaleItemLike[]): PageItem[] {
    return items.map(i => ({
        unit_price: Number(i.unit_price) || 0,
        quantity: Number(i.quantity) || 0,
        cost_total: 40,
        commission_percent: 5,
        profit_percent: 15,
        rt_reserve_percent: resolveItemRtPercent(i, PRODUCTS, SERVICES),
    }))
}

function runMotor(items: PageItem[]): CascadeStep[] {
    const r: LegacyMotorResult[] = calculateMotorV17ForPage({ items, tenantCtx, globalDiscountPercent: 0 })
    const display = extractEpicV5DisplayData(
        // LegacyMotorResult é um Pick<TaxBreakdown> — o extractor valida o schema em runtime.
        r.map(x => ({ tax_breakdown: x as unknown as TaxBreakdown })),
        { regime: 'LUCRO_REAL', csll_pct: 0.008, irpj_pct: 0.016 },
    )
    expect(display.cascadeTrace).not.toBeNull()
    return display.cascadeTrace!
}

const cascata = (items: RtSaleItemLike[]): CascadeStep[] => runMotor(enrich(items))
const stepOf = (trace: CascadeStep[], step: number) => trace.find(s => s.step === step)

describe('D15 — Memória Cascata: etapas 5.5 e 14.5 refletem 1,00% efetivo', () => {
    it('produto + serviço: RT efetivo 1,00% (não os 0,5962% atuais)', () => {
        const trace = cascata([itemProduto, itemServico])
        const step55 = stepOf(trace, 5.5)
        const step145 = stepOf(trace, 14.5)
        expect(step55).toBeDefined()
        expect(step145).toBeDefined()
        expect(step55!.effective_rate_pct).toBeCloseTo(0.01, 10)
        expect(step145!.effective_rate_pct).toBeCloseTo(0.01, 10)
        // a alíquota da 14.5 é a congelada na 5.5
        expect(step145!.effective_rate_pct).toBeCloseTo(step55!.effective_rate_pct as number, 12)
    })

    it('só o serviço já produz as etapas de RT (antes o trace vinha sem elas)', () => {
        const steps = cascata([itemServico]).map(s => s.step)
        expect(steps).toContain(5.5)
        expect(steps).toContain(14.5)
    })

    it('só o produto continua com RT — nenhuma regressão no caminho que já funcionava', () => {
        const trace = cascata([itemProduto])
        expect(stepOf(trace, 5.5)!.effective_rate_pct).toBeCloseTo(0.01, 10)
    })

    it('sem o fix o RT do serviço zerava: alíquota efetiva cairia para 0,5962%', () => {
        // reproduz o estado antigo: item de serviço chega ao motor com RT 0
        const antigos: PageItem[] = [
            { unit_price: 125.5, quantity: 1, cost_total: 40, commission_percent: 5, profit_percent: 15, rt_reserve_percent: 1 },
            { unit_price: 85, quantity: 1, cost_total: 40, commission_percent: 5, profit_percent: 15, rt_reserve_percent: 0 },
        ]
        const step55 = stepOf(runMotor(antigos), 5.5)!
        expect((step55.effective_rate_pct as number) * 100).toBeCloseTo(0.5962, 3)
    })
})
