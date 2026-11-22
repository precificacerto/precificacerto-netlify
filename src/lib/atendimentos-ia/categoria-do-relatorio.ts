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

/**
 * A CATEGORIA SAI DA TABELA QUE DEU O PREÇO, NÃO DO TEXTO DA LINHA (dono do produto, 22/11/2026). Nas palavras dele: "a categoria existe em
 * relação à esquadria, e nós criaremos a tabela em função disso. A tabela." A categoria do fornecedor escrita na linha da tabela (os 14 itens da
 * Wolff_Vedacao escritos "Acessórios", numa tabela de VEDAÇÃO) NÃO é lido: quem manda é `orcamentista_tabela.categoria_chave`. E o código que
 * está em duas tabelas (10241 em Ferragem e Persianas; 8428 e 8431 em Ferragem e Reforço) vai à categoria da tabela DE ONDE O CÁLCULO TIROU O
 * PREÇO dele (`tabelasDeOndeOPrecoSai`, os mesmos escopos do custo): a categoria segue o dinheiro, e o código duplo que aparecer depois já nasce
 * resolvido. É a mesma família de decisão da regra da tipologia: quem define é a ESTRUTURA de onde o dado vem, não o rótulo escrito nele.
 * Como a chave vem do catálogo, as grafias ("Acessório", "Acessórios", "acessórios") não chegam aqui.
 *
 * Sem tabela de onde o preço saia, ou com duas de categorias diferentes, nada é escolhido: o código vai nomeado, com o motivo.
 */
export type CategoriaDoPreco = { categoria: string } | { categoria: null; categorias: string[]; motivo: string }
export const MOTIVO_EM_NENHUMA_TABELA = 'não está em nenhuma tabela de preço que vale para a família do item'
export const motivoForaDoEscopo = (caminho: string) =>
    `está em tabelas da família, mas em nenhuma de onde o cálculo tira o preço do ${caminho === 'perfil' || caminho === 'insumo' || caminho === 'vidro' ? caminho : `caminho "${caminho}"`}`
export const MOTIVO_TABELA_SEM_CATEGORIA = 'a tabela de onde o preço saiu não tem categoria declarada'
export const MOTIVO_TABELAS_DE_CATEGORIAS_DIFERENTES = 'o preço sai de mais de uma tabela, de categorias diferentes'
export const MOTIVO_ITENS_EM_CATEGORIAS_DIFERENTES = 'em itens diferentes do orçamento, o preço saiu de tabelas de categorias diferentes'

/** `doCodigo`: as tabelas da família em que o código está; `deOndeSai`: as que o cálculo olha pelo caminho (o subconjunto). Puro. */
export function categoriaDoPreco(
    caminho: string,
    doCodigo: ReadonlyArray<{ categoria: string | null }>,
    deOndeSai: ReadonlyArray<{ categoria: string | null }>,
): CategoriaDoPreco {
    if (doCodigo.length === 0) return { categoria: null, categorias: [], motivo: MOTIVO_EM_NENHUMA_TABELA }
    if (deOndeSai.length === 0) return { categoria: null, categorias: [], motivo: motivoForaDoEscopo(caminho) }
    const cats = [...new Set(deOndeSai.map((t) => t.categoria))]
    if (cats.length > 1) {
        // só vai a "mais de uma categoria" com duas nomeadas: [null, X] não é X (a lista de UMA iria para a categoria pelo agrupamento)
        const nomeadas = cats.filter((c): c is string => c !== null).sort()
        return { categoria: null, categorias: nomeadas.length > 1 ? nomeadas : [], motivo: MOTIVO_TABELAS_DE_CATEGORIAS_DIFERENTES }
    }
    if (cats[0] === null) return { categoria: null, categorias: [], motivo: MOTIVO_TABELA_SEM_CATEGORIA }
    return { categoria: cats[0] }
}

/**
 * O código pode aparecer em vários itens (e por mais de um caminho): junta as respostas. Uma categoria só → ela. Alguma resposta sem
 * categoria → o código vai sem categoria (ou ambíguo, com as categorias), com o motivo dela. Categorias diferentes entre os itens → ambíguo.
 */
export function juntarCategoriasDoCodigo(respostas: ReadonlyArray<{ codigo: string; r: CategoriaDoPreco }>): {
    categoriasDoCodigo: Map<string, string[]>
    motivos: Map<string, string>
} {
    const porCodigo = new Map<string, CategoriaDoPreco[]>()
    for (const { codigo, r } of respostas) porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), r])
    const categoriasDoCodigo = new Map<string, string[]>()
    const motivos = new Map<string, string>()
    for (const [codigo, rs] of porCodigo) {
        const falha = rs.find((r): r is Extract<CategoriaDoPreco, { categoria: null }> => r.categoria === null)
        if (falha) { categoriasDoCodigo.set(codigo, falha.categorias); motivos.set(codigo, falha.motivo); continue }
        const cats = [...new Set(rs.map((r) => r.categoria as string))].sort()
        categoriasDoCodigo.set(codigo, cats)
        if (cats.length > 1) motivos.set(codigo, MOTIVO_ITENS_EM_CATEGORIAS_DIFERENTES)
    }
    return { categoriasDoCodigo, motivos }
}
