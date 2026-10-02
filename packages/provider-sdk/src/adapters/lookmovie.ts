import type { PlaybackRef } from '@consumit/contracts'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://lmscript.xyz'
const headers = { 'user-agent': userAgent, accept: 'application/json', referer: `${apiOrigin}/` }
const qualityOrder = ['auto', '1080p', '1080', '720p', '720', '480p', '480', '360p', '360'] as const

const movieSchema = z.object({
  id_movie: z.union([z.string().min(1).max(128), z.number().int().positive()]).optional(),
  title: z.string().max(300).optional(),
  year: z.union([z.string().max(8), z.number().int()]).nullish(),
}).passthrough()

const searchSchema = z.object({ items: z.array(movieSchema).max(100).optional() }).passthrough()
const viewSchema = z.object({
  streams: z.record(z.string(), z.string().max(4096)).optional(),
  // The live API returns hundreds of subtitle entries; only the first 20 are
  // offered to playback, but parse a bounded response instead of rejecting it.
  subtitles: z.array(z.object({
    url: z.string().max(4096).optional(),
    language: z.string().max(64).optional(),
    label: z.string().max(128).optional(),
  }).passthrough()).max(1000).optional(),
}).passthrough()

export type LookmovieMetadata = { title: string; year: number }
export type LookmovieMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<LookmovieMetadata>

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function sameYear(candidate: z.infer<typeof movieSchema>, year: number) {
  const value = String(candidate.year ?? '').trim()
  return !value || value === String(year)
}

function matchingMovie(items: z.infer<typeof movieSchema>[], title: string, year: number) {
  const wanted = normalizeTitle(title)
  const candidates = items.filter((item) => {
    const candidateTitle = normalizeTitle(item.title ?? '')
    return candidateTitle && sameYear(item, year)
      && (candidateTitle === wanted || candidateTitle.includes(wanted) || wanted.includes(candidateTitle))
      && item.id_movie !== undefined
  })
  candidates.sort((a, b) => {
    const aTitle = normalizeTitle(a.title ?? '')
    const bTitle = normalizeTitle(b.title ?? '')
    const aScore = Number(aTitle === wanted) * 10 - aTitle.length
    const bScore = Number(bTitle === wanted) * 10 - bTitle.length
    return bScore - aScore
  })
  return candidates[0]
}

async function requestJson<T>(http: ProviderHttp, url: string, signal: AbortSignal, schema: z.ZodType<T>) {
  const response = await http(url, headers, signal)
  if (response.status === 404) throw new ProviderFailure('empty')
  if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
  return schema.parse(JSON.parse(response.text))
}

export function createLookmovieProvider(http: ProviderHttp, metadata: LookmovieMetadataResolver, now = Date.now) {
  return adapter('lookmovie', async ({ ref }, signal) => {
    if (ref.kind !== 'movie') throw new ProviderFailure('empty')
    const identity = await metadata(ref, signal)
    const title = identity.title.trim()
    if (!title || !Number.isInteger(identity.year)) throw new ProviderFailure('empty')

    const search = await requestJson(http,
      `${apiOrigin}/v1/movies?filters[q]=${encodeURIComponent(title)}`, signal, searchSchema)
    const match = matchingMovie(search.items ?? [], title, identity.year)
    if (!match?.id_movie) throw new ProviderFailure('empty')

    const view = await requestJson(http,
      `${apiOrigin}/v1/movies/view?expand=streams,subtitles&id=${encodeURIComponent(String(match.id_movie))}`,
      signal, viewSchema)

    const subtitles: ProviderSource['subtitles'] = []
    const seenSubtitles = new Set<string>()
    for (const subtitle of view.subtitles ?? []) {
      const rawUrl = subtitle.url?.trim()
      if (!rawUrl || subtitles.length >= 20) continue
      let url: URL
      try { url = new URL(rawUrl, `${apiOrigin}/`) } catch { continue }
      if (url.protocol !== 'https:' || url.username || url.password || seenSubtitles.has(url.href)) continue
      seenSubtitles.add(url.href)
      const label = (subtitle.language ?? subtitle.label ?? 'Unknown').trim().slice(0, 64) || 'Unknown'
      const path = url.pathname.toLowerCase()
      const format = path.endsWith('.srt') ? 'srt' : path.endsWith('.ass') ? 'ass' : 'vtt'
      subtitles.push({
        id: `lookmovie-sub-${subtitles.length}`,
        label,
        language: label.slice(0, 32),
        url: url.href,
        format,
      })
    }

    const sources: ProviderSource[] = []
    const seenSources = new Set<string>()
    for (const [index, quality] of qualityOrder.entries()) {
      const rawUrl = view.streams?.[quality]?.trim()
      if (!rawUrl) continue
      let url: URL
      try { url = new URL(rawUrl) } catch { continue }
      if (url.protocol !== 'https:' || url.username || url.password || seenSources.has(url.href)) continue
      let expiresAt: string
      try { expiresAt = accessDeadline(url.href, now()) } catch { continue }
      seenSources.add(url.href)
      const height = Number.parseInt(/^(\d{3,4})p?$/.exec(quality)?.[1] ?? '0', 10)
      sources.push({
        key: `lookmovie:${height ? `${height}p` : 'auto'}:${index}`,
        url: url.href,
        type: mediaType(url.href) ?? 'hls',
        qualityHint: height ? `${height}p` : 'Auto',
        expiresAt,
        language: 'original',
        headers: {},
        subtitles,
        ...(height ? { height } : {}),
      })
      if (sources.length >= 16) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
