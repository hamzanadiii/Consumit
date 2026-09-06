import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

import { CatalogAttribution } from './catalog/catalog-attribution'
import { PreviewSessionProvider } from './session/preview-session'

export const metadata: Metadata = {
  title: 'Consumit',
  description:
    'Watch immediately, remember what you love, and discover through people whose taste you trust.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PreviewSessionProvider>
          {children}
          <CatalogAttribution />
        </PreviewSessionProvider>
      </body>
    </html>
  )
}
