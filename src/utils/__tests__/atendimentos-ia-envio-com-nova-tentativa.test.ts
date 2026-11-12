/**
 * @jest-environment jsdom
 *
 * A NOVA TENTATIVA DO ENVIO AO STORAGE (dono do produto, 12/11/2026): um 520 do Cloudflare na frente do Storage derrubava o salvar com
 * "o envio falhou (520)". A falha de TRANSPORTE se repete, na MESMA URL assinada (o caminho é fixo por envio); o "já existe" numa repetição é
 * a tentativa anterior que chegou; um 4xx não se repete.
 */
import { ESPERA_DO_ENVIO_MS, TENTATIVAS_DO_ENVIO, enviarComNovaTentativa, falhaDeTransporte, fraseDoEnvioQueNaoChegou } from '@/page-parts/atendimentos-ia/api'

const URL_ASSINADA = 'https://storage/upload/sign/x?token=t'
const ARQUIVO = new File(['bytes'], 'Reforco.xlsx')
type Resposta = { status: number; corpo?: unknown } | 'rede'
let fila: Resposta[] = []
const urls: string[] = []
const esperas: number[] = []
const esperar = async (ms: number) => { esperas.push(ms) }
beforeEach(() => {
    fila = []
    urls.length = 0
    esperas.length = 0
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
        urls.push(url)
        const r = fila.shift() ?? { status: 200 }
        if (r === 'rede') throw new TypeError('Failed to fetch')
        const corpo = r.corpo ?? {}
        const res = { ok: r.status < 400, status: r.status, json: async () => corpo, clone: () => res }
        return res as unknown as Response
    })
})

describe('a nova tentativa do envio', () => {
    it('520 e depois 200: chegou, com UMA espera, e as duas tentativas na MESMA URL (o caminho é fixo por envio)', async () => {
        fila = [{ status: 520 }, { status: 200 }]
        expect(await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar)).toBeNull()
        expect(urls).toEqual([URL_ASSINADA, URL_ASSINADA])
        expect(esperas).toEqual([ESPERA_DO_ENVIO_MS[0]])
    })

    it('falha de rede (o fetch que lança) também se repete', async () => {
        fila = ['rede', { status: 200 }]
        expect(await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar)).toBeNull()
        expect(urls).toHaveLength(2)
    })

    it('a tentativa que chegou e perdeu a resposta: a seguinte recebe "já existe" (409, ou 400 com statusCode 409 / Duplicate) — conta como enviado', async () => {
        for (const ja of [{ status: 409 }, { status: 400, corpo: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } }, { status: 400, corpo: { error: 'Duplicate' } }]) {
            fila = [{ status: 522 }, ja]
            expect(await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar)).toBeNull()
        }
    })

    it('"já existe" NA PRIMEIRA tentativa não é sucesso: o caminho é novo, e um objeto lá é de outro envio', async () => {
        fila = [{ status: 409 }]
        expect(await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar)).toEqual({ status: 409, frase: 'o envio falhou (409).' })
        expect(urls).toHaveLength(1)
    })

    it('um 4xx que não é "já existe" NÃO se repete (assinatura vencida, arquivo grande demais): a frase de sempre', async () => {
        fila = [{ status: 403 }]
        expect(await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar)).toEqual({ status: 403, frase: 'o envio falhou (403).' })
        expect(urls).toHaveLength(1)
        fila = [{ status: 520 }, { status: 400, corpo: { statusCode: '413', error: 'Payload too large' } }]
        expect(await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar)).toEqual({ status: 400, frase: 'o envio falhou (400).' })
    })

    it('esgotadas as tentativas: a frase diz que é transporte, quantas foram e o último status — e as esperas crescem', async () => {
        fila = [{ status: 520 }, { status: 503 }, { status: 524 }]
        const r = await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar)
        expect(r).toEqual({ status: 524, frase: fraseDoEnvioQueNaoChegou(524, TENTATIVAS_DO_ENVIO) })
        expect(r!.frase).toContain('3 tentativas (524)')
        expect(r!.frase).toContain('falha de transporte')
        expect(urls).toHaveLength(TENTATIVAS_DO_ENVIO)
        expect(esperas).toEqual([1000, 3000])
    })

    it('esgotadas por falha de rede: a frase diz "falha de rede", não um status inventado', async () => {
        fila = ['rede', 'rede', 'rede']
        expect((await enviarComNovaTentativa(URL_ASSINADA, ARQUIVO, esperar))!.frase).toContain('(falha de rede)')
    })

    it('o que é transporte: 502, 503, 504 e 520 a 524 — e só eles', () => {
        expect([502, 503, 504, 520, 521, 522, 523, 524].every(falhaDeTransporte)).toBe(true)
        expect([400, 401, 403, 404, 409, 413, 500, 501, 525].some(falhaDeTransporte)).toBe(false)
    })
})
