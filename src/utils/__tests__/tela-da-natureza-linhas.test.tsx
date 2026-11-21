/**
 * PORTÃO — as linhas da tela da natureza (item (3) da ordem, 21/11/2026): as variáveis do motor, a gravada que o motor não tem mais (nada gravado
 * some da tela) e o vidro por formato — os formatos das tipologias e os já gravados.
 */
import { linhasDaFamilia } from '@/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component'
import type { FamiliaDaTela, LinhaGravada } from '@/lib/atendimentos-ia/tela-da-natureza-servidor'

const G = (variavel: string, natureza: LinhaGravada['natureza'], opcao: string | null, formato: string | null = null): LinhaGravada =>
    ({ familia: 'PVC', linha: null, formato, variavel, natureza, opcao_padrao: opcao, atualizado_em: null, conferencia: null })

const F: FamiliaDaTela = {
    familia: 'PVC', rotulo: 'PVC Wolf', motor: { id: 'm1', nome: 'Motor' }, formatos: ['janela correr', 'maxim-ar'],
    variaveis: [
        { variavel: 'ARI', descricao: 'Arremate interno', tipologias: 1, opcoes: [{ rotulo: 'BZ1770', tipologias: 1 }] },
        { variavel: 'INT', descricao: null, tipologias: 3, opcoes: [] },
        // o VIDRO, se o motor o declarar como variável, não vira linha da família inteira: o vidro é por formato
        { variavel: 'VIDRO', descricao: 'Vidro', tipologias: 3, opcoes: [] },
    ],
    linhas: [G('ARI', 'POLITICA', 'BZ1770'), G('SOLDA', 'POLITICA', 'SPVCAL 6MM'), G('VIDRO', 'POLITICA', 'VIN05', 'janela correr'), G('VIDRO', 'POLITICA', 'VIN08', 'porta correr')],
}

it('as variáveis do motor, a gravada fora do motor e o vidro por formato, com o que está gravado', () => {
    const l = linhasDaFamilia(F)
    expect(l.map((x) => `${x.chave}|${x.detalhe}|${x.gravada?.opcao_padrao ?? '-'}`)).toEqual([
        'ARI|Arremate interno · 1 tipologia|BZ1770',
        'INT|sem descrição no motor · 3 tipologias|-',
        'SOLDA|não está no motor do levantamento|SPVCAL 6MM',
        'VIDRO:janela correr|o código do item na tabela de vidro do fornecedor principal|VIN05',
        'VIDRO:maxim-ar|o código do item na tabela de vidro do fornecedor principal|-',
        'VIDRO:porta correr|o código do item na tabela de vidro do fornecedor principal|VIN08',
    ])
    expect(l[0].opcoes).toEqual(['BZ1770'])
    expect(l.find((x) => x.chave === 'VIDRO:maxim-ar')?.formato).toBe('maxim-ar')
})
