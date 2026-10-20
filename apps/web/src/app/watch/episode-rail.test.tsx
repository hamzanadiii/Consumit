import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EpisodeRail } from './episode-rail'

describe('episode rail', () => {
  it('loads one visible page and keeps cards focused on art, number, and title', async () => {
    const loadPage = vi.fn(async () => ({ 1: { title: 'First', thumbnail: null, synopsis: 'Episode story.', airDate: '2024-05-01', duration: 24 }, 2: null }))
    render(<EpisodeRail countLabel="2 episodes" currentLabel="Now playing" episodes={[
      { number: 1, seasonNumber: 1, title: null, href: '/watch/anime/1?episode=1' },
      { number: 2, seasonNumber: 1, title: null, href: '/watch/anime/1?episode=2' },
    ]} fallbackArt="https://example.com/title.jpg" heading="Episodes" loadPage={loadPage} />)
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1))
    expect(loadPage).toHaveBeenCalledWith([1, 2])
    expect(await screen.findByRole('link', { name: 'Watch episode 1: First' })).toBeInTheDocument()
    expect(screen.getByText('S1E1')).toBeInTheDocument()
    expect(screen.queryByText('24m · May 1, 2024')).not.toBeInTheDocument()
    expect(screen.queryByText('Episode story.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show previous episodes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show more episodes' })).toBeInTheDocument()
    expect(document.querySelector('[data-episode-carousel-track]')).toBeInTheDocument()
    expect(screen.queryByText('Title artwork')).not.toBeInTheDocument()
  })
})
