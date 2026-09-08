'use client'

import { RotateCcw } from 'lucide-react'
import { useEffect } from 'react'

import { Button, ErrorState } from '@consumit/ui'

import { ScreenShell } from './screens/screen-shell'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ScreenShell activeHref="">
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem] px-5 py-16 sm:px-8 lg:px-[62px]">
        <ErrorState
          action={<Button onClick={reset}><RotateCcw aria-hidden="true" /> Try again</Button>}
          description="Consumit could not load this catalog view. Your library and watch history are safe."
          title="The catalog missed its cue"
        />
      </main>
    </ScreenShell>
  )
}
