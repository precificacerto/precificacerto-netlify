/**
 * Histórico do Cliente — detalhe por venda, a partir do dado ESTRUTURADO.
 *
 * O DADO JÁ EXISTIA. O painel exibia serviço, funcionário, data, total e status; os itens,
 * as quantidades, os unitários e o parcelamento estavam em `sale_items` e `cash_entries`
 * desde sempre. Não era falta de informação — era a tela não exibir o que o banco tinha.
 *
 * POR QUE `sale_items` E NÃO O TEXTO: a hipótese inicial era que o detalhamento vivia em
 * `cash_entries.description`. Medido: 63 de 63 vendas ativas têm `sale_items`; ZERO têm o
 * texto rico. As 14 linhas que o têm apontam `origin_id` para `calendar_events`, não para
 * `sales` — vínculo quebrado, registrado como item próprio. Ler dali seria parsing de string
 * sobre dado que não existe.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    buildInstallmentPlan,
    buildSaleHistoryDetail,
    type SaleHistoryCashEntryRow,
    type SaleHistoryItemRow,
} from '@/utils/sale-history-detail'

// Venda real do ORC do Salão Eliane: serviço R$ 85,00 + produto R$ 4,62 = R$ 89,62, PIX.
const SERVICO: SaleHistoryItemRow = {
    service_id: 'svc-1', product_id: null, quantity: 1, unit_price: 85, description: 'Corte e Barba',
}
const PRODUTO: SaleHistoryItemRow = {
    service_id: null, product_id: 'prod-1', quantity: 1, unit_price: 4.62, description: 'Agua mineral',
}
const MANUAL: SaleHistoryItemRow = {
    service_id: null, product_id: null, quantity: 2, unit_price: 10, description: 'Frete',
}
const VENDA = { final_value: 89.62, payment_method: 'PIX' }
const CATALOGO = {
    products: [{ id: 'prod-1', name: 'Água mineral 500ml' }],
    services: [{ id: 'svc-1', name: 'Corte e Barba' }],
}

describe('Itens discriminados — PRODUTO e SERVIÇO', () => {
    it('cada item com nome, quantidade e valor unitário', () => {
        const d = buildSaleHistoryDetail({ sale: VENDA, items: [SERVICO, PRODUTO], cashEntries: [], ...CATALOGO })
        expect(d.itens).toEqual([
            { nome: 'Corte e Barba', tipo: 'SERVICO', quantidade: 1, valorUnitario: 85, total: 85 },
            { nome: 'Água mineral 500ml', tipo: 'PRODUTO', quantidade: 1, valorUnitario: 4.62, total: 4.62 },
        ])
    })

    it('serviço e produto são distinguíveis, e o item manual também', () => {
        const d = buildSaleHistoryDetail({ sale: VENDA, items: [SERVICO, PRODUTO, MANUAL], cashEntries: [], ...CATALOGO })
        expect(d.itens.map((i) => i.tipo)).toEqual(['SERVICO', 'PRODUTO', 'MANUAL'])
        expect(d.itens[2]).toEqual({ nome: 'Frete', tipo: 'MANUAL', quantidade: 2, valorUnitario: 10, total: 20 })
    })

    it('o nome vem do cadastro vivo; a descrição gravada cobre o que não tem cadastro', () => {
        // Cadastro apagado ou item manual: cai na descrição gravada com a venda.
        const d = buildSaleHistoryDetail({
            sale: VENDA, items: [{ ...PRODUTO, product_id: 'sumiu' }], cashEntries: [], ...CATALOGO,
        })
        expect(d.itens[0].nome).toBe('Agua mineral')
    })

    it('sem nome em lugar nenhum, não inventa: rótulo explícito', () => {
        const d = buildSaleHistoryDetail({ sale: VENDA, items: [{ quantity: 1, unit_price: 5 }], cashEntries: [] })
        expect(d.itens[0].nome).toBe('Item sem descrição')
    })

    it('quantidade > 1 multiplica no total da linha', () => {
        const d = buildSaleHistoryDetail({
            sale: VENDA, items: [{ ...PRODUTO, quantity: 3 }], cashEntries: [], ...CATALOGO,
        })
        expect(d.itens[0].total).toBeCloseTo(13.86, 6)
    })
})

describe('Subtotal e total', () => {
    it('subtotal é a soma das linhas; total vem da VENDA', () => {
        const d = buildSaleHistoryDetail({ sale: VENDA, items: [SERVICO, PRODUTO], cashEntries: [], ...CATALOGO })
        expect(d.subtotal).toBeCloseTo(89.62, 6)
        expect(d.total).toBeCloseTo(89.62, 6)
    })

    it('quando os dois divergem, quem manda é o total GRAVADO na venda', () => {
        // O subtotal descreve os itens; o total descreve o que a venda registrou. Substituir
        // um pelo outro esconderia a divergência em vez de mostrá-la.
        const d = buildSaleHistoryDetail({
            sale: { final_value: 80, payment_method: 'PIX' }, items: [SERVICO, PRODUTO], cashEntries: [], ...CATALOGO,
        })
        expect(d.subtotal).toBeCloseTo(89.62, 6)
        expect(d.total).toBe(80)
    })

    it('forma de pagamento atravessa; ausente vira null e não string vazia', () => {
        expect(buildSaleHistoryDetail({ sale: VENDA, items: [], cashEntries: [] }).formaPagamento).toBe('PIX')
        expect(buildSaleHistoryDetail({ sale: { final_value: 1 }, items: [], cashEntries: [] }).formaPagamento).toBeNull()
    })
})

describe('Parcelamento — total, valor, vencimento e quais liquidadas', () => {
    const PARCELAS: SaleHistoryCashEntryRow[] = [
        { amount: 100, due_date: '2026-09-10', paid_date: '2026-09-10' },
        { amount: 100, due_date: '2026-10-10', paid_date: null },
        { amount: 100, due_date: '2026-11-10', paid_date: null },
    ]

    it('numera na ordem de vencimento e marca as liquidadas', () => {
        const p = buildInstallmentPlan(PARCELAS)!
        expect(p.total).toBe(3)
        expect(p.liquidadas).toBe(1)
        expect(p.emAberto).toBe(2)
        expect(p.valorTotal).toBe(300)
        expect(p.parcelas[0]).toEqual({ numero: 1, de: 3, valor: 100, vencimento: '2026-09-10', liquidada: true })
        expect(p.parcelas[2]).toEqual({ numero: 3, de: 3, valor: 100, vencimento: '2026-11-10', liquidada: false })
    })

    it('a ordem de chegada não importa — o vencimento ordena', () => {
        const embaralhadas = [PARCELAS[2], PARCELAS[0], PARCELAS[1]]
        expect(buildInstallmentPlan(embaralhadas)!.parcelas.map((p) => p.vencimento))
            .toEqual(['2026-09-10', '2026-10-10', '2026-11-10'])
    })

    it('parcela sem vencimento vai para o fim sem quebrar a numeração das outras', () => {
        const p = buildInstallmentPlan([{ amount: 50, due_date: null }, ...PARCELAS])!
        expect(p.total).toBe(4)
        expect(p.parcelas.map((x) => x.numero)).toEqual([1, 2, 3, 4])
        expect(p.parcelas[3].vencimento).toBeNull()
    })

    it('à vista é UMA parcela, e liquidada quando paga', () => {
        const p = buildInstallmentPlan([{ amount: 89.62, due_date: '2026-09-02', paid_date: '2026-09-02' }])!
        expect(p.total).toBe(1)
        expect(p.liquidadas).toBe(1)
        expect(p.emAberto).toBe(0)
    })
})

describe('AUSÊNCIA DE LANÇAMENTO É null — o bloco é OMITIDO, não zerado', () => {
    /**
     * Sete das 63 vendas ativas não têm nenhum `cash_entry`. Para elas o parcelamento não é
     * conhecido — e "não conhecido" não é "zero parcelas". Uma lista vazia afirmaria que a
     * venda não tem parcela nenhuma; `null` diz que não há o que exibir. Não estimar a partir
     * de `sales.installments`, não inferir do total: omitir.
     */
    it('sem lançamento nenhum: parcelamento null, para PRODUTO e SERVIÇO', () => {
        expect(buildSaleHistoryDetail({ sale: VENDA, items: [PRODUTO], cashEntries: [], ...CATALOGO }).parcelamento).toBeNull()
        expect(buildSaleHistoryDetail({ sale: VENDA, items: [SERVICO], cashEntries: [], ...CATALOGO }).parcelamento).toBeNull()
        expect(buildInstallmentPlan([])).toBeNull()
    })

    it('com UM lançamento já há bloco — a distinção é ter ou não ter, não a quantidade', () => {
        expect(buildSaleHistoryDetail({
            sale: VENDA, items: [PRODUTO], cashEntries: [{ amount: 89.62, due_date: '2026-09-02' }], ...CATALOGO,
        }).parcelamento).not.toBeNull()
    })

    it('o resto do detalhe continua completo mesmo sem parcelamento', () => {
        const d = buildSaleHistoryDetail({ sale: VENDA, items: [SERVICO, PRODUTO], cashEntries: [], ...CATALOGO })
        expect(d.itens).toHaveLength(2)
        expect(d.total).toBeCloseTo(89.62, 6)
        expect(d.formaPagamento).toBe('PIX')
    })
})

describe('DESCONTO NÃO ENTRA — ausência de gravação, não de exibição', () => {
    /**
     * `sale_items.discount` está zerado em 111 de 111 linhas e `sales` não tem coluna de
     * desconto (só `discount_mode`). Exibir um campo que sempre mostra zero seria PIOR que
     * omitir, porque AFIRMARIA QUE NÃO HOUVE DESCONTO. Registrado como item próprio.
     */
    it('o detalhe não tem campo de desconto', () => {
        const d = buildSaleHistoryDetail({ sale: VENDA, items: [SERVICO, PRODUTO], cashEntries: [], ...CATALOGO })
        expect(Object.keys(d).sort()).toEqual(['formaPagamento', 'itens', 'parcelamento', 'subtotal', 'total'])
        expect(d.itens.every((i) => !('desconto' in i))).toBe(true)
    })
})

describe('SEGMENTADO POR VENDA — o histórico não consolida', () => {
    it('duas vendas do mesmo cliente produzem dois detalhes independentes', () => {
        // Um cliente tem várias vendas, cada uma com condição própria. Somar duas numa linha
        // só produz um número que não corresponde a venda nenhuma.
        const a = buildSaleHistoryDetail({
            sale: { final_value: 89.62, payment_method: 'PIX' },
            items: [SERVICO, PRODUTO], cashEntries: [], ...CATALOGO,
        })
        const b = buildSaleHistoryDetail({
            sale: { final_value: 300, payment_method: 'BOLETO' },
            items: [MANUAL],
            cashEntries: [
                { amount: 150, due_date: '2026-09-10', paid_date: '2026-09-10' },
                { amount: 150, due_date: '2026-10-10' },
            ],
            ...CATALOGO,
        })
        expect(a.total).toBeCloseTo(89.62, 6)
        expect(b.total).toBe(300)
        expect(a.formaPagamento).toBe('PIX')
        expect(b.formaPagamento).toBe('BOLETO')
        expect(a.parcelamento).toBeNull()
        expect(b.parcelamento!.total).toBe(2)
        // Nenhum campo de uma vazou para a outra.
        expect(a.itens).toHaveLength(2)
        expect(b.itens).toHaveLength(1)
    })
})
