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
const faixaNoPrompt = (nome: string, min: number | null, max: number | null): string => {
    if (min === null && max === null) return `${nome} sem limite no arquivo`
    if (min !== null && max !== null) return `${nome} ${mm(min)} a ${mm(max)}`
    return min !== null ? `${nome} mín ${mm(min)}` : `${nome} máx ${mm(max as number)}`
}
/** Os limites como vão ao modelo, na linha da tipologia: "largura sem limite no arquivo | altura 388 mm a 2.439 mm". */
export const limitesNoPrompt = (l: Limites): string =>
    `${faixaNoPrompt('largura', l.larg_min_mm, l.larg_max_mm)} | ${faixaNoPrompt('altura', l.alt_min_mm, l.alt_max_mm)}`

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
