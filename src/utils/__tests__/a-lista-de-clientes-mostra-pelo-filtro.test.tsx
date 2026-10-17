/**
 * PORTÃO — a lista de Clientes só RENDERIZA VENCIDO, A VENCER, SEGMENTO e RESPONSÁVEL com o
 * filtro correspondente ligado. Pedido do dono do produto, 17/10/2026: otimização, e a tela
 * vai ao celular. Regra em `src/utils/colunas-da-lista-de-clientes.ts`.
 *
 * A PÁGINA INTEIRA É MONTADA, nos DOIS ramos: o desktop usa `<Table>` com `columns`, o mobile
 * monta o cartão à mão. Tirar do array `columns` não diz nada sobre o cartão, e é por isso que
 * cada caso de ausência roda nos dois.
 *
 * "NÃO ESTÁ NO DOM" é medido pelo que existe, não pelo que se vê: `querySelectorAll('thead th')`
 * acha uma coluna escondida por CSS. Uma coluna com `display: none` deixa este portão vermelho.
 *
 * Os títulos e valores das negativas vêm das constantes exportadas e de `formatBRL` — nunca de
 * literal (`assercao-negativa-que-nunca-falha.md`). As datas da fixture são de 2020 e de 2099:
 * a página lê o relógio real, e as duas pontas não mudam de lado com o dia em que a suíte roda.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { formatBRL } from '@/utils/formatters'
import { FILTROS_DE_COBRANCA_VAZIOS, escreverFiltrosNaQuery, type FiltrosDeCobranca } from '@/utils/filtros-de-cobranca'
import { TITULO_A_VENCER, TITULO_VENCIDO } from '@/page-parts/shared/colunas-de-cobranca.component'
import { TITULO_RESPONSAVEL, TITULO_SEGMENTO } from '@/utils/colunas-da-lista-de-clientes'
import { montarParcelasDoCliente, type LinhaDeParcela, type VendaParaResolucao } from '@/utils/parcelas-do-cliente'
import { hojeNoFusoDoNegocio } from '@/utils/dia-de-hoje'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query),
        media: query,
        onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

// ── O estado que cada caso monta ─────────────────────────────────────────────────────────
let routerPronto = true
let routerQuery: Record<string, string | string[] | undefined> = {}
const replaces: Array<{ url: any }> = []
let modoMobile = false
/** Toda tabela que a página abre pelo cliente do browser. `employees` não pode estar aqui. */
const tabelasConsultadas: string[] = []

jest.mock('next/router', () => ({
    useRouter: () => ({
        isReady: routerPronto,
        pathname: '/clientes',
        query: routerQuery,
        push: () => Promise.resolve(true),
        replace: (url: any) => { replaces.push({ url }); return Promise.resolve(true) },
    }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({
    useAuth: () => ({ currentUser: { uid: 'u1', role: 'admin', employee_id: 'e1' }, tenantId: 't1', loading: false }),
}))
jest.mock('@/hooks/use-permissions.hook', () => {
    const real = jest.requireActual('@/hooks/use-permissions.hook')
    return { ...real, usePermissions: () => ({ canView: () => true, canEdit: () => true, isAdmin: true, isSuperAdmin: false }) }
})
jest.mock('@/contexts/device.context', () => ({
    useDevice: () => ({ isMobile: modoMobile, isTablet: false, isDesktop: !modoMobile, isCompact: modoMobile, device: modoMobile ? 'mobile' : 'desktop' }),
}))
jest.mock('@/components/layout/layout.component', () => ({
    Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
jest.mock('@/supabase/client', () => ({
    supabase: {
        from: (tabela: string) => {
            tabelasConsultadas.push(tabela)
            const q: any = {
                select: () => q, eq: () => q,
                order: () => Promise.resolve({ data: [{ id: 'e1', name: 'Fulano Responsável Da Silva' }], error: null }),
            }
            return q
        },
    },
}))

// ── A fixture: um em atraso velho e barato, um em atraso novo e caro, um só a vencer ──────
const VENDAS: VendaParaResolucao[] = [
    { id: 'v-velho', customer_id: 'c-velho' },
    { id: 'v-novo', customer_id: 'c-novo' },
    { id: 'v-futuro', customer_id: 'c-futuro' },
]
const parcela = (p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela => ({
    amount: 0, due_date: null, paid_date: null, is_active: true, origin_type: 'SALE', origin_id: null, contact_id: null, ...p,
})
const PARCELAS: LinhaDeParcela[] = [
    // MAIOR atraso com MENOR valor: a ordem por atraso e a ordem por valor discordam.
    parcela({ id: 'p1', origin_id: 'v-velho', due_date: '2020-01-10', amount: 111.11 }),
    parcela({ id: 'p2', origin_id: 'v-novo', due_date: '2020-06-10', amount: 22222.22 }),
    parcela({ id: 'p3', origin_id: 'v-futuro', due_date: '2099-01-10', amount: 3333.33 }),
]
const SEGMENTO_DA_FIXTURE = 'Tecnologia'
const NOME_DO_RESPONSAVEL = 'Fulano Responsável Da Silva'
const cliente = (id: string, name: string) => ({
    id, name, customer_type: 'PJ', status: 'ACTIVE', segment: SEGMENTO_DA_FIXTURE, owner_id: 'e1',
    city: 'Cidade', state_code: 'SP', document: null as string | null, whatsapp_phone: null as string | null, phone: null as string | null, email: null as string | null,
})
// Em ordem ALFABÉTICA contrária à do atraso: "Aaa" é o de atraso menor.
const CLIENTES = [cliente('c-novo', 'Aaa Novo'), cliente('c-velho', 'Bbb Velho'), cliente('c-futuro', 'Ccc Futuro')]

jest.mock('@/hooks/use-data.hooks', () => ({
    useCustomers: () => ({ data: CLIENTES, isLoading: false, mutate: () => Promise.resolve() }),
    useParcelasDeReceber: () => ({ data: { parcelas: PARCELAS, vendas: VENDAS }, mutate: () => Promise.resolve() }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Clients = require('@/pages/clientes/index').default as React.ComponentType

// ── Montagem ──────────────────────────────────────────────────────────────────────────
const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) {
        const m = montadas.pop()!
        act(() => { m.root.unmount() })
        m.host.remove()
    }
    document.body.innerHTML = ''
})
beforeEach(() => {
    routerPronto = true
    routerQuery = {}
    replaces.length = 0
    modoMobile = false
    tabelasConsultadas.length = 0
})

function comFiltros(parcial: Partial<FiltrosDeCobranca>) {
    routerQuery = escreverFiltrosNaQuery({ ...FILTROS_DE_COBRANCA_VAZIOS, ...parcial })
}

async function montar() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    await act(async () => { root.render(<Clients />) })
    return {
        host,
        root,
        /** Os títulos das colunas — o que EXISTE no `thead`, escondido ou não. */
        titulos: () => Array.from(host.querySelectorAll('thead th')).map((t) => (t.textContent || '').trim()),
        /** O texto da LISTA: corpo da tabela, ou a lista de cartões no mobile. */
        lista: () => (host.querySelector('.ant-table-tbody') ?? host.querySelector('.clientes-mobile-list'))?.textContent ?? '',
        cartoes: () => Array.from(host.querySelectorAll('.clientes-mobile-list .pc-row-compact')),
        /** O texto do cartão de UM cliente, achado pelo nome. */
        cartao: (nome: string) => Array.from(host.querySelectorAll('.clientes-mobile-list .pc-row-compact'))
            .find((c) => c.querySelector('.pc-row-compact__title')?.textContent === nome)?.textContent ?? '',
        nomesNaOrdem: () => modoMobile
            ? Array.from(host.querySelectorAll('.pc-row-compact__title')).map((n) => n.textContent)
            : Array.from(host.querySelectorAll('.ant-table-tbody tr[data-row-key]')).map((r) => r.querySelector('a')?.textContent ?? null),
    }
}

/** O que cada uma das quatro deixaria na lista se fosse renderizada. */
const RASTROS = {
    vencido: [formatBRL(111.11), formatBRL(22222.22)],
    aVencer: [formatBRL(3333.33)],
    segmento: [SEGMENTO_DA_FIXTURE],
    responsavel: [NOME_DO_RESPONSAVEL],
}
const TITULOS = { vencido: TITULO_VENCIDO, aVencer: TITULO_A_VENCER, segmento: TITULO_SEGMENTO, responsavel: TITULO_RESPONSAVEL }

// ════════════════════════════════════════════════════════════════════════════════════════
describe('o instrumento enxerga o que procura', () => {
    // Sem isto, um seletor que não casa nada deixaria toda negativa verde por construção.
    it('desktop: há `thead th` e linhas; mobile: há cartões', async () => {
        const d = await montar()
        expect(d.titulos().length).toBeGreaterThan(3)
        expect(d.nomesNaOrdem()).toHaveLength(3)
        modoMobile = true
        const m = await montar()
        expect(m.cartoes()).toHaveLength(3)
    })

    it('com os quatro rastros, o texto da lista desktop OS CONTÉM quando a coluna existe', async () => {
        comFiltros({ emAtraso: true, aVencer: true, segmento: [SEGMENTO_DA_FIXTURE] })
        const t = await montar()
        for (const r of [...RASTROS.vencido, ...RASTROS.aVencer, ...RASTROS.segmento]) expect(t.lista()).toContain(r)
    })
})

describe('PORTÃO 1 — sem nenhum filtro, as QUATRO não estão no DOM, nos DOIS ramos', () => {
    // MUTAÇÕES: renderizar sempre · esconder por CSS · mexer só no desktop.
    it('desktop: nenhum dos quatro títulos no `thead`, nenhum dos quatro valores no corpo', async () => {
        const t = await montar()
        for (const titulo of Object.values(TITULOS)) expect(t.titulos()).not.toContain(titulo)
        for (const r of Object.values(RASTROS).flat()) expect(t.lista()).not.toContain(r)
    })

    it('mobile: nenhum dos quatro valores em cartão nenhum', async () => {
        modoMobile = true
        const t = await montar()
        expect(t.cartoes()).toHaveLength(3)
        expect(t.host.querySelector('[data-testid="cobranca-no-cartao"]')).toBeNull()
        for (const r of Object.values(RASTROS).flat()) expect(t.lista()).not.toContain(r)
        for (const titulo of Object.values(TITULOS)) expect(t.lista()).not.toContain(titulo)
    })
})

describe('PORTÃO 2 — EM ATRASO ligado: VENCIDO aparece, A VENCER continua fora — e o espelho', () => {
    it('EM ATRASO: VENCIDO no `thead`, A VENCER não', async () => {
        comFiltros({ emAtraso: true })
        const t = await montar()
        expect(t.titulos()).toContain(TITULO_VENCIDO)
        expect(t.titulos()).not.toContain(TITULO_A_VENCER)
        expect(t.titulos()).not.toContain(TITULO_SEGMENTO)
        expect(t.titulos()).not.toContain(TITULO_RESPONSAVEL)
    })

    it('o espelho, A VENCER: A VENCER no `thead`, VENCIDO não', async () => {
        comFiltros({ aVencer: true })
        const t = await montar()
        expect(t.titulos()).toContain(TITULO_A_VENCER)
        expect(t.titulos()).not.toContain(TITULO_VENCIDO)
    })

    it('SEGMENTO ligado: SEGMENTO aparece, as de cobrança não', async () => {
        comFiltros({ segmento: [SEGMENTO_DA_FIXTURE] })
        const t = await montar()
        expect(t.titulos()).toContain(TITULO_SEGMENTO)
        expect(t.titulos()).not.toContain(TITULO_VENCIDO)
        expect(t.titulos()).not.toContain(TITULO_A_VENCER)
    })

    it('RESPONSÁVEL não tem filtro: com TODOS os filtros que existem ligados, ela segue fora', async () => {
        comFiltros({ emAtraso: true, aVencer: true, segmento: [SEGMENTO_DA_FIXTURE], situacao: ['ACTIVE'] })
        const t = await montar()
        expect(t.titulos()).not.toContain(TITULO_RESPONSAVEL)
        expect(t.lista()).not.toContain(NOME_DO_RESPONSAVEL)
    })
})

describe('PORTÃO 3 — os dois ligados: as duas aparecem', () => {
    it('EM ATRASO + A VENCER: VENCIDO e A VENCER no `thead`, com os valores no corpo', async () => {
        comFiltros({ emAtraso: true, aVencer: true })
        const t = await montar()
        expect(t.titulos()).toEqual(expect.arrayContaining([TITULO_VENCIDO, TITULO_A_VENCER]))
        for (const r of [...RASTROS.vencido, ...RASTROS.aVencer]) expect(t.lista()).toContain(r)
    })
})

describe('PORTÃO 4 — a coluna é DERIVADA DA URL: link colado abre com as mesmas colunas', () => {
    it('URL com `atraso` → VENCIDO já na montagem, sem ninguém clicar', async () => {
        comFiltros({ emAtraso: true })
        const t = await montar()
        expect(t.titulos()).toContain(TITULO_VENCIDO)
        // e a montagem não reescreveu a URL — o filtro veio dela, não foi para ela
        expect(replaces).toEqual([])
    })

    // A guarda de `router.isReady` (caso 10 de `os-filtros-de-cobranca.test.tsx`): antes de
    // pronto a query não é lida. Aqui se afirma o EFEITO dela na coluna.
    it('com `isReady` falso a coluna NÃO aparece; quando fica pronto, aparece', async () => {
        comFiltros({ emAtraso: true })
        routerPronto = false
        const t = await montar()
        expect(t.titulos()).not.toContain(TITULO_VENCIDO)
        routerPronto = true
        await act(async () => { t.root.render(<Clients />) })
        expect(t.titulos()).toContain(TITULO_VENCIDO)
    })
})

describe('PORTÃO 5 — a ordem por MAIOR ATRASO (VII.3) depende do dado, não da coluna', () => {
    it('desktop: EM ATRASO ligado ordena o mais atrasado primeiro, contra a ordem alfabética', async () => {
        comFiltros({ emAtraso: true })
        const t = await montar()
        expect(t.nomesNaOrdem()).toEqual(['Bbb Velho', 'Aaa Novo'])
    })

    it('mobile — sem coluna nenhuma — a mesma ordem', async () => {
        comFiltros({ emAtraso: true })
        modoMobile = true
        const t = await montar()
        expect(t.nomesNaOrdem()).toEqual(['Bbb Velho', 'Aaa Novo'])
    })

    it('o par: sem filtro, a ordem é a alfabética — o caso acima discrimina', async () => {
        const t = await montar()
        expect(t.nomesNaOrdem()).toEqual(['Aaa Novo', 'Bbb Velho', 'Ccc Futuro'])
    })
})

describe('o filtro de SEGMENTO mora no CABEÇALHO da lista, nos dois ramos', () => {
    for (const mobile of [false, true]) {
        it(`${mobile ? 'mobile' : 'desktop'}: o seletor existe sem a coluna, e ligá-lo escreve a URL e traz a coluna`, async () => {
            modoMobile = mobile
            const t = await montar()
            const seletor = t.host.querySelector('[data-testid="filtro-de-segmento"]')
            expect(seletor).not.toBeNull()
            const alvo = (seletor!.querySelector('.ant-select-selector') ?? seletor!) as HTMLElement
            await act(async () => { alvo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
            const opcao = Array.from(document.body.querySelectorAll('.ant-select-item-option'))
                .find((o) => (o.textContent || '').trim() === SEGMENTO_DA_FIXTURE)
            expect(opcao).toBeDefined()
            await act(async () => { opcao!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
            const ultima = replaces[replaces.length - 1]?.url
            expect(ultima?.query).toEqual(escreverFiltrosNaQuery({ ...FILTROS_DE_COBRANCA_VAZIOS, segmento: [SEGMENTO_DA_FIXTURE] }))
            if (!mobile) expect(t.titulos()).toContain(TITULO_SEGMENTO)
        })
    }

    it('a coluna SEGMENTO, quando aparece, NÃO tem filtro próprio — o filtro é um só', async () => {
        comFiltros({ segmento: [SEGMENTO_DA_FIXTURE] })
        const t = await montar()
        const th = Array.from(t.host.querySelectorAll('thead th')).find((x) => (x.textContent || '').trim() === TITULO_SEGMENTO)
        expect(th).toBeDefined()
        expect(th!.querySelector('.ant-table-filter-trigger')).toBeNull()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('O CARTÃO DO MOBILE ganha o valor com o filtro ligado (VII.3)', () => {
    /** O agregado que a página calcula, pela mesma função e o mesmo `hoje` — nunca literal. */
    const AGREGADOS = montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: hojeNoFusoDoNegocio(), escopo: 'ABERTAS' }).porCliente
    const atraso = (dias: number) => (dias === 1 ? 'há 1 dia' : `há ${dias} dias`)

    it('a fixture tem atraso apurado nos dois em atraso — senão "os dias" não seriam exercidos', () => {
        expect(AGREGADOS['c-velho'].maiorAtrasoDias).toBeGreaterThan(AGREGADOS['c-novo'].maiorAtrasoDias!)
    })

    // MUTAÇÃO: mexer só no desktop (o cartão não ganha a linha).
    it('EM ATRASO: o cartão mostra VENCIDO, com o valor e os dias — e A VENCER não', async () => {
        comFiltros({ emAtraso: true })
        modoMobile = true
        const t = await montar()
        const c = t.cartao('Bbb Velho')
        expect(c).toContain(TITULO_VENCIDO)
        expect(c).toContain(formatBRL(AGREGADOS['c-velho'].vencido))
        expect(c).toContain(atraso(AGREGADOS['c-velho'].maiorAtrasoDias!))
        expect(c).not.toContain(TITULO_A_VENCER)
        expect(t.host.querySelector('[data-testid="cartao-a-vencer"]')).toBeNull()
    })

    it('o espelho, A VENCER: o cartão mostra A VENCER — e VENCIDO não', async () => {
        comFiltros({ aVencer: true })
        modoMobile = true
        const t = await montar()
        const c = t.cartao('Ccc Futuro')
        expect(c).toContain(TITULO_A_VENCER)
        expect(c).toContain(formatBRL(AGREGADOS['c-futuro'].aVencer))
        expect(t.host.querySelector('[data-testid="cartao-vencido"]')).toBeNull()
        for (const r of RASTROS.vencido) expect(t.lista()).not.toContain(r)
    })

    it('os dois ligados: as duas linhas no cartão', async () => {
        comFiltros({ emAtraso: true, aVencer: true })
        modoMobile = true
        const t = await montar()
        expect(t.host.querySelectorAll('[data-testid="cartao-vencido"]').length).toBeGreaterThan(0)
        expect(t.host.querySelectorAll('[data-testid="cartao-a-vencer"]').length).toBeGreaterThan(0)
        expect(t.cartao('Ccc Futuro')).toContain(formatBRL(AGREGADOS['c-futuro'].aVencer))
    })

    it('é LINHA no cartão, não coluna: o ramo mobile segue sem `<table>`', async () => {
        comFiltros({ emAtraso: true, aVencer: true })
        modoMobile = true
        const t = await montar()
        expect(t.host.querySelector('table')).toBeNull()
    })
})

describe('SITUAÇÃO também no cabeçalho — um lugar só para filtro', () => {
    for (const mobile of [false, true]) {
        it(`${mobile ? 'mobile' : 'desktop'}: o seletor de situação existe, e escolhê-lo escreve a URL`, async () => {
            modoMobile = mobile
            const t = await montar()
            const seletor = t.host.querySelector('[data-testid="filtro-de-situacao"]')
            expect(seletor).not.toBeNull()
            const alvo = (seletor!.querySelector('.ant-select-selector') ?? seletor!) as HTMLElement
            await act(async () => { alvo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
            const opcao = Array.from(document.body.querySelectorAll('.ant-select-item-option'))
                .find((o) => (o.textContent || '').trim() === 'Ativo')
            expect(opcao).toBeDefined()
            await act(async () => { opcao!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
            expect(replaces[replaces.length - 1]?.url?.query).toEqual(escreverFiltrosNaQuery({ ...FILTROS_DE_COBRANCA_VAZIOS, situacao: ['ACTIVE'] }))
        })
    }

    // A irmã do caso do segmento.
    it('a coluna STATUS NÃO tem filtro próprio', async () => {
        const t = await montar()
        const th = Array.from(t.host.querySelectorAll('thead th')).find((x) => (x.textContent || '').trim() === 'Status')
        expect(th).toBeDefined()
        expect(th!.querySelector('.ant-table-filter-trigger')).toBeNull()
    })

    // MUTAÇÃO: a tabela voltar a ler `filtrosDaTabela.status` — sem filtro na coluna, ela lê
    // vazio e APAGA o filtro do cabeçalho ao primeiro clique de ordenação.
    it('ordenar pelo nome NÃO apaga a situação que veio da URL', async () => {
        comFiltros({ situacao: ['ACTIVE'] })
        const t = await montar()
        const th = Array.from(t.host.querySelectorAll('thead th')).find((x) => (x.textContent || '').trim() === 'Cliente')!
        await act(async () => { th.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        for (const r of replaces) expect(r.url?.query?.situacao).toBe('ACTIVE')
    })
})

describe('a consulta a `employees` SAIU — nenhuma tela mostrava o que ela carregava', () => {
    // O instrumento: o falso de fato registra as consultas.
    it('o falso do supabase registra a tabela consultada', () => {
        const { supabase } = require('@/supabase/client') as { supabase: { from(t: string): unknown } }
        supabase.from('qualquer')
        expect(tabelasConsultadas).toEqual(['qualquer'])
    })

    // MUTAÇÃO: reintroduzir o `fetchEmployees`.
    for (const mobile of [false, true]) {
        it(`${mobile ? 'mobile' : 'desktop'}: a página monta sem consultar \`employees\``, async () => {
            modoMobile = mobile
            comFiltros({ emAtraso: true, aVencer: true, segmento: [SEGMENTO_DA_FIXTURE], situacao: ['ACTIVE'] })
            await montar()
            expect(tabelasConsultadas).not.toContain('employees')
        })
    }
})
