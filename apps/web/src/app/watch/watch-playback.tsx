'use client'

import { ChevronLeft, ChevronRight, Keyboard, Moon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { titleHref, type PlaybackProvider, type PlaybackRef, type PlaybackSession } from '@consumit/contracts'
import { Button, ConsumitPlayer, Toggle, buttonVariants, SUBTITLE_LANGUAGES_EVENT, readStoredSubtitleLanguages } from '@consumit/ui'
import { useSession } from '../session/session'
import { listPlaybackProviders, playbackCapabilities, playbackRequest, switchPlaybackProvider } from '@/lib/playback-browser'
import { fetchAggregatedSubtitles, fetchSubtitlePreference, saveSubtitlePreference } from '@/lib/subtitles-browser'
import { PROGRESS_SYNC_INTERVAL_MS, hasMeaningfulProgressChange, readPlaybackProgress, writePlaybackProgress, type ProgressCheckpoint } from '@/lib/playback-progress'
import { createPlaybackEvents } from '@/lib/playback-events'

import type { WatchEpisode, WatchTitle } from './watch-screen'

export function WatchPlayback({ audioLanguage: audioLanguageProp, title, episode, nextHref, prevHref, layout = 'fullscreen', pinnedProvider }: { audioLanguage?: string | undefined; title: WatchTitle; episode?: WatchEpisode | undefined; nextHref?: string | undefined; prevHref?: string | undefined; layout?: 'fullscreen' | 'embedded' | undefined; pinnedProvider?: string | undefined }) {
  const { member } = useSession()
  const router = useRouter()
  const memberId = member?.id
  const ref = useMemo<PlaybackRef>(() => ({ kind: title.kind, id: title.id, ...(episode ? { season: episode.seasonNumber, episode: episode.episodeNumber } : {}) }), [title.id, title.kind, episode])
  const [session, setSession] = useState<PlaybackSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState(false)
  const [ended, setEnded] = useState(false)
  const [servers, setServers] = useState<PlaybackProvider[]>([])
  const serversFetchedFor = useRef<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const activeRef = useRef(false)
  const interruptedRequest = useRef<(() => Promise<void>) | null>(null)
  const clock = useRef({ position: 0, duration: 0, playing: false, completed: false })
  const [resume, setResume] = useState({ position: 0, playing: false })
  // Resolve-time audio: an explicit prop (anime SUB/DUB toggle) always wins;
  // otherwise the member's stored player preference flows through so Hindi
  // (and other) selections reach language-aware providers. Storage reads stay
  // in the mount effect so SSR and first paint never disagree.
  const [storedAudio, setStoredAudio] = useState<string | null>(null)
  useEffect(() => {
    if (audioLanguageProp !== undefined) return
    try {
      const stored = window.localStorage.getItem('consumit.player.audio-language')
      setStoredAudio(stored && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(stored) ? stored : 'en')
    } catch {
      setStoredAudio('en')
    }
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
    try {
      if (window.localStorage.getItem('consumit.player.autoplay') === '1') setAutoplay(true)
      if (window.localStorage.getItem('consumit.player.auto-next') === '0') setAutoNext(false)
      if (window.localStorage.getItem('consumit.player.auto-skip') === '0') setAutoSkip(false)
    } catch {
      /* Storage is optional. */
    }
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
  // A refresh that mints new URLs for a provider whose bytes never play must
  // not loop forever (re-minted signatures always differ, so the identical-URL
  // check below never fires). When the same provider fails again within a
  // short window after an accepted refresh, spend the fallback budget instead
  // of re-minting. Routine mid-watch renewals fail hours apart and still
  // refresh normally.
  const lastRefresh = useRef<{ providerId: string; at: number } | null>(null)
  const REFRESH_RETRY_WINDOW_MS = 90_000
  const saveInFlight = useRef(false)
  const lastSynced = useRef<ProgressCheckpoint | undefined>(undefined)
  const eventsRef = useRef<ReturnType<typeof createPlaybackEvents> | null>(null)
  const sessionId = session?.id
  useEffect(() => {
    if (!sessionId) return
    const events = createPlaybackEvents(sessionId)
    eventsRef.current = events
    return () => { events.close(); eventsRef.current = null }
  }, [sessionId])
  const name = episode ? `${title.title} · ${episode.title}` : title.title

  const save = useCallback(async (keepalive = false, force = false) => {
    if (saveInFlight.current && !keepalive) return
    // Coalesce server and local writes: the interval only persists meaningful
    // changes, while pause, seek, completion, and page exit save explicitly.
    if (!keepalive && !force && !hasMeaningfulProgressChange(lastSynced.current, { position: clock.current.position, completed: clock.current.completed })) return
    saveInFlight.current = true
    try { await writePlaybackProgress(ref, clock.current.position, clock.current.duration, clock.current.completed, memberId, keepalive); lastSynced.current = { position: clock.current.position, completed: clock.current.completed }; setSyncError(false) }
    catch { setSyncError(true) }
    finally { saveInFlight.current = false }
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

  // Switched-provider toast: after any automatic or manual move to a
  // different provider, name the destination once so silent auto-heals
  // read as care, not glitches. Auto-dismisses; unmount-safe.
  const [notice, setNotice] = useState<{ provider: string; quality?: string | undefined } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const prevProvider = useRef<string | null>(null)
  useEffect(() => {
    const current = session?.source.providerId ?? null
    if (current && prevProvider.current && current !== prevProvider.current) {
      const label = servers.find((server) => server.id === current)?.label ?? current
      setNotice({ provider: label, ...(session?.source.qualityHint ? { quality: session.source.qualityHint } : {}) })
      clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => setNotice(null), 4500)
    }
    prevProvider.current = current
  }, [session, servers])
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

  async function start() {
    if (requestRef.current) return
    if ((ref.kind === 'series' || ref.kind === 'anime') && !episode) { setError(ref.kind === 'anime' ? 'Choose an episode to start watching.' : 'Choose an available episode from the series page.'); return }
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null); setEnded(false)
    try {
      const [next, position] = await Promise.all([
        playbackRequest('resolve', { ref, capabilities: playbackCapabilities(), audioLanguage }, controller.signal),
        readPlaybackProgress(ref, controller.signal, member?.id),
      ])
      if (controller.signal.aborted) return
      if (next.ref.id !== ref.id || next.ref.kind !== ref.kind || next.ref.season !== ref.season || next.ref.episode !== ref.episode) throw new Error('Playback returned a different title.')
      const resumePosition = session && !clock.current.completed ? clock.current.position : position
      lastRefresh.current = null
      setResume({ position: resumePosition, playing: true }); clock.current.position = resumePosition; clock.current.playing = true; clock.current.completed = false
      setSession(next)
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Playback could not start. Try again.') }
    finally { finishRequest(controller, start) }
  }

  const recover = useCallback(async (reason: 'network' | 'media' | 'expired' | 'gone') => {
    if (!session || requestRef.current) return
    const controller = new AbortController(); requestRef.current = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
    setBusy(true); setError(null)
    const retained = { position: clock.current.position, playing: clock.current.playing }
    try {
      // HTTP 410 Gone is definitive at the contract boundary too: the bytes
      // are not coming back, so skip the same-provider re-mint entirely and
      // spend one windowed fallback on a different provider.
      const failure = { sourceId: session.source.id, reason: reason === 'gone' ? 'unsupported' as const : reason }
      // Signed segment URLs routinely die before the manifest expiry, so every
      // failure first re-mints the same provider (refresh never consumes the
      // automatic fallback budget). Only a failed — or identical-URL — refresh
      // spends one windowed fallback on a different provider. This is why long
      // watches stopped dying "after a while" once three segment blips had
      // burned the old lifetime budget of three.
      //
      // Escape hatch for resolve-healthy but unplayable providers: a refresh
      // that mints different URLs does not prove playability, so when the
      // same provider fails again within a short window after an accepted
      // refresh, skip re-minting and spend the fallback budget instead.
      let next: PlaybackSession
      const refreshedRecently = lastRefresh.current !== null
        && lastRefresh.current.providerId === session.source.providerId
        && Date.now() - lastRefresh.current.at < REFRESH_RETRY_WINDOW_MS
      if (reason === 'gone' || refreshedRecently) {
        lastRefresh.current = null
        next = await playbackRequest(`${session.id}/fallback`, failure, signal)
      } else {
        try {
          next = await playbackRequest(`${session.id}/refresh`, failure, signal)
          if (next.source.src === session.source.src) next = await playbackRequest(`${session.id}/fallback`, failure, signal)
          lastRefresh.current = { providerId: session.source.providerId, at: Date.now() }
        } catch {
          lastRefresh.current = null
          next = await playbackRequest(`${session.id}/fallback`, failure, signal)
        }
      }
      if (!controller.signal.aborted) {
        if (next.ref.id !== session.ref.id || next.ref.kind !== session.ref.kind || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Playback returned a different title.')
        setResume(retained); setSession(next)
      }
    } catch { if (!controller.signal.aborted) setError('We couldn’t restore playback. Try again or return to the title.') }
    finally { finishRequest(controller, () => recover(reason)) }
  }, [session, finishRequest])

  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => void recover('expired'), Math.max(1000, Date.parse(session.source.expiresAt) - Date.now() - 15000))
    // Background-tab timers can slip past expiry; re-check on return so a
    // hidden tab refreshes instead of playing into 403 segments.
    const visible = () => { if (document.visibilityState === 'visible' && Date.parse(session.source.expiresAt) <= Date.now() + 60000) void recover('expired') }
    document.addEventListener('visibilitychange', visible)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
  }, [recover, session])

  useEffect(() => {
    if (!session) return
    const key = `${ref.kind}:${ref.id}:${ref.season ?? 0}:${ref.episode ?? 0}`
    if (serversFetchedFor.current === key) return
    serversFetchedFor.current = key
    // The server list is a read-only snapshot: never abort it on session
    // change or unmount. Aborting leaked an AbortError rejection outside our
    // catches (surfaced as an uncaught Runtime error in some browsers), and
    // cancelling buys nothing — a late response is simply ignored below.
    // The request stays bounded by its own timeout instead.
    let stale = false
    void listPlaybackProviders({ ref, capabilities: playbackCapabilities(), audioLanguage }, AbortSignal.timeout(12000))
      .then((servers) => { if (!stale) setServers(servers) })
      .catch((error: unknown) => {
        if (stale) return
        if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'AbortError') return
        setServers([])
      })
    return () => { stale = true }
  }, [audioLanguage, session, ref])

  const switchServer = useCallback(async (providerId: string, tried: readonly string[] = []) => {
    if (!session || requestRef.current || session.source.providerId === providerId) return
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null)
    const retained = { position: clock.current.position, playing: clock.current.playing }
    try {
      const next = await switchPlaybackProvider(session.id, { providerId }, controller.signal)
      if (controller.signal.aborted) return
      if (next.ref.id !== session.ref.id || next.ref.kind !== session.ref.kind || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Playback returned a different title.')
      lastRefresh.current = null
      setResume(retained); setSession(next)
    } catch {
      if (controller.signal.aborted) return
      // Auto-advance: a tapped mirror that fails hands off to the next
      // untried one — healthy and answering first — instead of stranding
      // the member on an error. Each mirror is tried once per chain, so
      // this always terminates at a player or an honest error.
      const attempted = new Set([...tried, providerId])
      const candidates = servers.filter((server) => !attempted.has(server.id) && server.id !== session.source.providerId)
      const fallback = candidates.find((server) => server.available !== false && server.health !== 'degraded')
        ?? candidates[0]
      if (fallback) {
        requestRef.current = null
        await switchServer(fallback.id, [...attempted])
        return
      }
      setError('We couldn’t switch server. Try again or return to the title.')
    }
    finally { finishRequest(controller, () => switchServer(providerId)) }
  }, [session, finishRequest, servers])

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
  const [subtitleLangs, setSubtitleLangs] = useState<string[]>(() => readStoredSubtitleLanguages())
  useEffect(() => {
    const sync = () => setSubtitleLangs(readStoredSubtitleLanguages())
    window.addEventListener(SUBTITLE_LANGUAGES_EVENT, sync)
    return () => window.removeEventListener(SUBTITLE_LANGUAGES_EVENT, sync)
  }, [])
  useEffect(() => {
    if (!session) return
    let active = true
    const ref = session.ref
    // No AbortController here on purpose: aborting in cleanup (or via a
    // manual timer) surfaces uncaught AbortError overlays in dev even though
    // the rejection is swallowed below. The timeout still bounds the request
    // and `active` guards the late response.
    void fetchAggregatedSubtitles(
      { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
      AbortSignal.timeout(15_000),
      subtitleLangs,
    ).then(
      (subs) => { if (active) setEngineSubtitles(subs) },
      () => {},
    )
    return () => { active = false }
  }, [session, subtitleLangs])
  // Per-member subtitle sync correction: signed-in members reload their
  // stored offset per title and every nudge persists (debounced) — guests
  // keep the player's device-local behavior only. The screen remounts per
  // title, so no cross-title leakage is possible.
  const [syncedDelay, setSyncedDelay] = useState<number | null>(null)
  const saveDelayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingDelay = useRef<{ memberId: string; ref: PlaybackRef; offsetMs: number } | null>(null)
  useEffect(() => {
    setSyncedDelay(null)
    if (!memberId || !session) return
    let active = true
    const ref = session.ref
    void fetchSubtitlePreference(
      { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
      AbortSignal.timeout(10_000),
    ).then(
      (preference) => { if (active) setSyncedDelay(preference?.offsetMs ?? 0) },
      () => {},
    )
    return () => { active = false }
  }, [session, memberId])
  const persistDelay = useCallback((offsetMs: number) => {
    setSyncedDelay(offsetMs)
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
      if (!track.url || seenUrls.has(track.url) || collected.length >= 32) return
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
  const episodeMeta = episode ? [episode.seasonNumber != null ? `Season ${episode.seasonNumber}` : null, `Episode ${episode.episodeNumber}`].filter(Boolean).join(' · ') : null
  const qualityMeta = session?.source.qualityHint ? `Playing from Consumit · ${session.source.qualityHint}` : null
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
  const stateText = error ?? (busy ? (session ? 'Switching source…' : 'Finding a source…') : session ? 'Source ready' : 'Finding a source…')

  // Embedded mode keeps the identical playback flow and Consumit Player,
  // only the outer composition changes so the anime watch screen can sit
  // the player beside its episode rail. Fullscreen stays the default for
  // movie/series watch.
  const embedded = layout === 'embedded'
  return (
    <main className={embedded ? 'flex w-full flex-col overflow-hidden rounded-[16px] border border-[var(--fs-field-border)] bg-black' : 'flex h-dvh flex-col bg-black'} data-consumit-player-screen>
      <section aria-label={`${name} playback`} className={embedded ? 'relative flex aspect-video w-full flex-col' : 'relative flex min-h-0 w-full flex-1 flex-col justify-center'}>
        <p className="sr-only" role="status">{stateText}</p>
        {busy && session ? (
          <p className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink">
            Switching source…
          </p>
        ) : null}
        {!busy && notice && session ? (
          <p className="pointer-events-none absolute left-1/2 top-4 z-10 max-w-[80%] -translate-x-1/2 truncate rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink" role="status">
            Switched to {notice.provider}{notice.quality ? ` · ${notice.quality}` : ''}
          </p>
        ) : null}
        <ConsumitPlayer
          className="flex w-full flex-1 flex-col rounded-none border-0" title={name} posterSrc={episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl ?? undefined}
          source={session?.source} extraSubtitles={extraSubtitles} resumeAt={resume.position} resumePlaying={resume.playing}
          topMeta={[episodeMeta, qualityMeta].filter(Boolean).join(' · ') || undefined}
          pauseFacts={pauseFacts} pauseOverview={pauseOverview} pauseLogoUrl={title.logoUrl ?? undefined}
          onBack={() => router.push(titleHref(title))}
          {...(memberId ? { subtitleDelayMs: syncedDelay ?? undefined, onSubtitleDelayMsChange: persistDelay } : {})}
          serverOptions={servers.map((server) => ({ value: server.id, label: server.label, detail: server.detail, region: server.regions?.[0], health: server.health, available: server.available, ...(server.family ? { family: server.family } : {}), ...(server.mirror ? { mirror: server.mirror } : {}) }))}
          selectedServer={session?.source.providerId}
          onServerChange={(providerId) => void switchServer(providerId)}
          onSourceError={(reason) => void recover(reason)} onRetry={() => void start()}
          onTimeUpdate={(event) => { clock.current.position = event.currentTarget.currentTime; clock.current.duration = event.currentTarget.duration }}
          onPlay={() => { clock.current.playing = true; clock.current.completed = false; setEnded(false) }}
          onPause={() => { if (!requestRef.current) { clock.current.playing = false; void save(false, true) } }}
          onEnded={() => {
            clock.current.playing = false; clock.current.completed = true; setEnded(true); void save(false, true)
            if (autoplay && nextHref) router.push(nextHref)
          }}
          autoSkip={autoSkip}
          onAutoSkipChange={handleAutoSkip}
          onSeeked={() => { void save(false, true) }}
          onPlaybackEvent={(event) => eventsRef.current?.push(event)}
        />
        {error && !session ? (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-6" role="alert">
            <div className="max-w-md text-center">
              <p className="text-base font-bold text-ink">{error}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button loading={busy} onClick={() => void start()}>Try again</Button>
                <Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(title)}>Return to title</Link>
              </div>
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
        {syncError ? (
          <p className="pointer-events-none absolute right-4 top-4 max-w-[40ch] rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs text-muted">Progress is saved on this device. Account sync will retry.</p>
        ) : null}
      </section>
      {(prevHref || nextHref) && (
        <>
          <nav aria-label="Episode" className={`flex items-center gap-1 overflow-x-auto border-t border-white/10 bg-black px-3 py-2 sm:gap-2 sm:px-4 ${lightsOff ? 'opacity-30 transition-opacity hover:opacity-100 focus-within:opacity-100' : ''}`}>
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
            <span className="min-w-2 flex-1" />
            {prevHref ? (
              <Link className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-sm font-bold text-copy outline-none hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={prevHref}>
                <ChevronLeft aria-hidden="true" className="size-4" /> Prev
              </Link>
            ) : null}
            {nextHref ? (
              <Link className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-sm font-bold text-copy outline-none hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={nextHref}>
                Next <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            ) : <span className="w-2 shrink-0" />}
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
