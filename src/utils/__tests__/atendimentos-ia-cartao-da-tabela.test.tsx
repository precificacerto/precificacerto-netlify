/**
 * PORTÃO — a lista de tabelas do fornecedor é UM CARTÃO POR TABELA (dono do produto, 02/11/2026).
 *
 * "eu estou vendo muito mal distribuído por coluna. Eu acho que nós temos que fazer as colunas se tornarem linhas. E aí cada discriminação tendo a
 * sua descrição. [...] Cada fornecedor, que vai ter uma tabela, vai ser uma célula." E: "NÃO acrescente informação nova: as mesmas sete, mais nada."
 *
 *   (a) dentro do cartão, as SETE informações, cada uma numa linha, na ordem: motor · família · categoria · vigente · vigência · subido em · contas
 *       usando — e nenhuma outra (a lista esperada é a do pedido, escrita aqui, não a constante do componente);
 *   (b) o nome do arquivo em destaque no TOPO, inteiro (sem reticências);
 *   (c) os botões Importação, Editar e Remover no RODAPÉ, depois da última linha, que quebram de linha em vez de cortar, e cada um chama o seu;
 *   (d) em janela estreita: a linha quebra (o valor desce para baixo do rótulo), o valor quebra em qualquer ponto e não força largura, e a grade de
 *       cartões nunca pede mais que a largura da tela;
 *   (e) "Subido em" com data e hora, `dd/mm/aaaa hh:mm` (dono do produto, 02/11/2026: "exato momento");
 *   (f) na página, a grade de colunas saiu: um cartão por tabela, nenhuma <table>.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROTAS_DO_CATALOGO, dataEHoraBR, type FornecedorComTabelas, type TabelaDoFornecedor } from '@/utils/atendimentos-ia-catalogo'
import { CartaoDaTabela } from '@/page-parts/atendimentos-ia/cartao-da-tabela.component'

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

/** A lista do pedido do dono do produto, escrita como ele a escreveu (com o rótulo de vigência que a tela já usava). */
const AS_SETE = ['Motor', 'Família', 'Categoria', 'Vigente', 'Vigência (nota)', 'Subido em', 'Contas usando']

const TABELA: TabelaDoFornecedor = {
    id: '21acfa75-e4e7-4de6-9b96-cdd95525467d', fornecedor_id: 'f1', arquivo_nome: 'Tabela_Wolff_Perfis_PVC_com_um_nome_bem_comprido_que_nao_cabe.xlsx',
    arquivo_path: 'f1/arquivo/t.xlsx', motor_nome: null, motor_path: null, vigencia: 'desde 01/11/2026', familia: 'PVC', categoria_chave: 'PERFIL', vigente: true,
    criado_em: new Date(2026, 9, 29, 16, 26, 10).toISOString(), arquivo_em: new Date(2026, 10, 1, 18, 8, 19).toISOString(), contas_usando: ['Esquadrias De Paula', 'Marcenaria Silva'],
}

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
const chamadas: string[] = []
const cartao = () => montar(
    <CartaoDaTabela tabela={TABELA} familia="PVC Wolf" categoria="Perfil"
        onVigente={(v) => chamadas.push(`vigente:${v}`)} onImportacao={() => chamadas.push('importacao')} onEditar={() => chamadas.push('editar')} onRemover={() => chamadas.push('remover')} />,
)
beforeEach(() => { chamadas.length = 0 })

describe('o cartão de UMA tabela', () => {
    it('(a) as SETE informações, cada uma numa linha, na ordem do pedido — e nenhuma outra', async () => {
        const host = await cartao()
        const rotulos = Array.from(host.querySelectorAll('[data-linha-do-cartao] > [data-rotulo]')).map((r) => r.textContent)
        expect(rotulos).toEqual(AS_SETE)
        const linha = (campo: string) => host.querySelector(`[data-linha-do-cartao="${campo}"] [data-valor]`)!.textContent
        expect(linha('motor')).toBe('sem motor (preço puro)')
        expect(linha('familia')).toBe('PVC Wolf')
        expect(linha('categoria')).toBe('Perfil')
        expect(linha('vigencia')).toBe('desde 01/11/2026')
        expect(linha('contas-usando')).toBe('Esquadrias De Paula, Marcenaria Silva')
        expect((host.querySelector('[data-linha-do-cartao="vigente"] [data-vigente]') as HTMLElement).getAttribute('aria-checked')).toBe('true')
        // nenhuma informação fora das linhas e do título: o texto do cartão é o título, as sete linhas e os três botões
        const texto = (host.querySelector('[data-cartao-da-tabela]') as HTMLElement).textContent
        const partes = [TABELA.arquivo_nome, ...Array.from(host.querySelectorAll('[data-linha-do-cartao]')).map((l) => l.textContent), 'Importação', 'Editar', 'Remover']
        expect(texto!.replace(/\s/g, '')).toBe(partes.join('').replace(/\s/g, ''))
    })

    it('(b) o nome do arquivo em destaque no TOPO, inteiro, sem reticências', async () => {
        const host = await cartao()
        const artigo = host.querySelector('[data-cartao-da-tabela]') as HTMLElement
        const titulo = artigo.firstElementChild as HTMLElement
        expect(titulo.matches('[data-arquivo-do-cartao]')).toBe(true)
        expect(titulo.tagName).toBe('H5')
        expect(titulo.textContent).toBe(TABELA.arquivo_nome)
        expect(titulo.className).not.toMatch(/ellipsis/)
        expect(titulo.style.overflowWrap).toBe('anywhere')
    })

    it('(c) os botões no RODAPÉ, depois da última linha, quebrando de linha; cada um chama o seu', async () => {
        const host = await cartao()
        const artigo = host.querySelector('[data-cartao-da-tabela]') as HTMLElement
        const rodape = artigo.lastElementChild as HTMLElement
        expect(rodape.matches('[data-botoes-do-cartao]')).toBe(true)
        expect(Array.from(rodape.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Importação', 'Editar', 'Remover'])
        expect(rodape.className).toMatch(/ant-space-gap|ant-space/)
        expect(rodape.style.flexWrap || getComputedStyle(rodape).flexWrap).toBe('wrap')
        for (const b of Array.from(rodape.querySelectorAll('button'))) await act(async () => { b.click() })
        await act(async () => { (host.querySelector('[data-vigente]') as HTMLElement).click() })
        expect(chamadas).toEqual(['importacao', 'editar', 'remover', 'vigente:false'])
    })

    it('(d) em janela estreita: a linha quebra, o valor quebra em qualquer ponto e não força largura', async () => {
        const host = await cartao()
        for (const l of Array.from(host.querySelectorAll('[data-linha-do-cartao]')) as HTMLElement[]) {
            expect(l.style.display).toBe('flex')
            expect(l.style.flexWrap).toBe('wrap')
            const valor = l.querySelector('[data-valor]') as HTMLElement
            expect(valor.style.overflowWrap).toBe('anywhere')
            expect(valor.style.minWidth).toBe('0')
            expect(valor.style.width).toBe('')
        }
        expect((host.querySelector('[data-cartao-da-tabela]') as HTMLElement).style.minWidth).toBe('0')
    })

    it('(e) "Subido em" com data e hora, dd/mm/aaaa hh:mm', async () => {
        const host = await cartao()
        expect(host.querySelector('[data-campo="subido-em"]')!.textContent).toBe('01/11/2026 18:08')
    })
})

describe('dataEHoraBR', () => {
    it('dd/mm/aaaa hh:mm, com zero à esquerda e sem vírgula; o que não é data é traço', () => {
        expect(dataEHoraBR(new Date(2026, 2, 5, 9, 4, 59).toISOString())).toBe('05/03/2026 09:04')
        expect(dataEHoraBR(new Date(2026, 11, 31, 23, 59).toISOString())).toBe('31/12/2026 23:59')
        expect(dataEHoraBR('não é data')).toBe('—')
    })
})

describe('(f) na página do fornecedor', () => {
    it('um cartão por tabela, na grade que não passa da largura da tela — e nenhuma <table>', async () => {
        const fornecedor: FornecedorComTabelas = {
            id: 'f1', nome: 'Wolf Perfis', nicho_id: 'n0', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 2, contas_usando: [], categorias_das_tabelas: ['PERFIL'], familias_do_perfil: ['PVC'],
            tabelas_da_lista: [TABELA, { ...TABELA, id: 'fe2c6667-652f-43bd-89d2-fd63673dc966', arquivo_nome: 'FERRAGENS - IMAB.xlsx', categoria_chave: 'FERRAGENS', familia: null }],
        }
        const respostas: Record<string, unknown> = { [ROTAS_DO_CATALOGO.fornecedor('f1')]: fornecedor, [ROTAS_DO_CATALOGO.nichos]: [], [ROTAS_DO_CATALOGO.familias]: [{ chave: 'PVC', rotulo: 'PVC Wolf', ordem: 1 }], [ROTAS_DO_CATALOGO.categorias]: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'FERRAGENS', rotulo: 'Ferragens', ordem: 4 }] }
        ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => respostas[url] }) as Response)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Pagina = require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType
        const host = await montar(<Pagina />)
        expect(host.querySelector('table')).toBeNull()
        const lista = host.querySelector('[data-tabelas-do-fornecedor]') as HTMLElement
        expect(Array.from(lista.querySelectorAll('[data-cartao-da-tabela]')).map((c) => c.getAttribute('data-cartao-da-tabela'))).toEqual([TABELA.id, 'fe2c6667-652f-43bd-89d2-fd63673dc966'])
        expect(lista.style.gridTemplateColumns).toContain('min(100%')
        const familiaDa = (id: string) => lista.querySelector(`[data-cartao-da-tabela="${id}"] [data-linha-do-cartao="familia"] [data-valor]`)!.textContent
        expect(familiaDa(TABELA.id)).toBe('PVC Wolf')
        expect(familiaDa('fe2c6667-652f-43bd-89d2-fd63673dc966')).toBe('Qualquer linha')
    })
})
