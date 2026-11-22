/**
 * AS BARRAS DO PEDIDO (dono do produto, 22/11/2026). O plano por perfil + cor, FFD best-fit, serra por corte (inclusive o último), refilo de
 * 45 mm por ponta em toda cor menos o BRANCO, barra do perfil gravada; e a prova sobre as peças REAIS do orçamento 12.
 */
import fixture from './fixtures/pecas-do-orcamento-12.json'
import {
    COR_SEM_REFILO, fraseDaPecaQueNaoCabe, fraseDasBarrasDivergentes, fraseDasSerrasDivergentes, fraseDoPerfilSemBarra,
    montarBarrasDoPedido, pesosDosCodigos, planoDoPerfil, refiloDaCor, type PecaDoPedido, type PlanoDoPerfil,
} from '@/lib/atendimentos-ia/barras-do-pedido'

const peca = (o: Partial<PecaDoPedido> & { comprimento_mm: number }): PecaDoPedido => ({
    codigo: '9681', perfil: 'SF66/WOLFF', descricao: 'FOLHA PARA JANELA', quantidade: 1, corte: '45S/45S', posicao: 'Largura',
    comprimento_barra_mm: 1000, serra_mm: 0, item: 1, tipologia: 'DP-02', cor: 'Branco', ...o,
})
const plano = (r: ReturnType<typeof planoDoPerfil>) => { if ('motivo' in r) throw new Error(r.motivo); return r as PlanoDoPerfil }
const medidas = (p: PlanoDoPerfil) => p.barras.map((b) => b.fracoes.map((f) => f.comprimento_mm))

describe('o algoritmo: FFD best-fit', () => {
    it('cada corte vai na barra aberta com a MENOR sobra que o comporte — não na primeira (720, 410, 380, 50 numa barra de 1000)', () => {
        const p = plano(planoDoPerfil([720, 410, 380, 50].map((c) => peca({ comprimento_mm: c })), null))
        // o first fit poria o 50 na barra 1 (sobra 280); o best-fit o põe na barra 2 (sobra 210)
        expect(medidas(p)).toEqual([[720], [410, 380, 50]])
        expect(p.barras.map((b) => b.sobra_mm)).toEqual([280, 160])
    })
    it('empate de sobra: vai na barra aberta PRIMEIRO (600, 600, 300 numa barra de 1000)', () => {
        expect(medidas(plano(planoDoPerfil([600, 600, 300].map((c) => peca({ comprimento_mm: c })), null)))).toEqual([[600, 300], [600]])
    })
    it('do maior para o menor, qualquer que seja a ordem de entrada; nenhuma comporta, barra nova', () => {
        const a = plano(planoDoPerfil([300, 900, 600].map((c) => peca({ comprimento_mm: c })), null))
        const b = plano(planoDoPerfil([600, 300, 900].map((c) => peca({ comprimento_mm: c })), null))
        expect(medidas(a)).toEqual([[900], [600, 300]])
        expect(medidas(b)).toEqual(medidas(a))
    })
    it('a quantidade vira cortes um a um, cada um com o item e a tipologia de origem', () => {
        const p = plano(planoDoPerfil([peca({ comprimento_mm: 400, quantidade: 2, item: 3, tipologia: 'DP-07', corte: '90/90' })], null))
        expect(p.barras[0].fracoes).toEqual([
            { comprimento_mm: 400, corte: '90/90', posicao: 'Largura', item: 3, tipologia: 'DP-07' },
            { comprimento_mm: 400, corte: '90/90', posicao: 'Largura', item: 3, tipologia: 'DP-07' },
        ])
    })
})

describe('a serra: por corte, INCLUSIVE o último da barra', () => {
    it('cada peça consome o comprimento mais a serra: duas de 495 com serra 5 fecham a barra de 1000 com sobra 0', () => {
        const p = plano(planoDoPerfil([495, 495].map((c) => peca({ comprimento_mm: c, serra_mm: 5 })), null))
        expect(p.n_barras).toBe(1)
        expect(p.barras[0]).toMatchObject({ serra_mm: 10, usado_mm: 1000, sobra_mm: 0 })
    })
    it('o último corte conta mesmo sem sobra: duas de 500 com serra 5 NÃO cabem numa barra de 1000', () => {
        expect(plano(planoDoPerfil([500, 500].map((c) => peca({ comprimento_mm: c, serra_mm: 5 })), null)).n_barras).toBe(2)
    })
    it('a peça do tamanho da barra não cabe com o corte: sem plano, nomeado', () => {
        expect(planoDoPerfil([peca({ comprimento_mm: 1000, serra_mm: 5 })], null)).toMatchObject({ motivo: fraseDaPecaQueNaoCabe('9681', 1000, 1000, 5) })
    })
    it('serras diferentes no mesmo perfil: sem plano, nomeado', () => {
        expect(planoDoPerfil([peca({ comprimento_mm: 100, serra_mm: 5 }), peca({ comprimento_mm: 100, serra_mm: 4 })], null))
            .toMatchObject({ motivo: fraseDasSerrasDivergentes('9681', [4, 5]) })
    })
})

describe('o refilo (PO, 22/11/2026): 45 mm por ponta em TODA cor, menos o BRANCO — pela exceção, não por lista', () => {
    it('o branco aproveita a barra inteira; amadeirada, EXTERNO (uma face colorida) e qualquer outra levam 45 mm por ponta', () => {
        expect(refiloDaCor('Branco')).toBe(0)
        expect(refiloDaCor(' branco ')).toBe(0)
        expect(refiloDaCor('AMADEIRADO GOLDEN OAK')).toBe(45)
        expect(refiloDaCor('EXTERNO GOLDEN OAK')).toBe(45)
        expect(refiloDaCor('EXTERNO PRETO TEXTURADO')).toBe(45)
        expect(refiloDaCor('Grafite')).toBe(45)
        expect(refiloDaCor('Cor Nova Que O Fornecedor Lançou')).toBe(45)
        expect(COR_SEM_REFILO).toBe('BRANCO')
    })
    it('um nome COMPOSTO com BRANCO ("EXTERNO BRANCO") não é decidido: o PO decide antes; e a cor ausente também não', () => {
        expect(refiloDaCor('EXTERNO BRANCO')).toMatchObject({ motivo: expect.stringContaining('nome composto') })
        expect(refiloDaCor('BRANCO NEVE')).toMatchObject({ motivo: expect.stringContaining('nome composto') })
        expect(refiloDaCor(null)).toMatchObject({ motivo: expect.stringContaining('não tem a cor do perfil') })
        expect(refiloDaCor('  ')).toMatchObject({ motivo: expect.any(String) })
        expect(planoDoPerfil([peca({ comprimento_mm: 100, cor: 'EXTERNO BRANCO' })], null)).toMatchObject({ motivo: expect.stringContaining('9681: a cor "EXTERNO BRANCO"') })
        expect(planoDoPerfil([peca({ comprimento_mm: 100, cor: null })], null)).toMatchObject({ motivo: expect.stringContaining('9681: o item não tem a cor') })
    })
    it('com refilo (amadeirada), 910 + serra 0 cabe na barra de 1000 e 911 não; no branco, 1000 cabe', () => {
        const madeira = (c: number) => planoDoPerfil([peca({ comprimento_mm: c, cor: 'AMADEIRADO NOGUEIRA' })], null)
        expect(plano(madeira(910))).toMatchObject({ refilo_mm: 45, barras: [{ sobra_mm: 0 }] })
        expect(madeira(911)).toMatchObject({ motivo: fraseDaPecaQueNaoCabe('9681', 911, 910, 0) })
        expect(plano(planoDoPerfil([peca({ comprimento_mm: 1000 })], null))).toMatchObject({ refilo_mm: 0, barras: [{ sobra_mm: 0 }] })
    })
    it('EXTERNO GOLDEN OAK: a sobra da barra é a da barra útil (1000 − 90); a sobra do perfil (comprado − peças) inclui o refilo', () => {
        const p = plano(planoDoPerfil([peca({ comprimento_mm: 800, cor: 'EXTERNO GOLDEN OAK' })], null))
        expect([p.refilo_mm, p.barras[0].sobra_mm, p.sobra_mm]).toEqual([45, 110, 200])
    })
})

describe('a barra: a do perfil, gravada — nunca 6000 fixo', () => {
    it('a barra de 5500 do IL50 é usada como está', () => {
        expect(plano(planoDoPerfil([peca({ comprimento_mm: 2212, quantidade: 3, comprimento_barra_mm: 5500, serra_mm: 5 })], null)))
            .toMatchObject({ barra_mm: 5500, n_barras: 2 })
    })
    it('sem barra, ou barras diferentes no mesmo perfil: sem plano, nomeado', () => {
        expect(planoDoPerfil([peca({ comprimento_mm: 100, comprimento_barra_mm: null })], null)).toMatchObject({ motivo: fraseDoPerfilSemBarra('9681') })
        expect(planoDoPerfil([peca({ comprimento_mm: 100 }), peca({ comprimento_mm: 100, comprimento_barra_mm: 6000 })], null))
            .toMatchObject({ motivo: fraseDasBarrasDivergentes('9681', [1000, 6000]) })
    })
})

describe('o agrupamento: perfil + cor, todas as esquadrias juntas', () => {
    it('o mesmo código em duas cores são dois planos; dois itens da mesma cor dividem barra', () => {
        const r = montarBarrasDoPedido([
            peca({ comprimento_mm: 400, item: 1 }), peca({ comprimento_mm: 400, item: 2 }), peca({ comprimento_mm: 400, item: 3, cor: 'Preto' }),
        ], new Map())
        expect(r.perfis.map((p) => [p.cor, p.n_barras, p.n_fracoes])).toEqual([['Branco', 1, 2], ['Preto', 1, 1]])
        expect(r.perfis[0].barras[0].fracoes.map((f) => f.item)).toEqual([1, 2])
    })
})

describe('o peso e o aproveitamento', () => {
    it('peso bruto = barras compradas × kg/m; líquido = peças × kg/m; aproveitamento = peças ÷ comprado', () => {
        const p = plano(planoDoPerfil([600, 300].map((c) => peca({ comprimento_mm: c })), 2))
        expect([p.metros_comprados, p.metros_uteis, p.peso_bruto_kg, p.peso_liquido_kg, p.aproveitamento_pct]).toEqual([1, 0.9, 2, 1.8, 90])
    })
    it('sem peso: o peso não sai (nulo, nunca zero), e o total de peso também não', () => {
        const r = montarBarrasDoPedido([peca({ comprimento_mm: 100 }), peca({ codigo: 'X', comprimento_mm: 100 })], new Map([['9681', 1]]))
        expect(r.perfis.find((p) => p.codigo === 'X')).toMatchObject({ peso_kg_m: null, peso_bruto_kg: null, peso_liquido_kg: null })
        expect(r.total).toMatchObject({ peso_bruto_kg: null, peso_liquido_kg: null })
    })
    it('o peso do código vem da linha COM barra e peso; o mesmo código em ferragem (UN, sem peso) não conta; dois pesos, nenhum', () => {
        const m = pesosDosCodigos([
            { codigo: '8428', peso: null, medida_barra_m: null }, { codigo: '8428', peso: 0.7, medida_barra_m: 6 },
            { codigo: '10511', peso: 0.095, medida_barra_m: 6 }, { codigo: '10511', peso: 0.095, medida_barra_m: 6 },
            { codigo: 'D', peso: 1, medida_barra_m: 6 }, { codigo: 'D', peso: 2, medida_barra_m: 6 },
            { codigo: 'Z', peso: 0, medida_barra_m: 6 },
            { codigo: 'U', peso: 0.5, medida_barra_m: null },
        ])
        expect([...m].sort()).toEqual([['10511', 0.095], ['8428', 0.7]])
    })
    it('pedido sem peça: nenhuma barra, aproveitamento nulo (não 0%)', () => {
        expect(montarBarrasDoPedido([], new Map()).total).toEqual({ n_barras: 0, metros_uteis: 0, metros_comprados: 0, aproveitamento_pct: null, peso_bruto_kg: null, peso_liquido_kg: null })
    })
})

describe('o orçamento 12 REAL (as peças gravadas, lidas em 22/11/2026)', () => {
    const pecas: PecaDoPedido[] = fixture.linhas.split(';').map((l) => {
        const [codigo, c, q, corte, posicao, barra, item, tipologia] = l.split('|')
        return { codigo, perfil: codigo, descricao: null as string | null, comprimento_mm: Number(c), quantidade: Number(q), corte, posicao, comprimento_barra_mm: Number(barra), serra_mm: 5, item: Number(item), tipologia, cor: 'Branco' }
    })
    const r = montarBarrasDoPedido(pecas, new Map(Object.entries(fixture.pesos_kg_m)))
    it('464 peças, 25 perfis, nenhum sem plano; 24 em barra de 6000 e um (9701, IL50) em 5500', () => {
        expect(pecas.reduce((s, p) => s + p.quantidade, 0)).toBe(464)
        expect([r.perfis.length, r.semPlano.length]).toEqual([25, 0])
        expect(r.perfis.reduce((s, p) => s + p.n_fracoes, 0)).toBe(464)
        expect(r.perfis.filter((p) => p.barra_mm === 5500).map((p) => p.codigo)).toEqual(['9701'])
    })
    it('o total: 99 barras, 498,282 m de peças em 592,5 m comprados (84,1%), 366,79 kg brutos e 299,57 kg líquidos', () => {
        expect(r.total.n_barras).toBe(99)
        expect(r.total.metros_uteis).toBeCloseTo(498.282, 6)
        expect(r.total.metros_comprados).toBeCloseTo(592.5, 6)
        expect(r.total.aproveitamento_pct).toBeCloseTo(84.098, 3)
        expect(r.total.peso_bruto_kg).toBeCloseTo(366.789, 3)
        expect(r.total.peso_liquido_kg).toBeCloseTo(299.567, 3)
    })
    it('o 1023: as quatro de 4646 vão sozinhas (sobra 1349) e as quatro de 1495 fecham a barra (sobra 0)', () => {
        const p = r.perfis.find((x) => x.codigo === '1023') as PlanoDoPerfil
        expect(medidas(p)).toEqual([[4646], [4646], [4646], [4646], [1495, 1495, 1495, 1495]])
        expect(p.barras.map((b) => b.sobra_mm)).toEqual([1349, 1349, 1349, 1349, 0])
        expect(p.barras[0].fracoes[0]).toMatchObject({ item: 6, tipologia: 'DP-72', corte: '90/90' })
    })
    it('toda barra respeita a barra útil: frações + serra + sobra = barra', () => {
        for (const p of r.perfis) for (const b of p.barras) {
            expect(Math.round((b.fracoes.reduce((s, f) => s + f.comprimento_mm, 0) + b.serra_mm + b.sobra_mm) * 1000)).toBe(p.barra_mm * 1000)
            expect(b.sobra_mm).toBeGreaterThanOrEqual(0)
        }
    })
})
