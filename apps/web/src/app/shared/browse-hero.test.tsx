import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BrowseHero } from './browse-hero'

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
