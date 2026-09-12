import { parseArgs } from 'node:util'
import { playbackRefSchema } from '@consumit/contracts'
import { loadConfiguredProviders } from './configured-providers.ts'
import { createPlayback } from './playback.ts'
import { createCapabilityRegistry, runDeliveryProbes } from './delivery.ts'
import { collectCanaryTargets } from './delivery-canary.ts'
import { certifyExpiry, certifyTimeline, certifyVariantSeek } from './delivery-cert.ts'
import { createTmdbMetadataResolver, type TitleMetadataResolver } from './tmdb-metadata.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { fetchMedia } from './transport.ts'

// Explicit diagnostic entry point, never imported by the API or run during normal startup.
// Reads manifests and the first media chunk; does not certify decoding or sustained viewing.
const { values } = parseArgs({ options: {
  config: { type: 'string' }, movie: { type: 'string' }, series: { type: 'string' },
  season: { type: 'string' }, episode: { type: 'string' }, region: { type: 'string', default: 'US' },
  canary: { type: 'boolean', default: false },
}, strict: true })
if (!values.config || Boolean(values.movie) === Boolean(values.series)) {
  throw new Error('Use --config <approved file> --movie <TMDB ID> OR --series <TMDB ID> --season <number> --episode <number>, with --region <country>.')
}
const ref = playbackRefSchema.parse(values.movie ? { kind: 'movie', id: Number(values.movie) }
  : { kind: 'series', id: Number(values.series), season: Number(values.season), episode: Number(values.episode) })
const providers = await loadConfiguredProviders(values.config, { tmdbToken: process.env.TMDB_API_READ_TOKEN })
const browserHeaders = { 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/150 Safari/537.36' }
if (!providers.length) throw new Error('No approved, enabled providers in this configuration.')
// Canonical runtime for the timeline identity check; absent without a token.
let metadata: TitleMetadataResolver | null = null
try {
  const token = process.env.TMDB_API_READ_TOKEN ?? ''
  if (token.trim()) metadata = createTmdbMetadataResolver(token)
} catch {
  metadata = null
}

// ADR-0002 canary run: resolve one title per provider through the adapter,
// walk its real manifest chain with browser headers only, probe every
// discovered URL for direct playability, and print the A/B/C evidence rows.
// URLs are never printed: upstream URLs may carry signatures.
async function canaryProvider(provider: (typeof providers)[number]) {
  const started = Date.now()
  const outcome = (extra: Record<string, unknown>) =>
    console.log(JSON.stringify({ provider: provider.adapter.id, ref, elapsedMs: Date.now() - started, ...extra }))
  try {
    const signal = AbortSignal.timeout(60000)
    const result = await provider.adapter.resolve({ ref, region: values.region, audioLanguage: 'en' }, signal)
    if (!result.ok || !result.sources.length) {
      outcome({ outcome: 'no-source' })
      process.exitCode = 1
      return
    }
    const source = result.sources.find((entry) => entry.type === 'hls')
      ?? result.sources.find((entry) => entry.type === 'native')
    if (!source) {
      outcome({ outcome: 'no-directable-source' })
      process.exitCode = 1
      return
    }
    const store = createMemoryPlaybackStore()
    try {
      const collected = await collectCanaryTargets({
        url: source.url, type: source.type, hosts: provider.mediaHosts, transport: fetchMedia, signal,
      })
      if (!collected.targets.length) {
        outcome({ outcome: 'no-targets', note: collected.note ?? null })
        process.exitCode = 1
        return
      }
      const verdicts = await runDeliveryProbes(
        collected.targets, provider.mediaHosts, createCapabilityRegistry(store), fetchMedia, signal,
      )
      if (collected.note) {
        console.log(JSON.stringify({ provider: provider.adapter.id, outcome: 'partial-walk', note: collected.note }))
      }
      for (const { target, direct } of verdicts) {
        console.log(JSON.stringify({
          provider: provider.adapter.id, host: target.host, kind: target.kind,
          engine: target.engine, direct, elapsedMs: Date.now() - started,
        }))
      }
      // Certification checks (Amendment C, slice B): timeline identity, seek
      // positions, and source lifetime. No URLs printed — same hygiene as above.
      const checks = AbortSignal.timeout(45000)
      let runtimeSec: number | undefined
      try {
        runtimeSec = (await metadata?.(ref, checks))?.runtimeSec
      } catch {
        runtimeSec = undefined
      }
      const timed = collected.manifests
        .map((entry) => ({ ...entry, ...certifyTimeline(entry.text, runtimeSec) }))
        .find((entry) => entry.durationSec !== undefined)
      const timelineRow: { check: string; pass: boolean | null; detail: string } = timed
        ? { check: 'timeline', pass: timed.plausible, detail: `${timed.durationSec}s vs expected ${runtimeSec ?? 'unknown'}s` }
        : { check: 'timeline', pass: null, detail: runtimeSec === undefined ? 'no runtime expectation' : 'no media timeline collected' }
      console.log(JSON.stringify({ provider: provider.adapter.id, ...timelineRow }))
      const variant = collected.manifests.map((entry) => entry.text).find((text) => /#EXTINF:/.test(text))
      if (variant) {
        const { seek50, seek95 } = await certifyVariantSeek(variant, source.url, provider.mediaHosts, fetchMedia, checks)
        console.log(JSON.stringify({ provider: provider.adapter.id, check: 'seek-50', pass: seek50 }))
        console.log(JSON.stringify({ provider: provider.adapter.id, check: 'seek-95', pass: seek95 }))
      }
      const expiry = certifyExpiry(source.expiresAt)
      console.log(JSON.stringify({ provider: provider.adapter.id, check: 'expiry', pass: expiry.fresh, detail: `${expiry.horizonSec ?? '?'}s horizon` }))
    } finally {
      await store.close()
    }
  } catch {
    // Do not print thrown transport errors: upstream errors may contain signed URLs.
    outcome({ outcome: 'failed' })
    process.exitCode = 1
  }
}

for (const provider of providers) {
  if (values.canary) {
    await canaryProvider(provider)
    continue
  }
  const store = createMemoryPlaybackStore()
  const playback = createPlayback({ providers: [provider], store, region: values.region })
  const started = Date.now()
  try {
    const signal = AbortSignal.timeout(15000)
    const session = await playback.resolve('diagnostic', { ref, audioLanguage: 'en', capabilities: { hls: true, native: true, dash: false, nativeHls: true } }, signal)
    const resolvedMs = Date.now() - started
    // Direct-only walk: the session src is an upstream URL by construction.
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
