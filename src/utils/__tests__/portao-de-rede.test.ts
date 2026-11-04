/**
 * @jest-environment node
 *
 * PORTÃO DE REDE DOS TESTES (`scripts/jest/portao-de-rede.js`, ligado em `jest.setup.js`):
 * nenhum teste abre conexão fora do loopback. O que sai é bloqueado e anotado; o `afterEach` do
 * setup falha o teste que tentou (dono do produto, 04/11/2026).
 *
 * Os testes daqui tentam sair de propósito, e COLHEM a anotação antes do `afterEach` do setup —
 * senão o próprio portão os derrubaria.
 */
import net from 'net'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const portao = require('../../../scripts/jest/portao-de-rede') as {
    instalar: () => void
    zerar: () => void
    colher: () => { host: string; port: number | null; pilha: string }[]
    mensagem: (v: { host: string; port: number | null; pilha: string }[], nome: string) => string
    destinoDe: (args: unknown[]) => { host: string; port: number | null } | null
    LOOPBACK: Set<string>
}

type ErroDoFetch = Error & { cause?: { code?: string } }

const erroDoSocket = (abrir: () => net.Socket) =>
    new Promise<NodeJS.ErrnoException>((resolve) => {
        const s = abrir()
        s.on('error', (e) => resolve(e as NodeJS.ErrnoException))
        s.on('connect', () => { s.destroy(); resolve(Object.assign(new Error('CONECTOU'), { code: 'CONECTOU' })) })
    })

describe('o destino da chamada', () => {
    it('fora do loopback é anotado, nas três assinaturas de connect', () => {
        expect(portao.destinoDe([{ host: 'usapi.adabtech.shop', port: 443 }])).toEqual({ host: 'usapi.adabtech.shop', port: 443 })
        expect(portao.destinoDe([443, 'usapi.adabtech.shop'])).toEqual({ host: 'usapi.adabtech.shop', port: 443 })
        expect(portao.destinoDe([{ port: 5432, host: 'db.supabase.co' }])).toEqual({ host: 'db.supabase.co', port: 5432 })
        // `net.connect(...)` normaliza e passa `[opcoes, callback]` ao `socket.connect`
        expect(portao.destinoDe([[{ host: 'db.supabase.co', port: 5432 }, null]])).toEqual({ host: 'db.supabase.co', port: 5432 })
    })

    it('loopback e socket unix são locais e passam', () => {
        for (const host of ['127.0.0.1', '::1', 'localhost']) expect(portao.destinoDe([{ host, port: 54329 }])).toBeNull()
        expect(portao.destinoDe([{ port: 54329 }])).toBeNull() // sem host = localhost
        expect(portao.destinoDe([54329])).toBeNull()
        expect(portao.destinoDe([{ path: '/tmp/harness-pg/.s.PGSQL.54329' }])).toBeNull()
        expect(portao.destinoDe(['/tmp/x.sock'])).toBeNull()
    })
})

describe('o portão instalado', () => {
    it('bloqueia a conexão fora do loopback com erro nomeado, sem sair, e anota o destino', async () => {
        portao.zerar()
        const erro = await erroDoSocket(() => net.connect({ host: 'exemplo-que-nao-existe.invalid', port: 443 }))
        expect(erro.code).toBe('PORTAO_DE_REDE')
        expect(erro.message).toContain('exemplo-que-nao-existe.invalid:443')
        const anotadas = portao.colher()
        expect(anotadas).toHaveLength(1)
        expect(anotadas[0]).toMatchObject({ host: 'exemplo-que-nao-existe.invalid', port: 443 })
        expect(anotadas[0].pilha).toContain('portao-de-rede.test.ts')
        expect(portao.colher()).toHaveLength(0) // colher esquece
    })

    it('o fetch do Node (undici) para fora é recusado e anotado — o caso do WUZAPI', async () => {
        portao.zerar()
        const erro = await fetch('https://exemplo-que-nao-existe.invalid/session/status').then((): null => null, (e: unknown): ErroDoFetch => e as ErroDoFetch)
        expect(erro?.message).toBe('fetch failed')
        expect(erro?.cause?.code).toBe('PORTAO_DE_REDE') // a causa é o erro do portão, não um ENOTFOUND da rede
        const anotadas = portao.colher()
        expect(anotadas.length).toBeGreaterThanOrEqual(1)
        expect(anotadas.every((a) => a.host === 'exemplo-que-nao-existe.invalid' && a.port === 443)).toBe(true)
    })

    it('deixa passar o loopback: a conexão chega ao sistema (recusada pela porta fechada, não pelo portão)', async () => {
        portao.zerar()
        const erro = await erroDoSocket(() => net.connect({ host: '127.0.0.1', port: 1 }))
        expect(erro.code).not.toBe('PORTAO_DE_REDE')
        expect(portao.colher()).toHaveLength(0)
    })

    it('instalar() de novo não embrulha duas vezes: uma tentativa, uma anotação', async () => {
        portao.instalar()
        portao.instalar()
        portao.zerar()
        await erroDoSocket(() => net.connect({ host: 'exemplo-que-nao-existe.invalid', port: 80 }))
        expect(portao.colher()).toHaveLength(1)
    })
})

describe('a mensagem que derruba o teste', () => {
    it('diz o teste, quantas tentativas, o destino e a pilha, e manda simular', () => {
        const m = portao.mensagem([{ host: 'usapi.adabtech.shop', port: 443, pilha: 'at estadoDaSessao (orcamentista-da-empresa.ts:244)' }], 'vendedor que vê Conectividade')
        expect(m).toContain('"vendedor que vê Conectividade"')
        expect(m).toContain('1 conexão(ões)')
        expect(m).toContain('usapi.adabtech.shop:443')
        expect(m).toContain('orcamentista-da-empresa.ts:244')
        expect(m).toContain('simule o fetch')
    })
})
