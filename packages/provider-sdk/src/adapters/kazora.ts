import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { adapter, parseSkipSegments, ProviderFailure, sourceAccess, userAgent, type ProviderHttp } from './http.ts'

const BASE = 'https://kazora.cc'

const headers = {
  'user-agent': userAgent,
  accept: 'application/json',
  referer: `${BASE}/`,
  origin: BASE,
}

/** The upstream re-rolls its CDN per call. Live probes (Death Note 19, both
 *  lanes) put juju and kyoo on the CORS-open cdnx lane, kazo on a flixcloud
 *  master that 403s outside the minting session, and lufi on either. Three
 *  server attempts cover a rotation without unbounded upstream load. */
const SERVERS = ['juju', 'kyoo', 'lufi'] as const
const MASTER_TIMEOUT_MS = 15000

const tokenSchema = z.object({
  m3u8: z.string().max(4096).nullish(),
  intro: z.object({ start: z.number(), end: z.number() }).nullish(),
  outro: z.object({ start: z.number(), end: z.number() }).nullish(),
}).passthrough()
const watchSchema = z.object({
  results: z.object({ embed: z.object({ url: z.string().max(4096).nullish() }).passthrough() }).passthrough(),
}).passthrough()

/** Port of the supplied Kazora recipe: an AniList-id watch API whose embed
 *  URL carries a base64 token naming the master plus intro/outro marks. The
 *  upstream rotates CDNs per call, so each candidate master is verified as a
 *  real CORS-open playlist before it becomes a source; gated CDNs are skipped
 *  rather than returned. Subtitle tracks ride a same-origin media proxy that
 *  answers 403 to a browser Origin, so they stay out of the direct source and
 *  belong to the first-party subtitle service instead. */
export function createKazoraProvider(http: ProviderHttp, now = Date.now) {
  return adapter('kazora', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    if (!Number.isInteger(ref.id) || ref.id <= 0) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'

    for (const server of SERVERS) {
      signal.throwIfAborted()
      const watch = await resolveWatch(http, ref.id, ref.episode, server, audio, signal)
      if (!watch) continue
      const master = String(watch.m3u8 ?? '').trim()
      if (!/^https:\/\//i.test(master) || master.length > 4096) continue
      if (!(await isOpenMaster(http, master, signal))) continue
      const access = sourceAccess(master, now())
      const skipSegments = skipSegmentsOf(watch)
      const sources: ProviderSource[] = [{
        key: `kazora:${audio}:${server}:${ref.episode}`,
        url: master,
        type: 'hls',
        headers: {},
        expiresAt: access.expiresAt,
        ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
        language: dub ? 'en' : 'original',
        qualityHint: 'Auto',
        subtitles: [],
        ...(skipSegments ? { skipSegments } : {}),
      }]
      return sources
    }
    throw new ProviderFailure('empty')
  })
}

async function resolveWatch(
  http: ProviderHttp,
  anilistId: number,
  episode: number,
  server: string,
  audio: 'sub' | 'dub',
  signal: AbortSignal,
): Promise<z.infer<typeof tokenSchema> | null> {
  const url = `${BASE}/api/watch?id=${anilistId}&ep=${episode}&server=${server}&type=${audio}`
  let response
  try {
    response = await http(url, headers, signal)
  } catch {
    return null
  }
  if (response.status < 200 || response.status >= 300) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(response.text) as unknown
  } catch {
    return null
  }
  const validated = watchSchema.safeParse(parsed)
  if (!validated.success) return null
  const embed = String(validated.data.results.embed.url ?? '')
  const marker = '/stream-embed/embed/'
  const at = embed.indexOf(marker)
  if (at < 0) return null
  const payload = embed.slice(at + marker.length).split('.')[0]
  if (!payload) return null
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as unknown
  } catch {
    return null
  }
  const token = tokenSchema.safeParse(decoded)
  return token.success ? token.data : null
}

/** Direct delivery needs a real playlist the browser can read cross-origin;
 *  a gated CDN answers with an error page or no CORS header, and neither can
 *  become a session. */
async function isOpenMaster(http: ProviderHttp, master: string, signal: AbortSignal): Promise<boolean> {
  const scoped = new AbortController()
  const onAbort = () => scoped.abort(signal.reason)
  if (signal.aborted) return false
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => scoped.abort(new DOMException('Kazora master timed out', 'TimeoutError')), MASTER_TIMEOUT_MS)
  try {
    const response = await http(master, { 'user-agent': userAgent }, scoped.signal, { readPrefixBytes: 64 * 1024 })
    if (response.status < 200 || response.status >= 300) return false
    if (response.headers?.get('access-control-allow-origin') !== '*') return false
    return response.text.trimStart().startsWith('#EXTM3U')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

function skipSegmentsOf(token: z.infer<typeof tokenSchema>): ProviderSource['skipSegments'] {
  const parsed = parseSkipSegments({ intro: token.intro ?? undefined, outro: token.outro ?? undefined })
  return parsed.length ? parsed : undefined
}
