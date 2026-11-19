import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import { WatchlistCollection } from './watchlist-collection'

const mocks = vi.hoisted(() => ({ browserCatalogBatches: vi.fn(), getMemberLibraryPage: vi.fn(), getMemberRatingsForTitles: vi.fn() }))
vi.mock('@/lib/catalog-browser', () => ({ browserCatalogBatches: mocks.browserCatalogBatches }))
vi.mock('@/lib/identity-browser', () => ({ getMemberLibraryPage: mocks.getMemberLibraryPage, getMemberRatingsForTitles: mocks.getMemberRatingsForTitles }))
vi.mock('../catalog/save-title-button', () => ({ SaveTitleButton: ({ title, onSavedChange }: { title: string; onSavedChange?: (saved: boolean) => void }) => <button onClick={() => onSavedChange?.(false)} type="button">Remove {title}</button> }))
const items = [movieSummary, seriesSummary].map(({ id, kind }) => ({ id, kind, origin: 'native' as const, sourceKey: null }))

describe('profile Watchlist', () => {
  beforeEach(() => vi.clearAllMocks())
  it('filters stored titles and preserves their destinations in the Shelf view', async () => {
    const user = userEvent.setup()
    render(<WatchlistCollection initialItems={items} initialNextCursor={null} titles={[movieSummary, seriesSummary]} />)
    await user.click(screen.getByRole('button', { name: /^Series$/ }))
    expect(screen.queryByRole('link', { name: movieSummary.title })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    expect(screen.getByRole('link', { name: seriesSummary.title })).toHaveAttribute('href', `/series/${seriesSummary.id}`)
    expect(screen.getByRole('button', { name: `Remove ${seriesSummary.title}` })).toBeInTheDocument()
    expect(screen.getByText('1 title shown from 2 loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Remove ${seriesSummary.title}` }))
    expect(screen.queryByRole('link', { name: seriesSummary.title })).not.toBeInTheDocument()
    expect(screen.getByText('1 saved title')).toBeInTheDocument()
  })
  it('retries unavailable catalog details without changing saved records', async () => {
    mocks.browserCatalogBatches.mockRejectedValueOnce(new Error('Catalog unavailable')).mockResolvedValueOnce([movieSummary, seriesSummary])
    const user = userEvent.setup()
    render(<WatchlistCollection catalogUnavailable initialItems={items} initialNextCursor={null} titles={[]} />)
    const retry = screen.getByRole('button', { name: 'Retry artwork' })
    expect(retry).toHaveClass('min-h-11')
    await user.click(retry)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry artwork' })).toBeEnabled())
    expect(screen.getByText('Your Watchlist is safe. Some poster details could not load.')).toBeInTheDocument()
    expect(screen.getByText('2 saved titles')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry artwork' }))
    await waitFor(() => expect(screen.getByRole('link', { name: movieSummary.title })).toBeInTheDocument())
    expect(mocks.browserCatalogBatches).toHaveBeenCalledWith(items)
    expect(screen.queryByText('Your Watchlist is safe. Some poster details could not load.')).not.toBeInTheDocument()
    expect(screen.getByText('2 saved titles')).toBeInTheDocument()
  })

  it('retries unavailable personal ratings inline while preserving saved titles and other filters', async () => {
    let rejectFirst!: (reason: Error) => void
    mocks.getMemberRatingsForTitles.mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject })).mockResolvedValueOnce([
      { id: movieSummary.id, kind: 'movie', value: 8 },
      { id: seriesSummary.id, kind: 'series', value: 6 },
    ])
    const user = userEvent.setup()
    render(<WatchlistCollection initialItems={items} initialNextCursor={null} ratingsUnavailable titles={[movieSummary, seriesSummary]} />)
    await user.click(screen.getByRole('button', { name: 'Series' }))
    expect(screen.getByRole('link', { name: seriesSummary.title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: movieSummary.title })).not.toBeInTheDocument()

    const retry = () => screen.getByRole('button', { name: /rating lookup/i })
    await user.click(retry())
    await waitFor(() => expect(retry()).toBeDisabled())
    rejectFirst(new Error('Ratings unavailable'))
    await waitFor(() => expect(retry()).toBeEnabled())
    expect(screen.getByText(/your titles and filters are unchanged/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: seriesSummary.title })).toBeInTheDocument()

    await user.click(retry())
    await waitFor(() => expect(screen.queryByText(/personal rating filters are temporarily unavailable/i)).not.toBeInTheDocument())

    expect(mocks.getMemberRatingsForTitles).toHaveBeenCalledTimes(2)
    expect(mocks.getMemberRatingsForTitles).toHaveBeenNthCalledWith(1, items)
    expect(mocks.getMemberRatingsForTitles).toHaveBeenNthCalledWith(2, items)
    expect(screen.getByRole('button', { name: 'Series' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: seriesSummary.title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: movieSummary.title })).not.toBeInTheDocument()
    expect(screen.getByText('2 saved titles')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Shelf' }))
    expect(screen.getByLabelText('Your rating: 6 out of 10')).toBeInTheDocument()
  })

  it('combines decade, genre, and search and resets an empty result', async () => {
    const olderMovie = { ...movieSummary, year: 1973 }
    const user = userEvent.setup()
    render(<WatchlistCollection initialItems={items} initialNextCursor={null} titles={[olderMovie, seriesSummary]} />)
    await user.click(screen.getByRole('button', { name: /Filter by decade/ }))
    await user.click(screen.getByRole('option', { name: '1970s' }))
    expect(screen.getByRole('link', { name: movieSummary.title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: seriesSummary.title })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Filter by genre/ }))
    await user.click(screen.getByRole('option', { name: 'Adventure' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search your Watchlist' }), 'does not exist')
    expect(screen.getByRole('heading', { name: 'No titles match that shelf.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('searchbox', { name: 'Search your Watchlist' })).toHaveValue('')
    expect(screen.getByRole('link', { name: seriesSummary.title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })
})
