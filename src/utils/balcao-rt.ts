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

/** Casas decimais de `*_items.rt_pct` — a coluna é NUMERIC(8,5). */
const RT_PCT_DECIMALS = 5

/** Converte % base-100 para o decimal persistido em `rt_pct` (1 ⇒ 0.01). */
export function toRtPctDecimal(percentBase100: unknown): number {
    const n = Number(percentBase100)
    if (!Number.isFinite(n) || n === 0) return 0
    const factor = 10 ** RT_PCT_DECIMALS
    return Math.round((n / 100) * factor) / factor
}

/**
 * Alíquota de RT do item pronta para PERSISTIR em `*_items.rt_pct` (decimal).
 *
 * D8: a migração `20260713000003_add_rt_persistence_pipeline` criou as três colunas
 * (`budget_items`, `order_items`, `sale_items`) para congelar o RT por item, espelhando
 * `commission_pct`. O schema foi entregue; a gravação nunca foi escrita, e as três
 * ficaram zeradas em 100% das linhas. Este helper é o lado que faltava.
 */
export function resolveItemRtPctDecimal(
    item: RtSaleItemLike,
    products: readonly RtCatalogEntry[] = [],
    services: readonly RtCatalogEntry[] = [],
): number {
    return toRtPctDecimal(resolveItemRtPercent(item, products, services))
}

/**
 * RT a persistir quando o item NASCE de outro documento (orçamento → pedido → venda).
 *
 * Precedência: `rt_pct` já congelado na origem → RT do próprio item → cadastro → 0.
 *
 * Por que "> 0" e não "!= null": a coluna é `NOT NULL DEFAULT 0`, então um zero pode
 * significar tanto "RT é zero mesmo" quanto "nunca foi gravado" — e hoje TODAS as linhas
 * são o segundo caso. Preferir a origem só quando ela é positiva faz o histórico legado
 * se curar pelo cadastro em vez de propagar zero para sempre.
 *
 * ⚠️ CONDIÇÃO DE VALIDADE DESTA REGRA (aceita pelo dono do produto em 2026-08-31):
 * ela só é segura ENQUANTO não existir editor de RT por item em orçamento, pedido ou
 * venda. Hoje não existe — o RT sempre vem do cadastro no momento da seleção, então um
 * item com RT 0 e cadastro > 0 é sempre uma linha legada, nunca uma escolha do usuário.
 *
 * SE ESSE EDITOR FOR CRIADO, esta regra TEM QUE MUDAR JUNTO: um RT deliberadamente
 * zerado pelo usuário passaria a ser sobrescrito pelo cadastro, silenciosamente. A saída
 * nesse cenário é distinguir "zero digitado" de "nunca gravado" — tornando a coluna
 * nullable ou marcando a origem do valor —, e não continuar preferindo o positivo.
 */
export function resolveInheritedRtPctDecimal(
    sourceRtPct: unknown,
    item: RtSaleItemLike,
    products: readonly RtCatalogEntry[] = [],
    services: readonly RtCatalogEntry[] = [],
): number {
    const frozen = Number(sourceRtPct)
    if (Number.isFinite(frozen) && frozen > 0) {
        const factor = 10 ** RT_PCT_DECIMALS
        return Math.round(frozen * factor) / factor
    }
    return resolveItemRtPctDecimal(item, products, services)
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
