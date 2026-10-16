import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

import { siteUrl } from '@/lib/site'

import { SessionProvider } from './session/session'
import { SIDEBAR_INIT_SCRIPT, THEME_INIT_SCRIPT } from './home/filscreen-theme'
import { ShellStateProvider } from './home/shell-state'
import { WebVitals } from './web-vitals'
import { GoogleAnalytics } from './shared/google-analytics'

const siteDescription = 'Watch movies, series, and anime. Remember what you love in your private library.'

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

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
  referrer: 'strict-origin-when-cross-origin',
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
        {/* Pre-paint collapsed rail: same idea for the stored sidebar choice. */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body>
        <SessionProvider initialStatus="loading">
          <ShellStateProvider>
            <WebVitals />
            <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
            {children}
          </ShellStateProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
