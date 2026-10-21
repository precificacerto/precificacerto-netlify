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
 *       divergência da lista passa a usá-la (dono do produto, 21/10/2026);
 *  (11) o TOKEN da conexão não chega ao navegador: nenhuma resposta das três rotas, em sucesso ou
 *       em erro, contém a string dele, em nível nenhum do JSON;
 *  (12) religar com o telefone do cadastro divergente do autorizado RECUSA — 409, nada gravado;
 *  (13) o número da conexão sai do `jid` do `/session/connect`: só os dígitos da parte do
 *       usuário, ou NULL. Depende da migração `20261021000002`, que cria a coluna;
 *  (14) o caminho do QR DEIXA RASTRO: cada chamada ao WUZAPI anota uma linha `[QR-ORCAMENTISTA]`
 *       com o passo e o que voltou — sem token nenhum, nem o QR —, e a tela diz QUAL passo falhou.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

import { numeroDoJid, telefoneDoAutorizado, telefonesCasam } from '@/utils/atendimentos-ia-telefone-do-autorizado'

// ── O banco falso ────────────────────────────────────────────────────────────────────────
type Linha = Record<string, unknown>
interface Operacao { tabela: string; op: string; carga?: unknown; filtros: [string, unknown][] }

const T = 'tenant-da-conta'
const OUTRO = 'tenant-de-outra-conta'
const USUARIO = 'usuario-logado'
/** O token da instância do orçamentista — credencial: fala pelo WhatsApp da empresa. */
const TOKEN_DA_CONEXAO = 'orc_SEGREDO_DA_INSTANCIA_9f8e7d'

const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Operacao[],
    fetches: [] as { url: string; corpo: unknown; headers?: Record<string, string> }[],
    logada: false,
    papel: 'admin',
    /** O corpo que o WUZAPI devolve no `POST /session/connect`. */
    connect: { success: true, data: {} } as unknown,
    /** Caminhos do WUZAPI que respondem com erro. */
    wuzapiFora: new Set<string>(),
    /** Tabela cujas operações o banco falso recusa — com o TOKEN na mensagem, de propósito. */
    falha: null as string | null,
    /** Respostas forçadas por caminho do WUZAPI: status e corpo. */
    respostas: {} as Record<string, { status: number; corpo: unknown }>,
    /** Caminhos do WUZAPI em que o `fetch` LANÇA — a exceção de rede. */
    lancar: new Set<string>(),
}

function executar(tabela: string, op: string, carga: unknown, filtros: [string, unknown][], opcoes?: { onConflict?: string }): { data: Linha[] | null; error: { code: string; message: string } | null } {
    estado.ops.push({ tabela, op, carga, filtros })
    if (estado.falha === tabela) return { data: null, error: { code: 'XX000', message: `falha simulada em ${tabela}, token ${TOKEN_DA_CONEXAO}` } }
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
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
        estado.fetches.push({ url, corpo: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers })
        const caminho = new URL(url).pathname
        if (estado.lancar.has(caminho)) throw new Error(`getaddrinfo ENOTFOUND usapi, token ${TOKEN_DA_CONEXAO}`)
        const forcada = estado.respostas[caminho]
        if (forcada) return { ok: forcada.status >= 200 && forcada.status < 300, status: forcada.status, json: async () => forcada.corpo }
        const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b })
        if (estado.wuzapiFora.has(caminho)) return { ok: false, status: 500, json: async () => ({ error: `fora, token ${TOKEN_DA_CONEXAO}` }) }
        if (caminho === '/session/connect') return json(estado.connect)
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
    estado.connect = { success: true, data: {} }
    estado.wuzapiFora = new Set()
    estado.falha = null
    estado.respostas = {}
    estado.lancar = new Set()
    process.env.WUZAPI_ADMIN_TOKEN = 'admin-de-teste'
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
            [null, null],
            ['5555', '5555'],
        ])('o que não é telefone não casa com nada: (%p, %p)', (remetente, gravado) => {
            expect(telefonesCasam(remetente, gravado)).toBe(false)
        })
    })

    describe('a GRAVAÇÃO — do employees.phone com 55 sai sem 55, e uma linha por pessoa', () => {
        const comDDI = { id: 'f-ddi', tenant_id: T, name: 'Fabi', position: null as string | null, phone: '+55 (54) 99988-7766', is_active: true, status: 'ACTIVE' }
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

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(11) o TOKEN da conexão não chega ao navegador — em nenhuma resposta, em nenhum nível', () => {
    /** Varre o JSON INTEIRO: toda string, em todo nível, chaves incluídas. */
    function strings(v: unknown, saida: string[] = []): string[] {
        if (typeof v === 'string') saida.push(v)
        else if (Array.isArray(v)) v.forEach((x) => strings(x, saida))
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { saida.push(k); strings(x, saida) }
        return saida
    }
    const vazou = (corpo: unknown) => strings(corpo).filter((x) => x.includes(TOKEN_DA_CONEXAO))

    const conectada = (ativo: boolean) => ({
        whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN_DA_CONEXAO, conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo }],
        orcamentista_remetente_autorizado: [{ id: 'a1', tenant_id: T, telefone: '51999887766', nome: 'Ana', employee_id: 'f-com', ativo: true }],
    })

    type Cenario = [string, () => void, Rota, string, unknown]
    const cenarios: Cenario[] = [
        ['conexao GET, logada', () => { estado.logada = true }, rotaConexao, 'GET', undefined],
        ['conexao GET, deslogada', () => { estado.logada = false }, rotaConexao, 'GET', undefined],
        ['conexao GET, WUZAPI fora', () => { estado.wuzapiFora.add('/session/status') }, rotaConexao, 'GET', undefined],
        ['conexao GET, banco falhando', () => { estado.falha = 'whatsapp_conexao' }, rotaConexao, 'GET', undefined],
        ['conexao DELETE, sucesso', () => {}, rotaConexao, 'DELETE', undefined],
        ['conexao DELETE, logout recusado', () => { estado.wuzapiFora.add('/session/logout') }, rotaConexao, 'DELETE', undefined],
        ['qr POST, já logada', () => { estado.logada = true }, rotaQr, 'POST', undefined],
        ['qr POST, devolve o QR', () => {}, rotaQr, 'POST', undefined],
        ['qr POST, sem QR', () => { estado.wuzapiFora.add('/session/qr') }, rotaQr, 'POST', undefined],
        ['qr POST, banco falhando', () => { estado.falha = 'whatsapp_conexao' }, rotaQr, 'POST', undefined],
        ['autorizados GET', () => {}, rotaAutorizados, 'GET', undefined],
        ['autorizados POST', () => {}, rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'desligar' }],
        ['autorizados GET, banco falhando', () => { estado.falha = 'employees' }, rotaAutorizados, 'GET', undefined],
        ['seção desligada', () => { estado.db.orcamentista_config[0].ativo = false }, rotaConexao, 'GET', undefined],
        ['sem permissão', () => { estado.papel = 'seller'; estado.db.user_module_permissions = [] }, rotaConexao, 'GET', undefined],
    ]

    it.each(cenarios)('%s: a resposta não contém o token', async (_nome, preparar, rota, metodo, corpo) => {
        montar(conectada(true))
        preparar()
        const r = await chamar(rota, metodo, corpo)
        expect(r.status).toBeGreaterThan(0)
        expect(vazou(r.corpo)).toEqual([])
    })

    it('o caso discrimina: o token ESTÁ na conexão lida e nas mensagens de erro simuladas', async () => {
        montar(conectada(true))
        expect(JSON.stringify(estado.db.whatsapp_conexao)).toContain(TOKEN_DA_CONEXAO)
        estado.falha = 'whatsapp_conexao'
        await chamar(rotaConexao, 'GET')
        expect(vazou({ detalhe: 'x', de: [{ fundo: TOKEN_DA_CONEXAO }] })).toHaveLength(1)
    })

    it('o token do QR NOVO também não sai', async () => {
        const r = await chamar(rotaQr, 'POST')
        const novo = String(estado.db.whatsapp_conexao[0].wuzapi_token)
        expect(novo).toMatch(/^orc_/)
        expect(JSON.stringify(r.corpo)).not.toContain(novo)
    })
})

describe('(12) religar com divergência RECUSA — o número antigo pode ser de outra pessoa', () => {
    // Ana trocou de telefone no cadastro enquanto a autorização estava desligada.
    const desligadaComNumeroAntigo = () => montar({
        orcamentista_remetente_autorizado: [{ id: 'a1', tenant_id: T, telefone: '51900001111', nome: 'Ana', employee_id: 'f-com', ativo: false }],
    })

    it('religar divergente: 409 com o motivo, e NENHUMA escrita', async () => {
        desligadaComNumeroAntigo()
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar' })
        expect(r.status).toBe(409)
        expect(String(r.corpo.error)).toMatch(/telefone do cadastro mudou; atualize antes de liberar/)
        expect(escritas()).toEqual([])
        expect(estado.db.orcamentista_remetente_autorizado[0]).toEqual(expect.objectContaining({ telefone: '51900001111', ativo: false }))
    })

    it('ligada e divergente: ligar de novo também recusa, e nada muda', async () => {
        montar({ orcamentista_remetente_autorizado: [{ id: 'a1', tenant_id: T, telefone: '51900001111', nome: 'Ana', employee_id: 'f-com', ativo: true }] })
        expect((await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar' })).status).toBe(409)
        expect(escritas()).toEqual([])
    })

    it('atualizar-telefone e DEPOIS religar: funciona, com o número do cadastro', async () => {
        desligadaComNumeroAntigo()
        expect((await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'atualizar-telefone' })).status).toBe(200)
        expect((await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar' })).status).toBe(200)
        expect(estado.db.orcamentista_remetente_autorizado).toEqual([expect.objectContaining({ id: 'a1', telefone: '51999887766', ativo: true })])
    })

    it('religar SEM divergência funciona como antes — inclusive com o 55 só de um lado', async () => {
        montar({ orcamentista_remetente_autorizado: [{ id: 'a1', tenant_id: T, telefone: '5551999887766', nome: 'Ana', employee_id: 'f-com', ativo: false }] })
        const r = await chamar(rotaAutorizados, 'POST', { employee_id: 'f-com', acao: 'ligar' })
        expect(r.status).toBe(200)
        expect(escritas('orcamentista_remetente_autorizado')).toEqual([expect.objectContaining({ op: 'update', carga: { ativo: true } })])
    })
})

describe('(13) o número da conexão sai do jid do /session/connect — ou fica NULL', () => {
    describe('numeroDoJid', () => {
        it.each([
            ['5554999887766.0:52@s.whatsapp.net', '5554999887766'],
            ['5554999887766:12@s.whatsapp.net', '5554999887766'],
            ['5554999887766@s.whatsapp.net', '5554999887766'],
        ])('"%s" → "%s"', (jid, numero) => {
            expect(numeroDoJid(jid)).toBe(numero)
        })

        it.each([
            [undefined], [null], [''], [5554999887766], [{ user: '5554999887766' }],
            ['5554999887766'],
            ['@s.whatsapp.net'],
            ['abc@s.whatsapp.net'],
            ['+5554999887766@s.whatsapp.net'],
            ['55 54 99988@s.whatsapp.net'],
            ['123456789012345@lid'],
            ['120363025246125486@g.us'],
            ['12345@s.whatsapp.net'],
        ])('formato estranho %p → NULL, sem lixo', (jid) => {
            expect(numeroDoJid(jid)).toBeNull()
        })
    })

    const conexaoExistente = () => montar({
        whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: 'orc_x', conectado_por: USUARIO, conectado_em: '2026-10-01T00:00:00Z', ativo: false, numero: '5551900000000' }],
    })

    it('resposta COM jid: grava só os dígitos', async () => {
        conexaoExistente()
        estado.connect = { code: 200, success: true, data: { details: 'Connected!', jid: '5554999887766.0:52@s.whatsapp.net' } }
        expect((await chamar(rotaQr, 'POST')).status).toBe(200)
        expect(estado.db.whatsapp_conexao[0].numero).toBe('5554999887766')
    })

    it('resposta SEM jid: NULL — e o número de uma conexão anterior não sobrevive ao QR novo', async () => {
        conexaoExistente()
        estado.connect = { code: 200, success: true, data: { details: 'Connected!' } }
        expect((await chamar(rotaQr, 'POST')).status).toBe(200)
        expect(estado.db.whatsapp_conexao[0].numero).toBeNull()
    })

    it('jid estranho: NULL, nada de lixo na coluna', async () => {
        conexaoExistente()
        estado.connect = { success: true, data: { jid: '123456789012345@lid' } }
        await chamar(rotaQr, 'POST')
        expect(estado.db.whatsapp_conexao[0].numero).toBeNull()
    })

    it('connect sem corpo legível: NULL', async () => {
        conexaoExistente()
        estado.wuzapiFora.add('/session/connect')
        await chamar(rotaQr, 'POST')
        expect(estado.db.whatsapp_conexao[0].numero).toBeNull()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(14) o caminho do QR deixa rastro, sem segredo, e a tela diz qual passo falhou', () => {
    let linhas: string[] = []
    let espioes: jest.SpyInstance[] = []
    beforeEach(() => {
        linhas = []
        const anotar = (...a: unknown[]) => { linhas.push(a.map(String).join(' ')) }
        espioes = (['log', 'warn', 'error', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(anotar))
    })
    afterEach(() => espioes.forEach((e) => e.mockRestore()))

    const doQr = () => linhas.filter((l) => l.startsWith('[QR-ORCAMENTISTA]'))
    const linhaDo = (passo: string) => doQr().find((l) => l.includes(`passo=${passo}`))
    const tokenGerado = () => String(estado.db.whatsapp_conexao[0]?.wuzapi_token ?? '')
    const conexaoExistente = () => montar({
        whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN_DA_CONEXAO, conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: false }],
    })

    describe('o rastro: uma linha por chamada, com o status e o que voltou', () => {
        it('instância nova: criar, connect e qr — cada um com o status', async () => {
            estado.respostas['/admin/users'] = { status: 200, corpo: { code: 200, success: true, data: { id: 'abc123' } } }
            estado.respostas['/session/connect'] = { status: 200, corpo: { code: 200, success: true, data: { details: 'Connected!' } } }
            expect((await chamar(rotaQr, 'POST')).status).toBe(200)
            expect(linhaDo('criar-instancia')).toEqual(expect.stringContaining('status=200'))
            expect(linhaDo('criar-instancia')).toEqual(expect.stringContaining('abc123'))
            expect(linhaDo('session-connect')).toEqual(expect.stringContaining('status=200'))
            expect(linhaDo('session-connect')).toEqual(expect.stringContaining('Connected!'))
            expect(linhaDo('session-qr')).toEqual(expect.stringMatching(/status=200.*veio_corpo=sim.*veio_qr=sim/))
        })

        it('instância EXISTENTE: não chama /admin/users, reusa o token, e diz que reusou', async () => {
            conexaoExistente()
            expect((await chamar(rotaQr, 'POST')).status).toBe(200)
            expect(estado.fetches.some((f) => f.url.endsWith('/admin/users'))).toBe(false)
            expect(estado.fetches.find((f) => f.url.endsWith('/session/connect'))?.headers?.token).toBe(TOKEN_DA_CONEXAO)
            expect(estado.db.whatsapp_conexao).toEqual([expect.objectContaining({ wuzapi_token: TOKEN_DA_CONEXAO })])
            expect(linhaDo('instancia')).toEqual(expect.stringContaining('reaproveitada'))
            expect(linhaDo('criar-instancia')).toBeUndefined()
        })

        it('qr sem o campo: status 200, veio corpo, NÃO veio qr', async () => {
            conexaoExistente()
            estado.respostas['/session/qr'] = { status: 200, corpo: { code: 200, success: true, data: { QRCode: '' } } }
            await chamar(rotaQr, 'POST')
            expect(linhaDo('session-qr')).toEqual(expect.stringMatching(/status=200.*veio_corpo=sim.*veio_qr=nao/))
        })

        it('qr com corpo que não é JSON: veio_corpo=nao', async () => {
            conexaoExistente()
            estado.respostas['/session/qr'] = { status: 200, corpo: undefined }
            await chamar(rotaQr, 'POST')
            expect(linhaDo('session-qr')).toEqual(expect.stringMatching(/veio_corpo=nao.*veio_qr=nao/))
        })

        it('exceção de rede: a linha diz qual chamada e o motivo', async () => {
            conexaoExistente()
            estado.lancar.add('/session/connect')
            await chamar(rotaQr, 'POST')
            expect(linhaDo('session-connect')).toEqual(expect.stringMatching(/excecao=.*ENOTFOUND/))
        })

        it('sem WUZAPI_ADMIN_TOKEN: a linha diz que falta a variável — e o nome, não o valor', async () => {
            delete process.env.WUZAPI_ADMIN_TOKEN
            await chamar(rotaQr, 'POST')
            expect(linhaDo('criar-instancia')).toEqual(expect.stringContaining('WUZAPI_ADMIN_TOKEN ausente'))
        })
    })

    describe('NENHUM segredo no log: nem o token da instância, nem o de admin, nem o QR', () => {
        it.each([
            ['criação ecoando o token', () => {
                estado.respostas['/admin/users'] = { status: 200, corpo: { data: { id: 'x', token: 'ECOADO', Token: 'ECOADO2' } } }
            }],
            ['criação recusada, com o token no erro', () => {
                estado.respostas['/admin/users'] = { status: 409, corpo: { error: `user orcamentista-${T} already exists, token ${TOKEN_DA_CONEXAO}, admin admin-de-teste` } }
            }],
            ['connect e qr fora, com o token no corpo', () => { estado.wuzapiFora.add('/session/connect'); estado.wuzapiFora.add('/session/qr') }],
            ['connect lançando com o token na mensagem', () => { estado.lancar.add('/session/connect') }],
            ['connect ecoando o token num campo de outro nome', () => {
                estado.respostas['/session/connect'] = { status: 200, corpo: { data: { instancia: TOKEN_DA_CONEXAO, Authorization: 'admin-de-teste' } } }
            }],
        ])('%s', async (_nome, preparar) => {
            conexaoExistente()
            preparar()
            await chamar(rotaQr, 'POST')
            const tudo = linhas.join('\n')
            expect(doQr().length).toBeGreaterThan(0)
            expect(tudo).not.toContain(TOKEN_DA_CONEXAO)
            expect(tudo).not.toContain('admin-de-teste')
            expect(tudo).not.toContain('QRFALSO')
        })

        it('na instância NOVA, o token gerado também não sai — nem ecoado pelo WUZAPI', async () => {
            estado.respostas['/admin/users'] = { status: 500, corpo: { error: 'x' } }
            const fetchOriginal = globalThis.fetch as jest.Mock
            const eco = jest.fn(async (url: string, init?: { body?: string }) => {
                if (new URL(url).pathname === '/admin/users') {
                    const enviado = JSON.parse(String(init?.body))
                    return { ok: false, status: 500, json: async () => ({ error: `duplicate token ${enviado.token}` }) }
                }
                return fetchOriginal(url, init)
            })
            ;(globalThis as { fetch: unknown }).fetch = eco
            try {
                await chamar(rotaQr, 'POST')
            } finally {
                ;(globalThis as { fetch: unknown }).fetch = fetchOriginal
            }
            const enviado = (eco.mock.calls[0][1] as { body: string }).body
            const gerado = JSON.parse(enviado).token as string
            expect(gerado).toMatch(/^orc_/)
            expect(linhas.join('\n')).not.toContain(gerado)
            expect(linhaDo('criar-instancia')).toEqual(expect.stringContaining('status=500'))
        })
    })

    describe('a tela diz QUAL passo falhou', () => {
        it('criar falhou: "não consegui criar a conexão no servidor de WhatsApp"', async () => {
            estado.respostas['/admin/users'] = { status: 409, corpo: { error: 'already exists' } }
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(r.corpo.passo).toBe('criar-instancia')
            expect(String(r.corpo.error)).toMatch(/Não consegui criar a conexão no servidor de WhatsApp/)
            expect(estado.db.whatsapp_conexao).toEqual([])
            expect(tokenGerado()).toBe('')
        })

        it('sem a variável de admin: o mesmo passo, e a tela diz que a configuração está incompleta', async () => {
            delete process.env.WUZAPI_ADMIN_TOKEN
            const r = await chamar(rotaQr, 'POST')
            expect(r.corpo.passo).toBe('criar-instancia')
            expect(String(r.corpo.error)).toMatch(/Não consegui criar a conexão no servidor de WhatsApp.*configuração/)
        })

        it('connect falhou e não houve QR: "a sessão não abriu"', async () => {
            conexaoExistente()
            estado.wuzapiFora.add('/session/connect')
            estado.wuzapiFora.add('/session/qr')
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(r.corpo.passo).toBe('session-connect')
            expect(String(r.corpo.error)).toMatch(/A sessão de WhatsApp não abriu/)
        })

        it('connect lançou e não houve QR: também "a sessão não abriu"', async () => {
            conexaoExistente()
            estado.lancar.add('/session/connect')
            estado.wuzapiFora.add('/session/qr')
            const r = await chamar(rotaQr, 'POST')
            expect(r.corpo.passo).toBe('session-connect')
        })

        it.each([
            ['o qr respondeu erro', () => { estado.wuzapiFora.add('/session/qr') }],
            ['o qr veio sem o código', () => { estado.respostas['/session/qr'] = { status: 200, corpo: { data: { QRCode: '' } } } }],
            ['o qr lançou', () => { estado.lancar.add('/session/qr') }],
        ])('connect abriu, mas %s: "o servidor não devolveu o código"', async (_nome, preparar) => {
            conexaoExistente()
            preparar()
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(r.corpo.passo).toBe('session-qr')
            expect(String(r.corpo.error)).toMatch(/O servidor de WhatsApp não devolveu o código/)
        })

        it('connect falhou MAS o QR veio: conecta — a sessão já estava aberta esperando a leitura', async () => {
            conexaoExistente()
            estado.wuzapiFora.add('/session/connect')
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(200)
            expect(r.corpo.qr).toBe('data:image/png;base64,QRFALSO')
        })

        it('nenhuma mensagem é só "tente de novo"', async () => {
            conexaoExistente()
            estado.wuzapiFora.add('/session/qr')
            const r = await chamar(rotaQr, 'POST')
            expect(String(r.corpo.error)).not.toBe('O WUZAPI não devolveu o QR Code. Tente de novo.')
            expect(String(r.corpo.error)).not.toMatch(/WUZAPI/)
        })
    })
})
