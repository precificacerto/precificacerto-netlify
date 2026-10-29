/**
 * PORTÃO — o CATÁLOGO DE MOTORES na tela (`motores-do-catalogo.component.tsx`, no CATÁLOGO — o antigo "Fornecedores e tabelas"; dono do produto, 28/10/2026,
 * migração 20261028000001).
 *
 * POR QUÊ: o motor é GLOBAL e COMPARTILHADO — "empresas diferentes podem usar o mesmo motor" —, com fornecedor + categoria + tipo, e mora
 * num catálogo abaixo dos fornecedores. A etapa da família-instância só o seleciona; subir o arquivo é daqui, não da página da conta.
 *
 * O que este portão fica vermelho:
 *   (1) a lista: fornecedor, categoria e tipo pelo NOME, arquivo, tipologias e QUEM USA (empresa · família · etapa); os arquivados só com o
 *       interruptor; falha de leitura é ERRO, nunca "nenhum motor";
 *   (2) arquivar: o motor em uso tem o botão travado (com o porquê); o livre chama SÓ a rota de arquivar com o id, e relê; a recusa da rota
 *       aparece no cartão, com a frase dela;
 *   (3) "Novo motor": categoria → fornecedor → famílias → arquivo, cada um liberando o seguinte; o fornecedor sai SÓ dos que têm tabela da
 *       categoria; O MOTOR SERVE N FAMÍLIAS (dono do produto, 29/10/2026; migração 20261029000003): as famílias são escolha LIVRE do catálogo,
 *       pelo menos uma, em qualquer categoria, sem amarrar a uma tabela do fornecedor; criar faz, NESTA ordem, a URL assinada na pasta DO
 *       FORNECEDOR (tipo motor), os bytes, o POST do catálogo com os cinco campos (as famílias na ordem do catálogo) — e relê; a recusa aparece
 *       DENTRO do modal;
 *   (4) o menu chama a página de CATÁLOGO; a página do nicho tem portão próprio.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROTAS_DO_CATALOGO, type FornecedorDaLista } from '@/utils/atendimentos-ia-catalogo'
import { ROTAS_DOS_MOTORES, type MotorDoCatalogo } from '@/utils/atendimentos-ia-catalogo-de-motores'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// a primeira montagem carrega o antd inteiro: no CI ela passa dos 5 s padrão
jest.setTimeout(20000)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const W = '00000000-0000-4000-8000-0000000000f1'
const R = '00000000-0000-4000-8000-0000000000f2'
const M_WOLF = '00000000-0000-4000-8000-0000000000a1'
const M_LIVRE = '00000000-0000-4000-8000-0000000000a2'
const M_ARQ = '00000000-0000-4000-8000-0000000000a3'
const PATH = `${W}/motor/u1-Motor-persiana.xlsx`
const URL_ASSINADA = `https://storage.exemplo/${PATH}?token=t`
const FORNECEDORES: FornecedorDaLista[] = [
    { id: W, nome: 'Wolf', nicho_id: 'n', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO' as const, tabelas: 2, contas_usando: [], categorias_das_tabelas: ['PERFIL', 'PERSIANAS'], familias_do_perfil: ['PVC'] },
    // duas tabelas de PERFIL, de duas famílias: a família do motor se escolhe ENTRE elas
    { id: 'f-veca', nome: 'Veca', nicho_id: 'n', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO' as const, tabelas: 3, contas_usando: [], categorias_das_tabelas: ['PERFIL', 'PERSIANAS'], familias_do_perfil: ['ALUMINIO', 'PVC'] },
    { id: R, nome: 'Roller Star', nicho_id: 'n', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO' as const, tabelas: 1, contas_usando: [], categorias_das_tabelas: ['PERSIANAS'], familias_do_perfil: [] as string[] },
    // sem tabela nenhuma: não aparece em categoria nenhuma
    { id: 'f-sem', nome: 'Alfa Sem Tabela', nicho_id: 'n', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO' as const, tabelas: 0, contas_usando: [], categorias_das_tabelas: [], familias_do_perfil: [] as string[] },
]
const CATEGORIAS = [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'PERSIANAS', rotulo: 'Persianas', ordem: 2 }, { chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 }]
const FAMILIAS = [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }, { chave: 'VECA', rotulo: 'PVC Veca', ordem: 3 }]
const motor = (id: string, f: Partial<MotorDoCatalogo>): MotorDoCatalogo => ({
    id, nome: `Motor ${id}`, familias: ['PVC'], fornecedor_id: W, fornecedor: 'Wolf', categoria: 'PERFIL', arquivo_nome: `${id}.xlsx`, criado_em: '2026-10-28', arquivado_em: null, tipologias: 0, usos: [], ...f,
})
const MOTORES = [
    motor(M_WOLF, { nome: 'Wolf PVC Europa', arquivo_nome: 'wolff.xlsm', tipologias: 164, usos: [
        { empresa: 'Alfa Vidros', familia: 'PVC Linha 2' },
        { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC WOLF' },
    ] }),
    // o motor de persiana da Roller Star atua em DUAS famílias (20261029000003), fora da ordem do catálogo de propósito
    motor(M_LIVRE, { nome: 'Roller persiana', fornecedor_id: R, fornecedor: 'Roller Star', categoria: 'PERSIANAS', familias: ['ALUMINIO', 'PVC'], arquivo_nome: 'roller.xlsx', tipologias: 12 }),
    motor(M_ARQ, { nome: 'Velho', arquivo_nome: 'velho.xlsx', arquivado_em: '2026-10-01' }),
]

type Resposta = { status: number; body: unknown }
let respostas: Record<string, Resposta[]> = {}
const pedidos: Array<{ chave: string; corpo: unknown; headers?: Record<string, string> }> = []

beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${ROTAS_DOS_MOTORES.lista}`]: [{ status: 200, body: { motores: MOTORES } }],
        [`POST ${ROTAS_DOS_MOTORES.arquivar}`]: [{ status: 200, body: { depois: {} } }],
        [`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`]: [{ status: 200, body: { path: PATH, signedUrl: URL_ASSINADA } }],
        [`PUT ${URL_ASSINADA}`]: [{ status: 200, body: {} }],
        [`POST ${ROTAS_DOS_MOTORES.lista}`]: [{ status: 200, body: { motor_id: 'novo', importacao_id: 'i', regras: 30, tipologias: 4, detalhes: 4, avisos: [] } }],
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body, headers: init?.headers })
        const fila = respostas[chave]
        const r = fila && fila.length > 0 ? (fila.length > 1 ? fila.shift()! : fila[0]) : { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Componente = () => require('@/page-parts/atendimentos-ia/motores-do-catalogo.component') as {
    MotoresDoCatalogo: React.ComponentType<{ fornecedores: typeof FORNECEDORES; categorias: typeof CATEGORIAS; familias: typeof FAMILIAS }>
    SEM_MOTOR_NO_CATALOGO: string
    fraseSemFornecedorDaCategoria: (c: string) => string
    AVISO_DA_TROCA: string
    FAMILIAS_DO_MOTOR_NA_TELA: string
    MOTOR_ARQUIVADO_SEM_A_LISTA: string
}

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(elemento?: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(elemento ?? React.createElement(Componente().MotoresDoCatalogo, { fornecedores: FORNECEDORES, categorias: CATEGORIAS, familias: FAMILIAS })) })
    await assentar()
    return host
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '') || b.getAttribute('aria-label') === texto) as HTMLButtonElement | undefined
async function clicar(el: Element | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => { (el as HTMLElement).click() })
    await assentar()
}
const linha = (host: ParentNode, id: string) => host.querySelector(`[data-motor="${id}"]`) as HTMLElement | null
const chaves = () => pedidos.map((p) => p.chave)
const modal = () => document.body.querySelector('[data-modal-do-motor]') as HTMLElement
const combo = (rotulo: string) => document.body.querySelector(`[aria-label="${rotulo}"]`)!.closest('.ant-select') as HTMLElement
/** Abre o combo pelo rótulo e escolhe a opção pelo texto, no dropdown que está aberto. */
async function escolher(rotulo: string, texto: string) {
    await act(async () => { combo(rotulo).querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await assentar()
    const opcoes = Array.from(document.body.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')) as HTMLElement[]
    await clicar(opcoes.find((o) => o.textContent === texto))
}
/** Escolhe a opção pelo texto no dropdown que JÁ está aberto (depois de `opcoesDoCombo`, abrir de novo o fecharia). */
async function escolherNoAberto(texto: string) {
    const opcoes = Array.from(document.body.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')) as HTMLElement[]
    await clicar(opcoes.find((o) => o.textContent === texto))
}
async function anexar(nome = 'Motor persiana.xlsx') {
    const input = modal().querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    const arquivo = new File([new Uint8Array([80, 75, 3, 4])], nome)
    await act(async () => {
        Object.defineProperty(input, 'files', { value: [arquivo], configurable: true })
        input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await assentar()
}
/** Digita no campo como o React o vê: o setter nativo e o evento de input. */
async function digitar(campo: HTMLInputElement, texto: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(campo, texto)
        campo.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await assentar()
}
const criar = () => Array.from(document.body.querySelectorAll('.ant-modal-footer button')).find((b) => b.textContent?.includes('Criar motor')) as HTMLButtonElement
const opcoesDoCombo = async (rotulo: string) => {
    await act(async () => { combo(rotulo).querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await assentar()
    return Array.from(document.body.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')).map((o) => o.textContent)
}
async function preencherTudo() {
    await escolher('Categoria do motor', 'Persianas')
    await escolher('Fornecedor do motor', 'Wolf')
    await escolher('Famílias do motor', 'PVC')
    await anexar()
}
/** As famílias escolhidas num seletor múltiplo, como a tela as mostra. */
const escolhidas = (rotulo: string) => Array.from(combo(rotulo).querySelectorAll('.ant-select-selection-item-content')).map((e) => e.textContent)
const camposDoModal = () => [...new Set(Array.from(modal().querySelectorAll('[aria-label$=" do motor"]')).map((e) => e.getAttribute('aria-label')))]

describe('(1) a lista do catálogo', () => {
    it('cada motor com fornecedor, categoria e tipo pelo NOME, arquivo, tipologias e quem usa (empresa · família · etapa)', async () => {
        const host = await montar()
        expect(pedidos[0].chave).toBe(`GET ${ROTAS_DOS_MOTORES.lista}`)
        const wolf = linha(host, M_WOLF)!.textContent!
        expect(wolf).toContain('Wolf')
        expect(wolf).toContain('Perfil')
        expect(wolf).toContain('PVC')
        expect(wolf).toContain('wolff.xlsm')
        // o NOME do motor (20261029000005) na sua coluna, e o arquivo na dele
        expect(linha(host, M_WOLF)!.querySelector('[data-nome-do-motor]')?.textContent).toBe('Wolf PVC Europa')
        expect(wolf).toContain('164')
        expect(Array.from(linha(host, M_WOLF)!.querySelectorAll('[data-usos] li')).map((l) => l.textContent)).toEqual([
            'Alfa Vidros · PVC Linha 2', 'Esquadrias De Paula Ltda · Esquadrias de PVC WOLF',
        ])
        // a etapa saiu do catálogo (29/10/2026): nem a palavra aparece no cartão — lista, aviso e títulos
        expect(host.querySelector('[data-catalogo-de-motores]')!.textContent).toContain('cada família escolhe o seu')
        expect(host.querySelector('[data-catalogo-de-motores]')!.textContent).not.toMatch(/etapa/i)
        const livre = linha(host, M_LIVRE)!
        expect(livre.textContent).toContain('Persianas')
        // as FAMÍLIAS do motor, pelo nome e na ORDEM do catálogo (PVC antes de Alumínio), todas — nunca só a primeira
        expect(livre.querySelector('[data-familias-do-motor]')?.getAttribute('data-familias-do-motor')).toBe('PVC,ALUMINIO')
        expect(Array.from(livre.querySelectorAll('[data-familias-do-motor] .ant-tag')).map((e) => e.textContent)).toEqual(['PVC', 'Alumínio'])
        expect(Array.from(linha(host, M_WOLF)!.querySelectorAll('[data-familias-do-motor] .ant-tag')).map((e) => e.textContent)).toEqual(['PVC'])
        expect(host.textContent).not.toContain('Qualquer linha')
        expect(livre.querySelector('[data-sem-uso]')?.textContent).toBe('Nenhuma família usa este motor.')
    })

    it('DENTRO DO NICHO (29/10/2026): só os motores dos fornecedores recebidos — o da Wolf some quando a lista é só a da Roller Star', async () => {
        const host = await montar(React.createElement(Componente().MotoresDoCatalogo, { fornecedores: FORNECEDORES.filter((f) => f.id === R), categorias: CATEGORIAS, familias: FAMILIAS }))
        expect(linha(host, M_WOLF)).toBeNull()
        expect(linha(host, M_LIVRE)).not.toBeNull()
    })

    it('o arquivado só aparece com o interruptor, marcado como arquivado e sem botão de arquivar', async () => {
        const host = await montar()
        expect(linha(host, M_ARQ)).toBeNull()
        await clicar(host.querySelector('[aria-label="Mostrar os arquivados"]'))
        expect(linha(host, M_ARQ)!.textContent).toContain('arquivado')
        expect(botao(linha(host, M_ARQ)!, 'Arquivar Velho')).toBeUndefined()
    })

    it('500 na leitura: ERRO com a frase da rota — nunca "nenhum motor"', async () => {
        respostas[`GET ${ROTAS_DOS_MOTORES.lista}`] = [{ status: 500, body: { error: 'Não foi possível ler o catálogo de motores.' } }]
        const host = await montar()
        expect(host.querySelector('[data-erro-do-catalogo]')?.textContent).toContain('Não foi possível ler o catálogo de motores.')
        expect(host.textContent).not.toContain(Componente().SEM_MOTOR_NO_CATALOGO)
    })
})

describe('(2) arquivar — também COM USO (20261029000005): as etapas ficam sem motor, e a tela diz onde repor', () => {
    /** Clica em Arquivar e confirma no balão. */
    async function arquivarConfirmando(host: HTMLElement, id: string, rotulo: string) {
        await clicar(botao(linha(host, id)!, rotulo))
        const confirmar = Array.from(document.body.querySelectorAll('.ant-popover:not(.ant-popover-hidden) .ant-popconfirm-buttons button')).find((b) => b.textContent?.replace(/\s/g, '') === 'Arquivar')
        await clicar(confirmar)
    }
    const ETAPAS = [
        { etapa_id: 'e1', tenant_id: 't1', materia_prima_id: 'mp1', empresa: 'Alfa Vidros', familia: 'PVC Linha 2', numero: 1, rotulo: 'Apanhado' },
        { etapa_id: 'e2', tenant_id: 't2', materia_prima_id: 'mp2', empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC WOLF', numero: 2, rotulo: 'Levantamento de esquadrias' },
    ]

    it('o motor que famílias usam tem o botão LIGADO; a confirmação diz que as famílias ficam sem ele — contando famílias, sem falar em etapa', async () => {
        const host = await montar()
        const b = botao(linha(host, M_WOLF)!, 'Arquivar Wolf PVC Europa')!
        expect(b.disabled).toBe(false)
        const n = pedidos.length
        await clicar(b)
        const balao = document.body.querySelector('.ant-popover:not(.ant-popover-hidden)')!
        expect(balao.textContent).toContain('2 famílias usam este motor: arquivar o tira delas, e elas não calculam até alguém escolher outro motor.')
        // clicar no botão só abre a confirmação: nenhum pedido sai
        expect(chaves().slice(n)).toEqual([])
    })

    it('em uso, confirmado: SÓ a rota de arquivar com o id, relê o catálogo, e o aviso LISTA as etapas que ficaram sem motor (empresa · família · etapa N ("rótulo"))', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.arquivar}`] = [{ status: 200, body: { depois: { orcamentista_motor: { id: M_WOLF }, etapas_sem_motor: ETAPAS } } }]
        const host = await montar()
        const n = pedidos.length
        await arquivarConfirmando(host, M_WOLF, 'Arquivar Wolf PVC Europa')
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.arquivar}`, `GET ${ROTAS_DOS_MOTORES.lista}`])
        expect(pedidos[n].corpo).toEqual({ motor_id: M_WOLF })
        const aviso = host.querySelector('[data-motor-arquivado]')!
        expect(aviso.textContent).toContain('Wolf PVC Europa: Motor arquivado. 2 etapas ficaram sem motor')
        expect(Array.from(aviso.querySelectorAll('[data-etapas-que-ficaram-sem-motor] li')).map((l) => l.textContent)).toEqual([
            'Alfa Vidros · PVC Linha 2 · etapa 1 ("Apanhado")', 'Esquadrias De Paula Ltda · Esquadrias de PVC WOLF · etapa 2 ("Levantamento de esquadrias")',
        ])
    })

    it('o livre: a lista vazia vira "nenhuma etapa usava", sem lista', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.arquivar}`] = [{ status: 200, body: { depois: { orcamentista_motor: {}, etapas_sem_motor: [] } } }]
        const host = await montar()
        await arquivarConfirmando(host, M_LIVRE, 'Arquivar Roller persiana')
        expect(host.querySelector('[data-motor-arquivado]')!.textContent).toContain('Roller persiana: Motor arquivado. Nenhuma etapa usava o motor.')
        expect(host.querySelector('[data-etapas-que-ficaram-sem-motor]')).toBeNull()
    })

    it('200 SEM a lista na resposta: a tela diz que ARQUIVOU e que não sabe quais etapas — nunca "não foi arquivado", nunca "nenhuma etapa usava"', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.arquivar}`] = [{ status: 200, body: { depois: {} } }]
        const host = await montar()
        const n = pedidos.length
        await arquivarConfirmando(host, M_WOLF, 'Arquivar Wolf PVC Europa')
        const aviso = host.querySelector('[data-motor-arquivado-sem-lista]')!
        expect(aviso.textContent).toContain(`Wolf PVC Europa: ${Componente().MOTOR_ARQUIVADO_SEM_A_LISTA}`)
        expect(aviso.textContent).toContain('não trouxe a lista das etapas que ficaram sem motor')
        expect(host.querySelector('[data-erro-ao-arquivar]')).toBeNull()
        expect(host.querySelector('[data-motor-arquivado]')).toBeNull()
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.arquivar}`, `GET ${ROTAS_DOS_MOTORES.lista}`])
    })

    it('a recusa da rota aparece no cartão com a frase dela, e o catálogo não é relido', async () => {
        const frase = 'o motor ja esta arquivado'
        respostas[`POST ${ROTAS_DOS_MOTORES.arquivar}`] = [{ status: 400, body: { error: frase } }]
        const host = await montar()
        const n = pedidos.length
        await arquivarConfirmando(host, M_LIVRE, 'Arquivar Roller persiana')
        expect(host.querySelector('[data-erro-ao-arquivar]')?.textContent).toContain(frase)
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.arquivar}`])
    })
})

describe('(3) "Novo motor": categoria → fornecedor → famílias → arquivo (20261029000003)', () => {
    it('cada campo libera o seguinte, NESTA ordem, em QUALQUER categoria; o arquivo só com pelo menos uma família, e o criar só liga com todos', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        // o antd põe o rótulo no input e no contêiner do combo: a ordem é a da primeira aparição de cada um
        expect(camposDoModal()).toEqual(['Categoria do motor', 'Fornecedor do motor', 'Famílias do motor', 'Arquivo do motor', 'Nome do motor'])
        expect(combo('Fornecedor do motor').className).toContain('ant-select-disabled')
        expect(combo('Famílias do motor').className).toContain('ant-select-disabled')
        expect(criar().disabled).toBe(true)
        await escolher('Categoria do motor', 'Persianas')
        expect(combo('Fornecedor do motor').className).not.toContain('ant-select-disabled')
        expect(combo('Famílias do motor').className).toContain('ant-select-disabled')
        await escolher('Fornecedor do motor', 'Roller Star')
        expect(combo('Famílias do motor').className).not.toContain('ant-select-disabled')
        // sem família, o arquivo não se escolhe — nem o botão, nem o campo de arquivo por trás dele
        expect((modal().querySelector('[aria-label="Arquivo do motor"]') as HTMLButtonElement).disabled).toBe(true)
        expect((modal().querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true)
        await escolher('Famílias do motor', 'Alumínio')
        expect((modal().querySelector('[aria-label="Arquivo do motor"]') as HTMLButtonElement).disabled).toBe(false)
        expect(criar().disabled).toBe(true)
        await anexar()
        expect(criar().disabled).toBe(false)
        expect(modal().querySelector('[data-familias-do-motor-na-tela]')?.textContent).toBe(Componente().FAMILIAS_DO_MOTOR_NA_TELA)
        // o nome veio do arquivo sem a extensão; apagá-lo desliga o criar
        expect((modal().querySelector('[aria-label="Nome do motor"]') as HTMLInputElement).value).toBe('Motor persiana')
        await digitar(modal().querySelector('[aria-label="Nome do motor"]') as HTMLInputElement, '   ')
        expect(criar().disabled).toBe(true)
    })

    it('as famílias NÃO se amarram a uma tabela do fornecedor: o catálogo inteiro, na ordem, para a Wolf de Perfil (cuja tabela de Perfil é só PVC) e para a Roller Star de persiana', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Perfil')
        await escolher('Fornecedor do motor', 'Wolf')
        // nada vem escolhido por ser "a da tabela": a escolha é de quem cadastra
        expect(escolhidas('Famílias do motor')).toEqual([])
        expect(await opcoesDoCombo('Famílias do motor')).toEqual(['PVC', 'Alumínio', 'PVC Veca'])
        await escolherNoAberto('PVC Veca')
        await escolher('Categoria do motor', 'Persianas')
        await escolher('Fornecedor do motor', 'Roller Star')
        // trocar categoria e fornecedor NÃO limpa as famílias: elas não dependem de nenhum dos dois
        expect(escolhidas('Famílias do motor')).toEqual(['PVC Veca'])
    })

    it('tirar a única família desliga o arquivo e o criar de novo', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await preencherTudo()
        expect(criar().disabled).toBe(false)
        // tira pelo "x" da etiqueta, como quem usa a tela
        await clicar(combo('Famílias do motor').querySelector('.ant-select-selection-item-remove'))
        expect(escolhidas('Famílias do motor')).toEqual([])
        expect(criar().disabled).toBe(true)
        expect((modal().querySelector('[aria-label="Arquivo do motor"]') as HTMLButtonElement).disabled).toBe(true)
    })

    it('o fornecedor sai SÓ dos que têm tabela da categoria, em ordem alfabética; o sem tabela não aparece', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Persianas')
        expect(await opcoesDoCombo('Fornecedor do motor')).toEqual(['Roller Star', 'Veca', 'Wolf'])
        await escolher('Categoria do motor', 'Perfil')
        expect(await opcoesDoCombo('Fornecedor do motor')).toEqual(['Veca', 'Wolf'])
    })

    it('trocar a categoria LIMPA o fornecedor que não a tem, e mantém o que tem', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Persianas')
        await escolher('Fornecedor do motor', 'Roller Star')
        await escolher('Categoria do motor', 'Perfil')
        expect(combo('Fornecedor do motor').querySelector('.ant-select-selection-item')).toBeNull()
        await escolher('Fornecedor do motor', 'Wolf')
        await escolher('Categoria do motor', 'Persianas')
        expect(combo('Fornecedor do motor').querySelector('.ant-select-selection-item')?.textContent).toBe('Wolf')
    })

    it('categoria sem fornecedor com tabela: a tela diz isso, nomeando a categoria', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Vidro')
        expect(modal().querySelector('[data-sem-fornecedor-da-categoria]')?.textContent).toBe(Componente().fraseSemFornecedorDaCategoria('Vidro'))
        expect(Componente().fraseSemFornecedorDaCategoria('Vidro')).toContain('Nenhum fornecedor tem tabela da categoria Vidro')
        expect(await opcoesDoCombo('Fornecedor do motor')).toEqual([])
    })

    it('criar: URL na pasta DO FORNECEDOR (tipo motor), os bytes, o POST do catálogo com os cinco campos — nessa ordem — e relê', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await preencherTudo()
        const n = pedidos.length
        await clicar(criar())
        expect(chaves().slice(n)).toEqual([
            `POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`, `PUT ${URL_ASSINADA}`, `POST ${ROTAS_DOS_MOTORES.lista}`, `GET ${ROTAS_DOS_MOTORES.lista}`,
        ])
        expect(pedidos[n].corpo).toEqual({ fornecedor_id: W, tipo: 'motor', nome: 'Motor persiana.xlsx' })
        expect(pedidos[n + 1].headers).toEqual({ 'x-upsert': 'false' })
        expect(pedidos[n + 2].corpo).toEqual({ fornecedor_id: W, categoria: 'PERSIANAS', familias: ['PVC'], nome_do_motor: 'Motor persiana', path: PATH, nome: 'Motor persiana.xlsx' })
    })

    it('criar com DUAS famílias escolhidas fora de ordem: o corpo as leva TODAS, na ordem do catálogo', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Perfil')
        await escolher('Fornecedor do motor', 'Wolf')
        await opcoesDoCombo('Famílias do motor')
        await escolherNoAberto('PVC Veca')
        await escolherNoAberto('PVC')
        expect(escolhidas('Famílias do motor')).toEqual(['PVC Veca', 'PVC'])
        await anexar()
        const n = pedidos.length
        await clicar(criar())
        expect(pedidos[n + 2].corpo).toEqual({ fornecedor_id: W, categoria: 'PERFIL', familias: ['PVC', 'VECA'], nome_do_motor: 'Motor persiana', path: PATH, nome: 'Motor persiana.xlsx' })
    })

    it('o NOME digitado antes do arquivo NÃO é sobrescrito pelo do arquivo, e vai aparado no corpo', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Persianas')
        await escolher('Fornecedor do motor', 'Wolf')
        await escolher('Famílias do motor', 'PVC')
        await digitar(modal().querySelector('[aria-label="Nome do motor"]') as HTMLInputElement, '  Persiana Wolf 2026  ')
        await anexar()
        expect((modal().querySelector('[aria-label="Nome do motor"]') as HTMLInputElement).value).toBe('  Persiana Wolf 2026  ')
        const n = pedidos.length
        await clicar(criar())
        expect(pedidos[n + 2].corpo).toMatchObject({ nome_do_motor: 'Persiana Wolf 2026', nome: 'Motor persiana.xlsx' })
    })

    it('a recusa da rota aparece DENTRO do modal, com a frase dela, e o catálogo não é relido', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.lista}`] = [{ status: 422, body: { error: 'Motor persiana.xlsx: falta a aba "Motor por barra".' } }]
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await preencherTudo()
        const n = pedidos.length
        await clicar(criar())
        expect(modal().querySelector('[data-erro-ao-criar-motor]')?.textContent).toContain('falta a aba "Motor por barra"')
        expect(chaves().slice(n)).not.toContain(`GET ${ROTAS_DOS_MOTORES.lista}`)
        expect(host.querySelector('[data-erro-ao-arquivar]')).toBeNull()
    })

    it('a URL recusada: nada de bytes nem de POST do catálogo, e a frase nomeia o arquivo', async () => {
        respostas[`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`] = [{ status: 404, body: { error: 'Fornecedor não encontrado.' } }]
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await preencherTudo()
        const n = pedidos.length
        await clicar(criar())
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`])
        expect(modal().querySelector('[data-erro-ao-criar-motor]')?.textContent).toContain('Motor persiana.xlsx')
        expect(modal().querySelector('[data-erro-ao-criar-motor]')?.textContent).toContain('Fornecedor não encontrado.')
    })
})

describe('(5) trocar o arquivo (motor NOVO) e editar (só sem uso) — 29/10/2026', () => {
    const modalDa = (marca: string) => document.body.querySelector(`[${marca}]`) as HTMLElement
    async function anexarNa(marca: string, nome: string) {
        const input = modalDa(marca).querySelector('input[type="file"]') as HTMLInputElement
        const arquivo = new File([new Uint8Array([80, 75, 3, 4])], nome)
        await act(async () => { Object.defineProperty(input, 'files', { value: [arquivo], configurable: true }); input.dispatchEvent(new Event('change', { bubbles: true })) })
        await assentar()
    }
    const ok = (texto: string) => Array.from(document.body.querySelectorAll('.ant-modal-footer button')).find((b) => b.textContent?.includes(texto)) as HTMLButtonElement

    it('"Trocar arquivo" vale também com USO; o aviso diz que é motor novo e que o antigo fica arquivado', async () => {
        const host = await montar()
        const b = botao(linha(host, M_WOLF)!, 'Trocar o arquivo de Wolf PVC Europa')!
        expect(b.disabled).toBe(false)
        await clicar(b)
        expect(modalDa('data-modal-da-troca').querySelector('[data-aviso-da-troca]')!.textContent).toBe(Componente().AVISO_DA_TROCA)
        expect(ok('Trocar o arquivo').disabled).toBe(true)
        // o arquivado não tem botão de trocar
        await clicar(host.querySelector('[aria-label="Mostrar os arquivados"]'))
        expect(botao(linha(host, M_ARQ)!, 'Trocar o arquivo de Velho')).toBeUndefined()
    })

    it('trocar: URL na pasta do fornecedor DO MOTOR (tipo motor), os bytes, o POST da troca com o motor e o arquivo — nessa ordem — e relê', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.trocarArquivo}`] = [{ status: 200, body: { motor_id: 'novo', motor_antigo: M_WOLF, etapas_reapontadas: 3, regras: 30, tipologias: 4 } }]
        const host = await montar()
        await clicar(botao(linha(host, M_WOLF)!, 'Trocar o arquivo de Wolf PVC Europa'))
        await anexarNa('data-modal-da-troca', 'Motor persiana.xlsx')
        const n = pedidos.length
        await clicar(ok('Trocar o arquivo'))
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DO_CATALOGO.urlDeEnvio}`, `PUT ${URL_ASSINADA}`, `POST ${ROTAS_DOS_MOTORES.trocarArquivo}`, `GET ${ROTAS_DOS_MOTORES.lista}`])
        expect(pedidos[n].corpo).toEqual({ fornecedor_id: W, tipo: 'motor', nome: 'Motor persiana.xlsx' })
        expect(pedidos[n + 2].corpo).toEqual({ motor_id: M_WOLF, path: PATH, nome: 'Motor persiana.xlsx' })
        expect(document.body.querySelector('[data-modal-da-troca]')).toBeNull()
    })

    it('a recusa da troca aparece DENTRO do modal, com a frase da rota, e o catálogo não é relido', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.trocarArquivo}`] = [{ status: 422, body: { error: 'Motor persiana.xlsx: falta a aba "Motor por barra".' } }]
        const host = await montar()
        await clicar(botao(linha(host, M_WOLF)!, 'Trocar o arquivo de Wolf PVC Europa'))
        await anexarNa('data-modal-da-troca', 'Motor persiana.xlsx')
        const n = pedidos.length
        await clicar(ok('Trocar o arquivo'))
        expect(modalDa('data-modal-da-troca').querySelector('[data-erro-ao-trocar]')!.textContent).toContain('falta a aba "Motor por barra"')
        expect(chaves().slice(n)).not.toContain(`GET ${ROTAS_DOS_MOTORES.lista}`)
    })

    it('a frase do arquivo trocado: o motor novo, as etapas que passaram e o antigo arquivado', () => {
        const U = require('@/utils/atendimentos-ia-catalogo-de-motores') as typeof import('@/utils/atendimentos-ia-catalogo-de-motores') // eslint-disable-line @typescript-eslint/no-require-imports
        expect(U.fraseDoArquivoTrocado({ tipologias: 4, etapas_reapontadas: 3 })).toBe('Arquivo trocado: motor novo, com o mesmo nome e 4 tipologia(s); 3 etapa(s) passaram ao motor novo; o antigo foi arquivado, com o conteúdo intacto.')
        expect(U.fraseDoArquivoTrocado({ tipologias: 1, etapas_reapontadas: 0 })).toContain('nenhuma etapa usava o motor')
    })

    it('"Editar" vale também COM USO: categoria e fornecedor vêm TRAVADOS, com o porquê; as FAMÍLIAS se editam, e salvar manda a lista inteira', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.editar}`] = [{ status: 200, body: { orcamentista_motor: {} } }]
        const host = await montar()
        const b = botao(linha(host, M_WOLF)!, 'Editar Wolf PVC Europa')!
        expect(b.disabled).toBe(false)
        await clicar(b)
        const U = require('@/utils/atendimentos-ia-catalogo-de-motores') as typeof import('@/utils/atendimentos-ia-catalogo-de-motores') // eslint-disable-line @typescript-eslint/no-require-imports
        expect(combo('Categoria do motor (edição)').className).toContain('ant-select-disabled')
        expect(combo('Fornecedor do motor (edição)').className).toContain('ant-select-disabled')
        expect(combo('Categoria do motor (edição)').getAttribute('title')).toBe(U.MOTOR_COM_USO_NAO_SE_EDITA)
        expect(modalDa('data-modal-da-edicao').querySelector('[data-motor-com-uso]')?.textContent).toBe(U.MOTOR_COM_USO_NAO_SE_EDITA)
        expect(combo('Famílias do motor (edição)').className).not.toContain('ant-select-disabled')
        expect(escolhidas('Famílias do motor (edição)')).toEqual(['PVC'])
        expect(ok('Salvar').disabled).toBe(true)
        await escolher('Famílias do motor (edição)', 'Alumínio')
        expect(ok('Salvar').disabled).toBe(false)
        const n = pedidos.length
        await clicar(ok('Salvar'))
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.editar}`, `GET ${ROTAS_DOS_MOTORES.lista}`])
        expect(pedidos[n].corpo).toEqual({ motor_id: M_WOLF, fornecedor_id: W, categoria: 'PERFIL', familias: ['PVC', 'ALUMINIO'], nome_do_motor: 'Wolf PVC Europa' })
    })

    it('sem uso: categoria e fornecedor LIVRES; trocar a categoria limpa o fornecedor sem tabela dela; salvar manda os quatro, as famílias na ordem do catálogo', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.editar}`] = [{ status: 200, body: { orcamentista_motor: {} } }]
        const host = await montar()
        await clicar(botao(linha(host, M_LIVRE)!, 'Editar Roller persiana'))
        expect(combo('Categoria do motor (edição)').querySelector('.ant-select-selection-item')?.textContent).toBe('Persianas')
        expect(combo('Fornecedor do motor (edição)').querySelector('.ant-select-selection-item')?.textContent).toBe('Roller Star')
        expect(modalDa('data-modal-da-edicao').querySelector('[data-motor-com-uso]')).toBeNull()
        expect(ok('Salvar').disabled).toBe(true)
        await escolher('Categoria do motor (edição)', 'Perfil')
        expect(combo('Fornecedor do motor (edição)').querySelector('.ant-select-selection-item')).toBeNull()
        expect(ok('Salvar').disabled).toBe(true)
        await escolher('Fornecedor do motor (edição)', 'Wolf')
        // as famílias não dependem da categoria nem do fornecedor: ficam as duas
        expect(escolhidas('Famílias do motor (edição)')).toEqual(['Alumínio', 'PVC'])
        const n = pedidos.length
        await clicar(ok('Salvar'))
        expect(pedidos[n].corpo).toEqual({ motor_id: M_LIVRE, fornecedor_id: W, categoria: 'PERFIL', familias: ['PVC', 'ALUMINIO'], nome_do_motor: 'Roller persiana' })
    })

    it('as MESMAS famílias em outra ordem não é mudança; sem nenhuma família, salvar não liga', async () => {
        const host = await montar()
        await clicar(botao(linha(host, M_LIVRE)!, 'Editar Roller persiana'))
        // tira Alumínio e põe de volta: a lista fica ['PVC', 'ALUMINIO'], a mesma de antes noutra ordem
        await opcoesDoCombo('Famílias do motor (edição)')
        await escolherNoAberto('Alumínio')
        expect(ok('Salvar').disabled).toBe(false)
        await escolherNoAberto('Alumínio')
        expect(escolhidas('Famílias do motor (edição)')).toEqual(['PVC', 'Alumínio'])
        expect(ok('Salvar').disabled).toBe(true)
        await escolherNoAberto('Alumínio')
        await escolherNoAberto('PVC')
        expect(escolhidas('Famílias do motor (edição)')).toEqual([])
        expect(ok('Salvar').disabled).toBe(true)
    })

    it('tirar a família que uma etapa usa: a recusa 409 da rota aparece DENTRO do modal, nomeando quem usa, e o catálogo não é relido', async () => {
        const frase = 'a familia PVC nao pode sair do motor: em uso por 2 etapa(s) (Alfa Vidros / PVC Linha 2 / etapa 1; Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1). Aponte-os para outro motor antes. Nada foi gravado.'
        respostas[`POST ${ROTAS_DOS_MOTORES.editar}`] = [{ status: 409, body: { error: frase } }]
        const host = await montar()
        await clicar(botao(linha(host, M_WOLF)!, 'Editar Wolf PVC Europa'))
        await opcoesDoCombo('Famílias do motor (edição)')
        await escolherNoAberto('Alumínio')
        await escolherNoAberto('PVC')
        const n = pedidos.length
        await clicar(ok('Salvar'))
        expect(pedidos[n].corpo).toEqual({ motor_id: M_WOLF, fornecedor_id: W, categoria: 'PERFIL', familias: ['ALUMINIO'], nome_do_motor: 'Wolf PVC Europa' })
        expect(modalDa('data-modal-da-edicao').querySelector('[data-erro-ao-editar]')!.textContent).toContain(frase)
        expect(chaves().slice(n)).not.toContain(`GET ${ROTAS_DOS_MOTORES.lista}`)
    })

    it('o NOME se edita COM USO: só ele mudando já liga o salvar, e vai aparado; em branco, salvar desliga', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.editar}`] = [{ status: 200, body: { orcamentista_motor: {} } }]
        const host = await montar()
        await clicar(botao(linha(host, M_WOLF)!, 'Editar Wolf PVC Europa'))
        const campo = modalDa('data-modal-da-edicao').querySelector('[aria-label="Nome do motor (edição)"]') as HTMLInputElement
        expect(campo.value).toBe('Wolf PVC Europa')
        expect(campo.disabled).toBe(false)
        await digitar(campo, ' Wolf PVC Europa ')
        expect(ok('Salvar').disabled).toBe(true)
        await digitar(campo, '  ')
        expect(ok('Salvar').disabled).toBe(true)
        await digitar(campo, ' Wolf PVC 2026 ')
        expect(ok('Salvar').disabled).toBe(false)
        const n = pedidos.length
        await clicar(ok('Salvar'))
        expect(pedidos[n].corpo).toEqual({ motor_id: M_WOLF, fornecedor_id: W, categoria: 'PERFIL', familias: ['PVC'], nome_do_motor: 'Wolf PVC 2026' })
    })

    it('a recusa da edição aparece DENTRO do modal, com a frase da rota', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.editar}`] = [{ status: 400, body: { error: 'o motor tem uso (0 etapa(s), 1 item(ns) de levantamento)' } }]
        const host = await montar()
        await clicar(botao(linha(host, M_LIVRE)!, 'Editar Roller persiana'))
        await escolher('Fornecedor do motor (edição)', 'Wolf')
        await clicar(ok('Salvar'))
        expect(modalDa('data-modal-da-edicao').querySelector('[data-erro-ao-editar]')!.textContent).toContain('1 item(ns) de levantamento')
    })
})

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { is_super_admin: true } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children) }))

describe('(4) o menu do CATÁLOGO (a página do nicho tem portão próprio: `atendimentos-ia-catalogo-por-nicho.test.tsx`)', () => {
    it('o menu e o título chamam a página de "Catálogo"', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        expect((require('@/constants/page-titles') as { PAGE_TITLES: Record<string, string> }).PAGE_TITLES.SUPER_ADMIN_IA_FORNECEDORES).toBe('Catálogo')
    })
})
