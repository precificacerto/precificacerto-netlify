/**
 * PORTÃO — A TELA DOS DESENHOS (dono do produto, 11/11/2026): o índice é lido e a colisão do código é NOMEADA (nunca fundida); sem índice e
 * sem zip não há envio; o índice inválido mostra o erro com o nome do arquivo; e o resultado de cada zip mostra o resumo e as listas nomeadas.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { COLUNAS_DO_INDICE } from '@/lib/atendimentos-ia/desenhos-das-tipologias'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, onchange: null as ((e: unknown) => void) | null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
})
const enviados: Array<{ nome: string; linhas: number }> = []
jest.mock('@/page-parts/atendimentos-ia/envio-dos-desenhos', () => ({
    enviarDesenhosDoZip: async (_z: Blob, nome: string, indice: unknown[]): Promise<unknown> => {
        enviados.push({ nome, linhas: indice.length })
        if (nome === 'fora.zip') return { erro: 'o índice não cita o zip "fora.zip" (a coluna zip tem de ter o nome do arquivo, exato).' }
        return { zip: nome, enviados: ['pvc/A.jpg'], jaExistiam: ['pvc/B.jpg'], falhas: [{ arquivo: 'pvc/C.jpg', motivo: 'o envio falhou (500)' }],
            recusados: [], ignorados: [{ arquivo: 'indice.csv', motivo: 'o índice de dentro do zip não sobe' }], faltamNoZip: [{ arquivo: 'imagens/D.jpg', motivo: 'o índice cita e o zip não tem' }] }
    },
}))
const rotas: Array<{ url: string; metodo: string; corpo: unknown }> = []
const respostas: Record<string, unknown> = {}
jest.mock('@/page-parts/atendimentos-ia/api', () => ({
    chamarRota: async (url: string, metodo = 'GET', corpo?: unknown) => {
        rotas.push({ url, metodo, corpo })
        const r = respostas[url]
        if (r instanceof Error) throw r
        return r
    },
}))
/* eslint-disable @typescript-eslint/no-require-imports */
const { DesenhosDoCatalogo } = require('@/page-parts/atendimentos-ia/desenhos-do-catalogo.component') as typeof import('@/page-parts/atendimentos-ia/desenhos-do-catalogo.component')
/* eslint-enable @typescript-eslint/no-require-imports */

const montadas: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() }; enviados.length = 0; rotas.length = 0; for (const k of Object.keys(respostas)) delete respostas[k] })
const assentar = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- createRoot do React, não util da Testing Library
    await act(async () => { root.render(<DesenhosDoCatalogo />) })
    await assentar()
    return host
}
async function escolher(host: HTMLElement, indice: 0 | 1, arquivos: File[]) {
    const input = host.querySelectorAll('input[type=file]')[indice] as HTMLInputElement
    Object.defineProperty(input, 'files', { value: arquivos, configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await assentar()
}
const botao = (host: HTMLElement, texto: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(texto)) as HTMLButtonElement
const linha = (codigo: string, zip = 'pvc.zip') => ['por_variavel', 'PVC', codigo, 'DP-17', '', '', '(N=1)', 'a.jpg', zip, 'imagens/a.jpg', ''].join(',')
const CSV = [COLUNAS_DO_INDICE.join(','), linha('DP-017'), linha('DP-17')].join('\r\n')

it('o índice lido diz as linhas e os zips, e NOMEIA a colisão do código (DP-017 e DP-17) sem fundir', async () => {
    const host = await montar()
    await escolher(host, 0, [new File([CSV], 'tipologia_desenho.csv')])
    const lido = host.querySelector('[data-indice-lido]')!.textContent!
    expect(lido).toContain('tipologia_desenho.csv: 2 linhas, 1 zips citados.')
    expect(lido).toContain('DP-017 e DP-17 caem no mesmo código normalizado (DP-17)')
})

it('o índice sem as colunas: o erro com o nome do arquivo; sem índice válido, o envio fica desligado', async () => {
    const host = await montar()
    await escolher(host, 0, [new File(['fonte,grupo\r\n'], 'errado.csv')])
    expect(host.querySelector('[data-erro-do-indice]')!.textContent).toContain('errado.csv: o índice não tem a(s) coluna(s): codigo')
    await escolher(host, 1, [new File(['x'], 'pvc.zip')])
    expect(botao(host, 'Enviar os desenhos').disabled).toBe(true)
})

it('cada zip mostra o resumo e as listas NOMEADAS; o zip que o índice não cita mostra a frase — nada some', async () => {
    const host = await montar()
    await escolher(host, 0, [new File([CSV], 'tipologia_desenho.csv')])
    await escolher(host, 1, [new File(['x'], 'pvc.zip'), new File(['y'], 'fora.zip')])
    expect(botao(host, 'Enviar os desenhos').disabled).toBe(false)
    await act(async () => { botao(host, 'Enviar os desenhos').click() })
    await assentar()
    expect(enviados).toEqual([{ nome: 'pvc.zip', linhas: 2 }, { nome: 'fora.zip', linhas: 2 }])
    const pvc = host.querySelector('[data-resultado="pvc.zip"]')!.textContent!
    expect(pvc).toContain('pvc.zip: 1 enviados, 1 já existiam, 1 falharam, 0 recusados, 1 ignorados, 1 citados no índice e ausentes do zip.')
    expect(pvc).toContain('Rode o envio de novo com o mesmo zip')
    for (const t of ['Falharam (1)', 'Citados no índice e ausentes do zip (1)', 'Ignorados (1)', 'Já existiam (1)']) expect(pvc).toContain(t)
    expect(host.querySelector('[data-resultado="fora.zip"]')!.textContent).toContain('o índice não cita o zip "fora.zip"')
})

const IMPORTAR = '/api/super-admin/atendimentos-ia/desenhos/importar'
const CONFERIR = '/api/super-admin/atendimentos-ia/desenhos/conferencia'

it('IMPORTAR manda o TEXTO do índice e a permissão de encolher como está marcada; mostra o resumo e as listas nomeadas', async () => {
    respostas[IMPORTAR] = { resultado: 'importado', antes: 0, linhas: 2, sha256: 'abc', sem_arquivo: ['linha 4: DP-2 (N=1) (a.png)'], colisoes: ['DP-017 e DP-17 caem no mesmo código normalizado (DP-17)'] }
    const host = await montar()
    expect(botao(host, 'Importar o índice').disabled).toBe(true)
    await escolher(host, 0, [new File([CSV], 'tipologia_desenho.csv')])
    await act(async () => { botao(host, 'Importar o índice').click() })
    await assentar()
    expect(rotas).toEqual([{ url: IMPORTAR, metodo: 'POST', corpo: { texto: CSV, permitir_encolher: false } }])
    const t = host.querySelector('[data-importacao]')!.textContent!
    expect(t).toContain('Importado: a tabela tinha 0 linhas e agora tem 2 (sha256 abc).')
    expect(t).toContain('Linhas sem arquivo nos zips (1)')
    expect(t).toContain('Colisões de código (não fundidas) (1)')
    // marcada a permissão, ela vai marcada
    const caixa = host.querySelector('input[type=checkbox]') as HTMLInputElement
    await act(async () => { caixa.click() })
    await act(async () => { botao(host, 'Importar o índice').click() })
    await assentar()
    expect((rotas[1].corpo as { permitir_encolher: boolean }).permitir_encolher).toBe(true)
})

it('a RECUSA da importação aparece com a frase e as linhas recusadas, nunca como sucesso', async () => {
    respostas[IMPORTAR] = Object.assign(new Error('O índice tem linhas que não podem ser importadas. Nada foi importado.'), { corpo: { recusas: ['linha 2: liberado "Talvez" não é Sim, Não nem vazio'] } })
    const host = await montar()
    await escolher(host, 0, [new File([CSV], 'tipologia_desenho.csv')])
    await act(async () => { botao(host, 'Importar o índice').click() })
    await assentar()
    expect(host.querySelector('[data-importacao]')).toBeNull()
    const erro = host.querySelector('[data-importacao-erro]')!.textContent!
    expect(erro).toContain('Nada foi importado.')
    expect(erro).toContain('linha 2: liberado "Talvez"')
})

it('CONFERIR mostra os DOIS LADOS nomeados; casados, diz que casam', async () => {
    respostas[CONFERIR] = { sem_objeto: ['tipologias/pvc/A.jpg'], sem_linha: ['tipologias/pvc/Z.jpg', 'tipologias/pvc/Y.jpg'], caminhos: 10, objetos: 11 }
    const host = await montar()
    await act(async () => { botao(host, 'Conferir').click() })
    await assentar()
    let t = host.querySelector('[data-conferencia]')!.textContent!
    expect(t).toContain('1 caminho(s) do índice sem objeto no Storage e 2 objeto(s) do Storage que nenhuma linha aponta.')
    expect(t).toContain('Caminhos do índice sem objeto no Storage (1)')
    expect(t).toContain('Objetos do Storage que nenhuma linha aponta (2)')
    respostas[CONFERIR] = { sem_objeto: [], sem_linha: [], caminhos: 1381, objetos: 1381 }
    await act(async () => { botao(host, 'Conferir').click() })
    await assentar()
    t = host.querySelector('[data-conferencia]')!.textContent!
    expect(t).toContain('Índice e Storage casam: 1381 caminhos, 1381 objetos, nenhum de um lado sem o outro.')
})
