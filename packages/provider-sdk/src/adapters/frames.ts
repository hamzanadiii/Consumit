import { z } from 'zod'
import type { FrameSandbox } from '@consumit/contracts'
import type { ProviderInput, ProviderSource } from '../index.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'
import { adapter, document, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

export const FRAME_IDS = ['reanimeframe', 'megaplayframe', 'apiplayerframe', 'embedapiframe', 'vsembedframe', 'vidcoreioframe', 'cinesrcframe', 'vidriftframe'] as const
export type FrameId = typeof FRAME_IDS[number]
/** Published players that refuse any sandboxed frame (browser-verified
 *  2026-10-08: MegaPlay plays and VsEmbed loads its player only without one,
 *  while every sandbox, including pop-ups and top navigation, is refused).
 *  They are framed as plain iframes; the rest keep the standard sandbox. */
const SANDBOX_REFUSING = new Set<FrameId>(['megaplayframe', 'vsembedframe'])
const serversSchema = z.object({ servers: z.array(z.object({ dataLink: z.string().max(4096), dataType: z.string().max(16) })).max(32) })
const searchSchema = z.object({ data: z.array(z.object({ slug: z.string().min(1).max(100), anilistId: z.number() })).max(100) })
const lanesSchema = z.object({ servers: z.array(z.object({ id: z.string(), subTypes: z.array(z.string()).default([]) })).max(32) })
const embedsSchema = z.object({ embeds: z.array(z.object({ status: z.string(), url: z.string().max(4096) })).max(32) })

/** VidRift keys its catalog by the same subtitles its player consumes; a
 *  200 WEBVTT answer for any reviewed language means the title is cataloged
 *  and its in-frame lanes will play. */
const VIDRIFT_SUB_LANGS = ['en', 'es', 'fr', 'de', 'pt', 'ar'] as const

function frameUrl(value: string, host: string, path: RegExp) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || !path.test(url.pathname)) throw new ProviderFailure('malformed')
  return url.href
}

/** TMDB-id embed shapes for the movie/series frame family. CineSrc's TV
 *  embed is a series picker in-frame, so its URL carries no season or
 *  episode and the member chooses the exact episode inside the player. */
function movieSeriesFrameUrl(id: FrameId, ref: ProviderInput['ref']): string {
  if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
  if (id === 'vidcoreioframe') {
    return ref.kind === 'movie'
      ? `https://vidcore.io/movie/${ref.id}`
      : `https://vidcore.io/tv/${ref.id}/${ref.season}/${ref.episode}`
  }
  if (id === 'cinesrcframe') return `https://cinesrc.st/embed/${ref.kind === 'movie' ? 'movie' : 'tv'}/${ref.id}`
  if (id === 'vidriftframe') {
    return ref.kind === 'movie'
      ? `https://embed.vidrift.net/embed/movie/${ref.id}`
      : `https://embed.vidrift.net/embed/tv/${ref.id}/${ref.season}/${ref.episode}`
  }
  const path = ref.kind === 'movie' ? `/embed/movie/${ref.id}` : `/embed/tv/${ref.id}/${ref.season}/${ref.episode}`
  return id === 'apiplayerframe' ? `https://apiplayer.ru${path}` : id === 'embedapiframe' ? `https://watch.embed-api.stream${path}`
    : `https://vsembed.ru/embed/${ref.kind === 'movie' ? 'movie' : 'tv'}?tmdb=${ref.id}${ref.kind === 'series' ? `&season=${ref.season}&episode=${ref.episode}` : ''}`
}

/** Page-liveness markers; a player shell must be present before the frame
 *  becomes a source. Page liveness is not playback evidence. */
function pageShellMatches(id: FrameId, text: string): boolean {
  if (id === 'apiplayerframe') return /jw-server-list/i.test(text)
  if (id === 'embedapiframe') return /embeddable movie and tv player/i.test(text)
  if (id === 'vidcoreioframe') return text.length >= 10_000 && /vidcore/i.test(text)
  if (id === 'cinesrcframe') return /streaming servers/i.test(text)
  return true
}

async function vidriftCatalogued(http: ProviderHttp, ref: ProviderInput['ref'], embedUrl: string, signal: AbortSignal): Promise<boolean> {
  const id = String(ref.id)
  const settled = await Promise.allSettled(VIDRIFT_SUB_LANGS.map(async (lang) => {
    const url = ref.kind === 'movie'
      ? `https://embed.vidrift.net/api/subtitles/movie/${encodeURIComponent(id)}/${lang}`
      : `https://embed.vidrift.net/api/subtitles/tv/${encodeURIComponent(id)}/${ref.season}/${ref.episode}/${lang}`
    const response = await http(url, { 'user-agent': userAgent, accept: '*/*', referer: embedUrl }, signal)
    return response.status >= 200 && response.status < 300 && response.text.includes('WEBVTT')
  }))
  return settled.some((result) => result.status === 'fulfilled' && result.value)
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
      url = movieSeriesFrameUrl(id, ref)
    }
    // VidRift bot-walls the embed page to datacenter fetches, so its
    // keyless subtitle API doubles as the catalog gate instead.
    if (id === 'vidriftframe') {
      if (!(await vidriftCatalogued(http, ref, url, signal))) throw new ProviderFailure('empty')
    } else {
      const page = await document(http, url, signal, { accept: 'text/html' })
      if (!pageShellMatches(id, page.text)) throw new ProviderFailure('empty')
    }
    const frameSandbox: FrameSandbox | undefined = SANDBOX_REFUSING.has(id) ? 'none' : undefined
    return [{ key: 'frame', url, type: 'iframe', language, expiresAt: new Date(now() + 1_800_000).toISOString(), headers: {}, subtitles: [], ...(frameSandbox ? { frameSandbox } : {}) } satisfies ProviderSource]
  })
}
