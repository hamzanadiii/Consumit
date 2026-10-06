import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { movieDetail, seriesDetail } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { SessionProvider } from '../session/session'
import { looksLikeAnime } from './catalog-ui'
import { SeriesDetailScreen, TitleDetailScreen } from './detail-screens'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const meta = { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false }
const firstSeason = {
  episodes: [{ airDate: '2022-02-18', episodeNumber: 1, id: 10, overview: 'The team arrives.', runtimeMinutes: 50, seasonNumber: 1, stillUrl: null, title: 'Good News About Hell' }],
  name: 'Season 1', overview: '', posterUrl: null, seasonNumber: 1, seriesId: 95396,
}

afterEach(() => vi.unstubAllGlobals())

describe('anime detection and cross-link', () => {
  it('flags Animation with a Japanese origin only', () => {
    expect(looksLikeAnime({ genreNames: ['Animation', 'Action'], countries: ['Japan'], languages: ['Japanese'] })).toBe(true)
    expect(looksLikeAnime({ genreNames: ['Animation'], countries: ['JP'], languages: ['Japanese'] })).toBe(true)
    expect(looksLikeAnime({ genreNames: ['Animation'], countries: ['United States of America'], languages: ['English'] })).toBe(false)
    expect(looksLikeAnime({ genreNames: ['Drama'], countries: ['Japan'], languages: ['Japanese'] })).toBe(false)
  })

  it('shows no cross-link UI on detail screens (redirect happens in the page)', () => {
    render(<SeriesDetailScreen detail={seriesDetail} initialSeason={firstSeason} />)
    expect(screen.queryByRole('link', { name: /as anime$/ })).not.toBeInTheDocument()
    render(<TitleDetailScreen detail={movieDetail} />)
    expect(screen.queryByRole('link', { name: /as anime$/ })).not.toBeInTheDocument()
  })
})

describe('series season selection', () => {
  it('continues the last watched series episode instead of starting episode one', async () => {
    const ref = { kind: 'series', id: seriesDetail.id, season: 1, episode: 3 }
    localStorage.setItem(`consumit.progress:guest:series:${seriesDetail.id}:1:3`, JSON.stringify({ ...ref, positionSeconds: 450, durationSeconds: 3000, completed: false, updatedAt: '2026-10-03T00:00:00.000Z' }))
    try {
      render(<SeriesDetailScreen detail={seriesDetail} initialSeason={firstSeason} />)
      expect(await screen.findByRole('link', { name: 'Continue watching' })).toHaveAttribute('href', `/watch/series/${seriesDetail.id}?season=1&episode=3`)
    } finally { localStorage.clear() }
  })
  it('keeps computed taste and numeric scores out of title details', () => {
    render(<TitleDetailScreen detail={movieDetail} />)

    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/watch/movie/693134')
    expect(screen.queryByText(/taste match|% match|TMDB ratings|TMDB votes|average/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/out of 5/i)).not.toBeInTheDocument()
  })

  it('leads the hero with tagline, maker credit, score, and a member action row', () => {
    const detail = {
      ...movieDetail,
      creators: [{ character: null, id: 1, name: 'Denis Villeneuve', profileUrl: null, role: 'Director' }],
      tagline: 'Long live the fighters.',
    }
    render(<TitleDetailScreen detail={detail} />)

    expect(screen.getByText('Long live the fighters.')).toBeInTheDocument()
    expect(screen.getByText('Directed by Denis Villeneuve')).toBeInTheDocument()
    expect(screen.getByText('★ 8.2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rate' })).not.toBeInTheDocument()
    expect(screen.getByText('Your rating')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Your activity' })).toHaveAttribute('href', '/sign-in')
    const synopses = screen.getAllByText('Paul unites with Chani and the Fremen.')
    expect(synopses).toHaveLength(2)
    expect(synopses[0]?.className).toMatch(/line-clamp-3/)
    expect(synopses[1]?.className).not.toMatch(/line-clamp-3/)
  })

  it('shelves rating in the hero panel with no separate section', () => {
    render(<TitleDetailScreen detail={movieDetail} />)

    expect(screen.queryByRole('heading', { name: 'Your rating' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rate' })).not.toBeInTheDocument()
    expect(screen.getByText('Your rating')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('toggles the title save action between add and saved states', async () => {    const user = userEvent.setup()
const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ diary: [], favorites: [], lists: [], savedLists: [], saved: [], watched: [] }), { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    render(<SessionProvider initialMember={{ avatarStyle: 'dusk', avatarUrl: null, createdAt: '2026-09-07T12:00:00.000Z', displayName: null, email: 'member@example.com', emailVerified: true, id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca', role: 'member', username: 'cinema_fan' }} initialStatus="authenticated"><TitleDetailScreen detail={movieDetail} /></SessionProvider>)

    const save = screen.getByRole('button', { name: 'Save Dune: Part Two to library' })
    expect(save).toHaveAttribute('aria-pressed', 'false')
    await user.click(save)
    expect(await screen.findByRole('button', { name: 'Remove Dune: Part Two from library' })).toHaveAttribute('aria-pressed', 'true')
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/library/titles/movie/693134', expect.objectContaining({ method: 'PUT' }))
  })

  it('renders a cast-and-crew member once when both lists share their id', () => {
    const detail = {
      ...movieDetail,
      cast: [{ character: 'Paul Atreides', id: 55251, name: 'Timothée Chalamet', profileUrl: null, role: 'Actor' }],
      creators: [{ character: null, id: 55251, name: 'Timothée Chalamet', profileUrl: null, role: 'Director' }],
    }
    const { container } = render(<TitleDetailScreen detail={detail} />)

    const cards = container.querySelectorAll('[data-consumit-cast-card]')
    expect(cards).toHaveLength(1)
    expect(screen.getByText('Directed by Timothée Chalamet')).toBeInTheDocument()
  })

  it('switches through Fastify and preserves the current season when a later load fails', async () => {
    const user = userEvent.setup()
    const seasonFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { ...firstSeason, episodes: [{ ...firstSeason.episodes[0], episodeNumber: 2, id: 11, seasonNumber: 2, title: 'Second Season Premiere' }], name: 'Season 2', seasonNumber: 2 }, meta }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'CATALOG_UNAVAILABLE', message: 'TMDB is unavailable.', retryable: true } }), { status: 503 }))
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      if (String(input).includes('/v1/reviews/')) {
        return Promise.resolve(new Response(JSON.stringify({ items: [], page: 1, totalPages: 0, totalResults: 0 }), { status: 200 }))
      }
      return seasonFetch()
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SeriesDetailScreen detail={seriesDetail} initialSeason={firstSeason} />)

    await user.click(screen.getByRole('button', { name: 'Season Season 1 · 9 episodes' }))
    await user.click(screen.getByRole('option', { name: 'Season 2 · 10 episodes' }))
    expect(await screen.findByText('Second Season Premiere')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Season Season 2 · 10 episodes' }))
    await user.click(screen.getByRole('option', { name: 'Season 1 · 9 episodes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('current season is still here')
    expect(screen.getByText('Second Season Premiere')).toBeInTheDocument()
    await waitFor(() => expect(seasonFetch).toHaveBeenCalledTimes(2))
  })
})
