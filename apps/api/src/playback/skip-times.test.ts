import { describe, expect, it, vi } from 'vitest'
import { createSkipTimes } from './skip-times.ts'

const movie = { kind: 'movie' as const, id: 550 }
const tv = { kind: 'series' as const, id: 1396, season: 1, episode: 1 }
const anime = { kind: 'anime' as const, id: 21, episode: 1 }
const response = (data: unknown) => vi.fn<typeof fetch>().mockImplementation(async () => Response.json(data))

describe('exact skip timing adapters', () => {
  it('reads exact movie and episode identity, converts milliseconds and caches identical reads', async () => {
    const fetcher = response({ tmdb_id: 550, type: 'movie', intro: [{ start_ms: 10000, end_ms: 90000 }] })
    const service = createSkipTimes({ animeMalId: async () => null, fetcher })
    expect(await service.read(movie, 7200)).toEqual([{ kind: 'intro', start: 10, end: 90 }])
    await service.read(movie, 7200)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(url.origin).toBe('https://api.theintrodb.org')
    expect(url.searchParams.get('duration_ms')).toBe('7200000')
    expect(url.searchParams.has('season')).toBe(false)
    fetcher.mockImplementation(async () => Response.json({ tmdb_id: 1396, type: 'tv', season: 1, episode: 1, intro: [{ start_ms: 228664, end_ms: 246143 }] }))
    expect(await service.read(tv, 3480)).toEqual([{ kind: 'intro', start: 228.664, end: 246.143 }])
    const episodeUrl = new URL(String(fetcher.mock.calls[1]?.[0]))
    expect(episodeUrl.searchParams.get('season')).toBe('1')
    expect(episodeUrl.searchParams.get('episode')).toBe('1')
    expect(fetcher.mock.calls[1]?.[1]?.redirect).toBe('error')
  })

  it('maps canonical AniList identity to MAL and accepts only exact opening/recap timings with matching runtime', async () => {
    const animeMalId = vi.fn(async () => 100)
    const result = (skipType: string, startTime: number, endTime: number, episodeLength = 1440) => ({ skipType, interval: { startTime, endTime }, episodeLength })
    const fetcher = response({ found: true, results: [result('recap', 10, 30), result('op', 100, 190), result('mixed-op', 200, 290), result('ed', 1300, 1390), result('op', 300, 390, 1500)] })
    const service = createSkipTimes({ animeMalId, fetcher })
    expect(await service.read(anime, 1440)).toEqual([{ kind: 'recap', start: 10, end: 30 }, { kind: 'intro', start: 100, end: 190 }])
    expect(animeMalId).toHaveBeenCalledWith(21)
    const url = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v2/skip-times/100/1')
    expect(url.searchParams.getAll('types[]')).toEqual(['op', 'recap'])
    expect(url.searchParams.get('episodeLength')).toBe('1440')
  })

  it('honors a documented beginning marker while rejecting omitted timing fields', async () => {
    const fetcher = response({ tmdb_id: 550, type: 'movie', intro: [{ start_ms: null, end_ms: 90000 }] })
    expect(await createSkipTimes({ animeMalId: async () => null, fetcher }).read(movie, 1440)).toEqual([{ kind: 'intro', start: 0, end: 90 }])
    fetcher.mockImplementation(async () => Response.json({ tmdb_id: 550, type: 'movie', intro: [{ end_ms: 90000 }] }))
    expect(await createSkipTimes({ animeMalId: async () => null, fetcher }).read(movie, 1440)).toEqual([])
  })

  it('rejects wrong identity, reversed, oversized and conflicting ranges', async () => {
    const fetcher = response({ tmdb_id: 550, type: 'movie', intro: [
      { start_ms: null, end_ms: 90000 }, { start_ms: 120000, end_ms: 110000 },
      { start_ms: 200000, end_ms: 850000 }, { start_ms: 10000, end_ms: 60000 },
      { start_ms: 30000, end_ms: 90000 }, { start_ms: 300000, end_ms: 320000 },
      { start_ms: 300000, end_ms: 320000 }, { start_ms: 900000, end_ms: 1100000 },
    ] })
    expect(await createSkipTimes({ animeMalId: async () => null, fetcher }).read(movie, 1000)).toEqual([{ kind: 'intro', start: 300, end: 320 }])
    fetcher.mockImplementation(async () => Response.json({ tmdb_id: 1396, type: 'tv', season: 1, episode: 2, intro: [{ start_ms: 0, end_ms: 90000 }] }))
    expect(await createSkipTimes({ animeMalId: async () => null, fetcher }).read(tv, 1440)).toEqual([])
  })

  it('coalesces concurrent reads and treats unavailable or malformed metadata as no timings', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    const service = createSkipTimes({ animeMalId: async () => null, fetcher })
    expect(await Promise.all([service.read(movie, 1440), service.read(movie, 1440)])).toEqual([[], []])
    expect(fetcher).toHaveBeenCalledTimes(1)
    for (const body of ['invalid json', 'x'.repeat(65537), JSON.stringify({ intro: 'wrong shape' })]) {
      fetcher.mockImplementation(async () => new Response(body))
      expect(await createSkipTimes({ animeMalId: async () => null, fetcher }).read(movie, 1440)).toEqual([])
    }
    expect(await service.read(anime, 1440)).toEqual([])
    expect(await service.read(movie, NaN)).toEqual([])
    expect(await service.read(movie, 10)).toEqual([])
  })

  it('bounds a stalled identity lookup so optional timings cannot block playback', async () => {
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    try {
      const service = createSkipTimes({ animeMalId: () => new Promise(() => {}) })
      const read = service.read(anime, 1440)
      controller.abort()
      expect(await read).toEqual([])
      expect(timeout).toHaveBeenCalledWith(3000)
    } finally { timeout.mockRestore() }
  })
})
