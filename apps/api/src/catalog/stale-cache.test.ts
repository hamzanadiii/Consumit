import { describe, expect, it, vi } from 'vitest'

import { StaleCache } from './stale-cache.ts'

describe('StaleCache', () => {
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
