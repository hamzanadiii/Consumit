import { z } from 'zod'
import type { FrameSandbox } from '@consumit/contracts'
import type { ProviderInput, ProviderSource } from '../index.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'
import { adapter, document, ProviderFailure, type ProviderHttp } from './http.ts'

export const FRAME_IDS = ['reanimeframe', 'megaplayframe', 'apiplayerframe', 'embedapiframe', 'vsembedframe', 'vidcoreioframe', 'cinesrcframe', 'vidriftframe', 'vixsrcframe', 'vidfastframe', 'vidapiframe', 'moviesapiframe', 'vidlinkframe', 'vidnestframe'] as const
export type FrameId = typeof FRAME_IDS[number]
export function isFrameProviderId(value: string): value is FrameId { return FRAME_IDS.some(id => id === value) }

/** Browser entry origins for the additional movie/series frame choices.
 * VidAPI publishes vaplayer.ru as its player host. These are documents,
 * never media/CDN authority for their separate Direct adapters. */
export const MOVIE_FRAME_HOSTS = {
  vidapiframe: 'vaplayer.ru', vidfastframe: 'vidfast.vc', vidcoreioframe: 'vidcore.io',
  vidriftframe: 'embed.vidrift.net', moviesapiframe: 'moviesapi.to',
  vidlinkframe: 'vidlink.pro', vidnestframe: 'vidnest.fun',
} as const
/** Published players that refuse any sandboxed frame (browser-verified
 *  2026-10-08: MegaPlay plays and VsEmbed loads its player only without one,
 *  while every sandbox, including pop-ups and top navigation, is refused;
 *  2026-10-11: Vixsrc movie and series decode only in the plain-frame control).
 *  They are framed as plain iframes; the rest keep the standard sandbox. */
const SANDBOX_REFUSING = new Set<FrameId>(['megaplayframe', 'vsembedframe', 'vixsrcframe'])
const serversSchema = z.object({ servers: z.array(z.object({ dataLink: z.string().max(4096), dataType: z.string().max(16) })).max(32) })
const searchSchema = z.object({ data: z.array(z.object({ slug: z.string().min(1).max(100), anilistId: z.number() })).max(100) })
const lanesSchema = z.object({ servers: z.array(z.object({ id: z.string(), subTypes: z.array(z.string()).default([]) })).max(32) })
const embedsSchema = z.object({ embeds: z.array(z.object({ status: z.string(), url: z.string().max(4096) })).max(32) })

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
  if (id === 'vidapiframe') return ref.kind === 'movie' ? `https://vaplayer.ru/embed/movie/${ref.id}` : `https://vaplayer.ru/embed/tv/${ref.id}/${ref.season}/${ref.episode}`
  if (id === 'moviesapiframe' || id === 'vidlinkframe' || id === 'vidnestframe') {
    const host = MOVIE_FRAME_HOSTS[id]
    return ref.kind === 'movie' ? `https://${host}/movie/${ref.id}` : `https://${host}/tv/${ref.id}/${ref.season}/${ref.episode}`
  }
  if (id === 'vixsrcframe') return ref.kind === 'movie' ? `https://vixsrc.to/movie/${ref.id}` : `https://vixsrc.to/tv/${ref.id}/${ref.season}/${ref.episode}`
  if (id === 'vidcoreioframe') {
    return ref.kind === 'movie'
      ? `https://vidcore.io/movie/${ref.id}`
      : `https://vidcore.io/tv/${ref.id}/${ref.season}/${ref.episode}`
  }
  if (id === 'vidfastframe') {
    return ref.kind === 'movie'
      ? `https://vidfast.vc/movie/${ref.id}`
      : `https://vidfast.vc/tv/${ref.id}/${ref.season}/${ref.episode}`
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

/** Third-party controls stay inside the frame. Lookup maps reviewed identity
 *  to a published player URL; the viewer loads that page from their network. */
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
    // Frame pages load from the viewer, not from the resolving Worker.
    // A page probe from a different egress can falsely reject a playable
    // frame. Canonical URLs and mapped anime URLs are already host/path
    // constrained; browser frame recovery handles unavailable titles.
    if (id === 'vixsrcframe') {
      // Published canonical browser player. OVH page lookup is challenged,
      // so this is a frame candidate, never server/playback health evidence.
      // The viewer loads it; existing frame failure/reload controls apply.
      const frame = new URL(url)
      frame.searchParams.set('autoplay', 'true')
      if (/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(input.audioLanguage) && input.audioLanguage.length <= 32) frame.searchParams.set('lang', input.audioLanguage.split('-')[0]!)
      url = frame.href
    }
    const frameSandbox: FrameSandbox | undefined = SANDBOX_REFUSING.has(id) ? 'none' : undefined
    return [{ key: 'frame', url, type: 'iframe', language, expiresAt: new Date(now() + 1_800_000).toISOString(), headers: {}, subtitles: [], ...(frameSandbox ? { frameSandbox } : {}) } satisfies ProviderSource]
  })
}
