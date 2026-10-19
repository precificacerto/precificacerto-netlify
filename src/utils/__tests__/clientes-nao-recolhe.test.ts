/**
 * PORTÃO — BLOCO 2A: a seção Clientes do menu deixa de ser recolhível.
 *
 * A seção tem UM item só e nascia fechada (`initialExpanded` = `sectionHasActiveItem`): fora da
 * própria rota, aparecia como um título sem nada embaixo. Dois casos, e os dois são o portão:
 *   1. a CONFIGURAÇÃO — `collapsible === false` para `clientes` no array `sections` do menu,
 *      lido do arquivo pelo mesmo método de `clientes-vira-secao-propria.test.ts` (o array é
 *      local ao componente);
 *   2. o EFEITO — fora da rota de Clientes, o item aparece, e o cabeçalho não tem seta.
 * O 1 sozinho afirmaria o caminho; o 2 é o que o usuário vê (`teste-que-nao-exercita.md`).
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import fs from 'fs'
import path from 'path'

import { ROUTES } from '@/constants/routes'

const NAV = path.resolve(__dirname, '../../components/layout/nav.component.tsx')

/** As entradas de `const sections: SectionConfig[] = [ ... ]`, como objetos. */
function secoesDoNav(): { key: string; label: string; collapsible: boolean }[] {
    const texto = fs.readFileSync(NAV, 'utf8')
    const ini = texto.indexOf('const sections: SectionConfig[] = [')
    const corpo = texto.slice(ini, texto.indexOf('\n  ]', ini))
    return Array.from(corpo.matchAll(/\{ key: '([^']*)', label: '([^']*)', collapsible: (true|false) \}/g))
        .map(([, key, label, c]) => ({ key, label, collapsible: c === 'true' }))
}

jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/', query: {}, push: jest.fn(), asPath: '/' }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({
    useAuth: () => ({
        currentUser: { id: 'u', email: 'u@x', name: 'U', role: 'admin', is_super_admin: false, calcType: 'INDUSTRIALIZACAO' },
        isAdmin: true, isSuperAdmin: false, isRepresentative: false, logout: jest.fn(), hasPermission: () => true,
    }),
}))
jest.mock('@/hooks/use-permissions.hook', () => {
    const real = jest.requireActual('@/hooks/use-permissions.hook')
    return { ...real, usePermissions: () => ({ canView: () => true, canEdit: () => true, isAdmin: true, isSuperAdmin: false }) }
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))
jest.mock('@/supabase/client', () => {
    const vazio: { data: unknown[]; error: unknown } = { data: [], error: null }
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'range', 'filter', 'gte', 'lte', 'ilike', 'or', 'not']) chain[m] = () => chain
    chain.single = () => Promise.resolve(vazio)
    chain.maybeSingle = () => Promise.resolve(vazio)
    chain.then = (fn: (v: unknown) => unknown) => Promise.resolve(vazio).then(fn)
    return { supabase: { from: () => chain, auth: { getUser: () => Promise.resolve(vazio) } } }
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const navModulo = require('@/components/layout/nav.component') as { Nav: React.ComponentType }

describe('a seção Clientes não recolhe', () => {
    it('a configuração: `clientes` tem collapsible === false', () => {
        const secoes = secoesDoNav()
        // O leitor acha as 9 seções (Atendimentos I.A. entrou no bloco 2B.2) — sem isto, um leitor cego devolveria [] e o `find` abaixo
        // falharia por AUSÊNCIA, não pela configuração.
        expect(secoes.map((s) => s.key)).toEqual(['geral', 'cadastros', 'clientes', 'comercial', 'financeiro', 'agendamentos', 'operacional', 'atendimentos-ia', 'superadmin'])
        expect(secoes.find((s) => s.key === 'clientes')!.collapsible).toBe(false)
    })

    // O EFEITO. A rota do teste é '/', que NÃO é a de Clientes: é exatamente o caso em que a
    // seção nascia fechada, com o título e nada embaixo.
    it('fora da rota de Clientes, o item aparece e o cabeçalho não tem seta', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const root = createRoot(host)
        act(() => { root.render(React.createElement(navModulo.Nav)) })
        const secao = Array.from(host.querySelectorAll('.nav-section'))
            .find((s) => (s.querySelector('.nav-section-label')?.textContent || '').trim() === 'Clientes') as HTMLElement
        const itens = secao.querySelector('.nav-section-items')!
        expect(itens.className).toContain('expanded')
        expect(itens.querySelector(`a[href="${ROUTES.CLIENTS}"]`)).not.toBeNull()
        expect(secao.querySelector('.nav-section-arrow')).toBeNull()
        act(() => { root.unmount() })
        host.remove()
    })
})
