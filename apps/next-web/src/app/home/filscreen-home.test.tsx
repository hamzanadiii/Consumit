import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import { FilScreenHome } from './filscreen-home'
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
afterEach(() => localStorage.clear())
const hero = { ...movieSummary, tagline: 'Long live the fighters.' }
describe('new frontend discovery', () => {
  it('takes the featured film directly to playback without invented member claims', async () => {
    render(<FilScreenHome hero={hero} />)
    expect(screen.getByRole('link', { name: 'Watch' })).toHaveAttribute('href', '/watch/movie/693134')
    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(screen.getByText('Long live the fighters.')).toBeInTheDocument()
    expect(await screen.findByText(/nothing in progress yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/taste match|% match|% finished/i)).not.toBeInTheDocument()
  })
  it('keeps movie and series rails in catalog order with real title destinations', () => {
    render(<FilScreenHome hero={hero} trendingMovies={[{ ...movieSummary, id: 4, title: 'Trending Movie One' }]} trendingSeries={[{ ...seriesSummary, id: 11, title: 'Trending Series One' }]} />)
    const headings = screen.getAllByRole('heading').map(h => h.textContent)
    expect(headings.indexOf('Movies worth your evening')).toBeLessThan(headings.indexOf('Find your next series'))
    expect(screen.getByRole('img', { name: 'Trending Movie One poster' })).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w500/dune.jpg')
    expect(screen.getByRole('link', { name: /Trending Movie One/ })).toHaveAttribute('href', '/title/4')
  })
  it('credits the catalog and gives guests an accessible account entry', async () => {
    const user = userEvent.setup(); render(<FilScreenHome hero={hero} />)
    expect(screen.getByRole('link', { name: 'TMDB' })).toHaveAttribute('href', 'https://www.themoviedb.org')
    expect(screen.getByRole('link', { name: 'Catalog credits' })).toHaveAttribute('href', '/about#catalog-credit')
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Open your space' }))
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('link', { name: 'Find members' })).not.toBeInTheDocument()
  })
})
