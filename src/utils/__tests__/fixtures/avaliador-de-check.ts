/**
 * O AVALIADOR DAS CHECKs do banco, para o portão do pedido 0039-A ("orçamento que não grava não pode mais chegar à produção").
 *
 * Lê a definição como o Postgres a devolve (`pg_get_constraintdef`, a forma canônica: tudo entre parênteses, os literais com `::tipo`) e a avalia
 * sobre uma linha, com a lógica de três valores do SQL: a CHECK só RECUSA quando dá `false` — `NULL` passa, como no banco.
 *
 * FECHADO NO QUE NÃO CONHECE: função, operador ou forma que este avaliador não sabe avaliar é ERRO nomeando a CHECK, nunca "passa". Uma CHECK nova
 * que use outra coisa deixa o portão vermelho até alguém ensinar o avaliador — o lado seguro (`portao-que-nao-alcanca.md`).
 */

export type Valor = string | number | boolean | null | unknown[] | Record<string, unknown>
type No =
    | { t: 'lit'; v: Valor }
    | { t: 'col'; nome: string }
    | { t: 'e' | 'ou'; a: No; b: No }
    | { t: 'nao'; a: No }
    | { t: 'cmp'; op: string; a: No; b: No }
    | { t: 'nulo'; a: No; neg: boolean }
    | { t: 'distinto'; a: No; b: No; neg: boolean }
    | { t: 'qualquer'; op: '=' | '<>'; todos: boolean; a: No; lista: No[] }
    | { t: 'fn'; nome: string; args: No[] }

export class CheckQueNaoSeiAvaliar extends Error {}

function tokens(s: string): string[] {
    const r: string[] = []
    let i = 0
    while (i < s.length) {
        const c = s[i]
        if (/\s/.test(c)) { i++; continue }
        if (c === "'") {
            let j = i + 1
            let v = ''
            for (;;) {
                if (j >= s.length) throw new CheckQueNaoSeiAvaliar(`literal sem fim em: ${s}`)
                if (s[j] === "'" && s[j + 1] === "'") { v += "'"; j += 2; continue }
                if (s[j] === "'") break
                v += s[j++]
            }
            r.push(`'${v}`)
            i = j + 1
            continue
        }
        const dois = s.slice(i, i + 2)
        if (['::', '<>', '<=', '>=', '!='].includes(dois)) { r.push(dois === '!=' ? '<>' : dois); i += 2; continue }
        if ('()[],=<>~'.includes(c)) { r.push(c); i++; continue }
        const m = /^[A-Za-z_][A-Za-z0-9_.]*|^\d+(\.\d+)?/.exec(s.slice(i))
        if (!m) throw new CheckQueNaoSeiAvaliar(`não sei ler "${s.slice(i, i + 20)}" em: ${s}`)
        r.push(m[0])
        i += m[0].length
    }
    return r
}

/** A definição `CHECK (...)` vira a árvore; a palavra CHECK e o NOT VALID ficam fora. */
export function lerCheck(definicao: string): No {
    const corpo = definicao.trim().replace(/\s+NOT VALID$/i, '')
    if (!/^CHECK\s*\(/i.test(corpo)) throw new CheckQueNaoSeiAvaliar(`não é uma CHECK: ${definicao}`)
    const tk = tokens(corpo.replace(/^CHECK/i, ''))
    let p = 0
    const ver = () => tk[p]
    const kw = (k: string) => (tk[p] ?? '').toUpperCase() === k
    const pegar = (esperado?: string) => {
        const x = tk[p++]
        if (esperado !== undefined && (x ?? '').toUpperCase() !== esperado) throw new CheckQueNaoSeiAvaliar(`esperava "${esperado}" e veio "${x}" em: ${definicao}`)
        return x
    }
    const cast = (n: No): No => {
        while (ver() === '::') { pegar(); pegar() }
        return n
    }
    function primario(): No {
        const x = ver()
        if (x === '(') { pegar(); const e = ou(); pegar(')'); return cast(e) }
        if (x === undefined) throw new CheckQueNaoSeiAvaliar(`fim inesperado em: ${definicao}`)
        if (x.startsWith("'")) { pegar(); return cast({ t: 'lit', v: x.slice(1) }) }
        if (/^\d/.test(x)) { pegar(); return cast({ t: 'lit', v: Number(x) }) }
        const up = x.toUpperCase()
        if (up === 'TRUE' || up === 'FALSE') { pegar(); return { t: 'lit', v: up === 'TRUE' } }
        if (up === 'NULL') { pegar(); return { t: 'lit', v: null } }
        if (up === 'ARRAY') throw new CheckQueNaoSeiAvaliar(`ARRAY fora de ANY/ALL em: ${definicao}`)
        pegar()
        if (ver() === '(') {
            pegar()
            const args: No[] = []
            if (ver() !== ')') { args.push(ou()); while (ver() === ',') { pegar(); args.push(ou()) } }
            pegar(')')
            return cast({ t: 'fn', nome: x.toLowerCase(), args })
        }
        return cast({ t: 'col', nome: x })
    }
    function comparacao(): No {
        const a = primario()
        if (kw('IS')) {
            pegar()
            const neg = kw('NOT') ? (pegar(), true) : false
            if (kw('NULL')) { pegar(); return { t: 'nulo', a, neg } }
            if (kw('DISTINCT')) { pegar(); pegar('FROM'); return { t: 'distinto', a, b: primario(), neg } }
            throw new CheckQueNaoSeiAvaliar(`IS ${tk[p]} não conhecido em: ${definicao}`)
        }
        const op = ver()
        if (op && ['=', '<>', '<', '<=', '>', '>=', '~'].includes(op)) {
            pegar()
            if (kw('ANY') || kw('ALL')) {
                if (op !== '=' && op !== '<>') throw new CheckQueNaoSeiAvaliar(`${op} ANY/ALL não conhecido em: ${definicao}`)
                const todos = pegar()!.toUpperCase() === 'ALL'
                pegar('(')
                pegar('ARRAY')
                pegar('[')
                const lista: No[] = [primario()]
                while (ver() === ',') { pegar(); lista.push(primario()) }
                pegar(']')
                pegar(')')
                return { t: 'qualquer', op, todos, a, lista }
            }
            return { t: 'cmp', op, a, b: primario() }
        }
        return a
    }
    function nao(): No {
        if (kw('NOT')) { pegar(); return { t: 'nao', a: nao() } }
        return comparacao()
    }
    function e(): No {
        let a = nao()
        while (kw('AND')) { pegar(); a = { t: 'e', a, b: nao() } }
        return a
    }
    function ou(): No {
        let a = e()
        while (kw('OR')) { pegar(); a = { t: 'ou', a, b: e() } }
        return a
    }
    const arvore = ou()
    if (p !== tk.length) throw new CheckQueNaoSeiAvaliar(`sobrou "${tk.slice(p).join(' ')}" em: ${definicao}`)
    return arvore
}

/** As colunas que a CHECK lê. */
export function colunasDa(no: No): Set<string> {
    const s = new Set<string>()
    const andar = (n: No) => {
        switch (n.t) {
            case 'col': s.add(n.nome); break
            case 'lit': break
            case 'nao': case 'nulo': andar(n.a); break
            case 'fn': n.args.forEach(andar); break
            case 'qualquer': andar(n.a); n.lista.forEach(andar); break
            default: andar(n.a); andar(n.b)
        }
    }
    andar(no)
    return s
}

const ehNumero = (v: Valor) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))
function igual(a: Valor, b: Valor): boolean {
    if (typeof a === 'number' || typeof b === 'number') return ehNumero(a) && ehNumero(b) && Number(a) === Number(b)
    return a === b
}
function ordem(a: Valor, b: Valor, definicao: string): number {
    if (ehNumero(a) && ehNumero(b)) return Number(a) - Number(b)
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
    throw new CheckQueNaoSeiAvaliar(`não sei comparar ${JSON.stringify(a)} com ${JSON.stringify(b)} em: ${definicao}`)
}

/** Avalia a CHECK sobre a linha: `true`, `false` ou `null` (desconhecido, que passa no banco). Coluna ausente da linha é NULL. */
export function avaliar(no: No, linha: Record<string, unknown>, definicao = ''): boolean | null {
    const v = (n: No): Valor => {
        switch (n.t) {
            case 'lit': return n.v
            case 'col': return (linha[n.nome] ?? null) as Valor
            case 'fn': {
                const args = n.args.map(v)
                if (n.nome === 'char_length') return args[0] === null ? null : [...String(args[0])].length
                if (n.nome === 'round') {
                    if (args[0] === null) return null
                    const casas = args[1] === undefined ? 0 : Number(args[1])
                    const f = 10 ** casas
                    const x = Number(args[0])
                    return (Math.sign(x) * Math.round(Math.abs(x) * f + Number.EPSILON * f)) / f
                }
                if (n.nome === 'coalesce') return args.find((a) => a !== null) ?? null
                if (n.nome === 'jsonb_typeof') {
                    const a = args[0]
                    if (a === null) return null
                    return Array.isArray(a) ? 'array' : typeof a === 'object' ? 'object' : typeof a === 'string' ? 'string' : typeof a === 'number' ? 'number' : 'boolean'
                }
                throw new CheckQueNaoSeiAvaliar(`a função ${n.nome} não é conhecida pelo avaliador: ${definicao}`)
            }
            default: return logico(n)
        }
    }
    const logico = (n: No): boolean | null => {
        switch (n.t) {
            case 'e': { const a = logico(n.a), b = logico(n.b); return a === false || b === false ? false : a === null || b === null ? null : true }
            case 'ou': { const a = logico(n.a), b = logico(n.b); return a === true || b === true ? true : a === null || b === null ? null : false }
            case 'nao': { const a = logico(n.a); return a === null ? null : !a }
            case 'nulo': { const a = v(n.a); return (a === null) !== n.neg }
            case 'distinto': {
                const a = v(n.a), b = v(n.b)
                const distintos = a === null || b === null ? a !== b : !igual(a, b)
                return distintos !== n.neg
            }
            case 'qualquer': {
                const a = v(n.a)
                if (a === null) return null
                const iguais = n.lista.map((x) => igual(a, v(x)))
                if (n.op === '=') return n.todos ? iguais.every(Boolean) : iguais.some(Boolean)
                return n.todos ? iguais.every((x) => !x) : iguais.some((x) => !x)
            }
            case 'cmp': {
                const a = v(n.a), b = v(n.b)
                if (a === null || b === null) return null
                if (n.op === '~') return new RegExp(String(b)).test(String(a))
                if (n.op === '=') return igual(a, b)
                if (n.op === '<>') return !igual(a, b)
                const d = ordem(a, b, definicao)
                return n.op === '<' ? d < 0 : n.op === '<=' ? d <= 0 : n.op === '>' ? d > 0 : d >= 0
            }
            case 'lit': case 'col': case 'fn': {
                const x = v(n)
                if (x === null) return null
                if (typeof x === 'boolean') return x as boolean
                throw new CheckQueNaoSeiAvaliar(`${JSON.stringify(x)} não é booleano em: ${definicao}`)
            }
        }
    }
    return logico(no)
}

export type CheckDoBanco = { tabela: string; nome: string; definicao: string; arvore: No; colunas: Set<string> }
export function lerChecks(lista: ReadonlyArray<readonly [string, string, string]>): CheckDoBanco[] {
    return lista.map(([tabela, nome, definicao]) => {
        const arvore = lerCheck(definicao)
        return { tabela, nome, definicao, arvore, colunas: colunasDa(arvore) }
    })
}

/**
 * As CHECKs que a linha VIOLA (dão `false`). `escritas`: as colunas que a operação escreve — num UPDATE, a CHECK que não lê nenhuma delas não muda
 * de resultado (a linha já passava), e não é avaliada; num INSERT, todas são (`escritas` nulo).
 */
export function violadas(checks: readonly CheckDoBanco[], tabela: string, linha: Record<string, unknown>, escritas: ReadonlySet<string> | null): CheckDoBanco[] {
    return checks.filter((c) => c.tabela === tabela && (escritas === null || [...c.colunas].some((x) => escritas.has(x))) && avaliar(c.arvore, linha, c.definicao) === false)
}
