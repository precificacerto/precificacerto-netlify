/**
 * A PERGUNTA EM ABERTO do vendedor, guardada entre uma mensagem e a próxima
 * (`orcamentista_pergunta_em_aberto`, migração 20261026000002).
 *
 * POR QUÊ — o laço medido em produção em 26/10/2026 (b0465e57): PARECIDO, SEM_NOME, SEM_NOME,
 * SEM_NOME. A LLM recebe SÓ a mensagem desta vez, e o código não guardava o que tinha perguntado:
 * "é o mesmo" e "João medeiros" não tinham a que se referir, e a esquadria da primeira mensagem se
 * perdia. O levantamento EM_MONTAGEM já guardava a pergunta dele (a pendência); o roteamento pelo
 * nome não guardava nenhuma.
 *
 * O QUE SE GUARDA (dono do produto, 26/10/2026): "nunca o texto da mensagem, só a pergunta feita, os
 * levantamentos citados e a proposta que espera resposta, apagada quando resolve." A pergunta é um
 * CÓDIGO, e o texto dela é refeito pelo código a cada leitura (`conversa-da-ia.ts`); a proposta são
 * só os campos da esquadria.
 *
 * SEM A MIGRAÇÃO: a tabela ausente (PGRST205/42P01) é `'ausente'` — nenhuma pergunta em aberto, e nada
 * se grava nela. A conversa se comporta como antes dela, e a linha [IA] diz `aberta=ausente`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { CAMPOS_DA_ESQUADRIA } from '@/lib/atendimentos-ia/levantamento-em-montagem'

export const TABELA_DA_PERGUNTA = 'orcamentista_pergunta_em_aberto'
export const PERGUNTAS = ['NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO'] as const
export type CodigoDaPergunta = (typeof PERGUNTAS)[number]

/** A esquadria proposta que espera resposta: só os campos da esquadria, como a LLM os propôs. */
export type EsquadriaProposta = Record<string, unknown>

export type PerguntaEmAberto = {
    pergunta: CodigoDaPergunta
    /** O nome que a pergunta cita (o lido, na NOME_PARECIDO); nulo nas outras. */
    nome: string | null
    /** Os levantamentos citados na pergunta. */
    levantamentos: string[]
    itens: EsquadriaProposta[]
}

const tabelaAusente = (e: { code?: string }) => e.code === 'PGRST205' || e.code === '42P01'

/**
 * As esquadrias da proposta, com SÓ os campos da esquadria e só as que dizem alguma coisa. O número
 * (`ordem`) fica de fora: ele se refere a um levantamento que a pergunta ainda não decidiu.
 */
export function esquadriasDaProposta(proposta: unknown): EsquadriaProposta[] {
    const itens = proposta && typeof proposta === 'object' ? (proposta as { itens?: unknown }).itens : undefined
    if (!Array.isArray(itens)) return []
    return itens.flatMap((bruto) => {
        if (!bruto || typeof bruto !== 'object') return []
        const b = bruto as Record<string, unknown>
        const campos = Object.fromEntries(CAMPOS_DA_ESQUADRIA.filter((c) => b[c] !== undefined && b[c] !== null && b[c] !== '').map((c) => [c, b[c]]))
        return Object.keys(campos).length ? [campos] : []
    })
}

/** A linha lida, validada: o que não for uma pergunta conhecida é como se não houvesse pergunta. */
function lerLinha(l: Record<string, unknown> | null): PerguntaEmAberto | null {
    if (!l || !(PERGUNTAS as readonly string[]).includes(String(l.pergunta))) return null
    return {
        pergunta: l.pergunta as CodigoDaPergunta,
        nome: typeof l.nome === 'string' && l.nome.trim() !== '' ? l.nome : null,
        levantamentos: Array.isArray(l.levantamentos) ? l.levantamentos.filter((x): x is string => typeof x === 'string') : [],
        itens: esquadriasDaProposta({ itens: l.itens }),
    }
}

export async function lerPerguntaEmAberto(tenantId: string, remetenteId: string): Promise<PerguntaEmAberto | null | 'ausente'> {
    const { data, error } = await supabaseAdmin.from(TABELA_DA_PERGUNTA).select('pergunta, nome, levantamentos, itens')
        .eq('tenant_id', tenantId).eq('remetente_id', remetenteId).maybeSingle()
    if (error) {
        if (tabelaAusente(error)) return 'ausente'
        throw new Error(`${TABELA_DA_PERGUNTA}: ${error.message}`)
    }
    return lerLinha(data as Record<string, unknown> | null)
}

export async function gravarPerguntaEmAberto(tenantId: string, remetenteId: string, p: PerguntaEmAberto): Promise<void> {
    const { error } = await supabaseAdmin.from(TABELA_DA_PERGUNTA).upsert(
        { tenant_id: tenantId, remetente_id: remetenteId, pergunta: p.pergunta, nome: p.nome, levantamentos: p.levantamentos, itens: p.itens, criado_em: new Date().toISOString() },
        { onConflict: 'tenant_id,remetente_id' },
    )
    if (error) throw new Error(`${TABELA_DA_PERGUNTA}: ${error.message}`)
}

export async function apagarPerguntaEmAberto(tenantId: string, remetenteId: string): Promise<void> {
    const { error } = await supabaseAdmin.from(TABELA_DA_PERGUNTA).delete().eq('tenant_id', tenantId).eq('remetente_id', remetenteId)
    if (error) throw new Error(`${TABELA_DA_PERGUNTA}: ${error.message}`)
}
