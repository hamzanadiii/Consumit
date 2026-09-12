import { Activity, type ReactNode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { movieDetail } from '@/test/catalog-fixtures'
import { WatchPlayback } from './watch-playback'

const mocks = vi.hoisted(() => ({ request: vi.fn(), list: vi.fn(), swap: vi.fn() }))
vi.mock('../session/session', () => ({ useSession: () => ({ member: null }) }))
vi.mock('@/lib/playback-browser', () => ({ playbackCapabilities: () => ({ hls: true, native: true, dash: false, nativeHls: true }), playbackRequest: mocks.request, listPlaybackProviders: mocks.list, switchPlaybackProvider: mocks.swap }))
vi.mock('@/lib/playback-progress', () => ({ readPlaybackProgress: async () => 0, writePlaybackProgress: async () => undefined, PROGRESS_SYNC_INTERVAL_MS: 25000, hasMeaningfulProgressChange: () => true }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@consumit/ui', () => ({
  Button: ({ children, loading, onClick }: { children: ReactNode; loading?: boolean; onClick: () => void }) => <button disabled={loading} onClick={onClick}>{children}</button>,
  ConsumitPlayer: ({ onServerChange, serverOptions, extraSubtitles }: { onServerChange?: (value: string) => void; serverOptions?: { value: string; label: string }[]; extraSubtitles?: { id: string }[] }) => (
    <div data-testid="player" data-extra={(extraSubtitles ?? []).map((track) => track.id).join(',')}>{(serverOptions ?? []).map((option) => <button key={option.value} onClick={() => onServerChange?.(option.value)}>{option.label}</button>)}</div>
  ),
  buttonVariants: () => '',
}))

const session = { id: 'fixture-session', ref: { kind: 'movie', id: movieDetail.id }, source: { id: 'fixture-source', expiresAt: new Date(Date.now() + 60000).toISOString() } }

describe('watch request lifecycle', () => {
  it('keeps one resolve across hide/show instead of aborting and refetching', async () => {
    let release!: (value: unknown) => void
    mocks.request.mockReset().mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      .mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    const view = render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
    // Hiding mid-resolve no longer aborts: the pending request settles once
    // and no second resolve fires on restore.
    view.rerender(<Activity mode="hidden"><WatchPlayback title={movieDetail} /></Activity>)
    view.rerender(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    release(session)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('offers retry with return when autostart cannot resolve', async () => {
    mocks.request.mockReset().mockRejectedValueOnce(new Error('No source')).mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByRole('alert')).toHaveTextContent('No source')
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })
  it('drops a late server list on unmount without aborting it', async () => {
    let release!: (value: { id: string; label: string }[]) => void
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const view = render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1))
    const signal = mocks.list.mock.calls[0]?.[1] as AbortSignal
    view.unmount()
    // The superseded fetch is left to settle, never aborted: no AbortError
    // rejection can escape as an uncaught runtime error.
    expect(signal.aborted).toBe(false)
    await act(async () => { release([{ id: 'ghost', label: 'ghost' }]) })
    expect(screen.queryByText('ghost')).toBeNull()
  })
  it('merges every server subtitles into the player', async () => {
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([
      { id: 'primary', label: 'primary', subtitles: [{ id: 'p-en', label: 'English', language: 'en', url: 'https://media.example/p-en.vtt', format: 'vtt' }] },
      { id: 'backup', label: 'backup', subtitles: [{ id: 'b-en', label: 'English', language: 'en', url: 'https://media.example/b-en.vtt', format: 'vtt' }, { id: 'b-fr', label: 'French', language: 'fr', url: 'https://media.example/b-fr.vtt', format: 'vtt' }] },
    ])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    // Same language+label dedupes to the first provider's track; distinct
    // languages from every server join the menu.
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-extra', 'p-en,b-fr'))
  })
  it('lists servers and switches source on selection', async () => {
    const switched = { ...session, source: { ...session.source, providerId: 'backup' } }
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([{ id: 'primary', label: 'primary' }, { id: 'backup', label: 'backup' }])
    mocks.swap.mockReset().mockResolvedValue(switched)
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1))
    screen.getByRole('button', { name: 'backup' }).click()
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledTimes(1))
    expect(mocks.swap).toHaveBeenCalledWith(session.id, { providerId: 'backup' }, expect.any(AbortSignal))
  })
})
