import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { seriesDetail } from '@/test/catalog-fixtures'

import { SeriesDetailScreen } from './detail-screens'

const meta = { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false }
const firstSeason = {
  episodes: [{ airDate: '2022-02-18', episodeNumber: 1, id: 10, overview: 'The team arrives.', runtimeMinutes: 50, seasonNumber: 1, stillUrl: null, title: 'Good News About Hell' }],
  name: 'Season 1', overview: '', posterUrl: null, seasonNumber: 1, seriesId: 95396,
}

afterEach(() => vi.unstubAllGlobals())

describe('series season selection', () => {
  it('switches through Fastify and preserves the current season when a later load fails', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { ...firstSeason, episodes: [{ ...firstSeason.episodes[0], episodeNumber: 2, id: 11, seasonNumber: 2, title: 'Second Season Premiere' }], name: 'Season 2', seasonNumber: 2 }, meta }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'CATALOG_UNAVAILABLE', message: 'TMDB is unavailable.', retryable: true } }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SeriesDetailScreen apiBase="http://api.test" detail={seriesDetail} initialSeason={firstSeason} stale={false} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Season' }), '2')
    expect(await screen.findByText('Second Season Premiere')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Season' }), '1')
    expect(await screen.findByRole('alert')).toHaveTextContent('current season is still here')
    expect(screen.getByText('Second Season Premiere')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
