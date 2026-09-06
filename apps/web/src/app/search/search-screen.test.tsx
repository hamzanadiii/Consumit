import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { SearchScreen } from './search-screen'

const page = {
  items: [movieSummary, seriesSummary],
  meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false },
  page: 1,
  totalPages: 1,
  totalResults: 2,
}

describe('search screen', () => {
  it('filters real results by catalog kind without changing canonical links', async () => {
    const user = userEvent.setup()
    render(<SearchScreen initialQuery="dune" page={page} queryTooShort={false} />)
    expect(screen.getAllByRole('link', { name: 'Severance' }).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Movies' }))
    expect(screen.queryByRole('link', { name: 'Severance' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Dune: Part Two' })[0]).toHaveAttribute('href', '/title/693134')
    expect(screen.getByRole('link', { name: 'Watch' })).toHaveAttribute('href', '/watch/movie/693134')
    expect(screen.queryByText(/taste match|% match|overlap/i)).not.toBeInTheDocument()
  })
})
