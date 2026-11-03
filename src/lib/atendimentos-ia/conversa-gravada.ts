/**
 * Atendimentos I.A. — a CONVERSA GRAVADA (dono do produto, 03/11/2026): "a conversa VOLTA a ser gravada".
 *
 * A decisão 4 de 25/10/2026 (nada em `orcamentista_conversa` nem em `orcamentista_mensagem`) foi REVOGADA em 03/11/2026. A
 * conversa do vendedor com o agente é gravada, DENTRO DO TENANT, para dois fins:
 *   1. HISTÓRICO: o modelo recebe as últimas mensagens da conversa — até MENSAGENS_DO_HISTORICO, das últimas HORAS_DO_HISTORICO,
 *      num teto de CARACTERES_DO_HISTORICO. O levantamento formal, com preço, NÃO entra: vira MARCA_DO_FORMAL. Saída acima
 *      de CORTE_DA_SAIDA caracteres entra cortada. "Essa regra de nunca mandar dinheiro ao modelo é inviolável": é `temDinheiro`
 *      que decide, nunca o desfecho gravado.
 *   2. IDEMPOTÊNCIA: a entrada leva o `Info.ID` do WUZAPI (`wuzapi_mensagem_id`, UNIQUE parcial por tenant); a mesma mensagem
 *      nunca é conduzida duas vezes. A saída diz a qual entrada responde (`responde_a`, migração 20261103000003) e leva o id
 *      do envio — ou nulo, quando o envio falhou. O reenvio do WUZAPI de uma entrada já respondida devolve 200 sem conduzir
 *      nem reenviar; só reenvia quando o primeiro envio falhou DE FATO (a saída existe sem id de envio); sem saída e com a
 *      entrada mais velha que JANELA_EM_VOO_MS, a primeira condução morreu, e a mensagem é conduzida de novo.
 * Nada sai do tenant, nunca: toda leitura e toda escrita levam o `tenant_id`. Nenhuma empresa vê a conversa de outra.
 * RETENÇÃO: 12 meses, em PR própria (o cron). Aqui nada expira e nada é apagado.
 *
 * SEM A MIGRAÇÃO (a coluna `responde_a` não existe: 42703 ou PGRST204): a saída é gravada sem ela, e o reenvio de uma entrada
 * já gravada responde 200 sem conduzir e sem reenviar — o comportamento de antes de 25/10/2026. A linha [IA] diz
 * `gravacao=sem_migracao`.
 *
 * Portão: `atendimentos-ia-inbound.test.ts` (a rota grava) e `atendimentos-ia-levantamento-por-nome.test.ts` (a conversa lê e responde).
 */
import { supabaseAdmin } from '@/supabase/admin'
import { temDinheiro } from '@/lib/atendimentos-ia/contexto-do-atendimento'

export const MENSAGENS_DO_HISTORICO = 20
export const HORAS_DO_HISTORICO = 24
export const CARACTERES_DO_HISTORICO = 6000
export const CORTE_DA_SAIDA = 600
export const MARCA_DO_FORMAL = '[levantamento formal enviado]'
/** O limite da rota de entrada (`inbound.ts`, `maxDuration: 60`): depois dele, a primeira condução não está mais em voo. */
export const JANELA_EM_VOO_MS = 60_000

const VIOLACAO_DE_UNICIDADE = '23505'
/** A coluna ainda não existe (migração pendente): o PostgREST diz 42703 (coluna) ou PGRST204. */
const colunaAusente = (e: { code?: string } | null) => e?.code === '42703' || e?.code === 'PGRST204'

export type Entrada = {
    conversaId: string
    id: string
    /** `criado_em` da entrada — na repetida, o da PRIMEIRA vez que ela chegou. */
    criadoEm: string
    /** O mesmo `Info.ID` já estava gravado neste tenant: a mensagem é um reenvio do WUZAPI. */
    repetida: boolean
}

/** A conversa do remetente no tenant: a mais recente, ou uma nova. */
export async function conversaDoRemetente(tenantId: string, remetenteId: string, telefone: string): Promise<string> {
    const { data, error } = await supabaseAdmin.from('orcamentista_conversa').select('id')
        .eq('tenant_id', tenantId).eq('remetente_id', remetenteId).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(`orcamentista_conversa: ${error.message}`)
    if (data) return (data as { id: string }).id
    const { data: nova, error: erroNova } = await supabaseAdmin.from('orcamentista_conversa')
        .insert({ tenant_id: tenantId, remetente_id: remetenteId, telefone }).select('id').single()
    if (erroNova || !nova) throw new Error(`orcamentista_conversa: ${erroNova?.message ?? 'o insert não devolveu a linha'}`)
    return (nova as { id: string }).id
}

/**
 * Grava a entrada; o mesmo `Info.ID` já gravado no tenant (23505 na UNIQUE parcial) devolve a linha de antes, `repetida`.
 * Sem `Info.ID` não há como reconhecer o reenvio: a entrada é gravada sem ele, e nunca é repetida.
 */
export async function gravarEntrada(tenantId: string, conversaId: string, texto: string, wuzapiMensagemId: string | null): Promise<Entrada> {
    const { data, error } = await supabaseAdmin.from('orcamentista_mensagem')
        .insert({ tenant_id: tenantId, conversa_id: conversaId, direcao: 'entrada', texto, wuzapi_mensagem_id: wuzapiMensagemId })
        .select('id, criado_em').single()
    if (!error && data) {
        const l = data as { id: string; criado_em: string }
        return { conversaId, id: l.id, criadoEm: l.criado_em, repetida: false }
    }
    if (error?.code !== VIOLACAO_DE_UNICIDADE || wuzapiMensagemId === null) throw new Error(`orcamentista_mensagem: ${error?.message ?? 'o insert não devolveu a linha'}`)
    const { data: antes, error: erroAntes } = await supabaseAdmin.from('orcamentista_mensagem').select('id, conversa_id, criado_em')
        .eq('tenant_id', tenantId).eq('direcao', 'entrada').eq('wuzapi_mensagem_id', wuzapiMensagemId).maybeSingle()
    if (erroAntes) throw new Error(`orcamentista_mensagem: ${erroAntes.message}`)
    if (!antes) throw new Error('orcamentista_mensagem: a entrada repetida (23505) não foi achada')
    const l = antes as { id: string; conversa_id: string; criado_em: string }
    return { conversaId: l.conversa_id, id: l.id, criadoEm: l.criado_em, repetida: true }
}

export type Saida = { id: string; texto: string; enviada: boolean }

/** A saída que respondeu à entrada, se houve; `enviada` é ter o id do envio. `sem_migracao` sem a coluna `responde_a`. */
export async function saidaDaEntrada(tenantId: string, entradaId: string): Promise<Saida | null | 'sem_migracao'> {
    const { data, error } = await supabaseAdmin.from('orcamentista_mensagem').select('id, texto, wuzapi_mensagem_id')
        .eq('tenant_id', tenantId).eq('direcao', 'saida').eq('responde_a', entradaId).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (error) {
        if (colunaAusente(error)) return 'sem_migracao'
        throw new Error(`orcamentista_mensagem: ${error.message}`)
    }
    if (!data) return null
    const l = data as { id: string; texto: string | null; wuzapi_mensagem_id: string | null }
    return { id: l.id, texto: l.texto ?? '', enviada: l.wuzapi_mensagem_id !== null }
}

/** Grava a saída — o texto como foi enviado, a entrada a que responde e o id do envio (nulo quando o envio falhou). */
export async function gravarSaida(tenantId: string, conversaId: string, respondeA: string, texto: string, idDoEnvio: string | null): Promise<'gravada' | 'sem_migracao'> {
    const linha = { tenant_id: tenantId, conversa_id: conversaId, direcao: 'saida', texto, wuzapi_mensagem_id: idDoEnvio }
    const { error } = await supabaseAdmin.from('orcamentista_mensagem').insert({ ...linha, responde_a: respondeA })
    if (!error) return 'gravada'
    if (!colunaAusente(error)) throw new Error(`orcamentista_mensagem: ${error.message}`)
    const { error: erroSem } = await supabaseAdmin.from('orcamentista_mensagem').insert(linha)
    if (erroSem) throw new Error(`orcamentista_mensagem: ${erroSem.message}`)
    return 'sem_migracao'
}

/** O reenvio de uma saída cujo primeiro envio falhou: a linha ganha o id do envio. R1: o update tem de atingir a linha. */
export async function marcarEnvio(tenantId: string, saidaId: string, idDoEnvio: string): Promise<void> {
    const { data, error } = await supabaseAdmin.from('orcamentista_mensagem').update({ wuzapi_mensagem_id: idDoEnvio })
        .eq('tenant_id', tenantId).eq('id', saidaId).select('id')
    if (error) throw new Error(`orcamentista_mensagem: ${error.message}`)
    if ((data ?? []).length !== 1) throw new Error(`orcamentista_mensagem: o update do envio atingiu ${(data ?? []).length} linha(s), e devia atingir 1`)
}

export type MensagemDoHistorico = { role: 'user' | 'assistant'; content: string }
type LinhaDoHistorico = { direcao: string; texto: string | null }

const caracteres = (t: string) => Array.from(t).length
const cortar = (t: string, n: number) => (caracteres(t) <= n ? t : `${Array.from(t).slice(0, n).join('')}…`)

/**
 * O histórico como vai ao modelo, a partir das linhas DA MAIS NOVA PARA A MAIS VELHA (a entrada desta vez já fora):
 *   - saída com DINHEIRO vira MARCA_DO_FORMAL; saída acima de CORTE_DA_SAIDA é cortada; a entrada vai como veio;
 *   - o teto de CARACTERES_DO_HISTORICO descarta as mais velhas;
 *   - da mais velha para a mais nova, começando em `user`; papéis seguidos iguais viram uma mensagem.
 */
export function montarHistorico(linhas: readonly LinhaDoHistorico[]): MensagemDoHistorico[] {
    const dentro: MensagemDoHistorico[] = []
    let total = 0
    for (const l of linhas.slice(0, MENSAGENS_DO_HISTORICO)) {
        if (typeof l.texto !== 'string' || l.texto === '') continue
        const saida = l.direcao === 'saida'
        const content = saida ? (temDinheiro(l.texto) ? MARCA_DO_FORMAL : cortar(l.texto, CORTE_DA_SAIDA)) : l.texto
        if (total + caracteres(content) > CARACTERES_DO_HISTORICO) break
        total += caracteres(content)
        dentro.push({ role: saida ? 'assistant' : 'user', content })
    }
    dentro.reverse()
    while (dentro.length && dentro[0].role !== 'user') dentro.shift()
    const juntas: MensagemDoHistorico[] = []
    for (const m of dentro) {
        const ultima = juntas[juntas.length - 1]
        if (ultima && ultima.role === m.role) ultima.content = `${ultima.content}\n\n${m.content}`
        else juntas.push({ ...m })
    }
    return juntas
}

export type Historico = {
    mensagens: MensagemDoHistorico[]
    /** O texto da última saída da conversa na janela, COMO FOI ENVIADO: é com ele que a resposta de agora não pode coincidir. */
    ultimaSaida: string | null
}

/** As últimas mensagens da conversa (sem a entrada desta vez), prontas para o modelo. */
export async function lerHistorico(tenantId: string, conversaId: string, entradaId: string, agora = new Date()): Promise<Historico> {
    const desde = new Date(agora.getTime() - HORAS_DO_HISTORICO * 3_600_000).toISOString()
    const { data, error } = await supabaseAdmin.from('orcamentista_mensagem').select('id, direcao, texto, criado_em')
        .eq('tenant_id', tenantId).eq('conversa_id', conversaId).gte('criado_em', desde)
        .order('criado_em', { ascending: false }).limit(MENSAGENS_DO_HISTORICO + 1)
    if (error) throw new Error(`orcamentista_mensagem: ${error.message}`)
    const linhas = ((data ?? []) as Array<{ id: string; direcao: string; texto: string | null }>).filter((l) => l.id !== entradaId)
    const ultima = linhas.find((l) => l.direcao === 'saida')
    return { mensagens: montarHistorico(linhas), ultimaSaida: typeof ultima?.texto === 'string' ? ultima.texto : null }
}
