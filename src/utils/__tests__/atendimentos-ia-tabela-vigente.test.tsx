/**
 * PORTÃO — a TABELA VIGENTE do fornecedor, por família (migração 20261026000005).
 *
 * POR QUÊ (dono do produto, 26/10/2026): as tabelas de uma conta passam a ser DERIVADAS dos fornecedores da
 * base de conhecimento, e o fornecedor pode ter duas tabelas da mesma família (a de 2026 e a de 2027).
 * "VIGÊNCIA: opção (b), marca de vigente" — o sistema não escolhe sozinho, nem "a mais recente"; e a antiga
 * não se exclui, porque explica um orçamento do ano passado. No máximo UMA vigente por (fornecedor, família),
 * garantido pelo índice único parcial do banco.
 *
 * O que este portão fica vermelho:
 *   (1) a edição aceita `vigente` booleano, e só booleano;
 *   (2) a rota grava a marca; o 23505 do índice da vigente vira 409 NOMEANDO a tabela que já é a vigente — e
 *       outro 23505 não vira essa frase;
 *   (3) a tela do fornecedor mostra a marca de cada tabela, e marcar manda PATCH { vigente: true };
 *   (4) a `vigencia` continua sendo só texto: marcar a vigente não a toca, e ela não é lida como marca.
 *
 * O que NÃO alcança: o banco é falso. O índice está provado num Postgres real (o PR cita a prova).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ROTAS_DO_CATALOGO, lerEdicaoDaTabela, recusada, type FornecedorComTabelas } from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const SUPER = { id: 'u-super', tenant_id: null as string | null, role: 'super_admin', is_super_admin: true }
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: { getUser: async (): Promise<any> => ({ data: { user: { id: 'u-super' } }, error: null }) },
        from: () => { const q: any = { select: () => q, eq: () => q, single: async (): Promise<any> => ({ data: SUPER, error: null }) }; return q },
    },
}))

const F = '11111111-1111-1111-1111-111111111111'
const T = '22222222-2222-2222-2222-222222222222'
jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    return {
        ErroDoBanco: real.ErroDoBanco,
        codigoDoErro: real.codigoDoErro,
        falhaInterna: real.falhaInterna,
        obterTabela: jest.fn(async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: `${F}/motor/x-m.xlsx` })),
        atualizarTabela: jest.fn(async () => 1),
        listarFamilias: jest.fn(async () => [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }]),
        tabelaVigenteDoPar: jest.fn(async () => ({ id: 't-2026', arquivo_nome: 'Wolff 2026.xlsx', familia: 'PVC' })),
        objetoExiste: jest.fn(async () => true),
        removerObjetos: jest.fn(async (): Promise<{ erro: string | null }> => ({ erro: null })),
    }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErroDoBanco } = jest.requireActual('@/lib/atendimentos-ia/repositorio') as { ErroDoBanco: new (e: { message?: string; code?: string }) => Error }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = () => require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>

async function patch(body: unknown) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
    await rota()({ cookies: { token: 't' }, method: 'PATCH', query: { id: T }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(() => { Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() }) })

describe('(1) a edição aceita `vigente` booleano, e só booleano', () => {
    it('true e false entram; texto, número e null são recusados com a frase', () => {
        for (const v of [true, false]) {
            const l = lerEdicaoDaTabela({ vigente: v }, F)
            expect(recusada(l) ? l.erro : l.corpo).toEqual({ vigente: v })
        }
        for (const v of ['sim', 1, null]) {
            const l = lerEdicaoDaTabela({ vigente: v }, F)
            expect(recusada(l) && l.erro).toBe('A marca de vigente é sim ou não.')
        }
    })
})

describe('(2) a rota grava a marca, e a recusa do índice nomeia a vigente de hoje', () => {
    it('PATCH { vigente: true } grava só a marca', async () => {
        const r = await patch({ vigente: true })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { vigente: true })
    })

    it('o índice da vigente recusa (23505): 409 nomeando a tabela que já é a vigente do par', async () => {
        repo.atualizarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23505', message: 'duplicate key value violates unique constraint "orcamentista_tabela_uma_vigente"' }))
        const r = await patch({ vigente: true })
        expect(r).toEqual({ status: 409, json: { error: 'Já há uma tabela vigente deste fornecedor na família PVC: Wolff 2026.xlsx. Desmarque-a antes de marcar outra.' } })
        expect(repo.tabelaVigenteDoPar).toHaveBeenCalledWith(T)
    })

    it('outro 23505 NÃO vira a frase da vigente', async () => {
        repo.atualizarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23505', message: 'duplicate key value violates unique constraint "outra_coisa"' }))
        const r = await patch({ vigente: true })
        expect(r.status).toBe(500)
    })
})

// ── (3)(4) a TELA ────────────────────────────────────────────────────────────────────────────
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/fornecedores/[id]', asPath: '/', query: { id: 'f1' }, replace: () => {}, push: () => {} }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const linha = (id: string, arquivo: string, vigente: boolean) => ({
    id, fornecedor_id: 'f1', arquivo_nome: arquivo, arquivo_path: `f1/arquivo/${id}`, motor_nome: 'motor.xlsx', motor_path: `f1/motor/${id}`,
    vigencia: 'desde 01/10/2026', familia: 'PVC', vigente, criado_em: '2026-10-19T12:00:00Z', arquivo_em: '2026-10-19T12:00:00Z', contas_usando: [] as string[],
})
const FORNECEDOR = {
    id: 'f1', nome: 'Wolff Perfis', nicho_id: 'n1', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 2, contas_usando: [],
    tabelas_da_lista: [linha('t-2026', 'Wolff 2026.xlsx', true), linha('t-2027', 'Wolff 2027.xlsx', false)],
} as unknown as FornecedorComTabelas

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: Array<{ chave: string; corpo: unknown }> = []
function servir() {
    pedidos.length = 0
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`]: { status: 200, body: FORNECEDOR },
        [`GET ${ROTAS_DO_CATALOGO.nichos}`]: { status: 200, body: [] },
        [`GET ${ROTAS_DO_CATALOGO.familias}`]: { status: 200, body: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }] },
        [`GET ${ROTAS_DO_CATALOGO.categorias}`]: { status: 200, body: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }] },
        [`PATCH ${ROTAS_DO_CATALOGO.tabela('t-2027')}`]: { status: 200, body: { ok: true } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[chave] ?? { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Pagina = () => require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType
const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(React.createElement(Pagina())) })
    await assentar()
    return host
}

describe('(3)(4) a tela do fornecedor: a marca de cada tabela', () => {
    beforeEach(servir)

    it('cada tabela mostra se é a vigente; marcar a de 2027 manda PATCH { vigente: true } — e a vigência não vai junto', async () => {
        const host = await montar()
        const marca = (id: string) => host.querySelector(`[data-vigente="${id}"]`) as HTMLButtonElement | null
        expect(marca('t-2026')?.getAttribute('aria-checked')).toBe('true')
        expect(marca('t-2027')?.getAttribute('aria-checked')).toBe('false')
        await act(async () => { marca('t-2027')!.click() })
        await assentar()
        const p = pedidos.find((x) => x.chave === `PATCH ${ROTAS_DO_CATALOGO.tabela('t-2027')}`)
        expect(p?.corpo).toEqual({ vigente: true })
    })

    it('a recusa da rota (já há uma vigente) aparece na página, inteira', async () => {
        respostas[`PATCH ${ROTAS_DO_CATALOGO.tabela('t-2027')}`] = { status: 409, body: { error: 'Já há uma tabela vigente deste fornecedor na família PVC: Wolff 2026.xlsx. Desmarque-a antes de marcar outra.' } }
        const host = await montar()
        await act(async () => { (host.querySelector('[data-vigente="t-2027"]') as HTMLButtonElement).click() })
        await assentar()
        expect(host.textContent).toContain('Já há uma tabela vigente deste fornecedor na família PVC: Wolff 2026.xlsx. Desmarque-a antes de marcar outra.')
    })
})

// ── a família só no Perfil (28/10/2026): a lista diz "Qualquer linha", e tirar a família manda `familia: null` ──
describe('(5) a tela do fornecedor: a tabela fora do Perfil sem família serve qualquer linha', () => {
    const ferragem = { ...linha('t-ferr', 'IMAB ferragens.xlsx', false), categoria_chave: 'FERRAGENS', familia: null as string | null }
    const ferragemComFamilia = { ...linha('t-ferr2', 'IMAB 2.xlsx', false), categoria_chave: 'FERRAGENS', familia: 'PVC' as string | null }
    const perfilSemFamilia = { ...linha('t-velha', 'Wolff antiga.xlsx', false), categoria_chave: null as string | null, familia: null as string | null }
    beforeEach(() => {
        servir()
        respostas[`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`] = { status: 200, body: { ...FORNECEDOR, tabelas_da_lista: [ferragem, ferragemComFamilia, perfilSemFamilia] } }
        respostas[`GET ${ROTAS_DO_CATALOGO.categorias}`] = { status: 200, body: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'FERRAGENS', rotulo: 'Ferragens', ordem: 4 }] }
        respostas[`PATCH ${ROTAS_DO_CATALOGO.tabela('t-ferr2')}`] = { status: 200, body: { ok: true } }
    })
    const linhaDa = (host: ParentNode, arquivo: string) => Array.from(host.querySelectorAll('[data-cartao-da-tabela]')).find((c) => c.querySelector('[data-arquivo-do-cartao]')?.textContent === arquivo) as HTMLElement

    it('a ferragem sem família diz "Qualquer linha"; a tabela de antes, sem categoria e sem família, continua "não informada"', async () => {
        const host = await montar()
        expect(linhaDa(host, 'IMAB ferragens.xlsx').querySelector('[data-qualquer-linha]')?.textContent).toBe('Qualquer linha')
        expect(linhaDa(host, 'Wolff antiga.xlsx').querySelector('[data-qualquer-linha]')).toBeNull()
        expect(linhaDa(host, 'Wolff antiga.xlsx').querySelector('[data-familia-nao-informada]')).toBeTruthy()
    })

    it('editar a ferragem COM família e escolher "Qualquer linha" manda PATCH com `familia: null`', async () => {
        const host = await montar()
        const editar = Array.from(linhaDa(host, 'IMAB 2.xlsx').querySelectorAll('button')).find((b) => b.textContent === 'Editar')!
        await act(async () => { editar.click() })
        await assentar()
        const opcao = document.querySelector('[data-familia-qualquer-linha] input, input[data-familia-qualquer-linha]') as HTMLInputElement
        await act(async () => { opcao.click() })
        await assentar()
        const salvar = Array.from(document.querySelectorAll('.ant-modal button')).find((b) => b.textContent?.includes('Salvar tabela')) as HTMLButtonElement
        await act(async () => { salvar.click() })
        await assentar()
        const p = pedidos.find((x) => x.chave === `PATCH ${ROTAS_DO_CATALOGO.tabela('t-ferr2')}`)
        expect(p?.corpo).toEqual(expect.objectContaining({ familia: null }))
    })
})
