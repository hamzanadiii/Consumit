import { z } from 'zod'
import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderAdapter, ProviderInput, ProviderSource } from '../index.ts'
import { adapter, ProviderFailure } from './http.ts'
import type { LookmovieMetadataResolver } from './lookmovie.ts'

const endpointResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), sources: z.array(z.unknown()).max(16) }),
  z.object({ ok: z.literal(false), code: z.enum(['empty', 'timeout', 'malformed', 'unavailable', 'cancelled']), retryable: z.boolean() }),
])

export type LookmovieWorker = { origin: string; secret: string }
export type LookmovieWorkerFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Resolve LookMovie and verify its initial HLS graph from the same Cloudflare egress that serves media. */
export function createLookmovieWorkerProvider(
  config: LookmovieWorker,
  metadata: LookmovieMetadataResolver,
  fetcher: LookmovieWorkerFetch = fetch,
): ProviderAdapter {
  const origin = new URL(config.origin)
  if (origin.protocol !== 'https:' || origin.origin !== config.origin || config.secret.length < 32) throw new Error('Invalid LookMovie Worker configuration.')
  return adapter('lookmovie-relay', async (input: ProviderInput, signal: AbortSignal): Promise<ProviderSource[]> => {
    if (input.ref.kind !== 'movie') throw new ProviderFailure('empty')
    const identity = await metadata(input.ref as PlaybackRef, signal)
    const response = await fetcher(new URL('/v1/lookmovie/resolve', origin), {
      method: 'POST',
      headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: identity.title, year: identity.year, ref: input.ref, region: input.region, audioLanguage: input.audioLanguage }),
      signal,
    })
    if (response.status === 404) throw new ProviderFailure('empty')
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
    let raw: string
    try {
      raw = await response.text()
      if (raw.length > 256 * 1024) throw new Error('Oversized response.')
    } catch { throw new ProviderFailure('malformed') }
    let result: z.infer<typeof endpointResponseSchema>
    try { result = endpointResponseSchema.parse(JSON.parse(raw)) }
    catch { throw new ProviderFailure('malformed') }
    if (!result.ok) throw new ProviderFailure(result.code === 'empty' ? 'empty' : result.code === 'malformed' ? 'malformed' : 'unavailable')
    // Full source validation and configured-host checks run in the API resolver.
    return result.sources as ProviderSource[]
  })
}
