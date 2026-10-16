import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const BOOT = 'https://embed.vidrift.net/api/boot'
const MB = 'https://mb.vidrift.net'
// Record the provider player Origin for verification and approved relay
// grants. Production-origin browser reads have returned 403; a source hint
// cannot change the browser's own Origin on Direct requests.
const ORIGIN = 'https://embed.vidrift.net'

const MAX_SOURCES = 12

const orionSchema = z.object({
  type: z.string().max(16).nullish(),
  url: z.string().max(4096).nullish(),
  name: z.string().max(64).nullish(),
  rungs: z.array(z.object({
    width: z.number().nullish(),
    height: z.number().nullish(),
  }).passthrough()).max(16).nullish(),
}).passthrough()
const metaSchema = z.object({
  unreleased: z.boolean().nullish(),
  orionStreams: z.unknown().optional(),
  evionUrl: z.string().max(4096).nullish(),
}).passthrough()
const bootSchema = z.object({ meta: metaSchema }).passthrough()

/** The boot payload varies per request: lanes arrive as an array or as a
 *  keyed object. Malformed lanes drop individually, never the title. */
function orionLanes(value: unknown): Array<z.infer<typeof orionSchema>> {
  const list = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : [])
  const lanes: Array<z.infer<typeof orionSchema>> = []
  for (const item of list.slice(0, 32)) {
    const parsed = orionSchema.safeParse(item)
    if (parsed.success) lanes.push(parsed.data)
  }
  return lanes
}

function rungHeight(lane: z.infer<typeof orionSchema>): number | undefined {
  let best: number | undefined
  for (const rung of lane.rungs ?? []) {
    const height = rung.height
    if (typeof height === 'number' && Number.isFinite(height) && height >= 144 && height <= 4320 && (best === undefined || height > best)) best = height
  }
  return best
}

function isHttps(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false
  try {
    const parsed = new URL(value)
    if (parsed.username || parsed.password) return false
  } catch {
    return false
  }
  return true
}

function laneLanguage(name: string): string {
  const label = name.toLowerCase()
  if (label.includes('hindi')) return 'hi'
  if (label.includes('french')) return 'fr'
  if (label.includes('ukrainian')) return 'uk'
  if (label.includes('russian')) return 'ru'
  return 'original'
}

/** Port of the supplied Vidrift recipe: the open boot API returns Orion HLS
 *  lanes plus an optional Evion lane. Orion masters require the provider
 *  player Origin on the measured gated route; Direct cannot supply that
 *  hint, and relay acceptance still requires the complete media graph.
 *  The optional Evion lane requires its own delivery check. Orion lanes are
 *  HEVC-only; the player fails over where the codec is unsupported. Chunk
 *  URLs rotate per boot, so resolution always happens at request time. */
export function createVidriftProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidrift', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const tmdbId = String(ref.id).trim()
    if (!tmdbId) throw new ProviderFailure('empty')
    const url = ref.kind === 'series'
      ? `${BOOT}/tv/${encodeURIComponent(tmdbId)}/${ref.season}/${ref.episode}?shell=1`
      : `${BOOT}/movie/${encodeURIComponent(tmdbId)}?shell=1`
    let response
    try {
      response = await http(url, { 'user-agent': userAgent, accept: 'application/json, text/plain, */*' }, signal)
    } catch {
      throw new ProviderFailure('unavailable')
    }
    if (response.status === 404) throw new ProviderFailure('empty')
    if (response.status === 451) throw new ProviderFailure('empty')
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
    let body: unknown
    try {
      body = JSON.parse(response.text) as unknown
    } catch {
      throw new ProviderFailure('malformed')
    }
    const parsed = bootSchema.safeParse(body)
    if (!parsed.success || !parsed.data.meta) throw new ProviderFailure('malformed')
    const meta = parsed.data.meta
    if (meta.unreleased) throw new ProviderFailure('empty')
    const sources: ProviderSource[] = []
    for (const lane of orionLanes(meta.orionStreams)) {
      if (lane.type !== 'hls' || !lane.url) continue
      const raw = String(lane.url)
      const absolute = raw.startsWith('http') ? raw : `${MB}${raw.startsWith('/') ? '' : '/'}${raw}`
      if (!isHttps(absolute)) continue
      let expiresAt: string
      try {
        expiresAt = accessDeadline(absolute, now())
      } catch {
        continue
      }
      const height = rungHeight(lane)
      sources.push({
        key: `vidrift:orion:${sources.length}`,
        url: absolute,
        type: 'hls',
        headers: { origin: ORIGIN },
        expiresAt,
        language: laneLanguage(lane.name ?? ''),
        qualityHint: height === undefined ? 'Auto' : `${height}p`,
        ...(height === undefined ? {} : { height }),
        subtitles: [],
      })
      if (sources.length >= MAX_SOURCES) break
    }
    if (typeof meta.evionUrl === 'string' && isHttps(meta.evionUrl) && sources.length < MAX_SOURCES) {
      let expiresAt: string
      try {
        expiresAt = accessDeadline(meta.evionUrl, now())
      } catch {
        expiresAt = ''
      }
      if (expiresAt) {
        sources.push({
          key: `vidrift:evion:${sources.length}`,
          url: meta.evionUrl,
          type: 'hls',
          headers: {},
          expiresAt,
          language: 'original',
          qualityHint: 'Auto',
          subtitles: [],
        })
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
