/**
 * Venda direta — `sale_items` nascia incompleto ao finalizar um orçamento.
 *
 * Existiam DUAS rotas criando venda a partir de orçamento, cada uma com sua cópia do
 * mapeamento, e elas divergiram. A de `orcamentos/index.tsx` levava apenas
 * `product_id`, `quantity`, `unit_price` e `discount` — perdendo `service_id`,
 * `description`, `commission_pct`, `profit_pct` e `tax_breakdown`.
 *
 * Consequência mais grave: item de SERVIÇO chegava sem `service_id`, virando uma linha
 * sem produto e sem serviço — indistinguível de um item manual.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    mapBudgetItemsToSaleItems,
    type BudgetItemForSale,
} from '@/utils/budget-item-to-sale-item'
import type { TenantSnapshotContext } from '@/lib/items-snapshot'
import type { TaxBreakdown } from '@/types/mrm'

/** `use_snapshot_rates: false` ⇒ hydrate devolve tax_breakdown null e preserva os pesos. */
const CTX_SEM_SNAPSHOT: TenantSnapshotContext = {
    regime: 'SIMPLES_NACIONAL',
    rates: [],
    csll_pct: 0,
    irpj_pct: 0,
    use_snapshot_rates: false,
}

const SNAPSHOT_DO_ORCAMENTO = {
    status: 'VALID',
    valid: true,
    rro: 100,
    new_commission: 20,
    new_profit: 60,
} as unknown as TaxBreakdown

const PRODUTOS = [{ id: 'prod-1', rt_reserve_percent: 1 }]
const SERVICOS = [{ id: 'svc-1', rt_reserve_percent: 2 }]

const ITEM_PRODUTO: BudgetItemForSale = {
    product_id: 'prod-1',
    service_id: null,
    quantity: 2,
    unit_price: 100,
    discount: 5,
    commission_pct: 0.05,
    profit_pct: 0.15,
    tax_breakdown: SNAPSHOT_DO_ORCAMENTO,
}
const ITEM_SERVICO: BudgetItemForSale = {
    product_id: null,
    service_id: 'svc-1',
    quantity: 1,
    unit_price: 150,
    discount: 0,
    commission_pct: 0.4,
    profit_pct: 0.1,
    tax_breakdown: SNAPSHOT_DO_ORCAMENTO,
}
const ITEM_MANUAL: BudgetItemForSale = {
    product_id: null,
    service_id: null,
    quantity: 1,
    unit_price: 80,
    manual_description: 'Frete cobrado do cliente',
}

const opts = {
    saleId: 'sale-1',
    snapshotCtx: CTX_SEM_SNAPSHOT,
    products: PRODUTOS,
    services: SERVICOS,
}

describe('venda direta · o item de SERVIÇO não vira linha órfã', () => {
    it('service_id atravessa do orçamento para a venda', () => {
        const [linha] = mapBudgetItemsToSaleItems([ITEM_SERVICO], opts)
        expect(linha.service_id).toBe('svc-1')
        expect(linha.product_id).toBeNull()
    })

    it('regressão: o mapeamento antigo perdia o service_id', () => {
        // Comportamento anterior — só estes quatro campos eram copiados.
        const antigo = {
            sale_id: 'sale-1',
            product_id: ITEM_SERVICO.product_id,
            quantity: ITEM_SERVICO.quantity,
            unit_price: ITEM_SERVICO.unit_price,
            discount: ITEM_SERVICO.discount,
        } as Record<string, unknown>
        expect(antigo.service_id).toBeUndefined()
        expect(antigo.product_id).toBeNull()
        // Produto nulo E serviço ausente: indistinguível de item manual.

        const [novo] = mapBudgetItemsToSaleItems([ITEM_SERVICO], opts)
        expect(novo.service_id).toBe('svc-1')
    })

    it('produto e serviço continuam distinguíveis entre si e do manual', () => {
        const linhas = mapBudgetItemsToSaleItems([ITEM_PRODUTO, ITEM_SERVICO, ITEM_MANUAL], opts)
        expect(linhas.map(l => [l.product_id, l.service_id])).toEqual([
            ['prod-1', null],
            [null, 'svc-1'],
            [null, null],
        ])
        // Só o manual é órfão dos dois — e legitimamente.
        expect(linhas.filter(l => !l.product_id && !l.service_id)).toHaveLength(1)
        expect(linhas[2].description).toBe('Frete cobrado do cliente')
    })
})

describe('venda direta · herança fiscal — PRODUTO e SERVIÇO', () => {
    it('PRODUTO: comissão, lucro e RT atravessam', () => {
        const [linha] = mapBudgetItemsToSaleItems([ITEM_PRODUTO], opts)
        expect(linha.commission_pct).toBe(0.05)
        expect(linha.profit_pct).toBe(0.15)
        expect(linha.rt_pct).toBe(0.01) // cadastro do produto: 1%
    })

    it('SERVIÇO: comissão, lucro e RT atravessam', () => {
        const [linha] = mapBudgetItemsToSaleItems([ITEM_SERVICO], opts)
        expect(linha.commission_pct).toBe(0.4)
        expect(linha.profit_pct).toBe(0.1)
        expect(linha.rt_pct).toBe(0.02) // cadastro do serviço: 2%
    })

    it('o snapshot do orçamento é PRESERVADO, não recalculado', () => {
        const ctxComSnapshot: TenantSnapshotContext = { ...CTX_SEM_SNAPSHOT, use_snapshot_rates: true }
        const linhas = mapBudgetItemsToSaleItems([ITEM_PRODUTO, ITEM_SERVICO], {
            ...opts,
            snapshotCtx: ctxComSnapshot,
        })
        for (const l of linhas) {
            expect(l.tax_breakdown).toBe(SNAPSHOT_DO_ORCAMENTO)
        }
    })

    it('item manual é repasse puro: sem comissão, sem lucro, sem RT', () => {
        const [linha] = mapBudgetItemsToSaleItems([ITEM_MANUAL], opts)
        expect(linha.commission_pct).toBe(0)
        expect(linha.profit_pct).toBe(0)
        expect(linha.rt_pct).toBe(0)
    })
})

describe('venda direta · os campos que já funcionavam seguem iguais', () => {
    it('quantidade, preço e desconto atravessam sem alteração', () => {
        const linhas = mapBudgetItemsToSaleItems([ITEM_PRODUTO, ITEM_SERVICO], opts)
        expect(linhas[0]).toMatchObject({ sale_id: 'sale-1', quantity: 2, unit_price: 100, discount: 5 })
        expect(linhas[1]).toMatchObject({ sale_id: 'sale-1', quantity: 1, unit_price: 150, discount: 0 })
    })

    it('campos ausentes viram 0 ou null, nunca NaN ou undefined', () => {
        const [linha] = mapBudgetItemsToSaleItems([{ product_id: 'prod-1' }], opts)
        expect(linha.quantity).toBe(0)
        expect(linha.unit_price).toBe(0)
        expect(linha.discount).toBe(0)
        expect(linha.description).toBeNull()
        expect(linha.service_id).toBeNull()
        expect(Number.isNaN(linha.commission_pct)).toBe(false)
    })

    it('nenhum campo do contrato sai undefined', () => {
        const linhas = mapBudgetItemsToSaleItems([ITEM_PRODUTO, ITEM_SERVICO, ITEM_MANUAL], opts)
        const esperados = [
            'sale_id', 'product_id', 'service_id', 'quantity', 'unit_price',
            'discount', 'description', 'commission_pct', 'profit_pct', 'rt_pct', 'tax_breakdown',
        ]
        for (const l of linhas) {
            for (const campo of esperados) {
                expect(Object.prototype.hasOwnProperty.call(l, campo)).toBe(true)
                expect((l as unknown as Record<string, unknown>)[campo]).not.toBeUndefined()
            }
        }
    })
})
