import { z } from 'zod'
import type { ProviderAdapter, ProviderInput, ProviderSource } from '../index.ts'
import { adapter, document, ProviderFailure, providerFailureFromOutcomes, providerOutcome, sourceAccess, userAgent, type ProviderHttp, type ProviderOutcome } from './http.ts'

const FRONT = 'https://embedmaster.link'
const PLAYER = 'https://embdmstrplayer.com'
const MEDIA_HOSTS = new Set(['perfectbussines.website'])
const PLAYER_HEADERS = { referer: PLAYER + '/', origin: PLAYER }
const PREFERRED_SERVER = 'yesmovies'

function isPreferredServer(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '').includes(PREFERRED_SERVER)
}

const configSchema = z.object({
  ticket: z.string().min(1).max(2048),
  pk: z.string().regex(/^[0-9a-f]{16,128}$/i),
  scrapeToken: z.string().min(1).max(2048),
  feedUrl: z.string().min(1).max(2048),
  feedUrlBackup: z.string().max(2048).optional(),
  resolveUrl: z.string().min(1).max(512),
  order: z.array(z.string().max(64)).max(32),
  kinds: z.record(z.string().max(64), z.string().max(16)),
  obfHosts: z.array(z.string().max(253)).max(8).optional(),
})
const feedSchema = z.object({
  source_type: z.union([z.string().max(64), z.number()]),
  source_name: z.string().max(80).default('Server'),
  source_quality: z.string().max(32).default('Auto'),
  source_url: z.string().min(1).max(8192),
})
const resolveSchema = z.object({
  ok: z.boolean().optional(),
  kind: z.string().max(32).optional(),
  type: z.string().max(16).optional(),
  url: z.string().min(1).max(4096).optional(),
  subtitles: z.array(z.unknown()).max(32).optional(),
})

type Config = z.infer<typeof configSchema>
type FeedServer = z.infer<typeof feedSchema>

function setCookieValues(headers?: Headers): string[] {
  if (!headers) return []
  const extended = headers as Headers & { getSetCookie?: () => string[] }
  return extended.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
}

function sid(headers?: Headers) {
  for (const value of setCookieValues(headers)) {
    const match = /^sid=([^;]+)/.exec(value)
    if (match) return match[1]!
  }
  return ''
}

function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function decodeBase64Url(value: string) {
  const normalized = value.trim().replaceAll('-', '+').replaceAll('_', '/')
  return decodeBase64(normalized + '='.repeat((4 - normalized.length % 4) % 4))
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function safeMediaUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && !url.hash
      && MEDIA_HOSTS.has(url.hostname.toLowerCase())
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function quality(value: string) {
  const label = value.trim().slice(0, 24)
  const upper = label.toUpperCase()
  if (/4K|UHD|2160/.test(upper)) return { height: 2160, qualityHint: '2160p' }
  if (/FULL\s*HD|1080/.test(upper)) return { height: 1080, qualityHint: '1080p' }
  if (/\bHD\b|720/.test(upper)) return { height: 720, qualityHint: '720p' }
  if (/\bSD\b|480/.test(upper)) return { height: 480, qualityHint: '480p' }
  const match = label.match(/(?:^|\D)(\d{3,4})(?:p|$)/i)
  const height = match ? Number(match[1]) : undefined
  return height && height >= 144 && height <= 4320 ? { height, qualityHint: height + 'p' } : { qualityHint: label || 'Auto' }
}

function decryptPageConfig(html: string): Config | undefined {
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1] ?? '')
  const inline = scripts.find(script => script.includes('atob(') && script.length < 10_000 && /\[[\d,]+\]/.test(script))
  if (!inline) return undefined
  const params = /"([^"]+)",(_[a-zA-Z0-9]+)=\[([0-9,]+)\],(_[a-zA-Z0-9]+)=(\d+);/.exec(inline)
  const encoded = /var _[a-zA-Z0-9]+="([^"]+)"/.exec(inline)?.[1]
  if (!params || !encoded || encoded.length > 20_000) return undefined
  const key = params[3]!.split(',').map(Number)
  if (!key.length || key.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return undefined
  const seed = Number(params[5])
  let raw: Uint8Array
  try {
    raw = decodeBase64(encoded)
  } catch {
    return undefined
  }
  const plain = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index++) plain[index] = raw[index]! ^ ((seed + key[index % key.length]! + index) & 255)
  try {
    const text = decodeUtf8(plain).replace(/^window\.__EM_PLAYER__\s*=\s*/, '').replace(/;?\s*$/, '')
    const parsed = configSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function feedUrl(base: string, token: string) {
  const url = new URL(base)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new ProviderFailure('malformed')
  return base + encodeURIComponent(token)
}

function resolveUrl(path: string, source: string) {
  const url = new URL(path, PLAYER)
  if (url.origin !== PLAYER || url.username || url.password || url.hash) throw new ProviderFailure('malformed')
  url.searchParams.set('src', source)
  return url.href
}

async function sha256(value: Uint8Array) {
  const bytes = new Uint8Array(value.length)
  bytes.set(value)
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes.buffer))
}

async function decryptResolve(text: string, pk: string): Promise<z.infer<typeof resolveSchema>> {
  const raw = decodeBase64Url(text)
  if (raw.length <= 16 || raw.length > 512 * 1024) throw new Error('Invalid ciphertext.')
  const key = Uint8Array.from(pk.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)))
  if (key.length < 8) throw new Error('Invalid key.')
  const iv = raw.subarray(0, 16)
  const ciphertext = raw.subarray(16)
  const plain = new Uint8Array(ciphertext.length)
  for (let offset = 0, counter = 0; offset < ciphertext.length; offset += 32, counter++) {
    const input = new Uint8Array(key.length + iv.length + 4)
    input.set(key)
    input.set(iv, key.length)
    new DataView(input.buffer).setUint32(key.length + iv.length, counter, false)
    const stream = await sha256(input)
    for (let index = 0; index < Math.min(32, ciphertext.length - offset); index++) plain[offset + index] = ciphertext[offset + index]! ^ stream[index]!
  }
  return resolveSchema.parse(JSON.parse(decodeUtf8(plain)))
}

export function createEmbedmasterProvider(http: ProviderHttp, now: () => number = Date.now): ProviderAdapter {
  async function openSession(input: ProviderInput, signal: AbortSignal) {
    const path = input.ref.kind === 'movie'
      ? `/movie/${input.ref.id}`
      : `/tv/${input.ref.id}/${input.ref.season ?? 1}/${input.ref.episode ?? 1}`
    const front = await document(http, FRONT + path, signal, { 'user-agent': userAgent, referer: FRONT + '/' })
    const tokenUrl = front.url
    if (new URL(tokenUrl).hostname !== 'embdmstrplayer.com') throw new ProviderFailure('empty')

    const response = await document(http, tokenUrl, signal, {
      'user-agent': userAgent,
      referer: FRONT + '/',
      origin: PLAYER,
      'content-type': 'application/x-www-form-urlencoded',
    }, { method: 'POST', body: 'tr=' })
    if (response.text.length > 1024 * 1024) throw new ProviderFailure('malformed')
    const config = decryptPageConfig(response.text)
    if (!config) throw new ProviderFailure('malformed')
    const cookie = sid(response.headers) || sid(front.headers)
    return { config, cookie, tokenUrl }
  }

  async function fetchFeed(config: Config, cookie: string, tokenUrl: string, signal: AbortSignal) {
    const outcomes: ProviderOutcome[] = []
    for (const base of [config.feedUrl, config.feedUrlBackup].filter((value): value is string => Boolean(value))) {
      signal.throwIfAborted()
      try {
        const response = await document(http, feedUrl(base, config.scrapeToken), signal, {
          'user-agent': userAgent,
          accept: 'application/x-ndjson',
          referer: tokenUrl,
          origin: PLAYER,
          ...(cookie ? { cookie: `sid=${cookie}` } : {}),
        })
        const servers: FeedServer[] = []
        for (const line of response.text.split('\n')) {
          if (!line.trim()) continue
          try {
            const parsed = feedSchema.safeParse(JSON.parse(line))
            if (parsed.success) servers.push(parsed.data)
          } catch {
            continue
          }
          if (servers.length >= 64) break
        }
        if (servers.length) return servers
        outcomes.push({ code: 'empty' })
      } catch (error) {
        if (signal.aborted) throw error
        const outcome = providerOutcome(error)
        outcomes.push(outcome)
        if (outcome.code === 'blocked' || outcome.code === 'rate_limited') throw error
      }
    }
    if (outcomes.length) throw providerFailureFromOutcomes(outcomes)
    return []
  }

  async function resolveServer(config: Config, cookie: string, tokenUrl: string, server: FeedServer, signal: AbortSignal) {
    const url = resolveUrl(config.resolveUrl, server.source_url)
    const response = await document(http, url, signal, {
      'user-agent': userAgent,
      referer: tokenUrl,
      origin: PLAYER,
      'x-em-player': '1',
      'x-em-ticket': config.ticket,
      accept: '*/*',
      ...(cookie ? { cookie: `sid=${cookie}` } : {}),
    })
    try {
      return await decryptResolve(response.text, config.pk)
    } catch {
      try {
        const parsed = resolveSchema.safeParse(JSON.parse(response.text))
        return parsed.success ? parsed.data : undefined
      } catch {
        return undefined
      }
    }
  }

  return adapter('embedmaster', async (input, signal) => {
    if (input.ref.kind !== 'movie' && input.ref.kind !== 'series') throw new ProviderFailure('empty')
    const { config, cookie, tokenUrl } = await openSession(input, signal)
    const servers = await fetchFeed(config, cookie, tokenUrl, signal)
    if (!servers.length) throw new ProviderFailure('empty')

    const directTypes = new Set(Object.entries(config.kinds).filter(([, kind]) => kind === 'direct').map(([type]) => type))
    const rank = (type: string) => {
      const index = config.order.indexOf(type)
      return index < 0 ? 9999 : index
    }
    const directs = servers
      .filter(server => directTypes.has(String(server.source_type)))
      .sort((a, b) => Number(isPreferredServer(b.source_name)) - Number(isPreferredServer(a.source_name))
        || rank(String(a.source_type)) - rank(String(b.source_type)))

    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    const outcomes: ProviderOutcome[] = []
    for (const [index, server] of directs.entries()) {
      signal.throwIfAborted()
      if (sources.length >= 6) break
      const resolved = await resolveServer(config, cookie, tokenUrl, server, signal).catch(error => {
        if (signal.aborted) throw error
        const outcome = providerOutcome(error)
        outcomes.push(outcome)
        if (outcome.code === 'blocked' || outcome.code === 'rate_limited') throw error
        return undefined
      })
      if (!resolved?.url) continue
      const url = safeMediaUrl(resolved.url)
      if (!url || seen.has(url.href)) continue
      let access: ReturnType<typeof sourceAccess>
      try {
        access = sourceAccess(url.href, now())
      } catch {
        continue
      }
      const mediaQuality = quality(server.source_quality)
      const preferred = isPreferredServer(server.source_name)
      const path = url.pathname.toLowerCase()
      const type = path.endsWith('.mp4') ? 'native'
        : path.endsWith('.m3u8') ? 'hls'
        : resolved.type?.toLowerCase() === 'mp4' ? 'native'
        : 'hls'
      seen.add(url.href)
      sources.push({
        key: ['embedmaster', index, mediaQuality.qualityHint, sources.length].join(':'),
        serverName: server.source_name.slice(0, 80),
        priority: preferred ? 100 : 0,
        url: url.href,
        type,
        ...(mediaQuality.height ? { height: mediaQuality.height } : {}),
        qualityHint: mediaQuality.qualityHint,
        qualityGroup: `embedmaster-${index}`,
        ...access,
        language: 'original',
        headers: PLAYER_HEADERS,
        subtitles: [],
      })
    }
    if (!sources.length) {
      if (outcomes.length) throw providerFailureFromOutcomes(outcomes)
      throw new ProviderFailure('empty')
    }
    return sources
  })
}
