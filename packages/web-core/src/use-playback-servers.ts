'use client'
import { useCallback, useEffect, useState } from 'react'
import type { PlaybackProvider, PlaybackRef } from '@consumit/contracts'
import type { createPlaybackCoordinator } from './lib/playback-coordinator'
import { playbackCapabilities } from './lib/playback-browser'

/** Load the fixed server snapshot on demand, independently of active media. */
export function usePlaybackServers(coordinator: ReturnType<typeof createPlaybackCoordinator>, ref: PlaybackRef, audioLanguage: string, pinnedProvider?: string) {
  const [servers, setServers] = useState<PlaybackProvider[]>([])
  const [serverRequested, setServerRequested] = useState(false)
  const [serverLoading, setServerLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverAttempt, setServerAttempt] = useState(0)
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

  return { servers, serverRequested, serverLoading, serverError, requestServers }
}
