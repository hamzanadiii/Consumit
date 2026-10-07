import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { sourceAccess, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://scrapper.rivestream.app'
const defaultReferer = 'https://nextgencloudfabric.com/'
// Sub-provider map (languages as codes so resolve-time audio matching
// works): citadel serves English, hindicast Hindi, apex/solstice multi-audio
// (English-first with in-player track choice), quasar French, vanguard/aura
// valhalla HLS (PROVE live roster 2026-09-22), the rest Original. Citadel
// leads: proven English workhorse, deterministic order.
const SUB_PROVIDERS = [
  { id: 'citadel', lang: 'en' },
  { id: 'apex', lang: 'en' },
  { id: 'vanguard', lang: 'original' },
  { id: 'aura', lang: 'original' },
  { id: 'apogee', lang: 'original' },
  { id: 'rigel', lang: 'original' },
  { id: 'hindicast', lang: 'hi' },
  { id: 'solstice', lang: 'en' },
  { id: 'quasar', lang: 'fr' },
  { id: 'flowcast', lang: 'original' },
  { id: 'pulse', lang: 'original' },
  { id: 'horizon', lang: 'original' },
  { id: 'asiacloud', lang: 'original' },
  { id: 'guru', lang: 'original' },
] as const
// One sick sub-provider must not hold a healthy one hostage: the resolver
// caps every attempt at 5s, so each sub-provider gets its own tighter
// deadline and degrades to "no data" instead of stalling the attempt.
const SUB_PROVIDER_TIMEOUT_MS = 3500

const captionSchema = z.object({
  file: z.string().max(4096),
  label: z.string().max(64).optional(),
  language: z.string().max(32).optional(),
  type: z.string().max(16).optional(),
})

const sourceEntrySchema = z.object({
  url: z.string().max(4096),
  quality: z.string().max(64).optional(),
  // Upstream delivery hint (hls/mp4). Some subs (aura) serve extensionless
  // proxied URLs (/content?v=...) that only classify via this hint —
  // PROVE reads the same field, so a missing hint keeps URL classification.
  format: z.string().max(16).optional(),
})

const responseSchema = z.object({
  data: z.object({
    sources: z.array(sourceEntrySchema).max(64).optional(),
    captions: z.array(captionSchema).max(64).optional(),
  }).optional(),
})

function parseQualityAndLang(q?: string): { height?: number; qualityHint?: string; language?: string } {  if (!q) return {}
  let qualityHint: string | undefined
  let language: string | undefined

  if (q.includes('|')) {
    const parts = q.split('|').map((p) => p.trim())
    qualityHint = parts[0]
    language = parts[1]
  } else {
    qualityHint = q
  }

  const match = qualityHint?.match(/(\d{3,4})p?/i)
  const heightText = match?.[1]
  const height = heightText ? Number.parseInt(heightText, 10) : undefined
  if (height) qualityHint = `${height}p`

  return {
    ...(height !== undefined ? { height } : {}),
    ...(qualityHint !== undefined ? { qualityHint } : {}),
    ...(language !== undefined ? { language } : {}),
  }
}

// Language codes so resolve-time audio matching works: full names from
// quality strings ('720p | English') collapse to the same codes as the
// sub-provider defaults.
function normalizeLang(value: string): string {
  const lower = value.toLowerCase()
  if (lower === 'english' || lower === 'eng') return 'en'
  if (lower === 'hindi' || lower === 'hin') return 'hi'
  if (lower === 'tamil' || lower === 'tam') return 'ta'
  if (lower === 'telugu' || lower === 'tel') return 'te'
  if (lower === 'french' || lower === 'fre' || lower === 'fra') return 'fr'
  return lower
}

/** Hostnames known to serve proxy-wrapped media instead of direct bytes.
 *  Mirrors the reviewed relay wrapper set: the inner `url` target still
 *  passes the full media allowlist before any source crosses into playback. */
const PROXY_WRAPPER_HOSTS = new Set(['proxy.valhallastream.com', 'valhallastream.dpdns.org'])

function unwrapProxy(rawUrl: string): { url: string; headers: Record<string, string> } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { url: rawUrl, headers: {} }
  }

  // Wrappers bury the media URL in `?url=` behind either a proxy pathname
  // (/proxy/…) or a proxy hostname (proxy.valhallastream.com/m3u8?...).
  // Apogee currently serves the latter; without unwrapping, direct rows
  // reject the wrapper as relay-shaped and separate-audio discovery starves.
  const host = parsed.hostname.toLowerCase()
  if (parsed.pathname.includes('proxy') || /(^|\.)proxy\./.test(host) || PROXY_WRAPPER_HOSTS.has(host)) {
    const innerUrl = parsed.searchParams.get('url')
    if (innerUrl) {
      const headersParam = parsed.searchParams.get('headers')
      if (headersParam) {
        try {
          const rawHeaders = JSON.parse(headersParam) as Record<string, string>
          const sanitized: Record<string, string> = {}
          for (const [k, v] of Object.entries(rawHeaders)) {
            if (k.toLowerCase() === 'referer') {
              sanitized.referer = v
            }
          }
          return { url: innerUrl, headers: sanitized }
        } catch {
          return { url: innerUrl, headers: {} }
        }
      }
      return { url: innerUrl, headers: { referer: defaultReferer } }
    }
  }

  return { url: rawUrl, headers: {} }
}

export type RivestreamScope = { id?: string; subs?: string[]; kinds?: readonly ['movie' | 'series'] | undefined; relay?: boolean }

export function createRivestreamProvider(http: ProviderHttp, now = Date.now, scope: RivestreamScope = {}) {
  const { id = 'rivestream', subs, kinds } = scope
  const wanted = subs?.map((sub) => sub.toLowerCase())
  return Object.assign(adapter('rivestream', async (input, signal) => {
    const { ref } = input
    // Movies + series only: an anime ref must never resolve by numeric-id
    // coincidence (AniList ids are not TMDB ids). Scoped rows can narrow
    // further through kinds: reject before any upstream work.
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    if (kinds && !(kinds as readonly string[]).includes(ref.kind)) throw new ProviderFailure('empty')
    const isTv = ref.kind === 'series'
    const qBase = isTv ? `id=${ref.id}&season=${ref.season}&episode=${ref.episode}` : `id=${ref.id}`

    const results = await Promise.all(
      // Apogee is selected through its own configured row, which owns the
      // video/audio role. Keep it out of the combined Rivestream roster.
      [...SUB_PROVIDERS, ...(scope.relay ? [{ id: 'nebula', lang: 'original' }, { id: 'zephyr', lang: 'original' }] : [])].filter((sub) => (!wanted || wanted.includes(sub.id)) && (sub.id !== 'apogee' || wanted?.includes('apogee'))).map(async (sub) => {
        const url = `${apiOrigin}/api/provider?provider=${sub.id}&${qBase}`
        const controller = new AbortController()
        if (signal.aborted) controller.abort(signal.reason)
        const onAbort = () => controller.abort(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        const timer = setTimeout(() => controller.abort(new DOMException('Sub-provider timed out', 'TimeoutError')), scope.relay ? 10_000 : SUB_PROVIDER_TIMEOUT_MS)
        try {
          const res = await document(http, url, controller.signal)
          const data = responseSchema.parse(JSON.parse(res.text))
          return { provider: sub.id, lang: sub.lang, data: data.data }
        } catch {
          return { provider: sub.id, lang: sub.lang, data: undefined }
        } finally {
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
        }
      }),
    )

    const allSources: ProviderSource[] = []
    const seen = new Set<string>()

    for (const { provider, lang: subLang, data } of results) {
      if (!data?.sources) continue

      const subtitles = (data.captions || []).map((c, idx) => ({
        id: `rivestream-sub-${idx}`,
        label: c.label || c.language || `Subtitle ${idx + 1}`,
        language: (c.language || c.label || 'und').toLowerCase().slice(0, 10),
        url: c.file,
        format: (c.type || (c.file.endsWith('.srt') ? 'srt' : 'vtt')) as 'vtt' | 'srt',
      }))

      for (let idx = 0; idx < data.sources.length; idx++) {
        const entry = data.sources[idx]
        if (!entry || !entry.url || seen.has(entry.url)) continue

        const { url, headers } = unwrapProxy(entry.url)
        // New relay rows preserve only noncredential playback hints from
        // the reviewed wrapper, including the Origin required by Nebula.
        if (scope.relay) {
          try {
            const wrapper = new URL(entry.url)
            if (['proxy.valhallastream.com', 'valhallastream.dpdns.org'].includes(wrapper.hostname)) {
              const hints: unknown = JSON.parse(wrapper.searchParams.get('headers') ?? '{}')
              if (hints && typeof hints === 'object' && !Array.isArray(hints)) {
                for (const [name, value] of Object.entries(hints)) {
                  if (/^(referer|origin|user-agent|accept)$/i.test(name) && typeof value === 'string' && value.length <= 512 && !/[\r\n]/.test(value)) headers[name.toLowerCase()] = value
                }
              }
            }
          } catch { /* Existing validated hint remains available. */ }
        }
        const type = mediaType(url, entry.format?.toLowerCase()) ?? mediaType(url)
        if (!type) continue
        seen.add(entry.url)

        const { height, qualityHint, language } = parseQualityAndLang(scope.relay && /4k/i.test(entry.quality ?? '') ? '2160p' : entry.quality)
        const lang = normalizeLang(language || subLang)
        const qTag = qualityHint ? qualityHint.toLowerCase() : 'auto'
        let access: ReturnType<typeof sourceAccess>
        try {
          access = sourceAccess(url, now())
        } catch {
          continue
        }

        allSources.push({
          key: `${provider}:${qTag}:${idx}`,
          url,
          type,
          ...access,
          language: lang,
          headers,
          subtitles,
          ...(height ? { height } : {}),
          ...(wanted?.length === 1 && wanted[0] === 'citadel' ? { qualityGroup: 'citadel' } : {}),
          ...(qualityHint ? { qualityHint } : {}),
        })
      }
    }

    if (!allSources.length) throw new ProviderFailure('empty')

    // Prefer the requested audio first, then Original, then everything else.
    // Stable otherwise, so provider order breaks ties deterministically.
    const audioWanted = input.audioLanguage.toLowerCase()
    allSources.sort((a, b) => {
      const score = (language: string) =>
        language.toLowerCase() === audioWanted ? 0 : language.toLowerCase() === 'original' ? 1 : 2
      return score(a.language) - score(b.language)
    })

    return allSources
  }), { id, ...(wanted?.length === 1 && wanted[0] === 'apogee' ? { separateAudio: { label: 'Apogee' } } : {}) })
}
