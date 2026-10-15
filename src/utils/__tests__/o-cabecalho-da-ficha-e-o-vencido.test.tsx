/**
 * PORTÃO 4b.3 e 4b.4 — o cabeçalho com o VENCIDO, e o detalhe enriquecido.
 *
 * `hoje` é injetado em todo caso; nenhuma asserção depende do relógio da máquina.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import {
    CabecalhoDaFicha,
    ROTULO_A_RECEBER,
    ROTULO_MAIOR_ATRASO,
    ROTULO_SEM_VENCIMENTO_FICHA,
    ROTULO_VENCIDO,
} from '@/page-parts/clientes/cabecalho-da-ficha.component'
import {
    RESSALVA_TOTAL_COMPRADO,
    ROTULO_TOTAL_COMPRADO,
    montarResumoDoCliente,
} from '@/utils/resumo-do-cliente'
import { montarParcelasDoCliente, type LinhaDeParcela } from '@/utils/parcelas-do-cliente'
import { buildInstallmentPlan, buildSaleHistoryDetail } from '@/utils/sale-history-detail'
import { formatBRL } from '@/utils/formatters'

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

const HOJE = '2026-10-15'

function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(no) })
    return { host, texto: () => host.textContent || '', desmontar: () => { act(() => { root.unmount() }); host.remove() } }
}

const linha = (p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela => ({
    amount: 0, due_date: null, paid_date: null, is_active: true,
    origin_type: 'SALE', origin_id: null, contact_id: null, ...p,
})

const COBRANCA = montarParcelasDoCliente({
    vendas: [{ id: 'v1', customer_id: 'c1' }, { id: 'v2', customer_id: 'c2' }],
    parcelas: [
        linha({ id: 'p1', origin_id: 'v1', due_date: '2026-06-17', amount: 200 }),     // vencida, 120 dias
        linha({ id: 'p2', origin_id: 'v1', due_date: '2026-11-20', amount: 500 }),     // a vencer
        linha({ id: 'p3', origin_id: 'v1', due_date: '2026-05-01', amount: 99, paid_date: '2026-05-02' }),
        linha({ id: 'p4', origin_id: 'v2', due_date: null, amount: 88 }),              // sem vencimento
    ],
    hoje: HOJE,
    escopo: 'TODAS',
})

const HISTORICO = [
    { type: 'SALE', date: '2026-09-10T00:00:00', amount: 1000, lifecycle: 'ATIVO' },
    { type: 'SALE', date: '2026-07-01T00:00:00', amount: 500, lifecycle: 'ATIVO' },
    { type: 'SALE', date: '2026-10-01T00:00:00', amount: 9999, lifecycle: 'CANCELADO' },
    { type: 'SALE', date: '2026-10-02T00:00:00', amount: 7777, lifecycle: 'EXCLUIDO' },
    { type: 'BUDGET', date: '2026-10-03T00:00:00', amount: 123, lifecycle: 'ATIVO' },
]

describe('4b.3 — o resumo, e o que ele NÃO conta', () => {
    // MUTAÇÃO: contar vendas CANCELADO/EXCLUIDO no total.
    it('venda morta não é compra — 1.500, não 19.276', () => {
        const r = montarResumoDoCliente({ historico: HISTORICO, agregado: COBRANCA.porCliente['c1'] })
        expect(r.totalComprado).toBe(1500)
        expect(r.numeroDeCompras).toBe(2)
        expect(r.ticketMedio).toBe(750)
        expect(r.ultimaCompra).toBe('2026-09-10')
    })

    // MUTAÇÃO: contar orçamento como compra.
    it('orçamento não é compra', () => {
        const r = montarResumoDoCliente({ historico: HISTORICO, agregado: undefined })
        expect(r.totalComprado).toBe(1500)
    })

    it('sem compra nenhuma o ticket médio é null, nunca zero', () => {
        const r = montarResumoDoCliente({ historico: [], agregado: undefined })
        expect(r.ticketMedio).toBeNull()
        expect(r.ultimaCompra).toBeNull()
        expect(r.numeroDeCompras).toBe(0)
    })

    it('o que se deve vem do agregado da 4a, separado em três', () => {
        const r = montarResumoDoCliente({ historico: HISTORICO, agregado: COBRANCA.porCliente['c1'] })
        expect(r.vencido).toBe(200)
        expect(r.aReceber).toBe(500)
        expect(r.maiorAtrasoDias).toBe(120)
        expect(r.semVencimento).toBe(0)
    })
})

describe('4b.3 — o cabeçalho na tela', () => {
    const base = {
        nome: 'Alfa Ltda', documento: '12.345.678/0001-90',
        cidade: 'Porto Alegre', uf: 'RS', situacao: 'ACTIVE',
    }

    // MUTAÇÃO: somar vencido e a receber num indicador só.
    it('VENCIDO é indicador PRÓPRIO, separado de A RECEBER', () => {
        const t = montar(
            <CabecalhoDaFicha
                {...base}
                temCobranca
                resumo={montarResumoDoCliente({ historico: HISTORICO, agregado: COBRANCA.porCliente['c1'] })}
            />,
        )
        expect(t.texto()).toContain(ROTULO_VENCIDO)
        expect(t.texto()).toContain(ROTULO_A_RECEBER)
        expect(t.texto()).toContain('200,00')
        expect(t.texto()).toContain('500,00')
        // A soma não aparece: 700,00 é o que um indicador único mostraria.
        expect(t.texto()).not.toContain('700,00')
        expect(t.texto()).toContain(ROTULO_MAIOR_ATRASO)
        expect(t.texto()).toContain('120 dias')
        t.desmontar()
    })

    // MUTAÇÃO: remover a ressalva do rótulo.
    it('"Total comprado" diz na TELA que é um subconjunto', () => {
        const t = montar(
            <CabecalhoDaFicha {...base} temCobranca resumo={montarResumoDoCliente({ historico: HISTORICO, agregado: undefined })} />,
        )
        expect(t.texto()).toContain(ROTULO_TOTAL_COMPRADO)
        expect(t.texto()).toContain(RESSALVA_TOTAL_COMPRADO)
        expect(RESSALVA_TOTAL_COMPRADO).toBe('vendas com cliente identificado')
        t.desmontar()
    })

    // MUTAÇÃO: exibir R$ 0,00 em vez de travessão.
    it('cliente SEM parcela mostra travessão, nunca R$ 0,00', () => {
        const t = montar(
            <CabecalhoDaFicha {...base} temCobranca={false} resumo={montarResumoDoCliente({ historico: HISTORICO, agregado: undefined })} />,
        )
        // `formatBRL(0)` traz ESPAÇO NÃO SEPARÁVEL (U+00A0) entre o "R$" e o número, então
        // `not.toContain('R$ 0,00')` com espaço comum NUNCA casa — asserção que não pode
        // falhar. Comparar contra a própria função é o que discrimina.
        expect(t.texto()).not.toContain(formatBRL(0))
        expect(t.texto()).toContain('—')
        t.desmontar()
    })

    // MUTAÇÃO: renderizar SEM VENCIMENTO sempre.
    it('SEM VENCIMENTO só aparece quando é maior que zero', () => {
        const sem = montar(
            <CabecalhoDaFicha {...base} temCobranca resumo={montarResumoDoCliente({ historico: [], agregado: COBRANCA.porCliente['c1'] })} />,
        )
        expect(sem.texto()).not.toContain(ROTULO_SEM_VENCIMENTO_FICHA)
        sem.desmontar()

        const com = montar(
            <CabecalhoDaFicha {...base} temCobranca resumo={montarResumoDoCliente({ historico: [], agregado: COBRANCA.porCliente['c2'] })} />,
        )
        expect(com.texto()).toContain(ROTULO_SEM_VENCIMENTO_FICHA)
        expect(com.texto()).toContain('88,00')
        com.desmontar()
    })

    // MUTAÇÃO: exibir o telefone cru, sem o predicado estrito.
    it('telefone inválido não aparece; o válido aparece mascarado', () => {
        const resumo = montarResumoDoCliente({ historico: [], agregado: undefined })
        const ruim = montar(<CabecalhoDaFicha {...base} whatsapp="5555" telefone="34530" temCobranca={false} resumo={resumo} />)
        expect(ruim.texto()).not.toContain('5555')
        expect(ruim.texto()).not.toContain('34530')
        ruim.desmontar()

        const bom = montar(<CabecalhoDaFicha {...base} whatsapp="51999998888" temCobranca={false} resumo={resumo} />)
        expect(bom.texto()).toContain('(51) 99999-8888')
        bom.desmontar()
    })
})

describe('4b.4 — o detalhe ganha VENCIDA e "PAGA em dd/mm", e só isso', () => {
    const PARCELAS = [
        { amount: 100, due_date: '2026-07-10', paid_date: '2026-07-12' },
        { amount: 100, due_date: '2026-09-10', paid_date: null },
        { amount: 100, due_date: '2026-12-10', paid_date: null },
    ]

    // MUTAÇÃO: devolver só `liquidada`, sem `estado`.
    it('os três estados são distintos — `liquidada` sozinho não distinguia dois deles', () => {
        const p = buildInstallmentPlan(PARCELAS, HOJE)!
        expect(p.parcelas.map((x) => x.estado)).toEqual(['PAGA', 'VENCIDA', 'A_VENCER'])
        // O booleano antigo dá o MESMO valor para a vencida e para a a vencer.
        expect(p.parcelas[1].liquidada).toBe(p.parcelas[2].liquidada)
        expect(p.parcelas[1].estado).not.toBe(p.parcelas[2].estado)
    })

    // MUTAÇÃO: descartar o `paid_date`, como antes.
    it('`pagaEm` chega ao detalhe — era lido e DESCARTADO', () => {
        const p = buildInstallmentPlan(PARCELAS, HOJE)!
        expect(p.parcelas[0].pagaEm).toBe('2026-07-12')
        expect(p.parcelas[1].pagaEm).toBeNull()
    })

    it('a vencida traz os dias de atraso, contados contra o `hoje` informado', () => {
        expect(buildInstallmentPlan(PARCELAS, HOJE)!.parcelas[1].diasDeAtraso).toBe(35)
        expect(buildInstallmentPlan(PARCELAS, '2026-09-11')!.parcelas[1].diasDeAtraso).toBe(1)
    })

    // MUTAÇÃO: classificar no próprio arquivo em vez de usar o módulo da 4a.
    it('o classificador é o MESMO da lista — mesmo dia, mesma resposta', () => {
        const doDetalhe = buildInstallmentPlan([{ amount: 10, due_date: '2026-06-17', paid_date: null }], HOJE)!
        const daLista = montarParcelasDoCliente({
            vendas: [{ id: 'v9', customer_id: 'c9' }],
            parcelas: [linha({ id: 'px', origin_id: 'v9', due_date: '2026-06-17', amount: 10 })],
            hoje: HOJE, escopo: 'ABERTAS',
        })
        expect(doDetalhe.parcelas[0].estado).toBe(daLista.parcelas[0].estado)
        expect(doDetalhe.parcelas[0].diasDeAtraso).toBe(daLista.parcelas[0].diasDeAtraso)
    })

    it('o resto do detalhe NÃO mudou — nenhum campo novo além dos três', () => {
        const d = buildSaleHistoryDetail({
            sale: { final_value: 300, payment_method: 'BOLETO' },
            items: [{ quantity: 1, unit_price: 300, description: 'Item' }],
            cashEntries: PARCELAS,
            hoje: HOJE,
        })
        expect(Object.keys(d).sort()).toEqual(['formaPagamento', 'itens', 'parcelamento', 'subtotal', 'total'])
        expect(Object.keys(d.parcelamento!.parcelas[0]).sort())
            .toEqual(['de', 'diasDeAtraso', 'liquidada', 'numero', 'pagaEm', 'estado', 'valor', 'vencimento'].sort())
    })

    it('sem lançamento o bloco continua OMITIDO, não zerado', () => {
        expect(buildInstallmentPlan([], HOJE)).toBeNull()
    })
})
