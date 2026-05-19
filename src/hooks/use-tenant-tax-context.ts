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
      // 1. Carrega config MRM + rro_policy
      const { data: cfgRow } = await supabase
        .from('tenant_expense_config')
        .select('margin_reapuration_enabled, use_snapshot_rates, rro_policy')
        .eq('tenant_id', tenantId as string)
        .maybeSingle()

      const cfg = cfgRow as
        | {
            margin_reapuration_enabled?: boolean | null
            use_snapshot_rates?: boolean | null
            rro_policy?: string | null
          }
        | null
        | undefined

      const tenantOverride = cfg?.margin_reapuration_enabled ?? null
      const enabled = isMrmEnabled(tenantOverride)
      const useSnapshotRates = cfg?.use_snapshot_rates ?? true
      const rroPolicyRaw = cfg?.rro_policy ?? null
      const rro_policy: RroPolicy | null =
        rroPolicyRaw === 'strict' || rroPolicyRaw === 'permissive' ? rroPolicyRaw : null

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
