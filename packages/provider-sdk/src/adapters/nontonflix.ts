import { z } from 'zod'
import type { ProviderAdapter, ProviderInput, ProviderSource } from '../index.ts'
import { adapter, ProviderFailure, sourceAccess, userAgent, type ProviderHttp } from './http.ts'

const BASE = 'https://nontonflix.com'
const SESSION = BASE + '/api/v1/playback/sessions'
const MEDIA_HOSTS = new Set(['media.nontonflix.com'])
const NAV_HEADERS: Record<string, string> = {
  'user-agent': userAgent,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
}
const API_HEADERS: Record<string, string> = {
  'user-agent': userAgent,
  'accept-language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  referer: BASE + '/',
  origin: BASE,
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-dest': 'empty',
}
/** Ranked first-party servers, used only when the automatic pick misses. */
const RANKED = ['s98a39983f32', 'sd76852fd885', 's9fdf7cb65e6', 's1b29a77bd90'] as const

const sourceSchema = z.object({
  url: z.string().min(1).max(4096),
  format: z.string().max(16).optional(),
  quality: z.union([z.string().max(32), z.number().finite()]).optional(),
  provider: z.string().max(64).optional(),
})
const sessionSchema = z.object({
  sourceId: z.string().max(64).optional(),
  sourceName: z.string().max(80).optional(),
  sources: z.array(sourceSchema).max(32).optional(),
})

type Session = z.infer<typeof sessionSchema>

function setCookiePairs(headers?: Headers): string[] {
  if (!headers) return []
  const extended = headers as Headers & { getSetCookie?: () => string[] }
  const values = extended.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
  const pairs: string[] = []
  for (const value of values) {
    const pair = value.split(';')[0]?.trim()
    if (pair && /^[^=;]+=[^;]*$/.test(pair) && pair.length <= 1024 && !/[\r\n]/.test(pair)) pairs.push(pair)
  }
  return pairs
}

function mergeCookies(jar: string, pairs: readonly string[]) {
  const values = new Map<string, string>()
  for (const pair of [...jar.split('; ').filter(Boolean), ...pairs]) {
    const index = pair.indexOf('=')
    if (index > 0) values.set(pair.slice(0, index), pair)
  }
  return [...values.values()].join('; ')
}

function quality(value: string | number | undefined) {
  const label = String(value ?? '').trim().slice(0, 24)
  const upper = label.toUpperCase()
  if (/4K|UHD|2160/.test(upper)) return { height: 2160, qualityHint: '2160p' }
  const match = label.match(/(?:^|\D)(\d{3,4})(?:p|$)/i) ?? label.match(/^(\d{3,4})$/)
  const height = match ? Number(match[1]) : undefined
  if (height && height >= 144 && height <= 4320) return { height, qualityHint: height + 'p' }
  return { qualityHint: label || 'Auto' }
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

function buildBody(input: ProviderInput, providerId?: string) {
  const body: Record<string, unknown> = { titleId: `${input.ref.kind === 'movie' ? 'movie' : 'tv'}-${input.ref.id}` }
  if (input.ref.kind === 'series') {
    const season = input.ref.season ?? 1
    const episode = input.ref.episode ?? 1
    body.season = season
    body.episode = episode
  }
  if (providerId) body.providerId = providerId
  return body
}

function parseSession(text: string): { session?: Session; error?: string } {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let value: unknown
    try {
      value = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (!value || typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    if (record.type === 'result') {
      const parsed = sessionSchema.safeParse(record.session)
      if (parsed.success) return { session: parsed.data }
      throw new ProviderFailure('malformed')
    }
    if (record.type === 'error') return { error: typeof record.error === 'string' ? record.error.slice(0, 160) : 'source error' }
  }
  return {}
}

function makeSources(session: Session, jar: string, now: number): ProviderSource[] {
  const sources: ProviderSource[] = []
  const seen = new Set<string>()
  for (const raw of session.sources ?? []) {
    if (session.sourceId && raw.provider && raw.provider !== session.sourceId) continue
    const url = safeMediaUrl(raw.url)
    if (!url) continue
    const mediaQuality = quality(raw.quality)
    if (seen.has(url.href)) continue
    let access: ReturnType<typeof sourceAccess>
    try {
      access = sourceAccess(url.href, now)
    } catch {
      continue
    }
    const format = raw.format?.toLowerCase()
    seen.add(url.href)
    sources.push({
      key: ['nontonflix', raw.provider ?? 'auto', mediaQuality.qualityHint, sources.length].join(':'),
      ...(session.sourceName ? { serverName: session.sourceName.slice(0, 80) } : {}),
      url: url.href,
      type: format === 'mp4' ? 'native' : 'hls',
      ...(mediaQuality.height ? { height: mediaQuality.height } : {}),
      qualityHint: mediaQuality.qualityHint,
      qualityGroup: 'nontonflix',
      ...access,
      language: 'original',
      headers: { cookie: jar, referer: BASE + '/', 'user-agent': userAgent },
      subtitles: [],
    })
    if (sources.length >= 8) break
  }
  return sources
}

export function createNontonflixProvider(http: ProviderHttp, now: () => number = Date.now): ProviderAdapter {
  let jar = ''
  let jarVersion = 0
  let bootstrapping: Promise<string> | undefined

  function updateJar(pairs: readonly string[]) {
    const updated = mergeCookies(jar, pairs)
    if (updated !== jar) {
      jar = updated
      jarVersion += 1
    }
  }

  async function bootstrap(signal: AbortSignal) {
    const response = await http(BASE + '/', NAV_HEADERS, signal)
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
    updateJar(setCookiePairs(response.headers))
    // A successful re-bootstrap is a new credential generation even if the
    // server reissues the same cookie value.
    jarVersion += 1
    return jar
  }

  async function ensureJar(signal: AbortSignal, force = false, rejectedVersion?: number) {
    // A slower request can return 401 after a sibling has already refreshed
    // the shared jar. Reuse that newer generation instead of refreshing twice.
    if (force && rejectedVersion !== undefined && rejectedVersion !== jarVersion && jar) return jar
    if (jar && !force) return jar
    bootstrapping ??= bootstrap(signal).finally(() => { bootstrapping = undefined })
    return bootstrapping
  }

  async function postSession(body: Record<string, unknown>, signal: AbortSignal) {
    const requestVersion = jarVersion
    const headers = { ...API_HEADERS, accept: 'application/x-ndjson, application/json', 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) }
    const response = await http(SESSION, headers, signal, { method: 'POST', body: JSON.stringify(body) })
    updateJar(setCookiePairs(response.headers))
    if (response.status === 401) return { unauthorized: true as const, requestVersion }
    if (response.status === 404) throw new ProviderFailure('empty')
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
    return parseSession(response.text)
  }

  return adapter('nontonflix', async (input, signal) => {
    if (input.ref.kind !== 'movie' && input.ref.kind !== 'series') throw new ProviderFailure('empty')
    if (!(await ensureJar(signal))) throw new ProviderFailure('unavailable')

    const attempts: Array<Record<string, unknown>> = [buildBody(input), ...RANKED.map(providerId => buildBody(input, providerId))]
    let session: Session | undefined
    let lastError: string | undefined
    for (const [index, body] of attempts.entries()) {
      signal.throwIfAborted()
      try {
        let outcome = await postSession(body, signal)
        if ('unauthorized' in outcome) {
          if (!(await ensureJar(signal, true, outcome.requestVersion))) throw new ProviderFailure('unavailable')
          outcome = await postSession(body, signal)
        }
        if ('session' in outcome && outcome.session) {
          session = outcome.session
          break
        }
        if ('error' in outcome) lastError = outcome.error
      } catch (error) {
        if (signal.aborted) throw error
        if (error instanceof ProviderFailure && error.code === 'empty') throw error
        if (error instanceof ProviderFailure && error.code === 'malformed' && index === 0) throw error
        lastError = error instanceof Error ? error.message : 'session failed'
      }
    }
    if (!session) throw new ProviderFailure(lastError ? 'unavailable' : 'empty')

    const sources = makeSources(session, jar, now())
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
