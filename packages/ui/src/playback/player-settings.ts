import { cn } from '../lib/cn'

export type CaptionSize = 'small' | 'medium' | 'large' | 'xlarge'
export type CaptionBackground = 'cinematic' | 'boxed' | 'subtle'
export type CaptionPosition = 'bottom' | 'top'
/** FilScreen vibe default: Charter film-poster serif. `sans` is the compact DejaVu interface voice. */
export type CaptionFont = 'filscreen' | 'sans'

export const CAPTION_SIZE_KEY = 'consumit.player.caption-size'
export const CAPTION_BACKGROUND_KEY = 'consumit.player.caption-background'
export const CAPTION_POSITION_KEY = 'consumit.player.caption-position'
export const CAPTION_FONT_KEY = 'consumit.player.caption-font'

export const CAPTION_SIZES: readonly CaptionSize[] = ['small', 'medium', 'large', 'xlarge']
export const CAPTION_BACKGROUNDS: readonly CaptionBackground[] = ['cinematic', 'boxed', 'subtle']
export const CAPTION_POSITIONS: readonly CaptionPosition[] = ['bottom', 'top']
export const CAPTION_FONTS: readonly CaptionFont[] = ['filscreen', 'sans']

/** Read an allowlisted preference without letting unavailable storage affect playback. */
export function readStoredCaption<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw != null && (allowed as readonly string[]).includes(raw)) return raw as T
    return fallback
  } catch {
    return fallback
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
    // Private-mode storage must never break playback.
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

const REGION_NAMES: Record<string, string> = {
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

/** First occurrence wins so a duplicate upstream option cannot break menu identity. */
export function dedupePlayerOptions<T extends { value: string }>(options: readonly T[]): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const option of options) {
    if (seen.has(option.value)) continue
    seen.add(option.value)
    unique.push(option)
  }
  return unique
}

export function settingsRowClass(selected: boolean) {
  return cn(
    'consumit-player-option flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm outline-none transition-colors motion-reduce:transition-none',
    selected
      ? 'bg-orange/15 font-bold text-ink shadow-[inset_0_0_0_1px_var(--color-orange)] focus-visible:ring-2 focus-visible:ring-orange'
      : 'text-copy hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange',
  )
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

/** Cursive RTL scripts break letter joining under non-zero letter-spacing in Chromium. */
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
