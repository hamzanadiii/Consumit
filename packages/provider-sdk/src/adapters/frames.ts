import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'
import { adapter, document, ProviderFailure, type ProviderHttp } from './http.ts'

export const FRAME_IDS = ['reanimeframe', 'megaplayframe', 'apiplayerframe', 'embedapiframe', 'vsembedframe'] as const
export type FrameId = typeof FRAME_IDS[number]
const serversSchema = z.object({ servers: z.array(z.object({ dataLink: z.string().max(4096), dataType: z.string().max(16) })).max(32) })
const searchSchema = z.object({ data: z.array(z.object({ slug: z.string().min(1).max(100), anilistId: z.number() })).max(100) })
const lanesSchema = z.object({ servers: z.array(z.object({ id: z.string(), subTypes: z.array(z.string()).default([]) })).max(32) })
const embedsSchema = z.object({ embeds: z.array(z.object({ status: z.string(), url: z.string().max(4096) })).max(32) })

function frameUrl(value: string, host: string, path: RegExp) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || !path.test(url.pathname)) throw new ProviderFailure('malformed')
  return url.href
}

/** Third-party controls stay inside the frame. Page liveness is not playback evidence. */
export function createFrameProvider(id: FrameId, http: ProviderHttp, titles?: AnimeTitleVariantsResolver, now = Date.now) {
  return adapter(id, async (input, signal) => {
    const { ref } = input
    let url: string
    let language = 'original'
    if (id === 'reanimeframe' || id === 'megaplayframe') {
      if (ref.kind !== 'anime') throw new ProviderFailure('empty')
      const requested = input.audioLanguage.split('-')[0]
      if (requested !== 'en' && requested !== 'ja') throw new ProviderFailure('empty')
      const lane = requested === 'en' ? 'dub' : 'sub'
      language = requested
      if (id === 'reanimeframe') {
        // This endpoint is canonical AniList + episode; title search must never
        // substitute the 2007 show for the distinct 2025 Netflix series.
        const response = await document(http, `https://reanime.to/api/flix/${ref.id}/${ref.episode}`, signal)
        const servers = serversSchema.parse(JSON.parse(response.text)).servers
        const selected = servers.find(server => server.dataType.toLowerCase() === lane)
        if (!selected) throw new ProviderFailure('empty')
        url = frameUrl(selected.dataLink, 'flixcloud.cc', /^\/e\/[a-zA-Z0-9_-]+$/)
      } else {
        const variants = [...new Set(await titles?.(ref.id, signal) ?? [])].slice(0, 3)
        let slug: string | undefined
        for (const title of variants) {
          const response = await document(http, `https://anikage.cc/api/media/anime/search?q=${encodeURIComponent(title)}`, signal)
          slug = searchSchema.parse(JSON.parse(response.text)).data.find(hit => hit.anilistId === ref.id)?.slug
          if (slug) break
        }
        if (!slug) throw new ProviderFailure('empty')
        const base = `https://anikage.cc/api/media/anime/${encodeURIComponent(slug)}/episodes/${ref.episode}`
        const servers = lanesSchema.parse(JSON.parse((await document(http, `${base}/servers`, signal)).text)).servers
        if (!servers.some(server => server.id.toLowerCase() === 'koto' && server.subTypes.includes(lane))) throw new ProviderFailure('empty')
        const embeds = embedsSchema.parse(JSON.parse((await document(http, `${base}/sources?provider=koto&lang=${lane}&server=koto`, signal)).text)).embeds
        const selected = embeds.filter(embed => embed.status === 'ok' && /^https:\/\/megaplay\.buzz\//.test(embed.url)).sort((a, b) => Number(b.url.includes('/videojs/')) - Number(a.url.includes('/videojs/')))[0]
        if (!selected) throw new ProviderFailure('empty')
        url = frameUrl(selected.url, 'megaplay.buzz', /^\/(?:videojs\/)?[a-zA-Z0-9_/-]+$/)
      }
    } else {
      if (ref.kind === 'anime') throw new ProviderFailure('empty')
      const path = ref.kind === 'movie' ? `/embed/movie/${ref.id}` : `/embed/tv/${ref.id}/${ref.season}/${ref.episode}`
      url = id === 'apiplayerframe' ? `https://apiplayer.ru${path}` : id === 'embedapiframe' ? `https://watch.embed-api.stream${path}`
        : `https://vsembed.ru/embed/${ref.kind === 'movie' ? 'movie' : 'tv'}?tmdb=${ref.id}${ref.kind === 'series' ? `&season=${ref.season}&episode=${ref.episode}` : ''}`
    }
    const page = await document(http, url, signal, { accept: 'text/html' })
    if (id === 'apiplayerframe' && !/jw-server-list/i.test(page.text) || id === 'embedapiframe' && !/embeddable movie and tv player/i.test(page.text)) throw new ProviderFailure('empty')
    return [{ key: 'frame', url, type: 'iframe', language, expiresAt: new Date(now() + 1_800_000).toISOString(), headers: {}, subtitles: [] } satisfies ProviderSource]
  })
}
