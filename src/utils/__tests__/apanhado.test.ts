/**
 * @jest-environment node
 */
/**
 * PORTÃO — o APANHADO (`src/lib/atendimentos-ia/apanhado.ts`), as funções puras. O caminho inteiro, pela rota,
 * está em `atendimentos-ia-levantamento-por-nome.test.ts` (17).
 */
import { arremateDaColeta, rotuloSemCodigo } from '@/lib/atendimentos-ia/apanhado'
import type { VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'

/** As opções de ARI, ARE e MAE MEDIDAS em produção em 26/10/2026, nas 161 tipologias da Wolff: todos os rótulos distintos. */
const REAIS: Array<[string, string, string]> = [
    ['BZ0006 - ARREMATE 65MM [33,00]', 'ARREMATE INTERNO', '65 mm'],
    ['BZ0006 - ARREMATE 65MM [48,00]', 'ARREMATE INTERNO', '65 mm'],
    ['BZ0006 - ARREMATE 65MM [39,00]', 'ARREMATE INTERNO', '65 mm'],
    ['BZ1770 - ARREMATE 70MM [33,00]', 'ARREMATE INTERNO', '70 mm'],
    ['BZ1770 - ARREMATE 70MM [50,00]', 'ARREMATE INTERNO', '70 mm'],
    ['BZ0010 - ARREMATE 20MM', 'ARREMATE INTERNO', '20 mm'],
    ['SEM ARREMATE INTERNO', 'ARREMATE INTERNO', 'sem arremate interno'],
    ['BZ0010 - ARREMATE 20MM', 'ARREMATE EXTERNO', '20 mm'],
    ['SEM ARREMATE EXTERNO', 'ARREMATE EXTERNO', 'sem arremate externo'],
    ['VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]', 'MEDIDA ARREMATE EXTERNO', 'vão + 50 mm'],
    ['VÃO+100MM (CORTE 90/90) - PARA AJUSTE EM OBRA [100,00]', 'MEDIDA ARREMATE EXTERNO', 'vão + 100 mm'],
    ['MEDIDA DO VÃO (CORTE 45/45)', 'MEDIDA ARREMATE EXTERNO', 'medida do vão'],
    ['MEDIDA DO VÃO (CORTE 45)', 'MEDIDA ARREMATE EXTERNO', 'medida do vão'],
]

const DP02: VariaveisDaTipologia = {
    variaveis: [
        { variavel: 'ARI', descricao: 'ARREMATE INTERNO', padrao: '1', condicao: '(ARR=1)', opcoes: '1 = BZ0006 - ARREMATE 65MM [33,00]; 2 = BZ1770 - ARREMATE 70MM [33,00]; 3 = BZ0010 - ARREMATE 20MM; 4 = SEM ARREMATE INTERNO' },
        { variavel: 'ARE', descricao: 'ARREMATE EXTERNO', padrao: '1', condicao: '(ARR=1)', opcoes: '1 = BZ0010 - ARREMATE 20MM; 2 = SEM ARREMATE EXTERNO' },
        { variavel: 'MAE', descricao: 'MEDIDA ARREMATE EXTERNO', padrao: '1', condicao: '(ARE=1)', opcoes: '1 = MEDIDA DO VÃO (CORTE 45/45); 2 = VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]' },
    ],
} as unknown as VariaveisDaTipologia


describe('rotuloSemCodigo: o nome por extenso, sem o código de fornecedor', () => {
    it.each(REAIS)('%s (%s) → %s', (rotulo, descricao, esperado) => {
        expect(rotuloSemCodigo(rotulo, descricao)).toBe(esperado)
    })

    it('nenhum dos rótulos reais sai com código de fornecedor nem com o valor entre colchetes', () => {
        for (const [rotulo, descricao] of REAIS) {
            const saida = rotuloSemCodigo(rotulo, descricao)
            const codigo = /^[A-Z]{1,5}\d+/.exec(rotulo)?.[0]
            if (codigo) expect(saida.toUpperCase().includes(codigo)).toBe(false)
            const colchete = /\[[^\]]*\]/.exec(rotulo)?.[0]
            if (colchete) expect(saida.includes(colchete)).toBe(false)
        }
    })
})

describe('arremateDaColeta', () => {
    it('nada escolhido → "Padrão"', () => {
        expect(arremateDaColeta(DP02, null)).toBe('Padrão')
    })
    it('escolhido → o nome por extenso, e "Padrão" no que não foi dito; a medida escolhida também aparece', () => {
        expect(arremateDaColeta(DP02, { ARI: 3, MAE: 2 })).toBe('arremate interno: 20 mm; arremate externo: Padrão; medida do arremate externo: vão + 50 mm')
    })
    it('só a medida escolhida → ela aparece, e o resto em "Padrão"', () => {
        expect(arremateDaColeta(DP02, { MAE: 2 })).toBe('arremate interno: Padrão; arremate externo: Padrão; medida do arremate externo: vão + 50 mm')
    })
    it('a medida não escolhida não aparece, nem com outra escolha', () => {
        expect(arremateDaColeta(DP02, { ARI: 3 })).toBe('arremate interno: 20 mm; arremate externo: Padrão')
    })
    it('tipologia sem a aba Variáveis → "Padrão"', () => {
        expect(arremateDaColeta(null, { ARI: 3 })).toBe('Padrão')
    })
})

// A MENSAGEM-RESUMO (fraseDoApanhado) SAIU em 06/11/2026: no lugar dela vai o ARQUIVO do levantamento, e o que ela dizia — o arremate por
// extenso e o vidro com o rótulo uma vez — é conferido no arquivo (`arquivo-do-levantamento.test.ts`, `folha-do-levantamento.test.ts`).

// o VIDRO saiu daqui (06/11/2026): a célula do arquivo é "VIDRO:", e o vidro vai como o vendedor disse, sem rótulo na frente

