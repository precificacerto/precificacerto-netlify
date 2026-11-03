/**
 * PORTÃO — a TELA da base de conhecimento em TRÊS NÍVEIS: o cartão "Matérias-primas e seus
 * fornecedores", que grava pela rota PUT /arvore (função `superadmin_gravar_arvore`, migração
 * `20261023000004`, refeita pela `20261103000002`).
 *
 * O que este portão prova, e cada asserção fica VERMELHA sem a sua correção (a tabela das mutações
 * está no corpo do PR):
 *   (1) as categorias, na ORDEM do catálogo, com o número e o rótulo DELE — o catálogo chega
 *       embaralhado de propósito, para a tela não poder confiar na ordem da resposta;
 *   (2) matéria-prima nova: as categorias do catálogo e NENHUM valor inventado;
 *   (3) a árvore do PUT é exatamente a esperada: só o que mudou, null para o que foi limpo, e a chave
 *       AUSENTE para o que não foi tocado — e `ordem` em lugar nenhum;
 *   (4) sem matéria-prima na tela, o corpo NÃO tem `materias_primas`; remoção vai em `remover`;
 *   (7) a mensagem da função chega INTEIRA, no cartão da categoria que ela nomeia;
 *   (8) remover e gravar a mesma matéria-prima no mesmo salvar é barrado NA TELA;
 *   (9) depois do salvar, a tela se redesenha pelo `depois` que a rota devolveu;
 *  (10) DESDE 03/11/2026 (dono do produto: "CAMPOS DA CATEGORIA VIRAM UM CAMPO DE INSTRUÇÃO"): de campo estruturado, a tela
 *       mostra SÓ as cores e a serra do Perfil — mesmo com as outras definições no catálogo (a tela pode ir antes da migração) —,
 *       e as listas de vidro, ferragem e acabamento não existem mais;
 *  (13) a INSTRUÇÃO de cada categoria: o campo em todas, o gravado, o corpo (aparada, vazia é null, a não tocada AUSENTE), o
 *       limite de 1.500 contado como o banco conta, e o round-trip pelo `depois`.
 *
 * O que ele NÃO alcança: a função. O banco é falso — o `fetch` só registra o pedido e devolve o
 * que o caso manda. O que a função faz com a árvore está provado em `scripts/harness/arvore/` e
 * `scripts/harness/instrucao-da-categoria/`.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROTAS_DO_CATALOGO, type ContaLigada } from '@/utils/atendimentos-ia-catalogo'
import { CAMPOS_QUE_FICAM, LIMITE_DA_INSTRUCAO, fraseDoLimiteDaInstrucao } from '@/lib/atendimentos-ia/base-de-conhecimento'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const CONTA = '00000000-0000-4000-8000-0000000000a1'
const N_ESQ = '00000000-0000-4000-8000-0000000000e5'
const PVC = '00000000-0000-4000-8000-00000000d001'
const F_WOLFF = '00000000-0000-4000-8000-0000000000f1'
const F_ALCOA = '00000000-0000-4000-8000-0000000000f2'
const F_FORA = '00000000-0000-4000-8000-0000000000f3'
const F_HYDRO = '00000000-0000-4000-8000-0000000000f4'

jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/contas/[tenantId]/base-de-conhecimento', asPath: '/', query: { tenantId: CONTA }, replace: () => {}, push: () => {},
        events: { on: () => {}, off: () => {}, emit: () => {} } }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({
    Layout: ({ children, title }: { children: React.ReactNode; title?: string }) => <div><h1 data-titulo>{title}</h1>{children}</div>,
}))

/* eslint-disable @typescript-eslint/no-require-imports */
// Lidos DENTRO dos casos: no commit do portão o módulo da árvore ainda não existe, e um `require` no
// topo derrubaria o arquivo inteiro de uma vez.
type Formulario = typeof import('@/page-parts/atendimentos-ia/base-de-conhecimento/formulario')
type Arvore = typeof import('@/page-parts/atendimentos-ia/base-de-conhecimento/arvore')
const F = () => require('@/page-parts/atendimentos-ia/base-de-conhecimento/formulario') as Formulario
const A = () => require('@/page-parts/atendimentos-ia/base-de-conhecimento/arvore') as Arvore
const APagina = () => require('@/pages/super-admin/atendimentos-ia/contas/[tenantId]/base-de-conhecimento').default as React.ComponentType
/* eslint-enable @typescript-eslint/no-require-imports */

type Linha = Record<string, unknown>
const CONTAS: ContaLigada[] = [{ tenant_id: CONTA, nome: 'Vidraçaria Alfa', modelo: 'FABRICACAO', nicho_id: N_ESQ, nicho_nome: 'Esquadrias' }]

// O catálogo de PRODUÇÃO, medido em 23/10/2026 — EMBARALHADO de propósito: a ordem é `ordem`.
const catalogo = () => ({
    categorias: [
        { chave: 'VIDRO', ordem: 5, rotulo: 'Vidro' }, { chave: 'PERFIL', ordem: 1, rotulo: 'Perfil' },
        { chave: 'INSTALACAO', ordem: 6, rotulo: 'Instalação' }, { chave: 'REFORCO', ordem: 2, rotulo: 'Reforço de aço' },
        { chave: 'ACESSORIOS_VEDACAO', ordem: 4, rotulo: 'Acessórios e vedação' }, { chave: 'FERRAGENS', ordem: 3, rotulo: 'Ferragens' },
    ],
    campos: [
        { categoria_chave: 'PERFIL', chave: 'solda', tipo: 'texto', rotulo: 'Solda', ordem: 6 },
        { categoria_chave: 'PERFIL', chave: 'linha', tipo: 'texto', rotulo: 'Linha', ordem: 1 },
        { categoria_chave: 'PERFIL', chave: 'cores', tipo: 'lista_texto', rotulo: 'Cores que trabalha', ordem: 3 },
        { categoria_chave: 'PERFIL', chave: 'cor_predominante', tipo: 'texto', rotulo: 'Cor predominante', ordem: 2 },
        { categoria_chave: 'PERFIL', chave: 'serra_mm', tipo: 'inteiro', rotulo: 'Serra (mm)', ordem: 5 },
        { categoria_chave: 'PERFIL', chave: 'barra_mm', tipo: 'inteiro', rotulo: 'Barra (mm)', ordem: 4 },
        // um campo de TEXTO do Perfil que NÃO é dos que ficam: a tela não pode mostrá-lo (03/11/2026)
        { categoria_chave: 'PERFIL', chave: 'observacao', tipo: 'texto', rotulo: 'Observação (campo do teste)', ordem: 8 },
        { categoria_chave: 'REFORCO', chave: 'material', tipo: 'texto', rotulo: 'Material', ordem: 2 },
        { categoria_chave: 'REFORCO', chave: 'usa', tipo: 'booleano', rotulo: 'Usa reforço', ordem: 1 },
        { categoria_chave: 'REFORCO', chave: 'par_inox_referencia', tipo: 'texto', rotulo: 'Referência do par em inox', ordem: 3 },
        { categoria_chave: 'ACESSORIOS_VEDACAO', chave: 'vedacao', tipo: 'texto', rotulo: 'Vedação', ordem: 3 },
        { categoria_chave: 'ACESSORIOS_VEDACAO', chave: 'cor_por_perfil', tipo: 'mapa', rotulo: 'Cor do acessório por cor de perfil', ordem: 1 },
        { categoria_chave: 'ACESSORIOS_VEDACAO', chave: 'modelo_interlock', tipo: 'texto', rotulo: 'Modelo do interlock', ordem: 2 },
    ],
})
const ORDEM_DO_CATALOGO = ['PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO']
/** O "M" de "N de M categorias" é o tamanho do catálogo DO TESTE — nunca um 6 escrito à mão. */
const TOTAL_DO_CATALOGO = catalogo().categorias.length

const categoria = (chave: string, resto: Linha = {}): Linha => ({
    id: `cat-pvc-${chave}`, tenant_id: CONTA, materia_prima_id: PVC, categoria_chave: chave, config: null, instrucao: null, atualizado_por: null, atualizado_em: '2026-10-23T12:00:00Z',
    fornecedores: [], ...resto,
})
function arvoreGravada(): Linha {
    return {
        tenant_id: CONTA,
        nicho: { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
        catalogo: catalogo(),
        // cada fornecedor tem tabela de TODAS as categorias: estes casos não são sobre o filtro (28/10/2026) — o filtro está em base-de-conhecimento-fornecedor-por-categoria.test.tsx
        fornecedores_do_nicho: [{ id: F_ALCOA, nome: 'Alcoa' }, { id: F_HYDRO, nome: 'Hydro' }, { id: F_WOLFF, nome: 'Wolff' }].map((f) => ({ ...f, categorias_das_tabelas: ORDEM_DO_CATALOGO, tabelas_sem_categoria: 0 })),
        // medido em produção, 23/10/2026, POR FONTE: DESIGN tem 139 regras e nenhuma fórmula de família — e o Wolff é o principal do PERFIL
        linhas_por_fornecedor: { [F_WOLFF]: { formula: ['EUROPA 42', 'EUROPA 60'], regra: ['DESIGN', 'EUROPA 42', 'EUROPA 60'] } },
        materias_primas: [{
            id: PVC, tenant_id: CONTA, nome: 'PVC', ordem: 1, atualizado_por: null, atualizado_em: null,
            categorias: [
                categoria('PERFIL', {
                    config: { linha: 'Suprema', cor_predominante: null, cores: ['Branco'], barra_mm: 6000, serra_mm: 5, observacao: 'nota gravada' },
                    fornecedores: [
                        { id: 'r1', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-PERFIL', fornecedor_id: F_WOLFF, principal: true, ordem: 1, nome_do_fornecedor: 'Wolff' },
                        { id: 'r2', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-PERFIL', fornecedor_id: F_FORA, principal: false, ordem: 2, nome_do_fornecedor: 'Madeireira' },
                    ],
                }),
                categoria('REFORCO', { config: { usa: false } }),
                categoria('FERRAGENS'),
                categoria('ACESSORIOS_VEDACAO'),
                categoria('VIDRO', { instrucao: 'Dúvida de vidro: consulte a tabela da Estrela.' }),
                categoria('INSTALACAO'),
            ],
        }],
    }
}
// A base da empresa (adicionais, ambientes, vendedores): o que o cartão novo NÃO toca.
const baseGravada = (): Linha => ({
    tenant_id: CONTA, nicho: { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
    esquadrias: { empresa: null, nicho: null, efetivo: {} },
    adicionais: null, ambientes: [], vendedores: [],
})

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: { url: string; metodo: string; corpo: unknown }[] = []
beforeEach(() => {
    pedidos.length = 0
    const R = F().ROTAS_DA_BASE
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.contas}`]: { status: 200, body: CONTAS },
        [`GET ${R.base(CONTA)}`]: { status: 200, body: baseGravada() },
        [`GET ${R.funcionarios(CONTA)}`]: { status: 200, body: { funcionarios: [] } },
        [`GET ${R.arvore(CONTA)}`]: { status: 200, body: arvoreGravada() },
        [`PUT ${R.arvore(CONTA)}`]: { status: 200, body: { depois: depoisDe(arvoreGravada()) } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const metodo = init?.method ?? 'GET'
        pedidos.push({ url, metodo, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[`${metodo} ${url}`] ?? { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

/** O `depois` que a função devolve: as tabelas, planas, como a 20261023000004 as lê (a categoria com a `instrucao`, coluna da 20261103000002). */
function depoisDe(arvore: Linha): Linha {
    const mps = arvore.materias_primas as Array<Linha & { categorias: Array<Linha & Record<string, Linha[]>> }>
    const cats = mps.flatMap((m) => m.categorias)
    const tira = (l: Linha, ...k: string[]) => Object.fromEntries(Object.entries(l).filter(([x]) => !k.includes(x)))
    return {
        orcamentista_materia_prima: mps.map((m) => tira(m, 'categorias')),
        orcamentista_mp_categoria: cats.map((c) => tira(c, 'fornecedores', 'vidros', 'ferragens', 'instalacao')),
        orcamentista_mp_categoria_fornecedor: cats.flatMap((c) => (c.fornecedores ?? []).map((f) => tira(f, 'nome_do_fornecedor'))),
        orcamentista_mp_vidro: cats.flatMap((c) => c.vidros ?? []),
        orcamentista_mp_ferragem: cats.flatMap((c) => c.ferragens ?? []),
        orcamentista_mp_instalacao: cats.flatMap((c) => c.instalacao ?? []),
    }
}

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const Pagina = APagina()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(<Pagina />) })
    await assentar()
    await assentar()
    return host
}

const cartao = (host: ParentNode) => host.querySelector('[data-bloco="materias"]') as HTMLElement
const mp = (host: ParentNode, i: number) => cartao(host).querySelector(`[data-materia-prima="${i}"]`) as HTMLElement
const cat = (host: ParentNode, i: number, chave: string) => mp(host, i).querySelector(`[data-categoria="${chave}"]`) as HTMLElement
const campo = (raiz: ParentNode, c: string) => raiz.querySelector(`[data-campo="${c}"]`) as HTMLElement | null
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === texto) as HTMLButtonElement | undefined
async function clicar(el: HTMLElement | undefined | null) {
    if (!el) throw new Error('elemento não encontrado')
    await act(async () => { el.click() })
    await assentar()
}
async function digitar(input: HTMLInputElement | null | undefined, valor: string) {
    if (!input) throw new Error('input não encontrado')
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { input.dispatchEvent(new Event('blur', { bubbles: true })) })
}
const instrucao = (raiz: ParentNode) => raiz.querySelector('[data-instrucao] textarea') as HTMLTextAreaElement | null
const contador = (raiz: ParentNode) => (raiz.querySelector('[data-contador-da-instrucao]')?.textContent ?? null)
async function escreverNaInstrucao(area: HTMLTextAreaElement | null, valor: string) {
    if (!area) throw new Error('instrução não encontrada')
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, valor)
        area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await assentar()
}
async function escolherNoSeletor(el: HTMLElement | null, texto: string) {
    if (!el) throw new Error('seletor não encontrado')
    await act(async () => { (el.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    const listas = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
    const ultima = listas[listas.length - 1] as HTMLElement
    const opcao = Array.from(ultima.querySelectorAll('.ant-select-item-option')).find((o) => (o.textContent || '').trim() === texto) as HTMLElement
    if (!opcao) throw new Error(`opção ${texto} não encontrada`)
    await act(async () => { opcao.click() })
    await assentar()
}
async function opcoesDoSeletor(el: HTMLElement | null): Promise<string[]> {
    if (!el) throw new Error('seletor não encontrado')
    await act(async () => { (el.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    const listas = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
    return Array.from(listas[listas.length - 1].querySelectorAll('.ant-select-item-option')).map((o) => (o.textContent || '').trim())
}
const entrada = (raiz: ParentNode | null) => raiz?.querySelector('input') as HTMLInputElement | null
const botaoDeSalvar = (host: ParentNode) => host.querySelector('[data-empresa-no-topo] [data-salvar-alteracoes]') as HTMLButtonElement
const pendencias = (host: ParentNode) => host.querySelector('[data-empresa-no-topo] [data-pendencias]')?.textContent ?? null
async function salvar(host: ParentNode) { await clicar(botaoDeSalvar(host)); await assentar() }
const putsDaArvore = () => pedidos.filter((p) => p.metodo === 'PUT' && p.url === F().ROTAS_DA_BASE.arvore(CONTA))
const arvoreEnviada = () => { const p = putsDaArvore(); expect(p).toHaveLength(1); return (p[0].corpo as { arvore: Linha }).arvore }
/** Toda chave de um JSON, em qualquer profundidade — para afirmar ausência sobre o VALOR, não sobre o texto serializado. */
function chaves(v: unknown): string[] {
    if (Array.isArray(v)) return v.flatMap(chaves)
    if (v && typeof v === 'object') return Object.entries(v as Linha).flatMap(([k, x]) => [k, ...chaves(x)])
    return []
}

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) o cartão, os blocos e as categorias na ordem do CATÁLOGO', () => {
    it('um cartão "Matérias-primas e seus fornecedores", um bloco por matéria-prima, e o miolo antigo não existe mais', async () => {
        const host = await montar()
        expect(cartao(host).textContent).toContain(A().TITULO_DO_CARTAO)
        expect(cartao(host).querySelectorAll('[data-materia-prima]')).toHaveLength(1)
        expect(Array.from(host.querySelectorAll('[data-bloco]')).map((b) => b.getAttribute('data-bloco'))).toEqual(['materias', 'ambientes', 'vendedores', 'adicionais'])
    })

    it('o cabeçalho (29/10/2026): o nome e, na BORDA DIREITA, "Remover família" — o "N de M categorias" saiu', async () => {
        const host = await montar()
        const cabeca = mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement
        expect(cabeca.textContent).toContain('PVC')
        expect(cabeca.querySelector('[data-categorias-configuradas]')).toBeNull()
        expect(cabeca.textContent).not.toContain(`3 de ${TOTAL_DO_CATALOGO}`)
        expect(cabeca.textContent).not.toMatch(/categorias/i)
        const remover = botao(cabeca, A().REMOVER_FAMILIA)!
        expect(remover).toBeDefined()
        expect(remover.hasAttribute('data-remover-familia')).toBe(true)
        expect(cabeca.lastElementChild).toBe(remover)
        expect(remover.style.marginLeft).toBe('auto')
        expect(botao(cabeca, 'Remover')).toBeUndefined()
    })

    it('as categorias na ordem do catálogo, com "número · rótulo" vindos dele — e o catálogo veio embaralhado', async () => {
        const host = await montar()
        const cats = Array.from(mp(host, 0).querySelectorAll('[data-categoria]'))
        expect(cats.map((c) => c.getAttribute('data-categoria'))).toEqual(ORDEM_DO_CATALOGO)
        const esperados = [...catalogo().categorias].sort((a, b) => a.ordem - b.ordem).map((c) => `${c.ordem} · ${c.rotulo}`)
        expect(cats.map((c) => c.querySelector('[data-titulo-da-categoria]')!.textContent)).toEqual(esperados)
    })

    it('o nome da matéria-prima GRAVADA não se edita — a chave é lower(nome) e não há renomear', async () => {
        const host = await montar()
        expect(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima] input')).toBeNull()
    })
})

describe('(2) matéria-prima NOVA: as categorias do catálogo, e nada inventado', () => {
    it('"+ Adicionar matéria-prima" abre um bloco com as categorias na ordem e o nome a digitar', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        expect(Array.from(mp(host, 1).querySelectorAll('[data-categoria]')).map((c) => c.getAttribute('data-categoria'))).toEqual(ORDEM_DO_CATALOGO)
        expect(mp(host, 1).querySelector('[data-cabecalho-da-materia-prima] input')).not.toBeNull()
    })

    it('NENHUM valor inventado: cores e serra vazias, instrução vazia em toda categoria, sem fornecedor', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        const bloco = mp(host, 1)
        expect(entrada(campo(cat(host, 1, 'PERFIL'), 'PERFIL.serra_mm'))!.value).toBe('')
        expect(campo(cat(host, 1, 'PERFIL'), 'PERFIL.cores')!.querySelectorAll('.ant-select-selection-item')).toHaveLength(0)
        for (const chave of ORDEM_DO_CATALOGO) expect(instrucao(cat(host, 1, chave))!.value).toBe('')
        expect(bloco.querySelectorAll('[data-fornecedor]')).toHaveLength(0)
    })

    it('a nova SÓ com o nome vai como { nome } — sem categoria nenhuma, e depois da gravada, que vai inteira', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 1).querySelector('[data-cabecalho-da-materia-prima]')), 'Alumínio')
        await salvar(host)
        expect(arvoreEnviada()).toEqual({ materias_primas: [{ nome: 'PVC' }, { nome: 'Alumínio' }] })
    })
})

describe('(3) a árvore do PUT: só o que mudou — null limpa, ausente não mexe', () => {
    it('sem nada tocado, nenhum PUT /arvore', async () => {
        const host = await montar()
        expect(botaoDeSalvar(host).disabled).toBe(true)
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
    })

    it('número digitado vai como NÚMERO, e só a chave mudada vai no config', async () => {
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await salvar(host)
        const categorias = (arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias
        expect(categorias).toEqual([{ categoria_chave: 'PERFIL', config: { serra_mm: 4 } }])
        expect('instrucao' in categorias[0]).toBe(false)
        expect('fornecedores' in categorias[0]).toBe(false)
    })

    it('o inteiro gravado e apagado vai null', async () => {
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '')
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([
            { categoria_chave: 'PERFIL', config: { serra_mm: null } },
        ])
    })

    it('`ordem` não vai em lugar nenhum do corpo', async () => {
        const host = await montar()
        await escolherNoSeletor(cat(host, 0, 'VIDRO').querySelector('[data-novo-fornecedor]'), 'Hydro')
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 1).querySelector('[data-cabecalho-da-materia-prima]')), 'Alumínio')
        await salvar(host)
        const arvore = arvoreEnviada()
        expect(chaves(arvore)).toContain('fornecedor_id')
        expect(chaves(arvore)).not.toContain('ordem')
    })

    it('a contagem de pendências acompanha a árvore, e desfazer tira da conta', async () => {
        const host = await montar()
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
        await escreverNaInstrucao(instrucao(cat(host, 0, 'REFORCO')), 'Reforço: só em vão acima de 1,5 m.')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(2))
        // de volta ao GRAVADO: deixa de ser pendência
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '5')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
    })
})

describe('(4) sem matéria-prima, o corpo NÃO tem materias_primas; remoção vai em remover', () => {
    it('remover a única gravada: { remover: [id] } — e a chave materias_primas não existe', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, A().REMOVER_FAMILIA))
        await salvar(host)
        const arvore = arvoreEnviada()
        expect(arvore).toEqual({ remover: [PVC] })
        expect('materias_primas' in arvore).toBe(false)
    })

    it('o contraste: removida a gravada e acrescentada outra, materias_primas volta, com a lista inteira', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, A().REMOVER_FAMILIA))
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]')), 'Alumínio')
        await salvar(host)
        expect(arvoreEnviada()).toEqual({ materias_primas: [{ nome: 'Alumínio' }], remover: [PVC] })
    })

    it('"Desfazer" devolve a matéria-prima NA POSIÇÃO GRAVADA — no fim, a lista iria reordenada para a função 1', async () => {
        const arv = arvoreGravada()
        const mps = arv.materias_primas as Linha[]
        mps.push({ id: '00000000-0000-4000-8000-00000000d002', tenant_id: CONTA, nome: 'Alumínio', ordem: 2, atualizado_por: null, atualizado_em: null, categorias: [] })
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: arv }
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, A().REMOVER_FAMILIA))
        expect(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]')!.textContent).toContain('Alumínio')
        await clicar(botao(cartao(host).querySelector('[data-removidas]') as HTMLElement, 'Desfazer'))
        const nomes = [0, 1].map((i) => mp(host, i).querySelector('[data-cabecalho-da-materia-prima] h5')!.textContent)
        expect(nomes).toEqual(['PVC', 'Alumínio'])
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })

    it('a removida fica listada, e "Desfazer" a devolve sem nada a salvar', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, A().REMOVER_FAMILIA))
        const removidas = cartao(host).querySelector('[data-removidas]') as HTMLElement
        expect(removidas.textContent).toContain('PVC')
        await clicar(botao(removidas, 'Desfazer'))
        expect(cartao(host).querySelector('[data-removidas]')).toBeNull()
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })
})

describe('fornecedores: chips, o primeiro é o principal, e "+ fornecedor" vem do NICHO', () => {
    it('os chips na ordem gravada, o principal marcado, e o gravado fora do nicho aparece com o nome e a marca', async () => {
        const host = await montar()
        const chips = Array.from(cat(host, 0, 'PERFIL').querySelectorAll('[data-fornecedor]'))
        expect(chips.map((c) => c.getAttribute('data-fornecedor'))).toEqual([F_WOLFF, F_FORA])
        expect(chips[0].querySelector('[data-principal]')).not.toBeNull()
        expect(chips[1].querySelector('[data-principal]')).toBeNull()
        expect(chips[1].textContent).toContain('Madeireira')
        expect(chips[1].querySelector('[data-fora-do-nicho]')).not.toBeNull()
    })

    it('"+ fornecedor" oferece os do nicho que ainda não estão na categoria', async () => {
        const host = await montar()
        expect(await opcoesDoSeletor(cat(host, 0, 'PERFIL').querySelector('[data-novo-fornecedor]'))).toEqual(['Alcoa', 'Hydro'])
    })

    it('acrescentar e tornar principal: a lista inteira, na ordem, com UM principal — o primeiro', async () => {
        const host = await montar()
        await escolherNoSeletor(cat(host, 0, 'PERFIL').querySelector('[data-novo-fornecedor]'), 'Hydro')
        await clicar(cat(host, 0, 'PERFIL').querySelector(`[data-fornecedor="${F_HYDRO}"] [data-tornar-principal]`) as HTMLElement)
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([
            { categoria_chave: 'PERFIL', fornecedores: [{ fornecedor_id: F_HYDRO, principal: true }, { fornecedor_id: F_WOLFF, principal: false }, { fornecedor_id: F_FORA, principal: false }] },
        ])
    })
})

describe('(7) a mensagem da FUNÇÃO chega inteira, no cartão que ela nomeia', () => {
    const MENSAGEM = `materia-prima PVC, categoria PERFIL, fornecedores: fornecedor(es) que nao sao do nicho da empresa: ${F_FORA}`

    it('400 com o caminho: a mensagem COMO VEIO, dentro do cartão da categoria PERFIL do PVC — e a pendência fica', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 400, body: { error: MENSAGEM } }
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await salvar(host)
        expect(cat(host, 0, 'PERFIL').querySelector('[data-erro-da-arvore]')!.textContent).toContain(MENSAGEM)
        expect(cat(host, 0, 'VIDRO').querySelector('[data-erro-da-arvore]')).toBeNull()
        expect(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm'))!.value).toBe('4')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
    })

    it('a recusa da INSTRUÇÃO vinda da função ("..., categoria VIDRO, instrucao: ...") cai no cartão do Vidro', async () => {
        const recusa = 'materia-prima PVC, categoria VIDRO, instrucao: a instrucao tem 1501 caracteres; o limite e 1500'
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 400, body: { error: recusa } }
        const host = await montar()
        await escreverNaInstrucao(instrucao(cat(host, 0, 'VIDRO')), 'Outra instrução.')
        await salvar(host)
        expect(cat(host, 0, 'VIDRO').querySelector('[data-erro-da-arvore]')!.textContent).toContain(recusa)
        expect(cat(host, 0, 'PERFIL').querySelector('[data-erro-da-arvore]')).toBeNull()
    })

    it('mensagem sem caminho (ex.: 403): no topo do cartão, inteira', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 403, body: { error: 'o autor da alteracao nao e super admin' } }
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await salvar(host)
        const noTopo = cartao(host).querySelector(':scope > .ant-card-body > [data-erro-da-arvore]') as HTMLElement
        expect(noTopo.textContent).toContain('o autor da alteracao nao e super admin')
    })

    it('falha ao LER a árvore: erro no cartão, e nenhum bloco de matéria-prima vazio no lugar', async () => {
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 500, body: { error: 'Falha ao ler a base de conhecimento.' } }
        const host = await montar()
        expect(cartao(host).textContent).toContain('Falha ao ler a base de conhecimento.')
        expect(cartao(host).querySelectorAll('[data-materia-prima]')).toHaveLength(0)
        expect(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA)).toBeUndefined()
    })
})

describe('(8) remover e gravar a MESMA matéria-prima no mesmo salvar: a tela barra', () => {
    it('removida a PVC, uma nova chamada "pvc": a tela diz por quê, e o PUT /arvore não sai', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, A().REMOVER_FAMILIA))
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]')), 'pvc')
        expect(mp(host, 0).textContent).toContain(A().fraseRemoverEGravar('pvc'))
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
    })

    it('o contraste: outro nome passa', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, A().REMOVER_FAMILIA))
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]')), 'PVC Premium')
        expect(mp(host, 0).textContent).not.toContain(A().fraseRemoverEGravar('PVC Premium'))
        await salvar(host)
        expect(putsDaArvore()).toHaveLength(1)
    })
})

describe('(9) depois do salvar, a tela é o que o BANCO gravou', () => {
    it('redesenha pelo `depois` da resposta — não pelo que estava digitado', async () => {
        const doBanco = arvoreGravada()
        const perfil = (doBanco.materias_primas as Array<{ categorias: Linha[] }>)[0].categorias[0]
        perfil.config = { ...(perfil.config as Linha), serra_mm: 3 }
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: { depois: depoisDe(doBanco) } }
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await salvar(host)
        expect(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm'))!.value).toBe('3')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
        // e o GET da árvore não foi refeito: a fonte é a resposta do PUT
        expect(pedidos.filter((p) => p.metodo === 'GET' && p.url === F().ROTAS_DA_BASE.arvore(CONTA))).toHaveLength(1)
    })

    it('o nome do fornecedor continua no chip depois do redesenho (o `depois` não traz nome)', async () => {
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await salvar(host)
        const chips = Array.from(cat(host, 0, 'PERFIL').querySelectorAll('[data-fornecedor]'))
        expect(chips.map((c) => (c.querySelector('[data-nome-do-fornecedor]')!.textContent || '').trim())).toEqual(['Wolff', 'Madeireira'])
    })
})

describe('(10) de campo estruturado, SÓ as cores e a serra do Perfil (03/11/2026) — e nenhuma lista', () => {
    it('a lista que fica é a do dono do produto: cores e serra_mm, só no PERFIL', () => {
        // escrita aqui, não lida da constante: "cores e serra_mm FICAM estruturados, como exceção, e só eles"
        expect(CAMPOS_QUE_FICAM).toEqual({ PERFIL: ['cores', 'serra_mm'] })
    })

    it('com as 13 definições ainda no catálogo (a tela pode ir antes da migração), a GRAVADA e a NOVA mostram no PERFIL só cores e serra, e nada nas outras', async () => {
        const host = await montar()
        const naTela = (i: number, chave: string) => Array.from(cat(host, i, chave).querySelectorAll('[data-campo]')).map((c) => c.getAttribute('data-campo'))
        expect(naTela(0, 'PERFIL')).toEqual(['PERFIL.cores', 'PERFIL.serra_mm'])
        for (const chave of ORDEM_DO_CATALOGO.filter((k) => k !== 'PERFIL')) expect(naTela(0, chave)).toEqual([])
        expect(cat(host, 0, 'PERFIL').textContent).not.toContain('Suprema')
        expect(cat(host, 0, 'PERFIL').textContent).not.toContain('nota gravada')
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        expect(naTela(1, 'PERFIL')).toEqual(['PERFIL.cores', 'PERFIL.serra_mm'])
        for (const chave of ORDEM_DO_CATALOGO.filter((k) => k !== 'PERFIL')) expect(naTela(1, chave)).toEqual([])
    })

    it('o gravado das duas aparece: as cores como etiquetas, a serra como número', async () => {
        const host = await montar()
        const etiquetas = Array.from(campo(cat(host, 0, 'PERFIL'), 'PERFIL.cores')!.querySelectorAll('.ant-select-selection-item')).map((e) => (e.textContent || '').trim())
        expect(etiquetas).toEqual(['Branco'])
        expect(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm'))!.value).toBe('5')
    })

    it('um campo NOVO no catálogo (de qualquer categoria) NÃO aparece — a lista dos que ficam é fechada', async () => {
        const arv = arvoreGravada()
        ;(arv.catalogo as { campos: Linha[] }).campos.push(
            { categoria_chave: 'REFORCO', chave: 'espessura_mm', tipo: 'numero', rotulo: 'Espessura (mm)', ordem: 4 },
            { categoria_chave: 'PERFIL', chave: 'acabamento', tipo: 'opcao', rotulo: 'Acabamento', ordem: 7, opcoes: ['FOSCO', 'BRILHO'] },
        )
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: arv }
        const host = await montar()
        expect(campo(cat(host, 0, 'REFORCO'), 'REFORCO.espessura_mm')).toBeNull()
        expect(campo(cat(host, 0, 'PERFIL'), 'PERFIL.acabamento')).toBeNull()
    })

    it('salvar a serra NÃO manda os que saíram: o config enviado é só { serra_mm }', async () => {
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await salvar(host)
        expect(configDoPerfilEnviado()).toEqual({ serra_mm: 4 })
    })

    it('as listas de vidro, ferragem e acabamento não existem mais na tela — nem a tabela, nem o "Adicionar"', async () => {
        const host = await montar()
        expect(cartao(host).querySelectorAll('[data-vidro], [data-ferragem], [data-produto]')).toHaveLength(0)
        expect(cartao(host).querySelectorAll('table')).toHaveLength(0)
        expect(Array.from(cartao(host).querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter((t) => /vidro|ferragem/i.test(t))).toEqual([])
    })

    it('normalizar NUNCA devolve undefined: o tipo desconhecido é ausente — { valor: null, erro: null }', () => {
        expect(A().normalizar('tipo_que_a_tela_nao_conhece' as never, 'qualquer')).toEqual({ valor: null, erro: null })
        expect(A().normalizar('opcao', '  BARRA_INTEIRA ')).toEqual({ valor: 'BARRA_INTEIRA', erro: null })
        expect(A().normalizar('opcao', '')).toEqual({ valor: null, erro: null })
    })
})

const configDoPerfilEnviado = () =>
    ((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias.find((c) => c.categoria_chave === 'PERFIL') ?? {}).config as Linha | undefined
function servir(arvore: Linha) {
    respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: arvore }
    respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: { depois: depoisDe(arvore) } }
}
const categoriasEnviadas = () => (arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias

describe('(13) a INSTRUÇÃO da categoria: em todas, o gravado, o corpo, o limite e o round-trip', () => {
    it('toda categoria tem o campo, com o rótulo, a ajuda e o nome acessível que nomeia a categoria', async () => {
        const host = await montar()
        for (const chave of ORDEM_DO_CATALOGO) {
            const bloco = cat(host, 0, chave).querySelector('[data-instrucao]') as HTMLElement
            expect(bloco.getAttribute('data-instrucao')).toBe(chave)
            expect(bloco.textContent).toContain(A().ROTULO_DA_INSTRUCAO)
            expect(bloco.textContent).toContain(A().AJUDA_DA_INSTRUCAO)
            const rotulo = catalogo().categorias.find((k) => k.chave === chave)!.rotulo
            expect(instrucao(cat(host, 0, chave))!.getAttribute('aria-label')).toBe(`${A().ROTULO_DA_INSTRUCAO} de ${rotulo}`)
        }
    })

    it('o gravado aparece no Vidro, e o contador conta; a NULL aparece vazia, com 0', async () => {
        const host = await montar()
        const gravada = 'Dúvida de vidro: consulte a tabela da Estrela.'
        expect(instrucao(cat(host, 0, 'VIDRO'))!.value).toBe(gravada)
        expect(contador(cat(host, 0, 'VIDRO'))).toBe(`${[...gravada].length} / 1.500`)
        expect(instrucao(cat(host, 0, 'PERFIL'))!.value).toBe('')
        expect(contador(cat(host, 0, 'PERFIL'))).toBe('0 / 1.500')
    })

    it('escrever manda { instrucao } APARADA, só na categoria tocada; config e fornecedores AUSENTES', async () => {
        const host = await montar()
        await escreverNaInstrucao(instrucao(cat(host, 0, 'FERRAGENS')), '  Ferragem: sempre a da IMAB.\n')
        await salvar(host)
        const categorias = categoriasEnviadas()
        expect(categorias).toEqual([{ categoria_chave: 'FERRAGENS', instrucao: 'Ferragem: sempre a da IMAB.' }])
        expect(Object.keys(categorias[0])).toEqual(['categoria_chave', 'instrucao'])
    })

    it('limpar a gravada manda null — não "", não ausente', async () => {
        const host = await montar()
        await escreverNaInstrucao(instrucao(cat(host, 0, 'VIDRO')), '')
        await salvar(host)
        const vidro = categoriasEnviadas()[0]
        expect(vidro).toEqual({ categoria_chave: 'VIDRO', instrucao: null })
        expect(vidro.instrucao).toBeNull()
    })

    it('só espaço, onde não havia nada: não é mudança — nenhuma pendência, nenhum PUT', async () => {
        const host = await montar()
        await escreverNaInstrucao(instrucao(cat(host, 0, 'PERFIL')), '   \n  ')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
    })

    it('a gravada com espaço a mais nas pontas: é a mesma — nenhuma pendência', async () => {
        const host = await montar()
        await escreverNaInstrucao(instrucao(cat(host, 0, 'VIDRO')), '  Dúvida de vidro: consulte a tabela da Estrela.  ')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })

    it('EXATAMENTE 1.500 caracteres passa (e o "ç" e o emoji contam um cada, como char_length)', async () => {
        const host = await montar()
        const texto = 'ç😀' + 'a'.repeat(LIMITE_DA_INSTRUCAO - 2)
        expect(texto.length).toBe(LIMITE_DA_INSTRUCAO + 1)   // em UTF-16 o emoji são duas unidades: o contador não pode usar .length
        await escreverNaInstrucao(instrucao(cat(host, 0, 'REFORCO')), texto)
        expect(contador(cat(host, 0, 'REFORCO'))).toBe('1.500 / 1.500')
        await salvar(host)
        expect(categoriasEnviadas()).toEqual([{ categoria_chave: 'REFORCO', instrucao: texto }])
    })

    it('1.501 segura a árvore NA TELA: nenhum PUT, a frase do limite com a categoria, e o contador em vermelho', async () => {
        const host = await montar()
        await escreverNaInstrucao(instrucao(cat(host, 0, 'REFORCO')), 'a'.repeat(LIMITE_DA_INSTRUCAO + 1))
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
        const naoEnviado = cartao(host).querySelector('[data-nao-enviado]')!.textContent
        expect(naoEnviado).toContain(fraseDoLimiteDaInstrucao(LIMITE_DA_INSTRUCAO + 1))
        expect(naoEnviado).toContain('Reforço de aço')
        expect(cat(host, 0, 'REFORCO').querySelector('[data-contador-da-instrucao]')!.className).toMatch(/danger/)
        expect(cat(host, 0, 'VIDRO').querySelector('[data-contador-da-instrucao]')!.className).not.toMatch(/danger/)
    })

    it('ROUND-TRIP: depois do salvar, a instrução é a que o banco gravou', async () => {
        const doBanco = arvoreGravada()
        ;(doBanco.materias_primas as Array<{ categorias: Linha[] }>)[0].categorias.find((c) => c.categoria_chave === 'FERRAGENS')!.instrucao = 'Gravada pela função.'
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: { depois: depoisDe(doBanco) } }
        const host = await montar()
        await escreverNaInstrucao(instrucao(cat(host, 0, 'FERRAGENS')), 'Digitada.')
        await salvar(host)
        expect(instrucao(cat(host, 0, 'FERRAGENS'))!.value).toBe('Gravada pela função.')
        expect(instrucao(cat(host, 0, 'VIDRO'))!.value).toBe('Dúvida de vidro: consulte a tabela da Estrela.')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })

    it('o `depois` SEM a chave instrucao (rota de antes da migração): a tela mantém a que tinha, não a apaga', async () => {
        const doBanco = depoisDe(arvoreGravada()) as { orcamentista_mp_categoria: Linha[] }
        doBanco.orcamentista_mp_categoria = doBanco.orcamentista_mp_categoria.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'instrucao')))
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: { depois: doBanco } }
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await salvar(host)
        expect(instrucao(cat(host, 0, 'VIDRO'))!.value).toBe('Dúvida de vidro: consulte a tabela da Estrela.')
    })

    it('a GET de antes da migração (sem a chave instrucao): o campo aparece vazio e nada é inventado no corpo', async () => {
        const arv = arvoreGravada()
        for (const c of (arv.materias_primas as Array<{ categorias: Linha[] }>)[0].categorias) delete c.instrucao
        servir(arv)
        const host = await montar()
        expect(instrucao(cat(host, 0, 'VIDRO'))!.value).toBe('')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
// O TOTAL VEM DO CATÁLOGO — a 20261024000004 põe PERSIANAS e o catálogo passa a ter 7.
// ═══════════════════════════════════════════════════════════════════════════════════════
/** O catálogo da 20261024000004, EMBARALHADO de propósito: a ordem é `ordem`. */
const CATALOGO_COM_PERSIANAS = [
    { chave: 'VIDRO', ordem: 6, rotulo: 'Vidro' }, { chave: 'PERSIANAS', ordem: 2, rotulo: 'Persianas' },
    { chave: 'INSTALACAO', ordem: 7, rotulo: 'Instalação' }, { chave: 'PERFIL', ordem: 1, rotulo: 'Perfil' },
    { chave: 'ACESSORIOS_VEDACAO', ordem: 5, rotulo: 'Acessórios e vedação' }, { chave: 'REFORCO', ordem: 3, rotulo: 'Reforço metálico' },
    { chave: 'FERRAGENS', ordem: 4, rotulo: 'Ferragens' },
]
const ORDEM_COM_PERSIANAS = ['PERFIL', 'PERSIANAS', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO']
/** A árvore gravada depois da migração: o catálogo de 7, e a linha de PERSIANAS do backfill, sem config. */
function comPersianas(): Linha {
    const a = arvoreGravada() as Linha & { catalogo: { categorias: Linha[] }; materias_primas: Array<{ categorias: Linha[] }> }
    a.catalogo.categorias = CATALOGO_COM_PERSIANAS
    a.materias_primas[0].categorias.push(categoria('PERSIANAS'))
    return a
}

describe('(7) com PERSIANAS no catálogo: a ordem é a dele, e a categoria sem campo aparece vazia', () => {
    it('o catálogo deste caso tem 7 — senão ele não distinguiria de um 6 escrito à mão', () => {
        expect(CATALOGO_COM_PERSIANAS).toHaveLength(7)
        expect(TOTAL_DO_CATALOGO).not.toBe(CATALOGO_COM_PERSIANAS.length)
    })

    it('as 7 na ordem nova, com "número · rótulo" do catálogo — "2 · Persianas" e "3 · Reforço metálico"', async () => {
        servir(comPersianas())
        const host = await montar()
        const cats = Array.from(mp(host, 0).querySelectorAll('[data-categoria]'))
        expect(cats.map((c) => c.getAttribute('data-categoria'))).toEqual(ORDEM_COM_PERSIANAS)
        const titulos = cats.map((c) => c.querySelector('[data-titulo-da-categoria]')!.textContent)
        expect(titulos[1]).toBe('2 · Persianas')
        expect(titulos[2]).toBe('3 · Reforço metálico')
    })

    it('PERSIANAS não tem campo: o bloco aparece sem nenhum campo digitado, e com a instrução', async () => {
        servir(comPersianas())
        const host = await montar()
        expect(cat(host, 0, 'PERSIANAS').querySelectorAll('[data-campo]')).toHaveLength(0)
        expect(instrucao(cat(host, 0, 'PERSIANAS'))).not.toBeNull()
    })

    it('"+ Adicionar matéria-prima" com o catálogo de 7: as 7 na ordem', async () => {
        servir(comPersianas())
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        expect(Array.from(mp(host, 1).querySelectorAll('[data-categoria]')).map((c) => c.getAttribute('data-categoria'))).toEqual(ORDEM_COM_PERSIANAS)
    })
})
