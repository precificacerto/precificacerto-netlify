/**
 * PORTÃO — a recusa aparece ONDE A AÇÃO ACONTECEU (dono do produto, 20/10/2026).
 *
 * "Mensagem passageira no topo da página não é aviso — é sorte." O `.xlsm` invisível
 * (`atendimentos-ia-formato-do-arquivo.test.tsx`) era um caso de uma classe: a frase da rota ia
 * para um `message.error` no topo da página, longe do clique, e sumia. Este portão cobre as
 * outras aparições da mesma classe na área:
 *
 *   (A) REMOVER TABELA — desde 01/11/2026 a tabela está na soberania do catálogo (migração 20261101000001): o botão da linha abre a
 *       confirmação do ARRASTO, sem DELETE e sem recusa por uso; o aviso da conversa aparece e a recusa da remoção fica DENTRO dela;
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
    ROTAS_DO_CATALOGO,
    fraseDaTabela, fraseDoArquivo, type FornecedorComTabelas,
} from '@/utils/atendimentos-ia-catalogo'
import { ROTA_DA_REMOCAO, rotaDoArrasto, type Arrasto } from '@/utils/atendimentos-ia-remocao'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const push = jest.fn()
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/fornecedores', asPath: '/', query: { id: 'f1', nichoId: 'n1', aba: 'fornecedores' }, replace: () => {}, push }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const XLSM = 'Modelo 2026 - Tabela de Pedidos.xlsm'
const NICHO = { id: 'n1', modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true }
const FORNECEDOR: FornecedorComTabelas = {
    id: 'f1', nome: 'Wolf Perfis', nicho_id: 'n1', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 1, contas_usando: [], categorias_das_tabelas: [], familias_do_perfil: [] as string[],
    tabelas_da_lista: [{
        id: 't1', fornecedor_id: 'f1', arquivo_nome: 'tabela-antiga.xlsx', arquivo_path: 'f1/arquivo/x-tabela-antiga.xlsx',
        motor_nome: 'motor.xlsx', motor_path: 'f1/motor/x-motor.xlsx', vigencia: null, familia: null, categoria_chave: null, vigente: false, criado_em: '2026-10-19T12:00:00Z', arquivo_em: '2026-10-19T12:00:00Z', contas_usando: ['Marcenaria Silva'],
    }],
}

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: string[] = []
beforeEach(() => {
    pedidos.length = 0
    push.mockClear()
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
// o credenciamento mora na aba de fornecedores do NICHO (29/10/2026: o nicho é o container)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PaginaDeFornecedores = require('@/pages/super-admin/atendimentos-ia/catalogo/[nichoId]').default as React.ComponentType
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
    it('(A) remover tabela (01/11/2026): a confirmação do ARRASTO abre com o tipo tabela; sem DELETE; o aviso aparece; a recusa fica DENTRO dela', async () => {
        respostas[`GET ${rotaDoArrasto('tabela', 't1')}`] = { status: 200, body: {
            tipo: 'tabela', chave: 't1', nome: 'Wolf Perfis / tabela-antiga.xlsx (t1)', sai: 2, perde_o_vinculo: 0, assinatura: 'a'.repeat(32), ficam: [], impedimentos: [],
            avisos: [{ tipo: 'conversa_para', tabela_id: '72366020-57c9-489f-9385-397b7fa3dedb', arquivo: 'tabela-antiga.xlsx', empresas: ['Marcenaria Silva'] }],
            passos: [
                { passo: 1, tabela: 'orcamentista_tabela_item', acao: 'sai', rotulo: 'item de preco', quantidade: 1, nomes: ['94733'], mais: 0 },
                { passo: 2, tabela: 'orcamentista_tabela', acao: 'sai', rotulo: 'tabela', quantidade: 1, nomes: ['tabela-antiga.xlsx'], mais: 0 },
            ],
        } }
        respostas[`POST ${ROTA_DA_REMOCAO}`] = { status: 504, body: { error: 'A remoção passou do tempo e foi desfeita inteira: nada foi removido. Tente de novo.' } }
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host.querySelector('[data-tabelas-do-fornecedor]')!, 'Remover'))

        expect(pedidos).toContain(`GET ${rotaDoArrasto('tabela', 't1')}`)
        expect(pedidos.filter((p) => p.startsWith('POST ') || p.startsWith('DELETE '))).toEqual([])
        expect(modal()!.textContent).toContain('Remover a tabela "tabela-antiga.xlsx"?')
        const remocao = modal()!.querySelector('[data-remocao-do-catalogo]') as HTMLElement
        expect(remocao.querySelector('[data-aviso-do-arrasto="conversa_para"]')!.textContent).toContain('A conversa de Marcenaria Silva PARA de funcionar até ser reconfigurada')

        await clicar(remocao.querySelector('[data-confirmo-o-arrasto] input') as HTMLElement)
        await clicar(botao(modal()!, 'Remover'))
        expect(pedidos).toContain(`POST ${ROTA_DA_REMOCAO}`)
        expect(pedidos.filter((p) => p.startsWith('DELETE '))).toEqual([])
        expect(remocao.querySelector('[data-erro-da-remocao]')!.textContent).toContain('nada foi removido')
    })

    it('(A2) tabela removida: a página RECARREGA a lista e fica (remover o fornecedor é que volta)', async () => {
        const arrasto: Arrasto = {
            tipo: 'tabela', chave: 't1', nome: 'Wolf Perfis / tabela-antiga.xlsx (t1)', sai: 1, perde_o_vinculo: 0, assinatura: 'a'.repeat(32), ficam: [], impedimentos: [], avisos: [],
            passos: [{ passo: 1, tabela: 'orcamentista_tabela', acao: 'sai', rotulo: 'tabela', quantidade: 1, nomes: ['tabela-antiga.xlsx'], mais: 0 }],
        }
        respostas[`GET ${rotaDoArrasto('tabela', 't1')}`] = { status: 200, body: arrasto }
        respostas[`POST ${ROTA_DA_REMOCAO}`] = { status: 200, body: arrasto }
        const host = await montar(<PaginaDoFornecedor />)
        const lidas = () => pedidos.filter((p) => p === `GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`).length
        const antes = lidas()
        await clicar(botao(host.querySelector('[data-tabelas-do-fornecedor]')!, 'Remover'))
        await clicar(modal()!.querySelector('[data-confirmo-o-arrasto] input') as HTMLElement)
        await clicar(botao(modal()!, 'Remover'))

        expect(pedidos).toContain(`POST ${ROTA_DA_REMOCAO}`)
        expect(lidas()).toBe(antes + 1)
        expect(push).not.toHaveBeenCalled()
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

    it('(C) remover fornecedor (31/10/2026): a edição fecha e a confirmação do ARRASTO abre; o aviso da conversa aparece; a recusa fica DENTRO dela', async () => {
        respostas[`GET ${rotaDoArrasto('fornecedor', 'f1')}`] = { status: 200, body: {
            tipo: 'fornecedor', chave: 'f1', nome: 'Alumínio Sul', sai: 3, perde_o_vinculo: 0, assinatura: 'e'.repeat(32), ficam: [], impedimentos: [],
            avisos: [{ tipo: 'conversa_para', tabela_id: '72366020-57c9-489f-9385-397b7fa3dedb', arquivo: 'Perfis_de_PVC_-_Wolff.xlsx', empresas: ['Marcenaria Silva'] }],
            passos: [{ passo: 1, tabela: 'orcamentista_fornecedor', acao: 'sai', rotulo: 'fornecedor', quantidade: 1, nomes: ['Alumínio Sul'], mais: 0 }],
        } }
        respostas[`POST ${ROTA_DA_REMOCAO}`] = { status: 504, body: { error: 'A remoção passou do tempo e foi desfeita inteira: nada foi removido. Tente de novo.' } }
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Editar fornecedor'))
        await clicar(botao(modal()!, 'Remover fornecedor'))

        expect(pedidos).toContain(`GET ${rotaDoArrasto('fornecedor', 'f1')}`)
        expect(pedidos.filter((p) => p.startsWith('POST ') || p.startsWith('DELETE '))).toEqual([])
        // a edição fechou: o único modal aberto é a confirmação do arrasto
        expect(Array.from(document.querySelectorAll('.ant-modal-wrap')).filter(visivel)).toHaveLength(1)
        const remocao = modal()!.querySelector('[data-remocao-do-catalogo]') as HTMLElement
        expect(remocao.querySelector('[data-aviso-do-arrasto="conversa_para"]')!.textContent).toContain('A conversa de Marcenaria Silva PARA de funcionar até ser reconfigurada: ela ainda lê o motor pela tabela Perfis_de_PVC_-_Wolff.xlsx (72366020)')

        await clicar(remocao.querySelector('[data-confirmo-o-arrasto] input') as HTMLElement)
        await clicar(botao(modal()!, 'Remover'))
        expect(pedidos).toContain(`POST ${ROTA_DA_REMOCAO}`)
        expect(remocao.querySelector('[data-erro-da-remocao]')!.textContent).toContain('nada foi removido')
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
