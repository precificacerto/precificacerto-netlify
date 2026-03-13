/**
 * Cache do dashboard: memória + sessionStorage (até TTL).
 * Memória: válida até o cliente resetar a página (F5).
 * sessionStorage: TTL de 10 min para primeira carga rápida após F5.
 * Deve ser limpo no logout (clearDashboardCache).
 */

const STORAGE_PREFIX = 'pc-dashboard-'
const TTL_MS = 10 * 60 * 1000 // 10 minutos

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CachedDashboard = {
  allYearEntries: any[]
  cashierMonthsData: any[]
  calcBase: Record<string, unknown>
}

type StoredEntry = CachedDashboard & { expiresAt: number }

const memoryCache = new Map<string, CachedDashboard>()

function cacheKey(tenantId: string, year: number): string {
  return `${tenantId}-${year}`
}

function storageKey(tenantId: string, year: number): string {
  return `${STORAGE_PREFIX}${cacheKey(tenantId, year)}`
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function getDashboardCache(tenantId: string, year: number): CachedDashboard | null {
  const key = cacheKey(tenantId, year)
  const fromMemory = memoryCache.get(key)
  if (fromMemory) return fromMemory

  if (isBrowser()) {
    try {
      const raw = sessionStorage.getItem(storageKey(tenantId, year))
      if (!raw) return null
      const parsed = JSON.parse(raw) as StoredEntry
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        sessionStorage.removeItem(storageKey(tenantId, year))
        return null
      }
      const data: CachedDashboard = {
        allYearEntries: parsed.allYearEntries ?? [],
        cashierMonthsData: parsed.cashierMonthsData ?? [],
        calcBase: parsed.calcBase ?? {},
      }
      memoryCache.set(key, data)
      return data
    } catch {
      return null
    }
  }
  return null
}

export function setDashboardCache(
  tenantId: string,
  year: number,
  data: CachedDashboard
): void {
  const key = cacheKey(tenantId, year)
  memoryCache.set(key, data)
  if (isBrowser()) {
    try {
      const entry: StoredEntry = {
        ...data,
        expiresAt: Date.now() + TTL_MS,
      }
      sessionStorage.setItem(storageKey(tenantId, year), JSON.stringify(entry))
    } catch {
      // quota ou privado; ignora
    }
  }
}

/** Chamar no logout para não vazar dados entre contas. */
export function clearDashboardCache(): void {
  memoryCache.clear()
  if (isBrowser()) {
    try {
      const keys: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k?.startsWith(STORAGE_PREFIX)) keys.push(k)
      }
      keys.forEach(k => sessionStorage.removeItem(k))
    } catch {
      // ignora
    }
  }
}
