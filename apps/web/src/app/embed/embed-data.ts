import 'server-only'

import { getCatalogTitle } from '@/lib/catalog-api'
import type { EmbedSource, EmbedSub } from './embed-player'

type EmbedStreamResponse = {
  success?: boolean
  sources?: EmbedSource[]
  subtitles?: EmbedSub[]
}

function apiBaseUrl() {
  return (process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
}

/** Resolve configured sources for the public embed route. Failures stay
 *  honest: the page renders the empty state, never a fixture or demo. */
export async function fetchEmbedStreams(path: string, lang?: string | undefined): Promise<{
  sources: EmbedSource[]
  subtitles: EmbedSub[]
}> {
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : ''
  try {
    const res = await fetch(`${apiBaseUrl()}${path}${query}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    })
    if (!res.ok) return { sources: [], subtitles: [] }
    const data = await res.json() as EmbedStreamResponse
    if (!data.success || !Array.isArray(data.sources) || !data.sources.length) return { sources: [], subtitles: [] }
    return {
      sources: data.sources.map((source) => ({
        url: source.url,
        type: source.type === 'dash' || source.type === 'native' ? source.type : 'hls',
        quality: source.quality || 'Auto',
        provider: source.provider,
        headers: source.headers ?? {},
      })),
      subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
    }
  } catch {
    return { sources: [], subtitles: [] }
  }
}

export type EmbedCatalogContext = {
  overview: string | undefined
  pauseFacts: string | undefined
  posterSrc: string | undefined
  title: string
}

function formatRuntime(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${minutes}m`
}

/** Real TMDB title context for the player chrome. Catalog outages fall back
 *  to an honest generic label — never a demo title. */
export async function loadEmbedMovieContext(tmdbId: number): Promise<EmbedCatalogContext> {
  const fallback: EmbedCatalogContext = {
    overview: undefined,
    pauseFacts: `Movie · TMDB ${tmdbId}`,
    posterSrc: undefined,
    title: `Movie ${tmdbId}`,
  }
  try {
    const { item } = await getCatalogTitle('movie', tmdbId)
    if (item.kind !== 'movie') return fallback
    return {
      overview: item.overview || undefined,
      pauseFacts: [
        item.year,
        formatRuntime(item.runtimeMinutes),
        item.tmdbRating != null ? `★ ${item.tmdbRating.toFixed(1)}` : null,
        item.certification,
      ].filter((part): part is string | number => part != null && part !== '').join(' · ') || undefined,
      posterSrc: item.backdropUrl ?? item.posterUrl ?? undefined,
      title: item.title,
    }
  } catch {
    return fallback
  }
}

export async function loadEmbedEpisodeContext(
  tmdbId: number,
  season: number,
  episode: number,
): Promise<EmbedCatalogContext> {
  const episodeLabel = `Season ${season} · Episode ${episode}`
  const fallback: EmbedCatalogContext = {
    overview: undefined,
    pauseFacts: episodeLabel,
    posterSrc: undefined,
    title: `Series ${tmdbId} · ${episodeLabel}`,
  }
  try {
    const { item } = await getCatalogTitle('series', tmdbId)
    if (item.kind !== 'series') return fallback
    const facts = [
      episodeLabel,
      formatRuntime(item.episodeRuntimeMinutes),
      item.contentRating,
    ].filter((part): part is string => part != null && part !== '').join(' · ')
    return {
      overview: item.overview || undefined,
      pauseFacts: facts || episodeLabel,
      posterSrc: item.backdropUrl ?? item.posterUrl ?? undefined,
      title: `${item.title} · S${season} E${episode}`,
    }
  } catch {
    return fallback
  }
}
