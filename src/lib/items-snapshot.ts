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
  /**
   * O `ReapurationInput` JÁ MONTADO por `buildMotorInput` — fonte única da entrada do motor.
   *
   * Antes esta interface montava a sua PRÓPRIA entrada, e a cobertura de campos era menor que
   * a da rota de runtime. Comparadas campo a campo, faltavam QUATRO:
   *
   *   `rates`        runtime: `mergeItemAndTenantRates(itemTaxRates, tenant)` — alíquotas do ITEM
   *                  gravador: `ctx.rates` cru — só as do TENANT
   *   `csll_pct`     runtime: `resolveItemCsllPct(...)` por item · gravador: a do tenant
   *   `irpj_pct`     runtime: `resolveItemIrpjPct(...)` por item · gravador: a do tenant
   *   `discount_mode` runtime: o modo escolhido · gravador: ausente, caía no default
   *
   * O DEFEITO É USAR O PARÂMETRO ERRADO, NÃO GERAR ZERO. Quando o tenant tem alíquota
   * cadastrada, o snapshot congelava a DO TENANT no lugar da do item. O zero do ORC-0689 é
   * caso particular: Simples e MEI não têm alíquota de tenant, então não sobra nada.
   *
   * Alcance medido: 77 produtos com ICMS próprio e 68 com PIS/COFINS, contra 21 itens com DAS.
   *
   * Consumir o input pronto — em vez de remontá-lo — é o que impede a cobertura de divergir de
   * novo: passa a existir UM construtor, não dois. Ver `.claude/rules/construtor-empobrecido.md`.
   */
  motorInput: ReapurationInput
  /**
   * % de comissão do item (decimal 0.05 = 5%) para a COLUNA `commission_pct`.
   * Não alimenta o motor — lá o valor vai dentro de `motorInput`.
   */
  commission_pct: number
  /** % de lucro do item (decimal) para a COLUNA `profit_pct`. */
  profit_pct: number
  /**
   * TaxBreakdown anterior do item, quando existir (edição). Usado para preservar a
   * imutabilidade do snapshot (AC3) quando `use_snapshot_rates=true`.
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

  // Sem snapshot anterior + flag true → recalcular e congelar. A entrada vem PRONTA do
  // `buildMotorInput`; aqui só se afirma a política do snapshot (`use_snapshot_rates`), que é
  // decisão desta camada e não do construtor.
  const reapurationInput: ReapurationInput = {
    ...item.motorInput,
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
