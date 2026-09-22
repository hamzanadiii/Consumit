import type { Metadata } from 'next'

import { AnimeBrowseScreen } from './anime-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getAnimeTrending, getAnimeSeasonal } from '@/lib/anime-api'

export const metadata: Metadata = { title: 'Anime · Consumit', description: 'Browse anime from the AniList catalog.' }

export default async function AnimePage() {
  let trending, seasonal
  const now = new Date()
  const month = now.getMonth()
  const season = month < 3 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'FALL'
  const year = now.getFullYear()

  try {
    ;[trending, seasonal] = await Promise.all([
      getAnimeTrending(1),
      getAnimeSeasonal(season, year, 1),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/anime" error={error} />
  }
  return <AnimeBrowseScreen trending={trending} seasonal={seasonal} season={season} year={year} />
}
