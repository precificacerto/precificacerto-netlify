/**
 * O RATEIO DA OPERAÇÃO INTERNA PELOS ITENS do orçamento I.A. — o número que o arquivo "Orçamento" imprime por item (dono do produto, 10 e
 * 11/11/2026). Puro: recebe a interna gravada e os itens, devolve o valor unitário e o total de cada um, ou a recusa nomeada.
 *
 * AS REGRAS, e por que cada uma:
 *   - FECHA EXATO, sem tolerância: Σ total por item = a interna gravada, ao centavo. "O modelo WVetro erra centavo (item 5: 1.099,13 x 2 =
 *     2.198,26 e ele imprime 2.198,25 [...]). O nosso não pode errar." A interna está em centavos (a CHECK `operacao_interna_ao_centavo`), e
 *     a conta toda é em CENTAVOS INTEIROS (BigInt), sem ponto flutuante na partilha.
 *   - O TOTAL DO ITEM É UNITÁRIO × QUANTIDADE, exato: o rateio reparte em centavos POR UNIDADE de cada item — é a outra metade do erro do WVetro.
 *   - O PESO é o custo líquido total do item (material + fabricação, `custo_liquido_total`, a coluna que o cálculo grava): a interna é o custo
 *     inteiro vezes UM coeficiente da precificação, então repartir pelo custo devolve a cada item o próprio preço. O rateio do #258 "reparte
 *     lendo as duas fontes" (dono do produto, 11/11/2026): material e fabricação — as duas estão no `custo_liquido_total`.
 *   - O MAIOR RESTO, com DESEMPATE DETERMINÍSTICO: cada item recebe o piso do seu quinhão por unidade; os centavos que sobram vão, em blocos de
 *     uma unidade do item (a quantidade dele), aos de maior resto, e no empate à MENOR ORDEM. O mesmo orçamento dá sempre o mesmo arquivo.
 *   - QUANDO NÃO FECHA, RECUSA: com todas as quantidades múltiplas de um mesmo número e a sobra que ele não divide (dois itens de 2 unidades e
 *     um centavo sobrando), nenhuma partilha em centavos inteiros fecha exato — a recusa nomeia a sobra e as quantidades. Nunca aproxima.
 */

export type ItemDoRateio = { ordem: number; quantidade: number; peso: number }
export type ItemRateado = { ordem: number; quantidade: number; unitario: number; total: number }
export type Rateio = { ok: true; itens: ItemRateado[]; centavos: number } | { ok: false; recusa: string }

/** A escala dos pesos em inteiros (6 casas): o custo vem com mais casas que o centavo, e a partilha não pode depender da representação binária. */
const ESCALA_DO_PESO = BigInt(1_000_000)
// sem literal BigInt (`ZERO`): o alvo do tsconfig é anterior ao ES2020
const ZERO = BigInt(0)
const UM = BigInt(1)

const centavosExatos = (v: number): bigint | null => {
    if (!Number.isFinite(v)) return null
    const c = Math.round(v * 100)
    return Math.abs(v * 100 - c) < 1e-6 ? BigInt(c) : null
}
const mdc = (a: number, b: number): number => (b === 0 ? a : mdc(b, a % b))
export const reais = (centavos: number) => `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const FRASE_SEM_ITENS = 'o rateio pelos itens: o orçamento não tem item'
export const fraseDaInternaForaDoCentavo = (v: number) => `o rateio pelos itens: a operação interna (${v}) não está em centavos exatos`
export const FRASE_DA_INTERNA_NAO_POSITIVA = 'o rateio pelos itens: a operação interna tem de ser maior que zero'
export const fraseDaQuantidade = (ordem: number) => `o rateio pelos itens: a quantidade do item ${ordem} não é um inteiro maior que zero`
export const fraseDoPeso = (ordem: number) => `o rateio pelos itens: o custo líquido total do item ${ordem} não foi calculado (sem ele o item não tem peso)`
export const fraseDaSobra = (sobra: number, quantidades: readonly number[], divisor: number) =>
    `o rateio pelos itens não fecha exato: sobram ${sobra} centavo(s) que não se repartem entre itens de quantidades ${quantidades.join(', ')} `
    + `(todas múltiplas de ${divisor}) sem que o valor unitário vezes a quantidade deixe de bater com o total. Ajuste um percentual da precificação `
    + 'e salve de novo; o arquivo não sai com centavo a mais ou a menos.'

/** Reparte `interna` (em reais, com no máximo duas casas) pelos itens. */
export function ratearOperacaoInterna(interna: number, itens: readonly ItemDoRateio[]): Rateio {
    if (itens.length === 0) return { ok: false, recusa: FRASE_SEM_ITENS }
    const T = centavosExatos(interna)
    if (T === null) return { ok: false, recusa: fraseDaInternaForaDoCentavo(interna) }
    if (T <= ZERO) return { ok: false, recusa: FRASE_DA_INTERNA_NAO_POSITIVA }
    for (const i of itens) {
        if (!Number.isInteger(i.quantidade) || i.quantidade < 1) return { ok: false, recusa: fraseDaQuantidade(i.ordem) }
        if (!Number.isFinite(i.peso) || i.peso <= 0) return { ok: false, recusa: fraseDoPeso(i.ordem) }
    }
    const pesos = itens.map((i) => BigInt(Math.round(i.peso * Number(ESCALA_DO_PESO))))
    if (pesos.some((p) => p <= ZERO)) return { ok: false, recusa: fraseDoPeso(itens[pesos.findIndex((p) => p <= ZERO)].ordem) }
    const W = pesos.reduce((s, p) => s + p, ZERO)
    // o piso por UNIDADE de cada item, e o resto (o numerador sobre W) que decide quem leva os centavos que sobram
    const base = itens.map((i, k) => {
        const q = BigInt(i.quantidade)
        const unitario = (T * pesos[k]) / (W * q)
        return { k, ordem: i.ordem, q, unitario, resto: T * pesos[k] - unitario * q * W }
    })
    const sobra = T - base.reduce((s, b) => s + b.unitario * b.q, ZERO)
    // a prioridade: maior resto, e no empate a menor ordem
    const fila = [...base].sort((a, b) => (a.resto === b.resto ? a.ordem - b.ordem : a.resto > b.resto ? -1 : 1))
    // a primeira escolha, na ordem da fila, de itens (cada um no máximo uma vez) cujas quantidades somam a sobra exata
    const n = fila.length
    const r = Number(sobra)
    const pode: boolean[][] = Array.from({ length: n + 1 }, () => new Array<boolean>(r + 1).fill(false))
    pode[n][0] = true
    for (let k = n - 1; k >= 0; k--) {
        const q = Number(fila[k].q)
        for (let s = 0; s <= r; s++) pode[k][s] = pode[k + 1][s] || (q <= s && pode[k + 1][s - q])
    }
    if (!pode[0][r]) {
        const quantidades = itens.map((i) => i.quantidade)
        return { ok: false, recusa: fraseDaSobra(r, quantidades, quantidades.reduce(mdc)) }
    }
    let s = r
    for (let k = 0; k < n && s > 0; k++) {
        const q = Number(fila[k].q)
        if (q <= s && pode[k + 1][s - q]) { fila[k].unitario += UM; s -= q }
    }
    const rateados = base.map((b) => ({ ordem: b.ordem, quantidade: Number(b.q), unitario: Number(b.unitario), total: Number(b.unitario * b.q) }))
    return { ok: true, itens: rateados, centavos: Number(T) }
}
