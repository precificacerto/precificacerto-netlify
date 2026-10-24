/**
 * PORTÃO — a TELA da base de conhecimento em TRÊS NÍVEIS: o cartão "Matérias-primas e seus
 * fornecedores", que grava pela rota PUT /arvore (função `superadmin_gravar_arvore`, migração
 * `20261023000004`).
 *
 * O que este portão prova, e cada asserção fica VERMELHA sem a sua correção (a tabela das mutações
 * está no corpo do PR):
 *   (1) as 6 categorias, na ORDEM do catálogo, com o número e o rótulo DELE — o catálogo chega
 *       embaralhado de propósito, para a tela não poder confiar na ordem da resposta;
 *   (2) matéria-prima nova: as 6 categorias, os campos vindos de `catalogo.campos` (um campo novo no
 *       catálogo aparece sem mudar a tela) e NENHUM valor inventado;
 *   (3) a árvore do PUT é exatamente a esperada: só o que mudou, null para o que foi limpo, false
 *       para "não", e a chave AUSENTE para o que não foi tocado — e `ordem` em lugar nenhum;
 *   (4) sem matéria-prima na tela, o corpo NÃO tem `materias_primas`; remoção vai em `remover`;
 *   (5) os booleanos têm TRÊS estados, e dá para voltar a "não informado";
 *   (6) ferragem interna e externa são DUAS LINHAS, cada uma com o seu código;
 *   (7) a mensagem da função chega INTEIRA, no cartão da categoria que ela nomeia;
 *   (8) remover e gravar a mesma matéria-prima no mesmo salvar é barrado NA TELA;
 *   (9) depois do salvar, a tela se redesenha pelo `depois` que a rota devolveu;
 *  (10) PERFIL.linha é COMBOBOX: oferece as linhas da tabela em uso do fornecedor PRINCIPAL (fórmula
 *       ∪ regra), aceita outra, e tem TRÊS estados com avisos DIFERENTES — com fórmula de família (sem
 *       aviso), só com regra (DESIGN: a tabela não dimensiona) e fora das duas (digitada); sem
 *       principal ou sem tabela, diz isso;
 *  (11) as colunas `par_inox_referencia` (ferragem) e `referencia` (vidro): ausente, null e
 *       preenchido distinguíveis, e o round-trip pelo `depois`.
 *
 * O que ele NÃO alcança: a função. O banco é falso — o `fetch` só registra o pedido e devolve o
 * que o caso manda. O que a função faz com a árvore está provado em `scripts/harness/arvore/`.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROTAS_DO_CATALOGO, type ContaLigada } from '@/utils/atendimentos-ia-catalogo'

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
        { categoria_chave: 'REFORCO', chave: 'material', tipo: 'texto', rotulo: 'Material', ordem: 2 },
        { categoria_chave: 'REFORCO', chave: 'usa', tipo: 'booleano', rotulo: 'Usa reforço', ordem: 1 },
        { categoria_chave: 'REFORCO', chave: 'par_inox_referencia', tipo: 'texto', rotulo: 'Referência do par em inox', ordem: 3 },
        { categoria_chave: 'ACESSORIOS_VEDACAO', chave: 'vedacao', tipo: 'texto', rotulo: 'Vedação', ordem: 3 },
        { categoria_chave: 'ACESSORIOS_VEDACAO', chave: 'cor_por_perfil', tipo: 'mapa', rotulo: 'Cor do acessório por cor de perfil', ordem: 1 },
        { categoria_chave: 'ACESSORIOS_VEDACAO', chave: 'modelo_interlock', tipo: 'texto', rotulo: 'Modelo do interlock', ordem: 2 },
    ],
})
const ORDEM_DO_CATALOGO = ['PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO']

const categoria = (chave: string, resto: Linha = {}): Linha => ({
    id: `cat-pvc-${chave}`, tenant_id: CONTA, materia_prima_id: PVC, categoria_chave: chave, config: null, atualizado_por: null, atualizado_em: '2026-10-23T12:00:00Z',
    fornecedores: [], ...resto,
})
function arvoreGravada(): Linha {
    return {
        tenant_id: CONTA,
        nicho: { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
        catalogo: catalogo(),
        fornecedores_do_nicho: [{ id: F_ALCOA, nome: 'Alcoa' }, { id: F_HYDRO, nome: 'Hydro' }, { id: F_WOLFF, nome: 'Wolff' }],
        // medido em produção, 23/10/2026, POR FONTE: DESIGN tem 139 regras e nenhuma fórmula de família — e o Wolff é o principal do PERFIL
        linhas_por_fornecedor: { [F_WOLFF]: { formula: ['EUROPA 42', 'EUROPA 60'], regra: ['DESIGN', 'EUROPA 42', 'EUROPA 60'] } },
        materias_primas: [{
            id: PVC, tenant_id: CONTA, nome: 'PVC', ordem: 1, atualizado_por: null, atualizado_em: null,
            categorias: [
                categoria('PERFIL', {
                    config: { linha: 'Suprema', cor_predominante: null, cores: ['Branco'], barra_mm: 6000 },
                    fornecedores: [
                        { id: 'r1', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-PERFIL', fornecedor_id: F_WOLFF, principal: true, ordem: 1, nome_do_fornecedor: 'Wolff' },
                        { id: 'r2', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-PERFIL', fornecedor_id: F_FORA, principal: false, ordem: 2, nome_do_fornecedor: 'Madeireira' },
                    ],
                }),
                categoria('REFORCO', { config: { usa: false } }),
                categoria('FERRAGENS', {
                    ferragens: [
                        { id: 'g1', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-FERRAGENS', categoria_chave: 'FERRAGENS', tipologia: 'JVC', posicao: 'INTERNA', referencia: 'F-INT', descricao: 'Fecho', cor: 'Branco', par_inox_referencia: 'F-INOX', ordem: 1 },
                        { id: 'g2', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-FERRAGENS', categoria_chave: 'FERRAGENS', tipologia: 'JVC', posicao: 'EXTERNA', referencia: 'F-EXT', descricao: 'Fecho', cor: 'Preto', par_inox_referencia: null, ordem: 2 },
                    ],
                }),
                categoria('ACESSORIOS_VEDACAO'),
                categoria('VIDRO', {
                    vidros: [
                        { id: 'v1', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-VIDRO', categoria_chave: 'VIDRO', descricao: 'Fumê', referencia: null, onde_predomina: [], ordem: 1 },
                        { id: 'v2', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-VIDRO', categoria_chave: 'VIDRO', descricao: 'Bronze', referencia: 'VB-1', onde_predomina: null, ordem: 2 },
                    ],
                }),
                categoria('INSTALACAO', {
                    instalacao: [
                        { id: 'i1', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-INSTALACAO', categoria_chave: 'INSTALACAO', produto: 'ARREMATE_INTERNO', usa: true, referencia: 'AI-1', descricao: null, medida: null, folga_x: null, folga_y: null },
                        { id: 'i2', tenant_id: CONTA, mp_categoria_id: 'cat-pvc-INSTALACAO', categoria_chave: 'INSTALACAO', produto: 'CONTRAMARCO', usa: null, referencia: null, descricao: null, medida: null, folga_x: null, folga_y: null },
                    ],
                }),
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

/** O `depois` que a função devolve: as seis tabelas, planas, como a 20261023000004 as lê. */
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
const radio = (raiz: ParentNode | null, estado: 'sim' | 'nao' | 'nao_informado') =>
    raiz?.querySelector(`input[type="radio"][value="${estado}"]`) as HTMLInputElement | null
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
describe('(1) o cartão, os blocos e as 6 categorias na ordem do CATÁLOGO', () => {
    it('um cartão "Matérias-primas e seus fornecedores", um bloco por matéria-prima, e o miolo antigo não existe mais', async () => {
        const host = await montar()
        expect(cartao(host).textContent).toContain(A().TITULO_DO_CARTAO)
        expect(cartao(host).querySelectorAll('[data-materia-prima]')).toHaveLength(1)
        expect(Array.from(host.querySelectorAll('[data-bloco]')).map((b) => b.getAttribute('data-bloco'))).toEqual(['materias', 'ambientes', 'vendedores', 'adicionais'])
    })

    it('o cabeçalho: o nome, "N de 6 categorias" e Remover', async () => {
        const host = await montar()
        const cabeca = mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement
        expect(cabeca.textContent).toContain('PVC')
        // PERFIL, REFORCO, FERRAGENS, VIDRO e INSTALACAO têm algo; ACESSORIOS_VEDACAO está vazia
        expect(cabeca.querySelector('[data-categorias-configuradas]')!.textContent).toBe(A().fraseDasCategorias(5, 6))
        expect(botao(cabeca, 'Remover')).toBeDefined()
    })

    it('as SEIS categorias na ordem do catálogo, com "número · rótulo" vindos dele — e o catálogo veio embaralhado', async () => {
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

describe('(2) matéria-prima NOVA: as 6 categorias, os campos do catálogo, e nada inventado', () => {
    it('"+ Adicionar matéria-prima" abre um bloco com as 6 categorias na ordem, "0 de 6", e o nome a digitar', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        expect(Array.from(mp(host, 1).querySelectorAll('[data-categoria]')).map((c) => c.getAttribute('data-categoria'))).toEqual(ORDEM_DO_CATALOGO)
        expect(mp(host, 1).querySelector('[data-categorias-configuradas]')!.textContent).toBe(A().fraseDasCategorias(0, 6))
        expect(mp(host, 1).querySelector('[data-cabecalho-da-materia-prima] input')).not.toBeNull()
    })

    it('os campos de cada categoria são os de catalogo.campos, na ordem dele, com o rótulo dele', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        for (const chave of ['PERFIL', 'REFORCO', 'ACESSORIOS_VEDACAO']) {
            const doCatalogo = catalogo().campos.filter((c) => c.categoria_chave === chave).sort((a, b) => a.ordem - b.ordem)
            const naTela = Array.from(cat(host, 1, chave).querySelectorAll('[data-campo]'))
            expect(naTela.map((c) => c.getAttribute('data-campo'))).toEqual(doCatalogo.map((c) => `${chave}.${c.chave}`))
            expect(naTela.map((c) => c.querySelector('[data-rotulo-do-campo]')!.textContent)).toEqual(doCatalogo.map((c) => c.rotulo))
        }
    })

    it('um campo NOVO no catálogo aparece na tela, com o controle do tipo dele — a lista não está escrita à mão', async () => {
        const arv = arvoreGravada()
        ;(arv.catalogo as { campos: Linha[] }).campos.push({ categoria_chave: 'REFORCO', chave: 'espessura_mm', tipo: 'numero', rotulo: 'Espessura (mm)', ordem: 4 })
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: arv }
        const host = await montar()
        const novo = campo(cat(host, 0, 'REFORCO'), 'REFORCO.espessura_mm')
        expect(novo).not.toBeNull()
        expect(novo!.querySelector('[data-rotulo-do-campo]')!.textContent).toBe('Espessura (mm)')
        expect(novo!.querySelector('.ant-input-number')).not.toBeNull()
    })

    it('NENHUM valor inventado: textos vazios, números vazios, booleanos em "não informado", sem fornecedor, sem vidro, sem ferragem', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        const bloco = mp(host, 1)
        const campos = Array.from(bloco.querySelectorAll('[data-campo]'))
        for (const c of campos) for (const i of Array.from(c.querySelectorAll('input:not([type="radio"])'))) expect((i as HTMLInputElement).value).toBe('')
        for (const r of Array.from(bloco.querySelectorAll('input[type="radio"]:checked'))) expect((r as HTMLInputElement).value).toBe('nao_informado')
        expect(bloco.querySelectorAll('[data-fornecedor]')).toHaveLength(0)
        expect(bloco.querySelectorAll('[data-vidro]')).toHaveLength(0)
        expect(bloco.querySelectorAll('[data-ferragem]')).toHaveLength(0)
        expect(bloco.querySelectorAll('input[type="radio"]:checked').length).toBeGreaterThan(0)
    })

    it('a nova SÓ com o nome vai como { nome } — sem categoria nenhuma, e depois da gravada, que vai inteira', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 1).querySelector('[data-cabecalho-da-materia-prima]')), 'Alumínio')
        await salvar(host)
        expect(arvoreEnviada()).toEqual({ materias_primas: [{ nome: 'PVC' }, { nome: 'Alumínio' }] })
    })
})

describe('(3) a árvore do PUT: só o que mudou — null limpa, false é "não", ausente não mexe', () => {
    it('sem nada tocado, nenhum PUT /arvore', async () => {
        const host = await montar()
        expect(botaoDeSalvar(host).disabled).toBe(true)
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
    })

    it('limpar um texto gravado manda null; "não informado" manda null; "não" manda false; o não tocado fica AUSENTE', async () => {
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.linha')), '')
        await clicar(radio(campo(cat(host, 0, 'REFORCO'), 'REFORCO.usa'), 'nao_informado'))
        await clicar(radio(cat(host, 0, 'INSTALACAO').querySelector('[data-produto="CONTRAMARCO"] [data-coluna="usa"]'), 'nao'))
        await salvar(host)
        const arvore = arvoreEnviada()
        expect(arvore).toEqual({
            materias_primas: [{
                nome: 'PVC',
                categorias: [
                    { categoria_chave: 'PERFIL', config: { linha: null } },
                    { categoria_chave: 'REFORCO', config: { usa: null } },
                    { categoria_chave: 'INSTALACAO', instalacao: [{ produto: 'ARREMATE_INTERNO' }, { produto: 'CONTRAMARCO', usa: false }] },
                ],
            }],
        })
        const [perfil, reforco, instalacao] = (arvore.materias_primas as Array<{ categorias: Linha[] }>)[0].categorias
        // AUSENTE é ausente, não null nem false: o que não foi tocado não está no objeto
        expect(Object.keys(perfil.config as Linha)).toEqual(['linha'])
        expect('fornecedores' in perfil).toBe(false)
        expect((reforco.config as Linha).usa).toBeNull()
        expect(((instalacao.instalacao as Linha[])[1]).usa).toBe(false)
        expect('usa' in (instalacao.instalacao as Linha[])[0]).toBe(false)
    })

    it('número digitado vai como NÚMERO, e o inteiro apagado vai null', async () => {
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.serra_mm')), '4')
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.barra_mm')), '')
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([
            { categoria_chave: 'PERFIL', config: { barra_mm: null, serra_mm: 4 } },
        ])
    })

    it('vidros: acrescentar um manda a lista INTEIRA — os gravados só com a chave, e [] e null de onde_predomina intocados', async () => {
        const host = await montar()
        await clicar(botao(cat(host, 0, 'VIDRO'), A().ADICIONAR_VIDRO))
        await digitar(entrada(cat(host, 0, 'VIDRO').querySelector('[data-vidro="2"] [data-coluna="descricao"]')), 'Incolor 4 mm')
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([
            { categoria_chave: 'VIDRO', vidros: [{ descricao: 'Fumê' }, { descricao: 'Bronze' }, { descricao: 'Incolor 4 mm' }] },
        ])
    })

    it('`ordem` não vai em lugar nenhum do corpo — nem na matéria-prima, nem nas listas', async () => {
        const host = await montar()
        await clicar(botao(cat(host, 0, 'VIDRO'), A().ADICIONAR_VIDRO))
        await digitar(entrada(cat(host, 0, 'VIDRO').querySelector('[data-vidro="2"] [data-coluna="descricao"]')), 'Incolor 4 mm')
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 1).querySelector('[data-cabecalho-da-materia-prima]')), 'Alumínio')
        await salvar(host)
        const arvore = arvoreEnviada()
        expect(chaves(arvore)).toContain('descricao')
        expect(chaves(arvore)).not.toContain('ordem')
    })

    it('a contagem de pendências acompanha a árvore, e desfazer tira da conta', async () => {
        const host = await montar()
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda')), 'MIG')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
        await clicar(radio(campo(cat(host, 0, 'REFORCO'), 'REFORCO.usa'), 'sim'))
        expect(pendencias(host)).toBe(F().fraseDasPendencias(2))
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda')), '')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
    })
})

describe('(4) sem matéria-prima, o corpo NÃO tem materias_primas; remoção vai em remover', () => {
    it('remover a única gravada: { remover: [id] } — e a chave materias_primas não existe', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, 'Remover'))
        await salvar(host)
        const arvore = arvoreEnviada()
        expect(arvore).toEqual({ remover: [PVC] })
        expect('materias_primas' in arvore).toBe(false)
    })

    it('o contraste: removida a gravada e acrescentada outra, materias_primas volta, com a lista inteira', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, 'Remover'))
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
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, 'Remover'))
        expect(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]')!.textContent).toContain('Alumínio')
        await clicar(botao(cartao(host).querySelector('[data-removidas]') as HTMLElement, 'Desfazer'))
        const nomes = [0, 1].map((i) => mp(host, i).querySelector('[data-cabecalho-da-materia-prima] h5')!.textContent)
        expect(nomes).toEqual(['PVC', 'Alumínio'])
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })

    it('a removida fica listada, e "Desfazer" a devolve sem nada a salvar', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, 'Remover'))
        const removidas = cartao(host).querySelector('[data-removidas]') as HTMLElement
        expect(removidas.textContent).toContain('PVC')
        await clicar(botao(removidas, 'Desfazer'))
        expect(cartao(host).querySelector('[data-removidas]')).toBeNull()
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })
})

describe('(5) booleano em TRÊS estados — sim / não / não informado', () => {
    it('não há caixa de marcar no cartão', async () => {
        const host = await montar()
        expect(cartao(host).querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    })

    it('o gravado aparece: usa false é "não", usa NULL é "não informado" — e não "não"', async () => {
        const host = await montar()
        expect(radio(campo(cat(host, 0, 'REFORCO'), 'REFORCO.usa'), 'nao')!.checked).toBe(true)
        const contramarco = cat(host, 0, 'INSTALACAO').querySelector('[data-produto="CONTRAMARCO"] [data-coluna="usa"]')
        expect(radio(contramarco, 'nao_informado')!.checked).toBe(true)
        expect(radio(contramarco, 'nao')!.checked).toBe(false)
    })

    it('de "não informado" para "não" e DE VOLTA: a ida conta, a volta desconta — e nada é enviado', async () => {
        const host = await montar()
        const usa = () => cat(host, 0, 'INSTALACAO').querySelector('[data-produto="CONTRAMARCO"] [data-coluna="usa"]')
        await clicar(radio(usa(), 'nao'))
        expect(radio(usa(), 'nao')!.checked).toBe(true)
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
        await clicar(radio(usa(), 'nao_informado'))
        expect(radio(usa(), 'nao_informado')!.checked).toBe(true)
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
    })

    it('usa SIM sem referência NÃO é enviado, e a tela diz o que falta (é a CHECK do banco)', async () => {
        const host = await montar()
        await clicar(radio(cat(host, 0, 'INSTALACAO').querySelector('[data-produto="CONTRAMARCO"] [data-coluna="usa"]'), 'sim'))
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
        expect(cartao(host).querySelector('[data-nao-enviado]')!.textContent).toContain(A().USA_SEM_REFERENCIA)
    })
})

describe('(6) ferragens: interna e externa são DUAS linhas, cada uma com o seu código', () => {
    it('as colunas da tabela, e as duas linhas gravadas com referências e posições diferentes', async () => {
        const host = await montar()
        const tabela = cat(host, 0, 'FERRAGENS')
        expect(Array.from(tabela.querySelectorAll('thead th')).map((t) => (t.textContent || '').trim())).toEqual(['Tipologia', 'Posição', 'Referência', 'Descrição', 'Cor', 'Par em inox', ''])
        const linhas = Array.from(tabela.querySelectorAll('[data-ferragem]'))
        expect(linhas.map((l) => (l.querySelector('[data-coluna="referencia"]')!.textContent || '').trim())).toEqual(['F-INT', 'F-EXT'])
        expect(linhas.map((l) => (l.querySelector('[data-coluna="posicao"] .ant-select-selection-item')?.textContent || '').trim()))
            .toEqual([A().ROTULO_DA_POSICAO.INTERNA, A().ROTULO_DA_POSICAO.EXTERNA])
    })

    it('acrescentar a externa de outra tipologia: uma linha NOVA, com código próprio — a lista inteira vai, as gravadas só com a referência', async () => {
        const host = await montar()
        await clicar(botao(cat(host, 0, 'FERRAGENS'), A().ADICIONAR_FERRAGEM))
        const nova = () => cat(host, 0, 'FERRAGENS').querySelector('[data-ferragem="2"]') as HTMLElement
        await digitar(entrada(nova().querySelector('[data-coluna="tipologia"]')), 'MAX')
        await escolherNoSeletor(nova().querySelector('[data-coluna="posicao"]'), A().ROTULO_DA_POSICAO.EXTERNA)
        await digitar(entrada(nova().querySelector('[data-coluna="referencia"]')), 'M-EXT')
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([
            { categoria_chave: 'FERRAGENS', ferragens: [{ referencia: 'F-INT' }, { referencia: 'F-EXT' }, { referencia: 'M-EXT', tipologia: 'MAX', posicao: 'EXTERNA' }] },
        ])
    })

    it('a referência de uma ferragem GRAVADA não se edita — é a chave dela', async () => {
        const host = await montar()
        expect(cat(host, 0, 'FERRAGENS').querySelector('[data-ferragem="0"] [data-coluna="referencia"] input')).toBeNull()
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
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda')), 'MIG')
        await salvar(host)
        expect(cat(host, 0, 'PERFIL').querySelector('[data-erro-da-arvore]')!.textContent).toContain(MENSAGEM)
        expect(cat(host, 0, 'VIDRO').querySelector('[data-erro-da-arvore]')).toBeNull()
        expect(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda'))!.value).toBe('MIG')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
    })

    it('mensagem sem caminho (ex.: 403): no topo do cartão, inteira', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 403, body: { error: 'o autor da alteracao nao e super admin' } }
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda')), 'MIG')
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
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, 'Remover'))
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        await digitar(entrada(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]')), 'pvc')
        expect(mp(host, 0).textContent).toContain(A().fraseRemoverEGravar('pvc'))
        await salvar(host)
        expect(putsDaArvore()).toEqual([])
    })

    it('o contraste: outro nome passa', async () => {
        const host = await montar()
        await clicar(botao(mp(host, 0).querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement, 'Remover'))
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
        perfil.config = { ...(perfil.config as Linha), solda: 'MIG gravado pela funcao' }
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: { depois: depoisDe(doBanco) } }
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda')), 'MIG')
        await salvar(host)
        expect(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda'))!.value).toBe('MIG gravado pela funcao')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
        // e o GET da árvore não foi refeito: a fonte é a resposta do PUT
        expect(pedidos.filter((p) => p.metodo === 'GET' && p.url === F().ROTAS_DA_BASE.arvore(CONTA))).toHaveLength(1)
    })

    it('o nome do fornecedor continua no chip depois do redesenho (o `depois` não traz nome)', async () => {
        const host = await montar()
        await digitar(entrada(campo(cat(host, 0, 'PERFIL'), 'PERFIL.solda')), 'MIG')
        await salvar(host)
        const chips = Array.from(cat(host, 0, 'PERFIL').querySelectorAll('[data-fornecedor]'))
        expect(chips.map((c) => (c.querySelector('[data-nome-do-fornecedor]')!.textContent || '').trim())).toEqual(['Wolff', 'Madeireira'])
    })
})

describe('(10) PERFIL.linha: COMBOBOX com as linhas da tabela em uso do fornecedor PRINCIPAL', () => {
    const linha = (host: ParentNode) => campo(cat(host, 0, 'PERFIL'), 'PERFIL.linha') as HTMLElement
    const aviso = (host: ParentNode) => linha(host).querySelector('[data-linha-fora-da-tabela]')
    const semFormula = (host: ParentNode) => linha(host).querySelector('[data-linha-sem-formula]')
    const frase = (host: ParentNode) => linha(host).querySelector('[data-origem-da-linha]')

    it('o catálogo continua dizendo `texto` — quem sabe a origem é a tela', () => {
        expect(catalogo().campos.find((c) => c.categoria_chave === 'PERFIL' && c.chave === 'linha')!.tipo).toBe('texto')
        expect(A().CAMPO_DA_LINHA).toEqual({ categoria: 'PERFIL', campo: 'linha' })
    })

    it('a lista é fórmula ∪ regra: DESIGN aparece, entre as duas da fórmula', async () => {
        const host = await montar()
        expect(await opcoesDoSeletor(linha(host))).toEqual(['DESIGN', 'EUROPA 42', 'EUROPA 60'])
    })

    it('ESTADO 1 — linha COM fórmula de família (EUROPA 42): nenhum dos dois avisos', async () => {
        const host = await montar()
        await escolherNoSeletor(linha(host), 'EUROPA 42')
        expect(aviso(host)).toBeNull()
        expect(semFormula(host)).toBeNull()
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([{ categoria_chave: 'PERFIL', config: { linha: 'EUROPA 42' } }])
    })

    it('ESTADO 2 — linha que o motor conhece SEM fórmula de família (DESIGN): o aviso PRÓPRIO, e não o de digitação — e não bloqueia', async () => {
        const host = await montar()
        await escolherNoSeletor(linha(host), 'DESIGN')
        expect(semFormula(host)!.textContent).toBe(A().fraseLinhaSemFormula('DESIGN', 'Wolff'))
        expect(aviso(host)).toBeNull()
        // os dois textos são diferentes: o conserto de um é na tabela importada, o do outro na digitação
        expect(A().fraseLinhaSemFormula('DESIGN', 'Wolff')).not.toBe(A().fraseLinhaForaDaTabela('DESIGN', 'Wolff'))
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([{ categoria_chave: 'PERFIL', config: { linha: 'DESIGN' } }])
    })

    it('ESTADO 3 — linha fora das duas fontes ("Suprema", digitada): o aviso de fora da tabela, e NÃO o de sem fórmula — e não bloqueia', async () => {
        const host = await montar()
        // o gravado "Suprema" não está em nenhuma das duas fontes da tabela em uso do Wolff
        expect(aviso(host)!.textContent).toBe(A().fraseLinhaForaDaTabela('Suprema', 'Wolff'))
        expect(semFormula(host)).toBeNull()
        await digitar(entrada(linha(host)), 'ZETA 70')
        expect(aviso(host)!.textContent).toBe(A().fraseLinhaForaDaTabela('ZETA 70', 'Wolff'))
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([{ categoria_chave: 'PERFIL', config: { linha: 'ZETA 70' } }])
    })

    it('tabela em uso SEM linha nenhuma nas duas fontes: a frase dela, e nenhum aviso de linha', async () => {
        const arv = arvoreGravada()
        arv.linhas_por_fornecedor = { [F_WOLFF]: { formula: [], regra: [] } }
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: arv }
        const host = await montar()
        expect(frase(host)!.textContent).toBe(A().fraseTabelaSemLinha('Wolff'))
        expect(aviso(host)).toBeNull()
        expect(semFormula(host)).toBeNull()
    })

    it('SEM TABELA EM USO: a tela diz isso — não oferece lista vazia em silêncio, e o campo continua aceitando digitação', async () => {
        const arv = arvoreGravada()
        arv.linhas_por_fornecedor = {}
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: arv }
        const host = await montar()
        expect(frase(host)!.textContent).toBe(A().fraseSemTabelaEmUso('Wolff'))
        expect(aviso(host)).toBeNull()
        await digitar(entrada(linha(host)), 'EUROPA 42')
        await salvar(host)
        expect((arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias).toEqual([{ categoria_chave: 'PERFIL', config: { linha: 'EUROPA 42' } }])
    })

    it('SEM FORNECEDOR PRINCIPAL: a tela diz que falta o principal', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        const daNova = campo(cat(host, 1, 'PERFIL'), 'PERFIL.linha') as HTMLElement
        expect(daNova.querySelector('[data-origem-da-linha]')!.textContent).toBe(A().SEM_PRINCIPAL_DO_PERFIL)
    })

    it('trocar o principal troca a origem: com o Hydro (sem tabela em uso), a frase é a dele', async () => {
        const host = await montar()
        await escolherNoSeletor(cat(host, 0, 'PERFIL').querySelector('[data-novo-fornecedor]'), 'Hydro')
        await clicar(cat(host, 0, 'PERFIL').querySelector(`[data-fornecedor="${F_HYDRO}"] [data-tornar-principal]`) as HTMLElement)
        expect(frase(host)!.textContent).toBe(A().fraseSemTabelaEmUso('Hydro'))
    })
})

describe('(11) as colunas Par em inox (ferragem) e Referência (vidro): ausente, null e preenchido', () => {
    const celula = (host: ParentNode, chave: string, linha: string, coluna: string) =>
        entrada(cat(host, 0, chave).querySelector(`${linha} [data-coluna="${coluna}"]`))

    it('as colunas existem, com o que está gravado — e o vazio é o null gravado', async () => {
        const host = await montar()
        expect(Array.from(cat(host, 0, 'VIDRO').querySelectorAll('thead th')).map((t) => (t.textContent || '').trim())).toEqual(['Vidro', 'Referência', 'Onde predomina', ''])
        expect(celula(host, 'FERRAGENS', '[data-ferragem="0"]', 'par_inox_referencia')!.value).toBe('F-INOX')
        expect(celula(host, 'FERRAGENS', '[data-ferragem="1"]', 'par_inox_referencia')!.value).toBe('')
        expect(celula(host, 'VIDRO', '[data-vidro="0"]', 'referencia')!.value).toBe('')
        expect(celula(host, 'VIDRO', '[data-vidro="1"]', 'referencia')!.value).toBe('VB-1')
    })

    it('par em inox: preencher o null manda o valor; limpar o gravado manda null; o NÃO tocado fica AUSENTE', async () => {
        const host = await montar()
        await digitar(celula(host, 'FERRAGENS', '[data-ferragem="1"]', 'par_inox_referencia'), 'F-EXT-INOX')
        await salvar(host)
        const ferragens = (arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias[0].ferragens as Linha[]
        expect(ferragens).toEqual([{ referencia: 'F-INT' }, { referencia: 'F-EXT', par_inox_referencia: 'F-EXT-INOX' }])
        expect('par_inox_referencia' in ferragens[0]).toBe(false)
    })

    it('par em inox: limpar o gravado manda null — não ausente, não vazio', async () => {
        const host = await montar()
        await digitar(celula(host, 'FERRAGENS', '[data-ferragem="0"]', 'par_inox_referencia'), '')
        await salvar(host)
        const ferragens = (arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias[0].ferragens as Linha[]
        expect(ferragens).toEqual([{ referencia: 'F-INT', par_inox_referencia: null }, { referencia: 'F-EXT' }])
    })

    it('referência do vidro: preencher o null manda o valor, limpar o gravado manda null, e o não tocado fica ausente', async () => {
        const host = await montar()
        await digitar(celula(host, 'VIDRO', '[data-vidro="0"]', 'referencia'), 'VF-4')
        await digitar(celula(host, 'VIDRO', '[data-vidro="1"]', 'referencia'), '')
        await salvar(host)
        const vidros = (arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias[0].vidros as Linha[]
        expect(vidros).toEqual([{ descricao: 'Fumê', referencia: 'VF-4' }, { descricao: 'Bronze', referencia: null }])
        expect('onde_predomina' in vidros[0]).toBe(false)
    })

    it('o vidro e a ferragem NOVOS sem as colunas preenchidas: a chave não vai', async () => {
        const host = await montar()
        await clicar(botao(cat(host, 0, 'VIDRO'), A().ADICIONAR_VIDRO))
        await digitar(entrada(cat(host, 0, 'VIDRO').querySelector('[data-vidro="2"] [data-coluna="descricao"]')), 'Incolor 4 mm')
        await salvar(host)
        const vidros = (arvoreEnviada().materias_primas as Array<{ categorias: Linha[] }>)[0].categorias[0].vidros as Linha[]
        expect(vidros[2]).toEqual({ descricao: 'Incolor 4 mm' })
    })

    it('ROUND-TRIP: depois do salvar, as duas colunas mostram o que o banco gravou', async () => {
        const doBanco = arvoreGravada()
        const cats = (doBanco.materias_primas as Array<{ categorias: Array<Linha & { ferragens?: Linha[]; vidros?: Linha[] }> }>)[0].categorias
        cats.find((c) => c.categoria_chave === 'FERRAGENS')!.ferragens![1].par_inox_referencia = 'F-EXT-INOX'
        cats.find((c) => c.categoria_chave === 'VIDRO')!.vidros![0].referencia = 'VF-4'
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: { depois: depoisDe(doBanco) } }
        const host = await montar()
        await digitar(celula(host, 'FERRAGENS', '[data-ferragem="1"]', 'par_inox_referencia'), 'F-EXT-INOX')
        await digitar(celula(host, 'VIDRO', '[data-vidro="0"]', 'referencia'), 'VF-4')
        await salvar(host)
        expect(celula(host, 'FERRAGENS', '[data-ferragem="1"]', 'par_inox_referencia')!.value).toBe('F-EXT-INOX')
        expect(celula(host, 'FERRAGENS', '[data-ferragem="0"]', 'par_inox_referencia')!.value).toBe('F-INOX')
        expect(celula(host, 'VIDRO', '[data-vidro="0"]', 'referencia')!.value).toBe('VF-4')
        expect(celula(host, 'VIDRO', '[data-vidro="1"]', 'referencia')!.value).toBe('VB-1')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })
})
