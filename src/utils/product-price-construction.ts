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
import { construirPrecoHibrido } from './simples-hibrido'
import { resolveConstructionTaxInput, type BaseCodeOverrides, type BuyerPurpose, type BuyerTypeEnum, type ConstructionTaxRates, type SaleScope } from './sale-context'

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

  /**
   * O MESMO tipo que `resolveConstructionTaxInput` recebe, importado em vez de
   * redeclarado.
   *
   * Até 16/09/2026 esta lista era um literal inline com os mesmos campos — a
   * SEGUNDA cópia do mesmo contrato, e ela já divergiu: ao separar a redução em
   * IBS e CBS, o `tsc` apontou os quatro chamadores de `ConstructionTaxRates` e
   * NÃO apontou este arquivo, porque ele tinha a própria declaração. É
   * `copia-divergente.md` na forma literal, e o remédio dela não é conferir as
   * duas: *"é apagar uma. Com um construtor só, acrescentar um campo vale para
   * todas as rotas, e a omissão deixa de ser possível."*
   */
  rates: ConstructionTaxRates
  /**
   * SIMPLES HÍBRIDO — os dois números do anexo/faixa do tenant, em DECIMAL.
   *
   * `dasHibridoPct` é o DAS reduzido (por dentro) e `deducaoBaseIbsCbsPct` é a dedução da
   * base de IBS/CBS do art. 12 §2º V. Vêm de `resolveDasHibridoDoTenant`, que é a única
   * travessia entre `tenant_settings` e as funções puras dos anexos.
   *
   * Ausentes fora do híbrido — e ausência aqui NÃO é zero: sem eles o híbrido cai em
   * "não configurado" e a tela mantém o preço que já tinha, em vez de formar um preço com
   * DAS de zero.
   */
  dasHibridoPct?: number | null
  deducaoBaseIbsCbsPct?: number | null

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
  // ─── SIMPLES HÍBRIDO ───────────────────────────────────────────────────────────────────
  //
  // A trava de `REGIMES_COM_MATRIZ` dizia, com todas as letras: "Lucro Presumido e Simples
  // Híbrido habilitam os campos de IBS/CBS/IS/IPI na tela e NÃO têm regra escrita... Ficam
  // no contrato antigo, com o preço que já tinham, ATÉ QUE A REGRA DELES EXISTA."
  //
  // A do híbrido passou a existir em 19/09/2026, e ela NÃO é a do Lucro Real: o `c` não sai
  // de `buildTaxBreakdown` porque ICMS, ISS e PIS/COFINS não são linha aqui — estão no DAS,
  // e a base de IBS/CBS é `P × (1 − dedução)`. Por isso o ramo é próprio, e não um item a
  // mais naquela lista: acrescentá-lo lá aplicaria a fórmula errada com o nome certo.
  //
  // O Lucro Presumido CONTINUA fora, e isso não é esquecimento: a regra dele segue sem ser
  // escrita.
  if (String(input.taxableRegime) === 'SIMPLES_HIBRIDO') {
    if (input.despAcessorias > 0) {
      return NOT_APPLIED('produto com acréscimos gravados — a base deles é do orçamento (R11)')
    }
    // `== null` ANTES de `Number()`, e a ordem é o ponto: `Number(null)` é 0, e 0 é finito.
    // Só a checagem numérica deixaria "anexo não configurado" virar "DAS de zero" —
    // `ausente-vs-falso.md` no próprio guarda que existe para impedi-lo.
    const das = input.dasHibridoPct == null ? NaN : Number(input.dasHibridoPct)
    const ded = input.deducaoBaseIbsCbsPct == null ? NaN : Number(input.deducaoBaseIbsCbsPct)
    if (!Number.isFinite(das) || !Number.isFinite(ded)) {
      // Sem anexo configurado não há DAS a aplicar. Formar o preço com zero afirmaria que o
      // tenant não paga DAS — `ausente-vs-falso.md`. O chamador mantém o preço antigo.
      return NOT_APPLIED('Simples Híbrido sem anexo/faixa configurados em tenant_settings')
    }

    const hib = construirPrecoHibrido({
      custoTotal: input.costTotal,
      despesasPct: input.structurePct,
      rtPct: input.rtReservePct,
      comissaoPct: input.commissionPct,
      lucroPct: input.profitPct,
      dasHibridoPct: das,
      deducaoBasePct: ded,
      isPct: Number(input.rates.isPct) || 0,
      ibsPct: Number(input.rates.ibsPct) || 0,
      cbsPct: Number(input.rates.cbsPct) || 0,
      segmento: input.segment as never,
    })

    /**
     * Os CÓDIGOS DE BASE do híbrido, e eles são LIDOS da conta, não escolhidos.
     *
     * A R3 define o código 3 como "P − ICMS/ISS − PIS/COFINS" e o 4 como "código 3 + IS".
     * No híbrido esses tributos não são discriminados — estão dentro do DAS —, e o que se
     * deduz é exatamente a parcela deles contida nele. A FORMA é a mesma: o IS incide sobre
     * a operação interna líquida dos tributos por dentro (código 3), e IBS/CBS sobre ela
     * mais o IS (código 4). O IPI não tem entrada porque é INEXISTENTE por fora aqui.
     */
    const resolved: ResolvedTaxBreakdown = {
      externalOpsCoefficient: hib.ficha.externalOpsCoefficient,
      icmsPctOverTotalGeral: 0,
      ipiIntegraBaseIcms: false,
      icmsPctEffective: 0,
      issPctEffective: 0,
      pisCofinsPctEffective: 0,
      icmsValue: 0,
      issValue: 0,
      pisCofinsValue: 0,
      externalValue: hib.isValue + hib.ibsValue + hib.cbsValue,
      totalGeral: hib.totalACobrar,
      externalTaxes: {
        ...(hib.isPctAplicado > 0
          ? { is: { effectiveRate: hib.isPctAplicado, baseCode: 3, baseValue: hib.baseIS, value: hib.isValue } }
          : {}),
        ibs: { effectiveRate: Number(input.rates.ibsPct) || 0, baseCode: 4, baseValue: hib.baseIbsCbs, value: hib.ibsValue },
        cbs: { effectiveRate: Number(input.rates.cbsPct) || 0, baseCode: 4, baseValue: hib.baseIbsCbs, value: hib.cbsValue },
      },
    }

    return {
      applied: true,
      reason: '',
      opInterna: hib.precoPorDentro,
      totalGeral: hib.totalACobrar,
      resolved,
      errors: hib.avisos,
    }
  }

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
