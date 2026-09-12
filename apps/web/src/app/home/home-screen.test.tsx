import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { HomeScreen } from './home-screen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const titles = Array.from({ length: 10 }, (_, index) => ({
  ...movieSummary,
  id: movieSummary.id + index,
  title: index === 0 ? movieSummary.title : `Catalog title ${index + 1}`,
}))

describe('home screen catalog presentation', () => {
  it('links Watch directly to the player and hides computed scoring', () => {
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} stale={false} trending={titles} />)

    expect(screen.getAllByRole('link', { name: 'Watch' })[0]).toHaveAttribute('href', '/watch/movie/693134')
    expect(screen.getAllByRole('link', { name: 'More info' })[0]).toHaveAttribute('href', '/title/693134')
    expect(screen.queryByText(/taste match|% match|% finished|TMDB rating/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/out of 5/i)).not.toBeInTheDocument()
  })

  it('hides member rails until their backends land', () => {
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} stale={false} trending={titles} />)

    expect(screen.queryByRole('heading', { name: 'From your circle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Continue watching' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Trending tonight' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Browse by genre' })).toBeInTheDocument()
  })

  it('shows popular, top-rated, and genre rails instead of the mood picker', () => {
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} popular={titles.slice(0, 5)} stale={false} topRated={titles.slice(5, 10)} trending={titles} />)

    expect(screen.getByRole('heading', { name: 'Popular now' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top rated' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Browse by genre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Science Fiction' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What kind of night is it?' })).not.toBeInTheDocument()
  })

  it('rotates the newest titles through the hero spotlight', () => {
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} spotlight={titles.slice(0, 2)} stale={false} trending={titles} />)

    const spotlight = screen.getByRole('region', { name: 'New this week' })
    expect(within(spotlight).getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(within(spotlight).getByRole('button', { name: 'Show Dune: Part Two' })).toHaveAttribute('aria-current', 'true')
    expect(within(spotlight).getByRole('button', { name: 'Show Catalog title 2' })).not.toHaveAttribute('aria-current')
  })

  it('shows the TMDB artwork logo on spotlight heroes', () => {
    const logo = { ...titles[0]!, logoUrl: 'https://image.tmdb.org/t/p/w500/dune-logo.png' }
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={logo} spotlight={[logo, titles[1]!]} stale={false} trending={titles} />)

    const spotlight = screen.getByRole('region', { name: 'New this week' })
    expect(within(spotlight).getByRole('img', { name: 'Dune: Part Two' })).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w500/dune-logo.png',
    )
  })

  it('gives spotlight heroes the title treatment with lede and byline', () => {
    const featured = {
      ...titles[0]!,
      certification: 'PG-13',
      creators: [{ character: null, id: 1, name: 'Denis Villeneuve', profileUrl: null, role: 'Director' }],
      runtimeMinutes: 166,
      tagline: 'Long live the fighters.',
    }
    const second = { ...titles[1]!, tmdbRating: 7.1 }
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} spotlight={[featured, second]} stale={false} trending={titles} />)

    const spotlight = screen.getByRole('region', { name: 'New this week' })
    expect(within(spotlight).getByText('Long live the fighters.')).toBeInTheDocument()
    expect(within(spotlight).getByText('Directed by Denis Villeneuve')).toBeInTheDocument()
    expect(within(spotlight).getByText('★ 8.2')).toBeInTheDocument()
    expect(within(spotlight).getByText('2h 46m')).toBeInTheDocument()
    expect(within(spotlight).getByText('PG-13')).toBeInTheDocument()
  })

  it('pairs Watch with More info in the hero', () => {
    const spotlightItems = [{ ...titles[0]!, tmdbRating: 9.1 }, { ...titles[1]!, tmdbRating: 9.2 }]
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} spotlight={spotlightItems} stale={false} trending={titles} />)

    const spotlight = screen.getByRole('region', { name: 'New this week' })
    expect(within(spotlight).getByRole('link', { name: 'Watch' })).toHaveAttribute('href', '/watch/movie/693134')
    expect(within(spotlight).getByRole('link', { name: 'More info' })).toHaveAttribute('href', '/title/693134')
  })
})
