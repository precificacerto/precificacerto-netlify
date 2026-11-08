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
 *      → `vidroPodado(proposto, mensagem)` (ajuste do dono do produto, 04/11/2026: "pode, não derrube"): fica o que está na mensagem, cai a
 *        palavra que o modelo completou — "incolor temperado 8 mm" sobre "vidro 8mm" vira "8 mm"; só cai INTEIRO quando nada do vidro está na
 *        mensagem. "O vendedor nunca pode ser perguntado por um vidro que ele já disse." O padrão da instrução vem em `vidro_padrao`, e o código
 *        só o aplica à esquadria que ficou sem vidro (`aplicarProposta`).
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

// ── O LEITOR CANÔNICO do texto do vidro (dono do produto, 08/11/2026) ──────────────────────────────────────────────────────────────────────
/**
 * O ÚNICO caminho que lê espessura, tipo (têmpera) e cor do texto livre do vidro gravado no item. O caso que originou (Antonio Rock, 08/11/2026):
 * "incolor 4", na DP-02 cujos baguetes aceitam 4, 5, 6, 8, 18, 20, 21 e 24 mm, saiu como "falta a espessura do vidro", e o caminho sugerido foi
 * "incolor 4 4 mm" — o leitor do cálculo só via número seguido de "mm", e a frase de exemplo acrescentava a espessura sem tirar o número dito.
 *
 * As regras, como foram ditas:
 *   - a espessura com ou sem unidade, em qualquer posição ("incolor 4", "4mm", "4 milímetros", "comum 6 mm incolor", "incolor 4 mm temperado");
 *   - o número SEM unidade só vale como espessura se for uma das que a tipologia aceita (`aceitas`); COM unidade vale sempre;
 *   - mais de um número: o que vem com unidade ganha; nenhum com unidade, ganha o que está na lista aceita; dois que valem → AMBÍGUO, e o agente
 *     pergunta (`espessuras_ambiguas`);
 *   - texto sem número ("mini boreal") → espessura nula, sem erro: há tipologia cujo baguete não depende da espessura.
 * A composição ("4+4 mm") não é UMA espessura: fica nula, como antes — nada é suposto — e o tipo, sem palavra, é laminado.
 */
export type LeituraDoVidro = {
    texto_original: string | null
    /** A espessura, em mm; nula quando o texto não diz uma (sem número, número fora da lista, composição) ou quando é ambíguo. */
    espessura_mm: number | null
    /** As espessuras que valem, quando mais de uma vale — então `espessura_mm` é nula e o agente pergunta qual. Nula quando não é ambíguo. */
    espessuras_ambiguas: number[] | null
    tipo: Tempera | null
    cor: string | null
    /** Os números do texto, normalizados ("4", "3+3", "7.5"), na ordem: servem à COMPARAÇÃO, não decidem a espessura. */
    numeros: string[]
    /** As palavras que não são número, têmpera, cor nem enchimento, na ordem do texto. */
    resto: string[]
}

type NumeroNoTexto = { inicio: number; fim: number; numero: string; valor: number | null; comUnidade: boolean }

/** O número, a composição ("4+4", "4 + 4") e a unidade logo depois ("mm", "milímetro(s)"), com a posição no texto. */
const NUMERO_DO_VIDRO = /(?<![\d.,+])(\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)*)(?!\d)(\s*(?:mm|mil[ií]metros?)(?![\p{L}\d]))?/giu

function numerosNoTexto(texto: string): NumeroNoTexto[] {
    return [...texto.matchAll(NUMERO_DO_VIDRO)].map((m) => {
        const numero = numeroNormal(m[1].replace(/\s+/g, '').replace(/,/g, '.'))
        const valor = numero.includes('+') ? null : Number(numero)
        return { inicio: m.index ?? 0, fim: (m.index ?? 0) + m[0].length, numero, valor: valor !== null && Number.isFinite(valor) && valor > 0 ? valor : null, comUnidade: m[2] !== undefined }
    })
}

const distintos = (ns: number[]) => [...new Set(ns)].sort((a, b) => a - b)

/** A espessura pelas regras acima: a com unidade ganha; sem unidade, só a da lista aceita; duas que valem é ambíguo. */
function espessuraDos(numeros: readonly NumeroNoTexto[], aceitas: readonly number[] | null): Pick<LeituraDoVidro, 'espessura_mm' | 'espessuras_ambiguas'> {
    const comUnidade = numeros.filter((n) => n.comUnidade)
    const candidatas = comUnidade.length > 0
        ? distintos(comUnidade.flatMap((n) => (n.valor === null ? [] : [n.valor])))
        : aceitas === null ? [] : distintos(numeros.flatMap((n) => (n.valor !== null && aceitas.includes(n.valor) ? [n.valor] : [])))
    if (candidatas.length === 1) return { espessura_mm: candidatas[0], espessuras_ambiguas: null }
    if (candidatas.length > 1) return { espessura_mm: null, espessuras_ambiguas: candidatas }
    return { espessura_mm: null, espessuras_ambiguas: null }
}

/**
 * Lê o texto livre do vidro. `aceitas` são as espessuras que os baguetes da tipologia em questão aceitam; nula quando não há tipologia em questão
 * (então o número sem unidade não vale como espessura).
 */
export function lerVidro(texto: unknown, aceitas: readonly number[] | null = null): LeituraDoVidro {
    const leitura: LeituraDoVidro = { texto_original: typeof texto === 'string' ? texto : null, espessura_mm: null, espessuras_ambiguas: null, tipo: null, cor: null, numeros: [], resto: [] }
    if (typeof texto !== 'string') return leitura
    const numeros = numerosNoTexto(texto)
    Object.assign(leitura, espessuraDos(numeros, aceitas))
    leitura.numeros = numeros.map((n) => n.numero)
    // as palavras, sem os números e as unidades deles
    let semNumeros = texto
    for (const n of [...numeros].reverse()) semNumeros = `${semNumeros.slice(0, n.inicio)} ${semNumeros.slice(n.fim)}`
    for (const p of palavrasDoVidro(semNumeros)) {
        if (ehNumero(p)) { leitura.numeros.push(numeroNormal(p)); continue }
        if (p in TEMPERAS) { leitura.tipo ??= TEMPERAS[p]; continue }
        if (p in CORES) { leitura.cor ??= CORES[p]; continue }
        if (ENCHIMENTO.has(p)) continue
        leitura.resto.push(p)
    }
    // "3+3" é laminado por construção, mesmo sem a palavra
    if (leitura.tipo === null && leitura.numeros.some((n) => n.includes('+'))) leitura.tipo = 'laminado'
    return leitura
}

/**
 * O vidro dito com OUTRA espessura — a frase de exemplo do caminho ("muda o vidro da esquadria 3 para …"). Montada SEM o número dito: o número que
 * era a espessura (o com unidade; senão o primeiro) dá lugar a "N mm", e os outros números saem. Nunca "incolor 4 4 mm".
 * "temperado incolor 4mm" com 5 → "temperado incolor 5 mm"; "incolor 4" com 5 → "incolor 5 mm"; "mini boreal" com 5 → "mini boreal 5 mm"; sem vidro, "5 mm".
 */
export function vidroComEspessura(vidro: unknown, mm: number): string {
    const n = `${String(mm).replace('.', ',')} mm`
    const texto = typeof vidro === 'string' ? vidro.trim() : ''
    if (texto === '') return n
    const numeros = numerosNoTexto(texto)
    if (numeros.length === 0) return `${texto} ${n}`
    const alvo = numeros.find((x) => x.comUnidade) ?? numeros[0]
    let r = texto
    for (const x of [...numeros].reverse()) {
        if (x === alvo) { r = `${r.slice(0, x.inicio)}${n}${r.slice(x.fim)}`; continue }
        // o número que sai leva junto o "ou"/"e" que o ligava ao outro ("incolor 4 ou 6" → "incolor 6 mm", nunca "incolor 6 mm ou")
        const antes = /\s*(?:\bou\b|\be\b|,|\/)\s*$/i.exec(r.slice(0, x.inicio))
        const depois = antes ? null : /^\s*(?:\bou\b|\be\b|,|\/)\s*/i.exec(r.slice(x.fim))
        r = `${r.slice(0, x.inicio - (antes?.[0].length ?? 0))} ${r.slice(x.fim + (depois?.[0].length ?? 0))}`
    }
    return r.replace(/\s+/g, ' ').trim()
}

/** A leitura para COMPARAR (dedupe e agrupamento): o primeiro número é a espessura comparada, com ou sem unidade; os outros vão ao resto. */
export function vidroCanonico(texto: unknown): VidroLido {
    const l = lerVidro(texto)
    return { espessura: l.numeros[0] ?? null, tempera: l.tipo, cor: l.cor, resto: [...l.numeros.slice(1), ...l.resto].sort() }
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

const chave = (p: string) => (ehNumero(p) ? numeroNormal(p) : p)

/**
 * O vidro proposto PODADO ao que a mensagem diz ("pode, não derrube"): palavra por palavra, fica a que está na mensagem (os números pelo valor:
 * "4mm" = "4 mm") e cai a que o modelo completou; o enchimento ("vidro", "mm", "de") acompanha o que ficou. Devolve o texto como veio quando nada
 * caiu; o podado, em minúsculas e sem acento, quando algo caiu — "incolor temperado 8 mm" sobre "vidro 8mm" → "8 mm", "Vidro comum 4 mm" sobre
 * "vidro 4mm" → "vidro 4 mm"; ou null quando NADA do vidro está na mensagem (então cai inteiro).
 */
export function vidroPodado(proposto: unknown, mensagem: string): string | null {
    if (typeof proposto !== 'string') return null
    const daMensagem = new Set(palavrasDoVidro(mensagem).map(chave))
    const palavras = palavrasDoVidro(proposto)
    const ficam = palavras.filter((p) => ENCHIMENTO.has(p) || daMensagem.has(chave(p)))
    if (!ficam.some((p) => !ENCHIMENTO.has(p))) return null
    return ficam.length === palavras.length ? proposto.trim() : ficam.join(' ')
}

/** O vidro proposto foi DITO INTEIRO na mensagem: nada a podar. */
export const vidroDito = (proposto: unknown, mensagem: string): boolean => typeof proposto === 'string' && vidroPodado(proposto, mensagem) === proposto.trim()
