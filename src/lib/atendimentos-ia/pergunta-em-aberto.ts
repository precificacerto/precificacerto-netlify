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
 *
 * A PERGUNTA EXPIRA (dono do produto, 05/11/2026): "a pergunta em aberto expira em 24 h na leitura, como o histórico. Pendência presa por
 * dois dias contamina toda mensagem nova do vendedor." Medido: a CONFIRMAR_ACRESCIMO do Geronimo (10 itens, 03/11 21:20 UTC) ficou dois dias
 * na tabela — a linha só saía quando uma mensagem a RESOLVIA, e o vendedor nunca respondeu "sim/não" —, e a conversa do Jeison foi lida como
 * resposta a uma confirmação de terça. A leitura mais velha que `HORAS_DA_PERGUNTA_EM_ABERTO` é `'expirada'`: nenhuma pergunta vai ao
 * modelo, a linha [IA] diz `aberta=expirada`, e a linha velha fica no banco até a próxima pergunta a sobrescrever ou uma resolução a apagar
 * — como o histórico, que filtra na leitura e não apaga.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { mesmoVidro } from '@/lib/atendimentos-ia/vidro'
import { CAMPOS_DA_ESQUADRIA } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { HORAS_DO_HISTORICO } from '@/lib/atendimentos-ia/conversa-gravada'

export const TABELA_DA_PERGUNTA = 'orcamentista_pergunta_em_aberto'
/** A pergunta vale o mesmo tempo que o histórico da conversa (05/11/2026): 24 h, contadas de `criado_em`. */
export const HORAS_DA_PERGUNTA_EM_ABERTO = HORAS_DO_HISTORICO
/** CONFIRMAR_APANHADO entrou com a migração 20261026000003 (o apanhado, dono do produto, 26/10/2026). */
export const PERGUNTAS = ['NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO', 'CONFIRMAR_APANHADO'] as const
export type CodigoDaPergunta = (typeof PERGUNTAS)[number]

/** A esquadria proposta que espera resposta: só os campos da esquadria, como a LLM os propôs. */
export type EsquadriaProposta = Record<string, unknown>

export type PerguntaEmAberto = {
    pergunta: CodigoDaPergunta
    /**
     * O nome que a pergunta cita: o lido, na NOME_PARECIDO e na confirmação do RESGATE (03/11/2026) — que é uma CONFIRMAR_ACRESCIMO
     * COM nome, porque a CHECK de `pergunta` em produção (20261026000003) não aceita outro código e nenhuma migração foi pedida.
     * Nulo nas outras.
     */
    nome: string | null
    /** Os levantamentos citados na pergunta. No resgate, em ordem decrescente de data (a numeração da lista); na confirmação, o escolhido primeiro. */
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
        // o `vidro_padrao` (04/11/2026) viaja com a esquadria retida: é aplicado só quando ela fica sem vidro (`aplicarProposta`)
        const campos = Object.fromEntries([...CAMPOS_DA_ESQUADRIA, 'vidro_padrao'].filter((c) => b[c] !== undefined && b[c] !== null && b[c] !== '').map((c) => [c, b[c]]))
        return CAMPOS_DA_ESQUADRIA.some((c) => c in campos) ? [campos] : []
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

/**
 * A pergunta EXPIROU quando `criado_em` é mais velho que `HORAS_DA_PERGUNTA_EM_ABERTO` antes de `agora` — a mesma conta do histórico
 * (`criado_em >= agora − 24 h` fica). Uma data que não se lê NÃO expira: a idade é desconhecida, e o desconhecido não vira "velha"
 * (`ausente-vs-falso`); a coluna é NOT NULL DEFAULT now() em produção, então esse caso é só a leitura defensiva.
 */
export function perguntaExpirou(criadoEm: unknown, agora: Date): boolean {
    if (typeof criadoEm !== 'string') return false
    const t = new Date(criadoEm).getTime()
    if (Number.isNaN(t)) return false
    return t < agora.getTime() - HORAS_DA_PERGUNTA_EM_ABERTO * 3_600_000
}

/** `'expirada'`: há uma linha, mas velha demais para ser a pergunta desta conversa — quem lê a trata como nenhuma pergunta. */
export async function lerPerguntaEmAberto(tenantId: string, remetenteId: string, agora = new Date()): Promise<PerguntaEmAberto | null | 'ausente' | 'expirada'> {
    const { data, error } = await supabaseAdmin.from(TABELA_DA_PERGUNTA).select('pergunta, nome, levantamentos, itens, criado_em')
        .eq('tenant_id', tenantId).eq('remetente_id', remetenteId).maybeSingle()
    if (error) {
        if (tabelaAusente(error)) return 'ausente'
        throw new Error(`${TABELA_DA_PERGUNTA}: ${error.message}`)
    }
    const linha = lerLinha(data as Record<string, unknown> | null)
    if (linha && perguntaExpirou((data as Record<string, unknown>).criado_em, agora)) return 'expirada'
    return linha
}

/**
 * Grava (sobrescreve) a pergunta do remetente. `false` quando o banco ainda não a aceita — a tabela ausente
 * (PGRST205/42P01) ou a CHECK de `pergunta` sem o valor (23514: a migração do valor não foi aplicada). Quem
 * chama decide o que fazer sem ela; qualquer outro erro lança.
 */
export async function gravarPerguntaEmAberto(tenantId: string, remetenteId: string, p: PerguntaEmAberto): Promise<boolean> {
    const { error } = await supabaseAdmin.from(TABELA_DA_PERGUNTA).upsert(
        { tenant_id: tenantId, remetente_id: remetenteId, pergunta: p.pergunta, nome: p.nome, levantamentos: p.levantamentos, itens: p.itens, criado_em: new Date().toISOString() },
        { onConflict: 'tenant_id,remetente_id' },
    )
    if (!error) return true
    if (tabelaAusente(error) || error.code === '23514') return false
    throw new Error(`${TABELA_DA_PERGUNTA}: ${error.message}`)
}

export async function apagarPerguntaEmAberto(tenantId: string, remetenteId: string): Promise<void> {
    const { error } = await supabaseAdmin.from(TABELA_DA_PERGUNTA).delete().eq('tenant_id', tenantId).eq('remetente_id', remetenteId)
    if (error) throw new Error(`${TABELA_DA_PERGUNTA}: ${error.message}`)
}

/** Os campos que IDENTIFICAM a esquadria: a quantidade não é identidade (04/11/2026) — é somada ou atualizada. */
const CAMPOS_DE_IDENTIDADE = CAMPOS_DA_ESQUADRIA.filter((c) => c !== 'quantidade')
const presente = (v: unknown) => v !== undefined && v !== null && v !== ''

/**
 * DUAS ESQUADRIAS SÃO EQUIVALENTES (dono do produto, 04/11/2026: "dedupe por equivalência, não por igualdade de 6 campos") quando nenhum
 * campo de identidade presente nos dois lados difere — o vidro pela forma canônica (`mesmoVidro`), os outros pelo valor — e pelo menos um
 * campo de identidade coincide. "Campo ausente num dos lados não impede a dedupe: o item com menos campos é o mesmo item, mais pobre."
 * "2 uni - DP-02" sobre um DP-02 retido é o mesmo DP-02 com a quantidade dita. A regra nunca inventa: "8 mm" e "temperado 8 mm" diferem.
 */
export function esquadriasEquivalentes(a: EsquadriaProposta, b: EsquadriaProposta): boolean {
    let coincidem = 0
    for (const c of CAMPOS_DE_IDENTIDADE) {
        if (!presente(a[c]) || !presente(b[c])) continue
        const iguais = c === 'vidro' ? mesmoVidro(a[c], b[c]) : a[c] === b[c]
        if (!iguais) return false
        coincidem += 1
    }
    return coincidem > 0
}

/**
 * Funde a nova na retida: a informação mais completa prevalece — o que a retida não tinha vem da nova (o vidro inclusive: a retida sem vidro
 * ganha o dito agora); o que as duas têm fica o da retida (chegou antes). A quantidade dita agora ATUALIZA a de antes.
 */
export function fundirEsquadrias(retida: EsquadriaProposta, nova: EsquadriaProposta): EsquadriaProposta {
    const fusao: EsquadriaProposta = { ...retida }
    for (const c of [...CAMPOS_DA_ESQUADRIA, 'vidro_padrao']) if (!presente(fusao[c]) && presente(nova[c])) fusao[c] = nova[c]
    if (presente(nova.quantidade)) fusao.quantidade = nova.quantidade
    return fusao
}

/**
 * AS ESQUADRIAS RETIDAS NUNCA SE PERDEM (dono do produto, 03/11/2026): o que já estava guardado na pergunta em aberto mais o que vem na
 * mensagem nova. A nova EQUIVALENTE a uma retida (04/11/2026; antes, só a idêntica nos 6 campos) é a MESMA esquadria dita de novo — mais
 * pobre, mais rica ou com a quantidade — e se funde nela, contando uma vez; a que não equivale a nenhuma acumula. Só contra as RETIDAS:
 * duas novas iguais na MESMA mensagem ("DP-02 …; outra DP-02 …") são duas, e é o agrupamento que as soma. As retidas vêm primeiro (chegaram
 * antes); as novas ficam como a IA as propôs (com `ordem`, família…), e a nova que equivale a mais de uma retida se funde na PRIMEIRA.
 */
export function juntarEsquadrias(retidas: readonly EsquadriaProposta[], novas: readonly unknown[]): { itens: unknown[]; reenviadas: number } {
    const itens: unknown[] = retidas.map((r) => ({ ...r }))
    let reenviadas = 0
    for (const bruto of novas) {
        if (!bruto || typeof bruto !== 'object') { itens.push(bruto); continue }
        const campos = esquadriasDaProposta({ itens: [bruto] })[0]
        if (!campos) { itens.push(bruto); continue }
        const k = itens.findIndex((i, n) => n < retidas.length && !!i && typeof i === 'object' && esquadriasEquivalentes(esquadriasDaProposta({ itens: [i] })[0] ?? {}, campos))
        if (k < 0) { itens.push(bruto); continue }
        reenviadas += 1
        itens[k] = fundirEsquadrias(itens[k] as EsquadriaProposta, bruto as EsquadriaProposta)
    }
    return { itens, reenviadas }
}
