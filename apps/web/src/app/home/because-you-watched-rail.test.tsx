import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { movieDetail, movieSummary, seriesDetail, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import { browserCatalogBatch, browserCatalogTitle } from '@/lib/catalog-browser'
import { BecauseYouWatchedRail, readWatchedSeeds } from './because-you-watched-rail'

vi.mock('@/lib/catalog-browser', () => ({ browserCatalogBatch: vi.fn(), browserCatalogTitle: vi.fn() }))
const nextTitle = { ...movieSummary, id: 9, title: 'Your next movie' }
function watch(id: number, kind = 'movie', completed = true, updatedAt = '2026-10-09T00:00:00Z') {
  window.localStorage.setItem(`consumit.progress:guest:${kind}:${id}`, JSON.stringify({ kind, id, completed, positionSeconds: completed ? 600 : 100, durationSeconds: 600, updatedAt }))
}
beforeEach(() => {
  vi.mocked(browserCatalogBatch).mockResolvedValue({ items: [movieSummary, seriesSummary], missing: [], meta: { fetchedAt: '2026-10-09T00:00:00Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false } })
  vi.mocked(browserCatalogTitle).mockResolvedValue({ ...movieDetail, recommendations: [movieSummary, nextTitle, nextTitle] })
})
afterEach(() => { window.localStorage.clear(); vi.resetAllMocks() })

describe('Because you watched', () => {
  it('stays absent without completed watches and makes no requests', () => {
    watch(1, 'movie', false)
    window.localStorage.setItem('consumit.progress:broken', '{')
    render(<BecauseYouWatchedRail />)
    expect(readWatchedSeeds()).toEqual([])
    expect(browserCatalogBatch).not.toHaveBeenCalled()
    expect(screen.queryByText('Because you watched')).not.toBeInTheDocument()
  })
  it('orders completed watches by recency and excludes watched and duplicate recommendations', async () => {
    watch(seriesSummary.id, 'series', true, '2026-10-08T00:00:00Z')
    watch(movieSummary.id)
    render(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Your next movie poster' })).toHaveLength(1)
    expect(browserCatalogTitle).toHaveBeenCalledWith({ id: movieSummary.id, kind: 'movie' }, expect.any(AbortSignal))
    vi.mocked(browserCatalogTitle).mockResolvedValue({ ...seriesDetail, recommendations: [] })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: `series:${seriesSummary.id}` } })
    expect(await screen.findByText(/No recommendations for this title yet/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Your next movie poster' })).not.toBeInTheDocument()
  })
  it('recovers from recommendation failure with retry', async () => {
    watch(movieSummary.id)
    vi.mocked(browserCatalogTitle).mockRejectedValueOnce(new Error('Unavailable'))
    render(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Recommendations could not load.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
  })
})
