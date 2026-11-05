/**
 * Atendimentos I.A. — a REDAÇÃO DA RESPOSTA pelo modelo (dono do produto, 03/11/2026): "As frases fixas viram frases do
 * modelo, mantendo o conteúdo obrigatório (o que falta, de qual esquadria). O código continua validando a resposta; só o
 * texto deixa de ser fixo."
 *
 * O CÓDIGO decide O QUE dizer — o RASCUNHO, a frase fixa de sempre, com o que falta, de qual esquadria, os nomes entre aspas e
 * os números. O MODELO decide COMO dizer: um segundo pedido, sem ferramenta, com a personalidade do prompt base e as últimas
 * mensagens da conversa. A redação só sai se passar na validação (`redacaoValida`); senão sai o rascunho, como antes:
 *   - não vazia e até LIMITE_DA_REDACAO caracteres;
 *   - TODO número do rascunho está nela (1.200 ou 1200 valem o mesmo), TODO nome entre “aspas”, TODO código em CAIXA ALTA
 *     (DP-02, BRANCO, PVC) e TODO nome de uma lista numerada ("1) Geronimo Silva — …");
 *   - sem DINHEIRO (a regra inviolável) e sem código de fornecedor (BZ0010);
 *   - diferente da última resposta enviada: "a mesma resposta nunca sai duas vezes seguidas".
 * O rascunho que traz dinheiro NÃO vai ao modelo (o levantamento formal e o apanhado não passam por aqui; é defesa).
 *
 * LIMITE CONHECIDO: a validação confere números, aspas, caixa alta e a lista numerada; as palavras do rascunho fora disso ("sem
 * arremate interno" numa lista de opções) ficam por conta do modelo, instruído a manter tudo. Nenhum número da resposta
 * nasce no modelo: todos vêm do rascunho, e o que não estiver nele cai na validação.
 */
import { MODELO_PADRAO_DA_IA, URL_DA_API_ANTHROPIC, VERSAO_DA_API_ANTHROPIC } from '@/lib/atendimentos-ia/modelo-da-ia'
import { prazo } from '@/lib/atendimentos-ia/prazo'
import { blocosDoSistema } from '@/lib/atendimentos-ia/pedido-ao-modelo'
import { temDinheiro } from '@/lib/atendimentos-ia/contexto-do-atendimento'
import { PROMPT_BASE } from '@/utils/atendimentos-ia-prompt-base'
import type { MensagemDoHistorico } from '@/lib/atendimentos-ia/conversa-gravada'

export const LIMITE_DA_REDACAO = 700
/** Um código de fornecedor no texto ("BZ0010", "IL50", "SF66"): o que chega ao vendedor não o traz. */
export const CODIGO_DE_FORNECEDOR = /\b[A-Z]{1,5}\d{2,}\b/

export const INSTRUCAO_DA_REDACAO = [
    'TAREFA: reescreva o RASCUNHO abaixo como você, a secretária orçamentista, diria ao vendedor pelo WhatsApp, em resposta à MENSAGEM DO VENDEDOR. O rascunho é o que o sistema decidiu dizer; você decide só a forma.',
    '- Mantenha TODO o conteúdo do rascunho: o que falta, de qual esquadria, os nomes entre aspas, os números, as datas e cada opção listada. Não acrescente informação, não faça pergunta nova, não responda por ele.',
    '- Frases curtas, linguagem de obra, sem emoji, sem introdução, sem "Anotado", "Perfeito", "Entendido". Nunca mande o vendedor responder numa forma ditada.',
    '- Nunca escreva valor, preço, percentual ou código de fornecedor.',
    '- Não repita a sua última resposta da conversa: diga de outro jeito.',
    '- Responda SÓ com o texto final, sem título, sem aspas em volta e sem comentário.',
].join('\n')

export type MotivoDaRedacao = 'usada' | 'ausente' | 'vazia' | 'longa' | 'sem_conteudo' | 'dinheiro' | 'codigo' | 'repetida' | 'erro' | 'rascunho_com_dinheiro' | 'prazo'
/** O PRAZO da redação (dono do produto, 04/11/2026): 15 s. "Estourou, cai para a frase de reserva e segue — redação é luxo, nunca pode derrubar o turno." */
export const PRAZO_DA_REDACAO_MS = 15_000
export type Redacao = { texto: string; motivo: 'usada' } | { texto: null; motivo: Exclude<MotivoDaRedacao, 'usada'> }

const semMilhar = (t: string) => t.replace(/(\d)\.(?=\d{3}\b)/g, '$1')
const numeros = (t: string) => semMilhar(t).match(/\d+/g) ?? []
const entreAspas = (t: string) => [...t.matchAll(/“([^”]+)”/g)].map((m) => m[1])
const emCaixaAlta = (t: string) => [...t.matchAll(/\b[A-Z][A-Z0-9-]*[A-Z0-9]\b/g)].map((m) => m[0]).filter((x) => !/^\d+$/.test(x))
const daLista = (t: string) => [...t.matchAll(/^\d+\) (.+?) — /gm)].map((m) => m[1])
const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** O conteúdo obrigatório do rascunho está no texto? Os números sem o ponto de milhar; o resto sem caixa e sem acento. */
export function mantemOConteudo(texto: string, rascunho: string): boolean {
    const t = semAcento(texto)
    const nums = numeros(texto)
    if (!numeros(rascunho).every((n) => nums.includes(n))) return false
    for (const x of [...entreAspas(rascunho), ...emCaixaAlta(rascunho), ...daLista(rascunho)]) if (!t.includes(semAcento(x))) return false
    return true
}

export function redacaoValida(v: unknown, rascunho: string, ultimaSaida: string | null): Redacao {
    if (typeof v !== 'string') return { texto: null, motivo: 'ausente' }
    const texto = v.trim()
    if (texto === '') return { texto: null, motivo: 'vazia' }
    if (Array.from(texto).length > LIMITE_DA_REDACAO) return { texto: null, motivo: 'longa' }
    if (temDinheiro(texto)) return { texto: null, motivo: 'dinheiro' }
    if (CODIGO_DE_FORNECEDOR.test(texto)) return { texto: null, motivo: 'codigo' }
    if (!mantemOConteudo(texto, rascunho)) return { texto: null, motivo: 'sem_conteudo' }
    if (ultimaSaida !== null && texto === ultimaSaida.trim()) return { texto: null, motivo: 'repetida' }
    return { texto, motivo: 'usada' }
}

export type ContextoDaRedacao = {
    /** O contexto da empresa (o tom dela), quando houver — já na moldura que o sistema usa. */
    blocoDaEmpresa: string | null
    historico: readonly MensagemDoHistorico[]
    /** A mensagem do vendedor desta vez: é a ela que a resposta responde. */
    mensagem: string
    ultimaSaida: string | null
}

/** O pedido ao modelo: a mensagem do vendedor e o rascunho, numa mensagem só, depois do histórico. */
export const pedidoDaRedacao = (mensagem: string, rascunho: string) => `MENSAGEM DO VENDEDOR:\n${mensagem}\n\nRASCUNHO:\n${rascunho}`

/** O sistema do pedido de redação: o prompt base (com a personalidade), a tarefa, e o contexto da empresa no fim. */
export function sistemaDaRedacao(blocoDaEmpresa: string | null): string {
    return [PROMPT_BASE, '', INSTRUCAO_DA_REDACAO, ...(blocoDaEmpresa ? ['', blocoDaEmpresa] : [])].join('\n')
}

/** Pede ao modelo a redação do rascunho e a valida. Nunca lança: toda falha é um motivo, e quem chama manda o rascunho. */
export async function redigir(chave: string, rascunho: string, c: ContextoDaRedacao): Promise<Redacao> {
    if (temDinheiro(rascunho)) return { texto: null, motivo: 'rascunho_com_dinheiro' }
    const limite = prazo(PRAZO_DA_REDACAO_MS)
    try {
        const r = await fetch(URL_DA_API_ANTHROPIC, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': VERSAO_DA_API_ANTHROPIC },
            signal: limite.signal,
            body: JSON.stringify({
                model: MODELO_PADRAO_DA_IA,
                max_tokens: 400,
                output_config: { effort: 'low' },
                // o sistema da redação é todo estável por conta: um bloco só, marcado para o cache (05/11/2026)
                system: blocosDoSistema(sistemaDaRedacao(c.blocoDaEmpresa)),
                messages: [...c.historico, { role: 'user', content: pedidoDaRedacao(c.mensagem, rascunho) }],
            }),
        })
        if (!r.ok) return { texto: null, motivo: 'erro' }
        const corpo = (await r.json().catch((): null => null)) as { content?: Array<{ type?: unknown; text?: unknown }> } | null
        const bloco = Array.isArray(corpo?.content) ? corpo.content.find((b) => b.type === 'text') : undefined
        return redacaoValida(bloco?.text, rascunho, c.ultimaSaida)
    } catch {
        // o prazo estourado é um motivo próprio no log; a falha de rede continua `erro`. Os dois mandam o rascunho
        return { texto: null, motivo: limite.estourou() ? 'prazo' : 'erro' }
    } finally {
        limite.limpar()
    }
}
