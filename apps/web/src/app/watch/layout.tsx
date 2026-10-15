import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// Direct media should receive the browser Origin without the Watch page's
// Referer. Next updates this metadata during client navigation as well.
export const metadata: Metadata = { referrer: 'no-referrer' }

export default function WatchLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children
}
