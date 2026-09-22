import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, masterVariantHeights, mediaType, playlistAbsoluteHosts, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'
import { decryptWecollegePayload } from './wecollege-cipher.ts'
import type { WecollegeMetadataResolver } from './wecollege.ts'

const apiHosts = ['https://api.speedracelight.com', 'https://api.videasy.to']
const playerOrigin = 'https://player.videasy.net'
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const servers: ReadonlyArray<{ name: string; path: string; moviesOnly?: boolean }> = [
  { name: 'cdn', path: '/cdn/sources-with-title' },
  { name: 'lamovie', path: '/lamovie/sources-with-title' },
  { name: 'meine', path: '/meine/sources-with-title', moviesOnly: true },
  { name: 'mbflix', path: '/mb-flix/sources-with-title' },
  { name: 'downloader2', path: '/downloader2/sources-with-title' },
  { name: 'superflix', path: '/superflix/sources-with-title' },
  { name: 'm4uhd', path: '/m4uhd/sources-with-title' },
  { name: 'onemovies', path: '/1movies/sources-with-title' },
]

export type VideasyScope = { mediaHosts?: readonly string[] }

type VideasyPayload = { sources?: unknown; subtitles?: unknown }
type VideasyItem = { url?: unknown; quality?: unknown; lang?: unknown; label?: unknown }

/** Videasy direct-media port: dual API hosts with seed failover, per-server
 *  encrypted `sources-with-title` fanout, and the same `mvm1` seed cipher as
 *  WeCollege (shared `decryptWecollegePayload`). Title/year/IMDb identity
 *  comes from the server-owned TMDB metadata resolver; secrets never leave
 *  the API process. No page scripts run and no proxy/relay URLs survive. */
export function createVideasyProvider(
  http: ProviderHttp,
  metadata: WecollegeMetadataResolver,
  now = Date.now,
  scope: VideasyScope = {},
) {
  const headers = { referer: `${playerOrigin}/`, origin: playerOrigin, 'user-agent': userAgent }
  const seeds = new Map<string, { base: string; seed: string; expiresAt: number }>()
  let preferredBase: { base: string; ts: number } | null = null

  function orderedHosts(): string[] {
    if (preferredBase && now() - preferredBase.ts < 3_600_000) {
      return [preferredBase.base, ...apiHosts.filter((host) => host !== preferredBase!.base)]
    }
    return [...apiHosts]
  }

  async function fetchSeed(base: string, mediaId: number, signal: AbortSignal): Promise<string | null> {
    try {
      const res = await document(http, `${base}/seed?mediaId=${mediaId}`, signal, headers)
      const data = JSON.parse(res.text) as { seed?: unknown; ttlMs?: unknown }
      if (typeof data.seed !== 'string' || !data.seed) return null
      return data.seed
    } catch {
      signal.throwIfAborted()
      return null
    }
  }

  async function resolveSeed(mediaId: number, signal: AbortSignal): Promise<{ base: string; seed: string }> {
    const key = String(mediaId)
    const cached = seeds.get(key)
    if (cached && now() < cached.expiresAt) {
      const refreshed = await fetchSeed(cached.base, mediaId, signal)
      if (refreshed) {
        seeds.set(key, { base: cached.base, seed: refreshed, expiresAt: now() + 28_000 })
        return { base: cached.base, seed: refreshed }
      }
      seeds.delete(key)
    }
    for (const base of orderedHosts()) {
      const seed = await fetchSeed(base, mediaId, signal)
      if (seed) {
        preferredBase = { base, ts: now() }
        seeds.set(key, { base, seed, expiresAt: now() + 28_000 })
        return { base, seed }
      }
    }
    throw new ProviderFailure('empty')
  }

  async function queryServers(
    base: string,
    seed: string,
    ref: PlaybackRef,
    meta: { title: string; year: number; imdbId?: string | undefined },
    signal: AbortSignal,
  ): Promise<ProviderSource[]> {
    const isTv = ref.kind === 'series'
    const settled = await Promise.all(servers
      .filter((server) => !(server.moviesOnly && isTv))
      .map(async (server) => {
        const scoped = AbortSignal.any([signal, AbortSignal.timeout(5000)])
        try {
          const params = new URLSearchParams({
            title: meta.title,
            mediaType: isTv ? 'TV Series' : 'Movie',
            year: String(meta.year),
            tmdbId: String(ref.id),
            imdbId: meta.imdbId ?? '',
            enc: '2',
            seed,
          })
          if (isTv) {
            params.set('seasonId', String(ref.season))
            params.set('episodeId', String(ref.episode))
          }
          const res = await document(http, `${base}${server.path}?${params.toString()}`, scoped, headers)
          const text = res.text.trim()
          if (!text || text.length < 20 || text.startsWith('<')) return [] as ProviderSource[]
          let payload: VideasyPayload | null = null
          try {
            payload = decryptWecollegePayload(text, seed, ref.id) as VideasyPayload
          } catch {
            return [] as ProviderSource[]
          }
          const rawSources: VideasyItem[] = Array.isArray(payload?.sources) ? (payload.sources as VideasyItem[]) : []
          if (!rawSources.length) return [] as ProviderSource[]

          const subtitles = (Array.isArray(payload?.subtitles) ? (payload.subtitles as VideasyItem[]) : []).map((sub, idx) => {
            const url = typeof sub.url === 'string' ? sub.url : ''
            return {
              id: `videasy-sub-${idx}`,
              label: String(sub.lang ?? sub.label ?? `Subtitle ${idx + 1}`),
              language: String(sub.lang ?? sub.label ?? 'und').toLowerCase().slice(0, 10),
              url,
              format: (url.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
            }
          })

          const sources: ProviderSource[] = []
          for (const s of rawSources) {
            const url = typeof s.url === 'string' ? s.url : ''
            if (!url || /workers\.dev/i.test(url)) continue
            // Extension-less manifests are common here; the HLS verification
            // probe keeps valid streams and drops the rest.
            const type = mediaType(url) ?? 'hls'
            const qMatch = String(s.quality ?? '').match(/(\d{3,4})p?/i)
            const height = qMatch?.[1] ? Number.parseInt(qMatch[1], 10) : undefined
            const qualityHint = height ? `${height}p` : (typeof s.quality === 'string' && s.quality) || 'Auto'
            sources.push({
              key: `videasy:${server.name}:${sources.length}`,
              url,
              type,
              expiresAt: accessDeadline(url, now()),
              language: 'original',
              headers,
              subtitles,
              qualityHint,
              ...(height ? { height } : {}),
            })
          }
          if (!sources.length) return [] as ProviderSource[]
          // Upstream quality labels are claims; measure the real variant
          // ceiling from the verification manifests and relabel honestly.
          const manifests = new Map<string, string>()
          const verified = await verifiedPlaybackSources(http, sources, scoped, (settled, manifest) => {
            manifests.set(settled.key, manifest)
            const variants = masterVariantHeights(manifest)
            if (!variants || !variants.length) return settled
            const ceiling = Math.max(...variants)
            return { ...settled, height: ceiling, qualityHint: `${ceiling}p` }
          })
          // Split-host playlists fail closed when the manifest pulls bytes
          // from hosts outside the configured media set.
          return verified.filter((source) => {
            const text = manifests.get(source.key)
            if (text === undefined || !scope.mediaHosts?.length) return true
            return playlistAbsoluteHosts(text).every((host) => scope.mediaHosts!.some((pattern) =>
              pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern))
          })
        } catch {
          return [] as ProviderSource[]
        }
      }))

    const seen = new Set<string>()
    const aggregated: ProviderSource[] = []
    for (const sources of settled) {
      for (const source of sources) {
        if (seen.has(source.url)) continue
        seen.add(source.url)
        aggregated.push(source)
      }
    }
    return aggregated
  }

  return adapter('videasy', async (input, signal) => {
    const { ref } = input
    const meta = await metadata(ref, signal)
    if (!meta.title) throw new ProviderFailure('empty')
    const { base, seed } = await resolveSeed(ref.id, signal)

    let aggregated = await queryServers(base, seed, ref, meta, signal)
    if (!aggregated.length) {
      // The seed host may be stale while a sibling is healthy; retry once on
      // the next host before reporting empty.
      preferredBase = null
      seeds.delete(String(ref.id))
      for (const fallback of apiHosts.filter((host) => host !== base)) {
        signal.throwIfAborted()
        const retrySeed = await fetchSeed(fallback, ref.id, signal)
        if (!retrySeed) continue
        preferredBase = { base: fallback, ts: now() }
        seeds.set(String(ref.id), { base: fallback, seed: retrySeed, expiresAt: now() + 28_000 })
        aggregated = await queryServers(fallback, retrySeed, ref, meta, signal)
        if (aggregated.length) break
      }
    }
    if (!aggregated.length) throw new ProviderFailure('empty')

    // Explicit heights outrank heightless Auto labels so the resolver never
    // locks to the lowest rendition while verified HD/4K exists.
    const explicit = aggregated.filter((source) => typeof source.height === 'number')
    return (explicit.length ? explicit : aggregated)
      .sort((a, b) => (b.height ?? -1) - (a.height ?? -1))
      .slice(0, 32)
  })
}
