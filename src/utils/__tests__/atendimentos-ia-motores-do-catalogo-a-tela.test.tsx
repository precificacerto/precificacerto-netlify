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
 *   (3) "Novo motor": categoria → fornecedor → família → arquivo (29/10/2026), cada um liberando o seguinte; o fornecedor sai SÓ dos que têm
 *       tabela da categoria; no PERFIL a família vem da tabela de Perfil do fornecedor; criar faz, NESTA ordem, a URL assinada na pasta DO FORNECEDOR (tipo motor), os bytes, o POST do catálogo com os cinco
 *       campos — e relê; a recusa aparece DENTRO do modal;
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
    id, familia: 'PVC', fornecedor_id: W, fornecedor: 'Wolf', categoria: 'PERFIL', arquivo_nome: `${id}.xlsx`, criado_em: '2026-10-28', arquivado_em: null, tipologias: 0, usos: [], ...f,
})
const MOTORES = [
    motor(M_WOLF, { arquivo_nome: 'wolff.xlsm', tipologias: 164, usos: [
        { empresa: 'Alfa Vidros', familia: 'PVC Linha 2' },
        { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC WOLF' },
    ] }),
    motor(M_LIVRE, { fornecedor_id: R, fornecedor: 'Roller Star', categoria: 'PERSIANAS', familia: 'ALUMINIO', arquivo_nome: 'roller.xlsx', tipologias: 12 }),
    motor(M_ARQ, { arquivo_nome: 'velho.xlsx', arquivado_em: '2026-10-01' }),
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
    FAMILIA_DA_TABELA_DE_PERFIL: string
    AVISO_DA_TROCA: string
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
const criar = () => Array.from(document.body.querySelectorAll('.ant-modal-footer button')).find((b) => b.textContent?.includes('Criar motor')) as HTMLButtonElement
const opcoesDoCombo = async (rotulo: string) => {
    await act(async () => { combo(rotulo).querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await assentar()
    return Array.from(document.body.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')).map((o) => o.textContent)
}
async function preencherTudo() {
    await escolher('Categoria do motor', 'Persianas')
    await escolher('Fornecedor do motor', 'Wolf')
    await escolher('Família do motor', 'PVC')
    await anexar()
}

describe('(1) a lista do catálogo', () => {
    it('cada motor com fornecedor, categoria e tipo pelo NOME, arquivo, tipologias e quem usa (empresa · família · etapa)', async () => {
        const host = await montar()
        expect(pedidos[0].chave).toBe(`GET ${ROTAS_DOS_MOTORES.lista}`)
        const wolf = linha(host, M_WOLF)!.textContent!
        expect(wolf).toContain('Wolf')
        expect(wolf).toContain('Perfil')
        expect(wolf).toContain('PVC')
        expect(wolf).toContain('wolff.xlsm')
        expect(wolf).toContain('164')
        expect(Array.from(linha(host, M_WOLF)!.querySelectorAll('[data-usos] li')).map((l) => l.textContent)).toEqual([
            'Alfa Vidros · PVC Linha 2', 'Esquadrias De Paula Ltda · Esquadrias de PVC WOLF',
        ])
        // a etapa saiu do catálogo (29/10/2026): nem a palavra aparece no cartão — lista, aviso e títulos
        expect(host.querySelector('[data-catalogo-de-motores]')!.textContent).toContain('cada família escolhe o seu')
        expect(host.querySelector('[data-catalogo-de-motores]')!.textContent).not.toMatch(/etapa/i)
        const livre = linha(host, M_LIVRE)!
        expect(livre.textContent).toContain('Persianas')
        expect(livre.textContent).toContain('Alumínio')
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
        expect(botao(linha(host, M_ARQ)!, 'Arquivar velho.xlsx')).toBeUndefined()
    })

    it('500 na leitura: ERRO com a frase da rota — nunca "nenhum motor"', async () => {
        respostas[`GET ${ROTAS_DOS_MOTORES.lista}`] = [{ status: 500, body: { error: 'Não foi possível ler o catálogo de motores.' } }]
        const host = await montar()
        expect(host.querySelector('[data-erro-do-catalogo]')?.textContent).toContain('Não foi possível ler o catálogo de motores.')
        expect(host.textContent).not.toContain(Componente().SEM_MOTOR_NO_CATALOGO)
    })
})

describe('(2) arquivar', () => {
    it('o motor que famílias usam tem o botão TRAVADO, e o porquê no título — contando famílias, não etapas', async () => {
        const host = await montar()
        const b = botao(linha(host, M_WOLF)!, 'Arquivar wolff.xlsm')!
        expect(b.disabled).toBe(true)
        expect(b.getAttribute('title')).toBe('2 famílias usam este motor: troque o motor delas, na base de conhecimento da conta, antes de arquivar.')
    })

    it('o livre: chama SÓ a rota de arquivar com o id, e relê o catálogo', async () => {
        const host = await montar()
        const n = pedidos.length
        await clicar(botao(linha(host, M_LIVRE)!, 'Arquivar roller.xlsx'))
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.arquivar}`, `GET ${ROTAS_DOS_MOTORES.lista}`])
        expect(pedidos[n].corpo).toEqual({ motor_id: M_LIVRE })
    })

    it('a recusa da rota aparece no cartão com a frase dela, e o catálogo não é relido', async () => {
        const frase = 'o motor e o da etapa 1 ("Apanhado") da familia "Esquadrias de PVC" da empresa Esquadrias De Paula Ltda: aponte a etapa para outro motor antes de arquivar'
        respostas[`POST ${ROTAS_DOS_MOTORES.arquivar}`] = [{ status: 400, body: { error: frase } }]
        const host = await montar()
        const n = pedidos.length
        await clicar(botao(linha(host, M_LIVRE)!, 'Arquivar roller.xlsx'))
        expect(host.querySelector('[data-erro-ao-arquivar]')?.textContent).toContain(frase)
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.arquivar}`])
    })
})

describe('(3) "Novo motor": categoria → fornecedor → família → arquivo (29/10/2026)', () => {
    it('cada campo libera o seguinte, NESTA ordem, e o criar só liga com os quatro', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        // o antd põe o rótulo no input e no contêiner do combo: a ordem é a da primeira aparição de cada um
        const campos = [...new Set(Array.from(modal().querySelectorAll('[aria-label$=" do motor"]')).map((e) => e.getAttribute('aria-label')))]
        expect(campos).toEqual(['Categoria do motor', 'Fornecedor do motor', 'Família do motor', 'Arquivo do motor'])
        expect(combo('Fornecedor do motor').className).toContain('ant-select-disabled')
        expect(combo('Família do motor').className).toContain('ant-select-disabled')
        expect(criar().disabled).toBe(true)
        await escolher('Categoria do motor', 'Persianas')
        expect(combo('Fornecedor do motor').className).not.toContain('ant-select-disabled')
        expect(combo('Família do motor').className).toContain('ant-select-disabled')
        await escolher('Fornecedor do motor', 'Wolf')
        // fora do Perfil a família ainda se escolhe à mão, entre todas
        expect(combo('Família do motor').className).not.toContain('ant-select-disabled')
        expect(await opcoesDoCombo('Família do motor')).toEqual(['PVC', 'Alumínio', 'PVC Veca'])
        // sem a família, o arquivo não se escolhe — nem o botão, nem o campo de arquivo por trás dele
        expect((modal().querySelector('[aria-label="Arquivo do motor"]') as HTMLButtonElement).disabled).toBe(true)
        expect((modal().querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true)
        await escolherNoAberto('PVC')
        expect(criar().disabled).toBe(true)
        await anexar()
        expect(criar().disabled).toBe(false)
    })

    it('PERFIL com UMA tabela de Perfil no fornecedor: a família já vem escolhida (a da tabela), travada, e o aviso diz de onde veio', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Perfil')
        await escolher('Fornecedor do motor', 'Wolf')
        expect(combo('Família do motor').querySelector('.ant-select-selection-item')?.textContent).toBe('PVC')
        expect(combo('Família do motor').className).toContain('ant-select-disabled')
        expect(modal().querySelector('[data-familia-da-tabela-de-perfil]')?.textContent).toBe(Componente().FAMILIA_DA_TABELA_DE_PERFIL)
        await anexar()
        expect(criar().disabled).toBe(false)
    })

    it('PERFIL com DUAS famílias nas tabelas de Perfil: nada vem escolhido, e só elas são oferecidas', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Perfil')
        await escolher('Fornecedor do motor', 'Veca')
        expect(combo('Família do motor').querySelector('.ant-select-selection-item')).toBeNull()
        expect(combo('Família do motor').className).not.toContain('ant-select-disabled')
        expect(await opcoesDoCombo('Família do motor')).toEqual(['PVC', 'Alumínio'])
        await escolherNoAberto('Alumínio')
        // trocar para o fornecedor de uma família só: a dele entra no lugar
        await escolher('Fornecedor do motor', 'Wolf')
        expect(combo('Família do motor').querySelector('.ant-select-selection-item')?.textContent).toBe('PVC')
    })

    it('PERFIL: a família escolhida à mão em outra categoria que não está no Perfil do fornecedor é LIMPA ao passar para o Perfil', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Persianas')
        await escolher('Fornecedor do motor', 'Wolf')
        await escolher('Família do motor', 'Alumínio')
        await escolher('Categoria do motor', 'Perfil')
        // a Wolf tem tabela de Perfil só PVC: Alumínio sai, PVC entra
        expect(combo('Família do motor').querySelector('.ant-select-selection-item')?.textContent).toBe('PVC')
    })

    it('PERFIL com várias famílias: a escolhida à mão que NÃO é de nenhuma delas é limpa; a que é, fica', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-novo-motor]'))
        await escolher('Categoria do motor', 'Persianas')
        await escolher('Fornecedor do motor', 'Veca')
        await escolher('Família do motor', 'PVC Veca')
        await escolher('Categoria do motor', 'Perfil')
        expect(combo('Família do motor').querySelector('.ant-select-selection-item')).toBeNull()
        await escolher('Família do motor', 'Alumínio')
        await escolher('Categoria do motor', 'Persianas')
        await escolher('Categoria do motor', 'Perfil')
        expect(combo('Família do motor').querySelector('.ant-select-selection-item')?.textContent).toBe('Alumínio')
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
        expect(pedidos[n + 2].corpo).toEqual({ fornecedor_id: W, categoria: 'PERSIANAS', familia: 'PVC', path: PATH, nome: 'Motor persiana.xlsx' })
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
        const b = botao(linha(host, M_WOLF)!, 'Trocar o arquivo de wolff.xlsm')!
        expect(b.disabled).toBe(false)
        await clicar(b)
        expect(modalDa('data-modal-da-troca').querySelector('[data-aviso-da-troca]')!.textContent).toBe(Componente().AVISO_DA_TROCA)
        expect(ok('Trocar o arquivo').disabled).toBe(true)
        // o arquivado não tem botão de trocar
        await clicar(host.querySelector('[aria-label="Mostrar os arquivados"]'))
        expect(botao(linha(host, M_ARQ)!, 'Trocar o arquivo de velho.xlsx')).toBeUndefined()
    })

    it('trocar: URL na pasta do fornecedor DO MOTOR (tipo motor), os bytes, o POST da troca com o motor e o arquivo — nessa ordem — e relê', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.trocarArquivo}`] = [{ status: 200, body: { motor_id: 'novo', motor_antigo: M_WOLF, etapas_reapontadas: 3, regras: 30, tipologias: 4 } }]
        const host = await montar()
        await clicar(botao(linha(host, M_WOLF)!, 'Trocar o arquivo de wolff.xlsm'))
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
        await clicar(botao(linha(host, M_WOLF)!, 'Trocar o arquivo de wolff.xlsm'))
        await anexarNa('data-modal-da-troca', 'Motor persiana.xlsx')
        const n = pedidos.length
        await clicar(ok('Trocar o arquivo'))
        expect(modalDa('data-modal-da-troca').querySelector('[data-erro-ao-trocar]')!.textContent).toContain('falta a aba "Motor por barra"')
        expect(chaves().slice(n)).not.toContain(`GET ${ROTAS_DOS_MOTORES.lista}`)
    })

    it('a frase do arquivo trocado: o motor novo, as etapas que passaram e o antigo arquivado', () => {
        const U = require('@/utils/atendimentos-ia-catalogo-de-motores') as typeof import('@/utils/atendimentos-ia-catalogo-de-motores') // eslint-disable-line @typescript-eslint/no-require-imports
        expect(U.fraseDoArquivoTrocado({ tipologias: 4, etapas_reapontadas: 3 })).toBe('Arquivo trocado: motor novo com 4 tipologia(s); 3 etapa(s) passaram ao motor novo; o antigo foi arquivado, com o conteúdo intacto.')
        expect(U.fraseDoArquivoTrocado({ tipologias: 1, etapas_reapontadas: 0 })).toContain('nenhuma etapa usava o motor')
    })

    it('"Editar" fica TRAVADO no motor com uso, com o porquê; no livre, abre com a categoria e o fornecedor de agora, e salvar só liga quando muda', async () => {
        const host = await montar()
        const travado = botao(linha(host, M_WOLF)!, 'Editar wolff.xlsm')!
        expect(travado.disabled).toBe(true)
        expect(travado.getAttribute('title')).toBe((require('@/utils/atendimentos-ia-catalogo-de-motores') as typeof import('@/utils/atendimentos-ia-catalogo-de-motores')).MOTOR_COM_USO_NAO_SE_EDITA) // eslint-disable-line @typescript-eslint/no-require-imports
        await clicar(botao(linha(host, M_LIVRE)!, 'Editar roller.xlsx'))
        expect(combo('Categoria do motor (edição)').querySelector('.ant-select-selection-item')?.textContent).toBe('Persianas')
        expect(combo('Fornecedor do motor (edição)').querySelector('.ant-select-selection-item')?.textContent).toBe('Roller Star')
        expect(ok('Salvar').disabled).toBe(true)
        await escolher('Fornecedor do motor (edição)', 'Wolf')
        expect(ok('Salvar').disabled).toBe(false)
    })

    it('editar: trocar a categoria LIMPA o fornecedor sem tabela dela; salvar manda motor, fornecedor e categoria, e relê', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.editar}`] = [{ status: 200, body: { orcamentista_motor: {} } }]
        const host = await montar()
        await clicar(botao(linha(host, M_LIVRE)!, 'Editar roller.xlsx'))
        await escolher('Categoria do motor (edição)', 'Perfil')
        expect(combo('Fornecedor do motor (edição)').querySelector('.ant-select-selection-item')).toBeNull()
        expect(ok('Salvar').disabled).toBe(true)
        await escolher('Fornecedor do motor (edição)', 'Wolf')
        const n = pedidos.length
        await clicar(ok('Salvar'))
        expect(chaves().slice(n)).toEqual([`POST ${ROTAS_DOS_MOTORES.editar}`, `GET ${ROTAS_DOS_MOTORES.lista}`])
        expect(pedidos[n].corpo).toEqual({ motor_id: M_LIVRE, fornecedor_id: W, categoria: 'PERFIL' })
    })

    it('a recusa da edição aparece DENTRO do modal, com a frase da rota', async () => {
        respostas[`POST ${ROTAS_DOS_MOTORES.editar}`] = [{ status: 400, body: { error: 'o motor tem uso (0 etapa(s), 1 item(ns) de levantamento)' } }]
        const host = await montar()
        await clicar(botao(linha(host, M_LIVRE)!, 'Editar roller.xlsx'))
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
