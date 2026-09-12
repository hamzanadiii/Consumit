'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { titleHref, type CatalogTitleDetail, type CatalogEpisode, type PlaybackProvider, type PlaybackRef, type PlaybackSession } from '@consumit/contracts'
import { Button, ConsumitPlayer, buttonVariants } from '@consumit/ui'
import { useSession } from '../session/session'
import { listPlaybackProviders, playbackCapabilities, playbackRequest, switchPlaybackProvider } from '@/lib/playback-browser'
import { PROGRESS_SYNC_INTERVAL_MS, hasMeaningfulProgressChange, readPlaybackProgress, writePlaybackProgress, type ProgressCheckpoint } from '@/lib/playback-progress'
import { createPlaybackEvents } from '@/lib/playback-events'

export function WatchPlayback({ title, episode, nextHref }: { title: CatalogTitleDetail; episode?: CatalogEpisode | undefined; nextHref?: string | undefined }) {
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
    if (!autoStarted.current) { autoStarted.current = true; void start() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (ref.kind === 'series' && !episode) { setError('Choose an available episode from the series page.'); return }
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null); setEnded(false)
    try {
      const [next, position] = await Promise.all([
        playbackRequest('resolve', { ref, capabilities: playbackCapabilities(), audioLanguage: 'en' }, controller.signal),
        readPlaybackProgress(ref, controller.signal, member?.id),
      ])
      if (controller.signal.aborted) return
      if (next.ref.id !== ref.id || next.ref.kind !== ref.kind || next.ref.season !== ref.season || next.ref.episode !== ref.episode) throw new Error('Playback returned a different title.')
      const resumePosition = session && !clock.current.completed ? clock.current.position : position
      setResume({ position: resumePosition, playing: true }); clock.current.position = resumePosition; clock.current.playing = true; clock.current.completed = false
      setSession(next)
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Playback could not start. Try again.') }
    finally { finishRequest(controller, start) }
  }

  const recover = useCallback(async (reason: 'network' | 'media' | 'expired') => {
    if (!session || requestRef.current) return
    const controller = new AbortController(); requestRef.current = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])
    setBusy(true); setError(null)
    const retained = { position: clock.current.position, playing: clock.current.playing }
    try {
      const failure = { sourceId: session.source.id, reason }
      let next: PlaybackSession
      if (reason === 'expired' || Date.parse(session.source.expiresAt) <= Date.now() + 5000) {
        try { next = await playbackRequest(`${session.id}/refresh`, failure, signal) }
        catch { next = await playbackRequest(`${session.id}/fallback`, failure, signal) }
      } else next = await playbackRequest(`${session.id}/fallback`, failure, signal)
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
    return () => clearTimeout(timer)
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
    void listPlaybackProviders({ ref, capabilities: playbackCapabilities(), audioLanguage: 'en' }, AbortSignal.timeout(12000))
      .then((servers) => { if (!stale) setServers(servers) })
      .catch((error: unknown) => {
        if (stale) return
        if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'AbortError') return
        setServers([])
      })
    return () => { stale = true }
  }, [session, ref])

  const switchServer = useCallback(async (providerId: string) => {
    if (!session || requestRef.current || session.source.providerId === providerId) return
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(null)
    const retained = { position: clock.current.position, playing: clock.current.playing }
    try {
      const next = await switchPlaybackProvider(session.id, { providerId }, controller.signal)
      if (controller.signal.aborted) return
      if (next.ref.id !== session.ref.id || next.ref.kind !== session.ref.kind || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Playback returned a different title.')
      setResume(retained); setSession(next)
    } catch { if (!controller.signal.aborted) setError('We couldn’t switch server. Try again or return to the title.') }
    finally { finishRequest(controller, () => switchServer(providerId)) }
  }, [session, finishRequest])

  // Every answering provider's caption tracks join the menu: the resolve
  // winner's tracks first, then each listed server's, deduped by language
  // and label. Memoized so the player only rebuilds tracks when the set
  // actually changes — never per render.
  const extraSubtitles = useMemo(() => {
    const seen = new Set<string>()
    const merged: { id: string; label: string; language: string; url: string }[] = []
    for (const track of [...(session?.source.subtitles ?? []), ...servers.flatMap((server) => server.subtitles ?? [])]) {
      const key = `${track.language.toLowerCase()}|${track.label.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ id: track.id, label: track.label, language: track.language, url: track.url })
      if (merged.length >= 32) break
    }
    return merged
  }, [session?.source.subtitles, servers])
  const episodeMeta = episode ? `Season ${episode.seasonNumber} · Episode ${episode.episodeNumber}` : null
  const qualityMeta = session?.source.qualityHint ? `Playing from Consumit · ${session.source.qualityHint}` : null
  const stateText = error ?? (busy ? (session ? 'Switching source…' : 'Finding a source…') : session ? 'Source ready' : 'Finding a source…')

  return (
    <main className="flex h-dvh flex-col bg-black" data-consumit-player-screen>
      <section aria-label={`${name} playback`} className="relative flex min-h-0 w-full flex-1 flex-col justify-center">
        <p className="sr-only" role="status">{stateText}</p>
        <ConsumitPlayer
          className="flex w-full flex-1 flex-col rounded-none border-0" title={name} posterSrc={episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl ?? undefined}
          source={session?.source} extraSubtitles={extraSubtitles} resumeAt={resume.position} resumePlaying={resume.playing}
          topMeta={[episodeMeta, qualityMeta].filter(Boolean).join(' · ') || undefined}
          onBack={() => router.push(titleHref(title))}
          serverOptions={servers.map((server) => ({ value: server.id, label: server.label, detail: server.detail }))}
          selectedServer={session?.source.providerId}
          onServerChange={(providerId) => void switchServer(providerId)}
          onSourceError={(reason) => void recover(reason)} onRetry={() => void start()}
          onTimeUpdate={(event) => { clock.current.position = event.currentTarget.currentTime; clock.current.duration = event.currentTarget.duration }}
          onPlay={() => { clock.current.playing = true; clock.current.completed = false; setEnded(false) }}
          onPause={() => { if (!requestRef.current) { clock.current.playing = false; void save(false, true) } }}
          onEnded={() => { clock.current.playing = false; clock.current.completed = true; setEnded(true); void save(false, true) }}
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
        {ended && nextHref ? (
          <div className="absolute inset-x-0 bottom-24 flex justify-center px-6">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-control bg-black/70 px-4 py-3">
              <span className="text-sm font-bold text-ink">Up next</span>
              <Link className={buttonVariants()} href={nextHref}>Next episode</Link>
              <Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(title)}>Return to title</Link>
            </div>
          </div>
        ) : null}
        {syncError ? (
          <p className="pointer-events-none absolute bottom-24 left-4 max-w-[40ch] text-xs text-muted">Progress is saved on this device. Account sync will retry.</p>
        ) : null}
      </section>
    </main>
  )
}

