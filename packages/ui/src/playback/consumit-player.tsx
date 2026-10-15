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
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Moon,
  Music,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
  Server,
  Settings,
  SkipForward,
  SkipBack,
  TriangleAlert,
  Volume2,
  VolumeX,
  TimerReset,
} from 'lucide-react'

import { cn } from '../lib/cn'
import { CastPanel } from './cast-panel'
import { createNativeFullscreenCaptions } from './native-fullscreen-captions'
import { SubtitleAppearance, SubtitleSync } from './subtitle-panels'
import { standardQualityHeight } from './quality-tier'
import type { SkipSegment } from './media-source'
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
import type { MediaPreferences, ViewingPreferences } from './media-preferences'
import { createPlaybackControllerNext } from './playback-controller-next'
import type { EngineDeliveryFailure } from './media-engine'
import {
  clampSubtitleDelayMs,
  computeSyncDelayMs,
  fetchVttCues,
  formatSubtitleDelayMs,
  nativeLanguageName,
  canonicalSubtitleLanguage,
  parseVttCues,
  readStoredSubtitleDelayMs,
  readStoredSubtitleLanguages,
  SUBTITLE_DELAY_KEY,
  type SubtitleCue,
} from './subtitle-sync'
import {
  CAPTION_BACKGROUND_KEY,
  CAPTION_BACKGROUNDS,
  CAPTION_FONT_KEY,
  CAPTION_FONTS,
  CAPTION_POSITION_KEY,
  CAPTION_POSITIONS,
  CAPTION_SIZE_KEY,
  CAPTION_SIZES,
  FAVORITE_SERVERS_KEY,
  captionBackgroundClass,
  captionFontClass,
  captionSizeClass,
  dedupePlayerOptions,
  hasCursiveRtlScript,
  readFavoriteServers,
  readStoredCaption,
  readStoredNumber,
  readStoredString,
  settingsRowClass,
  storeValue,
  type CaptionBackground,
  type CaptionFont,
  type CaptionPosition,
  type CaptionSize,
} from './player-settings'
import { PlayerServerMenu } from './player-server-menu'
import { PlayerSubtitleMenu } from './player-subtitle-menu'
import { usePlayerMediaEvents } from './use-player-media-events'
import { usePlayerSkipSegments } from './use-player-skip-segments'
import type { PlayerMenuId, PlayerOption, PlayerSubtitleCandidate, PlayerSubtitleDiscovery } from './player-types'

export type { PlayerMenuId, PlayerOption, PlayerSubtitleCandidate, PlayerSubtitleDiscovery } from './player-types'

export type { CaptionBackground, CaptionFont, CaptionPosition, CaptionSize } from './player-settings'

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
  audioContinuityKey?: string | undefined
  onSeparateAudioSelect?: ((id: string) => Promise<SeparateAudioSource>) | undefined
  subtitleOptions?: readonly PlayerOption[] | undefined
  selectedSubtitle?: string | undefined
  onSubtitleChange?: ((value: string) => void) | undefined
  /** Called when captions are opened, so external search can stay lazy. */
  onSubtitleRequest?: (() => void) | undefined
  onSubtitleRefresh?: (() => void) | undefined
  subtitleDiscovery?: PlayerSubtitleDiscovery | undefined
  onSubtitlePage?: ((language: string, cursor: number) => Promise<{ tracks: PlayerSubtitleCandidate[]; total: number; nextCursor: number | null }>) | undefined
  onSubtitleSearch?: ((query: string, cursor: number) => Promise<{ tracks: PlayerSubtitleCandidate[]; total: number; nextCursor: number | null }>) | undefined
  onSubtitleCandidateSelect?: ((candidate: PlayerSubtitleCandidate) => Promise<{ id: string; label: string; language: string; url: string; cues?: readonly SubtitleCue[] | undefined }>) | undefined
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
  /** Optional title/episode timing lookup after this recording's duration is known. */
  onSkipSegmentsRequest?: ((durationSeconds: number, signal: AbortSignal) => Promise<readonly SkipSegment[]>) | undefined
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
  initialViewingPreferences?: ViewingPreferences | undefined
  onViewingPreferencesChange?: ((preferences: Partial<ViewingPreferences>) => void) | undefined
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

/**
 * Menus are keyed by `option.value`. Upstream subtitle sessions have produced
 * duplicate values (e.g. two `external:consumit-external-stellar-sub-0`
 * entries from a carried lease track plus its fresh twin), which React
 * reports as "Encountered two children with the same key". Dedupe by value
 * so a bad payload can never break menu identity; first occurrence wins to
 * keep selection stable.
 */
/** Set on the canary web deployment; Watch and embeds always use the same core. */
const useNextPlaybackCore = process.env.NEXT_PUBLIC_PLAYBACK_CORE === 'next'
const subscribeHydration = () => () => undefined
const clientHydrationSnapshot = () => true
const serverHydrationSnapshot = () => false

/**
 * FilScreen-flavored option chip for quality and speed: a real bordered chip
 * that reads selected through the signal-orange glow and ink contrast.
 */
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
  onSkipSegmentsRequest,
  backHref,
  brightness: controlledBrightness,
  caption,
  castAvailable = false,
  castConnected = false,
  onCastClick,
  onCastCheck,
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
  audioContinuityKey,
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
  initialViewingPreferences,
  onViewingPreferencesChange,
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
  onSubtitleRefresh,
  subtitleDiscovery,
  onSubtitlePage,
  onSubtitleSearch,
  onSubtitleCandidateSelect,
  onTimeUpdate,
  onVolumeChange,
  pauseFacts,
  pauseLogoUrl,
  pauseOverview,
  pauseTitle,
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
  const touchTap = useRef<{ at: number; timer: number } | null>(null)
  const touchClickGuard = useRef<number | undefined>(undefined)
  const suppressVideoClick = useRef(false)
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

  const [isMuted, setIsMuted] = useState(() => (typeof muted === 'boolean' ? muted : false))
  const [volume, setVolume] = useState(0.9)
  const [isPlaying, setIsPlaying] = useState(Boolean(autoPlay))
  const [browserFullscreen, setBrowserFullscreen] = useState(false)
  const nativeFullscreenCaptions = useRef<ReturnType<typeof createNativeFullscreenCaptions> | null>(null)
  const [viewportFullscreen, setViewportFullscreen] = useState(false)
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null)
  const isFullscreen = browserFullscreen || viewportFullscreen
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
  const separateContinuity = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (audioContinuityKey && separateContinuity.current === audioContinuityKey) return
    separateContinuity.current = audioContinuityKey
    separateSelection.current++; separateAudioPlayer.current?.reset(); setPreparingAudioId(null); setAudioPreparationError(null)
  }, [mediaSrc, audioContinuityKey])
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
  const [loadingSubtitleLanguages, setLoadingSubtitleLanguages] = useState<string[]>([])
  const subtitleLanguageRequests = useRef(new Set<string>())
  const subtitlePageGeneration = useRef(0)
  const subtitleLoadedRevision = useRef(new Map<string, string>())
  const subtitleSelectionGeneration = useRef(0)
  const [subtitleLanguageErrors, setSubtitleLanguageErrors] = useState<string[]>([])
  const [discoveredTracks, setDiscoveredTracks] = useState<Record<string, PlayerSubtitleCandidate[]>>({})
  const [nextSubtitleCursor, setNextSubtitleCursor] = useState<Record<string, number | null>>({})
  const [subtitleMenuError, setSubtitleMenuError] = useState<string | null>(null)
  const [preparingSubtitle, setPreparingSubtitle] = useState<string | null>(null)
  const [uploadedSubtitle, setUploadedSubtitle] = useState<{ id: string; label: string; language: string; url: string } | null>(null)
  const [uploadingSubtitle, setUploadingSubtitle] = useState(false)
  const subtitleUploadGeneration = useRef(0)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadedUrlRef = useRef<string | null>(null)
  useEffect(() => () => { subtitleUploadGeneration.current++; if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current) }, [])
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
  function rememberSubtitleCues(url: string, cues: readonly SubtitleCue[]) {
    const cache = subtitleCueCache.current
    cache.delete(url)
    cache.set(url, cues)
    while (cache.size > 5) {
      const oldest = [...cache.keys()].find(key => key !== url && key !== uploadedUrlRef.current)
      if (!oldest) break
      cache.delete(oldest)
    }
  }
  const [subtitleFileAttempt, setSubtitleFileAttempt] = useState(0)
  const [subtitleLoadFailure, setSubtitleLoadFailure] = useState<{ url: string; message: string } | null>(null)
  useEffect(() => {
    subtitlePageGeneration.current++
    subtitleLanguageRequests.current.clear()
    subtitleLoadedRevision.current.clear()
    ++searchGenerationRef.current
    clearTimeout(searchTimerRef.current)
    setDiscoveredTracks({})
    setNextSubtitleCursor({})
    setSubtitleLanguageErrors([])
    setLoadingSubtitleLanguages([])
    setSubtitleSearchResults([])
    setNextSearchCursor(null)
    setSearchingSubtitles(false)
    setOpenSubtitleLanguage(null)
  }, [subtitleDiscovery?.searchId])

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
    for (const language of subtitleDiscovery?.languages ?? []) {
      const code = canonicalSubtitleLanguage(language.code)
      counts.set(code, (counts.get(code) ?? 0) + language.count)
    }
    for (const option of subtitleOptions) {
      if (option.value === 'off') continue
      if (uploadedSubtitle && option.value === `external:consumit-external-${uploadedSubtitle.id}`) continue
      const code = canonicalSubtitleLanguage(option.language)
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    for (const track of extraSubtitles ?? []) {
      const code = canonicalSubtitleLanguage(track.language)
      if (preparedCandidateUrls.includes(track.url)) counts.set(code, Math.max(0, (counts.get(code) ?? 0) - 1))
    }
    return [...counts].map(([code, count]) => ({ code, count, discoveryCodes: [...new Set((subtitleDiscovery?.languages ?? []).filter((language) => canonicalSubtitleLanguage(language.code) === code).map((language) => language.code))] }))
      .sort((a, b) => {
        const aRank = subtitleLanguages.map(canonicalSubtitleLanguage).indexOf(a.code)
        const bRank = subtitleLanguages.map(canonicalSubtitleLanguage).indexOf(b.code)
        return (aRank === -1 ? 100 : aRank) - (bRank === -1 ? 100 : bRank) || nativeLanguageName(a.code, a.code).localeCompare(nativeLanguageName(b.code, b.code))
      })
  }, [subtitleDiscovery?.languages, subtitleOptions, subtitleLanguages, extraSubtitles, preparedCandidateUrls, uploadedSubtitle])
  const captionsOn = selectedSubtitle !== 'off'
  const {
    decodedWidth,
    decodedHeight,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    bufferedEnd,
    activeCue,
    isPip,
    metadataSource,
  } = usePlayerMediaEvents({
    videoRef,
    mediaSrc,
    source,
    children,
    captionsOn,
    selectedSubtitle,
    subtitleCues,
    subtitleDelayMs,
  })
  /* The inline video::cue rule suppresses native rendering to avoid duplicate
   * captions, so every selected cue uses Consumit's overlay. Native iOS
   * fullscreen switches to the dedicated showing-track bridge instead. */
  const overlayCueText = caption ?? (captionsOn ? activeCue || undefined : undefined)
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

  /* Skip-intro timing follows the resolved source; playback policy stays here. */
  const { activeSkip } = usePlayerSkipSegments({
    source,
    mediaSrc,
    metadataSource,
    duration,
    currentTime,
    hasError,
    onSkipSegmentsRequest,
  })
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

  const keyboardFocus = useRef(false)
  const hasKeyboardFocus = useCallback(() => {
    const focused = document.activeElement
    return focused instanceof HTMLElement && shellRef.current?.contains(focused) && keyboardFocus.current
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
      initialPreferences: initialViewingPreferences,
      preferenceChange: change => onViewingPreferencesChange?.(change),
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

  const automaticSubtitleAttempt = useRef<string | null>(null)
  const manualSubtitleIntent = useRef(false)
  useEffect(() => {
    if (!source || !initialViewingPreferences?.subtitlesEnabled || !onSubtitlePage || !onSubtitleCandidateSelect || !subtitleDiscovery?.languages.length || subtitleDiscovery.loading || manualSubtitleIntent.current) return
    const requested = initialViewingPreferences.subtitleLanguages
    const localRank = requested.findIndex(code => (engineState?.subtitles ?? []).some(track => canonicalSubtitleLanguage(track.language ?? '') === canonicalSubtitleLanguage(code)))
    const attempt = `${source.src}:${subtitleDiscovery.searchId ?? ''}`
    if (localRank === 0 || automaticSubtitleAttempt.current === attempt) return
    automaticSubtitleAttempt.current = attempt
    let active = true
    void (async () => {
      for (const language of requested.slice(0, localRank < 0 ? requested.length : localRank)) {
        const available = subtitleDiscovery.languages.filter(row => canonicalSubtitleLanguage(row.code) === canonicalSubtitleLanguage(language)).map(row => row.code)
        for (const code of available.slice(0, 2)) {
          if (!active || manualSubtitleIntent.current) return
          try {
            const page = await onSubtitlePage(code, 0)
            for (const candidate of page.tracks.slice(0, 2)) {
              if (!active || manualSubtitleIntent.current) return
              try {
                const track = await onSubtitleCandidateSelect(candidate)
                if (!active || manualSubtitleIntent.current) return
                const cues = track.cues ?? await fetchVttCues(track.url, AbortSignal.timeout(8000))
                if (!active || manualSubtitleIntent.current) return
                rememberSubtitleCues(track.url, cues)
                setPreparedCandidateIds(current => current.includes(candidate.id) ? current : [...current, candidate.id])
                setPreparedCandidateUrls(current => current.includes(track.url) ? current : [...current, track.url])
                // Arrival goes through normal automatic matching, preserving the preferred language order.
                controllerRef.current?.externalSubtitles([...allExternalSubtitles, track])
                return
              } catch { /* Try another candidate, then the next preferred language. */ }
            }
          } catch { /* Caption failures never stop playback. */ }
        }
      }
    })()
    return () => { active = false }
    // Opening preferences are immutable for a Watch instance; discovery must finish before one bounded pass.
  }, [source?.src, subtitleDiscovery?.loading, subtitleDiscovery?.searchId])

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
    const onFullscreenChange = () => setBrowserFullscreen(Boolean(document.fullscreenElement))
    const video = videoRef.current
    if (video) nativeFullscreenCaptions.current = createNativeFullscreenCaptions(video)
    const entered = () => { nativeFullscreenCaptions.current?.enter(); setBrowserFullscreen(true) }
    const exited = () => { nativeFullscreenCaptions.current?.leave(); setBrowserFullscreen(false) }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    video?.addEventListener('webkitbeginfullscreen', entered)
    video?.addEventListener('webkitendfullscreen', exited)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      video?.removeEventListener('webkitbeginfullscreen', entered)
      video?.removeEventListener('webkitendfullscreen', exited)
      nativeFullscreenCaptions.current?.destroy()
      nativeFullscreenCaptions.current = null
    }
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!viewportFullscreen || !shell) return
    const body = document.body
    const page = document.documentElement
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const scroll = { x: window.scrollX, y: window.scrollY }
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, pageOverflow: page.style.overflow }
    // iPhone video-only fullscreen excludes sibling captions and controls.
    // Keep the same video and overlay in a viewport-filling player instead.
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `${-scroll.y}px`
    body.style.left = `${-scroll.x}px`
    body.style.width = '100%'
    page.style.overflow = 'hidden'
    const background: Array<{ element: HTMLElement; inert: boolean }> = []
    let ancestor: HTMLElement | null = shell
    while (ancestor?.parentElement) {
      for (const sibling of ancestor.parentElement.children) {
        if (sibling !== ancestor && sibling instanceof HTMLElement) {
          background.push({ element: sibling, inert: sibling.inert })
          sibling.inert = true
        }
      }
      ancestor = ancestor.parentElement
      if (ancestor === body) break
    }
    if (!shell.contains(document.activeElement)) shell.querySelector<HTMLElement>('[aria-label="Exit fullscreen"]')?.focus({ preventScroll: true })
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setViewportFullscreen(false)
      setControlsVisible(true)
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('keydown', escape)
      for (const { element, inert } of background) element.inert = inert
      body.style.overflow = previous.overflow
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.width = previous.width
      page.style.overflow = previous.pageOverflow
      if (window.scrollX !== scroll.x || window.scrollY !== scroll.y) window.scrollTo(scroll.x, scroll.y)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [viewportFullscreen])

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
      if (touchTap.current) window.clearTimeout(touchTap.current.timer)
      if (touchClickGuard.current != null) window.clearTimeout(touchClickGuard.current)
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
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitExitFullscreen?: () => void }) | null
    if (!shell) return
    pokeControls()
    setFullscreenNotice(null)
    if (viewportFullscreen) {
      setViewportFullscreen(false)
      return
    }
    try {
      if (video?.hasAttribute('data-native-fullscreen')) {
        video.webkitExitFullscreen?.()
        return
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      if (shell.requestFullscreen && document.fullscreenEnabled !== false) {
        try { await shell.requestFullscreen(); return } catch { /* Keep captions in the complete player fallback. */ }
      }
      if (video?.webkitEnterFullscreen) {
        nativeFullscreenCaptions.current?.update({ value: selectedSubtitle, cues: activeSubtitleUrl ? subtitleCueCache.current.get(activeSubtitleUrl) ?? [] : [], delayMs: subtitleDelayMs })
        nativeFullscreenCaptions.current?.enter()
        try { video.webkitEnterFullscreen(); return }
        catch {
          nativeFullscreenCaptions.current?.leave()
          setFullscreenNotice('Fullscreen could not open. Tap fullscreen to try again.')
          return
        }
      }
      setViewportFullscreen(true)
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

  async function chooseAudio(value: string) {
    void volumeBoostController.current?.unlock().catch(() => {})
    if (!controllerRef.current || suppliedAudioOptions) { onAudioChange?.(value); closeMenu(); return }
    const generation = ++separateSelection.current
    setPreparingAudioId(null); setAudioPreparationError(null)
    const ok = await controllerRef.current?.audio(value)
    if (generation !== separateSelection.current) return
    if (!ok) {
      const fallback = unifiedAudio.find(option => option.stream.some(track => track.value === value))?.separate[0]
      if (fallback) await chooseSeparateAudio(fallback.id)
      return
    }
    separateAudioPlayer.current?.reset()
    if (!controlledAudio) setInternalAudio(value)
    onAudioChange?.(value)
    closeMenu()
  }
  async function chooseSeparateAudio(id: string) {
    if (!onSeparateAudioSelect || !separateAudioPlayer.current) return
    const generation = ++separateSelection.current
    setPreparingAudioId(id); setAudioPreparationError(null)
    // Resume Web Audio during the selection gesture, before network work.
    const video = videoRef.current
    const unlock = video ? (volumeBoostController.current ??= createVolumeBoost(video)).unlock() : Promise.resolve()
    const candidates = unifiedAudio.find(option => option.separate.some(track => track.id === id))?.separate ?? []
    try {
      await unlock
      for (const candidate of candidates.length ? candidates : [{ id }]) {
        try {
          const track = await onSeparateAudioSelect(candidate.id)
          if (generation !== separateSelection.current) return
          const activated = await separateAudioPlayer.current?.select(track)
          if (generation !== separateSelection.current) return
          if (activated) {
            await separateAudioPlayer.current?.boost(volumeBoost)
            onViewingPreferencesChange?.({ audioLanguage: track.language })
            return
          }
          if (separateAudioPlayer.current?.needsGesture()) return
        } catch { if (generation !== separateSelection.current) return }
      }
      setAudioPreparationError('No compatible recording of this language could start. Your previous audio is still selected.')
    } catch {
      if (generation === separateSelection.current) setAudioPreparationError('This audio is unavailable right now. Your current audio is still playing.')
    } finally { if (generation === separateSelection.current) setPreparingAudioId(null) }
  }

  function chooseSubtitle(value: string) {
    subtitleSelectionGeneration.current++
    manualSubtitleIntent.current = true
    controllerRef.current?.subtitle(value)
    if (!controlledSubtitle) setInternalSubtitle(value)
    storeValue('consumit.player.subtitles', value)
    onSubtitleChange?.(value)
    closeMenu()
  }

  async function loadSubtitleLanguage(language: string, more = false) {
    if (!onSubtitlePage || subtitleLanguageRequests.current.has(language)) return
    subtitleLanguageRequests.current.add(language)
    const generation = subtitlePageGeneration.current
    const revision = `${subtitleDiscovery?.searchId ?? ''}:${subtitleDiscovery?.loading ? 'loading' : 'ready'}`
    setLoadingSubtitleLanguages((current) => [...current, language])
    setSubtitleLanguageErrors((current) => current.filter((code) => code !== language))
    try {
      const codes = subtitleLanguageRows.find((row) => row.code === language)?.discoveryCodes ?? []
      const rawCodes = codes.length ? codes : [language]
      const results = await Promise.allSettled(rawCodes.filter((code) => !more || nextSubtitleCursor[code] != null).map(async (code) => ({ code, page: await onSubtitlePage(code, more ? nextSubtitleCursor[code] ?? 0 : 0) })))
      if (generation !== subtitlePageGeneration.current) return
      subtitleLoadedRevision.current.set(language, revision)
      const pages = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      if (results.some((result) => result.status === 'rejected')) setSubtitleLanguageErrors((current) => [...current, language])
      setDiscoveredTracks((current) => {
        const merged = [...(more || pages.length !== results.length ? current[language] ?? [] : []), ...pages.flatMap(({ page }) => page.tracks)]
        const seen = new Set<string>()
        return { ...current, [language]: merged.filter((track) => { if (seen.has(track.id)) return false; seen.add(track.id); return true }) }
      })
      setNextSubtitleCursor((current) => ({ ...current, ...Object.fromEntries(pages.map(({ code, page }) => [code, page.nextCursor])) }))
    } catch { if (generation === subtitlePageGeneration.current) { subtitleLoadedRevision.current.set(language, revision); setSubtitleLanguageErrors((current) => [...current, language]) } }
    finally {
      if (generation === subtitlePageGeneration.current) {
        subtitleLanguageRequests.current.delete(language)
        setLoadingSubtitleLanguages((current) => current.filter((code) => code !== language))
      }
    }
  }

  // A language opened while providers were still answering must refresh
  // after completion; its earlier page/cursor may otherwise hide late tracks.
  useEffect(() => {
    if (subtitleDiscovery?.loading || !openSubtitleLanguage) return
    const revision = `${subtitleDiscovery?.searchId ?? ''}:ready`
    if (subtitleLoadedRevision.current.get(openSubtitleLanguage) !== revision && !subtitleLanguageRequests.current.has(openSubtitleLanguage)) void loadSubtitleLanguage(openSubtitleLanguage)
  }, [subtitleDiscovery?.loading, subtitleDiscovery?.searchId, openSubtitleLanguage, loadingSubtitleLanguages])

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
    setSearchingSubtitles(Boolean(onSubtitleSearch))
    if (onSubtitleSearch) searchTimerRef.current = setTimeout(() => { void runSubtitleSearch(query) }, 200)
  }

  async function selectDiscoveredSubtitle(candidate: PlayerSubtitleCandidate) {
    if (!onSubtitleCandidateSelect || preparingSubtitle) return
    setPreparingSubtitle(candidate.id)
    const generation = ++subtitleSelectionGeneration.current
    manualSubtitleIntent.current = true
    setSubtitleMenuError(null)
    try {
      const track = await onSubtitleCandidateSelect(candidate)
      const cues = track.cues ?? await fetchVttCues(track.url, AbortSignal.timeout(8000))
      if (generation !== subtitleSelectionGeneration.current) return
      rememberSubtitleCues(track.url, cues)
      setPreparedCandidateIds((current) => (current.includes(candidate.id) ? current : [...current, candidate.id]))
      setPreparedCandidateUrls((current) => current.includes(track.url) ? current : [...current, track.url])
      controllerRef.current?.externalSubtitles([...allExternalSubtitles, track])
      chooseSubtitle(`external:consumit-external-${track.id}`)
    } catch { if (generation === subtitleSelectionGeneration.current) setSubtitleMenuError('This subtitle could not be prepared. Choose another track.') }
    finally { setPreparingSubtitle(null) }
  }

  async function uploadSubtitle(file: File | undefined) {
    if (!file) return
    const generation = ++subtitleUploadGeneration.current
    setSubtitleMenuError(null)
    if (file.size > 2 * 1024 * 1024 || !/\.(srt|vtt)$/i.test(file.name)) {
      setUploadingSubtitle(false)
      setSubtitleMenuError('Choose an SRT or VTT file up to 2 MB.')
      return
    }
    setUploadingSubtitle(true)
    try {
      const source = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
      if (generation !== subtitleUploadGeneration.current) return
      const vtt = /\.srt$/i.test(file.name)
        ? `WEBVTT\n\n${source.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
        : source
      const cues = parseVttCues(vtt)
      if (!vtt.startsWith('WEBVTT') || cues.length === 0) throw new Error('invalid')
      const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
      const track = { id: `upload-${generation}`, label: file.name.slice(0, 100), language: 'und', url }
      if (uploadedUrlRef.current) {
        subtitleCueCache.current.delete(uploadedUrlRef.current)
        URL.revokeObjectURL(uploadedUrlRef.current)
      }
      // We already have the whole local file. Keep its cues instead of
      // relying on another blob fetch or the browser's track loader.
      rememberSubtitleCues(url, cues)
      uploadedUrlRef.current = url
      setUploadedSubtitle(track)
      controllerRef.current?.externalSubtitles([...allExternalSubtitles.filter((entry) => entry.id !== uploadedSubtitle?.id), track])
      chooseSubtitle(`external:consumit-external-${track.id}`)
    } catch { if (generation === subtitleUploadGeneration.current) setSubtitleMenuError('This file has no usable subtitle cues.') }
    finally { if (generation === subtitleUploadGeneration.current) setUploadingSubtitle(false) }
  }

  function toggleSubtitlesSwitch() {
    subtitleSelectionGeneration.current++
    manualSubtitleIntent.current = true
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
    setSubtitleCues([])
    setSubtitleLoadFailure(null)
    // No AbortController on purpose (see watch-playback subtitle effect):
    // a bounded timeout signal plus the `cancelled` guard gives the same
    // behavior with no abort() call site for dev overlays to blame.
    void fetchVttCues(activeSubtitleUrl, AbortSignal.timeout(8000))
      .catch(() => fetchVttCues(activeSubtitleUrl, AbortSignal.timeout(8000)))
      .then((cues) => {
        if (cancelled) return
        rememberSubtitleCues(activeSubtitleUrl, cues)
        setSubtitleCues(cues)
      })
      .catch(() => {
        if (!cancelled) { setSubtitleCues([]); setSubtitleLoadFailure({ url: activeSubtitleUrl, message: 'This subtitle file could not load. Retry it or choose another track.' }) }
      })
    return () => { cancelled = true }
  }, [captionsOn, activeSubtitleUrl, subtitleFileAttempt])
  const subtitleLoadError = captionsOn && subtitleLoadFailure && subtitleLoadFailure.url === activeSubtitleUrl && !activeCue ? subtitleLoadFailure.message : null

  useEffect(() => {
    nativeFullscreenCaptions.current?.update({ value: selectedSubtitle, cues: activeSubtitleUrl ? subtitleCueCache.current.get(activeSubtitleUrl) ?? [] : [], delayMs: subtitleDelayMs })
  }, [selectedSubtitle, activeSubtitleUrl, subtitleCues, subtitleDelayMs, allExternalSubtitles])

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
        viewportFullscreen && 'consumit-player-viewport-fullscreen',
        className,
      )}
      data-consumit-player
      data-player-core={useNextPlaybackCore ? 'next' : 'legacy'}
      data-controls-visible={chromeVisible ? 'true' : 'false'}
      data-fullscreen={isFullscreen ? 'true' : 'false'}
      data-viewport-fullscreen={viewportFullscreen ? 'true' : undefined}
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
      {fullscreenNotice ? <p className="px-4 py-2 text-xs leading-5 text-copy" role="alert">{fullscreenNotice}</p> : null}
      {subtitleLoadError ? <p className="px-4 py-2 text-xs leading-5 text-copy" role="alert">{subtitleLoadError} <button className="min-h-11 px-2 text-ink underline" onClick={() => setSubtitleFileAttempt(attempt => attempt + 1)} type="button">Retry subtitle</button><button className="min-h-11 px-2 text-ink underline" onClick={() => toggleMenu('subtitles')} type="button">Choose subtitles</button></p> : null}
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
        onPointerDown={() => { keyboardFocus.current = false; pokeControls() }}
        onTouchStart={pokeControls}
        onFocusCapture={(event) => { keyboardFocus.current = event.target.matches(':focus-visible'); pokeControls() }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) { keyboardFocus.current = false; scheduleHide() }
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
          onClick={() => {
            if (suppressVideoClick.current) {
              suppressVideoClick.current = false
              if (touchClickGuard.current != null) window.clearTimeout(touchClickGuard.current)
              touchClickGuard.current = undefined
              return
            }
            void togglePlayback()
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== 'touch') return
            suppressVideoClick.current = true
            if (touchClickGuard.current != null) window.clearTimeout(touchClickGuard.current)
            touchClickGuard.current = window.setTimeout(() => {
              suppressVideoClick.current = false
              touchClickGuard.current = undefined
            }, 350)

            const now = Date.now()
            const previousTap = touchTap.current
            if (previousTap && now - previousTap.at <= 280) {
              window.clearTimeout(previousTap.timer)
              touchTap.current = null
              const bounds = event.currentTarget.getBoundingClientRect()
              const position = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0.5
              if (position < 0.45) seekBy(-SEEK_STEP)
              else if (position > 0.55) seekBy(SEEK_STEP)
              else void togglePlayback()
              return
            }

            const timer = window.setTimeout(() => {
              touchTap.current = null
              void togglePlayback()
            }, 250)
            touchTap.current = { at: now, timer }
          }}
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
            {onBack || backHref ? <div className="pointer-events-auto grid w-11 shrink-0 place-items-center">
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
            </div> : null}
            <div className="min-w-0 flex-1 text-center" data-player-title>
              <p data-player-heading className="truncate font-display font-normal tracking-[-0.02em] text-ink drop-shadow-md" title={title}>{title}</p>
              {topMeta ?? (startupPending ? preparationMeta : undefined) ? <p className="mt-0.5 truncate text-xs leading-4 tabular-nums text-muted drop-shadow-sm">{topMeta ?? preparationMeta}</p> : null}
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
              ) : !showTopBar ? <p className="consumit-player-preparation-title font-display text-ink">{title}</p> : null}
              {!showTopBar && (preparationMeta ?? topMeta) ? <p className="mt-3 text-sm text-copy">{preparationMeta ?? topMeta}</p> : null}
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
                  <span className="sr-only">{pauseTitle ?? title}</span>
                </>
              ) : (
                <p className="font-display text-4xl leading-tight font-normal tracking-tight text-balance text-ink">{pauseTitle ?? title}</p>
              )}
              {pauseFacts ? <p className="mt-2.5 text-sm tabular-nums text-copy">{pauseFacts}</p> : null}
              {pauseOverview ? <p className="mt-2.5 line-clamp-3 max-w-[62ch] text-sm leading-6 text-copy">{pauseOverview}</p> : null}
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

        {activeSkip && (!autoSkip || !isPlaying) && hasSource && !hasError ? (
          <div className="absolute right-4 bottom-44 z-20 sm:right-6 sm:bottom-48">
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
            <p className="shrink-0 tabular-nums text-muted drop-shadow-sm">
              {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
            </p>
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

          <div className="mt-2 flex items-center justify-between gap-2" data-player-control-row>
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2" data-player-transport>
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
                data-player-skip-button="backward"
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
                data-player-skip-button="forward"
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
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-none sm:gap-2" data-player-actions>
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
                  <TimerReset aria-hidden="true" className="size-5" strokeWidth={1.75} />
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
              <PlayerIconButton
                  active={castConnected}
                  disabled={!hasSource}
                  label={castConnected ? 'Disconnect from TV' : 'Cast to TV'}
                  expanded={activeMenu === 'cast'}
                  menuId={castConnected ? undefined : 'cast'}
                  onClick={() => castConnected ? onCastClick?.() : toggleMenu('cast')}
                  title={castConnected ? 'Casting — select to disconnect' : 'Cast to TV'}
                >
                  <Cast aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </PlayerIconButton>
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
        {activeMenu === 'cast' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Cast to TV" id="consumit-player-menu-cast" onClose={closeMenu} title="Cast to TV">
              <CastPanel available={castAvailable} onCheck={onCastCheck} onConnect={onCastClick ? () => { closeMenu(); onCastClick() } : undefined} />
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'settings' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Settings options" id="consumit-player-menu-settings" onClose={closeMenu} title="Settings">
              <div className="p-3">
                <div className="space-y-1">
                  <PlayerSettingRow icon={<QualityIcon className="size-5" />} label="Quality" value={decodedHeight > 0 ? `${selectedQuality === 'auto' ? 'Auto · ' : ''}${standardQualityHeight(decodedHeight, decodedWidth)}p` : qualityOptions.find((option) => option.value === selectedQuality)?.label ?? 'Auto'} onClick={() => setActiveMenu('quality')} />
                  <PlayerSettingRow icon={<Server className="size-5" />} label="Server" value={serverAuto ? 'Auto' : currentServerLabel ?? orderedServerOptions?.[0]?.label ?? 'Unavailable'} disabled={!onServerRequest && !dedupedServerOptions?.length} onClick={() => toggleMenu('server')} />
                  <PlayerSettingRow icon={<Captions className="size-5" />} label="Subtitles" value={captionsOn ? (subtitleOptions.find((option) => option.value === selectedSubtitle)?.label || 'On') : 'Off'} onClick={() => toggleMenu('subtitles')} />
                  <PlayerSettingRow icon={<Music className="size-5" />} label="Audio" value={selectedAudioLabel} onClick={() => setActiveMenu('audio')} />
                </div>
                <div className="consumit-player-panel-section">
                  <PlayerSettingRow icon={<Gauge className="size-5" />} label="Playback settings" value={selectedRate === 1 ? 'Normal speed' : selectedRate + '×'} onClick={() => setActiveMenu('playback')} />
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
                  {separateState.needsGesture ? <button className={settingsRowClass(false)} onClick={() => { const unlock = volumeBoostController.current?.unlock(); const enable = separateAudioPlayer.current?.enable(); void Promise.all([unlock, enable]).then(() => { const track = separateAudioPlayer.current?.currentTrack(); if (track) onViewingPreferencesChange?.({ audioLanguage: track.language }) }, () => setAudioPreparationError('Your browser could not enable audio. Keep the current sound or try again.')) }} type="button">Enable audio</button> : null}
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
                {decodedHeight > 0 ? <p className="px-2 pb-2 text-xs text-copy" role="status">Playing at {decodedWidth} × {decodedHeight}</p> : null}
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
          <PlayerServerMenu
            menuRef={menuRef}
            model={{
              auto: Boolean(serverAuto),
              busy: Boolean(serverBusy),
              loading: Boolean(serverLoading),
              error: serverError ?? null,
              currentLabel: currentServerLabel,
              selected: selectedServer,
              firstServer: orderedServerOptions?.[0]?.value,
              hasOtherServers: Boolean(dedupedServerOptions?.some((option) => option.value !== selectedServer)),
              favorites: favoriteServers,
              groups: serverGroups ?? [],
            }}
            actions={{
              chooseAuto: onServerAuto ? () => { onServerAuto(); closeMenu() } : undefined,
              chooseServer,
              toggleFavorite: toggleFavoriteServer,
              retry: onServerRequest,
              close: closeMenu,
              back: () => setActiveMenu('settings'),
            }}
          />
        ) : null}
        {activeMenu === 'sync' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Subtitle sync" backLabel="Back to subtitles" id="consumit-player-menu-sync" onClose={closeMenu} onBack={() => toggleMenu('subtitles')} title="Subtitle sync">
              <SubtitleSync delay={subtitleDelayMs} cues={syncCueWindow.visible} activeIndex={syncCueWindow.activeIndex} captionsOn={captionsOn} status={syncStatus} listRef={syncListRef} onHover={setSyncHovering} onCue={syncToCue} onAdjust={(delta) => { adjustSubtitleDelayMs(delta); flashSyncStatus(delta < 0 ? 'Adjusted −50ms' : 'Adjusted +50ms') }} onReset={() => { chooseSubtitleDelayMs(0); flashSyncStatus('Offset reset') }} />
            </PlayerPanel>
          </div>
        ) : null}
        {activeMenu === 'subtitles' ? (
          <PlayerSubtitleMenu
            menuRef={menuRef}
            uploadInputRef={uploadInputRef}
            model={{
              trackCount: subtitleTrackCount,
              subtitleNotice: engineState?.subtitleNotice,
              discovery: subtitleDiscovery,
              menuError: subtitleMenuError,
              loadError: subtitleLoadError,
              search: subtitleSearch,
              options: subtitleOptions,
              selected: selectedSubtitle,
              searchResults: subtitleSearchResults,
              searching: searchingSubtitles,
              nextSearchCursor,
              preparingId: preparingSubtitle,
              uploading: uploadingSubtitle,
              uploadedSubtitle,
              isRepresentedCandidate,
              languages: subtitleLanguageRows.map(({ code, count, discoveryCodes }) => {
                const languageError = subtitleLanguageErrors.includes(code)
                return {
                  code,
                  count,
                  discoveryCodes,
                  opened: openSubtitleLanguage === code,
                  options: subtitleOptions.filter((option) => option.value !== 'off' && option.value !== `external:consumit-external-${uploadedSubtitle?.id}` && canonicalSubtitleLanguage(option.language) === code),
                  tracks: (discoveredTracks[code] ?? []).filter((track) => !isRepresentedCandidate(track)),
                  loading: loadingSubtitleLanguages.includes(code),
                  failed: languageError,
                  hasMore: !languageError && (discoveryCodes.length ? discoveryCodes : [code]).some((raw) => nextSubtitleCursor[raw] != null),
                }
              }),
            }}
            actions={{
              close: closeMenu,
              back: () => setActiveMenu('settings'),
              chooseSubtitle,
              changeSearch: changeSubtitleSearch,
              runSearch: (query, cursor) => { void runSubtitleSearch(query, cursor) },
              selectCandidate: (candidate) => { void selectDiscoveredSubtitle(candidate) },
              requestDiscovery: onSubtitleRefresh ?? onSubtitleRequest,
              retryFile: () => setSubtitleFileAttempt(attempt => attempt + 1),
              toggleLanguage: (code, opened) => {
                setOpenSubtitleLanguage(opened ? null : code)
                if (!opened && onSubtitlePage && !discoveredTracks[code]) void loadSubtitleLanguage(code)
              },
              retryLanguage: (code) => { void loadSubtitleLanguage(code) },
              loadMoreLanguage: (code) => { void loadSubtitleLanguage(code, true) },
              openAppearance: () => setActiveMenu('appearance'),
              openSync: () => setActiveMenu('sync'),
              upload: (file) => { void uploadSubtitle(file) },
            }}
          />
        ) : null}
        {activeMenu === 'appearance' ? (
          <div className="contents" ref={menuRef}>
            <PlayerPanel aria-label="Subtitle appearance" backLabel="Back to subtitles" id="consumit-player-menu-appearance" onBack={() => setActiveMenu('subtitles')} onClose={closeMenu} title="Subtitle appearance" heading="Appearance">
              <SubtitleAppearance size={captionSize} background={captionBackground} position={captionPosition} font={captionFont} preview={<p className={cn('text-center leading-snug [unicode-bidi:plaintext]', captionSizeClass(captionSize, false), captionFontClass(captionFont), captionBackgroundClass(captionBackground))}>Your subtitles will look like this.</p>} onSize={chooseCaptionSize} onBackground={chooseCaptionBackground} onPosition={chooseCaptionPosition} onFont={chooseCaptionFont} />
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
