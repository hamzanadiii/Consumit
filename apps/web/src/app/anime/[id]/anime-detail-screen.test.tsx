import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AnimeHeroTitle, indexStreamingMeta } from './anime-detail-screen'

function detail(episodes: Array<{ title: string; thumbnail: string | null; site: string }>) {
  return { streamingEpisodes: episodes } as Parameters<typeof indexStreamingMeta>[0]
}

describe('streaming episode index', () => {
  it('keys titled episodes by canonical number with artwork', () => {
    const indexed = indexStreamingMeta(detail([
      { title: 'Episode 130 - Scent of Danger!', thumbnail: 'https://cdn.example/130.jpg', site: 'Crunchyroll' },
      { title: 'Episode 9: Truth', thumbnail: null, site: 'Crunchyroll' },
    ]))
    expect(indexed.get(130)).toEqual({ title: 'Episode 130 - Scent of Danger!', thumbnail: 'https://cdn.example/130.jpg' })
    expect(indexed.get(9)).toEqual({ title: 'Episode 9: Truth', thumbnail: null })
  })
  it('skips untitled entries and keeps the first duplicate', () => {
    const indexed = indexStreamingMeta(detail([
      { title: 'Trailer', thumbnail: 'https://cdn.example/t.jpg', site: 'Crunchyroll' },
      { title: 'Episode 1 - Pilot', thumbnail: 'https://cdn.example/1a.jpg', site: 'A' },
      { title: 'Episode 1 - Pilot (dup)', thumbnail: 'https://cdn.example/1b.jpg', site: 'B' },
    ]))
    expect(indexed.has(1)).toBe(true)
    expect(indexed.get(1)?.thumbnail).toBe('https://cdn.example/1a.jpg')
    expect(indexed.size).toBe(1)
  })
})

describe('anime hero title', () => {
  it('renders logo art with a screen-reader title when matched', () => {
    render(<AnimeHeroTitle logoUrl="https://image.tmdb.org/t/p/w500/logo.png" title="Cowboy Bebop" />)
    // Next.js optimizes the src; the accessible name proves the logo branch.
    expect(screen.getByRole('img', { name: 'Cowboy Bebop' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cowboy Bebop' })).toBeInTheDocument()
  })

  it('renders the serif display title without a logo', () => {
    render(<AnimeHeroTitle logoUrl={null} title="Cowboy Bebop" />)
    expect(screen.getByRole('heading', { name: 'Cowboy Bebop' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
