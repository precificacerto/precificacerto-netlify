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

export async function transcreverAudio(tenantId: string, bytes: Uint8Array, mimetype: string | null, segundosDeclarados: number | null,
    deps: { url: string; chave: string; fetch?: typeof fetch } = {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '', chave: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    }): Promise<Transcricao> {
    const falhou = (detalhe: string): Transcricao => ({ ok: false, motivo: 'audio_nao_transcrito', segundos: segundosDeclarados, detalhe })
    if (!deps.url || !deps.chave) return falhou('sem_configuracao')
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), PRAZO_DA_TRANSCRICAO_MS)
    try {
        const r = await (deps.fetch ?? fetch)(`${deps.url.replace(/\/$/, '')}/functions/v1/transcribe-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.chave}`, apikey: deps.chave },
            body: JSON.stringify({ tenant_id: tenantId, audio_base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'), mimetype, segundos_declarados: segundosDeclarados }),
            signal: controle.signal,
        })
        const corpo = (await r.json().catch((): null => null)) as Record<string, unknown> | null
        if (!corpo || typeof corpo.ok !== 'boolean') return falhou(`status=${r.status}`)
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
