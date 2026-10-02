import type { PrismaClient } from '../../generated/prisma/client.js'
import { catalogIdentity, checksumVtt, vttFacts, type CatalogTrack, type CatalogTrackInput, type SubtitleCatalog } from './catalog.ts'
import type { SubtitleRef } from './subtitles.ts'

/** Neon-backed durable subtitle metadata. Reads are indexed point lookups;
 *  writes are idempotent upserts (same content/language/provider/file is a
 *  no-op). Every method fails open — callers treat a catalog outage like a
 *  cache miss and fall through to live discovery. */
type DbFormat = 'VTT' | 'SRT' | 'ASS' | 'SSA'

function toDbFormat(value: string): DbFormat {
  const upper = value.toUpperCase()
  return upper === 'SRT' || upper === 'ASS' || upper === 'SSA' ? upper : 'VTT'
}

function fromDbFormat(value: string): 'vtt' | 'srt' | 'ass' {
  const lower = value.toLowerCase()
  return lower === 'srt' ? 'srt' : lower === 'ass' || lower === 'ssa' ? 'ass' : 'vtt'
}
export function createPostgresSubtitleCatalog(prisma: PrismaClient): SubtitleCatalog {
  return {
    async find(ref: SubtitleRef, langs: readonly string[]): Promise<CatalogTrack[]> {
      const identity = catalogIdentity(ref)
      const wanted = langs.map((lang) => lang.toLowerCase())
      try {
        const rows = await prisma.subtitleTrack.findMany({
          where: {
            kind: identity.kind,
            tmdbId: identity.tmdbId,
            anilistId: identity.anilistId,
            season: identity.season,
            episode: identity.episode,
            ...(wanted.length ? { language: { in: wanted } } : {}),
          },
          orderBy: [{ updatedAt: 'desc' }],
        })
        // Wanted langs first (caller priority), then recency.
        const rank = (language: string) => {
          const index = wanted.indexOf(language)
          return index === -1 ? wanted.length + 1 : index
        }
        return rows
          .slice()
          .sort((a, b) => rank(a.language) - rank(b.language))
          .map((row) => ({
            language: row.language,
            label: row.label,
            format: fromDbFormat(row.format),
            provider: row.provider,
            storageKey: row.storageKey,
            originalExt: row.originalExt,
            hi: row.hi,
            rating: row.rating,
            releaseTag: row.releaseTag,
          }))
      } catch {
        return []
      }
    },

    async save(ref: SubtitleRef, tracks: readonly CatalogTrackInput[]): Promise<void> {
      if (!tracks.length) return
      const identity = catalogIdentity(ref)
      try {
        await prisma.$transaction(
          tracks.map((track) => {
            const facts = vttFacts(track.vtt)
            return prisma.subtitleTrack.upsert({
              where: {
                kind_tmdbId_anilistId_season_episode_language_provider_storageKey: {
                  kind: identity.kind,
                  tmdbId: identity.tmdbId,
                  anilistId: identity.anilistId,
                  season: identity.season,
                  episode: identity.episode,
                  language: track.language.toLowerCase(),
                  provider: track.provider,
                  storageKey: track.storageKey,
                },
              },
              update: {
                label: track.label,
                format: toDbFormat(track.format),
                originalExt: track.originalExt ?? null,
                checksum: checksumVtt(track.vtt),
                cueCount: facts.cueCount,
                durationMs: facts.durationMs,
                hi: track.hi ?? false,
                rating: track.rating ?? null,
                releaseTag: track.releaseTag ?? null,
              },
              create: {
                kind: identity.kind,
                tmdbId: identity.tmdbId,
                anilistId: identity.anilistId,
                season: identity.season,
                episode: identity.episode,
                language: track.language.toLowerCase(),
                label: track.label,
                format: toDbFormat(track.format),
                provider: track.provider,
                storageKey: track.storageKey,
                originalExt: track.originalExt ?? null,
                checksum: checksumVtt(track.vtt),
                cueCount: facts.cueCount,
                durationMs: facts.durationMs,
                hi: track.hi ?? false,
                rating: track.rating ?? null,
                releaseTag: track.releaseTag ?? null,
              },
            })
          }),
        )
      } catch {
        // Catalog write failure never fails the search.
      }
    },
  }
}
