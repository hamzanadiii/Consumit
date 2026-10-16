import { afterEach, describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'

import { BrowserCatalogError, browserDiscoverCatalog, browserSearchCatalog, catalogBrowseFeed } from './catalog-browser'

afterEach(() => vi.unstubAllGlobals())

describe('browser catalog requests', () => {
  it('accepts supported shelf links and defaults unknown or repeated feeds to Popular', () => {
    expect(catalogBrowseFeed('top-rated')).toBe('top-rated')
    expect(catalogBrowseFeed('trending')).toBe('trending')
    for (const value of [undefined, 'popular', 'now-playing', 'invalid', ['trending', 'top-rated']]) {
      expect(catalogBrowseFeed(value)).toBe('popular')
    }
  })

  it('encodes discovery filters and rejects wrong pages or media kinds', async () => {
    const page = {
      items: [movieSummary], page: 2, totalPages: 4, totalResults: 80,
      meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(page))
      .mockResolvedValueOnce(Response.json({ ...page, page: 1 }))
      .mockResolvedValueOnce(Response.json({ ...page, items: [seriesSummary] }))
    vi.stubGlobal('fetch', fetchMock)
    const query = { kind: 'movie' as const, feed: 'popular' as const, genre: 'Action & Adventure', year: 2024 }
    expect((await browserDiscoverCatalog(query, 2)).items[0]?.id).toBe(movieSummary.id)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/titles/discover?kind=movie&feed=popular&page=2&genre=Action+%26+Adventure&year=2024')
    await expect(browserDiscoverCatalog(query, 2)).rejects.toThrow('invalid discovery response')
    await expect(browserDiscoverCatalog(query, 2)).rejects.toThrow('invalid discovery response')
  })

  it('always sends a bounded request and translates deadline failures', async () => {
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      throw new DOMException('timed out', 'TimeoutError')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(browserSearchCatalog('dune')).rejects.toEqual(
      expect.objectContaining<Partial<BrowserCatalogError>>({
        message: 'The catalog took too long to respond.',
        retryable: true,
      }),
    )
  })

  it('preserves caller cancellation so stale searches stay silent', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_path: string, init?: RequestInit) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    )))

    const request = browserSearchCatalog('dune', 'all', controller.signal)
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
