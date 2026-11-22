/**
 * O RELATÓRIO DE MATERIAIS de um orçamento I.A. (dono do produto, 16/11/2026): "dentro de relatórios, nós vamos ter uma aba que é de
 * materiais. E ali tem que ser dividido por uma sequência, já respeitando a categoria que nós temos lá na base de conhecimento. Começando por
 * perfil, depois pode ser persianas, depois reforço metálico, enfim, assim por diante. Que é o que vai necessitar para o total do pedido."
 *
 * Puro. A entrada são os materiais que o CÁLCULO de cada esquadria GRAVOU (`orcamentista_orcamento_item_material`, o cálculo vigente do
 * item): nada é recalculado, e o consumo gravado já é o total do pedido (a quantidade da esquadria vezes a do item). O relatório só soma por
 * código e agrupa pela categoria da TABELA DE ONDE O PREÇO SAIU (dono do produto, 22/11/2026 — a regra e a razão em `categoria-do-relatorio.ts`:
 * a categoria NÃO sai do texto da linha; sai da tabela que deu o preço), na ordem das ramificações da família na base de conhecimento.
 *
 * Código sem categoria, ou em tabelas de mais de uma categoria, NÃO é posto numa delas: vai a uma lista própria, nomeado e com o motivo
 * (`a-coluna-que-parece-enumeracao`, `faltou-dado-recusa-nomeada`).
 *
 * OS TOTAIS (22/11/2026): o custo bruto e o custo líquido que o cálculo gravou, por categoria e no total geral (que soma também as listas sem
 * categoria e em mais de uma). Linha sem o custo gravado não é somada como zero: o total daquele grupo não sai, e os códigos são nomeados.
 */
import { agruparPorCategoria } from './categoria-do-relatorio'

export type MaterialGravado = {
    /** O código como a tabela de preço o tem (o que o cálculo fotografou). */
    codigo_na_tabela: string
    descricao: string | null
    unidade_compra: string | null
    /** Na unidade da fração: metros (perfil e insumo por comprimento), unidades (insumo por peça), m² (vidro). */
    consumo_item: number
    /** Por onde o cálculo passou: 'perfil', 'insumo' ou 'vidro'. Decide a unidade do consumo e de qual escopo o preço saiu. */
    caminho: string
    /** O custo do material no item, como o cálculo gravou (R$); null = não gravado. */
    custo_bruto_material: number | null
    custo_liquido_material: number | null
}
export type MaterialDoRelatorio = {
    codigo: string; descricao: string | null; unidade: UnidadeDoConsumo; quantidade: number
    /** A soma do custo das linhas do código; null quando alguma linha não tem o custo gravado. */
    custo_bruto: number | null
    custo_liquido: number | null
}
/** O total de um grupo: null quando algum código do grupo não tem o custo (nomeados em `codigosSemCusto`). */
export type TotalDoGrupo = { custo_bruto: number | null; custo_liquido: number | null; codigosSemCusto: string[] }
export type UnidadeDoConsumo = 'm' | 'un' | 'm²'
export type CategoriaDoRelatorio = { chave: string; rotulo: string; materiais: MaterialDoRelatorio[]; total: TotalDoGrupo }
export type RelatorioDeMateriais = {
    categorias: CategoriaDoRelatorio[]
    /** Os códigos sem tabela de onde o preço saia com categoria, com o motivo. */
    semCategoria: Array<MaterialDoRelatorio & { motivo: string }>
    /** Os códigos cujo preço sai de tabelas de MAIS de uma categoria: nenhuma é escolhida. */
    ambiguos: Array<MaterialDoRelatorio & { categorias: string[]; motivo: string }>
    /** O total do pedido: todas as linhas, com ou sem categoria. */
    totalGeral: TotalDoGrupo
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

const somaOuNulo = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b)
const valorOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** O total de um grupo de materiais: a soma, ou null nomeando os códigos sem custo — nunca o que falta somado como zero. */
export function totalDoGrupo(materiais: readonly MaterialDoRelatorio[]): TotalDoGrupo {
    const sem = (k: 'custo_bruto' | 'custo_liquido') => materiais.filter((m) => m[k] === null).map((m) => m.codigo)
    const codigosSemCusto = [...new Set([...sem('custo_bruto'), ...sem('custo_liquido')])].sort()
    const soma = (k: 'custo_bruto' | 'custo_liquido') => (sem(k).length ? null : materiais.reduce((t, m) => t + (m[k] as number), 0))
    return { custo_bruto: soma('custo_bruto'), custo_liquido: soma('custo_liquido'), codigosSemCusto }
}

/**
 * Monta o relatório. `categoriasDoCodigo`: a categoria da tabela de onde o preço de cada código saiu (vazio = nenhuma; mais de uma = nenhuma
 * escolhida); `motivos`: por que um código ficou sem categoria ou em mais de uma. `ordem`: as chaves das categorias na ordem da base de
 * conhecimento; uma categoria fora dela vai depois, na ordem de `rotulos`. Os materiais de cada categoria saem em ordem de código.
 */
export function montarRelatorioDeMateriais(
    materiais: readonly MaterialGravado[],
    categoriasDoCodigo: ReadonlyMap<string, readonly string[]>,
    motivos: ReadonlyMap<string, string>,
    ordem: readonly string[],
    rotulos: ReadonlyMap<string, string>,
): RelatorioDeMateriais {
    const somados = new Map<string, MaterialDoRelatorio>()
    for (const m of materiais) {
        const unidade = unidadeDoConsumo(m)
        const chave = `${m.codigo_na_tabela}\u0000${unidade}`
        const atual = somados.get(chave)
        const bruto = valorOuNulo(m.custo_bruto_material)
        const liquido = valorOuNulo(m.custo_liquido_material)
        if (atual) {
            atual.quantidade += m.consumo_item
            atual.custo_bruto = somaOuNulo(atual.custo_bruto, bruto)
            atual.custo_liquido = somaOuNulo(atual.custo_liquido, liquido)
        } else somados.set(chave, { codigo: m.codigo_na_tabela, descricao: m.descricao, unidade, quantidade: m.consumo_item, custo_bruto: bruto, custo_liquido: liquido })
    }
    const porCodigo = (a: MaterialDoRelatorio, b: MaterialDoRelatorio) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0)
    const g = agruparPorCategoria([...somados.values()].sort(porCodigo), (m) => m.codigo, categoriasDoCodigo, ordem, rotulos)
    const motivo = (codigo: string) => motivos.get(codigo) ?? 'sem tabela de preço com categoria'
    return {
        categorias: g.categorias.map((c) => ({ chave: c.chave, rotulo: c.rotulo, materiais: c.itens, total: totalDoGrupo(c.itens) })),
        semCategoria: g.semCategoria.map((m) => ({ ...m, motivo: motivo(m.codigo) })),
        ambiguos: g.ambiguos.map((a) => ({ ...a.item, categorias: a.categorias, motivo: motivo(a.item.codigo) })),
        totalGeral: totalDoGrupo([...somados.values()]),
    }
}

/** A quantidade como o relatório a mostra: metros e m² com duas casas, unidades sem casa quando inteiras. */
export function quantidadeNoRelatorio(quantidade: number, unidade: UnidadeDoConsumo): string {
    const casas = unidade === 'un' && Number.isInteger(Math.round(quantidade * 1000) / 1000) ? 0 : 2
    return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(quantidade)} ${unidade}`
}

/** O valor em reais, no formato brasileiro; null é "não sai" (nunca R$ 0,00). */
export function reaisNoRelatorio(v: number | null): string {
    return v === null ? 'não sai' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
/** A frase do total que não saiu: os códigos sem o custo gravado. */
export const fraseDoTotalSemCusto = (codigos: readonly string[]) =>
    `o total não sai: ${codigos.length === 1 ? 'o código' : 'os códigos'} ${codigos.join(', ')} ${codigos.length === 1 ? 'não tem' : 'não têm'} o custo gravado pelo cálculo`
