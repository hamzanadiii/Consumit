import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const siteOrigin = 'https://epeng.animeapps.top'

// Port of the PROVE AniBD recipe: AniList-keyed JSON API, direct HLS via
// player pages.
//   /api2.php?epid={anilistId} (server groups + episode links)
//   -> /apilink.php?data= (player links)
//   -> player page videoUrl:"..." -> absolute HLS URL.
// Server groups mentioning dub serve dub requests; otherwise the first
// groups answer. Gate note: playlists serve bare (no Referer gate) but
// without CORS headers, so they ride the Worker proxy; segments stream
// direct (CORS-open) once the manifest is rewritten through it.

const groupsSchema = z.array(z.object({
  server_name: z.string().max(64).optional(),
  server_data: z.array(z.object({
    name: z.unknown().optional(),
    slug: z.unknown().optional(),
    link: z.string().max(4096).optional(),
  }).passthrough()).optional(),
}).passthrough())

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('AniBD step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createAnibdProvider(http: ProviderHttp, now = Date.now) {
  return adapter('anibd', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'
    const episode = ref.episode
    const op = bounded(signal, 12000)
    try {
      const groupsRes = await document(http, `${siteOrigin}/api2.php?epid=${ref.id}`, op.signal, { accept: 'application/json', referer: `${siteOrigin}/` })
      let groups: z.infer<typeof groupsSchema> = []
      try {
        groups = groupsSchema.parse(JSON.parse(groupsRes.text))
      } catch {
        throw new ProviderFailure('malformed')
      }
      if (!groups.length) throw new ProviderFailure('empty')
      const wanted = groups.filter((group) => String(group?.server_name ?? '').toLowerCase().includes(audio))
      const useGroups = (wanted.length ? wanted : groups).slice(0, 3)
      const sources: ProviderSource[] = []
      for (const group of useGroups) {
        const items = Array.isArray(group?.server_data) ? group.server_data : []
        const match = items.find((item) => {
          const raw = item?.name ?? item?.slug
          return Number(raw) === episode
        })
        if (!match?.link) continue
        let links: unknown[] = []
        try {
          const data = await document(http, `${siteOrigin}/apilink.php?data=${encodeURIComponent(match.link)}`, op.signal, { accept: 'application/json', referer: `${siteOrigin}/` })
          const parsed: unknown = JSON.parse(data.text)
          links = Array.isArray(parsed) ? parsed : []
        } catch {
          continue
        }
        for (const entry of links.slice(0, 4)) {
          const record = entry as { link?: unknown; server?: unknown }
          const link = String(record?.link ?? '')
          if (!/^https?:\/\//.test(link)) continue
          try {
            const page = new URL(link)
            const html = await document(http, link, op.signal, { accept: 'text/html', referer: `${page.protocol}//${page.host}/` })
            const found = html.text.match(/videoUrl\s*:\s*"([^"]+)"/)?.[1]
            if (!found) continue
            const hls = /^https?:\/\//i.test(found) ? found : `${page.protocol}//${page.host}${found.startsWith('/') ? found : `/${found}`}`
            const server = String(record?.server ?? 'CDN').slice(0, 20)
            sources.push({
              key: `anibd:${server.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${episode}:${sources.length}`,
              url: hls,
              type: 'hls',
              qualityHint: 'Auto',
              expiresAt: accessDeadline(hls, now()),
              language: dub ? 'en' : 'original',
              headers: { referer: `${page.protocol}//${page.host}/`, 'user-agent': userAgent },
              subtitles: [],
            })
            if (sources.length >= 3) break
          } catch {
            if (signal.aborted) throw signal.reason
            // next link
          }
        }
        if (sources.length >= 3) break
      }
      if (!sources.length) throw new ProviderFailure('empty')
      return sources
    } finally {
      op.cleanup()
    }
  })
}
