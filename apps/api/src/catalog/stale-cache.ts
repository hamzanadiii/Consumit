export type CachePolicy = {
  freshForMs: number
  staleForMs: number
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
  readonly #now: () => number

  constructor(now: () => number = Date.now) {
    this.#now = now
  }

  async get<T>(
    key: string,
    policy: CachePolicy,
    load: () => Promise<T>,
  ): Promise<CachedValue<T>> {
    const now = this.#now()
    const existing = this.#entries.get(key) as Entry<T> | undefined

    if (existing && existing.freshUntil > now) {
      return { fetchedAt: existing.fetchedAt, stale: false, value: existing.value }
    }

    if (existing && existing.staleUntil > now) {
      this.#refresh(key, policy, load).catch(() => undefined)
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

  async #refresh<T>(key: string, policy: CachePolicy, load: () => Promise<T>) {
    const active = this.#inFlight.get(key) as Promise<Entry<T>> | undefined
    if (active) return active

    const request = (async () => {
      const value = await load()
      const loadedAt = this.#now()
      const entry: Entry<T> = {
        fetchedAt: new Date(loadedAt),
        freshUntil: loadedAt + policy.freshForMs,
        staleUntil: loadedAt + policy.freshForMs + policy.staleForMs,
        value,
      }
      this.#entries.set(key, entry)
      return entry
    })()

    this.#inFlight.set(key, request)
    try {
      return await request
    } finally {
      this.#inFlight.delete(key)
    }
  }
}
