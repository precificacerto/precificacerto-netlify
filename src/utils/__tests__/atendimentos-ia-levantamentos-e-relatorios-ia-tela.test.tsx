/**
 * PORTÃO — as TELAS novas de Agentes I.A. (dono do produto, 11/11/2026): os Levantamentos I.A. (a lista com o arquivo de cada um) e os
 * Relatórios I.A. (por cliente orçado, as duas abas — materiais e corte; o de materiais com conteúdo desde 16/11/2026).
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, onchange: null as unknown, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
})
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/', asPath: '/', query: {}, push: jest.fn(), replace: () => {}, events: { on: () => {}, off: () => {} } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children, title }: { children: React.ReactNode; title: string }) => <div data-titulo={title}>{children}</div> }))

const servidor = { status: 200, corpo: {} as Record<string, unknown>, chamadas: [] as string[] }
beforeAll(() => {
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
        servidor.chamadas.push(url)
        return { ok: servidor.status >= 200 && servidor.status < 300, status: servidor.status, json: async () => servidor.corpo }
    })
})

/* eslint-disable @typescript-eslint/no-require-imports */
const Levantamentos = require('@/pages/atendimentos-ia/levantamentos-ia/index').default as React.ComponentType
const { TEXTO_DA_LISTA_VAZIA, urlDoArquivo } = require('@/pages/atendimentos-ia/levantamentos-ia/index')
const Relatorios = require('@/pages/atendimentos-ia/relatorios-ia/index').default as React.ComponentType
const { ABAS_DOS_RELATORIOS, TEXTO_DA_ABA_SEM_CONTEUDO, TEXTO_SEM_ORCAMENTO } = require('@/pages/atendimentos-ia/relatorios-ia/index')
const { RelatorioDeMateriais, TEXTO_SEM_MATERIAL, fraseDosItensSemCalculo } = require('@/page-parts/atendimentos-ia/relatorio-de-materiais.component')
const { PAGE_TITLES } = require('@/constants/page-titles')
/* eslint-enable @typescript-eslint/no-require-imports */

const montadas: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = []
afterEach(() => {
    while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    servidor.status = 200; servidor.corpo = {}; servidor.chamadas = []
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

describe('os Levantamentos I.A.', () => {
    it('o título, uma linha por levantamento com o estado e o vendedor, e o arquivo de cada um numa aba nova', async () => {
        servidor.corpo = { levantamentos: [
            { id: 'l-2', numero: 2, nome: 'Geraldo Huck', estado: 'COMPLETO', vendedor_nome: 'Cristiano', criado_em: '2026-11-08T10:00:00Z' },
            { id: 'l-1', numero: 1, nome: 'Antonio Rock', estado: 'EM_MONTAGEM', vendedor_nome: null, criado_em: '2026-11-01T10:00:00Z' },
        ] }
        const host = await montar(<Levantamentos />)
        expect(host.querySelector('[data-titulo]')?.getAttribute('data-titulo')).toBe('Levantamentos I.A.')
        expect(PAGE_TITLES.LEVANTAMENTOS_IA).toBe('Levantamentos I.A.')
        expect(servidor.chamadas).toEqual(['/api/atendimentos-ia/levantamentos'])
        expect(Array.from(host.querySelectorAll('[data-estado-do-levantamento]')).map((e) => e.textContent)).toEqual(['Completo', 'Em montagem'])
        const links = Array.from(host.querySelectorAll('a[target="_blank"]'))
        expect(links.map((a) => a.getAttribute('href'))).toEqual([urlDoArquivo('l-2'), urlDoArquivo('l-1')])
        expect(urlDoArquivo('l-2')).toBe('/api/atendimentos-ia/levantamentos/l-2/arquivo')
        expect(host.textContent).toContain('Cristiano')
    })
    it('a lista vazia diz o que aparece ali; seção desligada e sem permissão têm a sua frase', async () => {
        servidor.corpo = { levantamentos: [] }
        expect((await montar(<Levantamentos />)).textContent).toContain(TEXTO_DA_LISTA_VAZIA)
        servidor.status = 404
        expect((await montar(<Levantamentos />)).querySelector('[data-estado="desligada"]')).not.toBeNull()
        servidor.status = 403
        expect((await montar(<Levantamentos />)).querySelector('[data-estado="sem-permissao"]')).not.toBeNull()
    })
})

describe('os Relatórios I.A.', () => {
    it('por cliente orçado: sem escolha, a tela pede o cliente e não mostra aba nenhuma', async () => {
        servidor.corpo = { orcamentos: [{ id: 'o-1', numero: 1, nome: 'Geraldo Huck' }] }
        const host = await montar(<Relatorios />)
        expect(host.querySelector('[data-titulo]')?.getAttribute('data-titulo')).toBe('Relatórios I.A.')
        expect(servidor.chamadas).toEqual(['/api/atendimentos-ia/orcamentos'])
        expect(host.querySelector('[data-sem-orcamento]')?.textContent).toBe(TEXTO_SEM_ORCAMENTO)
        expect(host.querySelector('[data-aba-do-relatorio]')).toBeNull()
    })
    it('as duas abas, nesta ordem, nascem com a estrutura e dizem que ainda não têm conteúdo', () => {
        expect(ABAS_DOS_RELATORIOS.map((a: { label: string }) => a.label)).toEqual(['Relatório de materiais', 'Relatório de corte'])
        expect(TEXTO_DA_ABA_SEM_CONTEUDO).toContain('ainda não foi construído')
    })
})

describe('o RELATÓRIO DE MATERIAIS (dono do produto, 16/11/2026)', () => {
    it('lê a rota do orçamento e mostra uma seção por categoria, na ordem que a rota mandou, com a quantidade e a unidade', async () => {
        servidor.corpo = { relatorio: {
            categorias: [
                { chave: 'PERFIL', rotulo: 'Perfil', materiais: [{ codigo: '9681', descricao: 'SF66 - FOLHA', unidade: 'm', quantidade: 10.5 }] },
                { chave: 'REFORCO', rotulo: 'Reforço', materiais: [{ codigo: '8427', descricao: 'REFORÇO SF92', unidade: 'm', quantidade: 11.764 }] },
            ],
            semCategoria: [], ambiguos: [], itensSemCalculo: [],
        } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" />)
        expect(servidor.chamadas).toEqual(['/api/atendimentos-ia/orcamentos/o-1/relatorio-de-materiais'])
        expect(Array.from(host.querySelectorAll('[data-categoria]')).map((e) => e.getAttribute('data-categoria'))).toEqual(['PERFIL', 'REFORCO'])
        expect(host.textContent).toContain('10,50 m')
        expect(host.textContent).toContain('11,76 m')
        expect(host.querySelector('[data-itens-sem-calculo]')).toBeNull()
    })
    it('diz quais esquadrias não têm cálculo, e lista à parte o que não tem categoria e o que tem mais de uma', async () => {
        servidor.corpo = { relatorio: {
            categorias: [], itensSemCalculo: [2, 3],
            semCategoria: [{ codigo: 'X1', descricao: null, unidade: 'un', quantidade: 4 }],
            ambiguos: [{ codigo: 'Y1', descricao: 'peça', unidade: 'm', quantidade: 1, categorias: ['FERRAGENS', 'PERFIL'] }],
        } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" />)
        expect(host.querySelector('[data-itens-sem-calculo]')?.textContent).toBe(fraseDosItensSemCalculo([2, 3]))
        expect(fraseDosItensSemCalculo([2, 3])).toBe('As esquadrias 2, 3 não têm cálculo: os materiais delas não estão neste relatório.')
        expect(host.querySelector('[data-categoria="ambiguos"]')?.textContent).toContain('Y1 (FERRAGENS, PERFIL)')
        expect(host.querySelector('[data-categoria="sem-categoria"]')?.textContent).toContain('X1')
        expect(host.textContent).not.toContain(TEXTO_SEM_MATERIAL)
    })
    it('sem material nenhum, o vazio é dito (nunca uma tabela vazia que pareça "sem material")', async () => {
        servidor.corpo = { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [] } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" />)
        expect(host.textContent).toContain(TEXTO_SEM_MATERIAL)
    })
    it('a recusa da rota aparece como erro, com a frase dela', async () => {
        servidor.status = 404; servidor.corpo = { error: 'Orçamento não encontrado.' }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" />)
        expect(host.textContent).toContain('Orçamento não encontrado.')
    })
})
