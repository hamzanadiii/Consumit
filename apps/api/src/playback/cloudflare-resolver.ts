import { z } from 'zod'
import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderAdapter, ProviderInput, ProviderRegistration, ProviderResult } from '@consumit/provider-sdk'

const resultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), sources: z.array(z.unknown()).max(32) }),
  z.object({ ok: z.literal(false), code: z.enum(['empty', 'timeout', 'malformed', 'unavailable', 'cancelled']), retryable: z.boolean() }),
])
const titleMetadataProviders = new Set(['wecollege', 'cinejoylisbon', 'purstream', 'lookmovie', 'castletv', 'bingebangymovies', 'kisskh', 'videasy'])
const identityProviders = new Set(['vaplayer', 'cinehd', 'filmu', 'filmuainary'])
const animeTitleProviders = new Set(['anixo', 'kyren', 'anime123', 'animeparadise', 'animekai', 'animekitsu', 'megaplayframe'])

async function boundedResponseText(response: Response, limit: number) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('Resolver response exceeds its limit.') }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder().decode(bytes)
  } finally { reader.releaseLock() }
}
const animeMetaProviders = new Set(['zoko'])

export type CloudflareResolverConfig = { origin: string; secret: string; apiProviders?: readonly 'wecollege-miami'[]; providerOrigins?: Readonly<Record<string, string>>; computeSecret?: string }
export function parseResolverOrigins(raw: string): Record<string, string> {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 64) throw new Error('Invalid resolver routes.')
  for (const [id, origin] of Object.entries(value)) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || typeof origin !== 'string' || origin.length > 253) throw new Error('Invalid resolver route.')
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Invalid resolver origin.')
  }
  return value as Record<string, string>
}
export type ResolverMetadata = {
  title?: string | undefined
  year?: number | undefined
  imdbId?: string | undefined
  runtimeSec?: number | undefined
  animeTitle?: string | undefined
  animeTitles?: string[] | undefined
  malId?: number | null | undefined
}
export type CloudflareResolverOptions = {
  config: CloudflareResolverConfig
  currentConfig: (provider: ProviderRegistration) => Record<string, unknown>
  metadata: (providerId: string, ref: PlaybackRef, signal: AbortSignal) => Promise<ResolverMetadata>
  fetch?: (input: URL, init?: RequestInit) => Promise<Response>
}

/** API-side adapter proxy. The Worker resolves one selected adapter; all returned data still passes the API's normal source validation. */
export function createCloudflareResolverAdapter(provider: ProviderRegistration, options: CloudflareResolverOptions): ProviderAdapter {
  const endpoint = new URL('/v1/resolve', options.config.providerOrigins?.[provider.adapter.id] ?? options.config.origin)
  const fetcher = options.fetch ?? fetch
  const nativeAdapter = provider.adapter
  return {
    ...nativeAdapter,
    async resolve(input: ProviderInput, signal: AbortSignal): Promise<ProviderResult> {
      try {
        // Explicit API lookup routes are fixed provider integrations; the normal API source validation and Cloudflare media grant still apply.
        if (nativeAdapter.id === 'wecollege-miami' && provider.deliveryMode === 'relay'
          && options.config.apiProviders?.includes(nativeAdapter.id)) return await nativeAdapter.resolve(input, signal)
        const current = options.currentConfig(provider)
        if (current.adapter === 'static' && Array.isArray(current.entries)) {
          current.entries = current.entries.filter(entry => entry && typeof entry === 'object'
            && JSON.stringify((entry as { ref?: unknown }).ref) === JSON.stringify(input.ref))
        }
        const metadata = await options.metadata(String(current.adapter ?? provider.adapter.id), input.ref, signal)
        const requestBody = JSON.stringify({
          providerId: provider.adapter.id,
          config: current,
          input,
          metadata,
        })
        if (requestBody.length > 64 * 1024) return { ok: false, code: 'malformed', retryable: false }
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${options.config.secret}`, 'content-type': 'application/json' },
          body: requestBody,
          signal,
          redirect: 'error',
        })
        if (!response.ok) return { ok: false, code: response.status === 404 ? 'empty' : 'unavailable', retryable: response.status !== 404 }
        const raw = await boundedResponseText(response, 256 * 1024)
        return resultSchema.parse(JSON.parse(raw)) as ProviderResult
      } catch {
        return { ok: false, code: signal.aborted ? 'cancelled' : 'unavailable', retryable: !signal.aborted }
      }
    },
  }
}

/** Keep TMDB/AniList credentials and lookups in the API; only canonical title data crosses to the Worker. */
export function createResolverMetadata(options: {
  tmdb?: (ref: PlaybackRef, signal: AbortSignal) => Promise<{ title: string; year: number; imdbId?: string | undefined; runtimeSec?: number | undefined }>
  identity?: (ref: PlaybackRef, signal: AbortSignal) => Promise<{ imdbId?: string | undefined }>
  animeTitle?: (id: number, signal: AbortSignal) => Promise<string>
  animeTitles?: (id: number, signal: AbortSignal) => Promise<readonly string[]>
  animeMeta?: (id: number, signal: AbortSignal) => Promise<{ title: string; malId: number | null }>
}) {
  return async (providerId: string, ref: PlaybackRef, signal: AbortSignal): Promise<ResolverMetadata> => {
    if (ref.kind === 'anime') {
      const id = Number(ref.id)
      if (animeTitleProviders.has(providerId) && options.animeTitle) {
        const [animeTitle, animeTitles] = await Promise.all([
          options.animeTitle(id, signal),
          animeTitlesProviders.has(providerId) && options.animeTitles ? options.animeTitles(id, signal) : Promise.resolve([]),
        ])
        return { animeTitle, animeTitles: [...animeTitles] }
      }
      if (animeMetaProviders.has(providerId) && options.animeMeta) {
        const meta = await options.animeMeta(id, signal)
        return { animeTitle: meta.title, malId: meta.malId }
      }
      return {}
    }
    if (identityProviders.has(providerId) && options.identity) return options.identity(ref, signal)
    if (titleMetadataProviders.has(providerId) && options.tmdb) return options.tmdb(ref, signal)
    return {}
  }
}

const animeTitlesProviders = new Set(['animeparadise', 'animekitsu', 'megaplayframe'])
