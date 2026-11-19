import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createTestAnimeCapability } from '../../apps/api/src/anime/test-capability'
import type { AnimeCatalog } from '../../apps/api/src/catalog/anilist/adapter'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { createPlayback } from '../../apps/api/src/playback/playback'
import { createMemoryPlaybackStore } from '../../apps/api/src/playback/state'
import { createSubtitleService } from '../../apps/api/src/subtitles/subtitles'
import { createStoreFileStore } from '../../apps/api/src/subtitles/storage'
import { configuredProviders } from '../../apps/api/src/playback/configured-providers'
import type { MediaTransport } from '../../apps/api/src/playback/transport'
import { createStaticProvider, type ProviderHttp, type ProviderRegistration, type ProviderSource } from '../../packages/provider-sdk/src/index'
import type { CatalogMovieDetail, CatalogSeriesDetail, CatalogSeason, AnimeTitleDetail } from '../../packages/contracts/src/index'

process.env.NODE_ENV = 'test'
const fixtureHost = '127-0-0-1.nip.io'
const fixtureOrigin = `http://${fixtureHost}:18560`
const mediaRoot = new URL('./media/', import.meta.url)
const fixtureServer = Bun.serve({
  hostname: '127.0.0.1', port: 18560,
  async fetch(request) {
    const name = new URL(request.url).pathname.slice(1)
    if (!/^(?:reference\.mp4|reference-180\.webm|(?:master|media|audio-master|audio)\.m3u8|audio\.aac|segment-\d{2}\.ts|english\.vtt)$/.test(name)) return new Response('Not found', { status: 404 })
    const file = await readFile(new URL(name, mediaRoot))
    const match = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/)
    const start = match ? Math.min(Number(match[1]), file.length - 1) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
    const contentType = name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.vtt') ? 'text/vtt' : name.endsWith('.ts') ? 'video/mp2t' : name.endsWith('.aac') ? 'audio/aac' : name.endsWith('.webm') ? 'video/webm' : 'video/mp4'
    return new Response(file.subarray(start, end + 1), { status: match ? 206 : 200, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'accept-ranges': 'bytes',
      'content-type': contentType, 'content-length': String(end - start + 1),
      ...(match ? { 'content-range': `bytes ${start}-${end}/${file.length}` } : {}),
    } })
  },
})

// Isolated controlled-media server. Never loaded by the production entry point.
const titles: CatalogMovieDetail[] = [1, 2, 3, 4, 5, 6, 9].map((id) => ({
  id, kind: 'movie', title: `Playback reference ${id}`, originalTitle: `Playback reference ${id}`,
  overview: 'Generated color bars and tone for playback verification.', genreNames: [],
  backdropUrl: null, posterUrl: null, logoUrl: null, popularity: 0, releaseDate: '2026-09-09',
  tmdbRating: null, tmdbVoteCount: 0, year: 2026, cast: [], certification: null, countries: [],
  creators: [], heroBackdropUrl: null, homepageUrl: null, languages: ['English'], recommendations: [], runtimeMinutes: 1, status: 'Released', tagline: null,
}))
const series: CatalogSeriesDetail = {
  ...titles[0]!, id: 7, kind: 'series', title: 'The midnight archive', originalTitle: 'The midnight archive',
  contentRating: 'TV-14', episodeRuntimeMinutes: 1,
  seasons: [1, 2].map(number => ({ number, name: `Season ${number}`, episodeCount: number === 1 ? 27 : 2, airDate: '2026-01-01', posterUrl: null })),
}
const seasons: CatalogSeason[] = series.seasons.map(season => ({
  seriesId: 7, seasonNumber: season.number, name: season.name, overview: 'Controlled episode fixtures.', posterUrl: null,
  episodes: Array.from({ length: season.episodeCount }, (_, index) => ({
    id: season.number * 100 + index + 1, seasonNumber: season.number, episodeNumber: index + 1,
    title: index === 0 ? 'A very long opening chapter in the midnight archive' : `Chapter ${index + 1}`,
    overview: 'Controlled color bars for episode continuity verification.', runtimeMinutes: 1, stillUrl: null,
    airDate: season.number === 1 && index === 26 ? '2099-01-01' : '2026-01-01',
  })),
}))
const anime: AnimeTitleDetail = {
  anilistId: 8, kind: 'anime', titles: { preferred: 'Evening stories', english: null, romaji: null, native: null },
  format: 'TV', status: 'RELEASING', season: null, seasonYear: 2026, episodes: 10, episodeDuration: 1,
  genres: [], coverImage: { url: 'https://image.tmdb.org/t/p/w500/anime-cover.jpg', color: null }, bannerImage: 'https://image.tmdb.org/t/p/w1280/anime-banner.jpg', averageScore: null, popularity: 0,
  description: 'Controlled anime episodes for player verification.', nextAiringEpisode: { episode: 10, airingAt: '2099-01-01T00:00:00.000Z' },
  malId: null, logoUrl: null, source: null, countryOfOrigin: 'JP', trailer: null,
  characters: [], staff: [], streamingEpisodes: [], externalLinks: [], recommendations: [],
}
const unsupportedAnimeFixture = async (): Promise<never> => { throw new Error('This endpoint is outside the playback fixture.') }
const animeCatalog: AnimeCatalog = {
  title: async () => anime, search: unsupportedAnimeFixture, trending: unsupportedAnimeFixture,
  seasonal: unsupportedAnimeFixture, browse: unsupportedAnimeFixture, relations: unsupportedAnimeFixture,
  airingSchedule: unsupportedAnimeFixture, batch: unsupportedAnimeFixture,
}
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
  if (!/^(?:reference\.mp4|reference-180\.webm|(?:master|media)\.m3u8|segment-\d{2}\.ts|english\.vtt)$/.test(name)) throw new Error('Unknown fixture.')
  const media = await readFile(new URL(`./media/${name}`, import.meta.url))
  const imageWrapped = wrapped && name.endsWith('.ts')
  const file = imageWrapped ? Buffer.concat([Buffer.alloc(70, 0x89), media]) : media
  const type = imageWrapped ? 'image/png' : name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.vtt') ? 'text/vtt' : name.endsWith('.ts') ? 'video/mp2t' : name.endsWith('.webm') ? 'video/webm' : 'video/mp4'
  const range = headers.Range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = range ? Number(range[1]) : 0
  const end = range?.[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1
  return { url, status: range ? 206 : 200, headers: new Headers({
    'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1),
    ...(range ? { 'content-range': `bytes ${start}-${end}/${file.length}` } : {}),
  }), body: Readable.from([file.subarray(start, end + 1)]) }
}
const providers: ProviderRegistration[] = ['primary', 'backup'].map((id) => {
  const staticAdapter = createStaticProvider(id, [...titles.filter((title) => title.id !== 4).map((title) => {
    const source: ProviderSource = {
      key: 'main', url: `${fixtureOrigin}/${title.id === 3 && id === 'primary' ? 'missing.mp4' : title.id === 2 ? 'master.m3u8' : 'reference.mp4'}?provider=${id}`,
      type: title.id === 2 ? 'hls' : 'native', language: 'original',
      expiresAt: '2099-01-01T00:00:00.000Z', headers: {},
      subtitles: [{ id: 'en', label: 'English', language: 'en', format: 'vtt', url: 'https://fixture.example/english.vtt' }],
      ...(title.id === 9 && id === 'primary' ? { height: 360, qualityHint: '360p', qualityGroup: 'fixture-movie-9' } : {}),
    }
    const sources = title.id === 9 && id === 'primary'
      ? [source, { ...source, key: 'low', url: `${fixtureOrigin}/reference-180.webm?provider=${id}`, height: 180, qualityHint: '180p' }]
      : [source]
    return { ref: { kind: title.kind, id: title.id }, sources }
  }), ...seasons.flatMap(season => season.episodes.filter(episode => episode.episodeNumber !== 4).map(episode => ({
    ref: { kind: 'series' as const, id: 7, season: season.seasonNumber, episode: episode.episodeNumber },
    sources: [{ key: 'main', url: `${fixtureOrigin}/reference.mp4?provider=${id}&season=${season.seasonNumber}&episode=${episode.episodeNumber}`, type: 'native' as const, language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }],
  }))), ...Array.from({ length: 9 }, (_, index) => ({
    ref: { kind: 'anime' as const, id: 8, episode: index + 1 },
    sources: [
      { key: 'main', url: `${fixtureOrigin}/reference.mp4?provider=${id}&anime=8&episode=${index + 1}&audio=sub`, type: 'native' as const, language: 'ja', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] },
      { key: 'dub', url: `${fixtureOrigin}/reference.mp4?provider=${id}&anime=8&episode=${index + 1}&audio=dub`, type: 'native' as const, language: 'en', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] },
    ],
  }))])
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
  mediaKinds: ['movie', 'series', 'anime'],
  }
})
providers.push(...configuredProviders([{
  id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: [fixtureHost], upstreamGroup: 'vixsrc',
}], { transport }))
providers.push({
  adapter: Object.assign(createStaticProvider('fixture-audio', [{ ref: { kind: 'movie', id: 1 }, sources: [{
    key: 'japanese', url: `${fixtureOrigin}/audio-master.m3u8`, type: 'hls', language: 'ja',
    expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [],
  }] }]), { separateAudio: { label: 'Fixture audio' } }),
  role: 'audio', enabled: true, approvedRegions: ['US'], mediaHosts: [fixtureHost, 'fixture.example'],
  upstreamGroup: 'fixture-audio', concurrency: 2, requestsPerMinute: 30, mediaKinds: ['movie'],
})
const audioHttp: ProviderHttp = async (url, _headers, signal) => {
  signal.throwIfAborted()
  const name = new URL(url).pathname.slice(1)
  if (name !== 'audio-master.m3u8' && name !== 'audio.m3u8') return { status: 404, url: `https://fixture.example/${name}`, text: '', headers: new Headers() }
  return { status: 200, url: `https://fixture.example/${name}`, text: await readFile(new URL(name, mediaRoot), 'utf8'), headers: new Headers({ 'content-type': 'application/vnd.apple.mpegurl' }) }
}
let playback = createPlayback({ providers, store, region: 'US', audioHttp })
const subtitleRaws = [
  ...Array.from({ length: 25 }, (_, i) => ({ provider: 'fixture-subtitles', lang: 'en', label: `English release ${i + 1}`, format: 'srt' as const, url: `https://subs.example/en-${i + 1}.srt` })),
  ...['اَلْعَرَبِيَّةُ', 'Albanian'].map((label, i) => ({ provider: 'fixture-subtitles', lang: 'ar', label, format: 'srt' as const, url: `https://subs.example/ar-${i + 1}.srt` })),
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
  providers: [{ id: 'fixture-subtitles', name: 'Fixture subtitles', supports: (query) => query.tmdbId === 5 || query.tmdbId === 9, search: async () => subtitleRaws }],
  animeTitle: async () => ({ title: 'Fixture' }), store, files: subtitleFiles, origin: 'http://127.0.0.1:27911',
})
const app = await buildApp({
  env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:27911' }),
  // These browser checks share one long-lived fixture server. Production
  // route quotas belong to API tests, not the cross-test fixture process.
  enableRateLimit: false,
  catalog: createFakeCatalog({ titles: [...titles, series], seasons }),
  subtitles,
  animeCapability: createTestAnimeCapability(animeCatalog, {
    canonicalEpisodeArt: { episodeByAnilistId: async (_id, episode) => ({ title: `Evening ${episode}`, synopsis: 'A controlled episode.', stillUrl: 'https://image.tmdb.org/t/p/w1280/anime-episode-still.jpg', airDate: '2026-01-01' }) },
  }),
  playback: {
    relayManifest: (...args) => playback.relayManifest(...args),
    beginAttempt: (...args) => playback.beginAttempt!(...args),
    continueAttempt: (...args) => playback.continueAttempt!(...args),
    cancelAttempt: (...args) => playback.cancelAttempt!(...args),
    resolve: (...args) => playback.resolve(...args),
    recover: (...args) => playback.recover(...args),
    listProviders: (...args) => playback.listProviders(...args),
    switchProvider: (...args) => playback.switchProvider(...args),
    listAudio: (...args) => playback.listAudio(...args),
    prepareAudio: (...args) => playback.prepareAudio(...args),
    events: (...args) => playback.events(...args),
  },
})
app.post('/__fixtures/reset', { config: { rateLimit: false } }, async () => {
  await store.close()
  await warmSubtitleFiles()
  playback = createPlayback({ providers, store, region: 'US', audioHttp })
  return { ok: true }
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close().then(() => { fixtureServer.stop(); process.exit(0) }))
await app.listen({ host: '127.0.0.1', port: 18559 })
