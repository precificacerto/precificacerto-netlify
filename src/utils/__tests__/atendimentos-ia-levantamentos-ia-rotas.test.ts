/**
 * @jest-environment node
 *
 * PORTÃO — as rotas dos LEVANTAMENTOS I.A. (dono do produto, 11/11/2026): a lista da empresa e o ARQUIVO de um levantamento. Só leem, no tenant
 * do usuário logado; a permissão e a seção ligada são as do módulo `orcamentista` (`chamadorDoOrcamentista`, que aqui é simulado).
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>
const T = 'tenant-da-conta'
const OUTRO = 'tenant-de-outra'
const LEV = '9fb963ac-f9a3-469b-8af7-4668f6a0cb2f'
const estado = {
    db: {} as Record<string, Linha[]>, ops: [] as Array<{ tabela: string; op: string; filtros: Array<[string, unknown]> }>,
    chamador: { tenant_id: T } as { tenant_id: string } | null, nivel: [] as string[],
    arquivo: [] as Array<[string, string]>, folha: null as unknown,
}
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            let ordem: [string, boolean] | null = null
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q }
            q.then = (ok: (v: unknown) => unknown) => {
                estado.ops.push({ tabela, op: 'select', filtros })
                let r = (estado.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v))
                if (ordem) { const [c, asc] = ordem; r = [...r].sort((a, b) => ((a[c] as number) - (b[c] as number)) * (asc ? 1 : -1)) }
                return Promise.resolve({ data: r, error: null }).then(ok)
            }
            return q
        },
    },
}))
jest.mock('@/lib/atendimentos-ia/orcamentista-da-empresa', () => ({
    MODULO_DO_ORCAMENTISTA: 'orcamentista',
    chamadorDoOrcamentista: async (_req: unknown, res: NextApiResponse, nivel: string) => {
        estado.nivel.push(nivel)
        if (!estado.chamador) { res.status(403).json({ error: 'sem permissão' }); return null }
        return estado.chamador
    },
}))
jest.mock('@/lib/atendimentos-ia/conversa-da-ia', () => ({
    arquivoDoLevantamentoGravado: async (t: string, id: string) => { estado.arquivo.push([t, id]); return estado.folha },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const rotaDaLista = require('@/pages/api/atendimentos-ia/levantamentos/index').default
const rotaDoArquivo = require('@/pages/api/atendimentos-ia/levantamentos/[id]/arquivo').default
const { FRASE_DO_LEVANTAMENTO_NAO_ACHADO } = require('@/lib/atendimentos-ia/arquivo-do-levantamento')
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(rota: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>, method: string, query: Record<string, string> = {}) {
    const saida = { status: 0, corpo: undefined as unknown, cabecalhos: {} as Record<string, string> }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: unknown) { saida.corpo = b; return res },
        send(b: unknown) { saida.corpo = b; return res },
        setHeader(k: string, v: string) { saida.cabecalhos[k] = v; return res },
    } as unknown as NextApiResponse
    await rota({ method, query: { ...query, tenant_id: OUTRO }, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}
beforeEach(() => {
    estado.db = {
        orcamentista_levantamento: [
            { id: 'l-1', tenant_id: T, numero: 1, nome: 'Antonio Rock', estado: 'COMPLETO', vendedor_nome: 'Paulo', criado_em: '2026-11-01T10:00:00Z' },
            { id: 'l-2', tenant_id: T, numero: 2, nome: 'Geraldo Huck', estado: 'EM_MONTAGEM', vendedor_nome: null, criado_em: '2026-11-08T10:00:00Z' },
            { id: 'l-9', tenant_id: OUTRO, numero: 9, nome: 'Da outra empresa', estado: 'COMPLETO', vendedor_nome: null, criado_em: '2026-11-08T10:00:00Z' },
        ],
    }
    estado.ops = []; estado.chamador = { tenant_id: T }; estado.nivel = []; estado.arquivo = []; estado.folha = null
})

describe('(1) a lista', () => {
    it('os da empresa do usuário, do mais novo ao mais antigo; o tenant da query é ignorado; permissão de VER', async () => {
        const r = await chamar(rotaDaLista, 'GET')
        expect(r.status).toBe(200)
        expect((r.corpo as { levantamentos: Linha[] }).levantamentos.map((l) => l.nome)).toEqual(['Geraldo Huck', 'Antonio Rock'])
        expect(estado.ops.every((o) => o.filtros.some(([c, v]) => c === 'tenant_id' && v === T))).toBe(true)
        expect(estado.nivel).toEqual(['ver'])
    })
    it('sem permissão: a resposta é a do chamador, e nada é lido; e só GET', async () => {
        estado.chamador = null
        expect((await chamar(rotaDaLista, 'GET')).status).toBe(403)
        expect(estado.ops).toEqual([])
        expect((await chamar(rotaDaLista, 'POST')).status).toBe(405)
    })
})

describe('(2) o arquivo', () => {
    it('o PDF da folha, no tenant do usuário, inline com o nome do arquivo', async () => {
        estado.folha = { ok: true, pdf: new Uint8Array([37, 80, 68, 70]), paginas: 1, nomeDoArquivo: 'Levantamento 11 - Geraldo Huck.pdf' }
        const r = await chamar(rotaDoArquivo, 'GET', { id: LEV })
        expect(r.status).toBe(200)
        expect(r.cabecalhos['Content-Type']).toBe('application/pdf')
        expect(r.cabecalhos['Content-Disposition']).toBe('inline; filename="Levantamento 11 - Geraldo Huck.pdf"')
        expect(Buffer.isBuffer(r.corpo) && (r.corpo as Buffer).toString('latin1')).toBe('%PDF')
        expect(estado.arquivo).toEqual([[T, LEV]])
        expect(estado.nivel).toEqual(['ver'])
    })
    it('o levantamento que não é da empresa (ou não existe) é 404; o id fora da forma nem é procurado', async () => {
        estado.folha = { ok: false, recusas: [FRASE_DO_LEVANTAMENTO_NAO_ACHADO] }
        expect((await chamar(rotaDoArquivo, 'GET', { id: LEV })).status).toBe(404)
        estado.arquivo = []
        expect((await chamar(rotaDoArquivo, 'GET', { id: 'nao-e-uuid' })).status).toBe(404)
        expect(estado.arquivo).toEqual([])
    })
    it('a folha que não fecha é 422 com as recusas nomeadas', async () => {
        estado.folha = { ok: false, recusas: ['Falta de configuração — a família PVC sem motor: verifique o catálogo em Motores'] }
        const r = await chamar(rotaDoArquivo, 'GET', { id: LEV })
        expect(r.status).toBe(422)
        expect((r.corpo as { recusas: string[] }).recusas).toEqual(['Falta de configuração — a família PVC sem motor: verifique o catálogo em Motores'])
    })
    it('sem permissão, nada é gerado', async () => {
        estado.chamador = null
        expect((await chamar(rotaDoArquivo, 'GET', { id: LEV })).status).toBe(403)
        expect(estado.arquivo).toEqual([])
    })
})
