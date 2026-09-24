import type { PlaybackRef } from '@consumit/contracts'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, masterVariantHeights, mediaType, playlistAbsoluteHosts, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'
import { decryptWecollegePayload } from './wecollege-cipher.ts'

const apiOrigin = 'https://api.wecollege.net'
const mediaOrigin = 'https://movy.sx'
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const ALL_CITIES = ['miami', 'seattle', 'portland', 'phoenix', 'paris', 'boise', 'atlanta', 'austin', 'tampa', 'berlin']
const payloadSchema = z.object({
  sources: z.array(z.object({ url: z.string().max(4096), quality: z.union([z.string(), z.number()]).optional() })).max(32).optional(),
  subtitles: z.array(z.object({ url: z.string().max(4096), lang: z.string().max(64).optional(), label: z.string().max(64).optional() })).max(32).optional(),
})

export type WecollegeMetadata = { title: string; year: number; imdbId?: string | undefined }
export type WecollegeMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<WecollegeMetadata>
export type WecollegeScope = { id?: string; cities?: string[]; mediaHosts?: readonly string[] }

export function createWecollegeProvider(
  http: ProviderHttp,
  metadata: WecollegeMetadataResolver,
  now = Date.now,
  scope: WecollegeScope = {},
) {
  const id = scope.id ?? 'wecollege'
  const cities = scope.cities ?? ALL_CITIES
  const headers = { referer: `${mediaOrigin}/`, origin: mediaOrigin, 'user-agent': userAgent }
  const seeds = new Map<string, { seed: string; expiresAt: number }>()

  async function getSeed(mediaId: number, signal: AbortSignal): Promise<string> {
    const key = String(mediaId)
    const cached = seeds.get(key)
    if (cached && now() < cached.expiresAt) return cached.seed

    const res = await document(http, `${apiOrigin}/seed?mediaId=${mediaId}`, signal, headers)
    const data = JSON.parse(res.text) as { seed: string; ttlMs?: number }
    if (!data.seed) throw new ProviderFailure('empty')
    seeds.set(key, { seed: data.seed, expiresAt: now() + (data.ttlMs ?? 30000) - 2000 })
    return data.seed
  }

  const prov = adapter(id, async (input, signal) => {
    const { ref } = input
    const meta = await metadata(ref, signal)
    const seed = await getSeed(ref.id, signal)

    const isTv = ref.kind === 'series'
    const qParams = new URLSearchParams({
      title: meta.title,
      mediaType: isTv ? 'tv' : 'movie',
      year: String(meta.year),
      tmdbId: String(ref.id),
      ...(meta.imdbId ? { imdbId: meta.imdbId } : {}),
      enc: '2',
      seed,
    })

    if (isTv) {
      qParams.set('seasonId', String(ref.season))
      qParams.set('episodeId', String(ref.episode))
    }

    // Fan out across every configured city (bounded per-city timeout) and
    // aggregate: stopping at the first verifying city locks the member to
    // that city's lowest rendition (e.g. a heightless single-variant Auto)
    // while HD/4K renditions in later cities are never probed. Stragglers
    // must not hold healthy answers hostage either: harvest whatever lands
    // by a soft deadline, and only wait out the full term when nothing
    // arrived at all (empty answers starve both sources and subtitles).
    const landed: ({ cityIndex: number; sources: ProviderSource[] } | null)[] = new Array(cities.length).fill(null)
    const pending = cities.map(async (city, cityIndex) => {
      const scoped = AbortSignal.any([signal, AbortSignal.timeout(5000)])
      try {
        const url = `${apiOrigin}/${city}/sources?${qParams.toString()}`
        const res = await document(http, url, scoped, headers)
        let payload: z.infer<typeof payloadSchema>
        try {
          payload = payloadSchema.parse(decryptWecollegePayload(res.text.trim(), seed, ref.id))
        } catch {
          return { cityIndex, sources: [] as ProviderSource[] }
        }

        const rawSources = payload.sources ?? []
        if (!rawSources.length) return { cityIndex, sources: [] as ProviderSource[] }

        const subtitles = (payload.subtitles ?? []).map((sub, idx) => ({
          id: `wecollege-sub-${idx}`,
          label: sub.lang || sub.label || `Subtitle ${idx + 1}`,
          language: (sub.lang || sub.label || 'und').toLowerCase().slice(0, 10),
          url: sub.url,
          format: (sub.url.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
        }))

        const sources: ProviderSource[] = []
        for (let idx = 0; idx < rawSources.length; idx++) {
          const s = rawSources[idx]
          if (!s?.url || /workers\.dev/i.test(s.url)) continue
          const type = mediaType(s.url) || 'hls'
          const quality = String(s.quality ?? '')
          const qMatch = quality.match(/(\d{3,4})p?/i)
          const height = qMatch?.[1] ? Number.parseInt(qMatch[1], 10) : undefined
          const qualityHint = height ? `${height}p` : quality || 'Auto'
          sources.push({
            key: `${city}:${qualityHint.toLowerCase()}:${idx}`,
            url: s.url,
            type,
            expiresAt: accessDeadline(s.url, now()),
            language: 'original',
            headers,
            subtitles,
            qualityHint,
            ...(height ? { height } : {}),
          })
        }

        if (!sources.length) return { cityIndex, sources: [] as ProviderSource[] }
        // Upstream quality labels are claims: a "1080p" entry can serve a
        // master topping at 800p. The manifest bytes are already fetched for
        // verification, so measure the real variant ceiling and relabel
        // honestly — otherwise the mislabeled entry ties (and beats, by
        // stable order) the genuine rendition at resolve time.
        const manifests = new Map<string, string>()
        const verified = await verifiedPlaybackSources(http, sources, scoped, (settled, manifest) => {
          manifests.set(settled.key, manifest)
          const variants = masterVariantHeights(manifest)
          if (!variants || !variants.length) return settled
          const ceiling = Math.max(...variants)
          return { ...settled, height: ceiling, qualityHint: `${ceiling}p` }
        })
        // Split-host playlists fail closed: when the manifest pulls segments,
        // maps, keys, or nested variants from hosts outside the configured
        // media set, browsers cannot play them (hotlink-guarded origins 403
        // without provider referers, which browsers will not spoof, and no
        // relay exists). The bytes were already fetched for verification.
        const contained = verified.filter((source) => {
          const text = manifests.get(source.key)
          if (text === undefined || !scope.mediaHosts?.length) return true
          return playlistAbsoluteHosts(text).every((host) => scope.mediaHosts!.some((pattern) =>
            pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern))
        })
        // Rebuild keys from the measured hints so key and label stay consistent.
        return { cityIndex, sources: contained.map((source, index) => ({ ...source, key: `${city}:${source.qualityHint!.toLowerCase()}:${index}` })) }
      } catch {
        return { cityIndex, sources: [] as ProviderSource[] }
      }
    })
    const harvest = async (): Promise<void> => {
      const runners = pending.map((work, cityIndex) => work.then(
        (result) => { landed[cityIndex] = result },
        () => { landed[cityIndex] = { cityIndex, sources: [] as ProviderSource[] } },
      ))
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all(runners),
          new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 3000) }),
        ])
        if (!landed.some(Boolean)) await Promise.allSettled(runners)
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
    await harvest()

    const seen = new Set<string>()
    const aggregated: ProviderSource[] = []
    for (const entry of landed) {
      if (!entry) continue
      for (const source of entry.sources) {
        if (seen.has(source.url)) continue
        seen.add(source.url)
        aggregated.push(source)
      }
    }
    if (!aggregated.length) throw new ProviderFailure('empty')

    // Hosts measured browser-unplayable in Chromium (live 2026-09-14: the
    // peakstorm family 403s masters/segments, mirrowcelo002 workers answer
    // without CORS headers so hls.js can never read them). Sink — never
    // drop — their sources below playable hosts so the resolver's top pick
    // plays instead of burning the whole provider on a dead "1080p".
    function gatedHost(url: string): boolean {
      try {
        const host = new URL(url).hostname.toLowerCase()
        return host.endsWith('peakstorm.top') || host === 'keenanchor.top'
          || host.endsWith('mirrowcelo002.workers.dev')
      } catch {
        return false
      }
    }

    // Explicit heights are strictly more informative than heightless Auto
    // labels (single-variant manifests mislabeled Auto). When real HD/4K
    // renditions verified, the Auto entries must not shadow them — the
    // resolver scores heightless sources highest and the player would lock
    // to the lowest rendition. Autos remain the fallback when nothing
    // explicit verified.
    const explicit = aggregated.filter((source) => typeof source.height === 'number')
    const ranked = (explicit.length ? explicit : aggregated)
      .sort((a, b) => Number(gatedHost(a.url)) - Number(gatedHost(b.url))
        || (b.height ?? -1) - (a.height ?? -1))
      .slice(0, 32)
    return ranked
  })

  return Object.assign(prov, { id })
}
