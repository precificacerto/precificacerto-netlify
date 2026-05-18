import useSWR from 'swr'
import { supabase } from '@/supabase/client'
import { useAuth } from './use-auth.hook'
import { isMrmEnabled } from '@/utils/mrm-feature-flag'

export interface MrmConfig {
  enabled: boolean
  useSnapshotRates: boolean
}

const DEFAULT_CONFIG: MrmConfig = {
  enabled: false,
  useSnapshotRates: true,
}

/**
 * Hook que retorna a configuração MRM do tenant atual.
 *
 * Combina (D2 + D4):
 *   - env NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED (global, big-bang flag)
 *   - tenant_expense_config.margin_reapuration_enabled (override por tenant)
 *   - tenant_expense_config.use_snapshot_rates (snapshot por tenant)
 *
 * Retorna config default (desligado, snapshot=true) se ainda carregando.
 */
export function useMrmConfig(): MrmConfig {
  const { tenantId } = useAuth()

  const { data } = useSWR(
    tenantId ? `mrm-config-${tenantId}` : null,
    async (): Promise<MrmConfig> => {
      const { data: row } = await supabase
        .from('tenant_expense_config')
        .select('margin_reapuration_enabled, use_snapshot_rates')
        .eq('tenant_id', tenantId as string)
        .maybeSingle()

      const tenantOverride = (row as { margin_reapuration_enabled?: boolean | null } | null)?.margin_reapuration_enabled
      const useSnapshotRates = (row as { use_snapshot_rates?: boolean | null } | null)?.use_snapshot_rates ?? true

      return {
        enabled: isMrmEnabled(tenantOverride ?? null),
        useSnapshotRates,
      }
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
    }
  )

  return data ?? DEFAULT_CONFIG
}
