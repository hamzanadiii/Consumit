import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EmbedEmptyState } from './embed-empty'
import { EmbedPlayer, postEmbedPlayerEvent, type EmbedSource } from './embed-player'

const source: EmbedSource = {
  headers: {},
  provider: 'primary',
  quality: '1080p',
  type: 'hls',
  url: 'https://media.example.com/master.m3u8',
}

describe('EmbedPlayer', () => {
  it('renders the catalog title on the first-party player without an iframe', async () => {
    const { container } = render(
      <EmbedPlayer sources={[source]} title="Dune: Part Two" videoId={693134} />,
    )

    await waitFor(() => expect(screen.getByLabelText('Dune: Part Two player')).toBeInTheDocument())
    expect(container.querySelector('iframe, embed, object')).not.toBeInTheDocument()
    expect(screen.getAllByText('Playing from Consumit · 1080p').length).toBeGreaterThan(0)
  })

  it('renders nothing without configured sources', () => {
    const { container } = render(<EmbedPlayer sources={[]} title="Ghost" videoId={1} />)
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('passes resume and autoplay intent to the player', async () => {
    render(
      <EmbedPlayer autoPlay={false} sources={[source]} startAt={60} title="Dune: Part Two" videoId={693134} />,
    )
    const video = await screen.findByLabelText('Dune: Part Two player')
    expect(video).not.toHaveAttribute('autoplay')
  })
})

describe('postEmbedPlayerEvent', () => {
  it('sends a VixSrc-compatible PLAYER_EVENT to the parent frame', () => {
    const postMessage = vi.fn()
    const parent = { postMessage } as unknown as Window
    const frame = { parent } as unknown as Window

    postEmbedPlayerEvent('play', 12.5, 90, 693134, frame)

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'PLAYER_EVENT', data: { currentTime: 12.5, duration: 90, event: 'play', video_id: 693134 } },
      '*',
    )
  })

  it('stays quiet when the route is not framed', () => {
    const postMessage = vi.fn()
    const frame = { postMessage } as unknown as Window
    Object.assign(frame, { parent: frame })

    postEmbedPlayerEvent('pause', 1, 2, 3, frame)

    expect(postMessage).not.toHaveBeenCalled()
  })
})

describe('EmbedEmptyState', () => {
  it('states the honest no-source condition in product language', () => {
    render(<EmbedEmptyState />)
    expect(screen.getByRole('status')).toHaveTextContent('No streams available')
    expect(screen.getByText('Try again in a moment.')).toBeInTheDocument()
    expect(screen.getByText('Consumit')).toBeInTheDocument()
  })
})
