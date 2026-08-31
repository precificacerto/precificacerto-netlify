/**
 * D8 — `rt_pct` por item nunca era gravado.
 *
 * A migração `20260713000003_add_rt_persistence_pipeline` criou `rt_pct` em
 * `budget_items`, `order_items` e `sale_items` — NUMERIC(8,5), decimal, espelhando
 * `commission_pct`. O schema foi entregue; a gravação nunca foi escrita. Em produção
 * as três estavam zeradas em 100% das linhas: order_items 0/14, budget_items 0/150,
 * sale_items 0/102. O consolidado `sales.rt_amount` funcionava porque é calculado por
 * fora, a partir do cadastro — daí o sintoma da VD-F406F8: rt_amount 2,11 correto e os
 * dois sale_items com rt_pct 0,00000.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 * A VD-F406F8 tinha um de cada, ambos com rt_reserve_percent = 1% no cadastro, e os
 * dois zeraram — foi exatamente o buraco que deixou o #12 passar pela metade.
 */

import type { RtSaleItemLike } from '@/utils/balcao-rt'
import {
    resolveItemRtPercent,
    resolveItemRtPctDecimal,
    resolveInheritedRtPctDecimal,
    toRtPctDecimal,
    computeSaleRtAmount,
} from '@/utils/balcao-rt'

// Cadastro da VD-F406F8: um produto e um serviço, ambos com RT de 1%.
const PRODUTOS = [{ id: 'prod-1', rt_reserve_percent: 1 }]
const SERVICOS = [{ id: 'svc-1', rt_reserve_percent: 1 }]

const ITEM_PRODUTO: RtSaleItemLike = { product_id: 'prod-1', service_id: null, unit_price: 100, quantity: 1 }
const ITEM_SERVICO: RtSaleItemLike = { product_id: null, service_id: 'svc-1', unit_price: 110.5, quantity: 1 }

describe('D8 · conversão para o decimal persistido', () => {
    it('base-100 vira decimal com 5 casas', () => {
        expect(toRtPctDecimal(1)).toBe(0.01)
        expect(toRtPctDecimal(3.5)).toBe(0.035)
        expect(toRtPctDecimal(15.5)).toBe(0.155)
        expect(toRtPctDecimal(0.12345)).toBe(0.00123) // trunca no limite de NUMERIC(8,5)
    })

    it('valor ausente ou inválido vira 0, nunca NaN', () => {
        expect(toRtPctDecimal(0)).toBe(0)
        expect(toRtPctDecimal(null)).toBe(0)
        expect(toRtPctDecimal(undefined)).toBe(0)
        expect(toRtPctDecimal('abc')).toBe(0)
    })
})

describe('D8 · RT gravado por item — PRODUTO e SERVIÇO', () => {
    it('produto: resolve do cadastro e persiste decimal', () => {
        expect(resolveItemRtPercent(ITEM_PRODUTO, PRODUTOS, SERVICOS)).toBe(1)
        expect(resolveItemRtPctDecimal(ITEM_PRODUTO, PRODUTOS, SERVICOS)).toBe(0.01)
    })

    it('serviço: resolve do cadastro e persiste decimal', () => {
        // Regressão da VD-51B0E2/D15: olhar só `products` por product_id devolvia 0
        // em item de serviço, silenciosamente.
        expect(resolveItemRtPercent(ITEM_SERVICO, PRODUTOS, SERVICOS)).toBe(1)
        expect(resolveItemRtPctDecimal(ITEM_SERVICO, PRODUTOS, SERVICOS)).toBe(0.01)
    })

    it('VD-F406F8: os DOIS itens deixam de gravar zero', () => {
        const gravados = [ITEM_PRODUTO, ITEM_SERVICO].map(i =>
            resolveItemRtPctDecimal(i, PRODUTOS, SERVICOS),
        )
        expect(gravados).toEqual([0.01, 0.01])
        expect(gravados.every(v => v !== 0)).toBe(true)
    })

    it('o RT congelado no item vence o cadastro', () => {
        // Alteração posterior no cadastro não reescreve o passado.
        const congelado = { ...ITEM_PRODUTO, rt_reserve_percent: 3 }
        expect(resolveItemRtPctDecimal(congelado, [{ id: 'prod-1', rt_reserve_percent: 9 }], [])).toBe(0.03)
    })

    it('item manual (sem produto e sem serviço) grava 0', () => {
        expect(resolveItemRtPctDecimal({ product_id: null, service_id: null }, PRODUTOS, SERVICOS)).toBe(0)
    })

    it('cadastro sem RT grava 0, sem inventar valor', () => {
        expect(resolveItemRtPctDecimal({ product_id: 'p9' }, [{ id: 'p9', rt_reserve_percent: 0 }], [])).toBe(0)
        expect(resolveItemRtPctDecimal({ product_id: 'inexistente' }, PRODUTOS, SERVICOS)).toBe(0)
    })
})

describe('D8 · herança na cadeia orçamento → pedido → venda', () => {
    it('preserva o rt_pct já congelado na origem', () => {
        expect(resolveInheritedRtPctDecimal(0.035, ITEM_PRODUTO, PRODUTOS, SERVICOS)).toBe(0.035)
        expect(resolveInheritedRtPctDecimal(0.01, ITEM_SERVICO, PRODUTOS, SERVICOS)).toBe(0.01)
    })

    it('linha legada (rt_pct 0, nunca gravado) se cura pelo cadastro', () => {
        // As 266 linhas em produção estão exatamente neste caso — produto E serviço.
        expect(resolveInheritedRtPctDecimal(0, ITEM_PRODUTO, PRODUTOS, SERVICOS)).toBe(0.01)
        expect(resolveInheritedRtPctDecimal(0, ITEM_SERVICO, PRODUTOS, SERVICOS)).toBe(0.01)
        expect(resolveInheritedRtPctDecimal(null, ITEM_SERVICO, PRODUTOS, SERVICOS)).toBe(0.01)
    })

    it('zero legítimo permanece zero quando o cadastro também é zero', () => {
        expect(resolveInheritedRtPctDecimal(0, { product_id: 'p9' }, [{ id: 'p9', rt_reserve_percent: 0 }], [])).toBe(0)
        expect(resolveInheritedRtPctDecimal(0, { product_id: null, service_id: null }, PRODUTOS, SERVICOS)).toBe(0)
    })

    it('a travessia inteira mantém o RT dos dois tipos de item', () => {
        // orçamento → pedido → orçamento-espelho → venda, um produto e um serviço.
        let itens = [ITEM_PRODUTO, ITEM_SERVICO].map(i => ({
            ...i,
            rt_pct: resolveItemRtPctDecimal(i, PRODUTOS, SERVICOS),
        }))
        for (let etapa = 0; etapa < 3; etapa++) {
            itens = itens.map(i => ({
                ...i,
                rt_pct: resolveInheritedRtPctDecimal(i.rt_pct, i, PRODUTOS, SERVICOS),
            }))
        }
        expect(itens.map(i => i.rt_pct)).toEqual([0.01, 0.01])
    })
})

describe('D8 · consolidado e itens passam a contar a mesma história', () => {
    it('sales.rt_amount continua batendo com a soma dos rt_pct dos itens', () => {
        const itens = [ITEM_PRODUTO, ITEM_SERVICO]
        const totalBruto = 100 + 110.5 // 210,50 — o total da VD-F406F8
        const consolidado = computeSaleRtAmount(itens, PRODUTOS, SERVICOS, totalBruto)

        // O consolidado calculado por fora (comportamento atual, que já estava certo).
        expect(consolidado).toBeCloseTo(2.105, 3)

        // E agora reconstruível a partir do que fica gravado em cada item — antes
        // impossível, porque os dois rt_pct eram 0.
        const porItem = itens.reduce(
            (s, i) => s + (i.unit_price || 0) * (i.quantity || 0) * resolveItemRtPctDecimal(i, PRODUTOS, SERVICOS),
            0,
        )
        expect(porItem).toBeCloseTo(consolidado, 6)
    })

    it('regressão: antes, o consolidado batia e os itens não', () => {
        const itens = [ITEM_PRODUTO, ITEM_SERVICO]
        const totalBruto = 210.5
        // Comportamento antigo: rt_pct nunca escrito ⇒ 0 pelo DEFAULT da coluna.
        const rtPctAntigo = itens.map(() => 0)
        const porItemAntigo = itens.reduce(
            (s, i, idx) => s + (i.unit_price || 0) * (i.quantity || 0) * rtPctAntigo[idx],
            0,
        )
        expect(porItemAntigo).toBe(0)
        expect(computeSaleRtAmount(itens, PRODUTOS, SERVICOS, totalBruto)).toBeGreaterThan(0)
    })
})
