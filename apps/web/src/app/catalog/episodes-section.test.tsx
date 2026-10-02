import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { CatalogSeason } from '@consumit/contracts'
import { seriesDetail } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { EpisodesSection } from './episodes-section'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

function tenEpisodeSeason(): CatalogSeason {
  return {
    episodes: Array.from({ length: 10 }, (_, index) => ({
      airDate: `2023-05-${String(index + 1).padStart(2, '0')}`,
      episodeNumber: index + 1,
      id: 100 + index,
      overview: `Episode ${index + 1} overview.`,
      runtimeMinutes: 50,
      seasonNumber: 1,
      stillUrl: null,
      title: `Episode Title ${index + 1}`,
    })),
    name: 'Season 1',
    overview: '',
    posterUrl: null,
    seasonNumber: 1,
    seriesId: 95396,
  }
}

const seasons = [
  { airDate: '2022-02-17', episodeCount: 9, name: 'Season 1', number: 1, posterUrl: null },
  { airDate: '2025-01-17', episodeCount: 10, name: 'Season 2', number: 2, posterUrl: null },
]

function renderSection(season: CatalogSeason | null, overrides = {}) {
  return render(
    <EpisodesSection
      detail={seriesDetail}
      failedSeason={null}
      loadingSeason={false}
      onRetrySeason={vi.fn()}
      onSelectSeason={vi.fn()}
      season={season}
      seasons={seasons}
      {...overrides}
    />,
  )
}

describe('episodes section', () => {
  it('renders still-led episode cards with distinct watch actions', () => {
    renderSection(tenEpisodeSeason())

    expect(screen.getByRole('heading', { name: 'Episodes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Watch Episode 1: Episode Title 1' })).toHaveAttribute(
      'href',
      '/watch/series/95396?season=1&episode=1',
    )
    expect(screen.getByText('Episode Title 1')).toBeInTheDocument()
    const date = new Date('2023-05-01T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    expect(screen.getByText(`50 min · ${date}`)).toBeInTheDocument()
    expect(screen.getAllByText('Title artwork')).toHaveLength(8)
  })

  it('paginates long seasons eight at a time with a result count', async () => {
    const user = userEvent.setup()
    const { container } = renderSection(tenEpisodeSeason())

    expect(container.querySelectorAll('[data-filscreen-episode-card]')).toHaveLength(8)
    expect(screen.queryByText('Episode Title 9')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1–8 of 10 episodes')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Episode pages' })
    expect(within(nav).getByRole('button', { name: 'Go to previous episode page' })).toBeDisabled()
    await user.click(within(nav).getByRole('button', { name: 'Go to episode page 2' }))

    expect(screen.getByText('Episode Title 9')).toBeInTheDocument()
    expect(screen.getByText('Episode Title 10')).toBeInTheDocument()
    expect(screen.queryByText('Episode Title 1')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 9–10 of 10 episodes')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Go to episode page 2' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Go to next episode page' })).toBeDisabled()
  })

  it('moves through pages with previous and next controls', async () => {
    const user = userEvent.setup()
    renderSection(tenEpisodeSeason())
    const nav = screen.getByRole('navigation', { name: 'Episode pages' })

    await user.click(within(nav).getByRole('button', { name: 'Go to next episode page' }))
    expect(screen.getByText('Episode Title 10')).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Go to previous episode page' }))
    expect(screen.getByText('Episode Title 1')).toBeInTheDocument()
  })

  it('hides pagination for short seasons', () => {
    const { container } = renderSection({
      ...tenEpisodeSeason(),
      episodes: tenEpisodeSeason().episodes.slice(0, 3),
    })

    expect(screen.queryByRole('navigation', { name: 'Episode pages' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-filscreen-episode-card]')).toHaveLength(3)
  })

  it('announces loading, failure with retry, and empty seasons', async () => {
    const user = userEvent.setup()
    const onRetrySeason = vi.fn()
    const { rerender } = render(
      <EpisodesSection
        detail={seriesDetail}
        failedSeason={null}
        loadingSeason={true}
        onRetrySeason={onRetrySeason}
        onSelectSeason={vi.fn()}
        season={tenEpisodeSeason()}
        seasons={seasons}
      />,
    )
    expect(screen.getByText('Loading season…')).toBeInTheDocument()
    expect(screen.getByText('Loading season…')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Season Season 1 · 9 episodes' })).toBeDisabled()

    rerender(
      <EpisodesSection
        detail={seriesDetail}
        failedSeason={2}
        loadingSeason={false}
        onRetrySeason={onRetrySeason}
        onSelectSeason={vi.fn()}
        season={tenEpisodeSeason()}
        seasons={seasons}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Season 2 could not be loaded')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetrySeason).toHaveBeenCalledTimes(1)

    rerender(
      <EpisodesSection
        detail={seriesDetail}
        failedSeason={null}
        loadingSeason={false}
        onRetrySeason={onRetrySeason}
        onSelectSeason={vi.fn()}
        season={{ ...tenEpisodeSeason(), episodes: [] }}
        seasons={seasons}
      />,
    )
    expect(screen.getByText('No regular episodes are listed for this season.')).toBeInTheDocument()
  })

  it('notifies the parent when a different season is chosen', async () => {
    const user = userEvent.setup()
    const onSelectSeason = vi.fn()
    renderSection(tenEpisodeSeason(), { onSelectSeason })

    await user.click(screen.getByRole('button', { name: 'Season Season 1 · 9 episodes' }))
    await user.click(screen.getByRole('option', { name: 'Season 2 · 10 episodes' }))
    expect(onSelectSeason).toHaveBeenCalledWith(2)
  })
})
