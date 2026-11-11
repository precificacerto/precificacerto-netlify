/**
 * O AVISO DE DIVERGÊNCIA DA TABELA (dono do produto, 10/11/2026): "o cálculo usa a TABELA VIGENTE no momento do cálculo, não a que o
 * levantamento congelou. O tabela_id congelado no item do levantamento serve para DETECTAR e AVISAR a divergência na tela, nunca para
 * escolher o preço." Puro: recebe o que o cálculo usou e as linhas da tabela congelada, e devolve as frases. NÃO bloqueia nada.
 *
 * Divergência = o item do levantamento congelou uma tabela que NÃO está entre as vigentes da família no cálculo. A DIFERENÇA DE CUSTO é a do
 * material do item, com a MESMA quantidade (as unidades de compra que o cálculo usou: bruto do material ÷ bruto da unidade) e o preço e o
 * bloco da tabela congelada, pela MESMA cascata (`liquidoDaUnidade`). O código que a tabela congelada não tem é nomeado, nunca somado como zero.
 *
 * O item sem tabela congelada (`tabela_id` nulo — os 28 itens dos 11 levantamentos de produção, medido em 10/11/2026) NÃO gera aviso: não há
 * com o que comparar, e dizer "sem divergência" afirmaria uma comparação que não houve (`ausente-vs-falso.md`).
 */
import { liquidoDaUnidade, PERCENTUAIS, type LinhaDeMaterial, type Percentuais } from './custo-do-orcamento'

export type LinhaDaTabelaCongelada = { codigo: string; valor_barra_interno: number | null } & Partial<Record<(typeof PERCENTUAIS)[number], number | null>>
export type ItemParaDivergencia = {
    ordem: number
    /** A tabela que o item do levantamento congelou; nula quando ele não congelou nenhuma. */
    tabelaCongelada: string | null
    /** As tabelas vigentes da família do item, as que o cálculo usou. */
    tabelasVigentes: readonly string[]
    materiais: readonly LinhaDeMaterial[]
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${reais(Math.abs(v))}`
const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** O custo do material do item na tabela congelada: bruto e líquido, e os códigos que ela não tem (ou tem sem preço, ou não recalcula). */
export function custoNaTabelaCongelada(materiais: readonly LinhaDeMaterial[], congelada: readonly LinhaDaTabelaCongelada[]) {
    const porCodigo = new Map(congelada.map((l) => [l.codigo, l]))
    let bruto = 0
    let liquido = 0
    const ausentes: string[] = []
    for (const m of materiais) {
        const l = porCodigo.get(m.codigo)
        const unidade = l ? numeroOuNulo(l.valor_barra_interno) : null
        if (!l || unidade === null || !(m.custo_bruto_unidade > 0)) { ausentes.push(m.codigo); continue }
        const unidades = m.custo_bruto_material / m.custo_bruto_unidade
        const bloco = Object.fromEntries(PERCENTUAIS.map((p) => [p, numeroOuNulo(l[p])])) as Percentuais
        const u = liquidoDaUnidade(m.codigo, unidade, bloco)
        if ('recusa' in u) { ausentes.push(m.codigo); continue }
        bruto += unidade * unidades
        liquido += u.liquido * unidades
    }
    return { bruto, liquido, ausentes }
}

/** As frases do aviso, uma por item que divergiu; vazia quando nenhum item congelou tabela diferente da vigente. */
export function avisosDeDivergencia(itens: readonly ItemParaDivergencia[], congeladas: ReadonlyMap<string, readonly LinhaDaTabelaCongelada[]>, nomes: ReadonlyMap<string, string>): string[] {
    const nome = (id: string) => nomes.get(id) ?? id
    const avisos: string[] = []
    for (const it of itens) {
        if (it.tabelaCongelada === null || it.tabelasVigentes.includes(it.tabelaCongelada)) continue
        const vigenteBruto = it.materiais.reduce((t, m) => t + m.custo_bruto_material, 0)
        const vigenteLiquido = it.materiais.reduce((t, m) => t + m.custo_liquido_material, 0)
        const c = custoNaTabelaCongelada(it.materiais, congeladas.get(it.tabelaCongelada) ?? [])
        const usadas = it.tabelasVigentes.map(nome).join(', ')
        avisos.push(`Esquadria ${it.ordem}: o levantamento congelou a tabela "${nome(it.tabelaCongelada)}"; o cálculo usou a vigente (${usadas}).`
            + ` Com os mesmos materiais, na tabela congelada o custo seria ${reais(c.bruto)} bruto e ${reais(c.liquido)} líquido,`
            + ` contra ${reais(vigenteBruto)} e ${reais(vigenteLiquido)} na vigente (diferença ${comSinal(vigenteLiquido - c.liquido)} no líquido)`
            + (c.ausentes.length ? `; sem preço ou sem crédito apurável na congelada: ${c.ausentes.join(', ')} (fora da conta, não somados como zero).` : '.'))
    }
    return avisos
}
