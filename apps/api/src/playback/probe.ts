import { parseArgs } from 'node:util'
import { playbackRefSchema } from '@consumit/contracts'
import { loadConfiguredProviders } from './configured-providers.ts'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { fetchMedia } from './transport.ts'

// Explicit diagnostic entry point, never imported by the API or run during normal startup.
// Resolves through configured providers and reads manifests plus the first media chunk.
const { values } = parseArgs({ options: {
  config: { type: 'string' }, movie: { type: 'string' }, series: { type: 'string' },
  season: { type: 'string' }, episode: { type: 'string' }, region: { type: 'string', default: 'US' },
}, strict: true })
if (!values.config || Boolean(values.movie) === Boolean(values.series)) {
  throw new Error('Use --config <providers file> --movie <TMDB ID> OR --series <TMDB ID> --season <number> --episode <number>, with --region <country>.')
}
const ref = playbackRefSchema.parse(values.movie ? { kind: 'movie', id: Number(values.movie) }
  : { kind: 'series', id: Number(values.series), season: Number(values.season), episode: Number(values.episode) })
const providers = await loadConfiguredProviders(values.config, { tmdbToken: process.env.TMDB_API_READ_TOKEN })
const browserHeaders = { 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/150 Safari/537.36' }
if (!providers.length) throw new Error('No enabled providers in this configuration.')

for (const provider of providers) {
  const store = createMemoryPlaybackStore()
  const playback = createPlayback({ providers: [provider], store, region: values.region })
  const started = Date.now()
  try {
    const signal = AbortSignal.timeout(15000)
    const session = await playback.resolve('diagnostic', { ref, audioLanguage: 'en', capabilities: { hls: true, native: true, dash: false, nativeHls: true } }, signal)
    const resolvedMs = Date.now() - started
    // Direct walk: the session src is an upstream URL by construction.
    let path = session.source.src
    let reachedMedia = false
    for (let depth = 0; depth < 4; depth++) {
      const response = await fetchMedia(path, provider.mediaHosts, browserHeaders, signal)
      const responseUrl = response.url
      try {
        const contentType = response.headers.get('content-type') ?? ''
        if (!/mpegurl/i.test(contentType)) {
          if (!/^(?:video\/|audio\/|application\/(?:octet-stream|mp4))/i.test(contentType)) throw new Error('Unexpected media content type.')
          const first = await response.body[Symbol.asyncIterator]().next()
          if (first.done) throw new Error('Empty media response.')
          reachedMedia = true
          console.log(JSON.stringify({ provider: provider.adapter.id, ref, outcome: 'first-media-bytes', resolvedMs, elapsedMs: Date.now() - started, contentType }))
          break
        }
        const chunks: Buffer[] = []
        for await (const chunk of response.body) chunks.push(Buffer.from(chunk))
        const manifest = Buffer.concat(chunks).toString('utf8')
        const next = manifest.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('#'))
        if (!next) throw new Error('No media rendition in manifest.')
        path = new URL(next, responseUrl).href
      } finally { response.body.destroy() }
    }
    if (!reachedMedia) throw new Error('Playlist nesting limit reached.')
  } catch {
    // Do not print thrown transport errors: upstream errors may contain signed URLs.
    console.log(JSON.stringify({ provider: provider.adapter.id, ref, outcome: 'failed', elapsedMs: Date.now() - started }))
    process.exitCode = 1
  } finally { await store.close() }
}
