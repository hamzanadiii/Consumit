'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { THEME_STORAGE_KEY, THEME_STYLE, stampDocumentTheme, type FilScreenTheme } from '../home/filscreen-theme'

/**
 * FilScreen dual-theme scope for the reduced auth shell. Auth pages have no
 * sidebar, so they cannot use FilScreenShell — this brings the same theme
 * variables and document stamping without the app chrome. There is no
 * toggle here: auth renders in whatever theme the member already has
 * stored. Dark stays the default; the stored choice syncs after mount
 * while the pre-paint `html[data-consumit-theme]` override prevents a
 * light flash, mirroring the shell exactly.
 */
export function AuthThemeScope({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<FilScreenTheme>('dark')
  useEffect(() => {
    let next: FilScreenTheme | null = null
    try {
      if (window.localStorage.getItem(THEME_STORAGE_KEY) === 'light') next = 'light'
    } catch {
      // Storage denial keeps the dark default.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-only external-store sync
    if (next) setTheme(next)
    stampDocumentTheme(next ?? 'dark')
  }, [])
  return (
    <div data-filscreen-home data-theme={theme} style={{ colorScheme: theme }}>
      <style>{THEME_STYLE}</style>
      {children}
    </div>
  )
}
