'use client'

import './globals.css'
import { Button, ErrorState } from '@consumit/next-ui'
import { RotateCcw } from 'lucide-react'

/** Root-layout failures cannot depend on its session or shell providers. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return <html lang="en"><body>
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-10">
      <ErrorState className="w-full" title="Consumit couldn't open this page"
        description="Reload to try again. If the problem continues, return in a moment."
        detail={error.digest ? `Reference: ${error.digest}` : undefined}
        action={<Button onClick={() => window.location.reload()}><RotateCcw aria-hidden="true" /> Reload page</Button>} />
    </main>
  </body></html>
}
