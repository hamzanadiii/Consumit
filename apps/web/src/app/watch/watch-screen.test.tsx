import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { movieDetail } from '@/test/catalog-fixtures'

import { WatchScreen } from './watch-screen'

describe('real catalog watch state', () => {
  it('never supplies a playable source when no configured provider exists', () => {
    const { container } = render(<WatchScreen title={movieDetail} />)
    const player = screen.getByLabelText('Dune: Part Two player')
    expect(player).not.toHaveAttribute('src')
    expect(player.closest('[data-consumit-player-screen]')).toBeInTheDocument()
    expect(container.querySelector('iframe, embed, object')).not.toBeInTheDocument()
    expect(screen.getAllByText('No playback source available').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Return to title' })).toHaveAttribute('href', '/title/693134')
  })

  it('keeps the deterministic fixture synchronized when explicitly provided', () => {
    const { container } = render(
      <WatchScreen
        demo={{
          caption: 'Some places disappear long before anyone leaves them.',
          chapters: [{ startTime: 0, title: 'The missing street' }],
          source: { qualityHint: '4K', src: 'https://cdn.consumit.example/dune.mp4', type: 'native' },
        }}
        title={movieDetail}
      />,
    )

    expect(container.querySelector('iframe, embed, object')).not.toBeInTheDocument()
    expect(screen.getAllByText('Preview source ready').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(screen.getByText('Playing from Consumit · 4K')).toBeInTheDocument()
  })
})
