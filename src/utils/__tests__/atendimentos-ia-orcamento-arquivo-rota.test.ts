/**
 * @jest-environment node
 *
 * PORTÃO — a rota do ARQUIVO do orçamento I.A. (pedido 0051, 27/11/2026): GET lê o último PDF (`?download=1` baixa) no tenant do chamador; POST o REGERA —
 * com `modo: "precificar"` forma o preço como o agente (sem envio) e grava o arquivo; sem o modo, regera com os números já gravados. Permissão: ver no
 * GET, editar no POST. O preço que falta volta como 422 nomeado.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

const T = 'tenant-da-conta'
const ID = '9fb963ac-f9a3-469b-8af7-4668f6a0cb2f'
const estado = { nivel: [] as string[], lidos: [] as Array<[string, string]>, precificados: [] as Array<[string, string]>, regerados: [] as Array<[string, string]>,
    arquivo: { pdf: Buffer.from('%PDF') } as { pdf: Buffer } | null, preco: { gravado: { arquivo: { nomeDoArquivo: 'o.pdf' }, recusasDoArquivo: [] as string[] } } as unknown, regera: {} as unknown }
jest.mock('@/lib/atendimentos-ia/orcamentista-da-empresa', () => ({
    MODULO_DO_ORCAMENTISTA: 'orcamentista',
    chamadorDoOrcamentista: async (_r: unknown, _s: unknown, nivel: string) => { estado.nivel.push(nivel); return { tenant_id: T } },
}))
jest.mock('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor', () => ({ lerUltimoArquivo: async (t: string, id: string) => { estado.lidos.push([t, id]); return estado.arquivo } }))
jest.mock('@/lib/atendimentos-ia/preco-do-orcamento-servidor', () => ({ precificarComoAgente: async (t: string, id: string) => { estado.precificados.push([t, id]); return estado.preco } }))
jest.mock('@/lib/atendimentos-ia/orcamento-precificado', () => ({ regerarOArquivo: async (t: string, id: string) => { estado.regerados.push([t, id]); return estado.regera } }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/atendimentos-ia/orcamentos/[id]/arquivo').default

async function chamar(method: string, query: Record<string, string>, body?: unknown) {
    const saida = { status: 0, corpo: undefined as unknown, cabecalhos: {} as Record<string, string> }
    const res = { status(n: number) { saida.status = n; return res }, json(b: unknown) { saida.corpo = b; return res }, send(b: unknown) { saida.corpo = b; return res }, setHeader(k: string, v: string) { saida.cabecalhos[k] = v } }
    await rota({ method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return saida
}
beforeEach(() => { Object.assign(estado, { nivel: [], lidos: [], precificados: [], regerados: [], arquivo: { pdf: Buffer.from('%PDF') }, regera: {}, preco: { gravado: { arquivo: { nomeDoArquivo: 'o.pdf' }, recusasDoArquivo: [] } } }) })

describe('GET', () => {
    it('o último arquivo, no tenant do chamador, com permissão de ver; mostra por padrão e baixa com ?download=1', async () => {
        const a = await chamar('GET', { id: ID })
        expect(a.status).toBe(200)
        expect(estado.lidos).toEqual([[T, ID]])
        expect(estado.nivel).toEqual(['ver'])
        expect(a.cabecalhos['Content-Disposition']).toMatch(/^inline;/)
        expect(a.cabecalhos['Cache-Control']).toBe('no-store')
        expect((await chamar('GET', { id: ID, download: '1' })).cabecalhos['Content-Disposition']).toMatch(/^attachment;/)
    })
    it('sem arquivo: 404 dizendo isso; id que não é uuid: 404 sem ler nada', async () => {
        estado.arquivo = null
        expect((await chamar('GET', { id: ID })).status).toBe(404)
        estado.lidos = []
        expect((await chamar('GET', { id: 'x' })).status).toBe(404)
        expect(estado.lidos).toEqual([])
    })
})

describe('POST — o arquivo regerado (0051)', () => {
    it('modo "precificar": forma o preço como o agente, no tenant do chamador, com permissão de EDITAR', async () => {
        const r = await chamar('POST', { id: ID }, { modo: 'precificar' })
        expect(r).toMatchObject({ status: 200, corpo: { ok: true } })
        expect(estado.precificados).toEqual([[T, ID]])
        expect(estado.regerados).toEqual([])
        expect(estado.nivel).toEqual(['editar'])
    })
    it('o preço que falta: 422 com as faltas nomeadas, e nada de arquivo', async () => {
        estado.preco = { faltas: ['falta o preço do código 1023'], orcamento: { numero: 14, nome: 'X' } }
        const r = await chamar('POST', { id: ID }, { modo: 'precificar' })
        expect(r.status).toBe(422)
        expect(r.corpo).toMatchObject({ recusas: ['falta o preço do código 1023'] })
    })
    it('o preço salvo e o arquivo que não saiu: 422 com a recusa do arquivo', async () => {
        estado.preco = { gravado: { arquivo: null, recusasDoArquivo: ['sem figura'] } }
        const r = await chamar('POST', { id: ID }, { modo: 'precificar' })
        expect(r.status).toBe(422)
        expect(r.corpo).toMatchObject({ recusas: ['sem figura'] })
    })
    it('sem o modo: regera com os números já gravados, sem precificar de novo; a recusa volta nomeada', async () => {
        expect((await chamar('POST', { id: ID }, {})).status).toBe(200)
        expect(estado.regerados).toEqual([[T, ID]])
        expect(estado.precificados).toEqual([])
        estado.regera = { recusas: ['sem a venda gravada'] }
        const r = await chamar('POST', { id: ID }, undefined)
        expect(r.status).toBe(422)
        expect(r.corpo).toMatchObject({ recusas: ['sem a venda gravada'] })
    })
    it('outro método: 405', async () => {
        expect((await chamar('DELETE', { id: ID })).status).toBe(405)
    })
})
