import { z } from 'zod'
import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderIdentityResolver } from '@consumit/provider-sdk'
import { createProviderHttp } from './provider-http.ts'
import type { MediaTransport } from './transport.ts'

const responseSchema = z.object({ imdb_id: z.string().regex(/^tt\d{5,12}$/).nullish() })

/** Server-owned canonical TMDB -> IMDb mapping for adapters that require IMDb IDs. */
export function createTmdbIdentityResolver(token: string, transport?: MediaTransport): ProviderIdentityResolver {
  if (!token.trim()) throw new Error('VAPlayer requires TMDB_API_READ_TOKEN for canonical IMDb identity.')
  const http = createProviderHttp(['api.themoviedb.org'], transport)
  const cache = new Map<string, { imdbId?: string | undefined; expires: number }>()
  return async (ref: PlaybackRef, signal: AbortSignal) => {
    const key = `${ref.kind}:${ref.id}`
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) return { imdbId: cached.imdbId }
    const namespace = ref.kind === 'movie' ? 'movie' : 'tv'
    const response = await http(`https://api.themoviedb.org/3/${namespace}/${ref.id}/external_ids`, {
      accept: 'application/json', authorization: `Bearer ${token}`,
    }, signal)
    if (response.status < 200 || response.status >= 300) throw new Error('TMDB identity lookup unavailable.')
    const imdbId = responseSchema.parse(JSON.parse(response.text)).imdb_id ?? undefined
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!)
    cache.set(key, { imdbId, expires: Date.now() + (imdbId ? 86_400_000 : 3_600_000) })
    return { imdbId }
  }
}
