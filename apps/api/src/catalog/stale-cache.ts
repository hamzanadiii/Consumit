import type { PersistentCatalogCacheStore } from './cache-store.ts'

const MAX_MEMORY_ENTRIES = 500
const MAX_REFRESH_FAILURES = 500

export type CachePolicy = {
  freshForMs: number
  /** `null` keeps the last known good value until an upstream refresh works. */
  staleForMs: number | null
}

export type CachedValue<T> = {
  fetchedAt: Date
  stale: boolean
  value: T
}

type Entry<T> = {
  fetchedAt: Date
  freshUntil: number
  staleUntil: number
  value: T
}

export class StaleCache {
  readonly #entries = new Map<string, Entry<unknown>>()
  readonly #inFlight = new Map<string, Promise<Entry<unknown>>>()
  readonly #refreshFailures = new Map<string, { attempts: number; retryAt: number }>()
  readonly #now: () => number
  readonly #persistent: PersistentCatalogCacheStore | undefined
  readonly #onStoreError: (error: unknown) => void

  constructor(now: () => number = Date.now, persistent?: PersistentCatalogCacheStore, onStoreError: (error: unknown) => void = () => undefined) {
    this.#now = now
    this.#persistent = persistent
    this.#onStoreError = onStoreError
  }

  async get<T>(
    key: string,
    policy: CachePolicy,
    load: () => Promise<T>,
  ): Promise<CachedValue<T>> {
    const now = this.#now()
    let existing = this.#entries.get(key) as Entry<T> | undefined
    if (existing) this.#remember(key, existing)

    if (!existing && this.#persistent) {
      try {
        const persisted = await this.#persistent.get(key)
        if (persisted) {
          existing = {
            fetchedAt: persisted.fetchedAt,
            freshUntil: persisted.freshUntil.getTime(),
            staleUntil: persisted.staleUntil?.getTime() ?? Number.POSITIVE_INFINITY,
            value: persisted.value as T,
          }
          this.#remember(key, existing)
        }
      } catch (error) {
        this.#onStoreError(error)
      }
    }

    if (existing && existing.staleUntil <= now) {
      this.#entries.delete(key)
      void this.#persistent?.delete(key).catch(this.#onStoreError)
      existing = undefined
    }

    if (existing && existing.freshUntil > now) {
      return { fetchedAt: existing.fetchedAt, stale: false, value: existing.value }
    }

    if (existing) {
      const failure = this.#refreshFailures.get(key)
      if (!failure || failure.retryAt <= now) this.#refresh(key, policy, load).catch(() => undefined)
      return { fetchedAt: existing.fetchedAt, stale: true, value: existing.value }
    }

    try {
      const refreshed = await this.#refresh(key, policy, load)
      return { fetchedAt: refreshed.fetchedAt, stale: false, value: refreshed.value }
    } catch (error) {
      const fallback = this.#entries.get(key) as Entry<T> | undefined
      if (fallback && fallback.staleUntil > this.#now()) {
        return { fetchedAt: fallback.fetchedAt, stale: true, value: fallback.value }
      }
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    this.#entries.delete(key)
    try {
      await this.#persistent?.delete(key)
    } catch (error) {
      this.#onStoreError(error)
    }
  }

  async #refresh<T>(key: string, policy: CachePolicy, load: () => Promise<T>) {
    const active = this.#inFlight.get(key) as Promise<Entry<T>> | undefined
    if (active) return active

    const request = (async () => {
      const value = await load()
      const loadedAt = this.#now()
      const entry: Entry<T> = {
        fetchedAt: new Date(loadedAt),
        freshUntil: loadedAt + policy.freshForMs,
        staleUntil: policy.staleForMs === null ? Number.POSITIVE_INFINITY : loadedAt + policy.freshForMs + policy.staleForMs,
        value,
      }
      this.#remember(key, entry)
      this.#refreshFailures.delete(key)
      if (this.#persistent) {
        try {
          await this.#persistent.set({
            key,
            value,
            fetchedAt: entry.fetchedAt,
            freshUntil: new Date(entry.freshUntil),
            staleUntil: Number.isFinite(entry.staleUntil) ? new Date(entry.staleUntil) : null,
          })
        } catch (error) {
          this.#onStoreError(error)
        }
      }
      return entry
    })()

    this.#inFlight.set(key, request)
    try {
      return await request
    } catch (error) {
      const previous = this.#refreshFailures.get(key)
      const attempts = Math.min((previous?.attempts ?? 0) + 1, 8)
      const retryAt = this.#now() + Math.min(60_000 * 2 ** (attempts - 1), 60 * 60_000)
      this.#refreshFailures.delete(key)
      this.#refreshFailures.set(key, { attempts, retryAt })
      while (this.#refreshFailures.size > MAX_REFRESH_FAILURES) {
        const oldest = this.#refreshFailures.keys().next().value
        if (oldest === undefined) break
        this.#refreshFailures.delete(oldest)
      }
      throw error
    } finally {
      this.#inFlight.delete(key)
    }
  }

  #remember<T>(key: string, entry: Entry<T>) {
    this.#entries.delete(key)
    this.#entries.set(key, entry)
    while (this.#entries.size > MAX_MEMORY_ENTRIES) {
      const oldest = this.#entries.keys().next().value
      if (oldest === undefined) return
      this.#entries.delete(oldest)
    }
  }
}
