import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { createPlayback } from '../../apps/api/src/playback/playback'
import { createMemoryPlaybackStore } from '../../apps/api/src/playback/state'
import { createSubtitleService } from '../../apps/api/src/subtitles/subtitles'
import { createStoreFileStore } from '../../apps/api/src/subtitles/storage'
import { configuredProviders } from '../../apps/api/src/playback/configured-providers'
import type { MediaTransport } from '../../apps/api/src/playback/transport'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '../../packages/provider-sdk/src/index'
import type { CatalogMovieDetail } from '../../packages/contracts/src/index'

process.env.NODE_ENV = 'test'
const fixtureHost = '127-0-0-1.nip.io'
const fixtureOrigin = `http://${fixtureHost}:18560`
const mediaRoot = new URL('./media/', import.meta.url)
const fixtureServer = Bun.serve({
  hostname: '127.0.0.1', port: 18560,
  async fetch(request) {
    const name = new URL(request.url).pathname.slice(1)
    if (!/^(?:reference\.mp4|(?:master|media)\.m3u8|segment-\d{2}\.ts|english\.vtt)$/.test(name)) return new Response('Not found', { status: 404 })
    const file = await readFile(new URL(name, mediaRoot))
    const match = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/)
    const start = match ? Math.min(Number(match[1]), file.length - 1) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
    const contentType = name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.vtt') ? 'text/vtt' : name.endsWith('.ts') ? 'video/mp2t' : 'video/mp4'
    return new Response(file.subarray(start, end + 1), { status: match ? 206 : 200, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'accept-ranges': 'bytes',
      'content-type': contentType, 'content-length': String(end - start + 1),
      ...(match ? { 'content-range': `bytes ${start}-${end}/${file.length}` } : {}),
    } })
  },
})

// Isolated controlled-media server. Never loaded by the production entry point.
const titles: CatalogMovieDetail[] = [1, 2, 3, 4, 5, 6].map((id) => ({
  id, kind: 'movie', title: `Playback reference ${id}`, originalTitle: `Playback reference ${id}`,
  overview: 'Generated color bars and tone for playback verification.', genreNames: [],
  backdropUrl: null, posterUrl: null, logoUrl: null, popularity: 0, releaseDate: '2026-09-09',
  tmdbRating: null, tmdbVoteCount: 0, year: 2026, cast: [], certification: null, countries: [],
  creators: [], heroBackdropUrl: null, homepageUrl: null, languages: ['English'], recommendations: [], runtimeMinutes: 1, status: 'Released', tagline: null,
}))
const store = createMemoryPlaybackStore()
const transport: MediaTransport = async (url, _hosts, headers) => {
  const pathname = new URL(url).pathname
  const wrapped = pathname.startsWith('/wrapped/')
  const name = pathname.slice(wrapped ? '/wrapped/'.length : 1)
  if (new URL(url).hostname === 'vixsrc.to') {
    const text = name === 'api/movie/4' ? '{"src":"/fixture-player"}'
      : name === 'fixture-player' ? `var master = {url: '${fixtureOrigin}/master.m3u8', 'token': 'fixture-only', 'expires': '${Math.floor(Date.now() / 1000) + 3600}'};` : ''
    return { url, status: text ? 200 : 404, headers: new Headers({ 'content-type': 'text/html' }), body: Readable.from([text]) }
  }
  if (!/^(?:reference\.mp4|(?:master|media)\.m3u8|segment-\d{2}\.ts|english\.vtt)$/.test(name)) throw new Error('Unknown fixture.')
  const media = await readFile(new URL(`./media/${name}`, import.meta.url))
  const imageWrapped = wrapped && name.endsWith('.ts')
  const file = imageWrapped ? Buffer.concat([Buffer.alloc(70, 0x89), media]) : media
  const type = imageWrapped ? 'image/png' : name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.vtt') ? 'text/vtt' : name.endsWith('.ts') ? 'video/mp2t' : 'video/mp4'
  const range = headers.Range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = range ? Number(range[1]) : 0
  const end = range?.[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1
  return { url, status: range ? 206 : 200, headers: new Headers({
    'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1),
    ...(range ? { 'content-range': `bytes ${start}-${end}/${file.length}` } : {}),
  }), body: Readable.from([file.subarray(start, end + 1)]) }
}
const providers: ProviderRegistration[] = ['primary', 'backup'].map((id) => {
  const staticAdapter = createStaticProvider(id, titles.filter((title) => title.id !== 4).map((title) => ({ ref: { kind: title.kind, id: title.id }, sources: [{
    key: 'main', url: `${fixtureOrigin}/${title.id === 3 && id === 'primary' ? 'missing.mp4' : title.id === 2 ? 'master.m3u8' : 'reference.mp4'}?provider=${id}`,
    type: title.id === 2 ? 'hls' : 'native', language: 'original',
    expiresAt: '2099-01-01T00:00:00.000Z', headers: {},
    subtitles: [{ id: 'en', label: 'English', language: 'en', format: 'vtt', url: 'https://fixture.example/english.vtt' }],
  } satisfies ProviderSource] })))
  let lease = 0
  return {
  adapter: { ...staticAdapter, async resolve(input, signal) {
    const result = await staticAdapter.resolve(input, signal)
    if (!result.ok || ![5, 6].includes(input.ref.id)) return result
    lease += 1
    return { ok: true as const, sources: result.sources.map((source) => ({
      ...source, url: `${fixtureOrigin}/reference.mp4?provider=${id}${input.ref.id === 5 ? `&lease=${lease}` : ''}`,
      // Validation requires more than thirty seconds of source validity.
      // The API subtracts five seconds and the player renews fifteen early.
      expiresAt: new Date(Date.now() + 31_000).toISOString(),
    })) }
  } },
  enabled: true, approvedRegions: ['US'], mediaHosts: [fixtureHost, 'fixture.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30,
  mediaKinds: ['movie'],
  }
})
providers.push(...configuredProviders([{
  id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: [fixtureHost], upstreamGroup: 'vixsrc',
}], { transport }))
let playback = createPlayback({ providers, store, region: 'US' })
const subtitleRaws = [
  ...Array.from({ length: 25 }, (_, i) => ({ provider: 'fixture-subtitles', lang: 'en', label: `English release ${i + 1}`, format: 'srt' as const, url: `https://subs.example/en-${i + 1}.srt` })),
  ...Array.from({ length: 2 }, (_, i) => ({ provider: 'fixture-subtitles', lang: 'ar', label: `Arabic release ${i + 1}`, format: 'srt' as const, url: `https://subs.example/ar-${i + 1}.srt` })),
]
const subtitleFiles = createStoreFileStore(store)
async function warmSubtitleFiles() {
  for (const raw of subtitleRaws) {
    const key = createHash('sha1').update(`${raw.provider}|${raw.url}|${raw.lang}`).digest('hex').slice(0, 16)
    await subtitleFiles.putVtt(key, 'WEBVTT\n\n00:00:01.000 --> 00:00:30.000\nFixture caption\n', { content: `tmdb/movie/5/1/1/${raw.lang}`, ttlSeconds: 3600 })
  }
}
await warmSubtitleFiles()
const subtitles = createSubtitleService({
  providers: [{ id: 'fixture-subtitles', name: 'Fixture subtitles', supports: (query) => query.tmdbId === 5, search: async () => subtitleRaws }],
  animeTitle: async () => ({ title: 'Fixture' }), store, files: subtitleFiles, origin: 'http://127.0.0.1:27911',
})
const app = await buildApp({
  env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:27911' }),
  catalog: createFakeCatalog({ titles }),
  subtitles,
  playback: {
    resolve: (...args) => playback.resolve(...args),
    recover: (...args) => playback.recover(...args),
    listProviders: (...args) => playback.listProviders(...args),
    switchProvider: (...args) => playback.switchProvider(...args),
    events: (...args) => playback.events(...args),
  },
})
app.post('/__fixtures/reset', { config: { rateLimit: false } }, async () => {
  await store.close()
  await warmSubtitleFiles()
  playback = createPlayback({ providers, store, region: 'US' })
  return { ok: true }
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close().then(() => { fixtureServer.stop(); process.exit(0) }))
await app.listen({ host: '127.0.0.1', port: 18559 })
