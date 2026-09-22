import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { SearchScreen } from './search-screen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

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

  it('hosts the mood picker relocated from Home', () => {
    render(<SearchScreen initialQuery="dune" page={page} queryTooShort={false} />)

    expect(screen.getByRole('heading', { name: 'What kind of night is it?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Surprise me tonight/ })).toHaveAttribute('href', '#results')
  })

  it('routes anime matches to AniList detail pages, never TMDB', async () => {
    const user = userEvent.setup()
    const onePiece = {
      anilistId: 21,
      kind: 'anime' as const,
      titles: { preferred: 'One Piece', english: 'One Piece', romaji: 'One Piece', native: 'ワンピース' },
      format: 'TV' as const,
      status: 'RELEASING' as const,
      season: null,
      seasonYear: 1999,
      episodes: null,
      episodeDuration: 24,
      genres: ['Adventure'],
      coverImage: { url: null, color: null },
      bannerImage: null,
      averageScore: 87,
      popularity: 1000,
      description: 'Pirates.',
      nextAiringEpisode: null,
    }
    render(<SearchScreen animeResults={[onePiece]} initialQuery="one piece" page={page} queryTooShort={false} />)

    await user.click(screen.getByRole('button', { name: 'Anime' }))
    expect(screen.getByRole('link', { name: 'One Piece' })).toHaveAttribute('href', '/anime/21')
    expect(screen.getByText(/Anime metadata by AniList/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Severance' })).not.toBeInTheDocument()
  })
})
