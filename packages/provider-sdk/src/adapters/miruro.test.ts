import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { createMiruroProvider } from './miruro.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const resolveTitle = vi.fn(async () => 'Frieren: Beyond Journeys End')
const sub = { ref: { kind: 'anime' as const, id: 154587, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const master = 'https://hls.krussdomi.com/uwu/abc/master.m3u8'
const dubMaster = 'https://nexabloom.example/uwu/abc/master.m3u8'
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\nvariant.m3u8\n'

const CATALOG = JSON.stringify({ data: [{ id: 'm4ne', title: { romaji: 'Sousou no Frieren' } }] })
const CATALOG_MISS = JSON.stringify({ data: [] })
const SEARCH = JSON.stringify({ data: [
  { id: 'other', title: { romaji: 'Kimetsu no Yaiba' } },
  { id: 'm4ne', title: { romaji: 'Frieren: Beyond Journeys End', english: 'Frieren' } },
] })
const SEARCH_MISS = JSON.stringify({ data: [{ id: 'other', title: { romaji: 'Kimetsu no Yaiba' } }] })

function track(kind: 'ssub' | 'sdub', streamUrl: string) {
  return {
    track: kind,
    providers: [{
      provider: 'kickassanime',
      subtitles: [
        { url: 'https://sub.miruro.example/eng/ep1.srt', label: 'English' },
        { url: 'https://sub.miruro.example/por/ep1.ass', label: 'Portuguese' },
        { url: 'http://insecure.example/x.vtt', label: 'Bad' },
      ],
      servers: [{
        server: 'hd-1',
        headers: { Referer: 'https://stream.kickassanime.example/', 'X-Auth': 'dropped' },
        streams: [{ url: streamUrl, format: 'hls' }],
      }],
    }],
  }
}

function cawBody(payload: unknown): Uint8Array {
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  const key = Buffer.from('miruro/catalog', 'utf8')
  const out = Buffer.alloc(gz.length)
  for (let i = 0; i < gz.length; i++) out[i] = gz[i]! ^ key[i % key.length]!
  return out
}

type Call = { url: string; headers: Record<string, string>; init?: { readPrefixBytes?: number } | undefined }

function fixture(options: {
  catalog?: { status: number; body?: string }
  search?: { status: number; body?: string }
  play?: { status: number; body?: unknown; octet?: boolean; garbage?: boolean }
  masters?: Record<string, { status: number; text: string }>
} = {}) {
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    if (url.includes('anilist_id_in')) {
      const entry = options.catalog ?? { status: 200, body: CATALOG }
      return { url, status: entry.status, text: entry.body ?? '{}', headers: new Headers() }
    }
    if (url.includes('/api/v1/anime?')) {
      const entry = options.search ?? { status: 200, body: SEARCH }
      return { url, status: entry.status, text: entry.body ?? '{}', headers: new Headers() }
    }
    if (url.includes('/episodes/') && url.endsWith('/play')) {
      const entry = options.play ?? { status: 200, body: { tracks: [] } }
      if (entry.garbage) return { url, status: entry.status, text: '', bytes: Buffer.from('not-caw-payload', 'utf8'), headers: new Headers({ 'content-type': 'application/octet-stream' }) }
      if (entry.octet) return { url, status: entry.status, text: '', bytes: cawBody(entry.body), headers: new Headers({ 'content-type': 'application/octet-stream' }) }
      return { url, status: entry.status, text: JSON.stringify(entry.body ?? {}), headers: new Headers({ 'content-type': 'application/json' }) }
    }
    const entry = options.masters?.[url] ?? { status: 404, text: '' }
    return { url, status: entry.status, text: entry.text, headers: new Headers() }
  })
  return { http, calls }
}

const PLAY_SUB = { status: 200, body: { tracks: [track('ssub', master)] }, octet: true }
const PLAY_BOTH = { status: 200, body: { tracks: [track('ssub', master), track('sdub', dubMaster)] }, octet: true }
const OPEN_MASTERS = { [master]: { status: 200, text: PLAYLIST }, [dubMaster]: { status: 200, text: PLAYLIST } }

describe('Miruro adapter', () => {
  it('maps an AniList id, decodes the CAW play body, and returns a verified direct source', async () => {
    const { http, calls } = fixture({ play: PLAY_SUB, masters: OPEN_MASTERS })
    const provider = createMiruroProvider(http, resolveTitle, now)
    const result = await provider.resolve(sub, new AbortController().signal)
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
    expect(calls[0]?.url).toBe('https://www.miruro.bz/api/v1/anime?anilist_id_in=154587&limit=1')
    expect(calls.at(-1)?.url).toBe(master)
    expect(result).toMatchObject({ ok: true })
    const source = result.ok ? result.sources[0] : undefined
    expect(source).toMatchObject({
      key: 'miruro:sub:kickassanime-hd-1:1',
      url: master,
      type: 'hls',
      headers: { referer: 'https://stream.kickassanime.example/' },
      expiresAt: '2026-10-16T00:05:00.000Z',
      language: 'original',
      qualityHint: 'Auto',
    })
    expect(source?.headers).not.toHaveProperty('x-auth')
    expect(source?.subtitles).toEqual([
      { id: 'miruro-sub-0', label: 'English', language: 'English', url: 'https://sub.miruro.example/eng/ep1.srt', format: 'srt' },
      { id: 'miruro-sub-1', label: 'Portuguese', language: 'Portuguese', url: 'https://sub.miruro.example/por/ep1.ass', format: 'ass' },
    ])
  })
  it('falls back to a scored title search when the AniList mapping misses', async () => {
    const { http, calls } = fixture({ catalog: { status: 200, body: CATALOG_MISS }, play: PLAY_SUB, masters: OPEN_MASTERS })
    const result = await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(calls[0]?.url).toContain('anilist_id_in=')
    expect(calls[1]?.url).toContain('/api/v1/anime?q=Frieren%3A%20Beyond%20Journeys%20End&limit=15')
    expect(calls[2]?.url).toContain('/anime/m4ne/episodes/1/play')
    expect(result.ok && result.sources[0]?.key).toBe('miruro:sub:kickassanime-hd-1:1')
  })
  it('requests the dub lane and labels sources en for an explicit English preference', async () => {
    const { http } = fixture({ play: PLAY_BOTH, masters: OPEN_MASTERS })
    const result = await createMiruroProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)
    expect(result.ok && result.sources[0]?.url).toBe(dubMaster)
    expect(result.ok && result.sources[0]?.language).toBe('en')
    expect(result.ok && result.sources[0]?.key).toBe('miruro:dub:kickassanime-hd-1:1')
  })
  it('prefers the sub track when English was not requested', async () => {
    const { http } = fixture({ play: PLAY_BOTH, masters: OPEN_MASTERS })
    const result = await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result.ok && result.sources[0]?.url).toBe(master)
    expect(result.ok && result.sources[0]?.language).toBe('original')
  })
  it('reports empty when the episode 404s', async () => {
    const { http } = fixture({ play: { status: 404, body: {} } })
    expect(await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('reports empty when neither the AniList mapping nor the title search finds the show', async () => {
    const { http } = fixture({ catalog: { status: 200, body: CATALOG_MISS }, search: { status: 200, body: SEARCH_MISS } })
    expect(await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('reports malformed when the play body is an undecodable octet-stream', async () => {
    const { http } = fixture({ play: { status: 200, body: {}, garbage: true } })
    expect(await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('reports malformed when the play payload does not match the track shape', async () => {
    const { http } = fixture({ play: { status: 200, body: { tracks: 'nope' } } })
    expect(await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('drops a dead master at the gate instead of returning it', async () => {
    const { http, calls } = fixture({ play: PLAY_SUB, masters: { [master]: { status: 404, text: '' } } })
    const result = await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.some((call) => call.url === master)).toBe(true)
  })
  it('skips a gate probe whose body is not a playlist', async () => {
    const { http } = fixture({ play: PLAY_SUB, masters: { [master]: { status: 200, text: '<html>Attention Required!</html>' } } })
    expect(await createMiruroProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('rejects a ref Miruro cannot address', async () => {
    const { http } = fixture()
    expect(await createMiruroProvider(http, resolveTitle, now).resolve({ ...sub, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
