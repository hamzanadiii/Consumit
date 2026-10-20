import { describe, expect, it, vi } from 'vitest'
import { createStreamingUnityProvider, type StreamingUnityMetadataResolver } from './streamingunity.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-17T00:00:00Z')
const movie = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 2, episode: 5 }, region: 'US', audioLanguage: 'en' }
const metadata: StreamingUnityMetadataResolver = async () => ({ title: 'Fight Club', year: 1999 })
const metadataSeries: StreamingUnityMetadataResolver = async () => ({ title: 'Breaking Bad', year: 2008 })
const version = 'v-123'
const dataPage = `<div data-page="${JSON.stringify({ version }).replace(/"/g, '&quot;')}"></div>`
const expires = '1800000000'
const masterUrl = `https://vixcloud.co/playlist/276867?token=tok&expires=${expires}&lang=en`
const master = ['#EXTM3U', '#EXT-X-TARGETDURATION:10', '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080', 'v_1080.m3u8'].join('\n')
const inertiaHeaders = { 'content-type': 'application/json, text/html, application/xhtml+xml' }

type Options = {
  searchTitles?: unknown[]
  watchPage?: unknown
  detailPage?: unknown
  seasonPage?: unknown
  iframeHtml?: string
  embedHtml?: string
  masterBody?: string
  versionStatus?: number
}
function fixture(options: Options = {}) {
  const watchPage = options.watchPage ?? {
    component: 'Titles/Watch',
    props: { title: { tmdb_id: 550, name: 'Fight Club' }, embedUrl: '/en/iframe/101?episode_id=9' },
  }
  return vi.fn<ProviderHttp>(async (url, headers) => {
    if (url === 'https://streamingunity.fun/en') {
      if (options.versionStatus) return { url, text: '', status: options.versionStatus, headers: new Headers() }
      return { url, text: dataPage, status: 200, headers: new Headers({ 'content-type': 'text/html' }) }
    }
    if (url.startsWith('https://streamingunity.fun/en/search')) {
      return { url, text: JSON.stringify({ component: 'Search', props: { titles: options.searchTitles ?? [{ id: 101, slug: 'fight-club', name: 'Fight Club', type: 'movie' }] } }), status: 200, headers: new Headers(inertiaHeaders) }
    }
    const watchWithEpisode = url.match(/^https:\/\/streamingunity\.fun\/en\/watch\/(\d+)\?e=(\d+)$/)
    if (watchWithEpisode) {
      // The season fixture maps internal id 55 to human-readable number 5.
      const episodeNumbers: Record<string, number> = { '55': 5 }
      return { url, text: JSON.stringify({ component: 'Titles/Watch', props: { episode: { number: episodeNumbers[watchWithEpisode[2]!] ?? Number(watchWithEpisode[2]), season: { number: 2 } }, embedUrl: `/en/iframe/${watchWithEpisode[1]}?episode_id=9` } }), status: 200, headers: new Headers(inertiaHeaders) }
    }
    if (url.startsWith('https://streamingunity.fun/en/watch/')) {
      return { url, text: JSON.stringify(watchPage), status: 200, headers: new Headers(inertiaHeaders) }
    }
    if (url.startsWith('https://streamingunity.fun/en/titles/202-bad-choice')) {
      if (url.includes('season-2')) {
        return { url, text: JSON.stringify(options.seasonPage ?? { component: 'Titles/Title', props: { loadedSeason: { number: 2, episodes: [{ id: 55, number: 5, scws_id: 1 }] } } }), status: 200, headers: new Headers(inertiaHeaders) }
      }
      return { url, text: JSON.stringify(options.detailPage ?? { component: 'Titles/Title', props: { title: { id: 202, slug: 'bad-choice', tmdb_id: 1396, seasons: [{ number: 1 }, { number: 2 }] } } }), status: 200, headers: new Headers(inertiaHeaders) }
    }
    if (url.startsWith('https://streamingunity.fun/en/iframe/')) {
      return { url, text: options.iframeHtml ?? '<iframe src="https://vixcloud.co/embed/abc?token=x"></iframe>https://vixcloud.co/embed/abc?token=x', status: 200, headers: new Headers({ 'content-type': 'text/html' }) }
    }
    if (url.startsWith('https://vixcloud.co/embed/')) {
      return { url, text: options.embedHtml ?? `window.masterPlaylist = { url: 'https://vixcloud.co/playlist/276867', params: { 'token': 'tok', 'expires': '${expires}', 'asn': '1' } };`, status: 200, headers: new Headers({ 'content-type': 'text/html' }) }
    }
    if (url.startsWith('https://vixcloud.co/playlist/')) {
      return { url, text: options.masterBody ?? master, status: 200, headers: new Headers({ 'content-type': 'application/vnd.apple.mpegurl', 'access-control-allow-origin': '*' }) }
    }
    void headers
    return { url, text: '', status: 404, headers: new Headers() }
  })
}

describe('StreamingUnity adapter', () => {
  it('resolves a movie through search, watch, iframe, embed, and the assembled master', async () => {
    const http = fixture()
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({
      ok: true,
      sources: [{
        key: 'streamingunity:auto:0', url: masterUrl, type: 'hls', height: 1080, qualityHint: '1080p',
        headers: {}, subtitles: [],
      }],
    })
    const urls = http.mock.calls.map(([url]) => url)
    expect(urls[0]).toBe('https://streamingunity.fun/en')
    expect(urls.some((url) => url.startsWith('https://streamingunity.fun/en/search?q=Fight%20Club'))).toBe(true)
    expect(urls.some((url) => url.startsWith('https://streamingunity.fun/en/watch/101'))).toBe(true)
    expect(urls.some((url) => url.startsWith('https://streamingunity.fun/en/iframe/'))).toBe(true)
    expect(urls.some((url) => url.startsWith('https://vixcloud.co/embed/'))).toBe(true)
    expect(urls.at(-1)).toBe(masterUrl)
  })
  it('sends the inertia version header after the handshake', async () => {
    const http = fixture()
    await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)
    const searchCall = http.mock.calls.find(([, headers]) => headers['x-inertia'] === 'true')
    expect(searchCall?.[1]).toMatchObject({ 'x-inertia-version': version })
  })
  it('resolves TV through the title detail, season page, and episode watch route', async () => {
    const http = fixture({ searchTitles: [{ id: 202, slug: 'bad-choice', name: 'Breaking Bad', type: 'tv' }] })
    expect(await createStreamingUnityProvider(http, metadataSeries, now).resolve(series, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ key: 'streamingunity:auto:0' }] })
    const urls = http.mock.calls.map(([url]) => url)
    expect(urls.some((url) => url.startsWith('https://streamingunity.fun/en/titles/202-bad-choice'))).toBe(true)
    expect(urls.some((url) => url === 'https://streamingunity.fun/en/watch/202?e=55')).toBe(true)
  })
  it('skips a candidate whose watch page tmdb_id does not match the ref', async () => {
    const http = fixture({ watchPage: { component: 'Titles/Watch', props: { title: { tmdb_id: 999, name: 'Wrong' }, embedUrl: '/en/iframe/101?episode_id=9' } } })
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('maps an episode without scws_id to a non-retryable empty result', async () => {
    const http = fixture({
      searchTitles: [{ id: 202, slug: 'bad-choice', name: 'Breaking Bad', type: 'tv' }],
      seasonPage: { component: 'Titles/Title', props: { loadedSeason: { number: 2, episodes: [{ id: 55, number: 5 }] } } },
    })
    expect(await createStreamingUnityProvider(http, metadataSeries, now).resolve(series, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
  })
  it('maps an empty search to a content gap', async () => {
    const http = fixture({ searchTitles: [] })
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
  })
  it('fails closed when the iframe has no vixcloud embed', async () => {
    const http = fixture({ iframeHtml: '<html>no player</html>' })
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('fails closed when the embed page has no masterPlaylist', async () => {
    const http = fixture({ embedHtml: '<html>no playlist</html>' })
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('fails closed when the assembled master is not a playlist', async () => {
    const http = fixture({ masterBody: '<html>gone</html>' })
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('rejects a master assembled on a foreign host', async () => {
    const http = fixture({ embedHtml: "window.masterPlaylist = { url: 'https://evil.example/playlist/1', params: { 'token': 'tok' } };" })
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('rejects anime refs before any upstream call', async () => {
    const http = fixture()
    expect(await createStreamingUnityProvider(http, metadata, now).resolve({ ...movie, ref: { kind: 'anime' as const, id: 21, episode: 3 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
  it('refreshes the inertia version once when a page answers 409', async () => {
    const base = fixture()
    let conflictOnce = true
    const http = vi.fn<ProviderHttp>(async (url, headers) => {
      if (url.startsWith('https://streamingunity.fun/en/search') && conflictOnce) {
        conflictOnce = false
        return { url, text: '', status: 409, headers: new Headers() }
      }
      return base(url, headers, new AbortController().signal)
    })
    expect(await createStreamingUnityProvider(http, metadata, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: true })
    expect(http.mock.calls.some(([url]) => url === 'https://streamingunity.fun/en')).toBe(true)
  })
})
