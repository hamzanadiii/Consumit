'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Select, Toggle, nativeLanguageName, PREFERRED_LANGUAGE_CODES } from '@consumit/ui'
import type { ExperiencePreferences } from '@consumit/contracts'
import { useExperience } from './experience-provider'

const languages = [...new Set([...PREFERRED_LANGUAGE_CODES, 'ja', 'ko', 'zh'])]
const languageName = (code: string) => nativeLanguageName(code, code.toUpperCase())
export function PreferenceFields({ value, onChange }: { value: ExperiencePreferences; onChange: (value: ExperiencePreferences) => void }) {
  const fields = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  useLayoutEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (!target) return
    const control = target === 'add' ? fields.current?.querySelector<HTMLButtonElement>('[data-language-add] [data-consumit-select] > button')
      : fields.current?.querySelector<HTMLButtonElement>(`[data-remove-language="${target}"]`)
    control?.focus()
  }, [value.subtitleLanguages])
  function removeLanguage(code: string) {
    const index = value.subtitleLanguages.indexOf(code)
    const next = value.subtitleLanguages.filter(language => language !== code)
    pendingFocus.current = next[index] ?? next[index - 1] ?? 'add'
    change({ subtitleLanguages: next })
  }
  function moveLanguage(code: string, index: number) {
    const next = [...value.subtitleLanguages]
    ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
    pendingFocus.current = code
    change({ subtitleLanguages: next })
  }
  const change = (patch: Partial<ExperiencePreferences>) => onChange({ ...value, ...patch })
  return <div className="space-y-7" ref={fields}>
    <div className="grid gap-6 sm:grid-cols-2">
      <div><Select className="[&_button]:min-h-11" label="Movie & series audio" value={value.audioLanguage} onValueChange={audioLanguage => change({ audioLanguage })} options={[...new Set([value.audioLanguage, ...languages])].map(code => ({ value: code, label: languageName(code) }))} /><p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">We try this language when the source offers it.</p></div>
      <div><Select className="[&_button]:min-h-11" label="Anime audio" value={value.animeAudio} onValueChange={audio => change({ animeAudio: audio === 'dub' ? 'dub' : 'sub' })} options={[{ value: 'sub', label: 'Original audio / SUB' }, { value: 'dub', label: 'English DUB' }]} /><p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">If a dub is unavailable, you choose whether to switch to SUB.</p></div>
    </div>
    <div className="border-t border-[var(--fs-line)] pt-5" role="group" aria-label="Preferred subtitle languages">
      <div className="flex items-center justify-between gap-5"><div><p className="text-sm font-bold">Subtitles</p><p className="mt-1 text-xs leading-5 text-[var(--fs-muted)]">Try your languages in the order below.</p></div><Toggle checked={value.subtitlesEnabled} label="Enable subtitles" onCheckedChange={subtitlesEnabled => change({ subtitlesEnabled })} /></div>
      <ol className="mt-4 space-y-2" aria-label="Subtitle language priority">{value.subtitleLanguages.map((code, index) => <li className="flex flex-wrap items-center gap-2" key={code}><span className="w-5 text-xs tabular-nums text-[var(--fs-muted)]">{index + 1}.</span><span className="min-w-0 flex-1 text-sm"><bdi dir="auto">{languageName(code)}</bdi></span><Button className="min-h-11 min-w-11" size="sm" variant="ghost" aria-label={`Move ${languageName(code)} up`} disabled={index === 0} onClick={() => moveLanguage(code, index)}>Move up</Button><Button className="min-h-11 min-w-11" size="sm" variant="ghost" data-remove-language={code} aria-label={`Remove ${languageName(code)}`} onClick={() => removeLanguage(code)}>Remove</Button></li>)}</ol>
      {value.subtitleLanguages.length < 3 ? <div data-language-add><Select className="mt-3 [&_button]:min-h-11 sm:max-w-sm" label="Add subtitle language" value="" placeholder="Choose a language" onValueChange={code => { pendingFocus.current = code; change({ subtitleLanguages: [...value.subtitleLanguages, code] }) }} options={languages.filter(code => !value.subtitleLanguages.includes(code)).map(code => ({ value: code, label: languageName(code) }))} /></div> : <p className="mt-3 text-xs text-[var(--fs-muted)]">Three languages selected. Remove one to add another.</p>}
      {!value.subtitleLanguages.length ? <p className="mt-2 text-xs text-[var(--fs-muted)]">Choose a language for automatic subtitles. You can still select a track in Watch.</p> : null}
    </div>
    <div className="grid gap-6 border-t border-[var(--fs-line)] pt-5 sm:grid-cols-2">
      <div><Select className="[&_button]:min-h-11" label="Preferred quality" value={String(value.qualityHeight ?? 'auto')} onValueChange={height => change({ qualityHeight: height === 'auto' ? null : Number(height) })} options={[{ value: 'auto', label: 'Auto' }, ...[...new Set([480, 720, 1080, 2160, ...(value.qualityHeight ? [value.qualityHeight] : [])])].sort((a,b) => a-b).map(height => ({ value: String(height), label: `${height}p` }))]} /><p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">Available quality varies by source.</p></div>
      <div className="flex items-center justify-between gap-5"><div><p className="text-sm font-bold">Autoplay next episode</p><p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">Continue when an episode finishes in the Consumit Player.</p></div><Toggle checked={value.autoplayNextEpisode} label="Autoplay next episode" onCheckedChange={autoplayNextEpisode => change({ autoplayNextEpisode })} /></div>
    </div>
  </div>
}

function PreferenceEditorReady({ onSaved, label }: { onSaved?: (() => void) | undefined; label: string }) {
  const experience = useExperience()
  const [draft, setDraft] = useState(experience.preferences)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) queueMicrotask(() => setDraft(experience.preferences))
  }, [experience.preferences])
  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const { audioLanguage, animeAudio, subtitlesEnabled, subtitleLanguages, qualityHeight, autoplayNextEpisode } = draft
      await experience.patch({ audioLanguage, animeAudio, subtitlesEnabled, subtitleLanguages, qualityHeight, autoplayNextEpisode })
      dirty.current = false; setSaved(true); onSaved?.()
    } catch { setError('Your choices are kept here. Retry to save them.') }
    finally { setBusy(false) }
  }
  return <div>
    {!experience.preferences.playbackConfigured && experience.owner ? <div className="mb-6 border-b border-[var(--fs-line)] pb-5"><p className="text-sm text-[var(--fs-secondary)]">Set up this account, or start with your guest choices from this device.</p><Button className="mt-3" variant="secondary" onClick={() => { dirty.current = true; setDraft(experience.deviceChoices()); setSaved(false) }}>Use device choices</Button></div> : null}
    <PreferenceFields value={draft} onChange={value => { dirty.current = true; setDraft(value); setSaved(false) }} />
    {experience.error ? <div className="mt-5 text-sm" role="alert">{experience.error}<Button className="ml-2" variant="ghost" onClick={() => { void experience.retry().catch(() => {}) }}>Retry account sync</Button></div> : null}
    {error ? <p className="mt-6 text-sm text-[var(--fs-ink)]" role="alert">{error}</p> : null}
    <div className="mt-7 flex flex-wrap items-center gap-4"><Button loading={busy} onClick={() => void save()} variant="accent">{error ? 'Retry save' : label}</Button><p className="text-xs text-[var(--fs-muted)]" role="status">{saved ? 'Preferences saved.' : experience.owner ? 'Your choices sync to your account and this device.' : 'Your choices stay on this device. No account needed.'}</p></div>
  </div>
}
export function PreferenceEditor({ onSaved, label = 'Save viewing preferences' }: { onSaved?: (() => void) | undefined; label?: string }) {
  const experience = useExperience()
  if (!experience.ready) return <div className="py-6 text-sm text-[var(--fs-secondary)]"><p role="status">Loading your viewing preferences…</p><Button variant="ghost" onClick={() => window.location.reload()}>Retry loading preferences</Button></div>
  return <PreferenceEditorReady key={experience.owner ?? 'guest'} onSaved={onSaved} label={label} />
}
