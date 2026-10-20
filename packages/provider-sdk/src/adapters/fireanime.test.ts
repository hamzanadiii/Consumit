import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createFireanimeProvider } from './fireanime.ts'
import type { ProviderHttp, ProviderHttpRequest } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 21, episode: 2 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\nvariant.m3u8\n'
const MASTER = 'https://cloudwindow-route.com/hls/xyz/master.m3u8'
const SEARCH = 'https://fireani.me/api.v1.AnimeSearchService/SearchAnimes'
const GET_ANIME = 'https://fireani.me/api.v1.anime.AnimeService/GetAnime'
const GET_EPISODE = 'https://fireani.me/api.v1.anime.AnimeService/GetEpisode'
const EMBED = 'https://voe.sx/e/abc'
const MIRROR = 'https://megankiddifference.com/e/xyz'

const resolveTitle = vi.fn(async () => 'ONE PIECE')

/** Inverse of the adapter's packed-blob decode (rot13, separators skipped). */
function packVoe(payload: { source?: string; fallback?: string | string[] }) {
  const c = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  let b = ''
  for (let i = 0; i < c.length; i++) b += String.fromCharCode(c.charCodeAt(i) + 3)
  const a = b.split('').reverse().join('')
  const s = Buffer.from(a, 'binary').toString('base64')
  return s.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base)
  })
}

const blobPage = (payload: { source?: string; fallback?: string | string[] }) =>
  `<html><script type="application/json">${packVoe(payload)}</script></html>`
const redirectPage = (to: string) => `<html><script>window.location.href = '${to}'</script></html>`

type Call = { url: string; headers: Record<string, string>; init?: ProviderHttpRequest | undefined }

function fixture(options: {
  search?: unknown
  anime?: unknown
  episodes?: { status?: number; body?: string }[]
  pages?: Record<string, { status?: number; text: string }>
  masters?: Record<string, { status: number; text: string }>
} = {}) {
  const episodeQueue = [...(options.episodes ?? [])]
  const pages = options.pages ?? {}
  const masters = options.masters ?? {}
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    if (url === SEARCH) return { url, status: 200, text: typeof options.search === 'string' ? options.search : JSON.stringify(options.search ?? { data: [] }), headers: new Headers() }
    if (url === GET_ANIME) return { url, status: 200, text: JSON.stringify(options.anime ?? {}), headers: new Headers() }
    if (url === GET_EPISODE) {
      const entry = episodeQueue.shift()
      return { url, status: entry?.status ?? 200, text: entry?.body ?? '{"data":{"animeEpisodeLinks":[]}}', headers: new Headers() }
    }
    if (pages[url]) {
      const entry = pages[url]!
      return { url, status: entry.status ?? 200, text: entry.text, headers: new Headers() }
    }
    const entry = masters[url] ?? { status: 404, text: '' }
    return { url, status: entry.status, text: entry.text, headers: new Headers() }
  })
  return { http, calls, bodyOf: (call: Call) => JSON.parse(String(call.init!.body)) as Record<string, unknown> }
}

const SEASON_ONE = { season: '1', animeEpisodes: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] }
const ANIME = { anilist: 21, animeSeasons: [SEASON_ONE] }
const SEARCH_HIT = { data: [{ slug: 'one-piece' }] }
const subLink = (overrides: Record<string, unknown> = {}) => ({ link: EMBED, lang: 'eng-sub', name: 'VOE', ...overrides })
const EPISODE_OK = JSON.stringify({ data: { animeEpisodeLinks: [subLink()] } })
const VOE_OK = {
  pages: { [EMBED]: { text: blobPage({ source: MASTER }) } },
  masters: { [MASTER]: { status: 200, text: PLAYLIST } },
}

describe('FireAnime adapter', () => {
  it('maps title to slug, episode to season number, and resolves VOE through a redirect hop', async () => {
    const { http, calls, bodyOf } = fixture({
      search: SEARCH_HIT,
      anime: ANIME,
      episodes: [{ body: EPISODE_OK }],
      pages: {
        [EMBED]: { text: redirectPage(MIRROR) },
        [MIRROR]: { text: blobPage({ source: MASTER }) },
      },
      masters: { [MASTER]: { status: 200, text: PLAYLIST } },
    })
    const result = await createFireanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(calls[0]?.url).toBe(SEARCH)
    expect(bodyOf(calls[0]!)).toMatchObject({ q: 'ONE PIECE', page: 1, limit: 8 })
    expect(calls[0]?.headers).toMatchObject({ origin: 'https://fireani.me', referer: 'https://fireani.me/' })
    expect(calls[1]?.url).toBe(GET_ANIME)
    expect(bodyOf(calls[1]!)).toMatchObject({ slug: 'one-piece' })
    expect(bodyOf(calls[2]!)).toMatchObject({ slug: 'one-piece', season: '1', episode: '2' })
    expect(result).toMatchObject({
      ok: true,
      sources: [{
        key: 'fireanime:sub:2',
        url: MASTER,
        type: 'hls',
        headers: {},
        language: 'original',
        qualityHint: 'Auto',
        subtitles: [],
        expiresAt: new Date(now() + 300_000).toISOString(),
      }],
    })
    // Final master gets one bounded liveness probe.
    expect(calls.at(-1)?.url).toBe(MASTER)
    expect(calls.at(-1)?.init?.readPrefixBytes).toBe(64 * 1024)
  })
  it('resolves a packed blob directly without a redirect hop', async () => {
    const { http } = fixture({
      search: SEARCH_HIT,
      anime: ANIME,
      episodes: [{ body: EPISODE_OK }],
      ...VOE_OK,
    })
    expect(await createFireanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({
      ok: true, sources: [{ url: MASTER }],
    })
  })
  it('serves the dub hoster for an explicit English preference', async () => {
    const { http, calls } = fixture({
      search: SEARCH_HIT,
      anime: ANIME,
      episodes: [{ body: JSON.stringify({ data: { animeEpisodeLinks: [
        subLink(),
        subLink({ lang: 'ger-dub' }),
      ] } }) }],
      ...VOE_OK,
    })
    const result = await createFireanimeProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ language: 'en', key: 'fireanime:dub:2' }] })
    expect(calls.some((call) => call.url === GET_EPISODE)).toBe(true)
  })
  it('falls back from a missing dub hoster to sub and labels the served audio', async () => {
    const { http } = fixture({
      search: SEARCH_HIT,
      anime: ANIME,
      episodes: [{ body: EPISODE_OK }],
      ...VOE_OK,
    })
    expect(await createFireanimeProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)).toMatchObject({
      ok: true, sources: [{ language: 'original', key: 'fireanime:sub:2' }],
    })
  })
  it('retries season 1 with the absolute episode when mapped links are empty', async () => {
    // Its own AniList id: the module slug/anime caches are keyed per id/slug.
    const { http, calls, bodyOf } = fixture({
      search: { data: [{ slug: 'one-piece-2025' }] },
      anime: { anilist: 22, animeSeasons: [SEASON_ONE, { season: '2', animeEpisodes: [{ id: 'e4' }, { id: 'e5' }] }] },
      episodes: [
        { body: '{"data":{"animeEpisodeLinks":[]}}' },
        { body: EPISODE_OK },
      ],
      ...VOE_OK,
    })
    const result = await createFireanimeProvider(http, resolveTitle, now).resolve(
      { ...sub, ref: { kind: 'anime' as const, id: 22, episode: 5 } }, new AbortController().signal)
    const episodeCalls = calls.filter((call) => call.url === GET_EPISODE)
    expect(bodyOf(episodeCalls[0]!)).toMatchObject({ slug: 'one-piece-2025', season: '2', episode: '2' })
    expect(bodyOf(episodeCalls[1]!)).toMatchObject({ slug: 'one-piece-2025', season: '1', episode: '5' })
    expect(result).toMatchObject({ ok: true, sources: [{ url: MASTER }] })
  })
  it('answers empty when the VOE hop chain never yields a blob', async () => {
    const { http } = fixture({
      search: SEARCH_HIT,
      anime: ANIME,
      episodes: [{ body: EPISODE_OK }],
      pages: {
        [EMBED]: { text: redirectPage(MIRROR) },
        [MIRROR]: { text: '<html><script>console.log("nope")</script></html>' },
      },
    })
    expect(await createFireanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when the final master fails the liveness gate', async () => {
    const { http } = fixture({
      search: SEARCH_HIT,
      anime: ANIME,
      episodes: [{ body: EPISODE_OK }],
      pages: { [EMBED]: { text: blobPage({ source: MASTER }) } },
      masters: { [MASTER]: { status: 200, text: '<html>error</html>' } },
    })
    expect(await createFireanimeProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when search never maps the AniList id', async () => {
    const { http, calls } = fixture({
      search: { data: [{ slug: 'wrong-show' }] },
      anime: { anilist: 999, animeSeasons: [] },
    })
    expect(await createFireanimeProvider(http, resolveTitle, now).resolve(
      { ...sub, ref: { kind: 'anime' as const, id: 77, episode: 2 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.every((call) => call.url !== GET_EPISODE)).toBe(true)
  })
  it('answers empty for malformed upstream payloads', async () => {
    const garbage = fixture({ search: 'not-json', anime: ANIME, episodes: [{ body: 'not-json' }] })
    expect(await createFireanimeProvider(garbage.http, resolveTitle, now).resolve(
      { ...sub, ref: { kind: 'anime' as const, id: 88, episode: 2 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    const noVoe = fixture({
      search: SEARCH_HIT,
      anime: ANIME,
      episodes: [{ body: JSON.stringify({ data: { animeEpisodeLinks: [{ link: 'https://proxy.example/embed?slug=x', lang: 'eng-sub', name: 'ProxyPlayerSlow' }] } }) }],
    })
    expect(await createFireanimeProvider(noVoe.http, resolveTitle, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('answers empty when the title resolver fails and rejects non-anime refs', async () => {
    const broken = vi.fn(async () => { throw new Error('no title') })
    const { http, calls } = fixture()
    expect(await createFireanimeProvider(http, broken, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(calls).toHaveLength(0)
    const provider = createFireanimeProvider(http, resolveTitle, now)
    expect(await provider.resolve({ ...sub, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(await provider.resolve({ ...sub, ref: { kind: 'anime' as const, id: 21, episode: 0 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
  })
})
