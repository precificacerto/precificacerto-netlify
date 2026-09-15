/**
 * sale-context.ts — a MATRIZ da Parte 0 e o CONTEXTO DA VENDA da R9.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md`, Parte 0 e R3/R9.
 *
 * >>> POR QUE ESTE ARQUIVO EXISTE <<<
 * A Parte 0 diz, literalmente: "A construção lê a matriz. A decomposição lê A MESMA
 * matriz. A decomposição não infere de que lado um imposto está — ela lê. Divergência
 * entre as duas é erro, e o teste tem de prová-lo, não confiar."
 *
 * Duas listas escritas à mão, uma em cada lado, são a `copia-divergente.md`: o remédio
 * registrado ali não é conferir as duas, é APAGAR UMA. `TAX_MATRIX` é a que sobra.
 *
 * INEXISTENTE NÃO É ZERO. Zero é uma alíquota que resulta em valor nulo mas ocupa
 * linha, entra em soma e aparece na decomposição. Inexistente não tem linha. É a mesma
 * distinção de `.claude/rules/ausente-vs-falso.md`, aqui no FORMATO em vez do valor.
 *
 * O QUE A MATRIZ NÃO DECIDE: valor. Alíquota, fator de redução do IVA Dual e base
 * reduzida continuam vindo do cadastro do item e do tenant. A matriz responde "este
 * tributo existe aqui, e de que lado?" — e só.
 *
 * ESCOPO: Lucro Real, nos três segmentos. Fora do Lucro Real a cascata tributária é
 * outra e esta matriz não se aplica — ver o Escopo da regra.
 */

import { placementOf as placementOfMatrix } from './pricing-engine'
import type { BaseCode, CalcType, ExternalTax, TaxBreakdownInput, TaxName } from './pricing-engine'

/** O segmento da cadeia. Mesmo eixo do `CalcType` do motor, por construção. */
export type Segment = CalcType

/**
 * A MATRIZ. Re-export puro de `pricing-engine.ts` — NÃO há cópia aqui.
 *
 * Ela mora lá porque é lá que a validação do motor a consulta e é lá que o espelho da edge
 * copia. Uma segunda transcrição neste arquivo seria exatamente a `copia-divergente.md` que
 * a Parte 0 existe para impedir: acrescentar um tributo num lado e esquecer o outro faria o
 * formato divergir em silêncio. Com um re-export, não há o que esquecer.
 */
export { TAX_MATRIX, placementOf } from './pricing-engine'
export type { TaxName, Placement } from './pricing-engine'

/**
 * Códigos de base PADRÃO por tributo (R3).
 *
 *   1 → P                                    · IPI, IS
 *   4 → P − ICMS/ISS − PIS/COFINS + IS       · IBS, CBS
 *
 * A LC 214/2025, art. 12, §2º, II exclui expressamente o IPI da base do IBS/CBS; o IS
 * não está entre as exclusões e integra. Daí o padrão do IBS/CBS ser 4, e não 5.
 */
export const DEFAULT_BASE_CODE: Readonly<Record<'IPI' | 'IS' | 'IBS' | 'CBS', BaseCode>> = {
  IPI: 1,
  IS: 1,
  IBS: 4,
  CBS: 4,
} as const

// ---------------------------------------------------------------------------
// R9 — contexto da venda
// ---------------------------------------------------------------------------

/**
 * As TRÊS linhas da tabela da R9. Repare que são três, e o enum do banco
 * (`buyer_type_enum`) tem DUAS posições — ver `resolveBuyerKind`.
 */
export type BuyerKind =
  | 'CONTRIBUINTE_REVENDA_INDUSTRIALIZACAO'
  | 'CONTRIBUINTE_USO_CONSUMO_ATIVO'
  | 'NAO_CONTRIBUINTE'

/** O enum gravado hoje em `pricing_calculations.buyer_type`. */
export type BuyerTypeEnum = 'CONSUMIDOR_FINAL' | 'CONTRIBUINTE_PJ'

/** O enum gravado hoje em `pricing_calculations.sale_scope`. */
export type SaleScope = 'INTRAESTADUAL' | 'INTERESTADUAL'

/** Destinação da compra pelo adquirente contribuinte. É o eixo que o banco NÃO tem. */
export type BuyerPurpose = 'REVENDA_INDUSTRIALIZACAO' | 'USO_CONSUMO_ATIVO'

/**
 * Traduz o enum de DUAS posições do banco para a linha da R9, que tem TRÊS.
 *
 * `CONSUMIDOR_FINAL` é inequívoco: não contribuinte. `CONTRIBUINTE_PJ` NÃO É — a
 * tabela separa quem compra para revender ou industrializar de quem compra para uso,
 * consumo ou ativo, e essa destinação não existe em coluna nenhuma hoje.
 *
 * Devolve `null` nesse caso, e `null` significa NÃO CLASSIFICADO, nunca uma das duas
 * linhas. Escolher a mais provável seria `ausente-vs-falso.md` outra vez: um valor
 * inferido exibido sem marca é indistinguível de um valor apurado. Quem consome decide
 * o que fazer com a ausência — e `resolveSaleContext` decide preservando o
 * comportamento de hoje, que é o que as duas linhas "Sim" da tabela já mandam.
 */
export function resolveBuyerKind(
  buyerType: BuyerTypeEnum,
  buyerPurpose?: BuyerPurpose | null,
): BuyerKind | null {
  if (buyerType === 'CONSUMIDOR_FINAL') return 'NAO_CONTRIBUINTE'
  if (buyerPurpose === 'REVENDA_INDUSTRIALIZACAO') return 'CONTRIBUINTE_REVENDA_INDUSTRIALIZACAO'
  if (buyerPurpose === 'USO_CONSUMO_ATIVO') return 'CONTRIBUINTE_USO_CONSUMO_ATIVO'
  return null
}

export interface SaleContextInput {
  buyerType: BuyerTypeEnum
  saleScope: SaleScope
  /** Ausente hoje em todo documento — ver `resolveBuyerKind`. */
  buyerPurpose?: BuyerPurpose | null
}

export interface SaleContextResult {
  /** A linha da R9, ou `null` quando a destinação do contribuinte não foi informada. */
  buyerKind: BuyerKind | null
  /**
   * R9, coluna "IPI na base do ICMS". Duas das três linhas dizem Sim; só o contribuinte
   * que compra para revenda ou industrialização diz Não.
   *
   * Com `buyerKind` NULO o valor é `true` — não por ser o mais provável, mas porque é o
   * comportamento que o motor já tem (o ICMS incide sobre o total geral, e o total geral
   * inclui o IPI). Trocá-lo por dedução mudaria preço de documento em produção a partir
   * de um campo que ninguém preencheu.
   */
  ipiIntegraBaseIcms: boolean
  /**
   * R9, coluna "DIFAL". `null` quando a linha não foi determinada.
   *
   * NÃO é aplicado ao preço aqui: DIFAL está em "Fora do escopo" da regra, com base por
   * diferencial e linha própria. Sai resolvido para que quem for implementá-lo leia a
   * tabela em vez de reescrevê-la.
   */
  difalAplica: boolean | null
}

/** Resolve o contexto da venda pela tabela da R9. */
export function resolveSaleContext(input: SaleContextInput): SaleContextResult {
  const buyerKind = resolveBuyerKind(input.buyerType, input.buyerPurpose)
  const interestadual = input.saleScope === 'INTERESTADUAL'

  if (buyerKind === 'CONTRIBUINTE_REVENDA_INDUSTRIALIZACAO') {
    return { buyerKind, ipiIntegraBaseIcms: false, difalAplica: false }
  }
  if (buyerKind === 'CONTRIBUINTE_USO_CONSUMO_ATIVO' || buyerKind === 'NAO_CONTRIBUINTE') {
    return { buyerKind, ipiIntegraBaseIcms: true, difalAplica: interestadual }
  }
  return { buyerKind: null, ipiIntegraBaseIcms: true, difalAplica: null }
}

// ---------------------------------------------------------------------------
// Montagem do `taxBreakdown` — o lado da CONSTRUÇÃO lendo a matriz
// ---------------------------------------------------------------------------

/** Alíquotas do cadastro, todas DECIMAIS (0,17 = 17%). */
/**
 * OVERRIDE MANUAL dos códigos de base (7.5, item 6: "contexto da venda derivando os códigos
 * de base, COM OVERRIDE MANUAL"; na planilha, `Lucro Real · F38:F41`, célula amarela).
 *
 * `undefined` NÃO é o código 1: é NÃO CLASSIFICADO, e cai no padrão da R3. Confundir os dois
 * transformaria todo produto legado num produto com base `P`, silenciosamente
 * (`.claude/rules/ausente-vs-falso.md`).
 */
export interface BaseCodeOverrides {
  ibs?: BaseCode | null
  cbs?: BaseCode | null
  is?: BaseCode | null
  ipi?: BaseCode | null
}

/**
 * A travessia autorizada entre o número que vem do banco e o `BaseCode` do motor.
 *
 * Fora de 1..5 devolve `null` — NÃO CLASSIFICADO, que cai no padrão da R3. Um código
 * inválido não pode virar o código 1 por conveniência: seria inventar o formato da
 * construção a partir de dado corrompido.
 */
export function toBaseCode(v: number | null | undefined): BaseCode | null {
  const n = Number(v)
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n
  return null
}

export interface TaxRatesInput {
  icmsPct?: number | null
  issPct?: number | null
  /** NOMINAL. A efetivação pela base `P − ICMS − ISS` é do motor (exceção da R5). */
  pisCofinsPct?: number | null
  ipiPct?: number | null
  isPct?: number | null
  ibsPct?: number | null
  cbsPct?: number | null
  /** Fator de redução do IVA DUAL como FRAÇÃO [0, 1]. Só IBS e CBS o sofrem (R4). */
  ivaDualReductionFactor?: number | null
}

export interface BuildTaxBreakdownInput extends SaleContextInput {
  segment: Segment
  rates: TaxRatesInput
  /** Ausente ou `null` por tributo = cai no padrão da R3. Ver `BaseCodeOverrides`. */
  baseCodes?: BaseCodeOverrides | null
}

export interface BuildTaxBreakdownResult {
  /** Pronto para `PricingInput.taxBreakdown`. Vazio quando há erro. */
  taxBreakdown: TaxBreakdownInput | null
  /**
   * Soma NOMINAL dos tributos POR DENTRO, para `PricingInput.taxPct`. O motor o ignora
   * no cálculo e o confere contra o breakdown — divergência ali é erro, não escolha.
   */
  taxPct: number
  errors: string[]
  context: SaleContextResult
}

/**
 * Reconstitui a alíquota NOMINAL de PIS/COFINS a partir da EFETIVADA gravada.
 *
 * >>> POR QUE ISTO EXISTE, e por que NÃO é a inferência que a regra proíbe <<<
 *
 * A exceção 2 da R5 define `efetivada = nominal × (1 − ICMS efetivada − ISS efetivada)`.
 * O motor pede a NOMINAL, porque é ele quem aplica essa exceção — e com `c > 0` o ICMS
 * efetivado deixa de ser o ICMS original, então a efetivada muda junto.
 *
 * O cadastro, porém, NÃO guarda a nominal: `products.pis_cofins_pct` grava o resultado
 * de `9,25% × (1 − ICMS)` (LR) ou `3,65% × (1 − ICMS)` (LP), e o campo é editável à mão.
 * Não existe coluna com a nominal para LER.
 *
 * `regime-e-segmento-determinam-a-construcao.md` distingue os dois casos no seu "caso-limite
 * honesto": inferir é a violação quando a construção TINHA um parâmetro que a decomposição
 * poderia ter lido. Aqui não tinha. O que se faz é INVERTER a equação da própria R5 sobre os
 * dois números que a construção de fato usou — não redescobrir um formato por dedução.
 *
 * E a inversão é EXATA no estado de hoje: com `c = 0` o ICMS efetivado é igual ao original,
 * então `nominal × (1 − ICMS) = efetivada` devolve o mesmo número que já estava lá. É isso
 * que faz o preço de quem não tem tributo por fora continuar idêntico, por construção e não
 * por coincidência.
 *
 * A correção DEFINITIVA é uma coluna com a alíquota nominal, para que o dado seja lido em vez
 * de reconstituído. Fica registrada aqui; não é pré-requisito desta rodada.
 *
 * Denominador ≤ 0 (ICMS + ISS somando 100% ou mais) devolve a própria efetivada: não há
 * nominal a reconstituir, e chutar um número seria pior que não converter.
 */
export function pisCofinsNominalFromEffective(
  effectivePct: number | null | undefined,
  icmsPct: number | null | undefined,
  issPct: number | null | undefined,
): number {
  const eff = Number(effectivePct)
  if (!Number.isFinite(eff) || eff <= 0) return 0
  const base = 1 - (Number(icmsPct) || 0) - (Number(issPct) || 0)
  if (!Number.isFinite(base) || base <= 0) return eff
  return eff / base
}

function positive(v: number | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Monta o `taxBreakdown` do motor LENDO a matriz, célula a célula.
 *
 * Uma alíquota declarada onde a matriz diz INEXISTENTE é ERRO, não zero silencioso: é
 * exatamente o caso que a Parte 0 nomeia, "uma alíquota de ICMS vaza para um orçamento
 * de serviço sem que nada falhe". Aqui falha.
 */
export function buildTaxBreakdown(input: BuildTaxBreakdownInput): BuildTaxBreakdownResult {
  const { segment, rates } = input
  const errors: string[] = []
  const context = resolveSaleContext(input)

  const porDentro = (tax: TaxName, valor: number | null | undefined): number | undefined => {
    const place = placementOfMatrix(segment, tax)
    if (place === 'POR_DENTRO') return positive(valor)
    if (positive(valor) > 0) {
      errors.push(
        `${tax} veio com alíquota ${valor} em ${segment}, onde a matriz diz ${place}. ` +
          'INEXISTENTE não é zero: o tributo não tem linha nesse formato.',
      )
    }
    return undefined
  }

  const porFora = (
    tax: 'IPI' | 'IS' | 'IBS' | 'CBS',
    valor: number | null | undefined,
  ): ExternalTax | undefined => {
    const place = placementOfMatrix(segment, tax)
    const rate = positive(valor)
    if (place !== 'POR_FORA') {
      if (rate > 0) {
        errors.push(
          `${tax} veio com alíquota ${valor} em ${segment}, onde a matriz diz ${place}. ` +
            'INEXISTENTE não é zero: o tributo não tem linha nesse formato.',
        )
      }
      return undefined
    }
    if (rate === 0) return undefined
    // R4 — o fator de redução do IVA DUAL vale SÓ para IBS e CBS. IPI e IS não o sofrem.
    const reductionFactor =
      tax === 'IBS' || tax === 'CBS' ? positive(rates.ivaDualReductionFactor) : 0
    // O override vence o padrão; ausente cai no padrão. IS e IPI recusam 4 e 5, que somariam
    // o próprio tributo e criariam a recursão que a R3 diz não existir.
    const override = input.baseCodes?.[tax.toLowerCase() as keyof BaseCodeOverrides]
    let baseCode: BaseCode = DEFAULT_BASE_CODE[tax]
    if (override != null) {
      if ((tax === 'IS' || tax === 'IPI') && (override === 4 || override === 5)) {
        errors.push(
          `${tax} recebeu código de base ${override}, que não é permitido: os códigos 4 e 5 SOMAM o ${tax} e criariam recursão. Use 1, 2 ou 3.`,
        )
      } else {
        baseCode = override
      }
    }
    return { rate, reductionFactor, baseCode }
  }

  const icmsPct = porDentro('ICMS', rates.icmsPct)
  const issPct = porDentro('ISS', rates.issPct)
  const pisCofinsPct = porDentro('PIS_COFINS', rates.pisCofinsPct) ?? 0

  const ipi = porFora('IPI', rates.ipiPct)
  const is = porFora('IS', rates.isPct)
  const ibs = porFora('IBS', rates.ibsPct)
  const cbs = porFora('CBS', rates.cbsPct)

  if (errors.length > 0) {
    return { taxBreakdown: null, taxPct: 0, errors, context }
  }

  return {
    taxBreakdown: {
      icmsPct,
      issPct,
      pisCofinsPct,
      ipi,
      is,
      ibs,
      cbs,
      ipiIntegraBaseIcms: context.ipiIntegraBaseIcms,
    },
    taxPct: (icmsPct ?? 0) + (issPct ?? 0) + pisCofinsPct,
    errors: [],
    context,
  }
}

// ---------------------------------------------------------------------------
// A travessia que as TELAS usam
// ---------------------------------------------------------------------------

/**
 * ESCOPO da matriz, e a razão de a trava existir.
 *
 * `.claude/rules/cascata-lucro-real.md`, Escopo: "Vale para tenants em Lucro Real, nos três
 * segmentos da cadeia. Fora do Lucro Real a cascata tributária muda e estas regras não se
 * aplicam — a regra do Simples Nacional e MEI é outra, e já está escrita."
 *
 * Lucro Presumido e Simples Híbrido habilitam os campos de IBS/CBS/IS/IPI na tela e NÃO têm
 * regra escrita. Estendê-los aqui seria a tela legislando sobre o motor a partir de um palpite
 * — o mesmo gesto que `razao-longe-da-restricao.md` registra. Ficam no contrato antigo, com o
 * preço que já tinham, até que a regra deles exista.
 */
export const REGIMES_COM_MATRIZ: readonly string[] = ['LUCRO_REAL'] as const

export interface ConstructionTaxRates {
  /** ICMS sobre o total geral, decimal. */
  icmsPct?: number | null
  /** ISS sobre P, decimal. */
  issPct?: number | null
  /**
   * PIS/COFINS como o cadastro o guarda: JÁ com a exclusão do ICMS aplicada. A nominal é
   * reconstituída por `pisCofinsNominalFromEffective` — ver a justificativa lá.
   */
  pisCofinsEffectivePct?: number | null
  ipiPct?: number | null
  isPct?: number | null
  ibsPct?: number | null
  cbsPct?: number | null
  /** Fator de redução do IVA DUAL como FRAÇÃO [0, 1]. */
  ivaDualReductionFactor?: number | null
}

export interface ConstructionTaxInput extends SaleContextInput {
  segment: Segment
  taxableRegime: string | null | undefined
  rates: ConstructionTaxRates
  /** Override manual do código de base, por tributo. Ausente = padrão da R3. */
  baseCodes?: BaseCodeOverrides | null
  /** IRPJ + CSLL + adicional, decimal sobre o total geral (R6). */
  profitTaxPct: number
}

export interface ConstructionTaxResult {
  /**
   * O que entra em `PricingInput`. `null` significa FORA DO ESCOPO DA MATRIZ — o chamador
   * segue pelo contrato antigo, com `taxPct` agregado, e o preço não muda.
   *
   * `null` nunca significa "sem tributo": é ausência de regra, não alíquota zero.
   */
  engineInput: {
    taxBreakdown: TaxBreakdownInput
    taxPct: number
    profitTaxPct: number
  } | null
  errors: string[]
  context: SaleContextResult
}

/**
 * Monta a entrada tributária da CONSTRUÇÃO a partir da matriz e do contexto da venda.
 *
 * É esta função que faz IBS, CBS, IS e IPI entrarem no `c` — e, por ele, na margem de
 * contribuição e no preço inteiro. A R9 é explícita sobre a alternativa: "Somar o IPI por
 * cima do preço sem IPI é erro, não atalho. O IPI altera `c`, que altera a MC, que altera o
 * preço inteiro."
 */
export function resolveConstructionTaxInput(input: ConstructionTaxInput): ConstructionTaxResult {
  const context = resolveSaleContext(input)

  if (!REGIMES_COM_MATRIZ.includes(String(input.taxableRegime))) {
    return { engineInput: null, errors: [], context }
  }

  const r = input.rates
  const icmsForNominal = placementOfMatrix(input.segment, 'ICMS') === 'POR_DENTRO' ? r.icmsPct : 0
  const issForNominal = placementOfMatrix(input.segment, 'ISS') === 'POR_DENTRO' ? r.issPct : 0
  const pisCofinsNominal = pisCofinsNominalFromEffective(
    r.pisCofinsEffectivePct,
    icmsForNominal,
    issForNominal,
  )

  const built = buildTaxBreakdown({
    segment: input.segment,
    buyerType: input.buyerType,
    saleScope: input.saleScope,
    buyerPurpose: input.buyerPurpose,
    rates: {
      icmsPct: r.icmsPct,
      issPct: r.issPct,
      pisCofinsPct: pisCofinsNominal,
      ipiPct: r.ipiPct,
      isPct: r.isPct,
      ibsPct: r.ibsPct,
      cbsPct: r.cbsPct,
      ivaDualReductionFactor: r.ivaDualReductionFactor,
    },
    baseCodes: input.baseCodes,
  })

  if (!built.taxBreakdown) {
    return { engineInput: null, errors: built.errors, context }
  }

  return {
    engineInput: {
      taxBreakdown: built.taxBreakdown,
      taxPct: built.taxPct,
      profitTaxPct: input.profitTaxPct,
    },
    errors: [],
    context,
  }
}
