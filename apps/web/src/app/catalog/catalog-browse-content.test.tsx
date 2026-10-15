import type { CatalogPage } from '@consumit/contracts'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { browserDiscoverCatalog } from '@/lib/catalog-browser'
import { movieSummary } from '@/test/catalog-fixtures'

import { CatalogBrowseContent } from './catalog-browse-content'

vi.mock('@/lib/catalog-browser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/catalog-browser')>(),
  browserDiscoverCatalog: vi.fn(),
}))

const page: CatalogPage = {
  items: [movieSummary],
  meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
  page: 1, totalPages: 3, totalResults: 3,
}
const second = { ...movieSummary, id: 2, title: 'Arrival' }
const discover = vi.mocked(browserDiscoverCatalog)
const results = () => within(screen.getByRole('region', { name: 'Popular now' }))
function show() { return render(<CatalogBrowseContent current={page} currentYear={2026} kind="movie" popular={page} />) }
async function chooseOption(user: ReturnType<typeof userEvent.setup>, triggerName: string, optionName: string) {
  await user.click(screen.getByRole('button', { name: triggerName }))
  await user.click(screen.getByRole('option', { name: optionName }))
}

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

describe('catalog browsing', () => {
  it.each(['top-rated', 'trending'] as const)('opens the requested %s shelf and retains it through filters and retry', async (initialFeed) => {
    const user = userEvent.setup()
    discover.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ...page, items: [second], totalPages: 1 })
    render(<CatalogBrowseContent current={page} currentYear={2026} initialFeed={initialFeed} kind="movie" popular={page} />)
    const heading = initialFeed === 'top-rated' ? 'Top rated' : 'Trending now'
    expect(screen.getByRole('button', { name: `Sort by ${initialFeed === 'top-rated' ? 'Top rated' : 'Trending'}` })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load these titles')
    expect(within(screen.getByRole('region', { name: heading })).queryByRole('link')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await within(screen.getByRole('region', { name: heading })).findByRole('link', { name: 'Arrival' })).toBeInTheDocument()
    await chooseOption(user, 'Genre All genres', 'Adventure')
    await waitFor(() => expect(discover).toHaveBeenLastCalledWith(
      { kind: 'movie', feed: initialFeed, genre: 'Adventure', year: undefined }, 1, expect.any(AbortSignal),
    ))
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('button', { name: 'Sort by Popular' })).toBeInTheDocument()
    expect(results().getByRole('link', { name: 'Dune: Part Two' })).toBeInTheDocument()
  })

  it('appends unique titles and stops at the last page', async () => {
    const user = userEvent.setup()
    discover.mockResolvedValue({ ...page, items: [movieSummary, second], page: 2, totalPages: 2 })
    show()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await results().findByRole('link', { name: 'Arrival' })).toHaveAttribute('href', '/title/2')
    expect(results().getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(discover).toHaveBeenCalledWith({ kind: 'movie', feed: 'popular', genre: undefined, year: undefined }, 2, expect.any(AbortSignal))
  })

  it('keeps loaded titles on failure and retries the same page', async () => {
    const user = userEvent.setup()
    discover.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...page, items: [second], page: 2 })
    show()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load more titles')
    expect(results().getByRole('link', { name: 'Dune: Part Two' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await results().findByRole('link', { name: 'Arrival' })).toBeInTheDocument()
    expect(discover.mock.calls.map((call) => call[1])).toEqual([2, 2])
  })

  it('drops a superseded query without aborting it when filters change', async () => {
    const user = userEvent.setup()
    let resolveOld: (value: CatalogPage) => void = () => undefined
    discover.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    discover.mockResolvedValueOnce({ ...page, items: [second], totalPages: 1 })
    show()
    await chooseOption(user, 'Genre All genres', 'Adventure')
    const oldSignal = discover.mock.calls[0]?.[2]
    await chooseOption(user, 'Year All years', '2024')
    // The superseded fetch is left to settle, never aborted: aborting leaked
    // an AbortError that Next surfaces as a runtime error.
    expect(oldSignal?.aborted).toBe(false)
    expect(await results().findByRole('link', { name: 'Arrival' })).toBeInTheDocument()
    await act(async () => resolveOld(page))
    expect(results().queryByRole('link', { name: 'Dune: Part Two' })).not.toBeInTheDocument()
    expect(discover.mock.calls[1]?.[0]).toMatchObject({ genre: 'Adventure', year: 2024 })
  })

  it('offers a reset for empty filtered results and restores the initial catalog', async () => {
    const user = userEvent.setup()
    discover.mockResolvedValue({ ...page, items: [], totalPages: 0, totalResults: 0 })
    show()
    await chooseOption(user, 'Sort by Popular', 'Top rated')
    expect(await screen.findByRole('heading', { name: 'No titles found' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(results().getByRole('link', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(discover).toHaveBeenCalledTimes(1)
  })

  it('automatically loads on intersection without concurrent duplicate requests', async () => {
    let intersect = () => undefined as void
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
      observe() {}
      disconnect = disconnect
    })
    let finish: (value: CatalogPage) => void = () => undefined
    discover.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    show()
    act(() => { intersect(); intersect() })
    expect(discover).toHaveBeenCalledTimes(1)
    await act(async () => finish({ ...page, items: [], page: 2 }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument())
    expect(results().getByRole('link', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(disconnect).toHaveBeenCalled()
  })
})
