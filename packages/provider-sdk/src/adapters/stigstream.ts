import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

// Port of the PROVE StigStream recipe (providers/stigstream/{stigstream.ts,
// client.ts} plus the server-scoped rows in providers/stigsplit/stigsplit.ts):
//   POST /secure/handshake {clientPublicKey} (+ X-Api-Key, embedded public
//     client key, same as the web player) -> {sessionId, serverPublicKey,
//     salt, ttl} — ECDH P-256 + HKDF-SHA256 -> AES-256-GCM secure channel
//   GET /movie/{server}/{tmdb} | /tv/{server}/{tmdb}/{s}/{e}
//     (+ X-Api-Key, X-Session-Id) -> {streams:[{url,type,quality}],
//     subtitles:[{url,lang}]} — envelope {v:"4"} decrypted with the session key.
// Streams are HLS via yflix/stigstream proxy hosts. The proxy hosts gate
// hotlinking: Referer https://stigstream.ru/ is mandatory (without it
// playlists 403) — except ngcorp.dad origins, which require their own
// vidrock.ru referer (verified live in PROVE). Headers ride on every source.
const apiOrigin = 'https://api.stigstream.ru'
const siteOrigin = 'https://stigstream.ru'
const publicApiKey = '0cb4683fa6eb666bf70712b57e0110adf4a173bd45110869b19c298b724657c2'

const clientHeaders = {
  'user-agent': userAgent,
  accept: 'application/json',
  referer: `${siteOrigin}/`,
  origin: siteOrigin,
}

const UPSTREAM_REFERER = `${siteOrigin}/`
const VIDROCK_REFERER = 'https://vidrock.ru/'

function headersFor(url: string): Record<string, string> {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'ngcorp.dad' || host.endsWith('.ngcorp.dad')) {
      return { referer: VIDROCK_REFERER, 'user-agent': userAgent }
    }
  } catch {
    // fall through to default
  }
  return { referer: UPSTREAM_REFERER, 'user-agent': userAgent }
}

const HANDSHAKE_TIMEOUT_MS = 10_000
const API_TIMEOUT_MS = 15_000

const handshakeSchema = z.object({
  sessionId: z.string().min(1).max(256),
  serverPublicKey: z.string().min(1).max(1024),
  salt: z.string().min(1).max(1024),
  ttl: z.number().int().min(0).max(3_600_000).optional(),
})

const envelopeSchema = z.object({
  v: z.string().max(8).optional(),
  iv: z.string().max(1024).optional(),
  data: z.string().max(2_000_000).optional(),
}).passthrough()

const streamsSchema = z.object({
  streams: z.array(z.object({
    url: z.string().max(4096),
    type: z.string().max(16).optional(),
    quality: z.string().max(32).optional(),
  }).passthrough()).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    lang: z.string().max(64).optional(),
    label: z.string().max(64).optional(),
  }).passthrough()).optional(),
}).passthrough()

export type StigstreamScope = {
  id?: string
  /** Upstream server name (Nebula, Orion, …). Scoped rows serve one server. */
  server?: string
  /** Source language code for every rendition of this row. */
  audioLanguage?: string
}

type Session = { sessionId: string; key: CryptoKey; expiresAt: number }

function b64encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/** Fresh-copy bytes: Buffer can ride a pooled SharedArrayBuffer, which the
 *  strict DOM BufferSource types reject — copy onto a real ArrayBuffer. */
function b64decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

function hkdfInfo(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode('yur/secure-channel/v1|aes-256-gcm')
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('StigStream step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

/** Single-server StigStream row (Nebula, Orion, …). One adapter instance
 *  keeps its own handshake session; a 401 clears it and retries once. */
export function createStigstreamProvider(http: ProviderHttp, now = Date.now, scope: StigstreamScope = {}) {
  const id = scope.id ?? 'stigstream'
  const server = scope.server ?? 'Nebula'
  const audioLanguage = scope.audioLanguage ?? 'original'

  let cached: Session | null = null
  let handshaking: Promise<Session> | null = null

  async function doHandshake(signal: AbortSignal): Promise<Session> {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) throw new ProviderFailure('unavailable')
    const keypair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
    const rawPub = new Uint8Array(await subtle.exportKey('raw', keypair.publicKey))
    const op = bounded(signal, HANDSHAKE_TIMEOUT_MS)
    try {
      const response = await http(`${apiOrigin}/secure/handshake`, {
        ...clientHeaders,
        'content-type': 'application/json',
        'x-api-key': publicApiKey,
      }, op.signal, { method: 'POST', body: JSON.stringify({ clientPublicKey: b64encode(rawPub) }) })
      if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
      const parsed = handshakeSchema.parse(JSON.parse(response.text))
      const serverPub = await subtle.importKey(
        'raw',
        b64decode(parsed.serverPublicKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      )
      const bits = await subtle.deriveBits(
        { name: 'ECDH', public: serverPub },
        keypair.privateKey,
        256,
      )
      const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
      const key = await subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: b64decode(parsed.salt), info: hkdfInfo() },
        hk,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      )
      return { sessionId: parsed.sessionId, key, expiresAt: now() + (parsed.ttl || 600_000) - 5_000 }
    } finally {
      op.cleanup()
    }
  }

  async function session(signal: AbortSignal): Promise<Session> {
    if (cached && now() < cached.expiresAt) return cached
    if (!handshaking) {
      handshaking = doHandshake(signal).then((next) => {
        cached = next
        return next
      })
      handshaking.catch(() => { handshaking = null })
    }
    return handshaking
  }

  async function callApi(path: string, signal: AbortSignal, retry = true): Promise<unknown> {
    const sess = await session(signal)
    const op = bounded(signal, API_TIMEOUT_MS)
    try {
      const response = await http(`${apiOrigin}${path}`, {
        ...clientHeaders,
        'x-api-key': publicApiKey,
        'x-session-id': sess.sessionId,
      }, op.signal)
      if (response.status === 401 && retry) {
        cached = null
        handshaking = null
        return callApi(path, signal, false)
      }
      if (response.status === 429 || response.status === 502 || response.status === 503) {
        if (!retry) throw new ProviderFailure('unavailable')
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1500)
          signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
        })
        return callApi(path, signal, false)
      }
      if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
      const json = JSON.parse(response.text) as z.infer<typeof envelopeSchema>
      const envelope = envelopeSchema.parse(json)
      if (envelope.v === '4' && envelope.iv && envelope.data) {
        const subtle = globalThis.crypto?.subtle
        if (!subtle) throw new ProviderFailure('unavailable')
        const plaintext = await subtle.decrypt(
          { name: 'AES-GCM', iv: b64decode(envelope.iv) },
          sess.key,
          b64decode(envelope.data),
        )
        return JSON.parse(new TextDecoder().decode(plaintext))
      }
      return json
    } finally {
      op.cleanup()
    }
  }

  return adapter(id, async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const isTv = ref.kind === 'series'
    if (isTv && (!ref.season || !ref.episode)) throw new ProviderFailure('empty')
    const path = isTv
      ? `/tv/${encodeURIComponent(server)}/${ref.id}/${ref.season}/${ref.episode}`
      : `/movie/${encodeURIComponent(server)}/${ref.id}`

    let data: z.infer<typeof streamsSchema>
    try {
      data = streamsSchema.parse(await callApi(path, signal))
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('malformed')
    }
    const streams = data.streams ?? []
    if (!streams.length) throw new ProviderFailure('empty')

    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    for (const track of data.subtitles ?? []) {
      if (!track.url.startsWith('https://') || seenSubs.has(track.url) || subtitles.length >= 20) continue
      seenSubs.add(track.url)
      const label = String(track.lang ?? track.label ?? 'Unknown').slice(0, 64)
      subtitles.push({
        id: `${id}-sub-${subtitles.length}`,
        label,
        language: label.slice(0, 32),
        url: track.url,
        format: /\.srt/i.test(track.url) ? 'srt' : 'vtt',
      })
    }

    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const [index, entry] of streams.entries()) {
      if (!entry.url.startsWith('https://') || seen.has(entry.url)) continue
      const type = mediaType(entry.url, entry.type?.toLowerCase()) ?? (/\.mp4(\?|#|$)/i.test(entry.url) ? 'native' : 'hls')
      const quality = String(entry.quality || 'Auto').slice(0, 24)
      const height = Number.parseInt(/(\d{3,4})p?/i.exec(quality)?.[1] ?? '0', 10)
      let expiresAt: string
      try {
        expiresAt = accessDeadline(entry.url, now())
      } catch {
        continue
      }
      seen.add(entry.url)
      sources.push({
        key: `${id}:${quality.toLowerCase()}:${index}`,
        url: entry.url,
        type,
        qualityHint: quality || 'Auto',
        expiresAt,
        language: audioLanguage,
        headers: headersFor(entry.url),
        subtitles,
        ...(height > 0 ? { height } : {}),
      })
      if (sources.length >= 32) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
