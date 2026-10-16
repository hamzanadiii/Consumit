import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const API = 'https://streamvaultsrc.click'
const WRAPPER_HOST = 'streamvaultsrc.click'

const MAX_SOURCES = 12

const streamSchema = z.object({
  url: z.string().max(4096).nullish(),
  quality: z.union([z.string().max(32), z.number()]).nullish(),
  type: z.string().max(32).nullish(),
}).passthrough()
const payloadSchema = z.object({ streams: z.array(streamSchema).max(64).nullish() }).passthrough()

function heightOf(quality: string): number | undefined {
  const match = /(\d{3,4})\s*p/i.exec(quality)
  if (!match?.[1]) return undefined
  const height = Number.parseInt(match[1], 10)
  return Number.isFinite(height) && height >= 144 && height <= 4320 ? height : undefined
}

/** The stream-proxy wrapper carries the upstream in `u` plus an optional `h`
 *  JSON object of headers the wrapper forwards server-side. Entries whose `h`
 *  demands a Referer/Origin/Cookie can only play through the wrapper, never
 *  browser-direct, so they are dropped here. */
function unwrapDirect(wrapper: string): string {
  let url: URL
  try {
    url = new URL(wrapper.trim())
  } catch {
    return ''
  }
  if (url.hostname.toLowerCase() !== WRAPPER_HOST) return ''
  const upstream = url.searchParams.get('u')
  if (!upstream || !/^https:\/\//i.test(upstream) || upstream.length > 4096) return ''
  const required = url.searchParams.get('h')
  if (required) {
    try {
      const headers = JSON.parse(required) as unknown
      if (headers && typeof headers === 'object') {
        const names = Object.keys(headers as Record<string, unknown>).map((name) => name.toLowerCase())
        if (names.some((name) => name === 'referer' || name === 'origin' || name === 'cookie' || name === 'authorization')) return ''
      }
    } catch {
      return ''
    }
  }
  try {
    const parsed = new URL(upstream)
    if (parsed.username || parsed.password) return ''
  } catch {
    return ''
  }
  return upstream
}

/** Port of the supplied StreamVault recipe: the open embed-streams JSON API
 *  returns same-origin stream-proxy wrappers. Consumit never plays wrapped
 *  targets direct, so the adapter unwraps the upstream media URL and returns
 *  it only when the wrapper demands no browser-unsendable headers. Upstream
 *  hosts stay allowlisted on the configured row; header-locked entries (the
 *  Zoisite lanes, already covered by the zeta relay row) never surface here.
 *  Verified live: header-less Silver masters answer 200 with ACAO:*. */
export function createStreamvaultProvider(http: ProviderHttp, now = Date.now) {
  return adapter('streamvault', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const id = String(ref.id).trim()
    if (!id) throw new ProviderFailure('empty')
    const path = ref.kind === 'series'
      ? `/api/embed-streams/tv/${encodeURIComponent(id)}/${ref.season}/${ref.episode}`
      : `/api/embed-streams/movie/${encodeURIComponent(id)}`
    let response
    try {
      response = await http(`${API}${path}`, { 'user-agent': userAgent, accept: 'application/json' }, signal)
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
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const item of parsed.data.streams ?? []) {
      const wrapper = String(item.url ?? '').trim()
      if (!wrapper) continue
      const url = unwrapDirect(wrapper)
      if (!url || seen.has(url)) continue
      const type = mediaType(url, typeof item.type === 'string' ? item.type : undefined) ?? 'hls'
      seen.add(url)
      const quality = String(item.quality ?? 'Auto').trim().slice(0, 24) || 'Auto'
      const height = heightOf(quality)
      let expiresAt: string
      try {
        expiresAt = accessDeadline(url, now())
      } catch {
        continue
      }
      sources.push({
        key: `streamvault:${sources.length}`,
        url,
        type,
        headers: {},
        expiresAt,
        language: 'original',
        qualityHint: quality,
        ...(height === undefined ? {} : { height }),
        subtitles: [],
      })
      if (sources.length >= MAX_SOURCES) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
