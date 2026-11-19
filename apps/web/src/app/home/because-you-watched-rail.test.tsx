import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { movieDetail, movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { browserCatalogBatch, browserCatalogTitle, browserCatalogTitlesForRefs } from '@/lib/catalog-browser'
import { BecauseYouWatchedRail, readWatchedSeeds } from './because-you-watched-rail'
const session = vi.hoisted(() => ({ member: { id: 'alice' } as { id: string } | null, status: 'authenticated', failWatchHistory: false }))
vi.mock('../session/session', () => ({ useOptionalSession: () => session, useSession: () => session }))
vi.mock('@/lib/catalog-browser', () => ({ browserCatalogBatch: vi.fn(), browserCatalogTitle: vi.fn(), browserCatalogTitlesForRefs: vi.fn() }))
const nextTitle = { ...movieSummary, id: 9, title: 'Your next movie' }
function watch(id: number, kind = 'movie', completed = true, updatedAt = '2026-10-09T00:00:00Z', owner = 'alice') {
  localStorage.setItem(`consumit.progress:${owner}:${kind}:${id}:0:0`, JSON.stringify({ kind, id, completed, positionSeconds: completed ? 600 : 100, durationSeconds: 600, updatedAt }))
}
beforeEach(() => {
  session.member = { id: 'alice' }; session.status = 'authenticated'; session.failWatchHistory = false
  vi.mocked(browserCatalogBatch).mockResolvedValue({ items: [movieSummary, seriesSummary], missing: [], meta: { fetchedAt: '2026-10-09T00:00:00Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false } })
  vi.mocked(browserCatalogTitlesForRefs).mockImplementation(async refs => ({ titles: refs.flatMap(ref => [movieSummary, seriesSummary].filter(title => title.kind === ref.kind && title.id === ref.id)), missing: [], unavailable: false }))
  vi.mocked(browserCatalogTitle).mockResolvedValue({ ...movieDetail, recommendations: [movieSummary, nextTitle, nextTitle] })
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.includes('watch-history')) {
      if (session.failWatchHistory) return new Response(null, { status: 503 })
      return Response.json({ items: readWatchedSeeds(session.member?.id).map((ref, index) => ({ ...ref, ...(ref.kind === 'series' ? { season: 1, episode: 1 } : {}), entryId: `entry${index}`, completedAt: ref.kind === 'series' ? '2026-10-08T00:00:00Z' : '2026-10-09T00:00:00Z' })), nextCursor: null })
    }
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
  it('does not carry one member’s hidden-title Undo action into another member session', async () => {
    watch(movieSummary.id, 'movie', true, '2026-10-09T00:00:00Z', 'alice')
    watch(movieSummary.id, 'movie', true, '2026-10-09T00:00:00Z', 'bob')
    const { rerender } = render(<BecauseYouWatchedRail />)

    fireEvent.click(await screen.findByRole('button', { name: 'Not interested in Your next movie' }))
    expect(await screen.findByText('Hidden.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    session.member = { id: 'bob' }
    rerender(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
    expect(screen.queryByText('Hidden.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset hidden' })).not.toBeInTheDocument()
  })
  it('does not show another member’s suggestions when the new account history read fails', async () => {
    watch(movieSummary.id, 'movie', true, '2026-10-09T00:00:00Z', 'alice')
    watch(movieSummary.id, 'movie', true, '2026-10-09T00:00:00Z', 'bob')
    const { rerender } = render(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()

    session.member = { id: 'bob' }
    session.failWatchHistory = true
    rerender(<BecauseYouWatchedRail />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Your watched titles could not load.')
    expect(screen.queryByRole('img', { name: 'Your next movie poster' })).not.toBeInTheDocument()
    session.failWatchHistory = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
  })
  it('uses actual account history to rank suggestions across all recent seeds', async () => {
    watch(seriesSummary.id, 'series', true, '2026-10-08T00:00:00Z'); watch(movieSummary.id)
    render(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Your next movie poster' })).toHaveLength(1)
    expect(browserCatalogTitle).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Picked from your recent watches.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Choose a watched title for recommendations')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Recommendation title type')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Sort recommendations')).not.toBeInTheDocument()
  })
  it('offers category routes when no personalized suggestions fit', async () => {
    watch(movieSummary.id)
    vi.mocked(browserCatalogTitle).mockResolvedValue({ ...movieDetail, recommendations: [] })
    render(<BecauseYouWatchedRail />)

    expect(await screen.findByText('No titles fit your recent watches yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse movies' })).toHaveAttribute('href', '/movies')
    expect(screen.getByRole('link', { name: 'Browse series' })).toHaveAttribute('href', '/series')
    expect(screen.getByRole('link', { name: 'Browse anime' })).toHaveAttribute('href', '/anime')
  })
  it('supports Not interested with compact Undo and Reset actions', async () => {
    watch(movieSummary.id); render(<BecauseYouWatchedRail />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not interested in Your next movie' }))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Your next movie poster' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Reset hidden' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
  })
  it('retries a catalog recommendation failure', async () => {
    watch(movieSummary.id); vi.mocked(browserCatalogTitle).mockRejectedValueOnce(new Error('Unavailable'))
    render(<BecauseYouWatchedRail />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Recommendations could not load.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img', { name: 'Your next movie poster' })).toBeInTheDocument()
  })
})
