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
 *  (15) o TOKEN FANTASMA (21/10/2026): a conexão só é gravada depois de o WUZAPI RECONHECER o token
 *       novo; e, ao reusar, um 401 descarta a conexão gravada e cria UMA instância nova — uma vez por
 *       clique, sem laço, e nunca para um token recém-criado.
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
    /** Tokens que o WUZAPI NÃO conhece — toda chamada com eles dá 401 (o "token fantasma"). */
    tokensDesconhecidos: new Set<string>(),
    /** O WUZAPI não conhece token NENHUM — nem o recém-criado. */
    todoTokenDesconhecido: false,
    /** Respostas do `GET /session/qr` em ORDEM, uma por consulta; esgotadas, vale o comportamento normal. */
    sequenciaDoQr: [] as Array<{ status: number; corpo: unknown } | 'lanca'>,
    /** As esperas pedidas ao relógio do QR, em ms — o relógio é VIRTUAL nos testes. */
    esperas: [] as number[],
    /** O tempo virtual, em ms. */
    agora: 0,
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
        const tokenDaChamada = init?.headers?.token
        if (tokenDaChamada && (estado.todoTokenDesconhecido || estado.tokensDesconhecidos.has(tokenDaChamada))) {
            return { ok: false, status: 401, json: async () => ({ code: 401, error: 'unauthorized', success: false }) }
        }
        if (caminho === '/session/qr' && estado.sequenciaDoQr.length) {
            const proxima = estado.sequenciaDoQr.shift()!
            if (proxima === 'lanca') throw new Error('socket hang up')
            return { ok: proxima.status >= 200 && proxima.status < 300, status: proxima.status, json: async () => proxima.corpo }
        }
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PREFIXO_DO_LOG_DO_QR } = require('@/lib/atendimentos-ia/orcamentista-da-empresa') as { PREFIXO_DO_LOG_DO_QR: string }

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
    estado.tokensDesconhecidos = new Set()
    estado.todoTokenDesconhecido = false
    estado.sequenciaDoQr = []
    estado.esperas = []
    estado.agora = 0
    process.env.WUZAPI_ADMIN_TOKEN = 'admin-de-teste'
}
beforeEach(() => montar())

// O relógio do QR é VIRTUAL: esperar não custa tempo de teste, e cada espera fica registrada.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moduloDoOrcamentista = require('@/lib/atendimentos-ia/orcamentista-da-empresa') as {
    relogioDoQr?: { agora: () => number; dormir: (ms: number) => Promise<void> }
    ESPERA_DO_QR?: { intervaloMs: number; tetoMs: number }
}
let relogioReal: { agora: () => number; dormir: (ms: number) => Promise<void> } | undefined
beforeEach(() => {
    const r = moduloDoOrcamentista.relogioDoQr
    if (!r) return
    relogioReal = { ...r }
    r.agora = () => estado.agora
    r.dormir = async (ms: number) => { estado.esperas.push(ms); estado.agora += ms }
})
afterEach(() => { if (relogioReal && moduloDoOrcamentista.relogioDoQr) Object.assign(moduloDoOrcamentista.relogioDoQr, relogioReal) })

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
            // A criação só é chamada SEM conexão gravada — com ela, o token é reusado e o eco nunca
            // aconteceria: por isso os dois primeiros casos não montam a conexão.
            ['criação ecoando o token, em "token" e "Token"', false, 'criar-instancia', () => {
                estado.respostas['/admin/users'] = { status: 201, corpo: { code: 201, data: { id: 'x', token: 'ECOADO', Token: 'ECOADO2' }, success: true } }
            }],
            ['criação recusada, com o token no erro', false, 'criar-instancia', () => {
                estado.respostas['/admin/users'] = { status: 409, corpo: { error: `user orcamentista-${T} already exists, admin admin-de-teste` } }
            }],
            ['connect e qr fora, com o token no corpo', true, 'session-connect', () => { estado.wuzapiFora.add('/session/connect'); estado.wuzapiFora.add('/session/qr') }],
            ['connect lançando com o token na mensagem', true, 'session-connect', () => { estado.lancar.add('/session/connect') }],
            ['connect ecoando o token num campo de outro nome', true, 'session-connect', () => {
                estado.respostas['/session/connect'] = { status: 200, corpo: { data: { instancia: TOKEN_DA_CONEXAO, Authorization: 'admin-de-teste' } } }
            }],
        ])('%s', async (_nome, comConexao, passoExercitado, preparar) => {
            if (comConexao) conexaoExistente()
            preparar()
            await chamar(rotaQr, 'POST')
            const tudo = linhas.join('\n')
            // o caso exercita: a linha do passo em que o segredo foi plantado EXISTE
            expect(linhaDo(passoExercitado as string)).toBeDefined()
            expect(tudo).not.toContain(TOKEN_DA_CONEXAO)
            expect(tudo).not.toContain('admin-de-teste')
            expect(tudo).not.toContain('QRFALSO')
            expect(tudo).not.toContain('ECOADO')
        })

        it('na instância NOVA, o token gerado também não sai — nem ecoado pelo WUZAPI', async () => {
            // O UUID é FIXO e sem dígitos: com o aleatório, um hex com 8+ dígitos seguidos era
            // cortado pela máscara de telefone POR ACASO, e o caso passava sem a correção.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const espiaoDoUuid = jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('abcdefab-cdef-abcd-efab-cdefabcdefab')
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
                espiaoDoUuid.mockRestore()
            }
            const enviado = (eco.mock.calls[0][1] as { body: string }).body
            const gerado = JSON.parse(enviado).token as string
            expect(gerado).toBe('orc_abcdefabcdefabcdefabcdefabcdefab')
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

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(15) o TOKEN FANTASMA — credencial que o WUZAPI não reconhece não fica gravada, e o reuso tem saída', () => {
    const FANTASMA = 'orc_FANTASMA_que_o_wuzapi_nao_conhece'
    let linhas: string[] = []
    let espioes: jest.SpyInstance[] = []
    beforeEach(() => {
        linhas = []
        const anotar = (...a: unknown[]) => { linhas.push(a.map(String).join(' ')) }
        espioes = (['log', 'warn', 'error', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(anotar))
    })
    afterEach(() => espioes.forEach((e) => e.mockRestore()))

    const criacoes = () => estado.fetches.filter((f) => f.url.endsWith('/admin/users'))
    const conexaoFantasma = () => {
        montar({ whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: FANTASMA, conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: false, numero: null }] })
        estado.tokensDesconhecidos.add(FANTASMA)
    }

    describe('(1) a conexão só é gravada com a criação CONFIRMADA', () => {
        it('a criação falhando (500): nenhuma linha em whatsapp_conexao', async () => {
            estado.respostas['/admin/users'] = { status: 500, corpo: { error: 'falhou' } }
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(estado.db.whatsapp_conexao).toEqual([])
        })

        it('o WUZAPI responde OK à criação, mas NÃO reconhece o token novo: 502 no passo da criação, e nenhuma linha', async () => {
            estado.respostas['/admin/users'] = { status: 201, corpo: { code: 201, success: true, data: { id: 'x' } } }
            estado.todoTokenDesconhecido = true
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(r.corpo.passo).toBe('criar-instancia')
            expect(estado.db.whatsapp_conexao).toEqual([])
        })
    })

    describe('(2) o reuso tem saída', () => {
        it('token reusado que dá 401: UMA criação nova, a linha passa a ter o token NOVO, e o QR sai', async () => {
            conexaoFantasma()
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(200)
            expect(r.corpo.qr).toBe('data:image/png;base64,QRFALSO')
            expect(criacoes()).toHaveLength(1)
            expect(estado.db.whatsapp_conexao).toHaveLength(1)
            const novo = String(estado.db.whatsapp_conexao[0].wuzapi_token)
            expect(novo).not.toBe(FANTASMA)
            expect((criacoes()[0].corpo as { token: string }).token).toBe(novo)
            // detectado no status, o fantasma não é usado em mais NADA — nem connect, nem qr
            expect(estado.fetches.filter((f) => f.headers?.token === FANTASMA).map((f) => new URL(f.url).pathname)).toEqual(['/session/status'])
        })

        it('dois 401 seguidos (o fantasma E o recém-criado) não viram laço: UMA criação, 502, e nenhum dos dois fica gravado', async () => {
            conexaoFantasma()
            estado.todoTokenDesconhecido = true
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(criacoes()).toHaveLength(1)
            expect(estado.db.whatsapp_conexao).toEqual([])
        })

        it('401 num token RECÉM-CRIADO não recria: sem conexão gravada e o WUZAPI não reconhecendo nada, UMA criação só', async () => {
            estado.todoTokenDesconhecido = true
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(criacoes()).toHaveLength(1)
        })

        it('token RECÉM-CRIADO que passa na confirmação e dá 401 só no connect: não recria — UMA criação, e a linha dele fica', async () => {
            estado.respostas['/session/connect'] = { status: 401, corpo: { code: 401, error: 'unauthorized' } }
            await chamar(rotaQr, 'POST')
            expect(criacoes()).toHaveLength(1)
            expect(estado.db.whatsapp_conexao).toHaveLength(1)
            expect(estado.db.whatsapp_conexao[0].wuzapi_token).toBe((criacoes()[0].corpo as { token: string }).token)
        })

        it('o fantasma que passa no status e dá 401 só no connect: também é descartado, e cria UMA nova', async () => {
            conexaoFantasma()
            estado.tokensDesconhecidos.delete(FANTASMA)
            estado.respostas['/session/connect'] = { status: 401, corpo: { code: 401, error: 'unauthorized' } }
            // o connect falso responde 401 a TODO token; o caso mede que o reuso não insiste e cria uma só
            const r = await chamar(rotaQr, 'POST')
            expect(criacoes()).toHaveLength(1)
            expect(estado.db.whatsapp_conexao.every((c) => c.wuzapi_token !== FANTASMA)).toBe(true)
            expect(r.status).toBe(200)
        })

        it('o contraste: token reusado que o WUZAPI CONHECE não é descartado, e nada é criado', async () => {
            montar({ whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: 'orc_valido', conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: false }] })
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(200)
            expect(criacoes()).toHaveLength(0)
            expect(estado.db.whatsapp_conexao[0].wuzapi_token).toBe('orc_valido')
        })
    })

    describe('(3) o rastro da criação, sem segredo', () => {
        it('a linha da criação registra o status e o corpo — e nem o fantasma, nem o token novo, nem o de admin aparecem', async () => {
            conexaoFantasma()
            estado.respostas['/admin/users'] = { status: 500, corpo: { error: 'falha do servidor de teste' } }
            await chamar(rotaQr, 'POST')
            const doQr = linhas.filter((l) => l.startsWith('[QR-ORCAMENTISTA]'))
            const criacao = doQr.find((l) => l.includes('passo=criar-instancia'))
            expect(criacao).toEqual(expect.stringContaining('status=500'))
            expect(criacao).toEqual(expect.stringContaining('falha do servidor de teste'))
            expect(doQr.some((l) => l.includes('fantasma'))).toBe(true)
            const tudo = linhas.join('\n')
            const novo = (criacoes()[0].corpo as { token: string }).token
            for (const segredo of [FANTASMA, novo, 'admin-de-teste']) expect(tudo).not.toContain(segredo)
        })
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(16) o rastro do QR CHEGA AO LOG: sai em console.error (stderr), não em console.log', () => {
    // Medido em produção em 21/10/2026: ZERO linhas `[QR-ORCAMENTISTA]` no log da Vercel daquele
    // projeto, que só exibe o que sai em stderr (`console.error`, como o do cron do MRM). As
    // seções (14) e (15) capturam os quatro métodos juntos, e por isso não distinguiam.
    let deErro: string[] = []
    let deLog: string[] = []
    let espioes: jest.SpyInstance[] = []
    beforeEach(() => {
        deErro = []; deLog = []
        espioes = [
            jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { deErro.push(a.map(String).join(' ')) }),
            ...(['log', 'info', 'warn', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation((...a: unknown[]) => { deLog.push(a.map(String).join(' ')) })),
        ]
    })
    afterEach(() => espioes.forEach((e) => e.mockRestore()))
    const doQr = (l: string[]) => l.filter((x) => x.startsWith(PREFIXO_DO_LOG_DO_QR))

    it('instância nova: as cinco chamadas deixam linha em console.error, e NENHUMA vai para os outros métodos', async () => {
        estado.respostas['/admin/users'] = { status: 201, corpo: { code: 201, success: true, data: { id: 'abc123' } } }
        expect((await chamar(rotaQr, 'POST')).status).toBe(200)
        const passos = doQr(deErro).map((l) => /passo=([a-z-]+)/.exec(l)?.[1])
        expect(passos).toEqual(['instancia', 'criar-instancia', 'session-status', 'session-connect', 'session-qr'])
        expect(doQr(deLog)).toEqual([])
    })

    it('o fantasma: a linha que diz que ele foi descartado também sai em console.error', async () => {
        montar({ whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN_DA_CONEXAO, conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: false }] })
        estado.tokensDesconhecidos.add(TOKEN_DA_CONEXAO)
        await chamar(rotaQr, 'POST')
        expect(doQr(deErro).find((l) => l.includes('passo=session-status'))).toEqual(expect.stringContaining('status=401'))
        expect(doQr(deErro).some((l) => l.includes('fantasma'))).toBe(true)
        expect(doQr(deLog)).toEqual([])
    })

    it('cada linha diz A QUAL servidor falou — o host, que não é segredo; nem o token, nem o de admin', async () => {
        estado.respostas['/admin/users'] = { status: 201, corpo: { code: 201, success: true, data: { id: 'abc123' } } }
        await chamar(rotaQr, 'POST')
        const host = new URL(process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').host
        expect(doQr(deErro).length).toBeGreaterThan(0)
        for (const l of doQr(deErro)) expect(l).toContain(`host=${host}`)
        const tudo = deErro.join('\n')
        for (const segredo of [String(estado.db.whatsapp_conexao[0].wuzapi_token), 'admin-de-teste']) expect(tudo).not.toContain(segredo)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(17) o QR que ainda não existe: depois do connect com 2xx, o /session/qr é consultado de novo até o código vir', () => {
    // Medido em produção em 22/10/2026 00:14 UTC: connect 200 "Connected!", e o /session/qr 200 com
    // `QRCode` VAZIO logo em seguida. No fonte do WUZAPI o connect com `Immediate: true` volta antes
    // de o cliente subir, e o QR só é gravado quando o evento "code" chega — até lá, o /session/qr
    // responde 200 com `QRCode: ""` ou 500 "not connected".
    const VAZIO = { status: 200, corpo: { code: 200, success: true, data: { QRCode: '' } } }
    const NAO_CONECTADO = { status: 500, corpo: { code: 500, error: 'not connected', success: false } }
    const COM_CODIGO = { status: 200, corpo: { code: 200, success: true, data: { QRCode: 'data:image/png;base64,QRDATERCEIRA' } } }
    let linhas: string[] = []
    let espioes: jest.SpyInstance[] = []
    beforeEach(() => {
        linhas = []
        const anotar = (...a: unknown[]) => { linhas.push(a.map(String).join(' ')) }
        espioes = (['log', 'warn', 'error', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(anotar))
    })
    afterEach(() => espioes.forEach((e) => e.mockRestore()))
    const consultasDoQr = () => estado.fetches.filter((f) => f.url.endsWith('/session/qr'))
    const linhasDoQr = () => linhas.filter((l) => l.startsWith('[QR-ORCAMENTISTA]') && l.includes('passo=session-qr'))
    const conexaoExistente = () => montar({
        whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN_DA_CONEXAO, conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: false }],
    })

    // A ordem é "not connected" ANTES de "vazio": o socket ainda subindo. A ordem inversa — 200 e
    // depois 500 — é a sessão CAINDO, e para na hora: seção (18).
    it('o socket subindo: "not connected", vazio, e o código na TERCEIRA — 200 com ele, e para ali', async () => {
        conexaoExistente()
        estado.sequenciaDoQr = [NAO_CONECTADO, VAZIO, COM_CODIGO]
        const r = await chamar(rotaQr, 'POST')
        expect(r.status).toBe(200)
        expect(r.corpo.qr).toBe('data:image/png;base64,QRDATERCEIRA')
        expect(consultasDoQr()).toHaveLength(3)
        expect(estado.esperas).toHaveLength(2)
    })

    it('a primeira consulta é IMEDIATA: o código vindo de primeira, nenhuma espera', async () => {
        conexaoExistente()
        const r = await chamar(rotaQr, 'POST')
        expect(r.status).toBe(200)
        expect(consultasDoQr()).toHaveLength(1)
        expect(estado.esperas).toEqual([])
    })

    it('cada tentativa deixa uma linha no log: o número, o status e se veio', async () => {
        conexaoExistente()
        estado.sequenciaDoQr = [NAO_CONECTADO, VAZIO, COM_CODIGO]
        await chamar(rotaQr, 'POST')
        const doQr = linhasDoQr()
        expect(doQr).toHaveLength(3)
        expect(doQr[0]).toEqual(expect.stringMatching(/tentativa=1 .*status=500.*veio_qr=nao/))
        expect(doQr[1]).toEqual(expect.stringMatching(/tentativa=2 .*status=200.*veio_qr=nao/))
        expect(doQr[2]).toEqual(expect.stringMatching(/tentativa=3 .*status=200.*veio_qr=sim/))
    })

    it('a exceção de rede numa tentativa não encerra a espera: a seguinte ainda pode trazer o código', async () => {
        conexaoExistente()
        estado.sequenciaDoQr = ['lanca', COM_CODIGO]
        const r = await chamar(rotaQr, 'POST')
        expect(r.status).toBe(200)
        expect(consultasDoQr()).toHaveLength(2)
        expect(linhasDoQr()[0]).toEqual(expect.stringMatching(/tentativa=1 .*excecao=/))
    })

    describe('esgotando: a mensagem de hoje, com quantas vezes e por quanto tempo', () => {
        it('nunca veio: 502 no passo session-qr, e a espera não passa do teto', async () => {
            conexaoExistente()
            estado.respostas['/session/qr'] = VAZIO
            const r = await chamar(rotaQr, 'POST')
            const espera = moduloDoOrcamentista.ESPERA_DO_QR!
            const tentativas = Math.floor(espera.tetoMs / espera.intervaloMs) + 1
            expect(r.status).toBe(502)
            expect(r.corpo.passo).toBe('session-qr')
            expect(consultasDoQr()).toHaveLength(tentativas)
            expect(estado.esperas.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(espera.tetoMs)
            expect(String(r.corpo.error)).toMatch(/O servidor de WhatsApp não devolveu o código para ler/)
            expect(String(r.corpo.error)).toContain(`${tentativas} vezes`)
            expect(String(r.corpo.error)).toContain(`${Math.round(estado.agora / 1000)} segundos`)
            expect(linhasDoQr()).toHaveLength(tentativas)
            expect(linhasDoQr()[tentativas - 1]).toEqual(expect.stringContaining(`tentativa=${tentativas} `))
        })
    })

    describe('quando NÃO se espera', () => {
        it('connect sem 2xx: UMA consulta só, como hoje, e a culpa é do connect', async () => {
            conexaoExistente()
            estado.wuzapiFora.add('/session/connect')
            estado.respostas['/session/qr'] = VAZIO
            const r = await chamar(rotaQr, 'POST')
            expect(consultasDoQr()).toHaveLength(1)
            expect(estado.esperas).toEqual([])
            expect(r.corpo.passo).toBe('session-connect')
        })

        it('401 no /session/qr: para na hora — é o token que o servidor não conhece, e esperar não o faz conhecer', async () => {
            estado.respostas['/admin/users'] = { status: 201, corpo: { code: 201, success: true, data: { id: 'x' } } }
            estado.sequenciaDoQr = [{ status: 401, corpo: { code: 401, error: 'unauthorized' } }, COM_CODIGO]
            const r = await chamar(rotaQr, 'POST')
            expect(consultasDoQr()).toHaveLength(1)
            expect(estado.esperas).toEqual([])
            expect(r.status).toBe(502)
        })
    })

    it('o teto cabe com folga no limite DECLARADO da função: no máximo METADE do maxDuration da rota', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { config } = require('@/pages/api/atendimentos-ia/orcamentista/qr') as { config?: { maxDuration?: number } }
        const espera = moduloDoOrcamentista.ESPERA_DO_QR
        expect(config?.maxDuration).toBeGreaterThan(0)
        expect(espera?.tetoMs).toBeGreaterThan(0)
        expect(espera!.tetoMs).toBeLessThanOrEqual((config!.maxDuration! * 1000) / 2)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(18) a sessão que CAI: o texto do erro vai para o log, e 500 depois de 200 encerra a espera', () => {
    // Medido em produção em 22/10/2026 00:39 UTC: tentativas 1 a 3 com 200 e QRCode vazio, 4 a 8 com
    // 500, sem que o log dissesse QUAL 500. No fonte do WUZAPI, o /session/qr responde 500 "no
    // session" (sessão desmontada) ou "not connected" (cliente vivo, socket caído) — e em nenhum dos
    // dois a sessão volta sozinha. Esperar depois disso só gasta os 12 segundos.
    const VAZIO = { status: 200, corpo: { code: 200, success: true, data: { QRCode: '' } } }
    const NAO_CONECTADO = { status: 500, corpo: { code: 500, error: 'not connected', success: false } }
    const SEM_SESSAO = { status: 500, corpo: { code: 500, error: 'no session', success: false } }
    const COM_CODIGO = { status: 200, corpo: { code: 200, success: true, data: { QRCode: 'data:image/png;base64,QRTARDIO' } } }
    let linhas: string[] = []
    let espioes: jest.SpyInstance[] = []
    beforeEach(() => {
        linhas = []
        const anotar = (...a: unknown[]) => { linhas.push(a.map(String).join(' ')) }
        espioes = (['log', 'warn', 'error', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(anotar))
    })
    afterEach(() => espioes.forEach((e) => e.mockRestore()))
    const consultasDoQr = () => estado.fetches.filter((f) => f.url.endsWith('/session/qr'))
    const linhasDoQr = () => linhas.filter((l) => l.startsWith('[QR-ORCAMENTISTA]') && l.includes('passo=session-qr'))
    const conexaoExistente = () => montar({
        whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN_DA_CONEXAO, conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: false }],
    })

    describe('(1) o TEXTO do erro de cada tentativa sem 2xx vai para o log', () => {
        it.each([
            ['not connected', NAO_CONECTADO],
            ['no session', SEM_SESSAO],
        ])('500 "%s": a linha da tentativa diz qual foi', async (texto, resposta) => {
            conexaoExistente()
            estado.sequenciaDoQr = [resposta, COM_CODIGO]
            await chamar(rotaQr, 'POST')
            expect(linhasDoQr()[0]).toEqual(expect.stringMatching(/tentativa=1 .*status=500/))
            expect(linhasDoQr()[0]).toContain(texto)
        })

        it('o texto do erro passa pela máscara: o token que o servidor devolveu no corpo NÃO vai para o log', async () => {
            conexaoExistente()
            estado.wuzapiFora.add('/session/connect')
            estado.wuzapiFora.add('/session/qr')
            await chamar(rotaQr, 'POST')
            expect(linhasDoQr()[0]).toEqual(expect.stringMatching(/status=500.*fora/))
            expect(linhas.join('\n')).not.toContain(TOKEN_DA_CONEXAO)
        })

        it('com 2xx, nenhum texto de erro na linha', async () => {
            conexaoExistente()
            await chamar(rotaQr, 'POST')
            expect(linhasDoQr()[0]).not.toContain('erro=')
        })
    })

    describe('(2) 500 depois de 200 é a sessão caindo: para na hora, e a tela diz isso', () => {
        it('o caso de produção: 200, 200, 200 e 500 — para na QUARTA, sem gastar o resto do teto', async () => {
            conexaoExistente()
            estado.sequenciaDoQr = [VAZIO, VAZIO, VAZIO, NAO_CONECTADO, COM_CODIGO]
            const r = await chamar(rotaQr, 'POST')
            expect(consultasDoQr()).toHaveLength(4)
            expect(estado.esperas).toHaveLength(3)
            expect(r.status).toBe(502)
            expect(r.corpo.passo).toBe('session-qr')
            expect(String(r.corpo.error)).toMatch(/caiu/)
            expect(String(r.corpo.error)).toContain('4 vezes')
            expect(String(r.corpo.error)).not.toMatch(/WUZAPI/)
        })

        it('"no session" depois de 200 também encerra', async () => {
            conexaoExistente()
            estado.sequenciaDoQr = [VAZIO, SEM_SESSAO, COM_CODIGO]
            const r = await chamar(rotaQr, 'POST')
            expect(consultasDoQr()).toHaveLength(2)
            expect(String(r.corpo.error)).toMatch(/caiu/)
        })

        it('o contraste: 500 ANTES de qualquer 200 é o socket subindo — continua esperando, e o código vem', async () => {
            conexaoExistente()
            estado.sequenciaDoQr = [NAO_CONECTADO, NAO_CONECTADO, VAZIO, COM_CODIGO]
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(200)
            expect(r.corpo.qr).toBe('data:image/png;base64,QRTARDIO')
            expect(consultasDoQr()).toHaveLength(4)
        })

        it('o contraste: só vazios até o teto — a mensagem é a de "não devolveu o código", não a de queda', async () => {
            conexaoExistente()
            estado.respostas['/session/qr'] = VAZIO
            const r = await chamar(rotaQr, 'POST')
            expect(String(r.corpo.error)).toMatch(/não devolveu o código para ler/)
            expect(String(r.corpo.error)).not.toMatch(/caiu/)
        })
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(19) o segredo do webhook é do SISTEMA, e o próprio sistema aponta o webhook da instância', () => {
    // Medido em produção em 22/10/2026: `webhook_segredo` preenchido à mão em 1 de 1 linha; o
    // descarte do #114 apagava a linha e o QR a recriava SEM segredo; e o `POST /webhook` do WUZAPI
    // SEM o campo "events" ZERA a lista de eventos da instância ("Skipping webhook. Not subscribed
    // for this type"). O "events" é obrigatório.
    const ORIGEM_PADRAO = 'https://app.precificacerto.com'
    let linhas: string[] = []
    let espioes: jest.SpyInstance[] = []
    let origemAntes: string | undefined
    beforeEach(() => {
        linhas = []
        origemAntes = process.env.NEXT_PUBLIC_APP_URL
        delete process.env.NEXT_PUBLIC_APP_URL
        const anotar = (...a: unknown[]) => { linhas.push(a.map(String).join(' ')) }
        espioes = (['log', 'warn', 'error', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(anotar))
    })
    afterEach(() => {
        espioes.forEach((e) => e.mockRestore())
        if (origemAntes === undefined) delete process.env.NEXT_PUBLIC_APP_URL
        else process.env.NEXT_PUBLIC_APP_URL = origemAntes
    })
    const doWebhook = () => estado.fetches.filter((f) => new URL(f.url).pathname === '/webhook')
    const caminhos = () => estado.fetches.map((f) => new URL(f.url).pathname)
    const linhaDaConexao = () => estado.db.whatsapp_conexao[0] as Linha
    const urlEsperada = (segredo: unknown) => `${ORIGEM_PADRAO}/api/atendimentos-ia/inbound?c=${String(segredo)}`
    const conexaoGravada = (extra: Linha = {}) => montar({
        whatsapp_conexao: [{ tenant_id: T, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN_DA_CONEXAO, conectado_por: USUARIO, conectado_em: '2026-10-21T00:00:00Z', ativo: false, ...extra }],
    })

    describe('(1) toda linha criada pelo sistema nasce com webhook_segredo', () => {
        it('instância nova: 32 hexadecimais minúsculos, na mesma linha do token', async () => {
            await chamar(rotaQr, 'POST')
            expect(estado.db.whatsapp_conexao).toHaveLength(1)
            expect(String(linhaDaConexao().webhook_segredo)).toMatch(/^[0-9a-f]{32}$/)
        })

        it('o segredo NÃO é o wuzapi_token da mesma linha — nem ele sem o prefixo, nem contido nele', async () => {
            await chamar(rotaQr, 'POST')
            const { wuzapi_token: token, webhook_segredo: segredo } = linhaDaConexao()
            // sem isto, um segredo AUSENTE passaria em todas as negativas abaixo
            expect(String(segredo)).toMatch(/^[0-9a-f]{32}$/)
            expect(String(token)).toMatch(/^orc_[0-9a-f]{32}$/)
            expect(segredo).not.toBe(token)
            expect(segredo).not.toBe(String(token).replace(/^orc_/, ''))
            expect(String(token)).not.toContain(String(segredo))
            expect(String(segredo)).not.toContain(String(token).replace(/^orc_/, '').slice(0, 8))
        })

        it('o fantasma descartado: a linha RECRIADA tem segredo novo — diferente do que havia', async () => {
            const ANTIGO = '11111111111111111111111111111111'
            conexaoGravada({ webhook_segredo: ANTIGO })
            estado.tokensDesconhecidos.add(TOKEN_DA_CONEXAO)
            await chamar(rotaQr, 'POST')
            expect(estado.db.whatsapp_conexao).toHaveLength(1)
            expect(linhaDaConexao().wuzapi_token).not.toBe(TOKEN_DA_CONEXAO)
            expect(String(linhaDaConexao().webhook_segredo)).toMatch(/^[0-9a-f]{32}$/)
            expect(linhaDaConexao().webhook_segredo).not.toBe(ANTIGO)
        })

        it('a conexão reusada que já tem segredo o MANTÉM — não gira a cada clique', async () => {
            const ATUAL = '22222222222222222222222222222222'
            conexaoGravada({ webhook_segredo: ATUAL })
            await chamar(rotaQr, 'POST')
            expect(linhaDaConexao().webhook_segredo).toBe(ATUAL)
        })

        it('a conexão reusada SEM segredo (gravada antes desta regra) ganha um', async () => {
            conexaoGravada({ webhook_segredo: null })
            await chamar(rotaQr, 'POST')
            expect(String(linhaDaConexao().webhook_segredo)).toMatch(/^[0-9a-f]{32}$/)
        })
    })

    describe('(2) o sistema aponta o webhook da instância no WUZAPI', () => {
        it('instância nova: POST /webhook com o token da linha no header, a URL de entrada com o segredo da linha, e events ["Message"]', async () => {
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(200)
            expect(doWebhook()).toHaveLength(1)
            const [w] = doWebhook()
            expect(w.headers?.token).toBe(linhaDaConexao().wuzapi_token)
            expect(w.corpo).toEqual({ webhookURL: urlEsperada(linhaDaConexao().webhook_segredo), events: ['Message'] })
        })

        it('o CONTRASTE do "events": o corpo tem as DUAS chaves, e events é exatamente ["Message"] — sem ele o WUZAPI zera a assinatura', async () => {
            await chamar(rotaQr, 'POST')
            const corpo = doWebhook()[0].corpo as Record<string, unknown>
            expect(Object.keys(corpo).sort()).toEqual(['events', 'webhookURL'])
            expect(corpo.events).toEqual(['Message'])
        })

        it('o webhook é apontado ANTES de a sessão abrir', async () => {
            await chamar(rotaQr, 'POST')
            expect(caminhos().indexOf('/webhook')).toBeGreaterThan(-1)
            expect(caminhos().indexOf('/webhook')).toBeLessThan(caminhos().indexOf('/session/connect'))
        })

        it('conexão reusada: aponta com o token e o segredo QUE JÁ ESTÃO na linha', async () => {
            const ATUAL = '33333333333333333333333333333333'
            conexaoGravada({ webhook_segredo: ATUAL })
            await chamar(rotaQr, 'POST')
            expect(doWebhook()).toHaveLength(1)
            expect(doWebhook()[0].headers?.token).toBe(TOKEN_DA_CONEXAO)
            expect(doWebhook()[0].corpo).toEqual({ webhookURL: urlEsperada(ATUAL), events: ['Message'] })
        })

        it('sessão JÁ logada: também aponta — "conectado" só sai com o webhook apontado', async () => {
            conexaoGravada({ webhook_segredo: '44444444444444444444444444444444' })
            estado.logada = true
            const r = await chamar(rotaQr, 'POST')
            expect(r.corpo.conectado).toBe(true)
            expect(doWebhook()).toHaveLength(1)
        })

        it('o fantasma descartado: o token antigo NUNCA aponta webhook; o novo aponta com o segredo novo', async () => {
            conexaoGravada({ webhook_segredo: '55555555555555555555555555555555' })
            estado.tokensDesconhecidos.add(TOKEN_DA_CONEXAO)
            await chamar(rotaQr, 'POST')
            expect(doWebhook().map((f) => f.headers?.token)).toEqual([linhaDaConexao().wuzapi_token])
            expect(doWebhook()[0].corpo).toEqual({ webhookURL: urlEsperada(linhaDaConexao().webhook_segredo), events: ['Message'] })
        })

        it('a origem vem de NEXT_PUBLIC_APP_URL, sem barra dobrada', async () => {
            process.env.NEXT_PUBLIC_APP_URL = 'https://outra.exemplo.test/'
            await chamar(rotaQr, 'POST')
            expect((doWebhook()[0].corpo as { webhookURL: string }).webhookURL)
                .toBe(`https://outra.exemplo.test/api/atendimentos-ia/inbound?c=${String(linhaDaConexao().webhook_segredo)}`)
        })
    })

    describe('(3) o webhook que NÃO foi apontado: a conexão não é dada como pronta', () => {
        it.each([
            ['respondeu 500', () => { estado.wuzapiFora.add('/webhook') }],
            ['respondeu 400', () => { estado.respostas['/webhook'] = { status: 400, corpo: { error: 'bad request' } } }],
            ['lançou', () => { estado.lancar.add('/webhook') }],
        ])('%s: 502 no passo "webhook", a tela diz que o webhook não foi apontado, e NÃO sai QR nem sessão', async (_n, preparar) => {
            preparar()
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(r.corpo.passo).toBe('webhook')
            expect(String(r.corpo.error)).toMatch(/webhook não foi apontado/)
            expect(r.corpo.qr).toBeUndefined()
            expect(caminhos()).not.toContain('/session/connect')
            expect(caminhos()).not.toContain('/session/qr')
        })

        it('sessão já logada e o webhook falhando: NÃO responde "conectado"', async () => {
            conexaoGravada({ webhook_segredo: '66666666666666666666666666666666' })
            estado.logada = true
            estado.wuzapiFora.add('/webhook')
            const r = await chamar(rotaQr, 'POST')
            expect(r.status).toBe(502)
            expect(r.corpo.conectado).toBeUndefined()
            expect(r.corpo.passo).toBe('webhook')
        })
    })

    describe('(4) o log: console.error com o host e o status — NUNCA o token, o segredo ou a URL', () => {
        it('a linha do passo webhook traz o host e o status', async () => {
            estado.respostas['/webhook'] = { status: 503, corpo: { error: 'indisponível' } }
            await chamar(rotaQr, 'POST')
            const linha = linhas.find((l) => l.startsWith('[QR-ORCAMENTISTA]') && l.includes('passo=webhook'))
            expect(linha).toEqual(expect.stringContaining('status=503'))
            expect(linha).toEqual(expect.stringMatching(/host=\S+/))
        })

        it('nem o token, nem o segredo, nem a URL de entrada aparecem em linha nenhuma', async () => {
            const SEGREDO = '77777777777777777777777777777777'
            conexaoGravada({ webhook_segredo: SEGREDO })
            await chamar(rotaQr, 'POST')
            estado.wuzapiFora.add('/webhook')
            await chamar(rotaQr, 'POST')
            const tudo = linhas.join('\n')
            expect(linhas.some((l) => l.includes('passo=webhook'))).toBe(true)
            for (const s of [TOKEN_DA_CONEXAO, SEGREDO, urlEsperada(SEGREDO), 'inbound?c=']) expect(tudo).not.toContain(s)
        })
    })
})
