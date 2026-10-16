import { describe, expect, it, vi } from 'vitest'

import { StaleCache } from './stale-cache.ts'
import type { PersistentCatalogCacheStore } from './cache-store.ts'

describe('StaleCache', () => {
  it('coalesces persistent reads as well as upstream loads on concurrent cold requests', async () => {
    let settle!: (value: null) => void
    const store: PersistentCatalogCacheStore = {
      get: vi.fn(() => new Promise<null>((resolve) => { settle = resolve })),
      set: vi.fn(async () => {}), delete: vi.fn(async () => {}), deleteExpired: vi.fn(async () => 0),
    }
    const cache = new StaleCache(Date.now, store)
    const load = vi.fn(async () => 'fresh')
    const requests = Array.from({ length: 100 }, () => cache.get('title', { freshForMs: 100, staleForMs: 100 }, load))
    expect(store.get).toHaveBeenCalledTimes(1)
    settle(null)
    expect(await Promise.all(requests)).toHaveLength(100)
    expect(load).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledTimes(1)
  })

  it('checks freshness after a slow persistent read and lets refresh replace expired rows', async () => {
    let now = 0
    const store: PersistentCatalogCacheStore = {
      get: vi.fn(async () => { now = 201; return { key: 'title', value: 'expired', fetchedAt: new Date(0), freshUntil: new Date(100), staleUntil: new Date(200) } }),
      set: vi.fn(async () => {}), delete: vi.fn(async () => {}), deleteExpired: vi.fn(async () => 0),
    }
    const cache = new StaleCache(() => now, store)
    expect(await cache.get('title', { freshForMs: 100, staleForMs: 100 }, async () => 'fresh')).toMatchObject({ value: 'fresh', stale: false })
    expect(store.delete).not.toHaveBeenCalled()
  })
  it('coalesces concurrent misses', async () => {
    let resolveLoad!: (value: string) => void
    const load = vi.fn(() => new Promise<string>((resolve) => { resolveLoad = resolve }))
    const cache = new StaleCache()
    const policy = { freshForMs: 100, staleForMs: 100 }

    const first = cache.get('title', policy, load)
    const second = cache.get('title', policy, load)
    resolveLoad('fresh')

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ stale: false, value: 'fresh' }),
      expect.objectContaining({ stale: false, value: 'fresh' }),
    ])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('serves stale content while one refresh runs', async () => {
    let now = 0
    const cache = new StaleCache(() => now)
    const policy = { freshForMs: 100, staleForMs: 500 }
    await cache.get('title', policy, async () => 'first')
    now = 101

    const load = vi.fn(async () => 'second')
    await expect(cache.get('title', policy, load)).resolves.toEqual(
      expect.objectContaining({ stale: true, value: 'first' }),
    )

    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    await expect(cache.get('title', policy, load)).resolves.toEqual(
      expect.objectContaining({ stale: false, value: 'second' }),
    )
  })

  it('fails after the stale window expires', async () => {
    let now = 0
    const cache = new StaleCache(() => now)
    const policy = { freshForMs: 100, staleForMs: 100 }
    await cache.get('title', policy, async () => 'first')
    now = 201

    await expect(cache.get('title', policy, async () => { throw new Error('offline') }))
      .rejects.toThrow('offline')
  })
})
