/**
 * PORTÃO 4b.1 e 4b.2 — a ficha é PÁGINA, e voltar devolve os filtros.
 *
 * Importa e renderiza; não parseia arquivo como texto. As mutações estão nomeadas em cada
 * bloco e foram RODADAS.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import {
    PARAM_DE_VOLTA,
    enderecoDeVolta,
    lerEnderecoDeVolta,
} from '@/utils/endereco-de-volta'
import { formatarTelefoneExibicao, isPhoneBRExibivel, isValidPhoneBR, phoneMask, telefoneExibivel } from '@/utils/phone-br'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: /min-width/.test(query),
        media: query,
        onchange: null as ((e: any) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

let routerPronto = true
let routerQuery: Record<string, string | string[] | undefined> = {}
const navegou: Array<{ url: any; metodo: 'push' | 'replace' }> = []
jest.mock('next/router', () => ({
    useRouter: () => ({
        isReady: routerPronto,
        pathname: '/clientes/[id]',
        query: routerQuery,
        push: (url: any) => { navegou.push({ url, metodo: 'push' }); return Promise.resolve(true) },
        replace: (url: any) => { navegou.push({ url, metodo: 'replace' }); return Promise.resolve(true) },
    }),
}))

jest.mock('@/hooks/use-auth.hook', () => ({
    useAuth: () => ({ currentUser: { uid: 'u1', role: 'admin', employee_id: 'e1' }, tenantId: 't1', loading: false }),
}))

let podeEditar = true
jest.mock('@/hooks/use-permissions.hook', () => {
    const real = jest.requireActual('@/hooks/use-permissions.hook')
    return {
        ...real,
        usePermissions: () => ({ canView: () => true, canEdit: () => podeEditar, isAdmin: true, isSuperAdmin: false }),
    }
})

// O cliente que a consulta por ID devolve. `null` é o "não encontrado".
let clienteNoBanco: Record<string, unknown> | null = { id: 'c1', name: 'Alfa Ltda', customer_type: 'PJ', status: 'ACTIVE' }
jest.mock('@/supabase/client', () => ({
    supabase: {
        from: (tabela: string) => {
            const encadeia: any = {
                select: () => encadeia,
                eq: () => encadeia,
                in: () => encadeia,
                order: () => (tabela === 'employees'
                    ? Promise.resolve({ data: [{ id: 'e1', name: 'Fulano' }], error: null })
                    : Promise.resolve({ data: [], error: null })),
                maybeSingle: () => Promise.resolve({ data: tabela === 'customers' ? clienteNoBanco : null, error: null }),
                single: () => Promise.resolve({ data: null, error: null }),
                then: (r: any) => Promise.resolve({ data: [], error: null }).then(r),
            }
            return encadeia
        },
        storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FichaDoCliente, TEXTO_NAO_ENCONTRADO, ABAS_DA_FICHA } = require('@/page-parts/clientes/ficha-do-cliente.component')

function montar(no: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(no) })
    return { host, texto: () => host.textContent || '', desmontar: () => { act(() => { root.unmount() }); host.remove() } }
}

beforeEach(() => {
    routerPronto = true
    routerQuery = { id: 'c1', aba: 'dados' }
    navegou.length = 0
    podeEditar = true
    clienteNoBanco = { id: 'c1', name: 'Alfa Ltda', customer_type: 'PJ', status: 'ACTIVE' }
})

describe('4b.1 — a ficha é página, com as abas na URL', () => {
    it('as quatro abas existem e `dados` é a primeira', () => {
        expect([...ABAS_DA_FICHA]).toEqual(['dados', 'orcamentos', 'pedidos', 'vendas'])
    })

    it('renderiza o cliente carregado POR ID', async () => {
        const t = montar(<FichaDoCliente customerId="c1" />)
        await act(async () => { await Promise.resolve() })
        expect(t.texto()).toContain('Alfa Ltda')
        t.desmontar()
    })

    // MUTAÇÃO: devolver `null` em silêncio, ou redirecionar.
    it('cliente inexistente mostra estado explícito, nunca página em branco', async () => {
        clienteNoBanco = null
        const t = montar(<FichaDoCliente customerId="c9" />)
        await act(async () => { await Promise.resolve() })
        expect(t.texto()).toContain(TEXTO_NAO_ENCONTRADO)
        // E NÃO redireciona: um `push` aqui tiraria o usuário do endereço sem explicar.
        expect(navegou.filter(n => n.metodo === 'push')).toHaveLength(0)
        t.desmontar()
    })

    it('trocar de aba escreve `?aba=` e NÃO carrega o modo de edição junto', async () => {
        routerQuery = { id: 'c1', aba: 'dados', editar: '1' }
        const t = montar(<FichaDoCliente customerId="c1" />)
        await act(async () => { await Promise.resolve() })
        const abaVendas = Array.from(t.host.querySelectorAll('[role="tab"]')).find(e => (e.textContent || '') === 'Vendas')
        act(() => { (abaVendas as HTMLElement).click() })
        const ultima = navegou[navegou.length - 1]
        expect(ultima.url.query.aba).toBe('vendas')
        expect(ultima.url.query.editar).toBeUndefined()
        t.desmontar()
    })

    // MUTAÇÃO: abrir uma segunda tela (Drawer) em vez de mudar a URL.
    it('EDITAR é a MESMA página: escreve `aba=dados&editar=1`', async () => {
        const t = montar(<FichaDoCliente customerId="c1" />)
        await act(async () => { await Promise.resolve() })
        const botao = Array.from(t.host.querySelectorAll('button')).find(b => (b.textContent || '').includes('Editar'))
        act(() => { (botao as HTMLButtonElement).click() })
        const ultima = navegou[navegou.length - 1]
        expect(ultima.url.query).toMatchObject({ aba: 'dados', editar: '1' })
        t.desmontar()
    })

    it('sem permissão de edição o botão Editar não existe', async () => {
        podeEditar = false
        const t = montar(<FichaDoCliente customerId="c1" />)
        await act(async () => { await Promise.resolve() })
        expect(Array.from(t.host.querySelectorAll('button')).some(b => (b.textContent || '') === 'Editar')).toBe(false)
        t.desmontar()
    })
})

describe('4b.2 — voltar devolve a lista COM os filtros', () => {
    it('o endereço de volta serializa a query da lista', () => {
        expect(enderecoDeVolta({ atraso: '1', vence_de: '2026-10-01', segmento: 'Varejo' }))
            .toBe('atraso=1&vence_de=2026-10-01&segmento=Varejo')
    })

    it('ele NÃO carrega a si mesmo — `de` dentro de `de` cresceria a cada clique', () => {
        expect(enderecoDeVolta({ atraso: '1', [PARAM_DE_VOLTA]: 'lixo=1' })).toBe('atraso=1')
    })

    it('ida e volta: o que foi serializado é o que volta', () => {
        const query = { atraso: '1', atraso_de: '31', busca: 'silva' }
        expect(lerEnderecoDeVolta(enderecoDeVolta(query))).toEqual(query)
    })

    it('`de` apontando para fora é descartado — Voltar não é redirecionamento aberto', () => {
        expect(lerEnderecoDeVolta('https://exemplo.invalido/?a=1')).toEqual({})
        expect(lerEnderecoDeVolta('/outra/rota?a=1')).toEqual({})
        expect(lerEnderecoDeVolta('//exemplo.invalido')).toEqual({})
    })

    // MUTAÇÃO: voltar para `/clientes` sem query.
    it('o botão Voltar reconstrói `/clientes` COM os parâmetros', async () => {
        routerQuery = { id: 'c1', aba: 'dados', [PARAM_DE_VOLTA]: 'atraso=1&atraso_de=31&atraso_ate=60&segmento=Varejo' }
        const t = montar(<FichaDoCliente customerId="c1" />)
        await act(async () => { await Promise.resolve() })
        const botao = Array.from(t.host.querySelectorAll('button')).find(b => (b.textContent || '').includes('Voltar'))
        act(() => { (botao as HTMLButtonElement).click() })
        const ultima = navegou[navegou.length - 1]
        expect(ultima.metodo).toBe('push')
        expect(ultima.url).toEqual({
            pathname: '/clientes',
            query: { atraso: '1', atraso_de: '31', atraso_ate: '60', segmento: 'Varejo' },
        })
        t.desmontar()
    })

    it('sem `de` o Voltar vai para a lista limpa, e não quebra', async () => {
        const t = montar(<FichaDoCliente customerId="c1" />)
        await act(async () => { await Promise.resolve() })
        const botao = Array.from(t.host.querySelectorAll('button')).find(b => (b.textContent || '').includes('Voltar'))
        act(() => { (botao as HTMLButtonElement).click() })
        expect(navegou[navegou.length - 1].url).toBe('/clientes')
        t.desmontar()
    })
})

describe('o predicado estrito de telefone — e por que o antigo não servia', () => {
    // MUTAÇÃO: usar `isValidPhoneBR` no lugar de `isPhoneBRExibivel`.
    it('o antigo APROVA 23 dígitos, porque corta antes de contar', () => {
        expect(isValidPhoneBR('51999999999999999999999')).toBe(true)
        expect(isPhoneBRExibivel('51999999999999999999999')).toBe(false)
    })

    it('o antigo aprova o número com DDI; o estrito, não', () => {
        expect(isValidPhoneBR('5551999990000')).toBe(true)
        expect(isPhoneBRExibivel('5551999990000')).toBe(false)
    })

    it('os dois concordam no telefone legítimo', () => {
        expect(isValidPhoneBR('(51) 99999-9999')).toBe(true)
        expect(isPhoneBRExibivel('(51) 99999-9999')).toBe(true)
        expect(isPhoneBRExibivel('5133334444')).toBe(true)
    })

    // MUTAÇÃO: usar `phoneMask` no lugar de `formatarTelefoneExibicao`.
    it('o FIXO de 10 dígitos sai agrupado como fixo, não como celular', () => {
        // `phoneMask` quebra sempre no sétimo dígito, porque formata enquanto se digita.
        expect(phoneMask('5133334444')).toBe('(51) 33334-444')
        expect(formatarTelefoneExibicao('5133334444')).toBe('(51) 3333-4444')
        expect(formatarTelefoneExibicao('51999998888')).toBe('(51) 99999-8888')
    })

    it('o WhatsApp vence o fixo, e o inválido não é exibido nem truncado', () => {
        expect(telefoneExibivel({ whatsapp: '51999998888', fixo: '5133334444' })).toBe('(51) 99999-8888')
        expect(telefoneExibivel({ whatsapp: '5555', fixo: '5133334444' })).toBe('(51) 3333-4444')
        expect(telefoneExibivel({ whatsapp: '5555', fixo: '34530' })).toBeNull()
        expect(telefoneExibivel({ whatsapp: null, fixo: null })).toBeNull()
    })

    it('o predicado vale para os DOIS lados, não só para o fallback', () => {
        // 13 dos 51 `whatsapp_phone` da base estão fora da faixa. Se o estrito valesse só do
        // lado do `phone`, eles sairiam crus na tela.
        expect(telefoneExibivel({ whatsapp: '51999999999999999999999', fixo: '5133334444' })).toBe('(51) 3333-4444')
    })
})
