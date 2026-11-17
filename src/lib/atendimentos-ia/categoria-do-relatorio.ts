/**
 * A CATEGORIA NOS RELATÓRIOS I.A. (materiais e corte, 16/11/2026): a regra é UMA, e os dois relatórios a leem daqui (`copia-divergente`).
 *
 * Cada código vai à categoria da tabela de preço da conta em que está. Sem categoria: lista própria. Em tabelas de MAIS de uma categoria:
 * lista própria, nomeando as categorias — nenhuma é escolhida. As categorias saem na ordem da base de conhecimento (`ordem`); uma fora dela
 * vai depois, na ordem do catálogo (`rotulos`, na ordem em que foram lidos). Puro.
 */
export type Agrupado<T> = {
    categorias: Array<{ chave: string; rotulo: string; itens: T[] }>
    semCategoria: T[]
    ambiguos: Array<{ item: T; categorias: string[] }>
}

export function agruparPorCategoria<T>(
    itens: readonly T[],
    codigoDe: (t: T) => string,
    categoriasDoCodigo: ReadonlyMap<string, readonly string[]>,
    ordem: readonly string[],
    rotulos: ReadonlyMap<string, string>,
): Agrupado<T> {
    const porCategoria = new Map<string, T[]>()
    const semCategoria: T[] = []
    const ambiguos: Agrupado<T>['ambiguos'] = []
    for (const t of itens) {
        const cats = [...new Set(categoriasDoCodigo.get(codigoDe(t)) ?? [])].sort()
        if (cats.length === 0) semCategoria.push(t)
        else if (cats.length > 1) ambiguos.push({ item: t, categorias: cats })
        else porCategoria.set(cats[0], [...(porCategoria.get(cats[0]) ?? []), t])
    }
    const doCatalogo = [...rotulos.keys()]
    const posicao = (k: string) => {
        const i = ordem.indexOf(k)
        if (i >= 0) return i
        const r = doCatalogo.indexOf(k)
        return ordem.length + (r >= 0 ? r : doCatalogo.length)
    }
    const categorias = [...porCategoria.keys()].sort((a, b) => posicao(a) - posicao(b) || (a < b ? -1 : 1))
        .map((chave) => ({ chave, rotulo: rotulos.get(chave) ?? chave, itens: porCategoria.get(chave)! }))
    return { categorias, semCategoria, ambiguos }
}
