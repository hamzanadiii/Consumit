import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'
import { decryptWecollegePayload } from './wecollege-cipher.ts'

const apiOrigin = 'https://api.wecollege.net'
const mediaOrigin = 'https://movy.sx'
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const ALL_CITIES = ['miami', 'boise', 'seattle', 'atlanta', 'portland', 'phoenix', 'paris', 'austin', 'tampa', 'berlin']

export type WecollegeMetadata = { title: string; year: number; imdbId?: string }
export type WecollegeMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<WecollegeMetadata>
export type WecollegeScope = { id?: string; cities?: string[] }

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

    for (const city of cities) {
      const url = `${apiOrigin}/${city}/sources?${qParams.toString()}`
      let res: { text: string }
      try {
        res = await document(http, url, signal, headers)
      } catch {
        continue
      }

      let payload: any
      try {
        payload = decryptWecollegePayload(res.text.trim(), seed, ref.id)
      } catch {
        continue
      }

      const rawSources = Array.isArray(payload?.sources) ? payload.sources : []
      if (!rawSources.length) continue

      const subtitles = (Array.isArray(payload?.subtitles) ? payload.subtitles : []).map((sub: any, idx: number) => ({
        id: `wecollege-sub-${idx}`,
        label: sub.lang || sub.label || `Subtitle ${idx + 1}`,
        language: (sub.lang || sub.label || 'und').toLowerCase().slice(0, 10),
        url: sub.url,
        format: (sub.url.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
      }))

      const sources: ProviderSource[] = []
      for (let idx = 0; idx < rawSources.length; idx++) {
        const s = rawSources[idx]
        if (!s.url) continue
        const type = mediaType(s.url) || 'hls'
        const qMatch = String(s.quality || '').match(/(\d{3,4})p?/i)
        const height = qMatch ? Number.parseInt(qMatch[1], 10) : undefined
        const qualityHint = height ? `${height}p` : s.quality || 'Auto'
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

      if (sources.length) return sources
    }

    throw new ProviderFailure('empty')
  })

  return Object.assign(prov, { id })
}
