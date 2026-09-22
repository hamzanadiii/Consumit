'use client'

import { Bell, Heart, History, House, LayoutGrid, ListVideo, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Shield, Sun, Users } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import * as NextNav from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

function getNextPathname(): string | null {
  try {
    const hook = (NextNav as { usePathname?: () => string | null }).usePathname
    return typeof hook === 'function' ? hook() : null
  } catch {
    return null
  }
}

function getNextRouter(): { push: (url: string) => void; refresh: () => void } {
  try {
    const hook = (NextNav as { useRouter?: () => { push: (url: string) => void; refresh: () => void } }).useRouter
    return typeof hook === 'function' ? hook() : { push: () => {}, refresh: () => {} }
  } catch {
    return { push: () => {}, refresh: () => {} }
  }
}

import { Avatar } from '@consumit/ui'

import { FilScreenSearchOverlay } from './filscreen-search-overlay'
import { invalidateMemberLibraryCache, logoutMember } from '@/lib/identity-browser'
import { memberAvatarSrc } from '@/lib/avatar'
import { useSession } from '../session/session'

export { SIDEBAR_STORAGE_KEY, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, THEME_STYLE, stampDocumentTheme, type FilScreenTheme } from './filscreen-theme'
import { SIDEBAR_STORAGE_KEY, THEME_STORAGE_KEY, THEME_STYLE, stampDocumentTheme, type FilScreenTheme } from './filscreen-theme'

export const CONTRACT_HTML =
  '<!--FilScreen Shell [seed 1f265dab] THESIS: dual-theme 3-column chooser owns Consumit, dark by default. ' +
  'OWN-WORLD: Consumit midnight ground, theme shell filling the page, signal-orange accents, amber TMDB stars, ruled artwork, tabular numerals, hairline seams. ' +
  'STORY: member scans sidebar, tabs, hero Watch, catalog details, circle. ' +
  'FINISH: unreviewed and undocumented is unfinished-->'

const SIDEBAR_ROW_CLASS =
  'fs-sidebar-item group flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm whitespace-nowrap text-[var(--fs-secondary)] outline-none transition-all duration-200 ease-out hover:-translate-y-px hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] hover:shadow-sm active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none'

const SIDEBAR_ICON_CLASS =
  'grid place-items-center text-[var(--fs-muted)] transition-all duration-200 ease-out group-hover:scale-110 group-hover:text-[var(--fs-ink)] group-active:scale-95 motion-reduce:transition-none motion-reduce:transform-none'

function SidebarRowLabel({
  children,
  iconOnly = false,
}: {
  children: ReactNode
  iconOnly?: boolean | undefined
}) {
  return <span className={iconOnly ? 'sr-only' : 'fs-fade text-sm font-normal'}>{children}</span>
}

function SidebarLink({
  active = false,
  delay = 0,
  href,
  icon,
  iconOnly = false,
  label,
}: {
  active?: boolean | undefined
  delay?: number | undefined
  href: string
  icon: ReactNode
  iconOnly?: boolean | undefined
  label: string
}) {
  return (
    <Link
      {...(active ? { 'aria-current': 'page' } : {})}
      className={
        active
          ? 'fs-sidebar-item group flex min-h-11 shrink-0 items-center gap-3 rounded-xl bg-[var(--fs-accent-soft)] px-3 text-sm font-bold whitespace-nowrap text-[var(--fs-ink)] shadow-[inset_0_0_0_1px_var(--fs-accent)] outline-none transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none'
          : SIDEBAR_ROW_CLASS
      }
      href={href}
      style={{ animationDelay: `${delay}ms` }}
      {...(iconOnly ? { title: label } : {})}
    >
      <span aria-hidden="true" className={active ? 'fs-rail-active grid place-items-center text-[var(--fs-accent)] transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-95 motion-reduce:transition-none motion-reduce:transform-none' : SIDEBAR_ICON_CLASS}>{icon}</span>
      <SidebarRowLabel iconOnly={iconOnly}>{label}</SidebarRowLabel>
    </Link>
  )
}

export type FilScreenShellProps = {
  children: ReactNode
  activeKindTab?: 'new' | 'series' | 'movies' | 'anime' | undefined
  currentPathname?: string | undefined
  pageHeading?: string | undefined
}

export function FilScreenShell({
  children,
  activeKindTab,
  currentPathname,
  pageHeading = 'Consumit home',
}: FilScreenShellProps) {
  const router = getNextRouter()
  const hookPathname = getNextPathname()
  const defaultPath = activeKindTab === 'series' ? '/series' : activeKindTab === 'movies' ? '/movies' : '/'
  const pathname = currentPathname || hookPathname || defaultPath
  const { clearMember, member } = useSession()
  // SSR-safe: server and first client render share these defaults so
  // hydration always matches. Stored preferences sync in the effect below;
  // first paint is already correct via the blocking THEME_INIT_SCRIPT +
  // the `html[data-consumit-theme]` CSS override, so there is no flash.
  const [theme, setTheme] = useState<FilScreenTheme>('dark')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const showSidebarRef = useRef<HTMLButtonElement>(null)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const avatarSrc = member ? memberAvatarSrc(member.avatarUrl, member.id) : null

  // Mount-only sync of device-stored prefs (external store), matching the
  // pre-paint script. Direct setState in this effect is intentional.
  useEffect(() => {
    let nextTheme: FilScreenTheme | null = null
    let nextSidebar: boolean | null = null
    try {
      if (window.localStorage.getItem(THEME_STORAGE_KEY) === 'light') {
        nextTheme = 'light'
      }
      if (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed') {
        nextSidebar = false
      }
    } catch {
      // Storage denial keeps the defaults.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-only external-store sync
    if (nextTheme) setTheme(nextTheme)
    if (nextSidebar !== null) setSidebarOpen(nextSidebar)
    stampDocumentTheme(nextTheme ?? 'dark')
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage denial keeps the session-only choice.
    }
    stampDocumentTheme(next)
  }

  function toggleSidebar() {
    const next = !sidebarOpen
    setSidebarOpen(next)
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'open' : 'collapsed')
    } catch {
      // Storage denial keeps the session-only choice.
    }
    if (!next) {
      requestAnimationFrame(() => showSidebarRef.current?.focus())
    }
  }

  async function signOut() {
    setSignOutError(null)
    try {
      await logoutMember()
      invalidateMemberLibraryCache()
      clearMember()
      router.push('/sign-in')
      router.refresh()
    } catch {
      setSignOutError('Sign out could not finish. Check your connection and try again.')
    }
  }

  function closeSearch() {
    setSearchOpen(false)
    requestAnimationFrame(() => searchTriggerRef.current?.focus())
  }

  useEffect(() => {
    function onGlobalKey(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((current) => !current)
        return
      }
      if (event.key === '/' && !searchOpen) {
        const target = event.target as HTMLElement | null
        const tag = target?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onGlobalKey)
    return () => window.removeEventListener('keydown', onGlobalKey)
  }, [searchOpen])

  const isHome = pathname === '/'
  const isSeries = activeKindTab === 'series' || pathname.startsWith('/series')
  const isMovies = activeKindTab === 'movies' || pathname.startsWith('/movies') || pathname.startsWith('/title')
  const isAnime = activeKindTab === 'anime' || pathname.startsWith('/anime')
  const isNew = activeKindTab === 'new' || (isHome && !isSeries && !isMovies && !isAnime)

  return (
    <div className="min-h-screen bg-[var(--fs-shell)] text-[var(--fs-ink)]" data-filscreen-home data-theme={theme} style={{ colorScheme: theme }}>
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: CONTRACT_HTML }} />
      <style>{THEME_STYLE}</style>
      {pageHeading ? <h1 className="sr-only">{pageHeading}</h1> : null}
      <div className={sidebarOpen ? 'fs-sidebar-shell grid min-h-screen w-full grid-cols-1 lg:grid-cols-[216px_minmax(0,1fr)]' : 'fs-sidebar-shell grid min-h-screen w-full grid-cols-1 lg:grid-cols-[76px_minmax(0,1fr)]'}>
        <aside aria-label="Primary" id="filscreen-sidebar" className={sidebarOpen ? 'fs-sidebar-rail flex flex-col gap-6 border-b border-[var(--fs-line)] p-5 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-6' : 'fs-sidebar-rail hidden flex-col items-center gap-6 border-[var(--fs-line)] py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-full lg:overflow-y-auto lg:border-r lg:px-3'}>
          <div className={sidebarOpen ? 'flex min-h-11 items-center justify-between gap-2' : 'flex min-h-11 flex-col items-center justify-center gap-2'}>
            {sidebarOpen ? (
              <Link aria-label="Consumit home" className="fs-fade inline-flex min-h-11 items-center gap-2.5 rounded text-sm font-bold tracking-[0.2em] outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none" href="/">
                <Image alt="" className="size-7" height={28} src="/assets/consumit-mark.svg" width={28} />
                CONSUMIT
              </Link>
            ) : null}
            <button
              aria-controls="filscreen-sidebar"
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              className="group grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-[var(--fs-muted)] outline-none transition-all duration-200 ease-out hover:scale-105 hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none"
              onClick={toggleSidebar}
              type="button"
            >
              <span className="grid place-items-center transition-transform duration-300 ease-out group-active:scale-90 motion-reduce:transition-none" key={sidebarOpen ? 'open' : 'closed'}>
                {sidebarOpen ? (
                  <PanelLeftClose aria-hidden="true" className="size-[18px]" />
                ) : (
                  <PanelLeftOpen aria-hidden="true" className="size-[18px]" />
                )}
              </span>
            </button>
          </div>
          <nav aria-label="Library" className={sidebarOpen ? 'flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0' : 'flex gap-1 overflow-x-auto pb-1 lg:grid lg:place-items-center lg:overflow-visible lg:pb-0 lg:[&>a]:justify-center lg:[&>a]:px-3'} data-scrollrow key={sidebarOpen ? 'library-open' : 'library-collapsed'}>
            <SidebarLink active={pathname === '/'} delay={0} href="/" icon={<House aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Home" />
            <SidebarLink active={pathname.startsWith('/search')} delay={40} href="/search" icon={<LayoutGrid aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Categories" />
            <SidebarLink active={pathname === '/library'} delay={80} href="/library" icon={<Heart aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Favorites" />
            <SidebarLink active={pathname === '/lists' || pathname.startsWith('/lists/')} delay={120} href="/lists" icon={<ListVideo aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Lists" />
            <SidebarLink active={pathname.startsWith('/friends')} delay={160} href="/friends" icon={<Users aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Circle" />
            <SidebarLink delay={200} href="/library#history" icon={<History aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="History" />
          </nav>
          <nav aria-label="Account" className={sidebarOpen ? 'flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0 lg:mt-auto' : 'flex gap-1 overflow-x-auto pb-1 lg:grid lg:mt-auto lg:place-items-center lg:overflow-visible lg:pb-0 lg:[&>a]:justify-center lg:[&>a]:px-3 lg:[&>button]:justify-center lg:[&>button]:px-3'} data-scrollrow key={sidebarOpen ? 'account-open' : 'account-collapsed'}>
            <button
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={theme === 'dark'}
              className={SIDEBAR_ROW_CLASS}
              onClick={toggleTheme}
              style={{ animationDelay: '200ms' }}
              type="button"
            >
              <span aria-hidden="true" className={`${SIDEBAR_ICON_CLASS} group-hover:rotate-12`}>
                <span className="grid place-items-center" key={theme}>
                  {theme === 'dark' ? <Sun aria-hidden="true" className="size-[18px]" /> : <Moon aria-hidden="true" className="size-[18px]" />}
                </span>
              </span>
              <SidebarRowLabel iconOnly={!sidebarOpen}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</SidebarRowLabel>
            </button>
            <SidebarLink delay={240} href="/settings" icon={<Settings aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Settings" />
            {member?.role === 'admin' ? <SidebarLink delay={250} href="/admin" icon={<Shield aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Admin" /> : null}
            {member ? (
              <button
                className={SIDEBAR_ROW_CLASS}
                onClick={() => void signOut()}
                style={{ animationDelay: '280ms' }}
                type="button"
              >
                <span aria-hidden="true" className={SIDEBAR_ICON_CLASS}><LogOut aria-hidden="true" className="size-[18px]" /></span>
                <SidebarRowLabel iconOnly={!sidebarOpen}>Log out</SidebarRowLabel>
              </button>
            ) : (
              <SidebarLink delay={280} href="/sign-in" icon={<LogOut aria-hidden="true" className="size-[18px]" />} iconOnly={!sidebarOpen} label="Sign in" />
            )}
          </nav>
        </aside>

        <div className="min-w-0 p-5 sm:p-6 lg:p-8">
          {signOutError ? <p className="mb-5 text-sm text-[var(--fs-danger)]" role="alert">{signOutError}</p> : null}
          <div className="mb-5 flex items-center gap-3">
            {!sidebarOpen ? (
              <button
                ref={showSidebarRef}
                aria-controls="filscreen-sidebar"
                aria-expanded="false"
                aria-label="Show sidebar"
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-all duration-200 ease-out hover:scale-105 hover:text-[var(--fs-accent)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none lg:hidden"
                onClick={toggleSidebar}
                type="button"
              >
                <PanelLeftOpen aria-hidden="true" className="size-[18px]" />
              </button>
            ) : null}
            <nav aria-label="Catalog kinds" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" data-scrollrow>
              <Link
                {...(isNew ? { 'aria-current': 'page' } : {})}
                className={
                  isNew
                    ? 'inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                    : 'inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                }
                href="/"
              >
                New
              </Link>
              <Link
                {...(isSeries ? { 'aria-current': 'page' } : {})}
                className={
                  isSeries
                    ? 'inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                    : 'inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                }
                href="/series"
              >
                Series
              </Link>
              <Link
                {...(isMovies ? { 'aria-current': 'page' } : {})}
                className={
                  isMovies
                    ? 'inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                    : 'inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                }
                href="/movies"
              >
                Movies
              </Link>
              <Link
                {...(isAnime ? { 'aria-current': 'page' } : {})}
                className={
                  isAnime
                    ? 'inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                    : 'inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                }
                href="/anime"
              >
                Anime
              </Link>
            </nav>
            <button
              aria-expanded={searchOpen}
              aria-haspopup="dialog"
              aria-label="Search titles"
              className="group flex h-11 w-40 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-4 text-left text-sm outline-none transition-all duration-200 ease-out hover:-translate-y-px hover:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none sm:w-64"
              onClick={() => setSearchOpen(true)}
              ref={searchTriggerRef}
              type="button"
            >
              <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-muted)] transition-colors group-hover:scale-110 group-hover:text-[var(--fs-accent)]" />
              <span className="flex-1 truncate text-[var(--fs-muted)] group-hover:text-[var(--fs-secondary)]">Search</span>
              <kbd aria-hidden="true" className="hidden shrink-0 rounded-md border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--fs-muted)] sm:inline-block">⌘K</kbd>
            </button>
            <Link aria-label="Circle activity" className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/friends">
              <Bell aria-hidden="true" className="size-[18px]" />
            </Link>
            {member ? (
              <Link aria-label={`Your library, signed in as ${member.username}`} className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${member.username}`}>
                <Avatar className="size-11" name={member.displayName ?? member.username} size="md" src={avatarSrc ?? undefined} treatment={member.avatarStyle} />
              </Link>
            ) : null}
          </div>

          {children}
        </div>

        <footer className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--fs-line)] px-5 py-4 text-xs text-[var(--fs-muted)] sm:px-6 lg:px-8">
          <span>© 2026 Consumit</span>
          <span aria-hidden="true">·</span>
          <span>Movie and series metadata by <a className="font-bold text-[var(--fs-accent)] underline decoration-[var(--fs-accent)]/40 underline-offset-4 outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="https://www.themoviedb.org" rel="noreferrer" target="_blank">TMDB</a></span>
          <span aria-hidden="true">·</span>
          <span>Anime metadata by <a className="font-bold text-[var(--fs-accent)] underline decoration-[var(--fs-accent)]/40 underline-offset-4 outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="https://anilist.co" rel="noreferrer" target="_blank">AniList</a></span>
          <span aria-hidden="true">·</span>
          <Link className="rounded font-bold text-[var(--fs-accent)] underline decoration-[var(--fs-accent)]/40 underline-offset-4 outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/about#catalog-credit">
            Catalog credits
          </Link>
          <Link className="rounded outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:ml-auto" href="/about">
            About
          </Link>
        </footer>
      </div>
      {searchOpen ? <FilScreenSearchOverlay onClose={closeSearch} open /> : null}
    </div>
  )
}
