import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, parseSkipSegments, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const SITE = 'https://luffytv.live'

// Port of the PROVE LuffyTV recipe (verified live 2026-10-16): an AniList-native
// aggregator whose per-lane server endpoints normalize a dozen upstreams into
// one server shape. Lanes fan out in parallel and are consumed in declared
// order, each source keeping its own captions and intro/outro marks; the site's
// own /p/ reverse proxy answers bare, so surviving HLS rows stay browser-direct
// after the shared manifest gate drops dead URLs.
// Delivery tier: DIRECT. Consumit verification date: 2026-10-16.
const LANE_TIMEOUT_MS = 8000
const MAX_SOURCES = 8
const MAX_SUBTITLES_PER_SOURCE = 16

const LANES: readonly string[] = ['anipm', 'xanime', 'anv', 'aniwaves', 'kototv', 'animesalt']

const apiHeaders = { accept: 'application/json', referer: `${SITE}/` }

const subtitleTrackSchema = z.object({
  url: z.string().max(4096).optional(),
  lang: z.string().max(32).optional(),
  label: z.string().max(64).optional(),
}).passthrough()

const serverSchema = z.object({
  name: z.string().max(128).optional(),
  source: z.string().max(128).optional(),
  provider: z.string().max(128).optional(),
  type: z.string().max(16).optional(),
  quality: z.string().max(64).optional(),
  streamUrl: z.string().max(4096).optional(),
  isM3U8: z.boolean().optional(),
  isMP4: z.boolean().optional(),
  subtitleTracks: z.array(subtitleTrackSchema).max(32).optional(),
  intro: z.unknown().optional(),
  outro: z.unknown().optional(),
}).passthrough()

const laneSchema = z.object({ servers: z.array(serverSchema).max(64).optional() }).passthrough()

type Outcome = 'ok' | 'empty' | 'malformed' | 'unavailable'

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('LuffyTV lane timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function classify(error: unknown): Exclude<Outcome, 'ok'> {
  if (error instanceof ProviderFailure) return error.code
  if (error instanceof z.ZodError || error instanceof SyntaxError) return 'malformed'
  return 'unavailable'
}

function failureOf(outcomes: readonly Outcome[]): 'empty' | 'malformed' | 'unavailable' {
  if (outcomes.length && outcomes.every((outcome) => outcome === 'malformed')) return 'malformed'
  if (outcomes.length && outcomes.every((outcome) => outcome === 'unavailable')) return 'unavailable'
  return 'empty'
}

function absolute(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) return `${SITE}${raw}`
  return `${SITE}/${raw}`
}

function subtitleFormat(url: string): 'vtt' | 'srt' | 'ass' {
  const path = url.split(/[?#]/)[0] ?? url
  if (/\.srt$/i.test(path)) return 'srt'
  if (/\.ass$/i.test(path)) return 'ass'
  return 'vtt'
}

async function fetchLane(http: ProviderHttp, lane: string, id: number, episode: number, signal: AbortSignal) {
  const op = bounded(signal, LANE_TIMEOUT_MS)
  try {
    // PROVE appends ?title= for animesalt; this signature carries no title
    // resolver, so the lane is queried bare and answers empty when it needs one.
    const url = `${SITE}/api/anime/${lane}-servers/${id}/${episode}`
    const response = await document(http, url, op.signal, apiHeaders)
    const text = response.text.trim()
    if (!text) throw new ProviderFailure('empty')
    const payload = laneSchema.parse(JSON.parse(text))
    return payload.servers ?? []
  } finally {
    op.cleanup()
  }
}

export function createLuffytvProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('luffytv', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const { id, episode } = ref
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'

    const settled = await Promise.allSettled(LANES.map((lane) => fetchLane(http, lane, id, episode, signal)))

    const outcomes: Outcome[] = []
    const candidates: ProviderSource[] = []
    const seen = new Set<string>()
    for (let index = 0; index < settled.length; index++) {
      const lane = LANES[index]!
      const result = settled[index]!
      if (result.status === 'rejected') {
        outcomes.push(classify(result.reason))
        continue
      }
      outcomes.push('ok')
      for (const server of result.value) {
        if (candidates.length >= MAX_SOURCES) break
        const raw = server.streamUrl ?? ''
        if (!raw) continue
        // Audio filter: type is sub|dub; anything else reads as the original lane.
        if ((server.type === 'dub' ? 'dub' : 'sub') !== audio) continue
        const url = absolute(raw)
        if (!url.startsWith('https://') || url.length > 4096 || seen.has(url)) continue
        let expiresAt: string
        try {
          expiresAt = accessDeadline(url, now())
        } catch {
          continue
        }
        seen.add(url)
        const hint = server.isM3U8 ? 'hls' : server.isMP4 ? 'mp4' : undefined
        const skipSegments = parseSkipSegments(server)
        candidates.push({
          key: `luffytv:${(server.source ?? lane).slice(0, 24)}:${audio}:${ref.episode}:${candidates.length}`, serverName: (server.source ?? lane).slice(0, 80),
          url,
          type: mediaType(url, hint) ?? 'hls',
          headers: {},
          expiresAt,
          language: dub ? 'en' : 'original',
          qualityHint: (server.quality ?? '').trim().slice(0, 24) || 'Auto',
          subtitles: subtitlesOf(server.subtitleTracks),
          ...(skipSegments.length ? { skipSegments } : {}),
        })
      }
      if (candidates.length >= MAX_SOURCES) break
    }
    if (!candidates.length) throw new ProviderFailure(failureOf(outcomes))

    const verified = await verifiedPlaybackSources(http, candidates, signal)
    if (!verified.length) throw new ProviderFailure('empty')
    return verified
  }), { audioLanguages: ['ja', 'en'] })
}

function subtitlesOf(tracks: z.infer<typeof subtitleTrackSchema>[] | undefined): ProviderSource['subtitles'] {
  if (!tracks?.length) return []
  const subtitles: ProviderSource['subtitles'] = []
  const seen = new Set<string>()
  for (const track of tracks) {
    if (subtitles.length >= MAX_SUBTITLES_PER_SOURCE) break
    const url = absolute(String(track.url ?? '').trim())
    if (!url.startsWith('https://') || url.length > 4096 || seen.has(url)) continue
    seen.add(url)
    const label = (track.label ?? track.lang ?? 'English').slice(0, 64) || 'English'
    subtitles.push({
      id: `luffytv-sub-${subtitles.length}`,
      label,
      language: (track.lang ?? label).slice(0, 32),
      url,
      format: subtitleFormat(url),
    })
  }
  return subtitles
}
