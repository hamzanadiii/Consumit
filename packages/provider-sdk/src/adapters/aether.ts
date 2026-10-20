import { z } from 'zod'
import { allowedMediaUrl, isRelayMediaUrl, type ProviderSource } from '../index.ts'
import { adapter, document, mediaType, ProviderFailure, sourceAccess, userAgent, type ProviderHttp } from './http.ts'

// Port of PROVE/providers/aether/aether.ts: movie-web/P-Stream fork resolving
// through its LUL backup API. Flow (2026-10-17):
//   GET https://lul.aether.cx/movie/{tmdbId}   (Referer/Origin aether.ist;
//     bare fetch is Cloudflare 403) -> {"stream":"https://cflul.bw1.workers.dev/vid/<token>"}
//   GET that worker -> 302 Location: https://<cdn>.tnmr.org/hls2/.../master.m3u8?t=<hmac>&s=<ts>&e=28800&...
//   TV: GET https://lul.aether.cx/tv/{tmdbId}/{season}/{episode} (same shape).
// Catalog gate: unknown ids -> 404 {"error":"No LUL backup found"} — a real
// gate, unlike Cinecat's titleless fallback.
// The worker hop is a 302 the DNS-pinned transport follows automatically
// (up to 3 redirects), settling on the final tnmr master URL; the adapter
// asserts the settled host is a reviewed tnmr media host before shipping.
// Delivery: relay — tnmr binds each signed master to the UA that followed
// the worker 302 (verified 2026-10-19: matching Chrome/150 fetches return
// 200 + ACAO:*; any other UA is 403). A browser's own UA can never match
// the adapter's, so browser-direct is impossible; the roster row pins
// deliveryMode: 'relay' and the adapter ships the reviewed aether-v1
// recipe so the relay replays the exact adapter UA on every hop.
// Expiry: tnmr signs `e=28800` (8h) but sourceAccess only reads
// expire/expires/exp, so the deadline is estimated (conservative).
// Subtitles: same sub.vdrk.site lists the site's own player hits.
const apiOrigin = 'https://lul.aether.cx'
const subsOrigin = 'https://sub.vdrk.site'
const clientOrigin = 'https://aether.ist'
const apiHeaders = { referer: `${clientOrigin}/`, origin: clientOrigin, accept: 'application/json' }

const streamSchema = z.object({
  stream: z.string().max(4096).optional(),
}).passthrough()

const vdrkSubsSchema = z.array(z.object({
  file: z.string().max(4096).optional(),
  label: z.string().max(128).optional(),
}).passthrough())

/** Any subdomain of tnmr.org or cdn-tnmr.org (the numeric prefix rotates). */
const tnmrHost = /^(?:[a-z0-9-]+\.)+(?:cdn-)?tnmr\.org$/i

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Aether step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createAetherProvider(http: ProviderHttp, now = Date.now) {
  return adapter('aether', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')
    const apiPath = isTv ? `tv/${ref.id}/${ref.season}/${ref.episode}` : `movie/${ref.id}`

    const apiOp = bounded(signal, 8000)
    let workerUrl: string
    try {
      const res = await document(http, `${apiOrigin}/${apiPath}`, apiOp.signal, apiHeaders)
      const data = streamSchema.parse(JSON.parse(res.text))
      const raw = String(data.stream ?? '')
      if (!/^https?:\/\//i.test(raw)) throw new ProviderFailure('empty')
      workerUrl = raw
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('unavailable')
    } finally {
      apiOp.cleanup()
    }

    // The transport follows the worker's 302 automatically and settles
    // response.url on the final tnmr master; the body is already the playlist.
    const hopOp = bounded(signal, 8000)
    let settledUrl: string
    try {
      const hop = await document(http, workerUrl, hopOp.signal, { referer: `${clientOrigin}/` })
      let url: URL
      try {
        url = new URL(hop.url)
      } catch {
        throw new ProviderFailure('malformed')
      }
      // A worker-host settle means no 302 fired; that is not the reviewed
      // recipe (the signed tnmr master is the only shippable media URL).
      if (!tnmrHost.test(url.hostname) || isRelayMediaUrl(url)) {
        throw new ProviderFailure('malformed')
      }
      if (!allowedMediaUrl(url, [url.hostname.toLowerCase()])) throw new ProviderFailure('malformed')
      if (!/^\s*#EXTM3U/.test(hop.text)) throw new ProviderFailure('malformed')
      settledUrl = url.href
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('unavailable')
    } finally {
      hopOp.cleanup()
    }

    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    const vdrkOp = bounded(signal, 6000)
    try {
      const vdrkUrl = isTv
        ? `${subsOrigin}/v1/tv/${ref.id}/${ref.season}/${ref.episode}`
        : `${subsOrigin}/v1/movie/${ref.id}`
      const vdrkRes = await document(http, vdrkUrl, vdrkOp.signal, apiHeaders)
      for (const track of vdrkSubsSchema.parse(JSON.parse(vdrkRes.text))) {
        const file = String(track.file ?? '')
        if (!file.startsWith('https://') || seenSubs.has(file) || subtitles.length >= 20) continue
        seenSubs.add(file)
        const name = String(track.label ?? 'Unknown').slice(0, 64)
        subtitles.push({ id: `aether-sub-${subtitles.length}`, label: name, language: name.slice(0, 32), url: file, format: /\.srt/i.test(file) ? 'srt' : 'vtt' })
      }
    } catch {
      // Tracks are best-effort; resolved media stands alone.
    } finally {
      vdrkOp.cleanup()
    }

      const access = sourceAccess(settledUrl, now())
    const settledHost = new URL(settledUrl).hostname.toLowerCase()
    return [{
      key: 'aether:auto:0',
      url: settledUrl,
      type: mediaType(settledUrl) ?? 'hls',
      qualityHint: 'auto',
      // `e=28800` is an 8h upstream expiry but sourceAccess does not parse it;
      // the conservative estimated deadline below is authoritative.
      ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
      expiresAt: access.expiresAt,
      language: 'original',
      // tnmr signs the master against the UA that follows the worker 302;
      // the relay must replay the exact adapter UA or the edge 403s.
      headers: { 'user-agent': userAgent },
      subtitles,
      relayRecipe: 'aether-v1',
      relayHosts: [settledHost],
    }]
  })
}
