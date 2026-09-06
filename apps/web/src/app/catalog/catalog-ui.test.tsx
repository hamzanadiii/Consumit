import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'

import { CatalogGrid, CatalogStaleNotice, CatalogUnavailableScreen } from './catalog-ui'

describe('catalog UI', () => {
  it('renders real title data with a numeric canonical link and missing-artwork fallback', () => {
    render(<CatalogGrid items={[movieSummary, { ...movieSummary, id: 329865, posterUrl: null, title: 'Arrival' }]} />)
    expect(screen.getByRole('link', { name: 'Dune: Part Two' })).toHaveAttribute('href', '/title/693134')
    expect(screen.getByRole('img', { name: 'Arrival poster' })).toBeInTheDocument()
  })

  it('only announces stale catalog data when the response is stale', () => {
    const meta = { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false }
    const { rerender } = render(<CatalogStaleNotice meta={meta} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<CatalogStaleNotice meta={{ ...meta, stale: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent('latest saved catalog data')
  })

  it('turns a missing server catalog configuration into a useful product state', () => {
    render(<CatalogUnavailableScreen error={{ code: 'CATALOG_NOT_CONFIGURED', retryable: false }} />)

    expect(screen.getByRole('heading', { name: 'The catalog missed its cue' })).toBeInTheDocument()
    expect(screen.getByText(/server-only TMDB API Read Access Token/)).toBeInTheDocument()
  })
})
