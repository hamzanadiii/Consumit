import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, parseSkipSegments, ProviderFailure, userAgent, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

// Port of the PROVE AnimeDex recipe (providers/anime/animedex.ts, verified
// 2026-10-16): vidnest.fun's AES-256-GCM envelope ({v:2,d,n}; key =
// sha256(n|SECRET), d = base64url iv|ct|tag) behind two parallel backends on
// new.vidnest.fun, decrypted with node:crypto. These rows are RELAY tier: both
// lanes race, anitaku (end-user reachable) is preferred, and every root is
// liveness-gated so dead manifests never become sessions. Dub falls back to
// the sub lanes; when nothing decrypts, the raw vidnest player frame returns
// as an iframe source for a future embed row (relay validation drops it).
// Verification date: 2026-10-16.

const VIDNEST = 'https://vidnest.fun'
const VIDNEST_API = 'https://new.vidnest.fun'
/** Published in the vidnest.fun player bundle; not a Consumit secret. */
const SECRET = 'F9k2mR8vL4qP7wY1zN0fG3bS6tH5jC8d_x4R7vN2mP9qL1'

const API_HEADERS: Record<string, string> = {
  'user-agent': userAgent,
  accept: 'application/json',
  origin: VIDNEST,
  referer: `${VIDNEST}/`,
}

const LANE_TIMEOUT_MS = 8000
const EMBED_TIMEOUT_MS = 8000

const LANES = [
  { id: 'anitaku', path: (alid: number, episode: number, track: string) => `/hianime/anime/${alid}/${episode}/${track}/hd-2`, headers: { origin: VIDNEST, referer: `${VIDNEST}/` } },
  { id: 'aniwave', path: (alid: number, episode: number, track: string) => `/aniwave_hls/${alid}/${episode}/${track}`, headers: { referer: 'https://play.echovideo.ru/' } },
] as const

const envelopeSchema = z.object({ v: z.literal(2), d: z.string().max(2_000_000), n: z.string().max(256) })
const payloadSchema = z.object({
  sources: z.array(z.object({
    file: z.string().max(4096).optional(),
    url: z.string().max(4096).optional(),
    type: z.string().max(16).optional(),
    quality: z.string().max(32).optional(),
  }).passthrough()).max(32).optional(),
  tracks: z.array(z.object({
    file: z.string().max(4096).optional(),
    url: z.string().max(4096).optional(),
    label: z.string().max(128).optional(),
    kind: z.string().max(32).optional(),
    default: z.boolean().optional(),
  }).passthrough()).max(32).optional(),
  intro: z.unknown().optional(),
  outro: z.unknown().optional(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('AnimeDex request timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function decrypt(envelope: z.infer<typeof envelopeSchema>): unknown {
  const key = createHash('sha256').update(`${envelope.n}|${SECRET}`).digest()
  const buf = Buffer.from(envelope.d, 'base64url')
  if (buf.length <= 28) throw new Error('short ciphertext')
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(buf.length - 16))
  const plain = Buffer.concat([decipher.update(buf.subarray(12, buf.length - 16)), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as unknown
}

type PayloadResult = { ok: true; payload: unknown } | { ok: false; malformed: boolean }

/** 200 + undecryptable/unparseable body is a broken upstream contract
 *  (malformed); HTTP failures, timeouts, and aborts only miss the lane. */
async function fetchVidnest(http: ProviderHttp, path: string, signal: AbortSignal): Promise<PayloadResult> {
  const nonce = randomBytes(16).toString('base64url')
  const op = bounded(signal, LANE_TIMEOUT_MS)
  let raw: unknown
  try {
    const res = await document(http, `${VIDNEST_API}${path}?_n=${nonce}`, op.signal, API_HEADERS)
    raw = JSON.parse(res.text) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, malformed: true }
    return { ok: false, malformed: false }
  } finally {
    op.cleanup()
  }
  const envelope = envelopeSchema.safeParse(raw)
  if (envelope.success) {
    try {
      return { ok: true, payload: decrypt(envelope.data) }
    } catch {
      return { ok: false, malformed: true }
    }
  }
  if (payloadSchema.safeParse(raw).success) return { ok: true, payload: raw }
  return { ok: false, malformed: true }
}

function mapSubtitles(tracks: z.infer<typeof payloadSchema>['tracks']): ProviderSource['subtitles'] {
  const out: ProviderSource['subtitles'] = []
  const seen = new Set<string>()
  for (const track of tracks ?? []) {
    if (out.length >= 32) break
    if (track.kind === 'thumbnails') continue
    const url = String(track.file ?? track.url ?? '')
    if (!/^https:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    const label = String(track.label || 'English').slice(0, 64) || 'English'
    out.push({
      id: `animedex-sub-${out.length}`,
      label,
      language: label.toLowerCase().slice(0, 32),
      url,
      format: 'vtt',
    })
  }
  return out
}

export function createAnimedexProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('animedex', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const track: 'sub' | 'dub' = dub ? 'dub' : 'sub'
    const episode = ref.episode
    const alid = ref.id
    let malformed = false

    async function pass(wanted: 'sub' | 'dub', fallback: boolean): Promise<ProviderSource[]> {
      const results = await Promise.all(LANES.map(async (lane) => {
        const result = await fetchVidnest(http, lane.path(alid, episode, wanted), signal)
        if (!result.ok) return { sources: [] as ProviderSource[], failed: result.malformed }
        const payload = payloadSchema.safeParse(result.payload)
        if (!payload.success) return { sources: [] as ProviderSource[], failed: true }
        const first = (payload.data.sources ?? []).find((source) => source.file || source.url)
        const url = String(first?.file ?? first?.url ?? '')
        if (!/^https:\/\//.test(url)) return { sources: [] as ProviderSource[], failed: false }
        const type = mediaType(url) ?? 'hls'
        let expiresAt: string
        try {
          expiresAt = accessDeadline(url, now())
        } catch {
          return { sources: [] as ProviderSource[], failed: false }
        }
        const skipSegments = parseSkipSegments(payload.data)
        const subtitles = mapSubtitles(payload.data.tracks)
        return {
          sources: [{
            key: `animedex:${lane.id}:${fallback ? 'sub-fb' : wanted}:${episode}`, serverName: lane.id.slice(0, 80),
            url,
            type,
            headers: { ...lane.headers },
            expiresAt,
            language: dub ? 'en' : 'original',
            qualityHint: 'Auto',
            subtitles,
            ...(type === 'hls' && skipSegments.length ? { skipSegments } : {}),
          } satisfies ProviderSource],
          failed: false,
        }
      }))
      malformed ||= results.some((result) => result.failed)
      // LANES order is the delivery preference: anitaku over aniwave.
      return await verifiedPlaybackSources(http, results.flatMap((result) => result.sources), signal)
    }

    let sources = await pass(track, false)
    if (!sources.length && dub) sources = await pass('sub', true)
    if (sources.length) return sources

    const embedUrl = `${VIDNEST}/anime/${alid}/${episode}/${track}?servericon=hide&topcaption=hide&topsettings=hide`
    const op = bounded(signal, EMBED_TIMEOUT_MS)
    try {
      await document(http, embedUrl, op.signal, { accept: 'text/html' })
      return [{
        key: `animedex:embed:${track}:${episode}`,
        url: embedUrl,
        type: 'iframe',
        expiresAt: accessDeadline(embedUrl, now()),
        language: dub ? 'en' : 'original',
        headers: {},
        qualityHint: 'Auto',
        subtitles: [],
      } satisfies ProviderSource]
    } catch {
      // No embed page either; fall through to the failure code below.
    } finally {
      op.cleanup()
    }
    if (malformed) throw new ProviderFailure('malformed')
    throw new ProviderFailure('empty')
  }), { audioLanguages: ['ja', 'en'] })
}
