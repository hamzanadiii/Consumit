import { Activity, type ReactNode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { movieDetail } from '@/test/catalog-fixtures'
import { WatchPlayback } from './watch-playback'

const mocks = vi.hoisted(() => ({ request: vi.fn(), list: vi.fn(), swap: vi.fn(), subs: vi.fn(), push: vi.fn(), pref: vi.fn(), savePref: vi.fn(), member: null as null | { id: string } }))
vi.mock('../session/session', () => ({ useSession: () => ({ member: mocks.member }) }))
vi.mock('@/lib/playback-browser', () => ({ playbackCapabilities: () => ({ hls: true, native: true, dash: false, nativeHls: true }), playbackRequest: mocks.request, listPlaybackProviders: mocks.list, switchPlaybackProvider: mocks.swap }))
vi.mock('@/lib/subtitles-browser', () => ({ fetchAggregatedSubtitles: (...args: unknown[]) => mocks.subs(...args), fetchSubtitlePreference: (...args: unknown[]) => mocks.pref(...args), saveSubtitlePreference: (...args: unknown[]) => mocks.savePref(...args) }))
vi.mock('@/lib/playback-progress', () => ({ readPlaybackProgress: async () => 0, writePlaybackProgress: async () => undefined, PROGRESS_SYNC_INTERVAL_MS: 25000, hasMeaningfulProgressChange: () => true }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@consumit/ui', () => ({
  SUBTITLE_LANGUAGES_EVENT: 'consumit:test-languages-changed',
  readStoredSubtitleLanguages: () => JSON.parse(window.localStorage.getItem('consumit.player.subtitle-languages') ?? '[]') as string[],
  Button: ({ children, loading, onClick }: { children: ReactNode; loading?: boolean; onClick: () => void }) => <button disabled={loading} onClick={onClick}>{children}</button>,
  Toggle: ({ checked, label, onCheckedChange }: { checked: boolean; label: string; onCheckedChange?: (checked: boolean) => void }) => <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onCheckedChange?.(!checked)} />,
  ConsumitPlayer: ({ onServerChange, serverOptions, extraSubtitles, onSourceError, onEnded, subtitleDelayMs, onSubtitleDelayMsChange }: { onServerChange?: (value: string) => void; serverOptions?: { value: string; label: string }[]; extraSubtitles?: { id: string }[]; onSourceError?: (reason: 'network' | 'media' | 'gone') => void; onEnded?: () => void; subtitleDelayMs?: number; onSubtitleDelayMsChange?: (value: number) => void }) => (
    <div data-testid="player" data-extra={(extraSubtitles ?? []).map((track) => track.id).join(',')} data-delay={subtitleDelayMs ?? 'uncontrolled'}>{(serverOptions ?? []).map((option) => <button key={option.value} onClick={() => onServerChange?.(option.value)}>{option.label}</button>)}<button onClick={() => onSourceError?.('network')}>simulate-error</button><button onClick={() => onSourceError?.('gone')}>simulate-gone</button><button onClick={() => onEnded?.()}>simulate-ended</button><button onClick={() => onSubtitleDelayMsChange?.(1500)}>simulate-delay</button></div>
  ),
  buttonVariants: () => '',
}))

const session = { id: 'fixture-session', ref: { kind: 'movie', id: movieDetail.id }, source: { id: 'fixture-source', expiresAt: new Date(Date.now() + 60000).toISOString() } }

describe('watch request lifecycle', () => {
  beforeEach(() => {
    mocks.subs.mockReset().mockResolvedValue([])
  })
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
      { id: 'primary', label: 'primary', regions: ['US'], health: 'ok', subtitles: [{ id: 'p-en', label: 'English', language: 'en', url: 'https://media.example/p-en.vtt', format: 'vtt' }] },
      { id: 'backup', label: 'backup', regions: ['US'], health: 'ok', subtitles: [{ id: 'b-en', label: 'English', language: 'en', url: 'https://media.example/b-en.vtt', format: 'vtt' }, { id: 'b-fr', label: 'French', language: 'fr', url: 'https://media.example/b-fr.vtt', format: 'vtt' }] },
    ])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    // Same language+label from different providers are different files: all
    // survive, with repeated labels disambiguated by supplying provider.
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-extra', 'p-en,b-en,b-fr'))
  })
  it('merges aggregated engine subtitles independently of providers', async () => {
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.subs.mockReset().mockResolvedValue([
      { id: 'sub-yify-en', label: 'English (yify)', language: 'en', url: 'https://api.example/v1/subtitles/file/abc' },
      { id: 'sub-castle-en', label: 'English (castlesubs)', language: 'en', url: 'https://cdn.example/castle-en.vtt' },
    ])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    expect(mocks.subs).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, expect.any(AbortSignal), [])
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-extra', 'sub-yify-en,sub-castle-en'))
  })
  it('forwards stored preferred subtitle languages to the aggregation', async () => {
    window.localStorage.setItem('consumit.player.subtitle-languages', JSON.stringify(['ar', 'fr']))
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.subs.mockReset().mockResolvedValue([])
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      expect(await screen.findByText('Source ready')).toBeInTheDocument()
      expect(mocks.subs).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, expect.any(AbortSignal), ['ar', 'fr'])
    } finally {
      window.localStorage.removeItem('consumit.player.subtitle-languages')
    }
  })
  it('lists servers and switches source on selection', async () => {
    const switched = { ...session, source: { ...session.source, providerId: 'backup' } }
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([{ id: 'primary', label: 'primary', regions: ['US'], health: 'ok' }, { id: 'backup', label: 'backup', regions: ['US'], health: 'ok' }])
    mocks.swap.mockReset().mockResolvedValue(switched)
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1))
    screen.getByRole('button', { name: 'backup' }).click()
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledTimes(1))
    expect(mocks.swap).toHaveBeenCalledWith(session.id, { providerId: 'backup' }, expect.any(AbortSignal))
  })
  it('sends the stored audio preference on resolve instead of the default', async () => {
    window.localStorage.setItem('consumit.player.audio-language', 'hi')
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      expect(await screen.findByText('Source ready')).toBeInTheDocument()
      expect(mocks.request).toHaveBeenCalled()
      expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({ audioLanguage: 'hi' })
    } finally {
      window.localStorage.removeItem('consumit.player.audio-language')
    }
  })
  it('falls back when a refreshed source fails again immediately', async () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString()
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/orig.m3u8', expiresAt } }
    // Same provider re-mints different URLs (fresh signatures), so the
    // identical-URL check alone would refresh forever on an unplayable
    // provider instead of spending the fallback budget.
    const refreshed = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/remint.m3u8', expiresAt } }
    const fallenBack = { ...session, source: { ...session.source, id: 'source-2', providerId: 'backup', src: 'https://media.example/other.m3u8', expiresAt } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed).mockResolvedValue(fallenBack)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
    expect(mocks.request.mock.calls[1]?.[0]).toBe(`${session.id}/refresh`)
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(3))
    expect(mocks.request.mock.calls[2]?.[0]).toBe(`${session.id}/fallback`)
  })
  it('switches once to the pinned provider after autostart', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary' } }
    const pinned = { ...session, source: { ...session.source, providerId: 'backup' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.swap.mockReset().mockResolvedValue(pinned)
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} pinnedProvider="backup" /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledTimes(1))
    expect(mocks.swap).toHaveBeenCalledWith(session.id, { providerId: 'backup' }, expect.any(AbortSignal))
  })
  it('shows a visible switching status while recovering', async () => {
    let release!: (value: unknown) => void
    mocks.request.mockReset().mockResolvedValueOnce(session).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    screen.getByRole('button', { name: 'simulate-error' }).click()
    expect(await screen.findByText('Switching source…', { selector: '.pointer-events-none' })).toBeInTheDocument()
    await act(async () => { release({ ...session, source: { ...session.source, id: 'source-2' } }) })
    await waitFor(() => expect(screen.queryByText('Switching source…', { selector: '.pointer-events-none' })).not.toBeInTheDocument())
  })
  it('names the destination after switching servers', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary' } }
    const switched = { ...session, source: { ...session.source, providerId: 'backup', qualityHint: '720p' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'primary', label: 'primary', regions: ['US'], health: 'ok' }, { id: 'backup', label: 'backup', regions: ['US'], health: 'ok' }])
    mocks.swap.mockReset().mockResolvedValue(switched)
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1))
    screen.getByRole('button', { name: 'backup' }).click()
    expect(await screen.findByText('Switched to backup · 720p')).toBeInTheDocument()
  })
  it('shows the episode bar with prev/next and persisted toggles', async () => {
    window.localStorage.clear()
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} nextHref="/watch/series/1?season=1&episode=3" prevHref="/watch/series/1?season=1&episode=1" /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Prev/ })).toHaveAttribute('href', '/watch/series/1?season=1&episode=1')
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/watch/series/1?season=1&episode=3')
    expect(screen.getByRole('switch', { name: 'Autoplay next episode' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Show up-next card' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Auto-skip intros' })).toHaveAttribute('aria-checked', 'true')
    window.localStorage.clear()
  })
  it('autoplay advances to the next episode on ended', async () => {
    window.localStorage.setItem('consumit.player.autoplay', '1')
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.push.mockReset()
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} nextHref="/watch/series/1?season=1&episode=3" /></Activity>)
      expect(await screen.findByText('Source ready')).toBeInTheDocument()
      screen.getByRole('button', { name: 'simulate-ended' }).click()
      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/watch/series/1?season=1&episode=3'))
    } finally {
      window.localStorage.clear()
    }
  })
  it('advances to the next mirror when a manual switch fails', async () => {
    const switched = { ...session, source: { ...session.source, providerId: 'primary' } }
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([
      { id: 'primary', label: 'primary', regions: ['US'], health: 'ok', available: true },
      { id: 'ghost', label: 'ghost', regions: ['US'], health: 'ok', available: false },
      { id: 'backup', label: 'backup', regions: ['US'], health: 'ok', available: true },
    ])
    mocks.swap.mockReset().mockRejectedValueOnce(new Error('dead')).mockResolvedValue(switched)
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1))
    screen.getByRole('button', { name: 'ghost' }).click()
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledTimes(2))
    expect(mocks.swap.mock.calls[0]?.[1]).toEqual({ providerId: 'ghost' })
    expect(mocks.swap.mock.calls[1]?.[1]).toEqual({ providerId: 'primary' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('loads the stored sync offset for members and persists nudges', async () => {
    mocks.member = { id: 'member-1' }
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.pref.mockReset().mockResolvedValue({ trackId: null, offsetMs: 1500 })
      mocks.savePref.mockReset().mockResolvedValue(undefined)
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      expect(await screen.findByText('Source ready')).toBeInTheDocument()
      await waitFor(() => expect(mocks.pref).toHaveBeenCalledTimes(1))
      expect(mocks.pref).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, expect.any(AbortSignal))
      await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-delay', '1500'))
      screen.getByRole('button', { name: 'simulate-delay' }).click()
      await waitFor(() => expect(mocks.savePref).toHaveBeenCalledTimes(1), { timeout: 3000 })
      expect(mocks.savePref).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, { offsetMs: 1500 }, expect.any(AbortSignal))
    } finally {
      mocks.member = null
    }
  })
  it('keeps guests on device-local subtitles without preference calls', async () => {
    mocks.member = null
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.pref.mockReset()
    mocks.savePref.mockReset()
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    expect(screen.getByTestId('player')).toHaveAttribute('data-delay', 'uncontrolled')
    expect(mocks.pref).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'simulate-delay' }).click()
    expect(mocks.savePref).not.toHaveBeenCalled()
  })
  it('skips refresh and falls back immediately when the source reports gone', async () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString()
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/orig.m3u8', expiresAt } }
    const fallenBack = { ...session, source: { ...session.source, id: 'source-2', providerId: 'backup', src: 'https://media.example/other.m3u8', expiresAt } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(fallenBack)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByText('Source ready')).toBeInTheDocument()
    screen.getByRole('button', { name: 'simulate-gone' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
    // No same-provider re-mint: gone bytes never come back, so the only call
    // after resolve is the fallback, carrying the contract reason.
    expect(mocks.request.mock.calls[1]?.[0]).toBe(`${session.id}/fallback`)
    expect(mocks.request.mock.calls[1]?.[1]).toMatchObject({ sourceId: 'source-1', reason: 'unsupported' })
  })
})
