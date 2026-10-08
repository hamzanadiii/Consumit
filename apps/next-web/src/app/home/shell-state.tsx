'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import * as NextNav from 'next/navigation'

import { SIDEBAR_STORAGE_KEY, stampDocumentTheme, THEME_STORAGE_KEY, type FilScreenTheme } from './filscreen-theme'
import { ATMOSPHERE_KEY, PROFILE_LAYOUT_KEY, QUIET_MOTION_KEY, readMuseumPreferences, stampMuseumPreferences, storeMuseumPreference, type Atmosphere, type ProfileLayout } from './museum-preferences'

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
  atmosphere: Atmosphere
  setAtmosphere(atmosphere: Atmosphere): void
  profileLayout: ProfileLayout
  setProfileLayout(layout: ProfileLayout): void
  quietMotion: boolean
  setQuietMotion(quiet: boolean): void
  appearanceStored: boolean
  /** Href of the sidebar navigation currently in flight, if any. */
  pendingHref: string | null
  beginNavigation(href: string): void
}

const ShellStateContext = createContext<ShellStateValue>({
  sidebarOpen: true,
  toggleSidebar() {},
  theme: 'dark',
  toggleTheme() {},
  atmosphere: 'cinema',
  setAtmosphere() {},
  profileLayout: 'gallery',
  setProfileLayout() {},
  quietMotion: false,
  setQuietMotion() {},
  appearanceStored: true,
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
  const [atmosphere, setAtmosphereState] = useState<Atmosphere>('cinema')
  const [profileLayout, setProfileLayoutState] = useState<ProfileLayout>('gallery')
  const [quietMotion, setQuietMotionState] = useState(false)
  const [appearanceStored, setAppearanceStored] = useState(true)
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
    const preferences = readMuseumPreferences()
    setAtmosphereState(preferences.atmosphere)
    setProfileLayoutState(preferences.profileLayout)
    setQuietMotionState(preferences.quietMotion)
    stampMuseumPreferences(preferences.atmosphere, preferences.profileLayout, preferences.quietMotion)
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

  const setAtmosphere = useCallback((next: Atmosphere) => {
    const nextTheme = next === 'gallery' ? 'light' : 'dark'
    const themeStored = storeMuseumPreference(THEME_STORAGE_KEY, nextTheme)
    const atmosphereStored = storeMuseumPreference(ATMOSPHERE_KEY, next)
    setAppearanceStored(themeStored && atmosphereStored)
    setAtmosphereState(next)
    setThemeState(nextTheme)
    stampDocumentTheme(nextTheme)
    stampMuseumPreferences(next, profileLayout, quietMotion)
  }, [profileLayout, quietMotion])

  const toggleTheme = useCallback(() => setAtmosphere(theme === 'dark' ? 'gallery' : 'cinema'), [setAtmosphere, theme])

  const setProfileLayout = useCallback((next: ProfileLayout) => {
    setAppearanceStored(storeMuseumPreference(PROFILE_LAYOUT_KEY, next))
    setProfileLayoutState(next)
    stampMuseumPreferences(atmosphere, next, quietMotion)
  }, [atmosphere, quietMotion])

  const setQuietMotion = useCallback((next: boolean) => {
    setAppearanceStored(storeMuseumPreference(QUIET_MOTION_KEY, String(next)))
    setQuietMotionState(next)
    stampMuseumPreferences(atmosphere, profileLayout, next)
  }, [atmosphere, profileLayout])

  const beginNavigation = useCallback((href: string) => {
    if (href === pathname) return
    setPendingHref(href)
    if (pendingTimer.current !== undefined) clearTimeout(pendingTimer.current)
    pendingTimer.current = setTimeout(() => setPendingHref(null), 8000)
  }, [pathname])

  const value = useMemo(() => ({ sidebarOpen, toggleSidebar, theme, toggleTheme, atmosphere, setAtmosphere, profileLayout, setProfileLayout, quietMotion, setQuietMotion, appearanceStored, pendingHref, beginNavigation }),
    [sidebarOpen, toggleSidebar, theme, toggleTheme, atmosphere, setAtmosphere, profileLayout, setProfileLayout, quietMotion, setQuietMotion, appearanceStored, pendingHref, beginNavigation])
  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>
}

export function useShellState() {
  return useContext(ShellStateContext)
}
