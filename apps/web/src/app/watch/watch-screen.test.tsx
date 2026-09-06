import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { movieDetail } from '@/test/catalog-fixtures'

import { WatchScreen } from './watch-screen'

describe('real catalog watch state', () => {
  it('never supplies a playable source when no authorized provider exists', () => {
    render(<WatchScreen title={movieDetail} />)
    const player = screen.getByLabelText('Dune: Part Two player')
    expect(player).not.toHaveAttribute('src')
    expect(screen.getAllByText('No authorized source available').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Return to title' })).toHaveAttribute('href', '/title/693134')
  })
})
