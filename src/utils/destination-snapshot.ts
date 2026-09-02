/**
 * destination-snapshot.ts — o destino de cada categoria, CONGELADO no momento em que o
 * preço do item foi formado.
 *
 * REGRA CANÔNICA (Seção 4): o destino é propriedade da CONSTRUÇÃO DO PREÇO, não do estado
 * atual do tenant. Cada item precificado grava seu snapshot de destino junto com o preço.
 *
 *   CORRETO   destino = snapshot_do_item.destino[categoria]
 *   PROIBIDO  destino = matriz[tenant.calc_type_atual][item.tipo][categoria]
 *
 * Ler o `calc_type` de hoje para decompor um preço de ontem REESCREVE O PASSADO: se o
 * tenant mudar de segmentação, os itens antigos passam a ser decompostos por uma matriz que
 * não os formou. É a classe `fato-vs-referencia` — valor gravado lido contra parâmetro atual
 * — e este módulo fecha a aparição DO DESTINO. Não fecha a classe: o inventário campo a
 * campo é rodada própria.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * AUSÊNCIA DE SNAPSHOT É INFORMAÇÃO — E NÃO É O DESTINO FORA
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * `null` significa ITEM LEGADO, anterior ao snapshot. O leitor cai na matriz pelo
 * `calc_type` atual, exatamente como antes desta coluna existir.
 *
 * **`null` NUNCA significa destino FORA.** Confundir os dois transformaria TODO ITEM
 * LEGADO EM ITEM SEM CUSTO: FORA tira a parcela de conversão do CMV, e um item legado
 * interpretado como FORA perderia a mão de obra do custo silenciosamente, barateando o
 * preço sem que nada falhasse. É a mesma armadilha do `NOT NULL DEFAULT 0` que o D8 pagou
 * caro — ali "zero gravado" e "nunca gravado" viraram o mesmo valor.
 *
 * Por isso `readDestinationSnapshot` devolve `null` para QUALQUER coisa que não seja um
 * snapshot íntegro: ausente, jsonb corrompido, versão desconhecida, `destino` faltando,
 * categoria faltando, ou destino com valor fora do enum. Preencher lacuna com um default
 * seria inventar uma afirmação que ninguém fez.
 */

import {
    applyCostDestination,
    applyDopDestinations,
    dopSliceOf,
    normalizeTenantSegment,
    resolveCategoryDestinations,
    resolveItemConstruction,
    type CategoryDestinations,
    type DopComponents,
    type ExpenseDestination,
    type ItemConstruction,
    type ItemConstructionInput,
} from './expense-destination'

/** Versão do formato gravado na coluna `destination_snapshot`. */
export const DESTINATION_SNAPSHOT_VERSION = 1 as const

export interface DestinationSnapshot {
    v: typeof DESTINATION_SNAPSHOT_VERSION
    /**
     * O destino de cada categoria, JÁ RESOLVIDO. É este campo que a cascata lê — não a
     * segmentação abaixo. Gravar o resultado, e não a entrada, é o que garante que uma
     * mudança futura na matriz não reescreva preços antigos.
     */
    destino: CategoryDestinations
    /** Construção do item quando o preço foi formado. Auditoria. */
    construcao: ItemConstruction
    /** Segmentação do tenant quando o preço foi formado. Auditoria. */
    segmentacao: string
    /** ISO 8601 — quando o preço foi formado. */
    gravado_em: string
}

const CATEGORIAS = [
    'mo_produtiva', 'mo_indireta', 'despesa_fixa', 'despesa_variavel', 'despesa_financeira',
] as const

const DESTINOS: readonly string[] = ['CUSTO', 'MARGEM', 'FORA']
const CONSTRUCOES: readonly string[] = ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO']

/**
 * Monta o snapshot a gravar junto com o preço.
 *
 * Recebe a construção e a segmentação VIGENTES NO MOMENTO DA FORMAÇÃO e resolve a matriz
 * uma única vez — ali, com os dados daquele instante. Depois disso o resultado é fato.
 */
export function buildDestinationSnapshot(input: {
    construction: ItemConstruction
    tenantCalcType?: string | null
    /** Injetável para teste; default = agora. */
    gravadoEm?: string
}): DestinationSnapshot {
    return {
        v: DESTINATION_SNAPSHOT_VERSION,
        destino: resolveCategoryDestinations(input.construction, input.tenantCalcType),
        construcao: input.construction,
        // Gravado no vocabulário do banco, qualquer que seja o da entrada — ver
        // `SEGMENTO_ALIASES` em `expense-destination.ts`.
        segmentacao: normalizeTenantSegment(input.tenantCalcType),
        gravado_em: input.gravadoEm ?? new Date().toISOString(),
    }
}

/** Atalho: resolve a construção a partir do item e monta o snapshot. */
export function buildItemDestinationSnapshot(input: {
    item: ItemConstructionInput
    tenantCalcType?: string | null
    gravadoEm?: string
}): DestinationSnapshot {
    return buildDestinationSnapshot({
        construction: resolveItemConstruction(input.item),
        tenantCalcType: input.tenantCalcType,
        gravadoEm: input.gravadoEm,
    })
}

/**
 * Lê o snapshot gravado. Devolve `null` para item legado, jsonb corrompido, versão
 * desconhecida ou conteúdo incompleto — e `null` manda o chamador cair na matriz, NUNCA
 * tratar o item como FORA. Ver o bloco no topo do arquivo.
 */
export function readDestinationSnapshot(raw: unknown): DestinationSnapshot | null {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const o = raw as Record<string, unknown>
    if (Number(o.v) !== DESTINATION_SNAPSHOT_VERSION) return null

    const d = o.destino
    if (d == null || typeof d !== 'object' || Array.isArray(d)) return null
    const mapa = d as Record<string, unknown>

    // TODAS as categorias, TODAS com destino conhecido. Um snapshot pela metade não é um
    // snapshot: completar a lacuna com um default inventaria uma classificação.
    const destino = {} as CategoryDestinations
    for (const cat of CATEGORIAS) {
        const valor = mapa[cat]
        if (typeof valor !== 'string' || !DESTINOS.includes(valor)) return null
        destino[cat] = valor as ExpenseDestination
    }

    const construcao = String(o.construcao ?? '').trim().toUpperCase()
    if (!CONSTRUCOES.includes(construcao)) return null

    return {
        v: DESTINATION_SNAPSHOT_VERSION,
        destino,
        construcao: construcao as ItemConstruction,
        segmentacao: String(o.segmentacao ?? '').trim().toUpperCase(),
        gravado_em: typeof o.gravado_em === 'string' ? o.gravado_em : '',
    }
}

/** De onde veio o destino que a cascata usou. Rastreabilidade, e o que os testes afirmam. */
export type DestinationSource = 'SNAPSHOT' | 'MATRIZ'

/**
 * PONTO ÚNICO DE RESOLUÇÃO — é aqui que a regra da Seção 4 vive.
 *
 * Com snapshot íntegro: o destino sai dele, e o `calc_type` atual do tenant NÃO É LIDO.
 * Sem snapshot: cai na matriz pelo `calc_type` atual, que é o comportamento de hoje para
 * todo item legado.
 */
export function resolveItemDestinations(args: {
    item: ItemConstructionInput
    /** Conteúdo bruto da coluna `destination_snapshot`, como vem do banco. */
    snapshot?: unknown
    /** Só é consultado quando NÃO há snapshot. */
    tenantCalcType?: string | null
}): {
    destinations: CategoryDestinations
    construction: ItemConstruction
    source: DestinationSource
} {
    const snap = readDestinationSnapshot(args.snapshot)
    if (snap) {
        return { destinations: snap.destino, construction: snap.construcao, source: 'SNAPSHOT' }
    }
    const construction = resolveItemConstruction(args.item)
    return {
        destinations: resolveCategoryDestinations(construction, args.tenantCalcType),
        construction,
        source: 'MATRIZ',
    }
}

// ─────────────────── Os dois atalhos que a cascata usa por item ───────────────────
//
// Ambos passam por `resolveItemDestinations`. É o único caminho: as funções da matriz que
// liam a segmentação item a item foram REMOVIDAS de `expense-destination.ts`, de modo que a
// forma proibida — `matriz[tenant.calc_type_atual][...]` aplicada a um item — não é mais
// representável no código que a cascata chama.

/** Etapa 5 — os quatro baldes da MC, com o destino congelado do item. */
export function resolveItemDopComponents(args: {
    item: ItemConstructionInput
    snapshot?: unknown
    components: DopComponents
    /** Só consultado quando não há snapshot (item legado). */
    tenantCalcType?: string | null
}): {
    components: DopComponents
    construction: ItemConstruction
    destinations: CategoryDestinations
    source: DestinationSource
} {
    const { destinations, construction, source } = resolveItemDestinations(args)
    return {
        components: applyDopDestinations(args.components, dopSliceOf(destinations)),
        construction,
        destinations,
        source,
    }
}

/** Etapa 4 — o custo unitário, com o destino congelado do item. */
export function resolveItemCostUnit(args: {
    item: ItemConstructionInput
    snapshot?: unknown
    itemCost: number
    conversionCost: number
    /** Só consultado quando não há snapshot (item legado). */
    tenantCalcType?: string | null
}): {
    costUnit: number
    construction: ItemConstruction
    destinations: CategoryDestinations
    source: DestinationSource
} {
    const { destinations, construction, source } = resolveItemDestinations(args)
    return {
        costUnit: applyCostDestination({
            destinations, itemCost: args.itemCost, conversionCost: args.conversionCost,
        }),
        construction,
        destinations,
        source,
    }
}

/**
 * O item entra no AGRUPAMENTO de revenda (MO Produtiva somada à MO Indireta numa categoria
 * só)? Devolve `'REVENDA'` quando sim, `null` quando não — o formato que
 * `resolveIndirectLaborPct` espera.
 *
 * Com snapshot, a resposta vem da SEGMENTAÇÃO GRAVADA, não da atual: o preço foi formado com
 * as duas somadas ou não foi, e mudar o `calc_type` do tenant depois não muda o que aconteceu.
 * Sem snapshot, reproduz exatamente a condição de hoje (item de revenda em tenant de revenda).
 */
export function resolveItemLaborGrouping(args: {
    item: ItemConstructionInput
    snapshot?: unknown
    tenantCalcType?: string | null
}): 'REVENDA' | null {
    const snap = readDestinationSnapshot(args.snapshot)
    const construcao = snap ? snap.construcao : resolveItemConstruction(args.item)
    const segmentacao = snap
        ? snap.segmentacao
        : normalizeTenantSegment(args.tenantCalcType)
    return construcao === 'REVENDA' && segmentacao === 'REVENDA' ? 'REVENDA' : null
}
