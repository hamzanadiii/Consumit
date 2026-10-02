import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import { WatchlistCollection } from './watchlist-collection'

const mocks = vi.hoisted(() => ({ browserCatalogBatches: vi.fn() }))
vi.mock('@/lib/catalog-browser', () => ({ browserCatalogBatches: mocks.browserCatalogBatches }))
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
    await user.click(screen.getByRole('button', { name: 'Retry artwork' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry artwork' })).toBeEnabled())
    expect(screen.getByText('Your Watchlist is safe. Some poster details could not load.')).toBeInTheDocument()
    expect(screen.getByText('2 saved titles')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry artwork' }))
    await waitFor(() => expect(screen.getByRole('link', { name: movieSummary.title })).toBeInTheDocument())
    expect(mocks.browserCatalogBatches).toHaveBeenCalledWith(items)
    expect(screen.queryByText('Your Watchlist is safe. Some poster details could not load.')).not.toBeInTheDocument()
    expect(screen.getByText('2 saved titles')).toBeInTheDocument()
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
