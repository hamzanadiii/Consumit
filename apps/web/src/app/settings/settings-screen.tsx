'use client'

import type { MemberProfile } from '@consumit/contracts'
import { Download, ExternalLink, LogOut, RefreshCw, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useRef, useState } from 'react'

import {
  Avatar,
  Button,
  Input,
  Label,

  PreferenceRow,




  SettingsFact,
  SettingsRail,
  SettingsSection,
} from '@consumit/ui'

import { FilScreenShell } from '../shared'
import { useSession } from '../session/session'
import { changeMemberPassword, deleteMemberAccount, downloadMemberExport, IdentityApiError, logoutMember, updateMemberProfile } from '@/lib/identity-browser'
import { dicebearAvatarUrl, memberAvatarSrc, randomAvatarSeed } from '@/lib/avatar'
import { NotificationPreference } from './notification-preference'
import { PreferenceEditor } from '../experience/preference-fields'
import { AdStatus } from '../shared/ad-status'

const SETTINGS_ITEMS = [
  { href: '#account', label: 'Account', index: '01' },
  { href: '#privacy', label: 'Privacy & social', index: '02' },
  { href: '#playback', label: 'Streaming & playback', index: '03' },
  { href: '#language', label: 'Language & subtitles', index: '04' },
  { href: '#advertising', label: 'Browsing & advertising', index: '05' },
  { href: '#notifications', label: 'Notifications', index: '06' },
  { href: '#data', label: 'Data & security', index: '07' },
] as const

export function SettingsScreen({ initialProfile }: { initialProfile: MemberProfile }) {
  const router = useRouter()
  const session = useSession()
  const [profile, setProfile] = useState(initialProfile)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatarUrl)
  const profileSaveLock = useRef(false)
  const [profileSaving, setProfileSaving] = useState(false)
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
    if (profileSaveLock.current) return
    profileSaveLock.current = true
    setProfileSaving(true)
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
        visibility: data.get('visibility') === 'public' ? 'public' : 'private',
      })
      setProfile(updated)
      if (session.member) session.setMember({ ...session.member, avatarUrl: updated.avatarUrl, displayName: updated.displayName, username: updated.username })
      setFormRevision((revision) => revision + 1)
      setDirty(false)
      setProfileSaved(true)
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The profile could not be saved.')
    } finally { profileSaveLock.current = false; setProfileSaving(false) }
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
          <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] font-normal tracking-[-0.03em] text-[var(--fs-ink)]">Settings.</h1>
          <p className="mt-5 max-w-[64ch] text-base leading-7 text-[var(--fs-secondary)]">What stays private, how titles play, and what this device remembers — decided here, in plain terms.</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
            <SettingsRail
              activeHref={activeSection}
              avatarSrc={session.member ? memberAvatarSrc(session.member) : undefined}
              avatarTreatment={session.member?.avatarStyle ?? profile.avatarStyle}
              className="min-w-0 max-w-full overflow-hidden [&_nav]:w-full [&_nav]:max-w-full [&_nav]:overflow-x-auto [&_ul]:flex [&_ul]:w-max [&_ul]:gap-2 [&_a]:whitespace-nowrap lg:[&_nav]:overflow-visible lg:[&_ul]:block lg:[&_ul]:w-auto lg:[&_ul]:space-y-1"
              username={`@${profile.username}`}
              items={SETTINGS_ITEMS}
              memberName={profile.displayName ?? profile.username}
            />
            <aside className="hidden rounded-[16px] border border-[var(--fs-line)] bg-[var(--fs-field)] p-5 lg:block">
              <h2 className="text-sm font-bold text-[var(--fs-ink)]">Need a hand?</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">Playback and account support are kept separate from your social activity.</p>
              <Link className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[var(--fs-accent)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/help">Open help center <ExternalLink aria-hidden="true" className="size-4" /></Link>
            </aside>
          </div>

          <div className="space-y-12">
            <SettingsSection
              action={(
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Button disabled={profileSaving} form="profile-settings-form" type="submit" variant="accent"><Save aria-hidden="true" /> {profileSaving ? 'Saving…' : 'Save changes'}</Button>
                  <p aria-live="polite" className="text-xs text-lime">{profileSaved ? 'Profile saved.' : ''}</p>
                </div>
              )}
              description="The identity people see across your profile, reviews, and lists."
              className="scroll-mt-8"
              id="account"
              index="01"
              title="Account"
            >
              <form className="grid gap-5 py-5 sm:grid-cols-2" id="profile-settings-form" key={formRevision} onChange={markDirty} onSubmit={saveProfile}>
                <div className="sm:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-copy" id="settings-avatar-label">Avatar portrait</span>
                  <div className="mt-3 flex flex-wrap items-center gap-5">
                    <Avatar imageAlt={`${profile.displayName ?? profile.username} portrait preview`} name={profile.displayName ?? profile.username} size="lg" src={memberAvatarSrc({ ...profile, avatarUrl })} treatment={profile.avatarStyle} />
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
                <p className="text-xs text-muted">Your location stays private.</p>
                <div className="sm:col-span-2"><Label htmlFor="settings-bio">Bio</Label><textarea className="mt-2 min-h-28 w-full rounded-control border border-control-outline bg-field px-4 py-3 text-sm text-ink outline-none focus:border-orange focus:ring-2 focus:ring-orange" defaultValue={profile.bio ?? ''} id="settings-bio" maxLength={500} name="bio" /></div>
                <fieldset className="sm:col-span-2 border-t border-[var(--fs-line)] pt-5">
                  <legend className="text-sm font-bold text-[var(--fs-ink)]">Profile visibility</legend>
                  <div className="mt-3 flex flex-wrap gap-5">{(['private', 'public'] as const).map((value) => <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--fs-ink)]" key={value}><input className="size-4 accent-[var(--fs-accent)]" defaultChecked={profile.visibility === value} name="visibility" type="radio" value={value} />{value === 'private' ? 'Private' : 'Public'}</label>)}</div>
                  <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--fs-secondary)]">Publishing shares your display name, username, avatar, banner, bio, favorites, all ratings, and all reviews. Public lists become accessible while your profile is public.</p>
                  <p className="mt-2 max-w-[70ch] text-xs leading-5 text-[var(--fs-muted)]">Location, diary, watched titles, watchlist, likes, tags, history, progress, account details, and import metadata stay private. Making your profile private hides it from visitors and search and keeps your follows.</p>
                </fieldset>
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

            <SettingsSection
              className="scroll-mt-8"
              description="Profiles, watch history, diary, reviews, and lists belong to their member."
              id="privacy"
              index="02"
              title="Privacy & social"
            >
              <SettingsFact lead="Private until you publish.">Choose Public in the profile editor above, then save changes. Each list has its own visibility control.</SettingsFact>
              <SettingsFact lead="Follow public profiles.">People can discover your published taste and follow you. Your personal watch history stays private.</SettingsFact>
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Choose how titles start in Watch. Member preferences sync across devices; available tracks vary by title and source."
              id="playback"
              index="03"
              title="Streaming & playback"
            >
              <SettingsFact lead="Automatic source recovery.">If a source fails, Consumit switches to the next working source without losing your position. Pick a different server anytime from the player&apos;s Server menu.</SettingsFact>
              <div className="py-6"><PreferenceEditor /></div>
              <Link className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4" href="/onboarding?next=%2Fsettings">Reopen the welcome guide</Link>
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Keep dialogue readable without making subtitles feel detached from the film."
              id="language"
              index="04"
              title="Language & subtitles"
            >
              <PreferenceRow
                className="flex-col items-stretch gap-5 lg:flex-row lg:items-start [&>div:last-child]:w-full [&>div:last-child]:min-w-0 lg:[&>div:last-child]:max-w-md"
                control={<a className="inline-flex min-h-11 items-center font-bold underline underline-offset-4" href="#playback">Edit viewing preferences</a>}
                description="Set your language order and subtitle default in Streaming & playback above."
                label="Preferred subtitle languages"
              />
              <SettingsFact lead="Adjust a title in Watch.">Track selection, subtitle timing, and text appearance stay available in the player&apos;s Audio and Subtitles menus.</SettingsFact>
            </SettingsSection>

            <SettingsSection className="scroll-mt-8" description="Choose whether Consumit can show sandboxed banner ads while you browse." id="advertising" index="05" title="Browsing & advertising">
              <AdStatus />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Only useful changes—never private chat or attention traps."
              id="notifications"
              index="06"
              title="Notifications"
            >
              <NotificationPreference />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Download your contribution or close the account with clear consequences."
              id="data"
              index="07"
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
          <div className="consumit-settings-savebar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--fs-line)] bg-[var(--fs-page)]" role={accountError ? 'alert' : 'region'} aria-label={accountError ? 'Settings error' : 'Unsaved profile changes'}>
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
