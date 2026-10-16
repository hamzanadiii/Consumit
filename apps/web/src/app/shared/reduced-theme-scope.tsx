'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { THEME_STORAGE_KEY, THEME_STYLE, stampDocumentTheme, type FilScreenTheme } from '../home/filscreen-theme'

/** Theme a focused, reduced-shell flow with the member's saved FilScreen palette. */
export function ReducedThemeScope({ children }: { children: ReactNode }) {
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
