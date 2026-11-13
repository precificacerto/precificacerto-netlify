/**
 * @jest-environment node
 *
 * PORTÃO — A IMPORTAÇÃO DO ÍNDICE E A CONFERÊNCIA COM O STORAGE (dono do produto, 11/11/2026): o sha256 é o dos bytes recebidos, calculado
 * no servidor; a linha que não serve recusa tudo, nomeada; a permissão de encolher vai à função como veio; a recusa da função chega com a
 * frase dela; sem a migração, 409 nomeando-a; e a conferência lê TODAS as páginas dos dois lados e nomeia o que falta de cada lado.
 */
import { createHash } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { COLUNAS_DO_INDICE } from '@/lib/atendimentos-ia/desenhos-das-tipologias'

type Linha = Record<string, unknown>
const estado = {
    superAdmin: true,
    rpcs: [] as Array<{ nome: string; args: Linha }>,
    rpcErro: null as { message: string; code: string } | null,
    tabela: [] as Array<{ id: string; caminho_no_storage: string | null }>,
    tabelaErro: null as { message: string; code: string } | null,
    paginas: [] as Array<[number, number]>,
    bucket: {} as Record<string, Array<{ name: string; id: string | null }>>,
}
jest.mock('@/lib/get-caller-tenant', () => ({
    requireSuperAdmin: async (_q: unknown, res: { status: (n: number) => { json: (c: unknown) => void } }) => {
        if (!estado.superAdmin) { res.status(403).json({ error: 'Acesso restrito' }); return null }
        return { user_id: 'u-1' }
    },
}))
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        rpc: async (nome: string, args: Linha): Promise<Linha> => {
            estado.rpcs.push({ nome, args })
            if (estado.rpcErro) return { data: null, error: estado.rpcErro }
            return { data: { resultado: 'importado', antes: 0, linhas: (args.p_linhas as unknown[]).length }, error: null }
        },
        from: (tabela: string) => {
            if (tabela !== 'orcamentista_tipologia_desenho') throw new Error(`tabela inesperada ${tabela}`)
            const q: Record<string, unknown> = {}
            let de = 0; let ate = 0
            q.select = () => q
            q.not = () => q
            q.order = () => q
            q.range = (a: number, b: number) => { de = a; ate = b; return q }
            q.then = (ok: (v: unknown) => unknown) => {
                estado.paginas.push([de, ate])
                if (estado.tabelaErro) return Promise.resolve({ data: null, error: estado.tabelaErro }).then(ok)
                return Promise.resolve({ data: estado.tabela.filter((l) => l.caminho_no_storage !== null).slice(de, ate + 1), error: null }).then(ok)
            }
            return q
        },
        storage: {
            from: () => ({
                list: async (pasta: string, o: { limit: number; offset: number }): Promise<Linha> => ({ data: (estado.bucket[pasta] ?? []).slice(o.offset, o.offset + o.limit), error: null }),
                remove: async () => { throw new Error('a conferência não apaga') },
            }),
        },
    },
}))
/* eslint-disable @typescript-eslint/no-require-imports */
const importar = () => require('@/pages/api/super-admin/atendimentos-ia/desenhos/importar').default
const conferencia = () => require('@/pages/api/super-admin/atendimentos-ia/desenhos/conferencia').default
/* eslint-enable @typescript-eslint/no-require-imports */

type Saida = { status: number; corpo: Record<string, unknown> }
async function chamar(rota: () => (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>, metodo: string, body?: unknown): Promise<Saida> {
    const saida: Saida = { status: 0, corpo: {} }
    const res = { status(n: number) { saida.status = n; return res }, json(c: unknown) { saida.corpo = c as Record<string, unknown>; return res } } as unknown as NextApiResponse
    await rota()({ method: metodo, body, query: {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}
const linha = (codigo: string, extra: Partial<Record<string, string>> = {}) => {
    const v: Record<string, string> = { fonte: 'por_variavel', grupo: 'Portas revestidas (ACM/lambri)', codigo, codigo_dp: codigo, descricao: 'X, "Y"', liberado: '', condicao: '(N=1)',
        arquivo_indice: 'a.png', zip: 'z.zip', caminho_no_zip: `imagens/${codigo}.jpg`, url_wvetro: '', ...extra }
    return COLUNAS_DO_INDICE.map((c) => (/[,"]/.test(v[c]) ? `"${v[c].replace(/"/g, '""')}"` : v[c])).join(',')
}
const CSV = [COLUNAS_DO_INDICE.join(','), linha('DP-017'), linha('DP-17'), linha('DP-2', { caminho_no_zip: '' })].join('\r\n') + '\r\n'

let silencio: jest.SpyInstance
beforeEach(() => {
    Object.assign(estado, { superAdmin: true, rpcs: [], rpcErro: null, tabela: [], tabelaErro: null, paginas: [], bucket: {} })
    silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => silencio.mockRestore())

describe('a importação', () => {
    it('o sha256 é o dos BYTES recebidos, calculado aqui; as linhas com o caminho do slug único; a permissão de encolher como veio; as faltas nomeadas', async () => {
        const r = await chamar(importar, 'POST', { texto: CSV, permitir_encolher: false })
        expect(r.status).toBe(200)
        const sha = createHash('sha256').update(Buffer.from(CSV, 'utf-8')).digest('hex')
        expect(r.corpo.sha256).toBe(sha)
        expect(estado.rpcs).toHaveLength(1)
        const { nome, args } = estado.rpcs[0]
        expect(nome).toBe('superadmin_importar_desenhos')
        expect(args.p_sha256).toBe(sha)
        expect(args.p_por).toBe('u-1')
        expect(args.p_permitir_encolher).toBe(false)
        const linhas = args.p_linhas as Array<Record<string, unknown>>
        expect(linhas.map((l) => l.caminho_no_storage)).toEqual(['tipologias/portas-revestidas-acm-lambri/DP-017.jpg', 'tipologias/portas-revestidas-acm-lambri/DP-17.jpg', null])
        expect(linhas.map((l) => [l.codigo, l.codigo_dp])).toEqual([['DP-017', 'DP-17'], ['DP-17', 'DP-17'], ['DP-2', 'DP-2']])
        expect(linhas[0].descricao).toBe('X, "Y"')
        expect(r.corpo.sem_arquivo).toEqual(['linha 4: DP-2 (N=1) (a.png)'])
        expect(r.corpo.juntados_pela_normalizacao).toEqual(['DP-017 e DP-17 são códigos diferentes que a normalização juntaria (DP-17)'])
        expect(r.corpo.mesma_descricao).toEqual([])
    })
    it('a linha que não serve recusa TUDO, nomeada, e a função não é chamada', async () => {
        const r = await chamar(importar, 'POST', { texto: [COLUNAS_DO_INDICE.join(','), linha('DP-1', { liberado: 'Talvez' })].join('\r\n'), permitir_encolher: false })
        expect(r.status).toBe(400)
        expect(r.corpo.recusas).toEqual(['linha 2: liberado "Talvez" não é Sim, Não nem vazio'])
        expect(estado.rpcs).toEqual([])
    })
    it('a recusa da FUNÇÃO (o encolhimento) chega com a frase dela, 409; sem a migração, 409 nomeando-a — nunca 500', async () => {
        estado.rpcErro = { message: 'o indice novo tem 3 linhas e a tabela tem 3190: encolher exige permitir_encolher = true. Nada foi alterado.', code: '22023' }
        let r = await chamar(importar, 'POST', { texto: CSV, permitir_encolher: false })
        expect([r.status, r.corpo.error]).toEqual([409, estado.rpcErro.message])
        estado.rpcErro = { message: 'Could not find the function', code: 'PGRST202' }
        r = await chamar(importar, 'POST', { texto: CSV, permitir_encolher: false })
        expect(r.status).toBe(409)
        expect(r.corpo.error).toContain('a migração 20261111000001 não está aplicada')
    })
    it('a permissão de encolher é obrigatória e booleana; o texto, obrigatório; só POST; só super admin', async () => {
        expect((await chamar(importar, 'POST', { texto: CSV })).status).toBe(400)
        expect((await chamar(importar, 'POST', { texto: CSV, permitir_encolher: 'sim' })).status).toBe(400)
        expect((await chamar(importar, 'POST', { permitir_encolher: true })).status).toBe(400)
        expect((await chamar(importar, 'GET')).status).toBe(405)
        estado.superAdmin = false
        expect((await chamar(importar, 'POST', { texto: CSV, permitir_encolher: true })).status).toBe(403)
        expect(estado.rpcs).toEqual([])
    })
})

describe('a conferência', () => {
    it('os DOIS LADOS nomeados: o caminho sem objeto e o objeto sem linha; lê todas as páginas da tabela (1000 a 1000) e todas as pastas', async () => {
        estado.tabela = [
            ...Array.from({ length: 1000 }, (_, i) => ({ id: `i${i}`, caminho_no_storage: `tipologias/pvc/E${i}.jpg` })),
            { id: 'x1', caminho_no_storage: 'tipologias/pvc/SEM_OBJETO.jpg' },
            { id: 'x2', caminho_no_storage: null },
        ]
        estado.bucket = {
            tipologias: [{ name: 'pvc', id: null }, { name: 'aluminio', id: null }],
            'tipologias/pvc': Array.from({ length: 1000 }, (_, i) => ({ name: `E${i}.jpg`, id: `o${i}` })),
            'tipologias/aluminio': [{ name: 'SOBRA.jpg', id: 'oa' }],
        }
        const r = await chamar(conferencia, 'GET')
        expect(r.status).toBe(200)
        expect(estado.paginas).toEqual([[0, 999], [1000, 1999]])
        expect(r.corpo).toEqual({ sem_objeto: ['tipologias/pvc/SEM_OBJETO.jpg'], sem_linha: ['tipologias/aluminio/SOBRA.jpg'], caminhos: 1001, objetos: 1001 })
    })
    it('casados: zero dos dois lados', async () => {
        estado.tabela = [{ id: 'a', caminho_no_storage: 'tipologias/pvc/A.jpg' }]
        estado.bucket = { tipologias: [{ name: 'pvc', id: null }], 'tipologias/pvc': [{ name: 'A.jpg', id: 'o' }] }
        expect((await chamar(conferencia, 'GET')).corpo).toEqual({ sem_objeto: [], sem_linha: [], caminhos: 1, objetos: 1 })
    })
    it('sem a migração (a tabela não existe): 409 nomeando-a, nunca 500 e nunca "zero dos dois lados"', async () => {
        estado.tabelaErro = { message: 'relation does not exist', code: 'PGRST205' }
        const r = await chamar(conferencia, 'GET')
        expect(r.status).toBe(409)
        expect(r.corpo.error).toContain('a migração 20261111000001 não está aplicada')
    })
})

export {}
