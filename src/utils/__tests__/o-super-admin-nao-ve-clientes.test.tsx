/**
 * PORTÃO — O SUPER ADMIN NÃO VÊ CLIENTES (decisão do dono do produto, 19/10/2026).
 *
 * O defeito: o menu do super admin oferecia o item Clientes, e o `AuthGuard` (`_app.tsx`) manda
 * o super admin de volta para `ROUTES.SUPER_ADMIN_PANEL` em qualquer rota fora de
 * `/super-admin/*` e `/minha-conta`. O clique ia e voltava no mesmo instante — sem erro, sem
 * tela em branco, sem rastro (`docs/registros/o-menu-oferecia-o-que-o-guarda-proibia.md`).
 *
 * O MENU e o GUARDA são duas listas de quem pode ir aonde, e nada afirmava que as duas
 * concordavam. Este portão afirma AS DUAS PONTAS, no mesmo arquivo, porque foi a divergência
 * entre elas que fez o defeito:
 *   (a) o menu do super admin NÃO traz o item Clientes — este caso falhava antes da correção;
 *   (b) o guarda, com o super admin em /clientes, chama `router.replace(SUPER_ADMIN_PANEL)` —
 *       este caso já passava: ele documenta o guarda que existe, e é o que fica vermelho se
 *       alguém liberar a rota sem rever o menu, ou o contrário.
 *
 * As DUAS pontas usam o MESMO usuário super admin e a mesma rota (`ROUTES.CLIENTS`): o que se
 * compara é o que cada lado decide para a mesma pessoa no mesmo destino.
 */

import React, { type ReactNode } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'

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

/** O super admin como o `auth.context` o monta: sem tenant, `is_super_admin` verdadeiro. */
const SUPER_ADMIN = {
    id: 'u-super', email: 's@x', name: 'Super', role: 'super_admin', is_super_admin: true,
    permissions: [] as string[], modulePermissions: {}, onboardingCompleted: true,
    planStatus: 'ACTIVE', isActive: true, isFree: false, calcType: 'INDUSTRIALIZACAO',
}
jest.mock('@/hooks/use-auth.hook', () => ({
    useAuth: () => ({ currentUser: SUPER_ADMIN, loading: false, logout: () => {} }),
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

// `usePermissions` é o REAL: é ele que diz `isSuperAdmin` e `canView` ao menu, e um mock aqui
// afirmaria o que o mock decide, não o que o produto decide.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Nav } = require('@/components/layout/nav.component') as { Nav: React.ComponentType }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MobileMoreDrawer } = require('@/components/layout/mobile-more-drawer.component') as {
    MobileMoreDrawer: React.ComponentType<{ open: boolean; onClose: () => void }>
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthGuard } = require('@/pages/_app') as { AuthGuard: (p: { children: ReactNode }) => React.ReactElement }

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
})
function montar(no: React.ReactElement): HTMLElement {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    act(() => { root.render(no) })
    return host
}

describe('o super admin não vê Clientes — as duas pontas', () => {
    it('(a) o MENU do super admin não traz o item Clientes', () => {
        caminhoAtual = ROUTES.SUPER_ADMIN_PANEL
        const host = montar(<Nav />)
        // O leitor enxerga o menu do super admin: sem isto, um menu vazio passaria o caso.
        expect(host.querySelector(`a[href="${ROUTES.SUPER_ADMIN_TENANTS}"]`)).not.toBeNull()
        expect(host.querySelector(`a[href="${ROUTES.CLIENTS}"]`)).toBeNull()
        const rotulos = Array.from(host.querySelectorAll('.nav-section-label')).map((e) => (e.textContent || '').trim())
        expect(rotulos).not.toContain('Clientes')
    })

    it('(b) o GUARDA devolve o super admin de /clientes para o painel', () => {
        caminhoAtual = ROUTES.CLIENTS
        replaces.length = 0
        montar(<AuthGuard><div>conteúdo</div></AuthGuard>)
        expect(replaces).toEqual([ROUTES.SUPER_ADMIN_PANEL])
    })
})

/**
 * O MOBILE — 19/10/2026. O drawer ("Mais") filtrava o super admin item a item, sem a lista de
 * seções do desktop, e `canView` devolve `true` para todo módulo quando o usuário é super admin.
 * Resultado medido: 18 itens de tenant oferecidos, Clientes entre eles, e todos caindo no mesmo
 * `router.replace` do guarda. Desde esta data os dois menus leem a MESMA constante
 * (`SECOES_ESCONDIDAS_DO_SUPER_ADMIN`), e cada item do drawer declara a `sectionKey` do desktop.
 */
describe('o mobile segue a mesma regra do desktop', () => {
    /** As chaves de seção que um menu renderizou, pelo `data-section-key` de cada grupo. */
    const chavesNoDom = (raiz: ParentNode) =>
        Array.from(raiz.querySelectorAll('[data-section-key]')).map((e) => e.getAttribute('data-section-key') as string).sort()

    it('(c) o DRAWER mobile do super admin não traz o item Clientes', () => {
        caminhoAtual = ROUTES.SUPER_ADMIN_PANEL
        montar(<MobileMoreDrawer open onClose={() => {}} />)
        // O drawer do antd renderiza num portal, fora do `host`: a busca é no `document`.
        expect(document.querySelector(`.pc-mobile-more-drawer-content a[href="${ROUTES.SUPER_ADMIN_TENANTS}"]`)).not.toBeNull()
        expect(document.querySelector(`.pc-mobile-more-drawer-content a[href="${ROUTES.CLIENTS}"]`)).toBeNull()
    })

    // O CASO QUE IMPEDE A DIVERGÊNCIA DE VOLTAR: as seções que cada menu MOSTRA ao super admin,
    // lidas do que cada um renderizou. `conta` só existe no drawer — no desktop, Minha Conta,
    // Configurações, Planos, Suporte e Sair moram no rodapé, não numa seção.
    it('(d) o desktop e o drawer mostram ao super admin as MESMAS seções', () => {
        caminhoAtual = ROUTES.SUPER_ADMIN_PANEL
        const desktop = chavesNoDom(montar(<Nav />))
        montar(<MobileMoreDrawer open onClose={() => {}} />)
        const drawer = chavesNoDom(document.querySelector('.pc-mobile-more-drawer-content') as ParentNode).filter((k) => k !== 'conta')
        // O leitor alcança os dois menus: sem isto, dois conjuntos vazios seriam iguais.
        expect(desktop).toContain('superadmin')
        expect(drawer).toEqual(desktop)
    })
})

