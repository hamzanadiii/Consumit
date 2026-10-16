import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { WecollegeMetadataResolver } from './wecollege.ts'
import { sourceAccess, adapter, document, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://bingebang.st'
const salt = '9e2b7c41a0f6d85b3c1e7a94f25d0b86'
const searchSchema = z.object({ results: z.array(z.object({ title: z.string().max(256).optional(), name: z.string().max(256).optional(), year: z.coerce.number().optional(), play_url: z.string().max(4096).optional() })).max(200) })
const serversSchema = z.object({ servers: z.array(z.object({ id: z.string().max(128), source_url: z.string().max(4096) })).max(32) })
const resolvedSchema = z.object({ ok: z.boolean(), url: z.string().max(4096).optional(), type: z.string().max(32).optional(), quality: z.string().max(32).optional(),
  subtitles: z.array(z.object({ url: z.string().max(4096), label: z.string().max(64).optional(), lang: z.string().max(32).optional(), language: z.string().max(32).optional() })).max(32).optional() })
const envelopeSchema = z.object({ enc: z.string().max(1_000_000) })

export function decodeBingeResponse(enc: string, ticket: string): unknown {
  const raw = Buffer.from(enc, 'base64url')
  if (raw.length <= 16) throw new ProviderFailure('malformed')
  const key = createHash('sha256').update(salt + ticket).digest()
  const block = Buffer.concat([key, raw.subarray(0, 16), Buffer.alloc(4)])
  const plain = Buffer.alloc(raw.length - 16)
  for (let offset = 0; offset < plain.length; offset += 32) {
    block.writeUInt32BE(offset / 32, 48)
    const stream = createHash('sha256').update(block).digest()
    for (let index = 0; index < Math.min(32, plain.length - offset); index++) plain[offset + index] = raw[offset + index + 16]! ^ stream[index]!
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain))
}

/** Search by exact catalog title/year: BingeBang's internal IDs are not TMDB IDs.
 * Only YMovies is selected. Page byte arrays are decoded as data, never executed. */
export function createBingeBangYMoviesProvider(http: ProviderHttp, metadata: WecollegeMetadataResolver, now = Date.now) {
  return adapter('bingebangymovies', async ({ ref }, signal) => {
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const meta = await metadata(ref, signal)
    const kind = ref.kind === 'movie' ? 'movie' : 'tv'
    const search = await document(http, `${origin}/api/search/${kind}?query=${encodeURIComponent(meta.title)}`, signal, { referer: `${origin}/` })
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const match = searchSchema.parse(JSON.parse(search.text)).results.find(result => normalize(result.title ?? result.name ?? '') === normalize(meta.title) && result.year === meta.year)
    if (!match?.play_url) throw new ProviderFailure('empty')
    const play = new URL(match.play_url, origin)
    if (play.origin !== origin || play.search || play.hash || !new RegExp(`^/${kind}/play/[a-z0-9-]+(?:/\\d+/\\d+)?$`, 'i').test(play.pathname)) throw new ProviderFailure('malformed')
    if (ref.kind === 'series') play.pathname = `${play.pathname.replace(/\/\d+\/\d+$/, '')}/${ref.season}/${ref.episode}`
    const page = await document(http, play.href, signal, { referer: `${origin}/` })
    const inline = [...page.text.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]!).find(text => /k=\[/.test(text))
    const parseBytes = (text: string | undefined) => text?.split(',').map(byte => Number(byte.trim()))
    const key = parseBytes(inline?.match(/k=\[([\d,\s]+)\]/)?.[1])
    const data = parseBytes(inline?.match(/d=\[([\d,\s]+)\]/)?.[1])
    if (!key?.length || key.length > 256 || !data?.length || data.length > 64_000 || [...key, ...data].some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new ProviderFailure('malformed')
    const config = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(data, (byte, index) => byte ^ key[index % key.length]!))
    const ticket = config.match(/ticket:\s*"([^"\r\n]{1,512})"/)?.[1]
    if (!ticket) throw new ProviderFailure('malformed')
    const apiHeaders = { referer: `${origin}/`, origin, 'x-bb-player': '1', 'x-bb-ticket': ticket }
    const api = async (path: string) => {
      const response = await document(http, `${origin}${path}`, signal, apiHeaders)
      return decodeBingeResponse(envelopeSchema.parse(JSON.parse(response.text)).enc, ticket)
    }
    const servers = serversSchema.parse(await api('/api/player/sources')).servers.filter(server => /^premium-ymovies-\d+$/i.test(server.id))
    if (!servers.length) throw new ProviderFailure('empty')
    const result = resolvedSchema.parse(await api(`/api/player/resolve?src=${encodeURIComponent(servers[0]!.source_url)}`))
    if (!result.ok || !result.url) throw new ProviderFailure('empty')
    const url = new URL(result.url)
    if (url.protocol !== 'https:' || url.hostname !== 'os.bingebangstream.online' || result.type !== 'hls') throw new ProviderFailure('malformed')
    const height = /2160|4k/i.test(result.quality ?? '') ? 2160 : Number(result.quality?.match(/\d{3,4}/)?.[0]) || undefined
    return [{ key: 'bingebangymovies:ymovies', url: url.href, type: 'hls', language: 'original',
      headers: { referer: `${origin}/` }, ...sourceAccess(url.href, now()), qualityHint: height ? `${height}p` : 'Auto', ...(height ? { height } : {}),
      subtitles: (result.subtitles ?? []).map((track, index) => ({ id: `bingebang-sub-${index}`, url: track.url,
        label: track.label ?? track.lang ?? 'Subtitle', language: track.lang ?? track.language ?? 'und',
        format: /\.srt(?:[?#]|$)/i.test(track.url) ? 'srt' as const : 'vtt' as const })) }]
  })
}
