/**
 * PORTÃO — BLOCO 2A: o telefone sai da lista de contas e entra na ficha da conta
 * (`super-admin/tenants/[id].tsx`, card "Dados da tenant"), formatado por `maskPhoneBR`.
 *
 * O dado vem de `tenants.phone`, que a rota `/api/super-admin/tenants` devolve por `select('*')`.
 * Medido em 18/10/2026: 27 contas, 8 com `phone` não nulo, 1 delas com texto vazio. O vazio é
 * tratado como ausente: travessão, não uma máscara de nada.
 *
 * O esperado é o PRODUTO de `maskPhoneBR`, não um literal transcrito
 * (`assercao-negativa-que-nunca-falha.md`).
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { maskPhoneBR } from '@/utils/contact-validation'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query), media: query, onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

interface Detalhe {
    id: string; name: string; email: string | null; phone: string | null; plan_status: string; is_free: boolean
    trial_ends_at: string | null; plan_ends_at: string | null; approved_by_super_admin: boolean
}
const conta = (id: string, phone: string | null): Detalhe => ({
    id, name: `Conta ${id}`, email: `${id}@x`, phone, plan_status: 'ACTIVE', is_free: false,
    trial_ends_at: null, plan_ends_at: null, approved_by_super_admin: true,
})
const TENANTS: Detalhe[] = [conta('com', '11987654321'), conta('nulo', null), conta('vazio', '')]
let idDaRota = 'com'

jest.mock('next/router', () => ({ useRouter: () => ({ replace: () => Promise.resolve(true), push: () => Promise.resolve(true), get query() { return { id: idDaRota } } }) }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { is_super_admin: true } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
interface RespostaDoFetch { data: unknown; isLoading: boolean; error: Error | undefined; mutate: () => Promise<undefined> }
jest.mock('@/hooks/use-cached-fetch.hook', () => ({
    useCachedFetch: (chave: string | null): RespostaDoFetch => ({
        data: chave === '/api/super-admin/tenants' ? TENANTS : chave ? [] : undefined,
        isLoading: false, error: undefined, mutate: async (): Promise<undefined> => undefined,
    }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FichaDaConta = require('@/pages/super-admin/tenants/[id]').default as React.ComponentType

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
})

/** A linha "Telefone:" do card, pelo rótulo em negrito. `null` se não existir. */
async function linhaDoTelefone(id: string): Promise<string | null> {
    idDaRota = id
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    await act(async () => { root.render(<FichaDaConta />) })
    const rotulo = Array.from(host.querySelectorAll('p > strong')).find((s) => (s.textContent || '').trim() === 'Telefone:')
    return rotulo ? (rotulo.parentElement!.textContent || '').replace('Telefone:', '').trim() : null
}

describe('a ficha da conta mostra o telefone', () => {
    it('com telefone: a linha existe e mostra o número pela máscara', async () => {
        expect(await linhaDoTelefone('com')).toBe(maskPhoneBR('11987654321'))
    })

    it('sem telefone (nulo e vazio): a linha existe e mostra travessão', async () => {
        expect(await linhaDoTelefone('nulo')).toBe('—')
        expect(await linhaDoTelefone('vazio')).toBe('—')
    })
})
