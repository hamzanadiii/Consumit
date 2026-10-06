import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { assertHlsManifest, parseHlsReferences } from '../manifest.ts'
import { adapter, document, sourceAccess, ProviderFailure, type ProviderHttp } from './http.ts'

const streamsSchema = z.object({ streams: z.array(z.object({ url: z.url().max(4096), quality: z.string().nullable().optional(), label: z.string().nullable().optional() })).max(32) })
// PROVE 2026-10-05 budgets: the old playlist+probe timeouts plus API timeout
// blew the per-provider pipeline budget. /v1/play/ links hang instead of
// fast-failing, and slow /v1/vs/ nested masters are skipped per operator
// request, so every leg gets a short timeout and fails fast.
const API_TIMEOUT_MS = 6000
const PLAYLIST_TIMEOUT_MS = 3000
const SEGMENT_TIMEOUT_MS = 2500
const MAX_STREAMS = 4
const MAX_DEPTH = 2

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Rigel step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}
/** Standalone Movish Rigel, distinct from the Rivestream Rigel subserver. */
export function createRigelProvider(http: ProviderHttp, now = Date.now) {
  return adapter('rigel', async ({ ref }, signal) => {
    if (ref.kind === 'anime') throw new ProviderFailure('empty')
    const path = ref.kind === 'movie' ? `/movie/${ref.id}` : `/tv/${ref.id}/${ref.season}/${ref.episode}`
    const api = bounded(signal, API_TIMEOUT_MS)
    let data: z.infer<typeof streamsSchema>
    try {
      data = streamsSchema.parse(JSON.parse((await document(http, `https://movish.to/player-sources/rigel${path}`, api.signal)).text))
    } finally {
      api.cleanup()
    }
    // Operator request 2026-10-05: drop the slow /v1/vs/ nested masters —
    // only /v1/play/ and other non-vs URLs are kept.
    const candidates = data.streams.filter((stream) => !/\/v1\/vs\//i.test(stream.url)).slice(0, MAX_STREAMS)
    // Verify chains in parallel — sequential nesting walks blow the
    // per-provider budget (/v1/play/ links hang instead of fast-failing,
    // hence the short per-leg timeouts above).
    const verified = await Promise.all(candidates.map(async (stream, index): Promise<ProviderSource | null> => {
      try {
        let url = stream.url
        for (let depth = 0; depth < MAX_DEPTH; depth++) {
          const leg = bounded(signal, PLAYLIST_TIMEOUT_MS)
          let response: Awaited<ReturnType<typeof document>>
          try {
            response = await document(http, url, leg.signal)
          } finally {
            leg.cleanup()
          }
          assertHlsManifest(response.text)
          const next = parseHlsReferences(response.text, response.url)[0]
          if (!next) return null
          if (/#EXT-X-STREAM-INF/.test(response.text)) { url = next; continue }
          const probe = bounded(signal, SEGMENT_TIMEOUT_MS)
          try {
            const segment = await document(http, next, probe.signal, { range: 'bytes=0-1023' }, { readPrefixBytes: 1024 })
            if (!segment.bytes?.length && !segment.text.length) return null
          } finally {
            probe.cleanup()
          }
          const label = (stream.quality ?? stream.label ?? 'Auto').slice(0, 24)
          const height = Number(/(\d{3,4})p/i.exec(label)?.[1])
          return { key: `rigel-${index}`, url: stream.url, type: 'hls', language: 'original', ...sourceAccess(stream.url, now()), headers: {}, subtitles: [], ...(height >= 144 && height <= 4320 ? { height, qualityHint: `${height}p` } : { qualityHint: 'Auto' }) }
        }
      } catch { signal.throwIfAborted() }
      return null
    }))
    const playable = verified.filter((source): source is ProviderSource => source !== null).slice(0, MAX_STREAMS)
    if (!playable.length) throw new ProviderFailure('empty')
    return playable
  })
}
