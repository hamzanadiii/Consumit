import { describe, expect, it, vi } from 'vitest'
import { createYumezoneFrameProvider, createYumezoneProvider, sealYumePayload, yumeLaneSig } from './yumezone.ts'
import type { ProviderHttp, ProviderHttpRequest } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const TS = Math.floor(now() / 1000)
const sub = { ref: { kind: 'anime' as const, id: 19, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\n/p/abc/variant.m3u8\n'

const API = 'https://yumezone.live/api/yume/watch/sources'
const SIG = yumeLaneSig('19', 1, TS)

function laneBody(payload: unknown) {
  return JSON.stringify({ ct: sealYumePayload(payload, SIG) })
}

const HLS_LANE = {
  video_link: '/p/abc/master.m3u8',
  source_type: 'hls',
  hls_sources: [{ file: '/p/abc/master.m3u8' }],
  subtitles: [{ file: '/p/abc/en.vtt', lang: 'en', label: 'English' }],
}
const EMBED_LANE = {
  video_link: 'https://ani.pm/e/xyz',
  source_type: 'embed',
  embed_sources: [{ url: 'https://ani.pm/e/xyz', name: 'Dexter' }],
}

type Call = { url: string; headers: Record<string, string>; init?: ProviderHttpRequest | undefined }

function fixture(options: {
  lanes?: { status?: number; body?: string }[]
  masters?: Record<string, { status: number; text: string }>
} = {}) {
  const laneQueue = [...(options.lanes ?? [])]
  const masters = options.masters ?? {}
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    if (url === API) {
      const entry = laneQueue.shift()
      if (!entry) return { url, status: 404, text: '', headers: new Headers() }
      return { url, status: entry.status ?? 200, text: entry.body ?? '', headers: new Headers() }
    }
    const entry = masters[url] ?? { status: 404, text: '' }
    return { url, status: entry.status, text: entry.text, headers: new Headers() }
  })
  return { http, calls }
}

const HLS_OK = { status: 200, text: PLAYLIST }

describe('YumeZone adapter', () => {
  it('decrypts a signed lane and returns verified HLS plus an iframe source with soft subtitles', async () => {
    const { http, calls } = fixture({
      lanes: [
        { body: laneBody(HLS_LANE) },
        { body: laneBody(EMBED_LANE) },
        { status: 404 },
      ],
      masters: { 'https://yumezone.live/p/abc/master.m3u8': HLS_OK },
    })
    const result = await createYumezoneProvider(http, now).resolve(sub, new AbortController().signal)
    expect(calls[0]?.url).toBe(API)
    expect(calls[0]?.headers).toMatchObject({
      origin: 'https://yumezone.live',
      referer: 'https://yumezone.live/watch/19/1',
      'content-type': 'application/json',
    })
    const body = JSON.parse(String(calls[0]!.init!.body))
    expect(body).toMatchObject({ anime_id: '19', episode_number: 1, language: 'sub', provider: 'Karl', ts: TS, sig: SIG })
    expect(Buffer.from(String(body.client_cipher_token), 'base64').toString('latin1')).toBe([...SIG].reverse().join(''))
    expect(result).toMatchObject({
      ok: true,
      sources: [
        {
          key: expect.stringContaining('yumezone:karl:sub:1'),
          url: 'https://yumezone.live/p/abc/master.m3u8',
          type: 'hls',
          headers: {},
          expiresAt: new Date(now() + 300_000).toISOString(),
          language: 'original',
          qualityHint: 'Auto',
          subtitles: [{ id: 'yumezone-sub-0', label: 'English', language: 'English', url: 'https://yumezone.live/p/abc/en.vtt', format: 'vtt' }],
        },
        {
          key: expect.stringContaining('yumezone:dexter:embed:1'),
          url: 'https://ani.pm/e/xyz',
          type: 'iframe',
          headers: {},
          subtitles: [],
        },
      ],
    })
    // The HLS root got a liveness probe through the gate; the iframe never does.
    expect(calls.some((call) => call.url === 'https://yumezone.live/p/abc/master.m3u8')).toBe(true)
    expect(calls.some((call) => call.url === 'https://ani.pm/e/xyz')).toBe(false)
  })
  it('requests the dub lanes first for an explicit English preference', async () => {
    const { http, calls } = fixture({
      lanes: [
        { body: laneBody({ ...HLS_LANE, video_link: '/p/dub/master.m3u8', hls_sources: [{ file: '/p/dub/master.m3u8' }] }) },
        { status: 404 },
      ],
      masters: { 'https://yumezone.live/p/dub/master.m3u8': HLS_OK },
    })
    const result = await createYumezoneProvider(http, now).resolve(dub, new AbortController().signal)
    const bodies = calls.filter((call) => call.url === API).map((call) => JSON.parse(String(call.init!.body)))
    expect(bodies[0]?.language).toBe('dub')
    expect(result.ok && result.sources[0]?.language).toBe('en')
  })
  it('falls back from dub lanes to sub lanes and labels the served audio', async () => {
    const { http, calls } = fixture({
      lanes: [
        ...Array.from({ length: 8 }, () => ({ status: 404 })),
        { body: laneBody(HLS_LANE) },
        { status: 404 },
      ],
      masters: { 'https://yumezone.live/p/abc/master.m3u8': HLS_OK },
    })
    const result = await createYumezoneProvider(http, now).resolve(dub, new AbortController().signal)
    const bodies = calls.filter((call) => call.url === API).map((call) => JSON.parse(String(call.init!.body)))
    expect(bodies.slice(0, 8).every((body) => body.language === 'dub')).toBe(true)
    expect(bodies[8]?.language).toBe('sub')
    expect(result.ok && result.sources[0]?.url).toBe('https://yumezone.live/p/abc/master.m3u8')
  })
  it('answers empty when every lane is missing', async () => {
    const { http } = fixture({ lanes: Array.from({ length: 8 }, () => ({ status: 404 })) })
    expect(await createYumezoneProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when the cipher cannot be decrypted', async () => {
    const { http } = fixture({ lanes: [{ body: JSON.stringify({ ct: 'AAAA' }) }] })
    expect(await createYumezoneProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when lanes return malformed payloads', async () => {
    const { http } = fixture({ lanes: [{ body: 'not-json' }, { body: JSON.stringify({ success: false }) }] })
    expect(await createYumezoneProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('drops the HLS lane at the gate when its master is dead', async () => {
    const { http } = fixture({
      lanes: [{ body: laneBody(HLS_LANE) }, { status: 404 }],
      masters: { 'https://yumezone.live/p/abc/master.m3u8': { status: 403, text: '<html>nope</html>' } },
    })
    expect(await createYumezoneProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('keeps only the iframe source when the HLS master fails the gate', async () => {
    const { http } = fixture({
      lanes: [{ body: laneBody({ ...HLS_LANE, subtitles: [] }) }, { body: laneBody(EMBED_LANE) }],
      masters: {},
    })
    const result = await createYumezoneProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://ani.pm/e/xyz', type: 'iframe' }] })
  })
  it('rejects non-anime refs before any upstream work', async () => {
    const { http } = fixture()
    const provider = createYumezoneProvider(http, now)
    expect(await provider.resolve({ ...sub, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(await provider.resolve({ ...sub, ref: { kind: 'anime' as const, id: 19, episode: 0 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    expect(http).not.toHaveBeenCalled()
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
  })
})

describe('YumeZone frame adapter', () => {
  it('returns only iframe sources with frameSandbox and skips HLS lanes', async () => {
    const { http, calls } = fixture({
      lanes: [
        { body: laneBody(EMBED_LANE) },
      ],
      masters: { 'https://yumezone.live/p/abc/master.m3u8': HLS_OK },
    })
    const result = await createYumezoneFrameProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      sources: [
        {
          key: expect.stringContaining('yumezoneframe:dexter:sub:1'),
          url: 'https://ani.pm/e/xyz',
          type: 'iframe',
          frameSandbox: 'none',
          headers: {},
          subtitles: [],
        },
      ],
    })
    // The frame adapter never probes HLS masters.
    expect(calls.some((call) => call.url === 'https://yumezone.live/p/abc/master.m3u8')).toBe(false)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ provider: 'Dexter', language: 'sub', anime_id: '19', episode_number: 1 })
  })
  it('rejects ReAnime/Flixcloud even when the Dexter response supplies it', async () => {
    const { http } = fixture({
      lanes: [
        { body: laneBody({ ...HLS_LANE, embed_sources: [{ url: 'https://flixcloud.cc/e/abc', name: 'Karl' }] }) },
        { status: 404 },
      ],
      masters: {},
    })
    const result = await createYumezoneFrameProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it.each(['https://ani.pm.evil.test/e/xyz', 'https://user:pass@ani.pm/e/xyz', 'http://ani.pm/e/xyz', 'https://ani.pm:8443/e/xyz', 'https://ani.pm/other/xyz'])('rejects a hostile frame URL: %s', async url => {
    const { http } = fixture({ lanes: [{ body: laneBody({ ...EMBED_LANE, video_link: url, embed_sources: [{ url }] }) }] })
    expect(await createYumezoneFrameProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('does not replace an unavailable dub with Japanese audio', async () => {
    const { http, calls } = fixture({ lanes: [{ status: 404 }, { body: laneBody(EMBED_LANE) }] })
    expect(await createYumezoneFrameProvider(http, now).resolve(dub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ provider: 'Dexter', language: 'dub' })
  })
  it('publishes the requested English lane without probing the player page', async () => {
    const { http, calls } = fixture({ lanes: [{ body: laneBody(EMBED_LANE) }] })
    expect(await createYumezoneFrameProvider(http, now).resolve(dub, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ language: 'en', url: 'https://ani.pm/e/xyz' }] })
    expect(calls).toHaveLength(1)
  })
  it.each([sub, dub])('accepts the current exact AniPM anime/episode/audio route', async input => {
    const url = `https://ani.pm/embed/ani/19/1/${input.audioLanguage === 'en' ? 'dub' : 'sub'}?hardsub=true&autoplay=true`
    const { http } = fixture({ lanes: [{ body: laneBody({ ...EMBED_LANE, video_link: url, embed_sources: [] }) }] })
    expect(await createYumezoneFrameProvider(http, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ url }] })
  })
  it.each(['/embed/ani/20/1/sub', '/embed/ani/19/2/sub', '/embed/ani/19/1/dub'])('rejects a different title/episode/audio route: %s', async path => {
    const { http } = fixture({ lanes: [{ body: laneBody({ ...EMBED_LANE, video_link: `https://ani.pm${path}`, embed_sources: [] }) }] })
    expect(await createYumezoneFrameProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when no lane carries an embed source', async () => {
    const { http } = fixture({
      lanes: [{ body: laneBody(HLS_LANE) }, { status: 404 }],
      masters: {},
    })
    expect(await createYumezoneFrameProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('rejects non-anime refs before any upstream work', async () => {
    const { http } = fixture()
    const provider = createYumezoneFrameProvider(http, now)
    expect(await provider.resolve({ ...sub, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
  })
})
