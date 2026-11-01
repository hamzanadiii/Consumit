import type { PersistentCatalogCacheEntry, PersistentCatalogCacheStore } from './cache-store.ts'
import { randomUUID } from 'node:crypto'

export type CatalogRefreshLease = {
  claim(key: string, token: string, ttlMs: number): Promise<boolean>
  release(key: string, token: string): Promise<void>
}

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
  readonly #persistentReads = new Map<string, Promise<PersistentCatalogCacheEntry | null>>()
  readonly #refreshFailures = new Map<string, { attempts: number; retryAt: number }>()
  readonly #now: () => number
  readonly #persistent: PersistentCatalogCacheStore | undefined
  readonly #onStoreError: (error: unknown) => void
  readonly #lease: CatalogRefreshLease | undefined

  constructor(now: () => number = Date.now, persistent?: PersistentCatalogCacheStore, onStoreError: (error: unknown) => void = () => undefined, lease?: CatalogRefreshLease) {
    this.#now = now
    this.#persistent = persistent
    this.#onStoreError = onStoreError
    this.#lease = lease
  }

  async get<T>(
    key: string,
    policy: CachePolicy,
    load: () => Promise<T>,
  ): Promise<CachedValue<T>> {
    let existing = this.#entries.get(key) as Entry<T> | undefined
    if (existing) this.#remember(key, existing)

    if (!existing && this.#persistent) {
      try {
        const persisted = await this.#readPersistent(key)
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

    // A database read can outlast a value's remaining freshness window.
    const now = this.#now()
    if (existing && existing.staleUntil <= now) {
      this.#entries.delete(key)
      // Refresh upserts this row; scheduled expiry cleanup is conditional on
      // the stored deadline. An unawaited delete could erase a fresh upsert.
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

  /** Store a validated mapping learned from a canonical catalog response. */
  async set<T>(key: string, value: T, policy: CachePolicy): Promise<void> {
    const now = this.#now()
    const entry: Entry<T> = {
      fetchedAt: new Date(now),
      freshUntil: now + policy.freshForMs,
      staleUntil: policy.staleForMs === null ? Number.POSITIVE_INFINITY : now + policy.freshForMs + policy.staleForMs,
      value,
    }
    this.#remember(key, entry)
    if (!this.#persistent) return
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

  async #readPersistent(key: string): Promise<PersistentCatalogCacheEntry | null> {
    const active = this.#persistentReads.get(key)
    if (active) return active
    if (!this.#persistent) return null
    const request = this.#persistent.get(key)
    this.#persistentReads.set(key, request)
    try {
      return await request
    } finally {
      this.#persistentReads.delete(key)
    }
  }

  async #refresh<T>(key: string, policy: CachePolicy, load: () => Promise<T>) {
    const active = this.#inFlight.get(key) as Promise<Entry<T>> | undefined
    if (active) return active

    const request = (async () => {
      const token = randomUUID()
      let acquired = false
      if (this.#lease && this.#persistent) {
        acquired = await this.#lease.claim(key, token, 30000)
        if (!acquired) {
          const stale = this.#entries.get(key) as Entry<T> | undefined
          if (stale && stale.staleUntil > this.#now()) return stale
          // Cold followers wait a bounded interval for the owner to publish.
          // A timeout fails this request; it never starts a duplicate refresh.
          for (let attempt = 0; attempt < 20; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100))
            const shared = await this.#persistent.get(key)
            if (shared && shared.freshUntil.getTime() > this.#now()) {
              const entry: Entry<T> = { value: shared.value as T, fetchedAt: shared.fetchedAt, freshUntil: shared.freshUntil.getTime(), staleUntil: shared.staleUntil?.getTime() ?? Infinity }
              this.#remember(key, entry); return entry
            }
          }
          throw new Error('Catalog refresh is in progress.')
        }
      }
      try {
      if (acquired && this.#persistent) {
        const shared = await this.#persistent.get(key)
        if (shared && shared.freshUntil.getTime() > this.#now()) {
          const entry: Entry<T> = { value: shared.value as T, fetchedAt: shared.fetchedAt, freshUntil: shared.freshUntil.getTime(), staleUntil: shared.staleUntil?.getTime() ?? Infinity }
          this.#remember(key, entry); return entry
        }
      }
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
      } finally { if (acquired) await this.#lease!.release(key, token).catch(this.#onStoreError) }
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
