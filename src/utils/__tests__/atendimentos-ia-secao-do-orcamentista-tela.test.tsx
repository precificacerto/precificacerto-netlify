/**
 * PORTÃO — a seção ATENDIMENTOS I.A. no MENU do tenant, a PÁGINA do Orçamentista e o módulo nas
 * PERMISSÕES DE ACESSO (dono do produto, 21/10/2026).
 *
 *   (1) a seção é a que JÁ EXISTE (chave `atendimentos-ia`), MOVIDA para logo abaixo de CLIENTES,
 *       no desktop e no drawer mobile;
 *   (2) o item "Orçamentista" só se desenha quando o SERVIDOR confirma a seção ligada
 *       (`/api/atendimentos-ia/orcamentista/secao` → 200). 404 → nada; sem permissão do módulo,
 *       nem se pergunta;
 *   (3) dentro da MESMA seção: o super admin não vê "Orçamentista", e o tenant não vê "Contas
 *       ligadas" nem "Fornecedores e tabelas";
 *   (4) a página: seção desligada não desenha o painel; ligada, mostra o estado da conexão (sem
 *       repetir a célula), as pessoas liberadas, e a lista — com o ESTADO VAZIO desenhado quando
 *       não há pré-definição. Nenhum botão, nenhuma escrita;
 *   (5) "Orçamentista" aparece em Permissões de Acesso, no grupo "Atendimentos I.A.", entre
 *       Clientes e Comercial — a mesma posição do menu.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@/shared/enums/permissions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/', asPath: '/', query: {}, replace: () => {}, push: () => {}, events: { on: () => {}, off: () => {} } }),
}))

const DONO = {
    uid: 'u-dono', id: 'u-dono', tenant_id: 't-a', email: 'd@x', name: 'Dono', role: 'admin', is_super_admin: false,
    permissions: [PERMISSIONS.ADMIN] as string[], modulePermissions: {} as Record<string, { can_view: boolean; can_edit: boolean }>,
    calcType: 'INDUSTRIALIZATION', onboardingCompleted: true, planStatus: 'ACTIVE', isActive: true,
}
const SUPER_ADMIN = { ...DONO, uid: 'u-super', id: 'u-super', tenant_id: undefined as unknown as string, role: 'super_admin', is_super_admin: true, permissions: [] as string[] }
const VENDEDOR_SEM_ORCAMENTISTA = {
    ...DONO, uid: 'u-vend', id: 'u-vend', role: 'seller', permissions: [] as string[],
    modulePermissions: { connectivity: { can_view: true, can_edit: false }, customers: { can_view: true, can_edit: false } },
}
let usuario: typeof DONO = DONO
jest.mock('@/hooks/use-auth.hook', () => ({
    useAuth: () => ({ currentUser: usuario, loading: false, logout: () => {}, hasPermission: () => true }),
}))
jest.mock('@/supabase/client', () => {
    const vazio: { data: unknown[]; error: unknown } = { data: [], error: null }
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'range', 'filter', 'gte', 'lte', 'ilike', 'or', 'not']) chain[m] = () => chain
    chain.single = () => Promise.resolve(vazio)
    chain.maybeSingle = () => Promise.resolve(vazio)
    chain.then = (fn: (v: unknown) => unknown) => Promise.resolve(vazio).then(fn)
    return { supabase: { from: () => chain, auth: { getUser: () => Promise.resolve(vazio) } } }
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))
jest.mock('@/hooks/use-data.hooks', () => ({
    useEmployees: () => ({ data: [], isLoading: false, mutate: jest.fn() }),
    useItems: () => ({ data: [], isLoading: false, mutate: jest.fn() }),
}))
jest.mock('@/components/layout/layout.component', () => ({
    Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// ── O servidor falso ─────────────────────────────────────────────────────────────────────
const servidor = {
    secao: 200,
    painel: { status: 200, corpo: {} as Record<string, unknown> },
    chamadas: [] as { url: string; metodo: string }[],
}
beforeAll(() => {
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
        servidor.chamadas.push({ url, metodo: init?.method ?? 'GET' })
        const json = (status: number, corpo: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo })
        if (url.endsWith('/api/atendimentos-ia/orcamentista/secao')) return json(servidor.secao, servidor.secao === 200 ? { ativa: true } : { error: 'x' })
        if (url.endsWith('/api/atendimentos-ia/orcamentista/painel')) return json(servidor.painel.status, servidor.painel.corpo)
        return json(404, {})
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Nav } = require('@/components/layout/nav.component') as { Nav: React.ComponentType }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MobileMoreDrawer } = require('@/components/layout/mobile-more-drawer.component') as {
    MobileMoreDrawer: React.ComponentType<{ open: boolean; onClose: () => void }>
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { esquecerSecaoDoOrcamentista } = require('@/hooks/use-secao-do-orcamentista.hook') as { esquecerSecaoDoOrcamentista: () => void }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const paginaMod = require('@/pages/atendimentos-ia/orcamentista') as {
    default: React.ComponentType
    TEXTO_DO_VAZIO_O_QUE_APARECE: string
    TEXTO_DO_VAZIO_O_QUE_FALTA: string
    TEXTO_SEM_CONEXAO: string
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Employees = require('@/pages/funcionarios/index').default as React.ComponentType

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    usuario = DONO
    servidor.secao = 200
    servidor.chamadas = []
    esquecerSecaoDoOrcamentista()
})
async function montar(no: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(no) })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- deixa as respostas do fetch falso assentarem
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    return host
}

const SECAO = 'atendimentos-ia'
const destinos = (raiz: ParentNode) => Array.from(raiz.querySelectorAll(`[data-section-key="${SECAO}"] a[href]`)).map((a) => a.getAttribute('href'))
const ordemDasSecoes = (raiz: ParentNode) => Array.from(raiz.querySelectorAll('[data-section-key]')).map((s) => s.getAttribute('data-section-key'))
const perguntouASecao = () => servidor.chamadas.some((c) => c.url.endsWith('/orcamentista/secao'))
const drawer = () => document.querySelector('.pc-mobile-more-drawer-content') as ParentNode

describe('(1)(2)(3) o menu desktop', () => {
    it('seção ligada: "Orçamentista" na seção atendimentos-ia, logo abaixo de CLIENTES — sem os itens do super admin', async () => {
        const host = await montar(<Nav />)
        expect(destinos(host)).toEqual([ROUTES.ATENDIMENTOS_IA_ORCAMENTISTA])
        expect(host.querySelector(`[data-section-key="${SECAO}"] .nav-section-label`)?.textContent?.trim()).toBe('Atendimentos I.A.')
        expect(host.querySelector(`[data-section-key="${SECAO}"]`)?.textContent).toContain('Orçamentista')
        const ordem = ordemDasSecoes(host)
        expect(ordem.indexOf(SECAO)).toBe(ordem.indexOf('clientes') + 1)
    })

    it('seção desligada (404): nem o item, nem a seção', async () => {
        servidor.secao = 404
        const host = await montar(<Nav />)
        expect(perguntouASecao()).toBe(true)
        expect(host.querySelector(`[data-section-key="${SECAO}"]`)).toBeNull()
        expect(host.querySelector(`a[href="${ROUTES.ATENDIMENTOS_IA_ORCAMENTISTA}"]`)).toBeNull()
        expect(host.querySelectorAll('a[href]').length).toBeGreaterThan(0)
    })

    it('sem permissão do módulo orcamentista: nem pergunta ao servidor, e não desenha', async () => {
        usuario = VENDEDOR_SEM_ORCAMENTISTA as typeof DONO
        const host = await montar(<Nav />)
        expect(perguntouASecao()).toBe(false)
        expect(host.querySelector(`a[href="${ROUTES.ATENDIMENTOS_IA_ORCAMENTISTA}"]`)).toBeNull()
        expect(host.querySelector('[data-section-key="clientes"]')).not.toBeNull()
    })

    it('super admin: a MESMA seção, só com os dois itens dele — e o Orçamentista não se desenha nem se pergunta', async () => {
        usuario = SUPER_ADMIN as typeof DONO
        const host = await montar(<Nav />)
        expect(destinos(host)).toEqual([ROUTES.SUPER_ADMIN_IA_CONTAS, ROUTES.SUPER_ADMIN_IA_FORNECEDORES])
        expect(perguntouASecao()).toBe(false)
    })
})

describe('(1)(2)(3) o drawer mobile', () => {
    it('seção ligada: "Orçamentista" na mesma seção, e o bloco vem logo depois de Clientes', async () => {
        await montar(<MobileMoreDrawer open onClose={() => {}} />)
        expect(destinos(drawer())).toEqual([ROUTES.ATENDIMENTOS_IA_ORCAMENTISTA])
        const ordem = ordemDasSecoes(drawer())
        expect(ordem.indexOf(SECAO)).toBe(ordem.indexOf('clientes') + 1)
    })

    it('seção desligada (404): nada', async () => {
        servidor.secao = 404
        await montar(<MobileMoreDrawer open onClose={() => {}} />)
        expect(drawer().querySelector(`a[href="${ROUTES.ATENDIMENTOS_IA_ORCAMENTISTA}"]`)).toBeNull()
        expect(drawer().querySelectorAll('a[href]').length).toBeGreaterThan(0)
    })

    it('super admin: só os dois itens dele', async () => {
        usuario = SUPER_ADMIN as typeof DONO
        await montar(<MobileMoreDrawer open onClose={() => {}} />)
        expect(destinos(drawer())).toEqual([ROUTES.SUPER_ADMIN_IA_CONTAS, ROUTES.SUPER_ADMIN_IA_FORNECEDORES])
    })
})

describe('(4) a página /atendimentos-ia/orcamentista', () => {
    const Pagina = () => React.createElement(paginaMod.default)
    const PAINEL_VAZIO = { conexao: { existe: false, conectado: false, conectadoEm: null as string | null }, liberadas: 0, levantamentos: [] as unknown[] }

    it('seção desligada (404): não desenha o painel, a conexão nem a lista', async () => {
        servidor.painel = { status: 404, corpo: { error: 'O Atendimentos I.A. não está ligado nesta conta.' } }
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-pagina-do-orcamentista]')?.getAttribute('data-estado')).toBe('desligada')
        expect(host.querySelector('[data-painel]')).toBeNull()
        expect(host.querySelector('[data-conexao]')).toBeNull()
        expect(host.querySelector('[data-lista-vazia]')).toBeNull()
    })

    it('sem pré-definição: o estado vazio DESENHADO — o que vai aparecer e o que falta', async () => {
        servidor.painel = { status: 200, corpo: PAINEL_VAZIO }
        const host = await montar(<Pagina />)
        const vazio = host.querySelector('[data-lista-vazia]')
        expect(vazio).not.toBeNull()
        expect(vazio!.textContent).toContain(paginaMod.TEXTO_DO_VAZIO_O_QUE_APARECE)
        expect(vazio!.textContent).toContain(paginaMod.TEXTO_DO_VAZIO_O_QUE_FALTA)
        expect(host.querySelectorAll('[data-levantamento]')).toHaveLength(0)
    })

    it('sem conexão: uma linha dizendo isso, com o link para Conectividade — sem repetir a célula', async () => {
        servidor.painel = { status: 200, corpo: PAINEL_VAZIO }
        const host = await montar(<Pagina />)
        const conexao = host.querySelector('[data-conexao]')!
        expect(conexao.getAttribute('data-conexao')).toBe('sem-conexao')
        expect(conexao.textContent).toContain(paginaMod.TEXTO_SEM_CONEXAO)
        expect(conexao.querySelector(`a[href="${ROUTES.CONNECTIVITY}"]`)).not.toBeNull()
        // a célula NÃO se repete: nada de QR, nada de lista de funcionários, nenhuma chave
        expect(host.querySelector('[data-celula-do-orcamentista]')).toBeNull()
        expect(host.querySelector('[data-conectar]')).toBeNull()
        expect(host.querySelector('button[role="switch"]')).toBeNull()
    })

    it('com conexão: conectado, e quantas pessoas estão liberadas', async () => {
        servidor.painel = { status: 200, corpo: { ...PAINEL_VAZIO, conexao: { existe: true, conectado: true, conectadoEm: '2026-10-21T10:00:00Z' }, liberadas: 3 } }
        const host = await montar(<Pagina />)
        const conexao = host.querySelector('[data-conexao]')!
        expect(conexao.getAttribute('data-conexao')).toBe('conectado')
        expect(host.querySelector('[data-liberadas]')?.getAttribute('data-liberadas')).toBe('3')
        expect(host.querySelector('[data-liberadas]')?.textContent).toContain('3')
    })

    it('com levantamentos: código, quem pediu, quando, e o estado — travessão quando vazio', async () => {
        servidor.painel = {
            status: 200,
            corpo: {
                ...PAINEL_VAZIO,
                levantamentos: [
                    { id: 'p2', codigo: 'E5F6A7B8', quemPediu: '(54) •••••-6655', quando: '2026-10-21T11:00:00Z', estado: null },
                    { id: 'p1', codigo: 'A1B2C3D4', quemPediu: 'Ana', quando: '2026-10-21T09:00:00Z', estado: 'EM_LEVANTAMENTO' },
                ],
            },
        }
        const host = await montar(<Pagina />)
        const linhas = Array.from(host.querySelectorAll('[data-levantamento]'))
        expect(linhas.map((l) => l.getAttribute('data-levantamento'))).toEqual(['p2', 'p1'])
        expect(linhas[0].textContent).toContain('E5F6A7B8')
        expect(linhas[0].textContent).toContain('(54) •••••-6655')
        expect(linhas[0].querySelector('[data-estado-do-levantamento]')?.textContent).toBe('—')
        expect(linhas[1].querySelector('[data-estado-do-levantamento]')?.textContent).toBe('EM_LEVANTAMENTO')
        expect(host.querySelector('[data-lista-vazia]')).toBeNull()
    })

    it('LEITURA APENAS: nenhum botão na página, e só GET sai dela', async () => {
        servidor.painel = { status: 200, corpo: { ...PAINEL_VAZIO, levantamentos: [{ id: 'p1', codigo: 'A1B2C3D4', quemPediu: 'Ana', quando: '2026-10-21T09:00:00Z', estado: 'X' }] } }
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-painel]')).not.toBeNull()
        expect(host.querySelectorAll('button')).toHaveLength(0)
        expect(servidor.chamadas.filter((c) => c.metodo !== 'GET')).toEqual([])
    })
})

describe('(5) Permissões de Acesso', () => {
    it('"Orçamentista" aparece, no grupo "Atendimentos I.A.", entre Clientes e Comercial', async () => {
        const host = await montar(<Employees />)
        const botao = Array.from(host.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Novo Funcionário'))
        expect(botao).toBeTruthy()
        // eslint-disable-next-line testing-library/no-unnecessary-act -- abre o drawer, onde mora o painel de permissões
        await act(async () => { (botao as HTMLButtonElement).click() })
        const t = document.body.textContent || ''
        const painel = t.slice(t.indexOf('Permissões de Acesso'))
        const iCli = painel.indexOf('Clientes')
        const iAte = painel.indexOf('Atendimentos I.A.')
        const iOrc = painel.indexOf('Orçamentista')
        const iCom = painel.indexOf('Comercial')
        expect(iAte).toBeGreaterThan(iCli)
        expect(iOrc).toBeGreaterThan(iAte)
        expect(iCom).toBeGreaterThan(iOrc)
    })
})
