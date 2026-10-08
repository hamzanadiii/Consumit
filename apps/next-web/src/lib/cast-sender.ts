/**
 * Chromecast sender behind a mockable seam.
 *
 * The TV never holds member identity: the sender keeps the playback session,
 * polls cast status, and writes progress and telemetry through the existing
 * sender-side infrastructure. The Cast Web Sender SDK (`cast.framework.*`)
 * loads lazily and only when a Cast runtime exists, so browsers without one
 * never pay for it and never see a cast button.
 *
 * Reference: https://developers.google.com/cast/docs/web_sender/integrate
 */

/** Media the sender hands to the receiver. Subtitle/audio track parity lands in P2. */
export type CastLoadRequest = {
  /** Session source URL: validated browser-direct media. */
  contentId: string
  /** MIME type: HLS, DASH, or progressive MP4. */
  contentType: string
  title: string
  artwork?: string | undefined
  /** Resume position in seconds. */
  position: number
  /** Session context for the receiver: ids, language, provider headers. */
  customData: Record<string, unknown>
}

export type CastStatus = {
  connected: boolean
  deviceName: string | null
  position: number
  duration: number
  playing: boolean
  volume: number
  muted: boolean
}

export const CAST_SENDER_SCRIPT = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

/** Minimal structural surface of the Cast Web Sender SDK this module uses. */
export type CastSdk = {
  framework: {
    CastContext: {
      getInstance(): {
        setOptions(options: { receiverApplicationId: string; autoJoinPolicy?: string }): void
        getCurrentSession(): CastSession | null
        requestSession(): Promise<void>
        addEventListener(type: string, listener: (event: { sessionState?: string; castState?: string }) => void): void
      }
    }
    RemotePlayer: new () => {
      currentTime: number
      duration: number
      isPaused: boolean
      volumeLevel: number
      isMuted: boolean
      isConnected: boolean
    }
    RemotePlayerController: new (player: unknown) => {
      playOrPause(): void
      seek(): void
      setVolumeLevel(level: number, ...rest: unknown[]): void
      muteOrUnmute(): void
      addEventListener(type: string, listener: () => void): void
    }
    CastContextEventType: { SESSION_STATE_CHANGED: string; CAST_STATE_CHANGED: string }
    SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string }
    RemotePlayerEventType: { ANY_CHANGE: string; IS_CONNECTED_CHANGED: string }
  }
}

export type CastSession = {
  getCastDevice(): { friendlyName?: string } | null
  endSession(stopReceiver: boolean): void
  loadMedia(request: { mediaInfo: unknown }): Promise<void>
}

export interface CastSender {
  /** True once the SDK loaded and at least one Cast device is reachable. */
  readonly available: boolean
  /** Null until a cast session is active. */
  readonly status: CastStatus | null
  /** Load the SDK and initialize the Cast context. False when unavailable. */
  ensure(): Promise<boolean>
  subscribe(listener: () => void): () => void
  /** Open the device picker and start a session. */
  requestSession(): Promise<void>
  endSession(stopReceiver?: boolean): void
  loadMedia(request: CastLoadRequest): Promise<void>
  playOrPause(): void
  seekTo(seconds: number): void
  setVolume(level: number): void
  setMuted(muted: boolean): void
}

function defaultLoadScript(): Promise<unknown> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return Promise.resolve(null)
  const existing = (window as unknown as { cast?: { framework?: unknown } }).cast?.framework
  if (existing) return Promise.resolve((window as unknown as { cast: unknown }).cast)
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10_000)
    const w = window as unknown as Record<string, unknown>
    w.__onGCastApiAvailable = (available: unknown) => {
      if (!available) { clearTimeout(timeout); resolve(null); return }
      clearTimeout(timeout)
      resolve((w as { cast?: unknown }).cast ?? null)
    }
    const script = document.createElement('script')
    script.src = CAST_SENDER_SCRIPT
    script.async = true
    script.onerror = () => { clearTimeout(timeout); resolve(null) }
    document.head.append(script)
  })
}

/** Content type the receiver uses to pick its playback pipeline. */
export function castContentType(sourceType: 'hls' | 'dash' | 'native'): string {
  if (sourceType === 'hls') return 'application/x-mpegurl'
  if (sourceType === 'dash') return 'application/dash+xml'
  return 'video/mp4'
}

export function createCastSender(options: {
  receiverId?: string | undefined
  sdk?: CastSdk | null | undefined
  loadScript?: () => Promise<unknown>
} = {}): CastSender {
  const receiverId = options.receiverId ?? process.env.NEXT_PUBLIC_CAST_RECEIVER_ID ?? ''
  const loadScript = options.loadScript ?? defaultLoadScript
  const listeners = new Set<() => void>()
  let sdk = options.sdk ?? null
  let initialized = false
  let available = false
  let status: CastStatus | null = null
  let controller: { playOrPause(): void; seek(): void; setVolumeLevel(level: number, ...rest: unknown[]): void; muteOrUnmute(): void } | null = null
  let player: { currentTime: number; duration: number; isPaused: boolean; volumeLevel: number; isMuted: boolean; isConnected: boolean } | null = null

  function emit() { for (const listener of [...listeners]) listener() }

  function readStatus(): CastStatus | null {
    if (!player || !player.isConnected) return null
    return {
      connected: true,
      deviceName: null,
      position: Number.isFinite(player.currentTime) ? player.currentTime : 0,
      duration: Number.isFinite(player.duration) ? player.duration : 0,
      playing: !player.isPaused,
      volume: player.volumeLevel,
      muted: player.isMuted,
    }
  }

  function refresh() {
    const next = readStatus()
    const changed = JSON.stringify(next) !== JSON.stringify(status)
    status = next
    if (changed) emit()
  }

  function session() {
    return sdk?.framework.CastContext.getInstance().getCurrentSession() ?? null
  }

  function attachController() {
    if (!sdk || controller) return
    const types = sdk.framework.RemotePlayerEventType
    player = new sdk.framework.RemotePlayer()
    const owned = new sdk.framework.RemotePlayerController(player)
    owned.addEventListener(types.ANY_CHANGE, refresh)
    owned.addEventListener(types.IS_CONNECTED_CHANGED, () => {
      if (!player?.isConnected) { status = null; emit(); return }
      refresh()
    })
    controller = owned
  }

  function watchSession() {
    if (!sdk || initialized) return
    initialized = true
    const context = sdk.framework.CastContext.getInstance()
    const types = sdk.framework.CastContextEventType
    const states = sdk.framework.SessionState
    context.setOptions({ receiverApplicationId: receiverId, autoJoinPolicy: 'ORIGIN_SCOPED' })
    context.addEventListener(types.SESSION_STATE_CHANGED, (event) => {
      if (event.sessionState === states.SESSION_STARTED || event.sessionState === states.SESSION_RESUMED) {
        const device = session()?.getCastDevice() ?? null
        attachController()
        const current = readStatus()
        status = current ? { ...current, deviceName: device?.friendlyName ?? null } : null
        emit()
      } else if (event.sessionState === states.SESSION_ENDED) {
        status = null
        emit()
      }
    })
    context.addEventListener(types.CAST_STATE_CHANGED, (event) => {
      available = event.castState !== undefined && event.castState !== 'NO_DEVICES_AVAILABLE'
      emit()
    })
  }

  return {
    get available() { return available },
    get status() { return status },
    async ensure() {
      if (!receiverId) return false
      if (!sdk) {
        const loaded = await loadScript()
        if (!loaded || typeof loaded !== 'object' || !('framework' in loaded)) return false
        sdk = loaded as CastSdk
      }
      watchSession()
      return true
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async requestSession() {
      if (!sdk) throw new Error('Cast is unavailable on this device.')
      await sdk.framework.CastContext.getInstance().requestSession()
    },
    endSession(stopReceiver = true) {
      try { session()?.endSession(stopReceiver) } catch { /* Session teardown is best-effort. */ }
      status = null
      emit()
    },
    async loadMedia(request) {
      const active = session()
      if (!active) throw new Error('Connect to a Cast device first.')
      attachController()
      const mediaInfo = {
        contentId: request.contentId,
        contentType: request.contentType,
        metadata: { title: request.title, ...(request.artwork ? { images: [{ url: request.artwork }] } : {}) },
        customData: { ...request.customData, position: request.position },
        streamType: 'BUFFERED',
      }
      await active.loadMedia({ mediaInfo })
      if (player) player.currentTime = request.position
      refresh()
    },
    playOrPause() { controller?.playOrPause() },
    seekTo(seconds) { if (player && controller && Number.isFinite(seconds) && seconds >= 0) { player.currentTime = seconds; controller.seek() } },
    setVolume(level) { controller?.setVolumeLevel(Math.min(1, Math.max(0, level))) },
    setMuted(muted) { if (player && player.isMuted !== muted) controller?.muteOrUnmute() },
  }
}
