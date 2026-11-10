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

const servidor = { status: 200, corpo: {} as Record<string, unknown>, chamadas: [] as Array<{ url: string; metodo: string; corpo: unknown }>,
    /** a resposta de uma rota e método ("POST /api/..."), quando o caso precisa de mais de uma */
    porRota: {} as Record<string, { status: number; corpo: Record<string, unknown> }> }
beforeAll(() => {
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        servidor.chamadas.push({ url, metodo: init?.method ?? 'GET', corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = servidor.porRota[`${init?.method ?? 'GET'} ${url}`] ?? { status: servidor.status, corpo: servidor.corpo }
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo }
    })
})

/* eslint-disable @typescript-eslint/no-require-imports */
const Lista = require('@/pages/atendimentos-ia/orcamentos-ia/index').default as React.ComponentType
const Edicao = require('@/pages/atendimentos-ia/orcamentos-ia/[id]').default as React.ComponentType
const { PAGE_TITLES } = require('@/constants/page-titles')
const { TEXTO_DA_LISTA_VAZIA, O_QUE_A_TRAVESSIA_GRAVA } = require('@/pages/atendimentos-ia/orcamentos-ia/index')
const { FALTA_DO_MODO_DA_COMISSAO, ROTULO_DA_ORIGEM_DO_PERCENTUAL } = require('@/lib/atendimentos-ia/travessia-do-levantamento-plano')
/* eslint-enable @typescript-eslint/no-require-imports */

const montadas: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = []
afterEach(() => {
    while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    servidor.status = 200
    servidor.corpo = {}
    servidor.chamadas = []
    servidor.porRota = {}
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
        expect(botoes(host)).toEqual(['Atravessar levantamento', 'Criar orçamento', 'Editar o orçamento 2', 'Editar o orçamento 1'])
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
        expect(botoes(host)).toEqual(['Atravessar levantamento', 'Criar orçamento'])
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

// ── A TRAVESSIA (dono do produto, 10/11/2026): a ação manual, um levantamento por vez, e o cliente lido do levantamento ──────────────
const clicarNo = async (el: Element | null | undefined) => {
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const botaoCom = (texto: string) => Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === texto) as HTMLButtonElement | undefined
const ROTA_DA_TRAVESSIA = '/api/atendimentos-ia/orcamentos/atravessar'
const LEVANTAMENTOS = [
    { id: 'lev-11', numero: 11, nome: 'Geraldo Huck', orcamento: null },
    { id: 'lev-9', numero: 9, nome: 'Antonio Rock', orcamento: { id: 'b', numero: 1 } },
]
async function abrirATravessia() {
    servidor.corpo = { orcamentos: LISTA }
    servidor.porRota[`GET ${ROTA_DA_TRAVESSIA}`] = { status: 200, corpo: { levantamentos: LEVANTAMENTOS } }
    const host = await montar(<Lista />)
    await clicarNo(botaoCom('Atravessar levantamento'))
    return host
}
async function escolher(rotulo: string) {
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { document.querySelector('[data-travessia] .ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    const opcoes = Array.from(document.querySelectorAll('.ant-select-item-option'))
    await clicarNo(opcoes.find((o) => o.textContent === rotulo))
    return opcoes.map((o) => o.textContent)
}

describe('a travessia na lista', () => {
    it('o modal diz o que será gravado, oferece só os levantamentos SEM orçamento, e não atravessa sem escolher', async () => {
        await abrirATravessia()
        expect(servidor.chamadas.some((c) => c.url === ROTA_DA_TRAVESSIA && c.metodo === 'GET')).toBe(true)
        const modal = document.querySelector('[data-travessia]')!
        for (const linha of O_QUE_A_TRAVESSIA_GRAVA as readonly string[]) expect(modal.textContent).toContain(linha)
        expect(botaoCom('Atravessar')!.disabled).toBe(true)
        expect(await escolher('Levantamento 11 — Geraldo Huck')).toEqual(['Levantamento 11 — Geraldo Huck'])
        expect(botaoCom('Atravessar')!.disabled).toBe(false)
    })
    it('atravessa UM: o POST leva só o escolhido, e a tela abre o orçamento criado', async () => {
        await abrirATravessia()
        await escolher('Levantamento 11 — Geraldo Huck')
        servidor.porRota[`POST ${ROTA_DA_TRAVESSIA}`] = { status: 201, corpo: { orcamento: { id: 'novo', numero: 3 }, itens: 3, faltas: [] } }
        await clicarNo(botaoCom('Atravessar'))
        const posts = servidor.chamadas.filter((c) => c.url === ROTA_DA_TRAVESSIA && c.metodo === 'POST')
        expect(posts).toEqual([{ url: ROTA_DA_TRAVESSIA, metodo: 'POST', corpo: { levantamento_id: 'lev-11' } }])
        expect(rota.push).toHaveBeenCalledWith(expect.stringMatching(/\/novo$/))
    })
    it('o já atravessado (409): a frase que nomeia o orçamento, e nada é aberto', async () => {
        await abrirATravessia()
        await escolher('Levantamento 11 — Geraldo Huck')
        servidor.porRota[`POST ${ROTA_DA_TRAVESSIA}`] = { status: 409, corpo: { error: 'O levantamento 11 já tem o orçamento 3: a travessia não cria um segundo.', orcamento: { id: 'x', numero: 3 } } }
        await clicarNo(botaoCom('Atravessar'))
        expect(document.querySelector('[data-travessia]')!.textContent).toContain('O levantamento 11 já tem o orçamento 3')
        expect(rota.push).not.toHaveBeenCalled()
    })
})

describe('o orçamento do agente: o cliente lido, as faltas e os avisos', () => {
    const ORC_AGENTE = { id: 'b', numero: 1, origem: 'agente', levantamento_id: 'lev', nome: 'Antonio Rock', obs: null as string | null, editado_manualmente_em: null as string | null, criado_em: '2026-11-08T21:00:00Z', itens: [] as unknown[] }
    it('o cartão do cliente traz só o que o levantamento tem, e as faltas são listadas', async () => {
        rota.query = { id: 'b' }
        servidor.corpo = { orcamento: ORC_AGENTE, faltas: [FALTA_DO_MODO_DA_COMISSAO],
            cliente: { levantamento_numero: 9, nome: 'Antonio Rock', telefone: '51 98888-1111', email: null, endereco: null, edificacao: '', obs_obra: null, data_entrega: '2026-12-01', vendedor_nome: 'Paulo', vendedor_employee_id: 'e1' } }
        const host = await montar(<Edicao />)
        const cartao = host.querySelector('[data-cliente-do-levantamento]')!
        expect(cartao.textContent).toContain('do levantamento 9')
        expect(cartao.textContent).toContain('51 98888-1111')
        expect(cartao.textContent).toContain('01/12/2026')
        expect(cartao.textContent).toContain('Paulo')
        expect(cartao.textContent).not.toContain('Edificação')
        expect(cartao.textContent).not.toContain('E-mail')
        expect(host.querySelector('[data-faltas-do-congelado]')!.textContent).toContain(FALTA_DO_MODO_DA_COMISSAO)
    })
    it('os três percentuais com a ORIGEM ao lado; o zero por ausência é DESTACADO, nunca silencioso (regra do zero, 11/11/2026)', async () => {
        rota.query = { id: 'b' }
        servidor.corpo = { orcamento: ORC_AGENTE, cliente: null, faltas: [], percentuais: [
            { campo: 'comissao_percentual', valor: 5, origem: 'levantamento' },
            { campo: 'reserva_tecnica_percentual', valor: 2, origem: 'base_de_conhecimento' },
            { campo: 'lucro_projetado_percentual', valor: 0, origem: 'zero_por_ausencia' },
        ] }
        const host = await montar(<Edicao />)
        const linha = (c: string) => host.querySelector(`[data-percentual="${c}"]`)!
        expect(linha('comissao_percentual').textContent).toBe(`Comissão5%${ROTULO_DA_ORIGEM_DO_PERCENTUAL.levantamento}`)
        expect(linha('reserva_tecnica_percentual').textContent).toBe(`Reserva técnica2%${ROTULO_DA_ORIGEM_DO_PERCENTUAL.base_de_conhecimento}`)
        expect(linha('lucro_projetado_percentual').textContent).toBe(`Lucro projetado0%${ROTULO_DA_ORIGEM_DO_PERCENTUAL.zero_por_ausencia}`)
        // o destaque: só o zero por ausência ganha a cor de aviso
        expect(linha('lucro_projetado_percentual').querySelector('.ant-tag-gold')).not.toBeNull()
        expect(linha('comissao_percentual').querySelector('.ant-tag-gold')).toBeNull()
        expect(linha('reserva_tecnica_percentual').querySelector('.ant-tag-gold')).toBeNull()
    })
    it('o orçamento manual não tem cartão de cliente nem faltas', async () => {
        rota.query = { id: 'a' }
        servidor.corpo = { orcamento: { ...ORC_AGENTE, origem: 'manual', levantamento_id: null }, cliente: null, faltas: [] }
        const host = await montar(<Edicao />)
        expect(host.querySelector('[data-cliente-do-levantamento]')).toBeNull()
        expect(host.querySelector('[data-faltas-do-congelado]')).toBeNull()
        expect(host.querySelector('[data-percentuais-do-orcamento]')).toBeNull()
    })
    it('o cálculo que devolve aviso da tabela congelada mostra o aviso, sem bloquear', async () => {
        rota.query = { id: 'b' }
        servidor.corpo = { orcamento: ORC_AGENTE, cliente: null, faltas: [] }
        servidor.porRota['POST /api/atendimentos-ia/orcamentos/b/calcular'] = { status: 200, corpo: { calculo: {}, avisos: ['Esquadria 2: o levantamento congelou a tabela "A"; o cálculo usou a vigente (B).'] } }
        const host = await montar(<Edicao />)
        await clicarNo(botaoCom('Calcular'))
        expect(host.querySelector('[data-avisos-da-tabela]')!.textContent).toContain('Esquadria 2: o levantamento congelou a tabela "A"')
    })
})
