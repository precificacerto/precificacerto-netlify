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

describe('(4) nomeDoCliente — o nome do levantamento sai do cliente que está no texto (dono do produto, 03/11/2026)', () => {
    const texto = 'Cliente: Geronimo Silva. DP-02 1200 x 1000'
    it('o cliente no texto é o nome, PURO — o prefixo "Levantamento" saiu (dono do produto, 03/11/2026)', () => {
        expect(N().nomeDoCliente({ cliente: 'Geronimo Silva' }, texto)).toBe('Geronimo Silva')
        expect(N().nomeDoCliente({ cliente: 'geronimo silva' }, texto)).toBe('geronimo silva')
    })
    it('o "Levantamento <cliente>" que a IA escreveu no nome vale com o cliente no texto, e o prefixo cai', () => {
        expect(N().nomeDoCliente({ nome: 'Levantamento Geronimo Silva' }, texto)).toBe('Geronimo Silva')
        expect(N().nomeDoCliente({ cliente: 'Levantamento Geronimo Silva' }, 'levantamento geronimo silva')).toBe('Geronimo Silva')
    })
    it('o cliente fora do texto, sem letra ou vazio não vale', () => {
        expect(N().nomeDoCliente({ cliente: 'Maria Souza' }, texto)).toBeNull()
        expect(N().nomeDoCliente({ nome: 'Levantamento Maria Souza' }, texto)).toBeNull()
        expect(N().nomeDoCliente({ cliente: '12' }, 'cliente 12, DP-02')).toBeNull()
        expect(N().nomeDoCliente({ cliente: 'a' }, texto)).toBeNull()
        expect(N().nomeDoCliente({ cliente: '  ' }, texto)).toBeNull()
        expect(N().nomeDoCliente({}, texto)).toBeNull()
    })
    it('o nome que não começa com "Levantamento" não é tomado como cliente', () => {
        expect(N().nomeDoCliente({ nome: 'Casa do Geronimo' }, 'Cliente: Geronimo')).toBeNull()
    })
})

describe('(5) o prefixo "Levantamento" saiu (dono do produto, 03/11/2026): a comparação o ignora nos dois lados, e ele não se grava mais', () => {
    it.each([
        ['Levantamento Geronimo Silva', 'geronimo silva'],
        ['levantamento   Geronimo Silva', 'geronimo silva'],
        ['Geronimo Silva', 'geronimo silva'],
        ['Levantamentos do Geronimo', 'levantamentos do geronimo'],
        ['Levantamento', 'levantamento'],
    ])('formaComparavel("%s") = "%s"', (nome, esperada) => {
        expect(N().formaComparavel(nome)).toBe(esperada)
    })

    it('nomeSemPrefixo tira o prefixo do que se grava, e deixa o resto como o vendedor escreveu', () => {
        expect(N().nomeSemPrefixo('Levantamento Geronimo Silva')).toBe('Geronimo Silva')
        expect(N().nomeSemPrefixo('  Casa do João ')).toBe('Casa do João')
        expect(N().nomeSemPrefixo('Levantamentos do Geronimo')).toBe('Levantamentos do Geronimo')
    })

    it('o caso real: "Levantamento Geronimo Silva" (o nome do cliente de antes) é IGUAL ao "Geronimo Silva" gravado — e vice-versa', () => {
        const gravadoSem = [{ id: 'g', nome: 'Geronimo Silva', nome_normalizado: 'geronimo silva' }]
        const gravadoCom = [{ id: 'g', nome: 'Levantamento Geronimo Silva', nome_normalizado: 'levantamento geronimo silva' }]
        expect(N().compararNome('Levantamento Geronimo Silva', gravadoSem)).toEqual({ tipo: 'IGUAL', existente: gravadoSem[0] })
        expect(N().compararNome('Geronimo Silva', gravadoCom)).toEqual({ tipo: 'IGUAL', existente: gravadoCom[0] })
        expect(N().compararNome('Geronimo', gravadoCom)).toEqual({ tipo: 'PARECIDO', existentes: [gravadoCom[0]] })
        // o PARECIDO por distância também ignora o prefixo do gravado: "Geronimo Silvo" está a 1 de "geronimo silva", não a 14 de "levantamento geronimo silva"
        expect(N().compararNome('Geronimo Silvo', gravadoCom)).toEqual({ tipo: 'PARECIDO', existentes: [gravadoCom[0]] })
    })
})

describe('(6) palavrasNoTexto (dono do produto, 03/11/2026): a IA extrai o nome, o código confere que as PALAVRAS estão no texto', () => {
    it.each([
        ['Geison Silva', 'Geison Silva novo', true],
        ['Geison Silva', 'é o Geison Silva', true],
        ['Geison Silva', 'novo: Geison Silva', true],
        ['Geison Silva', 'Silva, Geison', true],
        ['Casa do João', 'Levantamento Casa do João: DP-02 1200x1000', true],
        ['Geison Silva', 'Geisonaldo Silva', false],
        ['Geison Silva', 'Geison', false],
        ['Maria Souza', 'é o Geison Silva', false],
        ['', 'qualquer coisa', false],
    ])('"%s" em "%s" → %s', (nome, texto, esperado) => {
        expect(N().palavrasNoTexto(nome, texto)).toBe(esperado)
        expect(N().nomeDaMensagem(nome, texto)).toBe(esperado ? nome : null)
    })
})
