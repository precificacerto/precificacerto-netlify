/**
 * PORTÃO — a TELA de "Tabelas em uso", na configuração da conta (/super-admin/atendimentos-ia/
 * contas/[tenantId]).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> REGRA INVIOLÁVEL <<<
 * A tela mostra apenas o nome da conta e a configuração do Atendimentos I.A. Nada do conteúdo da
 * conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O super admin não tem
 * tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   (a) nicho sem fornecedor: a tela diz "Nenhum fornecedor neste nicho ainda" e NÃO cai para a
 *       lista da plataforma — nem pede a rota de fornecedores do catálogo;
 *   (b) o seletor de fornecedor oferece exatamente os fornecedores que a rota da conta devolveu;
 *   (c) DOIS seletores, em sequência: escolhido o fornecedor, o segundo mostra as tabelas DELE e
 *       de mais ninguém; "Adicionar" manda só `tabela_id`, na rota da conta;
 *   (d) a lista mostra as tabelas em uso com a vigência COMO FOI DIGITADA, sem regra de
 *       vencimento; "Remover" chama a rota da tabela daquela conta;
 *   (e) conta sem nicho salvo: a tela pede a segmentação antes, e não mostra seletor;
 *   (f) a recusa da rota aparece com a frase dela.
 *
 * O mockup (`docs/prd/atendimentos-ia-mockup.html`, `fornDoNicho`) caía para a lista inteira
 * quando o nicho não tinha fornecedor. A instrução do dono do produto é o contrário, e é ela que
 * o caso (a) prende.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROTAS_DO_CATALOGO, type ContaLigada, type Nicho, type TabelasDaConta } from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const CONTA_A = '00000000-0000-0000-0000-00000000000a'
const N_ESQ = '33333333-3333-3333-3333-333333333331'
const N_SERR = '33333333-3333-3333-3333-333333333333'
const F_SUL = '44444444-4444-4444-4444-444444444441'
const F_NORTE = '44444444-4444-4444-4444-444444444442'
const T_SUL_1 = '55555555-5555-5555-5555-555555555511'
const T_SUL_2 = '55555555-5555-5555-5555-555555555512'
const T_NORTE_1 = '55555555-5555-5555-5555-555555555521'

jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/contas/[tenantId]', asPath: '/', query: { tenantId: '00000000-0000-0000-0000-00000000000a' }, replace: () => {}, push: () => {} }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const conta = (nicho_id: string | null): ContaLigada => ({
    tenant_id: CONTA_A, nome: 'Conta Alfa', modelo: 'FABRICACAO', nicho_id, nicho_nome: nicho_id === N_ESQ ? 'Esquadrias' : nicho_id ? 'Serralheria' : null,
})
const NICHOS: Nicho[] = [
    { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true },
    { id: N_SERR, modelo: 'FABRICACAO', nome: 'Serralheria', ativo: true },
]
const COM_FORNECEDORES: TabelasDaConta = {
    nicho_id: N_ESQ,
    em_uso: [{ tabela_id: T_SUL_2, fornecedor_id: F_SUL, fornecedor_nome: 'Alumínio Sul', arquivo_nome: 'sul-novembro.xlsx', motor_nome: 'motor-sul.xlsx', vigencia: 'vale até sair a nova lista' }],
    fornecedores: [
        { id: F_NORTE, nome: 'Alumínio Norte', tabelas: [{ id: T_NORTE_1, arquivo_nome: 'norte.pdf', motor_nome: 'motor-norte.pdf', vigencia: null }] },
        { id: F_SUL, nome: 'Alumínio Sul', tabelas: [
            { id: T_SUL_1, arquivo_nome: 'sul-outubro.xlsx', motor_nome: 'motor-sul.xlsx', vigencia: 'desde 01/10/2026' },
            { id: T_SUL_2, arquivo_nome: 'sul-novembro.xlsx', motor_nome: 'motor-sul.xlsx', vigencia: 'vale até sair a nova lista' },
        ] },
    ],
}

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: { url: string; metodo: string; corpo: unknown }[] = []
function responder(c: ContaLigada, tabelas: TabelasDaConta) {
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.contas}`]: { status: 200, body: [c] },
        [`GET ${ROTAS_DO_CATALOGO.nichos}`]: { status: 200, body: NICHOS },
        [`GET ${ROTAS_DO_CATALOGO.tabelasDaConta(CONTA_A)}`]: { status: 200, body: tabelas },
        [`POST ${ROTAS_DO_CATALOGO.tabelasDaConta(CONTA_A)}`]: { status: 201, body: { ok: true } },
        [`DELETE ${ROTAS_DO_CATALOGO.tabelaDaConta(CONTA_A, T_SUL_2)}`]: { status: 200, body: { ok: true } },
    }
}
beforeEach(() => {
    pedidos.length = 0
    responder(conta(N_ESQ), COM_FORNECEDORES)
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const metodo = init?.method ?? 'GET'
        pedidos.push({ url, metodo, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[`${metodo} ${url}`] ?? { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// A página é lida DENTRO de cada caso: o `require` no topo derrubaria o arquivo inteiro.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AConta = () => require('@/pages/super-admin/atendimentos-ia/contas/[tenantId]').default as React.ComponentType

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const Pagina = AConta()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(<Pagina />) })
    await assentar()
    await assentar()
    return host
}
const grupo = (host: HTMLElement) => host.querySelector('[data-grupo="tabelas-em-uso"]') as HTMLElement
// `?? null`: sem o seletor, `?.` devolve `undefined`, e o `toBeNull()` dos casos (a) e (e) não o aceitaria.
const seletor = (rotulo: string) => (document.querySelector(`input[aria-label="${rotulo}"]`)?.closest('.ant-select') ?? null) as HTMLElement | null
async function abrir(rotulo: string): Promise<string[]> {
    const s = seletor(rotulo) as HTMLElement
    await act(async () => { (s.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    const listas = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
    const ultima = listas[listas.length - 1] as HTMLElement
    return Array.from(ultima.querySelectorAll('.ant-select-item-option')).map((o) => o.textContent || '')
}
async function escolher(texto: string) {
    const listas = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
    const ultima = listas[listas.length - 1] as HTMLElement
    const opcao = Array.from(ultima.querySelectorAll('.ant-select-item-option')).find((o) => (o.textContent || '').includes(texto)) as HTMLElement
    await act(async () => { opcao.click() })
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === texto) as HTMLButtonElement | undefined

describe('Tabelas em uso — a cascata na tela', () => {
    it('(a) nicho sem fornecedor: diz que não há, e não pede a lista da plataforma', async () => {
        responder(conta(N_SERR), { nicho_id: N_SERR, em_uso: [], fornecedores: [] })
        const host = await montar()
        expect(grupo(host).textContent).toContain('Nenhum fornecedor neste nicho ainda')
        expect(seletor('Fornecedor')).toBeNull()
        expect(pedidos.map((p) => p.url)).not.toContain(ROTAS_DO_CATALOGO.fornecedores)
    })

    it('(b) o seletor de fornecedor oferece EXATAMENTE os da rota da conta — e a lista da plataforma não é pedida', async () => {
        await montar()
        expect(await abrir('Fornecedor')).toEqual(['Alumínio Norte', 'Alumínio Sul'])
        expect(pedidos.map((p) => p.url)).toContain(ROTAS_DO_CATALOGO.tabelasDaConta(CONTA_A))
        expect(pedidos.map((p) => p.url)).not.toContain(ROTAS_DO_CATALOGO.fornecedores)
    })

    it('(c) dois seletores: a tabela só aparece depois do fornecedor, e mostra só as DELE', async () => {
        await montar()
        expect(seletor('Tabela do fornecedor')?.classList.contains('ant-select-disabled')).toBe(true)
        await abrir('Fornecedor')
        await escolher('Alumínio Sul')
        expect(seletor('Tabela do fornecedor')?.classList.contains('ant-select-disabled')).toBe(false)
        const opcoes = await abrir('Tabela do fornecedor')
        expect(opcoes).toHaveLength(2)
        expect(opcoes.some((o) => o.includes('sul-outubro.xlsx'))).toBe(true)
        expect(opcoes.some((o) => o.includes('sul-novembro.xlsx'))).toBe(true)
        expect(opcoes.some((o) => o.includes('norte.pdf'))).toBe(false)
    })

    it('(c) "Adicionar" manda SÓ tabela_id, por POST, na rota da conta', async () => {
        const host = await montar()
        await abrir('Fornecedor')
        await escolher('Alumínio Sul')
        await abrir('Tabela do fornecedor')
        await escolher('sul-outubro.xlsx')
        await act(async () => { botao(grupo(host), 'Adicionar')!.click() })
        await assentar()
        expect(pedidos.filter((p) => p.metodo !== 'GET')).toEqual([{ url: ROTAS_DO_CATALOGO.tabelasDaConta(CONTA_A), metodo: 'POST', corpo: { tabela_id: T_SUL_1 } }])
    })

    it('(d) a lista mostra a tabela em uso com a vigência COMO FOI DIGITADA, sem regra de vencimento', async () => {
        const host = await montar()
        const linha = grupo(host).querySelector('[data-tabela-em-uso]') as HTMLElement
        expect(linha.textContent).toContain('Alumínio Sul')
        expect(linha.textContent).toContain('sul-novembro.xlsx')
        expect(linha.textContent).toContain('motor-sul.xlsx')
        expect(linha.querySelector('[data-vigencia]')?.textContent).toBe('vale até sair a nova lista')
        expect(grupo(host).textContent).not.toMatch(/venc|expir/i)
    })

    it('(d) "Remover" chama a rota da tabela DAQUELA conta', async () => {
        const host = await montar()
        const linha = grupo(host).querySelector('[data-tabela-em-uso]') as HTMLElement
        await act(async () => { botao(linha, 'Remover')!.click() })
        await assentar()
        expect(pedidos.filter((p) => p.metodo !== 'GET')).toEqual([{ url: ROTAS_DO_CATALOGO.tabelaDaConta(CONTA_A, T_SUL_2), metodo: 'DELETE', corpo: undefined }])
    })

    it('(e) conta sem nicho salvo: pede a segmentação antes, e não mostra seletor', async () => {
        responder(conta(null), { nicho_id: null, em_uso: [], fornecedores: [] })
        const host = await montar()
        expect(grupo(host).textContent).toMatch(/modelo e o nicho/)
        expect(seletor('Fornecedor')).toBeNull()
    })

    it('(f) a recusa da rota ao adicionar aparece com a frase dela', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.tabelasDaConta(CONTA_A)}`] = { status: 409, body: { error: 'Esta tabela já está em uso nesta conta.' } }
        const host = await montar()
        await abrir('Fornecedor')
        await escolher('Alumínio Sul')
        await abrir('Tabela do fornecedor')
        await escolher('sul-outubro.xlsx')
        await act(async () => { botao(grupo(host), 'Adicionar')!.click() })
        await assentar()
        expect(grupo(host).textContent).toContain('Esta tabela já está em uso nesta conta.')
    })
})
