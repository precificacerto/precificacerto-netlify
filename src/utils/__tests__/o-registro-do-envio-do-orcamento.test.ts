/**
 * @jest-environment node
 *
 * PORTÃO — o REGISTRO do envio do orçamento por WhatsApp em `whatsapp_dispatches`.
 *
 * O DEFEITO, medido no banco de produção em 20/10/2026 (sessão de verificação): a rota
 * `api/orcamentos/[id]/send-whatsapp` mandava `message` (a tabela real tem `message_body`) e não
 * mandava `sent_by` (uuid NOT NULL). O insert falhava pelos dois motivos, um `catch` vazio engolia
 * o erro, e a rota respondia sucesso — `whatsapp_dispatches` tinha ZERO linhas em produção.
 *
 * A RAIZ: o código foi escrito contra a DDL de `20260213100000_whatsapp_employees_customers.sql`,
 * que NUNCA foi aplicada — o ledger de produção tem `20260218125410_create_whatsapp_dispatches_table`
 * no lugar. E o `supabaseAdmin` é criado sem o tipo `Database`, então o tsc não via a coluna errada.
 *
 * A FORMA DA TABELA AQUI NÃO É ESCRITA À MÃO: é lida de `src/supabase/database.types.ts`, os tipos
 * gerados do banco real — colunas de `Row`, obrigatórias de `Insert`, valores dos enums. O banco
 * falso recusa o que o real recusaria: coluna inexistente, obrigatória ausente, `sent_by` que não é
 * uuid, enum fora da lista.
 *
 * O QUE ESTE PORTÃO NÃO ALCANÇA: o Postgres real, e a tela. O aviso do registro que falhou chega
 * à resposta da rota (caso 2); a tela que o exibe é `orcamentos/index.tsx`, e não é renderizada aqui.
 *
 *   (1) o envio que deu certo GRAVA o registro, nas colunas reais, com o autor da rota;
 *   (2) o registro que falha NÃO vira sucesso silencioso: a rota responde que o envio saiu E que o
 *       registro falhou, com o motivo;
 *   (3) a agenda não grava `sent_by` com um texto no lugar do uuid.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

// ── A forma real da tabela, dos tipos gerados ────────────────────────────────────────────
const TIPOS = fs.readFileSync(path.resolve(__dirname, '../../supabase/database.types.ts'), 'utf8')

function blocoDaTabela(secao: 'Row' | 'Insert'): string {
    const ini = TIPOS.indexOf('whatsapp_dispatches: {')
    const s = TIPOS.indexOf(`${secao}: {`, ini)
    return TIPOS.slice(s, TIPOS.indexOf('}', s))
}
const COLUNAS = [...blocoDaTabela('Row').matchAll(/^\s+(\w+): /gm)].map((m) => m[1])
const OBRIGATORIAS = [...blocoDaTabela('Insert').matchAll(/^\s+(\w+): /gm)].map((m) => m[1])
const enumDe = (nome: string) => JSON.parse(new RegExp(`${nome}: (\\[[^\\]]*\\])`).exec(TIPOS)![1]) as string[]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O que o Postgres real responderia ao insert. */
function recusaDoBanco(linha: Record<string, unknown>): { code: string; message: string } | null {
    for (const c of Object.keys(linha)) if (!COLUNAS.includes(c)) return { code: '42703', message: `column "${c}" of relation "whatsapp_dispatches" does not exist` }
    for (const c of OBRIGATORIAS) if (linha[c] === undefined || linha[c] === null) return { code: '23502', message: `null value in column "${c}" violates not-null constraint` }
    if (!UUID.test(String(linha.sent_by))) return { code: '22P02', message: `invalid input syntax for type uuid: "${String(linha.sent_by)}"` }
    if (linha.type !== undefined && !enumDe('dispatch_type').includes(String(linha.type))) return { code: '22P02', message: 'invalid input value for enum dispatch_type' }
    if (linha.status !== undefined && !enumDe('dispatch_status').includes(String(linha.status))) return { code: '22P02', message: 'invalid input value for enum dispatch_status' }
    return null
}

// ── O estado que cada caso monta ─────────────────────────────────────────────────────────
const USUARIO = '11111111-2222-4333-8444-555555555555'
const estado = {
    registros: [] as Record<string, unknown>[],
    /** Força o banco a recusar o registro, com este erro. */
    falhaForcada: null as { code: string; message: string } | null,
}

jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async () => ({ user_id: '11111111-2222-4333-8444-555555555555', tenant_id: 't-1', role: 'admin', is_super_admin: false }),
}))
jest.mock('@/lib/create-budget-pdf', () => ({ createBudgetPdf: () => new Uint8Array([37, 80, 68, 70]) }))
jest.mock('@/lib/wuzapi-send', () => ({
    sendWuzapiText: async () => ({ success: true, usedPhone: '5511988887777' }),
    sendWuzapiDocument: async () => ({ success: true, usedPhone: '5511988887777' }),
}))

const DADOS: Record<string, unknown> = {
    tenant_settings: { whatsapp_instance_mode: 'OWN', whatsapp_shared_instance_user_id: null, last_whatsapp_send_at: null, whatsapp_budget_message: '' },
    users: { wuzapi_token: 'tok-da-instancia' },
    budgets: {
        id: 'abcd1234-0000-4000-8000-000000000000', created_at: '2026-10-20T10:00:00Z', total_value: 100, expiration_date: null, notes: null,
        customer_id: 'c-1', employee_id: null, status: 'SENT', customer: { id: 'c-1', name: 'Cliente', phone: '11988887777', whatsapp_phone: null }, employee: null,
    },
    tenants: { name: 'Empresa', cnpj_cpf: null },
}
const LISTAS: Record<string, unknown[]> = { budget_items: [{ quantity: 1, unit_price: 100, discount: 0, products: { id: 'p', name: 'Janela', code: 'J1' } }] }

jest.mock('@/supabase/admin', () => {
    const consulta = (tabela: string): Record<string, unknown> => {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'in', 'order', 'limit', 'not', 'is']) q[m] = () => q
        q.single = () => Promise.resolve({ data: DADOS[tabela] ?? null, error: null })
        q.maybeSingle = q.single
        q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: LISTAS[tabela] ?? [], error: null }).then(ok, erro)
        q.update = () => ({ eq: () => Promise.resolve({ error: null }) })
        q.insert = (linha: Record<string, unknown>) => {
            if (tabela !== 'whatsapp_dispatches') return Promise.resolve({ error: null })
            const recusa = estado.falhaForcada ?? recusaDoBanco(linha)
            if (!recusa) estado.registros.push(linha)
            return Promise.resolve({ data: null, error: recusa })
        }
        return q
    }
    return { supabaseAdmin: { from: (tabela: string) => consulta(tabela) } }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/orcamentos/[id]/send-whatsapp').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>

async function enviar(): Promise<{ status: number; corpo: Record<string, unknown> }> {
    const saida = { status: 0, corpo: {} as Record<string, unknown> }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: Record<string, unknown>) { saida.corpo = b; return res },
    } as unknown as NextApiResponse
    await rota({ method: 'POST', query: { id: 'abcd1234-0000-4000-8000-000000000000' }, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}

beforeEach(() => { estado.registros = []; estado.falhaForcada = null })

describe('a forma da tabela, lida dos tipos gerados', () => {
    it('o leitor acha as colunas reais — sem isto, um leitor cego aceitaria qualquer insert', () => {
        expect(COLUNAS).toEqual(expect.arrayContaining(['message_body', 'sent_by', 'phone', 'type', 'status', 'tenant_id']))
        expect(COLUNAS).not.toContain('message')
        expect(OBRIGATORIAS).toEqual(expect.arrayContaining(['sent_by', 'phone', 'tenant_id']))
        expect(recusaDoBanco({ tenant_id: 't', phone: '1', sent_by: USUARIO, message: 'x' })?.code).toBe('42703')
        expect(recusaDoBanco({ tenant_id: 't', phone: '1', sent_by: 'system' })?.code).toBe('22P02')
    })
})

describe('(1) o envio que deu certo GRAVA o registro', () => {
    it('uma linha, nas colunas reais: message_body com a mensagem, sent_by com o usuário da rota', async () => {
        const r = await enviar()
        expect(r.status).toBe(200)
        expect(estado.registros).toHaveLength(1)
        const [linha] = estado.registros
        expect(String(linha.message_body)).toMatch(/^📋 \*ORÇAMENTO ORC-ABCD\*/)
        expect(linha.sent_by).toBe(USUARIO)
        expect(linha).toEqual(expect.objectContaining({ tenant_id: 't-1', customer_id: 'c-1', type: 'BUDGET', status: 'SENT', phone: '5511988887777' }))
        expect(r.corpo.avisoDoRegistro).toBeUndefined()
    })
})

describe('(2) o registro que falha NÃO vira sucesso silencioso', () => {
    it('a rota diz que o envio saiu E que o registro falhou, com o motivo do banco', async () => {
        estado.falhaForcada = { code: '23502', message: 'null value in column "phone" violates not-null constraint' }
        const r = await enviar()
        expect(r.status).toBe(200)
        expect(r.corpo.success).toBe(true)
        expect(String(r.corpo.avisoDoRegistro)).toMatch(/enviado/)
        expect(String(r.corpo.avisoDoRegistro)).toMatch(/registro .*falhou/)
        expect(String(r.corpo.avisoDoRegistro)).toContain('null value in column "phone"')
    })
})

describe('(3) a agenda não grava texto no lugar do uuid', () => {
    it("nenhum `sent_by: … || 'system'` em src — sem uuid, não se grava", () => {
        const agenda = fs.readFileSync(path.resolve(__dirname, '../../pages/agenda/index.tsx'), 'utf8')
        expect(agenda).not.toMatch(/sent_by:\s*[^,\n]*\|\|\s*'system'/)
        expect(agenda).toMatch(/sent_by: uid,/)
    })
})
