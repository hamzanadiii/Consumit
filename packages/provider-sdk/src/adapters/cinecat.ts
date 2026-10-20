import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { adapter, document, mediaType, ProviderFailure, sourceAccess, type ProviderHttp } from './http.ts'
import { invalidateCinecatSession, signCinecatRequest } from './cinecat-gate.ts'

// Port of PROVE/providers/cinecat/cinecat.ts: cdn.hls.lol content API behind
// the x-az anti-bot gate, implemented natively in cinecat-gate.ts (the
// atlantic.st-vendored aphrodite-gate.ts speaks a retired challenge dialect
// and is rejected with 403). The gate session is cached for its 30-minute
// lifetime and dropped whenever a signed content answer comes back 401/403.
// Catalog guard: unknown tmdb ids return found:true with a fallback stream
// but NO title, so require title on both movie and TV responses. The
// cdn.hls.lol lane also serves a static 64-second decoy sample to untagged
// requests, so enforce the same >= 600s duration floor Aphrodite uses (real
// titles run past 10 minutes).
// Delivery: relay + proxyOnly — totallyacdn variant/segment/key legs answer an
// HTML interstitial to any Referer but cinecat.eu, so the browser can never
// fetch them direct; the roster row pins deliveryMode: 'relay'.
// Subtitles: sub.vdrk.site/v1/movie/{tmdb} and /v1/tv/{tmdb}/{s}/{e} ->
//   [{ label, file: *.vtt }] (same endpoints the site's own player hits).
const apiOrigin = 'https://cdn.hls.lol'
const subsOrigin = 'https://sub.vdrk.site'
const clientReferer = 'https://cinecat.eu/'
const MIN_TITLE_SECONDS = 600

const contentSchema = z.object({
  found: z.boolean().optional(),
  title: z.string().max(300).optional(),
  type: z.string().max(32).optional(),
  url: z.string().max(4096).optional(),
}).passthrough()

const vdrkSubsSchema = z.array(z.object({
  file: z.string().max(4096).optional(),
  label: z.string().max(128).optional(),
}).passthrough())

export type CinecatSign = {
  sign: (base: string, path: string) => Promise<Record<string, string>>
  clear: () => void
}

const gateSign: CinecatSign = {
  sign: (base, path) => signCinecatRequest(base, path),
  clear: () => { invalidateCinecatSession() },
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Cinecat step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

/** Validated HLS body, or null when the answer is not a playlist. */
async function readPlaylist(http: ProviderHttp, url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await document(http, url, signal, { referer: clientReferer })
    const text = res.text
    if (!/^\s*#EXTM3U/.test(text) || !/#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE):/.test(text)) return null
    return text
  } catch {
    return null
  }
}

/** First variant reference of a master playlist, resolved against it. */
function firstVariant(text: string, base: string): string | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]!.startsWith('#EXT-X-STREAM-INF')) continue
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]!
      if (line.startsWith('#')) continue
      try {
        return new URL(line, base).toString()
      } catch {
        return null
      }
    }
    return null
  }
  return null
}

/** Total VOD seconds behind an already-read playlist (0 on any failure). */
async function playlistDurationSeconds(http: ProviderHttp, url: string, text: string, signal: AbortSignal): Promise<number> {
  const variant = firstVariant(text, url)
  const body = variant ? await readPlaylist(http, variant, signal) : text
  if (!body) return 0
  let total = 0
  for (const match of body.matchAll(/#EXTINF:([\d.]+)/g)) {
    total += Number.parseFloat(match[1] ?? '0')
  }
  return total
}

export function createCinecatProvider(http: ProviderHttp, now = Date.now, options: { sign?: CinecatSign } = {}) {
  const signer = options.sign ?? gateSign

  async function signedGet(path: string, signal: AbortSignal): Promise<{ status: number; text: string } | null> {
    const attempt = async (): Promise<{ status: number; text: string } | null> => {
      let headers: Record<string, string>
      try {
        headers = await signer.sign(apiOrigin, path)
      } catch {
        return null
      }
      try {
        signal.throwIfAborted()
        const res = await http(`${apiOrigin}${path}`, { 'user-agent': 'Mozilla/5.0', accept: 'application/json', referer: clientReferer, ...headers }, signal)
        return { status: res.status, text: res.text }
      } catch {
        return null
      }
    }
    const first = await attempt()
    if (first && (first.status === 401 || first.status === 403)) {
      try {
        signer.clear()
      } catch { /* session reset is best-effort */ }
      return attempt()
    }
    return first
  }

  return adapter('cinecat', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')
    const path = isTv ? `/content/tv/${ref.id}/${ref.season}/${ref.episode}` : `/content/movie/${ref.id}`
    const res = await signedGet(path, signal)
    if (!res) throw new ProviderFailure('unavailable')
    if (res.status === 404) throw new ProviderFailure('empty')
    if (res.status < 200 || res.status >= 300) throw new ProviderFailure('unavailable')
    const data = contentSchema.parse(JSON.parse(res.text))
    // Catalog guard: no title means the id is not in the manual catalog;
    // the url field would be a fabricated fallback stream, never the title.
    const candidate = (data.type === 'hls' ? data.url : '')?.trim() ?? ''
    if (!data.title || !/^https?:\/\//i.test(candidate)) throw new ProviderFailure('empty')
    const readOp = bounded(signal, 6000)
    let streamText: string | null
    let duration: number
    try {
      streamText = await readPlaylist(http, candidate, readOp.signal)
      duration = streamText ? await playlistDurationSeconds(http, candidate, streamText, readOp.signal) : 0
    } finally {
      readOp.cleanup()
    }
    // Reject the decoy lane: a stale signing chunk still validates as a
    // playlist but holds a static 64-second sample, not the title.
    if (!streamText || duration < MIN_TITLE_SECONDS) throw new ProviderFailure('empty')
    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    const vdrkOp = bounded(signal, 6000)
    try {
      const vdrkUrl = isTv
        ? `${subsOrigin}/v1/tv/${ref.id}/${ref.season}/${ref.episode}`
        : `${subsOrigin}/v1/movie/${ref.id}`
      const vdrkRes = await document(http, vdrkUrl, vdrkOp.signal, { referer: clientReferer })
      for (const track of vdrkSubsSchema.parse(JSON.parse(vdrkRes.text))) {
        const file = String(track.file ?? '')
        if (!file.startsWith('https://') || seenSubs.has(file) || subtitles.length >= 20) continue
        seenSubs.add(file)
        const name = String(track.label ?? 'Unknown').slice(0, 64)
        subtitles.push({ id: `cinecat-sub-${subtitles.length}`, label: name, language: name.slice(0, 32), url: file, format: /\.srt/i.test(file) ? 'srt' : 'vtt' })
      }
    } catch {
      // Tracks are best-effort; resolved media stands alone.
    } finally {
      vdrkOp.cleanup()
    }
    const access = sourceAccess(candidate, now())
    return [{
      key: 'cinecat:auto:0',
      url: candidate,
      type: mediaType(candidate) ?? 'hls',
      qualityHint: 'auto',
      expiresAt: access.expiresAt,
      ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
      language: 'original',
      // totallyacdn variant/segment/key legs answer an HTML interstitial to
      // any Referer but cinecat.eu — pin this hint so server-side verification
      // and the Worker relay carry the cinecat Referer on every hop.
      headers: { referer: clientReferer },
      subtitles,
    }]
  })
}
