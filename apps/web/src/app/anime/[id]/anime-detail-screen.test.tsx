import type { AnimeEpisode, AnimeTitleDetail } from '@consumit/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/render'

import { AnimeDetailScreen, AnimeHeroTitle, indexStreamingMeta } from './anime-detail-screen'

const batch = vi.hoisted(() => vi.fn<(_id: number, _numbers: number[]) => Promise<(AnimeEpisode | null)[]>>(async () => []))
vi.mock('@/lib/anime-browser', () => ({ browserAnimeEpisodes: batch }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/app/anime/use-episode-art', () => ({
  useEpisodeArt: () => null,
}))

vi.mock('@/app/catalog/member-action-panel', () => ({
  MemberActionPanel: (props: { id: number; kind: string; posterUrl?: string; title: string; year?: number | null }) => (
    <div data-testid="member-action-panel" data-id={props.id} data-kind={props.kind}>
      {props.title}
    </div>
  ),
}))

vi.mock('@/app/catalog/title-reviews', () => ({
  TitleReviews: (props: { id: number; kind: string; title: string }) => (
    <div data-testid="title-reviews" data-id={props.id} data-kind={props.kind}>
      {props.title}
    </div>
  ),
}))

function animeFixture(overrides: Partial<AnimeTitleDetail> = {}): AnimeTitleDetail {
  return {
    anilistId: 21,
    averageScore: 92,
    bannerImage: null,
    characters: [],
    countryOfOrigin: 'JP',
    coverImage: { color: '#6366f1', url: 'https://cdn.example/cover.jpg' },
    description: 'The adventure is over, but life goes on for the hero who outlived it.',
    episodeDuration: 24,
    episodes: 2,
    externalLinks: [],
    format: 'TV',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    kind: 'anime',
    logoUrl: null,
    malId: null,
    nextAiringEpisode: null,
    popularity: 1_000,
    recommendations: [],
    season: 'FALL',
    seasonYear: 2023,
    source: 'MANGA',
    staff: [],
    status: 'FINISHED',
    streamingEpisodes: [],
    titles: { english: 'Frieren: Beyond Journey\u2019s End', native: '\u9035\u306e\u3075\u308a\u3048\u3093', preferred: 'Frieren: Beyond Journey\u2019s End', romaji: 'Sousou no Frieren' },
    trailer: null,
    ...overrides,
  }
}

function detail(episodes: Array<{ title: string; thumbnail: string | null; site: string }>) {
  return { streamingEpisodes: episodes } as Parameters<typeof indexStreamingMeta>[0]
}

describe('streaming episode index', () => {
  it('keys titled episodes by canonical number with artwork', () => {
    const indexed = indexStreamingMeta(detail([
      { title: 'Episode 130 - Scent of Danger!', thumbnail: 'https://cdn.example/130.jpg', site: 'Crunchyroll' },
      { title: 'Episode 9: Truth', thumbnail: null, site: 'Crunchyroll' },
    ]))
    expect(indexed.get(130)).toEqual({ title: 'Episode 130 - Scent of Danger!', thumbnail: 'https://cdn.example/130.jpg' })
    expect(indexed.get(9)).toEqual({ title: 'Episode 9: Truth', thumbnail: null })
  })
  it('skips untitled entries and keeps the first duplicate', () => {
    const indexed = indexStreamingMeta(detail([
      { title: 'Trailer', thumbnail: 'https://cdn.example/t.jpg', site: 'Crunchyroll' },
      { title: 'Episode 1 - Pilot', thumbnail: 'https://cdn.example/1a.jpg', site: 'A' },
      { title: 'Episode 1 - Pilot (dup)', thumbnail: 'https://cdn.example/1b.jpg', site: 'B' },
    ]))
    expect(indexed.has(1)).toBe(true)
    expect(indexed.get(1)?.thumbnail).toBe('https://cdn.example/1a.jpg')
    expect(indexed.size).toBe(1)
  })
})

describe('anime hero title', () => {
  it('renders logo art with a screen-reader title when matched', () => {
    render(<AnimeHeroTitle logoUrl="https://image.tmdb.org/t/p/w500/logo.png" title="Cowboy Bebop" />)
    // Next.js optimizes the src; the accessible name proves the logo branch.
    expect(screen.getByRole('img', { name: 'Cowboy Bebop' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cowboy Bebop' })).toBeInTheDocument()
  })

  it('renders the serif display title without a logo', () => {
    render(<AnimeHeroTitle logoUrl={null} title="Cowboy Bebop" />)
    expect(screen.getByRole('heading', { name: 'Cowboy Bebop' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('anime detail screen member surfaces', () => {
  it('loads metadata once for the visible page and labels title artwork', async () => {
    batch.mockResolvedValueOnce([{ anilistId: 21, number: 1, title: 'The Journey', description: 'A new beginning.', thumbnail: null, airDate: '2023-09-01', duration: 24 }, null])
    renderWithProviders(<AnimeDetailScreen airing={null} detail={animeFixture()} relations={null} />)
    expect(await screen.findByText('A new beginning.')).toBeInTheDocument()
    expect(batch).toHaveBeenCalledWith(21, [1, 2])
    expect(screen.getAllByText('Title artwork')).toHaveLength(2)
  })
  it('shelves member actions in the hero with the anime namespace', () => {
    renderWithProviders(<AnimeDetailScreen airing={null} detail={animeFixture()} relations={null} />)

    const panel = screen.getByTestId('member-action-panel')
    expect(panel).toHaveAttribute('data-kind', 'anime')
    expect(panel).toHaveAttribute('data-id', '21')
    expect(panel).toHaveTextContent('Frieren: Beyond Journey\u2019s End')
    const masthead = document.querySelector('[data-consumit-anime-masthead]')
    expect(masthead?.querySelector('a[href="/watch/anime/21?episode=1"]')).not.toBeNull()
  })

  it('shows the next-airing box above the member shelf when scheduled', () => {
    const detail = animeFixture({ nextAiringEpisode: { airingAt: '2026-09-24T00:00:00.000Z', episode: 3 } })
    renderWithProviders(<AnimeDetailScreen airing={null} detail={detail} relations={null} />)

    expect(screen.getByText('Next Episode: #3')).toBeInTheDocument()
    expect(screen.getByText(/Airing 9\/24\/2026/)).toBeInTheDocument()
  })

  it('wires a Reviews tab and member reviews section for anime', () => {
    renderWithProviders(<AnimeDetailScreen airing={null} detail={animeFixture()} relations={null} />)

    const tabStrip = screen.getByRole('navigation', { name: 'Frieren: Beyond Journey\u2019s End sections' })
    expect(tabStrip).toHaveTextContent('Episodes')
    expect(tabStrip).toHaveTextContent('Overview')
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('href', '#reviews')

    const reviews = document.getElementById('reviews')
    expect(reviews).not.toBeNull()
    expect(reviews?.contains(screen.getByRole('heading', { name: 'Member reviews' }))).toBe(true)

    const reviewsModule = screen.getByTestId('title-reviews')
    expect(reviewsModule).toHaveAttribute('data-kind', 'anime')
    expect(reviewsModule).toHaveAttribute('data-id', '21')
    expect(reviews?.contains(reviewsModule)).toBe(true)
  })
})

describe('anime recommendations', () => {
  it('shows distinct related seasons and films before the overview and removes Staff', () => {
    const original = animeFixture()
    const sequel = animeFixture({ anilistId: 22, titles: { ...original.titles, preferred: 'Next Season' } })
    const film = animeFixture({ anilistId: 23, format: 'MOVIE', titles: { ...original.titles, preferred: 'Related Film' } })
    renderWithProviders(<AnimeDetailScreen airing={null} detail={{ ...original, staff: [{ id: 1, name: 'Example Director', image: null, role: 'Director' }] }} relations={{ main: original, relations: [{ type: 'SEQUEL', anime: sequel }, { type: 'SIDE_STORY', anime: film }, { type: 'SEQUEL', anime: sequel }, { type: 'PREQUEL', anime: original }] }} />)
    expect(screen.getAllByRole('link', { name: 'Next Season' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Related Film' })).toHaveAttribute('href', '/anime/23')
    expect(screen.getByText('Next season')).toBeInTheDocument()
    expect(document.getElementById('staff')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument()
    expect(document.getElementById('related')?.compareDocumentPosition(document.getElementById('overview')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
  it('replaces external links with an AniList recommendations rail', () => {
    const recommended = animeFixture({
      anilistId: 7,
      titles: { english: 'Other Show', native: null, preferred: 'Other Show', romaji: 'Other Show' },
    })
    const detail = animeFixture({
      externalLinks: [{ id: 1, site: 'Twitter', color: null, url: 'https://twitter.com/example' }],
      recommendations: [animeFixture(), recommended, recommended],
    })
    renderWithProviders(<AnimeDetailScreen airing={null} detail={detail} relations={null} />)

    expect(screen.queryByRole('heading', { name: 'Links' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Twitter' })).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Recommendations' })).toHaveAttribute('href', '#recommendations')
    const recommendations = document.getElementById('recommendations')
    expect(recommendations).not.toBeNull()
    expect(recommendations?.contains(screen.getByRole('heading', { name: 'Watch next' }))).toBe(true)
    expect(screen.getByRole('link', { name: 'Other Show' })).toHaveAttribute('href', '/anime/7')
    // The current title and duplicate entries drop out of the rail.
    expect(screen.getAllByRole('link', { name: 'Other Show' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Frieren: Beyond Journey\u2019s End, 2023' })).not.toBeInTheDocument()
  })

  it('hides the recommendations tab and section when AniList returns none', () => {
    renderWithProviders(<AnimeDetailScreen airing={null} detail={animeFixture()} relations={null} />)

    expect(screen.queryByRole('link', { name: 'Recommendations' })).not.toBeInTheDocument()
    expect(document.getElementById('recommendations')).toBeNull()
  })
})
