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
const MINT_TIMEOUT_MS = 6000
const PROBE_TIMEOUT_MS = 4000
const CASCADE_TIMEOUT_MS = 9000

const tokenSchema = z.object({
  m3u8: z.string().max(4096).nullish(),
  intro: z.object({ start: z.number(), end: z.number() }).nullish(),
  outro: z.object({ start: z.number(), end: z.number() }).nullish(),
}).passthrough()
const watchSchema = z.object({
  results: z.object({ embed: z.object({ url: z.string().max(4096).nullish() }).passthrough() }).passthrough(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number, label: string) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException(label, 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

/** Port of the supplied Kazora recipe: an AniList-id watch API whose embed
 *  URL carries a base64 token naming the master plus intro/outro marks. The
 *  upstream rotates CDNs per call, so all three server lanes mint in parallel
 *  and each candidate master is verified as a real CORS-open playlist before
 *  it becomes a source; gated CDNs are skipped rather than returned. The
 *  first open master in declared preference order wins, so wall time is one
 *  bounded pass instead of a sequential crawl. Subtitle tracks ride a
 *  same-origin media proxy that answers 403 to a browser Origin, so they stay
 *  out of the direct source and belong to the first-party subtitle service. */
export function createKazoraProvider(http: ProviderHttp, now = Date.now) {
  return adapter('kazora', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    if (!Number.isInteger(ref.id) || ref.id <= 0) throw new ProviderFailure('empty')
    const anilistId = ref.id
    const episode = ref.episode
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'
    signal.throwIfAborted()

    const cascade = bounded(signal, CASCADE_TIMEOUT_MS, 'Kazora cascade timed out')
    const probeScope = new AbortController()
    const onCascadeAbort = () => probeScope.abort(cascade.signal.reason)
    if (cascade.signal.aborted) throw signal.reason ?? new ProviderFailure('empty')
    cascade.signal.addEventListener('abort', onCascadeAbort, { once: true })
    try {
      const lanes = SERVERS.map(async (server) => {
        const mint = bounded(cascade.signal, MINT_TIMEOUT_MS, `Kazora ${server} mint timed out`)
        let watch: z.infer<typeof tokenSchema> | null
        try {
          watch = await resolveWatch(http, anilistId, episode, server, audio, mint.signal)
        } finally {
          mint.cleanup()
        }
        if (!watch) return null
        const master = String(watch.m3u8 ?? '').trim()
        if (!/^https:\/\//i.test(master) || master.length > 4096) return null
        if (!(await isOpenMaster(http, master, probeScope.signal))) return null
        return { server, watch, master }
      })
      const winner = await firstOpenInOrder(lanes)
      if (!winner) throw new ProviderFailure('empty')
      const access = sourceAccess(winner.master, now())
      const skipSegments = skipSegmentsOf(winner.watch)
      const sources: ProviderSource[] = [{
        key: `kazora:${audio}:${winner.server}:${episode}`,
        url: winner.master,
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
    } finally {
      probeScope.abort()
      cascade.signal.removeEventListener('abort', onCascadeAbort)
      cascade.cleanup()
    }
  })
}

/** Race all lanes, but commit only in preference order: a lower-preference
 *  open master never shadows a higher-preference lane that is still in
 *  flight, and the first open in declared order returns immediately. */
async function firstOpenInOrder<T>(lanes: Array<Promise<T | null>>): Promise<T | null> {
  if (!lanes.length) return null
  const settled: Array<T | null | undefined> = lanes.map(() => undefined)
  return new Promise((resolve) => {
    const check = () => {
      for (let i = 0; i < lanes.length; i++) {
        if (settled[i] === undefined) return
        if (settled[i] !== null) {
          resolve(settled[i] as T)
          return
        }
      }
      resolve(null)
    }
    lanes.forEach((lane, index) => {
      const done = (value: T | null) => {
        settled[index] = value
        check()
      }
      lane.then(done, () => done(null))
    })
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
  if (signal.aborted) return false
  const scoped = bounded(signal, PROBE_TIMEOUT_MS, 'Kazora master timed out')
  try {
    const response = await http(master, { 'user-agent': userAgent }, scoped.signal, { readPrefixBytes: 64 * 1024 })
    if (response.status < 200 || response.status >= 300) return false
    if (response.headers?.get('access-control-allow-origin') !== '*') return false
    return response.text.trimStart().startsWith('#EXTM3U')
  } catch {
    return false
  } finally {
    scoped.cleanup()
  }
}

function skipSegmentsOf(token: z.infer<typeof tokenSchema>): ProviderSource['skipSegments'] {
  const parsed = parseSkipSegments({ intro: token.intro ?? undefined, outro: token.outro ?? undefined })
  return parsed.length ? parsed : undefined
}
