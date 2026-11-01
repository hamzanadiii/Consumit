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
  Toggle,
} from '@consumit/ui'

import { FilScreenShell } from '../shared'
import { useSession } from '../session/session'
import { changeMemberPassword, deleteMemberAccount, downloadMemberExport, IdentityApiError, logoutMember, updateMemberProfile } from '@/lib/identity-browser'
import { dicebearAvatarUrl, memberAvatarSrc, randomAvatarSeed } from '@/lib/avatar'
import { NotificationPreference } from './notification-preference'
import { PreferenceEditor } from '../experience/preference-fields'
import { AdStatus } from '../shared/ad-status'
import { useExperience } from '../experience/experience-provider'

const SETTINGS_ITEMS = [
  { href: '#account', label: 'Account' },
  { href: '#privacy', label: 'Privacy & social' },
  { href: '#playback', label: 'Streaming & playback' },
  { href: '#language', label: 'Language & subtitles' },
  { href: '#advertising', label: 'Browsing & advertising' },
  { href: '#notifications', label: 'Notifications' },
  { href: '#data', label: 'Data & security' },
] as const

export function SettingsScreen({ initialProfile }: { initialProfile: MemberProfile }) {
  const router = useRouter()
  const session = useSession()
  const experience = useExperience()
  const [profile, setProfile] = useState(initialProfile)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatarUrl)
  const profileSaveLock = useRef(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileSaveFailed, setProfileSaveFailed] = useState(false)
  const retryProfileSaveRef = useRef<HTMLButtonElement>(null)
  const [accountAction, setAccountAction] = useState<'delete' | 'password' | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const exportLock = useRef(false)
  const [exporting, setExporting] = useState(false)
  const [exportReady, setExportReady] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportErrorRef = useRef<HTMLParagraphElement>(null)
  const passwordChangeLock = useRef(false)
  const [passwordChanging, setPasswordChanging] = useState(false)
  const [passwordUpdated, setPasswordUpdated] = useState(false)
  const passwordErrorRef = useRef<HTMLParagraphElement>(null)
  const [accountDeleting, setAccountDeleting] = useState(false)
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const deleteAccountLock = useRef(false)
  const deleteAccountErrorRef = useRef<HTMLParagraphElement>(null)
  const [dirty, setDirty] = useState(false)
  const [formRevision, setFormRevision] = useState(0)
  const rootRef = useRef<HTMLElement>(null)
  const [activeSection, setActiveSection] = useState<string>('#account')
  const globalAccountError = accountAction === 'delete' || accountAction === 'password' ? null : accountError

  useEffect(() => {
    if (accountAction === 'delete' && accountError && !accountDeleting) deleteAccountErrorRef.current?.focus()
  }, [accountAction, accountDeleting, accountError])

  useEffect(() => {
    if (accountAction === 'password' && accountError && !passwordChanging) passwordErrorRef.current?.focus()
  }, [accountAction, accountError, passwordChanging])

  useEffect(() => {
    if (exportError && !exporting) exportErrorRef.current?.focus()
  }, [exportError, exporting])

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

  useEffect(() => {
    if (profileSaveFailed && dirty && !profileSaving) retryProfileSaveRef.current?.focus()
  }, [dirty, profileSaveFailed, profileSaving])

  function markDirty() {
    setDirty(true)
    setProfileSaved(false)
  }

  function discardProfile() {
    if (profileSaving) return
    setFormRevision((revision) => revision + 1)
    setAvatarUrl(profile.avatarUrl)
    setDirty(false)
    setProfileSaved(false)
    setProfileSaveFailed(false)
    setAccountError(null)
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
    setProfileSaveFailed(false)
    const data = new FormData(event.currentTarget)
    setAccountError(null)
    setProfileSaved(false)
    try {
      const updated = await updateMemberProfile({
        avatarUrl,
        bio: String(data.get('bio')).trim() || null,
        displayName: String(data.get('displayName')).trim() || null,
        sectionVisibility: {
          favorites: data.get('sectionVisibility-favorites') === 'on',
          ratings: data.get('sectionVisibility-ratings') === 'on',
          reviews: data.get('sectionVisibility-reviews') === 'on',
          lists: data.get('sectionVisibility-lists') === 'on',
          network: data.get('sectionVisibility-network') === 'on',
          likes: data.get('sectionVisibility-likes') === 'on',
          tags: data.get('sectionVisibility-tags') === 'on',
          watchlist: data.get('sectionVisibility-watchlist') === 'on',
          watched: data.get('sectionVisibility-watched') === 'on',
          diary: data.get('sectionVisibility-diary') === 'on',
          history: data.get('sectionVisibility-history') === 'on',
          activity: data.get('sectionVisibility-activity') === 'on',
        },
        username: String(data.get('username')),
      })
      setProfile(updated)
      if (session.member) session.setMember({ ...session.member, avatarUrl: updated.avatarUrl, displayName: updated.displayName, username: updated.username })
      setFormRevision((revision) => revision + 1)
      setDirty(false)
      setProfileSaved(true)
      setProfileSaveFailed(false)
      router.refresh()
    } catch (error) {
      setProfileSaveFailed(true)
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
    if (passwordChangeLock.current) return
    passwordChangeLock.current = true
    setPasswordChanging(true)
    const data = new FormData(event.currentTarget)
    setAccountError(null)
    setPasswordUpdated(false)
    try {
      await changeMemberPassword({ currentPassword: String(data.get('currentPassword')), newPassword: String(data.get('newPassword')) })
      setAccountAction(null)
      setPasswordUpdated(true)
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The password could not be changed.')
    } finally { passwordChangeLock.current = false; setPasswordChanging(false) }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (deleteAccountLock.current || !deleteAcknowledged) return
    deleteAccountLock.current = true
    setAccountDeleting(true)
    setAccountError(null)
    try {
      await deleteMemberAccount(String(new FormData(event.currentTarget).get('password')))
      session.clearMember()
      router.push('/')
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The account could not be deleted.')
    } finally {
      deleteAccountLock.current = false
      setAccountDeleting(false)
    }
  }

  async function exportAccount() {
    if (exportLock.current) return
    exportLock.current = true
    setExporting(true)
    setExportReady(false)
    setExportError(null)
    setAccountError(null)
    try {
      await downloadMemberExport()
      setExportReady(true)
    } catch (error) {
      setExportError(error instanceof IdentityApiError ? error.message : 'Your export could not be prepared. Try again.')
    } finally {
      exportLock.current = false
      setExporting(false)
    }
  }

  return (
    <FilScreenShell pageHeading={undefined}>
      <main id="consumit-main-content" tabIndex={-1} className="mx-auto w-full max-w-[90rem]" data-consumit-settings-screen ref={rootRef}>
        <div className={dirty || globalAccountError ? 'pb-24' : undefined}>
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
                  <p aria-live="polite" className="text-xs text-[var(--fs-ink)]">{profileSaved ? 'Profile saved.' : ''}</p>
                </div>
              )}
              description="The identity people see across your profile, reviews, and lists."
              className="scroll-mt-8"
              id="account"
              title="Account"
            >
              <form aria-busy={profileSaving} className="py-5" id="profile-settings-form" key={formRevision} onChange={markDirty} onSubmit={saveProfile}>
                <fieldset className="grid gap-5 sm:grid-cols-2" disabled={profileSaving}>
                  <legend className="sr-only">Profile details</legend>
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
                  <Input aria-describedby={profile.nextUsernameChangeAt ? 'settings-username-help settings-username-change' : 'settings-username-help'} autoCapitalize="none" autoCorrect="off" className="mt-2 w-full" defaultValue={profile.username} id="settings-username" maxLength={30} minLength={3} name="username" pattern="[a-z0-9_]{3,30}" required spellCheck={false} title="Use 3–30 lowercase letters, numbers, and underscores." />
                  <p className="mt-2 text-xs leading-5 text-muted" id="settings-username-help">3–30 characters: lowercase letters, numbers, and underscores.</p>
                  {profile.nextUsernameChangeAt ? <p className="mt-2 text-xs text-muted" id="settings-username-change">Next username change: <time dateTime={profile.nextUsernameChangeAt}>{new Date(profile.nextUsernameChangeAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} UTC</time></p> : null}
                </div>
                <div className="sm:col-span-2"><Label htmlFor="settings-bio">Bio</Label><textarea className="mt-2 min-h-28 w-full rounded-control border border-control-outline bg-field px-4 py-3 text-sm text-ink outline-none focus:border-orange focus:ring-2 focus:ring-orange" defaultValue={profile.bio ?? ''} id="settings-bio" maxLength={500} name="bio" /></div>
                <fieldset className="sm:col-span-2 border-t border-[var(--fs-line)] pt-5">
                  <legend className="text-sm font-bold text-[var(--fs-ink)]">Public profile sections</legend>
                  <p className="mt-2 max-w-[70ch] text-xs leading-5 text-[var(--fs-muted)]">Your profile identity is public. Choose which sections visitors can see. Watched, Diary, completed History, and Activity are visible by default and can each be hidden. Turning Reviews off also hides your reviews from public title review feeds.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">{([
                    ['favorites', 'Favorites'], ['ratings', 'Ratings'], ['reviews', 'Reviews'], ['lists', 'Lists'],
                    ['network', 'Network'], ['likes', 'Likes'], ['tags', 'Tags'], ['watchlist', 'Watchlist'],
                    ['watched', 'Watched'], ['diary', 'Diary'], ['history', 'History'], ['activity', 'Activity'],
                  ] as const).map(([key, label]) => <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-control border border-[var(--fs-field-border)] px-3 text-sm text-[var(--fs-ink)]" key={key}><input className="size-4 accent-[var(--fs-accent)]" defaultChecked={profile.sectionVisibility[key]} name={`sectionVisibility-${key}`} type="checkbox" />{label}</label>)}</div>
                </fieldset>
                <div className="sm:col-span-2">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input className="mt-2 w-full" defaultValue={session.member?.email ?? ''} id="settings-email" readOnly type="email" />
                </div>
                </fieldset>
              </form>
              <PreferenceRow
                control={(
                  <Button
                    className="min-h-[44px]"
                    disabled={accountDeleting || passwordChanging || exporting}
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
              title="Privacy & social"
            >
              <SettingsFact lead="Your profile sections follow your choices.">Watched titles, Diary, completed History, and Activity are visible by default. Hide any of them independently in Account settings.</SettingsFact>
              <SettingsFact lead="Playback and account data stay private.">Active playback, resume progress, saved provider sources, and account details never appear on your profile. Unlisted lists open by link and stay out of profiles and discovery.</SettingsFact>
              <PreferenceRow
                className="mt-4"
                control={<Toggle checked={experience.preferences.shareViewingTrends} disabled={!experience.ready || !experience.owner} label="Share anonymous viewing trends" onCheckedChange={value => { void experience.patch({ shareViewingTrends: value }).catch(() => {}) }} />}
                description={experience.error ?? 'Allow recent playback progress to help rank an anonymous title row for the community. This never shows your name or activity and is separate from profile visibility.'}
                label="Anonymous viewing trends"
              />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Choose how titles start in Watch. Member preferences sync across devices; available tracks vary by title and source."
              id="playback"
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

            <SettingsSection className="scroll-mt-8" description="Choose whether our advertising partner can open pop-under ads while you browse." id="advertising" title="Browsing & advertising">
              <AdStatus />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Only useful changes—never private chat or attention traps."
              id="notifications"
              title="Notifications"
            >
              <NotificationPreference />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Download your contribution or close the account with clear consequences."
              id="data"
              title="Data & security"
            >
              <PreferenceRow control={<Button aria-busy={exporting} className="min-h-[44px]" disabled={accountDeleting || passwordChanging || exporting} onClick={exportAccount} variant="secondary">{exporting ? <RefreshCw aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Download aria-hidden="true" />}{exporting ? 'Preparing export…' : exportError ? 'Try export again' : 'Request export'}</Button>} description="Download the member and profile data currently held for your account." label="Export your data" />
              {exporting ? <p className="border-b border-border py-3 text-sm text-[var(--fs-secondary)]" role="status">Preparing your export…</p> : null}
              {exportError ? <p className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-[var(--fs-danger)] outline-none focus:ring-2 focus:ring-[var(--fs-focus)]" ref={exportErrorRef} role="alert" tabIndex={-1}>{exportError}</p> : null}
              {exportReady ? <p className="border-b border-border py-3 text-sm font-bold text-[var(--fs-ink)]" role="status">Your export file is ready.</p> : null}
              <PreferenceRow control={<Button className="min-h-[44px]" disabled={accountDeleting || passwordChanging || exporting} onClick={() => { setAccountError(null); setPasswordUpdated(false); setDeleteAcknowledged(false); setAccountAction(accountAction === 'password' ? null : 'password') }} variant="secondary">Change password</Button>} description="You will be asked to confirm your current password first." label="Password" />
              {passwordUpdated ? <p aria-live="polite" className="border-b border-border py-3 text-sm font-bold text-[var(--fs-ink)]" role="status">Password updated.</p> : null}
              {accountAction === 'password' ? (
                <form aria-busy={passwordChanging} aria-label="Change password" className="border-t border-border py-5" onSubmit={changePassword}>
                  <fieldset className="grid gap-4 sm:grid-cols-2" disabled={passwordChanging}>
                    <legend className="sr-only">Change password</legend>
                    <div><Label htmlFor="current-password">Current password</Label><Input autoComplete="current-password" className="mt-2 w-full" id="current-password" maxLength={128} minLength={12} name="currentPassword" required type="password" /></div>
                    <div><Label htmlFor="new-password">New password</Label><Input autoComplete="new-password" className="mt-2 w-full" id="new-password" maxLength={128} minLength={12} name="newPassword" required type="password" /></div>
                    {accountError ? <p className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-[var(--fs-danger)] sm:col-span-2" ref={passwordErrorRef} role="alert" tabIndex={-1}>{accountError}</p> : null}
                    <Button className="min-h-11 sm:col-span-2 sm:justify-self-start" disabled={passwordChanging} type="submit">{passwordChanging ? 'Updating password…' : 'Update password'}</Button>
                  </fieldset>
                </form>
              ) : null}
              <PreferenceRow control={<Button aria-controls="delete-account-form" aria-expanded={accountAction === 'delete'} className="min-h-[44px]" disabled={accountDeleting || passwordChanging || exporting} onClick={() => { setAccountError(null); setDeleteAcknowledged(false); setAccountAction(accountAction === 'delete' ? null : 'delete') }} variant="danger"><Trash2 aria-hidden="true" /> Delete account</Button>} description="Review what will be removed, then confirm with your password." label="Delete account" />
              {accountAction === 'delete' ? (
                <form aria-busy={accountDeleting} aria-label="Delete account confirmation" className="border-t border-border py-5" id="delete-account-form" onSubmit={deleteAccount}>
                  <div className="rounded-control border border-danger/40 bg-danger/10 p-4 sm:p-5">
                    <h3 className="text-base font-bold text-ink">Before you delete</h3>
                    <p className="mt-2 text-sm leading-6 text-secondary">This permanently closes your account and deletes your profile, reviews, ratings, saved titles, lists, Watch History, and playback progress. Your username stays reserved, and you’ll be signed out. This can’t be undone.</p>
                    <p className="mt-2 text-sm leading-6 text-secondary">Want a copy first? Use Request export above before continuing.</p>
                  </div>
                  {accountError ? <p className="mt-4 rounded-control border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-[var(--fs-danger)]" ref={deleteAccountErrorRef} role="alert" tabIndex={-1}>{accountError}</p> : null}
                  <fieldset className="mt-5 grid min-w-0 gap-4" disabled={accountDeleting}>
                    <legend className="sr-only">Confirm account deletion</legend>
                    <div>
                      <Label htmlFor="delete-password">Confirm your password</Label>
                      <Input autoComplete="current-password" className="mt-2 w-full max-w-md" id="delete-password" name="password" required type="password" />
                    </div>
                    <label className="flex min-h-11 max-w-2xl cursor-pointer items-start gap-3 text-sm leading-6 text-secondary">
                      <input checked={deleteAcknowledged} className="mt-1 size-5 shrink-0 accent-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas" name="acknowledge" onChange={event => setDeleteAcknowledged(event.currentTarget.checked)} required type="checkbox" />
                      <span>I understand this permanently deletes my account data and can’t be undone.</span>
                    </label>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                      <Button className="min-h-11" disabled={accountDeleting} onClick={() => { setAccountError(null); setDeleteAcknowledged(false); setAccountAction(null) }} type="button" variant="ghost">Cancel</Button>
                      <Button className="min-h-11" disabled={accountDeleting || !deleteAcknowledged} type="submit" variant="danger">
                        {accountDeleting ? <RefreshCw aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Trash2 aria-hidden="true" />}
                        Delete my account permanently
                      </Button>
                    </div>
                  </fieldset>
                  {accountDeleting ? <p className="sr-only" role="status">Deleting your account…</p> : null}
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

        {dirty || globalAccountError ? (
          <div className="consumit-settings-savebar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--fs-line)] bg-[var(--fs-page)]" role={globalAccountError ? 'alert' : 'region'} aria-label={globalAccountError ? 'Settings error' : 'Unsaved profile changes'}>
            <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1 py-3 sm:px-3 lg:px-4">
              <p className={`text-sm font-bold ${globalAccountError ? 'text-danger' : 'text-ink'}`}>
                {globalAccountError ?? (profileSaving ? 'Saving profile changes…' : 'You have unsaved changes to your profile.')}
              </p>
              <div className="flex items-center gap-2">
                {dirty ? <Button disabled={profileSaving} onClick={discardProfile} variant="ghost">Discard</Button> : null}
                {dirty ? <Button disabled={profileSaving} onClick={saveProfileFromBar} ref={retryProfileSaveRef} variant="accent"><Save aria-hidden="true" /> {profileSaving ? 'Saving…' : profileSaveFailed ? 'Retry save' : 'Save'}</Button> : null}
                {!dirty && globalAccountError ? <Button onClick={() => setAccountError(null)} variant="ghost">Dismiss</Button> : null}
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </main>
    </FilScreenShell>
  )
}
