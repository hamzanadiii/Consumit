import { createHash } from 'node:crypto'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, type ProviderHttp } from './http.ts'

// Mapple (mapple.fun) — Next.js watch site with a self-hosted encrypted
// stream API. Chain ported from PROVE and verified live for movie 550 and
// TV 1396 S1E1:
//   1. GET /watch/{movie|tv}/{id}[/{s}/{e}] -> _mapple_site cookie
//   2. POST /api/ui/session -> request token
//   3. POST /api/media-session -> PoW challenge -> stream token
//   4. POST /api/encrypt -> encrypted stream endpoint
//   5. GET stream endpoint -> CDN stream_url
// Source ids follow the current public catalog; availability varies per title.
const BASE = 'https://mapple.fun'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CDN_HEADERS = { origin: BASE, referer: `${BASE}/`, 'user-agent': 'node' }
const SOURCE_IDS = ['s25', 'mapple', 's10', 's2'] as const
const KNOWN_SOURCE_IDS = new Set(['s25', 'mapple', 's10', 's2', 's28', 's19'])
const LANE_TIMEOUT_MS = 6500
const MANIFEST_TIMEOUT_MS = 1800

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function json(value: string): Record<string, unknown> {
  const parsed = record(JSON.parse(value))
  if (!parsed) throw new ProviderFailure('malformed')
  return parsed
}

async function solvePow(challenge: string, difficulty: number, signal: AbortSignal): Promise<string> {
  const prefix = Buffer.from(challenge, 'utf8')
  const fullBytes = Math.floor(difficulty / 8)
  const restBits = difficulty % 8
  for (let nonce = 0; nonce <= 5_000_000; nonce++) {
    if (nonce % 4096 === 0) {
      signal.throwIfAborted()
      if (nonce) await new Promise(resolve => setTimeout(resolve, 0))
      signal.throwIfAborted()
    }
    const digest = createHash('sha256').update(prefix).update(String(nonce)).digest()
    let ok = true
    for (let index = 0; index < fullBytes && ok; index++) {
      if (digest[index] !== 0) ok = false
    }
    if (ok && restBits && ((digest[fullBytes] ?? 0) >> (8 - restBits)) !== 0) ok = false
    if (ok) return String(nonce)
  }
  throw new ProviderFailure('unavailable')
}

function ladderQuality(master: string): { qualityHint: string; height?: number } {
  let best = 0
  for (const match of master.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)) {
    const height = Number.parseInt(match[2]!, 10)
    if (Number.isFinite(height) && height > best) best = height
  }
  if (!best) {
    for (const match of master.matchAll(/video[_-](\d{3,4})p/gi)) {
      const height = Number.parseInt(match[1]!, 10)
      if (Number.isFinite(height) && height > best) best = height
    }
  }
  const qualityHint = best >= 2100 ? '2160p' : best >= 1080 ? '1080p' : best >= 720 ? '720p' : best >= 480 ? '480p' : 'Auto'
  return { qualityHint, ...(best ? { height: best } : {}) }
}

function setCookies(headers?: Headers): string[] {
  if (!headers) return []
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const fromMethod = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : []
  const list = fromMethod.length ? fromMethod : headers.get('set-cookie') ? [headers.get('set-cookie')!] : []
  return list.map((cookie) => cookie.split(';')[0]?.trim() ?? '').filter(Boolean)
}

function mergeCookies(jar: Map<string, string>, headers?: Headers) {
  for (const pair of setCookies(headers)) {
    const separator = pair.indexOf('=')
    if (separator > 0) jar.set(pair.slice(0, separator), pair)
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.values()].join('; ')
}

function httpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return undefined
    return url.href
  } catch {
    return undefined
  }
}

export function createMappleProvider(http: ProviderHttp, now = Date.now, options: { sourceIds?: readonly string[] } = {}) {
  const sourceIds = [...new Set(options.sourceIds ?? SOURCE_IDS)]
  if (!sourceIds.length || sourceIds.length > 6 || sourceIds.some(id => !KNOWN_SOURCE_IDS.has(id))) throw new Error('Unknown Mapple source configuration.')
  return adapter('mapple', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')

    const isTv = ref.kind === 'series'
    const season = ref.season ?? 1
    const episode = ref.episode ?? 1
    const tvSlug = isTv ? `${season}-${episode}` : ''
    const referer = isTv ? `${BASE}/watch/tv/${ref.id}/${season}/${episode}` : `${BASE}/watch/movie/${ref.id}`
    const jar = new Map<string, string>()

    const apiHeaders = () => ({
      'user-agent': UA,
      accept: 'application/json',
      'content-type': 'application/json',
      referer,
      origin: BASE,
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    })

    const post = async (url: string, body: unknown, requestSignal = signal) => {
      const response = await document(http, url, requestSignal, apiHeaders(), { method: 'POST', body: JSON.stringify(body) })
      mergeCookies(jar, response.headers)
      return json(response.text)
    }

    const get = async (url: string, requestSignal = signal) => {
      const response = await document(http, url, requestSignal, apiHeaders())
      mergeCookies(jar, response.headers)
      return json(response.text)
    }

    const page = await document(http, referer, signal, { 'user-agent': UA, accept: 'text/html' })
    mergeCookies(jar, page.headers)
    if (!jar.has('_mapple_site')) throw new ProviderFailure('empty')

    const session = await post(`${BASE}/api/ui/session`, {})
    const requestToken = text(session.token)
    if (!requestToken) throw new ProviderFailure('empty')

    const mediaSession = {
      mediaId: ref.id,
      mediaType: isTv ? 'tv' : 'movie',
      tv_slug: tvSlug,
      requestToken,
    }
    let streamSession = await post(`${BASE}/api/media-session`, mediaSession)
    const pow = record(streamSession.pow)
    if (streamSession.requiresPow && pow) {
      const challengeId = text(pow.challengeId)
      const challenge = text(pow.challenge)
      const difficulty = Number(pow.difficulty)
      if (!challengeId || !challenge || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 256) {
        throw new ProviderFailure('empty')
      }
      const nonce = await solvePow(challenge, difficulty, signal)
      streamSession = await post(`${BASE}/api/media-session`, {
        ...mediaSession,
        pow: { challengeId, nonce },
      })
    }
    const streamToken = text(streamSession.token)
    if (!streamToken) throw new ProviderFailure('empty')

    const lanes = await Promise.all(sourceIds.map(async (source) => {
      const lane = new AbortController()
      const laneSignal = AbortSignal.any([signal, lane.signal])
      const timer = setTimeout(() => lane.abort(new DOMException('Mapple source timed out.', 'TimeoutError')), LANE_TIMEOUT_MS)
      try {
        const encrypted = await post(`${BASE}/api/encrypt`, {
          data: { mediaId: ref.id, mediaType: isTv ? 'tv' : 'movie', tv_slug: tvSlug, source },
          endpoint: 'stream-encrypted',
          requestToken,
        }, laneSignal)
        const encryptedPath = text(encrypted.url)
        if (!encryptedPath) return undefined
        const endpoint = new URL(encryptedPath, BASE)
        if (endpoint.origin !== BASE || endpoint.username || endpoint.password) return undefined
        endpoint.searchParams.set('requestToken', requestToken)
        endpoint.searchParams.set('token', streamToken)

        const resolved = await get(endpoint.href, laneSignal)
        const streamUrl = httpsUrl(text(record(resolved.data)?.stream_url) ?? '')
        if (!streamUrl) return undefined

        let quality: { qualityHint: string; height?: number } = { qualityHint: 'Auto' }
        try {
          const manifest = await http(streamUrl, CDN_HEADERS, AbortSignal.any([laneSignal, AbortSignal.timeout(MANIFEST_TIMEOUT_MS)]))
          if (manifest.status >= 200 && manifest.status < 300 && manifest.text.includes('#EXTM3U')) {
            quality = ladderQuality(manifest.text)
          } else return undefined
        } catch {
          signal.throwIfAborted()
          return undefined
        }

        let expiresAt: string
        try {
          expiresAt = accessDeadline(streamUrl, now())
        } catch {
          return undefined
        }

        return {
          source,
          streamUrl,
          expiresAt,
          ...quality,
        }
      } catch {
        signal.throwIfAborted()
        return undefined
      } finally { clearTimeout(timer) }
    }))

    const seen = new Set<string>()
    const sources: ProviderSource[] = []
    for (const lane of lanes) {
      if (!lane || seen.has(lane.streamUrl)) continue
      seen.add(lane.streamUrl)
      sources.push({
        key: `mapple:${lane.source}:${lane.qualityHint.toLowerCase()}`,
        url: lane.streamUrl,
        type: 'hls',
        expiresAt: lane.expiresAt,
        language: 'original',
        headers: { ...CDN_HEADERS },
        subtitles: [],
        qualityHint: lane.qualityHint,
        qualityGroup: 'mapple',
        ...(lane.height ? { height: lane.height } : {}),
      })
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
