import type { AnimePage } from '@consumit/contracts'

import { FilScreenShell } from '../shared'

import { AnimeBrowseContent } from './anime-browse-content'

type AnimeBrowseScreenProps = { trending: AnimePage; initial: AnimePage; currentYear: number }

export function AnimeBrowseScreen({ trending, initial, currentYear }: AnimeBrowseScreenProps) {
  return (
    <FilScreenShell activeKindTab="anime" pageHeading="Anime">
      <AnimeBrowseContent trending={trending} initial={initial} currentYear={currentYear} />
    </FilScreenShell>
  )
}
