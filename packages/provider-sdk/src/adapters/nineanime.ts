import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, parseSkipSegments, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

const siteOrigin = 'https://9anime.ms'
const vidnestApi = 'https://new.vidnest.fun'
const vidnestReferer = 'https://vidnest.fun/'

// Port of the PROVE 9Anime recipe: direct HLS through VidNest JSON APIs
// keyed by AniList id (no browser needed).
//   /aniwave_hls/{anilistId}/{ep}/{sub|dub} (echovideo CDN)
//   /hianime/anime/{anilistId}/{ep}/{sub|dub}/hd-2 (akirax CDN + soft subs)
// Both answer {data: <custom-alphabet-base64>, encrypted: true}.
// Neither CDN is browser-direct (echovideo omits CORS, akirax requires a
// Referer browsers cannot spoof), so these always ride the Worker proxy.
// Title-only lookups fall back to 9anime.ms search (best effort).
const HOP_TIMEOUT_MS = 4000
const VN_ALPHA = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/='

const vidnestEnvelopeSchema = z.object({ data: z.unknown().optional() }).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('9Anime step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function vnDecode(input: string): string {
  const map: Record<string, number> = {}
  for (let i = 0; i < VN_ALPHA.length; i++) map[VN_ALPHA[i]!] = i
  const bytes: number[] = []
  for (let i = 0; i < input.length; i += 4) {
    let quad = input.slice(i, i + 4)
    while (quad.length < 4) quad += '='
    const v = [...quad].map((c) => (map[c] === undefined ? 64 : map[c]))
    bytes.push((v[0]! << 2) | (v[1]! >> 4))
    if (v[2] !== 64) bytes.push(((v[1]! & 15) << 4) | (v[2]! >> 2))
    if (v[3] !== 64) bytes.push(((v[2]! & 3) << 6) | v[3]!)
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function titleScore(haystack: string, needle: string): number {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const a = clean(haystack)
  const b = clean(needle)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.7
  return 0
}

export function createNineAnimeProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now) {
  async function vidroute(route: 'aniwave_hls' | 'anitaku', anilistId: string, episode: number, audio: 'sub' | 'dub', signal: AbortSignal) {
    const url = route === 'aniwave_hls'
      ? `${vidnestApi}/aniwave_hls/${anilistId}/${episode}/${audio}`
      : `${vidnestApi}/hianime/anime/${anilistId}/${episode}/${audio}/hd-2`
    const op = bounded(signal, HOP_TIMEOUT_MS)
    try {
      const res = await document(http, url, op.signal, { accept: 'application/json', referer: vidnestReferer })
      let payload: unknown = null
      try {
        payload = JSON.parse(res.text)
      } catch {
        throw new ProviderFailure('malformed')
      }
      const envelope = vidnestEnvelopeSchema.parse(payload)
      let decoded: unknown = envelope.data
      if (typeof envelope.data === 'string') {
        try {
          decoded = JSON.parse(vnDecode(envelope.data))
        } catch {
          throw new ProviderFailure('malformed')
        }
      }
      const data = (decoded ?? {}) as { sources?: unknown; multiSrc?: unknown; subtitles?: unknown; tracks?: unknown; intro?: unknown; outro?: unknown }
      const skips = parseSkipSegments(data)
      const list = [...(Array.isArray(data.sources) ? data.sources : []), ...(Array.isArray(data.multiSrc) ? data.multiSrc : [])]
      const hit = list.map((entry) => entry as { url?: unknown; file?: unknown }).find((entry) => entry?.url || entry?.file)
      const streamUrl = String(hit?.url ?? hit?.file ?? '')
      if (!/^https?:\/\//.test(streamUrl)) throw new ProviderFailure('empty')
      const headers = route === 'anitaku'
        ? { referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', 'user-agent': userAgent }
        : { referer: 'https://play.echovideo.ru/', 'user-agent': userAgent }
      const subtitles: ProviderSource['subtitles'] = []
      const tracks = [...(Array.isArray(data.subtitles) ? data.subtitles : []), ...(Array.isArray(data.tracks) ? data.tracks : [])]
      for (const track of tracks) {
        const entry = track as { url?: unknown; file?: unknown; label?: unknown; lang?: unknown }
        const file = String(entry?.url ?? entry?.file ?? '')
        if (!file.startsWith('https://') || subtitles.length >= 20) continue
        if (subtitles.some((s) => s.url === file)) continue
        const label = String(entry?.label ?? entry?.lang ?? 'English').slice(0, 64)
        subtitles.push({ id: `nineanime-sub-${subtitles.length}`, label, language: label.slice(0, 32), url: file, format: /\.srt/i.test(file) ? 'srt' : 'vtt' })
      }
      return { url: streamUrl, headers, subtitles, skipSegments: skips }
    } finally {
      op.cleanup()
    }
  }

  return adapter('9anime', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const episode = ref.episode
    const audios = dub ? ['dub', 'sub'] as const : ['sub'] as const
    const sources: ProviderSource[] = []
    const subtitles: ProviderSource['subtitles'] = []
    const seen = new Set<string>()
    let audioUsed: 'sub' | 'dub' = audios[0] ?? 'sub'

    // Primary: AniList-keyed VidNest routes, Flux then Akira.
    for (const audio of audios) {
      let progressed = false
      for (const route of ['aniwave_hls', 'anitaku'] as const) {
        try {
          const stream = await vidroute(route, String(ref.id), episode, audio, signal)
          audioUsed = audio
          progressed = true
          if (!seen.has(stream.url)) {
            seen.add(stream.url)
            sources.push({
              key: `nineanime:${route}:${audio}:${sources.length}`,
              url: stream.url,
              type: 'hls',
              qualityHint: 'Auto',
              expiresAt: accessDeadline(stream.url, now()),
              language: audio === 'dub' ? 'en' : 'original',
              headers: stream.headers,
              subtitles: [],
              skipSegments: stream.skipSegments,
            })
          }
          for (const track of stream.subtitles) {
            if (!subtitles.some((s) => s.url === track.url)) subtitles.push(track)
          }
        } catch {
          if (signal.aborted) throw signal.reason
          // next route
        }
      }
      if (progressed) break
    }
    if (!sources.length) {
      // Fallback: 9anime.ms title search for the AniList id, then retry.
      let title = ''
      try {
        title = (await resolveTitle(ref.id, signal)).trim()
      } catch {
        throw new ProviderFailure('empty')
      }
      if (title) {
        const op = bounded(signal, HOP_TIMEOUT_MS)
        try {
          const res = await document(http, `${siteOrigin}/search?q=${encodeURIComponent(title)}`, op.signal, { accept: 'text/html' })
          let best: { slug: string; name: string } | null = null
          let bestScore = 0.4
          for (const m of res.text.matchAll(/href="https?:\/\/9anime\.ms\/info\/([a-z0-9-]+-online)"[^>]*title="([^"]*)"/g)) {
            const score = titleScore(m[2] ?? '', title)
            if (score > bestScore) { bestScore = score; best = { slug: m[1] ?? '', name: m[2] ?? '' } }
          }
          if (best) {
            const info = await document(http, `${siteOrigin}/info/${best.slug}-online`, op.signal, { accept: 'text/html' })
            const watchUrl = info.text.match(/href="(https?:\/\/9anime\.ms\/[a-z0-9]+-watch-[^"]*?episode-1-online)"/)?.[1]
            if (watchUrl) {
              const watch = await document(http, watchUrl, op.signal, { accept: 'text/html' })
              const pageAni = watch.text.match(/var anilistId\s*=\s*(\d+)/)?.[1]
              if (pageAni && pageAni !== String(ref.id)) {
                for (const audio of audios) {
                  for (const route of ['aniwave_hls', 'anitaku'] as const) {
                    try {
                      const stream = await vidroute(route, pageAni, episode, audio, signal)
                      audioUsed = audio
                      if (!seen.has(stream.url)) {
                        seen.add(stream.url)
                        sources.push({
                          key: `nineanime:${route}:${audio}:${sources.length}`,
                          url: stream.url,
                          type: 'hls',
                          qualityHint: 'Auto',
                          expiresAt: accessDeadline(stream.url, now()),
                          language: audio === 'dub' ? 'en' : 'original',
                          headers: stream.headers,
                          subtitles: [],
                          skipSegments: stream.skipSegments,
                        })
                      }
                      for (const track of stream.subtitles) {
                        if (!subtitles.some((s) => s.url === track.url)) subtitles.push(track)
                      }
                    } catch {
                      if (signal.aborted) throw signal.reason
                    }
                  }
                  if (sources.length) break
                }
              }
            }
          }
        } finally {
          op.cleanup()
        }
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')
    const mergedSubs = new Map<string, ProviderSource['subtitles'][number]>()
    for (const track of subtitles) if (!mergedSubs.has(track.url)) mergedSubs.set(track.url, track)
    return sources.map((source) => ({ ...source, subtitles: [...mergedSubs.values()] }))
  })
}
