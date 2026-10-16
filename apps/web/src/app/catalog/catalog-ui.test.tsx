import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { CatalogGrid, CatalogUnavailableScreen, makerByline } from './catalog-ui'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('catalog UI', () => {
  it('renders real title data with a numeric canonical link and missing-artwork fallback', () => {
    render(<CatalogGrid items={[movieSummary, { ...movieSummary, id: 329865, posterUrl: null, title: 'Arrival' }]} />)
    expect(screen.getByRole('link', { name: 'Dune: Part Two' })).toHaveAttribute('href', '/title/693134')
    expect(screen.getByRole('img', { name: 'Arrival poster' })).toBeInTheDocument()
    expect(screen.queryByText(/taste match|% match|TMDB rating/i)).not.toBeInTheDocument()
  })

  it('turns a missing server catalog configuration into a useful product state', () => {
    render(<CatalogUnavailableScreen error={{ code: 'CATALOG_NOT_CONFIGURED', retryable: false }} />)

    expect(screen.getByRole('heading', { name: 'The catalog missed its cue' })).toBeInTheDocument()
    expect(screen.getByText(/server-only TMDB API Read Access Token/)).toBeInTheDocument()
  })

  it('shares one maker byline across heroes', () => {
    expect(makerByline({ creators: [{ name: 'Denis Villeneuve', role: 'Director' }], kind: 'movie' })).toBe(
      'Directed by Denis Villeneuve',
    )
    expect(makerByline({ creators: [], kind: 'series' })).toBeUndefined()
    expect(makerByline({ creators: [{ name: 'Dan Erickson', role: 'Creator' }], kind: 'series' })).toBe(
      'Created by Dan Erickson',
    )
  })

  it('explains rate limiting without claiming that metadata timed out', () => {
    render(<CatalogUnavailableScreen error={{ code: 'RATE_LIMITED', retryable: true }} />)
    expect(screen.getByText(/Too many catalog requests/)).toBeInTheDocument()
    expect(screen.queryByText(/did not answer in time/)).not.toBeInTheDocument()
    expect(screen.getByText('Retry catalog').closest('a')).toHaveAttribute('href', '')
  })
})
