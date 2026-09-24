'use client'

import { RotateCcw } from 'lucide-react'
import { useEffect } from 'react'

import { Button, ErrorState } from '@consumit/ui'

import { FilScreenShell } from './home/filscreen-shell'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem]">
        <ErrorState
          action={<Button onClick={reset}><RotateCcw aria-hidden="true" /> Try again</Button>}
          description="Consumit could not load this catalog view. Your library and watch history are safe."
          title="The catalog missed its cue"
        />
      </main>
    </FilScreenShell>
  )
}
