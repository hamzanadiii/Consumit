import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { HomeScreen } from './home-screen'

const titles = Array.from({ length: 10 }, (_, index) => ({
  ...movieSummary,
  id: movieSummary.id + index,
  title: index === 0 ? movieSummary.title : `Catalog title ${index + 1}`,
}))

describe('home screen catalog presentation', () => {
  it('links Watch directly to the player and hides computed scoring', () => {
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} stale={false} trending={titles} />)

    expect(screen.getAllByRole('link', { name: 'Watch' })[0]).toHaveAttribute('href', '/watch/movie/693134')
    expect(screen.queryByText(/taste match|% match|% finished|TMDB rating/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/out of 5/i)).not.toBeInTheDocument()
  })

  it('hides member rails until their backends land', () => {
    render(<HomeScreen curated={titles} editorial={titles[1]!} hero={titles[0]!} stale={false} trending={titles} />)

    expect(screen.queryByRole('heading', { name: 'From your circle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Continue watching' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trending tonight' })).toBeInTheDocument()
  })
})
