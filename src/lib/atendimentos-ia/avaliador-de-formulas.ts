/**
 * Atendimentos I.A. — o AVALIADOR DE FÓRMULAS do motor do fornecedor: dada uma TIPOLOGIA (as abas
 * 'Detalhe Tipologias', 'Variáveis', 'Fórmulas', 'Perfis' e 'Validações' do arquivo do motor), L e H
 * em mm e as escolhas das variáveis, a lista de PEÇAS — a entrada do agrupador de barras
 * (`agrupador-de-barras.ts`). Função PURA: não lê banco nem rede. Começou SÓ pela DP-02 (24/10/2026).
 *
 * NÃO HÁ eval NEM new Function: a fórmula passa por um tokenizador e um parser de descida recursiva,
 * e a árvore é avaliada aqui. O portão afirma isso lendo esta fonte.
 *
 * A ARITMÉTICA É RACIONAL EXATA (numerador e denominador em BigInt). As fórmulas têm decimais
 * (88.4, 104.2) e divisões (/450, /NF), e o ARREDMAIOR é um teto: em ponto flutuante,
 * ARREDMAIOR((0.1+0.2)*10) daria 4, porque (0.1+0.2)*10 = 3.0000000000000004 (medido). Com
 * racionais o teto é exato, e `=` é igualdade de verdade. O comprimento SAI em mm arredondado ao
 * micrômetro (meio para cima) — a mesma unidade inteira em que o agrupador conta.
 *
 * A GRAMÁTICA, medida no arquivo da Wolff:
 *     ou   := e ('or' e)*                 e    := cmp ('and' cmp)*
 *     cmp  := soma (('='|'<'|'>'|'<='|'>=') soma)?
 *     soma := prod (('+'|'-') prod)*      prod := prim (('*'|'/') prim)*
 *     prim := número | '&' NOME | NOME '(' args ')' | NOME | '(' ou ')'
 *   - número com PONTO decimal (88.4). A VÍRGULA é separador de argumento: a família escreve
 *     "(HMC-87,8)" e "IIF(M=1,80,64,8)", e essas formas são RECUSADAS (`NAO_PARSEIA`, ou IIF com 4
 *     argumentos) em vez de lidas por adivinhação. A DP-02 não as usa;
 *   - funções: IIF(cond, a, b) e ARREDMAIOR(x) = teto. Nome e número de argumentos são conferidos
 *     NA LEITURA da fórmula, inclusive no ramo que não vai rodar: função desconhecida nunca passa
 *     por estar num IIF que não escolheu aquele lado;
 *   - IIF, `and` e `or` só avaliam o que precisam. É o que a fórmula da DP-02 exige:
 *     HARI = IIF(ARI<3, …, (H+&MAI)), e com ARI = 1 o MAI fica no padrão, cuja opção não tem
 *     colchete — avaliar o outro ramo recusaria uma janela que não usa o MAI;
 *   - 'sempre', na coluna Condição, é verdadeiro.
 *
 * DE ONDE VEM O VALOR DE UM NOME, nesta ordem:
 *   1. L e H, da entrada;
 *   2. a aba 'Fórmulas' DA TIPOLOGIA — resolvida por dependência (HBAG → HFOL → HMC → H−Y), com
 *      memória, e com CICLO detectado e recusado com a cadeia, em vez de estourar a pilha;
 *   3. a aba 'Variáveis': a escolha, ou o Padrão. O Padrão pode ser número ("1") ou nome
 *      ("WOLFIL"), e o nome é resolvido de novo por esta mesma ordem;
 *   4. as CONSTANTES do Leia-me: WOLFIL = 0, WOLFIH = 0, WOLSPVC = 6.
 *   Nome que não está em lugar nenhum é `VARIAVEL_SEM_VALOR`. Nome que está na aba 'Fórmulas' E na
 *   'Variáveis' é recusado antes de avaliar (`NOME_EM_DUAS_FONTES`): não se escolhe um dos dois.
 *
 * `&X` é o número entre colchetes da opção ESCOLHIDA na variável X ("[33,00]" → 33). A opção SEM
 * colchete — DECISÃO DO DONO DO PRODUTO, 25/10/2026, que substitui a recusa de antes:
 *   - se o nome NÃO anuncia acréscimo, `&X` = 0. Fundamento, do Leia-me do motor: "&MAE, &ARI, &FV,
 *     &FF etc. são o valor (mm) da opção escolhida"; em MAE as opções 2 e 3 são "VÃO+50MM [50,00]" e
 *     "VÃO+100MM [100,00]" — o colchete é o "+50" do nome —, e "MEDIDA DO VÃO" é o arremate igual ao
 *     vão: soma zero. Regra geral, não exceção da DP-02;
 *   - se o nome ANUNCIA acréscimo ("+" seguido de número) e o colchete falta, é
 *     `MEDIDA_DA_OPCAO_AUSENTE`: o número do nome não é lido no lugar do colchete.
 * Até 25/10/2026 toda opção sem colchete era recusa (`faltou-dado-recusa-nomeada.md`, aparição 5), e
 * os padrões da DP-02 não fechavam; a decisão está registrada lá, datada.
 *
 * O QUE ESTE MÓDULO NÃO FAZ, e por quê:
 *   - NÃO avalia a coluna Condição da aba 'Variáveis'. Ela diz QUANDO perguntar a variável ao
 *     vendedor, não quais peças entram; e ela cita `ARR`, que não está definido em aba nenhuma do
 *     fixture da DP-02 (medido). Avaliá-la travaria toda janela por um nome que ninguém define;
 *   - NÃO lê 'Fórmulas da família'. Ela é a fórmula mais comum entre as tipologias da família
 *     ("% padrão"), com as variáveis da família (NF = 4), e a DP-02 tem fórmula própria em
 *     'Fórmulas'. Medido: das 16 variáveis comparadas, 9 divergem;
 *   - NÃO devolve vidros (aba 'Vidros'): eles não são cortados em barra. Só PERFIS;
 *   - o código da peça sai como está na coluna Perfil ("BZ0006/WOLFF"). Ligá-lo ao código do item
 *     da tabela de preço é outro passo.
 *
 * O BAGUETE É ESCOLHIDO PELA ESPESSURA DO VIDRO (Leia-me: "GB25/GB34 → 5,6,8 mm; GB8/GB19 → 18,20,21,
 * 24 mm"). Linha com 'Esp. vidro' só entra se a espessura informada estiver na lista. Sem espessura,
 * cada uma dessas linhas é recusada; com uma espessura que nenhum baguete atende, a avaliação é
 * recusada — o vidro ficaria sem baguete em silêncio.
 *
 * OS LIMITES NÃO TRAVAM (Leia-me: "fora do limite NÃO TRAVA: calcula e marca ⚠ ao vendedor (mm e
 * %)"). Condição da aba 'Validações' falsa vira AVISO com a mensagem e os valores dos nomes da
 * condição; L ou H fora dos limites do 'Detalhe Tipologias' vira AVISO com o valor, o limite, e o
 * excesso em mm e em %. Limite NULL não é limite (`ausente-vs-falso.md`).
 *
 * TODA RECUSA É NOMEADA — a linha da aba Perfis, o perfil, o campo (Condição, Qtd, Medida, Esp.
 * vidro), a variável e a fórmula onde o erro nasceu —, e todas saem: uma não esconde as outras.
 *
 * Para separar as duas formas do resultado, use `'recusas' in r` (e `'recusa' in r` em
 * `avaliarTexto`): com `strictNullChecks: false`, o tsc não estreita a união pelo booleano `ok`.
 *
 * Portão: `src/utils/__tests__/avaliador-de-formulas.test.ts`. Mutações:
 * `scripts/harness/avaliador-de-formulas/`.
 */

// ── As constantes do Leia-me ──────────────────────────────────────────────────────────────
/** Leia-me do Motor_Wolf_PVC.xlsx: "X = WOLFIL e Y = WOLFIH (globais = 0)"; "SPVCAL = WOLSPVC = 6 mm". */
export const CONSTANTES_DO_LEIA_ME: Readonly<Record<string, number>> = { WOLFIL: 0, WOLFIH: 0, WOLSPVC: 6 }

// ── A tipologia ───────────────────────────────────────────────────────────────────────────
/**
 * Uma linha da aba Variáveis. `descricao` e `condicao` não são lidas pelo avaliador: são o que a
 * conversa usa para perguntar a escolha ao vendedor, e QUANDO perguntar (`escolhas-da-tipologia.ts`).
 */
export type VariavelDaTipologia = { variavel: string; descricao: string | null; padrao: string | null; condicao: string | null; opcoes: string | null }
export type FormulaDaTipologia = { variavel: string; formula: string }
export type PerfilDaTipologia = {
    perfil: string; descricao: string; corte: string; qtd: string; medida: string; posicao: string; esp_vidro: string | null; condicao: string
}
export type ValidacaoDaTipologia = { condicao: string; mensagem: string }
export type Tipologia = {
    codigo: string
    detalhe: { larg_min_mm: number | null; larg_max_mm: number | null; alt_min_mm: number | null; alt_max_mm: number | null }
    variaveis: VariavelDaTipologia[]
    formulas: FormulaDaTipologia[]
    perfis: PerfilDaTipologia[]
    validacoes: ValidacaoDaTipologia[]
}

// ── A saída ───────────────────────────────────────────────────────────────────────────────
/** A peça — `codigo`, `comprimento_mm` e `quantidade` são o que o agrupador de barras lê. */
export type PecaDoPerfil = { codigo: string; descricao: string; comprimento_mm: number; quantidade: number; corte: string; posicao: string }
export type LinhaAvaliada = { linha: number; perfil: string; entrou: boolean; motivo: 'CONDICAO_FALSA' | 'ESPESSURA_NAO_ATENDIDA' | 'QUANTIDADE_ZERO' | null }
export type AvisoDoAvaliador =
    | { origem: 'VALIDACAO'; condicao: string; mensagem: string; valores: Record<string, number> }
    | { origem: 'LIMITE'; medida: 'L' | 'H'; limite: 'MIN' | 'MAX'; valor_mm: number; limite_mm: number; excesso_mm: number; excesso_pct: number }
export type MotivoDaRecusa =
    | 'NAO_PARSEIA' | 'FUNCAO_DESCONHECIDA' | 'ARGUMENTOS_DA_FUNCAO' | 'TIPO_ERRADO' | 'DIVISAO_POR_ZERO' | 'VARIAVEL_SEM_VALOR' | 'CICLO'
    | 'VARIAVEL_SEM_OPCOES' | 'OPCAO_INEXISTENTE' | 'MEDIDA_DA_OPCAO_AUSENTE' | 'OPCOES_NAO_PARSEIAM' | 'NOME_EM_DUAS_FONTES'
    | 'ESCOLHA_DESCONHECIDA' | 'ESCOLHA_FORA_DAS_OPCOES' | 'MEDIDA_INVALIDA'
    | 'QUANTIDADE_NAO_INTEIRA' | 'QUANTIDADE_NEGATIVA' | 'COMPRIMENTO_NAO_POSITIVO'
    | 'ESPESSURA_DO_VIDRO_AUSENTE' | 'ESPESSURAS_NAO_PARSEIAM' | 'NENHUM_BAGUETE_PARA_A_ESPESSURA'
    | 'ABA_AUSENTE' | 'CABECALHO_AUSENTE' | 'TIPOLOGIA_AUSENTE' | 'VALOR_INVALIDO'
export type RecusaDoAvaliador = {
    motivo: MotivoDaRecusa
    mensagem: string
    linha?: number
    perfil?: string
    campo?: 'Condição' | 'Qtd' | 'Medida' | 'Esp. vidro' | 'Validação' | 'L' | 'H' | 'Espessura do vidro' | 'Escolha'
    variavel?: string
    formula?: string
    cadeia?: string[]
    aba?: string
    coluna?: string
    espessura_vidro_mm?: number
    comprimento_mm?: number
    quantidade?: number
}
export type ResultadoDaAvaliacao =
    | { ok: true; pecas: PecaDoPerfil[]; linhas: LinhaAvaliada[]; avisos: AvisoDoAvaliador[] }
    | { ok: false; recusas: RecusaDoAvaliador[] }
export type EntradaDoAvaliador = {
    tipologia: Tipologia
    L_mm: number
    H_mm: number
    escolhas?: Readonly<Record<string, number>>
    espessura_vidro_mm?: number | null
}

// ── O racional exato ──────────────────────────────────────────────────────────────────────
type Q = { n: bigint; d: bigint }
const Z = BigInt(0)
const UM = BigInt(1)
const MIL = BigInt(1000)
const DOIS = BigInt(2)
const DEZ = BigInt(10)

function mdc(a: bigint, b: bigint): bigint {
    let x = a < Z ? -a : a
    let y = b < Z ? -b : b
    while (y !== Z) { const t = x % y; x = y; y = t }
    return x
}
function racional(n: bigint, d: bigint = UM): Q {
    if (d < Z) { n = -n; d = -d }
    const g = mdc(n, d)
    return g === Z || g === UM ? { n, d } : { n: n / g, d: d / g }
}
const soma = (a: Q, b: Q) => racional(a.n * b.d + b.n * a.d, a.d * b.d)
const subtracao = (a: Q, b: Q) => racional(a.n * b.d - b.n * a.d, a.d * b.d)
const produto = (a: Q, b: Q) => racional(a.n * b.n, a.d * b.d)
function quociente(a: Q, b: Q): Q {
    if (b.n === Z) throw new ErroDeAvaliacao('DIVISAO_POR_ZERO', 'Divisão por zero.')
    return racional(a.n * b.d, a.d * b.n)
}
const compara = (a: Q, b: Q) => { const x = a.n * b.d - b.n * a.d; return x < Z ? -1 : x > Z ? 1 : 0 }
/** O teto: para n ≥ 0, ⌈n/d⌉ = (n + d − 1) / d; para n < 0, a divisão do BigInt (que trunca para o zero) já é o teto. */
const teto = (a: Q): Q => racional(a.n >= Z ? (a.n + a.d - UM) / a.d : a.n / a.d)
const ehInteiro = (a: Q) => a.d === UM
/** Número decimal escrito com ponto ("88.4") ou, nos colchetes das opções, com vírgula ("33,00"). */
function deDecimal(texto: string, separador: '.' | ','): Q | null {
    const m = (separador === '.' ? /^(\d+)(?:\.(\d+))?$/ : /^(\d+)(?:,(\d+))?$/).exec(texto)
    if (!m) return null
    const casas = m[2] ?? ''
    let escala = UM
    for (let k = 0; k < casas.length; k++) escala *= DEZ   // sem `**`: o alvo ES2015 não exponencia bigint
    return racional(BigInt(m[1] + casas), escala)
}
/** Um número da entrada, pelo texto decimal dele — sem notação exponencial. */
function deNumero(x: number): Q | null {
    if (!Number.isFinite(x)) return null
    const t = String(x)
    const neg = t.startsWith('-')
    const q = deDecimal(neg ? t.slice(1) : t, '.')
    return q === null ? null : neg ? racional(-q.n, q.d) : q
}
const paraNumero = (a: Q) => Number(a.n) / Number(a.d)
/** Em mm, arredondado ao micrômetro, meio para cima (para o lado do +∞). */
function aoMicrometro(a: Q): number {
    const m = a.n * MIL
    let r = m / a.d
    const resto = m - r * a.d
    if (resto !== Z && (resto < Z ? -resto : resto) * DOIS >= a.d) r = resto > Z ? r + UM : r
    return Number(r) / 1000
}

// ── O erro de avaliação ───────────────────────────────────────────────────────────────────
class ErroDeAvaliacao extends Error {
    motivo: MotivoDaRecusa
    variavel?: string
    formula?: string
    cadeia?: string[]
    constructor(motivo: MotivoDaRecusa, mensagem: string, extra: { variavel?: string; formula?: string; cadeia?: string[] } = {}) {
        super(mensagem)
        this.motivo = motivo
        Object.assign(this, extra)
    }
}

// ── O tokenizador ─────────────────────────────────────────────────────────────────────────
type Token = { t: 'num' | 'nome' | 'op' | 'amp' | 'fim'; v: string; pos: number }
const OPERADORES = ['<=', '>=', '+', '-', '*', '/', '(', ')', ',', '=', '<', '>']

function tokens(texto: string): Token[] {
    const saida: Token[] = []
    let i = 0
    while (i < texto.length) {
        const c = texto[i]
        if (c === ' ' || c === '\t') { i++; continue }
        const num = /^\d+(?:\.\d+)?/.exec(texto.slice(i))
        if (num) { saida.push({ t: 'num', v: num[0], pos: i }); i += num[0].length; continue }
        const nome = /^[A-Za-z_][A-Za-z0-9_]*/.exec(texto.slice(i))
        if (nome) {
            saida.push({ t: nome[0] === 'and' || nome[0] === 'or' ? 'op' : 'nome', v: nome[0], pos: i })
            i += nome[0].length
            continue
        }
        if (c === '&') { saida.push({ t: 'amp', v: '&', pos: i }); i++; continue }
        const op = OPERADORES.find((o) => texto.startsWith(o, i))
        if (op) { saida.push({ t: 'op', v: op, pos: i }); i += op.length; continue }
        throw new ErroDeAvaliacao('NAO_PARSEIA', `A fórmula "${texto}" tem um caractere que não se lê na posição ${i + 1}: "${c}".`)
    }
    saida.push({ t: 'fim', v: '', pos: texto.length })
    return saida
}

// ── O parser ──────────────────────────────────────────────────────────────────────────────
type No =
    | { k: 'num'; v: Q }
    | { k: 'nome'; nome: string }
    | { k: 'amp'; nome: string }
    | { k: 'bin'; op: string; a: No; b: No }
    | { k: 'fn'; nome: 'IIF' | 'ARREDMAIOR'; args: No[] }

/** As funções do arquivo e o número de argumentos de cada uma (Leia-me). */
const FUNCOES: Readonly<Record<string, number>> = { IIF: 3, ARREDMAIOR: 1 }

function ler(texto: string): No {
    const ts = tokens(texto)
    let i = 0
    const olha = () => ts[i]
    const naoLe = (o: string): never => {
        const t = olha()
        throw new ErroDeAvaliacao('NAO_PARSEIA', `A fórmula "${texto}" não se lê na posição ${t.pos + 1}: esperava ${o}, veio ${t.t === 'fim' ? 'o fim' : `"${t.v}"`}.`)
    }
    const ehOp = (v: string) => olha().t === 'op' && olha().v === v

    function ou(): No {
        let a = e()
        while (ehOp('or')) { i++; a = { k: 'bin', op: 'or', a, b: e() } }
        return a
    }
    function e(): No {
        let a = cmp()
        while (ehOp('and')) { i++; a = { k: 'bin', op: 'and', a, b: cmp() } }
        return a
    }
    function cmp(): No {
        const a = somaOuSub()
        const t = olha()
        if (t.t === 'op' && ['=', '<', '>', '<=', '>='].includes(t.v)) { i++; return { k: 'bin', op: t.v, a, b: somaOuSub() } }
        return a
    }
    function somaOuSub(): No {
        let a = prodOuQuoc()
        while (ehOp('+') || ehOp('-')) { const op = olha().v; i++; a = { k: 'bin', op, a, b: prodOuQuoc() } }
        return a
    }
    function prodOuQuoc(): No {
        let a = prim()
        while (ehOp('*') || ehOp('/')) { const op = olha().v; i++; a = { k: 'bin', op, a, b: prim() } }
        return a
    }
    function prim(): No {
        const t = olha()
        if (t.t === 'num') { i++; return { k: 'num', v: deDecimal(t.v, '.') as Q } }
        if (t.t === 'amp') {
            i++
            const n = olha()
            if (n.t !== 'nome') naoLe('um nome depois de "&"')
            i++
            return { k: 'amp', nome: n.v }
        }
        if (t.t === 'nome') {
            i++
            if (!ehOp('(')) return { k: 'nome', nome: t.v }
            i++
            const args: No[] = [ou()]
            while (ehOp(',')) { i++; args.push(ou()) }
            if (!ehOp(')')) naoLe('")"')
            i++
            const aridade = FUNCOES[t.v]
            if (aridade === undefined) {
                throw new ErroDeAvaliacao('FUNCAO_DESCONHECIDA', `A fórmula "${texto}" usa a função "${t.v}", que não existe aqui: as funções são IIF e ARREDMAIOR.`)
            }
            if (args.length !== aridade) {
                throw new ErroDeAvaliacao('ARGUMENTOS_DA_FUNCAO', `A fórmula "${texto}" chama ${t.v} com ${args.length} argumento(s); ${t.v} recebe ${aridade}.`)
            }
            return { k: 'fn', nome: t.v as 'IIF' | 'ARREDMAIOR', args }
        }
        if (ehOp('(')) {
            i++
            const dentro = ou()
            if (!ehOp(')')) naoLe('")"')
            i++
            return dentro
        }
        return naoLe('um número, um nome ou "("')
    }

    const arvore = ou()
    if (olha().t !== 'fim') naoLe('o fim da fórmula')
    return arvore
}

/** Os nomes que aparecem numa árvore, na ordem em que aparecem, sem repetir. */
function nomesDa(no: No, saida: string[] = []): string[] {
    if (no.k === 'nome' && !saida.includes(no.nome)) saida.push(no.nome)
    if (no.k === 'bin') { nomesDa(no.a, saida); nomesDa(no.b, saida) }
    if (no.k === 'fn') no.args.forEach((x) => nomesDa(x, saida))
    return saida
}

// ── A avaliação ───────────────────────────────────────────────────────────────────────────
type Valor = { tipo: 'n'; q: Q } | { tipo: 'b'; b: boolean }
type Ambiente = { nome: (nome: string, pilha: string[]) => Q; amp: (nome: string) => Q }

function numeroDe(v: Valor, onde: string): Q {
    if (v.tipo !== 'n') throw new ErroDeAvaliacao('TIPO_ERRADO', `${onde}: esperava um número, veio uma condição.`)
    return v.q
}
function condicaoDe(v: Valor, onde: string): boolean {
    if (v.tipo !== 'b') throw new ErroDeAvaliacao('TIPO_ERRADO', `${onde}: esperava uma condição, veio um número.`)
    return v.b
}

function valorDo(no: No, amb: Ambiente, pilha: string[]): Valor {
    switch (no.k) {
        case 'num': return { tipo: 'n', q: no.v }
        case 'nome': return { tipo: 'n', q: amb.nome(no.nome, pilha) }
        case 'amp': return { tipo: 'n', q: amb.amp(no.nome) }
        case 'fn': {
            if (no.nome === 'IIF') {
                // só o ramo escolhido é avaliado
                return condicaoDe(valorDo(no.args[0], amb, pilha), 'O primeiro argumento do IIF')
                    ? valorDo(no.args[1], amb, pilha) : valorDo(no.args[2], amb, pilha)
            }
            return { tipo: 'n', q: teto(numeroDe(valorDo(no.args[0], amb, pilha), 'O argumento do ARREDMAIOR')) }
        }
        case 'bin': {
            if (no.op === 'and') {
                return { tipo: 'b', b: condicaoDe(valorDo(no.a, amb, pilha), 'O lado esquerdo do and') && condicaoDe(valorDo(no.b, amb, pilha), 'O lado direito do and') }
            }
            if (no.op === 'or') {
                return { tipo: 'b', b: condicaoDe(valorDo(no.a, amb, pilha), 'O lado esquerdo do or') || condicaoDe(valorDo(no.b, amb, pilha), 'O lado direito do or') }
            }
            const a = numeroDe(valorDo(no.a, amb, pilha), `O lado esquerdo de "${no.op}"`)
            const b = numeroDe(valorDo(no.b, amb, pilha), `O lado direito de "${no.op}"`)
            switch (no.op) {
                case '+': return { tipo: 'n', q: soma(a, b) }
                case '-': return { tipo: 'n', q: subtracao(a, b) }
                case '*': return { tipo: 'n', q: produto(a, b) }
                case '/': return { tipo: 'n', q: quociente(a, b) }
                case '=': return { tipo: 'b', b: compara(a, b) === 0 }
                case '<': return { tipo: 'b', b: compara(a, b) < 0 }
                case '>': return { tipo: 'b', b: compara(a, b) > 0 }
                case '<=': return { tipo: 'b', b: compara(a, b) <= 0 }
                default: return { tipo: 'b', b: compara(a, b) >= 0 }
            }
        }
    }
}

/** Lê e avalia um texto; o erro que nasce aqui leva este texto como a fórmula onde nasceu. */
function avaliar(texto: string, amb: Ambiente, pilha: string[]): Valor {
    try {
        return valorDo(ler(texto), amb, pilha)
    } catch (e) {
        if (e instanceof ErroDeAvaliacao && e.formula === undefined) e.formula = texto
        throw e
    }
}

// ── As opções de uma variável ─────────────────────────────────────────────────────────────
type Opcao = { valor: number; rotulo: string; medida: Q | null }
/**
 * As opções de uma variável, para quem PERGUNTA a escolha: o número e o rótulo, sem o valor entre
 * colchetes. O MESMO leitor do avaliador — um segundo leitor das mesmas opções poderia discordar dele.
 */
export function opcoesDaVariavel(texto: string | null): Array<{ valor: number; rotulo: string }> | null {
    if (texto === null) return null
    const lidas = opcoesDe(texto)
    return lidas === null ? null : lidas.map((o) => ({ valor: o.valor, rotulo: o.rotulo }))
}
/** O nome da opção anuncia um acréscimo: "VÃO+50MM", "VÃO + 100 MM". */
const ANUNCIA_ACRESCIMO = /\+\s*\d/

/** "1 = BZ0006 - ARREMATE 65MM [33,00]; 4 = SEM ARREMATE INTERNO" → as opções, ou null se um pedaço não casar. */
function opcoesDe(texto: string): Opcao[] | null {
    const saida: Opcao[] = []
    for (const pedaco of texto.split(';')) {
        const m = /^\s*(\d+)\s*=\s*(.+?)(?:\s*\[(\d+(?:,\d+)?)\])?\s*$/.exec(pedaco)
        if (!m) return null
        saida.push({ valor: Number(m[1]), rotulo: m[2], medida: m[3] === undefined ? null : deDecimal(m[3], ',') })
    }
    return saida
}

// ── O ambiente da tipologia ───────────────────────────────────────────────────────────────
type Contexto = {
    entrada: EntradaDoAvaliador
    L: Q
    H: Q
    formulas: Map<string, string>
    variaveis: Map<string, VariavelDaTipologia>
    opcoes: Map<string, Opcao[]>
    memoria: Map<string, Q>
}

function ambienteDa(ctx: Contexto): Ambiente {
    const amb: Ambiente = {
        nome(nome, pilha) {
            if (nome === 'L') return ctx.L
            if (nome === 'H') return ctx.H
            if (pilha.includes(nome)) {
                const cadeia = [...pilha.slice(pilha.indexOf(nome)), nome]
                throw new ErroDeAvaliacao('CICLO', `As fórmulas formam um ciclo: ${cadeia.join(' → ')}.`, { variavel: nome, cadeia })
            }
            const formula = ctx.formulas.get(nome)
            if (formula !== undefined) {
                const guardado = ctx.memoria.get(nome)
                if (guardado) return guardado
                const v = numeroDe(avaliar(formula, amb, [...pilha, nome]), `A fórmula de ${nome}`)
                ctx.memoria.set(nome, v)
                return v
            }
            const variavel = ctx.variaveis.get(nome)
            if (variavel) {
                const escolha = ctx.entrada.escolhas?.[nome]
                if (escolha !== undefined) return deNumero(escolha) as Q
                const padrao = variavel.padrao?.trim() ?? ''
                if (padrao === '') {
                    throw new ErroDeAvaliacao('VARIAVEL_SEM_VALOR', `A variável ${nome} não foi escolhida e não tem padrão.`, { variavel: nome })
                }
                const numero = deDecimal(padrao, '.')
                if (numero) return numero
                return numeroDe(avaliar(padrao, amb, [...pilha, nome]), `O padrão de ${nome}`)
            }
            const constante = CONSTANTES_DO_LEIA_ME[nome]
            if (constante !== undefined) return deNumero(constante) as Q
            throw new ErroDeAvaliacao('VARIAVEL_SEM_VALOR', `"${nome}" não é medida, fórmula, variável nem constante desta tipologia: não tem valor.`, { variavel: nome })
        },
        amp(nome) {
            const opcoes = ctx.opcoes.get(nome)
            if (!opcoes) {
                throw new ErroDeAvaliacao('VARIAVEL_SEM_OPCOES', `&${nome}: ${nome} não é uma variável com opções nesta tipologia.`, { variavel: nome })
            }
            const escolhido = paraNumero(amb.nome(nome, []))
            const opcao = opcoes.find((o) => o.valor === escolhido)
            if (!opcao) {
                throw new ErroDeAvaliacao('OPCAO_INEXISTENTE', `&${nome}: a variável ${nome} vale ${escolhido}, e não há opção ${escolhido}.`, { variavel: nome })
            }
            if (opcao.medida === null) {
                // o nome que anuncia acréscimo sem trazer o colchete: falta o número, e ele não é suposto
                if (ANUNCIA_ACRESCIMO.test(opcao.rotulo)) {
                    throw new ErroDeAvaliacao('MEDIDA_DA_OPCAO_AUSENTE',
                        `&${nome}: a opção ${opcao.valor} da variável ${nome} ("${opcao.rotulo}") anuncia um acréscimo e não tem a medida entre colchetes. &${nome} não tem valor, e nenhum é suposto.`,
                        { variavel: nome })
                }
                // sem colchete e sem acréscimo no nome ("MEDIDA DO VÃO"): soma zero — decisão de 25/10/2026
                return racional(Z)
            }
            return opcao.medida
        },
    }
    return amb
}

function recusaDe(e: unknown, onde: Partial<RecusaDoAvaliador>): RecusaDoAvaliador {
    if (!(e instanceof ErroDeAvaliacao)) throw e
    const r: RecusaDoAvaliador = { motivo: e.motivo, mensagem: e.message, ...onde }
    if (e.variavel !== undefined) r.variavel = e.variavel
    if (e.formula !== undefined) r.formula = e.formula
    if (e.cadeia !== undefined) r.cadeia = e.cadeia
    if (onde.perfil !== undefined) r.mensagem = `Linha ${onde.linha} da aba Perfis (${onde.perfil}), ${onde.campo}: ${e.message}`
    return r
}

/** Monta o contexto, ou devolve as recusas da entrada — antes de avaliar qualquer linha. */
function montar(entrada: EntradaDoAvaliador): { ctx: Contexto } | { recusas: RecusaDoAvaliador[] } {
    const recusas: RecusaDoAvaliador[] = []
    const t = entrada.tipologia
    const L = entrada.L_mm > 0 ? deNumero(entrada.L_mm) : null
    const H = entrada.H_mm > 0 ? deNumero(entrada.H_mm) : null
    if (!L) recusas.push({ motivo: 'MEDIDA_INVALIDA', campo: 'L', mensagem: `L = ${entrada.L_mm} mm não é uma medida: tem de ser um número positivo.` })
    if (!H) recusas.push({ motivo: 'MEDIDA_INVALIDA', campo: 'H', mensagem: `H = ${entrada.H_mm} mm não é uma medida: tem de ser um número positivo.` })
    const esp = entrada.espessura_vidro_mm
    if (esp !== undefined && esp !== null && !(Number.isFinite(esp) && esp > 0)) {
        recusas.push({ motivo: 'MEDIDA_INVALIDA', campo: 'Espessura do vidro', mensagem: `A espessura do vidro ${esp} mm não é uma medida: tem de ser um número positivo.` })
    }

    const formulas = new Map(t.formulas.map((f) => [f.variavel, f.formula]))
    const variaveis = new Map(t.variaveis.map((v) => [v.variavel, v]))
    for (const nome of formulas.keys()) {
        if (variaveis.has(nome)) {
            recusas.push({ motivo: 'NOME_EM_DUAS_FONTES', variavel: nome, mensagem: `${nome} está na aba Fórmulas e na aba Variáveis: não se escolhe uma das duas.` })
        }
    }
    const opcoes = new Map<string, Opcao[]>()
    for (const v of t.variaveis) {
        if (v.opcoes === null || v.opcoes.trim() === '') continue
        const lidas = opcoesDe(v.opcoes)
        if (!lidas) recusas.push({ motivo: 'OPCOES_NAO_PARSEIAM', variavel: v.variavel, mensagem: `As opções de ${v.variavel} não se leem como "<valor> = <rótulo> [<medida>]": "${v.opcoes}".` })
        else opcoes.set(v.variavel, lidas)
    }
    for (const [nome, valor] of Object.entries(entrada.escolhas ?? {})) {
        if (!variaveis.has(nome)) {
            recusas.push({ motivo: 'ESCOLHA_DESCONHECIDA', campo: 'Escolha', variavel: nome, mensagem: `A escolha ${nome} = ${valor} não é de uma variável desta tipologia.` })
            continue
        }
        const lidas = opcoes.get(nome)
        if (deNumero(valor) === null || (lidas && !lidas.some((o) => o.valor === valor))) {
            recusas.push({
                motivo: 'ESCOLHA_FORA_DAS_OPCOES', campo: 'Escolha', variavel: nome,
                mensagem: `A escolha ${nome} = ${valor} não é ${lidas ? `uma das opções de ${nome} (${lidas.map((o) => o.valor).join(', ')})` : 'um número'}.`,
            })
        }
    }
    if (recusas.length) return { recusas }
    return { ctx: { entrada, L: L as Q, H: H as Q, formulas, variaveis, opcoes, memoria: new Map() } }
}

// ── A API ─────────────────────────────────────────────────────────────────────────────────
/** Avalia um texto solto, com valores para os nomes (e as constantes do Leia-me). */
export function avaliarTexto(texto: string, valores: Readonly<Record<string, number>> = {}):
    { ok: true; valor: number | boolean } | { ok: false; recusa: RecusaDoAvaliador } {
    const amb: Ambiente = {
        nome(nome) {
            const v = valores[nome] ?? CONSTANTES_DO_LEIA_ME[nome]
            if (v === undefined) throw new ErroDeAvaliacao('VARIAVEL_SEM_VALOR', `"${nome}" não tem valor.`, { variavel: nome })
            return deNumero(v) as Q
        },
        amp(nome) { throw new ErroDeAvaliacao('VARIAVEL_SEM_OPCOES', `&${nome}: não há variáveis com opções num texto solto.`, { variavel: nome }) },
    }
    try {
        const v = avaliar(texto, amb, [])
        return { ok: true, valor: v.tipo === 'b' ? v.b : paraNumero(v.q) }
    } catch (e) {
        return { ok: false, recusa: recusaDe(e, {}) }
    }
}

/** O valor de um nome (fórmula, variável ou constante) para uma entrada — exato, sem arredondar. */
export function valorDaVariavel(entrada: EntradaDoAvaliador, nome: string): number {
    const m = montar(entrada)
    if ('recusas' in m) throw new Error(m.recusas.map((r) => r.mensagem).join(' | '))
    try {
        return paraNumero(ambienteDa(m.ctx).nome(nome, []))
    } catch (e) {
        throw new Error(recusaDe(e, {}).mensagem)
    }
}

/** A lista de peças de uma tipologia, ou as recusas — todas, na ordem das linhas. */
export function avaliarTipologia(entrada: EntradaDoAvaliador): ResultadoDaAvaliacao {
    const m = montar(entrada)
    if ('recusas' in m) return { ok: false, recusas: m.recusas }
    const ctx = m.ctx
    const amb = ambienteDa(ctx)
    const recusas: RecusaDoAvaliador[] = []
    const pecas: PecaDoPerfil[] = []
    const linhas: LinhaAvaliada[] = []
    const esp = entrada.espessura_vidro_mm ?? null
    let baguetesComCondicao = 0
    let baguetesAtendidos = 0
    const listasDeEspessura: string[] = []

    entrada.tipologia.perfis.forEach((p, i) => {
        const linha = i + 1
        const onde = (campo: RecusaDoAvaliador['campo']) => ({ linha, perfil: p.perfil, campo })
        try {
            const condicao = p.condicao.trim() === 'sempre' ? true : condicaoDe(avaliar(p.condicao, amb, []), 'A condição')
            if (!condicao) { linhas.push({ linha, perfil: p.perfil, entrou: false, motivo: 'CONDICAO_FALSA' }); return }
        } catch (e) { recusas.push(recusaDe(e, onde('Condição'))); return }

        if (p.esp_vidro !== null && p.esp_vidro.trim() !== '') {
            const lista = p.esp_vidro.split(',').map((x) => x.trim())
            if (!lista.every((x) => /^\d+$/.test(x))) {
                recusas.push({ motivo: 'ESPESSURAS_NAO_PARSEIAM', ...onde('Esp. vidro'), mensagem: `Linha ${linha} da aba Perfis (${p.perfil}): as espessuras "${p.esp_vidro}" não se leem.` })
                return
            }
            baguetesComCondicao++
            listasDeEspessura.push(`${p.perfil}: ${p.esp_vidro}`)
            if (esp === null) {
                recusas.push({ motivo: 'ESPESSURA_DO_VIDRO_AUSENTE', ...onde('Esp. vidro'), mensagem: `Linha ${linha} da aba Perfis (${p.perfil}): o baguete depende da espessura do vidro (${p.esp_vidro} mm), e ela não foi informada.` })
                return
            }
            if (!lista.map(Number).includes(esp)) { linhas.push({ linha, perfil: p.perfil, entrou: false, motivo: 'ESPESSURA_NAO_ATENDIDA' }); return }
            baguetesAtendidos++
        }

        let quantidade: Q
        try {
            quantidade = numeroDe(avaliar(p.qtd, amb, []), 'A quantidade')
        } catch (e) { recusas.push(recusaDe(e, onde('Qtd'))); return }
        if (!ehInteiro(quantidade)) {
            recusas.push({ motivo: 'QUANTIDADE_NAO_INTEIRA', ...onde('Qtd'), formula: p.qtd, quantidade: paraNumero(quantidade),
                mensagem: `Linha ${linha} da aba Perfis (${p.perfil}): a quantidade "${p.qtd}" dá ${paraNumero(quantidade)}, que não é inteiro.` })
            return
        }
        if (quantidade.n < Z) {
            recusas.push({ motivo: 'QUANTIDADE_NEGATIVA', ...onde('Qtd'), formula: p.qtd, quantidade: paraNumero(quantidade),
                mensagem: `Linha ${linha} da aba Perfis (${p.perfil}): a quantidade "${p.qtd}" dá ${paraNumero(quantidade)}.` })
            return
        }
        if (quantidade.n === Z) { linhas.push({ linha, perfil: p.perfil, entrou: false, motivo: 'QUANTIDADE_ZERO' }); return }

        let medida: Q
        try {
            medida = numeroDe(avaliar(p.medida, amb, []), 'A medida')
        } catch (e) { recusas.push(recusaDe(e, onde('Medida'))); return }
        if (medida.n <= Z) {
            recusas.push({ motivo: 'COMPRIMENTO_NAO_POSITIVO', ...onde('Medida'), formula: p.medida, comprimento_mm: aoMicrometro(medida),
                mensagem: `Linha ${linha} da aba Perfis (${p.perfil}): a medida "${p.medida}" dá ${aoMicrometro(medida)} mm — não há peça de comprimento zero ou negativo.` })
            return
        }

        pecas.push({ codigo: p.perfil, descricao: p.descricao, comprimento_mm: aoMicrometro(medida), quantidade: Number(quantidade.n), corte: p.corte, posicao: p.posicao })
        linhas.push({ linha, perfil: p.perfil, entrou: true, motivo: null })
    })

    if (esp !== null && baguetesComCondicao > 0 && baguetesAtendidos === 0) {
        recusas.push({ motivo: 'NENHUM_BAGUETE_PARA_A_ESPESSURA', campo: 'Espessura do vidro', espessura_vidro_mm: esp,
            mensagem: `Nenhum baguete desta tipologia atende o vidro de ${esp} mm (${listasDeEspessura.join('; ')}): o vidro ficaria sem baguete.` })
    }

    const avisos: AvisoDoAvaliador[] = []
    entrada.tipologia.validacoes.forEach((v) => {
        try {
            if (condicaoDe(avaliar(v.condicao, amb, []), 'A validação')) return
            const valores: Record<string, number> = {}
            for (const nome of nomesDa(ler(v.condicao))) valores[nome] = paraNumero(amb.nome(nome, []))
            avisos.push({ origem: 'VALIDACAO', condicao: v.condicao, mensagem: v.mensagem, valores })
        } catch (e) { recusas.push(recusaDe(e, { campo: 'Validação' })) }
    })
    const d = entrada.tipologia.detalhe
    const limites: Array<['L' | 'H', number, number | null, number | null]> = [['L', entrada.L_mm, d.larg_min_mm, d.larg_max_mm], ['H', entrada.H_mm, d.alt_min_mm, d.alt_max_mm]]
    for (const [medida, valor, min, max] of limites) {
        const v = deNumero(valor) as Q
        for (const [limite, lim] of [['MIN', min], ['MAX', max]] as Array<['MIN' | 'MAX', number | null]>) {
            if (lim === null) continue
            const l = deNumero(lim) as Q
            const fora = limite === 'MIN' ? compara(v, l) < 0 : compara(v, l) > 0
            if (!fora) continue
            const excesso = limite === 'MIN' ? subtracao(l, v) : subtracao(v, l)
            avisos.push({ origem: 'LIMITE', medida, limite, valor_mm: valor, limite_mm: lim, excesso_mm: paraNumero(excesso),
                excesso_pct: paraNumero(produto(quociente(excesso, l), racional(BigInt(100)))) })
        }
    }

    if (recusas.length) return { ok: false, recusas }
    return { ok: true, pecas, linhas, avisos }
}

// ── A leitura das abas, pelo NOME da coluna ───────────────────────────────────────────────
export type AbaDoMotor = { cabecalho?: readonly string[]; linhas: ReadonlyArray<Readonly<Record<string, unknown>>> }
export type AbasDoMotor = Readonly<Record<string, AbaDoMotor>>

/**
 * As colunas que o avaliador lê, por aba. Lidas pelo NOME do cabeçalho, nunca pela posição: uma
 * coluna acrescentada pelo fornecedor no meio da aba não desloca nada.
 */
export const COLUNAS_LIDAS: Readonly<Record<string, readonly string[]>> = {
    'Detalhe Tipologias': ['Código', 'Larg. mín (mm)', 'Larg. máx (mm)', 'Alt. mín (mm)', 'Alt. máx (mm)'],
    'Variáveis': ['Código', 'Var.', 'Descrição', 'Padrão', 'Condição', 'Opções'],
    'Fórmulas': ['Código', 'Variável', 'Fórmula'],
    'Perfis': ['Código', 'Perfil', 'Descrição', 'Corte', 'Qtd', 'Medida', 'Posição', 'Esp. vidro', 'Condição'],
    'Validações': ['Código', 'Condição válida', 'Mensagem'],
}

export function lerTipologia(abas: AbasDoMotor, codigo: string): { ok: true; tipologia: Tipologia } | { ok: false; recusas: RecusaDoAvaliador[] } {
    const recusas: RecusaDoAvaliador[] = []
    for (const [aba, colunas] of Object.entries(COLUNAS_LIDAS)) {
        const a = abas[aba]
        if (!a) { recusas.push({ motivo: 'ABA_AUSENTE', aba, mensagem: `A aba "${aba}" não está no arquivo.` }); continue }
        for (const coluna of colunas) {
            if (!(a.cabecalho ?? []).includes(coluna)) recusas.push({ motivo: 'CABECALHO_AUSENTE', aba, coluna, mensagem: `A aba "${aba}" não tem a coluna "${coluna}" no cabeçalho.` })
        }
    }
    if (recusas.length) return { ok: false, recusas }

    const daTipologia = (aba: string) => abas[aba].linhas.filter((l) => l['Código'] === codigo)
    const texto = (v: unknown) => (v === null || v === undefined ? null : String(v))
    const textoObrigatorio = (v: unknown) => texto(v) ?? ''
    const limite = (aba: string, coluna: string, v: unknown): number | null => {
        if (v === null || v === undefined) return null
        if (typeof v === 'number' && Number.isFinite(v)) return v
        recusas.push({ motivo: 'VALOR_INVALIDO', aba, coluna, mensagem: `"${coluna}" da tipologia ${codigo} não é número: ${JSON.stringify(v)}.` })
        return null
    }

    const detalhe = daTipologia('Detalhe Tipologias')[0]
    if (!detalhe) return { ok: false, recusas: [{ motivo: 'TIPOLOGIA_AUSENTE', aba: 'Detalhe Tipologias', mensagem: `A tipologia ${codigo} não está no 'Detalhe Tipologias'.` }] }
    const tipologia: Tipologia = {
        codigo,
        detalhe: {
            larg_min_mm: limite('Detalhe Tipologias', 'Larg. mín (mm)', detalhe['Larg. mín (mm)']),
            larg_max_mm: limite('Detalhe Tipologias', 'Larg. máx (mm)', detalhe['Larg. máx (mm)']),
            alt_min_mm: limite('Detalhe Tipologias', 'Alt. mín (mm)', detalhe['Alt. mín (mm)']),
            alt_max_mm: limite('Detalhe Tipologias', 'Alt. máx (mm)', detalhe['Alt. máx (mm)']),
        },
        variaveis: daTipologia('Variáveis').map((l) => ({
            variavel: textoObrigatorio(l['Var.']), descricao: texto(l['Descrição']), padrao: texto(l['Padrão']),
            condicao: texto(l['Condição']), opcoes: texto(l['Opções']),
        })),
        formulas: daTipologia('Fórmulas').map((l) => ({ variavel: textoObrigatorio(l['Variável']), formula: textoObrigatorio(l['Fórmula']) })),
        perfis: daTipologia('Perfis').map((l) => ({
            perfil: textoObrigatorio(l['Perfil']), descricao: textoObrigatorio(l['Descrição']), corte: textoObrigatorio(l['Corte']),
            qtd: textoObrigatorio(l['Qtd']), medida: textoObrigatorio(l['Medida']), posicao: textoObrigatorio(l['Posição']),
            esp_vidro: texto(l['Esp. vidro']), condicao: textoObrigatorio(l['Condição']),
        })),
        validacoes: daTipologia('Validações').map((l) => ({ condicao: textoObrigatorio(l['Condição válida']), mensagem: textoObrigatorio(l['Mensagem']) })),
    }
    if (recusas.length) return { ok: false, recusas }
    return { ok: true, tipologia }
}
