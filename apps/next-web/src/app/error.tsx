'use client'

import { ArrowLeft, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'

import { Button, buttonVariants, ErrorState } from '@consumit/next-ui'

import { FilScreenShell } from './home/filscreen-shell'

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto flex min-h-[60vh] w-full max-w-[90rem] items-center py-10">
        <ErrorState
          action={<div className="flex flex-wrap gap-3"><Button onClick={retry}><RotateCcw aria-hidden="true" /> Try again</Button><Link className={buttonVariants({ variant: 'secondary' })} href="/"><ArrowLeft aria-hidden="true" /> Back to Home</Link></div>}
          className="w-full"
          description="This page could not load. Try again, or return to Home to keep browsing."
          detail={error.digest ? `Reference: ${error.digest}` : undefined}
          title="Let's get you back to watching"
        />
      </main>
    </FilScreenShell>
  )
}
