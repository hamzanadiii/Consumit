import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createKototvProvider } from './kototv.ts'
import type { ProviderHttp, ProviderHttpRequest } from './http.ts'

const now = () => Date.parse('2026-10-16T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }

const SITE = 'https://kototv.to'
const PLAYER = 'https://player.kototv.to'
const SEARCH = `${SITE}/api/ajax/search?q=One%20Piece`
const WATCH = `${SITE}/anime/one-piece/watch/1`
const WATCH_DUB = `${SITE}/anime/one-piece/watch/1/dub`
const EMBED_SUB = `${SITE}/embed/AbCd1234/sub`
const EMBED_DUB = `${SITE}/embed/AbCd1234/dub`
const MASTER = 'https://hls.kototv.to/stream/af0b64ce7a23cf9483d3b2842f765c2f/master.m3u8'
const VTT = 'https://subtitle.kototv.to/one-piece/eng-2.vtt'
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1088913,RESOLUTION=1440x1080\nvariant/index-f1-v1-a1.m3u8\n'

const OBF_KEY = 'otaku-embed-v1'
const CONFIG = { src: MASTER, subtitles: [{ lang: 'eng', label: 'English', src: VTT }], player: { engine: 'jwplayer' } }

function embedBlob(config: unknown): string {
  const json = JSON.stringify(config)
  let xored = ''
  for (let i = 0; i < json.length; i++) {
    xored += String.fromCharCode(json.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length))
  }
  return Buffer.from(xored, 'binary').toString('base64')
}
function watchPage(lang: 'sub' | 'dub') {
  return `<html><iframe id="main-player-iframe" src="${PLAYER}/embed/AbCd1234/${lang}" width="100%"></iframe></html>`
}
function embedPage(config: unknown) {
  return `<html><script>window.__P = "${embedBlob(config)}";</script></html>`
}

const SEARCH_OK = {
  status: 200,
  text: JSON.stringify({ results: [{ slug: 'one-piece', title: 'One Piece' }, { slug: 'one-piece-film-red', title: 'One Piece Film: Red' }] }),
}
const MASTER_OK = { status: 200, text: PLAYLIST, acao: '*' }

type Route = { status: number; text: string; acao?: string | null }
type Call = { url: string; headers: Record<string, string>; init?: ProviderHttpRequest | undefined }

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
const resolveTitle = vi.fn(async () => 'One Piece')

describe('KoToTV adapter', () => {
  it('walks search, watch, embed, and gates the single master', async () => {
    const { http, calls } = fixture({
      [SEARCH]: SEARCH_OK,
      [WATCH]: { status: 200, text: watchPage('sub') },
      [EMBED_SUB]: { status: 200, text: embedPage(CONFIG) },
      [MASTER]: MASTER_OK,
    })
    const provider = createKototvProvider(http, resolveTitle, now)
    expect(provider.audioLanguages).toEqual(['ja', 'en'])
    const result = await provider.resolve(sub, new AbortController().signal)
    expect(calls.map((call) => call.url)).toEqual([SEARCH, WATCH, EMBED_SUB, MASTER])
    expect(calls[0]?.headers).toMatchObject({ accept: 'text/html,application/xhtml+xml,application/json' })
    expect(calls[3]?.init).toMatchObject({ readPrefixBytes: 65536 })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      key: 'kototv:sub:1',
      url: MASTER,
      type: 'hls',
      headers: {},
      expiresAt: '2026-10-16T00:05:00.000Z',
      language: 'original',
      qualityHint: 'Auto',
    })
    expect(result.sources[0]?.subtitles).toEqual([
      { id: 'kototv-sub-0', label: 'English', language: 'English', url: VTT, format: 'vtt' },
    ])
  })

  it('retries three transient KotoTV search server errors', async () => {
    const http = vi.fn<ProviderHttp>()
      .mockResolvedValueOnce({ url: SEARCH, status: 503, text: '' })
      .mockResolvedValueOnce({ url: SEARCH, status: 503, text: '' })
      .mockResolvedValueOnce({ url: SEARCH, status: 503, text: '' })
      .mockResolvedValueOnce({ url: SEARCH, ...SEARCH_OK })
      .mockResolvedValueOnce({ url: WATCH, status: 200, text: watchPage('sub') })
      .mockResolvedValueOnce({ url: EMBED_SUB, status: 200, text: embedPage(CONFIG) })
      .mockResolvedValueOnce({ url: MASTER, status: 200, text: PLAYLIST, headers: new Headers({ 'access-control-allow-origin': '*' }) })
    const result = await createKototvProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(http.mock.calls.slice(0, 4).map(([url]) => url)).toEqual([SEARCH, SEARCH, SEARCH, SEARCH])
    expect(http).toHaveBeenCalledTimes(7)
    expect(result).toMatchObject({ ok: true, sources: [{ url: MASTER }] })
  })

  it('retries transient errors on watch, embed, and media pages too', async () => {
    const http = vi.fn<ProviderHttp>()
      .mockResolvedValueOnce({ url: SEARCH, ...SEARCH_OK })
      .mockResolvedValueOnce({ url: WATCH, status: 503, text: '' })
      .mockResolvedValueOnce({ url: WATCH, status: 200, text: watchPage('sub') })
      .mockResolvedValueOnce({ url: EMBED_SUB, status: 503, text: '' })
      .mockResolvedValueOnce({ url: EMBED_SUB, status: 200, text: embedPage(CONFIG) })
      .mockResolvedValueOnce({ url: MASTER, status: 503, text: '' })
      .mockResolvedValueOnce({ url: MASTER, status: 200, text: PLAYLIST, headers: new Headers({ 'access-control-allow-origin': '*' }) })
    const result = await createKototvProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal)
    expect(http.mock.calls.map(([url]) => url)).toEqual([SEARCH, WATCH, WATCH, EMBED_SUB, EMBED_SUB, MASTER, MASTER])
    expect(result).toMatchObject({ ok: true, sources: [{ url: MASTER }] })
  })

  it('uses the dub watch path and dub embed for an explicit English preference', async () => {
    const { http, calls } = fixture({
      [SEARCH]: SEARCH_OK,
      [WATCH_DUB]: { status: 200, text: watchPage('dub') },
      [EMBED_DUB]: { status: 200, text: embedPage(CONFIG) },
      [MASTER]: MASTER_OK,
    })
    const result = await createKototvProvider(http, resolveTitle, now).resolve(dub, new AbortController().signal)
    expect(calls.map((call) => call.url)).toEqual([SEARCH, WATCH_DUB, EMBED_DUB, MASTER])
    expect(result.ok && result.sources[0]).toMatchObject({ key: 'kototv:dub:1', language: 'en' })
  })

  it('answers empty when the title search 404s', async () => {
    const { http, calls } = fixture({})
    expect(await createKototvProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
    expect(calls).toHaveLength(1)
  })

  it('answers empty when no search result matches the canonical title', async () => {
    const { http, calls } = fixture({
      [SEARCH]: { status: 200, text: JSON.stringify({ results: [{ slug: 'naruto', title: 'Naruto' }] }) },
    })
    expect(await createKototvProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
    expect(calls).toHaveLength(1)
  })

  it('reports a malformed payload when the embed config will not decode', async () => {
    const { http, calls } = fixture({
      [SEARCH]: SEARCH_OK,
      [WATCH]: { status: 200, text: watchPage('sub') },
      [EMBED_SUB]: { status: 200, text: '<html><script>window.__P = "%%%corrupt%%%";</script></html>' },
    })
    expect(await createKototvProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'malformed' })
    expect(calls).toHaveLength(3)
  })

  it.each([
    { name: 'a body that is not a playlist', probe: { status: 200, text: '<html>nope</html>', acao: '*' }, code: 'malformed' },
    { name: 'a master that 404s', probe: { status: 404, text: '', acao: '*' }, code: 'empty' },
    { name: 'a master that answers without CORS', probe: { status: 200, text: PLAYLIST, acao: null }, code: 'empty' },
  ])('rejects the master when the bounded probe sees $name', async ({ probe, code }) => {
    const { http } = fixture({
      [SEARCH]: SEARCH_OK,
      [WATCH]: { status: 200, text: watchPage('sub') },
      [EMBED_SUB]: { status: 200, text: embedPage(CONFIG) },
      [MASTER]: probe,
    })
    expect(await createKototvProvider(http, resolveTitle, now).resolve(sub, new AbortController().signal))
      .toMatchObject({ ok: false, code })
  })

  it('rejects refs KoToTV cannot address', async () => {
    const { http } = fixture({})
    expect(await createKototvProvider(http, resolveTitle, now).resolve(
      { ...sub, ref: { kind: 'movie' as const, id: 550 } },
      new AbortController().signal,
    )).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
