import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogTitleSummary } from '@consumit/contracts'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'

import { FavoritesEditor } from './favorites-editor'
import { ProfileEditProvider } from './profile-edit'

const mocks = vi.hoisted(() => ({
  browserSearchCatalog: vi.fn(),
  refresh: vi.fn(),
  saveMemberFavorites: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('@/lib/catalog-browser', () => ({
  browserSearchCatalog: mocks.browserSearchCatalog,
}))

vi.mock('@/lib/identity-browser', () => ({
  saveMemberFavorites: mocks.saveMemberFavorites,
}))

function titleWithId(id: number, title: string): CatalogTitleSummary {
  return { ...movieSummary, id, originalTitle: title, title }
}

const current = [
  { id: 693134, kind: 'movie' as const },
  { id: 95396, kind: 'series' as const },
]

function renderOpen(ui: React.ReactElement) {
  return render(<ProfileEditProvider initialFavoritesOpen>{ui}</ProfileEditProvider>)
}

describe('profile favorites editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    mocks.saveMemberFavorites.mockResolvedValue({ favorites: [] })
  })

  it('shows four slots with the current favorites prefilled', async () => {
    const user = userEvent.setup()
    renderOpen(<FavoritesEditor current={current} initialTitles={[movieSummary, seriesSummary]} />)

    expect(screen.getByRole('button', { name: 'Remove Dune: Part Two from favorites' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Severance from favorites' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick favorite for slot 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick favorite for slot 4' })).toBeInTheDocument()
    expect(screen.getByText('2 of 4 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pick favorite for slot 3' }))
    expect(screen.getByRole('button', { name: 'Pick favorite for slot 3' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('fills the active slot from live search and saves the ordered selection', async () => {
    const user = userEvent.setup()
    const third = titleWithId(11, 'The Third One')
    mocks.browserSearchCatalog.mockResolvedValue({ items: [third], page: 1, totalPages: 1, totalResults: 1 })
    renderOpen(<FavoritesEditor current={current} initialTitles={[movieSummary, seriesSummary]} />)

    await user.click(screen.getByRole('button', { name: 'Pick favorite for slot 3' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search a movie or series' }), 'third')

    expect(await screen.findByRole('button', { name: 'Pick The Third One' })).toBeInTheDocument()
    expect(mocks.browserSearchCatalog).toHaveBeenCalledWith('third', 'all')

    await user.click(screen.getByRole('button', { name: 'Pick The Third One' }))
    expect(screen.getByText('3 of 4 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save favorites' }))
    await waitFor(() => expect(mocks.saveMemberFavorites).toHaveBeenCalledWith([
      { id: 693134, kind: 'movie' },
      { id: 95396, kind: 'series' },
      { id: 11, kind: 'movie' },
    ]))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('ignores stale search responses without raising errors', async () => {
    const third = titleWithId(11, 'The Third One')
    let resolveStale!: (value: { items: CatalogTitleSummary[]; page: number; totalPages: number; totalResults: number }) => void
    mocks.browserSearchCatalog.mockImplementation((query: string) => {
      if (query === 'th') return new Promise((resolve) => { resolveStale = resolve })
      return Promise.resolve({ items: [third], page: 1, totalPages: 1, totalResults: 1 })
    })
    renderOpen(<FavoritesEditor current={[]} initialTitles={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pick favorite for slot 1' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search a movie or series' }), { target: { value: 'th' } })
    await waitFor(() => expect(mocks.browserSearchCatalog).toHaveBeenCalledWith('th', 'all'))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search a movie or series' }), { target: { value: 'thi' } })

    expect(await screen.findByRole('button', { name: 'Pick The Third One' })).toBeInTheDocument()
    resolveStale({ items: [seriesSummary], page: 1, totalPages: 1, totalResults: 1 })
    await waitFor(() => expect(mocks.browserSearchCatalog).toHaveBeenCalledTimes(2))

    expect(screen.getByRole('button', { name: 'Pick The Third One' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pick Severance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('removes a filled slot and ignores titles that are already picked', async () => {
    const user = userEvent.setup()
    renderOpen(<FavoritesEditor current={current} initialTitles={[movieSummary, seriesSummary]} />)

    await user.click(screen.getByRole('button', { name: 'Remove Dune: Part Two from favorites' }))
    expect(screen.getByText('1 of 4 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick favorite for slot 1' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save favorites' }))
    await waitFor(() => expect(mocks.saveMemberFavorites).toHaveBeenCalledWith([
      { id: 95396, kind: 'series' },
    ]))
  })

  it('surfaces save failures without closing the editor', async () => {
    const user = userEvent.setup()
    mocks.saveMemberFavorites.mockRejectedValue(new Error('nope'))
    renderOpen(<FavoritesEditor current={current} initialTitles={[movieSummary, seriesSummary]} />)

    await user.click(screen.getByRole('button', { name: 'Save favorites' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('cancels back to the stored selection', async () => {
    const user = userEvent.setup()
    renderOpen(<FavoritesEditor current={current} initialTitles={[movieSummary, seriesSummary]} />)

    await user.click(screen.getByRole('button', { name: 'Remove Severance from favorites' }))
    expect(screen.getByText('1 of 4 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Save favorites' })).not.toBeInTheDocument()
    expect(mocks.saveMemberFavorites).not.toHaveBeenCalled()
  })
})
