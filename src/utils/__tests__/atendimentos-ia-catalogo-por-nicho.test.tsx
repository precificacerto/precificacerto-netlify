/**
 * PORTÃO — O NICHO É O CONTAINER (dono do produto, 29/10/2026, opção A): o Catálogo lista os nichos, e cada um abre a sua página
 * (`catalogo/[nichoId].tsx`) com três abas — FAMÍLIAS → FORNECEDORES → MOTORES. A família fica GLOBAL, com aviso (dívida registrada).
 *
 * O que este portão fica vermelho:
 *   (1) o Catálogo: cada nicho é um LINK para a página dele, com a contagem de fornecedores; excluir é botão à parte;
 *   (2) a página do nicho: as três abas, nesta ordem; a aba vem da URL (`?aba=`), e o que não é aba vira a primeira;
 *   (3) o que é do nicho: só os fornecedores dele; só os motores desses fornecedores; o credenciamento já vem com este nicho;
 *   (4) a família é GLOBAL e a aba diz isso;
 *   (5) nicho que não existe é "Nicho não encontrado.", nunca a página vazia; falha de leitura é ERRO;
 *   (6) os links que levam ao nicho: o "voltar" do fornecedor e o "cadastrar motor no catálogo" da etapa.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROUTES } from '@/constants/routes'
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

const ESQ = '00000000-0000-4000-8000-0000000000e1'
const MOV = '00000000-0000-4000-8000-0000000000e2'
const W = '00000000-0000-4000-8000-0000000000f1'
const OUTRO = '00000000-0000-4000-8000-0000000000f9'
const NICHOS = [
    { id: ESQ, modelo: 'FABRICACAO' as const, nome: 'Esquadrias', ativo: true },
    { id: MOV, modelo: 'FABRICACAO' as const, nome: 'Móveis personalizados', ativo: true },
]
const fornecedor = (id: string, nome: string, nichoId: string, nichoNome: string): FornecedorDaLista => ({
    id, nome, nicho_id: nichoId, nicho_nome: nichoNome, modelo: 'FABRICACAO', tabelas: 1, contas_usando: [], categorias_das_tabelas: ['PERFIL'], familias_do_perfil: ['PVC'],
})
const VECA = '00000000-0000-4000-8000-0000000000f3'
const FORNECEDORES = [fornecedor(W, 'Wolf Perfis', ESQ, 'Esquadrias'), fornecedor(VECA, 'Veca Perfis', ESQ, 'Esquadrias'), fornecedor(OUTRO, 'Marcenaria Alfa', MOV, 'Móveis personalizados')]
const motor = (id: string, fornecedorId: string, nome: string): MotorDoCatalogo => ({
    id, familia: 'PVC', fornecedor_id: fornecedorId, fornecedor: nome, categoria: 'PERFIL', arquivo_nome: `${id}.xlsx`, criado_em: '2026-10-28', arquivado_em: null, tipologias: 1, usos: [],
})
const M_ESQ = '00000000-0000-4000-8000-0000000000a1'
const M_MOV = '00000000-0000-4000-8000-0000000000a2'

type Resposta = { status: number; body: unknown }
let respostas: Record<string, Resposta> = {}
const pedidos: string[] = []
const mockRoteador = { query: {} as Record<string, string>, push: jest.fn(), replace: jest.fn() }
jest.mock('next/router', () => ({ useRouter: () => mockRoteador }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { is_super_admin: true } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ title, children }: { title: string; children: React.ReactNode }) => React.createElement('div', { 'data-titulo': title }, children) }))

beforeEach(() => {
    pedidos.length = 0
    mockRoteador.query = {}
    mockRoteador.push.mockReset()
    mockRoteador.replace.mockReset()
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.nichos}`]: { status: 200, body: NICHOS },
        [`GET ${ROTAS_DO_CATALOGO.fornecedores}`]: { status: 200, body: FORNECEDORES },
        [`GET ${ROTAS_DO_CATALOGO.familias}`]: { status: 200, body: [{ chave: 'PVC', rotulo: 'PVC Wolf', ordem: 1, ramificacoes: ['PERFIL'] }] },
        [`GET ${ROTAS_DO_CATALOGO.categorias}`]: { status: 200, body: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }] },
        [`GET ${ROTAS_DOS_MOTORES.lista}`]: { status: 200, body: { motores: [motor(M_ESQ, W, 'Wolf Perfis'), motor(M_MOV, OUTRO, 'Marcenaria Alfa')] } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push(chave)
        const r = respostas[chave] ?? { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

/* eslint-disable @typescript-eslint/no-require-imports */
const Catalogo = () => require('@/pages/super-admin/atendimentos-ia/fornecedores/index').default as React.ComponentType
const PaginaDoNicho = () => require('@/pages/super-admin/atendimentos-ia/catalogo/[nichoId]').default as React.ComponentType
const C = () => require('@/utils/atendimentos-ia-catalogo') as typeof import('@/utils/atendimentos-ia-catalogo')
const E = () => require('@/page-parts/atendimentos-ia/etapas-da-familia.component') as typeof import('@/page-parts/atendimentos-ia/etapas-da-familia.component')
/* eslint-enable @typescript-eslint/no-require-imports */

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(Pagina: React.ComponentType): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(Pagina)) })
    await assentar()
    return host
}
const abas = (host: ParentNode) => Array.from(host.querySelectorAll('.ant-tabs-tab')).map((t) => t.textContent)
const abaAtiva = (host: ParentNode) => host.querySelector('.ant-tabs-tab-active')?.textContent

describe('(1) o Catálogo: os nichos, cada um uma porta', () => {
    it('cada nicho é um LINK para a página dele, com a contagem de fornecedores; famílias, fornecedores e motores NÃO estão aqui', async () => {
        const host = await montar(Catalogo())
        const esq = host.querySelector(`[data-nicho="${ESQ}"]`) as HTMLElement
        expect(esq.querySelector('a[data-abrir-nicho]')!.getAttribute('href')).toBe(`${ROUTES.SUPER_ADMIN_IA_CATALOGO}/${ESQ}`)
        expect(esq.textContent).toContain('Esquadrias')
        expect(esq.textContent).toContain('(2 fornecedores)')
        expect(host.querySelector(`[data-nicho="${MOV}"]`)!.textContent).toContain('(1 fornecedor)')
        expect(host.querySelector('[data-secao-fornecedores]')).toBeNull()
        expect(host.querySelector('[data-catalogo-de-motores]')).toBeNull()
        expect(pedidos).not.toContain(`GET ${ROTAS_DOS_MOTORES.lista}`)
    })

    it('a contagem: nenhum, um, vários', () => {
        const N = require('@/page-parts/atendimentos-ia/nichos.component') as typeof import('@/page-parts/atendimentos-ia/nichos.component') // eslint-disable-line @typescript-eslint/no-require-imports
        expect([0, 1, 63].map(N.fraseDosFornecedoresDoNicho)).toEqual(['nenhum fornecedor', '1 fornecedor', '63 fornecedores'])
    })

    it('excluir é um botão À PARTE, com confirmação: o link do nome não exclui', async () => {
        const host = await montar(Catalogo())
        const esq = host.querySelector(`[data-nicho="${ESQ}"]`) as HTMLElement
        expect(esq.querySelector('a[data-abrir-nicho] [data-excluir-nicho]')).toBeNull()
        expect(esq.querySelector('[data-excluir-nicho]')!.getAttribute('aria-label')).toBe('Excluir o nicho Esquadrias')
    })
})

describe('(2) a página do nicho: três abas, nesta ordem, e a aba vem da URL', () => {
    it('FAMÍLIAS → FORNECEDORES → MOTORES; sem `aba`, a primeira', async () => {
        mockRoteador.query = { nichoId: ESQ }
        const host = await montar(PaginaDoNicho())
        expect(abas(host)).toEqual(['Famílias', 'Fornecedores', 'Motores'])
        expect(abaAtiva(host)).toBe('Famílias')
        expect(host.querySelector('[data-titulo]')!.getAttribute('data-titulo')).toBe('Esquadrias')
    })

    it('`?aba=motores` abre nos motores; o que não é aba vira a primeira', async () => {
        mockRoteador.query = { nichoId: ESQ, aba: 'motores' }
        let host = await montar(PaginaDoNicho())
        expect(abaAtiva(host)).toBe('Motores')
        while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }
        mockRoteador.query = { nichoId: ESQ, aba: 'qualquer' }
        host = await montar(PaginaDoNicho())
        expect(abaAtiva(host)).toBe('Famílias')
        expect([C().abaDoNicho('fornecedores'), C().abaDoNicho(undefined), C().abaDoNicho(['motores'])]).toEqual(['fornecedores', 'familias', 'familias'])
    })

    it('trocar de aba troca a URL (sem recarregar a página)', async () => {
        mockRoteador.query = { nichoId: ESQ }
        const host = await montar(PaginaDoNicho())
        await act(async () => { (Array.from(host.querySelectorAll('.ant-tabs-tab')).find((t) => t.textContent === 'Motores') as HTMLElement).click() })
        expect(mockRoteador.replace).toHaveBeenCalledWith(`${ROUTES.SUPER_ADMIN_IA_CATALOGO}/${ESQ}?aba=motores`, undefined, { shallow: true })
    })
})

describe('(3) o que é do nicho', () => {
    it('FORNECEDORES: só os do nicho — a Marcenaria Alfa, de Móveis, não aparece em Esquadrias', async () => {
        mockRoteador.query = { nichoId: ESQ, aba: 'fornecedores' }
        const host = await montar(PaginaDoNicho())
        const aba = host.querySelector('[data-aba-fornecedores]') as HTMLElement
        expect(aba.textContent).toContain('Wolf Perfis')
        expect(aba.textContent).toContain('Veca Perfis')
        expect(aba.textContent).not.toContain('Marcenaria Alfa')
        expect(aba.textContent).toContain('Credenciar fornecedor')
    })

    it('o credenciamento já vem com ESTE nicho escolhido', async () => {
        mockRoteador.query = { nichoId: ESQ, aba: 'fornecedores' }
        const host = await montar(PaginaDoNicho())
        await act(async () => { (Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Credenciar fornecedor')) as HTMLButtonElement).click() })
        await assentar()
        const modal = document.body.querySelector('.ant-modal-content') as HTMLElement
        expect(modal.querySelector('.ant-select-selection-item')?.textContent).toBe('Esquadrias')
    })

    it('MOTORES: só os dos fornecedores do nicho', async () => {
        mockRoteador.query = { nichoId: ESQ, aba: 'motores' }
        const host = await montar(PaginaDoNicho())
        expect(host.querySelector(`[data-motor="${M_ESQ}"]`)).not.toBeNull()
        expect(host.querySelector(`[data-motor="${M_MOV}"]`)).toBeNull()
    })

    it('o mesmo, do outro nicho: Móveis mostra a Marcenaria e o motor dela, e não a Wolf', async () => {
        mockRoteador.query = { nichoId: MOV, aba: 'motores' }
        const host = await montar(PaginaDoNicho())
        expect(host.querySelector(`[data-motor="${M_MOV}"]`)).not.toBeNull()
        expect(host.querySelector(`[data-motor="${M_ESQ}"]`)).toBeNull()
    })
})

describe('(4) a família é GLOBAL, e a aba diz isso', () => {
    it('o aviso aparece na aba das famílias, com a família da plataforma', async () => {
        mockRoteador.query = { nichoId: ESQ }
        const host = await montar(PaginaDoNicho())
        const aba = host.querySelector('[data-aba-familias]') as HTMLElement
        expect(aba.querySelector('[data-familia-global]')!.textContent).toBe(C().AVISO_DA_FAMILIA_GLOBAL)
        expect(aba.textContent).toContain('PVC Wolf')
    })
})

describe('(5) nicho que não existe, e a leitura que falha', () => {
    it('"Nicho não encontrado." — nunca as abas vazias de um nicho', async () => {
        mockRoteador.query = { nichoId: '00000000-0000-4000-8000-000000000000' }
        const host = await montar(PaginaDoNicho())
        expect(host.querySelector('[data-nicho-nao-encontrado]')!.textContent).toBe(C().NICHO_NAO_ENCONTRADO)
        expect(host.querySelector('.ant-tabs')).toBeNull()
    })

    it('500 na lista de fornecedores: ERRO, nunca "nenhum fornecedor"', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.fornecedores}`] = { status: 500, body: { error: 'Não foi possível ler os fornecedores.' } }
        mockRoteador.query = { nichoId: ESQ, aba: 'fornecedores' }
        const host = await montar(PaginaDoNicho())
        expect(host.textContent).toContain('Não foi possível ler o catálogo.')
        expect(host.textContent).not.toContain('Nenhum fornecedor credenciado')
    })
})

describe('(6) os links que levam ao nicho', () => {
    it('a rota do nicho, com e sem aba', () => {
        expect(C().rotaDoNicho(ESQ)).toBe(`${ROUTES.SUPER_ADMIN_IA_CATALOGO}/${ESQ}`)
        expect(C().rotaDoNicho(ESQ, 'motores')).toBe(`${ROUTES.SUPER_ADMIN_IA_CATALOGO}/${ESQ}?aba=motores`)
    })

    it('o "Voltar para fornecedores" da página do fornecedor volta para a aba de fornecedores do NICHO dele', async () => {
        mockRoteador.query = { id: W }
        respostas[`GET ${ROTAS_DO_CATALOGO.fornecedor(W)}`] = { status: 200, body: { ...FORNECEDORES[0], tabelas: 0, tabelas_da_lista: [] } }
        const PaginaDoFornecedor = require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType // eslint-disable-line @typescript-eslint/no-require-imports
        const host = await montar(PaginaDoFornecedor)
        const voltar = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Voltar para fornecedores')) as HTMLButtonElement
        await act(async () => { voltar.click() })
        expect(mockRoteador.push).toHaveBeenCalledWith(`${ROUTES.SUPER_ADMIN_IA_CATALOGO}/${ESQ}?aba=fornecedores`)
    })

    it('"cadastrar motor no catálogo" da etapa: os motores do nicho da conta; sem nicho, o Catálogo', () => {
        expect(E().linkDoCatalogoDeMotores(ESQ)).toBe(`${ROUTES.SUPER_ADMIN_IA_CATALOGO}/${ESQ}?aba=motores`)
        expect(E().linkDoCatalogoDeMotores(null)).toBe(`${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}#motores`)
    })
})
