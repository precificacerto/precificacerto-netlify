/**
 * PORTÃO — a TELA dos Orçamentos I.A. (dono do produto, 09/11/2026), renderizada: a lista espelhada em Produtos, a busca, o "Criar orçamento" no
 * alto e a ação Editar na linha; nenhuma ação de excluir, estoque, seção ou tabela de preços; os estados de seção desligada, sem permissão e sem
 * migração; e a edição, que manda os itens gravados com `id` e o novo sem, e não tem botão de excluir item.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, onchange: null as unknown, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
})

const rota = { query: {} as Record<string, string>, push: jest.fn() }
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/', asPath: '/', query: rota.query, push: rota.push, replace: () => {}, events: { on: () => {}, off: () => {} } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children, title }: { children: React.ReactNode; title: string }) => <div data-titulo={title}>{children}</div> }))

const servidor = { status: 200, corpo: {} as Record<string, unknown>, chamadas: [] as Array<{ url: string; metodo: string; corpo: unknown }> }
beforeAll(() => {
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        servidor.chamadas.push({ url, metodo: init?.method ?? 'GET', corpo: init?.body ? JSON.parse(init.body) : undefined })
        return { ok: servidor.status >= 200 && servidor.status < 300, status: servidor.status, json: async () => servidor.corpo }
    })
})

/* eslint-disable @typescript-eslint/no-require-imports */
const Lista = require('@/pages/atendimentos-ia/orcamentos-ia/index').default as React.ComponentType
const Edicao = require('@/pages/atendimentos-ia/orcamentos-ia/[id]').default as React.ComponentType
const { PAGE_TITLES } = require('@/constants/page-titles')
const { TEXTO_DA_LISTA_VAZIA } = require('@/pages/atendimentos-ia/orcamentos-ia/index')
/* eslint-enable @typescript-eslint/no-require-imports */

const montadas: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = []
afterEach(() => {
    while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    servidor.status = 200
    servidor.corpo = {}
    servidor.chamadas = []
    rota.query = {}
    rota.push.mockClear()
})
async function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- o efeito busca a lista
    await act(async () => { root.render(no) })
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    return host
}
// o "limpar" da busca do antd é um botão sem texto: não é ação do orçamento
const botoes = (host: ParentNode) => Array.from(host.querySelectorAll('button:not(.ant-input-clear-icon)')).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim())

const LISTA = [
    { id: 'a', numero: 2, origem: 'manual', nome: 'Cliente na loja', itens: 0, editado_manualmente_em: null, criado_em: '2026-11-09T10:00:00Z' },
    { id: 'b', numero: 1, origem: 'agente', nome: 'Antonio Rock', itens: 3, editado_manualmente_em: '2026-11-09T11:00:00Z', criado_em: '2026-11-08T21:00:00Z' },
]

describe('a lista', () => {
    it('o título, o "Criar orçamento" no alto, uma linha por orçamento com a origem, e só a ação Editar', async () => {
        servidor.corpo = { orcamentos: LISTA }
        const host = await montar(<Lista />)
        expect(host.querySelector('[data-titulo]')?.getAttribute('data-titulo')).toBe(PAGE_TITLES.ORCAMENTOS_IA)
        expect(PAGE_TITLES.ORCAMENTOS_IA).toBe('Orçamentos I.A.')
        expect(servidor.chamadas[0]).toMatchObject({ url: '/api/atendimentos-ia/orcamentos', metodo: 'GET' })
        const t = host.textContent || ''
        expect(t).toContain('Antonio Rock')
        expect(t).toContain('Cliente na loja')
        expect(Array.from(host.querySelectorAll('[data-origem]')).map((e) => [e.getAttribute('data-origem'), e.textContent])).toEqual([['manual', 'Manual'], ['agente', 'Agente I.A.']])
        expect(host.querySelectorAll('[data-editado]')).toHaveLength(1)
        expect(botoes(host)).toEqual(['Criar orçamento', 'Editar o orçamento 2', 'Editar o orçamento 1'])
        // das ações de Produtos, nenhuma das que não cabem no orçamento
        for (const fora of ['Excluir', 'estoque', 'Criar Tabela', 'Criar Seção', 'Atualizar', 'Tabela de preços']) expect(t).not.toContain(fora)
    })

    it('Editar leva à página do orçamento', async () => {
        servidor.corpo = { orcamentos: LISTA }
        const host = await montar(<Lista />)
        const editar = host.querySelector('button[aria-label="Editar o orçamento 1"]') as HTMLButtonElement
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { editar.click() })
        expect(rota.push).toHaveBeenCalledWith('/atendimentos-ia/orcamentos-ia/b')
    })

    it('vazia: a frase do vazio', async () => {
        servidor.corpo = { orcamentos: [] }
        const host = await montar(<Lista />)
        expect(host.textContent).toContain(TEXTO_DA_LISTA_VAZIA)
        expect(botoes(host)).toEqual(['Criar orçamento'])
    })

    it.each([
        [404, { error: 'x' }, 'desligada', 'O Atendimentos I.A. não está ligado nesta conta.'],
        [403, { error: 'x' }, 'sem-permissao', 'Você não tem permissão para ver os Orçamentos I.A.'],
        [503, { error: 'Os Orçamentos I.A. ainda não estão disponíveis: a estrutura do banco (migração 20261109000001) não foi aplicada.' }, 'sem-migracao', 'migração 20261109000001'],
    ])('%s: o estado %s, sem a lista nem o botão', async (status, corpo, estado, frase) => {
        servidor.status = status
        servidor.corpo = corpo
        const host = await montar(<Lista />)
        expect(host.querySelector('[data-estado]')?.getAttribute('data-estado')).toBe(estado)
        expect(host.textContent).toContain(frase)
        expect(botoes(host)).not.toContain('Criar orçamento')
    })
})

describe('a edição', () => {
    const ORC: Record<string, unknown> = {
        id: 'b', numero: 1, origem: 'agente', levantamento_id: 'lev', nome: 'Antonio Rock', obs: null, editado_manualmente_em: null, criado_em: '2026-11-08T21:00:00Z',
        itens: [{ id: 'i1', ordem: 1, tipologia: 'DP-02', largura_mm: 1600, altura_mm: 1200, quantidade: 2, cor_perfil: 'BRANCO', vidro: 'incolor 4', obs: null }],
    }
    it('mostra o orçamento, não tem botão de excluir, e o salvar manda o gravado com id e o novo sem', async () => {
        rota.query = { id: 'b' }
        servidor.corpo = { orcamento: ORC }
        const host = await montar(<Edicao />)
        expect(host.textContent).toContain('Orçamento 1')
        expect(host.querySelector('[data-origem]')?.textContent).toBe('Agente I.A.')
        expect(botoes(host).some((b) => /excluir|remover/i.test(b))).toBe(false)
        const adicionar = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Adicionar item')) as HTMLButtonElement
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { adicionar.click() })
        servidor.corpo = { orcamento: { ...ORC, editado_manualmente_em: '2026-11-09T12:00:00Z' } }
        const salvar = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Salvar')) as HTMLButtonElement
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { salvar.click() })
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
        const patch = servidor.chamadas.find((c) => c.metodo === 'PATCH')!
        expect(patch.url).toBe('/api/atendimentos-ia/orcamentos/b')
        const itens = (patch.corpo as { itens: Array<Record<string, unknown>> }).itens
        expect(itens).toHaveLength(2)
        expect(itens[0]).toMatchObject({ id: 'i1', quantidade: 2, tipologia: 'DP-02' })
        expect('id' in itens[1]).toBe(false)
        expect(itens[1]).toMatchObject({ quantidade: 1 })
        expect(host.querySelector('[data-marca]')?.getAttribute('data-marca')).toBe('sim')
    })

    it('o orçamento que não existe: a frase, sem formulário', async () => {
        rota.query = { id: 'zz' }
        servidor.status = 404
        servidor.corpo = { error: 'Orçamento não encontrado.' }
        const host = await montar(<Edicao />)
        expect(host.querySelector('[data-estado]')?.getAttribute('data-estado')).toBe('nao-encontrado')
        expect(botoes(host)).not.toContain('Salvar')
    })
})
