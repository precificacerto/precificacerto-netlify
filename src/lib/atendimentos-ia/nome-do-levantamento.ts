/**
 * O NOME DO LEVANTAMENTO: a forma que vai para `orcamentista_levantamento.nome_normalizado` e a
 * comparação que decide se a mensagem é de um levantamento NOVO, de uma ALTERAÇÃO, ou se a IA
 * tem de PERGUNTAR.
 *
 * DECISÕES DO DONO DO PRODUTO (25/10/2026):
 *   1. a comparação ignora maiúscula e acento — "Casa do João" e "casa do joao" são o mesmo;
 *      parecido mas NÃO igual ("Casa do João 2", "João", "Casa do Jaoo") → PERGUNTA. Nunca se
 *      decide por semelhança: PARECIDO só serve para a pergunta citar o nome que existe;
 *   2. o nome é único por vendedor — a lista que chega aqui já é a dele.
 *
 * A normalização é em TS e não no SQL: `unaccent()` não é IMMUTABLE, e o Postgres a recusa em
 * coluna gerada e em índice. A coluna é comum, e é ESTA função que a escreve.
 *
 * Portão: `src/utils/__tests__/nome-do-levantamento.test.ts`.
 */

/** Minúscula, sem acento (NFD sem as marcas combinantes), espaços colapsados, sem espaço nas pontas. */
export function normalizarNome(nome: string): string {
    return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export type LevantamentoComNome = { id: string; nome: string; nome_normalizado: string }

export type ComparacaoDoNome<L extends LevantamentoComNome = LevantamentoComNome> =
    | { tipo: 'IGUAL'; existente: L }
    | { tipo: 'PARECIDO'; existentes: L[] }
    | { tipo: 'NOVO' }

/** Abaixo disto, a distância de edição não diz nada: "loja" e "lona" são nomes diferentes. */
const TAMANHO_MINIMO_PARA_DISTANCIA = 5
const DISTANCIA_MAXIMA = 2

function distancia(a: string, b: string): number {
    const linha = Array.from({ length: b.length + 1 }, (_, j) => j)
    for (let i = 1; i <= a.length; i += 1) {
        let diagonal = linha[0]
        linha[0] = i
        for (let j = 1; j <= b.length; j += 1) {
            const acima = linha[j]
            linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
            diagonal = acima
        }
    }
    return linha[b.length]
}

const palavras = (n: string) => n.split(' ').filter(Boolean)

/** Uma forma contém a outra como sequência de palavras inteiras: "joao" em "casa do joao". */
function contemPalavras(maior: string, menor: string): boolean {
    return ` ${maior} `.includes(` ${menor} `)
}

function parecido(a: string, b: string): boolean {
    if (palavras(a).length && palavras(b).length && (contemPalavras(a, b) || contemPalavras(b, a))) return true
    return Math.min(a.length, b.length) >= TAMANHO_MINIMO_PARA_DISTANCIA && distancia(a, b) <= DISTANCIA_MAXIMA
}

/** IGUAL pela forma normalizada; senão os PARECIDOS, na ordem em que vieram; senão NOVO. */
export function compararNome<L extends LevantamentoComNome>(nome: string, existentes: L[]): ComparacaoDoNome<L> {
    const forma = normalizarNome(nome)
    const igual = existentes.find((l) => l.nome_normalizado === forma)
    if (igual) return { tipo: 'IGUAL', existente: igual }
    const parecidos = existentes.filter((l) => parecido(forma, l.nome_normalizado))
    return parecidos.length ? { tipo: 'PARECIDO', existentes: parecidos } : { tipo: 'NOVO' }
}

/**
 * O nome que a IA leu, SÓ se ele estiver no texto do vendedor (comparado sem caixa e sem acento).
 * Um nome que não está no texto foi inventado, e conta como ausente.
 */
export function nomeDaMensagem(nome: unknown, texto: string): string | null {
    if (typeof nome !== 'string') return null
    const aparado = nome.trim()
    if (!aparado) return null
    return normalizarNome(texto).includes(normalizarNome(aparado)) ? aparado : null
}

/**
 * O NOME QUE SAI DO CLIENTE (dono do produto, 03/11/2026): "aceite o nome derivado do cliente. 'Cliente: Geronimo Silva'
 * basta para o nome ser 'Levantamento Geronimo Silva', sem perguntar. Só pergunte quando não houver cliente em lugar
 * nenhum da conversa."
 *
 * O cliente vale SÓ se estiver no texto do vendedor — a mesma prova de `nomeDaMensagem`: um cliente que a IA inventou
 * conta como ausente. E precisa ter letra: um "a" solto estaria em qualquer mensagem. Duas formas chegam aqui: o campo
 * `cliente` da ferramenta, ou o `nome` que a própria IA já escreveu como "Levantamento <cliente>" (o prompt base manda o
 * nome ser esse), com o cliente no texto. O nome que já começa com "Levantamento" não ganha o prefixo duas vezes.
 */
export const PREFIXO_DO_NOME_DO_CLIENTE = 'Levantamento'
const COMECA_COM_LEVANTAMENTO = /^levantamento\s+(.+)$/i
const TEM_LETRA = /\p{L}.*\p{L}/u

export const nomeDoLevantamentoDoCliente = (cliente: string) =>
    COMECA_COM_LEVANTAMENTO.test(cliente) ? cliente : `${PREFIXO_DO_NOME_DO_CLIENTE} ${cliente}`

export function nomeDoCliente(proposta: { cliente?: unknown; nome?: unknown }, texto: string): string | null {
    const noTexto = (v: unknown) => {
        const lido = nomeDaMensagem(v, texto)
        return lido !== null && TEM_LETRA.test(lido) ? lido : null
    }
    const cliente = noTexto(proposta.cliente)
    if (cliente) return nomeDoLevantamentoDoCliente(cliente)
    const doNome = typeof proposta.nome === 'string' ? COMECA_COM_LEVANTAMENTO.exec(proposta.nome.trim()) : null
    const doPrefixo = doNome ? noTexto(doNome[1]) : null
    return doPrefixo ? nomeDoLevantamentoDoCliente(doPrefixo) : null
}
