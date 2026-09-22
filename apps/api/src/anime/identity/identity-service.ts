import type { AnimeTitleSummary } from '@consumit/contracts'

export type AnimeIdentity = {
  consumitId: string
  anilistId: number
  malId: number | null
  titles: AnimeTitleSummary['titles']
  format: AnimeTitleSummary['format']
  externalIds: ExternalId[]
}

export type ExternalId = {
  source: 'anilist' | 'mal' | 'tmdb'
  id: number | string
}

export type AnimeIdentityService = {
  resolve(anilistId: number): Promise<AnimeIdentity>
  resolveByMalId(malId: number): Promise<AnimeIdentity | null>
  resolveBatch(anilistIds: number[]): Promise<AnimeIdentity[]>
}

export function createAnimeIdentityService(): AnimeIdentityService {
  const cache = new Map<number, AnimeIdentity>()

  const toConsumitId = (anilistId: number) => `anime:anilist:${anilistId}`

  return {
    async resolve(anilistId) {
      const cached = cache.get(anilistId)
      if (cached) return cached

      const identity: AnimeIdentity = {
        consumitId: toConsumitId(anilistId),
        anilistId,
        malId: null,
        titles: { preferred: 'Unknown', english: null, romaji: null, native: null },
        format: 'TV',
        externalIds: [{ source: 'anilist', id: anilistId }],
      }

      cache.set(anilistId, identity)
      return identity
    },

    async resolveByMalId(malId) {
      for (const identity of cache.values()) {
        if (identity.malId === malId) return identity
      }
      return null
    },

    async resolveBatch(anilistIds) {
      const results: AnimeIdentity[] = []
      for (const id of anilistIds) {
        results.push(await this.resolve(id))
      }
      return results
    },
  }
}
