import { Buffer } from 'node:buffer'
import { createCipheriv, createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { providerSourceSchema } from '../index.ts'
import { userAgent, type ProviderHttp } from './http.ts'
import { createAnimedexProvider } from './animedex.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const EXPIRES_AT = '2026-10-16T00:05:00.000Z'
const sub = { ref: { kind: 'anime' as const, id: 19, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const PLAYLIST = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'

// Mirror of the published vidnest bundle secret; the fixture re-encrypts with
// the same chain so the adapter's decrypt path is exercised end to end.
const SECRET = 'F9k2mR8vL4qP7wY1zN0fG3bS6tH5jC8d_x4R7vN2mP9qL1'

function envelope(payload: unknown): string {
  const n = '0123456789abcdef'
  const key = createHash('sha256').update(`${n}|${SECRET}`).digest()
  const iv = Buffer.alloc(12, 7)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plain = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return JSON.stringify({ v: 2, d: Buffer.concat([iv, plain, cipher.getAuthTag()]).toString('base64url'), n })
}

type Body = { status?: number; text: string }
type LaneBodies = { anitaku?: Body; aniwave?: Body }
type Call = { url: string; headers: Record<string, string>; init?: unknown }

function fixture(options: {
  sub?: LaneBodies
  dub?: LaneBodies
  embed?: Body
  media?: Record<string, Body>
} = {}) {
  const calls: Call[] = []
  const respond = (url: string, body: Body | undefined) => ({ url, status: body?.status ?? 200, text: body?.text ?? '' })
  const miss = (): Body => ({ status: 404, text: '' })
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    const parsed = new URL(url)
    if (parsed.hostname === 'new.vidnest.fun') {
      const wanted = /\/dub(?:\/|$)/.test(parsed.pathname) ? options.dub ?? {} : options.sub ?? {}
      if (parsed.pathname.startsWith('/hianime/anime/')) return respond(url, wanted.anitaku ?? miss())
      if (parsed.pathname.startsWith('/aniwave_hls/')) return respond(url, wanted.aniwave ?? miss())
    }
    if (parsed.hostname === 'vidnest.fun') return respond(url, options.embed ?? miss())
    return respond(url, options.media?.[url] ?? miss())
  })
  return { http, calls }
}

describe('AnimeDex adapter', () => {
  it('decrypts the preferred lane and returns its HLS root with tracks and skips', async () => {
    const mediaUrl = 'https://megap.shiora.top/hd-2/master.m3u8'
    const alternateUrl = 'https://px.roburnt10.store/master.m3u8'
    const { http, calls } = fixture({
      sub: {
        anitaku: { text: envelope({
          sources: [{ file: mediaUrl }],
          tracks: [
            { file: 'https://sub.vdrk.site/en.vtt', label: 'English' },
            { file: 'https://sub.vdrk.site/thumbs.jpg', kind: 'thumbnails' },
          ],
          intro: { start: 90, end: 180 },
          outro: { start: 1300, end: 1400 },
        }) },
        aniwave: { text: envelope({ sources: [{ file: alternateUrl }], tracks: [] }) },
      },
      media: { [mediaUrl]: { text: PLAYLIST }, [alternateUrl]: { text: PLAYLIST } },
    })
    const result = await createAnimedexProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected sources')
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]).toMatchObject({
      key: 'animedex:anitaku:sub:1',
      url: mediaUrl,
      type: 'hls',
      headers: { origin: 'https://vidnest.fun', referer: 'https://vidnest.fun/' },
      expiresAt: EXPIRES_AT,
      language: 'original',
      qualityHint: 'Auto',
      subtitles: [{ id: 'animedex-sub-0', label: 'English', language: 'english', url: 'https://sub.vdrk.site/en.vtt', format: 'vtt' }],
      skipSegments: [
        { kind: 'intro', start: 90, end: 180 },
        { kind: 'outro', start: 1300, end: 1400 },
      ],
    })
    providerSourceSchema.parse(result.sources[0])
    expect(result.sources[1]).toMatchObject({ serverName: 'aniwave', url: alternateUrl })
    expect(calls[0]?.url).toMatch(/^https:\/\/new\.vidnest\.fun\/hianime\/anime\/19\/1\/sub\/hd-2\?_n=[A-Za-z0-9_-]{16,}$/)
    expect(calls[0]?.headers).toMatchObject({
      'user-agent': userAgent,
      accept: 'application/json',
      origin: 'https://vidnest.fun',
      referer: 'https://vidnest.fun/',
    })
    expect(calls.map((call) => call.url)).toContainEqual(expect.stringMatching(/^https:\/\/new\.vidnest\.fun\/aniwave_hls\/19\/1\/sub\?_n=/))
  })
  it('requests the dub lane for an explicit English audio preference', async () => {
    const mediaUrl = 'https://megap.shiora.top/dub/master.m3u8'
    const { http, calls } = fixture({
      dub: { anitaku: { text: envelope({ sources: [{ file: mediaUrl }], tracks: [] }) } },
      media: { [mediaUrl]: { text: PLAYLIST } },
    })
    const result = await createAnimedexProvider(http, now).resolve(dub, new AbortController().signal)
    expect(calls[0]?.url).toMatch(/^https:\/\/new\.vidnest\.fun\/hianime\/anime\/19\/1\/dub\/hd-2\?_n=/)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'animedex:anitaku:dub:1', url: mediaUrl, language: 'en' }] })
  })
  it('falls back to the sub lanes when no dub lane answers', async () => {
    const mediaUrl = 'https://px.roburnt10.store/live/master.m3u8'
    const { http, calls } = fixture({
      sub: { aniwave: { text: envelope({ sources: [{ file: mediaUrl }], tracks: [] }) } },
      media: { [mediaUrl]: { text: PLAYLIST } },
    })
    const result = await createAnimedexProvider(http, now).resolve(dub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'animedex:aniwave:sub-fb:1', url: mediaUrl, language: 'en' }] })
    expect(calls.some((call) => call.url.includes('/hianime/anime/19/1/dub/hd-2'))).toBe(true)
  })
  it('skips a dead preferred lane and takes the other backend', async () => {
    const dead = 'https://megap.shiora.top/dead/master.m3u8'
    const live = 'https://px.roburnt10.store/live/master.m3u8'
    const { http } = fixture({
      sub: {
        anitaku: { text: envelope({ sources: [{ file: dead }], tracks: [] }) },
        aniwave: { text: envelope({ sources: [{ file: live }], tracks: [] }) },
      },
      media: { [live]: { text: PLAYLIST } },
    })
    const result = await createAnimedexProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'animedex:aniwave:sub:1', url: live, headers: { referer: 'https://play.echovideo.ru/' } }] })
  })
  it('returns the vidnest player frame when no lane decrypts', async () => {
    const { http, calls } = fixture({ embed: { text: '<html>player</html>' } })
    const result = await createAnimedexProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{
      key: 'animedex:embed:sub:1',
      url: 'https://vidnest.fun/anime/19/1/sub?servericon=hide&topcaption=hide&topsettings=hide',
      type: 'iframe',
      headers: {},
      subtitles: [],
      expiresAt: EXPIRES_AT,
    }] })
    expect(calls.some((call) => call.url.startsWith('https://vidnest.fun/anime/19/1/sub?'))).toBe(true)
  })
  it('returns empty when every lane and the embed frame 404', async () => {
    const { http } = fixture()
    expect(await createAnimedexProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('maps an undecryptable lane payload to malformed', async () => {
    const { http } = fixture({
      sub: { anitaku: { text: '<html>not json</html>' }, aniwave: { text: '<html>not json</html>' } },
    })
    expect(await createAnimedexProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('aborts cleanly before any fetch', async () => {
    const { http } = fixture()
    expect(await createAnimedexProvider(http, now).resolve(sub, AbortSignal.abort())).toMatchObject({ ok: false, code: 'cancelled' })
    expect(http).not.toHaveBeenCalled()
  })
})
