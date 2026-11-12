/**
 * PORTÃO — a TELA da conferência de referências (12/11/2026): as quatro listas com o NOME e a contagem, nunca um número solto; cada código com o
 * peso, o degrau e o item (fornecedor, categoria, preço, créditos, NCM); o ausente aparece "não informado", nunca zero; a falha da rota aparece com
 * a frase e o "tentar de novo". E o catálogo de motores leva à tela, também no motor arquivado.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROTAS_DO_CATALOGO, telaDasReferenciasDoMotor } from '@/utils/atendimentos-ia-catalogo'
import type { ReferenciaConferida } from '@/lib/atendimentos-ia/conferencia-de-referencias'
import type { RespostaDasReferencias } from '@/page-parts/atendimentos-ia/referencias-do-motor.component'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
jest.setTimeout(20000)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, onchange: null as ((e: unknown) => void) | null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
})

const MOTOR = '00000000-0000-4000-8000-0000000000a1'
const conferida = (codigo: string, f: Partial<ReferenciaConferida> = {}): ReferenciaConferida => ({
    codigo, codigo_wvetro: `${codigo}/WOLFF`, descricao: `PECA ${codigo}`, cor: null, regras: 3, tipologias: 2, como: null, itens: [], falta: null, ...f,
})
const ITEM: ReferenciaConferida['itens'][number] = {
    codigo: '2202', descricao: 'REFORÇO EMENDA 12MM', tabela_id: 't', tabela_arquivo: 'Reforco.xlsx', fornecedor: 'Wolf', categoria: 'REFORCO',
    preco: { custo: null, valor_barra: null, valor_metro: null }, credito: { icms: 12, pis_cofins: 0, ipi: null, ipi_nao_creditavel: null }, ncm: null, temPreco: false, descricaoDiverge: false,
}
const RESPOSTA: RespostaDasReferencias = {
    motor: { id: MOTOR, nome: 'Motor Wolf', arquivado: false, fornecedor: 'Wolf', familias: ['PVC'] }, itens_nas_tabelas: 1096, itens_no_escopo: 973, codigos: 549, regras: 12116,
    achadas_com_preco: [conferida('9471', { como: 'exato', itens: [{ ...ITEM, codigo: '9471', preco: { custo: 10, valor_barra: null, valor_metro: null }, temPreco: true }] })],
    achadas_sem_preco: [conferida('2202', { como: 'exato', regras: 30, itens: [ITEM] })],
    nao_achadas: [conferida('4661', { falta: { motivo: 'NAO_ACHADA', frase: 'o código 4661 não está na tabela de preço do fornecedor do motor', candidatas: [] } }),
        conferida('83841', { falta: { motivo: 'NAO_ACHADA', frase: 'o código 83841 não está na tabela de preço do fornecedor do motor', candidatas: [] } })],
    nao_resolvidas: [conferida('17561', { falta: { motivo: 'DESCRICAO_NAO_BATE', frase: 'o código 17561 não está na tabela; com a mesma base há 17569 (MAÇANETA CELSUS)',
        candidatas: [{ item: { ...ITEM, codigo: '17569', descricao: 'MAÇANETA CELSUS', categoria: 'ACESSORIOS_VEDACAO' }, porque: 'o código começa com 1756, mas a descrição é outra' }] } })],
    sufixo_com_outra_descricao: [conferida('132114', { como: 'sufixo_do_fornecedor', itens: [{ ...ITEM, codigo: '132114/WOLFF', descricao: 'PASSA FITA INFERIOR - MARROM', descricaoDiverge: true }] })],
}

let resposta: { status: number; body: unknown } = { status: 200, body: RESPOSTA }
beforeEach(() => {
    resposta = { status: 200, body: RESPOSTA }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
        if (url !== ROTAS_DO_CATALOGO.referenciasDoMotor(MOTOR)) return { ok: false, status: 404, json: async () => ({ error: `sem resposta: ${url}` }) } as Response
        return { ok: resposta.status < 400, status: resposta.status, json: async () => resposta.body } as Response
    })
})

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ReferenciasDoMotor } = require('@/page-parts/atendimentos-ia/referencias-do-motor.component') as typeof import('@/page-parts/atendimentos-ia/referencias-do-motor.component')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(ReferenciasDoMotor, { motorId: MOTOR })) })
    await assentar()
    return host
}
const titulo = (h: HTMLElement, chave: string) => h.querySelector(`[data-titulo="${chave}"]`)?.textContent ?? null

describe('a tela', () => {
    it('as cinco listas com o NOME e a contagem, na ordem do pedido; a vazia diz "Nenhuma."', async () => {
        const h = await montar()
        expect(titulo(h, 'achadas_com_preco')).toBe('Achadas com preço: 1')
        expect(titulo(h, 'achadas_sem_preco')).toBe('Achadas SEM preço: 1')
        expect(titulo(h, 'nao_achadas')).toBe('NÃO achadas na tabela do fornecedor do motor: 2')
        expect(titulo(h, 'nao_resolvidas')).toBe('NÃO resolvidas — há candidatas, e nenhuma vale: decida: 1')
        expect(titulo(h, 'sufixo_com_outra_descricao')).toContain(': 1')
        expect([...h.querySelectorAll('[data-titulo]')].map((e) => e.getAttribute('data-titulo'))).toEqual(['achadas_com_preco', 'achadas_sem_preco', 'nao_achadas', 'nao_resolvidas', 'sufixo_com_outra_descricao'])
        expect(h.querySelector('[data-resumo]')?.textContent).toContain('549 códigos distintos em 12.116 regras, conferidos contra os 973 itens das tabelas de Wolf (PVC) — de 1.096 itens em todas as tabelas')
    })

    it('o 2202: o peso, o degrau e o item — o preço que falta e o crédito ausente são "não informado"; o zero é 0%', async () => {
        const h = await montar()
        const lista = h.querySelector('[data-lista="achadas_sem_preco"]')!
        expect(lista.querySelector('[data-codigo="2202"]')).toBeTruthy()
        const texto = lista.textContent!
        expect(texto).toContain('30')
        expect(texto).toContain('código exato')
        expect(h.querySelector('[data-lista="sufixo_com_outra_descricao"]')!.textContent).toContain('sufixo do fornecedor')
        expect(texto).toContain('Wolf · REFORCO · Reforco.xlsx')
        expect(texto).toContain('Custo: não informado · barra: não informado · metro: não informado')
        expect(texto).toContain('PIS/COFINS 0%')
        expect(texto).toContain('IPI não informado')
        expect(texto).toContain('NCM não informado')
    })

    it('as não achadas aparecem código a código, sem item', async () => {
        const h = await montar()
        const lista = h.querySelector('[data-lista="nao_achadas"]')!
        expect([...lista.querySelectorAll('[data-codigo]')].map((e) => e.getAttribute('data-codigo'))).toEqual(['4661', '83841'])
        expect(lista.querySelector('[data-item]')).toBeNull()
        expect(lista.querySelector('[data-falta="4661"]')!.textContent).toBe('o código 4661 não está na tabela de preço do fornecedor do motor')
    })

    it('a NÃO RESOLVIDA diz a falta, a candidata que apareceu e por que ela não vale', async () => {
        const h = await montar()
        const falta = h.querySelector('[data-lista="nao_resolvidas"] [data-falta="17561"]')!
        expect(falta.textContent).toContain('com a mesma base há 17569 (MAÇANETA CELSUS)')
        expect(falta.querySelector('[data-candidata="17569"]')!.textContent).toContain('Não vale: o código começa com 1756, mas a descrição é outra.')
    })

    it('a falha da rota aparece com a frase e o "tentar de novo" — nunca listas vazias', async () => {
        resposta = { status: 500, body: { error: 'Não foi possível conferir as referências do motor.' } }
        const h = await montar()
        expect(h.querySelector('[data-erro]')?.textContent).toContain('Não foi possível conferir as referências do motor.')
        expect(h.querySelector('[data-titulo]')).toBeNull()
        expect([...h.querySelectorAll('button')].some((b) => b.textContent?.includes('Tentar de novo'))).toBe(true)
    })

    it('o endereço da tela é o do motor', () => {
        expect(telaDasReferenciasDoMotor(MOTOR)).toBe(`/super-admin/atendimentos-ia/motores/${MOTOR}/referencias`)
        expect(ROTAS_DO_CATALOGO.referenciasDoMotor(MOTOR)).toBe(`/api/super-admin/atendimentos-ia/motores/${MOTOR}/referencias`)
    })
})
