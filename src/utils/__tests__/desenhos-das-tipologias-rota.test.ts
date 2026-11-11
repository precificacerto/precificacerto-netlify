/**
 * @jest-environment node
 *
 * PORTÃO — A ROTA QUE ASSINA O LOTE DE DESENHOS (dono do produto, 11/11/2026): só super admin; o que já está na pasta do grupo NÃO é
 * assinado (a retomada, e o "não duplica"); o nome que não serve é recusado e nomeado; a lista da pasta que falha não assina nada; e
 * a rota NUNCA apaga.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>
const estado = {
    superAdmin: true,
    naPasta: [] as Array<{ name: string; id: string | null }>,
    listadas: [] as Array<{ pasta: string; offset: number }>,
    assinados: [] as string[],
    removidos: [] as string[],
    falhaNaLista: false,
}
jest.mock('@/lib/get-caller-tenant', () => ({
    requireSuperAdmin: async (_q: unknown, res: { status: (n: number) => { json: (c: unknown) => void } }) => {
        if (!estado.superAdmin) { res.status(403).json({ error: 'Acesso restrito' }); return null }
        return { user_id: 'u-1' }
    },
}))
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: () => { throw new Error('a rota dos desenhos não lê nem escreve tabela') },
        storage: {
            from: () => ({
                list: async (pasta: string, o: { limit: number; offset: number }): Promise<Linha> => {
                    estado.listadas.push({ pasta, offset: o.offset })
                    if (estado.falhaNaLista) return { data: null, error: { message: 'storage fora' } }
                    return { data: estado.naPasta.slice(o.offset, o.offset + o.limit), error: null }
                },
                createSignedUploadUrl: async (caminho: string): Promise<Linha> => { estado.assinados.push(caminho); return { data: { signedUrl: `https://s/${caminho}?t`, path: caminho }, error: null } },
                remove: async (c: string[]): Promise<Linha> => { estado.removidos.push(...c); return { data: [], error: null } },
            }),
        },
    },
}))
/* eslint-disable @typescript-eslint/no-require-imports */
const rota = () => require('@/pages/api/super-admin/atendimentos-ia/desenhos/url-de-envio').default
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(metodo: string, body?: unknown) {
    const saida = { status: 0, corpo: null as unknown as { existentes: string[]; assinados: Array<{ path: string }>; recusados: Array<{ arquivo: string; motivo: string }> } }
    const res = { status(n: number) { saida.status = n; return res }, json(c: unknown) { saida.corpo = c as typeof saida.corpo; return res } } as unknown as NextApiResponse
    await rota()({ method: metodo, body, query: {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}
let silencio: jest.SpyInstance
beforeEach(() => {
    Object.assign(estado, { superAdmin: true, naPasta: [], listadas: [], assinados: [], removidos: [], falhaNaLista: false })
    silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => silencio.mockRestore())

it('assina só o que NÃO está na pasta do grupo; o que está volta como existente, sem assinatura; nada é apagado', async () => {
    estado.naPasta = [{ name: 'ESQ_1.jpg', id: 'o1' }, { name: 'sub', id: null }]
    const r = await chamar('POST', { grupo: 'aluminio', arquivos: ['ESQ_1.jpg', 'ESQ_2.jpg', 'sub'] })
    expect(r.status).toBe(200)
    expect(r.corpo.existentes).toEqual(['ESQ_1.jpg'])
    expect(r.corpo.assinados.map((a: { path: string }) => a.path)).toEqual(['tipologias/aluminio/ESQ_2.jpg'])
    // a subpasta (id nulo) não é objeto: "sub" não é tratado como existente — e não é imagem, então é recusado e nomeado
    expect(r.corpo.recusados).toEqual([{ arquivo: 'sub', motivo: expect.stringContaining('não é uma imagem') }])
    expect(estado.listadas[0].pasta).toBe('tipologias/aluminio')
    expect(estado.assinados).toEqual(['tipologias/aluminio/ESQ_2.jpg'])
    expect(estado.removidos).toEqual([])
})

it('a SUBPASTA (id nulo) não é objeto: um nome igual ao de uma subpasta é assinado, não tratado como existente', async () => {
    estado.naPasta = [{ name: 'ESQ_3.jpg', id: null }]
    const r = await chamar('POST', { grupo: 'aluminio', arquivos: ['ESQ_3.jpg'] })
    expect(r.corpo.existentes).toEqual([])
    expect(estado.assinados).toEqual(['tipologias/aluminio/ESQ_3.jpg'])
})

it('a lista da pasta lê TODAS as páginas: o existente da segunda página de 1000 não é assinado de novo', async () => {
    estado.naPasta = Array.from({ length: 1001 }, (_, i) => ({ name: `E_${i}.jpg`, id: `o${i}` }))
    const r = await chamar('POST', { grupo: 'aluminio', arquivos: ['E_1000.jpg', 'NOVO.jpg'] })
    expect(estado.listadas.map((l) => l.offset)).toEqual([0, 1000])
    expect(r.corpo.existentes).toEqual(['E_1000.jpg'])
    expect(estado.assinados).toEqual(['tipologias/aluminio/NOVO.jpg'])
})

it('a lista da pasta que falha: 500 e NADA assinado — sem saber o que existe, nada se assina', async () => {
    estado.falhaNaLista = true
    const r = await chamar('POST', { grupo: 'aluminio', arquivos: ['ESQ_2.jpg'] })
    expect(r.status).toBe(500)
    expect(estado.assinados).toEqual([])
})

it('o pedido fora da forma é 400; o método errado é 405; quem não é super admin não passa', async () => {
    expect((await chamar('POST', { grupo: 'Alumínio', arquivos: ['a.jpg'] })).status).toBe(400)
    expect((await chamar('GET')).status).toBe(405)
    estado.superAdmin = false
    expect((await chamar('POST', { grupo: 'aluminio', arquivos: ['a.jpg'] })).status).toBe(403)
    expect(estado.assinados).toEqual([])
})

export {}
