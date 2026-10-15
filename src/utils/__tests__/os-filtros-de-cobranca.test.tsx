/**
 * PORTÃO 4a.3 e 4a.4 — os três filtros, a URL, e a coluna partida.
 *
 * `hoje` É INJETADO EM TODO CASO. Nenhuma asserção aqui depende do relógio da máquina que
 * roda a suíte — um portão que dependesse ficaria vermelho sozinho no dia seguinte, e
 * vermelho que muda sem o código mudar não mede nada.
 *
 * OS NÚMEROS DO §0 (11 clientes em atraso · 7 a vencer · 15 no total) são referência de
 * FORMA, não asserção: produção muda, e um caso que os afirmasse quebraria na próxima venda.
 * A fixture reproduz a ESTRUTURA — quem tem só vencida, só a vencer, as duas, nenhuma.
 *
 * `createRoot`, NÃO `@testing-library/react`: `@testing-library/dom` não está em
 * `node_modules`, e uma suíte que o importe falha ao CARREGAR — aparição 6 de
 * `portao-que-nao-alcanca.md`, em que `Tests: N passed` não muda porque a suíte não roda.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Table } from 'antd'

import { formatBRL } from '@/utils/formatters'

import {
    FILTROS_DE_COBRANCA_VAZIOS,
    ROTULO_DA_FAIXA_DE_VENCIMENTO,
    aplicarFiltrosDeCobranca,
    escreverFiltrosNaQuery,
    faixaDoAtalhoDeAtraso,
    faixaDoAtalhoDeVencimento,
    lerFiltrosDaQuery,
    type FiltrosDeCobranca,
} from '@/utils/filtros-de-cobranca'
import { montarParcelasDoCliente, type LinhaDeParcela, type VendaParaResolucao } from '@/utils/parcelas-do-cliente'
import {
    TITULO_A_VENCER,
    TITULO_SEM_VENCIMENTO,
    TITULO_VENCIDO,
    colunasDeCobranca,
} from '@/page-parts/shared/colunas-de-cobranca.component'

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

// ── O router mockado: `isReady` é VARIÁVEL, porque é ele que o caso 10 exercita. ────────
let routerPronto = true
let routerQuery: Record<string, string | string[] | undefined> = {}
const replaceChamado: Array<{ url: any; opcoes: any }> = []
jest.mock('next/router', () => ({
    useRouter: () => ({
        isReady: routerPronto,
        query: routerQuery,
        replace: (url: any, _as: any, opcoes: any) => {
            replaceChamado.push({ url, opcoes })
            return Promise.resolve(true)
        },
    }),
}))

// Importado DEPOIS do mock, senão o hook pega o `next/router` de verdade.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useFiltrosDeCobrancaNaUrl } = require('@/hooks/use-filtros-de-cobranca.hook')

const HOJE = '2026-10-15'

function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(no) })
    return {
        host,
        texto: () => host.textContent || '',
        desmontar: () => { act(() => { root.unmount() }); host.remove() },
    }
}

// ── A fixture: a FORMA do §0, com `hoje` fixo. ─────────────────────────────────────────
const VENDAS: VendaParaResolucao[] = [
    { id: 'v-atraso-velho', customer_id: 'c-atraso-velho' },
    { id: 'v-atraso-novo', customer_id: 'c-atraso-novo' },
    { id: 'v-a-vencer', customer_id: 'c-a-vencer' },
    { id: 'v-ambos', customer_id: 'c-ambos' },
    { id: 'v-sem-venc', customer_id: 'c-sem-venc' },
]

function linha(p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela {
    return {
        amount: 0, due_date: null, paid_date: null, is_active: true,
        origin_type: 'SALE', origin_id: null, contact_id: null, ...p,
    }
}

const PARCELAS: LinhaDeParcela[] = [
    // MAIOR ATRASO, MENOR VALOR — o par que faz a ordenação discriminar.
    linha({ id: 'p1', origin_id: 'v-atraso-velho', due_date: '2026-06-17', amount: 200.0 }),   // 120 dias
    // MENOR ATRASO, MAIOR VALOR.
    linha({ id: 'p2', origin_id: 'v-atraso-novo', due_date: '2026-10-14', amount: 20000.0 }),  // 1 dia
    linha({ id: 'p3', origin_id: 'v-a-vencer', due_date: '2026-10-20', amount: 500.0 }),
    // `c-ambos` tem uma vencida de OUTUBRO (para o caso "este mês" + EM ATRASO) e uma a vencer.
    linha({ id: 'p4', origin_id: 'v-ambos', due_date: '2026-10-05', amount: 333.0 }),          // 10 dias
    linha({ id: 'p5', origin_id: 'v-ambos', due_date: '2026-12-01', amount: 444.0 }),
    linha({ id: 'p6', origin_id: 'v-sem-venc', due_date: null, amount: 99.0 }),
]

const CLIENTES = [
    { id: 'c-atraso-velho', name: 'Alfa' },
    { id: 'c-atraso-novo', name: 'Beta' },
    { id: 'c-a-vencer', name: 'Gama' },
    { id: 'c-ambos', name: 'Delta' },
    { id: 'c-sem-venc', name: 'Epsilon' },
    { id: 'c-nenhuma', name: 'Zeta' },
]

const COBRANCA = montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: HOJE, escopo: 'ABERTAS' })

function filtrar(parcial: Partial<FiltrosDeCobranca>): string[] {
    return aplicarFiltrosDeCobranca({
        clientes: CLIENTES,
        porCliente: COBRANCA.porCliente,
        parcelas: COBRANCA.parcelas,
        filtros: { ...FILTROS_DE_COBRANCA_VAZIOS, ...parcial },
    }).map((c) => c.id)
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('7 — EM ATRASO e A VENCER são interruptores INDEPENDENTES', () => {
    it('EM ATRASO devolve só quem tem vencida', () => {
        expect(filtrar({ emAtraso: true }).sort()).toEqual(['c-ambos', 'c-atraso-novo', 'c-atraso-velho'])
    })

    it('A VENCER devolve só quem tem a vencer', () => {
        expect(filtrar({ aVencer: true }).sort()).toEqual(['c-a-vencer', 'c-ambos'])
    })

    it('os DOIS ligados devolvem a UNIÃO, não a interseção', () => {
        const uniao = filtrar({ emAtraso: true, aVencer: true }).sort()
        expect(uniao).toEqual(['c-a-vencer', 'c-ambos', 'c-atraso-novo', 'c-atraso-velho'])
        // A interseção seria só `c-ambos`. Se o módulo fizesse AND, este caso quebraria.
        expect(uniao).not.toEqual(['c-ambos'])
    })

    it('nenhum ligado não filtra — quem não tem parcela continua na lista', () => {
        expect(filtrar({})).toHaveLength(CLIENTES.length)
        expect(filtrar({})).toContain('c-nenhuma')
    })

    it('quem tem SÓ sem-vencimento não entra nem em EM ATRASO nem em A VENCER', () => {
        expect(filtrar({ emAtraso: true })).not.toContain('c-sem-venc')
        expect(filtrar({ aVencer: true })).not.toContain('c-sem-venc')
    })

    it('os atalhos de atraso recortam por faixa de dias', () => {
        const f = faixaDoAtalhoDeAtraso('90+')
        expect(filtrar({ emAtraso: true, atrasoDe: f.de, atrasoAte: f.ate })).toEqual(['c-atraso-velho'])
        const g = faixaDoAtalhoDeAtraso('1-30')
        expect(filtrar({ emAtraso: true, atrasoDe: g.de, atrasoAte: g.ate }).sort())
            .toEqual(['c-ambos', 'c-atraso-novo'])
    })
})

describe('8 — "este mês" fixa a FAIXA, não decide o estado', () => {
    const esteMes = faixaDoAtalhoDeVencimento('este-mes', HOJE)

    it('a faixa de outubro é resolvida contra o `hoje` informado, não contra o relógio', () => {
        expect(esteMes).toEqual({ de: '2026-10-01', ate: '2026-10-31' })
        expect(faixaDoAtalhoDeVencimento('este-mes', '2026-02-10')).toEqual({ de: '2026-02-01', ate: '2026-02-28' })
        expect(faixaDoAtalhoDeVencimento('mes-que-vem', '2026-12-20')).toEqual({ de: '2027-01-01', ate: '2027-01-31' })
    })

    it('"este mês" + EM ATRASO devolve só as VENCIDAS de outubro', () => {
        const r = filtrar({ emAtraso: true, venceDe: esteMes.de, venceAte: esteMes.ate }).sort()
        // `c-atraso-velho` vence em JUNHO: está em atraso e fora da faixa.
        expect(r).toEqual(['c-ambos', 'c-atraso-novo'])
        expect(r).not.toContain('c-atraso-velho')
    })

    it('"este mês" SOZINHO não decide estado — traz vencidas E a vencer de outubro', () => {
        const r = filtrar({ venceDe: esteMes.de, venceAte: esteMes.ate }).sort()
        expect(r).toEqual(['c-a-vencer', 'c-ambos', 'c-atraso-novo'])
    })

    it('o rótulo da faixa diz de QUAL data se fala', () => {
        expect(ROTULO_DA_FAIXA_DE_VENCIMENTO).toBe('Vencimento entre')
        expect(ROTULO_DA_FAIXA_DE_VENCIMENTO.toLowerCase()).not.toBe('período')
    })
})

describe('9 — com EM ATRASO, a ordem é MAIOR ATRASO, não maior valor', () => {
    // MUTAÇÃO: ordenar por `vencido` em vez de `maiorAtrasoDias`.
    it('maior-valor e maior-atraso DISCORDAM nesta fixture, e quem manda é o atraso', () => {
        const porAtraso = filtrar({ emAtraso: true })
        expect(porAtraso).toEqual(['c-atraso-velho', 'c-ambos', 'c-atraso-novo'])

        // A prova de que o caso discrimina: por VALOR a ordem seria a inversa na ponta.
        const porValor = [...porAtraso].sort(
            (a, b) => COBRANCA.porCliente[b].vencido - COBRANCA.porCliente[a].vencido,
        )
        expect(porValor[0]).toBe('c-atraso-novo')
        expect(porAtraso[0]).toBe('c-atraso-velho')
        expect(COBRANCA.porCliente['c-atraso-velho'].vencido).toBe(200)
        expect(COBRANCA.porCliente['c-atraso-novo'].vencido).toBe(20000)
    })

    it('sem EM ATRASO a ordem não é mexida — a lista sai como entrou', () => {
        expect(filtrar({ aVencer: true })).toEqual(['c-a-vencer', 'c-ambos'])
    })
})

describe('10 — os filtros moram na URL, e a guarda de `router.isReady` é obrigatória', () => {
    beforeEach(() => {
        routerPronto = true
        routerQuery = {}
        replaceChamado.length = 0
    })

    it('parâmetros SEPARADOS e legíveis, nunca um blob', () => {
        const q = escreverFiltrosNaQuery({
            ...FILTROS_DE_COBRANCA_VAZIOS,
            emAtraso: true, aVencer: true,
            atrasoDe: 31, atrasoAte: 60,
            venceDe: '2026-10-01', venceAte: '2026-10-31',
            situacao: ['ACTIVE'], segmento: ['Varejo', 'Atacado'], busca: 'silva',
        })
        expect(q).toEqual({
            atraso: '1', a_vencer: '1', atraso_de: '31', atraso_ate: '60',
            vence_de: '2026-10-01', vence_ate: '2026-10-31',
            situacao: 'ACTIVE', segmento: 'Varejo,Atacado', busca: 'silva',
        })
    })

    it('filtro desligado NÃO vira parâmetro vazio — vira ausência', () => {
        expect(escreverFiltrosNaQuery(FILTROS_DE_COBRANCA_VAZIOS)).toEqual({})
    })

    it('ida e volta: o que foi escrito é exatamente o que é lido', () => {
        const original: FiltrosDeCobranca = {
            emAtraso: true, aVencer: false, atrasoDe: 1, atrasoAte: 30,
            venceDe: '2026-10-01', venceAte: '2026-10-31',
            situacao: ['ACTIVE'], segmento: ['Varejo'], busca: 'silva',
        }
        expect(lerFiltrosDaQuery(escreverFiltrosNaQuery(original))).toEqual(original)
    })

    it('parâmetro inválido na URL não derruba a tela — vira o vazio daquele filtro', () => {
        const f = lerFiltrosDaQuery({ atraso: 'sim', vence_de: '15/10/2026', atraso_de: 'muito' })
        expect(f.emAtraso).toBe(false)
        expect(f.venceDe).toBeNull()
        expect(f.atrasoDe).toBeNull()
    })

    function Sonda() {
        const { filtros, definirFiltros, pronto } = useFiltrosDeCobrancaNaUrl('/clientes')
        return (
            <div>
                <span data-testid="pronto">{String(pronto)}</span>
                <span data-testid="atraso">{String(filtros.emAtraso)}</span>
                <span data-testid="busca">{filtros.busca}</span>
                <button onClick={() => definirFiltros({ ...filtros, emAtraso: true, busca: 'nova' })}>aplicar</button>
            </div>
        )
    }
    const ler = (host: HTMLElement, id: string) =>
        host.querySelector(`[data-testid="${id}"]`)!.textContent

    it('recarregar com os parâmetros reconstrói os MESMOS filtros', () => {
        routerQuery = { atraso: '1', busca: 'silva' }
        const t = montar(<Sonda />)
        expect(ler(t.host, 'atraso')).toBe('true')
        expect(ler(t.host, 'busca')).toBe('silva')
        t.desmontar()
    })

    it('aplicar um filtro ESCREVE os parâmetros, com `shallow`', () => {
        const t = montar(<Sonda />)
        act(() => { (t.host.querySelector('button') as HTMLButtonElement).click() })
        expect(replaceChamado).toHaveLength(1)
        expect(replaceChamado[0].url).toEqual({ pathname: '/clientes', query: { atraso: '1', busca: 'nova' } })
        expect(replaceChamado[0].opcoes).toEqual({ shallow: true })
        t.desmontar()
    })

    // MUTAÇÃO: tirar o `if (!router.isReady) return` do hook.
    it('A GUARDA: com `isReady` falso a query NÃO é lida, e nada é escrito', () => {
        // É o primeiro render do Next: a query chega VAZIA mesmo havendo parâmetro no
        // endereço. Sem a guarda, o hook leria "nenhum filtro" e escreveria isso de volta,
        // apagando o que o usuário colou — `relatorio-vendas/index.tsx:169-172`.
        routerPronto = false
        routerQuery = {}
        const t = montar(<Sonda />)
        expect(ler(t.host, 'pronto')).toBe('false')
        act(() => { (t.host.querySelector('button') as HTMLButtonElement).click() })
        expect(replaceChamado).toHaveLength(0)
        t.desmontar()
    })

    it('depois que o router fica pronto, o parâmetro do endereço é aplicado', () => {
        routerPronto = false
        routerQuery = {}
        const t = montar(<Sonda />)
        expect(ler(t.host, 'atraso')).toBe('false')
        routerPronto = true
        routerQuery = { atraso: '1' }
        act(() => { t.desmontar() })
        const t2 = montar(<Sonda />)
        expect(ler(t2.host, 'atraso')).toBe('true')
        t2.desmontar()
    })
})

describe('11 e 12 — a coluna "Em aberto" se parte', () => {
    function tabela(porCliente: Parameters<typeof colunasDeCobranca>[0], linhas: Array<{ id: string }>) {
        return montar(
            <Table
                rowKey="id"
                pagination={false}
                columns={colunasDeCobranca(porCliente) as any}
                dataSource={linhas as any}
            />,
        )
    }

    // MUTAÇÃO: somar vencido e a vencer numa coluna só.
    it('cliente com os dois mostra os DOIS valores, em células diferentes', () => {
        const t = tabela(COBRANCA.porCliente, [{ id: 'c-ambos' }])
        const celulas = Array.from(t.host.querySelectorAll('tbody td')).map((c) => c.textContent || '')
        // São TRÊS porque a fixture tem alguém com sem-vencimento, então a terceira coluna
        // existe — e `c-ambos` não tem nada nela, por isso o travessão. O que este caso
        // afirma é que vencido e a vencer caem em células DIFERENTES.
        expect(celulas).toHaveLength(3)
        expect(celulas[0]).toContain('333,00')
        expect(celulas[1]).toContain('444,00')
        expect(celulas[2]).toBe('—')
        // A soma NÃO aparece em lugar nenhum: 777,00 é o que uma coluna única mostraria.
        expect(t.texto()).not.toContain('777,00')
        t.desmontar()
    })

    it('os títulos são duas colunas, não uma', () => {
        const t = tabela(COBRANCA.porCliente, [{ id: 'c-ambos' }])
        const titulos = Array.from(t.host.querySelectorAll('thead th')).map((c) => c.textContent || '')
        expect(titulos).toEqual([TITULO_VENCIDO, TITULO_A_VENCER, TITULO_SEM_VENCIMENTO])
        t.desmontar()
    })

    it('a vencida carrega os dias de atraso ao lado do valor', () => {
        const t = tabela(COBRANCA.porCliente, [{ id: 'c-atraso-velho' }])
        expect(t.texto()).toContain('há 120 dias')
        t.desmontar()
    })

    it('cliente SEM agregado exibe travessão, nunca R$ 0,00', () => {
        const t = tabela(COBRANCA.porCliente, [{ id: 'c-nenhuma' }])
        const celulas = Array.from(t.host.querySelectorAll('tbody td')).map((c) => c.textContent || '')
        expect(celulas[0]).toBe('—')
        expect(celulas[1]).toBe('—')
        // `formatBRL(0)` traz ESPAÇO NÃO SEPARÁVEL (U+00A0) entre o "R$" e o número, então
        // `not.toContain('R$ 0,00')` com espaço comum NUNCA casa — asserção que não pode
        // falhar. Comparar contra a própria função é o que discrimina.
        expect(t.texto()).not.toContain(formatBRL(0))
        t.desmontar()
    })

    // MUTAÇÃO: renderizar a terceira coluna sempre.
    it('12 — `semVencimento = 0` em todos: a TERCEIRA coluna não renderiza', () => {
        const semNenhum = montarParcelasDoCliente({
            parcelas: PARCELAS.filter((p) => p.id !== 'p6'),
            vendas: VENDAS, hoje: HOJE, escopo: 'ABERTAS',
        })
        const t = tabela(semNenhum.porCliente, [{ id: 'c-ambos' }])
        const titulos = Array.from(t.host.querySelectorAll('thead th')).map((c) => c.textContent || '')
        expect(titulos).toEqual([TITULO_VENCIDO, TITULO_A_VENCER])
        expect(titulos).not.toContain(TITULO_SEM_VENCIMENTO)
        t.desmontar()
    })

    it('12 — com algum `> 0`, ela renderiza e mostra o valor só em quem tem', () => {
        const t = tabela(COBRANCA.porCliente, [{ id: 'c-sem-venc' }, { id: 'c-ambos' }])
        const titulos = Array.from(t.host.querySelectorAll('thead th')).map((c) => c.textContent || '')
        expect(titulos).toContain(TITULO_SEM_VENCIMENTO)
        const linhas = Array.from(t.host.querySelectorAll('tbody tr'))
        expect((linhas[0].querySelectorAll('td')[2].textContent || '')).toContain('99,00')
        expect((linhas[1].querySelectorAll('td')[2].textContent || '')).toBe('—')
        t.desmontar()
    })
})
