/**
 * A ORDEM DETERMINANTE DAS TIPOLOGIAS (dono do produto, 20/11/2026), de fora para dentro:
 *
 *     FAMÍLIA > LINHA > FORMATO > FOLHAS/MÓDULOS > VARIAÇÕES
 *
 * > "Então, fica decidido como família, linha, formato, folhas e variações."
 *
 * - FAMÍLIA é o MATERIAL — o campo `familia` do motor e do item (hoje só "PVC"). É por ela que alumínio, ACM e porta interna entram depois, sem
 *   encostar no PVC: duas tipologias de famílias diferentes NUNCA se comparam.
 * - LINHA é a linha de produto (EUROPA 42, EUROPA 60, DESIGN no PVC; no alumínio serão outras).
 * - FORMATO é o que sai da boca do vendedor: porta de correr, janela de correr, janela com persiana, maxim-ar, giro, oscilo-batente, pivotante,
 *   fixo. A persiana é do formato ("JANELA DE GIRO ... COM PERSIANA" não é "janela de correr": é giro com persiana).
 * - FOLHAS/MÓDULOS, como o nome diz.
 * - VARIAÇÕES: a principal não se elege à mão — ela está no nome que o fornecedor dá, lido pelas BARRAS VERTICAIS (dono do produto, 20/11/2026:
 *   "não use lista de palavras-chave"). A descrição se separa por `|`; a PRIMEIRA parte é o formato e as folhas/módulos, a ÚLTIMA é a linha,
 *   e cada parte entre elas é um QUALIFICADOR. A PRINCIPAL da seção (família + linha + formato + folhas/módulos) é a de MENOS qualificadores;
 *   o empate se resolve pelo MENOR código. Nada de "zero qualificadores": a porta de giro de 1 folha não tem lisa, e a principal é a DP-151
 *   ("| VIDRO"), que tem um. Os qualificadores se NORMALIZAM antes de comparar ("FECH CENTRAL" = "FECHAMENTO CENTRAL", "2 VIDROS - 1 TELA" =
 *   "02 VIDROS - 01 TELA", "01 VZ VENT - 01 VZ CEGA" = "01 VENEZIANA VENTILADA - 01 VENEZIANA CEGA").
 * - JANELA e PORTA são formatos diferentes em toda parte, também no oscilo-batente (DP-122 ≠ DP-165); e "+ GIRO" é formato próprio (DP-126 ≠ DP-127).
 *
 * A RESSALVA, que fica no código: esta é a ordem de ORGANIZAÇÃO do catálogo, NÃO um roteiro de perguntas. O agente NÃO pergunta a linha: ele a
 * deduz do formato pedido — o formato a determina em quase todo caso (de correr só existe na 42; maxim-ar, giro, oscilo-batente, pivotante e fixo
 * só na 60). Só quando o MESMO formato existe em mais de uma linha é que a linha desempata: EUROPA 42, depois EUROPA 60, depois DESIGN (na
 * maxim-ar, a 60 ganha da DESIGN, como a #306 já fazia; num empate futuro dentro do PVC, a 42 vem primeiro).
 *
 * O FORNECEDOR é o SEXTO nível (dono do produto, 20/11/2026: "Fornecedor tem que ser a última coluna, porque eu tenho que saber primeiro o que eu estou
 * considerando para encontrar o que eu vou comprar"), e NÃO é atributo da esquadria: é de cada INSUMO, e se resolve por insumo, no preço. Nada
 * aqui olha o fornecedor — a tipologia é escolhida sem saber de quem se compra. E o VIDRO não entra na escolha (no alumínio ele troca o baguete:
 * é peça da lista de corte, resolvida depois).
 *
 * O agente escolhe a PRINCIPAL dentro do grupo que casa com o pedido, salvo quando o vendedor pede o extra com todas as letras ("com veneziana",
 * "trilho de alumínio", "com bandeira"). Nunca pela ordem do arquivo.
 */
import type { CandidatoDeTipologia } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { cabeNosLimites } from '@/lib/atendimentos-ia/tipologias-candidatas'

/** Maiúscula, sem acento, aspas fora, espaço único. */
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/["“”]/g, ' ').replace(/\s+/g, ' ').trim()

/** A ORDEM DAS LINHAS, quando o mesmo formato existe em mais de uma: a 42 primeiro, a 60 depois, a DESIGN por último; outra linha, depois delas. */
export const ORDEM_DAS_LINHAS: readonly RegExp[] = [/\bEUROPA\s+42\b/, /\bEUROPA\s+60\b/, /\bDESIGN\b/]
export const posicaoDaLinha = (linha: string | null | undefined): number => {
    const i = ORDEM_DAS_LINHAS.findIndex((re) => re.test(normal(linha ?? '')))
    return i < 0 ? ORDEM_DAS_LINHAS.length : i
}

/**
 * As ABREVIAÇÕES e o plural que o fornecedor escreve de dois jeitos na mesma tabela — a forma, não uma lista do que é variação: elas só fazem duas
 * grafias do MESMO qualificador ficarem iguais. Os números ganham dois dígitos ("2" = "02").
 */
const ABREVIACOES: Readonly<Record<string, string>> = { FECH: 'FECHAMENTO', VZ: 'VENEZIANA', VENT: 'VENTILADA', HZ: 'HORIZONTAL', VT: 'VERTICAL', MOD: 'MODULACAO', ALT: 'ALTURA' }
const singular = (p: string) => (p.length > 3 && /[^S]S$/.test(p) ? (/AIS$/.test(p) ? p.replace(/AIS$/, 'AL') : p.slice(0, -1)) : p)
const palavraNormal = (p: string) => (/^\d+$/.test(p) ? p.padStart(2, '0') : ABREVIACOES[p] ?? singular(p))
/** Um qualificador (ou um texto) na forma de comparar: as palavras normalizadas, na ordem; a pontuação vira separador, o hífen solto também. */
export const normalizarQualificador = (t: string) => normal(t).split(/[^A-Z0-9-]+/).filter((p) => p !== '' && !/^-+$/.test(p)).map(palavraNormal).join(' ')

export type PosicaoNaOrdem = {
    familia: string
    linha: string | null
    /** O formato: a primeira parte da descrição sem as folhas e sem a frase dos módulos ("JANELA DE CORRER COM PERSIANA", "PORTA OSCILO BATENTE + GIRO"). */
    formato: string
    /**
     * Folhas, ou módulos verticais ("V" quando a tipologia os deixa variáveis); a tipologia que FALA em módulos sem fixar os verticais tem 1.
     * "variavel" quando a primeira parte não traz número nenhum — no ALUMÍNIO (dono do produto, 20/11/2026) as folhas/módulos são VARIÁVEL DE
     * ENTRADA, e a mesma tipologia aceita de 01 a 06: o número vem do pedido, nunca do nome, e todas as do formato ficam na mesma seção.
     */
    quantidade: number | 'V' | 'variavel'
    /** Os qualificadores, normalizados, na ordem da descrição: as partes entre a primeira e a última. */
    qualificadores: string[]
}

/** A primeira parte, partido em formato e quantidade. */
function formatoEQuantidade(primeiro: string): Pick<PosicaoNaOrdem, 'formato' | 'quantidade'> {
    let s = normal(primeiro)
    const folhas = /\b(\d+)\s+FOLHAS?(\s+MOVEIS)?\b/.exec(s)
    if (folhas) s = s.replace(folhas[0], ' ')
    const modulos = /\bCOM\b.*\bMODULOS?\b.*$/.exec(s)
    let quantidade: PosicaoNaOrdem['quantidade'] = folhas ? Number(folhas[1]) : 'variavel'
    if (modulos) {
        const vertical = /\b(\d+|V)\s+MODULOS?\s+(VERTICA\w*|VT)\b/.exec(modulos[0])
        if (!folhas) quantidade = vertical ? (vertical[1] === 'V' ? 'V' : Number(vertical[1])) : 1
        s = s.replace(modulos[0], ' ')
    }
    return { formato: s.replace(/\s+/g, ' ').trim(), quantidade }
}

export function posicaoNaOrdem(c: Pick<CandidatoDeTipologia, 'familia' | 'linha' | 'descricao'>): PosicaoNaOrdem {
    const partes = (c.descricao ?? '').split('|').map((p) => p.trim())
    const meio = partes.length > 2 ? partes.slice(1, -1) : []
    return { familia: c.familia, linha: c.linha, ...formatoEQuantidade(partes[0] ?? ''), qualificadores: meio.map(normalizarQualificador).filter(Boolean) }
}

/** A seção (família, formato, folhas/módulos) sem a linha — a linha se DEDUZ dentro dela; e a seção com a linha, onde a principal se elege. */
export const formatoDe = (p: PosicaoNaOrdem) => `${p.familia}|${p.formato}|${p.quantidade}`
export const secaoDe = (p: PosicaoNaOrdem) => `${formatoDe(p)}|${p.linha ?? ''}`

/** O código pelo número ("DP-09" < "DP-10" < "DP-017" = 17 < "DP-18"), e pelo texto quando o número empata. */
export const compararCodigo = (a: string, b: string): number => {
    const na = Number(/(\d+)\D*$/.exec(a)?.[1] ?? NaN), nb = Number(/(\d+)\D*$/.exec(b)?.[1] ?? NaN)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Palavras que NÃO pedem variação, no texto do vendedor e no qualificador: as curtas, os números, as de ligação, o "fixo" que acompanha bandeira e
 * peitoril, o material da família — e o VIDRO, que é dito em toda esquadria ("vidro 4mm") e não entra na escolha da tipologia (20/11/2026).
 */
const NAO_PEDEM = new Set(['COM', 'SEM', 'FIXA', 'FIXO', 'MOVEL', 'MOVEI', 'PVC', 'VIDRO'])
const pedeAlgo = (p: string) => p.length >= 3 && !/^\d+$/.test(p) && !NAO_PEDEM.has(p)
const palavrasQuePedem = (t: string) => normalizarQualificador(t).split(' ').filter(pedeAlgo)

/**
 * As palavras que o vendedor PEDIU, entre as que os qualificadores da seção usam: "com veneziana" pede VENEZIANA; "trilho de alumínio" pede TRILHO
 * e ALUMINIO; "vidro 4mm" não pede nada.
 */
export function palavrasPedidas(texto: string, qualificadores: Iterable<string>): Set<string> {
    const ditas = new Set(palavrasQuePedem(texto))
    const usadas = new Set([...qualificadores].flatMap(palavrasQuePedem))
    return new Set([...ditas].filter((p) => usadas.has(p)))
}

/**
 * A chave da ordem na seção, dadas as palavras pedidas: (1) os qualificadores que NÃO tocam no pedido; (2) o total de qualificadores; (3) as
 * palavras que sobram nos qualificadores que tocam no pedido ("com veneziana": a DP-10, VENEZIANA, antes da DP-11, que traz também VENTILADA e
 * CEGA); (4) o menor código. Sem pedido, é a regra do dono do produto: menos qualificadores, depois o menor código.
 */
function chaveNaSecao(c: Pick<CandidatoDeTipologia, 'familia' | 'linha' | 'descricao' | 'tipologia'>, pedidas: ReadonlySet<string>): [number, number, number] {
    const qs = posicaoNaOrdem(c).qualificadores.map(palavrasQuePedem)
    const tocam = qs.filter((ps) => ps.some((p) => pedidas.has(p)))
    return [qs.length - tocam.length, qs.length, tocam.flat().filter((p) => !pedidas.has(p)).length]
}
const compararComPedido = (pedidas: ReadonlySet<string>) => (a: Pick<CandidatoDeTipologia, 'familia' | 'linha' | 'descricao' | 'tipologia'>, b: typeof a): number => {
    const ka = chaveNaSecao(a, pedidas), kb = chaveNaSecao(b, pedidas)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || compararCodigo(a.tipologia, b.tipologia)
}

/** A ordem dentro da seção sem pedido nenhum: menos qualificadores, depois o menor código. Nunca a ordem do arquivo. */
export const compararNaSecao = compararComPedido(new Set())

/**
 * A PRINCIPAL para a tipologia escolhida, na seção dela (mesma família, formato e folhas/módulos):
 * - só concorrem as que TÊM todas as palavras pedidas pelo vendedor (`texto`);
 * - a LINHA se deduz na ordem 42 > 60 > DESIGN: a primeira linha cujo PRIMEIRO LUGAR (as de menos qualificadores fora do pedido) cabe na medida.
 *   Quando o primeiro lugar de uma linha não cabe, a linha passa adiante — a medida nunca empurra para uma variação que ninguém pediu;
 * - dentro dela, a ordem da seção (menos qualificadores, menor código).
 * Devolve null quando a escolhida já é ela, quando não está na lista, quando nenhum primeiro lugar cabe, ou quando duas linhas que a ordem não conhece
 * empatam (a linha não se adivinha): nesses casos nada muda em silêncio.
 */
export function principalDoGrupo(codigo: string, candidatos: readonly CandidatoDeTipologia[], item: Pick<ItemDoLevantamento, 'largura_mm' | 'altura_mm'>,
    texto: string): string | null {
    const c = candidatos.find((x) => x.tipologia === codigo)
    if (!c) return null
    const formato = formatoDe(posicaoNaOrdem(c))
    const doFormato = candidatos.filter((x) => formatoDe(posicaoNaOrdem(x)) === formato)
    const pedidas = palavrasPedidas(texto, doFormato.flatMap((x) => posicaoNaOrdem(x).qualificadores))
    const servem = doFormato.filter((x) => { const ps = new Set(posicaoNaOrdem(x).qualificadores.flatMap(palavrasQuePedem)); return [...pedidas].every((p) => ps.has(p)) })
    const comparar = compararComPedido(pedidas)
    const posicoes = [...new Set(servem.map((x) => posicaoDaLinha(x.linha)))].sort((a, b) => a - b)
    for (const pos of posicoes) {
        const daPosicao = servem.filter((x) => posicaoDaLinha(x.linha) === pos)
        const vencedoras: CandidatoDeTipologia[] = []
        for (const linha of new Set(daPosicao.map((x) => x.linha))) {
            const daLinha = daPosicao.filter((x) => x.linha === linha).sort(comparar)
            const melhor = chaveNaSecao(daLinha[0], pedidas)[0]
            const primeira = daLinha.find((x) => chaveNaSecao(x, pedidas)[0] === melhor && cabeNosLimites(x, item))
            if (primeira) vencedoras.push(primeira)
        }
        if (vencedoras.length > 1) return null
        if (vencedoras.length === 1) return vencedoras[0].tipologia === codigo ? null : vencedoras[0].tipologia
    }
    return null
}

/** A ÁRVORE do catálogo, para conferir contra a medição: família > linha > formato > folhas/módulos, a principal e quantas variações. */
export type RamoDaArvore = { familia: string; linha: string | null; formato: string; quantidade: PosicaoNaOrdem['quantidade']; principal: string; variacoes: number; codigos: string[] }
export function arvoreDoCatalogo(candidatos: readonly Pick<CandidatoDeTipologia, 'familia' | 'linha' | 'descricao' | 'tipologia'>[]): RamoDaArvore[] {
    const secoes = new Map<string, typeof candidatos[number][]>()
    for (const c of candidatos) { const k = secaoDe(posicaoNaOrdem(c)); secoes.set(k, [...(secoes.get(k) ?? []), c]) }
    return [...secoes.values()].map((cs) => {
        const ordem = [...cs].sort(compararNaSecao)
        const p = posicaoNaOrdem(ordem[0])
        return { familia: p.familia, linha: p.linha, formato: p.formato, quantidade: p.quantidade, principal: ordem[0].tipologia, variacoes: ordem.length - 1, codigos: ordem.map((x) => x.tipologia) }
    }).sort((a, b) => a.familia.localeCompare(b.familia) || posicaoDaLinha(a.linha) - posicaoDaLinha(b.linha) || a.formato.localeCompare(b.formato) || String(a.quantidade).localeCompare(String(b.quantidade), 'pt', { numeric: true }))
}
