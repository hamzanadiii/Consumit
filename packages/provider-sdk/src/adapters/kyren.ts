import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

const apiOrigin = 'https://kyren.moe/api'
const siteOrigin = 'https://kyren.moe'

// Port of the PROVE Kyren recipe: clean JSON API keyed by AniList id, no
// scraping, no crypto. Kyren exposes five servers (viper/jett/gekko race,
// kayo/neon fallback), but only neon and jett are enabled here: live probes
// return sources from those two while the others answer ok:false. Neon races
// first as the most reliable lane; jett stays sequential fallback. Scoped
// rows (kyren-neon, kyren-jett) try only their server. SUB and DUB ride the
// lang param; dub falls back to sub when the backend has no dub.
// Verified notes from PROVE: no Referer gate, CORS-open delivery. Kyren's
// upstreams rot per-title (master parses, segments 403 "Upstream returned
// 403"), so a parseable master is not proof of playback: the winning hit's
// top HLS source must serve its first segment before its sources stand.
// Deviation: PROVE waits up to 15s per server under a 25s overall budget;
// here each server gets 8s and the resolver's attempt deadline still caps
// every attempt, so slow lanes may be cut short on tight budgets.
const RACE_SERVERS = ['neon'] as const
const FALLBACK_SERVERS = ['jett'] as const

export type KyrenScope = { id?: string; servers?: string[] }
const SERVER_TIMEOUT_MS = 8000
const PROBE_TIMEOUT_MS = 8000
// Ask for the first 64 KiB, but only read a small prefix because some upstreams
// ignore Range and return the entire segment. Anything over a kilobyte proves
// the segment is live without buffering a full media response.
const PROBE_RANGE = 'bytes=0-65535'
const PROBE_MIN_BYTES = 1000
const PROBE_READ_BYTES = 16_384

const hitSchema = z.object({
  ok: z.boolean(),
  sources: z.array(z.object({
    url: z.string().max(4096),
    type: z.string().max(16).optional(),
    quality: z.string().max(32).optional(),
    language: z.string().max(32).optional(),
  }).passthrough()).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(128).optional(),
    lang: z.string().max(32).optional(),
  }).passthrough()).optional(),
})

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Kyren server timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function mapSubtitle(track: { url: string; label?: string | undefined; lang?: string | undefined }, id: string, index: number): ProviderSource['subtitles'][number] | null {
  if (!track.url.startsWith('https://')) return null
  const label = (track.label || track.lang || 'English').slice(0, 64)
  return { id: `${id}-sub-${index}`, label, language: label.slice(0, 32), url: track.url, format: 'vtt' }
}

function classifyType(rawUrl: string): ProviderSource['type'] | null {
  // Containers browsers cannot play never become sources; extensionless
  // manifests default to HLS and the verification probe drops the bad ones.
  if (/\.(mkv|avi|mov|wmv|flv|webm)(\?|#|$)/i.test(rawUrl)) return null
  return mediaType(rawUrl) ?? 'hls'
}

export function createKyrenProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now, scope: KyrenScope = {}) {
  // Scoped rows (e.g. kyren-jett) try only their own server so each Kyren
  // server gets independent regions, health, and fallback groups behind the
  // provider-adapter seam. Unknown scopes answer empty, never wide.
  const { id = 'kyren', servers } = scope
  const wanted = servers?.map((server) => server.toLowerCase())
  const raceServers = RACE_SERVERS.filter((server) => !wanted || wanted.includes(server))
  const fallbackServers = FALLBACK_SERVERS.filter((server) => !wanted || wanted.includes(server))
  /** First-segment probe on the hit's top HLS source. Guards against dead
   *  upstreams (master 200 + parseable, segments 403). The probe rides the
   *  injected bounded client like any other resolution document; a blocked
   *  destination or unserved segment fails the server closed. */
  async function segmentsServe(sources: ProviderSource[], signal: AbortSignal): Promise<boolean> {
    const top = sources.find((source) => /m3u8/i.test(source.url) || source.type === 'hls') ?? sources[0]
    if (!top || !/^https:\/\//i.test(top.url)) return false
    const probe = async (url: string, headers: Record<string, string>, readPrefixBytes?: number): Promise<string | null> => {
      const op = bounded(signal, PROBE_TIMEOUT_MS)
      try {
        const response = await http(url, { 'user-agent': userAgent, ...headers }, op.signal,
          readPrefixBytes === undefined ? undefined : { readPrefixBytes })
        if (response.status < 200 || response.status >= 300) return null
        return response.text
      } catch {
        return null
      } finally {
        op.cleanup()
      }
    }
    const master = await probe(top.url, { accept: '*/*' })
    if (!master || !master.trimStart().startsWith('#EXTM3U')) return false
    const segment = master.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('#'))
    if (!segment) return false
    let segmentUrl: string
    try {
      segmentUrl = new URL(segment, top.url).toString()
    } catch {
      return false
    }
    if (!/^https:\/\//i.test(segmentUrl)) return false
    const body = await probe(segmentUrl, { range: PROBE_RANGE }, PROBE_READ_BYTES)
    return body !== null && body.length > PROBE_MIN_BYTES
  }

  return Object.assign(adapter('kyren', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const lang = dub ? 'dub' : 'sub'
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }

    const tryServer = async (server: string, parentSignal = signal): Promise<ProviderSource[]> => {
      const op = bounded(parentSignal, SERVER_TIMEOUT_MS)
      try {
        const url = `${apiOrigin}/stream/${ref.id}/${ref.episode}?lang=${lang}&title=${encodeURIComponent(title)}&server=${server}`
        const response = await document(http, url, op.signal, {
          'user-agent': userAgent,
          accept: 'application/json',
          referer: `${siteOrigin}/`,
        })
        const data = hitSchema.parse(JSON.parse(response.text))
        if (!data.ok) return []
        const subtitles = (data.subtitles ?? [])
          .map((subtitle, index) => mapSubtitle(subtitle, 'kyren', index))
          .filter((subtitle): subtitle is NonNullable<typeof subtitle> => subtitle !== null)
          .slice(0, 20)
        const sources: ProviderSource[] = []
        for (const [index, item] of (data.sources ?? []).entries()) {
          if (!item.url.startsWith('https://') || sources.length >= 3) continue
          const type = classifyType(item.url)
          if (!type) continue
          let expiresAt: string
          try {
            expiresAt = accessDeadline(item.url, now())
          } catch {
            continue
          }
          sources.push({
            key: `kyren:${server}:${lang}:${ref.episode}:${index}`,
            url: item.url,
            type,
            headers: { referer: `${siteOrigin}/` },
            expiresAt,
            language: dub ? 'en' : 'original',
            qualityHint: (item.quality || 'auto').slice(0, 24),
            subtitles,
          })
        }
        return sources
      } catch {
        return []
      } finally {
        op.cleanup()
      }
    }

    const raceControllers = raceServers.map(() => new AbortController())
    const abortRaces = () => raceControllers.forEach((controller) => controller.abort(signal.reason))
    signal.addEventListener('abort', abortRaces, { once: true })
    if (signal.aborted) abortRaces()
    try {
      const raced = raceServers.map((server, index) => tryServer(server, raceControllers[index]!.signal))
      for (const pending of raced) {
        const sources = await pending
        if (!sources.length) continue
        signal.throwIfAborted()
        if (await segmentsServe(sources, signal)) return sources.slice(0, 3)
      }
    } finally {
      signal.removeEventListener('abort', abortRaces)
      raceControllers.forEach((controller) => controller.abort())
    }
    for (const server of fallbackServers) {
      if (signal.aborted) throw new ProviderFailure('empty')
      const sources = await tryServer(server)
      if (!sources.length) continue
      signal.throwIfAborted()
      if (await segmentsServe(sources, signal)) return sources.slice(0, 3)
    }
    throw new ProviderFailure('empty')
  }), { id })
}
