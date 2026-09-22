import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAnilistCache } from './cache.ts'
import { createAnilistClient } from './client.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AniList client', () => {
  it('serves a still-valid stale cache entry when AniList is unavailable', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const cache = createAnilistCache()
    cache.set('trending:1', { Page: { media: [] } }, { freshMs: 1, staleMs: 60_000 })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.010Z'))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))

    const client = createAnilistClient({ cache })

    await expect(client.query('query { Page { media { id } } }', undefined, 'trending:1', 'trending'))
      .resolves.toEqual({ Page: { media: [] } })
  })
})
