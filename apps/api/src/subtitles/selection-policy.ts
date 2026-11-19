import { createHash } from 'node:crypto'
import type { RawSubtitle, SubtitleQuery } from './types.ts'

import { primarySubtitleLanguage } from '@consumit/contracts'

export { SUBTITLE_POLICY_VERSION, SUBTITLE_RESERVE_LIMIT, primarySubtitleLanguage } from '@consumit/contracts'

const RETIRED_PROVIDER_IDS = new Set(['cinesrc', 'subf2m'])

/** Provider availability applies equally to fresh, prepared, and cached tracks. */
export function isSubtitleProviderEligible(id: string): boolean {
  return !RETIRED_PROVIDER_IDS.has(id) && !id.startsWith('stream-cinesrcframe-')
}

/** SubSource archives may contain several episodes and require filename matching. */
export function requiresExactEpisodeArchiveMatch(id: string): boolean {
  return id === 'subsource'
}

/** Match an explicit season/episode token without accepting numeric prefixes
 * such as S01E1 inside S01E10. Multi-episode ranges are never exact tracks. */
export function hasExactSeasonEpisode(value: string, season: number, episode: number): boolean {
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) return false
  if (/(?:^|[^a-z0-9])s0*\d+e0*\d+\s*[-–]\s*(?:s0*\d+)?e0*\d+/i.test(value)) return false

  const tokens = [
    ...value.matchAll(/(?:^|[^a-z0-9])s0*(\d+)e0*(\d+)(?![a-z0-9])/gi),
    ...value.matchAll(/(?:^|[^a-z0-9])0*(\d+)x0*(\d+)(?![a-z0-9])/gi),
    ...value.matchAll(/(?:^|[^a-z0-9])season\s*0*(\d+)[^a-z0-9]+episode\s*0*(\d+)(?![a-z0-9])/gi),
  ]
  return tokens.length > 0 && tokens.every(match => Number(match[1]) === season && Number(match[2]) === episode)
}

function hasEpisodeNumber(value: string, episode: number): boolean {
  if (!Number.isInteger(episode) || episode < 1) return false
  const tokens = [...value.matchAll(/(?:^|[^a-z0-9])(?:episode|ep\.?|e)\s*0*(\d+)(?![a-z0-9])/gi)]
  return tokens.length > 0 && tokens.every(match => Number(match[1]) === episode)
}

/** Anime subtitles may use canonical absolute numbering instead of mapped TV numbering. */
export function matchesSubtitleEpisode(value: string, query: SubtitleQuery): boolean {
  if (query.type === 'movie') return true
  const season = query.season ?? 1
  const episode = query.episode ?? 1
  if (hasExactSeasonEpisode(value, season, episode)) return true
  if (query.type !== 'anime') return false
  const absoluteEpisode = query.absoluteEpisode ?? episode
  return hasExactSeasonEpisode(value, 1, absoluteEpisode) || hasEpisodeNumber(value, absoluteEpisode)
}

/** Semantic eligibility shared by discovery and every provider result path.
 * URL, host, and shape validation remain with discovery's hostile-input intake. */
export function isSubtitleCandidateEligible(raw: RawSubtitle, query: SubtitleQuery): boolean {
  if ((raw.identity?.tmdbId && query.tmdbId && raw.identity.tmdbId !== query.tmdbId) ||
      (raw.identity?.anilistId && query.anilistId && raw.identity.anilistId !== query.anilistId) ||
      (raw.identity?.language && primarySubtitleLanguage(raw.identity.language) !== primarySubtitleLanguage(raw.lang))) return false

  const release = `${raw.label} ${raw.release ?? ''}`
  const explicitSeasonEpisode = /(?:^|[^a-z0-9])(?:s\d+e\d+|\d+x\d+|season\s*\d+[^a-z0-9]+episode\s*\d+)(?![a-z0-9])/i.test(release)
  const explicitAnimeEpisode = query.type === 'anime' && /(?:^|[^a-z0-9])(?:episode|ep\.?|e)\s*\d+(?![a-z0-9])/i.test(release)
  if (explicitSeasonEpisode || explicitAnimeEpisode) return query.type !== 'movie' && matchesSubtitleEpisode(release, query)
  return true
}

/** Preferred language index, with the historical first-letter fallback rank. */
export function subtitleLanguageRank(language: string, preferredLanguages: readonly string[]): number {
  const normalized = primarySubtitleLanguage(language)
  const preferred = preferredLanguages.map(primarySubtitleLanguage)
  const index = preferred.indexOf(normalized)
  return index === -1 ? 100 + normalized.toLowerCase().charCodeAt(0) : index
}

export function classifySubtitleMatch(raw: RawSubtitle, context?: { videoVersion?: string; release?: string }): 'source' | 'release' | 'unverified' {
  if (context?.videoVersion && raw.recordingVersion === context.videoVersion && raw.authority === context.videoVersion) return 'source'
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const expected = normalize(context?.release ?? '')
  // A quality label or cue duration cannot establish a release match.
  if (expected.length >= 12 && raw.release && normalize(raw.release) === expected) return 'release'
  return 'unverified'
}

/** Cue text AND timing define an immutable prepared file. Headers and cue
 * numbering do not. Variant flags are part of identity at the call site. */
export function subtitleContentChecksum(vtt: string): string {
  const cues = vtt.replace(/\r\n?/g, '\n').split(/\n\s*\n/).flatMap(block => {
    const lines = block.split('\n'), timing = lines.findIndex(line => line.includes('-->'))
    return timing < 0 ? [] : [lines.slice(timing).map(line => line.trim().replace(/[\t ]+/g, ' ')).join('\n')]
  })
  return createHash('sha256').update(cues.join('\n\n')).digest('hex')
}
