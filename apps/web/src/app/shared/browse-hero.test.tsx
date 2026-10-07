import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BrowseHero } from './browse-hero'
import { LandscapeCard } from './landscape-card'

describe('browse hero', () => {
  it('renders the Charter heading, description, and backdrop collage', () => {
    render(<BrowseHero backdrops={['https://img.example/one.jpg', null, 'https://img.example/two.jpg']} description="Find your next great watch." title="Movies" />)
    const region = screen.getByRole('region', { name: 'Movies.' })
    expect(region).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Movies.' })).toBeInTheDocument()
    expect(screen.getByText('Find your next great watch.')).toBeInTheDocument()
    expect(region.querySelectorAll('img')).toHaveLength(2)
  })

  it('keeps the masthead readable when no artwork exists', () => {
    render(<BrowseHero backdrops={[null, undefined]} description="Discover anime from AniList." title="Anime" />)
    expect(screen.getByRole('heading', { name: 'Anime.' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('landscape card', () => {
  it('links the artwork once and captions rating, year, and kind', () => {
    render(
      <LandscapeCard
        artworkSrc="https://img.example/backdrop.jpg"
        href="/title/1"
        meta={{ kind: 'Movie', rating: 8.2, year: 2026 }}
        title="Dune: Part Two"
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/title/1')
    expect(links[0]).toHaveAccessibleName('Dune: Part Two')
    const caption = screen.getByText('Dune: Part Two').parentElement
    expect(caption).toHaveTextContent('8.2')
    expect(caption).toHaveTextContent('2026')
    expect(caption).toHaveTextContent('Movie')
    expect(screen.getByRole('img', { name: 'Dune: Part Two artwork' })).toBeInTheDocument()
  })

  it('omits the caption entirely when nothing is known about the title', () => {
    render(<LandscapeCard href="/anime/21" title="Example" />)
    expect(screen.getByRole('link', { name: 'Example' })).toBeInTheDocument()
    expect(screen.getByText('Example').nextElementSibling).toBeNull()
  })

  it('shows the format note without inventing a rating', () => {
    render(<LandscapeCard href="/anime/21" meta={{ kind: 'Anime', year: 2024 }} note="TV" title="Solo Leveling" />)
    const caption = screen.getByText('Solo Leveling').parentElement
    expect(caption).toHaveTextContent('2024')
    expect(caption).toHaveTextContent('Anime')
    expect(caption).toHaveTextContent('TV')
    expect(caption).not.toHaveTextContent('out of 10')
  })
})
