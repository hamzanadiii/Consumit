import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { movieDetail, movieSummary, seriesDetail, seriesSummary } from '@/test/catalog-fixtures'
import { browserCatalogBatch, browserCatalogTitle } from '@/lib/catalog-browser'
import { BecauseYouWatchedRail, readWatchedSeeds } from './because-you-watched-rail'
const session = vi.hoisted(() => ({ member: { id: 'alice' } as { id: string } | null, status: 'authenticated' }))
vi.mock('../session/session', () => ({ useSession: () => session }))
vi.mock('@/lib/catalog-browser', () => ({ browserCatalogBatch: vi.fn(), browserCatalogTitle: vi.fn() }))
const nextTitle = { ...movieSummary, id: 9, title: 'Your next movie' }
function watch(id: number, kind = 'movie', completed = true, updatedAt = '2026-10-09T00:00:00Z', owner = 'alice') {
  localStorage.setItem(`consumit.progress:${owner}:${kind}:${id}:0:0`, JSON.stringify({ kind, id, completed, positionSeconds: completed ? 600 : 100, durationSeconds: 600, updatedAt }))
}
beforeEach(() => {
  session.member = { id: 'alice' }; session.status = 'authenticated'
  vi.mocked(browserCatalogBatch).mockResolvedValue({ items: [movieSummary, seriesSummary], missing: [], meta: { fetchedAt: '2026-10-09T00:00:00Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false } })
  vi.mocked(browserCatalogTitle).mockResolvedValue({ ...movieDetail, recommendations: [movieSummary, nextTitle, nextTitle] })
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.includes('watch-history')) return Response.json({ items: readWatchedSeeds('alice').map((ref, index) => ({ ...ref, ...(ref.kind === 'series' ? { season: 1, episode: 1 } : {}), entryId: `entry${index}`, completedAt: ref.kind === 'series' ? '2026-10-08T00:00:00Z' : '2026-10-09T00:00:00Z' })), nextCursor: null })
    if (input.includes('recommendations/filter')) return Response.json({ items: JSON.parse(String(init?.body)).items.filter((ref: { id: number }) => ref.id === 9) })
    return init?.method === 'GET' ? Response.json({ items: [] }) : new Response(null, { status: 204 })
  }))
})
afterEach(() => { localStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals() })
describe('account recommendations', () => {
  it('stays absent for guests and never borrows another account history', () => {
    watch(1, 'movie', true, undefined, 'other'); session.member = null; session.status = 'anonymous'
    render(<BecauseYouWatchedRail />)
    expect(readWatchedSeeds('alice')).toEqual([])
    expect(browserCatalogBatch).not.toHaveBeenCalled()
    expect(screen.queryByText('Because you watched')).not.toBeInTheDocument()
  })
  it('uses actual account history, removes watched duplicates and switches seeds', async () => {
    watch(seriesSummary.id, 'series', true, '2026-10-08T00:00:00Z'); watch(movieSummary.id)
    render(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Your next movie poster' })).toHaveLength(1)
    vi.mocked(browserCatalogTitle).mockResolvedValue({ ...seriesDetail, recommendations: [] })
    fireEvent.change(screen.getByLabelText('Choose a watched title for recommendations'), { target: { value: `series:${seriesSummary.id}` } })
    expect(await screen.findByText(/No recommendations for this selection/)).toBeInTheDocument()
  })
  it('supports Not interested with Undo and a type filter', async () => {
    watch(movieSummary.id); render(<BecauseYouWatchedRail />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not interested in Your next movie' }))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Your next movie poster' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Undo Not interested' }))
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Recommendation title type'), { target: { value: 'anime' } })
    expect(screen.queryByRole('img', { name: 'Your next movie poster' })).not.toBeInTheDocument()
  })
  it('retries a catalog recommendation failure', async () => {
    watch(movieSummary.id); vi.mocked(browserCatalogTitle).mockRejectedValueOnce(new Error('Unavailable'))
    render(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Recommendations could not load.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
  })
})
