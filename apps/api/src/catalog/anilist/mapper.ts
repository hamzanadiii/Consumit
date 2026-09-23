import type { AnimeTitleSummary, AnimeTitleDetail, AnimeCharacter, AnimeStaff, AnimeFranchiseRelation, AnimeTitle, AnimeImageAsset, AnimeSeason, AnimeFormat, AnimeStatus, AnimeRelationType } from '@consumit/contracts'

type AnilistTitle = { romaji: string | null; english: string | null; native: string | null }
type AnilistImage = { large: string | null; color: string | null }
type AnilistMedia = {
  id: number
  idMal: number | null
  title: AnilistTitle
  format: string | null
  status: string | null
  season: string | null
  seasonYear: number | null
  episodes: number | null
  duration: number | null
  genres: string[]
  coverImage: AnilistImage | null
  bannerImage: string | null
  averageScore: number | null
  popularity: number
  description: string
  nextAiringEpisode: { episode: number; airingAt: number } | null
  source?: string | null
  countryOfOrigin?: string | null
  trailer?: { id: string; site: string; thumbnail: string | null } | null
  characters?: { edges: Array<{ node: { id: number; name: { full: string }; image: { large: string | null } }; voiceActors: Array<{ id: number; name: { full: string }; image: { large: string | null }; language: string }> }> } | null
  staff?: { edges: Array<{ node: { id: number; name: { full: string }; image: { large: string | null } }; role: string | null }> } | null
  streamingEpisodes?: Array<{ title: string; thumbnail: string | null; site: string }> | null
  externalLinks?: Array<{ id: number; site: string; url: string; color: string | null }> | null
  tags?: Array<{ name: string; rank: number | null }> | null
  relations?: { edges: Array<{ relationType: string; node: AnilistMedia }> } | null
}

const FORMAT_MAP: Record<string, AnimeFormat> = {
  TV: 'TV', MOVIE: 'MOVIE', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'SPECIAL', TV_SHORT: 'TV_SHORT',
}

const STATUS_MAP: Record<string, AnimeStatus> = {
  FINISHED: 'FINISHED', RELEASING: 'RELEASING', NOT_YET_RELEASED: 'NOT_YET_RELEASED', CANCELLED: 'CANCELLED', HIATUS: 'HIATUS',
}

const SEASON_MAP: Record<string, AnimeSeason> = {
  WINTER: 'WINTER', SPRING: 'SPRING', SUMMER: 'SUMMER', FALL: 'FALL',
}

const RELATION_MAP: Record<string, AnimeRelationType> = {
  PREQUEL: 'PREQUEL', SEQUEL: 'SEQUEL', PARENT: 'PARENT', SIDE_STORY: 'SIDE_STORY',
  CHARACTER: 'CHARACTER', SUMMARY: 'SUMMARY', ALTERNATIVE: 'ALTERNATIVE',
  SPIN_OFF: 'SPIN_OFF', OTHER: 'OTHER', SOURCE: 'SOURCE', COMPILATION: 'COMPILATION', CONTAINS: 'CONTAINS',
}

export function mapTitle(raw: AnilistMedia): AnimeTitle {
  return {
    preferred: raw.title.english || raw.title.romaji || raw.title.native || 'Unknown',
    english: raw.title.english,
    romaji: raw.title.romaji,
    native: raw.title.native,
  }
}

export function mapImage(raw: AnilistImage | null): AnimeImageAsset {
  return {
    url: toHttpUrl(raw?.large),
    color: raw?.color ?? null,
  }
}

function toHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export function mapTitleSummary(raw: AnilistMedia): AnimeTitleSummary {
  return {
    anilistId: raw.id,
    kind: 'anime',
    titles: mapTitle(raw),
    format: FORMAT_MAP[raw.format ?? ''] ?? 'TV',
    status: STATUS_MAP[raw.status ?? ''] ?? 'NOT_YET_RELEASED',
    season: raw.season ? (SEASON_MAP[raw.season] ?? null) : null,
    seasonYear: raw.seasonYear,
    episodes: raw.episodes,
    episodeDuration: raw.duration,
    genres: raw.genres ?? [],
    coverImage: mapImage(raw.coverImage),
    bannerImage: toHttpUrl(raw.bannerImage),
    averageScore: raw.averageScore,
    popularity: raw.popularity,
    description: raw.description?.replace(/<[^>]*>/g, '').trim() ?? '',
    nextAiringEpisode: raw.nextAiringEpisode ? {
      episode: raw.nextAiringEpisode.episode,
      airingAt: new Date(raw.nextAiringEpisode.airingAt * 1000).toISOString(),
    } : null,
  }
}

export function mapCharacter(edge: { node: { id: number; name: { full: string }; image: { large: string | null } }; voiceActors: Array<{ id: number; name: { full: string }; image: { large: string | null }; language: string }> }): AnimeCharacter {
  return {
    id: edge.node.id,
    name: edge.node.name.full,
    image: toHttpUrl(edge.node.image?.large),
    role: null,
    voiceActors: edge.voiceActors.map((va) => ({
      id: va.id,
      name: va.name.full,
      image: toHttpUrl(va.image?.large),
      language: va.language,
    })),
  }
}

export function mapStaff(edge: { node: { id: number; name: { full: string }; image: { large: string | null } }; role: string | null }): AnimeStaff {
  return {
    id: edge.node.id,
    name: edge.node.name.full,
    image: toHttpUrl(edge.node.image?.large),
    role: edge.role ?? null,
  }
}

export function mapTitleDetail(raw: AnilistMedia): AnimeTitleDetail {
  const base = mapTitleSummary(raw)
  return {
    ...base,
    malId: raw.idMal ?? null,
    // Hero logos resolve server-side in the anime service (TMDB match);
    // the mapper never blocks detail on artwork.
    logoUrl: null,
    source: raw.source ?? null,
    countryOfOrigin: raw.countryOfOrigin ?? null,
    trailer: raw.trailer ? { ...raw.trailer, thumbnail: toHttpUrl(raw.trailer.thumbnail) } : null,
    characters: raw.characters?.edges.map(mapCharacter) ?? [],
    staff: raw.staff?.edges.map(mapStaff) ?? [],
    streamingEpisodes: raw.streamingEpisodes?.map((ep) => ({
      title: ep.title,
      thumbnail: toHttpUrl(ep.thumbnail),
      site: ep.site,
    })) ?? [],
    externalLinks: raw.externalLinks?.flatMap((link) => {
      const url = toHttpUrl(link.url)
      return url ? [{ id: link.id, site: link.site, url, color: link.color ?? null }] : []
    }) ?? [],
  }
}

export function mapFranchiseRelation(edge: { relationType: string; node: AnilistMedia }): AnimeFranchiseRelation | null {
  const type = RELATION_MAP[edge.relationType]
  if (!type) return null
  return {
    type,
    anime: mapTitleSummary(edge.node),
  }
}

export function mapAiringNode(node: { episode: number; airingAt: number; timeUntilAiring: number; media: { id: number; title: { romaji: string | null; english: string | null } } }) {
  return {
    episode: node.episode,
    airingAt: new Date(node.airingAt * 1000).toISOString(),
    timeUntilAiring: node.timeUntilAiring,
    mediaTitle: node.media.title.english || node.media.title.romaji || 'Unknown',
  }
}
