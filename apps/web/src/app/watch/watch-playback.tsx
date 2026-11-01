'use client'

import { createProgressWriteCoordinator } from '../../lib/progress-write-coordinator'


import { CloudOff, Tv, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { titleHref, experiencePreferencesSchema, type PlaybackProvider, type PlaybackRef, type PlaybackSession, type DeliveryFailure, type SeparateAudioTrack, type ExperiencePreferences, type ExperiencePatch } from '@consumit/contracts'
import { Button, ConsumitPlayer, Select, Toggle, buttonVariants, SUBTITLE_LANGUAGES_EVENT, readStoredSubtitleLanguages, readQualityPreference, createQualityPreference, type PlaybackRecoveryViewModel } from '@consumit/ui'
import { useSession } from '../session/session'
import { useExperience } from '../experience/experience-provider'
import { applyPlayerDefaults } from '@/lib/experience-storage'
import { trackConsumitAnalytics } from '@/lib/google-analytics'
import { browserSkipTimes } from '@/lib/skip-times-browser'
import { listPlaybackProviders, playbackCapabilities, playbackRequest, runPlaybackAttempt, switchPlaybackProvider, listSeparateAudio, prepareSeparateAudio } from '@/lib/playback-browser'
import { discoverSubtitles, pageSubtitles, searchSubtitles, prepareSubtitle, fetchAggregatedSubtitles, fetchSubtitlePreference, saveSubtitlePreference, type AggregatedSubtitle, type SubtitleDiscoveryEvent, type SubtitleCandidate, type SubtitleProviderStatus } from '@/lib/subtitles-browser'
import { PROGRESS_SYNC_INTERVAL_MS, hasMeaningfulProgressChange, readPlaybackProgress, writePlaybackProgress, type ProgressCheckpoint } from '@/lib/playback-progress'
import { createPlaybackEvents } from '@/lib/playback-events'
import { createFrameDiagnostics } from '@/lib/provider-frame-events'
import { createPlaybackCoordinator, watchSourceExpiry, type SourceExpiryTrigger } from '@/lib/playback-coordinator'
import { castContentType, createCastSender, type CastStatus } from '@/lib/cast-sender'

import type { WatchEpisode, WatchTitle } from './watch-screen'
import { ProviderFrame } from '../shared/provider-frame'
import { LogDialog } from '../catalog/log-dialog'
import { RatingWidget } from '../catalog/rating-widget'
import { watchPoster } from './watch-poster'
import { useWatchTheater } from './watch-surface'
import { frameName, serverName } from './server-strip'
import { storePlaybackDiagnostics, browserName } from '@/lib/playback-diagnostics'
import { useAdStatus } from '../shared/ad-status'

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
type RecoveryConnection = 'offline' | 'restored' | null
function recoveryConnectionMessage(status: RecoveryConnection, fallback: string | null): string | undefined {
  if (status === 'offline') return 'Your device reports it’s offline. Reconnect, then try again with Auto or choose a source.'
  if (status === 'restored') return 'Your connection is back. Try again with Auto or choose a source.'
  return fallback ?? undefined
}
type AnalyticsPlaybackSample = { position: number; at: number; delivery: 'direct' | 'relay' | 'cast'; playerType: 'html5' | 'cast' }
type AnalyticsPlaybackClock<T> = {
  recording: T
  started: boolean
  eligible: boolean
  watchedMs: number
  sentThirtySeconds: boolean
  lastSample: AnalyticsPlaybackSample | null
}
const sourceChoiceValue = (providerId: string, serverId: string) => `${providerId}::${serverId}`
function sourceChoice(value: string | null, providers: readonly PlaybackProvider[]) {
  if (!value) return undefined
  for (const provider of providers) {
    if (provider.id === value) return { providerId: provider.id }
    const prefix = `${provider.id}::`
    if (!value.startsWith(prefix)) continue
    const server = provider.servers?.find(item => value === sourceChoiceValue(provider.id, item.id))
    if (server) return { providerId: provider.id, sourceKey: server.sourceKey }
  }
  return undefined
}

type WatchPlaybackProps = { episodePanel?: ReactNode; audioControl?: ReactNode; audioLanguage?: string | undefined; title: WatchTitle; episode?: WatchEpisode | undefined; nextHref?: string | undefined; prevHref?: string | undefined; layout?: 'fullscreen' | 'embedded' | undefined; pinnedProvider?: string | undefined }
export function WatchPlayback(props: WatchPlaybackProps) {
  const experience = useExperience()
  if (!experience.ready) return <ConsumitPlayer title={props.title.title} presentation={{ backHref: titleHref(props.title), preparing: true, posterSrc: watchPoster(props.title.backdropUrl ?? props.title.posterUrl) }} />
  return <WatchPlaybackReady {...props} key={`${experience.owner ?? 'guest'}:${props.title.kind}:${props.title.id}`} initialPreferences={experience.preferences} />
}
function WatchPlaybackReady({ episodePanel, audioControl, audioLanguage: audioLanguageProp, title, episode, nextHref, prevHref, layout = 'fullscreen', pinnedProvider, initialPreferences }: WatchPlaybackProps & { initialPreferences: ExperiencePreferences }) {
  const { theater, setTheater } = useWatchTheater()
  const { member } = useSession()
  const experience = useExperience()
  const ads = useAdStatus()
  const adsEnabled = useRef(false)
  useLayoutEffect(() => { adsEnabled.current = ads.enabled }, [ads.enabled])
  const [openingPreferences] = useState(initialPreferences)
  const saveExperience = experience.patch
  const intent = useRef(openingPreferences)
  const [viewingPreferences, setViewingPreferences] = useState(openingPreferences)
  const [preferenceSyncError, setPreferenceSyncError] = useState(false)
  const remember = useCallback((change: ExperiencePatch) => {
    if (!Object.keys(change).length) return
    intent.current = experiencePreferencesSchema.parse({ ...intent.current, ...change })
    setViewingPreferences(intent.current)
    void saveExperience(change).then(() => setPreferenceSyncError(false), () => setPreferenceSyncError(true))
  }, [saveExperience])
  const router = useRouter()
  const memberId = member?.id
  const seasonNumber = episode?.seasonNumber, episodeNumber = episode?.episodeNumber
  const ref = useMemo<PlaybackRef>(() => ({ kind: title.kind, id: title.id, ...(episodeNumber !== undefined ? { season: seasonNumber, episode: episodeNumber } : {}) }), [title.id, title.kind, seasonNumber, episodeNumber])
  const requestSkipTimes = useCallback((duration: number, signal: AbortSignal) => browserSkipTimes(ref, duration, signal), [ref])
  const recordingKey = `${ref.kind}:${ref.id}:${ref.season ?? 0}:${ref.episode ?? 0}:${audioLanguageProp ?? ''}`
  // A fresh token distinguishes A → B → A from an old request for the same episode.
  const recording = useMemo(() => ({ key: recordingKey }), [recordingKey])
  const latestRecording = useRef(recording)
  useLayoutEffect(() => { latestRecording.current = recording }, [recording])
  const sameRef = (value: PlaybackRef) => value.kind === ref.kind && value.id === ref.id && value.season === ref.season && value.episode === ref.episode
  const [sessionState, setSessionState] = useState<{ key: typeof recording; value: PlaybackSession } | null>(null)
  const setSession = useCallback((value: PlaybackSession | null) => setSessionState(value ? { key: recording, value } : null), [recording])
  const session = sessionState?.key === recording && sameRef(sessionState.value.ref) ? sessionState.value : null
  // The session holds the newest lease; buffered HLS requests can adopt it
  // without replacing the engine or clearing the movie's buffered media.
  const [sourceState, setSourceState] = useState<{ key: typeof recording; source: PlaybackSession['source'] }>()
  const localSource = sourceState?.key === recording ? sourceState.source : undefined
  const setLocalSource = useCallback((source: PlaybackSession['source'] | undefined) => setSourceState(source ? { key: recording, source } : undefined), [recording])
  const latestLease = useRef<PlaybackSession['source'] | undefined>(undefined)
  useEffect(() => { latestLease.current = session?.source }, [session])
  const isFrame = localSource?.type === 'iframe'
  const frameActive = useRef(false)
  useLayoutEffect(() => { frameActive.current = isFrame }, [isFrame])
  const playerSource = useMemo(() => localSource && localSource.type !== 'iframe' ? {
    ...localSource, type: localSource.type, subtitles: [],
    ...(localSource.delivery === 'relay' && localSource.type === 'hls' ? { relayLease: () => {
      const next = latestLease.current ?? localSource
      return next && next.id === localSource.id && next.providerId === localSource.providerId &&
        next.delivery === 'relay' && next.type === 'hls' && Date.parse(next.expiresAt) > Date.now() ? { src: next.src } : undefined
    } } : {}),
  } : undefined, [localSource])
  const [separateAudioTracks, setSeparateAudioTracks] = useState<SeparateAudioTrack[]>([])
  const [separateAudioLoading, setSeparateAudioLoading] = useState(false)
  const [separateAudioError, setSeparateAudioError] = useState<string | null>(null)
  const audioRequestRef = useRef<AbortController | null>(null)
  const audioLoadedSession = useRef<string | null>(null)
  useEffect(() => () => { audioRequestRef.current?.abort() }, [])
  const requestAudio = useCallback(() => {
    if (!session || session.source.type === 'iframe' || title.kind === 'anime') return
    const key = session.id + ':' + session.source.id
    if (audioLoadedSession.current === key) return
    audioRequestRef.current?.abort()
    const request = new AbortController(); audioRequestRef.current = request
    audioLoadedSession.current = key; setSeparateAudioLoading(true); setSeparateAudioError(null); setSeparateAudioTracks([])
    void listSeparateAudio(session, request.signal).then(tracks => {
      if (request.signal.aborted) return
      setSeparateAudioTracks(tracks)
      if (!tracks.length) {
        audioLoadedSession.current = null
        setSeparateAudioError('No additional audio languages were found.')
      }
    }).catch(() => {
      if (!request.signal.aborted) { audioLoadedSession.current = null; setSeparateAudioError('More languages are unavailable right now.') }
    }).finally(() => { if (!request.signal.aborted) setSeparateAudioLoading(false) })
  }, [session, title.kind])
  const selectSeparateAudio = useCallback(async (id: string) => {
    if (!session) throw new Error('Playback has not started')
    const result = await prepareSeparateAudio(session, id, AbortSignal.timeout(12_000))
    return result
  }, [session])
  const sourceFailed = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryConnection, setRecoveryConnection] = useState<RecoveryConnection>(null)
  const [recoveryActive, setRecoveryActive] = useState(false)
  const [recoveryKind, setRecoveryKind] = useState<PlaybackRecoveryViewModel['kind']>('startup')
  const [recoveryCheckpoint, setRecoveryCheckpoint] = useState(0)
  const [syncError, setSyncError] = useState(false)
  const [syncRetrying, setSyncRetrying] = useState(false)
  const [syncNoticeDismissed, setSyncNoticeDismissed] = useState(false)
  const [ended, setEnded] = useState(false)
  const [postWatchAction, setPostWatchAction] = useState<'rating' | 'diary' | 'review' | null>(null)
  const [postWatchDismissed, setPostWatchDismissed] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [serverState, setServerState] = useState<{ key: typeof recording; items: PlaybackProvider[] }>({ key: recording, items: [] })
  const servers = useMemo(() => serverState.key === recording ? serverState.items : [], [serverState, recording])
  const setServers = useCallback((items: PlaybackProvider[]) => setServerState({ key: recording, items }), [recording])
  const [serverRequested, setServerRequested] = useState(true)
  const [serverLoading, setServerLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverAttempt, setServerAttempt] = useState(0)
  const [manualServer, setManualServer] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const activeRef = useRef(false)
  const interruptedRequest = useRef<(() => Promise<void>) | null>(null)
  const [recoveryProgress, setRecoveryProgress] = useState<{ tried: number; total: number } | null>(null)

  useEffect(() => {
    const onOffline = () => setRecoveryConnection('offline')
    const onOnline = () => setRecoveryConnection(current => current === 'offline' ? 'restored' : null)
    if (!navigator.onLine) onOffline()
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])
  const requestInput = useCallback((currentRef: PlaybackRef, preferences?: import('@consumit/contracts').PlaybackPreferences) => ({ ref: currentRef, capabilities: playbackCapabilities(), audioLanguage: audioLanguageProp ?? intent.current.audioLanguage, preferences: { qualityHeight: intent.current.qualityHeight, audioLanguage: audioLanguageProp ?? intent.current.audioLanguage, ...preferences, adsEnabled: adsEnabled.current } }), [audioLanguageProp])
  const clockRecording = useRef(recording)
  const clock = useRef({ position: 0, duration: 0, playing: false, completed: false })
  const analyticsPlayback = useRef<AnalyticsPlaybackClock<typeof recording>>({ recording, started: false, eligible: false, watchedMs: 0, sentThirtySeconds: false, lastSample: null })
  const currentAnalyticsPlayback = useCallback(() => {
    if (analyticsPlayback.current.recording !== recording) analyticsPlayback.current = { recording, started: false, eligible: false, watchedMs: 0, sentThirtySeconds: false, lastSample: null }
    return analyticsPlayback.current
  }, [recording])
  const startAnalyticsPlayback = useCallback((playerType: 'html5' | 'cast') => {
    const state = currentAnalyticsPlayback()
    if (state.started) return
    state.started = true
    state.eligible = trackConsumitAnalytics({ name: 'playback_started', playerType })
    state.lastSample = null
  }, [currentAnalyticsPlayback])
  const resetAnalyticsPlaybackSample = useCallback(() => {
    currentAnalyticsPlayback().lastSample = null
  }, [currentAnalyticsPlayback])
  const sampleAnalyticsPlayback = useCallback((position: number, playing: boolean, delivery: 'direct' | 'relay' | 'cast', playerType: 'html5' | 'cast') => {
    const state = currentAnalyticsPlayback()
    const at = performance.now()
    const previous = state.lastSample
    if (state.eligible && previous && playing && previous.delivery === delivery && position > previous.position && position - previous.position < 30) {
      state.watchedMs += Math.max(0, Math.min(5000, at - previous.at))
    }
    state.lastSample = playing && Number.isFinite(position) ? { position, at, delivery, playerType } : null
    if (state.eligible && !state.sentThirtySeconds && state.watchedMs >= 30_000) {
      state.sentThirtySeconds = true
      trackConsumitAnalytics({ name: 'playback_30s', playerType })
    }
  }, [currentAnalyticsPlayback])
  const completionId = useRef<string | null>(null)
  const [resume, setResume] = useState({ position: 0, playing: false })
  const reportRecoveryProgress = useCallback((progress: { tried: number; total: number }) => {
    if (latestRecording.current === recording) setRecoveryProgress(progress)
  }, [recording])
  // Construction only stores callbacks; ref reads happen when a request runs.
  // eslint-disable-next-line react-hooks/refs
  const coordinator = useMemo(() => createPlaybackCoordinator({
    resolve: (input, signal) => input.providerId ? playbackRequest('resolve', input, signal) : runPlaybackAttempt(input, signal, reportRecoveryProgress),
    providers: listPlaybackProviders,
    recover: (current, action, failure, signal) => action === 'refresh' ? playbackRequest(`${current.id}/${action}`, failure, signal) : runPlaybackAttempt(requestInput(current.ref, failure.preferences), signal, reportRecoveryProgress, { sessionId: current.id, failure }),
    switch: (current, providerId, signal, preferences, sourceKey) => switchPlaybackProvider(current.id, { providerId, ...(sourceKey ? { sourceKey } : {}), ...(preferences ? { preferences } : {}) }, signal),
  }), [requestInput, reportRecoveryProgress])
  // Resolve-time audio: an explicit prop (anime SUB/DUB toggle) always wins;
  // otherwise the member's stored player preference flows through so Hindi
  // (and other) selections reach language-aware providers. Storage reads stay
  // in the mount effect so SSR and first paint never disagree.
  const [storedAudio, setStoredAudio] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      applyPlayerDefaults(openingPreferences)
      setStoredAudio(openingPreferences.audioLanguage)
    })
    return () => { active = false }
  }, [openingPreferences])
  const audioLanguage = audioLanguageProp ?? storedAudio ?? 'en'
  // Episode-room preferences: device-local, read after mount so SSR and
  // first paint never disagree. Autoplay advances on end, Auto Next shows
  // the Up-next card, Auto Skip drives the player skip control in sync.
  const [autoplay, setAutoplay] = useState(openingPreferences.autoplayNextEpisode)
  const [autoNext, setAutoNext] = useState(true)
  const [autoSkip, setAutoSkip] = useState(false)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        if (window.localStorage.getItem('consumit.player.auto-next') === '0') setAutoNext(false)
        setAutoSkip(window.localStorage.getItem('consumit.player.auto-skip') === '1')
      } catch { /* Storage is optional. */ }
    })
    return () => { active = false }
  }, [])
  function persistPref(key: string, value: boolean, apply: (value: boolean) => void) {
    apply(value)
    try {
      window.localStorage.setItem(key, value ? '1' : '0')
    } catch {
      /* Storage is optional. */
    }
  }
  const handleAutoSkip = useCallback((value: boolean) => {
    setAutoSkip(value)
    try {
      window.localStorage.setItem('consumit.player.auto-skip', value ? '1' : '0')
    } catch {
      /* Storage is optional. */
    }
  }, [])
  const progressWrites = useRef(createProgressWriteCoordinator())
  const saveInFlight = useRef<Promise<void> | null>(null)
  const completionWrite = useRef<Promise<void> | null>(null)
  const lastSynced = useRef<ProgressCheckpoint | undefined>(undefined)
  const eventsRef = useRef<ReturnType<typeof createPlaybackEvents> | null>(null)
  const routeProof = useRef<{ sourceId: string; firstFrameAt: number | null; advanced: boolean }>({ sourceId: '', firstFrameAt: null, advanced: false })
  const frameDiagnosticsRef = useRef<ReturnType<typeof createFrameDiagnostics> | null>(null)
  const sessionId = session?.id
  const diagnosticSourceId = localSource?.id
  useEffect(() => {
    if (!sessionId || !isFrame || !diagnosticSourceId) return
    const diagnostics = createFrameDiagnostics(sessionId, diagnosticSourceId)
    frameDiagnosticsRef.current = diagnostics
    return () => { diagnostics.close(); frameDiagnosticsRef.current = null }
  }, [sessionId, isFrame, diagnosticSourceId])
  useEffect(() => {
    if (!sessionId || isFrame) return
    const events = createPlaybackEvents(sessionId)
    eventsRef.current = events
    return () => { events.close(); eventsRef.current = null }
  }, [sessionId, isFrame])
  const name = title.title

  const save = useCallback(async (keepalive = false, force = false) => {
    if (frameActive.current || clockRecording.current !== recording) return
    if (saveInFlight.current && !keepalive) return
    // Coalesce server and local writes: the interval only persists meaningful
    // changes, while pause, seek, completion, and page exit save explicitly.
    if (!keepalive && !force && !hasMeaningfulProgressChange(lastSynced.current, { position: clock.current.position, completed: clock.current.completed })) return
    const snapshot = { ...clock.current, completionId: completionId.current ?? undefined }
    const pending = (async () => {
      try {
        await progressWrites.current.write(JSON.stringify([memberId ?? 'guest', ref, Math.floor(snapshot.position), Math.floor(snapshot.duration), snapshot.completed, snapshot.completionId]), keepalive, () => writePlaybackProgress(ref, snapshot.position, snapshot.duration, snapshot.completed, memberId, keepalive, snapshot.completionId))
        if (latestRecording.current === recording) {
          lastSynced.current = { position: snapshot.position, completed: snapshot.completed }
          setSyncError(false)
          setSyncNoticeDismissed(false)
        }
      } catch { if (latestRecording.current === recording) setSyncError(true) }
    })()
    if (!keepalive) saveInFlight.current = pending
    await pending
    if (saveInFlight.current === pending) saveInFlight.current = null
  }, [ref, memberId, recording])
  const retryProgressSync = useCallback(async () => {
    setSyncRetrying(true)
    try {
      if (saveInFlight.current) await saveInFlight.current
      await save(false, true)
    } finally {
      setSyncRetrying(false)
    }
  }, [save])

  useEffect(() => {
    const timer = setInterval(() => { if (clock.current.playing) void save() }, PROGRESS_SYNC_INTERVAL_MS)
    const flush = () => { void save(true) }
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    const leavingWatch = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return
      const destination = new URL(link.href, window.location.href)
      if (destination.origin === window.location.origin && (destination.pathname !== window.location.pathname || destination.search !== window.location.search)) flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    document.addEventListener('click', leavingWatch, true)
    return () => { clearInterval(timer); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); document.removeEventListener('click', leavingWatch, true); void save(true) }
  }, [save])
  useEffect(() => {
    activeRef.current = true
    const restart = interruptedRequest.current
    interruptedRequest.current = null
    void restart?.()
    // No abort on cleanup: cancelling the in-flight resolve leaked an
    // AbortError rejection outside our catches (surfaced as uncaught in some
    // browsers/extensions). A late response is harmless — start()/recover()
    // ignore superseded controllers via requestRef and the ref-identity check.
    return () => { activeRef.current = false }
  }, [])
  // Start automatically on open like provider-lab: the Watch screen resolves
  // immediately instead of waiting for a Start action. Browsers may still hold
  // playback for a tap (autoplay policy); position and intent are retained.

  // Keep recovery language about the playback outcome, never provider names.
  // Auto-dismisses; unmount-safe.
  const [notice, setNotice] = useState<{ message: string } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const prevProvider = useRef<string | null>(null)
  const manualNotice = useRef(false)
  const showNotice = useCallback((message: string) => {
    setNotice({ message })
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4500)
  }, [])
  useEffect(() => {
    const current = session?.source.providerId ?? null
    if (manualNotice.current) manualNotice.current = false
    else if (current && prevProvider.current && current !== prevProvider.current) {
      showNotice(session?.source.type === 'iframe' ? 'External player selected.' : `Playback resumed${session?.source.qualityHint ? ` · ${session.source.qualityHint}` : ''}`)
    }
    prevProvider.current = current
  }, [session, servers, showNotice])
  useEffect(() => () => { clearTimeout(noticeTimer.current) }, [])

  const finishRequest = useCallback((controller: AbortController, restart: () => Promise<void>) => {
    if (requestRef.current !== controller) return
    requestRef.current = null
    if (controller.signal.aborted) {
      // React can preserve this screen's state while disconnecting its effects. Retain the
      // user's action for the next visible connection; true unmounts leave nothing running.
      if (activeRef.current) void restart()
      else interruptedRequest.current = restart
    } else { interruptedRequest.current = null; setBusy(false) }
  }, [])

  const completePlayback = useCallback(() => {
    if (clock.current.completed) return
    const precedingWrite = saveInFlight.current
    clock.current.playing = false; clock.current.completed = true; completionId.current ??= crypto.randomUUID(); setEnded(true)
    const immediate = save(true, true)
    // A periodic write may already be on the wire. Repeat the same completion
    // after it settles so its late position cannot reopen a finished stream.
    completionWrite.current = precedingWrite ? Promise.all([precedingWrite, immediate]).then(() => save(true, true)) : immediate
    void completionWrite.current
    if (autoplay && nextHref && !frameActive.current) setCountdown(10)
  }, [autoplay, nextHref, save])
  const playNext = useCallback(async () => {
    setCountdown(null)
    await completionWrite.current
    if (nextHref && activeRef.current) router.push(nextHref, { scroll: false })
  }, [nextHref, router])
  useEffect(() => {
    if (countdown === null || !autoplay || isFrame) return
    const timer = setTimeout(() => { if (countdown <= 1) void playNext(); else setCountdown(countdown - 1) }, 1000)
    return () => clearTimeout(timer)
  }, [countdown, autoplay, isFrame, playNext])

  // Chromecast (P1): the TV plays while the phone keeps the session, progress,
  // and telemetry. The TV never authenticates; disconnect resumes the phone
  // player at the TV's position through the normal resume path.
  const castSender = useMemo(() => createCastSender({}), [])
  const [castAvailable, setCastAvailable] = useState(false)
  const [castStatus, setCastStatus] = useState<CastStatus | null>(null)
  const castStarting = useRef(false)
  const updateCastStatus = useRef<() => void>(() => undefined)
  const wasCasting = useRef(false)
  const tvPlaying = useRef(false)
  const castRecording = useRef<typeof recording | null>(null)
  const loadCastMedia = useCallback(async (target: PlaybackSession, playback = { position: clock.current.position, playing: clock.current.playing }, signal?: AbortSignal) => {
    if (target.source.type === 'iframe') { castSender.endSession(true); return }
    signal?.throwIfAborted()
    await castSender.loadMedia({
      contentId: target.source.src,
      contentType: castContentType(target.source.type),
      title: name,
      artwork: episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl ?? undefined,
      position: playback.position,
      playing: playback.playing,
      customData: {
        sessionId: target.id,
        providerId: target.source.providerId,
        delivery: target.source.delivery,
        audioLanguage,
      },
    })
    signal?.throwIfAborted()
    if (latestRecording.current === recording) castRecording.current = recording
  }, [castSender, name, episode, title, audioLanguage, recording])
  useEffect(() => {
    let cancelled = false
    void castSender.ensure().then((ready) => { if (!cancelled && ready) setCastAvailable(castSender.available) })
    const update = () => {
      if (cancelled || castStarting.current) return
      setCastAvailable(castSender.available)
      const status = castSender.status
      setCastStatus(status)
      if (status) {
        if (castRecording.current !== recording) return
        wasCasting.current = true
        clock.current.position = status.position
        clock.current.duration = status.duration
        clock.current.playing = status.playing
        if (status.playing && !tvPlaying.current) {
          tvPlaying.current = true
          eventsRef.current?.push({ type: 'started', position: status.position })
          startAnalyticsPlayback('cast')
        }
        if (!status.playing) tvPlaying.current = false
        sampleAnalyticsPlayback(status.position, status.playing, 'cast', 'cast')
        if (status.duration > 0 && status.position >= status.duration - 1 && !clock.current.completed) {
          eventsRef.current?.push({ type: 'ended', position: status.position })
          completePlayback()
        }
      } else if (wasCasting.current) {
        wasCasting.current = false
        tvPlaying.current = false
        const playback = { position: clock.current.position, playing: clock.current.playing }
        setResume(playback)
        showNotice(`Playback ${playback.playing ? 'resumed' : 'paused'} on this device at ${formatClock(playback.position)}.`)
      }
    }
    updateCastStatus.current = update
    const unsubscribe = castSender.subscribe(update)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [castSender, completePlayback, recording, sampleAnalyticsPlayback, showNotice, startAnalyticsPlayback])
  const checkCast = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_CAST_RECEIVER_ID) return 'unconfigured' as const
    const ready = await castSender.ensure()
    setCastAvailable(castSender.available)
    return ready ? 'ready' as const : 'unavailable' as const
  }, [castSender])
  const handleCastClick = useCallback(() => {
    if (!session || requestRef.current) return
    if (castSender.status) {
      // Disconnect: the subscription above resumes local playback.
      castSender.endSession(true)
      return
    }
    const playback = { position: clock.current.position, playing: clock.current.playing }
    castStarting.current = true
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null)
    void (async () => {
      try {
        await castSender.requestSession()
        controller.signal.throwIfAborted()
        await loadCastMedia(session, playback, controller.signal)
      } catch {
        castSender.endSession(true)
        if (!controller.signal.aborted) showNotice('Couldn’t reach the TV. Try again.')
      }
      finally { castStarting.current = false; updateCastStatus.current(); finishRequest(controller, async () => { handleCastClick() }) }
    })()
  }, [session, castSender, loadCastMedia, showNotice, finishRequest])

  async function start(choiceValue: string | null = manualServer) {
    if (requestRef.current) return
    if ((ref.kind === 'series' || ref.kind === 'anime') && !episode) { setError(ref.kind === 'anime' ? 'Choose an episode to start watching.' : 'Choose an available episode from the series page.'); return }
    const choice = sourceChoice(choiceValue, servers)
    const kind: PlaybackRecoveryViewModel['kind'] = session
      ? localSource?.type === 'iframe' ? 'external' : 'interrupted'
      : 'startup'
    setRecoveryCheckpoint(session && sameRef(session.ref) && !clock.current.completed ? clock.current.position : resume.position)
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null); setRecoveryConnection(null); setRecoveryActive(true); setRecoveryKind(kind); setEnded(false); setCountdown(null); setRecoveryProgress(null); setManualServer(choiceValue)
    try {
      const [resolved, progress] = await Promise.allSettled([
        coordinator.resolve({ ...requestInput(ref), ...(choice ? { ...choice } : {}) }, controller.signal),
        readPlaybackProgress(ref, controller.signal, memberId),
      ])
      if (controller.signal.aborted || latestRecording.current !== recording) return
      const savedPosition = progress.status === 'fulfilled' ? progress.value : 0
      const sameRecording = session && sameRef(session.ref) && !clock.current.completed
      const resumePosition = sameRecording ? clock.current.position : savedPosition
      const resumePlaying = sameRecording ? clock.current.playing : true
      setResume({ position: resumePosition, playing: resumePlaying })
      setRecoveryCheckpoint(resumePosition)
      clock.current.position = resumePosition; clock.current.playing = resumePlaying; clock.current.completed = false
      if (resolved.status === 'rejected') throw resolved.reason
      const next = resolved.value
      if (next.ref.id !== ref.id || next.ref.kind !== ref.kind || next.ref.season !== ref.season || next.ref.episode !== ref.episode) throw new Error('Playback returned a different title.')
      if (choice && (next.source.providerId !== choice.providerId || (choice.sourceKey && next.source.serverId !== choice.sourceKey))) throw new Error('The selected server couldn’t start. Choose another server.')
      setSession(next)
      setLocalSource(next.source); sourceFailed.current = false
      setError(null); setRecoveryConnection(null); setRecoveryActive(false); setRecoveryProgress(null)
      if (castSender.status) {
        try { await loadCastMedia(next, { position: resumePosition, playing: resumePlaying }, controller.signal) }
        catch { if (!controller.signal.aborted) { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') } }
      }
    } catch {
      if (!controller.signal.aborted && latestRecording.current === recording) {
        if (!navigator.onLine) setRecoveryConnection('offline')
        setRecoveryKind(kind)
        setRecoveryActive(true)
        setError(kind === 'startup' ? 'We couldn’t start this title from the available sources.' : kind === 'external' ? 'The provider player couldn’t load.' : 'The current source couldn’t keep playing.')
      }
    }
    finally { finishRequest(controller, () => start(choiceValue)) }
  }

  const recover = useCallback(async (reason: 'network' | 'media' | 'expired' | 'gone', deliveryFailure?: DeliveryFailure, expiryTrigger: SourceExpiryTrigger = 'timer') => {
    storePlaybackDiagnostics({ ref, browser: browserName(), category: reason, ...(session ? { provider: session.source.providerId, delivery: session.source.delivery } : {}) })
    if (reason !== 'expired') sourceFailed.current = true
    if (!session || requestRef.current) return
    const kind: PlaybackRecoveryViewModel['kind'] = session.source.type === 'iframe' ? 'external' : 'interrupted'
    setRecoveryCheckpoint(clock.current.position)
    if (reason !== 'expired') { setRecoveryKind(kind); setRecoveryActive(true) }
    if (!navigator.onLine && reason !== 'expired') {
      setBusy(false)
      setError(kind === 'external' ? 'The provider player couldn’t load.' : 'Playback stopped before another source was ready.')
      setRecoveryConnection('offline')
      return
    }
    if (reason !== 'expired' && !castSender.status && localSource &&
        session.source.providerId === localSource.providerId &&
        session.source.type === localSource.type && session.source.delivery === localSource.delivery &&
        session.source.src !== localSource.src && Date.parse(session.source.expiresAt) > Date.now() + 15_000) {
      setResume({ position: clock.current.position, playing: clock.current.playing })
      setRecoveryCheckpoint(clock.current.position)
      setLocalSource(session.source); sourceFailed.current = false
      setError(null); setRecoveryActive(false); setRecoveryProgress(null)
      showNotice('Playback source restored. Your place is kept.')
      return
    }
    const controller = new AbortController(); requestRef.current = controller
    const signal = controller.signal
    if (reason !== 'expired') { setBusy(true); setRecoveryProgress(null) }
    setError(null)
    try {
      const next = await coordinator.recover(session, reason, signal, deliveryFailure)
      if (!controller.signal.aborted && latestRecording.current === recording) {
        if (next.ref.id !== session.ref.id || next.ref.kind !== session.ref.kind || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Playback returned a different title.')
        // The clock can advance while a healthy renewal is in flight.
        setResume({ position: clock.current.position, playing: clock.current.playing }); setSession(next)
        setRecoveryCheckpoint(clock.current.position)
        if (next.source.providerId !== session.source.providerId) setManualServer(null)
        latestLease.current = next.source
        // Keep routine renewals attached so healthy media does not blink. A
        // direct file returning from a hidden tab must attach its fresh URL.
        const keepAttached = reason === 'expired' && !sourceFailed.current && !castSender.status && localSource &&
          (expiryTrigger !== 'visibility' || next.source.type === 'hls') &&
          next.source.providerId === localSource.providerId && next.source.type === localSource.type &&
          next.source.delivery === localSource.delivery && next.source.id === localSource.id &&
          next.source.videoVersion === localSource.videoVersion
        if (!keepAttached) { setLocalSource(next.source); sourceFailed.current = false }
        setError(null); setRecoveryConnection(null); setRecoveryActive(false); setRecoveryProgress(null)
        if (reason !== 'expired' && next.source.providerId !== session.source.providerId) manualNotice.current = true
        let castConnectionLost = false
        if (castSender.status) {
          try { await loadCastMedia(next) }
          catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.'); castConnectionLost = true }
        }
        if (reason !== 'expired' && !castConnectionLost) {
          showNotice('Playback source restored. Your place is kept.')
        }
      }
    } catch {
      if (!controller.signal.aborted && latestRecording.current === recording) {
        if (!navigator.onLine) setRecoveryConnection('offline')
        setRecoveryKind(kind)
        setRecoveryActive(true)
        setError(kind === 'external' ? 'The provider player couldn’t load.' : 'Playback stopped before another source was ready.')
      }
    }
    finally { finishRequest(controller, () => recover(reason, deliveryFailure, expiryTrigger)) }
  }, [session, localSource, finishRequest, coordinator, castSender, loadCastMedia, showNotice, ref, recording, setLocalSource, setSession])

  useEffect(() => {
    // Renew every active playback lease, regardless of whether the diagnostic
    // provider pin is enabled.
    if (!session) return
    if (session.source.type === 'iframe') return
    return watchSourceExpiry(session.source.expiresAt, (trigger) => void recover('expired', undefined, trigger), session.source.delivery === 'relay' ? 60_000 : 15_000)
  }, [recover, session])

  const requestServers = useCallback(() => {
    if (serverLoading || (serverRequested && !serverError)) return
    setServerLoading(true); setServerError(null); setServerRequested(true)
    setServerAttempt(attempt => attempt + 1)
  }, [serverLoading, serverRequested, serverError])
  useEffect(() => {
    // Fetch only after opening Server (or an explicit diagnostic pin).
    // Lease renewal and source changes do not restart this title snapshot.
    // The server list is a read-only snapshot: never abort it on session
    // change or unmount. Aborting leaked an AbortError rejection outside our
    // catches (surfaced as an uncaught Runtime error in some browsers), and
    // cancelling buys nothing — a late response is simply ignored below.
    // The request stays bounded by its own timeout instead.
    let stale = false
    void coordinator.providers({ ...requestInput(ref), audioLanguage }, AbortSignal.timeout(12000))
      .then((servers) => { if (!stale) { setServers(servers); setServerError(null) } })
      .catch(() => {
        if (stale) return
        setServers([])
        setServerError('Servers are unavailable right now. Playback can continue.')
      })
      .finally(() => { if (!stale) setServerLoading(false) })
    return () => { stale = true }
  }, [audioLanguage, ref, coordinator, pinnedProvider, serverRequested, serverAttempt, requestInput, setServers])

  const switchServer = useCallback(async (providerId: string) => {
    if (!session || requestRef.current) return
    const choice = sourceChoice(providerId, servers)
    if (!choice) return
    if (session.source.providerId === choice.providerId && (!choice.sourceKey || session.source.serverId === choice.sourceKey)) { setManualServer(providerId); return }
    const controller = new AbortController(); requestRef.current = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)])
    const wasSourceFailed = sourceFailed.current
    if (wasSourceFailed) { setRecoveryKind(session.source.type === 'iframe' ? 'external' : 'interrupted'); setRecoveryCheckpoint(clock.current.position) }
    setBusy(true); setError(null); setRecoveryActive(wasSourceFailed); setRecoveryProgress(null)
    try {
      const next = await coordinator.switchAvailable(session, choice.providerId, servers, signal, choice.sourceKey)
      if (controller.signal.aborted || latestRecording.current !== recording) return
      if (next.ref.id !== session.ref.id || next.ref.kind !== session.ref.kind || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Playback returned a different title.')
      if (next.source.providerId !== choice.providerId || (choice.sourceKey && next.source.serverId !== choice.sourceKey)) {
        // The chosen server didn't answer and a fallback took over: say so.
        // Falling through silently is the bug where clicks "land on another
        // provider" with no explanation.
        manualNotice.current = true
        showNotice(next.source.type === 'iframe' ? 'External player selected.' : 'Playback resumed from another source.')
      }
      setResume({ position: clock.current.position, playing: clock.current.playing }); setSession(next)
      setRecoveryCheckpoint(clock.current.position)
      setManualServer(next.source.providerId === choice.providerId && (!choice.sourceKey || next.source.serverId === choice.sourceKey) ? providerId : null)
      setLocalSource(next.source); sourceFailed.current = false
      setError(null); setRecoveryConnection(null); setRecoveryActive(false)
      if (castSender.status) {
        try { await loadCastMedia(next) }
        catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') }
      }
    } catch {
      if (controller.signal.aborted || latestRecording.current !== recording) return
      if (sourceFailed.current) {
        const kind: PlaybackRecoveryViewModel['kind'] = session.source.type === 'iframe' ? 'external' : 'interrupted'
        setRecoveryCheckpoint(clock.current.position)
        setRecoveryKind(kind); setRecoveryActive(true)
        setError(kind === 'external' ? 'The provider player couldn’t load.' : 'Playback stopped before the selected source was ready.')
      } else {
        showNotice('Couldn’t switch sources. Current source is unchanged.')
      }
    }
    finally { finishRequest(controller, () => switchServer(providerId)) }
  }, [session, finishRequest, servers, coordinator, showNotice, castSender, loadCastMedia, recording, setLocalSource, setSession])

  const switchQuality = useCallback(async (value: string) => {
    const height = Number(value)
    if (!session || requestRef.current || !session.source.qualityHeights?.includes(height) || session.source.qualityHint === `${height}p`) return
    const controller = new AbortController(); requestRef.current = controller
    const retained = { position: clock.current.position, playing: clock.current.playing }
    setBusy(true)
    try {
      const next = await switchPlaybackProvider(session.id, { providerId: session.source.providerId, preferences: { qualityHeight: height, audioLanguage: audioLanguageProp ?? intent.current.audioLanguage, adsEnabled: adsEnabled.current } }, controller.signal)
      if (controller.signal.aborted || latestRecording.current !== recording) return
      if (next.source.providerId !== session.source.providerId || next.ref.kind !== session.ref.kind || next.ref.id !== session.ref.id || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Unexpected quality source.')
      createQualityPreference().choose({ value, label: `${height}p`, height })
      remember({ qualityHeight: height })
      coordinator.setPreferences({ qualityHeight: height, audioLanguage: audioLanguageProp ?? intent.current.audioLanguage })
      setResume(retained); setSession(next); setLocalSource(next.source); sourceFailed.current = false
      setRecoveryConnection(null)
      if (castSender.status) {
        try { await loadCastMedia(next) }
        catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') }
      }
    } catch {
      if (!controller.signal.aborted) showNotice('Quality unchanged. Playback continues; retry in Settings.')
    } finally { finishRequest(controller, () => switchQuality(value)) }
  }, [session, audioLanguageProp, coordinator, castSender, loadCastMedia, showNotice, finishRequest, remember, recording, setLocalSource, setSession])

  // Lab pin (?provider=): after the opening resolve lands on another
  // provider, switch once to the pinned one. Consumed immediately so
  // recovery and manual server switches keep working normally afterwards.
  const pinConsumed = useRef(false)
  useEffect(() => {
    if (!pinnedProvider || pinConsumed.current || !session || requestRef.current) return
    if (session.source.providerId === pinnedProvider) { pinConsumed.current = true; return }
    if (!sourceChoice(pinnedProvider, servers)) return
    pinConsumed.current = true
    void switchServer(pinnedProvider)
  }, [pinnedProvider, session, servers, switchServer])

  // Title-scoped discovery supplies prepared first-party caption files,
  // independently of the selected streaming provider. Enabled viewing
  // preferences start discovery with Watch, before Play. Prepared tracks
  // merge live without reloading media; discovery failures leave native
  // tracks from the active media engine available. Preferred languages ride
  // along so discovery tries those first; changing them refetches live.
  const latestSubtitleVideo = useRef(session?.source.videoVersion ?? session?.id)
  useLayoutEffect(() => {
    latestSubtitleVideo.current = session?.source.videoVersion ?? session?.id
  }, [session?.source.videoVersion, session?.id])
  const [activeSubtitleIdentity, setActiveSubtitleIdentity] = useState<{ id: string; checksum?: string | undefined } | null>(null)
  const [engineSubtitles, setEngineSubtitles] = useState<AggregatedSubtitle[]>([])
  const preparedSubtitleFiles = useRef(new Map<string, { id: string; label: string; language: string; url: string; contentChecksum?: string | undefined }>())
  const subtitleDiscoveryScope = useRef<string | null>(null)
  const subtitleContinuation = useRef<string | undefined>(undefined)
  const [subtitleHasMore, setSubtitleHasMore] = useState(false)
  const [subtitleSearchId, setSubtitleSearchId] = useState<string | null>(null)
  const [subtitleLanguages, setSubtitleLanguages] = useState<SubtitleDiscoveryEvent['languages']>([])
  const [subtitleProviders, setSubtitleProviders] = useState<SubtitleProviderStatus[]>([])
  const [subtitleLoading, setSubtitleLoading] = useState(openingPreferences.subtitlesEnabled)
  const [subtitleError, setSubtitleError] = useState<string | null>(null)
  const [subtitleRequested, setSubtitleRequested] = useState(openingPreferences.subtitlesEnabled)
  const [subtitleAttempt, setSubtitleAttempt] = useState(0)
  const subtitleSessionReady = Boolean(session && session.source.type !== 'iframe')
  const [subtitleLangs, setSubtitleLangs] = useState<string[]>(openingPreferences.subtitleLanguages)
  useEffect(() => {
    const sync = () => setSubtitleLangs(readStoredSubtitleLanguages())
    window.addEventListener(SUBTITLE_LANGUAGES_EVENT, sync)
    return () => window.removeEventListener(SUBTITLE_LANGUAGES_EVENT, sync)
  }, [])
  useEffect(() => {
    if (!subtitleSessionReady || !subtitleRequested) return
    const scope = JSON.stringify([ref, session?.source.videoVersion ?? session?.id, subtitleLangs])
    if (subtitleDiscoveryScope.current !== scope) {
      subtitleDiscoveryScope.current = scope; subtitleContinuation.current = undefined
      setSubtitleSearchId(null); setSubtitleProviders([]); setSubtitleLanguages([]); setSubtitleLoading(true)
    }
    let active = true
    const controller = new AbortController()
    void discoverSubtitles(
      { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
      controller.signal,
      (event) => {
        if (!active) return
        setSubtitleSearchId(event.searchId)
        setSubtitleLanguages(event.languages)
        if (event.provider) setSubtitleProviders((current) => [...current.filter((item) => item.id !== event.provider!.id), event.provider!])
        if (event.type === 'complete') { subtitleContinuation.current = event.nextCursor; setSubtitleHasMore(Boolean(event.nextCursor)); setSubtitleLoading(false) }
      },
      subtitleLangs,
      subtitleContinuation.current,
      session?.id,
    ).then(
      () => { if (active) setSubtitleLoading(false) },
      () => { if (active) { setSubtitleLoading(false); setSubtitleError('Subtitle search is unavailable. Try again.') } },
    )
    // Stale callbacks are ignored by `active`. Let discovery settle instead
    // of aborting its fetch during an effect cleanup: Next's dev runtime can
    // surface that cancellation as an uncaught AbortError overlay.
    return () => { active = false }
  }, [subtitleSessionReady, session?.id, session?.source.videoVersion, ref, subtitleRequested, subtitleAttempt, subtitleLangs])
  // The Watch captions menu also includes the first-party subtitle aggregate,
  // which is independent of the selected streaming provider. Discovery above
  // powers Search providers again; this request supplies ready-to-play tracks immediately
  // when the menu opens (or when subtitles are enabled in viewing preferences).
  useEffect(() => {
    if (!subtitleSessionReady || !subtitleRequested) return
    const currentRecording = recording
    let active = true
    const controller = new AbortController()
    void fetchAggregatedSubtitles(ref, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])).then(
      (tracks) => {
        if (!active || latestRecording.current !== currentRecording) return
        setEngineSubtitles((current) => {
          const byUrl = new Map(current.map((track) => [track.url, track]))
          for (const track of tracks) if (track.url && !byUrl.has(track.url)) byUrl.set(track.url, track)
          return [...byUrl.values()]
        })
      },
      () => { /* Subtitle aggregation is optional; playback and discovery remain available. */ },
    )
    return () => { active = false; controller.abort() }
  }, [subtitleSessionReady, ref, subtitleRequested, recording])
  const loadSubtitlePage = useCallback(async (language: string, cursor: number): Promise<{ tracks: SubtitleCandidate[]; total: number; nextCursor: number | null }> => {
    if (!subtitleSearchId) return { tracks: [], total: 0, nextCursor: null }
    return pageSubtitles(subtitleSearchId, language, cursor, subtitleLangs, AbortSignal.timeout(10_000))
  }, [subtitleSearchId, subtitleLangs])
  const searchSubtitleCandidates = useCallback(async (query: string, cursor: number) => {
    if (!subtitleSearchId) return { tracks: [], total: 0, nextCursor: null }
    return searchSubtitles(subtitleSearchId, query, cursor, AbortSignal.timeout(10_000))
  }, [subtitleSearchId])
  const selectSubtitleCandidate = useCallback(async (candidate: SubtitleCandidate) => {
    if (!subtitleSearchId) throw new Error('Search subtitles again.')
    const version = latestSubtitleVideo.current
    // Preparation rechecks provider disable switches and cached-file existence.
    const track = await prepareSubtitle(subtitleSearchId, candidate.id, AbortSignal.timeout(11_000), candidate)
    if (latestRecording.current !== recording || latestSubtitleVideo.current !== version) throw new Error('The recording changed. Choose subtitles again.')
    const attached = preparedSubtitleFiles.current.get(track.url)
    if (attached) return attached
    setActiveSubtitleIdentity({ id: track.id, checksum: track.contentChecksum })
    const file = { id: track.id, contentChecksum: track.contentChecksum, label: track.label, language: track.language, url: track.url }
    preparedSubtitleFiles.current.set(track.url, file)
    setEngineSubtitles((current) => [...current, file])
    return track
  }, [subtitleSearchId, recording])
  // Exact recording/file corrections. Legacy title-wide offsets are retained
  // on the API but are never applied to an unknown video version.
  const correctionScope = useMemo(() => {
    const videoVersion = session?.source.videoVersion
    const contentChecksum = activeSubtitleIdentity?.checksum
    return videoVersion && contentChecksum ? { videoVersion, contentChecksum } : null
  }, [session?.source.videoVersion, activeSubtitleIdentity?.checksum])
  const correctionKey = JSON.stringify([memberId ?? 'guest', ref, session?.source.videoVersion ?? session?.id, activeSubtitleIdentity?.id, correctionScope?.contentChecksum])
  const [delayState, setDelayState] = useState<{ key: string; value: number } | null>(null)
  const syncedDelay = delayState?.key === correctionKey ? delayState.value : 0
  const saveDelayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingDelay = useRef<{ memberId: string; ref: PlaybackRef; offsetMs: number; scope: { videoVersion: string; contentChecksum: string } } | null>(null)
  useEffect(() => {
    if (!correctionScope) return
    let active = true
    if (!memberId) {
      queueMicrotask(() => {
        if (!active) return
        try { const value = Number(localStorage.getItem(`consumit.caption-correction.v1:${correctionKey}`) ?? 0); if (Number.isInteger(value) && Math.abs(value) <= 120000) setDelayState({ key: correctionKey, value }) } catch { /* Device storage is optional. */ }
      })
      return () => { active = false }
    }
    const controller = new AbortController()
    void fetchSubtitlePreference(ref, controller.signal, correctionScope).then(
      preference => { if (active) setDelayState({ key: correctionKey, value: preference?.offsetMs ?? 0 }) }, () => {},
    )
    return () => { active = false; controller.abort() }
  }, [correctionKey, correctionScope, memberId, ref])
  const persistDelay = useCallback((offsetMs: number) => {
    setDelayState({ key: correctionKey, value: offsetMs })
    if (!correctionScope) return
    if (!memberId) {
      try { localStorage.setItem(`consumit.caption-correction.v1:${correctionKey}`, String(offsetMs)) } catch { /* Device storage is optional. */ }
      return
    }
    pendingDelay.current = { memberId, ref, offsetMs, scope: correctionScope }
    clearTimeout(saveDelayTimer.current)
    saveDelayTimer.current = setTimeout(() => {
      const pending = pendingDelay.current; pendingDelay.current = null
      if (pending) void saveSubtitlePreference(pending.ref, { offsetMs: pending.offsetMs }, AbortSignal.timeout(10_000), pending.scope).catch(() => {})
    }, 1200)
  }, [memberId, ref, correctionKey, correctionScope])
  const flushPendingDelay = useCallback(() => {
    clearTimeout(saveDelayTimer.current)
    const pending = pendingDelay.current; pendingDelay.current = null
    if (pending) void saveSubtitlePreference(pending.ref, { offsetMs: pending.offsetMs }, AbortSignal.timeout(10_000), pending.scope).catch(() => {})
  }, [])
  useEffect(() => () => flushPendingDelay(), [flushPendingDelay, correctionKey])

  // Only first-party prepared caption files join the player. Raw sidecar URLs
  // attached to the active source or alternate servers can require provider
  // headers, expire, or reject browser CORS; discovery prepares them through
  // the validated subtitle file route before selection.
  const extraSubtitles = useMemo(() => {
    const seenUrls = new Set<string>()
    return engineSubtitles.filter((track) => {
      if (!track.url || seenUrls.has(track.url)) return false
      seenUrls.add(track.url)
      return true
    })
  }, [engineSubtitles])
  const startedRecording = useRef<typeof recording | null>(null)
  // A recording transition resets its session, never the video or fullscreen element.
  // The progress effect's cleanup snapshots the preceding recording before this setup.
  useEffect(() => {
    if (storedAudio === null || startedRecording.current === recording) return
    startedRecording.current = recording
    flushPendingDelay()
    requestRef.current?.abort(); requestRef.current = null
    audioRequestRef.current?.abort(); audioLoadedSession.current = null
    interruptedRequest.current = null
    clockRecording.current = recording
    clock.current = { position: 0, duration: 0, playing: false, completed: false }
    completionId.current = null; completionWrite.current = null; saveInFlight.current = null; lastSynced.current = undefined
    setSession(null); setLocalSource(undefined); setResume({ position: 0, playing: false })
    setEnded(false); setPostWatchAction(null); setPostWatchDismissed(false); setCountdown(null); setError(null); setRecoveryConnection(null); setRecoveryActive(false); setRecoveryKind('startup'); setRecoveryCheckpoint(0); setRecoveryProgress(null); setNotice(null); setSyncError(false); setSyncNoticeDismissed(false)
    clearTimeout(noticeTimer.current); prevProvider.current = null; pinConsumed.current = false
    setSeparateAudioTracks([]); setSeparateAudioLoading(false); setSeparateAudioError(null)
    subtitleContinuation.current = undefined
    preparedSubtitleFiles.current.clear(); setEngineSubtitles([]); setSubtitleSearchId(null)
    setSubtitleLanguages([]); setSubtitleProviders([]); setSubtitleError(null); setActiveSubtitleIdentity(null); setDelayState(null)
    setSubtitleLoading(intent.current.subtitlesEnabled); setSubtitleRequested(intent.current.subtitlesEnabled)
    setManualServer(null); sourceFailed.current = false
    void start(null)
    // A hidden Activity may reconnect effects without changing recordings.
    // Late work is identity-guarded; do not restart a healthy same-recording request.
    // start intentionally captures only this recording's identity and opening preferences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, storedAudio])

  const episodeMeta = episode ? [episode.seasonNumber != null ? `S${episode.seasonNumber}` : null, `E${episode.episodeNumber}`].filter(Boolean).join(' · ') + (episode.title ? ` — ${episode.title}` : '') : null
  const frameProvider = localSource?.type === 'iframe' ? servers.find(provider => provider.id === localSource.providerId) : undefined
  const frameProviderName = frameProvider ? frameName(frameProvider) : localSource?.providerId
  const serverOptions = useMemo(() => {
    const nativeServers = servers.filter(provider => provider.deliveryMode !== 'embed')
    const options = servers.flatMap(provider => provider.servers?.length
      ? provider.servers.map(server => ({ value: sourceChoiceValue(provider.id, server.id), label: server.label, providerLabel: provider.label, detail: provider.label, delivery: provider.deliveryMode, health: provider.health, available: provider.available }))
      : [{ value: provider.id, label: provider.deliveryMode === 'embed' ? frameName(provider) : serverName(nativeServers.indexOf(provider)), providerLabel: provider.label, detail: [provider.label, provider.detail].filter(Boolean).join(' · '), delivery: provider.deliveryMode, health: provider.health, available: provider.available }])
    const activeProvider = servers.find(provider => provider.id === session?.source.providerId)
    const activeServer = activeProvider?.servers?.find(server => server.sourceKey === session?.source.serverId)
    const current = activeProvider && activeServer ? sourceChoiceValue(activeProvider.id, activeServer.id) : session?.source.providerId
    if (session && current && !options.some(option => option.value === current)) options.unshift({ value: current, label: 'Current server', providerLabel: session.source.providerId, detail: [session.source.providerId, session.source.qualityHint].filter(Boolean).join(' · '), delivery: session.source.delivery, health: 'ok', available: true })
    return options
  }, [servers, session])
  const selectedServerValue = useMemo(() => {
    if (!session) return undefined
    const provider = servers.find(item => item.id === session.source.providerId)
    const source = provider?.servers?.find(item => item.sourceKey === session.source.serverId)
    return provider && source ? sourceChoiceValue(provider.id, source.id) : session.source.providerId
  }, [servers, session])
  // Pause-overlay context from real catalog records only: year, runtime,
  // TMDB rating, and content rating plus the title or episode synopsis.
  const formatRuntime = (minutes: number | null | undefined) => {
    if (minutes == null || minutes <= 0) return null
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return hours > 0 ? `${hours}h ${rest}m` : `${minutes}m`
  }
  const pauseFacts = (episode
    ? [episodeMeta, formatRuntime(episode.runtimeMinutes ?? (title.kind === 'series' ? title.episodeRuntimeMinutes : null))]
    : [
        title.year,
        formatRuntime(title.kind === 'movie' ? title.runtimeMinutes : title.episodeRuntimeMinutes),
        title.tmdbRating != null ? `★ ${title.tmdbRating.toFixed(1)}` : null,
        title.kind === 'movie' ? title.certification : title.contentRating,
      ]
  ).filter((part): part is string | number => part != null && part !== '').join(' · ') || undefined
  const pauseOverview = episode?.overview || title.overview || undefined
  const recoveryView: PlaybackRecoveryViewModel | undefined = recoveryActive
    ? busy
      ? { phase: 'searching', kind: recoveryKind, ...(recoveryProgress ? { progress: { checked: recoveryProgress.tried, total: recoveryProgress.total } } : {}), checkpointSeconds: recoveryCheckpoint }
      : error
        ? { phase: 'failed', kind: recoveryKind, message: recoveryConnectionMessage(recoveryConnection, error), checkpointSeconds: recoveryCheckpoint }
        : undefined
    : undefined
  const recoveryExtraAction = title.kind === 'anime' && audioLanguage === 'en'
    ? <Link className={`${buttonVariants({ size: 'md', variant: 'ghost' })} min-h-11 w-full sm:w-auto`} href={`/watch/anime/${title.id}?episode=${episode?.episodeNumber ?? 1}&audio=sub`}>Watch SUB instead</Link>
    : undefined
  const postWatchAvailable = ended && Boolean(member) && !episode && !postWatchDismissed
  const episodeEnded = ended && Boolean(episode)
  const episodeCompletionVisible = episodeEnded && (!nextHref || (!autoNext && countdown === null))
  const episodeReturnHref = episode && title.kind === 'series'
    ? `${titleHref(title)}?season=${episode.seasonNumber}&episode=${episode.episodeNumber}#episode-${episode.seasonNumber}-${episode.episodeNumber}`
    : titleHref(title)
  const episodeReturnLabel = title.kind === 'series' ? 'Return to series' : 'Return to title'
  const stateText = recoveryView ? '' : postWatchAvailable ? 'Playback finished. Optional private follow-up actions are available.' : ended ? (episode ? 'Episode finished.' : 'Playback finished.') : error ?? (castStatus ? `Playing on ${castStatus.deviceName ?? 'TV'}` : busy ? (session ? 'Switching source…' : 'Finding a source…') : session ? '' : 'Finding a source…')

  const cancelRecoverySearch = () => {
    const request = requestRef.current; requestRef.current = null; request?.abort()
    setBusy(false); setRecoveryProgress(null); setRecoveryActive(true)
    setError(recoveryKind === 'startup' ? 'Source search stopped. Try Auto again or choose a source.' : 'Recovery stopped.')
  }
  const playerStatus = <div className="flex max-h-[55dvh] w-full max-w-xl flex-col items-center gap-2 overflow-y-auto text-sm text-copy">
    {!busy && error && !recoveryActive ? <p className="rounded-control border border-white/10 bg-black/95 p-3 text-sm text-copy" role="alert">{error}</p> : null}
    {!busy && notice && session ? <div aria-live="polite" className="flex max-w-[min(92vw,520px)] items-center gap-3 rounded-xl border border-white/10 bg-[#111114]/95 px-3 py-2.5 text-sm text-ink shadow-[0_16px_48px_rgb(0_0_0/45%)] backdrop-blur-xl" data-player-toast role="status">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-orange shadow-[0_0_12px_rgb(255_93_56/65%)]" />
      <span className="min-w-0 flex-1">{notice.message}</span>
      <button aria-label="Dismiss playback message" className="grid size-11 shrink-0 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={() => { clearTimeout(noticeTimer.current); setNotice(null) }} type="button"><X aria-hidden="true" className="size-4" /></button>
    </div> : null}
    {countdown !== null && autoplay && nextHref ? <div aria-label="Next episode countdown" className="flex flex-wrap items-center gap-3 rounded-control border border-white/10 bg-black/95 p-3 shadow-lg" role="group"><span role="status">Next episode in {countdown}s</span><Button className="min-h-[44px]" size="sm" onClick={() => void playNext()}>Play now</Button><Button className="min-h-[44px]" size="sm" variant="ghost" onClick={() => setCountdown(null)}>Cancel</Button></div> : null}
    {ended && nextHref && autoNext && countdown === null ? <div className="flex items-center gap-3 rounded-control border border-white/10 bg-black/95 p-3 shadow-lg"><span role="status">Up next</span><Button className="min-h-[44px]" size="sm" onClick={() => void playNext()}>Next episode</Button></div> : null}
    {episodeCompletionVisible ? <div aria-label="Episode finished" className="flex w-full max-w-[min(92vw,520px)] flex-wrap items-center justify-center gap-3 rounded-control border border-white/10 bg-black/95 p-3 text-ink shadow-lg" data-episode-completion role="group">
      <p className="text-sm font-semibold">Episode finished.</p>
      {nextHref ? <Button className="min-h-[44px]" size="sm" onClick={() => void playNext()}>Next episode</Button> : <Link className={`${buttonVariants({ size: 'sm', variant: 'secondary' })} min-h-[44px]`} href={episodeReturnHref}>{episodeReturnLabel}</Link>}
    </div> : null}
    {postWatchAvailable ? <section aria-label="After watching" className="w-full rounded-control border border-orange/30 bg-black p-4 text-left shadow-lg">
      <h2 className="text-sm font-bold text-ink">Keep a note of this watch?</h2>
      <p className="mt-1 text-xs leading-5 text-muted">It’s in your private Watch History. A rating follows your Ratings visibility; Diary and review are saved only if you choose them.</p>
      {postWatchAction === 'rating' ? <div className="mt-3 rounded-control border border-white/10 bg-white/5 p-3"><RatingWidget id={title.id} kind={title.kind} title={title.title} /><Button className="mt-2" size="sm" variant="ghost" onClick={() => setPostWatchAction(null)}>Done</Button></div> : null}
      {postWatchAction === null ? <div className="mt-3 flex flex-wrap gap-2"><Button className="min-h-[44px]" size="sm" variant="secondary" onClick={() => setPostWatchAction('rating')}>Rate this title</Button><Button className="min-h-[44px]" size="sm" variant="secondary" onClick={() => setPostWatchAction('diary')}>Add to Diary</Button><Button className="min-h-[44px]" size="sm" variant="secondary" onClick={() => setPostWatchAction('review')}>Write a review</Button><Button className="min-h-[44px]" size="sm" variant="ghost" onClick={() => setPostWatchDismissed(true)}>Not now</Button></div> : null}
      {postWatchAction === 'diary' || postWatchAction === 'review' ? <LogDialog id={title.id} kind={title.kind} mode={postWatchAction === 'diary' ? 'log' : 'review'} title={title.title} posterUrl={title.posterUrl ?? undefined} year={title.year} onClose={() => setPostWatchAction(null)} onSaved={() => { setPostWatchAction(null); setPostWatchDismissed(true) }} /> : null}
    </section> : null}
    {syncError && !syncNoticeDismissed ? <div className="flex max-w-[min(92vw,520px)] flex-wrap items-center gap-3 rounded-xl border border-white/12 bg-[#111114]/95 px-3 py-2.5 text-left shadow-[0_16px_48px_rgb(0_0_0/45%)] backdrop-blur-xl" data-player-toast>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-orange/25 bg-orange/10 text-orange"><CloudOff aria-hidden="true" className="size-[18px]" /></span>
      <span aria-live="polite" className="min-w-[8rem] flex-1" role="status">
        <span className="block text-sm font-semibold leading-5 text-ink">Progress saved on this device</span>
        <span className="block text-xs leading-4 text-muted">Retry account sync to make this checkpoint available on your other devices.</span>
      </span>
      <Button className="ml-12 min-h-[44px] shrink-0" loading={syncRetrying} onClick={() => void retryProgressSync()} size="sm" variant="secondary">{syncRetrying ? 'Syncing progress…' : 'Retry account sync'}</Button>
      <button aria-label="Dismiss progress sync message" className="grid size-11 shrink-0 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={() => setSyncNoticeDismissed(true)} type="button"><X aria-hidden="true" className="size-4" /></button>
    </div> : null}
  </div>

  // Embedded mode keeps the identical playback flow and Consumit Player,
  // only the outer composition changes so the anime watch screen can sit
  // the player beside its episode rail. Fullscreen stays the default for
  // movie/series watch.
  const embedded = layout === 'embedded'
  return (
    <main id="consumit-main-content" tabIndex={-1} className={embedded ? 'flex w-full min-w-0 flex-col overflow-hidden bg-black' : 'flex h-dvh flex-col bg-black'} data-consumit-player-screen data-layout={layout} data-session={session ? 'ready' : 'searching'}>
      {preferenceSyncError || experience.error ? <div className="mx-3 mt-3 flex shrink-0 flex-wrap items-center justify-center gap-3 rounded-control border border-white/10 bg-black/90 px-4 py-2 text-xs text-copy" data-player-preference-sync role="alert">{experience.error ?? 'Your choices could not sync. Playback continues.'}<Button className="min-h-[44px]" size="sm" variant="ghost" onClick={() => { void experience.retry().then(() => setPreferenceSyncError(false), () => setPreferenceSyncError(true)) }}>Retry preference sync</Button></div> : null}
      <section aria-label={`${name} playback`} className={embedded ? `relative flex w-full min-w-0 flex-col ${isFrame ? '' : 'aspect-video'}` : 'relative flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center'}>
        <p className="sr-only" role="status">{stateText}</p>
        {busy && session && isFrame && !recoveryView ? (
          <p className="pointer-events-none absolute left-1/2 bottom-24 z-10 -translate-x-1/2 rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink max-sm:bottom-52">
            Switching source…
          </p>
        ) : null}
        {!busy && notice && session && isFrame ? (
          <p className="pointer-events-none absolute left-1/2 bottom-24 z-10 max-w-[80%] -translate-x-1/2 truncate rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink max-sm:bottom-52" role="status">
            {notice.message}
          </p>
        ) : null}
        {castStatus ? (
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 bg-black p-6 text-center" data-consumit-casting>
            <Tv aria-hidden="true" className="size-10 text-copy" strokeWidth={1.5} />
            <p className="font-display text-3xl text-ink">{name}</p>
            <p className="text-sm text-copy" role="status">Playing on {castStatus.deviceName ?? 'TV'} · {formatClock(castStatus.position)}{castStatus.duration > 0 ? ` / ${formatClock(castStatus.duration)}` : ''}</p>
            <Button variant="secondary" onClick={() => castSender.endSession(true)}>Disconnect</Button>
          </div>
        ) : (
        isFrame && localSource ? <div className="flex min-h-0 w-full flex-1 flex-col">
          <ProviderFrame backHref={titleHref(title)} episodeContext={episodeMeta ?? undefined} episodePanel={episodePanel} key={localSource.id} src={localSource.src} title={name}
            providerName={frameProviderName}
            recovery={recoveryView} recoveryControlled onRecoveryCancel={cancelRecoverySearch} onRetryAuto={() => void start(null)} onFrameFailure={() => void recover('network')} recoveryExtraAction={recoveryExtraAction}
            audioLanguage={title.kind === 'anime' ? audioLanguage : undefined} onFallback={busy ? undefined : () => void recover('network', 'manual')}
            diagnosticSource={{ providerId: localSource.providerId, ref }} onDiagnostic={event => frameDiagnosticsRef.current?.push(event)}
            serverControl={<>
              <Select className="min-w-0 w-full [&_button[aria-haspopup]]:min-h-11" hideLabel label="Consumit Server" placeholder="Consumit Server" value={isFrame ? '' : selectedServerValue} disabled={busy || !serverOptions.some(option => option.delivery !== 'embed')} onFocus={requestServers} onPointerDown={requestServers} onValueChange={id => void switchServer(id)} options={serverOptions.filter(option => option.delivery !== 'embed').map(option => ({ value: option.value, label: `${option.label} · ${option.providerLabel}` }))} />
              <Select className="min-w-0 w-full [&_button[aria-haspopup]]:min-h-11" hideLabel label="External player" value={selectedServerValue ?? localSource.providerId} disabled={busy} onFocus={requestServers} onPointerDown={requestServers} onValueChange={id => void switchServer(id)} options={serverOptions.filter(option => option.delivery === 'embed').map(option => ({ value: option.value, label: option.label }))} />
              {serverLoading ? <span role="status" className="text-xs text-copy">Loading servers…</span> : null}
              {serverError ? <Button className="min-h-11" size="sm" variant="ghost" onClick={requestServers}>Retry server list</Button> : null}
              {prevHref || nextHref || audioControl ? <nav aria-label="Playback preferences" className="flex flex-wrap items-center gap-2">
                {prevHref ? <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href={prevHref}>Previous episode</Link> : null}
                {nextHref ? <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href={nextHref}>Next episode</Link> : null}
                {audioControl}
              </nav> : null}
            </>} />
        </div> : <ConsumitPlayer
          title={name}
          media={{ source: playerSource, resume: { positionSeconds: resume.position, playing: resume.playing }, recordingKey }}
          presentation={{
            backHref: titleHref(title), episodePanel, animeAudioControl: title.kind === 'anime' ? audioControl : undefined,
            theater, watchSettings: <>
            {prevHref || nextHref ? <>
              <div className="consumit-player-setting-row"><span className="flex-1 text-sm">Autoplay next episode</span><Toggle checked={autoplay} label="Autoplay next episode" onCheckedChange={value => { persistPref('consumit.player.autoplay', value, setAutoplay); remember({ autoplayNextEpisode: value }) }} /></div>
              <div className="consumit-player-setting-row"><span className="flex-1 text-sm">Show up-next card</span><Toggle checked={autoNext} label="Show up-next card" onCheckedChange={value => persistPref('consumit.player.auto-next', value, setAutoNext)} /></div>
            </> : null}
            </>, watchStatus: playerStatus, recovery: recoveryView, recoveryExtraAction,
            className: 'flex w-full flex-1 flex-col rounded-none border-0 max-sm:[&_[data-player-stage]]:my-0',
            posterSrc: watchPoster(episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl),
            preparationPosterSrc: title.kind === 'anime' ? watchPoster(title.backdropUrl ?? title.posterUrl) ?? null : undefined,
            topMeta: isFrame ? 'External player' : episodeMeta ?? (session ? 'Playing from Consumit' : undefined),
            preparing: !session && !error,
            preparationMeta: episodeMeta ?? [title.year, formatRuntime(title.kind === 'movie' ? title.runtimeMinutes : title.episodeRuntimeMinutes)].filter(Boolean).join(' · '),
            pauseFacts: postWatchAvailable || episodeEnded ? undefined : pauseFacts,
            pauseOverview: postWatchAvailable || episodeEnded ? undefined : pauseOverview,
            pauseLogoUrl: postWatchAvailable || episodeEnded ? undefined : title.logoUrl ?? undefined,
            pauseTitle: postWatchAvailable || episodeEnded ? undefined : title.title,
          }}
          controls={{
            preferences: {
              initialViewing: { ...viewingPreferences, audioLanguage },
              subtitleLanguages: openingPreferences.subtitleLanguages,
            },
            playback: {
              skipSegments: requestSkipTimes, autoSkip,
              previousEpisodeAvailable: Boolean(prevHref), nextEpisodeAvailable: Boolean(nextHref), theaterAvailable: embedded,
            },
            sourceSelection: {
              options: serverOptions, selected: selectedServerValue,
              auto: manualServer !== selectedServerValue, autoAvailable: true,
              requestAvailable: true, retryAvailable: true,
              recoveryCancelAvailable: true, recoveryChooseAvailable: true,
              loading: serverLoading, error: serverError, busy,
            },
            ...(localSource?.qualityHeights?.length ? { quality: {
              options: localSource.qualityHeights.map(height => ({ value: String(height), label: `${height}p` })),
              selected: localSource.qualityHint?.replace(/p$/, ''),
            } } : {}),
            ...(title.kind !== 'anime' ? { audio: {
              requestAvailable: true,
              separate: {
                tracks: separateAudioTracks, loading: separateAudioLoading, error: separateAudioError,
                continuityKey: `${title.kind}:${title.id}:${episode?.seasonNumber ?? 0}:${episode?.episodeNumber ?? 0}:${localSource?.providerId ?? ''}`,
                select: selectSeparateAudio,
              },
            } } : {}),
            cast: { available: castAvailable, connected: false, canConnect: true, check: checkCast },
            captions: {
              requestAvailable: true, refreshAvailable: true,
              discovery: { hasMore: subtitleHasMore, searchId: subtitleSearchId, languages: subtitleLanguages, providers: subtitleProviders, loading: subtitleLoading, error: subtitleError },
              contextKey: session?.source.videoVersion ?? session?.id,
              extraTracks: extraSubtitles, sync: { delayMs: syncedDelay },
              page: loadSubtitlePage, search: searchSubtitleCandidates, prepare: selectSubtitleCandidate,
            },
          }}
          onControlAction={action => {
            switch (action.type) {
              case 'back': router.push(titleHref(title), { scroll: false }); break
              case 'previous-episode': if (prevHref) router.push(prevHref, { scroll: false }); break
              case 'next-episode': if (nextHref) router.push(nextHref, { scroll: false }); break
              case 'theater-change': setTheater?.(action.enabled); break
              case 'recovery-cancel': cancelRecoverySearch(); break
              case 'retry': void start(null); break
              case 'source-change': if (session) void switchServer(action.value); else void start(action.value); break
              case 'source-auto': setManualServer(null); break
              case 'source-request': requestServers(); break
              case 'quality-change': void switchQuality(action.value); break
              case 'audio-request': requestAudio(); break
              case 'subtitle-change': {
                const track = [...preparedSubtitleFiles.current.values()].find(item => action.value === `external:consumit-external-${item.id}`)
                setActiveSubtitleIdentity(track ? { id: track.id, checksum: track.contentChecksum } : { id: action.value })
                break
              }
              case 'subtitle-request': if (!subtitleRequested || subtitleError) { setSubtitleLoading(true); setSubtitleError(null); setSubtitleRequested(true); setSubtitleAttempt(attempt => attempt + 1) } break
              case 'subtitle-refresh': if (!subtitleLoading) { setSubtitleLoading(true); setSubtitleError(null); setSubtitleProviders([]); setSubtitleRequested(true); setSubtitleAttempt(attempt => attempt + 1) } break
              case 'subtitle-delay-change': persistDelay(action.delayMs); break
              case 'auto-skip-change': handleAutoSkip(action.enabled); break
              case 'viewing-preferences-change': {
                const { audioLanguage: selectedAudio, subtitleLanguages, ...rest } = action.value
                remember({ ...rest, ...(subtitleLanguages ? { subtitleLanguages: [...subtitleLanguages] } : {}), ...(title.kind !== 'anime' && selectedAudio ? { audioLanguage: selectedAudio } : {}) })
                break
              }
              case 'media-preferences-change': coordinator.setPreferences({ ...action.value, ...(localSource?.qualityHeights?.length ? { qualityHeight: readQualityPreference() } : {}), audioLanguage: audioLanguageProp ?? intent.current.audioLanguage, adsEnabled: adsEnabled.current }); break
              case 'cast-click': void handleCastClick(); break
              case 'audio-change': case 'caption-size-change': case 'caption-background-change': case 'caption-position-change': case 'caption-font-change': case 'caption-color-change': case 'rate-change': case 'brightness-change': case 'recovery-choose-source': break
            }
          }}
          onSourceError={(reason, deliveryFailure) => void recover(reason, deliveryFailure)}
          onMediaObservation={(observation) => {
            switch (observation.type) {
              case 'time-update': {
                if (!localSource || latestRecording.current !== recording) return
                clock.current.position = observation.positionSeconds
                clock.current.duration = observation.durationSeconds
                const proof = routeProof.current
                if (proof.sourceId !== localSource.id) { proof.sourceId = localSource.id; proof.firstFrameAt = null; proof.advanced = false }
                if (proof.firstFrameAt !== null && !proof.advanced && observation.positionSeconds - proof.firstFrameAt >= 5) {
                  proof.advanced = true
                  eventsRef.current?.push({ type: 'advanced', position: observation.positionSeconds, delivery: localSource.delivery })
                }
                eventsRef.current?.sample(clock.current.position, clock.current.playing, localSource.delivery)
                if (localSource.delivery === 'direct' || localSource.delivery === 'relay') {
                  sampleAnalyticsPlayback(clock.current.position, clock.current.playing, localSource.delivery, 'html5')
                }
                return
              }
              case 'seeking':
                if (!localSource || latestRecording.current !== recording) return
                clock.current.position = observation.positionSeconds
                clock.current.duration = observation.durationSeconds
                eventsRef.current?.resetViewing()
                resetAnalyticsPlaybackSample()
                return
              case 'play': {
                if (!localSource || latestRecording.current !== recording) return
                setRecoveryConnection(null)
                const replay = clock.current.completed
                if (replay) completionId.current = null
                clock.current.playing = true
                clock.current.completed = false
                setEnded(false)
                setPostWatchAction(null)
                setPostWatchDismissed(false)
                if (replay) {
                  const previous = completionWrite.current
                  void (previous ?? Promise.resolve()).then(() => { if (!clock.current.completed) void save(true, true) })
                }
                if (!subtitleRequested) { setSubtitleLoading(true); setSubtitleRequested(true) }
                return
              }
              case 'pause':
                if (!localSource || latestRecording.current !== recording) return
                eventsRef.current?.resetViewing()
                resetAnalyticsPlaybackSample()
                clock.current.playing = false
                if (!requestRef.current) void save(false, true)
                return
              case 'ended':
                if (localSource && latestRecording.current === recording) {
                  resetAnalyticsPlaybackSample()
                  completePlayback()
                }
                return
              case 'seeked':
                void save(false, true)
                return
              case 'duration-change':
              case 'playing':
                return
            }
          }}
          onPlaybackEvent={(event) => {
            if (event.type === 'started' && localSource) {
              routeProof.current = { sourceId: localSource.id, firstFrameAt: event.position, advanced: false }
            }
            eventsRef.current?.push({ ...event, ...(localSource ? { delivery: localSource.delivery } : {}) })
            if (event.type === 'started') startAnalyticsPlayback('html5')
            if (event.type === 'buffer-start' || event.type === 'buffer-end') resetAnalyticsPlaybackSample()
          }}
        />
        )}

      </section>
      {embedded && error && !recoveryActive ? <div className="border-t border-white/10 bg-canvas px-4 py-3 text-sm text-copy" role="alert">{error}</div> : null}

      {embedded && isFrame && (prevHref || nextHref) ? <nav aria-label="Episode" className="flex justify-end gap-2 border-t border-white/10 bg-black px-3 py-2">{prevHref ? <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={prevHref}>Previous episode</Link> : null}{nextHref ? <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={nextHref}>Next episode</Link> : null}</nav> : null}

    </main>
  )
}
