/**
 * Atendimentos I.A. — o VIDRO: copiado, nunca completado; comparado pela FORMA CANÔNICA (dono do produto, 04/11/2026).
 *
 * O caso que originou (De Paula, 03/11/2026, 21:09 a 21:20 UTC): o vendedor escreveu "vidro 4mm" e "vidro 8mm" em todas as mensagens, e o
 * modelo devolveu seis grafias ("Vidro comum 4 mm", "incolor comum 4 mm", "incolor 4 mm comum", "Vidro comum 8 mm", "incolor temperado 8 mm",
 * "incolor 8 mm temperado"), completadas a partir da instrução da categoria VIDRO — "8 mm" saiu como "comum" num turno e "temperado" noutro, o
 * que troca o produto e o preço. O código aceitava qualquer texto e comparava texto com texto: 10 itens em espera para 2 esquadrias.
 *
 * As regras, como foram ditas:
 *   1. "VIDRO COPIADO, NUNCA COMPLETADO. O vidro do item é o que o vendedor disse, literal. [...] A instrução de VIDRO só entra quando o
 *      vendedor NÃO disse vidro nenhum para aquela esquadria — e, nesse caso, entra UMA vez, fica gravada e não muda nos turnos seguintes."
 *      → `vidroDito(proposto, mensagem)`: toda palavra do vidro proposto (fora "vidro", "de", "mm"…) está na mensagem; o que não está cai.
 *        O padrão da instrução vem em `vidro_padrao`, e o código só o aplica à esquadria que ficou sem vidro (`aplicarProposta`).
 *   2. "FORMA CANÔNICA: vidroCanonico(texto) -> espessura + têmpera + cor, numa ordem só. Serve para COMPARAR (dedupe e agrupamento); o texto
 *      que o vendedor disse continua sendo o que se grava e o que aparece. A regra nunca inventa o que não foi dito: '8 mm' não funde com
 *      'temperado 8 mm'." → `formaCanonicaDoVidro`: "<têmpera> <cor> <espessura> mm <resto…>", só com o que foi dito.
 *   3. A dedupe por EQUIVALÊNCIA está em `pergunta-em-aberto.ts` (`juntarEsquadrias`) e o agrupamento em `levantamento-em-montagem.ts`.
 *   4. A lista do fornecedor (tabela de preço da categoria VIDRO) fica para depois; `orcamentista_mp_vidro` não volta (decisão de 03/11).
 *
 * Portão: `vidro.test.ts` e o bloco (29) de `atendimentos-ia-levantamento-por-nome.test.ts`.
 */

export type Tempera = 'comum' | 'temperado' | 'laminado'

export type VidroLido = {
    /** A espessura, em mm, como texto já normalizado ("4", "3+3", "7.5"); null quando não há número. */
    espessura: string | null
    tempera: Tempera | null
    cor: string | null
    /** As palavras que não são espessura, têmpera, cor nem enchimento — em ordem alfabética, para a comparação. */
    resto: string[]
}

const TEMPERAS: Record<string, Tempera> = {
    comum: 'comum', liso: 'comum', lisa: 'comum',
    temperado: 'temperado', temperada: 'temperado', temp: 'temperado',
    laminado: 'laminado', laminada: 'laminado',
}
const CORES: Record<string, string> = {
    incolor: 'incolor', transparente: 'incolor',
    fume: 'fume', cinza: 'fume',
    bronze: 'bronze', verde: 'verde', azul: 'azul',
    boreal: 'boreal', miniboreal: 'boreal',
    acidato: 'acidato', acidado: 'acidato', jateado: 'acidato', fosco: 'acidato',
    espelhado: 'reflect', reflect: 'reflect', refletivo: 'reflect', refletiva: 'reflect',
}
/** O que não distingue um vidro de outro. */
const ENCHIMENTO = new Set(['vidro', 'vidros', 'de', 'do', 'da', 'com', 'em', 'e', 'o', 'a', 'mm', 'milimetro', 'milimetros', 'mini'])

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '')

/** As palavras do texto: minúsculas, sem acento, número separado da letra ("4mm" → "4", "mm"), vírgula decimal como ponto. */
export function palavrasDoVidro(texto: string): string[] {
    return semAcento(texto.toLowerCase())
        .replace(/(\d),(\d)/g, '$1.$2')
        .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
        .split(/[^a-z0-9.+]+/).map((p) => p.replace(/^[.+]+|[.+]+$/g, '')).filter(Boolean)
}

const ehNumero = (p: string) => /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?$/.test(p)
const numeroNormal = (p: string) => p.split('+').map((x) => String(Number(x))).join('+')

export function vidroCanonico(texto: unknown): VidroLido {
    const lido: VidroLido = { espessura: null, tempera: null, cor: null, resto: [] }
    if (typeof texto !== 'string') return lido
    for (const p of palavrasDoVidro(texto)) {
        if (ehNumero(p)) { if (lido.espessura === null) lido.espessura = numeroNormal(p); else lido.resto.push(p); continue }
        if (p in TEMPERAS) { lido.tempera ??= TEMPERAS[p]; continue }
        if (p in CORES) { lido.cor ??= CORES[p]; continue }
        if (ENCHIMENTO.has(p)) continue
        lido.resto.push(p)
    }
    // "3+3" é laminado por construção, mesmo sem a palavra
    if (lido.espessura?.includes('+') && lido.tempera === null) lido.tempera = 'laminado'
    lido.resto.sort()
    return lido
}

/** A forma de comparar: "<têmpera> <cor> <espessura> mm <resto…>", só com o que foi dito; vazia quando nada se leu. */
export function formaCanonicaDoVidro(texto: unknown): string {
    const v = vidroCanonico(texto)
    return [v.tempera, v.cor, v.espessura === null ? null : `${v.espessura} mm`, ...v.resto].filter((x): x is string => x !== null).join(' ')
}

/** Dois textos de vidro dizem o MESMO vidro: a mesma forma canônica (não vazia). */
export const mesmoVidro = (a: unknown, b: unknown) => {
    const fa = formaCanonicaDoVidro(a)
    return fa !== '' && fa === formaCanonicaDoVidro(b)
}

/**
 * O vidro proposto foi DITO na mensagem: toda palavra dele (fora o enchimento) está na mensagem — os números pelo valor ("4mm" = "4 mm").
 * "Vidro comum 4 mm" sobre "vidro 4mm" não foi dito: "comum" veio de fora. Um vidro sem palavra nenhuma não foi dito.
 */
export function vidroDito(proposto: unknown, mensagem: string): boolean {
    if (typeof proposto !== 'string') return false
    const daMensagem = new Set(palavrasDoVidro(mensagem).map((p) => (ehNumero(p) ? numeroNormal(p) : p)))
    const palavras = palavrasDoVidro(proposto).filter((p) => !ENCHIMENTO.has(p))
    return palavras.length > 0 && palavras.every((p) => daMensagem.has(ehNumero(p) ? numeroNormal(p) : p))
}
