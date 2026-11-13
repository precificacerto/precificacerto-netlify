/**
 * A TIPOLOGIA PADRÃO NO CÓDIGO, NÃO NO MODELO — ATRIBUTO POR ATRIBUTO (dono do produto, 11/11/2026, fechando a classe do apanhado):
 *
 * > "O vendedor nunca vai vir explicar que é 2 caixilhos ou 2 folhas. Quando a gente traz a descrição do que é, subentende-se 1 módulo ou 2
 * > folhas [...]. Ao contrário, quando tem uma variável a mais, como bandeira, como peitoril, como mais módulos ou divisões, será informado.
 * > Então, ao natural, permanece o padrão."  SILÊNCIO NÃO É DÚVIDA: É A FORMA NATURAL.
 *
 * O DEFEITO QUE ISTO CORRIGE: até aqui o padrão era TUDO OU NADA — bastava o vendedor dizer "persiana" (ou qualquer palavra fora do padrão) e
 * folhas, módulos e o resto perdiam o natural e voltavam a ser pergunta. Agora CADA ATRIBUTO tem o seu natural e só o perde quando ELE é dito:
 * dizer persiana responde PERSIANA, e só ela.
 *
 * A REGRA, por esquadria sem tipologia depois da proposta do modelo:
 *   - a ABERTURA (porta/janela) é a palavra do vendedor para a esquadria; sem ela não há padrão (é outro produto);
 *   - o TIPO é SEMPRE dito (dono do produto: "o tipo não se adivinha"): o tipo do motor que o trecho diz (`tiposDitos`). A porta sem tipo é
 *     de correr (o padrão da porta, 05/11/2026); a janela sem tipo não tem padrão. Dois tipos ditos, ou um tipo que o motor não tem
 *     (basculante, guilhotina, camarão…), também não;
 *   - os ATRIBUTOS de cada candidata saem da DESCRIÇÃO do motor (`atributosDaDescricao`); os ditos, do trecho (`atributosDitos`), pelas
 *     mesmas palavras. A candidata vale quando, atributo por atributo, bate com o dito — e, no que não foi dito, com o NATURAL:
 *       · os EXTRAS (persiana, bandeira, peitoril, veneziana, trilho embutido ou de alumínio, tela, fechamento central, lambri, pinázio…):
 *         o natural é NÃO TER — sem bandeira, sem peitoril, sem persiana, salvo se dito. A candidata tem exatamente os extras ditos;
 *       · a QUANTIDADE, numa REGRA GERAL (dono do produto, 11/11/2026: "Porta, janela de correr, padrão é 2 [...]. Quando for maxim-ar,
 *         porta de giro, oscilo-batente, janela fixa, é tudo um módulo padrão. Quando tiver 2 módulos, aí vai ser dito"):
 *           CORRER (janela ou porta) = 2 folhas / 2 caixilhos; TODO O RESTO = 1 (uma folha, um módulo); mais de um só quando dito
 *         (`naturalDaQuantidade`). Escrita por tipo NENHUM além do correr, para o tipo novo do motor não pedir regra nova;
 *       · os MÓDULOS ditos fora do correr, em número diferente de 1: não há padrão (`MODULOS_DITOS`; o modelo decide);
 *   - o que o vendedor DIZ e não tem como entrar na tipologia (o motor da persiana, o número de panos — são variáveis do motor que a conversa
 *     não captura) tira o padrão daquela esquadria (`DITO_SEM_REPRESENTACAO`): nunca dito em silêncio. EXCEÇÃO (13/11/2026): o dito que
 *     CONFERE com a natureza fixa da tipologia escolhida ("1 pano" na persiana sem QP) é absorvido e escrito; o que a CONTRADIZ é pergunta
 *     (`docs/regras/dito-que-confere-com-a-tipologia.md`);
 *   - sobrando UMA, ela vale, se a medida dita couber nos limites dela (`cabeNosLimites`; fora deles, nunca "a mais próxima");
 *   - sobrando duas ou mais que só diferem pela LINHA DE PRODUTO, o motivo é `LINHA` — a linha padrão é da base de conhecimento da empresa, e
 *     até ser cadastrada é falta nomeada (dono do produto, 11/11/2026). Medido no motor 022fc55e (11/11/2026): só a maxim-ar tem candidata em
 *     duas linhas (DP-01 DESIGN e DP-128 EUROPA 60), e a DP-128 traz "PERFIL MODULAÇÃO" — um extra a mais —, então a DP-01 sai sozinha.
 *
 * A família e o motor seguem o caminho de sempre (`resolverFamilias`); a validação da tipologia proposta pelo modelo não muda.
 */
import type { CandidatoDeTipologia } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { aberturaDaDescricao, cabeNosLimites, linhaDaEsquadria, type Abertura, type TrechoDoAcumulado } from '@/lib/atendimentos-ia/tipologias-candidatas'

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ── OS ATRIBUTOS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * OS EXTRAS: o que a esquadria tem A MAIS. O natural de todos é NÃO TER. Cada um é reconhecido pela mesma palavra na descrição do motor e no
 * que o vendedor disse (sem acento, sem caixa). A lista é o vocabulário das 164 descrições do motor 022fc55e (medido em 11/11/2026).
 */
export const EXTRAS = {
    persiana: /\bpersianas?\b/,
    bandeira: /\bbandeiras?\b/,
    peitoril: /\bpeitor(il|is)\b/,
    veneziana: /\b(venezianas?|vz)\b/,
    'trilho embutido': /\bembutid[oa]s?\b/,
    'trilho de alumínio': /\btrilhos?\s+(de\s+)?alumini\w*/,
    'fechamento central': /\bfech\w*\s+central\b/,
    tela: /\btelas?\b/,
    lambri: /\blambris?\b/,
    pinázio: /\bpinazios?\b/,
    'veneziana japonesa': /\bjaponesa\b/,
    'veneziana ventilada': /\bvent(ilad[oa]s?)?\b/,
    'veneziana cega': /\bcegas?\b/,
    'meio a meio (inferior e superior)': /\binferior\b.*\bsuperior\b/,
    'modulação de travessa': /\btravessas?\b/,
    'perfil de modulação': /\bperfil\s+(de\s+)?modula\w*/,
    coluna: /\bcolunas?\b/,
    'alturas iguais': /\balt\w*\s+iguais\b/,
    'oscilo-batente e giro': /\boscilo\w*\s*(batente)?\s*(\+|e)\s*giro\b/,
} as const
export type Extra = keyof typeof EXTRAS

/**
 * O que o vendedor pode DIZER e não tem como entrar na tipologia: são variáveis do motor que a conversa não captura (o acionamento da persiana
 * — AE, com motor —, a quantidade de panos — QP). Dito, a esquadria não ganha padrão: nunca em silêncio.
 */
export const DITO_SEM_REPRESENTACAO = /\b(motor\w*|motoriza\w*|automatiza\w*|controle remoto|botoeira|panos?)\b/

/**
 * O DITO QUE CONFERE COM A NATUREZA DA TIPOLOGIA (dono do produto, 13/11/2026; `docs/regras/dito-que-confere-com-a-tipologia.md`):
 *
 * > "dito que o motor não representa, mas que CONFERE com a natureza fixa da tipologia, é absorvido e ESCRITO na linha CONSIDERADO — não em
 * > silêncio, e não vira pergunta. Dito que CONTRADIZ a natureza fixa (ex.: '3 panos' numa DP-07, que não tem QP) continua sendo pergunta.
 * > Dito que o motor não representa e sobre o qual a tipologia nada afirma segue na regra atual, DITO_SEM_REPRESENTACAO."
 *
 * Os PANOS: a variável `QP` ("QUANTIDADE DE PANOS DE PERSIANA") só existe nas tipologias cuja persiana varia, e só oferece 2 ou 3 (medido no
 * motor 022fc55e em 13/11/2026: 12 tipologias). A tipologia COM persiana e SEM `QP` tem a persiana de UM pano, por construção. Então:
 *   - "1 pano" nela CONFERE: absorvido, e o CONSIDERADO diz "com persiana (1 pano)";
 *   - outro número nela CONTRADIZ: pergunta (`CONTRADIZ_A_TIPOLOGIA`);
 *   - na tipologia com `QP` (a conversa não captura a variável), na sem persiana, ou sem as variáveis lidas: a regra de antes.
 * "pano" sem número não diz quantos: a regra de antes.
 */
export const VARIAVEL_DOS_PANOS = 'QP'
// o número não pode ser o fim de outro ("1,30 pano" não é "30 panos": a medida antes dele)
const PANOS_COM_NUMERO = /(?<![\d.,])\b(\d+|uma?|dois|duas|tres|quatro)\s+panos?\b/
const PANOS_COM_NUMERO_G = new RegExp(PANOS_COM_NUMERO.source, 'g')
/** Os panos ditos com número ("1 pano", "dois panos"), ou null. */
export function panosDitos(texto: string): number | null {
    const m = PANOS_COM_NUMERO.exec(semAcento(texto))
    return m ? numero(m[1]) : null
}
/** Os panos que a tipologia TEM por construção: 1 quando tem persiana e não tem `QP`; null quando ela não afirma (ou as variáveis não foram lidas). */
export function panosDaNatureza(c: Pick<CandidatoDeTipologia, 'descricao' | 'tipo' | 'linha'>, variaveis: readonly string[] | null): number | null {
    if (variaveis === null || variaveis.includes(VARIAVEL_DOS_PANOS)) return null
    return atributosDaDescricao(c).extras.has('persiana') ? 1 : null
}
/** Tipos que o vendedor pode dizer e que o motor não tem: sem eles no motor, a esquadria não ganha padrão (nunca "porta" vira correr). */
export const TIPO_FORA_DO_MOTOR = /\b(basculantes?|projetantes?|guilhotinas?|camar[ao]o|sanfona\w*|vai e vem)\b/
/**
 * QUALQUER palavra de tipo. Dita, e sem o tipo correspondente NO MOTOR DA EMPRESA (o motor não tem "de abrir", por exemplo), a esquadria não ganha
 * padrão — a porta só é de correr quando o vendedor não disse tipo nenhum, nunca quando disse um que o motor não tem.
 */
export const PALAVRA_DE_TIPO = /\b(correr|abrir|giro|pivotante\w*|oscilo\w*|batente|maxim\w*|fix[oa]s?)\b/

/** "bandeira fixa", "peitoril fixo", "bandeira e peitoril fixo": o fixo que qualifica a bandeira ou o peitoril, não o tipo da esquadria. */
const FIXO_DE_ATRIBUTO = /\b(bandeiras?|peitor(il|is))(\s+e\s+(bandeiras?|peitor(il|is)))?\s+fix[oa]s?\b/g

/** O único tipo cujo natural é DOIS: o correr (janela ou porta) = 2 folhas / 2 caixilhos (dono do produto, 05/11 e 11/11/2026). */
export const TIPO_DE_DUAS_FOLHAS = 'correr'
/**
 * O NATURAL DA QUANTIDADE, pela regra geral (dono do produto, 11/11/2026): correr = 2; TODO O RESTO = 1 — uma folha (giro, abrir,
 * oscilo-batente, pivotante) ou um módulo (maxim-ar, fixo). Mais de um só quando o vendedor disser.
 */
export const naturalDaQuantidade = (tipo: string): number => (tipo === TIPO_DE_DUAS_FOLHAS ? 2 : 1)

const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, oito: 8 }
const numero = (t: string): number | null => (/^\d+$/.test(t) ? Number(t) : NUMEROS[t] ?? null)

/** As folhas (ou caixilhos — "o vendedor fala em caixilho para folha") ditas no trecho: o número, ou null quando não há. */
export function folhasDitas(texto: string): number | null {
    const m = /\b(\d+|uma?|duas|dois|tres|quatro|cinco|seis|oito)\s+(folhas?|caixilhos?)\b/.exec(semAcento(texto))
    return m ? numero(m[1]) : null
}
/** Os módulos ditos no trecho ("2 módulos", "dois modulos"): o número, ou null quando não há. */
export function modulosDitos(texto: string): number | null {
    const m = /\b(\d+|uma?|duas|dois|tres|quatro|cinco|seis)\s+modulos?\b/.exec(semAcento(texto))
    return m ? numero(m[1]) : null
}

/** O tipo do motor na forma curta: "Giro / Abrir" → "abrir", "Oscilo-batente" → "oscilo-batente", "Maxim-ar" → "maxim-ar". */
export function tipoCurto(tipo: string | null): string | null {
    if (tipo === null || tipo.trim() === '') return null
    const t = semAcento(tipo)
    if (/correr/.test(t)) return 'correr'
    if (/oscilo/.test(t)) return 'oscilo-batente'
    if (/pivot/.test(t)) return 'pivotante'
    if (/giro|abrir/.test(t)) return 'abrir'
    if (/maxim/.test(t)) return 'maxim-ar'
    if (/fixo/.test(t)) return 'fixo'
    return t.trim()
}

export type AtributosDaTipologia = {
    abertura: Abertura | null
    tipo: string | null
    folhas: number | null
    /** Os módulos que a descrição FIXA (o vertical "01 MÓDULO VERTICAL"; "V" e "N" são variáveis): null quando não fixa nenhum. */
    modulos: number | 'variavel' | null
    extras: ReadonlySet<Extra>
}

const extrasDe = (texto: string): Set<Extra> => new Set((Object.keys(EXTRAS) as Extra[]).filter((e) => EXTRAS[e].test(texto)))

/** Os atributos de uma tipologia do motor, lidos da descrição (sem a linha de produto no fim) e do tipo da Detalhe. */
export function atributosDaDescricao(c: Pick<CandidatoDeTipologia, 'descricao' | 'tipo' | 'linha'>): AtributosDaTipologia {
    const partes = (c.descricao ?? '').split('|').map((p) => p.trim())
    // o último trecho é a linha ("EUROPA 42", "DESIGN"): não é atributo
    const corpo = semAcento((partes.length > 1 ? partes.slice(0, -1) : partes).join(' | '))
    const folhas = /\b(\d+)\s+folhas?\b/.exec(corpo)
    const vertical = /(?:^|\s)(\d+|"v")\s+modulos?\s+vertica(l|is)\b/.exec(corpo)
    return {
        abertura: aberturaDaDescricao(c.descricao),
        tipo: tipoCurto(c.tipo),
        folhas: folhas ? Number(folhas[1]) : null,
        modulos: vertical ? (vertical[1] === '"v"' ? 'variavel' : Number(vertical[1])) : null,
        extras: extrasDe(corpo),
    }
}

export type AtributosDitos = {
    folhas: number | null; modulos: number | null; extras: ReadonlySet<Extra>; semRepresentacao: boolean; tipoForaDoMotor: boolean
    /** Os panos ditos COM número: não contam em `semRepresentacao` — a tipologia escolhida decide se conferem (13/11/2026). */
    panos: number | null
}
/** O que o vendedor DISSE da esquadria, pelas mesmas palavras das descrições. */
export function atributosDitos(texto: string): AtributosDitos {
    const t = semAcento(texto)
    return {
        folhas: folhasDitas(t), modulos: modulosDitos(t), extras: extrasDe(t), tipoForaDoMotor: TIPO_FORA_DO_MOTOR.test(t),
        semRepresentacao: DITO_SEM_REPRESENTACAO.test(t.replace(PANOS_COM_NUMERO_G, ' ')), panos: panosDitos(t),
    }
}

const mesmosExtras = (a: ReadonlySet<Extra>, b: ReadonlySet<Extra>) => a.size === b.size && [...a].every((e) => b.has(e))

// ── A DECISÃO ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type MotivoSemPadrao = 'SEM_ABERTURA' | 'SEM_TRECHO' | 'JANELA_SEM_TIPO' | 'TIPOS_DITOS' | 'TIPO_FORA_DO_MOTOR' | 'DITO_SEM_REPRESENTACAO'
    | 'MODULOS_DITOS' | 'SEM_CANDIDATA' | 'LIMITES'
export type DecisaoDoPadrao =
    | { tipologia: string }
    | { motivo: MotivoSemPadrao }
    /** Duas ou mais candidatas que só diferem pela linha de produto: a linha padrão é da base de conhecimento (falta nomeada). */
    | { motivo: 'LINHA'; candidatas: string[]; linhas: string[] }
    /** Duas ou mais candidatas, na mesma linha, que diferem num atributo SEM natural: falta nomeada, com as descrições — nunca "a primeira". */
    | { motivo: 'SEM_NATURAL'; atributos: string[]; candidatas: string[]; descricoes: string[] }
    /** Com um extra dito (a bandeira), a divisão é atributo DAQUELE extra: as candidatas só diferem pela modulação, e ela se pergunta. */
    | { motivo: 'MODULACAO'; candidatas: string[]; opcoes: string[]; esquadria: string; extras: string[] }
    /** LACUNA DO MOTOR: com o que foi dito, o motor só tem a esquadria COM extras a mais (a porta de giro de 1 folha só existe com veneziana…). */
    | { motivo: 'LACUNA'; esquadria: string; extrasDitos: string[]; existentes: string[] }
    /** O dito CONTRADIZ a natureza fixa da tipologia ("3 panos" na que tem a persiana de 1 pano por construção): pergunta (13/11/2026). */
    | { motivo: 'CONTRADIZ_A_TIPOLOGIA'; tipologia: string; descricao: string; dito: string; natureza: string }

/**
 * A MODULAÇÃO (dono do produto, 11/11/2026, leitura do PO): o rótulo de como os módulos se dividem — travessa ou perfil de modulação. Com UM
 * módulo e sem extra, ela não decide nada: sendo a única candidata, é a escolha, qualquer que seja o rótulo. Com um extra dito (bandeira,
 * peitoril), há divisão de verdade, e ela vira atributo daquele extra.
 */
export const MODULACOES: readonly Extra[] = ['modulação de travessa', 'perfil de modulação']
const ehModulacao = (e: Extra) => MODULACOES.includes(e)
const semModulacao = (s: ReadonlySet<Extra>): Set<Extra> => new Set([...s].filter((e) => !ehModulacao(e)))
const ROTULO_DA_MODULACAO: Readonly<Record<string, string>> = { 'modulação de travessa': 'travessa', 'perfil de modulação': 'perfil de modulação' }
const TIPO_NA_FRASE: Readonly<Record<string, string>> = { correr: 'de correr', abrir: 'de giro', 'oscilo-batente': 'oscilo-batente', pivotante: 'pivotante', 'maxim-ar': 'maxim-ar', fixo: 'fixa' }

/**
 * O RASTRO DOS ATRIBUTOS (dono do produto, 12/11/2026): "cada atributo que entrou por PADRÃO vai nomeado no rastro, com o valor e a origem
 * (dito na conversa, padrão da tipologia, ou base de conhecimento). [...] Dedução a partir da mensagem não serve como resposta." A folha mostra o
 * CONSIDERADO ao vendedor; o rastro mostra a nós o mesmo, com a origem de cada atributo.
 *   - `dito`: o vendedor disse (o trecho da esquadria);
 *   - `padrao_da_tipologia`: o natural da regra do padrão (o correr da porta sem tipo, a quantidade natural, o extra que a esquadria não tem);
 *   - `base_de_conhecimento`: a cor predominante, o vidro da instrução da categoria VIDRO;
 *   - `padrao_do_apanhado`: a quantidade de unidades não dita (= 1, regra de 03/11/2026) — um padrão da COLETA, não de uma tipologia (dono do
 *     produto, 12/11/2026: "a quantidade 1 é justamente o que ele NÃO falou");
 *   - `escolha_do_modelo`: a tipologia que o MODELO escolheu sem o vendedor dizer o código e sem o padrão do código. Não há regra por trás, e
 *     é por isso que vai nomeada (dono do produto, 12/11/2026: "ausência de origem é informação [...] é a única que não tem regra para auditar").
 */
export type OrigemDoAtributo = 'dito' | 'padrao_da_tipologia' | 'base_de_conhecimento' | 'padrao_do_apanhado' | 'escolha_do_modelo'

/**
 * A ORIGEM DA TIPOLOGIA QUE O MODELO PROPÔS: `dito` só quando o código está na mensagem como está (sem caixa, mas nunca normalizado — "DP-2"
 * não é "DP-02": `codigo-do-motor-nao-se-normaliza.md`); fora disso, `escolha_do_modelo`.
 */
export function origemDaTipologiaProposta(codigo: string, mensagem: string): OrigemDoAtributo {
    const escapado = codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^0-9a-z-])${escapado}($|[^0-9a-z])`, 'i').test(mensagem) ? 'dito' : 'escolha_do_modelo'
}
export type AtributoAssumido = { atributo: string; valor: string; origem: OrigemDoAtributo }
/** Os extras que o CONSIDERADO da folha sempre diz (com ou sem), e que o rastro diz do mesmo jeito. */
export const EXTRAS_DO_CONSIDERADO = ['persiana', 'bandeira', 'peitoril'] as const

/**
 * As variáveis (os nomes da aba Variáveis) da tipologia candidata, ou null quando não foram lidas — aí nada que dependa delas é absorvido.
 * Sem o argumento, ninguém as leu: a regra de antes.
 */
export type VariaveisDaCandidata = (c: CandidatoDeTipologia) => readonly string[] | null

/** A tipologia padrão da esquadria, ou o motivo de não haver. */
export function tipologiaPadrao(item: ItemDoLevantamento, abertura: Abertura | null, trechos: readonly TrechoDoAcumulado[], candidatos: readonly CandidatoDeTipologia[],
    variaveis?: VariaveisDaCandidata): DecisaoDoPadrao {
    return padraoDaEsquadria(item, abertura, trechos, candidatos, variaveis).decisao
}

/** A decisão do padrão e, quando ela dá uma tipologia, os atributos dela com a origem de cada um (a mesma decisão, nunca refeita à parte). */
export function padraoDaEsquadria(item: ItemDoLevantamento, abertura: Abertura | null, trechos: readonly TrechoDoAcumulado[], candidatos: readonly CandidatoDeTipologia[],
    variaveis?: VariaveisDaCandidata): { decisao: DecisaoDoPadrao; atributos: AtributoAssumido[] } {
    let atributos: AtributoAssumido[] = []
    const decisao = decisaoDoPadrao(item, abertura, trechos, candidatos, variaveis ?? (() => null), (a) => { atributos = a })
    // o registro só acontece quando a decisão é uma tipologia (`comRastro`): um motivo nunca leva atributos
    return { decisao, atributos }
}

function decisaoDoPadrao(item: ItemDoLevantamento, abertura_: Abertura | null, trechos: readonly TrechoDoAcumulado[], candidatos: readonly CandidatoDeTipologia[],
    variaveisDe: VariaveisDaCandidata, registrar: (a: AtributoAssumido[]) => void): DecisaoDoPadrao {
    // A LINHA DA ESQUADRIA (13/11/2026): a linha cuja medida é a largura e a altura desta esquadria é dela, e só ela fala por ela — as outras
    // linhas da mensagem (a janela maxim-ar, a de correr) não lhe emprestam tipo. Sem linha ligada pela medida, o de antes: os trechos da abertura.
    const doItem = trechos.filter((t) => linhaDaEsquadria(t, item))
    // a abertura: a do item; sem ela, a que a linha da esquadria afirma (uma só) — "persiana" afirma janela pelo vocabulário da obra
    const daLinha = new Set(doItem.map((t) => t.abertura).filter((a): a is Abertura => a !== null))
    const abertura = abertura_ ?? (daLinha.size === 1 ? [...daLinha][0] : null)
    if (abertura === null) return { motivo: 'SEM_ABERTURA' }
    const dela = (doItem.length > 0 ? doItem : trechos).filter((t) => t.abertura === abertura)
    if (dela.length === 0) return { motivo: 'SEM_TRECHO' }
    const texto = dela.map((t) => t.texto).join(' ')
    const ditos = atributosDitos(texto)
    if (ditos.tipoForaDoMotor) return { motivo: 'TIPO_FORA_DO_MOTOR' }
    const tiposDoMotor = new Set(dela.flatMap((t) => [...t.tipos]))
    // "bandeira FIXA", "peitoril FIXO" são atributo, não o tipo Fixo: o Fixo só conta se a palavra aparece fora dessas expressões
    if ([...tiposDoMotor].some((t) => tipoCurto(t) === 'fixo') && !/\bfix[oa]s?\b/.test(semAcento(texto).replace(FIXO_DE_ATRIBUTO, ' '))) {
        for (const t of [...tiposDoMotor]) if (tipoCurto(t) === 'fixo') tiposDoMotor.delete(t)
    }
    // o tipo é SEMPRE dito; a porta sem tipo é de correr (o padrão da porta); a janela sem tipo não tem padrão
    let tipo: string | null
    let tipoDito = true
    if (tiposDoMotor.size > 1) return { motivo: 'TIPOS_DITOS' }
    if (tiposDoMotor.size === 1) tipo = tipoCurto([...tiposDoMotor][0])
    else if (PALAVRA_DE_TIPO.test(semAcento(texto).replace(FIXO_DE_ATRIBUTO, ' '))) return { motivo: 'TIPO_FORA_DO_MOTOR' }
    else if (abertura === 'porta') { tipo = 'correr'; tipoDito = false }
    else return { motivo: 'JANELA_SEM_TIPO' }
    if (ditos.semRepresentacao) return { motivo: 'DITO_SEM_REPRESENTACAO' }
    if (tipo === null) return { motivo: 'JANELA_SEM_TIPO' }
    // fora do correr, o natural é UM; outro número de módulos dito não tem padrão (o modelo decide)
    const comModulos = tipo !== TIPO_DE_DUAS_FOLHAS
    if (comModulos && ditos.modulos !== null && ditos.modulos !== naturalDaQuantidade(tipo)) return { motivo: 'MODULOS_DITOS' }

    const folhasPedidas = ditos.folhas ?? naturalDaQuantidade(tipo)
    const comAtributos = candidatos.map((c) => ({ c, a: atributosDaDescricao(c) }))
    // o tipo, a abertura e a QUANTIDADE (folhas ou módulos) — os extras vêm depois, em três passos
    const doTipo = comAtributos.filter(({ a }) =>
        a.tipo === tipo
        // porta nunca vira janela, janela nunca vira porta; a maxim-ar e o fixo (sem abertura na descrição) são o natural só da JANELA
        // (05/11/2026: "a janela cujo trecho diz só o tipo maxim-ar")
        && (a.abertura === abertura || (a.abertura === null && abertura === 'janela'))
        // as folhas: as ditas, ou o natural (correr 2, o resto 1). A candidata que não descreve folhas (maxim-ar, fixo) só aceita "1 folha"
        // dita — outro número dito nela nunca é ignorado em silêncio
        && (a.folhas === folhasPedidas || (a.folhas === null && (ditos.folhas === null || ditos.folhas === 1)))
        // os módulos: o natural é um (o vertical fixo "01", ou nenhum fixado); o número variável na descrição ("V") não é o natural
        && (!comModulos || a.modulos === null || a.modulos === naturalDaQuantidade(tipo)))
    const esquadria = `${abertura} ${TIPO_NA_FRASE[tipo] ?? tipo} de ${quantidadeNaFrase(doTipo.length ? doTipo[0].a : null, folhasPedidas)}`
    // os atributos da escolhida, com a origem de cada um: o que o trecho disse, ou o natural da regra
    const tipoEscolhido = tipo
    const comRastro = (d: DecisaoDoPadrao): DecisaoDoPadrao => {
        if (!('tipologia' in d)) return d
        const escolhida = doTipo.find(({ c }) => c.tipologia === d.tipologia)
        if (escolhida === undefined) return d
        const a = escolhida.a
        // OS PANOS DITOS (13/11/2026): conferem com a natureza da escolhida (absorvidos e escritos), contradizem (pergunta), ou ela nada afirma
        const panosDela = ditos.panos === null ? null : panosDaNatureza(escolhida.c, variaveisDe(escolhida.c))
        if (ditos.panos !== null && panosDela === null) return { motivo: 'DITO_SEM_REPRESENTACAO' }
        if (ditos.panos !== null && panosDela !== null && ditos.panos !== panosDela) {
            return { motivo: 'CONTRADIZ_A_TIPOLOGIA', tipologia: escolhida.c.tipologia, descricao: descricaoSemLinha(escolhida.c), dito: emPanos(ditos.panos), natureza: emPanos(panosDela) }
        }
        const origem = (dito: boolean): OrigemDoAtributo => (dito ? 'dito' : 'padrao_da_tipologia')
        const lista: AtributoAssumido[] = [
            { atributo: 'abertura', valor: abertura, origem: 'dito' },
            { atributo: 'tipo', valor: tipoEscolhido, origem: origem(tipoDito) },
        ]
        if (a.folhas !== null) lista.push({ atributo: 'folhas', valor: String(a.folhas), origem: origem(ditos.folhas !== null) })
        else if (a.modulos !== 'variavel') lista.push({ atributo: 'modulos', valor: String(a.modulos ?? naturalDaQuantidade(tipoEscolhido)), origem: origem(ditos.modulos !== null) })
        for (const e of EXTRAS_DO_CONSIDERADO) lista.push({ atributo: e, valor: a.extras.has(e) ? 'com' : 'sem', origem: origem(ditos.extras.has(e)) })
        for (const e of a.extras) if (!(EXTRAS_DO_CONSIDERADO as readonly string[]).includes(e)) lista.push({ atributo: e, valor: 'com', origem: origem(ditos.extras.has(e)) })
        if (ditos.panos !== null && panosDela !== null) lista.push({ atributo: 'panos', valor: String(panosDela), origem: 'dito' })
        registrar(lista)
        return d
    }

    // 1) EXATAMENTE os extras ditos — o natural de todos é não ter, e a modulação conta (a maxim-ar lisa é a DP-01, sem rótulo nenhum)
    const exatas = doTipo.filter(({ a }) => mesmosExtras(a.extras, ditos.extras))
    if (exatas.length > 0) return comRastro(decidir(exatas, item))

    // 2) a MODULAÇÃO como rótulo: as que têm os extras ditos e só diferem pelo rótulo da divisão
    const modulacaoDita = [...ditos.extras].filter(ehModulacao)
    const porModulacao = doTipo.filter(({ a }) => mesmosExtras(semModulacao(a.extras), semModulacao(ditos.extras)) && modulacaoDita.every((e) => a.extras.has(e)))
    // a) uma só: ela é a escolha, qualquer que seja o rótulo (o fixo de 1 módulo: só a DP-143)
    if (porModulacao.length === 1) return comRastro(decidir(porModulacao, item))
    if (porModulacao.length > 1) {
        const outrosExtras = [...semModulacao(ditos.extras)]
        const rotulos = porModulacao.map(({ a }) => [...a.extras].filter(ehModulacao).map((e) => ROTULO_DA_MODULACAO[e] ?? e).join(' e '))
        // b) com extra dito e uma modulação diferente em cada: a divisão é atributo do extra, e se pergunta
        if (outrosExtras.length > 0 && new Set(rotulos).size === porModulacao.length && rotulos.every((r) => r !== '')) {
            return { motivo: 'MODULACAO', candidatas: porModulacao.map(({ c }) => c.tipologia), opcoes: rotulos, esquadria, extras: outrosExtras }
        }
        // c) sem extra dito (ou nada que as distinga): falta nomeada
        return { motivo: 'SEM_NATURAL', atributos: ['modulação'], candidatas: porModulacao.map(({ c }) => c.tipologia), descricoes: porModulacao.map(({ c }) => descricaoSemLinha(c)) }
    }

    // 3) LACUNA DO MOTOR: a esquadria só existe com extras A MAIS do que foi dito — nomeia a falta e as que existem; nunca outra quantidade
    const comMais = doTipo.filter(({ a }) => [...ditos.extras].every((e) => a.extras.has(e)))
    if (comMais.length > 0) {
        const existentes = [...new Set(comMais.map(({ a }) => [...a.extras].filter((e) => !ditos.extras.has(e)).join(' e ')))]
        return { motivo: 'LACUNA', esquadria, extrasDitos: [...ditos.extras], existentes }
    }
    return { motivo: 'SEM_CANDIDATA' }
}

/** A descrição do motor sem a linha de produto do fim, para mostrar ao vendedor (nunca o código). */
const descricaoSemLinha = (c: Pick<CandidatoDeTipologia, 'descricao'>) => {
    const partes = (c.descricao ?? '').split('|').map((p) => p.trim())
    return (partes.length > 1 ? partes.slice(0, -1) : partes).join(' | ')
}
const emPanos = (n: number) => `${n} ${n === 1 ? 'pano' : 'panos'}`
const quantidadeNaFrase = (a: AtributosDaTipologia | null, folhas: number) =>
    a !== null && a.folhas === null ? `${folhas} ${folhas === 1 ? 'módulo' : 'módulos'}` : `${folhas} ${folhas === 1 ? 'folha' : 'folhas'}`

/** Entre as que sobraram: uma só vale (se a medida couber); mais de uma é LINHA (falta nomeada) ou SEM_NATURAL — nunca "a primeira". */
function decidir(restantes: ReadonlyArray<{ c: CandidatoDeTipologia; a: AtributosDaTipologia }>, item: ItemDoLevantamento): DecisaoDoPadrao {
    if (restantes.length > 1) {
        // o que ainda as distingue: atributo sem natural, ou só a linha de produto
        const diferem: string[] = []
        if (new Set(restantes.map(({ a }) => a.folhas)).size > 1) diferem.push('folhas')
        if (new Set(restantes.map(({ a }) => String(a.modulos))).size > 1) diferem.push('módulos')
        const linhas = new Set(restantes.map(({ c }) => c.linha ?? '(sem linha)'))
        // nada que se meça as distingue e estão na MESMA linha: o que as separa está na descrição e não tem natural — nunca "a primeira"
        if (diferem.length === 0 && linhas.size < 2) diferem.push('descrição')
        const codigos = restantes.map(({ c }) => c.tipologia)
        if (diferem.length) return { motivo: 'SEM_NATURAL', atributos: diferem, candidatas: codigos, descricoes: restantes.map(({ c }) => descricaoSemLinha(c)) }
        return { motivo: 'LINHA', candidatas: codigos, linhas: [...new Set(restantes.map(({ c }) => c.linha ?? '(sem linha)'))] }
    }
    const [unica] = restantes
    if (!cabeNosLimites(unica.c, item)) return { motivo: 'LIMITES' }
    return { tipologia: unica.c.tipologia }
}

// ── O PADRÃO NA FOLHA (dono do produto, 11/11/2026: "aplicar o padrão é certo; aplicar em silêncio não é") ─────────────────────────────
/**
 * O que a esquadria É, escrito ao lado do item na folha do levantamento: o tipo e a quantidade (folhas, ou módulos), e os extras que decidem
 * o natural — "correr, 2 folhas · sem persiana · sem bandeira · sem peitoril"; "maxim-ar, 1 módulo · …"; "correr, 2 folhas · com persiana · …".
 * Vale para a tipologia como foi escolhida (pelo vendedor, pelo modelo ou pelo padrão): o vendedor lê e corrige antes do "sim".
 * `modulosDitos` é o número de módulos horizontais (a variável "N" da descrição), o dito ou o padrão da aba Variáveis; null quando não há.
 */
export function oQueAEsquadriaE(c: Pick<CandidatoDeTipologia, 'descricao' | 'tipo' | 'linha'>, modulosHorizontais: number | null, panosDaPersiana: number | null = null): string | null {
    const a = atributosDaDescricao(c)
    if (a.tipo === null) return null
    const partes: string[] = []
    if (a.folhas !== null) partes.push(`${a.tipo}, ${a.folhas} ${a.folhas === 1 ? 'folha' : 'folhas'}`)
    else if (a.modulos !== 'variavel' && modulosHorizontais !== null) {
        const total = modulosHorizontais * (a.modulos ?? 1)
        partes.push(`${a.tipo}, ${total} ${total === 1 ? 'módulo' : 'módulos'}`)
    } else partes.push(a.tipo)
    for (const e of ['persiana', 'bandeira', 'peitoril'] as const) {
        // a persiana de pano fixo diz quantos (13/11/2026: o "1 pano" dito é absorvido e ESCRITO aqui, e vale para quem não o disse — é o que ela é)
        const panos = e === 'persiana' && a.extras.has(e) && panosDaPersiana !== null ? ` (${emPanos(panosDaPersiana)})` : ''
        partes.push(`${a.extras.has(e) ? 'com' : 'sem'} ${e}${panos}`)
    }
    return partes.join(' · ')
}

/**
 * O QUE O PADRÃO NÃO RESOLVE E SE DIZ (dono do produto, 11/11/2026: "nomeie a falta [...] em vez de cair em 'sem padrão' mudo"): a frase ao
 * vendedor, sem código, para a linha sem padrão, as descrições que nada distingue, a modulação da bandeira e a lacuna do motor. Os outros
 * motivos não têm frase: o modelo decide, como antes.
 */
export function fraseDoPadraoQueFalta(d: DecisaoDoPadrao): string | null {
    if (!('motivo' in d)) return null
    if (d.motivo === 'LINHA') return fraseDaLinhaSemPadrao(d.linhas)
    if (d.motivo === 'SEM_NATURAL') return `Esta esquadria pode ser ${d.descricoes.map((x) => `“${x}”`).join(' ou ')}, e nada do que foi dito separa uma da outra. Qual é?`
    if (d.motivo === 'MODULACAO') return `A ${d.esquadria} com ${d.extras.join(' e ')} existe com divisão por ${d.opcoes.join(' ou por ')}: qual é?`
    if (d.motivo === 'CONTRADIZ_A_TIPOLOGIA') {
        return `A “${d.descricao}” tem a persiana de ${d.natureza}, por construção, e foi dito ${d.dito}. Como é essa esquadria na obra?`
    }
    if (d.motivo === 'LACUNA') {
        const pedida = d.extrasDitos.length ? `só com ${d.extrasDitos.join(' e ')}` : 'lisa'
        return `Falta no motor — não há tipologia de ${d.esquadria} ${pedida}: as que existem são com ${d.existentes.join('; com ')}. `
            + 'Me diga qual é; se for mesmo assim, a tipologia precisa ser cadastrada no motor.'
    }
    return null
}

/**
 * A FALTA DA LINHA DE PRODUTO PADRÃO (dono do produto, 11/11/2026): a linha da casa é da base de conhecimento da empresa, o agente lê de lá e
 * não pergunta; ENQUANTO NÃO ESTIVER CADASTRADA, é falta nomeada — a esquadria não fecha, e a frase diz em quais linhas ela existe.
 */
export const fraseDaLinhaSemPadrao = (linhas: readonly string[]) =>
    `Falta de configuração — a linha de produto padrão da empresa: esta esquadria existe ${linhas.length > 1 ? `nas linhas ${linhas.slice(0, -1).join(', ')} e ${linhas[linhas.length - 1]}` : `na linha ${linhas[0] ?? ''}`}, `
    + 'e a base de conhecimento ainda não diz qual é a da casa. Cadastre a linha padrão na base de conhecimento.'

/**
 * OS ATRIBUTOS NO LOG (12/11/2026): `e<ordem>:<atributo>=<valor>/<origem>;…`, uma esquadria por vírgula, na ordem. O valor não leva espaço, vírgula,
 * ponto e vírgula, igual nem barra (viram `_`), para a linha continuar legível por máquina. Sem nenhum atributo, `-`.
 */
export function atributosNoLog(porEsquadria: ReadonlyMap<number, readonly AtributoAssumido[]>): string {
    const limpo = (v: string) => v.trim().replace(/[\s,;=/]+/g, '_')
    const partes = [...porEsquadria.entries()].filter(([, xs]) => xs.length > 0).sort(([a], [b]) => a - b)
        .map(([ordem, xs]) => `e${ordem}:${xs.map((x) => `${limpo(x.atributo)}=${limpo(x.valor)}/${x.origem}`).join(';')}`)
    return partes.length === 0 ? '-' : partes.join(',')
}
