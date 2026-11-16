/**
 * PORTÃO — AS OBSERVAÇÕES DO ORÇAMENTO (dono do produto, 16/11/2026): ele mandou o orçamento 1154 da De Paula como
 * modelo e pediu ênfase nas OBSERVAÇÕES; perguntado de onde o texto deve vir, escolheu a BASE DE CONHECIMENTO DA
 * EMPRESA. O bloco já existia no PDF e saía SEMPRE VAZIO, porque não havia de onde ler o texto.
 *
 * O que este portão prende é a GUARDA: o que entra como observação e o que é recusado com frase, antes de chegar ao
 * banco. A mesma guarda existe em `superadmin_gravar_observacoes_do_orcamento` (migração 20261116000004): a daqui é a
 * frase que o usuário lê, a de lá é a que não deixa passar por outro caminho.
 */
import {
    LIMITE_DAS_OBSERVACOES, fraseDasObservacoesGrandes, lerCorpoDasObservacoes,
} from '@/lib/atendimentos-ia/base-de-conhecimento'
import { paraGravar, recusaDasObservacoes } from '@/page-parts/atendimentos-ia/base-de-conhecimento/observacoes-do-orcamento.component'

/** O bloco do modelo que o dono do produto mandou, encurtado — com as quebras de linha, que são o formato. */
const DO_MODELO = [
    'Prazos de entrega após a medição final (salvo alterações em período de férias coletivas).',
    'PVC: BRANCO 45 DIAS · LAMINADO TOTAL 60 DIAS · LAMINADO SOMENTE EXTERNO 75 DIAS',
    'PROPOSTA VÁLIDA POR 7 DIAS A PARTIR DA EMISSÃO DA PRESENTE DATA.',
    'NÃO CONTEMPLA REMOÇÃO E DESCARTE DE ESQUADRIA EXISTENTE.',
].join('\n')

describe('as observações que entram', () => {
    it('o texto do modelo passa inteiro, com as QUEBRAS DE LINHA preservadas', () => {
        expect(lerCorpoDasObservacoes({ observacoes: DO_MODELO })).toEqual({ erros: [], observacoes: DO_MODELO })
        expect(lerCorpoDasObservacoes({ observacoes: DO_MODELO }).observacoes?.split('\n')).toHaveLength(4)
    })
    it('o texto volta APARADO nas pontas, e só nas pontas: a quebra do meio fica', () => {
        const r = lerCorpoDasObservacoes({ observacoes: `\n  ${DO_MODELO}  \n` })
        expect(r.observacoes).toBe(DO_MODELO)
        expect(r.observacoes).toContain('\n')
    })
    it('null, vazio e só-espaço LIMPAM as observações — nenhum deles é recusa', () => {
        for (const v of [null, '', '   ', '\n\n']) expect(lerCorpoDasObservacoes({ observacoes: v })).toEqual({ erros: [], observacoes: null })
    })
    it('o texto NO limite entra; UM caractere acima é recusa que diz o número', () => {
        const noLimite = 'a'.repeat(LIMITE_DAS_OBSERVACOES)
        expect(lerCorpoDasObservacoes({ observacoes: noLimite })).toEqual({ erros: [], observacoes: noLimite })
        const acima = 'a'.repeat(LIMITE_DAS_OBSERVACOES + 1)
        const r = lerCorpoDasObservacoes({ observacoes: acima })
        expect(r.observacoes).toBeNull()
        expect(r.erros).toEqual([{ campo: 'observacoes', mensagem: fraseDasObservacoesGrandes(LIMITE_DAS_OBSERVACOES + 1) }])
        expect(r.erros[0].mensagem).toContain(String(LIMITE_DAS_OBSERVACOES + 1))
    })
})

describe('as observações que NÃO entram', () => {
    it('o campo AUSENTE é recusa nomeada: limpar se diz com null, nunca por omissão', () => {
        const r = lerCorpoDasObservacoes({})
        expect(r.observacoes).toBeNull()
        expect(r.erros.map((e) => e.campo)).toEqual(['observacoes'])
        expect(r.erros[0].mensagem).toContain('null para limpar')
        // a frase do ausente é OUTRA da do tipo errado: "null limpa" e "faltou dizer" não se confundem
        expect(r.erros[0].mensagem).not.toBe(lerCorpoDasObservacoes({ observacoes: 42 }).erros[0].mensagem)
    })
    it.each([
        ['um número', 42],
        ['um objeto', { texto: 'x' }],
        ['uma lista', ['x']],
        ['um booleano', true],
    ])('%s é recusa nomeada, nunca virado texto', (_nome, v) => {
        const r = lerCorpoDasObservacoes({ observacoes: v })
        expect(r.observacoes).toBeNull()
        expect(r.erros).toEqual([{ campo: 'observacoes', mensagem: 'tem de ser texto ou null' }])
    })
})

describe('a guarda da TELA, que o usuário lê antes de salvar', () => {
    it('o texto que cabe não tem recusa; o que não cabe tem a MESMA frase da rota', () => {
        expect(recusaDasObservacoes(DO_MODELO)).toBeNull()
        expect(recusaDasObservacoes('a'.repeat(LIMITE_DAS_OBSERVACOES))).toBeNull()
        expect(recusaDasObservacoes('a'.repeat(LIMITE_DAS_OBSERVACOES + 5)))
            .toBe(fraseDasObservacoesGrandes(LIMITE_DAS_OBSERVACOES + 5))
    })
    it('a tela conta o APARADO, como o banco conta: espaço nas pontas não estoura o limite', () => {
        expect(recusaDasObservacoes(`   ${'a'.repeat(LIMITE_DAS_OBSERVACOES)}   `)).toBeNull()
    })
    it('o que a tela manda gravar: o texto aparado, e NULL quando ficou vazio', () => {
        expect(paraGravar(`  ${DO_MODELO}  `)).toBe(DO_MODELO)
        expect(paraGravar('')).toBeNull()
        expect(paraGravar('   \n  ')).toBeNull()
    })
})

export {}
