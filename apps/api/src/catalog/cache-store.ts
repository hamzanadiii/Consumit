export type PersistentCatalogCacheEntry = {
  key: string
  value: unknown
  fetchedAt: Date
  freshUntil: Date
  staleUntil: Date | null
}

export type PersistentCatalogCacheStore = {
  get(key: string): Promise<PersistentCatalogCacheEntry | null>
  set(entry: PersistentCatalogCacheEntry): Promise<void>
  delete(key: string): Promise<void>
  deleteExpired(now: Date): Promise<number>
}
