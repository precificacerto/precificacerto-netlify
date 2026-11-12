/**
 * PORTÃO — AS ABAS INSUMOS E VIDROS no avaliador (dono do produto, 12/11/2026, o comando único): o insumo sai com o código e a quantidade (a
 * fórmula e a condição na mesma gramática dos perfis); o pano de vidro, com a largura e a altura pelas fórmulas do motor (LVID, HVID) e a
 * quantidade. A linha que não se avalia é FALTA nomeada — não recusa a tipologia, e o resto dela sai.
 */
import { avaliarTipologia, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'

const tipologia = (extra: Partial<Tipologia> = {}): Tipologia => ({
    codigo: 'T-1',
    detalhe: { larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null },
    variaveis: [],
    formulas: [{ variavel: 'LVID', formula: 'L-147' }, { variavel: 'HVID', formula: 'H-100' }] as never,
    perfis: [{ perfil: 'P/WOLFF', descricao: 'PEÇA', corte: '90/90', qtd: '1', medida: 'L', posicao: 'Largura', esp_vidro: null, condicao: 'sempre' }],
    validacoes: [],
    ...extra,
})
const ok = (t: Tipologia) => {
    const r = avaliarTipologia({ tipologia: t, L_mm: 1200, H_mm: 1000 })
    if ('recusas' in r) throw new Error(r.recusas.map((x) => x.mensagem).join(' | '))
    return r
}

describe('os insumos', () => {
    it('o código, a descrição e a quantidade pela fórmula; a condição falsa e a quantidade zero não entram', () => {
        const r = ok(tipologia({ insumos: [
            { insumo: '10457', descricao: 'ROLDANA', qtd: '4', condicao: 'sempre' },
            { insumo: '9074/WOLFF', descricao: 'BOTÃO', qtd: 'L/300', condicao: 'sempre' },
            { insumo: 'X1', descricao: 'NÃO ENTRA', qtd: '2', condicao: 'L>5000' },
            { insumo: 'X2', descricao: 'ZERO', qtd: '0', condicao: 'sempre' },
        ] }))
        expect(r.insumos).toEqual([{ codigo: '10457', descricao: 'ROLDANA', quantidade: 4 }, { codigo: '9074/WOLFF', descricao: 'BOTÃO', quantidade: 4 }])
        expect(r.faltas).toEqual([])
    })
    it('a linha que não se avalia é FALTA nomeada, com a aba, a linha e o código — e os perfis e os outros insumos saem', () => {
        const r = ok(tipologia({ insumos: [{ insumo: 'Q1', descricao: null, qtd: 'NAOEXISTE*2', condicao: 'sempre' }, { insumo: 'Q2', descricao: null, qtd: '1', condicao: 'sempre' }] }))
        expect(r.faltas.map((f) => [f.aba, f.linha, f.codigo])).toEqual([['Insumos', 1, 'Q1']])
        expect(r.faltas[0].mensagem).toMatch(/^Linha 1 da aba Insumos \(Q1\): /)
        expect(r.insumos.map((i) => i.codigo)).toEqual(['Q2'])
        expect(r.pecas.length).toBe(1)
    })
    it('a quantidade negativa é falta, nunca zero', () => {
        const r = ok(tipologia({ insumos: [{ insumo: 'N', descricao: null, qtd: '0-2', condicao: 'sempre' }] }))
        expect(r.faltas[0].mensagem).toContain('a quantidade "0-2" dá -2')
    })
})

describe('os vidros', () => {
    it('o pano pelas fórmulas do motor: LVID = L − 147, HVID = H − 100, e a quantidade', () => {
        const r = ok(tipologia({ vidros: [{ vidro: 'VIDRO', largura: 'LVID', altura: 'HVID', qtd: '2', fixacao: 'BAGUETE', condicao: 'sempre' }] }))
        expect(r.vidros).toEqual([{ vidro: 'VIDRO', largura_mm: 1053, altura_mm: 900, quantidade: 2, fixacao: 'BAGUETE' }])
    })
    it('a quantidade que não é inteira, e o pano de medida zero ou negativa, são falta nomeada', () => {
        const r = ok(tipologia({ vidros: [
            { vidro: 'V1', largura: 'LVID', altura: 'HVID', qtd: '1.5', fixacao: null, condicao: 'sempre' },
            { vidro: 'V2', largura: 'L-2000', altura: 'HVID', qtd: '1', fixacao: null, condicao: 'sempre' },
        ] }))
        expect(r.vidros).toEqual([])
        expect(r.faltas.map((f) => [f.aba, f.codigo])).toEqual([['Vidros', 'V1'], ['Vidros', 'V2']])
        expect(r.faltas[0].mensagem).toContain('não é um inteiro positivo')
        expect(r.faltas[1].mensagem).toContain('não há vidro de medida zero ou negativa')
    })
    it('sem as abas, nenhum insumo e nenhum vidro — e nenhuma falta', () => {
        const r = ok(tipologia())
        expect([r.insumos, r.vidros, r.faltas]).toEqual([[], [], []])
    })
})
