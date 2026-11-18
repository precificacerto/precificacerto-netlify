/**
 * Atendimentos I.A. — o DOWNLOAD da mídia do vendedor pelo WUZAPI (dono do produto, 18/11/2026).
 *
 * MEDIDO em produção em 18/11/2026: o webhook desta conexão entrega só os metadados da mídia, sem o base64 (`payload-wuzapi.ts`).
 * O arquivo se busca aqui: `POST /chat/downloadimage` (a mensagem de imagem) ou `/chat/downloaddocument` (a de documento), header
 * `token` (o da conexão do orçamentista), corpo `{ Url, DirectPath, MediaKey, Mimetype, FileEncSHA256, FileSHA256, FileLength }` —
 * os campos de `downloadImageStruct`/`downloadDocumentStruct` do fonte do WUZAPI (asternic/wuzapi, `handlers.go`, lido em
 * 18/11/2026). A resposta é `{ code, data: { Mimetype, Data: "data:<mime>;base64,<...>" }, success }`.
 *
 * Por este caminho o arquivo NÃO passa pelo corpo do webhook: o limite de 4,5 MB do corpo da requisição na Vercel não o alcança.
 *
 * NUNCA vai ao log: o token, os bytes, a URL do WhatsApp nem a chave da mídia. Quem chama recebe só `ok` ou o motivo, em código.
 */
import type { MidiaDaMensagem } from '@/lib/atendimentos-ia/payload-wuzapi'

const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

/** O PRAZO do download: o arquivo de até 90 MB que não volta não pode segurar o turno até a Vercel o matar sem log. */
export const PRAZO_DO_DOWNLOAD_MS = 90_000

export type Download = { ok: true; bytes: Uint8Array } | { ok: false; detalhe: string }

/** O endpoint é o da MENSAGEM do WhatsApp (imagem ou documento), não o de como o arquivo será lido. */
export const caminhoDoDownload = (m: MidiaDaMensagem) => (m.tipo === 'imagem' ? '/chat/downloadimage' : m.tipo === 'audio' ? '/chat/downloadaudio' : '/chat/downloaddocument')

/** O conteúdo de um data URL em base64, ou NULL quando não é um. */
export function bytesDoDataUrl(v: unknown): Uint8Array | null {
    if (typeof v !== 'string') return null
    const m = /^data:[^,]*;base64,/.exec(v)
    if (!m) return null
    const b64 = v.slice(m[0].length)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null
    return new Uint8Array(Buffer.from(b64, 'base64'))
}

/** Baixa a mídia; nunca lança. */
export async function baixarMidia(token: string, m: MidiaDaMensagem): Promise<Download> {
    const d = m.download
    if (!d) return { ok: false, detalhe: 'sem_dados' }
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), PRAZO_DO_DOWNLOAD_MS)
    try {
        const r = await fetch(`${wuzapi()}${caminhoDoDownload(m)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token },
            signal: controle.signal,
            body: JSON.stringify({
                Url: d.url, DirectPath: d.directPath, MediaKey: d.mediaKey, Mimetype: m.mimetype ?? '',
                FileEncSHA256: d.fileEncSHA256, FileSHA256: d.fileSHA256, FileLength: d.fileLength ?? 0,
            }),
        })
        if (!r.ok) return { ok: false, detalhe: `status=${r.status}` }
        const corpo = (await r.json().catch((): null => null)) as { data?: { Data?: unknown } } | null
        const bytes = bytesDoDataUrl(corpo?.data?.Data)
        if (!bytes) return { ok: false, detalhe: 'corpo_sem_arquivo' }
        return { ok: true, bytes }
    } catch {
        return { ok: false, detalhe: controle.signal.aborted ? 'prazo_esgotado' : 'excecao' }
    } finally {
        clearTimeout(relogio)
    }
}
