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
 *   - números, com VÍRGULA decimal ("4,2"): 2.142 ocorrências de dígito,dígito, todas decimais;
 *   - variáveis conhecidas (o chamador as resolve — `resolver`);
 *   - `+`, `-` e `−` (o sinal de menos tipográfico); `*` e `·` (o ponto médio); `/`; parênteses;
 *   - na CONDIÇÃO: `=`, `>`, `<`, `and`, `or`. NÃO existem `<>`, `>=` nem `<=` no arquivo; se um
 *     dia aparecerem, a regra vai para pendentes — não são lidos "do jeito óbvio";
 *   - na QUANTIDADE, três funções, com a aridade MEDIDA: `IIF(condição, a, b)` — 314 ocorrências,
 *     SEMPRE 3 argumentos; `ARREDMAIOR(x)`, arredonda para cima — 166, SEMPRE 1; `ROUND(x)` — 36,
 *     SEMPRE 1. O ROUND NÃO TEM o argumento de casas: "ROUND(QTPAL*0,8)" é ROUND(QTPAL × 0,8), e
 *     lê-lo com dois argumentos calcularia errado em silêncio.
 *
 * ══ O SÍMBOLO COM "&" É PENDENTE, NOMEANDO O SÍMBOLO ══
 * "&ARI", "&MAI", "&MAE", "&FV", "&FF", "&J", "&PF", "&MD": medido em 20/10/2026, 40 das 137
 * fórmulas da família os usam, e 0 das 4.055 regras. NÃO HÁ TABELA com esses valores, e nunca se
 * chuta: a fórmula vai para pendentes com o símbolo nomeado como a variável que faltou.
 *
 * QUALQUER COISA FORA DISSO NÃO É ADIVINHADA: devolve `ok: false` com o motivo, e quem chamou põe a
 * fórmula, COMO ESTÁ ESCRITA, em pendentes.
 *
 * ══ A VÍRGULA É DECIDIDA PELA ARIDADE CONHECIDA, NÃO PELO TEXTO (dono do produto, 20/10/2026) ══
 * A mesma vírgula é decimal em "4,2" e separador em "IIF(UT=1,8,4)". Quem decide é a função em que
 * ela está:
 *   - no topo da fórmula e dentro de parênteses comuns: vírgula colada entre dígitos é DECIMAL;
 *   - nos argumentos do IIF, que espera 3: a vírgula de topo é SEPARADOR — "IIF(UT=1,8,4)" tem 3;
 *   - nos de ROUND e ARREDMAIOR, que esperam 1: a vírgula de topo colada entre dígitos é DECIMAL,
 *     nunca separador — "ROUND(QTPAL*0,8)" tem 1;
 *   - função desconhecida: pendente, com a fórmula literal;
 *   - contagem que não fecha com a aridade: pendente com o motivo "VÍRGULA AMBÍGUA" — não se tenta
 *     desambiguar. Na família, 13 fórmulas caem aqui (20/10/2026).
 * Medido: os 314 IIF dão exatamente 3, os 166 ARREDMAIOR e os 36 ROUND dão 1. Nenhum caso real fica
 * ambíguo com esta regra. Um decimal escrito solto num argumento do IIF ("IIF(L>1000,0,5,1)") dá
 * 4 argumentos e vai para pendentes; dentro de parênteses ("IIF(UT=1,(NF*0,5),2)") ele é decimal.
 *
 * ══ O PONTO ENTRE DÍGITOS VAI PARA PENDENTES ══
 * Em pt-BR o ponto seria milhar, e adivinhar entre milhar e decimal é afirmar um número que ninguém
 * escreveu. Medido: ZERO ocorrências de dígito.dígito — HOJE, NESTE ARQUIVO. Não é garantia para o
 * próximo arquivo nem para a próxima versão deste.
 *
 * ══ O MEIO EXATO DO ROUND VAI PARA PENDENTES ══
 * Não se mediu como o WVetro arredonda o meio (2,5 vira 2 ou 3?). Fora do meio exato não há
 * dúvida; no meio exato, a quantidade vai para pendentes em vez de escolher um lado.
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
export const FUNCOES_ACEITAS = { IIF: 3, ARREDMAIOR: 1, ROUND: 1 } as const

/** Os operadores de comparação medidos na condição. */
export const COMPARACOES_ACEITAS = ['=', '>', '<'] as const

class Pendente extends Error {
    constructor(motivo: string, public variavel?: string) { super(motivo) }
}

// ── Tokens ─────────────────────────────────────────────────────────────────────────────────
// A vírgula NÃO é decidida aqui: sai como token próprio, com a posição, e o analisador decide pela
// função em que ela está.
type Token =
    | { t: 'int'; texto: string; ini: number; fim: number }
    | { t: 'id'; v: string }
    | { t: 'op'; v: '+' | '-' | '*' | '/' | '=' | '>' | '<' }
    | { t: '(' } | { t: ')' }
    | { t: ','; ini: number }

function tokenizar(texto: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    while (i < texto.length) {
        const c = texto[i]
        if (/\s/.test(c)) { i++; continue }
        if (/\d/.test(c)) {
            const t = /^\d+/.exec(texto.slice(i))![0]
            if (texto[i + t.length] === '.' && /\d/.test(texto[i + t.length + 1] ?? '')) {
                throw new Pendente(`ponto entre dígitos ("${t}.${texto[i + t.length + 1]}") — em pt-BR o ponto seria milhar, e não se adivinha`)
            }
            tokens.push({ t: 'int', texto: t, ini: i, fim: i + t.length })
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
        if (c === ',') { tokens.push({ t: ',', ini: i }); i++; continue }
        if (c === '&') {
            const simbolo = `&${/^[A-Za-z0-9_]*/.exec(texto.slice(i + 1))![0]}`
            throw new Pendente(`símbolo "${simbolo}" sem tabela de valores — não se chuta`, simbolo)
        }
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
    /** A vírgula colada entre dígitos é decimal AQUI? Não, só nos argumentos do IIF. */
    private virgulaDecimal = true
    constructor(private tokens: Token[]) {}

    private olhar(k = 0): Token | undefined { return this.tokens[this.p + k] }
    private ehPalavra(palavra: 'and' | 'or'): boolean {
        const t = this.olhar()
        return t?.t === 'id' && t.v.toLowerCase() === palavra
    }
    /** Lê um trecho com a vírgula num modo, e devolve o modo de antes. */
    private com<T>(decimal: boolean, f: () => T): T {
        const antes = this.virgulaDecimal
        this.virgulaDecimal = decimal
        try { return f() } finally { this.virgulaDecimal = antes }
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
        if (t.t === 'int') {
            this.p++
            const v = this.olhar()
            const d = this.olhar(1)
            // Decimal: inteiro, vírgula e inteiro COLADOS, onde a vírgula é decimal.
            if (this.virgulaDecimal && v?.t === ',' && v.ini === t.fim && d?.t === 'int' && d.ini === v.ini + 1) {
                this.p += 2
                return { k: 'num', v: Number(`${t.texto}.${d.texto}`) }
            }
            return { k: 'num', v: Number(t.texto) }
        }
        if (t.t === '(') {
            this.p++
            const no = this.com(true, () => this.ou())
            if (this.olhar()?.t !== ')') throw new Pendente('parêntese aberto e não fechado, ou vírgula fora de função')
            this.p++
            return no
        }
        if (t.t === 'id') {
            this.p++
            if (this.olhar()?.t !== '(') return { k: 'var', nome: t.v }
            if (!(t.v in FUNCOES_ACEITAS)) throw new Pendente(`função "${t.v}" fora das medidas (${Object.keys(FUNCOES_ACEITAS).join(', ')})`)
            const nome = t.v as keyof typeof FUNCOES_ACEITAS
            this.p++
            // Pela aridade conhecida: no IIF (3) a vírgula de topo separa; no ROUND e no ARREDMAIOR (1)
            // a vírgula de topo colada entre dígitos é decimal, e o que sobrar conta como argumento a mais.
            const args = this.com(nome !== 'IIF', () => {
                const lidos: No[] = []
                if (this.olhar()?.t === ')') return lidos
                lidos.push(this.ou())
                while (this.olhar()?.t === ',') { this.p++; lidos.push(this.ou()) }
                return lidos
            })
            if (this.olhar()?.t !== ')') throw new Pendente(`a chamada de ${nome} não fecha o parêntese`)
            this.p++
            // VÍRGULA AMBÍGUA: a contagem não fecha com a aridade medida, e a gramática não decide
            // entre as leituras ("80.64/8" ou "80/64.8"?). Medido: 13 fórmulas da família caem aqui.
            if (args.length !== FUNCOES_ACEITAS[nome]) throw new Pendente(`vírgula ambígua: ${nome} com ${args.length} item(ns) separados por vírgula, e a aridade é ${FUNCOES_ACEITAS[nome]}`)
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
            const x = semRuido(numero(no.args[0], resolver))
            if (Math.abs(x % 1) === 0.5) throw new Pendente(`ROUND no meio exato (${x}): o arredondamento do WVetro no meio não foi medido`)
            return Math.round(x)
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
