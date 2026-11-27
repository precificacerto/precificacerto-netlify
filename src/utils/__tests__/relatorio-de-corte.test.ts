/**
 * O RELATÓRIO DE CORTE (dono do produto, 16/11/2026): por código, as peças a cortar e o plano de barras com a barra e a serra GRAVADAS.
 */
import { corteDoCodigo, fraseDaCorDivergente, fraseDaBarraDivergente, fraseDaSerraDivergente, fraseDoCodigoSemBarra, montarRelatorioDeCorte, type PecaDoCorte } from '@/lib/atendimentos-ia/relatorio-de-corte'

const p = (comprimento_mm: number, quantidade: number, extra: Partial<PecaDoCorte> = {}): PecaDoCorte => ({
    perfil: 'SF66/WOLFF', codigo: '9681', descricao: 'SF66 - FOLHA', comprimento_mm, quantidade_por_esquadria: quantidade, quantidade,
    corte: '45S/45S', posicao: 'Largura', comprimento_barra_mm: 6000, serra_mm: 5, cor: 'BRANCO', ...extra,
})

describe('corteDoCodigo', () => {
    it('soma as peças iguais (comprimento, corte e posição) entre os itens, da maior para a menor', () => {
        const c = corteDoCodigo([p(1215.5, 2), p(1100, 2, { posicao: 'Altura' }), p(1215.5, 2), p(1215.5, 2, { corte: '90/90' })])
        expect(c.linhas).toEqual([
            { comprimento_mm: 1215.5, corte: '45S/45S', posicao: 'Largura', quantidade: 4 },
            { comprimento_mm: 1215.5, corte: '90/90', posicao: 'Largura', quantidade: 2 },
            { comprimento_mm: 1100, corte: '45S/45S', posicao: 'Altura', quantidade: 2 },
        ])
    })
    it('o plano de barras sai pelo agrupador, com a barra e a serra gravadas', () => {
        // 4 peças de 2.000 numa barra de 6.000 com serra de 5: 2 por barra (2.000 + 5 + 2.000 + 5 + 2.000 = 6.010 não cabe) -> 2 barras
        const c = corteDoCodigo([p(2000, 4)])
        expect('semPlano' in c.plano).toBe(false)
        if ('semPlano' in c.plano) return
        expect([c.plano.barra_mm, c.plano.serra_mm, c.plano.n_barras]).toEqual([6000, 5, 2])
        expect(c.plano.barras.map((b) => b.pecas_mm)).toEqual([[2000, 2000], [2000, 2000]])
        // a serra conta: com serra zero, 3 peças cabem na barra
        const sem = corteDoCodigo([p(2000, 4, { serra_mm: 0 })])
        expect('semPlano' in sem.plano ? null : sem.plano.n_barras).toBe(2)
        if (!('semPlano' in sem.plano)) expect(sem.plano.barras[0].pecas_mm).toEqual([2000, 2000, 2000])
    })
    it('sem barra gravada (código sem preço): as peças ficam, o plano não, e a frase diz por quê', () => {
        const c = corteDoCodigo([p(1000, 1, { comprimento_barra_mm: null })])
        expect(c.linhas).toHaveLength(1)
        expect(c.plano).toEqual({ semPlano: fraseDoCodigoSemBarra('9681') })
    })
    it('barras ou serras diferentes entre os itens: nenhuma é escolhida, e o plano não sai', () => {
        expect(corteDoCodigo([p(1000, 1), p(900, 1, { comprimento_barra_mm: 5800 })]).plano).toEqual({ semPlano: fraseDaBarraDivergente('9681', [5800, 6000]) })
        expect(corteDoCodigo([p(1000, 1), p(900, 1, { serra_mm: 3 })]).plano).toEqual({ semPlano: fraseDaSerraDivergente('9681', [3, 5]) })
        expect(fraseDaBarraDivergente('9681', [5800, 6000])).toBe('o código 9681 foi calculado com barras diferentes nos itens (5800 mm, 6000 mm): recalcule o orçamento para um plano só')
    })
})

describe('montarRelatorioDeCorte', () => {
    it('um bloco por código, nas categorias da base de conhecimento, na ordem dela; sem categoria e ambíguo à parte', () => {
        const pecas = [p(1000, 1), p(500, 2, { codigo: '8427', perfil: 'SF92R', descricao: 'REFORÇO' }), p(300, 1, { codigo: 'X' }), p(200, 1, { codigo: 'Y' })]
        const cats = new Map([['9681', ['PERFIL']], ['8427', ['REFORCO']], ['Y', ['PERFIL', 'REFORCO']]])
        const r = montarRelatorioDeCorte(pecas, cats, ['PERFIL', 'REFORCO'], new Map([['PERFIL', 'Perfil'], ['REFORCO', 'Reforço']]))
        expect(r.categorias.map((c) => [c.rotulo, c.codigos.map((x) => x.codigo)])).toEqual([['Perfil', ['9681']], ['Reforço', ['8427']]])
        expect(r.semCategoria.map((c) => c.codigo)).toEqual(['X'])
        expect(r.ambiguos.map((c) => [c.codigo, c.categorias])).toEqual([['Y', ['PERFIL', 'REFORCO']]])
    })
})

describe('pedido 0034: o plano do relatório de corte é o das barras do pedido — o refilo pela cor do item', () => {
    it('a cor decide o refilo: 3 × 1.970 cabem numa barra branca e numa preta lisa, não numa amadeirada (45 mm por ponta)', () => {
        const branca = corteDoCodigo([p(1970, 3)]).plano
        const preta = corteDoCodigo([p(1970, 3, { cor: 'PRETO LISO' })]).plano
        const madeira = corteDoCodigo([p(1970, 3, { cor: 'AMADEIRADO GOLDEN OAK' })]).plano
        expect('n_barras' in branca && branca.n_barras).toBe(1)
        expect('n_barras' in preta && preta.n_barras).toBe(1)
        expect('n_barras' in madeira && madeira.n_barras).toBe(2)
    })
    it('o mesmo código em itens de cores diferentes não tem um plano só: nomeado', () => {
        expect(corteDoCodigo([p(1000, 1), p(900, 1, { cor: 'PRETO' })]).plano).toEqual({ semPlano: fraseDaCorDivergente('9681', ['BRANCO', 'PRETO']) })
        // a mesma cor em outra caixa é a mesma cor
        expect('n_barras' in corteDoCodigo([p(1000, 1), p(900, 1, { cor: 'branco' })]).plano).toBe(true)
    })
})
