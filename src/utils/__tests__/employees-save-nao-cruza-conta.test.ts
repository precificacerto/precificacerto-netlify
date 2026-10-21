/**
 * @jest-environment node
 *
 * PORTÃO DE SEGURANÇA — `POST /api/employees/save` não atravessa contas, não aceita quem não pode
 * editar funcionários, e ninguém mexe em permissão de acesso sem ser admin da conta — nem nas
 * próprias. Regra do dono do produto, literal: nenhuma informação atravessa entre contas, nunca.
 *
 * O banco é FALSO e em memória, e aplica os filtros `eq` de verdade: uma escrita filtrada só por
 * `id` alcança a linha da OUTRA conta, como o `service_role` alcança em produção (ele ignora RLS).
 * Os portões afirmam pelo ESTADO do banco depois da chamada e pelas operações emitidas.
 *
 *   (1) usuário da conta A manda o id de um funcionário da conta B → 404, e NADA de B muda —
 *       nem o funcionário, nem o usuário dele, nem as permissões dele;
 *   (2) quem não pode editar o módulo `employees` → 403, e nada é gravado;
 *   (3) usuário comum não altera as próprias permissões — nem as de ninguém;
 *   (4) o admin da conta não altera as PRÓPRIAS permissões (o resto do cadastro dele, sim);
 *   (5) o caso legítimo continua: o admin edita funcionário da própria conta e as permissões dele;
 *   (6) criar funcionário grava na conta do chamador; permissão pendente só vinda de admin.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>
interface Operacao { tabela: string; op: string; carga?: unknown; filtros: [string, unknown][] }

const A = 'conta-A'
const B = 'conta-B'

const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Operacao[],
    caller: { user_id: 'u-admin-a', tenant_id: A, role: 'admin', is_super_admin: false },
}

function executar(tabela: string, op: string, carga: unknown, filtros: [string, unknown][]) {
    estado.ops.push({ tabela, op, carga, filtros })
    const linhas = (estado.db[tabela] ??= [])
    const casa = (l: Linha) => filtros.every(([c, v]) => l[c] === v)
    if (op === 'select') return { data: linhas.filter(casa), error: null }
    if (op === 'delete') { estado.db[tabela] = linhas.filter((l) => !casa(l)); return { data: null, error: null } }
    if (op === 'update') {
        const alvo = linhas.filter(casa)
        alvo.forEach((l) => Object.assign(l, carga as Linha))
        return { data: alvo, error: null }
    }
    const novas = ((Array.isArray(carga) ? carga : [carga]) as Linha[]).map((l, i) => ({ id: `novo-${linhas.length + i + 1}`, ...l }))
    linhas.push(...novas)
    return { data: novas, error: null }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: [string, unknown][] = []
            let op = 'select'
            let carga: unknown
            const q: Record<string, unknown> = {}
            const rodar = () => Promise.resolve(executar(tabela, op, carga, filtros))
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            q.delete = () => { op = 'delete'; return q }
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return q }
            q.single = () => rodar().then((r) => ({ data: r.data?.[0] ?? null, error: r.data?.[0] ? null : { message: 'no rows' } }))
            q.maybeSingle = () => rodar().then((r) => ({ data: r.data?.[0] ?? null, error: null as null }))
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro)
            return q
        },
    },
}))
jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async () => estado.caller,
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/employees/save').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>

async function salvar(body: unknown) {
    const saida = { status: 0, corpo: {} as Record<string, unknown> }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: Record<string, unknown>) { saida.corpo = b; return res },
    } as unknown as NextApiResponse
    await rota({ method: 'POST', body, query: {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}

const ADMIN_A = { user_id: 'u-admin-a', tenant_id: A, role: 'admin', is_super_admin: false }
const VENDEDOR_A = { user_id: 'u-vend-a', tenant_id: A, role: 'user', is_super_admin: false }

const TUDO = {
    home: { can_view: true, can_edit: true }, employees: { can_view: true, can_edit: true },
    cash_flow: { can_view: true, can_edit: true }, users_management: { can_view: true, can_edit: true },
}

function montar() {
    estado.db = {
        employees: [
            { id: 'e-b', tenant_id: B, user_id: 'u-b', name: 'Bia da conta B', email: 'bia@b', phone: '11999990000', salary: 5000, pending_permissions: null },
            { id: 'e-vend-a', tenant_id: A, user_id: 'u-vend-a', name: 'Vendedor A', email: 'vend@a', phone: null, salary: 2000, pending_permissions: null },
            { id: 'e-admin-a', tenant_id: A, user_id: 'u-admin-a', name: 'Admin A', email: 'admin@a', phone: null, salary: 9000, pending_permissions: null },
            { id: 'e-outro-a', tenant_id: A, user_id: 'u-outro-a', name: 'Outro A', email: 'outro@a', phone: null, salary: 3000, pending_permissions: null },
        ],
        users: [
            { id: 'u-b', tenant_id: B, name: 'Bia da conta B', role: 'user', is_super_admin: false },
            { id: 'u-vend-a', tenant_id: A, name: 'Vendedor A', role: 'user', is_super_admin: false },
            { id: 'u-admin-a', tenant_id: A, name: 'Admin A', role: 'admin', is_super_admin: false },
            { id: 'u-outro-a', tenant_id: A, name: 'Outro A', role: 'user', is_super_admin: false },
        ],
        user_module_permissions: [
            { user_id: 'u-b', tenant_id: B, module: 'home', can_view: true, can_edit: false },
            { user_id: 'u-vend-a', tenant_id: A, module: 'employees', can_view: true, can_edit: true },
            { user_id: 'u-outro-a', tenant_id: A, module: 'home', can_view: true, can_edit: false },
        ],
        user_item_access: [],
    }
    estado.ops = []
    estado.caller = ADMIN_A
}
beforeEach(montar)

const copia = (v: unknown) => JSON.parse(JSON.stringify(v))
const linhasDe = (tabela: string, filtro: (l: Linha) => boolean) => copia(estado.db[tabela].filter(filtro))
const daContaB = () => ({
    employees: linhasDe('employees', (l) => l.tenant_id === B),
    users: linhasDe('users', (l) => l.tenant_id === B),
    perms: linhasDe('user_module_permissions', (l) => l.user_id === 'u-b'),
    acesso: linhasDe('user_item_access', (l) => l.user_id === 'u-b'),
})
const permsDe = (userId: string) => linhasDe('user_module_permissions', (l) => l.user_id === userId)

describe('(1) a conta A NÃO alcança o funcionário da conta B', () => {
    it('admin de A manda o id do funcionário de B: 404, e nada de B muda', async () => {
        const antes = daContaB()
        const r = await salvar({
            editing_id: 'e-b',
            employee: { name: 'ALTERADO POR A', email: 'bia@b', phone: '0', salary: 1, user_role: 'admin' },
            modulePermissions: TUDO, itemAccessMode: 'all', selectedItemIds: [],
        })
        expect(r.status).toBe(404)
        expect(daContaB()).toEqual(antes)
        // e nenhuma linha com o user_id de B foi gravada, em conta nenhuma
        expect(estado.db.user_module_permissions.filter((l) => l.user_id === 'u-b')).toEqual(antes.perms)
    })

    it('a resposta é 404 — a mesma de um id que não existe: não confirma que o registro existe', async () => {
        const deB = await salvar({ editing_id: 'e-b', employee: { name: 'x' } })
        const inexistente = await salvar({ editing_id: 'e-nao-existe', employee: { name: 'x' } })
        expect(deB.status).toBe(404)
        expect(inexistente).toEqual(deB)
    })

    it('funcionário de A ligado, por dado inconsistente, a um USUÁRIO de B: o usuário de B não muda', async () => {
        estado.db.employees.push({ id: 'e-a-ligado-a-b', tenant_id: A, user_id: 'u-b', name: 'Ligado errado', email: 'x@a', phone: null, salary: 1, pending_permissions: null })
        const antes = daContaB()
        const r = await salvar({ editing_id: 'e-a-ligado-a-b', employee: { name: 'Renomeado', email: 'x@a', phone: '0' } })
        expect(r.status).toBe(200)
        expect(estado.db.employees.find((e) => e.id === 'e-a-ligado-a-b')?.name).toBe('Renomeado')
        expect(daContaB().users).toEqual(antes.users)
    })

    it('tenant_id no corpo não muda nada: a conta é a do chamador', async () => {
        const antes = daContaB()
        const r = await salvar({ editing_id: 'e-b', tenant_id: B, employee: { name: 'x', tenant_id: B } })
        expect(r.status).toBe(404)
        expect(daContaB()).toEqual(antes)
    })
})

describe('(2) quem não pode EDITAR funcionários não usa a rota', () => {
    it('usuário sem a permissão de editar employees: 403, e nada é gravado', async () => {
        estado.caller = { ...VENDEDOR_A, user_id: 'u-outro-a' }
        const r = await salvar({ editing_id: 'e-vend-a', employee: { name: 'mudei', salary: 99999 } })
        expect(r.status).toBe(403)
        expect(estado.ops.filter((o) => o.op !== 'select')).toEqual([])
    })

    it('nem para CRIAR', async () => {
        estado.caller = { ...VENDEDOR_A, user_id: 'u-outro-a' }
        const r = await salvar({ employee: { name: 'Novo' } })
        expect(r.status).toBe(403)
        expect(estado.ops.filter((o) => o.op !== 'select')).toEqual([])
    })
})

describe('(3) usuário comum NÃO altera permissão de acesso — nem as próprias', () => {
    it('o vendedor (que pode editar funcionários) manda permissões TOTAIS para si mesmo: 403, e as dele não mudam', async () => {
        estado.caller = VENDEDOR_A
        const antes = permsDe('u-vend-a')
        const r = await salvar({ editing_id: 'e-vend-a', employee: { name: 'Vendedor A', email: 'vend@a', user_role: 'admin' }, modulePermissions: TUDO, itemAccessMode: 'all', selectedItemIds: [] })
        expect(r.status).toBe(403)
        expect(permsDe('u-vend-a')).toEqual(antes)
        expect(estado.db.users.find((u) => u.id === 'u-vend-a')?.role).toBe('user')
    })

    it('mandar SÓ `user_role: admin`, sem permissões, também é mexer em permissão: 403, e o papel não muda', async () => {
        estado.caller = VENDEDOR_A
        const r = await salvar({ editing_id: 'e-vend-a', employee: { name: 'Vendedor A', email: 'vend@a', user_role: 'admin' } })
        expect(r.status).toBe(403)
        expect(estado.db.users.find((u) => u.id === 'u-vend-a')?.role).toBe('user')
        expect(estado.ops.filter((o) => o.op !== 'select')).toEqual([])
    })

    it('nem as de um colega da mesma conta', async () => {
        estado.caller = VENDEDOR_A
        const antes = permsDe('u-outro-a')
        const r = await salvar({ editing_id: 'e-outro-a', employee: { name: 'Outro A', email: 'outro@a' }, modulePermissions: TUDO })
        expect(r.status).toBe(403)
        expect(permsDe('u-outro-a')).toEqual(antes)
    })

    it('sem tocar em permissão, o vendedor edita o cadastro do colega normalmente', async () => {
        estado.caller = VENDEDOR_A
        const r = await salvar({ editing_id: 'e-outro-a', employee: { name: 'Outro A renomeado', email: 'outro@a' } })
        expect(r.status).toBe(200)
        expect(estado.db.employees.find((e) => e.id === 'e-outro-a')?.name).toBe('Outro A renomeado')
        expect(permsDe('u-outro-a')).toEqual([{ user_id: 'u-outro-a', tenant_id: A, module: 'home', can_view: true, can_edit: false }])
    })
})

describe('(4) o admin da conta não altera as PRÓPRIAS permissões', () => {
    it('salvar o próprio cadastro com permissões: o cadastro muda, as permissões e o papel NÃO — e a resposta diz isso', async () => {
        const antes = permsDe('u-admin-a')
        const r = await salvar({ editing_id: 'e-admin-a', employee: { name: 'Admin A novo nome', email: 'admin@a', user_role: 'user' }, modulePermissions: { home: { can_view: false, can_edit: false } }, itemAccessMode: 'specific', selectedItemIds: ['i1'] })
        expect(r.status).toBe(200)
        expect(estado.db.employees.find((e) => e.id === 'e-admin-a')?.name).toBe('Admin A novo nome')
        expect(permsDe('u-admin-a')).toEqual(antes)
        expect(estado.db.user_item_access.filter((l) => l.user_id === 'u-admin-a')).toEqual([])
        expect(estado.db.users.find((u) => u.id === 'u-admin-a')?.role).toBe('admin')
        expect(String(r.corpo.aviso)).toMatch(/próprias permissões/)
    })
})

describe('(5) o caso legítimo continua', () => {
    it('o admin edita funcionário da própria conta, com permissões: grava as do funcionário, na conta A', async () => {
        const r = await salvar({ editing_id: 'e-outro-a', employee: { name: 'Outro A', email: 'outro@a', user_role: 'user' }, modulePermissions: { cash_flow: { can_view: true, can_edit: false } }, itemAccessMode: 'all', selectedItemIds: [] })
        expect(r.status).toBe(200)
        expect(permsDe('u-outro-a')).toEqual([expect.objectContaining({ user_id: 'u-outro-a', tenant_id: A, module: 'cash_flow', can_view: true, can_edit: false })])
        expect(estado.db.user_item_access).toEqual([expect.objectContaining({ user_id: 'u-outro-a', tenant_id: A, access_all_items: true })])
    })
})

describe('(6) criar funcionário', () => {
    it('grava na conta do CHAMADOR, mesmo com tenant_id de outra no corpo', async () => {
        const r = await salvar({ tenant_id: B, employee: { name: 'Novo', tenant_id: B } })
        expect(r.status).toBe(200)
        expect(estado.db.employees.filter((e) => e.name === 'Novo')).toEqual([expect.objectContaining({ tenant_id: A })])
    })

    it('permissão pendente só vinda de admin: o vendedor que manda permissões ao criar recebe 403, e nada é criado', async () => {
        estado.caller = VENDEDOR_A
        const r = await salvar({ employee: { name: 'Cúmplice', user_role: 'admin' }, modulePermissions: TUDO })
        expect(r.status).toBe(403)
        expect(estado.db.employees.filter((e) => e.name === 'Cúmplice')).toEqual([])
    })
})
