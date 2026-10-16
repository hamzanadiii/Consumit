import { z } from 'zod'
import type { PlaybackRef } from '@consumit/contracts'
import { createProviderHttp } from './provider-http.ts'
import type { MediaTransport } from './transport.ts'

const responseSchema = z.object({
  title: z.string().max(300).optional(),
  name: z.string().max(300).optional(),
  release_date: z.string().max(10).optional(),
  first_air_date: z.string().max(10).optional(),
  runtime: z.number().nullable().optional(),
  episode_run_time: z.array(z.number()).max(20).optional(),
  external_ids: z.object({ imdb_id: z.string().regex(/^tt\d{5,12}$/).nullish() }).optional(),
})

export type TitleMetadata = { title: string; year: number; imdbId?: string | undefined; runtimeSec?: number | undefined }
export type TitleMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<TitleMetadata>

/** Server-owned canonical TMDB title identity for adapters that match by
 *  title/year (in addition to catalog ids). Secrets stay server-side. */
export function createTmdbMetadataResolver(token: string, transport?: MediaTransport): TitleMetadataResolver {
  if (!token.trim()) throw new Error('TMDB_API_READ_TOKEN is required for canonical title metadata.')
  const http = createProviderHttp(['api.themoviedb.org'], transport)
  const cache = new Map<string, { metadata: TitleMetadata; expires: number }>()
  return async (ref: PlaybackRef, signal: AbortSignal) => {
    const key = `${ref.kind}:${ref.id}`
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.metadata
    const namespace = ref.kind === 'movie' ? 'movie' : 'tv'
    const response = await http(`https://api.themoviedb.org/3/${namespace}/${ref.id}?append_to_response=external_ids`, {
      accept: 'application/json', authorization: `Bearer ${token}`,
    }, signal)
    if (response.status < 200 || response.status >= 300) throw new Error('TMDB title metadata unavailable.')
    const parsed = responseSchema.parse(JSON.parse(response.text))
    const title = (parsed.title ?? parsed.name ?? '').trim()
    const year = Number.parseInt((parsed.release_date ?? parsed.first_air_date ?? '').slice(0, 4), 10)
    if (!title || !Number.isInteger(year) || year < 1900 || year > 2100) throw new Error('TMDB title metadata incomplete.')
    const runtimeMin = ref.kind === 'movie' ? parsed.runtime : parsed.episode_run_time?.[0]
    const runtimeSec = typeof runtimeMin === 'number' && Number.isFinite(runtimeMin) && runtimeMin > 0 ? Math.round(runtimeMin * 60) : undefined
    const metadata: TitleMetadata = { title, year, ...(parsed.external_ids?.imdb_id ? { imdbId: parsed.external_ids.imdb_id } : {}), ...(runtimeSec ? { runtimeSec } : {}) }
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!)
    cache.set(key, { metadata, expires: Date.now() + 86_400_000 })
    return metadata
  }
}
