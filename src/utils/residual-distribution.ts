/**
 * Residual Distribution — Função pura de agregação semântica do RR.
 *
 * Spec consolidada:
 *   - Relatorio_Complementar_Modelo_Correto_RR.pdf (GPT, 20/05/2026)
 *   - relatorio_distribuicao_proporcional.docx (Claude, 20/05/2026)
 *
 * Regra de ouro: percentuais exibidos ao usuário devem representar
 *   "Quanto cada rubrica representa sobre o valor total da venda pós-desconto (Vₗ)".
 *
 *   pₑᵢ = Rᵢ / Vₗ × 100   (proibido qualquer outro denominador)
 *
 * Esta função NÃO faz cálculo tributário — apenas agrega valores já calculados
 * pelo motor RR (`new_commission`, `new_profit`, `new_csll`, `new_irpj` persistidos
 * em `*_items.tax_breakdown`) e converte para a semântica de exibição correta.
 *
 * Compartilhada por:
 *   - Hook `useResidualDistribution` (telas orçamento/pedido/venda)
 *   - PDF de orçamento (`create-budget-pdf.ts`)
 *   - Mensagem WhatsApp (`api/orcamentos/[id]/send-whatsapp.ts`)
 */

import type { TaxBreakdown, TaxRegime } from '@/types/mrm'

/**
 * Linha de exibição de uma rubrica do RR.
 * Todos os percentuais estão em base 100 (não decimal): 3.967 = 3,967%.
 */
export interface ResidualLine {
  /** Valor monetário da rubrica (R$). */
  amount: number
  /**
   * Percentual original ponderado sobre V₀ (valor bruto total).
   * Para comissão/lucro: ponderado a partir do commission_percent/profit_percent
   * de cada item. Para IRPJ/CSLL: alíquota global do tenant (vinda de tax-sync).
   */
  originalPct: number
  /**
   * Percentual efetivo sobre Vₗ (valor pós-desconto) — fórmula normativa Claude:
   *   pₑᵢ = Rᵢ / Vₗ × 100
   */
  effectivePct: number
}

export interface ResidualDistribution {
  commission: ResidualLine
  profit: ResidualLine
  irpj: ResidualLine
  csll: ResidualLine
  /** Total RRO = comissão + lucro + IRPJ + CSLL. */
  total: ResidualLine
  /** True quando V₀ ≠ Vₗ (há desconto aplicado) — controla exibição da seta. */
  hasDiscount: boolean
  /**
   * True quando algum item não possui `tax_breakdown` nem fallback do motor —
   * UI deve exibir aviso discreto "atualizando para nova versão do motor".
   */
  requiresReview: boolean
  /** Regime tributário usado — controla se IRPJ/CSLL aparecem na UI (Q6). */
  regime: TaxRegime | null
  /** True quando regime suprime CSLL/IRPJ (MEI/SIMPLES_NACIONAL). */
  hidesProfitTaxes: boolean
}

/**
 * Item de entrada — campos canônicos para agregação. Tabela de origem
 * (budget_items/order_items/sale_items) é irrelevante.
 */
export interface ResidualItemInput {
  unit_price: number
  quantity: number
  /** % de comissão original do item (0-100). */
  commission_percent?: number | null
  /** % de lucro original do item (0-100). */
  profit_percent?: number | null
  /**
   * Snapshot fiscal persistido. Fonte preferencial de `new_*`.
   * Quando ausente, cai no fallback `motor_*`.
   */
  tax_breakdown?: TaxBreakdown | null
  /**
   * Fallback em runtime quando o snapshot ainda não foi persistido
   * (orçamentos sendo editados, items legacy). Calculado pelo motor
   * em memória — passar `motorResultsByItem[idx]` aqui.
   */
  motor_new_commission?: number
  motor_new_profit?: number
  motor_new_csll?: number
  motor_new_irpj?: number
}

/**
 * Componentes tributários originais do tenant (vindos de `tax-sync`).
 * Usados como `% original` para IRPJ/CSLL (são globais por tenant, não por item).
 */
export interface TenantOriginalTaxRates {
  /** Alíquota efetiva de IRPJ em decimal (0.0345 = 3,45%). */
  irpj: number
  /** Alíquota efetiva de CSLL em decimal (0.0207 = 2,07%). */
  csll: number
}

const ZERO_LINE: ResidualLine = { amount: 0, originalPct: 0, effectivePct: 0 }

function isHiddenRegime(regime: TaxRegime | null): boolean {
  return regime === 'MEI' || regime === 'SIMPLES_NACIONAL'
}

/**
 * Extrai `new_*` de um item priorizando snapshot persistido sobre fallback motor.
 */
function extractItemValues(item: ResidualItemInput): {
  commission: number
  profit: number
  csll: number
  irpj: number
  hasSource: boolean
} {
  const tb = item.tax_breakdown
  if (tb && Number.isFinite(tb.new_commission)) {
    return {
      commission: Number(tb.new_commission) || 0,
      profit: Number(tb.new_profit) || 0,
      csll: Number(tb.new_csll) || 0,
      irpj: Number(tb.new_irpj) || 0,
      hasSource: true,
    }
  }

  // Fallback runtime (motor calculado mas ainda não persistido)
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
  }
}

/**
 * Cálculo do `% original` ponderado para comissão e lucro a partir dos pesos
 * de cada item. Para IRPJ/CSLL o `% original` vem do tenant (tax-sync) e é
 * independente dos itens.
 */
function weightedOriginalPct(
  items: ResidualItemInput[],
  totalGross: number,
  field: 'commission_percent' | 'profit_percent',
): number {
  if (totalGross <= 0) return 0
  const weighted = items.reduce((sum, item) => {
    const itemSubtotal = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
    const pct = Number(item[field]) || 0
    return sum + (itemSubtotal * pct) / 100
  }, 0)
  return (weighted / totalGross) * 100
}

/**
 * Função pura — agrega valores monetários e calcula percentuais semânticos.
 *
 * @param items Items do documento (budget/order/sale).
 * @param totalGross V₀ — valor bruto total antes do desconto.
 * @param totalNet Vₗ — valor líquido pós-desconto. Quando d=0, totalNet === totalGross.
 * @param regime Regime tributário do tenant (para ocultar IRPJ/CSLL em MEI/SN).
 * @param tenantTaxRates Alíquotas originais IRPJ/CSLL do tenant (default: 0).
 *                       Quando regime suprime CSLL/IRPJ, ignora.
 */
export function computeResidualDistribution(
  items: ResidualItemInput[],
  totalGross: number,
  totalNet: number,
  regime: TaxRegime | null,
  tenantTaxRates?: TenantOriginalTaxRates,
): ResidualDistribution {
  const hidesProfitTaxes = isHiddenRegime(regime)
  const hasDiscount = totalGross > totalNet && totalNet > 0

  if (!items || items.length === 0 || totalNet <= 0) {
    return {
      commission: ZERO_LINE,
      profit: ZERO_LINE,
      irpj: ZERO_LINE,
      csll: ZERO_LINE,
      total: ZERO_LINE,
      hasDiscount,
      requiresReview: false,
      regime,
      hidesProfitTaxes,
    }
  }

  // Agregação dos valores monetários
  let commAmount = 0
  let profitAmount = 0
  let csllAmount = 0
  let irpjAmount = 0
  let itemsWithoutSource = 0

  for (const item of items) {
    const v = extractItemValues(item)
    commAmount += v.commission
    profitAmount += v.profit
    csllAmount += v.csll
    irpjAmount += v.irpj
    if (!v.hasSource) itemsWithoutSource += 1
  }

  const requiresReview = itemsWithoutSource > 0 && itemsWithoutSource === items.length

  // % originais
  const commOriginalPct = weightedOriginalPct(items, totalGross, 'commission_percent')
  const profitOriginalPct = weightedOriginalPct(items, totalGross, 'profit_percent')
  const irpjOriginalPct = hidesProfitTaxes ? 0 : (Number(tenantTaxRates?.irpj) || 0) * 100
  const csllOriginalPct = hidesProfitTaxes ? 0 : (Number(tenantTaxRates?.csll) || 0) * 100

  // % efetivos sobre Vₗ (fórmula normativa Claude/GPT)
  const toEffective = (amount: number): number => (amount / totalNet) * 100

  const commission: ResidualLine = {
    amount: commAmount,
    originalPct: commOriginalPct,
    effectivePct: toEffective(commAmount),
  }
  const profit: ResidualLine = {
    amount: profitAmount,
    originalPct: profitOriginalPct,
    effectivePct: toEffective(profitAmount),
  }
  const irpj: ResidualLine = {
    amount: hidesProfitTaxes ? 0 : irpjAmount,
    originalPct: irpjOriginalPct,
    effectivePct: hidesProfitTaxes ? 0 : toEffective(irpjAmount),
  }
  const csll: ResidualLine = {
    amount: hidesProfitTaxes ? 0 : csllAmount,
    originalPct: csllOriginalPct,
    effectivePct: hidesProfitTaxes ? 0 : toEffective(csllAmount),
  }

  const totalAmount = commission.amount + profit.amount + irpj.amount + csll.amount
  const totalOriginalPct =
    commission.originalPct + profit.originalPct + irpj.originalPct + csll.originalPct

  const total: ResidualLine = {
    amount: totalAmount,
    originalPct: totalOriginalPct,
    effectivePct: toEffective(totalAmount),
  }

  return {
    commission,
    profit,
    irpj,
    csll,
    total,
    hasDiscount,
    requiresReview,
    regime,
    hidesProfitTaxes,
  }
}

/**
 * Helper de formatação para uso em PDF/WhatsApp (texto puro sem JSX).
 * Retorna a string canônica conforme Q3=B:
 *   "5,000% original → 3,967% sobre o total c/ desconto"
 *
 * Quando `hasDiscount=false`, retorna apenas "5,000%" (sem seta).
 */
export function formatResidualLine(line: ResidualLine, hasDiscount: boolean): string {
  const fmt = (n: number): string =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  if (!hasDiscount) return `${fmt(line.originalPct)}%`
  return `${fmt(line.originalPct)}% original → ${fmt(line.effectivePct)}% sobre o total c/ desconto`
}
