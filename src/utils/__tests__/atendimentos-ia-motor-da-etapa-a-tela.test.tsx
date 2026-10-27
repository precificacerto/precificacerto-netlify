/**
 * PORTÃO — o campo de ARQUIVO em cada etapa da família (`etapas-da-familia.component.tsx`; 27/10/2026, migração 20261027000010).
 *
 * POR QUÊ (dono do produto): "a lista de etapas é a lista de motores". Cada linha de etapa tem o seu campo de arquivo; subir o arquivo
 * cria o motor da família (global) e já aponta a etapa, numa transação só. O objetivo é VER as etapas funcionando na tela.
 *
 * O que este portão fica vermelho:
 *   (1) toda etapa GRAVADA tem o campo de arquivo ("Subir" sem motor, "Trocar" com motor); a etapa nova, não salva, diz "salve antes" e não tem campo;
 *   (2) escolher o arquivo faz, NESTA ordem: pedir a URL à rota da família, mandar os bytes ao Storage, chamar a rota da etapa com
 *       { path, nome } — e depois RELER a lista (o motor novo aparece, a etapa o aponta);
 *   (3) a recusa de QUALQUER passo aparece NO cartão da etapa, com a frase dela, e o passo seguinte não acontece;
 *   (4) com alteração pendente nas etapas o campo fica travado e nenhum pedido sai (subir relê a lista e perderia o rascunho);
 *   (5) o aviso de que o motor e as etapas são GLOBAIS nomeia as contas da família.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { rotaDasEtapas, type EtapaDaFamilia } from '@/utils/atendimentos-ia-etapas'
import { rotaDoEnvioDoMotor, rotaDoMotorDaEtapa } from '@/utils/atendimentos-ia-motor-da-etapa'

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
const M1 = '00000000-0000-4000-8000-0000000000a1'
const M_NOVO = '00000000-0000-4000-8000-0000000000a9'
const PATH = 'familia/PVC/motor/u1-Motor-novo.xlsx'
const URL_ASSINADA = `https://storage.exemplo/${PATH}?token=t`
const FAMILIAS = [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }]
const ETAPAS: EtapaDaFamilia[] = [
    { id: E1, numero: 1, rotulo: 'Apanhar o pedido', acao: 'APANHAR', instrucao: '', abas: [], motor_id: null },
    { id: E2, numero: 2, rotulo: 'Calcular', acao: 'CALCULAR_BARRAS', instrucao: '', abas: [], motor_id: M1 },
]
const MOTORES = [{ id: M1, arquivo_nome: 'Wolff.xlsx', fornecedor: 'Wolff', vigente: true }]
const MOTORES_DEPOIS = [...MOTORES, { id: M_NOVO, arquivo_nome: 'Motor novo.xlsx', fornecedor: null, vigente: false }]
const ETAPAS_DEPOIS: EtapaDaFamilia[] = [{ ...ETAPAS[0], motor_id: M_NOVO }, ETAPAS[1]]

type Resposta = { status: number; body: unknown }
let respostas: Record<string, Resposta[]> = {}
const pedidos: Array<{ chave: string; corpo: unknown; init?: { method?: string; headers?: Record<string, string>; body?: unknown } }> = []

beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${rotaDasEtapas('PVC')}`]: [
            { status: 200, body: { familia: 'PVC', etapas: ETAPAS, motores: MOTORES, contas: ['Vidraçaria Zeta', 'Álamo Esquadrias'] } },
            { status: 200, body: { familia: 'PVC', etapas: ETAPAS_DEPOIS, motores: MOTORES_DEPOIS, contas: ['Vidraçaria Zeta', 'Álamo Esquadrias'] } },
        ],
        [`POST ${rotaDoEnvioDoMotor('PVC')}`]: [{ status: 200, body: { path: PATH, signedUrl: URL_ASSINADA } }],
        [`PUT ${URL_ASSINADA}`]: [{ status: 200, body: {} }],
        [`POST ${rotaDoMotorDaEtapa('PVC', E1)}`]: [{ status: 200, body: { motor_id: M_NOVO, etapa_id: E1, motor_anterior: null, importacao_id: 'i', regras: 12116, tipologias: 157, detalhes: 164, avisos: [] } }],
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body, init })
        const fila = respostas[chave]
        const r = fila && fila.length > 0 ? (fila.length > 1 ? fila.shift()! : fila[0]) : { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Cartao = () => require('@/page-parts/atendimentos-ia/etapas-da-familia.component').EtapasDaFamiliaCard as React.ComponentType<{ familias: typeof FAMILIAS }>

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(Cartao(), { familias: FAMILIAS })) })
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
async function digitar(el: Element | null, valor: string) {
    expect(el).toBeTruthy()
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valor)
        el!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await assentar()
}
/** Escolhe o arquivo no campo da etapa, como o navegador: o `files` do input e o evento de mudança. */
async function escolher(host: ParentNode, etapaId: string, nome = 'Motor novo.xlsx') {
    const input = host.querySelector(`[data-etapa="${etapaId}"] [data-arquivo-do-motor] input[type="file"]`) as HTMLInputElement
    expect(input).toBeTruthy()
    const arquivo = new File([new Uint8Array([80, 75, 3, 4])], nome, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    await act(async () => {
        Object.defineProperty(input, 'files', { value: [arquivo], configurable: true })
        input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await assentar()
}
const campoDoArquivo = (host: ParentNode, etapaId: string) => host.querySelector(`[data-etapa="${etapaId}"] [data-arquivo-do-motor]`) as HTMLElement
const chaves = () => pedidos.map((p) => p.chave)
const antesDeSubir = () => pedidos.length

describe('(1) toda etapa gravada tem o seu campo de arquivo', () => {
    it('Subir (sem motor) e Trocar (com motor); o campo é um input de arquivo que só aceita planilha', async () => {
        const host = await montar()
        expect(botao(campoDoArquivo(host, E1), 'Subir o arquivo do motor da etapa 1')?.textContent).toContain('Subir o arquivo do motor')
        expect(botao(campoDoArquivo(host, E2), 'Subir o arquivo do motor da etapa 2')?.textContent).toContain('Trocar o arquivo do motor')
        const input = campoDoArquivo(host, E1).querySelector('input[type="file"]') as HTMLInputElement
        expect(input.getAttribute('accept')).toBe('.xlsx,.xlsm')
    })

    it('a etapa NOVA, ainda não salva, diz "salve antes" e não tem campo de arquivo', async () => {
        const host = await montar()
        await clicar(botao(host, 'Nova etapa'))
        const nova = host.querySelectorAll('[data-etapa]')[2] as HTMLElement
        expect(nova.querySelector('[data-salve-antes-de-subir]')?.textContent).toBe('Salve a etapa antes de subir o arquivo do motor.')
        expect(nova.querySelector('input[type="file"]')).toBeNull()
    })
})

describe('(2) subir o arquivo: URL, bytes, rota da etapa e releitura — nessa ordem', () => {
    it('os quatro pedidos saem na ordem, com o caminho que a rota assinou, e a etapa passa a mostrar o motor novo', async () => {
        const host = await montar()
        const n = antesDeSubir()
        await escolher(host, E1)
        expect(chaves().slice(n)).toEqual([
            `POST ${rotaDoEnvioDoMotor('PVC')}`,
            `PUT ${URL_ASSINADA}`,
            `POST ${rotaDoMotorDaEtapa('PVC', E1)}`,
            `GET ${rotaDasEtapas('PVC')}`,
        ])
        const [pedirUrl, enviar, criar] = pedidos.slice(n)
        expect(pedirUrl.corpo).toEqual({ nome: 'Motor novo.xlsx' })
        expect(enviar.init?.headers).toEqual({ 'x-upsert': 'false' })
        expect((enviar.corpo as FormData).get('')).toBeInstanceOf(File)
        // a rota da etapa recebe o caminho ASSINADO e o nome original — não o que o navegador inventaria
        expect(criar.corpo).toEqual({ path: PATH, nome: 'Motor novo.xlsx' })
        // a releitura trouxe o motor novo: a etapa 1 o aponta, e ele está na lista dos motores da família
        expect(host.querySelector(`[data-etapa="${E1}"] [data-motor-da-etapa] .ant-select-selection-item`)?.textContent).toBe('Motor novo.xlsx (da família)')
        expect(host.querySelector('[data-motores-da-familia]')?.textContent).toContain('Motor novo.xlsx (da família)')
        expect(botao(campoDoArquivo(host, E1), 'Subir o arquivo do motor da etapa 1')?.textContent).toContain('Trocar o arquivo do motor')
    })

    it('o PUT das etapas NÃO sai: subir o arquivo não grava a lista (a função do banco aponta a etapa)', async () => {
        const host = await montar()
        await escolher(host, E1)
        expect(chaves().some((c) => c === `PUT ${rotaDasEtapas('PVC')}`)).toBe(false)
    })
})

describe('(3) a recusa de qualquer passo aparece NO cartão da etapa, e o passo seguinte não acontece', () => {
    it('a rota da etapa recusa (422): a frase dela no cartão da etapa 1, só nele, e a lista NÃO é relida', async () => {
        respostas[`POST ${rotaDoMotorDaEtapa('PVC', E1)}`] = [{ status: 422, body: { error: 'Motor novo.xlsx: não tem a aba "Motor por barra". Abas encontradas: "Outra".' } }]
        const host = await montar()
        const n = antesDeSubir()
        await escolher(host, E1)
        expect(chaves().slice(n)).toEqual([`POST ${rotaDoEnvioDoMotor('PVC')}`, `PUT ${URL_ASSINADA}`, `POST ${rotaDoMotorDaEtapa('PVC', E1)}`])
        const erro = host.querySelector(`[data-etapa="${E1}"] [data-erro-da-subida]`)
        expect(erro?.textContent).toContain('O motor não foi criado.')
        expect(erro?.textContent).toContain('não tem a aba "Motor por barra"')
        expect(host.querySelector(`[data-etapa="${E2}"] [data-erro-da-subida]`)).toBeNull()
    })

    it('o Storage recusa os bytes: o erro cita o ARQUIVO, e a rota da etapa não é chamada', async () => {
        respostas[`PUT ${URL_ASSINADA}`] = [{ status: 500, body: {} }]
        const host = await montar()
        const n = antesDeSubir()
        await escolher(host, E1)
        expect(chaves().slice(n)).toEqual([`POST ${rotaDoEnvioDoMotor('PVC')}`, `PUT ${URL_ASSINADA}`])
        const erro = host.querySelector(`[data-etapa="${E1}"] [data-erro-da-subida]`)
        expect(erro?.textContent).toContain('Motor novo.xlsx')
        expect(erro?.textContent).toContain('o envio falhou (500)')
    })

    it('a rota não assina a URL (400, extensão que a leitura não abre): o erro cita o arquivo e nada mais sai', async () => {
        respostas[`POST ${rotaDoEnvioDoMotor('PVC')}`] = [{ status: 400, body: { error: 'só planilha .xlsx ou .xlsm' } }]
        const host = await montar()
        const n = antesDeSubir()
        await escolher(host, E1, 'motor.xls')
        expect(chaves().slice(n)).toEqual([`POST ${rotaDoEnvioDoMotor('PVC')}`])
        expect(host.querySelector(`[data-etapa="${E1}"] [data-erro-da-subida]`)?.textContent).toContain('motor.xls')
    })

    it('uma nova tentativa que passa limpa a frase de erro', async () => {
        respostas[`POST ${rotaDoMotorDaEtapa('PVC', E1)}`] = [
            { status: 422, body: { error: 'arquivo ruim' } },
            { status: 200, body: { motor_id: M_NOVO, etapa_id: E1, motor_anterior: null, importacao_id: 'i', regras: 1, tipologias: 1, detalhes: 1, avisos: [] } },
        ]
        const host = await montar()
        await escolher(host, E1)
        expect(host.querySelector('[data-erro-da-subida]')).not.toBeNull()
        await escolher(host, E1)
        expect(host.querySelector('[data-erro-da-subida]')).toBeNull()
    })
})

describe('(4) com alteração pendente o campo fica travado', () => {
    it('editar o rótulo trava os campos de arquivo, diz por quê, e escolher um arquivo não envia NADA', async () => {
        const host = await montar()
        await digitar(host.querySelector('[aria-label="Rótulo da etapa 1"]'), 'Apanhar o pedido (novo)')
        const botaoDaEtapa1 = botao(campoDoArquivo(host, E1), 'Subir o arquivo do motor da etapa 1') as HTMLButtonElement
        expect(botaoDaEtapa1.disabled).toBe(true)
        expect((campoDoArquivo(host, E1).querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true)
        expect(campoDoArquivo(host, E1).querySelector('[data-salve-as-etapas]')?.textContent).toContain('salve antes de subir um arquivo')
        const n = antesDeSubir()
        await escolher(host, E1)
        expect(pedidos.length).toBe(n)
    })

    it('voltar ao que estava gravado destrava o campo', async () => {
        const host = await montar()
        await digitar(host.querySelector('[aria-label="Rótulo da etapa 1"]'), 'Outro')
        await digitar(host.querySelector('[aria-label="Rótulo da etapa 1"]'), 'Apanhar o pedido')
        expect((botao(campoDoArquivo(host, E1), 'Subir o arquivo do motor da etapa 1') as HTMLButtonElement).disabled).toBe(false)
    })
})

describe('(5) o motor é global: o aviso nomeia as contas da família', () => {
    it('diz que vale para TODAS as contas e lista os nomes em ordem', async () => {
        const host = await montar()
        const aviso = host.querySelector('[data-aviso-do-motor-global]')?.textContent ?? ''
        expect(aviso).toContain('TODAS as contas desta família')
        expect(aviso).toContain('Contas que usam esta família: Álamo Esquadrias, Vidraçaria Zeta.')
    })

    it('família sem conta nenhuma: o aviso continua, sem lista', async () => {
        respostas[`GET ${rotaDasEtapas('PVC')}`] = [{ status: 200, body: { familia: 'PVC', etapas: ETAPAS, motores: MOTORES, contas: [] } }]
        const host = await montar()
        const aviso = host.querySelector('[data-aviso-do-motor-global]')?.textContent ?? ''
        expect(aviso).toContain('TODAS as contas desta família')
        expect(aviso).not.toContain('Contas que usam')
    })
})
