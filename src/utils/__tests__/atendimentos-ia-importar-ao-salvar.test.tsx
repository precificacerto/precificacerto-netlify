/**
 * PORTÃO — IMPORTAR AO SALVAR (dono do produto, 02/11/2026).
 *
 * "Hoje 'Salvar tabela' grava o cadastro e a importação é um segundo passo manual, e por isso tabela fica com 0 itens sem ninguém perceber
 * (aconteceu com a Reforco_Metalico_-_Wolff.xlsx)." E as respostas dele: redirecionar para a tela de Importação já com o resultado, sem
 * duplicar a apresentação na página do fornecedor; o credenciamento no nicho NÃO importa ao salvar (N tabelas × 90 s); o cartão mostra
 * "não importada" com 0 itens; salvar sem trocar o arquivo não reimporta; se estourar o tempo, a tabela fica salva e a tela mostra "não
 * importada" com o motivo; "nunca deixe a tela em estado de sucesso sem itens gravados".
 *
 *   (1) TABELA NOVA salva → a página do fornecedor LEVA à tela de Importação da tabela criada, com o parâmetro que dispara a importação;
 *   (2) EDIÇÃO com troca de arquivo → o mesmo; EDIÇÃO sem troca (só vigência/família) → fica na página, sem importar;
 *   (3) a recusa do cadastro (POST/PATCH recusado) NÃO leva a lugar nenhum: o erro fica no modal, nada é importado;
 *   (4) a TELA DE IMPORTAÇÃO com `?importar=1` dispara o POST de importar UMA vez, tira o parâmetro da URL, e mostra o resultado como sempre;
 *       sem o parâmetro, não dispara nada;
 *   (5) a recusa da importação automática aparece na tela com o motivo, o cadastro não é tocado (nenhum PATCH/DELETE), e a tela diz
 *       "não importada" — nunca estado de sucesso;
 *   (6) "não importada" vem dos ITENS GRAVADOS (`/conteudo`): 0 itens sem importação é "nunca"; 0 itens com última importação é "sem itens";
 *       o 504 do limite de tempo é recusa com a frase do limite; itens > 0 não mostra o aviso; sem a leitura do conteúdo, nada é dito;
 *   (7) o CARTÃO da tabela com 0 itens diz "não importada" e o atalho leva à Importação; com itens, nada aparece;
 *   (8) o CREDENCIAMENTO no nicho grava as tabelas e NÃO importa nem redireciona.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'
import { FRASE_DO_LIMITE_DA_ROTA } from '@/page-parts/atendimentos-ia/api'
import { PARAMETRO_IMPORTAR_AO_ABRIR, ROTAS_DO_CATALOGO, telaDaImportacao, type FornecedorComTabelas, type TabelaDoFornecedor } from '@/utils/atendimentos-ia-catalogo'
import type { Aviso } from '@/utils/atendimentos-ia-importacao'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const T = '22222222-2222-4222-8222-222222222222'
const NOVA = '33333333-3333-4333-8333-333333333333'
const pushes: string[] = []
const replaces: string[] = []
let consulta: Record<string, string> = { id: 'f1' }
jest.mock('next/router', () => ({
    useRouter: () => ({
        pathname: '/x', asPath: '/', query: consulta,
        replace: async (u: string) => { replaces.push(u); return true },
        push: async (u: string) => { pushes.push(u); return true },
    }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const XLSX = 'Reforco_Metalico_-_Wolff.xlsx'
const tabela = (extra: Partial<TabelaDoFornecedor> = {}): TabelaDoFornecedor => ({
    id: T, fornecedor_id: 'f1', arquivo_nome: 'tabela-antiga.xlsx', arquivo_path: 'f1/arquivo/x-tabela-antiga.xlsx',
    motor_nome: null, motor_path: null, vigencia: null, familia: null, categoria_chave: 'REFORCO', vigente: false,
    criado_em: '2026-11-02T12:00:00Z', arquivo_em: '2026-11-02T12:00:00Z', contas_usando: [], itens: 0, ...extra,
})
const fornecedor = (tabelas: TabelaDoFornecedor[]): FornecedorComTabelas => ({
    id: 'f1', nome: 'Wolf Perfis', nicho_id: 'n1', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: tabelas.length, contas_usando: [],
    categorias_das_tabelas: [], familias_do_perfil: [] as string[], tabelas_da_lista: tabelas,
})
const DADOS = { id: T, fornecedor_id: 'f1', fornecedor_nome: 'Wolf Perfis', arquivo_nome: XLSX, motor_nome: null as string | null, vigencia: null as string | null, categoria_chave: 'REFORCO', categoria_rotulo: 'Reforço' }
const ULTIMA = { id: 'imp-9', tabela_id: T, importado_em: '2026-11-02T15:30:00Z', importado_por: 'u-super', importado_por_nome: 'Cristiano', itens: 0, regras: 0, tipologias: 0, cruzam: 0, nao_cruzam: 0, normalizados: 0, avisos: [] as Aviso[] }

let respostas: Record<string, Array<{ status: number; body: unknown }>> = {}
const pedidos: string[] = []
function responder(chave: string, ...r: Array<{ status: number; body: unknown }>) { respostas[chave] = r }
beforeEach(() => {
    pedidos.length = 0
    pushes.length = 0
    replaces.length = 0
    consulta = { id: 'f1' }
    respostas = {}
    responder(`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`, { status: 200, body: fornecedor([tabela()]) })
    responder(`GET ${ROTAS_DO_CATALOGO.fornecedores}`, { status: 200, body: [] })
    responder(`GET ${ROTAS_DO_CATALOGO.nichos}`, { status: 200, body: [{ id: 'n1', modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true }] })
    responder(`GET ${ROTAS_DO_CATALOGO.familias}`, { status: 200, body: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }] })
    responder(`GET ${ROTAS_DO_CATALOGO.categorias}`, { status: 200, body: [{ chave: 'REFORCO', rotulo: 'Reforço', ordem: 2 }] })
    responder(`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`, { status: 200, body: { path: 'f1/arquivo/x', signedUrl: 'https://envio/x' } })
    responder('PUT https://envio/x', { status: 200, body: {} })
    // a tela de Importação
    responder(`GET ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: DADOS })
    responder(`GET ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: null })
    responder(`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(T)}`, { status: 200, body: { formulas: 0, tipologias: [], itens: 0 } })
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push(chave)
        const fila = respostas[chave]
        const r = fila && fila.length ? (fila.length > 1 ? fila.shift()! : fila[0]) : { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

/* eslint-disable @typescript-eslint/no-require-imports */
const PaginaDoFornecedor = require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType
const PaginaDaImportacao = require('@/pages/super-admin/atendimentos-ia/tabelas/[id]/importacao').default as React.ComponentType
const PaginaDoNicho = require('@/pages/super-admin/atendimentos-ia/catalogo/[nichoId]').default as React.ComponentType
const { TITULO_DA_TABELA_NAO_IMPORTADA, MOTIVO_DA_NAO_IMPORTADA } = require('@/pages/super-admin/atendimentos-ia/tabelas/[id]/importacao') as typeof import('@/pages/super-admin/atendimentos-ia/tabelas/[id]/importacao')
const { CartaoDaTabela, FRASE_DA_TABELA_NAO_IMPORTADA } = require('@/page-parts/atendimentos-ia/cartao-da-tabela.component') as typeof import('@/page-parts/atendimentos-ia/cartao-da-tabela.component')
const { TITULO_DO_ERRO_AO_SALVAR } = require('@/page-parts/atendimentos-ia/tabela-modal.component') as typeof import('@/page-parts/atendimentos-ia/tabela-modal.component')
/* eslint-enable @typescript-eslint/no-require-imports */

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
    while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
    document.body.innerHTML = ''
})
const assentar = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)) })
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
const modal = () => {
    const abertos = Array.from(document.querySelectorAll('.ant-modal-wrap')).filter((w) => (w as HTMLElement).style.display !== 'none')
    return (abertos[abertos.length - 1]?.querySelector('.ant-modal') ?? null) as HTMLElement | null
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '')) as HTMLButtonElement | undefined
async function clicar(b: HTMLElement | undefined) { expect(b).toBeDefined(); await act(async () => { b!.click() }); await assentar() }
async function escolherOpcao(seletor: string) {
    const opcao = modal()!.querySelector(seletor) as HTMLInputElement | null
    expect(opcao).not.toBeNull()
    await act(async () => { opcao!.click() })
    await assentar()
}
async function escolherArquivo(nome: string) {
    const input = modal()!.querySelectorAll('input[type=file]')[0] as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['x'], nome)], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await assentar()
}
const POST_IMPORTAR = `POST ${ROTAS_DO_CATALOGO.importacao(T)}`
const vezes = (chave: string) => pedidos.filter((p) => p === chave).length

describe('o endereço da tela de Importação', () => {
    it('é a tela da tabela; com o disparo, leva o parâmetro — e só ele', () => {
        expect(telaDaImportacao(T)).toBe(`${ROUTES.SUPER_ADMIN_IA_TABELAS}/${T}/importacao`)
        expect(telaDaImportacao(T, true)).toBe(`${ROUTES.SUPER_ADMIN_IA_TABELAS}/${T}/importacao?${PARAMETRO_IMPORTAR_AO_ABRIR}=1`)
        expect(telaDaImportacao(T, false)).toBe(telaDaImportacao(T))
    })
})

describe('(1)(2)(3) a página do fornecedor: salvar com arquivo leva à Importação', () => {
    it('(1) TABELA NOVA salva: vai para a tela de Importação da tabela CRIADA, com o parâmetro do disparo; a importação não roda aqui', async () => {
        responder(`POST ${ROTAS_DO_CATALOGO.tabelas}`, { status: 201, body: { id: NOVA } })
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Nova tabela'))
        await escolherArquivo(XLSX)
        await escolherOpcao('input[data-categoria="REFORCO"]')
        await escolherOpcao('input[data-familia-qualquer-linha]')
        await clicar(botao(modal()!, 'Salvar tabela'))

        expect(pedidos).toContain(`POST ${ROTAS_DO_CATALOGO.tabelas}`)
        expect(pushes).toEqual([telaDaImportacao(NOVA, true)])
        // é a tela da tabela NOVA, não da que já existia; e a página do fornecedor não importa por conta própria
        expect(pushes[0]).toContain(NOVA)
        expect(pedidos.some((p) => p.startsWith('POST') && p.includes('/importar'))).toBe(false)
    })

    it('(2) EDIÇÃO com troca de arquivo: PATCH com o arquivo, e vai para a Importação com o disparo e o arquivo PENDENTE (12/11/2026)', async () => {
        responder(`PATCH ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: { ok: true, arquivo_pendente: { path: 'f1/arquivo/x', nome: 'novo.xlsx' } } })
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Editar'))
        await escolherArquivo(XLSX)
        await clicar(botao(modal()!, 'Salvar tabela'))

        expect(pedidos).toContain(`PATCH ${ROTAS_DO_CATALOGO.tabela(T)}`)
        const corpo = JSON.parse(((globalThis.fetch as jest.Mock).mock.calls.find(([u, i]) => u === ROTAS_DO_CATALOGO.tabela(T) && i?.method === 'PATCH') as [string, { body: string }])[1].body)
        expect(corpo.arquivo_path).toBe('f1/arquivo/x')
        expect(pushes).toEqual([telaDaImportacao(T, true, { path: 'f1/arquivo/x', nome: 'novo.xlsx' })])
    })

    it('(2) EDIÇÃO sem trocar o arquivo (só a vigência): PATCH sem arquivo, fica na página e a lista é relida — nada vai à Importação', async () => {
        responder(`PATCH ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: { ok: true } })
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Editar'))
        const vigencia = modal()!.querySelector('input[aria-label="Vigência"]') as HTMLInputElement
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        await act(async () => { setter.call(vigencia, 'desde 01/11/2026'); vigencia.dispatchEvent(new Event('input', { bubbles: true })) })
        await assentar()
        const lidasAntes = vezes(`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`)
        await clicar(botao(modal()!, 'Salvar tabela'))

        const corpo = JSON.parse(((globalThis.fetch as jest.Mock).mock.calls.find(([u, i]) => u === ROTAS_DO_CATALOGO.tabela(T) && i?.method === 'PATCH') as [string, { body: string }])[1].body)
        expect(corpo.vigencia).toBe('desde 01/11/2026')
        expect(corpo.arquivo_path).toBeUndefined()
        expect(pedidos).not.toContain(`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`)
        expect(pushes).toEqual([])
        expect(vezes(`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`)).toBe(lidasAntes + 1)
    })

    it('(3) o cadastro RECUSADO não leva a lugar nenhum: o erro fica no modal, e nada é importado', async () => {
        responder(`POST ${ROTAS_DO_CATALOGO.tabelas}`, { status: 400, body: { error: 'Os arquivos não pertencem a este fornecedor.' } })
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host, 'Nova tabela'))
        await escolherArquivo(XLSX)
        await escolherOpcao('input[data-categoria="REFORCO"]')
        await escolherOpcao('input[data-familia-qualquer-linha]')
        await clicar(botao(modal()!, 'Salvar tabela'))

        expect(modal()!.textContent).toContain(TITULO_DO_ERRO_AO_SALVAR)
        expect(pushes).toEqual([])
        expect(pedidos.some((p) => p.startsWith('POST') && p.includes('/importar'))).toBe(false)
    })
})

describe('(4)(5)(6) a tela de Importação', () => {
    beforeEach(() => { consulta = { id: T } })

    it('(4) com `?importar=1`: dispara o POST de importar UMA vez, tira o parâmetro da URL e mostra o resultado como o botão mostraria', async () => {
        consulta = { id: T, [PARAMETRO_IMPORTAR_AO_ABRIR]: '1' }
        responder(POST_IMPORTAR, { status: 200, body: { importacao_id: 'imp-1', contagens: { itens: 18 }, avisos: [] } })
        // depois do POST, o banco tem a importação e os 18 itens
        responder(`GET ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: null }, { status: 200, body: { ...ULTIMA, itens: 18 } })
        responder(`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(T)}`, { status: 200, body: { formulas: 0, tipologias: [], itens: 0 } }, { status: 200, body: { formulas: 0, tipologias: [], itens: 18 } })
        const host = await montar(<PaginaDaImportacao />)

        expect(vezes(POST_IMPORTAR)).toBe(1)
        expect(replaces).toEqual([telaDaImportacao(T)])
        expect(host.querySelector('[data-contagem="itens"]')?.textContent).toBe('18')
        expect(host.querySelector('[data-ultima-importacao]')).not.toBeNull()
        expect(host.querySelector('[data-erro-da-importacao]')).toBeNull()
        expect(host.querySelector('[data-nao-importada]')).toBeNull()
        // o botão continua lá, para reimportar quando o usuário quiser — e só ele dispara de novo
        await clicar(botao(host, 'Importar'))
        expect(vezes(POST_IMPORTAR)).toBe(2)
    })

    it('(4) em StrictMode (o projeto liga `reactStrictMode`): os efeitos rodam duas vezes na montagem, e a importação dispara UMA só', async () => {
        consulta = { id: T, [PARAMETRO_IMPORTAR_AO_ABRIR]: '1' }
        responder(POST_IMPORTAR, { status: 200, body: { importacao_id: 'imp-1', contagens: { itens: 18 }, avisos: [] } })
        await montar(<React.StrictMode><PaginaDaImportacao /></React.StrictMode>)
        expect(vezes(POST_IMPORTAR)).toBe(1)
        expect(replaces).toEqual([telaDaImportacao(T)])
    })

    it('(4) sem o parâmetro: nada é disparado ao abrir', async () => {
        responder(POST_IMPORTAR, { status: 200, body: { importacao_id: 'imp-1', contagens: {}, avisos: [] } })
        await montar(<PaginaDaImportacao />)
        expect(vezes(POST_IMPORTAR)).toBe(0)
        expect(replaces).toEqual([])
    })

    it('(5) a importação automática RECUSADA: o motivo aparece, o cadastro não é tocado, e a tela diz "não importada" — nunca sucesso', async () => {
        consulta = { id: T, [PARAMETRO_IMPORTAR_AO_ABRIR]: '1' }
        const motivo = `Arquivo "${XLSX}": não tem a aba "Tabela Wolff". Abas encontradas: "Planilha1". O layout único (abas "CABECALHO" e "ITENS", colunas por nome) também não foi encontrado.`
        responder(POST_IMPORTAR, { status: 422, body: { error: motivo } })
        const host = await montar(<PaginaDaImportacao />)

        expect(vezes(POST_IMPORTAR)).toBe(1)
        expect(host.querySelector('[data-erro-da-importacao]')!.textContent).toContain(motivo)
        const aviso = host.querySelector('[data-nao-importada]')!
        expect(aviso.getAttribute('data-nao-importada')).toBe('recusada')
        expect(aviso.textContent).toContain(TITULO_DA_TABELA_NAO_IMPORTADA)
        expect(aviso.textContent).toContain(MOTIVO_DA_NAO_IMPORTADA.recusada)
        expect(host.querySelector('[data-ultima-importacao]')).toBeNull()
        expect(host.querySelectorAll('[data-contagem]')).toHaveLength(0)
        // nenhuma escrita no cadastro: só o POST de importar e as leituras
        expect(pedidos.filter((p) => !p.startsWith('GET'))).toEqual([POST_IMPORTAR])
        // o estado foi RELIDO do banco depois da recusa
        expect(vezes(`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(T)}`)).toBe(2)
    })

    it('(6) o 504 do limite de tempo é recusa com a frase do limite, e a tela diz "não importada"', async () => {
        consulta = { id: T, [PARAMETRO_IMPORTAR_AO_ABRIR]: '1' }
        responder(POST_IMPORTAR, { status: 504, body: null })
        const host = await montar(<PaginaDaImportacao />)
        expect(host.querySelector('[data-erro-da-importacao]')!.textContent).toContain(FRASE_DO_LIMITE_DA_ROTA)
        expect(host.querySelector('[data-nao-importada]')?.getAttribute('data-nao-importada')).toBe('recusada')
    })

    it('(6) 0 itens sem importação nenhuma: "não importada", motivo "nunca"; o aviso e o botão Importar', async () => {
        const host = await montar(<PaginaDaImportacao />)
        const aviso = host.querySelector('[data-nao-importada]')!
        expect(aviso.getAttribute('data-nao-importada')).toBe('nunca')
        expect(aviso.textContent).toContain(MOTIVO_DA_NAO_IMPORTADA.nunca)
        expect(botao(host, 'Importar')).toBeDefined()
    })

    it('(6) 0 itens COM última importação: "não importada", motivo "sem itens" — o sucesso de antes não vale sem item gravado', async () => {
        responder(`GET ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: ULTIMA })
        const host = await montar(<PaginaDaImportacao />)
        const aviso = host.querySelector('[data-nao-importada]')!
        expect(aviso.getAttribute('data-nao-importada')).toBe('sem-itens')
        expect(aviso.textContent).toContain(MOTIVO_DA_NAO_IMPORTADA.sem_itens)
    })

    it('(6) recusa POR CIMA de uma última importação: o motivo é a recusa (o mais recente), não "sem itens"', async () => {
        consulta = { id: T, [PARAMETRO_IMPORTAR_AO_ABRIR]: '1' }
        responder(`GET ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: ULTIMA })
        responder(POST_IMPORTAR, { status: 422, body: { error: 'Arquivo recusado.' } })
        const host = await montar(<PaginaDaImportacao />)
        const aviso = host.querySelector('[data-nao-importada]')!
        expect(aviso.getAttribute('data-nao-importada')).toBe('recusada')
        expect(aviso.textContent).toContain(MOTIVO_DA_NAO_IMPORTADA.recusada)
        expect(aviso.textContent).not.toContain(MOTIVO_DA_NAO_IMPORTADA.sem_itens)
    })

    it('(6) com itens gravados não há aviso; e sem a contagem do conteúdo (rota de antes) nada é dito — ausente não é zero', async () => {
        responder(`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(T)}`, { status: 200, body: { formulas: 0, tipologias: [], itens: 18 } })
        expect((await montar(<PaginaDaImportacao />)).querySelector('[data-nao-importada]')).toBeNull()
        responder(`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(T)}`, { status: 200, body: { formulas: 0, tipologias: [] } })
        expect((await montar(<PaginaDaImportacao />)).querySelector('[data-nao-importada]')).toBeNull()
    })
})

describe('(7) o cartão da tabela', () => {
    const chamadas: string[] = []
    beforeEach(() => { chamadas.length = 0 })
    const cartao = (t: TabelaDoFornecedor) => montar(
        <CartaoDaTabela tabela={t} familia="Qualquer linha" categoria="Reforço"
            onVigente={() => {}} onImportacao={() => chamadas.push('importacao')} onEditar={() => {}} onRemover={() => {}} />,
    )

    it('com 0 itens: "não importada" logo abaixo do nome, e "Importar agora" leva à Importação', async () => {
        const host = await cartao(tabela({ itens: 0 }))
        const estado = host.querySelector('[data-nao-importada]')!
        expect(estado.textContent).toContain(FRASE_DA_TABELA_NAO_IMPORTADA)
        expect(estado.previousElementSibling!.matches('[data-arquivo-do-cartao]')).toBe(true)
        await clicar(estado.querySelector('[data-importar-agora]') as HTMLElement)
        expect(chamadas).toEqual(['importacao'])
        // as sete linhas continuam as mesmas: o estado não é uma oitava informação
        expect(host.querySelectorAll('[data-linha-do-cartao]')).toHaveLength(7)
    })

    it('com itens gravados: nada aparece', async () => {
        const host = await cartao(tabela({ itens: 18 }))
        expect(host.querySelector('[data-nao-importada]')).toBeNull()
        expect(host.textContent).not.toContain(FRASE_DA_TABELA_NAO_IMPORTADA)
    })

    it('na página do fornecedor, o atalho do cartão vai para a tela de Importação da tabela', async () => {
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(host.querySelector('[data-tabelas-do-fornecedor] [data-importar-agora]') as HTMLElement)
        expect(pushes).toEqual([telaDaImportacao(T)])
    })
})

describe('(8) o credenciamento no nicho NÃO importa ao salvar', () => {
    it('grava o fornecedor e as tabelas, e nenhuma importação é disparada nem a página sai do nicho', async () => {
        consulta = { nichoId: 'n1', aba: 'fornecedores' }
        responder(`GET ${ROTAS_DO_CATALOGO.fornecedores}`, { status: 200, body: [] })
        responder(`POST ${ROTAS_DO_CATALOGO.fornecedores}`, { status: 201, body: { id: 'f-novo' } })
        responder(`POST ${ROTAS_DO_CATALOGO.tabelas}`, { status: 201, body: { id: NOVA } })
        const host = await montar(<PaginaDoNicho />)
        await clicar(botao(host, 'Credenciar fornecedor'))
        const nome = modal()!.querySelector('input[aria-label="Nome do fornecedor"]') as HTMLInputElement | null
        expect(nome).not.toBeNull()
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        await act(async () => { setter.call(nome!, 'Wolff Persianas'); nome!.dispatchEvent(new Event('input', { bubbles: true })) })
        await act(async () => { modal()!.querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        await clicar(Array.from(document.querySelectorAll('.ant-select-item-option')).find((o) => o.textContent?.includes('Esquadrias')) as HTMLElement)
        await clicar(botao(modal()!, 'Adicionar tabela'))
        await escolherArquivo(XLSX)
        await escolherOpcao('input[data-categoria="REFORCO"]')
        await escolherOpcao('input[data-familia-qualquer-linha]')
        await clicar(botao(modal()!, 'Salvar tabela'))
        await clicar(botao(modal()!, 'Salvar credenciamento'))

        expect(pedidos).toContain(`POST ${ROTAS_DO_CATALOGO.tabelas}`)
        expect(pedidos.some((p) => p.startsWith('POST') && p.includes('/importar'))).toBe(false)
        expect(pushes).toEqual([])
    })
})

describe('(9) a TROCA NO MESMO LUGAR na tela de Importação: prévia, confirmação e permissão de encolher (dono do produto, 12/11/2026)', () => {
    const PENDENTE = { path: 'f1/arquivo/y-novo.xlsx', nome: 'novo.xlsx' }
    const PREVIA = { antes: 5, entram: 4, ficam: 3, novos: 1, saem: ['A1', 'B2'], encolhe: true, frase: 'Entram 4, saem 2, ficam 3 (1 código novo).', sha256: 'a'.repeat(64), arquivo_nome: 'novo.xlsx', arquivo_trocado: true }
    const corposDoImportar = () => (globalThis.fetch as jest.Mock).mock.calls
        .filter(([u, i]) => u === ROTAS_DO_CATALOGO.importacao(T) && i?.method === 'POST').map(([, i]) => JSON.parse(i.body))
    beforeEach(() => { consulta = { id: T, [PARAMETRO_IMPORTAR_AO_ABRIR]: '1', arquivo_path: PENDENTE.path, arquivo_nome: PENDENTE.nome } })

    it('abre com o arquivo pendente: pede a prévia LEVANDO o arquivo, e mostra "entram, saem, ficam" com TODOS os códigos que saem — nada gravado', async () => {
        responder(POST_IMPORTAR, { status: 200, body: { previa: PREVIA } })
        const host = await montar(<PaginaDaImportacao />)
        expect(corposDoImportar()).toEqual([{ arquivo_path: PENDENTE.path, arquivo_nome: PENDENTE.nome }])
        expect(replaces).toEqual([telaDaImportacao(T)])
        expect(host.querySelector('[data-frase-da-previa]')?.textContent).toBe(PREVIA.frase)
        expect(host.querySelector('[data-codigos-que-saem]')?.textContent).toContain('A1, B2')
        expect(host.querySelector('[data-previa-da-troca]')?.textContent).toContain('nada foi gravado ainda')
    })

    it('encolhe: "Confirmar a troca" fica desligado até a caixa ser marcada; confirmada, vai com o sha256 da prévia, a permissão e o arquivo', async () => {
        responder(POST_IMPORTAR, { status: 200, body: { previa: PREVIA } }, { status: 200, body: { importacao_id: 'imp-2', previa: PREVIA, contagens: { itens: 4 }, avisos: [] } })
        const host = await montar(<PaginaDaImportacao />)
        const confirmar = () => host.querySelector('[data-confirmar-a-troca]') as HTMLButtonElement
        expect(confirmar().disabled).toBe(true)
        const caixa = host.querySelector('[data-previa-da-troca] input[type=checkbox]') as HTMLInputElement
        await clicar(caixa)
        expect(confirmar().disabled).toBe(false)
        await clicar(confirmar())
        expect(corposDoImportar()[1]).toEqual({ arquivo_path: PENDENTE.path, arquivo_nome: PENDENTE.nome, confirmar: true, sha256: PREVIA.sha256, permitir_encolher: true })
        expect(host.querySelector('[data-previa-da-troca]')).toBeNull()
    })

    it('a troca que não encolhe confirma sem a caixa, e a caixa nem aparece', async () => {
        responder(POST_IMPORTAR, { status: 200, body: { previa: { ...PREVIA, entram: 6, encolhe: false } } }, { status: 200, body: { importacao_id: 'imp-3', contagens: {}, avisos: [] } })
        const host = await montar(<PaginaDaImportacao />)
        expect(host.querySelector('[data-previa-da-troca] input[type=checkbox]')).toBeNull()
        await clicar(host.querySelector('[data-confirmar-a-troca]') as HTMLButtonElement)
        expect(corposDoImportar()[1]).toEqual(expect.objectContaining({ confirmar: true, permitir_encolher: false }))
    })

    it('"Cancelar" não grava nada: nenhum POST a mais, e a prévia sai da tela', async () => {
        responder(POST_IMPORTAR, { status: 200, body: { previa: PREVIA } })
        const host = await montar(<PaginaDaImportacao />)
        await clicar(host.querySelector('[data-cancelar-a-troca]') as HTMLButtonElement)
        expect(corposDoImportar()).toHaveLength(1)
        expect(host.querySelector('[data-previa-da-troca]')).toBeNull()
    })

    it('a confirmação recusada (o arquivo mudou) mostra o motivo e a prévia NOVA, que continua confirmável', async () => {
        const nova = { ...PREVIA, sha256: 'b'.repeat(64), frase: 'Entram 4, saem 1, ficam 3.' }
        responder(POST_IMPORTAR, { status: 200, body: { previa: PREVIA } }, { status: 409, body: { error: 'O arquivo não é mais o da prévia', previa: nova } })
        const host = await montar(<PaginaDaImportacao />)
        await clicar(host.querySelector('[data-previa-da-troca] input[type=checkbox]') as HTMLInputElement)
        await clicar(host.querySelector('[data-confirmar-a-troca]') as HTMLButtonElement)
        expect(host.querySelector('[data-erro-da-importacao]')?.textContent).toContain('O arquivo não é mais o da prévia')
        expect(host.querySelector('[data-frase-da-previa]')?.textContent).toBe(nova.frase)
    })
})
