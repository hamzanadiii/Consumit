import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const BASE = 'https://cdn.vidspark.to'
// Static player key captured from the provider's own player bundle; sent as
// the `x-player-key` header the API requires alongside the player Referer.
const PLAYER_KEY = 'f3b72e73c80c9a996574379798703796a1936efa3516a7105cb0e43048b46b5a'

const MAX_SOURCES = 6

const sourceSchema = z.object({ url: z.string().max(4096).nullish() }).passthrough()
const payloadSchema = z.object({ sources: z.array(sourceSchema).max(32).nullish() }).passthrough()

/** Port of the supplied Netoda recipe: the open vidora JSON API returns a
 *  same-network proxy URL whose `url` parameter decodes to the upstream
 *  netoda.tech master. Upstream sends no CORS headers anywhere, so the
 *  master always crosses through the approved Worker relay like every other
 *  relay row; server-side fetches need no headers on either hop. */
export function createNetodaProvider(http: ProviderHttp, now = Date.now) {
  return adapter('netoda', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const tmdbId = String(ref.id).trim()
    if (!tmdbId) throw new ProviderFailure('empty')
    const apiUrl = ref.kind === 'series'
      ? `${BASE}/api/vidora/v1/tv/${encodeURIComponent(tmdbId)}/${ref.season}/${ref.episode}`
      : `${BASE}/api/vidora/v1/movie/${encodeURIComponent(tmdbId)}`
    let response
    try {
      response = await http(apiUrl, {
        'user-agent': userAgent,
        accept: 'application/json',
        referer: `${BASE}/`,
        'x-player-key': PLAYER_KEY,
      }, signal)
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
    const parsed = payloadSchema.safeParse(body)
    if (!parsed.success) throw new ProviderFailure('malformed')
    const proxied = parsed.data.sources?.find((item) => typeof item.url === 'string')?.url
    if (!proxied) throw new ProviderFailure('empty')
    const upstream = decodeUpstream(proxied)
    if (!upstream) throw new ProviderFailure('empty')
    let expiresAt: string
    try {
      expiresAt = accessDeadline(upstream, now())
    } catch {
      throw new ProviderFailure('empty')
    }
    const sources: ProviderSource[] = [{
      key: 'netoda:0',
      url: upstream,
      type: 'hls',
      headers: {},
      expiresAt,
      expiryEstimated: true,
      language: 'original',
      qualityHint: 'Auto',
      subtitles: [],
    }]
    return sources.slice(0, MAX_SOURCES)
  })
}

/** Same-network proxy `?url=<encoded master>` decodes to the netoda master.
 *  Only exact-https masters survive; anything else fails closed. */
function decodeUpstream(proxyUrl: string): string {
  const clean = proxyUrl.trim()
  if (clean.length > 4096) return ''
  try {
    const inner = new URL(clean).searchParams.get('url')
    if (inner && /^https:\/\//i.test(inner) && inner.length <= 4096) return inner
  } catch {
    // fall through to the manual parse
  }
  const match = /[?&]url=([^&]+)/i.exec(clean)
  if (match?.[1]) {
    try {
      const decoded = decodeURIComponent(match[1])
      if (/^https:\/\//i.test(decoded) && decoded.length <= 4096) return decoded
    } catch {
      // fall through
    }
  }
  return ''
}
