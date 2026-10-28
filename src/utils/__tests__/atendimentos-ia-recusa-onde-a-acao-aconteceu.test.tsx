/**
 * PORTÃO — a recusa aparece ONDE A AÇÃO ACONTECEU (dono do produto, 20/10/2026).
 *
 * "Mensagem passageira no topo da página não é aviso — é sorte." O `.xlsm` invisível
 * (`atendimentos-ia-formato-do-arquivo.test.tsx`) era um caso de uma classe: a frase da rota ia
 * para um `message.error` no topo da página, longe do clique, e sumia. Este portão cobre as
 * outras aparições da mesma classe na área:
 *
 *   (A) EXCLUIR TABELA — não há modal (é um balão de confirmação na lista): o erro vira Alert NA
 *       PÁGINA, ACIMA DA LISTA, com o arquivo e o motivo;
 *   (B) EDITAR FORNECEDOR — o erro de salvar aparece DENTRO do modal "Editar fornecedor";
 *   (C) EXCLUIR FORNECEDOR — o botão mora no modal "Editar fornecedor", e o erro aparece lá dentro;
 *   (D) CREDENCIAR — o fornecedor recusado: o erro aparece DENTRO do modal de credenciamento;
 *   (E) CREDENCIAR com tabela que falha: o fornecedor JÁ FOI GRAVADO, então o modal fecha (um novo
 *       "Salvar credenciamento" criaria um SEGUNDO fornecedor — não há índice único no nome) e as
 *       falhas ficam num Alert FIXO na página, acima da lista, com cada arquivo UMA vez só;
 *   (F) NOVA TABELA recusada DEPOIS dos envios: a frase nomeia a tabela uma vez só.
 *
 * Os casos (B), (C) e (D) também conferem que reabrir o modal não traz o erro da tentativa
 * anterior — sem isso, o Alert sempre aberto passaria os casos (`teste-que-nao-exercita.md`).
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import {
    ROTAS_DO_CATALOGO, TITULO_DA_TABELA_NAO_EXCLUIDA,
    fraseDaTabela, fraseDoArquivo, type FornecedorComTabelas,
} from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/fornecedores', asPath: '/', query: { id: 'f1' }, replace: () => {}, push: () => {} }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const XLSM = 'Modelo 2026 - Tabela de Pedidos.xlsm'
const NICHO = { id: 'n1', modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true }
const FORNECEDOR: FornecedorComTabelas = {
    id: 'f1', nome: 'Wolf Perfis', nicho_id: 'n1', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 1, contas_usando: [], categorias_das_tabelas: [],
    tabelas_da_lista: [{
        id: 't1', fornecedor_id: 'f1', arquivo_nome: 'tabela-antiga.xlsx', arquivo_path: 'f1/arquivo/x-tabela-antiga.xlsx',
        motor_nome: 'motor.xlsx', motor_path: 'f1/motor/x-motor.xlsx', vigencia: null, familia: null, categoria_chave: null, vigente: false, criado_em: '2026-10-19T12:00:00Z', contas_usando: ['Marcenaria Silva'],
    }],
}

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: string[] = []
beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`]: { status: 200, body: FORNECEDOR },
        [`GET ${ROTAS_DO_CATALOGO.fornecedores}`]: { status: 200, body: [] },
        [`GET ${ROTAS_DO_CATALOGO.nichos}`]: { status: 200, body: [NICHO] },
        [`GET ${ROTAS_DO_CATALOGO.familias}`]: { status: 200, body: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }] },
        [`GET ${ROTAS_DO_CATALOGO.categorias}`]: { status: 200, body: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }] },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push(chave)
        const r = respostas[chave] ?? { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PaginaDoFornecedor = require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PaginaDeFornecedores = require('@/pages/super-admin/atendimentos-ia/fornecedores/index').default as React.ComponentType
// eslint-disable-next-line @typescript-eslint/no-require-imports
const M = require('@/page-parts/atendimentos-ia/fornecedor-modal.component') as typeof import('@/page-parts/atendimentos-ia/fornecedor-modal.component')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TITULO_DO_ERRO_AO_SALVAR } = require('@/page-parts/atendimentos-ia/tabela-modal.component') as typeof import('@/page-parts/atendimentos-ia/tabela-modal.component')

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    document.body.innerHTML = ''
})
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(no: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(no) })
    await assentar()
    return host
}

const visivel = (w: Element) => (w as HTMLElement).style.display !== 'none'
/** O modal aberto — o último, porque o antd deixa os fechados no `body`, escondidos. */
const modal = () => {
    const abertos = Array.from(document.querySelectorAll('.ant-modal-wrap')).filter(visivel)
    return (abertos[abertos.length - 1]?.querySelector('.ant-modal') ?? null) as HTMLElement | null
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '')) as HTMLButtonElement | undefined
async function clicar(b: HTMLElement | undefined) {
    expect(b).toBeDefined()
    await act(async () => { b!.click() })
    await assentar()
}
/** Confirma o balão de confirmação aberto (Popconfirm). */
async function confirmar(texto: string) {
    const baloes = Array.from(document.querySelectorAll('.ant-popover')).filter((p) => !p.className.includes('ant-popover-hidden'))
    await clicar(botao(baloes[baloes.length - 1], texto))
}
/** A família é obrigatória na tabela nova (26/10/2026): o teste a escolhe, como o usuário faria. */
async function escolherFamilia(chave: string) {
    const opcao = modal()!.querySelector(`input[data-familia="${chave}"]`) as HTMLInputElement | null
    expect(opcao).not.toBeNull()
    await act(async () => { opcao!.click() })
    await assentar()
}
/** A categoria é obrigatória na tabela nova (27/10/2026): o teste a escolhe, como o usuário faria. */
async function escolherCategoria(chave: string) {
    const opcao = modal()!.querySelector(`input[data-categoria="${chave}"]`) as HTMLInputElement | null
    expect(opcao).not.toBeNull()
    await act(async () => { opcao!.click() })
    await assentar()
}
async function escolher(indice: 0 | 1, nome: string) {
    const input = modal()!.querySelectorAll('input[type=file]')[indice] as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['x'], nome)], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await assentar()
}
const vezes = (texto: string, trecho: string) => texto.split(trecho).length - 1

describe('na página de UM fornecedor', () => {
    it('(A) excluir tabela recusado: Alert NA PÁGINA, ACIMA da lista, com o arquivo e o motivo', async () => {
        respostas[`DELETE ${ROTAS_DO_CATALOGO.tabela('t1')}`] = { status: 409, body: { error: 'Em uso por Marcenaria Silva.' } }
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host.querySelector('tbody')!, 'Excluir'))
        await confirmar('Excluir')

        expect(pedidos).toContain(`DELETE ${ROTAS_DO_CATALOGO.tabela('t1')}`)
        const alerta = host.querySelector('[data-erro-da-tabela]') as HTMLElement
        expect(alerta).not.toBeNull()
        expect(alerta.textContent).toContain(TITULO_DA_TABELA_NAO_EXCLUIDA)
        expect(alerta.textContent).toContain(fraseDoArquivo('tabela-antiga.xlsx', 'Em uso por Marcenaria Silva.'))
        // ACIMA da lista: o Alert vem antes da tabela no documento.
        expect(alerta.compareDocumentPosition(host.querySelector('table')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('(B) editar fornecedor recusado: o erro aparece DENTRO do modal, e reabrir não o traz', async () => {
        respostas[`PATCH ${ROTAS_DO_CATALOGO.fornecedor('f1')}`] = { status: 409, body: { error: 'O nicho novo é de outro modelo.' } }
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Editar fornecedor'))
        await clicar(botao(modal()!, 'Salvar'))

        expect(pedidos).toContain(`PATCH ${ROTAS_DO_CATALOGO.fornecedor('f1')}`)
        expect(modal()!.textContent).toContain(M.TITULO_FORNECEDOR_NAO_SALVO)
        expect(modal()!.textContent).toContain('O nicho novo é de outro modelo.')

        await clicar(botao(modal()!, 'Cancelar'))
        expect(modal()).toBeNull()
        await clicar(botao(host, 'Editar fornecedor'))
        expect(modal()!.textContent).not.toContain(M.TITULO_FORNECEDOR_NAO_SALVO)
    })

    it('(C) excluir fornecedor recusado: o erro aparece DENTRO do modal "Editar fornecedor"', async () => {
        respostas[`DELETE ${ROTAS_DO_CATALOGO.fornecedor('f1')}`] = { status: 409, body: { error: 'Há contas usando tabelas deste fornecedor.' } }
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Editar fornecedor'))
        await clicar(botao(modal()!, 'Excluir fornecedor'))
        await confirmar('Excluir')

        expect(pedidos).toContain(`DELETE ${ROTAS_DO_CATALOGO.fornecedor('f1')}`)
        expect(modal()).not.toBeNull()
        expect(modal()!.textContent).toContain(M.TITULO_FORNECEDOR_NAO_EXCLUIDO)
        expect(modal()!.textContent).toContain('Há contas usando tabelas deste fornecedor.')

        await clicar(botao(modal()!, 'Cancelar'))
        await clicar(botao(host, 'Editar fornecedor'))
        expect(modal()!.textContent).not.toContain(M.TITULO_FORNECEDOR_NAO_EXCLUIDO)
    })

    it('(F) nova tabela recusada DEPOIS dos envios: a frase nomeia a tabela uma vez só', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`] = { status: 200, body: { path: 'f1/arquivo/x', signedUrl: 'https://envio/x' } }
        respostas['PUT https://envio/x'] = { status: 200, body: {} }
        respostas[`POST ${ROTAS_DO_CATALOGO.tabelas}`] = { status: 400, body: { error: 'Os arquivos não pertencem a este fornecedor.' } }
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Nova tabela'))
        await escolher(0, XLSM)
        await escolherFamilia('PVC')
        await escolherCategoria('PERFIL')
        await clicar(botao(modal()!, 'Salvar tabela'))

        expect(pedidos).toContain(`POST ${ROTAS_DO_CATALOGO.tabelas}`)
        expect(modal()!.textContent).toContain(TITULO_DO_ERRO_AO_SALVAR)
        expect(modal()!.textContent).toContain(fraseDaTabela(XLSM, 'Os arquivos não pertencem a este fornecedor.'))
    })
})

describe('no credenciamento', () => {
    async function credenciarComTabela(host: HTMLElement) {
        await clicar(botao(host, 'Credenciar fornecedor'))
        const nome = modal()!.querySelector('input[aria-label="Nome do fornecedor"]') as HTMLInputElement
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(nome, 'Wolf Perfis')
            nome.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await act(async () => {
            modal()!.querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })
        await assentar()
        await clicar(Array.from(document.querySelectorAll('.ant-select-item-option')).find((o) => o.textContent?.includes('Esquadrias')) as HTMLElement)
    }

    it('(D) fornecedor recusado: o erro aparece DENTRO do modal de credenciamento', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.fornecedores}`] = { status: 400, body: { error: 'Escolha o nicho.' } }
        const host = await montar(<PaginaDeFornecedores />)
        await credenciarComTabela(host)
        await clicar(botao(modal()!, 'Salvar credenciamento'))

        expect(pedidos).toContain(`POST ${ROTAS_DO_CATALOGO.fornecedores}`)
        expect(modal()).not.toBeNull()
        expect(modal()!.textContent).toContain(M.TITULO_FORNECEDOR_NAO_CREDENCIADO)
        expect(modal()!.textContent).toContain('Escolha o nicho.')

        await clicar(botao(modal()!, 'Cancelar'))
        await clicar(botao(host, 'Credenciar fornecedor'))
        expect(modal()!.textContent).not.toContain(M.TITULO_FORNECEDOR_NAO_CREDENCIADO)
    })

    it('(E) tabela que falha no credenciamento: o modal FECHA e as falhas ficam num Alert fixo na página, cada arquivo uma vez', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.fornecedores}`] = { status: 201, body: { id: 'f9' } }
        respostas[`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`] = { status: 500, body: { error: 'Não foi possível preparar o envio do arquivo.' } }
        const host = await montar(<PaginaDeFornecedores />)
        await credenciarComTabela(host)
        await clicar(botao(modal()!, 'Adicionar tabela'))
        await escolher(0, XLSM)
        await escolherFamilia('PVC')
        await escolherCategoria('PERFIL')
        await clicar(botao(modal()!, 'Salvar tabela'))
        await clicar(botao(modal()!, 'Salvar credenciamento'))

        expect(pedidos.filter((p) => p === `POST ${ROTAS_DO_CATALOGO.fornecedores}`)).toHaveLength(1)
        expect(modal()).toBeNull()
        const alerta = host.querySelector('[data-credenciado-com-falhas]') as HTMLElement
        expect(alerta).not.toBeNull()
        expect(alerta.textContent).toContain('Wolf Perfis')
        expect(alerta.textContent).toContain(fraseDoArquivo(XLSM, 'Não foi possível preparar o envio do arquivo.'))
        expect(vezes(alerta.textContent ?? '', XLSM)).toBe(1)
        expect(alerta.compareDocumentPosition(host.querySelector('table')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
})
