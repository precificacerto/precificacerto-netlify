/**
 * PORTÃO — a TELA de Fornecedores e tabelas (bloco 2B.2).
 *
 *   (a) falha ao ler é ERRO na tela, nunca "Nenhum fornecedor credenciado": a lista vazia
 *       afirmaria um zero que ninguém leu (`ausente-vs-falso.md`) — e é exatamente o sintoma de
 *       ler pelo cliente do navegador as tabelas que não dão privilégio a ele;
 *   (b) a lista que a rota devolve aparece — Fornecedor · Nicho · Contas usando · Tabelas;
 *   (c) quem não é super admin é devolvido ao início, e a tela não chama rota nenhuma;
 *   (d) o modal da tabela não salva sem o motor — a trava da TELA (a da rota está em
 *       `atendimentos-ia-rotas.test.ts`).
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'
import { MENSAGEM_MOTOR_OBRIGATORIO, ROTAS_DO_CATALOGO, type FornecedorDaLista } from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const replaces: string[] = []
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/fornecedores', asPath: '/', query: {}, replace: (u: string) => { replaces.push(u) }, push: () => {} }),
}))
let usuario: Record<string, unknown> = { id: 'u-super', is_super_admin: true, role: 'super_admin' }
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: usuario }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const FORNECEDOR: FornecedorDaLista = {
    id: 'f1', nome: 'Alumínio Sul', nicho_id: 'n1', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 2, contas_usando: ['Marcenaria Silva'],
}
let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: string[] = []
beforeEach(() => {
    pedidos.length = 0
    replaces.length = 0
    usuario = { id: 'u-super', is_super_admin: true, role: 'super_admin' }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
        pedidos.push(url)
        const r = respostas[url] ?? { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Pagina = require('@/pages/super-admin/atendimentos-ia/fornecedores/index').default as React.ComponentType
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TabelaModal } = require('@/page-parts/atendimentos-ia/tabela-modal.component') as typeof import('@/page-parts/atendimentos-ia/tabela-modal.component')

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

describe('a tela de Fornecedores e tabelas', () => {
    it('(a) falha ao ler aparece como ERRO, e não como "nenhum fornecedor"', async () => {
        respostas = {
            [ROTAS_DO_CATALOGO.fornecedores]: { status: 500, body: { error: 'Não foi possível ler os fornecedores.' } },
            [ROTAS_DO_CATALOGO.nichos]: { status: 200, body: [] },
            [ROTAS_DO_CATALOGO.familias]: { status: 200, body: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }] },
        }
        const host = await montar(<Pagina />)
        expect(host.textContent).toContain('Não foi possível ler o catálogo.')
        expect(host.textContent).toContain('Não foi possível ler os fornecedores.')
        expect(host.textContent).not.toContain('Nenhum fornecedor credenciado')
    })

    it('(b) a lista da rota aparece: fornecedor, nicho, contas usando, tabelas', async () => {
        respostas = {
            [ROTAS_DO_CATALOGO.fornecedores]: { status: 200, body: [FORNECEDOR] },
            [ROTAS_DO_CATALOGO.nichos]: { status: 200, body: [{ id: 'n1', modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true }] },
            [ROTAS_DO_CATALOGO.familias]: { status: 200, body: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }] },
        }
        const host = await montar(<Pagina />)
        const linha = host.querySelector('tbody tr') as HTMLElement
        expect(linha.textContent).toContain('Alumínio Sul')
        expect(linha.textContent).toContain('Esquadrias')
        expect(linha.textContent).toContain('Marcenaria Silva')
        expect(linha.textContent).toContain('Tabelas (2)')
        expect(pedidos).toEqual(expect.arrayContaining([ROTAS_DO_CATALOGO.fornecedores, ROTAS_DO_CATALOGO.nichos]))
    })

    it('(c) quem não é super admin volta ao início, e nenhuma rota é chamada', async () => {
        usuario = { id: 'u-a', is_super_admin: false, role: 'admin' }
        await montar(<Pagina />)
        expect(replaces).toEqual([ROUTES.DASHBOARD])
        expect(pedidos).toEqual([])
    })

    it('(d) o modal da tabela não salva sem o motor, e diz por quê', async () => {
        // COM o arquivo da tabela e SEM o motor: sem arquivo nenhum, o botão já estaria desligado
        // pela falta do arquivo, e o caso não distinguiria a trava do motor (`teste-que-nao-exercita.md`).
        await montar(<TabelaModal aberto familias={[]} titulo="Nova tabela" atual={{ arquivo_nome: 't.xlsx', motor_nome: '', vigencia: null, familia: null }} onCancelar={() => {}} onSalvar={() => {}} />)
        const salvar = Array.from(document.querySelectorAll('.ant-modal button')).find((b) => b.textContent?.includes('Salvar tabela')) as HTMLButtonElement
        expect(salvar).toBeDefined()
        expect(salvar.disabled).toBe(true)
        expect(document.querySelector('.ant-modal')?.textContent).toContain(MENSAGEM_MOTOR_OBRIGATORIO)

        // O contraste: na EDIÇÃO, com os dois arquivos atuais, o botão liga — sem isto, um botão
        // sempre desligado passaria o caso.
        await montar(<TabelaModal aberto familias={[]} titulo="Editar tabela" atual={{ arquivo_nome: 't.xlsx', motor_nome: 'm.xlsx', vigencia: null, familia: null }} onCancelar={() => {}} onSalvar={() => {}} />)
        const botoes = Array.from(document.querySelectorAll('.ant-modal button')).filter((b) => b.textContent?.includes('Salvar tabela')) as HTMLButtonElement[]
        expect(botoes.some((b) => !b.disabled)).toBe(true)
    })
})
