import { createHash } from 'node:crypto'
import type { ServedSubtitle } from './engine.ts'
import type { SubtitleRef } from './subtitles.ts'

/** Canonical content identity for subtitle cataloging. Movies key on
 *  tmdbId; series add season/episode; anime keys on the AniList id plus the
 *  canonical episode number (provider mappings stay out of storage). */
export function catalogIdentity(ref: SubtitleRef): { kind: 'MOVIE' | 'SERIES' | 'ANIME'; tmdbId: number; anilistId: number; season: number; episode: number } {
  if (ref.kind === 'anime') {
    return { kind: 'ANIME', tmdbId: 0, anilistId: ref.id, season: 0, episode: ref.episode ?? 1 }
  }
  return {
    kind: ref.kind === 'movie' ? 'MOVIE' : 'SERIES',
    tmdbId: ref.id,
    anilistId: 0,
    season: ref.kind === 'movie' ? 0 : (ref.season ?? 1),
    episode: ref.kind === 'movie' ? 0 : (ref.episode ?? 1),
  }
}

export type CatalogTrackInput = {
  language: string
  label: string
  format: 'vtt' | 'srt' | 'ass'
  provider: string
  storageKey: string
  originalExt?: string | undefined
  vtt: string
  hi?: boolean | undefined
  rating?: number | undefined
  releaseTag?: string | undefined
}

export type CatalogTrack = {
  language: string
  label: string
  format: 'vtt' | 'srt' | 'ass'
  provider: string
  storageKey: string
  originalExt: string | null
  hi: boolean
  rating: number | null
  releaseTag: string | null
}

export interface SubtitleCatalog {
  /** Durable tracks for one title/episode, newest first. Empty on miss. */
  find(ref: SubtitleRef, langs: readonly string[]): Promise<CatalogTrack[]>
  /** Best-effort write-through after a fresh discovery. Never throws. */
  save(ref: SubtitleRef, tracks: readonly CatalogTrackInput[]): Promise<void>
}

/** SHA-256 over converted VTT bytes: identical files across providers share
 *  a checksum for later dedupe. */
export function checksumVtt(vtt: string): string {
  return createHash('sha256').update(vtt, 'utf8').digest('hex')
}

/** Cue count + span duration parsed from VTT text. Cheap signals for future
 *  completeness scoring; null when unparseable. */
export function vttFacts(vtt: string): { cueCount: number; durationMs: number | null } {
  let cueCount = 0
  let lastEnd: number | null = null
  for (const match of vtt.matchAll(/(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})/g)) {
    cueCount += 1
    const end = Number(match[4]) * 3600000 + Number(match[5]) * 60000 + Number(match[6])
    if (Number.isFinite(end)) lastEnd = end
  }
  return { cueCount, durationMs: lastEnd }
}

/** Map durable rows back to served tracks (first-party file URLs),
 *  keeping quality signals for downstream ranking. */
export function toServedTracks(tracks: readonly CatalogTrack[], origin: string): ServedSubtitle[] {
  const base = origin.replace(/\/$/, '')
  return tracks.map((track) => ({
    id: `sub-${track.provider}-${track.storageKey.slice(0, 8)}`,
    label: track.label,
    language: track.language,
    url: `${base}/v1/subtitles/file/${track.storageKey}`,
    format: 'vtt' as const,
    provider: track.provider,
    ...(track.hi ? { hi: true } : {}),
    ...(typeof track.rating === 'number' ? { rating: track.rating } : {}),
    ...(track.releaseTag ? { release: track.releaseTag } : {}),
  }))
}

/** Storage key carried by a served first-party URL, or null for direct
 *  upstream tracks (never cataloged — provider-owned bytes). */
export function servedStorageKey(url: string): string | null {
  const match = url.match(/\/v1\/subtitles\/file\/([0-9a-f]{16})$/)
  return match?.[1] ?? null
}
