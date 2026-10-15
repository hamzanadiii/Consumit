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

export type SkipSegment = { kind: 'intro' | 'outro' | 'recap'; start: number; end: number }

export type DirectMediaSource = {
  subtitles?: readonly { id: string; label: string; language: string; url: string }[] | undefined
  /** Direct delivery type. `native` is progressive MP4/WebM. */
  type: DirectMediaType
  /** Authorized https URL. Never a provider page, embed, or shortcut. */
  src: string
  /** Internal live lease seam for buffered relay HLS. Never sent to providers. */
  relayLease?: (() => { src: string } | undefined) | undefined
  /** Optional caller hint, e.g. "4K", shown in the top meta line. */
  qualityHint?: string | undefined
  /** Adapter-declared full VTT documents in HLS subtitle playlist slots. */
  hlsSubtitlePlaylistFormat?: 'vtt' | undefined
  /** Opening/ending ranges in seconds for the skip control. */
  skipSegments?: readonly SkipSegment[] | undefined
}

export type ChapterCue = {
  startTime: number
  title: string
}

export function isSafeMediaUrl(url: string): boolean {
  if (/^\/v1\/playback\/media\/[a-f0-9]{8}-[a-f0-9-]{27}$/.test(url)) return true
  if (!url || url.length > 4096) return false
  const trimmed = url.trim()
  if (trimmed !== url) return false
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  // First-party control playlists contain authenticated capabilities, never
  // caller-selected destinations. Local HTTP is confined to this exact route.
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin
    && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.hash
    && parsed.pathname === '/v1/playback/relay-manifest' && [...parsed.searchParams].length === 1
    && /^[A-Za-z0-9_-]{29,3600}$/.test(parsed.searchParams.get('grant') ?? '')) return true
  if (url.length > 2048) return false
  // Controlled browser fixture only; production still requires HTTPS media.
  // The explicit public flag is set only when building the production-like fixture harness.
  const fixtureOrigin = (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_PLAYBACK_FIXTURE === '1')
    && parsed.origin === 'http://127-0-0-1.nip.io:18560'
  if (parsed.protocol !== 'https:' && !fixtureOrigin) return false
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

/**
 * Human label for one HLS audio rendition in the player menu. Some upstreams
 * tag every rendition `Audio N` with no LANGUAGE attribute — and the tag is
 * missing down to the fMP4 init segments (`mdhd` reads `und`) — so there is
 * no language to show and inventing one would mislead. The only honest
 * signal left is the manifest DEFAULT flag: the provider's primary rendition
 * becomes "Main audio" while the rest keep their stable numbers.
 */
export function audioTrackLabel(track: { name?: string | undefined; lang?: string | undefined; isDefault?: boolean | undefined }, index: number): string {
  const name = track.name?.trim()
  if (name && !/^audio\s*\d+$/i.test(name)) return name
  const lang = track.lang?.trim()
  if (lang) return name || lang
  if (track.isDefault) return 'Main audio'
  return name || `Audio ${index + 1}`
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
