/**
 * external-ops-coefficient.ts — resolve o `c` da R3 em forma fechada.
 *
 * `c` é o COEFICIENTE DA OPERAÇÃO POR FORA: quanto IBS, CBS, IS e IPI somados
 * representam do TOTAL GERAL, como decimal. Regra: R3 em
 * `.claude/rules/cascata-lucro-real.md`.
 *
 * >>> ATENÇÃO AO NOME <<<
 * Neste repositório `coefficient`, sozinho, significa outra coisa: é o DIVISOR
 * DA MARGEM DE CONTRIBUIÇÃO em `pricing-engine.ts` (~0,69). O `c` daqui vale
 * ~0,074 num caso típico. São grandezas diferentes, com uma ordem de magnitude
 * de distância. Por isso nada neste arquivo se chama `coefficient` sem
 * qualificação — é sempre `externalOpsCoefficient` ou `c` no contexto da R3.
 *
 * Por que forma fechada e não iteração: a base de cada tributo por fora é
 * LINEAR em `c` (`base_k = alfa_k + beta_k × c`), então o sistema resolve com
 * uma divisão. Não há referência circular nem ponto fixo a convergir.
 *
 * ESTE MÓDULO NÃO ESTÁ LIGADO A NADA. Ligá-lo exige que o motor receba os
 * tributos SEPARADOS — hoje `calculatePricing` recebe `taxPct` agregado e não
 * sabe o que dentro dele é ICMS, ISS ou PIS/COFINS. Essa é mudança de contrato,
 * rodada própria. Enquanto isso, nenhum preço do sistema depende deste arquivo.
 */

/**
 * Código da base de cálculo do tributo por fora (R3).
 *
 *   1 → P
 *   2 → P − ICMS/ISS
 *   3 → P − ICMS/ISS − PIS/COFINS
 *   4 → P − ICMS/ISS − PIS/COFINS + IS          (padrão de IBS e CBS)
 *   5 → código 4 + IPI                          (reserva)
 *
 * A LC 214/2025, art. 12, §2º, II exclui expressamente o IPI da base do
 * IBS/CBS; o IS não está entre as exclusões e integra. Daí o padrão ser 4.
 */
export type BaseCode = 1 | 2 | 3 | 4 | 5

export interface ExternalTax {
  /** Alíquota original, decimal (0,088 = 8,80%). */
  rate: number
  /** Fator de redução do IVA DUAL, decimal. Default 0. Alíquota efetiva = rate × (1 − fator). */
  reductionFactor?: number
  /** Base de cálculo. IS e IPI só aceitam 1, 2 ou 3 — ver `resolveExternalOpsCoefficient`. */
  baseCode: BaseCode
}

export interface ExternalOpsInput {
  /** ICMS como decimal sobre o TOTAL GERAL. 0 quando INEXISTENTE no segmento. */
  icmsPct: number
  /** ISS como decimal sobre P (não sofre gross-up). 0 quando INEXISTENTE. */
  issPct: number
  /** PIS/COFINS, alíquota NOMINAL como decimal. */
  pisCofinsPct: number
  ibs?: ExternalTax
  cbs?: ExternalTax
  is?: ExternalTax
  ipi?: ExternalTax
}

export interface ExternalOpsResult {
  isValid: boolean
  validationErrors: string[]
  /** O `c` da R3. Zero quando não há tributo por fora. */
  externalOpsCoefficient: number
}

/** Par (alfa, beta) de `base_k = alfa_k + beta_k × c`, como fração do total geral. */
interface BaseTerms {
  alfa: number
  beta: number
}

const ZERO_RESULT = (errors: string[]): ExternalOpsResult => ({
  isValid: false,
  validationErrors: errors,
  externalOpsCoefficient: 0,
})

/** Alíquota efetiva = rate × (1 − reductionFactor). Tributo ausente vale zero, não erro. */
function effectiveRate(tax: ExternalTax | undefined): number {
  if (!tax) return 0
  return tax.rate * (1 - (tax.reductionFactor ?? 0))
}

function isFraction(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 1
}

/**
 * Resolve o `c` da R3.
 *
 * Ordem obrigatória: IS e IPI primeiro, porque só aceitam códigos 1 a 3 e por
 * isso não dependem de ninguém. Depois IBS e CBS, que podem referenciá-los
 * pelos códigos 4 e 5. Não há recursão.
 */
export function resolveExternalOpsCoefficient(input: ExternalOpsInput): ExternalOpsResult {
  const errors: string[] = []
  const { icmsPct: i, issPct: s, pisCofinsPct: p } = input

  for (const [nome, v] of [['icmsPct', i], ['issPct', s], ['pisCofinsPct', p]] as const) {
    if (!isFraction(v)) errors.push(`${nome} fora do intervalo [0, 1]: ${v}`)
  }

  const declarados = [
    ['is', input.is],
    ['ipi', input.ipi],
    ['ibs', input.ibs],
    ['cbs', input.cbs],
  ] as const

  for (const [nome, tax] of declarados) {
    if (!tax) continue
    if (!isFraction(tax.rate)) errors.push(`${nome}.rate fora do intervalo [0, 1]: ${tax.rate}`)
    const rf = tax.reductionFactor ?? 0
    if (!isFraction(rf)) errors.push(`${nome}.reductionFactor fora do intervalo [0, 1]: ${rf}`)
    if (![1, 2, 3, 4, 5].includes(tax.baseCode)) {
      errors.push(`${nome}.baseCode inválido: ${tax.baseCode}. Use 1..5.`)
    }
    // IS e IPI são o que os códigos 4 e 5 somam. Deixá-los apontar para 4 ou 5
    // criaria a recursão que a R3 diz não existir.
    if ((nome === 'is' || nome === 'ipi') && (tax.baseCode === 4 || tax.baseCode === 5)) {
      errors.push(`${nome}.baseCode ${tax.baseCode} não é permitido: IS e IPI aceitam apenas 1, 2 ou 3.`)
    }
  }

  if (errors.length > 0) return ZERO_RESULT(errors)

  // --- Bases que não dependem de ninguém (códigos 1 a 3) ---
  const base1: BaseTerms = { alfa: 1, beta: -1 }
  const base2: BaseTerms = { alfa: (1 - s) - i, beta: -(1 - s) }
  const base3: BaseTerms = { alfa: (1 - p) * ((1 - s) - i), beta: -(1 - p) * (1 - s) }

  const termsFor = (code: BaseCode, base4: BaseTerms, base5: BaseTerms): BaseTerms => {
    switch (code) {
      case 1: return base1
      case 2: return base2
      case 3: return base3
      case 4: return base4
      case 5: return base5
    }
  }

  // --- Passo 1: IS e IPI, que só usam 1..3 ---
  const aIS = effectiveRate(input.is)
  const aIPI = effectiveRate(input.ipi)
  const termsIS = input.is ? termsFor(input.is.baseCode, base3, base3) : base1
  const termsIPI = input.ipi ? termsFor(input.ipi.baseCode, base3, base3) : base1

  // --- Passo 2: bases 4 e 5, que somam o que o passo 1 produziu ---
  const base4: BaseTerms = {
    alfa: base3.alfa + aIS * termsIS.alfa,
    beta: base3.beta + aIS * termsIS.beta,
  }
  const base5: BaseTerms = {
    alfa: base4.alfa + aIPI * termsIPI.alfa,
    beta: base4.beta + aIPI * termsIPI.beta,
  }

  // --- Passo 3: c = Σ(a_k × alfa_k) ÷ (1 − Σ(a_k × beta_k)) ---
  let somaAlfa = 0
  let somaBeta = 0
  for (const [, tax] of declarados) {
    if (!tax) continue
    const a = effectiveRate(tax)
    if (a === 0) continue
    const t = termsFor(tax.baseCode, base4, base5)
    somaAlfa += a * t.alfa
    somaBeta += a * t.beta
  }

  const denominador = 1 - somaBeta
  if (denominador === 0) {
    return ZERO_RESULT(['Denominador zero ao resolver o coeficiente da operação por fora.'])
  }

  const c = somaAlfa / denominador

  if (!Number.isFinite(c) || c < 0 || c >= 1) {
    return ZERO_RESULT([`Coeficiente da operação por fora fora do intervalo [0, 1): ${c}`])
  }

  return { isValid: true, validationErrors: [], externalOpsCoefficient: c }
}
