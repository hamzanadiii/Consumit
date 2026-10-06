export type CacheTTL = { freshMs: number; staleMs: number }

export type CacheEntry<T> = {
  data: T
  fetchedAt: number
  staleAt: number
  expiresAt: number
}

export type AnilistCache = {
  get<T>(key: string): { data: T; stale: boolean } | null
  set<T>(key: string, data: T, ttl: CacheTTL): void
  has(key: string): boolean
  delete(key: string): void
  clear(): void
}

const DEFAULT_TTLS: Record<string, CacheTTL> = {
  search: { freshMs: 5 * 60_000, staleMs: 60 * 60_000 },
  trending: { freshMs: 15 * 60_000, staleMs: 4 * 60 * 60_000 },
  details: { freshMs: 6 * 60 * 60_000, staleMs: 7 * 24 * 60 * 60_000 },
  characters: { freshMs: 24 * 60 * 60_000, staleMs: 7 * 24 * 60 * 60_000 },
  relations: { freshMs: 24 * 60 * 60_000, staleMs: 7 * 24 * 60 * 60_000 },
  airing: { freshMs: 5 * 60_000, staleMs: 60 * 60_000 },
  seasonal: { freshMs: 15 * 60_000, staleMs: 4 * 60 * 60_000 },
  browse: { freshMs: 15 * 60_000, staleMs: 4 * 60 * 60_000 },
}

export const cacheTTLs = DEFAULT_TTLS

export function createAnilistCache(maxEntries = 500): AnilistCache {
  const store = new Map<string, CacheEntry<unknown>>()

  const evict = () => {
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value
      if (oldest === undefined) return
      store.delete(oldest)
    }
  }

  return {
    get<T>(key: string): { data: T; stale: boolean } | null {
      const entry = store.get(key)
      if (!entry) return null
      const now = Date.now()
      if (now > entry.expiresAt) {
        store.delete(key)
        return null
      }
      // Refresh insertion order so eviction retains recently used data.
      store.delete(key)
      store.set(key, entry)
      return { data: entry.data as T, stale: now > entry.staleAt }
    },

    set<T>(key: string, data: T, ttl: CacheTTL): void {
      const now = Date.now()
      store.set(key, {
        data,
        fetchedAt: now,
        staleAt: now + ttl.freshMs,
        expiresAt: now + ttl.staleMs,
      })
      evict()
    },

    has(key: string) {
      const entry = store.get(key)
      if (!entry) return false
      if (Date.now() > entry.expiresAt) {
        store.delete(key)
        return false
      }
      return true
    },

    delete(key: string) {
      store.delete(key)
    },

    clear() {
      store.clear()
    },
  }
}
