/**
 * PORTÃO — o FORMATO do arquivo da tabela e do motor, e a recusa que se VÊ.
 *
 * O defeito (dono do produto, 20/10/2026): no "Editar tabela" de um fornecedor, um `.xlsm` foi
 * escolhido e "Salvar tabela" clicado. O pop-up não fechou e nada apareceu na tela.
 *
 * A RECUSA DA ROTA JÁ EXISTIA E FUNCIONAVA. O defeito não era a recusa — era ela ser INVISÍVEL.
 * A rota respondia 400 "Formato não aceito…", a página jogava a frase num `message.error`
 * passageiro, fora do modal, sem o nome do arquivo, e o modal ficava aberto sem dizer nada. Um
 * pop-up que não fecha e não explica manda o usuário adivinhar.
 *
 * O que este portão fica vermelho:
 *   (1) o `.xlsm` é aceito — na tabela E no motor —, pela regra que a ROTA aplica;
 *   (2) formato fora da lista é recusado pela ROTA, com o motivo;
 *   (3) formato fora da lista é recusado pela TELA, AO ESCOLHER, DENTRO do modal, com o nome do
 *       arquivo e o motivo — e o arquivo recusado não entra;
 *   (4) erro ao salvar aparece DENTRO do modal, com o motivo e o arquivo, em tabela nova e em
 *       edição; o botão não fica preso carregando; cancelar fecha, e reabrir não traz o erro velho.
 *
 * (1) e (2) são a trava que VALE; (3) é o aviso CEDO. As duas existem de propósito: o `accept` do
 * input é sugestão, não trava — quem escolhe "Todos os arquivos" passa. Ver o cabeçalho de
 * `EXTENSOES_ACEITAS` em `src/utils/atendimentos-ia-catalogo.ts`.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import {
    EXTENSOES_ACEITAS, MOTIVO_DO_FORMATO_RECUSADO, ROTAS_DO_CATALOGO,
    extensaoAceita, fraseDoArquivo, lerPedidoDeEnvio, recusada,
    type FornecedorComTabelas,
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
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/fornecedores/[id]', asPath: '/', query: { id: 'f1' }, replace: () => {}, push: () => {} }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const F = '11111111-1111-4111-8111-111111111111'
const XLSM = 'Modelo 2026 - Atualizada - Tabela de Pedidos - Wolff Perfis.xlsm'

const FORNECEDOR: FornecedorComTabelas = {
    id: 'f1', nome: 'Wolf Perfis', nicho_id: 'n1', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 1, contas_usando: [], categorias_das_tabelas: [], familias_do_perfil: [] as string[],
    tabelas_da_lista: [{
        id: 't1', fornecedor_id: 'f1', arquivo_nome: 'tabela-antiga.xlsx', arquivo_path: 'f1/arquivo/x-tabela-antiga.xlsx',
        motor_nome: 'motor.xlsx', motor_path: 'f1/motor/x-motor.xlsx', vigencia: null, familia: null, categoria_chave: null, vigente: false, criado_em: '2026-10-19T12:00:00Z', arquivo_em: '2026-10-19T12:00:00Z', contas_usando: [],
    }],
}

/** As respostas por `MÉTODO url`. */
let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: string[] = []
beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`]: { status: 200, body: FORNECEDOR },
        [`GET ${ROTAS_DO_CATALOGO.nichos}`]: { status: 200, body: [{ id: 'n1', modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true }] },
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
const Pagina = require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TabelaModal, TITULO_DO_ERRO_AO_SALVAR } = require('@/page-parts/atendimentos-ia/tabela-modal.component') as typeof import('@/page-parts/atendimentos-ia/tabela-modal.component')

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)) })
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

/** O modal aberto — o último, porque o antd deixa os fechados no `body`, escondidos. */
const modal = () => {
    const abertos = Array.from(document.querySelectorAll('.ant-modal-wrap')).filter((w) => (w as HTMLElement).style.display !== 'none')
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
/** Escolhe um arquivo como o diálogo do sistema faria — inclusive com "Todos os arquivos". */
async function escolher(indice: 0 | 1, nome: string) {
    const input = modal()!.querySelectorAll('input[type=file]')[indice] as HTMLInputElement
    const arquivo = new File(['x'], nome)
    Object.defineProperty(input, 'files', { value: [arquivo], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await assentar()
}
const escolhido = (rotulo: string) => modal()!.querySelector(`[data-arquivo="${rotulo}"]`)?.textContent ?? ''

describe('(1)(2) a regra que a ROTA aplica — a que vale', () => {
    it.each([['arquivo' as const], ['motor' as const]])('o `.xlsm` é aceito no %s, em qualquer caixa', (tipo) => {
        for (const nome of [XLSM, 'TABELA.XLSM']) {
            const l = lerPedidoDeEnvio({ fornecedor_id: F, tipo, nome })
            expect(recusada(l) ? l.erro : 'aceito').toBe('aceito')
        }
        expect(EXTENSOES_ACEITAS).toContain('.xlsm')
    })

    it('formato fora da lista é recusado, com o motivo — e o motivo cita a lista que vale', () => {
        const l = lerPedidoDeEnvio({ fornecedor_id: F, tipo: 'arquivo', nome: 'proposta.docx' })
        expect(recusada(l) ? l.erro : 'aceito').toBe(MOTIVO_DO_FORMATO_RECUSADO)
        expect(MOTIVO_DO_FORMATO_RECUSADO).toContain(EXTENSOES_ACEITAS.join(', '))
        expect(extensaoAceita('proposta.docx')).toBe(false)
    })
})

describe('(3) a TELA recusa ao escolher, dentro do modal, com o nome e o motivo', () => {
    it('um `.docx` não entra, e o modal diz qual arquivo e por quê; um `.xlsm` entra', async () => {
        const salvos: unknown[] = []
        await montar(<TabelaModal aberto familias={[]} categorias={[]} titulo="Editar tabela" atual={{ arquivo_nome: 'tabela-antiga.xlsx', vigencia: null, familia: null, categoria_chave: null }} onCancelar={() => {}} onSalvar={(t) => { salvos.push(t) }} />)

        await escolher(0, 'proposta.docx')
        expect(modal()!.textContent).toContain(fraseDoArquivo('proposta.docx', MOTIVO_DO_FORMATO_RECUSADO))
        expect(escolhido('Arquivo da tabela')).not.toContain('proposta.docx')
        expect(escolhido('Arquivo da tabela')).toContain('tabela-antiga.xlsx')

        // O contraste: o `.xlsm` entra, e a recusa anterior some — sem isto, uma tela que recusasse
        // TUDO passaria o caso acima (`teste-que-nao-exercita.md`, variante 2).
        await escolher(0, XLSM)
        expect(escolhido('Arquivo da tabela')).toContain(XLSM)
        expect(modal()!.textContent).not.toContain(fraseDoArquivo('proposta.docx', MOTIVO_DO_FORMATO_RECUSADO))

        // NÃO HÁ campo de arquivo do motor no modal (28/10/2026): o motor entra pela etapa da família
        expect(modal()!.querySelectorAll('input[type="file"]')).toHaveLength(1)
        expect(modal()!.textContent).not.toContain('Arquivo do motor')
    })
})

describe('(4) o erro de salvar aparece DENTRO do modal, e o modal não fica preso', () => {
    it('EDIÇÃO: a rota de envio recusa — o modal mostra o motivo e o arquivo, e o botão volta', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`] = { status: 404, body: { error: 'Fornecedor não encontrado.' } }
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Editar'))
        await escolher(0, XLSM)
        await clicar(botao(modal()!, 'Salvar tabela'))

        expect(pedidos).toContain(`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`)
        expect(modal()).not.toBeNull()
        expect(modal()!.textContent).toContain(TITULO_DO_ERRO_AO_SALVAR)
        expect(modal()!.textContent).toContain(fraseDoArquivo(XLSM, 'Fornecedor não encontrado.'))
        expect(botao(modal()!, 'Salvar tabela')!.className).not.toContain('ant-btn-loading')

        // Cancelar fecha; reabrir NÃO traz o erro da tentativa anterior.
        await clicar(botao(modal()!, 'Cancelar'))
        expect(modal()).toBeNull()
        await clicar(botao(host, 'Editar'))
        expect(modal()!.textContent).not.toContain(TITULO_DO_ERRO_AO_SALVAR)
    })

    it('EDIÇÃO: os arquivos sobem e a gravação é recusada — o motivo da rota aparece no modal', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`] = { status: 200, body: { path: 'f1/arquivo/x.xlsm', signedUrl: 'https://envio/x' } }
        respostas['PUT https://envio/x'] = { status: 200, body: {} }
        respostas[`PATCH ${ROTAS_DO_CATALOGO.tabela('t1')}`] = { status: 409, body: { error: 'A tabela está em uso e não pode ser trocada agora.' } }
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Editar'))
        await escolher(0, XLSM)
        await clicar(botao(modal()!, 'Salvar tabela'))

        expect(pedidos).toContain(`PATCH ${ROTAS_DO_CATALOGO.tabela('t1')}`)
        expect(modal()!.textContent).toContain('A tabela está em uso e não pode ser trocada agora.')
    })

    it('NOVA TABELA: a recusa aparece no modal, com o arquivo', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`] = { status: 500, body: { error: 'Não foi possível preparar o envio do arquivo.' } }
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Nova tabela'))
        await escolher(0, XLSM)
        await escolherFamilia('PVC')
        await escolherCategoria('PERFIL')
        await clicar(botao(modal()!, 'Salvar tabela'))

        expect(modal()).not.toBeNull()
        expect(modal()!.textContent).toContain(TITULO_DO_ERRO_AO_SALVAR)
        expect(modal()!.textContent).toContain(fraseDoArquivo(XLSM, 'Não foi possível preparar o envio do arquivo.'))
    })
})
