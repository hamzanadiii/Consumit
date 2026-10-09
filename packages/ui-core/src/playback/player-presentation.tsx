'use client'
import { type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { nativeLanguageName, subtitleLabelDetail } from '@consumit/playback-core/subtitle-sync'
import type { PlayerMenuId, CaptionSize, CaptionBackground, CaptionPosition, CaptionFont, PlayerOption, PlayerSubtitleCandidate } from '@consumit/playback-core/player-types'

export const DEFAULT_SUBTITLES: readonly PlayerOption[] = [
  { label: 'English', value: 'english' },
  { label: 'Off', value: 'off' },
]

export const DEFAULT_AUDIO: readonly PlayerOption[] = [
  { detail: 'Stereo · Default', label: 'English', value: 'english' },
]

export const DEFAULT_QUALITIES: readonly PlayerOption[] = [
  { detail: 'Adapts to your connection', label: 'Auto', value: 'auto' },
  { label: '1080p', value: '1080p' },
  { label: '720p', value: '720p' },
  { label: '480p', value: '480p' },
]

export const DEFAULT_RATES: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2]

export const SEEK_STEP = 10

export const CAPTION_SIZE_KEY = 'consumit.player.caption-size'
export const CAPTION_BACKGROUND_KEY = 'consumit.player.caption-background'
export const CAPTION_POSITION_KEY = 'consumit.player.caption-position'
export const CAPTION_FONT_KEY = 'consumit.player.caption-font'

export const CAPTION_SIZES: readonly CaptionSize[] = ['small', 'medium', 'large', 'xlarge']
export const CAPTION_BACKGROUNDS: readonly CaptionBackground[] = ['cinematic', 'boxed', 'subtle']
export const CAPTION_POSITIONS: readonly CaptionPosition[] = ['bottom', 'top']
export const CAPTION_FONTS: readonly CaptionFont[] = ['filscreen', 'sans']

export function readStoredCaption<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw != null && (allowed as readonly string[]).includes(raw)) return raw as T
    return fallback
  } catch {
    return fallback
  }
}

export function captionSizeClass(size: CaptionSize, fullscreen: boolean) {
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

export function captionFontClass(font: CaptionFont) {
  // FilScreen vibe default: Charter film-poster serif with tight tracking.
  // Sans falls back to the compact DejaVu interface voice.
  return font === 'sans'
    ? 'font-interface font-bold tracking-[-0.01em]'
    : 'font-display font-normal tracking-[-0.02em]'
}

/** Cursive RTL scripts (Arabic) break letter joining under non-zero
 *  letter-spacing in Chromium, so cues carrying them render untracked.
 *  Hex ranges keep the source ASCII-only. */
export function hasCursiveRtlScript(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if ((code >= 0x0590 && code <= 0x08ff) || (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)) return true
  }
  return false
}

export function captionBackgroundClass(background: CaptionBackground) {
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

export function readStoredNumber(key: string, fallback: number, min: number, max: number) {
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

export function readStoredString(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function storeValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private-mode storage must never break playback */
  }
}

export const FAVORITE_SERVERS_KEY = 'consumit.favorite-servers'

export function readFavoriteServers(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_SERVERS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export const REGION_NAMES: Record<string, string> = {
  US: 'United States', DE: 'Germany', FR: 'France', IN: 'India', GB: 'United Kingdom',
  JP: 'Japan', CA: 'Canada', AU: 'Australia', NL: 'Netherlands', SG: 'Singapore',
}

export function regionFlag(code: string | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null
  return String.fromCodePoint(...[...code.toUpperCase()].map((char) => 127397 + char.charCodeAt(0)))
}

export function regionName(code: string | undefined): string | null {
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
export function dedupePlayerOptions(options: readonly PlayerOption[]): PlayerOption[] {
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
export function settingsRowClass(selected: boolean) {
  return cn(
    'consumit-player-option flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm outline-none transition-colors motion-reduce:transition-none',
    selected
      ? 'bg-orange/15 font-bold text-ink shadow-[inset_0_0_0_1px_var(--color-orange)] focus-visible:ring-2 focus-visible:ring-orange'
      : 'text-copy hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange',
  )
}

/** Language is canonical metadata; upstream labels may be mistranslated.
 * Keep original release information available without using it as a language. */
export function SubtitleTrackLabel({ language, label, detail }: { language?: string | undefined; label: string; detail?: string | undefined }) {
  const description = detail || (language && language !== 'und' ? subtitleLabelDetail(label) : undefined)
  return <span className="min-w-0 flex-1 text-left" title={label}>
    <bdi className="block truncate text-sm font-medium tracking-normal" data-player-subtitle-label dir="auto" lang={language}>{nativeLanguageName(language, label)}</bdi>
    {description ? <bdi className="block truncate text-xs text-muted tracking-normal" dir="auto">{description}</bdi> : null}
  </span>
}

export function subtitleCandidateDetail(track: PlayerSubtitleCandidate) {
  const release = track.release || subtitleLabelDetail(track.label)
  return [track.provider, release, track.hi || track.sdh ? 'HI' : undefined, track.forced ? 'Forced' : undefined, track.machineTranslated ? 'Machine translated' : undefined].filter(Boolean).join(' · ')
}

/** Set on the canary web deployment; Watch and embeds always use the same core. */
export const useNextPlaybackCore = process.env.NEXT_PUBLIC_PLAYBACK_CORE === 'next'
export const subscribeHydration = () => () => undefined
export const clientHydrationSnapshot = () => true
export const serverHydrationSnapshot = () => false

/**
 * FilScreen-flavored option chip for quality and speed: a real bordered chip
 * that reads selected through the signal-orange glow and ink contrast.
 */
export function settingsChipClass(selected: boolean, wide = false) {
  return cn(
    'min-h-10 rounded-control text-sm tabular-nums outline-none transition-all motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:opacity-40',
    wide ? 'px-3.5' : 'min-w-11 px-2.5',
    selected
      ? 'border border-orange bg-orange/20 font-bold text-orange'
      : 'border border-white/15 bg-white/5 text-copy hover:border-white/30 hover:bg-white/10 hover:text-ink',
  )
}

export function QualityIcon({ className }: { className?: string }) {
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

export function PlayerIconButton({
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
