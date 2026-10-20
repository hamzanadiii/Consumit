import { Buffer } from 'node:buffer'
import { createCipheriv } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createAllAnimeProvider } from './allanime.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const resolveTitle = vi.fn(async () => 'Frieren')
const sub = { ref: { kind: 'anime' as const, id: 154587, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }

const MASK_B64 = '0l9xFeTNfYkbfQHmzUQlt2hz0WdzIhoqFbj7YADON7A='
const PART_B = Buffer.alloc(32, 0x07)
const mask = Buffer.from(MASK_B64, 'base64')
const cryptoKey = Buffer.alloc(32)
for (let i = 0; i < 32; i++) cryptoKey[i] = mask[i]! ^ PART_B[i]!

const defaultMaster = 'https://stream.allanime-cdn.example/def/master.m3u8'
const ssMaster = 'https://stream.allanime-cdn.example/sshls/master.m3u8'
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=1280x720\nvariant.m3u8\n'

function encodeTobeparsed(payload: unknown): string {
  const iv = Buffer.alloc(12, 0x03)
  const cipher = createCipheriv('aes-256-gcm', cryptoKey, iv)
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from([0x01]), iv, ct, cipher.getAuthTag()]).toString('base64')
}

function clockHex(path: string): string {
  return '--' + [...path].map((c) => (c.charCodeAt(0) ^ 56).toString(16).padStart(2, '0')).join('')
}

const CLOCK_PATH = clockHex('/clock/abc123')
const clockUrl = 'https://allanime.day/clock.json/abc123'

const SEARCH_EDGES = { data: { shows: { edges: [
  { _id: 'show1', name: 'Frieren', englishName: 'Frieren' },
  { _id: 'show2', name: 'Kimetsu no Yaiba' },
] } } }
const SEARCH_EMPTY = { data: { shows: { edges: [] } } }
const EPISODE_PAYLOAD = { episode: { sourceUrls: [
  { sourceName: 'Ss-Hls', sourceUrl: CLOCK_PATH },
  { sourceName: 'Default', sourceUrl: defaultMaster },
] } }
const EPISODE_ENTRIES = { data: { tobeparsed: encodeTobeparsed(EPISODE_PAYLOAD) } }
const CLOCK_BODY = JSON.stringify({ links: [{ link: ssMaster, headers: { Referer: 'https://allanime.day/' } }] })

type Call = { url: string; headers: Record<string, string>; init?: { readPrefixBytes?: number } | undefined }

function fixture(options: {
  search?: { status: number; body?: unknown }
  episode?: { status: number; body?: unknown }
  otherEpisode?: { status: number; body?: unknown }
  clock?: { status: number; body?: string }
  masters?: Record<string, { status: number; text: string }>
} = {}) {
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    if (url.startsWith('https://api.mkissa.net/client-crypto/v1/bootstrap')) {
      return { url, status: 200, text: JSON.stringify({ epoch: 24900, partB: PART_B.toString('base64') }), headers: new Headers() }
    }
    if (url.startsWith('https://api.mkissa.net/api')) {
      const parsed = new URL(url)
      const extensions = JSON.parse(parsed.searchParams.get('extensions') ?? '{}') as { persistedQuery?: { sha256Hash?: string } }
      const variables = JSON.parse(parsed.searchParams.get('variables') ?? '{}') as { translationType?: string }
      if (extensions.persistedQuery?.sha256Hash === 'a24c500a1b765c68ae1d8dd85174931f661c71369c89b92b88b75a725afc471c') {
        const entry = options.search ?? { status: 200, body: SEARCH_EDGES }
        return { url, status: entry.status, text: JSON.stringify(entry.body ?? {}), headers: new Headers() }
      }
      const entry = variables.translationType === 'dub'
        ? (options.otherEpisode ?? options.episode ?? { status: 200, body: { data: { episode: { sourceUrls: [] } } } })
        : (options.episode ?? { status: 200, body: { data: { episode: { sourceUrls: [] } } } })
      return { url, status: entry.status, text: JSON.stringify(entry.body ?? {}), headers: new Headers() }
    }
    if (url.startsWith('https://allanime.day/')) {
      const entry = options.clock ?? { status: 200, body: CLOCK_BODY }
      return { url, status: entry.status, text: entry.body ?? '{}', headers: new Headers() }
    }
    const entry = options.masters?.[url] ?? { status: 404, text: '' }
    return { url, status: entry.status, text: entry.text, headers: new Headers() }
  })
  return { http, calls }
}

const OPEN_MASTERS = {
  [defaultMaster]: { status: 200, text: PLAYLIST },
  [ssMaster]: { status: 200, text: PLAYLIST },
}

describe('AllAnime adapter', () => {
  it('bootstraps crypto, resolves clock entries, and ranks Default first', async () => {
    const { http, calls } = fixture({ episode: { status: 200, body: EPISODE_ENTRIES }, masters: OPEN_MASTERS })
    const provider = createAllAnimeProvider(http, resolveTitle, now)
    const result = await provider.resolve(sub, new AbortController().signal)
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
    expect(calls[0]?.url).toContain('sha256Hash%22%3A%22a24c500a1b765c68ae1d8dd85174931f661c71369c89b92b88b75a725afc471c')
    const boot = calls.find((call) => call.url.includes('client-crypto/v1/bootstrap'))
    expect(boot?.headers).toMatchObject({ 'x-build-id': '180' })
    expect(boot?.headers['x-aa-boot']).toMatch(/^[0-9a-f]{64}$/)
    const episodeCall = calls.find((call) => call.url.includes('api.mkissa.net/api') && call.url !== calls[0]?.url && decodeURIComponent(call.url).includes('translationType'))
    expect(episodeCall?.headers).toMatchObject({ 'x-build-id': '180', referer: 'https://mkissa.to/', origin: 'https://mkissa.to' })
    expect(calls.some((call) => call.url === clockUrl)).toBe(true)
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.sources.map((source) => source.key)).toEqual([
      'allanime:sub:default:1',
      'allanime:sub:ss-hls:1',
    ])
    const direct = result.ok ? result.sources[0] : undefined
    expect(direct).toMatchObject({
      url: defaultMaster,
      type: 'hls',
      headers: { referer: 'https://mkissa.to/', origin: 'https://mkissa.to', 'user-agent': expect.any(String) },
      expiresAt: '2026-10-16T00:05:00.000Z',
      language: 'original',
      qualityHint: 'Auto',
      subtitles: [],
    })
    const clocked = result.ok ? result.sources[1] : undefined
    expect(clocked).toMatchObject({
      url: ssMaster,
      headers: { referer: 'https://allanime.day/', origin: 'https://allanime.day' },
      language: 'original',
    })
  })
  it('runs the episode query on the dub lane for an explicit English preference', async () => {
    const { http, calls } = fixture({ episode: { status: 200, body: EPISODE_ENTRIES }, masters: OPEN_MASTERS })
    const result = await createAllAnimeProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)
    const variables = calls
      .filter((call) => call.url.startsWith('https://api.mkissa.net/api'))
      .map((call) => JSON.parse(new URL(call.url).searchParams.get('variables') ?? '{}') as Record<string, unknown>)
    expect(variables.some((v) => v.translationType === 'dub')).toBe(true)
    expect(variables.some((v) => v.translationType === 'search' || (v.search as object | undefined) !== undefined)).toBe(true)
    expect(result.ok && result.sources[0]?.language).toBe('en')
    expect(result.ok && result.sources[0]?.key).toBe('allanime:dub:default:1')
  })
  it('falls back to the other audio lane when the requested lane is empty', async () => {
    const { http, calls } = fixture({
      episode: { status: 200, body: { data: { episode: { sourceUrls: [] } } } },
      otherEpisode: { status: 200, body: EPISODE_ENTRIES },
      masters: OPEN_MASTERS,
    })
    const result = await createAllAnimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    const variables = calls
      .filter((call) => call.url.startsWith('https://api.mkissa.net/api') && decodeURIComponent(call.url).includes('showId'))
      .map((call) => JSON.parse(new URL(call.url).searchParams.get('variables') ?? '{}') as { translationType?: string })
    expect(variables.map((v) => v.translationType)).toEqual(['sub', 'dub'])
    expect(result.ok && result.sources[0]?.language).toBe('original')
  })
  it('reports empty when search yields no edges', async () => {
    const { http } = fixture({ search: { status: 200, body: SEARCH_EMPTY } })
    expect(await createAllAnimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('reports empty when both audio lanes carry no sourceUrls', async () => {
    const { http } = fixture({ episode: { status: 200, body: { data: { episode: { sourceUrls: [] } } } }, otherEpisode: { status: 200, body: { data: { episode: { sourceUrls: [] } } } } })
    expect(await createAllAnimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('reports unavailable when the search endpoint fails with a 5xx', async () => {
    const { http } = fixture({ search: { status: 500, body: { error: 'boom' } } })
    expect(await createAllAnimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable' })
  })
  it('reports malformed when the tobeparsed blob cannot be decrypted', async () => {
    const { http } = fixture({ episode: { status: 200, body: { data: { tobeparsed: Buffer.from('garbage-not-gcm', 'utf8').toString('base64') } } } })
    expect(await createAllAnimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('drops dead masters at the gate instead of returning them', async () => {
    const { http, calls } = fixture({ episode: { status: 200, body: EPISODE_ENTRIES }, masters: {} })
    const result = await createAllAnimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.some((call) => call.url === defaultMaster)).toBe(true)
    expect(calls.some((call) => call.url === ssMaster)).toBe(true)
  })
  it('rejects a ref AllAnime cannot address', async () => {
    const { http } = fixture()
    expect(await createAllAnimeProvider(http, resolveTitle, now).resolve({ ...sub, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
