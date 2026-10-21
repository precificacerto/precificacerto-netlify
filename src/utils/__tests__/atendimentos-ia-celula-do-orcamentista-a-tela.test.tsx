/**
 * PORTÃO — a TELA da célula do orçamentista em Conectividade
 * (`src/page-parts/conectividade/celula-do-orcamentista.component.tsx`).
 *
 * A tela não decide nada sozinha: ela lê as rotas (`fetch` falso aqui). Este portão prova o que a
 * tela faz com o que recebe:
 *   (1) a rota responde 404 (seção desligada): o card NÃO se desenha — e a lista nem é pedida;
 *   (2) a seção ligada: o card aparece com o rótulo, o estado e a lista;
 *   (3) funcionário sem telefone: a linha diz "sem telefone", tem o link para o cadastro, a chave
 *       está DESLIGADA e INOPERANTE — e clicar nela não emite nenhum POST;
 *   (4) a divergência aparece na linha, com o botão de atualizar.
 * A célula de baixo ("Sua conexão WhatsApp") não é tocada por este componente.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { CelulaDoOrcamentista, TITULO_DA_CELULA } from '@/page-parts/conectividade/celula-do-orcamentista.component'
import { ROUTES } from '@/constants/routes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
})
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children) }))

const LINHAS = [
    { employee_id: 'f-com', nome: 'Ana', cargo: 'Vendedora', telefone: '51999887766', motivoSemTelefone: null, autorizacao: { id: 'a1', telefone: '51900001111', ativo: true }, divergente: true, podeLigar: false, podeDesligar: true },
    { employee_id: 'f-sem', nome: 'Bruno', cargo: 'Vendedor', telefone: null, motivoSemTelefone: 'sem telefone no cadastro', autorizacao: null, divergente: false, podeLigar: false, podeDesligar: false },
]

type Resposta = { status: number; corpo: unknown }
let chamadas: { url: string; metodo: string }[] = []
function falsificar(respostas: Record<string, Resposta>) {
    chamadas = []
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
        const metodo = init?.method ?? 'GET'
        chamadas.push({ url, metodo })
        const r = respostas[`${metodo} ${url}`] ?? { status: 500, corpo: { error: 'não previsto' } }
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo }
    })
}

const montados: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montados.length) { const m = montados.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montados.push({ root, host })
    await act(async () => { root.render(React.createElement(CelulaDoOrcamentista)) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    return host
}

const LIGADA: Record<string, Resposta> = {
    'GET /api/atendimentos-ia/orcamentista/conexao': { status: 200, corpo: { estado: 'conectado', conectadoPor: 'Quem Logou', conectadoEm: '2026-10-21T10:00:00Z', numero: null, motivoSemNumero: 'O WUZAPI não informa o número na consulta da sessão.' } },
    'GET /api/atendimentos-ia/orcamentista/autorizados': { status: 200, corpo: { linhas: LINHAS } },
}

describe('(1) a seção desligada: o card não se desenha', () => {
    it('a rota responde 404 → nada na tela, e a lista nem é pedida', async () => {
        falsificar({ 'GET /api/atendimentos-ia/orcamentista/conexao': { status: 404, corpo: { error: 'desligado' } } })
        const host = await montar()
        expect(host.querySelector('[data-celula-do-orcamentista]')).toBeNull()
        expect(host.textContent).not.toContain(TITULO_DA_CELULA)
        expect(chamadas.map((c) => c.url)).toEqual(['/api/atendimentos-ia/orcamentista/conexao'])
    })
})

describe('(2) a seção ligada: o card, o estado e a lista', () => {
    it('rótulo, "Conectado", quem conectou, e uma linha por funcionário', async () => {
        falsificar(LIGADA)
        const host = await montar()
        const card = host.querySelector('[data-celula-do-orcamentista]')!
        expect(card.textContent).toContain(TITULO_DA_CELULA)
        expect(card.querySelector('[data-estado]')!.textContent).toBe('Conectado')
        expect(card.querySelector('[data-cabecalho-conectado]')!.textContent).toContain('Quem Logou')
        expect(card.querySelector('[data-desconectar]')).not.toBeNull()
        expect([...card.querySelectorAll('[data-linha]')].map((l) => l.getAttribute('data-linha'))).toEqual(['f-com', 'f-sem'])
    })
})

describe('(3) funcionário sem telefone: a chave desligada e inoperante', () => {
    it('"sem telefone", o link para o cadastro, e clicar não emite POST', async () => {
        falsificar(LIGADA)
        const host = await montar()
        const linha = host.querySelector('[data-linha="f-sem"]')!
        expect(linha.querySelector('[data-sem-telefone]')!.textContent).toContain('sem telefone')
        expect(linha.querySelector('a')!.getAttribute('href')).toBe(ROUTES.EMPLOYEES)
        const chave = linha.querySelector('[data-chave="f-sem"]') as HTMLButtonElement
        expect(chave.getAttribute('aria-checked')).toBe('false')
        expect(chave.disabled).toBe(true)
        await act(async () => { chave.click() })
        expect(chamadas.filter((c) => c.metodo === 'POST')).toEqual([])
    })

    it('a chave de quem TEM autorização ligada é operável — o contraste que mostra que a trava é por linha', async () => {
        falsificar(LIGADA)
        const host = await montar()
        const chave = host.querySelector('[data-chave="f-com"]') as HTMLButtonElement
        expect(chave.getAttribute('aria-checked')).toBe('true')
        expect(chave.disabled).toBe(false)
    })
})

describe('(4) a divergência aparece na linha', () => {
    it('o aviso com o número autorizado e o botão de atualizar', async () => {
        falsificar(LIGADA)
        const host = await montar()
        const aviso = host.querySelector('[data-linha="f-com"] [data-divergente]')!
        expect(aviso.textContent).toContain('(51) 90000-1111')
        expect(aviso.textContent).toContain('Usar o do cadastro')
        expect(host.querySelector('[data-linha="f-sem"] [data-divergente]')).toBeNull()
    })
})
