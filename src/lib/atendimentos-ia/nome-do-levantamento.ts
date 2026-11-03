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
 * O PREFIXO "Levantamento" SAIU (dono do produto, 03/11/2026): "O nome do levantamento é o nome do cliente, puro: 'Geronimo Silva', não
 * 'Levantamento Geronimo Silva'. É o que faz o mesmo cliente nunca bater IGUAL e cair sempre na pergunta. Os levantamentos que já existem
 * com o prefixo continuam como estão; a comparação deve ignorar o prefixo nos dois lados." Medido em produção em 03/11/2026: o levantamento
 * "Geronimo Silva" (01:11 UTC) e o nome derivado do cliente, "Levantamento Geronimo Silva", eram PARECIDOS (uma forma contém a outra) e
 * nunca IGUAIS — a mesma pessoa caía na pergunta a cada mensagem.
 *
 * Portão: `src/utils/__tests__/nome-do-levantamento.test.ts`.
 */

/** Minúscula, sem acento (NFD sem as marcas combinantes), espaços colapsados, sem espaço nas pontas. */
export function normalizarNome(nome: string): string {
    return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** O prefixo que os levantamentos de antes de 03/11/2026 carregam ("Levantamento Casa do João"); nunca mais é posto, e a comparação o ignora. */
export const PREFIXO_DO_NOME_DO_CLIENTE = 'Levantamento'
const COMECA_COM_LEVANTAMENTO = /^levantamento\s+(.+)$/i

/** A forma que se COMPARA: normalizada e sem o prefixo "levantamento " — "levantamento geronimo silva" e "geronimo silva" são a mesma. */
export function formaComparavel(nome: string): string {
    const forma = normalizarNome(nome)
    const semPrefixo = COMECA_COM_LEVANTAMENTO.exec(forma)
    return semPrefixo ? semPrefixo[1].trim() : forma
}

/** O nome como se GRAVA: o que o vendedor escreveu, sem o prefixo "Levantamento" — que não se põe mais (03/11/2026). */
export function nomeSemPrefixo(nome: string): string {
    const aparado = nome.trim()
    const semPrefixo = COMECA_COM_LEVANTAMENTO.exec(aparado)
    return semPrefixo ? semPrefixo[1].trim() : aparado
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

/** IGUAL pela forma comparável (normalizada, sem o prefixo "levantamento" nos dois lados); senão os PARECIDOS, na ordem em que vieram; senão NOVO. */
export function compararNome<L extends LevantamentoComNome>(nome: string, existentes: L[]): ComparacaoDoNome<L> {
    const forma = formaComparavel(nome)
    const igual = existentes.find((l) => formaComparavel(l.nome_normalizado) === forma)
    if (igual) return { tipo: 'IGUAL', existente: igual }
    const parecidos = existentes.filter((l) => parecido(forma, formaComparavel(l.nome_normalizado)))
    return parecidos.length ? { tipo: 'PARECIDO', existentes: parecidos } : { tipo: 'NOVO' }
}

/** As palavras de um texto: letras e números; a pontuação colada ("joao:", "silva.") não faz parte da palavra. */
const termos = (t: string) => normalizarNome(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Cada palavra do nome está no texto como palavra inteira (sem caixa, acento ou pontuação). A ordem não importa: "é o Geison Silva" traz "Geison Silva". */
export function palavrasNoTexto(nome: string, texto: string): boolean {
    const doTexto = new Set(termos(texto))
    const doNome = termos(nome)
    return doNome.length > 0 && doNome.every((p) => doTexto.has(p))
}

/**
 * O nome que a IA leu, SÓ se as palavras dele estiverem no texto do vendedor (comparado sem caixa e sem acento). Um nome que
 * não está no texto foi inventado, e conta como ausente. Pelas PALAVRAS, e não pelo trecho contíguo (dono do produto, 03/11/2026):
 * "a IA extrai o nome e o código confere que as palavras estão no texto — nunca exija a forma ditada pela pergunta".
 */
export function nomeDaMensagem(nome: unknown, texto: string): string | null {
    if (typeof nome !== 'string') return null
    const aparado = nome.trim()
    if (!aparado) return null
    return palavrasNoTexto(aparado, texto) ? aparado : null
}

/**
 * O NOME QUE SAI DO CLIENTE (dono do produto, 03/11/2026): "aceite o nome derivado do cliente. 'Cliente: Geronimo Silva'
 * basta para o nome ser 'Geronimo Silva', sem perguntar. Só pergunte quando não houver cliente em lugar nenhum da conversa."
 * E, no mesmo dia: o nome é o do cliente, PURO — sem o prefixo "Levantamento".
 *
 * O cliente vale SÓ se estiver no texto do vendedor — a mesma prova de `nomeDaMensagem`: um cliente que a IA inventou
 * conta como ausente. E precisa ter letra: um "a" solto estaria em qualquer mensagem. Duas formas chegam aqui: o campo
 * `cliente` da ferramenta, ou o `nome` que a própria IA escreveu como "Levantamento <cliente>" (o prompt de antes mandava
 * o nome ser esse), com o cliente no texto — o prefixo sai.
 */
const TEM_LETRA = /\p{L}.*\p{L}/u

export const nomeDoLevantamentoDoCliente = (cliente: string) => nomeSemPrefixo(cliente)

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
