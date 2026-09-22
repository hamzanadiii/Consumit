import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, parseSkipSegments, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

const siteOrigin = 'https://123anime.la'
const apiOrigin = 'https://123anime.la'

// Port of the PROVE 123Anime recipe: plain HTML + JSON, no crypto.
//   search?keyword= -> /anime/{slug} cards (dub lives in -dub entries)
//   ajax/episode/info?epr={slug}/{ep}/vidstreaming.io -> embed target
//   embed var zrpart2 -> {host}/hs/{key} -> data-id -> hs/getSources
//   -> master m3u8 + tracks + intro/outro on the dpopdrop89 edge family
// (bare 200, CORS-open, browser-direct). The getSources thumbnail track
// is storyboard data, not captions, so it never becomes a subtitle.
const HOP_TIMEOUT_MS = 4000

const infoSchema = z.object({ target: z.string().max(4096).optional() }).passthrough()
const sourcesSchema = z.object({
  sources: z.string().max(4096).optional(),
  tracks: z.array(z.object({ file: z.string().max(4096).optional(), kind: z.string().max(32).optional(), label: z.string().max(128).optional() }).passthrough()).optional(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('123Anime step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function titleScore(haystack: string, needle: string): number {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const a = clean(haystack)
  const b = clean(needle)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.7
  const aWords = new Set(a.split(' '))
  const bWords = b.split(' ')
  const overlap = bWords.filter((word) => word.length > 2 && aWords.has(word)).length
  return overlap / Math.max(1, bWords.length) * 0.6
}

export function createAnime123Provider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now) {
  return adapter('anime123', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    // Explicit English requests dub, everything else plays sub.
    const dub = input.audioLanguage === 'en'
    const episode = ref.episode
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')

    // 1. Search -> best /anime/ slug (dub lives in -dub entries).
    let slug = ''
    let slugIsDub = false
    {
      const op = bounded(signal, HOP_TIMEOUT_MS)
      try {
        const res = await document(http, `${apiOrigin}/search?keyword=${encodeURIComponent(title)}`, op.signal, { referer: `${siteOrigin}/` })
        const hits: Array<{ slug: string; name: string }> = []
        const seen = new Set<string>()
        for (const m of res.text.matchAll(/href="(?:https?:\/\/[^/]+)?\/anime\/([^"/?#]+)\/?"[^>]*>([^<]{2,100})</gi)) {
          const candidate = m[1]
          if (!candidate || seen.has(candidate)) continue
          seen.add(candidate)
          hits.push({ slug: candidate, name: (m[2] ?? '').replace(/<[^>]+>/g, '').trim() })
        }
        let best = ''
        let bestScore = 0
        for (const hit of hits.slice(0, 15)) {
          const score = Math.max(titleScore(hit.name, title), titleScore(hit.slug.replace(/-/g, ' '), title))
          if (score > bestScore) { bestScore = score; best = hit.slug }
        }
        if (bestScore <= 0) throw new ProviderFailure('empty')
        if (dub && !/-dub$/i.test(best)) {
          const stem = best.replace(/-dub$/i, '')
          const dubHit = hits.find((h) => h.slug.toLowerCase() === `${stem}-dub` || (/-dub$/i.test(h.slug) && titleScore(h.name, title) > 0.5))
          if (dubHit) best = dubHit.slug
        }
        slug = best
        slugIsDub = /-dub$/i.test(slug)
      } finally {
        op.cleanup()
      }
    }
    if (!slug) throw new ProviderFailure('empty')
    const usedDub = slugIsDub

    // 2. Episode info -> embed target.
    let target = ''
    {
      const op = bounded(signal, HOP_TIMEOUT_MS)
      try {
        const res = await document(http,
          `${apiOrigin}/ajax/episode/info?epr=${encodeURIComponent(slug)}%2F${episode}%2Fvidstreaming.io&ts=001`,
          op.signal,
          { 'x-requested-with': 'XMLHttpRequest', referer: `${siteOrigin}/anime/${slug}/episode/${String(episode).padStart(3, '0')}` })
        target = String(infoSchema.parse(JSON.parse(res.text)).target ?? '')
      } finally {
        op.cleanup()
      }
    }
    if (!/^https?:\/\//.test(target)) throw new ProviderFailure('empty')

    // 3. Embed hops -> getSources.
    const op = bounded(signal, HOP_TIMEOUT_MS)
    try {
      const e1 = await document(http, target, op.signal, { referer: `${siteOrigin}/` })
      const zr = e1.text.match(/var zrpart2\s*=\s*'([^']+)'/)?.[1]
      if (!zr) throw new ProviderFailure('empty')
      const ehost = target.split('/').slice(0, 3).join('/')
      const e2 = await document(http, `${ehost}/hs/${zr}`, op.signal, { referer: target })
      const dataId = e2.text.match(/data-id="([^"]+)"/)?.[1]
      if (!dataId) throw new ProviderFailure('empty')
      const e3 = await document(http, `${ehost}/hs/getSources?id=${encodeURIComponent(dataId)}`, op.signal, {
        'x-requested-with': 'XMLHttpRequest', referer: `${ehost}/hs/${zr}`,
      })
      const stream = sourcesSchema.parse(JSON.parse(e3.text))
      const m3u8 = String(stream.sources ?? '')
      if (!/^https?:\/\//.test(m3u8)) throw new ProviderFailure('empty')
      const type = mediaType(m3u8) ?? 'hls'
      return [{
        key: `anime123:${usedDub ? 'dub' : 'sub'}:${episode}:0`,
        url: m3u8,
        type,
        qualityHint: 'Auto',
        expiresAt: accessDeadline(m3u8, now()),
        language: usedDub ? 'en' : 'original',
        headers: { referer: `${ehost}/`, 'user-agent': userAgent },
        subtitles: [],
        skipSegments: parseSkipSegments(stream),
      }]
    } finally {
      op.cleanup()
    }
  })
}
