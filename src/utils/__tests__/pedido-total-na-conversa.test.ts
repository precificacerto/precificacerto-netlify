/**
 * Pedido 0034-B (dono do produto, 26/11/2026): o PEDIDO TOTAL é escolhido pelo VENDEDOR, pela palavra dele na mensagem ("orça pelo pedido
 * total", "pelas barras"), ou pelo responsável na tela. Nunca pelo agente sozinho.
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pediuPedidoTotal } = require('@/lib/atendimentos-ia/conversa-da-ia') as typeof import('@/lib/atendimentos-ia/conversa-da-ia')

describe('o vendedor pediu o pedido total', () => {
    it('pelas palavras dele, em qualquer caixa e com ou sem acento', () => {
        for (const t of ['sim, orça pelo pedido total', 'SIM. PEDIDO TOTAL', 'orça pelas barras', 'sim, pelas barras inteiras', 'faz pela barra inteira', 'Sim pedido  total'])
            expect([t, pediuPedidoTotal(t)]).toEqual([t, true])
    })
    it('o "sim" sozinho, e as frases que só lembram a palavra, não são o pedido total', () => {
        for (const t of ['sim', 'sim, confere', 'o total do pedido está alto?', 'quantas barras deu?', 'barras de 6 m', 'pedido totalmente errado'])
            expect([t, pediuPedidoTotal(t)]).toEqual([t, false])
    })
})
