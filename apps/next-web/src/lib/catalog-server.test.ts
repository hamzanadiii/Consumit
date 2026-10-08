import { afterEach, describe, expect, it, vi } from 'vitest'
import { movieDetail } from '@/test/catalog-fixtures'
import { getCatalogTitle } from './catalog-api'
import { getAnimeTrending } from './anime-api'

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('server metadata reads', () => {
  it('caches only public metadata even on request-bound Watch and Home renders', async () => {
    const fetchMock = vi.fn<typeof fetch>(async url => Response.json(String(url).includes('/anime/')
      ? { items: [], page: 1, totalPages: 0, totalResults: 0 }
      : { item: movieDetail, meta: { source: 'tmdb', stale: false, fetchedAt: '2026-10-02T00:00:00Z', language: 'en-US', region: 'US' } }))
    vi.stubGlobal('fetch', fetchMock)
    await getCatalogTitle('movie', movieDetail.id)
    await getAnimeTrending()
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({ next: { revalidate: 300 }, headers: { accept: 'application/json' } })
      expect(options).not.toHaveProperty('cache', 'no-store')
      expect(options?.headers).not.toHaveProperty('cookie')
      expect(options?.headers).not.toHaveProperty('authorization')
    }
  })

  it('allows the bounded AniList request to finish after six seconds', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms)
      return controller.signal
    })
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
      setTimeout(() => resolve(Response.json({ items: [], page: 1, totalPages: 0, totalResults: 0 })), 7_000)
    })))
    const result = getAnimeTrending().then(value => ({ value }), error => ({ error }))
    await vi.advanceTimersByTimeAsync(7_000)
    expect(await result).toMatchObject({ value: { items: [] } })
  })

  it('preserves the rate-limit code for the catalog failure screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: {
      code: 'RATE_LIMITED', retryable: true, message: 'Too many requests.', requestId: 'catalog-test',
    } }, { status: 429 })))
    await expect(getAnimeTrending()).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, retryable: true })
    await expect(getCatalogTitle('movie', 550)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, retryable: true })
  })

  it('still stops a hung metadata request at the bounded deadline', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms)
      return controller.signal
    })
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    })))
    const result = getAnimeTrending().then(value => ({ value }), error => ({ error }))
    await vi.advanceTimersByTimeAsync(12_000)
    expect(await result).toMatchObject({ error: { code: 'ANILIST_UNAVAILABLE', status: 503, retryable: true } })
  })
})
