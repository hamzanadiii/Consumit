import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SafeMember } from '@consumit/contracts'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { SessionProvider } from '../session/session'
import { TitleRecommendationsInbox } from './title-recommendations-inbox'

const member = { id: 'reader', username: 'reader', email: 'reader@example.test' } as SafeMember
const sender = { id: 'curator', username: 'curator', name: 'Film Friend', avatarUrl: null }
const recommendations = {
  items: [
    { id: 'rec-movie', title: { kind: 'movie', id: movieSummary.id }, sender, response: null, createdAt: '2026-10-25T10:00:00.000Z' },
    { id: 'rec-series', title: { kind: 'series', id: seriesSummary.id }, sender, response: null, createdAt: '2026-10-25T09:00:00.000Z' },
  ],
  nextCursor: null,
}

afterEach(() => vi.unstubAllGlobals())
function wrap() { return <SessionProvider initialMember={member} initialStatus="authenticated"><TitleRecommendationsInbox /></SessionProvider> }

describe('title recommendation inbox', () => {
  it('saves a title and hides a declined title from next-watch recommendations', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/v1/taste/recommendations?') || url === '/v1/taste/recommendations') return Promise.resolve(new Response(JSON.stringify(recommendations), { status: 200 }))
      if (url.startsWith('/v1/titles/batch')) return Promise.resolve(new Response(JSON.stringify({ items: [movieSummary, seriesSummary], meta: { fetchedAt: '2026-10-26T10:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false }, missing: [] }), { status: 200 }))
      if (init?.method === 'PUT') return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(wrap())

    const movie = await screen.findByRole('link', { name: /^Dune: Part Two$/ }).then(link => link.closest('article')!)
    fireEvent.click(within(movie).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(within(movie).getByRole('status')).toHaveTextContent('Saved to your Watchlist.'))
    expect(fetchMock).toHaveBeenCalledWith(`/v1/me/library/titles/movie/${movieSummary.id}`, expect.objectContaining({ method: 'PUT' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/taste/recommendations/rec-movie/response', expect.objectContaining({ method: 'PUT', body: '{"response":"saved"}' }))

    const series = screen.getByRole('link', { name: /^Severance$/ }).closest('article')!
    fireEvent.click(within(series).getByRole('button', { name: 'Not interested' }))
    await waitFor(() => expect(within(series).getByRole('status')).toHaveTextContent('This title is hidden from your next-watch recommendations.'))
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/recommendation-dismissals', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ kind: 'series', id: seriesSummary.id }) }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/taste/recommendations/rec-series/response', expect.objectContaining({ method: 'PUT', body: '{"response":"not-interested"}' }))
  })

  it('retries the chosen recommendation response after a failed write', async () => {
    let responseWrites = 0
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/v1/taste/recommendations?') || url === '/v1/taste/recommendations') return Promise.resolve(new Response(JSON.stringify(recommendations), { status: 200 }))
      if (url.startsWith('/v1/titles/batch')) return Promise.resolve(new Response(JSON.stringify({ items: [movieSummary, seriesSummary], meta: { fetchedAt: '2026-10-26T10:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false }, missing: [] }), { status: 200 }))
      if (url === '/v1/taste/recommendations/rec-movie/response' && init?.method === 'PUT') return Promise.resolve(new Response(null, { status: ++responseWrites === 1 ? 503 : 204 }))
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(wrap())

    const movie = await screen.findByRole('link', { name: /^Dune: Part Two$/ }).then(link => link.closest('article')!)
    fireEvent.click(within(movie).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The account service is temporarily unavailable. Try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving Dune: Part Two' }))
    await waitFor(() => expect(within(movie).getByRole('status')).toHaveTextContent('Saved to your Watchlist.'))

    expect(responseWrites).toBe(2)
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input) === '/v1/taste/recommendations/rec-movie/response' && init?.method === 'PUT').map(([, init]) => init?.body)).toEqual([
      '{"response":"saved"}', '{"response":"saved"}',
    ])
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/v1/taste/recommendations' || String(input).startsWith('/v1/taste/recommendations?'))).toHaveLength(1)
  })
})
