import { describe, expect, it, vi } from 'vitest'
import { createMeguanimeProvider } from './meguanime.ts'
import type { ProviderHttp, ProviderHttpRequest } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }

const SITE = 'https://meguanime.com'
const FIRST = 'https://cdn.meguanime.com/hls/abc/master.m3u8'
const SECOND = 'https://cdn.meguanime.com/hls/def/master.m3u8'
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\n/variant.m3u8\n'
const SUB_LANES = ['aniwaves', 'zoko', 'miruro', 'kiwi', 'animegg', 'anibd']

type Route = { status: number; text: string; acao?: string | null }
type Call = { url: string; headers: Record<string, string>; init?: ProviderHttpRequest | undefined }

function lane(lane: string, lang: string | null = 'sub') {
  return `${SITE}/api/${lane}?al=21&ep=1${lang ? `&lang=${lang}` : ''}`
}
function laneRoutes(routes: Route): Record<string, Route> {
  return Object.fromEntries(SUB_LANES.map((name) => [lane(name, name === 'anibd' ? null : 'sub'), routes]))
}
function fixture(routes: Record<string, Route>) {
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    const route = routes[url] ?? { status: 404, text: '' }
    return {
      url,
      status: route.status,
      text: route.text,
      headers: new Headers(route.acao ? { 'access-control-allow-origin': route.acao } : {}),
    }
  })
  return { http, calls }
}
function payload(source: string, name: string, tracks: unknown[] = []): Route {
  return { status: 200, text: JSON.stringify({ sources: [{ source, name }], tracks }) }
}

describe('MeguAnimes adapter', () => {
  it('resolves the first sub lane and carries its captions', async () => {
    const { http, calls } = fixture({
      [lane('aniwaves')]: payload(FIRST, 'Echovideo', [
        { file: 'https://cdn.meguanime.com/subs/eng-2.vtt', label: 'English', kind: 'subtitles' },
        { file: 'https://cdn.meguanime.com/subs/spark.png', label: 'Thumbs', kind: 'thumbnails' },
      ]),
      [FIRST]: { status: 200, text: PLAYLIST },
    })
    const provider = createMeguanimeProvider(http, now)
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
    const result = await provider.resolve(sub, new AbortController().signal)
    expect(calls[0]?.url).toBe(lane('aniwaves'))
    expect(calls[0]?.headers).toMatchObject({
      accept: 'application/json, text/plain, */*',
      referer: `${SITE}/`,
      'user-agent': expect.any(String),
    })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      key: 'meguanime:aniwaves:sub:1:0',
      url: FIRST,
      type: 'hls',
      expiresAt: '2026-10-16T00:05:00.000Z',
      headers: { referer: `${SITE}/` },
      language: 'original',
      qualityHint: 'Echovideo',
    })
    expect(result.sources[0]?.subtitles).toEqual([
      { id: 'meguanime-sub-0', label: 'English', language: 'English', url: 'https://cdn.meguanime.com/subs/eng-2.vtt', format: 'vtt' },
    ])
  })

  it('requests the dub lane first for an explicit English audio preference', async () => {
    const { http, calls } = fixture({
      [lane('dub', 'dub')]: payload(FIRST, 'DubLane'),
      [FIRST]: { status: 200, text: PLAYLIST },
    })
    const result = await createMeguanimeProvider(http, now).resolve(dub, new AbortController().signal)
    expect(calls[0]?.url).toBe(lane('dub', 'dub'))
    expect(result.ok && result.sources[0]).toMatchObject({ language: 'en', key: 'meguanime:dub:dub:1:0' })
  })

  it('answers empty when every lane 404s', async () => {
    const { http, calls } = fixture({})
    expect(await createMeguanimeProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
    expect(calls).toHaveLength(SUB_LANES.length)
  })

  it('reports a malformed payload when every lane answers unparseable JSON', async () => {
    const { http } = fixture(laneRoutes({ status: 200, text: '<html>bad gateway</html>' }))
    expect(await createMeguanimeProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'malformed' })
  })

  it('falls through to the next lane when the first lane is dead', async () => {
    const { http, calls } = fixture({
      [lane('zoko')]: payload(SECOND, 'Zoko'),
      [SECOND]: { status: 200, text: PLAYLIST },
    })
    const result = await createMeguanimeProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: SECOND, key: 'meguanime:zoko:sub:1:0' }] })
    expect(calls.filter((call) => call.url.includes('/api/'))).toHaveLength(SUB_LANES.length)
  })

  it('drops a lane whose stream fails the manifest gate', async () => {
    const { http } = fixture({
      [lane('aniwaves')]: payload(FIRST, 'Echovideo'),
      [lane('zoko')]: payload(SECOND, 'Zoko', [{ file: 'https://cdn.meguanime.com/subs/eng-2.vtt', label: 'English' }]),
      [SECOND]: { status: 200, text: PLAYLIST },
    })
    const result = await createMeguanimeProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: SECOND }] })
    if (!result.ok) return
    expect(result.sources[0]?.subtitles).toEqual([
      { id: 'meguanime-sub-0', label: 'English', language: 'English', url: 'https://cdn.meguanime.com/subs/eng-2.vtt', format: 'vtt' },
    ])
  })

  it('answers empty when every candidate is rejected by the gate', async () => {
    const { http } = fixture({
      [lane('aniwaves')]: payload(FIRST, 'Echovideo'),
      [FIRST]: { status: 403, text: 'blocked' },
    })
    expect(await createMeguanimeProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
  })

  it('keeps at most five distinct sources in declared lane order', async () => {
    const many = (prefix: string) => payload(`https://cdn.meguanime.com/hls/${prefix}.m3u8`, prefix)
    const urls = [
      'https://cdn.meguanime.com/hls/a.m3u8',
      'https://cdn.meguanime.com/hls/b.m3u8',
      'https://cdn.meguanime.com/hls/c.m3u8',
      'https://cdn.meguanime.com/hls/d.m3u8',
      'https://cdn.meguanime.com/hls/e.m3u8',
      'https://cdn.meguanime.com/hls/f.m3u8',
    ]
    const { http } = fixture({
      [lane('aniwaves')]: many('a'),
      [lane('zoko')]: many('b'),
      [lane('miruro')]: { status: 200, text: JSON.stringify({ sources: urls.map((url) => ({ source: url })) }) },
      [lane('kiwi')]: many('f'),
      ...Object.fromEntries(urls.map((url) => [url, { status: 200, text: PLAYLIST }])),
    })
    const result = await createMeguanimeProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result.ok && result.sources).toHaveLength(5)
    expect(result.ok && result.sources.map((source) => source.url)).toEqual(urls.slice(0, 5))
  })

  it('rejects refs MeguAnimes cannot address', async () => {
    const { http } = fixture({})
    expect(await createMeguanimeProvider(http, now).resolve(
      { ...sub, ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 } },
      new AbortController().signal,
    )).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
