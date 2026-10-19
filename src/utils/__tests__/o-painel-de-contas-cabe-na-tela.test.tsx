/**
 * PORTÃO — BLOCO 2A: a lista de contas do super admin passa de 10 colunas para 7.
 *
 * Colunas finais, nesta ordem: Conta | Situação | Vigência | Free | Atendimentos I.A. |
 * Aprovado | Ações. 'Status' e 'Ativo' viram 'Situação' (a-situacao-e-uma-coluna-so.test.tsx);
 * 'Trial até' e 'Plano até' viram 'Vigência'; 'Telefone' vai para a ficha da conta
 * (a-ficha-da-conta-mostra-o-telefone.test.tsx).
 *
 * As NEGATIVAS deste arquivo comparam com títulos que a tela de antes EXIBIA — a falha observada
 * antes da correção, registrada no relatório da rodada, é a prova de que cada literal é
 * alcançável (`assercao-negativa-que-nunca-falha.md`).
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { TITULO_DA_COLUNA_ORCAMENTISTA } from '@/page-parts/super-admin/orcamentista-na-lista.component'

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
    id: string; name: string; email: string; phone: string | null; plan_status: string; is_free: boolean
    trial_ends_at: string | null; plan_ends_at: string | null; approved_by_super_admin: boolean; created_at: string
}
const TRIAL_ATE = '2027-02-10T12:00:00Z'
const PLANO_ATE = '2027-05-20T12:00:00Z'
const TENANTS: LinhaDeTenant[] = [
    { id: 't-trial', name: 'Conta em Trial', email: 't@x', phone: '11987654321', plan_status: 'TRIAL', is_free: false, trial_ends_at: TRIAL_ATE, plan_ends_at: PLANO_ATE, approved_by_super_admin: true, created_at: '2026-01-01' },
    { id: 't-ativa', name: 'Conta Ativa', email: 'a@x', phone: null, plan_status: 'ACTIVE', is_free: false, trial_ends_at: TRIAL_ATE, plan_ends_at: PLANO_ATE, approved_by_super_admin: true, created_at: '2026-01-01' },
    { id: 't-sem-data', name: 'Conta Sem Data', email: 's@x', phone: null, plan_status: 'ACTIVE', is_free: false, trial_ends_at: null, plan_ends_at: null, approved_by_super_admin: true, created_at: '2026-01-01' },
]

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

async function montar() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    await act(async () => { root.render(<SuperAdminTenants />) })
    const titulos = Array.from(host.querySelectorAll('thead th')).map((t) => (t.textContent || '').trim()).filter((t) => t !== '')
    /** A célula de uma conta na coluna de índice `i`, pelo DOM da linha. */
    const celula = (id: string, i: number) =>
        (host.querySelectorAll(`tr[data-row-key="${id}"] > td`)[i] as HTMLElement | undefined)?.textContent?.trim() ?? null
    return { host, titulos, celula }
}

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

describe('a lista de contas cabe na tela: 7 colunas', () => {
    it('exatamente 7 colunas, nesta ordem', async () => {
        const t = await montar()
        expect(t.titulos).toHaveLength(7)
        expect(t.titulos).toEqual(['Conta', 'Situação', 'Vigência', 'Free', 'Atendimentos I.A.', 'Aprovado', 'Ações'])
    })

    it('Telefone, Ativo, Trial até e Plano até NÃO são colunas', async () => {
        const t = await montar()
        for (const fora of ['Telefone', 'Ativo', 'Trial até', 'Plano até']) expect(t.titulos).not.toContain(fora)
    })

    it('Situação, Vigência, Atendimentos I.A. e Ações SÃO colunas — e o título da coluna vem da constante', async () => {
        const t = await montar()
        for (const dentro of ['Situação', 'Vigência', 'Atendimentos I.A.', 'Ações']) expect(t.titulos).toContain(dentro)
        expect(TITULO_DA_COLUNA_ORCAMENTISTA).toBe('Atendimentos I.A.')
    })

    // MUTAÇÃO: ler sempre `plan_ends_at`, ou sempre `trial_ends_at`. As duas contas têm as DUAS
    // datas, e diferentes — o caso só passa se a escolha for pelo `plan_status`.
    it('Vigência: TRIAL mostra "Trial até", o resto mostra "Plano até"; sem data, travessão', async () => {
        const t = await montar()
        const iVig = t.titulos.indexOf('Vigência')
        expect(t.celula('t-trial', iVig)).toBe(`Trial até ${data(TRIAL_ATE)}`)
        expect(t.celula('t-ativa', iVig)).toBe(`Plano até ${data(PLANO_ATE)}`)
        expect(t.celula('t-sem-data', iVig)).toBe('—')
    })
})
