/**
 * Atendimentos I.A. — o CONTEXTO DO ATENDIMENTO (o bloco "Prompt de atendimento" da conta). Este arquivo é o
 * que a tela e a rota leem juntas: o limite, a contagem e as frases. O que só o servidor faz — ler o contexto
 * para a conversa e filtrar a fala da IA — está em `src/lib/atendimentos-ia/contexto-do-atendimento.ts`.
 *
 * A LINHA QUE SEPARA AS CAMADAS (dono do produto, 26/10/2026): "O PROMPT MANDA EM QUANDO E EM QUE FORMA. O
 * CÓDIGO MANDA EM DE ONDE VEM O NÚMERO." O contexto pode mandar mostrar o valor mais cedo; não pode dizer
 * qual é o valor.
 *
 * O LIMITE é de 4.000 caracteres no banco (CHECK), na função, na rota e na tela — e é contado como o banco
 * conta: `char_length` conta pontos de código, e o `length` do JavaScript conta unidades UTF-16 (um emoji
 * vale dois). Por isso `contarCaracteres`, e não `.length`.
 *
 * VAZIO É O PADRÃO: sem contexto, a conversa é exatamente a de hoje. Nenhum texto padrão mora no código.
 */
export const LIMITE_DO_CONTEXTO = 4000
export const LIMITE_DA_FALA = 600

/** Caracteres como o Postgres os conta (`char_length`): pontos de código. */
export const contarCaracteres = (texto: string) => [...texto].length

const milhar = (n: number) => n.toLocaleString('pt-BR')
export const fraseDoLimiteDoContexto = (n: number) =>
    `O contexto tem ${milhar(n)} caracteres; o limite é ${milhar(LIMITE_DO_CONTEXTO)}. Encurte antes de salvar.`
export const AVISO_DO_CONTEXTO_VAZIO = 'Vazio é o padrão: sem contexto, a conversa segue exatamente como hoje.'
export const A_LINHA_DAS_CAMADAS =
    'O contexto manda em QUANDO e EM QUE FORMA a conversa acontece — etapas, ordem, confirmações, tom e jargão. Ele NÃO decide número: '
    + 'todo valor sai do cálculo, e faltando preço a resposta é a recusa nomeada.'

export const rotaDoContexto = (tenantId: string) => `/api/super-admin/base-de-conhecimento/contexto?tenant=${tenantId}`

/** O que a rota devolve no GET. `texto` null = nunca gravado: o padrão, sem texto inventado. */
export interface ContextoGravado { texto: string | null; atualizado_em: string | null; atualizado_por: string | null }

/** O corpo do PUT: `{ texto }`, sem os espaços das pontas, até o limite. Vazio vale — é a volta ao padrão. */
export function lerCorpoDoContexto(body: unknown): { ok: true; texto: string } | { ok: false; erro: string } {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
    if (!b || typeof b.texto !== 'string') return { ok: false, erro: 'O contexto é um texto.' }
    const texto = b.texto.trim()
    const n = contarCaracteres(texto)
    if (n > LIMITE_DO_CONTEXTO) return { ok: false, erro: fraseDoLimiteDoContexto(n) }
    return { ok: true, texto }
}
