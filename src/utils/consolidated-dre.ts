/**
 * Consolidated DRE — Função pura de DRE consolidada do orçamento/pedido/venda
 * (Sprint S12 do EPIC-RR-V2).
 *
 * Princípio arquitetural (confirmado pelo usuário):
 *   "O orçamento NÃO recalcula percentuais. Ele apenas CONSOLIDA os RRs
 *    individuais já calculados por produto."
 *
 * Esta função NÃO chama o motor. Recebe os resultados dos motores POR ITEM
 * (já calculados em `orcamentos`/`vendas`) e agrega em uma estrutura DRE
 * com 6 seções:
 *
 *   1. RECEITAS — bruta + impostos por fora + líquida
 *   2. CUSTOS — soma de cost_total × quantity por item
 *   3. DESPESAS — 4 buckets (fixas, variáveis, financeiras, administrativas)
 *   4. IMPOSTOS — separados POR DENTRO (ICMS/PIS/COFINS/ISS) e POR FORA
 *      (IPI/ICMS-ST/DIFAL/FCP/IBS/CBS/ISS_RETIDO)
 *   5. RRO — Resultado Residual Operacional consolidado
 *   6. DISTRIBUIÇÃO — Comissão/Lucro/IRPJ/CSLL com R$ + % original + % efetivo
 *
 * Spec: documento "Reforma arquitetural" 20/05/2026.
 */

import type { TaxBreakdown, TaxLine, TaxRegime, TaxType } from '@/types/mrm'
import type { ResidualLine } from './residual-distribution'

/**
 * Item para alimentar a DRE. Aceita o mesmo shape do `ResidualItemInput`
 * (com snapshot `tax_breakdown` OU fallback `motor_new_*`).
 */
export interface DREItemInput {
  unit_price: number
  quantity: number
  /**
   * Custo TOTAL unitário do produto (material + mão de obra produtiva).
   * Vem de `resolveProductCostTotal()` em utils/item-tax-rates.ts.
   */
  cost_total?: number | null
  /**
   * Parcela de MO produtiva inclusa em `cost_total` (R$ unitário).
   * V8.1 (2026-05-24): permite separar visualmente "Custo do produto" (material)
   * de "MOD" (mão de obra) na DRE, ambos vindos do mesmo produto.
   * Vem de `resolveProductLaborTotal()`. Quando 0/ausente, MOD usa tenant pct.
   */
  productive_labor_unit?: number | null
  commission_percent?: number | null
  profit_percent?: number | null
  /** Snapshot fiscal persistido pelo motor RR. Fonte preferencial. */
  tax_breakdown?: TaxBreakdown | null
  /** Fallback runtime — quando snapshot ausente, valores do motor em memória. */
  motor_new_commission?: number
  motor_new_profit?: number
  motor_new_csll?: number
  motor_new_irpj?: number
  /**
   * V17 (2026-05-28): CMV total (R$) calculado pelo motor V17 — via reverse markup
   * quando produto tem cost_total = 0 no banco. Tem prioridade sobre cost_total × qty.
   */
  motor_cp_total?: number | null
  /**
   * V17 (2026-05-28): Breakdown das 4 despesas operacionais POR ITEM (R$),
   * calculadas pelo motor V17 sobre Op Interna (não Receita Líquida).
   * Tem prioridade sobre o cálculo `receita_liquida × pct` quando presente.
   */
  motor_expense_breakdown?: {
    mo_admin: number
    fixa: number
    variavel: number
    financeira: number
  } | null
  /**
   * V17 (2026-05-28): Atividades Terceirizadas POR UNIDADE (R$):
   * frete + seguros + despesas acessórias. Exibido como seção própria na DRE
   * (entre Despesas Operacionais e Impostos).
   */
  terceirizadas_unit?: number | null
  /** Frete unitário (R$) — sub-item visual de Atividades Terceirizadas. */
  freight_unit?: number | null
  /** Seguros unitário (R$) — sub-item visual de Atividades Terceirizadas. */
  insurance_unit?: number | null
  /** Despesas acessórias unitário (R$) — sub-item visual de Atividades Terceirizadas. */
  accessory_unit?: number | null
}

/**
 * Estrutura de despesas operacionais do tenant (4 buckets — R6=b do usuário).
 * Todas em decimal (0.05 = 5%).
 */
export interface DRETenantExpenseStructure {
  fixed_pct: number
  variable_pct: number
  financial_pct: number
  /** Admin labor (preferencial) OR indirect_labor (fallback). */
  administrative_pct: number
  /** MOD — geralmente exibida à parte ou somada em "Custos". */
  mod_pct: number
}

export interface DRETenantTaxRates {
  irpj: number
  csll: number
}

export interface DREInput {
  items: DREItemInput[]
  totalGross: number
  totalNet: number
  regime: TaxRegime | null
  expenseStructure: DRETenantExpenseStructure
  tenantTaxRates: DRETenantTaxRates
}

/** Linha agregada de tributo (soma por tipo). */
export interface DRETaxLine {
  type: TaxType
  amount: number
  /** % efetivo sobre receita líquida (Vₗ × 100). */
  effectivePct: number
}

export interface DRESection {
  receitas: {
    bruta: number
    impostosForaTotal: number
    /** Receita operacional líquida = bruta − impostos por fora. */
    liquida: number
  }
  /**
   * V17 (2026-05-28): Atividades Terceirizadas — seção própria exibida APÓS
   * Despesas Operacionais. Conceitualmente NÃO é despesa operacional do tenant
   * (vem de fornecedores externos: frete, seguros, despesas acessórias).
   * `null` quando nenhum item tem terceirizadas configuradas.
   */
  terceirizadas: {
    frete: number
    seguros: number
    acessorias: number
    total: number
  } | null
  custos: {
    /**
     * Custos do produto (Σ cost_total × quantity).
     * V7+ (2026-05-24): exposto separado para display "Custo do produto" + "MOD" + "Total".
     */
    produto: number
    /**
     * MOD (Mão de Obra Direta) — movida de "Despesas Operacionais" para "Custos"
     * por decisão do Founder em 2026-05-24. Conceitualmente faz parte do custo
     * do produto, não da estrutura operacional do tenant.
     */
    mod: number
    /** Custos líquidos totais = produto + mod. Retrocompat com consumers anteriores. */
    total: number
  }
  despesas: {
    /** Cada bucket = receita_liquida × bucket_pct (proporcional, conforme estrutura tenant). */
    fixas: number
    variaveis: number
    financeiras: number
    administrativas: number
    /**
     * @deprecated 2026-05-24 — MOD migrada para `custos.mod`. Mantido como 0 aqui
     * para retrocompat de tipo (consumers podem ler `despesas.mod` mas valor
     * sempre virá 0).
     */
    mod: number
    total: number
  }
  impostos: {
    porDentro: DRETaxLine[]
    porForaArr: DRETaxLine[]
    porDentroTotal: number
    porForaTotal: number
    total: number
  }
  rro: {
    /** RRO consolidado = soma de new_(commission+profit+csll+irpj) por item. */
    valor: number
    /** % efetivo do RRO sobre Vₗ. */
    effectivePct: number
  }
  distribuicao: {
    commission: ResidualLine
    profit: ResidualLine
    irpj: ResidualLine
    csll: ResidualLine
  }
  /** Bloco MEI/SN — quando true, IRPJ/CSLL ficam ocultos visualmente. */
  hidesProfitTaxes: boolean
  /** Sinaliza dados de motor ausentes (degradação visível). */
  requiresReview: boolean
}

const ZERO_LINE: ResidualLine = { amount: 0, originalPct: 0, effectivePct: 0 }

function isHidden(regime: TaxRegime | null): boolean {
  return regime === 'MEI' || regime === 'SIMPLES_NACIONAL'
}

function weightedOriginalPct(
  items: DREItemInput[],
  totalGross: number,
  field: 'commission_percent' | 'profit_percent',
): number {
  if (totalGross <= 0) return 0
  const weighted = items.reduce((sum, item) => {
    const subtotal = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
    const pct = Number(item[field]) || 0
    return sum + (subtotal * pct) / 100
  }, 0)
  return (weighted / totalGross) * 100
}

function extractItemMonetary(item: DREItemInput): {
  commission: number
  profit: number
  csll: number
  irpj: number
  hasSource: boolean
  taxesInside: TaxLine[]
  taxesOutside: TaxLine[]
} {
  const tb = item.tax_breakdown
  if (tb && Number.isFinite(tb.new_commission)) {
    return {
      commission: Number(tb.new_commission) || 0,
      profit: Number(tb.new_profit) || 0,
      csll: Number(tb.new_csll) || 0,
      irpj: Number(tb.new_irpj) || 0,
      hasSource: true,
      taxesInside: tb.taxes_inside ?? [],
      taxesOutside: tb.taxes_outside ?? [],
    }
  }
  const hasFallback =
    item.motor_new_commission != null ||
    item.motor_new_profit != null ||
    item.motor_new_csll != null ||
    item.motor_new_irpj != null
  return {
    commission: Number(item.motor_new_commission) || 0,
    profit: Number(item.motor_new_profit) || 0,
    csll: Number(item.motor_new_csll) || 0,
    irpj: Number(item.motor_new_irpj) || 0,
    hasSource: hasFallback,
    taxesInside: [],
    taxesOutside: [],
  }
}

/**
 * Agrega TaxLine[] por tax_type, somando amounts. Retorna array DRETaxLine[].
 */
function aggregateTaxLines(taxLines: TaxLine[], totalNet: number): DRETaxLine[] {
  const byType: Record<string, number> = {}
  for (const line of taxLines) {
    byType[line.type] = (byType[line.type] || 0) + (Number(line.amount) || 0)
  }
  return Object.entries(byType).map(([type, amount]) => ({
    type: type as TaxType,
    amount,
    effectivePct: totalNet > 0 ? (amount / totalNet) * 100 : 0,
  }))
}

/**
 * Função pura — consolida a DRE a partir dos items e estrutura do tenant.
 */
export function computeConsolidatedDRE(input: DREInput): DRESection {
  const { items, totalGross, totalNet, regime, expenseStructure, tenantTaxRates } = input
  const hidesProfitTaxes = isHidden(regime)
  const safeNet = totalNet > 0 ? totalNet : 0

  // ───── 1. AGREGAÇÃO BÁSICA ─────
  let totalCost = 0
  let productLaborSum = 0 // V8.1: soma da MO produtiva dos produtos (Σ labor_unit × qty)
  let commissionAmount = 0
  let profitAmount = 0
  let csllAmount = 0
  let irpjAmount = 0
  let itemsWithoutSource = 0
  const allTaxesInside: TaxLine[] = []
  const allTaxesOutside: TaxLine[] = []
  // V17 (2026-05-28): aggregação de overrides do motor V17
  let motorCpAccum = 0
  let motorCpItems = 0
  let motorEbAccum = { mo_admin: 0, fixa: 0, variavel: 0, financeira: 0 }
  let motorEbItems = 0
  // V17: terceirizadas (frete + seguros + acessórias) consolidadas
  let terceirizadasAccum = { frete: 0, seguros: 0, acessorias: 0, total: 0 }
  let hasTerceirizadas = false

  for (const item of items) {
    const qty = Number(item.quantity) || 0
    totalCost += (Number(item.cost_total) || 0) * qty
    productLaborSum += (Number(item.productive_labor_unit) || 0) * qty
    const v = extractItemMonetary(item)
    commissionAmount += v.commission
    profitAmount += v.profit
    csllAmount += v.csll
    irpjAmount += v.irpj
    if (!v.hasSource) itemsWithoutSource += 1
    allTaxesInside.push(...v.taxesInside)
    allTaxesOutside.push(...v.taxesOutside)
    // V17 overrides — só conta items que efetivamente trouxeram override
    if (Number(item.motor_cp_total) > 0) {
      motorCpAccum += Number(item.motor_cp_total)
      motorCpItems += 1
    }
    if (item.motor_expense_breakdown) {
      motorEbAccum.mo_admin += Number(item.motor_expense_breakdown.mo_admin) || 0
      motorEbAccum.fixa += Number(item.motor_expense_breakdown.fixa) || 0
      motorEbAccum.variavel += Number(item.motor_expense_breakdown.variavel) || 0
      motorEbAccum.financeira += Number(item.motor_expense_breakdown.financeira) || 0
      motorEbItems += 1
    }
    // V17: agrega terceirizadas (frete + seguros + acessórias) × qty
    const freteUnit = Number(item.freight_unit) || 0
    const seguroUnit = Number(item.insurance_unit) || 0
    const acessoriaUnit = Number(item.accessory_unit) || 0
    const tercUnit = freteUnit + seguroUnit + acessoriaUnit
    if (tercUnit > 0) {
      terceirizadasAccum.frete += freteUnit * qty
      terceirizadasAccum.seguros += seguroUnit * qty
      terceirizadasAccum.acessorias += acessoriaUnit * qty
      terceirizadasAccum.total += tercUnit * qty
      hasTerceirizadas = true
    } else if (Number(item.terceirizadas_unit) > 0) {
      // Fallback: só total disponível (sem split por sub-categoria)
      const tercTotal = Number(item.terceirizadas_unit) * qty
      terceirizadasAccum.total += tercTotal
      terceirizadasAccum.acessorias += tercTotal // joga em acessorias como bucket genérico
      hasTerceirizadas = true
    }
  }

  const requiresReview = itemsWithoutSource > 0 && itemsWithoutSource === items.length

  // ───── 2. IMPOSTOS AGREGADOS ─────
  const porDentro = aggregateTaxLines(allTaxesInside, safeNet)
  const porForaArr = aggregateTaxLines(allTaxesOutside, safeNet)
  const porDentroTotal = porDentro.reduce((s, l) => s + l.amount, 0)
  const porForaTotal = porForaArr.reduce((s, l) => s + l.amount, 0)

  // ───── 3. RECEITAS ─────
  // Receita líquida = receita pós-desconto − impostos POR FORA (que são
  // cobrados em cima do preço de venda, fora da margem operacional).
  const receitaBruta = safeNet
  const receitaLiquida = Math.max(0, receitaBruta - porForaTotal)

  // ───── 4. DESPESAS (4 BUCKETS) ─────
  // V17 (2026-05-28): quando o motor V17 fornece expense_breakdown (sobre Op Interna),
  // usamos esses valores diretamente (batem com cadastro do produto). Fallback ao
  // cálculo legado (receita_liquida × pcts) quando override ausente.
  const useMotorEb = motorEbItems > 0 && motorEbItems === items.length
  const despFixas = useMotorEb
    ? motorEbAccum.fixa
    : receitaLiquida * (Number(expenseStructure.fixed_pct) || 0)
  const despVariaveis = useMotorEb
    ? motorEbAccum.variavel
    : receitaLiquida * (Number(expenseStructure.variable_pct) || 0)
  const despFinanceiras = useMotorEb
    ? motorEbAccum.financeira
    : receitaLiquida * (Number(expenseStructure.financial_pct) || 0)
  const despAdministrativas = useMotorEb
    ? motorEbAccum.mo_admin
    : receitaLiquida * (Number(expenseStructure.administrative_pct) || 0)
  const despTotal = despFixas + despVariaveis + despFinanceiras + despAdministrativas
  // V8.8: Custo do produto = CMV TOTAL. MOD não separada — está dentro do CMV.
  // V17: prefere motor_cp_total (reverse markup quando produto.cost_total = 0).
  const useMotorCp = motorCpItems > 0 && motorCpItems === items.length
  const custosProduto = useMotorCp ? motorCpAccum : totalCost
  const modAmount = 0
  const custosTotal = custosProduto

  // ───── 5. RRO consolidado ─────
  const rroValor = commissionAmount + profitAmount + (hidesProfitTaxes ? 0 : csllAmount + irpjAmount)
  const rroPct = safeNet > 0 ? (rroValor / safeNet) * 100 : 0

  // ───── 6. DISTRIBUIÇÃO (R4=c: R$ + % original + % efetivo) ─────
  const commOriginalPct = weightedOriginalPct(items, totalGross, 'commission_percent')
  const profitOriginalPct = weightedOriginalPct(items, totalGross, 'profit_percent')
  const irpjOriginalPct = hidesProfitTaxes ? 0 : (Number(tenantTaxRates?.irpj) || 0) * 100
  const csllOriginalPct = hidesProfitTaxes ? 0 : (Number(tenantTaxRates?.csll) || 0) * 100
  const toEff = (amt: number): number => (safeNet > 0 ? (amt / safeNet) * 100 : 0)

  const commission: ResidualLine = {
    amount: commissionAmount,
    originalPct: commOriginalPct,
    effectivePct: toEff(commissionAmount),
  }
  const profit: ResidualLine = {
    amount: profitAmount,
    originalPct: profitOriginalPct,
    effectivePct: toEff(profitAmount),
  }
  const irpj: ResidualLine = hidesProfitTaxes
    ? ZERO_LINE
    : { amount: irpjAmount, originalPct: irpjOriginalPct, effectivePct: toEff(irpjAmount) }
  const csll: ResidualLine = hidesProfitTaxes
    ? ZERO_LINE
    : { amount: csllAmount, originalPct: csllOriginalPct, effectivePct: toEff(csllAmount) }

  return {
    receitas: {
      bruta: receitaBruta,
      impostosForaTotal: porForaTotal,
      liquida: receitaLiquida,
    },
    terceirizadas: hasTerceirizadas ? terceirizadasAccum : null,
    custos: {
      produto: custosProduto,
      mod: modAmount,
      total: custosTotal,
    },
    despesas: {
      fixas: despFixas,
      variaveis: despVariaveis,
      financeiras: despFinanceiras,
      administrativas: despAdministrativas,
      mod: 0, // V7+: MOD migrada para Custos
      total: despTotal,
    },
    impostos: {
      porDentro,
      porForaArr,
      porDentroTotal,
      porForaTotal,
      total: porDentroTotal + porForaTotal,
    },
    rro: { valor: rroValor, effectivePct: rroPct },
    distribuicao: { commission, profit, irpj, csll },
    hidesProfitTaxes,
    requiresReview,
  }
}
