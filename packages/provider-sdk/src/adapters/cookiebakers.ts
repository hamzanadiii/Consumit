import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { adapter, ProviderFailure, sourceAccess, userAgent, type ProviderHttp } from './http.ts'

const API = 'https://stream.lfmx.app/api'
const SITE = 'https://moanatv.lfmx.app'

const headers = {
  'user-agent': userAgent,
  origin: SITE,
  referer: `${SITE}/`,
  accept: 'application/json',
}

/** The vault flaps between "upstream 429" and "upstream 502" on any given
 *  title. Live probes hit 429 on a first attempt of a fresh batch, so three
 *  attempts cover a burst; only the upstream's own flap statuses retry. */
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 800
// Leave the first cold lookup longer, while reserving time for recovery
// within the outer 15-second provider attempt (7 + 3 + 2 + 1.6 seconds).
const REQUEST_TIMEOUT_MS = [7000, 3000, 2000] as const
const RETRYABLE = new Set([429, 502, 504])

const streamSchema = z.object({ url: z.string().max(4096).nullish() }).passthrough()

/** Port of the supplied CookieBakers recipe: a TMDB-keyed HLS vault behind
 *  stream.lfmx.app returns one master on cookiebakers23blog.xyz with a
 *  correct ladder, a demuxed audio rendition and AES-128 segments. The
 *  origin answers CORS-open (ACAO `*`), so the row registers browser-direct
 *  per PROVE's registry (see the 2026-10-09 additions audit); no Worker
 *  relay lane is approved for it. The vault's own CDN cache is unreliable
 *  and its resolution route flaps on multi-minute upstream windows, so a
 *  window resolves unavailable for that title only and the waterfall moves
 *  on. */
export function createCookieBakersProvider(http: ProviderHttp, now = Date.now) {
  return adapter('cookiebakers', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const path = ref.kind === 'series'
      ? `tv/${ref.id}/${ref.season}/${ref.episode}`
      : `movie/${ref.id}`
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt) await delay(RETRY_DELAY_MS, signal)
      signal.throwIfAborted()
      let response
      const controller = new AbortController()
      const cancel = () => controller.abort(signal.reason)
      signal.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(() => controller.abort(new DOMException('CookieBakers lookup timed out.', 'TimeoutError')), REQUEST_TIMEOUT_MS[attempt])
      try {
        response = await http(`${API}/stream/cookiebakers/${path}`, headers, controller.signal)
      } catch {
        signal.throwIfAborted()
        if (attempt === MAX_ATTEMPTS - 1) throw new ProviderFailure('unavailable')
        continue
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', cancel)
      }
      if (response.status === 404) throw new ProviderFailure('empty')
      if (response.status < 200 || response.status >= 300) {
        if (RETRYABLE.has(response.status)) continue
        throw new ProviderFailure('unavailable')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(response.text) as unknown
      } catch {
        throw new ProviderFailure('malformed')
      }
      const validated = streamSchema.safeParse(parsed)
      if (!validated.success) throw new ProviderFailure('malformed')
      const url = String(validated.data.url ?? '').trim()
      if (!/^https:\/\//i.test(url) || url.length > 4096) throw new ProviderFailure('empty')
      const access = sourceAccess(url, now())
      const sources: ProviderSource[] = [{
        key: 'cookiebakers:0',
        url,
        type: 'hls',
        headers: {},
        expiresAt: access.expiresAt,
        ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
        language: 'original',
        qualityHint: 'Auto',
        subtitles: [],
      }]
      return sources
    }
    throw new ProviderFailure('unavailable')
  })
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
