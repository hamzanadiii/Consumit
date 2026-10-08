import type { PlaybackFailureRequest, PlaybackProvider, PlaybackSession, PlaybackPreferences, DeliveryFailure, ResolvePlaybackRequest } from '@consumit/contracts'

export type PlaybackTransport = {
  resolve(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackSession>
  providers(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]>
  recover(session: PlaybackSession, action: 'refresh' | 'fallback', failure: PlaybackFailureRequest, signal: AbortSignal): Promise<PlaybackSession>
  switch(session: PlaybackSession, providerId: string, signal: AbortSignal, preferences?: PlaybackPreferences): Promise<PlaybackSession>
}

/** One recovery policy for member Watch and cookie-free public embeds.
 *
 * Recovery ladder retains position, play intent, resolution preference, and
 * language preference. Rendition identifiers are always resolved per source:
 *
 * - L0 segment retry: the media engine's own retry policy, plus one
 *   in-controller `engine.recover()` attempt. Native engines report false
 *   and skip straight to fatal.
 * - L1 manifest refresh: `engine.recover()` reloads the manifest
 *   (`hls.startLoad()`, `recoverMediaError()`). Gone/expired sources report
 *   false — re-minting a dead lease is pointless.
 * - L2 same-URL reload: covered by the single in-engine recover attempt.
 * - L3 new lease, same provider: `recover()` tries `refresh` first (the API
 *   re-resolves the selected provider and returns a new signed URL) and
 *   treats a stale renewal as failure. 410/gone and media-decoder failures
 *   skip refresh and go straight to fallback. Browser-blocked or unusable
 *   manifests also fall back: rotating an unusable URL must not restart an
 *   endless same-provider recovery loop.
 * - L4 provider fallback: `recover()` advances past the failed provider
 *   group within the rolling fallback budget; `switchAvailable()` walks the
 *   server menu (healthy first) for member-initiated switches, which ride
 *   outside the automatic budget.
 * - L5 provider frame: the API tries configured embeds after media tiers.
 *   Frame failures go straight to fallback; iframe load does not report
 *   playback or progress. Public Consumit embeds remain deferred.
 * - L6 honest failure: when refresh and fallback both fail, `recover()`
 *   rejects and the caller renders the unavailable state (Try again +
 *   return), never a demo clip or silent stall.
 */
export function createPlaybackCoordinator(transport: PlaybackTransport, now = Date.now) {
  let preferences: PlaybackPreferences | undefined
  return {
    setPreferences(value: PlaybackPreferences) { preferences = { ...preferences, ...value } },
    async resolve(input: ResolvePlaybackRequest, signal: AbortSignal) {
      preferences = input.preferences
      return transport.resolve(input, signal)
    },
    providers: transport.providers,
    async switch(session: PlaybackSession, providerId: string, signal: AbortSignal) {
      return preferences ? transport.switch(session, providerId, signal, preferences) : transport.switch(session, providerId, signal)
    },
    async switchAvailable(session: PlaybackSession, providerId: string, providers: readonly PlaybackProvider[], signal: AbortSignal) {
      const tried = new Set<string>([session.source.providerId])
      let candidate: string | undefined = providerId
      while (candidate && !signal.aborted) {
        tried.add(candidate)
        try {
          const next = preferences ? await transport.switch(session, candidate, signal, preferences) : await transport.switch(session, candidate, signal)
          return next
        } catch {
          if (signal.aborted) throw signal.reason
          const remaining = providers.filter((provider) => !tried.has(provider.id) && provider.available !== false)
          candidate = (remaining.find((provider) => provider.health !== 'degraded') ?? remaining[0])?.id
        }
      }
      throw new Error('No other provider is available.')
    },
    async recover(session: PlaybackSession, reason: 'network' | 'media' | 'expired' | 'gone', signal: AbortSignal, deliveryFailure?: DeliveryFailure) {
      const failure: PlaybackFailureRequest = { sourceId: session.source.id, reason: reason === 'gone' ? 'unsupported' : reason, ...(deliveryFailure ? { deliveryFailure } : {}), ...(preferences ? { preferences } : {}) }
      if (session.source.type === 'iframe' || reason === 'gone' || reason === 'media' || deliveryFailure === 'headers' || deliveryFailure === 'forbidden' || deliveryFailure === 'timeout' || deliveryFailure === 'manifest' || deliveryFailure === 'cors') {
        return transport.recover(session, 'fallback', failure, signal)
      }
      try {
        const next = await transport.recover(session, 'refresh', failure, signal)
        if (signal.aborted) throw signal.reason
        if (next.source.providerId !== session.source.providerId ||
            (next.source.src === session.source.src && (reason !== 'expired' || Date.parse(next.source.expiresAt) <= now() + 15_000))) {
          throw new Error('The selected server did not renew its source.')
        }
        return next
      } catch {
        if (signal.aborted) throw signal.reason
        return transport.recover(session, 'fallback', failure, signal)
      }
    },
  }
}

/** One expiry clock and background-tab check for both player surfaces. */
export function watchSourceExpiry(expiresAt: string, refresh: () => void, leadMs = 15_000): () => void {
  const cancel = scheduleSourceRefresh(expiresAt, refresh, Date.now, leadMs)
  const visible = () => {
    if (document.visibilityState === 'visible' && Date.parse(expiresAt) <= Date.now() + 60_000) refresh()
  }
  document.addEventListener('visibilitychange', visible)
  return () => { cancel(); document.removeEventListener('visibilitychange', visible) }
}

/** Browser timers cannot represent arbitrarily distant provider expiries. */
export function scheduleSourceRefresh(expiresAt: string, refresh: () => void, now = Date.now, leadMs = 15_000): () => void {
  let timer: ReturnType<typeof setTimeout>
  let cancelled = false
  const schedule = () => {
    if (cancelled) return
    const remaining = Date.parse(expiresAt) - now() - leadMs
    if (!Number.isFinite(remaining)) return
    timer = setTimeout(() => {
      if (cancelled) return
      if (Date.parse(expiresAt) - now() <= leadMs) refresh()
      else schedule()
    }, Math.max(1000, Math.min(remaining, 3_600_000)))
  }
  schedule()
  return () => { cancelled = true; clearTimeout(timer) }
}
