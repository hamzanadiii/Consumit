import { buttonVariants, EmptyState } from '@consumit/ui'

import { ScreenShell } from './screens/screen-shell'

export default function NotFound() {
  return (
    <ScreenShell activeHref="">
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem] px-5 py-16 sm:px-8 lg:px-[62px]">
        <EmptyState
          action={<a className={buttonVariants()} href="/search">Explore the catalog</a>}
          description="This movie, series, season, or list is not in the current Consumit catalog."
          title="Nothing is playing here"
        />
      </main>
    </ScreenShell>
  )
}
