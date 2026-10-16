import { fetchMedia } from '../playback/transport.ts'

export type SubtitleTextResponse = { text: string; cookies: string[] }

function responseCookies(headers: Headers): string[] {
  const getSet = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  if (typeof getSet === 'function') {
    try {
      const out: string[] = []
      for (const entry of getSet.call(headers)) {
        const match = String(entry).match(/^\s*([^=;\s]+)=([^;]*)/)
        if (match) out.push(`${match[1]}=${match[2]}`)
      }
      return out
    } catch {
      return []
    }
  }
  const combined = headers.get('set-cookie')
  if (!combined) return []
  const match = combined.match(/^\s*([^=;\s]+)=([^;]*)/)
  return match ? [`${match[1]}=${match[2]}`] : []
}

async function readBody(
  response: Awaited<ReturnType<typeof fetchMedia>>,
  signal: AbortSignal,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of response.body) {
    signal.throwIfAborted()
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += bytes.length
    if (size > maxBytes) {
      response.body.destroy()
      throw new Error('Subtitle response exceeds its limit.')
    }
    chunks.push(bytes)
  }
  signal.throwIfAborted()
  response.body.destroy()
  return Buffer.concat(chunks)
}

export type SubtitleHttp = {
  get(url: string, headers: Record<string, string>, signal: AbortSignal, maxBytes?: number): Promise<SubtitleTextResponse>
  post(url: string, body: string, headers: Record<string, string>, signal: AbortSignal): Promise<string>
}

/** SSRF-safe fetch for subtitle search pages. DNS pinning, public-only
 *  addresses, and redirect re-validation ride on the shared media transport;
 *  the 1 MiB cap fits search/detail HTML and JSON. */
export function createSubtitleHttp(hosts: readonly string[]): SubtitleHttp {
  async function get(
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
    maxBytes = 1_048_576,
  ): Promise<SubtitleTextResponse> {
    const response = await fetchMedia(url, hosts, headers, signal)
    if (response.status < 200 || response.status >= 300) {
      response.body.destroy()
      throw new Error(`Subtitle page HTTP ${response.status}.`)
    }
    const cookies = responseCookies(response.headers)
    const text = (await readBody(response, signal, maxBytes)).toString('utf8')
    return { text, cookies }
  }
  async function post(url: string, body: string, headers: Record<string, string>, signal: AbortSignal): Promise<string> {
    if (body.length > 65_536) throw new Error('Subtitle request exceeds its limit.')
    const response = await fetchMedia(url, hosts, { ...headers, 'Content-Type': 'application/json' }, signal, { method: 'POST', body })
    try {
      if (response.status < 200 || response.status >= 300) throw new Error(`Subtitle page HTTP ${response.status}.`)
      return (await readBody(response, signal, 1_048_576)).toString('utf8')
    } finally {
      response.body.destroy()
    }
  }
  return { get, post }
}

/** SSRF-safe binary fetch for subtitle files (zips, srt/vtt). Same
 *  protections as search pages with a caller-owned byte cap. */
export async function fetchSubtitleBytes(
  url: string,
  hosts: readonly string[],
  headers: Record<string, string>,
  signal: AbortSignal,
  maxBytes = 5_242_880,
  patterns: readonly RegExp[] = [],
): Promise<Buffer> {
  const response = await fetchMedia(url, hosts, headers, signal, undefined, patterns)
  if (response.status < 200 || response.status >= 300) {
    response.body.destroy()
    throw new Error(`Subtitle file HTTP ${response.status}.`)
  }
  return readBody(response, signal, maxBytes)
}
