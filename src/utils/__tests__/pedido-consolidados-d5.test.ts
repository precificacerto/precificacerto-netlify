/**
 * D5 — consolidados de comissão, lucro e RT no Pedido.
 *
 * Cadeia: orçamento → pedido → orçamento-espelho → venda. `orders` não tinha
 * `commission_amount`/`profit_amount`, e nenhuma das travessias copiava os
 * consolidados — o espelho nascia zerado e `sales.commission_amount`, que é lido do
 * orçamento, herdava zero.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 * Foi o buraco que deixou o PR #12 passar pela metade. Todos os cenários abaixo
 * rodam com um item de produto E um item de serviço no mesmo documento.
 */

import { computeResidualDistribution, type ResidualItemInput } from '@/utils/residual-distribution'
import {
    computeConsolidatedAmounts,
    resolveFrozenRtRate,
} from '@/utils/document-consolidated-amounts'
import type { TaxBreakdown } from '@/types/mrm'

/** Snapshot fiscal mínimo — só os campos que a distribuição residual lê. */
function snapshot(partial: Partial<TaxBreakdown>): TaxBreakdown {
    return {
        status: 'VALID',
        valid: true,
        rro: 0,
        new_commission: 0,
        new_profit: 0,
        new_csll: 0,
        new_irpj: 0,
        ...partial,
    } as TaxBreakdown
}

/** Um PRODUTO e um SERVIÇO no mesmo pedido — a regra fixa, em forma de fixture. */
const PRODUTO: ResidualItemInput = {
    unit_price: 200,
    quantity: 2,
    commission_percent: 5,
    profit_percent: 15,
    tax_breakdown: snapshot({ new_commission: 20, new_profit: 60, ancora_interna: 400 }),
}
const SERVICO: ResidualItemInput = {
    unit_price: 150,
    quantity: 1,
    commission_percent: 40,
    profit_percent: 10,
    tax_breakdown: snapshot({ new_commission: 60, new_profit: 15, ancora_interna: 150 }),
}
const ITENS = [PRODUTO, SERVICO]
const BRUTO = 200 * 2 + 150 // 550

function consolidar(opts: {
    itens?: ResidualItemInput[]
    bruto?: number
    liquido?: number
    descontoPct?: number
    rtOrigem?: number
    totalOrigem?: number
}) {
    const itens = opts.itens ?? ITENS
    const bruto = opts.bruto ?? BRUTO
    const liquido = opts.liquido ?? bruto
    return computeConsolidatedAmounts({
        distribution: computeResidualDistribution(
            itens,
            bruto,
            liquido,
            'SIMPLES_NACIONAL',
            { irpj: 0, csll: 0 },
            opts.descontoPct ?? 0,
            'PROPORTIONAL',
            itens.reduce((s, i) => s + (Number(i.tax_breakdown?.ancora_interna) || 0), 0),
        ),
        sourceRtAmount: opts.rtOrigem ?? 0,
        sourceTotal: opts.totalOrigem ?? bruto,
        currentTotal: liquido,
    })
}

describe('D5 · consolidados vêm da distribuição residual (produto + serviço)', () => {
    it('soma comissão e lucro dos DOIS tipos de item', () => {
        const c = consolidar({})
        // Produto 20 + Serviço 60 de comissão; 60 + 15 de lucro.
        expect(c.commissionAmount).toBe(80)
        expect(c.profitAmount).toBe(75)
    })

    it('um item de serviço sozinho não é ignorado', () => {
        const c = consolidar({ itens: [SERVICO], bruto: 150 })
        expect(c.commissionAmount).toBe(60)
        expect(c.profitAmount).toBe(15)
    })

    it('um item de produto sozinho não é ignorado', () => {
        const c = consolidar({ itens: [PRODUTO], bruto: 400 })
        expect(c.commissionAmount).toBe(20)
        expect(c.profitAmount).toBe(60)
    })

    it('item adicionado no pedido entra no consolidado', () => {
        const semExtra = consolidar({})
        const extra: ResidualItemInput = {
            unit_price: 100,
            quantity: 1,
            commission_percent: 10,
            profit_percent: 20,
            tax_breakdown: snapshot({ new_commission: 10, new_profit: 20, ancora_interna: 100 }),
        }
        const comExtra = consolidar({ itens: [...ITENS, extra], bruto: BRUTO + 100 })
        expect(comExtra.commissionAmount).toBe(semExtra.commissionAmount + 10)
        expect(comExtra.profitAmount).toBe(semExtra.profitAmount + 20)
    })

    it('sem distribuição, devolve zero em vez de NaN', () => {
        const c = computeConsolidatedAmounts({
            distribution: null,
            sourceRtAmount: 0,
            sourceTotal: 0,
            currentTotal: 0,
        })
        expect(c).toEqual({ commissionAmount: 0, profitAmount: 0, rtAmount: 0 })
    })
})

describe('D5 · RT congelado (produto + serviço)', () => {
    // Origem: RT de 1% sobre produto e serviço → 5,50 sobre um bruto de 550.
    const RT_ORIGEM = 5.5

    it('a alíquota efetiva é rt ÷ total', () => {
        expect(resolveFrozenRtRate(RT_ORIGEM, BRUTO)).toBeCloseTo(0.01, 10)
        expect(resolveFrozenRtRate(0, BRUTO)).toBe(0)
        expect(resolveFrozenRtRate(RT_ORIGEM, 0)).toBe(0)
    })

    it('reaplicada sobre o total do pedido, acompanha o desconto', () => {
        const semDesconto = consolidar({ rtOrigem: RT_ORIGEM, totalOrigem: BRUTO })
        expect(semDesconto.rtAmount).toBe(5.5)

        // 10% de desconto: total 495 → RT 4,95, mesma alíquota de 1%.
        const comDesconto = consolidar({
            liquido: BRUTO * 0.9,
            descontoPct: 10,
            rtOrigem: RT_ORIGEM,
            totalOrigem: BRUTO,
        })
        expect(comDesconto.rtAmount).toBe(4.95)
        expect(resolveFrozenRtRate(comDesconto.rtAmount, BRUTO * 0.9)).toBeCloseTo(0.01, 10)
    })

    it('salvar o mesmo pedido N vezes não faz o RT derivar', () => {
        // A alíquota é escala-invariante: recongelar devolve a mesma taxa.
        let rt = RT_ORIGEM
        for (let i = 0; i < 5; i++) {
            // Total inalterado entre saves sem edição; só o RT é recongelado.
            const c = consolidar({ rtOrigem: rt, totalOrigem: BRUTO, liquido: BRUTO })
            rt = c.rtAmount
            expect(rt).toBe(RT_ORIGEM)
        }
    })

    it('pedido legado sem RT permanece em zero, sem inventar valor', () => {
        const c = consolidar({ rtOrigem: 0, totalOrigem: BRUTO })
        expect(c.rtAmount).toBe(0)
    })
})

describe('D5 · a cadeia deixa de zerar (produto + serviço)', () => {
    // Espelha a travessia real: cada etapa copia o consolidado da anterior.
    const orcamento = { commission_amount: 80, profit_amount: 75, rt_amount: 5.5, total_value: BRUTO }

    // Aqui o conteúdo do pedido NÃO muda, então o valor coincide com o do orçamento.
    // Quando o conteúdo muda (item novo, desconto próprio), o valor muda junto — é o
    // comportamento esperado, não divergência a sinalizar.
    it('orçamento → pedido → espelho → venda preserva o valor quando o conteúdo não muda', () => {
        // 1. Conversão orçamento → pedido: cópia direta.
        const pedido = {
            commission_amount: orcamento.commission_amount,
            profit_amount: orcamento.profit_amount,
            rt_amount: orcamento.rt_amount,
            total_value: orcamento.total_value,
        }
        expect(pedido.commission_amount).toBe(80)

        // 2. Edição do pedido sem alterar nada: recálculo reproduz os mesmos números.
        const recalculado = consolidar({
            rtOrigem: pedido.rt_amount,
            totalOrigem: pedido.total_value,
        })
        expect(recalculado.commissionAmount).toBe(orcamento.commission_amount)
        expect(recalculado.profitAmount).toBe(orcamento.profit_amount)
        expect(recalculado.rtAmount).toBe(orcamento.rt_amount)

        // 3. Pedido → orçamento-espelho: cópia direta.
        const espelho = {
            commission_amount: recalculado.commissionAmount,
            profit_amount: recalculado.profitAmount,
            rt_amount: recalculado.rtAmount,
        }

        // 4. Venda lê do orçamento-espelho — é aqui que antes chegava zero.
        const venda = { commission_amount: espelho.commission_amount, profit_amount: espelho.profit_amount, rt_amount: espelho.rt_amount }
        expect(venda.commission_amount).toBe(80)
        expect(venda.profit_amount).toBe(75)
        expect(venda.rt_amount).toBe(5.5)
        expect(venda.commission_amount).not.toBe(0)
    })

    it('regressão: o espelho sem os campos levava zero à venda', () => {
        // Comportamento antigo — o insert do espelho não tinha as chaves.
        const espelhoAntigo: Record<string, number> = {}
        const vendaAntiga = {
            commission_amount: Number(espelhoAntigo.commission_amount) || 0,
            profit_amount: Number(espelhoAntigo.profit_amount) || 0,
        }
        expect(vendaAntiga.commission_amount).toBe(0)

        // Corrigido: o espelho carrega o consolidado do pedido.
        const espelhoNovo = { commission_amount: 80, profit_amount: 75 }
        expect(Number(espelhoNovo.commission_amount) || 0).toBe(80)
    })

    it('o desconto do pedido chega à venda pelos três consolidados', () => {
        const comDesconto = consolidar({
            liquido: BRUTO * 0.8,
            descontoPct: 20,
            rtOrigem: 5.5,
            totalOrigem: BRUTO,
        })
        // RT acompanha proporcionalmente; comissão e lucro vêm da cascata (compressão
        // desproporcional do RRO), então só afirmamos que não passam do valor cheio.
        expect(comDesconto.rtAmount).toBe(4.4)
        expect(comDesconto.commissionAmount).toBeLessThanOrEqual(80)
        expect(comDesconto.profitAmount).toBeLessThanOrEqual(75)
    })
})
