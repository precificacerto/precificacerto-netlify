/**
 * Em quantos trilhos as folhas correm (dono do produto, 25/11/2026; pedido 0025): lido do marco que o motor escolhe para o item, nunca presumido.
 * As linhas são as do motor 259035a9 (medido em 25/11/2026).
 */
import { marcosDeCorrer, trilhosDoItem, variaveisDasCondicoes, type MarcosDaTipologia } from '@/lib/atendimentos-ia/trilhos-do-marco'

const linha = (descricao: string, condicao: string, obs: string | null = 'MARCO - LARGURA') => ({ descricao, condicao, obs })
const HF112 = 'MARCO DE CORRER - 3 TRILHOS', HF88 = 'MARCO DE CORRER - 2 TRILHOS'
/** DP-90 e DP-51: só o HF112, sempre. */
const DP90 = [linha(HF112, 'sempre'), linha(HF112, 'sempre', 'MARCO - ALTURA'), linha('CLICK GUIA DE ALUMÍNIO PARA TRILHO DE PVC', 'sempre', 'MARCO - TRILHO CLICK')]
/** DP-17: os dois marcos, pela variável TM (Padrão 1). */
const DP17 = [linha(HF88, '(TM=1)', 'JAN - MARCO - LARGURA'), linha(HF88, '(TM=1)', 'JAN - MARCO - ALTURA'), linha(HF112, '(TM=2)', 'JAN - MARCO - LARGURA'), linha(HF112, '(TM=2)', 'JAN - MARCO - ALTURA')]
/** DP-72: o HF112 sempre, e o refilado da monovia pela PTM. */
const DP72 = [linha(HF112, 'sempre'), linha(HF88, '(PTM=1)', 'MARCO - LARGURA (REFILADO)'), linha(HF112, '(PTM=2)', 'MARCO - LARGURA (REFILADO)'), linha('TRILHO "Z" ALUMINIO 25MM', '(ID=1)', 'INSTALAÇÃO - AFASTADOR Z')]
const com = (perfis: ReturnType<typeof linha>[], padroes: Record<string, number> = {}): MarcosDaTipologia => ({ marcos: marcosDeCorrer(perfis), padroes })

describe('os marcos de correr da aba Perfis', () => {
    it('só a linha cuja descrição é o marco de correr com o número de trilhos; o trilho de alumínio e o click não são marco', () => {
        expect(marcosDeCorrer(DP90)).toEqual([{ trilhos: 3, condicao: 'sempre' }, { trilhos: 3, condicao: 'sempre' }])
        expect(marcosDeCorrer([linha('TRILHO TRIPLO REBAIXADO ALUMÍNIO 24MM - PRETO', 'sempre'), linha('MARCO DE GIRO', 'sempre'), linha('MARCO DE CORRER', 'sempre')])).toEqual([])
        expect(marcosDeCorrer([{ descricao: null, condicao: null }])).toEqual([])
    })
    it('o número vem da descrição, com os espaços que vierem; a condição é guardada sem espaços nas pontas', () => {
        expect(marcosDeCorrer([linha('  marco de correr -  4   trilhos ', ' (TM=3) ', null), linha('MARCO DE CORRER - 1 TRILHO', 'sempre', null)])).toEqual([{ trilhos: 4, condicao: '(TM=3)' }, { trilhos: 1, condicao: 'sempre' }])
    })
    it('a linha REFILADA (o marco que vira trilho da monovia, pela PTM) NÃO é o marco da esquadria', () => {
        expect(marcosDeCorrer(DP72)).toEqual([{ trilhos: 3, condicao: 'sempre' }])
        expect(marcosDeCorrer([linha(HF88, 'sempre', 'marco - altura (refilada)')])).toEqual([])
    })
    it('as variáveis que as condições leem: só as das condições que não são "sempre", sem repetir', () => {
        expect(variaveisDasCondicoes(marcosDeCorrer(DP17))).toEqual(['TM'])
        expect(variaveisDasCondicoes(marcosDeCorrer(DP90))).toEqual([])
        expect(variaveisDasCondicoes([{ trilhos: 2, condicao: '(TM=1 & HI=1)' }, { trilhos: 3, condicao: 'SEMPRE' }])).toEqual(['HI', 'TM'])
    })
})

describe('os trilhos de um item', () => {
    it('a tabela do pedido: DP-90 e DP-51 correm em 3 trilhos; a DP-02, em 2', () => {
        expect(trilhosDoItem(com(DP90), null)).toEqual({ trilhos: 3 })
        expect(trilhosDoItem(com([linha(HF88, 'sempre')]), { UT: 2 })).toEqual({ trilhos: 2 })
    })
    it('a DP-72 corre em 3 trilhos qualquer que seja o perfil da monovia (PTM): o refilado não conta', () => {
        for (const escolhas of [null, { PTM: 1 }, { PTM: 2 }]) expect(trilhosDoItem(com(DP72, { PTM: 1 }), escolhas)).toEqual({ trilhos: 3 })
    })
    it('a tipologia com os dois marcos (DP-17): vale o que as condições do item escolhem — a escolha gravada, senão o Padrão do motor', () => {
        expect(trilhosDoItem(com(DP17, { TM: 1 }), null)).toEqual({ trilhos: 2 })
        expect(trilhosDoItem(com(DP17, { TM: 1 }), {})).toEqual({ trilhos: 2 })
        expect(trilhosDoItem(com(DP17, { TM: 1 }), { TM: 2 })).toEqual({ trilhos: 3 })
        expect(trilhosDoItem(com(DP17, { TM: 2 }), { TM: 1 })).toEqual({ trilhos: 2 })
        // a escolha que não é número inteiro não vale: fica o Padrão
        for (const TM of ['2', 2.5, null]) expect(trilhosDoItem(com(DP17, { TM: 1 }), { TM })).toEqual({ trilhos: 2 })
        expect(trilhosDoItem(com(DP17, { TM: 1 }), [{ TM: 2 }])).toEqual({ trilhos: 2 })
    })
    it('o que não dá UM número não é presumido: o motivo volta nomeado', () => {
        // sem o valor da variável (nem escolha, nem Padrão): a condição não se avalia
        expect(trilhosDoItem(com(DP17), null)).toEqual({ indeterminado: 'a condição "(TM=1)" do marco não se avalia com as escolhas do item' })
        // nenhuma condição vale
        expect(trilhosDoItem(com(DP17, { TM: 1 }), { TM: 3 })).toEqual({ indeterminado: 'nenhum marco de correr vale para as escolhas do item' })
        // duas valem, com números diferentes
        expect(trilhosDoItem(com([linha(HF112, 'sempre'), linha(HF88, '(TM=1)')], { TM: 1 }), null)).toEqual({ indeterminado: 'mais de um marco vale para o item (2 e 3 trilhos)' })
        // a condição que dá número, e não verdadeiro ou falso
        expect(trilhosDoItem({ marcos: [{ trilhos: 2, condicao: 'TM+1' }], padroes: { TM: 1 } }, null)).toEqual({ indeterminado: 'a condição "TM+1" do marco não se avalia com as escolhas do item' })
    })
    it('duas linhas que valem com o MESMO número são um marco só (a largura e a altura)', () => {
        expect(trilhosDoItem(com([linha(HF112, 'sempre'), linha(HF112, '(TM=2)')], { TM: 2 }), null)).toEqual({ trilhos: 3 })
    })
    it('a tipologia sem marco de correr (o maxim-ar, o giro) não fala de trilho: nulo, e não "indeterminado"', () => {
        expect(trilhosDoItem(com([linha('MARCO DE GIRO', 'sempre')]), null)).toBeNull()
        expect(trilhosDoItem(null, { TM: 1 })).toBeNull()
        expect(trilhosDoItem(undefined, null)).toBeNull()
    })
})
