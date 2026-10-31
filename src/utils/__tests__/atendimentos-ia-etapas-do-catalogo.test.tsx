/**
 * PORTÃO — o CATÁLOGO DE ETAPAS: a quarta aba do nicho, ao lado de Motores (dono do produto, 31/10/2026; migração 20261031000002).
 *
 * POR QUÊ: "Vamos criar a aba das etapas para que a gente consiga partir dela, alimentar ela, fazer as integrações, as divisões corretas, informando
 * onde vai cada coisa." O item é o NOME, a AÇÃO (da lista fechada) e as ABAS do motor que a etapa carrega; a conta SELECIONA o item e guarda a
 * instrução. (A recusa por uso da 20261031000002 caiu em 31/10/2026: remover é o arrasto declarado — "o catálogo é soberano".)
 *
 * O que este portão fica vermelho:
 *   (1) o leitor do corpo: o nome de 1 a 60 sem as pontas, a ação da lista, as abas da planilha sem repetir (na ordem da planilha); campo a mais é
 *       erro; "mudou" conta a caixa do nome e não a ordem das abas;
 *   (2) a leitura do catálogo: na ordem, cada item com QUEM USA (empresa · família · número), em ordem; a etapa da conta não é lida sem pedir;
 *   (3) POST: o nome repetido sem olhar a caixa é 409 antes da função; a função recebe o autor da sessão e o corpo limpo; a recusa dela vai com a
 *       frase dela; só o super admin;
 *   (4) PATCH: 404 do item que não há; 409 do nome de OUTRO (o próprio em outra caixa vale); 400 de nada mudou; a função recebe o id da URL;
 *   (5) DELETE não existe mais (405): remover é a rota do arrasto (`atendimentos-ia-remocao.test.tsx`);
 *   (6) a TELA: a lista com a ação, as abas e quem usa; criar e editar no modal (salvar só liga com nome e ação, e na edição quando mudou); a
 *       edição de item em uso avisa quantas etapas a mudança alcança; remover abre o arrasto e só remove confirmado;
 *   (7) a página do nicho tem a quarta aba, Etapas, depois de Motores.
 *
 * O que NÃO alcança: o banco é falso aqui. As travas (nome único sem caixa, FK RESTRICT, uso, corridas, o semeio literal) estão provadas num Postgres
 * real, em `scripts/harness/etapa-no-catalogo/`, com mutações.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { NextApiRequest, NextApiResponse } from 'next'
import {
    ABAS_DA_ETAPA, ETAPA_DO_CATALOGO_QUE_NAO_MUDOU, ROTULO_DA_ABA, ROTULO_DA_ACAO, etapaDoCatalogoMudou, fraseDaEtapaDoCatalogoComNomeRepetido,
    lerCorpoDaEtapaDoCatalogo, rotaDaEtapaDoCatalogo, rotaDoCatalogoDeEtapas, type EtapaDoCatalogo,
} from '@/utils/atendimentos-ia-etapas'
import { ROTA_DA_REMOCAO, rotaDoArrasto } from '@/utils/atendimentos-ia-remocao'
import { ABAS_DO_NICHO, ROTULO_DA_ABA_DO_NICHO, abaDoNicho, rotaDoNicho } from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
jest.setTimeout(20000)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

type Linha = Record<string, any>
const SUPER: Linha = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN: Linha = { id: 'u-admin', tenant_id: 't-a', role: 'admin', is_super_admin: false }
const C1 = '00000000-0000-4000-8000-0000000000c1'
const C2 = '00000000-0000-4000-8000-0000000000c2'
const C3 = '00000000-0000-4000-8000-0000000000c3'
const T = '00000000-0000-4000-8000-0000000000d1'
const T2 = '00000000-0000-4000-8000-0000000000d2'

const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    leituras: [] as string[],
    rpcs: [] as Array<{ funcao: string; args: Linha }>,
    rpcResposta: (): { data: unknown; error: { code?: string; message: string } | null } => ({ data: { ok: true }, error: null }),
}
function montarBanco() {
    estado.usuario = SUPER
    estado.leituras = []
    estado.rpcs = []
    estado.rpcResposta = () => ({ data: { ok: true }, error: null })
    estado.db = {
        users: [SUPER, ADMIN],
        tenants: [{ id: T, name: 'Esquadrias De Paula Ltda' }, { id: T2, name: 'Alfa Esquadrias' }],
        orcamentista_materia_prima: [{ id: 'mp-1', tenant_id: T, nome: 'Esquadrias de PVC WOLF' }, { id: 'mp-2', tenant_id: T2, nome: 'PVC da Alfa' }],
        orcamentista_etapa_catalogo: [
            { id: C3, nome: 'Relação de barras e materiais', acao: 'CALCULAR_BARRAS', abas: ['tipologias', 'otimizacao'], ordem: 3, criado_em: '2026-10-31T00:00:00Z' },
            { id: C1, nome: 'Apanhado e levantamento de esquadrias', acao: 'GERAR_LEVANTAMENTO', abas: ['tipologias', 'variaveis'], ordem: 1, criado_em: '2026-10-31T00:00:00Z' },
            { id: C2, nome: 'Conferência', acao: 'CONFIRMAR', abas: [], ordem: 2, criado_em: '2026-10-31T00:00:00Z' },
        ],
        orcamentista_familia_etapa: [
            { id: 'e-3', tenant_id: T, materia_prima_id: 'mp-1', numero: 3, etapa_catalogo_id: C3 },
            { id: 'e-1', tenant_id: T, materia_prima_id: 'mp-1', numero: 1, etapa_catalogo_id: C1 },
            { id: 'e-a', tenant_id: T2, materia_prima_id: 'mp-2', numero: 2, etapa_catalogo_id: C3 },
        ],
    }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<any> => (estado.usuario ? { data: { user: { id: String(estado.usuario.id) } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: (tabela: string) => {
            const filtros: Array<(l: Linha) => boolean> = []
            const ordem: Array<[string, boolean]> = []
            const q: any = {}
            let pedidas: string[] | null = null
            q.select = (colunas?: string) => { pedidas = colunas && colunas !== '*' ? colunas.split(',').map((c) => c.trim()) : null; return q }
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem.push([c, o?.ascending !== false]); return q }
            const linhas = () => {
                let ls = (estado.db[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
                for (const [c, asc] of [...ordem].reverse()) ls = [...ls].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1))
                // como o PostgREST: só voltam as colunas PEDIDAS
                return ls.map((l) => (pedidas ? Object.fromEntries(pedidas.map((c) => [c, l[c]])) : l))
            }
            q.single = async (): Promise<any> => ({ data: linhas()[0] ?? null, error: null })
            q.then = (ok: (v: unknown) => unknown) => { estado.leituras.push(tabela); return Promise.resolve({ data: linhas(), error: null }).then(ok) }
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) q[escrita] = () => { throw new Error(`o catálogo de etapas não escreve direto: ${escrita} ${tabela}`) }
            return q
        },
        rpc: async (funcao: string, args: Linha) => { estado.rpcs.push({ funcao, args }); return estado.rpcResposta() },
    },
}))

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTAS: Record<string, () => Rota> = {
    lista: () => require('@/pages/api/super-admin/atendimentos-ia/etapas/index').default,
    item: () => require('@/pages/api/super-admin/atendimentos-ia/etapas/[id]').default,
}
const lib = () => require('@/lib/atendimentos-ia/etapas-da-familia') as typeof import('@/lib/atendimentos-ia/etapas-da-familia')
/* eslint-enable @typescript-eslint/no-require-imports */
async function chamar(rota: keyof typeof ROTAS, method: string, query: object = {}, body?: unknown) {
    const saida = { status: 0, json: null as any }
    const res = { status(n: number) { saida.status = n; return res }, json(b: unknown) { saida.json = b; return res }, setHeader() { return res } }
    await ROTAS[rota]()({ cookies: { token: 't' }, method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return saida
}

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(montarBanco)

describe('(1) o leitor do corpo', () => {
    const ler = (b: unknown) => lerCorpoDaEtapaDoCatalogo(b)
    it('o nome sem as pontas, a ação da lista, as abas na ORDEM DA PLANILHA (não na do clique)', () => {
        expect(ler({ nome: '  Apanhado  ', acao: 'APANHAR', abas: ['variaveis', 'tipologias'] })).toEqual({ ok: true, corpo: { nome: 'Apanhado', acao: 'APANHAR', abas: ['tipologias', 'variaveis'] } })
        expect(ler({ nome: 'x', acao: 'ENVIAR' })).toEqual({ ok: true, corpo: { nome: 'x', acao: 'ENVIAR', abas: [] } })
    })
    it('o nome: em branco e 61 caracteres recusam dizendo quantos; 60 passa (contados como o banco conta)', () => {
        expect(ler({ nome: '   ', acao: 'APANHAR' })).toEqual({ ok: false, erro: 'O nome da etapa está em branco.' })
        expect(ler({ nome: 'ç'.repeat(61), acao: 'APANHAR' })).toEqual({ ok: false, erro: 'O nome da etapa tem 61 caracteres; o limite é 60.' })
        expect(ler({ nome: '😀'.repeat(60), acao: 'APANHAR' }).ok).toBe(true)
        expect(ler({ nome: 5, acao: 'APANHAR' })).toEqual({ ok: false, erro: 'O nome da etapa é um texto.' })
    })
    it.each([['calcular_barras'], ['OUTRA'], [''], [null], [undefined]])('a ação %p não é da lista: recusa nomeando as cinco', (acao) => {
        const r = ler({ nome: 'x', acao })
        expect(r.ok).toBe(false)
        expect((r as { erro: string }).erro).toContain('não é uma das ações do sistema (APANHAR, CONFIRMAR, GERAR_LEVANTAMENTO, CALCULAR_BARRAS, ENVIAR)')
    })
    it('as abas: só as da planilha, sem repetir, em lista; os itens de preço NÃO são aba', () => {
        expect(ler({ nome: 'x', acao: 'APANHAR', abas: ['itens_de_preco'] })).toEqual({ ok: false, erro: '"itens_de_preco" não é uma aba da planilha.' })
        expect(ler({ nome: 'x', acao: 'APANHAR', abas: ['perfis', 'perfis'] })).toEqual({ ok: false, erro: 'Uma aba aparece mais de uma vez.' })
        expect(ler({ nome: 'x', acao: 'APANHAR', abas: 'perfis' })).toEqual({ ok: false, erro: 'As abas vão numa lista.' })
        expect(ler({ nome: 'x', acao: 'APANHAR', abas: [...ABAS_DA_ETAPA].reverse() })).toEqual({ ok: true, corpo: { nome: 'x', acao: 'APANHAR', abas: [...ABAS_DA_ETAPA] } })
    })
    it('campo a mais é erro (o autor e a ordem não vêm do corpo); corpo que não é objeto também', () => {
        expect(ler({ nome: 'x', acao: 'APANHAR', ordem: 1 })).toEqual({ ok: false, erro: 'O campo "ordem" não existe (só nome, acao e abas).' })
        expect(ler({ nome: 'x', acao: 'APANHAR', por: 'outro' }).ok).toBe(false)
        for (const b of [null, [], 'x'] as unknown[]) expect(ler(b)).toEqual({ ok: false, erro: 'O corpo é um objeto com nome, acao e abas.' })
    })
    it('"mudou": a caixa do nome conta, as pontas não; a ordem das abas não; a ação conta', () => {
        const atual = { nome: 'Conferência', acao: 'CONFIRMAR' as const, abas: ['tipologias' as const, 'variaveis' as const] }
        expect(etapaDoCatalogoMudou(atual, { nome: ' Conferência ', acao: 'CONFIRMAR', abas: ['variaveis', 'tipologias'] })).toBe(false)
        expect(etapaDoCatalogoMudou(atual, { nome: 'conferência', acao: 'CONFIRMAR', abas: ['tipologias', 'variaveis'] })).toBe(true)
        expect(etapaDoCatalogoMudou(atual, { nome: 'Conferência', acao: 'ENVIAR', abas: ['tipologias', 'variaveis'] })).toBe(true)
        expect(etapaDoCatalogoMudou(atual, { nome: 'Conferência', acao: 'CONFIRMAR', abas: ['tipologias'] })).toBe(true)
    })
    it('as rotas', () => {
        expect(rotaDoCatalogoDeEtapas).toBe('/api/super-admin/atendimentos-ia/etapas')
        expect(rotaDaEtapaDoCatalogo(C1)).toBe(`/api/super-admin/atendimentos-ia/etapas/${C1}`)
    })
})

describe('(2) a leitura do catálogo', () => {
    it('na ordem, cada item com QUEM USA (empresa · família · número), em ordem de empresa, família e número', async () => {
        const itens = await lib().lerCatalogoDeEtapas()
        expect(itens.map((c) => [c.ordem, c.nome, c.acao])).toEqual([[1, 'Apanhado e levantamento de esquadrias', 'GERAR_LEVANTAMENTO'], [2, 'Conferência', 'CONFIRMAR'], [3, 'Relação de barras e materiais', 'CALCULAR_BARRAS']])
        expect(itens[2].usos).toEqual([{ empresa: 'Alfa Esquadrias', familia: 'PVC da Alfa', numero: 2 }, { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC WOLF', numero: 3 }])
        expect(itens[1].usos).toEqual([])
        expect(itens[2].abas).toEqual(['tipologias', 'otimizacao'])
    })
    it('sem pedir os usos, a etapa da conta não é lida', async () => {
        const itens = await lib().lerCatalogoDeEtapas({ usos: false })
        expect(itens.every((c) => c.usos.length === 0)).toBe(true)
        expect(estado.leituras).toEqual(['orcamentista_etapa_catalogo'])
    })
    it('o item com ação fora da lista é ERRO, nunca um item sem ação; a aba fora da planilha some', async () => {
        estado.db.orcamentista_etapa_catalogo[2].abas = ['perfis', 'itens_de_preco']
        expect((await lib().lerCatalogoDeEtapas())[1].abas).toEqual(['perfis'])
        estado.db.orcamentista_etapa_catalogo[0].acao = 'OUTRA'
        await expect(lib().lerCatalogoDeEtapas()).rejects.toThrow('o item "Relação de barras e materiais" tem a ação "OUTRA", que não é da lista')
    })
})

describe('(3) POST /etapas', () => {
    it('GET: a lista, como a leitura a monta; só o super admin', async () => {
        const r = await chamar('lista', 'GET')
        expect(r.status).toBe(200)
        expect(r.json.map((c: Linha) => c.nome)).toEqual(['Apanhado e levantamento de esquadrias', 'Conferência', 'Relação de barras e materiais'])
        estado.usuario = ADMIN
        expect((await chamar('lista', 'GET')).status).toBe(403)
        expect((await chamar('lista', 'POST', {}, { nome: 'x', acao: 'APANHAR' })).status).toBe(403)
        expect(estado.rpcs).toEqual([])
    })
    it('o nome repetido SEM OLHAR A CAIXA é 409 com o nome que existe, e a função não é chamada', async () => {
        const r = await chamar('lista', 'POST', {}, { nome: 'CONFERÊNCIA', acao: 'CONFIRMAR' })
        expect(r).toEqual({ status: 409, json: { error: fraseDaEtapaDoCatalogoComNomeRepetido('Conferência') } })
        expect(estado.rpcs).toEqual([])
    })
    it('o corpo inválido é 400 com a frase, e a função não é chamada', async () => {
        expect((await chamar('lista', 'POST', {}, { nome: 'x', acao: 'OUTRA' })).status).toBe(400)
        expect((await chamar('lista', 'POST', {}, { nome: 'x', acao: 'APANHAR', por: 'outro' })).status).toBe(400)
        expect(estado.rpcs).toEqual([])
    })
    it('chama SÓ a função, com o autor da sessão e o corpo limpo (o nome aparado, as abas na ordem da planilha); 201', async () => {
        const r = await chamar('lista', 'POST', {}, { nome: '  Apanhado de esquadrias ', acao: 'APANHAR', abas: ['variaveis', 'tipologias'] })
        expect(r.status).toBe(201)
        expect(estado.rpcs).toEqual([{ funcao: 'superadmin_criar_etapa_do_catalogo', args: { p_por: 'u-super', p_nome: 'Apanhado de esquadrias', p_acao: 'APANHAR', p_abas: ['tipologias', 'variaveis'] } }])
    })
    it.each([['22023', 409, 'ja existe a etapa "X" no catalogo: o nome nao se repete. Nada foi gravado.'], ['42501', 403, 'Só o super admin altera o catálogo.']])(
        'a recusa da função %s vira %i', async (code, status, frase) => {
            estado.rpcResposta = () => ({ data: null, error: { code, message: code === '22023' ? frase : 'o autor da alteracao nao e super admin' } })
            expect(await chamar('lista', 'POST', {}, { nome: 'X', acao: 'APANHAR' })).toEqual({ status, json: { error: frase } })
        })
    it('erro outro é 500, sem o texto do banco', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: 'XX000', message: 'violates orcamentista_etapa_catalogo_ordem_key' } })
        const r = await chamar('lista', 'POST', {}, { nome: 'X', acao: 'APANHAR' })
        expect(r.status).toBe(500)
        expect(JSON.stringify(r.json)).not.toContain('orcamentista_etapa_catalogo')
    })
})

describe('(4) PATCH /etapas/[id]', () => {
    it('404 do id que não é uuid e do item que não há; a função não é chamada', async () => {
        expect((await chamar('item', 'PATCH', { id: 'x' }, { nome: 'a', acao: 'APANHAR' })).status).toBe(404)
        expect((await chamar('item', 'PATCH', { id: '00000000-0000-4000-8000-0000000000cf' }, { nome: 'a', acao: 'APANHAR' })).status).toBe(404)
        expect(estado.rpcs).toEqual([])
    })
    it('409 do nome de OUTRO item (sem olhar a caixa); o PRÓPRIO nome em outra caixa vale', async () => {
        expect(await chamar('item', 'PATCH', { id: C2 }, { nome: 'relação de barras e materiais', acao: 'CONFIRMAR' })).toEqual({ status: 409, json: { error: fraseDaEtapaDoCatalogoComNomeRepetido('Relação de barras e materiais') } })
        expect(estado.rpcs).toEqual([])
        expect((await chamar('item', 'PATCH', { id: C2 }, { nome: 'CONFERÊNCIA', acao: 'CONFIRMAR' })).status).toBe(200)
        expect(estado.rpcs[0].args.p_nome).toBe('CONFERÊNCIA')
    })
    it('400 de nada mudou (as pontas do nome e a ordem das abas não são mudança)', async () => {
        expect(await chamar('item', 'PATCH', { id: C1 }, { nome: ' Apanhado e levantamento de esquadrias ', acao: 'GERAR_LEVANTAMENTO', abas: ['variaveis', 'tipologias'] }))
            .toEqual({ status: 400, json: { error: ETAPA_DO_CATALOGO_QUE_NAO_MUDOU } })
        expect(estado.rpcs).toEqual([])
    })
    it('renomear o item EM USO chama a função com o id da URL e o autor da sessão (editar vale com uso)', async () => {
        const r = await chamar('item', 'PATCH', { id: C3 }, { nome: 'Relação de barras', acao: 'CALCULAR_BARRAS', abas: ['tipologias'] })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ funcao: 'superadmin_editar_etapa_do_catalogo', args: { p_por: 'u-super', p_id: C3, p_nome: 'Relação de barras', p_acao: 'CALCULAR_BARRAS', p_abas: ['tipologias'] } }])
    })
    it('a recusa da função: 22023 → 409 com a frase; P0002 → 404', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: '22023', message: 'nada mudou: o nome, a acao e as abas sao os de agora. Nada foi gravado.' } })
        expect((await chamar('item', 'PATCH', { id: C2 }, { nome: 'Outra', acao: 'CONFIRMAR' })).json).toEqual({ error: 'nada mudou: o nome, a acao e as abas sao os de agora. Nada foi gravado.' })
        estado.rpcResposta = () => ({ data: null, error: { code: 'P0002', message: 'etapa do catalogo inexistente' } })
        expect((await chamar('item', 'PATCH', { id: C2 }, { nome: 'Outra', acao: 'CONFIRMAR' })).status).toBe(404)
    })
    it('POST e GET no item são 405', async () => {
        expect((await chamar('item', 'GET', { id: C1 })).status).toBe(405)
        expect((await chamar('item', 'POST', { id: C1 })).status).toBe(405)
    })
})

describe('(5) DELETE /etapas/[id] não existe mais: remover é o arrasto declarado (31/10/2026, migração 20261031000003)', () => {
    it('DELETE é 405, e nada é lido nem chamado — nem para o item em uso', async () => {
        for (const id of [C3, C2]) expect((await chamar('item', 'DELETE', { id })).status).toBe(405)
        expect(estado.rpcs).toEqual([])
    })
})

// ── A TELA ──────────────────────────────────────────────────────────────────────────────────────────────
const ITENS: EtapaDoCatalogo[] = [
    { id: C1, nome: 'Apanhado e levantamento de esquadrias', acao: 'GERAR_LEVANTAMENTO', abas: ['tipologias', 'variaveis'], ordem: 1, criado_em: '2026-10-31', usos: [{ empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC WOLF', numero: 1 }] },
    { id: C2, nome: 'Conferência', acao: 'CONFIRMAR', abas: [], ordem: 2, criado_em: '2026-10-31', usos: [] },
]
/** A medição do item em uso: a etapa da conta sai com ele, e as de baixo sobem (o aviso da renumeração). */
const ARRASTO_DE_C1 = {
    tipo: 'etapa', chave: C1, nome: 'Apanhado e levantamento de esquadrias', sai: 2, perde_o_vinculo: 0, assinatura: 'd'.repeat(32), ficam: [] as unknown[], impedimentos: [] as unknown[],
    avisos: [{ tipo: 'renumeracao' }],
    passos: [
        { passo: 1, tabela: 'orcamentista_familia_etapa', acao: 'sai', rotulo: 'etapa de conta', quantidade: 1, nomes: ['Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1'], mais: 0 },
        { passo: 2, tabela: 'orcamentista_etapa_catalogo', acao: 'sai', rotulo: 'etapa do catalogo', quantidade: 1, nomes: ['Apanhado e levantamento de esquadrias'], mais: 0 },
    ],
}
let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: Array<{ chave: string; corpo: any }> = []
function montarFetch() {
    pedidos.length = 0
    respostas = {
        [`GET ${rotaDoCatalogoDeEtapas}`]: { status: 200, body: ITENS },
        [`POST ${rotaDoCatalogoDeEtapas}`]: { status: 201, body: {} },
        [`PATCH ${rotaDaEtapaDoCatalogo(C1)}`]: { status: 200, body: {} },
        [`PATCH ${rotaDaEtapaDoCatalogo(C2)}`]: { status: 200, body: {} },
        [`GET ${rotaDoArrasto('etapa', C1)}`]: { status: 200, body: ARRASTO_DE_C1 },
        [`POST ${ROTA_DA_REMOCAO}`]: { status: 200, body: { ...ARRASTO_DE_C1, removido: true } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[chave] ?? { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Componente = () => require('@/page-parts/atendimentos-ia/etapas-do-catalogo.component') as typeof import('@/page-parts/atendimentos-ia/etapas-do-catalogo.component')
const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } document.body.innerHTML = '' })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(Componente().EtapasDoCatalogo)) })
    await assentar()
    return host
}
async function clicar(el: Element | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => { (el as HTMLElement).click() })
    await assentar()
}
async function digitar(el: Element | null, valor: string) {
    expect(el).toBeTruthy()
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valor)
        el!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await assentar()
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '') || b.getAttribute('aria-label') === texto) as HTMLButtonElement | undefined
const modal = () => document.body.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal') as HTMLElement
const ok = () => Array.from(modal().querySelectorAll('.ant-modal-footer button')).pop() as HTMLButtonElement
async function escolherAcao(rotulo: string) {
    const combo = modal().querySelector('[aria-label="Ação da etapa"]')!.closest('.ant-select')!.querySelector('.ant-select-selector')!
    await act(async () => { combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await assentar()
    await clicar(Array.from(document.body.querySelectorAll('.ant-select-item-option')).find((o) => o.textContent === rotulo))
}

describe('(6) a tela do catálogo de etapas', () => {
    beforeEach(montarFetch)

    it('a lista: o nome, a ação pelo rótulo, as abas pelo rótulo do bloco Motor e QUEM USA; o aviso de que é da plataforma', async () => {
        const host = await montar()
        const linha = host.querySelector(`[data-etapa-do-catalogo="${C1}"]`)!
        expect(linha.textContent).toContain('Apanhado e levantamento de esquadrias')
        expect(linha.querySelector('[data-acao-do-item]')?.textContent).toBe(ROTULO_DA_ACAO.GERAR_LEVANTAMENTO)
        expect(Array.from(linha.querySelectorAll('[data-abas-do-item] .ant-tag')).map((t) => t.textContent)).toEqual([ROTULO_DA_ABA.tipologias, ROTULO_DA_ABA.variaveis])
        expect(Array.from(linha.querySelectorAll('[data-usos-do-item] li')).map((l) => l.textContent)).toEqual(['Esquadrias De Paula Ltda · Esquadrias de PVC WOLF · etapa 1'])
        expect(host.querySelector(`[data-etapa-do-catalogo="${C2}"] [data-sem-uso]`)?.textContent).toBe('ninguém')
        expect(host.querySelector(`[data-etapa-do-catalogo="${C2}"] [data-sem-abas]`)?.textContent).toBe('nenhuma')
        expect(host.querySelector('[data-etapa-global]')?.textContent).toBe(Componente().AVISO_DA_ETAPA_GLOBAL)
    })

    it('500 na leitura: ERRO com a frase da rota, nunca "nenhuma etapa"', async () => {
        respostas[`GET ${rotaDoCatalogoDeEtapas}`] = { status: 500, body: { error: 'Não foi possível ler o catálogo de etapas.' } }
        const host = await montar()
        expect(host.querySelector('[data-erro-do-catalogo-de-etapas]')?.textContent).toContain('Não foi possível ler o catálogo de etapas.')
        expect(host.textContent).not.toContain(Componente().SEM_ETAPA_NO_CATALOGO)
    })

    it('criar: salvar só liga com nome E ação; o corpo leva o nome aparado, a ação e as abas na ordem da planilha; a lista é relida', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-nova-etapa-do-catalogo]'))
        expect(ok().disabled).toBe(true)
        await digitar(modal().querySelector('[aria-label="Nome da etapa"]'), '  Apanhado de esquadrias ')
        expect(ok().disabled).toBe(true)
        await escolherAcao(ROTULO_DA_ACAO.APANHAR)
        expect(ok().disabled).toBe(false)
        await clicar(modal().querySelector('input[value="variaveis"]'))
        await clicar(modal().querySelector('input[value="tipologias"]'))
        const lidas = pedidos.filter((p) => p.chave === `GET ${rotaDoCatalogoDeEtapas}`).length
        await clicar(ok())
        expect(pedidos.filter((p) => p.chave.startsWith('POST '))).toEqual([{ chave: `POST ${rotaDoCatalogoDeEtapas}`, corpo: { nome: 'Apanhado de esquadrias', acao: 'APANHAR', abas: ['tipologias', 'variaveis'] } }])
        expect(pedidos.filter((p) => p.chave === `GET ${rotaDoCatalogoDeEtapas}`).length).toBe(lidas + 1)
    })

    it('a recusa aparece DENTRO do modal, e o modal não fecha', async () => {
        respostas[`POST ${rotaDoCatalogoDeEtapas}`] = { status: 409, body: { error: fraseDaEtapaDoCatalogoComNomeRepetido('Conferência') } }
        const host = await montar()
        await clicar(host.querySelector('[data-nova-etapa-do-catalogo]'))
        await digitar(modal().querySelector('[aria-label="Nome da etapa"]'), 'conferência')
        await escolherAcao(ROTULO_DA_ACAO.CONFIRMAR)
        await clicar(ok())
        expect(modal().querySelector('[data-erro-da-etapa-do-catalogo]')?.textContent).toContain(fraseDaEtapaDoCatalogoComNomeRepetido('Conferência'))
        expect((modal().querySelector('[aria-label="Nome da etapa"]') as HTMLInputElement).value).toBe('conferência')
    })

    it('editar o item EM USO avisa quantas etapas a mudança alcança; sem mudança o salvar fica desligado; renomear manda PATCH', async () => {
        const host = await montar()
        await clicar(botao(host, 'Editar Apanhado e levantamento de esquadrias'))
        expect(modal().querySelector('[data-edicao-com-uso]')?.textContent).toBe(Componente().AVISO_DA_EDICAO_COM_USO(1))
        expect(ok().disabled).toBe(true)
        await digitar(modal().querySelector('[aria-label="Nome da etapa"]'), 'Apanhado de esquadrias')
        expect(ok().disabled).toBe(false)
        await clicar(ok())
        expect(pedidos.filter((p) => p.chave.startsWith('PATCH '))).toEqual([{ chave: `PATCH ${rotaDaEtapaDoCatalogo(C1)}`, corpo: { nome: 'Apanhado de esquadrias', acao: 'GERAR_LEVANTAMENTO', abas: ['tipologias', 'variaveis'] } }])
    })

    it('o item sem uso não tem o aviso de uso', async () => {
        const host = await montar()
        await clicar(botao(host, 'Editar Conferência'))
        expect(modal().querySelector('[data-edicao-com-uso]')).toBeNull()
    })

    it('remover o item EM USO abre o arrasto: a etapa da conta que sai, o aviso da renumeração, e só remove confirmado; a lista é relida', async () => {
        const host = await montar()
        await clicar(botao(host, 'Remover Apanhado e levantamento de esquadrias'))
        expect(pedidos.map((p) => p.chave).pop()).toBe(`GET ${rotaDoArrasto('etapa', C1)}`)
        const remocao = document.body.querySelector('[data-remocao-do-catalogo]') as HTMLElement
        expect(remocao.querySelector('[data-o-que-sai]')!.textContent).toContain('Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1')
        expect(remocao.querySelector('[data-aviso-do-arrasto="renumeracao"]')).not.toBeNull()
        expect(ok().disabled).toBe(true)
        await clicar(remocao.querySelector('[data-confirmo-o-arrasto] input'))
        const n = pedidos.length
        await clicar(ok())
        expect(pedidos.slice(n).map((p) => p.chave)).toEqual([`POST ${ROTA_DA_REMOCAO}`, `GET ${rotaDoCatalogoDeEtapas}`])
        expect(pedidos[n].corpo).toEqual({ tipo: 'etapa', chave: C1, assinatura: 'd'.repeat(32), confirmo: true })
    })
})

describe('(7) a página do nicho tem a quarta aba', () => {
    it('Etapas vem depois de Motores, com o nome "Etapas", e a URL a abre', () => {
        expect(ABAS_DO_NICHO).toEqual(['familias', 'fornecedores', 'motores', 'etapas'])
        expect(ROTULO_DA_ABA_DO_NICHO.etapas).toBe('Etapas')
        expect(abaDoNicho('etapas')).toBe('etapas')
        expect(rotaDoNicho('n-1', 'etapas')).toBe('/super-admin/atendimentos-ia/catalogo/n-1?aba=etapas')
    })
})
