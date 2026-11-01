import { expect, it, vi } from 'vitest'
import { StaleCache, type CatalogRefreshLease } from './stale-cache.ts'
import type { PersistentCatalogCacheEntry, PersistentCatalogCacheStore } from './cache-store.ts'

export async function refreshFixture(coordinated: boolean, instances = 30) {
  let row: PersistentCatalogCacheEntry = { key: 'home', value: 'stale', fetchedAt: new Date(0), freshUntil: new Date(100), staleUntil: new Date(1000) }
  const writes = vi.fn(async (next: PersistentCatalogCacheEntry) => { row = next })
  const store: PersistentCatalogCacheStore = { get: async () => row, set: writes, delete: async () => {}, deleteExpired: async () => 0 }
  const locks = new Map<string, string>()
  const lease: CatalogRefreshLease = { claim: async (key, token) => { if (locks.has(key)) return false; locks.set(key, token); return true }, release: async (key, token) => { if (locks.get(key) === token) locks.delete(key) } }
  const load = vi.fn(async () => 'fresh')
  const caches = Array.from({ length: instances }, () => new StaleCache(() => 200, store, undefined, coordinated ? lease : undefined))
  const results = await Promise.all(caches.map(cache => cache.get('home', { freshForMs: 500, staleForMs: 500 }, load)))
  await vi.waitFor(() => expect(writes).toHaveBeenCalled())
  return { upstreamCalls: load.mock.calls.length, databaseWrites: writes.mock.calls.length, results }
}

it('reduces a thirty-instance stale refresh from thirty upstream calls/writes to one', async () => {
  const before = await refreshFixture(false), after = await refreshFixture(true)
  expect(before).toMatchObject({ upstreamCalls: 30, databaseWrites: 30 })
  expect(after).toMatchObject({ upstreamCalls: 1, databaseWrites: 1 })
  expect(after.results.every(result => result.value === 'stale')).toBe(true)
})

it('fails a cold request closed when shared admission is unavailable', async () => {
  const load = vi.fn(async () => 'fresh')
  const store: PersistentCatalogCacheStore = { get: async () => null, set: async () => {}, delete: async () => {}, deleteExpired: async () => 0 }
  const cache = new StaleCache(Date.now, store, undefined, { claim: async () => { throw new Error('Lease unavailable') }, release: async () => {} })
  await expect(cache.get('home', { freshForMs: 100, staleForMs: 100 }, load)).rejects.toThrow('Lease unavailable')
  expect(load).not.toHaveBeenCalled()
})
