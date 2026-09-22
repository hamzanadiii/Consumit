import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const siteOrigin = 'https://vidcore.org'
const streamripKey = 'streamrip_secret_2026'

// Port of the PROVE VidCore recipe: multi-server aggregator calling the same
// upstream source APIs as their player. Lease-wrapped proxy URLs are never
// used — only direct https media crosses into playback (browser-direct rule).
// Relay/embed/iframe shapes and unplayable containers are dropped, not
// proxied. Every job is individually bounded so dead servers degrade instead
// of holding healthy answers hostage past the attempt budget.
const JOB_TIMEOUT_MS = 3000

const rawSourceSchema = z.object({
  url: z.string().max(4096).optional(),
  quality: z.string().max(64).optional(),
  label: z.string().max(64).optional(),
  type: z.string().max(16).optional(),
  language: z.string().max(32).optional(),
  headers: z.record(z.string(), z.string()).optional(),
}).passthrough()

const providersPayloadSchema = z.object({
  providers: z.array(z.object({
    name: z.string().max(64).optional(),
    sources: z.array(rawSourceSchema).max(64).optional(),
  }).passthrough()).max(32).optional(),
}).passthrough()

type Job = { server: string; url: string; kind: 'json-sources' | 'json-providers' | 'sse' }

function jobsFor(tmdbId: string, isTv: boolean, season: number, episode: number): Job[] {
  const tvQuery = isTv ? `&type=tv&season=${season}&episode=${episode}` : '&type=movie'
  const tvPath = isTv ? `/tv/${tmdbId}/${season}/${episode}` : `/movie/${tmdbId}`
  const vidrackKeys = ['1embed', 'cinextream', 'movy', 'overlook', 'vaplayer', 'vidnest', 'viduki']
  return [
    { server: 'Pacific', url: `https://vidrack.created.app/api/sources/cineplay?id=${tmdbId}${tvQuery}`, kind: 'json-sources' },
    { server: 'Orion', url: `https://hahaevilcraft.site/api/search/stream?q=${tmdbId}${tvQuery}`, kind: 'sse' },
    { server: 'Nova', url: `https://movie.streamrip.fun/api/source/${tmdbId}?api_key=${streamripKey}&apikey=${streamripKey}`, kind: 'json-sources' },
    { server: 'Armor', url: `https://vidrack.created.app/api/sources/vidrift?id=${tmdbId}${tvQuery}`, kind: 'json-sources' },
    { server: 'Tiki', url: `https://streamguide.cfd/Perses${tvPath}`, kind: 'json-providers' },
    ...vidrackKeys.map((key): Job => ({ server: key, url: `https://vidrack.created.app/api/sources/${key}?id=${tmdbId}${tvQuery}`, kind: 'json-sources' })),
  ]
}

function parseSSEFrames(text: string, server: string): Array<Record<string, unknown> & { _server: string }> {
  const out: Array<Record<string, unknown> & { _server: string }> = []
  for (const line of text.split('\n')) {
    const index = line.indexOf('data:')
    if (index === -1) continue
    const payload = line.slice(index + 5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const json = JSON.parse(payload) as Record<string, unknown>
      const list = json['streams'] ?? json['sources'] ?? (json['url'] ? [json] : [])
      if (!Array.isArray(list)) continue
      for (const item of list) {
        if (item && typeof item === 'object') out.push({ ...(item as Record<string, unknown>), _server: server })
      }
    } catch {
      // ignore malformed frames
    }
  }
  return out
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('VidCore server timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function classifyType(rawUrl: string): ProviderSource['type'] | null {
  if (/\.(mkv|avi|mov|wmv|flv|webm)(\?|#|$)/i.test(rawUrl)) return null
  return mediaType(rawUrl) ?? 'hls'
}

const RELAY_RE = /proxy|relay|\bembed\b|\biframe\b|\.html?(?:[?#]|$)/i

function isDirectCandidate(rawUrl: string): boolean {
  if (!/^https:\/\//i.test(rawUrl) || rawUrl.length > 4096) return false
  if (RELAY_RE.test(rawUrl)) return false
  try {
    const parsed = new URL(rawUrl)
    if (parsed.username || parsed.password) return false
    for (const value of parsed.searchParams.values()) {
      if (/https?%3A|https?:\/\//i.test(value)) return false
    }
  } catch {
    return false
  }
  return true
}

export type VidcoreScope = { id?: string; servers?: string[] }

export function createVidcoreProvider(http: ProviderHttp, now = Date.now, scope: VidcoreScope = {}) {
  const { id = 'vidcore', servers } = scope
  const wanted = servers?.map((s) => s.toLowerCase())
  return Object.assign(adapter('vidcore', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const tmdbId = String(ref.id)
    const season = ref.season ?? 1
    const episode = ref.episode ?? 1

    const jobs = jobsFor(tmdbId, isTv, season, episode)
      .filter((job) => !wanted || wanted.includes(job.server.toLowerCase()))
    const settled: Array<Array<Record<string, unknown> & { _server: string }>> = await Promise.all(jobs.map(async (job): Promise<Array<Record<string, unknown> & { _server: string }>> => {
      const op = bounded(signal, JOB_TIMEOUT_MS)
      try {
        const response = await document(http, job.url, op.signal, {
          'user-agent': userAgent,
          accept: '*/*',
          referer: `${siteOrigin}/`,
        })
        if (job.kind === 'sse') return parseSSEFrames(response.text, job.server)
        const body: unknown = JSON.parse(response.text)
        if (job.kind === 'json-providers') {
          const parsed = providersPayloadSchema.parse(body)
          const out: Array<Record<string, unknown> & { _server: string }> = []
          for (const provider of parsed.providers ?? []) {
            for (const source of provider.sources ?? []) out.push({ ...source, _server: `${job.server}/${provider.name ?? ''}` })
          }
          return out
        }
        const data = body as { sources?: unknown; data?: { sources?: unknown } }
        const list = data.sources ?? data.data?.sources
        if (!Array.isArray(list)) return []
        return list.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({ ...item, _server: job.server }))
      } catch {
        return []
      } finally {
        op.cleanup()
      }
    }))

    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const list of settled) {
      for (const item of list) {
        const url = typeof item['url'] === 'string' ? item.url : ''
        if (!url || seen.has(url) || !isDirectCandidate(url)) continue
        const type = classifyType(url)
        if (!type) continue
        seen.add(url)
        const quality = String(item['quality'] ?? item['label'] ?? 'auto').slice(0, 24)
        let expiresAt: string
        try {
          expiresAt = accessDeadline(url, now())
        } catch {
          continue
        }
        sources.push({
          key: `vidcore:${String(item['_server'] ?? 'mov').toLowerCase().replace(/[^a-z0-9-]+/g, '').slice(0, 32) || 'mov'}:${sources.length}`,
          url,
          type,
          qualityHint: quality || 'Auto',
          expiresAt,
          language: typeof item['language'] === 'string' && item['language'] ? item['language'].slice(0, 32) : 'original',
          headers: { referer: `${siteOrigin}/` },
          subtitles: [],
        })
        if (sources.length >= 12) break
      }
      if (sources.length >= 12) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  }), { id })
}
