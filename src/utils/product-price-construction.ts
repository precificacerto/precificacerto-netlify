/**
 * product-price-construction.ts — a formação do preço do CADASTRO, pela matriz.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md`, R3 · R5 · R8 · R9.
 *
 * >>> O QUE MUDA, e por que não é detalhe <<<
 * Até aqui a tela formava o preço SEM os tributos por fora e depois os somava por cima,
 * por `computeIvaDualOutside`. A R9 é explícita sobre isso:
 *
 *   "Somar o IPI por cima do preço sem IPI é erro, não atalho. O IPI altera `c`, que
 *    altera a MC, que altera o preço inteiro."
 *
 * Com a matriz, IBS/CBS/IS/IPI entram no `c` da R3, o `c` converte cada % Original em %
 * Efetivada (R5), a margem de contribuição encolhe e o preço sobe — e o total geral sai de
 * `P ÷ (1 − c)` (R8), não de uma soma.
 *
 * O módulo é PURO e vive fora do componente de propósito: é aqui que o teste consegue
 * afirmar EFEITO (o número que muda) em vez de passagem
 * (`.claude/rules/teste-que-nao-exercita.md`).
 */

import { calculatePricing, type CalcType, type ResolvedTaxBreakdown } from './pricing-engine'
import { resolveConstructionTaxInput, type BaseCodeOverrides, type BuyerPurpose, type BuyerTypeEnum, type SaleScope } from './sale-context'

export interface ProductConstructionInput {
  taxableRegime: string | null | undefined
  segment: CalcType
  buyerType: BuyerTypeEnum
  saleScope: SaleScope
  buyerPurpose?: BuyerPurpose | null

  /** CMV já apurado, em R$ por unidade. */
  costTotal: number

  // Percentuais, todos DECIMAIS sobre o TOTAL GERAL.
  structurePct: number
  rtReservePct: number
  commissionPct: number
  profitPct: number
  /** IRPJ + CSLL + adicional (R6). */
  profitTaxPct: number

  rates: {
    icmsPct?: number | null
    issPct?: number | null
    /** Como o cadastro o guarda: já com a exclusão do ICMS/ISS. */
    pisCofinsEffectivePct?: number | null
    ipiPct?: number | null
    isPct?: number | null
    ibsPct?: number | null
    cbsPct?: number | null
    /** FRAÇÃO [0, 1]. */
    ivaDualReductionFactor?: number | null
  }

  /**
   * Override manual do código de base, por tributo (7.5, item 6). Ausente ou `null` por
   * tributo = padrão da R3; nunca o código 1 por omissão.
   */
  baseCodes?: BaseCodeOverrides | null

  /** Frete + seguro + despesas acessórias cobrados do adquirente, em R$. */
  despAcessorias: number
}

export interface ProductConstructionResult {
  /**
   * `false` = a matriz NÃO governou esta formação, e o chamador deve manter o caminho
   * antigo com o preço que já tinha. Nunca significa "sem tributo".
   */
  applied: boolean
  /** Por que não se aplicou. Vazio quando `applied`. */
  reason: string
  /** Operação interna P (R7). Zero quando não se aplicou. */
  opInterna: number
  /** Total geral = P ÷ (1 − c) (R8). Zero quando não se aplicou. */
  totalGeral: number
  /** O que o motor resolveu. Ausente quando não se aplicou. */
  resolved?: ResolvedTaxBreakdown
  errors: string[]
}

const NOT_APPLIED = (reason: string, errors: string[] = []): ProductConstructionResult => ({
  applied: false,
  reason,
  opInterna: 0,
  totalGeral: 0,
  errors,
})

/**
 * Forma o preço do cadastro lendo a matriz.
 *
 * Duas portas, e as duas dizem "não se aplica" em vez de calcular por dedução:
 *
 * 1. REGIME SEM MATRIZ — a regra vale para Lucro Real; Lucro Presumido, Simples Híbrido,
 *    Simples Nacional e MEI têm cascata própria e a deste arquivo não os descreve.
 *
 * 2. DESPESAS ACESSÓRIAS NO PRODUTO — a R3 resolve o `c` sobre a operação interna, sem
 *    despesas acessórias; `computeIvaDualOutside` as inclui nas bases de IBS/CBS e do IPI.
 *    Os dois modelos não coincidem, e escolher um deles aqui seria decidir por conta
 *    própria onde o frete entra. A R11 já mandou os acréscimos para o ORÇAMENTO
 *    ("Acréscimos pertencem ao orçamento, não ao produto"), com rateio por item — é lá que
 *    a base deles fica definida. Enquanto houver valor gravado no produto, esta porta
 *    devolve `applied: false` e o preço daquele produto não muda.
 */
export function buildProductConstruction(
  input: ProductConstructionInput,
): ProductConstructionResult {
  const tax = resolveConstructionTaxInput({
    taxableRegime: input.taxableRegime,
    segment: input.segment,
    buyerType: input.buyerType,
    saleScope: input.saleScope,
    buyerPurpose: input.buyerPurpose,
    rates: input.rates,
    baseCodes: input.baseCodes,
    profitTaxPct: input.profitTaxPct,
  })

  if (!tax.engineInput) {
    return NOT_APPLIED(
      tax.errors.length > 0
        ? 'alíquota declarada onde a matriz diz INEXISTENTE'
        : 'regime sem matriz escrita',
      tax.errors,
    )
  }

  if (input.despAcessorias > 0) {
    return NOT_APPLIED('produto com acréscimos gravados — a base deles é do orçamento (R11)')
  }

  const engine = calculatePricing({
    calcType: input.segment,
    // O CMV já vem apurado: zerar MO e rendimento faz `cmvUnit === costTotal`, sem
    // recalcular nada que a tela já calculou.
    totalItemsCost: input.costTotal,
    yieldQuantity: 1,
    laborCostMonthly: 0,
    numProductiveEmployees: 0,
    monthlyWorkloadMinutes: 0,
    productWorkloadMinutes: 0,
    structurePct: input.structurePct,
    taxPct: tax.engineInput.taxPct,
    profitTaxPct: tax.engineInput.profitTaxPct,
    commissionPct: input.commissionPct,
    profitPct: input.profitPct,
    rtReservePct: input.rtReservePct,
    taxBreakdown: tax.engineInput.taxBreakdown,
  })

  if (!engine.isValid || !engine.taxBreakdownResolved) {
    return NOT_APPLIED('motor recusou a entrada', engine.validationErrors)
  }

  return {
    applied: true,
    reason: '',
    opInterna: engine.priceUnit,
    totalGeral: engine.taxBreakdownResolved.totalGeral,
    resolved: engine.taxBreakdownResolved,
    errors: [],
  }
}

/**
 * O `c` a CONGELAR junto com o preço (R3), ou `null` quando não há o que congelar.
 *
 * Vive aqui, e não numa expressão dentro do componente, porque a mesma regra precisa ser
 * afirmada pelo teste: uma cópia no teste e outra na tela seria `copia-divergente.md` entre
 * o que se grava e o que se verifica — e o campo esquecido seria justamente a distinção
 * abaixo.
 *
 * `0` e `null` NÃO são a mesma coisa: `0` é "a matriz governou e não há tributo por fora",
 * apurado; `null` é "não há regra escrita para este regime", não apurado
 * (`.claude/rules/ausente-vs-falso.md`). A coluna é nulável e sem default exatamente para
 * que a distinção sobreviva à gravação.
 */
export function externalOpsCoefficientToFreeze(
  construction: ProductConstructionResult,
): number | null {
  if (!construction.applied || !construction.resolved) return null
  const c = Number(construction.resolved.externalOpsCoefficient)
  return Number.isFinite(c) ? c : null
}
