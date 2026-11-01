import { z } from 'zod'
import type { ProviderAdapter, ProviderInput, ProviderSource } from '../index.ts'
import { assertHlsManifest, parseHlsReferenceEntries } from '../manifest.ts'
import { adapter, document, masterVariantHeights, providerFailureFromOutcomes, providerOutcome, ProviderFailure, sourceAccess, type ProviderHttp } from './http.ts'

const SITE = 'https://zenox.lol'
const SESSION_URL = `${SITE}/api/v1/playback/session`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const SESSION_HEADERS = {
  'user-agent': UA,
  accept: 'application/json',
  origin: SITE,
  referer: `${SITE}/`,
  'content-type': 'application/json',
}
const MEDIA_HEADERS = { 'user-agent': UA, accept: '*/*', referer: `${SITE}/` }
const FAMILIES = ['delta', 'temporary', 'primary', 'sydney'] as const
const MEDIA_HOSTS = ['zenox.lol', 'bub.zenox.lol', 'r10.zenox.lol'] as const

const sessionResponseSchema = z.object({
  success: z.boolean(),
  streamUrl: z.string().min(1).max(4096).optional(),
}).passthrough()

function mediaIdentity(input: ProviderInput) {
  const { ref } = input
  const mediaId = Number(ref.id)
  if (!Number.isSafeInteger(mediaId) || mediaId < 1) throw new ProviderFailure('empty')
  if (ref.kind === 'movie') return { mediaType: 'movie' as const, path: `/movie/${mediaId}`, mediaId }
  if (ref.kind === 'series' && ref.season !== undefined && ref.episode !== undefined) {
    if (!Number.isSafeInteger(ref.season) || ref.season < 0 || !Number.isSafeInteger(ref.episode) || ref.episode < 1) {
      throw new ProviderFailure('empty')
    }
    return {
      mediaType: 'tv' as const,
      path: `/tv/${mediaId}/${ref.season}/${ref.episode}`,
      mediaId,
      season: ref.season,
      episode: ref.episode,
    }
  }
  throw new ProviderFailure('empty')
}

function checkedStreamUrl(value: string, input: ProviderInput, serverIndex: number, now: () => number) {
  if (!value.startsWith('/') || value.startsWith('//')) throw new ProviderFailure('blocked')
  let url: URL
  try { url = new URL(value, SITE) } catch { throw new ProviderFailure('malformed') }
  const identity = mediaIdentity(input)
  const family = FAMILIES[serverIndex]
  if (!family) throw new ProviderFailure('blocked')
  const signatures = url.searchParams.getAll('s')
  const expiries = url.searchParams.getAll('t')
  const expiry = Number(expiries[0]) * 1000
  if (url.origin !== SITE || url.username || url.password || url.port || url.hash
      || url.pathname !== `/api/s/${family}${identity.path}`
      || url.searchParams.size !== 2 || signatures.length !== 1 || expiries.length !== 1
      || !/^[a-f0-9]{8}$/i.test(signatures[0] ?? '')
      || !/^\d{10}$/.test(expiries[0] ?? '')
      || !Number.isSafeInteger(expiry) || expiry <= now() + 30_000 || expiry > now() + 60 * 60_000) {
    throw new ProviderFailure('blocked')
  }
  return { url, expiry, family }
}

function sourceKey(input: ProviderInput, family: string, height: number) {
  const { ref } = input
  return ['zenox', ref.kind, ref.id, ref.season ?? '', ref.episode ?? '', family, height].join(':')
}

async function resolveLane(
  http: ProviderHttp,
  input: ProviderInput,
  signal: AbortSignal,
  serverIndex: number,
  now: () => number,
  allowedHosts: ReadonlySet<string>,
): Promise<ProviderSource> {
  const identity = mediaIdentity(input)
  const request = await document(http, SESSION_URL, signal, SESSION_HEADERS, {
    method: 'POST',
    body: JSON.stringify({
      mediaType: identity.mediaType,
      mediaId: identity.mediaId,
      tmdbId: identity.mediaId,
      ...(identity.mediaType === 'tv' ? { season: identity.season, episode: identity.episode } : {}),
      serverIndex,
    }),
  })
  const endpoint = new URL(request.url)
  if (endpoint.origin !== SITE || endpoint.pathname !== '/api/v1/playback/session' || endpoint.search || endpoint.hash) {
    throw new ProviderFailure('blocked')
  }
  if (request.text.length > 64 * 1024) throw new ProviderFailure('malformed')
  let decoded: unknown
  try { decoded = JSON.parse(request.text) } catch { throw new ProviderFailure('malformed') }
  const parsed = sessionResponseSchema.safeParse(decoded)
  if (!parsed.success) throw new ProviderFailure('malformed')
  if (!parsed.data.success || !parsed.data.streamUrl) throw new ProviderFailure('empty')

  const session = checkedStreamUrl(parsed.data.streamUrl, input, serverIndex, now)
  const master = await document(http, session.url.href, signal, MEDIA_HEADERS)
  const finalUrl = new URL(master.url)
  if (finalUrl.href !== session.url.href || !allowedHosts.has(finalUrl.hostname.toLowerCase())) {
    throw new ProviderFailure('blocked')
  }
  if (master.text.length > 1024 * 1024 || !master.text.trimStart().startsWith('#EXTM3U')
      || assertHlsManifest(master.text) !== 'master') throw new ProviderFailure('malformed')

  let references: Array<{ url: string; media: boolean }>
  try { references = parseHlsReferenceEntries(master.text, session.url.href) } catch { throw new ProviderFailure('malformed') }
  for (const reference of references) {
    let url: URL
    try { url = new URL(reference.url) } catch { throw new ProviderFailure('malformed') }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
        || !allowedHosts.has(url.hostname.toLowerCase())) throw new ProviderFailure('blocked')
  }
  const heights = masterVariantHeights(master.text)
  if (!heights?.length) throw new ProviderFailure('malformed')
  const height = Math.max(...heights)
  return {
    key: sourceKey(input, session.family, height),
    serverName: 'Zenox',
    url: session.url.href,
    type: 'hls',
    height,
    qualityHint: `${height}p`,
    ...sourceAccess(session.url.href, now(), session.expiry),
    language: 'original',
    headers: MEDIA_HEADERS,
    subtitles: [],
  }
}

export function createZenoxProvider(
  http: ProviderHttp,
  now: () => number = Date.now,
  options: { mediaHosts?: readonly string[] } = {},
): ProviderAdapter {
  const allowedHosts = new Set((options.mediaHosts ?? MEDIA_HOSTS).map(host => host.toLowerCase()))
  return adapter('zenox', async (input, signal) => {
    if (input.ref.kind !== 'movie' && input.ref.kind !== 'series') throw new ProviderFailure('empty')
    if (!allowedHosts.has('zenox.lol')) throw new ProviderFailure('blocked')

    const failures: unknown[] = []
    for (let round = 0; round < 2; round++) {
      const laneController = new AbortController()
      const laneSignal = AbortSignal.any([signal, laneController.signal])
      const attempts = FAMILIES.map((_, serverIndex) => resolveLane(http, input, laneSignal, serverIndex, now, allowedHosts)
        .then(source => {
          laneController.abort()
          return source
        })
        .catch(error => {
          failures.push(error)
          throw error
        }))
      try {
        return [await Promise.any(attempts)]
      } catch {
        signal.throwIfAborted()
      }
    }
    throw providerFailureFromOutcomes(failures.map(providerOutcome))
  })
}
