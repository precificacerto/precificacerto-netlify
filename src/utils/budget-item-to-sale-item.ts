/**
 * budget-item-to-sale-item.ts — mapeamento de `budget_items` → `sale_items` na
 * finalização de um orçamento em venda.
 *
 * POR QUE ISTO EXISTE COMO MÓDULO:
 * havia DUAS rotas criando venda a partir de orçamento — `vendas/index.tsx` e
 * `orcamentos/index.tsx` — cada uma com sua cópia do mapeamento. Elas divergiram: a de
 * Orçamentos levava apenas `product_id`, `quantity`, `unit_price` e `discount`. O item
 * de SERVIÇO chegava sem `service_id` (linha sem produto e sem serviço), a herança
 * fiscal (`commission_pct`, `profit_pct`, `tax_breakdown`) se perdia, e a descrição do
 * item manual sumia.
 *
 * Com o mapeamento em um lugar só, a divergência deixa de ser possível por omissão:
 * acrescentar um campo aqui vale para quem usar este módulo.
 *
 * NÃO recalcula nada do motor RRO. O snapshot do orçamento é a fonte de verdade e é
 * PRESERVADO quando existe — `hydrateItemSnapshot` só recompõe quando não há snapshot
 * anterior (item legado).
 */

import { hydrateItemSnapshot, type TenantSnapshotContext } from '@/lib/items-snapshot'
import {
    resolveInheritedRtPctDecimal,
    type RtCatalogEntry,
} from '@/utils/balcao-rt'
import type { TaxBreakdown } from '@/types/mrm'

/** Linha de `budget_items` no que interessa à travessia para a venda. */
export interface BudgetItemForSale {
    product_id?: string | null
    service_id?: string | null
    quantity?: number | null
    unit_price?: number | null
    discount?: number | null
    manual_description?: string | null
    commission_pct?: number | null
    profit_pct?: number | null
    rt_pct?: number | null
    tax_breakdown?: TaxBreakdown | null
}

/**
 * Linha pronta para `sale_items.insert`.
 *
 * Declarada como TYPE ALIAS, não interface: `distributeDiscountToItems` exige
 * `ItemWithPrice`, que tem index signature, e interfaces não ganham uma implicitamente
 * — só type aliases ganham. Como interface, a linha não seria atribuível ali.
 */
export type SaleItemRow = {
    sale_id: string
    product_id: string | null
    service_id: string | null
    quantity: number
    unit_price: number
    discount: number
    description: string | null
    commission_pct: number
    profit_pct: number
    rt_pct: number
    tax_breakdown: TaxBreakdown | null
}

export interface MapBudgetItemsOptions {
    saleId: string
    snapshotCtx: TenantSnapshotContext
    shadowCtx?: { tenant_id: string; document_id: string; document_type: 'sale' }
    products?: readonly RtCatalogEntry[]
    services?: readonly RtCatalogEntry[]
}

/**
 * Converte os itens de um orçamento nas linhas de `sale_items` da venda.
 *
 * Todo campo que o orçamento carrega e a venda precisa atravessa aqui — inclusive
 * `service_id`, que é o que distingue um item de serviço de uma linha órfã.
 */
export function mapBudgetItemsToSaleItems(
    budgetItems: readonly BudgetItemForSale[],
    opts: MapBudgetItemsOptions,
): SaleItemRow[] {
    return budgetItems.map((bi) => {
        // Idempotente: snapshot válido do orçamento é PRESERVADO (AC3 — imutabilidade).
        const snap = hydrateItemSnapshot(
            {
                unit_price: Number(bi.unit_price) || 0,
                quantity: Number(bi.quantity) || 0,
                commission_pct: Number(bi.commission_pct ?? 0),
                profit_pct: Number(bi.profit_pct ?? 0),
                prev_breakdown: bi.tax_breakdown ?? null,
            },
            opts.snapshotCtx,
            opts.shadowCtx,
        )
        return {
            sale_id: opts.saleId,
            product_id: bi.product_id || null,
            // O campo que sumia: sem ele o item de serviço vira linha sem produto E sem
            // serviço, indistinguível de um item manual.
            service_id: bi.service_id || null,
            quantity: Number(bi.quantity) || 0,
            unit_price: Number(bi.unit_price) || 0,
            discount: Number(bi.discount) || 0,
            description: bi.manual_description || null,
            commission_pct: snap.commission_pct,
            profit_pct: snap.profit_pct,
            rt_pct: resolveInheritedRtPctDecimal(bi.rt_pct, bi, opts.products, opts.services),
            tax_breakdown: snap.tax_breakdown,
        }
    })
}
