import { describe, expect, it, vi } from 'vitest'
import { createAnicloverProvider } from './aniclover.ts'
import { isRelayMediaUrl } from '../index.ts'
import type { ProviderHttp, ProviderHttpRequest } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }

const SITE = 'https://aniclover.cc'
const API = 'https://api.aniclover.cc'
const WATCH_SUB = `${API}/api/watch/21/sub/1`
const WATCH_DUB = `${API}/api/watch/21/dub/1`
const WRAPPED = 'https://beta.zanora.xyz/m3u8-proxy?url=QUJDREVGR0g'
const PLAIN = 'https://beta.zanora.xyz/plain/abc/master.m3u8'
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\n/variant.m3u8\n'

type Route = { status: number; text: string; acao?: string | null }
type Call = { url: string; headers: Record<string, string>; init?: ProviderHttpRequest | undefined }

function payload(streams: unknown[], subtitles: unknown[] = []): Route {
  return { status: 200, text: JSON.stringify({ success: true, provider: 'zoro', server: 'HD1', streams, subtitles }) }
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

describe('Aniclover adapter', () => {
  it('resolves the wrapped zanora stream, which the relay guard flags as a proxy', async () => {
    const { http, calls } = fixture({
      [WATCH_SUB]: payload(
        [{ label: '1080p', type: 'hls', url: WRAPPED }],
        [{ label: 'English', lang: 'en', url: 'https://subtitle.aniclover.cc/1/eng.vtt' }],
      ),
      [WRAPPED]: { status: 200, text: PLAYLIST },
    })
    const provider = createAnicloverProvider(http, now)
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
    const result = await provider.resolve(sub, new AbortController().signal)
    expect(calls[0]).toMatchObject({
      url: WATCH_SUB,
      headers: {
        accept: 'application/json',
        origin: SITE,
        referer: `${SITE}/`,
        'user-agent': expect.any(String),
      },
    })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      key: 'aniclover:zoro:sub:1:0',
      url: WRAPPED,
      type: 'hls',
      headers: { origin: SITE, referer: `${SITE}/` },
      expiresAt: '2026-10-16T00:05:00.000Z',
      language: 'original',
      qualityHint: 'Auto',
      subtitles: [
        { id: 'aniclover-sub-0', label: 'English', language: 'en', url: 'https://subtitle.aniclover.cc/1/eng.vtt', format: 'vtt' },
      ],
    })
    expect(isRelayMediaUrl(result.sources[0]!.url)).toBe(true)
  })

  it('uses the dub track for an explicit English preference', async () => {
    const { http, calls } = fixture({
      [WATCH_DUB]: payload([{ label: '1080p', type: 'hls', url: WRAPPED }]),
      [WRAPPED]: { status: 200, text: PLAYLIST },
    })
    const result = await createAnicloverProvider(http, now).resolve(dub, new AbortController().signal)
    expect(calls[0]?.url).toBe(WATCH_DUB)
    expect(result.ok && result.sources[0]).toMatchObject({ key: 'aniclover:zoro:dub:1:0', language: 'en' })
  })

  it('answers empty when the watch endpoint 404s', async () => {
    const { http, calls } = fixture({})
    expect(await createAnicloverProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
    expect(calls).toHaveLength(1)
  })

  it('answers empty when the API reports failure without streams', async () => {
    const { http } = fixture({ [WATCH_SUB]: { status: 200, text: JSON.stringify({ success: false, streams: [] }) } })
    expect(await createAnicloverProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
  })

  it('reports a malformed payload when the watch body will not parse', async () => {
    const { http, calls } = fixture({ [WATCH_SUB]: { status: 200, text: '<html>oops</html>' } })
    expect(await createAnicloverProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'malformed' })
    expect(calls).toHaveLength(1)
  })

  it('answers empty when the only stream fails the manifest gate', async () => {
    const { http } = fixture({
      [WATCH_SUB]: payload([{ label: '1080p', type: 'hls', url: PLAIN }]),
      [PLAIN]: { status: 404, text: '' },
    })
    expect(await createAnicloverProvider(http, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
  })

  it('keeps at most eight distinct streams in declared order', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      label: `${index}p`, type: 'hls', url: `${PLAIN.replace('master', `m${index}`)}`,
    }))
    const routes: Record<string, Route> = {
      [WATCH_SUB]: payload(many),
      ...Object.fromEntries(many.map((stream) => [stream.url, { status: 200, text: PLAYLIST }])),
    }
    const { http } = fixture(routes)
    const result = await createAnicloverProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result.ok && result.sources).toHaveLength(8)
    expect(result.ok && result.sources.map((source) => source.url)).toEqual(many.slice(0, 8).map((stream) => stream.url))
  })

  it('rejects refs Aniclover cannot address', async () => {
    const { http } = fixture({})
    expect(await createAnicloverProvider(http, now).resolve(
      { ...sub, ref: { kind: 'movie' as const, id: 155 } },
      new AbortController().signal,
    )).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
