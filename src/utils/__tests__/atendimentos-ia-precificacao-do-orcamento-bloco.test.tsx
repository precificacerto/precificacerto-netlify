/**
 * PORTÃO — o BLOCO da precificação do orçamento I.A. (pedidos 0051 e 0052): o que ele passa à tela de Produtos no modo orçamento. Na página do orçamento
 * (`naPaginaDoOrcamento`) vai SEM o topo do cliente (a página já o mostra) e SEM a tabela de itens (são a seção de cima); no atalho `/precificacao`, com
 * os dois. O rodapé é só o link "Abrir PDF do orçamento"; e a configuração de despesas vem da ROTA, não do banco.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const capturado = { props: null as Record<string, unknown> | null }
jest.mock('@/page-parts/products/content.component', () => ({ Content: (p: Record<string, unknown>) => { capturado.props = p; return <div data-content-stub="">{p.rodapeDoOrcamento as React.ReactNode}</div> } }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { tenant_id: 't' } }) }))
jest.mock('@/utils/get-tenant-id', () => ({ getTenantId: async () => 't' }))
jest.mock('@/utils/calc-tax-preview', () => ({ fetchTaxPreview: async (): Promise<null> => null }))
jest.mock('@/utils/recalc-expense-config', () => ({ mergeExpenseConfig: async (): Promise<void> => undefined }))
jest.mock('@/utils/build-calc-base', () => ({ buildCalcBase: (c: unknown) => ({ config: c }) }))
jest.mock('@/page-parts/atendimentos-ia/topo-do-orcamento.component', () => ({ TopoDoOrcamento: () => <div data-topo-stub="">topo</div>, AvisoDoFiscalDivergente: (): null => null }))
const chamadas: string[] = []
beforeAll(() => {
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
        chamadas.push(url)
        if (url === '/api/atendimentos-ia/config-de-despesas') return { ok: true, status: 200, json: async () => ({ config: { laborCost: 7 } }) }
        return { ok: true, status: 200, json: async () => ({ orcamento: { id: 'orc-14', numero: 14, itens: [] as unknown[] }, cliente: { nome: 'X' }, fiscal_divergente: [] as unknown[], itens_do_arquivo: null as unknown, recusa_dos_itens: null as unknown }) }
    })
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrecificacaoDoOrcamento } = require('@/page-parts/atendimentos-ia/precificacao-do-orcamento.component') as typeof import('@/page-parts/atendimentos-ia/precificacao-do-orcamento.component')

async function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { root.render(no) })
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    return host
}
beforeEach(() => { capturado.props = null; chamadas.length = 0 })

it('na página do orçamento: sem o topo do cliente e sem a tabela de itens; o rodapé é só o link "Abrir PDF do orçamento"', async () => {
    const host = await montar(<PrecificacaoDoOrcamento id="orc-14" comLinkDoArquivo naPaginaDoOrcamento />)
    expect(host.querySelector('[data-topo-stub]')).toBeNull()
    expect(capturado.props?.semTabelaDeItens).toBe(true)
    const link = host.querySelector('[data-abrir-arquivo]') as HTMLAnchorElement
    expect(link.textContent).toBe('Abrir PDF do orçamento')
    expect(link.getAttribute('href')).toBe('/api/atendimentos-ia/orcamentos/orc-14/arquivo')
})
it('no atalho /precificacao: com o topo e com a tabela de itens', async () => {
    const host = await montar(<PrecificacaoDoOrcamento id="orc-14" />)
    expect(host.querySelector('[data-topo-stub]')).not.toBeNull()
    expect(capturado.props?.semTabelaDeItens).toBe(false)
})
it('a configuração de despesas vem da ROTA do servidor (o calcBase leva o que ela devolveu)', async () => {
    await montar(<PrecificacaoDoOrcamento id="orc-14" />)
    expect(chamadas).toContain('/api/atendimentos-ia/config-de-despesas')
    expect(capturado.props?.calcBase).toEqual({ config: { laborCost: 7 } })
})
