import type { Anilist } from './anilist.ts'
import { unavailableAnilist } from './errors.ts'

export const unavailableAnilistAdapter: Anilist = {
  anime: async () => unavailableAnilist(),
  searchAnime: async () => unavailableAnilist(),
  lookupTitles: () => { unavailableAnilist() },
}
