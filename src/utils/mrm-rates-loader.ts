/**
 * Motor de Reapuração de Margem (MRM) — Rates Loader
 *
 * Cliente para GET /api/tax-periods. Centraliza fetch de alíquotas vigentes
 * com cache em memória por (tenant, date, key) para evitar múltiplos roundtrips
 * em mesma sessão de edição.
 *
 * Snapshot (D2):
 *   - use_snapshot_rates = TRUE  → o caller persiste as alíquotas retornadas em
 *                                  tax_breakdown e NUNCA mais consulta este loader
 *                                  para o mesmo registro.
 *   - use_snapshot_rates = FALSE → o caller consulta este loader a cada edição.
 */

import type { TaxRatePeriod, TaxType } from '@/types/mrm'

export interface LoaderQuery {
  date?: string
  tax_type?: TaxType
  origin_state?: string
  dest_state?: string
}

interface CacheEntry {
  data: TaxRatePeriod[]
  expires_at: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

function cacheKey(query: LoaderQuery): string {
  return [
    query.date ?? 'today',
    query.tax_type ?? '*',
    query.origin_state ?? '*',
    query.dest_state ?? '*',
  ].join('|')
}

function buildQueryString(query: LoaderQuery): string {
  const params = new URLSearchParams()
  if (query.date) params.set('date', query.date)
  if (query.tax_type) params.set('tax_type', query.tax_type)
  if (query.origin_state) params.set('origin_state', query.origin_state.toUpperCase())
  if (query.dest_state) params.set('dest_state', query.dest_state.toUpperCase())
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Busca alíquotas vigentes para o tenant autenticado.
 * Em caso de erro, retorna [] (motor degrada graciosamente sem impostos).
 */
export async function loadTaxRates(query: LoaderQuery = {}): Promise<TaxRatePeriod[]> {
  const key = cacheKey(query)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expires_at > now) {
    return cached.data
  }

  try {
    const response = await fetch(`/api/tax-periods${buildQueryString(query)}`, {
      method: 'GET',
      credentials: 'include',
    })

    if (!response.ok) {
      return []
    }

    const json = (await response.json()) as { rates?: TaxRatePeriod[] }
    const rates = Array.isArray(json.rates) ? json.rates : []
    cache.set(key, { data: rates, expires_at: now + CACHE_TTL_MS })
    return rates
  } catch {
    return []
  }
}

/**
 * Invalida cache local — chamar quando admin atualiza alíquotas em tax_rates_periods.
 */
export function invalidateRatesCache(): void {
  cache.clear()
}
