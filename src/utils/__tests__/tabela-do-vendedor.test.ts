/**
 * A TABELA DO VENDEDOR onde o orçamento I.A. entra como produto (dono do produto, 16/11/2026): uma tabela de produtos, é ela; nenhuma, mais de
 * uma ou sem vendedor, nenhuma é escolhida e o aviso diz por quê.
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
import { decidirTabela } from '@/lib/atendimentos-ia/tabela-do-vendedor'
import { codigoDoProdutoDoOrcamento, nomeDoProdutoDoOrcamento } from '@/lib/atendimentos-ia/nome-do-produto-do-orcamento'

const CRISTIANO = { id: 'e-1', nome: 'Cristiano Fernandes' }
const T1 = { id: 't-1', nome: 'Orçamentos Cristiano' }
const T2 = { id: 't-2', nome: 'Balcão' }

describe('decidirTabela', () => {
    it('uma tabela de produtos: é ela, sem aviso', () => {
        expect(decidirTabela(CRISTIANO, [T1])).toEqual({ tabela: T1, aviso: null })
    })
    it('nenhuma tabela: nenhuma, e o aviso nomeia o vendedor', () => {
        const d = decidirTabela(CRISTIANO, [])
        expect(d.tabela).toBeNull()
        expect(d.aviso).toBe('A precificação foi salva, mas o orçamento não entrou em tabela de produtos: o vendedor Cristiano Fernandes não tem tabela de produtos.')
    })
    it('mais de uma: nenhuma é escolhida, e o aviso nomeia as tabelas', () => {
        const d = decidirTabela(CRISTIANO, [T1, T2])
        expect(d.tabela).toBeNull()
        expect(d.aviso).toContain('tem 2 tabelas de produtos ("Balcão", "Orçamentos Cristiano")')
        expect(d.aviso).toContain('nenhuma é escolhida')
    })
    it('sem vendedor: nenhuma, mesmo com tabelas', () => {
        const d = decidirTabela({ id: null, nome: null }, [T1])
        expect(d.tabela).toBeNull()
        expect(d.aviso).toContain('não tem vendedor')
    })
})

describe('o código e o nome do produto do orçamento', () => {
    it('IA-<número> e "Orçamento I.A. Nº <número> — <cliente>"', () => {
        expect(codigoDoProdutoDoOrcamento(7)).toBe('IA-7')
        expect(nomeDoProdutoDoOrcamento(7, '  Augusto Anschau ')).toBe('Orçamento I.A. Nº 7 — Augusto Anschau')
    })
})
