import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const API = 'https://w1.moviesapi.to'
const ENCRYPTION_KEY = 'moviesapi-secure-encryption-key-2024-v1'
const PLAYER_KEY = 'moviesapi-player-auth-key-2024-secure'
const ORIGIN = 'https://moviesapi.to'

const trackSchema = z.object({
  file: z.string().max(4096).nullish(),
  label: z.string().max(128).nullish(),
  kind: z.string().max(32).nullish(),
}).passthrough()

const scrapifySchema = z.object({
  source: z.string().max(64).nullish(),
  url: z.string().max(4096).nullish(),
  quality: z.union([z.string().max(32), z.number()]).nullish(),
  type: z.string().max(32).nullish(),
  origin: z.string().max(256).nullish(),
  referer: z.string().max(256).nullish(),
  tracks: z.array(trackSchema).max(64).nullish(),
  englishTrackIndex: z.number().nullish(),
  dub: z.string().max(64).nullish(),
  imdbId: z.string().max(32).nullish(),
  tmdbId: z.union([z.string().max(32), z.number()]).nullish(),
  title: z.string().max(300).nullish(),
  year: z.number().nullish(),
}).passthrough()

const responseSchema = z.object({
  data: scrapifySchema.nullish(),
  source: z.string().max(64).nullish(),
  url: z.string().max(4096).nullish(),
  quality: z.union([z.string().max(32), z.number()]).nullish(),
  type: z.string().max(32).nullish(),
  origin: z.string().max(256).nullish(),
  referer: z.string().max(256).nullish(),
  tracks: z.array(trackSchema).max(64).nullish(),
}).passthrough()

/** CryptoJS-compatible AES encryption: OpenSSL EVP_BytesToKey (MD5) key
 *  derivation, AES-256-CBC, base64 with "Salted__" prefix. */
function encryptPayload(plaintext: string): string {
  const salt = randomBytes(8)
  const keyIv = evpBytesToKey(Buffer.from(ENCRYPTION_KEY, 'utf8'), salt, 32 + 16)
  const key = keyIv.subarray(0, 32)
  const iv = keyIv.subarray(32, 48)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  const result = Buffer.concat([Buffer.from('Salted__', 'utf8'), salt, encrypted])
  return result.toString('base64')
}

function evpBytesToKey(password: Buffer, salt: Buffer, keyLen: number): Buffer {
  const blocks: Buffer[] = []
  let block = Buffer.alloc(0)
  while (blocks.reduce((sum, b) => sum + b.length, 0) < keyLen) {
    const hash = createHash('md5')
    hash.update(block)
    hash.update(password)
    if (salt.length) hash.update(salt)
    block = hash.digest()
    blocks.push(block)
  }
  return Buffer.concat(blocks).subarray(0, keyLen)
}

function heightOf(quality: string | number): number | undefined {
  const match = /(\d{3,4})\s*p/i.exec(String(quality))
  if (!match?.[1]) return undefined
  const height = Number.parseInt(match[1], 10)
  return Number.isFinite(height) && height >= 144 && height <= 4320 ? height : undefined
}

function classifyType(url: string, hint?: string): ProviderSource['type'] | null {
  if (/\.(mkv|avi|mov|wmv|flv)(\?|#|$)/i.test(url)) return null
  return mediaType(url, hint) ?? 'hls'
}

const RELAY_RE = /proxy|relay|\bembed\b|\biframe\b|\.html?(?:[?#]|$)/i

function isDirectCandidate(url: string): boolean {
  if (!/^https:\/\//i.test(url) || url.length > 4096) return false
  if (RELAY_RE.test(url)) return false
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) return false
    for (const value of parsed.searchParams.values()) {
      if (/https?%3A|https?:\/\//i.test(value)) return false
    }
  } catch {
    return false
  }
  return true
}

/** Port of the supplied MoviesAPI recipe: AES-encrypted scrapify POST that
 *  returns direct HLS/DASH sources with subtitle tracks. The encryption key
 *  and player key are published in their frontend bundle. Browser-direct
 *  delivery requires CORS-open media hosts; header-locked lanes are dropped. */
export function createMoviesapiProvider(http: ProviderHttp, now = Date.now) {
  return adapter('moviesapi', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const tmdbId = String(ref.id).trim()
    if (!tmdbId) throw new ProviderFailure('empty')

    const payload = JSON.stringify({
      source: 'sflix2',
      type: ref.kind === 'series' ? 'tv' : 'movie',
      id: tmdbId,
      srv: '0',
      ...(ref.kind === 'series' ? { season: ref.season, episode: ref.episode } : {}),
    })

    const encrypted = encryptPayload(payload)
    let response
    try {
      response = await http(`${API}/api/scrapify/v1/fetch`, {
        'user-agent': userAgent,
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        origin: ORIGIN,
        referer: `${ORIGIN}/`,
        'x-player-key': PLAYER_KEY,
      }, signal, { method: 'POST', body: JSON.stringify({ payload: encrypted }) })
    } catch {
      throw new ProviderFailure('unavailable')
    }
    if (response.status === 404) throw new ProviderFailure('empty')
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')

    let body: unknown
    try {
      body = JSON.parse(response.text) as unknown
    } catch {
      throw new ProviderFailure('malformed')
    }

    const parsed = responseSchema.safeParse(body)
    if (!parsed.success) throw new ProviderFailure('malformed')

    // Response may be { data: {...} } or the source object directly
    const raw = parsed.data.data ?? parsed.data
    const item = scrapifySchema.safeParse(raw)
    if (!item.success || !item.data.url) throw new ProviderFailure('empty')

    const url = String(item.data.url).trim()
    if (!isDirectCandidate(url)) throw new ProviderFailure('empty')

    const type = classifyType(url, typeof item.data.type === 'string' ? item.data.type : undefined)
    if (!type) throw new ProviderFailure('empty')

    let expiresAt: string
    try {
      expiresAt = accessDeadline(url, now())
    } catch {
      throw new ProviderFailure('empty')
    }

    // Build subtitle tracks from the tracks array
    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    for (const [index, track] of (item.data.tracks ?? []).entries()) {
      const trackUrl = String(track.file ?? '').trim()
      if (!trackUrl || !/^https:\/\//i.test(trackUrl) || trackUrl.length > 4096 || seenSubs.has(trackUrl)) continue
      seenSubs.add(trackUrl)
      const ext = trackUrl.split('.').pop()?.toLowerCase().split(/[?#]/)[0]
      if (ext !== 'vtt' && ext !== 'srt') continue
      subtitles.push({
        id: `moviesapi-sub-${index}`,
        label: String(track.label ?? 'Subtitle').slice(0, 128),
        language: String(track.label ?? 'und').toLowerCase().slice(0, 32),
        url: trackUrl,
        format: ext as 'vtt' | 'srt',
      })
      if (subtitles.length >= 32) break
    }

    const quality = String(item.data.quality ?? 'Auto').trim().slice(0, 24) || 'Auto'
    const height = heightOf(item.data.quality ?? '')

    // Header hints from the response; only safe headers cross the seam
    const headers: Record<string, string> = {}
    if (item.data.origin && /^https:\/\//i.test(item.data.origin)) {
      try { headers['origin'] = new URL(item.data.origin).origin } catch { /* skip */ }
    }
    if (item.data.referer && /^https:\/\//i.test(item.data.referer)) {
      headers['referer'] = item.data.referer.slice(0, 256)
    }

    return [{
      key: `moviesapi:${quality.toLowerCase()}:0`,
      url,
      type,
      headers,
      expiresAt,
      language: item.data.dub ? 'dub' : 'original',
      qualityHint: quality,
      ...(height === undefined ? {} : { height }),
      subtitles,
    }]
  })
}
