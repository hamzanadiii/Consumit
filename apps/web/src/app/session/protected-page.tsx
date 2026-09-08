import { RotateCcw } from 'lucide-react'

import { buttonVariants, ErrorState } from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'

export function SessionUnavailableScreen({ activeHref }: { activeHref: string }) {
  return (
    <ScreenShell activeHref={activeHref}>
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem] px-5 py-16 sm:px-8 lg:px-[62px]">
        <ErrorState
          action={<a className={buttonVariants()} href=""><RotateCcw aria-hidden="true" /> Retry</a>}
          description="Your account session could not be checked. Nothing has been signed out or changed."
          title="Account service unavailable"
        />
      </main>
    </ScreenShell>
  )
}
