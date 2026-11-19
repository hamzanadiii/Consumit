import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCatalogBatch, getCatalogBatchForRefs, getCatalogDiscovery, getCatalogTitle } from '@/lib/catalog-api'
import { getAnimeTrending } from '@/lib/anime-api'
import { getPublicListDiscovery, getPublicMemberTrends } from '@/lib/member-server'
import { movieDetail, movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import HomePage from './page'
import { ShellStateProvider } from './home/shell-state'

const navigationMocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: navigationMocks.refresh }),
}))
vi.mock('@/lib/catalog-api', () => ({
  getCatalogBatch: vi.fn(),
  getCatalogBatchForRefs: vi.fn(),
  getCatalogDiscovery: vi.fn(),
  getCatalogTitle: vi.fn(),
}))
vi.mock('@/lib/anime-api', () => ({ getAnimeTrending: vi.fn() }))
vi.mock('@/lib/member-server', () => ({
  getPublicListDiscovery: vi.fn(),
  getPublicMemberTrends: vi.fn(),
}))

const meta = { fetchedAt: '2026-10-29T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false }
const page = { items: [movieSummary], meta, page: 1, totalPages: 1, totalResults: 1 }
async function renderHome() {
  const content = await HomePage()
  render(<ShellStateProvider>{content}</ShellStateProvider>)
}

beforeEach(() => {
  vi.mocked(getCatalogDiscovery).mockImplementation(async query => {
    if (query.kind === 'all') throw new Error('Mixed catalog feed unavailable')
    return page
  })
  vi.mocked(getCatalogTitle).mockResolvedValue({ item: movieDetail, meta })
  vi.mocked(getCatalogBatch).mockResolvedValue({ items: [], meta, missing: [] })
  vi.mocked(getCatalogBatchForRefs).mockResolvedValue(null)
  vi.mocked(getAnimeTrending).mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
  vi.mocked(getPublicListDiscovery).mockResolvedValue({ newFromNetwork: [], popular: [] })
  vi.mocked(getPublicMemberTrends).mockResolvedValue({ items: [] })
})

afterEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})

describe('Home catalog recovery', () => {
  it('keeps real type-specific shelves usable when mixed movie and series feeds fail', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    await renderHome()

    const movies = await screen.findByRole('region', { name: 'Trending Movies' })
    expect(within(movies).getByRole('link', { name: /Dune: Part Two|Northbound/ })).toHaveAttribute('href', '/title/693134')
    expect(screen.getByRole('heading', { name: 'Trending Series' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Some recommendations couldn’t load.')
    await user.click(screen.getByRole('button', { name: 'Retry recommendations' }))
    expect(navigationMocks.refresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('heading', { name: 'The catalog missed its cue' })).not.toBeInTheDocument()
  })

  it.each(['popular', 'trending'] as const)('keeps Home available when only the %s mixed feed fails', async (failedFeed) => {
    vi.mocked(getCatalogDiscovery).mockImplementation(async query => {
      if (query.kind === 'all' && query.feed === failedFeed) throw new Error(`${failedFeed} feed unavailable`)
      return page
    })
    await renderHome()

    expect(await screen.findByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trending Movies' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The catalog missed its cue' })).not.toBeInTheDocument()
  })

  it('keeps the catalog retry state when the fallback hero title also fails', async () => {
    vi.mocked(getCatalogTitle).mockRejectedValue(new Error('Fallback title unavailable'))
    const content = await HomePage()
    render(<ShellStateProvider>{content}</ShellStateProvider>)

    expect(await screen.findByRole('heading', { name: 'The catalog missed its cue' })).toBeInTheDocument()
    expect(screen.getByText('Retry catalog').closest('a')).toHaveAttribute('href', '')
  })

  it('reports an unavailable member-trending batch while keeping regular shelves', async () => {
    vi.mocked(getCatalogDiscovery).mockResolvedValue(page)
    vi.mocked(getPublicMemberTrends).mockResolvedValue({ items: [{ kind: 'movie', id: movieSummary.id }] })
    vi.mocked(getCatalogBatchForRefs).mockRejectedValue(new Error('Member trend titles unavailable'))
    await renderHome()

    expect(await screen.findByRole('alert')).toHaveTextContent('Some recommendations couldn’t load.')
    expect(screen.getByRole('heading', { name: 'Trending Movies' })).toBeInTheDocument()
  })

  it('explains when the recommendation feeds are empty and offers useful browse routes', async () => {
    vi.mocked(getCatalogDiscovery).mockResolvedValue({ ...page, items: [], totalPages: 0, totalResults: 0 })
    vi.mocked(getAnimeTrending).mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    vi.mocked(getCatalogBatch).mockResolvedValue({ items: [], meta, missing: [] })
    await renderHome()

    expect(await screen.findByRole('status')).toHaveTextContent('No fresh recommendations are available yet.')
    expect(screen.getByRole('link', { name: 'Browse movies' })).toHaveAttribute('href', '/movies')
    expect(screen.getByRole('link', { name: 'Browse series' })).toHaveAttribute('href', '/series')
    expect(screen.getByRole('link', { name: 'Browse anime' })).toHaveAttribute('href', '/anime')
  })

  it('reports a combined catalog outage separately from a genuine empty result', async () => {
    vi.mocked(getCatalogDiscovery).mockRejectedValue(new Error('Catalog feed unavailable'))
    vi.mocked(getAnimeTrending).mockRejectedValue(new Error('Anime feed unavailable'))
    vi.mocked(getCatalogBatch).mockRejectedValue(new Error('Curated feed unavailable'))
    await renderHome()

    expect(await screen.findByRole('alert')).toHaveTextContent('Some recommendations couldn’t load.')
    expect(screen.getByRole('button', { name: 'Retry recommendations' })).toBeInTheDocument()
    expect(screen.queryByText('No fresh recommendations are available yet.')).not.toBeInTheDocument()
  })
})
