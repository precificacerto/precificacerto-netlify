/**
 * Atendimentos I.A. — o AVALIADOR RESTRITO das fórmulas do motor do fornecedor.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * NADA DE `eval`, `Function` ou string avaliada como código (dono do produto, 20/10/2026). A
 * fórmula é lida por um analisador próprio, que conhece SÓ o que foi medido nas 4.055 regras da
 * Wolff (sessão de verificação, 20/10/2026):
 *   - números, com VÍRGULA decimal ("4,2"); o ponto NÃO é decimal — em pt-BR ele seria milhar,
 *     e adivinhar qual dos dois é afirmar um número que ninguém escreveu;
 *   - variáveis conhecidas (o chamador as resolve — `resolver`);
 *   - `+`, `-` e `−` (o sinal de menos tipográfico); `*` e `·` (o ponto médio); `/`; parênteses;
 *   - na CONDIÇÃO: `=`, `>`, `<`, `and`, `or`. NÃO existem `<>`, `>=` nem `<=` no arquivo; se um
 *     dia aparecerem, a regra vai para pendentes — não são lidos "do jeito óbvio";
 *   - na QUANTIDADE: `IIF(condição; a; b)`, `ARREDMAIOR(x)` (arredonda para cima) e
 *     `ROUND(x; casas)`. A aridade de cada uma é a declarada aqui; outra aridade é pendente.
 *
 * QUALQUER COISA FORA DISSO NÃO É ADIVINHADA: devolve `ok: false` com o motivo, e quem chamou põe a
 * fórmula, COMO ESTÁ ESCRITA, em pendentes.
 *
 * ══ A VÍRGULA DENTRO DE FUNÇÃO É AMBÍGUA, e por isso é pendente ══
 * A vírgula é decimal em "4,2" e pode ser separador de argumento em "IIF(N=1,2,1)". Fora de
 * função, vírgula entre dígitos é decimal. DENTRO dos argumentos de uma função, vírgula colada
 * entre dígitos pode ser as duas coisas — "ARREDMAIOR(NF/2,5)" é 2,5 ou dois argumentos? —, e a
 * fórmula vai para pendentes em vez de escolher. Separador sem ambiguidade: `;`, ou a vírgula
 * seguida de espaço ("IIF(N = 1, 2, 1)").
 *
 * ══ VARIÁVEL QUE FALTA NÃO VIRA ZERO (`ausente-vs-falso.md`) ══
 * O resolver devolve a falta, e ela sobe com o NOME da variável. A avaliação é PREGUIÇOSA: o ramo
 * do IIF que não é escolhido não é avaliado, e uma variável que só aparece nele não faz falta —
 * ela não foi usada, e nenhum número saiu dela.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-motor-de-calculo.test.ts`.
 */

export type Falha = { ok: false; motivo: string; variavel?: string }
export type Avaliacao<T> = { ok: true; valor: T } | Falha

/** A falha de uma avaliação. Com `strictNullChecks` desligado, `ok` não estreita a união — a leitura é explícita. */
export const falhaDe = (r: Avaliacao<unknown>): Falha => r as Falha

/** Resolve uma variável. `ok: false` com `variavel` = ninguém informou. */
export type Resolver = (nome: string) => Avaliacao<number>

/** As funções medidas, com a aridade aceita. */
export const FUNCOES_ACEITAS = { IIF: 3, ARREDMAIOR: 1, ROUND: 2 } as const

/** Os operadores de comparação medidos na condição. */
export const COMPARACOES_ACEITAS = ['=', '>', '<'] as const

class Pendente extends Error {
    constructor(motivo: string, public variavel?: string) { super(motivo) }
}

// ── Tokens ─────────────────────────────────────────────────────────────────────────────────
type Token =
    | { t: 'num'; v: number; comVirgula: boolean; texto: string }
    | { t: 'id'; v: string }
    | { t: 'op'; v: '+' | '-' | '*' | '/' | '=' | '>' | '<' }
    | { t: '(' } | { t: ')' } | { t: 'sep' }

function tokenizar(texto: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    while (i < texto.length) {
        const c = texto[i]
        if (/\s/.test(c)) { i++; continue }
        if (/\d/.test(c)) {
            const m = /^\d+(?:,\d+)?/.exec(texto.slice(i))!
            const t = m[0]
            if (texto[i + t.length] === '.') throw new Pendente(`ponto em número ("${t}.") — o ponto não é decimal em pt-BR, e milhar não se adivinha`)
            tokens.push({ t: 'num', v: Number(t.replace(',', '.')), comVirgula: t.includes(','), texto: t })
            i += t.length
            continue
        }
        if (/[A-Za-z_]/.test(c)) {
            const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(texto.slice(i))!
            tokens.push({ t: 'id', v: m[0] })
            i += m[0].length
            continue
        }
        if ((c === '<' || c === '>') && (texto[i + 1] === '=' || texto[i + 1] === '>')) {
            throw new Pendente(`operador "${c}${texto[i + 1]}" fora dos medidos (${COMPARACOES_ACEITAS.join(' ')})`)
        }
        if (c === '+' || c === '/' || c === '=' || c === '>' || c === '<') { tokens.push({ t: 'op', v: c }); i++; continue }
        if (c === '-' || c === '−') { tokens.push({ t: 'op', v: '-' }); i++; continue }
        if (c === '*' || c === '·') { tokens.push({ t: 'op', v: '*' }); i++; continue }
        if (c === '(') { tokens.push({ t: '(' }); i++; continue }
        if (c === ')') { tokens.push({ t: ')' }); i++; continue }
        if (c === ';' || c === ',') { tokens.push({ t: 'sep' }); i++; continue }
        throw new Pendente(`caractere "${c}" fora do que o avaliador conhece`)
    }
    return tokens
}

// ── A árvore ───────────────────────────────────────────────────────────────────────────────
type No =
    | { k: 'num'; v: number }
    | { k: 'var'; nome: string }
    | { k: 'neg'; a: No }
    | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: No; b: No }
    | { k: 'cmp'; op: '=' | '>' | '<'; a: No; b: No }
    | { k: 'log'; op: 'and' | 'or'; a: No; b: No }
    | { k: 'fn'; nome: keyof typeof FUNCOES_ACEITAS; args: No[] }

class Analisador {
    private p = 0
    private dentroDeFuncao = 0
    constructor(private tokens: Token[]) {}

    private olhar(): Token | undefined { return this.tokens[this.p] }
    private ehPalavra(palavra: 'and' | 'or'): boolean {
        const t = this.olhar()
        return t?.t === 'id' && t.v.toLowerCase() === palavra
    }

    tudo(): No {
        if (this.tokens.length === 0) throw new Pendente('fórmula vazia')
        const no = this.ou()
        if (this.p < this.tokens.length) throw new Pendente('sobrou texto depois do fim da expressão')
        return no
    }

    private ou(): No {
        let a = this.e()
        while (this.ehPalavra('or')) { this.p++; a = { k: 'log', op: 'or', a, b: this.e() } }
        return a
    }

    private e(): No {
        let a = this.comparacao()
        while (this.ehPalavra('and')) { this.p++; a = { k: 'log', op: 'and', a, b: this.comparacao() } }
        return a
    }

    private comparacao(): No {
        const a = this.soma()
        const t = this.olhar()
        if (t?.t === 'op' && (t.v === '=' || t.v === '>' || t.v === '<')) { this.p++; return { k: 'cmp', op: t.v, a, b: this.soma() } }
        return a
    }

    private soma(): No {
        let a = this.produto()
        for (let t = this.olhar(); t?.t === 'op' && (t.v === '+' || t.v === '-'); t = this.olhar()) {
            this.p++
            a = { k: 'bin', op: t.v, a, b: this.produto() }
        }
        return a
    }

    private produto(): No {
        let a = this.unario()
        for (let t = this.olhar(); t?.t === 'op' && (t.v === '*' || t.v === '/'); t = this.olhar()) {
            this.p++
            a = { k: 'bin', op: t.v, a, b: this.unario() }
        }
        return a
    }

    private unario(): No {
        const t = this.olhar()
        if (t?.t === 'op' && t.v === '-') { this.p++; return { k: 'neg', a: this.unario() } }
        return this.primario()
    }

    private primario(): No {
        const t = this.olhar()
        if (!t) throw new Pendente('a expressão termina no meio')
        if (t.t === 'num') {
            if (t.comVirgula && this.dentroDeFuncao > 0) {
                throw new Pendente(`vírgula ambígua dentro de função ("${t.texto}"): decimal ou separador de argumento — não se adivinha`)
            }
            this.p++
            return { k: 'num', v: t.v }
        }
        if (t.t === '(') {
            this.p++
            const no = this.ou()
            if (this.olhar()?.t !== ')') throw new Pendente('parêntese aberto e não fechado')
            this.p++
            return no
        }
        if (t.t === 'id') {
            this.p++
            if (this.olhar()?.t !== '(') return { k: 'var', nome: t.v }
            if (!(t.v in FUNCOES_ACEITAS)) throw new Pendente(`função "${t.v}" fora das medidas (${Object.keys(FUNCOES_ACEITAS).join(', ')})`)
            const nome = t.v as keyof typeof FUNCOES_ACEITAS
            this.p++
            this.dentroDeFuncao++
            const args: No[] = []
            if (this.olhar()?.t !== ')') {
                args.push(this.ou())
                while (this.olhar()?.t === 'sep') { this.p++; args.push(this.ou()) }
            }
            this.dentroDeFuncao--
            if (this.olhar()?.t !== ')') throw new Pendente(`a chamada de ${nome} não fecha o parêntese`)
            this.p++
            if (args.length !== FUNCOES_ACEITAS[nome]) throw new Pendente(`${nome} com ${args.length} argumento(s); a forma aceita tem ${FUNCOES_ACEITAS[nome]}`)
            return { k: 'fn', nome, args }
        }
        throw new Pendente('símbolo fora do lugar')
    }
}

// ── A avaliação ────────────────────────────────────────────────────────────────────────────
type Valor = number | boolean

/** Arredondamento sem o ruído do ponto flutuante: 0,1·3 é 0,3, e ARREDMAIOR(0,3·10) é 3, não 4. */
const semRuido = (x: number) => Number(x.toFixed(9))

function numero(no: No, resolver: Resolver): number {
    const v = valor(no, resolver)
    if (typeof v !== 'number') throw new Pendente('comparação usada onde se esperava número')
    return v
}

function condicao(no: No, resolver: Resolver): boolean {
    const v = valor(no, resolver)
    if (typeof v !== 'boolean') throw new Pendente('número usado onde se esperava condição')
    return v
}

function valor(no: No, resolver: Resolver): Valor {
    switch (no.k) {
        case 'num': return no.v
        case 'var': {
            const r = resolver(no.nome)
            if (!r.ok) throw new Pendente(falhaDe(r).motivo, falhaDe(r).variavel)
            return r.valor
        }
        case 'neg': return -numero(no.a, resolver)
        case 'bin': {
            const a = numero(no.a, resolver)
            const b = numero(no.b, resolver)
            if (no.op === '+') return a + b
            if (no.op === '-') return a - b
            if (no.op === '*') return a * b
            if (b === 0) throw new Pendente('divisão por zero')
            return a / b
        }
        case 'cmp': {
            const a = semRuido(numero(no.a, resolver))
            const b = semRuido(numero(no.b, resolver))
            return no.op === '=' ? a === b : no.op === '>' ? a > b : a < b
        }
        case 'log': {
            const a = condicao(no.a, resolver)
            if (no.op === 'and' && !a) return false
            if (no.op === 'or' && a) return true
            return condicao(no.b, resolver)
        }
        case 'fn': {
            if (no.nome === 'IIF') return condicao(no.args[0], resolver) ? valor(no.args[1], resolver) : valor(no.args[2], resolver)
            if (no.nome === 'ARREDMAIOR') return Math.ceil(semRuido(numero(no.args[0], resolver)))
            const casas = numero(no.args[1], resolver)
            if (!Number.isInteger(casas) || casas < 0) throw new Pendente(`ROUND com ${casas} casas`)
            const f = 10 ** casas
            const x = semRuido(numero(no.args[0], resolver) * f)
            return (Math.sign(x) * Math.round(Math.abs(x))) / f
        }
    }
}

function avaliar<T extends Valor>(texto: string, resolver: Resolver, esperado: 'numero' | 'condicao'): Avaliacao<T> {
    try {
        const no = new Analisador(tokenizar(texto)).tudo()
        const v = esperado === 'numero' ? numero(no, resolver) : condicao(no, resolver)
        if (typeof v === 'number' && !Number.isFinite(v)) return { ok: false, motivo: 'resultado não é número finito' }
        return { ok: true, valor: v as T }
    } catch (e) {
        if (e instanceof Pendente) return e.variavel ? { ok: false, motivo: e.message, variavel: e.variavel } : { ok: false, motivo: e.message }
        throw e
    }
}

/** Uma fórmula que tem de dar NÚMERO: medida, quantidade, variável da família. */
export const avaliarNumero = (texto: string, resolver: Resolver) => avaliar<number>(texto, resolver, 'numero')

/** Uma fórmula que tem de dar VERDADEIRO ou FALSO: a condição da regra. */
export const avaliarCondicao = (texto: string, resolver: Resolver) => avaliar<boolean>(texto, resolver, 'condicao')
