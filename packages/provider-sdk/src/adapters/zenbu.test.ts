import { describe, expect, it, vi } from 'vitest'
import { createZenbuProvider } from './zenbu.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 21, episode: 21 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const EPISODES = 'https://megadown.zen-bu.cc/episodes/21/21'
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\nindex-1.m3u8\n'
const SUB_MASTER = `https://edge.vidcdn-904.workers.dev/hls/token-sub/master.m3u8?sig=abc`
const SUB_MIRROR = `https://edge.vidcache.workers.dev/hls/token-sub/master.m3u8?sig=abc`
const DUB_MASTER = `https://edge.vidcdn-904.workers.dev/hls/token-dub/master.m3u8?sig=def`
const VTT = 'https://edge.vidcdn-904.workers.dev/hls/token-sub/en.vtt?sig=abc'
const EXPIRY = now() + 600_000

function entry(overrides: Record<string, unknown>) {
  return {
    providerId: 'shorekeeper',
    audio: 'sub',
    resolution: 'auto',
    format: 'hls_m3u8',
    absoluteExpiryMs: EXPIRY,
    subtitles: [{ url: VTT, label: 'English', kind: 'captions', isDefault: true }],
    ...overrides,
  }
}

type Call = { url: string; headers: Record<string, string>; init?: unknown }

function fixture(body: string, status = 200) {
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    if (url === EPISODES) return { url, status, text: body, headers: new Headers() }
    return { url, status: 200, text: PLAYLIST, headers: new Headers() }
  })
  return { http, calls }
}

const SUB_BODY = JSON.stringify({
  success: true,
  data: [
    entry({ url: SUB_MASTER }),
    entry({ url: SUB_MIRROR }),
  ],
})

describe('Zenbu adapter', () => {
  it('resolves the signed episode JSON with the zen-bu referer and real upstream expiry', async () => {
    const { http, calls } = fixture(SUB_BODY)
    const result = await createZenbuProvider(http, now).resolve(sub, new AbortController().signal)
    expect(calls[0]?.url).toBe(EPISODES)
    expect(calls[0]?.headers).toMatchObject({
      'user-agent': expect.any(String),
      accept: 'application/json',
      referer: 'https://zen-bu.cc/',
    })
    expect(result).toMatchObject({
      ok: true,
      sources: [
        {
          key: expect.stringContaining('zenbu:shorekeeper:sub:edge'),
          url: SUB_MASTER,
          type: 'hls',
          headers: { referer: 'https://zen-bu.cc/' },
          expiresAt: new Date(EXPIRY).toISOString(),
          language: 'original',
          qualityHint: 'Auto',
          subtitles: [{ id: 'zenbu-sub-0', label: 'English', language: 'English', url: VTT, format: 'vtt' }],
        },
        {
          url: SUB_MIRROR,
          type: 'hls',
          expiresAt: new Date(EXPIRY).toISOString(),
        },
      ],
    })
  })
  it('keeps one source per worker host and dedupes soft subtitles', async () => {
    const { http } = fixture(JSON.stringify({
      data: [
        entry({ url: SUB_MASTER }),
        entry({ url: SUB_MIRROR }),
        entry({ url: DUB_MASTER, audio: 'dub', subtitles: [{ url: VTT, label: 'English' }] }),
      ],
    }))
    const result = await createZenbuProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result.ok && result.sources.map((source) => source.url)).toEqual([SUB_MASTER, SUB_MIRROR])
    expect(result.ok && result.sources[0]?.subtitles).toHaveLength(1)
  })
  it('serves the dub lane for an explicit English preference', async () => {
    const { http, calls } = fixture(JSON.stringify({ data: [entry({ audio: 'dub', url: DUB_MASTER })] }))
    const result = await createZenbuProvider(http, now).resolve(dub, new AbortController().signal)
    expect(calls[0]?.url).toBe(EPISODES)
    expect(result).toMatchObject({ ok: true, sources: [{ url: DUB_MASTER, language: 'en' }] })
  })
  it('falls back from sub to dub when the requested audio is absent', async () => {
    const { http } = fixture(JSON.stringify({ data: [entry({ audio: 'dub', url: DUB_MASTER })] }))
    expect(await createZenbuProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({
      ok: true, sources: [{ url: DUB_MASTER, language: 'en' }],
    })
  })
  it('answers empty when the episode endpoint 404s', async () => {
    const { http } = fixture('', 404)
    expect(await createZenbuProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when the payload has no entries or no usable sub/dub lane', async () => {
    expect(await createZenbuProvider(fixture(JSON.stringify({ data: [] })).http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(await createZenbuProvider(fixture(JSON.stringify({ data: [entry({ audio: 'raw', url: SUB_MASTER })] })).http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('fails closed as malformed when the payload is not JSON', async () => {
    const { http } = fixture('not-json')
    expect(await createZenbuProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('drops entries whose signed expiry is already past', async () => {
    const { http } = fixture(JSON.stringify({ data: [entry({ url: SUB_MASTER, absoluteExpiryMs: now() - 1000 })] }))
    expect(await createZenbuProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('rejects non-anime refs before any upstream work', async () => {
    const { http, calls } = fixture(SUB_BODY)
    const provider = createZenbuProvider(http, now)
    expect(await provider.resolve({ ...sub, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(await provider.resolve({ ...sub, ref: { kind: 'anime' as const, id: 21, episode: 0 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    expect(calls).toHaveLength(0)
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
  })
})
