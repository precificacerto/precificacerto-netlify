/**
 * PORTÃO — a TELA da importação: /super-admin/atendimentos-ia/tabelas/[id]/importacao.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * A TELA NÃO CALCULA NADA (dono do produto, 20/10/2026). Todo número na tela vem da rota ou do
 * banco, pela rota. Antes da primeira importação NÃO HÁ contagem nenhuma — e a tela não mostra
 * zero no lugar dela (`ausente-vs-falso.md`: zero afirmaria "importei e não havia nada").
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   (1) ANTES: os dois arquivos com nome, papel e extensão, se são importáveis, e o botão
 *       Importar — e NENHUMA contagem;
 *   (2) o ERRO DA ROTA aparece na tela com o motivo: as três extensões, o Storage, o 422, e o
 *       500 com os dois números lado a lado;
 *   (3) DEPOIS: as contagens de cada arquivo, o cruzamento, as tipologias na ORDEM DA ROTA, os
 *       avisos legíveis, a data e quem importou;
 *   (4) a tradução dos avisos é de quem não leu o código: título e texto, nunca o `tipo` cru;
 *   (5) a ordem das tipologias é a proporção de condicionais — calculada pela ROTA, não aqui;
 *   (6) a linha da tabela, no fornecedor, leva à importação.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'
import { ROTAS_DO_CATALOGO, fraseDoArquivoNaoImportavel, type FornecedorComTabelas } from '@/utils/atendimentos-ia-catalogo'
import type { Aviso, TipologiaLida } from '@/utils/atendimentos-ia-importacao'
import { ordenarPorProporcaoDeCondicionais, quandoFoiImportado, textoDoAviso } from '@/utils/atendimentos-ia-importacao-apresentacao'

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
const pushes: string[] = []
let consulta: Record<string, string> = { id: T }
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/tabelas/[id]/importacao', asPath: '/', query: consulta, replace: () => {}, push: (u: string) => { pushes.push(u) } }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const TABELA = { id: T, fornecedor_id: 'f1', fornecedor_nome: 'Wolf Perfis', arquivo_nome: 'Tabela Wolff.xlsm', motor_nome: 'Motor.xlsx', vigencia: null as string | null, categoria_chave: null as string | null, categoria_rotulo: null as string | null }
const AVISOS: Aviso[] = [
    { tipo: 'codigo_repetido', aba: 'Tabela Wolff', codigo: 'IL4237', linhas: [556, 674], secoes: ['LAMINADOS TOTAL', 'LAMINADOS PARTE EXTERNA'], valores_batem: true, mensagem: 'm1' },
    { tipo: 'codigo_do_motor_sem_preco', codigos: ['Z9', 'Z10'], mensagem: 'm2' },
    { tipo: 'celula_com_erro', aba: 'Tabela Wolff', linha: 12, coluna: 13, mensagem: 'erro na planilha: #N/A' },
]
const ULTIMA = {
    id: 'imp-9', tabela_id: T, importado_em: '2026-10-20T15:30:00Z', importado_por: 'u-super', importado_por_nome: 'Cristiano',
    itens: 755, regras: 4055, tipologias: 157, cruzam: 548, nao_cruzam: 1, normalizados: 3, avisos: AVISOS,
}
const TIPOLOGIAS: TipologiaLida[] = [
    { tipologia: 'DP-148', linha: 'EUROPA 42', n_regras: 837, n_condicionais: 835, variaveis: ['AQ', 'CA', 'FV', 'M', 'N', 'PM', 'PT'] },
    { tipologia: 'DP-02', linha: 'EUROPA 42', n_regras: 192, n_condicionais: 90, variaveis: ['ARE', 'ARI', 'CA', 'FV', 'HFOL', 'INT', 'MAE', 'MAI', 'MFI', 'MTE'] },
    { tipologia: 'DP-01', linha: 'EUROPA 42', n_regras: 136, n_condicionais: 36, variaveis: ['ARE', 'ARI', 'CA', 'FV', 'MAE', 'MAI', 'MTE'] },
    { tipologia: 'AA-SEM', linha: null, n_regras: 5, n_condicionais: 0, variaveis: [] },
]

let respostas: Record<string, Array<{ status: number; body: unknown }>> = {}
const pedidos: string[] = []
function responder(chave: string, ...r: Array<{ status: number; body: unknown }>) { respostas[chave] = r }
beforeEach(() => {
    pedidos.length = 0
    pushes.length = 0
    consulta = { id: T }
    respostas = {}
    responder(`GET ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: TABELA })
    responder(`GET ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: null })
    responder(`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(T)}`, { status: 200, body: { formulas: 0, tipologias: [] } })
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push(chave)
        const fila = respostas[chave]
        const r = fila && fila.length ? (fila.length > 1 ? fila.shift()! : fila[0]) : { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Pagina = require('@/pages/super-admin/atendimentos-ia/tabelas/[id]/importacao').default as React.ComponentType

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
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
const botao = (raiz: ParentNode, texto: string) => Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '')) as HTMLButtonElement | undefined
async function clicar(b: HTMLElement | undefined) { expect(b).toBeDefined(); await act(async () => { b!.click() }); await assentar() }
const n = (x: number) => x.toLocaleString('pt-BR')

describe('(1) ANTES da primeira importação', () => {
    it('mostra os dois arquivos com nome, papel, extensão e se são importáveis, e o botão Importar', async () => {
        const host = await montar(<Pagina />)
        const arquivos = Array.from(host.querySelectorAll('[data-arquivo-da-importacao]'))
        expect(arquivos.map((a) => a.getAttribute('data-arquivo-da-importacao'))).toEqual(['tabela', 'motor'])
        expect(arquivos[0].textContent).toContain('Tabela Wolff.xlsm')
        expect(arquivos[0].textContent).toContain('Arquivo da tabela')
        expect(arquivos[0].textContent).toContain('.xlsm')
        expect(arquivos[1].textContent).toContain('Motor.xlsx')
        expect(arquivos[1].textContent).toContain('Arquivo do motor')
        expect(arquivos[1].textContent).toContain('.xlsx')
        expect(arquivos.every((a) => a.getAttribute('data-importavel') === 'sim')).toBe(true)
        expect(botao(host, 'Importar')).toBeDefined()
    })

    it('a CATEGORIA da tabela aparece junto dos arquivos: o rótulo da declarada, ou "não informada" na de antes', async () => {
        responder(`GET ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: { ...TABELA, categoria_chave: 'REFORCO', categoria_rotulo: 'Reforço metálico' } })
        const declarada = await montar(<Pagina />)
        const linha = declarada.querySelector('[data-categoria-da-tabela="REFORCO"]')!
        expect(linha.textContent).toContain('Categoria da tabela')
        expect(linha.textContent).toContain('Reforço metálico')
        expect(linha.textContent).not.toContain('não informada')

        responder(`GET ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: TABELA })
        const antes = await montar(<Pagina />)
        const sem = antes.querySelector('[data-categoria-da-tabela="nao-informada"]')!
        expect(sem.textContent).toContain('não informada')
    })

    it('NENHUMA contagem, nenhuma tipologia, nenhum cruzamento — nem zero', async () => {
        const host = await montar(<Pagina />)
        expect(host.querySelectorAll('[data-contagem]')).toHaveLength(0)
        expect(host.querySelectorAll('[data-tipologia]')).toHaveLength(0)
        expect(host.querySelector('[data-cruzamento]')).toBeNull()
        expect(host.querySelector('[data-ultima-importacao]')).toBeNull()
    })

    it('arquivo de extensão não importável é dito ANTES, com a frase da importação', async () => {
        responder(`GET ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: { ...TABELA, motor_nome: 'Motor.pdf' } })
        const host = await montar(<Pagina />)
        const motor = host.querySelector('[data-arquivo-da-importacao="motor"]')!
        expect(motor.getAttribute('data-importavel')).toBe('nao')
        expect(motor.textContent).toContain(fraseDoArquivoNaoImportavel('Motor.pdf'))
    })
})

describe('(2) o erro da rota aparece na tela, com o motivo', () => {
    it.each([['Tabela.xls', 'arquivo_nome'], ['Tabela.csv', 'arquivo_nome'], ['Motor.pdf', 'motor_nome']])('extensão: %s', async (nome, campo) => {
        responder(`GET ${ROTAS_DO_CATALOGO.tabela(T)}`, { status: 200, body: { ...TABELA, [campo]: nome } })
        responder(`POST ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 409, body: { error: fraseDoArquivoNaoImportavel(nome) } })
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Importar'))
        expect(host.querySelector('[data-erro-da-importacao]')!.textContent).toContain(fraseDoArquivoNaoImportavel(nome))
    })

    it('Storage: o caminho que faltou', async () => {
        const erro = 'Arquivo "Motor.xlsx": não está no armazenamento — faltou o caminho f/motor/x-Motor.xlsx. Envie o arquivo de novo.'
        responder(`POST ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 409, body: { error: erro } })
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Importar'))
        expect(host.querySelector('[data-erro-da-importacao]')!.textContent).toContain(erro)
    })

    it('422: a frase do leitor', async () => {
        const erro = 'Arquivo "Motor.xlsx": não tem a aba "Motor por barra". Abas encontradas: "Outra".'
        responder(`POST ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 422, body: { error: erro } })
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Importar'))
        expect(host.querySelector('[data-erro-da-importacao]')!.textContent).toContain(erro)
    })

    it('500 de contagem divergente: os dois números lado a lado', async () => {
        responder(`POST ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 500, body: {
            error: 'A gravação não conferiu com o que foi lido: as contagens diferem.',
            enviado: { itens: 755, regras: 4055, tipologias: 157, formulas: 137 },
            gravado: { itens: 754, regras: 4055, tipologias: 157, formulas: 137 },
        } })
        const host = await montar(<Pagina />)
        await clicar(botao(host, 'Importar'))
        expect(host.querySelector('[data-erro-da-importacao]')!.textContent).toContain('A gravação não conferiu')
        const linha = host.querySelector('[data-divergencia="itens"]')!
        expect(linha.textContent).toContain(n(755))
        expect(linha.textContent).toContain(n(754))
    })
})

describe('(3) DEPOIS da importação', () => {
    beforeEach(() => {
        responder(`GET ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: ULTIMA })
        responder(`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(T)}`, { status: 200, body: { formulas: 137, tipologias: TIPOLOGIAS } })
    })

    it('as contagens de cada arquivo, vindas da rota', async () => {
        const host = await montar(<Pagina />)
        const c = (k: string) => host.querySelector(`[data-contagem="${k}"]`)?.textContent
        expect(c('itens')).toBe(n(755))
        expect(c('regras')).toBe(n(4055))
        expect(c('tipologias')).toBe(n(157))
        expect(c('formulas')).toBe(n(137))
        expect(host.querySelector('[data-arquivo-da-importacao="tabela"] [data-contagem="itens"]')).not.toBeNull()
        expect(host.querySelector('[data-arquivo-da-importacao="motor"] [data-contagem="regras"]')).not.toBeNull()
    })

    it('o cruzamento: acharam preço, não acharam, normalizados', async () => {
        const host = await montar(<Pagina />)
        const c = (k: string) => host.querySelector(`[data-cruzamento] [data-contagem="${k}"]`)?.textContent
        expect(c('cruzam')).toBe(n(548))
        expect(c('nao_cruzam')).toBe(n(1))
        expect(c('normalizados')).toBe(n(3))
    })

    it('as tipologias na ORDEM DA ROTA, com linha, regras, condicionais e variáveis', async () => {
        const host = await montar(<Pagina />)
        const linhas = Array.from(host.querySelectorAll('[data-tipologia]'))
        expect(linhas.map((l) => l.getAttribute('data-tipologia'))).toEqual(['DP-148', 'DP-02', 'DP-01', 'AA-SEM'])
        expect(linhas[1].textContent).toContain('EUROPA 42')
        expect(linhas[1].textContent).toContain(n(192))
        expect(linhas[1].textContent).toContain(n(90))
        expect(linhas[1].textContent).toContain('ARE, ARI, CA, FV, HFOL, INT, MAE, MAI, MFI, MTE')
    })

    it('a tipologia sem regra condicional diz "nenhuma" — o vazio é medição', async () => {
        const host = await montar(<Pagina />)
        expect(host.querySelector('[data-tipologia="AA-SEM"] [data-variaveis]')!.textContent).toBe('nenhuma')
    })

    it('os avisos: cada um com o título e o texto legíveis, nunca o tipo cru', async () => {
        const host = await montar(<Pagina />)
        const avisos = Array.from(host.querySelectorAll('[data-aviso]'))
        expect(avisos).toHaveLength(3)
        AVISOS.forEach((a, i) => {
            const { titulo, texto } = textoDoAviso(a)
            expect(avisos[i].textContent).toContain(titulo)
            expect(avisos[i].textContent).toContain(texto)
            expect(host.textContent).not.toContain(a.tipo)
        })
    })

    it('a data da última importação e quem importou', async () => {
        const host = await montar(<Pagina />)
        const u = host.querySelector('[data-ultima-importacao]')!
        expect(u.textContent).toContain(quandoFoiImportado(ULTIMA.importado_em))
        expect(u.textContent).toContain('Cristiano')
    })

    it('importar de novo recarrega o que a rota e o banco dizem', async () => {
        responder(`GET ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: null }, { status: 200, body: ULTIMA })
        responder(`POST ${ROTAS_DO_CATALOGO.importacao(T)}`, { status: 200, body: { importacao_id: 'imp-9', contagens: {}, avisos: [] } })
        const host = await montar(<Pagina />)
        expect(host.querySelectorAll('[data-contagem]')).toHaveLength(0)
        await clicar(botao(host, 'Importar'))
        expect(pedidos).toContain(`POST ${ROTAS_DO_CATALOGO.importacao(T)}`)
        expect(host.querySelector('[data-contagem="itens"]')?.textContent).toBe(n(755))
        expect(host.querySelector('[data-erro-da-importacao]')).toBeNull()
    })
})

describe('(4) a tradução dos avisos', () => {
    it.each(AVISOS.map((a) => [a.tipo, a] as const))('%s tem título e texto, sem o identificador do código', (tipo, a) => {
        const { titulo, texto } = textoDoAviso(a)
        expect(titulo.length).toBeGreaterThan(0)
        expect(texto.length).toBeGreaterThan(0)
        expect(`${titulo} ${texto}`).not.toContain(tipo)
    })

    it('os dois avisos da categoria têm título e texto próprios, com a frase da rota', () => {
        const itens = textoDoAviso({ tipo: 'itens_sem_categoria_do_fornecedor', itens: 2, mensagem: '2 itens do arquivo não trazem a categoria do fornecedor.' })
        expect(itens).toEqual({ titulo: 'Itens sem a categoria do fornecedor', texto: '2 itens do arquivo não trazem a categoria do fornecedor.' })
        const sem = textoDoAviso({ tipo: 'tabela_sem_categoria_declarada', mensagem: 'Esta tabela não declara a categoria.' })
        expect(sem).toEqual({ titulo: 'Tabela sem categoria declarada', texto: 'Esta tabela não declara a categoria.' })
    })

    it('código repetido com valores DIFERENTES diz isso em voz alta', () => {
        const { texto } = textoDoAviso({ ...(AVISOS[0] as Extract<Aviso, { tipo: 'codigo_repetido' }>), valores_batem: false })
        expect(texto).toMatch(/VALORES DIFERENTES/)
        expect(textoDoAviso(AVISOS[0]).texto).not.toMatch(/VALORES DIFERENTES/)
    })

    it('a localização da célula — aba, linha e coluna — está no texto', () => {
        const { texto } = textoDoAviso(AVISOS[2])
        expect(texto).toContain('Tabela Wolff')
        expect(texto).toContain('12')
        expect(texto).toContain('13')
    })
})

describe('(5) a ordem das tipologias é a proporção de condicionais', () => {
    it('da maior para a menor; empate pelo nome', () => {
        const embaralhadas = [TIPOLOGIAS[3], TIPOLOGIAS[2], TIPOLOGIAS[0], TIPOLOGIAS[1],
            { tipologia: 'AB-SEM', linha: null, n_regras: 9, n_condicionais: 0, variaveis: [] }]
        expect(ordenarPorProporcaoDeCondicionais(embaralhadas).map((t) => t.tipologia)).toEqual(['DP-148', 'DP-02', 'DP-01', 'AA-SEM', 'AB-SEM'])
    })
})

describe('(5b) a tela NÃO leva o exceljs para o navegador', () => {
    // O leitor importa o `exceljs`. Um `import` de VALOR dele na tela, ou no módulo de apresentação,
    // embarcaria a biblioteca inteira no navegador — e foi isso que aconteceu na primeira versão
    // desta tela, achado porque o jsdom não carregou o módulo. Só `import type` passa.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    /* eslint-enable @typescript-eslint/no-require-imports */
    const raiz = path.resolve(__dirname, '..', '..', '..')
    // UM import por vez: `[^;]*` atravessaria vários `import`, num arquivo sem ponto e vírgula.
    const importaOLeitorPorValor = (t: string) => /^import\s+(?!type\b)(?:[\w*\s,]*\{[^}]*\}|[^\n{]*?)\s*from\s+['"]@\/utils\/atendimentos-ia-importacao['"]/m.test(t)
    const importaOExceljs = (t: string) => /from\s+['"]exceljs['"]|require\(['"]exceljs['"]\)/.test(t)

    it.each([
        ['src/pages/super-admin/atendimentos-ia/tabelas/[id]/importacao.tsx'],
        ['src/utils/atendimentos-ia-importacao-apresentacao.ts'],
    ])('%s importa do leitor só tipo, e nada do exceljs', (arquivo) => {
        const t = fs.readFileSync(path.join(raiz, arquivo), 'utf8')
        expect(importaOLeitorPorValor(t)).toBe(false)
        expect(importaOExceljs(t)).toBe(false)
    })

    it('o detector enxerga o que procura', () => {
        expect(importaOLeitorPorValor("import { textoDoAviso } from '@/utils/atendimentos-ia-importacao'")).toBe(true)
        expect(importaOLeitorPorValor("import type { Aviso } from '@/utils/atendimentos-ia-importacao'")).toBe(false)
        expect(importaOLeitorPorValor("import { x } from '@/utils/atendimentos-ia-importacao-apresentacao'")).toBe(false)
        expect(importaOLeitorPorValor("import {\n    textoDoAviso,\n} from '@/utils/atendimentos-ia-importacao'")).toBe(true)
        expect(importaOLeitorPorValor("import React from 'react'\nimport type { Aviso } from '@/utils/atendimentos-ia-importacao'")).toBe(false)
        expect(importaOExceljs("import ExcelJS from 'exceljs'")).toBe(true)
    })
})

describe('(6) a linha da tabela, no fornecedor, leva à importação', () => {
    it('o botão "Importação" da linha navega para a tela da tabela', async () => {
        consulta = { id: 'f1' }
        const FORN: FornecedorComTabelas = {
            id: 'f1', nome: 'Wolf Perfis', nicho_id: 'n1', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 1, contas_usando: [],
            tabelas_da_lista: [{ id: T, fornecedor_id: 'f1', arquivo_nome: 'Tabela Wolff.xlsm', arquivo_path: 'p', motor_nome: 'Motor.xlsx', motor_path: 'm', vigencia: null, familia: null, categoria_chave: null, vigente: false, criado_em: '2026-10-20T00:00:00Z', contas_usando: [] }],
        }
        responder(`GET ${ROTAS_DO_CATALOGO.fornecedor('f1')}`, { status: 200, body: FORN })
        responder(`GET ${ROTAS_DO_CATALOGO.nichos}`, { status: 200, body: [] })
        responder(`GET ${ROTAS_DO_CATALOGO.familias}`, { status: 200, body: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }] })
        responder(`GET ${ROTAS_DO_CATALOGO.categorias}`, { status: 200, body: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }] })
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PaginaDoFornecedor = require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType
        const host = await montar(<PaginaDoFornecedor />)
        await clicar(botao(host.querySelector('tbody')!, 'Importação'))
        expect(pushes).toEqual([`${ROUTES.SUPER_ADMIN_IA_TABELAS}/${T}/importacao`])
    })
})
