import type { AnimePage, AnimeTitleSummary } from '@consumit/contracts'
import { render, screen, within } from '@testing-library/react'
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
const browse = vi.mocked(browserAnimeBrowse)
function show() { return render(<AnimeBrowseContent trending={page} initial={page} currentYear={2026} />) }
async function chooseOption(user: ReturnType<typeof userEvent.setup>, triggerName: string, optionName: string) {
  await user.click(screen.getByRole('button', { name: triggerName }))
  await user.click(screen.getByRole('option', { name: optionName }))
}

afterEach(() => { vi.resetAllMocks() })

describe('anime browsing', () => {
  it('renders the default popular grid without fetching', () => {
    show()
    expect(within(screen.getByRole('region', { name: 'Popular now' })).getByRole('link', { name: 'Example' })).toHaveAttribute('href', '/anime/21')
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

  it('offers a reset for empty filtered results and restores the initial grid', async () => {
    const user = userEvent.setup()
    browse.mockResolvedValue({ ...page, items: [], totalPages: 0, totalResults: 0 })
    show()
    await chooseOption(user, 'Sort by Popular', 'Old releases')
    expect(await screen.findByRole('heading', { name: 'No titles found' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(screen.getByRole('region', { name: 'Popular now' })).getByRole('link', { name: 'Example' })).toBeInTheDocument()
    expect(browse).toHaveBeenCalledTimes(1)
  })
})
