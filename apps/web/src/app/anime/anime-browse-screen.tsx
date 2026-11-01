import type { AnimePage } from '@consumit/contracts'

import { FilScreenShell } from '../shared'

import { AnimeBrowseContent } from './anime-browse-content'

type AnimeBrowseScreenProps = {
  trending: AnimePage
  initial: AnimePage
  currentYear: number
  initialSort?: string | undefined
  initialGenre?: string | undefined
  initialYear?: string | undefined
  initialFormat?: string | undefined
}

export function AnimeBrowseScreen({ trending, initial, currentYear, initialSort, initialGenre, initialYear, initialFormat }: AnimeBrowseScreenProps) {
  return (
    <FilScreenShell activeKindTab="anime" pageHeading={undefined}>
      <AnimeBrowseContent trending={trending} initial={initial} currentYear={currentYear} initialSort={initialSort} initialGenre={initialGenre} initialYear={initialYear} initialFormat={initialFormat} />
    </FilScreenShell>
  )
}
