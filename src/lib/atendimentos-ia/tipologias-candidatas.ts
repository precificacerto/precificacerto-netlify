/**
 * Atendimentos I.A. — PORTA NÃO É JANELA, e OS LIMITES DO MOTOR (dono do produto, 03/11/2026). Funções PURAS: nem banco, nem rede.
 *
 * O caso que originou: levantamento "Geronimo Silva", 03/11 — "Janela de correr 1,50x1,20" e "porta janela 2,50x2,40" saíram as três como
 * DP-02 = "JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42", a IA perguntou a quantidade e repetiu dois itens idênticos. Medido no motor da De
 * Paula (164 tipologias): 91 descrições começam com PORTA, 50 com JANELA, 15 MAXIM-AR, 8 FIXO; `alt_min/alt_max` em 130, `larg_min` em 8;
 * as faixas de altura de porta (464 a 3288) e de janela (388 a 2644) se sobrepõem — a altura NÃO separa porta de janela.
 *
 * As decisões, registradas como foram ditas:
 *   1. "PORTA × JANELA: o descarte usa a DESCRIÇÃO (primeira palavra). 'porta', 'porta-janela' e 'porta janela' do vendedor descartam toda
 *      tipologia cuja descrição começa com JANELA; 'janela' descarta as que começam com PORTA. MAXIM-AR e FIXO NÃO entram nessa regra — não são
 *      descartados por ela, só pelos limites. O descarte é no código, antes de o modelo escolher, e a lista enviada ao modelo já vai filtrada."
 *   2. "LIMITES: NULL nunca descarta — ausente não é zero, e nunca invente limite. Quando o item fica fora de todas as faixas, não escolha a
 *      mais próxima: frase própria, nomeando a medida do item e a faixa das tipologias que sobraram, pedindo ao vendedor que confirme a medida ou
 *      diga a tipologia. O aviso LIMITE do cálculo continua existindo para o que passar."
 *   3. "AMBIENTE: não crie campo nenhum. Agrupe por tipologia + medidas + variáveis (escolhas), que é o que existe hoje. Deixe o código preparado
 *      para o ambiente entrar como mais um critério quando existir, mas não o invente agora." (O agrupamento mora em `levantamento-em-montagem.ts`.)
 *   E: a palavra do vendedor chega POR ITEM, pelo campo `abertura` da ferramenta (a IA classifica o texto, não escolhe), e também pela mensagem
 *   inteira quando ela traz uma só das palavras — é assim que "Janela de correr 1,50x1,20 e porta janela 2,50x2,40" separa as duas.
 */

import { MEDIDA_MAXIMA_MM, MEDIDA_MINIMA_MM } from '@/lib/atendimentos-ia/pre-definicao'

export type Abertura = 'porta' | 'janela'
export const ABERTURAS: readonly Abertura[] = ['porta', 'janela']

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** "porta-janela" e "porta janela" são PORTA: viram a palavra "porta" antes de se procurar "janela". */
const comPortaJanelaResolvida = (t: string) => semAcento(t).replace(/\bportas?[\s-]+janelas?\b/g, ' porta ')

/** As palavras de abertura que a mensagem traz, já com "porta janela" contado como porta. */
export function palavrasDeAbertura(texto: string): Set<Abertura> {
    const t = comPortaJanelaResolvida(texto)
    const s = new Set<Abertura>()
    if (/\bportas?\b/.test(t)) s.add('porta')
    if (/\bjanelas?\b/.test(t)) s.add('janela')
    return s
}

/** A abertura que a MENSAGEM inteira diz: uma só das palavras. As duas (fora de "porta janela"), ou nenhuma, é null — aí vale o item. */
export function aberturaDita(texto: string): Abertura | null {
    const s = palavrasDeAbertura(texto)
    return s.size === 1 ? [...s][0] : null
}

/** A abertura que a DESCRIÇÃO da tipologia declara: a PRIMEIRA palavra. MAXIM-AR, FIXO e o resto não declaram (null). */
export function aberturaDaDescricao(descricao: string | null): Abertura | null {
    if (typeof descricao !== 'string') return null
    const primeira = semAcento(descricao).trim().split(/[^a-z]+/)[0]
    return primeira === 'porta' ? 'porta' : primeira === 'janela' ? 'janela' : null
}

/** A tipologia serve à abertura dita? A que não declara (maxim-ar, fixo) serve a qualquer uma; sem abertura dita, todas servem. */
export const aberturaCompativel = (descricao: string | null, dita: Abertura | null): boolean => {
    const declarada = aberturaDaDescricao(descricao)
    return dita === null || declarada === null || declarada === dita
}

export function filtrarPorAbertura<C extends { descricao: string | null }>(candidatos: readonly C[], dita: Abertura | null): C[] {
    return candidatos.filter((c) => aberturaCompativel(c.descricao, dita))
}

/** O campo `abertura` da ferramenta só vale se é uma das duas palavras E o vendedor a escreveu na mensagem — a IA classifica, não inventa. */
export function aberturaDoItem(valor: unknown, ditas: ReadonlySet<Abertura>, daMensagem: Abertura | null): Abertura | null {
    if (typeof valor === 'string' && (ABERTURAS as readonly string[]).includes(valor) && ditas.has(valor as Abertura)) return valor as Abertura
    return daMensagem
}

// ── Os limites ─────────────────────────────────────────────────────────────────────────────
export type Limites = { larg_min_mm: number | null; larg_max_mm: number | null; alt_min_mm: number | null; alt_max_mm: number | null }
export type Medidas = { largura_mm: number | null; altura_mm: number | null }
/** O que `aplicarProposta` precisa de cada candidata: o código, a descrição (a abertura) e os limites. */
export type CandidatoParaAProposta = Limites & { tipologia: string; descricao: string | null }

export const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Cabe? NULL NUNCA descarta (ausente não é zero), e só a medida dita é conferida. */
export function cabeNosLimites(l: Limites, m: Medidas): boolean {
    const fora = (v: number | null, min: number | null, max: number | null) => v !== null && ((min !== null && v < min) || (max !== null && v > max))
    return !fora(m.largura_mm, l.larg_min_mm, l.larg_max_mm) && !fora(m.altura_mm, l.alt_min_mm, l.alt_max_mm)
}

const mm = (n: number) => `${new Intl.NumberFormat('pt-BR').format(n)} mm`
/**
 * Um limite na linha do prompt, COMPACTO (dono do produto, 05/11/2026: a lista enxuta): "A 388-2439", "L ≥300", "A ≤2000"; e NADA quando o
 * arquivo não traz — o cabeçalho da lista diz que a medida sem L ou sem A não tem limite. Medido na De Paula: só 8 das 164 tipologias têm
 * limite de largura, e "largura sem limite no arquivo" se repetia 156 vezes; os limites eram 9.926 dos 25.306 caracteres da lista.
 */
const limiteCompacto = (sigla: 'L' | 'A', min: number | null, max: number | null): string | null => {
    if (min === null && max === null) return null
    if (min !== null && max !== null) return `${sigla} ${min}-${max}`
    return min !== null ? `${sigla} ≥${min}` : `${sigla} ≤${max as number}`
}
/** Os limites como vão ao modelo, na linha da tipologia: "A 388-2439", "L 905-1384 A 464-2054", ou vazio quando o arquivo não traz nenhum. */
export const limitesNoPrompt = (l: Limites): string =>
    [limiteCompacto('L', l.larg_min_mm, l.larg_max_mm), limiteCompacto('A', l.alt_min_mm, l.alt_max_mm)].filter((x): x is string => x !== null).join(' ')

/**
 * A descrição como vai ao modelo: SEM o último trecho quando ele é a LINHA de produto, que já vem numa coluna própria do motor ("JANELA DE
 * CORRER 02 FOLHAS MÓVEIS | EUROPA 42" com linha "PVC WOLFF EUROPA 42" → "JANELA DE CORRER 02 FOLHAS MÓVEIS"). Medido na De Paula: as 164
 * descrições terminam no nome da linha (1.473 caracteres), e sem ele continuam 163 distintas — as mesmas 163 de antes. O trecho que não está
 * na linha fica: nada é tirado por posição.
 */
export function descricaoNoPrompt(descricao: string | null, linha: string | null): string | null {
    if (descricao === null) return null
    const partes = descricao.split('|').map((p) => p.trim())
    if (partes.length < 2 || linha === null) return descricao
    const ultima = partes[partes.length - 1]
    if (ultima === '' || !semAcento(linha).includes(semAcento(ultima))) return descricao
    return partes.slice(0, -1).join(' | ')
}

const descricaoDaAbertura = (a: Abertura | null) => (a === 'porta' ? 'de porta' : a === 'janela' ? 'de janela' : 'do motor')
const medidaDita = (m: Medidas): string =>
    m.largura_mm !== null && m.altura_mm !== null ? `${new Intl.NumberFormat('pt-BR').format(m.largura_mm)} x ${mm(m.altura_mm)}`
        : m.largura_mm !== null ? `${mm(m.largura_mm)} de largura` : m.altura_mm !== null ? `${mm(m.altura_mm)} de altura` : 'a medida dita'

/** A faixa que as tipologias que sobraram cobrem, por medida: do menor mínimo ao maior máximo. A sem limite não conta — e isso é dito. */
function faixaDasQueSobraram(nome: string, mins: number[], maxs: number[]): string | null {
    if (mins.length === 0 && maxs.length === 0) return null
    if (mins.length && maxs.length) return `as ${nome}s vão de ${mm(Math.min(...mins))} a ${mm(Math.max(...maxs))}`
    return mins.length ? `as ${nome}s começam em ${mm(Math.min(...mins))}` : `as ${nome}s chegam a ${mm(Math.max(...maxs))}`
}

export const PEDIDO_DE_CONFIRMAR_A_MEDIDA =
    'Confirme a medida ou descreva a esquadria: janela ou porta, como abre (correr, abrir ou maxim-ar) e se tem persiana.'

/**
 * NENHUMA tipologia cabe (decisão 2): a medida do item e a faixa das que sobraram (depois do filtro porta × janela), por medida; a
 * tipologia sem limite no arquivo não entra na faixa, e a frase diz isso. Nunca "a mais próxima".
 */
export function fraseDeNenhumaTipologiaCabe(m: Medidas, sobraram: readonly Limites[], dita: Abertura | null): string {
    const num = (xs: Array<number | null>) => xs.filter((x): x is number => x !== null)
    const faixas = [
        m.largura_mm !== null ? faixaDasQueSobraram('largura', num(sobraram.map((c) => c.larg_min_mm)), num(sobraram.map((c) => c.larg_max_mm))) : null,
        m.altura_mm !== null ? faixaDasQueSobraram('altura', num(sobraram.map((c) => c.alt_min_mm)), num(sobraram.map((c) => c.alt_max_mm))) : null,
    ].filter((f): f is string => f !== null)
    const faixa = faixas.length ? `${faixas.join(' e ')} (a tipologia sem limite no arquivo não conta)` : 'nenhuma delas tem limite no arquivo'
    return `Nenhuma tipologia ${descricaoDaAbertura(dita)} cabe em ${medidaDita(m)}: ${faixa}. ${PEDIDO_DE_CONFIRMAR_A_MEDIDA}`
}

/** A tipologia escolhida contradiz a palavra do vendedor (decisão 1): descartada, e a pergunta é em linguagem de obra, pela abertura dita. */
export function fraseDaAberturaRecusada(dita: Abertura): string {
    return dita === 'porta'
        ? 'Entendi que é uma PORTA, e a tipologia que coube era de janela: descartei. Para achar a porta certa: como ela abre (correr, abrir ou pivotante), quantas folhas, e tem bandeira ou persiana?'
        : 'Entendi que é uma JANELA, e a tipologia que coube era de porta: descartei. Para achar a janela certa: como ela abre (correr, abrir ou maxim-ar), quantas folhas, e tem persiana?'
}

// ── O FILTRO PELO ACUMULADO (dono do produto, 05/11/2026) ──────────────────────────────────────
/**
 * O CASO QUE ORIGINOU (Jorge Koss, 05/11/2026, 14:04–14:08): "correr" e "maxim-ar" vieram no primeiro turno; os turnos seguintes
 * ("Nome é Jorge Koss", "Branco / Vidro Comum") não traziam palavra nenhuma, e a lista ia inteira (164 linhas) em todos os cinco. A decisão:
 *
 * > "filtro porta/janela lendo o ACUMULADO da conversa (esquadrias em espera + histórico) em vez de só o texto do turno. Com o acumulado,
 * > filtro por ABERTURA (correr, maxim-ar, abrir, giro, pivotante, fixo) pela coluna `tipo` do motor, COM rede de segurança obrigatória:
 * > se nenhuma candidata sobrar para alguma esquadria, refazer com a lista inteira em vez de recusar."
 *
 * O ACUMULADO são as mensagens do VENDEDOR na conversa (as do histórico de 24 h, que é de onde as esquadrias em espera vieram) mais a desta
 * vez. Cada LINHA de cada mensagem é um TRECHO: a esquadria do vendedor costuma ser uma linha ("1 Porta janelas de correr 2 folhas…",
 * "1 janela maxim ar, mini boreal 60 x60"). O trecho que diz porta ou janela (uma só das palavras) ou um TIPO do motor entra no filtro; o que
 * não diz nada não filtra. Por trecho, ficam as tipologias compatíveis com a abertura (`aberturaCompativel`) E do tipo dito; a lista enviada é
 * a UNIÃO dos trechos. A REDE DE SEGURANÇA: o trecho para o qual NENHUMA tipologia sobra ("basculante", "projetante", um tipo que o motor não
 * tem com aquela abertura) traz a lista INTEIRA — o filtro nunca esconde a tipologia certa por não entender a palavra. Sem trecho nenhum, a
 * lista vai inteira, como antes.
 *
 * O TIPO é a coluna `tipo` da Detalhe do motor, lido como dado (De Paula: Correr, Giro / Abrir, Maxim-ar, Oscilo-batente, Fixo, Pivotante),
 * não um mapa escrito à mão: o tipo é dito quando ALGUMA palavra dele (3 letras ou mais, sem acento) começa uma palavra do trecho — "maxim"
 * casa "maxim ar", "maxim-ar" e "maximar"; "giro" ou "abrir" casam o tipo "Giro / Abrir"; "oscilo" casa "oscilo-batente". A tipologia SEM tipo
 * no arquivo passa pelo filtro do tipo (ausente não é diferente — `ausente-vs-falso`). Só a lista do PROMPT é filtrada: a validação da
 * tipologia proposta (`aplicarProposta`) continua contra a lista inteira.
 *
 * LIMITE CONHECIDO, registrado: `DP-167 PORTA OSCILO BATENTE + GIRO` tem tipo Oscilo-batente; "porta de giro" não a traz enquanto sobrar
 * alguma porta de giro. Medido na De Paula (164 tipologias) nos cinco turnos do Jorge Koss: lista inteira hoje em todos; só porta/janela pelo
 * acumulado, 164 (as duas palavras); pelo tipo, 124; por trecho (porta ∧ Correr ∪ janela ∧ Maxim-ar), 87.
 */
export type TrechoDoAcumulado = {
    abertura: Abertura | null; tipos: ReadonlySet<string>; texto: string
    /** As medidas que a LINHA traz (`medidasDaLinha`), em mm: é por elas que a linha se liga à esquadria lida. Ausente nos trechos de antes. */
    medidas?: readonly Medidas[]
}

// ── O VOCABULÁRIO DA OBRA (dono do produto, 13/11/2026) ──────────────────────────────────────────
/**
 * > "'persiana' é apelido de JANELA DE CORRER COM PERSIANA; 'porta persiana' é PORTA DE CORRER COM PERSIANA. Não é falta de informação, é
 * > como se fala na obra. A abertura está dita: é correr." E o porquê, do PO: giro e oscilo-batente não levam persiana — a folha abre para
 * > dentro e bateria nela.
 *
 * A linha que diz persiana (e não "sem persiana") ganha o que o apelido afirma, só no que ela NÃO diz: a abertura JANELA quando não diz porta
 * nem janela, e o tipo de correr do motor quando não diz tipo nenhum. O que a linha diz vence o apelido ("janela de giro com persiana" continua
 * de giro). Sem o tipo de correr no motor, o apelido não se aplica (nunca um tipo que o motor não tem).
 */
const DIZ_PERSIANA = /\bpersianas?\b/
const SEM_PERSIANA = /\bsem\s+persianas?\b/
export function vocabularioDaObra(linha: string, tipos: readonly string[]): string {
    const t = semAcento(linha)
    if (!DIZ_PERSIANA.test(t) || SEM_PERSIANA.test(t)) return linha
    if (!tipos.some((tipo) => palavrasDoTipo(tipo).includes('correr'))) return linha
    const acrescimo: string[] = []
    if (palavrasDeAbertura(linha).size === 0) acrescimo.push('janela')
    if (tiposDitos(linha, tipos).size === 0) acrescimo.push('de correr')
    return acrescimo.length === 0 ? linha : `${linha} [${acrescimo.join(' ')} com persiana]`
}

// ── A LINHA DE ITEM: a medida "N x N" (dono do produto, 13/11/2026) ───────────────────────────────
/**
 * > "linha com medida N x N é linha de item, e linha de item sem abertura afirmada traz a lista inteira. [...] não deixe virar 'qualquer linha
 * > com dois números'."
 *
 * O número só é medida se a UNIDADE se lê pela grandeza e o resultado cai na faixa que a conversa já aceita para uma medida (`MEDIDA_MINIMA_MM`
 * a `MEDIDA_MAXIMA_MM`, de `pre-definicao.ts`): abaixo de 10, metros ("1,50" = 1500, "2" = 2000); de 10 a 99, centímetros ("60" = 600,
 * "60,5" = 605); de 100 em diante, milímetros ("2000"). Os dois lados têm de ser medida, e o "x" (ou "×") tem de estar entre eles.
 * O ERRO QUE SOBRA vai para o lado seguro: uma linha que não é de item e passa por medida ("2 x 3 unidades") só faz a lista ir inteira —
 * nunca corta candidata. Medida em metros por extenso ("1 metro e meio") não é lida: a linha fica como antes.
 */
const PAR_DE_MEDIDAS = /(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?\s*[x×]\s*(\d+(?:[.,]\d+)?)/gi
export function emMilimetros(numero: string): number | null {
    const v = Number(numero.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return null
    const mm = v < 10 ? Math.round(v * 1000) : v >= 100 ? Math.round(v) : Math.round(v * 10)
    return mm >= MEDIDA_MINIMA_MM && mm <= MEDIDA_MAXIMA_MM ? mm : null
}
export function medidasDaLinha(linha: string): Medidas[] {
    const achadas: Medidas[] = []
    for (const m of linha.matchAll(PAR_DE_MEDIDAS)) {
        const largura = emMilimetros(m[1])
        const altura = emMilimetros(m[2])
        if (largura !== null && altura !== null) achadas.push({ largura_mm: largura, altura_mm: altura })
    }
    return achadas
}
/** A linha é a desta esquadria: alguma medida dela é a largura E a altura que a esquadria tem (as duas lidas; nunca uma só). */
export const linhaDaEsquadria = (t: Pick<TrechoDoAcumulado, 'medidas'>, m: Medidas): boolean =>
    m.largura_mm !== null && m.altura_mm !== null && (t.medidas ?? []).some((x) => x.largura_mm === m.largura_mm && x.altura_mm === m.altura_mm)

/** As palavras de um tipo do motor que contam: 3 letras ou mais, sem acento e sem caixa ("Giro / Abrir" → giro, abrir; "Maxim-ar" → maxim). */
export const palavrasDoTipo = (tipo: string): string[] => semAcento(tipo).split(/[^a-z]+/).filter((p) => p.length >= 3)

/**
 * Os tipos do motor que o texto diz: alguma palavra do tipo começa uma palavra do texto. A palavra que termina em "o" vale também no
 * feminino — "janela FIXA" diz o tipo Fixo (defeito anterior ao #263, corrigido em 11/11/2026: "fixo" não começa "fixa").
 */
export function tiposDitos(texto: string, tipos: readonly string[]): Set<string> {
    const t = semAcento(texto)
    const ditos = new Set<string>()
    const comGenero = (p: string) => (p.endsWith('o') ? `${p.slice(0, -1)}[oa]` : p)
    for (const tipo of tipos) {
        if (palavrasDoTipo(tipo).some((p) => new RegExp(`\\b${comGenero(p)}`).test(t))) ditos.add(tipo)
    }
    return ditos
}

/**
 * Os trechos do acumulado: uma linha de uma mensagem do vendedor que diz a abertura (uma só das palavras), um tipo do motor, ou uma medida
 * (a LINHA DE ITEM, 13/11/2026). A linha passa antes pelo vocabulário da obra ("persiana"). A linha de item que não afirma abertura nem tipo
 * serve a toda candidata — e a lista vai inteira: sem abertura afirmada, nenhuma abertura é excluída.
 */
export function trechosDoAcumulado(textos: readonly string[], tipos: readonly string[]): TrechoDoAcumulado[] {
    const trechos: TrechoDoAcumulado[] = []
    for (const texto of textos) {
        for (const crua of texto.split('\n')) {
            const linha = vocabularioDaObra(crua, tipos)
            const abertura = aberturaDita(linha)
            const ditos = tiposDitos(linha, tipos)
            // a medida da linha como o vendedor a escreveu (o acréscimo do vocabulário não traz número)
            const medidas = medidasDaLinha(crua)
            if (abertura !== null || ditos.size > 0 || medidas.length > 0) trechos.push({ abertura, tipos: ditos, texto: linha, medidas })
        }
    }
    return trechos
}

export type ListaFiltrada<C> = {
    candidatos: C[]
    /** Quantos trechos do acumulado filtraram. 0 = a lista foi inteira. */
    trechos: number
    /** Quantos trechos ficaram sem tipologia nenhuma e trouxeram a lista inteira (a rede de segurança). */
    semCandidata: number
    /** O que o acumulado já diz (05/11/2026): alguma abertura (janela/porta) e algum tipo do motor — a pergunta da tipologia não repete isso. */
    jaDito: { abertura: boolean; tipo: boolean }
    /** Os trechos, para quem decide a tipologia padrão por esquadria. */
    lidos: TrechoDoAcumulado[]
}

/** A tipologia serve ao trecho: compatível com a abertura dita, e do tipo dito (a sem tipo no arquivo passa). */
export const serveAoTrecho = <C extends { descricao: string | null; tipo: string | null }>(c: C, t: TrechoDoAcumulado): boolean =>
    aberturaCompativel(c.descricao, t.abertura) && (t.tipos.size === 0 || c.tipo === null || t.tipos.has(c.tipo))

/** A lista do prompt pelo acumulado: a união do que serve a cada trecho; o trecho sem candidata traz a lista inteira; sem trecho, inteira. */
export function filtrarPeloAcumulado<C extends { descricao: string | null; tipo: string | null }>(candidatos: readonly C[], textos: readonly string[]): ListaFiltrada<C> {
    const tipos = [...new Set(candidatos.map((c) => c.tipo).filter((t): t is string => typeof t === 'string' && t.trim() !== ''))]
    const trechos = trechosDoAcumulado(textos, tipos)
    const jaDito = { abertura: trechos.some((t) => t.abertura !== null), tipo: trechos.some((t) => t.tipos.size > 0) }
    // a linha de item que não afirma nada não é filtro: ela só traz a lista inteira (abaixo, pela candidata que serve a tudo)
    if (trechos.length === 0) return { candidatos: [...candidatos], trechos: 0, semCandidata: 0, jaDito, lidos: trechos }
    const ficam = new Set<C>()
    let semCandidata = 0
    for (const t of trechos) {
        const servem = candidatos.filter((c) => serveAoTrecho(c, t))
        if (servem.length === 0) { semCandidata += 1; for (const c of candidatos) ficam.add(c); continue }
        for (const c of servem) ficam.add(c)
    }
    return { candidatos: candidatos.filter((c) => ficam.has(c)), trechos: trechos.length, semCandidata, jaDito, lidos: trechos }
}
