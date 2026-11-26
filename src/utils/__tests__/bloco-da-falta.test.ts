/**
 * Pedido 0032 (dono do produto, 26/11/2026): toda falta do orçamento diz de qual bloco é — AGENTE, MOTOR, FORNECEDOR ou COMERCIAL —, na mensagem ao
 * vendedor e em `orcamentista_orcamento_falta` (na frente da frase: sem coluna nova, sem migração).
 */
import { BLOCO_DO_MOTIVO, blocoDaFalta, fraseComBloco, separarBloco } from '@/lib/atendimentos-ia/bloco-da-falta'
import { MOTIVOS_DA_FALTA } from '@/lib/atendimentos-ia/resolucao-de-referencia'
import { juntarEscolhasQueNaoValem, fraseDaRecusa } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import { linhasDasFaltasDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento'
import { FALTA_DO_MODO_DA_COMISSAO } from '@/lib/atendimentos-ia/travessia-do-levantamento-plano'

jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))

describe('o bloco de cada motivo', () => {
    it('PORTÃO: os motivos que as faltas do orçamento produzem têm todos um bloco — o motivo novo sem bloco fica vermelho aqui', () => {
        const doCusto = ['SEM_MATERIAL', 'SEM_VALOR', 'PONTE_AMBIGUA', 'LINHA_NAO_AVALIADA', 'BARRA_SEM_COMPRIMENTO']
        const doVidro = ['VIDRO_NAO_DITO', 'VIDRO_NAO_TRADUZIDO', 'VIDRO_AMBIGUO', 'VIDRO_SEM_CADASTRO', 'VIDRO_CODIGO_FORA_DA_TABELA', 'VIDRO_PRINCIPAL_AMBIGUO']
        // os medidos em produção, em `orcamentista_orcamento_falta` (26/11/2026)
        const medidos = ['NAO_ACHADA', 'VIDRO_AMBIGUO', 'SEM_MATERIAL', 'LINHA_NAO_AVALIADA', 'VIDRO_SEM_CADASTRO', 'REFERENCIA_SEM_A_COR', 'PONTE_AMBIGUA', 'SEM_VALOR', 'AMBIGUA']
        for (const m of [...MOTIVOS_DA_FALTA, ...doCusto, ...doVidro, ...medidos]) expect([m, blocoDaFalta(m)]).not.toEqual([m, null])
    })
    it('o que cada bloco quer dizer, nas palavras da referência: o dado do item, a tipologia, a tabela de preço', () => {
        expect(['SEM_COR', 'VIDRO_NAO_DITO', 'ESPESSURA_DO_VIDRO_AUSENTE', 'VARIAVEL_DE_IDENTIFICACAO'].map(blocoDaFalta)).toEqual(['AGENTE', 'AGENTE', 'AGENTE', 'AGENTE'])
        expect(['ESCOLHA_FORA_DAS_OPCOES', 'NENHUM_BAGUETE_PARA_A_ESPESSURA', 'LINHA_NAO_AVALIADA', 'PECA_MAIOR_QUE_A_BARRA'].map(blocoDaFalta)).toEqual(['MOTOR', 'MOTOR', 'MOTOR', 'MOTOR'])
        expect(['SEM_VALOR', 'REFERENCIA_SEM_A_COR', 'COR_FORA_DA_TABELA', 'NAO_ACHADA'].map(blocoDaFalta)).toEqual(['FORNECEDOR', 'FORNECEDOR', 'FORNECEDOR', 'FORNECEDOR'])
    })
    it('o motivo fora da lista NÃO ganha bloco adivinhado (a serra, de propósito; e o que não existe)', () => {
        expect(blocoDaFalta('SERRA_INVALIDA')).toBeNull()
        expect(blocoDaFalta('QUALQUER_COISA')).toBeNull()
        expect(blocoDaFalta('toString')).toBeNull()
        expect(Object.values(BLOCO_DO_MOTIVO).every((b) => ['AGENTE', 'MOTOR', 'FORNECEDOR', 'COMERCIAL'].includes(b))).toBe(true)
    })
})

describe('a frase com o bloco', () => {
    it('vai na frente, uma vez só; sem bloco, a frase como veio', () => {
        expect(fraseComBloco('FORNECEDOR', 'o item 1352 está sem o valor da barra')).toBe('[FORNECEDOR] o item 1352 está sem o valor da barra')
        expect(fraseComBloco('MOTOR', '[FORNECEDOR] já tem')).toBe('[FORNECEDOR] já tem')
        expect(fraseComBloco(null, 'sem bloco')).toBe('sem bloco')
        expect(separarBloco('[MOTOR] o tempo')).toEqual({ bloco: '[MOTOR] ', resto: 'o tempo' })
        expect(separarBloco('o tempo [MOTOR] ')).toEqual({ bloco: '', resto: 'o tempo [MOTOR] ' })
    })
    it('as faltas COMERCIAIS: o modo da comissão (perfil do vendedor)', () => {
        expect(FALTA_DO_MODO_DA_COMISSAO.startsWith('[COMERCIAL] o modo da comissão')).toBe(true)
    })
    it('a mensagem ao vendedor: a falta com bloco continua curta ("Falta: [MOTOR] o tempo …"), e a lista põe o bloco no começo da linha', () => {
        const d = { nome: 'Casa', cor: '', esquadrias: [] }
        expect(fraseDaRecusa(d, ['[MOTOR] o tempo de fabricação de DP-02'])).toBe('Não consegui fechar o levantamento “Casa”. Falta: [MOTOR] o tempo de fabricação de DP-02.')
        expect(fraseDaRecusa(d, ['[MOTOR] a', '[AGENTE] b'])).toBe('Não consegui fechar o levantamento “Casa”. Falta:\n• [MOTOR] a.\n• [AGENTE] b.')
        expect(linhasDasFaltasDoArquivo([{ codigo: '1352/WOLFF', itens: [1, 2], frase: '[FORNECEDOR] o item 1352 está sem o valor da barra.' } as never]))
            .toEqual(['• [FORNECEDOR] 1352/WOLFF (itens 1, 2): o item 1352 está sem o valor da barra.'])
    })
    it('a escolha que não vale (pedido 0030) junta numa pergunta só, com o bloco de quem a tem', () => {
        const f = 'Item 8: A escolha “RL” = 1 não vale neste item: as opções que valem são 2'
        expect(juntarEscolhasQueNaoValem([f, f], ['MOTOR', 'MOTOR'])).toEqual(['[MOTOR] Item 8: a escolha “RL” = 1 não vale neste item: as opções que valem são 2. Diga qual vale'])
        expect(juntarEscolhasQueNaoValem(['outra'], [null])).toEqual(['outra'])
        expect(juntarEscolhasQueNaoValem(['outra'])).toEqual(['outra'])
    })
})
