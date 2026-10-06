import type { Metadata } from 'next'

import { AnimeBrowseScreen } from './anime-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getAnimeBrowse, getAnimeTrending } from '@/lib/anime-api'

export const metadata: Metadata = { title: 'Anime · Consumit', description: 'Browse anime from the AniList catalog.' }

export default async function AnimePage() {
  let trending, popular
  const currentYear = new Date().getFullYear()

  try {
    ;[trending, popular] = await Promise.all([
      getAnimeTrending(1),
      getAnimeBrowse({ sort: 'popular', page: 1 }),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/anime" error={error} />
  }
  return <AnimeBrowseScreen trending={trending} initial={popular} currentYear={currentYear} />
}
