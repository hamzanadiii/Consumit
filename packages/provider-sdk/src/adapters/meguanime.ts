import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, providerFailureFromOutcomes, providerOutcome, verifiedPlaybackSources, type ProviderHttp, type ProviderOutcome } from './http.ts'

const SITE = 'https://meguanime.com'

// Port of the PROVE MeguAnimes recipe (verified live 2026-10-15): a public
// AniList-keyed aggregator API, one route per upstream lane, no auth. SUB and
// DUB each declare a lane preference order; every lane answers source lists
// plus caption tracks, and the lanes now probe in parallel so a dead upstream
// falls through instead of failing the resolve. Streams ride MeguAnimes'
// signed CDN relay (bare-OK, no upstream headers), so they stay browser-direct
// after the shared manifest gate drops dead URLs. Delivery tier: DIRECT.
// Consumit verification date: 2026-10-16.
const LANE_TIMEOUT_MS = 8000
const MAX_SOURCES = 5
const MAX_SUBTITLES = 32

const SUB_LANES: readonly string[] = ['aniwaves', 'zoko', 'miruro', 'kiwi', 'animegg', 'anibd']
const DUB_LANES: readonly string[] = ['dub', 'animegg', 'miruro', 'aniwaves']

const apiHeaders = { accept: 'application/json, text/plain, */*', referer: `${SITE}/` }

const laneSchema = z.object({
  source: z.string().max(4096).optional(),
  sources: z.array(z.unknown()).max(64).optional(),
  qualities: z.array(z.unknown()).max(64).optional(),
  tracks: z.array(z.unknown()).max(64).optional(),
}).passthrough()

type Entry = { url: string; label: string | undefined }
type Track = { lane: string; url: string; label: string; format: 'vtt' | 'srt' | 'ass' }
type LaneResult = { entries: Entry[]; tracks: Track[] }

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('MeguAnimes lane timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

/** Signed-relay rows bury the real extension behind `?u=<target>`, so the
 *  wrapped value supplies the type hint when the relay URL itself is opaque. */
function classifyType(url: string): ProviderSource['type'] {
  const direct = mediaType(url)
  if (direct) return direct
  try {
    const target = new URL(url).searchParams.get('u')
    if (target) {
      const wrapped = mediaType(target)
      if (wrapped) return wrapped
    }
  } catch {
    // Not a URL; fall through to the HLS default.
  }
  return 'hls'
}

function subtitleFormat(url: string): 'vtt' | 'srt' | 'ass' {
  const path = url.split(/[?#]/)[0] ?? url
  if (/\.srt$/i.test(path)) return 'srt'
  if (/\.ass$/i.test(path)) return 'ass'
  return 'vtt'
}

function field(record: unknown, ...names: string[]): unknown {
  if (!record || typeof record !== 'object') return undefined
  const source = record as Record<string, unknown>
  for (const name of names) {
    const value = source[name]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function entriesOf(payload: z.infer<typeof laneSchema>): Entry[] {
  const entries: Entry[] = []
  const push = (raw: unknown, label: unknown) => {
    const url = typeof raw === 'string' ? raw.trim() : ''
    if (!url.startsWith('https://') || url.length > 4096) return
    entries.push({ url, label: typeof label === 'string' ? label.slice(0, 64) : undefined })
  }
  const listed = Array.isArray(payload.sources) ? payload.sources : []
  if (listed.length) {
    for (const item of listed) push(field(item, 'source'), field(item, 'name'))
  } else {
    push(payload.source, undefined)
  }
  for (const item of Array.isArray(payload.qualities) ? payload.qualities : []) {
    push(field(item, 'source'), field(item, 'label'))
  }
  return entries
}

function tracksOf(payload: z.infer<typeof laneSchema>, lane: string): Track[] {
  const tracks: Track[] = []
  for (const item of Array.isArray(payload.tracks) ? payload.tracks : []) {
    if (field(item, 'kind') === 'thumbnails') continue
    const url = String(field(item, 'file', 'url') ?? '').trim()
    if (!url.startsWith('https://') || url.length > 4096) continue
    const label = typeof field(item, 'label') === 'string' ? String(field(item, 'label')).slice(0, 64) : 'English'
    tracks.push({ lane, url, label: label || 'English', format: subtitleFormat(url) })
  }
  return tracks
}

async function fetchLane(http: ProviderHttp, lane: string, audio: string, id: number, episode: number, signal: AbortSignal): Promise<LaneResult> {
  const op = bounded(signal, LANE_TIMEOUT_MS)
  try {
    const sep = lane === 'anibd' ? '' : `&lang=${audio}`
    const response = await document(http, `${SITE}/api/${lane}?al=${id}&ep=${episode}${sep}`, op.signal, apiHeaders)
    const text = response.text.trim()
    if (!text) throw new ProviderFailure('empty')
    const payload = laneSchema.parse(JSON.parse(text))
    return { entries: entriesOf(payload), tracks: tracksOf(payload, lane) }
  } finally {
    op.cleanup()
  }
}

export function createMeguanimeProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('meguanime', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const { id, episode } = ref
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'
    const lanes = dub ? [...DUB_LANES, ...SUB_LANES.filter((lane) => !DUB_LANES.includes(lane))] : [...SUB_LANES]

    const settled = await Promise.allSettled(lanes.map((lane) => fetchLane(http, lane, audio, id, episode, signal)))

    const outcomes: ProviderOutcome[] = []
    const candidates: ProviderSource[] = []
    const seen = new Set<string>()
    const tracks: Track[] = []
    const trackUrls = new Set<string>()
    for (let index = 0; index < settled.length; index++) {
      const lane = lanes[index]!
      const result = settled[index]!
      if (result.status === 'rejected') {
        outcomes.push(providerOutcome(result.reason))
        continue
      }
      outcomes.push({ code: 'ok' })
      for (const track of result.value.tracks) {
        if (trackUrls.has(track.url)) continue
        trackUrls.add(track.url)
        tracks.push(track)
      }
      for (const entry of result.value.entries) {
        if (candidates.length >= MAX_SOURCES) break
        if (seen.has(entry.url)) continue
        seen.add(entry.url)
        let expiresAt: string
        try {
          expiresAt = accessDeadline(entry.url, now())
        } catch {
          continue
        }
        candidates.push({
          key: `meguanime:${lane}:${audio}:${ref.episode}:${candidates.length}`, serverName: lane.slice(0, 80),
          url: entry.url,
          type: classifyType(entry.url),
          headers: { referer: `${SITE}/` },
          expiresAt,
          language: dub ? 'en' : 'original',
          qualityHint: (entry.label ?? '').trim().slice(0, 24) || 'Auto',
          subtitles: [],
        })
      }
      if (candidates.length >= MAX_SOURCES) break
    }
    if (!candidates.length) throw providerFailureFromOutcomes(outcomes)

    const verified = await verifiedPlaybackSources(http, candidates, signal)
    if (!verified.length) throw new ProviderFailure('empty')

    // Captions stay scoped to lanes whose stream actually survived the gate.
    const liveLanes = new Set(verified.map((source) => source.key.split(':')[1] ?? ''))
    const subtitles = tracks
      .filter((track) => liveLanes.has(track.lane))
      .map((track, index) => ({
        id: `meguanime-sub-${index}`,
        label: track.label,
        language: track.label.slice(0, 32),
        url: track.url,
        format: track.format,
      }))
      .slice(0, MAX_SUBTITLES)
    return verified.map((source) => ({ ...source, subtitles }))
  }), { audioLanguages: ['ja', 'en'] })
}
