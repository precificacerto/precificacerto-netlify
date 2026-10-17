/**
 * PORTÃO — a caixa de seleção do envio para sequência, paginada (maquete do PO, 17/10/2026).
 *
 * Fixture de 247 clientes: três páginas de 100, a última com 47 — a página cheia e a página
 * parcial no mesmo caso. A seleção é controlada por um `useState` de fora, como na página real,
 * para que o que se afirma seja o que a TELA faz com o estado, não um estado interno escondido.
 *
 * As negativas comparam contra o produto das funções de `selecao-paginada.ts`, nunca contra
 * literal (`assercao-negativa-que-nunca-falha.md`). As POSITIVAS dos números que o PO escreveu
 * — 100, 47, "Mostrando 201–247 de 247" — são literais DE PROPÓSITO: são o contrato da maquete,
 * e escritos a partir da constante andariam junto com ela.
 */

import React, { useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { PAGE_SIZE_SELECAO_DE_SEQUENCIA } from '@/constants/pagination'
import {
    ROTULO_LIMPAR_SELECAO,
    rotuloMarcarPagina,
    rotuloMarcarTodos,
    textoDoContador,
} from '@/utils/selecao-paginada'
import {
    ROTULO_ENVIAR_PARA_SEQUENCIA,
    SelecaoDeClientes,
    type ClienteSelecionavel,
} from '@/page-parts/conectividade/selecao-de-clientes.component'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query), media: query, onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const TOTAL = 247
const CLIENTES: ClienteSelecionavel[] = Array.from({ length: TOTAL }, (_, i) => ({
    id: `cli-${String(i + 1).padStart(3, '0')}`,
    name: `Cliente ${String(i + 1).padStart(3, '0')}`,
    telefone: `(11) 9${String(10000000 + i).slice(0, 8)}`,
}))

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length > 0) {
        const m = montadas.pop()!
        act(() => { m.root.unmount() })
        m.host.remove()
    }
    document.body.innerHTML = ''
})

function montar(clientes: ClienteSelecionavel[] = CLIENTES, inicial: string[] = []) {
    const enviados: number[] = []
    let selecaoAtual: string[] = inicial
    function Casca() {
        const [sel, setSel] = useState<string[]>(inicial)
        selecaoAtual = sel
        return (
            <SelecaoDeClientes
                clientes={clientes} selecionados={sel} aoMudarSelecao={setSel}
                enviando={false} envioBloqueado={false} aoEnviar={() => { enviados.push(sel.length) }}
            />
        )
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    act(() => { root.render(<Casca />) })
    const botao = (rotulo: string) => Array.from(host.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === rotulo) as HTMLButtonElement | undefined
    return {
        host, enviados,
        selecao: () => selecaoAtual,
        nomes: () => Array.from(host.querySelectorAll('[data-testid="lista-de-selecao"] .ant-checkbox-wrapper'))
            .map((w) => w.querySelector(':scope > span:last-child > span:first-child')?.textContent ?? ''),
        marcadosNaTela: () => host.querySelectorAll('[data-testid="lista-de-selecao"] input[type="checkbox"]:checked').length,
        caixasNaTela: () => Array.from(host.querySelectorAll<HTMLInputElement>('[data-testid="lista-de-selecao"] input[type="checkbox"]')),
        barra: () => host.querySelector('[data-testid="barra-de-paginacao"]')?.textContent ?? '',
        contador: () => host.querySelector('[data-testid="contador-da-selecao"]')?.textContent ?? '',
        enviar: () => host.querySelector('[data-testid="botao-enviar-sequencia"]') as HTMLButtonElement,
        botao,
        clicar: (b: Element | undefined | null) => {
            if (!b) throw new Error('alvo do clique não encontrado')
            act(() => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        },
        irPara: (n: number) => {
            const item = host.querySelector(`.ant-pagination-item-${n}`)
            if (!item) throw new Error(`página ${n} não encontrada na barra`)
            act(() => { item.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
        },
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('a constante', () => {
    it('o tamanho da página é 100, num lugar só', () => {
        expect(PAGE_SIZE_SELECAO_DE_SEQUENCIA).toBe(100)
    })
})

describe('PORTÃO 1 — com 247: página 1 mostra 100, a 3 mostra 47, e a barra diz o intervalo', () => {
    it('página 1: 100 clientes, do 001 ao 100, e "Mostrando 1–100 de 247"', () => {
        const t = montar()
        expect(t.nomes()).toHaveLength(100)
        expect(t.nomes()[0]).toBe('Cliente 001')
        expect(t.nomes()[99]).toBe('Cliente 100')
        expect(t.barra()).toContain('Mostrando 1–100 de 247')
    })

    it('página 3: 47 clientes, do 201 ao 247, e "Mostrando 201–247 de 247"', () => {
        const t = montar()
        t.irPara(3)
        expect(t.nomes()).toHaveLength(47)
        expect(t.nomes()[0]).toBe('Cliente 201')
        expect(t.nomes()[46]).toBe('Cliente 247')
        expect(t.barra()).toContain('Mostrando 201–247 de 247')
    })

    it('a barra tem as páginas e anterior/próxima', () => {
        const t = montar()
        for (const n of [1, 2, 3]) expect(t.host.querySelector(`.ant-pagination-item-${n}`)).not.toBeNull()
        expect(t.host.querySelector('.ant-pagination-prev')).not.toBeNull()
        expect(t.host.querySelector('.ant-pagination-next')).not.toBeNull()
        expect(t.host.querySelector('.ant-pagination-item-4')).toBeNull()
    })
})

describe('PORTÃO 2 — a seleção atravessa as páginas (por ID, não por índice)', () => {
    // MUTAÇÕES: `Checkbox.Group` sobre a página · seleção por índice de linha.
    it('marcar 2 na página 1, ir à 2, marcar 1, voltar à 1 → os 3 continuam marcados', () => {
        const t = montar()
        t.clicar(t.caixasNaTela()[0])
        t.clicar(t.caixasNaTela()[5])
        t.irPara(2)
        // Na página 2 NADA aparece marcado: as posições 0 e 5 daqui são outros clientes.
        expect(t.marcadosNaTela()).toBe(0)
        t.clicar(t.caixasNaTela()[0])
        t.irPara(1)
        expect(t.marcadosNaTela()).toBe(2)
        expect(t.caixasNaTela()[0].checked).toBe(true)
        expect(t.caixasNaTela()[5].checked).toBe(true)
        expect([...t.selecao()].sort()).toEqual(['cli-001', 'cli-006', 'cli-101'])
    })

    it('desmarcar na página 2 não mexe nos da página 1', () => {
        const t = montar(CLIENTES, ['cli-001', 'cli-101'])
        t.irPara(2)
        t.clicar(t.caixasNaTela()[0])
        expect(t.selecao()).toEqual(['cli-001'])
    })
})

describe('PORTÃO 3 — "Marcar todos da lista" marca N, não 100', () => {
    it('o botão diz o número da lista INTEIRA', () => {
        const t = montar()
        expect(t.botao(rotuloMarcarTodos(TOTAL))).toBeDefined()
        expect(t.botao(rotuloMarcarTodos(TOTAL))!.textContent).toContain('247')
    })

    // MUTAÇÃO: o botão marcar só a página.
    it('clicar → 247 selecionados, e a página 3 aparece toda marcada', () => {
        const t = montar()
        t.clicar(t.botao(rotuloMarcarTodos(TOTAL)))
        expect(t.selecao()).toHaveLength(TOTAL)
        expect(t.contador()).toBe(textoDoContador(TOTAL, TOTAL, 100))
        expect(t.contador()).not.toBe(textoDoContador(100, TOTAL, 100))
        t.irPara(3)
        expect(t.marcadosNaTela()).toBe(47)
    })
})

describe('PORTÃO 4 — "Marcar esta página" marca a página, e o contador distingue "de N" e "nesta página"', () => {
    it('o botão diz o número desta página: 100 na 1, 47 na 3', () => {
        const t = montar()
        expect(t.botao(rotuloMarcarPagina(100))).toBeDefined()
        t.irPara(3)
        expect(t.botao(rotuloMarcarPagina(47))).toBeDefined()
    })

    // MUTAÇÃO: o botão marcar a lista inteira.
    it('na página 1 → 100 marcados, "100 de 247"; na página 2 → "100 de 247 · 0 nesta página"', () => {
        const t = montar()
        t.clicar(t.botao(rotuloMarcarPagina(100)))
        expect(t.selecao()).toHaveLength(100)
        expect(t.contador()).toBe(textoDoContador(100, TOTAL, 100))
        expect(t.contador()).toContain('100 de 247')
        expect(t.contador()).not.toBe(textoDoContador(TOTAL, TOTAL, 100))
        t.irPara(2)
        expect(t.contador()).toBe(textoDoContador(100, TOTAL, 0))
        expect(t.contador()).toContain('0 nesta página')
    })

    it('marcar a página 3 depois da 1 SOMA: 147, e nesta página 47', () => {
        const t = montar()
        t.clicar(t.botao(rotuloMarcarPagina(100)))
        t.irPara(3)
        t.clicar(t.botao(rotuloMarcarPagina(47)))
        expect(t.selecao()).toHaveLength(147)
        expect(t.contador()).toBe(textoDoContador(147, TOTAL, 47))
    })

    it('"Limpar seleção" fica desabilitado com zero e habilitado com um', () => {
        const t = montar()
        expect(t.botao(ROTULO_LIMPAR_SELECAO)!.disabled).toBe(true)
        t.clicar(t.caixasNaTela()[0])
        expect(t.botao(ROTULO_LIMPAR_SELECAO)!.disabled).toBe(false)
        t.clicar(t.botao(ROTULO_LIMPAR_SELECAO))
        expect(t.selecao()).toEqual([])
    })
})

describe('PORTÃO 5 — enviar desabilitado com zero, habilitado com um', () => {
    // MUTAÇÃO: tirar `selecionados.length === 0` do `disabled`.
    it('zero → desabilitado; um → habilitado, e o clique chega com 1', () => {
        const t = montar()
        expect((t.enviar().textContent || '').trim()).toBe(ROTULO_ENVIAR_PARA_SEQUENCIA)
        expect(t.enviar().disabled).toBe(true)
        t.clicar(t.caixasNaTela()[3])
        expect(t.enviar().disabled).toBe(false)
        t.clicar(t.enviar())
        expect(t.enviados).toEqual([1])
    })
})

describe('PORTÃO 6 — a caixa NÃO tem rolagem interna', () => {
    // MUTAÇÃO: devolver `maxHeight: 220, overflow: 'auto'` à lista.
    it('nenhum elemento da caixa tem `maxHeight` ou `overflow` de rolagem', () => {
        const t = montar()
        const caixa = t.host.querySelector('[data-testid="caixa-de-selecao"]') as HTMLElement
        const todos = [caixa, ...Array.from(caixa.querySelectorAll<HTMLElement>('*'))]
        const comRolagem = todos.filter((el) =>
            el.style.maxHeight !== '' || /auto|scroll|hidden/.test(el.style.overflow + el.style.overflowY))
        expect(comRolagem.map((el) => el.getAttribute('data-testid') ?? el.className)).toEqual([])
    })

    // O instrumento: o mesmo detector acha a rolagem quando ela existe.
    it('o detector enxerga `maxHeight` + `overflow: auto` num elemento montado', () => {
        const el = document.createElement('div')
        el.style.maxHeight = '220px'
        el.style.overflow = 'auto'
        expect(el.style.maxHeight !== '' || /auto|scroll|hidden/.test(el.style.overflow + el.style.overflowY)).toBe(true)
    })

    it('cabeçalho e rodapé nas pontas da caixa, presos (`sticky`)', () => {
        const t = montar()
        const caixa = t.host.querySelector('[data-testid="caixa-de-selecao"]')!
        expect(caixa.firstElementChild?.getAttribute('data-testid')).toBe('cabecalho-da-selecao')
        expect(caixa.lastElementChild?.getAttribute('data-testid')).toBe('rodape-da-selecao')
        expect((caixa.firstElementChild as HTMLElement).style.position).toBe('sticky')
        expect((caixa.lastElementChild as HTMLElement).style.position).toBe('sticky')
    })

    it('a página da Conectividade usa a caixa nova e não guarda a altura fixa', () => {
        const fs = require('fs') as typeof import('fs')
        const fonte = fs.readFileSync(require('path').join(process.cwd(), 'src/pages/conectividade/index.tsx'), 'utf-8')
        expect(fonte).toContain('<SelecaoDeClientes')
        expect(fonte).not.toMatch(/maxHeight:\s*220/)
        expect(fonte).not.toMatch(/Checkbox\.Group/)
    })
})
