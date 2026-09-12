import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { CatalogGrid, CatalogStaleNotice, CatalogUnavailableScreen, detailMeta, heroMeta, makerByline } from './catalog-ui'

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

  it('only announces stale catalog data when the response is stale', () => {
    const meta = { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false }
    const { rerender } = render(<CatalogStaleNotice meta={meta} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<CatalogStaleNotice meta={{ ...meta, stale: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent('saved catalog data')
  })

  it('turns a missing server catalog configuration into a useful product state', () => {
    render(<CatalogUnavailableScreen error={{ code: 'CATALOG_NOT_CONFIGURED', retryable: false }} />)

    expect(screen.getByRole('heading', { name: 'The catalog missed its cue' })).toBeInTheDocument()
    expect(screen.getByText(/server-only TMDB API Read Access Token/)).toBeInTheDocument()
  })

  it('leads hero meta with the TMDB score', () => {
    expect(heroMeta(movieSummary)).toBe('★ 8.2 · 2024 · Film · Science Fiction · Adventure')
    expect(heroMeta({ ...movieSummary, tmdbRating: null })).toBe('2024 · Film · Science Fiction · Adventure')
  })

  it('shares one score-led meta and maker byline across heroes', () => {
    render(<>{detailMeta({ ...movieSummary, certification: 'PG-13', runtimeMinutes: 166 })}</>)
    expect(screen.getByText('★ 8.2')).toBeInTheDocument()
    expect(screen.getByText('2h 46m')).toBeInTheDocument()
    expect(screen.getByText('PG-13')).toBeInTheDocument()

    expect(makerByline({ creators: [{ name: 'Denis Villeneuve', role: 'Director' }], kind: 'movie' })).toBe(
      'Directed by Denis Villeneuve',
    )
    expect(makerByline({ creators: [], kind: 'series' })).toBeUndefined()
    expect(makerByline({ creators: [{ name: 'Dan Erickson', role: 'Creator' }], kind: 'series' })).toBe(
      'Created by Dan Erickson',
    )
  })
})
