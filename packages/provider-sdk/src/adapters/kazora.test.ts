import { describe, expect, it, vi } from 'vitest'
import { createKazoraProvider } from './kazora.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-09T00:00:00Z')
const sub = { ref: { kind: 'anime' as const, id: 19, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const dub = { ...sub, audioLanguage: 'en' }
const openMaster = 'https://cdnx.aniwatchtv.site/uwu/abc/master.m3u8'
const gatedMaster = 'https://fetch8.flixcloud.cc/_v7/abc/master.m3u8?token=x'
const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=286344,RESOLUTION=720x480\n/uwu/abc/variant.m3u8\n'

function embed(token: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(token), 'utf8').toString('base64')
  return `/stream-embed/embed/${payload}.signature`
}

function watchBody(token: Record<string, unknown>) {
  return JSON.stringify({ results: { embed: { url: embed(token) } } })
}

type Call = { url: string; headers: Record<string, string>; init?: { readPrefixBytes?: number } | undefined }

function fixture(options: {
  watch?: Record<string, unknown>[]
  masters?: Record<string, { status: number; text: string; acao?: string | null }>
} = {}) {
  const watchQueue = [...(options.watch ?? [])]
  const masters = options.masters ?? {}
  const calls: Call[] = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    if (url.startsWith('https://kazora.cc/api/watch')) {
      const token = watchQueue.shift()
      return { url, status: 200, text: token ? watchBody(token) : '{}', headers: new Headers() }
    }
    const entry = masters[url] ?? { status: 404, text: '' }
    return { url, status: entry.status, text: entry.text, headers: new Headers({ ...(entry.acao ? { 'access-control-allow-origin': entry.acao } : {}) }) }
  })
  return { http, calls }
}

const OPEN = { status: 200, text: PLAYLIST, acao: '*' }
const GATED_403 = { status: 403, text: '<html>Attention Required!</html>' }
const NO_CORS = { status: 200, text: PLAYLIST, acao: null }

describe('Kazora adapter', () => {
  it('resolves the watch API and accepts a CORS-open master', async () => {
    const { http, calls } = fixture({
      watch: [{ m3u8: openMaster }],
      masters: { [openMaster]: OPEN },
    })
    const result = await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)
    expect(calls[0]?.url).toBe('https://kazora.cc/api/watch?id=19&ep=1&server=juju&type=sub')
    expect(calls[0]?.headers).toMatchObject({ origin: 'https://kazora.cc', referer: 'https://kazora.cc/' })
    expect(result).toMatchObject({ ok: true, sources: [{
      url: openMaster, type: 'hls', language: 'original', qualityHint: 'Auto', subtitles: [],
    }] })
  })
  it('requests the dub lane for an explicit English audio preference', async () => {
    const { http, calls } = fixture({ watch: [{ m3u8: openMaster }], masters: { [openMaster]: OPEN } })
    const result = await createKazoraProvider(http, now).resolve(dub, new AbortController().signal)
    expect(calls[0]?.url).toContain('type=dub')
    expect(result.ok && result.sources[0]?.language).toBe('en')
  })
  it('skips a gated CDN and takes the next server on the open lane', async () => {
    const { http, calls } = fixture({
      watch: [{ m3u8: gatedMaster }, { m3u8: openMaster }],
      masters: { [gatedMaster]: GATED_403, [openMaster]: OPEN },
    })
    const result = await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: openMaster }] })
    expect(calls.filter((call) => call.url.includes('/api/watch')).map((call) => call.url)).toEqual([
      expect.stringContaining('server=juju'),
      expect.stringContaining('server=kyoo'),
    ])
  })
  it('skips a master that answers without CORS', async () => {
    const { http } = fixture({
      watch: [{ m3u8: openMaster }, { m3u8: gatedMaster }],
      masters: { [openMaster]: NO_CORS, [gatedMaster]: OPEN },
    })
    const result = await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: gatedMaster }] })
  })
  it('skips a master whose body is not a playlist', async () => {
    const { http } = fixture({
      watch: [{ m3u8: openMaster }, { m3u8: gatedMaster }],
      masters: { [openMaster]: { status: 200, text: '<html>nope</html>', acao: '*' }, [gatedMaster]: OPEN },
    })
    expect(await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ url: gatedMaster }] })
  })
  it('carries intro and outro marks through as skip segments', async () => {
    const { http } = fixture({
      watch: [{ m3u8: openMaster, intro: { start: 112, end: 197 }, outro: { start: 1344, end: 1434 } }],
      masters: { [openMaster]: OPEN },
    })
    const result = await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result.ok && result.sources[0]?.skipSegments).toEqual([
      { kind: 'intro', start: 112, end: 197 },
      { kind: 'outro', start: 1344, end: 1434 },
    ])
  })
  it('drops an outro mark whose range is not ordered', async () => {
    const { http } = fixture({
      watch: [{ m3u8: openMaster, intro: { start: 112, end: 197 }, outro: { start: 5000, end: 100 } }],
      masters: { [openMaster]: OPEN },
    })
    const result = await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)
    expect(result.ok && result.sources[0]?.skipSegments).toEqual([{ kind: 'intro', start: 112, end: 197 }])
  })
  it('bounds the master probe', async () => {
    const { http, calls } = fixture({ watch: [{ m3u8: openMaster }], masters: { [openMaster]: OPEN } })
    await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)
    expect(calls[1]?.init).toMatchObject({ readPrefixBytes: 65536 })
  })
  it.each([
    { watch: [] },
    { watch: [{}] },
    { watch: [{ m3u8: 'not-a-url' }] },
    { watch: [{ m3u8: 'ftp://cdn.example/master.m3u8' }] },
    { watch: [{ m3u8: `https://cdn.example/${'a'.repeat(5000)}.m3u8` }] },
    { watch: [{ m3u8: openMaster }, { m3u8: openMaster }, { m3u8: openMaster }], masters: {} },
    { watch: [{ m3u8: 'https://cdn.example/x.m3u8' }], masters: { 'https://cdn.example/x.m3u8': { status: 500, text: '' } } },
  ])('returns no source when no open lane lands: %j', async (options) => {
    const { http } = fixture(options)
    expect(await createKazoraProvider(http, now).resolve(sub, new AbortController().signal)).toMatchObject({ ok: false })
  })
  it.each([
    { ref: { kind: 'movie' as const, id: 550 }, code: 'empty' },
    { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 }, code: 'empty' },
    { ref: { kind: 'anime' as const, id: 0, episode: 1 }, code: 'malformed' },
    { ref: { kind: 'anime' as const, id: 21, episode: 0 }, code: 'malformed' },
  ])('rejects a ref Kazora cannot address: %j', async ({ ref, code }) => {
    const { http } = fixture()
    expect(await createKazoraProvider(http, now).resolve({ ...sub, ref }, new AbortController().signal)).toMatchObject({ ok: false, code })
    expect(http).not.toHaveBeenCalled()
  })
  it('aborts cleanly mid-cascade', async () => {
    const controller = new AbortController()
    const { http } = fixture({ watch: [{ m3u8: openMaster }], masters: { [openMaster]: OPEN } })
    controller.abort(new DOMException('Aborted', 'AbortError'))
    expect(await createKazoraProvider(http, now).resolve(sub, controller.signal)).toMatchObject({ ok: false, code: 'cancelled' })
  })
})
