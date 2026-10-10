import type { MediaOption } from './media-engine'
import { canonicalSubtitleLanguage } from './subtitle-sync'

export type MediaPreferences = { qualityHeight: number | null; audioLanguage?: string | undefined }
export type ViewingPreferences = MediaPreferences & { subtitlesEnabled: boolean; subtitleLanguages: readonly string[] }
const QUALITY_KEY = 'consumit.player.quality-height'

export function readQualityPreference(): number | null {
  try {
    const value = Number(localStorage.getItem(QUALITY_KEY))
    return Number.isInteger(value) && value >= 144 && value <= 4320 ? value : null
  } catch { return null }
}

export function qualityHeight(option: MediaOption): number | undefined {
  return option.height ?? (/^\d{3,4}p$/.test(option.label) ? Number.parseInt(option.label, 10) : undefined)
}

/** Resolve a resolution intent against each source's own rendition identifiers. */
export function createQualityPreference(initialHeight = readQualityPreference()) {
  let height = initialHeight
  return {
    get height() { return height },
    choose(option: MediaOption) {
      if (option.value !== 'auto' && qualityHeight(option) === undefined) return
      height = option.value === 'auto' ? null : qualityHeight(option)!
      try { localStorage.setItem(QUALITY_KEY, height === null ? 'auto' : String(height)) } catch { /* Optional storage. */ }
    },
    resolve(options: readonly MediaOption[], fixedHint?: string) {
      if (height === null) return { value: 'auto', notice: undefined }
      const target = height
      const variants = options.filter((option) => option.value !== 'auto' && qualityHeight(option) !== undefined)
      const exact = variants.find((option) => qualityHeight(option) === height)
      if (exact) return { value: exact.value, notice: undefined }
      const lower = variants.filter((option) => qualityHeight(option)! < target).sort((a, b) => qualityHeight(b)! - qualityHeight(a)!)[0]
      const replacement = lower ?? variants.sort((a, b) => qualityHeight(a)! - qualityHeight(b)!)[0]
      const actual = replacement?.label ?? fixedHint
      return { value: replacement?.value ?? 'auto', notice: actual === `${height}p` ? undefined
        : actual ? `${height}p unavailable on this source. Using ${actual}.` : `${height}p preferred; this source does not report a selectable resolution.` }
    },
  }
}

export function preferredAudioOption(options: readonly MediaOption[], preference: string) {
  const normalized = normalizeAudioLanguage(preference)
  return options.find((option) => normalizeAudioLanguage(option.language ?? '') === normalized || option.label.toLowerCase() === normalized)
    ?? options.find((option) => normalized !== 'original' && normalizeAudioLanguage(option.language ?? '').split('-')[0] === normalized.split('-')[0])
}

export function preferredSubtitleOption(options: readonly MediaOption[], languages: readonly string[], currentValue?: string) {
  const current = options.find(option => option.value === currentValue)
  for (const language of languages) {
    const match = preferredAudioOption(options, language)
    // Preserve a selected release within the preferred language, while
    // allowing a higher-priority language to replace a fallback.
    if (match) return current && preferredAudioOption([current], language) ? current : match
  }
  return undefined
}
export function semanticSubtitleLanguage(language: string | undefined) {
  const code = canonicalSubtitleLanguage(language).split('-')[0] ?? ''
  return /^[a-z]{2,3}$/.test(code) && code !== 'und' ? code : undefined
}

export function normalizeAudioLanguage(language: string): string {
  try { return Intl.getCanonicalLocales(language)[0]?.toLowerCase() ?? language.toLowerCase() }
  catch { return language.toLowerCase() }
}

export function mediaPreferences(height: number | null, audio: string): MediaPreferences {
  const language = normalizeAudioLanguage(audio)
  return { qualityHeight: height, ...(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language) ? { audioLanguage: language } : {}) }
}
