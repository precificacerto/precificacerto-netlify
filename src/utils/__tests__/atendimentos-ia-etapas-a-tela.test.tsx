/**
 * PORTÃO — as ETAPAS da família-instância na tela (`etapas-da-familia.component.tsx`, na base de conhecimento da conta).
 *
 * POR QUÊ (dono do produto, 27/10/2026): o consultor cadastra, por família, as etapas — número, rótulo LIVRE, AÇÃO de
 * uma lista FECHADA ("combo, não texto"), instrução e as abas da planilha que a etapa carrega. "O rótulo é livre; a
 * ação não é. Etapa sem ação da lista é erro, não etapa nova." Desde 28/10/2026 (migração 20261028000001) a etapa é da
 * FAMÍLIA-INSTÂNCIA (a matéria-prima de UMA empresa), e o motor dela sai do CATÁLOGO, sem campo de arquivo.
 *
 * O que este portão fica vermelho:
 *   (1) a tela LÊ pela rota e mostra cada etapa: número (a posição), rótulo, ação, instrução e abas; falha de leitura
 *       é ERRO, nunca "nenhuma etapa"; família sem etapa diz que ainda não foi cadastrada;
 *   (2) a AÇÃO é um combo com as cinco ações do sistema — não há campo onde digitá-la —, e a etapa nova nasce sem ação;
 *   (3) salvar manda a lista INTEIRA na ordem da tela, com o id das gravadas e sem id nas novas; só habilita com mudança;
 *   (4) reordenar é subir e descer, e o número que vai é a posição;
 *   (5) etapa sem ação, rótulo em branco ou instrução acima do limite NÃO sai da tela: a frase nomeia a etapa;
 *   (6) a recusa da rota aparece NO cartão, e o rascunho continua na tela;
 *   (7) EXCLUIR etapa gravada pede confirmação nomeando o rótulo, a instrução e o motor GRAVADOS, e ao salvar ela não vai na lista (a função a
 *       remove e renumera as que ficam, 20261031000001); a nova, ainda não salva, só se descarta do rascunho;
 *   (8) a tela diz, sem rodeio, que as etapas ainda não mudam a conversa;
 *   (9) o motor da etapa sai do catálogo: só do mesmo tipo e não arquivado, os dos principais primeiro; NÃO há campo de arquivo, e o
 *       link "cadastrar motor no catálogo" leva ao catálogo.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ACOES_DA_ETAPA, ROTULO_DA_ABA, ROTULO_DA_ACAO, rotaDasEtapas, type EtapaDaFamilia } from '@/utils/atendimentos-ia-etapas'
import type { MotorDoCatalogo } from '@/utils/atendimentos-ia-catalogo-de-motores'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const E1 = '00000000-0000-4000-8000-0000000000e1'
const E2 = '00000000-0000-4000-8000-0000000000e2'
const T = '00000000-0000-4000-8000-0000000000d1'
const MP = '00000000-0000-4000-8000-0000000000b1'
const MP2 = '00000000-0000-4000-8000-0000000000b2'
const M1 = '00000000-0000-4000-8000-0000000000a1'
const M2 = '00000000-0000-4000-8000-0000000000a2'
const motor = (id: string, f: Partial<MotorDoCatalogo>): MotorDoCatalogo => ({ id, nome: `Motor ${id}`, familias: ['PVC'], fornecedor_id: 'f-x', fornecedor: 'X', categoria: 'PERFIL', arquivo_nome: `${id}.xlsx`, criado_em: '2026-10-28', arquivado_em: null, tipologias: null, usos: [], ...f })
// o catálogo como a rota o entrega; a tela ainda filtra o tipo e o arquivado (a rota já filtra — a tela não confia)
const MOTORES = [
    // o NOME do motor (20261029000005) é o que o combo mostra, não o arquivo
    motor(M2, { fornecedor_id: 'f-roller', fornecedor: 'Roller', categoria: 'PERSIANAS', nome: 'Roller Persiana 2026', arquivo_nome: 'Roller.xlsx' }),
    motor(M1, { fornecedor_id: 'f-wolff', fornecedor: 'Wolff', nome: 'Wolff PVC', arquivo_nome: 'Wolff.xlsx' }),
    motor('m-alu', { familias: ['ALUMINIO'], fornecedor: 'Alu', arquivo_nome: 'Alu.xlsx' }),
    motor('m-arq', { fornecedor: 'Velho', arquivo_nome: 'Velha.xlsx', arquivado_em: '2026-10-01' }),
]
const WOLFF = 'Wolff · PERFIL · Wolff PVC'
const ROLLER = 'Roller · PERSIANAS · Roller Persiana 2026'
const ETAPAS: EtapaDaFamilia[] = [
    { id: E1, numero: 1, rotulo: 'Apanhar o pedido', acao: 'APANHAR', instrucao: 'pergunte a tipologia', abas: ['tipologias', 'variaveis'], motor_id: null },
    { id: E2, numero: 2, rotulo: 'Confirmar', acao: 'CONFIRMAR', instrucao: '', abas: [], motor_id: null },
]

let respostas: Record<string, { status: number; body: unknown }> = {}
type Corpo = { materia_prima?: string; etapas: Array<Record<string, unknown>> }
const pedidos: Array<{ chave: string; corpo: Corpo }> = []
beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${rotaDasEtapas(T, MP)}`]: { status: 200, body: { familia: 'PVC', etapas: ETAPAS, motores: MOTORES } },
        [`GET ${rotaDasEtapas(T, MP2)}`]: { status: 200, body: { familia: 'PVC', etapas: [], motores: [] } },
        [`PUT ${rotaDasEtapas(T)}`]: { status: 200, body: { depois: { orcamentista_familia_etapa: [] } } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: (init?.body ? JSON.parse(init.body) : undefined) as Corpo })
        const r = respostas[chave] ?? { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Etapas = () => require('@/page-parts/atendimentos-ia/etapas-da-familia.component').EtapasDaFamilia as React.ComponentType<{ tenantId: string; materiaPrimaId: string; principais?: string[] }>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Textos = () => require('@/page-parts/atendimentos-ia/etapas-da-familia.component') as {
    AVISO_DAS_ETAPAS: string; SEM_ETAPAS: string; SEM_TIPO_SEM_ETAPAS: string; SEM_MOTORES_DO_TIPO: (t: string) => string; CADASTRAR_MOTOR_NO_CATALOGO: string; linkDoCatalogoDeMotores: (n: string | null) => string
}

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(props: { materiaPrimaId?: string; principais?: string[] } = {}): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(Etapas(), { tenantId: T, materiaPrimaId: props.materiaPrimaId ?? MP, principais: props.principais })) })
    await assentar()
    return host
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => (b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '')) || b.getAttribute('aria-label') === texto) as HTMLButtonElement | undefined
async function clicar(el: Element | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => { (el as HTMLElement).click() })
    await assentar()
}
/** Digita num campo controlado do React: o setter nativo + o evento, como o navegador faz. */
async function digitar(el: Element | null, valor: string) {
    expect(el).toBeTruthy()
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor)
        el!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await assentar()
}
const campo = (host: ParentNode, rotulo: string) => host.querySelector(`[aria-label="${rotulo}"]`)
const salvar = (host: ParentNode) => host.querySelector('[data-salvar-etapas]') as HTMLButtonElement
const puts = () => pedidos.filter((p) => p.chave.startsWith('PUT '))

/** Abre o combo da ação e devolve as opções do ar; quem chama escolhe uma. */
async function abrirAcao(host: ParentNode, n: number) {
    const combo = campo(host, `Ação da etapa ${n}`)!.closest('.ant-select')!.querySelector('.ant-select-selector')!
    await act(async () => { combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await assentar()
    return Array.from(document.body.querySelectorAll('.ant-select-item-option')) as HTMLElement[]
}

describe('(1) a tela lê pela rota e mostra cada etapa', () => {
    it('lê a rota DESTA família-instância (empresa e matéria-prima), e só ela', async () => {
        await montar()
        expect(pedidos.map((p) => p.chave)).toEqual([`GET ${rotaDasEtapas(T, MP)}`])
    })

    it('cada etapa: o número (a posição), o rótulo, a ação pelo rótulo dela, a instrução e as abas marcadas', async () => {
        const host = await montar()
        const numeros = Array.from(host.querySelectorAll('[data-numero-da-etapa]')).map((n) => n.textContent)
        expect(numeros).toEqual(['Etapa 1', 'Etapa 2'])
        expect((campo(host, 'Rótulo da etapa 1') as HTMLInputElement).value).toBe('Apanhar o pedido')
        expect((campo(host, 'Instrução da etapa 1') as HTMLTextAreaElement).value).toBe('pergunte a tipologia')
        expect(host.querySelector(`[data-etapa="${E1}"] .ant-select-selection-item`)?.textContent).toBe(ROTULO_DA_ACAO.APANHAR)
        const marcadas = Array.from(host.querySelectorAll(`[data-etapa="${E1}"] [data-abas-da-etapa] input:checked`)).map((i) => (i as HTMLInputElement).value)
        expect(marcadas.sort()).toEqual(['tipologias', 'variaveis'])
        // as doze abas, com o rótulo do bloco Motor
        const rotulosDasAbas = Array.from(host.querySelectorAll(`[data-etapa="${E1}"] [data-abas-da-etapa] .ant-checkbox-wrapper`)).map((l) => l.textContent)
        expect(rotulosDasAbas).toHaveLength(12)
        expect(rotulosDasAbas).toContain(ROTULO_DA_ABA.regras)
    })

    it('a contagem da instrução aparece', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-etapa="${E1}"] [data-contagem-da-instrucao]`)?.textContent).toBe('20 de 4.000 caracteres')
    })

    it('outra família PVC da MESMA empresa lê a rota dela, com as etapas dela', async () => {
        const host = await montar({ materiaPrimaId: MP2 })
        expect(pedidos.map((p) => p.chave)).toEqual([`GET ${rotaDasEtapas(T, MP2)}`])
        expect(host.querySelector('[data-sem-etapas]')?.textContent).toBe(Textos().SEM_ETAPAS)
    })

    it('família SEM tipo: a tela diz para escolher o tipo, e o salvar fica desligado', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: null, etapas: [], motores: [] } }
        const host = await montar()
        expect(host.querySelector('[data-sem-tipo]')?.textContent).toContain(Textos().SEM_TIPO_SEM_ETAPAS)
        await clicar(botao(host, 'Nova etapa'))
        expect(salvar(host).disabled).toBe(true)
    })

    it('família sem etapa: diz que ainda não foi cadastrada, e dá para acrescentar', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [] } }
        const host = await montar()
        expect(host.querySelector('[data-sem-etapas]')).toBeTruthy()
        expect(botao(host, 'Nova etapa')).toBeTruthy()
    })

    it('500 na leitura: ERRO com a frase da rota — nunca "nenhuma etapa" nem as etapas antigas', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 500, body: { error: 'Não foi possível ler as etapas.' } }
        const host = await montar()
        expect(host.querySelector('[data-erro-das-etapas]')?.textContent).toContain('Não foi possível ler as etapas.')
        expect(host.querySelector('[data-sem-etapas]')).toBeNull()
        expect(host.querySelector('[data-etapa]')).toBeNull()
    })
})

describe('(2) a ação é um combo da lista, e a etapa nova nasce sem ela', () => {
    it('as opções do combo são exatamente as cinco ações do sistema, com o rótulo de cada uma', async () => {
        const host = await montar()
        const opcoes = await abrirAcao(host, 1)
        expect(opcoes.map((o) => o.textContent)).toEqual(ACOES_DA_ETAPA.map((a) => ROTULO_DA_ACAO[a]))
    })

    it('NÃO HÁ onde digitar a ação: os campos de texto da etapa são o rótulo (e a instrução), e o combo não aceita texto livre', async () => {
        const host = await montar()
        const entradas = Array.from(host.querySelectorAll(`[data-etapa="${E1}"] input[type="text"], [data-etapa="${E1}"] textarea`)).map((e) => e.getAttribute('aria-label'))
        expect(entradas).toEqual(expect.arrayContaining(['Rótulo da etapa 1', 'Instrução da etapa 1']))
        expect(entradas.some((a) => (a ?? '').startsWith('Ação'))).toBe(false)
        // o combo da ação não é de busca: o input dele é só leitura
        const entrada = campo(host, 'Ação da etapa 1')!.closest('.ant-select')!.querySelector('input') as HTMLInputElement
        expect(entrada.readOnly).toBe(true)
    })

    it('escolher outra ação habilita o salvar e vai no corpo', async () => {
        const host = await montar()
        const opcoes = await abrirAcao(host, 1)
        await clicar(opcoes.find((o) => o.textContent === ROTULO_DA_ACAO.ENVIAR))
        expect(salvar(host).disabled).toBe(false)
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas[0]).toEqual(expect.objectContaining({ id: E1, acao: 'ENVIAR' }))
    })

    it('a etapa nova nasce SEM ação: o combo mostra o convite, não uma ação', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        expect(host.querySelector('[data-etapa^="nova-"] .ant-select-selection-item')).toBeNull()
        expect(host.querySelector('[data-etapa^="nova-"] .ant-select-selection-placeholder')?.textContent).toBe('Escolha a ação')
    })
})

describe('(3) salvar manda a lista inteira, na ordem da tela', () => {
    it('sem mudança o salvar está desligado', async () => {
        const host = await montar()
        expect(salvar(host).disabled).toBe(true)
    })

    it('editar o rótulo manda PUT com as DUAS etapas, o id de cada uma e as abas', async () => {
        const host = await montar()
        await digitar(campo(host, 'Rótulo da etapa 1'), 'Apanhar o que o vendedor pede')
        expect(salvar(host).disabled).toBe(false)
        await clicar(salvar(host))
        expect(puts()).toHaveLength(1)
        expect(puts()[0].chave).toBe(`PUT ${rotaDasEtapas(T)}`)
        expect(puts()[0].corpo).toEqual({
            materia_prima: MP,
            etapas: [
                { id: E1, rotulo: 'Apanhar o que o vendedor pede', acao: 'APANHAR', instrucao: 'pergunte a tipologia', abas: ['tipologias', 'variaveis'] },
                { id: E2, rotulo: 'Confirmar', acao: 'CONFIRMAR', instrucao: '', abas: [] },
            ],
        })
    })

    it('marcar uma aba entra no corpo na ordem da PLANILHA, não na ordem do clique', async () => {
        const host = await montar()
        await clicar(host.querySelector(`[data-etapa="${E1}"] [data-abas-da-etapa] input[value="perfis"]`))
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas[0].abas).toEqual(['tipologias', 'perfis', 'variaveis'])
    })

    it('depois de salvar, a tela relê a rota (o que vale é o que o banco gravou) e desliga o salvar', async () => {
        const host = await montar()
        await digitar(campo(host, 'Rótulo da etapa 2'), 'Confirmar com o vendedor')
        const antes = pedidos.filter((p) => p.chave === `GET ${rotaDasEtapas(T, MP)}`).length
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [ETAPAS[0], { ...ETAPAS[1], rotulo: 'Confirmar com o vendedor' }] } }
        await clicar(salvar(host))
        expect(pedidos.filter((p) => p.chave === `GET ${rotaDasEtapas(T, MP)}`).length).toBe(antes + 1)
        expect((campo(host, 'Rótulo da etapa 2') as HTMLInputElement).value).toBe('Confirmar com o vendedor')
        expect(salvar(host).disabled).toBe(true)
    })

    it('espaço nas pontas do rótulo não é mudança: o salvar segue desligado', async () => {
        const host = await montar()
        await digitar(campo(host, 'Rótulo da etapa 1'), '  Apanhar o pedido  ')
        expect(salvar(host).disabled).toBe(true)
    })

    it('o rótulo não passa de 60 caracteres no campo', async () => {
        const host = await montar()
        expect(campo(host, 'Rótulo da etapa 1')?.getAttribute('maxlength')).toBe('60')
    })
})

describe('(4) reordenar: subir e descer, e o número é a posição', () => {
    it('descer a 1 troca as duas, e o corpo leva a lista na nova ordem', async () => {
        const host = await montar()
        await clicar(botao(host, 'Descer a etapa 1'))
        expect((campo(host, 'Rótulo da etapa 1') as HTMLInputElement).value).toBe('Confirmar')
        expect((campo(host, 'Rótulo da etapa 2') as HTMLInputElement).value).toBe('Apanhar o pedido')
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas.map((e: Record<string, unknown>) => e.id)).toEqual([E2, E1])
        // o número NÃO vai no corpo: é a posição
        expect(puts()[0].corpo.etapas.every((e: Record<string, unknown>) => !('numero' in e))).toBe(true)
    })

    it('a primeira não sobe e a última não desce', async () => {
        const host = await montar()
        expect(botao(host, 'Subir a etapa 1')!.disabled).toBe(true)
        expect(botao(host, 'Descer a etapa 2')!.disabled).toBe(true)
        expect(botao(host, 'Descer a etapa 1')!.disabled).toBe(false)
    })

    it('reordenar e voltar ao que era desliga o salvar', async () => {
        const host = await montar()
        await clicar(botao(host, 'Descer a etapa 1'))
        expect(salvar(host).disabled).toBe(false)
        await clicar(botao(host, 'Subir a etapa 2'))
        expect(salvar(host).disabled).toBe(true)
    })
})

describe('(5) o que não passa não sai da tela, e a frase nomeia a etapa', () => {
    it('etapa nova SEM ação: nenhum PUT, a frase diz a etapa 3 e as cinco ações', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        await digitar(campo(host, 'Rótulo da etapa 3'), 'Levantar')
        await clicar(salvar(host))
        expect(puts()).toEqual([])
        const erro = host.querySelector('[data-erro-ao-salvar-etapas]')?.textContent ?? ''
        expect(erro).toContain('Etapa 3: a ação em branco')
        for (const a of ACOES_DA_ETAPA) expect(erro).toContain(a)
    })

    it('rótulo em branco: nenhum PUT, a frase diz qual etapa', async () => {
        const host = await montar()
        await digitar(campo(host, 'Rótulo da etapa 2'), '   ')
        await clicar(salvar(host))
        expect(puts()).toEqual([])
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')?.textContent).toContain('Etapa 2: o rótulo está em branco.')
    })

    it('instrução acima de 4.000: a contagem fica em vermelho, nenhum PUT, a frase diz quantos', async () => {
        const host = await montar()
        await digitar(campo(host, 'Instrução da etapa 1'), 'a'.repeat(4001))
        expect(host.querySelector(`[data-etapa="${E1}"] [data-contagem-da-instrucao]`)?.className).toContain('ant-typography-danger')
        await clicar(salvar(host))
        expect(puts()).toEqual([])
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')?.textContent).toContain('Etapa 1: a instrução tem 4.001 caracteres; o limite é 4.000')
    })

    it('com a ação escolhida e o rótulo, a nova etapa vai SEM id, no fim da lista', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        await digitar(campo(host, 'Rótulo da etapa 3'), 'Levantar')
        const opcoes = await abrirAcao(host, 3)
        await clicar(opcoes.find((o) => o.textContent === ROTULO_DA_ACAO.GERAR_LEVANTAMENTO))
        await clicar(salvar(host))
        const corpo = puts()[0].corpo.etapas
        expect(corpo).toHaveLength(3)
        expect(corpo[2]).toEqual({ rotulo: 'Levantar', acao: 'GERAR_LEVANTAMENTO', instrucao: '', abas: [] })
        expect('id' in corpo[2]).toBe(false)
    })
})

describe('(6) a recusa da rota aparece no cartão e o rascunho fica', () => {
    it('400 da rota: a frase inteira no cartão, e o que foi digitado continua na tela, pendente', async () => {
        const frase = 'etapa 1: o motor esta arquivado'
        respostas[`PUT ${rotaDasEtapas(T)}`] = { status: 400, body: { error: frase } }
        const host = await montar()
        await digitar(campo(host, 'Rótulo da etapa 2'), 'Confirmar de outro jeito')
        await clicar(salvar(host))
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')?.textContent).toContain(frase)
        expect((campo(host, 'Rótulo da etapa 2') as HTMLInputElement).value).toBe('Confirmar de outro jeito')
        expect(salvar(host).disabled).toBe(false)
    })

    it('depois de um erro, uma tentativa que passa limpa a frase', async () => {
        respostas[`PUT ${rotaDasEtapas(T)}`] = { status: 400, body: { error: 'falhou' } }
        const host = await montar()
        await digitar(campo(host, 'Rótulo da etapa 2'), 'Outro')
        await clicar(salvar(host))
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')).toBeTruthy()
        respostas[`PUT ${rotaDasEtapas(T)}`] = { status: 200, body: { depois: {} } }
        await clicar(salvar(host))
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')).toBeNull()
    })
})

describe('(7) EXCLUIR etapa gravada (30/10/2026): confirma dizendo o que se perde, e ao salvar ela não vai na lista', () => {
    /** Clica em Excluir da etapa N e devolve o balão de confirmação aberto. */
    async function abrirExclusao(host: HTMLElement, n: number) {
        await clicar(botao(host, `Excluir a etapa ${n}`))
        return document.body.querySelector('.ant-popover:not(.ant-popover-hidden)') as HTMLElement
    }
    const confirmar = async (balao: HTMLElement) => clicar(Array.from(balao.querySelectorAll('.ant-popconfirm-buttons button')).find((b) => b.textContent?.replace(/\s/g, '') === 'Excluir'))
    const COM_MOTOR: EtapaDaFamilia[] = [
        { ...ETAPAS[0], motor_id: M1, instrucao: 'pergunte a tipologia' },
        { ...ETAPAS[1], instrucao: 'x'.repeat(100) },
    ]

    it('só as GRAVADAS têm Excluir; a nova segue só com Descartar', async () => {
        const host = await montar()
        expect(host.querySelectorAll('[data-excluir-etapa]')).toHaveLength(2)
        await clicar(botao(host, 'Nova etapa'))
        expect(host.querySelectorAll('[data-excluir-etapa]')).toHaveLength(2)
        expect(botao(host, 'Descartar')).toBeTruthy()
    })

    it('a confirmação nomeia o que se perde, do GRAVADO: o rótulo, a instrução e o motor — e clicar em Excluir sozinho não tira nada', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: COM_MOTOR, motores: MOTORES } }
        const host = await montar()
        // o rascunho mudou o rótulo: a confirmação diz o que está GRAVADO, que é o que sai do banco
        await digitar(campo(host, 'Rótulo da etapa 1'), 'Digitado e não salvo')
        const b1 = await abrirExclusao(host, 1)
        expect(b1.textContent).toContain('Excluir a etapa 1 ("Apanhar o pedido")?')
        expect(Array.from(b1.querySelectorAll('[data-o-que-se-perde] li')).map((l) => l.textContent)).toEqual([
            'o rótulo "Apanhar o pedido"', 'a instrução "pergunte a tipologia"', `o motor ${WOLFF}`,
        ])
        expect(host.querySelectorAll('[data-etapa]')).toHaveLength(2)
    })

    it('a instrução longa vai pelo começo e pelo tamanho; a etapa sem motor diz "sem motor"', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: COM_MOTOR, motores: MOTORES } }
        const host = await montar()
        const b2 = await abrirExclusao(host, 2)
        expect(Array.from(b2.querySelectorAll('[data-o-que-se-perde] li')).map((l) => l.textContent)).toEqual([
            'o rótulo "Confirmar"', `a instrução de 100 caracteres ("${'x'.repeat(80)}…")`, 'sem motor',
        ])
    })

    it('confirmada: a etapa sai do rascunho, as de baixo sobem um número, e o salvar manda a lista SEM ela — o resto como estava', async () => {
        const host = await montar()
        await confirmar(await abrirExclusao(host, 1))
        expect(host.querySelectorAll('[data-etapa]')).toHaveLength(1)
        expect(Array.from(host.querySelectorAll('[data-numero-da-etapa]')).map((n) => n.textContent)).toEqual(['Etapa 1'])
        expect(salvar(host).disabled).toBe(false)
        await clicar(salvar(host))
        const put = puts()
        expect(put).toHaveLength(1)
        expect(put[0].corpo.etapas).toEqual([{ id: E2, rotulo: 'Confirmar', acao: 'CONFIRMAR', instrucao: '', abas: [] }])
        expect(pedidos.filter((p) => p.chave.startsWith('DELETE '))).toEqual([])
    })

    it('cancelada: nada muda, e o salvar segue desligado', async () => {
        const host = await montar()
        const b = await abrirExclusao(host, 1)
        await clicar(Array.from(b.querySelectorAll('.ant-popconfirm-buttons button')).find((x) => x.textContent?.replace(/\s/g, '') === 'Cancelar'))
        expect(host.querySelectorAll('[data-etapa]')).toHaveLength(2)
        expect(salvar(host).disabled).toBe(true)
    })

    it('descartar a nova volta ao gravado: o salvar desliga e nenhum pedido de apagar sai', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        expect(salvar(host).disabled).toBe(false)
        await clicar(botao(host, 'Descartar'))
        expect(salvar(host).disabled).toBe(true)
        expect(host.querySelectorAll('[data-etapa]')).toHaveLength(2)
        expect(pedidos.filter((p) => p.chave.startsWith('DELETE '))).toEqual([])
    })
})

describe('(8) a tela diz o que as etapas ainda não fazem', () => {
    it('o aviso: rótulo livre, ação da lista, e que o salvo ainda não muda a conversa', async () => {
        const host = await montar()
        const aviso = Textos().AVISO_DAS_ETAPAS
        expect(host.textContent).toContain(aviso)
        expect(aviso).toContain('O rótulo é livre; a ação não é.')
        expect(aviso).toContain('ainda não muda a conversa')
        expect(aviso).toContain('Excluir uma etapa gravada pede confirmação, e ela sai ao salvar.')
        expect(aviso).not.toContain('não se remove')
        expect(aviso).toContain('As etapas são desta família, nesta empresa.')
    })
})

describe('(9) cada etapa seleciona o seu motor DO CATÁLOGO, e a tela deixa inserir etapa abaixo', () => {
    async function abrirMotor(host: ParentNode, n: number) {
        const combo = campo(host, `Motor da etapa ${n}`)!.closest('.ant-select')!.querySelector('.ant-select-selector')!
        await act(async () => { combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        return Array.from(document.body.querySelectorAll('.ant-select-item-option')) as HTMLElement[]
    }

    it('NÃO há campo de arquivo na etapa: nenhum input de arquivo, nenhum botão de subir; há o link para o catálogo', async () => {
        const host = await montar()
        expect(host.querySelector('input[type="file"]')).toBeNull()
        expect(Array.from(host.querySelectorAll('button')).filter((b) => /subir o arquivo|trocar o arquivo/i.test(`${b.textContent}${b.getAttribute('aria-label') ?? ''}`))).toEqual([])
        expect(host.querySelector('[data-arquivo-do-motor]')).toBeNull()
        const link = host.querySelector('[data-cadastrar-motor-no-catalogo]') as HTMLAnchorElement
        expect(link.textContent).toBe(Textos().CADASTRAR_MOTOR_NO_CATALOGO)
        // montada sem o nicho da conta: o link cai no Catálogo (com o nicho, nos motores dele — `atendimentos-ia-catalogo-por-nicho.test.tsx`)
        expect(link.getAttribute('href')).toBe('/super-admin/atendimentos-ia/fornecedores#motores')
        expect(Textos().linkDoCatalogoDeMotores(null)).toBe('/super-admin/atendimentos-ia/fornecedores#motores')
    })

    it('o combo oferece SÓ os motores do mesmo tipo e não arquivados, por fornecedor; a etapa sem motor mostra o convite', async () => {
        const host = await montar()
        expect(campo(host, 'Motor da etapa 1')!.closest('.ant-select')!.querySelector('.ant-select-selection-placeholder')?.textContent).toBe('Sem motor')
        const opcoes = await abrirMotor(host, 1)
        expect(opcoes.map((o) => o.textContent)).toEqual([ROLLER, WOLFF])
        expect(host.querySelector('[data-sem-motores-do-tipo]')).toBeNull()
    })

    it('os motores dos fornecedores PRINCIPAIS desta família vêm primeiro', async () => {
        const host = await montar({ principais: ['f-wolff'] })
        expect((await abrirMotor(host, 1)).map((o) => o.textContent)).toEqual([WOLFF, ROLLER])
    })

    it('catálogo sem motor do tipo: a tela diz isso', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: ETAPAS, motores: [] } }
        const host = await montar()
        expect(host.querySelector('[data-sem-motores-do-tipo]')?.textContent).toBe(Textos().SEM_MOTORES_DO_TIPO('PVC'))
    })

    it('escolher o motor da etapa 1 habilita o salvar e vai no corpo SÓ nessa etapa', async () => {
        const host = await montar()
        const opcoes = await abrirMotor(host, 1)
        await clicar(opcoes.find((o) => o.textContent === WOLFF))
        expect(salvar(host).disabled).toBe(false)
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas[0]).toEqual(expect.objectContaining({ id: E1, motor_id: M1 }))
        expect('motor_id' in puts()[0].corpo.etapas[1]).toBe(false)
    })

    it('salvar só o rótulo NÃO manda motor_id, mesmo com a etapa já apontando um motor', async () => {
        const comMotor: EtapaDaFamilia[] = [{ ...ETAPAS[0], motor_id: M1 }, ETAPAS[1]]
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: comMotor, motores: MOTORES } }
        const host = await montar()
        expect(campo(host, 'Motor da etapa 1')!.closest('.ant-select')!.querySelector('.ant-select-selection-item')?.textContent).toBe(WOLFF)
        await digitar(campo(host, 'Rótulo da etapa 1'), 'Apanhar de novo')
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas.map((e) => 'motor_id' in e)).toEqual([false, false])
    })

    it('limpar o motor gravado manda motor_id: null', async () => {
        const comMotor: EtapaDaFamilia[] = [{ ...ETAPAS[0], motor_id: M1 }, ETAPAS[1]]
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: comMotor, motores: MOTORES } }
        const host = await montar()
        const limpar = campo(host, 'Motor da etapa 1')!.closest('.ant-select')!.querySelector('.ant-select-clear') as HTMLElement
        await act(async () => { limpar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        expect(salvar(host).disabled).toBe(false)
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas[0]).toEqual(expect.objectContaining({ id: E1, motor_id: null }))
    })

    it('o motor gravado que a lista não traz aparece como "fora da lista", e não some', async () => {
        const fora = '99999999-0000-4000-8000-000000000001'
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [{ ...ETAPAS[0], motor_id: fora }, ETAPAS[1]], motores: MOTORES } }
        const host = await montar()
        expect(campo(host, 'Motor da etapa 1')!.closest('.ant-select')!.querySelector('.ant-select-selection-item')?.textContent).toBe('(motor 99999999…, fora da lista)')
    })

    it('"Inserir etapa abaixo" da etapa 1: a nova vira a 2, a antiga 2 vira 3, e o corpo sai nessa ordem, a nova SEM id', async () => {
        const host = await montar()
        await clicar(botao(host, 'Inserir uma etapa abaixo da etapa 1'))
        expect(host.querySelectorAll('[data-etapa]')).toHaveLength(3)
        expect((campo(host, 'Rótulo da etapa 2') as HTMLInputElement).value).toBe('')
        expect((campo(host, 'Rótulo da etapa 3') as HTMLInputElement).value).toBe('Confirmar')
        await digitar(campo(host, 'Rótulo da etapa 2'), 'Levantar')
        const opcoes = await abrirAcao(host, 2)
        await clicar(opcoes.find((o) => o.textContent === ROTULO_DA_ACAO.GERAR_LEVANTAMENTO))
        await clicar(salvar(host))
        const corpo = puts()[0].corpo.etapas
        expect(corpo.map((e) => e.rotulo)).toEqual(['Apanhar o pedido', 'Levantar', 'Confirmar'])
        expect(corpo.map((e) => 'id' in e)).toEqual([true, false, true])
    })
})

describe('(10) a família só calcula com TODAS as etapas com motor: a tela mostra se está pronta (29/10/2026)', () => {
    it('pronta: o aviso de pronta, e nenhuma etapa listada', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: ETAPAS.map((e) => ({ ...e, motor_id: M1 })), motores: MOTORES, pronta: true, etapas_sem_motor: [] } }
        const host = await montar()
        expect(host.querySelector('[data-familia-pronta]')?.textContent).toBe('A família está pronta: todas as etapas salvas têm motor.')
        expect(host.querySelector('[data-familia-nao-pronta]')).toBeNull()
    })

    it('não pronta: cada etapa sem motor, nomeada com a frase da recusa, na ordem que a rota mandou', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: {
            familia: 'PVC', etapas: ETAPAS, motores: MOTORES, pronta: false,
            etapas_sem_motor: [{ id: E1, numero: 1, rotulo: 'Apanhar o pedido' }, { id: E2, numero: 2, rotulo: 'Confirmar' }],
        } }
        const host = await montar()
        const aviso = host.querySelector('[data-familia-nao-pronta]')!
        expect(aviso.textContent).toContain('A família não calcula enquanto houver etapa sem motor (do que está salvo):')
        expect(Array.from(aviso.querySelectorAll('[data-etapa-sem-motor]')).map((l) => l.textContent)).toEqual([
            'A etapa 1 ("Apanhar o pedido") está sem motor: escolha um motor para ela.', 'A etapa 2 ("Confirmar") está sem motor: escolha um motor para ela.',
        ])
        expect(host.querySelector('[data-familia-pronta]')).toBeNull()
        // não é trava: salvar continua possível com etapa sem motor
        await digitar(campo(host, 'Rótulo da etapa 2'), 'Confirmar o pedido')
        expect(salvar(host).disabled).toBe(false)
    })

    it('a resposta SEM o indicador: a tela não afirma pronta nem não pronta', async () => {
        const host = await montar()
        expect(host.querySelector('[data-familia-pronta]')).toBeNull()
        expect(host.querySelector('[data-familia-nao-pronta]')).toBeNull()
    })
})
