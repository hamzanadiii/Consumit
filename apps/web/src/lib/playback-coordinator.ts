import type { PlaybackFailureRequest, PlaybackProvider, PlaybackSession, DeliveryFailure, ResolvePlaybackRequest } from '@consumit/contracts'

export type PlaybackTransport = {
  resolve(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackSession>
  providers(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]>
  recover(session: PlaybackSession, action: 'refresh' | 'fallback', failure: PlaybackFailureRequest, signal: AbortSignal): Promise<PlaybackSession>
  switch(session: PlaybackSession, providerId: string, signal: AbortSignal): Promise<PlaybackSession>
}

/** One recovery policy for member Watch and cookie-free public embeds.
 *
 * Recovery ladder (each rung retains position and play intent; quality
 * re-solves per source, so a stale cap never follows a member to a new
 * provider):
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
 *   skip refresh and go straight to fallback.
 * - L4 provider fallback: `recover()` advances past the failed provider
 *   group within the rolling fallback budget; `switchAvailable()` walks the
 *   server menu (healthy first) for member-initiated switches, which ride
 *   outside the automatic budget.
 * - L5 embed-safe recovery: this same ladder runs inside the public embed
 *   iframe over in-memory bearer-token sessions, so recovery never depends
 *   on third-party cookies. Provider iframe players stay excluded.
 * - L6 honest failure: when refresh and fallback both fail, `recover()`
 *   rejects and the caller renders the unavailable state (Try again +
 *   return), never a demo clip or silent stall.
 */
export function createPlaybackCoordinator(transport: PlaybackTransport, now = Date.now) {
  return {
    async resolve(input: ResolvePlaybackRequest, signal: AbortSignal) {
      return transport.resolve(input, signal)
    },
    providers: transport.providers,
    async switch(session: PlaybackSession, providerId: string, signal: AbortSignal) {
      return transport.switch(session, providerId, signal)
    },
    async switchAvailable(session: PlaybackSession, providerId: string, providers: readonly PlaybackProvider[], signal: AbortSignal) {
      const tried = new Set<string>([session.source.providerId])
      let candidate: string | undefined = providerId
      while (candidate && !signal.aborted) {
        tried.add(candidate)
        try {
          const next = await transport.switch(session, candidate, signal)
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
      const failure: PlaybackFailureRequest = { sourceId: session.source.id, reason: reason === 'gone' ? 'unsupported' : reason, ...(deliveryFailure ? { deliveryFailure } : {}) }
      if (reason === 'gone' || reason === 'media' || deliveryFailure === 'headers' || deliveryFailure === 'forbidden') {
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
export function watchSourceExpiry(expiresAt: string, refresh: () => void): () => void {
  const cancel = scheduleSourceRefresh(expiresAt, refresh)
  const visible = () => {
    if (document.visibilityState === 'visible' && Date.parse(expiresAt) <= Date.now() + 60_000) refresh()
  }
  document.addEventListener('visibilitychange', visible)
  return () => { cancel(); document.removeEventListener('visibilitychange', visible) }
}

/** Browser timers cannot represent arbitrarily distant provider expiries. */
export function scheduleSourceRefresh(expiresAt: string, refresh: () => void, now = Date.now): () => void {
  let timer: ReturnType<typeof setTimeout>
  let cancelled = false
  const schedule = () => {
    if (cancelled) return
    const remaining = Date.parse(expiresAt) - now() - 15_000
    if (!Number.isFinite(remaining)) return
    timer = setTimeout(() => {
      if (cancelled) return
      if (Date.parse(expiresAt) - now() <= 15_000) refresh()
      else schedule()
    }, Math.max(1000, Math.min(remaining, 3_600_000)))
  }
  schedule()
  return () => { cancelled = true; clearTimeout(timer) }
}
