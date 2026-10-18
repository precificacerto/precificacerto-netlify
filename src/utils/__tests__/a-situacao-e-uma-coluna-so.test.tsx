/**
 * PORTÃO — BLOCO 2A: 'Status' e 'Ativo' eram a mesma informação em duas colunas
 * (`docs/registros/a-situacao-e-o-ativo-eram-a-mesma-coluna.md`). Viram 'Situação': o Switch
 * de antes, seguido da Tag de `planStatusLabels`, NA MESMA CÉLULA.
 *
 * O comportamento do Switch NÃO muda: ligado para ACTIVE e TRIAL, desligado para o resto; ligar
 * grava ACTIVE e desligar grava SUSPENDED. CANCELLED aparece desligado com a Tag 'Cancelado'.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query), media: query, onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

interface LinhaDeTenant {
    id: string; name: string; email: string; plan_status: string; is_free: boolean
    trial_ends_at: string | null; plan_ends_at: string | null; approved_by_super_admin: boolean; created_at: string
}
const linha = (id: string, plan_status: string): LinhaDeTenant => ({
    id, name: `Conta ${id}`, email: `${id}@x`, plan_status, is_free: false,
    trial_ends_at: null, plan_ends_at: null, approved_by_super_admin: true, created_at: '2026-01-01',
})
let TENANTS: LinhaDeTenant[] = []

jest.mock('next/router', () => ({ useRouter: () => ({ replace: () => Promise.resolve(true), push: () => Promise.resolve(true), query: {} }) }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { is_super_admin: true } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
interface RespostaDoFetch { data: unknown; isLoading: boolean; error: Error | undefined; mutate: () => Promise<undefined> }
jest.mock('@/hooks/use-cached-fetch.hook', () => ({
    useCachedFetch: (chave: string | null): RespostaDoFetch => ({
        data: chave === '/api/super-admin/tenants' ? TENANTS : chave === '/api/super-admin/orcamentista' ? [] : undefined,
        isLoading: false, error: undefined, mutate: async (): Promise<undefined> => undefined,
    }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SuperAdminTenants = require('@/pages/super-admin/tenants/index').default as React.ComponentType

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
})

const patches: { url: string; corpo: unknown }[] = []
async function montar(linhas: LinhaDeTenant[]) {
    TENANTS = linhas
    patches.length = 0
    ;(global as any).fetch = async (url: string, init: { method: string; body: string }) => {
        patches.push({ url, corpo: JSON.parse(init.body) })
        return { ok: true, status: 200, json: async () => ({}) }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    await act(async () => { root.render(<SuperAdminTenants />) })
    /** A célula da coluna Situação, ACHADA PELO SWITCH: é a célula que o contém. */
    const celulaDoSwitch = (id: string) => {
        const sw = host.querySelector(`tr[data-row-key="${id}"] td button[role="switch"]`)
        return sw ? (sw.closest('td') as HTMLElement) : null
    }
    return { host, celulaDoSwitch }
}

describe('a Situação é uma coluna só', () => {
    // O CASO DO PEDIDO. Antes, o Switch estava na coluna 'Ativo' e a Tag na coluna 'Status':
    // duas células, e a Tag não está na célula do Switch.
    it('SUSPENDED: a MESMA célula traz o Switch desligado e a Tag "Suspenso"', async () => {
        const t = await montar([linha('s', 'SUSPENDED')])
        const td = t.celulaDoSwitch('s')!
        expect(td.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('false')
        expect(td.querySelector('.ant-tag')?.textContent).toBe('Suspenso')
    })

    it('CANCELLED: desligado, com a Tag "Cancelado" — e nenhum controle novo para cancelar', async () => {
        const t = await montar([linha('c', 'CANCELLED')])
        const td = t.celulaDoSwitch('c')!
        expect(td.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('false')
        expect(td.querySelector('.ant-tag')?.textContent).toBe('Cancelado')
        expect(td.querySelectorAll('button')).toHaveLength(1)
    })

    it('o Switch não muda: ligado em ACTIVE e TRIAL; desligar grava SUSPENDED, ligar grava ACTIVE', async () => {
        const t = await montar([linha('a', 'ACTIVE'), linha('t', 'TRIAL'), linha('s', 'SUSPENDED')])
        expect(t.celulaDoSwitch('a')!.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
        expect(t.celulaDoSwitch('t')!.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
        await act(async () => { t.celulaDoSwitch('a')!.querySelector('button[role="switch"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        await act(async () => { t.celulaDoSwitch('s')!.querySelector('button[role="switch"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        expect(patches).toEqual([
            { url: '/api/super-admin/tenants/a', corpo: { plan_status: 'SUSPENDED' } },
            { url: '/api/super-admin/tenants/s', corpo: { plan_status: 'ACTIVE' } },
        ])
    })
})
