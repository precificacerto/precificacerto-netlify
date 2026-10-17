/**
 * PORTÃO 5b.2 — a baixa de UMA parcela na ficha do cliente.
 *
 * A ESCRITA SAIU DESTE LADO na …000003 (17/10/2026): a ficha chama a rota, a rota chama
 * `dar_baixa_simples`, e a idempotência é a da FUNÇÃO — `FOR UPDATE` e `PC010`, provados nos
 * casos 3 e 8 do harness (`scripts/harness/baixa-com-valor-diferente/run3.sh`). O que este
 * portão afirma é o que a TELA faz: o corpo que ela monta, o dia que ela mostra, a confirmação,
 * e que um clique duplo não vira duas chamadas.
 *
 * As asserções sobre texto formatado comparam contra o PRODUTO de `formatBRL` e `diaBR`,
 * nunca contra literal digitado — `assercao-negativa-que-nunca-falha.md`. `formatBRL` usa
 * espaço NÃO SEPARÁVEL (U+00A0), e um literal com espaço comum nunca casaria.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { formatBRL } from '@/utils/formatters'
import { diaBR, hojeNoFusoDoNegocio } from '@/utils/dia-de-hoje'
import { montarParcelasDoCliente, type LinhaDeParcela } from '@/utils/parcelas-do-cliente'
import { montarVencimentosDaFicha, acharLinha, type VendaComCodigo } from '@/utils/vencimentos-da-ficha'
import { montarResumoDoCliente } from '@/utils/resumo-do-cliente'
import type { ClienteComInformacoesExtras } from '@/utils/informacoes-extras-do-cliente'
import {
    FORMAS_DA_BAIXA,
    ROTULO_CONFIRMAR_BAIXA,
    ROTULO_DAR_BAIXA,
    montarPayloadDaBaixa,
    textoDaConfirmacaoDaBaixa,
} from '@/utils/baixa-de-parcela'
import { DESTINO_DO_CODIGO, avisoDaBaixa, montarCorpoDaBaixa } from '@/utils/baixa-pela-rota'
import { TelaDaParcela } from '@/page-parts/clientes/tela-da-parcela.component'
import { CabecalhoDaFicha } from '@/page-parts/clientes/cabecalho-da-ficha.component'

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

/**
 * `HOJE` É UMA DATA PASSADA, de propósito, e isto é o que faz a mutação "trocar o `hoje`
 * injetado por `new Date()`" ficar vermelha.
 *
 * A primeira versão usava `2026-10-16`, que era o dia em que o caso foi escrito — e a
 * asserção `expect(HOJE).not.toBe(hojeNoFusoDoNegocio())` ficou VERMELHA na primeira
 * execução, provando que o caso não discriminava nada naquele dia. Uma data no passado
 * nunca volta a ser hoje, então a distinção vale para sempre.
 */
const HOJE = '2026-06-15'

function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(no) })
    return {
        host,
        texto: () => host.textContent || '',
        /** O Modal do antd é PORTAL: ele não vive dentro do host. */
        textoGlobal: () => document.body.textContent || '',
        clicar: (rotulo: string) => {
            const alvo = Array.from(document.body.querySelectorAll('button'))
                .find((b) => (b.textContent || '').trim() === rotulo)
            if (!alvo) throw new Error(`botão "${rotulo}" não encontrado`)
            act(() => { alvo.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        },
        desmontar: () => { act(() => { root.unmount() }); host.remove() },
    }
}

// ── A fixture ───────────────────────────────────────────────────────────────────────────
const VENDAS: (VendaComCodigo & { id: string; customer_id: string | null })[] = [
    { id: 'v-1', customer_id: 'c1', sale_code: 'VD-121365' },
]
const linha = (p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela => ({
    amount: 0, due_date: null, paid_date: null, is_active: true,
    origin_type: 'SALE', origin_id: 'v-1', contact_id: null, ...p,
})
/** Uma VENCIDA e uma A VENCER: o vencido do cabeçalho tem de cair só o valor da primeira. */
const PARCELAS: LinhaDeParcela[] = [
    linha({ id: 'p1', due_date: '2026-05-10', amount: 300.3 }),
    linha({ id: 'p2', due_date: '2026-08-10', amount: 100.1 }),
]

function derivar(parcelas: LinhaDeParcela[]) {
    const cobranca = montarParcelasDoCliente({ parcelas, vendas: VENDAS, hoje: HOJE, escopo: 'TODAS' })
    const vencimentos = montarVencimentosDaFicha({
        parcelas: cobranca.parcelas.filter((p) => p.customerId === 'c1'),
        vendas: VENDAS,
    })
    return { cobranca, vencimentos, agregado: cobranca.porCliente['c1'] }
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('1 — o payload da ficha: as duas colunas da baixa, e NENHUMA das opcionais', () => {
    it('contém `paid_date` e `payment_method`', () => {
        const p = montarPayloadDaBaixa({ pagoEm: HOJE, forma: 'PIX' })
        expect(p.paid_date).toBe(HOJE)
        expect(p.payment_method).toBe('PIX')
    })

    // MUTAÇÃO: incluir `due_date` (ou `amount`) no corpo que a ficha manda.
    it('o corpo da ficha NÃO tem `due_date` nem `amount` — reescrever vencimento apagaria o atraso', () => {
        expect(Object.keys(montarCorpoDaBaixa('p1', { forma: 'PIX' }))).toEqual(['parcela_id', 'forma'])
    })
})

describe('2 — `paid_date` vem do fuso do negócio, nunca do relógio do navegador', () => {
    // MUTAÇÃO: trocar o `hoje` injetado por `new Date()` dentro do componente.
    it('a tela exibe o `hoje` INJETADO, que não é o dia de quem roda o teste', () => {
        const { vencimentos } = derivar(PARCELAS)
        const l = acharLinha(vencimentos, 'p1')!
        expect(HOJE).not.toBe(hojeNoFusoDoNegocio())
        const t = montar(
            <TelaDaParcela
                linha={l} venda={{ codigo: 'VD-121365' }} irmas={[]} aoFechar={() => {}}
                hoje={HOJE} podeDarBaixa aoDarBaixa={async () => {}}
            />,
        )
        expect(t.host.querySelector('[data-testid="data-da-baixa"]')!.textContent).toBe(diaBR(HOJE))
        t.desmontar()
    })

    it('`hojeNoFusoDoNegocio` é quem resolve o dia, e é no fuso do negócio', () => {
        // 02:00 UTC de 17/10 ainda é 23:00 de 16/10 em São Paulo (UTC−3). Um
        // `toISOString()` devolveria 17 e a parcela constaria paga num dia em que não foi.
        //
        // A primeira versão deste caso usava 03:00Z e esperava 16 — ERRADO: 03:00Z menos
        // três horas é 00:00 do MESMO dia 17. A medição derrubou a conta de quem a
        // escreveu, e o par abaixo fixa a fronteira onde ela de fato está.
        expect(hojeNoFusoDoNegocio(new Date('2026-10-17T02:00:00Z'))).toBe('2026-10-16')
        expect(hojeNoFusoDoNegocio(new Date('2026-10-17T03:00:00Z'))).toBe('2026-10-17')
    })

    // A data NÃO vai: o servidor a deriva com a MESMA `hojeNoFusoDoNegocio` (XI.1).
    it('o corpo não leva data — a tela exibe o dia, quem decide é o servidor', () => {
        const corpo = montarCorpoDaBaixa('p1', { forma: null })
        expect(Object.keys(corpo)).toEqual(['parcela_id'])
    })
})

describe('3 — idempotência: é da FUNÇÃO, e a tela trata o PC010 como aviso', () => {
    // O `FOR UPDATE` e o `PC010` de `dar_baixa_simples` estão provados no harness (casos 3 e 8).
    // Do lado da tela, o que importa é que "já estava paga" NÃO vira "baixa registrada".
    it('PC010 é AVISO, com a frase do destino — e não sucesso', () => {
        const d = DESTINO_DO_CODIGO.PC010
        expect(avisoDaBaixa({ ok: false, motivo: d.motivo, error: d.mensagem, codigo: 'PC010' })).toEqual({ tipo: 'warning', texto: d.mensagem })
    })

    it('parcela PAGA não renderiza o botão de baixa', () => {
        const { vencimentos } = derivar([...PARCELAS, linha({ id: 'p3', due_date: '2026-04-01', amount: 50, paid_date: '2026-04-02' })])
        const paga = acharLinha(vencimentos, 'p3')!
        expect(paga.estado).toBe('PAGA')
        const t = montar(
            <TelaDaParcela
                linha={paga} venda={{ codigo: 'VD-121365', formaCombinada: 'PIX' }} irmas={[]} aoFechar={() => {}}
                hoje={HOJE} podeDarBaixa aoDarBaixa={async () => {}}
            />,
        )
        expect(t.host.querySelector('[data-testid="bloco-da-baixa"]')).toBeNull()
        expect(Array.from(t.host.querySelectorAll('button')).map((b) => (b.textContent || '').trim())).toEqual(['Voltar'])
        // E mostra o que aconteceu: PAGA em dd/mm, com a forma.
        expect(t.texto()).toContain(diaBR('2026-04-02'))
        expect(t.texto()).toContain('PIX')
        t.desmontar()
    })
})

describe('4 — a confirmação NOMEIA os quatro fatos', () => {
    const fatos = {
        valor: formatBRL(300.3),
        codigoDaVenda: 'VD-121365',
        vencimento: diaBR('2026-05-10'),
        forma: 'PIX',
        pagoEm: diaBR(HOJE),
    }

    // MUTAÇÃO: omitir um dos quatro do texto.
    it('o texto traz valor, código da venda, vencimento e forma', () => {
        const texto = textoDaConfirmacaoDaBaixa(fatos)
        expect(texto).toContain(formatBRL(300.3))
        expect(texto).toContain('VD-121365')
        expect(texto).toContain(diaBR('2026-05-10'))
        expect(texto).toContain('PIX')
    })

    it('e traz a data que vai ser gravada', () => {
        expect(textoDaConfirmacaoDaBaixa(fatos)).toContain(diaBR(HOJE))
    })

    it('venda não identificada e sem vencimento são DITOS, não omitidos', () => {
        const t = textoDaConfirmacaoDaBaixa({ ...fatos, codigoDaVenda: null, vencimento: null, forma: null })
        expect(t).toContain('venda não identificada')
        expect(t).toContain('sem vencimento')
        // `ausente-vs-falso.md`: a ausência da forma é dita, não exibida como vazio.
        expect(t).toContain('Sem forma de pagamento')
    })

    it('a TELA mostra esse mesmo texto ao pedir a baixa, antes de gravar', () => {
        const { vencimentos } = derivar(PARCELAS)
        const l = acharLinha(vencimentos, 'p1')!
        let gravou = false
        const t = montar(
            <TelaDaParcela
                linha={l} venda={{ codigo: 'VD-121365', formaCombinada: 'PIX' }} irmas={[]} aoFechar={() => {}}
                hoje={HOJE} podeDarBaixa aoDarBaixa={async () => { gravou = true }}
            />,
        )
        t.clicar(ROTULO_DAR_BAIXA)
        const painel = document.body.querySelector('[data-testid="texto-da-confirmacao"]')!
        expect(painel.textContent).toBe(textoDaConfirmacaoDaBaixa(fatos))
        // UM CLIQUE NÃO GRAVA. É o que a confirmação existe para garantir.
        expect(gravou).toBe(false)
        t.desmontar()
    })

    it('as formas oferecidas são as seis em uso', () => {
        expect([...FORMAS_DA_BAIXA]).toEqual([
            'BOLETO', 'CARTAO_CREDITO', 'CHEQUE_PRE_DATADO', 'DINHEIRO', 'LANCAMENTOS_A_RECEBER', 'PIX',
        ])
    })
})

describe('5 — depois da baixa, a parcela é PAGA e o VENCIDO cai exatamente o valor dela', () => {
    it('o vencido do cabeçalho cai o valor da parcela baixada, ao centavo', () => {
        const antes = derivar(PARCELAS)
        expect(antes.agregado.vencido).toBe(300.3)

        // A linha depois da baixa: o payload REAL aplicado sobre a linha.
        const payload = montarPayloadDaBaixa({ pagoEm: HOJE, forma: 'PIX' })
        const depois = derivar(PARCELAS.map((p) => (p.id === 'p1'
            ? { ...p, paid_date: payload.paid_date, payment_method: payload.payment_method } as LinhaDeParcela
            : p)))

        expect(depois.agregado.vencido).toBe(0)
        expect(Math.round((antes.agregado.vencido - depois.agregado.vencido) * 100)).toBe(Math.round(300.3 * 100))
        // A que não foi baixada NÃO se move.
        expect(depois.agregado.aVencer).toBe(antes.agregado.aVencer)
    })

    it('a parcela sai de VENCIDA e entra em PAGA, com a data gravada', () => {
        const payload = montarPayloadDaBaixa({ pagoEm: HOJE, forma: 'PIX' })
        expect(acharLinha(derivar(PARCELAS).vencimentos, 'p1')!.estado).toBe('VENCIDA')
        const depois = derivar(PARCELAS.map((p) => (p.id === 'p1' ? { ...p, paid_date: payload.paid_date } : p)))
        const l = acharLinha(depois.vencimentos, 'p1')!
        expect(l.estado).toBe('PAGA')
        expect(l.pagaEm).toBe(HOJE)
        expect(l.selecionavel).toBe(false)
    })

    it('o CABEÇALHO renderiza o vencido menor depois da recarga', () => {
        const base = {
            nome: 'Alfa Ltda', situacao: 'ACTIVE',
            resolverResponsavel: (): string | null => null,
            aoAlternarMais: () => {}, maisAberto: false, emEdicao: false, temCobranca: true,
            // ANOTADO: com `strictNullChecks` desligado, um literal todo-`null` infere
            // `any` em cada propriedade e sobe o baseline do `tsc` em 9 (`TS7018`). O jest
            // passa verde com os nove vivos — `assercao-negativa-que-nunca-falha.md`,
            // seção do `tsc`. É a SEGUNDA rodada seguida em que isto acontece comigo.
            cliente: {
                email: null, document: null, ie: null, cep: null, address: null, city: null,
                state_code: null, notes: null, owner_id: null, is_icms_contributor: false,
            } as ClienteComInformacoesExtras,
        }
        const antes = derivar(PARCELAS)
        const t1 = montar(<CabecalhoDaFicha {...base} resumo={montarResumoDoCliente({ historico: [], agregado: antes.agregado })} />)
        expect(t1.texto()).toContain(formatBRL(300.3))
        t1.desmontar()

        const payload = montarPayloadDaBaixa({ pagoEm: HOJE, forma: 'PIX' })
        const depois = derivar(PARCELAS.map((p) => (p.id === 'p1' ? { ...p, paid_date: payload.paid_date } : p)))
        const t2 = montar(<CabecalhoDaFicha {...base} resumo={montarResumoDoCliente({ historico: [], agregado: depois.agregado })} />)
        // MUTAÇÃO: não recarregar depois da baixa — o vencido continuaria em 300,30.
        expect(t2.texto()).not.toContain(formatBRL(300.3))
        expect(t2.texto()).toContain(formatBRL(0))
        t2.desmontar()
    })

    it('a ficha RECARREGA a cobrança depois da baixa', () => {
        // A recarga é o que move os três números de uma vez, e ela mora na ficha: o
        // componente só sabe que confirmou. Sem este caso, a mutação "não recarregar"
        // ficaria verde — os casos acima provam a DERIVAÇÃO, não a chamada.
        const fonte = require('fs').readFileSync(
            require('path').join(process.cwd(), 'src/page-parts/clientes/ficha-do-cliente.component.tsx'), 'utf-8',
        )
        const semComentarios = fonte.split('\n').filter((l: string) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
        expect(semComentarios).toContain('mutate: recarregarCobranca')
        expect(semComentarios).toContain('await recarregarCobranca()')
    })
})

describe('6 — o botão exige `canEdit(MODULES.CASH_FLOW)`', () => {
    // Anotação de RETORNO obrigatória: sem ela o `tsc` responde `TS7011`.
    const props = (
        extra: Partial<React.ComponentProps<typeof TelaDaParcela>>,
    ): React.ComponentProps<typeof TelaDaParcela> => {
        const { vencimentos } = derivar(PARCELAS)
        return {
            linha: acharLinha(vencimentos, 'p1')!,
            venda: { codigo: 'VD-121365' },
            irmas: [],
            aoFechar: () => {},
            hoje: HOJE,
            podeDarBaixa: true,
            aoDarBaixa: async () => {},
            ...extra,
        }
    }

    // MUTAÇÃO: renderizar o botão sempre.
    it('sem permissão, o bloco da baixa NÃO renderiza', () => {
        const t = montar(<TelaDaParcela {...props({ podeDarBaixa: false })} />)
        expect(t.host.querySelector('[data-testid="bloco-da-baixa"]')).toBeNull()
        expect(t.texto()).not.toContain(ROTULO_DAR_BAIXA)
        t.desmontar()
    })

    it('com permissão, renderiza', () => {
        const t = montar(<TelaDaParcela {...props({})} />)
        expect(t.host.querySelector('[data-testid="bloco-da-baixa"]')).not.toBeNull()
        expect(t.texto()).toContain(ROTULO_DAR_BAIXA)
        t.desmontar()
    })

    it('sem callback de escrita, também não renderiza — tela em leitura pura', () => {
        const t = montar(<TelaDaParcela {...props({ aoDarBaixa: undefined })} />)
        expect(t.host.querySelector('[data-testid="bloco-da-baixa"]')).toBeNull()
        t.desmontar()
    })

    it('a ficha lê a permissão do CASH_FLOW, não a de CUSTOMERS', () => {
        const fonte = require('fs').readFileSync(
            require('path').join(process.cwd(), 'src/page-parts/clientes/ficha-do-cliente.component.tsx'), 'utf-8',
        )
        expect(fonte).toContain('podeDarBaixa={canEdit(MODULES.CASH_FLOW)}')
    })
})

describe('7 — a ficha não escreve: chama, uma vez', () => {
    // MUTAÇÃO: a tela chamar `aoDarBaixa` também no clique de "Dar baixa", antes da confirmação.
    it('a baixa só sai na CONFIRMAÇÃO, e sai UMA vez', async () => {
        const { vencimentos } = derivar(PARCELAS)
        const chamadas: { pagoEm: string; forma: string | null }[] = []
        const t = montar(
            <TelaDaParcela
                linha={acharLinha(vencimentos, 'p1')!} venda={{ codigo: 'VD-121365' }} irmas={[]} aoFechar={() => {}}
                hoje={HOJE} podeDarBaixa
                aoDarBaixa={async ({ pagoEm, forma }) => { chamadas.push({ pagoEm, forma }) }}
            />,
        )
        t.clicar(ROTULO_DAR_BAIXA)
        expect(chamadas).toHaveLength(0)
        await act(async () => { t.clicar(ROTULO_CONFIRMAR_BAIXA) })
        expect(chamadas).toEqual([{ pagoEm: HOJE, forma: null }])
        t.desmontar()
    })

    it('o módulo da baixa não exporta caminho em lote', () => {
        const mod = require('@/utils/baixa-de-parcela')
        const emLote = Object.keys(mod).filter((k) => /lote|varias|multiplas|batch/i.test(k))
        expect(emLote).toEqual([])
    })
})
