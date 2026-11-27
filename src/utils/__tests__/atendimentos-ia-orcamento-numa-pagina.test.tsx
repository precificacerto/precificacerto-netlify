/**
 * PORTÃO — A TELA DO ORÇAMENTO I.A. NUMA PÁGINA SÓ (pedido 0051, 27/11/2026, regra inviolável do dono do produto): de cima para baixo, na MESMA página,
 * 1) os itens com o Calcular, 2) a precificação (o bloco de Produtos no modo orçamento), 3) o arquivo PDF — visualização e download —, regerado a cada
 * cálculo e a cada salvamento. A página `/precificacao` segue como atalho do mesmo bloco.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, onchange: null as unknown, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
})
const rota = { query: { id: 'orc-14' } as Record<string, string>, push: jest.fn() }
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/', asPath: '/', query: rota.query, push: rota.push, replace: () => {}, events: { on: () => {}, off: () => {} } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
// o bloco da precificação tem testes próprios (a tela de Produtos no modo orçamento): aqui só se confere ONDE ele está e quando relê
const bloco = { montagens: 0, sinais: [] as number[] }
jest.mock('@/page-parts/atendimentos-ia/precificacao-do-orcamento.component', () => ({
    PrecificacaoDoOrcamento: ({ id, sinal, comLinkDoArquivo }: { id: string; sinal?: number; comLinkDoArquivo?: boolean }) => {
        bloco.sinais.push(sinal ?? 0)
        return <div data-precificacao-stub={id} data-com-link={String(comLinkDoArquivo)}>Precificação do orçamento</div>
    },
}))
let estadoDoCalculoAgora = 'completo'
jest.mock('@/lib/atendimentos-ia/precificacao-do-orcamento', () => ({ ...jest.requireActual('@/lib/atendimentos-ia/precificacao-do-orcamento'), estadoDoCalculo: () => estadoDoCalculoAgora }))

const servidor = { chamadas: [] as Array<{ url: string; metodo: string; corpo: unknown }>, semArquivo: false }
const ORC: Record<string, unknown> = { id: 'orc-14', numero: 14, numero_exibido: '31-PVC', origem: 'agente', levantamento_id: 'lev-31', nome: 'Marcelo e rita preto liso', obs: null as string | null, editado_manualmente_em: null as string | null, criado_em: '2026-11-26T21:00:00Z',
    itens: [{ id: 'i1', ordem: 1, tipologia: 'DP-144', largura_mm: 1600, altura_mm: 5320, quantidade: 1, cor_perfil: 'Preto Liso', vidro: 'laminado 4+4', obs: null as string | null }] }
beforeAll(() => {
    ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:pdf-do-orcamento'
    ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const metodo = init?.method ?? 'GET'
        servidor.chamadas.push({ url, metodo, corpo: init?.body ? JSON.parse(init.body) : undefined })
        if (url.endsWith('/arquivo') && metodo === 'GET') {
            return servidor.semArquivo
                ? { ok: false, status: 404, json: async () => ({ error: 'Este orçamento ainda não tem arquivo: ele é gerado ao salvar a precificação.' }) }
                : { ok: true, status: 200, blob: async () => new Blob(['%PDF-1.4']), json: async () => ({}) }
        }
        if (url.endsWith('/arquivo') && metodo === 'POST') return { ok: true, status: 200, json: async () => ({ ok: true }) }
        if (url.endsWith('/calcular')) return { ok: true, status: 200, json: async () => ({ calculo: {}, avisos: [] as string[] }) }
        if (url.endsWith('/precificacao')) return { ok: true, status: 200, json: async () => ({ orcamento: ORC }) }
        return { ok: true, status: 200, json: async () => ({ orcamento: ORC, cliente: null as unknown, faltas: [] as string[], percentuais: [] as unknown[] }) }
    })
})
/* eslint-disable @typescript-eslint/no-require-imports */
const Pagina = require('@/pages/atendimentos-ia/orcamentos-ia/[id]').default as React.ComponentType
const Atalho = require('@/pages/atendimentos-ia/orcamentos-ia/[id]/precificacao').default as React.ComponentType
/* eslint-enable @typescript-eslint/no-require-imports */

const montadas: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = []
afterEach(() => {
    while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    servidor.chamadas = []
    servidor.semArquivo = false
    estadoDoCalculoAgora = 'completo'
    bloco.sinais = []
})
async function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { root.render(no) })
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    return host
}
const botao = (host: ParentNode, texto: string) => Array.from(host.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === texto) as HTMLButtonElement | undefined
const clicar = async (el: Element | undefined) => {
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { (el as HTMLElement).click() })
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const posicao = (host: HTMLElement, seletorOuTexto: string) => {
    const html = host.innerHTML
    return html.indexOf(seletorOuTexto)
}

describe('0051 — a página do orçamento I.A. é UMA só: itens, precificação, arquivo PDF', () => {
    it('de cima para baixo: os itens com o Calcular, depois a precificação, por último o arquivo PDF; sem o botão Precificar que abria outra página', async () => {
        const host = await montar(<Pagina />)
        const itens = posicao(host, 'Adicionar item')
        const calcular = posicao(host, 'Calcular</span>')
        const precificacao = posicao(host, 'data-bloco-da-precificacao')
        const arquivo = posicao(host, 'data-arquivo-do-orcamento')
        expect(itens).toBeGreaterThan(-1)
        expect([itens < calcular, calcular < precificacao, precificacao < arquivo]).toEqual([true, true, true])
        expect(botao(host, 'Precificar')).toBeUndefined()
        expect(host.querySelector('[data-precificacao-stub="orc-14"]')).not.toBeNull()
        // o link do arquivo que ficava dentro do bloco sai: o arquivo tem a sua seção no fim da página
        expect(host.querySelector('[data-precificacao-stub]')?.getAttribute('data-com-link')).toBe('false')
    })

    it('o arquivo PDF aparece para ver (visualizador) e para baixar, com o número do orçamento no nome', async () => {
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-visualizador-do-arquivo]')?.getAttribute('src')).toBe('blob:pdf-do-orcamento')
        const baixar = host.querySelector('[data-baixar-arquivo]') as HTMLAnchorElement
        expect(baixar.getAttribute('download')).toBe('orcamento-31-PVC.pdf')
        expect(baixar.getAttribute('href')).toBe('blob:pdf-do-orcamento')
    })

    it('sem arquivo ainda: a seção diz por quê, em vez de um visualizador vazio', async () => {
        servidor.semArquivo = true
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-sem-arquivo]')?.textContent).toContain('ainda não tem arquivo')
        expect(host.querySelector('[data-visualizador-do-arquivo]')).toBeNull()
    })

    it('Calcular: calcula, REGERA o arquivo (preço como o do "sim") e relê o arquivo e a precificação', async () => {
        const host = await montar(<Pagina />)
        const lidasDoArquivo = () => servidor.chamadas.filter((c) => c.url.endsWith('/arquivo') && c.metodo === 'GET').length
        const antes = lidasDoArquivo()
        const sinalAntes = bloco.sinais[bloco.sinais.length - 1]
        await clicar(botao(host, 'Calcular'))
        const ordem = servidor.chamadas.map((c) => `${c.metodo} ${c.url.replace('/api/atendimentos-ia/orcamentos/orc-14', '')}`)
        expect(ordem.indexOf('POST /calcular')).toBeGreaterThan(-1)
        expect(ordem.indexOf('POST /arquivo')).toBeGreaterThan(ordem.indexOf('POST /calcular'))
        expect(servidor.chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/arquivo'))?.corpo).toEqual({ modo: 'precificar' })
        expect(lidasDoArquivo()).toBeGreaterThan(antes)
        expect(bloco.sinais[bloco.sinais.length - 1]).toBeGreaterThan(sinalAntes)
    })

    it('Calcular pelo pedido total também regera o arquivo', async () => {
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Calcular pelo pedido total'))
        expect(servidor.chamadas.find((c) => c.url.endsWith('/calcular'))?.corpo).toEqual({ aproveitamento: 'pedido_total' })
        expect(servidor.chamadas.some((c) => c.metodo === 'POST' && c.url.endsWith('/arquivo'))).toBe(true)
    })

    it('sem cálculo completo a precificação não aparece: a página manda calcular', async () => {
        estadoDoCalculoAgora = 'sem_calculo'
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-bloco-da-precificacao]')).toBeNull()
        expect(host.querySelector('[data-sem-precificacao]')?.textContent).toContain('use Calcular')
        expect(host.querySelector('[data-arquivo-do-orcamento]')).not.toBeNull()
    })

    it('o ATALHO /precificacao segue existindo e monta o MESMO bloco', async () => {
        const host = await montar(<Atalho />)
        expect(host.querySelector('[data-precificacao-stub="orc-14"]')).not.toBeNull()
        expect(host.querySelector('[data-precificacao-stub]')?.getAttribute('data-com-link')).toBe('undefined')
    })
})
