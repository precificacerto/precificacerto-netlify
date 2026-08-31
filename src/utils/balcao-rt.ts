/**
 * EPIC-RT v8 / D15 — resolução do RT (Comissão Reserva Técnica) dos itens da Venda no Balcão.
 *
 * POR QUE O RT SAI DO ITEM, E NÃO DO CADASTRO:
 * Orçamento, pedido e venda partem da MESMA origem — o cadastro do produto/serviço. No
 * momento da seleção do item, o `rt_reserve_percent` do cadastro é COPIADO para o objeto do
 * item e congelado ali, exatamente como já acontece com `commission_percent` e
 * `profit_percent`. É esse valor congelado que o motor consome e que a venda persiste, de
 * modo que uma alteração posterior no cadastro não reescreve o passado.
 *
 * Portanto a FONTE PRIMÁRIA é o item. O fallback ao cadastro vivo abaixo existe apenas para
 * itens antigos, montados antes de o campo passar a ser congelado na seleção — não é (e não
 * pode virar) o caminho normal: ele resolve por catálogo e falha em silêncio sempre que o
 * item não estiver lá (foi assim que o RT de SERVIÇO zerou na VD-51B0E2, porque o fallback
 * só olhava `products` por `product_id`, nulo em item de serviço).
 */

/** Entrada mínima de catálogo (products/services) usada na resolução do RT. */
export interface RtCatalogEntry {
    id: string
    rt_reserve_percent?: number | null
}

/** Item de venda no que interessa ao RT. */
export interface RtSaleItemLike {
    product_id?: string | null
    service_id?: string | null
    rt_reserve_percent?: number | null
    unit_price?: number | null
    quantity?: number | null
}

const toPct = (v: unknown): number => Number(v) || 0

/**
 * % de RT do item, base-100.
 * Precedência: item congelado → cadastro do produto → cadastro do serviço → 0.
 */
export function resolveItemRtPercent(
    item: RtSaleItemLike,
    products: readonly RtCatalogEntry[] = [],
    services: readonly RtCatalogEntry[] = [],
): number {
    if (item?.rt_reserve_percent != null) return toPct(item.rt_reserve_percent)
    // Fallback (itens legados): resolve por product_id OU service_id — item de serviço
    // tem product_id nulo, e olhar só `products` devolvia 0 silenciosamente.
    const prod = item?.product_id ? products.find(p => p.id === item.product_id) : null
    if (prod?.rt_reserve_percent != null) return toPct(prod.rt_reserve_percent)
    const svc = item?.service_id ? services.find(s => s.id === item.service_id) : null
    return toPct(svc?.rt_reserve_percent)
}

/**
 * RT consolidado da venda (R$), persistido em `sales.rt_amount`.
 *
 * Apura a alíquota efetiva ponderada pelo valor bruto dos itens e a aplica sobre o total
 * já descontado — assim o RT acompanha o desconto global sem recalcular item a item.
 */
export function computeSaleRtAmount(
    items: readonly RtSaleItemLike[],
    products: readonly RtCatalogEntry[] = [],
    services: readonly RtCatalogEntry[] = [],
    saleTotalWithDiscount = 0,
): number {
    const gross = (i: RtSaleItemLike) => (Number(i.unit_price) || 0) * (Number(i.quantity) || 0)
    const weighted = items.reduce((s, i) => s + gross(i) * resolveItemRtPercent(i, products, services) / 100, 0)
    const total = items.reduce((s, i) => s + gross(i), 0)
    return total > 0 ? (weighted / total) * saleTotalWithDiscount : 0
}
