import { describe, expect, it, vi } from 'vitest'
import { providerSourceSchema } from '../index.ts'
import { userAgent, type ProviderHttp } from './http.ts'
import { createJustanimeProvider } from './justanime.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const EXPIRES_AT = '2026-10-16T00:05:00.000Z'
const sub = { ref: { kind: 'anime' as const, id: 19, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const resolveTitle = vi.fn(async () => 'Death Note')
const PLAYLIST = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'

type Body = { status?: number; text: string }
type Call = { url: string; headers: Record<string, string>; init?: unknown }

function fixture(options: {
  servers?: Body
  watch?: Record<string, Body>
  media?: Record<string, Body>
  fallback?: Body
} = {}) {
  const calls: Call[] = []
  const respond = (url: string, body: Body | undefined) => ({ url, status: body?.status ?? 200, text: body?.text ?? '' })
  const miss = () => options.fallback ?? { status: 404, text: '' }
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    const parsed = new URL(url)
    if (parsed.hostname === 'core.justanime.to') {
      const servers = /^\/api\/watch\/\d+\/episode\/\d+\/servers$/.exec(parsed.pathname)
      if (servers) return respond(url, options.servers ?? miss())
      const watch = /^\/api\/watch\/\d+\/episode\/\d+\/([^/]+)$/.exec(parsed.pathname)
      if (watch) return respond(url, options.watch?.[watch[1]!] ?? miss())
    }
    return respond(url, options.media?.[url] ?? { status: 404, text: '' })
  })
  return { http, calls }
}

function serversBody(map: Record<string, unknown>): Body {
  return { text: JSON.stringify({ servers: map }) }
}

function payloadBody(block: Record<string, unknown> | null, dubBlock?: Record<string, unknown>) {
  return JSON.stringify({ sub: block ?? {}, ...(dubBlock ? { dub: dubBlock } : {}) })
}

describe('JustAnime adapter', () => {
  it('resolves the preferred active server through the core API', async () => {
    const mediaUrl = 'https://echovideo.example/nami/master.m3u8'
    const { http, calls } = fixture({
      servers: serversBody({ nami: { sub: true, dub: true }, revo: { sub: true } }),
      watch: { nami: { text: payloadBody({
        sources: [{ url: mediaUrl, quality: '1080p', isM3U8: true, headers: { Referer: 'https://echovideo.example/', 'X-Trace': 'drop-me' } }],
        subtitles: [
          { url: 'https://subs.example/en.vtt', label: 'English' },
          { url: 'https://subs.example/thumbs.jpg', kind: 'thumbnails' },
          { url: 'https://subs.example/en.ass', name: 'English.ass' },
        ],
      }) } },
      media: { [mediaUrl]: { text: PLAYLIST } },
    })
    const result = await createJustanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected sources')
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      key: 'justanime:nami:sub:1:0',
      url: mediaUrl,
      type: 'hls',
      headers: { 'user-agent': userAgent, referer: 'https://echovideo.example/' },
      expiresAt: EXPIRES_AT,
      language: 'original',
      qualityHint: '1080p',
      subtitles: [
        { id: 'justanime-sub-0', url: 'https://subs.example/en.vtt', format: 'vtt' },
        { id: 'justanime-sub-1', url: 'https://subs.example/en.ass', format: 'ass' },
      ],
    })
    expect(result.sources[0]?.headers).not.toHaveProperty('x-trace')
    providerSourceSchema.parse(result.sources[0])
    expect(calls[0]?.url).toBe('https://core.justanime.to/api/watch/19/episode/1/servers')
    expect(calls[0]?.headers).toMatchObject({
      'user-agent': userAgent,
      accept: 'application/json',
      origin: 'https://justanime.to',
      referer: 'https://justanime.to/',
    })
    expect(calls.map((call) => call.url)).toContain('https://core.justanime.to/api/watch/19/episode/1/nami')
    expect(resolveTitle).not.toHaveBeenCalled()
  })
  it('prefers the dub block for an explicit English audio preference', async () => {
    const subUrl = 'https://echovideo.example/nami/sub.m3u8'
    const dubUrl = 'https://echovideo.example/nami/dub.m3u8'
    const { http, calls } = fixture({
      servers: serversBody({ nami: { sub: true, dub: true } }),
      watch: { nami: { text: payloadBody(
        { sources: [{ url: subUrl, isM3U8: true }], subtitles: [] },
        { sources: [{ url: dubUrl, isM3U8: true }], subtitles: [] },
      ) } },
      media: { [dubUrl]: { text: PLAYLIST } },
    })
    const result = await createJustanimeProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'justanime:nami:dub:1:0', url: dubUrl, language: 'en' }] })
    expect(calls.some((call) => call.url === subUrl)).toBe(false)
  })
  it('skips a dead first server and takes the next active one', async () => {
    const dead = 'https://echovideo.example/nami/dead.m3u8'
    const live = 'https://core.justanime.to/api/hls/revo/master.m3u8'
    const { http, calls } = fixture({
      servers: serversBody({ nami: { sub: true }, revo: { sub: true } }),
      watch: {
        nami: { text: payloadBody({ sources: [{ url: dead, isM3U8: true }], subtitles: [] }) },
        revo: { text: payloadBody({ sources: [{ url: live, isM3U8: true }], subtitles: [] }) },
      },
      media: { [live]: { text: PLAYLIST } },
    })
    const result = await createJustanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'justanime:revo:sub:1:0', url: live }] })
    expect(calls.filter((call) => call.url.includes('/episode/1/')).map((call) => call.url)).toEqual([
      'https://core.justanime.to/api/watch/19/episode/1/servers',
      'https://core.justanime.to/api/watch/19/episode/1/nami',
      'https://core.justanime.to/api/watch/19/episode/1/revo',
    ])
  })
  it('returns each playable server so Watch can offer provider failover choices', async () => {
    const nami = 'https://echovideo.example/nami/master.m3u8'
    const revo = 'https://echovideo.example/revo/master.m3u8'
    const { http } = fixture({
      servers: serversBody({ nami: { sub: true }, revo: { sub: true } }),
      watch: {
        nami: { text: payloadBody({ sources: [{ url: nami, isM3U8: true }], subtitles: [] }) },
        revo: { text: payloadBody({ sources: [{ url: revo, isM3U8: true }], subtitles: [] }) },
      },
      media: { [nami]: { text: PLAYLIST }, [revo]: { text: PLAYLIST } },
    })
    const result = await createJustanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { serverName: 'nami', url: nami },
      { serverName: 'revo', url: revo },
    ] })
  })
  it('returns empty when every server misses', async () => {
    const { http, calls } = fixture()
    expect(await createJustanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.some((call) => call.url === 'https://core.justanime.to/api/watch/19/episode/1/momo')).toBe(true)
  })
  it('maps an unparseable server payload to malformed', async () => {
    const { http } = fixture({ fallback: { status: 200, text: '<html>not json</html>' } })
    expect(await createJustanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('falls over to the dub block when a server only ships sub', async () => {
    const subUrl = 'https://core.justanime.to/api/hls/calm/master.m3u8'
    const { http } = fixture({
      servers: serversBody({ calm: { sub: true } }),
      watch: { calm: { text: payloadBody({ sources: [{ url: subUrl, isM3U8: true }], subtitles: [] }) } },
      media: { [subUrl]: { text: PLAYLIST } },
    })
    const result = await createJustanimeProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'justanime:calm:dub:1:0', url: subUrl, language: 'en' }] })
  })
  it('aborts cleanly before any fetch', async () => {
    const { http } = fixture()
    expect(await createJustanimeProvider(http, resolveTitle, now).resolve(sub, AbortSignal.abort())).toMatchObject({ ok: false, code: 'cancelled' })
    expect(http).not.toHaveBeenCalled()
  })
})
