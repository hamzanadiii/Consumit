import { describe, expect, it, vi } from 'vitest'
import { createCookieBakersProvider } from './cookiebakers.ts'
import type { ProviderHttp } from './http.ts'

const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const now = () => Date.parse('2026-10-09T00:00:00Z')
const master = 'https://cookiebakers23blog.xyz/play/fc8abadac3add42b/master.m3u8'

function fixture(statuses: number[] = [200], body: unknown = { url: master }) {
  const queue = [...statuses]
  return vi.fn<ProviderHttp>(async (url) => ({
    url,
    status: queue.length > 1 ? queue.shift()! : queue[0] ?? 200,
    text: JSON.stringify(body),
    headers: new Headers(),
  }))
}

describe('CookieBakers adapter', () => {
  it('resolves the movie vault endpoint with the site origin and returns the master', async () => {
    const http = fixture()
    const result = await createCookieBakersProvider(http, now).resolve(input, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://stream.lfmx.app/api/stream/cookiebakers/movie/550')
    expect(http.mock.calls[0]?.[1]).toMatchObject({
      origin: 'https://moanatv.lfmx.app',
      referer: 'https://moanatv.lfmx.app/',
    })
    expect(result).toMatchObject({ ok: true, sources: [{
      url: master, type: 'hls', headers: {}, qualityHint: 'Auto', language: 'original', subtitles: [],
    }] })
    expect(result.ok && result.sources[0]?.expiryEstimated).toBe(true)
  })
  it('calls the TV endpoint with season and episode', async () => {
    const http = fixture()
    await createCookieBakersProvider(http, now).resolve(
      { ...input, ref: { kind: 'series' as const, id: 1396, season: 1, episode: 7 } },
      new AbortController().signal,
    )
    expect(http.mock.calls[0]?.[0]).toBe('https://stream.lfmx.app/api/stream/cookiebakers/tv/1396/1/7')
  })
  it('retries an upstream flap and recovers', async () => {
    const http = fixture([429, 200])
    const result = await createCookieBakersProvider(http, now).resolve(input, new AbortController().signal)
    expect(http).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ ok: true, sources: [{ url: master }] })
  })
  it('gives up after repeated flaps', async () => {
    const http = fixture([502, 429, 504])
    expect(await createCookieBakersProvider(http, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable' })
    expect(http).toHaveBeenCalledTimes(3)
  })
  it('does not retry a genuine miss', async () => {
    const http = fixture([404])
    expect(await createCookieBakersProvider(http, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).toHaveBeenCalledTimes(1)
  })
  it('does not retry a non-flap server error', async () => {
    const http = fixture([500])
    expect(await createCookieBakersProvider(http, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
    expect(http).toHaveBeenCalledTimes(1)
  })
  it('stops retrying when the signal aborts', async () => {
    const controller = new AbortController()
    const http = vi.fn<ProviderHttp>(async () => {
      controller.abort(new DOMException('Aborted', 'AbortError'))
      return { url: 'x', status: 429, text: '{}', headers: new Headers() }
    })
    expect(await createCookieBakersProvider(http, now).resolve(input, controller.signal)).toMatchObject({ ok: false, code: 'cancelled' })
  })
  it.each([
    { body: { url: null } },
    { body: {} },
    { body: { url: 'http://cookiebakers23blog.xyz/x.m3u8' } },
    { body: { url: 'javascript:alert(1)' } },
    { body: { url: `https://evil.example/${'a'.repeat(5000)}` } },
    { text: '{' },
    { body: { nope: true } },
  ])('returns no source for missing or unsafe delivery: %j', async (options) => {
    const statuses = 'status' in options && options.status ? [options.status as number] : [200]
    const http = fixture(statuses, 'body' in options ? options.body : undefined)
    if ('text' in options) http.mockImplementationOnce(async (url) => ({ url, status: 200, text: options.text as string, headers: new Headers() }))
    expect(await createCookieBakersProvider(http, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
  })
  it('rejects movie and series requests for an anime ref', async () => {
    const http = fixture()
    expect(await createCookieBakersProvider(http, now).resolve(
      { ...input, ref: { kind: 'anime' as const, id: 21, episode: 1 } },
      new AbortController().signal,
    )).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
