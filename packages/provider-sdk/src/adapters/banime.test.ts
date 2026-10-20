import { describe, expect, it, vi } from 'vitest'
import { createBanimeProvider } from './banime.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 21, episode: 21 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\nsegment.m3u8\n'
const REANIME = 'https://reanime.sharky.systems/s/ani/21/21/sub.m3u8'
const ANIKOTO = 'https://anikoto.sharky.systems/s/ani/21/21/sub.m3u8'
const REANIME_DUB = 'https://reanime.sharky.systems/s/ani/21/21/dub.m3u8'
const ANIKOTO_DUB = 'https://anikoto.sharky.systems/s/ani/21/21/dub.m3u8'

type Call = { url: string; headers: Record<string, string>; init?: { readPrefixBytes?: number } | undefined }

function fixture(masters: Record<string, { status: number; text: string; contentType?: string }>) {
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    const entry = masters[url] ?? { status: 404, text: '' }
    return {
      url, status: entry.status, text: entry.text,
      headers: new Headers(entry.contentType ? { 'content-type': entry.contentType } : {}),
    }
  })
  return { http, calls }
}

const OPEN = { status: 200, text: PLAYLIST }
const DEAD = { status: 404, text: '' }

describe('bAnime adapter', () => {
  it('probes both sharky hosts in parallel and returns one source per healthy host', async () => {
    const { http, calls } = fixture({
      [REANIME]: OPEN,
      [ANIKOTO]: { status: 200, text: '', contentType: 'application/vnd.apple.mpegurl' },
    })
    const result = await createBanimeProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      sources: [
        {
          key: 'banime:reanime:sub', url: REANIME, type: 'hls', language: 'original',
          headers: { 'user-agent': expect.any(String) },
          expiresAt: new Date(now() + 300_000).toISOString(),
        },
        {
          key: 'banime:anikoto:sub', url: ANIKOTO, type: 'hls', language: 'original',
          headers: { referer: 'https://anime.sharky.systems/' },
        },
      ],
    })
    expect(calls.every((call) => call.init?.readPrefixBytes === 64 * 1024)).toBe(true)
    expect(calls.find((call) => call.url === ANIKOTO)?.headers).toMatchObject({ referer: 'https://anime.sharky.systems/' })
  })
  it('probes the dub masters for an explicit English preference', async () => {
    const { http, calls } = fixture({ [REANIME_DUB]: OPEN, [ANIKOTO_DUB]: OPEN })
    const result = await createBanimeProvider(http, now).resolve(dub, new AbortController().signal)
    expect(calls.map((call) => call.url)).toEqual([REANIME_DUB, ANIKOTO_DUB])
    expect(result).toMatchObject({ ok: true, sources: [{ url: REANIME_DUB, language: 'en' }, { url: ANIKOTO_DUB, language: 'en' }] })
  })
  it('takes only anikoto when reanime 404s', async () => {
    const { http } = fixture({ [REANIME]: DEAD, [ANIKOTO]: OPEN })
    expect(await createBanimeProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({
      ok: true, sources: [{ key: 'banime:anikoto:sub', url: ANIKOTO }],
    })
  })
  it('falls back from the dub lane to sub and labels the served audio', async () => {
    const { http, calls } = fixture({
      [REANIME_DUB]: DEAD, [ANIKOTO_DUB]: DEAD, [REANIME]: OPEN, [ANIKOTO]: DEAD,
    })
    const result = await createBanimeProvider(http, now).resolve(dub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: REANIME, language: 'original' }] })
    expect(calls.map((call) => call.url)).toEqual([REANIME_DUB, ANIKOTO_DUB, REANIME, ANIKOTO])
  })
  it('answers empty when every master is missing', async () => {
    const { http } = fixture({})
    expect(await createBanimeProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when a host answers 200 with a non-playlist body', async () => {
    const { http } = fixture({
      [REANIME]: { status: 200, text: '<html>error page</html>', contentType: 'text/html' },
      [ANIKOTO]: { status: 200, text: 'nope', contentType: 'text/plain' },
    })
    expect(await createBanimeProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('rejects non-anime refs before any upstream work', async () => {
    const { http } = fixture({})
    const provider = createBanimeProvider(http, now)
    expect(await provider.resolve({ ...sub, ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(await provider.resolve({ ...sub, ref: { kind: 'anime' as const, id: 21, episode: 0 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    expect(http).not.toHaveBeenCalled()
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
  })
})
