export interface Env {
  HMAC_SECRET: string
  RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> }
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

function resolveReferer(targetUrl: string): string {
  return `${new URL(targetUrl).origin}/`
}

function assTimeToMs(time: string): number | null {
  const m = time.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/)
  if (!m) return null
  const [, h, min, s, cs] = m
  return Number(h) * 3_600_000 + Number(min) * 60_000 + Number(s) * 1_000 + Number(cs) * 10
}

function msToVtt(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const min = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  const mill = ms % 1_000
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mill).padStart(3, '0')}`
}

function stripAssTags(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\\[kKfFoOpPtT][^\s\\]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function assToVtt(ass: string): string | null {
  const cleaned = ass.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = cleaned.split('\n')
  let inEvents = false
  let formatFields: string[] = []
  const dialogues: { start: string; end: string; text: string }[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\[events\]$/i.test(trimmed)) { inEvents = true; continue }
    if (/^\[.*\]$/.test(trimmed)) { inEvents = false; continue }
    if (!inEvents) continue
    if (/^format:\s*/i.test(trimmed)) { formatFields = trimmed.slice(7).split(',').map((f) => f.trim().toLowerCase()); continue }
    if (!/^dialogue:\s*/i.test(trimmed)) continue

    const body = trimmed.slice(9)
    const parts = body.split(',')
    if (parts.length < formatFields.length) continue
    const textIdx = formatFields.indexOf('text')
    const startIdx = formatFields.indexOf('start')
    const endIdx = formatFields.indexOf('end')
    if (startIdx === -1 || endIdx === -1 || textIdx === -1) continue

    const startMs = assTimeToMs(parts[startIdx] ?? '')
    const endMs = assTimeToMs(parts[endIdx] ?? '')
    if (startMs === null || endMs === null || startMs >= endMs) continue
    const rawText = parts.slice(textIdx).join(',').trim()
    dialogues.push({ start: msToVtt(startMs), end: msToVtt(endMs), text: rawText })
  }
  if (!dialogues.length) return null
  const out: string[] = ['WEBVTT', '']
  for (const d of dialogues) {
    const cleaned = stripAssTags(d.text)
    if (!cleaned) continue
    out.push(`${d.start} --> ${d.end}`, cleaned, '')
  }
  return out.length > 2 ? out.join('\n') : null
}

function toWebVtt(text: string): string | null {
  const cleaned = text.replace(/^\uFEFF/, '').trim()
  if (!cleaned) return null
  if (/^WEBVTT/i.test(cleaned)) return cleaned
  // ASS/SSA detection: contains [Events] section and Dialogue lines
  if (/^\[script info\]/i.test(cleaned) && /\[events\]/i.test(cleaned)) {
    return assToVtt(cleaned)
  }
  if (!/\d\d:\d\d:\d\d,\d\d\d\s*-->\s*\d\d:\d\d:\d\d,\d\d\d/.test(cleaned)) return null
  const blocks = cleaned.split(/\r?\n\r?\n/)
  const out: string[] = ['WEBVTT', '']
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== '')
    if (!lines.length) continue
    const start = /^\d+$/.test(lines[0]!.trim()) ? 1 : 0
    const mapped = lines.slice(start).map((l) => l.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2'))
    if (mapped.some((l) => /-->/.test(l))) out.push(...mapped, '')
  }
  return out.length > 2 ? out.join('\n') : null
}

type Grant = { v: 1; url: string; host: string; hosts: string[]; patterns: string[]; headers: { referer?: string; origin?: string }; expires: number }
const MAX_GRANT_MS = 4 * 60 * 60 * 1000
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
const MAX_PLAYLIST_BYTES = 1 * 1024 * 1024
const MAX_MEDIA_BYTES = 512 * 1024 * 1024

function decodeBase64Url(encoded: string): Uint8Array {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function signGrant(key: CryptoKey, grant: Grant): Promise<string> {
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(grant)))
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded))
  return `${encoded}.${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

async function verifyGrant(key: CryptoKey, token: string, workerHost: string): Promise<Grant | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 2 || token.length > 16_384) return null
    const [encoded, signature] = parts as [string, string]
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[a-f0-9]{64}$/.test(signature)) return null
    const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/.{2}/g)!, (hex) => Number.parseInt(hex, 16)), new TextEncoder().encode(encoded))
    if (!valid) return null
    const grant = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) as Grant
    if (grant.v !== 1 || grant.host !== workerHost || !Number.isFinite(grant.expires) || grant.expires <= Date.now() || grant.expires > Date.now() + MAX_GRANT_MS) return null
    if (!Array.isArray(grant.hosts) || grant.hosts.length > 100 || !grant.hosts.every((host) => typeof host === 'string' && host.length <= 255)) return null
    if (!Array.isArray(grant.patterns) || grant.patterns.length > 10 || !grant.patterns.every((pattern) => typeof pattern === 'string' && pattern.length <= 100)) return null
    if (!grant.headers || typeof grant.headers !== 'object' || !safeHeaderUrl(grant.headers.referer) || !safeHeaderUrl(grant.headers.origin)) return null
    if (!allowedDestination(grant.url, grant)) return null
    return grant
  } catch { return null }
}

function safeHeaderUrl(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value)) return false
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

function allowedDestination(value: string, grant: Grant): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return false
    const host = url.hostname.toLowerCase()
    // IP literals and local names have no place in a configured media fleet.
    if (!host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return false
    return grant.hosts.some((allowed) => allowed.startsWith('*.')
      ? host.endsWith(allowed.slice(1).toLowerCase())
      : host === allowed.toLowerCase())
      || grant.patterns.some((pattern) => { try { return new RegExp(pattern, 'i').test(host) } catch { return false } })
  } catch { return false }
}

async function readBounded(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > limit) throw new Error('Upstream document exceeds its limit.')
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) throw new Error('Upstream document exceeds its limit.')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally { reader.releaseLock() }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(joined)
}

function boundedStream(body: ReadableStream<Uint8Array> | null, limit: number): ReadableStream<Uint8Array> | null {
  if (!body) return null
  const reader = body.getReader()
  let total = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read()
      if (done) { controller.close(); return }
      total += value.byteLength
      if (total > limit) { await reader.cancel(); controller.error(new Error('Media response exceeds its limit.')); return }
      controller.enqueue(value)
    },
    cancel(reason) { return reader.cancel(reason) },
  })
}

async function fetchAllowed(grant: Grant, headers: Headers, method: 'GET' | 'HEAD'): Promise<Response> {
  let target = grant.url
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!allowedDestination(target, grant)) throw new Error('Blocked media destination.')
    const response = await fetch(target, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location) throw new Error('Invalid media redirect.')
    target = new URL(location, target).href
  }
  throw new Error('Too many media redirects.')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.HMAC_SECRET || !env.RATE_LIMITER) return new Response('Proxy unavailable', { status: 503 })
    if (new URL(request.url).pathname === '/health' && (request.method === 'HEAD' || request.method === 'GET')) {
      return new Response(request.method === 'HEAD' ? null : 'ok', { status: 200, headers: { 'cache-control': 'no-store' } })
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })

    const reqUrl = new URL(request.url)
    const token = reqUrl.searchParams.get('token')
    const isHead = request.method === 'HEAD'
    if (!token) return new Response('Signed proxy grant required', { status: 403, headers: CORS_HEADERS })
    const key = await hmacKey(env.HMAC_SECRET)
    const grant = await verifyGrant(key, token, reqUrl.hostname)
    if (!grant) return new Response('Invalid or expired proxy grant', { status: 403, headers: CORS_HEADERS })

    const ip = request.headers.get('cf-connecting-ip') || 'unknown'
    const rate = await env.RATE_LIMITER.limit({ key: ip })
    if (!rate.success) {
      return new Response('Rate limit exceeded', { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': '60' } })
    }
    const url = grant.url
    const upstreamHeaders = new Headers({ 'User-Agent': DEFAULT_UA, 'Accept': '*/*', 'Referer': grant.headers.referer || resolveReferer(url) })
    if (grant.headers.origin) upstreamHeaders.set('Origin', grant.headers.origin)
    const rangeHeader = request.headers.get('range')
    if (rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader)) upstreamHeaders.set('Range', rangeHeader)

    try {
      const upstreamResponse = await fetchAllowed(grant, upstreamHeaders, isHead ? 'HEAD' : 'GET')

      if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
        return new Response(
          `Upstream error: ${upstreamResponse.status} ${upstreamResponse.statusText}`,
          { status: upstreamResponse.status, headers: CORS_HEADERS },
        )
      }

      const rawContentType = upstreamResponse.headers.get('content-type') || ''
      let isM3u8 =
        url.includes('.m3u8') ||
        rawContentType.includes('mpegurl') ||
        rawContentType.includes('x-mpegURL')

      let sniffedPlaylist: string | null = null
      if (!isM3u8 && !isHead && !rangeHeader && /text|octet-stream|mpegurl/i.test(rawContentType)) {
        const lenHeader = upstreamResponse.headers.get('content-length')
        const len = lenHeader ? parseInt(lenHeader, 10) : NaN
        if (Number.isNaN(len) || len < 1024 * 1024) {
          try {
            const peek = await readBounded(upstreamResponse.clone(), 1_048_576)
            const text = peek.slice(0, 7).replace(/^\uFEFF/, '')
            if (text.startsWith('#EXTM3U')) {
              isM3u8 = true
              sniffedPlaylist = peek
            }
          } catch { /* fall through */ }
        }
      }

      const looksSubtitle =
        /\.(vtt|srt|ass|ssa)(\?|#|$)/i.test(url) ||
        /subtitle|subrip|vtt|text\/plain/i.test(rawContentType)
      if (looksSubtitle && !isM3u8 && !isHead) {
        const text = await readBounded(upstreamResponse, MAX_DOCUMENT_BYTES)
        const vtt = toWebVtt(text)
        if (vtt) {
          return new Response(vtt, {
            status: 200,
            headers: {
              'Content-Type': 'text/vtt; charset=utf-8',
              ...CORS_HEADERS,
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            ...CORS_HEADERS,
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }

      if (isM3u8 && !isHead) {
        const text = sniffedPlaylist ?? (await readBounded(upstreamResponse, MAX_PLAYLIST_BYTES))
        if (text.length > MAX_PLAYLIST_BYTES) throw new Error('Playlist exceeds its limit.')
        const baseUrl = new URL('.', upstreamResponse.url || url).toString()
        const workerBase = reqUrl.origin
        const childUrl = async (uri: string) => {
          const absolute = new URL(uri, baseUrl).href
          if (!allowedDestination(absolute, grant)) throw new Error('Playlist refers to a blocked destination.')
          const child = await signGrant(key, { ...grant, url: absolute })
          return `${workerBase}/proxy?token=${encodeURIComponent(child)}`
        }
        const lines = text.split('\n')
        if (lines.length > 10_000) throw new Error('Playlist has too many entries.')
        const rewrittenLines = await Promise.all(lines.map(async (line) => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) {
            const uri = /URI="([^"]+)"/.exec(line)?.[1]
            if (uri) return line.replace(`URI="${uri}"`, `URI="${await childUrl(uri)}"`)
            return line
          }
          return childUrl(trimmed)
        }))

        return new Response(rewrittenLines.join('\n'), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            ...CORS_HEADERS,
            'Cache-Control': 'no-cache',
          },
        })
      }

      let finalContentType = rawContentType
      const lowerUrl = url.toLowerCase()

      if (lowerUrl.includes('.mp4') || rawContentType.includes('mp4')) {
        finalContentType = 'video/mp4'
      } else if (
        lowerUrl.includes('.ts') ||
        lowerUrl.includes('.html') ||
        lowerUrl.includes('/segment') ||
        lowerUrl.includes('/content/') ||
        lowerUrl.includes('tiktokcdn.com') ||
        lowerUrl.includes('/obj/tos-') ||
        lowerUrl.includes('kucwn.com') ||
        lowerUrl.includes('nxocw.com') ||
        lowerUrl.includes('interkh.com') ||
        rawContentType.includes('video/mp2t') ||
        rawContentType.includes('text/html')
      ) {
        finalContentType = 'video/mp2t'
      } else if (isM3u8) {
        finalContentType = 'application/vnd.apple.mpegurl'
      }

      if (isHead) {
        const headHeaders: Record<string, string> = {
          'Content-Type': finalContentType || 'video/mp2t',
          ...CORS_HEADERS,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
        }
        const cl = upstreamResponse.headers.get('content-length')
        if (cl) headHeaders['Content-Length'] = cl
        return new Response(null, { status: upstreamResponse.status, headers: headHeaders })
      }

      const responseHeaders: Record<string, string> = {
        'Content-Type': finalContentType || 'video/mp2t',
        ...CORS_HEADERS,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      }

      const contentRange = upstreamResponse.headers.get('content-range')
      if (contentRange) responseHeaders['Content-Range'] = contentRange
      const cl = upstreamResponse.headers.get('content-length')
      if (cl && Number(cl) > MAX_MEDIA_BYTES) return new Response('Media response exceeds its limit.', { status: 502, headers: CORS_HEADERS })
      if (cl) responseHeaders['Content-Length'] = cl

      return new Response(boundedStream(upstreamResponse.body, MAX_MEDIA_BYTES), {
        status: upstreamResponse.status,
        headers: responseHeaders,
      })
    } catch {
      return new Response('Upstream media unavailable.', {
        status: 502,
        headers: CORS_HEADERS,
      })
    }
  },
}
