import { buttonVariants, EmptyState } from '@consumit/ui'

import { FilScreenShell } from './home/filscreen-shell'

export default function NotFound() {
  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem]">
        <EmptyState
          action={<a className={buttonVariants()} href="/search">Explore the catalog</a>}
          description="This movie, series, season, or list is not in the current Consumit catalog."
          title="Nothing is playing here"
        />
      </main>
    </FilScreenShell>
  )
}
