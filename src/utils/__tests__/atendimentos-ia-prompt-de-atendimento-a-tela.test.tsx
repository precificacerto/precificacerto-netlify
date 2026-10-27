/**
 * PORTÃO — o bloco PROMPT DE ATENDIMENTO na tela da conta (`prompt-de-atendimento.component.tsx`).
 *
 * POR QUÊ (dono do produto, 26/10/2026): o terceiro bloco da conta — "como conversar", texto livre, até 4.000
 * caracteres. Ele manda em QUANDO e EM QUE FORMA; de onde vem o número é do código. Vazio é o padrão, e a
 * conversa segue como hoje.
 *
 * O que este portão fica vermelho:
 *   (1) o bloco lê o contexto gravado pela rota da base de conhecimento e mostra quem alterou e quando;
 *   (2) VAZIO é dito como o padrão, sem texto inventado no campo;
 *   (3) o limite de 4.000 é contado como o banco conta (caracteres, não unidades UTF-16): o contador mostra,
 *       e acima do limite o salvar não sai e a frase aparece;
 *   (4) salvar manda PUT { texto }, e a recusa da rota aparece no bloco;
 *   (5) o bloco diz a linha que separa as camadas: o contexto não decide número.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const CONTA = '20e08592-f957-4e72-b7eb-251387e34eb9'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const U = () => require('@/utils/atendimentos-ia-contexto') as typeof import('@/utils/atendimentos-ia-contexto')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Bloco = () => require('@/page-parts/atendimentos-ia/prompt-de-atendimento.component').PromptDeAtendimento as React.ComponentType<{ tenantId: string }>

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: Array<{ chave: string; corpo: unknown }> = []
beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${U().rotaDoContexto(CONTA)}`]: { status: 200, body: { texto: 'Fale curto.', atualizado_em: '2026-10-27T13:05:00Z', atualizado_por: 'Consultor' } },
        [`PUT ${U().rotaDoContexto(CONTA)}`]: { status: 200, body: { depois: {} } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[chave] ?? { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(React.createElement(Bloco(), { tenantId: CONTA })) })
    await assentar()
    return host
}
const campo = (host: HTMLElement) => host.querySelector('textarea[data-contexto]') as HTMLTextAreaElement
const salvar = (host: HTMLElement) => host.querySelector('[data-salvar-contexto]') as HTMLButtonElement
async function digitar(host: HTMLElement, texto: string) {
    const el = campo(host)
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => { setter.call(el, texto); el.dispatchEvent(new Event('input', { bubbles: true })) })
    await assentar()
}

describe('(1)(2) o bloco lê o contexto, e o vazio é o padrão', () => {
    it('mostra o texto gravado, quem alterou e quando', async () => {
        const host = await montar()
        expect(campo(host).value).toBe('Fale curto.')
        expect(host.textContent).toContain('Consultor')
    })

    it('sem contexto gravado: o campo fica VAZIO e o bloco diz que vazio é o padrão', async () => {
        respostas[`GET ${U().rotaDoContexto(CONTA)}`] = { status: 200, body: { texto: null, atualizado_em: null, atualizado_por: null } }
        const host = await montar()
        expect(campo(host).value).toBe('')
        expect(host.textContent).toContain(U().AVISO_DO_CONTEXTO_VAZIO)
    })

    it('falha ao ler é ERRO, e não um campo vazio que alguém salvaria por cima', async () => {
        respostas[`GET ${U().rotaDoContexto(CONTA)}`] = { status: 500, body: { error: 'Falha ao ler a base de conhecimento.' } }
        const host = await montar()
        expect(host.textContent).toContain('Falha ao ler a base de conhecimento.')
        expect(campo(host)).toBeNull()
    })
})

describe('(3) o limite de 4.000, contado como o banco conta', () => {
    it('o contador conta caracteres: 10 emojis são 10', async () => {
        const host = await montar()
        await digitar(host, '🪟'.repeat(10))
        expect(host.querySelector('[data-contador-do-contexto]')?.textContent).toBe('10 / 4.000')
    })

    it('acima de 4.000: o salvar não sai, e a frase diz quantos', async () => {
        const host = await montar()
        await digitar(host, 'x'.repeat(4001))
        expect(salvar(host).disabled).toBe(true)
        expect(host.textContent).toContain(U().fraseDoLimiteDoContexto(4001))
    })

    it('4.000 emojis cabem: o salvar sai', async () => {
        const host = await montar()
        await digitar(host, '🪟'.repeat(4000))
        expect(salvar(host).disabled).toBe(false)
    })
})

describe('(4) salvar', () => {
    it('manda PUT { texto } pela rota do contexto', async () => {
        const host = await montar()
        await digitar(host, 'Mostre o apanhado antes de qualquer valor.')
        await act(async () => { salvar(host).click() })
        await assentar()
        expect(pedidos.find((p) => p.chave === `PUT ${U().rotaDoContexto(CONTA)}`)?.corpo).toEqual({ texto: 'Mostre o apanhado antes de qualquer valor.' })
    })

    it('apagar tudo e salvar manda texto vazio: volta ao padrão', async () => {
        const host = await montar()
        await digitar(host, '')
        await act(async () => { salvar(host).click() })
        await assentar()
        expect(pedidos.find((p) => p.chave.startsWith('PUT'))?.corpo).toEqual({ texto: '' })
    })

    it('a recusa da rota aparece no bloco', async () => {
        respostas[`PUT ${U().rotaDoContexto(CONTA)}`] = { status: 400, body: { error: U().fraseDoLimiteDoContexto(4001) } }
        const host = await montar()
        await digitar(host, 'Fale curto, de novo.')
        await act(async () => { salvar(host).click() })
        await assentar()
        expect(host.textContent).toContain(U().fraseDoLimiteDoContexto(4001))
    })
})

describe('(5) a linha que separa as camadas', () => {
    it('o bloco diz que o contexto manda na forma e no momento, e não no número', async () => {
        const host = await montar()
        expect(host.textContent).toContain(U().A_LINHA_DAS_CAMADAS)
    })
})
