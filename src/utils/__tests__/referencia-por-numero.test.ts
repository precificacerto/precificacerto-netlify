import { fraseDoNumeroInexistente, fraseDoResumoDoLevantamento, nomeDoOrcamento, referenciaPorNumero } from '@/lib/atendimentos-ia/referencia-por-numero'

describe('0050 — reconhecer a referência por número', () => {
    it.each([
        ['levantamento 13', { tipo: 'levantamento', numero: 13 }],
        ['atualizar levantamento 13', { tipo: 'levantamento', numero: 13 }],
        ['Finalizar o levantamento nº 13 por favor', { tipo: 'levantamento', numero: 13 }],
        ['fechar levantamento 31', { tipo: 'levantamento', numero: 31 }],
        ['gerar orçamento do levantamento 31', { tipo: 'levantamento', numero: 31 }],
        ['recalcular orçamento 14', { tipo: 'orcamento', numero: 14 }],
        ['Orçamento 14', { tipo: 'orcamento', numero: 14 }],
        ['abrir orçamento número 14', { tipo: 'orcamento', numero: 14 }],
    ])('%s → referência', (texto, esperado) => {
        expect(referenciaPorNumero(texto)).toEqual(esperado)
    })

    it.each([
        ['levantamento 13: janela de correr 1200 x 1000'],
        ['levantamento 13 item 2 cor preto'],
        ['no levantamento 13 troca o vidro para 8 mm'],
        ['janela de correr 1500 x 1200'],
        ['quero um levantamento novo'],
        ['sim'],
        ['levantamento 13 e 14'],
        ['levantamento 13 troca a cor para preto'],
    ])('%s → não é referência pura', (texto) => {
        expect(referenciaPorNumero(texto)).toBeNull()
    })
})

describe('0050 — as frases', () => {
    it('inexistente: diz que não existe e lista os cinco últimos, com número e nome', () => {
        const ultimos = [31, 30, 29, 28, 27, 26].map((n) => ({ tipo: 'levantamento' as const, numero: n, nome: `Cliente ${n}` }))
        const f = fraseDoNumeroInexistente({ tipo: 'levantamento', numero: 99 }, ultimos)
        expect(f).toContain('Não existe o levantamento 99')
        expect(f.split('\n').filter((l) => l.startsWith('levantamento '))).toHaveLength(5)
        expect(f).toContain('levantamento 31 (Cliente 31)')
        expect(f).not.toContain('levantamento 26')
        expect(fraseDoNumeroInexistente({ tipo: 'orcamento', numero: 99 }, [])).toContain('ainda não tem orçamentos')
    })
    it('o resumo: levantamento N (nome), itens e cor — uma ou várias', () => {
        expect(fraseDoResumoDoLevantamento({ numero: 31, nome: 'Marcelo e rita preto liso' }, { total: 11, cores: ['Preto Liso'] })).toBe('Levantamento 31 (Marcelo e rita preto liso): 11 itens, cor Preto Liso.')
        expect(fraseDoResumoDoLevantamento({ numero: 1, nome: 'A' }, { total: 1, cores: [] })).toBe('Levantamento 1 (A): 1 item.')
        expect(fraseDoResumoDoLevantamento({ numero: 2, nome: 'B' }, { total: 3, cores: ['Branco', 'Preto'] })).toContain('cores Branco, Preto')
    })
    it('o orçamento, com o número exibido quando difere', () => {
        expect(nomeDoOrcamento({ numero: 14, numeroExibido: '31-PVC' })).toBe('orçamento 14 (31-PVC)')
        expect(nomeDoOrcamento({ numero: 14, numeroExibido: '14' })).toBe('orçamento 14')
    })
})
