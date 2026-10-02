import { Buffer } from 'node:buffer'
import { createDecipheriv } from 'node:crypto'
import { z } from 'zod'
import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

// Port of the PROVE CastleTV recipe (providers/castletv/castletv.ts, MIT
// recipe from Inside4ndroid/TMDB-Embed-API, TMDB lookups replaced with the
// server-owned canonical metadata resolver):
//   GET /v0.1/system/getSecurityKey/1 -> {code:200, data: secKey}
//   GET /film-api/v1.1.0/movie/searchByKeyword?keyword={title year} -> rows
//   GET /film-api/v1.9.9/movie?movieId={id} -> seasons/episodes/tracks
//   POST /film-api/v2.0.1/movie/getVideo2 {movieId, episodeId, languageId,
//     resolution} -> {videos:[{url}], videoUrl, subtitles}
// Every payload after the security key is AES-128-CBC encrypted (key =
// base64(secKey) + 'T!BgJB' truncated to 16 bytes, IV = key). Only
// shape-direct https media crosses into playback — browser-direct, no
// proxy wrapping, no credentials.
const apiOrigin = 'https://api.hlowb.com'
const channel = 'IndiaA'
const clientType = '1'
const lang = 'en-US'
const packageName = 'com.external.castle'

const apiHeaders = {
  'user-agent': 'okhttp/4.9.3',
  accept: 'application/json',
  referer: apiOrigin,
}

const STEP_TIMEOUT_MS = 12_000
const VIDEO_TIMEOUT_MS = 12_000

const secKeySchema = z.object({
  code: z.number().int(),
  data: z.string().min(1).max(1024),
}).passthrough()

const searchRowSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  redirectId: z.union([z.string(), z.number()]).optional(),
  redirectIdStr: z.union([z.string(), z.number()]).optional(),
  title: z.string().max(300).optional(),
  name: z.string().max(300).optional(),
}).passthrough()

const detailsSchema = z.object({
  seasons: z.array(z.object({
    number: z.number().int(),
    movieId: z.union([z.string(), z.number()]).optional(),
  }).passthrough()).optional(),
  episodes: z.array(z.object({
    id: z.union([z.string(), z.number()]).optional(),
    number: z.number().int().optional(),
    tracks: z.array(z.object({
      languageId: z.union([z.string(), z.number()]).optional(),
      languageName: z.string().max(64).optional(),
      abbreviate: z.string().max(16).optional(),
      existIndividualVideo: z.boolean().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough()

const videoSchema = z.object({
  videos: z.array(z.object({ url: z.string().max(4096).optional() }).passthrough()).optional(),
  videoUrl: z.string().max(4096).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096).optional(),
    abbreviate: z.string().max(64).optional(),
    title: z.string().max(64).optional(),
  }).passthrough()).optional(),
}).passthrough()

const RES_LABEL: Record<number, string> = { 1: '480p', 2: '720p', 3: '1080p', 4: '4K' }

export type CastletvMetadata = { title: string; year: number | string }
export type CastletvMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<CastletvMetadata>
export type CastletvOptions = { id?: string }

function deriveKey(securityKey: string): Buffer {
  const keyBytes = Buffer.from(securityKey, 'base64')
  const suffix = Buffer.from('T!BgJB', 'utf8')
  const combined = Buffer.concat([keyBytes, suffix])
  if (combined.length < 16) return Buffer.concat([combined, Buffer.alloc(16 - combined.length, 0)])
  return combined.subarray(0, 16)
}

function decryptCastle(cipherText: string, securityKey: string): string {
  const key = deriveKey(securityKey)
  const decipher = createDecipheriv('aes-128-cbc', key, key)
  return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher.final()]).toString('utf8')
}

function castleSafeParse(text: string): unknown {
  return JSON.parse(text.replace(/([:{[,]\s*)(\d{16,})/g, '$1"$2"'))
}

function unwrap(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)
    && 'data' in value && (value as Record<string, unknown>).data
    && typeof (value as Record<string, unknown>).data === 'object'
    && !Array.isArray((value as Record<string, unknown>).data)) {
    return (value as Record<string, unknown>).data as Record<string, unknown>
  }
  return (value ?? {}) as Record<string, unknown>
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('CastleTV step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createCastletvProvider(
  http: ProviderHttp,
  metadata: CastletvMetadataResolver,
  now = Date.now,
  options: CastletvOptions = {},
) {
  const id = options.id ?? 'castletv'

  async function castleGet(path: string, signal: AbortSignal, init?: { method?: 'POST'; body?: string }): Promise<string> {
    const op = bounded(signal, STEP_TIMEOUT_MS)
    try {
      const headers = { ...apiHeaders, ...(init?.method === 'POST' ? { 'content-type': 'application/json' } : {}) }
      const response = await http(`${apiOrigin}${path}`, headers, op.signal,
        init?.method === 'POST' ? { method: 'POST', body: init.body ?? '' } : undefined)
      if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
      return response.text
    } finally {
      op.cleanup()
    }
  }

  function extractCipher(text: string): string {
    const trimmed = text.trim()
    if (!trimmed) throw new ProviderFailure('malformed')
    try {
      const parsed = JSON.parse(trimmed) as { data?: unknown }
      if (typeof parsed?.data === 'string' && parsed.data.trim()) return parsed.data.trim()
    } catch {
      // raw cipher body
    }
    return trimmed
  }

  return adapter(id, async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const isTv = ref.kind === 'series'
    const season = ref.season ?? 1
    const episode = ref.episode ?? 1

    const meta = await metadata(ref, signal).catch(() => null)
    const title = meta?.title?.trim()
    if (!title) throw new ProviderFailure('empty')
    const year = String(meta?.year ?? '').slice(0, 4)

    const secText = await castleGet(
      `/v0.1/system/getSecurityKey/1?channel=${channel}&clientType=${clientType}&lang=${lang}`, signal)
    let secKey: string
    try {
      const parsed = secKeySchema.parse(JSON.parse(secText))
      if (parsed.code !== 200 || !parsed.data) throw new ProviderFailure('unavailable')
      secKey = parsed.data
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('malformed')
    }

    const decrypt = (cipher: string): unknown => {
      try {
        return castleSafeParse(decryptCastle(cipher, secKey))
      } catch {
        throw new ProviderFailure('malformed')
      }
    }

    const keyword = year ? `${title} ${year}` : title
    const searchParams = new URLSearchParams({
      channel, clientType, keyword, lang, mode: '1', packageName, page: '1', size: '30',
    })
    const searchRaw = decrypt(extractCipher(await castleGet(
      `/film-api/v1.1.0/movie/searchByKeyword?${searchParams}`, signal)))
    const rows = z.array(searchRowSchema).catch([]).parse(unwrap(searchRaw).rows ?? [])
    if (!rows.length) throw new ProviderFailure('empty')
    const titleLc = title.toLowerCase()
    const match = rows.find((row) => {
      const name = String(row.title ?? row.name ?? '').toLowerCase()
      return name && (name.includes(titleLc) || titleLc.includes(name))
    }) ?? rows[0]!
    const castleId = String(match.id ?? match.redirectId ?? match.redirectIdStr ?? '')
    if (!castleId) throw new ProviderFailure('empty')

    const fetchDetails = async (movieId: string): Promise<z.infer<typeof detailsSchema>> => {
      const raw = decrypt(extractCipher(await castleGet(
        `/film-api/v1.9.9/movie?channel=${channel}&clientType=${clientType}&lang=${lang}&movieId=${encodeURIComponent(movieId)}&packageName=${packageName}`,
        signal)))
      return detailsSchema.parse(unwrap(raw))
    }

    let details = await fetchDetails(castleId).catch(() => { throw new ProviderFailure('unavailable') })
    let activeId = castleId
    if (isTv) {
      const seasonEntry = (details.seasons ?? []).find((entry) => entry.number === season)
      if (seasonEntry?.movieId && String(seasonEntry.movieId) !== castleId) {
        activeId = String(seasonEntry.movieId)
        details = await fetchDetails(activeId).catch(() => { throw new ProviderFailure('unavailable') })
      }
    }

    const episodes = details.episodes ?? []
    const epEntry = isTv ? episodes.find((entry) => entry.number === episode) : episodes[0]
    const episodeId = epEntry?.id != null ? String(epEntry.id) : null
    if (!episodeId) throw new ProviderFailure('empty')

    const tracks = ((epEntry?.tracks ?? []) as NonNullable<z.infer<typeof detailsSchema>['episodes']>[number]['tracks'])
    const usable = (tracks ?? []).filter((track) => track.existIndividualVideo !== false)
    const langTracks = usable.length ? usable.slice(0, 5) : [{ languageId: '', languageName: '', abbreviate: '' }]

    const getVideo = async (body: Record<string, string>): Promise<z.infer<typeof videoSchema>> => {
      const op = bounded(signal, VIDEO_TIMEOUT_MS)
      try {
        const response = await http(
          `${apiOrigin}/film-api/v2.0.1/movie/getVideo2?clientType=${clientType}&packageName=${packageName}&channel=${channel}&lang=${lang}`,
          { ...apiHeaders, 'content-type': 'application/json' },
          op.signal,
          {
            method: 'POST',
            body: JSON.stringify({
              mode: '1', appMarket: 'GuanWang', clientType, woolUser: 'false',
              apkSignKey: 'ED0955EB04E67A1D9F3305B95454FED485261475',
              androidVersion: '13', movieId: activeId, episodeId,
              isNewUser: 'true', packageName, ...body,
            }),
          },
        )
        if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
        const cipher = extractCipher(response.text)
        try {
          return videoSchema.parse(unwrap(castleSafeParse(decryptCastle(cipher, secKey))))
        } catch {
          throw new ProviderFailure('malformed')
        }
      } finally {
        op.cleanup()
      }
    }

    const sources: ProviderSource[] = []
    const subtitles: ProviderSource['subtitles'] = []
    const seen = new Set<string>()
    const seenSubs = new Set<string>()

    for (const track of langTracks) {
      const langLabel = String(track.languageName || track.abbreviate || '')
      for (const resolution of [3, 2]) {
        let data: z.infer<typeof videoSchema>
        try {
          data = await getVideo(track.languageId
            ? { languageId: String(track.languageId), resolution: String(resolution) }
            : { resolution: String(resolution) })
        } catch {
          continue
        }
        // NOTE (PROVE 2026-09-12): videos[] entries are resolution metadata
        // only (no urls); the playable stream is top-level videoUrl.
        const candidates = [
          ...((data.videos ?? []).filter((entry) => entry.url).map((entry) => entry.url as string)),
          ...(data.videoUrl ? [data.videoUrl] : []),
        ]
        for (const rawUrl of candidates) {
          if (!rawUrl.startsWith('https://') || seen.has(rawUrl)) continue
          const type = mediaType(rawUrl) ?? (/\.mp4(\?|#|$)/i.test(rawUrl) ? 'native' : 'hls')
          let expiresAt: string
          try {
            expiresAt = accessDeadline(rawUrl, now())
          } catch {
            continue
          }
          seen.add(rawUrl)
          sources.push({
            key: `${id}:${(RES_LABEL[resolution] ?? 'auto').toLowerCase()}:${sources.length}`,
            url: rawUrl,
            type,
            qualityHint: RES_LABEL[resolution] ?? 'Auto',
            expiresAt,
            language: (langLabel || 'original').slice(0, 32),
            headers: {},
            subtitles: [],
            ...(resolution === 3 ? { height: 1080 } : resolution === 2 ? { height: 720 } : {}),
          })
          if (sources.length >= 12) break
        }
        for (const sub of data.subtitles ?? []) {
          if (!sub.url || seenSubs.has(sub.url)) continue
          seenSubs.add(sub.url)
          const label = String(sub.abbreviate || sub.title || 'Unknown').slice(0, 64)
          subtitles.push({
            id: `${id}-sub-${subtitles.length}`,
            label,
            language: label.slice(0, 32),
            url: String(sub.url).replace(/ /g, '%20'),
            format: 'vtt',
          })
          if (subtitles.length >= 20) break
        }
        if (sources.length >= 12) break
      }
      if (sources.length >= 12) break
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources.map((source) => ({ ...source, subtitles }))
  })
}
