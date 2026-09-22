import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { createPlayback } from '../../apps/api/src/playback/playback'
import { createMemoryPlaybackStore } from '../../apps/api/src/playback/state'
import { configuredProviders } from '../../apps/api/src/playback/configured-providers'
import type { MediaTransport } from '../../apps/api/src/playback/transport'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '../../packages/provider-sdk/src/index'
import type { CatalogMovieDetail } from '../../packages/contracts/src/index'

// Isolated controlled-media server. Never loaded by the production entry point.
const titles: CatalogMovieDetail[] = [1, 2, 3, 4].map((id) => ({
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
      : name === 'fixture-player' ? `var master = {url: 'https://fixture.example/master.m3u8', 'token': 'fixture-only', 'expires': '${Math.floor(Date.now() / 1000) + 3600}'};` : ''
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
const providers: ProviderRegistration[] = ['primary', 'backup'].map((id) => ({
  adapter: createStaticProvider(id, titles.filter((title) => title.id !== 4).map((title) => ({ ref: { kind: title.kind, id: title.id }, sources: [{
    key: 'main', url: `https://fixture.example/${title.id === 3 && id === 'primary' ? 'missing.mp4' : title.id === 2 ? 'master.m3u8' : 'reference.mp4'}`,
    type: title.id === 2 ? 'hls' : 'native', language: 'original',
    expiresAt: '2099-01-01T00:00:00.000Z', headers: {},
    subtitles: [{ id: 'en', label: 'English', language: 'en', format: 'vtt', url: 'https://fixture.example/english.vtt' }],
  } satisfies ProviderSource] }))),
  enabled: true, approvedRegions: ['US'], mediaHosts: ['fixture.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30,
}))
providers.push(...configuredProviders([{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['fixture.example'], upstreamGroup: 'vixsrc' }], { transport }))
let playback = createPlayback({ providers, store, region: 'US' })
const app = await buildApp({
  env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:27911' }),
  catalog: createFakeCatalog({ titles }),
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
  playback = createPlayback({ providers, store, region: 'US' })
  return { ok: true }
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close().then(() => process.exit(0)))
await app.listen({ host: '127.0.0.1', port: 18559 })
