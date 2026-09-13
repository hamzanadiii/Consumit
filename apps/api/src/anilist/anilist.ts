import type { AnimeDetail, AnimePage } from '@consumit/contracts'

export type AnimeSearchQuery = {
  query: string
  page: number
}

export interface Anilist {
  anime(anilistId: number): Promise<{ item: AnimeDetail; meta: { fetchedAt: string; stale: boolean } }>
  searchAnime(query: AnimeSearchQuery): Promise<AnimePage>
  lookupTitles(detail: Pick<AnimeDetail, 'title' | 'titles'>): string[]
}
