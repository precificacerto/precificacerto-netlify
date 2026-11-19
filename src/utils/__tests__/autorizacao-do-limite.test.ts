/**
 * PORTÃO — A AUTORIZAÇÃO DA MEDIDA FORA DO LIMITE (dono do produto, 18/11/2026, decisão 1): a liberação vale para AQUELA tipologia e AQUELA
 * medida; o pedido está em aberto só com o item sem tipologia e a mesma medida; o que não vale mais sai inteiro.
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
import { autorizacaoVale, limiteVencido, pedidoEmAberto, type LimiteDoItem } from '@/lib/atendimentos-ia/autorizacao-do-limite'

const PEDIDO: LimiteDoItem = { ordem: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 2500, autorizadoPor: null }
const AUTORIZADO: LimiteDoItem = { ...PEDIDO, autorizadoPor: 'remetente-1' }
const item = (tipologia: string | null, largura_mm: number | null = 1200, altura_mm: number | null = 2500) => ({ tipologia, largura_mm, altura_mm })

describe('a autorização vale só para a tipologia e a medida autorizadas', () => {
    it('a mesma tipologia e a mesma medida: vale', () => expect(autorizacaoVale(AUTORIZADO, item('DP-02'))).toBe(true))
    it('outra tipologia: não vale', () => expect(autorizacaoVale(AUTORIZADO, item('DP-04'))).toBe(false))
    it('outra largura ou outra altura: não vale', () => {
        expect(autorizacaoVale(AUTORIZADO, item('DP-02', 1300))).toBe(false)
        expect(autorizacaoVale(AUTORIZADO, item('DP-02', 1200, 2600))).toBe(false)
    })
    it('o pedido sem resposta não é autorização', () => expect(autorizacaoVale(PEDIDO, item('DP-02'))).toBe(false))
    it('sem nada gravado: não vale', () => expect(autorizacaoVale(undefined, item('DP-02'))).toBe(false))
})

describe('o pedido está em aberto só com o item sem tipologia e a mesma medida', () => {
    it('sem tipologia e a mesma medida: em aberto', () => expect(pedidoEmAberto(PEDIDO, item(null))).toBe(true))
    it('o item já com tipologia: não está em aberto', () => expect(pedidoEmAberto(PEDIDO, item('DP-02'))).toBe(false))
    it('outra medida: não está em aberto', () => {
        expect(pedidoEmAberto(PEDIDO, item(null, 1300))).toBe(false)
        expect(pedidoEmAberto(PEDIDO, item(null, 1200, 2600))).toBe(false)
    })
    it('o já autorizado não é pedido em aberto', () => expect(pedidoEmAberto(AUTORIZADO, item(null))).toBe(false))
})

describe('o que não vale mais sai inteiro', () => {
    it('vencido: a medida mudou depois do pedido, ou a tipologia depois da autorização', () => {
        expect(limiteVencido(PEDIDO, item(null, 1200, 1000))).toBe(true)
        expect(limiteVencido(AUTORIZADO, item('DP-04'))).toBe(true)
    })
    it('não vencido: o pedido em aberto, a autorização que vale, e nada gravado', () => {
        expect(limiteVencido(PEDIDO, item(null))).toBe(false)
        expect(limiteVencido(AUTORIZADO, item('DP-02'))).toBe(false)
        expect(limiteVencido(undefined, item(null))).toBe(false)
    })
})
