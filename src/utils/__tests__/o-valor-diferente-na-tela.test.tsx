/**
 * PORTÃO 5c.3 — o valor diferente na tela da parcela.
 *
 * AS ASSERÇÕES OLHAM O DOM, NÃO O MÓDULO. A 5a ensinou que um portão que olha só o dado fica
 * verde com a renderização errada: `outrasEmAbertoDaSerie` pode estar certa e a tela ignorá-la.
 *
 * Toda negativa compara contra o PRODUTO da função (`formatBRL`, `diaBR`,
 * `textoDaConfirmacaoComValorDiferente`), nunca contra literal digitado —
 * `assercao-negativa-que-nunca-falha.md`: `formatBRL` usa espaço NÃO SEPARÁVEL.
 *
 * O QUE ESTE PORTÃO NÃO ALCANÇA: a RPC. Ela não roda aqui — está provada pelo harness. Este
 * portão prova o que a tela OFERECE, o que ela DIZ antes de gravar, e o que ela MANDA.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { formatBRL } from '@/utils/formatters'
import { diaBR } from '@/utils/dia-de-hoje'
import { montarParcelasDoCliente, type LinhaDeParcela } from '@/utils/parcelas-do-cliente'
import { montarVencimentosDaFicha, acharLinha, irmasDaMesmaSerie, type VendaComCodigo, type LinhaDeVencimento } from '@/utils/vencimentos-da-ficha'
import { ROTULO_CONFIRMAR_BAIXA, ROTULO_DAR_BAIXA, textoDaConfirmacaoDaBaixa } from '@/utils/baixa-de-parcela'
import {
    avisoDaBaixa,
    diferencaEmCentavos,
    emCentavosExatos,
    montarCorpoDaBaixa,
    outrasEmAbertoDaSerie,
    textoDaConfirmacaoComValorDiferente,
    textoDoValorDiferenteRegistrado,
    type ResultadoDaRpc,
} from '@/utils/baixa-pela-rota'
import { TelaDaParcela, ROTULO_VALOR_DIFERENTE } from '@/page-parts/clientes/tela-da-parcela.component'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query), media: query, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const HOJE = '2026-06-15'

// ── A fixture: uma venda de três parcelas, valores DIFERENTES entre si ───────────────────
const VENDAS: (VendaComCodigo & { customer_id: string | null })[] = [{ id: 'v-1', customer_id: 'c1', sale_code: 'VD-121365' }]
const parcela = (p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela => ({
    amount: 0, due_date: null, paid_date: null, is_active: true,
    origin_type: 'SALE', origin_id: 'v-1', contact_id: null, ...p,
})
const TRES_ABERTAS: LinhaDeParcela[] = [
    parcela({ id: 'p1', due_date: '2026-05-10', amount: 300.3 }),
    parcela({ id: 'p2', due_date: '2026-07-10', amount: 100.1 }),
    parcela({ id: 'p3', due_date: '2026-08-10', amount: 200 }),
]
/** A MESMA venda com p2 e p3 PAGAS: p1 é a última em aberto, e as irmãs EXISTEM. */
const ULTIMA_EM_ABERTO: LinhaDeParcela[] = TRES_ABERTAS.map((p) => (p.id === 'p1' ? p : { ...p, paid_date: '2026-06-01' }))

function cenario(parcelas: LinhaDeParcela[], id = 'p1'): { linha: LinhaDeVencimento; irmas: LinhaDeVencimento[] } {
    const cobranca = montarParcelasDoCliente({ parcelas, vendas: VENDAS, hoje: HOJE, escopo: 'TODAS' })
    const v = montarVencimentosDaFicha({ parcelas: cobranca.parcelas.filter((p) => p.customerId === 'c1'), vendas: VENDAS })
    const linha = acharLinha(v, id)!
    return { linha, irmas: irmasDaMesmaSerie(v, linha) }
}

type Entrada = { pagoEm: string; forma: string | null; valorPago?: number }

/**
 * Raízes montadas, desmontadas em `afterEach` MESMO QUANDO O CASO FALHA. Sem isso, o modal
 * (portal no `document.body`) de um caso que falhou antes do `desmontar()` fica na página e o
 * caso seguinte acha o botão do anterior — uma mutação derrubava seis casos em vez de dois.
 */
const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) {
        const m = montadas.pop()!
        act(() => { m.root.unmount() })
        m.host.remove()
    }
    document.body.innerHTML = ''
})

function montar(parcelas: LinhaDeParcela[]) {
    const { linha, irmas } = cenario(parcelas)
    const recebidas: Entrada[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    act(() => {
        root.render(
            <TelaDaParcela
                linha={linha} venda={{ codigo: 'VD-121365', formaCombinada: 'PIX' }} irmas={irmas}
                aoFechar={() => {}} hoje={HOJE} podeDarBaixa
                aoDarBaixa={async (e) => { recebidas.push(e) }}
            />,
        )
    })
    const botao = (rotulo: string) => Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === rotulo)
    return {
        host, linha, irmas, recebidas,
        opcao: () => host.querySelector('[data-testid="opcao-valor-diferente"]'),
        campo: () => host.querySelector('[data-testid="valor-da-baixa"]'),
        marcar: () => {
            const caixa = host.querySelector('[data-testid="opcao-valor-diferente"] input[type="checkbox"]') as HTMLInputElement
            act(() => { caixa.click() })
        },
        digitar: (texto: string) => {
            const alvo = host.querySelector('[data-testid="valor-da-baixa"]')!
            const input = (alvo.tagName === 'INPUT' ? alvo : alvo.querySelector('input')) as HTMLInputElement
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
            act(() => {
                input.focus()
                setter.call(input, texto)
                input.dispatchEvent(new Event('input', { bubbles: true }))
            })
            act(() => { input.dispatchEvent(new Event('blur', { bubbles: true })); input.blur() })
        },
        botao,
        clicar: async (rotulo: string) => {
            const b = botao(rotulo)
            if (!b) throw new Error(`botão "${rotulo}" não encontrado`)
            await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        },
        confirmacao: () => document.body.querySelector('[data-testid="texto-da-confirmacao"]')?.textContent ?? null,
        /** A limpeza real é o `afterEach`; isto existe para o caso ler como os demais portões. */
        desmontar: () => {},
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('PORTÃO 5 — o checkbox SÓ existe com outra parcela em aberto na venda (DOM)', () => {
    // MUTAÇÃO: renderizar o checkbox sempre.
    // MUTAÇÃO: contar PAGA como em aberto (filtrar só pelo id) — a fixture TEM irmãs pagas.
    it('na ÚLTIMA em aberto o checkbox NÃO renderiza — e as irmãs pagas estão lá', () => {
        const t = montar(ULTIMA_EM_ABERTO)
        // O caso discrimina: há irmãs, todas pagas. Sem irmã nenhuma, ele passaria por acaso.
        expect(t.irmas.length).toBe(3)
        expect(t.irmas.filter((i) => i.estado === 'PAGA')).toHaveLength(2)
        expect(t.host.querySelector('[data-testid="bloco-da-baixa"]')).not.toBeNull()
        expect(t.opcao()).toBeNull()
        expect(t.host.textContent).not.toContain(ROTULO_VALOR_DIFERENTE)
        expect(t.campo()).toBeNull()
        t.desmontar()
    })

    it('o par: com outras DUAS em aberto, o checkbox renderiza', () => {
        const t = montar(TRES_ABERTAS)
        expect(t.opcao()).not.toBeNull()
        expect(t.host.textContent).toContain(ROTULO_VALOR_DIFERENTE)
        t.desmontar()
    })

    it('o campo de valor só aparece DEPOIS de marcar', () => {
        const t = montar(TRES_ABERTAS)
        expect(t.campo()).toBeNull()
        t.marcar()
        expect(t.campo()).not.toBeNull()
        t.desmontar()
    })

    it('`outrasEmAbertoDaSerie` exclui a própria e as pagas', () => {
        const { linha, irmas } = cenario(TRES_ABERTAS)
        expect(outrasEmAbertoDaSerie(irmas, linha).map((o) => o.id)).toEqual(['p2', 'p3'])
        const u = cenario(ULTIMA_EM_ABERTO)
        expect(outrasEmAbertoDaSerie(u.irmas, u.linha)).toEqual([])
    })
})

describe('a confirmação do valor diferente — nomeia, e NÃO prevê', () => {
    it('com o valor digitado, a confirmação é EXATAMENTE o produto da função', async () => {
        const t = montar(TRES_ABERTAS)
        t.marcar()
        t.digitar('250')
        await t.clicar(ROTULO_DAR_BAIXA)
        const esperado = textoDaConfirmacaoComValorDiferente({
            valorPago: formatBRL(250),
            valorCombinado: formatBRL(300.3),
            parcela: `${t.linha.numero} de ${t.linha.de}`,
            codigoDaVenda: 'VD-121365',
            forma: 'PIX',
            pagoEm: diaBR(HOJE),
            diferenca: formatBRL(50.3),
            sentido: 'A_MENOS',
            reajustaveis: [`2 de 3 (vence ${diaBR('2026-07-10')})`, `3 de 3 (vence ${diaBR('2026-08-10')})`],
        })
        expect(t.confirmacao()).toBe(esperado)
        t.desmontar()
    })

    // MUTAÇÃO: acrescentar os valores das outras parcelas na confirmação (uma "prévia").
    it('NÃO há prévia: nenhum valor das outras parcelas aparece antes de gravar', async () => {
        const t = montar(TRES_ABERTAS)
        t.marcar()
        t.digitar('250')
        await t.clicar(ROTULO_DAR_BAIXA)
        const texto = t.confirmacao()!
        // Contra o PRODUTO de `formatBRL`, com o espaço não separável que ele produz.
        for (const outra of outrasEmAbertoDaSerie(t.irmas, t.linha)) {
            expect(texto).not.toContain(formatBRL(outra.valor))
        }
        // E a confirmação nomeia QUAIS absorvem — sem isso a negativa acima passaria com um
        // texto vazio.
        expect(texto).toContain(diaBR('2026-07-10'))
        expect(texto).toContain(diaBR('2026-08-10'))
        t.desmontar()
    })

    it('sem marcar, a confirmação é a da 5b, inalterada', async () => {
        const t = montar(TRES_ABERTAS)
        await t.clicar(ROTULO_DAR_BAIXA)
        expect(t.confirmacao()).toBe(textoDaConfirmacaoDaBaixa({
            valor: formatBRL(300.3), codigoDaVenda: 'VD-121365', vencimento: diaBR('2026-05-10'), forma: 'PIX', pagoEm: diaBR(HOJE),
        }))
        t.desmontar()
    })

    it('marcado e sem valor, o botão fica desabilitado — não há o que confirmar', () => {
        const t = montar(TRES_ABERTAS)
        t.marcar()
        expect((t.botao(ROTULO_DAR_BAIXA) as HTMLButtonElement).disabled).toBe(true)
        t.digitar('250')
        expect((t.botao(ROTULO_DAR_BAIXA) as HTMLButtonElement).disabled).toBe(false)
        t.desmontar()
    })
})

describe('o que a tela MANDA', () => {
    // MUTAÇÃO: mandar `valorPago` mesmo sem marcar.
    it('sem marcar: a entrada NÃO tem `valorPago` — vai pelo caminho simples', async () => {
        const t = montar(TRES_ABERTAS)
        await t.clicar(ROTULO_DAR_BAIXA)
        await t.clicar(ROTULO_CONFIRMAR_BAIXA)
        expect(t.recebidas).toHaveLength(1)
        expect(Object.keys(t.recebidas[0]).sort()).toEqual(['forma', 'pagoEm'])
        t.desmontar()
    })

    it('marcado com 250: a entrada leva `valorPago: 250`, uma vez', async () => {
        const t = montar(TRES_ABERTAS)
        t.marcar()
        t.digitar('250')
        await t.clicar(ROTULO_DAR_BAIXA)
        await t.clicar(ROTULO_CONFIRMAR_BAIXA)
        expect(t.recebidas).toEqual([{ pagoEm: HOJE, forma: 'PIX', valorPago: 250 }])
        t.desmontar()
    })

    // A DATA NÃO VAI NO CORPO: o servidor a deriva (BLOQUEANTE 3). A tela a EXIBE.
    it('`montarCorpoDaBaixa`: sem data; `valor_pago` e `forma` só quando vieram', () => {
        expect(montarCorpoDaBaixa('p1', { pagoEm: HOJE, forma: 'PIX' } as Entrada)).toEqual({ parcela_id: 'p1', forma: 'PIX' })
        expect(montarCorpoDaBaixa('p1', { pagoEm: HOJE, forma: null, valorPago: 250 } as Entrada))
            .toEqual({ parcela_id: 'p1', valor_pago: 250 })
    })
})

describe('ITEM 4 — o delta do cliente É o delta da RPC, sobre as mesmas entradas', () => {
    /**
     * `deltas.json` é UMA tabela, lida pelos DOIS lados: `deltas.sh` confere a RPC contra ela
     * no Postgres do harness, e este caso confere o cliente contra ela. O `delta` de cada par
     * foi MEDIDO na RPC, não escrito à mão. Se a confirmação dissesse uma diferença e a RPC
     * gravasse outra, ela teria mentido sobre a única coisa que existe para dizer.
     */
    const tabela = require('../../../scripts/harness/baixa-com-valor-diferente/deltas.json') as {
        duas_casas: { combinado: number; pago: number; delta: number }[]
        tres_casas_divergem: { combinado: number; pago: number; delta_rpc: number; delta_cliente: number }[]
    }

    it('a tabela tem pares nos DOIS sinais e o zero — senão o sinal não seria exercido', () => {
        const sinais = new Set(tabela.duas_casas.map((x) => Math.sign(x.delta)))
        expect(sinais).toEqual(new Set([1, -1, 0]))
    })

    // MUTAÇÃO: errar o sinal no cliente (`pago - combinado`).
    it.each(tabela.duas_casas)('$combinado pago $pago → delta $delta, igual à RPC', ({ combinado, pago, delta }) => {
        expect(diferencaEmCentavos(combinado, pago)).toBe(Math.round(delta * 100))
    })

    it('com TRÊS casas as duas contas divergem — e é por isso que a rota as recusa', () => {
        for (const x of tabela.tres_casas_divergem) {
            expect(diferencaEmCentavos(x.combinado, x.pago)).toBe(Math.round(x.delta_cliente * 100))
            expect(Math.round(x.delta_cliente * 100)).not.toBe(Math.round(x.delta_rpc * 100))
            expect(emCentavosExatos(x.pago)).toBeNull()
        }
    })
})

describe('depois: o que a tela diz vem da RESPOSTA DA RPC', () => {
    const resultado: ResultadoDaRpc = {
        success: true, operacao_id: 'op', delta: 50.3, soma_da_serie: 600.4,
        parcela_paga: { id: 'p1', valor_antes: 300.3, valor_depois: 250 },
        reajustadas: 2, outras_em_aberto: 2, criado_por: 'u',
    }

    it('o aviso traz o valor gravado e quantas a RPC reajustou', () => {
        const a = avisoDaBaixa({ ok: true, modo: 'VALOR_DIFERENTE', resultado })
        expect(a.tipo).toBe('success')
        expect(a.texto).toBe(textoDoValorDiferenteRegistrado(resultado))
        expect(a.texto).toContain(formatBRL(250))
        expect(a.texto).toContain('2 parcelas')
    })

    // MUTAÇÃO: usar `outras_em_aberto` no lugar de `reajustadas` — com cota zero eles divergem.
    it('reajustadas, e não outras_em_aberto: com cota zero os dois divergem', () => {
        const t = textoDoValorDiferenteRegistrado({ ...resultado, reajustadas: 1, outras_em_aberto: 2 })
        expect(t).toContain('1 parcela em aberto foi reajustada')
        expect(t).not.toContain('2 parcelas')
    })

    it('a diferença é em centavos inteiros, e com sinal', () => {
        expect(diferencaEmCentavos(300.3, 250)).toBe(5030)
        expect(diferencaEmCentavos(0.3, 0.1 + 0.2)).toBe(0)
        expect(diferencaEmCentavos(100, 120.01)).toBe(-2001)
    })
})
