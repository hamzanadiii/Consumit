import { createHash } from 'node:crypto'
import { playbackRefSchema, playbackTrackSchema, type PlaybackRef } from '@consumit/contracts'
import { z } from 'zod'

export { createVixsrcProvider } from './adapters/vixsrc.ts'
export { createNhdapiProvider } from './adapters/nhdapi.ts'
export { createVaPlayerProvider } from './adapters/vaplayer.ts'
export { createMappleProvider } from './adapters/mapple.ts'

export { createWecollegeProvider, type WecollegeMetadata, type WecollegeMetadataResolver } from './adapters/wecollege.ts'
export { createPersesProvider } from './adapters/perses.ts'
export { createRivestreamProvider } from './adapters/rivestream.ts'
export { createVidapiProvider } from './adapters/vidapi.ts'

export { createScreenscapeProvider } from './adapters/screenscape.ts'
export { createVidrockProvider } from './adapters/vidrock.ts'
export { createVidnestProvider, decipherPayload, type VidnestScope } from './adapters/vidnest.ts'
export { createPoseidonProvider } from './adapters/poseidon.ts'
export { createNetmirrorProvider } from './adapters/netmirror.ts'
export { createVidstormProvider } from './adapters/vidstorm.ts'
export { createVidlinkProvider } from './adapters/vidlink.ts'

export { createCinehdProvider } from './adapters/cinehd.ts'
export { createNxshaProvider, decodeNxshaPayload, encodeNxshaPayload } from './adapters/nxsha.ts'
export { createStellarProvider } from './adapters/stellar.ts'
export { createAphroditeProvider, type AphroditeSign } from './adapters/aphrodite.ts'
export { invalidateStellarSession, signStellarRequest } from './adapters/aphrodite-gate.ts'
export { createVidluxProvider } from './adapters/vidlux.ts'

export { createVidsrcbuzzProvider } from './adapters/vidsrcbuzz.ts'
export { createVidsrcProvider } from './adapters/vidsrc.ts'
export { createVideasyProvider } from './adapters/videasy.ts'
export { createVidcoreProvider } from './adapters/vidcore.ts'
export { createFilmuProvider, type FilmuExtractor, type FilmuOptions } from './adapters/filmu.ts'
export { createVidzenProvider, type VidzenOptions } from './adapters/vidzen.ts'
export { createLookmovieProvider, type LookmovieMetadata, type LookmovieMetadataResolver } from './adapters/lookmovie.ts'
export { createRiveApolloProvider } from './adapters/rivedirect.ts'
export { createStigstreamProvider, type StigstreamScope } from './adapters/stigstream.ts'
export { createCastletvProvider, type CastletvMetadata, type CastletvMetadataResolver, type CastletvOptions } from './adapters/castletv.ts'
export { createAnixoProvider, type AnimeTitleResolver } from './adapters/anixo.ts'
export { createKyrenProvider } from './adapters/kyren.ts'
export { createNagareProvider } from './adapters/nagare.ts'
export { createAnime123Provider } from './adapters/anime123.ts'
export { createZokoProvider, type ZokoMetaResolver } from './adapters/zoko.ts'
export { createAnimeParadiseProvider, type AnimeTitleVariantsResolver } from './adapters/animeparadise.ts'
export { createAnimeKaiProvider, solvePow } from './adapters/animekai.ts'
export { createAnimeKitsuProvider } from './adapters/animekitsu.ts'
export type { ProviderHttp } from './adapters/http.ts'
export { assertHlsManifest, isPlausibleManifestDuration, parseHlsAttributeList, parseHlsReferenceEntries, parseHlsReferences, sumMediaPlaylistDuration } from './manifest.ts'

export const skipSegmentSchema = z.object({
  kind: z.enum(['intro', 'outro', 'recap']),
  start: z.number().min(0).max(86400),
  end: z.number().min(0).max(86400),
})
export type SkipSegment = z.infer<typeof skipSegmentSchema>

export const providerSourceSchema = z.object({
  // This key describes the rendition, never its temporary URL signature.
  key: z.string().min(1).max(100),
  url: z.url().max(4096), type: z.enum(['hls', 'dash', 'native']),
  expiresAt: z.iso.datetime(), language: z.string().max(32).default('original'),
  headers: z.record(z.string(), z.string()).default({}),
  height: z.int().min(144).max(4320).optional(),
  qualityHint: z.string().min(1).max(24).optional(),
  segmentTransform: z.literal('mpegts-image-prefix').optional(),
  subtitles: z.array(playbackTrackSchema).max(32).default([]),
  /** Opening/ending/recap ranges in seconds for skip-intro UI. */
  skipSegments: z.array(skipSegmentSchema).max(8).optional(),
})
export const providerResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), sources: z.array(providerSourceSchema).max(32) }),
  z.object({ ok: z.literal(false), code: z.enum(['empty', 'timeout', 'malformed', 'unavailable', 'cancelled']), retryable: z.boolean() }),
])
export type ProviderSource = z.infer<typeof providerSourceSchema>
export type ProviderResult = z.infer<typeof providerResultSchema>
export type ProviderInput = { ref: PlaybackRef; region: string; audioLanguage: string }
export type ProviderIdentityResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<{ imdbId?: string | undefined }>
export interface ProviderAdapter {
  readonly id: string
  resolve(input: ProviderInput, signal: AbortSignal): Promise<ProviderResult>
}
export type MediaKind = 'movie' | 'series' | 'anime'
export type ProviderRegistration = {
  adapter: ProviderAdapter
  enabled: boolean
  approvedRegions: readonly string[]
  mediaHosts: readonly string[]
  upstreamGroup: string
  concurrency: number
  requestsPerMinute: number
  /** Media kinds this provider can resolve. Anime providers declare ['anime'];
   *  streaming providers declare ['movie', 'series']. Used to route playback
   *  requests to the correct provider pool. */
  mediaKinds: readonly MediaKind[]
  /** Operator-pinned resolve order; higher tries first. Health and circuit
   *  breakers still apply, and ties keep learned latency ranking. */
  priority?: number
  /** Per-attempt resolve budget in ms. Slow-but-good providers (multi-hop
   *  scrapes) get more room than the 5s default; the total deadline still
   *  caps every attempt, so failure latency never grows past it. */
  attemptMs?: number | undefined
  /** Regexes for flux CDNs whose hostnames rotate per title (matched
   *  against the lowercase hostname, case-insensitively). Narrower than
   *  a wildcard TLD, stricter than trusting upstream outright. */
  mediaHostPatterns?: readonly RegExp[] | undefined
  /** Known-good synthetic fixtures for providers with selective catalogs. */
  probes?: Partial<Record<MediaKind, { ref: PlaybackRef; audioLanguage: string } | undefined>> | undefined
}

export function sourceIdentity(providerId: string, ref: PlaybackRef, key: string) {
  return `${providerId}:${createHash('sha256').update(JSON.stringify([ref.kind, ref.id, ref.season, ref.episode, key])).digest('hex').slice(0, 32)}`
}

export function allowedMediaUrl(value: string, hosts: readonly string[], patterns: readonly RegExp[] = []) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const listed = hosts.some((host) => host.startsWith('*.')
      ? host.length > 3 && hostname.endsWith(host.slice(1))
      : hostname === host)
    const patterned = !listed && patterns.some((pattern) => {
      try {
        return pattern.test(hostname)
      } catch {
        return false
      }
    })
    // The controlled browser fixture uses a loopback-bound high port so native
    // media requests can reach it without Playwright routing. This exact
    // test origin is never admitted by production validation.
    const fixtureOrigin = process.env.NODE_ENV === 'test' && hostname === '127-0-0-1.nip.io' && url.port === '18560' && url.protocol === 'http:'
    return (url.protocol === 'https:' || fixtureOrigin) && !url.username && !url.password && (!url.port || url.port === '443' || fixtureOrigin)
      && (listed || patterned) && !url.hash
  } catch { return false }
}

/** Recognizable media relays are ineligible even on a configured host. */
export function isRelayMediaUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /(?:^|[./_-])(?:proxy|relay)(?:[./_?-]|$)/i.test(url.hostname + url.pathname)
      || ['url', 'target', 'destination'].some((key) => /^https?:/i.test(url.searchParams.get(key) ?? ''))
  } catch { return true }
}

/** Validate an adapter's entire result before any source crosses into playback.
 *  Only browser-direct media crosses this seam. `segmentTransform` sources need server-side byte
 *  rewriting, which no longer exists, so they are rejected outright. */
export function validatedSources(result: unknown, registration: ProviderRegistration, now = Date.now()): ProviderSource[] {
  const parsed = providerResultSchema.safeParse(result)
  if (!parsed.success || !parsed.data.ok) return []
  const seen = new Set<string>()
  const valid: ProviderSource[] = []
  for (const source of parsed.data.sources) {
    if (seen.has(source.key) || Date.parse(source.expiresAt) <= now + 30_000) continue
    if (isRelayMediaUrl(source.url)) continue
    if (!allowedMediaUrl(source.url, registration.mediaHosts, registration.mediaHostPatterns)) continue
    // Browser playback cannot attach provider-specific headers. Declared
    // Referer/Origin hints ride with the source, but credentials are
    // never allowed to cross this seam.
    if (Object.keys(source.headers).some((name) => /^(cookie|authorization)$/i.test(name))) continue
    if (source.segmentTransform) continue
    if (Object.entries(source.headers).some(([key, value]) => !/^(referer|origin|user-agent|authorization|cookie|accept)$/i.test(key) || /[\r\n]/.test(value) || value.length > 4096)) continue
    seen.add(source.key)
    // Captions are enhancement, media is the product: strip off-allowlist
    // tracks (rotating subtitle CDNs) instead of nuking a playable source.
    valid.push({ ...source, subtitles: source.subtitles.filter((track) => allowedMediaUrl(track.url, registration.mediaHosts, registration.mediaHostPatterns)) })
  }
  return valid
}

/** Explicitly configured media only. Useful for owned media and deterministic integration fixtures. */
export function createStaticProvider(id: string, entries: readonly { ref: PlaybackRef; sources: ProviderSource[] }[]): ProviderAdapter {
  const records = entries.map((entry) => ({ ref: playbackRefSchema.parse(entry.ref), sources: entry.sources.map((source) => providerSourceSchema.parse(source)) }))
  return {
    id,
    async resolve(input, signal) {
      if (signal.aborted) return { ok: false, code: 'cancelled', retryable: false }
      const found = records.find(({ ref }) => ref.kind === input.ref.kind && ref.id === input.ref.id && ref.season === input.ref.season && ref.episode === input.ref.episode)
      return { ok: true, sources: found?.sources ?? [] }
    },
  }
}
