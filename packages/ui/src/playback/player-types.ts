import type { ReactNode } from 'react'
import type { MediaPreferences, ViewingPreferences } from './media-preferences'
import type { ChapterCue, DirectMediaSource, SkipSegment } from './media-source'
import type { CaptionBackground, CaptionColor, CaptionFont, CaptionPosition, CaptionSize } from './player-settings'
import type { SeparateAudioSource, SeparateAudioTrack } from './separate-audio'

export type PlayerMenuId = 'quality' | 'server' | 'settings' | 'subtitles' | 'sync' | 'playback' | 'audio' | 'appearance' | 'cast' | 'episodes' | 'shortcuts'

/** Plain media facts emitted by ConsumitPlayer without leaking React or DOM events. */
export type PlayerMediaObservation =
  | {
      type: 'duration-change' | 'ended' | 'pause' | 'play' | 'seeking' | 'seeked' | 'time-update'
      positionSeconds: number
      durationSeconds: number
    }
  | {
      type: 'playing'
      positionSeconds: number
      durationSeconds: number
      videoWidth: number
      videoHeight: number
    }

/** UI-only state shared by the native player and configured provider frames. */
export type PlaybackRecoveryViewModel = {
  phase: 'searching' | 'failed'
  kind: 'startup' | 'interrupted' | 'external'
  message?: string | undefined
  progress?: { checked: number; total: number } | undefined
  checkpointSeconds?: number | undefined
}

export type PlayerOption = {
  detail?: string | undefined
  label: string
  value: string
  /** External players are a separate fallback section, outside Consumit servers. */
  delivery?: 'direct' | 'relay' | 'embed' | undefined
  /** ISO-3166 alpha-2 serving region; rendered as the server flag. */
  region?: string | undefined
  /** Breaker-derived serving state; shown, never blocking. */
  health?: 'ok' | 'degraded' | undefined
  /** Mirror family and mirror name. The server menu groups related choices. */
  family?: string | undefined
  mirror?: string | undefined
  /** False when this mirror did not answer for the title. A tap can retry it. */
  available?: boolean | undefined
  /** BCP-47-ish subtitle language code. Absent for Off. */
  language?: string | undefined
}

export type PlayerSubtitleCandidate = {
  id: string
  label: string
  language: string
  provider: string
  providerName?: string | undefined
  release?: string | undefined
  signs?: boolean | undefined
  songs?: boolean | undefined
  hi?: boolean | undefined
  forced?: boolean | undefined
  sdh?: boolean | undefined
  machineTranslated?: boolean | undefined
  match?: 'source' | 'release' | 'unverified' | undefined
  recommended?: boolean | undefined
  contentChecksum?: string | undefined
  preparedUrl?: string | undefined
}

export type PlayerSubtitleDiscovery = {
  hasMore?: boolean | undefined
  searchId?: string | null | undefined
  languages: readonly { code: string; count: number }[]
  providers: readonly {
    id: string
    name: string
    state: 'ready' | 'skipped' | 'no_match' | 'failed' | 'timeout'
    durationMs: number
    found: number
    reason?: 'credentials_required' | 'unsupported' | 'unsupported_format' | undefined
  }[]
  loading: boolean
  error: string | null
}

/** Authorized media input and playback intent supplied by Watch or an embed. */
export type PlayerMediaInput = {
  source?: DirectMediaSource | undefined
  autoPlay?: boolean | undefined
  muted?: boolean | undefined
  preload?: 'none' | 'metadata' | 'auto' | undefined
  resume?: { positionSeconds: number; playing: boolean } | undefined
  recordingKey?: string | undefined
}

/** Route-supplied presentation content; it carries no source or progress decisions. */
export type PlayerPresentation = {
  className?: string | undefined
  videoClassName?: string | undefined
  backActionAvailable?: boolean | undefined
  posterSrc?: string | undefined
  preparationPosterSrc?: string | null | undefined
  status?: ReactNode | undefined
  statusTone?: 'healthy' | 'neutral' | 'unavailable' | undefined
  backHref?: string | undefined
  topMeta?: ReactNode | undefined
  preparing?: boolean | undefined
  preparationMeta?: ReactNode | undefined
  episodePanel?: ReactNode | undefined
  animeAudioControl?: ReactNode | undefined
  watchSettings?: ReactNode | undefined
  watchStatus?: ReactNode | undefined
  recovery?: PlaybackRecoveryViewModel | undefined
  recoveryExtraAction?: ReactNode | undefined
  theater?: boolean | undefined
  pauseFacts?: ReactNode | undefined
  pauseLogoUrl?: string | undefined
  pauseOverview?: string | undefined
  pauseTitle?: string | undefined
}

/** Current control data and the result-bearing adapters owned by the caller. */
export type PlayerControlModel = {
  preferences?: {
    initialViewing?: ViewingPreferences | undefined
    subtitleLanguages?: readonly string[] | undefined
  } | undefined
  audio?: {
    options?: readonly PlayerOption[] | undefined
    selected?: string | undefined
    requestAvailable?: boolean | undefined
    separate?: {
      tracks?: readonly SeparateAudioTrack[] | undefined
      loading?: boolean | undefined
      error?: string | null | undefined
      continuityKey?: string | undefined
      select?: ((id: string) => Promise<SeparateAudioSource>) | undefined
    } | undefined
  } | undefined
  captions?: {
    options?: readonly PlayerOption[] | undefined
    selected?: string | undefined
    requestAvailable?: boolean | undefined
    refreshAvailable?: boolean | undefined
    contextKey?: string | undefined
    discovery?: PlayerSubtitleDiscovery | undefined
    extraTracks?: readonly { id: string; label: string; language: string; url: string }[] | undefined
    cue?: string | undefined
    appearance?: {
      size?: CaptionSize | undefined
      background?: CaptionBackground | undefined
      position?: CaptionPosition | undefined
      font?: CaptionFont | undefined
      color?: CaptionColor | undefined
    } | undefined
    sync?: { delayMs?: number | undefined } | undefined
    page?: ((language: string, cursor: number) => Promise<{ tracks: PlayerSubtitleCandidate[]; total: number; nextCursor: number | null }>) | undefined
    search?: ((query: string, cursor: number) => Promise<{ tracks: PlayerSubtitleCandidate[]; total: number; nextCursor: number | null }>) | undefined
    prepare?: ((candidate: PlayerSubtitleCandidate) => Promise<{ id: string; label: string; language: string; url: string; cues?: readonly import('./subtitle-sync').SubtitleCue[] | undefined }>) | undefined
  } | undefined
  quality?: {
    options?: readonly PlayerOption[] | undefined
    selected?: string | undefined
  } | undefined
  playback?: {
    rates?: readonly number[] | undefined
    selectedRate?: number | undefined
    brightness?: number | undefined
    autoSkip?: boolean | undefined
    autoHideMs?: number | undefined
    chapters?: readonly ChapterCue[] | undefined
    skipSegments?: ((durationSeconds: number, signal: AbortSignal) => Promise<readonly SkipSegment[]>) | undefined
    previousEpisodeAvailable?: boolean | undefined
    nextEpisodeAvailable?: boolean | undefined
    theaterAvailable?: boolean | undefined
  } | undefined
  sourceSelection?: {
    options?: readonly PlayerOption[] | undefined
    selected?: string | undefined
    auto?: boolean | undefined
    autoAvailable?: boolean | undefined
    requestAvailable?: boolean | undefined
    retryAvailable?: boolean | undefined
    recoveryCancelAvailable?: boolean | undefined
    recoveryChooseAvailable?: boolean | undefined
    loading?: boolean | undefined
    error?: string | null | undefined
    busy?: boolean | undefined
  } | undefined
  cast?: {
    available?: boolean | undefined
    connected?: boolean | undefined
    canConnect?: boolean | undefined
    check?: (() => Promise<'ready' | 'unconfigured' | 'unavailable'>) | undefined
  } | undefined
}

/** User intents from Player controls. Watch remains the authority for route and persistence decisions. */
export type PlayerControlAction =
  | { type: 'back' }
  | { type: 'previous-episode' }
  | { type: 'next-episode' }
  | { type: 'theater-change'; enabled: boolean }
  | { type: 'recovery-cancel' }
  | { type: 'recovery-choose-source' }
  | { type: 'retry' }
  | { type: 'audio-change'; value: string }
  | { type: 'audio-request' }
  | { type: 'subtitle-change'; value: string }
  | { type: 'subtitle-request' }
  | { type: 'subtitle-refresh' }
  | { type: 'subtitle-delay-change'; delayMs: number }
  | { type: 'caption-size-change'; value: CaptionSize }
  | { type: 'caption-background-change'; value: CaptionBackground }
  | { type: 'caption-position-change'; value: CaptionPosition }
  | { type: 'caption-font-change'; value: CaptionFont }
  | { type: 'caption-color-change'; value: CaptionColor }
  | { type: 'quality-change'; value: string }
  | { type: 'rate-change'; value: number }
  | { type: 'brightness-change'; value: number }
  | { type: 'auto-skip-change'; enabled: boolean }
  | { type: 'source-change'; value: string }
  | { type: 'source-auto' }
  | { type: 'source-request' }
  | { type: 'cast-click' }
  | { type: 'viewing-preferences-change'; value: Partial<ViewingPreferences> }
  | { type: 'media-preferences-change'; value: MediaPreferences }
