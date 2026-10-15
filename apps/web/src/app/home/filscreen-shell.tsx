'use client'

import { Bookmark, Clapperboard, Heart, History, House, ListVideo, LogOut, Menu, Moon, Search, Settings, Shield, Sun, X } from 'lucide-react'
import Image from 'next/image'
import * as NextNav from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NotificationBell } from '../notifications/notification-bell'
import { WelcomeDialog } from '../experience/welcome-dialog'

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
import { FilScreenFooter } from './filscreen-footer'
import { logoutMember } from '@/lib/identity-browser'
import { dicebearAvatarUrl, memberAvatarSrc } from '@/lib/avatar'
import { useSession } from '../session/session'
import { OnDemandLink as Link } from '../shared/on-demand-link'

export { SIDEBAR_STORAGE_KEY, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, THEME_STYLE, stampDocumentTheme, type FilScreenTheme } from './filscreen-theme'
import { THEME_STYLE } from './filscreen-theme'
import { useShellState } from './shell-state'

export const CONTRACT_HTML =
  '<!--FilScreen Shell [seed 1f265dab] THESIS: dual-theme 3-column chooser owns Consumit, dark by default. ' +
  'OWN-WORLD: Consumit midnight ground, theme shell filling the page, signal-orange accents, amber TMDB stars, ruled artwork, tabular numerals, hairline seams. ' +
  'STORY: member scans sidebar, tabs, hero Watch, and catalog details. ' +
  'FINISH: unreviewed and undocumented is unfinished-->'


const SIDEBAR_ROW_CLASS =
  'fs-sidebar-item group flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-control px-3 text-sm whitespace-nowrap text-[var(--fs-secondary)] outline-none transition-all duration-200 ease-out hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none'

const SIDEBAR_ICON_CLASS =
  'grid place-items-center text-[var(--fs-muted)] transition-all duration-200 ease-out group-hover:text-[var(--fs-ink)] motion-reduce:transition-none motion-reduce:transform-none'

/** The single default guest portrait every visitor shares. One fixed generated
 *  character for all guests: no storage, no hydration mismatch, no surprises. */
const GUEST_AVATAR_SRC = dicebearAvatarUrl('consumit-guest')

const MEMBER_ARCHIVES = [
  { section: 'watchlist', label: 'Watchlist', icon: Bookmark },
  { section: 'likes', label: 'Likes', icon: Heart },
  { section: 'films', label: 'Watched', icon: Clapperboard },
  { section: 'history', label: 'History', icon: History },
  { section: 'lists', label: 'Lists', icon: ListVideo },
] as const

function SidebarRowLabel({
  children,
  iconOnly = false,
}: {
  children: ReactNode
  iconOnly?: boolean | undefined
}) {
  // The desktop rail is intentionally icon-only. Rendering these labels in
  // its narrow column makes them flash/overflow during shell transitions, so
  // icon-only controls get their accessible name from aria-label instead.
  if (iconOnly) return null
  return <span className="fs-navigation-label text-sm font-normal">{children}</span>
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
  // Destination pages render slowly enough that a click with no immediate
  // feedback reads as broken. The click only records the marker here — the
  // visible progress lives in the shell's top route bar, so rows never
  // change shape. The marker survives the route transition (shell state
  // outlives the remounting shell) and clears on arrival; a safety timeout
  // covers failed navigations.
  const { beginNavigation, pendingHref } = useShellState()
  const pending = pendingHref === href && !active
  return (
    <Link
      {...(active ? { 'aria-current': 'page' } : {})}
      {...(pending ? { 'aria-busy': true } : {})}
      {...(iconOnly ? { 'aria-label': label } : {})}
      className={
        active
          ? 'fs-sidebar-item group flex min-h-11 shrink-0 items-center gap-3 rounded-control bg-[var(--fs-accent-soft)] px-3 text-sm font-bold whitespace-nowrap text-[var(--fs-ink)] border border-[var(--fs-accent)]/40 outline-none transition-all duration-200 ease-out active:translate-y-0 focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none'
          : SIDEBAR_ROW_CLASS
      }
      href={href}
      onClick={() => beginNavigation(href)}
      style={{ animationDelay: `${delay}ms` }}
      {...(iconOnly ? { title: label } : {})}
    >
      <span aria-hidden="true" className={active ? 'fs-rail-active grid place-items-center text-[var(--fs-accent)] transition-transform duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none' : SIDEBAR_ICON_CLASS}>{icon}</span>
      <SidebarRowLabel iconOnly={iconOnly}>{label}</SidebarRowLabel>
    </Link>
  )
}

export type FilScreenShellProps = {
  children: ReactNode
  activeKindTab?: 'new' | 'series' | 'movies' | 'anime' | undefined
  currentPathname?: string | undefined
  pageHeading?: string | null | undefined
}

export function FilScreenShell({
  children,
  activeKindTab,
  currentPathname,
  pageHeading,
}: FilScreenShellProps) {
  const router = getNextRouter()
  const hookPathname = getNextPathname()
  const defaultPath = activeKindTab === 'series' ? '/series' : activeKindTab === 'movies' ? '/movies' : activeKindTab === 'anime' ? '/anime' : '/'
  const pathname = currentPathname || hookPathname || defaultPath
  const { clearMember, member } = useSession()
  const { theme, toggleTheme, pendingHref } = useShellState()
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDialogElement>(null)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const avatarSrc = member ? memberAvatarSrc(member) : null

  function closeMenu() {
    setMobileOpen(false)
    requestAnimationFrame(() => menuTriggerRef.current?.focus())
  }

  useEffect(() => {
    const dialog = menuRef.current
    if (!mobileOpen || !dialog) return
    dialog.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeAtDesktop = () => {
      if (desktop.matches) setMobileOpen(false)
    }
    desktop.addEventListener('change', closeAtDesktop)
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      desktop.removeEventListener('change', closeAtDesktop)
    }
  }, [mobileOpen])

  async function signOut() {
    setSignOutError(null)
    try {
      await logoutMember()
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
        setMobileOpen(false)
        setSearchOpen(!searchOpen)
        if (searchOpen) requestAnimationFrame(() => searchTriggerRef.current?.focus())
        return
      }
      if (event.key === '/' && !searchOpen) {
        const target = event.target as HTMLElement | null
        const tag = target?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
        event.preventDefault()
        setMobileOpen(false)
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
  const memberProfileRoot = member ? `/profile/${encodeURIComponent(member.username)}` : null

  function navigation(iconOnly: boolean) {
    return (
      <>
        <nav aria-label="Main navigation" className="grid gap-1 lg:place-items-center lg:[&>a]:justify-center lg:[&>a]:px-3" data-scrollrow>
          <SidebarLink active={pathname === '/'} delay={0} href="/" icon={<House aria-hidden="true" className="size-[18px]" />} iconOnly={iconOnly} label="Home" />
          {MEMBER_ARCHIVES.map(({ section, label, icon: Icon }, index) => {
            const href = memberProfileRoot ? `${memberProfileRoot}/${section}` : `/library?section=${section}`
            return <SidebarLink active={pathname === href || pathname.startsWith(`${href}/`)} delay={(index + 1) * 50} href={href} icon={<Icon aria-hidden="true" className="size-[18px]" />} iconOnly={iconOnly} key={section} label={label} />
          })}
        </nav>
        <nav aria-label="Account" className="grid gap-1 mt-auto lg:place-items-center lg:[&>a]:justify-center lg:[&>a]:px-3 lg:[&>button]:justify-center lg:[&>button]:px-3" data-scrollrow>
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
            <SidebarRowLabel iconOnly={iconOnly}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</SidebarRowLabel>
          </button>
          <SidebarLink delay={240} href="/settings" icon={<Settings aria-hidden="true" className="size-[18px]" />} iconOnly={iconOnly} label="Settings" />
          {member?.role === 'admin' ? <SidebarLink delay={250} href="/admin" icon={<Shield aria-hidden="true" className="size-[18px]" />} iconOnly={iconOnly} label="Admin" /> : null}
          {member ? (
            <button
              className={SIDEBAR_ROW_CLASS}
              aria-label="Log out"
              onClick={() => void signOut()}
              style={{ animationDelay: '280ms' }}
              type="button"
            >
              <span aria-hidden="true" className={SIDEBAR_ICON_CLASS}><LogOut aria-hidden="true" className="size-[18px]" /></span>
              <SidebarRowLabel iconOnly={iconOnly}>Log out</SidebarRowLabel>
            </button>
          ) : (
            <SidebarLink delay={280} href="/sign-in" icon={<LogOut aria-hidden="true" className="size-[18px]" />} iconOnly={iconOnly} label="Sign in" />
          )}
        </nav>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--fs-shell)] text-[var(--fs-ink)]" data-filscreen-home data-theme={theme} style={{ colorScheme: theme }}>
      <WelcomeDialog pathname={pathname ?? '/'} />
      {pendingHref ? (
        <div aria-label="Loading page" className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden" role="status">
          <div aria-hidden="true" className="fs-route-progress h-full w-1/4 bg-[var(--fs-accent)]" />
        </div>
      ) : null}
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: CONTRACT_HTML }} />
      <style>{THEME_STYLE}</style>
      {pageHeading ? <h1 className="sr-only">{pageHeading}</h1> : null}
      <div className="fs-sidebar-shell grid min-h-screen w-full grid-cols-1 lg:grid-cols-[76px_minmax(0,1fr)]">
        <aside aria-label="Primary" className="fs-sidebar-rail hidden flex-col items-center gap-6 border-r border-[var(--fs-line)] px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:overflow-y-auto">
          <Link aria-label="Consumit home" className="grid size-11 shrink-0 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/">
            <Image alt="" className="size-8" height={32} src="/assets/consumit-mark.svg" width={32} />
          </Link>
          {navigation(true)}
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="fs-content min-w-0 flex-1 p-5 sm:p-6 lg:p-8">
            {signOutError ? <p className="mb-5 text-sm text-[var(--fs-danger)]" role="alert">{signOutError}</p> : null}
            <header className="fs-utility mb-5 flex flex-wrap items-center gap-3">
              <Link aria-label="Consumit home" className="fs-mobile-brand grid size-11 shrink-0 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] lg:hidden" href="/">
                <Image alt="" className="size-7" height={28} src="/assets/consumit-mark.svg" width={28} />
              </Link>
              <nav aria-label="Catalog kinds" className="order-2 flex min-w-0 basis-full gap-2 overflow-x-auto border-b border-[var(--fs-line)] pb-2 sm:order-none sm:flex-1 sm:basis-auto sm:border-0 sm:pb-1" data-scrollrow>
                <Link
                  {...(isNew ? { 'aria-current': 'page' } : {})}
                  className={
                    isNew
                      ? 'inline-flex min-h-11 shrink-0 items-center rounded-control bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                      : 'inline-flex min-h-11 shrink-0 items-center rounded-control px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                  }
                  href="/"
                >
                  New
                </Link>
                <Link
                  {...(isSeries ? { 'aria-current': 'page' } : {})}
                  className={
                    isSeries
                      ? 'inline-flex min-h-11 shrink-0 items-center rounded-control bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                      : 'inline-flex min-h-11 shrink-0 items-center rounded-control px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                  }
                  href="/series"
                >
                  Series
                </Link>
                <Link
                  {...(isMovies ? { 'aria-current': 'page' } : {})}
                  className={
                    isMovies
                      ? 'inline-flex min-h-11 shrink-0 items-center rounded-control bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                      : 'inline-flex min-h-11 shrink-0 items-center rounded-control px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                  }
                  href="/movies"
                >
                  Movies
                </Link>
                <Link
                  {...(isAnime ? { 'aria-current': 'page' } : {})}
                  className={
                    isAnime
                      ? 'inline-flex min-h-11 shrink-0 items-center rounded-control bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                      : 'inline-flex min-h-11 shrink-0 items-center rounded-control px-4 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
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
                className="group flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-4 text-left text-sm outline-none transition-all duration-200 ease-out hover:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none sm:w-64 sm:flex-none"
                onClick={() => setSearchOpen(true)}
                ref={searchTriggerRef}
                type="button"
              >
                <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-muted)] transition-colors group-hover:text-[var(--fs-accent)]" />
                <span className="flex-1 truncate text-[var(--fs-muted)] group-hover:text-[var(--fs-secondary)]">Search</span>
                <kbd aria-hidden="true" className="hidden shrink-0 rounded-md border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--fs-muted)] sm:inline-block">⌘K</kbd>
              </button>
              <NotificationBell pathname={pathname} navigate={href => router.push(href)} />
              {member ? (
                <Link aria-label={`Your library, signed in as ${member.username}`} className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${member.username}`}>
                  <Avatar className="size-11" name={member.displayName ?? member.username} size="md" src={avatarSrc ?? undefined} treatment={member.avatarStyle} />
                </Link>
              ) : (
                <Link aria-label="Guest profile" title="Guest profile" className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/library?section=profile">
                  <Avatar className="size-11" imageAlt="Guest portrait" name="Guest" size="md" src={GUEST_AVATAR_SRC} treatment="noir" />
                </Link>
              )}
              <button ref={menuTriggerRef} aria-controls="filscreen-mobile-menu" aria-expanded={mobileOpen} aria-haspopup="dialog" aria-label="Open navigation" className="fs-menu-trigger grid size-11 shrink-0 cursor-pointer place-items-center rounded-control text-[var(--fs-secondary)] outline-none hover:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] lg:hidden" onClick={() => setMobileOpen(true)} type="button">
                <Menu aria-hidden="true" className="size-5" />
              </button>
            </header>

            {children}
          </div>

          <FilScreenFooter />
        </div>
      </div>
      <dialog aria-labelledby="mobile-menu-heading" className="fs-mobile-dialog" id="filscreen-mobile-menu" onCancel={event => { event.preventDefault(); closeMenu() }} onClick={event => { if (event.target === event.currentTarget) closeMenu() }} onKeyDown={event => {
        if (event.key !== 'Tab' || event.defaultPrevented) return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'))
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }} ref={menuRef}>
        <div className="fs-mobile-menu" onClick={event => { if ((event.target as Element).closest('a')) closeMenu() }}>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--fs-line)] pb-5">
            <span className="flex items-center gap-3 font-bold tracking-[0.12em]" id="mobile-menu-heading"><Image alt="" height={28} src="/assets/consumit-mark.svg" width={28} />CONSUMIT</span>
            <button aria-label="Close navigation" className="grid size-11 cursor-pointer place-items-center rounded-control outline-none hover:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onClick={closeMenu} type="button"><X aria-hidden="true" className="size-5" /></button>
          </div>
          {mobileOpen ? navigation(false) : null}
          {signOutError ? <p className="text-sm text-[var(--fs-danger)]" role="alert">{signOutError}</p> : null}
        </div>
      </dialog>
      {searchOpen ? <FilScreenSearchOverlay onClose={closeSearch} open /> : null}
    </div>
  )
}
