/**
 * PORTÃO — Orçamentista, bloco 1: o liga/desliga por conta, na lista do super admin.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * O `supabaseAdmin` é FALSO. A RLS da tabela — o tenant lê e não escreve, o super admin
 * escreve, uma conta não toca a outra — está provada no harness
 * (`scripts/harness/orcamentista/run.sh`, 10 casos num Postgres real). O que ESTE portão prova é
 * o que as ROTAS e a TELA decidem.
 *
 * A checagem de super admin é a REAL (`requireSuperAdmin` de `lib/get-caller-tenant.ts`): o que
 * é falso é o cliente admin por baixo dela — `auth.getUser` e a linha de `users`.
 *
 * O portão 2 do pedido (a tela de permissões mostra o rótulo) foi RETIRADO pelo dono do produto
 * em 18/10/2026: o Orçamentista fica fora das telas de permissão até o bloco 2. O que se afirmava
 * aqui era o contrário — que elas NÃO mudavam (portão 4). Em 21/10/2026 o bloco 2 chegou: o item
 * entrou no menu e o módulo nas permissões, no mesmo commit, e o portão 4 passou a afirmar isso.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { NextApiRequest, NextApiResponse } from 'next'

import {
    ACAO_PADRAO,
    ROTA_DO_ORCAMENTISTA,
    corpoParaAlternar,
    lerCorpoDaConfig,
    leituraRecusada,
    montarGravacao,
    rotaDaConfig,
    type ConfigDoOrcamentista,
    type CorpoDaConfig,
} from '@/utils/orcamentista-config'
import { MODULES, MODULOS_CONCEDIVEIS } from '@/hooks/use-permissions.hook'
import { MODULE_LABELS } from '@/constants/module-labels'
import { TITULO_DA_COLUNA_ORCAMENTISTA } from '@/page-parts/super-admin/orcamentista-na-lista.component'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query), media: query, onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

// ── As contas e os usuários da fixture ───────────────────────────────────────────────────
const CONTA_A = '00000000-0000-0000-0000-00000000000a'
const CONTA_B = '00000000-0000-0000-0000-00000000000b'
const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN_DA_A: Perfil = { id: 'u-admin-a', tenant_id: CONTA_A, role: 'admin', is_super_admin: false }

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
interface Chamada { tabela: string; op: string; args: unknown[] }
/** O formato das respostas do cliente falso — tipado, para o `tsc` não as ler como `any`. */
interface Resposta<T> { data: T; error: { message: string } | null }

const estado: {
    perfil: Perfil | null
    chamadas: Chamada[]
    anterior: { ativo: boolean } | null
    linhas: ConfigDoOrcamentista[]
} = { perfil: null, chamadas: [], anterior: null, linhas: [] }

// O cliente admin falso: `auth.getUser` e `users` para a sessão; `orcamentista_config` registra
// TUDO o que a rota pede, para se afirmar quem foi tocado.
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<Resposta<{ user: { id: string } | null }>> => (estado.perfil
                ? { data: { user: { id: estado.perfil.id } }, error: null }
                : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: (tabela: string) => {
            if (tabela === 'users') {
                const q: any = { select: () => q, eq: () => q, single: async (): Promise<Resposta<Perfil | null>> => ({ data: estado.perfil, error: null }) }
                return q
            }
            const registra = (op: string, ...args: unknown[]) => estado.chamadas.push({ tabela, op, args })
            const q: any = {
                select: (...a: unknown[]) => { registra('select', ...a); return q },
                eq: (...a: unknown[]) => { registra('eq', ...a); return q },
                maybeSingle: async (): Promise<Resposta<{ ativo: boolean } | null>> => ({ data: estado.anterior, error: null }),
                upsert: (linha: Record<string, unknown>, opcoes: unknown) => {
                    registra('upsert', linha, opcoes)
                    const r: any = { select: () => r, single: async (): Promise<Resposta<Record<string, unknown>>> => ({ data: linha, error: null }) }
                    return r
                },
                then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: estado.linhas, error: null }).then(ok),
            }
            return q
        },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rotaDaLista = require('@/pages/api/super-admin/orcamentista/index').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rotaDaConta = require('@/pages/api/super-admin/orcamentista/[tenantId]').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>

async function chamar(h: typeof rotaDaLista, req: { method: string; query?: object; body?: unknown }) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await h({ cookies: { token: 't' }, query: {}, ...req } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

const CORPO: CorpoDaConfig = { ativo: false, valor_adicional_brl: 99.9, teto_de_consumo_brl: 500, acao_ao_atingir_teto: 'BLOQUEAR' }

beforeEach(() => {
    estado.perfil = SUPER
    estado.chamadas = []
    estado.anterior = { ativo: true }
    estado.linhas = []
})

const tocouATabela = () => estado.chamadas.filter((c) => c.tabela === 'orcamentista_config')

// ════════════════════════════════════════════════════════════════════════════════════════
describe('PORTÃO 1 — só o super admin vê e altera (as ROTAS)', () => {
    // MUTAÇÃO: trocar `requireSuperAdmin` por `getCallerContext` nas rotas.
    it('admin de conta: GET 403, e a tabela não é lida', async () => {
        estado.perfil = ADMIN_DA_A
        const r = await chamar(rotaDaLista, { method: 'GET' })
        expect(r.status).toBe(403)
        expect(tocouATabela()).toEqual([])
    })

    it('admin de conta: PATCH na PRÓPRIA conta é 403, e nada é gravado', async () => {
        estado.perfil = ADMIN_DA_A
        const r = await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: { ...CORPO, ativo: true } })
        expect(r.status).toBe(403)
        expect(tocouATabela()).toEqual([])
    })

    it('sem sessão: 401 nas duas', async () => {
        estado.perfil = null
        expect((await chamar(rotaDaLista, { method: 'GET' })).status).toBe(401)
        expect((await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: CORPO })).status).toBe(401)
        expect(tocouATabela()).toEqual([])
    })

    it('o par: o super admin lê e grava — os casos acima discriminam', async () => {
        estado.linhas = [{ tenant_id: CONTA_A } as ConfigDoOrcamentista]
        const lista = await chamar(rotaDaLista, { method: 'GET' })
        expect(lista.status).toBe(200)
        expect(lista.json).toEqual(estado.linhas)
        const grava = await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: CORPO })
        expect(grava.status).toBe(200)
        expect(tocouATabela().filter((c) => c.op === 'upsert')).toHaveLength(1)
    })

    it('método errado não toca a tabela', async () => {
        expect((await chamar(rotaDaLista, { method: 'POST' })).status).toBe(405)
        expect((await chamar(rotaDaConta, { method: 'GET', query: { tenantId: CONTA_A } })).status).toBe(405)
        expect(tocouATabela()).toEqual([])
    })
})

describe('PORTÃO 3 — desligar numa conta NÃO afeta a outra (a ROTA)', () => {
    it('PATCH na conta A grava UMA linha, com tenant_id A, por upsert na PK', async () => {
        await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: CORPO })
        const upserts = tocouATabela().filter((c) => c.op === 'upsert')
        expect(upserts).toHaveLength(1)
        expect((upserts[0].args[0] as Record<string, unknown>).tenant_id).toBe(CONTA_A)
        expect(upserts[0].args[1]).toEqual({ onConflict: 'tenant_id' })
    })

    it('a leitura do estado anterior é filtrada pela conta A — e B não aparece em argumento nenhum', async () => {
        await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: CORPO })
        expect(tocouATabela()).toContainEqual({ tabela: 'orcamentista_config', op: 'eq', args: ['tenant_id', CONTA_A] })
        expect(JSON.stringify(tocouATabela())).not.toContain(CONTA_B)
    })

    // MUTAÇÃO: a rota ler o tenant do corpo em vez da URL.
    it('um tenant no CORPO é ignorado: grava na conta da URL', async () => {
        await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: { ...CORPO, tenant_id: CONTA_B } })
        const upsert = tocouATabela().find((c) => c.op === 'upsert')!
        expect((upsert.args[0] as Record<string, unknown>).tenant_id).toBe(CONTA_A)
        expect(JSON.stringify(tocouATabela())).not.toContain(CONTA_B)
    })

    // MUTAÇÃO: gravar `ativado_*` sempre — desligar apagaria quem ligou.
    it('DESLIGAR preserva quem ligou: `ativado_*` NÃO vai no payload', async () => {
        estado.anterior = { ativo: true }
        await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: { ...CORPO, ativo: false } })
        const linha = tocouATabela().find((c) => c.op === 'upsert')!.args[0] as Record<string, unknown>
        expect('ativado_por' in linha).toBe(false)
        expect('ativado_em' in linha).toBe(false)
        expect(linha.atualizado_por).toBe(SUPER.id)
    })

    it('LIGAR de desligado grava quem ligou — o super admin da SESSÃO', async () => {
        estado.anterior = { ativo: false }
        await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: { ...CORPO, ativo: true, ativado_por: 'forjado' } })
        const linha = tocouATabela().find((c) => c.op === 'upsert')!.args[0] as Record<string, unknown>
        expect(linha.ativado_por).toBe(SUPER.id)
        expect(typeof linha.ativado_em).toBe('string')
    })

    // MUTAÇÃO: tirar `atualizado_em` (ou `atualizado_por`) de `montarGravacao`. Não há trigger na
    // tabela (migração `20261018000001`, escolha b): se a rota não mandar, NADA move o campo.
    it('toda gravação leva `atualizado_por` e `atualizado_em` — ligar, desligar e mudar ligado', async () => {
        for (const [anterior, ativo] of [[false, true], [true, false], [true, true]] as const) {
            estado.chamadas = []
            estado.anterior = { ativo: anterior }
            const antes = Date.now()
            await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body: { ...CORPO, ativo, atualizado_em: '1999-01-01T00:00:00Z' } })
            const linha = tocouATabela().find((c) => c.op === 'upsert')!.args[0] as Record<string, unknown>
            expect(linha.atualizado_por).toBe(SUPER.id)
            expect(typeof linha.atualizado_em).toBe('string')
            expect(Date.parse(linha.atualizado_em as string)).toBeGreaterThanOrEqual(antes - 1000)
        }
    })

    it('corpo malformado e conta malformada: 400, e nada é gravado', async () => {
        for (const body of [null, {}, { ...CORPO, ativo: 'sim' }, { ...CORPO, acao_ao_atingir_teto: null }, { ...CORPO, teto_de_consumo_brl: 0 }]) {
            estado.chamadas = []
            const r = await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: CONTA_A }, body })
            expect(r.status).toBe(400)
            expect(tocouATabela().filter((c) => c.op === 'upsert')).toEqual([])
        }
        estado.chamadas = []
        expect((await chamar(rotaDaConta, { method: 'PATCH', query: { tenantId: 'nao-e-uuid' }, body: CORPO })).status).toBe(400)
        expect(tocouATabela()).toEqual([])
    })
})

describe('o contrato da configuração', () => {
    it('as quatro chaves são OBRIGATÓRIAS — ausente não vira null', () => {
        for (const k of Object.keys(CORPO)) {
            const { [k as keyof CorpoDaConfig]: _fora, ...sem } = CORPO
            const r = lerCorpoDaConfig(sem)
            expect(leituraRecusada(r) ? r.erro : '').toContain(k)
        }
    })

    it('a ação é SEMPRE BLOQUEAR ou AVISAR, com ou sem teto; o padrão é o da coluna, AVISAR', () => {
        expect(leituraRecusada(lerCorpoDaConfig({ ...CORPO, teto_de_consumo_brl: null, acao_ao_atingir_teto: 'AVISAR' }))).toBe(false)
        expect(leituraRecusada(lerCorpoDaConfig({ ...CORPO, acao_ao_atingir_teto: 'DESLIGAR' }))).toBe(true)
        expect(ACAO_PADRAO).toBe('AVISAR')
        expect(corpoParaAlternar(undefined, true)).toEqual({ ativo: true, valor_adicional_brl: null, teto_de_consumo_brl: null, acao_ao_atingir_teto: ACAO_PADRAO })
    })

    it('o default da ação no código é o MESMO da migração', () => {
        const sql = require('fs').readFileSync(require('path').join(process.cwd(), 'supabase/migrations/20261018000001_orcamentista_bloco_1.sql'), 'utf-8')
        expect(sql).toMatch(new RegExp(`acao_ao_atingir_teto\\s+text\\s+NOT NULL DEFAULT '${ACAO_PADRAO}'`))
    })

    it('`montarGravacao` só carimba a ativação na TRANSIÇÃO desligado → ligado', () => {
        const base = { tenantId: CONTA_A, usuarioId: 'u', agora: '2026-10-18T00:00:00Z' }
        expect(montarGravacao({ ...base, corpo: { ...CORPO, ativo: true }, estavaAtivo: false }).ativado_por).toBe('u')
        expect('ativado_por' in montarGravacao({ ...base, corpo: { ...CORPO, ativo: true }, estavaAtivo: true })).toBe(false)
        expect('ativado_por' in montarGravacao({ ...base, corpo: { ...CORPO, ativo: false }, estavaAtivo: true })).toBe(false)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
// A TELA — `pages/super-admin/tenants/index.tsx`, montada com o fetch em cache falso.
// ════════════════════════════════════════════════════════════════════════════════════════
let usuarioDaTela: { is_super_admin?: boolean } | null = { is_super_admin: true }
const chavesPedidas: (string | null)[] = []
let configsDaTela: ConfigDoOrcamentista[] | undefined = []
let erroDasConfigs: Error | undefined
interface LinhaDeTenant {
    id: string; name: string; email: string; plan_status: string; is_free: boolean
    trial_ends_at: string | null; plan_ends_at: string | null; approved_by_super_admin: boolean; created_at: string
}
const TENANTS: LinhaDeTenant[] = [
    { id: CONTA_A, name: 'Conta Alfa', email: 'a@x', plan_status: 'ACTIVE', is_free: false, trial_ends_at: null, plan_ends_at: null, approved_by_super_admin: true, created_at: '2026-01-01' },
    { id: CONTA_B, name: 'Conta Beta', email: 'b@x', plan_status: 'ACTIVE', is_free: false, trial_ends_at: null, plan_ends_at: null, approved_by_super_admin: true, created_at: '2026-01-01' },
]
const config = (tenant_id: string, p: Partial<ConfigDoOrcamentista>): ConfigDoOrcamentista => ({
    tenant_id, ativo: false, valor_adicional_brl: null, teto_de_consumo_brl: null, acao_ao_atingir_teto: 'AVISAR',
    ativado_por: null, ativado_em: null, atualizado_por: null, atualizado_em: '2026-10-18T00:00:00Z',
    modelo: null, nicho_id: null, ...p,
})

jest.mock('next/router', () => ({ useRouter: () => ({ replace: () => Promise.resolve(true), push: () => Promise.resolve(true), query: {} }) }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: usuarioDaTela }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
interface RespostaDoFetch { data: unknown; isLoading: boolean; error: Error | undefined; mutate: () => Promise<undefined> }
jest.mock('@/hooks/use-cached-fetch.hook', () => ({
    useCachedFetch: (chave: string | null): RespostaDoFetch => {
        chavesPedidas.push(chave)
        if (chave === '/api/super-admin/tenants') return { data: TENANTS, isLoading: false, error: undefined, mutate: async (): Promise<undefined> => undefined }
        if (chave === '/api/super-admin/orcamentista') return { data: configsDaTela, isLoading: false, error: erroDasConfigs, mutate: async (): Promise<undefined> => undefined }
        return { data: undefined, isLoading: false, error: undefined, mutate: async (): Promise<undefined> => undefined }
    },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SuperAdminTenants = require('@/pages/super-admin/tenants/index').default as React.ComponentType

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) {
        const m = montadas.pop()!
        act(() => { m.root.unmount() })
        m.host.remove()
    }
    document.body.innerHTML = ''
})

const fetchs: { url: string; init: { method: string; body: string } }[] = []
async function montarTela() {
    chavesPedidas.length = 0
    fetchs.length = 0
    ;(global as any).fetch = async (url: string, init: { method: string; body: string }) => {
        fetchs.push({ url, init })
        return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    await act(async () => { root.render(<SuperAdminTenants />) })
    const celula = (tenantId: string) => host.querySelector(`[data-testid="orcamentista-${tenantId}"]`) as HTMLElement | null
    return {
        host,
        celula,
        titulos: () => Array.from(host.querySelectorAll('thead th')).map((t) => (t.textContent || '').trim()),
        alternar: async (tenantId: string) => {
            const sw = celula(tenantId)!.querySelector('button[role="switch"]') as HTMLButtonElement
            await act(async () => { sw.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        },
    }
}

describe('PORTÃO 1 — só o super admin vê e altera (a TELA)', () => {
    beforeEach(() => { usuarioDaTela = { is_super_admin: true }; configsDaTela = []; erroDasConfigs = undefined })

    // MUTAÇÃO: pedir a lista do Orçamentista sem a guarda de `isSA`.
    it('usuário comum: a configuração NÃO é pedida, e a coluna não existe', async () => {
        usuarioDaTela = { is_super_admin: false }
        const t = await montarTela()
        expect(chavesPedidas).not.toContain(ROTA_DO_ORCAMENTISTA)
        expect(t.host.textContent).not.toContain(TITULO_DA_COLUNA_ORCAMENTISTA)
    })

    it('o par: o super admin pede a configuração e vê a coluna', async () => {
        const t = await montarTela()
        expect(chavesPedidas).toContain(ROTA_DO_ORCAMENTISTA)
        expect(t.titulos()).toContain(TITULO_DA_COLUNA_ORCAMENTISTA)
    })
})

describe('PORTÃO 3 — desligar numa conta NÃO afeta a outra (a TELA)', () => {
    beforeEach(() => {
        usuarioDaTela = { is_super_admin: true }
        erroDasConfigs = undefined
        configsDaTela = [
            config(CONTA_A, { ativo: true, valor_adicional_brl: 99.9, teto_de_consumo_brl: 500, acao_ao_atingir_teto: 'BLOQUEAR', ativado_por: 'u-super', ativado_em: '2026-10-18T00:00:00Z' }),
            config(CONTA_B, { ativo: true, valor_adicional_brl: 49.9, ativado_por: 'u-super', ativado_em: '2026-10-18T00:00:00Z' }),
        ]
    })

    // BLOCO 2A (18/10/2026): a célula é só o interruptor — o resumo saiu. O que discrimina "a
    // configuração DA SUA conta" passa a ser o estado do interruptor, com A e B DIFERENTES.
    it('cada linha mostra o estado DA SUA conta', async () => {
        configsDaTela = [configsDaTela![0], { ...configsDaTela![1], ativo: false }]
        const t = await montarTela()
        expect(t.celula(CONTA_A)!.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
        expect(t.celula(CONTA_B)!.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('false')
    })

    // MUTAÇÃO: o switch de uma linha gravar em outra conta.
    it('desligar A faz UM PATCH, na rota de A, preservando o resto de A — e nenhuma chamada para B', async () => {
        const t = await montarTela()
        await t.alternar(CONTA_A)
        expect(fetchs).toHaveLength(1)
        expect(fetchs[0].url).toBe(rotaDaConfig(CONTA_A))
        expect(fetchs[0].init.method).toBe('PATCH')
        expect(JSON.parse(fetchs[0].init.body)).toEqual(corpoParaAlternar(configsDaTela![0], false))
        expect(fetchs.map((f) => f.url)).not.toContain(rotaDaConfig(CONTA_B))
    })

    // BLOCO 2A: a ficha saiu desta tela. A célula tem UM botão, o interruptor, e nada mais.
    it('a célula é só o interruptor: nenhum outro botão, e nenhuma ficha na tela', async () => {
        const t = await montarTela()
        const botoes = Array.from(t.celula(CONTA_B)!.querySelectorAll('button'))
        expect(botoes).toHaveLength(1)
        expect(botoes[0].getAttribute('role')).toBe('switch')
        expect(document.body.querySelector('[data-testid="ficha-do-orcamentista"]')).toBeNull()
    })

    // `ausente-vs-falso.md`: configuração que não foi lida não é "desligada".
    it('configuração INDISPONÍVEL: travessão, e NENHUM switch — não afirma "desligado"', async () => {
        erroDasConfigs = new Error('HTTP 500')
        configsDaTela = undefined
        const t = await montarTela()
        expect(t.celula(CONTA_A)!.textContent).toBe('—')
        expect(t.celula(CONTA_A)!.querySelector('button[role="switch"]')).toBeNull()
    })

    it('conta SEM linha, com a lista lida: desligada — aí sim é fato', async () => {
        configsDaTela = [configsDaTela![0]]
        const t = await montarTela()
        const sw = t.celula(CONTA_B)!.querySelector('button[role="switch"]')!
        expect(sw.getAttribute('aria-checked')).toBe('false')
    })
})

describe('PORTÃO 4 — nenhuma tela existente muda', () => {
    /** As 21 concedíveis do bloco 1, escritas por extenso: o conjunto, não a contagem. */
    const AS_21_DE_ANTES = [
        'agenda', 'budgets', 'cash_flow', 'cashier', 'commission', 'commissions_report', 'connectivity',
        'customers', 'dfc', 'employees', 'home', 'items', 'orders', 'products', 'recurrence', 'reports',
        'rt_commission', 'sales', 'sales_report', 'services', 'stock',
    ]

    // 21/10/2026 — O BLOCO 2 CHEGOU: o Orçamentista entrou no menu e, no MESMO commit, nas
    // permissões (decisão de 18/10/2026, confirmada pelo dono do produto em 21/10/2026). São as 21
    // de antes MAIS `orcamentista`, e nada além: uma 23ª, ou uma das 21 a menos, fica vermelho.
    it('as telas de permissão listam as 21 de antes MAIS orcamentista — e só isso', () => {
        expect([...MODULOS_CONCEDIVEIS].sort()).toEqual([...AS_21_DE_ANTES, 'orcamentista'].sort())
    })

    it('mas a chave existe na FONTE, com rótulo — o bloco 2 só tira da lista de não concedíveis', () => {
        expect(MODULES.ORCAMENTISTA).toBe('orcamentista')
        expect(MODULE_LABELS[MODULES.ORCAMENTISTA]).toBe('Orçamentista')
        expect(MODULE_LABELS[MODULES.ORCAMENTISTA]).not.toBe(MODULES.ORCAMENTISTA)
    })

    it('as quatro leituras de "concedível" vêm da MESMA lista — nenhuma reescreve o filtro', () => {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        for (const f of ['src/pages/admin/usuarios.tsx', 'src/pages/api/admin/users/[id]/permissions.ts', 'src/pages/funcionarios/[id]/permissoes.tsx']) {
            const fonte = fs.readFileSync(path.join(process.cwd(), f), 'utf-8')
            expect(fonte).toContain('MODULOS_CONCEDIVEIS')
            expect(fonte).not.toMatch(/filter\(m => m !== MODULES\.USERS_MANAGEMENT\)/)
        }
    })

    // 21/10/2026: este caso afirmava que o menu NÃO tinha o Orçamentista e que não existia página
    // dele — era o estado do bloco 1. O bloco 2 os trouxe, e o que fica afirmado aqui é que eles
    // moram na seção Atendimentos I.A. e na rota dela, nos dois menus. O portão do efeito (o item
    // só se desenha com a seção ligada no servidor) é `atendimentos-ia-secao-do-orcamentista-tela`.
    it('o menu tem o Orçamentista na seção atendimentos-ia, e a página existe sob /atendimentos-ia/', () => {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        for (const menu of ['src/components/layout/nav.component.tsx', 'src/components/layout/mobile-more-drawer.component.tsx']) {
            const linha = fs.readFileSync(path.join(process.cwd(), menu), 'utf-8').split('\n').find((l) => /module:\s*MODULES\.ORCAMENTISTA/.test(l))
            expect(linha).toBeDefined()
            expect(linha).toMatch(/'atendimentos-ia'/)
            expect(linha).toMatch(/ROUTES\.ATENDIMENTOS_IA_ORCAMENTISTA/)
        }
        expect(fs.existsSync(path.join(process.cwd(), 'src/pages/atendimentos-ia/orcamentista.tsx'))).toBe(true)
    })

    // BLOCO 2A (18/10/2026): as 10 colunas viraram 7, por decisão do dono do produto. O portão
    // das 7 é `o-painel-de-contas-cabe-na-tela.test.tsx`; aqui fica só a posição desta coluna.
    it('a coluna do Atendimentos I.A. fica antes de "Aprovado"', async () => {
        usuarioDaTela = { is_super_admin: true }
        configsDaTela = []
        erroDasConfigs = undefined
        const t = await montarTela()
        const titulos = t.titulos().filter((x) => x !== '')
        expect(titulos.indexOf(TITULO_DA_COLUNA_ORCAMENTISTA)).toBe(titulos.indexOf('Aprovado') - 1)
    })
})
