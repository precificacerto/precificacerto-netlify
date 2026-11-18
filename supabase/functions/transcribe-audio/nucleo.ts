/**
 * O NÚCLEO DA TRANSCRIÇÃO DO ÁUDIO DO WHATSAPP (tarefa 0018 do bridge, dono do produto, 18/11/2026) — puro: as dependências (o ambiente, o
 * fetch, a espera, o banco) entram por parâmetro, para o mesmo código rodar na Edge Function (Deno) e no portão (Jest). Sem import nenhum.
 *
 * As decisões:
 *   1. "SEM TETO DE MINUTOS neste primeiro momento. Grava o uso para medir, mas não bloqueia ninguém. O teto fica em configuração,
 *      desligado" (`audio_transcription_settings`, migração 20261118000003).
 *   2. "Quem tem direito é a empresa liberada no super admin" — `orcamentista_config.ativo`, não o plano.
 *   3. "Limite de 3 minutos por áudio": acima disso não transcreve.
 *   4. "O agente sempre diz o que o impede": cada recusa volta com o motivo, e quem chama diz a frase.
 * A Groq (`whisper-large-v3-turbo`, `pt`) com até 2 novas tentativas e espera curta; a reserva OpenAI (`gpt-4o-mini-transcribe`) só se
 * `OPENAI_API_KEY` existir — não existindo, pula sem erro. A chave é lida do ambiente e NUNCA vai a resposta, log ou banco; o texto transcrito
 * também não vai ao log nem ao banco (só ao chamador).
 */

export const LIMITE_DE_SEGUNDOS = 180
/** As esperas entre as tentativas na Groq: a 1ª tentativa e mais 2 (dono do produto: "até 2 novas tentativas com espera curta"). */
export const ESPERAS_ENTRE_TENTATIVAS_MS = [500, 1500] as const
export const URL_DA_GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions'
export const MODELO_DA_GROQ = 'whisper-large-v3-turbo'
export const URL_DA_OPENAI = 'https://api.openai.com/v1/audio/transcriptions'
export const MODELO_DA_OPENAI = 'gpt-4o-mini-transcribe'
/** O maior áudio aceito no pedido, em base64 (25 MB do arquivo, o limite da API da Groq no plano livre). */
export const LIMITE_DO_BASE64 = Math.ceil((25 * 1024 * 1024) / 3) * 4

export type Provedor = 'groq' | 'openai'
export type StatusDoUso = 'ok' | 'falha' | 'bloqueado_duracao' | 'bloqueado_teto'
export type LinhaDoUso = { tenant_id: string; duration_seconds: number | null; provider: Provedor | null; status: StatusDoUso }
export type Teto = { ligado: boolean; minutosDoMes: number | null; segundosUsadosNoMes: number }

export type Dependencias = {
    env: (nome: string) => string | undefined
    fetch: (url: string, init: { method: string; headers: Record<string, string>; body: FormData }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
    esperar: (ms: number) => Promise<void>
    empresaLiberada: (tenantId: string) => Promise<boolean>
    teto: (tenantId: string) => Promise<Teto | 'sem_migracao'>
    gravarUso: (linha: LinhaDoUso) => Promise<'ok' | 'sem_migracao'>
}

export type Pedido = { tenant_id: string; audio_base64: string; mimetype: string | null; segundos_declarados: number | null }
export type MotivoDaRecusa = 'pedido_invalido' | 'nao_liberada' | 'longo' | 'teto' | 'falhou'
export type Resposta =
    | { ok: true; texto: string; provider: Provedor; segundos: number | null; uso: 'ok' | 'sem_migracao' }
    | { ok: false; motivo: MotivoDaRecusa; segundos: number | null; detalhe: string; uso: 'ok' | 'sem_migracao' | 'nao_gravado' }

// ── A CHAVE DE SERVIÇO (dono do produto, 18/11/2026: "a função e o chamador aceitam os DOIS formatos, sem adivinhar e sem falhar por causa
// disso") ── o JWT legado (`eyJ…`) e o novo (`sb_secret_…`). A função não confere o formato: confere o que a chave CONSEGUE — ler uma tabela que
// só o papel de serviço lê (`whatsapp_conexao`: só o service_role tem grant nela, medido em 18/11/2026). A chave nunca vai ao log: só o formato.

export type FormatoDaChave = 'sb_secret' | 'jwt' | 'outro' | 'ausente'
/** O formato, para o log — nunca o valor. */
export function formatoDaChave(chave: string | null | undefined): FormatoDaChave {
    if (!chave) return 'ausente'
    if (chave.startsWith('sb_secret_')) return 'sb_secret'
    if (/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(chave)) return 'jwt'
    return 'outro'
}
/**
 * A chave que o pedido apresenta: a NOVA vem no `apikey` (o gateway da Supabase só a aceita ali), e vence; senão o `Authorization: Bearer …`;
 * senão o `apikey` de qualquer formato.
 */
export function chaveApresentada(cabecalho: (nome: string) => string | null): string | null {
    const apikey = (cabecalho('apikey') ?? '').trim()
    if (apikey.startsWith('sb_secret_')) return apikey
    const bearer = (cabecalho('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    return bearer || apikey || null
}
/** A prova da chave: o status e o código que a Supabase devolveu ao ler a tabela de prova com ela; status 200 = é de serviço. */
export type ProvaDaChave = { status: number; codigo: string | null }
export type Autorizacao = { ok: true; formato: FormatoDaChave } | { ok: false; formato: FormatoDaChave; status: number; log: string; detalhe: string }
export const TABELA_DA_PROVA = 'whatsapp_conexao'
/** Autoriza pela PROVA, nunca pelo formato. A recusa é nomeada: o formato apresentado, a tabela da prova, o status e o código da Supabase. */
export async function autorizar(chave: string | null, provar: (chave: string) => Promise<ProvaDaChave>): Promise<Autorizacao> {
    const formato = formatoDaChave(chave)
    if (!chave) return { ok: false, formato, status: 401, log: 'chave=ausente (nem Authorization nem apikey no pedido)', detalhe: 'chave_ausente' }
    const prova = await provar(chave)
    if (prova.status >= 200 && prova.status < 300) return { ok: true, formato }
    return { ok: false, formato, status: 403, log: `chave formato=${formato} prova=${TABELA_DA_PROVA} status=${prova.status} codigo=${prova.codigo ?? '-'}`, detalhe: `chave_recusada formato=${formato} status=${prova.status}` }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const numeroOuNulo = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

/** O pedido conferido, ou a frase do que está errado nele (o chamador é o servidor: erro aqui é defeito de quem chama). */
export function lerPedido(corpo: unknown): Pedido | { erro: string } {
    if (!corpo || typeof corpo !== 'object') return { erro: 'corpo ausente' }
    const c = corpo as Record<string, unknown>
    if (typeof c.tenant_id !== 'string' || !UUID.test(c.tenant_id)) return { erro: 'tenant_id inválido' }
    if (typeof c.audio_base64 !== 'string' || c.audio_base64.length === 0) return { erro: 'audio_base64 ausente' }
    if (c.audio_base64.length > LIMITE_DO_BASE64) return { erro: `audio_base64 com ${c.audio_base64.length} caracteres, acima de ${LIMITE_DO_BASE64}` }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(c.audio_base64)) return { erro: 'audio_base64 não é base64' }
    return { tenant_id: c.tenant_id, audio_base64: c.audio_base64, mimetype: typeof c.mimetype === 'string' && c.mimetype ? c.mimetype : null, segundos_declarados: numeroOuNulo(c.segundos_declarados) }
}

const bytesDoBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
/** A extensão que o provedor usa para reconhecer o formato (o WhatsApp manda OGG/Opus). */
function nomeDoArquivo(mimetype: string | null): string {
    const m = (mimetype ?? '').toLowerCase()
    return m.includes('mpeg') || m.includes('mp3') ? 'audio.mp3' : m.includes('mp4') || m.includes('m4a') || m.includes('aac') ? 'audio.m4a' : m.includes('wav') ? 'audio.wav' : m.includes('webm') ? 'audio.webm' : 'audio.ogg'
}

type Tentativa = { ok: true; texto: string; segundos: number | null } | { ok: false; repetir: boolean; detalhe: string }

async function chamar(deps: Dependencias, url: string, chave: string, modelo: string, comDuracao: boolean, p: Pedido): Promise<Tentativa> {
    const form = new FormData()
    form.append('file', new Blob([bytesDoBase64(p.audio_base64) as unknown as BlobPart], { type: p.mimetype ?? 'audio/ogg' }), nomeDoArquivo(p.mimetype))
    form.append('model', modelo)
    form.append('language', 'pt')
    form.append('response_format', comDuracao ? 'verbose_json' : 'json')
    form.append('temperature', '0')
    try {
        const r = await deps.fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${chave}` }, body: form })
        // 429 e 5xx são do provedor e passam: tenta de novo; o resto (400, 401, 413) não muda repetindo
        if (!r.ok) return { ok: false, repetir: r.status === 429 || r.status >= 500, detalhe: `status=${r.status}` }
        const corpo = (await r.json().catch((): null => null)) as { text?: unknown; duration?: unknown } | null
        const texto = typeof corpo?.text === 'string' ? corpo.text.trim() : ''
        if (!texto) return { ok: false, repetir: false, detalhe: 'sem_texto' }
        return { ok: true, texto, segundos: numeroOuNulo(corpo?.duration) }
    } catch {
        return { ok: false, repetir: true, detalhe: 'rede' }
    }
}

/**
 * A transcrição: a empresa liberada → o limite de 3 minutos pelo declarado → o teto (se ligado) → a Groq, com até 2 novas tentativas → a
 * reserva OpenAI, se a chave existir → o limite de novo pela duração que o provedor mediu. Toda saída que chegou à empresa liberada grava UMA
 * linha de uso (o texto nunca).
 */
export async function transcrever(p: Pedido, deps: Dependencias): Promise<Resposta> {
    if (!(await deps.empresaLiberada(p.tenant_id))) return { ok: false, motivo: 'nao_liberada', segundos: null, detalhe: 'orcamentista_config.ativo', uso: 'nao_gravado' }
    const recusa = async (motivo: MotivoDaRecusa, status: StatusDoUso, segundos: number | null, provider: Provedor | null, detalhe: string): Promise<Resposta> =>
        ({ ok: false, motivo, segundos, detalhe, uso: await deps.gravarUso({ tenant_id: p.tenant_id, duration_seconds: segundos, provider, status }) })

    if (p.segundos_declarados !== null && p.segundos_declarados > LIMITE_DE_SEGUNDOS) return recusa('longo', 'bloqueado_duracao', p.segundos_declarados, null, 'declarado')

    const teto = await deps.teto(p.tenant_id)
    if (teto !== 'sem_migracao' && teto.ligado && teto.minutosDoMes !== null && teto.segundosUsadosNoMes >= teto.minutosDoMes * 60) {
        return recusa('teto', 'bloqueado_teto', p.segundos_declarados, null, `usados=${Math.round(teto.segundosUsadosNoMes)}s teto=${teto.minutosDoMes}min`)
    }

    const tentativas: string[] = []
    let feito: { texto: string; segundos: number | null; provider: Provedor } | null = null
    let ultimo: Provedor | null = null
    const groq = deps.env('GROQ_API_KEY')
    if (groq) {
        ultimo = 'groq'
        for (let k = 0; k <= ESPERAS_ENTRE_TENTATIVAS_MS.length && !feito; k++) {
            if (k > 0) await deps.esperar(ESPERAS_ENTRE_TENTATIVAS_MS[k - 1])
            const t = await chamar(deps, URL_DA_GROQ, groq, MODELO_DA_GROQ, true, p)
            if ('detalhe' in t) { tentativas.push(`groq:${t.detalhe}`); if (!t.repetir) break }
            else feito = { texto: t.texto, segundos: t.segundos, provider: 'groq' }
        }
    } else tentativas.push('groq:sem_chave')
    const openai = deps.env('OPENAI_API_KEY')
    if (!feito && openai) {
        ultimo = 'openai'
        const t = await chamar(deps, URL_DA_OPENAI, openai, MODELO_DA_OPENAI, false, p)
        if ('detalhe' in t) tentativas.push(`openai:${t.detalhe}`)
        else feito = { texto: t.texto, segundos: t.segundos, provider: 'openai' }
    } else if (!feito) tentativas.push('openai:sem_chave')

    if (!feito) return recusa('falhou', 'falha', p.segundos_declarados, ultimo, tentativas.join(','))
    const segundos = feito.segundos ?? p.segundos_declarados
    // a duração MEDIDA pelo provedor acima do limite: o texto é descartado — o limite vale para o áudio, não para o que foi declarado
    if (segundos !== null && segundos > LIMITE_DE_SEGUNDOS) return recusa('longo', 'bloqueado_duracao', segundos, feito.provider, 'medido')
    const uso = await deps.gravarUso({ tenant_id: p.tenant_id, duration_seconds: segundos, provider: feito.provider, status: 'ok' })
    return { ok: true, texto: feito.texto, provider: feito.provider, segundos, uso }
}
