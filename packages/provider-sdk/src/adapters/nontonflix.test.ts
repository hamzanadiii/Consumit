import { describe, expect, it } from 'vitest'
import type { ProviderHttp, ProviderHttpRequest, ProviderHttpResponse } from './http.ts'
import { createNontonflixProvider } from './nontonflix.ts'

type Fixture = { status?: number; text: string; url?: string; cookies?: string[] }
function fixture(responses: Fixture[]) {
  const calls: Array<{ url: string; headers: Record<string, string>; init?: ProviderHttpRequest }> = []
  let index = 0
  const http = (async (url: string, headers: Record<string, string>, _signal: AbortSignal, init?: ProviderHttpRequest) => {
    calls.push({ url, headers, ...(init ? { init } : {}) })
    const response = responses[index++] ?? responses.at(-1)!
    const responseHeaders = new Headers()
    for (const cookie of response.cookies ?? []) responseHeaders.append('set-cookie', cookie)
    return { status: response.status ?? 200, text: response.text, url: response.url ?? url, headers: responseHeaders }
  }) as ProviderHttp
  return { http, calls }
}
const signal = () => new AbortController().signal
const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const result = (sources: unknown[]) => JSON.stringify({ type: 'result', session: { sourceName: 'Aria', sources } }) + '\n'
const sessionResult = (session: unknown) => JSON.stringify({ type: 'result', session }) + '\n'

describe('NontonFlix provider', () => {
  it('bootstraps the device cookie, posts an NDJSON session, and scopes media headers', async () => {
    const { http, calls } = fixture([
      { text: '<html></html>', cookies: ['nf_mk=device-token; Path=/; Domain=.nontonflix.com', 'nf_web=web-token; Path=/api'] },
      { text: result([
        { url: 'https://media.nontonflix.com/media/grant-a', format: 'hls', quality: '1080p', provider: 's98a39983f32' },
        { url: 'https://media.nontonflix.com/media/grant-b', format: 'mp4', quality: 720, provider: 's98a39983f32' },
      ]) },
    ])
    const provider = createNontonflixProvider(http, () => 1_800_000_000_000)
    const resolved = await provider.resolve(input, signal())

    expect(calls[0]).toMatchObject({ url: 'https://nontonflix.com/', headers: { 'sec-fetch-mode': 'navigate' } })
    expect(calls[1]?.url).toBe('https://nontonflix.com/api/v1/playback/sessions')
    expect(calls[1]?.init).toMatchObject({ method: 'POST', body: JSON.stringify({ titleId: 'movie-550' }) })
    expect(calls[1]?.headers.cookie).toBe('nf_mk=device-token; nf_web=web-token')
    expect(calls[1]?.headers.referer).toBe('https://nontonflix.com/')
    expect(calls[1]?.headers.origin).toBe('https://nontonflix.com')
    expect(resolved).toMatchObject({ ok: true, sources: [
      { type: 'hls', height: 1080, qualityHint: '1080p', qualityGroup: 'nontonflix', subtitles: [],
        headers: { cookie: 'nf_mk=device-token; nf_web=web-token', referer: 'https://nontonflix.com/' } },
      { type: 'native', height: 720, qualityHint: '720p' },
    ] })
  })

  it('keeps the selected session server and exposes its four qualities together', async () => {
    const { http } = fixture([
      { text: '', cookies: ['nf_mk=device'] },
      { text: sessionResult({
        sourceId: 's98a39983f32',
        sourceName: 'Aria (4K)',
        sources: [
          { url: 'https://media.nontonflix.com/media/1080', format: 'hls', quality: 1080, provider: 's98a39983f32' },
          { url: 'https://media.nontonflix.com/media/2160', format: 'hls', quality: 2160, provider: 's98a39983f32' },
          { url: 'https://media.nontonflix.com/media/other', format: 'hls', quality: 720, provider: 'sd76852fd885' },
        ],
      }) },
    ])
    const resolved = await createNontonflixProvider(http).resolve(input, signal())

    expect(resolved).toMatchObject({ ok: true, sources: [
      { serverName: 'Aria (4K)', height: 1080, qualityGroup: 'nontonflix' },
      { serverName: 'Aria (4K)', height: 2160, qualityGroup: 'nontonflix' },
    ] })
    if (resolved.ok) expect(resolved.sources).toHaveLength(2)
  })

  it('re-mints the shield cookie exactly once when the session is unauthorized', async () => {
    const { http, calls } = fixture([
      { text: '', cookies: ['nf_mk=old-device; Path=/'] },
      { status: 401, text: '{"error":"client"}' },
      { text: '', cookies: ['nf_mk=new-device; Path=/'] },
      { text: result([{ url: 'https://media.nontonflix.com/media/grant-a', format: 'hls', quality: '1080p' }]) },
    ])
    const resolved = await createNontonflixProvider(http).resolve(input, signal())

    expect(calls).toHaveLength(4)
    expect(calls[1]?.headers.cookie).toBe('nf_mk=old-device')
    expect(calls[3]?.headers.cookie).toBe('nf_mk=new-device')
    expect(resolved).toMatchObject({ ok: true, sources: [{ headers: { cookie: 'nf_mk=new-device' } }] })
  })

  it('shares one shield-cookie refresh across simultaneous unauthorized resolutions', async () => {
    const { http, calls } = fixture([
      { text: '', cookies: ['nf_mk=old-device; Path=/'] },
      { status: 401, text: '{"error":"client"}' },
      { status: 401, text: '{"error":"client"}' },
      { text: '', cookies: ['nf_mk=new-device; Path=/'] },
      { text: result([{ url: 'https://media.nontonflix.com/media/grant-a', format: 'hls', quality: '1080p' }]) },
      { text: result([{ url: 'https://media.nontonflix.com/media/grant-b', format: 'hls', quality: '720p' }]) },
    ])
    const provider = createNontonflixProvider(http)

    const resolved = await Promise.all([
      provider.resolve(input, signal()),
      provider.resolve(input, signal()),
    ])

    expect(calls.filter(call => call.url === 'https://nontonflix.com/')).toHaveLength(2)
    expect(calls.filter(call => call.url === 'https://nontonflix.com/api/v1/playback/sessions')).toHaveLength(4)
    expect(resolved).toMatchObject([
      { ok: true, sources: [{ headers: { cookie: 'nf_mk=new-device' } }] },
      { ok: true, sources: [{ headers: { cookie: 'nf_mk=new-device' } }] },
    ])
  })

  it('reuses a refreshed cookie when a slower unauthorized response arrives late', async () => {
    let bootstraps = 0
    let sessions = 0
    let releaseLateUnauthorized!: () => void
    let markLateRequestStarted!: () => void
    const lateGate = new Promise<void>(resolve => { releaseLateUnauthorized = resolve })
    const lateRequestStarted = new Promise<void>(resolve => { markLateRequestStarted = resolve })
    const http = (async (url: string): Promise<ProviderHttpResponse> => {
      if (url === 'https://nontonflix.com/') {
        bootstraps += 1
        const headers = new Headers()
        headers.append('set-cookie', `nf_mk=${bootstraps === 1 ? 'old-device' : 'new-device'}; Path=/`)
        return { status: 200, text: '', url, headers }
      }
      sessions += 1
      if (sessions === 1) return { status: 401, text: '', url, headers: new Headers() }
      if (sessions === 2) {
        markLateRequestStarted()
        await lateGate
        return { status: 401, text: '', url, headers: new Headers() }
      }
      return { status: 200, text: result([{ url: `https://media.nontonflix.com/media/grant-${sessions}`, format: 'hls' }]), url, headers: new Headers() }
    }) as ProviderHttp
    const provider = createNontonflixProvider(http)

    const firstResolve = provider.resolve(input, signal())
    const lateResolve = provider.resolve(input, signal())
    await lateRequestStarted
    const first = await firstResolve
    releaseLateUnauthorized()
    const late = await lateResolve

    expect(bootstraps).toBe(2)
    expect(first).toMatchObject({ ok: true, sources: [{ headers: { cookie: 'nf_mk=new-device' } }] })
    expect(late).toMatchObject({ ok: true, sources: [{ headers: { cookie: 'nf_mk=new-device' } }] })
  })

  it('fails closed on a missing title and on unreviewed media hosts', async () => {
    const missing = fixture([{ text: '', cookies: ['nf_mk=device'] }, { status: 404, text: 'Title not found' }])
    expect(await createNontonflixProvider(missing.http).resolve(input, signal())).toEqual({ ok: false, code: 'empty', retryable: false })
    expect(missing.calls).toHaveLength(2)

    const unsafe = fixture([
      { text: '', cookies: ['nf_mk=device'] },
      { text: result([
        { url: 'https://evil.example/media.m3u8', format: 'hls', quality: '1080p' },
        { url: 'https://media.nontonflix.com.evil.example/media.m3u8', format: 'hls', quality: '1080p' },
      ]) },
    ])
    expect(await createNontonflixProvider(unsafe.http).resolve(input, signal())).toEqual({ ok: false, code: 'empty', retryable: false })
  })

  it('sends season and episode for series and rejects anime refs', async () => {
    const { http, calls } = fixture([
      { text: '', cookies: ['nf_mk=device'] },
      { text: result([{ url: 'https://media.nontonflix.com/media/grant-a', format: 'hls', quality: '1080p' }]) },
    ])
    await createNontonflixProvider(http).resolve({ ref: { kind: 'series', id: 1396, season: 2, episode: 5 }, region: 'US', audioLanguage: 'en' }, signal())
    expect(calls[1]?.init).toMatchObject({ body: JSON.stringify({ titleId: 'tv-1396', season: 2, episode: 5 }) })
    expect(await createNontonflixProvider(http).resolve({ ref: { kind: 'anime', id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }, signal()))
      .toEqual({ ok: false, code: 'empty', retryable: false })
  })
})
