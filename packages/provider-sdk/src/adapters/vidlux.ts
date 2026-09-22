import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash } from 'node:crypto'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const origin = 'https://vidlux.xyz'
const keyMaterial = createHash('sha256').update('vidlux-stream-encryption-2026-secure-key', 'utf8').digest()

const SERVERS = [
  'spider',
  'rocket',
  'star',
  'bolt',
  'quilox',
  'vidrock',
  'dubai',
  'magic',
  'vixsrc',
  'astra',
] as const

// Direct-only architecture: relay/proxy wrappers never become sources.
const RELAY_RE = /workers\.dev|mp4-proxy|messagebroker|proxy\?(url|data)=|%3A%2F%2F.*url%3D/i
const EMBED_RE = /\/embed\//i
const PLAYLIST_RE = /streamrk\.site\/playlist\//i

const MAX_SOURCES = 12
const MAX_SUBTITLES = 20

// Ten servers fan out per attempt with no upstream deadline of their own:
// one hanging server must not hold nine healthy answers hostage past the
// resolver's attempt budget. Each extraction and playlist expansion gets its
// own tight deadline and degrades to "no data" instead.
const SERVER_TIMEOUT_MS = 2500
const PLAYLIST_TIMEOUT_MS = 2000

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('VidLux server timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

const extractEnvelopeSchema = z.object({
  encrypted: z.boolean().optional(),
  data: z.string().max(1_000_000).optional(),
}).passthrough()
const streamItemSchema = z.object({
  file: z.string().max(4096).optional(),
  url: z.string().max(4096).optional(),
  title: z.string().max(128).optional(),
  quality: z.union([z.string().max(32), z.number()]).optional(),
  type: z.string().max(16).optional(),
}).passthrough()
const captionItemSchema = z.object({
  file: z.string().max(4096).optional(),
  url: z.string().max(4096).optional(),
  label: z.string().max(128).optional(),
  language: z.string().max(64).optional(),
}).passthrough()
const payloadSchema = z.object({
  streams: z.array(streamItemSchema).max(64).optional(),
  captions: z.array(captionItemSchema).max(64).optional(),
}).passthrough()
const playlistLevelSchema = z.object({
  resolution: z.union([z.number(), z.string().max(8)]).optional(),
  url: z.string().max(4096),
}).passthrough()
const playlistSchema = z.array(playlistLevelSchema).max(32)

/** AES-GCM nonce||ciphertext+tag envelope keyed by SHA256 of the lab-noted passphrase. node:crypto only. */
function decryptPayload(encB64: string): unknown | null {
  try {
    if (encB64.length === 0 || encB64.length > 1_400_000) return null
    const raw = Buffer.from(encB64, 'base64')
    if (raw.length < 29 || raw.length > 1_000_000) return null
    const iv = raw.subarray(0, 12)
    const ctAndTag = raw.subarray(12)
    if (ctAndTag.length < 17) return null
    const tag = ctAndTag.subarray(ctAndTag.length - 16)
    const ct = ctAndTag.subarray(0, ctAndTag.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', keyMaterial, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    if (plain.length === 0 || plain.length > 1_000_000) return null
    return JSON.parse(plain) as unknown
  } catch {
    return null
  }
}

function extractToken(html: string): string | null {
  const token = html.match(/requestToken\\?":\\?"([^"\\]{1,2048})/)?.[1]
  return token && token.length > 0 ? token : null
}

function serverSlug(server: string): string {
  const slug = server.toLowerCase().replace(/[^a-z0-9-]+/g, '').slice(0, 32)
  return slug || 'server'
}

function qualityOf(quality: string | number | undefined, title: string | undefined): string {
  const raw = String(quality ?? title ?? 'Auto').trim().slice(0, 24)
  return raw || 'Auto'
}

function heightOf(quality: string): number | undefined {
  const match = /(\d{3,4})\s*p/i.exec(quality)
  if (!match?.[1]) return undefined
  const height = Number.parseInt(match[1], 10)
  return Number.isFinite(height) && height >= 144 && height <= 4320 ? height : undefined
}

function classifyMedia(url: string, typeHint: string | undefined): ProviderSource['type'] | undefined {
  const hint = typeHint?.toLowerCase() === 'mp4' ? 'mp4' : typeHint?.toLowerCase() === 'hls' ? 'hls' : undefined
  const viaHelper = mediaType(url, hint)
  if (viaHelper) return viaHelper
  if (/\.mpd(\?|#|$)/i.test(url)) return 'dash'
  return undefined
}

/** Direct browser-playable HTTPS media only: no proxy/relay wrappers, no embed pages. */
function isDirectCandidate(rawUrl: string): boolean {
  if (!/^https:\/\//i.test(rawUrl)) return false
  if (RELAY_RE.test(rawUrl)) return false
  if (EMBED_RE.test(rawUrl)) return false
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false
  } catch {
    return false
  }
  return true
}

type PendingStream = { server: string; url: string; quality: string; typeHint: string | undefined; playlist: boolean }
type ServerOutcome = { streams: PendingStream[]; captions: Array<{ url: string; label: string; language: string }> }

/** Port of the supplied VidLux recipe: embed-page token, fanned-out
 *  AES-GCM extracts across the ten lab-noted servers, then direct-only
 *  selection with streamrk playlist expansion. No page scripts run and no
 *  proxy/relay/iframe URLs survive selection. */
export function createVidluxProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidlux', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const tmdbId = String(ref.id)
    const embedUrl = isTv
      ? `${origin}/embed/tv/${encodeURIComponent(tmdbId)}/${ref.season}/${ref.episode}`
      : `${origin}/embed/movie/${encodeURIComponent(tmdbId)}`
    const deliveryHeaders = { referer: embedUrl, 'user-agent': userAgent }

    const embed = await document(http, embedUrl, signal, {
      'user-agent': userAgent,
      accept: 'text/html',
      referer: `${origin}/`,
    })
    const token = extractToken(embed.text)
    if (!token) throw new ProviderFailure('malformed')

    async function extractServer(server: string): Promise<ServerOutcome | null> {
      const op = bounded(signal, SERVER_TIMEOUT_MS)
      try {
        const params = new URLSearchParams({ id: tmdbId, type: isTv ? 'tv' : 'movie', _t: token ?? '' })
        if (isTv) {
          params.set('season', String(ref.season))
          params.set('episode', String(ref.episode))
        }
        const response = await document(http, `${origin}/api/extract/${server}?${params}`, op.signal, {
          'user-agent': userAgent,
          accept: 'application/json',
          referer: embedUrl,
        })
        if (response.text.length > 1_000_000) return null
        let body: unknown
        try {
          body = JSON.parse(response.text) as unknown
        } catch {
          return null
        }
        const envelope = extractEnvelopeSchema.safeParse(body)
        if (!envelope.success) return null
        // The magic server wants title/year hints the adapter input does not
        // carry, so it is queried without them like every other server.
        const payloadRaw: unknown = envelope.data.encrypted && typeof envelope.data.data === 'string'
          ? decryptPayload(envelope.data.data)
          : body
        if (!payloadRaw) return null
        const payload = payloadSchema.safeParse(payloadRaw)
        if (!payload.success) return null

        const streams: PendingStream[] = []
        for (const item of (payload.data.streams ?? []).slice(0, 16)) {
          const rawUrl = String(item.file ?? item.url ?? '').trim()
          if (!rawUrl || rawUrl.length > 4096 || !isDirectCandidate(rawUrl)) continue
          const playlist = PLAYLIST_RE.test(rawUrl)
          if (!playlist && !classifyMedia(rawUrl, item.type)) continue
          streams.push({ server, url: rawUrl, quality: qualityOf(typeof item.quality === 'number' ? String(item.quality) : item.quality, item.title), typeHint: item.type, playlist })
        }

        // WebVTT caption tracks only; styled/legacy formats travel no further.
        const captions: ServerOutcome['captions'] = []
        for (const caption of (payload.data.captions ?? []).slice(0, 32)) {
          const rawUrl = String(caption.file ?? caption.url ?? '').trim()
          if (!rawUrl || rawUrl.length > 4096 || !isDirectCandidate(rawUrl)) continue
          if (!/\.vtt(\?|#|$)/i.test(rawUrl)) continue
          try {
            if (new URL(rawUrl).protocol !== 'https:') continue
          } catch {
            continue
          }
          const label = String(caption.label ?? caption.language ?? 'Unknown').slice(0, 64) || 'Unknown'
          captions.push({ url: rawUrl, label, language: String(caption.language ?? caption.label ?? 'Unknown').slice(0, 32) || 'Unknown' })
        }
        return { streams, captions }
      } catch {
        return null
      } finally {
        op.cleanup()
      }
    }

    const settled = await Promise.all(SERVERS.map((server) => extractServer(server)))

    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    for (const outcome of settled) {
      if (!outcome) continue
      for (const caption of outcome.captions) {
        if (seenSubs.has(caption.url) || subtitles.length >= MAX_SUBTITLES) continue
        seenSubs.add(caption.url)
        subtitles.push({ id: `vidlux-sub-${subtitles.length}`, label: caption.label, language: caption.language, url: caption.url, format: 'vtt' })
      }
      if (subtitles.length >= MAX_SUBTITLES) break
    }

    const pending: PendingStream[] = []
    const seenStreams = new Set<string>()
    for (const outcome of settled) {
      if (!outcome) continue
      for (const stream of outcome.streams) {
        if (seenStreams.has(stream.url)) continue
        seenStreams.add(stream.url)
        pending.push(stream)
      }
    }

    const sources: ProviderSource[] = []
    const pushDirect = (server: string, url: string, quality: string, typeHint: string | undefined) => {
      if (sources.length >= MAX_SOURCES) return
      const type = classifyMedia(url, typeHint)
      if (!type) return
      let expiresAt: string
      try {
        expiresAt = accessDeadline(url, now())
      } catch {
        return
      }
      const height = heightOf(quality)
      sources.push({
        key: `vidlux:${serverSlug(server)}:${sources.length}`,
        url,
        type,
        headers: deliveryHeaders,
        expiresAt,
        language: 'original',
        qualityHint: quality || 'Auto',
        ...(height === undefined ? {} : { height }),
        subtitles: [],
      })
    }

    // Own-edge HLS first; streamrk playlist JSON expands VidRock-style into
    // per-resolution direct variants instead of surviving as a source.
    for (const stream of pending) {
      if (sources.length >= MAX_SOURCES) break
      signal.throwIfAborted()
      if (!stream.playlist) {
        pushDirect(stream.server, stream.url, stream.quality, stream.typeHint)
        continue
      }
      let levels: z.infer<typeof playlistSchema>
      const expansion = bounded(signal, PLAYLIST_TIMEOUT_MS)
      try {
        const playlistRes = await document(http, stream.url, expansion.signal, {
          ...deliveryHeaders,
          accept: 'application/json',
        })
        if (playlistRes.text.length > 1_000_000) continue
        levels = playlistSchema.parse(JSON.parse(playlistRes.text) as unknown)
      } catch {
        continue
      } finally {
        expansion.cleanup()
      }
      const variants = levels
        .filter((level) => level.url && isDirectCandidate(level.url) && classifyMedia(level.url, undefined))
        .slice(0, 3)
      for (const variant of variants) {
        if (sources.length >= MAX_SOURCES) break
        const resolution = String(variant.resolution ?? '').slice(0, 8)
        const quality = /^\d{3,4}$/.test(resolution) ? `${resolution}p` : qualityOf(resolution || undefined, stream.quality)
        pushDirect(stream.server, variant.url, quality, undefined)
      }
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources.map((source) => ({ ...source, subtitles }))
  })
}
