import type { MediaOption } from './media-engine'
import { normalizeAudioLanguage } from './media-preferences'
import type { SeparateAudioTrack } from './separate-audio'

export type AudioMenuOption = { key: string; label: string; stream: MediaOption[]; separate: SeparateAudioTrack[] }
const names = new Intl.DisplayNames(['en'], { type: 'language' })
const cleanLabel = (label: string) => label.trim().replace(/^\d+\s*[.)]\s*/, '')
function languageCode(value?: string) {
  const code = normalizeAudioLanguage(value?.trim() ?? '')
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) && !['und', 'zxx'].includes(code) ? code : undefined
}
const languageName = (code: string) => names.of(code) ?? code

/** One visible choice per language; delivery identity stays internal. */
export function audioMenuOptions(stream: readonly MediaOption[], separate: readonly SeparateAudioTrack[]): AudioMenuOption[] {
  const knownNames = new Map<string, string>()
  for (const track of [...stream, ...separate]) {
    const code = languageCode(track.language)
    if (code) knownNames.set(languageName(code).toLowerCase(), code)
  }
  const groups = new Map<string, AudioMenuOption>()
  const group = (track: { label: string; language?: string | undefined }) => {
    const clean = cleanLabel(track.label)
    const code = languageCode(track.language) ?? knownNames.get(clean.toLowerCase()) ?? languageCode(clean)
    // Distinct accessible renditions are not duplicate soundtracks.
    const variant = /commentary/i.test(clean) ? 'Commentary' : /audio description|described|descriptive/i.test(clean) ? 'Audio description' : ''
    const label = (code ? languageName(code) : clean) + (variant ? ` · ${variant}` : '')
    const key = `${code ?? clean.toLowerCase()}:${variant}`
    let row = groups.get(key)
    if (!row) { row = { key, label, stream: [], separate: [] }; groups.set(key, row) }
    return row
  }
  for (const track of stream) group(track).stream.push(track)
  for (const track of separate) group(track).separate.push(track)
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'en'))
}
