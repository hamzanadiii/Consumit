import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

import { siteUrl } from '@/lib/site'

import { SessionProvider } from './session/session'
import { THEME_INIT_SCRIPT } from './home/filscreen-theme'
import { WebVitals } from './web-vitals'

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-paint FilScreen theme: runs before first paint so stored light
            mode never flashes dark (including the loading fallback). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <SessionProvider initialStatus="loading">
          <WebVitals />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
