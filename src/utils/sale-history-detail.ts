/**
 * sale-history-detail.ts — o detalhe de UMA venda para o Histórico do Cliente.
 *
 * O DADO JÁ EXISTIA; a tela é que não o exibia. O histórico mostrava serviço, funcionário,
 * data, total e status, e o resto — os itens, as quantidades, os unitários, o parcelamento —
 * estava em `sale_items` e `cash_entries` desde sempre, sem ninguém ler.
 *
 * FONTE: `sale_items` (estruturado, 100% de cobertura nas vendas ativas) e `cash_entries` por
 * `origin_id`. **Não** `cash_entries.description`: aquele texto existe em 14 linhas cujo
 * `origin_id` aponta para `calendar_events` e não para `sales` — cobertura ZERO nas vendas
 * ativas, além de exigir parsing de string que quebra em silêncio quando o formato muda.
 *
 * SEGMENTADO POR VENDA, NUNCA CONSOLIDADO. Um cliente tem várias vendas e cada uma tem
 * condição própria: somar duas vendas numa linha só produz um número que não corresponde a
 * venda nenhuma. Por isso esta função recebe UMA venda e devolve o detalhe DELA — a
 * separação é estrutural, não uma escolha de layout.
 *
 * DESCONTO FICA DE FORA, deliberadamente. `sale_items.discount` está zerado em 111 de 111
 * linhas e `sales` não tem coluna de desconto (só `discount_mode`): é AUSÊNCIA DE GRAVAÇÃO,
 * não de exibição. Exibir um campo que sempre mostra zero seria pior que omitir, porque
 * AFIRMARIA QUE NÃO HOUVE DESCONTO. Registrado como item próprio.
 *
 * PARCELAMENTO AUSENTE É `null`, não lista vazia. Sete das 63 vendas ativas não têm nenhum
 * lançamento em `cash_entries`; para elas o bloco inteiro é OMITIDO. Não exibir vazio, não
 * estimar, não inferir — mesma distinção do `null` × zero que o D8 e o D-A pagaram caro.
 */

/** Linha de `sale_items` no que interessa ao histórico. */
export interface SaleHistoryItemRow {
    product_id?: string | null
    service_id?: string | null
    quantity?: number | string | null
    unit_price?: number | string | null
    /** `sale_items.description` — preenchida na inserção com o nome do item. */
    description?: string | null
}

/** Linha de `cash_entries` de uma venda. */
export interface SaleHistoryCashEntryRow {
    amount?: number | string | null
    due_date?: string | null
    /** Preenchida ⇒ parcela liquidada. */
    paid_date?: string | null
}

/** Cadastro mínimo para resolver o nome exibido. */
export interface NamedCatalogEntry {
    id: string
    name?: string | null
}

export interface SaleHistoryItem {
    nome: string
    tipo: 'SERVICO' | 'PRODUTO' | 'MANUAL'
    quantidade: number
    valorUnitario: number
    total: number
}

export interface SaleHistoryInstallment {
    numero: number
    de: number
    valor: number
    vencimento: string | null
    liquidada: boolean
}

export interface SaleHistoryInstallmentPlan {
    total: number
    liquidadas: number
    emAberto: number
    valorTotal: number
    parcelas: SaleHistoryInstallment[]
}

export interface SaleHistoryDetail {
    itens: SaleHistoryItem[]
    subtotal: number
    /** `sales.final_value` — o total pós-desconto que a venda registrou. */
    total: number
    formaPagamento: string | null
    /** `null` quando a venda não tem NENHUM lançamento: o bloco é omitido, não zerado. */
    parcelamento: SaleHistoryInstallmentPlan | null
}

const num = (v: unknown): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/**
 * Nome do item, na ordem em que a fonte é confiável.
 *
 * O cadastro vivo tem o nome mais atual; `sale_items.description` é o que foi gravado com a
 * venda. Para EXIBIR um histórico o nome atual é o desejável — o cliente reconhece o item
 * pelo nome de hoje —, e a descrição gravada cobre o item manual e o cadastro apagado.
 */
function resolveNome(
    item: SaleHistoryItemRow,
    products: readonly NamedCatalogEntry[],
    services: readonly NamedCatalogEntry[],
): string {
    if (item.service_id) {
        const svc = services.find((s) => s.id === item.service_id)
        if (svc?.name) return svc.name
    }
    if (item.product_id) {
        const prod = products.find((p) => p.id === item.product_id)
        if (prod?.name) return prod.name
    }
    return (item.description || '').trim() || 'Item sem descrição'
}

function resolveTipo(item: SaleHistoryItemRow): SaleHistoryItem['tipo'] {
    if (item.service_id) return 'SERVICO'
    if (item.product_id) return 'PRODUTO'
    return 'MANUAL'
}

/**
 * Monta o plano de parcelas de uma venda.
 *
 * Devolve `null` quando não há lançamento nenhum — a venda existe, o parcelamento não é
 * conhecido, e o bloco não deve aparecer. Uma lista vazia diria "zero parcelas", que é outra
 * afirmação.
 */
export function buildInstallmentPlan(
    entries: readonly SaleHistoryCashEntryRow[],
): SaleHistoryInstallmentPlan | null {
    if (!entries || entries.length === 0) return null
    // Vencimento ordena; entrada sem data vai para o fim, sem quebrar a numeração das outras.
    const ordenadas = [...entries].sort((a, b) => {
        const da = a.due_date || '9999-12-31'
        const db = b.due_date || '9999-12-31'
        return da.localeCompare(db)
    })
    const parcelas = ordenadas.map((e, i) => ({
        numero: i + 1,
        de: ordenadas.length,
        valor: num(e.amount),
        vencimento: e.due_date || null,
        liquidada: !!e.paid_date,
    }))
    const liquidadas = parcelas.filter((p) => p.liquidada).length
    return {
        total: parcelas.length,
        liquidadas,
        emAberto: parcelas.length - liquidadas,
        valorTotal: parcelas.reduce((s, p) => s + p.valor, 0),
        parcelas,
    }
}

/**
 * O detalhe de UMA venda. Recebe as linhas já filtradas por `sale_id` — a segmentação é
 * responsabilidade de quem chama, e é o que impede a consolidação acidental.
 */
export function buildSaleHistoryDetail(args: {
    sale: { final_value?: number | string | null; payment_method?: string | null }
    items: readonly SaleHistoryItemRow[]
    cashEntries: readonly SaleHistoryCashEntryRow[]
    products?: readonly NamedCatalogEntry[]
    services?: readonly NamedCatalogEntry[]
}): SaleHistoryDetail {
    const products = args.products ?? []
    const services = args.services ?? []
    const itens: SaleHistoryItem[] = (args.items ?? []).map((it) => {
        const quantidade = num(it.quantity)
        const valorUnitario = num(it.unit_price)
        return {
            nome: resolveNome(it, products, services),
            tipo: resolveTipo(it),
            quantidade,
            valorUnitario,
            total: quantidade * valorUnitario,
        }
    })
    return {
        itens,
        subtotal: itens.reduce((s, i) => s + i.total, 0),
        // O total vem da VENDA, não da soma dos itens: é o valor que a venda registrou, e é
        // ele que precisa aparecer. Quando os dois divergem, quem manda é o gravado.
        total: num(args.sale?.final_value),
        formaPagamento: args.sale?.payment_method || null,
        parcelamento: buildInstallmentPlan(args.cashEntries ?? []),
    }
}
