import { describe, expect, it } from 'vitest'
import type { ProviderHttp } from './http.ts'
import { createVidboltProvider } from './vidbolt.ts'

function fixture(responses: Array<{ status?: number; text: string }>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  let index = 0
  const http = (async (url: string, headers: Record<string, string>) => {
    calls.push({ url, headers })
    const response = responses[index++] ?? responses.at(-1)!
    return { status: response.status ?? 200, text: response.text, url, headers: new Headers() }
  }) as ProviderHttp
  return { http, calls }
}

describe('VidBolt provider', () => {
  it('resolves the default movie lane with stable quality groups and a pinned Origin hint', async () => {
    const { http, calls } = fixture([{ text: JSON.stringify({ stream: { server: 'orion', sources: [
      { url: 'https://img.rousav.tech/media/main.m3u8', kind: 'hls', quality: '1080p' },
      { url: 'https://img.rousav.tech/media/720.m3u8', kind: 'hls', quality: '720p' },
    ] } }) }])
    const provider = createVidboltProvider(http, () => 1_800_000_000_000)
    const result = await provider.resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)

    expect(calls[0]?.url).toBe('https://vidbolt.xyz/api/resolve?type=movie&id=550')
    expect(calls[0]?.headers.accept).toContain('application/json')
    // VidBolt's WAF 403s requests with no User-Agent or the literal `node`
    // UA regardless of egress IP; the resolution request must carry a browser
    // UA (same constant document() uses) or every lane fails closed.
    expect(calls[0]?.headers['user-agent']).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36')
    expect(result).toMatchObject({ ok: true, sources: [
      { serverName: 'Orion', type: 'hls', qualityHint: '1080p', qualityGroup: 'vidbolt-orion', headers: { origin: 'https://vidbolt.xyz' }, expiryEstimated: true },
      { serverName: 'Orion', type: 'hls', qualityHint: '720p', qualityGroup: 'vidbolt-orion', headers: { origin: 'https://vidbolt.xyz' } },
    ] })
  })

  it('forwards exact TV coordinates and retries an approved relay fallback lane', async () => {
    const { http, calls } = fixture([
      { text: JSON.stringify({ stream: null }) },
      { text: JSON.stringify({ stream: { server: 'callisto', sources: [
        { url: 'https://dash-hls-bridge.tenant.workers.dev/stream/master.m3u8', kind: 'hls', quality: '1080p' },
        { url: 'https://proxy.vidbolt.xyz/f/episode.mp4', kind: 'mp4', quality: '1080p' },
      ] } }) },
    ])
    const provider = createVidboltProvider(http)
    const result = await provider.resolve({ ref: { kind: 'series', id: 1396, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)

    expect(new URL(calls[0]!.url).searchParams.toString()).toBe('type=tv&id=1396&season=1&episode=1')
    expect(new URL(calls[1]!.url).searchParams.get('only')).toBe('callisto')
    expect(result).toMatchObject({ ok: true, sources: [{ serverName: 'Callisto', type: 'native', qualityHint: '1080p', headers: { origin: 'https://vidbolt.xyz' } }] })
    if (result.ok) expect(result.sources[0]?.url).toBe('https://proxy.vidbolt.xyz/f/episode.mp4')
  })

  it('skips unreviewed worker and scraper hosts and reports empty when no approved lane resolves', async () => {
    const { http, calls } = fixture(Array.from({ length: 4 }, () => ({ text: JSON.stringify({ stream: { sources: [
      { url: 'https://tenant.workers.dev/stream/master.m3u8', kind: 'hls', quality: '1080p' },
      { url: 'https://scraper.vidbolt.xyz/stream.m3u8', kind: 'hls', quality: '1080p' },
    ] } }) })))
    const provider = createVidboltProvider(http)
    const result = await provider.resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)

    expect(calls).toHaveLength(4)
    expect(result).toEqual({ ok: false, code: 'empty', retryable: false })
  })

  it('keeps the open HSCow lane free of an unnecessary Origin header', async () => {
    const { http } = fixture([{ text: JSON.stringify({ stream: { server: 'quasar', sources: [
      { url: 'https://img1.hscow.com/movie.m3u8', kind: 'hls', quality: 1080 },
    ] } }) }])
    const result = await createVidboltProvider(http).resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)

    expect(result).toMatchObject({ ok: true, sources: [{ serverName: 'Quasar', qualityHint: '1080p', headers: {} }] })
  })

  it('continues to the next lane when the first source is outside the configured media policy', async () => {
    const { http, calls } = fixture([
      { text: JSON.stringify({ stream: { sources: [{ url: 'https://proxy.vidbolt.xyz/movie.mp4', kind: 'mp4' }] } }) },
      { text: JSON.stringify({ stream: { server: 'callisto', sources: [{ url: 'https://img.rousav.tech/movie.m3u8', kind: 'hls' }] } }) },
    ])
    const result = await createVidboltProvider(http, Date.now, { mediaHosts: ['img.rousav.tech'] }).resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)
    expect(calls).toHaveLength(2)
    expect(result).toMatchObject({ ok: true, sources: [{ serverName: 'Callisto', url: 'https://img.rousav.tech/movie.m3u8' }] })
  })

  it('rejects malformed data, anime identities, and already-aborted work', async () => {
    const malformed = fixture([{ text: '{' }])
    expect(await createVidboltProvider(malformed.http).resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    expect(await createVidboltProvider(malformed.http).resolve({ ref: { kind: 'anime', id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    const controller = new AbortController()
    controller.abort()
    const canceled = fixture([{ text: JSON.stringify({ stream: null }) }])
    expect(await createVidboltProvider(canceled.http).resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, controller.signal)).toMatchObject({ ok: false, code: 'cancelled' })
    expect(canceled.calls).toHaveLength(0)
  })

  it('does not retry indefinitely when every lane is unavailable', async () => {
    const { http, calls } = fixture([{ status: 503, text: '' }])
    const result = await createVidboltProvider(http).resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'unavailable' })
    expect(calls).toHaveLength(4)
  })
})
