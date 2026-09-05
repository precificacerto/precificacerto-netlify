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
import { buildMotorInput } from '@/utils/mrm-orchestrator'
import {
    resolveInheritedRtPctDecimal,
    type RtCatalogEntry,
} from '@/utils/balcao-rt'
import type { TaxBreakdown } from '@/types/mrm'

/**
 * As colunas de `budget_items` que `mapBudgetItemsToSaleItems` LÊ.
 *
 * Existe porque a lista de colunas do `select` é a outra metade do mapeamento, e ela
 * divergiu sozinha: a rota de Vendas não pedia `rt_pct`, então `resolveInheritedRtPctDecimal`
 * recebia `undefined` e caía no cadastro vivo, ignorando o RT CONGELADO no item do orçamento
 * (D8). Um `select` que não pede o que o mapeador lê é um defeito silencioso — nada falha,
 * o campo só chega vazio.
 *
 * Com a lista aqui, ela deixa de ser possível por omissão: o teste afirma que toda
 * propriedade de `BudgetItemForSale` está nesta lista, então acrescentar um campo ao
 * mapeamento sem acrescentá-lo ao `select` quebra o build.
 *
 * A rota de Orçamentos usa `select('*')` — superconjunto trivialmente correto, mantido
 * como está.
 */
export const BUDGET_ITEM_COLUMNS_FOR_SALE = [
    'product_id',
    'service_id',
    'quantity',
    'unit_price',
    'discount',
    'manual_description',
    'commission_pct',
    'profit_pct',
    'rt_pct',
    'tax_breakdown',
    // D-A: o destino congelado do item do orçamento. Fora desta lista ele chegaria
    // `undefined` e a venda cairia na matriz pelo `calc_type` atual — o D12 outra vez.
    'destination_snapshot',
] as const

/** A mesma lista no formato que o `.select()` do Supabase espera. */
export const BUDGET_ITEM_SELECT_FOR_SALE = BUDGET_ITEM_COLUMNS_FOR_SALE.join(', ')

/**
 * Linha de `budget_items` no que interessa à travessia para a venda.
 *
 * Toda propriedade daqui TEM que estar em `BUDGET_ITEM_COLUMNS_FOR_SALE` — há teste.
 */
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
    /** D-A: snapshot de destino congelado na inserção do item no orçamento. */
    destination_snapshot?: unknown
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
    /** D-A: atravessa intacto — a venda lê o destino que formou o preço do orçamento. */
    destination_snapshot: unknown
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
                commission_pct: Number(bi.commission_pct ?? 0),
                profit_pct: Number(bi.profit_pct ?? 0),
                prev_breakdown: bi.tax_breakdown ?? null,
            // `budget_items` NÃO TEM COLUNA DE CUSTO — é a 6ª aparição de
            // `fato-vs-referencia.md`. Aqui não há de onde derivar custo nem alíquotas, e ir
            // buscar no cadastro seria reler referência viva, que é o que o D-A proíbe. Ainda
            // assim a entrada passa pelo construtor ÚNICO, para não existir uma segunda rota:
            // sem esses dados ele devolve zeros, e eles só chegam a valer quando
            // `prev_breakdown` é nulo (item legado). Com snapshot, `hydrateItemSnapshot` o
            // preserva e nada disto é usado.
            motorInput: buildMotorInput({
                item: {
                    unit_price: Number(bi.unit_price) || 0,
                    quantity: Number(bi.quantity) || 0,
                    commission_percent: Number(bi.commission_pct ?? 0) * 100,
                    profit_percent: Number(bi.profit_pct ?? 0) * 100,
                },
                tenantCtx: {
                    regime: opts.snapshotCtx.regime,
                    rates: opts.snapshotCtx.rates,
                    csll_pct: opts.snapshotCtx.csll_pct,
                    irpj_pct: opts.snapshotCtx.irpj_pct,
                    useSnapshotRates: opts.snapshotCtx.use_snapshot_rates,
                },
                globalDiscountPercent: 0,
                discountMode: 'PROPORTIONAL',
            }),
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
            // D-A: cópia literal. A venda NÃO reresolve o destino pelo cadastro nem pelo
            // `calc_type` de hoje — o item do orçamento já responde por ele. `null`/ausente
            // segue significando item legado, e nunca destino FORA.
            destination_snapshot: bi.destination_snapshot ?? null,
        }
    })
}
