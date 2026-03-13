/**
 * SWR cache provider backed by sessionStorage.
 *
 * - Data persists across client-side navigations (instant page loads)
 * - Data persists across full page refreshes (F5)
 * - Data clears when the browser tab is closed
 * - Cleared on logout via clearSessionCache()
 */

const STORAGE_KEY = 'pc-swr-cache'

export function sessionStorageCacheProvider(): Map<string, unknown> {
  if (typeof window === 'undefined') {
    return new Map()
  }

  let initial: [string, unknown][] = []
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) initial = JSON.parse(stored)
  } catch {
    // corrupt or quota — start fresh
  }

  const map = new Map<string, unknown>(initial)

  const persist = () => {
    try {
      const entries: [string, unknown][] = []
      map.forEach((value, key) => {
        // Only persist successful data entries (skip SWR error/loading meta)
        if (value && typeof value === 'object' && !('error' in (value as Record<string, unknown>))) {
          entries.push([key, value])
        }
      })
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // quota exceeded — silently fail
    }
  }

  window.addEventListener('beforeunload', persist)

  // Also persist periodically so navigations within the SPA pick up fresh data
  const interval = setInterval(persist, 5000)

  // Cleanup on HMR in dev
  if ((module as any).hot) {
    (module as any).hot.dispose(() => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', persist)
    })
  }

  return map
}

/** Call on logout to wipe all cached API data */
export function clearSessionCache(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
