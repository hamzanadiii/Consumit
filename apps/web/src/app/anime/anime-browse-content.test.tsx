import type { AnimePage, AnimeTitleSummary } from '@consumit/contracts'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { browserAnimeBrowse } from '@/lib/anime-browser'

import { AnimeBrowseContent } from './anime-browse-content'

vi.mock('@/lib/anime-browser', () => ({ browserAnimeBrowse: vi.fn() }))

const animeSummary: AnimeTitleSummary = {
  anilistId: 21,
  averageScore: 92,
  bannerImage: null,
  coverImage: { color: null, url: 'https://cdn.example/cover.jpg' },
  description: 'The adventure is over, but life goes on.',
  episodeDuration: 24,
  episodes: 24,
  format: 'TV',
  genres: ['Adventure', 'Drama'],
  kind: 'anime',
  nextAiringEpisode: null,
  popularity: 1_000,
  season: 'SPRING',
  seasonYear: 2024,
  status: 'FINISHED',
  titles: { english: 'Example', native: null, preferred: 'Example', romaji: 'Example' },
}

const page: AnimePage = { items: [animeSummary], page: 1, totalPages: 3, totalResults: 3 }
const secondAnime = { ...animeSummary, anilistId: 22, titles: { ...animeSummary.titles, preferred: 'Second example' } }
const browse = vi.mocked(browserAnimeBrowse)
function show() { return render(<AnimeBrowseContent trending={page} initial={page} currentYear={2026} />) }
async function chooseOption(user: ReturnType<typeof userEvent.setup>, triggerName: string, optionName: string) {
  await user.click(screen.getByRole('button', { name: triggerName }))
  await user.click(screen.getByRole('option', { name: optionName }))
}

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('anime browsing', () => {
  it('hides the featured rail arrows when one title cannot scroll', () => {
    show()
    expect(screen.getByRole('region', { name: 'Trending Now' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Scroll featured titles/ })).not.toBeInTheDocument()
  })

  it('disables featured rail arrows at each edge of a scrollable rail', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    render(<AnimeBrowseContent trending={{ ...page, items: [animeSummary, secondAnime] }} initial={page} currentYear={2026} />)
    const featured = screen.getByRole('region', { name: 'Trending Now' })
    const rail = featured.querySelector('ul')
    expect(rail).not.toBeNull()
    if (!rail) throw new Error('Expected a featured title rail.')
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 660 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    Object.defineProperty(rail, 'scrollBy', { configurable: true, value: vi.fn(({ left }: ScrollToOptions) => {
      rail.scrollLeft = left && left > 0 ? 360 : 0
      fireEvent.scroll(rail)
    }) })
    fireEvent(window, new Event('resize'))

    const left = within(featured).getByRole('button', { name: 'Scroll featured titles left' })
    const right = within(featured).getByRole('button', { name: 'Scroll featured titles right' })
    expect(left).toBeDisabled()
    expect(right).toBeEnabled()
    await user.click(right)
    expect(left).toBeEnabled()
    expect(right).toBeDisabled()
    await user.click(left)
    expect(left).toBeDisabled()
    expect(right).toBeEnabled()
  })

  it('labels seasonal fallback discovery accurately instead of calling it Trending Now', () => {
    render(<AnimeBrowseContent trending={{ ...page, discoveryBasis: 'seasonal-popularity' }} initial={page} currentYear={2026} />)
    expect(screen.getByRole('heading', { name: 'Popular this season' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Trending Now' })).not.toBeInTheDocument()
  })

  it('keeps the catalog free of display banners', () => {
    const { container } = show()
    expect(container.querySelector('[data-ad-slot]')).not.toBeInTheDocument()
  })
  it('renders the default popular grid without fetching', () => {
    show()
    expect(within(screen.getByRole('region', { name: 'Popular' })).getByRole('link', { name: 'Example' })).toHaveAttribute('href', '/anime/21')
    expect(browse).not.toHaveBeenCalled()
  })

  it('sorts the grid server-side and relabels the section', async () => {
    const user = userEvent.setup()
    browse.mockResolvedValue(page)
    show()
    await chooseOption(user, 'Sort by Popular', 'Top rated')
    expect(await screen.findByRole('region', { name: 'Top rated' })).toBeInTheDocument()
    expect(browse).toHaveBeenCalledWith({ sort: 'top-rated', page: 1 }, expect.any(AbortSignal))
    await chooseOption(user, 'Sort by Top rated', 'New releases')
    expect(await screen.findByRole('region', { name: 'New releases' })).toBeInTheDocument()
    expect(browse).toHaveBeenLastCalledWith({ sort: 'new', page: 1 }, expect.any(AbortSignal))
  })

  it('sends year, genre, and format filters to the catalog', async () => {
    const user = userEvent.setup()
    browse.mockResolvedValue(page)
    show()
    await chooseOption(user, 'Genre All genres', 'Adventure')
    await chooseOption(user, 'Year All years', '2024')
    await chooseOption(user, 'Format All formats', 'TV')
    expect(browse).toHaveBeenLastCalledWith(
      { sort: 'popular', genre: 'Adventure', year: 2024, format: 'TV', page: 1 },
      expect.any(AbortSignal),
    )
  })

  it('offers the full readable AniList format set even when the initial feeds contain only one format', async () => {
    const user = userEvent.setup()
    browse.mockResolvedValue(page)
    show()
    await user.click(screen.getByRole('button', { name: 'Format All formats' }))
    for (const label of ['TV short', 'Movie', 'OVA', 'ONA', 'Special']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
  })

  it('offers a reset for empty filtered results and restores the initial grid', async () => {
    const user = userEvent.setup()
    browse.mockResolvedValue({ ...page, items: [], totalPages: 0, totalResults: 0 })
    show()
    await chooseOption(user, 'Sort by Popular', 'Old releases')
    expect(await screen.findByRole('heading', { name: 'No titles found' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(screen.getByRole('region', { name: 'Popular' })).getByRole('link', { name: 'Example' })).toBeInTheDocument()
    expect(browse).toHaveBeenCalledTimes(1)
  })
})
