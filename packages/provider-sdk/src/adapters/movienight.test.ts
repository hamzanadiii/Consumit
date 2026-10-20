import { describe, expect, it, vi } from 'vitest'
import { createMovieNightProvider, type ProviderHttp } from '../index.ts'

const movie = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' }
const signal = () => new AbortController().signal
const metadata = async () => ({ title: 'Fight Club', year: 1999 })

function sse(body: unknown) {
  return `event: message\ndata: ${JSON.stringify(body)}\n\n`
}
function client(...bodies: string[]) {
  return vi.fn<ProviderHttp>(async url => ({ status: 200, url, text: bodies.shift() ?? '' }))
}

describe('MovieNight', () => {
  it('parses the SSE payload and returns direct HLS sources', async () => {
    const payload = { server: 'vienna', sources: [{ url: 'https://proxy.scrapeequalsgayporn.st/api/stream/proxy?u=abc' }], subtitles: [{ url: 'https://subs.example/en.srt', language: 'English' }] }
    const http = client(sse(payload))
    const result = await createMovieNightProvider(http, metadata).resolve(movie, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://proxy.scrapeequalsgayporn.st/api/stream/proxy?u=abc', subtitles: [{ label: 'English', format: 'srt' }] }] })
    expect(http.mock.calls[0]?.[0]).toContain('/api/stream/v1/movie/550?title=Fight%20Club')
    expect(http.mock.calls[0]?.[1]).toMatchObject({ accept: 'text/event-stream, */*', origin: 'https://movienig.ht' })
  })

  it('retries with server=madison when the default lane is empty', async () => {
    const payload = { server: 'madison', sources: [{ url: 'https://proxy.scrapeequalsgayporn.st/api/stream/proxy?u=madison' }] }
    const http = client(sse({ server: 'vienna', sources: [] }), sse(payload))
    const result = await createMovieNightProvider(http, metadata).resolve(movie, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://proxy.scrapeequalsgayporn.st/api/stream/proxy?u=madison' }] })
    expect(http).toHaveBeenCalledTimes(2)
    expect(http.mock.calls[1]?.[0]).toContain('server=madison')
  })

  it('sends season/episode for TV', async () => {
    const payload = { server: 'vienna', sources: [{ url: 'https://proxy.scrapeequalsgayporn.st/api/stream/proxy?u=tv' }] }
    const http = client(sse(payload))
    await createMovieNightProvider(http, metadata).resolve(series, signal())
    expect(http.mock.calls[0]?.[0]).toContain('/api/stream/v1/tv/1396/1/1?title=Fight%20Club')
  })

  it('rejects non-https URLs and returns empty when no sources parse', async () => {
    const http = client(sse({ sources: [{ url: 'http://insecure.example/a' }] }), sse({ sources: [{ url: 'http://insecure.example/b' }] }))
    expect(await createMovieNightProvider(http, metadata).resolve(movie, signal())).toMatchObject({ ok: false, code: 'empty' })
  })

  it('handles malformed SSE gracefully', async () => {
    const http = client('not-sse-at-all', 'data: {broken json')
    expect(await createMovieNightProvider(http, metadata).resolve(movie, signal())).toMatchObject({ ok: false, code: 'empty' })
  })
})
