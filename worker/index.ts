export interface Env {
  HMAC_SECRET: string
  ALLOWED_DOMAINS: string
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

function resolveReferer(targetUrl: string, customReferer?: string | null): string {
  const lower = targetUrl.toLowerCase()
  const refLower = (customReferer || '').toLowerCase()

  if (
    lower.includes('remoteconsultinggroup.site') ||
    lower.includes('onlinevisibilitysystem.site') ||
    lower.includes('quietmidnightgardeningideas.site') ||
    lower.includes('vaplayer.ru') ||
    lower.includes('valhallastream') ||
    lower.includes('nextgencloudfabric.com') ||
    lower.includes('/pl/h4sia') ||
    lower.includes('/content/') ||
    refLower.includes('remoteconsultinggroup.site') ||
    refLower.includes('onlinevisibilitysystem.site') ||
    refLower.includes('quietmidnightgardeningideas.site')
  ) {
    return 'https://nextgencloudfabric.com/'
  }

  if (
    lower.includes('ngcorp.dad') ||
    lower.includes('vidrock') ||
    lower.includes('tiktokcdn.com') ||
    lower.includes('streamrk.site') ||
    refLower.includes('vidrock') ||
    refLower.includes('ngcorp.dad')
  ) {
    return 'https://vidrock.to/'
  }

  if (customReferer && customReferer.startsWith('http')) {
    return customReferer
  }
  if (lower.includes('fsharetv.cc') || lower.includes('aoneroom.com')) {
    return 'https://fsharetv.cc/'
  }
  if (lower.includes('icefy')) {
    return 'https://streams.icefy.top/'
  }
  if (lower.includes('interkh.com') || lower.includes('insertunit')) {
    return 'https://api.insertunit.ws/'
  }
  if (lower.includes('nhdapi.com')) {
    return 'https://player.nhdapi.com/'
  }
  try {
    const parsed = new URL(targetUrl)
    return `${parsed.protocol}//${parsed.host}/`
  } catch {
    return 'https://google.com/'
  }
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

async function verifyHmac(secret: string, url: string, domain: string, token: string): Promise<boolean> {
  try {
    const [expiresStr, sig] = token.split('.')
    const expires = Number(expiresStr)
    if (Date.now() > expires) return false
    const payload = `${url}|${domain}|${expires}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const expected = await crypto.subtle.verify(
      'HMAC',
      key,
      Uint8Array.from(sig.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))),
      new TextEncoder().encode(payload),
    )
    return expected
  } catch {
    return false
  }
}

function isDomainAllowed(origin: string, allowedDomains: string): boolean {
  if (!allowedDomains) return true
  try {
    const hostname = new URL(origin).hostname
    const domains = allowedDomains.split(',').map((d) => d.trim().toLowerCase())
    return domains.some((pattern) => {
      if (pattern.startsWith('*.')) {
        return hostname.endsWith(pattern.slice(1)) || hostname === pattern.slice(2)
      }
      return hostname === pattern
    })
  } catch {
    return false
  }
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string, limit = 100, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= limit
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const reqUrl = new URL(request.url)
    const targetUrl = reqUrl.searchParams.get('url')
    const customReferer = reqUrl.searchParams.get('referer')
    const customOrigin = reqUrl.searchParams.get('origin')
    const customHeadersRaw = reqUrl.searchParams.get('headers')
    const segmentsDirect = reqUrl.searchParams.get('seg') === 'direct'
    const token = reqUrl.searchParams.get('token')
    const isHead = request.method === 'HEAD'

    if (!targetUrl) {
      return new Response('Missing "url" query parameter', { status: 400, headers: CORS_HEADERS })
    }

    // HMAC token validation — domain is always the Worker's own hostname so
    // API (which does not know the embed origin) and Worker agree on the value.
    if (env.HMAC_SECRET && token) {
      const workerDomain = reqUrl.hostname
      const valid = await verifyHmac(env.HMAC_SECRET, targetUrl, workerDomain, token)
      if (!valid) {
        return new Response('Invalid or expired token', { status: 403, headers: CORS_HEADERS })
      }
    }

    // Domain whitelist — requires referer/origin; blocks headless requests
    // when a whitelist is configured.
    const referer = request.headers.get('referer') || request.headers.get('origin') || ''
    if (env.ALLOWED_DOMAINS) {
      if (!referer) {
        return new Response('Embed access requires a valid referer.', { status: 403, headers: CORS_HEADERS })
      }
      if (!isDomainAllowed(referer, env.ALLOWED_DOMAINS)) {
        return new Response('Domain not allowed', { status: 403, headers: CORS_HEADERS })
      }
    }

    // Rate limiting
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown'
    if (!checkRateLimit(ip)) {
      return new Response('Rate limit exceeded', { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': '60' } })
    }

    // Unwrap nested proxy URLs
    let url = targetUrl
    if (url.includes('valhallastream.dpdns.org/m3u8-proxy') && url.includes('url=')) {
      try {
        const nested = new URL(url)
        const inner = nested.searchParams.get('url')
        if (inner) url = inner
      } catch { /* ignore */ }
    }

    let customHeaders: Record<string, string> = {}
    if (customHeadersRaw) {
      try {
        const parsed = JSON.parse(customHeadersRaw)
        if (typeof parsed === 'object' && parsed !== null) customHeaders = parsed
      } catch { /* ignore */ }
    }

    const effectiveReferer = resolveReferer(url, customReferer)

    const upstreamHeaders: Record<string, string> = {
      'User-Agent': DEFAULT_UA,
      'Accept': '*/*',
      'Referer': effectiveReferer,
      'Connection': 'close',
      ...customHeaders,
    }

    if (customOrigin) {
      upstreamHeaders['Origin'] = customOrigin
    } else {
      delete upstreamHeaders['Origin']
    }

    const rangeHeader = request.headers.get('range')
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader
    }

    try {
      const upstreamResponse = await fetch(url, {
        method: isHead ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        redirect: 'follow',
      })

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
      if (!isM3u8 && !isHead && !rangeHeader) {
        const lenHeader = upstreamResponse.headers.get('content-length')
        const len = lenHeader ? parseInt(lenHeader, 10) : NaN
        if (Number.isNaN(len) || len < 1024 * 1024) {
          try {
            const peek = new Uint8Array(await upstreamResponse.clone().arrayBuffer())
            const text = new TextDecoder().decode(peek.slice(0, 7)).replace(/^\uFEFF/, '')
            if (text.startsWith('#EXTM3U')) {
              isM3u8 = true
              sniffedPlaylist = new TextDecoder().decode(peek)
            }
          } catch { /* fall through */ }
        }
      }

      const looksSubtitle =
        /\.(vtt|srt|ass|ssa)(\?|#|$)/i.test(url) ||
        /subtitle|subrip|vtt|text\/plain|octet-stream/i.test(rawContentType)
      if (looksSubtitle && !isM3u8 && !isHead) {
        const text = await upstreamResponse.text()
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
        const text = sniffedPlaylist ?? (await upstreamResponse.text())
        const baseUrl = new URL('.', upstreamResponse.url || url).toString()
        const workerBase = reqUrl.origin

        const rewrittenLines = text.split('\n').map((line) => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) {
            if (trimmed.includes('URI="')) {
              return trimmed.replace(/URI="([^"]+)"/, (_, uri: string) => {
                const fullUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl).toString()
                if (segmentsDirect) return `URI="${fullUri}"`
                return `URI="${workerBase}/proxy?url=${encodeURIComponent(fullUri)}&referer=${encodeURIComponent(resolveReferer(fullUri, customReferer))}${segmentsDirect ? '&seg=direct' : ''}"`
              })
            }
            return line
          }

          const fullSegmentUrl = trimmed.startsWith('http')
            ? trimmed
            : new URL(trimmed, baseUrl).toString()
          if (segmentsDirect && !/\.m3u8(\?|#|$)/i.test(fullSegmentUrl)) return fullSegmentUrl
          return `${workerBase}/proxy?url=${encodeURIComponent(fullSegmentUrl)}&referer=${encodeURIComponent(resolveReferer(fullSegmentUrl, customReferer))}${segmentsDirect ? '&seg=direct' : ''}`
        })

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
      if (cl) responseHeaders['Content-Length'] = cl

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      })
    } catch (err: any) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      })
    }
  },
}
