/**
 * @jest-environment node
 *
 * PORTÃO — a rota da configuração de despesas (pedido 0051): lê `tenant_expense_config` pelo servidor, SÓ no tenant do chamador, com permissão de ver.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

const estado = { filtros: [] as Array<[string, unknown]>, tabelas: [] as string[], nivel: [] as string[], resposta: { data: { tenant_id: 'tenant-da-conta', laborCost: 1 }, error: null } as { data: unknown; error: { message: string } | null }, chamador: { tenant_id: 'tenant-da-conta' } as { tenant_id: string } | null }
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: { from: (t: string) => { estado.tabelas.push(t); const q: Record<string, unknown> = { select: () => q, eq: (c: string, v: unknown) => { estado.filtros.push([c, v]); return q }, maybeSingle: () => Promise.resolve(estado.resposta) }; return q } },
}))
jest.mock('@/lib/atendimentos-ia/orcamentista-da-empresa', () => ({
    MODULO_DO_ORCAMENTISTA: 'orcamentista',
    chamadorDoOrcamentista: async (_r: unknown, res: NextApiResponse, nivel: string) => { estado.nivel.push(nivel); if (!estado.chamador) { res.status(403).json({ error: 'sem permissão' }); return null } return estado.chamador },
}))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/atendimentos-ia/config-de-despesas').default
async function chamar(method: string) {
    const saida = { status: 0, corpo: undefined as unknown }
    const res = { status(n: number) { saida.status = n; return res }, json(b: unknown) { saida.corpo = b; return res } }
    await rota({ method, query: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return saida
}
beforeEach(() => { estado.filtros = []; estado.tabelas = []; estado.nivel = []; estado.chamador = { tenant_id: 'tenant-da-conta' }; estado.resposta = { data: { tenant_id: 'tenant-da-conta', laborCost: 1 }, error: null } })

it('lê a tabela da empresa SÓ no tenant do chamador, com permissão de ver', async () => {
    const r = await chamar('GET')
    expect(r).toMatchObject({ status: 200, corpo: { config: { laborCost: 1 } } })
    expect(estado.tabelas).toEqual(['tenant_expense_config'])
    expect(estado.filtros).toEqual([['tenant_id', 'tenant-da-conta']])
    expect(estado.nivel).toEqual(['ver'])
})
it('sem linha: config nula (ausente, não zero); erro do banco: 500 nomeado; sem permissão: nada é lido; outro método: 405', async () => {
    estado.resposta = { data: null, error: null }
    expect((await chamar('GET')).corpo).toEqual({ config: null })
    estado.resposta = { data: null, error: { message: 'x' } }
    const e = await chamar('GET')
    expect(e.status).toBe(500)
    expect(e.corpo).toEqual({ error: 'Não foi possível ler a configuração de despesas da empresa.' })
    estado.chamador = null; estado.tabelas = []
    expect((await chamar('GET')).status).toBe(403)
    expect(estado.tabelas).toEqual([])
    expect((await chamar('POST')).status).toBe(405)
})
