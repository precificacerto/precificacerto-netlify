/**
 * PORTÃO — A TRANSCRIÇÃO DO ÁUDIO (tarefa 0018 do bridge, dono do produto, 18/11/2026): o núcleo da Edge Function `transcribe-audio`
 * (`supabase/functions/transcribe-audio/nucleo.ts`, o mesmo arquivo que o Deno roda) e o cliente do servidor (`transcricao-do-audio.ts`).
 * A Groq com até 2 novas tentativas; a OpenAI só com a chave; 3 minutos; a empresa liberada; o teto desligado; o uso gravado, nunca o texto;
 * e a chave nunca na saída.
 */
import { ESPERAS_ENTRE_TENTATIVAS_MS, LIMITE_DE_SEGUNDOS, MODELO_DA_GROQ, MODELO_DA_OPENAI, URL_DA_GROQ, URL_DA_OPENAI, lerPedido, transcrever, type Dependencias, type LinhaDoUso, type Pedido, type Teto } from '../../../supabase/functions/transcribe-audio/nucleo'
import { transcreverAudio } from '@/lib/atendimentos-ia/transcricao-do-audio'

const TENANT = 'a0000000-0000-4000-8000-00000000000a'
const CHAVE_GROQ = 'gsk_chave_de_teste_que_nao_pode_vazar'
const CHAVE_OPENAI = 'sk-chave-openai-de-teste'
const PEDIDO: Pedido = { tenant_id: TENANT, audio_base64: Buffer.from('OggS-audio-de-teste').toString('base64'), mimetype: 'audio/ogg; codecs=opus', segundos_declarados: 12 }

type Resposta = { status: number; corpo?: unknown; rede?: true }
function montar(respostas: { groq?: Resposta[]; openai?: Resposta[] } = {}, sobre: Partial<Omit<Dependencias, 'env'>> & { env?: Record<string, string> } = {}) {
    const chamadas: Array<{ url: string; campos: Record<string, string>; auth: string }> = []
    const esperas: number[] = []
    const usos: LinhaDoUso[] = []
    const filas = { groq: [...(respostas.groq ?? [{ status: 200, corpo: { text: ' quero uma janela de correr de 1200 por 1000 ', duration: 12.4 } }])], openai: [...(respostas.openai ?? [])] }
    const { env: envDoCaso, ...outras } = sobre
    const env: Record<string, string> = envDoCaso ?? { GROQ_API_KEY: CHAVE_GROQ }
    const deps: Dependencias = {
        env: (n) => env[n],
        fetch: async (url, init) => {
            const campos: Record<string, string> = {}
            for (const [k, v] of (init.body as FormData).entries()) campos[k] = typeof v === 'string' ? v : `arquivo:${(v as File).name}`
            chamadas.push({ url, campos, auth: init.headers.Authorization })
            const r = (url === URL_DA_GROQ ? filas.groq : filas.openai).shift() ?? { status: 500 }
            if (r.rede) throw new Error('rede caiu')
            return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo }
        },
        esperar: async (ms) => { esperas.push(ms) },
        empresaLiberada: async () => true,
        teto: async (): Promise<Teto> => ({ ligado: false, minutosDoMes: null, segundosUsadosNoMes: 0 }),
        gravarUso: async (l) => { usos.push(l); return 'ok' },
        ...outras,
    }
    return { deps, chamadas, esperas, usos }
}
const valores = (o: unknown): string[] => (o && typeof o === 'object' ? Object.values(o).flatMap(valores) : [String(o)])

describe('a Groq: o modelo, o idioma, e a resposta', () => {
    it('transcreve: o texto aparado, a duração medida pela Groq, e UMA linha de uso ok — sem o texto', async () => {
        const m = montar()
        const r = await transcrever(PEDIDO, m.deps)
        expect(r).toEqual({ ok: true, texto: 'quero uma janela de correr de 1200 por 1000', provider: 'groq', segundos: 12.4, uso: 'ok' })
        expect(m.chamadas).toHaveLength(1)
        expect(m.chamadas[0]).toEqual({ url: URL_DA_GROQ, auth: `Bearer ${CHAVE_GROQ}`, campos: { file: 'arquivo:audio.ogg', model: MODELO_DA_GROQ, language: 'pt', response_format: 'verbose_json', temperature: '0' } })
        expect(MODELO_DA_GROQ).toBe('whisper-large-v3-turbo')
        expect(m.usos).toEqual([{ tenant_id: TENANT, duration_seconds: 12.4, provider: 'groq', status: 'ok' }])
    })
    it('a chave NUNCA sai: nem na resposta nem no uso', async () => {
        const m = montar({ groq: [{ status: 500 }, { status: 500 }, { status: 500 }] })
        const r = await transcrever(PEDIDO, m.deps)
        for (const v of [...valores(r), ...valores(m.usos)]) expect([v, v.includes(CHAVE_GROQ)]).toEqual([v, false])
    })
})

describe('as novas tentativas e a reserva', () => {
    it('a Groq falha duas vezes (500, rede) e responde na terceira: 3 chamadas, as esperas curtas, e o texto', async () => {
        const m = montar({ groq: [{ status: 500 }, { status: 0, rede: true }, { status: 200, corpo: { text: 'porta de giro', duration: 3 } }] })
        const r = await transcrever(PEDIDO, m.deps)
        expect(r).toEqual(expect.objectContaining({ ok: true, texto: 'porta de giro', provider: 'groq' }))
        expect(m.chamadas.map((c) => c.url)).toEqual([URL_DA_GROQ, URL_DA_GROQ, URL_DA_GROQ])
        expect(m.esperas).toEqual([...ESPERAS_ENTRE_TENTATIVAS_MS])
    })
    it('a Groq falha as três, e a OpenAI AUSENTE: falha controlada, sem chamar a OpenAI, e o uso diz falha da groq', async () => {
        const m = montar({ groq: [{ status: 503 }, { status: 429 }, { status: 502 }] })
        const r = await transcrever(PEDIDO, m.deps)
        expect(r).toEqual({ ok: false, motivo: 'falhou', segundos: 12, detalhe: 'groq:status=503,groq:status=429,groq:status=502,openai:sem_chave', uso: 'ok' })
        expect(m.chamadas.every((c) => c.url === URL_DA_GROQ)).toBe(true)
        expect(m.usos).toEqual([{ tenant_id: TENANT, duration_seconds: 12, provider: 'groq', status: 'falha' }])
    })
    it('a Groq falha as três, e a OpenAI EXISTE: a reserva transcreve, com o modelo dela', async () => {
        const m = montar({ groq: [{ status: 500 }, { status: 500 }, { status: 500 }], openai: [{ status: 200, corpo: { text: 'maxim-ar 600 por 600' } }] }, { env: { GROQ_API_KEY: CHAVE_GROQ, OPENAI_API_KEY: CHAVE_OPENAI } })
        const r = await transcrever(PEDIDO, m.deps)
        expect(r).toEqual({ ok: true, texto: 'maxim-ar 600 por 600', provider: 'openai', segundos: 12, uso: 'ok' })
        expect(m.chamadas[3]).toEqual(expect.objectContaining({ url: URL_DA_OPENAI, auth: `Bearer ${CHAVE_OPENAI}`, campos: expect.objectContaining({ model: MODELO_DA_OPENAI, language: 'pt', response_format: 'json' }) }))
        expect(MODELO_DA_OPENAI).toBe('gpt-4o-mini-transcribe')
        expect(m.usos).toEqual([{ tenant_id: TENANT, duration_seconds: 12, provider: 'openai', status: 'ok' }])
    })
    it('o 400 da Groq não se repete (o mesmo áudio dá o mesmo erro): uma chamada só', async () => {
        const m = montar({ groq: [{ status: 400 }] })
        const r = await transcrever(PEDIDO, m.deps)
        expect(r).toEqual(expect.objectContaining({ ok: false, motivo: 'falhou', detalhe: 'groq:status=400,openai:sem_chave' }))
        expect(m.chamadas).toHaveLength(1)
        expect(m.esperas).toEqual([])
    })
    it('a resposta sem texto (silêncio) é falha, não texto vazio', async () => {
        const m = montar({ groq: [{ status: 200, corpo: { text: '   ', duration: 2 } }] })
        expect(await transcrever(PEDIDO, m.deps)).toEqual(expect.objectContaining({ ok: false, motivo: 'falhou', detalhe: 'groq:sem_texto,openai:sem_chave' }))
    })
    it('sem a GROQ_API_KEY: não chama a Groq, e vai à reserva (ausente: falha controlada)', async () => {
        const m = montar({}, { env: {} })
        expect(await transcrever(PEDIDO, m.deps)).toEqual(expect.objectContaining({ ok: false, motivo: 'falhou', detalhe: 'groq:sem_chave,openai:sem_chave' }))
        expect(m.chamadas).toEqual([])
    })
})

describe('os 3 minutos', () => {
    it('a duração DECLARADA acima de 3 min: não transcreve, não chama ninguém, e o uso diz bloqueado_duracao', async () => {
        const m = montar()
        const r = await transcrever({ ...PEDIDO, segundos_declarados: LIMITE_DE_SEGUNDOS + 1 }, m.deps)
        expect(r).toEqual({ ok: false, motivo: 'longo', segundos: 181, detalhe: 'declarado', uso: 'ok' })
        expect(m.chamadas).toEqual([])
        expect(m.usos).toEqual([{ tenant_id: TENANT, duration_seconds: 181, provider: null, status: 'bloqueado_duracao' }])
    })
    it('exatamente 3 min transcreve', async () => {
        const m = montar({ groq: [{ status: 200, corpo: { text: 'ok', duration: 180 } }] })
        expect(await transcrever({ ...PEDIDO, segundos_declarados: 180 }, m.deps)).toEqual(expect.objectContaining({ ok: true, segundos: 180 }))
    })
    it('a duração MEDIDA pela Groq acima de 3 min (a declarada mentiu ou faltou): o texto é descartado', async () => {
        const m = montar({ groq: [{ status: 200, corpo: { text: 'texto longo', duration: 200.5 } }] })
        const r = await transcrever({ ...PEDIDO, segundos_declarados: null }, m.deps)
        expect(r).toEqual({ ok: false, motivo: 'longo', segundos: 200.5, detalhe: 'medido', uso: 'ok' })
        expect(m.usos).toEqual([{ tenant_id: TENANT, duration_seconds: 200.5, provider: 'groq', status: 'bloqueado_duracao' }])
    })
})

describe('quem tem direito e o teto', () => {
    it('a empresa NÃO liberada no super admin: nada é transcrito nem gravado', async () => {
        const m = montar({}, { empresaLiberada: async () => false })
        expect(await transcrever(PEDIDO, m.deps)).toEqual({ ok: false, motivo: 'nao_liberada', segundos: null, detalhe: 'orcamentista_config.ativo', uso: 'nao_gravado' })
        expect([m.chamadas, m.usos]).toEqual([[], []])
    })
    it('o teto DESLIGADO (como nasce): não bloqueia, por mais minutos que a empresa tenha usado', async () => {
        const m = montar({}, { teto: async () => ({ ligado: false, minutosDoMes: 1, segundosUsadosNoMes: 99_999 }) })
        expect(await transcrever(PEDIDO, m.deps)).toEqual(expect.objectContaining({ ok: true }))
    })
    it('o teto LIGADO e atingido: bloqueia sem chamar ninguém, e o uso diz bloqueado_teto', async () => {
        const m = montar({}, { teto: async () => ({ ligado: true, minutosDoMes: 10, segundosUsadosNoMes: 600 }) })
        expect(await transcrever(PEDIDO, m.deps)).toEqual(expect.objectContaining({ ok: false, motivo: 'teto' }))
        expect(m.chamadas).toEqual([])
        expect(m.usos).toEqual([{ tenant_id: TENANT, duration_seconds: 12, provider: null, status: 'bloqueado_teto' }])
    })
    it('o teto ligado e NÃO atingido: transcreve', async () => {
        const m = montar({}, { teto: async () => ({ ligado: true, minutosDoMes: 10, segundosUsadosNoMes: 599 }) })
        expect(await transcrever(PEDIDO, m.deps)).toEqual(expect.objectContaining({ ok: true }))
    })
    it('sem a migração (as tabelas ausentes): o teto não existe, e a transcrição segue — o uso diz sem_migracao', async () => {
        const m = montar({}, { teto: async () => 'sem_migracao', gravarUso: async () => 'sem_migracao' })
        expect(await transcrever(PEDIDO, m.deps)).toEqual(expect.objectContaining({ ok: true, uso: 'sem_migracao' }))
    })
})

describe('o pedido', () => {
    it.each([
        [null, 'corpo ausente'], [{ tenant_id: 'x', audio_base64: 'QQ==' }, 'tenant_id inválido'], [{ tenant_id: TENANT, audio_base64: '' }, 'audio_base64 ausente'],
        [{ tenant_id: TENANT, audio_base64: 'não é base64!' }, 'audio_base64 não é base64'],
    ])('%j → %s', (corpo, erro) => expect(lerPedido(corpo)).toEqual({ erro }))
    it('o válido: a duração que não é número vira nula (ausente não é zero)', () => {
        expect(lerPedido({ tenant_id: TENANT, audio_base64: 'QQ==', mimetype: 'audio/ogg', segundos_declarados: 'dez' })).toEqual({ tenant_id: TENANT, audio_base64: 'QQ==', mimetype: 'audio/ogg', segundos_declarados: null })
    })
})

describe('o cliente do servidor: a chamada à função e o motivo nomeado', () => {
    const chamar = (resposta: { status: number; corpo: unknown } | 'rede') => {
        const pedidos: Array<{ url: string; init: RequestInit }> = []
        const fetch = (async (url: string, init: RequestInit) => {
            pedidos.push({ url, init })
            if (resposta === 'rede') throw new Error('rede')
            return { status: resposta.status, json: async () => resposta.corpo }
        }) as unknown as typeof globalThis.fetch
        return { pedidos, r: transcreverAudio(TENANT, new Uint8Array([79, 103, 103, 83]), 'audio/ogg', 12, { url: 'https://projeto.supabase.co/', chave: 'chave-do-servidor', fetch }) }
    }
    it('o pedido: a URL da função, o service_role no Authorization, e o áudio em base64', async () => {
        const { pedidos, r } = chamar({ status: 200, corpo: { ok: true, texto: 'janela', provider: 'groq', segundos: 12, uso: 'ok' } })
        expect(await r).toEqual({ ok: true, texto: 'janela', provider: 'groq', segundos: 12, uso: 'ok' })
        expect(pedidos[0].url).toBe('https://projeto.supabase.co/functions/v1/transcribe-audio')
        expect((pedidos[0].init.headers as Record<string, string>).Authorization).toBe('Bearer chave-do-servidor')
        expect(JSON.parse(String(pedidos[0].init.body))).toEqual({ tenant_id: TENANT, audio_base64: 'T2dnUw==', mimetype: 'audio/ogg', segundos_declarados: 12 })
    })
    it.each([
        ['longo', 'audio_longo'], ['nao_liberada', 'audio_nao_liberado'], ['teto', 'audio_teto'], ['falhou', 'audio_nao_transcrito'], ['pedido_invalido', 'audio_nao_transcrito'],
    ])('o motivo %s da função vira %s', async (motivo, esperado) => {
        const { r } = chamar({ status: 200, corpo: { ok: false, motivo, segundos: 190 } })
        expect(await r).toEqual(expect.objectContaining({ ok: false, motivo: esperado, segundos: 190 }))
    })
    it('a função fora do ar, ou o corpo que não é dela: a transcrição não feita, nomeada', async () => {
        expect(await chamar('rede').r).toEqual({ ok: false, motivo: 'audio_nao_transcrito', segundos: 12, detalhe: 'excecao' })
        expect(await chamar({ status: 401, corpo: { msg: 'Invalid JWT' } }).r).toEqual({ ok: false, motivo: 'audio_nao_transcrito', segundos: 12, detalhe: 'status=401' })
    })
    it('sem a configuração do Supabase no servidor: nada é chamado', async () => {
        expect(await transcreverAudio(TENANT, new Uint8Array([1]), null, null, { url: '', chave: '' })).toEqual({ ok: false, motivo: 'audio_nao_transcrito', segundos: null, detalhe: 'sem_configuracao' })
    })
})
