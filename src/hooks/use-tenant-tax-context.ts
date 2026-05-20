/**
 * useTenantTaxContext — Hook unificado MRM-V3 (Stories S1 + S3 + S5)
 *
 * Carrega TUDO que o `hydrateItemSnapshot` e `decideMrmAction` precisam:
 *   - regime tributário real do tenant (`tenants.tax_regime` via
 *     `tenant_settings.tax_regime`) — S1
 *   - csll_pct / irpj_pct sincronizados com a Formação de Preço — S3
 *     (extraídos de `extractEffectiveTaxComponents` em `tax-sync.ts`)
 *   - rro_policy do tenant — S5
 *   - rates vigentes (opcional) via mrm-rates-loader — S2
 *
 * Atende à Seção 7 do PDF (Sincronização): IRPJ/CSLL no motor RR DEVEM ser
 * os mesmos calculados na Formação de Preço — esta é a única ponte oficial.
 *
 * ADR-006: single source of truth para componentes tributários.
 * ADR-007: precedência csll/irpj = `tax-sync.ts` > `tenant_settings` > defaults.
 */

import useSWR from 'swr'
import { supabase } from '@/supabase/client'
import { useAuth } from './use-auth.hook'
import { isMrmEnabled } from '@/utils/mrm-feature-flag'
import { loadTenantTaxComponents, type TaxComponents } from '@/utils/tax-sync'
import { loadTaxRates } from '@/utils/mrm-rates-loader'
import type { RroPolicy } from '@/utils/mrm-policies'
import type { TaxRatePeriod, TaxRegime } from '@/types/mrm'

export interface TenantTaxContext {
  /** Feature flag MRM resolvida (env + tenant override). */
  enabled: boolean
  /** Snapshot mode (D2). Default TRUE (Q3). */
  useSnapshotRates: boolean
  /** Regime tributário real do tenant. Fallback SIMPLES_NACIONAL se NULL. */
  regime: TaxRegime
  /** % CSLL efetivo (decimal). Sincronizado com Formação de Preço (Seção 7). */
  csll_pct: number
  /** % IRPJ efetivo (decimal). Sincronizado com Formação de Preço (Seção 7). */
  irpj_pct: number
  /**
   * % DOP (Despesas Operacionais) em decimal — Sprint S8 do EPIC-RR-DISPLAY.
   * Soma: fixed_expense_percent + variable_expense_percent + financial_expense_percent +
   *       indirect_labor_percent (ou admin_labor_percent).
   * Usado pelo motor RR como dop_item = item_subtotal × dop_pct.
   */
  dop_pct: number
  /**
   * % MOD (Mão de Obra Direta) em decimal — Sprint S8 do EPIC-RR-DISPLAY.
   * Vem de production_labor_percent. Usado como mod_item = item_subtotal × mod_pct.
   */
  mod_pct: number
  /**
   * Breakdown dos 4 buckets de DOP — Sprint S14 do EPIC-RR-V2.
   * Usado pela DRE consolidada para exibir despesas operacionais separadas
   * (fixas / variáveis / financeiras / administrativas).
   * Todos em decimal. Soma = dop_pct.
   */
  expense_breakdown: {
    fixed_pct: number
    variable_pct: number
    financial_pct: number
    administrative_pct: number
  }
  /** Override de policy (strict/permissive). NULL = defaults ADR-004. */
  rro_policy: RroPolicy | null
  /** Componentes tributários completos (para diagnóstico/UI). */
  components: TaxComponents | null
  /** Alíquotas vigentes para a data corrente (carregadas se loadRates=true). */
  rates: TaxRatePeriod[]
  /** Flag de carregamento. */
  loading: boolean
}

const DEFAULT_CONTEXT: TenantTaxContext = {
  enabled: false,
  useSnapshotRates: true,
  regime: 'SIMPLES_NACIONAL',
  csll_pct: 0,
  irpj_pct: 0,
  dop_pct: 0,
  mod_pct: 0,
  expense_breakdown: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0 },
  rro_policy: null,
  components: null,
  rates: [],
  loading: true,
}

interface HookOptions {
  /** Quando true, também carrega `tax_rates_periods` (S2). Default true. */
  loadRates?: boolean
  /** Data efetiva para rates. Default hoje. */
  effectiveDate?: string
}

/**
 * Mapeia regime string do banco para o tipo TaxRegime do motor.
 * `LUCRO_PRESUMIDO_RET` e `SIMPLES_HIBRIDO` mapeiam para os tipos base
 * do motor (LUCRO_PRESUMIDO e SIMPLES_NACIONAL) para fins de guard Q5,
 * mas os componentes já refletem a alíquota correta vinda do tax-sync.
 */
function mapToMotorRegime(regimeRaw: string | null | undefined): TaxRegime {
  if (!regimeRaw) return 'SIMPLES_NACIONAL'
  if (regimeRaw === 'MEI') return 'MEI'
  if (regimeRaw === 'SIMPLES_NACIONAL') return 'SIMPLES_NACIONAL'
  if (regimeRaw === 'SIMPLES_HIBRIDO') return 'LUCRO_PRESUMIDO'
  if (regimeRaw === 'LUCRO_PRESUMIDO') return 'LUCRO_PRESUMIDO'
  if (regimeRaw === 'LUCRO_PRESUMIDO_RET') return 'LUCRO_PRESUMIDO'
  if (regimeRaw === 'LUCRO_REAL') return 'LUCRO_REAL'
  return 'SIMPLES_NACIONAL'
}

/**
 * Hook reativo (SWR) que retorna todo o contexto MRM necessário às telas
 * comerciais. Pode ser usado em qualquer componente sob `useAuth`.
 *
 * Performance: 4 queries paralelas via `loadTenantTaxComponents` +
 * `tenant_expense_config` + `loadTaxRates`. SWR cacheia por 5min.
 */
export function useTenantTaxContext(options: HookOptions = {}): TenantTaxContext {
  const { tenantId } = useAuth()
  const loadRates = options.loadRates ?? true
  const effectiveDate = options.effectiveDate ?? new Date().toISOString().slice(0, 10)

  const swrKey = tenantId ? `tenant-tax-context-${tenantId}-${effectiveDate}` : null

  const { data, isLoading } = useSWR(
    swrKey,
    async (): Promise<TenantTaxContext> => {
      // 1. Carrega config MRM + rro_policy + percentuais de despesa (S8)
      // tenant_expense_config armazena percentuais em DECIMAL (0.05 = 5%) por
      // convenção do projeto (mesma de commission_pct/profit_pct).
      const { data: cfgRow } = await supabase
        .from('tenant_expense_config')
        .select('margin_reapuration_enabled, use_snapshot_rates, rro_policy, fixed_expense_percent, variable_expense_percent, financial_expense_percent, admin_labor_percent, indirect_labor_percent, production_labor_percent')
        .eq('tenant_id', tenantId as string)
        .maybeSingle()

      const cfg = cfgRow as
        | {
            margin_reapuration_enabled?: boolean | null
            use_snapshot_rates?: boolean | null
            rro_policy?: string | null
            fixed_expense_percent?: number | null
            variable_expense_percent?: number | null
            financial_expense_percent?: number | null
            admin_labor_percent?: number | null
            indirect_labor_percent?: number | null
            production_labor_percent?: number | null
          }
        | null
        | undefined

      const tenantOverride = cfg?.margin_reapuration_enabled ?? null
      const enabled = isMrmEnabled(tenantOverride)
      const useSnapshotRates = cfg?.use_snapshot_rates ?? true
      const rroPolicyRaw = cfg?.rro_policy ?? null
      const rro_policy: RroPolicy | null =
        rroPolicyRaw === 'strict' || rroPolicyRaw === 'permissive' ? rroPolicyRaw : null

      // S8 — DOP = soma das despesas operacionais (estrutura + MOI). Convenção
      // do build-calc-base: structurePct = fixed + variable + financial; MOI
      // (admin/indirect_labor) é tratada à parte mas conceitualmente é DOP.
      const fixedPct = Number(cfg?.fixed_expense_percent) || 0
      const variablePct = Number(cfg?.variable_expense_percent) || 0
      const financialPct = Number(cfg?.financial_expense_percent) || 0
      const moiPct = Number(cfg?.admin_labor_percent) || Number(cfg?.indirect_labor_percent) || 0
      const dop_pct = fixedPct + variablePct + financialPct + moiPct
      const mod_pct = Number(cfg?.production_labor_percent) || 0

      // 2. Carrega componentes tributários (tax-sync) e rates em paralelo
      const [components, rates] = await Promise.all([
        loadTenantTaxComponents(tenantId as string).catch((): TaxComponents | null => null),
        loadRates
          ? loadTaxRates({ date: effectiveDate }).catch((): TaxRatePeriod[] => [])
          : Promise.resolve<TaxRatePeriod[]>([]),
      ])

      const regime = mapToMotorRegime(components?.regime)

      return {
        enabled,
        useSnapshotRates,
        regime,
        csll_pct: components?.csll ?? 0,
        irpj_pct: components?.irpj ?? 0,
        dop_pct,
        mod_pct,
        expense_breakdown: {
          fixed_pct: fixedPct,
          variable_pct: variablePct,
          financial_pct: financialPct,
          administrative_pct: moiPct,
        },
        rro_policy,
        components,
        rates,
        loading: false,
      }
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
    },
  )

  if (!data) {
    return { ...DEFAULT_CONTEXT, loading: isLoading }
  }
  return data
}
