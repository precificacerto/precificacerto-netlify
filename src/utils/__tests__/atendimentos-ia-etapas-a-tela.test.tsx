/**
 * PORTÃO — as ETAPAS da família-instância na tela (`etapas-da-familia.component.tsx`, na base de conhecimento da conta).
 *
 * POR QUÊ (dono do produto, 27/10/2026): o consultor cadastra, por família, as etapas. Desde 28/10/2026 (migração 20261028000001) a etapa é da
 * FAMÍLIA-INSTÂNCIA (a matéria-prima de UMA empresa), e o motor dela sai do CATÁLOGO, sem campo de arquivo. Desde 31/10/2026 (migração
 * 20261031000002) a própria etapa é ESCOLHIDA de uma lista — o catálogo de etapas —: "Na base de conhecimento, a etapa passa a ser ESCOLHIDA de uma
 * lista; somem o campo de ação e o de rótulo." O nome, a ação e as abas vêm do item; a instrução e o motor são da conta.
 *
 * O que este portão fica vermelho:
 *   (1) a tela LÊ pela rota e mostra cada etapa: número (a posição), o item do catálogo, a ação e as abas DELE (de leitura) e a instrução; falha de
 *       leitura é ERRO, nunca "nenhuma etapa"; família sem etapa diz que ainda não foi cadastrada;
 *   (2) a ETAPA é um combo com os itens do catálogo — não há campo de rótulo nem de ação, nem caixas de abas —, e a etapa nova nasce sem item;
 *   (3) salvar manda a lista INTEIRA na ordem da tela, com o id das gravadas e sem id nas novas, e só o que é da conta; só habilita com mudança;
 *   (4) reordenar é subir e descer, e o número que vai é a posição;
 *   (5) etapa sem item do catálogo ou instrução acima do limite NÃO sai da tela: a frase nomeia a etapa;
 *   (6) a recusa da rota aparece NO cartão, e o rascunho continua na tela;
 *   (7) EXCLUIR etapa gravada pede confirmação nomeando o item, a instrução e o motor GRAVADOS, e ao salvar ela não vai na lista (a função a
 *       remove e renumera as que ficam, 20261031000001); a nova, ainda não salva, só se descarta do rascunho;
 *   (8) a tela diz, sem rodeio, que as etapas ainda não mudam a conversa;
 *   (9) o motor da etapa sai do catálogo: só do mesmo tipo e não arquivado, os dos principais primeiro; NÃO há campo de arquivo, e o
 *       link "cadastrar motor no catálogo" leva ao catálogo.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROTULO_DA_ABA, ROTULO_DA_ACAO, rotaDasEtapas, type EtapaDaFamilia, type EtapaDoCatalogo } from '@/utils/atendimentos-ia-etapas'
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
// o catálogo de etapas (20261031000002), na ordem
const C1 = '00000000-0000-4000-8000-0000000000c1'
const C2 = '00000000-0000-4000-8000-0000000000c2'
const C3 = '00000000-0000-4000-8000-0000000000c3'
const item = (id: string, nome: string, acao: EtapaDoCatalogo['acao'], abas: EtapaDoCatalogo['abas'], ordem: number): EtapaDoCatalogo => ({ id, nome, acao, abas, ordem, criado_em: '2026-10-31', usos: [] })
const CATALOGO = [item(C1, 'Apanhar o pedido', 'APANHAR', ['tipologias', 'variaveis'], 1), item(C2, 'Confirmar', 'CONFIRMAR', [], 2), item(C3, 'Gerar o levantamento', 'GERAR_LEVANTAMENTO', ['perfis'], 3)]
const ETAPAS: EtapaDaFamilia[] = [
    { id: E1, numero: 1, etapa_catalogo_id: C1, rotulo: 'Apanhar o pedido', acao: 'APANHAR', abas: ['tipologias', 'variaveis'], instrucao: 'pergunte a tipologia', motor_id: null },
    { id: E2, numero: 2, etapa_catalogo_id: C2, rotulo: 'Confirmar', acao: 'CONFIRMAR', abas: [], instrucao: '', motor_id: null },
]

let respostas: Record<string, { status: number; body: unknown }> = {}
type Corpo = { materia_prima?: string; etapas: Array<Record<string, unknown>> }
const pedidos: Array<{ chave: string; corpo: Corpo }> = []
beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${rotaDasEtapas(T, MP)}`]: { status: 200, body: { familia: 'PVC', etapas: ETAPAS, motores: MOTORES, catalogo: CATALOGO } },
        [`GET ${rotaDasEtapas(T, MP2)}`]: { status: 200, body: { familia: 'PVC', etapas: [], motores: [], catalogo: CATALOGO } },
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
    CADASTRAR_ETAPA_NO_CATALOGO: string; SEM_ETAPAS_NO_CATALOGO: string; linkDoCatalogoDeEtapas: (n: string | null) => string
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

/** O que o combo do item mostra (o nome da etapa do catálogo); null quando nada escolhido. */
const itemEscolhido = (host: ParentNode, n: number) => campo(host, `Etapa ${n} do catálogo`)!.closest('.ant-select')!.querySelector('.ant-select-selection-item')?.textContent ?? null
/** Abre o combo do item do catálogo da etapa N e devolve as opções do ar; quem chama escolhe uma. */
async function abrirItem(host: ParentNode, n: number) {
    const combo = campo(host, `Etapa ${n} do catálogo`)!.closest('.ant-select')!.querySelector('.ant-select-selector')!
    await act(async () => { combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await assentar()
    return Array.from(document.body.querySelectorAll('.ant-select-item-option')) as HTMLElement[]
}

describe('(1) a tela lê pela rota e mostra cada etapa', () => {
    it('lê a rota DESTA família-instância (empresa e matéria-prima), e só ela', async () => {
        await montar()
        expect(pedidos.map((p) => p.chave)).toEqual([`GET ${rotaDasEtapas(T, MP)}`])
    })

    it('cada etapa: o número (a posição), o item do catálogo pelo nome, a ação e as abas DELE, e a instrução', async () => {
        const host = await montar()
        const numeros = Array.from(host.querySelectorAll('[data-numero-da-etapa]')).map((n) => n.textContent)
        expect(numeros).toEqual(['Etapa 1', 'Etapa 2'])
        expect(itemEscolhido(host, 1)).toBe('Apanhar o pedido')
        expect(itemEscolhido(host, 2)).toBe('Confirmar')
        expect((campo(host, 'Instrução da etapa 1') as HTMLTextAreaElement).value).toBe('pergunte a tipologia')
        expect(host.querySelector(`[data-etapa="${E1}"] [data-acao-da-etapa]`)?.textContent).toBe(ROTULO_DA_ACAO.APANHAR)
        expect(host.querySelector(`[data-etapa="${E1}"] [data-abas-da-etapa]`)?.textContent).toBe(`${ROTULO_DA_ABA.tipologias}, ${ROTULO_DA_ABA.variaveis}`)
        expect(host.querySelector(`[data-etapa="${E2}"] [data-abas-da-etapa]`)?.textContent).toBe('nenhuma')
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
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: null, etapas: [], motores: [], catalogo: CATALOGO } }
        const host = await montar()
        expect(host.querySelector('[data-sem-tipo]')?.textContent).toContain(Textos().SEM_TIPO_SEM_ETAPAS)
        await clicar(botao(host, 'Nova etapa'))
        expect(salvar(host).disabled).toBe(true)
    })

    it('família sem etapa: diz que ainda não foi cadastrada, e dá para acrescentar', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [], catalogo: CATALOGO } }
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

describe('(2) a etapa é ESCOLHIDA do catálogo; somem o rótulo, a ação e as abas editáveis', () => {
    it('as opções do combo são os itens do catálogo, na ordem dele, pelo nome', async () => {
        const host = await montar()
        const opcoes = await abrirItem(host, 1)
        expect(opcoes.map((o) => o.textContent)).toEqual(['Apanhar o pedido', 'Confirmar', 'Gerar o levantamento'])
    })

    it('NÃO HÁ campo de rótulo nem de ação, nem caixa de aba: o único texto da etapa é a instrução', async () => {
        const host = await montar()
        const entradas = Array.from(host.querySelectorAll(`[data-etapa="${E1}"] input[type="text"], [data-etapa="${E1}"] textarea`)).map((e) => e.getAttribute('aria-label'))
        expect(entradas).toContain('Instrução da etapa 1')
        expect(entradas.some((a) => /^(Rótulo|Ação)/.test(a ?? ''))).toBe(false)
        expect(campo(host, 'Rótulo da etapa 1')).toBeNull()
        expect(campo(host, 'Ação da etapa 1')).toBeNull()
        expect(host.querySelector(`[data-etapa="${E1}"] input[type="checkbox"]`)).toBeNull()
        // o combo do item não é de busca: o input dele é só leitura
        const entrada = campo(host, 'Etapa 1 do catálogo')!.closest('.ant-select')!.querySelector('input') as HTMLInputElement
        expect(entrada.readOnly).toBe(true)
    })

    it('escolher outro item troca a ação e as abas mostradas, habilita o salvar e vai no corpo', async () => {
        const host = await montar()
        await clicar((await abrirItem(host, 1)).find((o) => o.textContent === 'Gerar o levantamento'))
        expect(host.querySelector(`[data-etapa="${E1}"] [data-acao-da-etapa]`)?.textContent).toBe(ROTULO_DA_ACAO.GERAR_LEVANTAMENTO)
        expect(host.querySelector(`[data-etapa="${E1}"] [data-abas-da-etapa]`)?.textContent).toBe(ROTULO_DA_ABA.perfis)
        expect(salvar(host).disabled).toBe(false)
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas[0]).toEqual({ id: E1, etapa_catalogo_id: C3, instrucao: 'pergunte a tipologia' })
    })

    it('a etapa nova nasce SEM item: o combo mostra o convite, e nada vem "do catálogo"', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        expect(host.querySelector('[data-etapa^="nova-"] .ant-select-selection-item')).toBeNull()
        expect(host.querySelector('[data-etapa^="nova-"] .ant-select-selection-placeholder')?.textContent).toBe('Escolha a etapa do catálogo')
        expect(host.querySelector('[data-etapa^="nova-"] [data-o-que-vem-do-catalogo]')).toBeNull()
    })

    it('catálogo de etapas vazio: a tela diz para cadastrar na aba Etapas; a resposta sem o catálogo não afirma "vazio"', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [], motores: MOTORES, catalogo: [] } }
        const host = await montar()
        expect(host.querySelector('[data-catalogo-de-etapas-vazio]')?.textContent).toBe(Textos().SEM_ETAPAS_NO_CATALOGO)
        respostas[`GET ${rotaDasEtapas(T, MP2)}`] = { status: 200, body: { familia: 'PVC', etapas: [], motores: [] } }
        const outra = await montar({ materiaPrimaId: MP2 })
        expect(outra.querySelector('[data-catalogo-de-etapas-vazio]')).toBeNull()
    })

    it('o item gravado que o catálogo não traz aparece como "fora da lista", e não some', async () => {
        const fora = '99999999-0000-4000-8000-0000000000c9'
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [{ ...ETAPAS[0], etapa_catalogo_id: fora }, ETAPAS[1]], motores: MOTORES, catalogo: CATALOGO } }
        const host = await montar()
        expect(itemEscolhido(host, 1)).toBe('(etapa do catálogo 99999999…, fora da lista)')
    })

    it('o link "cadastrar etapa no catálogo" leva às etapas do nicho; sem nicho, ao Catálogo', async () => {
        const host = await montar()
        const link = host.querySelector('[data-cadastrar-etapa-no-catalogo]') as HTMLAnchorElement
        expect(link.textContent).toBe(Textos().CADASTRAR_ETAPA_NO_CATALOGO)
        expect(link.getAttribute('href')).toBe('/super-admin/atendimentos-ia/fornecedores')
        expect(Textos().linkDoCatalogoDeEtapas('n-1')).toBe('/super-admin/atendimentos-ia/catalogo/n-1?aba=etapas')
    })
})

describe('(3) salvar manda a lista inteira, na ordem da tela', () => {
    it('sem mudança o salvar está desligado', async () => {
        const host = await montar()
        expect(salvar(host).disabled).toBe(true)
    })

    it('editar a instrução manda PUT com as DUAS etapas: o id, o item e a instrução de cada uma — nada de rótulo, ação ou abas', async () => {
        const host = await montar()
        await digitar(campo(host, 'Instrução da etapa 1'), 'pergunte a tipologia e a cor')
        expect(salvar(host).disabled).toBe(false)
        await clicar(salvar(host))
        expect(puts()).toHaveLength(1)
        expect(puts()[0].chave).toBe(`PUT ${rotaDasEtapas(T)}`)
        expect(puts()[0].corpo).toEqual({
            materia_prima: MP,
            etapas: [
                { id: E1, etapa_catalogo_id: C1, instrucao: 'pergunte a tipologia e a cor' },
                { id: E2, etapa_catalogo_id: C2, instrucao: '' },
            ],
        })
    })

    it('depois de salvar, a tela relê a rota (o que vale é o que o banco gravou) e desliga o salvar', async () => {
        const host = await montar()
        await digitar(campo(host, 'Instrução da etapa 2'), 'confirme com o vendedor')
        const antes = pedidos.filter((p) => p.chave === `GET ${rotaDasEtapas(T, MP)}`).length
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [ETAPAS[0], { ...ETAPAS[1], instrucao: 'confirme com o vendedor' }], catalogo: CATALOGO } }
        await clicar(salvar(host))
        expect(pedidos.filter((p) => p.chave === `GET ${rotaDasEtapas(T, MP)}`).length).toBe(antes + 1)
        expect((campo(host, 'Instrução da etapa 2') as HTMLTextAreaElement).value).toBe('confirme com o vendedor')
        expect(salvar(host).disabled).toBe(true)
    })

    it('espaço nas pontas da instrução não é mudança: o salvar segue desligado', async () => {
        const host = await montar()
        await digitar(campo(host, 'Instrução da etapa 1'), '  pergunte a tipologia  ')
        expect(salvar(host).disabled).toBe(true)
    })
})

describe('(4) reordenar: subir e descer, e o número é a posição', () => {
    it('descer a 1 troca as duas, e o corpo leva a lista na nova ordem', async () => {
        const host = await montar()
        await clicar(botao(host, 'Descer a etapa 1'))
        expect(itemEscolhido(host, 1)).toBe('Confirmar')
        expect(itemEscolhido(host, 2)).toBe('Apanhar o pedido')
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
    it('etapa nova SEM item do catálogo: nenhum PUT, a frase diz a etapa 3', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        await digitar(campo(host, 'Instrução da etapa 3'), 'levante as medidas')
        await clicar(salvar(host))
        expect(puts()).toEqual([])
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')?.textContent).toContain('Etapa 3: escolha a etapa do catálogo.')
    })

    it('instrução acima de 4.000: a contagem fica em vermelho, nenhum PUT, a frase diz quantos', async () => {
        const host = await montar()
        await digitar(campo(host, 'Instrução da etapa 1'), 'a'.repeat(4001))
        expect(host.querySelector(`[data-etapa="${E1}"] [data-contagem-da-instrucao]`)?.className).toContain('ant-typography-danger')
        await clicar(salvar(host))
        expect(puts()).toEqual([])
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')?.textContent).toContain('Etapa 1: a instrução tem 4.001 caracteres; o limite é 4.000')
    })

    it('com o item escolhido, a nova etapa vai SEM id, no fim da lista', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        await clicar((await abrirItem(host, 3)).find((o) => o.textContent === 'Gerar o levantamento'))
        await clicar(salvar(host))
        const corpo = puts()[0].corpo.etapas
        expect(corpo).toHaveLength(3)
        expect(corpo[2]).toEqual({ etapa_catalogo_id: C3, instrucao: '' })
    })
})

describe('(6) a recusa da rota aparece no cartão e o rascunho fica', () => {
    it('400 da rota: a frase inteira no cartão, e o que foi digitado continua na tela, pendente', async () => {
        const frase = 'etapa 1: a etapa do catalogo nao existe'
        respostas[`PUT ${rotaDasEtapas(T)}`] = { status: 400, body: { error: frase } }
        const host = await montar()
        await digitar(campo(host, 'Instrução da etapa 2'), 'confirme de outro jeito')
        await clicar(salvar(host))
        expect(host.querySelector('[data-erro-ao-salvar-etapas]')?.textContent).toContain(frase)
        expect((campo(host, 'Instrução da etapa 2') as HTMLTextAreaElement).value).toBe('confirme de outro jeito')
        expect(salvar(host).disabled).toBe(false)
    })

    it('depois de um erro, uma tentativa que passa limpa a frase', async () => {
        respostas[`PUT ${rotaDasEtapas(T)}`] = { status: 400, body: { error: 'falhou' } }
        const host = await montar()
        await digitar(campo(host, 'Instrução da etapa 2'), 'Outro')
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

    it('a confirmação nomeia o que se perde, do GRAVADO: o item, a instrução e o motor — e clicar em Excluir sozinho não tira nada', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: COM_MOTOR, motores: MOTORES, catalogo: CATALOGO } }
        const host = await montar()
        // o rascunho mudou a instrução: a confirmação diz o que está GRAVADO, que é o que sai do banco
        await digitar(campo(host, 'Instrução da etapa 1'), 'Digitado e não salvo')
        const b1 = await abrirExclusao(host, 1)
        expect(b1.textContent).toContain('Excluir a etapa 1 ("Apanhar o pedido")?')
        expect(Array.from(b1.querySelectorAll('[data-o-que-se-perde] li')).map((l) => l.textContent)).toEqual([
            'a etapa "Apanhar o pedido" do catálogo nesta família (o item continua no catálogo)', 'a instrução "pergunte a tipologia"', `o motor ${WOLFF}`,
        ])
        expect(host.querySelectorAll('[data-etapa]')).toHaveLength(2)
    })

    it('a instrução longa vai pelo começo e pelo tamanho; a etapa sem motor diz "sem motor"', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: COM_MOTOR, motores: MOTORES, catalogo: CATALOGO } }
        const host = await montar()
        const b2 = await abrirExclusao(host, 2)
        expect(Array.from(b2.querySelectorAll('[data-o-que-se-perde] li')).map((l) => l.textContent)).toEqual([
            'a etapa "Confirmar" do catálogo nesta família (o item continua no catálogo)', `a instrução de 100 caracteres ("${'x'.repeat(80)}…")`, 'sem motor',
        ])
    })

    it('a etapa SEM instrução diz "sem instrução" (nunca uma instrução vazia entre aspas)', async () => {
        const host = await montar()
        const b2 = await abrirExclusao(host, 2)
        expect(Array.from(b2.querySelectorAll('[data-o-que-se-perde] li')).map((l) => l.textContent)).toEqual([
            'a etapa "Confirmar" do catálogo nesta família (o item continua no catálogo)', 'sem instrução', 'sem motor',
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
        expect(put[0].corpo.etapas).toEqual([{ id: E2, etapa_catalogo_id: C2, instrucao: '' }])
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
    it('o aviso: a etapa vem do catálogo, a instrução é da empresa, e o salvo ainda não muda a conversa', async () => {
        const host = await montar()
        const aviso = Textos().AVISO_DAS_ETAPAS
        expect(host.textContent).toContain(aviso)
        expect(aviso).toContain('Cada etapa é escolhida do catálogo de etapas: o nome, a ação e as abas vêm de lá; a instrução é desta empresa.')
        expect(aviso).not.toContain('O rótulo é livre')
        expect(aviso).toContain('ainda não muda a conversa')
        expect(aviso).toContain('Excluir uma etapa gravada pede confirmação, e ela sai ao salvar.')
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
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: ETAPAS, motores: [], catalogo: CATALOGO } }
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

    it('salvar só a instrução NÃO manda motor_id, mesmo com a etapa já apontando um motor', async () => {
        const comMotor: EtapaDaFamilia[] = [{ ...ETAPAS[0], motor_id: M1 }, ETAPAS[1]]
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: comMotor, motores: MOTORES, catalogo: CATALOGO } }
        const host = await montar()
        expect(campo(host, 'Motor da etapa 1')!.closest('.ant-select')!.querySelector('.ant-select-selection-item')?.textContent).toBe(WOLFF)
        await digitar(campo(host, 'Instrução da etapa 1'), 'de novo')
        await clicar(salvar(host))
        expect(puts()[0].corpo.etapas.map((e) => 'motor_id' in e)).toEqual([false, false])
    })

    it('limpar o motor gravado manda motor_id: null', async () => {
        const comMotor: EtapaDaFamilia[] = [{ ...ETAPAS[0], motor_id: M1 }, ETAPAS[1]]
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: comMotor, motores: MOTORES, catalogo: CATALOGO } }
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
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: [{ ...ETAPAS[0], motor_id: fora }, ETAPAS[1]], motores: MOTORES, catalogo: CATALOGO } }
        const host = await montar()
        expect(campo(host, 'Motor da etapa 1')!.closest('.ant-select')!.querySelector('.ant-select-selection-item')?.textContent).toBe('(motor 99999999…, fora da lista)')
    })

    it('"Inserir etapa abaixo" da etapa 1: a nova vira a 2, a antiga 2 vira 3, e o corpo sai nessa ordem, a nova SEM id', async () => {
        const host = await montar()
        await clicar(botao(host, 'Inserir uma etapa abaixo da etapa 1'))
        expect(host.querySelectorAll('[data-etapa]')).toHaveLength(3)
        expect(itemEscolhido(host, 2)).toBeNull()
        expect(itemEscolhido(host, 3)).toBe('Confirmar')
        await clicar((await abrirItem(host, 2)).find((o) => o.textContent === 'Gerar o levantamento'))
        await clicar(salvar(host))
        const corpo = puts()[0].corpo.etapas
        expect(corpo.map((e) => e.etapa_catalogo_id)).toEqual([C1, C3, C2])
        expect(corpo.map((e) => 'id' in e)).toEqual([true, false, true])
    })
})

describe('(10) a família só calcula com TODAS as etapas com motor: a tela mostra se está pronta (29/10/2026)', () => {
    it('pronta: o aviso de pronta, e nenhuma etapa listada', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: { familia: 'PVC', etapas: ETAPAS.map((e) => ({ ...e, motor_id: M1 })), motores: MOTORES, catalogo: CATALOGO, pronta: true, etapas_sem_motor: [] } }
        const host = await montar()
        expect(host.querySelector('[data-familia-pronta]')?.textContent).toBe('A família está pronta: todas as etapas salvas têm motor.')
        expect(host.querySelector('[data-familia-nao-pronta]')).toBeNull()
    })

    it('não pronta: cada etapa sem motor, nomeada com a frase da recusa, na ordem que a rota mandou', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: {
            familia: 'PVC', etapas: ETAPAS, motores: MOTORES, catalogo: CATALOGO, pronta: false,
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
        await digitar(campo(host, 'Instrução da etapa 2'), 'confirme o pedido')
        expect(salvar(host).disabled).toBe(false)
    })

    it('a resposta SEM o indicador: a tela não afirma pronta nem não pronta', async () => {
        const host = await montar()
        expect(host.querySelector('[data-familia-pronta]')).toBeNull()
        expect(host.querySelector('[data-familia-nao-pronta]')).toBeNull()
        expect(host.querySelector('[data-faltas-de-configuracao]')).toBeNull()
    })

    // a FALTA DE CONFIGURAÇÃO é ERRO (31/10/2026): cada falta que a rota conferiu, com a frase dela; "pronta" não aparece junto
    it('com falta de configuração (o Perfil ficou sem fornecedor): o ERRO lista cada falta, e o "pronta" some mesmo com todas as etapas com motor', async () => {
        const falta = 'Falta de configuração — fornecedor: o Perfil de "Esquadrias de PVC" está sem fornecedor principal (o motor lê os códigos do perfil dele). Veja a configuração: escolha o fornecedor principal do Perfil na base de conhecimento da empresa.'
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: {
            familia: 'PVC', etapas: ETAPAS.map((e) => ({ ...e, motor_id: M1 })), motores: MOTORES, catalogo: CATALOGO, pronta: true, etapas_sem_motor: [], erros_de_configuracao: [falta],
        } }
        const host = await montar()
        const erro = host.querySelector('[data-faltas-de-configuracao]')!
        expect(erro.closest('.ant-alert-error')).not.toBeNull()
        expect(erro.textContent).toContain('A família não executa enquanto faltar configuração:')
        expect(Array.from(erro.querySelectorAll('[data-falta-de-configuracao]')).map((l) => l.textContent)).toEqual([falta])
        expect(host.querySelector('[data-familia-pronta]')).toBeNull()
    })

    it('sem falta (lista vazia): nenhum erro, e o "pronta" aparece', async () => {
        respostas[`GET ${rotaDasEtapas(T, MP)}`] = { status: 200, body: {
            familia: 'PVC', etapas: ETAPAS.map((e) => ({ ...e, motor_id: M1 })), motores: MOTORES, catalogo: CATALOGO, pronta: true, etapas_sem_motor: [], erros_de_configuracao: [],
        } }
        const host = await montar()
        expect(host.querySelector('[data-faltas-de-configuracao]')).toBeNull()
        expect(host.querySelector('[data-familia-pronta]')).not.toBeNull()
    })
})
