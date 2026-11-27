/**
 * PORTÃO — A TELA DO ORÇAMENTO I.A. NUMA PÁGINA SÓ (pedidos 0051 e 0052, 27/11/2026, regra inviolável do dono do produto): de cima para baixo, na MESMA
 * página, 1) os ITENS COM CUSTO (bruto, líquido, tempo, valor do minuto, mão de obra e total por item) com o Calcular, 2) a precificação pela margem de
 * contribuição (o bloco de Produtos no modo orçamento, que traz 3) os itens precificados), e no rodapé SÓ o link "Abrir PDF do orçamento" — o visualizador
 * embutido da 0051 saiu. O PDF é regerado a cada cálculo. A página `/precificacao` segue como atalho do mesmo bloco.
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
    PrecificacaoDoOrcamento: ({ id, sinal, naPaginaDoOrcamento }: { id: string; sinal?: number; naPaginaDoOrcamento?: boolean }) => {
        bloco.sinais.push(sinal ?? 0)
        return <div data-precificacao-stub={id} data-na-pagina={String(naPaginaDoOrcamento)}>Precificação do orçamento</div>
    },
}))
let estadoDoCalculoAgora = 'completo'
jest.mock('@/lib/atendimentos-ia/precificacao-do-orcamento', () => ({ ...jest.requireActual('@/lib/atendimentos-ia/precificacao-do-orcamento'), estadoDoCalculo: () => estadoDoCalculoAgora }))

const servidor = { chamadas: [] as Array<{ url: string; metodo: string; corpo: unknown }>, orcamento: null as Record<string, unknown> | null, arquivoRecusa: [] as string[] }
const ORC: Record<string, unknown> = { id: 'orc-14', numero: 14, numero_exibido: '31-PVC', origem: 'agente', levantamento_id: 'lev-31', nome: 'Marcelo e rita preto liso', obs: null as string | null, editado_manualmente_em: null as string | null, criado_em: '2026-11-26T21:00:00Z',
    itens: [{ id: 'i1', ordem: 1, tipologia: 'DP-144', largura_mm: 1600, altura_mm: 5320, quantidade: 1, cor_perfil: 'Preto Liso', vidro: 'laminado 4+4', obs: null as string | null,
        custo_bruto_materiais: 1000 as number | null, custo_liquido_materiais: 800 as number | null, tempo_fabricacao_min: 120 as number | null, valor_minuto: 2.5 as number | null, custo_fabricacao: 300 as number | null, custo_liquido_total: 1100 as number | null }] }
beforeAll(() => {
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const metodo = init?.method ?? 'GET'
        servidor.chamadas.push({ url, metodo, corpo: init?.body ? JSON.parse(init.body) : undefined })
        if (url.endsWith('/arquivo') && metodo === 'POST') {
            return servidor.arquivoRecusa.length ? { ok: false, status: 422, json: async () => ({ error: 'O preço não se formou, e por isso o arquivo não foi gerado.', recusas: servidor.arquivoRecusa }) } : { ok: true, status: 200, json: async () => ({ ok: true }) }
        }
        if (url.endsWith('/calcular')) return { ok: true, status: 200, json: async () => ({ calculo: {}, avisos: [] as string[] }) }
        if (url.endsWith('/precificacao')) return { ok: true, status: 200, json: async () => ({ orcamento: servidor.orcamento ?? ORC }) }
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
    servidor.orcamento = null
    servidor.arquivoRecusa = []
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

describe('0052 — a página do orçamento I.A.: itens com custo, precificação, itens precificados e só o link do PDF', () => {
    it('de cima para baixo: os itens com custo e o Calcular, depois a precificação; sem o botão Precificar, sem visualizador embutido', async () => {
        const host = await montar(<Pagina />)
        const itens = posicao(host, 'Itens com custo')
        const calcular = posicao(host, 'Calcular</span>')
        const precificacao = posicao(host, 'data-bloco-da-precificacao')
        expect([itens > -1, itens < calcular, calcular < precificacao]).toEqual([true, true, true])
        expect(botao(host, 'Precificar')).toBeUndefined()
        expect(host.querySelector('[data-precificacao-stub="orc-14"]')).not.toBeNull()
        expect(host.querySelector('[data-visualizador-do-arquivo]')).toBeNull()
        expect(host.querySelector('iframe')).toBeNull()
    })

    it('cada item mostra o custo bruto, o líquido, o tempo, o valor do minuto, a mão de obra e o total do cálculo gravado', async () => {
        const host = await montar(<Pagina />)
        const cabecalho = Array.from(host.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim())
        for (const c of ['Custo bruto', 'Custo líquido', 'Tempo (min)', 'Valor do minuto', 'Mão de obra', 'Total']) expect(cabecalho).toContain(c)
        const linha = (host.querySelector('tbody tr.ant-table-row') as HTMLElement).textContent ?? ''
        for (const v of ['1.000,00', '800,00', '120', '2,50', '300,00', '1.100,00']) expect(linha).toContain(v)
    })

    it('o item ainda não calculado mostra "—" nos custos, nunca R$ 0,00', async () => {
        estadoDoCalculoAgora = 'sem_calculo'
        const semCusto = { ...ORC, itens: [{ ...(ORC.itens as Array<Record<string, unknown>>)[0], custo_bruto_materiais: null as number | null, custo_liquido_materiais: null as number | null, tempo_fabricacao_min: null as number | null, valor_minuto: null as number | null, custo_fabricacao: null as number | null, custo_liquido_total: null as number | null }] }
        servidor.orcamento = semCusto
        const host = await montar(<Pagina />)
        const linha = (host.querySelector('tbody tr.ant-table-row') as HTMLElement).textContent ?? ''
        expect(linha).not.toContain('R$ 0,00')
        expect(linha.match(/—/g)?.length).toBeGreaterThanOrEqual(6)
    })

    it('o bloco da precificação vai SEM o topo do cliente e SEM a tabela de itens (já estão na página): só a margem, os itens precificados e o link', async () => {
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-precificacao-stub]')?.getAttribute('data-na-pagina')).toBe('true')
    })

    it('Calcular: calcula, REGERA o arquivo (preço como o do "sim") e relê a precificação', async () => {
        const host = await montar(<Pagina />)
        const sinalAntes = bloco.sinais[bloco.sinais.length - 1]
        await clicar(botao(host, 'Calcular'))
        const ordem = servidor.chamadas.map((c) => `${c.metodo} ${c.url.replace('/api/atendimentos-ia/orcamentos/orc-14', '')}`)
        expect(ordem.indexOf('POST /calcular')).toBeGreaterThan(-1)
        expect(ordem.indexOf('POST /arquivo')).toBeGreaterThan(ordem.indexOf('POST /calcular'))
        expect(servidor.chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/arquivo'))?.corpo).toEqual({ modo: 'precificar' })
        expect(bloco.sinais[bloco.sinais.length - 1]).toBeGreaterThan(sinalAntes)
    })

    it('o arquivo que não saiu depois do cálculo: a página diz o que falta', async () => {
        servidor.arquivoRecusa = ['falta o preço do código 1023']
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Calcular'))
        expect(host.querySelector('[data-recusas-do-arquivo-novo]')?.textContent).toContain('falta o preço do código 1023')
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
    })

    it('o ATALHO /precificacao segue existindo e monta o MESMO bloco, com o topo e a tabela de itens (fora da página do orçamento)', async () => {
        const host = await montar(<Atalho />)
        expect(host.querySelector('[data-precificacao-stub="orc-14"]')).not.toBeNull()
        expect(host.querySelector('[data-precificacao-stub]')?.getAttribute('data-na-pagina')).toBe('undefined')
    })
})
