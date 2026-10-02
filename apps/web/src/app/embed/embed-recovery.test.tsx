import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSession } from '@consumit/contracts'
import { EmbedPlayer } from './embed-player'

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), recover: vi.fn(), providers: vi.fn(), switch: vi.fn(), subtitles: vi.fn() }))
vi.mock('@/lib/playback-browser', () => ({ playbackCapabilities: () => ({ hls: true, dash: true, native: true, nativeHls: true }) }))
vi.mock('@/lib/embed-playback-browser', () => ({ resolveEmbedSession: mocks.resolve, recoverEmbedSession: mocks.recover, listEmbedProviders: mocks.providers, switchEmbedSession: mocks.switch }))
vi.mock('@/lib/subtitles-browser', () => ({ fetchAggregatedSubtitles: mocks.subtitles }))
vi.mock('@consumit/ui', () => ({
  ConsumitPlayer: ({ source, resumeAt, resumePlaying, onSourceError, onTimeUpdate, onPause, onPlay }: {
    source?: { src: string; providerId: string }; resumeAt?: number; resumePlaying?: boolean
    onSourceError?: (reason: 'network') => void; onTimeUpdate?: (event: { currentTarget: { currentTime: number } }) => void
    onPause?: (event: { currentTarget: { currentTime: number; duration: number } }) => void; onPlay?: (event: { currentTarget: { currentTime: number; duration: number } }) => void
  }) => <div data-testid="player" data-source={source?.src} data-position={resumeAt} data-playing={String(resumePlaying)}>
    <button onClick={() => onTimeUpdate?.({ currentTarget: { currentTime: 42 } })}>seek</button>
    <button onClick={() => onPause?.({ currentTarget: { currentTime: 42, duration: 100 } })}>pause</button>
    <button onClick={() => onPlay?.({ currentTarget: { currentTime: 42, duration: 100 } })}>play</button>
    <button onClick={() => onSourceError?.('network')}>fail</button>
  </div>,
}))

const initial: PlaybackSession = {
  id: '00000000-0000-4000-8000-000000000001', ref: { kind: 'movie', id: 1 },
  source: { id: 'first', providerId: 'direct', type: 'hls', src: 'https://media.example/direct.m3u8', delivery: 'direct' as const, expiresAt: '2099-01-01T00:00:00.000Z', subtitles: [], skipSegments: [] },
  expiresAt: '2099-01-01T00:00:00.000Z', fallbackCount: 0, capabilities: { refresh: true, fallback: true, externalSubtitles: false },
}
const backup: PlaybackSession = { ...initial, source: { ...initial.source, id: 'second', providerId: 'backup', src: 'https://media.example/backup.m3u8', delivery: 'direct' as const } }

describe('recoverable public embed', () => {
  beforeEach(() => {
    mocks.resolve.mockReset().mockResolvedValue({ session: initial, token: 'a'.repeat(64) })
    mocks.recover.mockReset().mockImplementation(async (_session: PlaybackSession, _token: string, action: string) => action === 'refresh' ? initial : backup)
    mocks.providers.mockReset().mockResolvedValue([])
    mocks.switch.mockReset().mockResolvedValue(backup)
    mocks.subtitles.mockReset().mockResolvedValue([])
  })

  it('uses the same refresh and fallback policy as Watch while retaining position and pause intent', async () => {
    render(<EmbedPlayer playbackRef={{ kind: 'movie', id: 1 }} title="Film" videoId={1} />)
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src))
    screen.getByRole('button', { name: 'seek' }).click()
    screen.getByRole('button', { name: 'pause' }).click()
    screen.getByRole('button', { name: 'fail' }).click()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', backup.source.src))
    expect(screen.getByTestId('player')).toHaveAttribute('data-position', '42')
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'false')
    expect(mocks.recover.mock.calls.map((call) => call[2])).toEqual(['refresh', 'fallback'])
    expect(mocks.recover.mock.calls[0]?.[1]).toBe('a'.repeat(64))
  })

  it('offers a retry when no source resolves', async () => {
    mocks.resolve.mockRejectedValueOnce(new Error('outage'))
    render(<EmbedPlayer playbackRef={{ kind: 'movie', id: 1 }} title="Film" videoId={1} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No stream is available')
    screen.getByRole('button', { name: 'Try again' }).click()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src))
  })

  it('keeps playback available when subtitle search fails', async () => {
    mocks.subtitles.mockRejectedValueOnce(new Error('subtitle outage'))
    render(<EmbedPlayer playbackRef={{ kind: 'movie', id: 1 }} title="Film" videoId={1} />)
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src))
    expect(mocks.subtitles).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'play' }).click()
    await waitFor(() => expect(mocks.subtitles).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src)
  })

  it('keeps provider switching out of the public embed controls', async () => {
    render(<EmbedPlayer playbackRef={{ kind: 'movie', id: 1 }} title="Film" videoId={1} />)
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src))
    expect(screen.queryByRole('button', { name: 'switch' })).not.toBeInTheDocument()
    expect(mocks.providers).not.toHaveBeenCalled()
    expect(mocks.switch).not.toHaveBeenCalled()
  })
})
