/**
 * O RELATÓRIO DE CORTE de um orçamento I.A. (dono do produto, 16/11/2026): "numa outra aba seria de corte, relatórios de corte, onde vai ter
 * o formato que cada perfil tem que ser cortado, o tamanho, assim também para reforço metálico, para tudo. Usando como base as informações
 * que nós pegamos do WVetro."
 *
 * A PEÇA GRAVADA (`PecaDoCorte`): o cálculo grava, por esquadria, cada peça de perfil que o motor (o arquivo do WVetro) deu — o perfil do
 * motor, o código da tabela, a descrição, o comprimento, a quantidade, o CORTE ("45S/45S", "90/90") e a POSIÇÃO ("Largura", "Altura") — e
 * a BARRA e a SERRA com que o agrupador as juntou. O relatório lê só isso: nada se recalcula com o motor, a tabela ou a serra de hoje.
 *
 * Puro.
 */
import { agruparEmBarras, type BarraCortada } from './agrupador-de-barras'
import { agruparPorCategoria } from './categoria-do-relatorio'

export type PecaDoCorte = {
    /** O código do perfil no motor (o Código WVetro, "SF66/WOLFF"). */
    perfil: string
    /** O código na tabela de preço ("9681"). */
    codigo: string
    descricao: string | null
    comprimento_mm: number
    quantidade_por_esquadria: number
    /** A quantidade do pedido: a por esquadria vezes a da esquadria. */
    quantidade: number
    corte: string | null
    posicao: string | null
    /** O comprimento da barra do código com que o cálculo agrupou; nulo = o código não teve barra (sem preço ou sem medida). */
    comprimento_barra_mm: number | null
    /** A serra do cálculo (a da base de conhecimento, naquele momento). */
    serra_mm: number
}

/** Uma linha de corte: as peças iguais (mesmo comprimento, corte e posição) do código, somadas no pedido. */
export type LinhaDeCorte = { comprimento_mm: number; corte: string | null; posicao: string | null; quantidade: number }
/** O plano de barras do código, com a barra e a serra gravadas; ou por que ele não sai. */
export type PlanoDoCodigo =
    | { barra_mm: number; serra_mm: number; barras: BarraCortada[]; n_barras: number; aproveitamento_pct: number }
    | { semPlano: string }
export type CodigoDoCorte = { codigo: string; perfil: string; descricao: string | null; linhas: LinhaDeCorte[]; plano: PlanoDoCodigo }

export const fraseDoCodigoSemBarra = (codigo: string) =>
    `o código ${codigo} não teve barra no cálculo (sem preço ou sem a medida da barra na tabela): as peças estão aqui, o plano de barras não`
export const fraseDaBarraDivergente = (codigo: string, barras: readonly number[]) =>
    `o código ${codigo} foi calculado com barras diferentes nos itens (${barras.map((b) => `${b} mm`).join(', ')}): recalcule o orçamento para um plano só`
export const fraseDaSerraDivergente = (codigo: string, serras: readonly number[]) =>
    `o código ${codigo} foi calculado com serras diferentes nos itens (${serras.map((s) => `${s} mm`).join(', ')}): recalcule o orçamento para um plano só`

/**
 * O corte de UM código, das peças gravadas dele no orçamento inteiro: as linhas (somadas por comprimento, corte e posição, da maior para a
 * menor) e o plano de barras pelo MESMO agrupador do cálculo, com a barra e a serra gravadas. Barra ausente ou diferente entre os itens,
 * ou serra diferente: sem plano, com a frase — nunca uma barra ou serra escolhida.
 */
export function corteDoCodigo(pecas: readonly PecaDoCorte[]): CodigoDoCorte {
    const p0 = pecas[0]
    const somadas = new Map<string, LinhaDeCorte>()
    for (const p of pecas) {
        const chave = `${p.comprimento_mm}\u0000${p.corte ?? ''}\u0000${p.posicao ?? ''}`
        const atual = somadas.get(chave)
        if (atual) atual.quantidade += p.quantidade
        else somadas.set(chave, { comprimento_mm: p.comprimento_mm, corte: p.corte, posicao: p.posicao, quantidade: p.quantidade })
    }
    const linhas = [...somadas.values()].sort((a, b) => b.comprimento_mm - a.comprimento_mm || (a.corte ?? '').localeCompare(b.corte ?? '') || (a.posicao ?? '').localeCompare(b.posicao ?? ''))
    const base = { codigo: p0.codigo, perfil: p0.perfil, descricao: p0.descricao, linhas }
    const barras = [...new Set(pecas.map((p) => p.comprimento_barra_mm))]
    if (barras.some((b) => b === null)) return { ...base, plano: { semPlano: fraseDoCodigoSemBarra(p0.codigo) } }
    if (barras.length > 1) return { ...base, plano: { semPlano: fraseDaBarraDivergente(p0.codigo, (barras as number[]).sort((a, b) => a - b)) } }
    const serras = [...new Set(pecas.map((p) => p.serra_mm))]
    if (serras.length > 1) return { ...base, plano: { semPlano: fraseDaSerraDivergente(p0.codigo, serras.sort((a, b) => a - b)) } }
    const barra_mm = barras[0] as number
    const serra_mm = serras[0]
    const r = agruparEmBarras({
        pecas: linhas.map((l) => ({ codigo: p0.codigo, comprimento_mm: l.comprimento_mm, quantidade: l.quantidade })),
        barras: { [p0.codigo]: { comprimento_mm: barra_mm } },
        serra_mm,
    })
    if ('recusas' in r) return { ...base, plano: { semPlano: r.recusas.map((x) => x.mensagem).join(' ') } }
    const c = r.por_codigo[0]
    return { ...base, plano: { barra_mm, serra_mm, barras: c.barras, n_barras: c.n_barras, aproveitamento_pct: c.aproveitamento_pct } }
}

export type CategoriaDoCorte = { chave: string; rotulo: string; codigos: CodigoDoCorte[] }
export type RelatorioDeCorte = { categorias: CategoriaDoCorte[]; semCategoria: CodigoDoCorte[]; ambiguos: Array<CodigoDoCorte & { categorias: string[] }> }

/** O relatório: um bloco por código, nas categorias da base de conhecimento (a mesma regra do relatório de materiais), códigos em ordem. */
export function montarRelatorioDeCorte(
    pecas: readonly PecaDoCorte[],
    categoriasDoCodigo: ReadonlyMap<string, readonly string[]>,
    ordem: readonly string[],
    rotulos: ReadonlyMap<string, string>,
): RelatorioDeCorte {
    const porCodigo = new Map<string, PecaDoCorte[]>()
    for (const p of pecas) porCodigo.set(p.codigo, [...(porCodigo.get(p.codigo) ?? []), p])
    const codigos = [...porCodigo.keys()].sort().map((c) => corteDoCodigo(porCodigo.get(c)!))
    const g = agruparPorCategoria(codigos, (c) => c.codigo, categoriasDoCodigo, ordem, rotulos)
    return {
        categorias: g.categorias.map((c) => ({ chave: c.chave, rotulo: c.rotulo, codigos: c.itens })),
        semCategoria: g.semCategoria,
        ambiguos: g.ambiguos.map((a) => ({ ...a.item, categorias: a.categorias })),
    }
}
