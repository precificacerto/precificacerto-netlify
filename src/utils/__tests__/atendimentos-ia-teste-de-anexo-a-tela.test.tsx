/**
 * PORTÃO — o BOTÃO do teste de envio de anexo, na tela da conta do super admin (26/10/2026). Chama a rota e mostra o
 * resultado do WUZAPI: o 502 da rota é MEDIDA (o anexo não saiu), não falha da tela.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TesteDeAnexo } from '@/page-parts/atendimentos-ia/teste-de-anexo.component'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
})

const CONTA = '00000000-0000-4000-8000-0000000000a1'
const chamadas: Array<{ url: string; metodo: string }> = []
let resposta = { status: 200, corpo: { enviado: true, status: 200, bytes: 3456, ms: 812 } as Record<string, unknown> }

beforeEach(() => {
    chamadas.length = 0
    global.fetch = (async (url: string, init: { method: string }) => {
        chamadas.push({ url: String(url), metodo: init.method })
        return { ok: resposta.status < 300, status: resposta.status, json: async () => resposta.corpo } as unknown as Response
    }) as unknown as typeof fetch
})

async function montarEClicar() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(<TesteDeAnexo tenantId={CONTA} />) })
    await act(async () => { (host.querySelector('[data-enviar-teste-de-anexo]') as HTMLButtonElement).click() })
    return host
}

describe('o botão do teste de envio de anexo', () => {
    it('chama a rota da conta, com POST, e mostra que o anexo SAIU, com o status, o tamanho e o tempo', async () => {
        const host = await montarEClicar()
        expect(chamadas).toEqual([{ url: ROTAS_DO_CATALOGO.testeDeAnexo(CONTA), metodo: 'POST' }])
        const alerta = host.querySelector('[data-resultado-do-teste-de-anexo]')?.textContent ?? ''
        expect(alerta).toContain('O anexo saiu pela conexão do orçamentista.')
        expect(alerta).toContain('Status do WUZAPI: 200 · arquivo de 3456 bytes · 812 ms')
    })

    it('o 502 da rota é o resultado: mostra que o anexo NÃO saiu, com o status e o detalhe do WUZAPI', async () => {
        resposta = { status: 502, corpo: { enviado: false, status: 500, bytes: 3456, ms: 640, detalhe: 'failed to send document' } }
        const host = await montarEClicar()
        const alerta = host.querySelector('[data-resultado-do-teste-de-anexo]')?.textContent ?? ''
        expect(alerta).toContain('O anexo NÃO saiu pela conexão do orçamentista.')
        expect(alerta).toContain('Status do WUZAPI: 500')
        expect(alerta).toContain('failed to send document')
    })
})
