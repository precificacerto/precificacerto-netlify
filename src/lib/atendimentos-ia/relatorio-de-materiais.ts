/**
 * O RELATÓRIO DE MATERIAIS de um orçamento I.A. (dono do produto, 16/11/2026): "dentro de relatórios, nós vamos ter uma aba que é de
 * materiais. E ali tem que ser dividido por uma sequência, já respeitando a categoria que nós temos lá na base de conhecimento. Começando por
 * perfil, depois pode ser persianas, depois reforço metálico, enfim, assim por diante. Que é o que vai necessitar para o total do pedido."
 *
 * Puro. A entrada são os materiais que o CÁLCULO de cada esquadria GRAVOU (`orcamentista_orcamento_item_material`, o cálculo vigente do
 * item): nada é recalculado, e o consumo gravado já é o total do pedido (a quantidade da esquadria vezes a do item). O relatório só soma por
 * código e agrupa pela categoria da tabela de preço em que o código está, na ordem das ramificações da família na base de conhecimento.
 *
 * Código sem categoria, ou em tabelas de mais de uma categoria, NÃO é posto numa delas: vai a uma lista própria, nomeado (`a-coluna-que-
 * parece-enumeracao`, `faltou-dado-recusa-nomeada`).
 */
import { agruparPorCategoria } from './categoria-do-relatorio'

export type MaterialGravado = {
    /** O código como a tabela de preço o tem (o que o cálculo fotografou). */
    codigo_na_tabela: string
    descricao: string | null
    unidade_compra: string | null
    /** Na unidade da fração: metros (perfil e insumo por comprimento), unidades (insumo por peça), m² (vidro). */
    consumo_item: number
    /** Por onde o cálculo passou: 'perfil', 'insumo' ou 'vidro'. Decide a unidade do consumo. */
    caminho: string
}
export type MaterialDoRelatorio = { codigo: string; descricao: string | null; unidade: UnidadeDoConsumo; quantidade: number }
export type UnidadeDoConsumo = 'm' | 'un' | 'm²'
export type CategoriaDoRelatorio = { chave: string; rotulo: string; materiais: MaterialDoRelatorio[] }
export type RelatorioDeMateriais = {
    categorias: CategoriaDoRelatorio[]
    /** Os códigos que nenhuma tabela da conta classifica. */
    semCategoria: MaterialDoRelatorio[]
    /** Os códigos que estão em tabelas de MAIS de uma categoria: nenhuma é escolhida. */
    ambiguos: Array<MaterialDoRelatorio & { categorias: string[] }>
}

/**
 * Só as linhas do CÁLCULO VIGENTE de cada item (o `calculo_id` que o item guarda): a linha de um cálculo anterior do mesmo item não entra, e
 * item sem cálculo não tem linha nenhuma.
 */
export function linhasDoCalculoVigente<T extends { orcamento_item_id: string; calculo_id: string | null }>(
    itens: ReadonlyArray<{ id: string; calculo_id: string | null }>,
    linhas: readonly T[],
): T[] {
    const vigente = new Map(itens.filter((i) => i.calculo_id).map((i) => [i.id, i.calculo_id as string]))
    return linhas.filter((l) => l.calculo_id !== null && vigente.get(l.orcamento_item_id) === l.calculo_id)
}

/**
 * A unidade do consumo: o cálculo grava metros no perfil e no insumo vendido por comprimento (rolo/barra, unidade de compra MT), m² no
 * vidro e unidades no insumo por peça (`custo-do-orcamento.ts`).
 */
export function unidadeDoConsumo(m: Pick<MaterialGravado, 'caminho' | 'unidade_compra'>): UnidadeDoConsumo {
    if (m.caminho === 'vidro') return 'm²'
    if (m.caminho === 'perfil') return 'm'
    return (m.unidade_compra ?? '').trim().toUpperCase() === 'MT' ? 'm' : 'un'
}

/**
 * Monta o relatório. `categoriasDoCodigo`: as categorias das tabelas da conta em que cada código está (vazio = nenhuma). `ordem`: as chaves
 * das categorias na ordem da base de conhecimento; uma categoria fora dela vai depois, na ordem de `rotulos`. Os materiais de cada categoria
 * saem em ordem de código.
 */
export function montarRelatorioDeMateriais(
    materiais: readonly MaterialGravado[],
    categoriasDoCodigo: ReadonlyMap<string, readonly string[]>,
    ordem: readonly string[],
    rotulos: ReadonlyMap<string, string>,
): RelatorioDeMateriais {
    const somados = new Map<string, MaterialDoRelatorio>()
    for (const m of materiais) {
        const unidade = unidadeDoConsumo(m)
        const chave = `${m.codigo_na_tabela}\u0000${unidade}`
        const atual = somados.get(chave)
        if (atual) atual.quantidade += m.consumo_item
        else somados.set(chave, { codigo: m.codigo_na_tabela, descricao: m.descricao, unidade, quantidade: m.consumo_item })
    }
    const porCodigo = (a: MaterialDoRelatorio, b: MaterialDoRelatorio) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0)
    const g = agruparPorCategoria([...somados.values()].sort(porCodigo), (m) => m.codigo, categoriasDoCodigo, ordem, rotulos)
    return {
        categorias: g.categorias.map((c) => ({ chave: c.chave, rotulo: c.rotulo, materiais: c.itens })),
        semCategoria: g.semCategoria,
        ambiguos: g.ambiguos.map((a) => ({ ...a.item, categorias: a.categorias })),
    }
}

/** A quantidade como o relatório a mostra: metros e m² com duas casas, unidades sem casa quando inteiras. */
export function quantidadeNoRelatorio(quantidade: number, unidade: UnidadeDoConsumo): string {
    const casas = unidade === 'un' && Number.isInteger(Math.round(quantidade * 1000) / 1000) ? 0 : 2
    return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(quantidade)} ${unidade}`
}
