/**
 * O ÁUDIO DO WHATSAPP VIRA TEXTO (tarefa 0018 do bridge, dono do produto, 18/11/2026): a conversa chama a Edge Function `transcribe-audio`
 * (Supabase, onde a GROQ_API_KEY mora — lida lá por Deno.env.get, nunca aqui) com o service_role do servidor. A função grava o uso por empresa
 * e devolve o texto, ou o MOTIVO de não ter transcrito; aqui o motivo vira a recusa nomeada da mídia (`midia-da-mensagem.ts`). O texto
 * transcrito nunca vai ao log.
 */
import type { MotivoDaRecusa } from '@/lib/atendimentos-ia/midia-da-mensagem'

/** O prazo da chamada: a Groq responde em segundos, e a rota inteira tem 60 s (o modelo vem depois). */
export const PRAZO_DA_TRANSCRICAO_MS = 20_000

export type Transcricao =
    | { ok: true; texto: string; provider: string; segundos: number | null; uso: string }
    | { ok: false; motivo: MotivoDaRecusa; segundos: number | null; detalhe: string }

const MOTIVO_DA_FUNCAO: Readonly<Record<string, MotivoDaRecusa>> = { longo: 'audio_longo', nao_liberada: 'audio_nao_liberado', teto: 'audio_teto', falhou: 'audio_nao_transcrito' }

/**
 * AS DUAS CHAVES DE SERVIÇO (dono do produto, 18/11/2026: "Leia a variável que existir, na ordem, e use a que estiver presente. Se as duas
 * existirem, use a nova."): a NOVA (`SUPABASE_SECRET_KEY`, `sb_secret_…`) primeiro, a LEGADA (`SUPABASE_SERVICE_ROLE_KEY`, JWT) depois. A que a
 * Supabase recusa (401/403) cede à seguinte; nenhuma funcionando, a recusa é NOMEADA no log — a variável lida, o formato e o status de cada uma —,
 * nunca um 401 mudo. O vendedor recebe a frase de sempre: formato de chave não é assunto dele.
 */
export const VARIAVEIS_DA_CHAVE = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const
export type FormatoDaChave = 'sb_secret' | 'jwt' | 'outro'
/** O formato, para o log — nunca o valor. */
export const formatoDaChave = (v: string): FormatoDaChave => (v.startsWith('sb_secret_') ? 'sb_secret' : /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(v) ? 'jwt' : 'outro')
export const PREFIXO_DO_LOG_DA_CHAVE = '[TRANSCRICAO-CHAVE]'
/**
 * Os cabeçalhos de cada formato (medido na Supabase em 18/11/2026): a chave NOVA vai SÓ no `apikey` — com ela também no `Authorization`, o
 * gateway devolve 401 "Conflicting API keys … Send the intended sb_ key only in the apikey header". O JWT legado vai nos dois, como sempre.
 */
export const cabecalhosDaChave = (chave: string): Record<string, string> => (formatoDaChave(chave) === 'sb_secret'
    ? { 'Content-Type': 'application/json', apikey: chave }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}`, apikey: chave })

type DependenciasDaTranscricao = { url: string; env: (nome: string) => string | undefined; fetch?: typeof fetch; log?: (linha: string) => void }
/** O ambiente do servidor, lido NA HORA da chamada (nunca no carregamento do módulo). */
const doServidor = (): DependenciasDaTranscricao => ({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '', env: (n) => process.env[n],
})

export async function transcreverAudio(tenantId: string, bytes: Uint8Array, mimetype: string | null, segundosDeclarados: number | null,
    deps: DependenciasDaTranscricao = doServidor()): Promise<Transcricao> {
    const log = deps.log ?? ((l: string) => console.error(l))
    const falhou = (detalhe: string): Transcricao => ({ ok: false, motivo: 'audio_nao_transcrito', segundos: segundosDeclarados, detalhe })
    const chaves = VARIAVEIS_DA_CHAVE.flatMap((nome) => { const v = (deps.env(nome) ?? '').trim(); return v ? [{ nome, valor: v }] : [] })
    if (!deps.url || chaves.length === 0) {
        log(`${PREFIXO_DO_LOG_DA_CHAVE} recusada: ${!deps.url ? 'sem a URL do Supabase (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL)' : `nenhuma chave de serviço: ${VARIAVEIS_DA_CHAVE.join(' e ')} ausentes`}`)
        return falhou(!deps.url ? 'sem_url' : 'sem_chave_de_servico')
    }
    const corpoDoPedido = JSON.stringify({ tenant_id: tenantId, audio_base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'), mimetype, segundos_declarados: segundosDeclarados })
    const recusadas: string[] = []
    for (const chave of chaves) {
        const controle = new AbortController()
        const relogio = setTimeout(() => controle.abort(), PRAZO_DA_TRANSCRICAO_MS)
        try {
            const r = await (deps.fetch ?? fetch)(`${deps.url.replace(/\/$/, '')}/functions/v1/transcribe-audio`, {
                method: 'POST',
                headers: cabecalhosDaChave(chave.valor),
                body: corpoDoPedido,
                signal: controle.signal,
            })
            const corpo = (await r.json().catch((): null => null)) as Record<string, unknown> | null
            // a chave que a Supabase não aceita cede à seguinte — anotada com a variável, o formato e o status
            if (r.status === 401 || r.status === 403) {
                recusadas.push(`${chave.nome}:${formatoDaChave(chave.valor)}:${r.status}${corpo && typeof corpo.detalhe === 'string' ? `(${corpo.detalhe})` : ''}`)
                continue
            }
            if (!corpo || typeof corpo.ok !== 'boolean') return falhou(`status=${r.status} chave=${chave.nome}`)
            const segundos = typeof corpo.segundos === 'number' ? corpo.segundos : segundosDeclarados
            if (corpo.ok === true && typeof corpo.texto === 'string' && corpo.texto.trim()) {
                return { ok: true, texto: corpo.texto.trim(), provider: String(corpo.provider ?? '-'), segundos, uso: String(corpo.uso ?? '-') }
            }
            const motivo = MOTIVO_DA_FUNCAO[String(corpo.motivo)] ?? 'audio_nao_transcrito'
            return { ok: false, motivo, segundos, detalhe: `motivo=${String(corpo.motivo ?? '-')} status=${r.status}` }
        } catch {
            return falhou(controle.signal.aborted ? 'prazo_esgotado' : 'excecao')
        } finally {
            clearTimeout(relogio)
        }
    }
    log(`${PREFIXO_DO_LOG_DA_CHAVE} recusada: nenhuma chave de serviço funcionou — ${recusadas.map((x) => { const [n, f, st] = x.split(':'); return `variavel=${n} formato=${f} status=${st}` }).join('; ')}`)
    return falhou(`chave_recusada ${recusadas.join(',')}`)
}
