'use client'

import { CloudOff, Tv, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { titleHref, experiencePreferencesSchema, type PlaybackProvider, type PlaybackRef, type PlaybackSession, type DeliveryFailure, type SeparateAudioTrack, type ExperiencePreferences, type ExperiencePatch } from '@consumit/contracts'
import { Button, ConsumitPlayer, Select, Toggle, buttonVariants, SUBTITLE_LANGUAGES_EVENT, readStoredSubtitleLanguages, readQualityPreference, createQualityPreference } from '@consumit/ui'
import { useSession } from '../session/session'
import { useExperience } from '../experience/experience-provider'
import { applyPlayerDefaults } from '@/lib/experience-storage'
import { browserSkipTimes } from '@/lib/skip-times-browser'
import { listPlaybackProviders, playbackCapabilities, playbackRequest, runPlaybackAttempt, switchPlaybackProvider, listSeparateAudio, prepareSeparateAudio } from '@/lib/playback-browser'
import { discoverSubtitles, pageSubtitles, searchSubtitles, prepareSubtitle, fetchSubtitlePreference, saveSubtitlePreference, type SubtitleDiscoveryEvent, type SubtitleCandidate, type SubtitleProviderStatus } from '@/lib/subtitles-browser'
import { PROGRESS_SYNC_INTERVAL_MS, hasMeaningfulProgressChange, readPlaybackProgress, writePlaybackProgress, type ProgressCheckpoint } from '@/lib/playback-progress'
import { createPlaybackEvents } from '@/lib/playback-events'
import { createFrameDiagnostics } from '@/lib/provider-frame-events'
import { createPlaybackCoordinator, watchSourceExpiry } from '@/lib/playback-coordinator'
import { castContentType, createCastSender, type CastStatus } from '@/lib/cast-sender'

import type { WatchEpisode, WatchTitle } from './watch-screen'
import { ProviderFrame } from '../shared/provider-frame'
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
  if (!experience.ready) return <ConsumitPlayer backHref={titleHref(props.title)} title={props.title.title} preparing posterSrc={watchPoster(props.title.backdropUrl ?? props.title.posterUrl)} />
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
    ...localSource, type: localSource.type,
    ...(localSource.delivery === 'relay' && localSource.type === 'hls' ? { relayLease: () => {
      const next = latestLease.current
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
        setSeparateAudioError('No additional audio languages were found. Close and reopen Audio to retry.')
      }
    }).catch(() => {
      if (!request.signal.aborted) { audioLoadedSession.current = null; setSeparateAudioError('More languages are unavailable right now. Close and reopen Audio to retry.') }
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
  const [syncError, setSyncError] = useState(false)
  const [syncNoticeDismissed, setSyncNoticeDismissed] = useState(false)
  const [ended, setEnded] = useState(false)
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
  const requestInput = useCallback((currentRef: PlaybackRef, preferences?: import('@consumit/contracts').PlaybackPreferences) => ({ ref: currentRef, capabilities: playbackCapabilities(), audioLanguage: audioLanguageProp ?? intent.current.audioLanguage, preferences: { qualityHeight: intent.current.qualityHeight, audioLanguage: audioLanguageProp ?? intent.current.audioLanguage, ...preferences, adsEnabled: adsEnabled.current } }), [audioLanguageProp])
  const clockRecording = useRef(recording)
  const clock = useRef({ position: 0, duration: 0, playing: false, completed: false })
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
  const saveInFlight = useRef<Promise<void> | null>(null)
  const completionWrite = useRef<Promise<void> | null>(null)
  const lastSynced = useRef<ProgressCheckpoint | undefined>(undefined)
  const eventsRef = useRef<ReturnType<typeof createPlaybackEvents> | null>(null)
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
        await writePlaybackProgress(ref, snapshot.position, snapshot.duration, snapshot.completed, memberId, keepalive, snapshot.completionId)
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

  useEffect(() => {
    const timer = setInterval(() => { if (clock.current.playing) void save() }, PROGRESS_SYNC_INTERVAL_MS)
    const flush = () => { void save(true) }
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => { clearInterval(timer); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); void save(true) }
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
        }
        if (!status.playing) tvPlaying.current = false
        if (status.duration > 0 && status.position >= status.duration - 1 && !clock.current.completed) {
          eventsRef.current?.push({ type: 'ended', position: status.position })
          completePlayback()
        }
      } else if (wasCasting.current) {
        wasCasting.current = false
        tvPlaying.current = false
        clock.current.playing = true
        setResume({ position: clock.current.position, playing: true })
      }
    }
    updateCastStatus.current = update
    const unsubscribe = castSender.subscribe(update)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [castSender, completePlayback, recording])
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
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null); setEnded(false); setCountdown(null); setRecoveryProgress(null); setManualServer(choiceValue)
    try {
      const [next, position] = await Promise.all([
        coordinator.resolve({ ...requestInput(ref), ...(choice ? { ...choice } : {}) }, controller.signal),
        readPlaybackProgress(ref, controller.signal, memberId),
      ])
      if (controller.signal.aborted || latestRecording.current !== recording) return
      if (next.ref.id !== ref.id || next.ref.kind !== ref.kind || next.ref.season !== ref.season || next.ref.episode !== ref.episode) throw new Error('Playback returned a different title.')
      if (choice && (next.source.providerId !== choice.providerId || (choice.sourceKey && next.source.serverId !== choice.sourceKey))) throw new Error('The selected server couldn’t start. Choose another server.')
      const resumePosition = session && sameRef(session.ref) && !clock.current.completed ? clock.current.position : position
      setResume({ position: resumePosition, playing: true }); clock.current.position = resumePosition; clock.current.playing = true; clock.current.completed = false
      setSession(next)
      setLocalSource(next.source); sourceFailed.current = false
      if (castSender.status) {
        try { await loadCastMedia(next, { position: resumePosition, playing: true }, controller.signal) }
        catch { if (!controller.signal.aborted) { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') } }
      }
    } catch (cause) { if (!controller.signal.aborted && latestRecording.current === recording) setError(cause instanceof Error ? cause.message : 'Playback could not start. Try again.') }
    finally { finishRequest(controller, () => start(choiceValue)) }
  }

  const recover = useCallback(async (reason: 'network' | 'media' | 'expired' | 'gone', deliveryFailure?: DeliveryFailure) => {
    storePlaybackDiagnostics({ ref, browser: browserName(), category: reason, ...(session ? { provider: session.source.providerId, delivery: session.source.delivery } : {}) })
    if (reason !== 'expired') sourceFailed.current = true
    if (!session || requestRef.current) return
    if (reason !== 'expired' && !castSender.status && localSource &&
        session.source.providerId === localSource.providerId &&
        session.source.type === localSource.type && session.source.delivery === localSource.delivery &&
        session.source.src !== localSource.src && Date.parse(session.source.expiresAt) > Date.now() + 15_000) {
      setResume({ position: clock.current.position, playing: clock.current.playing })
      setLocalSource(session.source); sourceFailed.current = false
      setError(null)
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
        if (next.source.providerId !== session.source.providerId) setManualServer(null)
        latestLease.current = next.source
        const keepAttached = reason === 'expired' && !sourceFailed.current && !castSender.status && localSource &&
          next.source.providerId === localSource.providerId && next.source.type === localSource.type &&
          next.source.delivery === localSource.delivery && next.source.id === localSource.id
        if (!keepAttached) { setLocalSource(next.source); sourceFailed.current = false }
        if (castSender.status) {
          try { await loadCastMedia(next) }
          catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') }
        }
      }
    } catch (cause) { if (!controller.signal.aborted && latestRecording.current === recording) setError(cause instanceof Error ? cause.message : 'We couldn’t restore playback. Try again or return to the title.') }
    finally { finishRequest(controller, () => recover(reason, deliveryFailure)) }
  }, [session, localSource, finishRequest, coordinator, castSender, loadCastMedia, showNotice, ref, recording, setLocalSource, setSession])

  useEffect(() => {
    // Renew every active playback lease, regardless of whether the diagnostic
    // provider pin is enabled.
    if (!session) return
    if (session.source.type === 'iframe') return
    return watchSourceExpiry(session.source.expiresAt, () => void recover('expired'), session.source.delivery === 'relay' ? 60_000 : 15_000)
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
    setBusy(true); setError(null)
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
      setManualServer(next.source.providerId === choice.providerId && (!choice.sourceKey || next.source.serverId === choice.sourceKey) ? providerId : null)
      setLocalSource(next.source); sourceFailed.current = false
      if (castSender.status) {
        try { await loadCastMedia(next) }
        catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') }
      }
    } catch {
      if (controller.signal.aborted || latestRecording.current !== recording) return
      // Full failure keeps playing the current server, so it is a toast,
      // not the error overlay (which only renders when nothing is playing).
      showNotice(session.source.type === 'iframe' ? 'Couldn’t switch servers. Reload this player or choose another.' : 'Couldn’t switch sources. Playback is still available.')
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
      if (castSender.status) {
        try { await loadCastMedia(next) }
        catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') }
      }
    } catch {
      if (!controller.signal.aborted) showNotice('Couldn’t change quality. Keeping the current stream.')
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

  // Aggregated engine captions (YIFY, TVSubtitles, CastleSubs, NxshaSubs,
  // SubSource, VDRK) join the menu independently of the streaming provider.
  // Enabled viewing preferences start discovery with Watch, before Play.
  // Tracks merge live without reloading media; a
  // failure only means the menu shows the streaming providers' own tracks.
  // The member's preferred subtitle languages ride along so the engine
  // tries those first; changing them refetches live.
  const [engineSubtitles, setEngineSubtitles] = useState<{ id: string; label: string; language: string; url: string }[]>([])
  const preparedSubtitleFiles = useRef(new Map<string, { id: string; label: string; language: string; url: string }>())
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
        if (event.type === 'complete') setSubtitleLoading(false)
      },
      subtitleLangs,
    ).then(
      () => { if (active) setSubtitleLoading(false) },
      () => { if (active) { setSubtitleLoading(false); setSubtitleError('Subtitle search is unavailable. Try again.') } },
    )
    // Stale callbacks are ignored by `active`. Let discovery settle instead
    // of aborting its fetch during an effect cleanup: Next's dev runtime can
    // surface that cancellation as an uncaught AbortError overlay.
    return () => { active = false }
  }, [subtitleSessionReady, ref, subtitleRequested, subtitleAttempt, subtitleLangs])
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
    // Preparation rechecks provider disable switches and cached-file existence.
    const track = await prepareSubtitle(subtitleSearchId, candidate.id, AbortSignal.timeout(11_000))
    if (latestRecording.current !== recording) throw new Error('The episode changed. Choose subtitles again.')
    const attached = preparedSubtitleFiles.current.get(track.url)
    if (attached) return attached
    const file = { id: track.id, label: track.label, language: track.language, url: track.url }
    preparedSubtitleFiles.current.set(track.url, file)
    setEngineSubtitles((current) => [...current, file])
    return track
  }, [subtitleSearchId, recording])
  // Per-member subtitle sync correction: signed-in members reload their
  // stored offset per title and every nudge persists (debounced) — guests
  // keep the player's device-local behavior only. The screen remounts per
  // title, so no cross-title leakage is possible.
  const [delayState, setDelayState] = useState<{ sessionId: string; value: number } | null>(null)
  const syncedDelay = delayState && session && delayState.sessionId === session.id ? delayState.value : null
  const saveDelayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingDelay = useRef<{ memberId: string; ref: PlaybackRef; offsetMs: number } | null>(null)
  useEffect(() => {
    if (!memberId || !session) return
    let active = true
    const ref = session.ref
    void fetchSubtitlePreference(
      { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
      AbortSignal.timeout(10_000),
    ).then(
      (preference) => { if (active) setDelayState({ sessionId: session.id, value: preference?.offsetMs ?? 0 }) },
      () => {},
    )
    return () => { active = false }
  }, [session, memberId])
  const persistDelay = useCallback((offsetMs: number) => {
    if (session) setDelayState({ sessionId: session.id, value: offsetMs })
    if (!memberId || !session) return
    pendingDelay.current = { memberId, ref: session.ref, offsetMs }
    clearTimeout(saveDelayTimer.current)
    saveDelayTimer.current = setTimeout(() => {
      const pending = pendingDelay.current
      pendingDelay.current = null
      if (!pending) return
      const ref = pending.ref
      void saveSubtitlePreference(
        { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
        { offsetMs: pending.offsetMs },
        AbortSignal.timeout(10_000),
      ).catch(() => {})
    }, 1200)
  }, [memberId, session])
  const flushPendingDelay = useCallback(() => {
    clearTimeout(saveDelayTimer.current)
    const pending = pendingDelay.current
    pendingDelay.current = null
    if (!pending) return
    const ref = pending.ref
    void saveSubtitlePreference(
      { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
      { offsetMs: pending.offsetMs },
      AbortSignal.timeout(10_000),
    ).catch(() => {})
  }, [])
  useEffect(() => () => flushPendingDelay(), [flushPendingDelay])

  // Every answering provider's caption tracks join the menu: dedupe by file
  // URL (the same "English" label from five providers is five different
  // files), then disambiguate repeated labels with the supplying provider so
  // members can tell them apart. Memoized so the player only rebuilds tracks
  // when the set actually changes — never per render.
  const extraSubtitles = useMemo(() => {
    const seenUrls = new Set<string>()
    const collected: { id: string; label: string; language: string; url: string; provider: string }[] = []
    const push = (track: { id: string; label: string; language: string; url: string }, provider: string) => {
      if (!track.url || seenUrls.has(track.url)) return
      seenUrls.add(track.url)
      collected.push({ id: track.id, label: track.label, language: track.language, url: track.url, provider })
    }
    for (const track of session?.source.subtitles ?? []) push(track, session?.source.providerId ?? '')
    for (const server of servers) for (const track of server.subtitles ?? []) push(track, server.id)
    for (const track of engineSubtitles) push(track, '')
    const labelCounts = new Map<string, number>()
    for (const track of collected) labelCounts.set(track.label, (labelCounts.get(track.label) ?? 0) + 1)
    return collected.map(({ provider, ...track }) => (labelCounts.get(track.label) === 1 || !provider
      ? track
      : { ...track, label: `${track.label} · ${provider}` }))
  }, [session?.source.subtitles, session?.source.providerId, servers, engineSubtitles])
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
    setEnded(false); setCountdown(null); setError(null); setNotice(null); setSyncError(false); setSyncNoticeDismissed(false)
    clearTimeout(noticeTimer.current); prevProvider.current = null; pinConsumed.current = false
    setSeparateAudioTracks([]); setSeparateAudioLoading(false); setSeparateAudioError(null)
    preparedSubtitleFiles.current.clear(); setEngineSubtitles([]); setSubtitleSearchId(null)
    setSubtitleLanguages([]); setSubtitleProviders([]); setSubtitleError(null); setDelayState(null)
    setSubtitleLoading(intent.current.subtitlesEnabled); setSubtitleRequested(intent.current.subtitlesEnabled)
    setManualServer(null); sourceFailed.current = false
    void start(null)
    // A hidden Activity may reconnect effects without changing recordings.
    // Late work is identity-guarded; do not restart a healthy same-recording request.
    // start intentionally captures only this recording's identity and opening preferences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, storedAudio])

  const episodeMeta = episode ? [episode.seasonNumber != null ? `S${episode.seasonNumber}` : null, `E${episode.episodeNumber}`].filter(Boolean).join(' · ') + (episode.title ? ` — ${episode.title}` : '') : null
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
  const stateText = error ?? (castStatus ? `Playing on ${castStatus.deviceName ?? 'TV'}` : busy ? (session ? 'Switching source…' : 'Finding a source…') : session ? '' : 'Finding a source…')

  const cancelSearch = () => {
    const request = requestRef.current; requestRef.current = null; request?.abort()
    setBusy(false); setError(session ? null : 'Source search cancelled. Choose a server to start.'); setRecoveryProgress(null)
  }
  const playerStatus = <div className="flex max-h-[55dvh] w-full max-w-xl flex-col items-center gap-2 overflow-y-auto text-sm text-copy">
    {busy && recoveryProgress ? <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-control border border-white/10 bg-black/95 px-4 py-2.5 shadow-lg" role="status"><span>Checked {recoveryProgress.tried} of {recoveryProgress.total} servers</span><Button size="sm" variant="ghost" onClick={cancelSearch}>Cancel search</Button></div> : null}
    {busy && session && !recoveryProgress ? <p role="status" className="pointer-events-none rounded-control border border-white/10 bg-black/95 px-4 py-2.5 shadow-lg">Switching source…</p> : null}
    {!busy && error ? <div role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-control border border-white/10 bg-black/95 p-4 shadow-lg"><p className="w-full">{error}</p><Button onClick={() => void start()} size="sm">Try again</Button>
      <Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(title)}>Return to title</Link>
      {title.kind === 'anime' && audioLanguage === 'en' ? <Link className={buttonVariants({ variant: 'secondary' })} href={`/watch/anime/${title.id}?episode=${episode?.episodeNumber ?? 1}&audio=sub`}>Watch SUB instead</Link> : null}<Select className="w-64 max-w-full" hideLabel label="Server" onValueChange={value => { if (session && value) void switchServer(value); else void start(value || null) }} options={[{ value: '', label: 'Auto' }, ...(['native', 'external'] as const).flatMap(group => serverOptions.filter(option => (option.delivery === 'embed') === (group === 'external')).map((option, index) => ({ value: option.value, label: option.delivery === 'embed' ? option.label : `${option.label} · ${option.providerLabel}`, ...(index === 0 ? { group: group === 'external' ? 'External players (fallback)' : 'Consumit Server' } : {}) })))]} value={manualServer ?? ''} /></div> : null}
    {!busy && notice && session ? <div aria-live="polite" className="flex max-w-[min(92vw,520px)] items-center gap-3 rounded-xl border border-white/10 bg-[#111114]/95 px-3 py-2.5 text-sm text-ink shadow-[0_16px_48px_rgb(0_0_0/45%)] backdrop-blur-xl" data-player-toast role="status">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-orange shadow-[0_0_12px_rgb(255_93_56/65%)]" />
      <span className="min-w-0 flex-1">{notice.message}</span>
      <button aria-label="Dismiss playback message" className="grid size-11 shrink-0 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={() => { clearTimeout(noticeTimer.current); setNotice(null) }} type="button"><X aria-hidden="true" className="size-4" /></button>
    </div> : null}
    {countdown !== null && autoplay && nextHref ? <div className="flex flex-wrap items-center gap-3 rounded-control border border-white/10 bg-black/95 p-3 shadow-lg"><span role="status">Next episode in {countdown}s</span><Button size="sm" onClick={() => void playNext()}>Play now</Button><Button size="sm" variant="ghost" onClick={() => setCountdown(null)}>Cancel</Button></div> : null}
    {ended && nextHref && autoNext ? <div className="flex items-center gap-3 rounded-control border border-white/10 bg-black/95 p-3 shadow-lg"><span role="status">Up next</span><Button size="sm" onClick={() => void playNext()}>Next episode</Button></div> : null}
    {syncError && !syncNoticeDismissed ? <div aria-live="polite" className="flex max-w-[min(92vw,520px)] items-center gap-3 rounded-xl border border-white/12 bg-[#111114]/95 px-3 py-2.5 text-left shadow-[0_16px_48px_rgb(0_0_0/45%)] backdrop-blur-xl" data-player-toast role="status">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-orange/25 bg-orange/10 text-orange"><CloudOff aria-hidden="true" className="size-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5 text-ink">Progress saved on this device</span>
        <span className="block text-xs leading-4 text-muted">Account sync will retry automatically.</span>
      </span>
      <button aria-label="Dismiss progress sync message" className="grid size-11 shrink-0 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={() => setSyncNoticeDismissed(true)} type="button"><X aria-hidden="true" className="size-4" /></button>
    </div> : null}
  </div>

  // Embedded mode keeps the identical playback flow and Consumit Player,
  // only the outer composition changes so the anime watch screen can sit
  // the player beside its episode rail. Fullscreen stays the default for
  // movie/series watch.
  const embedded = layout === 'embedded'
  return (
    <main className={embedded ? 'flex w-full min-w-0 flex-col overflow-hidden bg-black' : 'flex h-dvh flex-col bg-black'} data-consumit-player-screen data-layout={layout} data-session={session ? 'ready' : 'searching'}>
      <section aria-label={`${name} playback`} className={embedded ? `relative flex w-full flex-col ${isFrame ? '' : 'aspect-video'}` : 'relative flex min-h-0 w-full flex-1 flex-col justify-center'}>
        {preferenceSyncError || experience.error ? <div className="absolute inset-x-3 top-3 z-30 flex flex-wrap items-center justify-center gap-3 rounded-control bg-black/90 px-4 py-2 text-xs text-copy" role="alert">{experience.error ?? 'Your choices could not sync. Playback continues.'}<Button size="sm" variant="ghost" onClick={() => { void experience.retry().then(() => setPreferenceSyncError(false), () => setPreferenceSyncError(true)) }}>Retry preference sync</Button></div> : null}
        <p className="sr-only" role="status">{stateText}</p>
        {busy && session && isFrame ? (
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
          <ProviderFrame backHref={titleHref(title)} episodePanel={episodePanel} key={localSource.id} src={localSource.src} title={name} audioLanguage={title.kind === 'anime' ? audioLanguage : undefined} onFallback={busy ? undefined : () => void recover('network', 'manual')}
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
          backHref={titleHref(title)}
          episodePanel={episodePanel}
          animeAudioControl={title.kind === 'anime' ? audioControl : undefined}
          recordingKey={recordingKey}
          theater={theater} onTheaterChange={setTheater}
          watchSettings={<>
            {prevHref || nextHref ? <>
              <div className="consumit-player-setting-row"><span className="flex-1 text-sm">Autoplay next episode</span><Toggle checked={autoplay} label="Autoplay next episode" onCheckedChange={value => { persistPref('consumit.player.autoplay', value, setAutoplay); remember({ autoplayNextEpisode: value }) }} /></div>
              <div className="consumit-player-setting-row"><span className="flex-1 text-sm">Show up-next card</span><Toggle checked={autoNext} label="Show up-next card" onCheckedChange={value => persistPref('consumit.player.auto-next', value, setAutoNext)} /></div>
            </> : null}
          </>}
          watchStatus={playerStatus}
          initialViewingPreferences={{ ...viewingPreferences, audioLanguage }}
          subtitleLanguages={openingPreferences.subtitleLanguages}
          onViewingPreferencesChange={change => { const { audioLanguage: selectedAudio, subtitleLanguages, ...rest } = change; remember({ ...rest, ...(subtitleLanguages ? { subtitleLanguages: [...subtitleLanguages] } : {}), ...(title.kind !== 'anime' && selectedAudio ? { audioLanguage: selectedAudio } : {}) }) }}
          className="flex w-full flex-1 flex-col rounded-none border-0" title={name} posterSrc={watchPoster(episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl)}
          preparationPosterSrc={title.kind === 'anime' ? watchPoster(title.backdropUrl ?? title.posterUrl) ?? null : undefined}
          source={playerSource} extraSubtitles={extraSubtitles} resumeAt={resume.position} resumePlaying={resume.playing}
          audioContinuityKey={`${title.kind}:${title.id}:${episode?.seasonNumber ?? 0}:${episode?.episodeNumber ?? 0}:${localSource?.providerId ?? ''}`}
          onSkipSegmentsRequest={requestSkipTimes}
          {...{
            serverOptions, selectedServer: selectedServerValue,
            serverAuto: manualServer !== selectedServerValue,
            onServerAuto: () => setManualServer(null),
            onServerChange: (value: string) => { if (session) void switchServer(value); else void start(value) },
            onServerRequest: requestServers, serverLoading, serverError, serverBusy: busy,
          }}
          {...(localSource?.qualityHeights?.length ? {
            qualityOptions: localSource.qualityHeights.map(height => ({ value: String(height), label: `${height}p` })),
            selectedQuality: localSource.qualityHint?.replace(/p$/, ''),
            onQualityChange: (value: string) => { void switchQuality(value) },
          } : {})}
          {...(title.kind !== 'anime' ? { separateAudioTracks, separateAudioLoading, separateAudioError, onAudioRequest: requestAudio, onSeparateAudioSelect: selectSeparateAudio } : {})}
          castAvailable={castAvailable} castConnected={false} onCastCheck={checkCast} onCastClick={() => handleCastClick()}
          subtitleDiscovery={{ searchId: subtitleSearchId, languages: subtitleLanguages, providers: subtitleProviders, loading: subtitleLoading, error: subtitleError }}
          onSubtitlePage={loadSubtitlePage} onSubtitleSearch={searchSubtitleCandidates} onSubtitleCandidateSelect={selectSubtitleCandidate}
          topMeta={isFrame ? 'External player' : session ? 'Playing from Consumit' : undefined}
          preparing={!session && !error}
          preparationMeta={episodeMeta ?? [title.year, formatRuntime(title.kind === 'movie' ? title.runtimeMinutes : title.episodeRuntimeMinutes)].filter(Boolean).join(' · ')}
          onPreviousEpisode={prevHref ? () => router.push(prevHref, { scroll: false }) : undefined}
          onNextEpisode={nextHref ? () => router.push(nextHref, { scroll: false }) : undefined}
          pauseFacts={pauseFacts} pauseOverview={pauseOverview} pauseLogoUrl={title.logoUrl ?? undefined} pauseTitle={title.title}
          {...(memberId ? { subtitleDelayMs: syncedDelay ?? undefined, onSubtitleDelayMsChange: persistDelay } : {})}
          onSourceError={(reason, deliveryFailure) => void recover(reason, deliveryFailure)} onRetry={() => void start()}
          onSubtitleRequest={() => { if (!subtitleRequested || subtitleError) { setSubtitleLoading(true); setSubtitleError(null); setSubtitleRequested(true); setSubtitleAttempt((attempt) => attempt + 1) } }}
          onSubtitleRefresh={() => { if (!subtitleLoading) { setSubtitleLoading(true); setSubtitleError(null); setSubtitleProviders([]); setSubtitleRequested(true); setSubtitleAttempt(attempt => attempt + 1) } }}
          onTimeUpdate={(event) => { if (!localSource || latestRecording.current !== recording) return; clock.current.position = event.currentTarget.currentTime; clock.current.duration = event.currentTarget.duration; if (localSource) eventsRef.current?.sample(clock.current.position, clock.current.playing, localSource.delivery) }}
          onSeeking={(event) => { if (!localSource || latestRecording.current !== recording) return; eventsRef.current?.resetViewing(); clock.current.position = event.currentTarget.currentTime; clock.current.duration = event.currentTarget.duration }}
          onPlay={() => { if (!localSource || latestRecording.current !== recording) return; const replay = clock.current.completed; if (replay) completionId.current = null; clock.current.playing = true; clock.current.completed = false; setEnded(false); if (replay) { const previous = completionWrite.current; void (previous ?? Promise.resolve()).then(() => { if (!clock.current.completed) void save(true, true) }) } if (!subtitleRequested) { setSubtitleLoading(true); setSubtitleRequested(true) } }}
          onPause={() => { if (!localSource || latestRecording.current !== recording) return; eventsRef.current?.resetViewing(); clock.current.playing = false; if (!requestRef.current) void save(false, true) }}
          onEnded={() => { if (localSource && latestRecording.current === recording) completePlayback() }}
          autoSkip={autoSkip}
          onAutoSkipChange={handleAutoSkip}
          onSeeked={() => { void save(false, true) }}
          onPlaybackEvent={(event) => eventsRef.current?.push({ ...event, ...(localSource ? { delivery: localSource.delivery } : {}) })}
          onMediaPreferencesChange={(preferences) => coordinator.setPreferences({ ...preferences, ...(localSource?.qualityHeights?.length ? { qualityHeight: readQualityPreference() } : {}), audioLanguage: audioLanguageProp ?? intent.current.audioLanguage, adsEnabled: adsEnabled.current })}
        />
        )}

      </section>
      {embedded && error && session && isFrame ? <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-canvas px-4 py-3 text-sm text-copy" role="alert"><p className="min-w-0 flex-1">{error}</p><Button onClick={() => { void start(null) }} size="sm" variant="ghost">Try again</Button></div> : null}
      {embedded && busy && recoveryProgress && isFrame ? <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-sm text-copy" role="status"><span>Checked {recoveryProgress.tried} of {recoveryProgress.total} servers</span><Button size="sm" variant="ghost" onClick={() => { const request = requestRef.current; requestRef.current = null; request?.abort(); setBusy(false); setError(session ? null : 'Source search cancelled. Choose a server to start.'); setRecoveryProgress(null) }}>Cancel search</Button></div> : null}

      {embedded && isFrame && (prevHref || nextHref) ? <nav aria-label="Episode" className="flex justify-end gap-2 border-t border-white/10 bg-black px-3 py-2">{prevHref ? <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={prevHref}>Previous episode</Link> : null}{nextHref ? <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={nextHref}>Next episode</Link> : null}</nav> : null}

    </main>
  )
}
