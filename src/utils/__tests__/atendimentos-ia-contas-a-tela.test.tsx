/**
 * PORTÃO — as TELAS de "Contas ligadas" (bloco 2C.1): a lista e a configuração de UMA conta.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> REGRA INVIOLÁVEL <<<
 * A lista de contas e a tela de configuração mostram APENAS o nome/identificação da conta e a
 * configuração do Atendimentos I.A. NADA do conteúdo da conta — nem clientes, nem orçamentos,
 * nem funcionários, nem valores. O super admin não tem tenant e não pode enxergar dado de cliente
 * por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   (a) a lista mostra, de cada conta ligada, o nome e "modelo · nicho" — e "não definido" quando
 *       a conta ainda não tem modelo, em vez de um modelo inventado;
 *   (b) falha ao ler é ERRO na tela, nunca "nenhuma conta ligada" (`ausente-vs-falso.md`);
 *   (c) quem não é super admin volta ao início, e nenhuma rota é chamada — nas duas telas;
 *   (d) salvar a configuração manda SÓ `modelo` e `nicho_id`, na rota DA conta: nada de `ativo`,
 *       que o liga/desliga é de Tenants;
 *   (e) a conta que não está na lista de ligadas não ganha formulário;
 *   (f) a recusa do banco (409) aparece com a frase da rota.
 *
 * O que estas telas NÃO têm, de propósito (bloco 2C.1): "Tabelas em uso" (2C.2), projeção de
 * gasto (2C.3), e qualquer frase sobre o que trocar o modelo faz com as tabelas da conta.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'
import { AVISO_DA_TRAVA_DO_MODELO_E_NICHO, ROTAS_DO_CATALOGO, ROTULO_DO_MODELO, type ContaLigada, type Nicho } from '@/utils/atendimentos-ia-catalogo'
import { rotaDaConfig } from '@/utils/orcamentista-config'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const CONTA_A = '00000000-0000-0000-0000-00000000000a'
const CONTA_B = '00000000-0000-0000-0000-00000000000b'
const N_ESQ = '33333333-3333-3333-3333-333333333331'

const replaces: string[] = []
const pushes: string[] = []
let consulta: Record<string, string> = { tenantId: CONTA_A }
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/contas', asPath: '/', query: consulta, replace: (u: string) => { replaces.push(u) }, push: (u: string) => { pushes.push(u) } }),
}))
let usuario: Record<string, unknown> = { id: 'u-super', is_super_admin: true, role: 'super_admin' }
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: usuario }) }))
jest.mock('@/components/layout/layout.component', () => ({
    Layout: ({ children, title }: { children: React.ReactNode; title?: string }) => <div><h1 data-titulo>{title}</h1>{children}</div>,
}))

const CONTAS: ContaLigada[] = [
    { tenant_id: CONTA_A, nome: 'Conta Alfa', modelo: 'FABRICACAO', nicho_id: N_ESQ, nicho_nome: 'Esquadrias' },
    { tenant_id: CONTA_B, nome: 'Conta Beta', modelo: null, nicho_id: null, nicho_nome: null },
]
const NICHOS: Nicho[] = [
    { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true },
    { id: '33333333-3333-3333-3333-333333333332', modelo: 'REVENDA', nome: 'Autopeças', ativo: true },
]

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: { url: string; metodo: string; corpo: unknown }[] = []
beforeEach(() => {
    pedidos.length = 0
    replaces.length = 0
    pushes.length = 0
    consulta = { tenantId: CONTA_A }
    usuario = { id: 'u-super', is_super_admin: true, role: 'super_admin' }
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.contas}`]: { status: 200, body: CONTAS },
        [`GET ${ROTAS_DO_CATALOGO.nichos}`]: { status: 200, body: NICHOS },
        [`PATCH ${rotaDaConfig(CONTA_A)}`]: { status: 200, body: { ok: true } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const metodo = init?.method ?? 'GET'
        pedidos.push({ url, metodo, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[`${metodo} ${url}`] ?? { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// As páginas são lidas DENTRO de cada caso: no commit dos portões elas ainda não existem, e um
// `require` no topo derrubaria o arquivo inteiro de uma vez.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ALista = () => require('@/pages/super-admin/atendimentos-ia/contas/index').default as React.ComponentType
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AConta = () => require('@/pages/super-admin/atendimentos-ia/contas/[tenantId]').default as React.ComponentType

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
async function montar(no: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(no) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    return host
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => (b.textContent || '').includes(texto)) as HTMLButtonElement | undefined

describe('a lista de contas ligadas', () => {
    it('(a) cada conta: o nome e "modelo · nicho"; sem modelo, "não definido"', async () => {
        const Pagina = ALista()
        const host = await montar(<Pagina />)
        const linhas = Array.from(host.querySelectorAll('tbody tr')) as HTMLElement[]
        expect(linhas).toHaveLength(2)
        expect(linhas[0].textContent).toContain('Conta Alfa')
        expect(linhas[0].textContent).toContain(`${ROTULO_DO_MODELO.FABRICACAO} · Esquadrias`)
        expect(linhas[0].textContent).not.toContain('não definido')
        expect(linhas[1].textContent).toContain('Conta Beta')
        expect(linhas[1].textContent).toContain('não definido')
        for (const m of Object.values(ROTULO_DO_MODELO)) expect(linhas[1].textContent).not.toContain(m)
    })

    it('(a) "Configurar" leva à configuração DA conta, sob /super-admin/', async () => {
        const Pagina = ALista()
        const host = await montar(<Pagina />)
        await act(async () => { botao(host.querySelector('tbody tr') as HTMLElement, 'Configurar')!.click() })
        expect(pushes).toEqual([`${ROUTES.SUPER_ADMIN_IA_CONTAS}/${CONTA_A}`])
    })

    it('(b) falha ao ler aparece como ERRO, e não como "nenhuma conta"', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.contas}`] = { status: 500, body: { error: 'Não foi possível ler as contas ligadas.' } }
        const Pagina = ALista()
        const host = await montar(<Pagina />)
        expect(host.textContent).toContain('Não foi possível ler as contas ligadas.')
        expect(host.querySelector('tbody tr')).toBeNull()
        expect(host.textContent).not.toMatch(/Nenhuma conta/)
    })

    it('(b) o contraste: lista lida e vazia diz que não há conta ligada', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.contas}`] = { status: 200, body: [] }
        const Pagina = ALista()
        const host = await montar(<Pagina />)
        expect(host.textContent).toMatch(/Nenhuma conta/)
    })

    it('(c) quem não é super admin volta ao início, e nenhuma rota é chamada', async () => {
        usuario = { id: 'u-a', is_super_admin: false, role: 'admin' }
        const Pagina = ALista()
        await montar(<Pagina />)
        expect(replaces).toEqual([ROUTES.DASHBOARD])
        expect(pedidos).toEqual([])
    })
})

describe('a configuração de uma conta', () => {
    it('o título é o nome da conta, e o nicho atual aparece', async () => {
        const Pagina = AConta()
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-titulo]')?.textContent).toBe('Conta Alfa')
        expect(Array.from(host.querySelectorAll('.ant-select-selection-item')).map((e) => e.textContent)).toEqual([ROTULO_DO_MODELO.FABRICACAO, 'Esquadrias'])
    })

    it('(d) salvar manda SÓ modelo e nicho_id, por PATCH, na rota DA conta', async () => {
        const Pagina = AConta()
        const host = await montar(<Pagina />)
        await act(async () => { botao(host, 'Salvar configuração')!.click() })
        await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
        const gravacoes = pedidos.filter((p) => p.metodo !== 'GET')
        expect(gravacoes).toEqual([{ url: rotaDaConfig(CONTA_A), metodo: 'PATCH', corpo: { modelo: 'FABRICACAO', nicho_id: N_ESQ } }])
    })

    /**
     * "Tabelas em uso" SAIU da tela (dono do produto, 26/10/2026): seletores, Adicionar, a lista com Remover e a
     * rota que eles chamavam. A frase da trava NÃO sumiu: a trava continua, sobre as tabelas DERIVADAS da base de
     * conhecimento, e o aviso novo diz isso junto do modelo e do nicho.
     */
    it('(g) sem a seção "Tabelas em uso", e o aviso da trava diz a fonte nova', async () => {
        const Pagina = AConta()
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-grupo="tabelas-em-uso"]')).toBeNull()
        expect(host.textContent).not.toContain('Tabelas em uso')
        expect(host.textContent).not.toContain('Enquanto houver tabela em uso')
        expect(pedidos.map((p) => p.url).filter((u) => u.includes(`/contas/${CONTA_A}/tabelas`))).toEqual([])
        expect(host.querySelector('[data-aviso="trava-do-modelo-e-nicho"]')?.textContent).toBe(AVISO_DA_TRAVA_DO_MODELO_E_NICHO)
        expect(AVISO_DA_TRAVA_DO_MODELO_E_NICHO).toContain('base de conhecimento')
    })

    it('(e) conta fora da lista de ligadas: sem formulário, e diz por quê', async () => {
        consulta = { tenantId: '00000000-0000-0000-0000-0000000000ff' }
        const Pagina = AConta()
        const host = await montar(<Pagina />)
        expect(botao(host, 'Salvar configuração')).toBeUndefined()
        expect(host.textContent).toMatch(/não está com o Atendimentos I\.A\. ligado/)
    })

    it('(f) a recusa do banco aparece com a frase da rota', async () => {
        respostas[`PATCH ${rotaDaConfig(CONTA_A)}`] = { status: 409, body: { error: 'O nicho “Esquadrias” é do modelo Fabricação, não de Revenda.' } }
        const Pagina = AConta()
        const host = await montar(<Pagina />)
        await act(async () => { botao(host, 'Salvar configuração')!.click() })
        await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
        expect(document.body.textContent).toContain('O nicho “Esquadrias” é do modelo Fabricação, não de Revenda.')
    })

    it('(b) falha ao ler aparece como ERRO, e não como formulário vazio', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.nichos}`] = { status: 500, body: { error: 'Não foi possível ler os nichos.' } }
        const Pagina = AConta()
        const host = await montar(<Pagina />)
        expect(host.textContent).toContain('Não foi possível ler os nichos.')
        expect(botao(host, 'Salvar configuração')).toBeUndefined()
    })

    it('(c) quem não é super admin volta ao início, e nenhuma rota é chamada', async () => {
        usuario = { id: 'u-a', is_super_admin: false, role: 'admin' }
        const Pagina = AConta()
        await montar(<Pagina />)
        expect(replaces).toEqual([ROUTES.DASHBOARD])
        expect(pedidos).toEqual([])
    })
})

/**
 * A TELA DA CONTA EM TRÊS BLOCOS (dono do produto, 26/10/2026) — as três camadas, visíveis:
 * BASE DE CONHECIMENTO (fornecedores, tabelas, preços: edita dado, estruturado), MOTOR (a cascata e o que está
 * carregado: mostra, e edita só escolha estruturada) e PROMPT DE ATENDIMENTO (como conversar: texto livre).
 * E a regra de produto: toda mensagem nasce da conversa do vendedor com o agente; o super admin é o consultor
 * e não fala com ninguém. O teste de anexo FICA, marcado como instrumento de diagnóstico, não funcionalidade.
 */
describe('(g) os três blocos da conta, e o diagnóstico do consultor', () => {
    it('Base de conhecimento, Motor e Prompt de atendimento, nessa ordem; o teste de anexo depois, como diagnóstico', async () => {
        respostas[`GET /api/super-admin/atendimentos-ia/contas/${CONTA_A}/motor`] = { status: 200, body: { tabelas: [], planilhas: [], familias: [], etapas_das_familias: [], materias_primas: [], avisos: { fornecedores_sem_tabela: [], pares_sem_vigente: [], nenhuma_com_motor: false } } }
        const host = await montar(React.createElement(AConta()))
        const blocos = Array.from(host.querySelectorAll('[data-bloco]')).map((b) => b.getAttribute('data-bloco'))
        expect(blocos).toEqual(['base-de-conhecimento', 'motor', 'prompt-de-atendimento', 'diagnostico'])
        const diagnostico = host.querySelector('[data-bloco="diagnostico"]')!
        expect(diagnostico.textContent).toContain('Instrumento de diagnóstico do consultor')
        expect(diagnostico.textContent).toContain('não é funcionalidade')
        expect(diagnostico.querySelector('[data-enviar-teste-de-anexo]')).not.toBeNull()
        // o teste de anexo mora SÓ no diagnóstico
        expect(host.querySelectorAll('[data-enviar-teste-de-anexo]').length).toBe(1)
        // a base de conhecimento leva o acesso à base, de onde vêm os fornecedores e, deles, as tabelas
        const base = host.querySelector('[data-bloco="base-de-conhecimento"]')!
        expect(base.querySelector('[data-grupo="acesso-a-base-de-conhecimento"]')).not.toBeNull()
        // o prompt de atendimento é o bloco do contexto da empresa (26/10/2026), não mais o aviso "ainda não construído"
        const prompt = host.querySelector('[data-bloco="prompt-de-atendimento"]')!
        expect(prompt.querySelector('[data-grupo="contexto-do-atendimento"]')).not.toBeNull()
        expect(prompt.textContent).not.toContain('Ainda não construído')
    })

    it('conta de modelo SEM fornecedor: o bloco Motor diz que o modelo não usa motor de fornecedor, e não lê o motor', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.contas}`] = { status: 200, body: [{ ...CONTAS[0], modelo: 'REVENDA', nicho_id: null, nicho_nome: null }] }
        const host = await montar(React.createElement(AConta()))
        expect(host.querySelector('[data-bloco="motor"]')?.textContent).toContain('não usa motor de fornecedor')
        expect(pedidos.some((p) => p.url.endsWith('/motor'))).toBe(false)
    })
})

