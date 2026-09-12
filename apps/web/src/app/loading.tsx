import { LoadingState } from '@consumit/ui'

import { ScreenShell } from './screens/screen-shell'

export default function Loading() {
  return (
    <ScreenShell activeHref="">
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem] px-5 py-16 sm:px-8 lg:px-[50px]">
        <LoadingState rows={5} title="Loading the catalog" />
      </main>
    </ScreenShell>
  )
}
