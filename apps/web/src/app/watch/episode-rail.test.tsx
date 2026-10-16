import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EpisodeRail } from './episode-rail'

describe('episode rail metadata', () => {
  it('loads one visible page and labels title-art fallback honestly', async () => {
    const loadPage = vi.fn(async () => ({ 1: { title: 'First', thumbnail: null, synopsis: 'Episode story.', airDate: '2024-05-01', duration: 24 }, 2: null }))
    render(<EpisodeRail countLabel="2 episodes" currentLabel="Now playing" episodes={[
      { number: 1, title: null, href: '/watch/anime/1?episode=1' },
      { number: 2, title: null, href: '/watch/anime/1?episode=2' },
    ]} fallbackArt="https://example.com/title.jpg" heading="Episodes" loadPage={loadPage} />)
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1))
    expect(loadPage).toHaveBeenCalledWith([1, 2])
    expect(await screen.findByText('24m · May 1, 2024')).toBeInTheDocument()
    expect(screen.queryByText('Episode story.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Title artwork')).toHaveLength(2)
  })
})
