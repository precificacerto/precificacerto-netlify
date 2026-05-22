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
 * - 2.2.0: peso_op_interna / ancora_interna / cascade_trace 13 etapas — V5 (Epic MRM-V5).
 *           Adiciona campos opcionais retrocompatíveis no TaxBreakdown e
 *           ReapurationInput. Snapshots V4 (engine_version='2.1.0') continuam
 *           válidos (ADR-003 imutabilidade). Story MRM-V5-001, ADR-002.
 */
export const MRM_ENGINE_VERSION = '2.2.0'

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
 * Memória cascata — 13 etapas obrigatórias conforme PDF Motor RR Seção 10.
 *
 * Ordem fixa (não pode ser alterada por step_id):
 *   1.  Receita Bruta
 *   2.  Desconto aplicado
 *   3.  Receita pós-desconto (RV)
 *   4.  Aplicação do Peso Operação Interna
 *   5.  Âncora Interna
 *   6.  Reapuração ICMS
 *   7.  Reapuração ISS
 *   8.  Reapuração PIS/COFINS
 *   9.  Redução de custos (CP)
 *   10. Redução de despesas (MOD + DOP)
 *   11. Resultado Residual Operacional (RRO)
 *   12. Redistribuição proporcional (Comissão + Lucro + CSLL + IRPJ)
 *   13. Reapuração tributos por fora (recomposição final)
 *
 * `base`, `rate` e `amount` são opcionais por step — alguns são puramente
 * descritivos (e.g. step 4 é a aplicação de um multiplicador). `value` representa
 * o "valor agregado" da etapa (RB, RV, Âncora, RRO, etc).
 *
 * Spec: Story MRM-V5-001 AC4; PDF Motor RR Seção 10.
 */
export interface CascadeStep {
  /** Posição fixa na cascata (1..13). */
  step: number
  /** Rótulo em português-BR exibido na UI. */
  label: string
  /** Base de cálculo, quando aplicável (e.g. RV para ICMS). `null` em steps puramente agregadores. */
  base: number | null
  /** Alíquota decimal aplicada, quando aplicável (e.g. 0.17 para ICMS=17%). `null` quando não há alíquota. */
  rate: number | null
  /** Valor numérico do step (R$). Para impostos é o `amount`; para RB/RV/Âncora/RRO é o "valor agregado". */
  amount: number
  /** Fórmula descritiva (e.g. "RV × peso_op_interna", "(Âncora − ICMS) × PIS/COFINS%"). */
  formula: string
  /** Origem do dado (e.g. "INPUT", "ETAPA_2", "PRODUTO", "SNAPSHOT"). */
  source: string
}

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
  /**
   * Receita mínima abaixo da qual a operação fica sem margem residual positiva.
   * Fórmula (Seção 4.5 do Relatório Consolidado RR):
   *   limite_minimo = (CP + MOD + DOP) / (1 − ICMS% − PIS% − COFINS% − ISS%)
   *
   * Usado pela UI para orientar o usuário (R5) sobre o desconto máximo permitido.
   * `null` quando a soma das alíquotas internas ≥ 1 (configuração tributária inválida).
   */
  limite_minimo: number | null

  /**
   * Peso da Operação Interna (decimal 0..1) — propriedade da PRECIFICAÇÃO ORIGINAL do produto.
   *
   * NÃO é cálculo runtime sobre cp/mod/dop. Vem do markup divisor da configuração
   * do produto/serviço (Excel célula I21 = 0,931585 no cenário canônico).
   *
   * Fórmula (origem):
   *   Op_Interna_Original = custo / (1 − Σ percentuais_internos)
   *   Op_Externa_Original = Σ (IBS, CBS, IPI, ICMS-ST, DIFAL, FCP)
   *                          aplicado sobre (Op_Interna − ICMS − PIS/COFINS)
   *   peso_op_interna     = Op_Interna_Original / (Op_Interna + Op_Externa)
   *
   * Resolvido pelo orchestrator (`mrm-orchestrator.ts`), nunca pelo motor puro
   * (ADR-004). Snapshot persistido aqui é imutável (ADR-003).
   *
   * Default conservador no motor: 1 (toda operação é interna, comportamento V4).
   * Story MRM-V5-001 AC2; ADR-004.
   */
  peso_op_interna?: number | null
  /**
   * Peso da Operação Externa (decimal 0..1) — espelho informacional.
   * Sempre = 1 − peso_op_interna. Excel célula I26 = 0,068415 no cenário canônico.
   *
   * Story MRM-V5-001 AC1.
   */
  peso_op_externa?: number | null
  /**
   * Âncora Interna (R$) — base operacional reapurada PÓS-desconto.
   *
   * Fórmula: `ancora_interna = rv × peso_op_interna` (Excel célula H36).
   *
   * Distinto de `Op_Interna_Original` (Excel H21), que é PRÉ-desconto.
   * No cenário canônico (RB=190.055,94, desc=10%, peso=0,931585):
   *   Op_Interna_Original = R$ 177.053,25 (H21, PRÉ desc)
   *   Âncora Interna      = R$ 159.342,38 (H36, PÓS desc — este campo)
   *
   * Story MRM-V5-001 AC3.
   */
  ancora_interna?: number | null
  /**
   * Memória cascata — 13 etapas conforme PDF Motor RR Seção 10.
   *
   * Materialização dos valores que o motor já computou — não recalcula.
   * Exibido em expansível dentro da DRE consolidada (sem nova aba — STORY-005).
   *
   * Story MRM-V5-001 AC4.
   */
  cascade_trace?: CascadeStep[] | null

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
  /**
   * Peso da Operação Interna (decimal 0..1) — propriedade do produto.
   *
   * Resolvido pelo orchestrator (3 fontes de prioridade: snapshot histórico →
   * markup divisor da config do produto → default 1). Motor puro nunca calcula.
   *
   * Default ausente (`undefined`) → motor usa 1 (comportamento V4 — sem op externa).
   * Story MRM-V5-001 AC9; ADR-004.
   */
  peso_op_interna?: number
  effective_date: string
  use_snapshot_rates: boolean
}

/**
 * Mensagem padrão R5 quando RRO ≤ 0.
 * Exibida na UI sem bloquear o save — apenas orienta o usuário.
 */
export const MRM_ERROR_RRO_NON_POSITIVE =
  'Operação sem margem residual positiva. O desconto solicitado excede o limite máximo operacional permitido. Revise o desconto ou os parâmetros de custo.'
