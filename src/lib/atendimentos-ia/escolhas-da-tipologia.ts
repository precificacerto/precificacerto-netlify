/**
 * Atendimentos I.A. — as ESCOLHAS DA TIPOLOGIA que a conversa captura: quais perguntar ao vendedor,
 * em que ordem, como perguntar, e o que aceitar como resposta. Funções puras: não leem banco nem rede.
 *
 * AS REGRAS (dono do produto, 25/10/2026):
 *   - a IA recebe, da aba Variáveis da tipologia, as perguntas com as opções por extenso, e pergunta
 *     ao vendedor em português, UMA de cada vez, só as que faltam;
 *   - ela NUNCA escolhe sozinha quando a opção muda o preço. As capturadas são perguntadas sempre que
 *     se aplicam; o Padrão vale só para as que NÃO são capturadas — e, se o Padrão não fecha, o
 *     levantamento sai como recusa nomeada (`faltou-dado-recusa-nomeada.md`);
 *   - COMEÇA POR ARI, ARE E MAE (`ESCOLHAS_CAPTURADAS`): as três que impediam a DP-02 de fechar. O resto
 *     continua no Padrão. Medido na DP-02: ARI = 3 pede MAI, que NÃO é capturada — o Padrão dela
 *     ("MEDIDA DO VÃO", sem colchete) é recusado pelo avaliador, e a recusa diz isso.
 *
 * QUANDO PERGUNTAR é a coluna Condição da aba Variáveis, avaliada com as escolhas já feitas:
 *   - verdadeira, ou "sempre", ou vazia → pergunta;
 *   - falsa → não pergunta: a variável não é usada (MAE com ARE = 2, sem arremate externo);
 *   - NÃO DÁ PARA AVALIAR → PERGUNTA. É o caso de "(ARR=1)" em ARI e ARE: ARR não está em aba nenhuma
 *     da DP-02 (medido, `avaliador-de-formulas.ts`). Deixar de perguntar por não saber seria escolher
 *     sozinho — o Padrão entraria calado. E é o caso de MAE antes de o ARE ser respondido: ela fica
 *     pendente, e a Condição é avaliada de novo quando chegar a vez dela.
 *
 * O QUE SE ACEITA: a LLM propõe `{ variavel, opcao }`; vale se a variável é uma das capturadas, existe
 * na tipologia, e a opção é um dos números da aba. A escolha feita SOBRESCREVE a anterior (decisão 3 do
 * dono do produto, 25/10/2026: o vendedor pode trocar o arremate depois).
 *
 * ══ A MUDANÇA DE PRODUTO (dono do produto, 25/10/2026): o padrão é ASSUMIDO, não perguntado ══
 * A conversa não pergunta o arremate: assume o Padrão da aba Variáveis e confirma em português. Só
 * quando o vendedor pede outro, ela mostra as opções daquela variável POR EXTENSO, sem número. O pedido
 * fica marcado no item como `null` na chave da variável (`lerEscolhasDoItem`): é a única pendência de
 * escolha que existe. Os códigos (ARI, ARE, MAE) e os números das opções são vocabulário INTERNO — vão
 * ao prompt, nunca ao vendedor; `traduzirVocabulario` os tira das recusas.
 *
 * Portão: `src/utils/__tests__/escolhas-da-tipologia.test.ts`.
 */
import { avaliarTexto, opcoesDaVariavel, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'

/** Decisão do dono do produto, 25/10/2026: as três que impediam a DP-02 de fechar. A ordem é a da aba. */
export const ESCOLHAS_CAPTURADAS = ['ARI', 'ARE', 'MAE'] as const

export type Escolhas = Readonly<Record<string, number>>
export type OpcaoDaEscolha = { valor: number; rotulo: string }
export type EscolhaPendente = { variavel: string; descricao: string; opcoes: OpcaoDaEscolha[] }

const capturada = (v: string) => (ESCOLHAS_CAPTURADAS as readonly string[]).includes(v)

/** A Condição pede a pergunta? Verdadeira, "sempre", vazia ou impossível de avaliar → sim. */
function condicaoPede(condicao: string | null, escolhas: Escolhas): boolean {
    const c = (condicao ?? '').trim()
    if (c === '' || c === 'sempre') return true
    const r = avaliarTexto(c, escolhas)
    if ('recusa' in r) return true
    return r.valor === true
}

/** As escolhas capturadas que faltam e se aplicam, na ordem da aba Variáveis. */
export function escolhasPendentes(tipologia: Tipologia, escolhas: Escolhas): EscolhaPendente[] {
    const pendentes: EscolhaPendente[] = []
    for (const v of tipologia.variaveis) {
        if (!capturada(v.variavel) || escolhas[v.variavel] !== undefined) continue
        const opcoes = opcoesDaVariavel(v.opcoes)
        // sem opções legíveis não há o que perguntar: o avaliador recusa a variável pelo nome
        if (!opcoes || opcoes.length === 0) continue
        if (!condicaoPede(v.condicao, escolhas)) continue
        pendentes.push({ variavel: v.variavel, descricao: v.descricao ?? v.variavel, opcoes })
    }
    return pendentes
}

const minuscula = (t: string) => t.toLocaleLowerCase('pt-BR')

/** A pergunta FIXA da escolha, em português e por extenso: a descrição da aba e as opções, SEM número. */
export function perguntaDaEscolha(p: EscolhaPendente): string {
    return `Para ${minuscula(p.descricao)}, as opções são: ${p.opcoes.map((o) => o.rotulo).join('; ')}. Qual você quer?`
}

/** A variável capturada da tipologia, como escolha a mostrar ao vendedor; null se não existe ou não tem opções. */
export function escolhaPedida(tipologia: Tipologia, variavel: string): EscolhaPendente | null {
    if (!capturada(variavel)) return null
    const v = tipologia.variaveis.find((x) => x.variavel === variavel)
    const opcoes = v ? opcoesDaVariavel(v.opcoes) : null
    if (!v || !opcoes || opcoes.length === 0) return null
    return { variavel, descricao: v.descricao ?? variavel, opcoes }
}

/**
 * As escolhas que o vendedor pode pedir, para o PROMPT — com o código e o número das opções, que a LLM
 * precisa para responder na ferramenta. Vocabulário interno: nunca vai ao vendedor.
 */
export function escolhasParaOPrompt(tipologia: Tipologia): string[] {
    return ESCOLHAS_CAPTURADAS.map((v) => escolhaPedida(tipologia, v)).filter((p): p is EscolhaPendente => p !== null)
        .map((p) => `${p.variavel} = ${p.descricao}: ${p.opcoes.map((o) => `${o.valor} = ${o.rotulo}`).join('; ')}`)
}

export type ResultadoDaEscolha = { gravar: Record<string, number> | null; propostos: number; descartados: number }

/** Valida `{ variavel, opcao }` proposto pela LLM contra as opções da variável na tipologia. Sobrescreve. */
export function validarEscolha(tipologia: Tipologia, escolhas: Escolhas, proposta: unknown): ResultadoDaEscolha {
    if (proposta === null || proposta === undefined || typeof proposta !== 'object') return { gravar: null, propostos: 0, descartados: 0 }
    const { variavel, opcao } = proposta as { variavel?: unknown; opcao?: unknown }
    const pedida = typeof variavel === 'string' ? escolhaPedida(tipologia, variavel) : null
    const valida = pedida !== null && typeof opcao === 'number' && Number.isInteger(opcao) && pedida.opcoes.some((o) => o.valor === opcao)
    if (!valida) return { gravar: null, propostos: 1, descartados: 1 }
    return { gravar: { ...escolhas, [variavel as string]: opcao as number }, propostos: 1, descartados: 0 }
}

/** O jsonb gravado → as escolhas: só as capturadas, e só número inteiro. O resto não vira escolha. */
export function lerEscolhasGravadas(valor: unknown): Record<string, number> {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {}
    const lidas: Record<string, number> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        if (capturada(k) && typeof v === 'number' && Number.isInteger(v)) lidas[k] = v
    }
    return lidas
}

/**
 * O jsonb do item → as escolhas, PRESERVANDO o `null` de uma capturada: é a marca de que o vendedor
 * pediu para escolher aquela variável. Número inteiro é escolha; o resto não vira nada.
 */
export function lerEscolhasDoItem(valor: unknown): Record<string, number | null> {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {}
    const lidas: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        if (!capturada(k)) continue
        if (v === null) lidas[k] = null
        else if (typeof v === 'number' && Number.isInteger(v)) lidas[k] = v
    }
    return lidas
}

/** O Padrão numérico da variável na aba, ou null quando ele não é um número. */
function padraoDe(tipologia: Tipologia, variavel: string): number | null {
    const p = tipologia.variaveis.find((v) => v.variavel === variavel)?.padrao?.trim() ?? ''
    return /^\d+$/.test(p) ? Number(p) : null
}

/**
 * A linha do ARREMATE, em português, para a resposta: cada variável capturada que se aplica, com a opção
 * por extenso e se foi o padrão ou a escolha do vendedor. Sem código e sem número. A Condição é avaliada
 * com as escolhas efetivas (as do vendedor, e o Padrão nas outras); a que não dá para avaliar entra.
 * Null quando a tipologia não tem variável capturada.
 */
export function descreverArremate(tipologia: Tipologia, explicitas: Escolhas): string | null {
    const efetivas: Record<string, number> = {}
    for (const v of ESCOLHAS_CAPTURADAS) {
        const valor = explicitas[v] ?? padraoDe(tipologia, v)
        if (valor !== null && valor !== undefined) efetivas[v] = valor
    }
    const partes: string[] = []
    for (const v of tipologia.variaveis) {
        if (!capturada(v.variavel) || !condicaoPede(v.condicao, efetivas)) continue
        const valor = efetivas[v.variavel]
        const rotulo = valor === undefined ? null : opcoesDaVariavel(v.opcoes)?.find((o) => o.valor === valor)?.rotulo
        const origem = explicitas[v.variavel] !== undefined ? 'como você pediu' : 'padrão'
        partes.push(`${minuscula(v.descricao ?? v.variavel)}: ${rotulo ?? 'padrão da tipologia'} (${origem})`)
    }
    return partes.length ? partes.join('; ') : null
}

/** Alguma capturada foi escolhida pelo vendedor? (A frase de confirmação muda.) */
export const temEscolhaDoVendedor = (explicitas: Escolhas) => ESCOLHAS_CAPTURADAS.some((v) => explicitas[v] !== undefined)

/**
 * Tira o vocabulário interno de um texto que vai ao vendedor: `&MAE` e `MAE` viram a descrição da
 * variável, entre aspas ("MEDIDA ARREMATE EXTERNO"). Só códigos de variáveis DESTA tipologia.
 */
export function traduzirVocabulario(texto: string, tipologia: Tipologia): string {
    let saida = texto
    for (const v of tipologia.variaveis) {
        if (!/^[A-Z]{2,5}$/.test(v.variavel) || !v.descricao) continue
        saida = saida.replace(new RegExp(`&?\\b${v.variavel}\\b`, 'g'), `“${v.descricao}”`)
    }
    return saida
}
