/**
 * @jest-environment node
 *
 * PORTÃO — a célula do orçamentista em Conectividade: as ROTAS e o módulo do servidor
 * (`src/lib/atendimentos-ia/orcamentista-da-empresa.ts`). Maquete aprovada em 21/10/2026.
 *
 * O banco é FALSO e em memória, e REGISTRA cada operação (tabela, select/insert/update/upsert/
 * delete, carga, filtros): os portões afirmam pelo que foi EMITIDO, não pelo que a rota respondeu.
 * Ele imita as duas UNIQUE da migração que importam aqui — (tenant_id, telefone) do autorizado e
 * (tenant_id, canal) da conexão.
 * O que NÃO alcança: o Postgres real, e as migrações `20261020000003` e `20261021000001`, que NÃO
 * estão aplicadas — este PR não pode ir para produção antes delas.
 *
 *   (1) seção desligada (`orcamentista_config.ativo = false`, ou sem linha): as rotas respondem 404
 *       e nada é gravado;
 *   (2) conectar grava em `whatsapp_conexao`, canal ORCAMENTISTA, com uma instância NOVA — e NÃO
 *       toca `users.wuzapi_token`;
 *   (3) reconectar SUBSTITUI a conexão do tenant e NÃO altera nenhuma linha de autorizado; e
 *       desconectar também não;
 *   (4) desligar a chave é UPDATE ativo = false — nenhum DELETE é emitido;
 *   (5) funcionário sem telefone: a linha diz "sem telefone", a chave é inoperante, e ligar não
 *       grava nada;
 *   (6) o telefone com máscara (ou com o DDI) vira só dígitos antes de gravar;
 *   (7) o tenant_id do corpo da requisição é ignorado;
 *   (8) a divergência entre o cadastro e a autorização aparece, e só se atualiza quando pedido;
 *   (9) a permissão: quem só VÊ Conectividade lê e desconecta (desconectar é livre para quem
 *       enxerga a tela — dono do produto, 21/10/2026); conectar e mexer na lista exigem EDITAR;
 *  (10) o 55: a lista grava DDD + número, sem o DDI, e o webhook entrega o remetente COM ele.
 *       A COMPARAÇÃO (`telefonesCasam`) é testada de verdade — não só a gravação —, e a
 *       divergência da lista passa a usá-la (dono do produto, 21/10/2026).
 */
import type { NextApiRequest, NextApiResponse } from 'next'

import { telefoneDoAutorizado, telefonesCasam } from '@/utils/atendimentos-ia-telefone-do-autorizado'

// ── O banco falso ────────────────────────────────────────────────────────────────────────
type Linha = Record<string, unknown>
interface Operacao { tabela: string; op: string; carga?: unknown; filtros: [string, unknown][] }

const T = 'tenant-da-conta'
const OUTRO = 'tenant-de-outra-conta'
const USUARIO = 'usuario-logado'

const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Operacao[],
    fetches: [] as { url: string; corpo: unknown }[],
    logada: false,
    papel: 'admin',
}

function executar(tabela: string, op: string, carga: unknown, filtros: [string, unknown][], opcoes?: { onConflict?: string }): { data: Linha[] | null; error: { code: string; message: string } | null } {
    estado.ops.push({ tabela, op, carga, filtros })
    const linhas = (estado.db[tabela] ??= [])
    const casa = (l: Linha) => filtros.every(([c, v]) => l[c] === v)
    if (op === 'select') return { data: linhas.filter(casa), error: null }
    if (op === 'delete') { estado.db[tabela] = linhas.filter((l) => !casa(l)); return { data: null, error: null } }
    if (op === 'update') {
        for (const l of linhas.filter(casa)) {
            const nova = { ...l, ...(carga as Linha) }
            if (tabela === 'orcamentista_remetente_autorizado' && linhas.some((o) => o !== l && o.tenant_id === nova.tenant_id && o.telefone === nova.telefone)) {
                return { data: null, error: { code: '23505', message: 'duplicate key orcamentista_remetente_autorizado_telefone_key' } }
            }
            Object.assign(l, carga as Linha)
        }
        return { data: null, error: null }
    }
    const nova: Linha = { id: `id-${linhas.length + 1}-${tabela}`, ...(carga as Linha) }
    if (op === 'insert') {
        if (tabela === 'orcamentista_remetente_autorizado' && linhas.some((o) => o.tenant_id === nova.tenant_id && o.telefone === nova.telefone)) {
            return { data: null, error: { code: '23505', message: 'duplicate key orcamentista_remetente_autorizado_telefone_key' } }
        }
        linhas.push(nova)
        return { data: [nova], error: null }
    }
    // upsert, pela chave declarada
    const chave = (opcoes?.onConflict ?? 'id').split(',')
    const existente = linhas.find((l) => chave.every((c) => l[c] === nova[c]))
    if (existente) Object.assign(existente, carga as Linha)
    else linhas.push(nova)
    return { data: null, error: null }
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
            q.order = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            q.delete = () => { op = 'delete'; return q }
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return rodar() }
            q.upsert = (c: unknown, o: { onConflict?: string }) => Promise.resolve(executar(tabela, 'upsert', c, filtros, o))
            q.maybeSingle = () => rodar().then((r) => ({ data: r.data?.[0] ?? null, error: r.error }))
            q.single = q.maybeSingle
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro)
            return q
        },
    },
}))

jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async () => ({ user_id: 'usuario-logado', tenant_id: 'tenant-da-conta', role: estado.papel, is_super_admin: false }),
}))

// ── O WUZAPI falso ───────────────────────────────────────────────────────────────────────
beforeAll(() => {
    process.env.WUZAPI_ADMIN_TOKEN = 'admin-de-teste'
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { body?: string }) => {
        estado.fetches.push({ url, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const caminho = new URL(url).pathname
        const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b })
        if (caminho === '/session/status') return json({ data: { Connected: true, LoggedIn: estado.logada } })
        if (caminho === '/session/qr') return json({ data: { QRCode: 'data:image/png;base64,QRFALSO' } })
        return json({ success: true, data: {} })
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaConexao = require('@/pages/api/atendimentos-ia/orcamentista/conexao').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaQr = require('@/pages/api/atendimentos-ia/orcamentista/qr').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaAutorizados = require('@/pages/api/atendimentos-ia/orcamentista/autorizados').default

type Rota = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
async function chamar(rota: Rota, method: string, body?: unknown): Promise<{ status: number; corpo: Record<string, unknown> }> {
    const saida = { status: 0, corpo: {} as Record<string, unknown> }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: Record<string, unknown>) { saida.corpo = b; return res },
        end() { return res },
    } as unknown as NextApiResponse
    await rota({ method, body, query: {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}

const escritas = (tabela?: string) => estado.ops.filter((o) => o.op !== 'select' && (!tabela || o.tabela === tabela))

function montar(extra: Partial<Record<string, Linha[]>> = {}) {
    estado.db = {
        orcamentista_config: [{ tenant_id: T, ativo: true }, { tenant_id: OUTRO, ativo: true }],
        users: [{ id: USUARIO, tenant_id: T, name: 'Quem Logou', wuzapi_token: 'token-do-envio-do-usuario' }],
        employees: [
            { id: 'f-com', tenant_id: T, name: 'Ana', position: 'Vendedora', phone: '(51) 99988-7766', is_active: true, status: 'ACTIVE' },
            { id: 'f-sem', tenant_id: T, name: 'Bruno', position: 'Vendedor', phone: null, is_active: true, status: 'ACTIVE' },
            { id: 'f-curto', tenant_id: T, name: 'Caio', position: null, phone: '5555', is_active: true, status: 'ACTIVE' },
            { id: 'f-inativo', tenant_id: T, name: 'Dora', position: null, phone: '51988887777', is_active: false, status: 'ACTIVE' },
            { id: 'f-outra', tenant_id: OUTRO, name: 'Eva', position: null, phone: '51977776666', is_active: true, status: 'ACTIVE' },
        ],
        whatsapp_conexao: [],
        orcamentista_remetente_autorizado: [],
        ...extra,
    } as Record<string, Linha[]>
    estado.ops = []
    estado.fetches = []
    estado.logada = false
    estado.papel = 'admin'
}
beforeEach(() => montar())

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) a seção desligada: a rota não devolve nada, e nada é gravado', () => {
    it.each([
        ['ativo = false', [{ tenant_id: T, ativo: false }]],
        ['sem linha de configuração', []],
    ])('%s → 404 nas três rotas', async (_n, config) => {
        montar({ orcamentista_config: config })
        expect((await chamar(rotaConexao, 'GET')).status).toBe(404)
        expect((await chamar(rotaAutorizados, 'GET')).status).toBe(404)
        expect((await chamar(rotaQr, 'POST')).status).toBe(404)
        expect((await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar' })).status).toBe(404)
        expect((await chamar(rotaConexao, 'DELETE')).status).toBe(404)
        expect(escritas()).toEqual([])
        expect(estado.fetches).toEqual([])
    })

    it('a lista NÃO sai com a seção desligada — nem os nomes dos funcionários', async () => {
        montar({ orcamentista_config: [{ tenant_id: T, ativo: false }] })
        const r = await chamar(rotaAutorizados, 'GET')
        expect(JSON.stringify(r.corpo)).not.toContain('Ana')
    })
})

describe('(2) conectar grava em whatsapp_conexao, e NÃO toca users.wuzapi_token', () => {
    it('instância NOVA no WUZAPI, linha do canal ORCAMENTISTA, e o token do envio intacto', async () => {
        const r = await chamar(rotaQr, 'POST')
        expect(r.status).toBe(200)
        expect(r.corpo.qr).toBe('data:image/png;base64,QRFALSO')

        const [conexao] = estado.db.whatsapp_conexao
        expect(conexao).toEqual(expect.objectContaining({ tenant_id: T, canal: 'ORCAMENTISTA', conectado_por: USUARIO, ativo: false }))
        expect(conexao.wuzapi_token).not.toBe('token-do-envio-do-usuario')

        const criada = estado.fetches.find((f) => f.url.endsWith('/admin/users'))
        expect((criada?.corpo as { token: string }).token).toBe(conexao.wuzapi_token)

        expect(escritas('users')).toEqual([])
        expect(estado.ops.filter((o) => o.tabela === 'users' && JSON.stringify(o).includes('wuzapi_token'))).toEqual([])
        expect(estado.db.users[0].wuzapi_token).toBe('token-do-envio-do-usuario')
    })

    it('já conectado: não pede QR, não cria instância, não grava', async () => {
        montar({ whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: 'orc_existente', conectado_por: 'x', conectado_em: '2026-10-20T00:00:00Z', ativo: true }] })
        estado.logada = true
        const r = await chamar(rotaQr, 'POST')
        expect(r.corpo.conectado).toBe(true)
        expect(escritas()).toEqual([])
        expect(estado.fetches.some((f) => f.url.endsWith('/admin/users'))).toBe(false)
    })
})

describe('(3) reconectar SUBSTITUI a conexão e NÃO altera autorizado; desconectar também não', () => {
    const AUTORIZADOS = () => [
        { id: 'a1', tenant_id: T, telefone: '51999887766', nome: 'Ana', employee_id: 'f-com', ativo: true },
        { id: 'a2', tenant_id: T, telefone: '51911112222', nome: 'Fora', employee_id: null, ativo: false },
    ]

    it('reconectar: uma linha só, com quem pediu o QR, e a lista intacta', async () => {
        montar({
            whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: 'orc_antigo', conectado_por: 'quem-conectou-antes', conectado_em: '2026-10-01T00:00:00Z', ativo: false }],
            orcamentista_remetente_autorizado: AUTORIZADOS(),
        })
        const r = await chamar(rotaQr, 'POST')
        expect(r.status).toBe(200)
        expect(estado.db.whatsapp_conexao).toHaveLength(1)
        expect(estado.db.whatsapp_conexao[0]).toEqual(expect.objectContaining({ conectado_por: USUARIO, canal: 'ORCAMENTISTA' }))
        expect(estado.ops.filter((o) => o.tabela === 'orcamentista_remetente_autorizado')).toEqual([])
        expect(estado.db.orcamentista_remetente_autorizado).toEqual(AUTORIZADOS())
    })

    it('desconectar: logout no WUZAPI, ativo = false, nenhum DELETE, e a lista intacta', async () => {
        montar({
            whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: 'orc_x', conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: true }],
            orcamentista_remetente_autorizado: AUTORIZADOS(),
        })
        const r = await chamar(rotaConexao, 'DELETE')
        expect(r.status).toBe(200)
        expect(estado.fetches.some((f) => f.url.endsWith('/session/logout'))).toBe(true)
        expect(estado.db.whatsapp_conexao[0].ativo).toBe(false)
        expect(estado.ops.filter((o) => o.op === 'delete')).toEqual([])
        expect(estado.ops.filter((o) => o.tabela === 'orcamentista_remetente_autorizado')).toEqual([])
        expect(escritas('users')).toEqual([])
    })
})

describe('(4) desligar a chave é UPDATE ativo = false — nenhum DELETE', () => {
    it('o autorizado continua, desligado', async () => {
        montar({ orcamentista_remetente_autorizado: [{ id: 'a1', tenant_id: T, telefone: '51999887766', nome: 'Ana', employee_id: 'f-com', ativo: true }] })
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'desligar' })
        expect(r.status).toBe(200)
        expect(estado.ops.filter((o) => o.op === 'delete')).toEqual([])
        expect(escritas('orcamentista_remetente_autorizado')).toEqual([expect.objectContaining({ op: 'update', carga: { ativo: false } })])
        expect(estado.db.orcamentista_remetente_autorizado).toEqual([expect.objectContaining({ id: 'a1', ativo: false, telefone: '51999887766' })])
    })
})

describe('(5) funcionário sem telefone: a chave é inoperante, e nada é gravado', () => {
    it('a lista traz TODOS os ativos — os sem telefone com o motivo, e sem poder ligar', async () => {
        const r = await chamar(rotaAutorizados, 'GET')
        const linhas = r.corpo.linhas as Array<Record<string, unknown>>
        expect(linhas.map((l) => l.employee_id).sort()).toEqual(['f-com', 'f-curto', 'f-sem'])
        const sem = linhas.find((l) => l.employee_id === 'f-sem')!
        expect(sem).toEqual(expect.objectContaining({ telefone: null, podeLigar: false, podeDesligar: false }))
        expect(String(sem.motivoSemTelefone)).toMatch(/sem telefone/)
        const curto = linhas.find((l) => l.employee_id === 'f-curto')!
        expect(curto).toEqual(expect.objectContaining({ telefone: null, podeLigar: false }))
        expect(String(curto.motivoSemTelefone)).toContain('5555')
    })

    it.each(['f-sem', 'f-curto'])('ligar %s → 422, e nada é gravado', async (id) => {
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: id, acao: 'ligar' })
        expect(r.status).toBe(422)
        expect(escritas()).toEqual([])
    })
})

describe('(6) o telefone com máscara vira só dígitos antes de gravar', () => {
    it('"(51) 99988-7766" grava "51999887766"', async () => {
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar' })
        expect(r.status).toBe(200)
        expect(escritas('orcamentista_remetente_autorizado')).toEqual([
            expect.objectContaining({ op: 'insert', carga: { tenant_id: T, telefone: '51999887766', nome: 'Ana', employee_id: 'f-com', ativo: true } }),
        ])
    })

    it.each([
        ['(51) 99988-7766', '51999887766'],
        ['+55 51 99988-7766', '51999887766'],
        ['5551999887766', '51999887766'],
        ['51 3333-4444', '5133334444'],
    ])('%s → %s', (bruto, esperado) => {
        expect(telefoneDoAutorizado(bruto)).toEqual({ ok: true, telefone: esperado })
    })

    it.each(['5555', '', '51999999999999999999999', 'abc'])('"%s" não é telefone', (bruto) => {
        expect(telefoneDoAutorizado(bruto).ok).toBe(false)
    })
})

describe('(7) o tenant_id do corpo é ignorado', () => {
    it('grava no tenant do usuário logado, não no do corpo', async () => {
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar', tenant_id: OUTRO })
        expect(r.status).toBe(200)
        expect(estado.db.orcamentista_remetente_autorizado).toEqual([expect.objectContaining({ tenant_id: T })])
    })

    it('funcionário de OUTRA conta não é alcançável — nem informando o tenant dela', async () => {
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: 'f-outra', acao: 'ligar', tenant_id: OUTRO })
        expect(r.status).toBe(404)
        expect(escritas()).toEqual([])
    })
})

describe('(8) a divergência entre o cadastro e a autorização', () => {
    beforeEach(() => montar({ orcamentista_remetente_autorizado: [{ id: 'a1', tenant_id: T, telefone: '51900001111', nome: 'Ana', employee_id: 'f-com', ativo: true }] }))

    it('aparece na linha, e a lista NÃO sincroniza sozinha', async () => {
        const r = await chamar(rotaAutorizados, 'GET')
        const ana = (r.corpo.linhas as Array<Record<string, unknown>>).find((l) => l.employee_id === 'f-com')!
        expect(ana.divergente).toBe(true)
        expect(escritas()).toEqual([])
        expect(estado.db.orcamentista_remetente_autorizado[0].telefone).toBe('51900001111')
    })

    it('atualizar grava o telefone do cadastro, normalizado', async () => {
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'atualizar-telefone' })
        expect(r.status).toBe(200)
        expect(estado.db.orcamentista_remetente_autorizado[0].telefone).toBe('51999887766')
    })
})

describe('(9) a permissão: ver lê e desconecta; editar conecta e mexe na lista', () => {
    beforeEach(() => {
        montar({
            user_module_permissions: [{ user_id: USUARIO, tenant_id: T, module: 'connectivity', can_view: true, can_edit: false }],
            whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: 'orc_x', conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: true }],
        })
        estado.papel = 'seller'
    })

    it('quem só vê: lê a conexão e a lista, e DESCONECTA', async () => {
        expect((await chamar(rotaConexao, 'GET')).status).toBe(200)
        expect((await chamar(rotaAutorizados, 'GET')).status).toBe(200)
        expect((await chamar(rotaConexao, 'DELETE')).status).toBe(200)
    })

    it('quem só vê: NÃO conecta e NÃO mexe na lista — 403, e nada gravado', async () => {
        expect((await chamar(rotaQr, 'POST')).status).toBe(403)
        expect((await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar' })).status).toBe(403)
        expect(escritas()).toEqual([])
    })

    it('quem não vê: 403 até para ler', async () => {
        estado.db.user_module_permissions[0].can_view = false
        expect((await chamar(rotaConexao, 'GET')).status).toBe(403)
        expect((await chamar(rotaAutorizados, 'GET')).status).toBe(403)
    })
})

describe('(10) o 55: a lista grava sem o DDI, e o webhook entrega com ele', () => {
    const GRAVADO = '54999887766'

    describe('a COMPARAÇÃO — telefonesCasam(remetente, gravado)', () => {
        it.each([
            '5554999887766',
            '54999887766',
            '+55 (54) 99988-7766',
            '55 54 9 9988 7766',
        ])('"%s" casa com o autorizado gravado como "54999887766"', (remetente) => {
            expect(telefonesCasam(remetente, GRAVADO)).toBe(true)
        })

        it.each([
            '5551999887766',
            '51999887766',
            '+55 (11) 99988-7766',
        ])('"%s" — OUTRO DDD — NÃO casa', (remetente) => {
            expect(telefonesCasam(remetente, GRAVADO)).toBe(false)
        })

        it('o gravado COM o 55 também casa — a comparação é dos dois lados', () => {
            expect(telefonesCasam('54999887766', '5554999887766')).toBe(true)
        })

        it('DDD 55 (Santa Maria): o 55 do DDD NÃO é tirado como se fosse DDI', () => {
            expect(telefonesCasam('5555999887766', '55999887766')).toBe(true)
            expect(telefonesCasam('55999887766', '55999887766')).toBe(true)
            expect(telefonesCasam('55999887766', '999887766')).toBe(false)
        })

        it.each([
            [null, GRAVADO],
            ['', GRAVADO],
            ['5555', GRAVADO],
            ['5554999887766', null],
            ['5554999887766', ''],
        ])('o que não é telefone não casa com nada: (%p, %p)', (remetente, gravado) => {
            expect(telefonesCasam(remetente, gravado)).toBe(false)
        })
    })

    describe('a GRAVAÇÃO — do employees.phone com 55 sai sem 55, e uma linha por pessoa', () => {
        const comDDI = { id: 'f-ddi', tenant_id: T, name: 'Fabi', position: null, phone: '+55 (54) 99988-7766', is_active: true, status: 'ACTIVE' }
        const empregados = () => [comDDI]

        it('ligar grava "54999887766", sem o 55', async () => {
            montar({ employees: empregados() })
            expect((await chamar(rotaAutorizados, 'POST', { employee_id: 'f-ddi', acao: 'ligar' })).status).toBe(200)
            expect(estado.db.orcamentista_remetente_autorizado).toEqual([expect.objectContaining({ telefone: GRAVADO, employee_id: 'f-ddi' })])
        })

        it('ligar, desligar e ligar de novo: UMA linha só, reativada — nenhum segundo INSERT', async () => {
            montar({ employees: empregados() })
            await chamar(rotaAutorizados, 'POST', { employee_id: 'f-ddi', acao: 'ligar' })
            await chamar(rotaAutorizados, 'POST', { employee_id: 'f-ddi', acao: 'desligar' })
            await chamar(rotaAutorizados, 'POST', { employee_id: 'f-ddi', acao: 'ligar' })
            expect(estado.db.orcamentista_remetente_autorizado).toEqual([expect.objectContaining({ telefone: GRAVADO, ativo: true })])
            expect(escritas('orcamentista_remetente_autorizado').filter((o) => o.op === 'insert')).toHaveLength(1)
        })

        it('o mesmo número já autorizado SEM o 55, para outra linha: o banco recusa, e não há duas', async () => {
            montar({
                employees: empregados(),
                orcamentista_remetente_autorizado: [{ id: 'a-avulso', tenant_id: T, telefone: GRAVADO, nome: 'Fabi', employee_id: null, ativo: true }],
            })
            expect((await chamar(rotaAutorizados, 'POST', { employee_id: 'f-ddi', acao: 'ligar' })).status).toBe(409)
            expect(estado.db.orcamentista_remetente_autorizado).toHaveLength(1)
        })

        it('autorizado gravado COM o 55 e o cadastro sem: NÃO é divergência — é o mesmo número', async () => {
            montar({ orcamentista_remetente_autorizado: [{ id: 'a1', tenant_id: T, telefone: '5551999887766', nome: 'Ana', employee_id: 'f-com', ativo: true }] })
            const r = await chamar(rotaAutorizados, 'GET')
            const ana = (r.corpo.linhas as Array<Record<string, unknown>>).find((l) => l.employee_id === 'f-com')!
            expect(ana.divergente).toBe(false)
        })
    })
})
