'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import * as NextNav from 'next/navigation'

import { SIDEBAR_STORAGE_KEY, stampDocumentTheme, THEME_STORAGE_KEY, type FilScreenTheme } from './filscreen-theme'

function readPathname(): string | null {
  try {
    const hook = (NextNav as { usePathname?: () => string | null }).usePathname
    return typeof hook === 'function' ? hook() : null
  } catch {
    return null
  }
}

type ShellStateValue = {
  sidebarOpen: boolean
  toggleSidebar(): void
  theme: FilScreenTheme
  toggleTheme(): void
  /** Href of the sidebar navigation currently in flight, if any. */
  pendingHref: string | null
  beginNavigation(href: string): void
}

const ShellStateContext = createContext<ShellStateValue>({
  sidebarOpen: true,
  toggleSidebar() {},
  theme: 'dark',
  toggleTheme() {},
  pendingHref: null,
  beginNavigation() {},
})

function readStoredSidebar(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'collapsed'
  } catch {
    return true
  }
}

function readStoredTheme(): FilScreenTheme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/**
 * Shell state that outlives page remounts. Every screen renders its own
 * {@link FilScreenShell}, so sidebar/theme state kept inside the shell resets
 * on each navigation (expanded flash, lost toggle). Mounted once in the root
 * layout, this provider keeps the member's persisted choices for the whole
 * app lifetime and carries the in-flight navigation marker across the route
 * transition it announces.
 */
export function ShellStateProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [theme, setThemeState] = useState<FilScreenTheme>('dark')
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const pathname = readPathname()
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Mount-only sync of device-stored prefs (external store). Direct setState
  // in this effect is intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-only external-store sync
    setSidebarOpen(readStoredSidebar())
    const storedTheme = readStoredTheme()
    setThemeState(storedTheme)
    stampDocumentTheme(storedTheme)
  }, [])

  // The destination route replaces the shell, so arrival clears the marker.
  // A slow or failed navigation falls back to the safety timeout below.
  useEffect(() => {
    if (pendingHref !== null)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- arrival clears a stale marker
      setPendingHref(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname arrival only; pendingHref is read, not tracked
  }, [pathname])

  useEffect(() => () => {
    if (pendingTimer.current !== undefined) clearTimeout(pendingTimer.current)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((current) => {
      const next = !current
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'open' : 'collapsed')
      } catch {
        // Storage denial keeps the session-only choice.
      }
      return next
    })
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Storage denial keeps the session-only choice.
      }
      stampDocumentTheme(next)
      return next
    })
  }, [])

  const beginNavigation = useCallback((href: string) => {
    if (href === pathname) return
    setPendingHref(href)
    if (pendingTimer.current !== undefined) clearTimeout(pendingTimer.current)
    pendingTimer.current = setTimeout(() => setPendingHref(null), 8000)
  }, [pathname])

  const value = useMemo(() => ({ sidebarOpen, toggleSidebar, theme, toggleTheme, pendingHref, beginNavigation }),
    [sidebarOpen, toggleSidebar, theme, toggleTheme, pendingHref, beginNavigation])
  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>
}

export function useShellState() {
  return useContext(ShellStateContext)
}
