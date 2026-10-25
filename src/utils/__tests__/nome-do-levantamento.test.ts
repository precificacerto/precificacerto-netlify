/**
 * PORTÃO — o NOME DO LEVANTAMENTO (`src/lib/atendimentos-ia/nome-do-levantamento.ts`): a normalização
 * que vai para `orcamentista_levantamento.nome_normalizado`, e a comparação que decide se a mensagem é
 * de um levantamento NOVO, de uma ALTERAÇÃO, ou se a IA tem de PERGUNTAR.
 *
 * AS DECISÕES DO DONO DO PRODUTO (25/10/2026):
 *   1. a comparação ignora maiúscula e acento: "Casa do João" = "casa do joao" = o mesmo levantamento;
 *      parecido mas NÃO igual ("Casa do João 2") → a IA PERGUNTA. Nunca decide por semelhança;
 *   2. o nome é único por vendedor — a lista que se compara é a dele, quem chama a filtra.
 *
 * A normalização é em TS, não no SQL: `unaccent()` não é IMMUTABLE, e o Postgres a recusa em coluna
 * gerada e em expressão de índice. A coluna é comum, escrita pelo código — e é ESTA função que escreve.
 */
export {}

/* eslint-disable @typescript-eslint/no-require-imports */
type Modulo = typeof import('@/lib/atendimentos-ia/nome-do-levantamento')
const N = () => require('@/lib/atendimentos-ia/nome-do-levantamento') as Modulo
/* eslint-enable @typescript-eslint/no-require-imports */

describe('(1) normalizarNome — minúscula, sem acento, espaços colapsados, sem espaço nas pontas', () => {
    it.each([
        ['Casa do João', 'casa do joao'],
        ['  Obra   Centro ', 'obra centro'],
        ['Ação', 'acao'],
        ['CASA DO JOÃO', 'casa do joao'],
        ['casa do joao', 'casa do joao'],
        ['Edifício Pôr-do-Sol', 'edificio por-do-sol'],
        ['Casa\tdo\nJoão', 'casa do joao'],
        ['Çãõ êü', 'cao eu'],
    ])('"%s" → "%s"', (nome, esperado) => {
        expect(N().normalizarNome(nome)).toBe(esperado)
    })

    it('o "João" escrito com o acento COMBINANTE (o + ´ separados) é o mesmo "joao"', () => {
        expect(N().normalizarNome('Joa\u0303o')).toBe('joao')
    })

    it('pontuação e números ficam: "Casa 2" não é "Casa"', () => {
        expect(N().normalizarNome('Casa 2')).toBe('casa 2')
    })
})

describe('(2) compararNome — IGUAL, PARECIDO ou NOVO', () => {
    const EXISTENTES = [
        { id: 'l1', nome: 'Casa do João', nome_normalizado: 'casa do joao' },
        { id: 'l2', nome: 'Obra Centro', nome_normalizado: 'obra centro' },
    ]

    it('"casa do joao" é IGUAL a "Casa do João" — é ALTERAÇÃO dele', () => {
        expect(N().compararNome('casa do joao', EXISTENTES)).toEqual({ tipo: 'IGUAL', existente: EXISTENTES[0] })
    })

    it('"CASA DO JOÃO" também é IGUAL', () => {
        expect(N().compararNome('CASA DO JOÃO', EXISTENTES)).toEqual({ tipo: 'IGUAL', existente: EXISTENTES[0] })
    })

    it('"Casa do João 2" é PARECIDO, não igual — a IA pergunta, citando "Casa do João"', () => {
        expect(N().compararNome('Casa do João 2', EXISTENTES)).toEqual({ tipo: 'PARECIDO', existentes: [EXISTENTES[0]] })
    })

    it('o nome PARCIAL ("João") é parecido: não escolhe', () => {
        expect(N().compararNome('João', EXISTENTES)).toEqual({ tipo: 'PARECIDO', existentes: [EXISTENTES[0]] })
    })

    it('um erro de digitação ("Casa do Jaoo", duas letras trocadas) é PARECIDO, não igual', () => {
        expect(N().compararNome('Casa do Jaoo', EXISTENTES)).toEqual({ tipo: 'PARECIDO', existentes: [EXISTENTES[0]] })
    })

    it('"Loja Norte" não se parece com nenhum: NOVO', () => {
        expect(N().compararNome('Loja Norte', EXISTENTES)).toEqual({ tipo: 'NOVO' })
    })

    it('sem levantamento nenhum: NOVO', () => {
        expect(N().compararNome('Casa do João', [])).toEqual({ tipo: 'NOVO' })
    })

    it('parecido com DOIS: os dois saem, para a pergunta citar os dois', () => {
        const dois = [...EXISTENTES, { id: 'l3', nome: 'Casa do João 3', nome_normalizado: 'casa do joao 3' }]
        expect(N().compararNome('Casa do João 2', dois)).toEqual({ tipo: 'PARECIDO', existentes: [dois[0], dois[2]] })
    })

    it('nome curto não vira parecido por distância de edição: "Loja" e "Lona" são DIFERENTES', () => {
        expect(N().compararNome('Lona', [{ id: 'l9', nome: 'Loja', nome_normalizado: 'loja' }])).toEqual({ tipo: 'NOVO' })
    })
})

describe('(3) nomeDaMensagem — o nome que a IA leu tem de estar no texto do vendedor', () => {
    it('o nome que está na mensagem é aceito, como o vendedor escreveu', () => {
        expect(N().nomeDaMensagem('Casa do João', 'Levantamento Casa do João: DP-02 1200x1000 branco')).toBe('Casa do João')
    })

    it('a comparação com o texto ignora caixa e acento: "Casa do João" no texto "casa do joao, troca a altura"', () => {
        expect(N().nomeDaMensagem('Casa do João', 'casa do joao, troca a altura para 1200')).toBe('Casa do João')
    })

    it('um nome que NÃO está no texto é inventado: null', () => {
        expect(N().nomeDaMensagem('Casa do João', 'DP-02 1200x1000 branco')).toBeNull()
    })

    it.each([[null], [''], ['   '], [123]])('vazio ou não-texto (%p): null', (nome) => {
        expect(N().nomeDaMensagem(nome, 'qualquer coisa')).toBeNull()
    })

    it('espaços nas pontas saem; o miolo fica como o vendedor escreveu', () => {
        expect(N().nomeDaMensagem('  Obra Centro  ', 'Levantamento Obra Centro')).toBe('Obra Centro')
    })
})
