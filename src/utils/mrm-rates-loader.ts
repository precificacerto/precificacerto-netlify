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

import {
  MrmInvariantError,
  type PisCofinsPerspective,
  type TaxRatePeriod,
  type TaxRegime,
  type TaxType,
} from '@/types/mrm'

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
    const rawRates = Array.isArray(json.rates) ? json.rates : []
    // BUG FIX (2026-05-23, Hyago): `tax_rates_periods.rate_pct` foi cadastrado
    // historicamente em FORMATO PERCENTUAL (17 = 17%) em vez de decimal (0.17).
    // Motor RR espera DECIMAL (0..1). Heurística defensiva (mesmo padrão de
    // `tax-sync.ts:169`): valor < 1 já é decimal; valor >= 1 é porcentagem → /100.
    // Garante retrocompat com qualquer estado do banco sem migration obrigatória.
    //
    // EXCEÇÃO IBS/CBS (FIX 2026-06-10, paridade com `item-tax-rates.ts`): as alíquotas
    // de transição de IBS (0,1%) e CBS (0,9%) vivem ABAIXO de 1% — zona onde a heurística
    // dual falha e mantém 0.9 como 0.9, inflando ×100 na Etapa 17 (CBS = base × 90%). Para
    // esses dois tributos, normalizar é SEMPRE dividir por 100 (são gravados em percentual).
    const rates: TaxRatePeriod[] = rawRates.map((r) => {
      const raw = Number(r.rate_pct) || 0
      const alwaysPercent = r.tax_type === 'IBS' || r.tax_type === 'CBS'
      const normalized = raw <= 0 ? 0 : alwaysPercent ? raw / 100 : raw < 1 ? raw : raw / 100
      return { ...r, rate_pct: normalized }
    })
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

// ──────────────────────────────────────────────────────────────────────────────
// Story MRM-V5-002 AC4 + ADR-008 — Validação de invariante PIS/COFINS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Alíquotas canônicas PIS/COFINS por regime tributário (decimal).
 *
 * Construção (markup divisor — módulo de formação de preço):
 *   - LR: ≈ 7,6775% (= 9,25% × 0,83, identidade STF para ICMS=17%)
 *   - LP: ≈ 3,028% (= 3,65% × 0,83)
 *
 * Apuração (motor RR Etapa 5 — sobre `Âncora − ICMS`):
 *   - LR: ≈ 9,25%   (PIS 1,65% + COFINS 7,6%)  — não-cumulativo
 *   - LP: ≈ 3,65%   (PIS 0,65% + COFINS 3%)    — cumulativo
 *
 * SN e MEI usam regime cumulativo absorvido pelo DAS — sem invariante a verificar.
 *
 * Story MRM-V5-002 AC4 + ADR-008.
 */
const PIS_COFINS_EXPECTED: Record<
  Exclude<TaxRegime, 'MEI' | 'SIMPLES_NACIONAL'>,
  Record<PisCofinsPerspective, number>
> = {
  LUCRO_REAL: {
    CONSTRUCAO: 0.076775,
    APURACAO: 0.0925,
  },
  LUCRO_PRESUMIDO: {
    CONSTRUCAO: 0.030295, // 3,65% × 0,83 ≈ 3,0295%
    APURACAO: 0.0365,
  },
}

/** Tolerância padrão (1e-4 = 0,01pp) para invariante PIS/COFINS. */
const PIS_COFINS_TOLERANCE = 1e-4

/**
 * Valida a invariante PIS/COFINS (Story MRM-V5-002 AC4 + ADR-008).
 *
 * Verifica que a soma agregada `PIS + COFINS` está dentro da faixa esperada
 * para a perspectiva e regime informados. Lança `MrmInvariantError` quando
 * inválido. Usa tolerância de 1e-4 (0,01pp) para acomodar arredondamentos.
 *
 * Para SN/MEI retorna sem validar (regime cumulativo absorvido pelo DAS).
 *
 * Story MRM-V5-002 AC4-AC6.
 *
 * @throws {MrmInvariantError} quando soma fora da faixa esperada
 */
export function validatePisCofinsInvariant(
  rates: TaxRatePeriod[],
  perspective: PisCofinsPerspective,
  regime: TaxRegime,
): void {
  // SN/MEI: regime cumulativo absorvido pelo DAS — sem invariante
  if (regime === 'SIMPLES_NACIONAL' || regime === 'MEI') {
    return
  }

  const pisRate = rates.find((r) => r.tax_type === 'PIS')?.rate_pct ?? 0
  const cofinsRate = rates.find((r) => r.tax_type === 'COFINS')?.rate_pct ?? 0
  const aggregate = pisRate + cofinsRate

  // Quando ambos são 0 (não-tributado) — não há invariante a validar
  if (aggregate === 0) return

  const expected = PIS_COFINS_EXPECTED[regime][perspective]
  const diff = Math.abs(aggregate - expected)

  if (diff > PIS_COFINS_TOLERANCE) {
    const expectedPct = (expected * 100).toFixed(4) + '%'
    const actualPct = (aggregate * 100).toFixed(4) + '%'
    throw new MrmInvariantError({
      code: 'PIS_COFINS_OUT_OF_RANGE',
      actual: aggregate,
      expected: `${expectedPct} (${perspective.toLowerCase()} para regime ${regime})`,
      perspective,
      message: `[MRM-Invariant] PIS+COFINS agregado ${actualPct} fora da faixa esperada ${expectedPct} para regime ${regime} (perspectiva ${perspective}).`,
    })
  }
}

/**
 * Valida identidade matemática `apuracao × (1 − icms_pct) = construcao` para
 * regimes não-cumulativos (LR/LP) com ICMS configurado.
 *
 * Quando ICMS=17%: `9,25% × 0,83 = 7,6775%` (LR exemplo canônico).
 *
 * Story MRM-V5-002 AC4 — validação cruzada das duas perspectivas.
 *
 * @throws {MrmInvariantError} quando identidade não se mantém
 */
export function validatePisCofinsIdentity(
  pisCofinsApuracao: number,
  pisCofinsConstrucao: number,
  icmsRate: number,
): void {
  // Identidade STF: PIS/COFINS apuração × (1 − ICMS) = PIS/COFINS construção
  const expectedConstrucao = pisCofinsApuracao * (1 - icmsRate)
  const diff = Math.abs(pisCofinsConstrucao - expectedConstrucao)

  if (diff > PIS_COFINS_TOLERANCE) {
    const expectedPct = (expectedConstrucao * 100).toFixed(4) + '%'
    const actualPct = (pisCofinsConstrucao * 100).toFixed(4) + '%'
    throw new MrmInvariantError({
      code: 'PIS_COFINS_IDENTITY_VIOLATION',
      actual: pisCofinsConstrucao,
      expected: `${expectedPct} (= ${(pisCofinsApuracao * 100).toFixed(4)}% × (1 − ${(icmsRate * 100).toFixed(2)}%))`,
      perspective: null,
      message: `[MRM-Invariant] Identidade matemática quebrada: construção ${actualPct} ≠ apuração × (1 − ICMS) = ${expectedPct}.`,
    })
  }
}
