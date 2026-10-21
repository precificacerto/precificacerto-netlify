/**
 * PORTÃO — A SEÇÃO ATENDIMENTOS I.A. NO MENU, E O GUARDA QUE A DEIXA ABRIR (bloco 2B.2).
 *
 * O menu e o `AuthGuard` são DUAS listas de quem vai aonde, e já divergiram uma vez
 * (`docs/registros/o-menu-oferecia-o-que-o-guarda-proibia.md`): o menu oferecia `/clientes` ao
 * super admin e o guarda o devolvia ao painel. Este portão afirma as duas pontas para a seção
 * nova, com o MESMO usuário e o MESMO destino:
 *   (a) o menu desktop do super admin traz a seção, com "Contas ligadas" e "Fornecedores e
 *       tabelas" — o primeiro entrou no bloco 2C.1, em 19/10/2026;
 *   (b) o drawer mobile traz os mesmos itens, na mesma seção e na mesma ordem;
 *   (c) TODO destino da seção mora sob `/super-admin/` — a lista que o guarda já permite;
 *   (d) o GUARDA, com o super admin no destino, NÃO o redireciona — e o mesmo caminho sem o
 *       prefixo, sim: é o caso que fica vermelho se a rota sair de `/super-admin/`. (O guarda
 *       NÃO barra o usuário de conta em `/super-admin/*` — medido: ele cai no `setAuthorized`.
 *       Quem barra é a PÁGINA, que o devolve ao início, e a ROTA, que responde 403 —
 *       `atendimentos-ia-rotas.test.ts`.)
 *   (e) um usuário de conta não vê a seção;
 *   (f) os itens DO SUPER ADMIN não entraram em MODULES nem na tela de Permissões. (Até
 *       21/10/2026 este caso afirmava também que `orcamentista` ficava fora das concedíveis; a
 *       seção recebeu o item do tenant e o módulo entrou nas permissões no mesmo commit, como a
 *       decisão de 18/10/2026 mandava. O portão disso: `atendimentos-ia-secao-do-orcamentista-*`.)
 */
import React, { type ReactNode } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'
import { MODULES, MODULOS_CONCEDIVEIS, MODULOS_NAO_CONCEDIVEIS } from '@/hooks/use-permissions.hook'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const replaces: string[] = []
let caminhoAtual = '/'
jest.mock('next/router', () => ({
    useRouter: () => ({
        pathname: caminhoAtual,
        asPath: caminhoAtual,
        query: {},
        replace: (url: string) => { replaces.push(url) },
        push: () => {},
        events: { on: () => {}, off: () => {} },
    }),
}))

const SUPER_ADMIN = {
    id: 'u-super', email: 's@x', name: 'Super', role: 'super_admin', is_super_admin: true,
    permissions: [] as string[], modulePermissions: {}, onboardingCompleted: true,
    planStatus: 'ACTIVE', isActive: true, isFree: false, calcType: 'INDUSTRIALIZACAO',
}
const ADMIN_DE_CONTA = { ...SUPER_ADMIN, id: 'u-admin', role: 'admin', is_super_admin: false, tenant_id: 't-a' }
let usuario: typeof SUPER_ADMIN = SUPER_ADMIN
jest.mock('@/hooks/use-auth.hook', () => ({
    useAuth: () => ({ currentUser: usuario, loading: false, logout: () => {} }),
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Nav } = require('@/components/layout/nav.component') as { Nav: React.ComponentType }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MobileMoreDrawer } = require('@/components/layout/mobile-more-drawer.component') as {
    MobileMoreDrawer: React.ComponentType<{ open: boolean; onClose: () => void }>
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AuthGuard } = require('@/pages/_app') as { AuthGuard: (p: { children: ReactNode }) => React.ReactElement }

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    usuario = SUPER_ADMIN
})
function montar(no: React.ReactElement): HTMLElement {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    act(() => { root.render(no) })
    return host
}

const SECAO = 'atendimentos-ia'
/** Os destinos da seção, lidos do que o menu RENDERIZOU. */
const destinosDaSecao = (raiz: ParentNode) =>
    Array.from(raiz.querySelectorAll(`[data-section-key="${SECAO}"] a[href]`)).map((a) => a.getAttribute('href') as string)

describe('a seção Atendimentos I.A. — menu e guarda', () => {
    it('(a) o menu desktop do super admin traz a seção, com "Contas ligadas" e "Fornecedores e tabelas"', () => {
        caminhoAtual = ROUTES.SUPER_ADMIN_PANEL
        const host = montar(<Nav />)
        expect(destinosDaSecao(host)).toEqual([ROUTES.SUPER_ADMIN_IA_CONTAS, ROUTES.SUPER_ADMIN_IA_FORNECEDORES])
        const rotulos = Array.from(host.querySelectorAll('.nav-section-label')).map((e) => (e.textContent || '').trim())
        expect(rotulos).toContain('Atendimentos I.A.')
    })

    it('(b) o drawer mobile do super admin traz os mesmos itens, na mesma seção', () => {
        caminhoAtual = ROUTES.SUPER_ADMIN_PANEL
        montar(<MobileMoreDrawer open onClose={() => {}} />)
        const drawer = document.querySelector('.pc-mobile-more-drawer-content') as ParentNode
        expect(destinosDaSecao(drawer)).toEqual([ROUTES.SUPER_ADMIN_IA_CONTAS, ROUTES.SUPER_ADMIN_IA_FORNECEDORES])
    })

    it('(c) todo destino da seção mora sob /super-admin/ — desktop e drawer', () => {
        caminhoAtual = ROUTES.SUPER_ADMIN_PANEL
        const desktop = destinosDaSecao(montar(<Nav />))
        montar(<MobileMoreDrawer open onClose={() => {}} />)
        const drawer = destinosDaSecao(document.querySelector('.pc-mobile-more-drawer-content') as ParentNode)
        // O leitor alcança os dois menus: sem isto, duas listas vazias passariam o `every`.
        expect(desktop.length).toBeGreaterThan(0)
        expect(drawer.length).toBeGreaterThan(0)
        expect([...desktop, ...drawer].every((h) => h.startsWith('/super-admin/'))).toBe(true)
    })

    it.each([
        [ROUTES.SUPER_ADMIN_IA_FORNECEDORES],
        [`${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}/[id]`],
        [ROUTES.SUPER_ADMIN_IA_CONTAS],
        [`${ROUTES.SUPER_ADMIN_IA_CONTAS}/[tenantId]`],
        [`${ROUTES.SUPER_ADMIN_IA_TABELAS}/[id]/importacao`],
    ])('(d) o GUARDA deixa o super admin em %s — e o mesmo destino FORA de /super-admin/ seria recusado', (rota) => {
        caminhoAtual = rota
        replaces.length = 0
        const host = montar(<AuthGuard><div id="conteudo">conteúdo</div></AuthGuard>)
        expect(replaces).toEqual([])
        expect(host.querySelector('#conteudo')).not.toBeNull()

        // O contraste: o MESMO usuário, o mesmo caminho SEM o prefixo — o guarda o devolve ao painel.
        // Sem isto, um guarda que nunca redireciona passaria o caso acima; e é este o caso que
        // diz que o que deixa a rota abrir é o PREFIXO, não a rota em si.
        caminhoAtual = rota.replace('/super-admin', '')
        replaces.length = 0
        montar(<AuthGuard><div>conteúdo</div></AuthGuard>)
        expect(replaces).toEqual([ROUTES.SUPER_ADMIN_PANEL])
    })

    it('(e) um usuário de conta não vê a seção', () => {
        usuario = ADMIN_DE_CONTA as typeof SUPER_ADMIN
        caminhoAtual = '/'
        const host = montar(<Nav />)
        expect(host.querySelector(`[data-section-key="${SECAO}"]`)).toBeNull()
        expect(host.querySelector(`a[href="${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}"]`)).toBeNull()
        expect(host.querySelector(`a[href="${ROUTES.SUPER_ADMIN_IA_CONTAS}"]`)).toBeNull()
        // O contraste no MESMO menu: o usuário de conta vê os itens dele — sem isto, um menu que
        // não renderizasse nada passaria as negativas acima.
        expect(host.querySelectorAll('a[href]').length).toBeGreaterThan(0)
    })

    it('(e) o drawer mobile do usuário de conta também não traz as contas ligadas', () => {
        usuario = ADMIN_DE_CONTA as typeof SUPER_ADMIN
        caminhoAtual = '/'
        montar(<MobileMoreDrawer open onClose={() => {}} />)
        const drawer = document.querySelector('.pc-mobile-more-drawer-content') as ParentNode
        expect(drawer.querySelectorAll('a[href]').length).toBeGreaterThan(0)
        expect(drawer.querySelector(`a[href="${ROUTES.SUPER_ADMIN_IA_CONTAS}"]`)).toBeNull()
    })

    it('(f) os itens do super admin não entram em MODULES nem na tela de Permissões — o Orçamentista, sim', () => {
        expect(MODULOS_NAO_CONCEDIVEIS).not.toContain(MODULES.ORCAMENTISTA)
        expect(MODULOS_CONCEDIVEIS).toContain(MODULES.ORCAMENTISTA)
        expect(Object.values(MODULES).filter((m) => /atendimento|fornecedor|contas/i.test(String(m)))).toEqual([])
    })
})
