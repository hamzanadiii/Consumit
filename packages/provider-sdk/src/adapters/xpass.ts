import { createDecipheriv, createHash } from 'node:crypto'
import { z } from 'zod'
import { allowedMediaUrl, isRelayMediaUrl, type ProviderSource } from '../index.ts'
import { adapter, document, ProviderFailure, sourceAccess, type ProviderHttp } from './http.ts'

const origin = 'https://play.xpass.top'
const upstreamReferer = 'https://nepu.info/'
const subtitleOrigin = 'https://sub.1x2.space'
const build = 'spv3-build-1787821613-50e5fc97c9dce367'
const xpassUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const maxBackups = 10
const maxSources = 6
const relayFallback = /asiaflix|m3u8-proxy|valhallastream|workers\.dev|tnmr\.org/i

const backupSchema = z.object({ name: z.string().max(80).optional(), url: z.string().max(4096).optional() })
const backupListSchema = z.array(backupSchema).max(32)
const playlistItemSchema = z.object({
  file: z.string().max(4096).optional(),
  type: z.string().max(32).optional(),
  label: z.string().max(64).optional(),
})
const playlistRecordSchema = playlistItemSchema.extend({ sources: z.array(playlistItemSchema).max(32).optional() })
const subtitleSchema = z.object({
  url: z.string().max(4096), status: z.string().max(32).optional(),
  label: z.string().max(128).optional(), language: z.string().max(32).optional(),
})
const subtitleListSchema = z.array(subtitleSchema).max(64)

export type XPassOptions = { mediaHosts: readonly string[] }
type XPassBackup = z.infer<typeof backupSchema>
type XPassCandidate = { url: string; type: 'hls' | 'native'; name: string; key: string }

/** Decrypt XPass's AES-GCM backup list. The key binds the current build, path and token. */
export function decryptXPassBackups(dataUrl: string, ciphertext: string): XPassBackup[] {
  const url = new URL(dataUrl, origin)
  if (url.origin !== origin || url.username || url.password || url.hash) throw new ProviderFailure('malformed')
  const token = url.searchParams.get('token') ?? ''
  if (!token || ciphertext.length > 1_000_000) throw new ProviderFailure('malformed')
  const key = createHash('sha256').update(`spv3-data-response|${build}|${url.pathname}|${token}`).digest()
  const blob = decodeBase64(ciphertext)
  if (blob.length < 29) throw new ProviderFailure('malformed')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12), { authTagLength: 16 })
    decipher.setAuthTag(blob.subarray(blob.length - 16))
    const plain = Buffer.concat([decipher.update(blob.subarray(12, blob.length - 16)), decipher.final()])
    return backupListSchema.parse(JSON.parse(plain.toString('utf8')))
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof ProviderFailure) throw error
    throw new ProviderFailure('malformed')
  }
}

export function createXPassProvider(http: ProviderHttp, now = Date.now, options: XPassOptions) {
  return adapter('xpass', async ({ ref }, signal) => {
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const isSeries = ref.kind === 'series'
    const pageUrl = `${origin}/e/${isSeries ? 'tv' : 'movie'}/${ref.id}${isSeries ? `/${ref.season}/${ref.episode}` : ''}`
    const page = await document(http, pageUrl, signal, { referer: upstreamReferer, 'user-agent': xpassUserAgent })
    const dataUrl = sameOriginUrl(page.text.match(/var\s+dataUrl\s*=\s*["']([^"']+)['"]/i)?.[1], pageUrl, [origin])
    if (!dataUrl) throw new ProviderFailure('empty')
    const subUrl = sameOriginUrl(page.text.match(/var\s+suburl\s*=\s*["']([^"']+)['"]/i)?.[1], pageUrl, [origin, subtitleOrigin])
    const data = await document(http, dataUrl, signal, { referer: pageUrl, 'user-agent': xpassUserAgent })
    const backups = decryptXPassBackups(dataUrl, data.text)
      .filter((backup): backup is { name?: string; url: string } => typeof backup.url === 'string' && !relayFallback.test(backup.url))
      .map((backup, index) => {
        const url = backupPlaylistUrl(backup.url, options.mediaHosts)
        if (!url) return null
        const name = displayName(backup.name, index)
        return { name, url, index }
      })
      .filter((backup): backup is { name: string; url: string; index: number } => backup !== null)
      .slice(0, maxBackups)
    if (!backups.length) throw new ProviderFailure('empty')

    const headers = { referer: pageUrl, 'user-agent': xpassUserAgent }
    const subtitlesPromise = subUrl ? readSubtitles(http, subUrl, pageUrl, options.mediaHosts, signal) : Promise.resolve([])
    const candidates = await Promise.all(backups.map(async ({ name, url, index }) => {
      try {
        const playlist = await document(http, url, signal, headers)
        const entry = parsePlaylistSource(playlist.text)
        if (!entry) return null
        const file = mediaUrl(entry.file, playlist.url, options.mediaHosts)
        if (!file) return null
        const type = entry.type?.toLowerCase() === 'mp4' || /\.mp4(?:[?#]|$)/i.test(file) ? 'native' : 'hls'
        const candidate: XPassCandidate = { url: file, type, name, key: candidateKey(name, index) }
        if (!(await probeCandidate(http, candidate, pageUrl, headers, options.mediaHosts, signal))) return null
        return candidate
      } catch {
        signal.throwIfAborted()
        return null
      }
    }))
    signal.throwIfAborted()
    const subtitles = await subtitlesPromise.catch(() => [])
    return candidates.filter((candidate): candidate is XPassCandidate => candidate !== null).slice(0, maxSources).map((candidate): ProviderSource => ({
      key: candidate.key,
      serverName: `XPass ${candidate.name}`.slice(0, 80),
      url: candidate.url,
      type: candidate.type,
      headers,
      language: 'original',
      qualityHint: 'Auto',
      ...sourceAccess(candidate.url, now()),
      subtitles,
    }))
  })
}

function decodeBase64(value: string): Buffer {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new ProviderFailure('malformed')
  return Buffer.from(normalized + '='.repeat((4 - normalized.length % 4) % 4), 'base64')
}

function sameOriginUrl(raw: string | undefined, base: string, origins: readonly string[]): string | null {
  if (!raw || raw.length > 4096) return null
  try {
    const url = new URL(raw, base)
    if (!origins.includes(url.origin) || url.username || url.password || url.hash || (url.port && url.port !== '443')) return null
    return url.href
  } catch { return null }
}

function mediaUrl(raw: string, base: string, hosts: readonly string[]): string | null {
  if (raw.length > 4096) return null
  try {
    const url = new URL(raw, base)
    return allowedMediaUrl(url, hosts) && !isRelayMediaUrl(url) ? url.href : null
  } catch { return null }
}

function backupPlaylistUrl(raw: string, hosts: readonly string[]): string | null {
  const upstream = sameOriginUrl(raw, origin, [origin])
  if (upstream && !isRelayMediaUrl(upstream) && !relayFallback.test(upstream)) return upstream
  return mediaUrl(raw, origin, hosts)
}

function parsePlaylistSource(text: string): { file: string; type?: string } | null {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return null }
  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  let records: unknown[] = root && 'playlist' in root ? Array.isArray(root.playlist) ? root.playlist : [root.playlist] : Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed]
  records = records.slice(0, 32)
  for (const raw of records) {
    const record = playlistRecordSchema.safeParse(raw)
    if (!record.success) continue
    const choices = [record.data, ...(record.data.sources ?? [])]
    const chosen = choices.find((source) => typeof source.file === 'string' && source.file.length > 0)
    if (chosen?.file) return { file: chosen.file, ...(chosen.type ? { type: chosen.type } : {}) }
  }
  return null
}

function displayName(raw: string | undefined, index: number): string {
  const cleaned = Array.from(raw ?? `#${index + 1}`).filter((character) => {
    const code = character.charCodeAt(0)
    return code >= 0x20 && code !== 0x7f
  }).join('').trim().slice(0, 64)
  return cleaned || `#${index + 1}`
}

function candidateKey(name: string, index: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'source'
  return `xpass:${slug}:${index}`.slice(0, 100)
}

function playlistReference(text: string, base: string, hosts: readonly string[]): { variant?: string; segment?: string } | null {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]!.startsWith('#EXT-X-STREAM-INF')) continue
    const next = lines.slice(index + 1).find(line => !line.startsWith('#'))
    if (!next) return null
    const variant = mediaUrl(next, base, hosts)
    return variant ? { variant } : null
  }
  const first = lines.find(line => !line.startsWith('#'))
  if (!first) return null
  const segment = mediaUrl(first, base, hosts)
  if (!segment) return null
  if (/\.m3u8(?:[?#]|$)/i.test(segment)) return { variant: segment }
  return { segment }
}

async function probeCandidate(
  http: ProviderHttp,
  candidate: XPassCandidate,
  pageUrl: string,
  headers: Record<string, string>,
  hosts: readonly string[],
  signal: AbortSignal,
): Promise<boolean> {
  if (candidate.type === 'native') {
    const probe = await http(candidate.url, headers, signal, { readPrefixBytes: 2 })
    return (probe.status === 200 || probe.status === 206) && Boolean(probe.bytes?.length || probe.text.length)
  }
  let playlistUrl = candidate.url
  for (let depth = 0; depth < 3; depth++) {
    const response = await document(http, playlistUrl, signal, headers)
    if (!response.text.includes('#EXTM3U')) return false
    const reference = playlistReference(response.text, response.url, hosts)
    if (!reference) return false
    if (reference.segment) {
      const probe = await http(reference.segment, headers, signal, { readPrefixBytes: 2 })
      return (probe.status === 200 || probe.status === 206) && Boolean(probe.bytes?.length || probe.text.length)
    }
    playlistUrl = reference.variant!
  }
  return false
}

async function readSubtitles(http: ProviderHttp, url: string, pageUrl: string, hosts: readonly string[], signal: AbortSignal) {
  try {
    const response = await document(http, url, signal, { referer: pageUrl, 'user-agent': xpassUserAgent })
    let raw: unknown
    try { raw = JSON.parse(response.text) } catch { return [] }
    const parsed = subtitleListSchema.safeParse(raw)
    if (!parsed.success) return []
    return parsed.data.filter(track => track.status === 'cached').slice(0, 20).flatMap((track, index) => {
      const absolute = sameOriginUrl(track.url, subtitleOrigin, [subtitleOrigin])
      if (!absolute || !allowedMediaUrl(absolute, hosts) || isRelayMediaUrl(absolute)) return []
      return [{
        id: `xpass-sub-${index}`,
        label: track.label ?? track.language ?? 'Unknown',
        language: track.language ?? 'und',
        format: /\.srt(?:[?#]|$)/i.test(absolute) ? 'srt' as const : 'vtt' as const,
        url: absolute,
      }]
    })
  } catch {
    signal.throwIfAborted()
    return []
  }
}
