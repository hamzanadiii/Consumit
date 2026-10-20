import { describe, expect, it, vi } from 'vitest'
import { createLuffytvProvider } from './luffytv.ts'
import type { ProviderHttp, ProviderHttpRequest } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }

const SITE = 'https://luffytv.live'
const LANES = ['anipm', 'xanime', 'anv', 'aniwaves', 'kototv', 'animesalt']
const SUB_STREAM = `${SITE}/p/WUQWQAxMS1IHWk8BAE0IVFIeUwACW14`
const DUB_STREAM = `${SITE}/p/WUQWQEVZS0xJAg9dThBLBVUeDUtTTgtcU`
const XANIME_STREAM = `${SITE}/p/WUQWQE6yX2tJAg9dThBLBVUeDUtTTgt`
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\n/variant.m3u8\n'

type Route = { status: number; text: string; acao?: string | null }
type Call = { url: string; headers: Record<string, string>; init?: ProviderHttpRequest | undefined }

function lane(lane: string) {
  return `${SITE}/api/anime/${lane}-servers/21/1`
}
function servers(entries: unknown[]): Route {
  return { status: 200, text: JSON.stringify({ servers: entries }) }
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

describe('LuffyTV adapter', () => {
  it('resolves a bare /p/ stream with captions and skip marks, filtering other audio', async () => {
    const { http, calls } = fixture({
      [lane('anipm')]: servers([
        {
          id: 's1', name: 'AniPM', source: 'anipm', provider: 'anipm', type: 'sub', quality: '1080p',
          streamUrl: '/p/WUQWQAxMS1IHWk8BAE0IVFIeUwACW14', isM3U8: true, hardsub: false,
          subtitleTracks: [{ url: '/subs/eng-2.vtt', lang: 'en', label: 'English' }],
          intro: { start: 112, end: 197 }, outro: { start: 1344, end: 1434 },
        },
        { id: 's2', name: 'AniPM Dub', source: 'anipm', type: 'dub', quality: '1080p', streamUrl: '/p/WUQWQEVZS0xJAg9dThBLBVUeDUtTTgtcU', isM3U8: true },
      ]),
      [SUB_STREAM]: { status: 200, text: PLAYLIST },
    })
    const provider = createLuffytvProvider(http, now)
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
    const result = await provider.resolve(sub, new AbortController().signal)
    expect(calls[0]?.url).toBe(lane('anipm'))
    expect(calls[0]?.headers).toMatchObject({ accept: 'application/json', referer: `${SITE}/` })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      key: 'luffytv:anipm:sub:1:0',
      url: SUB_STREAM,
      type: 'hls',
      headers: {},
      expiresAt: '2026-10-16T00:05:00.000Z',
      language: 'original',
      qualityHint: '1080p',
      subtitles: [
        { id: 'luffytv-sub-0', label: 'English', language: 'en', url: `${SITE}/subs/eng-2.vtt`, format: 'vtt' },
      ],
      skipSegments: [
        { kind: 'intro', start: 112, end: 197 },
        { kind: 'outro', start: 1344, end: 1434 },
      ],
    })
  })

  it('keeps only the dub-typed server for an explicit English preference', async () => {
    const { http, calls } = fixture({
      [lane('anipm')]: servers([
        { source: 'anipm', type: 'sub', streamUrl: '/p/WUQWQAxMS1IHWk8BAE0IVFIeUwACW14', isM3U8: true },
        { source: 'anipm', type: 'dub', streamUrl: '/p/WUQWQEVZS0xJAg9dThBLBVUeDUtTTgtcU', isM3U8: true },
      ]),
      [DUB_STREAM]: { status: 200, text: PLAYLIST },
    })
    const result = await createLuffytvProvider(http, now).resolve(dub, new AbortController().signal)
    expect(calls[0]?.url).toBe(lane('anipm'))
    expect(result.ok && result.sources).toMatchObject([{ url: DUB_STREAM, language: 'en' }])
  })

  it('answers empty when every lane 404s', async () => {
    const { http, calls } = fixture({})
    expect(await createLuffytvProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
    expect(calls.map((call) => call.url)).toEqual(LANES.map(lane))
  })

  it('reports a malformed payload when every lane answers unparseable JSON', async () => {
    const malformed: Route = { status: 200, text: '<html>upstream exploded</html>' }
    const { http } = fixture(Object.fromEntries(LANES.map((name) => [lane(name), malformed])))
    expect(await createLuffytvProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'malformed' })
  })

  it('falls through to the next lane when the first lane is dead', async () => {
    const { http, calls } = fixture({
      [lane('xanime')]: servers([{ source: 'xanime', type: 'sub', streamUrl: '/p/WUQWQE6yX2tJAg9dThBLBVUeDUtTTgt', isM3U8: true }]),
      [XANIME_STREAM]: { status: 200, text: PLAYLIST },
    })
    const result = await createLuffytvProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: XANIME_STREAM, key: 'luffytv:xanime:sub:1:0' }] })
    expect(calls.filter((call) => call.url.includes('-servers/'))).toHaveLength(LANES.length)
  })

  it('drops a lane whose stream fails the manifest gate', async () => {
    const { http } = fixture({
      [lane('anipm')]: servers([{ source: 'anipm', type: 'sub', streamUrl: '/p/WUQWQAxMS1IHWk8BAE0IVFIeUwACW14', isM3U8: true }]),
      [lane('xanime')]: servers([{ source: 'xanime', type: 'sub', streamUrl: '/p/WUQWQE6yX2tJAg9dThBLBVUeDUtTTgt', isM3U8: true }]),
      [XANIME_STREAM]: { status: 200, text: PLAYLIST },
    })
    const result = await createLuffytvProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: XANIME_STREAM }] })
    if (!result.ok) return
    expect(result.sources).toHaveLength(1)
  })

  it('answers empty when every candidate is rejected by the gate', async () => {
    const { http } = fixture({
      [lane('anipm')]: servers([{ source: 'anipm', type: 'sub', streamUrl: '/p/WUQWQAxMS1IHWk8BAE0IVFIeUwACW14', isM3U8: true }]),
    })
    expect(await createLuffytvProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
  })

  it('rejects refs LuffyTV cannot address', async () => {
    const { http } = fixture({})
    expect(await createLuffytvProvider(http, now).resolve(
      { ...sub, ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 } },
      new AbortController().signal,
    )).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
