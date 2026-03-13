import useSWR, { SWRConfiguration, KeyedMutator } from 'swr'

const apiFetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const CACHED_FETCH_CONFIG: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: true,
  dedupingInterval: 60_000,
  errorRetryCount: 2,
}

/**
 * SWR-backed fetch hook with aggressive caching.
 *
 * - Shows cached data instantly on mount (from sessionStorage or memory)
 * - Revalidates in background (stale-while-revalidate)
 * - 60s dedup so navigating back and forth won't re-fetch
 *
 * Pass `null` as url to skip fetching (conditional).
 */
export function useCachedFetch<T = unknown>(
  url: string | null,
  config?: SWRConfiguration
): {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isValidating: boolean
  mutate: KeyedMutator<T>
} {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    url,
    apiFetcher,
    { ...CACHED_FETCH_CONFIG, ...config }
  )
  return { data, error, isLoading, isValidating, mutate }
}
