import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const embedOrigin = 'https://anixo.buzz'

// Port of the PROVE Anixo recipe: server-rendered embed pages keyed by
// AniList id carry window.__INITIAL_STREAM__ with a primary m3u8, fallback
// streams, VTT subtitles, and intro/outro marks. SUB and DUB ride the track
// query param; three servers (Sora/Cat/Zexy) race with first success winning.
// No page scripts run; episode identity stays canonical (AniList number).
const SERVERS = [
  { id: 1, label: 'Sora' },
  { id: 2, label: 'Cat' },
  { id: 3, label: 'Zexy' },
] as const

const SERVER_TIMEOUT_MS = 3500

const streamDataSchema = z.object({
  success: z.boolean(),
  streamUrl: z.string().max(4096),
  fallbackStreams: z.array(z.string().max(4096)).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(128).optional(),
  }).passthrough()).optional(),
})

export type AnimeTitleResolver = (anilistId: number, signal: AbortSignal) => Promise<string>

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Anixo server timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function extractStreamData(html: string): z.infer<typeof streamDataSchema> | null {
  const match = html.match(/window\.__INITIAL_STREAM__\s*=\s*(\{[\s\S]*?\});\s*(?:\(async|<)/)
  if (!match?.[1]) return null
  try {
    const parsed = streamDataSchema.safeParse(JSON.parse(match[1]))
    return parsed.success && parsed.data.success && parsed.data.streamUrl ? parsed.data : null
  } catch {
    return null
  }
}

function mapSubtitle(track: { url: string; label?: string | undefined }, id: string, index: number): ProviderSource['subtitles'][number] | null {
  if (!track.url.startsWith('https://')) return null
  const label = (track.label || 'English').slice(0, 64)
  return { id: `${id}-sub-${index}`, label, language: label.slice(0, 32), url: track.url, format: 'vtt' }
}

function classifyType(rawUrl: string): ProviderSource['type'] | null {
  if (/\.(mkv|avi|mov|wmv|flv|webm)(\?|#|$)/i.test(rawUrl)) return null
  return mediaType(rawUrl) ?? 'hls'
}

export function createAnixoProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now) {
  return adapter('anixo', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    // Audio convention: explicit English requests dub, everything else (ja,
    // unset, member default) plays the original with subtitles.
    const dub = input.audioLanguage === 'en'
    const track = dub ? 'dub' : 'sub'
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')

    const fetchServer = async (server: (typeof SERVERS)[number]): Promise<ProviderSource[]> => {
      const op = bounded(signal, SERVER_TIMEOUT_MS)
      try {
        const url = `${embedOrigin}/embed/ani/${ref.id}/${ref.episode}?track=${track}&server=${server.id}`
        const page = await document(http, url, op.signal, {
          'user-agent': userAgent,
          accept: 'text/html,*/*',
          referer: `${embedOrigin}/`,
        })
        const stream = extractStreamData(page.text)
        if (!stream) return []
        const sources: ProviderSource[] = []
        const push = (rawUrl: string, key: string) => {
          if (!rawUrl.startsWith('https://') || sources.length >= 3) return
          const type = classifyType(rawUrl)
          if (!type) return
          let expiresAt: string
          try {
            expiresAt = accessDeadline(rawUrl, now())
          } catch {
            return
          }
          sources.push({
            key, url: rawUrl, type,
            headers: { referer: `${embedOrigin}/` },
            expiresAt,
            language: dub ? 'en' : 'original',
            qualityHint: 'Auto',
            subtitles: [],
          })
        }
        push(stream.streamUrl, `anixo:${server.label.toLowerCase()}:${track}:${ref.episode}`)
        for (const fallback of (stream.fallbackStreams ?? []).slice(0, 2)) {
          push(fallback, `anixo:fallback:${track}:${ref.episode}:${sources.length}`)
        }
        const subtitles = (stream.subtitles ?? [])
          .map((subtitle, index) => mapSubtitle(subtitle, 'anixo', index))
          .filter((subtitle): subtitle is NonNullable<typeof subtitle> => subtitle !== null)
          .slice(0, 20)
        return sources.map((source) => ({ ...source, subtitles }))
      } catch {
        return []
      } finally {
        op.cleanup()
      }
    }

    const settled = await Promise.all(SERVERS.map((server) => fetchServer(server)))
    for (const sources of settled) {
      if (sources.length) return sources
    }
    throw new ProviderFailure('empty')
  })
}
