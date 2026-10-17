/**
 * selecao-paginada.ts — a seleção de clientes do envio para sequência, PAGINADA.
 *
 * A SELEÇÃO É POR ID, NUNCA POR ÍNDICE DE LINHA, e atravessa as páginas: marcar na 1, ir para a
 * 2 e voltar não perde nada. Por isso a tela NÃO usa `Checkbox.Group` sobre a página — o grupo do
 * antd devolve, no `onChange`, só os valores das opções que ele tem registradas, e com paginação
 * ele APAGARIA em silêncio os marcados das outras páginas.
 *
 * "TODOS" É A LISTA INTEIRA DA CONTA, não a página. Decisão do dono do produto: um botão só,
 * dizendo "Marcar todos" numa lista paginada, faz alguém enviar mensagem para menos gente do que
 * pensou. São dois botões, e cada um diz o número.
 *
 * Puro: nenhuma função aqui sabe de React, de antd ou de consulta. O escopo da lista é o da
 * consulta (`useCustomers`, RLS da conta logada) e esta rodada não o mexe.
 */

export interface FaixaDaPagina {
    /** 1-based, inclusiva. `0` quando a lista está vazia. */
    de: number
    ate: number
    total: number
}

/** A página `pagina` (1-based) clampada ao intervalo que existe. */
export function paginaValida(total: number, pagina: number, tamanho: number): number {
    const ultima = Math.max(1, Math.ceil(total / tamanho))
    return Math.min(Math.max(1, Math.floor(pagina)), ultima)
}

export function itensDaPagina<T>(itens: readonly T[], pagina: number, tamanho: number): T[] {
    const p = paginaValida(itens.length, pagina, tamanho)
    return itens.slice((p - 1) * tamanho, p * tamanho)
}

export function faixaDaPagina(total: number, pagina: number, tamanho: number): FaixaDaPagina {
    if (total === 0) return { de: 0, ate: 0, total: 0 }
    const p = paginaValida(total, pagina, tamanho)
    return { de: (p - 1) * tamanho + 1, ate: Math.min(p * tamanho, total), total }
}

/** "Mostrando 201–247 de 247". O traço é meia-risca (U+2013), como a maquete. */
export function textoMostrando(f: FaixaDaPagina): string {
    return f.total === 0 ? 'Mostrando 0 de 0' : `Mostrando ${f.de}–${f.ate} de ${f.total}`
}

/** Acrescenta os da página aos já marcados — os de outras páginas FICAM. Sem repetição. */
export function marcarPagina(selecionados: readonly string[], idsDaPagina: readonly string[]): string[] {
    const ja = new Set(selecionados)
    return [...selecionados, ...idsDaPagina.filter((id) => !ja.has(id))]
}

/** Liga ou desliga UM id, preservando todos os outros. */
export function alternar(selecionados: readonly string[], id: string, marcado: boolean): string[] {
    if (marcado) return selecionados.includes(id) ? [...selecionados] : [...selecionados, id]
    return selecionados.filter((x) => x !== id)
}

export const rotuloMarcarPagina = (n: number) => `Marcar esta página (${n})`
export const rotuloMarcarTodos = (n: number) => `Marcar todos da lista (${n})`
export const ROTULO_LIMPAR_SELECAO = 'Limpar seleção'

/**
 * O contador. Diz o TOTAL selecionado DE QUANTOS a lista tem e, QUANDO DIFERENTE do total
 * selecionado, quantos são desta página — é essa diferença que avisa que há marcados fora da
 * vista, para mais ou para menos.
 */
export function textoDoContador(totalSelecionados: number, totalDaLista: number, nestaPagina: number): string {
    const base = `${totalSelecionados} de ${totalDaLista} ${totalSelecionados === 1 ? 'selecionado' : 'selecionados'}`
    return nestaPagina === totalSelecionados ? base : `${base} · ${nestaPagina} nesta página`
}
