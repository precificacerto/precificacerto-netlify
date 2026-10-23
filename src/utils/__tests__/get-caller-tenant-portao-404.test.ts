/**
 * @jest-environment node
 *
 * PORTÃO — a extração do núcleo de `getCallerContext` NÃO muda as rotas antigas.
 *
 * As rotas da base de conhecimento respondem 404 a quem não é super admin (não confirmam que a
 * rota existe). Para isso o núcleo de `getCallerContext` foi extraído numa leitura que não escreve
 * resposta (`lerCallerContext`), e `superAdminOu404` responde 404 por cima dele.
 *
 * O CONTRASTE é a razão deste arquivo (dono do produto, 23/10/2026): `getCallerContext` e
 * `requireSuperAdmin` continuam respondendo EXATAMENTE o que respondiam — 401 sem sessão, 403 sem
 * perfil, 403 para quem não é super admin —, com as mesmas mensagens. Se a extração vazar o 404
 * para as rotas antigas, isto fica vermelho.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Perfil = { tenant_id: string | null; role: string; is_super_admin: boolean }
const sessao: { usuario: string | null; perfil: Perfil | null } = { usuario: null, perfil: null }

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> => (sessao.usuario
                ? { data: { user: { id: sessao.usuario } }, error: null }
                : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: () => {
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = () => q
            q.single = async (): Promise<{ data: Perfil | null; error: { message: string } | null }> => ({ data: sessao.perfil, error: null })
            return q
        },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const portoes = require('@/lib/get-caller-tenant') as typeof import('@/lib/get-caller-tenant')

function pedido(comToken = true) {
    return { cookies: comToken ? { token: 't' } : {} } as unknown as NextApiRequest
}
function resposta() {
    const r = { status: 0, corpo: undefined as unknown }
    const res = { status(n: number) { r.status = n; return res }, json(b: unknown) { r.corpo = b; return res } }
    return { r, res: res as unknown as NextApiResponse }
}

const SUPER: Perfil = { tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN_DE_TENANT: Perfil = { tenant_id: 't-a', role: 'admin', is_super_admin: false }
const COMUM: Perfil = { tenant_id: 't-a', role: 'user', is_super_admin: false }

beforeEach(() => { sessao.usuario = 'u-1'; sessao.perfil = SUPER })

// Cada caso: [rótulo, preparo, status de requireSuperAdmin, corpo de requireSuperAdmin]
const CASOS: Array<[string, () => { comToken: boolean }, number, unknown]> = [
    ['sem o cookie de sessão', () => ({ comToken: false }), 401, { error: 'Unauthorized' }],
    ['sessão inválida', () => { sessao.usuario = null; return { comToken: true } }, 401, { error: 'Unauthorized' }],
    ['sem perfil em users', () => { sessao.perfil = null; return { comToken: true } }, 403, { error: 'Forbidden' }],
    ['admin de tenant', () => { sessao.perfil = ADMIN_DE_TENANT; return { comToken: true } }, 403, { error: 'Forbidden: Super Admin only' }],
    ['usuário comum', () => { sessao.perfil = COMUM; return { comToken: true } }, 403, { error: 'Forbidden: Super Admin only' }],
]

describe('o contraste: requireSuperAdmin responde o que sempre respondeu', () => {
    it.each(CASOS)('%s → requireSuperAdmin: o status e a mensagem de antes', async (_n, preparar, status, corpo) => {
        const { comToken } = preparar()
        const { r, res } = resposta()
        const caller = await portoes.requireSuperAdmin(pedido(comToken), res)
        expect(caller).toBeNull()
        expect(r.status).toBe(status)
        expect(r.corpo).toEqual(corpo)
    })

    it('super admin → requireSuperAdmin devolve o contexto e NÃO escreve resposta', async () => {
        const { r, res } = resposta()
        const caller = await portoes.requireSuperAdmin(pedido(), res)
        expect(caller).toEqual({ user_id: 'u-1', tenant_id: null, role: 'super_admin', is_super_admin: true })
        expect(r.status).toBe(0)
    })

    it('getCallerContext também: 401 sem sessão, 403 sem perfil, contexto para quem tem perfil', async () => {
        let t = resposta()
        expect(await portoes.getCallerContext(pedido(false), t.res)).toBeNull()
        expect([t.r.status, t.r.corpo]).toEqual([401, { error: 'Unauthorized' }])
        sessao.perfil = null
        t = resposta()
        expect(await portoes.getCallerContext(pedido(), t.res)).toBeNull()
        expect([t.r.status, t.r.corpo]).toEqual([403, { error: 'Forbidden' }])
        sessao.perfil = COMUM
        t = resposta()
        expect(await portoes.getCallerContext(pedido(), t.res)).toEqual({ user_id: 'u-1', tenant_id: 't-a', role: 'user', is_super_admin: false })
        expect(t.r.status).toBe(0)
    })
})

describe('superAdminOu404: todo mundo que não é super admin recebe 404 — o mesmo 404 entre si', () => {
    it.each(CASOS)('%s → 404', async (_n, preparar) => {
        const { comToken } = preparar()
        const { r, res } = resposta()
        expect(await portoes.superAdminOu404(pedido(comToken), res)).toBeNull()
        expect(r.status).toBe(404)
        expect(r.corpo).toEqual({ error: 'Not found' })
    })

    it('super admin → o contexto, e nenhuma resposta escrita', async () => {
        const { r, res } = resposta()
        expect(await portoes.superAdminOu404(pedido(), res)).toEqual(expect.objectContaining({ user_id: 'u-1', is_super_admin: true }))
        expect(r.status).toBe(0)
    })
})
