/**
 * Motor de Reapuração de Margem (MRM) — Tipos compartilhados
 *
 * Spec: Motor_Reapuracao_Margem_Precifica_Certo.docx (v1.0, 18/05/2026)
 * Diretrizes oficiais (R1-R6):
 *   R1: Reforma tributária gradual (ICMS/PIS/COFINS/ISS → IBS/CBS em 2027)
 *   R2: Modos PROFIT_REDUCTION e SELLER_REDUCTION descontinuados
 *   R3: Reapuração para TODOS os regimes (MEI, SN, LP, LR)
 *   R4: Roda em orçamento, pedido E venda
 *   R5: Se RRO ≤ 0, orienta usuário (não força valor)
 *   R6: MOD imune SEM EXCEÇÕES
 */

/**
 * Engine version (MAJOR.MINOR.PATCH — semver).
 *
 * Bump MINOR quando adiciona campos opcionais retrocompatíveis no schema.
 * Bump MAJOR somente quando remove ou altera campos existentes de forma quebradora.
 *
 * - 2.0.0: rateio 2 componentes (commission + profit) — V1 spec
 * - 2.1.0: rateio 4 componentes (commission + profit + CSLL + IRPJ) — V2 spec item 13
 *           Adiciona new_csll/new_irpj em TaxBreakdown (campos novos, callers
 *           legados continuam funcionando). Story MRM-V2-S1.1, ADR-002.
 */
export const MRM_ENGINE_VERSION = '2.1.0'

export type TaxType =
  | 'ICMS'
  | 'PIS'
  | 'COFINS'
  | 'ISS'
  | 'IPI'
  | 'ICMS_ST'
  | 'DIFAL'
  | 'FCP'
  | 'IBS'
  | 'CBS'
  | 'ISS_RETIDO'

export const TAXES_INSIDE: readonly TaxType[] = ['ICMS', 'PIS', 'COFINS', 'ISS'] as const
export const TAXES_OUTSIDE: readonly TaxType[] = [
  'IPI',
  'ICMS_ST',
  'DIFAL',
  'FCP',
  'IBS',
  'CBS',
  'ISS_RETIDO',
] as const

export type TaxRegime = 'MEI' | 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL'

export type ReapurationStatus =
  | 'PENDING'
  | 'VALID'
  | 'RRO_ZERO'
  | 'RRO_NEGATIVE'
  | 'ERROR'

export type DiscountMode = 'PROPORTIONAL' | 'PROFIT_REDUCTION' | 'SELLER_REDUCTION' | 'MRM'

export interface TaxRatePeriod {
  id: string
  tenant_id: string
  tax_type: TaxType
  origin_state: string | null
  dest_state: string | null
  rate_pct: number
  valid_from: string
  valid_until: string | null
  notes: string | null
}

export interface TaxLine {
  type: TaxType
  rate_pct: number
  base: number
  amount: number
}

export type ValidationId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6'

export type ValidationMap = Record<ValidationId, boolean>

/**
 * Schema persistido em budget_items.tax_breakdown / sale_items.tax_breakdown / order_items.tax_breakdown.
 * Imutável quando use_snapshot_rates = TRUE (D2). Recalculado a cada edição quando FALSE.
 */
export interface TaxBreakdown {
  engine_version: string
  effective_date: string
  regime: TaxRegime
  use_snapshot_rates: boolean

  taxes_inside: TaxLine[]
  taxes_outside: TaxLine[]

  rb: number
  desc_value: number
  rv: number
  cp: number
  mod: number
  dop: number
  imp_total: number
  rro: number

  new_commission: number
  new_profit: number
  /**
   * Valor de CSLL após redistribuição proporcional sobre RRO.
   * Sempre 0 para regimes MEI e SIMPLES_NACIONAL (guard Q5 — Story S1.1).
   */
  new_csll: number
  /**
   * Valor de IRPJ após redistribuição proporcional sobre RRO.
   * Sempre 0 para regimes MEI e SIMPLES_NACIONAL (guard Q5 — Story S1.1).
   */
  new_irpj: number

  validations: ValidationMap
  valid: boolean
  status: ReapurationStatus
  error_code: string | null
  messages: string[]
}

/**
 * Input do motor (por item). O motor é uma função pura sobre este input.
 */
export interface ReapurationInput {
  rb: number
  desc_value: number
  regime: TaxRegime
  rates: TaxRatePeriod[]
  cp: number
  mod: number
  dop: number
  commission_pct: number
  profit_pct: number
  /**
   * Alíquota de CSLL (decimal: 0.0207 = 2,07%).
   * Origem: `tenant.profile.tax_rates` ou snapshot persistido em `*_items.tax_breakdown`.
   * Hidratação é responsabilidade da camada chamadora (Story S1.2), não do motor.
   * Default 0 quando ausente. Forçado a 0 para regimes MEI/SIMPLES_NACIONAL (guard Q5).
   */
  csll_pct?: number
  /**
   * Alíquota de IRPJ (decimal: 0.0345 = 3,45%).
   * Origem: `tenant.profile.tax_rates` ou snapshot persistido em `*_items.tax_breakdown`.
   * Hidratação é responsabilidade da camada chamadora (Story S1.2), não do motor.
   * Default 0 quando ausente. Forçado a 0 para regimes MEI/SIMPLES_NACIONAL (guard Q5).
   */
  irpj_pct?: number
  effective_date: string
  use_snapshot_rates: boolean
}

/**
 * Mensagem padrão R5 quando RRO ≤ 0.
 * Exibida na UI sem bloquear o save — apenas orienta o usuário.
 */
export const MRM_ERROR_RRO_NON_POSITIVE =
  'Operação sem margem residual positiva. O desconto solicitado excede o limite máximo operacional permitido. Revise o desconto ou os parâmetros de custo.'
