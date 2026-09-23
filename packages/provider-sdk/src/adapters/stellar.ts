import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://api.stellar.gdn'
const siteOrigin = 'https://stellar.gdn'
const clientHeaders = { 'user-agent': userAgent, accept: 'application/json' }

// Port of the stellar.gdn web client (reverse-engineered 2026-09-19):
// every API call rides an AES-GCM envelope (date-keyed SHA-256 key, random
// IV, split tag) plus a SHA-256 proof-of-work: hex(SHA-256(challenge+nonce))
// must start with `difficulty` zeros. Challenges are single-use with a ~90s
// expiry, so each operation mines its own nonce (difficulty 4 averages ~65k
// hashes, well under a second server-side).
const ENVELOPE_KEY_PREFIX = 'iwTL6oi-9LLc3M4a1jcQV6jciugKj1_z6dYhdSbbtlg:'
const POW_ATTEMPT_CAP = 5_000_000
const CHALLENGE_TIMEOUT_MS = 2000
const RESOLVE_TIMEOUT_MS = 3000
const SUBTITLE_TIMEOUT_MS = 2000

const challengeSchema = z.object({
  challenge: z.string().min(1).max(256),
  difficulty: z.number().int().min(1).max(8),
  expiresIn: z.number().optional(),
})

const resolveResponseSchema = z.object({
  url: z.string().min(1).max(4096).optional(),
  format: z.string().max(16).optional(),
  source: z.string().max(80).optional(),
  availableSources: z.array(z.string().max(80)).max(16).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(128).optional(),
    language: z.string().max(64).optional(),
  }).passthrough()).optional(),
})

const subtitlesResponseSchema = z.object({
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(128).optional(),
    language: z.string().max(64).optional(),
  }).passthrough()).optional(),
})

export type StellarOptions = {
  id?: string
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Stellar operation timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function throwIfTimedOut(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException('Stellar operation timed out', 'TimeoutError')
}

async function sealEnvelope(payload: Record<string, unknown>): Promise<Record<string, string>> {
  const date = new Date().toISOString().slice(0, 10)
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(`${ENVELOPE_KEY_PREFIX}${date}`))
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const combined = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload))))
  return {
    q: base64url(combined.slice(0, combined.length - 16)),
    s: base64url(iv),
    t: base64url(combined.slice(combined.length - 16)),
    d: date,
  }
}

async function mineNonce(challenge: string, difficulty: number, signal: AbortSignal): Promise<string> {
  const target = '0'.repeat(difficulty)
  const encoder = new TextEncoder()
  for (let nonce = 0; nonce < POW_ATTEMPT_CAP; nonce++) {
    if (nonce % 4096 === 0) throwIfTimedOut(signal)
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}${nonce}`))
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    if (hex.startsWith(target)) return String(nonce)
  }
  throw new ProviderFailure('empty')
}

async function fetchChallenge(http: ProviderHttp, signal: AbortSignal) {
  const response = await document(http, `${apiOrigin}/api/challenge`, signal, clientHeaders)
  return challengeSchema.parse(JSON.parse(response.text))
}

async function postEnvelope(http: ProviderHttp, path: string, payload: Record<string, unknown>, signal: AbortSignal) {
  const body = await sealEnvelope(payload)
  return document(http, `${apiOrigin}${path}`, signal, { ...clientHeaders, 'content-type': 'application/json' }, { method: 'POST', body: JSON.stringify(body) })
}

async function solveProof(http: ProviderHttp, signal: AbortSignal) {
  const { challenge, difficulty } = await fetchChallenge(http, signal)
  const nonce = await mineNonce(challenge, difficulty, signal)
  return { challenge, nonce }
}

type StellarSubtitle = { url: string; label?: string | undefined; language?: string | undefined }

function mapSubtitle(track: StellarSubtitle, id: string, index: number): ProviderSource['subtitles'][number] | null {
  if (!track.url.startsWith('https://')) return null
  const label = (track.label || track.language || 'Unknown').slice(0, 64)
  return {
    id: `${id}-sub-${index}`,
    label,
    language: (track.language || label).slice(0, 32),
    url: track.url,
    format: /\.srt/i.test(track.url) ? 'srt' : 'vtt',
  }
}

/** Port of the direct Stellar recipe: keyless resolve with CORS-open delivery
 *  plus VDRK subtitles. No proxy or relay wrapping; browser-direct playback
 *  only. */
export function createStellarProvider(http: ProviderHttp, now = Date.now, options: StellarOptions = {}) {
  const id = options.id ?? 'stellar'

  return adapter(id, async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const tmdbId = String(ref.id)
    const basePayload: Record<string, unknown> = { mediaType: isTv ? 'tv' : 'movie', id: tmdbId }
    if (isTv) {
      basePayload['season'] = ref.season
      basePayload['episode'] = ref.episode
    }

    // Resolve and subtitles each mine their own proof: challenges are
    // single-use, and a hanging subtitle host must never sink found sources.
    const resolveOp = bounded(signal, CHALLENGE_TIMEOUT_MS + RESOLVE_TIMEOUT_MS)
    let data
    try {
      const proof = await solveProof(http, resolveOp.signal)
      const response = await postEnvelope(http, '/api/resolve', { ...basePayload, ...proof }, resolveOp.signal)
      data = resolveResponseSchema.parse(JSON.parse(response.text))
    } finally {
      resolveOp.cleanup()
    }
    if (!data.url) throw new ProviderFailure('empty')

    const type = mediaType(data.url) ?? (/\.mp4(\?|#|$)/i.test(data.url) ? 'native' : 'hls')
    const slug = (data.source || id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || id
    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    const pushSubtitle = (track: StellarSubtitle) => {
      if (!track.url || seenSubs.has(track.url) || subtitles.length >= 20) return
      seenSubs.add(track.url)
      const mapped = mapSubtitle(track, id, subtitles.length)
      if (mapped) subtitles.push(mapped)
    }
    for (const track of data.subtitles ?? []) pushSubtitle(track)

    const subOp = bounded(signal, CHALLENGE_TIMEOUT_MS + SUBTITLE_TIMEOUT_MS)
    try {
      const proof = await solveProof(http, subOp.signal)
      const response = await postEnvelope(http, '/api/subtitles', { ...basePayload, ...proof }, subOp.signal)
      const parsed = subtitlesResponseSchema.parse(JSON.parse(response.text))
      for (const track of parsed.subtitles ?? []) pushSubtitle(track)
    } catch {
      // Tracks from resolve (or none) still stand.
    } finally {
      subOp.cleanup()
    }

    return [{
      key: `${id}:${slug}:0`,
      url: data.url,
      type,
      headers: { referer: `${siteOrigin}/` },
      expiresAt: accessDeadline(data.url, now()),
      language: 'original',
      qualityHint: 'Auto',
      subtitles,
    }]
  })
}


