'use client'

import type { MemberProfile } from '@consumit/contracts'
import { ArrowUp, Download, ExternalLink, LogOut, RefreshCw, Save, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  Avatar,
  Button,
  Input,
  Label,
  nativeLanguageName,
  PreferenceRow,
  PREFERRED_LANGUAGE_CODES,
  readStoredSubtitleLanguages,
  savePreferredSubtitleLanguages,
  Select,
  SettingsFact,
  SettingsRail,
  SettingsSection,
} from '@consumit/next-ui'

import { FilScreenShell } from '../shared'
import { AppearanceControls } from '../home/appearance-controls'
import { useSession } from '../session/session'
import { changeMemberPassword, deleteMemberAccount, downloadMemberExport, IdentityApiError, logoutMember, updateMemberProfile } from '@/lib/identity-browser'
import { dicebearAvatarUrl, memberAvatarSrc, randomAvatarSeed } from '@/lib/avatar'

/** Preferred subtitle languages (max 3, priority order). Device-local like
 *  every player preference; the watch screen refetches live on change. */
function SubtitleLanguagePicker() {
  const [langs, setLangs] = useState<string[]>([])
  const pickerRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<{ code: string } | 'add' | null>(null)
  useEffect(() => { queueMicrotask(() => setLangs(readStoredSubtitleLanguages())) }, [])
  useLayoutEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (!target) return
    const button = target === 'add'
      ? pickerRef.current?.querySelector<HTMLButtonElement>('[data-consumit-select] > button')
      : [...(pickerRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove-language]') ?? [])].find((element) => element.dataset.removeLanguage === target.code)
    button?.focus()
  }, [langs])
  function remove(code: string) {
    const index = langs.indexOf(code)
    const next = langs.filter((entry) => entry !== code)
    const remaining = next[index] ?? next[index - 1]
    pendingFocus.current = remaining ? { code: remaining } : 'add'
    setLangs(savePreferredSubtitleLanguages(next))
  }
  function moveUp(index: number) {
    const next = [...langs]
    if (index < 1 || index >= next.length) return
    ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
    if (index === 1) pendingFocus.current = { code: next[0]! }
    setLangs(savePreferredSubtitleLanguages(next))
  }
  return (
    <div aria-label="Preferred subtitle languages" className="w-full max-w-md" data-consumit-subtitle-preferences ref={pickerRef} role="group">
      {langs.length ? (
        <ol aria-label="Subtitle language priority" className="divide-y divide-[var(--fs-line)] rounded-control border border-[var(--fs-line)] bg-[var(--fs-field)]">
          {langs.map((code, index) => {
            const name = nativeLanguageName(code, code.toUpperCase())
            return (
              <li className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-4" key={code}>
                <span aria-hidden="true" className={`w-4 shrink-0 text-sm font-bold tabular-nums ${index === 0 ? 'text-[var(--fs-accent)]' : 'text-[var(--fs-muted)]'}`}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--fs-ink)]"><bdi>{name}</bdi></p>
                  <p className="mt-0.5 text-xs text-[var(--fs-muted)]">{index === 0 ? 'First choice' : `Fallback ${index}`}</p>
                </div>
                <Button aria-label={`Move ${name} up`} className="min-h-[44px] min-w-[44px]" disabled={index === 0} onClick={() => moveUp(index)} size="icon" type="button" variant="ghost"><ArrowUp aria-hidden="true" /></Button>
                <Button aria-label={`Remove ${name}`} className="min-h-[44px] min-w-[44px]" data-remove-language={code} onClick={() => remove(code)} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
              </li>
            )
          })}
        </ol>
      ) : <p className="pb-4 text-sm text-[var(--fs-muted)]">Choose your first language, then add optional fallbacks.</p>}
      {langs.length < 3 ? (
        <Select className={`${langs.length ? 'mt-4 ' : ''}[&_button]:min-h-[44px]`} label="Add subtitle language" onValueChange={(code) => { if (langs.length === 2) pendingFocus.current = { code }; setLangs(savePreferredSubtitleLanguages([...langs, code])) }} options={PREFERRED_LANGUAGE_CODES.filter((code) => !langs.includes(code)).map((code) => ({ label: nativeLanguageName(code, code.toUpperCase()), value: code }))} placeholder="Choose a language…" value="" />
      ) : null}
      <p aria-live="polite" className="mt-3 text-xs leading-5 text-[var(--fs-muted)]">{langs.length === 3 ? 'Three languages selected. Remove one to add another.' : 'Choose up to three languages.'} Saved on this device.</p>
    </div>
  )
}

const SETTINGS_ITEMS = [
  { href: '#account', label: 'Account' },
  { href: '#appearance', label: 'Appearance' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#playback', label: 'Streaming & playback' },
  { href: '#language', label: 'Language & subtitles' },
  { href: '#notifications', label: 'Notifications' },
  { href: '#data', label: 'Data & security' },
] as const

export function SettingsScreen({ initialProfile }: { initialProfile: MemberProfile }) {
  const router = useRouter()
  const session = useSession()
  const [profile, setProfile] = useState(initialProfile)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatarUrl)
  const [profileSaved, setProfileSaved] = useState(false)
  const [accountAction, setAccountAction] = useState<'delete' | 'password' | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [formRevision, setFormRevision] = useState(0)
  const rootRef = useRef<HTMLElement>(null)
  const [activeSection, setActiveSection] = useState<string>('#account')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const sections = [...root.querySelectorAll<HTMLElement>('[data-consumit-settings-section]')]
    let frame = 0
    const update = () => {
      frame = 0
      const laidOut = sections.filter((section) => section.getBoundingClientRect().height > 0)
      if (!laidOut.length) return
      const readingLine = Math.min(120, window.innerHeight * 0.2)
      let current = laidOut[0]!
      for (const section of laidOut) {
        if (section.getBoundingClientRect().top <= readingLine) current = section
      }
      // A short final section may never cross the reading line at page end.
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = laidOut[laidOut.length - 1]!
      setActiveSection(`#${current.id}`)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    observer?.observe(root)
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('hashchange', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('hashchange', schedule)
    }
  }, [])

  function markDirty() {
    setDirty(true)
    setProfileSaved(false)
  }

  function discardProfile() {
    setFormRevision((revision) => revision + 1)
    setAvatarUrl(profile.avatarUrl)
    setDirty(false)
    setProfileSaved(false)
  }

  function saveProfileFromBar() {
    const form = document.getElementById('profile-settings-form')
    if (form instanceof HTMLFormElement) form.requestSubmit()
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setAccountError(null)
    setProfileSaved(false)
    try {
      const updated = await updateMemberProfile({
        avatarUrl,
        bio: String(data.get('bio')).trim() || null,
        displayName: String(data.get('displayName')).trim() || null,
        location: String(data.get('location')).trim() || null,
        username: String(data.get('username')),
        visibility: 'private',
      })
      setProfile(updated)
      if (session.member) session.setMember({ ...session.member, avatarUrl: updated.avatarUrl, displayName: updated.displayName, username: updated.username })
      setFormRevision((revision) => revision + 1)
      setDirty(false)
      setProfileSaved(true)
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The profile could not be saved.')
    }
  }

  async function signOut() {
    setAccountError(null)
    try {
      await logoutMember()
      session.clearMember()
      router.push('/sign-in')
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'Sign out could not finish.')
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setAccountError(null)
    try {
      await changeMemberPassword({ currentPassword: String(data.get('currentPassword')), newPassword: String(data.get('newPassword')) })
      setAccountAction(null)
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The password could not be changed.')
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAccountError(null)
    try {
      await deleteMemberAccount(String(new FormData(event.currentTarget).get('password')))
      session.clearMember()
      router.push('/')
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The account could not be deleted.')
    }
  }

  async function exportAccount() {
    setAccountError(null)
    try {
      await downloadMemberExport()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The export could not be prepared.')
    }
  }

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-settings-screen ref={rootRef}>
        <div className={dirty || accountError ? 'pb-24' : undefined}>
        <div className="px-1 sm:px-3 lg:px-4">
        <header className="border-b border-[var(--fs-line)] pb-10 sm:pb-12">
          <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] font-normal tracking-[-0.03em] text-[var(--fs-ink)]">Make yourself at home.</h1>
          <p className="mt-5 max-w-[64ch] text-base leading-7 text-[var(--fs-secondary)]">What stays private, how titles play, and what this device remembers — decided here, in plain terms.</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
            <SettingsRail
              activeHref={activeSection}
              avatarSrc={session.member ? memberAvatarSrc(session.member.avatarUrl, session.member.id) : undefined}
              avatarTreatment={session.member?.avatarStyle ?? profile.avatarStyle}
              className="min-w-0 max-w-full overflow-hidden [&_nav]:w-full [&_nav]:max-w-full [&_nav]:overflow-x-auto [&_ul]:flex [&_ul]:w-max [&_ul]:gap-2 [&_a]:whitespace-nowrap lg:[&_nav]:overflow-visible lg:[&_ul]:block lg:[&_ul]:w-auto lg:[&_ul]:space-y-1"
              username={`@${profile.username}`}
              items={SETTINGS_ITEMS}
              memberName={profile.displayName ?? profile.username}
            />
            <aside className="hidden rounded-[16px] border border-[var(--fs-line)] bg-[var(--fs-field)] p-5 lg:block">
              <h2 className="text-sm font-bold text-[var(--fs-ink)]">Need a hand?</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">Find help with playback, your account, and your personal library.</p>
              <Link className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[var(--fs-accent)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/help">Open help center <ExternalLink aria-hidden="true" className="size-4" /></Link>
            </aside>
          </div>

          <div className="space-y-12">
            <SettingsSection
              action={(
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Button form="profile-settings-form" type="submit" variant="accent"><Save aria-hidden="true" /> Save changes</Button>
                  <p aria-live="polite" className="text-xs text-lime">{profileSaved ? 'Profile saved.' : ''}</p>
                </div>
              )}
              description="Your identity across your private profile, reviews, and lists."
              className="scroll-mt-8"
              id="account"
              title="Account"
            >
              <form className="grid gap-5 py-5 sm:grid-cols-2" id="profile-settings-form" key={formRevision} onChange={markDirty} onSubmit={saveProfile}>
                <div className="sm:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-copy" id="settings-avatar-label">Avatar portrait</span>
                  <div className="mt-3 flex flex-wrap items-center gap-5">
                    <Avatar imageAlt={`${profile.displayName ?? profile.username} portrait preview`} name={profile.displayName ?? profile.username} size="lg" src={memberAvatarSrc(avatarUrl, session.member?.id ?? profile.username)} treatment={profile.avatarStyle} />
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => { setAvatarUrl(dicebearAvatarUrl(randomAvatarSeed())); markDirty() }} type="button" variant="secondary">
                        <RefreshCw aria-hidden="true" /> Randomize
                      </Button>
                      {avatarUrl ? (
                        <Button onClick={() => { setAvatarUrl(null); markDirty() }} type="button" variant="ghost">Use generated tile</Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">Portraits come from generated Notionists artwork. Randomize until one feels like you, then save.</p>
                </div>
                <div>
                  <Label htmlFor="settings-name">Display name</Label>
                  <Input className="mt-2 w-full" defaultValue={profile.displayName ?? ''} id="settings-name" maxLength={80} name="displayName" />
                </div>
                <div>
                  <Label htmlFor="settings-username">Username</Label>
                  <Input autoCapitalize="none" className="mt-2 w-full" defaultValue={profile.username} id="settings-username" maxLength={30} minLength={3} name="username" pattern="[a-z0-9_]{3,30}" required />
                  {profile.nextUsernameChangeAt ? <p className="mt-2 text-xs text-muted">Next username change: {new Date(profile.nextUsernameChangeAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p> : null}
                </div>
                <div><Label htmlFor="settings-location">Location</Label><Input className="mt-2 w-full" defaultValue={profile.location ?? ''} id="settings-location" maxLength={100} name="location" /></div>
                <p className="text-xs text-muted">Your profile and collections are private.</p>
                <div className="sm:col-span-2"><Label htmlFor="settings-bio">Bio</Label><textarea className="mt-2 min-h-28 w-full rounded-control border border-control-outline bg-field px-4 py-3 text-sm text-ink outline-none focus:border-orange focus:ring-2 focus:ring-orange" defaultValue={profile.bio ?? ''} id="settings-bio" maxLength={500} name="bio" /></div>
                <div className="sm:col-span-2">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input className="mt-2 w-full" defaultValue={session.member?.email ?? ''} id="settings-email" readOnly type="email" />
                </div>
              </form>
              <PreferenceRow
                control={(
                  <Button
                    onClick={signOut}
                    variant="secondary"
                  >
                    <LogOut aria-hidden="true" /> Sign out
                  </Button>
                )}
                description="End the current server session on this browser."
                label="Session"
              />
            </SettingsSection>

            <SettingsSection className="scroll-mt-8" description="Set the atmosphere across Consumit and arrange your personal museum." id="appearance" title="Appearance">
              <AppearanceControls />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Profiles, watch history, diary, reviews, and lists belong to their member."
              id="privacy"
              title="Privacy"
            >
              <SettingsFact lead="Private by default.">There is no visibility switch because nothing is shared, and visitors are always rejected from member data.</SettingsFact>
              <SettingsFact lead="Nothing is social yet.">Follows, activity sharing, and direct messaging are not implemented, so no activity ever leaves your account.</SettingsFact>
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Resolution, audio, and subtitles are chosen per title inside the player and remembered on this device."
              id="playback"
              title="Streaming & playback"
            >
              <SettingsFact lead="Automatic source recovery.">If a source fails, Consumit switches to the next working source without losing your position. Pick a different server anytime from the player&apos;s Server menu.</SettingsFact>
              <SettingsFact lead="Quality and tracks stay with the player.">Open Quality, Audio, or Subtitles in the player toolbar; your last choice becomes the starting point for the next title.</SettingsFact>
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Keep dialogue readable without making subtitles feel detached from the film."
              id="language"
              title="Language & subtitles"
            >
              <PreferenceRow
                className="flex-col items-stretch gap-5 lg:flex-row lg:items-start [&>div:last-child]:w-full [&>div:last-child]:min-w-0 lg:[&>div:last-child]:max-w-md"
                control={<SubtitleLanguagePicker />}
                description="Applies on this device to every movie, series, and anime. The first language also drives automatic track selection."
                label="Preferred subtitle languages"
              />
              <SettingsFact lead="Everything else is per title.">Audio and subtitle tracks, timing, and text appearance are chosen in the player&apos;s Audio and Subtitles menus.</SettingsFact>
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Only useful changes—never private chat or attention traps."
              id="notifications"
              title="Notifications"
            >
              <SettingsFact lead="Nothing is announced yet.">Release tracking is not implemented, so no alerts are sent. Saved series keep their existing library behavior.</SettingsFact>
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Download your contribution or close the account with clear consequences."
              id="data"
              title="Data & security"
            >
              <PreferenceRow control={<Button onClick={exportAccount} variant="secondary"><Download aria-hidden="true" /> Request export</Button>} description="Download the member and profile data currently held for your account." label="Export your data" />
              <PreferenceRow control={<Button onClick={() => setAccountAction(accountAction === 'password' ? null : 'password')} variant="secondary">Change password</Button>} description="You will be asked to confirm your current password first." label="Password" />
              {accountAction === 'password' ? (
                <form className="grid gap-4 border-t border-border py-5 sm:grid-cols-2" onSubmit={changePassword}>
                  <div><Label htmlFor="current-password">Current password</Label><Input autoComplete="current-password" className="mt-2 w-full" id="current-password" name="currentPassword" required type="password" /></div>
                  <div><Label htmlFor="new-password">New password</Label><Input autoComplete="new-password" className="mt-2 w-full" id="new-password" minLength={12} name="newPassword" required type="password" /></div>
                  <Button className="sm:col-span-2 sm:justify-self-start" type="submit">Update password</Button>
                </form>
              ) : null}
              <PreferenceRow control={<Button onClick={() => setAccountAction(accountAction === 'delete' ? null : 'delete')} variant="danger"><Trash2 aria-hidden="true" /> Delete account</Button>} description="Tombstone and anonymize the account after password confirmation." label="Delete account" />
              {accountAction === 'delete' ? (
                <form className="border-t border-border py-5" onSubmit={deleteAccount}>
                  <Label htmlFor="delete-password">Confirm your password</Label>
                  <Input autoComplete="current-password" className="mt-2 w-full max-w-md" id="delete-password" name="password" required type="password" />
                  <Button className="mt-4" type="submit" variant="danger"><Trash2 aria-hidden="true" /> Permanently delete account</Button>
                </form>
              ) : null}
            </SettingsSection>

            <section className="rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-5 sm:p-6" id="support">
              <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]">Something not behaving?</h2>
              <p className="mt-3 max-w-[62ch] text-sm leading-6 text-[var(--fs-muted)]">Report playback or account trouble without exposing passwords, payment details, or private browsing data.</p>
              <Link className="mt-6 inline-flex min-h-11 items-center rounded-control border border-control-outline px-4 text-sm font-bold text-ink outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-orange" href="/report-issue">Report an issue</Link>
            </section>
          </div>
        </div>
        </div>

        {dirty || accountError ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--fs-line)] bg-[var(--fs-page)]" role={accountError ? 'alert' : 'region'} aria-label={accountError ? 'Settings error' : 'Unsaved profile changes'}>
            <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1 py-3 sm:px-3 lg:px-4">
              <p className={`text-sm font-bold ${accountError ? 'text-danger' : 'text-ink'}`}>
                {accountError ?? 'You have unsaved changes to your profile.'}
              </p>
              <div className="flex items-center gap-2">
                {dirty ? <Button onClick={discardProfile} variant="ghost">Discard</Button> : null}
                {dirty ? <Button onClick={saveProfileFromBar} variant="accent"><Save aria-hidden="true" /> Save</Button> : null}
                {!dirty && accountError ? <Button onClick={() => setAccountError(null)} variant="ghost">Dismiss</Button> : null}
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </main>
    </FilScreenShell>
  )
}
