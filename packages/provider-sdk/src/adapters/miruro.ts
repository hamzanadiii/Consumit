import { Buffer } from 'node:buffer'
import { gunzipSync } from 'node:zlib'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import type { AnimeTitleResolver } from './anixo.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, verifiedPlaybackSources, type ProviderHttp, type ProviderHttpResponse } from './http.ts'

// Port of the PROVE Miruro recipe (2026-10-15 rewrite): the miruro.bz SPA's
// /api/v1 catalog keyed by AniList id (anilist_id_in) or scored title search
// (titleScore >= 0.4); play returns ssub/sdub tracks whose providers carry
// per-server Referer headers and direct HLS/mp4 streams. Octet-stream bodies
// are XOR("miruro/catalog") then gunzipped into JSON. Operator declares the
// row direct, so provider-embedded VTT/SRT/ASS tracks ride each source and
// every candidate master is gated before it can become a session.
// Delivery: direct. Verified against the PROVE chain on 2026-10-16.
const BASE = 'https://www.miruro.bz'
const CAW_KEY = Buffer.from('miruro/catalog', 'utf8')
const STEP_TIMEOUT_MS = 8000
const MAX_SOURCES = 8

const streamSchema = z.object({
  url: z.string().max(4096).optional(),
  format: z.string().max(16).optional(),
}).passthrough()
const serverSchema = z.object({
  server: z.string().max(64).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  streams: z.array(streamSchema).max(32).optional(),
}).passthrough()
const providerSchema = z.object({
  provider: z.string().max(64).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096).optional(),
    label: z.string().max(128).optional(),
    language: z.string().max(32).optional(),
  }).passthrough()).max(64).optional(),
  servers: z.array(serverSchema).max(16).optional(),
}).passthrough()
const trackSchema = z.object({
  track: z.string().max(32).optional(),
  providers: z.array(providerSchema).max(16).optional(),
}).passthrough()
const playSchema = z.object({ tracks: z.array(trackSchema).max(16).optional() }).passthrough()
const catalogSchema = z.object({
  data: z.array(z.object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.object({
      romaji: z.string().max(256).optional(),
      english: z.string().max(256).optional(),
      native: z.string().max(256).optional(),
    }).passthrough().optional(),
  }).passthrough()).optional(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Miruro step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function titleScore(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xw = new Set(x.split(' '))
  const yw = new Set(y.split(' '))
  let inter = 0
  for (const w of xw) if (yw.has(w)) inter++
  return inter / Math.max(xw.size, yw.size)
}

function decodeCaw(raw: Buffer): unknown {
  const t = Buffer.from(raw)
  for (let i = 0; i < t.length; i++) t[i] = (t[i] ?? 0) ^ (CAW_KEY[i % CAW_KEY.length] ?? 0)
  return JSON.parse(gunzipSync(t).toString('utf8'))
}

function decodeBody(response: ProviderHttpResponse): unknown {
  const raw = response.bytes ?? Buffer.from(response.text, 'utf8')
  const contentType = response.headers?.get('content-type') ?? ''
  if (contentType.includes('octet-stream') || (raw.length > 2 && raw[0] === 0x72 && raw[1] !== 0x2e)) {
    try { return decodeCaw(Buffer.from(raw)) } catch { /* fall through to plain JSON */ }
  }
  return JSON.parse(response.text)
}

const MEDIA_HEADER_KEYS = new Set(['referer', 'origin', 'user-agent', 'accept'])

function mediaHeaders(raw: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    const lower = key.toLowerCase()
    if (MEDIA_HEADER_KEYS.has(lower) && typeof value === 'string' && value.length <= 2048) out[lower] = value
  }
  return out
}

function mapSubtitle(track: { url?: string | undefined; label?: string | undefined; language?: string | undefined }, id: string, index: number): ProviderSource['subtitles'][number] | null {
  const url = track.url
  if (!url?.startsWith('https://') || url.length > 4096) return null
  const label = (track.label || track.language || 'English').slice(0, 64)
  const format = /\.srt(?:[?#]|$)/i.test(url) ? 'srt' as const : /\.ass(?:[?#]|$)/i.test(url) ? 'ass' as const : 'vtt' as const
  return { id: `${id}-sub-${index}`, label, language: label.slice(0, 32), url, format }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

export function createMiruroProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now, resolveTitleVariants?: AnimeTitleVariantsResolver) {
  const apiGet = async (path: string, signal: AbortSignal): Promise<unknown> => {
    const op = bounded(signal, STEP_TIMEOUT_MS)
    try {
      const response = await document(http, `${BASE}/api${path}`, op.signal, { accept: '*/*' })
      return decodeBody(response)
    } finally {
      op.cleanup()
    }
  }

  const resolveMiruroId = async (anilistId: number, titles: readonly string[], signal: AbortSignal): Promise<string | null> => {
    try {
      const page = catalogSchema.parse(await apiGet(`/v1/anime?anilist_id_in=${anilistId}&limit=1`, signal))
      const hit = page.data?.[0]
      if (hit?.id) return String(hit.id)
    } catch {
      // 404/absent AniList mapping falls through to a scored title search.
    }
    for (const title of titles.slice(0, 4)) {
      const page = catalogSchema.parse(await apiGet(`/v1/anime?q=${encodeURIComponent(title)}&limit=15`, signal))
      let best: { id: string; score: number } | null = null
      for (const item of page.data ?? []) {
        if (!item?.id) continue
        const candidates = [item.title?.romaji, item.title?.english, item.title?.native].filter((c): c is string => Boolean(c))
        let score = 0
        for (const candidate of candidates) score = Math.max(score, titleScore(title, candidate))
        if (!best || score > best.score) best = { id: String(item.id), score }
      }
      if (best && best.score >= 0.4) return best.id
    }
    return null
  }

  return Object.assign(adapter('miruro', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    // Audio convention: explicit English requests dub, everything else plays
    // the original with subtitles; the wanted track is preferred, foreign
    // tracks only fill in when the wanted one has no streams.
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'
    let title = ''
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      // AniList-id lookup can still land without a title.
    }
    let aliases: readonly string[] = []
    try { aliases = resolveTitleVariants ? await resolveTitleVariants(ref.id, signal) : [] } catch { /* canonical title remains usable */ }
    const titles = [...new Set([title, ...aliases].map(value => value.trim()).filter(Boolean))]
    const id = await resolveMiruroId(ref.id, titles, signal)
    if (!id) throw new ProviderFailure('empty')

    const play = playSchema.parse(await apiGet(`/v1/anime/${id}/episodes/${ref.episode}/play`, signal))
    const tracks = play.tracks ?? []
    if (!tracks.length) throw new ProviderFailure('empty')
    const wanted = dub ? ['sdub', 'ssub'] : ['ssub', 'sdub']
    const ordered = [
      ...wanted.map((w) => tracks.find((t) => t.track === w)).filter((t) => t !== undefined),
      ...tracks.filter((t) => !t.track || !wanted.includes(t.track)),
    ]

    const seenUrls = new Set<string>()
    const seenKeys = new Set<string>()
    const seenSubs = new Set<string>()
    const sources: ProviderSource[] = []
    const subtitles: ProviderSource['subtitles'] = []
    for (const track of ordered) {
      for (const provider of track.providers ?? []) {
        const provName = String(provider.provider ?? 'unknown')
        for (const sub of provider.subtitles ?? []) {
          if (!sub.url || seenSubs.has(sub.url) || subtitles.length >= 32) continue
          seenSubs.add(sub.url)
          const mapped = mapSubtitle(sub, 'miruro', subtitles.length)
          if (mapped) subtitles.push(mapped)
        }
        for (const server of provider.servers ?? []) {
          const serverName = String(server.server ?? provName)
          const headers = mediaHeaders(server.headers)
          for (const stream of server.streams ?? []) {
            const rawUrl = stream.url
            if (!rawUrl?.startsWith('https://') || rawUrl.length > 4096 || sources.length >= MAX_SOURCES) continue
            if (seenUrls.has(rawUrl)) continue
            seenUrls.add(rawUrl)
            let expiresAt: string
            try {
              expiresAt = accessDeadline(rawUrl, now())
            } catch {
              continue
            }
            const lane = slug(`${provName}-${serverName}`) || 'src'
            let key = `miruro:${audio}:${lane}:${ref.episode}`
            if (seenKeys.has(key)) key = `${key}:${sources.length}`
            seenKeys.add(key)
            const hint = stream.format === 'hls' ? 'hls' : stream.format === 'mp4' ? 'mp4' : undefined
            sources.push({
              key, serverName: `${provName} · ${serverName}`.slice(0, 80), url: rawUrl, type: mediaType(rawUrl, hint) ?? 'hls', headers, expiresAt,
              language: dub ? 'en' : 'original',
              qualityHint: 'Auto',
              subtitles: [],
            })
          }
        }
      }
      if (sources.length) break // first track with streams wins
    }
    if (!sources.length) throw new ProviderFailure('empty')
    const verified = await verifiedPlaybackSources(http, sources.map((source) => ({ ...source, subtitles })), signal)
    if (!verified.length) throw new ProviderFailure('empty')
    return verified.slice(0, MAX_SOURCES)
  }), { audioLanguages: ['ja', 'en'] })
}
