import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const API = 'https://api.aniclover.cc'
const SITE = 'https://aniclover.cc'

// Port of the PROVE Aniclover recipe (verified live 2026-10-16): one AniList-keyed
// stream-resolver call per episode and audio category, with captions riding the
// same host. Streams come back wrapped by the upstream zanora m3u8 proxy
// (https://beta.zanora.xyz/m3u8-proxy?url=<opaque>), whose path token Consumit's
// relay guard rejects on a direct row — the roster tier for that host is an
// operator decision made outside this adapter.
// Delivery tier: DIRECT (operator). Consumit verification date: 2026-10-16.
const REQUEST_TIMEOUT_MS = 8000
const MAX_SOURCES = 8

const apiHeaders = { origin: SITE, referer: `${SITE}/`, accept: 'application/json' }

const streamSchema = z.object({
  url: z.string().max(4096).optional(),
  type: z.string().max(16).optional(),
}).passthrough()

const subtitleSchema = z.object({
  lang: z.string().max(32).optional(),
  label: z.string().max(64).optional(),
  url: z.string().max(4096).optional(),
  file: z.string().max(4096).optional(),
}).passthrough()

const watchSchema = z.object({
  success: z.boolean().optional(),
  provider: z.string().max(64).optional(),
  server: z.string().max(64).optional(),
  streams: z.array(streamSchema).max(32).optional(),
  subtitles: z.array(subtitleSchema).max(32).optional(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Aniclover stream timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function subtitleFormat(url: string): 'vtt' | 'srt' | 'ass' {
  const path = url.split(/[?#]/)[0] ?? url
  if (/\.srt$/i.test(path)) return 'srt'
  if (/\.ass$/i.test(path)) return 'ass'
  return 'vtt'
}

export function createAnicloverProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('aniclover', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'

    const op = bounded(signal, REQUEST_TIMEOUT_MS)
    let payload: z.infer<typeof watchSchema>
    try {
      const response = await document(http, `${API}/api/watch/${ref.id}/${audio}/${ref.episode}`, op.signal, apiHeaders)
      const text = response.text.trim()
      if (!text) throw new ProviderFailure('empty')
      payload = watchSchema.parse(JSON.parse(text))
    } finally {
      op.cleanup()
    }
    if (payload.success === false) throw new ProviderFailure('empty')

    const seen = new Set<string>()
    const candidates: ProviderSource[] = []
    for (const stream of payload.streams ?? []) {
      if (candidates.length >= MAX_SOURCES) break
      const url = String(stream.url ?? '').trim()
      if (!url.startsWith('https://') || url.length > 4096 || seen.has(url)) continue
      const hint = /mp4/i.test(stream.type ?? '') ? 'mp4' : /m3u8|hls/i.test(stream.type ?? '') ? 'hls' : undefined
      let expiresAt: string
      try {
        expiresAt = accessDeadline(url, now())
      } catch {
        continue
      }
      seen.add(url)
      candidates.push({
        key: `aniclover:${(payload.provider ?? payload.server ?? 'hd1').slice(0, 24)}:${audio}:${ref.episode}:${candidates.length}`, serverName: (payload.provider ?? payload.server ?? 'HD1').slice(0, 80),
        url,
        type: mediaType(url, hint) ?? 'hls',
        headers: { origin: SITE, referer: `${SITE}/` },
        expiresAt,
        language: dub ? 'en' : 'original',
        qualityHint: 'Auto',
        subtitles: [],
      })
    }
    if (!candidates.length) throw new ProviderFailure('empty')

    const verified = await verifiedPlaybackSources(http, candidates, signal)
    if (!verified.length) throw new ProviderFailure('empty')

    const subtitles: ProviderSource['subtitles'] = []
    const seenSubtitles = new Set<string>()
    for (const track of payload.subtitles ?? []) {
      if (subtitles.length >= 32) break
      const url = String(track.url ?? track.file ?? '').trim()
      if (!url.startsWith('https://') || url.length > 4096 || seenSubtitles.has(url)) continue
      seenSubtitles.add(url)
      const language = (track.lang ?? 'en').toLowerCase().slice(0, 32)
      const label = (track.label ?? track.lang ?? 'English').slice(0, 64) || 'English'
      subtitles.push({
        id: `aniclover-sub-${subtitles.length}`,
        label,
        language,
        url,
        format: subtitleFormat(url),
      })
    }
    return verified.map((source) => ({ ...source, subtitles }))
  }), { audioLanguages: ['ja', 'en'] })
}
