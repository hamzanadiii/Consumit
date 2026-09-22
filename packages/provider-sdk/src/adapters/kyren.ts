import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

const apiOrigin = 'https://kyren.moe/api'
const siteOrigin = 'https://kyren.moe'

// Port of the PROVE Kyren recipe: clean JSON API keyed by AniList id, no
// scraping, no crypto. Fast lanes race in parallel with first success
// winning; kayo/neon stay sequential fallback. SUB and DUB ride the lang
// param; dub falls back to sub when the backend has no dub.
// Verified notes from PROVE: no Referer gate, CORS-open delivery.
const RACE_SERVERS = ['viper', 'jett', 'gekko'] as const
const FALLBACK_SERVERS = ['kayo', 'neon'] as const
const SERVER_TIMEOUT_MS = 3500

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

export function createKyrenProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now) {
  return adapter('kyren', async (input, signal) => {
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

    const tryServer = async (server: string): Promise<ProviderSource[]> => {
      const op = bounded(signal, SERVER_TIMEOUT_MS)
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

    const raced = await Promise.all(RACE_SERVERS.map((server) => tryServer(server)))
    for (const sources of raced) {
      if (sources.length) return sources.slice(0, 3)
    }
    for (const server of FALLBACK_SERVERS) {
      if (signal.aborted) throw new ProviderFailure('empty')
      const sources = await tryServer(server)
      if (sources.length) return sources.slice(0, 3)
    }
    throw new ProviderFailure('empty')
  })
}
