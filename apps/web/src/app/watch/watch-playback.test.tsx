import { Activity, type ReactNode } from 'react'
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { movieDetail } from '@/test/catalog-fixtures'
import type { DirectMediaSource } from '@consumit/ui'
import type { CastLoadRequest } from '@/lib/cast-sender'
import { WatchPlayback } from './watch-playback'

const mocks = vi.hoisted(() => ({
  playerSources: vi.fn((source: DirectMediaSource | undefined) => source),
  selected: vi.fn(), request: vi.fn(), list: vi.fn(), swap: vi.fn(), subs: vi.fn(), page: vi.fn(), prepare: vi.fn(), push: vi.fn(), pref: vi.fn(), savePref: vi.fn(), write: vi.fn(async (...args: unknown[]) => { void args }), member: null as null | { id: string },
  cast: {
    available: false, status: null as null | { connected: boolean; deviceName: string | null; position: number; duration: number; playing: boolean; volume: number; muted: boolean },
    listeners: new Set<() => void>(),
    ensure: vi.fn(async () => mocks.cast.available),
    subscribe: vi.fn((listener: () => void) => { mocks.cast.listeners.add(listener); return () => { mocks.cast.listeners.delete(listener) } }),
    requestSession: vi.fn(async () => undefined),
    endSession: vi.fn(),
    loadMedia: vi.fn(async (request: CastLoadRequest) => { void request }),
    playOrPause: vi.fn(), seekTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(),
    emit() { for (const listener of [...mocks.cast.listeners]) listener() },
  },
}))
vi.mock('../session/session', () => ({ useSession: () => ({ member: mocks.member }) }))
vi.mock('@/lib/playback-browser', () => ({ playbackCapabilities: () => ({ hls: true, native: true, dash: false, nativeHls: true }), playbackRequest: mocks.request, listPlaybackProviders: mocks.list, switchPlaybackProvider: mocks.swap }))
vi.mock('@/lib/cast-sender', () => ({ createCastSender: () => mocks.cast, castContentType: (type: string) => type }))
vi.mock('@/lib/subtitles-browser', () => ({ discoverSubtitles: (...args: unknown[]) => mocks.subs(...args), pageSubtitles: (...args: unknown[]) => mocks.page(...args), prepareSubtitle: (...args: unknown[]) => mocks.prepare(...args), fetchSubtitlePreference: (...args: unknown[]) => mocks.pref(...args), saveSubtitlePreference: (...args: unknown[]) => mocks.savePref(...args) }))
vi.mock('@/lib/playback-progress', () => ({ readPlaybackProgress: async () => 0, writePlaybackProgress: mocks.write, PROGRESS_SYNC_INTERVAL_MS: 25000, hasMeaningfulProgressChange: () => true }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@consumit/ui', () => ({
  createQualityPreference: () => ({ choose: (option: { height: number }) => localStorage.setItem('consumit.player.quality-height', String(option.height)) }),
  readQualityPreference: () => { const value = Number(localStorage.getItem('consumit.player.quality-height')); return value >= 144 && value <= 4320 ? value : null },
  SUBTITLE_LANGUAGES_EVENT: 'consumit:test-languages-changed',
  readStoredSubtitleLanguages: () => JSON.parse(window.localStorage.getItem('consumit.player.subtitle-languages') ?? '[]') as string[],
  Button: ({ children, loading, onClick }: { children: ReactNode; loading?: boolean; onClick: () => void }) => <button disabled={loading} onClick={onClick}>{children}</button>,
  Toggle: ({ checked, label, onCheckedChange }: { checked: boolean; label: string; onCheckedChange?: (checked: boolean) => void }) => <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onCheckedChange?.(!checked)} />,
  ConsumitPlayer: ({ qualityOptions, onQualityChange, source, onServerChange, serverOptions, serverAuto, onServerAuto, onServerRequest, serverError, serverLoading, serverBusy, selectedServer, extraSubtitles, resumeAt, resumePlaying, castAvailable, castConnected, onCastClick, onSourceError, onEnded, onPlay, onPause, onTimeUpdate, onSeeking, onSubtitleRequest, onSubtitlePage, onSubtitleCandidateSelect, subtitleDelayMs, onSubtitleDelayMsChange }: { qualityOptions?: { value: string; label: string }[]; onQualityChange?: (value: string) => void; source?: DirectMediaSource; onServerChange?: (value: string) => void; serverOptions?: { value: string; label: string }[]; serverAuto?: boolean; onServerAuto?: () => void; onServerRequest?: () => void; serverError?: string | null; serverLoading?: boolean; serverBusy?: boolean; selectedServer?: string; extraSubtitles?: { id: string }[]; resumeAt?: number; resumePlaying?: boolean; castAvailable?: boolean; castConnected?: boolean; onCastClick?: () => void; onSourceError?: (reason: 'network' | 'media' | 'gone') => void; onEnded?: () => void; onPlay?: () => void; onPause?: () => void; onTimeUpdate?: (event: { currentTarget: { currentTime: number; duration: number } }) => void; onSeeking?: (event: { currentTarget: { currentTime: number; duration: number } }) => void; onSubtitleRequest?: () => void; onSubtitlePage?: (lang: string, cursor: number) => Promise<unknown>; onSubtitleCandidateSelect?: (candidate: { id: string; label: string; language: string; provider: string }) => Promise<unknown>; subtitleDelayMs?: number; onSubtitleDelayMsChange?: (value: number) => void }) => (
    <div data-testid="player" data-server-auto={String(serverAuto)} data-server={selectedServer} data-source={mocks.playerSources(source)?.src} data-extra={(extraSubtitles ?? []).map((track) => track.id).join(',')} data-delay={subtitleDelayMs ?? 'uncontrolled'} data-resume-at={resumeAt ?? 'uncontrolled'} data-resume-playing={String(resumePlaying)} data-cast-connected={String(castConnected)}>{(qualityOptions ?? []).map(option => <button key={option.value} onClick={() => onQualityChange?.(option.value)}>{option.label}</button>)}{onServerRequest ? <button onClick={onServerRequest}>open-servers</button> : null}{onServerAuto ? <button disabled={serverBusy} onClick={onServerAuto}>Auto server</button> : null}{serverLoading ? <p>Finding servers…</p> : null}{serverError ? <p>{serverError}</p> : null}{(serverOptions ?? []).map((option) => <button disabled={serverBusy} key={option.value} onClick={() => onServerChange?.(option.value)}>{option.label}</button>)}{castAvailable ? <button onClick={() => onCastClick?.()}>simulate-cast</button> : null}<button onClick={() => onSubtitleRequest?.()}>simulate-captions</button><button onClick={() => void onSubtitlePage?.('en', 0)}>simulate-track-page</button><button onClick={() => void onSubtitleCandidateSelect?.({ id: 'candidate', label: 'English', language: 'en', provider: 'yify' }).then(mocks.selected)}>simulate-track-select</button><button onClick={() => onSourceError?.('network')}>simulate-error</button><button onClick={() => onSourceError?.('gone')}>simulate-gone</button><button onClick={() => onEnded?.()}>simulate-ended</button><button onClick={() => onPlay?.()}>simulate-play</button><button onClick={() => onPause?.()}>simulate-pause</button><button onClick={() => onTimeUpdate?.({ currentTarget: { currentTime: 42, duration: 100 } })}>simulate-time</button><button onClick={() => onSeeking?.({ currentTarget: { currentTime: 600, duration: 1200 } })}>simulate-seek</button><button onClick={() => onSubtitleDelayMsChange?.(1500)}>simulate-delay</button></div>
  ),
  buttonVariants: () => '',
}))

const session = { id: 'fixture-session', ref: { kind: 'movie', id: movieDetail.id }, source: { id: 'fixture-source', expiresAt: new Date(Date.now() + 60000).toISOString() } }

/** Playback resolve settled with a session (replaces the removed "Source ready" copy). */
async function waitForSourceResolved() {
  await waitFor(() => expect(document.querySelector('[data-consumit-player-screen]')).toHaveAttribute('data-session', 'ready'))
}

describe('watch request lifecycle', () => {
  it('lets a viewer choose a server after automatic startup fails, before any session exists', async () => {
    const selected = { ...session, source: { ...session.source, type: 'native', delivery: 'direct', providerId: 'backup', src: 'https://media.example/backup.mp4' } }
    mocks.request.mockReset().mockRejectedValueOnce(new Error('Automatic startup unavailable')).mockResolvedValueOnce(selected)
    mocks.list.mockReset().mockResolvedValue([{ id: 'backup', label: 'Backup' }])
    mocks.swap.mockReset()
    render(<WatchPlayback title={movieDetail} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Choose another server' }))
    await screen.findByRole('option', { name: 'Backup' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Server' }), { target: { value: 'backup' } })
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', selected.source.src))
    expect(mocks.request).toHaveBeenLastCalledWith('resolve', expect.objectContaining({ ref: session.ref, providerId: 'backup' }), expect.any(AbortSignal))
    expect(mocks.swap).not.toHaveBeenCalled()
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'false')
  })
  it('renders an external frame without native controls, renewal or fabricated progress', async () => {
    const initial = { ...session, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'apiplayerframe', src: 'https://apiplayer.ru/embed/movie/' + movieDetail.id, expiresAt: new Date(Date.now() + 500).toISOString() } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'apiplayerframe', label: 'APIPlayer' }, { id: 'backup', label: 'Backup' }])
    mocks.write.mockClear()
    const view = render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    const frame = screen.getByTitle(movieDetail.title + ' external player')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('href', initial.source.src)
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    fireEvent.load(frame)
    expect(screen.getByText(/Progress sync is unavailable/)).toBeInTheDocument()
    fireEvent(window, new Event('pagehide'))
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(mocks.request).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('switches from a frame back to direct playback through the outside Server control', async () => {
    const initial = { ...session, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'apiplayerframe', src: 'https://apiplayer.ru/embed/movie/' + movieDetail.id } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'apiplayerframe', label: 'APIPlayer' }, { id: 'backup', label: 'Backup' }])
    mocks.swap.mockReset().mockResolvedValue({ ...initial, source: { ...initial.source, type: 'native', delivery: 'direct', providerId: 'backup', src: 'https://media.example/backup.mp4' } })
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    fireEvent.focus(screen.getByRole('combobox', { name: 'Server' }))
    await screen.findByRole('option', { name: 'Backup' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Server' }), { target: { value: 'backup' } })
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://media.example/backup.mp4'))
    expect(screen.queryByTitle(movieDetail.title + ' external player')).not.toBeInTheDocument()
  })
  it.each([true, false])('switches servers on demand, retaining position and play intent (%s)', async playing => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', src: 'https://media.example/primary.mp4' } }
    const next = { ...initial, source: { ...initial.source, providerId: 'backup', src: 'https://media.example/backup.mp4' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'primary', label: 'Primary' }, { id: 'backup', label: 'Backup' }])
    let release!: (value: unknown) => void
    mocks.swap.mockReset().mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    expect(mocks.list).not.toHaveBeenCalled()
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'true')
    act(() => screen.getByText('open-servers').click())
    await screen.findByText('Backup')
    act(() => { screen.getByText('simulate-time').click(); screen.getByText('simulate-play').click(); screen.getByText('Backup').click() })
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledWith(session.id, { providerId: 'backup', preferences: { qualityHeight: null } }, expect.any(AbortSignal)))
    // Retain a seek/pause made while the old source is still playing.
    act(() => { screen.getByText('simulate-seek').click(); if (!playing) screen.getByText('simulate-pause').click(); release(next) })
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', next.source.src))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '600')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', String(playing))
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'false')
    expect(screen.getByTestId('player')).toHaveAttribute('data-server', 'backup')
    act(() => screen.getByText('Auto server').click())
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'true')
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', next.source.src)
    expect(mocks.swap).toHaveBeenCalledTimes(1)
    expect(mocks.list).toHaveBeenCalledTimes(1)
  })
  it.each([true, false])('explains a failed manual choice and retains playback or uses fallback (%s)', async fallback => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', src: 'https://media.example/primary.mp4' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'primary', label: 'Primary' }, { id: 'broken', label: 'Broken' }, { id: 'backup', label: 'Backup' }])
    mocks.swap.mockReset().mockRejectedValue(new Error('unavailable'))
    if (fallback) mocks.swap.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ ...initial, source: { ...initial.source, providerId: 'backup', src: 'https://media.example/backup.mp4' } })
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    act(() => screen.getByText('open-servers').click())
    await screen.findByText('Broken')
    act(() => screen.getByText('Broken').click())
    await screen.findByText(fallback ? 'Playback resumed from another source.' : 'Couldn’t switch sources. Playback is still available.')
    expect(screen.getByTestId('player')).toHaveAttribute('data-server', fallback ? 'backup' : 'primary')
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', fallback ? 'https://media.example/backup.mp4' : initial.source.src)
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('retries a failed server list without interrupting playback and sends the anime audio variant', async () => {
    const initial = { ...session, ref: { kind: 'anime', id: 1, episode: 1 }, source: { ...session.source, providerId: 'primary', src: 'https://media.example/anime.mp4' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce([{ id: 'backup', label: 'Backup' }])
    render(<WatchPlayback title={{ ...movieDetail, kind: 'anime', id: 1 }} episode={{ episodeNumber: 1, title: 'First episode' }} audioLanguage="en" />)
    await waitForSourceResolved()
    act(() => screen.getByText('open-servers').click())
    await screen.findByText('Servers are unavailable right now. Playback can continue.')
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src)
    act(() => screen.getByText('open-servers').click())
    await screen.findByText('Backup')
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ ref: initial.ref, audioLanguage: 'en' }), expect.any(AbortSignal))
    expect(screen.queryByText('Servers are unavailable right now. Playback can continue.')).not.toBeInTheDocument()
  })
  it('keeps automatic recovery after a manual choice and reflects the replacement server', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', src: 'https://media.example/primary.mp4' } }
    const recovered = { ...initial, source: { ...initial.source, providerId: 'backup', src: 'https://media.example/backup.mp4' } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValueOnce(recovered)
    mocks.list.mockReset().mockResolvedValue([{ id: 'primary', label: 'Primary' }, { id: 'backup', label: 'Backup' }])
    mocks.swap.mockReset()
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    act(() => screen.getByText('open-servers').click())
    await screen.findByText('Primary')
    act(() => { screen.getByText('Primary').click(); screen.getByText('simulate-time').click(); screen.getByText('simulate-pause').click() })
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'false')
    expect(mocks.swap).not.toHaveBeenCalled()
    act(() => screen.getByText('simulate-gone').click())
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-server', 'backup'))
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'true')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'false')
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(mocks.request.mock.calls[1]?.[0]).toBe(`${session.id}/fallback`)
  })
  it.each([true, false])('changes quality within one server and retains playback on failure (success: %s)', async success => {
    localStorage.removeItem('consumit.player.quality-height')
    const initial = { ...session, source: { ...session.source, providerId: 'wecollege-miami', src: 'https://edge.example/1080', qualityHint: '1080p', qualityHeights: [2160, 1080, 720, 480] } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.swap.mockReset()
    if (success) mocks.swap.mockResolvedValue({ ...initial, source: { ...initial.source, src: 'https://edge.example/720', qualityHint: '720p' } })
    else mocks.swap.mockRejectedValue(new Error('unavailable'))
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    act(() => { screen.getByText('simulate-time').click(); screen.getByText('simulate-play').click() })
    act(() => { screen.getByText('720p').click() })
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledWith('fixture-session', { providerId: 'wecollege-miami', preferences: { qualityHeight: 720, audioLanguage: 'en' } }, expect.any(AbortSignal)))
    if (success) {
      await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://edge.example/720'))
      expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
      expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
    } else {
      await screen.findByText('Couldn’t change quality. Keeping the current stream.')
      expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://edge.example/1080')
      expect(mocks.swap).toHaveBeenCalledTimes(1)
    }
    localStorage.removeItem('consumit.player.quality-height')
  })
  beforeEach(() => {
    mocks.write.mockClear()
    mocks.cast.available = false
    mocks.cast.status = null
    mocks.cast.ensure.mockReset().mockImplementation(async () => mocks.cast.available)
    mocks.cast.requestSession.mockReset().mockResolvedValue(undefined)
    mocks.cast.endSession.mockReset()
    mocks.cast.loadMedia.mockReset().mockResolvedValue(undefined)
    mocks.subs.mockReset().mockImplementation(async (_ref, _signal, onEvent) => { onEvent({ type: 'snapshot', searchId: 'fixture-search', languages: [{ code: 'en', count: 1 }] }); onEvent({ type: 'complete', searchId: 'fixture-search', languages: [{ code: 'en', count: 1 }] }) })
    mocks.page.mockReset().mockResolvedValue({ tracks: [], total: 0, nextCursor: null })
    mocks.prepare.mockReset().mockResolvedValue({ id: 'sub-yify-en', label: 'English', language: 'en', url: 'https://api.example/v1/subtitles/file/abc' })
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
    await waitForSourceResolved()
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('offers retry with return when autostart cannot resolve', async () => {
    mocks.request.mockReset().mockRejectedValueOnce(new Error('No source')).mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByRole('alert')).toHaveTextContent('No source')
    screen.getByRole('button', { name: 'Try again' }).click()
    await waitForSourceResolved()
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })
  it('keeps provider rosters out of ordinary playback', async () => {
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([{ id: 'secret-provider', label: 'secret-provider' }])
    mocks.swap.mockReset()
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.swap).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'secret-provider' })).not.toBeInTheDocument()
  })
  it('prepares a discovered subtitle only after selection', async () => {
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    expect(mocks.subs).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'simulate-captions' }).click()
    await waitFor(() => expect(mocks.subs).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, expect.any(AbortSignal), expect.any(Function)))
    expect(screen.getByTestId('player')).toHaveAttribute('data-extra', '')
    screen.getByRole('button', { name: 'simulate-track-select' }).click()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-extra', 'sub-yify-en'))
  })
  it('reuses the attached subtitle ID when another candidate prepares the same file', async () => {
    mocks.selected.mockReset()
    mocks.request.mockReset().mockResolvedValue(session)
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-captions' }).click()
    await waitFor(() => expect(mocks.subs).toHaveBeenCalled())
    screen.getByRole('button', { name: 'simulate-track-select' }).click()
    await waitFor(() => expect(mocks.selected).toHaveBeenCalledTimes(1))
    mocks.prepare.mockResolvedValue({ id: 'another-candidate', label: 'English', language: 'en', url: 'https://api.example/v1/subtitles/file/abc' })
    screen.getByRole('button', { name: 'simulate-track-select' }).click()
    await waitFor(() => expect(mocks.selected).toHaveBeenCalledTimes(2))
    expect(mocks.selected.mock.calls[1]?.[0]).toMatchObject({ id: 'sub-yify-en' })
    expect(screen.getByTestId('player')).toHaveAttribute('data-extra', 'sub-yify-en')
  })
  it('uses stored preferred languages to rank paged tracks', async () => {
    window.localStorage.setItem('consumit.player.subtitle-languages', JSON.stringify(['ar', 'fr']))
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      await waitForSourceResolved()
      screen.getByRole('button', { name: 'simulate-captions' }).click()
      await waitFor(() => expect(mocks.subs).toHaveBeenCalled())
      screen.getByRole('button', { name: 'simulate-track-page' }).click()
      await waitFor(() => expect(mocks.page).toHaveBeenCalledWith('fixture-search', 'en', 0, ['ar', 'fr'], expect.any(AbortSignal)))
    } finally {
      window.localStorage.removeItem('consumit.player.subtitle-languages')
    }
  })
  it('sends the stored audio preference on resolve instead of the default', async () => {
    window.localStorage.setItem('consumit.player.audio-language', 'hi')
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      await waitForSourceResolved()
      expect(mocks.request).toHaveBeenCalled()
      expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({ audioLanguage: 'hi' })
    } finally {
      window.localStorage.removeItem('consumit.player.audio-language')
    }
  })
  it('renews the same source again after a short expiry', async () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString()
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/orig.m3u8', expiresAt } }
    // Same provider re-mints different URLs (fresh signatures), so the
    // identical-URL check alone would refresh forever on an unplayable
    // provider instead of spending the fallback budget.
    const refreshed = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/remint.m3u8', expiresAt } }
    const refreshedAgain = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/remint-again.m3u8', expiresAt } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed).mockResolvedValue(refreshedAgain)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
    expect(mocks.request.mock.calls[1]?.[0]).toBe(`${session.id}/refresh`)
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(3))
    expect(mocks.request.mock.calls[2]?.[0]).toBe(`${session.id}/refresh`)
  })
  it('keeps a healthy stream attached during URL renewal and uses the latest lease on failure', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', src: 'https://media.example/orig.m3u8', expiresAt: new Date(Date.now() + 16000).toISOString() } }
    const renewed = { ...session, source: { ...initial.source, src: 'https://media.example/renewed.m3u8', expiresAt: new Date(Date.now() + 60000).toISOString() } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(renewed)
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-time' }).click()
    screen.getByRole('button', { name: 'simulate-pause' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2), { timeout: 4000 })
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src)
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', renewed.source.src))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'false')
    expect(mocks.request).toHaveBeenCalledTimes(2)
    // Once that standby lease has been tried, another failure uses recovery.
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(mocks.request.mock.calls.some((call) => call[0] === `${session.id}/fallback`)).toBe(true))
  })
  it('attaches the renewed lease if the active stream fails while renewal is in flight', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', src: 'https://media.example/orig.m3u8', expiresAt: new Date(Date.now() + 16000).toISOString() } }
    const renewed = { ...session, source: { ...initial.source, src: 'https://media.example/renewed.m3u8', expiresAt: new Date(Date.now() + 60000).toISOString() } }
    let release!: (value: typeof renewed) => void
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-time' }).click()
    screen.getByRole('button', { name: 'simulate-play' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2), { timeout: 4000 })
    screen.getByRole('button', { name: 'simulate-error' }).click()
    release(renewed)
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', renewed.source.src))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })
  it('gives the attached relay engine the fresh lease without changing its source object', async () => {
    const initial = { ...session, source: { ...session.source, type: 'hls' as const, delivery: 'relay' as const, src: 'https://media.example/old.m3u8', expiresAt: new Date(Date.now() + 61000).toISOString() } }
    const renewed = { ...initial, source: { ...initial.source, src: 'https://media.example/fresh.m3u8', expiresAt: new Date(Date.now() + 1800000).toISOString() } }
    mocks.playerSources.mockClear()
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(renewed)
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    const attached = mocks.playerSources.mock.calls.at(-1)?.[0]
    expect(attached?.relayLease?.()?.src).toBe(initial.source.src)
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2), { timeout: 4000 })
    await waitFor(() => expect(attached?.relayLease?.()?.src).toBe(renewed.source.src))
    expect(mocks.playerSources.mock.calls.at(-1)?.[0]).toBe(attached)
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src)
  })
  it.each([
    { providerId: 'backup', type: 'hls', delivery: 'direct' },
    { providerId: 'primary', type: 'native', delivery: 'direct' },
    { providerId: 'primary', type: 'hls', delivery: 'relay' },
    { providerId: 'primary', type: 'hls', delivery: 'proxy' },
  ])('attaches a changed provider, media type, or delivery path during renewal: %j', async (replacement) => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', type: 'hls', delivery: 'direct', src: 'https://media.example/orig.m3u8', expiresAt: new Date(Date.now() + 16000).toISOString() } }
    const renewed = { ...session, source: { ...initial.source, ...replacement, src: 'https://media.example/renewed.m3u8', expiresAt: new Date(Date.now() + 60000).toISOString() } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(renewed)
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', renewed.source.src), { timeout: 4000 })
  })
  it('retains position and play intent across automatic recovery', async () => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/orig.m3u8' } }
    const renewed = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/remint.m3u8' } }
    mocks.request.mockReset().mockImplementation(async (path: string) => path === 'resolve' ? initial : renewed)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
    screen.getByRole('button', { name: 'simulate-time' }).click()
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(`${session.id}/refresh`, expect.objectContaining({ reason: 'network' }), expect.any(AbortSignal)))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
  })
  it('retains an unfinished seek across source recovery', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', src: 'https://media.example/orig.m3u8' } }
    const replacement = { ...session, source: { ...session.source, providerId: 'backup', src: 'https://media.example/backup.m3u8' } }
    mocks.request.mockReset().mockImplementation(async (path: string) => path === 'resolve' ? initial : replacement)
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-time' }).click()
    screen.getByRole('button', { name: 'simulate-seek' }).click()
    screen.getByRole('button', { name: 'simulate-gone' }).click()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', replacement.source.src))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '600')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
  })
  it('retains a paused position across automatic recovery', async () => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/orig.m3u8' } }
    const renewed = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/remint.m3u8' } }
    mocks.request.mockReset().mockImplementation(async (path: string) => path === 'resolve' ? initial : renewed)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-time' }).click()
    screen.getByRole('button', { name: 'simulate-pause' }).click()
    screen.getByRole('button', { name: 'simulate-error' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(`${session.id}/refresh`, expect.objectContaining({ reason: 'network' }), expect.any(AbortSignal)))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'false')
  })
  it('switches once to the pinned provider after autostart', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary' } }
    const pinned = { ...session, source: { ...session.source, providerId: 'backup' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.swap.mockReset().mockResolvedValue(pinned)
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} pinnedProvider="backup" /></Activity>)
    await waitForSourceResolved()
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledTimes(1))
    expect(mocks.swap).toHaveBeenCalledWith(session.id, { providerId: 'backup', preferences: { qualityHeight: null } }, expect.any(AbortSignal))
  })
  it('shows a visible switching status while recovering', async () => {
    let release!: (value: unknown) => void
    mocks.request.mockReset().mockResolvedValueOnce(session).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-error' }).click()
    expect(await screen.findByText('Switching source…', { selector: '.pointer-events-none' })).toBeInTheDocument()
    await act(async () => { release({ ...session, source: { ...session.source, id: 'source-2' } }) })
    await waitFor(() => expect(screen.queryByText('Switching source…', { selector: '.pointer-events-none' })).not.toBeInTheDocument())
  })
  it('shows icon-only episode links with accessible names and persisted toggles', async () => {
    window.localStorage.clear()
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} nextHref="/watch/series/1?season=1&episode=3" prevHref="/watch/series/1?season=1&episode=1" /></Activity>)
    await waitForSourceResolved()
    const previous = screen.getByRole('link', { name: 'Previous episode' })
    const next = screen.getByRole('link', { name: 'Next episode' })
    expect(previous).toHaveAttribute('href', '/watch/series/1?season=1&episode=1')
    expect(next).toHaveAttribute('href', '/watch/series/1?season=1&episode=3')
    expect(previous.textContent).toBe('')
    expect(next.textContent).toBe('')
    expect(previous.querySelector('svg')).toHaveClass('lucide-skip-back')
    expect(next.querySelector('svg')).toHaveClass('lucide-skip-forward')
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
      await waitForSourceResolved()
      screen.getByRole('button', { name: 'simulate-ended' }).click()
      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/watch/series/1?season=1&episode=3'))
    } finally {
      window.localStorage.clear()
    }
  })
  it('writes one durable completion attempt across duplicate end events and a new one for a rewatch', async () => {
    mocks.member = { id: 'member-1' }
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.pref.mockReset().mockResolvedValue({ trackId: null, offsetMs: 0 })
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      await waitForSourceResolved()
      screen.getByRole('button', { name: 'simulate-time' }).click()
      screen.getByRole('button', { name: 'simulate-ended' }).click()
      screen.getByRole('button', { name: 'simulate-ended' }).click()
      await waitFor(() => expect(mocks.write.mock.calls.filter((call) => call[3] === true)).toHaveLength(1))
      const first = mocks.write.mock.calls.find((call) => call[3] === true)!
      expect(first[5]).toBe(true)
      expect(first[6]).toMatch(/^[a-f0-9-]{36}$/)
      screen.getByRole('button', { name: 'simulate-play' }).click()
      screen.getByRole('button', { name: 'simulate-ended' }).click()
      await waitFor(() => expect(mocks.write.mock.calls.filter((call) => call[3] === true)).toHaveLength(2))
      const second = mocks.write.mock.calls.filter((call) => call[3] === true)[1]!
      expect(second[6]).not.toBe(first[6])
    } finally { mocks.member = null }
  })
  it('repeats a completion after an older in-flight progress write settles', async () => {
    mocks.member = { id: 'member-1' }
    let release!: () => void
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.pref.mockReset().mockResolvedValue({ trackId: null, offsetMs: 0 })
      mocks.write.mockReset().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve })).mockResolvedValue(undefined)
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      await waitForSourceResolved()
      screen.getByRole('button', { name: 'simulate-time' }).click()
      screen.getByRole('button', { name: 'simulate-pause' }).click()
      await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1))
      screen.getByRole('button', { name: 'simulate-ended' }).click()
      await waitFor(() => expect(mocks.write.mock.calls.filter((call) => call[3] === true)).toHaveLength(1))
      release()
      await waitFor(() => expect(mocks.write.mock.calls.filter((call) => call[3] === true)).toHaveLength(2))
      const completions = mocks.write.mock.calls.filter((call) => call[3] === true)
      expect(completions[0]![6]).toBe(completions[1]![6])
    } finally { mocks.member = null }
  })
  it('loads the stored sync offset for members and persists nudges', async () => {
    mocks.member = { id: 'member-1' }
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.pref.mockReset().mockResolvedValue({ trackId: null, offsetMs: 1500 })
      mocks.savePref.mockReset().mockResolvedValue(undefined)
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      await waitForSourceResolved()
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
    await waitForSourceResolved()
    expect(screen.getByTestId('player')).toHaveAttribute('data-delay', 'uncontrolled')
    expect(mocks.pref).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'simulate-delay' }).click()
    expect(mocks.savePref).not.toHaveBeenCalled()
  })
  it('casts the session to the TV and shows the casting state', async () => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', type: 'native', src: 'https://media.example/orig.m3u8' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.cast.available = true
    const view = render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-cast' }).click()
    await waitFor(() => expect(mocks.cast.requestSession).toHaveBeenCalledTimes(1))
    mocks.cast.status = { connected: true, deviceName: 'Living Room TV', position: 12, duration: 100, playing: true, volume: 0.9, muted: false }
    mocks.cast.emit()
    await waitFor(() => expect(mocks.cast.loadMedia).toHaveBeenCalledTimes(1))
    expect(mocks.cast.loadMedia).toHaveBeenCalledWith(expect.objectContaining({ contentId: 'https://media.example/orig.m3u8', position: 0, title: movieDetail.title }))
    expect(mocks.cast.loadMedia.mock.calls[0]?.[0]?.customData).toMatchObject({ sessionId: session.id, providerId: 'primary' })
    expect(view.container.querySelector('[data-consumit-casting]')).toHaveTextContent('Living Room TV')
  })
  it('resumes the phone at the TV position after disconnect', async () => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', type: 'native', src: 'https://media.example/orig.m3u8' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.cast.available = true
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-cast' }).click()
    await waitFor(() => expect(mocks.cast.requestSession).toHaveBeenCalledTimes(1))
    mocks.cast.status = { connected: true, deviceName: 'Living Room TV', position: 30, duration: 100, playing: true, volume: 0.9, muted: false }
    mocks.cast.emit()
    await waitFor(() => expect(mocks.cast.loadMedia).toHaveBeenCalledTimes(1))
    mocks.cast.status = null
    mocks.cast.emit()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '30'))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
  })
  it('reloads cast media when the source renews', async () => {
    const expiresAt = new Date(Date.now() + 2000).toISOString()
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', type: 'native', src: 'https://media.example/orig.m3u8', expiresAt } }
    const renewed = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', type: 'native', src: 'https://media.example/remint.m3u8', expiresAt: new Date(Date.now() + 60000).toISOString() } }
    mocks.request.mockReset().mockImplementation(async (path: string) => path === 'resolve' ? initial : renewed)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.cast.available = true
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-cast' }).click()
    await waitFor(() => expect(mocks.cast.requestSession).toHaveBeenCalledTimes(1))
    mocks.cast.status = { connected: true, deviceName: 'Living Room TV', position: 12, duration: 100, playing: true, volume: 0.9, muted: false }
    mocks.cast.emit()
    await waitFor(() => expect(mocks.cast.loadMedia).toHaveBeenCalledTimes(1))
    // The short lease expires mid-cast: the phone renews and reloads the TV.
    await waitFor(() => expect(mocks.cast.loadMedia).toHaveBeenCalledTimes(2), { timeout: 15000 })
    expect(mocks.cast.loadMedia.mock.calls[1]?.[0]).toMatchObject({ contentId: 'https://media.example/remint.m3u8' })
  })
  it('skips refresh and falls back immediately when the source reports gone', async () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString()
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', src: 'https://media.example/orig.m3u8', expiresAt } }
    const fallenBack = { ...session, source: { ...session.source, id: 'source-2', providerId: 'backup', src: 'https://media.example/other.m3u8', expiresAt } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(fallenBack)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-gone' }).click()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
    // No same-provider re-mint: gone bytes never come back, so the only call
    // after resolve is the fallback, carrying the contract reason.
    expect(mocks.request.mock.calls[1]?.[0]).toBe(`${session.id}/fallback`)
    expect(mocks.request.mock.calls[1]?.[1]).toMatchObject({ sourceId: 'source-1', reason: 'unsupported' })
  })
})
