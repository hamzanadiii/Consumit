'use client'

import { Bookmark, BookOpen, ChevronDown, Clapperboard, Compass, Heart, History, House, ListVideo, LogOut, Search, Settings, Shield, UserRound, X } from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar } from '@consumit/next-ui'
import { logoutMember } from '@/lib/identity-browser'
import { memberAvatarSrc } from '@/lib/avatar'
import { useSession } from '../session/session'
import { OnDemandLink as Link } from '../shared/on-demand-link'
import { FilScreenSearchOverlay } from './filscreen-search-overlay'
import { THEME_STYLE } from './filscreen-theme'
import { useShellState } from './shell-state'

export type FilScreenShellProps = {
  children: ReactNode
  activeKindTab?: 'new' | 'series' | 'movies' | 'anime' | undefined
  currentPathname?: string | undefined
  pageHeading?: string | null | undefined
}

export function FilScreenShell({ children, currentPathname, pageHeading }: FilScreenShellProps) {
  const current = usePathname()
  const router = useRouter()
  const path = currentPathname ?? current ?? '/'
  const { member, clearMember } = useSession()
  const { theme, pendingHref, beginNavigation } = useShellState()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const profile = member ? `/profile/${encodeURIComponent(member.username)}` : '/library?section=profile'
  const archive = (section: string) => member ? `${profile}/${section}` : `/library?section=${section}`
  const main = [{ href: '/', label: 'Home' }, { href: '/movies', label: 'Movies' }, { href: '/series', label: 'Series' }, { href: '/anime', label: 'Anime' }]
  const personal = [
    { href: profile, label: 'Your museum', icon: UserRound },
    { href: archive('watchlist'), label: 'Watchlist', icon: Bookmark },
    { href: archive('diary'), label: 'Diary', icon: BookOpen },
    { href: archive('films'), label: 'Watched', icon: Clapperboard },
    { href: archive('history'), label: 'Watch history', icon: History },
    { href: archive('lists'), label: 'Collections', icon: ListVideo },
    { href: archive('likes'), label: 'Likes', icon: Heart },
    { href: '/settings', label: 'Settings & appearance', icon: Settings },
  ]
  function active(href: string) { return href === '/' ? path === '/' : path === href || path.startsWith(href + '/') }
  function navigate(href: string) { beginNavigation(href); setMenuOpen(false) }
  function closeSearch() { setSearchOpen(false); requestAnimationFrame(() => searchButtonRef.current?.focus()) }
  function closeMenu() { setMenuOpen(false); menuButtonRef.current?.focus() }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(value => !value); return }
      if (event.key === '/' && !target?.matches('input, textarea, select, [contenteditable="true"]')) { event.preventDefault(); setSearchOpen(true) }
      if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButtonRef.current?.focus() }
    }
    function outside(event: PointerEvent) { if (menuOpen && event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false) }
    window.addEventListener('keydown', keyboard)
    document.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('keydown', keyboard); document.removeEventListener('pointerdown', outside) }
  }, [menuOpen])

  async function signOut() {
    if (signingOut) return
    setSigningOut(true); setSignOutError(null)
    try { await logoutMember(); clearMember(); router.push('/sign-in'); router.refresh() }
    catch { setSignOutError('Sign out could not finish. Check your connection and try again.') }
    finally { setSigningOut(false) }
  }

  return (
    <div className="next-shell" data-filscreen-home data-theme={theme} style={{ colorScheme: theme }}>
      <style>{THEME_STYLE}</style>
      <a className="museum-skip-link" href="#consumit-main">Skip to content</a>
      {pendingHref ? <div aria-label="Loading page" className="next-navigation-progress" role="status"><span /></div> : null}
      <header className="next-header">
        <Link aria-label="Consumit home" className="next-brand" href="/" onClick={() => navigate('/')}><Image alt="" height={28} src="/assets/consumit-mark.svg" width={28} /><span>consumit<span aria-hidden="true">.</span></span></Link>
        <nav aria-label="Main navigation" className="next-main-nav">
          {main.map(item => <Link aria-current={active(item.href) ? 'page' : undefined} href={item.href} key={item.href} onClick={() => navigate(item.href)}>{item.label}</Link>)}
        </nav>
        <div className="next-header-actions">
          <button aria-label="Search titles" className="next-icon-button next-search-button" onClick={() => setSearchOpen(true)} ref={searchButtonRef} type="button"><Search aria-hidden="true" size={20} /><span>Search</span><kbd aria-hidden="true">⌘ K</kbd></button>
          <div className="next-account" ref={menuRef}>
            <button aria-controls="next-account-menu" aria-expanded={menuOpen} aria-label="Open your space" className="next-account-button" onClick={() => setMenuOpen(!menuOpen)} ref={menuButtonRef} type="button">
              <Avatar decorative name={member?.displayName || member?.username || 'Guest'} size="sm" src={member ? memberAvatarSrc(member.avatarUrl, member.id) ?? undefined : undefined} treatment={member?.avatarStyle ?? 'dusk'} />
              <span>{member ? 'Your space' : 'Guest'}</span><ChevronDown aria-hidden="true" size={15} />
            </button>
            {menuOpen ? <div className="next-account-menu" id="next-account-menu">
              <div className="next-menu-identity"><span>{member?.displayName || member?.username || 'Welcome to Consumit'}</span><button aria-label="Close your space" className="next-icon-button" onClick={closeMenu} type="button"><X aria-hidden="true" size={18} /></button></div>
              <nav aria-label="Browse" className="next-menu-browse">{main.map(item => <Link href={item.href} key={item.href} onClick={() => navigate(item.href)}>{item.label}</Link>)}</nav>
              <nav aria-label="Your space">{personal.map(({ href, label, icon: Icon }) => <Link href={href} key={label} onClick={() => navigate(href)}><Icon aria-hidden="true" size={18} />{label}</Link>)}{member?.role === 'admin' ? <Link href="/admin" onClick={() => navigate('/admin')}><Shield aria-hidden="true" size={18} />Administration</Link> : null}</nav>
              {member ? <button className="next-session-action" disabled={signingOut} onClick={() => void signOut()} type="button"><LogOut aria-hidden="true" size={18} />{signingOut ? 'Signing out…' : 'Sign out'}</button> : <Link className="next-session-action" href="/sign-in" onClick={() => navigate('/sign-in')}><LogOut aria-hidden="true" size={18} />Sign in</Link>}
              {signOutError ? <p className="next-signout-error" role="alert">{signOutError}</p> : null}
            </div> : null}
          </div>
        </div>
      </header>
      <div className="next-content" id="consumit-main" tabIndex={-1}>
        {pageHeading ? <h1 className="sr-only">{pageHeading}</h1> : null}
        {children}
      </div>
      <footer className="next-footer"><div><Link className="next-footer-wordmark" href="/">consumit.</Link><p>Watch a story. Keep a little of it.</p></div><nav aria-label="Footer"><Link href="/about">About</Link><Link href="/help">Help</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/dmca">DMCA</Link></nav><p className="next-credits">© {new Date().getFullYear()} Consumit · Catalog data by <a href="https://www.themoviedb.org" rel="noreferrer" target="_blank">TMDB</a> and <a href="https://anilist.co" rel="noreferrer" target="_blank">AniList</a> · <Link href="/about#catalog-credit">Catalog credits</Link></p></footer>
      <nav aria-label="Mobile navigation" className="next-mobile-dock">
        <Link aria-current={path === '/' ? 'page' : undefined} href="/" onClick={() => navigate('/')}><House aria-hidden="true" size={21} /><span>Home</span></Link>
        <Link aria-current={['/movies','/series','/anime'].some(href => path.startsWith(href)) ? 'page' : undefined} href="/movies" onClick={() => navigate('/movies')}><Compass aria-hidden="true" size={21} /><span>Discover</span></Link>
        <Link aria-current={active(archive('watchlist')) ? 'page' : undefined} href={archive('watchlist')} onClick={() => navigate(archive('watchlist'))}><Bookmark aria-hidden="true" size={21} /><span>Watchlist</span></Link>
        <Link aria-current={path === profile ? 'page' : undefined} href={profile} onClick={() => navigate(profile)}><UserRound aria-hidden="true" size={21} /><span>Museum</span></Link>
      </nav>
      {searchOpen ? <FilScreenSearchOverlay onClose={closeSearch} open /> : null}
    </div>
  )
}
