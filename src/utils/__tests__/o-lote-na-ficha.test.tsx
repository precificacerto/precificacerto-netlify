/**
 * PORTÃO 5c.2 — o LOTE na ficha: o botão, a forma, a confirmação, o que vai à chamada.
 *
 * A escrita não está aqui: o componente chama `aoDarBaixaEmLote`, a ficha chama a rota, a rota
 * chama `dar_baixa_em_lote`. A rota está em `a-rota-da-baixa.test.ts`; a função, no harness
 * (`run3.sh`, `somas.sh`). Este portão afirma o que a TELA decide.
 *
 * Toda asserção sobre texto compara contra o PRODUTO da função que o gera — `formatBRL`,
 * `diaBR`, `motivoDoLoteDesabilitado`, `textoDaConfirmacaoDoLote` —, nunca contra literal
 * digitado (`assercao-negativa-que-nunca-falha.md`).
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { formatBRL } from '@/utils/formatters'
import { diaBR } from '@/utils/dia-de-hoje'
import {
    contarSelecionadas,
    somarSelecionadas,
    type LinhaDeVencimento,
    type VencimentosDaFicha,
} from '@/utils/vencimentos-da-ficha'
import {
    LIMITE_DO_LOTE,
    MANTER_FORMA_COMBINADA,
    ROTULO_MANTER_FORMA,
    motivoDoLoteDesabilitado,
    rotuloDoBotaoDoLote,
    textoDaConfirmacaoDoLote,
    vendasDoLote,
} from '@/utils/baixa-pela-rota'
import { ListaDeVencimentos, ROTULO_CONFIRMAR_LOTE } from '@/page-parts/clientes/lista-de-vencimentos.component'

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

const HOJE = '2026-06-15'

/**
 * 0, 1, 50 e 51 são LITERAIS, e não `LIMITE_DO_LOTE ± 1`: são o contrato com a função
 * (`IF v_n > 50`). Escritos a partir da constante, os casos andariam junto com ela, e a mutação
 * `LIMITE_DO_LOTE = 51` deixava o "51 desabilitado" verde — medido. A constante é conferida
 * contra o arquivo da migração em `a-rota-da-baixa.test.ts`.
 */
const TETO_DA_FUNCAO = 50

/** 52 em aberto (uma acima do teto, mais uma) e uma PAGA, em três vendas. */
function linhaDe(i: number, p: Partial<LinhaDeVencimento> = {}): LinhaDeVencimento {
    return {
        id: `p${String(i).padStart(2, '0')}`, saleId: `s${i % 3}`, codigoDaVenda: `VD-00${i % 3}`,
        numero: 1 + (i % 4), de: 4, vencimento: `2026-07-${String(1 + (i % 28)).padStart(2, '0')}`,
        valor: [10.1, 20.2, 0.07, 33.33][i % 4], estado: 'A_VENCER', diasDeAtraso: null, pagaEm: null, selecionavel: true,
        ...p,
    }
}
const ABERTAS = Array.from({ length: 52 }, (_, i) => linhaDe(i))
const PAGA = linhaDe(99, { estado: 'PAGA', pagaEm: '2026-06-01', selecionavel: false, valor: 500 })
const VENCIMENTOS: VencimentosDaFicha = { datadas: [...ABERTAS, PAGA], semVencimento: [] }
const TODAS = [...VENCIMENTOS.datadas]
const ids = (n: number) => ABERTAS.slice(0, n).map((l) => l.id)

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) {
        const m = montadas.pop()!
        act(() => { m.root.unmount() })
        m.host.remove()
    }
    document.body.innerHTML = ''
})

function montar(selecionados: string[], opcoes: { pode?: boolean; semCallback?: boolean } = {}) {
    const recebidas: { ids: string[]; forma: string | null }[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    act(() => {
        root.render(
            <ListaDeVencimentos
                vencimentos={VENCIMENTOS} selecionados={selecionados} aoSelecionar={() => {}} aoAbrirParcela={() => {}}
                hoje={HOJE} podeDarBaixaEmLote={opcoes.pode ?? true}
                aoDarBaixaEmLote={opcoes.semCallback ? undefined : async (e) => { recebidas.push(e) }}
            />,
        )
    })
    const botaoDoLote = () => host.querySelector('[data-testid="botao-do-lote"]') as HTMLButtonElement | null
    return {
        host, recebidas, botaoDoLote,
        motivo: () => host.querySelector('[data-testid="motivo-do-lote"]')?.textContent ?? null,
        confirmacao: () => document.body.querySelector('[data-testid="texto-da-confirmacao-do-lote"]')?.textContent ?? null,
        abrir: async () => { await act(async () => { botaoDoLote()!.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) },
        confirmar: async () => {
            const b = Array.from(document.body.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === ROTULO_CONFIRMAR_LOTE)
            if (!b) throw new Error('botão de confirmação não encontrado')
            await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        },
        escolherForma: async (rotulo: string) => {
            const seletor = host.querySelector('[data-testid="forma-do-lote"] .ant-select-selector, [data-testid="forma-do-lote"].ant-select .ant-select-selector')
                ?? host.querySelector('.ant-select-selector')
            await act(async () => { seletor!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
            const opcao = Array.from(document.body.querySelectorAll('.ant-select-item-option'))
                .find((o) => (o.textContent || '').trim() === rotulo)
            if (!opcao) throw new Error(`opção "${rotulo}" não encontrada`)
            await act(async () => { opcao.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        },
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('PORTÃO 5 — o botão fica DESABILITADO com 0 e com 51, e diz por quê', () => {
    // A fixture alcança os dois lados do teto — senão o 51 não seria exercido.
    it('a fixture tem mais em aberto que o teto', () => {
        expect(ABERTAS.length).toBeGreaterThan(51)
    })

    // MUTAÇÃO: tirar o `disabled` do botão, ou trocar `>` por `>=` em `motivoDoLoteDesabilitado`.
    for (const [n, desabilitado] of [[0, true], [1, false], [50, false], [51, true]] as const) {
        it(`${n} selecionadas: botão ${desabilitado ? 'DESABILITADO' : 'habilitado'}`, () => {
            const t = montar(ids(n))
            const b = t.botaoDoLote()!
            expect(b).not.toBeNull()
            expect(b.disabled).toBe(desabilitado)
            expect((b.textContent || '').trim()).toBe(rotuloDoBotaoDoLote(n))
            // A frase é o PRODUTO da função; com o botão habilitado ela não existe.
            expect(t.motivo()).toBe(motivoDoLoteDesabilitado(n))
        })
    }

    it('com 51 a frase nomeia o limite da função', () => {
        expect(montar(ids(51)).motivo()).toContain(String(TETO_DA_FUNCAO))
        expect(LIMITE_DO_LOTE).toBe(TETO_DA_FUNCAO)
    })

    it('desabilitado não abre a confirmação', async () => {
        const t = montar(ids(51))
        await t.abrir()
        expect(t.confirmacao()).toBeNull()
    })

    it('sem `cash_flow.can_edit`, o bloco do lote NÃO EXISTE', () => {
        const t = montar(ids(2), { pode: false })
        expect(t.host.querySelector('[data-testid="bloco-do-lote"]')).toBeNull()
        expect(t.botaoDoLote()).toBeNull()
    })

    it('o par: com a permissão, o bloco existe — o caso acima discrimina', () => {
        expect(montar(ids(2)).host.querySelector('[data-testid="bloco-do-lote"]')).not.toBeNull()
    })
})

describe('a PAGA continua não-selecionável, e não entra no lote', () => {
    it('o checkbox da PAGA está desabilitado', () => {
        const t = montar([])
        const linhaDaPaga = t.host.querySelector(`tr[data-row-key="${PAGA.id}"]`)!
        expect((linhaDaPaga.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true)
        const linhaAberta = t.host.querySelector(`tr[data-row-key="${ABERTAS[0].id}"]`)!
        expect((linhaAberta.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(false)
    })

    // MUTAÇÃO: o lote mandar `selecionados` crus em vez das linhas selecionáveis.
    it('uma seleção herdada com a PAGA dentro: a paga NÃO vai, nem conta, nem soma', async () => {
        const sel = [...ids(2), PAGA.id]
        const t = montar(sel)
        expect((t.botaoDoLote()!.textContent || '').trim()).toBe(rotuloDoBotaoDoLote(2))
        await t.abrir()
        await t.confirmar()
        expect(t.recebidas).toEqual([{ ids: ids(2), forma: null }])
        expect(t.recebidas[0].ids).not.toContain(PAGA.id)
    })
})

describe('a confirmação nomeia quantas, a SOMA e as vendas', () => {
    it('o texto é o produto de `textoDaConfirmacaoDoLote`, com a soma da autossoma', async () => {
        const sel = ids(5)
        const t = montar(sel)
        await t.abrir()
        const linhas = TODAS.filter((l) => sel.includes(l.id))
        const esperado = textoDaConfirmacaoDoLote({
            quantas: contarSelecionadas(TODAS, sel),
            soma: formatBRL(somarSelecionadas(TODAS, sel)),
            vendas: vendasDoLote(linhas),
            forma: null,
            pagoEm: diaBR(HOJE),
        })
        expect(t.confirmacao()).toBe(esperado)
        // e os três fatos estão nele, cada um pela função que o produz
        expect(t.confirmacao()).toContain(formatBRL(somarSelecionadas(TODAS, sel)))
        for (const v of vendasDoLote(linhas)) expect(t.confirmacao()).toContain(v)
        expect(t.confirmacao()).toContain('5 parcelas')
    })

    it('as vendas saem SEM repetição', () => {
        const linhas = TODAS.filter((l) => ids(6).includes(l.id))
        const vendas = vendasDoLote(linhas)
        expect(new Set(vendas).size).toBe(vendas.length)
        expect(vendas.length).toBe(3)
    })

    it('nada é chamado antes de confirmar', async () => {
        const t = montar(ids(3))
        await t.abrir()
        expect(t.recebidas).toEqual([])
    })
})

describe('a forma: UMA para o lote, e o padrão é MANTER a combinada', () => {
    it('o seletor começa em "manter a forma combinada"', () => {
        const t = montar(ids(2))
        expect(t.host.querySelector('[data-testid="bloco-do-lote"]')!.textContent).toContain(ROTULO_MANTER_FORMA)
    })

    // MUTAÇÃO: o estado inicial do seletor ser uma forma do enum (ex.: 'PIX').
    it('confirmar sem mexer manda `forma: null` — e a rota faz disso um NULL por id', async () => {
        const t = montar(ids(3))
        await t.abrir()
        await t.confirmar()
        expect(t.recebidas).toEqual([{ ids: ids(3), forma: null }])
    })

    it('escolher PIX manda `forma: \'PIX\'`, e a confirmação diz que vale para todas', async () => {
        const t = montar(ids(3))
        await t.escolherForma('PIX')
        await t.abrir()
        expect(t.confirmacao()).toContain('forma PIX para todas')
        await t.confirmar()
        expect(t.recebidas).toEqual([{ ids: ids(3), forma: 'PIX' }])
    })

    it('voltar a "manter" depois de escolher manda `null` de novo — o sentinela não vaza', async () => {
        const t = montar(ids(2))
        await t.escolherForma('BOLETO')
        await t.escolherForma(ROTULO_MANTER_FORMA)
        await t.abrir()
        await t.confirmar()
        expect(t.recebidas[0].forma).toBeNull()
        expect(t.recebidas[0].forma).not.toBe(MANTER_FORMA_COMBINADA)
    })
})
