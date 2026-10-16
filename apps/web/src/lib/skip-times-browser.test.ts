import { afterEach, expect, it, vi } from 'vitest'
import { browserSkipTimes } from './skip-times-browser'

afterEach(() => vi.unstubAllGlobals())

it('requests exact title/episode and actual runtime through the first-party API', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ segments: [{ kind: 'intro', start: 10, end: 90 }, { kind: 'intro', start: 120, end: 110 }, { kind: 'outro', start: 1300, end: 1500 }] }))
  vi.stubGlobal('fetch', fetcher)
  expect(await browserSkipTimes({ kind: 'series', id: 1396, season: 1, episode: 1 }, 1440, new AbortController().signal)).toEqual([{ kind: 'intro', start: 10, end: 90 }])
  expect(fetcher.mock.calls[0]?.[0]).toBe('/v1/playback/skip-times?kind=series&id=1396&duration=1440&season=1&episode=1')
  expect(fetcher.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal)
})

it('keeps unavailable and malformed timing metadata empty', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ segments: [{ kind: 'intro', start: 'wrong', end: 90 }] }))
  vi.stubGlobal('fetch', fetcher)
  const ref = { kind: 'movie' as const, id: 550 }, signal = new AbortController().signal
  expect(await browserSkipTimes(ref, 7200, signal)).toEqual([])
  expect(await browserSkipTimes(ref, 7200, signal)).toEqual([])
})
