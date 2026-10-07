import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { FilScreenHome } from './filscreen-home'
import { ShellStateProvider } from './shell-state'

let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  mockPathname = '/'
  window.localStorage.clear()
})

function shellTheme() {
  return screen.getByRole('heading', { name: 'Consumit home' }).closest('[data-filscreen-home]')?.getAttribute('data-theme')
}

function showSidebarButtons() {
  // The rail toggle (desktop) and the center-column button (mobile) share one
  // name; CSS shows exactly one per viewport, both render in jsdom.
  return screen.getAllByRole('button', { name: 'Show sidebar' })
}

const hero = { ...movieSummary, tagline: 'Long live the fighters.' }
const trending = [
  { ...movieSummary, id: 1, title: 'Trending One' },
  { ...movieSummary, id: 2, title: 'Trending Two' },
  { ...movieSummary, id: 3, title: 'Trending Three' },
]
const trendingMovies = [
  { ...movieSummary, id: 4, title: 'Trending Movie One' },
  { ...movieSummary, id: 5, title: 'Trending Movie Two' },
  { ...movieSummary, id: 6, title: 'Trending Movie Three' },
]
const trendingSeries = [
  { ...seriesSummary, id: 11, title: 'Trending Series One' },
  { ...seriesSummary, id: 12, title: 'Trending Series Two' },
  { ...seriesSummary, id: 13, title: 'Trending Series Three' },
]
const popular = [
  { ...movieSummary, id: 4, title: 'Popular One' },
  { ...movieSummary, id: 5, title: 'Popular Two' },
  { ...movieSummary, id: 6, title: 'Popular Three' },
]

describe('filscreen live home', () => {
  it('links Watch directly to the player and keeps TMDB evidence separate from member claims', async () => {
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(screen.getByRole('link', { name: 'Watch' })).toHaveAttribute('href', '/watch/movie/693134')
    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(screen.getByText('Long live the fighters.')).toBeInTheDocument()
    expect(screen.queryByText(/taste match|% match|% finished/i)).not.toBeInTheDocument()
    expect(await screen.findByText(/nothing in progress yet/i)).toBeInTheDocument()
  })

  it('renders trending movies before trending series with real poster art and drops popular', () => {
    render(<ShellStateProvider><FilScreenHome hero={hero} trendingMovies={trendingMovies} trendingSeries={trendingSeries} /></ShellStateProvider>)

    expect(screen.getByRole('heading', { name: 'Trending Movies' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trending Series' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Trending now' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Popular now' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Coming soon' })).not.toBeInTheDocument()

    const trendingHeadings = screen
      .getAllByRole('heading', { name: /Trending/ })
      .map((heading) => heading.textContent)
    expect(trendingHeadings.indexOf('Trending Movies')).toBeLessThan(trendingHeadings.indexOf('Trending Series'))
    expect(screen.getByRole('img', { name: 'Trending Movie One poster' })).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w500/dune.jpg',
    )
  })

  it('keeps the home surface personal with no social feed', () => {
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(screen.queryByRole('heading', { name: 'Circle activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Find members' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View all' })).not.toBeInTheDocument()
  })

  it('credits TMDB with a path to catalog credits', () => {
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(screen.getByRole('link', { name: 'TMDB' })).toHaveAttribute('href', 'https://www.themoviedb.org')
    expect(screen.getByRole('link', { name: 'Catalog credits' })).toHaveAttribute('href', '/about#catalog-credit')
  })

  it('offers sign in to guests and marks Home as current', () => {
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('follows the current route with the sidebar pill', () => {
    mockPathname = '/search'
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(screen.queryByRole('link', { name: 'Categories' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search titles' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('href', '/library?section=history')
  })

  it('renders dark by default and persists the member theme choice', async () => {
    const user = userEvent.setup()
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(shellTheme()).toBe('dark')
    const toggle = screen.getByRole('button', { name: 'Switch to light mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)
    expect(shellTheme()).toBe('light')
    expect(window.localStorage.getItem('consumit.home-theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the document theme stamp in sync so dark mode actually applies', async () => {
    const user = userEvent.setup()
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(document.documentElement.getAttribute('data-consumit-theme')).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(shellTheme()).toBe('light')
    expect(document.documentElement.getAttribute('data-consumit-theme')).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(shellTheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-consumit-theme')).toBe('dark')
  })

  it('restores a stored light theme on load', () => {
    window.localStorage.setItem('consumit.home-theme', 'light')
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(shellTheme()).toBe('light')
  })

  it('collapses to an icon rail and restores with the choice persisted', async () => {
    const user = userEvent.setup()
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(screen.getByRole('complementary', { name: 'Primary' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(screen.getByRole('complementary', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide sidebar' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(showSidebarButtons()).toHaveLength(2)
    expect(window.localStorage.getItem('consumit.home-sidebar')).toBe('collapsed')

    await user.click(showSidebarButtons()[0]!)
    expect(screen.getByRole('button', { name: 'Hide sidebar' })).toBeInTheDocument()
    expect(window.localStorage.getItem('consumit.home-sidebar')).toBe('open')
  })

  it('restores a collapsed sidebar on load', () => {
    window.localStorage.setItem('consumit.home-sidebar', 'collapsed')
    render(<ShellStateProvider><FilScreenHome hero={hero} popular={popular} trending={trending} /></ShellStateProvider>)

    expect(screen.getByRole('complementary', { name: 'Primary' })).toBeInTheDocument()
    expect(showSidebarButtons()).toHaveLength(2)
  })
})
