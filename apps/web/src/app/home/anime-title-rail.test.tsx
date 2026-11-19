import type { AnimeTitleSummary } from '@consumit/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnimeTitleRail } from './anime-title-rail'

const anime: AnimeTitleSummary = {
  anilistId: 21,
  averageScore: 92,
  bannerImage: null,
  coverImage: { color: null, url: 'https://cdn.example/cover.jpg' },
  description: 'A sample anime for the Home rail.',
  episodeDuration: 24,
  episodes: 12,
  format: 'TV',
  genres: ['Drama'],
  kind: 'anime',
  nextAiringEpisode: null,
  popularity: 1_000,
  season: 'SPRING',
  seasonYear: 2024,
  status: 'FINISHED',
  titles: { english: 'Example', native: null, preferred: 'Example', romaji: 'Example' },
}

afterEach(() => vi.unstubAllGlobals())

describe('anime title rail scrolling', () => {
  it('shows only movable controls and respects reduced motion', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    render(<AnimeTitleRail id="anime-next" items={[anime, { ...anime, anilistId: 22, titles: { ...anime.titles, preferred: 'Second example' } }]} title="Popular anime" />)

    const rail = screen.getByRole('list', { name: 'Popular anime titles' })
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 660 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    const scrollBy = vi.fn(({ left }: ScrollToOptions) => {
      rail.scrollLeft = left && left > 0 ? 360 : 0
      fireEvent.scroll(rail)
    })
    Object.defineProperty(rail, 'scrollBy', { configurable: true, value: scrollBy })
    fireEvent(window, new Event('resize'))

    const right = screen.getByRole('button', { name: 'Scroll Popular anime right' })
    expect(screen.queryByRole('button', { name: 'Scroll Popular anime left' })).not.toBeInTheDocument()
    await user.click(right)
    expect(scrollBy).toHaveBeenCalledWith({ left: 225, behavior: 'instant' })
    expect(screen.getByRole('button', { name: 'Scroll Popular anime left' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scroll Popular anime right' })).not.toBeInTheDocument()
  })
})
