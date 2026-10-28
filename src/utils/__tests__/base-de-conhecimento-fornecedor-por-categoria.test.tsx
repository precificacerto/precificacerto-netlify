/**
 * PORTÃO — o FORNECEDOR DA RAMIFICAÇÃO sai da TABELA (dono do produto, 28/10/2026): "quando eu for lá na categoria dentro da família ver o que eu
 * preciso de persiana, eu vou ver quais são os fornecedores de persiana que eu tenho". A categoria é da TABELA (um fornecedor tem várias, uma por
 * categoria: "Wolf perfil", "Wolf reforço metálico", "Wolf persiana"); NADA mudou no fornecedor.
 *
 *   (1) na lista "+ fornecedor" de uma ramificação só aparece quem tem tabela COM AQUELA categoria — o de vidro não aparece no perfil;
 *   (2) tabela com categoria nula não vale em categoria nenhuma, e a tela DIZ por quê (nomeia os fornecedores) quando não sobra ninguém;
 *   (3) quem já está na lista não some: sem tabela da categoria, ganha a marca "sem tabela desta categoria";
 *   (4) a escolha de quem aparece ainda adiciona o fornecedor à lista (o filtro não quebra o fluxo);
 *   (5) as funções puras: o recorte, os sem-categoria e a frase (singular, plural, "todos já estão").
 *
 * O que ele NÃO alcança: a função do banco, que segue aceitando qualquer fornecedor do nicho — o filtro é da TELA (sem migração).
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROTAS_DO_CATALOGO, type ContaLigada } from '@/utils/atendimentos-ia-catalogo'
import { rotaDasEtapas } from '@/utils/atendimentos-ia-etapas'
import { fornecedoresComTabelaDaCategoria, fornecedoresComTabelaSemCategoria, fraseDaListaDeFornecedoresVazia } from '@/page-parts/atendimentos-ia/base-de-conhecimento/arvore'

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
const SEM = '00000000-0000-4000-8000-00000000d002'
const F_WOLFF = '00000000-0000-4000-8000-0000000000f1'
const F_ESTRELA = '00000000-0000-4000-8000-0000000000f2'
const F_IMAB = '00000000-0000-4000-8000-0000000000f3'
const F_ALCOA = '00000000-0000-4000-8000-0000000000f4'
const F_HYDRO = '00000000-0000-4000-8000-0000000000f5'
const F_SEM_TABELA = '00000000-0000-4000-8000-0000000000f6'

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
const F = () => require('@/page-parts/atendimentos-ia/base-de-conhecimento/formulario') as Formulario
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
const vinculo = (cat: string, fornecedor: string, principal: boolean, ordem: number) => ({ id: `v-${cat}-${fornecedor}`, tenant_id: CONTA, mp_categoria_id: `cat-pvc-${cat}`, fornecedor_id: fornecedor, principal, ordem })
/** Como em produção: a Wolf é o principal do PERFIL e a Estrela é a do VIDRO — as duas sem tabela com categoria. A Alcoa tem tabela de PERFIL. */
const VINCULOS: Record<string, Linha> = {
    PERFIL: { fornecedores: [vinculo('PERFIL', F_WOLFF, true, 1), vinculo('PERFIL', F_ALCOA, false, 2)] },
    VIDRO: { fornecedores: [vinculo('VIDRO', F_ESTRELA, true, 1)] },
}
const RAMIFICACOES = ORDEM_DO_CATALOGO.map((c, i) => ({ familia: 'PVC', categoria_chave: c, ordem: i + 1 }))
function arvoreGravada(): Linha {
    return {
        tenant_id: CONTA,
        nicho: { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
        catalogo: { ...catalogo(), familias: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }], ramificacoes: RAMIFICACOES },
        // o retrato de PRODUÇÃO medido em 28/10/2026 (Wolf e Estrela com tabela sem categoria; IMAB com a de FERRAGENS; 61 sem tabela), mais dois que ele não tem
        fornecedores_do_nicho: [
            { id: F_WOLFF, nome: 'Wolf Perfis', categorias_das_tabelas: [], tabelas_sem_categoria: 1 },
            { id: F_ESTRELA, nome: 'Estrela Vidros', categorias_das_tabelas: [], tabelas_sem_categoria: 1 },
            { id: F_IMAB, nome: 'IMAB', categorias_das_tabelas: ['FERRAGENS'], tabelas_sem_categoria: 0 },
            { id: F_ALCOA, nome: 'Alcoa', categorias_das_tabelas: ['PERFIL', 'REFORCO'], tabelas_sem_categoria: 0 },
            { id: F_HYDRO, nome: 'Hydro', categorias_das_tabelas: ['PERFIL'], tabelas_sem_categoria: 1 },
            { id: F_SEM_TABELA, nome: 'Sem tabela', categorias_das_tabelas: [], tabelas_sem_categoria: 0 },
        ],
        linhas_por_fornecedor: {},
        materias_primas: [
            { id: PVC, tenant_id: CONTA, nome: 'Esquadrias de PVC', ordem: 1, familia: 'PVC', atualizado_por: null, atualizado_em: null, categorias: ORDEM_DO_CATALOGO.map((c) => categoria(c, VINCULOS[c] ?? {})) },
            { id: SEM, tenant_id: CONTA, nome: 'Outra coisa', ordem: 2, familia: null, atualizado_por: null, atualizado_em: null, categorias: ORDEM_DO_CATALOGO.map((c) => ({ ...categoria(c), id: `cat-sem-${c}`, materia_prima_id: SEM })) },
        ],
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
        [`GET ${rotaDasEtapas('PVC')}`]: { status: 200, body: { familia: 'PVC', etapas: [{ id: 'et-1', numero: 1, rotulo: 'Apanhar o pedido', acao: 'APANHAR', instrucao: '', abas: [], motor_id: null }], motores: [], contas: ['Vidraçaria Alfa'] } },
        [`PUT ${R.nomeDaMateriaPrima(CONTA)}`]: { status: 200, body: { depois: {} } },
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



/** As opções que o combo "+ fornecedor" da categoria oferece (os nomes), abrindo a lista. */
async function oferecidos(host: ParentNode, chave: string): Promise<string[]> {
    const combo = cat(host, 0, chave).querySelector('[data-novo-fornecedor] .ant-select') as HTMLElement
    await act(async () => { (combo.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    const listas = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
    const nomes = listas.length === 0 ? [] : Array.from(listas[listas.length - 1].querySelectorAll('.ant-select-item-option')).map((o) => (o.textContent || '').trim())
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    return nomes
}
const filtro = (host: ParentNode, chave: string) => cat(host, 0, chave).querySelector('[data-filtro-de-fornecedor]')?.textContent ?? ''
const nomesNaLista = (host: ParentNode, chave: string) => Array.from(cat(host, 0, chave).querySelectorAll('[data-fornecedor] [data-nome-do-fornecedor]')).map((n) => n.textContent)
const marcaSemTabela = (host: ParentNode, chave: string, id: string) => cat(host, 0, chave).querySelector(`[data-fornecedor="${id}"] [data-sem-tabela-da-categoria]`)

describe('(1) na lista "+ fornecedor" só aparece quem tem tabela DESTA categoria', () => {
    it('PERFIL: a Alcoa e a Hydro (tabela de perfil) — a IMAB (ferragens), a Estrela, a Wolf sem categoria e o sem-tabela ficam de fora; quem já está na lista (Wolf, Alcoa) não repete', async () => {
        const host = await montar()
        expect(await oferecidos(host, 'PERFIL')).toEqual(['Hydro'])
    })

    it('FERRAGENS: só a IMAB — o fornecedor de vidro e o de perfil NÃO aparecem', async () => {
        const host = await montar()
        expect(await oferecidos(host, 'FERRAGENS')).toEqual(['IMAB'])
    })

    it('REFORCO: a Alcoa; VIDRO, INSTALACAO e ACESSORIOS_VEDACAO: ninguém (nenhuma tabela tem essa categoria)', async () => {
        const host = await montar()
        expect(await oferecidos(host, 'REFORCO')).toEqual(['Alcoa'])
        for (const c of ['VIDRO', 'INSTALACAO', 'ACESSORIOS_VEDACAO']) expect(await oferecidos(host, c)).toEqual([])
    })

    it('o fornecedor sem tabela nenhuma não aparece em categoria nenhuma', async () => {
        const host = await montar()
        for (const c of ORDEM_DO_CATALOGO) expect(await oferecidos(host, c)).not.toContain('Sem tabela')
    })
})

describe('(2) quando não sobra ninguém, a tela diz por quê — não deixa o combo vazio em silêncio', () => {
    it('VIDRO: nenhum fornecedor do nicho tem tabela da categoria, e a frase NOMEIA quem tem tabela sem categoria (em ordem)', async () => {
        const host = await montar()
        const f = filtro(host, 'VIDRO')
        expect(f).toContain('Nenhum fornecedor do nicho tem tabela da categoria Vidro.')
        expect(f).toContain('3 fornecedores têm tabela sem categoria declarada e por isso não aparecem em categoria nenhuma: Estrela Vidros, Hydro, Wolf Perfis.')
        expect(f).toContain('Declare a categoria da tabela em Fornecedores e tabelas.')
    })

    it('quando há quem escolher, a frase é o aviso curto do filtro — não o diagnóstico', async () => {
        const host = await montar()
        expect(filtro(host, 'FERRAGENS')).toBe('Só aparecem para escolher os fornecedores que têm tabela desta categoria.')
    })

    it('todos os que têm tabela da categoria já estão na lista: a frase diz isso (e não que ninguém tem)', async () => {
        const host = await montar()
        // o PERFIL tem a Hydro para escolher; tirar a Hydro da conta de "oferecidos" — a Alcoa já está na lista e a Hydro é escolhida
        await oferecidos(host, 'PERFIL')
        const combo = cat(host, 0, 'PERFIL').querySelector('[data-novo-fornecedor]') as HTMLElement
        await escolherNoSeletor(combo, 'Hydro')
        expect(filtro(host, 'PERFIL')).toContain('Todos os fornecedores com tabela da categoria Perfil já estão nesta lista.')
        expect(filtro(host, 'PERFIL')).not.toContain('Nenhum fornecedor do nicho')
    })
})

describe('(3) quem já está na lista não some; a marca diz por que ele não seria oferecido', () => {
    it('a Wolf (PERFIL principal, tabela sem categoria) continua na lista e leva "sem tabela desta categoria"; a Alcoa (tabela de perfil) não leva', async () => {
        const host = await montar()
        expect(nomesNaLista(host, 'PERFIL')).toEqual(['Wolf Perfis', 'Alcoa'])
        expect(marcaSemTabela(host, 'PERFIL', F_WOLFF)?.textContent).toBe('sem tabela desta categoria')
        expect(marcaSemTabela(host, 'PERFIL', F_ALCOA)).toBeNull()
    })

    it('a Estrela no VIDRO também continua, com a marca — o estado de produção de hoje não apaga ninguém da tela', async () => {
        const host = await montar()
        expect(nomesNaLista(host, 'VIDRO')).toEqual(['Estrela Vidros'])
        expect(marcaSemTabela(host, 'VIDRO', F_ESTRELA)).not.toBeNull()
    })
})

describe('(4) escolher o que o filtro oferece adiciona o fornecedor', () => {
    it('FERRAGENS: escolher a IMAB a põe na lista, como principal, e a marca NÃO aparece (ela tem a tabela da categoria)', async () => {
        const host = await montar()
        await escolherNoSeletor(cat(host, 0, 'FERRAGENS').querySelector('[data-novo-fornecedor]') as HTMLElement, 'IMAB')
        expect(nomesNaLista(host, 'FERRAGENS')).toEqual(['IMAB'])
        expect(cat(host, 0, 'FERRAGENS').querySelector('[data-principal]')).not.toBeNull()
        expect(marcaSemTabela(host, 'FERRAGENS', F_IMAB)).toBeNull()
    })
})

describe('(4b) empresa sem nicho: o combo está desligado, e a frase do filtro NÃO aparece (a explicação é a do nicho)', () => {
    it('nenhum "Só aparecem…" nem diagnóstico; fica a frase de que a empresa não tem nicho', async () => {
        const sem = arvoreGravada()
        sem.nicho = null
        sem.fornecedores_do_nicho = []
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: sem }
        const host = await montar()
        expect(cat(host, 0, 'PERFIL').querySelector('[data-filtro-de-fornecedor]')).toBeNull()
        expect(cat(host, 0, 'PERFIL').textContent).toContain('A empresa não tem nicho: nenhum fornecedor pode ser dela.')
    })
})

describe('(5) as funções puras', () => {
    const nicho = [
        { id: 'a', nome: 'A', categorias_das_tabelas: ['PERFIL', 'VIDRO'], tabelas_sem_categoria: 0 },
        { id: 'b', nome: 'B', categorias_das_tabelas: [], tabelas_sem_categoria: 2 },
        { id: 'c', nome: 'C', categorias_das_tabelas: ['VIDRO'], tabelas_sem_categoria: 1 },
    ]
    it('o recorte por categoria: igualdade exata da chave', () => {
        expect(fornecedoresComTabelaDaCategoria({ fornecedores_do_nicho: nicho }, 'VIDRO').map((f) => f.id)).toEqual(['a', 'c'])
        expect(fornecedoresComTabelaDaCategoria({ fornecedores_do_nicho: nicho }, 'PERFIL').map((f) => f.id)).toEqual(['a'])
        expect(fornecedoresComTabelaDaCategoria({ fornecedores_do_nicho: nicho }, 'vidro')).toEqual([])
        expect(fornecedoresComTabelaDaCategoria({ fornecedores_do_nicho: nicho }, 'PERSIANAS')).toEqual([])
    })

    it('os com tabela sem categoria: os que têm ao menos uma, mesmo que tenham outras com categoria', () => {
        expect(fornecedoresComTabelaSemCategoria({ fornecedores_do_nicho: nicho }).map((f) => f.id)).toEqual(['b', 'c'])
    })

    it('a frase: singular e plural, com ou sem sem-categoria, e os dois motivos de lista vazia', () => {
        expect(fraseDaListaDeFornecedoresVazia('Persianas', 0, [])).toBe('Nenhum fornecedor do nicho tem tabela da categoria Persianas.')
        expect(fraseDaListaDeFornecedoresVazia('Persianas', 0, ['Wolf'])).toBe('Nenhum fornecedor do nicho tem tabela da categoria Persianas. Um fornecedor tem tabela sem categoria declarada e por isso não aparece em categoria nenhuma: Wolf. Declare a categoria da tabela em Fornecedores e tabelas.')
        expect(fraseDaListaDeFornecedoresVazia('Persianas', 0, ['Z', 'A'])).toContain('2 fornecedores têm tabela sem categoria declarada e por isso não aparecem em categoria nenhuma: A, Z.')
        expect(fraseDaListaDeFornecedoresVazia('Perfil', 2, [])).toBe('Todos os fornecedores com tabela da categoria Perfil já estão nesta lista.')
    })
})
