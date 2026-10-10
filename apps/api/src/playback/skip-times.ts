import { skipSegmentSchema, type PlaybackRef } from '@consumit/contracts'
import { z } from 'zod'

type Segment = z.infer<typeof skipSegmentSchema>
export type SkipTimes = { read(ref: PlaybackRef, durationSeconds: number): Promise<Segment[]> }
const time = z.number().finite().nonnegative()
const introDbSchema = z.object({
  tmdb_id: z.number().int().positive(), type: z.enum(['movie', 'tv']), season: z.number().optional(), episode: z.number().optional(),
  intro: z.array(z.object({ start_ms: time.nullable(), end_ms: time })).max(8).optional(),
  recap: z.array(z.object({ start_ms: time.nullable(), end_ms: time })).max(8).optional(),
})
const aniSkipSchema = z.object({ found: z.boolean(), results: z.array(z.object({
  skipType: z.string(), interval: z.object({ startTime: time, endTime: time }), episodeLength: time,
})).max(32).optional() })

/** Metadata reads use fixed public hosts; never receive a member-selected URL. */
async function readJson(url: URL, fetcher: typeof fetch, signal: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, { signal, redirect: 'error', headers: { accept: 'application/json' } })
  if (!response.ok || !response.body) return null
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let text = '', bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 64 * 1024) { await reader.cancel(); return null }
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally { reader.releaseLock() }
}

export function createSkipTimes({ animeMalId, fetcher = fetch }: {
  animeMalId: (anilistId: number) => Promise<number | null>
  fetcher?: typeof fetch
}): SkipTimes {
  const cache = new Map<string, { until: number; segments: Segment[] }>()
  const pending = new Map<string, Promise<Segment[]>>()
  async function lookup(ref: PlaybackRef, duration: number, signal: AbortSignal): Promise<Segment[]> {
    let segments: Segment[] = []
    if (ref.kind === 'anime') {
      const malId = await animeMalId(ref.id)
      signal.throwIfAborted()
      if (!malId) return []
      const url = new URL(`https://api.aniskip.com/v2/skip-times/${malId}/${ref.episode}`)
      url.searchParams.append('types[]', 'op'); url.searchParams.append('types[]', 'recap')
      url.searchParams.set('episodeLength', String(duration))
      const parsed = aniSkipSchema.safeParse(await readJson(url, fetcher, signal))
      if (!parsed.success || !parsed.data.found) return []
      segments = (parsed.data.results ?? []).flatMap((item) => {
        const kind = item.skipType === 'op' ? 'intro' : item.skipType === 'recap' ? 'recap' : null
        return kind && Math.abs(item.episodeLength - duration) <= 5 ? [{ kind, start: item.interval.startTime, end: item.interval.endTime }] : []
      })
    } else {
      const url = new URL('https://api.theintrodb.org/v3/media')
      url.searchParams.set('tmdb_id', String(ref.id)); url.searchParams.set('duration_ms', String(Math.round(duration * 1000)))
      if (ref.kind === 'series') { url.searchParams.set('season', String(ref.season)); url.searchParams.set('episode', String(ref.episode)) }
      const parsed = introDbSchema.safeParse(await readJson(url, fetcher, signal))
      if (!parsed.success || parsed.data.tmdb_id !== ref.id || parsed.data.type !== (ref.kind === 'movie' ? 'movie' : 'tv') || (ref.kind === 'series' && (parsed.data.season !== ref.season || parsed.data.episode !== ref.episode))) return []
      for (const kind of ['intro', 'recap'] as const) {
        // TheIntroDB explicitly defines null starts as the beginning, not unknown.
        for (const item of parsed.data[kind] ?? []) segments.push({ kind, start: (item.start_ms ?? 0) / 1000, end: item.end_ms / 1000 })
      }
    }
    // Conflicting overlapping submissions are not safe for automatic jumps.
    const ordered = segments.filter((segment) => skipSegmentSchema.safeParse(segment).success && segment.end > segment.start && segment.end <= duration && segment.end - segment.start <= 600).sort((a, b) => a.start - b.start)
    const unique = [...new Map(ordered.map((segment) => [`${segment.kind}:${segment.start}:${segment.end}`, segment])).values()]
    return unique.filter((segment, index) => !unique.some((other, otherIndex) => index !== otherIndex && segment.start < other.end && other.start < segment.end)).slice(0, 8)
  }
  return { async read(ref, durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > 86400) return []
    const duration = Math.round(durationSeconds)
    const key = `${ref.kind}:${ref.id}:${ref.season ?? 0}:${ref.episode ?? 0}:${duration}`
    const stored = cache.get(key)
    if (stored && stored.until > Date.now()) return stored.segments
    const inFlight = pending.get(key)
    if (inFlight) return inFlight
    if (pending.size >= 32) return []
    const signal = AbortSignal.timeout(3000)
    let finish: (() => void) | undefined
    const deadline = new Promise<Segment[]>((resolve) => { finish = () => resolve([]); signal.addEventListener('abort', finish, { once: true }) })
    const request = Promise.race([lookup(ref, duration, signal).catch(() => []), deadline]).then((segments) => {
      cache.delete(key)
      cache.set(key, { until: Date.now() + (segments.length ? 6 * 60 * 60_000 : 60_000), segments })
      if (cache.size > 500) cache.delete(cache.keys().next().value!)
      return segments
    }).finally(() => { if (finish) signal.removeEventListener('abort', finish); pending.delete(key) })
    pending.set(key, request)
    return request
  } }
}
