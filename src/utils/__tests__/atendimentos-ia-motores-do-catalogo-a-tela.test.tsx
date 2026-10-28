/**
 * PORTÃO — o CATÁLOGO DE MOTORES na tela (`motores-do-catalogo.component.tsx`, em "Fornecedores e tabelas"; dono do produto, 28/10/2026,
 * migração 20261028000001).
 *
 * POR QUÊ: o motor é GLOBAL e COMPARTILHADO — "empresas diferentes podem usar o mesmo motor" —, com fornecedor + categoria + tipo, e mora
 * num catálogo abaixo dos fornecedores. A etapa da família-instância só o seleciona; subir o arquivo é daqui, não da página da conta.
 *
 * O que este portão fica vermelho:
 *   (1) a lista: fornecedor, categoria e tipo pelo NOME, arquivo, tipologias e QUEM USA (empresa · família · etapa); os arquivados só com o
 *       interruptor; falha de leitura é ERRO, nunca "nenhum motor";
 *   (2) arquivar: o motor em uso tem o botão travado (com o porquê); o livre chama SÓ a rota de arquivar com o id, e relê; a recusa da rota
 *       aparece no cartão, com a frase dela;
 *   (3) "Novo motor": fornecedor → categoria → tipo → arquivo, cada um liberando o seguinte; criar faz, NESTA ordem, a URL assinada na pasta
 *       DO FORNECEDOR (tipo motor), os bytes, o POST do catálogo com os cinco campos — e relê; a recusa aparece DENTRO do modal;
 *   (4) a página: o catálogo fica logo abaixo dos fornecedores, e o cartão "Etapas da família" saiu.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROTAS_DO_CATALOGO, type FornecedorDaLista } from '@/utils/atendimentos-ia-catalogo'
import { ROTAS_DOS_MOTORES, type MotorDoCatalogo } from '@/utils/atendimentos-ia-catalogo-de-motores'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// a primeira montagem carrega o antd inteiro: no CI ela passa dos 5 s padrão
jest.setTimeout(20000)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const W = '00000000-0000-4000-8000-0000000000f1'
const R = '00000000-0000-4000-8000-0000000000f2'
const M_WOLF = '00000000-0000-4000-8000-0000000000a1'
const M_LIVRE = '00000000-0000-4000-8000-0000000000a2'
const M_ARQ = '00000000-0000-4000-8000-0000000000a3'
const PATH = `${W}/motor/u1-Motor-persiana.xlsx`
const URL_ASSINADA = `https://storage.exemplo/${PATH}?token=t`
const FORNECEDORES: FornecedorDaLista[] = [
    { id: W, nome: 'Wolf', nicho_id: 'n', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO' as const, tabelas: 2, contas_usando: [] },
    { id: R, nome: 'Roller Star', nicho_id: 'n', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO' as const, tabelas: 1, contas_usando: [] },
]
const CATEGORIAS = [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'PERSIANAS', rotulo: 'Persianas', ordem: 2 }]
const FAMILIAS = [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }]
const motor = (id: string, f: Partial<MotorDoCatalogo>): MotorDoCatalogo => ({
    id, familia: 'PVC', fornecedor_id: W, fornecedor: 'Wolf', categoria: 'PERFIL', arquivo_nome: `${id}.xlsx`, criado_em: '2026-10-28', arquivado_em: null, tipologias: 0, usos: [], ...f,
})
const MOTORES = [
    motor(M_WOLF, { arquivo_nome: 'wolff.xlsm', tipologias: 164, usos: [
        { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC', etapa: 1, rotulo: 'Apanhado' },
        { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC', etapa: 3, rotulo: 'Barras' },
    ] }),
    motor(M_LIVRE, { fornecedor_id: R, fornecedor: 'Roller Star', categoria: 'PERSIANAS', familia: 'ALUMINIO', arquivo_nome: 'roller.xlsx', tipologias: 12 }),
    motor(M_ARQ, { arquivo_nome: 'velho.xlsx', arquivado_em: '2026-10-01' }),
]

type Resposta = { status: number; body: unknown }
let respostas: Record<string, Resposta[]> = {}
const pedidos: Array<{ chave: string; corpo: unknown; headers?: Record<string, string> }> = []

beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${ROTAS_DOS_MOTORES.lista}`]: [{ status: 200, body: { motores: MOTORES } }],
        [`POST ${ROTAS_DOS_MOTORES.arquivar}`]: [{ status: 200, body: { depois: {} } }],
        [`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`]: [{ status: 200, body: { path: PATH, signedUrl: URL_ASSINADA } }],
        [`PUT ${URL_ASSINADA}`]: [{ status: 200, body: {} }],
        [`POST ${ROTAS_DOS_MOTORES.lista}`]: [{ status: 200, body: { motor_id: 'novo', importacao_id: 'i', regras: 30, tipologias: 4, detalhes: 4, avisos: [] } }],
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body, headers: init?.headers })
        const fila = respostas[chave]
        const r = fila && fila.length > 0 ? (fila.length > 1 ? fila.shift()! : fila[0]) : { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Componente = () => require('@/page-parts/atendimentos-ia/motores-do-catalogo.component') as {
    MotoresDoCatalogo: React.ComponentType<{ fornecedores: typeof FORNECEDORES; categorias: typeof CATEGORIAS; familias: typeof FAMILIAS }>
    SEM_MOTOR_NO_CATALOGO: string
}

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(elemento?: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(elemento ?? React.createElement(Componente().MotoresDoCatalogo, { fornecedores: FORNECEDORES, categorias: CATEGORIAS, familias: FAMILIAS })) })
    await assentar()
    return host
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '') || b.getAttribute('aria-label') === texto) as HTMLButtonElement | undefined
async function clicar(el: Element | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => { (el as HTMLElement).click() })
    await assentar()
}
const linha = (host: ParentNode, id: string) => host.querySelector(`[data-motor="${id}"]`) as HTMLElement | null
const chaves = () => pedidos.map((p) => p.chave)
const modal = () => document.body.querySelector('[data-modal-do-motor]') as HTMLElement
const combo = (rotulo: string) => document.body.querySelector(`[aria-label="${rotulo}"]`)!.closest('.ant-select') as HTMLElement
/** Abre o combo pelo rótulo e escolhe a opção pelo texto, no dropdown que está aberto. */
async function escolher(rotulo: string, texto: string) {
    await act(async () => { combo(rotulo).querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await assentar()
    const opcoes = Array.from(document.body.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')) as HTMLElement[]
    await clicar(opcoes.find((o) => o.textContent === texto))
}
async function anexar(nome = 'Motor persiana.xlsx') {
    const input = modal().querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    const arquivo = new File([new Uint8Array([80, 75, 3, 4])], nome)
    await act(async () => {
        Object.defineProperty(input, 'files', { value: [arquivo], configurable: true })
        input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await assentar()
}
const criar = () => Array.from(document.body.querySelectorAll('.ant-modal-footer button')).find((b) => b.textContent?.includes('Criar motor')) as HTMLButtonElement
async function preencherTudo() {
    await escolher('Fornecedor do motor', 'Wolf')
    await escolher('Categoria do motor', 'Persianas')
    await escolher('Tipo do motor', 'PVC')
    await anexar()
}

describe('(1) a lista do catálogo', () => {
    it('cada motor com fornecedor, categoria e tipo pelo NOME, arquivo, tipologias e quem usa (empresa · família · etapa)', async () => {
        const host = await montar()
        expect(pedidos[0].chave).toBe(`GET ${ROTAS_DOS_MOTORES.lista}`)
        const wolf = linha(host, M_WOLF)!.textContent!
        expect(wolf).toContain('Wolf')
        expect(wolf).toContain('Perfil')
        expect(wolf).toContain('PVC')
        expect(wolf).toContain('wolff.xlsm')
        expect(wolf).toContain('164')
        expect(Array.from(linha(host, M_WOLF)!.querySelectorAll('[data-usos] li')).map((l) => l.textContent)).toEqual([
            'Esquadrias De Paula Ltda · Esquadrias de PVC · etapa 1 (Apanhado)', 'Esquadrias De Paula Ltda · Esquadrias de PVC · etapa 3 (Barras)',
        ])
        const livre = linha(host, M_LIVRE)!
        expect(livre.textContent).toContain('Persianas')
        expect(livre.textContent).toContain('Alumínio')
        expect(livre.querySelector('[data-sem-uso]')?.textContent).toBe('Nenhuma etapa aponta este motor.')
    })

    it('o arquivado só aparece com o interruptor, marcado como arquivado e sem botão de arquivar', async () => {
        const host = await montar()
        expect(linha(host, M_ARQ)).toBeNull()
        await clicar(host.querySelector('[aria-label="Mostrar os arquivados"]'))
        expect(linha(host, M_ARQ)!.textContent).toContain('arquivado')
        expect(botao(linha(host, M_ARQ)!, 'Arquivar velho.xlsx')).toBeUndefined()
    })

    it('500 na leitura: ERRO com a frase da rota — nunca "nenhum motor"', async () => {
        respostas[`GET ${ROTAS_DOS_MOTORES.lista}`] = [{ status: 500, body: { error: 'Não foi possível ler o catálogo de motores.' } }]
        const host = await montar()
        expect(host.querySelector('[data-erro-do-catalogo]')?.textContent).toContain('Não foi possível ler o catálogo de motores.')
        expect(host.textContent).not.toContain(Componente().SEM_MOTOR_NO_CATALOGO)
    })
})

describe('(2) arquivar', () => {
    it('o motor que etapas apontam tem o botão TRAVADO, e o porquê no título', async () => {
        const host = await montar()
        const b = botao(linha(host, M_WOLF)!, 'Arquivar wolff.xlsm')!
        expect(b.disabled).toBe(true)
        expect(b.getAttribute('title')).toBe('2 etapas apontam este motor: aponte as etapas para outro antes de arquivar.')
    })

    it('o livre: chama SÓ a rota de arquivar com o id, e relê o catálogo', async () => {
        const host = await montar()
        const n = pedidos.length
        await clicar(botao(linha(host, M_LIVRE)!, 'Arquivar roller.xlsx'))
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.arquivar}`, `GET ${ROTAS_DOS_MOTORES.lista}`])
        expect(pedidos[n].corpo).toEqual({ motor_id: M_LIVRE })
    })

    it('a recusa da rota aparece no cartão com a frase dela, e o catálogo não é relido', async () => {
        const frase = 'o motor e o da etapa 1 ("Apanhado") da familia "Esquadrias de PVC" da empresa Esquadrias De Paula Ltda: aponte a etapa para outro motor antes de arquivar'
        respostas[`POST ${ROTAS_DOS_MOTORES.arquivar}`] = [{ status: 400, body: { error: frase } }]
        const host = await montar()
        const n = pedidos.length
        await clicar(botao(linha(host, M_LIVRE)!, 'Arquivar roller.xlsx'))
        expect(host.querySelector('[data-erro-ao-arquivar]')?.textContent).toContain(frase)
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.arquivar}`])
    })
})

describe('(3) "Novo motor": fornecedor → categoria → tipo → arquivo', () => {
    it('cada campo libera o seguinte, e o criar só liga com os quatro', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        expect(combo('Categoria do motor').className).toContain('ant-select-disabled')
        expect(combo('Tipo do motor').className).toContain('ant-select-disabled')
        expect(criar().disabled).toBe(true)
        await escolher('Fornecedor do motor', 'Wolf')
        expect(combo('Categoria do motor').className).not.toContain('ant-select-disabled')
        expect(combo('Tipo do motor').className).toContain('ant-select-disabled')
        await escolher('Categoria do motor', 'Persianas')
        await escolher('Tipo do motor', 'PVC')
        expect(criar().disabled).toBe(true)
        await anexar()
        expect(criar().disabled).toBe(false)
    })

    it('o fornecedor oferece TODOS os credenciados, em ordem alfabética', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await act(async () => { combo('Fornecedor do motor').querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        const opcoes = Array.from(document.body.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')).map((o) => o.textContent)
        expect(opcoes).toEqual(['Roller Star', 'Wolf'])
    })

    it('criar: URL na pasta DO FORNECEDOR (tipo motor), os bytes, o POST do catálogo com os cinco campos — nessa ordem — e relê', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await preencherTudo()
        const n = pedidos.length
        await clicar(criar())
        expect(chaves().slice(n)).toEqual([
            `POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`, `PUT ${URL_ASSINADA}`, `POST ${ROTAS_DOS_MOTORES.lista}`, `GET ${ROTAS_DOS_MOTORES.lista}`,
        ])
        expect(pedidos[n].corpo).toEqual({ fornecedor_id: W, tipo: 'motor', nome: 'Motor persiana.xlsx' })
        expect(pedidos[n + 1].headers).toEqual({ 'x-upsert': 'false' })
        expect(pedidos[n + 2].corpo).toEqual({ fornecedor_id: W, categoria: 'PERSIANAS', familia: 'PVC', path: PATH, nome: 'Motor persiana.xlsx' })
    })

    it('a recusa da rota aparece DENTRO do modal, com a frase dela, e o catálogo não é relido', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.lista}`] = [{ status: 422, body: { error: 'Motor persiana.xlsx: falta a aba "Motor por barra".' } }]
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await preencherTudo()
        const n = pedidos.length
        await clicar(criar())
        expect(modal().querySelector('[data-erro-ao-criar-motor]')?.textContent).toContain('falta a aba "Motor por barra"')
        expect(chaves().slice(n)).not.toContain(`GET ${ROTAS_DOS_MOTORES.lista}`)
        expect(host.querySelector('[data-erro-ao-arquivar]')).toBeNull()
    })

    it('a URL recusada: nada de bytes nem de POST do catálogo, e a frase nomeia o arquivo', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`] = [{ status: 404, body: { error: 'Fornecedor não encontrado.' } }]
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await preencherTudo()
        const n = pedidos.length
        await clicar(criar())
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`])
        expect(modal().querySelector('[data-erro-ao-criar-motor]')?.textContent).toContain('Motor persiana.xlsx')
        expect(modal().querySelector('[data-erro-ao-criar-motor]')?.textContent).toContain('Fornecedor não encontrado.')
    })
})

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { is_super_admin: true } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children) }))

describe('(4) a página de Fornecedores e tabelas', () => {
    it('o catálogo fica LOGO ABAIXO dos fornecedores (antes dos nichos), e o cartão "Etapas da família" saiu', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.fornecedores}`] = [{ status: 200, body: FORNECEDORES }]
        respostas[`GET ${ROTAS_DO_CATALOGO.nichos}`] = [{ status: 200, body: [] }]
        respostas[`GET ${ROTAS_DO_CATALOGO.familias}`] = [{ status: 200, body: FAMILIAS }]
        respostas[`GET ${ROTAS_DO_CATALOGO.categorias}`] = [{ status: 200, body: CATEGORIAS }]
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Pagina = require('@/pages/super-admin/atendimentos-ia/fornecedores/index').default as React.ComponentType
        const host = await montar(React.createElement(Pagina))
        const catalogo = host.querySelector('[data-catalogo-de-motores]') as HTMLElement
        expect(catalogo).toBeTruthy()
        expect(catalogo.id).toBe('motores')
        const tabela = host.querySelector('.pc-card--table') as HTMLElement
        const nichos = Array.from(host.querySelectorAll('.ant-card-head-title')).find((t) => /nicho/i.test(t.textContent ?? '')) as HTMLElement
        expect(tabela.compareDocumentPosition(catalogo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(catalogo.compareDocumentPosition(nichos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(host.querySelector('[data-etapas-card]')).toBeNull()
        expect(Array.from(host.querySelectorAll('.ant-card-head-title')).map((t) => t.textContent)).not.toContain('Etapas da família')
    })
})
