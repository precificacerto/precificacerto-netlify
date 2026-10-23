/**
 * PORTÃO — a TELA da base de conhecimento (super admin › Atendimentos I.A. › Contas ligadas ›
 * empresa › Base de conhecimento).
 *
 * É a única tela do sistema em que o tenant vem do PEDIDO. A empresa está no CAMINHO da URL,
 * escolhida navegando da lista de contas ligadas — não num seletor dentro do formulário —, e o
 * nome dela fica no topo o tempo todo.
 *
 * O que este portão prova, e cada asserção fica VERMELHA sem a sua correção:
 *   (a) campo não tocado NÃO vai no corpo — a tela não serializa o formulário inteiro;
 *   (b) campo limpo vai como null (volta a herdar o nicho);
 *   (c) booleano em "não informado" não vai — nem como false; e o contraste: sim → não informado
 *       manda null, e não → manda false;
 *   (d) PERCENTUAL sem base NÃO é enviado; VALOR esconde e limpa a base;
 *   (e) a ORIGEM de cada campo aparece, e o herdado do nicho é visivelmente outro;
 *   (f) a mensagem da rota aparece como veio — 400 nomeado, os 409 do catálogo, 404;
 *   (g) os vendedores: o funcionário é escolhido da lista da rota de funcionários;
 *   (h) o nome da empresa no topo; quem não é super admin volta ao início sem chamar rota.
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
jest.mock('next/router', () => ({
    useRouter: () => ({ pathname: '/super-admin/atendimentos-ia/contas/[tenantId]/base-de-conhecimento', asPath: '/', query: { tenantId: CONTA }, replace: (u: string) => { replaces.push(u) }, push: (u: string) => { pushes.push(u) } }),
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
        adicionais: { tenant_id: CONTA, frete_modo: 'PERCENTUAL', frete_valor: null, frete_percentual: 5, frete_base: 'VALOR_DE_VENDA', instalacao_modo: null, instalacao_valor: null, instalacao_percentual: null, instalacao_base: null },
        ambientes: [{ tenant_id: CONTA, ambiente: 'Sala', vidro_padrao: 'Temperado 8mm', tipologia_usual: null }],
        vendedores: [{ tenant_id: CONTA, employee_id: EMP_ANA, comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: null, lucro_projetado_percentual: null, nome_do_funcionario: 'Ana Souza' }],
    }
}

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
const tresEstados = (host: ParentNode, c: string, estado: 'sim' | 'nao' | 'nao_informado') =>
    campo(host, c)?.querySelector(`input[type="radio"][value="${estado}"]`) as HTMLInputElement | null
const gravacoes = () => pedidos.filter((p) => p.metodo !== 'GET')

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

    it('os oito blocos, nesta ordem', async () => {
        const host = await montar()
        expect(Array.from(host.querySelectorAll('[data-bloco]')).map((b) => b.getAttribute('data-bloco'))).toEqual(
            ['perfil', 'vidro', 'guarnicao', 'acessorios', 'ambientes', 'producao', 'vendedores', 'adicionais'])
    })

    it('os blocos de esquadrias cobrem TODOS os campos da rota, cada um uma vez só', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { CAMPOS_DE_ESQUADRIAS } = require('@/lib/atendimentos-ia/base-de-conhecimento')
        const nosBlocos = F().BLOCOS_DE_ESQUADRIAS.flatMap((b) => b.campos)
        expect([...nosBlocos].sort()).toEqual(Object.keys(CAMPOS_DE_ESQUADRIAS).sort())
        expect(new Set(nosBlocos).size).toBe(nosBlocos.length)
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

describe('(e) a ORIGEM de cada campo aparece', () => {
    it('empresa, nicho e sem valor: cada um com o seu rótulo, e o valor herdado à vista', async () => {
        const host = await montar()
        const O = F().ROTULO_DA_ORIGEM
        expect(campo(host, 'linha_perfil')!.querySelector('[data-origem]')!.textContent).toBe(O.empresa)
        expect(campo(host, 'vidro_predominante')!.querySelector('[data-origem]')!.textContent).toBe(O.nicho)
        expect(campo(host, 'solda')!.querySelector('[data-origem]')!.textContent).toBe(O['sem valor'])
        expect(campo(host, 'vidro_predominante')!.textContent).toContain('Incolor 4mm')
    })

    it('o herdado do nicho é VISIVELMENTE outro: atributo de origem diferente e o input vazio, não preenchido com o valor herdado', async () => {
        const host = await montar()
        expect(campo(host, 'vidro_predominante')!.getAttribute('data-origem-do-campo')).toBe('nicho')
        expect(campo(host, 'cor_perfil_predominante')!.getAttribute('data-origem-do-campo')).toBe('empresa')
        expect(entrada(host, 'vidro_predominante')!.value).toBe('')
        expect(entrada(host, 'cor_perfil_predominante')!.value).toBe('Branco')
    })

    it('a origem é a que a ROTA devolveu — a tela não supõe padrão vazio', async () => {
        const corpo = baseGravada()
        ;(corpo.esquadrias as { efetivo: Record<string, unknown> }).efetivo.solda = { valor: 'MIG', origem: 'nicho' }
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 200, body: corpo }
        const host = await montar()
        expect(campo(host, 'solda')!.querySelector('[data-origem]')!.textContent).toBe(F().ROTULO_DA_ORIGEM.nicho)
        expect(campo(host, 'solda')!.textContent).toContain('MIG')
    })
})

describe('(a) e (b) só o que foi TOCADO vai no corpo; limpar manda null', () => {
    it('(a) mudar UM campo do perfil manda só ele — os outros, gravados ou não, ficam fora do corpo', async () => {
        const host = await montar()
        await digitar(entrada(host, 'cor_perfil_predominante'), 'Preto fosco')
        await clicar(botao(bloco(host, 'perfil'), 'Salvar'))
        expect(gravacoes()).toEqual([{ url: F().ROTAS_DA_BASE.base(CONTA), metodo: 'PUT', corpo: { esquadrias: { cor_perfil_predominante: 'Preto fosco' } } }])
    })

    it('(a) sem nada tocado no bloco, salvar não chama a rota', async () => {
        const host = await montar()
        await clicar(botao(bloco(host, 'perfil'), 'Salvar'))
        expect(gravacoes()).toEqual([])
    })

    it('(b) limpar um campo da empresa manda null — é o "volte a herdar"', async () => {
        const host = await montar()
        await digitar(entrada(host, 'cor_perfil_predominante'), '')
        await clicar(botao(bloco(host, 'perfil'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { cor_perfil_predominante: null } }])
    })

    it('(b) número limpo também vai null', async () => {
        const corpo = baseGravada()
        ;(corpo.esquadrias as { empresa: Record<string, unknown> }).empresa.barra_mm = 6000
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 200, body: corpo }
        const host = await montar()
        expect(entrada(host, 'barra_mm')!.value).toBe('6000')
        await digitar(entrada(host, 'barra_mm'), '')
        await clicar(botao(bloco(host, 'producao'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { barra_mm: null } }])
    })

    it('número digitado vai como NÚMERO, não texto', async () => {
        const host = await montar()
        await digitar(entrada(host, 'serra_mm'), '4')
        await clicar(botao(bloco(host, 'producao'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { serra_mm: 4 } }])
    })
})

describe('(c) booleano em TRÊS estados — e "não informado" não vira false', () => {
    it('não há caixa de marcar em lugar nenhum da tela', async () => {
        const host = await montar()
        expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    })

    it('cada booleano tem sim, não e não informado; o gravado aparece marcado', async () => {
        const host = await montar()
        for (const e of ['sim', 'nao', 'nao_informado'] as const) expect(tresEstados(host, 'usa_contramarco', e)).not.toBeNull()
        expect(tresEstados(host, 'usa_contramarco', 'sim')!.checked).toBe(true)
        expect(tresEstados(host, 'regiao_litoranea', 'nao')!.checked).toBe(true)
        expect(tresEstados(host, 'usa_arremate_interno', 'nao_informado')!.checked).toBe(true)
    })

    it('booleano em "não informado" e não tocado: não vai no corpo de outro campo do bloco', async () => {
        const host = await montar()
        await digitar(entrada(host, 'guarnicao_interna'), 'Alumínio 25')
        await clicar(botao(bloco(host, 'guarnicao'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { guarnicao_interna: 'Alumínio 25' } }])
    })

    it('clicar "não informado" num booleano que já era não informado: nada vai', async () => {
        const host = await montar()
        await clicar(tresEstados(host, 'usa_arremate_interno', 'nao_informado'))
        await clicar(botao(bloco(host, 'guarnicao'), 'Salvar'))
        expect(gravacoes()).toEqual([])
    })

    it('o contraste: sim → não informado manda null (volta a herdar)', async () => {
        const host = await montar()
        await clicar(tresEstados(host, 'usa_contramarco', 'nao_informado'))
        await clicar(botao(bloco(host, 'guarnicao'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { usa_contramarco: null } }])
    })

    it('o contraste: sim → não manda false, nem null nem omitido', async () => {
        const host = await montar()
        await clicar(tresEstados(host, 'usa_contramarco', 'nao'))
        await clicar(botao(bloco(host, 'guarnicao'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { usa_contramarco: false } }])
    })
})

describe('(d) adicionais: PERCENTUAL exige base; VALOR esconde e limpa a base', () => {
    it('PERCENTUAL sem base NÃO é enviado, e a tela diz o que falta', async () => {
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 200, body: { ...baseGravada(), adicionais: null } }
        const host = await montar()
        await escolherNoSeletor(campo(host, 'instalacao_modo'), 'Percentual')
        await digitar(entrada(host, 'instalacao_percentual'), '8')
        await clicar(botao(bloco(host, 'adicionais'), 'Salvar'))
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
        await clicar(botao(bloco(host, 'adicionais'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ adicionais: { instalacao_modo: 'PERCENTUAL', instalacao_percentual: 8, instalacao_base: 'CUSTO_DA_INSTALACAO' } }])
    })

    it('trocar PERCENTUAL por VALOR esconde a base e a manda null, junto com o percentual', async () => {
        const host = await montar()
        expect(campo(host, 'frete_base')).not.toBeNull()
        await escolherNoSeletor(campo(host, 'frete_modo'), 'Valor')
        expect(campo(host, 'frete_base')).toBeNull()
        expect(campo(host, 'frete_percentual')).toBeNull()
        await digitar(entrada(host, 'frete_valor'), '150')
        await clicar(botao(bloco(host, 'adicionais'), 'Salvar'))
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
        await digitar(entrada(host, 'cor_perfil_predominante'), 'Preto fosco')
        await clicar(botao(bloco(host, 'perfil'), 'Salvar'))
        expect(bloco(host, 'perfil').textContent).toContain(frase)
        expect(bloco(host, 'perfil').textContent).toContain(codigo)
    })

    it('400: cada erro nomeado aparece, com o campo e a mensagem', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.vendedor(CONTA)}`] = { status: 400, body: { error: 'Pedido inválido.', erros: [{ campo: 'vendedores[0].employee_id', mensagem: `${EMP_ANA} não é funcionário desta empresa.` }] } }
        const host = await montar()
        await digitar(entrada(host, `vendedor:${EMP_ANA}:comissao_percentual`), '7')
        await clicar(botao(bloco(host, 'vendedores'), 'Salvar'))
        const texto = bloco(host, 'vendedores').textContent
        expect(texto).toContain('Pedido inválido.')
        expect(texto).toContain('vendedores[0].employee_id')
        expect(texto).toContain(`${EMP_ANA} não é funcionário desta empresa.`)
    })

    it('404: a frase da rota', async () => {
        respostas[`PUT ${F().ROTAS_DA_BASE.ambiente(CONTA)}`] = { status: 404, body: { error: 'Empresa não encontrada.' } }
        const host = await montar()
        await digitar(entrada(host, 'ambiente:Sala:tipologia_usual'), 'Correr 2 folhas')
        await clicar(botao(bloco(host, 'ambientes'), 'Salvar'))
        expect(bloco(host, 'ambientes').textContent).toContain('Empresa não encontrada.')
    })

    it('falha ao LER a base é erro na tela, nunca formulário vazio', async () => {
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 500, body: { error: 'Falha ao ler a base de conhecimento.' } }
        const host = await montar()
        expect(host.textContent).toContain('Falha ao ler a base de conhecimento.')
        expect(host.querySelector('[data-bloco]')).toBeNull()
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
        await clicar(botao(bloco(host, 'vendedores'), 'Salvar'))
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
        await clicar(botao(bloco(host, 'ambientes'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ ambientes: [{ ambiente: 'Sala', tipologia_usual: 'Correr 2 folhas' }] }])
    })

    it('ambiente removido sai da lista: a lista vai vazia', async () => {
        const host = await montar()
        await clicar(botao(campo(host, 'ambiente:Sala')!, 'Remover'))
        await clicar(botao(bloco(host, 'ambientes'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ ambientes: [] }])
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
// FORNECEDOR E LINHA vêm das TABELAS EM USO da conta (dono do produto, 23/10/2026). Digitar "Wolf"
// onde a tabela diz "Wolff" cria uma divergência que ninguém vê até o orçamento não cruzar.
// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(i) fornecedor e linha são SELEÇÃO, alimentada pelas tabelas em uso da conta', () => {
    const opcoesDe = async (c: string) => {
        await act(async () => { (campo(document, c)!.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        const listas = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
        return Array.from(listas[listas.length - 1].querySelectorAll('.ant-select-item-option')).map((o) => (o.textContent || '').trim())
    }
    const exibido = (host: ParentNode, c: string) => campo(host, c)!.querySelector('.ant-select-selection-item')?.textContent ?? null
    const semTabela = () => { respostas[`GET ${ROTAS_DO_CATALOGO.tabelasDaConta(CONTA)}`] = { status: 200, body: { ...TABELAS_DA_CONTA, em_uso: [] } } }
    const comGravado = (campos: Corpo) => {
        const corpo = baseGravada()
        Object.assign((corpo.esquadrias as { empresa: Corpo }).empresa, campos)
        respostas[`GET ${F().ROTAS_DA_BASE.base(CONTA)}`] = { status: 200, body: corpo }
    }

    it('não são mais texto livre: nem fornecedor nem linha têm caixa de digitação', async () => {
        const host = await montar()
        for (const c of ['fornecedor_perfil', 'linha_perfil']) {
            expect(campo(host, c)!.querySelector('.ant-select')).not.toBeNull()
            expect(campo(host, c)!.querySelector('input.ant-input')).toBeNull()
        }
    })

    it('o fornecedor oferece os das tabelas em uso, sem repetir', async () => {
        await montar()
        expect(await opcoesDe('fornecedor_perfil')).toEqual(['Wolff Perfis'])
    })

    it('a linha oferece as linhas das tipologias das tabelas em uso — sem repetir e sem a tipologia sem linha', async () => {
        await montar()
        expect(await opcoesDe('linha_perfil')).toEqual(['Gold', 'Suprema'])
    })

    it('escolher o fornecedor da lista manda o nome EXATO da tabela', async () => {
        const host = await montar()
        await escolherNoSeletor(campo(host, 'fornecedor_perfil'), 'Wolff Perfis')
        await clicar(botao(bloco(host, 'perfil'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { fornecedor_perfil: 'Wolff Perfis' } }])
    })

    it('sem tabela em uso: o campo fica desabilitado, diz por quê, e leva de volta à seção de tabelas da conta', async () => {
        semTabela()
        const host = await montar()
        for (const c of ['fornecedor_perfil', 'linha_perfil']) {
            expect(campo(host, c)!.querySelector('.ant-select')!.classList.contains('ant-select-disabled')).toBe(true)
            expect(campo(host, c)!.textContent).toContain(F().SEM_TABELA_EM_USO)
            const volta = campo(host, c)!.querySelector('a[data-volta-para-tabelas]') as HTMLAnchorElement
            expect(volta.getAttribute('href')).toBe(F().rotaDasTabelasDaConta(CONTA))
        }
        expect(F().rotaDasTabelasDaConta(CONTA)).toBe(`${ROUTES.SUPER_ADMIN_IA_CONTAS}/${CONTA}#tabelas-em-uso`)
    })

    it('o contraste: com tabela em uso, o campo está habilitado e sem o aviso', async () => {
        const host = await montar()
        expect(campo(host, 'fornecedor_perfil')!.querySelector('.ant-select')!.classList.contains('ant-select-disabled')).toBe(false)
        expect(campo(host, 'fornecedor_perfil')!.textContent).not.toContain(F().SEM_TABELA_EM_USO)
    })

    it('valor GRAVADO que não está nas tabelas em uso: aparece, marcado como fora da lista, e NÃO é apagado', async () => {
        comGravado({ fornecedor_perfil: 'Wolf' })
        const host = await montar()
        expect(exibido(host, 'fornecedor_perfil')).toContain('Wolf')
        expect(campo(host, 'fornecedor_perfil')!.querySelector('[data-fora-da-lista]')?.textContent).toBe(F().FORA_DA_LISTA)
        // salvar OUTRO campo do mesmo bloco não leva o fornecedor junto — nem null, nem trocado
        await digitar(entrada(host, 'cor_perfil_predominante'), 'Preto fosco')
        await clicar(botao(bloco(host, 'perfil'), 'Salvar'))
        expect(gravacoes().map((g) => g.corpo)).toEqual([{ esquadrias: { cor_perfil_predominante: 'Preto fosco' } }])
    })

    it('o contraste: valor gravado QUE ESTÁ na lista não leva a marca', async () => {
        const host = await montar()
        expect(exibido(host, 'linha_perfil')).toBe('Suprema')
        expect(campo(host, 'linha_perfil')!.querySelector('[data-fora-da-lista]')).toBeNull()
    })

    it('sem tabela em uso e com valor gravado: o valor continua à vista, marcado, e nada é enviado', async () => {
        semTabela()
        comGravado({ fornecedor_perfil: 'Wolf' })
        const host = await montar()
        expect(exibido(host, 'fornecedor_perfil')).toContain('Wolf')
        expect(campo(host, 'fornecedor_perfil')!.querySelector('[data-fora-da-lista]')).not.toBeNull()
        await clicar(botao(bloco(host, 'perfil'), 'Salvar'))
        expect(gravacoes()).toEqual([])
    })

    it('falha ao ler as tabelas é ERRO no campo — não "sem tabela em uso"', async () => {
        respostas[`GET ${ROTAS_DO_CATALOGO.tabelasDaConta(CONTA)}`] = { status: 500, body: { error: 'Não foi possível ler as tabelas da conta.' } }
        const host = await montar()
        expect(campo(host, 'fornecedor_perfil')!.textContent).toContain('Não foi possível ler as tabelas da conta.')
        expect(campo(host, 'fornecedor_perfil')!.textContent).not.toContain(F().SEM_TABELA_EM_USO)
    })
})
