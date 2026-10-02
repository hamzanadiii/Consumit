import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, parseSkipSegments, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

const apiOrigin = 'https://api.animeparadise.moe'
const wwwOrigin = 'https://www.animeparadise.moe'
const streamOrigin = 'https://stream.animeparadise.moe'

// Port of the PROVE AnimeParadise recipe (verified live 2026-09-25): an open
// JSON API searches the canonical title, the episode list maps the canonical
// AniList number to a uid, and the episode detail returns a streamLink served
// through a bare direct HLS proxy — master, variant, and segments answer 200
// with ACAO * and no Referer gate. The site only supplies sub audio, so dub
// requests return no source. Episode detail also carries intro/outro skip marks.

// Per-request bound follows the PROVE recipe's 12s fetch timeout. A typical
// chain resolves in ~1.5s; 1000+-episode catalogs take up to ~12s because the
// episode list and detail endpoints scale with series size.
const STEP_MS = 12000

export type AnimeTitleVariantsResolver = (anilistId: number, signal: AbortSignal) => Promise<readonly string[]>

const searchSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(z.object({ _id: z.string().max(64), title: z.string().max(512) })).default([]),
})
const episodeListSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(z.object({
    uid: z.string().max(64),
    number: z.union([z.string().max(16), z.number()]),
    origin: z.string().max(64).optional(),
  })).default([]),
})
const episodeDetailSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    episode: z.object({
      streamLink: z.string().max(4096),
      origin: z.string().max(64).optional(),
      subData: z.array(z.object({
        src: z.string().max(4096),
        label: z.string().max(64).optional(),
        type: z.string().max(16).optional(),
      })).optional(),
      skipData: z.unknown().optional(),
    }).optional(),
  }),
})

/** Title similarity for search-result matching (0..1), from the PROVE base recipe. */
function titleScore(a: string, b: string): number {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xw = new Set(x.split(' '))
  const yw = new Set(y.split(' '))
  let inter = 0
  for (const word of xw) if (yw.has(word)) inter++
  return inter / Math.max(xw.size, yw.size)
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('AnimeParadise step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function mapSubtitle(track: { src: string; label?: string | undefined; type?: string | undefined }, id: string, index: number): ProviderSource['subtitles'][number] | null {
  if (!track.src.startsWith('https://')) return null
  const label = (track.label || 'English').slice(0, 64)
  const format = track.type === 'srt' || track.type === 'ass' ? track.type : 'vtt'
  return { id: `${id}-sub-${index}`, label, language: label.slice(0, 32), url: track.src, format }
}

export function createAnimeParadiseProvider(
  http: ProviderHttp,
  resolveTitle: AnimeTitleResolver,
  now = Date.now,
  resolveTitleVariants?: AnimeTitleVariantsResolver,
) {
  return adapter('animeparadise', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    // AnimeParadise is sub-only. Keep the real original-audio track available
    // when a caller prefers English; the returned source still identifies it
    // as original, so it is never mislabeled as a dub.
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')

    // PROVE searches AniList's English, romaji, and native titles. Keep those
    // aliases here too: the catalog's preferred title is not always the one
    // AnimeParadise indexed, and an alias lookup must not block the canonical
    // fallback if metadata enrichment is temporarily unavailable.
    let searchTitles = [title]
    if (resolveTitleVariants) {
      try {
        searchTitles = [...new Set([...(await resolveTitleVariants(ref.id, signal)), title]
          .map((candidate) => candidate.trim())
          .filter(Boolean))]
      } catch {
        // Continue with the canonical title resolved above.
      }
    }

    const headers = {
      'user-agent': userAgent,
      origin: wwwOrigin,
      referer: `${wwwOrigin}/`,
      accept: 'application/json',
    }

    // Search the best AniList title variants -> best AnimeParadise match.
    let best: { _id: string; title: string } | null = null
    let bestScore = -1
    const seen = new Set<string>()
    for (const query of searchTitles.slice(0, 3)) {
      const op = bounded(signal, STEP_MS)
      try {
        const response = await document(http, `${apiOrigin}/search?q=${encodeURIComponent(query)}`, op.signal, headers)
        const data = searchSchema.parse(JSON.parse(response.text))
        if (data.success === false) continue
        for (const item of data.data) {
          if (seen.has(item._id)) continue
          seen.add(item._id)
          const score = Math.max(...searchTitles.map((candidate) => titleScore(item.title, candidate)))
          if (score > bestScore) {
            bestScore = score
            best = item
          }
        }
        if (bestScore >= 0.9) break
      } finally {
        op.cleanup()
      }
    }
    if (!best || bestScore < 0.4) throw new ProviderFailure('empty')
    const show = best

    // Episode list -> uid for the canonical episode number.
    let target: { uid: string; origin?: string | undefined }
    {
      const op = bounded(signal, STEP_MS)
      try {
        const response = await document(http, `${apiOrigin}/anime/${show._id}/episode`, op.signal, headers)
        const data = episodeListSchema.parse(JSON.parse(response.text))
        if (data.success === false) throw new ProviderFailure('empty')
        const found = data.data.find((entry) => String(entry.number) === String(ref.episode))
        if (!found) throw new ProviderFailure('empty')
        target = { uid: found.uid, origin: found.origin }
      } finally {
        op.cleanup()
      }
    }

    // Episode detail -> streamLink plus captions and skip marks.
    const originId = target.origin ?? show._id
    let episode: z.infer<typeof episodeDetailSchema>['data']['episode']
    {
      const op = bounded(signal, STEP_MS)
      try {
        const response = await document(http, `${apiOrigin}/ep/${target.uid}?origin=${encodeURIComponent(originId)}`, op.signal, headers)
        const data = episodeDetailSchema.parse(JSON.parse(response.text))
        if (data.success === false) throw new ProviderFailure('empty')
        episode = data.data.episode
      } finally {
        op.cleanup()
      }
    }
    if (!episode?.streamLink) throw new ProviderFailure('empty')

    const url = `${streamOrigin}/m3u8?url=${encodeURIComponent(episode.streamLink)}`
    let expiresAt: string
    try {
      expiresAt = accessDeadline(url, now())
    } catch {
      throw new ProviderFailure('empty')
    }
    const subtitles = (episode.subData ?? [])
      .map((track, index) => mapSubtitle(track, 'animeparadise', index))
      .filter((track): track is NonNullable<typeof track> => track !== null)
      .slice(0, 20)
    const skipSegments = parseSkipSegments(episode.skipData)
    const source: ProviderSource = {
      key: `animeparadise:sub:${ref.episode}`,
      url,
      type: 'hls',
      expiresAt,
      headers: {},
      language: 'original',
      qualityHint: 'auto',
      subtitles,
      ...(skipSegments.length ? { skipSegments } : {}),
    }
    return [source]
  })
}
