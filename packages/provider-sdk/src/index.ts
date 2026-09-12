import { createHash } from 'node:crypto'
import { playbackRefSchema, playbackTrackSchema, type PlaybackRef } from '@consumit/contracts'
import { z } from 'zod'

export { createVixsrcProvider } from './adapters/vixsrc.ts'
export { createNhdapiProvider } from './adapters/nhdapi.ts'
export { createVaPlayerProvider } from './adapters/vaplayer.ts'
export { createVidcoreProvider } from './adapters/vidcore.ts'
export { createInsertunitProvider } from './adapters/insertunit.ts'
export { createMappleProvider } from './adapters/mapple.ts'
export { createStigstreamProvider } from './adapters/stigstream.ts'
export { createWecollegeProvider, type WecollegeMetadata, type WecollegeMetadataResolver } from './adapters/wecollege.ts'
export { createPersesProvider } from './adapters/perses.ts'
export { createRivestreamProvider } from './adapters/rivestream.ts'
export { createVidapiProvider } from './adapters/vidapi.ts'
export { createVidloveProvider } from './adapters/vidlove.ts'
export { createScreenscapeProvider } from './adapters/screenscape.ts'
export { createVidrockProvider } from './adapters/vidrock.ts'
export { createVidnestProvider, decipherPayload } from './adapters/vidnest.ts'
export { createNetmirrorProvider } from './adapters/netmirror.ts'
export { createVidstormProvider } from './adapters/vidstorm.ts'
export { createVidlinkProvider } from './adapters/vidlink.ts'
export { createVidvaultProvider } from './adapters/vidvault.ts'
export { createModiplayProvider } from './adapters/modiplay.ts'
export { createCinehdProvider } from './adapters/cinehd.ts'
export { createNxshaProvider, encodeNxshaPayload } from './adapters/nxsha.ts'
export { createStellarProvider, createAphroditeProvider } from './adapters/stellar.ts'
export type { ProviderHttp } from './adapters/http.ts'

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
export type ProviderRegistration = {
  adapter: ProviderAdapter
  enabled: boolean
  approvedRegions: readonly string[]
  mediaHosts: readonly string[]
  upstreamGroup: string
  concurrency: number
  requestsPerMinute: number
  /** Operator-pinned resolve order; higher tries first. Health and circuit
   *  breakers still apply, and ties keep learned latency ranking. */
  priority?: number
}

export function sourceIdentity(providerId: string, ref: PlaybackRef, key: string) {
  return `${providerId}:${createHash('sha256').update(JSON.stringify([ref.kind, ref.id, ref.season, ref.episode, key])).digest('hex').slice(0, 32)}`
}

export function allowedMediaUrl(value: string, hosts: readonly string[]) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && hosts.some((host) => host.startsWith('*.')
        ? host.length > 3 && url.hostname.toLowerCase().endsWith(host.slice(1))
        : url.hostname.toLowerCase() === host) && !url.hash
  } catch { return false }
}

/** Validate an adapter's entire result before any source crosses into playback.
 *  Direct-only architecture: `delivery` is descriptive (what the upstream
 *  asked for), never a proxy instruction — the planner decides playability
 *  by measurement. `segmentTransform` sources need server-side byte
 *  rewriting, which no longer exists, so they are rejected outright. */
export function validatedSources(result: unknown, registration: ProviderRegistration, now = Date.now()): ProviderSource[] {
  const parsed = providerResultSchema.safeParse(result)
  if (!parsed.success || !parsed.data.ok) return []
  const seen = new Set<string>()
  return parsed.data.sources.filter((source) => {
    if (seen.has(source.key) || Date.parse(source.expiresAt) <= now + 30_000) return false
    if (!allowedMediaUrl(source.url, registration.mediaHosts)) return false
    // Browser playback cannot attach provider-specific headers. Certification
    // may prove declared Referer/Origin hints unnecessary, but credentials are
    // never allowed to cross this seam.
    if (Object.keys(source.headers).some((name) => /^(cookie|authorization)$/i.test(name))) return false
    if (source.segmentTransform) return false
    if (source.subtitles.some((track) => !allowedMediaUrl(track.url, registration.mediaHosts))) return false
    if (Object.entries(source.headers).some(([key, value]) => !/^(referer|origin|user-agent|authorization|cookie|accept)$/i.test(key) || /[\r\n]/.test(value) || value.length > 4096)) return false
    seen.add(source.key)
    return true
  })
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
