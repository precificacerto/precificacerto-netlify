/**
 * PORTÃO 4b.6 — `?cliente=` pré-preenche um orçamento NOVO.
 *
 * POR QUE O HOOK, E NÃO A PÁGINA INTEIRA — e isto é medição, não preferência
 * ---------------------------------------------------------------------------
 * A primeira versão deste portão montava `pages/orcamentos/index.tsx` com `createRoot`, como
 * o portão das seis renderizações faz com as listas. Ela NÃO RODA: a página puxa geração de
 * PDF, e o jsdom morre em `HTMLCanvasElement.prototype.getContext` antes de qualquer
 * asserção. Um portão que não carrega não contribui caso nenhum e não muda `Tests: N passed`
 * — aparição 6 de `portao-que-nao-alcanca.md`.
 *
 * A regra inteira foi então extraída para `use-pre-selecao-de-cliente.hook.ts`, que é o que
 * este arquivo exercita. A página ficou com a fiação, e a fiação tem caso próprio aqui.
 *
 * ASSERÇÃO NEGATIVA NUNCA É LITERAL TRANSCRITO. Nesta campanha uma
 * `not.toContain('R$ 0,00')` ficou verde para sempre porque `formatBRL` usa espaço não
 * separável — `docs/regras/assercao-negativa-que-nunca-falha.md`. As negativas abaixo
 * comparam contra chamadas REGISTRADAS e contra constantes exportadas.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import fs from 'fs'
import path from 'path'

import { PARAM_CLIENTE } from '@/hooks/use-pre-selecao-de-cliente.hook'

let routerPronto = true
let routerQuery: Record<string, string | string[] | undefined> = {}
const replaces: Array<{ url: any; opcoes: any }> = []
jest.mock('next/router', () => ({
    useRouter: () => ({
        isReady: routerPronto,
        pathname: '/orcamentos',
        query: routerQuery,
        replace: (url: any, _as: any, opcoes: any) => { replaces.push({ url, opcoes }); return Promise.resolve(true) },
    }),
}))

/** O cliente que a consulta por id devolve. `null` é o id que não resolve. */
let clientePorId: { id: string; name: string } | null = null
/** Os ids consultados — é por aqui que o caso vê se houve leitura. */
const consultados: string[] = []
jest.mock('@/supabase/client', () => ({
    supabase: {
        from: () => {
            const enc: any = {
                select: () => enc,
                eq: (_c: string, v: string) => { consultados.push(v); return enc },
                maybeSingle: () => Promise.resolve({ data: clientePorId, error: null }),
            }
            return enc
        },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { usePreSelecaoDeCliente } = require('@/hooks/use-pre-selecao-de-cliente.hook')

const abriu: number[] = []
const resolvidos: Array<{ id: string; name: string }> = []

function Sonda() {
    usePreSelecaoDeCliente({
        aoAbrir: () => { abriu.push(1) },
        aoResolverCliente: (c: { id: string; name: string }) => { resolvidos.push(c) },
    })
    return <div data-testid="sonda" />
}

function montar() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(<Sonda />) })
    return { host, desmontar: () => { act(() => { root.unmount() }); host.remove() } }
}

beforeEach(() => {
    routerPronto = true
    routerQuery = {}
    replaces.length = 0
    consultados.length = 0
    abriu.length = 0
    resolvidos.length = 0
    clientePorId = null
})

describe('4b.6 — a regra do parâmetro', () => {
    it('com id válido: abre o formulário e resolve o cliente', async () => {
        clientePorId = { id: 'c-ativo', name: 'Cliente Ativo' }
        routerQuery = { [PARAM_CLIENTE]: 'c-ativo' }
        const t = montar()
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(abriu).toHaveLength(1)
        expect(consultados).toEqual(['c-ativo'])
        expect(resolvidos).toEqual([{ id: 'c-ativo', name: 'Cliente Ativo' }])
        t.desmontar()
    })

    // A busca é por id, SEM filtro de `is_active` — os 14 inativos da base resolvem.
    it('cliente INATIVO resolve: a busca é por id, sem filtro de atividade', async () => {
        clientePorId = { id: 'c-inativo', name: 'Cliente Inativo' }
        routerQuery = { [PARAM_CLIENTE]: 'c-inativo' }
        const t = montar()
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(resolvidos).toEqual([{ id: 'c-inativo', name: 'Cliente Inativo' }])
        t.desmontar()
    })

    // MUTAÇÃO: chamar `aoResolverCliente` mesmo sem dado, ou emitir erro.
    it('id que NÃO resolve: o formulário ABRE e nada mais acontece', async () => {
        clientePorId = null
        routerQuery = { [PARAM_CLIENTE]: 'c-fantasma' }
        const t = montar()
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(abriu).toHaveLength(1)
        expect(resolvidos).toHaveLength(0)
        t.desmontar()
    })

    it('SEM o parâmetro nada abre e nada é consultado', async () => {
        const t = montar()
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(abriu).toHaveLength(0)
        expect(consultados).toHaveLength(0)
        expect(replaces).toHaveLength(0)
        t.desmontar()
    })

    it('parâmetro vazio é o mesmo que ausente', async () => {
        routerQuery = { [PARAM_CLIENTE]: '' }
        const t = montar()
        await act(async () => { await Promise.resolve() })
        expect(abriu).toHaveLength(0)
        expect(consultados).toHaveLength(0)
        t.desmontar()
    })

    /**
     * A GUARDA, E O CASO QUE A DISCRIMINA.
     *
     * A primeira versão deste caso punha `isReady = false` com a query VAZIA — e ficou
     * VERDE com a guarda removida, porque sem a guarda o efeito roda, lê `id = ''` e sai
     * pela saída seguinte. O caso não distinguia os dois estados, que é a variante 2 de
     * `teste-que-nao-exercita.md`.
     *
     * O que a guarda realmente barra é CONFIAR NA QUERY ANTES DE ELA ESTAR PRONTA. O caso
     * é `isReady = false` com a query JÁ POPULADA: com a guarda, nada acontece e a leitura
     * espera; sem ela, o hook lê e consulta sobre um estado que o Next ainda não garantiu.
     */
    // MUTAÇÃO: tirar o `if (!router.isReady) return`.
    it('A GUARDA: com `isReady` falso, a query NÃO é lida mesmo já tendo valor', async () => {
        routerPronto = false
        routerQuery = { [PARAM_CLIENTE]: 'c-ativo' }
        clientePorId = { id: 'c-ativo', name: 'Cliente Ativo' }
        const t = montar()
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(abriu).toHaveLength(0)
        expect(consultados).toHaveLength(0)
        expect(replaces).toHaveLength(0)
        t.desmontar()
    })

    it('e com a query vazia, pronto ou não, também nada acontece', async () => {
        routerPronto = false
        routerQuery = {}
        const t = montar()
        await act(async () => { await Promise.resolve() })
        expect(abriu).toHaveLength(0)
        t.desmontar()
    })

    it('depois que o router hidrata, o parâmetro do endereço é aplicado', async () => {
        routerPronto = false
        const t = montar()
        await act(async () => { await Promise.resolve() })
        expect(abriu).toHaveLength(0)
        t.desmontar()

        routerPronto = true
        clientePorId = { id: 'c-ativo', name: 'Cliente Ativo' }
        routerQuery = { [PARAM_CLIENTE]: 'c-ativo' }
        const t2 = montar()
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(abriu).toHaveLength(1)
        t2.desmontar()
    })

    // MUTAÇÃO: não limpar o parâmetro depois de ler.
    it('O F5: o parâmetro é LIMPO da URL, e só ele', async () => {
        clientePorId = { id: 'c-ativo', name: 'Cliente Ativo' }
        routerQuery = { [PARAM_CLIENTE]: 'c-ativo', outro: 'fica' }
        const t = montar()
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(replaces).toHaveLength(1)
        expect(replaces[0].url).toEqual({ pathname: '/orcamentos', query: { outro: 'fica' } })
        expect(replaces[0].opcoes).toEqual({ shallow: true })
        expect(Object.keys(replaces[0].url.query)).not.toContain(PARAM_CLIENTE)
        t.desmontar()
    })

    it('o parâmetro é lido UMA vez por montagem — rerender não reabre o formulário', async () => {
        clientePorId = { id: 'c-ativo', name: 'Cliente Ativo' }
        routerQuery = { [PARAM_CLIENTE]: 'c-ativo' }
        const host = document.createElement('div')
        document.body.appendChild(host)
        const root = createRoot(host)
        act(() => { root.render(<Sonda />) })
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        act(() => { root.render(<Sonda />) })
        act(() => { root.render(<Sonda />) })
        await act(async () => { await Promise.resolve() })
        expect(abriu).toHaveLength(1)
        expect(consultados).toEqual(['c-ativo'])
        act(() => { root.unmount() })
        host.remove()
    })
})

describe('4b.6 — a fiação na tela de orçamentos', () => {
    const PAGINA = fs.readFileSync(path.join(process.cwd(), 'src', 'pages', 'orcamentos', 'index.tsx'), 'utf-8')

    // Asserção de CAMINHO, e ela está declarada como tal: a página não pode ser montada em
    // jsdom (ver o cabeçalho), então o que se afirma é que ela CONSOME o hook em vez de
    // reimplementar a leitura. É o caso limite honesto de `teste-que-nao-exercita.md` — não
    // há efeito numérico a medir, e o defeito a barrar é exatamente a ausência da chamada.
    it('a página consome o hook, em vez de ler a query por conta própria', () => {
        expect(PAGINA).toContain('usePreSelecaoDeCliente({')
        expect(PAGINA).toContain('aoAbrir: abrirNovoOrcamento,')
    })

    it('`?cliente=` é a ÚNICA leitura de query da tela', () => {
        // Nenhum `router.query` solto: a tela não ganhou outras leituras de endereço.
        expect(PAGINA).not.toContain('router.query')
        expect(PAGINA).not.toContain('useRouter()')
    })

    it('a abertura do formulário é UMA função, chamada pelos dois caminhos', () => {
        // Antes era um `onClick` inline com onze resets. Duplicá-lo para o hook seria
        // `copia-divergente.md`, e o décimo-segundo reset entraria só numa das cópias.
        expect(PAGINA).toContain('function abrirNovoOrcamento()')
        expect(PAGINA).toContain('onClick={() => abrirNovoOrcamento()}')
    })

    it('o cliente fora da lista de ativos ganha opção no Select', () => {
        expect(PAGINA).toContain('clienteForaDaLista &&')
    })
})
