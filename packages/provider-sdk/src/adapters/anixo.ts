import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, parseSkipSegments, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const embedOrigin = 'https://anixo.buzz'

// Port of the PROVE Anixo recipe: server-rendered embed pages keyed by
// AniList id carry window.__INITIAL_STREAM__ with a primary m3u8, fallback
// streams, VTT subtitles, and intro/outro marks. SUB and DUB ride the track
// query param. Keep one stable Sora route so Anixo appears as one server in
// the member's picker.
// No page scripts run; episode identity stays canonical (AniList number).
const SERVER_ID = 1

const SERVER_TIMEOUT_MS = 3500

const streamDataSchema = z.object({
  success: z.boolean(),
  streamUrl: z.string().max(4096),
  fallbackStreams: z.array(z.string().max(4096)).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(128).optional(),
  }).passthrough()).optional(),
  skip: z.object({
    intro: z.object({ start: z.number(), end: z.number() }).optional(),
    outro: z.object({ start: z.number(), end: z.number() }).optional(),
    recap: z.object({ start: z.number(), end: z.number() }).optional(),
  }).optional(),
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

    const op = bounded(signal, SERVER_TIMEOUT_MS)
    try {
      const url = `${embedOrigin}/embed/ani/${ref.id}/${ref.episode}?track=${track}&server=${SERVER_ID}`
      const page = await document(http, url, op.signal, {
        'user-agent': userAgent,
        accept: 'text/html,*/*',
        referer: `${embedOrigin}/`,
      })
      const stream = extractStreamData(page.text)
      if (!stream) throw new ProviderFailure('empty')
      const type = classifyType(stream.streamUrl)
      if (!type) throw new ProviderFailure('empty')
      const subtitles = (stream.subtitles ?? [])
        .map((subtitle, index) => mapSubtitle(subtitle, 'anixo', index))
        .filter((subtitle): subtitle is NonNullable<typeof subtitle> => subtitle !== null)
        .slice(0, 20)
      return [{
        key: `anixo:${track}:${ref.episode}`,
        url: stream.streamUrl,
        type,
        headers: { referer: `${embedOrigin}/` },
        expiresAt: accessDeadline(stream.streamUrl, now()),
        language: dub ? 'en' : 'original',
        qualityHint: 'Auto',
        subtitles,
        skipSegments: parseSkipSegments(stream.skip),
      }]
    } finally {
      op.cleanup()
    }
  })
}
