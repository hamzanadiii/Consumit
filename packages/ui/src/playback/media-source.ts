/**
 * Authorized direct-media seam for the Consumit Player.
 *
 * The player owns controls and the native media surface. Providers supply
 * direct media (native progressive, HLS, or DASH) through this boundary.
 * Iframe and embed delivery are excluded. Every URL crossing this seam is
 * treated as hostile until it passes the safety check below.
 *
 * Stage 6 owns provider ranking, health, entitlement, and switching. This
 * module only validates, classifies, and attaches an already-authorized
 * source. HLS/DASH engines load lazily so the base bundle stays fast.
 */

export type DirectMediaType = 'native' | 'hls' | 'dash'

export type DirectMediaSource = {
  /** Direct delivery type. `native` is progressive MP4/WebM. */
  type: DirectMediaType
  /** Authorized https URL. Never a provider page, embed, or shortcut. */
  src: string
  /** Optional caller hint, e.g. "4K", shown in the top meta line. */
  qualityHint?: string | undefined
}

export type ChapterCue = {
  startTime: number
  title: string
}

export function isSafeMediaUrl(url: string): boolean {
  if (!url || url.length > 2048) return false
  const trimmed = url.trim()
  if (trimmed !== url) return false
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost') return false
  if (host.endsWith('.localhost')) return false
  if (host === '[::1]' || host === '::1') return false
  if (/^(127\.|10\.|192\.168\.)/.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  if (host === '169.254.169.254') return false
  if (/[\s<>"'`]/.test(trimmed)) return false
  return true
}

export function canPlayHlsNatively(video: HTMLVideoElement): boolean {
  try {
    return video.canPlayType('application/vnd.apple.mpegurl') !== ''
  } catch {
    return false
  }
}

export function canPlayDashNatively(video: HTMLVideoElement): boolean {
  try {
    return video.canPlayType('application/dash+xml') !== ''
  } catch {
    return false
  }
}

export class UnsafeMediaSourceError extends Error {
  constructor() {
    super('Blocked an unauthorized playback source.')
    this.name = 'UnsafeMediaSourceError'
  }
}

export class UnsupportedMediaTypeError extends Error {
  constructor(type: DirectMediaType) {
    super(
      type === 'hls'
        ? 'HLS needs a compatible engine on this browser.'
        : 'DASH needs a compatible engine on this browser.',
    )
    this.name = 'UnsupportedMediaTypeError'
  }
}

export type DetachMedia = () => void

type HlsEngineConstructor = {
  isSupported(): boolean
  new (config?: Record<string, unknown>): {
    attachMedia(video: HTMLVideoElement): void
    destroy(): void
    loadSource(src: string): void
  }
}

type DashEngine = {
  MediaPlayer(): {
    create(): {
      initialize(video: HTMLVideoElement, src: string, autoPlay: boolean): void
      reset(): void
    }
  }
}

/**
 * Attach an authorized direct-media source to a native video element.
 * Resolves with a detach function. Throws UnsafeMediaSourceError for
 * hostile URLs and UnsupportedMediaTypeError when no engine is available.
 */
export async function attachDirectMedia(
  video: HTMLVideoElement,
  source: DirectMediaSource,
): Promise<DetachMedia> {
  if (!isSafeMediaUrl(source.src)) throw new UnsafeMediaSourceError()

  if (source.type === 'native') {
    if (video.src !== source.src) video.src = source.src
    return () => {
      video.removeAttribute('src')
      video.load()
    }
  }

  if (source.type === 'hls' && canPlayHlsNatively(video)) {
    if (video.src !== source.src) video.src = source.src
    return () => {
      video.removeAttribute('src')
      video.load()
    }
  }

  if (source.type === 'dash' && canPlayDashNatively(video)) {
    if (video.src !== source.src) video.src = source.src
    return () => {
      video.removeAttribute('src')
      video.load()
    }
  }

  if (source.type === 'hls') {
    let Hls: HlsEngineConstructor | undefined
    try {
      // Lazy chunk: the engine loads only when an HLS source attaches,
      // so the base player bundle stays fast on every machine.
      const mod = (await import('hls.js')) as unknown as {
        default?: HlsEngineConstructor
      } & HlsEngineConstructor
      Hls = mod.default ?? (mod as HlsEngineConstructor)
    } catch {
      throw new UnsupportedMediaTypeError('hls')
    }
    if (!Hls?.isSupported()) throw new UnsupportedMediaTypeError('hls')
    const hls = new Hls({
      backBufferLength: 60,
      enableWorker: true,
      maxBufferLength: 30,
    })
    hls.loadSource(source.src)
    hls.attachMedia(video)
    return () => {
      try {
        hls.destroy()
      } catch {
        /* engine teardown must never break the player */
      }
      video.removeAttribute('src')
      video.load()
    }
  }

  let dashjs: DashEngine | undefined
  try {
    // Lazy chunk: the engine loads only when a DASH source attaches.
    const mod = (await import('dashjs')) as unknown as {
      default?: DashEngine
    } & DashEngine
    dashjs = mod.default ?? (mod as DashEngine)
  } catch {
    throw new UnsupportedMediaTypeError('dash')
  }
  if (!dashjs?.MediaPlayer) throw new UnsupportedMediaTypeError('dash')
  const dashPlayer = dashjs.MediaPlayer().create()
  dashPlayer.initialize(video, source.src, false)
  return () => {
    try {
      dashPlayer.reset()
    } catch {
      /* engine teardown must never break the player */
    }
    video.removeAttribute('src')
    video.load()
  }
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}
