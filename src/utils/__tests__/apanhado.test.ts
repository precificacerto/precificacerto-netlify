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

describe('arremateDaColeta: O QUE O CÁLCULO USA — a resposta do vendedor ou o padrão do motor, por extenso (dono do produto, 07/11/2026)', () => {
    it('nada escolhido → o PADRÃO DO MOTOR por extenso, nunca a palavra "Padrão" (que não diz o que se calcula)', () => {
        expect(arremateDaColeta(DP02, null)).toBe('arremate interno: 65 mm; arremate externo: 20 mm; medida do arremate externo: medida do vão')
    })
    it('escolhido → a escolha; o que não foi dito, o padrão do motor; a medida escolhida também', () => {
        expect(arremateDaColeta(DP02, { ARI: 3, MAE: 2 })).toBe('arremate interno: 20 mm; arremate externo: 20 mm; medida do arremate externo: vão + 50 mm')
        expect(arremateDaColeta(DP02, { ARI: 2 })).toBe('arremate interno: 70 mm; arremate externo: 20 mm; medida do arremate externo: medida do vão')
    })
    it('a medida do arremate externo só entra quando a condição dela vale: sem arremate externo, não há medida', () => {
        expect(arremateDaColeta(DP02, { ARE: 2 })).toBe('arremate interno: 65 mm; arremate externo: sem arremate externo')
    })
    it('o valor efetivo que não é uma opção da aba é dito como tal, nunca adivinhado', () => {
        expect(arremateDaColeta(DP02, { ARI: 9 })).toBe('arremate interno: opção fora da lista do motor; arremate externo: 20 mm; medida do arremate externo: medida do vão')
    })
    it('sem a aba Variáveis, ou tipologia sem variável de arremate → nula (nada a dizer, nunca "Padrão")', () => {
        expect(arremateDaColeta(null, { ARI: 3 })).toBeNull()
        expect(arremateDaColeta({ variaveis: [{ variavel: 'AF', descricao: 'ALTURA DA BANDEIRA', padrao: null, condicao: 'sempre', opcoes: null }] } as unknown as VariaveisDaTipologia, {})).toBeNull()
    })
    it('nenhum código de fornecedor, em nenhuma combinação das opções reais', () => {
        for (const ARI of [1, 2, 3, 4]) for (const ARE of [1, 2]) for (const MAE of [1, 2]) {
            const t = arremateDaColeta(DP02, { ARI, ARE, MAE }) as string
            expect([t, /\b[A-Z]{1,5}\d{2,}[A-Z0-9]*\b/.test(t)]).toEqual([t, false])
        }
    })
})

// A MENSAGEM-RESUMO (fraseDoApanhado) SAIU em 06/11/2026: no lugar dela vai o ARQUIVO do levantamento, e o que ela dizia — o arremate por
// extenso e o vidro com o rótulo uma vez — é conferido no arquivo (`arquivo-do-levantamento.test.ts`, `folha-do-levantamento.test.ts`).

// o VIDRO saiu daqui (06/11/2026): a célula do arquivo é "VIDRO:", e o vidro vai como o vendedor disse, sem rótulo na frente

