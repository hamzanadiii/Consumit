import type { PlaybackRef } from '@consumit/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { subtitleCorrectionContentKey, type SubtitleCorrectionScope, type SubtitlePreferenceRecord, type SubtitlePreferences } from './preferences.ts'

function identity(ref: PlaybackRef) {
  if (ref.kind === 'anime') {
    return { kind: 'ANIME' as const, tmdbId: 0, anilistId: ref.id, season: 0, episode: ref.episode ?? 1 }
  }
  return {
    kind: (ref.kind === 'movie' ? 'MOVIE' : 'SERIES') as 'MOVIE' | 'SERIES',
    tmdbId: ref.id,
    anilistId: 0,
    season: ref.kind === 'movie' ? 0 : (ref.season ?? 1),
    episode: ref.kind === 'movie' ? 0 : (ref.episode ?? 1),
  }
}

/** Neon-backed per-member subtitle corrections. Reads fail open (unset);
 *  writes fail closed (the member must know their correction did not save). */
export function createPostgresSubtitlePreferences(prisma: PrismaClient): SubtitlePreferences {
  return {
    async get(memberId: string, ref: PlaybackRef, scope?: SubtitleCorrectionScope): Promise<SubtitlePreferenceRecord | null> {
      try {
        if (scope) {
          const row = await prisma.userSubtitleCorrection.findUnique({ where: { memberId_contentKey_videoVersion_contentChecksum: { memberId, contentKey: subtitleCorrectionContentKey(ref), ...scope } } })
          return row ? { trackId: row.trackId, offsetMs: row.offsetMs } : null
        }
        const row = await prisma.userSubtitlePreference.findUnique({
          where: {
            memberId_kind_tmdbId_anilistId_season_episode: { memberId, ...identity(ref) },
          },
        })
        if (!row) return null
        return { trackId: row.trackId, offsetMs: row.offsetMs }
      } catch {
        return null
      }
    },

    async set(memberId: string, ref: PlaybackRef, preference: { trackId?: string | null | undefined; offsetMs?: number | undefined }, scope?: SubtitleCorrectionScope): Promise<SubtitlePreferenceRecord> {
      if (scope) {
        const identity = { memberId, contentKey: subtitleCorrectionContentKey(ref), ...scope }
        const data = { trackId: preference.trackId ?? null, offsetMs: preference.offsetMs ?? 0 }
        const row = await prisma.userSubtitleCorrection.upsert({ where: { memberId_contentKey_videoVersion_contentChecksum: identity }, create: { ...identity, ...data }, update: data })
        return { trackId: row.trackId, offsetMs: row.offsetMs }
      }
      const row = await prisma.userSubtitlePreference.upsert({
        where: {
          memberId_kind_tmdbId_anilistId_season_episode: { memberId, ...identity(ref) },
        },
        update: {
          trackId: preference.trackId ?? null,
          offsetMs: preference.offsetMs ?? 0,
        },
        create: {
          memberId,
          ...identity(ref),
          trackId: preference.trackId ?? null,
          offsetMs: preference.offsetMs ?? 0,
        },
      })
      return { trackId: row.trackId, offsetMs: row.offsetMs }
    },
  }
}
