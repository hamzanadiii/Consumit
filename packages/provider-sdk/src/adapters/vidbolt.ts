import { z } from 'zod'
import type { ProviderAdapter, ProviderInput, ProviderSource } from '../index.ts'
import { adapter, ProviderFailure, sourceAccess, userAgent, type ProviderHttp } from './http.ts'

const ORIGIN = 'https://vidbolt.xyz'
const API = ORIGIN + '/api/resolve'
const LANES = [undefined, 'callisto', 'quasar', 'vega'] as const
const MEDIA_HOSTS = new Set(['img.rousav.tech', 'img.animecurx.tech', 'proxy.vidbolt.xyz', 'img1.hscow.com'])
const ORIGIN_GATED_HOSTS = new Set(['img.rousav.tech', 'img.animecurx.tech', 'proxy.vidbolt.xyz'])
const LANE_LABELS: Record<string, string> = { orion: 'Orion', callisto: 'Callisto', quasar: 'Quasar', vega: 'Vega' }

const sourceSchema = z.object({
  url: z.string().min(1).max(4096),
  kind: z.enum(['hls', 'mp4']),
  quality: z.union([z.string().max(32), z.number().finite()]).optional(),
})
const responseSchema = z.object({
  stream: z.object({
    server: z.string().max(40).optional(),
    sources: z.array(sourceSchema).max(40),
  }).nullable(),
})

function safeMediaUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && MEDIA_HOSTS.has(url.hostname.toLowerCase())
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function quality(value: string | number | undefined) {
  const label = String(value ?? '').trim().slice(0, 24)
  const match = label.match(/(?:^|\D)(\d{3,4})(?:p|$)/i) ?? label.match(/^(\d{3,4})$/)
  const height = match ? Number(match[1]) : undefined
  if (height && height >= 144 && height <= 4320) return { height, qualityHint: height + 'p' }
  return { qualityHint: label || 'Auto' }
}

function buildUrl(input: ProviderInput, lane: string | undefined) {
  const params = new URLSearchParams({
    type: input.ref.kind === 'movie' ? 'movie' : 'tv',
    id: String(input.ref.id),
  })
  if (input.ref.kind === 'series') {
    if (input.ref.season === undefined || input.ref.episode === undefined) throw new ProviderFailure('empty')
    params.set('season', String(input.ref.season))
    params.set('episode', String(input.ref.episode))
  }
  if (lane) params.set('only', lane)
  return API + '?' + params.toString()
}

function makeSources(rawSources: z.infer<typeof sourceSchema>[], server: string, now: number, approvedHosts: ReadonlySet<string>): ProviderSource[] {
  const serverId = Object.hasOwn(LANE_LABELS, server) ? server : 'orion'
  const serverName = LANE_LABELS[serverId]!
  const sources: ProviderSource[] = []
  const seen = new Set<string>()

  for (const raw of rawSources) {
    const url = safeMediaUrl(raw.url)
    if (!url || !approvedHosts.has(url.hostname.toLowerCase())) continue
    const mediaQuality = quality(raw.quality)
    const key = [serverId, raw.kind, mediaQuality.qualityHint].join(':')
    const identity = [url.hostname, raw.kind, mediaQuality.qualityHint].join('|')
    if (seen.has(identity)) continue
    let access: ReturnType<typeof sourceAccess>
    try {
      access = sourceAccess(url.href, now)
    } catch {
      continue
    }
    seen.add(identity)
    sources.push({
      key: 'vidbolt:' + key + ':' + sources.length,
      serverName,
      url: url.href,
      type: raw.kind === 'hls' ? 'hls' : 'native',
      ...(mediaQuality.height ? { height: mediaQuality.height } : {}),
      qualityHint: mediaQuality.qualityHint,
      qualityGroup: 'vidbolt-' + serverId,
      ...access,
      language: 'original',
      headers: ORIGIN_GATED_HOSTS.has(url.hostname.toLowerCase()) ? { origin: ORIGIN } : {},
      subtitles: [],
    })
    if (sources.length >= 6) break
  }
  return sources
}

export function createVidboltProvider(http: ProviderHttp, now: () => number = Date.now, options: { mediaHosts?: readonly string[] } = {}): ProviderAdapter {
  const approvedHosts = options.mediaHosts ? new Set(options.mediaHosts.map(host => host.toLowerCase())) : MEDIA_HOSTS
  return adapter('vidbolt', async (input, signal) => {
    if (input.ref.kind !== 'movie' && input.ref.kind !== 'series') throw new ProviderFailure('empty')
    let successfulResponses = 0
    let failedRequests = 0

    for (const lane of LANES) {
      signal.throwIfAborted()
      try {
        const url = buildUrl(input, lane)
        const response = await http(url, { 'user-agent': userAgent, accept: 'application/json,text/plain,*/*' }, signal)
        if (response.status < 200 || response.status >= 300) {
          failedRequests++
          continue
        }
        if (response.text.length > 512 * 1024) throw new ProviderFailure('malformed')
        let decoded: unknown
        try {
          decoded = JSON.parse(response.text)
        } catch {
          throw new ProviderFailure('malformed')
        }
        const payload = responseSchema.safeParse(decoded)
        if (!payload.success) throw new ProviderFailure('malformed')
        successfulResponses++
        const stream = payload.data.stream
        if (!stream) continue
        const server = Object.hasOwn(LANE_LABELS, stream.server ?? '') ? stream.server! : lane ?? 'orion'
        const sources = makeSources(stream.sources, server, now(), approvedHosts)
        if (sources.length) return sources
      } catch (error) {
        if (signal.aborted) throw error
        if (error instanceof ProviderFailure && error.code === 'malformed') throw error
        failedRequests++
      }
    }

    if (successfulResponses === 0 && failedRequests === LANES.length) throw new ProviderFailure('unavailable')
    throw new ProviderFailure('empty')
  })
}
