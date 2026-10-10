import { describe, expect, it, vi } from 'vitest'
import { createKisskhProvider } from './kisskh.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-09T00:00:00Z')
const metadata = async () => ({ title: 'Game of Thrones', year: 2011 })
const master = 'https://hls03.cdnvideo11.shop/Game-Of-Thrones---Season-1Ep1.m3u8'
const PLAYLIST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\n//hls03.verois3.site/abc.png\n'

const SEARCH = JSON.stringify([
  { id: 3050, title: 'Game Of Thrones - Season 1' },
  { id: 1, title: 'Squid Game' },
])
const DETAIL = JSON.stringify({ episodes: [{ id: 63712, number: 1 }, { id: 63711, number: 2 }] })
const VID_TOKEN = JSON.stringify({ result: 'a'.repeat(256) })
const SUB_TOKEN = JSON.stringify({ result: 'b'.repeat(256) })
const EPISODE = JSON.stringify({ Video: master })
const SUBS = JSON.stringify([
  { src: 'https://sub.cdnvideo11.shop/sub/abc.srt', label: 'English', land: 'en' },
  { src: 'https://sub.cdnvideo11.shop/sub/def.vtt', label: 'Khmer', land: 'km' },
  { src: 'http://insecure.example/x.srt', label: 'Bad' },
])

function fixture(options: { playlist?: { status: number; text: string; acao?: string | null }; search?: string; episode?: string } = {}) {
  const playlist = options.playlist ?? { status: 200, text: PLAYLIST, acao: '*' }
  const calls: string[] = []
  const http = vi.fn<ProviderHttp>(async (url) => {
    calls.push(url)
    if (url.includes('/DramaList/Search')) return { url, status: 200, text: options.search ?? SEARCH, headers: new Headers() }
    if (url.includes('/DramaList/Drama/')) return { url, status: 200, text: DETAIL, headers: new Headers() }
    if (url.includes('/enc-kisskh')) return { url, status: 200, text: url.includes('type=sub') ? SUB_TOKEN : VID_TOKEN, headers: new Headers() }
    if (url.includes('/DramaList/Episode/')) return { url, status: 200, text: options.episode ?? EPISODE, headers: new Headers() }
    if (url.includes('/Sub/')) return { url, status: 200, text: SUBS, headers: new Headers() }
    if (url.includes('.m3u8')) return { url, status: playlist.status, text: playlist.text, headers: new Headers({ ...(playlist.acao ? { 'access-control-allow-origin': playlist.acao } : {}) }) }
    return { url, status: 404, text: '', headers: new Headers() }
  })
  return { http, calls }
}

const input = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' }

describe('KissKH adapter', () => {
  it('searches by title, mints a kkey, and returns the CORS-open master with SRT subs', async () => {
    const { http, calls } = fixture()
    const result = await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)
    expect(calls[0]).toContain('https://kisskh.do/api/DramaList/Search?q=Game%20of%20Thrones')
    expect(calls).toContain('https://enc-dec.app/api/enc-kisskh?text=63712&type=vid')
    expect(calls).toContain('https://kisskh.do/api/DramaList/Episode/63712.png?err=false&ts=&time=&kkey=' + 'a'.repeat(256))
    expect(result).toMatchObject({ ok: true, sources: [{ url: master, type: 'hls', language: 'original', qualityHint: 'Auto' }] })
    const source = result.ok ? result.sources[0]! : undefined
    expect(source?.subtitles).toHaveLength(2)
    expect(source?.subtitles[0]).toMatchObject({ id: 'kisskh:63712:0', label: 'English', language: 'en', format: 'srt' })
    expect(source?.subtitles[1]).toMatchObject({ format: 'vtt' })
  })
  it('resolves a movie as episode 1', async () => {
    const { http, calls } = fixture()
    await createKisskhProvider(http, metadata, now).resolve(
      { ...input, ref: { kind: 'movie' as const, id: 27205 } },
      new AbortController().signal,
    )
    expect(calls).toContain('https://kisskh.do/api/DramaList/Drama/3050')
    expect(calls).toContain('https://enc-dec.app/api/enc-kisskh?text=63712&type=vid')
  })
  it('picks the highest-scoring title match', async () => {
    const { http } = fixture({ search: JSON.stringify([{ id: 9, title: 'Game' }, { id: 3050, title: 'Game Of Thrones - Season 1' }]) })
    const result = await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)
    expect(result.ok && result.sources[0]?.key).toBe('kisskh:3050:63712')
  })
  it('skips a gated master and reports empty', async () => {
    const { http } = fixture({ playlist: { status: 403, text: '', acao: null } })
    expect(await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('skips a master served without CORS', async () => {
    const { http } = fixture({ playlist: { status: 200, text: PLAYLIST, acao: null } })
    expect(await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('skips a master whose body is not a playlist', async () => {
    const { http } = fixture({ playlist: { status: 200, text: '<html>nope</html>', acao: '*' } })
    expect(await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('returns native for an mp4 stream without a playlist probe', async () => {
    const { http, calls } = fixture({ episode: JSON.stringify({ Video: 'https://hls03.cdnvideo11.shop/video.mp4' }) })
    const result = await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://hls03.cdnvideo11.shop/video.mp4', type: 'native' }] })
    expect(calls.some((call) => call.includes('.m3u8'))).toBe(false)
  })
  it.each([
    { search: '[]' },
    { search: JSON.stringify([{ id: 1, title: 'Unrelated' }]) },
    { episode: JSON.stringify({ Video: 'javascript:alert(1)' }) },
    { episode: JSON.stringify({ Video: 'not-a-url' }) },
    { episode: JSON.stringify({}) },
  ])('returns no source for a miss: %j', async (options) => {
    const { http } = fixture(options)
    expect(await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
  })
  it('reports unavailable when the kkey mint fails', async () => {
    const { http } = fixture()
    http.mockImplementationOnce(async (url) => ({ url, status: 500, text: '', headers: new Headers() }))
    // first call is the search; force the vid mint to fail instead
    const failing = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/enc-kisskh')) return { url, status: 500, text: '', headers: new Headers() }
      return fixture().http(url, {}, new AbortController().signal)
    })
    expect(await createKisskhProvider(failing, metadata, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable' })
  })
  it.each([
    { ref: { kind: 'anime' as const, id: 21, episode: 1 } },
  ])('rejects a ref KissKH cannot address: %j', async ({ ref }) => {
    const { http } = fixture()
    expect(await createKisskhProvider(http, metadata, now).resolve({ ...input, ref }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('bounds the master probe', async () => {
    const { http, calls } = fixture()
    await createKisskhProvider(http, metadata, now).resolve(input, new AbortController().signal)
    const probe = calls.find((call) => call.includes('.m3u8'))
    expect(probe).toBeDefined()
  })
  it('aborts cleanly', async () => {
    const controller = new AbortController()
    const { http } = fixture()
    controller.abort(new DOMException('Aborted', 'AbortError'))
    expect(await createKisskhProvider(http, metadata, now).resolve(input, controller.signal)).toMatchObject({ ok: false, code: 'cancelled' })
  })
})
