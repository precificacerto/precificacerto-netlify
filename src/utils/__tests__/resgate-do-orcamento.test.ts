/**
 * PORTÃO — OS DOIS CAMINHOS DO RESGATE (dono do produto, 18/11/2026): o pedido dito ("orçamento" ou "levantamento"), e o DESEMPATE que afunila
 * com o que já tem — a cidade, a data, o valor (com a família quando ela separa); no levantamento, a família e a quantidade de itens. Nunca o
 * endereço perguntado; o critério que nenhuma opção tem não aparece.
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
import { CRITERIOS_DO_ORCAMENTO, criteriosQueSeparam, fraseDeQualOrcamento, listaDosOrcamentos, ordemDoOrcamento, pedidoDoResgate, type OpcaoDoOrcamento } from '@/lib/atendimentos-ia/resgate-do-orcamento'

const orc = (numero: number, sobre: Partial<OpcaoDoOrcamento> = {}): OpcaoDoOrcamento => ({
    orcamentoId: `o${numero}`, levantamentoId: `l${numero}`, numero, nome: 'Ana Souza', criado_em: '2026-11-10T15:00:00.000Z', cidade: null, valor: 1000, familias: ['PVC Wolf'], ...sobre,
})
const nomes = (cs: ReturnType<typeof criteriosQueSeparam>) => cs.map((c) => c.nome)

describe('o pedido dito: "orçamento" ou "levantamento", só uma das palavras', () => {
    it.each([
        ['quero o orçamento do Jorge Koss', 'orcamento'], ['me manda o orcamento da Ana', 'orcamento'], ['os orçamentos da Ana', 'orcamento'],
        ['continua o levantamento da Ana', 'levantamento'], ['Levantamento Casa do João', 'levantamento'],
        ['o levantamento e o orçamento da Ana', null], ['Ana', null], ['orçamentista', null],
    ])('%s → %s', (texto, esperado) => expect(pedidoDoResgate(texto)).toBe(esperado))
})

describe('o desempate do orçamento: cidade → data → valor (+ família, quando separa)', () => {
    it('as cidades separam: só a cidade', () => {
        expect(nomes(criteriosQueSeparam([orc(1, { cidade: 'Sapiranga' }), orc(2, { cidade: 'Novo Hamburgo' })], CRITERIOS_DO_ORCAMENTO))).toEqual(['cidade'])
    })
    it('a mesma cidade: a data entra', () => {
        expect(nomes(criteriosQueSeparam([orc(1, { cidade: 'Sapiranga' }), orc(2, { cidade: 'Sapiranga', criado_em: '2026-11-12T15:00:00.000Z' })], CRITERIOS_DO_ORCAMENTO))).toEqual(['cidade', 'data'])
    })
    it('a mesma cidade e a mesma data: o valor entra, e a família junto quando ela separa', () => {
        const a = [orc(1, { cidade: 'Sapiranga' }), orc(2, { cidade: 'Sapiranga', valor: 2000, familias: ['Alumínio'] })]
        expect(nomes(criteriosQueSeparam(a, CRITERIOS_DO_ORCAMENTO))).toEqual(['cidade', 'valor', 'familia'])
        const b = [orc(1, { cidade: 'Sapiranga' }), orc(2, { cidade: 'Sapiranga', valor: 2000 })]
        expect(nomes(criteriosQueSeparam(b, CRITERIOS_DO_ORCAMENTO))).toEqual(['cidade', 'valor'])
    })
    it('a cidade já separa: a família não aparece, mesmo diferente — ela só entra junto do valor', () => {
        expect(nomes(criteriosQueSeparam([orc(1, { cidade: 'Sapiranga' }), orc(2, { cidade: 'Novo Hamburgo', familias: ['Alumínio'] })], CRITERIOS_DO_ORCAMENTO))).toEqual(['cidade'])
    })
    it('sem cidade em nenhuma: começa pela data — a cidade não informada não aparece', () => {
        expect(nomes(criteriosQueSeparam([orc(1), orc(2, { criado_em: '2026-11-12T15:00:00.000Z' })], CRITERIOS_DO_ORCAMENTO))).toEqual(['data'])
    })
    it('o que não separa não entra: o mesmo valor depois da mesma data não aparece', () => {
        expect(nomes(criteriosQueSeparam([orc(1, { cidade: 'Sapiranga' }), orc(2, { cidade: 'Sapiranga' })], CRITERIOS_DO_ORCAMENTO))).toEqual(['cidade'])
    })
})

describe('a lista: do mais recente ao mais antigo, com o número e o que separa', () => {
    it('a ordem e a frase', () => {
        const lista = ordemDoOrcamento([orc(12, { cidade: 'Sapiranga', criado_em: '2026-11-01T15:00:00.000Z' }), orc(15, { cidade: 'Novo Hamburgo', criado_em: '2026-11-15T15:00:00.000Z' })])
        expect(lista.map((o) => o.numero)).toEqual([15, 12])
        expect(listaDosOrcamentos(lista)).toBe('1) Ana Souza, nº 15 — Novo Hamburgo\n2) Ana Souza, nº 12 — Sapiranga')
        expect(fraseDeQualOrcamento('Ana', lista)).toBe('Achei 2 orçamentos de “Ana”:\n1) Ana Souza, nº 15 — Novo Hamburgo\n2) Ana Souza, nº 12 — Sapiranga\nQual deles eu te mando?')
        expect(fraseDeQualOrcamento('Ana', lista).toLowerCase()).not.toContain('endereço')
    })
    it('a mesma data: o número desempata a ordem', () => {
        expect(ordemDoOrcamento([orc(3), orc(7), orc(5)]).map((o) => o.numero)).toEqual([7, 5, 3])
    })
    it('o valor em reais, no padrão brasileiro', () => {
        expect(listaDosOrcamentos([orc(1, { valor: 12345.6 }), orc(2, { valor: 999 })])).toBe('1) Ana Souza, nº 1 — 10/11/2026, R$ 12.345,60\n2) Ana Souza, nº 2 — 10/11/2026, R$ 999,00'.replace(/, R/g, ' · R'))
    })
})
