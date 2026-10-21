/**
 * PORTÃO — TODA SEÇÃO DO MENU COM TÍTULO RECOLHE. Nenhuma é exceção.
 *
 * Decisão do dono do produto, 20/10/2026, que DERRUBA a do bloco 2A (18/10/2026):
 *   "ele é um menu igual aos outros, então deve manter o mesmo padrão, ter a setinha, e
 *    apertando a setinha abre as opções".
 * Ele foi avisado da consequência — fora da própria rota, uma seção nasce fechada, e a de um
 * item só aparece como título com a setinha — e escolheu assim mesmo: consistência do menu acima
 * da economia de um clique.
 *
 * ESTE ARQUIVO ERA `clientes-nao-recolhe.test.ts`, e afirmava o CONTRÁRIO: que Clientes tinha
 * `collapsible: false` e nenhuma seta. Foi renomeado e reescrito, não apagado, para o histórico
 * da decisão seguir o arquivo.
 *
 * O PORTÃO É POR PROPRIEDADE, não por nome: ele não lista Clientes. Uma exceção nova, em
 * QUALQUER seção — a de hoje ou uma que ainda não existe —, deixa vermelho.
 *   (1) a CONFIGURAÇÃO: toda entrada de `sections` com título tem `collapsible: true`;
 *   (2) o EFEITO, no menu da CONTA: todo cabeçalho desenhado tem a seta;
 *   (3) o EFEITO, no menu do SUPER ADMIN: o mesmo — Atendimentos I.A. também deixou de ser
 *       exceção nesta decisão;
 *   (4) a seção Clientes abre e fecha, e o item continua indo para a MESMA rota de hoje.
 *
 * A ÚNICA ENTRADA SEM `collapsible` é `geral`, e ela NÃO é uma seção com cabeçalho: não tem
 * título, então o menu não desenha cabeçalho nem seta para ela. Recolhível, ela nasceria fechada
 * fora das próprias rotas e não haveria onde clicar para abri-la — os itens de cima sumiriam. Por
 * isso a propriedade é sobre seção COM TÍTULO, e um caso afirma que a sem título é só a `geral`.
 *
 * Não muda aqui: as seções NÃO lembram o estado entre páginas, hoje nem antes. É outra decisão,
 * não tomada (dono do produto, 20/10/2026).
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

let superAdmin = false
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/', query: {}, push: jest.fn(), asPath: '/' }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({
    useAuth: () => ({
        currentUser: superAdmin
            ? { id: 's', email: 's@x', name: 'S', role: 'super_admin', is_super_admin: true, calcType: 'INDUSTRIALIZACAO' }
            : { id: 'u', email: 'u@x', name: 'U', role: 'admin', is_super_admin: false, calcType: 'INDUSTRIALIZACAO' },
        isAdmin: !superAdmin, isSuperAdmin: superAdmin, isRepresentative: false, logout: jest.fn(), hasPermission: () => true,
    }),
}))
jest.mock('@/hooks/use-permissions.hook', () => {
    const real = jest.requireActual('@/hooks/use-permissions.hook')
    return { ...real, usePermissions: () => ({ canView: () => true, canEdit: () => true, isAdmin: !superAdmin, isSuperAdmin: superAdmin }) }
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

const montados: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montados.length) { const m = montados.pop()!; act(() => { m.root.unmount() }); m.host.remove() } superAdmin = false })
function montarMenu(): HTMLElement {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montados.push({ root, host })
    act(() => { root.render(React.createElement(navModulo.Nav)) })
    return host
}
const titulo = (s: Element) => (s.querySelector('.nav-section-label')?.textContent || '').trim()

describe('(1) a configuração: toda seção com título recolhe', () => {
    it('o leitor acha as nove seções — sem isto, um leitor cego devolveria [] e o `every` passaria', () => {
        // `atendimentos-ia` logo abaixo de `clientes` desde 21/10/2026: a seção do super admin
        // passou a ser também a do tenant, com o Orçamentista (dono do produto).
        expect(secoesDoNav().map((s) => s.key)).toEqual(['geral', 'cadastros', 'clientes', 'atendimentos-ia', 'comercial', 'financeiro', 'agendamentos', 'operacional', 'superadmin'])
    })

    it('NENHUMA seção com título tem `collapsible: false`', () => {
        const excecoes = secoesDoNav().filter((s) => s.label !== '' && !s.collapsible).map((s) => s.key)
        expect(excecoes).toEqual([])
    })

    it('a única entrada sem título é `geral` — o bloco solto do topo, que não tem cabeçalho', () => {
        expect(secoesDoNav().filter((s) => s.label === '').map((s) => s.key)).toEqual(['geral'])
    })
})

describe('(2) o efeito, no menu da CONTA', () => {
    it('todo cabeçalho desenhado tem a seta — e Clientes está entre eles', () => {
        const host = montarMenu()
        const secoes = Array.from(host.querySelectorAll('.nav-section')).filter((s) => s.querySelector('.nav-section-header'))
        expect(secoes.map(titulo)).toEqual(expect.arrayContaining(['Cadastros', 'Clientes', 'Comercial', 'Financeiro']))
        const semSeta = secoes.filter((s) => !s.querySelector('.nav-section-arrow')).map(titulo)
        expect(semSeta).toEqual([])
    })
})

describe('(3) o efeito, no menu do SUPER ADMIN', () => {
    it('todo cabeçalho desenhado tem a seta — Atendimentos I.A. também — e Clientes não aparece', () => {
        superAdmin = true
        const host = montarMenu()
        const secoes = Array.from(host.querySelectorAll('.nav-section')).filter((s) => s.querySelector('.nav-section-header'))
        expect(secoes.map(titulo)).toEqual(expect.arrayContaining(['Atendimentos I.A.', 'Super Admin']))
        expect(secoes.map(titulo)).not.toContain('Clientes')
        expect(secoes.filter((s) => !s.querySelector('.nav-section-arrow')).map(titulo)).toEqual([])
    })
})

describe('(4) a seção Clientes abre e fecha, e o item vai para a mesma rota', () => {
    it('fora da rota de Clientes ela nasce FECHADA; a seta abre, e abre de novo fecha', () => {
        const host = montarMenu()
        const secao = Array.from(host.querySelectorAll('.nav-section')).find((s) => titulo(s) === 'Clientes') as HTMLElement
        const itens = () => secao.querySelector('.nav-section-items')!.className
        const cabecalho = secao.querySelector('.nav-section-header') as HTMLButtonElement
        expect(itens()).toContain('collapsed')
        act(() => { cabecalho.click() })
        expect(itens()).toContain('expanded')
        act(() => { cabecalho.click() })
        expect(itens()).toContain('collapsed')
    })

    it('o item continua indo para a rota de Clientes', () => {
        const host = montarMenu()
        const secao = Array.from(host.querySelectorAll('.nav-section')).find((s) => titulo(s) === 'Clientes') as HTMLElement
        const links = Array.from(secao.querySelectorAll('.nav-section-items a')).map((a) => a.getAttribute('href'))
        expect(links).toEqual([ROUTES.CLIENTS])
    })
})
