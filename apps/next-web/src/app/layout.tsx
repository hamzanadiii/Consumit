import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

import { siteUrl } from '@/lib/site'

import { SessionProvider } from './session/session'
import { SIDEBAR_INIT_SCRIPT, THEME_INIT_SCRIPT } from './home/filscreen-theme'
import { ShellStateProvider } from './home/shell-state'
import { WebVitals } from './web-vitals'

const siteDescription = 'Watch movies, series, and anime. Remember what you love in your private library.'

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
        {/* Pre-paint collapsed rail: same idea for the stored sidebar choice. */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body>
        <SessionProvider initialStatus="loading">
          <ShellStateProvider>
            <WebVitals />
            {children}
          </ShellStateProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
