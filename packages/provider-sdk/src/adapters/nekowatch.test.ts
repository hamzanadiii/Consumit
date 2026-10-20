import { describe, expect, it, vi } from 'vitest'
import { providerSourceSchema } from '../index.ts'
import type { ProviderHttp } from './http.ts'
import { userAgent } from './http.ts'
import { createNekowatchProvider } from './nekowatch.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const EXPIRES_AT = '2026-10-16T00:05:00.000Z'
const sub = { ref: { kind: 'anime' as const, id: 19, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const resolveTitle = vi.fn(async () => 'Death Note')
const PLAYLIST = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'

type Body = { status?: number; text: string }
type Call = { url: string; headers: Record<string, string>; init?: unknown }

function fixture(options: {
  episodes?: Record<string, Body>
  watch?: Record<string, Body>
  media?: Record<string, Body>
  fallback?: Body
} = {}) {
  const calls: Call[] = []
  const respond = (url: string, body: Body | undefined) => ({ url, status: body?.status ?? 200, text: body?.text ?? '' })
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    const parsed = new URL(url)
    if (parsed.hostname === 'nekowatch.xyz') {
      const episodes = /^\/api\/anime\/episodes\/([^/]+)\//.exec(parsed.pathname)
      if (episodes) return respond(url, options.episodes?.[episodes[1]!] ?? options.fallback ?? { status: 404, text: '' })
      const watch = /^\/api\/anime\/watch\/([^/]+)\//.exec(parsed.pathname)
      if (watch) return respond(url, options.watch?.[watch[1]!] ?? options.fallback ?? { status: 404, text: '' })
    }
    return respond(url, options.media?.[url] ?? { status: 404, text: '' })
  })
  return { http, calls }
}

function episodesBody(key: string, list: Record<string, unknown[]>) {
  return JSON.stringify({ [key]: { meta: { id: 19 }, episodes: list } })
}

function watchBody(streams: unknown[], subtitles: unknown[] = []) {
  return JSON.stringify({ streams, subtitles })
}

describe('NekoWatch adapter', () => {
  it('resolves the first provider key through the origin-gated API', async () => {
    const mediaUrl = 'https://echovideo.example/hls/master.m3u8'
    const { http, calls } = fixture({
      episodes: { aniwaves: { text: episodesBody('aniwaves', { sub: [{ number: 1 }] }) } },
      watch: { nami: { text: watchBody(
        [{ kind: 'hls', url: mediaUrl, quality: '1080p' }],
        [{ url: 'https://subs.example/en.vtt', label: 'English' }],
      ) } },
      media: { [mediaUrl]: { text: PLAYLIST } },
    })
    const result = await createNekowatchProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected sources')
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      key: 'nekowatch:aniwaves:sub:1:0',
      url: mediaUrl,
      type: 'hls',
      headers: { 'user-agent': userAgent },
      expiresAt: EXPIRES_AT,
      language: 'original',
      qualityHint: '1080p',
      subtitles: [{ id: 'nekowatch-sub-0', label: 'English', language: 'english', url: 'https://subs.example/en.vtt', format: 'vtt' }],
    })
    providerSourceSchema.parse(result.sources[0])
    expect(JSON.stringify(result)).not.toContain('proxy/hls')
    expect(calls[0]?.url).toBe('https://nekowatch.xyz/api/anime/episodes/aniwaves/19?map=false')
    expect(calls[0]?.headers).toMatchObject({
      'user-agent': userAgent,
      accept: 'application/json',
      'x-requested-with': 'NekoWatch',
      origin: 'https://nekowatch.xyz',
      referer: 'https://nekowatch.xyz/',
    })
    expect(calls.map((call) => call.url)).toContain('https://nekowatch.xyz/api/anime/watch/nami/19/sub/nami-1')
    // Numeric AniList ids pass through; the title resolver stays unused.
    expect(resolveTitle).not.toHaveBeenCalled()
  })
  it('requests the dub lane for an explicit English audio preference', async () => {
    const mediaUrl = 'https://echovideo.example/hls/dub.m3u8'
    const { http, calls } = fixture({
      episodes: { aniwaves: { text: episodesBody('aniwaves', { dub: [{ number: 1 }] }) } },
      watch: { nami: { text: watchBody([{ kind: 'hls', url: mediaUrl }]) } },
      media: { [mediaUrl]: { text: PLAYLIST } },
    })
    const result = await createNekowatchProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)
    expect(calls.map((call) => call.url)).toContain('https://nekowatch.xyz/api/anime/watch/nami/19/dub/nami-1')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'nekowatch:aniwaves:dub:1:0', language: 'en' }] })
  })
  it('unwraps proxy-wrapped streams and subtitles to bare upstream targets', async () => {
    const bare = 'https://upstream.example/hls/master.m3u8'
    const wrapped = `https://nekowatch.xyz/proxy/hls?url=${encodeURIComponent(bare)}`
    const wrappedSub = `https://nekowatch.xyz/proxy/hls?url=${encodeURIComponent('https://subs.example/ko.ass')}`
    const { http } = fixture({
      episodes: { aniwaves: { text: episodesBody('aniwaves', { sub: [{ number: 1 }] }) } },
      watch: { nami: { text: watchBody([{ kind: 'hls', url: wrapped }], [{ url: wrappedSub, label: 'Korean' }]) } },
      media: { [bare]: { text: PLAYLIST } },
    })
    const result = await createNekowatchProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{
      url: bare,
      type: 'hls',
      headers: { 'user-agent': userAgent, referer: 'https://nekowatch.xyz/' },
      subtitles: [{ url: 'https://subs.example/ko.ass', format: 'ass' }],
    }] })
    expect(JSON.stringify(result)).not.toContain('proxy/hls')
    expect(JSON.stringify(result)).not.toContain('url=')
  })
  it('never ships a proxy wrapper that cannot be unwrapped', async () => {
    const { http } = fixture({
      episodes: { aniwaves: { text: episodesBody('aniwaves', { sub: [{ number: 1 }] }) } },
      watch: { nami: { text: watchBody([{ kind: 'hls', url: 'https://nekowatch.xyz/proxy/hls?x=1' }]) } },
    })
    const result = await createNekowatchProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(JSON.stringify(result)).not.toContain('proxy/hls')
  })
  it('skips a dead first key and takes the next provider in order', async () => {
    const dead = 'https://echovideo.example/hls/dead.m3u8'
    const live = 'https://flix.example/live/master.m3u8'
    const { http, calls } = fixture({
      episodes: {
        aniwaves: { text: episodesBody('aniwaves', { sub: [{ number: 1 }] }) },
        reanime: { text: episodesBody('reanime', { sub: [{ number: 1 }] }) },
      },
      watch: {
        nami: { text: watchBody([{ kind: 'hls', url: dead }]) },
        konbanwa: { text: watchBody([{ kind: 'hls', url: live }]) },
      },
      media: { [live]: { text: PLAYLIST } },
    })
    const result = await createNekowatchProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'nekowatch:reanime:sub:1:0', url: live }] })
    expect(calls.filter((call) => call.url.includes('/episodes/')).map((call) => call.url)).toEqual([
      'https://nekowatch.xyz/api/anime/episodes/aniwaves/19?map=false',
      'https://nekowatch.xyz/api/anime/episodes/reanime/19?map=false',
      'https://nekowatch.xyz/api/anime/episodes/animegg/19?map=false',
      'https://nekowatch.xyz/api/anime/episodes/animenosub/19?map=false',
      'https://nekowatch.xyz/api/anime/episodes/kaa/19?map=false',
      'https://nekowatch.xyz/api/anime/episodes/miruro/19?map=false',
      'https://nekowatch.xyz/api/anime/episodes/mkissa/19?map=false',
    ])
  })
  it('returns each playable upstream server as a separate choice', async () => {
    const aniwavesUrl = 'https://echovideo.example/aniwaves/master.m3u8'
    const reanimeUrl = 'https://flix.example/reanime/master.m3u8'
    const { http } = fixture({
      episodes: {
        aniwaves: { text: episodesBody('aniwaves', { sub: [{ number: 1 }] }) },
        reanime: { text: episodesBody('reanime', { sub: [{ number: 1 }] }) },
      },
      watch: {
        nami: { text: watchBody([{ kind: 'hls', url: aniwavesUrl }]) },
        konbanwa: { text: watchBody([{ kind: 'hls', url: reanimeUrl }]) },
      },
      media: {
        [aniwavesUrl]: { text: PLAYLIST },
        [reanimeUrl]: { text: PLAYLIST },
      },
    })
    const result = await createNekowatchProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { serverName: 'aniwaves', url: aniwavesUrl },
      { serverName: 'reanime', url: reanimeUrl },
    ] })
  })
  it('returns empty when every provider key 404s', async () => {
    const { http, calls } = fixture()
    expect(await createNekowatchProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.some((call) => call.url.includes('/episodes/mkissa/19'))).toBe(true)
  })
  it('maps an unparseable API body to malformed', async () => {
    const { http } = fixture({ fallback: { status: 200, text: '<html>not json</html>' } })
    expect(await createNekowatchProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('rejects an address NekoWatch cannot serve before fetching', async () => {
    const { http } = fixture()
    expect(await createNekowatchProvider(http, resolveTitle, now).resolve({ ...sub, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
  it('aborts cleanly mid-cascade', async () => {
    const { http } = fixture()
    expect(await createNekowatchProvider(http, resolveTitle, now).resolve(sub, AbortSignal.abort())).toMatchObject({ ok: false, code: 'cancelled' })
    expect(http).not.toHaveBeenCalled()
  })
})
