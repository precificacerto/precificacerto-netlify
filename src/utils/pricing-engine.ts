/**
 * pricing-engine.ts — Single source of truth for price calculation.
 *
 * ALL percentages are decimals in range 0-1 (e.g. 0.10 = 10%).
 * The UI layer converts display values before calling this module.
 *
 * This module is pure (no I/O, no framework deps, no Supabase).
 * It is shared between web-app (preview) and edge function (persist).
 *
 * >>> A PUREZA É PRÉ-REQUISITO DO MECANISMO, NÃO PREFERÊNCIA DE ESTILO <<<
 * O espelho da edge é produzido por `scripts/sync-pricing-engine.js`, que copia
 * UM arquivo. Um import novo aqui NÃO é copiado junto: o espelho passa a apontar
 * para um módulo que não existe na pasta da função, e quebra no Deno e no tsc.
 * Foi por isso que o resolvedor do `c` da R3 passou a morar NESTE arquivo e
 * `external-ops-coefficient.ts` virou re-export, e não o contrário.
 * Todo import novo neste arquivo quebra o espelho.
 *
 * Formula (por dentro — all % applied over final price):
 *   priceUnit = cmvUnit / coefficient
 *   coefficient = 1 − Σ (% Efetivada)
 *   % Efetivada = % Original ÷ (1 − externalOpsCoefficient)
 *
 * `externalOpsCoefficient` é o `c` da R3/R5 em .claude/rules/cascata-lucro-real.md
 * (operação por fora: IBS, CBS, IS, IPI). Default 0 ⇒ conversão é identidade.
 */

// ---------------------------------------------------------------------------
// Labor % company-wide (legacy — deprecated)
// ---------------------------------------------------------------------------

const DEFAULT_DAYS_PER_MONTH = 22

/**
 * @deprecated Motor agora recebe laborCostMonthly + workload diretamente.
 * Mantido apenas para compatibilidade de imports existentes.
 */
export function computeLaborPctCompany(
  laborMonthly: number,
  totalEmployees: number,
  hoursPerMonth: number,
  daysPerMonth: number = DEFAULT_DAYS_PER_MONTH,
): number {
  if (laborMonthly <= 0 || totalEmployees <= 0 || hoursPerMonth <= 0 || daysPerMonth <= 0) return 0
  const divisor = totalEmployees * daysPerMonth * hoursPerMonth
  if (divisor <= 0) return 0
  const pctAsNumber = laborMonthly / divisor
  return Math.round((pctAsNumber / 100) * 10000) / 10000
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalcType = 'INDUSTRIALIZACAO' | 'REVENDA' | 'SERVICO'

// ---------------------------------------------------------------------------
// A MATRIZ da Parte 0 — FONTE ÚNICA
// ---------------------------------------------------------------------------

/**
 * Regime e segmento determinam o FORMATO da construção: quais tributos existem e de que
 * lado da operação cada um fica. A Parte 0 da regra é literal sobre o que isso exige:
 *
 *   "A construção lê a matriz. A decomposição lê A MESMA matriz. A decomposição não infere
 *    de que lado um imposto está — ela lê. Divergência entre as duas é erro, e o teste tem
 *    de prová-lo, não confiar."
 *
 * Por isso a matriz mora AQUI, e não em `sale-context.ts`: este é o arquivo que o espelho
 * da edge copia e que a validação do motor consulta. Duas listas escritas à mão, uma em
 * cada lado, são `copia-divergente.md` — e o remédio registrado lá não é conferir as duas,
 * é apagar uma. `sale-context.ts` re-exporta esta; não tem cópia própria.
 */
export type TaxName = 'ICMS' | 'ISS' | 'PIS_COFINS' | 'IPI' | 'IS' | 'IBS' | 'CBS'

/**
 * Onde o tributo fica naquele formato. Os três são afirmações DISTINTAS:
 *   POR_DENTRO  — existe e está embutido na operação interna; entra no coeficiente.
 *   POR_FORA    — existe e é destacado acima da operação interna; compõe o total geral.
 *   INEXISTENTE — não se aplica àquele formato. E isto NÃO é zero.
 *
 * `INEXISTENTE` e uma alíquota de 0% são coisas diferentes: zero afirma "existe e vale
 * nada"; inexistente afirma "não há o que apurar aqui". Confundi-los é `ausente-vs-falso`
 * no schema da matriz — é o que deixa uma alíquota de ICMS vazar para um orçamento de
 * serviço sem que nada falhe.
 */
export type Placement = 'POR_DENTRO' | 'POR_FORA' | 'INEXISTENTE'

/**
 * A matriz da Parte 0, transcrita célula a célula (Lucro Real, três segmentos).
 *
 * | Imposto    | Industrialização | Revenda / Varejo | Prestação de serviço |
 * | ICMS       | POR DENTRO       | POR DENTRO       | INEXISTENTE          |
 * | ISS        | INEXISTENTE      | INEXISTENTE      | POR DENTRO           |
 * | PIS/COFINS | POR DENTRO       | POR DENTRO       | POR DENTRO           |
 * | IPI        | POR FORA         | INEXISTENTE      | INEXISTENTE          |
 * | IS         | POR FORA         | POR FORA         | INEXISTENTE          |
 * | IBS        | POR FORA         | POR FORA         | POR FORA             |
 * | CBS        | POR FORA         | POR FORA         | POR FORA             |
 *
 * O QUE ELA NÃO DECIDE: valor. Alíquota, fator de redução e base reduzida continuam vindo
 * do cadastro do item e do tenant. A matriz responde "este tributo existe aqui, e de que
 * lado?" — e só.
 */
export const TAX_MATRIX: Readonly<Record<CalcType, Readonly<Record<TaxName, Placement>>>> = {
  INDUSTRIALIZACAO: {
    ICMS: 'POR_DENTRO',
    ISS: 'INEXISTENTE',
    PIS_COFINS: 'POR_DENTRO',
    IPI: 'POR_FORA',
    IS: 'POR_FORA',
    IBS: 'POR_FORA',
    CBS: 'POR_FORA',
  },
  REVENDA: {
    ICMS: 'POR_DENTRO',
    ISS: 'INEXISTENTE',
    PIS_COFINS: 'POR_DENTRO',
    IPI: 'INEXISTENTE',
    IS: 'POR_FORA',
    IBS: 'POR_FORA',
    CBS: 'POR_FORA',
  },
  SERVICO: {
    ICMS: 'INEXISTENTE',
    ISS: 'POR_DENTRO',
    PIS_COFINS: 'POR_DENTRO',
    IPI: 'INEXISTENTE',
    IS: 'INEXISTENTE',
    IBS: 'POR_FORA',
    CBS: 'POR_FORA',
  },
}

/** A célula. É por aqui que os dois lados leem — nunca por um `if` de segmento inline. */
export function placementOf(segment: CalcType, tax: TaxName): Placement {
  return TAX_MATRIX[segment][tax]
}

export interface PricingInput {
  calcType: CalcType

  // -- CMV ingredients --
  /** Sum of product_items costs for 1 batch/recipe (R$). */
  totalItemsCost: number

  /**
   * Units produced per 1 batch/recipe (>= 1).
   * e.g. a recipe yields 10 cupcakes → yieldQuantity = 10.
   */
  yieldQuantity: number

  // -- Labor (monetary, from tenant_expense_config) --
  /** Total monthly cost of productive labor (R$). */
  laborCostMonthly: number

  /** Number of productive employees (informational; not used in calculation). */
  numProductiveEmployees: number

  /** Total productive minutes available per month (entire company). */
  monthlyWorkloadMinutes: number

  /** Minutes of productive labor consumed by this product/service. */
  productWorkloadMinutes: number

  // -- Structure (read-only, from tenant_expense_config) --
  /**
   * Fixed + variable + financial expenses as decimal.
   * For REVENDA, caller must include any labor overhead percentage here.
   */
  structurePct: number

  // -- Tax (read-only) --
  /** Single effective tax rate as decimal (combined DAS / ICMS+PIS+COFINS / etc). */
  taxPct: number

  /**
   * IRPJ + CSLL + adicional de IRPJ, como decimal sobre o TOTAL GERAL (R6).
   *
   * POR QUE CAMPO PRÓPRIO, e não somado em `taxPct`: com `taxBreakdown` presente o
   * `taxPct` é IGNORADO no cálculo e conferido contra a soma dos tributos POR DENTRO
   * da matriz (ICMS + ISS + PIS/COFINS). IRPJ e CSLL não são tributos da matriz — a
   * R19 os lista dentro do RRO, ao lado de comissão e lucro, e a R6 diz que a base
   * deles é o VALOR DO LUCRO. Somá-los em `taxPct` faria a conferência acusar
   * divergência; omiti-los faria sumir do coeficiente e baratear o preço em silêncio.
   *
   * Conversão PADRÃO da R5: `% Efetivada = % Original ÷ (1 − c)`.
   * Opcional; default 0 ⇒ coeficiente idêntico ao de antes deste campo existir. No
   * caminho SEM `taxBreakdown` as telas seguem somando tudo em `taxPct`, e passar os
   * dois seria contar duas vezes — por isso a validação recusa a combinação.
   */
  profitTaxPct?: number

  // -- Editable per product --
  /** Sales commission as decimal. */
  commissionPct: number
  /** Desired profit margin as decimal. */
  profitPct: number
  /**
   * RT (Comissão Reserva Técnica) as decimal (EPIC-RT v8, 2026-07-13).
   * Dedução gerencial paralela a comissão/lucro — entra no total das alíquotas
   * e no coeficiente. Opcional; default 0 ⇒ preço idêntico ao anterior.
   */
  rtReservePct?: number

  /**
   * `c` da R3/R5 (.claude/rules/cascata-lucro-real.md): coeficiente da OPERAÇÃO
   * POR FORA — quanto IBS, CBS, IS e IPI representam do total geral, como decimal.
   *
   * NÃO confundir com `coefficient` do resultado, que é o divisor da margem de
   * contribuição (~0,69). Este aqui vale ~0,074 num caso típico.
   *
   * Converte cada % Original (cadastrado sobre o TOTAL GERAL) em % Efetivada
   * (aplicada sobre a operação interna P): `% Efetivada = % Original ÷ (1 − c)`.
   *
   * Opcional; default 0 ⇒ `1 − c = 1` ⇒ conversão é identidade ⇒ preço IDÊNTICO
   * ao de antes desta mudança. Hoje é sempre 0: `cbs_active` e `ibs_active` são
   * false em 109 de 109 cálculos. A resolução de `c` pela R3 é rodada própria.
   */
  externalOpsCoefficient?: number

  /**
   * Tributos DISCRIMINADOS (R5). Opcional — o contrato antigo, com `taxPct`
   * agregado, continua valendo.
   *
   * PRECEDÊNCIA, sem adivinhação:
   *   - ausente  → comportamento de hoje. `taxPct` agregado e
   *                `externalOpsCoefficient` como veio (default 0).
   *   - presente → o motor resolve o `c` pela R3, aplica as DUAS exceções da R5
   *                e IGNORA `taxPct` no cálculo. Se `taxPct` divergir da soma
   *                dos tributos por dentro, é ERRO, não escolha silenciosa.
   */
  taxBreakdown?: TaxBreakdownInput
}

/**
 * INEXISTENTE NÃO É ZERO (Parte 0 da regra).
 *
 * `undefined` significa que o tributo **não existe** naquele segmento da cadeia:
 * não ocupa linha, não entra em soma, não aparece na decomposição. `0` significa
 * que ele existe e está com alíquota zerada. Tratar os dois como a mesma coisa é
 * o que deixa uma alíquota de ICMS vazar para um orçamento de serviço.
 */
export interface TaxBreakdownInput {
  /** ICMS sobre o TOTAL GERAL. `undefined` = INEXISTENTE (serviço); `0` = existe zerado. */
  icmsPct?: number
  /** ISS sobre P, sem gross-up. `undefined` = INEXISTENTE (indústria/revenda); `0` = existe zerado. */
  issPct?: number
  /** PIS/COFINS, alíquota NOMINAL — a efetiva é derivada pela exceção da R5. */
  pisCofinsPct: number
  ibs?: ExternalTax
  cbs?: ExternalTax
  is?: ExternalTax
  ipi?: ExternalTax
  /**
   * R9 — contexto da venda. `true` (default) = o IPI INTEGRA a base do ICMS, que é o
   * que a tabela da R9 manda para consumidor final e para contribuinte que compra para
   * uso, consumo ou ativo. `false` = contribuinte comprando para REVENDA ou
   * INDUSTRIALIZAÇÃO, único caso em que o IPI fica fora da base.
   *
   * Sem IPI declarado os dois valores dão o mesmo número — a bandeira só tem efeito
   * quando existe IPI a excluir.
   */
  ipiIntegraBaseIcms?: boolean
}

/** O que o motor resolveu a partir do `taxBreakdown`. Ausente no caminho antigo. */
export interface ResolvedTaxBreakdown {
  /** O `c` da R3, resolvido em forma fechada. */
  externalOpsCoefficient: number
  /**
   * ICMS como fração do TOTAL GERAL depois da R9 — é o que a CONSTRUÇÃO de fato usou.
   * Igual ao `icmsPct` de entrada quando o IPI integra a base; menor quando não integra.
   * A decomposição LÊ este número em vez de reinferir de que lado o IPI ficou.
   */
  icmsPctOverTotalGeral: number
  /** R9 — o IPI integrou a base do ICMS nesta construção. */
  ipiIntegraBaseIcms: boolean
  /** ICMS: conversão padrão, `% Original ÷ (1 − c)`. */
  icmsPctEffective: number
  /** ISS: exceção da R5 — NÃO sofre gross-up, efetiva = original. */
  issPctEffective: number
  /** PIS/COFINS: exceção da R5 — nominal × (1 − ICMS efetivada − ISS efetivada). */
  pisCofinsPctEffective: number
  icmsValue: number
  issValue: number
  pisCofinsValue: number
  /** Soma dos tributos por fora em R$ = total geral × c. */
  externalValue: number
  /** Total geral = P ÷ (1 − c). */
  totalGeral: number
  /**
   * Cada tributo por fora em R$, com a BASE que a construção usou. Ausente = INEXISTENTE
   * ou não declarado. A soma dos `value` é `externalValue`.
   */
  externalTaxes: {
    ibs?: ResolvedExternalTaxValue
    cbs?: ResolvedExternalTaxValue
    is?: ResolvedExternalTaxValue
    ipi?: ResolvedExternalTaxValue
  }
}

/** Um tributo por fora em R$, com a base que o produziu. */
export interface ResolvedExternalTaxValue {
  /** Alíquota EFETIVA = original × (1 − fator de redução) (R4). */
  effectiveRate: number
  /** Código de base usado (R3). */
  baseCode: BaseCode
  /** Base de cálculo em R$. */
  baseValue: number
  /** Valor do tributo em R$ = base × alíquota efetiva. */
  value: number
}

export interface PricingResult {
  isValid: boolean
  validationErrors: string[]

  // CMV
  cmvTotal: number
  cmvUnit: number
  /**
   * R$ of productive labor for this product.
   * For INDUSTRIALIZACAO/SERVICO: equals productiveLaborCost (already inside cmvUnit).
   * For REVENDA: always 0 (labor overhead is embedded in structureValue).
   */
  laborValue: number
  /** % productive labor represents over priceUnit (for display). */
  laborPctShown: number

  // Percentages echoed back (decimal)
  structurePct: number
  taxPct: number
  commissionPct: number
  profitPct: number
  /** RT (Comissão Reserva Técnica) as decimal, echoed back. */
  rtReservePct: number
  /** IRPJ + CSLL + adicional (R6) como decimal, echoed back. Zero no caminho antigo. */
  profitTaxPct: number

  /** Productive labor cost in R$ for this product (productWorkloadMinutes × costPerMinute). */
  productiveLaborCost: number

  /** RT (Comissão Reserva Técnica) in R$ = priceUnit × rtReservePct. */
  rtReserveValue: number

  /** 1 - (structurePct + taxPct + rtReservePct + commissionPct + profitPct). Must be > 0. */
  coefficient: number

  /** Presente só quando `taxBreakdown` foi informado. Ver `ResolvedTaxBreakdown`. */
  taxBreakdownResolved?: ResolvedTaxBreakdown

  // Prices
  priceUnit: number
  priceTotal: number

  // Breakdown (absolute R$ values derived from priceUnit × each %)
  structureValue: number
  taxValue: number
  /** IRPJ + CSLL + adicional em R$ = priceUnit × profitTaxPct efetivado (R6). */
  profitTaxValue: number
  commissionValue: number
  profitValue: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const round2 = (v: number): number => Math.round(v * 100) / 100

function emptyResult(errors: string[]): PricingResult {
  return {
    isValid: false,
    validationErrors: errors,
    cmvTotal: 0,
    cmvUnit: 0,
    productiveLaborCost: 0,
    laborValue: 0,
    laborPctShown: 0,
    structurePct: 0,
    taxPct: 0,
    profitTaxPct: 0,
    commissionPct: 0,
    profitPct: 0,
    rtReservePct: 0,
    rtReserveValue: 0,
    coefficient: 0,
    priceUnit: 0,
    priceTotal: 0,
    structureValue: 0,
    taxValue: 0,
    profitTaxValue: 0,
    commissionValue: 0,
    profitValue: 0,
  }
}

/** Tolerância da conferência entre `taxPct` agregado e a soma do `taxBreakdown`. */
const TAX_SUM_TOLERANCE = 1e-9

/**
 * Coerência entre o segmento e os tributos declarados, mais a conferência do
 * `taxPct`. Nenhuma destas devolve número: em contrato de cálculo, divergência
 * é erro. Default neutro transforma erro em silêncio — classe do #47.
 */
function validateTaxBreakdown(
  calcType: CalcType,
  tb: TaxBreakdownInput,
  taxPct: number,
  externalOpsCoefficientInformado: number | undefined,
): string[] {
  const errors: string[] = []

  // O `c` é resolvido a partir do `taxBreakdown`. Receber os dois é ambiguidade,
  // não redundância: não dá para saber qual o chamador quis que valesse.
  if (externalOpsCoefficientInformado !== undefined) {
    errors.push(
      'taxBreakdown e externalOpsCoefficient vieram juntos: o coeficiente é RESOLVIDO a partir do taxBreakdown. Passe um ou outro.',
    )
  }

  // Matriz regime × segmento (Parte 0). A conferência LÊ `TAX_MATRIX` — não repete a
  // regra num `if`. Um `if` aqui seria a segunda cópia que a Parte 0 proíbe: bastaria
  // acrescentar um tributo à matriz e esquecer o `if` para o formato divergir em silêncio.
  //
  // `undefined` é a única forma de dizer "não existe"; `0` afirma que existe e está zerado.
  // O rótulo é o NOME DO CAMPO do contrato, não o do tributo na matriz: quem lê o erro
  // está olhando o objeto que montou, e é esse nome que ele vai corrigir.
  const porDentro: ReadonlyArray<readonly [TaxName, string, number | undefined]> = [
    ['ICMS', 'icmsPct', tb.icmsPct],
    ['ISS', 'issPct', tb.issPct],
    ['PIS_COFINS', 'pisCofinsPct', tb.pisCofinsPct],
  ]
  for (const [nome, campo, valor] of porDentro) {
    const place = placementOf(calcType, nome)
    if (place === 'POR_DENTRO' && valor === undefined) {
      errors.push(
        `${campo} veio INEXISTENTE (undefined) em ${calcType}, onde a matriz diz POR DENTRO. Use 0 se a alíquota é zero.`,
      )
    }
    if (place !== 'POR_DENTRO' && valor !== undefined) {
      errors.push(
        `${campo} veio como ${valor} (alíquota declarada) em ${calcType}, onde a matriz diz INEXISTENTE. Use undefined.`,
      )
    }
  }

  const porFora: ReadonlyArray<readonly [TaxName, string, ExternalTax | undefined]> = [
    ['IPI', 'ipi', tb.ipi],
    ['IS', 'is', tb.is],
    ['IBS', 'ibs', tb.ibs],
    ['CBS', 'cbs', tb.cbs],
  ]
  for (const [nome, campo, tax] of porFora) {
    const place = placementOf(calcType, nome)
    if (tax && place !== 'POR_FORA') {
      errors.push(`${campo} declarado em ${calcType}, onde a matriz diz INEXISTENTE.`)
    }
  }

  // `taxPct` é ignorado no cálculo, mas não pode divergir em silêncio.
  //
  // A comparação é contra a soma dos tributos NOMINAIS, não dos efetivados.
  // Decidido assim porque `taxPct` sempre foi nominal agregado e é assim que as
  // telas o montam hoje; comparar com efetivadas mudaria o significado de um
  // campo existente sem ninguém ter pedido.
  //
  // Consequência a conhecer: se alguma tela um dia passar `taxPct` JÁ efetivado,
  // esta conferência acusa divergência sem haver erro. A correção certa nesse
  // caso é a tela parar de efetivar, não esta conferência afrouxar.
  const somaPorDentro = (tb.icmsPct ?? 0) + (tb.issPct ?? 0) + tb.pisCofinsPct
  if (Math.abs(taxPct - somaPorDentro) > TAX_SUM_TOLERANCE) {
    errors.push(
      `taxPct (${taxPct}) diverge da soma dos tributos por dentro do taxBreakdown (${somaPorDentro}). ` +
        'Com taxBreakdown presente o taxPct é ignorado no cálculo, mas divergência é erro, não escolha silenciosa.',
    )
  }

  return errors
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Calculates selling price using the coefficient method (por dentro):
 *   priceUnit = cmvUnit / coefficient
 *   coefficient = 1 − (structurePct + taxPct + commissionPct + profitPct)
 *
 * All percentages are applied over the final price, not over CMV.
 *
 * Labor handling:
 *  - INDUSTRIALIZACAO / SERVICO: productive labor enters CMV directly.
 *  - REVENDA: productive labor is zero; any overhead must be pre-included in structurePct.
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const errors: string[] = []

  if (input.yieldQuantity < 1) {
    errors.push('yieldQuantity deve ser >= 1')
  }

  if (input.totalItemsCost < 0) {
    errors.push('totalItemsCost não pode ser negativo')
  }

  if (errors.length > 0) {
    return emptyResult(errors)
  }

  const {
    calcType,
    totalItemsCost,
    yieldQuantity,
    laborCostMonthly,
    monthlyWorkloadMinutes,
    productWorkloadMinutes,
    structurePct,
    taxPct,
    commissionPct,
    profitPct,
  } = input
  const rtReservePct = input.rtReservePct ?? 0
  const profitTaxPct = input.profitTaxPct ?? 0
  const externalOpsCoefficient = input.externalOpsCoefficient ?? 0

  // Step 1 — custo de MO produtiva deste produto (R$)
  const costPerMinute = monthlyWorkloadMinutes > 0
    ? laborCostMonthly / monthlyWorkloadMinutes
    : 0
  const productiveLaborCost = round2(productWorkloadMinutes * costPerMinute)

  // Step 2 — CMV por unidade
  const itemsCostPerUnit = round2(totalItemsCost / yieldQuantity)

  // INDUSTRIALIZACAO e SERVICO: MO produtiva entra no CMV
  // REVENDA: MO produtiva é zero; overhead de mão de obra está em structurePct
  const cmvUnit = calcType === 'REVENDA'
    ? itemsCostPerUnit
    : round2(itemsCostPerUnit + productiveLaborCost)
  const cmvTotal = round2(cmvUnit * yieldQuantity)

  // Step 3 — conversão % Original → % Efetivada (R5)
  // Os percentuais chegam cadastrados sobre o TOTAL GERAL. O divisor abaixo
  // trabalha sobre a operação interna P, então cada um é convertido por
  // `% Efetivada = % Original ÷ (1 − c)` antes de entrar na soma.
  //
  // Dois caminhos, e a precedência é explícita:
  //   sem `taxBreakdown` → `c` vem como veio (default 0) e `taxPct` é usado agregado.
  //   com `taxBreakdown` → `c` é resolvido pela R3 e as DUAS exceções da R5 valem.
  const tb = input.taxBreakdown
  let k: number
  let taxPctEff: number
  let resolved: ResolvedTaxBreakdown | undefined
  let resolvedExternal: ExternalOpsResult['externalTaxes'] = {}

  if (!tb) {
    if (externalOpsCoefficient < 0 || externalOpsCoefficient >= 1) {
      return emptyResult(['externalOpsCoefficient fora do intervalo [0, 1)'])
    }
    // Sem `taxBreakdown` a tela soma IRPJ e CSLL dentro de `taxPct` — é o contrato
    // antigo. Aceitar `profitTaxPct` aqui contaria os dois DUAS VEZES, em silêncio, que
    // é a classe do #47: default neutro em contrato de cálculo transforma erro em zero.
    if (input.profitTaxPct !== undefined) {
      return emptyResult([
        'profitTaxPct exige taxBreakdown: sem ele o taxPct agregado já carrega IRPJ e CSLL, e somar os dois conta duas vezes.',
      ])
    }
    k = 1 - externalOpsCoefficient
    taxPctEff = taxPct / k
  } else {
    const tbErrors = validateTaxBreakdown(calcType, tb, taxPct, input.externalOpsCoefficient)
    if (tbErrors.length > 0) return emptyResult(tbErrors)

    const icms = tb.icmsPct ?? 0
    const iss = tb.issPct ?? 0

    const cResult = resolveExternalOpsCoefficient({
      icmsPct: icms,
      issPct: iss,
      pisCofinsPct: tb.pisCofinsPct,
      ibs: tb.ibs,
      cbs: tb.cbs,
      is: tb.is,
      ipi: tb.ipi,
      ipiIntegraBaseIcms: tb.ipiIntegraBaseIcms,
    })
    if (!cResult.isValid) {
      return emptyResult(cResult.validationErrors.map((e) => `operação por fora: ${e}`))
    }

    k = 1 - cResult.externalOpsCoefficient

    // ICMS: conversão PADRÃO — mas sobre o que a R9 deixou na base, não sobre o
    // `icmsPct` cru. Os dois coincidem quando o IPI integra a base (o padrão).
    const icmsEff = cResult.icmsPctOverTotalGeral / k
    // Exceção 1 da R5 — ISS no serviço NÃO sofre gross-up. A base do IBS/CBS
    // exclui o ISS, mas o IBS/CBS não entra na base do ISS.
    const issEff = iss
    // Exceção 2 da R5 — PIS/COFINS incide sobre `P − ICMS − ISS`. NÃO usar a
    // conversão padrão ÷ (1 − c).
    const pisCofinsEff = tb.pisCofinsPct * (1 - icmsEff - issEff)

    taxPctEff = icmsEff + issEff + pisCofinsEff
    resolved = {
      externalOpsCoefficient: cResult.externalOpsCoefficient,
      icmsPctOverTotalGeral: cResult.icmsPctOverTotalGeral,
      ipiIntegraBaseIcms: tb.ipiIntegraBaseIcms !== false,
      icmsPctEffective: icmsEff,
      issPctEffective: issEff,
      pisCofinsPctEffective: pisCofinsEff,
      // Valores em R$ são preenchidos depois de `priceUnit` existir.
      icmsValue: 0,
      issValue: 0,
      pisCofinsValue: 0,
      externalValue: 0,
      totalGeral: 0,
      externalTaxes: {},
    }
    resolvedExternal = cResult.externalTaxes
  }

  const structurePctEff = structurePct / k
  const rtReservePctEff = rtReservePct / k
  const commissionPctEff = commissionPct / k
  const profitPctEff = profitPct / k
  // R6 — IRPJ e CSLL têm o valor do lucro como base, e chegam já cadastrados sobre o
  // total geral. Conversão PADRÃO da R5, como qualquer categoria da operação interna.
  const profitTaxPctEff = profitTaxPct / k

  // Step 3.1 — coeficiente da margem de contribuição (por dentro de P).
  // NÃO confundir com `externalOpsCoefficient`: este é o divisor (~0,69).
  // Não aplicar round2 aqui para preservar precisão na divisão.
  const coefficient = 1 - (structurePctEff + taxPctEff + profitTaxPctEff + rtReservePctEff + commissionPctEff + profitPctEff)

  // Step 4 — validar coeficiente
  if (coefficient <= 0) {
    return emptyResult(['Coeficiente <= 0: a soma dos percentuais excede 100%'])
  }

  // Step 5 — preço unitário e total
  const priceUnit = round2(cmvUnit / coefficient)
  const priceTotal = round2(priceUnit * yieldQuantity)

  // Step 6 — valores absolutos (para exibição no DRE).
  // R8: `valor do tributo k = P × alíquota efetivada`. Com c = 0 as efetivadas
  // são iguais às originais e estes valores são idênticos aos de antes.
  const structureValue = round2(priceUnit * structurePctEff)
  const taxValue       = round2(priceUnit * taxPctEff)
  const profitTaxValue = round2(priceUnit * profitTaxPctEff)
  const commissionValue = round2(priceUnit * commissionPctEff)
  const profitValue    = round2(priceUnit * profitPctEff)
  const rtReserveValue = round2(priceUnit * rtReservePctEff)

  if (resolved) {
    const totalGeral = round2(priceUnit / k)
    resolved.icmsValue = round2(priceUnit * resolved.icmsPctEffective)
    resolved.issValue = round2(priceUnit * resolved.issPctEffective)
    resolved.pisCofinsValue = round2(priceUnit * resolved.pisCofinsPctEffective)
    resolved.externalValue = round2(totalGeral * resolved.externalOpsCoefficient)
    resolved.totalGeral = totalGeral
    for (const nome of ['ibs', 'cbs', 'is', 'ipi'] as const) {
      const t = resolvedExternal[nome]
      if (!t) continue
      resolved.externalTaxes[nome] = {
        effectiveRate: t.effectiveRate,
        baseCode: t.baseCode,
        baseValue: round2(totalGeral * t.basePctOfTotal),
        value: round2(totalGeral * t.valuePctOfTotal),
      }
    }
  }

  // Para REVENDA: MO é parte da estrutura (já em structureValue); não aparece como linha separada.
  // Para INDUSTRIALIZACAO/SERVICO: MO produtiva já entrou no CMV como productiveLaborCost.
  const laborValue = calcType === 'REVENDA' ? 0 : round2(productiveLaborCost)

  // laborPctShown: % que MO produtiva representa no preço final (para exibição)
  const laborPctShown = priceUnit > 0
    ? Math.round((productiveLaborCost / priceUnit) * 10000) / 10000
    : 0

  return {
    isValid: true,
    validationErrors: [],
    cmvTotal,
    cmvUnit,
    productiveLaborCost,
    laborValue,
    laborPctShown,
    structurePct,
    taxPct,
    profitTaxPct,
    commissionPct,
    profitPct,
    rtReservePct,
    rtReserveValue,
    coefficient,
    taxBreakdownResolved: resolved,
    priceUnit,
    priceTotal,
    structureValue,
    taxValue,
    profitTaxValue,
    commissionValue,
    profitValue,
  }
}

// ---------------------------------------------------------------------------
// Workload normaliser (used by UI before calling calculatePricing)
// ---------------------------------------------------------------------------

export type WorkloadUnit = 'MINUTES' | 'HOURS' | 'DAYS' | 'ACTIVITIES'

/**
 * Converts a workload value to minutes so the engine always works in minutes.
 * For SERVICO with HOURS/DAYS the raw value is kept (service measures differently).
 */
export function normalizeToMinutes(
  value: number,
  unit: WorkloadUnit,
  isService: boolean,
): number {
  if (isService) return value // service uses raw unit as-is

  switch (unit) {
    case 'HOURS':
      return value * 60
    case 'DAYS':
      return value * 480 // 8h * 60min
    case 'MINUTES':
    case 'ACTIVITIES':
    default:
      return value
  }
}

// ---------------------------------------------------------------------------
// Coeficiente da operação por fora (`c` da R3) — resolvido em forma fechada
//
// Mora aqui, e não em arquivo próprio, porque o espelho da edge copia um arquivo
// só — ver o aviso no cabeçalho. `src/utils/external-ops-coefficient.ts` é o
// re-export deste bloco e segue sendo o caminho de import dos testes.
//
// >>> ATENÇÃO AO NOME <<<
// Neste repositório `coefficient`, sozinho, significa outra coisa: é o DIVISOR
// DA MARGEM DE CONTRIBUIÇÃO calculado acima (~0,69). O `c` daqui vale ~0,074 num
// caso típico. São grandezas diferentes, com uma ordem de magnitude de distância.
// Por isso nada neste bloco se chama `coefficient` sem qualificação — é sempre
// `externalOpsCoefficient` ou `c` no contexto da R3.
//
// Por que forma fechada e não iteração: a base de cada tributo por fora é LINEAR
// em `c` (`base_k = alfa_k + beta_k × c`), então o sistema resolve com uma
// divisão. Não há referência circular nem ponto fixo a convergir.
// ---------------------------------------------------------------------------

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
  /**
   * R9 — o IPI integra a base do ICMS? Default `true`, que é o comportamento de
   * sempre e o que a tabela da R9 manda em duas das três linhas. Ver
   * `TaxBreakdownInput.ipiIntegraBaseIcms`.
   */
  ipiIntegraBaseIcms?: boolean
}

/**
 * Um tributo POR FORA, resolvido. Tudo como FRAÇÃO DO TOTAL GERAL, para que o chamador
 * multiplique pelo total e tenha o R$ sem refazer conta nenhuma.
 */
export interface ResolvedExternalTax {
  /** Alíquota EFETIVA = original × (1 − fator de redução) (R4). */
  effectiveRate: number
  /** Código de base usado (R3). */
  baseCode: BaseCode
  /** A base do tributo como fração do total geral, já avaliada em `c`. */
  basePctOfTotal: number
  /** O valor do tributo como fração do total geral = `effectiveRate × basePctOfTotal`. */
  valuePctOfTotal: number
}

export interface ExternalOpsResult {
  isValid: boolean
  validationErrors: string[]
  /** O `c` da R3. Zero quando não há tributo por fora. */
  externalOpsCoefficient: number
  /**
   * Cada tributo por fora, um a um. Ausente = INEXISTENTE ou não declarado — nunca um
   * zero afirmado (`.claude/rules/ausente-vs-falso.md`).
   *
   * Existe para que a DECOMPOSIÇÃO leia a base que a CONSTRUÇÃO usou, em vez de
   * redescobri-la por divisão. É a exigência da Parte 0: os dois lados leem a mesma coisa.
   */
  externalTaxes: {
    ibs?: ResolvedExternalTax
    cbs?: ResolvedExternalTax
    is?: ResolvedExternalTax
    ipi?: ResolvedExternalTax
  }
  /**
   * ICMS como fração do TOTAL GERAL, DEPOIS da R9.
   *
   * Igual a `icmsPct` quando o IPI integra a base (o padrão). Quando não integra, é
   * `icmsPct × (1 − IPI/total geral)` — o ICMS incide sobre o total geral menos o IPI.
   * Quem calcula preço deve usar ESTE valor, não o `icmsPct` de entrada: eles só
   * coincidem no caso padrão, e confundi-los devolve o ICMS da linha errada da R9.
   */
  icmsPctOverTotalGeral: number
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
  icmsPctOverTotalGeral: 0,
  externalTaxes: {},
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

  // --- R9: o IPI integra a base do ICMS? ---
  //
  // O `icmsPct` chega cadastrado sobre o TOTAL GERAL, e o total geral INCLUI o IPI —
  // por isso o caso padrão (`true`) é simplesmente `i`, sem termo nenhum. Quando o IPI
  // NÃO integra (contribuinte comprando para revenda ou industrialização), o ICMS passa
  // a incidir sobre `total geral − IPI`:
  //
  //   ICMS/T = i × (1 − IPI/T)   e   IPI/T = a_IPI × (alfa_IPI + beta_IPI × c)
  //
  // que continua LINEAR em `c` — a R3 diz que não há referência circular nem iteração, e
  // esta extensão preserva isso: o que muda é o par (alfa, beta) do ICMS, não o método.
  const base1: BaseTerms = { alfa: 1, beta: -1 }
  const aIPIParaIcms = effectiveRate(input.ipi)
  const termsIPIParaIcms = input.ipi
    ? (input.ipi.baseCode === 2
        ? { alfa: (1 - s) - i, beta: -(1 - s) }
        : input.ipi.baseCode === 3
          ? { alfa: (1 - p) * ((1 - s) - i), beta: -(1 - p) * (1 - s) }
          : base1)
    : base1
  const ipiForaDaBaseIcms = input.ipiIntegraBaseIcms === false && aIPIParaIcms > 0
  // ICMS como fração do total geral: `icmsAlfa + icmsBeta × c`.
  const icmsAlfa = ipiForaDaBaseIcms ? i * (1 - aIPIParaIcms * termsIPIParaIcms.alfa) : i
  const icmsBeta = ipiForaDaBaseIcms ? -i * aIPIParaIcms * termsIPIParaIcms.beta : 0

  // --- Bases que não dependem de ninguém (códigos 1 a 3) ---
  // `base2/T = P/T − ICMS/T − ISS/T = (1−s)(1−c) − (icmsAlfa + icmsBeta·c)`.
  // No caso padrão `icmsAlfa = i` e `icmsBeta = 0`, e os pares voltam a ser os da R3.
  const base2: BaseTerms = { alfa: (1 - s) - icmsAlfa, beta: -(1 - s) - icmsBeta }
  const base3: BaseTerms = { alfa: (1 - p) * base2.alfa, beta: (1 - p) * base2.beta }

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

  // --- Passo 4: cada tributo por fora, com a base AVALIADA em `c` ---
  // Não é conta nova: é o mesmo par (alfa, beta) do passo 3, agora resolvido. A soma dos
  // `valuePctOfTotal` é exatamente `c` — invariante que o teste afirma.
  const externalTaxes: ExternalOpsResult['externalTaxes'] = {}
  for (const [nome, tax] of declarados) {
    if (!tax) continue
    const effectiveRateOf = effectiveRate(tax)
    const t = termsFor(tax.baseCode, base4, base5)
    const basePctOfTotal = t.alfa + t.beta * c
    externalTaxes[nome] = {
      effectiveRate: effectiveRateOf,
      baseCode: tax.baseCode,
      basePctOfTotal,
      valuePctOfTotal: effectiveRateOf * basePctOfTotal,
    }
  }

  return {
    isValid: true,
    validationErrors: [],
    externalOpsCoefficient: c,
    icmsPctOverTotalGeral: icmsAlfa + icmsBeta * c,
    externalTaxes,
  }
}
