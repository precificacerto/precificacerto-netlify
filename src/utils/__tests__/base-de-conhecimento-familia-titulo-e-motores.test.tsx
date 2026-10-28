/**
 * PORTÃO — a FAMÍLIA, NA TELA, NESTA ORDEM (dono do produto, 27/10/2026): (1) o TÍTULO digitado — o nome da matéria-prima; (2) os MOTORES, um por
 * etapa, cada um com o seu arquivo — ACIMA da ramificação 1 (Perfil) e antes dos fornecedores; (3) as categorias.
 *
 *   (1) a ordem no DOM: título → família → motores → primeira categoria; sem família não há seção de motores (e a lista nem é pedida);
 *   (2) o título é digitado e renomeia na hora, por rota própria (`nome-da-materia-prima`), e a base é relida; a recusa aparece NO bloco;
 *   (3) renomear com alteração pendente é travado; nome vazio não sai; a matéria-prima nova (ainda sem id) não tem "Editar título".
 *
 * O que ele NÃO alcança: a função `superadmin_renomear_materia_prima` (provada num Postgres real em `scripts/harness/etapa-sobe-o-motor/`) nem
 * o envio do arquivo (`atendimentos-ia-motor-da-etapa-a-tela.test.tsx`). O `fetch` só registra o pedido e devolve o que o caso manda.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROTAS_DO_CATALOGO, type ContaLigada } from '@/utils/atendimentos-ia-catalogo'
import { rotaDasEtapas } from '@/utils/atendimentos-ia-etapas'

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
const RAMIFICACOES = ORDEM_DO_CATALOGO.map((c, i) => ({ familia: 'PVC', categoria_chave: c, ordem: i + 1 }))
function arvoreGravada(): Linha {
    return {
        tenant_id: CONTA,
        nicho: { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
        catalogo: { ...catalogo(), familias: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }], ramificacoes: RAMIFICACOES },
        fornecedores_do_nicho: [{ id: F_WOLFF, nome: 'Wolff' }],
        linhas_por_fornecedor: {},
        materias_primas: [
            { id: PVC, tenant_id: CONTA, nome: 'Esquadrias de PVC', ordem: 1, familia: 'PVC', atualizado_por: null, atualizado_em: null, categorias: ORDEM_DO_CATALOGO.map((c) => categoria(c)) },
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
const entrada = (raiz: ParentNode | null) => raiz?.querySelector('input') as HTMLInputElement | null
const pendencias = (host: ParentNode) => host.querySelector('[data-empresa-no-topo] [data-pendencias]')?.textContent ?? null


const titulo = (host: ParentNode, i: number) => mp(host, i).querySelector('[data-cabecalho-da-materia-prima] h5') as HTMLElement
const editarTitulo = (host: ParentNode, i: number) => mp(host, i).querySelector('[data-editar-titulo]') as HTMLButtonElement
const campoDoTitulo = (host: ParentNode, i: number) => mp(host, i).querySelector('[data-titulo-da-materia-prima] input') as HTMLInputElement
const renomear = (host: ParentNode, i: number) => mp(host, i).querySelector('[data-renomear]') as HTMLButtonElement
const putsDoNome = () => pedidos.filter((p) => p.metodo === 'PUT' && p.url === F().ROTAS_DA_BASE.nomeDaMateriaPrima(CONTA))
const lerArvore = () => pedidos.filter((p) => p.metodo === 'GET' && p.url === F().ROTAS_DA_BASE.arvore(CONTA))

describe('(1) a ordem na tela: título → família → motores → categorias', () => {
    it('no bloco da PVC, os motores vêm DEPOIS da família e ANTES da primeira categoria (a ramificação 1)', async () => {
        const host = await montar()
        const bloco = mp(host, 0)
        const cabecalho = bloco.querySelector('[data-cabecalho-da-materia-prima]') as HTMLElement
        const familia = bloco.querySelector('[data-familia-da-materia-prima]') as HTMLElement
        const motores = bloco.querySelector('[data-motores-da-materia-prima]') as HTMLElement
        const primeira = bloco.querySelector('[data-categoria]') as HTMLElement
        expect(motores).toBeTruthy()
        const antes = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
        expect(antes(cabecalho, familia)).toBe(true)
        expect(antes(familia, motores)).toBe(true)
        expect(antes(motores, primeira)).toBe(true)
        // a ramificação 1 é o Perfil, e a seção de motores está acima dela
        expect(primeira.getAttribute('data-categoria')).toBe('PERFIL')
        // os motores são a lista de etapas da família DESTA matéria-prima, cada uma com o seu campo de arquivo
        expect(motores.querySelector('[data-etapas-da-familia="PVC"]')).toBeTruthy()
        expect(motores.querySelector('[data-arquivo-do-motor] input[type="file"]')).toBeTruthy()
        expect(motores.textContent).toContain('Motores da família (um por etapa)')
    })

    it('matéria-prima SEM família: nenhuma seção de motores, e a lista de etapas nem é pedida', async () => {
        const host = await montar()
        expect(mp(host, 1).querySelector('[data-motores-da-materia-prima]')).toBeNull()
        expect(pedidos.filter((p) => p.url === rotaDasEtapas('PVC'))).toHaveLength(1)
        expect(pedidos.filter((p) => p.url.includes('/familias/'))).toHaveLength(1)
    })

    it('o aviso de que o motor é global aparece na seção, com a conta da família por NOME', async () => {
        const host = await montar()
        const aviso = mp(host, 0).querySelector('[data-aviso-do-motor-global]')?.textContent ?? ''
        expect(aviso).toContain('TODAS as contas desta família')
        expect(aviso).toContain('Vidraçaria Alfa')
    })
})

describe('(2) o título é digitado e renomeia na hora', () => {
    it('o título mostra o nome gravado; "Editar título" abre o campo com ele, e "Renomear" começa desligado', async () => {
        const host = await montar()
        expect(titulo(host, 0).textContent).toBe('Esquadrias de PVC')
        expect(campoDoTitulo(host, 0)).toBeNull()
        await clicar(editarTitulo(host, 0))
        expect(campoDoTitulo(host, 0).value).toBe('Esquadrias de PVC')
        expect(renomear(host, 0).disabled).toBe(true)
    })

    it('digitar e renomear: UM PUT com a matéria-prima e o nome digitado, a base é relida e o título muda', async () => {
        const host = await montar()
        const antes = lerArvore().length
        const reler = arvoreGravada()
        ;(reler.materias_primas as Linha[])[0].nome = 'Janelas e portas de PVC'
        respostas[`GET ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 200, body: reler }
        await clicar(editarTitulo(host, 0))
        await digitar(campoDoTitulo(host, 0), 'Janelas e portas de PVC')
        expect(renomear(host, 0).disabled).toBe(false)
        await clicar(renomear(host, 0))
        expect(putsDoNome()).toHaveLength(1)
        expect(putsDoNome()[0].corpo).toEqual({ materia_prima: PVC, nome: 'Janelas e portas de PVC' })
        expect(lerArvore().length).toBe(antes + 1)
        expect(titulo(host, 0).textContent).toBe('Janelas e portas de PVC')
        // fechou o editor depois de gravar
        expect(campoDoTitulo(host, 0)).toBeNull()
    })

    it('a recusa da rota (nome repetido) aparece NO bloco, com a frase dela, e o título não muda', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.nomeDaMateriaPrima(CONTA)}`] = { status: 400, body: { error: 'a empresa ja tem outra materia-prima com esse nome' } }
        const host = await montar()
        await clicar(editarTitulo(host, 0))
        await digitar(campoDoTitulo(host, 0), 'Outra coisa')
        await clicar(renomear(host, 0))
        expect(mp(host, 0).querySelector('[data-erro-do-titulo]')?.textContent).toContain('a empresa ja tem outra materia-prima com esse nome')
        expect(mp(host, 1).querySelector('[data-erro-do-titulo]')).toBeNull()
        expect(titulo(host, 0).textContent).toBe('Esquadrias de PVC')
    })

    it('nome em branco (ou só espaços): "Renomear" fica desligado e nenhum PUT sai', async () => {
        const host = await montar()
        await clicar(editarTitulo(host, 0))
        await digitar(campoDoTitulo(host, 0), '   ')
        expect(renomear(host, 0).disabled).toBe(true)
        await clicar(renomear(host, 0))
        expect(putsDoNome()).toHaveLength(0)
    })

    it('o mesmo nome (só com espaço nas pontas) não é mudança', async () => {
        const host = await montar()
        await clicar(editarTitulo(host, 0))
        await digitar(campoDoTitulo(host, 0), ' Esquadrias de PVC ')
        expect(renomear(host, 0).disabled).toBe(true)
    })

    it('Cancelar fecha o editor e descarta o que foi digitado', async () => {
        const host = await montar()
        await clicar(editarTitulo(host, 0))
        await digitar(campoDoTitulo(host, 0), 'Qualquer')
        await clicar(botao(mp(host, 0), 'Cancelar'))
        expect(campoDoTitulo(host, 0)).toBeNull()
        await clicar(editarTitulo(host, 0))
        expect(campoDoTitulo(host, 0).value).toBe('Esquadrias de PVC')
    })
})

describe('(3) renomear só sem alteração pendente; matéria-prima nova não tem título para editar', () => {
    it('com uma alteração pendente na tela: o campo e o botão ficam travados, a frase diz por quê, e nenhum PUT sai', async () => {
        const host = await montar()
        await clicar(editarTitulo(host, 0))
        await digitar(campoDoTitulo(host, 0), 'Novo título')
        // uma alteração pendente: a cor predominante do Perfil
        await digitar(entrada(campo(mp(host, 0), 'PERFIL.cor_predominante')), 'Branco')
        expect(pendencias(host)).not.toBeNull()
        expect(campoDoTitulo(host, 0).disabled).toBe(true)
        expect(renomear(host, 0).disabled).toBe(true)
        expect(mp(host, 0).querySelector('[data-titulo-travado]')?.textContent).toContain('Salve ou descarte as alterações')
        await clicar(renomear(host, 0))
        expect(putsDoNome()).toHaveLength(0)
    })

    it('a matéria-prima NOVA (sem id) segue com o campo de nome simples e sem "Editar título"', async () => {
        const host = await montar()
        await clicar(botao(cartao(host), A().ADICIONAR_MATERIA_PRIMA))
        const nova = mp(host, 2)
        expect(nova.querySelector('[aria-label="Nome da matéria-prima"]')).toBeTruthy()
        expect(nova.querySelector('[data-editar-titulo]')).toBeNull()
    })
})
