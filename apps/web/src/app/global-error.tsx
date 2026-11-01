'use client'

import './globals.css'
import Link from 'next/link'
import { Button, buttonVariants, ErrorState } from '@consumit/ui'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { SkipToContent } from './shared/skip-to-content'

/** Root-layout failures cannot depend on its session or shell providers. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return <html lang="en"><body>
    <SkipToContent />
    <main id="consumit-main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-10">
      <ErrorState className="w-full" headingLevel={1} title="Consumit couldn't open this page"
        description="Reload to try again. If the problem continues, return in a moment."
        detail={error.digest ? `Reference: ${error.digest}` : undefined}
        action={<div className="flex flex-wrap gap-3">
          <Button onClick={() => window.location.reload()}><RotateCcw aria-hidden="true" /> Reload page</Button>
          <Link className={buttonVariants({ variant: 'secondary' })} href="/"><ArrowLeft aria-hidden="true" /> Back to Home</Link>
        </div>} />
    </main>
  </body></html>
}
