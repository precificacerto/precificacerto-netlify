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
const { BarrasDoPedidoDoOrcamento, TEXTO_SEM_BARRA, AVISO_DO_PRECO } = require('@/page-parts/atendimentos-ia/barras-do-pedido.component')
const { OrientativoDeMontagem } = require('@/page-parts/atendimentos-ia/orientativo-de-montagem.component')
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
    it('o NÚMERO EXIBIDO (23/11/2026): a lista e o cabeçalho do cliente aberto dizem <levantamento>-<SIGLA>', async () => {
        servidor.corpo = { orcamentos: [{ id: 'o-1', numero: 1, numero_exibido: '27-PVC', familia_rotulo: 'PVC Wolf', nome: 'Geraldo Huck', criado_em: '2026-11-16T12:00:00Z', itens: 3 }] }
        const host = await montar(<Relatorios />)
        const linha = host.querySelector('[data-cliente]') as HTMLElement
        expect(linha.querySelector('td')?.textContent).toBe('27-PVC')
        // a FAMÍLIA de cada orçamento, na sua coluna (os relatórios por família, PR4)
        const colunas = Array.from(host.querySelectorAll('thead th')).map((t) => (t.textContent ?? '').trim())
        expect(Array.from(linha.querySelectorAll('td')).map((t) => t.textContent)[colunas.indexOf('Família')]).toBe('PVC Wolf')
        servidor.corpo = { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [] } }
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { linha.click() })
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
        expect(host.querySelector('[data-cliente-aberto]')?.textContent).toBe('Orçamento 27-PVC — Geraldo Huck · PVC Wolf')
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
        // UM CLIENTE DE CADA VEZ (dono do produto, 22/11/2026): com o cliente aberto, a lista de todos SOME; "Voltar" a devolve
        expect(host.querySelector('[data-lista-de-clientes]')).toBeNull()
        expect(host.querySelectorAll('[data-cliente]')).toHaveLength(0)
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { (host.querySelector('[data-voltar-a-lista]') as HTMLElement).click() })
        expect(host.querySelector('[data-cliente-aberto]')).toBeNull()
        expect(host.querySelector('[data-aba-do-relatorio]')).toBeNull()
        expect(Array.from(host.querySelectorAll('[data-cliente]')).map((l) => l.getAttribute('data-cliente'))).toEqual(['o-2', 'o-1'])
    })
    it('as duas abas, nesta ordem, nascem com a estrutura e dizem que ainda não têm conteúdo', () => {
        expect(ABAS_DOS_RELATORIOS.map((a: { label: string }) => a.label)).toEqual(['Relatório de materiais', 'Relatório de corte', 'Barras do pedido', 'Orientativo de montagem'])
        expect(TEXTO_DA_ABA_SEM_CONTEUDO).toContain('ainda não foi construído')
    })
})

describe('o RELATÓRIO DE MATERIAIS (dono do produto, 16/11/2026)', () => {
    it('lê a rota do orçamento e mostra uma seção por categoria, na ordem que a rota mandou, com a quantidade e a unidade', async () => {
        servidor.corpo = { relatorio: {
            categorias: [
                { chave: 'PERFIL', rotulo: 'Perfil', materiais: [{ codigo: '9681', descricao: 'SF66 - FOLHA', unidade: 'm', quantidade: 10.5, custo_bruto: 100, custo_liquido: 80 }],
                  total: { custo_bruto: 100, custo_liquido: 80, codigosSemCusto: [] as string[] } },
                { chave: 'REFORCO', rotulo: 'Reforço', materiais: [{ codigo: '8427', descricao: 'REFORÇO SF92', unidade: 'm', quantidade: 11.764, custo_bruto: 50.5, custo_liquido: 40.25 }],
                  total: { custo_bruto: 50.5, custo_liquido: 40.25, codigosSemCusto: [] as string[] } },
            ],
            semCategoria: [], ambiguos: [], itensSemCalculo: [],
            totalGeral: { custo_bruto: 150.5, custo_liquido: 120.25, codigosSemCusto: [] as string[] },
        } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
        expect(servidor.chamadas).toEqual(['/api/atendimentos-ia/orcamentos/o-1/relatorio-de-materiais'])
        expect(Array.from(host.querySelectorAll('[data-categoria]')).map((e) => e.getAttribute('data-categoria'))).toEqual(['PERFIL', 'REFORCO'])
        expect(host.textContent).toContain('10,50 m')
        expect(host.textContent).toContain('11,76 m')
        expect(host.querySelector('[data-itens-sem-calculo]')).toBeNull()
        // o total de cada categoria e o total geral, na tela (22/11/2026)
        expect(host.querySelector('[data-total="Total de Reforço"]')?.textContent?.replace(/\s/g, ' ')).toBe('Total de Reforço: custo bruto R$ 50,50 · custo líquido R$ 40,25')
        expect(host.querySelector('[data-total="geral"]')?.textContent?.replace(/\s/g, ' ')).toBe('Total geral do pedido: custo bruto R$ 150,50 · custo líquido R$ 120,25')
    })
    it('o total com um código sem custo gravado NÃO sai: nomeia o código (nunca soma o que falta como zero)', async () => {
        servidor.corpo = { relatorio: {
            categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', materiais: [{ codigo: '9681', descricao: 'F', unidade: 'm', quantidade: 1, custo_bruto: null, custo_liquido: null }],
                total: { custo_bruto: null, custo_liquido: null, codigosSemCusto: ['9681'] } }],
            semCategoria: [], ambiguos: [], itensSemCalculo: [], totalGeral: { custo_bruto: null, custo_liquido: null, codigosSemCusto: ['9681'] },
        } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
        expect(host.querySelector('[data-total="geral"]')?.textContent).toBe('Total geral do pedido: o total não sai: o código 9681 não tem o custo gravado pelo cálculo.')
        expect(host.textContent).not.toContain('R$ 0,00')
    })
    it('diz quais esquadrias não têm cálculo, e lista à parte o que não tem categoria e o que tem mais de uma', async () => {
        servidor.corpo = { relatorio: {
            categorias: [], itensSemCalculo: [2, 3],
            semCategoria: [{ codigo: 'X1', descricao: null, unidade: 'un', quantidade: 4, custo_bruto: 1, custo_liquido: 1, motivo: 'a tabela de onde o preço saiu não tem categoria declarada' }],
            ambiguos: [{ codigo: 'Y1', descricao: 'peça', unidade: 'm', quantidade: 1, custo_bruto: 1, custo_liquido: 1, categorias: ['FERRAGENS', 'PERFIL'], motivo: 'o preço sai de mais de uma tabela, de categorias diferentes' }],
            totalGeral: { custo_bruto: 2, custo_liquido: 2, codigosSemCusto: [] as string[] },
        } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
        expect(host.querySelector('[data-itens-sem-calculo]')?.textContent).toBe(fraseDosItensSemCalculo([2, 3]))
        expect(fraseDosItensSemCalculo([2, 3])).toBe('Os itens 2, 3 não têm cálculo: os materiais deles não estão neste relatório.')
        expect(host.querySelector('[data-categoria="ambiguos"]')?.textContent).toContain('Y1 (FERRAGENS, PERFIL: o preço sai de mais de uma tabela, de categorias diferentes)')
        // o código sem categoria vai NOMEADO e com o MOTIVO (dono do produto, 22/11/2026: "liste pelo nome, diga o motivo")
        expect(host.querySelector('[data-categoria="sem-categoria"]')?.textContent).toContain('X1 (a tabela de onde o preço saiu não tem categoria declarada)')
        expect(host.textContent).not.toContain(TEXTO_SEM_MATERIAL)
    })
    it('sem material nenhum, o vazio é dito (nunca uma tabela vazia que pareça "sem material")', async () => {
        servidor.corpo = { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], totalGeral: { custo_bruto: 0, custo_liquido: 0, codigosSemCusto: [] as string[] } } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
        expect(host.textContent).toContain(TEXTO_SEM_MATERIAL)
        expect(host.querySelector('[data-total="geral"]')).toBeNull()
    })
    it('a recusa da rota aparece como erro, com a frase dela', async () => {
        servidor.status = 404; servidor.corpo = { error: 'Orçamento não encontrado.' }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
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
        const host = await montar(<RelatorioDeCorte orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
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
        const host = await montar(<RelatorioDeCorte orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
        expect(host.querySelector('[data-sem-plano]')?.textContent).toContain('Sem plano de barras: o código 9681 não teve barra no cálculo.')
        expect(host.querySelector('[data-plano]')).toBeNull()
        expect(host.querySelector('[data-itens-sem-pecas]')?.textContent).toBe(fraseDosItensSemPecas([1, 2]))
        expect(fraseDosItensSemPecas([1, 2])).toBe('Os itens 1, 2 foram calculados antes do relatório de corte existir: recalcule o orçamento para ver as peças deles.')
    })
    it('sem peça nenhuma, o vazio é dito; a migração pendente (503) aparece com a frase da rota', async () => {
        servidor.corpo = { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [] } }
        const host = await montar(<RelatorioDeCorte orcamentoId="o-1" numero={1} cliente="Geraldo Huck" vistaInicial="tabela" />)
        expect(host.textContent).toContain(TEXTO_SEM_PECA)
        servidor.status = 503; servidor.corpo = { error: 'O relatório de corte ainda não está disponível: a estrutura do banco (migração 20261117000001) não foi aplicada.' }
        const outro = await montar(<RelatorioDeCorte orcamentoId="o-2" numero={2} cliente="Outro" vistaInicial="tabela" />)
        expect(outro.textContent).toContain('migração 20261117000001')
    })
})

describe('as BARRAS DO PEDIDO (dono do produto, 22/11/2026)', () => {
    const perfil = (extra: Record<string, unknown> = {}) => ({
        codigo: '1023', perfil: '1023/WOLFF', descricao: 'CLICK GUIA', cor: 'Branco', barra_mm: 6000, serra_mm: 5, refilo_mm: 0,
        barras: [
            { fracoes: [{ comprimento_mm: 4646, corte: '90/90', posicao: 'Largura', item: 6, tipologia: 'DP-72' }], serra_mm: 5, usado_mm: 4651, sobra_mm: 1349 },
            { fracoes: [1, 2].map(() => ({ comprimento_mm: 1495, corte: '90/90', posicao: 'Largura', item: 3, tipologia: 'DP-07' })), serra_mm: 10, usado_mm: 3000, sobra_mm: 3000 },
        ],
        n_barras: 2, n_fracoes: 3, metros_uteis: 7.636, metros_comprados: 12, sobra_mm: 4364, aproveitamento_pct: 63.63, peso_kg_m: 0.101, peso_bruto_kg: 1.212, peso_liquido_kg: 0.771,
        ...extra,
    })
    const total = { n_barras: 2, metros_uteis: 7.636, metros_comprados: 12, aproveitamento_pct: 63.63, peso_bruto_kg: 1.212, peso_liquido_kg: 0.771 }
    it('lê a rota e mostra uma barra por linha, com as frações (medida, corte e origem) e a sobra; e o resumo com o total', async () => {
        servidor.corpo = { relatorio: { perfis: [perfil()], semPlano: [], total, itensSemCalculo: [], itensSemPecas: [], codigosSemPeso: [] } }
        const host = await montar(<BarrasDoPedidoDoOrcamento orcamentoId="o-1" numero={12} cliente="Geraldo Huck" vistaInicial="tabela" />)
        expect(servidor.chamadas).toEqual(['/api/atendimentos-ia/orcamentos/o-1/barras-do-pedido'])
        expect(host.textContent).toContain(AVISO_DO_PRECO)
        const bloco = host.querySelector('[data-perfil-do-pedido="1023|Branco"]')!
        expect(bloco.querySelector('[data-resumo-do-perfil]')?.textContent).toBe('Barra de 6.000 mm, serra de 5 mm por corte, refilo de 0 mm por ponta: 2 barras, peso bruto 1,21 kg, peso líquido 0,77 kg, aproveitamento de 63,6%')
        expect(bloco.textContent).toContain('4.646 mm 90/90 (Item 6 DP-72)')
        expect(bloco.textContent).toContain('1.495 mm 90/90 (Item 3 DP-07) + 1.495 mm 90/90 (Item 3 DP-07)')
        expect(bloco.textContent).toContain('1.349 mm')
        expect(host.querySelector('[data-total-do-pedido]')?.textContent).toContain('1,21 kg')
    })
    it('o perfil sem plano diz por quê; o código sem peso é nomeado; o vazio é dito', async () => {
        servidor.corpo = { relatorio: { perfis: [], semPlano: [{ codigo: '9681', perfil: 'SF66/WOLFF', descricao: null, cor: 'Branco', motivo: 'o código 9681 não teve barra no cálculo' }], total: { ...total, n_barras: 0 }, itensSemCalculo: [], itensSemPecas: [], codigosSemPeso: ['9681'] } }
        const host = await montar(<BarrasDoPedidoDoOrcamento orcamentoId="o-1" numero={12} cliente="G" vistaInicial="tabela" />)
        expect(host.querySelector('[data-sem-plano]')?.textContent).toContain('9681 (SF66/WOLFF) · Branco: o código 9681 não teve barra no cálculo.')
        expect(host.querySelector('[data-sem-peso]')?.textContent).toContain('9681')
        servidor.corpo = { relatorio: { perfis: [], semPlano: [], total: { ...total, n_barras: 0 }, itensSemCalculo: [], itensSemPecas: [], codigosSemPeso: [] } }
        const vazio = await montar(<BarrasDoPedidoDoOrcamento orcamentoId="o-2" numero={12} cliente="G" vistaInicial="tabela" />)
        expect(vazio.textContent).toContain(TEXTO_SEM_BARRA)
    })
})

describe('a FOLHA A4 na tela (dono do produto, 22/11/2026): ao clicar na aba, a folha já aparece; o PDF continua para baixar', () => {
    it('a vista padrão é a Folha A4, nas quatro abas, com o seletor Folha A4 | Tabela e o "Baixar PDF"', async () => {
        const corpos: Record<string, Record<string, unknown>> = {
            materiais: { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], totalGeral: { custo_bruto: 0, custo_liquido: 0, codigosSemCusto: [] as string[] } } },
            corte: { relatorio: { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [] } },
            barras: { relatorio: { perfis: [], semPlano: [], total: { n_barras: 0, peso_bruto_kg: null, peso_liquido_kg: null, aproveitamento_pct: null }, itensSemCalculo: [], itensSemPecas: [], codigosSemPeso: [] } },
            orientativo: { relatorio: { esquadrias: [], itensSemCalculo: [], avisosDoRodape: [] } },
        }
        const telas: Array<[string, React.ReactElement, string]> = [
            ['materiais', <RelatorioDeMateriais key="m" orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />, 'materiais'],
            ['corte', <RelatorioDeCorte key="c" orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />, 'corte'],
            ['barras', <BarrasDoPedidoDoOrcamento key="b" orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />, 'barras_do_pedido'],
            ['orientativo', <OrientativoDeMontagem key="o" orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />, 'orientativo_de_montagem'],
        ]
        for (const [k, el, pdf] of telas) {
            servidor.corpo = corpos[k]
            const host = await montar(el)
            expect(host.querySelector('[data-vista-do-relatorio]')?.getAttribute('data-vista-do-relatorio')).toBe('a4')
            expect(host.querySelector('[data-folha-a4]')).not.toBeNull()
            expect(host.querySelector(`[data-baixar-pdf="${pdf}"]`)).not.toBeNull()
        }
    })
})

describe('a FOLHA A4 é o próprio PDF do "Baixar PDF" (a mesma paginação)', () => {
    const original = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL }
    afterEach(() => { URL.createObjectURL = original.criar; URL.revokeObjectURL = original.revogar })
    it('o visor recebe um PDF de verdade, gerado pela função do relatório, e o libera ao sair', async () => {
        const blobs: Blob[] = []
        const revogados: string[] = []
        URL.createObjectURL = ((b: Blob) => { blobs.push(b); return `blob:folha-${blobs.length}` }) as typeof URL.createObjectURL
        URL.revokeObjectURL = ((u: string) => { revogados.push(u) }) as typeof URL.revokeObjectURL
        servidor.corpo = { relatorio: {
            categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', materiais: [{ codigo: '9681', descricao: 'MARCO', unidade: 'm', quantidade: 2, custo_bruto: 1, custo_liquido: 1 }],
                total: { custo_bruto: 1, custo_liquido: 1, codigosSemCusto: [] as string[] } }],
            semCategoria: [], ambiguos: [], itensSemCalculo: [], totalGeral: { custo_bruto: 1, custo_liquido: 1, codigosSemCusto: [] as string[] },
        } }
        const host = await montar(<RelatorioDeMateriais orcamentoId="o-1" numero={1} cliente="Geraldo Huck" />)
        // eslint-disable-next-line testing-library/no-unnecessary-act -- a geração do PDF é assíncrona (import dinâmico)
        await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
        const iframe = host.querySelector('[data-folha-a4="pronta"] iframe')
        expect(iframe?.getAttribute('src')).toBe('blob:folha-1#view=FitH')
        expect(blobs[0].type).toBe('application/pdf')
        const bytes = await new Promise<Uint8Array>((ok) => { const f = new FileReader(); f.onload = () => ok(new Uint8Array(f.result as ArrayBuffer)); f.readAsArrayBuffer(blobs[0]) })
        expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
        expect(Buffer.from(bytes).toString('latin1')).toContain('9681')
        // trocar para a vista Tabela desmonta o visor e libera o PDF da memória
        const tabela = Array.from(host.querySelectorAll('[data-vista-do-relatorio] input')).find((e) => (e as HTMLInputElement).value === 'tabela') as HTMLElement
        // eslint-disable-next-line testing-library/no-unnecessary-act
        await act(async () => { tabela.click() })
        expect(host.querySelector('[data-folha-a4]')).toBeNull()
        expect(host.querySelector('[data-categoria="PERFIL"]')).not.toBeNull()
        expect(revogados).toEqual(['blob:folha-1'])
    })
})
