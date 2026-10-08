'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaybackEvents, PlaybackRef, PlaybackSession, DeliveryFailure } from '@consumit/contracts'

import { ConsumitPlayer, readQualityPreference, type DirectMediaSource } from '@consumit/next-ui'
import { createPlaybackCoordinator, watchSourceExpiry } from '@/lib/playback-coordinator'
import { playbackCapabilities } from '@/lib/playback-browser'
import { listEmbedProviders, recoverEmbedSession, resolveEmbedSession, switchEmbedSession } from '@/lib/embed-playback-browser'
import { fetchAggregatedSubtitles, type AggregatedSubtitle } from '@/lib/subtitles-browser'
import { createPlaybackEvents } from '@/lib/playback-events'

export interface EmbedSource {
  url: string
  type: 'hls' | 'dash' | 'native'
  quality: string
  provider: string
  headers: Record<string, string>
}

export interface EmbedSub {
  url: string
  label: string
  format: 'vtt' | 'srt'
}

export type EmbedPlayerEventName = 'play' | 'pause' | 'seeked' | 'ended' | 'timeupdate'

export type EmbedPlayerProps = {
  autoPlay?: boolean
  lang?: string | undefined
  audioLanguage?: string | undefined
  overview?: string | undefined
  pauseFacts?: string | undefined
  posterSrc?: string | undefined
  playbackRef?: PlaybackRef | undefined
  sources?: EmbedSource[] | undefined
  startAt?: number
  subtitles?: EmbedSub[]
  /** Human title from the catalog (or an honest fallback). */
  title: string
  /** TMDB id echoed to the parent frame in PLAYER_EVENT payloads. */
  videoId: number
}

function parentPayload(event: EmbedPlayerEventName, currentTime: number, duration: number, videoId: number) {
  return {
    type: 'PLAYER_EVENT',
    data: { currentTime, duration, event, video_id: videoId },
  } as const
}

/** Post one player event to the embedding page (VixSrc-compatible shape).
 *  No-ops outside an iframe so the standalone route stays quiet. */
export function postEmbedPlayerEvent(
  event: EmbedPlayerEventName,
  currentTime: number,
  duration: number,
  videoId: number,
  target: Window = window,
) {
  if (target.parent === target) return
  target.parent.postMessage(parentPayload(event, currentTime, duration, videoId), '*')
}

function createEmbedCoordinator() {
  let token: string | null = null
  const coordinator = createPlaybackCoordinator({
    async resolve(input, signal) {
      const result = await resolveEmbedSession(input, signal)
      token = result.token
      return result.session
    },
    providers: listEmbedProviders,
    recover(current, action, failure, signal) {
      if (!token) throw new Error('Playback session expired.')
      return recoverEmbedSession(current, token, action, failure, signal)
    },
    switch(current, providerId, signal, preferences) {
      if (!token) throw new Error('Playback session expired.')
      return switchEmbedSession(current, token, providerId, signal, preferences)
    },
  })
  return {
    ...coordinator,
    sendEvents(id: string, batch: PlaybackEvents) {
      if (!token) return
      void fetch(`/v1/embed/session/${id}/events`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(batch), keepalive: true, signal: AbortSignal.timeout(3000),
      }).catch(() => undefined)
    },
  }
}

export function EmbedPlayer({ autoPlay = true, lang, audioLanguage, overview, pauseFacts, posterSrc, playbackRef, sources, startAt = 0, subtitles, title, videoId }: EmbedPlayerProps) {
  const durationRef = useRef(0)
  const requestRef = useRef<AbortController | null>(null)
  const clock = useRef({ position: startAt, playing: autoPlay })
  const [session, setSession] = useState<PlaybackSession | null>(null)
  const [extraSubtitles, setExtraSubtitles] = useState<AggregatedSubtitle[]>([])
  const [resume, setResume] = useState({ position: startAt, playing: autoPlay })
  const [busy, setBusy] = useState(Boolean(playbackRef))
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const subtitlesLoaded = useRef(false)
  const eventsRef = useRef<ReturnType<typeof createPlaybackEvents> | null>(null)
  const [coordinator] = useState(createEmbedCoordinator)
  const sessionId = session?.id
  useEffect(() => {
    if (!sessionId) return
    const events = createPlaybackEvents(sessionId, (batch) => coordinator.sendEvents(sessionId, batch))
    eventsRef.current = events
    return () => { events.close(); eventsRef.current = null }
  }, [sessionId, coordinator])
  const emit = useCallback((event: EmbedPlayerEventName, video: HTMLVideoElement) => {
    if (Number.isFinite(video.duration) && video.duration > 0) durationRef.current = video.duration
    postEmbedPlayerEvent(event, video.currentTime, durationRef.current, videoId)
  }, [videoId])
  const start = useCallback(async () => {
    if (!playbackRef || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true); setError(null)
    try {
      const request = { ref: playbackRef, audioLanguage: audioLanguage ?? lang ?? 'en', capabilities: playbackCapabilities(), preferences: { qualityHeight: readQualityPreference() } }
      const next = await coordinator.resolve(request, controller.signal)
      if (controller.signal.aborted) return
      setResume({ position: clock.current.position, playing: clock.current.playing })
      setSession(next)
    } catch {
      if (!controller.signal.aborted) setError('No stream is available right now. Try again in a moment.')
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [coordinator, playbackRef, audioLanguage, lang])
  useEffect(() => {
    if (playbackRef) void start()
    // React can disconnect and reconnect this tree while a resolve is in
    // flight. Aborting it here makes the next mount reuse a cancelled
    // coalesced resolver promise; the request is already bounded by timeout.
  }, [playbackRef, start])

  const recover = useCallback(async (reason: 'network' | 'media' | 'gone' | 'expired', deliveryFailure?: DeliveryFailure) => {
    if (!session || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    const retained = { position: clock.current.position, playing: clock.current.playing }
    setBusy(true); setError(null)
    try {
      // Recovery re-runs the full waterfall (20s server deadline) + settle:
      // the browser abort must stay behind it.
      const next = await coordinator.recover(session, reason, AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]), deliveryFailure)
      if (controller.signal.aborted) return
      if (next.ref.kind !== session.ref.kind || next.ref.id !== session.ref.id || next.ref.season !== session.ref.season || next.ref.episode !== session.ref.episode) throw new Error('Playback returned a different title.')
      setResume(retained); setSession(next)
      if (next.source.providerId !== session.source.providerId) setNotice('Playback resumed from another source.')
    } catch {
      if (!controller.signal.aborted) setError('We couldn’t restore playback. Try again.')
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [coordinator, session])
  useEffect(() => {
    if (!session) return
    return watchSourceExpiry(session.source.expiresAt, () => void recover('expired'))
  }, [session, recover])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(timer)
  }, [notice])

  const loadSubtitles = useCallback(() => {
    if (!playbackRef || subtitlesLoaded.current) return
    subtitlesLoaded.current = true
    void fetchAggregatedSubtitles(playbackRef, AbortSignal.timeout(15_000), lang ? [lang] : undefined)
      .then(setExtraSubtitles, () => { subtitlesLoaded.current = false })
  }, [playbackRef, lang])
  const staticSource = sources?.[0]
  const source: DirectMediaSource | undefined = (session && session.source.type !== 'iframe' ? { ...session.source, type: session.source.type } : undefined) ?? (staticSource ? {
    src: staticSource.url,
    type: staticSource.type,
    subtitles: subtitles?.map((sub) => ({ id: sub.url, label: sub.label, language: sub.label.slice(0, 32), url: sub.url })),
    qualityHint: staticSource.quality,
  } : undefined)
  if (!playbackRef && !staticSource) return null

  return <div className="relative min-h-0 w-full flex-1 bg-black" data-consumit-embed-player>
    <ConsumitPlayer
      autoPlay={autoPlay}
      className="h-full w-full rounded-none border-0"
      source={source}
      extraSubtitles={extraSubtitles}
      onSourceError={(reason, deliveryFailure) => void recover(reason, deliveryFailure)}
      onSubtitleRequest={loadSubtitles}
      onPlaybackEvent={(event) => eventsRef.current?.push(event)}
      onMediaPreferencesChange={(preferences) => coordinator.setPreferences({ ...preferences, ...(audioLanguage ? { audioLanguage } : {}) })}
      onRetry={() => void start()}
      onDurationChange={(event) => { if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) durationRef.current = event.currentTarget.duration }}
      onEnded={(event) => { clock.current.playing = false; emit('ended', event.currentTarget) }}
      onPause={(event) => { if (!requestRef.current) clock.current.playing = false; emit('pause', event.currentTarget) }}
      onPlay={(event) => { clock.current.playing = true; loadSubtitles(); emit('play', event.currentTarget) }}
      onSeeked={(event) => emit('seeked', event.currentTarget)}
      onTimeUpdate={(event) => { clock.current.position = event.currentTarget.currentTime; emit('timeupdate', event.currentTarget) }}
      pauseFacts={pauseFacts}
      pauseLogoUrl={posterSrc}
      pauseOverview={overview}
      posterSrc={posterSrc}
      resumeAt={resume.position}
      resumePlaying={resume.playing}
      subtitleLanguages={lang ? [lang] : undefined}
      title={title}
      topMeta={['Playing from Consumit', source?.qualityHint && source.qualityHint !== 'Auto' ? source.qualityHint : null].filter(Boolean).join(' · ')}
    />
    {busy ? <p className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink" role="status">{session ? 'Switching source…' : 'Finding a source…'}</p> : null}
    {!busy && notice ? <p className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-control border border-border bg-black/80 px-3 py-1.5 text-xs font-bold text-ink" role="status">{notice}</p> : null}
    {error ? <div className="absolute inset-0 z-20 grid place-items-center bg-black/85 p-5" role="alert"><div className="max-w-sm text-center"><p className="text-sm font-bold text-ink">{error}</p><button className="mt-4 min-h-11 rounded-control bg-ink px-5 text-sm font-bold text-canvas focus-visible:ring-2 focus-visible:ring-orange" onClick={() => void start()}>Try again</button></div></div> : null}
  </div>
}
