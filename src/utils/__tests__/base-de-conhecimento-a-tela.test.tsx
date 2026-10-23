/**
 * PORTÃO — a TELA da base de conhecimento (super admin › Atendimentos I.A. › Contas ligadas ›
 * empresa › Base de conhecimento).
 *
 * É a única tela do sistema em que o tenant vem do PEDIDO. A empresa está no CAMINHO da URL,
 * escolhida navegando da lista de contas ligadas — não num seletor dentro do formulário —, e o
 * nome dela fica no topo o tempo todo.
 *
 * O MIOLO dos três níveis (o cartão "Matérias-primas e seus fornecedores") tem portão próprio:
 * `base-de-conhecimento-tres-niveis-a-tela.test.tsx`. Os cinco blocos de esquadrias de um nível
 * (Perfil, Vidro, Guarnição e contramarco, Acessórios, Produção) SAÍRAM da tela por decisão do dono
 * do produto (23/10/2026), e os casos deles saíram junto: o que eles provavam não existe mais aqui.
 *
 * O que este portão prova, e cada asserção fica VERMELHA sem a sua correção:
 *   (d) PERCENTUAL sem base NÃO é enviado; VALOR esconde e limpa a base;
 *   (f) a mensagem da rota aparece como veio — 400 nomeado, os 409 do catálogo, 404;
 *   (g) os vendedores: o funcionário é escolhido da lista da rota de funcionários;
 *   (h) o nome da empresa no topo; quem não é super admin volta ao início sem chamar rota;
 *   (j) UM botão só, "Salvar alterações", junto do nome da empresa: desabilitado sem alteração,
 *       com a contagem do que está pendente; salvar chama TODAS as rotas necessárias — a da árvore
 *       inclusive —, e a falha de uma nomeia o bloco e deixa as pendências dele na tela; sair com
 *       pendência avisa antes.
 *
 * O que ele NÃO alcança: que a barra do topo fique de fato visível ao rolar — jsdom não tem
 * layout. Isso é conferência visual.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROUTES } from '@/constants/routes'
import { ROTAS_DO_CATALOGO, type ContaLigada, type TabelasDaConta } from '@/utils/atendimentos-ia-catalogo'

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
const EMP_ANA = '00000000-0000-4000-8000-00000000f0a1'
const EMP_CARLA = '00000000-0000-4000-8000-00000000f0a2'
const TAB_WOLFF = '00000000-0000-4000-8000-0000000000c1'
const TAB_WOLFF_2 = '00000000-0000-4000-8000-0000000000c2'

const replaces: string[] = []
const pushes: string[] = []
const ouvintesDoRoteador: Record<string, (url: string) => void> = {}
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/contas/[tenantId]/base-de-conhecimento', asPath: '/', query: { tenantId: CONTA }, replace: (u: string) => { replaces.push(u) }, push: (u: string) => { pushes.push(u) },
        events: { on: (e: string, h: (url: string) => void) => { ouvintesDoRoteador[e] = h }, off: (e: string) => { delete ouvintesDoRoteador[e] }, emit: () => {} } }),
}))
let usuario: Record<string, unknown> = { id: 'u-super', is_super_admin: true, role: 'super_admin' }
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: usuario }) }))
jest.mock('@/components/layout/layout.component', () => ({
    Layout: ({ children, title }: { children: React.ReactNode; title?: string }) => <div><h1 data-titulo>{title}</h1>{children}</div>,
}))

/* eslint-disable @typescript-eslint/no-require-imports */
// Lidos DENTRO dos casos: no commit dos portões a tela e o módulo ainda não existem, e um `require`
// no topo derrubaria o arquivo inteiro de uma vez.
type Formulario = typeof import('@/page-parts/atendimentos-ia/base-de-conhecimento/formulario')
const F = () => require('@/page-parts/atendimentos-ia/base-de-conhecimento/formulario') as Formulario
const APagina = () => require('@/pages/super-admin/atendimentos-ia/contas/[tenantId]/base-de-conhecimento').default as React.ComponentType
/* eslint-enable @typescript-eslint/no-require-imports */

const CONTAS: ContaLigada[] = [{ tenant_id: CONTA, nome: 'Vidraçaria Alfa', modelo: 'FABRICACAO', nicho_id: N_ESQ, nicho_nome: 'Esquadrias' }]

type Corpo = Record<string, unknown>
function baseGravada(): Corpo {
    const empresa: Corpo = { tenant_id: CONTA, linha_perfil: 'Suprema', cor_perfil_predominante: 'Branco', usa_contramarco: true, usa_arremate_interno: null, regiao_litoranea: false, cores_perfil: ['Branco', 'Preto'] }
    const nicho = { nicho_id: N_ESQ, vidro_predominante: 'Incolor 4mm', linha_perfil: 'Gold' }
    // O efetivo vem PRONTO da rota (`efetivoDasEsquadrias`); a tela não o recalcula.
    const efetivo: Record<string, { valor: unknown; origem: string }> = {}
    for (const c of Object.keys(F().ROTULO_DO_CAMPO)) efetivo[c] = { valor: null, origem: 'sem valor' }
    Object.assign(efetivo, {
        linha_perfil: { valor: 'Suprema', origem: 'empresa' },
        cor_perfil_predominante: { valor: 'Branco', origem: 'empresa' },
        usa_contramarco: { valor: true, origem: 'empresa' },
        regiao_litoranea: { valor: false, origem: 'empresa' },
        cores_perfil: { valor: ['Branco', 'Preto'], origem: 'empresa' },
        vidro_predominante: { valor: 'Incolor 4mm', origem: 'nicho' },
    })
    return {
        tenant_id: CONTA,
        nicho: { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
        esquadrias: { empresa, nicho, efetivo },
        adicionais: { tenant_id: CONTA, frete_modo: 'PERCENTUAL', frete_valor: null, frete_percentual: 5, frete_base: 'VALOR_POS_DESCONTO', instalacao_modo: null, instalacao_valor: null, instalacao_percentual: null, instalacao_base: null },
        ambientes: [{ tenant_id: CONTA, ambiente: 'Sala', vidro_padrao: 'Temperado 8mm', tipologia_usual: null }],
        vendedores: [{ tenant_id: CONTA, employee_id: EMP_ANA, comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: null, lucro_projetado_percentual: null, nome_do_funcionario: 'Ana Souza' }],
    }
}

/** A árvore dos três níveis de uma empresa SEM matéria-prima: o catálogo, o nicho, e nada gravado. */
const arvoreVazia = (): Corpo => ({
    tenant_id: CONTA,
    nicho: { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
    catalogo: {
        categorias: [{ chave: 'PERFIL', ordem: 1, rotulo: 'Perfil' }, { chave: 'REFORCO', ordem: 2, rotulo: 'Reforço de aço' }, { chave: 'FERRAGENS', ordem: 3, rotulo: 'Ferragens' },
            { chave: 'ACESSORIOS_VEDACAO', ordem: 4, rotulo: 'Acessórios e vedação' }, { chave: 'VIDRO', ordem: 5, rotulo: 'Vidro' }, { chave: 'INSTALACAO', ordem: 6, rotulo: 'Instalação' }],
        campos: [{ categoria_chave: 'PERFIL', chave: 'linha', tipo: 'texto', rotulo: 'Linha', ordem: 1 }],
    },
    fornecedores_do_nicho: [],
    materias_primas: [],
})

const TABELAS_DA_CONTA: TabelasDaConta = {
    nicho_id: N_ESQ,
    em_uso: [
        { tabela_id: TAB_WOLFF, fornecedor_id: 'f-wolff', fornecedor_nome: 'Wolff Perfis', arquivo_nome: 'wolff-out.xlsm', motor_nome: 'motor-wolff.xlsm', vigencia: null },
        { tabela_id: TAB_WOLFF_2, fornecedor_id: 'f-wolff', fornecedor_nome: 'Wolff Perfis', arquivo_nome: 'wolff-nov.xlsm', motor_nome: 'motor-wolff.xlsm', vigencia: null },
    ],
    fornecedores: [],
}

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: { url: string; metodo: string; corpo: unknown }[] = []
beforeEach(() => {
    pedidos.length = 0
    replaces.length = 0
    pushes.length = 0
    usuario = { id: 'u-super', is_super_admin: true, role: 'super_admin' }
    const R = F().ROTAS_DA_BASE
    respostas = {
        [`GET ${ROTAS_DO_CATALOGO.contas}`]: { status: 200, body: CONTAS },
        [`GET ${R.base(CONTA)}`]: { status: 200, body: baseGravada() },
        [`GET ${R.funcionarios(CONTA)}`]: { status: 200, body: { funcionarios: [{ id: EMP_ANA, nome: 'Ana Souza' }, { id: EMP_CARLA, nome: 'Carla Dias' }] } },
        [`GET ${R.arvore(CONTA)}`]: { status: 200, body: arvoreVazia() },
        [`PUT ${R.arvore(CONTA)}`]: { status: 200, body: { depois: { orcamentista_materia_prima: [], orcamentista_mp_categoria: [], orcamentista_mp_categoria_fornecedor: [], orcamentista_mp_vidro: [], orcamentista_mp_ferragem: [], orcamentista_mp_instalacao: [] } } },
        [`PUT ${R.base(CONTA)}`]: { status: 200, body: { depois: {} } },
        [`PUT ${R.ambiente(CONTA)}`]: { status: 200, body: { depois: {} } },
        [`PUT ${R.vendedor(CONTA)}`]: { status: 200, body: { depois: {} } },
        // As tabelas em uso da conta: duas, do mesmo fornecedor; a linha vem das tipologias importadas.
        [`GET ${ROTAS_DO_CATALOGO.tabelasDaConta(CONTA)}`]: { status: 200, body: TABELAS_DA_CONTA },
        [`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(TAB_WOLFF)}`]: { status: 200, body: { formulas: 3, tipologias: [
            { tipologia: 'J1', linha: 'Suprema', n_regras: 1, n_condicionais: 0, variaveis: [] },
            { tipologia: 'J2', linha: null, n_regras: 1, n_condicionais: 0, variaveis: [] },
        ] } },
        [`GET ${ROTAS_DO_CATALOGO.conteudoDaTabela(TAB_WOLFF_2)}`]: { status: 200, body: { formulas: 1, tipologias: [
            { tipologia: 'K1', linha: 'Gold', n_regras: 1, n_condicionais: 0, variaveis: [] },
            { tipologia: 'K2', linha: 'Suprema', n_regras: 1, n_condicionais: 0, variaveis: [] },
        ] } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const metodo = init?.method ?? 'GET'
        pedidos.push({ url, metodo, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[`${metodo} ${url}`] ?? { status: 404, body: { error: 'sem resposta no teste' } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

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

const campo = (host: ParentNode, c: string) => host.querySelector(`[data-campo="${c}"]`) as HTMLElement | null
const bloco = (host: ParentNode, b: string) => host.querySelector(`[data-bloco="${b}"]`) as HTMLElement
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === texto) as HTMLButtonElement | undefined
async function clicar(el: HTMLElement | undefined | null) {
    if (!el) throw new Error('elemento não encontrado')
    await act(async () => { el.click() })
    await assentar()
}
async function digitar(input: HTMLInputElement | null, valor: string) {
    if (!input) throw new Error('input não encontrado')
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { input.dispatchEvent(new Event('blur', { bubbles: true })) })
}
const entrada = (host: ParentNode, c: string) => campo(host, c)?.querySelector('input') as HTMLInputElement | null
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
const gravacoes = () => pedidos.filter((p) => p.metodo !== 'GET')
const botaoDeSalvar = (host: ParentNode) => host.querySelector('[data-empresa-no-topo] [data-salvar-alteracoes]') as HTMLButtonElement | null
async function salvar(host: ParentNode) {
    await clicar(botaoDeSalvar(host))
    await assentar()
}
const pendencias = (host: ParentNode) => host.querySelector('[data-empresa-no-topo] [data-pendencias]')?.textContent ?? null

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(h) a empresa no topo, e o portão da tela', () => {
    it('a tela da conta leva à base de conhecimento DAQUELA conta, pelo caminho', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.nichos}`] = { status: 200, body: [{ id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true }] }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AConta = require('@/pages/super-admin/atendimentos-ia/contas/[tenantId]').default as React.ComponentType
        const host = document.createElement('div')
        document.body.appendChild(host)
        const root = createRoot(host)
        montadas.push({ root, host })
        // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
        await act(async () => { root.render(<AConta />) })
        await assentar()
        await clicar(botao(host, 'Base de conhecimento'))
        expect(pushes).toEqual([`${ROUTES.SUPER_ADMIN_IA_CONTAS}/${CONTA}/base-de-conhecimento`])
    })

    it('o nome da empresa está na barra do topo, com o nicho', async () => {
        const host = await montar()
        const barra = host.querySelector('[data-empresa-no-topo]') as HTMLElement
        expect(barra).not.toBeNull()
        expect(barra.textContent).toContain('Vidraçaria Alfa')
        expect(barra.textContent).toContain('Esquadrias')
    })

    it('os quatro blocos, nesta ordem: o cartão das matérias-primas e os três da empresa', async () => {
        const host = await montar()
        expect(Array.from(host.querySelectorAll('[data-bloco]')).map((b) => b.getAttribute('data-bloco'))).toEqual(
            ['materias', 'ambientes', 'vendedores', 'adicionais'])
    })

    it('os cinco blocos de esquadrias de um nível NÃO estão mais na tela, e a tela não lê mais as tabelas em uso', async () => {
        const host = await montar()
        for (const b of ['perfil', 'vidro', 'guarnicao', 'acessorios', 'producao']) expect(bloco(host, b)).toBeNull()
        expect(pedidos.map((p) => p.url)).not.toContain(ROTAS_DO_CATALOGO.tabelasDaConta(CONTA))
    })

    it('quem não é super admin volta ao início, e nenhuma rota é chamada', async () => {
        usuario = { id: 'u-a', is_super_admin: false, role: 'admin' }
        await montar()
        expect(replaces).toEqual([ROUTES.DASHBOARD])
        expect(pedidos).toEqual([])
    })

    it('conta fora da lista de ligadas: sem formulário, e a base não é lida', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.contas}`] = { status: 200, body: [] }
        const host = await montar()
        expect(host.querySelector('[data-bloco]')).toBeNull()
        expect(host.textContent).toMatch(/não está com o Atendimentos I\.A\. ligado/)
        expect(pedidos.map((p) => p.url)).not.toContain(F().ROTAS_DA_BASE.base(CONTA))
    })
})

describe('(d) adicionais: PERCENTUAL exige base; VALOR esconde e limpa a base', () => {
    it('PERCENTUAL sem base NÃO é enviado, e a tela diz o que falta', async () => {
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 200, body: { ...baseGravada(), adicionais: null } }
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Percentual')
        await digitar(entrada(host, 'instalacao_percentual'), '8')
        await salvar(host)
        expect(gravacoes()).toEqual([])
        // O rótulo da base também está no próprio campo, visível; a frase tem de estar no AVISO.
        const aviso = bloco(host, 'adicionais').querySelector('[data-nao-enviado]')
        expect(aviso?.textContent).toContain(F().ROTULO_DO_CAMPO.instalacao_base)
        expect(aviso?.textContent).toContain('é obrigatório com modo PERCENTUAL')
    })

    it('o contraste: com a base escolhida, vai — e só os campos tocados', async () => {
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 200, body: { ...baseGravada(), adicionais: null } }
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Percentual')
        await digitar(entrada(host, 'instalacao_percentual'), '8')
        await escolherNoSeletor(campo(host, 'instalacao_base'), 'Custo da instalação')
        await salvar(host)
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ adicionais: { instalacao_modo: 'PERCENTUAL', instalacao_percentual: 8, instalacao_base: 'CUSTO_DA_INSTALACAO' } }])
    })

    it('trocar PERCENTUAL por VALOR esconde a base e a manda null, junto com o percentual', async () => {
        const host = await montar()
        expect(campo(host, 'frete_base')).not.toBeNull()
        await escolherNoSeletor(campo(host, 'frete_modo'), 'Valor')
        expect(campo(host, 'frete_base')).toBeNull()
        expect(campo(host, 'frete_percentual')).toBeNull()
        await digitar(entrada(host, 'frete_valor'), '150')
        await salvar(host)
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ adicionais: { frete_modo: 'VALOR', frete_valor: 150, frete_percentual: null, frete_base: null } }])
    })
})

describe('(f) a mensagem da ROTA aparece como veio', () => {
    it.each([
        ['NICHO_ESQUADRIAS_AUSENTE', 'O nicho Esquadrias não foi encontrado no catálogo — ele pode ter sido renomeado.'],
        ['NICHO_ESQUADRIAS_DUPLICADO', 'Há 2 nichos chamados Esquadrias no catálogo; a base não sabe qual é o de esquadrias.'],
        ['FORA_DO_NICHO_ESQUADRIAS', 'Esta empresa não está no nicho Esquadrias; as esquadrias não se aplicam a ela.'],
    ])('409 %s: a frase da rota na tela, no bloco que salvou', async (codigo, frase) => {
        respostas[`PUT ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 409, body: { error: frase, codigo } }
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Não cobra')
        await salvar(host)
        expect(bloco(host, 'adicionais').textContent).toContain(frase)
        expect(bloco(host, 'adicionais').textContent).toContain(codigo)
    })

    it('400: cada erro nomeado aparece, com o campo e a mensagem', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.vendedor(CONTA)}`] = { status: 400, body: { error: 'Pedido inválido.', erros: [{ campo: 'vendedores[0].employee_id', mensagem: `${EMP_ANA} não é funcionário desta empresa.` }] } }
        const host = await montar()
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await salvar(host)
        const texto = bloco(host, 'vendedores').textContent
        expect(texto).toContain('Pedido inválido.')
        expect(texto).toContain('vendedores[0].employee_id')
        expect(texto).toContain(`${EMP_ANA} não é funcionário desta empresa.`)
    })

    it('404: a frase da rota', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.ambiente(CONTA)}`] = { status: 404, body: { error: 'Empresa não encontrada.' } }
        const host = await montar()
        await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), 'Correr 2 folhas')
        await salvar(host)
        expect(bloco(host, 'ambientes').textContent).toContain('Empresa não encontrada.')
    })

    it('falha ao LER a base é erro na tela, nunca formulário vazio', async () => {
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 500, body: { error: 'Falha ao ler a base de conhecimento.' } }
        const host = await montar()
        expect(host.textContent).toContain('Falha ao ler a base de conhecimento.')
        expect(host.querySelector('[data-bloco]')).toBeNull()
    })

    it('(a) sem nada tocado, o botão está desabilitado e nenhuma rota é chamada', async () => {
        const host = await montar()
        expect(botaoDeSalvar(host)!.disabled).toBe(true)
        await salvar(host)
        expect(gravacoes()).toEqual([])
    })
})

describe('(g) vendedores e ambientes: a lista é o estado, e dentro do item só o tocado', () => {
    it('o funcionário é escolhido da lista da rota de funcionários — sem o que já tem perfil', async () => {
        const host = await montar()
        expect(pedidos.map((p) => `${p.metodo} ${p.url}`)).toContain(`GET ${F().ROTAS_DA_BASE.funcionarios(CONTA)}`)
        const seletor = campo(host, 'vendedor-novo')
        await act(async () => { (seletor!.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        const listas = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
        const opcoes = Array.from(listas[listas.length - 1].querySelectorAll('.ant-select-item-option')).map((o) => (o.textContent || '').trim())
        expect(opcoes).toEqual(['Carla Dias'])
    })

    it('acrescentar um vendedor manda a lista INTEIRA: o gravado só com a chave, o novo com o que foi preenchido', async () => {
        const host = await montar()
        await escolherNoSeletor(campo(host, 'vendedor-novo'), 'Carla Dias')
        await clicar(botao(bloco(host, 'vendedores'), 'Acrescentar'))
        await digitar(entrada(host, `vendedor:${EMP_CARLA}:comissao_percentual`), '3')
        await salvar(host)
        expect(gravacoes()).toEqual([{
            url: F().ROTAS_DA_BASE.vendedor(CONTA), metodo: 'PUT',
            corpo: { vendedores: [{ employee_id: EMP_ANA }, { employee_id: EMP_CARLA, comissao_percentual: 3 }] },
        }])
    })

    it('o nome do vendedor gravado vem do GET', async () => {
        const host = await montar()
        expect(bloco(host, 'vendedores').textContent).toContain('Ana Souza')
    })

    it('ambiente: mudar um campo de um gravado manda o ambiente com só esse campo', async () => {
        const host = await montar()
        await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), 'Correr 2 folhas')
        await salvar(host)
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ ambientes: [{ ambiente: 'Sala', tipologia_usual: 'Correr 2 folhas' }] }])
    })

    it('ambiente removido sai da lista: a lista vai vazia', async () => {
        const host = await montar()
        await clicar(botao(campo(host, 'ambiente:Sala')!, 'Remover'))
        await salvar(host)
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ ambientes: [] }])
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
// UM BOTÃO SÓ (dono do produto, 23/10/2026). Medido: na primeira configuração real saíram duas
// gravações separadas em dois minutos — e com um botão por bloco dá para salvar o bloco 1, esquecer
// o 4 e sair com a casa meio configurada sem perceber.
// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(j) um botão só, para a tela inteira', () => {
    const porUrl = () => [...gravacoes()].sort((a, b) => a.url.localeCompare(b.url))

    it('o botão está na barra do topo, junto do nome da empresa — e nenhum bloco tem botão de salvar', async () => {
        const host = await montar()
        expect(botaoDeSalvar(host)).not.toBeNull()
        expect(botaoDeSalvar(host)!.textContent).toContain('Salvar alterações')
        for (const b of F().ORDEM_DOS_BLOCOS) expect(botao(bloco(host, b), 'Salvar')).toBeUndefined()
    })

    it('sem alteração: desabilitado, e a contagem diz que não há pendência', async () => {
        const host = await montar()
        expect(botaoDeSalvar(host)!.disabled).toBe(true)
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })

    it('a contagem acompanha os campos mudados — e desfazer a mudança tira da conta', async () => {
        const host = await montar()
        await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), 'Correr 2 folhas')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
        expect(botaoDeSalvar(host)!.disabled).toBe(false)
        // DOIS campos no mesmo item contam dois — a contagem é por campo, não por bloco
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await digitar(entrada(host, `vendedor:${EMP_ANA}:lucro_projetado_percentual`), '12')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(3))
        await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), '')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(2))
    })

    it('a frase: "1 alteração não salva", "3 alterações não salvas"', () => {
        expect(F().fraseDasPendencias(1)).toBe('1 alteração não salva')
        expect(F().fraseDasPendencias(3)).toBe('3 alterações não salvas')
    })

    it('alteração em dois blocos de rotas diferentes: as DUAS chamadas, cada uma com só o que mudou', async () => {
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Não cobra')
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await salvar(host)
        expect(porUrl()).toEqual([
            { url: F().ROTAS_DA_BASE.base(CONTA), metodo: 'PUT', corpo: { adicionais: { instalacao_modo: 'NAO_COBRA' } } },
            { url: F().ROTAS_DA_BASE.vendedor(CONTA), metodo: 'PUT', corpo: { vendedores: [{ employee_id: EMP_ANA, comissao_percentual: 7 }] } },
        ].sort((a, b) => a.url.localeCompare(b.url)))
    })

    it('a rota da base leva SÓ os adicionais: `esquadrias` não vai mais em corpo nenhum', async () => {
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Não cobra')
        await salvar(host)
        expect(gravacoes()).toEqual([{ url: F().ROTAS_DA_BASE.base(CONTA), metodo: 'PUT', corpo: { adicionais: { instalacao_modo: 'NAO_COBRA' } } }])
        expect(Object.keys(gravacoes()[0].corpo as Corpo)).toEqual(['adicionais'])
    })

    it('a ÁRVORE e as rotas da empresa no mesmo botão: cada uma na sua rota, num salvar só', async () => {
        const host = await montar()
        await clicar(botao(bloco(host, 'materias'), '+ Adicionar matéria-prima'))
        await digitar(bloco(host, 'materias').querySelector('[data-cabecalho-da-materia-prima] input') as HTMLInputElement, 'PVC')
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await salvar(host)
        expect(porUrl()).toEqual([
            { url: F().ROTAS_DA_BASE.arvore(CONTA), metodo: 'PUT', corpo: { arvore: { materias_primas: [{ nome: 'PVC' }] } } },
            { url: F().ROTAS_DA_BASE.vendedor(CONTA), metodo: 'PUT', corpo: { vendedores: [{ employee_id: EMP_ANA, comissao_percentual: 7 }] } },
        ].sort((a, b) => a.url.localeCompare(b.url)))
    })

    it('a árvore falha e o vendedor passa: o resultado NOMEIA o cartão das matérias-primas, com a mensagem da função', async () => {
        const MENSAGEM = 'materias_primas: materia-prima repetida na lista'
        respostas[`PUT ${F().ROTAS_DA_BASE.arvore(CONTA)}`] = { status: 400, body: { error: MENSAGEM } }
        const host = await montar()
        await clicar(botao(bloco(host, 'materias'), '+ Adicionar matéria-prima'))
        await digitar(bloco(host, 'materias').querySelector('[data-cabecalho-da-materia-prima] input') as HTMLInputElement, 'PVC')
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await salvar(host)
        const T = F().TITULO_DO_BLOCO
        const resultado = host.querySelector('[data-resultado-do-salvar]') as HTMLElement
        expect(resultado.querySelector('[data-salvos]')!.textContent).toContain(T.vendedores)
        expect(resultado.querySelector('[data-nao-salvos]')!.textContent).toContain(T.materias)
        expect(resultado.querySelector('[data-nao-salvos]')!.textContent).toContain(MENSAGEM)
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
    })

    it('nada de campo não tocado em corpo NENHUM: um campo em cada rota, e cada corpo com só o seu', async () => {
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Não cobra')
        await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), 'Correr 2 folhas')
        await digitar(entrada(host, `vendedor:${EMP_ANA}:lucro_projetado_percentual`), '12')
        await salvar(host)
        expect(porUrl()).toEqual([
            { url: F().ROTAS_DA_BASE.base(CONTA), metodo: 'PUT', corpo: { adicionais: { instalacao_modo: 'NAO_COBRA' } } },
            { url: F().ROTAS_DA_BASE.ambiente(CONTA), metodo: 'PUT', corpo: { ambientes: [{ ambiente: 'Sala', tipologia_usual: 'Correr 2 folhas' }] } },
            { url: F().ROTAS_DA_BASE.vendedor(CONTA), metodo: 'PUT', corpo: { vendedores: [{ employee_id: EMP_ANA, lucro_projetado_percentual: 12 }] } },
        ].sort((a, b) => a.url.localeCompare(b.url)))
    })

    it('uma chamada falha e a outra passa: diz o que foi salvo e o que não foi, NOMEANDO o bloco, e a pendência fica', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.vendedor(CONTA)}`] = { status: 400, body: { error: 'Pedido inválido.', erros: [{ campo: 'vendedores[0].comissao_percentual', mensagem: 'não pode ser maior que 100' }] } }
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Não cobra')
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await salvar(host)
        const T = F().TITULO_DO_BLOCO
        const resultado = host.querySelector('[data-resultado-do-salvar]') as HTMLElement
        expect(resultado.querySelector('[data-salvos]')!.textContent).toContain(T.adicionais)
        expect(resultado.querySelector('[data-salvos]')!.textContent).not.toContain(T.vendedores)
        expect(resultado.querySelector('[data-nao-salvos]')!.textContent).toContain(T.vendedores)
        expect(resultado.querySelector('[data-nao-salvos]')!.textContent).toContain('Pedido inválido.')
        expect(resultado.querySelector('[data-nao-salvos]')!.textContent).not.toContain(T.adicionais)
        // a recusa nomeada também fica NO bloco
        expect(bloco(host, 'vendedores').textContent).toContain('não pode ser maior que 100')
        // a alteração que não passou continua na tela, pendente
        expect(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`)!.value).toBe('7')
        expect(pendencias(host)).toBe(F().fraseDasPendencias(1))
        // e tentar de novo manda SÓ o que ficou pendente
        pedidos.length = 0
        respostas[`PUT ${F().ROTAS_DA_BASE.vendedor(CONTA)}`] = { status: 200, body: { depois: {} } }
        await salvar(host)
        expect(gravacoes()).toEqual([{ url: F().ROTAS_DA_BASE.vendedor(CONTA), metodo: 'PUT', corpo: { vendedores: [{ employee_id: EMP_ANA, comissao_percentual: 7 }] } }])
    })

    it('o contraste: tudo passou, nada pendente e o resultado não tem "não salvo"', async () => {
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Não cobra')
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await salvar(host)
        expect(host.querySelector('[data-resultado-do-salvar] [data-nao-salvos]')).toBeNull()
        expect(pendencias(host)).toBe(F().fraseDasPendencias(0))
    })

    it('sair pela navegação do Next com pendência: pergunta antes, e "não" cancela a saída', async () => {
        const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(false)
        try {
            const host = await montar()
            await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), 'Correr 2 folhas')
            expect(() => ouvintesDoRoteador.routeChangeStart('/outra')).toThrow()
            expect(confirmar).toHaveBeenCalledTimes(1)
        } finally {
            confirmar.mockRestore()
        }
    })

    it('o contraste: sem pendência, sair não pergunta nada', async () => {
        const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(false)
        try {
            await montar()
            const ouvinte = ouvintesDoRoteador.routeChangeStart
            if (ouvinte) expect(() => ouvinte('/outra')).not.toThrow()
            expect(confirmar).not.toHaveBeenCalled()
        } finally {
            confirmar.mockRestore()
        }
    })

    it('fechar ou recarregar a aba com pendência: o navegador avisa (beforeunload)', async () => {
        const host = await montar()
        const semPendencia = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(semPendencia)
        expect(semPendencia.defaultPrevented).toBe(false)
        await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), 'Correr 2 folhas')
        const comPendencia = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(comPendencia)
        expect(comPendencia.defaultPrevented).toBe(true)
    })
})
