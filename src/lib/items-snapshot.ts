/**
 * Items Snapshot Helper — S1.2 (hidratação real + idempotência)
 *
 * STATUS: S1.2 (hidratação real). S1.4 mantido como contract test backstop.
 *
 * Duas exports coexistem por motivo histórico:
 *
 *   1. `buildItemSnapshot(input: ReapurationInput): TaxBreakdown`
 *        — STUB original (S1.4). Delega 100% ao motor.
 *        — MANTIDO para preservar o contract test
 *          `items-snapshot-contract.test.ts` que compara
 *          `calculateMarginReapuration(x) === buildItemSnapshot(x)` dentro
 *          de R$0,01 (ADR-003: paridade motor↔snapshot).
 *        — Pode ser deprecado em S2.x quando todas as chamadas migrarem
 *          para `hydrateItemSnapshot`.
 *
 *   2. `hydrateItemSnapshot(itemInput, tenantContext): ItemSnapshot | null`
 *        — Helper PURO e IDEMPOTENTE (AC1, AC9 da Story S1.2).
 *        — Retorna o snapshot pronto para persistir nas colunas
 *          `tax_breakdown`, `commission_pct`, `profit_pct` de
 *          `budget_items` / `order_items` / `sale_items`.
 *        — Respeita `tenants.use_snapshot_rates` (Q3 default = true):
 *            - true  → recalcula com o motor e congela snapshot
 *            - false → retorna `tax_breakdown = null` (recálculo dinâmico
 *                      delegado para o motor a cada leitura — modo legacy)
 *        — Quando o item já possui `prev_breakdown` válido e a flag
 *          está em true, PRESERVA o snapshot existente (AC3).
 *        — Quando a flag está em false, sempre re-hidrata (AC4).
 *
 * ADR-003: snapshot é invariante para status ≥ approved.
 * ADR-004: helper é PURE (não fala com Supabase) — caller carrega tenant
 *          context e rates antes de invocar.
 */

import { calculateMarginReapuration } from '@/utils/margin-reapuration'
import { runShadowComparison, type ShadowContext } from '@/utils/mrm-shadow'
import {
  MRM_ENGINE_VERSION,
  type ReapurationInput,
  type TaxBreakdown,
  type TaxRatePeriod,
  type TaxRegime,
} from '@/types/mrm'

/**
 * Input do helper de snapshot. Reaproveita o input do motor para o stub
 * histórico. `hydrateItemSnapshot` usa o tipo `ItemHydrationInput` abaixo.
 */
export type ItemSnapshotInput = ReapurationInput

/**
 * Constrói (ou recalcula) o snapshot fiscal de um item.
 *
 * STUB S1.4: delega ao motor sem modificação. O contract test
 * `items-snapshot-contract.test.ts` garante a paridade
 * `calculateMarginReapuration(x) === buildItemSnapshot(x)` dentro de R$0,01.
 *
 * @deprecated Prefira `hydrateItemSnapshot` para novos call-sites. Esta função
 *             continua existindo apenas como ponto de paridade para o
 *             contract test S1.4.
 */
export function buildItemSnapshot(input: ItemSnapshotInput): TaxBreakdown {
  return calculateMarginReapuration(input)
}

// ─────────────────────────────────────────────────────────────────────────────
// S1.2 — Hidratação real do snapshot (helper puro idempotente)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contexto do tenant necessário para hidratar o snapshot. O caller (page)
 * é responsável por carregar estes dados (via `useMrmConfig`, `useTenant`,
 * `loadTaxRates`, etc.) ANTES de invocar o helper — ADR-004 mantém este
 * módulo puro (sem Supabase).
 */
export interface TenantSnapshotContext {
  /** Regime tributário do tenant. Vem de `tenants.tax_regime`. */
  regime: TaxRegime
  /**
   * Alíquotas vigentes para a data efetiva. Vem de `tax_rates_periods`
   * via `loadTaxRates({ date })`.
   */
  rates: TaxRatePeriod[]
  /**
   * Default de CSLL do tenant (decimal: 0.0207 = 2,07%). Opcional —
   * MEI/SIMPLES_NACIONAL forçam 0 via guard Q5 do motor.
   */
  csll_pct?: number
  /**
   * Default de IRPJ do tenant (decimal: 0.0345 = 3,45%). Opcional —
   * MEI/SIMPLES_NACIONAL forçam 0 via guard Q5 do motor.
   */
  irpj_pct?: number
  /**
   * Flag `tenant_expense_config.use_snapshot_rates`. Q3 default = true.
   * Quando false, `hydrateItemSnapshot` retorna `tax_breakdown = null`
   * indicando que o recálculo é dinâmico (modo legacy).
   */
  use_snapshot_rates: boolean
}

/**
 * Input por-item necessário para hidratar o snapshot.
 */
export interface ItemHydrationInput {
  /** Preço unitário do item. */
  unit_price: number
  /** Quantidade do item. */
  quantity: number
  /** Valor R$ do desconto aplicado ao item (não percentual). Default 0. */
  discount_value?: number
  /** Custo por unidade (CP). Default 0. */
  cp_unit?: number
  /** MOD por unidade — imune a desconto (R6). Default 0. */
  mod_unit?: number
  /** DOP por unidade. Default 0. */
  dop_unit?: number
  /** % comissão do item (decimal 0.05 = 5%). */
  commission_pct: number
  /** % lucro do item (decimal 0.10 = 10%). */
  profit_pct: number
  /** Data efetiva da operação (YYYY-MM-DD). Default = hoje. */
  effective_date?: string
  /**
   * TaxBreakdown anterior do item, quando existir (edição). Usado para
   * preservar imutabilidade do snapshot (AC3) quando use_snapshot_rates=true.
   */
  prev_breakdown?: TaxBreakdown | null
}

/**
 * Snapshot pronto para persistir em `*_items.tax_breakdown` + colunas
 * `commission_pct` / `profit_pct`. Estrutura achatada para facilitar o
 * spread no objeto de insert do Supabase.
 */
export interface ItemSnapshot {
  /** JSONB para coluna `tax_breakdown`. `null` quando use_snapshot_rates=false. */
  tax_breakdown: TaxBreakdown | null
  /** Para coluna `commission_pct` (NUMERIC). */
  commission_pct: number
  /** Para coluna `profit_pct` (NUMERIC). */
  profit_pct: number
}

/**
 * Constrói o snapshot fiscal de um item de forma PURA e IDEMPOTENTE.
 *
 * Idempotência (AC1): chamar 2x com mesmo input retorna deep-equal output.
 * Não tem efeitos colaterais (sem Supabase, sem fetch, sem cache mutável).
 *
 * Política do snapshot (AC3/AC4 + Q3):
 *   - `use_snapshot_rates = true` (default Q3) + `prev_breakdown` válido
 *      → PRESERVA `prev_breakdown` (imutável)
 *   - `use_snapshot_rates = true` + sem `prev_breakdown`
 *      → executa motor e congela snapshot
 *   - `use_snapshot_rates = false`
 *      → `tax_breakdown = null` (recálculo dinâmico, modo legacy)
 *
 * Os campos `commission_pct`/`profit_pct` SEMPRE são preenchidos a partir
 * do input do item (são pesos de redistribuição, não dependem da flag).
 *
 * @example
 * ```ts
 * const snap = hydrateItemSnapshot(
 *   { unit_price: 100, quantity: 2, commission_pct: 0.05, profit_pct: 0.10 },
 *   { regime: 'LUCRO_PRESUMIDO', rates, use_snapshot_rates: true }
 * )
 * await supabase.from('budget_items').insert({ ...itemRow, ...snap })
 * ```
 */
export function hydrateItemSnapshot(
  item: ItemHydrationInput,
  ctx: TenantSnapshotContext,
  shadowContext?: ShadowContext,
): ItemSnapshot {
  const commission_pct = item.commission_pct ?? 0
  const profit_pct = item.profit_pct ?? 0

  // AC4: flag false → recálculo dinâmico, persistimos apenas os pesos.
  if (!ctx.use_snapshot_rates) {
    return {
      tax_breakdown: null,
      commission_pct,
      profit_pct,
    }
  }

  // AC3: snapshot existente válido é PRESERVADO (imutabilidade pós-criação).
  if (item.prev_breakdown && item.prev_breakdown.valid) {
    return {
      tax_breakdown: item.prev_breakdown,
      commission_pct,
      profit_pct,
    }
  }

  // Sem snapshot anterior + flag true → recalcular e congelar.
  const quantity = item.quantity ?? 0
  const unit_price = item.unit_price ?? 0
  const rb = unit_price * quantity
  const desc_value = item.discount_value ?? 0
  const cp = (item.cp_unit ?? 0) * quantity
  const mod = (item.mod_unit ?? 0) * quantity
  const dop = (item.dop_unit ?? 0) * quantity
  const effective_date = item.effective_date ?? new Date().toISOString().slice(0, 10)

  const reapurationInput: ReapurationInput = {
    rb,
    desc_value,
    regime: ctx.regime,
    rates: ctx.rates,
    cp,
    mod,
    dop,
    commission_pct,
    profit_pct,
    csll_pct: ctx.csll_pct,
    irpj_pct: ctx.irpj_pct,
    effective_date,
    use_snapshot_rates: true,
  }

  const tax_breakdown = calculateMarginReapuration(reapurationInput)

  // Story MRM-V2-S3.1: fire-and-forget shadow comparison contra a edge
  // function `calc-tax-engine`. NÃO afeta o output: idempotência preservada
  // (AC1 de S1.2). Quando `mrm.shadow_mode_enabled=false` (default), a
  // chamada é no-op imediato. `void` garante que caller não receba a Promise.
  void runShadowComparison(reapurationInput, tax_breakdown, shadowContext)

  return {
    tax_breakdown,
    commission_pct,
    profit_pct,
  }
}

/**
 * Marker exportado para facilitar identificação do snapshot helper em logs
 * e telemetria. Reflete a versão do motor subjacente.
 */
export const ITEMS_SNAPSHOT_HELPER_VERSION = MRM_ENGINE_VERSION
