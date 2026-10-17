/**
 * PORTÃO — a parcela PAGA fica apagada na tabela de vencimentos da ficha, e continua alcançável.
 *
 * Maquete aprovada pelo dono do produto, 17/10/2026. A regra e a razão da cor estão no
 * cabeçalho de `CLASSE_LINHA_LIQUIDADA`, em `lista-de-vencimentos.component.tsx`.
 *
 * UM RAMO SÓ, e isto é medição: a lista de vencimentos é `<Table>` em toda largura — não há
 * cartão de celular nela. O pedido dizia "nos dois ramos"; o segundo não existe, e não foi
 * inventado. Há caso afirmando isso, para que um cartão que venha a nascer não nasça sem a classe.
 *
 * O jsdom não carrega o SCSS, então a COR não é medida no DOM: é medida na folha de estilo, pela
 * regra que a classe aciona. A CLASSE é medida no DOM, linha a linha.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { montarParcelasDoCliente, type LinhaDeParcela, type VendaParaResolucao } from '@/utils/parcelas-do-cliente'
import { montarVencimentosDaFicha, type VendaComCodigo, type VencimentosDaFicha } from '@/utils/vencimentos-da-ficha'
import { CLASSE_LINHA_LIQUIDADA, ListaDeVencimentos } from '@/page-parts/clientes/lista-de-vencimentos.component'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query), media: query, onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const HOJE = '2026-10-16'
const VENDAS: (VendaComCodigo & VendaParaResolucao)[] = [
    { id: '11111111-1111-1111-1111-111111111111', customer_id: 'c1', sale_code: 'VD-121365' },
]
const parcela = (p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela => ({
    amount: 0, due_date: null, paid_date: null, is_active: true, origin_type: 'SALE', origin_id: VENDAS[0].id, contact_id: null, ...p,
})
const PARCELAS: LinhaDeParcela[] = [
    parcela({ id: 'vencida', due_date: '2026-09-10', amount: 100 }),
    parcela({ id: 'paga', due_date: '2026-09-20', amount: 200, paid_date: '2026-09-21' }),
    parcela({ id: 'a-vencer', due_date: '2026-12-10', amount: 300 }),
]
const COBRANCA = montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: HOJE, escopo: 'TODAS' })
const VENCIMENTOS: VencimentosDaFicha = montarVencimentosDaFicha({
    parcelas: COBRANCA.parcelas.filter((p) => p.customerId === 'c1'),
    vendas: VENDAS,
})

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) {
        const m = montadas.pop()!
        act(() => { m.root.unmount() })
        m.host.remove()
    }
})

function montar() {
    const abertas: string[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    act(() => {
        root.render(
            <ListaDeVencimentos
                vencimentos={VENCIMENTOS} selecionados={[]} aoSelecionar={() => {}}
                aoAbrirParcela={(id) => { abertas.push(id) }}
            />,
        )
    })
    const linha = (id: string) => host.querySelector(`tr[data-row-key="${id}"]`) as HTMLTableRowElement
    return { host, abertas, linha }
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('a fixture discrimina', () => {
    it('há UMA paga e DUAS não pagas — aplicar a todas ou a nenhuma dá resultado diferente', () => {
        const estados = VENCIMENTOS.datadas.map((l) => l.estado)
        expect(estados.filter((e) => e === 'PAGA')).toHaveLength(1)
        expect(estados.filter((e) => e !== 'PAGA')).toHaveLength(2)
    })
})

describe('PORTÃO 7 — a linha PAGA tem a classe apagada; as outras, não', () => {
    // MUTAÇÃO: não aplicar a nenhuma.
    it('a linha paga carrega a classe', () => {
        const t = montar()
        expect(t.linha('paga').classList.contains(CLASSE_LINHA_LIQUIDADA)).toBe(true)
    })

    // MUTAÇÃO: aplicar a todas.
    it('a vencida e a a vencer NÃO carregam a classe', () => {
        const t = montar()
        expect(t.linha('vencida').classList.contains(CLASSE_LINHA_LIQUIDADA)).toBe(false)
        expect(t.linha('a-vencer').classList.contains(CLASSE_LINHA_LIQUIDADA)).toBe(false)
        expect(t.host.querySelectorAll(`tr.${CLASSE_LINHA_LIQUIDADA}`)).toHaveLength(1)
    })

    it('a classe é da LINHA inteira — data, venda, parcela, valor, selo e "Abrir" estão dentro dela', () => {
        const t = montar()
        const tr = t.linha('paga')
        expect(tr.querySelector('.ant-tag')).not.toBeNull()
        expect(Array.from(tr.querySelectorAll('button')).map((b) => (b.textContent || '').trim())).toContain('Abrir')
        expect(tr.textContent).toContain('VD-121365')
    })

    it('o checkbox dela segue desligado e não selecionável', () => {
        const t = montar()
        const caixa = t.linha('paga').querySelector('input[type="checkbox"]') as HTMLInputElement
        expect(caixa.disabled).toBe(true)
        expect(caixa.checked).toBe(false)
    })
})

describe('A COR — da folha de estilo, por token, e legível', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const scss = fs.readFileSync(path.join(process.cwd(), 'src/styles/globals.scss'), 'utf-8')
    const regras = [...scss.matchAll(/([^{}]*\btr\.linha-liquidada\b[^{}]*)\{([^}]*)\}/g)]

    it('existe regra para a classe, pelo nome que o componente exporta', () => {
        expect(CLASSE_LINHA_LIQUIDADA).toBe('linha-liquidada')
        expect(regras.length).toBeGreaterThan(0)
    })

    // MUTAÇÃO: trocar o token por literal, ou pela cor de desabilitado.
    it('a cor do texto é `var(--color-text-secondary)` — token, não literal, e não a de desabilitado', () => {
        const corpo = regras.map((r) => r[2]).join('\n')
        expect(corpo).toMatch(/color:\s*var\(--color-text-secondary\)/)
        expect(corpo).not.toMatch(/#[0-9a-f]{3,8}\b/i)
        expect(corpo).not.toMatch(/text-disabled|text\.disabled|neutral-200/)
    })
})

describe('PORTÃO 8 — o "Abrir" da linha paga CONTINUA clicável', () => {
    // MUTAÇÃO: desabilitar o "Abrir" da linha paga.
    it('não está desabilitado, e o clique chega com o id da parcela', () => {
        const t = montar()
        const abrir = Array.from(t.linha('paga').querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Abrir') as HTMLButtonElement
        expect(abrir.disabled).toBe(false)
        act(() => { abrir.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        expect(t.abertas).toEqual(['paga'])
    })
})

describe('UM RAMO SÓ — medido', () => {
    it('a lista de vencimentos não tem ramo de cartão: não lê o dispositivo', () => {
        const fs = require('fs') as typeof import('fs')
        const fonte = fs.readFileSync(require('path').join(process.cwd(), 'src/page-parts/clientes/lista-de-vencimentos.component.tsx'), 'utf-8')
        expect(fonte).not.toMatch(/useDevice|isMobile|isCompact/)
    })
})
