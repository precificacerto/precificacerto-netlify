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
const { RelatorioDeCorte, TEXTO_SEM_PECA, fraseDosItensSemPecas } = require('@/page-parts/atendimentos-ia/relatorio-de-corte.component')
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
        servidor.corpo = { orcamentos: [{ id: 'o-1', numero: 1, nome: 'Geraldo Huck', criado_em: '2026-11-17T12:00:00Z', itens: 3 }] }
        const host = await montar(<Relatorios />)
        expect(host.querySelector('[data-titulo]')?.getAttribute('data-titulo')).toBe('Relatórios I.A.')
        expect(servidor.chamadas).toEqual(['/api/atendimentos-ia/orcamentos'])
        expect(host.querySelector('[data-sem-orcamento]')?.textContent).toBe(TEXTO_SEM_ORCAMENTO)
        expect(host.querySelector('[data-aba-do-relatorio]')).toBeNull()
    })
    it('todos os clientes listados na página (número, cliente, data, itens); clicar num abre as abas dele, com o botão de PDF', async () => {
        servidor.corpo = { orcamentos: [
            { id: 'o-2', numero: 2, nome: 'Maria Souza', criado_em: '2026-11-17T12:00:00Z', itens: 1 },
            { id: 'o-1', numero: 1, nome: 'Geraldo Huck', criado_em: '2026-11-16T12:00:00Z', itens: 3 },
        ] }
        const host = await montar(<Relatorios />)
        const linhas = Array.from(host.querySelectorAll('[data-cliente]'))
        expect(linhas.map((l) => l.getAttribute('data-cliente'))).toEqual(['o-2', 'o-1'])
        expect(linhas[1].textContent).toContain('Geraldo Huck')
        expect(linhas[1].textContent).toContain('16/11/2026')
        servidor.corpo = { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [] } }
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { (linhas[1] as HTMLElement).click() })
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
        expect(host.querySelector('[data-cliente-aberto]')?.textContent).toBe('Orçamento 1 — Geraldo Huck')
        expect(servidor.chamadas).toContain('/api/atendimentos-ia/orcamentos/o-1/relatorio-de-materiais')
        expect(host.querySelector('[data-baixar-pdf="materiais"]')).not.toBeNull()
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
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
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
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
        expect(host.querySelector('[data-itens-sem-calculo]')?.textContent).toBe(fraseDosItensSemCalculo([2, 3]))
        expect(fraseDosItensSemCalculo([2, 3])).toBe('Os itens 2, 3 não têm cálculo: os materiais deles não estão neste relatório.')
        expect(host.querySelector('[data-categoria="ambiguos"]')?.textContent).toContain('Y1 (FERRAGENS, PERFIL)')
        expect(host.querySelector('[data-categoria="sem-categoria"]')?.textContent).toContain('X1')
        expect(host.textContent).not.toContain(TEXTO_SEM_MATERIAL)
    })
    it('sem material nenhum, o vazio é dito (nunca uma tabela vazia que pareça "sem material")', async () => {
        servidor.corpo = { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [] } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
        expect(host.textContent).toContain(TEXTO_SEM_MATERIAL)
    })
    it('a recusa da rota aparece como erro, com a frase dela', async () => {
        servidor.status = 404; servidor.corpo = { error: 'Orçamento não encontrado.' }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
        expect(host.textContent).toContain('Orçamento não encontrado.')
    })
})

describe('o RELATÓRIO DE CORTE (dono do produto, 16/11/2026)', () => {
    const codigo = (extra: Record<string, unknown> = {}) => ({
        codigo: '9681', perfil: 'SF66/WOLFF', descricao: 'SF66 - FOLHA',
        linhas: [{ comprimento_mm: 2000, corte: '45S/45S', posicao: 'Largura', quantidade: 4 }],
        plano: { barra_mm: 6000, serra_mm: 5, n_barras: 2, aproveitamento_pct: 66.7, barras: [
            { pecas_mm: [2000, 2000], cortes: 2, usado_mm: 4010, sobra_mm: 1990 }, { pecas_mm: [2000, 2000], cortes: 2, usado_mm: 4010, sobra_mm: 1990 }] },
        ...extra,
    })
    it('lê a rota e mostra, por categoria, cada código com a medida, o corte, a posição, a quantidade e o plano de barras', async () => {
        servidor.corpo = { relatorio: { categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', codigos: [codigo()] }], semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [] } }
        const host = await montar(<RelatorioDeCorte orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
        expect(servidor.chamadas).toEqual(['/api/atendimentos-ia/orcamentos/o-1/relatorio-de-corte'])
        const bloco = host.querySelector('[data-codigo-do-corte="9681"]')!
        expect(bloco.textContent).toContain('2.000 mm')
        expect(bloco.textContent).toContain('45S/45S')
        expect(bloco.textContent).toContain('Largura')
        expect(bloco.querySelector('[data-plano]')?.textContent).toContain('Barra de 6.000 mm, serra de 5 mm: 2 barras, aproveitamento de 66,7%')
        expect(bloco.querySelectorAll('[data-plano] li')).toHaveLength(2)
        expect(bloco.querySelector('[data-plano] li')?.textContent).toBe('2.000 mm + 2.000 mm · sobra 1.990 mm')
    })
    it('o código sem plano diz por quê; os itens sem peças gravadas são nomeados com o "recalcule"', async () => {
        servidor.corpo = { relatorio: {
            categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', codigos: [codigo({ plano: { semPlano: 'o código 9681 não teve barra no cálculo' } })] }],
            semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [1, 2],
        } }
        const host = await montar(<RelatorioDeCorte orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
        expect(host.querySelector('[data-sem-plano]')?.textContent).toContain('Sem plano de barras: o código 9681 não teve barra no cálculo.')
        expect(host.querySelector('[data-plano]')).toBeNull()
        expect(host.querySelector('[data-itens-sem-pecas]')?.textContent).toBe(fraseDosItensSemPecas([1, 2]))
        expect(fraseDosItensSemPecas([1, 2])).toBe('Os itens 1, 2 foram calculados antes do relatório de corte existir: recalcule o orçamento para ver as peças deles.')
    })
    it('sem peça nenhuma, o vazio é dito; a migração pendente (503) aparece com a frase da rota', async () => {
        servidor.corpo = { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [] } }
        const host = await montar(<RelatorioDeCorte orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
        expect(host.textContent).toContain(TEXTO_SEM_PECA)
        servidor.status = 503; servidor.corpo = { error: 'O relatório de corte ainda não está disponível: a estrutura do banco (migração 20261117000001) não foi aplicada.' }
        const outro = await montar(<RelatorioDeCorte orcamentoId="o-2" numero={2} cliente="Outro" />)
        expect(outro.textContent).toContain('migração 20261117000001')
    })
})
