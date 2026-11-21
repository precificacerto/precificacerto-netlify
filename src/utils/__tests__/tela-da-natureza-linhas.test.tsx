/**
 * PORTÃO — as linhas da tela da natureza (item (3) da ordem, 21/11/2026): as variáveis do motor, a gravada que o motor não tem mais (nada gravado
 * some da tela) e o vidro por formato — os formatos das tipologias e os já gravados.
 */
import { linhasDaFamilia } from '@/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component'
import type { FamiliaDaTela, LinhaGravada } from '@/lib/atendimentos-ia/tela-da-natureza-servidor'

const G = (variavel: string, natureza: LinhaGravada['natureza'], opcao: string | null, formato: string | null = null): LinhaGravada =>
    ({ familia: 'PVC', linha: null, formato, variavel, natureza, opcao_padrao: opcao, atualizado_em: null, conferencia: null })

const F: FamiliaDaTela = {
    familia: 'PVC', rotulo: 'PVC Wolf', motor: { id: 'm1', nome: 'Motor' }, formatos: ['janela correr', 'maxim-ar'], textos: null,
    variaveis: [
        { variavel: 'ARI', descricao: 'Arremate interno', tipologias: 1, opcoes: [{ rotulo: 'BZ1770', tipologias: 1 }] },
        { variavel: 'INT', descricao: null, tipologias: 3, opcoes: [] },
        // o VIDRO, se o motor o declarar como variável, não vira linha da família inteira: o vidro é por formato
        { variavel: 'VIDRO', descricao: 'Vidro', tipologias: 3, opcoes: [] },
    ],
    linhas: [G('ARI', 'POLITICA', 'BZ1770'), G('SOLDA', 'POLITICA', 'SPVCAL 6MM'), G('VIDRO', 'POLITICA', 'VIN05', 'janela correr'), G('VIDRO', 'POLITICA', 'VIN08', 'porta correr')],
}

it('as variáveis do motor, a gravada fora do motor e o vidro por formato, com o que está gravado', () => {
    const l = linhasDaFamilia(F)
    expect(l.map((x) => `${x.chave}|${x.detalhe}|${x.gravada?.opcao_padrao ?? '-'}`)).toEqual([
        'ARI|Arremate interno · 1 tipologia|BZ1770',
        'INT|sem descrição no motor · 3 tipologias|-',
        'SOLDA|não está no motor do levantamento|SPVCAL 6MM',
        'VIDRO:janela correr|o código do item na tabela de vidro do fornecedor principal|VIN05',
        'VIDRO:maxim-ar|o código do item na tabela de vidro do fornecedor principal|-',
        'VIDRO:porta correr|o código do item na tabela de vidro do fornecedor principal|VIN08',
    ])
    expect(l[0].opcoes).toEqual(['BZ1770'])
    expect(l.find((x) => x.chave === 'VIDRO:maxim-ar')?.formato).toBe('maxim-ar')
})

// ── os textos da família e dos fornecedores na tela (20261121000003) ──
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TextosDaFamiliaNaTela, SEM_A_TABELA_DOS_TEXTOS, rotaDaApiDosTextos } from '@/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
describe('os textos na tela', () => {
    const pedidos: Array<{ url: string; metodo: string; corpo: unknown }> = []
    beforeEach(() => {
        pedidos.length = 0
        ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
            pedidos.push({ url, metodo: init?.method ?? 'GET', corpo: init?.body ? JSON.parse(init.body) : undefined })
            return { ok: true, status: 200, json: async () => ({}) } as Response
        })
    })
    const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
    async function montar(el: React.ReactElement) {
        const host = document.createElement('div'); document.body.appendChild(host)
        const root = createRoot(host)
        // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React
        await act(async () => { root.render(el) })
        await assentar()
        return host
    }
    it('sem a tabela: a frase da migração, sem campo', async () => {
        const host = await montar(<TextosDaFamiliaNaTela tenantId="t1" familia="PVC" rotulo="PVC Wolf" textos={null} aoSalvar={() => {}} />)
        expect(host.querySelector('[data-sem-tabela-dos-textos]')?.textContent).toContain(SEM_A_TABELA_DOS_TEXTOS)
        expect(host.querySelector('textarea')).toBeNull()
    })
    it('a família e cada fornecedor do caminho com o texto gravado; salvar manda o alvo e o texto aparado; limpar manda null', async () => {
        let salvos = 0
        const host = await montar(<TextosDaFamiliaNaTela tenantId="t1" familia="PVC" rotulo="PVC Wolf" aoSalvar={() => { salvos += 1 }}
            textos={{ familia: 'Linha Wolf.', fornecedores: [{ id: 'f-estrela', nome: 'Estrela', texto: null }, { id: 'f-wolf', nome: 'Wolf', texto: 'Tabela rev2.' }] }} />)
        const blocos = [...host.querySelectorAll('[data-texto-do-caminho]')]
        expect(blocos.map((b) => b.getAttribute('data-texto-do-caminho'))).toEqual(['familia:PVC', 'fornecedor:f-estrela', 'fornecedor:f-wolf'])
        expect(blocos.map((b) => (b.querySelector('textarea') as HTMLTextAreaElement).value)).toEqual(['Linha Wolf.', '', 'Tabela rev2.'])
        const escrever = async (b: Element, v: string) => {
            await act(async () => {
                const t = b.querySelector('textarea')!
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, v)
                t.dispatchEvent(new Event('input', { bubbles: true }))
            })
            await assentar()
        }
        const salvar = (b: Element) => [...b.querySelectorAll('button')].find((x) => x.textContent?.includes('Salvar')) as HTMLButtonElement
        expect(salvar(blocos[1]).disabled).toBe(true)
        await escrever(blocos[1], '  Vidro por m2.  ')
        await act(async () => { salvar(blocos[1]).click() }); await assentar()
        await escrever(blocos[2], '   ')
        await act(async () => { salvar(blocos[2]).click() }); await assentar()
        expect(pedidos).toEqual([
            { url: rotaDaApiDosTextos('t1'), metodo: 'PUT', corpo: { fornecedor_id: 'f-estrela', texto: 'Vidro por m2.' } },
            { url: rotaDaApiDosTextos('t1'), metodo: 'PUT', corpo: { fornecedor_id: 'f-wolf', texto: null } },
        ])
        expect(salvos).toBe(2)
    })
})
