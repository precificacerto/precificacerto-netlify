/**
 * Motor de Reapuração de Margem (MRM) — Orchestrator
 *
 * Camada entre a UI e o motor puro. Responsabilidades:
 *   1. Carregar alíquotas vigentes via mrm-rates-loader (quando necessário)
 *   2. Aplicar regra de snapshot (D2): se existir tax_breakdown válido com
 *      use_snapshot_rates=true, reaproveitar alíquotas dele; caso contrário,
 *      buscar do servidor com data efetiva.
 *   3. Resolver `peso_op_interna` via markup divisor da config do produto
 *      (Story MRM-V5-001 AC9) — ADR-004 preserva motor puro.
 *   4. Chamar o motor puro `calculateMarginReapuration`
 *   5. Retornar TaxBreakdown pronto para persistir em *_items.tax_breakdown
 *
 * Snapshot decision tree (D2):
 *   - prev_breakdown EXISTS && prev.use_snapshot_rates === true
 *       → reusa prev.taxes_inside + prev.taxes_outside como rates (alíquota
 *         preservada na criação do orçamento)
 *   - prev_breakdown NULL OR prev.use_snapshot_rates === false
 *       → busca alíquotas atuais via /api/tax-periods
 *
 * Peso Op Interna resolution (Story MRM-V5-001 AC9):
 *   Ordem de prioridade (3 fontes):
 *     1. Input explícito (`input.peso_op_interna`) — sobrescreve qualquer outra fonte
 *     2. Snapshot histórico (`options.prev_breakdown.peso_op_interna`) — ADR-003 imutabilidade
 *     3. Cálculo via markup divisor (`options.product_config`) — Excel I21
 *     4. Default conservador `1` — motor degrada para comportamento V4
 *
 * Edge function calc-tax-engine: NÃO consumida aqui (D3 consolidado no cliente).
 * A edge continua servindo precificação inicial (products/items), fora do escopo MRM.
 */

import { calculateMarginReapuration } from './margin-reapuration'
import { loadTaxRates } from './mrm-rates-loader'
import { runShadowComparison, type ShadowContext } from './mrm-shadow'
import {
  mergeItemAndTenantRates,
  resolveItemCsllPct,
  resolveItemIrpjPct,
  type ItemTaxRates,
} from './item-tax-rates'
import type { DiscountMode, ReapurationInput, TaxBreakdown, TaxRatePeriod, TaxRegime, TaxType } from '@/types/mrm'

/**
 * Configuração de precificação original do produto/serviço — usada pelo orchestrator
 * para calcular `peso_op_interna` via markup divisor (Excel cenário canônico H21+H26).
 *
 * Não é input do motor puro (ADR-004). Apenas o orchestrator consome essa estrutura
 * para derivar o peso e injetá-lo como `ReapurationInput.peso_op_interna`.
 *
 * Story MRM-V5-001 AC9.
 */
export interface ProductPricingConfig {
  /** Custo unitário do produto (R$). Excel H4 = 53.509,92. */
  cost: number
  /**
   * Soma dos percentuais internos (decimal). Inclui:
   *   - Componentes distribuíveis: comissão + lucro + IRPJ + CSLL
   *   - Despesas: MO administrativa + despesa fixa + variável + financeira
   *   - Impostos por dentro: ICMS + ISS + PIS/COFINS
   * Excel C19 = SUM(C6:C17) = 0,697775 no cenário canônico.
   */
  internal_percentuals_sum: number
  /**
   * Soma das alíquotas tributárias por dentro (decimal): ICMS + ISS + PIS/COFINS.
   * Usada para calcular base reduzida dos tributos por fora (= Op_Interna − ICMS − PIS/COFINS).
   */
  internal_tax_rates_sum: number
  /**
   * Soma das alíquotas tributárias por fora (decimal): IBS + CBS + IPI + ICMS-ST + DIFAL + FCP.
   * Excel C23 + C24 = 1% + 8,75% = 0,0975 no cenário canônico.
   */
  external_tax_rates_sum: number
}

export interface OrchestrateOptions {
  /** Quando true, reaproveita alíquotas do prev_breakdown (snapshot mode D2). */
  use_snapshot_rates: boolean
  /** TaxBreakdown anterior do item, quando existir (edição). */
  prev_breakdown?: TaxBreakdown | null
  /** Data efetiva para buscar alíquotas (default: hoje). */
  effective_date?: string
  /**
   * Story MRM-V2-S3.1: contexto opcional para shadow-mode (tenant_id,
   * document_id, document_type). Quando ausente, shadow ainda roda mas
   * sem rastreabilidade — útil para chamadas internas/testes.
   */
  shadow_context?: ShadowContext
  /**
   * Story MRM-V5-001 AC9: configuração de precificação original do produto.
   * Quando presente e snapshot ausente, orchestrator calcula `peso_op_interna`
   * via markup divisor. Quando ausente, motor usa default 1.
   */
  product_config?: ProductPricingConfig
  /**
   * Story MRM-V5-004 AC4: snapshot de créditos tributários do item
   * (lidos da tabela `item_tax_credits` pelo caller). Quando presente,
   * orchestrator agrega em recoverable/non_recoverable conforme regime.
   * Quando ausente, motor usa { 0, 0 } (retrocompat V4/V5-003).
   */
  item_tax_credits?: ItemTaxCreditSnapshot[]
}

export type OrchestrateInput = Omit<ReapurationInput, 'rates' | 'effective_date' | 'use_snapshot_rates'> & {
  options: OrchestrateOptions
}

/**
 * Calcula `peso_op_interna` via markup divisor da configuração do produto.
 *
 * Fórmula (Excel cenário canônico):
 *   Op_Interna_Original = custo / (1 − Σ percentuais_internos)   ← Excel H21
 *   base_externa         = Op_Interna × (1 − ICMS − PIS/COFINS)
 *   Op_Externa_Original  = base_externa × Σ alíquotas_externas    ← Excel H26
 *   peso_op_interna      = Op_Interna / (Op_Interna + Op_Externa) ← Excel I21
 *
 * Retorna 1 (default conservador) quando configuração é inválida ou degenerada.
 *
 * Story MRM-V5-001 AC2.
 */
export function calculatePesoOpInternaFromMarkup(config: ProductPricingConfig): number {
  const { cost, internal_percentuals_sum, internal_tax_rates_sum, external_tax_rates_sum } = config

  // Guard 1: configuração tributária inválida (Σ% internos ≥ 1 → denominador não-positivo)
  const denom = 1 - internal_percentuals_sum
  if (denom <= 0 || cost <= 0) return 1

  // Op Interna original (markup divisor) — Excel H21
  const op_interna_original = cost / denom

  // Op Externa original — Excel H26 (tributos por fora sobre base reduzida)
  const base_externa = op_interna_original * (1 - internal_tax_rates_sum)
  const op_externa_original = base_externa > 0 ? base_externa * external_tax_rates_sum : 0

  // Peso = Op_Interna / (Op_Interna + Op_Externa) — Excel I21
  const total = op_interna_original + op_externa_original
  if (total <= 0) return 1

  const peso = op_interna_original / total
  // Clamp defensivo [0, 1] para garantir invariante
  return Math.max(0, Math.min(1, peso))
}

/**
 * Resolve `peso_op_interna` para o motor RR conforme 3 fontes de prioridade.
 *
 * Ordem (Story MRM-V5-001 AC9):
 *   1. Input explícito (`peso_op_interna_input`) — sobrescreve outras fontes
 *   2. Snapshot histórico (`prev_breakdown.peso_op_interna`) — ADR-003 imutabilidade
 *   3. Markup divisor da configuração do produto — Excel I21
 *   4. Default conservador `1` — motor degrada para comportamento V4
 *
 * Esta função vive no orchestrator (não no motor puro) porque envolve cálculo
 * derivado de dados externos ao input do motor — ADR-004.
 */
/**
 * Snapshot de crédito tributário do item — lido de `item_tax_credits`.
 *
 * Estrutura mínima que o orchestrator consome do registro DB:
 * - is_active=true para considerar
 * - tax_type identifica o tributo (PIS/COFINS/ICMS) — apenas tributos recuperáveis em LR/LP
 * - credit_value: valor R$ do crédito
 * - source: 'AUTO' (calculado) ou 'MANUAL' (digitado pelo tenant)
 *
 * Story MRM-V5-004 AC4. Tabela existente: migration 20260213000000:232-244.
 */
export interface ItemTaxCreditSnapshot {
  tax_type: 'PIS' | 'COFINS' | 'ICMS' | 'IPI'
  is_active: boolean
  credit_value: number
  source?: string
}

/**
 * Agrega créditos tributários em recoverable/non_recoverable conforme regime.
 *
 * Story MRM-V5-004 AC1+AC4:
 * - LR / LP não-cumulativo: PIS, COFINS, ICMS são recoverable (não-cumulatividade)
 * - LP cumulativo: nenhum recoverable (PIS/COFINS embutidos no preço)
 * - MEI / SN: nenhum recoverable (DAS absorve)
 *
 * Apenas créditos com `is_active=true` são considerados. IPI sempre non_recoverable
 * por simplicidade (raro em serviços).
 */
export function aggregateItemTaxCredits(
  credits: ItemTaxCreditSnapshot[],
  regime: 'MEI' | 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL',
): { recoverable: number; non_recoverable: number } {
  // MEI/SN: regime cumulativo absorvido pelo DAS — zero créditos
  if (regime === 'MEI' || regime === 'SIMPLES_NACIONAL') {
    return { recoverable: 0, non_recoverable: 0 }
  }

  let recoverable = 0
  let non_recoverable = 0

  for (const credit of credits) {
    if (!credit.is_active || credit.credit_value <= 0) continue

    // LR + LP não-cumulativo: PIS/COFINS/ICMS recuperáveis
    // (assumindo LP=cumulativo por padrão; tenant pode override via política)
    const isRecoverable =
      regime === 'LUCRO_REAL' &&
      (credit.tax_type === 'PIS' || credit.tax_type === 'COFINS' || credit.tax_type === 'ICMS')

    if (isRecoverable) {
      recoverable += credit.credit_value
    } else {
      non_recoverable += credit.credit_value
    }
  }

  return { recoverable, non_recoverable }
}

// ─────────────────────────────────────────────────────────────────────────────
// V9 (Epic MRM-V9, ADR-010) — buildMotorInput helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estrutura mínima de um item de orçamento/venda para alimentar o motor RR.
 *
 * Compatível com `BudgetItemRow` (orcamentos/index.tsx:100) e estruturas
 * similares em vendas/pedidos. Campos opcionais permitem chamada parcial.
 */
export interface MotorInputItem {
  unit_price: number
  quantity: number
  /** Custo base (sem MO produtiva quando V8.8 está cumprido pelo cadastro). */
  cost_total?: number | null
  /** V8.1 — parcela de MO produtiva inclusa no custo unitário (R$/un). */
  productive_labor_unit?: number | null
  /**
   * V13 (2026-05-25): Snapshot Despesa Financeira POR UNIDADE do produto (R$).
   * Origem: pricing_calculations.val_financial_expense / yield_quantity.
   * Quando presente, motor usa SUM(unit × qty) como bucket financeira em vez
   * de RV × tenant.financial_pct. Não afeta MO Admin/Fixa/Variável (continuam pct).
   */
  financial_expense_unit?: number | null
  /**
   * V14 (2026-05-25): snapshot COMPLETO dos 4 buckets de despesa do produto.
   * Quando presente, motor usa val × qty para CADA bucket (ignora tenant.expense_breakdown).
   * Origem: pricing_calculations.val_* + pct_* via `resolveProductExpenseBreakdown`.
   * Tem PRECEDÊNCIA sobre `financial_expense_unit` (V13).
   */
  expense_breakdown_unit?: ProductExpenseBreakdown | null
  commission_percent?: number | null
  profit_percent?: number | null
  item_tax_rates?: ItemTaxRates | null
}

/**
 * Contexto mínimo do tenant para o motor (subset de `useTenantTaxContext`).
 */
export interface MotorInputTenantCtx {
  regime: TaxRegime
  rates: TaxRatePeriod[]
  /** Mantido por retrocompat — V9 D1 migra para DOP bucket. */
  mod_pct?: number | null
  dop_pct?: number | null
  csll_pct?: number | null
  irpj_pct?: number | null
  useSnapshotRates?: boolean
  /**
   * V10 (ADR-011): breakdown opcional dos 4 buckets de DOP em decimal (0..1).
   * Quando presente, helper popula `cascade_trace[10].children`.
   * Origem: `useTenantTaxContext.expense_breakdown`.
   */
  expense_breakdown?: {
    fixed_pct?: number | null
    variable_pct?: number | null
    financial_pct?: number | null
    administrative_pct?: number | null
  } | null
}

export interface BuildMotorInputArgs {
  item: MotorInputItem
  tenantCtx: MotorInputTenantCtx
  /** Desconto global em base 100 (0..100). */
  globalDiscountPercent: number
  discountMode: DiscountMode
  effectiveDate?: string
}

/**
 * Helper V9: monta `ReapurationInput` alinhado com a DRE Consolidada V8.8.
 *
 * Regras V9 (ADR-010):
 *   - **V9 D1 (MOD=0):** motor recebe `mod=0` sempre. tenant.mod_pct é migrada
 *     para o bucket DOP (consistente com `consolidated-dre.ts:278-282` que
 *     classifica MOD-administrativa como "Administrativas").
 *   - **V9 D2 (CMV canônico):** `cp = (cost_total + productive_labor_unit) × qty`
 *     — alinha com `consolidated-dre.ts:284-287` (V8.8) que considera CMV TOTAL
 *     já incluindo MO produtiva.
 *
 * Invariantes (validadas por testes em `__tests__/build-motor-input.test.ts`):
 *   V9-I4: `result.mod === 0` sempre.
 *   V9-I5: `result.cp === (cost_total + productive_labor_unit) × qty`.
 *
 * Story MRM-V9-001 AC1-AC6.
 */
export function buildMotorInput(args: BuildMotorInputArgs): ReapurationInput {
  const qty = Number(args.item.quantity) || 0
  const itemBase = (Number(args.item.unit_price) || 0) * qty
  const discountFactor = Math.max(0, Math.min(1, args.globalDiscountPercent / 100))
  const rvItem = itemBase - itemBase * discountFactor

  // V9 D2: CMV canônico unitário = cost_total + productive_labor_unit (V8.8 V8.1)
  const cmvUnit =
    (Number(args.item.cost_total) || 0) + (Number(args.item.productive_labor_unit) || 0)
  const cpItem = cmvUnit * qty

  // V9 D1: MOD sempre 0 no motor.
  // V10 D1: dopRate usa APENAS dop_pct (sem mod_pct — MO Produtiva já no CMV).
  // V13: bucket Despesa Financeira via snapshot do produto.
  // V14 (2026-05-25): snapshot COMPLETO dos 4 buckets via `expense_breakdown_unit`.
  //   PRECEDÊNCIA:
  //     1. V14 — `item.expense_breakdown_unit` (snapshot completo do produto) → ignora tenant
  //     2. V13 — `item.financial_expense_unit` (só financeira) + tenant para outros 3
  //     3. V10 — tenant.expense_breakdown × RV (fallback)
  const modItem = 0
  const ebTenant = args.tenantCtx.expense_breakdown ?? null
  const moAdminPct = Number(ebTenant?.administrative_pct) || 0
  const fixaPct = Number(ebTenant?.fixed_pct) || 0
  const variavelPct = Number(ebTenant?.variable_pct) || 0
  const financeiraPctTenant = Number(ebTenant?.financial_pct) || 0
  const financeiraUnit = Number(args.item.financial_expense_unit) || 0
  const financeiraOverride = args.item.financial_expense_unit != null && financeiraUnit > 0
  const breakdownSnapshot = args.item.expense_breakdown_unit ?? null

  // Calcula os 4 buckets conforme precedência V14 → V13 → V10
  let moAdminAmount: number
  let fixaAmount: number
  let variavelAmount: number
  let financeiraAmount: number
  let moAdminRate: number
  let fixaRate: number
  let variavelRate: number
  let financeiraRate: number
  let dopItem: number

  if (breakdownSnapshot) {
    // V14: snapshot completo do produto (val × qty + rate snapshot)
    moAdminAmount = breakdownSnapshot.mo_admin.amount_unit * qty
    fixaAmount = breakdownSnapshot.fixa.amount_unit * qty
    variavelAmount = breakdownSnapshot.variavel.amount_unit * qty
    financeiraAmount = breakdownSnapshot.financeira.amount_unit * qty
    moAdminRate = breakdownSnapshot.mo_admin.rate
    fixaRate = breakdownSnapshot.fixa.rate
    variavelRate = breakdownSnapshot.variavel.rate
    financeiraRate = breakdownSnapshot.financeira.rate
    dopItem = moAdminAmount + fixaAmount + variavelAmount + financeiraAmount
  } else if (ebTenant) {
    // V13 / V10: tenant breakdown + override Financeira V13 quando presente
    moAdminAmount = rvItem * moAdminPct
    fixaAmount = rvItem * fixaPct
    variavelAmount = rvItem * variavelPct
    financeiraAmount = financeiraOverride ? financeiraUnit * qty : rvItem * financeiraPctTenant
    moAdminRate = moAdminPct
    fixaRate = fixaPct
    variavelRate = variavelPct
    financeiraRate = financeiraOverride ? 0 : financeiraPctTenant
    dopItem = moAdminAmount + fixaAmount + variavelAmount + financeiraAmount
  } else {
    // V10 fallback agregado — sem breakdown detalhado
    const dopRate = Number(args.tenantCtx.dop_pct) || 0
    const dopBase = rvItem * dopRate
    if (financeiraOverride) {
      const financeiraTenantImplicita = rvItem * financeiraPctTenant
      dopItem = dopBase - financeiraTenantImplicita + financeiraUnit * qty
    } else {
      dopItem = dopBase
    }
    moAdminAmount = 0
    fixaAmount = 0
    variavelAmount = 0
    financeiraAmount = 0
    moAdminRate = 0
    fixaRate = 0
    variavelRate = 0
    financeiraRate = 0
  }

  const itemTaxRates = args.item.item_tax_rates ?? null

  // V10 (ADR-011) + V13 + V14: popula expense_breakdown para children do step 10.
  // V14: quando há snapshot do produto, usa rate+amount do snapshot.
  // V13: financeira usa snapshot override quando presente.
  // V10: fallback tenant breakdown × RV.
  const expense_breakdown = breakdownSnapshot || ebTenant
    ? {
        mo_admin: { rate: moAdminRate, amount: moAdminAmount },
        fixa: { rate: fixaRate, amount: fixaAmount },
        variavel: { rate: variavelRate, amount: variavelAmount },
        financeira: { rate: financeiraRate, amount: financeiraAmount },
      }
    : undefined

  return {
    rb: itemBase,
    desc_value: itemBase * discountFactor,
    regime: args.tenantCtx.regime,
    rates: mergeItemAndTenantRates(itemTaxRates, args.tenantCtx.rates),
    cp: cpItem,
    mod: modItem,
    dop: dopItem,
    commission_pct: (Number(args.item.commission_percent) || 0) / 100,
    profit_pct: (Number(args.item.profit_percent) || 0) / 100,
    csll_pct: resolveItemCsllPct(itemTaxRates, Number(args.tenantCtx.csll_pct) || 0),
    irpj_pct: resolveItemIrpjPct(itemTaxRates, Number(args.tenantCtx.irpj_pct) || 0),
    discount_mode: args.discountMode,
    effective_date: args.effectiveDate ?? new Date().toISOString().slice(0, 10),
    use_snapshot_rates: args.tenantCtx.useSnapshotRates ?? false,
    expense_breakdown,
  }
}

export function resolvePesoOpInterna(args: {
  peso_op_interna_input?: number
  prev_breakdown?: TaxBreakdown | null
  product_config?: ProductPricingConfig
}): number {
  // Fonte 1: input explícito (e.g. caller pré-calculado)
  if (args.peso_op_interna_input != null && Number.isFinite(args.peso_op_interna_input)) {
    return Math.max(0, Math.min(1, args.peso_op_interna_input))
  }
  // Fonte 2: snapshot histórico (ADR-003)
  const snapshot_peso = args.prev_breakdown?.peso_op_interna
  if (snapshot_peso != null && Number.isFinite(snapshot_peso)) {
    return Math.max(0, Math.min(1, snapshot_peso))
  }
  // Fonte 3: cálculo via markup divisor
  if (args.product_config) {
    return calculatePesoOpInternaFromMarkup(args.product_config)
  }
  // Fonte 4: default conservador (motor V4 equivalente)
  return 1
}

/**
 * Extrai alíquotas de um TaxBreakdown anterior (snapshot reuse).
 * Reconstitui apenas o necessário: tax_type + rate_pct.
 * tenant_id e demais campos são placeholders — o motor só lê rate_pct e tax_type.
 */
function snapshotToRates(prev: TaxBreakdown): TaxRatePeriod[] {
  const allLines = [...prev.taxes_inside, ...prev.taxes_outside]
  return allLines.map((line): TaxRatePeriod => ({
    id: `snapshot-${line.type}`,
    tenant_id: 'snapshot',
    tax_type: line.type as TaxType,
    origin_state: null,
    dest_state: null,
    rate_pct: line.rate_pct,
    valid_from: prev.effective_date,
    valid_until: null,
    notes: 'reconstructed from prev snapshot',
  }))
}

export async function orchestrateReapuration(input: OrchestrateInput): Promise<TaxBreakdown> {
  const { options, ...rest } = input
  const effective_date = options.effective_date ?? new Date().toISOString().slice(0, 10)

  let rates: TaxRatePeriod[]
  if (options.use_snapshot_rates && options.prev_breakdown && options.prev_breakdown.valid) {
    rates = snapshotToRates(options.prev_breakdown)
  } else {
    rates = await loadTaxRates({ date: effective_date })
  }

  // Story MRM-V5-001 AC9: resolver peso_op_interna via 3 fontes de prioridade
  const peso_op_interna = resolvePesoOpInterna({
    peso_op_interna_input: rest.peso_op_interna,
    prev_breakdown: options.prev_breakdown,
    product_config: options.product_config,
  })

  // Story MRM-V5-004 AC4: agregar créditos tributários conforme regime
  const tax_credits = options.item_tax_credits
    ? aggregateItemTaxCredits(options.item_tax_credits, rest.regime)
    : rest.tax_credits

  const motorInput: ReapurationInput = {
    ...rest,
    peso_op_interna,
    tax_credits,
    rates,
    effective_date,
    use_snapshot_rates: options.use_snapshot_rates,
  }
  const result = calculateMarginReapuration(motorInput)

  // Story MRM-V2-S3.1: fire-and-forget shadow comparison (ADR-001).
  void runShadowComparison(motorInput, result, options.shadow_context)

  return result
}

/**
 * Versão síncrona quando o caller já tem as alíquotas (e.g. SWR pré-carregou).
 * Útil em React render-pure paths para evitar Suspense.
 */
export function orchestrateReapurationSync(
  input: OrchestrateInput & { rates: TaxRatePeriod[] }
): TaxBreakdown {
  const { options, rates, ...rest } = input
  const effective_date = options.effective_date ?? new Date().toISOString().slice(0, 10)

  const finalRates =
    options.use_snapshot_rates && options.prev_breakdown && options.prev_breakdown.valid
      ? snapshotToRates(options.prev_breakdown)
      : rates

  // Story MRM-V5-001 AC9: resolver peso_op_interna via 3 fontes de prioridade
  const peso_op_interna = resolvePesoOpInterna({
    peso_op_interna_input: rest.peso_op_interna,
    prev_breakdown: options.prev_breakdown,
    product_config: options.product_config,
  })

  // Story MRM-V5-004 AC4: agregar créditos tributários conforme regime
  const tax_credits = options.item_tax_credits
    ? aggregateItemTaxCredits(options.item_tax_credits, rest.regime)
    : rest.tax_credits

  const motorInput: ReapurationInput = {
    ...rest,
    peso_op_interna,
    tax_credits,
    rates: finalRates,
    effective_date,
    use_snapshot_rates: options.use_snapshot_rates,
  }
  const result = calculateMarginReapuration(motorInput)

  // Story MRM-V2-S3.1: fire-and-forget shadow comparison (ADR-001).
  void runShadowComparison(motorInput, result, options.shadow_context)

  return result
}
