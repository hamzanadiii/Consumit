'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react'
import {
  ArrowLeft,
  Captions,
  Cast,
  Check,
  ChevronRight,
  Gauge,
  Heart,
  Keyboard,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  Moon,
  Music,
  Search,
  Upload,
  PictureInPicture2,
  Plus,
  RotateCcw,
  RotateCw,
  Server,
  Settings,
  SkipForward,
  SkipBack,
  TriangleAlert,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react'

import { cn } from '../lib/cn'
import { Toggle } from '../selection/selection'
import { PlayerAdjustment, PlayerPanel, PlayerSettingRow } from './player-panel'
import { createVolumeBoost } from './volume-boost'
import { createSeparateAudioPlayer, type SeparateAudioState, type SeparateAudioSource, type SeparateAudioTrack } from './separate-audio'
import { audioMenuOptions } from './audio-menu'
import { MissingArtwork } from '../media/media'
import {
  formatPlaybackTime,
  type ChapterCue,
  type DirectMediaSource,
} from './media-source'
import { createPlaybackController, type ControllerEvent, type ControllerSnapshot } from './playback-controller'
import type { MediaPreferences } from './media-preferences'
import { createPlaybackControllerNext } from './playback-controller-next'
import type { EngineDeliveryFailure } from './media-engine'
import {
  clampSubtitleDelayMs,
  computeSyncDelayMs,
  cueTextAt,
  fetchVttCues,
  formatSubtitleDelayMs,
  nativeLanguageName,
  subtitleLabelDetail,
  parseVttCues,
  readStoredSubtitleDelayMs,
  readStoredSubtitleLanguages,
  SUBTITLE_DELAY_KEY,
  type SubtitleCue,
} from './subtitle-sync'

export type PlayerMenuId = 'quality' | 'server' | 'settings' | 'subtitles' | 'sync' | 'playback' | 'audio' | 'appearance' | 'shortcuts'

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
  /** Chromecast output. The button renders only when a Cast runtime and a
   *  configured receiver exist; the caller owns session, progress, and
   *  telemetry while casting. */
  castAvailable?: boolean | undefined
  castConnected?: boolean | undefined
  onCastClick?: (() => void) | undefined
  resumeAt?: number | undefined
  resumePlaying?: boolean | undefined
  onSourceError?: ((reason: 'network' | 'media' | 'gone' | 'expired', deliveryFailure?: EngineDeliveryFailure) => void) | undefined
  onPlaybackEvent?: ((event: ControllerEvent) => void) | undefined
  onMediaPreferencesChange?: ((preferences: MediaPreferences) => void) | undefined
}

const DEFAULT_SUBTITLES: readonly PlayerOption[] = [
  { label: 'English', value: 'english' },
  { label: 'Off', value: 'off' },
]

const DEFAULT_AUDIO: readonly PlayerOption[] = [
  { detail: 'Stereo · Default', label: 'English', value: 'english' },
]

const DEFAULT_QUALITIES: readonly PlayerOption[] = [
  { detail: 'Adapts to your connection', label: 'Auto', value: 'auto' },
  { label: '1080p', value: '1080p' },
  { label: '720p', value: '720p' },
  { label: '480p', value: '480p' },
]

const DEFAULT_RATES: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2]

const SEEK_STEP = 10

const CAPTION_SIZE_KEY = 'consumit.player.caption-size'
const CAPTION_BACKGROUND_KEY = 'consumit.player.caption-background'
const CAPTION_POSITION_KEY = 'consumit.player.caption-position'
const CAPTION_FONT_KEY = 'consumit.player.caption-font'

const CAPTION_SIZES: readonly CaptionSize[] = ['small', 'medium', 'large', 'xlarge']
const CAPTION_BACKGROUNDS: readonly CaptionBackground[] = ['cinematic', 'boxed', 'subtle']
const CAPTION_POSITIONS: readonly CaptionPosition[] = ['bottom', 'top']
const CAPTION_FONTS: readonly CaptionFont[] = ['filscreen', 'sans']

function readStoredCaption<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw != null && (allowed as readonly string[]).includes(raw)) return raw as T
    return fallback
  } catch {
    return fallback
  }
}

function captionSizeClass(size: CaptionSize, fullscreen: boolean) {
  switch (size) {
    case 'small':
      return 'text-[15px] sm:text-base'
    case 'large':
      return fullscreen ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
    case 'xlarge':
      return fullscreen ? 'text-[28px] sm:text-4xl' : 'text-2xl sm:text-3xl'
    case 'medium':
    default:
      return fullscreen ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'
  }
}

function captionFontClass(font: CaptionFont) {
  // FilScreen vibe default: Charter film-poster serif with tight tracking.
  // Sans falls back to the compact DejaVu interface voice.
  return font === 'sans'
    ? 'font-interface font-bold tracking-[-0.01em]'
    : 'font-display font-normal tracking-[-0.02em]'
}

/** Cursive RTL scripts (Arabic) break letter joining under non-zero
 *  letter-spacing in Chromium, so cues carrying them render untracked.
 *  Hex ranges keep the source ASCII-only. */
function hasCursiveRtlScript(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if ((code >= 0x0590 && code <= 0x08ff) || (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)) return true
  }
  return false
}

function captionBackgroundClass(background: CaptionBackground) {
  switch (background) {
    case 'boxed':
      return 'rounded-lg bg-black/85 px-4 py-2 backdrop-blur-sm drop-shadow-md'
    case 'subtle':
      return 'rounded-md bg-black/60 px-3 py-1.5 backdrop-blur-[2px] [text-shadow:0_1px_8px_rgb(0_0_0/0.9)]'
    case 'cinematic':
    default:
      return 'bg-transparent px-4 py-1 [text-shadow:0_2px_10px_rgb(0_0_0/0.95),0_0_28px_rgb(0_0_0/0.7)]'
  }
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    const value = Number(raw)
    if (!Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, value))
  } catch {
    return fallback
  }
}

function readStoredString(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function storeValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private-mode storage must never break playback */
  }
}

const FAVORITE_SERVERS_KEY = 'consumit.favorite-servers'

function readFavoriteServers(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_SERVERS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

const REGION_NAMES: Record<string, string> = {
  US: 'United States', DE: 'Germany', FR: 'France', IN: 'India', GB: 'United Kingdom',
  JP: 'Japan', CA: 'Canada', AU: 'Australia', NL: 'Netherlands', SG: 'Singapore',
}

function regionFlag(code: string | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null
  return String.fromCodePoint(...[...code.toUpperCase()].map((char) => 127397 + char.charCodeAt(0)))
}

function regionName(code: string | undefined): string | null {
  if (!code) return null
  const upper = code.toUpperCase()
  return REGION_NAMES[upper] ?? upper
}

/**
 * Menus are keyed by `option.value`. Upstream subtitle sessions have produced
 * duplicate values (e.g. two `external:consumit-external-stellar-sub-0`
 * entries from a carried lease track plus its fresh twin), which React
 * reports as "Encountered two children with the same key". Dedupe by value
 * so a bad payload can never break menu identity; first occurrence wins to
 * keep selection stable.
 */
function dedupePlayerOptions(options: readonly PlayerOption[]): PlayerOption[] {
  const seen = new Set<string>()
  const unique: PlayerOption[] = []
  for (const option of options) {
    if (seen.has(option.value)) continue
    seen.add(option.value)
    unique.push(option)
  }
  return unique
}

/** Quiet choices share the player panel language and retain keyboard focus. */
function settingsRowClass(selected: boolean) {
  return cn(
    'consumit-player-option flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm outline-none transition-colors motion-reduce:transition-none',
    selected
      ? 'bg-orange/15 font-bold text-ink shadow-[inset_0_0_0_1px_var(--color-orange)] focus-visible:ring-2 focus-visible:ring-orange'
      : 'text-copy hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange',
  )
}

/** Language is canonical metadata; upstream labels may be mistranslated.
 * Keep original release information available without using it as a language. */
function SubtitleTrackLabel({ language, label, detail }: { language?: string | undefined; label: string; detail?: string | undefined }) {
  const description = detail || (language && language !== 'und' ? subtitleLabelDetail(label) : undefined)
  return <span className="min-w-0 flex-1 text-left" title={label}>
    <bdi className="block truncate text-sm font-medium tracking-normal" data-player-subtitle-label dir="auto" lang={language}>{nativeLanguageName(language, label)}</bdi>
    {description ? <bdi className="block truncate text-xs text-muted tracking-normal" dir="auto">{description}</bdi> : null}
  </span>
}

function subtitleCandidateDetail(track: PlayerSubtitleCandidate) {
  const release = track.release || subtitleLabelDetail(track.label)
  return [track.provider, release, track.hi || track.sdh ? 'HI' : undefined, track.forced ? 'Forced' : undefined, track.machineTranslated ? 'Machine translated' : undefined].filter(Boolean).join(' · ')
}

/** Set on the canary web deployment; Watch and embeds always use the same core. */
const useNextPlaybackCore = process.env.NEXT_PUBLIC_PLAYBACK_CORE === 'next'
const subscribeHydration = () => () => undefined
const clientHydrationSnapshot = () => true
const serverHydrationSnapshot = () => false

/**
 * FilScreen-flavored option chip for quality and speed: a real bordered chip
 * that reads selected through the signal-orange glow and ink contrast.
 */
function settingsChipClass(selected: boolean, wide = false) {
  return cn(
    'min-h-10 rounded-control text-sm tabular-nums outline-none transition-all motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:opacity-40',
    wide ? 'px-3.5' : 'min-w-11 px-2.5',
    selected
      ? 'border border-orange bg-orange/20 font-bold text-orange'
      : 'border border-white/15 bg-white/5 text-copy hover:border-white/30 hover:bg-white/10 hover:text-ink',
  )
}

function QualityIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? 'size-5'}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
    >
      <rect height="15" rx="3" width="19" x="2.5" y="4.5" />
      <path d="M6.5 8.5v7" />
      <path d="M10.5 8.5v7" />
      <path d="M6.5 12h4" />
      <path d="M14.5 8.5v7" />
      <path d="M14.5 8.5h1.75a3.5 3.5 0 0 1 0 7H14.5" />
    </svg>
  )
}

function PlayerIconButton({
  active,
  children,
  label,
  onClick,
  disabled,
  expanded,
  menuId,
  title,
}: {
  active?: boolean | undefined
  children: ReactNode
  disabled?: boolean | undefined
  expanded?: boolean | undefined
  label: string
  menuId?: PlayerMenuId | undefined
  onClick?: (() => void) | undefined
  title?: string | undefined
}) {
  return (
    <button
      aria-controls={menuId ? `consumit-player-menu-${menuId}` : undefined}
      aria-expanded={menuId ? Boolean(expanded) : undefined}
      aria-label={label}
      aria-pressed={menuId ? undefined : active}
      data-player-icon-button
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-control border outline-none transition-all motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-orange',
        active
          ? 'border-orange bg-orange/15 text-orange'
          : 'border-white/10 bg-white/5 text-ink hover:border-white/25 hover:bg-white/10',
        'disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:text-muted',
      )}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {children}
    </button>
  )
}

export function ConsumitPlayer({
  autoPlay,
  audioOptions: suppliedAudioOptions,
  autoHideMs = 3000,
  autoSkip: controlledAutoSkip,
  onAutoSkipChange,
  backHref,
  brightness: controlledBrightness,
  caption,
  castAvailable = false,
  castConnected = false,
  onCastClick,
  chapters,
  children,
  className,
  extraSubtitles,
  muted,
  onAudioChange,
  separateAudioTracks,
  separateAudioLoading,
  separateAudioError,
  onAudioRequest,
  onSeparateAudioSelect,
  onBack,
  onPreviousEpisode,
  onNextEpisode,
  onBrightnessChange,
  onCaptionBackgroundChange,
  onCaptionFontChange,
  onCaptionPositionChange,
  onCaptionSizeChange,
  onSubtitleDelayMsChange,
  subtitleDelayMs: controlledSubtitleDelayMs,
  subtitleLanguages: controlledSubtitleLanguages,
  captionBackground: controlledCaptionBackground,
  captionFont: controlledCaptionFont,
  captionPosition: controlledCaptionPosition,
  captionSize: controlledCaptionSize,
  onDurationChange,
  onPause,
  onPlay,
  onQualityChange,
  onRateChange,
  onRetry,
  onSourceError,
  onPlaybackEvent,
  onMediaPreferencesChange,
  resumeAt = 0,
  resumePlaying = false,
  serverOptions,
  selectedServer,
  onServerChange,
  serverAuto,
  onServerAuto,
  serverLoading,
  serverError,
  serverBusy,
  onServerRequest,
  onSubtitleChange,
  onSubtitleRequest,
  subtitleDiscovery,
  onSubtitlePage,
  onSubtitleSearch,
  onSubtitleCandidateSelect,
  onTimeUpdate,
  onVolumeChange,
  pauseFacts,
  pauseLogoUrl,
  pauseOverview,
  playbackRates = DEFAULT_RATES,
  posterSrc,
  preparing = false,
  preparationMeta,
  preload = 'metadata',
  qualityOptions: suppliedQualityOptions,
  selectedAudio: controlledAudio,
  selectedQuality: controlledQuality,
  selectedRate: controlledRate,
  selectedSubtitle: controlledSubtitle,
  source,
  src,
  status,
  statusTone = 'neutral',
  subtitleOptions: suppliedSubtitleOptions,
  title,
  topMeta,
  videoClassName,
  ...props
}: ConsumitPlayerProps) {
  const [showRemainingTime, setShowRemainingTime] = useState(false)
  const [failedPreparationLogo, setFailedPreparationLogo] = useState<string | undefined>()
  const preparationLogo = pauseLogoUrl && pauseLogoUrl !== failedPreparationLogo ? pauseLogoUrl : undefined
  const [engineState, setEngineState] = useState<ControllerSnapshot | null>(null)
  const audioOptions: readonly PlayerOption[] = useMemo(
    () => dedupePlayerOptions(suppliedAudioOptions ?? (source ? engineState?.audio ?? [] : DEFAULT_AUDIO)),
    [suppliedAudioOptions, source, engineState?.audio],
  )
  const qualityOptions: readonly PlayerOption[] = useMemo(
    () => dedupePlayerOptions(suppliedQualityOptions ?? (source ? engineState?.qualities ?? [{ value: 'auto', label: 'Auto' }] : DEFAULT_QUALITIES)),
    [suppliedQualityOptions, source, engineState?.qualities],
  )
  const subtitleOptions: readonly PlayerOption[] = useMemo(
    () => dedupePlayerOptions(suppliedSubtitleOptions ?? (source ? [...(engineState?.subtitles ?? []), { value: 'off', label: 'Off' }] : DEFAULT_SUBTITLES)),
    [suppliedSubtitleOptions, source, engineState?.subtitles],
  )
  const [preparedCandidateUrls, setPreparedCandidateUrls] = useState<readonly string[]>([])
  const [preparedCandidateIds, setPreparedCandidateIds] = useState<readonly string[]>([])
  const preparedPlayableCount = new Set((extraSubtitles ?? []).filter((track) => preparedCandidateUrls.includes(track.url)).map((track) => track.url)).size
  /* PROVE-embed style track count (Off excluded) for the subtitles menu
   *  header. The toolbar icon carries no badge. */
  const subtitleTrackCount = subtitleDiscovery
    ? subtitleDiscovery.languages.reduce((total, language) => total + language.count, 0) + subtitleOptions.filter((option) => option.value !== 'off').length - preparedPlayableCount
    : subtitleOptions.filter((option) => option.value !== 'off').length
  const dedupedServerOptions = useMemo(
    () => (serverOptions ? dedupePlayerOptions(serverOptions) : undefined),
    [serverOptions],
  )
  // Favorite servers persist on the device and sort first. Storage reads stay
  // in the mount effect so SSR and first paint never disagree (hydration).
  const [favoriteServers, setFavoriteServers] = useState<readonly string[]>([])
  useEffect(() => { setFavoriteServers(readFavoriteServers()) }, [])
  const toggleFavoriteServer = useCallback((value: string) => {
    setFavoriteServers((current) => {
      const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
      storeValue(FAVORITE_SERVERS_KEY, JSON.stringify(next))
      return next
    })
  }, [])
  const orderedServerOptions = useMemo(() => {
    if (!dedupedServerOptions) return undefined
    const favorites = new Set(favoriteServers)
    return [...dedupedServerOptions].sort((a, b) => Number(favorites.has(b.value)) - Number(favorites.has(a.value)))
  }, [dedupedServerOptions, favoriteServers])
  // Mirror families: options carrying a family group under it (each mirror
  // keeps its own quality detail); legacy flat options render ungrouped
  // exactly as before.
  const displayMirrorName = (option: PlayerOption) => {
    if (!option.family || !option.mirror || option.mirror === 'auto') return option.family ? 'Auto' : option.label
    return option.mirror.charAt(0).toUpperCase() + option.mirror.slice(1)
  }
  const displayFamilyName = (family: string) => family.charAt(0).toUpperCase() + family.slice(1)
  const serverGroups = useMemo(() => {
    if (!orderedServerOptions) return undefined
    if (!orderedServerOptions.some((option) => option.family)) {
      return [{ family: '', options: orderedServerOptions }]
    }
    const groups: { family: string; options: PlayerOption[] }[] = []
    for (const option of orderedServerOptions) {
      const family = option.family ?? option.value
      let group = groups.find((entry) => entry.family === family)
      if (!group) { group = { family, options: [] }; groups.push(group) }
      group.options.push(option)
    }
    return groups
  }, [orderedServerOptions])
  const dedupedRates = useMemo(() => {
    const rates = [...new Set(playbackRates)].filter((rate) => Number.isFinite(rate) && rate > 0).sort((a, b) => a - b)
    return rates.length ? rates : DEFAULT_RATES
  }, [playbackRates])
  const showServerSection = !onServerAuto && (dedupedServerOptions?.length ?? 0) > 1
  const currentServerLabel = dedupedServerOptions?.find((option) => option.value === selectedServer)?.label ?? selectedServer
  const shellRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const separateAudioRef = useRef<HTMLAudioElement>(null)
  const separateAudioPlayer = useRef<ReturnType<typeof createSeparateAudioPlayer> | null>(null)
  const separateSelection = useRef(0)
  const [separateState, setSeparateState] = useState<SeparateAudioState>({ track: null, loading: false, active: false, error: null, offset: 0 })
  const [preparingAudioId, setPreparingAudioId] = useState<string | null>(null)
  const [audioPreparationError, setAudioPreparationError] = useState<string | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  const controllerRef = useRef<ReturnType<typeof createPlaybackController> | null>(null)
  const controllerPhaseRef = useRef<ControllerSnapshot['phase']>('loading')
  const attachedMediaRef = useRef<{ controller: ReturnType<typeof createPlaybackController>; src: string; type: DirectMediaSource['type'] } | null>(null)
  const playbackCallbacks = useRef({ onSourceError, onPlaybackEvent, onMediaPreferencesChange, resumeAt, resumePlaying })
  useEffect(() => { playbackCallbacks.current = { onSourceError, onPlaybackEvent, onMediaPreferencesChange, resumeAt, resumePlaying } }, [onSourceError, onPlaybackEvent, onMediaPreferencesChange, resumeAt, resumePlaying])
  const menuRef = useRef<HTMLDivElement>(null)
  const menuReturnFocus = useRef<HTMLButtonElement | null>(null)
  const volumeBoostController = useRef<ReturnType<typeof createVolumeBoost> | null>(null)
  const separateAudioBoost = useRef<ReturnType<typeof createVolumeBoost> | null>(null)
  // Hydration reads the server snapshot; normal client-only mounts can use
  // their source immediately. This keeps disabled attributes deterministic.
  const mounted = useSyncExternalStore(subscribeHydration, clientHydrationSnapshot, serverHydrationSnapshot)

  const mediaSrc = source?.src ?? (typeof src === 'string' ? src : undefined)
  const hasSource = mounted && Boolean(mediaSrc || children)
  const showTopBar = backHref != null || onBack != null || topMeta != null

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [isMuted, setIsMuted] = useState(() => (typeof muted === 'boolean' ? muted : false))
  const [volume, setVolume] = useState(0.9)
  const [isPlaying, setIsPlaying] = useState(Boolean(autoPlay))
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [presentedMedia, setPresentedMedia] = useState<string | undefined>(undefined)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const startupPending = preparing || (hasSource && (autoPlay || resumePlaying || isPlaying) && isBuffering && presentedMedia !== mediaSrc && !hasError && !engineState?.needsGesture)
  const [activeMenu, setActiveMenu] = useState<PlayerMenuId | null>(null)
  const [volumeBoost, setVolumeBoost] = useState(1)
  const [boostError, setBoostError] = useState<string | null>(null)
  const separateAudioEnabled = Boolean(onSeparateAudioSelect)
  useEffect(() => {
    const video = videoRef.current, audio = separateAudioRef.current
    if (!video || !audio || !separateAudioEnabled) return
    const player = createSeparateAudioPlayer(video, audio, {
      output: (value) => (volumeBoostController.current ??= createVolumeBoost(video)).output(value),
      state: setSeparateState,
      boost: separateAudioBoost.current ??= createVolumeBoost(audio),
    })
    separateAudioPlayer.current = player
    return () => { separateSelection.current++; player.dispose(); separateAudioPlayer.current = null; queueMicrotask(() => { if (!audio.isConnected) separateAudioBoost.current?.dispose() }) }
  }, [separateAudioEnabled])
  useEffect(() => { separateSelection.current++; separateAudioPlayer.current?.reset(); setPreparingAudioId(null); setAudioPreparationError(null) }, [mediaSrc])
  useEffect(() => { if (activeMenu === 'audio') onAudioRequest?.() }, [activeMenu, onAudioRequest])
  useEffect(() => {
    const video = videoRef.current
    return () => {
      // Strict Mode and Activity can clean up effects while retaining the same
      // media element. A detached element is the audio graph's lifetime boundary.
      queueMicrotask(() => { if (!video?.isConnected) volumeBoostController.current?.dispose() })
    }
  }, [])
  const closeMenu = useCallback(() => {
    setActiveMenu(null)
    menuReturnFocus.current?.focus({ preventScroll: true })
  }, [])
  const [subtitleSearch, setSubtitleSearch] = useState('')
  const [subtitleSearchResults, setSubtitleSearchResults] = useState<PlayerSubtitleCandidate[]>([])
  const [nextSearchCursor, setNextSearchCursor] = useState<number | null>(null)
  const [searchingSubtitles, setSearchingSubtitles] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchGenerationRef = useRef(0)
  useEffect(() => () => clearTimeout(searchTimerRef.current), [])
  const [openSubtitleLanguage, setOpenSubtitleLanguage] = useState<string | null>(null)
  const [discoveredTracks, setDiscoveredTracks] = useState<Record<string, PlayerSubtitleCandidate[]>>({})
  const [nextSubtitleCursor, setNextSubtitleCursor] = useState<Record<string, number | null>>({})
  const [subtitleMenuError, setSubtitleMenuError] = useState<string | null>(null)
  const [preparingSubtitle, setPreparingSubtitle] = useState<string | null>(null)
  const [uploadedSubtitle, setUploadedSubtitle] = useState<{ id: string; label: string; language: string; url: string } | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadedUrlRef = useRef<string | null>(null)
  useEffect(() => () => { if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current) }, [])
  const [controlsVisible, setControlsVisible] = useState(true)
  /* Visual sync panel (old-player HUD): click the cue line the moment it is
   * spoken to solve the offset, plus ±50ms fine tuning. */
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncHovering, setSyncHovering] = useState(false)
  const syncListRef = useRef<HTMLDivElement>(null)
  const syncStatusTimer = useRef<number | undefined>(undefined)
  useEffect(
    () => () => {
      if (syncStatusTimer.current != null) window.clearTimeout(syncStatusTimer.current)
    },
    [],
  )
  /* Old-master-inspired transient feedback: brief ±10s flash on seek. */
  const [lastSkip, setLastSkip] = useState<{ amount: number; at: number; direction: 'forward' | 'backward' } | null>(null)
  const lastSkipTimer = useRef<number | undefined>(undefined)
  /* Old-master-inspired scrub hover preview (desktop pointer only). Pointer
   *  moves fire far faster than frames paint; coalesce them to one render
   *  per animation frame so scrubbing cannot saturate the main thread and
   *  hitch playback indicators (e.g. the buffering spinner freezing while
   *  the pointer moves). */
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const hoverRaf = useRef<number | undefined>(undefined)

  const [internalAudio, setInternalAudio] = useState(() => audioOptions[0]?.value ?? 'english')
  const [internalSubtitle, setInternalSubtitle] = useState('english')
  const [activeCue, setActiveCue] = useState<string>('')
  const [internalQuality, setInternalQuality] = useState(() => qualityOptions[0]?.value ?? 'auto')
  const [internalRate, setInternalRate] = useState(1)
  const [internalBrightness, setInternalBrightness] = useState(1)
  const [internalCaptionSize, setInternalCaptionSize] = useState<CaptionSize>('medium')
  const [internalCaptionBackground, setInternalCaptionBackground] = useState<CaptionBackground>('cinematic')
  const [internalCaptionPosition, setInternalCaptionPosition] = useState<CaptionPosition>('bottom')
  const [internalCaptionFont, setInternalCaptionFont] = useState<CaptionFont>('filscreen')
  const [internalSubtitleDelayMs, setInternalSubtitleDelayMs] = useState(0)
  const [internalSubtitleLanguages, setInternalSubtitleLanguages] = useState<string[]>([])
  const [internalAutoSkip, setInternalAutoSkip] = useState(true)
  const autoSkip = controlledAutoSkip ?? internalAutoSkip
  /* Parsed cues for the sync path (delay ≠ 0) and the visual sync panel.
   * Bounded in-memory cache; each entry is one fetched subtitle file. */
  const [subtitleCues, setSubtitleCues] = useState<readonly SubtitleCue[]>([])
  const subtitleCueCache = useRef(new Map<string, readonly SubtitleCue[]>())

  // Stored player preferences apply after mount, never during render:
  // reading localStorage in the first render makes the client HTML differ
  // from SSR for anyone with non-default stored values (hydration mismatch
  // on the subtitles toggle, volume slider, rate, and brightness).
  useEffect(() => {
    if (typeof muted !== 'boolean') {
      try {
        if (window.localStorage.getItem('consumit.player.muted') === '1') setIsMuted(true)
      } catch {
        /* Storage is optional. */
      }
    }
    setVolume(readStoredNumber('consumit.player.volume', 0.9, 0, 1))
    setInternalSubtitle(readStoredString('consumit.player.subtitles', 'english'))
    setInternalRate(readStoredNumber('consumit.player.rate', 1, 0.25, 4))
    setInternalBrightness(readStoredNumber('consumit.player.brightness', 1, 0.6, 1.3))
    setInternalCaptionSize(readStoredCaption(CAPTION_SIZE_KEY, 'medium', CAPTION_SIZES))
    setInternalCaptionBackground(readStoredCaption(CAPTION_BACKGROUND_KEY, 'cinematic', CAPTION_BACKGROUNDS))
    setInternalCaptionPosition(readStoredCaption(CAPTION_POSITION_KEY, 'bottom', CAPTION_POSITIONS))
    setInternalCaptionFont(readStoredCaption(CAPTION_FONT_KEY, 'filscreen', CAPTION_FONTS))
    setInternalSubtitleDelayMs(readStoredSubtitleDelayMs())
    setInternalSubtitleLanguages(readStoredSubtitleLanguages())
    if (controlledAutoSkip == null) {
      try {
        if (window.localStorage.getItem('consumit.player.auto-skip') === '0') setInternalAutoSkip(false)
      } catch {
        /* Storage is optional. */
      }
    }
  }, [muted, controlledAutoSkip])

  const selectedAudio = controlledAudio ?? (source ? engineState?.audioTrack : undefined) ?? internalAudio
  const unifiedAudio = useMemo(() => audioMenuOptions(audioOptions, separateState.track && !separateAudioTracks?.some(track => track.id === separateState.track?.id) ? [...(separateAudioTracks ?? []), separateState.track] : separateAudioTracks ?? []), [audioOptions, separateAudioTracks, separateState.track])
  const selectedAudioLabel = unifiedAudio.find(option => separateState.track ? option.separate.some(track => track.id === separateState.track?.id) : option.stream.some(track => track.value === selectedAudio))?.label ?? 'Default'
  const selectedSubtitle = controlledSubtitle ?? (source ? engineState?.subtitleTrack : undefined) ?? internalSubtitle
  const selectedQuality = controlledQuality ?? (source ? engineState?.quality : undefined) ?? internalQuality
  const selectedRate = controlledRate ?? internalRate
  const brightness = controlledBrightness ?? internalBrightness
  const captionSize = controlledCaptionSize ?? internalCaptionSize
  const captionBackground = controlledCaptionBackground ?? internalCaptionBackground
  const captionPosition = controlledCaptionPosition ?? internalCaptionPosition
  const captionFont = controlledCaptionFont ?? internalCaptionFont
  const subtitleDelayMs = controlledSubtitleDelayMs ?? internalSubtitleDelayMs
  const subtitleLanguages = controlledSubtitleLanguages ?? internalSubtitleLanguages
  const subtitleLanguageRows = useMemo(() => {
    const counts = new Map<string, number>()
    for (const language of subtitleDiscovery?.languages ?? []) counts.set(language.code, language.count)
    for (const option of subtitleOptions) {
      if (option.value === 'off') continue
      const code = option.language ?? 'und'
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    for (const track of extraSubtitles ?? []) {
      if (preparedCandidateUrls.includes(track.url)) counts.set(track.language, Math.max(0, (counts.get(track.language) ?? 0) - 1))
    }
    return [...counts].map(([code, count]) => ({ code, count }))
      .sort((a, b) => {
        const aRank = subtitleLanguages.indexOf(a.code)
        const bRank = subtitleLanguages.indexOf(b.code)
        return (aRank === -1 ? 100 : aRank) - (bRank === -1 ? 100 : bRank) || nativeLanguageName(a.code, a.code).localeCompare(nativeLanguageName(b.code, b.code))
      })
  }, [subtitleDiscovery?.languages, subtitleOptions, subtitleLanguages, extraSubtitles, preparedCandidateUrls])
  const captionsOn = selectedSubtitle !== 'off'
  /* Overlay cue text and its script: Arabic cues render untracked so letter
   *  joining survives Chromium's letter-spacing handling. */
  // External files use the styled overlay; HLS/DASH/native tracks keep the
  // browser renderer. Showing both paths produced duplicate visible captions.
  const overlayCueText = caption ?? (selectedSubtitle.startsWith('external:') ? activeCue || undefined : undefined)
  const overlayCueUntracked = overlayCueText != null && hasCursiveRtlScript(overlayCueText)

  /* The old player reset the sync offset on episode change. Titles carry
   * the episode identity here, so a new title restarts the offset. */
  const titleRef = useRef(title)
  useEffect(() => {
    if (titleRef.current !== title) {
      titleRef.current = title
      if (controlledSubtitleDelayMs == null) setInternalSubtitleDelayMs(0)
      storeValue(SUBTITLE_DELAY_KEY, '0')
      onSubtitleDelayMsChange?.(0)
    }
  }, [title, controlledSubtitleDelayMs, onSubtitleDelayMsChange])

  /* Skip-intro ranges ride the resolved source. The button offers a manual
   * jump; auto-skip jumps on entry while playing and re-arms on exit, so a
   * deliberate rewind back into the range is respected, not fought. */
  const skipSegments = source?.skipSegments ?? []
  const activeSkip = skipSegments.find((segment) => currentTime >= segment.start && currentTime < segment.end - 0.25 && segment.end > segment.start)
  const skipArmed = useRef<string | null>(null)
  const jumpSkip = useCallback(() => {
    const video = videoRef.current
    if (!video || !activeSkip) return
    const end = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(activeSkip.end, video.duration) : activeSkip.end
    try {
      video.currentTime = end
    } catch {
      /* Seeking is best-effort. */
    }
  }, [activeSkip])
  function toggleAutoSkip() {
    if (controlledAutoSkip != null) {
      onAutoSkipChange?.(!autoSkip)
      return
    }
    setInternalAutoSkip((current) => {
      const next = !current
      storeValue('consumit.player.auto-skip', next ? '1' : '0')
      return next
    })
  }
  useEffect(() => {
    const video = videoRef.current
    if (!activeSkip) {
      skipArmed.current = null
      return
    }
    if (!video || !autoSkip || video.paused || !hasSource || hasError) return
    const key = `${source?.src ?? ''}:${activeSkip.kind}:${activeSkip.start}`
    if (skipArmed.current === key) return
    skipArmed.current = key
    jumpSkip()
  }, [autoSkip, activeSkip, hasSource, hasError, isPlaying, source, jumpSkip])

  const [sleepTimer, setSleepTimer] = useState<number | null>(null)
  const sleepTimerTimeout = useRef<number | undefined>(undefined)

  const cycleSleepTimer = useCallback(() => {
    const sequence: (number | null)[] = [null, 15, 30, 45, 60]
    setSleepTimer((prev) => {
      const next = sequence[(sequence.indexOf(prev) + 1) % sequence.length] ?? null
      if (sleepTimerTimeout.current != null) window.clearTimeout(sleepTimerTimeout.current)
      if (next != null) {
        sleepTimerTimeout.current = window.setTimeout(() => {
          videoRef.current?.pause()
          setIsPlaying(false)
          setSleepTimer(null)
        }, next * 60 * 1000)
      }
      return next
    })
  }, [])

  useEffect(() => {
    return () => {
      if (sleepTimerTimeout.current != null) window.clearTimeout(sleepTimerTimeout.current)
    }
  }, [])

  const sortedChapters = useMemo(
    () => (chapters ? [...chapters].sort((a, b) => a.startTime - b.startTime) : []),
    [chapters],
  )
  const chapterIndex = useMemo(() => {
    let index = -1
    for (const [i, chapter] of sortedChapters.entries()) {
      if (chapter.startTime <= currentTime + 0.25) index = i
      else break
    }
    return index
  }, [sortedChapters, currentTime])
  const currentChapter = chapterIndex >= 0 ? sortedChapters[chapterIndex] : undefined

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0
  const bufferedRatio = duration > 0 ? Math.min(1, Math.max(0, bufferedEnd / duration)) : 0

  /* PiP capability is browser-only. Reading it during render made the PiP
   * button's disabled attribute differ from SSR (server: unsupported →
   * disabled; client: supported → enabled) and split hydration. Detect after
   * mount so the first client paint matches the server HTML. */
  const [pipSupported, setPipSupported] = useState(false)
  useEffect(() => {
    setPipSupported(
      typeof document !== 'undefined'
      && (document.pictureInPictureEnabled === true || 'webkitSetPresentationMode' in HTMLVideoElement.prototype),
    )
  }, [])

  const hasKeyboardFocus = useCallback(() => {
    const focused = document.activeElement
    return focused instanceof HTMLElement && shellRef.current?.contains(focused) && focused.matches(':focus-visible')
  }, [])

  const scheduleHide = useCallback(() => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    hideTimer.current = undefined
    // Playback start and pointer movement can run after focus capture. Never
    // re-arm a timer that hides the control a keyboard user is operating.
    if (hasKeyboardFocus()) return
    if (isPlaying && activeMenu == null) {
      hideTimer.current = window.setTimeout(() => {
        hideTimer.current = undefined
        if (!hasKeyboardFocus()) setControlsVisible(false)
      }, autoHideMs)
    }
  }, [autoHideMs, isPlaying, activeMenu, hasKeyboardFocus])

  const pokeControls = useCallback(() => {
    setControlsVisible(true)
    scheduleHide()
  }, [scheduleHide])

  useEffect(() => {
    if (isPlaying && activeMenu == null) {
      scheduleHide()
    } else {
      setControlsVisible(true)
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
    }
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    }
  }, [isPlaying, activeMenu, scheduleHide])

  /* Visual controls subscribe to a headless controller; fixtures may still use src. */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const controller = (useNextPlaybackCore ? createPlaybackControllerNext : createPlaybackController)(video, {
      change(snapshot) {
        controllerPhaseRef.current = snapshot.phase
        setEngineState(snapshot)
        if (snapshot.preferences) playbackCallbacks.current.onMediaPreferencesChange?.(snapshot.preferences)
        setIsBuffering(snapshot.phase === 'loading' || snapshot.phase === 'buffering' || snapshot.phase === 'switching')
        setHasError(snapshot.phase === 'failed')
        if (snapshot.needsGesture) { setIsPlaying(false); setControlsVisible(true) }
      },
      fatal(reason, deliveryFailure) {
        setErrorMessage(reason === 'gone' ? 'This source is no longer available.' : reason === 'expired' ? 'Refreshing this source.' : 'This source could not keep playing.')
        playbackCallbacks.current.onSourceError?.(reason, deliveryFailure)
      },
      event(event) { playbackCallbacks.current.onPlaybackEvent?.(event) },
    })
    controllerRef.current = controller
    return () => { controller.destroy(); controllerRef.current = null }
  }, [])

  useEffect(() => {
    const controller = controllerRef.current
    if (!source || !controller) return
    const attached = attachedMediaRef.current
    // Lease renewals and caption updates can return a new source object for
    // the same playable media. Keep its engine and buffered frames intact;
    // a failed engine still needs a real reload when the caller retries.
    if (attached?.controller === controller && attached.src === source.src && attached.type === source.type && controllerPhaseRef.current !== 'failed') return
    attachedMediaRef.current = { controller, src: source.src, type: source.type }
    void controller.load(source, playbackCallbacks.current.resumeAt, playbackCallbacks.current.resumePlaying)
  }, [source])

  /* One merged track list — the active source's tracks plus every
   *  aggregated extra track — owned by a single call, so server switches
   *  reconcile the shared subtitle menu instead of dropping it. */
  const allExternalSubtitles = useMemo(() => {
    const fromSource = (source?.subtitles ?? []).map((track) => ({
      id: track.id,
      label: track.label,
      language: track.language,
      url: track.url,
    }))
    return [...fromSource, ...(extraSubtitles ?? []), ...(uploadedSubtitle ? [uploadedSubtitle] : [])]
  }, [source, extraSubtitles, uploadedSubtitle])

  /* A discovered row can duplicate a track the menu already offers: candidates
   * prepared this session (matched by id) and candidates whose prepared file is
   * already among the active tracks (matched by URL). Both render as a single
   * checked option row instead of appearing again in the search results. */
  const isRepresentedCandidate = (candidate: PlayerSubtitleCandidate) =>
    preparedCandidateIds.includes(candidate.id) ||
    (candidate.preparedUrl != null && allExternalSubtitles.some((track) => track.url === candidate.preparedUrl))

  useEffect(() => {
    controllerRef.current?.externalSubtitles(allExternalSubtitles)
  }, [allExternalSubtitles])

  useEffect(() => {
    if (typeof muted === 'boolean') setIsMuted(muted)
  }, [muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    try {
      video.volume = volume
    } catch {
      /* volume is a preference, never a crash */
    }
  }, [volume])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    try {
      video.playbackRate = selectedRate
      controllerRef.current?.setPlaybackRate(selectedRate)
    } catch {
      /* rate is a preference, never a crash */
    }
  }, [selectedRate])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    try {
      video.style.filter = brightness === 1 ? '' : `brightness(${brightness})`
    } catch {
      /* display filter must never break playback */
    }
  }, [brightness])

  useEffect(() => {
    const video = videoRef.current
    if (!video || source) return
    try {
      for (const track of Array.from(video.textTracks)) {
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          track.mode = captionsOn && (track.id === selectedSubtitle || track.language === selectedSubtitle || (selectedSubtitle === 'english' && track.language === 'en')) ? 'showing' : 'disabled'
        }
      }
    } catch {
      /* subtitle tracks are enhancement-only */
    }
  }, [captionsOn, children, selectedSubtitle, source])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateCues = () => {
      if (!captionsOn) {
        setActiveCue('')
        return
      }
      // Sync path (old-player semantics): match parsed cues against the
      // delay-shifted clock. Falls through to native cues while the file
      // loads or when it cannot be fetched.
      if (subtitleDelayMs !== 0 && subtitleCues.length > 0) {
        try {
          setActiveCue(cueTextAt(subtitleCues, video.currentTime || 0, subtitleDelayMs))
        } catch {
          /* cue matching is best-effort */
        }
        return
      }
      let foundText = ''
      try {
        for (const track of Array.from(video.textTracks)) {
          if (track.mode === 'showing' || track.mode === 'hidden') {
            const cues = track.activeCues
            if (cues && cues.length > 0) {
              const texts: string[] = []
              for (let i = 0; i < cues.length; i++) {
                const cue = cues[i] as VTTCue | undefined
                if (cue?.text) {
                  const cleaned = cue.text.replace(/<[^>]+>/g, '').trim()
                  if (cleaned) texts.push(cleaned)
                }
              }
              if (texts.length > 0) {
                foundText = texts.join('\n')
                break
              }
            }
          }
        }
      } catch {
        /* cue inspection is best-effort */
      }
      setActiveCue(foundText)
    }

    const textTracks = video.textTracks
    const listeners: { track: TextTrack; listener: () => void }[] = []

    const attachTrackListeners = () => {
      try {
        for (const track of Array.from(video.textTracks)) {
          track.removeEventListener('cuechange', updateCues)
          track.addEventListener('cuechange', updateCues)
          listeners.push({ track, listener: updateCues })
        }
      } catch {
        /* best effort */
      }
      updateCues()
    }

    attachTrackListeners()
    textTracks?.addEventListener?.('addtrack', attachTrackListeners)
    textTracks?.addEventListener?.('change', updateCues)
    video.addEventListener('timeupdate', updateCues)
    video.addEventListener('seeking', updateCues)
    video.addEventListener('seeked', updateCues)

    // Frame-accurate sampling: timeupdate fires ~4×/s, so cue transitions
    // quantize up to ~250ms late and read as subtitles lagging the picture.
    // Sample every frame while playing; the event listeners above still cover
    // pause, seek, and background tabs where rAF is throttled to a stop.
    let frame = 0
    const sampleFrame = () => {
      updateCues()
      frame = requestAnimationFrame(sampleFrame)
    }
    const startSampling = () => { if (frame === 0) frame = requestAnimationFrame(sampleFrame) }
    const stopSampling = () => { if (frame !== 0) cancelAnimationFrame(frame); frame = 0 }
    video.addEventListener('playing', startSampling)
    video.addEventListener('pause', stopSampling)
    video.addEventListener('ended', stopSampling)
    if (!video.paused) startSampling()

    return () => {
      stopSampling()
      video.removeEventListener('playing', startSampling)
      video.removeEventListener('pause', stopSampling)
      video.removeEventListener('ended', stopSampling)
      textTracks?.removeEventListener?.('addtrack', attachTrackListeners)
      textTracks?.removeEventListener?.('change', updateCues)
      video.removeEventListener('timeupdate', updateCues)
      video.removeEventListener('seeking', updateCues)
      video.removeEventListener('seeked', updateCues)
      for (const { track, listener } of listeners) {
        track.removeEventListener('cuechange', listener)
      }
    }
  }, [captionsOn, selectedSubtitle, subtitleDelayMs, subtitleCues])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncClock = () => {
      setCurrentTime(video.currentTime || 0)
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    }
    const syncBuffered = () => {
      try {
        const buffered = video.buffered
        if (buffered.length > 0) setBufferedEnd(buffered.end(buffered.length - 1))
      } catch {
        /* buffered introspection is best-effort */
      }
    }

    syncClock()
    syncBuffered()
    const onEnterPip = () => setIsPip(true)
    const onLeavePip = () => setIsPip(false)
    video.addEventListener('loadedmetadata', syncClock)
    video.addEventListener('durationchange', syncClock)
    video.addEventListener('timeupdate', syncClock)
    video.addEventListener('progress', syncBuffered)
    video.addEventListener('playing', syncBuffered)
    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    return () => {
      video.removeEventListener('loadedmetadata', syncClock)
      video.removeEventListener('durationchange', syncClock)
      video.removeEventListener('timeupdate', syncClock)
      video.removeEventListener('progress', syncBuffered)
      video.removeEventListener('playing', syncBuffered)
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [mediaSrc])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    const video = videoRef.current
    const entered = () => setIsFullscreen(true)
    const exited = () => setIsFullscreen(false)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    video?.addEventListener('webkitbeginfullscreen', entered)
    video?.addEventListener('webkitendfullscreen', exited)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      video?.removeEventListener('webkitbeginfullscreen', entered)
      video?.removeEventListener('webkitendfullscreen', exited)
    }
  }, [])

  useEffect(() => {
    if (!isPlaying || activeMenu != null || !hasSource || hasError) {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
      setControlsVisible(true)
      return
    }
    scheduleHide()
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    }
  }, [isPlaying, activeMenu, hasSource, hasError, scheduleHide])

  useEffect(() => {
    if (activeMenu == null) return
    const onPointerDown = (event: PointerEvent) => {
      const menu = menuRef.current
      const shell = shellRef.current
      if (!menu || !shell) return
      const target = event.target as Node | null
      if (target && !menu.contains(target)) {
        const trigger = shell.querySelector(`[aria-controls="consumit-player-menu-${activeMenu}"]`)
        if (trigger && target && trigger.contains(target)) return
        closeMenu()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [activeMenu, closeMenu])

  useEffect(
    () => () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
      if (lastSkipTimer.current != null) window.clearTimeout(lastSkipTimer.current)
    },
    [],
  )

  async function togglePlayback() {
    const video = videoRef.current
    if (!video || !hasSource || hasError) return
    pokeControls()
    if (video.paused || video.ended) {
      try {
        if (source) await controllerRef.current?.play()
        else await video.play()
      } catch {
        setIsPlaying(false)
      }
    } else {
      video.pause()
    }
  }

  function seekBy(deltaSeconds: number) {
    const video = videoRef.current
    if (!video || !hasSource || hasError) return
    pokeControls()
    try {
      const next = Math.min(Math.max(0, video.currentTime + deltaSeconds), Number.isFinite(video.duration) ? video.duration : video.currentTime + deltaSeconds)
      video.currentTime = next
      setCurrentTime(next)
      /* Transient flash mirrors the old-master ±seconds cue; never blocks playback. */
      if (lastSkipTimer.current != null) window.clearTimeout(lastSkipTimer.current)
      setLastSkip({ amount: Math.abs(deltaSeconds), at: Date.now(), direction: deltaSeconds >= 0 ? 'forward' : 'backward' })
      lastSkipTimer.current = window.setTimeout(() => setLastSkip(null), 800)
    } catch {
      /* seeking past live edges must never crash */
    }
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video || !hasSource) return
    pokeControls()
    video.muted = !video.muted
    setIsMuted(video.muted)
    storeValue('consumit.player.muted', video.muted ? '1' : '0')
  }

  function changeVolume(next: number) {
    const video = videoRef.current
    if (!video || !hasSource) return
    const clamped = Math.min(1, Math.max(0, next))
    setVolume(clamped)
    storeValue('consumit.player.volume', String(clamped))
    try {
      video.volume = clamped
      if (clamped > 0 && video.muted) {
        video.muted = false
        setIsMuted(false)
      }
    } catch {
      /* volume stays a preference */
    }
  }

  async function toggleFullscreen() {
    const shell = shellRef.current
    const video = videoRef.current
    if (!shell) return
    pokeControls()
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      if (shell.requestFullscreen) {
        try { await shell.requestFullscreen(); return } catch { /* Try native video fullscreen on Apple devices. */ }
      }
      const webkitVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void } | null
      webkitVideo?.webkitEnterFullscreen?.()
    } catch {
      /* fullscreen denial keeps inline playback */
    }
  }

  async function togglePip() {
    const video = videoRef.current
    if (!video || !hasSource) return
    pokeControls()
    try {
      const pipVideo = video as HTMLVideoElement & {
        disablePictureInPicture?: boolean
        requestPictureInPicture?: () => Promise<void>
        webkitPresentationMode?: string
        webkitSetPresentationMode?: (mode: string) => void
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (pipVideo.requestPictureInPicture && !pipVideo.disablePictureInPicture) {
        await pipVideo.requestPictureInPicture()
      } else if (pipVideo.webkitSetPresentationMode) {
        pipVideo.webkitSetPresentationMode(pipVideo.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture')
      }
    } catch {
      /* PiP denial keeps inline playback */
    }
  }

  function toggleMenu(menu: PlayerMenuId) {
    if (menu === 'server' && activeMenu !== 'server') onServerRequest?.()
    pokeControls()
    if (activeMenu == null) menuReturnFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    if (menu === 'subtitles' && activeMenu !== 'subtitles') onSubtitleRequest?.()
    setActiveMenu((current) => (current === menu ? null : menu))
  }

  function chooseAudio(value: string) {
    separateSelection.current++; separateAudioPlayer.current?.reset(); setPreparingAudioId(null); setAudioPreparationError(null)
    controllerRef.current?.audio(value)
    if (!controlledAudio) setInternalAudio(value)
    onAudioChange?.(value)
    closeMenu()
  }
  async function chooseSeparateAudio(id: string) {
    if (!onSeparateAudioSelect || !separateAudioPlayer.current) return
    const generation = ++separateSelection.current
    setPreparingAudioId(id); setAudioPreparationError(null)
    try {
      const track = await onSeparateAudioSelect(id)
      if (generation !== separateSelection.current) return
      await separateAudioPlayer.current?.select(track)
      await separateAudioPlayer.current?.boost(volumeBoost)
    } catch {
      if (generation === separateSelection.current) setAudioPreparationError('This audio is unavailable right now. Your current audio is still playing.')
    } finally { if (generation === separateSelection.current) setPreparingAudioId(null) }
  }

  function chooseSubtitle(value: string) {
    controllerRef.current?.subtitle(value)
    if (!controlledSubtitle) setInternalSubtitle(value)
    storeValue('consumit.player.subtitles', value)
    onSubtitleChange?.(value)
    closeMenu()
  }

  async function loadSubtitleLanguage(language: string, cursor = 0) {
    if (!onSubtitlePage) return
    setSubtitleMenuError(null)
    try {
      const page = await onSubtitlePage(language, cursor)
      setDiscoveredTracks((current) => {
        const merged = cursor === 0 ? page.tracks : [...(current[language] ?? []), ...page.tracks]
        const seen = new Set<string>()
        return { ...current, [language]: merged.filter((track) => { if (seen.has(track.id)) return false; seen.add(track.id); return true }) }
      })
      setNextSubtitleCursor((current) => ({ ...current, [language]: page.nextCursor }))
    } catch { setSubtitleMenuError('Tracks could not be loaded. Try this language again.') }
  }

  async function runSubtitleSearch(query: string, cursor = 0) {
    if (!onSubtitleSearch || !query.trim()) return
    const generation = ++searchGenerationRef.current
    setSearchingSubtitles(true)
    try {
      const page = await onSubtitleSearch(query.trim(), cursor)
      if (generation !== searchGenerationRef.current) return
      setSubtitleSearchResults((current) => cursor === 0 ? page.tracks : [...current, ...page.tracks])
      setNextSearchCursor(page.nextCursor)
      setSubtitleMenuError(null)
    } catch { if (generation === searchGenerationRef.current) setSubtitleMenuError('Subtitle search failed. Try again.') }
    finally { if (generation === searchGenerationRef.current) setSearchingSubtitles(false) }
  }

  function changeSubtitleSearch(query: string) {
    setSubtitleSearch(query)
    clearTimeout(searchTimerRef.current)
    ++searchGenerationRef.current
    if (!query.trim()) { setSubtitleSearchResults([]); setNextSearchCursor(null); setSearchingSubtitles(false); return }
    setSearchingSubtitles(true)
    searchTimerRef.current = setTimeout(() => { void runSubtitleSearch(query) }, 200)
  }

  async function selectDiscoveredSubtitle(candidate: PlayerSubtitleCandidate) {
    if (!onSubtitleCandidateSelect || preparingSubtitle) return
    setPreparingSubtitle(candidate.id)
    setSubtitleMenuError(null)
    try {
      const track = await onSubtitleCandidateSelect(candidate)
      setPreparedCandidateIds((current) => (current.includes(candidate.id) ? current : [...current, candidate.id]))
      setPreparedCandidateUrls((current) => current.includes(track.url) ? current : [...current, track.url])
      controllerRef.current?.externalSubtitles([...allExternalSubtitles, track])
      chooseSubtitle(`external:consumit-external-${track.id}`)
    } catch { setSubtitleMenuError('This subtitle could not be prepared. Choose another track.') }
    finally { setPreparingSubtitle(null) }
  }

  async function uploadSubtitle(file: File | undefined) {
    if (!file) return
    setSubtitleMenuError(null)
    if (file.size > 2 * 1024 * 1024 || !/\.(srt|vtt)$/i.test(file.name)) {
      setSubtitleMenuError('Choose an SRT or VTT file up to 2 MB.')
      return
    }
    try {
      const source = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
      const vtt = /\.srt$/i.test(file.name)
        ? `WEBVTT\n\n${source.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
        : source
      if (!vtt.startsWith('WEBVTT') || parseVttCues(vtt).length === 0) throw new Error('invalid')
      const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
      const track = { id: `upload-${Date.now()}`, label: file.name.slice(0, 100), language: 'und', url }
      if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current)
      uploadedUrlRef.current = url
      setUploadedSubtitle(track)
      controllerRef.current?.externalSubtitles([...allExternalSubtitles.filter((entry) => entry.id !== uploadedSubtitle?.id), track])
      chooseSubtitle(`external:consumit-external-${track.id}`)
    } catch { setSubtitleMenuError('This file has no usable subtitle cues.') }
  }

  function toggleSubtitlesSwitch() {
    const next = captionsOn ? 'off' : (subtitleOptions.find((o) => o.value !== 'off')?.value ?? 'english')
    controllerRef.current?.subtitle(next)
    if (!controlledSubtitle) setInternalSubtitle(next)
    storeValue('consumit.player.subtitles', next)
    onSubtitleChange?.(next)
  }

  function chooseServer(value: string) {
    onServerChange?.(value)
    closeMenu()
  }

  function chooseQuality(value: string) {
    // Source renditions are selected by the owner; their heights are not
    // hls.js level indexes for the currently attached fixed playlist.
    if (!(suppliedQualityOptions && onQualityChange)) controllerRef.current?.quality(value)
    if (!controlledQuality) setInternalQuality(value)
    onQualityChange?.(value)
    closeMenu()
  }

  function chooseRate(value: number) {
    controllerRef.current?.setPlaybackRate(value)
    if (!controlledRate) setInternalRate(value)
    storeValue('consumit.player.rate', String(value))
    onRateChange?.(value)
  }

  async function changeVolumeBoost(value: number) {
    const video = videoRef.current
    if (!video) return
    const controller = volumeBoostController.current ??= createVolumeBoost(video)
    try {
      const applied = await controller.set(value)
      await separateAudioPlayer.current?.boost(value)
      if (!video.isConnected) return
      setVolumeBoost(applied)
      setBoostError(null)
    } catch {
      if (!video.isConnected) return
      setVolumeBoost(1)
      setBoostError('Volume boost is unavailable in this browser. Normal volume is unchanged.')
    }
  }

  function changeBrightness(next: number) {
    const clamped = Math.min(1.3, Math.max(0.6, next))
    if (controlledBrightness == null) setInternalBrightness(clamped)
    storeValue('consumit.player.brightness', String(clamped))
    onBrightnessChange?.(clamped)
  }

  function chooseCaptionSize(next: CaptionSize) {
    if (controlledCaptionSize == null) setInternalCaptionSize(next)
    storeValue(CAPTION_SIZE_KEY, next)
    onCaptionSizeChange?.(next)
  }

  function chooseCaptionBackground(next: CaptionBackground) {
    if (controlledCaptionBackground == null) setInternalCaptionBackground(next)
    storeValue(CAPTION_BACKGROUND_KEY, next)
    onCaptionBackgroundChange?.(next)
  }

  function chooseCaptionPosition(next: CaptionPosition) {
    if (controlledCaptionPosition == null) setInternalCaptionPosition(next)
    storeValue(CAPTION_POSITION_KEY, next)
    onCaptionPositionChange?.(next)
  }

  function chooseCaptionFont(next: CaptionFont) {
    if (controlledCaptionFont == null) setInternalCaptionFont(next)
    storeValue(CAPTION_FONT_KEY, next)
    onCaptionFontChange?.(next)
  }

  function chooseSubtitleDelayMs(next: number) {
    const clamped = clampSubtitleDelayMs(next)
    if (controlledSubtitleDelayMs == null) setInternalSubtitleDelayMs(clamped)
    storeValue(SUBTITLE_DELAY_KEY, String(clamped))
    onSubtitleDelayMsChange?.(clamped)
  }

  function adjustSubtitleDelayMs(delta: number) {
    chooseSubtitleDelayMs(subtitleDelayMs + delta)
  }

  function flashSyncStatus(message: string) {
    setSyncStatus(message)
    if (syncStatusTimer.current != null) window.clearTimeout(syncStatusTimer.current)
    syncStatusTimer.current = window.setTimeout(() => setSyncStatus(null), 2000)
  }

  function syncToCue(cue: SubtitleCue) {
    const video = videoRef.current
    if (!video) return
    const next = computeSyncDelayMs(cue.startTime, video.currentTime || 0, !video.paused)
    chooseSubtitleDelayMs(next)
    flashSyncStatus(`Synced to “${cue.text.slice(0, 24)}…”`)
  }

  const syncCueWindow = useMemo(() => {
    if (!subtitleCues.length) return { visible: [] as readonly SubtitleCue[], activeIndex: -1 }
    const t = currentTime + subtitleDelayMs / 1000
    let closest = 0
    let minDiff = Number.POSITIVE_INFINITY
    for (let i = 0; i < subtitleCues.length; i++) {
      const cue = subtitleCues[i]!
      if (t >= cue.startTime && t <= cue.endTime) {
        closest = i
        break
      }
      const diff = Math.abs(cue.startTime - t)
      if (diff < minDiff) {
        minDiff = diff
        closest = i
      }
    }
    const start = Math.max(0, closest - 20)
    const end = Math.min(subtitleCues.length, closest + 20)
    return { visible: subtitleCues.slice(start, end), activeIndex: closest - start }
  }, [subtitleCues, currentTime, subtitleDelayMs])

  useEffect(() => {
    if (activeMenu !== 'sync' || !syncListRef.current || syncHovering || syncCueWindow.activeIndex === -1) return
    const container = syncListRef.current
    const activeEl = container.children[syncCueWindow.activeIndex] as HTMLElement | undefined
    if (!activeEl) return
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    container.scrollTo({
      top: activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [activeMenu, syncHovering, syncCueWindow])

  /* File URL behind the selected external track (the controller registers
   * external entries as `consumit-external-<id>`). Engine (HLS-manifest)
   * tracks carry no URL, so delay falls back to native timing for them. */
  const activeSubtitleUrl = useMemo(() => {
    if (!captionsOn || !selectedSubtitle.startsWith('external:')) return undefined
    const trackId = selectedSubtitle.slice('external:'.length)
    const prefix = 'consumit-external-'
    if (!trackId.startsWith(prefix)) return undefined
    return allExternalSubtitles.find((entry) => entry.id === trackId.slice(prefix.length))?.url
  }, [captionsOn, selectedSubtitle, allExternalSubtitles])

  useEffect(() => {
    if (!captionsOn || !activeSubtitleUrl) {
      setSubtitleCues([])
      return
    }
    const cached = subtitleCueCache.current.get(activeSubtitleUrl)
    if (cached) {
      setSubtitleCues(cached)
      return
    }
    let cancelled = false
    // No AbortController on purpose (see watch-playback subtitle effect):
    // a bounded timeout signal plus the `cancelled` guard gives the same
    // behavior with no abort() call site for dev overlays to blame.
    void fetchVttCues(activeSubtitleUrl, AbortSignal.timeout(30_000))
      .then((cues) => {
        if (cancelled) return
        const cache = subtitleCueCache.current
        cache.delete(activeSubtitleUrl)
        cache.set(activeSubtitleUrl, cues)
        if (cache.size > 5) {
          const oldest = cache.keys().next()
          if (!oldest.done && oldest.value !== activeSubtitleUrl) cache.delete(oldest.value)
        }
        setSubtitleCues(cues)
      })
      .catch(() => {
        if (!cancelled) setSubtitleCues([])
      })
    return () => { cancelled = true }
  }, [captionsOn, activeSubtitleUrl])

  function retryPlayback() {
    if (onRetry) {
      onRetry()
      return
    }
    const video = videoRef.current
    setHasError(false)
    setErrorMessage(null)
    try {
      video?.load()
    } catch {
      /* reload failure surfaces through the error event */
    }
  }

  function onShellKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    const inField = target?.closest('input, select, textarea, [role="menu"], [role="listbox"]') != null
    const inButton = target?.closest('button') != null
    switch (event.key) {
      case ' ':
      case 'k':
      case 'K': {
        if (event.key === ' ' && (inField || inButton)) return
        if (inField && event.key !== ' ') return
        event.preventDefault()
        void togglePlayback()
        break
      }
      case 'j':
      case 'J':
      case 'ArrowLeft': {
        if (inField) return
        event.preventDefault()
        seekBy(-SEEK_STEP)
        break
      }
      case 'l':
      case 'L':
      case 'ArrowRight': {
        if (inField) return
        event.preventDefault()
        seekBy(SEEK_STEP)
        break
      }
      case 'ArrowUp': {
        if (inField) return
        event.preventDefault()
        changeVolume(volume + 0.05)
        break
      }
      case 'ArrowDown': {
        if (inField) return
        event.preventDefault()
        changeVolume(volume - 0.05)
        break
      }
      case 'm':
      case 'M': {
        if (inField) return
        toggleMute()
        break
      }
      case 'f':
      case 'F': {
        if (inField) return
        void toggleFullscreen()
        break
      }
      case 'c':
      case 'C': {
        if (inField) return
        chooseSubtitle(captionsOn ? 'off' : (subtitleOptions[0]?.value ?? 'english'))
        break
      }
      case 'Home': {
        if (inField) return
        event.preventDefault()
        seekBy(-currentTime)
        break
      }
      case 'End': {
        if (inField) return
        event.preventDefault()
        if (videoRef.current && Number.isFinite(videoRef.current.duration)) seekBy(videoRef.current.duration - currentTime)
        break
      }
      case '?': {
        if (inField || event.ctrlKey || event.metaKey || event.altKey) return
        event.preventDefault()
        toggleMenu('shortcuts')
        break
      }
      default:
        break
    }
  }

  const chromeVisible = controlsVisible || !isPlaying || activeMenu != null || hasError
  const chapterLabel = currentChapter
    ? `Chapter ${chapterIndex + 1} · ${currentChapter.title}`
    : chapters && chapters.length > 0
      ? `${chapters.length} chapters`
      : undefined

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-border bg-black',
        /* Fullscreen must feel like the old-master room: no card radius or
           hairline, true edge-to-edge bleed instead of a boxed video. */
        isFullscreen && 'rounded-none border-0',
        className,
      )}
      data-consumit-player
      data-player-core={useNextPlaybackCore ? 'next' : 'legacy'}
      data-controls-visible={chromeVisible ? 'true' : 'false'}
      data-fullscreen={isFullscreen ? 'true' : 'false'}
      data-preparing={startupPending ? 'true' : 'false'}
      ref={shellRef}
    >
      {status ? (
        <div
          aria-live="polite"
          className="flex min-h-11 items-center gap-2 border-b border-border bg-canvas px-4 text-xs text-copy"
          role="status"
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-2 rounded-full',
              statusTone === 'healthy' && 'bg-lime',
              statusTone === 'neutral' && 'bg-copy',
              statusTone === 'unavailable' && 'bg-danger',
            )}
          />
          {status}
        </div>
      ) : null}
      <div
        aria-label={`${title} player controls`}
        className={cn(
          'relative m-auto w-full overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange',
          /* Inline keeps the catalog aspect box; fullscreen fills the room
             like the old-master fixed inset-0 shell. */
          isFullscreen ? 'aspect-auto h-full max-h-none flex-1' : 'aspect-video max-h-full',
          !isFullscreen && 'min-h-80 sm:min-h-0',
          !chromeVisible && isPlaying && 'cursor-none',
        )}
        onKeyDown={onShellKeyDown}
        onMouseMove={pokeControls}
        onPointerDown={pokeControls}
        onTouchStart={pokeControls}
        onFocusCapture={pokeControls}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) scheduleHide()
        }}
        onMouseLeave={() => {
          if (isPlaying && activeMenu == null && !hasKeyboardFocus()) {
            setControlsVisible(false)
            if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
            hideTimer.current = undefined
          }
        }}
        role="region"
        data-player-stage
        tabIndex={0}
      >
        {!posterSrc && !hasSource ? (
          <MissingArtwork className="absolute inset-0" label={`${title} playback unavailable`} />
        ) : null}
        <video
          {...props}
          aria-label={`${title} player`}
          autoPlay={autoPlay}
          className={cn('size-full object-contain', videoClassName)}
          crossOrigin={props.crossOrigin ?? 'anonymous'}
          muted={isMuted}
          onClick={() => void togglePlayback()}
          onDurationChange={(event) => {
            setDuration(event.currentTarget.duration || 0)
            onDurationChange?.(event)
          }}
          onEnded={(event) => {
            setIsPlaying(false)
            setIsBuffering(false)
            setControlsVisible(true)
            props.onEnded?.(event)
          }}
          onError={(event) => {
            if (hasSource && !source) {
              setHasError(true)
              setIsBuffering(false)
              setErrorMessage('The current source could not play this title.')
            }
            props.onError?.(event)
          }}
          onPause={(event) => {
            setIsPlaying(false)
            setControlsVisible(true)
            onPause?.(event)
          }}
          onPlay={(event) => {
            setIsPlaying(true)
            setHasError(false)
            onPlay?.(event)
          }}
          onPlaying={(event) => {
            setIsBuffering(false)
            setPresentedMedia(mediaSrc)
            props.onPlaying?.(event)
          }}
          onSeeking={(event) => {
            setIsBuffering(true)
            props.onSeeking?.(event)
          }}
          onSeeked={(event) => {
            setIsBuffering(false)
            props.onSeeked?.(event)
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime)
            onTimeUpdate?.(event)
          }}
          onVolumeChange={(event) => {
            setIsMuted(event.currentTarget.muted)
            setVolume(event.currentTarget.volume)
            onVolumeChange?.(event)
          }}
          onWaiting={() => setIsBuffering(true)}
          playsInline
          poster={posterSrc}
          preload={preload}
          ref={videoRef}
          src={source ? undefined : src}
        >
          {children}
        </video>
        {onSeparateAudioSelect ? <audio aria-hidden="true" crossOrigin="anonymous" hidden preload="none" ref={separateAudioRef} /> : null}

        {showTopBar ? (
          <div
            data-player-header
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16 transition-opacity duration-300 motion-reduce:transition-none sm:px-6',
              isFullscreen && 'px-6 pt-[max(1.75rem,env(safe-area-inset-top))] sm:px-10',
              chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <div className="pointer-events-auto grid w-11 shrink-0 place-items-center">
              {onBack ? (
                <button
                  aria-label="Back"
                  className="grid size-11 place-items-center rounded-control border border-white/15 bg-black/60 text-ink backdrop-blur-md outline-none transition-colors hover:border-white/30 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-orange"
                  onClick={onBack}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={2} />
                </button>
              ) : backHref ? (
                <a
                  aria-label="Back"
                  className="grid size-11 place-items-center rounded-control border border-white/15 bg-black/60 text-ink backdrop-blur-md outline-none transition-colors hover:border-white/30 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-orange"
                  href={backHref}
                >
                  <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={2} />
                </a>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 text-center" data-player-title>
              {!isPlaying && hasSource && !hasError && pauseLogoUrl ? (
                <>
                  <img alt="" aria-hidden="true" className="mx-auto max-h-6 w-auto max-w-full object-contain [filter:drop-shadow(0_2px_16px_rgb(0_0_0/0.65))] sm:hidden" src={pauseLogoUrl} />
                  <span className="sr-only sm:hidden">{title}</span>
                </>
              ) : null}
              <p className={cn('truncate font-display text-xl leading-7 font-normal tracking-[-0.02em] text-ink drop-shadow-md', !isPlaying && hasSource && !hasError && pauseLogoUrl && 'hidden sm:block')}>{title}</p>
              {topMeta ? <p className="mt-0.5 truncate text-xs leading-4 tabular-nums text-muted drop-shadow-sm">{topMeta}</p> : null}
            </div>
            <div className="pointer-events-auto hidden shrink-0 items-center gap-2 lg:flex" data-player-episode-navigation>
              {isFullscreen && onPreviousEpisode ? <PlayerIconButton label="Previous episode" onClick={onPreviousEpisode}><SkipBack aria-hidden="true" className="size-5" /></PlayerIconButton> : null}
              {isFullscreen && onNextEpisode ? <PlayerIconButton label="Next episode" onClick={onNextEpisode}><SkipForward aria-hidden="true" className="size-5" /></PlayerIconButton> : null}
              <img alt="Consumit" className="ml-3 size-[44px] shrink-0 sm:size-[56px]" height={56} src="/assets/consumit-mark.svg" width={56} />
            </div>
          </div>
        ) : null}

        {startupPending ? (
          <div className="consumit-player-preparation pointer-events-none absolute inset-0" data-player-preparation role="status">
            {posterSrc ? <img alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" src={posterSrc} /> : null}
            <div className="consumit-player-preparation-shade absolute inset-0" />
            <div className="consumit-player-preparation-copy absolute">
              {preparationLogo ? (
                <>
                  <img
                    alt=""
                    aria-hidden="true"
                    className="consumit-player-preparation-logo"
                    onError={() => setFailedPreparationLogo(preparationLogo)}
                    ref={(image) => {
                      // SSR artwork can fail before React attaches its error handler.
                      if (image?.complete && image.naturalWidth === 0) setFailedPreparationLogo(preparationLogo)
                    }}
                    src={preparationLogo}
                  />
                  <span className="sr-only">{title}</span>
                </>
              ) : <p className="consumit-player-preparation-title font-display text-ink">{title}</p>}
              {preparationMeta ?? topMeta ? <p className="mt-3 text-sm text-copy">{preparationMeta ?? topMeta}</p> : null}
              <div aria-hidden="true" className="consumit-player-preparation-steps" data-stage={hasSource ? 'connecting' : 'resolving'}>
                <span /><span /><span />
              </div>
              <p className="mt-4 text-sm text-copy">{hasSource ? 'Preparing playback…' : 'Finding your stream…'}</p>
            </div>
          </div>
        ) : null}

        {isBuffering && hasSource && !hasError ? (
          <div className={cn('pointer-events-none absolute inset-0 grid place-items-center', startupPending && 'lg:hidden')} role="status">
            <span className="sr-only">Buffering video</span>
            <span className="consumit-player-buffering grid size-16 place-items-center rounded-full bg-black/60">
              <Loader2 aria-hidden="true" className="size-8 animate-spin text-orange motion-reduce:animate-none" />
            </span>
          </div>
        ) : null}

        {engineState?.needsGesture && hasSource && !hasError ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm font-bold text-ink" role="status">Tap play to start watching</div>
        ) : null}

        {!isPlaying && !startupPending && hasSource && !hasError && activeMenu == null && (pauseFacts != null || pauseLogoUrl != null || pauseOverview != null) ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center justify-start pb-16',
              showTopBar && pauseLogoUrl && 'hidden sm:flex',
              isFullscreen ? 'px-6 sm:px-10' : 'px-6 sm:px-6',
            )}
            data-consumit-player-pause
          >
            <div className="w-full max-w-3xl text-left [text-shadow:0_1px_16px_rgb(0_0_0/0.85)]">
              {pauseLogoUrl ? (
                <>
                  <img
                    alt=""
                    aria-hidden="true"
                    className="mr-auto max-h-24 w-auto max-w-full object-contain object-left [filter:drop-shadow(0_2px_16px_rgb(0_0_0/0.65))] sm:max-h-36"
                    src={pauseLogoUrl}
                  />
                  <span className="sr-only">{title}</span>
                </>
              ) : (
                <p data-player-pause-title className="font-display text-3xl leading-tight font-normal tracking-tight text-balance text-ink sm:text-5xl">{title}</p>
              )}
              {pauseFacts ? <p data-player-pause-facts className="mt-2.5 text-sm tabular-nums text-copy">{pauseFacts}</p> : null}
              {pauseOverview ? <p data-player-pause-overview className="mt-2.5 line-clamp-3 max-w-[62ch] text-sm leading-6 text-copy">{pauseOverview}</p> : null}
            </div>
          </div>
        ) : null}

        {hasError && hasSource ? (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-6" role="alert">
            <div className="max-w-md text-center">
              <TriangleAlert aria-hidden="true" className="mx-auto size-8 text-orange" />
              <p className="mt-3 text-base font-bold text-ink">Playback failed</p>
              <p className="mt-2 text-sm leading-6 text-copy">{errorMessage ?? 'The current source could not play this title.'}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  className="inline-flex min-h-11 items-center rounded-control bg-ink px-4 text-sm font-bold text-canvas outline-none transition-colors hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-orange"
                  onClick={retryPlayback}
                  type="button"
                >
                  Retry
                </button>
                {(dedupedServerOptions?.length ?? 0) > 1 ? (
                  <button
                    className="inline-flex min-h-11 items-center rounded-control border border-control-outline px-4 text-sm font-bold text-ink outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange"
                    onClick={() => setActiveMenu('server')}
                    title="Switch to another server"
                    type="button"
                  >
                    Try another server
                  </button>
                ) : null}
                <a
                  className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-bold text-copy outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
                  href="/report-issue?category=playback"
                >
                  Report an issue
                </a>
              </div>
            </div>
          </div>
        ) : null}

        {captionsOn && overlayCueText && !hasError && (captionPosition === 'top' || !chromeVisible) ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6 transition-[top,bottom] duration-300 motion-reduce:transition-none',
              captionPosition === 'top'
                ? (isFullscreen ? 'top-24 sm:top-28' : 'top-20 sm:top-24')
                : isFullscreen
                  ? (chromeVisible ? 'bottom-28 sm:bottom-32' : 'bottom-8 sm:bottom-10')
                  : (chromeVisible ? 'bottom-20 sm:bottom-24' : 'bottom-4 sm:bottom-6'),
            )}
            data-consumit-player-caption-position={captionPosition}
          >
            <p
              className={cn(
                // No text-balance here: subtitle files author their own line
                // breaks (one speaker per line, reading rhythm), and
                // rebalancing has reordered RTL punctuation in Chromium.
                // unicode-bidi:plaintext resolves direction per line so a
                // mixed two-speaker cue orders each line on its own; dir
                // remains as the fallback for older engines.
                'max-w-3xl text-center leading-snug whitespace-pre-line [unicode-bidi:plaintext]',
                captionSizeClass(captionSize, isFullscreen),
                captionFontClass(captionFont),
                overlayCueUntracked && 'tracking-normal',
                captionBackgroundClass(captionBackground),
              )}
              data-consumit-player-caption
              data-caption-font={captionFont}
              data-caption-size={captionSize}
              dir="auto"
            >
              {overlayCueText}
            </p>
          </div>
        ) : null}

        {lastSkip && hasSource && !hasError ? (
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-center',
              lastSkip.direction === 'forward' ? 'right-[10%] sm:right-[12%]' : 'left-[10%] sm:left-[12%]',
            )}
          >
            <p className="font-display text-4xl leading-none font-normal text-ink [text-shadow:0_2px_24px_rgb(0_0_0/0.8)] sm:text-5xl">
              {lastSkip.direction === 'forward' ? `+${lastSkip.amount}` : `-${lastSkip.amount}`}
            </p>
            <p className="mt-1 text-[10px] font-bold tracking-[0.2em] text-copy uppercase">Seconds</p>
          </div>
        ) : null}

        {activeSkip && !autoSkip && hasSource && !hasError ? (
          <div className="absolute right-4 bottom-28 z-20">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-control-outline bg-black/80 px-4 text-sm font-bold text-ink outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange"
              onClick={jumpSkip}
              type="button"
            >
              <SkipForward aria-hidden="true" className="size-4" />
              Skip {activeSkip.kind}
            </button>
          </div>
        ) : null}

        <div
          data-player-controls
          className={cn(
            'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pt-16 pb-4 transition-opacity duration-300 motion-reduce:transition-none sm:px-6',
            isFullscreen && 'px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10',
            chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div className="relative flex items-baseline justify-between gap-4 text-xs" data-player-timing>
          {captionsOn && !hasError && captionPosition === 'bottom' && overlayCueText && chromeVisible ? (
            <div className={cn('pointer-events-none absolute inset-x-0 bottom-full flex items-center justify-center pb-2', captionSizeClass(captionSize, isFullscreen))} data-player-caption-slot data-consumit-player-caption-position="bottom">
              <p
                className={cn('max-w-3xl text-center leading-snug whitespace-pre-line [unicode-bidi:plaintext]', captionFontClass(captionFont), overlayCueUntracked && 'tracking-normal', captionBackgroundClass(captionBackground))}
                data-consumit-player-caption
                data-caption-font={captionFont}
                data-caption-size={captionSize}
                dir="auto"
              >{overlayCueText}</p>
            </div>
          ) : null}
            <p className="min-w-0 truncate font-semibold text-ink drop-shadow-sm">{chapterLabel}</p>
            <button aria-label={showRemainingTime ? 'Show elapsed time' : 'Show remaining time'} aria-pressed={showRemainingTime} className="next-player-time shrink-0 tabular-nums text-copy outline-none focus-visible:ring-2 focus-visible:ring-orange" onClick={() => setShowRemainingTime(value => !value)} title={showRemainingTime ? 'Show elapsed time' : 'Show remaining time'} type="button">
              {showRemainingTime ? `−${formatPlaybackTime(Math.max(0, duration - currentTime))} left` : `${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`}
            </button>
          </div>
          <div
            className="group relative mt-1.5 flex h-6 items-center rounded-micro has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange"
            data-player-timeline
            onMouseLeave={() => {
              if (hoverRaf.current !== undefined) {
                window.cancelAnimationFrame(hoverRaf.current)
                hoverRaf.current = undefined
              }
              setHoverTime(null)
            }}
            onMouseMove={(event) => {
              if (duration <= 0 || hoverRaf.current !== undefined) return
              const { clientX } = event
              const target = event.currentTarget
              hoverRaf.current = window.requestAnimationFrame(() => {
                hoverRaf.current = undefined
                const rect = target.getBoundingClientRect()
                if (rect.width <= 0) return
                const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
                setHoverTime(ratio * duration)
              })
            }}
          >
            {hoverTime != null && duration > 0 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full z-20 hidden -translate-x-1/2 rounded-control border border-white/15 bg-black/90 px-3 py-1 text-xs font-bold tabular-nums text-ink shadow-lg backdrop-blur-md sm:block"
                style={{ left: `${Math.min(96, Math.max(4, (hoverTime / duration) * 100))}%` }}
              >
                {formatPlaybackTime(hoverTime)}
              </div>
            ) : null}
            <div aria-hidden="true" className="absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/20 transition-all duration-200 group-hover:h-2 motion-reduce:transition-none">
              <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${bufferedRatio * 100}%` }} />
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange to-[#ff7a5c]" style={{ width: `${progressRatio * 100}%` }} />
            </div>
            <div
              aria-hidden="true"
              className="absolute size-4 -translate-x-1/2 rounded-full border-2 border-orange bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] transition-transform duration-150 scale-75 group-hover:scale-110"
              style={{ left: `${progressRatio * 100}%` }}
            />
            <input
              aria-label="Playback position"
              aria-valuetext={`${formatPlaybackTime(currentTime)} of ${formatPlaybackTime(duration)}`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
              disabled={!hasSource || hasError || duration <= 0}
              max={duration || 0}
              min={0}
              onChange={(event) => {
                const nextTime = Number(event.currentTarget.value)
                if (videoRef.current && hasSource) {
                  try {
                    videoRef.current.currentTime = nextTime
                  } catch {
                    /* seek failure surfaces through media events */
                  }
                }
                setCurrentTime(nextTime)
                pokeControls()
              }}
              step={0.1}
              type="range"
              value={Math.min(currentTime, duration || 0)}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                aria-label={isPlaying ? 'Pause' : 'Play'}
                data-player-play-button
                className="grid size-11 shrink-0 place-items-center rounded-control bg-ink font-bold text-canvas outline-none transition-colors duration-200 motion-reduce:transition-none hover:bg-ink/85 shadow-[0_2px_12px_rgba(0,0,0,0.35)] focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:bg-ink/30 disabled:text-muted"
                disabled={!hasSource || hasError}
                onClick={() => void togglePlayback()}
                title={isPlaying ? 'Pause (K)' : 'Play (K)'}
                type="button"
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                aria-label="Back 10 seconds"
                className="grid size-10 shrink-0 place-items-center rounded-control text-ink outline-none transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
                disabled={!hasSource || hasError}
                onClick={() => seekBy(-SEEK_STEP)}
                title="Back 10 seconds (J)"
                type="button"
              >
                <span aria-hidden="true" className="relative grid place-items-center">
                  <RotateCcw className="size-5" strokeWidth={1.75} />
                  <span className="absolute text-[8px] font-bold">10</span>
                </span>
              </button>
              <button
                aria-label="Forward 10 seconds"
                className="grid size-10 shrink-0 place-items-center rounded-control text-ink outline-none transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
                disabled={!hasSource || hasError}
                onClick={() => seekBy(SEEK_STEP)}
                title="Forward 10 seconds (L)"
                type="button"
              >
                <span aria-hidden="true" className="relative grid place-items-center">
                  <RotateCw className="size-5" strokeWidth={1.75} />
                  <span className="absolute text-[8px] font-bold">10</span>
                </span>
              </button>
              <div className="consumit-player-volume flex items-center" data-player-volume-control>
              <PlayerIconButton disabled={!hasSource} label={isMuted || volume === 0 ? 'Unmute' : 'Mute'} onClick={toggleMute} title="Mute (M)">
                {isMuted || volume === 0 ? <VolumeX aria-hidden="true" className="size-5" strokeWidth={1.75} /> : <Volume2 aria-hidden="true" className="size-5" strokeWidth={1.75} />}
              </PlayerIconButton>
              <input
                aria-label="Volume"
                className="consumit-player-volume-slider h-10 cursor-pointer accent-orange"
                disabled={!hasSource}
                max={1}
                min={0}
                onChange={(event) => changeVolume(Number(event.currentTarget.value))}
                step={0.05}
                type="range"
                value={isMuted ? 0 : volume}
              />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-none sm:gap-2">
              {hasSource ? (
                <PlayerIconButton
                  active={activeMenu === 'quality'}
                  disabled={!hasSource}
                  expanded={activeMenu === 'quality'}
                  label={`Change quality, current ${qualityOptions.find((option) => option.value === selectedQuality)?.label ?? selectedQuality}`}
                  menuId="quality"
                  onClick={() => toggleMenu('quality')}
                  title={`Quality: ${qualityOptions.find((option) => option.value === selectedQuality)?.label ?? selectedQuality}`}
                >
                  <QualityIcon className="size-5" />
                </PlayerIconButton>
              ) : null}
              {showServerSection ? (
                <PlayerIconButton
                  active={activeMenu === 'server'}
                  expanded={activeMenu === 'server'}
                  label="Change server"
                  menuId="server"
                  onClick={() => toggleMenu('server')}
                  title={`Server: ${dedupedServerOptions?.find((s) => s.value === selectedServer)?.label ?? selectedServer ?? 'Default'}`}
                >
                  <Server aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </PlayerIconButton>
              ) : null}
              {hasSource ? (
                <PlayerIconButton
                  active={activeMenu === 'subtitles' || activeMenu === 'appearance' || captionsOn}
                  disabled={!hasSource}
                  expanded={activeMenu === 'subtitles' || activeMenu === 'appearance'}
                  label="Subtitles"
                  menuId={activeMenu === 'appearance' ? 'appearance' : 'subtitles'}
                  onClick={() => toggleMenu('subtitles')}
                  title={captionsOn ? `Subtitles: ${selectedSubtitle}` : 'Subtitles'}
                >
                  <Captions aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </PlayerIconButton>
              ) : null}
              {hasSource ? (
                <PlayerIconButton
                  active={activeMenu === 'sync'}
                  disabled={!hasSource}
                  expanded={activeMenu === 'sync'}
                  label={`Subtitle sync offset, current ${formatSubtitleDelayMs(subtitleDelayMs)}`}
                  menuId="sync"
                  onClick={() => toggleMenu('sync')}
                  title={`Sync: ${formatSubtitleDelayMs(subtitleDelayMs)}`}
                >
                  <Wand2 aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </PlayerIconButton>
              ) : null}
              <PlayerIconButton
                active={activeMenu === 'settings' || activeMenu === 'playback' || activeMenu === 'audio'}
                disabled={!hasSource}
                expanded={activeMenu === 'settings' || activeMenu === 'playback' || activeMenu === 'audio'}
                label="Settings: audio, speed, brightness"
                menuId={activeMenu === 'playback' || activeMenu === 'audio' ? activeMenu : 'settings'}
                onClick={() => toggleMenu('settings')}
              >
                <Settings aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </PlayerIconButton>
              {castAvailable ? (
                <PlayerIconButton
                  active={castConnected}
                  disabled={!hasSource}
                  label={castConnected ? 'Disconnect from TV' : 'Cast to TV'}
                  onClick={() => onCastClick?.()}
                  title={castConnected ? 'Casting — select to disconnect' : 'Cast to TV'}
                >
                  <Cast aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </PlayerIconButton>
              ) : null}
              <span className="contents">
                <PlayerIconButton
                  active={isPip}
                  disabled={!hasSource || hasError || !pipSupported}
                  label={isPip ? 'Exit picture in picture' : 'Enter picture in picture'}
                  onClick={() => void togglePip()}
                >
                  <PictureInPicture2 aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </PlayerIconButton>
              </span>
              <PlayerIconButton
                disabled={!hasSource}
                label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                onClick={() => void toggleFullscreen()}
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize aria-hidden="true" className="size-5" strokeWidth={1.75} /> : <Maximize aria-hidden="true" className="size-5" strokeWidth={1.75} />}
              </PlayerIconButton>
            </div>
          </div>
        </div>
        {activeMenu === 'settings' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Settings options" id="consumit-player-menu-settings" onClose={closeMenu} title="Settings">
              <div className="p-3">
                <div className="space-y-1">
                  <PlayerSettingRow icon={<QualityIcon className="size-5" />} label="Quality" value={qualityOptions.find((option) => option.value === selectedQuality)?.label ?? 'Auto'} onClick={() => setActiveMenu('quality')} />
                  <PlayerSettingRow icon={<Server className="size-5" />} label="Server" value={serverAuto ? 'Auto' : currentServerLabel ?? orderedServerOptions?.[0]?.label ?? 'Unavailable'} disabled={!onServerRequest && !dedupedServerOptions?.length} onClick={() => toggleMenu('server')} />
                  <PlayerSettingRow icon={<Captions className="size-5" />} label="Subtitles" value={captionsOn ? (subtitleOptions.find((option) => option.value === selectedSubtitle)?.label || 'On') : 'Off'} onClick={() => toggleMenu('subtitles')} />
                  <PlayerSettingRow icon={<Music className="size-5" />} label="Audio" value={selectedAudioLabel} onClick={() => setActiveMenu('audio')} />
                </div>
                <div className="consumit-player-panel-section">
                  <PlayerSettingRow icon={<Gauge className="size-5" />} label="Playback settings" value={selectedRate === 1 ? 'Normal speed' : selectedRate + '×'} onClick={() => setActiveMenu('playback')} />
                  <PlayerSettingRow icon={<Keyboard className="size-5" />} label="Keyboard shortcuts" value="?" onClick={() => setActiveMenu('shortcuts')} />
                  <PlayerSettingRow icon={<Moon className="size-5" />} label="Sleep Timer" value={sleepTimer ? sleepTimer + 'm' : 'Off'} onClick={cycleSleepTimer} />
                  <div className="consumit-player-setting-row">
                    <Captions aria-hidden="true" className="size-5 text-muted" /><span className="flex-1 text-sm">Enable Subtitles</span>
                    <Toggle checked={captionsOn} label="Enable Subtitles" onCheckedChange={toggleSubtitlesSwitch} />
                  </div>
                  <div className="consumit-player-setting-row">
                    <SkipForward aria-hidden="true" className="size-5 text-muted" /><span className="flex-1 text-sm">Auto-skip intros</span>
                    <Toggle checked={autoSkip} label="Auto-skip intros" onCheckedChange={toggleAutoSkip} />
                  </div>
                </div>
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'shortcuts' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Keyboard shortcuts" id="consumit-player-menu-shortcuts" onBack={() => setActiveMenu('settings')} onClose={closeMenu} title="Keyboard shortcuts">
              <div className="p-4">
                <p className="mb-4 text-xs leading-5 text-muted">Use these while the player has focus. Form fields keep their usual keys.</p>
                <dl className="divide-y divide-border">
                  {[
                    ['Play / pause', 'Space / K'],
                    ['Back 10 seconds', '← / J'],
                    ['Forward 10 seconds', '→ / L'],
                    ['Volume', '↑ / ↓'],
                    ['Mute', 'M'],
                    ['Fullscreen', 'F'],
                    ['Subtitles', 'C'],
                    ['Beginning / end', 'Home / End'],
                    ['This guide', '?'],
                    ['Close panel', 'Esc'],
                  ].map(([action, keys]) => <div className="flex min-h-11 items-center justify-between gap-4 py-2" key={action}><dt className="text-sm text-copy">{action}</dt><dd><kbd className="rounded-control border border-control-outline bg-surface-raised px-2 py-1 text-xs text-ink">{keys}</kbd></dd></div>)}
                </dl>
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'playback' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Playback settings" id="consumit-player-menu-playback" onBack={() => setActiveMenu('settings')} onClose={closeMenu} title="Playback settings">
              <div className="p-3">
                <PlayerAdjustment accessibleLabel="Playback speed" label="Speed" valueLabel={selectedRate === 1 ? 'Normal' : selectedRate + '×'} value={Math.max(0, dedupedRates.indexOf(selectedRate))} min={0} max={dedupedRates.length - 1} disabled={dedupedRates.length === 1} step={1} ticks={dedupedRates.map((rate, index) => ({ value: index, label: rate + '×' }))} onChange={(index) => chooseRate(dedupedRates[index] ?? selectedRate)} />
                <PlayerAdjustment label="Volume boost" valueLabel={volumeBoost === 1 ? 'Off' : volumeBoost + '×'} value={volumeBoost} min={1} max={3} step={0.5} ticks={[1, 1.5, 2, 2.5, 3].map((value) => ({ value, label: value + '×' }))} onChange={(value) => void changeVolumeBoost(value)} />
                {boostError ? <p className="px-1 text-xs text-copy" role="status">{boostError}</p> : null}
                <PlayerAdjustment label="Brightness" valueLabel={Math.round(brightness * 100) + '%'} value={brightness} min={0.6} max={1.3} step={0.05} ticks={[{ value: 0.6, label: '60%' }, { value: 1, label: '100%' }, { value: 1.3, label: '130%' }]} onChange={changeBrightness} />
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'audio' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Audio" id="consumit-player-menu-audio" onBack={() => setActiveMenu('settings')} onClose={closeMenu} title="Audio">
              <div className="space-y-1 p-3">
                {engineState?.audioNotice ? <p className="mb-3 text-sm leading-6 text-copy" role="status">{engineState.audioNotice}</p> : null}
                {!audioOptions.length ? <button className={settingsRowClass(!separateState.track)} onClick={() => { separateSelection.current++; separateAudioPlayer.current?.reset(); setPreparingAudioId(null); setAudioPreparationError(null) }} type="button">Stream audio</button> : null}
                {unifiedAudio.map(option => {
                  const selected = separateState.track ? option.separate.some(track => track.id === separateState.track?.id) : option.stream.some(track => track.value === selectedAudio)
                  const loading = option.separate.some(track => track.id === preparingAudioId || (separateState.loading && track.id === separateState.track?.id))
                  const stream = option.stream.find(track => track.value === selectedAudio) ?? option.stream[0]
                  return <button aria-checked={selected} aria-busy={loading} className={settingsRowClass(selected)} key={option.key} onClick={() => stream ? chooseAudio(stream.value) : void chooseSeparateAudio(option.separate[0]!.id)} role="menuitemradio" type="button"><span className="min-w-0 flex-1">{option.label}</span>{loading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : selected ? <Check aria-hidden="true" className="size-4 text-orange" /> : null}</button>
                })}
                {onAudioRequest ? <>
                  {separateAudioLoading ? <p className="pt-2 text-sm text-copy" role="status">Finding languages…</p> : null}
                  {separateAudioError || audioPreparationError || separateState.error ? <p className="mb-2 text-sm leading-6 text-copy" role="status">{audioPreparationError ?? separateState.error ?? separateAudioError}</p> : null}
                  {separateState.track ? <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="mb-2 text-xs leading-5 text-muted" role="status">{separateState.warning ?? 'Different recordings may need a sync adjustment.'}</p>
                    <PlayerAdjustment label="Audio sync" valueLabel={`${separateState.offset > 0 ? '+' : ''}${separateState.offset.toFixed(1)}s`} value={separateState.offset} min={-30} max={30} step={0.1} ticks={[]} onChange={value => separateAudioPlayer.current?.offset(value)} />
                    <button className="mt-2 text-xs text-copy hover:text-ink" onClick={() => separateAudioPlayer.current?.offset(0)} type="button">Reset audio sync</button>
                  </div> : null}
                </> : null}
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'quality' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Quality" id="consumit-player-menu-quality" onClose={closeMenu} onBack={() => setActiveMenu("settings")} title="Quality">
              <div className="p-3">
                <div className="space-y-1" role="group" aria-label="Quality options">
                  {qualityOptions.map((option) => {
                    const selected = selectedQuality === option.value
                    return (
                      <button
                        aria-checked={selected}
                        className={settingsRowClass(selected)}
                        key={option.value}
                        onClick={() => chooseQuality(option.value)}
                        role="menuitemradio"
                        title={option.detail ?? option.label}
                        type="button"
                      >
                        <span className="flex-1">{option.label}</span>
                        {selected ? <Check aria-hidden="true" className="size-4 text-orange" /> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'server' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Server" id="consumit-player-menu-server" onClose={closeMenu} onBack={() => setActiveMenu("settings")} title="Server">
              <div className="space-y-1 p-3">
                {onServerAuto ? <>
                  <button aria-checked={Boolean(serverAuto)} className={cn('flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm text-ink outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50', serverAuto && 'bg-orange/15')} disabled={serverBusy} onClick={() => { onServerAuto(); closeMenu() }} role="menuitemradio" type="button">
                    <span className="min-w-0 flex-1"><span className="block font-medium">Auto</span><span className="block text-xs text-muted">Choose automatically</span></span>
                    {serverAuto ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                  </button>
                  {currentServerLabel ? <p className="px-3 py-2 text-xs text-copy">Playing from {currentServerLabel}</p> : null}
                </> : null}
                {serverLoading ? <p className="px-3 py-2 text-xs text-copy" role="status">Finding servers…</p> : null}
                {serverBusy ? <p className="px-3 py-2 text-xs text-copy" role="status">Switching server…</p> : null}
                {serverError ? <div className="px-3 py-2"><p className="text-xs text-copy" role="status">{serverError}</p><button className="min-h-11 text-sm text-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-orange" disabled={serverLoading} onClick={onServerRequest} type="button">Try again</button></div> : null}
                {!serverLoading && !serverError && onServerAuto && !dedupedServerOptions?.some(option => option.value !== selectedServer) ? <p className="px-3 py-2 text-xs text-muted">No other servers are available for this title.</p> : null}
                {(serverGroups ?? []).map((group) => (
                  <div key={group.family || 'servers'} role="group" aria-label={group.family ? displayFamilyName(group.family) : 'Servers'}>
                    {group.family && (serverGroups?.length ?? 0) > 1 ? (
                      <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{displayFamilyName(group.family)}</p>
                    ) : null}
                    {group.options.map((option) => {
                      const selected = !serverAuto && (selectedServer ?? orderedServerOptions?.[0]?.value) === option.value
                      const favorite = favoriteServers.includes(option.value)
                      const flag = regionFlag(option.region)
                      const region = regionName(option.region)
                      const degraded = option.health === 'degraded'
                      const answering = option.available !== false
                      const detail = option.detail ?? (answering ? null : 'Unavailable for this title')
                      return (
                        <div
                          className={cn('flex items-center gap-1 rounded-control transition-all motion-reduce:transition-none', selected ? 'bg-orange/15 shadow-[inset_0_0_0_1px_var(--color-orange)]' : 'hover:bg-white/10', !answering && 'opacity-60')}
                          key={option.value}
                        >
                          <button
                            aria-checked={selected}
                            disabled={serverBusy}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control px-3 text-left text-sm outline-none transition-all motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-orange"
                            onClick={() => chooseServer(option.value)}
                            role="menuitemradio"
                            title={answering ? undefined : 'Unavailable for this title — tap to retry it'}
                            type="button"
                          >
                            {flag ? <span aria-hidden="true" className="shrink-0 text-base leading-none" title={region ?? undefined}>{flag}</span> : null}
                            <span className="min-w-0 flex-1">
                              <span className={cn('block truncate leading-5', selected ? 'font-bold text-ink' : 'font-medium')}>{displayMirrorName(option)}</span>
                              {detail ? <span className="block truncate text-xs leading-4 font-normal text-muted">{detail}</span> : null}
                            </span>
                        {degraded ? (
                          <span className="grid shrink-0 place-items-center text-orange" title="Server degraded">
                            <TriangleAlert aria-hidden="true" className="size-4" />
                            <span className="sr-only">Server degraded</span>
                          </span>
                        ) : null}
                        {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                      </button>
                      <button
                        aria-label={favorite ? `Unfavorite ${option.label} server` : `Favorite ${option.label} server`}
                        aria-pressed={favorite}
                        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-control text-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none"
                        onClick={() => toggleFavoriteServer(option.value)}
                        title={favorite ? 'Favorited — pins to the top' : 'Favorite server'}
                        type="button"
                      >
                        <Heart aria-hidden="true" className={cn('size-4', favorite && 'fill-current text-orange')} />
                      </button>
                        </div>
                      )
                    })}
                    </div>
                ))}
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'sync' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Subtitle sync" backLabel="Back to subtitles" id="consumit-player-menu-sync" onClose={closeMenu} onBack={() => toggleMenu('subtitles')} title="Subtitle sync">
              <div className="space-y-3 p-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm text-copy">Current offset</p>
                  <p aria-live="polite" className="text-sm font-bold tabular-nums text-orange">
                    {formatSubtitleDelayMs(subtitleDelayMs)}
                  </p>
                </div>
                <p className="px-1 text-sm leading-6 text-copy">
                  Click a line when you hear it spoken
                </p>
                <div
                  className="flex h-40 flex-col gap-1 overflow-y-auto overscroll-contain rounded-control border border-white/10 bg-white/[0.03] p-1.5"
                  onMouseEnter={() => setSyncHovering(true)}
                  onMouseLeave={() => setSyncHovering(false)}
                  onTouchStart={() => setSyncHovering(true)}
                  ref={syncListRef}
                  role="group"
                  aria-label="Subtitle lines"
                >
                  {syncCueWindow.visible.length === 0 ? (
                    <p className="grid h-full place-items-center text-center text-sm text-muted">
                      {captionsOn ? 'No subtitles loaded' : 'Subtitles are off'}
                    </p>
                  ) : (
                    syncCueWindow.visible.map((cue, index) => {
                      const isActive = index === syncCueWindow.activeIndex
                      return (
                        <button
                          className={cn(
                            'group flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-2 text-left text-xs outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-orange',
                            isActive
                              ? 'bg-orange/15 text-ink shadow-[inset_0_0_0_1px_var(--color-orange)]'
                              : 'text-copy hover:bg-white/10 hover:text-ink',
                          )}
                          key={`${cue.startTime}-${index}`}
                          onClick={() => syncToCue(cue)}
                          type="button"
                        >
                          <span className="line-clamp-2 min-w-0 flex-1">{cue.text}</span>
                          <span
                            className={cn(
                              'shrink-0 rounded px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] transition-opacity',
                              isActive ? 'bg-orange text-canvas opacity-100' : 'bg-white/10 opacity-0 group-hover:opacity-100',
                            )}
                          >
                            Sync
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
                <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Fine tune offset">
                  <button
                    aria-label="Shift subtitles backwards 50 milliseconds"
                    className={settingsChipClass(false)}
                    onClick={() => { adjustSubtitleDelayMs(-50); flashSyncStatus('Adjusted −50ms') }}
                    type="button"
                  >
                    <Minus aria-hidden="true" className="size-3.5" />
                    <span className="ml-1 text-xs">50 ms</span>
                  </button>
                  <button
                    aria-label="Reset subtitle sync offset"
                    className={settingsChipClass(subtitleDelayMs === 0, true)}
                    onClick={() => { chooseSubtitleDelayMs(0); flashSyncStatus('Offset reset') }}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    <span className="ml-1 text-xs">Reset</span>
                  </button>
                  <button
                    aria-label="Shift subtitles forwards 50 milliseconds"
                    className={settingsChipClass(false)}
                    onClick={() => { adjustSubtitleDelayMs(50); flashSyncStatus('Adjusted +50ms') }}
                    type="button"
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    <span className="ml-1 text-xs">50 ms</span>
                  </button>
                </div>
                {syncStatus ? (
                  <p aria-live="polite" className="rounded-control bg-orange/15 px-3 py-2 text-center text-xs font-bold text-orange" role="status">
                    {syncStatus}
                  </p>
                ) : null}
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'subtitles' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Subtitles" id="consumit-player-menu-subtitles" onClose={closeMenu} onBack={() => setActiveMenu("settings")} meta={subtitleTrackCount > 0 ? subtitleTrackCount + (subtitleTrackCount === 1 ? " track" : " tracks") : undefined} title="Subtitles">
              <div className="space-y-1 p-3">
                <button aria-checked={!captionsOn} className={settingsRowClass(!captionsOn)} onClick={() => chooseSubtitle('off')} role="menuitemradio" type="button">
                  <span className="min-w-0 flex-1 text-left font-medium">Off</span>
                  {!captionsOn ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                </button>
                <button className={settingsRowClass(false)} onClick={() => setActiveMenu('appearance')} type="button">
                  <span className="min-w-0 flex-1 text-left font-medium">Subtitle appearance</span><ChevronRight aria-hidden="true" className="size-4 text-muted" />
                </button>
                <input accept=".srt,.vtt,text/vtt,application/x-subrip" className="sr-only" onChange={(event) => { void uploadSubtitle(event.target.files?.[0]); event.target.value = '' }} ref={uploadInputRef} type="file" />
                <button className={settingsRowClass(false)} onClick={() => uploadInputRef.current?.click()} type="button">
                  <span className="min-w-0 flex-1 text-left font-medium">Upload subtitle file</span><Upload aria-hidden="true" className="size-4" />
                </button>
                <button className={settingsRowClass(false)} onClick={() => setActiveMenu('sync')} type="button">
                  <span className="min-w-0 flex-1 text-left font-medium">Sync subtitle to audio</span><ChevronRight aria-hidden="true" className="size-4" />
                </button>
                <label className="flex items-center gap-2 rounded-control bg-white/[0.06] px-3 py-2 text-muted">
                  <Search aria-hidden="true" className="size-4 shrink-0" />
                  <input aria-label="Search subtitle languages and tracks" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" onChange={(event) => changeSubtitleSearch(event.target.value)} placeholder="Search" type="search" value={subtitleSearch} />
                </label>
                {subtitleDiscovery?.loading ? <p className="px-2 py-1 text-xs text-muted" role="status">Searching subtitle providers…</p> : null}
                {subtitleDiscovery?.error ? <p className="px-2 py-1 text-xs text-orange" role="alert">{subtitleDiscovery.error}</p> : null}
                {subtitleMenuError ? <p className="px-2 py-1 text-xs text-orange" role="alert">{subtitleMenuError}</p> : null}
                {subtitleDiscovery?.providers.some((provider) => provider.state === 'failed' || provider.state === 'timeout') ? (
                  <p className="px-2 py-1 text-xs text-muted">Some subtitle providers are unavailable. Available tracks are shown below.</p>
                ) : null}
                {subtitleDiscovery?.providers.some((provider) => provider.reason === 'credentials_required') ? (
                  <p className="px-2 py-1 text-xs text-muted">Some subtitle providers need server credentials. Other results are available below.</p>
                ) : null}
                {subtitleSearch.trim() ? <div className="space-y-1">
                  {searchingSubtitles ? <p className="px-2 text-xs text-muted" role="status">Searching tracks…</p> : null}
                  {!searchingSubtitles && subtitleSearchResults.length === 0 ? <p className="px-2 text-xs text-muted">No tracks match this search.</p> : null}
                  {subtitleSearchResults.filter((track) => !isRepresentedCandidate(track)).map((track) => <button className={settingsRowClass(false)} key={track.id} onClick={() => void selectDiscoveredSubtitle(track)} type="button"><SubtitleTrackLabel language={track.language} label={track.label} detail={subtitleCandidateDetail(track)} /></button>)}
                  {nextSearchCursor != null ? <button className={settingsRowClass(false)} onClick={() => void runSubtitleSearch(subtitleSearch, nextSearchCursor)} type="button">Load more matches</button> : null}
                </div> : null}
                {!subtitleSearch.trim() && !subtitleDiscovery?.loading && subtitleLanguageRows.length === 0 ? <p className="px-2 py-2 text-sm text-muted">No subtitles found for this title yet.</p> : null}
                {!subtitleSearch.trim() && subtitleLanguageRows.map(({ code, count }) => {
                  const opened = openSubtitleLanguage === code
                  const localOptions = subtitleOptions.filter((option) => option.value !== 'off' && (option.language ?? 'und') === code)
                  return <div key={code}>
                    <button aria-expanded={opened} className={settingsRowClass(false)} onClick={() => {
                      setOpenSubtitleLanguage(opened ? null : code)
                      if (!opened && onSubtitlePage) void loadSubtitleLanguage(code)
                    }} type="button">
                      <bdi className="min-w-0 flex-1 truncate text-left font-medium tracking-normal" dir="auto" lang={code}>{nativeLanguageName(code, code === 'und' ? 'Uploaded' : code.toUpperCase())}</bdi>
                      <span className="tabular-nums text-muted">{count}</span><ChevronRight aria-hidden="true" className={cn('size-4 text-muted transition-transform', opened && 'rotate-90')} />
                    </button>
                    {opened ? <div aria-label={`${nativeLanguageName(code, code)} subtitle tracks`} className="space-y-1 pl-3">
                      {localOptions.map((option) => <button aria-checked={selectedSubtitle === option.value} className={settingsRowClass(selectedSubtitle === option.value)} key={option.value} onClick={() => chooseSubtitle(option.value)} role="menuitemradio" type="button"><SubtitleTrackLabel language={option.language} label={option.label} detail={option.detail} />{selectedSubtitle === option.value ? <Check aria-hidden="true" className="size-4 text-orange" /> : null}</button>)}
                      {(discoveredTracks[code] ?? []).filter((track) => !isRepresentedCandidate(track)).map((track) => <button className={settingsRowClass(false)} disabled={preparingSubtitle === track.id} key={track.id} onClick={() => void selectDiscoveredSubtitle(track)} type="button"><SubtitleTrackLabel language={track.language} label={track.label} detail={subtitleCandidateDetail(track)} />{preparingSubtitle === track.id ? <Loader2 aria-label="Preparing subtitle" className="size-4 animate-spin" /> : null}</button>)}
                      {nextSubtitleCursor[code] != null ? <button className={settingsRowClass(false)} onClick={() => void loadSubtitleLanguage(code, nextSubtitleCursor[code]!)} type="button">Load more tracks</button> : null}
                      {nextSubtitleCursor[code] == null && (discoveredTracks[code]?.length ?? 0) < (subtitleDiscovery?.languages.find((language) => language.code === code)?.count ?? 0) ? <button className={settingsRowClass(false)} onClick={() => void loadSubtitleLanguage(code)} type="button">Show latest tracks</button> : null}
                    </div> : null}
                  </div>
                })}
              </div>
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'appearance' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Subtitle appearance" backLabel="Back to subtitles" id="consumit-player-menu-appearance" onBack={() => setActiveMenu('subtitles')} onClose={closeMenu} title="Subtitle appearance">
              <div className="space-y-3 p-3">
                  <div aria-label="Caption size" className="space-y-1.5 px-1" role="group">
                    <p className="text-xs font-medium text-copy">Size</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['small', 'medium', 'large', 'xlarge'] as const).map((size) => (
                        <button
                          aria-pressed={captionSize === size}
                          className={settingsChipClass(captionSize === size, true)}
                          key={size}
                          onClick={() => chooseCaptionSize(size)}
                          type="button"
                        >
                          {size === 'small' ? 'Small' : size === 'medium' ? 'Medium' : size === 'large' ? 'Large' : 'XL'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div aria-label="Caption style" className="space-y-1.5 px-1" role="group">
                    <p className="text-xs font-medium text-copy">Style</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['cinematic', 'boxed', 'subtle'] as const).map((style) => (
                        <button
                          aria-pressed={captionBackground === style}
                          className={settingsChipClass(captionBackground === style, true)}
                          key={style}
                          onClick={() => chooseCaptionBackground(style)}
                          type="button"
                        >
                          {style === 'cinematic' ? 'Cinematic' : style === 'boxed' ? 'Boxed' : 'Subtle'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-1">
                    <div aria-label="Caption position" className="space-y-1.5" role="group">
                      <p className="text-xs font-medium text-copy">Position</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(['bottom', 'top'] as const).map((position) => (
                          <button
                            aria-pressed={captionPosition === position}
                            className={settingsChipClass(captionPosition === position, true)}
                            key={position}
                            onClick={() => chooseCaptionPosition(position)}
                            type="button"
                          >
                            {position === 'bottom' ? 'Bottom' : 'Top'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div aria-label="Caption font" className="space-y-1.5" role="group">
                      <p className="text-xs font-medium text-copy">Font</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(['filscreen', 'sans'] as const).map((font) => (
                          <button
                            aria-pressed={captionFont === font}
                            className={settingsChipClass(captionFont === font, true)}
                            key={font}
                            onClick={() => chooseCaptionFont(font)}
                            type="button"
                          >
                            {font === 'filscreen' ? 'FilScreen' : 'Sans'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
              </div>
            </PlayerPanel>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="size-5 fill-current" viewBox="0 0 20 20">
      <path d="M3 2v16l14-8L3 2Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="size-5 fill-current" viewBox="0 0 20 20">
      <rect height="16" width="4.5" x="3" y="2" />
      <rect height="16" width="4.5" x="12.5" y="2" />
    </svg>
  )
}
