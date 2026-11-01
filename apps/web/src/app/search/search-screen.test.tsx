import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { SearchScreen } from './search-screen'

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, refresh: navigation.refresh }),
}))

const page = {
  items: [movieSummary, seriesSummary],
  meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false },
  page: 1,
  totalPages: 1,
  totalResults: 2,
}

describe('search screen', () => {
  beforeEach(() => { navigation.push.mockClear(); navigation.refresh.mockClear() })

  it('puts the selected catalog kind in the URL and preserves canonical title links', async () => {
    const user = userEvent.setup()
    render(<SearchScreen initialQuery="dune" page={page} queryTooShort={false} />)
    expect(screen.getAllByRole('link', { name: 'Severance' }).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Movies' }))
    expect(navigation.push).toHaveBeenCalledWith('/search?q=dune&type=movie', { scroll: false })
    expect(screen.queryByText(/taste match|% match|overlap/i)).not.toBeInTheDocument()
  }, 10_000)

  it('clears the kind from the URL when returning to all results', async () => {
    const user = userEvent.setup()
    render(<SearchScreen initialKind="movie" initialQuery="dune" page={page} queryTooShort={false} />)

    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(navigation.push).toHaveBeenCalledWith('/search?q=dune', { scroll: false })
  })

  it('preserves the selected kind when submitting another query', () => {
    render(<SearchScreen initialKind="series" initialQuery="severance" page={page} queryTooShort={false} />)

    expect(screen.getByRole('search').querySelector('input[name="type"]')).toHaveValue('series')
  })

  it('does not promote a result from another kind when the selected kind is empty', () => {
    const seriesOnlyPage = { ...page, items: [seriesSummary] }
    render(<SearchScreen initialKind="movie" initialQuery="dune" page={seriesOnlyPage} queryTooShort={false} />)

    expect(screen.queryByRole('heading', { name: 'Best match for “dune”' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No titles found' })).toBeInTheDocument()
  })

  it('shows an honest empty state for an Anime search with no AniList matches', () => {
    render(<SearchScreen initialKind="anime" initialQuery="one piece" page={null} queryTooShort={false} animeResults={[]} />)

    expect(screen.getByRole('heading', { name: 'No anime found' })).toBeInTheDocument()
  })

  it('keeps the query and offers retry when AniList is unavailable', async () => {
    const user = userEvent.setup()
    render(<SearchScreen initialKind="anime" initialQuery="one piece" page={null} queryTooShort={false} animeResults={[]} animeUnavailable />)

    expect(screen.getByRole('alert')).toHaveTextContent('Anime search is temporarily unavailable.')
    expect(screen.queryByRole('heading', { name: 'No anime found' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry anime search' }))
    expect(navigation.refresh).toHaveBeenCalledOnce()
  })

  it('keeps anime results visible and offers retry when the title catalog is unavailable', async () => {
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
    render(<SearchScreen animeResults={[onePiece]} catalogUnavailable initialQuery="one piece" page={null} queryTooShort={false} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Movie and series search is temporarily unavailable.')
    expect(screen.getByRole('link', { name: 'One Piece' })).toHaveAttribute('href', '/anime/21')
    await user.click(screen.getByRole('button', { name: 'Retry title search' }))
    expect(navigation.refresh).toHaveBeenCalledOnce()
  })

  it.each(['movie', 'series'] as const)('keeps a filtered %s query in place while the catalog retries', async (kind) => {
    const user = userEvent.setup()
    render(<SearchScreen catalogUnavailable initialKind={kind} initialQuery="dune" page={null} queryTooShort={false} />)

    expect(screen.getByRole('searchbox', { name: 'Search movies, series, and anime' })).toHaveValue('dune')
    expect(screen.getByRole('button', { name: kind === 'movie' ? 'Movies' : 'Series' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(`${kind === 'movie' ? 'Movie' : 'Series'} search is temporarily unavailable.`)
    expect(screen.queryByRole('heading', { name: 'No titles found' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry title search' }))
    expect(navigation.refresh).toHaveBeenCalledOnce()
  })

  it('keeps catalog matches visible and offers Anime retry when AniList is unavailable in All', async () => {
    const user = userEvent.setup()
    render(<SearchScreen animeResults={[]} animeUnavailable initialQuery="dune" page={page} queryTooShort={false} />)

    expect(screen.getAllByRole('link', { name: 'Dune: Part Two' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('alert')).toHaveTextContent('Anime search is temporarily unavailable.')
    expect(screen.getByRole('button', { name: 'Retry anime search' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry anime search' }))
    expect(navigation.refresh).toHaveBeenCalledOnce()
  })

  it('returns to the Anime query after sign-in is required', () => {
    render(<SearchScreen initialKind="anime" initialQuery="one piece" page={null} queryTooShort={false} animeResults={[]} animeSignInRequired />)

    const signInState = screen.getByRole('heading', { name: 'Sign in to search anime' }).closest<HTMLElement>('[data-consumit-empty-state]')
    const signIn = within(signInState!).getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', '/sign-in?next=%2Fsearch%3Fq%3Done%2Bpiece%26type%3Danime')
    expect(signIn).toHaveClass('min-h-[44px]')
  })

  it('keeps search focused on titles without a member discovery section', () => {
    render(<SearchScreen initialQuery="dune" page={page} queryTooShort={false} />)

    expect(screen.queryByRole('link', { name: /Discover members/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'People' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What kind of night is it?' })).not.toBeInTheDocument()
  })

  it('routes anime matches to AniList detail pages, never TMDB', async () => {
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
    render(<SearchScreen animeResults={[onePiece]} initialKind="anime" initialQuery="one piece" page={page} queryTooShort={false} />)

    expect(screen.getByRole('link', { name: 'One Piece' })).toHaveAttribute('href', '/anime/21')
    expect(screen.getByText(/Anime metadata by AniList/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Severance' })).not.toBeInTheDocument()
  })

  it('asks signed-out visitors to sign in instead of reporting no anime matches', () => {
    render(<SearchScreen animeSignInRequired initialQuery="one piece" page={page} queryTooShort={false} />)

    expect(screen.getByRole('heading', { name: 'Sign in to search anime' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No anime found' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'One Piece' })).not.toBeInTheDocument()
  })
})
