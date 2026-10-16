import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EpisodeCard } from './episode-card'

it('retains an exact episode destination on both playable actions', () => {
  render(<EpisodeCard episode={4} href="/watch/series/95396?season=2&episode=4" title="A long-awaited return" />)
  expect(screen.getByRole('link', { name: 'Watch Episode 4: A long-awaited return' })).toHaveAttribute('href', '/watch/series/95396?season=2&episode=4')
  expect(screen.getByRole('link', { name: 'Play episode' })).toHaveAttribute('href', '/watch/series/95396?season=2&episode=4')
})

it('shows upcoming evidence without allowing an unaired episode to launch', () => {
  render(<EpisodeCard episode={3} href="/watch/anime/21?episode=3" title="Tomorrow" upcoming />)
  expect(screen.getAllByText('Upcoming')).toHaveLength(2)
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.getAllByText('Upcoming')[1]).toHaveAttribute('aria-disabled', 'true')
})
