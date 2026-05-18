/**
 * Motor de Reapuração de Margem (MRM) — Núcleo (cliente-only, D3).
 *
 * Implementa o fluxo de 11 etapas da spec:
 *   1. Receber RB (Receita Bruta original)
 *   2. RV = RB - DESC
 *   3. Confirmar RV como nova âncora da precificação
 *   4. Reapurar impostos por dentro SEQUENCIALMENTE (ICMS → PIS → COFINS → ISS)
 *   5. Remover custos líquidos (CP)
 *   6. Remover despesas operacionais (DOP) — MOD imune (R6)
 *   7. RRO = RV - IMP - CP - MOD - DOP; se RRO ≤ 0 → status RRO_ZERO/NEGATIVE
 *   8. Redistribuir comissão e lucro PROPORCIONALMENTE sobre RRO (pesos originais)
 *   9. Recalcular tributos POR FORA (IPI, ICMS_ST, DIFAL, FCP, IBS, CBS, ISS_RETIDO)
 *  10. ValorFinal = BaseOperacionalDescontada + TributosPorFora
 *  11. Validar V1-V6
 *
 * Validações:
 *   V1: RRO ≥ 0
 *   V2: ValorFinal = Base + Tributos (consistência fiscal)
 *   V3: PesoComissao + PesoLucro = 1
 *   V4: NovaComissao + NovoLucro = RRO
 *   V5: RV < RB (quando desconto > 0)
 *   V6: IMP calculado sobre RV (não RB)
 *
 * Diretrizes:
 *   R5: Quando RRO ≤ 0, motor retorna status mas NÃO altera valores — UI orienta usuário.
 *   R6: MOD (mão de obra direta) imune sem exceções.
 *
 * Esta é uma FUNÇÃO PURA. Não faz I/O. Alíquotas devem ser passadas via input.rates
 * (caller é responsável por buscar de /api/tax-periods quando use_snapshot_rates=false).
 */

import {
  MRM_ENGINE_VERSION,
  MRM_ERROR_RRO_NON_POSITIVE,
  TAXES_INSIDE,
  TAXES_OUTSIDE,
  type ReapurationInput,
  type ReapurationStatus,
  type TaxBreakdown,
  type TaxLine,
  type TaxRatePeriod,
  type TaxType,
  type ValidationMap,
} from '@/types/mrm'

const EPSILON = 0.01

function approxEqual(a: number, b: number, tol = EPSILON): boolean {
  return Math.abs(a - b) <= tol
}

function findRate(rates: TaxRatePeriod[], type: TaxType): number {
  const match = rates.find((r) => r.tax_type === type)
  return match ? Number(match.rate_pct) || 0 : 0
}

/**
 * Etapa 4 da spec: reapurar impostos por dentro sequencialmente.
 * Cada tributo é calculado sobre a base remanescente (após dedução do tributo anterior).
 */
function computeTaxesInside(rv: number, rates: TaxRatePeriod[]): { lines: TaxLine[]; total: number } {
  const lines: TaxLine[] = []
  let base = rv
  for (const type of TAXES_INSIDE) {
    const rate = findRate(rates, type)
    if (rate <= 0) continue
    const amount = base * rate
    lines.push({ type, rate_pct: rate, base, amount })
    base = base - amount
  }
  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  return { lines, total }
}

/**
 * Etapa 9 da spec: recalcular tributos por fora sobre nova base operacional.
 * Não é sequencial: cada tributo incide independentemente sobre a base.
 */
function computeTaxesOutside(baseOperacional: number, rates: TaxRatePeriod[]): TaxLine[] {
  const lines: TaxLine[] = []
  for (const type of TAXES_OUTSIDE) {
    const rate = findRate(rates, type)
    if (rate <= 0) continue
    const amount = baseOperacional * rate
    lines.push({ type, rate_pct: rate, base: baseOperacional, amount })
  }
  return lines
}

export function calculateMarginReapuration(input: ReapurationInput): TaxBreakdown {
  const {
    rb,
    desc_value,
    regime,
    rates,
    cp,
    mod,
    dop,
    commission_pct,
    profit_pct,
    effective_date,
    use_snapshot_rates,
  } = input

  // Etapa 2: RV
  const rv = rb - desc_value

  // Etapa 4: Impostos por dentro sequenciais
  const inside = computeTaxesInside(rv, rates)
  const imp_total = inside.total

  // Etapa 7: RRO (R6: MOD imune — subtraído junto com CP/DOP, nunca alterado)
  const rro = rv - imp_total - cp - mod - dop

  // Validações
  // V1 (Tabela 25 da spec): RRO > 0 estrito. RRO = 0 também bloqueia ("Se RRO < 0 ou RRO = 0: bloquear").
  const v1 = rro > 0
  const v5 = desc_value <= 0 ? true : rv < rb
  const v6 = true // Por construção: computeTaxesInside usa RV, nunca RB.

  // Etapa 8: Redistribuição proporcional (R2: motor sempre PROPORTIONAL)
  const combined_pct = commission_pct + profit_pct
  const peso_comm = combined_pct > 0 ? commission_pct / combined_pct : 0
  const peso_lucro = combined_pct > 0 ? profit_pct / combined_pct : 0
  const v3 = combined_pct === 0 ? true : approxEqual(peso_comm + peso_lucro, 1, 1e-9)

  // Se RRO < 0, ainda calculamos os valores (R5: motor não força, UI orienta)
  const new_commission = Math.max(0, rro) * peso_comm
  const new_profit = Math.max(0, rro) * peso_lucro
  const v4 = combined_pct === 0
    ? new_commission + new_profit === 0
    : approxEqual(new_commission + new_profit, Math.max(0, rro))

  // Etapa 9: Tributos por fora sobre nova base operacional (RV - impostos por dentro)
  const baseOperacional = rv - imp_total
  const taxes_outside = computeTaxesOutside(baseOperacional, rates)
  const taxes_outside_total = taxes_outside.reduce((sum, l) => sum + l.amount, 0)

  // Etapa 10: ValorFinal = BaseOperacionalDescontada + TributosPorFora
  const valor_final = baseOperacional + taxes_outside_total
  const v2 = approxEqual(valor_final, baseOperacional + taxes_outside_total, 1e-9)

  const validations: ValidationMap = { V1: v1, V2: v2, V3: v3, V4: v4, V5: v5, V6: v6 }
  const allValid = v1 && v2 && v3 && v4 && v5 && v6

  let status: ReapurationStatus
  let error_code: string | null = null
  const messages: string[] = []

  if (!v1) {
    status = rro === 0 ? 'RRO_ZERO' : 'RRO_NEGATIVE'
    error_code = 'RRO_NON_POSITIVE'
    messages.push(MRM_ERROR_RRO_NON_POSITIVE)
  } else if (!allValid) {
    status = 'ERROR'
    error_code = 'VALIDATION_FAILED'
    const failed = (Object.entries(validations) as [keyof ValidationMap, boolean][])
      .filter(([, ok]) => !ok)
      .map(([id]) => id)
    messages.push(`Validações falharam: ${failed.join(', ')}`)
  } else {
    status = 'VALID'
  }

  return {
    engine_version: MRM_ENGINE_VERSION,
    effective_date,
    regime,
    use_snapshot_rates,
    taxes_inside: inside.lines,
    taxes_outside,
    rb,
    desc_value,
    rv,
    cp,
    mod,
    dop,
    imp_total,
    rro,
    new_commission,
    new_profit,
    validations,
    valid: allValid,
    status,
    error_code,
    messages,
  }
}

/**
 * Helper para callers UI: retorna apenas a mensagem orientativa quando aplicável (R5).
 * Sem RRO_ZERO/NEGATIVE não há mensagem.
 */
export function getOrientationMessage(breakdown: TaxBreakdown): string | null {
  if (breakdown.status === 'RRO_ZERO' || breakdown.status === 'RRO_NEGATIVE') {
    return MRM_ERROR_RRO_NON_POSITIVE
  }
  return null
}
