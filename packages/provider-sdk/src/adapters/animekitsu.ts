import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'

const siteOrigin = 'https://animekitsu.com'

// Port of the PROVE AnimeKitsu recipe (verified live 2026-09-25): an EN-only,
// sub-only catalog serving direct CDN mp4. `live-search` answers JSON over the
// site's own partial index (substring search; an absent title is an honest
// empty), the anime page inlines `allEpisodes = [...]` mapping canonical
// episode numbers to watch URLs, and the watch page carries
// `const source="/stream.php?file=<b64url>"` whose decoded file is a bare
// cdn.animekitsu.com mp4 that answers 206 with ACAO * whenever the browser
// sends Origin. stream.php itself is Referer-gated and is never fetched —
// only decoded. Watch pages ship no <track> captions and the catalog has no
// dub entries, so dub requests keep the sub track under the
// dub-falls-back-to-sub convention.
const SEARCH_MS = 10_000
const PAGE_MS = 12_000
const WATCH_MS = 12_000

const searchSchema = z.object({
  data: z.array(z.object({ slug: z.string().max(256), title: z.string().max(512) }).nullable().catch(null)).default([]),
})

/** String-aware scan of a JSON array literal assigned to `key = [...]`; a
 *  bracket inside a string value must not end the scan early. */
function extractAssignedArray(html: string, key: string): unknown[] | null {
  const at = html.search(new RegExp(`\\b${key}\\s*=\\s*\\[`))
  if (at < 0) return null
  const start = html.indexOf('[', at)
  let depth = 0
  let inStr: string | null = null
  for (let i = start; i < html.length; i++) {
    const c = html[i]!
    if (inStr) {
      if (c === '\\') i++
      else if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'") inStr = c
    else if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(html.slice(start, i + 1))
          return Array.isArray(parsed) ? parsed : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** base64url `file=` payload -> absolute CDN url; the padded decode never
 *  runs the Referer-gated stream.php itself. */
function decodeStreamFile(param: string): string {
  const b64 = decodeURIComponent(param).replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8').trim()
}

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
  const timer = setTimeout(() => controller.abort(new DOMException('AnimeKitsu step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createAnimeKitsuProvider(
  http: ProviderHttp,
  resolveTitle: AnimeTitleResolver,
  now = Date.now,
  resolveTitleVariants?: AnimeTitleVariantsResolver,
) {
  return Object.assign(adapter('animekitsu', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    if (input.audioLanguage.toLowerCase().split('-')[0] !== 'ja') throw new ProviderFailure('empty')
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')

    let searchTitles = [title]
    if (resolveTitleVariants) {
      try {
        searchTitles = [...new Set([...(await resolveTitleVariants(ref.id, signal)), title]
          .map((candidate) => candidate.trim())
          .filter(Boolean))]
      } catch {
        // Keep the canonical AniList title when alias metadata is unavailable.
      }
    }

    // The live index is substring based and often stores a short season title
    // (for example, "Jujutsu Kaisen Season 3") while AniList returns a long
    // descriptive title. Search the base aliases first, then compare matches
    // against every canonical title above.
    const queryCandidates = [...searchTitles.map((candidate) =>
      candidate.split(/\s*[:：]\s*/)[0]!.replace(/\s+(?:season|s)\s*\d+(?:\s.*)?$/i, '').trim(),
    ), ...searchTitles].filter(Boolean)
    const searchQueries = [...new Map(queryCandidates.map((candidate) => [candidate.toLowerCase(), candidate])).values()]

    const headers = {
      'user-agent': userAgent,
      referer: `${siteOrigin}/`,
    }

    // Search -> best title match over the partial catalog.
    let slug: string
    {
      let best: { slug: string; title: string } | null = null
      let bestScore = -1
      for (const query of searchQueries.slice(0, 3)) {
        const op = bounded(signal, SEARCH_MS)
        try {
          const response = await document(http, `${siteOrigin}/live-search?q=${encodeURIComponent(query)}`, op.signal, { ...headers, accept: 'application/json' })
          const data = searchSchema.parse(JSON.parse(response.text))
          for (const item of data.data) {
            if (!item) continue
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
      slug = best.slug
    }

    // Anime page -> inline episode list -> canonical episode -> watch url.
    let watchUrl: string
    {
      const op = bounded(signal, PAGE_MS)
      try {
        const response = await document(http, `${siteOrigin}/anime/${encodeURIComponent(slug)}`, op.signal, { ...headers, accept: 'text/html' })
        const episodes = extractAssignedArray(response.text, 'allEpisodes')
        const target = episodes?.find((entry) => Number((entry as Record<string, unknown> | null)?.episode_number) === Number(ref.episode)) as Record<string, unknown> | undefined
        const href = String(target?.video_url || target?.video_url2 || '')
        if (!href) throw new ProviderFailure('empty')
        try {
          watchUrl = new URL(href, siteOrigin).toString()
        } catch {
          throw new ProviderFailure('empty')
        }
      } finally {
        op.cleanup()
      }
    }

    // Watch page -> source const -> decoded CDN mp4.
    let url: string
    {
      const op = bounded(signal, WATCH_MS)
      try {
        const response = await document(http, watchUrl, op.signal, { ...headers, accept: 'text/html' })
        const match = response.text.match(/const\s+source\d*\s*=\s*["']([^"']+)["']/)
        const fileParam = match?.[1]?.includes('file=') ? match[1].split('file=')[1] : null
        if (!fileParam) throw new ProviderFailure('empty')
        try {
          url = decodeStreamFile(fileParam)
        } catch {
          throw new ProviderFailure('empty')
        }
        if (!/^https:\/\//.test(url)) throw new ProviderFailure('empty')
      } finally {
        op.cleanup()
      }
    }

    let expiresAt: string
    try {
      expiresAt = accessDeadline(url, now())
    } catch {
      throw new ProviderFailure('empty')
    }
    const source: ProviderSource = {
      key: `animekitsu:sub:${ref.episode}`,
      url,
      type: 'native',
      expiresAt,
      headers: {},
      language: 'original',
      qualityHint: 'auto',
      subtitles: [],
    }
    return [source]
  }), { audioLanguages: ['ja'] as const })
}
