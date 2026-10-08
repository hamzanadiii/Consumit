import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { FilScreenHome } from './filscreen-home'
import { FilScreenSearchOverlay } from './filscreen-search-overlay'
import { ShellStateProvider } from './shell-state'

const mocks = vi.hoisted(() => ({
  browserSearchAnime: vi.fn(),
  browserSearchCatalog: vi.fn(),
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}))

vi.mock('@/lib/catalog-browser', () => ({
  browserSearchCatalog: mocks.browserSearchCatalog,
}))

vi.mock('@/lib/anime-browser', () => ({
  browserSearchAnime: mocks.browserSearchAnime,
}))

const animeSummary = {
  anilistId: 21,
  averageScore: 85,
  bannerImage: null,
  coverImage: { color: null, url: 'https://s4.anilist.co/file/anilistcdn/onepiece.jpg' },
  description: 'Pirates.',
  episodeDuration: 24,
  episodes: 1000,
  format: 'TV',
  genres: ['Adventure', 'Fantasy'],
  kind: 'anime',
  nextAiringEpisode: null,
  popularity: 500000,
  season: 'FALL',
  seasonYear: 1999,
  status: 'RELEASING',
  titles: { english: 'One Piece', native: null, preferred: 'One Piece', romaji: 'One Piece' },
} as const

const hero = { ...movieSummary, tagline: 'Long live the fighters.' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.browserSearchCatalog.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
  mocks.browserSearchAnime.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
})

describe('filscreen command search', () => {
  it('opens a fullscreen dialog with a cool expanding panel when the trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<ShellStateProvider><FilScreenHome hero={hero} trendingMovies={[]} trendingSeries={[]} /></ShellStateProvider>)

    await user.click(screen.getByRole('button', { name: 'Search titles' }))

    const dialog = screen.getByRole('dialog', { name: 'Search titles' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('fs-search-panel')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Search movies, series, and anime' })).toHaveFocus())
    expect(screen.getByText('Find something to watch')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Search movies, series, and anime' })).toHaveAttribute('placeholder', 'Search movies and TV shows…')
  })

  it('narrows the live search to the chosen scope', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary], page: 1, totalPages: 1, totalResults: 1 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.click(screen.getByRole('button', { name: 'Search scope All' }))
    await user.click(screen.getByRole('option', { name: 'Movies' }))
    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'dune')

    await waitFor(() => expect(mocks.browserSearchCatalog).toHaveBeenCalledWith('dune', 'movie'))
    expect(mocks.browserSearchAnime).not.toHaveBeenCalled()
    expect(await screen.findByRole('option', { name: /Dune: Part Two/ })).toBeInTheDocument()
  })

  it('searches only AniList under the Anime scope', async () => {
    const user = userEvent.setup()
    mocks.browserSearchAnime.mockResolvedValue({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.click(screen.getByRole('button', { name: 'Search scope All' }))
    await user.click(screen.getByRole('option', { name: 'Anime' }))
    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'one piece')

    await waitFor(() => expect(mocks.browserSearchAnime).toHaveBeenCalledWith('one piece'))
    expect(mocks.browserSearchCatalog).not.toHaveBeenCalled()
    expect(await screen.findByRole('option', { name: /One Piece/ })).toBeInTheDocument()
  })

  it('drops the previous scope results when the scope changes', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary], page: 1, totalPages: 1, totalResults: 1 })
    mocks.browserSearchAnime.mockResolvedValue({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'dune')
    expect(await screen.findByRole('option', { name: /Dune: Part Two/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Search scope All' }))
    await user.click(screen.getByRole('option', { name: 'Anime' }))

    await waitFor(() => expect(screen.queryByRole('option', { name: /Dune: Part Two/ })).not.toBeInTheDocument())
    expect(await screen.findByRole('option', { name: /One Piece/ })).toBeInTheDocument()
  })

  it('toggles with Cmd+K and closes with Escape', async () => {
    const user = userEvent.setup()
    render(<ShellStateProvider><FilScreenHome hero={hero} trendingMovies={[]} trendingSeries={[]} /></ShellStateProvider>)

    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('dialog', { name: 'Search titles' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Search titles' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Search titles' })).toHaveFocus())
  })

  it('shows live catalog results and opens the highlighted title on Enter', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary, seriesSummary], page: 1, totalPages: 1, totalResults: 2 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'dune')

    expect(await screen.findByRole('option', { name: /Dune: Part Two/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Severance/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See all results/ })).toHaveAttribute('href', '/search?q=dune')

    await user.keyboard('{Enter}')
    expect(mocks.push).toHaveBeenCalledWith('/title/693134')
  })

  it('supports arrow navigation and submits to the full search page', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary, seriesSummary], page: 1, totalPages: 1, totalResults: 2 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    const box = screen.getByRole('combobox', { name: 'Search movies, series, and anime' })
    await user.type(box, 'sev')

    expect(await screen.findByRole('option', { name: /Severance/ })).toBeInTheDocument()
    // Best title fit ranks first and starts highlighted.
    await waitFor(() => expect(screen.getByRole('option', { name: /Severance/ })).toHaveAttribute('aria-selected', 'true'))
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('option', { name: /Dune: Part Two/ })).toHaveAttribute('aria-selected', 'true'))

    await user.clear(box)
    mocks.browserSearchCatalog.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    mocks.browserSearchAnime.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    await user.type(box, 'something unknown xyz')
    expect(await screen.findByText(/No titles found/)).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/search?q=something'))
  })

  it('ranks anime matches by title fit instead of burying them last', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary], page: 1, totalPages: 1, totalResults: 1 })
    mocks.browserSearchAnime.mockResolvedValue({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'one')

    const listbox = await screen.findByRole('listbox')
    const options = await within(listbox).findAllByRole('option')
    expect(options[0]).toHaveTextContent('One Piece')
    expect(options[1]).toHaveTextContent('Dune: Part Two')

    await user.keyboard('{Enter}')
    expect(mocks.push).toHaveBeenCalledWith('/anime/21')
  })

  it('keeps the better catalog match first when it fits the query best', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary], page: 1, totalPages: 1, totalResults: 1 })
    mocks.browserSearchAnime.mockResolvedValue({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'dune')

    const listbox = await screen.findByRole('listbox')
    const options = await within(listbox).findAllByRole('option')
    expect(options[0]).toHaveTextContent('Dune: Part Two')
    expect(options[1]).toHaveTextContent('One Piece')

    await user.keyboard('{Enter}')
    expect(mocks.push).toHaveBeenCalledWith('/title/693134')
  })

  it('keeps anime results when the movie/series catalog fails', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockRejectedValue(new Error('down'))
    mocks.browserSearchAnime.mockResolvedValue({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'one')

    expect(await screen.findByRole('option', { name: /One Piece/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces catalog failures with retry without losing the query', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockRejectedValue(new Error('down'))
    mocks.browserSearchAnime.mockRejectedValue(new Error('down'))
    render(<FilScreenSearchOverlay onClose={() => {}} open />)

    await user.type(screen.getByRole('combobox', { name: 'Search movies, series, and anime' }), 'dune')

    expect(await screen.findByRole('alert')).toHaveTextContent('Search could not load')
    expect(screen.getByRole('combobox', { name: 'Search movies, series, and anime' })).toHaveValue('dune')

    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary], page: 1, totalPages: 1, totalResults: 1 })
    mocks.browserSearchAnime.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('option', { name: /Dune: Part Two/ })).toBeInTheDocument()
  })
})
