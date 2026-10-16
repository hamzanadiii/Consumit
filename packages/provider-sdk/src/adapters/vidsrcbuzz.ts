import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, userAgent, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const baseOrigin = 'https://vidsrc.buzz'
const apiEndpoint = `${baseOrigin}/pl/api.php`
const streamBase = `${baseOrigin}/pl/`
// Three servers: fewer parallel play legs means less tail latency against
// the resolver attempt budget, and three streams is the working set.
const maxServers = 3
const maxSubtitles = 20

const sessionSchema = z.object({
  type: z.string().min(1).max(32),
  id: z.string().min(1).max(128),
  s: z.number().int().min(0).max(100).optional(),
  e: z.number().int().min(0).max(10000).optional(),
  t: z.string().min(1).max(4096),
})

const serversSchema = z.object({
  status: z.string().max(16).optional(),
  more: z.unknown().optional(),
  servers: z.array(z.object({
    ref: z.string().min(1).max(4096),
    name: z.string().max(128).optional(),
  })).max(32).optional(),
})

const playSchema = z.object({
  url: z.string().min(1).max(4096).optional(),
  type: z.string().max(32).optional(),
})

const subsSchema = z.object({
  subs: z.array(z.object({
    label: z.string().max(128).optional(),
    ref: z.string().min(1).max(8192).optional(),
  })).max(64).optional(),
})

type ServersBody = z.infer<typeof serversSchema>

function decodeSubRef(ref: string): string | null {
  try {
    // Upstream subtitle tokens are payload.signature (payload first); full
    // JWTs carry the payload in the middle segment instead.
    const parts = ref.split('.')
    const payload = parts.length >= 3 ? parts[1] : parts[0]
    if (!payload) return null
    const parsed: unknown = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const file: unknown = (parsed as Record<string, unknown>).u
    return typeof file === 'string' && /^https?:\/\//i.test(file) ? file : null
  } catch {
    return null
  }
}

function slugify(value: string, fallback: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
  return slug || fallback
}

/** Port of the VidSrc Buzz lab recipe (own player/API stack, not the vsembed
 *  family): embed-page session `Q.t`, `a=sources` gathering with a bounded
 *  `wait` poll, per-server `a=play` manifests, and locally decoded `a=subs`
 *  caption tokens. Proxy/relay/iframe candidates are dropped — only direct
 *  browser-playable HTTPS media is returned. No page scripts are executed. */
export function createVidsrcbuzzProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidsrcbuzz', async (input, signal) => {
    const { ref } = input
    const embedUrl = ref.kind === 'series'
      ? `${baseOrigin}/embed/tv/${encodeURIComponent(String(ref.id))}/${ref.season}/${ref.episode}`
      : `${baseOrigin}/embed/movie/${encodeURIComponent(String(ref.id))}`

    const embed = await document(http, embedUrl, signal, { referer: `${baseOrigin}/`, accept: 'text/html' })
    if (new URL(embed.url).origin !== baseOrigin) throw new ProviderFailure('malformed')
    const sessionRaw = embed.text.match(/var\s+Q\s*=\s*(\{[^;]*?\});/s)?.[1]
    if (!sessionRaw) throw new ProviderFailure('malformed')
    let session: z.infer<typeof sessionSchema>
    try {
      const parsed: unknown = JSON.parse(sessionRaw)
      session = sessionSchema.parse(parsed)
    } catch {
      throw new ProviderFailure('malformed')
    }

    const sessionQuery = `type=${encodeURIComponent(session.type)}&id=${encodeURIComponent(session.id)}&s=${session.s ?? 0}&e=${session.e ?? 0}&t=${encodeURIComponent(session.t)}`
    const apiHeaders = { referer: embedUrl, accept: 'application/json' }

    const serverRefs = new Map<string, string>()
    const collectServers = (body: ServersBody | null) => {
      for (const server of body?.servers ?? []) {
        if (!serverRefs.has(server.ref)) serverRefs.set(server.ref, server.name ?? 'Server')
      }
    }
    const fetchServers = async (refresh: boolean): Promise<ServersBody | null> => {
      try {
        const response = await document(http, `${apiEndpoint}?a=sources&${sessionQuery}${refresh ? '&refresh=1' : ''}`, signal, apiHeaders)
        const parsed: unknown = JSON.parse(response.text)
        return serversSchema.parse(parsed)
      } catch {
        signal.throwIfAborted()
        return null
      }
    }

    // Bounded gather: re-poll while the upstream reports `wait`, then follow
    // up while it reports `more`. No delay between hops — each hop is already
    // bounded by the injected client, which also keeps resolution prompt.
    let current = await fetchServers(false)
    collectServers(current)
    for (let attempt = 0; attempt < 3 && current?.status === 'wait'; attempt++) {
      signal.throwIfAborted()
      current = await fetchServers(true)
      collectServers(current)
    }
    if (current?.more) {
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted()
        current = await fetchServers(true)
        collectServers(current)
        if (!current?.more) break
      }
    }
    const servers = [...serverRefs.entries()].slice(0, maxServers)
    if (!servers.length) throw new ProviderFailure('empty')

    const deliveryHeaders = { referer: embedUrl, origin: baseOrigin, 'user-agent': userAgent }
    // Subtitles ride concurrently with the play calls: both are independent
    // round trips and the resolver attempt budget is unforgiving. The void
    // catch marks the shared rejection handled when the play leg throws
    // first; the await below still surfaces subtitle failures normally.
    const subtitlesPromise = (async (): Promise<ProviderSource['subtitles']> => {
      const subtitles: ProviderSource['subtitles'] = []
      const seenRefs = new Set<string>()
      const seenFiles = new Set<string>()
      try {
        const response = await document(http, `${apiEndpoint}?a=subs&${sessionQuery}`, signal, apiHeaders)
        const parsed: unknown = JSON.parse(response.text)
        const subs = subsSchema.parse(parsed)
        for (const entry of subs.subs ?? []) {
          if (!entry.ref || seenRefs.has(entry.ref)) continue
          seenRefs.add(entry.ref)
          const file = decodeSubRef(entry.ref)
          if (!file || !file.startsWith('https://') || file.length > 4096) continue
          // WebVTT only; styled formats (srt/ass) travel no further.
          if (!/\.vtt([?#]|$)/i.test(file) || seenFiles.has(file)) continue
          seenFiles.add(file)
          const label = (entry.label || 'Unknown').slice(0, 64)
          subtitles.push({ id: `vidsrcbuzz-sub-${subtitles.length}`, label, language: label.slice(0, 32), url: file, format: 'vtt' })
          if (subtitles.length >= maxSubtitles) break
        }
      } catch {
        signal.throwIfAborted()
        // Subtitles stay best-effort; resolved media is unaffected.
      }
      return subtitles
    })()
    void subtitlesPromise.catch(() => undefined)
    const played = await Promise.all(servers.map(async ([serverRef, name]) => {
      try {
        const response = await document(http, `${apiEndpoint}?a=play&ref=${encodeURIComponent(serverRef)}&t=${encodeURIComponent(session.t)}`, signal, apiHeaders)
        const parsed: unknown = JSON.parse(response.text)
        const play = playSchema.parse(parsed)
        if (!play.url) return null
        let absolute: URL
        try {
          absolute = new URL(play.url, streamBase)
        } catch {
          return null
        }
        if (absolute.protocol !== 'https:') return null
        const kind = play.type ?? ''
        // Iframe/embed relays are never direct media.
        if (/iframe|embed/i.test(kind)) return null
        // Proxy/relay framing buries an inner URL in a query value; direct
        // media carries only opaque signed parameters.
        for (const value of absolute.searchParams.values()) {
          if (/^https?:\/\//i.test(value.trim())) return null
        }
        const path = absolute.pathname
        let type: ProviderSource['type']
        if (/\.m3u8$/i.test(path) || /m3u8|hls/i.test(kind)) type = 'hls'
        else if (/\.mpd$/i.test(path) || /dash|mpd/i.test(kind)) type = 'dash'
        else if (/\.mp4$/i.test(path) || /mp4/i.test(kind)) type = 'native'
        // The upstream's own /_stream masters carry no extension; the
        // manifest probe below confirms them before they become sources.
        else if (absolute.origin === baseOrigin && path.includes('_stream')) type = 'hls'
        else return null
        let expiresAt: string
        try {
          expiresAt = accessDeadline(absolute.href, now())
        } catch {
          return null
        }
        return { url: absolute.href, type, name, expiresAt }
      } catch {
        signal.throwIfAborted()
        return null
      }
    }))

    const candidates: ProviderSource[] = []
    const seen = new Set<string>()
    for (const hit of played) {
      if (!hit || seen.has(hit.url)) continue
      seen.add(hit.url)
      candidates.push({
        key: `vidsrcbuzz:${slugify(hit.name, 'server')}:${candidates.length}`,
        url: hit.url,
        type: hit.type,
        headers: deliveryHeaders,
        expiresAt: hit.expiresAt,
        language: 'original',
        qualityHint: 'Auto',
        subtitles: [],
      })
      if (candidates.length >= maxServers) break
    }
    if (!candidates.length) throw new ProviderFailure('empty')

    const verified = await verifiedPlaybackSources(http, candidates, signal)
    if (!verified.length) throw new ProviderFailure('empty')

    const subtitles = await subtitlesPromise
    return verified.map((source) => ({ ...source, subtitles }))
  })
}
