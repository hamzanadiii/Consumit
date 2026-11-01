import type { Metadata } from 'next'

import { AnimeBrowseScreen } from './anime-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getAnimeBrowse, getAnimeTrending } from '@/lib/anime-api'

export const metadata: Metadata = { title: 'Anime · Consumit', description: 'Browse anime from the AniList catalog.' }

export default async function AnimePage({ searchParams }: { searchParams: Promise<{ sort?: string | string[]; genre?: string | string[]; year?: string | string[]; format?: string | string[] }> }) {
  const params = await searchParams
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value
  const initialSort = first(params.sort)
  const initialGenre = first(params.genre)
  const initialYear = first(params.year)
  const initialFormat = first(params.format)
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
  return <AnimeBrowseScreen trending={trending} initial={popular} currentYear={currentYear} initialSort={initialSort} initialGenre={initialGenre} initialYear={initialYear} initialFormat={initialFormat} />
}
