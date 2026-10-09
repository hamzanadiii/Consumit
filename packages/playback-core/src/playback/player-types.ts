import type { ComponentProps, ReactNode } from 'react'
import type { DirectMediaSource, ChapterCue } from './media-source'
import type { SeparateAudioSource, SeparateAudioTrack } from './separate-audio'
import type { ControllerEvent } from './playback-controller'
import type { MediaPreferences } from './media-preferences'
import type { EngineDeliveryFailure } from './media-engine'

export type PlayerMenuId = 'quality' | 'server' | 'settings' | 'subtitles' | 'sync' | 'playback' | 'audio' | 'appearance' | 'shortcuts' | 'cast'

export type CaptionSize = 'small' | 'medium' | 'large' | 'xlarge'
export type CaptionBackground = 'cinematic' | 'boxed' | 'subtle'
export type CaptionPosition = 'bottom' | 'top'
/** FilScreen vibe default: Charter film-poster serif. `sans` is the compact DejaVu interface voice. */
export type CaptionFont = 'filscreen' | 'sans'

export type PlayerOption = {
  detail?: string | undefined
  label: string
  value: string
  /** ISO-3166 alpha-2 serving region; rendered as the server flag. */
  region?: string | undefined
  /** Breaker-derived serving state; shown, never blocking. */
  health?: 'ok' | 'degraded' | undefined
  /** Mirror family (base adapter) and mirror name (`auto` for the
   *  whole-provider aggregate). The server menu groups by family so
   *  members choose between mirrors with their qualities. Absent for
   *  legacy callers, which render as one ungrouped family. */
  family?: string | undefined
  mirror?: string | undefined
  /** False when this mirror did not answer for the title. The row stays
   *  selectable: a tap attempts a fresh resolve and auto-advances on
   *  failure. Absent means available (legacy payloads). */
  available?: boolean | undefined
  /** BCP-47-ish language code for subtitle tracks; rendered natively
   *  (العربية, Español, …) PROVE-embed style. Absent for Off. */
  language?: string | undefined
}

export type PlayerSubtitleCandidate = { id: string; label: string; language: string; provider: string; release?: string | undefined; hi?: boolean | undefined; forced?: boolean | undefined; sdh?: boolean | undefined; machineTranslated?: boolean | undefined; preparedUrl?: string | undefined }
export type PlayerSubtitleDiscovery = {
  languages: readonly { code: string; count: number }[]
  providers: readonly { id: string; name: string; state: 'ready' | 'skipped' | 'no_match' | 'failed' | 'timeout'; durationMs: number; found: number; reason?: 'credentials_required' | 'unsupported' | undefined }[]
  loading: boolean
  error: string | null
}

export type ConsumitPlayerProps = Omit<
  ComponentProps<'video'>,
  'className' | 'controls' | 'poster' | 'title'
> & {
  /** Authorized direct-media source. Preferred over `src`; validated at the adapter seam. */
  source?: DirectMediaSource | undefined
  className?: string | undefined
  posterSrc?: string | undefined
  status?: ReactNode | undefined
  statusTone?: 'healthy' | 'neutral' | 'unavailable' | undefined
  title: string
  videoClassName?: string | undefined
  /** When set, renders the top bar: back control, title context, quality and subtitle shortcuts. */
  backHref?: string | undefined
  onBack?: (() => void) | undefined
  /** Secondary top-line context, e.g. "Playing from Consumit · 4K". */
  topMeta?: ReactNode | undefined
  /** Source resolution belongs to Watch; this only presents its pending state. */
  preparing?: boolean | undefined
  preparationMeta?: ReactNode | undefined
  /** Exact neighboring episode actions supplied by the Watch route. */
  onPreviousEpisode?: (() => void) | undefined
  onNextEpisode?: (() => void) | undefined
  /** Pause-overlay facts line, e.g. "2026 · 1h 40m · ★ 6.5 · PG-13". Shown while paused. */
  pauseFacts?: ReactNode | undefined
  /** Pause-overlay title artwork logo (TMDB artwork mark). Falls back to the serif title. Shown while paused. */
  pauseLogoUrl?: string | undefined
  /** Pause-overlay synopsis, clamped to three lines. Shown while paused. */
  pauseOverview?: string | undefined
  /** Pause-overlay title. Defaults to the full title; pass the bare
   *  series/anime name to keep the paused headline stable across episodes. */
  pauseTitle?: string | undefined
  chapters?: readonly ChapterCue[] | undefined

  audioOptions?: readonly PlayerOption[] | undefined
  selectedAudio?: string | undefined
  onAudioChange?: ((value: string) => void) | undefined
  separateAudioTracks?: readonly SeparateAudioTrack[] | undefined
  separateAudioLoading?: boolean | undefined
  separateAudioError?: string | null | undefined
  onAudioRequest?: (() => void) | undefined
  onSeparateAudioSelect?: ((id: string) => Promise<SeparateAudioSource>) | undefined
  subtitleOptions?: readonly PlayerOption[] | undefined
  selectedSubtitle?: string | undefined
  onSubtitleChange?: ((value: string) => void) | undefined
  /** Called when captions are opened, so external search can stay lazy. */
  onSubtitleRequest?: (() => void) | undefined
  subtitleDiscovery?: PlayerSubtitleDiscovery | undefined
  onSubtitlePage?: ((language: string, cursor: number) => Promise<{ tracks: PlayerSubtitleCandidate[]; total: number; nextCursor: number | null }>) | undefined
  onSubtitleSearch?: ((query: string, cursor: number) => Promise<{ tracks: PlayerSubtitleCandidate[]; total: number; nextCursor: number | null }>) | undefined
  onSubtitleCandidateSelect?: ((candidate: PlayerSubtitleCandidate) => Promise<{ id: string; label: string; language: string; url: string }>) | undefined
  /** Caption tracks arriving after first frame (e.g. other providers'
   *  subtitles from the server list). They join the menu live via the
   *  controller without reloading media. */
  extraSubtitles?: readonly { id: string; label: string; language: string; url: string }[] | undefined
  /** Current cue text rendered in the prototype subtitle bar. Native <track> cues still render natively. */
  caption?: string | undefined
  /** Caption appearance. Uncontrolled by default: stored on the device and applied after mount. */
  captionSize?: CaptionSize | undefined
  captionBackground?: CaptionBackground | undefined
  captionPosition?: CaptionPosition | undefined
  captionFont?: CaptionFont | undefined
  onCaptionSizeChange?: ((value: CaptionSize) => void) | undefined
  onCaptionBackgroundChange?: ((value: CaptionBackground) => void) | undefined
  onCaptionPositionChange?: ((value: CaptionPosition) => void) | undefined
  onCaptionFontChange?: ((value: CaptionFont) => void) | undefined
  /** Subtitle sync offset in milliseconds (old-player semantics: the cue
   *  shown at time `t` contains `t + delayMs / 1000`). Uncontrolled by
   *  default: stored on the device and applied after mount. */
  subtitleDelayMs?: number | undefined
  onSubtitleDelayMsChange?: ((value: number) => void) | undefined
  /** Preferred subtitle languages in priority order (max 3). The engine
   *  tries these first from every subtitle provider. Uncontrolled by
   *  default: stored on the device and applied after mount. */
  subtitleLanguages?: readonly string[] | undefined
  onSubtitleLanguagesChange?: ((value: string[]) => void) | undefined
  qualityOptions?: readonly PlayerOption[] | undefined
  selectedQuality?: string | undefined
  onQualityChange?: ((value: string) => void) | undefined
  playbackRates?: readonly number[] | undefined
  selectedRate?: number | undefined
  onRateChange?: ((value: number) => void) | undefined
  brightness?: number | undefined
  onBrightnessChange?: ((value: number) => void) | undefined
  /** Skip intro/outro automatically when ranges are known. Uncontrolled by
   *  default: stored on the device and applied after mount. */
  autoSkip?: boolean | undefined
  onAutoSkipChange?: ((value: boolean) => void) | undefined
  /** Inactivity delay before the control chrome fades. */
  autoHideMs?: number | undefined
  /** Alternative playback providers for manual source switching. */
  serverOptions?: readonly PlayerOption[] | undefined
  selectedServer?: string | undefined
  onServerChange?: ((value: string) => void) | undefined
  /** Auto keeps the current stream and lets Watch choose replacements. */
  serverAuto?: boolean | undefined
  onServerAuto?: (() => void) | undefined
  serverLoading?: boolean | undefined
  serverError?: string | null | undefined
  serverBusy?: boolean | undefined
  onServerRequest?: (() => void) | undefined
  onRetry?: (() => void) | undefined
  /** Cast remains discoverable; the caller owns TV sessions and progress. */
  castAvailable?: boolean | undefined
  castConnected?: boolean | undefined
  onCastClick?: (() => void) | undefined
  onCastCheck?: (() => Promise<'ready' | 'unconfigured' | 'unavailable'>) | undefined
  resumeAt?: number | undefined
  resumePlaying?: boolean | undefined
  onSourceError?: ((reason: 'network' | 'media' | 'gone' | 'expired', deliveryFailure?: EngineDeliveryFailure) => void) | undefined
  onPlaybackEvent?: ((event: ControllerEvent) => void) | undefined
  onMediaPreferencesChange?: ((preferences: MediaPreferences) => void) | undefined
}
