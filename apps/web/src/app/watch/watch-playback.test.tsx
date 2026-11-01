import { Activity, type ReactNode } from 'react'
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { movieDetail } from '@/test/catalog-fixtures'
import type { DirectMediaSource, PlayerControlAction, PlayerControlModel, PlayerMediaInput, PlayerMediaObservation, PlayerPresentation } from '@consumit/ui'
import type { CastLoadRequest } from '@/lib/cast-sender'
import { WatchPlayback } from './watch-playback'
import { experienceStorageKey, readExperience } from '@/lib/experience-storage'

const mocks = vi.hoisted(() => ({
  adsEnabled: true,
  attemptProgress: null as null | { tried: number; total: number },
  playerSources: vi.fn((source: DirectMediaSource | undefined) => source),
  read: vi.fn(async (...args: unknown[]) => { void args; return 0 }), selected: vi.fn(), request: vi.fn(), list: vi.fn(), swap: vi.fn(), subs: vi.fn(), page: vi.fn(), prepare: vi.fn(), push: vi.fn(), pref: vi.fn(), savePref: vi.fn(), write: vi.fn(async (...args: unknown[]) => { void args }), patchPreference: vi.fn(async () => {}), retryPreference: vi.fn(async () => {}), member: null as null | { id: string },
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
vi.mock('../session/session', () => ({ useOptionalSession: () => ({ member: mocks.member, status: mocks.member ? 'authenticated' : 'anonymous' }), useSession: () => ({ member: mocks.member }) }))
vi.mock('../experience/experience-provider', () => ({ useExperience: () => ({ ready: true, owner: mocks.member?.id ?? null, preferences: readExperience(null), patch: mocks.patchPreference, retry: mocks.retryPreference }) }))
vi.mock('../shared/ad-status', () => ({ useAdStatus: () => ({ enabled: mocks.adsEnabled, ready: true }) }))
vi.mock('./server-strip', () => ({ ServerStrip: () => null, frameName: (provider: { label: string }) => provider.label, serverName: (index: number) => `Server ${index + 1}` }))
vi.mock('@/lib/playback-browser', () => ({ playbackCapabilities: () => ({ hls: true, native: true, dash: false, nativeHls: true }), playbackRequest: mocks.request, runPlaybackAttempt: (input: unknown, signal: AbortSignal, progress: (value: { tried: number; total: number }) => void, previous?: { sessionId: string; failure: unknown }) => { if (mocks.attemptProgress) progress(mocks.attemptProgress); return previous ? mocks.request(`${previous.sessionId}/fallback`, previous.failure, signal) : mocks.request('resolve', input, signal) }, listPlaybackProviders: mocks.list, switchPlaybackProvider: mocks.swap }))
vi.mock('@/lib/cast-sender', () => ({ createCastSender: () => mocks.cast, castContentType: (type: string) => type }))
vi.mock('@/lib/subtitles-browser', () => ({ discoverSubtitles: (...args: unknown[]) => mocks.subs(...args), pageSubtitles: (...args: unknown[]) => mocks.page(...args), prepareSubtitle: (...args: unknown[]) => mocks.prepare(...args), fetchSubtitlePreference: (...args: unknown[]) => mocks.pref(...args), saveSubtitlePreference: (...args: unknown[]) => mocks.savePref(...args), fetchAggregatedSubtitles: async () => [] }))
vi.mock('@/lib/playback-progress', () => ({ readPlaybackProgress: mocks.read, writePlaybackProgress: mocks.write, PROGRESS_SYNC_INTERVAL_MS: 25000, hasMeaningfulProgressChange: () => true }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@consumit/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('@consumit/ui')>(),
  createQualityPreference: () => ({ choose: (option: { height: number }) => localStorage.setItem('consumit.player.quality-height', String(option.height)) }),
  readQualityPreference: () => { const value = Number(localStorage.getItem('consumit.player.quality-height')); return value >= 144 && value <= 4320 ? value : null },
  SUBTITLE_LANGUAGES_EVENT: 'consumit:test-languages-changed',
  readStoredSubtitleLanguages: () => JSON.parse(window.localStorage.getItem('consumit.player.subtitle-languages') ?? '[]') as string[],
  Button: ({ children, className, loading, onClick }: { children: ReactNode; className?: string; loading?: boolean; onClick: () => void }) => <button className={className} disabled={loading} onClick={onClick}>{children}</button>,
  Toggle: ({ checked, label, onCheckedChange }: { checked: boolean; label: string; onCheckedChange?: (checked: boolean) => void }) => <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onCheckedChange?.(!checked)} />,
  ConsumitPlayer: ({ title, media, presentation, controls, onControlAction, onSourceError, onMediaObservation }: { title: string; media?: PlayerMediaInput; presentation?: PlayerPresentation; controls?: PlayerControlModel; onControlAction?: (action: PlayerControlAction) => void; onSourceError?: (reason: 'network' | 'media' | 'gone') => void; onMediaObservation?: (observation: PlayerMediaObservation) => void }) => {
    const send = (action: PlayerControlAction) => onControlAction?.(action)
    const sourceSelection = controls?.sourceSelection
    const captions = controls?.captions
    const cast = controls?.cast
    return <>
      {presentation?.recovery ? <div data-testid="watch-recovery" data-recovery-phase={presentation.recovery.phase} data-recovery-kind={presentation.recovery.kind} data-checkpoint={presentation.recovery.checkpointSeconds ?? ''}>{presentation.recovery.phase === 'failed' ? <div role="alert"><h2>{presentation.recovery.kind === 'startup' ? 'Couldn’t start playback' : presentation.recovery.kind === 'external' ? 'This player couldn’t load' : 'Playback was interrupted'}</h2><p>{presentation.recovery.message}</p><button onClick={() => send({ type: 'retry' })}>Try again with Auto</button><button onClick={() => { send({ type: 'recovery-choose-source' }); send({ type: 'source-request' }) }}>Choose a source</button><a href={presentation.backHref}>Return to title</a>{presentation.recoveryExtraAction}</div> : <div role="status"><p>{presentation.recovery.kind === 'startup' ? 'Finding a source' : 'Trying another source'}{presentation.recovery.progress ? ` · ${presentation.recovery.progress.checked} of ${presentation.recovery.progress.total} checked` : ''}</p><button onClick={() => send({ type: 'recovery-cancel' })}>Cancel</button><button onClick={() => { send({ type: 'recovery-cancel' }); send({ type: 'recovery-choose-source' }); send({ type: 'source-request' }) }}>Choose a source</button></div>}</div> : null}
      <div data-testid="player" data-preparing={String(presentation?.preparing)} data-preparation-poster={presentation?.preparationPosterSrc ?? presentation?.posterSrc ?? ''} data-auto-skip={String(controls?.playback?.autoSkip)} data-title={title} data-top-meta={typeof presentation?.topMeta === 'string' ? presentation.topMeta : undefined} data-server-auto={String(sourceSelection?.auto)} data-server={sourceSelection?.selected} data-source={mocks.playerSources(media?.source)?.src} data-extra={(captions?.extraTracks ?? []).map((track) => track.id).join(',')} data-subtitle-search-id={captions?.discovery?.searchId ?? 'none'} data-delay={captions?.sync?.delayMs ?? 'uncontrolled'} data-resume-at={media?.resume?.positionSeconds ?? 'uncontrolled'} data-resume-playing={String(media?.resume?.playing)} data-cast-connected={String(cast?.connected)}>{presentation?.watchStatus}{presentation?.animeAudioControl ? <div className="consumit-player-anime-audio"><span>Anime audio</span>{presentation.animeAudioControl}</div> : null}{presentation?.watchSettings}{controls?.playback?.previousEpisodeAvailable ? <button onClick={() => send({ type: 'previous-episode' })}>Previous episode</button> : null}{controls?.playback?.nextEpisodeAvailable ? <button onClick={() => send({ type: 'next-episode' })}>Next episode</button> : null}{(controls?.quality?.options ?? []).map(option => <button key={option.value} onClick={() => send({ type: 'quality-change', value: option.value })}>{option.label}</button>)}{sourceSelection?.requestAvailable ? <button onClick={() => send({ type: 'source-request' })}>open-servers</button> : null}{sourceSelection?.autoAvailable ? <button disabled={sourceSelection.busy} onClick={() => send({ type: 'source-auto' })}>Auto server</button> : null}{sourceSelection?.loading ? <p>Finding servers…</p> : null}{sourceSelection?.error ? <p>{sourceSelection.error}</p> : null}{(sourceSelection?.options ?? []).map(option => <button disabled={sourceSelection?.busy} key={option.value} onClick={() => send({ type: 'source-change', value: option.value })}>{option.label}</button>)}{cast?.available ? <button onClick={() => send({ type: 'cast-click' })}>simulate-cast</button> : null}<button onClick={() => send({ type: 'subtitle-request' })}>simulate-captions</button><button onClick={() => void captions?.page?.('en', 0)}>simulate-track-page</button><button onClick={() => { const pending = captions?.prepare?.({ id: 'candidate', label: 'English', language: 'en', provider: 'yify' }); if (pending) void pending.then(mocks.selected).catch(() => {}) }}>simulate-track-select</button><button onClick={() => onSourceError?.('network')}>simulate-error</button><button onClick={() => onSourceError?.('gone')}>simulate-gone</button><button onClick={() => onMediaObservation?.({ type: 'ended', positionSeconds: 42, durationSeconds: 100 })}>simulate-ended</button><button onClick={() => onMediaObservation?.({ type: 'play', positionSeconds: 42, durationSeconds: 100 })}>simulate-play</button><button onClick={() => onMediaObservation?.({ type: 'pause', positionSeconds: 42, durationSeconds: 100 })}>simulate-pause</button><button onClick={() => onMediaObservation?.({ type: 'time-update', positionSeconds: 42, durationSeconds: 100 })}>simulate-time</button><button onClick={() => onMediaObservation?.({ type: 'seeking', positionSeconds: 600, durationSeconds: 1200 })}>simulate-seek</button><button onClick={() => send({ type: 'subtitle-delay-change', delayMs: 1500 })}>simulate-delay</button></div>
    </>
  },
  buttonVariants: () => '',
}))

const session = { id: 'fixture-session', ref: { kind: 'movie', id: movieDetail.id }, source: { id: 'fixture-source', expiresAt: new Date(Date.now() + 60000).toISOString() } }

/** Playback resolve settled with a session (replaces the removed "Source ready" copy). */
async function waitForSourceResolved() {
  await waitFor(() => expect(document.querySelector('[data-consumit-player-screen]')).toHaveAttribute('data-session', 'ready'))
}

describe('watch request lifecycle', () => {
  it('defaults automatic intro and outro skipping to off', async () => {
    const key = 'consumit.player.auto-skip'
    const previous = localStorage.getItem(key)
    localStorage.removeItem(key)
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    const view = render(<WatchPlayback title={movieDetail} />)
    try {
      await waitForSourceResolved()
      expect(screen.getByTestId('player')).toHaveAttribute('data-auto-skip', 'false')
    } finally {
      view.unmount()
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
    }
  })
  it('does not send stored personal server orders to playback or the server roster', async () => {
    const key = experienceStorageKey(null)
    const previous = localStorage.getItem(key)
    localStorage.setItem(key, JSON.stringify({ ...readExperience(null), serverOrders: { movie: ['backup', 'primary'], series: [], anime: [] } }))
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    const view = render(<WatchPlayback title={movieDetail} />)
    try {
      await waitForSourceResolved()
      await waitFor(() => expect(mocks.list).toHaveBeenCalled())
      expect(mocks.request.mock.calls[0]![1].preferences).not.toHaveProperty('providerOrder')
      expect(mocks.list.mock.calls[0]![0].preferences).not.toHaveProperty('providerOrder')
    } finally {
      view.unmount()
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
    }
  })
  it('keeps anime audio reachable in external Sources without unsupported autoplay controls', async () => {
    mocks.request.mockReset().mockResolvedValue({ ...session, ref: { kind: 'anime', id: movieDetail.id, episode: 1 }, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'external', frameSandbox: 'restricted', src: 'https://frame.example/player' } })
    mocks.list.mockReset().mockResolvedValue([])
    render(<WatchPlayback title={{ ...movieDetail, kind: 'anime' }} episode={{ episodeNumber: 1, title: 'Episode 1' }} audioControl={<button>Choose anime audio</button>} />)
    await waitForSourceResolved()
    fireEvent.click(screen.getByRole('button', { name: 'Sources' }))
    const preferences = screen.getByRole('navigation', { name: 'Playback preferences' })
    expect(screen.getByRole('button', { name: 'Choose anime audio' }).closest('nav')).toBe(preferences)
    expect(screen.queryByRole('switch', { name: 'Autoplay next episode' })).not.toBeInTheDocument()
  })
  it('puts the SUB/DUB choice at the top of Settings playback controls', async () => {
    mocks.request.mockReset().mockResolvedValue({ ...session, ref: { kind: 'anime', id: 21, episode: 1 } })
    mocks.list.mockReset().mockResolvedValue([])
    render(<WatchPlayback title={{ ...movieDetail, kind: 'anime', id: 21 }} episode={{ episodeNumber: 1, title: 'Episode 1' }} audioControl={<button>Choose anime audio</button>} />)
    await waitForSourceResolved()

    const row = screen.getByText('Anime audio').closest('.consumit-player-anime-audio')
    expect(row).toContainElement(screen.getByRole('button', { name: 'Choose anime audio' }))
  })
  it('accepts a late plain frame after Consumit advertising is turned off', async () => {
    let resolve!: (value: unknown) => void
    mocks.request.mockReset().mockImplementationOnce(() => new Promise(done => { resolve = done }))
    mocks.list.mockReset().mockResolvedValue([{ id: 'backup', label: 'Backup' }])
    const view = render(<WatchPlayback title={movieDetail} />)
    try {
      await waitFor(() => expect(mocks.request).toHaveBeenCalled())
      mocks.adsEnabled = false; view.rerender(<WatchPlayback title={movieDetail} />)
      await act(async () => resolve({ ...session, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'external', frameSandbox: 'none', src: 'https://frame.example/player' } }))
      const frame = await screen.findByTitle(movieDetail.title + ' provider player')
      expect(frame).not.toHaveAttribute('sandbox')
      expect(screen.queryByText(/requires pop-up permissions/)).not.toBeInTheDocument()
    } finally { mocks.adsEnabled = true; view.unmount() }
  })
  it('keeps the exact anime episode context beneath the title after playback starts', async () => {
    const title = { kind: 'anime' as const, id: 21, title: "Takopi's Original Sin", year: 2025, episodeRuntimeMinutes: 24 }
    const episode = { episodeNumber: 1, title: 'To You in 2016' }
    mocks.request.mockReset().mockResolvedValue({ ...session, ref: { kind: 'anime', id: 21, episode: 1 } })
    mocks.list.mockReset().mockResolvedValue([])
    render(<WatchPlayback title={title} episode={episode} />)
    await waitForSourceResolved()
    expect(screen.getByTestId('player')).toHaveAttribute('data-title', "Takopi's Original Sin")
    expect(screen.getByTestId('player')).toHaveAttribute('data-top-meta', 'E1 — To You in 2016')
  })

  it('lets a viewer choose a server after automatic startup fails, before any session exists', async () => {
    const selected = { ...session, source: { ...session.source, type: 'native', delivery: 'direct', providerId: 'backup', src: 'https://media.example/backup.mp4' } }
    mocks.request.mockReset().mockImplementation((_route: unknown, input: { providerId?: string }) => input.providerId === 'backup' ? Promise.resolve(selected) : Promise.reject(new Error('Automatic source unavailable')))
    mocks.list.mockReset().mockResolvedValue([{ id: 'backup', label: 'Backup' }])
    mocks.swap.mockReset()
    render(<WatchPlayback title={movieDetail} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a source' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Server 1' }))
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', selected.source.src))
    expect(mocks.request).toHaveBeenLastCalledWith('resolve', expect.objectContaining({ ref: session.ref, providerId: 'backup' }), expect.any(AbortSignal))
    expect(mocks.swap).not.toHaveBeenCalled()
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'false')
  })
  it('renders an external frame without native controls, renewal or fabricated progress', async () => {
    const initial = { ...session, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'apiplayerframe', src: 'https://apiplayer.ru/embed/movie/' + movieDetail.id, expiresAt: new Date(Date.now() + 500).toISOString() } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'apiplayerframe', label: 'APIPlayer', deliveryMode: 'embed' }, { id: 'backup', label: 'Backup', deliveryMode: 'direct' }])
    mocks.write.mockClear()
    const view = render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    const frame = screen.getByTitle(movieDetail.title + ' provider player')
    expect(frame).not.toHaveAttribute('sandbox')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('href', initial.source.src)
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    fireEvent.load(frame)
    expect(screen.getByText(/Progress sync unavailable/)).toBeInTheDocument()
    fireEvent(window, new Event('pagehide'))
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(mocks.request).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('frames a sandbox-refusing provider as a plain iframe', async () => {
    const initial = { ...session, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'megaplayframe', frameSandbox: 'none', src: 'https://megaplay.buzz/videojs/stream/s-2/2142/sub' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'megaplayframe', label: 'MegaPlay' }, { id: 'backup', label: 'Backup' }])
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    const frame = screen.getByTitle(movieDetail.title + ' provider player')
    expect(frame).not.toHaveAttribute('sandbox')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('href', initial.source.src)
    fireEvent.load(frame)
    expect(screen.getByText(/Progress sync unavailable/)).toBeInTheDocument()
  })
  it('does not turn reviewed VidRift reports into member progress or next-episode navigation', async () => {
    const initial = { ...session, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'vidriftframe', src: 'https://embed.vidrift.net/embed/movie/' + movieDetail.id } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.write.mockClear()
    const view = render(<WatchPlayback title={movieDetail} nextHref="/watch/movie/551" />)
    await waitForSourceResolved()
    const frame = screen.getByTitle(movieDetail.title + ' provider player') as HTMLIFrameElement
    for (const data of [
      { type: 'vidrift:progress', tmdbId: String(movieDetail.id), mediaType: 'movie', season: null, episode: null, anilist: null, currentTime: 100, duration: 120 },
      { type: 'vidrift:progress-ended', tmdbId: String(movieDetail.id), mediaType: 'movie', season: null, episode: null, anilist: null },
    ]) act(() => { window.dispatchEvent(new MessageEvent('message', { origin: 'https://embed.vidrift.net', source: frame.contentWindow, data })) })
    fireEvent(window, new Event('pagehide'))
    view.unmount()
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('switches from a frame back to direct playback through the outside Server control', async () => {
    const initial = { ...session, source: { ...session.source, type: 'iframe', delivery: 'embed', providerId: 'apiplayerframe', src: 'https://apiplayer.ru/embed/movie/' + movieDetail.id } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'apiplayerframe', label: 'APIPlayer', deliveryMode: 'embed' }, { id: 'backup', label: 'Backup', deliveryMode: 'direct' }])
    mocks.swap.mockReset().mockResolvedValue({ ...initial, source: { ...initial.source, type: 'native', delivery: 'direct', providerId: 'backup', src: 'https://media.example/backup.mp4' } })
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    fireEvent.click(await screen.findByRole('button', { name: 'Sources' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Consumit Server/ }))
    expect(screen.queryByRole('option', { name: /APIPlayer/ })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: 'Server 1 · Backup' }))
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://media.example/backup.mp4'))
    expect(screen.queryByTitle(movieDetail.title + ' provider player')).not.toBeInTheDocument()
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
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('player')).toHaveAttribute('data-server-auto', 'true')
    act(() => screen.getByText('open-servers').click())
    await screen.findByText('Server 2')
    act(() => { screen.getByText('simulate-time').click(); screen.getByText('simulate-play').click(); screen.getByText('Server 2').click() })
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledWith(session.id, { providerId: 'backup', preferences: expect.objectContaining({ qualityHeight: null, audioLanguage: 'en', adsEnabled: true }) }, expect.any(AbortSignal)))
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
  it('uses the replacement playback session for subtitle discovery after a source switch', async () => {
    const initial = { ...session, source: { ...session.source, videoVersion: 'recording-v1', providerId: 'primary', src: 'https://media.example/primary.mp4' } }
    const replacement = { ...initial, id: 'replacement-session', source: { ...initial.source, id: 'backup-source', providerId: 'backup', src: 'https://media.example/backup.mp4' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([{ id: 'primary', label: 'Primary' }, { id: 'backup', label: 'Backup' }])
    mocks.swap.mockReset().mockResolvedValue(replacement)
    mocks.subs.mockReset().mockResolvedValue(undefined)
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    fireEvent.click(screen.getByRole('button', { name: 'simulate-captions' }))
    await waitFor(() => expect(mocks.subs).toHaveBeenCalledTimes(1))
    expect(mocks.subs.mock.calls[0]?.[5]).toBe(initial.id)

    fireEvent.click(screen.getByText('open-servers'))
    fireEvent.click(await screen.findByText('Server 2'))
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', replacement.source.src))
    await waitFor(() => expect(mocks.subs).toHaveBeenCalledTimes(2))
    expect(mocks.subs.mock.calls[1]?.[5]).toBe(replacement.id)
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
    await screen.findByText('Server 2')
    act(() => screen.getByText('Server 2').click())
    await screen.findByText(fallback ? 'Playback resumed from another source.' : 'Couldn’t switch sources. Current source is unchanged.')
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
    await screen.findByText('Servers are unavailable right now. Playback can continue.')
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', initial.source.src)
    act(() => screen.getByText('open-servers').click())
    await screen.findByText('Server 1')
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
    await screen.findByText('Server 1')
    act(() => { screen.getByText('Server 1').click(); screen.getByText('simulate-time').click(); screen.getByText('simulate-pause').click() })
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
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledWith('fixture-session', { providerId: 'wecollege-miami', preferences: { qualityHeight: 720, audioLanguage: 'en', adsEnabled: true } }, expect.any(AbortSignal)))
    if (success) {
      await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://edge.example/720'))
      expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
      expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
    } else {
      await screen.findByText('Quality unchanged. Playback continues; retry in Settings.')
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
  it('lets members retry account sync after paused progress was saved locally', async () => {
    mocks.member = { id: 'member-1' }
    mocks.write.mockReset().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('still offline')).mockResolvedValue(undefined)
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    try {
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      await waitForSourceResolved()
      act(() => {
        screen.getByRole('button', { name: 'simulate-time' }).click()
        screen.getByRole('button', { name: 'simulate-pause' }).click()
      })
      await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('Progress saved on this device')).toBeInTheDocument()

      const retry = screen.getByRole('button', { name: 'Retry account sync' })
      expect(retry).toHaveClass('min-h-[44px]')
      fireEvent.click(retry)
      await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2))
      expect(await screen.findByRole('button', { name: 'Retry account sync' })).toBeEnabled()
      expect(screen.getByText('Progress saved on this device')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry account sync' }))
      await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(3))
      expect(mocks.write.mock.calls[2]).toEqual([expect.objectContaining({ kind: 'movie', id: movieDetail.id }), 42, 100, false, 'member-1', false, undefined])
      expect(screen.queryByText('Progress saved on this device')).not.toBeInTheDocument()
    } finally {
      mocks.member = null
    }
  })
  it('keeps viewing-preference sync recovery at a 44px target', async () => {
    const title = { ...movieDetail, kind: 'series' as const, id: 1396 }
    mocks.request.mockReset().mockImplementation(async (_path, input) => ({ ...session, ref: input.ref }))
    mocks.list.mockReset().mockResolvedValue([])
    mocks.patchPreference.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    mocks.retryPreference.mockReset().mockResolvedValue(undefined)
    render(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 2, title: 'Episode two' }} nextHref="/watch/series/1396?season=1&episode=3" />)
    await waitForSourceResolved()
    fireEvent.click(screen.getByRole('switch', { name: 'Autoplay next episode' }))

    const alert = await screen.findByRole('alert')
    const retry = screen.getByRole('button', { name: 'Retry preference sync' })
    expect(retry).toHaveClass('min-h-[44px]')
    fireEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(mocks.retryPreference).toHaveBeenCalledOnce()
    expect(alert).not.toBeInTheDocument()
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
  it('offers safe Auto recovery with return when autostart cannot resolve', async () => {
    mocks.request.mockReset().mockRejectedValueOnce(new Error('No source')).mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t start this title from the available sources.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('No source')
    screen.getByRole('button', { name: 'Try again with Auto' }).click()
    expect(screen.getByRole('link', { name: 'Return to title' })).toHaveAttribute('href', `/title/${movieDetail.id}`)
    await waitForSourceResolved()
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })
  it('retains the exact episode checkpoint after startup exhaustion without showing raw errors', async () => {
    const title = { ...movieDetail, kind: 'series' as const, id: 1396 }
    const episode = { seasonNumber: 1, episodeNumber: 2, title: 'Episode two' }
    const ref = { kind: 'series', id: title.id, season: 1, episode: 2 }
    mocks.read.mockReset().mockResolvedValue(734)
    mocks.request.mockReset().mockRejectedValueOnce(new Error('CORS: https://private-provider.invalid/session')).mockResolvedValueOnce({ ...session, ref })
    mocks.list.mockReset().mockResolvedValue([])
    render(<WatchPlayback title={title} episode={episode} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t start playback')
    expect(alert).not.toHaveTextContent('private-provider.invalid')
    expect(screen.getByTestId('watch-recovery')).toHaveAttribute('data-checkpoint', '734')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '734')
    screen.getByRole('button', { name: 'Try again with Auto' }).click()
    await waitForSourceResolved()
    expect(mocks.request.mock.calls.at(-1)?.[1]).toMatchObject({ ref })
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '734')
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'true')
  })
  it('shows real progress on exhaustion and retains a paused checkpoint through Auto retry', async () => {
    const title = { ...movieDetail, kind: 'series' as const, id: 1396 }
    const episode = { seasonNumber: 1, episodeNumber: 2, title: 'Episode two' }
    const ref = { kind: 'series', id: title.id, season: 1, episode: 2 }
    const initial = { ...session, ref, source: { ...session.source, providerId: 'primary', src: 'https://media.example/episode-2.mp4' } }
    const recovered = { ...initial, source: { ...initial.source, providerId: 'backup', src: 'https://media.example/episode-2-backup.mp4' } }
    let rejectFallback!: (cause: Error) => void
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise((_, reject) => { rejectFallback = reject })).mockResolvedValueOnce(recovered)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.attemptProgress = { tried: 2, total: 6 }
    const view = render(<WatchPlayback title={title} episode={episode} />)
    try {
      await waitForSourceResolved()
      screen.getByRole('button', { name: 'simulate-time' }).click()
      screen.getByRole('button', { name: 'simulate-pause' }).click()
      screen.getByRole('button', { name: 'simulate-gone' }).click()
      expect(await screen.findByText(/Trying another source · 2 of 6 checked/)).toBeInTheDocument()
      await act(async () => rejectFallback(new Error('HTTP 502 from backup host')))
      expect(await screen.findByRole('alert')).toHaveTextContent('Playback was interrupted')
      expect(screen.getByRole('alert')).not.toHaveTextContent('HTTP 502')
      expect(screen.getByTestId('watch-recovery')).toHaveAttribute('data-checkpoint', '42')
      screen.getByRole('button', { name: 'Try again with Auto' }).click()
      await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', recovered.source.src))
      expect(mocks.request.mock.calls.at(-1)?.[1]).toMatchObject({ ref })
      expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '42')
      expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'false')
    } finally { mocks.attemptProgress = null; view.unmount() }
  })
  it('stops automatic startup search before opening manual source selection', async () => {
    let searchSignal!: AbortSignal
    mocks.request.mockReset().mockImplementation((_route: unknown, _input: unknown, signal: AbortSignal) => {
      searchSignal = signal
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    mocks.list.mockReset().mockResolvedValue([])
    render(<WatchPlayback title={movieDetail} />)
    await screen.findByRole('button', { name: 'Cancel' })
    expect(screen.getByTestId('player')).toHaveAttribute('data-preparing', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Choose a source' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Source search stopped')
    expect(searchSignal.aborted).toBe(true)
    await waitFor(() => expect(mocks.list).toHaveBeenCalled())
  })
  it('keeps the saved checkpoint clear when an interrupted source search is canceled', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', src: 'https://media.example/primary.mp4' } }
    let rejectRecovery!: (cause: Error) => void
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise((_, reject) => { rejectRecovery = reject }))
    mocks.list.mockReset().mockResolvedValue([])
    const view = render(<WatchPlayback title={movieDetail} />)
    try {
      await waitForSourceResolved()
      act(() => {
        screen.getByRole('button', { name: 'simulate-time' }).click()
        screen.getByRole('button', { name: 'simulate-pause' }).click()
        screen.getByRole('button', { name: 'simulate-gone' }).click()
      })
      await screen.findByRole('button', { name: 'Cancel' })
      expect(screen.getByTestId('watch-recovery')).toHaveAttribute('data-checkpoint', '42')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('Recovery stopped.')
      expect(alert).not.toHaveTextContent('Your place is saved.')
      await act(async () => rejectRecovery(new Error('Recovery canceled by the viewer.')))
    } finally { view.unmount() }
  })
  it('offers an exact SUB destination when an English anime DUB cannot play', async () => {
    mocks.request.mockReset().mockRejectedValue(new Error('English dub unavailable.'))
    render(<WatchPlayback title={{ ...movieDetail, kind: 'anime', id: 21 }} episode={{ episodeNumber: 3, title: 'Episode three' }} audioLanguage="en" />)
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Watch SUB instead' })).toHaveAttribute('href', '/watch/anime/21?episode=3&audio=sub')
  })
  it('loads the server strip roster once without switching the current playback', async () => {
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([{ id: 'secret-provider', label: 'secret-provider' }])
    mocks.swap.mockReset()
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(mocks.swap).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Server 1' })).toBeInTheDocument()
  })
  it('discovers saved Arabic and English captions before playing or opening controls', async () => {
    localStorage.setItem('consumit.player.subtitles', 'ar')
    localStorage.setItem('consumit.player.subtitle-languages', '["ar","en"]')
    mocks.request.mockReset().mockResolvedValue(session)
    render(<WatchPlayback title={movieDetail} />)
    await waitForSourceResolved()
    await waitFor(() => expect(mocks.subs).toHaveBeenCalledTimes(1))
    localStorage.removeItem('consumit.player.subtitle-languages')
    localStorage.removeItem('consumit.player.subtitles')
  })
  it('prepares a discovered subtitle only after selection', async () => {
    localStorage.setItem('consumit.player.subtitles', 'off')
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    expect(mocks.subs).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'simulate-captions' }).click()
    await waitFor(() => expect(mocks.subs).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, expect.any(AbortSignal), expect.any(Function), ['en'], undefined, session.id))
    expect(screen.getByTestId('player')).toHaveAttribute('data-extra', '')
    screen.getByRole('button', { name: 'simulate-track-select' }).click()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-extra', 'sub-yify-en'))
    localStorage.removeItem('consumit.player.subtitles')
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
  it('keeps a healthy direct recording attached during URL renewal and uses the latest lease on failure', async () => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', videoVersion: 'recording-v1', providerId: 'primary', type: 'native' as const, delivery: 'direct' as const, src: 'https://media.example/orig.mp4', expiresAt: new Date(Date.now() + 16000).toISOString() } }
    const renewed = { ...initial, source: { ...initial.source, src: 'https://media.example/renewed.mp4', expiresAt: new Date(Date.now() + 60000).toISOString() } }
    mocks.request.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(renewed)
    mocks.list.mockReset().mockResolvedValue([])
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
  })
  it('keeps a healthy stream attached during URL renewal and uses the latest lease on failure', async () => {
    const initial = { ...session, source: { ...session.source, providerId: 'primary', type: 'hls' as const, delivery: 'relay' as const, src: 'https://media.example/orig.m3u8', expiresAt: new Date(Date.now() + 16000).toISOString() } }
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
    mocks.list.mockReset().mockResolvedValue([])
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
    { providerId: 'primary', type: 'hls', delivery: 'direct', videoVersion: 'recording-v2' },
  ])('attaches a changed provider, recording, media type, or delivery path during renewal: %j', async (replacement) => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', videoVersion: 'recording-v1', providerId: 'primary', type: 'hls', delivery: 'direct', src: 'https://media.example/orig.m3u8', expiresAt: new Date(Date.now() + 16000).toISOString() } }
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
    const recoveryNotice = await screen.findByText('Playback source restored. Your place is kept.')
    expect(recoveryNotice.closest('[data-player-toast]')).toHaveAttribute('role', 'status')
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
    let releaseServers!: (value: unknown[]) => void
    mocks.list.mockReset().mockImplementation(() => new Promise(done => { releaseServers = done }))
    mocks.swap.mockReset().mockResolvedValue(pinned)
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} pinnedProvider="backup" /></Activity>)
    await waitForSourceResolved()
    expect(mocks.swap).not.toHaveBeenCalled()
    await act(async () => releaseServers([{ id: 'primary', label: 'Primary' }, { id: 'backup', label: 'Backup' }]))
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledTimes(1))
    expect(mocks.swap).toHaveBeenCalledWith(session.id, { providerId: 'backup', preferences: expect.objectContaining({ qualityHeight: null, audioLanguage: 'en' }) }, expect.any(AbortSignal))
  })
  it('shows a visible switching status while recovering', async () => {
    let release!: (value: unknown) => void
    mocks.request.mockReset().mockResolvedValueOnce(session).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-error' }).click()
    expect(await screen.findByText('Trying another source')).toBeInTheDocument()
    await act(async () => { release({ ...session, source: { ...session.source, id: 'source-2' } }) })
    await waitFor(() => expect(screen.queryByText('Trying another source')).not.toBeInTheDocument())
  })
  it('passes episode navigation and persisted preferences into the player', async () => {
    window.localStorage.clear()
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} nextHref="/watch/series/1?season=1&episode=3" prevHref="/watch/series/1?season=1&episode=1" /></Activity>)
    await waitForSourceResolved()
    const previous = screen.getByRole('button', { name: 'Previous episode' })
    const next = screen.getByRole('button', { name: 'Next episode' })
    fireEvent.click(previous)
    expect(mocks.push).toHaveBeenCalledWith('/watch/series/1?season=1&episode=1', { scroll: false })
    fireEvent.click(next)
    expect(mocks.push).toHaveBeenCalledWith('/watch/series/1?season=1&episode=3', { scroll: false })
    expect(screen.getByRole('switch', { name: 'Autoplay next episode' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Show up-next card' })).toHaveAttribute('aria-checked', 'true')
    window.localStorage.clear()
  })
  it('autoplay waits for a cancelable ten-second countdown before advancing', async () => {
    window.localStorage.setItem('consumit.player.autoplay', '1')
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.push.mockReset()
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} nextHref="/watch/series/1?season=1&episode=3" /></Activity>)
      await waitForSourceResolved()
      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'simulate-ended' }))
      expect(screen.getByText('Next episode in 10s')).toBeInTheDocument()
      expect(mocks.push).not.toHaveBeenCalled()
      for (let second = 0; second < 10; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(mocks.push).toHaveBeenCalledWith('/watch/series/1?season=1&episode=3', { scroll: false })
    } finally {
      vi.useRealTimers()
      window.localStorage.clear()
    }
  })
  it.each(['Cancel', 'Play now'])('handles the next-episode %s action', async action => {
    window.localStorage.setItem('consumit.player.autoplay', '1')
    try {
      mocks.request.mockReset().mockResolvedValue(session)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.push.mockReset()
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} nextHref="/watch/series/1?season=1&episode=3" /></Activity>)
      await waitForSourceResolved()
      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'simulate-ended' }))
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${action}$`) }))
      await act(async () => { await vi.advanceTimersByTimeAsync(11000) })
      expect(screen.queryByText(/Next episode in/)).not.toBeInTheDocument()
      if (action === 'Cancel') expect(mocks.push).not.toHaveBeenCalled()
      else expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/watch/series/1?season=1&episode=3', { scroll: false })
    } finally { vi.useRealTimers(); window.localStorage.clear() }
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
      const versionedSession = { ...session, source: { ...session.source, videoVersion: 'video-v1' } }
      mocks.request.mockReset().mockResolvedValue(versionedSession)
      mocks.list.mockReset().mockResolvedValue([])
      mocks.pref.mockReset().mockResolvedValue({ trackId: null, offsetMs: 1500 })
      mocks.savePref.mockReset().mockResolvedValue(undefined)
      mocks.prepare.mockReset().mockResolvedValue({ id: 'sub-yify-en', label: 'English', language: 'en', contentChecksum: 'sha256:fixture', url: 'https://api.example/v1/subtitles/file/abc' })
      render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
      await waitForSourceResolved()
      screen.getByRole('button', { name: 'simulate-captions' }).click()
      await waitFor(() => expect(mocks.subs).toHaveBeenCalled())
      screen.getByRole('button', { name: 'simulate-track-select' }).click()
      await waitFor(() => expect(mocks.pref).toHaveBeenCalledTimes(1))
      expect(mocks.pref).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, expect.any(AbortSignal), { videoVersion: 'video-v1', contentChecksum: 'sha256:fixture' })
      await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-delay', '1500'))
      screen.getByRole('button', { name: 'simulate-delay' }).click()
      await waitFor(() => expect(mocks.savePref).toHaveBeenCalledTimes(1), { timeout: 3000 })
      expect(mocks.savePref).toHaveBeenCalledWith({ kind: 'movie', id: movieDetail.id }, { offsetMs: 1500 }, expect.any(AbortSignal), { videoVersion: 'video-v1', contentChecksum: 'sha256:fixture' })
    } finally {
      mocks.member = null
    }
  })
  it('keeps guests on device-local subtitles without preference calls', async () => {
    mocks.member = null
    const versionedSession = { ...session, source: { ...session.source, videoVersion: 'video-v1' } }
    mocks.request.mockReset().mockResolvedValue(versionedSession)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.pref.mockReset()
    mocks.savePref.mockReset()
    mocks.prepare.mockReset().mockResolvedValue({ id: 'sub-yify-en', label: 'English', language: 'en', contentChecksum: 'sha256:fixture', url: 'https://api.example/v1/subtitles/file/abc' })
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    expect(screen.getByTestId('player')).toHaveAttribute('data-delay', '0')
    expect(mocks.pref).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'simulate-captions' }).click()
    await waitFor(() => expect(mocks.subs).toHaveBeenCalled())
    screen.getByRole('button', { name: 'simulate-track-select' }).click()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-extra', 'sub-yify-en'))
    screen.getByRole('button', { name: 'simulate-delay' }).click()
    expect(mocks.savePref).not.toHaveBeenCalled()
    expect(localStorage.getItem(`consumit.caption-correction.v1:${JSON.stringify(['guest', session.ref, 'video-v1', 'sub-yify-en', 'sha256:fixture'])}`)).toBe('1500')
  })
  it('casts the session to the TV and shows the casting state', async () => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', type: 'native', src: 'https://media.example/orig.m3u8' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.cast.available = true
    const view = render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    const phonePosition = Number(screen.getByTestId('player').getAttribute('data-resume-at'))
    screen.getByRole('button', { name: 'simulate-cast' }).click()
    await waitFor(() => expect(mocks.cast.requestSession).toHaveBeenCalledTimes(1))
    mocks.cast.status = { connected: true, deviceName: 'Living Room TV', position: 12, duration: 100, playing: true, volume: 0.9, muted: false }
    mocks.cast.emit()
    await waitFor(() => expect(mocks.cast.loadMedia).toHaveBeenCalledTimes(1))
    expect(mocks.cast.loadMedia).toHaveBeenCalledWith(expect.objectContaining({ contentId: 'https://media.example/orig.m3u8', position: phonePosition, title: movieDetail.title }))
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
    const resumed = await screen.findByText('Playback resumed on this device at 0:30.')
    expect(resumed.closest('[role="status"]')).toBeInTheDocument()
  })
  it('keeps the TV paused when disconnecting to the phone', async () => {
    const initial = { ...session, source: { ...session.source, id: 'source-1', providerId: 'primary', type: 'native', src: 'https://media.example/orig.m3u8' } }
    mocks.request.mockReset().mockResolvedValue(initial)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.cast.available = true
    render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    await waitForSourceResolved()
    screen.getByRole('button', { name: 'simulate-cast' }).click()
    await waitFor(() => expect(mocks.cast.requestSession).toHaveBeenCalledTimes(1))
    mocks.cast.status = { connected: true, deviceName: 'Living Room TV', position: 30, duration: 100, playing: false, volume: 0.9, muted: false }
    mocks.cast.emit()
    await waitFor(() => expect(mocks.cast.loadMedia).toHaveBeenCalledTimes(1))
    mocks.cast.status = null
    mocks.cast.emit()
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-resume-at', '30'))
    expect(screen.getByTestId('player')).toHaveAttribute('data-resume-playing', 'false')
    const resumed = await screen.findByText('Playback paused on this device at 0:30.')
    expect(resumed.closest('[role="status"]')).toBeInTheDocument()
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


describe('recording transitions', () => {
  beforeEach(() => {
    mocks.cast.available = false; mocks.cast.status = null; mocks.selected.mockClear()
    mocks.subs.mockReset().mockImplementation(async (_ref, _signal, onEvent) => { onEvent({ type: 'complete', searchId: 'fixture-search', languages: [{ code: 'en', count: 1 }] }) })
  })
  it('keeps an obsolete subtitle discovery from aborting during an episode transition', async () => {
    const discoveries: { signal: AbortSignal; onEvent: (event: { type: 'snapshot'; searchId: string; languages: { code: string; count: number }[] }) => void }[] = []
    mocks.subs.mockReset().mockImplementation((_ref, signal, onEvent) => {
      discoveries.push({ signal: signal as AbortSignal, onEvent })
      return new Promise(() => undefined)
    })
    mocks.request.mockReset().mockImplementation(async (_path, input) => ({ ...session, ref: input.ref, source: { ...session.source, type: 'native', src: `https://media.example/episode-${input.ref.episode}.mp4` } }))
    mocks.list.mockReset().mockResolvedValue([])
    const title = { ...movieDetail, kind: 'series' as const }
    const view = render(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 1, title: 'First' }} />)
    try {
      await waitForSourceResolved()
      await waitFor(() => expect(discoveries).toHaveLength(1))
      const oldDiscovery = discoveries[0]!
      view.rerender(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 2, title: 'Second' }} />)
      await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://media.example/episode-2.mp4'))
      await waitFor(() => expect(discoveries).toHaveLength(2))
      expect(oldDiscovery.signal.aborted).toBe(false)
      act(() => oldDiscovery.onEvent({ type: 'snapshot', searchId: 'obsolete-search', languages: [{ code: 'ar', count: 1 }] }))
      expect(screen.getByTestId('player')).toHaveAttribute('data-subtitle-search-id', 'none')
    } finally { view.unmount() }
  })
  it('checkpoints the preceding episode, resumes the selected episode and keeps the player mounted', async () => {
    mocks.write.mockClear()
    mocks.read.mockImplementation(async (...args: unknown[]) => (args[0] as { episode?: number }).episode === 2 ? 17 : 0)
    mocks.request.mockReset().mockImplementation(async (_path, input) => ({ ...session, ref: input.ref, source: { ...session.source, type: 'native', providerId: 'primary', src: `https://media.example/episode-${input.ref.episode}.mp4` } }))
    mocks.list.mockReset().mockResolvedValue([])
    const title = { ...movieDetail, kind: 'series' as const }
    const view = render(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 1, title: 'First' }} />)
    try {
      await waitForSourceResolved()
      const player = screen.getByTestId('player')
      fireEvent.click(screen.getByRole('button', { name: 'simulate-time' }))
      view.rerender(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 2, title: 'Second' }} />)
      await waitFor(() => expect(player).toHaveAttribute('data-source', 'https://media.example/episode-2.mp4'))
      expect(screen.getByTestId('player')).toBe(player)
      expect(player).toHaveAttribute('data-resume-at', '17')
      expect(mocks.write.mock.calls.some(call => (call[0] as { episode: number }).episode === 1 && call[1] === 42)).toBe(true)
      expect(mocks.write.mock.calls.some(call => (call[0] as { episode: number }).episode === 2 && call[1] === 42)).toBe(false)
    } finally { view.unmount(); mocks.read.mockResolvedValue(0) }
  })

  it('ignores a superseded episode resolve even when its provider ignores cancellation', async () => {
    let finish!: (value: unknown) => void
    mocks.request.mockReset().mockImplementation(async (_path, input) => {
      if (input.ref.episode === 1) return new Promise(resolve => { finish = resolve })
      return { ...session, ref: input.ref, source: { ...session.source, type: 'native', src: 'https://media.example/episode-two.mp4' } }
    })
    mocks.list.mockReset().mockResolvedValue([])
    const title = { ...movieDetail, kind: 'series' as const }
    const view = render(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 1, title: 'First' }} />)
    await waitFor(() => expect(mocks.request).toHaveBeenCalled())
    const firstSignal = mocks.request.mock.calls[0]![2] as AbortSignal
    view.rerender(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 2, title: 'Second' }} />)
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://media.example/episode-two.mp4'))
    expect(firstSignal.aborted).toBe(true)
    await act(async () => finish({ ...session, ref: { kind: 'series', id: title.id, season: 1, episode: 1 }, source: { ...session.source, src: 'https://media.example/stale.mp4' } }))
    expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://media.example/episode-two.mp4')
  })
})

describe('optional post-watch actions', () => {
  it('keeps a movie completion private until a member deliberately logs it', async () => {
    mocks.member = { id: 'member-1' }
    mocks.request.mockReset().mockResolvedValue(session)
    mocks.list.mockReset().mockResolvedValue([])
    mocks.subs.mockReset().mockResolvedValue([])
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/v1/taste/drafts/')) return Promise.resolve(new Response(JSON.stringify({ revision: 0, data: {} }), { status: 200 }))
      if (url.startsWith('/v1/me/titles/')) return Promise.resolve(new Response(JSON.stringify({ rating: null, like: null, review: null, saved: false, watched: false }), { status: 200 }))
      if (url === '/v1/taste/reviews' && init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ reviewId: null }), { status: 201 }))
      if (url.startsWith('/v1/taste/drafts/') && init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify({ revision: 1, data: {} }), { status: 200 }))
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<Activity mode="visible"><WatchPlayback title={movieDetail} /></Activity>)
    try {
      await waitForSourceResolved()
      fireEvent.click(screen.getByRole('button', { name: 'simulate-ended' }))
      expect(await screen.findByRole('region', { name: 'After watching' })).toBeInTheDocument()
      expect(screen.getByText(/private Watch History/)).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Add to Diary' }))
      expect(await screen.findByRole('dialog', { name: 'Remember this watch' })).toBeInTheDocument()
      await screen.findByText('Only published work appears on your profile.')
      fireEvent.click(screen.getByRole('button', { name: 'Save watch' }))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/v1/taste/reviews', expect.objectContaining({ method: 'POST' })))
      const write = fetchMock.mock.calls.find(([url, init]) => String(url) === '/v1/taste/reviews' && init?.method === 'POST')
      expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({ kind: 'movie', id: movieDetail.id, body: '', log: { rewatch: false } })
      expect(JSON.parse(String(write?.[1]?.body))).not.toHaveProperty('reviewId')
    } finally {
      view.unmount()
      mocks.member = null
      vi.unstubAllGlobals()
    }
  })

  it('keeps episode completion compact and does not open the title review composer', async () => {
    mocks.member = { id: 'member-1' }
    try {
      mocks.request.mockReset().mockImplementation(async (_route, input) => ({ ...session, ref: input.ref, source: { ...session.source, type: 'native', src: 'https://media.example/episode.mp4' } }))
      mocks.list.mockReset().mockResolvedValue([])
      mocks.subs.mockReset().mockResolvedValue([])
      const view = render(<Activity mode="visible"><WatchPlayback title={{ ...movieDetail, kind: 'series' }} episode={{ seasonNumber: 1, episodeNumber: 2, title: 'Episode 2' }} nextHref="/watch/series/693134?season=1&episode=3" /></Activity>)
      await waitForSourceResolved()
      fireEvent.click(screen.getByRole('button', { name: 'simulate-ended' }))
      expect(screen.queryByRole('region', { name: 'After watching' })).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Remember this watch' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write a review' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Next episode' }).length).toBeGreaterThan(0)
      view.unmount()
    } finally { mocks.member = null }
  })

  it('announces when the final episode finishes without a next episode', async () => {
    mocks.member = { id: 'member-1' }
    try {
      mocks.request.mockReset().mockImplementation(async (_route, input) => ({ ...session, ref: input.ref, source: { ...session.source, type: 'native', src: 'https://media.example/final-episode.mp4' } }))
      mocks.list.mockReset().mockResolvedValue([])
      mocks.subs.mockReset().mockResolvedValue([])
      const view = render(<Activity mode="visible"><WatchPlayback title={{ ...movieDetail, kind: 'series' }} episode={{ seasonNumber: 2, episodeNumber: 10, title: 'The End' }} /></Activity>)
      try {
        await waitForSourceResolved()
        fireEvent.click(screen.getByRole('button', { name: 'simulate-ended' }))
        expect(await screen.findByText('Episode finished.', { selector: 'p.sr-only' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Next episode' })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'After watching' })).not.toBeInTheDocument()
      } finally { view.unmount() }
    } finally { mocks.member = null }
  })
})


it('rejects old subtitle preparation after leaving and returning to the same episode', async () => {
  mocks.cast.available = false; mocks.cast.status = null; mocks.selected.mockClear()
  mocks.subs.mockReset().mockImplementation(async (_ref, _signal, onEvent) => { onEvent({ type: 'complete', searchId: 'fixture-search', languages: [{ code: 'en', count: 1 }] }) })
  let finish!: (value: unknown) => void
  mocks.prepare.mockReset().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  mocks.request.mockReset().mockImplementation(async (_path, input) => ({ ...session, ref: input.ref, source: { ...session.source, type: 'native', src: `https://media.example/episode-${input.ref.episode}.mp4` } }))
  mocks.list.mockReset().mockResolvedValue([])
  const title = { ...movieDetail, kind: 'series' as const }
  const view = render(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 1, title: 'First' }} />)
  await waitForSourceResolved()
  fireEvent.click(screen.getByRole('button', { name: 'simulate-captions' }))
  await waitFor(() => expect(mocks.subs).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'simulate-track-select' }))
  await waitFor(() => expect(mocks.prepare).toHaveBeenCalled())
  view.rerender(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 2, title: 'Second' }} />)
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://media.example/episode-2.mp4'))
  view.rerender(<WatchPlayback title={title} episode={{ seasonNumber: 1, episodeNumber: 1, title: 'First' }} />)
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-source', 'https://media.example/episode-1.mp4'))
  await act(async () => finish({ id: 'obsolete', label: 'English', language: 'en', url: 'https://media.example/obsolete.vtt' }))
  expect(mocks.selected).not.toHaveBeenCalled()
  expect(screen.getByTestId('player')).toHaveAttribute('data-extra', '')
})


it.each([true, false])('cancels source search from inside the player (retained source: %s)', async retain => {
  let finish!: (value: unknown) => void
  mocks.cast.available = false; mocks.cast.status = null
  const initial = { ...session, source: { ...session.source, type: 'native', providerId: 'primary', src: 'https://media.example/current.mp4' } }
  mocks.request.mockReset()
  if (retain) mocks.request.mockResolvedValueOnce(initial)
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  mocks.list.mockReset().mockResolvedValue([])
  if (!retain) mocks.attemptProgress = { tried: 1, total: 3 }
  const view = render(<WatchPlayback title={movieDetail} />)
  try {
    if (retain) {
      await waitForSourceResolved()
      mocks.attemptProgress = { tried: 1, total: 3 }
      fireEvent.click(screen.getByRole('button', { name: 'simulate-gone' }))
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect((mocks.request.mock.calls.at(-1)![2] as AbortSignal).aborted).toBe(true)
    await act(async () => finish(initial))
    expect(screen.getByTestId('player').getAttribute('data-source')).toBe(retain ? initial.source.src : null)
    if (!retain) expect(screen.getByRole('alert')).toHaveTextContent('Source search stopped. Try Auto again or choose a source.')
  } finally { mocks.attemptProgress = null; view.unmount() }
})
