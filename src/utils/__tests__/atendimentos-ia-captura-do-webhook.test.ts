/**
 * @jest-environment node
 *
 * PORTÃO — a rota TEMPORÁRIA de captura do webhook do WUZAPI (`/api/atendimentos-ia/captura`).
 * A rota existe para descobrir o formato do corpo, e sai depois da captura; este portão sai com ela.
 *
 *   (1) método diferente de POST → 405;
 *   (2) fora de produção → 503, e NADA anotado;
 *   (3) sem segredo, ou segredo errado → 401, e NADA anotado — nem o corpo, nem o IP;
 *   (4) segredo certo → 200 com corpo vazio, e UMA linha de log com o content-type, o tamanho real
 *       e o corpo;
 *   (5) o MASCARAMENTO: sequência de 8+ dígitos vira 4 primeiros + x + 2 últimos; o número
 *       completo NÃO aparece no log. E o token da instância também não — é credencial;
 *   (6) o corpo maior que 8 KB: anota o tamanho REAL e só os primeiros 8 KB.
 *
 * "Nada anotado" é medido em TODOS os canais do console, não só no que a rota usa.
 */
import { Readable } from 'stream'
import type { NextApiRequest, NextApiResponse } from 'next'

import rota, { mascarar, PREFIXO_DO_LOG } from '@/pages/api/atendimentos-ia/captura'

const SEGREDO = 'segredo-de-teste-com-tamanho-razoavel'
const TELEFONE = '5551999887766'
const TOKEN_DA_INSTANCIA = 'a1b2c3d4e5f6tokendainstancia_lzq8'

type Saida = { status: number; corpo: unknown; fim: boolean }

async function chamar(opcoes: { metodo?: string; s?: string | undefined; corpo?: string; contentType?: string; pedacos?: string[] }): Promise<Saida> {
    const pedacos = (opcoes.pedacos ?? [opcoes.corpo ?? '']).map((p) => Buffer.from(p))
    const req = Readable.from(pedacos) as unknown as NextApiRequest
    Object.assign(req, {
        method: opcoes.metodo ?? 'POST',
        query: opcoes.s === undefined ? {} : { s: opcoes.s },
        headers: { 'content-type': opcoes.contentType ?? 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.7' },
    })
    const saida: Saida = { status: 0, corpo: undefined, fim: false }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: unknown) { saida.corpo = b; saida.fim = true; return res },
        send(b: unknown) { saida.corpo = b; saida.fim = true; return res },
        end(b?: unknown) { saida.corpo = b; saida.fim = true; return res },
        setHeader() { return res },
    } as unknown as NextApiResponse
    await rota(req, res)
    return saida
}

const canais = ['log', 'info', 'warn', 'error', 'debug'] as const
let espioes: jest.SpyInstance[] = []
const anotado = () => espioes.flatMap((e) => e.mock.calls.map((c) => c.map(String).join(' ')))

beforeEach(() => {
    process.env.VERCEL_ENV = 'production'
    process.env.ORCAMENTISTA_WEBHOOK_SEGREDO = SEGREDO
    espioes = canais.map((c) => jest.spyOn(console, c).mockImplementation(() => undefined))
})
afterEach(() => { espioes.forEach((e) => e.mockRestore()); delete process.env.VERCEL_ENV; delete process.env.ORCAMENTISTA_WEBHOOK_SEGREDO })

describe('(1) só POST', () => {
    it.each(['GET', 'PUT', 'DELETE'])('%s → 405, e nada anotado', async (metodo) => {
        const r = await chamar({ metodo, s: SEGREDO })
        expect(r.status).toBe(405)
        expect(anotado()).toEqual([])
    })
})

describe('(2) fora de produção', () => {
    it.each(['preview', 'development', undefined])('VERCEL_ENV = %s → 503 com o motivo, e nada anotado', async (amb) => {
        if (amb === undefined) delete process.env.VERCEL_ENV
        else process.env.VERCEL_ENV = amb
        const r = await chamar({ s: SEGREDO, corpo: `jsonData={"from":"${TELEFONE}"}` })
        expect(r.status).toBe(503)
        expect(JSON.stringify(r.corpo)).toMatch(/produção/)
        expect(anotado()).toEqual([])
    })
})

describe('(3) o segredo', () => {
    it.each([
        ['ausente', undefined],
        ['errado, do mesmo tamanho', SEGREDO.replace(/.$/, 'X')],
        ['errado, de outro tamanho', 'curto'],
        ['vazio', ''],
    ])('%s → 401, e NADA anotado — nem o corpo, nem o IP', async (_nome, s) => {
        const r = await chamar({ s, corpo: `jsonData={"from":"${TELEFONE}"}` })
        expect(r.status).toBe(401)
        expect(anotado()).toEqual([])
    })

    it('sem a variável configurada no servidor, nenhum segredo passa — nem o vazio', async () => {
        delete process.env.ORCAMENTISTA_WEBHOOK_SEGREDO
        expect((await chamar({ s: '' })).status).toBe(401)
        expect((await chamar({ s: 'undefined' })).status).toBe(401)
        expect(anotado()).toEqual([])
    })
})

describe('(4) o segredo certo', () => {
    it('200 com corpo vazio, e UMA linha com o prefixo, o content-type, o tamanho real e o corpo', async () => {
        const corpo = 'jsonData=%7B%22type%22%3A%22Message%22%7D'
        const r = await chamar({ s: SEGREDO, corpo, contentType: 'application/x-www-form-urlencoded' })
        expect(r.status).toBe(200)
        expect(r.fim).toBe(true)
        expect(r.corpo === undefined || r.corpo === '').toBe(true)
        const linhas = anotado()
        expect(linhas).toHaveLength(1)
        expect(linhas[0].startsWith(PREFIXO_DO_LOG)).toBe(true)
        expect(linhas[0]).toContain('application/x-www-form-urlencoded')
        expect(linhas[0]).toContain(`${Buffer.byteLength(corpo)} bytes`)
        expect(linhas[0]).toContain(corpo)
        expect(linhas[0]).not.toContain('203.0.113.7')
    })

    it('o corpo vazio também responde 200 — o WUZAPI reenvia o que não recebe 200', async () => {
        const r = await chamar({ s: SEGREDO, corpo: '' })
        expect(r.status).toBe(200)
    })
})

describe('(5) o mascaramento', () => {
    it('8+ dígitos viram 4 primeiros + x + 2 últimos; o número completo NÃO aparece no log', async () => {
        await chamar({ s: SEGREDO, contentType: 'application/json', corpo: JSON.stringify({ event: { Info: { Sender: `${TELEFONE}@s.whatsapp.net` } } }) })
        const [linha] = anotado()
        expect(linha).toContain(mascarar(TELEFONE))
        expect(mascarar(TELEFONE)).toBe('5551xxxxxxx66')
        expect(linha).not.toContain(TELEFONE)
        expect(linha).toContain('"Sender"')
    })

    it('sequência de 7 dígitos fica como está; a de 8 é mascarada', () => {
        expect(mascarar('a 1234567 b')).toBe('a 1234567 b')
        expect(mascarar('a 12345678 b')).toBe('a 1234xx78 b')
    })

    it('o TOKEN da instância não vai para o log — nem no formato form, nem no json', async () => {
        await chamar({ s: SEGREDO, corpo: `jsonData=%7B%7D&token=${TOKEN_DA_INSTANCIA}` })
        await chamar({ s: SEGREDO, contentType: 'application/json', corpo: JSON.stringify({ type: 'Message', token: TOKEN_DA_INSTANCIA }) })
        const linhas = anotado()
        expect(linhas).toHaveLength(2)
        for (const l of linhas) {
            expect(l).not.toContain(TOKEN_DA_INSTANCIA)
            expect(l).toMatch(/token/)
        }
    })
})

describe('(6) o corpo maior que 8 KB', () => {
    it('anota o tamanho REAL e só os primeiros 8 KB', async () => {
        const corpo = 'A'.repeat(8192) + 'FIM-QUE-NAO-CABE'
        await chamar({ s: SEGREDO, corpo })
        const [linha] = anotado()
        expect(linha).toContain(`${Buffer.byteLength(corpo)} bytes`)
        expect(linha).toContain('A'.repeat(8192))
        expect(linha).not.toContain('FIM-QUE-NAO-CABE')
    })

    it('em VÁRIOS pedaços, como o stream real chega: o corte continua nos 8 KB, e o tamanho é a soma', async () => {
        const pedacos = ['B'.repeat(5000), 'C'.repeat(5000), 'D'.repeat(100)]
        await chamar({ s: SEGREDO, pedacos })
        const [linha] = anotado()
        expect(linha).toContain('10100 bytes')
        expect(linha).toContain('B'.repeat(5000) + 'C'.repeat(3192))
        expect(linha).not.toContain('C'.repeat(3193))
        expect(linha).not.toContain('D')
    })
})

describe('(7) a linha CHEGA AO LOG: sai em console.error (stderr), e em nenhum outro canal', () => {
    // Medido em produção em 21/10/2026: o log da Vercel deste projeto só exibe stderr — as linhas
    // `[QR-ORCAMENTISTA]` em `console.log` não apareceram. As seções acima contam TODOS os canais
    // juntos, e por isso não distinguiam: uma captura em `console.log` passaria nelas e rodaria cega.
    const doCanal = (c: (typeof canais)[number]) =>
        espioes[canais.indexOf(c)].mock.calls.map((a) => a.map(String).join(' ')).filter((l) => l.startsWith(PREFIXO_DO_LOG))
    const dosOutros = () => canais.filter((c) => c !== 'error').flatMap((c) => doCanal(c))

    it('a captura: UMA linha em console.error, nenhuma nos outros', async () => {
        await chamar({ s: SEGREDO, corpo: 'jsonData=%7B%7D' })
        expect(doCanal('error')).toHaveLength(1)
        expect(dosOutros()).toEqual([])
    })

    it('a falha ao ler o corpo: também em console.error, nenhuma nos outros — e ainda 200', async () => {
        async function* quebrado(): AsyncGenerator<Buffer> { yield Buffer.from('a'); throw new Error('conexao caiu') }
        const req = Readable.from(quebrado()) as unknown as NextApiRequest
        Object.assign(req, { method: 'POST', query: { s: SEGREDO }, headers: {} })
        const saida = { status: 0 }
        const res = { status(n: number) { saida.status = n; return res }, end() { return res }, json() { return res } } as unknown as NextApiResponse
        await rota(req, res)
        expect(saida.status).toBe(200)
        expect(doCanal('error')).toEqual([expect.stringContaining('falha ao ler o corpo: conexao caiu')])
        expect(dosOutros()).toEqual([])
    })
})
