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
 * - 2.3.0: discount_mode na Etapa 9 (rateio do RRO) — V6 (Epic MRM-V6, ADR-009).
 *           Reverte R2 da spec V2: 3 modos (PROPORTIONAL/SELLER/PROFIT) voltam
 *           a estar disponíveis. Campo opcional retrocompatível — snapshots V5
 *           sem discount_mode lidos como PROPORTIONAL. Invariante tributária
 *           bit-exact preservada (Etapas 1-8 invariantes nos 3 modos).
 * - 2.4.0: cascade_trace sequencial + alinhamento Motor RR ↔ DRE Consolidada V8.8
 *           — V9 (Epic MRM-V9, ADR-010). Steps 6-11 propagam base etapa-a-etapa
 *           (base[N] = base[N-1] − abs(amount[N-1])). MOD=0 invariante (V9 D1)
 *           alinhada com V8.8. RRO matemático inalterado — apenas visualização e
 *           contrato de cp (CMV canônico = cost_total + productive_labor_unit)
 *           mudam. Snapshots V5/V6 (2.2.0/2.3.0) preservados via ADR-003.
 * - 2.5.0: cascade granular com sub-itens (children) — V10 (Epic MRM-V10, ADR-011).
 *           CascadeStep ganha `children?: CascadeStep[]` + `peso?: number | null`.
 *           Steps 10/12/13 emitem sub-itens (4 buckets despesa / 4 redistribuição /
 *           N tributos por fora). Fix V10 D1: buildMotorInput remove mod_pct do
 *           dopRate (MO Produtiva já está no CMV). Snapshots V9 (2.4.0) sem
 *           children continuam renderizando — graceful degradation.
 */
export const MRM_ENGINE_VERSION = '2.5.0'

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
  | 'DISCOUNT_MODE_FALLBACK'

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

export type ValidationId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7'

export type ValidationMap = Record<ValidationId, boolean>

/**
 * Perspectiva PIS/COFINS (Story MRM-V5-002 + ADR-008).
 *
 *   - CONSTRUCAO: alíquota agregada usada no markup divisor da precificação
 *     original (módulo de formação de preço). Excel: 7,6775% para regime LR
 *     não-cumulativo com ICMS=17% (= 9,25% × 0,83 via identidade STF).
 *
 *   - APURACAO: alíquota agregada aplicada sobre base reduzida (`Âncora − ICMS − ISS`)
 *     pelo motor RR na Etapa 5. Excel: 9,25% para regime LR não-cumulativo (célula H43).
 *
 * Identidade matemática: `apuracao × (1 − icms_pct) = construcao` quando ISS=0.
 */
export type PisCofinsPerspective = 'CONSTRUCAO' | 'APURACAO'

/**
 * Erro estruturado de invariante fiscal. Story MRM-V5-002 AC6.
 *
 * Lançado pelo `mrm-rates-loader` quando a soma agregada PIS+COFINS não está
 * dentro de nenhuma das faixas conhecidas (7,6775% construção ou 9,25% apuração)
 * para o regime LR. Motor consome via `messages`/`error_code` — não derruba a app.
 */
export class MrmInvariantError extends Error {
  public readonly code: string
  public readonly actual: number
  public readonly expected: string
  public readonly perspective: PisCofinsPerspective | null

  constructor(args: {
    code: string
    actual: number
    expected: string
    perspective: PisCofinsPerspective | null
    message?: string
  }) {
    super(
      args.message ??
        `[MRM Invariant] ${args.code}: actual=${args.actual}, expected=${args.expected}, perspective=${args.perspective ?? 'NONE'}`,
    )
    this.name = 'MrmInvariantError'
    this.code = args.code
    this.actual = args.actual
    this.expected = args.expected
    this.perspective = args.perspective
  }
}

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
  /**
   * V10 (ADR-011): sub-itens que detalham o step pai.
   * Steps complexos (10 Despesas, 12 Redistribuição, 13 Imp. por fora) emitem children.
   * Soma de children.amount ≈ parent.amount (±R$ 0,01). Invariante V10-I1/I2/I4.
   * Snapshots V5/V6/V9 sem este campo renderizam normalmente (retrocompat).
   */
  children?: CascadeStep[]
  /**
   * V10 (ADR-011): peso decimal usado em redistribuição proporcional.
   * Populado apenas em sub-itens do step 12 (Comissão/Lucro/IRPJ/CSLL).
   * Soma dos pesos dos 4 children do step 12 ≈ 1 (quando rateio > 0). Invariante V10-I3.
   */
  peso?: number | null
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

  /**
   * Verificação observacional de RRO > threshold (Story MRM-V5-003 AC3).
   *
   * Campo informacional — NÃO move lógica de bloqueio para o motor (ADR-004 preservado).
   * `mrm-policies.ts` continua sendo a fonte única de decisão sobre bloquear/avisar.
   * UI pode consumir este campo para feedback visual leve sem precisar decodificar `status`.
   *
   * Story MRM-V5-003 AC3 + ADR-004 reforçado.
   */
  rro_threshold_check?: {
    /** Atendeu o threshold? `true` se observed > threshold. */
    passed: boolean
    /** Threshold mínimo para RRO (R$). Default 0 (RRO > 0 estrito). */
    threshold: number
    /** Valor observado de RRO (R$) — espelho de `rro`. */
    observed: number
  } | null

  /**
   * Créditos tributários aplicados ao motor (Story MRM-V5-004 AC3).
   *
   * `recoverable`: somado a `cp` como dedução → `cp_efetivo = cp − recoverable`.
   *   Aplicável apenas em regimes não-cumulativos (LR, LP não-cumulativo).
   *   MEI/SN são cumulativos — créditos forçados a 0 pelo orchestrator.
   *
   * `non_recoverable`: permanece no custo, apenas auditado para relatório fiscal.
   *
   * Fonte: tabela `item_tax_credits` (migration 20260213000000) — lida pelo orchestrator.
   *
   * Story MRM-V5-004 AC1+AC3.
   */
  tax_credits_applied?: {
    recoverable: number
    non_recoverable: number
  } | null

  /**
   * Base canônica dos tributos por fora (R$). Excel cenário canônico ≈ R$ 120.020,65.
   *
   * Fórmula: `ancora_interna − Σ(ICMS_amount + PIS_amount + COFINS_amount)`.
   *
   * Identidade matemática (Excel H62 ≡ Âncora_Interna quando RRO é 100% redistribuído):
   *   H65 (IBS final) = (H62 − H43 − H41) × IBS_rate
   *                  ≡ (Âncora − ICMS − PIS/COFINS) × IBS_rate
   *
   * ISS NÃO entra na base canônica (não aparece na planilha; ICMS e PIS/COFINS
   * são os tributos isolados pela LC 214/2025). Quando há ISS, permanece em
   * `taxes_inside` mas a base por fora é `Âncora − ICMS − PIS/COFINS`.
   *
   * Story MRM-V5-002 AC1+AC2.
   */
  taxes_outside_base?: number | null

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

  /**
   * Modo de desconto solicitado pelo caller (Epic MRM-V6 — ADR-009).
   *
   * Default `PROPORTIONAL` quando ausente — preserva retrocompat V4/V5.
   * Snapshots V5 antigos com `discount_mode='MRM'` são lidos como PROPORTIONAL.
   */
  discount_mode_requested?: DiscountMode
  /**
   * Modo efetivamente aplicado pelo motor (pode divergir do solicitado em fallback).
   *
   * Quando `discount_mode_requested !== discount_mode_applied`, status =
   * `DISCOUNT_MODE_FALLBACK` e `messages[]` contém razão estruturada.
   *
   * Epic MRM-V6 — ADR-009 §5.4 (fallback safety).
   */
  discount_mode_applied?: DiscountMode

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
  /**
   * Créditos tributários aplicáveis ao item (Story MRM-V5-004 AC1+AC2).
   *
   * `recoverable`: tributos recuperáveis (PIS/COFINS não-cumulativos, ICMS LP) que
   *   reduzem `cp` efetivo. Aplicável apenas em LR e LP não-cumulativo.
   * `non_recoverable`: tributos não-recuperáveis (permanecem no custo).
   *
   * Resolvido pelo orchestrator via leitura de `item_tax_credits` (existente).
   * Default `{ recoverable: 0, non_recoverable: 0 }` quando ausente → retrocompat V4.
   * MEI/SN: orchestrator força recoverable=0 (regime cumulativo absorve via DAS).
   *
   * Story MRM-V5-004 AC1+AC4+AC8.
   */
  tax_credits?: {
    recoverable: number
    non_recoverable: number
  }
  /**
   * Modo de desconto que controla o rateio do RRO (Etapa 9 da spec V5).
   *
   * Epic MRM-V6 — ADR-009 (reverte R2 da spec V2). Default `PROPORTIONAL` quando
   * ausente — comportamento V5 idêntico.
   *
   *   - `PROPORTIONAL` (default): peso_comm e peso_lucro baseados em commission_pct
   *     e profit_pct originais (rateio proporcional sobre RRO).
   *   - `SELLER_REDUCTION`: vendedor absorve o desconto. Lucro preservado em valor
   *     absoluto (= profit_pct × RB). Comissão recebe o resíduo.
   *   - `PROFIT_REDUCTION`: empresa absorve o desconto. Comissão preservada em
   *     valor absoluto (= commission_pct × RB). Lucro recebe o resíduo.
   *   - `MRM` (legacy V5): tratado como PROPORTIONAL — sem comportamento próprio.
   *
   * Invariante (ADR-009 §2.2 — bit-exact): ICMS/PIS/COFINS/ISS/IBS/CBS/IPI/CP/MOD/
   * DOP/CSLL/IRPJ idênticos nos 3 modos. APENAS new_commission e new_profit divergem.
   *
   * Fallback safety: quando modo escolhido é inviável (e.g. SELLER com
   * commission_pct=0), motor degrada para PROPORTIONAL e popula
   * `status='DISCOUNT_MODE_FALLBACK'` + `discount_mode_applied='PROPORTIONAL'`.
   */
  discount_mode?: DiscountMode
  effective_date: string
  use_snapshot_rates: boolean
  /**
   * V10 (ADR-011): breakdown opcional dos 4 buckets de DOP para popular
   * `cascade_trace[10].children` (MO Admin, Fixa, Variável, Financeira).
   *
   * Quando ausente, step 10 fica sem children (degradação graceful).
   * Não afeta matemática — `dop` continua sendo a fonte da verdade do total.
   *
   * Soma dos 4 buckets deve aproximar `rv × dop_pct` (validado por invariante V10-I1).
   */
  expense_breakdown?: {
    mo_admin: { rate: number; amount: number }
    fixa: { rate: number; amount: number }
    variavel: { rate: number; amount: number }
    financeira: { rate: number; amount: number }
  }
}

/**
 * Mensagem padrão R5 quando RRO ≤ 0.
 * Exibida na UI sem bloquear o save — apenas orienta o usuário.
 */
export const MRM_ERROR_RRO_NON_POSITIVE =
  'Operação sem margem residual positiva. O desconto solicitado excede o limite máximo operacional permitido. Revise o desconto ou os parâmetros de custo.'
