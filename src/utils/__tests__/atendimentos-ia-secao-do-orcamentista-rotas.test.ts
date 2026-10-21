/**
 * @jest-environment node
 *
 * PORTÃO — a seção ATENDIMENTOS I.A. do tenant: as ROTAS que alimentam o item do menu e a página
 * `/atendimentos-ia/orcamentista` (dono do produto, 21/10/2026), e a permissão `orcamentista`.
 *
 * O banco é FALSO e em memória, e REGISTRA cada operação: os portões afirmam pelo que foi
 * EMITIDO, não só pelo que a rota respondeu. Ele aplica os filtros `eq` e `in` — uma consulta
 * que esquecesse o `tenant_id` devolveria as linhas da outra conta, e o caso ficaria vermelho.
 *
 *   (1) seção desligada (`orcamentista_config.ativo = false`, ou sem linha): as duas rotas dão
 *       404, e NADA além da configuração é lido;
 *   (2) a trava usa o módulo `orcamentista` — não `connectivity`. A célula de Conectividade
 *       continua com `connectivity`;
 *   (3) o tenant é o do usuário logado: `tenant_id` no corpo e na query é ignorado, e a lista só
 *       traz o tenant do chamador;
 *   (4) o painel: o estado da conexão lido de `whatsapp_conexao` (canal ORCAMENTISTA, sem o
 *       token), quantas pessoas estão liberadas, e os levantamentos de `orcamentista_pre_definicao`
 *       com código, quem pediu, quando e estado — nos padrões aprovados pelo dono do produto;
 *   (5) LEITURA APENAS: nenhuma escrita, em caso nenhum, e só GET é aceito;
 *   (6) a permissão `orcamentista` GRAVA em `user_module_permissions` — pela rota de permissões do
 *       admin e pela de salvar funcionário, que é a da tela Permissões de Acesso.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>
interface Operacao { tabela: string; op: string; carga?: unknown; filtros: [string, string, unknown][] }

const T = 'tenant-da-conta'
const OUTRO = 'tenant-de-outra-conta'
const USUARIO = 'usuario-logado'
const TOKEN_DA_CONEXAO = 'orc_SEGREDO_DA_INSTANCIA_abcdef'

const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Operacao[],
    papel: 'admin',
}

function executar(tabela: string, op: string, carga: unknown, filtros: [string, string, unknown][]) {
    estado.ops.push({ tabela, op, carga, filtros })
    const linhas = (estado.db[tabela] ??= [])
    const casa = (l: Linha) => filtros.every(([tipo, c, v]) => (tipo === 'in' ? (v as unknown[]).includes(l[c]) : l[c] === v))
    if (op === 'select') return { data: linhas.filter(casa), error: null as null | { message: string } }
    if (op === 'delete') { estado.db[tabela] = linhas.filter((l) => !casa(l)); return { data: null, error: null } }
    if (op === 'update') { linhas.filter(casa).forEach((l) => Object.assign(l, carga as Linha)); return { data: null, error: null } }
    const novas = (Array.isArray(carga) ? carga : [carga]) as Linha[]
    linhas.push(...novas)
    return { data: novas, error: null }
}

function cliente() {
    return {
        from: (tabela: string) => {
            const filtros: [string, string, unknown][] = []
            let op = 'select'
            let carga: unknown
            const q: Record<string, unknown> = {}
            const rodar = () => Promise.resolve(executar(tabela, op, carga, filtros))
            q.select = () => q
            q.order = () => q
            q.eq = (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q }
            q.in = (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            q.delete = () => { op = 'delete'; return q }
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return q }
            q.upsert = (c: unknown) => { op = 'upsert'; carga = c; return q }
            q.maybeSingle = () => rodar().then((r) => ({ data: r.data?.[0] ?? null, error: r.error }))
            q.single = q.maybeSingle
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro)
            return q
        },
    }
}

jest.mock('@/supabase/admin', () => ({ supabaseAdmin: cliente() }))
jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async () => ({ user_id: USUARIO, tenant_id: T, role: estado.papel, is_super_admin: false }),
    requireTenantAdmin: async () => ({ user_id: USUARIO, tenant_id: T, role: 'admin', is_super_admin: false }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDaSecao = require('@/pages/api/atendimentos-ia/orcamentista/secao').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDoPainel = require('@/pages/api/atendimentos-ia/orcamentista/painel').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDaConexao = require('@/pages/api/atendimentos-ia/orcamentista/conexao').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDePermissoes = require('@/pages/api/admin/users/[id]/permissions').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDeSalvarFuncionario = require('@/pages/api/employees/save').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MODULES } = require('@/hooks/use-permissions.hook')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MODULO_DO_ORCAMENTISTA, MODULO_DA_TELA } = require('@/lib/atendimentos-ia/orcamentista-da-empresa')

type Rota = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
async function chamar(rota: Rota, method: string, extra: { body?: unknown; query?: Record<string, string> } = {}) {
    const saida = { status: 0, corpo: {} as Record<string, unknown> }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: Record<string, unknown>) { saida.corpo = b; return res },
        end() { return res },
        setHeader() { return res },
    } as unknown as NextApiResponse
    await rota({ method, body: extra.body, query: extra.query ?? {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}

const escritas = () => estado.ops.filter((o) => o.op !== 'select')
const leuDe = (tabela: string) => estado.ops.some((o) => o.tabela === tabela)

const CONVERSA_1 = 'a1b2c3d4-0000-4000-8000-000000000001'
const CONVERSA_2 = 'e5f6a7b8-0000-4000-8000-000000000002'

function montar(extra: Partial<Record<string, Linha[]>> = {}) {
    estado.db = {
        orcamentista_config: [{ tenant_id: T, ativo: true }, { tenant_id: OUTRO, ativo: true }],
        user_module_permissions: [],
        whatsapp_conexao: [
            { tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN_DA_CONEXAO, conectado_por: USUARIO, conectado_em: '2026-10-21T10:00:00Z', ativo: true },
            { tenant_id: T, canal: 'ENVIO', wuzapi_token: 'outro-canal', conectado_por: USUARIO, conectado_em: '2026-10-01T10:00:00Z', ativo: false },
            { tenant_id: OUTRO, canal: 'ORCAMENTISTA', wuzapi_token: 'da-outra', conectado_por: 'x', conectado_em: '2026-10-21T10:00:00Z', ativo: false },
        ],
        orcamentista_remetente_autorizado: [
            { id: 'r-ana', tenant_id: T, telefone: '51999887766', nome: 'Ana', employee_id: 'f1', ativo: true },
            { id: 'r-sem-nome', tenant_id: T, telefone: '54988776655', nome: '  ', employee_id: null, ativo: true },
            { id: 'r-desligada', tenant_id: T, telefone: '51911112222', nome: 'Desligada', employee_id: null, ativo: false },
            { id: 'r-outra', tenant_id: OUTRO, telefone: '11977776666', nome: 'Da Outra', employee_id: null, ativo: true },
        ],
        orcamentista_conversa: [
            { id: CONVERSA_1, tenant_id: T, remetente_id: 'r-ana', telefone: '5551999887766' },
            { id: CONVERSA_2, tenant_id: T, remetente_id: 'r-sem-nome', telefone: '5554988776655' },
            { id: 'ffffffff-0000-4000-8000-000000000009', tenant_id: OUTRO, remetente_id: 'r-outra', telefone: '5511977776666' },
        ],
        orcamentista_pre_definicao: [
            { id: 'p1', tenant_id: T, conversa_id: CONVERSA_1, estado: 'EM_LEVANTAMENTO', criado_em: '2026-10-21T09:00:00Z' },
            { id: 'p2', tenant_id: T, conversa_id: CONVERSA_2, estado: null, criado_em: '2026-10-21T11:00:00Z' },
            { id: 'p-outra', tenant_id: OUTRO, conversa_id: 'ffffffff-0000-4000-8000-000000000009', estado: 'X', criado_em: '2026-10-21T12:00:00Z' },
        ],
        ...extra,
    } as Record<string, Linha[]>
    estado.ops = []
    estado.papel = 'admin'
}
beforeEach(() => montar())

describe('(1) seção desligada: 404 nas duas rotas, e nada além da configuração é lido', () => {
    it.each([
        ['ativo = false', [{ tenant_id: T, ativo: false }]],
        ['sem linha', [] as Linha[]],
    ])('%s', async (_nome, config) => {
        montar({ orcamentista_config: config as Linha[] })
        expect((await chamar(rotaDaSecao, 'GET')).status).toBe(404)
        expect((await chamar(rotaDoPainel, 'GET')).status).toBe(404)
        for (const t of ['whatsapp_conexao', 'orcamentista_remetente_autorizado', 'orcamentista_conversa', 'orcamentista_pre_definicao']) {
            expect(leuDe(t)).toBe(false)
        }
    })

    it('o contraste: ligada, a seção responde 200', async () => {
        expect((await chamar(rotaDaSecao, 'GET')).status).toBe(200)
    })
})

describe('(2) a trava usa o módulo orcamentista — e a célula de Conectividade segue com connectivity', () => {
    it('a constante é a mesma chave do menu e das permissões', () => {
        expect(MODULO_DO_ORCAMENTISTA).toBe(MODULES.ORCAMENTISTA)
        expect(MODULO_DA_TELA).toBe('connectivity')
    })

    it('vendedor que vê Conectividade mas NÃO o Orçamentista: 403 na seção e no painel, 200 na célula', async () => {
        montar({ user_module_permissions: [{ user_id: USUARIO, tenant_id: T, module: 'connectivity', can_view: true, can_edit: false }] })
        estado.papel = 'seller'
        expect((await chamar(rotaDaSecao, 'GET')).status).toBe(403)
        expect((await chamar(rotaDoPainel, 'GET')).status).toBe(403)
        expect((await chamar(rotaDaConexao, 'GET')).status).toBe(200)
    })

    it('vendedor que vê o Orçamentista: 200 na seção e no painel', async () => {
        montar({ user_module_permissions: [{ user_id: USUARIO, tenant_id: T, module: 'orcamentista', can_view: true, can_edit: false }] })
        estado.papel = 'seller'
        expect((await chamar(rotaDaSecao, 'GET')).status).toBe(200)
        expect((await chamar(rotaDoPainel, 'GET')).status).toBe(200)
    })
})

describe('(3) o tenant é o do usuário logado', () => {
    it('tenant_id no corpo e na query é ignorado', async () => {
        const r = await chamar(rotaDoPainel, 'GET', { body: { tenant_id: OUTRO }, query: { tenant_id: OUTRO } })
        expect(r.status).toBe(200)
        const lev = r.corpo.levantamentos as Array<Record<string, unknown>>
        expect(lev.map((l) => l.id).sort()).toEqual(['p1', 'p2'])
    })

    it('a lista só traz o tenant do chamador — e cada consulta filtrou por ele', async () => {
        const r = await chamar(rotaDoPainel, 'GET')
        expect(JSON.stringify(r.corpo)).not.toContain('Da Outra')
        expect((r.corpo.levantamentos as unknown[])).toHaveLength(2)
        const consultas = estado.ops.filter((o) => o.tabela.startsWith('orcamentista_') && o.tabela !== 'orcamentista_config' || o.tabela === 'whatsapp_conexao')
        expect(consultas.length).toBeGreaterThan(3)
        for (const c of consultas) expect(c.filtros).toContainEqual(['eq', 'tenant_id', T])
    })
})

describe('(4) o painel', () => {
    it('a conexão do canal ORCAMENTISTA, sem o token, e as pessoas liberadas (só as ativas)', async () => {
        const r = await chamar(rotaDoPainel, 'GET')
        expect(r.corpo.conexao).toEqual({ existe: true, conectado: true, conectadoEm: '2026-10-21T10:00:00Z' })
        expect(r.corpo.liberadas).toBe(2)
        expect(JSON.stringify(r.corpo)).not.toContain(TOKEN_DA_CONEXAO)
    })

    it('sem conexão gravada: existe = false — e não pega a do canal ENVIO', async () => {
        montar()
        estado.db.whatsapp_conexao = estado.db.whatsapp_conexao.filter((c) => c.canal !== 'ORCAMENTISTA' || c.tenant_id !== T)
        const r = await chamar(rotaDoPainel, 'GET')
        expect(r.corpo.conexao).toEqual({ existe: false, conectado: false, conectadoEm: null })
    })

    it('os levantamentos, do mais novo ao mais antigo, nos padrões aprovados', async () => {
        const r = await chamar(rotaDoPainel, 'GET')
        expect(r.corpo.levantamentos).toEqual([
            // sem nome: o telefone MASCARADO; estado vazio: null (a tela mostra travessão)
            { id: 'p2', codigo: 'E5F6A7B8', quemPediu: '(54) •••••-6655', quando: '2026-10-21T11:00:00Z', estado: null },
            { id: 'p1', codigo: 'A1B2C3D4', quemPediu: 'Ana', quando: '2026-10-21T09:00:00Z', estado: 'EM_LEVANTAMENTO' },
        ])
    })

    it('sem nenhuma pré-definição: lista vazia, e as tabelas da conversa nem são consultadas', async () => {
        montar({ orcamentista_pre_definicao: [] })
        const r = await chamar(rotaDoPainel, 'GET')
        expect(r.status).toBe(200)
        expect(r.corpo.levantamentos).toEqual([])
        expect(leuDe('orcamentista_conversa')).toBe(false)
    })
})

describe('(5) LEITURA APENAS', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s → 405 nas duas rotas, e nada é lido nem escrito', async (metodo) => {
        expect((await chamar(rotaDoPainel, metodo, { body: { estado: 'X' } })).status).toBe(405)
        expect((await chamar(rotaDaSecao, metodo)).status).toBe(405)
        expect(escritas()).toEqual([])
    })

    it('o GET do painel não escreve nada', async () => {
        await chamar(rotaDoPainel, 'GET')
        await chamar(rotaDaSecao, 'GET')
        expect(escritas()).toEqual([])
    })
})

describe('(6) a permissão orcamentista GRAVA em user_module_permissions', () => {
    it('pela rota de permissões do admin: PUT grava a linha, e o GET a devolve', async () => {
        montar({ users: [{ id: 'u-vendedor', tenant_id: T, is_super_admin: false }] })
        const r = await chamar(rotaDePermissoes, 'PUT', {
            query: { id: 'u-vendedor' },
            body: { permissions: [{ module: 'orcamentista', can_view: true, can_edit: false }, { module: 'connectivity', can_view: true, can_edit: true }] },
        })
        expect(r.status).toBe(200)
        expect(estado.db.user_module_permissions).toContainEqual(expect.objectContaining({ user_id: 'u-vendedor', tenant_id: T, module: 'orcamentista', can_view: true, can_edit: false }))
        const lido = await chamar(rotaDePermissoes, 'GET', { query: { id: 'u-vendedor' } })
        expect(lido.corpo).toEqual(expect.arrayContaining([expect.objectContaining({ module: 'orcamentista' })]))
    })

    it('pela rota de salvar funcionário (a tela Permissões de Acesso): grava a linha do orcamentista', async () => {
        montar({ employees: [{ id: 'e1', tenant_id: T, user_id: 'u-vendedor', name: 'Vendedor' }], user_item_access: [] })
        const r = await chamar(rotaDeSalvarFuncionario, 'POST', {
            body: {
                editing_id: 'e1',
                employee: { name: 'Vendedor', user_role: 'user' },
                modulePermissions: { orcamentista: { can_view: true, can_edit: false } },
                itemAccessMode: 'all',
                selectedItemIds: [],
            },
        })
        expect(r.status).toBe(200)
        expect(estado.db.user_module_permissions).toContainEqual(expect.objectContaining({ user_id: 'u-vendedor', module: 'orcamentista', can_view: true }))
    })
})
