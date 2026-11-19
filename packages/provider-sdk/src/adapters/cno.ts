import { z } from 'zod'
import type { ProviderAdapter, ProviderInput, ProviderSource } from '../index.ts'
import { assertHlsManifest, parseHlsReferenceEntries } from '../manifest.ts'
import { adapter, document, masterVariantHeights, ProviderFailure, sourceAccess, type ProviderHttp } from './http.ts'

const SITE = 'https://cno.to'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REQUEST_HEADERS = { 'user-agent': UA, accept: '*/*', referer: `${SITE}/` }
const MEDIA_HOSTS = [
  'cno.to',
  'v.prismdesk.top',
  'v.lumenbox.top',
  'v.neonvase.top',
  'v.starlantern.top',
  'v.haloshade.top',
  'v.sparkwick.top',
] as const

const sourceRowsSchema = z.array(z.object({
  kind: z.string().max(16),
  own: z.boolean().optional(),
  label: z.string().max(80).optional(),
  url: z.string().min(1).max(4096),
}).passthrough()).max(32)

function pathFor(input: ProviderInput) {
  const { ref } = input
  if (ref.kind === 'movie') return `/api/sources/movie/${ref.id}`
  if (ref.kind === 'series' && ref.season !== undefined && ref.episode !== undefined) {
    return `/api/sources/tv/${ref.id}/${ref.season}/${ref.episode}`
  }
  throw new ProviderFailure('empty')
}

function ownHlsUrl(value: string, input: ProviderInput) {
  let url: URL
  try { url = new URL(value, SITE) } catch { return undefined }
  const expected = input.ref.kind === 'movie'
    ? `/api/s/21/movie/${input.ref.id}`
    : `/api/s/21/tv/${input.ref.id}/${input.ref.season}/${input.ref.episode}`
  if (url.origin !== SITE || url.username || url.password || url.port || url.pathname !== expected
      || url.searchParams.size !== 1 || url.searchParams.get('v') !== '3' || url.hash) return undefined
  return url
}

function sourceKey(input: ProviderInput, height: number) {
  const { ref } = input
  return ['cno', ref.kind, ref.id, ref.season ?? '', ref.episode ?? '', height].join(':')
}

export function createCnoProvider(
  http: ProviderHttp,
  now: () => number = Date.now,
  options: { mediaHosts?: readonly string[] } = {},
): ProviderAdapter {
  const allowedHosts = new Set((options.mediaHosts ?? MEDIA_HOSTS).map(host => host.toLowerCase()))
  return adapter('cno', async (input, signal) => {
    if (input.ref.kind !== 'movie' && input.ref.kind !== 'series') throw new ProviderFailure('empty')
    if (!allowedHosts.has('cno.to')) throw new ProviderFailure('blocked')

    const listing = await document(http, `${SITE}${pathFor(input)}`, signal, REQUEST_HEADERS)
    const listingUrl = new URL(listing.url)
    if (listingUrl.origin !== SITE || listingUrl.username || listingUrl.password || listingUrl.port) throw new ProviderFailure('blocked')
    if (listing.text.length > 256 * 1024) throw new ProviderFailure('malformed')
    let decoded: unknown
    try { decoded = JSON.parse(listing.text) } catch { throw new ProviderFailure('malformed') }
    const parsed = sourceRowsSchema.safeParse(decoded)
    if (!parsed.success) throw new ProviderFailure('malformed')
    const candidates = parsed.data
      .filter(row => row.kind === 'hls' && row.own === true)
      .map(row => ({ url: ownHlsUrl(row.url, input), label: row.label?.trim().slice(0, 80) || 'Server 21' }))
      .filter((row): row is { url: URL; label: string } => Boolean(row.url))
    if (!candidates.length) throw new ProviderFailure('empty')

    let lastFailure: unknown
    for (const candidate of candidates.slice(0, 4)) {
      signal.throwIfAborted()
      try {
        const master = await document(http, candidate.url.href, signal, REQUEST_HEADERS)
        if (master.text.length > 1024 * 1024 || !master.text.trimStart().startsWith('#EXTM3U')) {
          throw new ProviderFailure('malformed')
        }
        const finalUrl = new URL(master.url)
        if (finalUrl.origin !== SITE || finalUrl.username || finalUrl.password || finalUrl.port) throw new ProviderFailure('blocked')
        if (assertHlsManifest(master.text) !== 'master') throw new ProviderFailure('malformed')
        const heights = masterVariantHeights(master.text)
        if (!heights?.length) throw new ProviderFailure('malformed')
        let references: Array<{ url: string; media: boolean }>
        try { references = parseHlsReferenceEntries(master.text, candidate.url.href) } catch { throw new ProviderFailure('malformed') }
        if (references.some(reference => {
          const url = new URL(reference.url)
          return url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())
        })) throw new ProviderFailure('blocked')
        const height = Math.max(...heights)
        const url = candidate.url.href
        const source: ProviderSource = {
          key: sourceKey(input, height),
          serverName: `CNO ${candidate.label}`,
          url,
          type: 'hls',
          height,
          qualityHint: `${height}p`,
          qualityGroup: 'cno-server-21',
          ...sourceAccess(url, now()),
          language: 'original',
          headers: { referer: `${SITE}/`, 'user-agent': UA },
          subtitles: [],
        }
        return [source]
      } catch (error) {
        if (signal.aborted) throw error
        lastFailure = error
      }
    }
    if (lastFailure instanceof ProviderFailure) throw lastFailure
    throw new ProviderFailure('empty')
  })
}
