import { medidaDoArremateNaMedidaDoVao, separarComuns } from '@/lib/atendimentos-ia/escolhas-comuns'

describe('0049 — o que é igual em todas as esquadrias vai UMA vez', () => {
    it('comum = a parte que todo item COM partes traz; o item sem partes não desfaz o comum e fica vazio', () => {
        expect(separarComuns([['a', 'x'], [], ['a', 'y']])).toEqual({ comuns: ['a'], doItem: [['x'], [], ['y']] })
    })
    it('nenhum item com partes: nada comum', () => {
        expect(separarComuns([[], []])).toEqual({ comuns: [], doItem: [[], []] })
    })
    it('um item só: tudo é comum e o item fica sem nada', () => {
        expect(separarComuns([['a', 'b']])).toEqual({ comuns: ['a', 'b'], doItem: [[]] })
    })
    it('parte com o mesmo nome e valor diferente NÃO é comum', () => {
        expect(separarComuns([['arremate interno: 65 mm'], ['arremate interno: 70 mm']]).comuns).toEqual([])
    })
})

describe('0049 — o texto diz o que o cálculo faz com a política da medida do vão', () => {
    it('MAE: externo, com o corte do próprio rótulo; MAI: interno; sem corte no rótulo, nenhum corte inventado', () => {
        expect(medidaDoArremateNaMedidaDoVao('MAE', 'MEDIDA ARREMATE EXTERNO', 'VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]')).toBe('arremate externo na medida do vão, corte 90/90')
        expect(medidaDoArremateNaMedidaDoVao('MAI', 'MEDIDA ARREMATE INTERNO', 'MEDIDA DO VÃO (CORTE 45/45)')).toBe('arremate interno na medida do vão, corte 45/45')
        expect(medidaDoArremateNaMedidaDoVao('MAE', 'MEDIDA ARREMATE EXTERNO', null)).toBe('arremate externo na medida do vão')
    })
    it('outra variável não é de medida do arremate: nulo', () => {
        expect(medidaDoArremateNaMedidaDoVao('ARI', 'ARREMATE INTERNO', 'BZ1770 - ARREMATE 70MM')).toBeNull()
    })
})
