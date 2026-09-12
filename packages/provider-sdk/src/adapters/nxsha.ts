import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://nxsha.space'
const baseHeaders = { 'user-agent': userAgent, accept: 'application/json', referer: `${apiOrigin}/` }
// Passphrase from the supplied Nxsha recipe (static web-bundle chunk):
// AES-256-CBC payloads in CryptoJS Salted__ base64url envelope.
const apiPassphrase = 'S8x!Jk4ZP1uG8$my'

const serverSchema = z.object({
  scraper: z.string().min(1).max(64),
  name: z.string().max(64).optional(),
  isDisable: z.boolean().optional(),
  web_support: z.boolean().optional(),
  status: z.string().max(32).optional(),
  types: z.array(z.string().max(16)).optional(),
  high_priority: z.union([z.number(), z.string().max(8)]).optional(),
  position: z.number().optional(),
}).passthrough()
const serversSchema = z.object({ servers: z.array(serverSchema).max(64).optional() })
const sourceSchema = z.object({
  url: z.string().max(4096).optional(),
  org_uri: z.string().max(4096).optional(),
  quality: z.string().max(32).optional(),
  label: z.string().max(64).optional(),
  // Embed entries are player pages, not media: the SDK carries no iframe
  // playback, so they stay out instead of becoming failing sessions.
  isEmbed: z.boolean().optional(),
}).passthrough()
const sourcesSchema = z.object({ sources: z.array(sourceSchema).max(64).optional() })
const envelopeSchema = z.object({ _hash: z.string().min(1).max(1_000_000) })

function unwrapEnvelope(text: string): unknown {
  const hash = envelopeSchema.parse(JSON.parse(text))._hash
  return decodeNxshaPayload(hash)
}
const subtitleSchema = z.object({
  uri: z.url().max(4096),
  title: z.string().max(64).optional(),
  language: z.string().max(32).optional(),
  type: z.string().max(16).optional(),
})
const subtitlesSchema = z.object({ subtitles: z.array(subtitleSchema).max(64).optional() })

// Scrapers ordered by measured robustness (lab audit): castle and
// rive-citadel stay playable under burst load, the rest throttle harder.
const ROBUST_FIRST = ['castle', 'rive-citadel', 'awsind', 'nitro', 'rive-primevids']

function evpBytesToKey(password: string, salt: Buffer, keyLength: number, ivLength: number): { key: Buffer; iv: Buffer } {
  const pass = Buffer.from(password, 'utf8')
  let derived = Buffer.alloc(0)
  let previous = Buffer.alloc(0)
  while (derived.length < keyLength + ivLength) {
    const hash = createHash('md5')
    hash.update(Buffer.concat([previous, pass, salt]))
    previous = hash.digest()
    derived = Buffer.concat([derived, previous])
  }
  return { key: derived.subarray(0, keyLength), iv: derived.subarray(keyLength, keyLength + ivLength) }
}

function b64urlEncode(raw: Buffer): string {
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export function encodeNxshaPayload(payload: Record<string, unknown>): string {
  const body = JSON.stringify({ ...payload, _req_ts: Date.now(), _req_salt: Math.random().toString(36).slice(2, 12) })
  const salt = randomBytes(8)
  const { key, iv } = evpBytesToKey(apiPassphrase, salt, 32, 16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const cipherText = Buffer.concat([cipher.update(Buffer.from(body, 'utf8')), cipher.final()])
  return b64urlEncode(Buffer.concat([Buffer.from('Salted__'), salt, cipherText]))
}

export function decodeNxshaPayload(hash: string): unknown {
  const raw = b64urlDecode(hash)
  const { key, iv } = evpBytesToKey(apiPassphrase, raw.subarray(8, 16), 32, 16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8'))
}

/** Port of the supplied Nxsha recipe: passphrase-enveloped server, source,
 *  out (no iframe playback); DASH manifests are unsupported. No
 *  page scripts are executed. */
export function createNxshaProvider(http: ProviderHttp, now = Date.now) {
  return adapter('nxsha', async (input, signal) => {
    const { ref } = input
    const isSeries = ref.kind === 'series'
    const season = ref.kind === 'series' ? ref.season : 1
    const episode = ref.kind === 'series' ? ref.episode : 1
    const identity = { tmdbId: String(ref.id), type: isSeries ? 'tv' : 'movie', season, episode }
    const serversResponse = await document(http,
      `${apiOrigin}/api/servers?q=${encodeURIComponent(encodeNxshaPayload({ ...identity, imdb_id: '' }))}`,
      signal, baseHeaders)
    const servers = serversSchema.parse(unwrapEnvelope(serversResponse.text)).servers ?? []
    const candidates = servers
      .filter((server) => server && !server.isDisable && server.web_support !== false && server.status !== 'offline')
      .filter((server) => !Array.isArray(server.types) || server.types.includes(isSeries ? 'tv' : 'movie'))
      .sort((a, b) => {
        const rankA = ROBUST_FIRST.indexOf(a.scraper)
        const rankB = ROBUST_FIRST.indexOf(b.scraper)
        if ((rankA === -1) !== (rankB === -1)) return rankA === -1 ? 1 : -1
        if (rankA !== rankB) return rankA - rankB
        const priorityA = a.high_priority != null ? Number.parseInt(String(a.high_priority), 10) : 999
        const priorityB = b.high_priority != null ? Number.parseInt(String(b.high_priority), 10) : 999
        if (priorityA !== priorityB) return priorityA - priorityB
        return (a.position ?? 0) - (b.position ?? 0)
      })
      .slice(0, 6)
    if (!candidates.length) throw new ProviderFailure('empty')
    const settled = await Promise.all(candidates.map(async (server) => {
      const scoped = AbortSignal.any([signal, AbortSignal.timeout(12000)])
      try {
        const query = encodeNxshaPayload({ ex_lang: false, provider: server.scraper, ...identity, imdb_id: '' })
        const response = await document(http, `${apiOrigin}/api/sources?q=${encodeURIComponent(query)}`, scoped, baseHeaders)
        return { server, sources: sourcesSchema.parse(unwrapEnvelope(response.text)).sources ?? [] }
      } catch { return { server, sources: [] as z.infer<typeof sourceSchema>[] } }
    }))
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const { server, sources: entries } of settled) {
      for (const entry of entries) {
        if (sources.length >= 12) break
        if (entry.isEmbed) continue
        const url = String(entry.url || entry.org_uri || '')
        if (!/^https:\/\//i.test(url) || seen.has(url)) continue
        seen.add(url)
        const label = String(entry.quality || entry.label || 'Auto')
        const type = mediaType(url) ?? (/\.mpd(\?|#|$)/i.test(url) ? 'dash' : 'hls')
        let deadline: string
        try { deadline = accessDeadline(url, now()) } catch { continue }
        sources.push({ key: `nxsha:${server.scraper}:${sources.length}`, url, type,
          headers: { referer: `${apiOrigin}/`, 'user-agent': userAgent },
          expiresAt: deadline, language: 'original', qualityHint: label.slice(0, 24) || 'Auto', subtitles: [] })
      }
      if (sources.length >= 12) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    try {
      const scoped = AbortSignal.any([signal, AbortSignal.timeout(8000)])
      const query = encodeNxshaPayload({ tmdbId: String(ref.id), type: isSeries ? 'tv' : 'movie', season, episode })
      const response = await http(`${apiOrigin}/api/subtitles?q=${encodeURIComponent(query)}`, baseHeaders, scoped)
      if (response.status >= 200 && response.status < 300) {
        const tracks = subtitlesSchema.parse(unwrapEnvelope(response.text)).subtitles ?? []
        const subtitles = tracks.filter((track) => !/\.ass$/i.test(track.uri)).slice(0, 20).map((track, index) => ({
          id: `nxsha-sub-${index}`, label: (track.title || track.language || 'Unknown').slice(0, 64),
          language: (track.language || track.title || 'Unknown').slice(0, 32), url: track.uri,
          format: (/\.srt/i.test(track.uri) ? 'srt' : 'vtt') as 'srt' | 'vtt',
        }))
        return sources.map((source) => ({ ...source, subtitles }))
      }
    } catch { /* subtitles stay empty */ }
    return sources
  })
}
