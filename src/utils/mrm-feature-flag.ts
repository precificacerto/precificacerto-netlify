/**
 * Motor de Reapuração de Margem (MRM) — Feature flag helper
 *
 * Combina flag global (env var) com flag por tenant (tenant_expense_config.margin_reapuration_enabled).
 *
 * Rollout big-bang (D4):
 *   - Sprint 1-5: NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED=false em prod, flag por tenant em dev/staging
 *   - Sprint 6: NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED=true em prod, big-bang
 *
 * Override: tenant_expense_config.margin_reapuration_enabled
 *   - TRUE force-enables nesse tenant
 *   - FALSE force-disables nesse tenant
 *   - NULL (não setado): respeita flag global
 */

export function isMrmEnabledGlobally(): boolean {
  const raw = process.env.NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED
  return raw === 'true' || raw === '1'
}

/**
 * Resolve a feature flag final combinando global e override por tenant.
 *
 * @param tenantOverride valor de tenant_expense_config.margin_reapuration_enabled (NULL = sem override)
 */
export function isMrmEnabled(tenantOverride: boolean | null | undefined): boolean {
  if (tenantOverride === true) return true
  if (tenantOverride === false) return false
  return isMrmEnabledGlobally()
}
