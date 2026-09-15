/**
 * budget-accessories.ts — frete, seguro e despesas acessórias NO ORÇAMENTO, com rateio.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` R10 · R11 · R12 · R13, e o relatório
 * "Motor RRO — Lucro Real", seção 5.3. Oráculos numéricos na planilha "Cascata Lucro Real",
 * aba "Orçamento", linhas 46 a 59.
 *
 * >>> POR QUE OS ACRÉSCIMOS SAEM DO PRODUTO <<<
 * R11: "Um frete atende vários produtos." Gravá-lo no cadastro obriga a repeti-lo em cada
 * item e impede que a mesma cotação seja repartida entre eles. A NF-e já resolve isso do
 * jeito certo: `vFrete` existe no NÍVEL DO ITEM, então o layout OBRIGA o rateio (R12).
 *
 * >>> A BASE DO RATEIO É O MONTANTE A CARREGAR, E ELA É FIXADA ANTES DO GROSS-UP <<<
 * O montante a carregar é o total dos produtos precificados MAIS os itens manuais — o que o
 * caminhão leva. Fixá-lo antes do gross-up é o que evita a circularidade: o frete não entra
 * na própria base.
 *
 * >>> CADA PARCELA HERDA AS ALÍQUOTAS DO PRODUTO QUE A RECEBEU <<<
 * "não se inventa alíquota para o frete" (R12). Por isso a entrada de cada destino traz o
 * `ResolvedTaxBreakdown` que a CONSTRUÇÃO daquele item produziu — a decomposição LÊ o que a
 * construção usou, em vez de redescobrir a proporção por divisão
 * (`.claude/rules/regime-e-segmento-determinam-a-construcao.md`).
 *
 * >>> A PARCELA QUE CAI EM ITEM MANUAL NÃO SOFRE GROSS-UP <<<
 * R12 e seção 5.3: é repasse puro, coerente com o item de origem. O item manual entra no
 * orçamento sem tributo; a parcela de frete que lhe cabe sai do mesmo jeito que entrou.
 */

import { resolveExternalOpsCoefficient, type ResolvedTaxBreakdown } from './pricing-engine'
import { buildTaxBreakdown, type BaseCodeOverrides, type Segment, type TaxRatesInput } from './sale-context'

/**
 * O que o rateio precisa saber de um item para a parcela HERDAR as alíquotas dele (R12).
 *
 * É um subconjunto estrutural de `ResolvedTaxBreakdown` — de propósito: a construção do
 * cadastro devolve o objeto inteiro e o entrega direto, e o documento monta só estes quatro
 * campos pela ficha tributária do item (seção 5.1 do relatório). Um só contrato, duas
 * origens, nenhuma conversão no meio.
 */
export interface TargetTaxFicha {
  /** ICMS efetivo sobre P — `icms ÷ (1 − c)`. */
  icmsPctEffective: number
  /** ISS efetivo sobre P — igual ao nominal: NÃO sofre gross-up (exceção da R5). */
  issPctEffective: number
  /** PIS/COFINS efetivo sobre P — `nominal × (1 − ICMS ef − ISS ef)`. */
  pisCofinsPctEffective: number
  /** O `c` da R3, deste item. É INDIVIDUAL do produto, nunca global (seção 5.1). */
  externalOpsCoefficient: number
}

/**
 * R12 — os quatro critérios. Todos funcionam pela MESMA mecânica: o critério fornece uma
 * grandeza por destino, e a parcela é `valor × grandeza ÷ Σ grandezas`. Unificar a mecânica
 * é o que impede que o próximo critério vire um quinto caminho de cálculo.
 */
export type AllocationCriteria = 'VALOR' | 'PESO' | 'VOLUME' | 'MANUAL'

/** Um destino do rateio: um produto precificado ou o bloco de itens manuais. */
export interface AllocationTarget {
  /** Identificador do item no documento. */
  id: string
  /**
   * Total do destino em R$ — para o produto, o TOTAL DO PRODUTO (P ÷ (1 − c)); para o item
   * manual, o valor dele. É a grandeza do critério VALOR e a parcela dele no montante.
   */
  totalValue: number
  /** Grandeza do critério PESO. */
  weight?: number | null
  /** Grandeza do critério VOLUME. */
  volume?: number | null
  /** Grandeza do critério MANUAL — o peso que o usuário informou, em qualquer unidade. */
  manualWeight?: number | null
  /**
   * Item lançado como manual (R1): fica fora do motor e entra só como valor não
   * distribuível. A parcela que lhe cabe é repasse puro.
   */
  isManual: boolean
  /**
   * O que a construção DESTE item resolveu. Ausente em item manual, e ausente NÃO é
   * "alíquota zero": é item que não passou pelo motor.
   */
  resolved?: TargetTaxFicha | ResolvedTaxBreakdown | null
}

export interface AccessoriesInput {
  /** R$ cotados, no documento — não no cadastro do produto (R11). */
  freightValue: number
  insuranceValue: number
  accessoryExpensesValue: number
  criteria: AllocationCriteria
  targets: AllocationTarget[]
}

export interface AllocatedTarget {
  id: string
  isManual: boolean
  /** A fração do montante que coube a este destino, pelo critério escolhido. */
  share: number
  /** R13 — parcela rateada, CONGELADA em R$. Não encolhe com desconto (R18). */
  allocated: number
  /**
   * A parcela do FRETE, separada. O DDL da seção 7.2 guarda frete e "demais acessórias" em
   * colunas distintas porque a NF-e também os distingue (`vFrete` tem campo próprio), e um
   * valor agregado não se desfaz depois. O share é o mesmo dos três: um critério só.
   */
  allocatedFreight: number
  /** A parcela de SEGURO + demais despesas acessórias, separada. */
  allocatedAccessories: number
  /**
   * R13 — margem de contribuição DOS ACRÉSCIMOS: só os tributos por dentro. Repasse não
   * passa por despesa, comissão, RT, lucro, IRPJ nem CSLL.
   * `null` em item manual, onde não há MC a aplicar.
   */
  mcAccessories: number | null
  /** R13 — `parcela ÷ MC dos acréscimos`. Em item manual, igual à parcela. */
  price: number
  /** R13 — `preço ÷ (1 − c)`. Em item manual, igual ao preço: SEM gross-up. */
  total: number
}

export interface AccessoriesResult {
  /** R10 — produtos precificados + itens manuais. Base da cotação do frete. */
  montanteACarregar: number
  /** Soma dos três acréscimos, como cotados. */
  totalOriginal: number
  perTarget: AllocatedTarget[]
  /** Σ das parcelas rateadas. Igual a `totalOriginal` — é o teste 14 do checklist. */
  totalAllocated: number
  /** Σ dos totais com tributo. */
  totalComTributos: number
  errors: string[]
}

const EMPTY = (errors: string[]): AccessoriesResult => ({
  montanteACarregar: 0,
  totalOriginal: 0,
  perTarget: [],
  totalAllocated: 0,
  totalComTributos: 0,
  errors,
})

function num(v: number | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** A grandeza que o critério usa para repartir. Uma função, não quatro caminhos. */
function magnitudeOf(target: AllocationTarget, criteria: AllocationCriteria): number {
  switch (criteria) {
    case 'VALOR': return num(target.totalValue)
    case 'PESO': return num(target.weight)
    case 'VOLUME': return num(target.volume)
    case 'MANUAL': return num(target.manualWeight)
  }
}

/**
 * Rateia frete, seguro e despesas acessórias entre os itens do documento.
 *
 * O montante a carregar é SEMPRE a soma dos totais dos destinos, qualquer que seja o
 * critério: ele é o que o documento vale, não a grandeza do rateio. Trocar um pelo outro
 * faria o "montante a carregar" virar quilos quando o critério fosse PESO.
 */
export function allocateAccessories(input: AccessoriesInput): AccessoriesResult {
  const errors: string[] = []
  const totalOriginal = num(input.freightValue) + num(input.insuranceValue) + num(input.accessoryExpensesValue)

  if (input.targets.length === 0) {
    return EMPTY(totalOriginal > 0 ? ['acréscimos cotados sem nenhum item para receber o rateio'] : [])
  }

  const montanteACarregar = input.targets.reduce((s, t) => s + num(t.totalValue), 0)
  const somaGrandezas = input.targets.reduce((s, t) => s + magnitudeOf(t, input.criteria), 0)

  if (totalOriginal > 0 && somaGrandezas <= 0) {
    // Repartir por uma grandeza que ninguém informou produziria divisão por zero ou, pior,
    // um rateio igualitário inventado. O erro é a resposta honesta.
    errors.push(
      `critério ${input.criteria} escolhido, mas a soma da grandeza nos itens é ${somaGrandezas}. ` +
        'Informe a grandeza nos itens ou troque o critério.',
    )
    return EMPTY(errors)
  }

  const freightOriginal = num(input.freightValue)
  const accessoriesOriginal = num(input.insuranceValue) + num(input.accessoryExpensesValue)

  const perTarget: AllocatedTarget[] = input.targets.map((t) => {
    const share = somaGrandezas > 0 ? magnitudeOf(t, input.criteria) / somaGrandezas : 0
    const allocated = totalOriginal * share
    const allocatedFreight = freightOriginal * share
    const allocatedAccessories = accessoriesOriginal * share

    if (t.isManual) {
      // R12 — repasse puro: sem MC e sem gross-up, coerente com o item de origem.
      const manual: AllocatedTarget = { id: t.id, isManual: true, share, allocated, allocatedFreight, allocatedAccessories, mcAccessories: null, price: allocated, total: allocated }
      return manual
    }

    const r = t.resolved
    if (!r) {
      errors.push(`item ${t.id} não é manual e não trouxe o que a construção resolveu — sem isso a parcela não tem alíquota a herdar.`)
      const semFicha: AllocatedTarget = { id: t.id, isManual: false, share, allocated, allocatedFreight, allocatedAccessories, mcAccessories: null, price: 0, total: 0 }
      return semFicha
    }

    // R13 — só os tributos por dentro. O ISS entra SEM gross-up (exceção da R5), e é por isso
    // que se usa `issPctEffective` e não o nominal dividido por (1 − c): o motor já resolveu
    // essa distinção, e reinferi-la aqui seria a divergência que a Parte 0 proíbe.
    const mcAccessories = 1 - r.icmsPctEffective - r.issPctEffective - r.pisCofinsPctEffective
    if (mcAccessories <= 0) {
      errors.push(`item ${t.id}: margem de contribuição dos acréscimos <= 0 — os tributos por dentro somam 100% ou mais.`)
      return { id: t.id, isManual: false, share, allocated, allocatedFreight, allocatedAccessories, mcAccessories, price: 0, total: 0 }
    }

    const price = allocated / mcAccessories
    const total = price / (1 - r.externalOpsCoefficient)
    return { id: t.id, isManual: false, share, allocated, allocatedFreight, allocatedAccessories, mcAccessories, price, total }
  })

  if (errors.length > 0) return EMPTY(errors)

  return {
    montanteACarregar,
    totalOriginal,
    perTarget,
    totalAllocated: perTarget.reduce((s, p) => s + p.allocated, 0),
    totalComTributos: perTarget.reduce((s, p) => s + p.total, 0),
    errors: [],
  }
}

/**
 * Arredonda as parcelas para centavos SEM perder nem inventar dinheiro.
 *
 * A divisão em precisão cheia fecha exatamente; arredondar cada parcela isoladamente, não —
 * sobra ou falta centavo, e o teste 14 do checklist ("Σ parcelas = valor original") passaria
 * a falhar por um motivo que não é o do rateio.
 *
 * O resíduo vai para a MAIOR parcela, que é onde ele é proporcionalmente menor. A escolha é
 * arbitrária entre destinos empatados, e por isso é determinística: o primeiro dos maiores.
 */
export function roundAllocationsToCents(values: number[], total: number): number[] {
  if (values.length === 0) return []
  const cents = values.map((v) => Math.round(v * 100))
  const alvo = Math.round(total * 100)
  const residuo = alvo - cents.reduce((s, c) => s + c, 0)
  if (residuo !== 0) {
    let maior = 0
    for (let i = 1; i < cents.length; i++) if (cents[i] > cents[maior]) maior = i
    cents[maior] += residuo
  }
  return cents.map((c) => c / 100)
}

// ---------------------------------------------------------------------------
// R11 — a precedência entre o acréscimo do DOCUMENTO e o do CADASTRO
// ---------------------------------------------------------------------------

/** Os acréscimos cotados num documento. `null` por campo = NÃO COTADO, nunca zero. */
export interface DocumentAccessories {
  freightValue?: number | null
  insuranceValue?: number | null
  accessoryExpensesValue?: number | null
  criteria?: AllocationCriteria | null
}

/** Os acréscimos que o CADASTRO do produto carrega, por unidade. */
export interface LegacyItemAccessories {
  id: string
  freightUnit: number
  insuranceUnit: number
  accessoryUnit: number
  quantity: number
}

export type AccessoriesSource = 'DOCUMENTO' | 'CADASTRO'

export interface AccessoriesSourceDecision {
  source: AccessoriesSource
  /** Só em `DOCUMENTO`: os valores cotados e o critério resolvido. */
  document?: { freightValue: number; insuranceValue: number; accessoryExpensesValue: number; criteria: AllocationCriteria }
  reason: string
}

/** O critério padrão da R12 quando o documento não escolheu um. */
export const DEFAULT_ALLOCATION_CRITERIA: AllocationCriteria = 'VALOR'

/**
 * Decide DE ONDE vêm os acréscimos deste documento, sem adivinhação e sem retroatividade.
 *
 * A R11 é explícita sobre os dois lados: os campos do produto "deixam de ser alimentados
 * DAQUI PARA A FRENTE", e os que já têm valor "permanecem como estão, SEM MIGRAÇÃO
 * RETROATIVA". A precedência abaixo é o que faz as duas frases conviverem:
 *
 *   documento com QUALQUER acréscimo cotado → rateio pelo documento; o cadastro é ignorado.
 *   documento sem nenhum                    → cadastro do produto, exatamente como hoje.
 *
 * `null` em todos os três campos significa NÃO COTADO, e é o estado de todo orçamento
 * existente — inclusive enquanto a migração `20260915000004` não estiver aplicada, quando as
 * colunas nem chegam ao objeto. Por isso o documento antigo não muda de preço.
 *
 * Um `0` EXPLÍCITO nos três é diferente de `null` nos três: é "cotei e não há acréscimo",
 * e nesse caso o cadastro do produto TAMBÉM é ignorado — o usuário disse que não há frete, e
 * somar o do cadastro por cima contrariaria o que ele afirmou. É a distinção de
 * `ausente-vs-falso.md` decidindo comportamento, não só exibição.
 */
export function resolveAccessoriesSource(doc: DocumentAccessories | null | undefined): AccessoriesSourceDecision {
  const f = doc?.freightValue
  const i = doc?.insuranceValue
  const a = doc?.accessoryExpensesValue
  const algumCotado = f != null || i != null || a != null

  if (!algumCotado) {
    return { source: 'CADASTRO', reason: 'documento sem acréscimo cotado — o cadastro do produto prevalece (R11, sem retroatividade)' }
  }

  return {
    source: 'DOCUMENTO',
    document: {
      freightValue: num(f),
      insuranceValue: num(i),
      accessoryExpensesValue: num(a),
      criteria: doc?.criteria ?? DEFAULT_ALLOCATION_CRITERIA,
    },
    reason: 'documento cotou acréscimo — o rateio manda e o cadastro do produto é ignorado (R11)',
  }
}

/**
 * Os acréscimos do CADASTRO, somados por item. É o caminho de hoje, preservado intacto para
 * quando o documento não cotou nada.
 */
export function legacyAccessoriesTotal(items: LegacyItemAccessories[]): number {
  return items.reduce(
    (s, i) => s + (num(i.freightUnit) + num(i.insuranceUnit) + num(i.accessoryUnit)) * num(i.quantity),
    0,
  )
}

// ---------------------------------------------------------------------------
// A ficha tributária INDIVIDUAL do item, no documento (relatório, seção 5.1)
// ---------------------------------------------------------------------------

export interface ItemFichaInput {
  segment: Segment
  rates: TaxRatesInput
  baseCodes?: BaseCodeOverrides | null
  /** R9 — o IPI integra a base do ICMS? Default `true`, a linha geral da tabela. */
  ipiIntegraBaseIcms?: boolean
}

export interface ItemFichaResult {
  ficha: TargetTaxFicha | null
  errors: string[]
}

/**
 * Resolve a ficha tributária de UM item do documento.
 *
 * Seção 5.1 do relatório, e a planilha aba "Orçamento" linhas 15 a 20: o coeficiente `c` é
 * POR PRODUTO, não global. Dois itens no mesmo orçamento, com redutores do IVA DUAL
 * diferentes, têm `c` diferente e margem de contribuição diferente — e a parcela de frete de
 * cada um herda o `c` do seu.
 *
 * As três alíquotas efetivas saem das MESMAS fórmulas do motor, e saem daqui em vez de serem
 * recalculadas na tela: a Parte 0 exige que a decomposição LEIA o que a construção usou.
 */
export function resolveItemFicha(input: ItemFichaInput): ItemFichaResult {
  const built = buildTaxBreakdown({
    segment: input.segment,
    buyerType: 'CONSUMIDOR_FINAL',
    saleScope: 'INTRAESTADUAL',
    rates: input.rates,
    baseCodes: input.baseCodes,
  })
  if (!built.taxBreakdown) return { ficha: null, errors: built.errors }

  const tb = built.taxBreakdown
  const c = resolveExternalOpsCoefficient({
    icmsPct: tb.icmsPct ?? 0,
    issPct: tb.issPct ?? 0,
    pisCofinsPct: tb.pisCofinsPct,
    ibs: tb.ibs,
    cbs: tb.cbs,
    is: tb.is,
    ipi: tb.ipi,
    ipiIntegraBaseIcms: input.ipiIntegraBaseIcms,
  })
  if (!c.isValid) return { ficha: null, errors: c.validationErrors }

  const k = 1 - c.externalOpsCoefficient
  const icmsPctEffective = c.icmsPctOverTotalGeral / k
  // Exceção 1 da R5 — o ISS não sofre gross-up.
  const issPctEffective = tb.issPct ?? 0
  // Exceção 2 da R5 — o PIS/COFINS incide sobre `P − ICMS − ISS`.
  const pisCofinsPctEffective = tb.pisCofinsPct * (1 - icmsPctEffective - issPctEffective)

  return {
    ficha: {
      icmsPctEffective,
      issPctEffective,
      pisCofinsPctEffective,
      externalOpsCoefficient: c.externalOpsCoefficient,
    },
    errors: [],
  }
}
