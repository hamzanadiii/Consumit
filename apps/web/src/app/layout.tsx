import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

import { siteUrl } from '@/lib/site'

import { CatalogAttribution } from './catalog/catalog-attribution'
import { PreviewSessionProvider } from './session/preview-session'

const siteDescription = 'Watch immediately, remember what you love, and discover through people whose taste you trust.'

export const metadata: Metadata = {
  description: siteDescription,
  metadataBase: new URL(siteUrl()),
  openGraph: {
    description: siteDescription,
    locale: 'en_US',
    siteName: 'Consumit',
    title: 'Consumit',
    type: 'website',
    url: siteUrl(),
  },
  robots: { follow: true, index: true },
  title: 'Consumit',
  twitter: {
    card: 'summary_large_image',
    description: siteDescription,
    title: 'Consumit',
  },
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
