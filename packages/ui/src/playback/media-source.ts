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
  subtitles?: readonly { id: string; label: string; language: string; url: string }[] | undefined
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
  if (/^\/v1\/playback\/media\/[a-f0-9]{8}-[a-f0-9-]{27}$/.test(url)) return true
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

/**
 * Auto-quality ceiling in pixels of rendition height for the current viewport.
 * `capLevelToPlayerSize` already prevents picks above the player element, but
 * high-DPR phones still qualify for wasteful 1080p/4K renditions; this tier
 * caps Auto mode where extra pixels buy nothing visible. Explicit quality
 * selection bypasses it (the controller sets the level directly).
 */
export function deviceAutoCapHeight(viewport?: { width: number; height: number } | undefined): number {
  const dims = viewport ?? (typeof window === 'undefined'
    ? undefined
    : { width: window.innerWidth, height: window.innerHeight })
  const smallest = dims ? Math.min(dims.width, dims.height) : Number.NaN
  if (!Number.isFinite(smallest) || smallest <= 0) return Number.POSITIVE_INFINITY
  if (smallest < 500) return 720
  if (smallest < 900) return 1080
  return Number.POSITIVE_INFINITY
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

/** Compatibility entry point; the controller uses the same engine implementation. */
export async function attachDirectMedia(video: HTMLVideoElement, source: DirectMediaSource): Promise<DetachMedia> {
  const { attachMediaEngine } = await import('./media-engine')
  return (await attachMediaEngine(video, source, { tracks() {}, fatal() {} })).destroy
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
