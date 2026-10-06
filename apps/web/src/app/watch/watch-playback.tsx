'use client'

import { Keyboard, Moon, SkipBack, SkipForward, Tv } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { titleHref, type PlaybackProvider, type PlaybackRef, type PlaybackSession, type DeliveryFailure, type SeparateAudioTrack } from '@consumit/contracts'
import { Button, ConsumitPlayer, Toggle, buttonVariants, SUBTITLE_LANGUAGES_EVENT, readStoredSubtitleLanguages, readQualityPreference, createQualityPreference } from '@consumit/ui'
import { useSession } from '../session/session'
import { listPlaybackProviders, playbackCapabilities, playbackRequest, switchPlaybackProvider, listSeparateAudio, prepareSeparateAudio } from '@/lib/playback-browser'
import { discoverSubtitles, pageSubtitles, searchSubtitles, prepareSubtitle, fetchSubtitlePreference, saveSubtitlePreference, type SubtitleDiscoveryEvent, type SubtitleCandidate, type SubtitleProviderStatus } from '@/lib/subtitles-browser'
import { PROGRESS_SYNC_INTERVAL_MS, hasMeaningfulProgressChange, readPlaybackProgress, writePlaybackProgress, type ProgressCheckpoint } from '@/lib/playback-progress'
import { createPlaybackEvents } from '@/lib/playback-events'
import { createPlaybackCoordinator, watchSourceExpiry } from '@/lib/playback-coordinator'
import { castContentType, createCastSender, type CastStatus } from '@/lib/cast-sender'

import type { WatchEpisode, WatchTitle } from './watch-screen'
import { ProviderFrame } from '../shared/provider-frame'
import { watchPoster } from './watch-poster'

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function WatchPlayback({ audioLanguage: audioLanguageProp, title, episode, nextHref, prevHref, layout = 'fullscreen', pinnedProvider }: { audioLanguage?: string | undefined; title: WatchTitle; episode?: WatchEpisode | undefined; nextHref?: string | undefined; prevHref?: string | undefined; layout?: 'fullscreen' | 'embedded' | undefined; pinnedProvider?: string | undefined }) {
  const { member } = useSession()
  const router = useRouter()
  const memberId = member?.id
  const ref = useMemo<PlaybackRef>(() => ({ kind: title.kind, id: title.id, ...(episode ? { season: episode.seasonNumber, episode: episode.episodeNumber } : {}) }), [title.id, title.kind, episode])
  const [session, setSession] = useState<PlaybackSession | null>(null)
  // The session holds the newest lease; buffered HLS requests can adopt it
  // without replacing the engine or clearing the movie's buffered media.
  const [localSource, setLocalSource] = useState<PlaybackSession['source']>()
  const latestLease = useRef<PlaybackSession['source'] | undefined>(undefined)
  useEffect(() => { latestLease.current = session?.source }, [session])
  const isFrame = localSource?.type === 'iframe'
  const frameActive = useRef(false)
  frameActive.current = isFrame
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
    void listSeparateAudio(session, request.signal).then(tracks => { if (!request.signal.aborted) setSeparateAudioTracks(tracks) }).catch(() => {
      if (!request.signal.aborted) { audioLoadedSession.current = null; setSeparateAudioError('More languages are unavailable right now. Close and reopen Audio to retry.') }
    }).finally(() => { if (!request.signal.aborted) setSeparateAudioLoading(false) })
  }, [session, title.kind])
  const selectSeparateAudio = useCallback((id: string) => {
    if (!session) return Promise.reject(new Error('Playback has not started'))
    return prepareSeparateAudio(session, id, new AbortController().signal)
  }, [session])
  const sourceFailed = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState(false)
  const [ended, setEnded] = useState(false)
  const [servers, setServers] = useState<PlaybackProvider[]>([])
  const [serverRequested, setServerRequested] = useState(false)
  const [serverLoading, setServerLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverAttempt, setServerAttempt] = useState(0)
  const [manualServer, setManualServer] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const activeRef = useRef(false)
  const interruptedRequest = useRef<(() => Promise<void>) | null>(null)
  const clock = useRef({ position: 0, duration: 0, playing: false, completed: false })
  const completionId = useRef<string | null>(null)
  const [resume, setResume] = useState({ position: 0, playing: false })
  const coordinator = useMemo(() => createPlaybackCoordinator({
    resolve: (input, signal) => playbackRequest('resolve', input, signal),
    providers: listPlaybackProviders,
    recover: (current, action, failure, signal) => playbackRequest(`${current.id}/${action}`, failure, signal),
    switch: (current, providerId, signal, preferences) => switchPlaybackProvider(current.id, { providerId, ...(preferences ? { preferences } : {}) }, signal),
  }), [])
  // Resolve-time audio: an explicit prop (anime SUB/DUB toggle) always wins;
  // otherwise the member's stored player preference flows through so Hindi
  // (and other) selections reach language-aware providers. Storage reads stay
  // in the mount effect so SSR and first paint never disagree.
  const [storedAudio, setStoredAudio] = useState<string | null>(null)
  useEffect(() => {
    if (audioLanguageProp !== undefined) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const stored = window.localStorage.getItem('consumit.player.audio-language')
        setStoredAudio(stored && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(stored) ? Intl.getCanonicalLocales(stored)[0] ?? stored : 'en')
      } catch { setStoredAudio('en') }
    })
    return () => { active = false }
  }, [audioLanguageProp])
  const audioLanguage = audioLanguageProp ?? storedAudio ?? 'en'
  // Episode-room preferences: device-local, read after mount so SSR and
  // first paint never disagree. Autoplay advances on end, Auto Next shows
  // the Up-next card, Auto Skip drives the player skip control in sync.
  const [autoplay, setAutoplay] = useState(false)
  const [autoNext, setAutoNext] = useState(true)
  const [autoSkip, setAutoSkip] = useState(true)
  const [lightsOff, setLightsOff] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        if (window.localStorage.getItem('consumit.player.autoplay') === '1') setAutoplay(true)
        if (window.localStorage.getItem('consumit.player.auto-next') === '0') setAutoNext(false)
        if (window.localStorage.getItem('consumit.player.auto-skip') === '0') setAutoSkip(false)
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
  const sessionId = session?.id
  useEffect(() => {
    if (!sessionId || isFrame) return
    const events = createPlaybackEvents(sessionId)
    eventsRef.current = events
    return () => { events.close(); eventsRef.current = null }
  }, [sessionId, isFrame])
  const name = episode ? `${title.title} · ${episode.title}` : title.title

  const save = useCallback(async (keepalive = false, force = false) => {
    if (frameActive.current) return
    if (saveInFlight.current && !keepalive) return
    // Coalesce server and local writes: the interval only persists meaningful
    // changes, while pause, seek, completion, and page exit save explicitly.
    if (!keepalive && !force && !hasMeaningfulProgressChange(lastSynced.current, { position: clock.current.position, completed: clock.current.completed })) return
    const snapshot = { ...clock.current, completionId: completionId.current ?? undefined }
    const pending = (async () => {
      try {
        await writePlaybackProgress(ref, snapshot.position, snapshot.duration, snapshot.completed, memberId, keepalive, snapshot.completionId)
        lastSynced.current = { position: snapshot.position, completed: snapshot.completed }
        setSyncError(false)
      } catch { setSyncError(true) }
    })()
    if (!keepalive) saveInFlight.current = pending
    await pending
    if (saveInFlight.current === pending) saveInFlight.current = null
  }, [ref, memberId])

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
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStarted.current) {
      // Without an explicit prop the first resolve waits for the stored
      // preference so the opening request already carries it.
      if (audioLanguageProp === undefined && storedAudio === null) return
      autoStarted.current = true; void start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedAudio])

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
    if (autoplay && nextHref) router.push(nextHref)
  }, [autoplay, nextHref, router, save])

  // Chromecast (P1): the TV plays while the phone keeps the session, progress,
  // and telemetry. The TV never authenticates; disconnect resumes the phone
  // player at the TV's position through the normal resume path.
  const castSender = useMemo(() => createCastSender({}), [])
  const [castAvailable, setCastAvailable] = useState(false)
  const [castStatus, setCastStatus] = useState<CastStatus | null>(null)
  const wasCasting = useRef(false)
  const tvPlaying = useRef(false)
  const loadCastMedia = useCallback(async (target: PlaybackSession) => {
    if (target.source.type === 'iframe') { castSender.endSession(true); return }
    await castSender.loadMedia({
      contentId: target.source.src,
      contentType: castContentType(target.source.type),
      title: name,
      artwork: episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl ?? undefined,
      position: clock.current.position,
      customData: {
        sessionId: target.id,
        providerId: target.source.providerId,
        delivery: target.source.delivery,
        audioLanguage,
      },
    })
  }, [castSender, name, episode, title, audioLanguage])
  useEffect(() => {
    let cancelled = false
    void castSender.ensure().then((ready) => { if (!cancelled && ready) setCastAvailable(castSender.available) })
    const unsubscribe = castSender.subscribe(() => {
      if (cancelled) return
      setCastAvailable(castSender.available)
      const status = castSender.status
      setCastStatus(status)
      if (status) {
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
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [castSender, completePlayback])
  const handleCastClick = useCallback(() => {
    if (!session || requestRef.current) return
    if (castSender.status) {
      // Disconnect: the subscription above resumes local playback.
      castSender.endSession(true)
      return
    }
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null)
    void (async () => {
      try {
        await castSender.requestSession()
        if (controller.signal.aborted) return
        await loadCastMedia(session)
      } catch {
        if (!controller.signal.aborted) showNotice('Couldn’t reach the TV. Try again.')
      }
      finally { finishRequest(controller, async () => { handleCastClick() }) }
    })()
  }, [session, castSender, loadCastMedia, showNotice, finishRequest])

  async function start(providerId: string | null = manualServer) {
    if (requestRef.current) return
    if ((ref.kind === 'series' || ref.kind === 'anime') && !episode) { setError(ref.kind === 'anime' ? 'Choose an episode to start watching.' : 'Choose an available episode from the series page.'); return }
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null); setEnded(false); setManualServer(providerId)
    try {
      const [next, position] = await Promise.all([
        coordinator.resolve({ ref, capabilities: playbackCapabilities(), audioLanguage, ...(providerId ? { providerId } : {}), preferences: { qualityHeight: readQualityPreference() } }, controller.signal),
        readPlaybackProgress(ref, controller.signal, member?.id),
      ])
      if (controller.signal.aborted) return
      if (next.ref.id !== ref.id || next.ref.kind !== ref.kind || next.ref.season !== ref.season || next.ref.episode !== ref.episode) throw new Error('Playback returned a different title.')
      if (providerId && next.source.providerId !== providerId) throw new Error('The selected server couldn’t start. Choose another server.')
      const resumePosition = session && !clock.current.completed ? clock.current.position : position
      setResume({ position: resumePosition, playing: true }); clock.current.position = resumePosition; clock.current.playing = true; clock.current.completed = false
      setSession(next)
      setLocalSource(next.source); sourceFailed.current = false
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Playback could not start. Try again.') }
    finally { finishRequest(controller, () => start(providerId)) }
  }

  const recover = useCallback(async (reason: 'network' | 'media' | 'expired' | 'gone', deliveryFailure?: DeliveryFailure) => {
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
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)])
    if (reason !== 'expired') setBusy(true)
    setError(null)
    try {
      const next = await coordinator.recover(session, reason, signal, deliveryFailure)
      if (!controller.signal.aborted) {
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
    } catch { if (!controller.signal.aborted) setError('We couldn’t restore playback. Try again or return to the title.') }
    finally { finishRequest(controller, () => recover(reason, deliveryFailure)) }
  }, [session, localSource, finishRequest, coordinator, castSender, loadCastMedia, showNotice])

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
    if (!serverRequested && !pinnedProvider) return
    // The server list is a read-only snapshot: never abort it on session
    // change or unmount. Aborting leaked an AbortError rejection outside our
    // catches (surfaced as an uncaught Runtime error in some browsers), and
    // cancelling buys nothing — a late response is simply ignored below.
    // The request stays bounded by its own timeout instead.
    let stale = false
    void coordinator.providers({ ref, capabilities: playbackCapabilities(), audioLanguage }, AbortSignal.timeout(12000))
      .then((servers) => { if (!stale) { setServers(servers); setServerError(null) } })
      .catch(() => {
        if (stale) return
        setServers([])
        setServerError('Servers are unavailable right now. Playback can continue.')
      })
      .finally(() => { if (!stale) setServerLoading(false) })
    return () => { stale = true }
  }, [audioLanguage, ref, coordinator, pinnedProvider, serverRequested, serverAttempt])

  const switchServer = useCallback(async (providerId: string) => {
    if (!session || requestRef.current) return
    if (session.source.providerId === providerId) { setManualServer(providerId); return }
    const controller = new AbortController(); requestRef.current = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)])
    setBusy(true); setError(null)
    try {
      const next = await coordinator.switchAvailable(session, providerId, servers, signal)
      if (controller.signal.aborted) return
      if (next.ref.id !== session.ref.id || next.ref.kind !== session.ref.kind || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Playback returned a different title.')
      if (next.source.providerId !== providerId) {
        // The chosen server didn't answer and a fallback took over: say so.
        // Falling through silently is the bug where clicks "land on another
        // provider" with no explanation.
        manualNotice.current = true
        showNotice(next.source.type === 'iframe' ? 'External player selected.' : 'Playback resumed from another source.')
      }
      setResume({ position: clock.current.position, playing: clock.current.playing }); setSession(next)
      setManualServer(next.source.providerId === providerId ? providerId : null)
      setLocalSource(next.source); sourceFailed.current = false
      if (castSender.status) {
        try { await loadCastMedia(next) }
        catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') }
      }
    } catch {
      if (controller.signal.aborted) return
      // Full failure keeps playing the current server, so it is a toast,
      // not the error overlay (which only renders when nothing is playing).
      showNotice(session.source.type === 'iframe' ? 'Couldn’t switch servers. Reload this player or choose another.' : 'Couldn’t switch sources. Playback is still available.')
    }
    finally { finishRequest(controller, () => switchServer(providerId)) }
  }, [session, finishRequest, servers, coordinator, showNotice, castSender, loadCastMedia])

  const switchQuality = useCallback(async (value: string) => {
    const height = Number(value)
    if (!session || requestRef.current || !session.source.qualityHeights?.includes(height) || session.source.qualityHint === `${height}p`) return
    const controller = new AbortController(); requestRef.current = controller
    const retained = { position: clock.current.position, playing: clock.current.playing }
    setBusy(true)
    try {
      const next = await switchPlaybackProvider(session.id, { providerId: session.source.providerId, preferences: { qualityHeight: height, audioLanguage } }, controller.signal)
      if (controller.signal.aborted) return
      if (next.source.providerId !== session.source.providerId || next.ref.kind !== session.ref.kind || next.ref.id !== session.ref.id || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Unexpected quality source.')
      createQualityPreference().choose({ value, label: `${height}p`, height })
      coordinator.setPreferences({ qualityHeight: height, audioLanguage })
      setResume(retained); setSession(next); setLocalSource(next.source); sourceFailed.current = false
      if (castSender.status) {
        try { await loadCastMedia(next) }
        catch { castSender.endSession(false); showNotice('Lost the TV connection. Playing here.') }
      }
    } catch {
      if (!controller.signal.aborted) showNotice('Couldn’t change quality. Keeping the current stream.')
    } finally { finishRequest(controller, () => switchQuality(value)) }
  }, [session, audioLanguage, coordinator, castSender, loadCastMedia, showNotice, finishRequest])

  // Lab pin (?provider=): after the opening resolve lands on another
  // provider, switch once to the pinned one. Consumed immediately so
  // recovery and manual server switches keep working normally afterwards.
  const pinConsumed = useRef(false)
  useEffect(() => {
    if (!pinnedProvider || pinConsumed.current || !session || requestRef.current) return
    if (session.source.providerId === pinnedProvider) { pinConsumed.current = true; return }
    pinConsumed.current = true
    void switchServer(pinnedProvider)
  }, [pinnedProvider, session, switchServer])

  // Aggregated engine captions (YIFY, TVSubtitles, CastleSubs, NxshaSubs,
  // SubSource, VDRK) join the menu independently of the streaming provider.
  // They arrive after first frame and merge live without reloading media; a
  // failure only means the menu shows the streaming providers' own tracks.
  // The member's preferred subtitle languages ride along so the engine
  // tries those first; changing them refetches live.
  const [engineSubtitles, setEngineSubtitles] = useState<{ id: string; label: string; language: string; url: string }[]>([])
  const preparedSubtitleFiles = useRef(new Map<string, { id: string; label: string; language: string; url: string }>())
  const [subtitleSearchId, setSubtitleSearchId] = useState<string | null>(null)
  const [subtitleLanguages, setSubtitleLanguages] = useState<SubtitleDiscoveryEvent['languages']>([])
  const [subtitleProviders, setSubtitleProviders] = useState<SubtitleProviderStatus[]>([])
  const [subtitleLoading, setSubtitleLoading] = useState(false)
  const [subtitleError, setSubtitleError] = useState<string | null>(null)
  const [subtitleRequested, setSubtitleRequested] = useState(false)
  const [subtitleAttempt, setSubtitleAttempt] = useState(0)
  const subtitleSessionId = session?.id
  const [subtitleLangs, setSubtitleLangs] = useState<string[]>(() => readStoredSubtitleLanguages())
  useEffect(() => {
    const sync = () => setSubtitleLangs(readStoredSubtitleLanguages())
    window.addEventListener(SUBTITLE_LANGUAGES_EVENT, sync)
    return () => window.removeEventListener(SUBTITLE_LANGUAGES_EVENT, sync)
  }, [])
  useEffect(() => {
    if (!subtitleSessionId || !subtitleRequested) return
    let active = true
    void discoverSubtitles(
      { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
      AbortSignal.timeout(15_000),
      (event) => {
        if (!active) return
        setSubtitleSearchId(event.searchId)
        setSubtitleLanguages(event.languages)
        if (event.provider) setSubtitleProviders((current) => [...current.filter((item) => item.id !== event.provider!.id), event.provider!])
        if (event.type === 'complete') setSubtitleLoading(false)
      },
    ).then(
      () => { if (active) setSubtitleLoading(false) },
      () => { if (active) { setSubtitleLoading(false); setSubtitleError('Subtitle search is unavailable. Try again.') } },
    )
    return () => { active = false }
  }, [subtitleSessionId, ref, subtitleRequested, subtitleAttempt])
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
    const track = candidate.preparedUrl
      ? { id: candidate.id, label: candidate.label, language: candidate.language, url: candidate.preparedUrl }
      : await prepareSubtitle(subtitleSearchId, candidate.id, AbortSignal.timeout(11_000))
    const attached = preparedSubtitleFiles.current.get(track.url)
    if (attached) return attached
    preparedSubtitleFiles.current.set(track.url, track)
    setEngineSubtitles((current) => [...current, track])
    return track
  }, [subtitleSearchId])
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
  useEffect(() => () => {
    // Flush a trailing nudge on unmount so the last correction survives.
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
  const episodeMeta = episode ? [episode.seasonNumber != null ? `S${episode.seasonNumber}` : null, `E${episode.episodeNumber}`].filter(Boolean).join(' · ') + (episode.title ? ` — ${episode.title}` : '') : null
  const qualityMeta = session?.source.qualityHint ? `Playing from Consumit · ${session.source.qualityHint}` : null
  const serverOptions = useMemo(() => {
    const options = servers.map(server => ({ value: server.id, label: server.label, detail: server.detail, health: server.health, available: server.available }))
    const current = session?.source.providerId
    if (current && !options.some(option => option.value === current)) options.unshift({ value: current, label: current, detail: session.source.qualityHint, health: 'ok', available: true })
    return options
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

  // Embedded mode keeps the identical playback flow and Consumit Player,
  // only the outer composition changes so the anime watch screen can sit
  // the player beside its episode rail. Fullscreen stays the default for
  // movie/series watch.
  const embedded = layout === 'embedded'
  return (
    <main className={embedded ? 'flex w-full flex-col overflow-hidden rounded-[16px] border border-[var(--fs-field-border)] bg-black' : 'flex h-dvh flex-col bg-black'} data-consumit-player-screen data-layout={layout} data-session={session ? 'ready' : 'searching'}>
      <section aria-label={`${name} playback`} className={embedded ? 'relative flex aspect-video w-full flex-col' : 'relative flex min-h-0 w-full flex-1 flex-col justify-center'}>
        <p className="sr-only" role="status">{stateText}</p>
        {busy && session ? (
          <p className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink">
            Switching source…
          </p>
        ) : null}
        {!busy && notice && session ? (
          <p className="pointer-events-none absolute left-1/2 top-4 z-10 max-w-[80%] -translate-x-1/2 truncate rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink" role="status">
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
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-2 text-white">
            <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={titleHref(title)}>Return to title</Link>
            <p className="min-w-0 flex-1 truncate text-sm font-bold max-sm:order-first max-sm:basis-full">{name}</p>
            <label className="flex items-center gap-2 text-sm">Server<select aria-label="Server" className="h-11 max-w-48 rounded-control border border-white/30 bg-black px-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-orange" value={localSource.providerId} disabled={busy} onFocus={requestServers} onPointerDown={requestServers} onChange={event => void switchServer(event.target.value)}>
              {serverOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            {serverLoading ? <span role="status" className="text-xs">Loading servers…</span> : null}
            {serverError ? <Button size="sm" variant="ghost" onClick={requestServers}>Retry server list</Button> : null}
          </div>
          <ProviderFrame key={localSource.id} src={localSource.src} title={name} audioLanguage={title.kind === 'anime' ? audioLanguage : undefined} onFallback={() => void recover('network', 'manual')} />
        </div> : <ConsumitPlayer
          className="flex w-full flex-1 flex-col rounded-none border-0" title={name} posterSrc={watchPoster(episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl)}
          source={playerSource} extraSubtitles={extraSubtitles} resumeAt={resume.position} resumePlaying={resume.playing}
          {...(session ? {
            serverOptions, selectedServer: session.source.providerId,
            serverAuto: manualServer !== session.source.providerId,
            onServerAuto: () => setManualServer(null),
            onServerChange: (value: string) => { void switchServer(value) },
            onServerRequest: requestServers, serverLoading, serverError, serverBusy: busy,
          } : {})}
          {...(localSource?.qualityHeights?.length ? {
            qualityOptions: localSource.qualityHeights.map(height => ({ value: String(height), label: `${height}p` })),
            selectedQuality: localSource.qualityHint?.replace(/p$/, ''),
            onQualityChange: (value: string) => { void switchQuality(value) },
          } : {})}
          {...(title.kind !== 'anime' ? { separateAudioTracks, separateAudioLoading, separateAudioError, onAudioRequest: requestAudio, onSeparateAudioSelect: selectSeparateAudio } : {})}
          castAvailable={castAvailable} castConnected={false} onCastClick={() => handleCastClick()}
          subtitleDiscovery={{ languages: subtitleLanguages, providers: subtitleProviders, loading: subtitleLoading, error: subtitleError }}
          onSubtitlePage={loadSubtitlePage} onSubtitleSearch={searchSubtitleCandidates} onSubtitleCandidateSelect={selectSubtitleCandidate}
          topMeta={[episodeMeta, qualityMeta].filter(Boolean).join(' · ') || undefined}
          preparing={!session && !error}
          preparationMeta={episodeMeta ?? [title.year, formatRuntime(title.kind === 'movie' ? title.runtimeMinutes : title.episodeRuntimeMinutes)].filter(Boolean).join(' · ')}
          onPreviousEpisode={prevHref ? () => router.push(prevHref) : undefined}
          onNextEpisode={nextHref ? () => router.push(nextHref) : undefined}
          pauseFacts={pauseFacts} pauseOverview={pauseOverview} pauseLogoUrl={title.logoUrl ?? undefined}
          onBack={() => router.push(titleHref(title))}
          {...(memberId ? { subtitleDelayMs: syncedDelay ?? undefined, onSubtitleDelayMsChange: persistDelay } : {})}
          onSourceError={(reason, deliveryFailure) => void recover(reason, deliveryFailure)} onRetry={() => void start()}
          onSubtitleRequest={() => { if (!subtitleRequested || subtitleError) { setSubtitleLoading(true); setSubtitleError(null); setSubtitleRequested(true); setSubtitleAttempt((attempt) => attempt + 1) } }}
          onTimeUpdate={(event) => { clock.current.position = event.currentTarget.currentTime; clock.current.duration = event.currentTarget.duration; if (localSource) eventsRef.current?.sample(clock.current.position, clock.current.playing, localSource.delivery) }}
          onSeeking={(event) => { eventsRef.current?.resetViewing(); clock.current.position = event.currentTarget.currentTime; clock.current.duration = event.currentTarget.duration }}
          onPlay={() => { const replay = clock.current.completed; if (replay) completionId.current = null; clock.current.playing = true; clock.current.completed = false; setEnded(false); if (replay) { const previous = completionWrite.current; void (previous ?? Promise.resolve()).then(() => { if (!clock.current.completed) void save(true, true) }) } if (!subtitleRequested) { setSubtitleLoading(true); setSubtitleRequested(true) } }}
          onPause={() => { eventsRef.current?.resetViewing(); clock.current.playing = false; if (!requestRef.current) void save(false, true) }}
          onEnded={() => completePlayback()}
          autoSkip={autoSkip}
          onAutoSkipChange={handleAutoSkip}
          onSeeked={() => { void save(false, true) }}
          onPlaybackEvent={(event) => eventsRef.current?.push({ ...event, ...(localSource ? { delivery: localSource.delivery } : {}) })}
          onMediaPreferencesChange={(preferences) => coordinator.setPreferences({ ...preferences, ...(localSource?.qualityHeights?.length ? { qualityHeight: readQualityPreference() } : {}), ...(audioLanguageProp ? { audioLanguage: audioLanguageProp } : {}) })}
        />
        )}
        {error && !session ? (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-6" role="alert">
            <div className="max-w-md text-center">
              <p className="text-base font-bold text-ink">{error}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button loading={busy} onClick={() => void start()}>Try again</Button>
                {!serverRequested ? <Button variant="secondary" onClick={requestServers}>Choose another server</Button> : null}
                <Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(title)}>Return to title</Link>
              </div>
              {serverRequested ? <div className="mt-4 space-y-2">
                <label className="flex items-center gap-3 text-sm text-ink">Server<select aria-label="Server" className="h-11 min-w-0 flex-1 rounded-control border border-control-outline bg-black px-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-orange" value={manualServer ?? ''} disabled={busy || serverLoading} onChange={event => void start(event.target.value || null)}>
                  <option value="">Auto</option>
                  {servers.map(server => <option key={server.id} value={server.id} disabled={server.available === false}>{server.label}</option>)}
                </select></label>
                {serverLoading ? <p role="status" className="text-sm text-copy">Loading servers…</p> : null}
                {serverError ? <div><p className="text-sm text-copy">Servers are unavailable right now.</p><Button size="sm" variant="ghost" onClick={requestServers}>Retry server list</Button></div> : null}
                {!serverLoading && !serverError && !servers.length ? <p className="text-sm text-copy">No other servers are configured for this title.</p> : null}
              </div> : null}
            </div>
          </div>
        ) : null}
        {ended && nextHref && autoNext && !autoplay ? (
          <div className="absolute inset-x-0 bottom-36 flex justify-center px-6">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-control bg-black/70 px-4 py-3">
              <span className="text-sm font-bold text-ink">Up next</span>
              <Link className={buttonVariants()} href={nextHref}>Next episode</Link>
              <Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(title)}>Return to title</Link>
            </div>
          </div>
        ) : null}
        {syncError && !isFrame ? (
          <p className="pointer-events-none absolute right-4 top-4 max-w-[40ch] rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs text-muted">Progress is saved on this device. Account sync will retry.</p>
        ) : null}
      </section>
      {isFrame && (prevHref || nextHref) ? <nav aria-label="Episode" className="flex justify-end gap-2 border-t border-white/10 bg-black px-3 py-2">{prevHref ? <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={prevHref}>Previous episode</Link> : null}{nextHref ? <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={nextHref}>Next episode</Link> : null}</nav> : null}
      {(prevHref || nextHref) && !isFrame && (
        <>
          <nav aria-label="Episode" className={`flex flex-wrap items-center gap-1 border-t border-white/10 bg-black px-3 py-2 sm:gap-2 sm:px-4 ${lightsOff ? 'opacity-30 transition-opacity hover:opacity-100 focus-within:opacity-100' : ''}`}>
            <div className="flex shrink-0 items-center gap-1.5">
              <Toggle checked={autoplay} label="Autoplay next episode" onCheckedChange={(value) => persistPref('consumit.player.autoplay', value, setAutoplay)} />
              <span className="text-xs font-bold text-copy">Autoplay</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Toggle checked={autoSkip} label="Auto-skip intros" onCheckedChange={handleAutoSkip} />
              <span className="text-xs font-bold text-copy">Auto Skip</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Toggle checked={autoNext} label="Show up-next card" onCheckedChange={(value) => persistPref('consumit.player.auto-next', value, setAutoNext)} />
              <span className="text-xs font-bold text-copy">Auto Next</span>
            </div>
            <button
              aria-expanded={showShortcuts}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-sm font-bold text-copy outline-none hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
              onClick={() => setShowShortcuts((current) => !current)}
              type="button"
            >
              <Keyboard aria-hidden="true" className="size-4" /> Shortcuts
            </button>
            <button
              aria-pressed={lightsOff}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-sm font-bold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange ${lightsOff ? 'text-orange' : 'text-copy hover:text-ink'}`}
              onClick={() => setLightsOff((current) => !current)}
              title="Dim everything except the video"
              type="button"
            >
              <Moon aria-hidden="true" className="size-4" /> Lights Off
            </button>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {prevHref ? (
                <Link aria-label="Previous episode" title="Previous episode" className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-copy outline-none hover:bg-white/10 hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href={prevHref}>
                  <SkipBack aria-hidden="true" className="size-5" />
                </Link>
              ) : null}
              {nextHref ? (
                <Link aria-label="Next episode" title="Next episode" className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-copy outline-none hover:bg-white/10 hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href={nextHref}>
                  <SkipForward aria-hidden="true" className="size-5" />
                </Link>
              ) : null}
            </div>
          </nav>
          {showShortcuts ? (
            <div className="border-t border-white/10 bg-black px-4 py-3">
              <ul className="mx-auto grid max-w-3xl grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted sm:grid-cols-3">
                {[
                  ['Space / K', 'Play / pause'],
                  ['J / L', 'Back / forward 10s'],
                  ['← / →', 'Seek 5s'],
                  ['↑ / ↓', 'Volume'],
                  ['F', 'Fullscreen'],
                  ['M', 'Mute'],
                  ['C', 'Subtitles'],
                  ['Home / End', 'Start / end'],
                ].map(([keys, action]) => (
                  <li key={keys} className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-ink">{keys}</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </main>
  )
}
