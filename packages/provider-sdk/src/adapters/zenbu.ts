import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { adapter, document, mediaType, ProviderFailure, sourceAccess, type ProviderHttp } from './http.ts'

const SITE = 'https://zen-bu.cc'
const API = 'https://megadown.zen-bu.cc'
const STEP_TIMEOUT_MS = 8000

// Port of the PROVE Zenbu recipe (verified 2026-10-16): one signed JSON
// endpoint per episode. Bare requests get a CF 403; the zen-bu.cc referer
// unlocks it. The response carries per-provider entries (shorekeeper) with a
// signed HLS master per audio lane, mirrored on edge.vidcdn-904.workers.dev
// and edge.vidcache.workers.dev under the same token, plus soft English VTT
// tracks. Tokens rotate per request and absoluteExpiryMs is minutes out, so
// each source carries the real upstream deadline through sourceAccess; no
// pre-return probe is made because a repeated GET can burn the signature
// (gating happens at selection time instead). PROVE labels both edge workers
// a relay (fixed ACAO allowlist https://zen-bu.cc); the operator assigned
// DIRECT delivery. Audio fallback: a missing dub lane serves sub, labelled
// with the audio actually served.
const entrySchema = z.object({
  providerId: z.string().max(64),
  audio: z.string().max(16),
  resolution: z.string().max(16).optional(),
  format: z.string().max(32),
  url: z.string().max(4096),
  absoluteExpiryMs: z.number().optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(128).optional(),
    kind: z.string().max(32).optional(),
    isDefault: z.boolean().optional(),
  }).passthrough()).max(32).optional(),
}).passthrough()
const episodesSchema = z.object({ data: z.array(entrySchema).max(32).default([]) }).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Zenbu episode lookup timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createZenbuProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('zenbu', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const wanted: 'sub' | 'dub' = input.audioLanguage === 'en' ? 'dub' : 'sub'

    const op = bounded(signal, STEP_TIMEOUT_MS)
    let entries: z.infer<typeof entrySchema>[]
    try {
      const response = await document(http, `${API}/episodes/${ref.id}/${ref.episode}`, op.signal, {
        accept: 'application/json',
        referer: `${SITE}/`,
      })
      entries = episodesSchema.parse(JSON.parse(response.text)).data
    } finally {
      op.cleanup()
    }
    if (!entries.length) throw new ProviderFailure('empty')

    let usedAudio = wanted
    let picked = entries.filter((entry) => entry.audio === wanted && entry.url)
    if (!picked.length) {
      const other = wanted === 'dub' ? 'sub' : 'dub'
      picked = entries.filter((entry) => entry.audio === other && entry.url)
      if (picked.length) usedAudio = other
    }
    if (!picked.length) throw new ProviderFailure('empty')

    // Same token mirrored on two worker hosts; keep one entry per host.
    const seenHosts = new Set<string>()
    const seenSubs = new Set<string>()
    const subtitles: ProviderSource['subtitles'] = []
    const sources: ProviderSource[] = []
    for (const entry of picked) {
      if (sources.length >= 2) break
      let host: string
      try {
        host = new URL(entry.url).host
      } catch {
        continue
      }
      if (seenHosts.has(host)) continue
      seenHosts.add(host)
      if (!/^https:\/\//i.test(entry.url)) continue
      let expiresAt: string
      try {
        expiresAt = sourceAccess(entry.url, now(), entry.absoluteExpiryMs).expiresAt
      } catch {
        continue
      }
      const quality = entry.resolution && entry.resolution !== 'auto' ? entry.resolution.slice(0, 24) : 'Auto'
      sources.push({
        key: `zenbu:${entry.providerId}:${usedAudio}:${host.split('.')[0] ?? host}`.slice(0, 100), serverName: entry.providerId.slice(0, 80),
        url: entry.url,
        type: mediaType(entry.url, entry.format === 'hls_m3u8' ? 'hls' : undefined) ?? 'hls',
        headers: { referer: `${SITE}/` },
        expiresAt,
        language: usedAudio === 'dub' ? 'en' : 'original',
        qualityHint: quality,
        subtitles: [],
      })
      for (const track of entry.subtitles ?? []) {
        if (!track.url?.startsWith('https://') || seenSubs.has(track.url) || subtitles.length >= 32) continue
        seenSubs.add(track.url)
        const label = (track.label || 'English').slice(0, 64)
        subtitles.push({ id: `zenbu-sub-${subtitles.length}`, label, language: label.slice(0, 32), url: track.url, format: 'vtt' })
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources.map((source) => ({ ...source, subtitles }))
  }), { audioLanguages: ['ja', 'en'] })
}
