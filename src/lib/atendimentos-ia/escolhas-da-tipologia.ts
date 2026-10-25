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
 * O QUE SE ACEITA: a LLM propõe `{ variavel, opcao }`; vale só se a variável é uma das PENDENTES e a
 * opção é um dos números da aba. Uma escolha já feita não é sobrescrita (a correção de escolha fica
 * para outra rodada); a que não se aplica é descartada.
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

/** A pergunta FIXA da escolha: a descrição da aba e as opções por extenso. */
export function perguntaDaEscolha(p: EscolhaPendente): string {
    return `${p.descricao} — qual opção? ${p.opcoes.map((o) => `${o.valor} = ${o.rotulo}`).join('; ')}.`
}

export type ResultadoDaEscolha = { gravar: Record<string, number> | null; propostos: number; descartados: number }

/** Valida `{ variavel, opcao }` proposto pela LLM contra as pendentes da tipologia. */
export function validarEscolha(tipologia: Tipologia, escolhas: Escolhas, proposta: unknown): ResultadoDaEscolha {
    if (proposta === null || proposta === undefined || typeof proposta !== 'object') return { gravar: null, propostos: 0, descartados: 0 }
    const { variavel, opcao } = proposta as { variavel?: unknown; opcao?: unknown }
    const pendente = escolhasPendentes(tipologia, escolhas).find((p) => p.variavel === variavel)
    const valida = pendente !== undefined && typeof opcao === 'number' && Number.isInteger(opcao) && pendente.opcoes.some((o) => o.valor === opcao)
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

/** "ARI 4 — SEM ARREMATE INTERNO; …", na ordem da aba. Null quando não há escolha nenhuma. */
export function descreverEscolhas(tipologia: Tipologia, escolhas: Escolhas): string | null {
    const partes: string[] = []
    for (const v of tipologia.variaveis) {
        const valor = escolhas[v.variavel]
        if (valor === undefined) continue
        const rotulo = opcoesDaVariavel(v.opcoes)?.find((o) => o.valor === valor)?.rotulo
        partes.push(`${v.variavel} ${valor}${rotulo ? ` — ${rotulo}` : ''}`)
    }
    return partes.length ? partes.join('; ') : null
}
