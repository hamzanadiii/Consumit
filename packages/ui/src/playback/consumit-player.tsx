'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import {
  AudioLines,
  Captions,
  CaptionsOff,
  Check,
  ChevronLeft,
  Loader2,
  Maximize,
  Minimize,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
  SunMedium,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react'

import { cn } from '../lib/cn'
import { MissingArtwork } from '../media/media'
import {
  attachDirectMedia,
  formatPlaybackTime,
  type ChapterCue,
  type DirectMediaSource,
} from './media-source'

export type PlayerMenuId = 'audio' | 'display' | 'subtitles'

export type PlayerOption = {
  detail?: string | undefined
  label: string
  value: string
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
  /** When set, renders the prototype top bar: back control, title context, brand mark. */
  backHref?: string | undefined
  onBack?: (() => void) | undefined
  /** Secondary top-line context, e.g. "Playing from Consumit · 4K". */
  topMeta?: ReactNode | undefined
  brandSrc?: string | undefined
  chapters?: readonly ChapterCue[] | undefined
  /** Small label beside the volume slider, e.g. "English audio". */
  audioLabel?: string | undefined
  audioOptions?: readonly PlayerOption[] | undefined
  selectedAudio?: string | undefined
  onAudioChange?: ((value: string) => void) | undefined
  subtitleOptions?: readonly PlayerOption[] | undefined
  selectedSubtitle?: string | undefined
  onSubtitleChange?: ((value: string) => void) | undefined
  /** Current cue text rendered in the prototype subtitle bar. Native <track> cues still render natively. */
  caption?: string | undefined
  qualityOptions?: readonly PlayerOption[] | undefined
  selectedQuality?: string | undefined
  onQualityChange?: ((value: string) => void) | undefined
  playbackRates?: readonly number[] | undefined
  selectedRate?: number | undefined
  onRateChange?: ((value: number) => void) | undefined
  brightness?: number | undefined
  onBrightnessChange?: ((value: number) => void) | undefined
  /** Inactivity delay before the control chrome fades. */
  autoHideMs?: number | undefined
  onRetry?: (() => void) | undefined
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
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-control outline-none transition-colors motion-reduce:transition-none',
        'hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange',
        'disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent',
        active ? 'text-orange' : 'text-ink',
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
  audioLabel,
  audioOptions = DEFAULT_AUDIO,
  autoHideMs = 3000,
  backHref,
  brandSrc = '/assets/consumit-mark.svg',
  brightness: controlledBrightness,
  caption,
  chapters,
  children,
  className,
  muted,
  onAudioChange,
  onBack,
  onBrightnessChange,
  onDurationChange,
  onPause,
  onPlay,
  onQualityChange,
  onRateChange,
  onRetry,
  onSubtitleChange,
  onTimeUpdate,
  onVolumeChange,
  playbackRates = DEFAULT_RATES,
  posterSrc,
  preload = 'metadata',
  qualityOptions = DEFAULT_QUALITIES,
  selectedAudio: controlledAudio,
  selectedQuality: controlledQuality,
  selectedRate: controlledRate,
  selectedSubtitle: controlledSubtitle,
  source,
  src,
  status,
  statusTone = 'neutral',
  subtitleOptions = DEFAULT_SUBTITLES,
  title,
  topMeta,
  videoClassName,
  ...props
}: ConsumitPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  const detachRef = useRef<(() => void) | undefined>(undefined)
  const attachmentTaskRef = useRef<Promise<void>>(Promise.resolve())
  const menuRef = useRef<HTMLDivElement>(null)

  const mediaSrc = source?.src ?? (typeof src === 'string' ? src : undefined)
  const hasSource = Boolean(mediaSrc || children)
  const showTopBar = backHref != null || onBack != null || topMeta != null

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof muted === 'boolean') return muted
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('consumit.player.muted') === '1'
    } catch {
      return false
    }
  })
  const [volume, setVolume] = useState(() => (typeof window === 'undefined' ? 0.9 : readStoredNumber('consumit.player.volume', 0.9, 0, 1)))
  const [isPlaying, setIsPlaying] = useState(Boolean(autoPlay))
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<PlayerMenuId | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)

  const [internalAudio, setInternalAudio] = useState(() => audioOptions[0]?.value ?? 'english')
  const [internalSubtitle, setInternalSubtitle] = useState(() =>
    typeof window === 'undefined' ? 'english' : readStoredString('consumit.player.subtitles', 'english'),
  )
  const [internalQuality, setInternalQuality] = useState(() => qualityOptions[0]?.value ?? 'auto')
  const [internalRate, setInternalRate] = useState(() =>
    typeof window === 'undefined' ? 1 : readStoredNumber('consumit.player.rate', 1, 0.25, 4),
  )
  const [internalBrightness, setInternalBrightness] = useState(() =>
    typeof window === 'undefined' ? 1 : readStoredNumber('consumit.player.brightness', 1, 0.6, 1.3),
  )

  const selectedAudio = controlledAudio ?? internalAudio
  const selectedSubtitle = controlledSubtitle ?? internalSubtitle
  const selectedQuality = controlledQuality ?? internalQuality
  const selectedRate = controlledRate ?? internalRate
  const brightness = controlledBrightness ?? internalBrightness
  const captionsOn = selectedSubtitle !== 'off'

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
  const selectedAudioLabel = audioOptions.find((option) => option.value === selectedAudio)?.label
  const volumeLabel = audioLabel ?? (selectedAudioLabel ? `${selectedAudioLabel} audio` : undefined)
  const pipSupported = typeof window !== 'undefined' && typeof document !== 'undefined' && 'pictureInPictureEnabled' in document

  const pokeControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    hideTimer.current = undefined
  }, [])

  const scheduleHide = useCallback(() => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), autoHideMs)
  }, [autoHideMs])

  /* Attach an authorized source through the adapter seam. The legacy `src`
     prop stays a caller-owned passthrough for deterministic fixtures. */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !source) return
    let cancelled = false
    const attach = attachmentTaskRef.current
      .catch(() => undefined)
      .then(async () => {
        if (cancelled) return
        detachRef.current?.()
        detachRef.current = undefined
        setHasError(false)
        setErrorMessage(null)
        const detach = await attachDirectMedia(video, source)
        if (cancelled) {
          detach()
          return
        }
        detachRef.current = detach
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setHasError(true)
        setErrorMessage(error instanceof Error ? error.message : 'This source could not be attached.')
      })
    attachmentTaskRef.current = attach
    return () => {
      cancelled = true
    }
  }, [source])

  useEffect(
    () => () => {
      detachRef.current?.()
      detachRef.current = undefined
    },
    [],
  )

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
    if (!video) return
    try {
      for (const track of Array.from(video.textTracks)) {
        if (track.kind === 'subtitles' || track.kind === 'captions') track.mode = captionsOn ? 'showing' : 'hidden'
      }
    } catch {
      /* subtitle tracks are enhancement-only */
    }
  }, [captionsOn, children])

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
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
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
        setActiveMenu(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [activeMenu])

  useEffect(
    () => () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  async function togglePlayback() {
    const video = videoRef.current
    if (!video || !hasSource || hasError) return
    pokeControls()
    if (video.paused || video.ended) {
      try {
        await video.play()
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
        await shell.requestFullscreen()
        return
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
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (pipVideo.requestPictureInPicture && !pipVideo.disablePictureInPicture) {
        await pipVideo.requestPictureInPicture()
      }
    } catch {
      /* PiP denial keeps inline playback */
    }
  }

  function toggleMenu(menu: PlayerMenuId) {
    pokeControls()
    setActiveMenu((current) => (current === menu ? null : menu))
  }

  function chooseAudio(value: string) {
    if (!controlledAudio) setInternalAudio(value)
    onAudioChange?.(value)
    setActiveMenu(null)
  }

  function chooseSubtitle(value: string) {
    if (!controlledSubtitle) setInternalSubtitle(value)
    storeValue('consumit.player.subtitles', value)
    onSubtitleChange?.(value)
    setActiveMenu(null)
  }

  function chooseQuality(value: string) {
    if (!controlledQuality) setInternalQuality(value)
    onQualityChange?.(value)
    setActiveMenu(null)
  }

  function chooseRate(value: number) {
    if (!controlledRate) setInternalRate(value)
    storeValue('consumit.player.rate', String(value))
    onRateChange?.(value)
    setActiveMenu(null)
  }

  function changeBrightness(next: number) {
    const clamped = Math.min(1.3, Math.max(0.6, next))
    if (controlledBrightness == null) setInternalBrightness(clamped)
    storeValue('consumit.player.brightness', String(clamped))
    onBrightnessChange?.(clamped)
  }

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
      className={cn('overflow-hidden rounded-card border border-border bg-black', className)}
      data-consumit-player
      data-controls-visible={chromeVisible ? 'true' : 'false'}
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
        className="relative aspect-video overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange"
        onKeyDown={onShellKeyDown}
        onMouseMove={pokeControls}
        onPointerDown={pokeControls}
        onTouchStart={pokeControls}
        role="region"
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
            if (hasSource) {
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
          onPlaying={() => setIsBuffering(false)}
          onSeeking={() => setIsBuffering(true)}
          onSeeked={() => setIsBuffering(false)}
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

        {showTopBar ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-[linear-gradient(180deg,rgba(9,9,11,0.78),transparent)] px-4 pt-4 pb-10 transition-opacity motion-reduce:transition-none sm:px-6',
              chromeVisible ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="pointer-events-auto flex min-w-0 items-start gap-3">
              {onBack ? (
                <button
                  aria-label="Back"
                  className="grid size-11 shrink-0 place-items-center rounded-control text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange"
                  onClick={onBack}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="size-7" strokeWidth={1.5} />
                </button>
              ) : backHref ? (
                <a
                  aria-label="Back"
                  className="grid size-11 shrink-0 place-items-center rounded-control text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange"
                  href={backHref}
                >
                  <ChevronLeft aria-hidden="true" className="size-7" strokeWidth={1.5} />
                </a>
              ) : null}
              <div className="min-w-0 pt-1">
                <p className="truncate text-sm font-bold text-ink">{title}</p>
                {topMeta ? <p className="mt-1 truncate text-[11px] text-muted">{topMeta}</p> : null}
              </div>
            </div>
            <img alt="" aria-hidden="true" className="size-7 shrink-0" src={brandSrc} />
          </div>
        ) : null}

        {isBuffering && hasSource && !hasError ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status">
            <span className="sr-only">Buffering video</span>
            <Loader2 aria-hidden="true" className="size-10 animate-spin text-ink motion-reduce:animate-none" />
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
                  className="inline-flex min-h-11 items-center rounded-control border border-control-outline px-4 text-sm font-bold text-ink outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-orange"
                  onClick={retryPlayback}
                  type="button"
                >
                  Retry
                </button>
                <a
                  className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-bold text-copy outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
                  href="/settings#support"
                >
                  Report an issue
                </a>
              </div>
            </div>
          </div>
        ) : null}

        {captionsOn && caption && !hasError ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-32 flex justify-center px-6 sm:bottom-36">
            <p className="max-w-3xl bg-black/70 px-4 py-2 text-center text-[15px] font-bold leading-7 text-ink sm:text-base">
              {caption}
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            'absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(9,9,11,0.96)_42%)] px-4 pt-12 pb-3 transition-opacity motion-reduce:transition-none sm:px-6',
            chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div className="flex items-baseline justify-between gap-4">
            <p className="min-w-0 truncate text-xs font-bold text-ink">{chapterLabel}</p>
            <p className="shrink-0 text-xs tabular-nums text-muted">
              {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
            </p>
          </div>
          <div className="group relative mt-1 flex h-6 items-center rounded-micro has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange">
            <div aria-hidden="true" className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/15 transition-all group-hover:h-1.5 motion-reduce:transition-none">
              <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${bufferedRatio * 100}%` }} />
              <div className="absolute inset-y-0 left-0 bg-orange" style={{ width: `${progressRatio * 100}%` }} />
            </div>
            <div
              aria-hidden="true"
              className="absolute size-3.5 -translate-x-1/2 rounded-full border-2 border-orange bg-ink"
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

          {activeMenu ? (
            <div className="relative" ref={menuRef}>
              <div
                aria-label={`${activeMenu} options`}
                className="absolute right-0 bottom-1 z-10 w-72 max-w-[calc(100vw-3rem)] rounded-control border border-border bg-surface p-2 shadow-none"
                id={`consumit-player-menu-${activeMenu}`}
                role="menu"
              >
                {activeMenu === 'subtitles' ? (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Subtitles</p>
                    {subtitleOptions.map((option) => {
                      const selected = selectedSubtitle === option.value
                      return (
                        <button
                          aria-checked={selected}
                          className="flex min-h-11 w-full items-center gap-3 rounded-micro px-3 text-left text-sm text-ink outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-orange"
                          key={option.value}
                          onClick={() => chooseSubtitle(option.value)}
                          role="menuitemradio"
                          type="button"
                        >
                          <span className="flex-1">{option.label}</span>
                          {selected ? <Check aria-hidden="true" className="size-4 text-orange" /> : null}
                        </button>
                      )
                    })}
                  </>
                ) : null}
                {activeMenu === 'audio' ? (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Audio</p>
                    {audioOptions.map((option) => {
                      const selected = selectedAudio === option.value
                      return (
                        <button
                          aria-checked={selected}
                          className="flex min-h-11 w-full items-center gap-3 rounded-micro px-3 text-left text-sm text-ink outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-orange"
                          key={option.value}
                          onClick={() => chooseAudio(option.value)}
                          role="menuitemradio"
                          type="button"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{option.label}</span>
                            {option.detail ? <span className="mt-0.5 block text-xs text-muted">{option.detail}</span> : null}
                          </span>
                          {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                        </button>
                      )
                    })}
                  </>
                ) : null}
                {activeMenu === 'display' ? (
                  <div className="max-h-80 overflow-y-auto">
                    <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Quality</p>
                    {qualityOptions.map((option) => {
                      const selected = selectedQuality === option.value
                      return (
                        <button
                          aria-checked={selected}
                          className="flex min-h-11 w-full items-center gap-3 rounded-micro px-3 text-left text-sm text-ink outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-orange"
                          key={option.value}
                          onClick={() => chooseQuality(option.value)}
                          role="menuitemradio"
                          type="button"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{option.label}</span>
                            {option.detail ? <span className="mt-0.5 block text-xs text-muted">{option.detail}</span> : null}
                          </span>
                          {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                        </button>
                      )
                    })}
                    <p className="px-3 pt-3 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Speed</p>
                    <div className="flex flex-wrap gap-1 px-3 pb-2" role="group" aria-label="Playback speed">
                      {playbackRates.map((rate) => {
                        const selected = selectedRate === rate
                        return (
                          <button
                            aria-pressed={selected}
                            className={cn(
                              'min-h-11 min-w-11 rounded-micro px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-orange',
                              selected ? 'bg-ink font-bold text-canvas' : 'text-copy hover:bg-surface-raised hover:text-ink',
                            )}
                            key={rate}
                            onClick={() => chooseRate(rate)}
                            type="button"
                          >
                            {rate}×
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <label className="text-sm text-ink" htmlFor="consumit-player-brightness">
                        Brightness
                      </label>
                      <input
                        aria-label="Brightness"
                        className="h-11 w-32 cursor-pointer accent-orange"
                        id="consumit-player-brightness"
                        max={1.3}
                        min={0.6}
                        onChange={(event) => changeBrightness(Number(event.currentTarget.value))}
                        step={0.05}
                        type="range"
                        value={brightness}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <PlayerIconButton disabled={!hasSource || hasError} label={isPlaying ? 'Pause' : 'Play'} onClick={() => void togglePlayback()}>
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </PlayerIconButton>
              <button
                aria-label="Back 10 seconds"
                className="grid size-11 shrink-0 place-items-center rounded-control text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
                disabled={!hasSource || hasError}
                onClick={() => seekBy(-SEEK_STEP)}
                title="Back 10 seconds (J)"
                type="button"
              >
                <span aria-hidden="true" className="relative grid place-items-center">
                  <RotateCcw className="size-6" strokeWidth={1.5} />
                  <span className="absolute text-[8px] font-bold">10</span>
                </span>
              </button>
              <button
                aria-label="Forward 10 seconds"
                className="grid size-11 shrink-0 place-items-center rounded-control text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
                disabled={!hasSource || hasError}
                onClick={() => seekBy(SEEK_STEP)}
                title="Forward 10 seconds (L)"
                type="button"
              >
                <span aria-hidden="true" className="relative grid place-items-center">
                  <RotateCw className="size-6" strokeWidth={1.5} />
                  <span className="absolute text-[8px] font-bold">10</span>
                </span>
              </button>
              <PlayerIconButton disabled={!hasSource} label={isMuted || volume === 0 ? 'Unmute' : 'Mute'} onClick={toggleMute} title="Mute (M)">
                {isMuted || volume === 0 ? <VolumeX aria-hidden="true" className="size-6" strokeWidth={1.5} /> : <Volume2 aria-hidden="true" className="size-6" strokeWidth={1.5} />}
              </PlayerIconButton>
              <input
                aria-label="Volume"
                className="hidden h-11 w-20 cursor-pointer accent-orange sm:block"
                disabled={!hasSource}
                max={1}
                min={0}
                onChange={(event) => changeVolume(Number(event.currentTarget.value))}
                step={0.05}
                type="range"
                value={isMuted ? 0 : volume}
              />
              {volumeLabel ? <span className="ml-1 hidden truncate text-xs text-muted lg:block">{volumeLabel}</span> : null}
            </div>
            <div className="flex shrink-0 items-start gap-1 sm:gap-2">
              <span className="flex flex-col items-center">
                <PlayerIconButton
                  active={captionsOn}
                  disabled={!hasSource}
                  expanded={activeMenu === 'subtitles'}
                  label={captionsOn ? 'Subtitles on. Change subtitles' : 'Subtitles off. Change subtitles'}
                  menuId="subtitles"
                  onClick={() => toggleMenu('subtitles')}
                  title="Subtitles (C)"
                >
                  {captionsOn ? <Captions aria-hidden="true" className="size-6" strokeWidth={1.5} /> : <CaptionsOff aria-hidden="true" className="size-6" strokeWidth={1.5} />}
                </PlayerIconButton>
                {captionsOn ? (
                  <span aria-hidden="true" className="pb-1 text-[9px] font-bold tracking-[0.12em] text-orange uppercase">
                    Subtitles
                  </span>
                ) : null}
              </span>
              <span className="hidden md:contents">
                <PlayerIconButton
                  disabled={!hasSource}
                  expanded={activeMenu === 'audio'}
                  label="Audio tracks"
                  menuId="audio"
                  onClick={() => toggleMenu('audio')}
                >
                  <AudioLines aria-hidden="true" className="size-6" strokeWidth={1.5} />
                </PlayerIconButton>
              </span>
              <PlayerIconButton
                active={activeMenu === 'display'}
                disabled={!hasSource}
                expanded={activeMenu === 'display'}
                label="Display, quality, and speed"
                menuId="display"
                onClick={() => toggleMenu('display')}
              >
                <SunMedium aria-hidden="true" className="size-6" strokeWidth={1.5} />
              </PlayerIconButton>
              <span className="hidden sm:contents">
                <PlayerIconButton
                  active={isPip}
                  disabled={!hasSource || hasError || !pipSupported}
                  label={isPip ? 'Exit picture in picture' : 'Enter picture in picture'}
                  onClick={() => void togglePip()}
                >
                  <PictureInPicture2 aria-hidden="true" className="size-6" strokeWidth={1.5} />
                </PlayerIconButton>
              </span>
              <PlayerIconButton
                disabled={!hasSource}
                label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                onClick={() => void toggleFullscreen()}
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize aria-hidden="true" className="size-6" strokeWidth={1.5} /> : <Maximize aria-hidden="true" className="size-6" strokeWidth={1.5} />}
              </PlayerIconButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="size-5 fill-current" viewBox="0 0 20 20">
      <path d="M6 4.5v11l9-5.5-9-5.5Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="size-5 fill-current" viewBox="0 0 20 20">
      <rect height="11" width="3.4" x="5" y="4.5" />
      <rect height="11" width="3.4" x="11.6" y="4.5" />
    </svg>
  )
}
