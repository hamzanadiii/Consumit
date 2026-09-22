import type { AnimePage, AnimeSeason } from '@consumit/contracts'

import { FilScreenShell } from '../shared'

import { AnimeBrowseContent } from './anime-browse-content'

type AnimeBrowseScreenProps = { trending: AnimePage; seasonal: AnimePage; season: AnimeSeason; year: number }

export function AnimeBrowseScreen({ trending, seasonal, season, year }: AnimeBrowseScreenProps) {
  return (
    <FilScreenShell activeKindTab="anime" pageHeading="Anime">
      <AnimeBrowseContent trending={trending} seasonal={seasonal} season={season} year={year} />
    </FilScreenShell>
  )
}
