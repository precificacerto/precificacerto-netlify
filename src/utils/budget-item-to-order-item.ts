/**
 * budget-item-to-order-item.ts — mapeamento de `budget_items` → `order_items` no envio de um
 * orçamento para pedido.
 *
 * POR QUE ISTO EXISTE COMO MÓDULO:
 * a travessia para a VENDA já tinha contrato de colunas com teste
 * (`budget-item-to-sale-item.ts`); a travessia para o PEDIDO tinha uma lista de `select`
 * escrita à mão. Elas divergiram exatamente onde uma lista à mão diverge: o `select` do
 * pedido não pedia `destination_snapshot`, então `bi.destination_snapshot` chegava
 * `undefined`, o `?? null` gravava NULL, e o pedido voltava a resolver o destino pela matriz
 * do `calc_type` ATUAL — a forma que o D-A (#34) existe para tornar impossível.
 *
 * Medição pareada em 05/09/2026, cada item de destino contra o `budget_item` de origem do
 * mesmo produto/serviço:
 *
 *   orçamento → pedido   23 pares,  6 com origem preenchida,  0 preservaram,  6 perderam
 *   orçamento → venda    41 pares,  2 com origem preenchida,  2 preservaram,  0 perderam
 *
 * A venda tem n = 2: está DEMONSTRADA funcionando em 2 de 2, não provada. O que a medição
 * afirma é que **não há perda observada na venda e há perda total no pedido**.
 *
 * É a mesma assinatura da 5ª aparição de `fato-vs-referencia.md` — *"`rt_pct`: RT congelado
 * ignorado; o `select` não pedia a coluna e caía no cadastro vivo"*. Mesmo arquivo, mesmo
 * mecanismo, outra coluna. Por isso a correção não é acrescentar a string ao `select`: é tirar
 * a lista da mão, como o #28 fez para a venda.
 *
 * NÃO recalcula nada do motor. O item do orçamento já respondeu pelo destino; o pedido herda.
 */

import { resolveInheritedRtPctDecimal, type RtCatalogEntry } from '@/utils/balcao-rt'
import type { TaxBreakdown } from '@/types/mrm'

/**
 * As colunas de `budget_items` que `mapBudgetItemsToOrderItems` LÊ.
 *
 * O teste afirma que toda propriedade de `BudgetItemForOrder` está nesta lista — acrescentar
 * um campo ao mapeamento sem acrescentá-lo aqui quebra o build, que é a única forma de a
 * omissão não passar em silêncio. Um `select` que não pede o que o mapeador lê não falha:
 * o campo só chega vazio.
 */
export const BUDGET_ITEM_COLUMNS_FOR_ORDER = [
    'product_id',
    'service_id',
    'quantity',
    'unit_price',
    'manual_description',
    'commission_pct',
    'profit_pct',
    'rt_pct',
    'tax_breakdown',
    // D-A: o destino congelado do item do orçamento. Fora desta lista ele chega `undefined`
    // e o pedido cai na matriz pelo `calc_type` atual — o D12 outra vez.
    'destination_snapshot',
] as const

/** A mesma lista no formato que o `.select()` do Supabase espera. */
export const BUDGET_ITEM_SELECT_FOR_ORDER = BUDGET_ITEM_COLUMNS_FOR_ORDER.join(', ')

/** Linha de `budget_items` no que interessa à travessia para o pedido. */
export interface BudgetItemForOrder {
    product_id?: string | null
    service_id?: string | null
    quantity?: number | null
    unit_price?: number | null
    manual_description?: string | null
    commission_pct?: number | null
    profit_pct?: number | null
    rt_pct?: number | null
    tax_breakdown?: TaxBreakdown | null
    /** D-A: snapshot de destino congelado na inserção do item no orçamento. */
    destination_snapshot?: unknown
}

/** Linha pronta para `insert` em `order_items`. */
export interface OrderItemRowToInsert {
    order_id: string
    product_id: string | null
    service_id: string | null
    quantity: number
    unit_price: number
    total_price: number
    manual_description: string | null
    commission_pct: number | null
    profit_pct: number | null
    rt_pct: number
    tax_breakdown: TaxBreakdown | null
    destination_snapshot: unknown
}

/**
 * Copia os itens do orçamento para o pedido.
 *
 * `unit_price` fica o ORIGINAL — o desconto é preservado em `orders.discount_percent` e
 * aplicado no cálculo de `total_value`, para que o usuário possa ver e editar o desconto no
 * pedido sem perder a granularidade dos preços dos itens.
 */
export function mapBudgetItemsToOrderItems(
    budgetItems: BudgetItemForOrder[],
    orderId: string,
    catalogs: { products: RtCatalogEntry[]; services: RtCatalogEntry[] },
): OrderItemRowToInsert[] {
    return budgetItems.map((bi) => ({
        order_id: orderId,
        product_id: bi.product_id || null,
        service_id: bi.service_id || null,
        quantity: bi.quantity || 0,
        unit_price: bi.unit_price || 0,
        total_price: (bi.quantity || 0) * (bi.unit_price || 0),
        manual_description: bi.manual_description || null,
        // Herança fiscal orçamento→pedido (fonte de verdade — Q2: não recalcula)
        commission_pct: bi.commission_pct ?? null,
        profit_pct: bi.profit_pct ?? null,
        // D8: herda o RT congelado do orçamento; cai no cadastro se a linha for legada
        // (`rt_pct` nunca gravado, portanto 0).
        rt_pct: resolveInheritedRtPctDecimal(bi.rt_pct, bi, catalogs.products, catalogs.services),
        tax_breakdown: bi.tax_breakdown ?? null,
        // D-A: o pedido herda o destino congelado do orçamento, não o do cadastro — o item
        // do orçamento já respondeu por ele.
        destination_snapshot: bi.destination_snapshot ?? null,
    }))
}
