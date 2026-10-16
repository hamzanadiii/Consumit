import { defaultExperiencePreferences, experiencePreferencesSchema, experiencePatchSchema, type ExperiencePreferences, type ExperiencePatch } from '@consumit/contracts'

const guestKey = 'consumit.experience.guest.v1'
const memory = new Map<string, ExperiencePreferences>()
export const experienceStorageKey = (memberId: string | null) => memberId ? `consumit.experience.member.${memberId}.v1` : guestKey
export function readExperience(memberId: string | null): ExperiencePreferences {
  try {
    if (memory.has(experienceStorageKey(memberId))) return memory.get(experienceStorageKey(memberId))!
    const raw = localStorage.getItem(experienceStorageKey(memberId))
    if (raw) return experiencePreferencesSchema.parse(JSON.parse(raw))
    // Import the old device choices only into the guest namespace, never a different member's account.
    if (memberId) return defaultExperiencePreferences()
    const languages = JSON.parse(localStorage.getItem('consumit.player.subtitle-languages') ?? '["en"]')
    const quality = localStorage.getItem('consumit.player.quality-height')
    return experiencePreferencesSchema.parse({
      audioLanguage: localStorage.getItem('consumit.player.audio-language') ?? 'en',
      subtitleLanguages: languages.length ? languages : ['en'],
      subtitlesEnabled: localStorage.getItem('consumit.player.subtitles') !== 'off',
      qualityHeight: quality && quality !== 'auto' ? Number(quality) : null,
      autoplayNextEpisode: localStorage.getItem('consumit.player.autoplay') === '1',
    })
  } catch { return memory.get(experienceStorageKey(memberId)) ?? defaultExperiencePreferences() }
}
export function storeExperience(memberId: string | null, value: ExperiencePreferences) {
  try { localStorage.setItem(experienceStorageKey(memberId), JSON.stringify(value)); memory.delete(experienceStorageKey(memberId)); return true }
  catch { memory.set(experienceStorageKey(memberId), value); return false }
}
export function readPendingExperience(memberId: string | null): ExperiencePatch {
  if (!memberId) return {}
  try { return experiencePatchSchema.parse(JSON.parse(localStorage.getItem(`${experienceStorageKey(memberId)}.pending`) ?? '{}')) } catch { return {} }
}
export function storePendingExperience(memberId: string | null, patch: ExperiencePatch) {
  if (!memberId) return
  try { localStorage.setItem(`${experienceStorageKey(memberId)}.pending`, JSON.stringify(patch)) } catch { /* In-memory retry remains available. */ }
}

/** Bridge existing player controls with semantic preferences; never store engine track IDs in account data. */
export function applyPlayerDefaults(value: ExperiencePreferences) {
  try {
    localStorage.setItem('consumit.player.audio-language', value.audioLanguage)
    localStorage.setItem('consumit.player.quality-height', value.qualityHeight === null ? 'auto' : String(value.qualityHeight))
    localStorage.setItem('consumit.player.autoplay', value.autoplayNextEpisode ? '1' : '0')
    localStorage.setItem('consumit.player.subtitle-languages', JSON.stringify(value.subtitleLanguages))
    localStorage.setItem('consumit.player.subtitle-language', value.subtitleLanguages[0] ?? 'en')
    localStorage.setItem('consumit.player.subtitles', value.subtitlesEnabled ? value.subtitleLanguages[0] ?? 'english' : 'off')
  } catch { /* Storage denial must not block watching. */ }
}
